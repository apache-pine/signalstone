import type { Space } from '../models/Space';

export function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.valueOf())) return '';
	return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

/** Extracts a safe, user-facing message from a caught error, falling back to a generic message. */
export function errorMessage(error: unknown, fallback: string): string {
	if (typeof error === 'object' && error !== null && 'userMessage' in error) {
		return String(error.userMessage);
	}
	return fallback;
}
