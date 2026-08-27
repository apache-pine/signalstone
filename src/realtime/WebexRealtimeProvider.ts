import type { ActiveView, RealtimeEvent, RealtimeProvider, RealtimeStatus } from './RealtimeProvider';
import { debugLog } from '../utils/logger';

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
	/** Closes the shared Mercury WebSocket without revoking the user's token. */
	disconnect(): Promise<void>;
}

/**
 * Creates a messaging-only official SDK instance for the given token. The
 * production implementation lives in `createWebexSdk.ts`; tests supply a
 * lightweight fake through the same boundary.
 */
export type WebexSdkFactory = (token: string) => Promise<WebexSdkHandle>;

interface MessageEventPayload {
	data?: { id?: string; roomId?: string };
}

interface MembershipEventPayload {
	data?: { roomId?: string };
}

interface MembershipSeenEventPayload {
	data?: { roomId?: string; personId?: string; personDisplayName?: string; personEmail?: string; lastSeenId?: string; created?: string };
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
	detail: string | undefined;

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
	private readonly onMembershipSeen = (payload: unknown) => this.handleMembershipSeenEvent(payload);

	constructor(private readonly options: WebexRealtimeProviderOptions) {}

	async start(): Promise<void> {
		if (this.status === 'live' || this.status === 'connecting' || this.status === 'reconnecting') return;
		this.stopped = false;
		this.reconnectAttempts = 0;
		this.detail = undefined;
		await this.connect();
	}

	async stop(): Promise<void> {
		this.stopped = true;
		this.clearReconnectTimer();
		await this.teardown();
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
		debugLog('sdk', 'Connecting', { attempt: this.reconnectAttempts });
		try {
			const handle = await this.options.createSdk(token);
			this.handle = handle;
			if (this.stopped) {
				await this.teardown();
				return;
			}

			handle.messages.on('created', this.onMessageCreated);
			handle.messages.on('updated', this.onMessageUpdated);
			handle.messages.on('deleted', this.onMessageDeleted);
			handle.rooms.on('created', this.onRoomEvent);
			handle.rooms.on('updated', this.onRoomEvent);
			handle.memberships.on('created', this.onMembershipEvent);
			handle.memberships.on('updated', this.onMembershipEvent);
			handle.memberships.on('deleted', this.onMembershipEvent);
			// 'seen' is a documented event on the same public listen()/on()
			// contract as the above (see docs/WEBEX_CAPABILITIES.md, "Read/unread
			// state") -- someone else's read receipt, never our own (Signalstone
			// has no public way to send one).
			handle.memberships.on('seen', this.onMembershipSeen);

			await handle.messages.listen();
			await handle.rooms.listen();
			await handle.memberships.listen();

			this.reconnectAttempts = 0;
			this.setStatus('live');
			debugLog('sdk', 'Live: message/room/membership listeners attached');
		} catch (error) {
			await this.teardown();
			this.detail = describeSdkFailure(error, token);
			debugLog('sdk', 'Connect failed', { detail: this.detail });
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

	private async teardown(): Promise<void> {
		if (!this.handle) return;
		const handle = this.handle;
		try {
			handle.messages.off('created', this.onMessageCreated);
			handle.messages.off('updated', this.onMessageUpdated);
			handle.messages.off('deleted', this.onMessageDeleted);
			handle.rooms.off('created', this.onRoomEvent);
			handle.rooms.off('updated', this.onRoomEvent);
			handle.memberships.off('created', this.onMembershipEvent);
			handle.memberships.off('updated', this.onMembershipEvent);
			handle.memberships.off('deleted', this.onMembershipEvent);
			handle.memberships.off('seen', this.onMembershipSeen);
			handle.messages.stopListening();
			handle.rooms.stopListening();
			handle.memberships.stopListening();
			await handle.disconnect();
		} catch {
			// Cleanup is best effort; connection failures must not prevent unload.
		} finally {
			this.handle = null;
		}
	}

	private handleMessageEvent(type: 'message-created' | 'message-updated' | 'message-deleted', payload: unknown): void {
		const data = (payload as MessageEventPayload | undefined)?.data;
		if (!data?.roomId || !data.id) {
			debugLog('sdk', `Received "${type}" but payload was missing data.roomId/data.id — not forwarded`, { payloadShape: describeShape(payload) });
			return;
		}
		debugLog('sdk', `Received "${type}"`, { spaceId: data.roomId, messageId: data.id });
		this.emit({ type, spaceId: data.roomId, messageId: data.id });
	}

	private handleRoomEvent(_payload: unknown): void {
		debugLog('sdk', 'Received a room event — refreshing space list');
		this.emit({ type: 'refresh-space-list' });
	}

	private handleMembershipEvent(payload: unknown): void {
		const spaceId = (payload as MembershipEventPayload | undefined)?.data?.roomId;
		if (!spaceId) return;
		this.emit({ type: 'memberships-changed', spaceId });
	}

	private handleMembershipSeenEvent(payload: unknown): void {
		const data = (payload as MembershipSeenEventPayload | undefined)?.data;
		if (!data?.roomId || !data.personId || !data.lastSeenId) {
			debugLog('sdk', 'Received "seen" but payload was missing required fields — not forwarded', { payloadShape: describeShape(payload) });
			return;
		}
		debugLog('sdk', 'Received "seen"', { spaceId: data.roomId, personId: data.personId, lastSeenMessageId: data.lastSeenId });
		this.emit({
			type: 'membership-seen',
			spaceId: data.roomId,
			personId: data.personId,
			personDisplayName: data.personDisplayName,
			personEmail: data.personEmail,
			lastSeenMessageId: data.lastSeenId,
			seenAt: data.created ?? new Date().toISOString(),
		});
	}

	private emit(event: RealtimeEvent): void {
		for (const listener of this.eventListeners) listener(event);
	}

	private setStatus(status: RealtimeStatus): void {
		this.status = status;
		for (const listener of this.statusListeners) listener(status);
	}
}

/**
 * Categorizes an SDK connection failure for the status tooltip, and always
 * appends the actual (redacted) error text so a live tester — or a future
 * contributor reading a bug report — has something concrete to act on
 * instead of a bucketed guess. A bare "device registration failed" with no
 * detail was a dead end in practice; see docs/WEBEX_CAPABILITIES.md for why
 * this call is expected to fail with a CORS-shaped error in most desktop
 * embeddings.
 */
function describeSdkFailure(error: unknown, token: string): string {
	const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : safeStringify(error);
	const safe = raw
		.replaceAll(token, '[redacted]')
		.replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
		.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted email]')
		.replace(/https?:\/\/\S+/gi, '[Webex URL]')
		.trim()
		.slice(0, 200);

	const record = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : undefined;
	const status = record?.statusCode ?? record?.status;
	const lower = raw.toLowerCase();

	let category: string;
	if (status === 401) category = 'SDK authorization failed';
	else if (status === 403) category = 'Token lacks realtime permissions';
	else if (typeof status === 'number') category = `SDK request failed (${status})`;
	else if (lower.includes('websocket') || lower.includes('socket')) category = 'WebSocket connection failed';
	else if (lower.includes('device') || lower.includes('register')) category = 'Webex device registration failed';
	else if (lower.includes('cors') || lower.includes('failed to fetch') || lower.includes('networkerror')) category = 'Blocked by cross-origin restrictions (CORS)';
	else if (lower.includes('network') || lower.includes('fetch') || lower.includes('enotfound')) category = 'Realtime network request failed';
	else category = 'SDK setup failed';

	return safe ? `${category}: ${safe}` : category;
}

/** Describes an unknown payload's shape (top-level key names only) for debug logging, without exposing its content. */
function describeShape(value: unknown): unknown {
	if (value === null || value === undefined || typeof value !== 'object') return typeof value;
	return Object.keys(value);
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? '';
	} catch {
		return '';
	}
}
