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

/** Extracts a safe, user-facing message from a caught error, falling back to a generic message. */
export function errorMessage(error: unknown, fallback: string): string {
	if (typeof error === 'object' && error !== null && 'userMessage' in error) {
		return String(error.userMessage);
	}
	return fallback;
}
