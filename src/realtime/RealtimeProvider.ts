export interface ActiveView {
	spaceId: string;
	parentId?: string;
}

/**
 * Realtime events intentionally carry only IDs, never message content: REST
 * remains the source of truth, and whoever handles the event fetches (or, for
 * deletion, simply discards) the canonical resource by ID.
 */
export type RealtimeEvent =
	| { type: 'message-created'; spaceId: string; messageId: string }
	| { type: 'message-updated'; spaceId: string; messageId: string }
	| { type: 'message-deleted'; spaceId: string; messageId: string }
	| { type: 'memberships-changed'; spaceId: string }
	/**
	 * Someone (never the current user, whose own reads Signalstone has no way
	 * to send — see docs/WEBEX_CAPABILITIES.md, "Read/unread state") read up to
	 * a given message. Only ever emitted by the live SDK provider — REST
	 * polling has no equivalent public read-status endpoint to fall back to.
	 */
	| { type: 'membership-seen'; spaceId: string; personId: string; personDisplayName?: string; personEmail?: string; lastSeenMessageId: string; seenAt: string }
	| { type: 'poll-tick'; view: ActiveView }
	| { type: 'refresh-space-list' };

export type RealtimeStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'degraded' | 'stopped';

/**
 * Abstracts how Signalstone learns about new activity. `WebexRealtimeProvider`
 * uses the documented Webex Browser SDK WebSocket support; `PollingFallback`
 * is a conservative REST-polling implementation used when the SDK is
 * unavailable, disabled, or fails to connect. Both report through the same
 * interface so the rest of the app never needs to know which is active
 * beyond the status it exposes for the UI's connectivity indicator.
 */
export interface RealtimeProvider {
	readonly status: RealtimeStatus;
	/** Safe, token-free explanation when realtime has fallen back to polling. */
	readonly detail?: string;
	start(): Promise<void>;
	stop(): Promise<void>;
	/** Tells the provider which conversation (and thread, if any) is currently open. */
	setActiveView(view: ActiveView | null): void;
	onEvent(listener: (event: RealtimeEvent) => void): () => void;
	onStatusChange(listener: (status: RealtimeStatus) => void): () => void;
}
