import { describe, expect, it, vi } from 'vitest';
import { SignalstoneStore } from '../src/services/SignalstoneStore';
import type { RealtimeEvent, RealtimeProvider, RealtimeStatus } from '../src/realtime/RealtimeProvider';
import type { Space } from '../src/models/Space';
import type { WebexMessage } from '../src/models/Message';
import type { Membership } from '../src/models/Membership';
import type { Person } from '../src/models/Person';
import { DEFAULT_SETTINGS } from '../src/settings/settings';

const space = (title: string): Space => ({ id: 'room', title, type: 'group', isLocked: false, lastActivity: '2026-01-01T00:00:00Z', creatorId: 'me', created: '2026-01-01T00:00:00Z' });
const directSpace = (title: string): Space => ({ ...space(title), type: 'direct' });
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

function createStore(list: () => Promise<{ items: Space[]; nextUrl?: string }>, settings = DEFAULT_SETTINGS) {
	const messages = { list: vi.fn(async (): Promise<{ items: WebexMessage[]; nextUrl?: string }> => ({ items: [], nextUrl: undefined })), listReplies: vi.fn(async (): Promise<WebexMessage[]> => []), get: vi.fn(async () => message()), create: vi.fn(async (input: { parentId?: string }) => message({ parentId: input.parentId })), update: vi.fn(async (_id: string, input: { text?: string }) => message({ text: input.text, isEdited: true })), delete: vi.fn(async () => undefined) };
	const memberships = { list: vi.fn(async (): Promise<{ items: Membership[]; nextUrl?: string }> => ({ items: [membership()], nextUrl: undefined })), add: vi.fn(async (spaceId: string, personEmail: string) => membership({ id: 'new', personEmail, spaceId })), setModerator: vi.fn(async (id: string, isModerator: boolean) => membership({ id, isModerator })), remove: vi.fn(async () => undefined) };
	const realtime = new FakeRealtime();
	const spaces = { list, create: vi.fn(async (title: string) => space(title)), rename: vi.fn(async (spaceId: string, title: string) => ({ ...space(title), id: spaceId })), delete: vi.fn(async () => undefined) };
	const people = { list: vi.fn(async (): Promise<Person[]> => []) };
	const store = new SignalstoneStore(
		{ status: 'connected', person: { id: 'me', displayName: 'Me', emails: [] } },
		spaces, messages, realtime,
		{ fetch: vi.fn() },
		people,
		memberships,
		settings,
	);
	return { store, messages, memberships, realtime, spaces, people };
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

	it('creates a space, adds members best-effort, and selects the new space', async () => {
		const { store, memberships, spaces } = createStore(async () => ({ items: [], nextUrl: undefined }));
		memberships.add.mockRejectedValueOnce(new Error('not found')).mockResolvedValueOnce(membership({ id: 'new', personEmail: 'good@example.com' }));

		const result = await store.createSpace('  Project Room  ', ['bad@example.com', 'good@example.com']);

		expect(spaces.create).toHaveBeenCalledWith('Project Room');
		expect(memberships.add).toHaveBeenCalledWith('room', 'bad@example.com');
		expect(memberships.add).toHaveBeenCalledWith('room', 'good@example.com');
		expect(result.failedMemberEmails).toEqual(['bad@example.com']);
		expect(result.space.title).toBe('Project Room');
		expect(store.getSnapshot().spaces.map((item) => item.title)).toContain('Project Room');
		expect(store.getSnapshot().selectedSpaceId).toBe('room');
	});

	it('renames a space in place without disturbing its position', async () => {
		const { store } = createStore(async () => ({ items: [space('Old name')], nextUrl: undefined }));
		await store.loadSpaces();

		await store.renameSpace('room', 'New name');

		expect(store.getSnapshot().spaces).toEqual([{ ...space('Old name'), title: 'New name' }]);
	});

	it('leaves a space, removing it from the list and returning to it if it was open', async () => {
		const { store, spaces } = createStore(async () => ({ items: [space('Room')], nextUrl: undefined }));
		await store.loadSpaces();
		await store.selectSpace('room');

		await store.leaveSpace('room');

		expect(spaces.delete).toHaveBeenCalledWith('room');
		expect(store.getSnapshot().spaces).toEqual([]);
		expect(store.getSnapshot().selectedSpaceId).toBeNull();
	});

	it('never resolves or fetches avatar/presence when none of the four settings are on', async () => {
		const { store, memberships, people } = createStore(async () => ({ items: [directSpace('Alex')], nextUrl: undefined }));
		await store.loadSpaces();

		expect(people.list).not.toHaveBeenCalled();
		expect(memberships.list).not.toHaveBeenCalled();
		expect(store.getSnapshot().directoryInfoBySpaceId).toEqual({});
	});

	it('resolves the other member of a direct space and populates avatar/presence, once a setting is on', async () => {
		const { store, memberships, people } = createStore(async () => ({ items: [directSpace('Alex')], nextUrl: undefined }), { ...DEFAULT_SETTINGS, showPresenceInRecents: true });
		memberships.list.mockResolvedValueOnce({ items: [membership({ personId: 'me', personEmail: 'me@example.com' }), membership({ personId: 'them', personEmail: 'them@example.com' })], nextUrl: undefined });
		people.list.mockResolvedValueOnce([{ id: 'them', emails: ['them@example.com'], displayName: 'Alex', avatar: 'https://example.com/avatar.jpg', orgId: 'org', type: 'person' as const, status: 'active' as const }]);

		// refreshDirectoryInfo runs fire-and-forget (loadSpaces() does not await
		// it, so the space list itself never waits on it) -- flush to let its
		// own membership-then-people chain actually finish before asserting.
		await store.loadSpaces();
		await flushMicrotasks();

		expect(memberships.list).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'room' }));
		expect(people.list).toHaveBeenCalledWith({ ids: ['them'] });
		expect(store.getSnapshot().directoryInfoBySpaceId.room).toEqual({ avatar: 'https://example.com/avatar.jpg', status: 'active' });
	});

	it('caches the resolved other-member id, so a later refresh only re-fetches presence, not membership', async () => {
		const { store, memberships, people } = createStore(async () => ({ items: [directSpace('Alex')], nextUrl: undefined }), { ...DEFAULT_SETTINGS, showPresenceInRecents: true });
		memberships.list.mockResolvedValue({ items: [membership({ personId: 'me' }), membership({ personId: 'them' })], nextUrl: undefined });
		people.list.mockResolvedValue([{ id: 'them', emails: [], displayName: 'Alex', orgId: 'org', type: 'person' as const, status: 'meeting' as const }]);

		await store.loadSpaces();
		await flushMicrotasks();
		await store.loadSpaces();
		await flushMicrotasks();

		expect(memberships.list).toHaveBeenCalledOnce();
		expect(people.list).toHaveBeenCalledTimes(2);
	});

	it('refreshes immediately when setSettings newly turns on an avatar/presence setting, without waiting for the next space-list load', async () => {
		const { store, memberships, people } = createStore(async () => ({ items: [directSpace('Alex')], nextUrl: undefined }));
		await store.loadSpaces(); // baseline: nothing enabled yet
		memberships.list.mockResolvedValueOnce({ items: [membership({ personId: 'me' }), membership({ personId: 'them' })], nextUrl: undefined });
		people.list.mockResolvedValueOnce([{ id: 'them', emails: [], displayName: 'Alex', orgId: 'org', type: 'person' as const, status: 'call' as const }]);

		store.setSettings({ ...DEFAULT_SETTINGS, showAvatarsInConversations: true });
		await flushMicrotasks();

		expect(people.list).toHaveBeenCalledOnce();
		expect(store.getSnapshot().directoryInfoBySpaceId.room?.status).toBe('call');
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

	it('requests messages using the configured page size, both on initial load and on a background refresh', async () => {
		const { store, messages } = createStore(async () => ({ items: [], nextUrl: undefined }), { ...DEFAULT_SETTINGS, messagePageSize: 200 });
		await store.selectSpace('room');
		expect(messages.list).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'room', max: 200 }));
	});

	it('reorders the conversation list immediately from a realtime event, without waiting for a refresh-space-list event', async () => {
		// Regression test: this used to only happen via a 'refresh-space-list'
		// event, which (once the connection reaches "live") stops arriving
		// reliably for ordinary message activity — see
		// docs/WEBEX_CAPABILITIES.md, Realtime issue 5.
		const { store, messages, realtime } = createStore(async () => ({
			items: [space('Older'), { ...space('Newer'), id: 'newer-room', lastActivity: '2025-12-31T00:00:00Z' }],
			nextUrl: undefined,
		}));
		await store.loadSpaces();
		expect(store.getSnapshot().spaces.map((item) => item.id)).toEqual(['room', 'newer-room']);

		messages.get.mockResolvedValueOnce(message({ id: 'bump', spaceId: 'newer-room', personId: 'them', created: '2026-01-05T00:00:00Z' }));
		realtime.emit({ type: 'message-created', spaceId: 'newer-room', messageId: 'bump' });
		await flushMicrotasks();

		const spaces = store.getSnapshot().spaces;
		expect(spaces.map((item) => item.id)).toEqual(['newer-room', 'room']);
		expect(spaces.find((item) => item.id === 'newer-room')?.lastActivity).toBe('2026-01-05T00:00:00Z');
	});

	it('does not reorder a space that is not already loaded, since a full refresh handles that case instead', async () => {
		const { store, messages, realtime } = createStore(async () => ({ items: [space('Room')], nextUrl: undefined }));
		await store.loadSpaces();

		messages.get.mockResolvedValueOnce(message({ id: 'unknown-space-message', spaceId: 'brand-new-room', personId: 'them' }));
		realtime.emit({ type: 'message-created', spaceId: 'brand-new-room', messageId: 'unknown-space-message' });
		await flushMicrotasks();

		expect(store.getSnapshot().spaces.map((item) => item.id)).toEqual(['room']);
	});

	it('records a read receipt from a live membership-seen event, keyed by space then by person', async () => {
		const { store, realtime } = createStore(async () => ({ items: [], nextUrl: undefined }));
		realtime.emit({ type: 'membership-seen', spaceId: 'room', personId: 'them', personDisplayName: 'Anthony Perez', personEmail: 'anthony@example.com', lastSeenMessageId: 'message-1', seenAt: '2026-01-01T00:00:00Z' });

		expect(store.getSnapshot().readReceiptsBySpace.room?.them).toEqual({
			personId: 'them',
			personDisplayName: 'Anthony Perez',
			personEmail: 'anthony@example.com',
			lastSeenMessageId: 'message-1',
			seenAt: '2026-01-01T00:00:00Z',
		});
	});

	it('ignores the current user\'s own read receipt, since Signalstone never sends one itself', async () => {
		const { store, realtime } = createStore(async () => ({ items: [], nextUrl: undefined }));
		realtime.emit({ type: 'membership-seen', spaceId: 'room', personId: 'me', personEmail: 'me@example.com', lastSeenMessageId: 'message-1', seenAt: '2026-01-01T00:00:00Z' });

		expect(store.getSnapshot().readReceiptsBySpace.room).toBeUndefined();
	});

	it('replaces a stale receipt with a newer one, but ignores an out-of-order older one', async () => {
		const { store, realtime } = createStore(async () => ({ items: [], nextUrl: undefined }));
		realtime.emit({ type: 'membership-seen', spaceId: 'room', personId: 'them', personEmail: 'them@example.com', lastSeenMessageId: 'message-1', seenAt: '2026-01-01T00:00:00Z' });
		realtime.emit({ type: 'membership-seen', spaceId: 'room', personId: 'them', personEmail: 'them@example.com', lastSeenMessageId: 'message-2', seenAt: '2026-01-02T00:00:00Z' });
		expect(store.getSnapshot().readReceiptsBySpace.room?.them?.lastSeenMessageId).toBe('message-2');

		realtime.emit({ type: 'membership-seen', spaceId: 'room', personId: 'them', personEmail: 'them@example.com', lastSeenMessageId: 'stale-message', seenAt: '2025-12-31T00:00:00Z' });
		expect(store.getSnapshot().readReceiptsBySpace.room?.them?.lastSeenMessageId).toBe('message-2');
	});

	it('exposes the initial settings on state and lets the host push updated settings live', async () => {
		const { store } = createStore(async () => ({ items: [], nextUrl: undefined }));
		expect(store.getSnapshot().settings).toEqual(DEFAULT_SETTINGS);

		const updated = { ...DEFAULT_SETTINGS, messageDensity: 'compact' as const };
		store.setSettings(updated);
		expect(store.getSnapshot().settings).toEqual(updated);
	});
});
