import type { ActiveView, RealtimeEvent, RealtimeProvider, RealtimeStatus } from './RealtimeProvider';

/**
 * The subset of the Webex Browser JS SDK's event surface this provider
 * depends on (`webex.messages.listen()`/`.on()`, and the equivalent for
 * `rooms`/`memberships`), per developer.webex.com's browser SDK guide and
 * the official WebexSamples/browser-sdk-demo and websocket-demo-page
 * samples. Declared locally, rather than importing the SDK's own types, so
 * this provider is unit-testable without the real package.
 */
export interface WebexSdkListenable {
	listen(): Promise<void>;
	stopListening(): void;
	on(event: string, handler: (payload: unknown) => void): void;
	off(event: string, handler: (payload: unknown) => void): void;
}

export interface WebexSdkHandle {
	messages: WebexSdkListenable;
	rooms: WebexSdkListenable;
	memberships: WebexSdkListenable;
}

/**
 * Creates and connects an SDK instance for the given token. Implemented in
 * `main.ts` against the real `webex` package; see
 * `docs/WEBEX_CAPABILITIES.md` for why that wiring is not enabled by
 * default in this release.
 */
export type WebexSdkFactory = (token: string) => Promise<WebexSdkHandle>;

interface MessageEventPayload {
	data?: { id?: string; roomId?: string };
}

interface MembershipEventPayload {
	data?: { roomId?: string };
}

export interface WebexRealtimeProviderOptions {
	getToken: () => string | null;
	createSdk: WebexSdkFactory;
	/** Base backoff delay for reconnect attempts, in ms. Default 2000. */
	baseReconnectDelayMs?: number;
	/** Maximum backoff delay for reconnect attempts, in ms. Default 60000. */
	maxReconnectDelayMs?: number;
	setTimeout?: (callback: () => void, ms: number) => number;
	clearTimeout?: (id: number) => void;
}

/**
 * Realtime provider backed by the official Webex Browser JS SDK's
 * WebSocket-based event listeners. Only documented SDK methods are used
 * (`listen`, `on`, `off`, `stopListening`); no private protocol is
 * implemented. Any connection failure — including the SDK failing to
 * initialize at all — transitions to `degraded` status rather than
 * throwing, so the caller can fall back to {@link PollingFallback}.
 */
export class WebexRealtimeProvider implements RealtimeProvider {
	status: RealtimeStatus = 'idle';

	private handle: WebexSdkHandle | null = null;
	private eventListeners = new Set<(event: RealtimeEvent) => void>();
	private statusListeners = new Set<(status: RealtimeStatus) => void>();
	private reconnectAttempts = 0;
	private reconnectTimer: number | undefined;
	private stopped = false;

	private readonly onMessageCreated = (payload: unknown) => this.handleMessageEvent('message-created', payload);
	private readonly onMessageUpdated = (payload: unknown) => this.handleMessageEvent('message-updated', payload);
	private readonly onMessageDeleted = (payload: unknown) => this.handleMessageEvent('message-deleted', payload);
	private readonly onRoomEvent = (payload: unknown) => this.handleRoomEvent(payload);
	private readonly onMembershipEvent = (payload: unknown) => this.handleMembershipEvent(payload);

	constructor(private readonly options: WebexRealtimeProviderOptions) {}

	async start(): Promise<void> {
		this.stopped = false;
		await this.connect();
	}

	async stop(): Promise<void> {
		this.stopped = true;
		this.clearReconnectTimer();
		this.teardown();
		this.setStatus('stopped');
	}

	setActiveView(_view: ActiveView | null): void {
		// The SDK listens across all spaces the user belongs to; no per-space prioritization needed.
	}

	onEvent(listener: (event: RealtimeEvent) => void): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	onStatusChange(listener: (status: RealtimeStatus) => void): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	private async connect(): Promise<void> {
		const token = this.options.getToken();
		if (!token) {
			this.setStatus('degraded');
			return;
		}

		this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
		try {
			const handle = await this.options.createSdk(token);
			if (this.stopped) return;

			handle.messages.on('created', this.onMessageCreated);
			handle.messages.on('updated', this.onMessageUpdated);
			handle.messages.on('deleted', this.onMessageDeleted);
			handle.rooms.on('created', this.onRoomEvent);
			handle.rooms.on('updated', this.onRoomEvent);
			handle.memberships.on('created', this.onMembershipEvent);
			handle.memberships.on('updated', this.onMembershipEvent);
			handle.memberships.on('deleted', this.onMembershipEvent);

			await handle.messages.listen();
			await handle.rooms.listen();
			await handle.memberships.listen();

			this.handle = handle;
			this.reconnectAttempts = 0;
			this.setStatus('live');
		} catch {
			this.handle = null;
			this.setStatus('degraded');
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped) return;
		const base = this.options.baseReconnectDelayMs ?? 2000;
		const max = this.options.maxReconnectDelayMs ?? 60_000;
		const delay = Math.min(max, base * 2 ** this.reconnectAttempts);
		this.reconnectAttempts += 1;

		const setTimer = this.options.setTimeout ?? ((cb, ms) => window.setTimeout(cb, ms));
		this.reconnectTimer = setTimer(() => {
			if (!this.stopped) void this.connect();
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer === undefined) return;
		const clearTimer = this.options.clearTimeout ?? ((id: number) => window.clearTimeout(id));
		clearTimer(this.reconnectTimer);
		this.reconnectTimer = undefined;
	}

	private teardown(): void {
		if (!this.handle) return;
		try {
			this.handle.messages.off('created', this.onMessageCreated);
			this.handle.messages.off('updated', this.onMessageUpdated);
			this.handle.messages.off('deleted', this.onMessageDeleted);
			this.handle.rooms.off('created', this.onRoomEvent);
			this.handle.rooms.off('updated', this.onRoomEvent);
			this.handle.memberships.off('created', this.onMembershipEvent);
			this.handle.memberships.off('updated', this.onMembershipEvent);
			this.handle.memberships.off('deleted', this.onMembershipEvent);
			this.handle.messages.stopListening();
			this.handle.rooms.stopListening();
			this.handle.memberships.stopListening();
		} finally {
			this.handle = null;
		}
	}

	private handleMessageEvent(type: 'message-created' | 'message-updated' | 'message-deleted', payload: unknown): void {
		const data = (payload as MessageEventPayload | undefined)?.data;
		if (!data?.roomId || !data.id) return;
		this.emit({ type, spaceId: data.roomId, messageId: data.id });
	}

	private handleRoomEvent(_payload: unknown): void {
		this.emit({ type: 'refresh-space-list' });
	}

	private handleMembershipEvent(payload: unknown): void {
		const spaceId = (payload as MembershipEventPayload | undefined)?.data?.roomId;
		if (!spaceId) return;
		this.emit({ type: 'memberships-changed', spaceId });
	}

	private emit(event: RealtimeEvent): void {
		for (const listener of this.eventListeners) listener(event);
	}

	private setStatus(status: RealtimeStatus): void {
		this.status = status;
		for (const listener of this.statusListeners) listener(status);
	}
}
