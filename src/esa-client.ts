import { requestUrl, RequestUrlParam } from 'obsidian';

export interface RateLimitInfo {
	remaining: number;
	reset: number; // Unix timestamp (seconds)
	limit: number;
}

export function formatResetTime(unixSeconds: number): string {
	const diffMs = (unixSeconds * 1000) - Date.now();
	if (diffMs <= 0) return 'any moment now';
	const mins = Math.ceil(diffMs / 60_000);
	if (mins < 60) return `${mins} min`;
	const hours = Math.floor(mins / 60);
	const remMins = mins % 60;
	return remMins > 0 ? `${hours}h ${remMins}min` : `${hours}h`;
}

interface EsaPostPayload {
	name: string;
	body_md: string;
	tags?: string[];
	category?: string;
	wip?: boolean;
}

interface EsaApiResponse {
	number: number;
	name: string;
	url: string;
}

interface EsaPostSearchItem {
	number: number;
	name: string;
	category?: string;
}

interface EsaPostSearchResult {
	posts: EsaPostSearchItem[];
	total_count: number;
}

export interface EsaAttachmentPolicy {
	attachment: {
		url: string;
		original_name: string;
		size: number;
		content_type: string;
		endpoint: string;
	};
	form: {
		AWSAccessKeyId: string;
		signature: string;
		policy: string;
		key: string;
		'Content-Type': string;
		'Cache-Control': string;
		'Content-Disposition': string;
		acl: string;
	};
}

export class EsaClient {
	private baseUrl: string;
	private _lastRateLimit: RateLimitInfo | null = null;

	constructor(
		private team: string,
		private token: string,
	) {
		this.baseUrl = `https://api.esa.io/v1/teams/${encodeURIComponent(team)}`;
	}

	get lastRateLimit(): RateLimitInfo | null {
		return this._lastRateLimit;
	}

	private async request<T>(params: RequestUrlParam): Promise<{ data: T; headers: Record<string, string> }> {
		const res = await requestUrl({
			...params,
			headers: {
				Authorization: `Bearer ${this.token}`,
				...params.headers,
			},
		});

		// Parse rate limit headers
		const headers = res.headers ?? {};
		this._lastRateLimit = {
			remaining: parseInt(headers['x-ratelimit-remaining'] ?? '0', 10),
			reset: parseInt(headers['x-ratelimit-reset'] ?? '0', 10),
			limit: parseInt(headers['x-ratelimit-limit'] ?? '0', 10),
		};

		if (res.status >= 400) {
			throw new Error(
				`esa.io API error (${res.status}): ${res.text}`,
			);
		}

		return {
			data: res.json as T,
			headers,
		};
	}

	/** Search posts by query (title/body). Uses exact name match by default. */
	async searchPosts(query: string): Promise<EsaPostSearchResult> {
		const { data } = await this.request<{ posts: EsaPostSearchItem[]; total_count: number }>({
			url: `${this.baseUrl}/posts?q=${encodeURIComponent(query)}&per_page=5`,
			method: 'GET',
		});
		return data;
	}

	async createPost(post: EsaPostPayload): Promise<EsaApiResponse> {
		const { data } = await this.request<EsaApiResponse>({
			url: `${this.baseUrl}/posts`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ post }),
		});
		return data;
	}

	async updatePost(
		postNumber: number,
		post: Partial<EsaPostPayload>,
	): Promise<EsaApiResponse> {
		const { data } = await this.request<EsaApiResponse>({
			url: `${this.baseUrl}/posts/${postNumber}`,
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ post }),
		});
		return data;
	}

	/**
	 * Step 1: Get pre-signed upload policy from esa.io.
	 * Returns policy data including S3 endpoint and form fields.
	 */
	async getPolicy(
		fileName: string,
		mimeType: string,
		byteSize: number,
	): Promise<EsaAttachmentPolicy> {
		const url = `${this.baseUrl}/attachments/policies`;
		const formBody = new URLSearchParams({
			type: mimeType,
			name: fileName,
			size: String(byteSize),
		}).toString();

		const { data } = await this.request<EsaAttachmentPolicy>({
			url,
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: formBody,
		});
		return data;
	}

	/**
	 * Step 2: Upload file directly to S3 using pre-signed policy.
	 */
	async uploadToS3(policy: EsaAttachmentPolicy, fileName: string, fileData: ArrayBuffer, mimeType: string): Promise<void> {
		const { form, attachment } = policy;
		const endpoint = attachment.endpoint;

		const boundary = `----EsaS3Boundary${Date.now()}`;

		// Build multipart body: form fields + file
		const encoder = new TextEncoder();
		const parts: Uint8Array[] = [];

		const formFields: [string, string][] = [
			['AWSAccessKeyId', form.AWSAccessKeyId],
			['signature', form.signature],
			['policy', form.policy],
			['key', form.key],
			['Content-Type', form['Content-Type']],
			['Cache-Control', form['Cache-Control']],
			['Content-Disposition', form['Content-Disposition']],
			['acl', form.acl],
		];

		for (const [fieldName, fieldValue] of formFields) {
			parts.push(encoder.encode(
				`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="${fieldName}"\r\n\r\n` +
				`${fieldValue}\r\n`,
			));
		}

		// File part
		parts.push(encoder.encode(
			`--${boundary}\r\n` +
			`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
			`Content-Type: ${mimeType}\r\n\r\n`,
		));
		parts.push(new Uint8Array(fileData));
		parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));

		// Concatenate all parts
		const totalLen = parts.reduce((sum, p) => sum + p.byteLength, 0);
		const body = new Uint8Array(totalLen);
		let offset = 0;
		for (const p of parts) {
			body.set(p, offset);
			offset += p.byteLength;
		}

		const res = await requestUrl({
			url: endpoint,
			method: 'POST',
			headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
			body: body.buffer,
		});

		// S3 returns 204 on success, 4xx on failure
		if (res.status >= 400) {
			throw new Error(
				`S3 upload failed (${res.status}): ${res.text}`,
			);
		}
	}

	/**
	 * Full two-step attachment upload:
	 * 1. Get pre-signed policy from esa.io API
	 * 2. Upload file to S3
	 * Returns the public esa.io URL for the attachment.
	 */
	async uploadAttachment(
		fileName: string,
		fileData: ArrayBuffer,
		mimeType: string,
		size: number,
	): Promise<string> {
		// Step 1: get policy
		const policy = await this.getPolicy(fileName, mimeType, size);

		// Step 2: upload to S3
		await this.uploadToS3(policy, fileName, fileData, mimeType);

		return policy.attachment.url;
	}

	validateConfig(): string | null {
		if (!this.team) return 'esa.io team name is not configured.';
		if (!this.token) return 'API token is not configured.';
		return null;
	}
}
