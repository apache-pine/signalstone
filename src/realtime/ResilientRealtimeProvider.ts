import type { ActiveView, RealtimeEvent, RealtimeProvider, RealtimeStatus } from './RealtimeProvider';
import { debugLog } from '../utils/logger';

/**
 * Runs the Webex SDK connection as the primary event source and automatically
 * enables conservative REST polling whenever that connection is unavailable.
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
			if (this.primary.status !== 'live') this.emit(event);
		});
		primary.onStatusChange((status) => void this.handlePrimaryStatus(status));
	}

	async start(): Promise<void> {
		this.stopping = false;
		await this.primary.start();
		if (this.primary.status !== 'live') await this.fallback.start();
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
		if (status === 'live') {
			await this.fallback.stop();
			this.setStatus('live');
			return;
		}
		if (status === 'degraded') await this.fallback.start();
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
