import type { ActiveView, RealtimeEvent, RealtimeProvider, RealtimeStatus } from './RealtimeProvider';

export interface PollingFallbackOptions {
	/** How often to poll the open conversation for new messages. Default 15s. */
	activeConversationIntervalMs?: number;
	/** How often to re-list spaces so ordering/new spaces stay current. Default 45s. */
	spaceListIntervalMs?: number;
	setInterval?: (callback: () => void, ms: number) => number;
	clearInterval?: (id: number) => void;
	/** Lets the host (main.ts) register the underlying timer with Obsidian's Plugin.registerInterval for defense-in-depth cleanup. */
	registerInterval?: (id: number) => void;
}

const DEFAULT_ACTIVE_INTERVAL_MS = 15_000;
const DEFAULT_LIST_INTERVAL_MS = 45_000;

/**
 * Conservative REST-polling implementation of {@link RealtimeProvider}.
 * Never polls the full history of every space — only the currently open
 * conversation (or thread), plus an infrequent space-list refresh for
 * ordering/new spaces. Always available as a fallback when the
 * WebSocket-based provider is disabled or fails to connect.
 */
export class PollingFallback implements RealtimeProvider {
	status: RealtimeStatus = 'idle';

	private activeView: ActiveView | null = null;
	private eventListeners = new Set<(event: RealtimeEvent) => void>();
	private statusListeners = new Set<(status: RealtimeStatus) => void>();
	private activeTimer: number | undefined;
	private listTimer: number | undefined;
	private activeIntervalMs: number;
	private listIntervalMs: number;

	constructor(private readonly options: PollingFallbackOptions = {}) {
		this.activeIntervalMs = options.activeConversationIntervalMs ?? DEFAULT_ACTIVE_INTERVAL_MS;
		this.listIntervalMs = options.spaceListIntervalMs ?? DEFAULT_LIST_INTERVAL_MS;
	}

	async start(): Promise<void> {
		if (this.status === 'degraded' || this.status === 'live') return;
		this.scheduleTimers();
		this.setStatus('degraded');
	}

	async stop(): Promise<void> {
		this.clearTimers();
		this.setStatus('stopped');
	}

	/**
	 * Applies a new polling cadence (e.g. the user changed the "Realtime
	 * polling frequency" setting). If currently running, the timers are
	 * restarted immediately so the new cadence takes effect right away rather
	 * than after the next reconnect; if not running, the new cadence simply
	 * takes effect the next time `start()` is called.
	 */
	setIntervals(activeConversationIntervalMs: number, spaceListIntervalMs: number): void {
		this.activeIntervalMs = activeConversationIntervalMs;
		this.listIntervalMs = spaceListIntervalMs;
		if (this.activeTimer !== undefined || this.listTimer !== undefined) {
			this.clearTimers();
			this.scheduleTimers();
		}
	}

	setActiveView(view: ActiveView | null): void {
		this.activeView = view;
	}

	onEvent(listener: (event: RealtimeEvent) => void): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	onStatusChange(listener: (status: RealtimeStatus) => void): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	private scheduleTimers(): void {
		const setTimer = this.options.setInterval ?? ((cb, ms) => window.setInterval(cb, ms));
		this.listTimer = setTimer(() => this.emit({ type: 'refresh-space-list' }), this.listIntervalMs);
		this.options.registerInterval?.(this.listTimer);

		this.activeTimer = setTimer(() => {
			if (this.activeView) {
				this.emit({ type: 'poll-tick', view: this.activeView });
			}
		}, this.activeIntervalMs);
		this.options.registerInterval?.(this.activeTimer);
	}

	private clearTimers(): void {
		const clearTimer = this.options.clearInterval ?? ((id: number) => window.clearInterval(id));
		if (this.activeTimer !== undefined) clearTimer(this.activeTimer);
		if (this.listTimer !== undefined) clearTimer(this.listTimer);
		this.activeTimer = undefined;
		this.listTimer = undefined;
	}

	private emit(event: RealtimeEvent): void {
		for (const listener of this.eventListeners) listener(event);
	}

	private setStatus(status: RealtimeStatus): void {
		this.status = status;
		for (const listener of this.statusListeners) listener(status);
	}
}
