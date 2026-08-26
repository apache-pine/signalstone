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
	start(): Promise<void>;
	stop(): Promise<void>;
	/** Tells the provider which conversation (and thread, if any) is currently open. */
	setActiveView(view: ActiveView | null): void;
	onEvent(listener: (event: RealtimeEvent) => void): () => void;
	onStatusChange(listener: (status: RealtimeStatus) => void): () => void;
}
