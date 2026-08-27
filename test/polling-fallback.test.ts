import { describe, expect, it, vi } from 'vitest';
import { PollingFallback } from '../src/realtime/PollingFallback';
import type { RealtimeEvent } from '../src/realtime/RealtimeProvider';

/** A fake timer registry so tests can assert exactly which interval was scheduled without real timers. */
function fakeTimers() {
	const scheduled = new Map<number, { callback: () => void; ms: number }>();
	let nextId = 1;
	const setInterval = vi.fn((callback: () => void, ms: number) => {
		const id = nextId++;
		scheduled.set(id, { callback, ms });
		return id;
	});
	const clearInterval = vi.fn((id: number) => scheduled.delete(id));
	return { scheduled, setInterval, clearInterval };
}

describe('PollingFallback', () => {
	it('schedules the default 15s/45s cadence when no options are given', async () => {
		const { scheduled, setInterval, clearInterval } = fakeTimers();
		const polling = new PollingFallback({ setInterval, clearInterval });
		await polling.start();
		expect([...scheduled.values()].map((entry) => entry.ms).sort((a, b) => a - b)).toEqual([15_000, 45_000]);
	});

	it('honors custom intervals passed at construction (the "Realtime polling frequency" setting)', async () => {
		const { scheduled, setInterval, clearInterval } = fakeTimers();
		const polling = new PollingFallback({ activeConversationIntervalMs: 10_000, spaceListIntervalMs: 30_000, setInterval, clearInterval });
		await polling.start();
		expect([...scheduled.values()].map((entry) => entry.ms).sort((a, b) => a - b)).toEqual([10_000, 30_000]);
	});

	it('restarts its timers with a new cadence immediately when already running', async () => {
		const { scheduled, setInterval, clearInterval } = fakeTimers();
		const polling = new PollingFallback({ setInterval, clearInterval });
		await polling.start();
		expect(clearInterval).not.toHaveBeenCalled();

		polling.setIntervals(30_000, 90_000);

		expect(clearInterval).toHaveBeenCalledTimes(2); // the two original timers were torn down
		expect([...scheduled.values()].map((entry) => entry.ms).sort((a, b) => a - b)).toEqual([30_000, 90_000]);
	});

	it('applies a new cadence on the next start() without restarting anything, when not currently running', () => {
		const { setInterval, clearInterval } = fakeTimers();
		const polling = new PollingFallback({ setInterval, clearInterval });
		polling.setIntervals(30_000, 90_000);
		expect(clearInterval).not.toHaveBeenCalled();
	});

	it('still emits poll-tick for the active view after its cadence changes', async () => {
		const { setInterval, clearInterval } = fakeTimers();
		const polling = new PollingFallback({ setInterval, clearInterval });
		const events: RealtimeEvent[] = [];
		polling.onEvent((event) => events.push(event));
		polling.setActiveView({ spaceId: 'room' });

		await polling.start();
		polling.setIntervals(10_000, 30_000);

		const activeTimer = [...setInterval.mock.calls].reverse().find(([, ms]) => ms === 10_000);
		activeTimer?.[0]();

		expect(events).toEqual([{ type: 'poll-tick', view: { spaceId: 'room' } }]);
	});
});
