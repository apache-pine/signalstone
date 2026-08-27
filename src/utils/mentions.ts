import type { Membership } from '../models/Membership';

/**
 * The exact Webex-documented mention markup — verified against
 * https://developer.webex.com/formatting-messages.html, not guessed:
 * `<@personEmail:email|Name>`, `<@personId:id|Name>`, and `<@all>`.
 */
export interface PendingMention {
	/** The friendly text shown in the composer, e.g. "Anthony Perez" or "all". */
	displayName: string;
	/** The exact markup to substitute in at send time. */
	markup: string;
}

export function mentionMarkupFor(candidate: Membership | 'all'): PendingMention {
	if (candidate === 'all') return { displayName: 'all', markup: '<@all>' };
	const displayName = candidate.personDisplayName || candidate.personEmail;
	return { displayName, markup: `<@personEmail:${candidate.personEmail}|${displayName}>` };
}

/**
 * Finds the "@query" token the cursor is currently inside, if any — an `@`
 * preceded by start-of-string or whitespace, followed by a run of
 * non-whitespace characters up to the cursor. Returns null when the cursor
 * isn't inside such a token (including right after a completed mention with
 * a trailing space, or inside an email-shaped word like "name@example.com"
 * where the `@` isn't at a word boundary).
 */
export function detectActiveMention(text: string, cursor: number): { start: number; query: string } | null {
	let start = cursor - 1;
	while (start >= 0 && text[start] !== '@' && !/\s/.test(text[start] ?? '')) start -= 1;
	if (start < 0 || text[start] !== '@') return null;

	const before = start === 0 ? '' : text[start - 1];
	if (start !== 0 && !/\s/.test(before ?? '')) return null;

	return { start, query: text.slice(start + 1, cursor) };
}

/** Filters candidate members by display name or email, excluding the given person (typically the current user). */
export function filterMentionCandidates(members: Membership[], query: string, excludePersonId?: string, limit = 8): Membership[] {
	const needle = query.toLowerCase();
	return members
		.filter((member) => member.personId !== excludePersonId)
		.filter((member) => (member.personDisplayName ?? '').toLowerCase().includes(needle) || member.personEmail.toLowerCase().includes(needle))
		.slice(0, limit);
}

export function shouldOfferAllMention(query: string): boolean {
	return 'all'.startsWith(query.toLowerCase());
}

/** Replaces the active "@query" token with "@DisplayName " (friendly text), returning the new text and where the cursor should land. */
export function insertMention(text: string, mentionStart: number, queryLength: number, displayName: string): { text: string; cursor: number } {
	const before = text.slice(0, mentionStart);
	const after = text.slice(mentionStart + 1 + queryLength);
	const inserted = `@${displayName} `;
	return { text: `${before}${inserted}${after}`, cursor: before.length + inserted.length };
}

/**
 * Substitutes each pending mention's friendly "@DisplayName" text with its
 * real Webex markup, in the order the mentions were selected. A mention
 * whose friendly text was since edited or deleted simply doesn't match and
 * is left as harmless plain text — not an error, since a plain textarea
 * can't reliably track a mention "chip" through arbitrary further edits.
 */
export function resolveMentions(text: string, mentions: PendingMention[]): string {
	return mentions.reduce((result, mention) => result.replace(`@${mention.displayName}`, mention.markup), text);
}
