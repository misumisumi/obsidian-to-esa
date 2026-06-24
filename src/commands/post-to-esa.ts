import { MarkdownView, Notice } from 'obsidian';
import type ObsidianToEsa from '../main';
import { EsaClient, formatResetTime } from '../esa-client';
import { CategoryPromptModal } from '../ui/category-prompt-modal';
import {
	resolveAttachments,
	toEsaHtmlTag,
	formatFileSizeKb,
} from '../utils/attachment-resolver';

/**
 * Count unique article wikilinks in body text.
 * Matches [[...]] that are NOT preceded by ! (attachment embeds).
 */
function countWikilinks(body: string): number {
	const linkRegex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
	const queries = new Set<string>();
	let match: RegExpExecArray | null;
	while ((match = linkRegex.exec(body)) !== null) {
		const displayText = match[2] || match[1]!;
		queries.add(displayText);
	}
	return queries.size;
}

/**
 * Resolve article wikilinks ([[id|title]] or [[title]]) by searching esa.io.
 * - If found: replace with [#number: full_name](/posts/number)
 * - If not found: replace with plain display text
 */
async function resolveWikilinks(
	body: string,
	esaClient: EsaClient,
): Promise<string> {
	const linkRegex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

	// Collect unique links by display text (search query)
	const linkMap = new Map<string, { refs: string[]; displayText: string }>();
	let match: RegExpExecArray | null;
	while ((match = linkRegex.exec(body)) !== null) {
		const fullMatch = match[0];
		const linkTarget = match[1]!;
		const displayText = match[2] || linkTarget;

		if (!linkMap.has(displayText)) {
			linkMap.set(displayText, { refs: [], displayText });
		}
		linkMap.get(displayText)!.refs.push(fullMatch);
	}

	if (linkMap.size === 0) return body;

	let result = body;

	for (const [query, info] of linkMap) {
		try {
			const searchResult = await esaClient.searchPosts(query);
			const found = searchResult.posts.find((p) => p.name === query);

			if (found) {
				const replacement = `[#${found.number}: ${found.name}](/posts/${found.number})`;
				for (const ref of info.refs) {
					result = result.replace(ref, replacement);
				}
			} else {
				// Not found → plain text
				for (const ref of info.refs) {
					result = result.replace(ref, info.displayText);
				}
			}
		} catch {
			// On error, fall back to plain text
			for (const ref of info.refs) {
				result = result.replace(ref, info.displayText);
			}
		}
	}

	return result;
}

export function registerPostToEsa(plugin: ObsidianToEsa) {
	plugin.addCommand({
		id: 'post-to-esa',
		name: 'Post current note to esa.io',
		checkCallback: (checking: boolean) => {
			const view =
				plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view || !view.file) return false;
			if (checking) return true;

			void postNote(plugin, view, false);
			return true;
		},
	});

	plugin.addCommand({
		id: 'post-to-esa-as-draft',
		name: 'Post current note to esa.io as draft',
		checkCallback: (checking: boolean) => {
			const view =
				plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view || !view.file) return false;
			if (checking) return true;

			void postNote(plugin, view, true);
			return true;
		},
	});
}

async function postNote(
	plugin: ObsidianToEsa,
	view: MarkdownView,
	wip: boolean,
) {
	const settings = plugin.settings;

	const esaClient = new EsaClient(settings.esaTeam, settings.esaToken);

	const validationError = esaClient.validateConfig();
	if (validationError) {
		new Notice(`esa.io: ${validationError}`);
		return;
	}

	const file = view.file!;
	const content = await plugin.app.vault.read(file);

	const { title, tags, body, category: frontmatterCategory } = parseNoteContent(
		content,
		file.basename,
	);

	// Ask for category with modal, pre-filled with frontmatter category or default
	const modal = new CategoryPromptModal(
		plugin.app,
		frontmatterCategory || settings.defaultCategory || '',
	);
	const categoryResult = await modal.openAndAwait();
	if (categoryResult.cancelled) return;

	const category = categoryResult.category || undefined;

	// Resolve attachments
	const noteFolder = file.parent ? file.parent.path : '';
	const attachments = resolveAttachments(body, plugin.app.vault, noteFolder);

	// --- Step 1: Check for existing post by title ---
	let existingPostNumber: number | null = null;
	try {
		const searchResult = await esaClient.searchPosts(title);
		const match = searchResult.posts.find(
			(p) => p.name === title,
		);
		if (match) {
			existingPostNumber = match.number;
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		new Notice(`esa.io search failed (proceeding with new post): ${message}`);
	}

	// --- Step 2: Rate limit check ---
	const wikilinkCount = countWikilinks(body);
	const rateLimit = esaClient.lastRateLimit;
	if (rateLimit && rateLimit.limit > 0) {
		// Only policies calls consume esa.io API rate limit (S3 upload is direct)
		const estimatedRequests = 1 + 1 + attachments.length + wikilinkCount; // search + post + N policies + M wikilink searches
		const buffer = 3;
		const needed = estimatedRequests + buffer;
		if (rateLimit.remaining < needed) {
			const recovery = formatResetTime(rateLimit.reset);
			new Notice(
				`Rate limit low: ${rateLimit.remaining} remaining, ` +
				`~${estimatedRequests} needed. ` +
				`Resets in ${recovery}. Upload cancelled.`,
				8000,
			);
			return;
		}
	}

	// --- Step 3: Upload attachments with progress ---
	let finalBody = body;
	let uploadCount = 0;
	const totalAttachments = attachments.length;

	for (let i = 0; i < totalAttachments; i++) {
		const att = attachments[i]!;
		try {
			const fileData = await plugin.app.vault.readBinary(att.file);
			const url = await esaClient.uploadAttachment(
				att.file.name,
				fileData,
				att.contentType,
				fileData.byteLength,
			);
			const sizeKb = formatFileSizeKb(fileData.byteLength);
			const htmlTag = toEsaHtmlTag(
				att.originalRef,
				url,
				att.file.name,
				sizeKb,
				att.mediaType,
			);
			finalBody = finalBody.replace(att.originalRef, htmlTag);
			uploadCount++;
			new Notice(`Uploading attachments: ${uploadCount}/${totalAttachments}`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : String(err);
			new Notice(
				`Failed to upload ${att.file.name}: ${message}`,
			);
		}
	}

	// --- Step 3.5: Resolve article wikilinks ---
	if (wikilinkCount > 0) {
		try {
			finalBody = await resolveWikilinks(finalBody, esaClient);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Wikilink resolution error: ${message}`);
		}
	}

	// --- Step 4: Create or update post ---
	try {
		const result = existingPostNumber
			? await esaClient.updatePost(existingPostNumber, {
					name: title,
					body_md: finalBody,
					tags,
					category,
					wip,
				})
			: await esaClient.createPost({
					name: title,
					body_md: finalBody,
					tags,
					category,
					wip,
				});

		const action = existingPostNumber ? 'Updated' : 'Posted';
		const parts = [`${action} to esa.io: ${result.name}`];
		if (uploadCount > 0) parts.push(`(${uploadCount}/${totalAttachments} attachment(s) uploaded)`);
		new Notice(parts.join(' '));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		new Notice(`esa.io post failed: ${message}`);
	}
}

function parseNoteContent(
	content: string,
	fallbackTitle: string,
): { title: string; tags: string[]; body: string; category: string | null } {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
	let title = fallbackTitle;
	const tags: string[] = [];
	let category: string | null = null;
	let body = content;

	if (frontmatterMatch) {
		const fm = frontmatterMatch[1]!;
		body = content.slice(frontmatterMatch[0].length);

		for (const line of fm.split('\n')) {
			// title: "My Title"
			const titleMatch = line.match(/^title:\s*"?([^"\n]+)"?$/);
			if (titleMatch) {
				title = titleMatch[1]!;
				continue;
			}

			// tags: [tag1, tag2] or tags: [tag1, tag2]
			const tagsMatch = line.match(/^tags:\s*\[([^\]]+)\]/);
			if (tagsMatch) {
				const raw = tagsMatch[1]!;
				for (const t of raw.split(',')) {
					const cleaned = t.replace(/["']/g, '').trim();
					if (cleaned) tags.push(cleaned);
				}
				continue;
			}

			// category: "Obsidian / Imported"
			const categoryMatch = line.match(/^category:\s*"?([^"\n]+)"?$/);
			if (categoryMatch) {
				category = categoryMatch[1]!;
				continue;
			}
		}
	}

	return { title, tags, body, category };
}
