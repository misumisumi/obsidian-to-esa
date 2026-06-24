import { TFile, Vault } from 'obsidian';

export type MediaType = 'img' | 'audio' | 'video' | 'pdf' | 'other';

export interface EmbeddedAttachment {
	/** The original reference text (e.g., "![[image.png]]") */
	originalRef: string;
	/** Resolved vault file */
	file: TFile;
	/** MIME type */
	contentType: string;
	/** Media type classification based on extension */
	mediaType: MediaType;
}

const EXT_MEDIA: Record<string, MediaType> = {
	png: 'img',
	jpg: 'img',
	jpeg: 'img',
	webp: 'img',
	bmp: 'img',
	gif: 'img',
	svg: 'img',
	wav: 'audio',
	mp3: 'audio',
	ogg: 'audio',
	aac: 'audio',
	m4a: 'audio',
	opus: 'audio',
	flac: 'audio',
	ape: 'audio',
	mp4: 'video',
	webm: 'video',
	avi: 'video',
	mkv: 'video',
	mov: 'video',
	pdf: 'pdf',
};

/**
 * Scans markdown body for Obsidian wikilink attachments (![[file.ext]])
 * and markdown image links (![alt](path/to/file.ext)), then resolves
 * each to an actual TFile in the vault.
 */
export function resolveAttachments(
	body: string,
	vault: Vault,
	noteFolder: string,
): EmbeddedAttachment[] {
	const attachments: EmbeddedAttachment[] = [];
	const seen = new Set<string>();

	// Match Obsidian wikilinks: ![[file.png]] or ![[file.png|alt text]]
	const wikiRegex = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
	let match: RegExpExecArray | null;
	while ((match = wikiRegex.exec(body)) !== null) {
		const fileName = match[1]!.trim();
		const key = `wiki:${fileName}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const file = resolveFile(fileName, vault, noteFolder);
		if (file) {
			attachments.push({
				originalRef: match[0],
				file,
				contentType: getContentType(file.extension),
				mediaType: getMediaType(file.extension),
			});
		}
	}

	// Match markdown image links: ![alt](path/to/file.ext)
	const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
	while ((match = mdRegex.exec(body)) !== null) {
		const rawPath = match[1]!.trim();
		const key = `md:${rawPath}`;
		if (seen.has(key)) continue;
		seen.add(key);

		// Extract filename from path
		const fileName = rawPath.split('/').pop() || rawPath;
		if (!fileName.includes('.')) continue; // Not a file attachment

		const file = resolveFile(rawPath, vault, noteFolder);
		if (file) {
			attachments.push({
				originalRef: match[0],
				file,
				contentType: getContentType(file.extension),
				mediaType: getMediaType(file.extension),
			});
		}
	}

	return attachments;
}

function resolveFile(
	pathOrName: string,
	vault: Vault,
	noteFolder: string,
): TFile | null {
	// 1. Try the path directly (relative to vault root or absolute)
	const direct = vault.getAbstractFileByPath(pathOrName);
	if (direct instanceof TFile) return direct;

	// 2. Try relative to note folder
	const relative = vault.getAbstractFileByPath(
		`${noteFolder}/${pathOrName}`,
	);
	if (relative instanceof TFile) return relative;

	// 3. Search vault by filename (last resort)
	const fileName = pathOrName.split('/').pop()!;
	const files = vault.getFiles();
	const found = files.find(
		(f) => f.name === fileName || f.path.endsWith(`/${fileName}`),
	);
	if (found) return found;

	return null;
}

function getContentType(extension: string): string {
	const map: Record<string, string> = {
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		webp: 'image/webp',
		bmp: 'image/bmp',
		wav: 'audio/wav',
		mp3: 'audio/mpeg',
		aac: 'audio/aac',
		m4a: 'audio/mp4',
		ogg: 'audio/ogg',
		opus: 'audio/opus',
		flac: 'audio/flac',
		ape: 'audio/ape',
		mp4: 'video/mp4',
		webm: 'video/webm',
		avi: 'video/x-msvideo',
		mkv: 'video/x-matroska',
		mov: 'video/quicktime',
		pdf: 'application/pdf',
		csv: 'text/csv',
		txt: 'text/plain',
		zip: 'application/zip',
	};
	return map[extension.toLowerCase()] || 'application/octet-stream';
}

function getMediaType(extension: string): MediaType {
	return EXT_MEDIA[extension.toLowerCase()] || 'other';
}

/**
 * Generate an esa.io-compatible HTML tag for an uploaded attachment.
 */
export function toEsaHtmlTag(
	originalRef: string,
	url: string,
	fileName: string,
	fileSizeKb: string,
	mediaType: MediaType,
): string {
	switch (mediaType) {
		case 'img':
			return `<img width="480" alt="${fileName} (${fileSizeKb} kB)" src="${url}">`;
		case 'audio':
			return `<audio controls alt="${fileName} (${fileSizeKb} kB)" src="${url}"></audio>`;
		case 'video':
			return `<video controls alt="${fileName} (${fileSizeKb} kB)" src="${url}"></video>`;
		case 'pdf':
			return `<a href="${url}">${fileName} (${fileSizeKb} kB)</a>`;
		default:
			return `<a href="${url}">${fileName} (${fileSizeKb} kB)</a>`;
	}
}

/**
 * Format file size in kB with one decimal place.
 */
export function formatFileSizeKb(byteSize: number): string {
	return (byteSize / 1024).toFixed(1);
}
