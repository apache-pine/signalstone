import { describe, expect, it, vi } from 'vitest';
import { ResilientRealtimeProvider } from '../src/realtime/ResilientRealtimeProvider';
import type { ActiveView, RealtimeEvent, RealtimeProvider, RealtimeStatus } from '../src/realtime/RealtimeProvider';
import { WebexRealtimeProvider, type WebexSdkListenable } from '../src/realtime/WebexRealtimeProvider';
import type { WebexMessagingSdk } from '../src/realtime/createWebexSdk';

class FakeSdkResource implements WebexSdkListenable {
	readonly handlers = new Map<string, Set<(payload: unknown) => void>>();
	listen = vi.fn(async (): Promise<void> => undefined);
	stopListening = vi.fn();
	on(event: string, handler: (payload: unknown) => void): void {
		const handlers = this.handlers.get(event) ?? new Set();
		handlers.add(handler);
		this.handlers.set(event, handlers);
	}
	off(event: string, handler: (payload: unknown) => void): void { this.handlers.get(event)?.delete(handler); }
	emit(event: string, payload: unknown): void { for (const handler of this.handlers.get(event) ?? []) handler(payload); }
}

function sdkHandle() {
	return { messages: new FakeSdkResource(), rooms: new FakeSdkResource(), memberships: new FakeSdkResource(), disconnect: vi.fn(async () => undefined) };
}

class FakeProvider implements RealtimeProvider {
	status: RealtimeStatus = 'idle';
	start = vi.fn(async (): Promise<void> => undefined);
	stop = vi.fn(async (): Promise<void> => { this.setStatus('stopped'); });
	setActiveView = vi.fn((_view: ActiveView | null): void => undefined);
	private readonly events = new Set<(event: RealtimeEvent) => void>();
	private readonly statuses = new Set<(status: RealtimeStatus) => void>();
	onEvent(listener: (event: RealtimeEvent) => void): () => void { this.events.add(listener); return () => this.events.delete(listener); }
	onStatusChange(listener: (status: RealtimeStatus) => void): () => void { this.statuses.add(listener); return () => this.statuses.delete(listener); }
	emit(event: RealtimeEvent): void { for (const listener of this.events) listener(event); }
	setStatus(status: RealtimeStatus): void { this.status = status; for (const listener of this.statuses) listener(status); }
}

describe('WebexRealtimeProvider', () => {
	it('constructs the synchronized modular Webex messaging SDK surface', async () => {
		const { createWebexSdk } = await import('../src/realtime/createWebexSdk');
		const handle = await createWebexSdk('test-token');
		expect(typeof handle.messages.listen).toBe('function');
		expect(typeof handle.rooms.listen).toBe('function');
		expect(typeof handle.memberships.listen).toBe('function');
	});

	it('stubs callDiagnosticMetrics.setDeviceInfo so device registration cannot crash before the SDK becomes ready', async () => {
		const { stubCallDiagnosticMetrics } = await import('../src/realtime/createWebexSdk');

		// Mirrors the pre-`ready` shape @webex/internal-plugin-metrics leaves in
		// place: `newMetrics` exists, but `callDiagnosticMetrics` does not yet.
		const sdk = { internal: {} } as WebexMessagingSdk;
		stubCallDiagnosticMetrics(sdk);
		expect(() => sdk.internal.newMetrics?.callDiagnosticMetrics?.setDeviceInfo({})).not.toThrow();

		// Once the SDK's `ready` event fires, its real implementation replaces
		// the stub; a second call must not clobber that real instance.
		const real = { setDeviceInfo: () => 'real' };
		sdk.internal.newMetrics!.callDiagnosticMetrics = real;
		stubCallDiagnosticMetrics(sdk);
		expect(sdk.internal.newMetrics?.callDiagnosticMetrics).toBe(real);
	});

	it('converts SDK message events to ID-only reconciliation events', async () => {
		const handle = sdkHandle();
		const provider = new WebexRealtimeProvider({ getToken: () => 'secret', createSdk: async () => handle });
		const events: RealtimeEvent[] = [];
		provider.onEvent((event) => events.push(event));

		await provider.start();
		handle.messages.emit('created', { data: { id: 'message-1', roomId: 'room-1', text: 'not forwarded' } });

		expect(provider.status).toBe('live');
		expect(events).toEqual([{ type: 'message-created', messageId: 'message-1', spaceId: 'room-1' }]);
	});

	it('cleans up a partially initialized SDK before scheduling a reconnect', async () => {
		const handle = sdkHandle();
		handle.rooms.listen.mockRejectedValueOnce(new Error('offline'));
		const schedule = vi.fn(() => 9);
		const provider = new WebexRealtimeProvider({ getToken: () => 'secret', createSdk: async () => handle, setTimeout: schedule });

		await provider.start();

		expect(provider.status).toBe('degraded');
		expect(handle.messages.stopListening).toHaveBeenCalledOnce();
		expect(handle.rooms.stopListening).toHaveBeenCalledOnce();
		expect(handle.memberships.stopListening).toHaveBeenCalledOnce();
		expect(handle.disconnect).toHaveBeenCalledOnce();
		expect(schedule).toHaveBeenCalledWith(expect.any(Function), 2000);
	});
});

describe('ResilientRealtimeProvider', () => {
	it('forwards every fallback event while the primary is not live', async () => {
		const primary = new FakeProvider();
		const fallback = new FakeProvider();
		const provider = new ResilientRealtimeProvider(primary, fallback);
		const events: RealtimeEvent[] = [];
		provider.onEvent((event) => events.push(event));

		await provider.start();
		expect(fallback.start).toHaveBeenCalledOnce();

		primary.setStatus('degraded');
		fallback.emit({ type: 'poll-tick', view: { spaceId: 'room' } });
		fallback.emit({ type: 'refresh-space-list' });
		expect(events).toEqual([{ type: 'poll-tick', view: { spaceId: 'room' } }, { type: 'refresh-space-list' }]);
	});

	// Regression test: the conversation list previously went stale
	// indefinitely once the connection reached "live", because the fallback
	// provider that used to refresh it was stopped entirely at that point,
	// and Webex does not reliably push a live room-updated event just because
	// a message bumped that room's lastActivity — see
	// docs/WEBEX_CAPABILITIES.md, Realtime issue 5.
	it('keeps the fallback running once live, forwarding its conversation-list refresh but suppressing its now-redundant per-conversation poll', async () => {
		const primary = new FakeProvider();
		const fallback = new FakeProvider();
		const provider = new ResilientRealtimeProvider(primary, fallback);
		const events: RealtimeEvent[] = [];
		provider.onEvent((event) => events.push(event));

		await provider.start();
		primary.setStatus('live');
		await Promise.resolve();
		expect(provider.status).toBe('live');
		expect(fallback.stop).not.toHaveBeenCalled();

		fallback.emit({ type: 'poll-tick', view: { spaceId: 'room' } });
		expect(events).toHaveLength(0);

		fallback.emit({ type: 'refresh-space-list' });
		expect(events).toEqual([{ type: 'refresh-space-list' }]);
	});

	it('stops both the primary and the fallback on stop()', async () => {
		const primary = new FakeProvider();
		const fallback = new FakeProvider();
		const provider = new ResilientRealtimeProvider(primary, fallback);

		await provider.start();
		await provider.stop();

		expect(primary.stop).toHaveBeenCalledOnce();
		expect(fallback.stop).toHaveBeenCalledOnce();
		expect(provider.status).toBe('stopped');
	});
});
