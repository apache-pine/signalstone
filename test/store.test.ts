import { describe, expect, it, vi } from 'vitest';
import { SignalstoneStore } from '../src/services/SignalstoneStore';
import type { RealtimeEvent, RealtimeProvider, RealtimeStatus } from '../src/realtime/RealtimeProvider';
import type { Space } from '../src/models/Space';
import type { WebexMessage } from '../src/models/Message';
import type { Membership } from '../src/models/Membership';

const space = (title: string): Space => ({ id: 'room', title, type: 'group', isLocked: false, lastActivity: '2026-01-01T00:00:00Z', creatorId: 'me', created: '2026-01-01T00:00:00Z' });
const message = (overrides: Partial<WebexMessage> = {}): WebexMessage => ({ id: 'message', spaceId: 'room', spaceType: 'group', personId: 'me', personEmail: 'me@example.com', text: 'Hello', created: '2026-01-01T00:00:00Z', isEdited: false, ...overrides });
const membership = (overrides: Partial<Membership> = {}): Membership => ({ id: 'membership', spaceId: 'room', personId: 'them', personEmail: 'them@example.com', personDisplayName: 'Them', isModerator: false, isMonitor: false, created: '2026-01-01T00:00:00Z', ...overrides });

class FakeRealtime implements RealtimeProvider {
	status: RealtimeStatus = 'degraded';
	private readonly listeners = new Set<(event: RealtimeEvent) => void>();
	async start(): Promise<void> {} async stop(): Promise<void> {} setActiveView(): void {}
	onEvent(listener: (event: RealtimeEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
	onStatusChange(): () => void { return () => undefined; }
	emit(event: RealtimeEvent): void { for (const listener of this.listeners) listener(event); }
}

const flushMicrotasks = () => new Promise((resolve) => window.setTimeout(resolve, 0));

function createStore(list: () => Promise<{ items: Space[]; nextUrl?: string }>) {
	const messages = { list: vi.fn(async (): Promise<{ items: WebexMessage[]; nextUrl?: string }> => ({ items: [], nextUrl: undefined })), listReplies: vi.fn(async (): Promise<WebexMessage[]> => []), get: vi.fn(async () => message()), create: vi.fn(async (input: { parentId?: string }) => message({ parentId: input.parentId })), update: vi.fn(async (_id: string, input: { text?: string }) => message({ text: input.text, isEdited: true })), delete: vi.fn(async () => undefined) };
	const memberships = { list: vi.fn(async (): Promise<{ items: Membership[]; nextUrl?: string }> => ({ items: [membership()], nextUrl: undefined })), add: vi.fn(async (spaceId: string, personEmail: string) => membership({ id: 'new', personEmail, spaceId })), setModerator: vi.fn(async (id: string, isModerator: boolean) => membership({ id, isModerator })), remove: vi.fn(async () => undefined) };
	const realtime = new FakeRealtime();
	const store = new SignalstoneStore(
		{ status: 'connected', person: { id: 'me', displayName: 'Me', emails: [] } },
		{ list }, messages, realtime,
		{ fetch: vi.fn() },
		{ list: vi.fn(async () => []) },
		memberships,
	);
	return { store, messages, memberships, realtime };
}

describe('SignalstoneStore', () => {
	it('loads a thread and sends replies with parentId', async () => {
		const { store, messages } = createStore(async () => ({ items: [space('Space')], nextUrl: undefined }));
		await store.selectSpace('room'); await store.openThread('parent'); await store.send('Reply');
		expect(messages.listReplies).toHaveBeenCalledWith('room', 'parent');
		expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'room', parentId: 'parent', text: 'Reply' }));
	});

	it('reconciles an edited message in local state', async () => {
		const { store, messages } = createStore(async () => ({ items: [], nextUrl: undefined }));
		await store.selectSpace('room'); await store.editMessage('message', 'Updated');
		expect(messages.update).toHaveBeenCalledWith('message', expect.objectContaining({ spaceId: 'room', text: 'Updated' }));
	});

	it('keeps replies out of the main timeline and exposes a thread count', async () => {
		const { store, messages } = createStore(async () => ({ items: [], nextUrl: undefined }));
		messages.list.mockResolvedValueOnce({ items: [message({ id: 'parent' }), message({ id: 'reply', parentId: 'parent' })], nextUrl: undefined });
		await store.selectSpace('room');
		expect(store.getSnapshot().messages.map((item) => item.id)).toEqual(['parent']);
		expect(store.getSnapshot().threadReplyCounts.parent).toBe(1);
		expect(store.getSnapshot().threadRepliesByParent.parent?.[0]?.id).toBe('reply');
	});

	it('starts a direct message using an exact email fallback', async () => {
		const { store, messages } = createStore(async () => ({ items: [space('New DM')], nextUrl: undefined }));
		await store.startDirectMessage({ email: 'alex@example.com' }, 'Hello Alex');
		expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ toPersonEmail: 'alex@example.com', text: 'Hello Alex' }));
		expect(store.getSnapshot().selectedSpaceId).toBe('room');
	});

	it('lists, adds, promotes, and removes space members through the memberships API', async () => {
		const { store, memberships } = createStore(async () => ({ items: [], nextUrl: undefined }));

		const members = await store.listMembers('room');
		expect(memberships.list).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'room' }));
		expect(members).toHaveLength(1);

		await store.addMember('room', '  new@example.com  ');
		expect(memberships.add).toHaveBeenCalledWith('room', 'new@example.com');

		await store.setModerator('membership', true);
		expect(memberships.setModerator).toHaveBeenCalledWith('membership', true);

		await store.removeMember('membership');
		expect(memberships.remove).toHaveBeenCalledWith('membership');
	});

	it('notifies about new background-space activity, but never on the first load and never for the user\'s own message', async () => {
		const listSpaces = vi
			.fn()
			.mockResolvedValueOnce({ items: [space('Room A')], nextUrl: undefined })
			.mockResolvedValueOnce({ items: [{ ...space('Room A'), lastActivity: '2026-01-02T00:00:00Z' }], nextUrl: undefined })
			.mockResolvedValueOnce({ items: [{ ...space('Room A'), lastActivity: '2026-01-03T00:00:00Z' }], nextUrl: undefined });
		const { store, messages } = createStore(listSpaces);
		const notified: WebexMessage[] = [];
		store.notify = (item) => notified.push(item);

		await store.loadSpaces(); // establishes the baseline; must not notify
		expect(notified).toHaveLength(0);

		messages.list.mockResolvedValueOnce({ items: [message({ id: 'own', personId: 'me' })], nextUrl: undefined });
		await store.loadSpaces(); // lastActivity moved forward, but the message is the user's own
		expect(notified).toHaveLength(0);

		messages.list.mockResolvedValueOnce({ items: [message({ id: 'theirs', personId: 'them' })], nextUrl: undefined });
		await store.loadSpaces(); // lastActivity moved forward again, this time from someone else
		expect(notified.map((item) => item.id)).toEqual(['theirs']);
	});

	it('notifies for a realtime message-created event in a background space, but not for the currently open one', async () => {
		const { store, messages, realtime } = createStore(async () => ({ items: [], nextUrl: undefined }));
		await store.selectSpace('room');
		const notified: WebexMessage[] = [];
		store.notify = (item) => notified.push(item);

		messages.get.mockResolvedValueOnce(message({ id: 'open-space', spaceId: 'room', personId: 'them' }));
		realtime.emit({ type: 'message-created', spaceId: 'room', messageId: 'open-space' });
		await flushMicrotasks();
		expect(notified).toHaveLength(0);

		messages.get.mockResolvedValueOnce(message({ id: 'background', spaceId: 'other-room', personId: 'them' }));
		realtime.emit({ type: 'message-created', spaceId: 'other-room', messageId: 'background' });
		await flushMicrotasks();
		expect(notified.map((item) => item.id)).toEqual(['background']);
	});

	it('live-updates the open conversation even when the realtime event uses a different room-id encoding than REST', async () => {
		// Regression test: the Webex SDK's realtime payloads do not reliably use
		// the same room-id encoding as the REST API. event.spaceId below
		// ('sdk-internal-room-id') intentionally differs from the id Signalstone
		// itself uses everywhere else ('room', from selectSpace/REST) — the fix
		// must key off the freshly-fetched message's own (REST-canonical)
		// spaceId, not the event's, or the open conversation silently stops
		// live-updating.
		const { store, messages, realtime } = createStore(async () => ({ items: [], nextUrl: undefined }));
		await store.selectSpace('room');
		const notified: WebexMessage[] = [];
		store.notify = (item) => notified.push(item);

		messages.get.mockResolvedValueOnce(message({ id: 'live-one', spaceId: 'room', personId: 'them', text: 'Hi' }));
		realtime.emit({ type: 'message-created', spaceId: 'sdk-internal-room-id', messageId: 'live-one' });
		await flushMicrotasks();

		expect(store.getSnapshot().messages.map((item) => item.id)).toContain('live-one');
		expect(notified).toHaveLength(0);
	});
});
