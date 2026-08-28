import type { Space } from '../models/Space';
import type { TimeFormat } from '../settings/settings';

/**
 * 'system' (the default) omits `hour12` entirely so the browser/OS locale
 * decides, exactly matching the original unconditional behavior. '12-hour'/
 * '24-hour' let a user override that when they want a consistent clock
 * regardless of locale.
 */
export function formatDate(value: string, timeFormat: TimeFormat = 'system'): string {
	const date = new Date(value);
	if (Number.isNaN(date.valueOf())) return '';
	const hour12 = timeFormat === 'system' ? undefined : timeFormat === '12-hour';
	return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12 });
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const REALTIME_LABELS: Record<string, string> = {
	live: 'Live',
	connecting: 'Connecting…',
	reconnecting: 'Reconnecting…',
	degraded: 'Polling',
	stopped: 'Offline',
	idle: 'Starting…',
};

export function realtimeLabel(status: string): string {
	return REALTIME_LABELS[status] ?? 'Polling';
}

/**
 * Webex's Message resource only ever carries the sender's `personId`/
 * `personEmail`, never a display name — so `message.personDisplayName` is
 * effectively always undefined for messages fetched via the Messages API.
 * For a direct (1:1) space specifically, the space itself always represents
 * exactly one other person, and Webex's Rooms API already auto-populates
 * that space's `title` with their display name (that's what the
 * conversation header already shows) — so it's a reliable, zero-extra-call
 * fallback for who sent a message there. Group spaces have no equivalent
 * shortcut: resolving a display name for an arbitrary sender would need a
 * separate lookup (e.g. against loaded memberships), not implemented here.
 */
export function resolveSenderName(message: { personDisplayName?: string; personEmail: string }, space: Space | undefined): string {
	if (message.personDisplayName) return message.personDisplayName;
	if (space?.type === 'direct' && space.title) return space.title;
	return message.personEmail;
}

/**
 * Webex Markdown only treats a line ending in two-or-more spaces as a hard
 * line break; a bare newline is a soft join (rendered as a space) in every
 * Webex client, including Signalstone's own renderer (see
 * utils/webexMarkdown.tsx). The composer's Shift+Enter inserts a bare
 * newline, so without this a multi-line draft would collapse onto one line
 * everywhere it's rendered. Applied only to the outgoing `markdown` field —
 * the plain-text fallback doesn't need markdown escaping.
 *
 * A blank line (two Shift+Enters in a row — a paragraph break, not a line
 * break within one paragraph) is deliberately left untouched rather than
 * also getting the hard-break treatment. Encoding it the same way turned it
 * into two lines that are each just two spaces and nothing else; that does
 * not reliably survive Webex's server round-trip (a line with only
 * whitespace commonly gets trimmed), which silently turned an intentional
 * blank line back into a soft join once the sent message came back and was
 * re-rendered — the blank line collapsed away. A genuine blank line already
 * renders correctly as its own paragraph via `splitBlocks`'s own
 * blank-line handling in `webexMarkdown.tsx`, so it never needed hard-break
 * encoding in the first place.
 */
export function toWebexMarkdown(text: string): string {
	return text
		.split(/(\n{2,})/)
		.map((part, index) => (index % 2 === 0 ? part.replace(/ *\n/g, '  \n') : part))
		.join('');
}

/** Extracts a safe, user-facing message from a caught error, falling back to a generic message. */
export function errorMessage(error: unknown, fallback: string): string {
	if (typeof error === 'object' && error !== null && 'userMessage' in error) {
		return String(error.userMessage);
	}
	return fallback;
}
