import type { ActiveView, RealtimeEvent, RealtimeProvider, RealtimeStatus } from './RealtimeProvider';
import { debugLog } from '../utils/logger';

/**
 * Runs the Webex SDK connection as the primary event source and automatically
 * enables conservative REST polling whenever that connection is unavailable.
 *
 * The fallback provider is kept running continuously — not only while the
 * primary is degraded — but only its conversation-list refresh is actually
 * forwarded while the primary is `live`; its per-conversation poll is
 * suppressed then, since live message delivery already covers the open
 * conversation. This is a deliberate low-cost safety net: Webex does not
 * reliably push a live room-updated event just because a message bumped that
 * room's `lastActivity` (see docs/WEBEX_CAPABILITIES.md — Realtime, issue 5),
 * so without this, the conversation list could go stale indefinitely while
 * still solidly `live`.
 */
export class ResilientRealtimeProvider implements RealtimeProvider {
	status: RealtimeStatus = 'idle';
	get detail(): string | undefined { return this.primary.detail; }

	private readonly eventListeners = new Set<(event: RealtimeEvent) => void>();
	private readonly statusListeners = new Set<(status: RealtimeStatus) => void>();
	private stopping = false;

	constructor(
		private readonly primary: RealtimeProvider,
		private readonly fallback: RealtimeProvider,
	) {
		primary.onEvent((event) => this.emit(event));
		fallback.onEvent((event) => {
			if (event.type === 'refresh-space-list' || this.primary.status !== 'live') this.emit(event);
		});
		primary.onStatusChange((status) => void this.handlePrimaryStatus(status));
	}

	async start(): Promise<void> {
		this.stopping = false;
		await this.primary.start();
		await this.fallback.start();
	}

	async stop(): Promise<void> {
		this.stopping = true;
		await Promise.all([this.primary.stop(), this.fallback.stop()]);
		this.setStatus('stopped');
	}

	setActiveView(view: ActiveView | null): void {
		this.primary.setActiveView(view);
		this.fallback.setActiveView(view);
	}

	onEvent(listener: (event: RealtimeEvent) => void): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	onStatusChange(listener: (status: RealtimeStatus) => void): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	private async handlePrimaryStatus(status: RealtimeStatus): Promise<void> {
		if (this.stopping) return;
		debugLog('resilient', `Primary status changed to "${status}"`);
		this.setStatus(status);
	}

	private emit(event: RealtimeEvent): void {
		for (const listener of this.eventListeners) listener(event);
	}

	private setStatus(status: RealtimeStatus): void {
		if (this.status === status) return;
		this.status = status;
		for (const listener of this.statusListeners) listener(status);
	}
}
