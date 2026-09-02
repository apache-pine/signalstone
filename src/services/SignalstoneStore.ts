import type { ConnectionState } from '../auth/AuthProvider';
import type { MessagesApi } from '../api/MessagesApi';
import type { SpacesApi } from '../api/SpacesApi';
import type { RealtimeEvent, RealtimeProvider, RealtimeStatus } from '../realtime/RealtimeProvider';
import type { Space } from '../models/Space';
import type { WebexMessage } from '../models/Message';
import type { AttachmentsApi, FetchedFileContent } from '../api/AttachmentsApi';
import type { PeopleApi } from '../api/PeopleApi';
import type { Person, PersonStatus } from '../models/Person';
import type { MembershipsApi } from '../api/MembershipsApi';
import type { Membership } from '../models/Membership';
import type { ReadReceipt } from '../models/ReadReceipt';
import { debugLog } from '../utils/logger';
import { toWebexMarkdown } from '../utils/format';
import { DEFAULT_SETTINGS, type SignalstoneSettings } from '../settings/settings';

/** Avatar/presence for the other person in a direct space, keyed by spaceId. See SignalstoneStore.refreshDirectoryInfo. */
export interface DirectoryInfo {
	avatar?: string;
	status?: PersonStatus;
}

export interface SignalstoneState {
	connection: ConnectionState;
	realtime: RealtimeStatus;
	realtimeDetail?: string;
	settings: SignalstoneSettings;
	spaces: Space[];
	selectedSpaceId: string | null;
	messages: WebexMessage[];
	threadParentId: string | null;
	threadMessages: WebexMessage[];
	threadReplyCounts: Record<string, number>;
	threadRepliesByParent: Record<string, WebexMessage[]>;
	/** Other members' read receipts, by space then by their personId. Receive-only and live-only — see docs/WEBEX_CAPABILITIES.md, "Read/unread state". */
	readReceiptsBySpace: Record<string, Record<string, ReadReceipt>>;
	/** Avatar/presence for direct spaces, by spaceId. Only populated while at least one of the four avatar/presence settings is on. */
	directoryInfoBySpaceId: Record<string, DirectoryInfo>;
	/** Every space the authenticated user has hidden, by spaceId — including ones currently filtered out of `spaces` (see loadSpaces). Always kept current regardless of settings, since it also gates notifications. */
	hiddenSpaceIds: Record<string, boolean>;
	/**
	 * Message ids received in a background space since it was last opened —
	 * local-only, session-only (never persisted; resets to empty on every
	 * launch). Cleared for a space the moment it's opened (see selectSpace);
	 * this is what the conversation list's unread badge reads. Only
	 * populated while settings.trackUnreadMessages is on.
	 */
	unreadMessageIdsBySpace: Record<string, string[]>;
	/**
	 * A snapshot of unreadMessageIdsBySpace taken for the currently open
	 * space at the moment it was opened — stays fixed for the whole viewing
	 * session (does not grow as new messages arrive while open, does not
	 * shrink as you scroll past them), so the "N new messages" divider and
	 * jump button have a stable target regardless of how far you scroll.
	 * Replaced with a fresh snapshot (or cleared to []) every time
	 * selectSpace runs.
	 */
	openedWithUnreadIds: string[];
	nextMessagesUrl?: string;
	loading: boolean;
	error?: string;
}

export class SignalstoneStore {
	/**
	 * Set by the host (main.ts) to receive top-level messages from someone
	 * else, in a space that isn't currently open. The store only decides
	 * *whether an event is notification-worthy*; the host decides whether the
	 * user's notification setting actually wants to see it.
	 */
	notify?: (message: WebexMessage) => void;

	/**
	 * Set by the host (main.ts) to persist a settings change the store itself
	 * initiated (currently just toggleFavorite) — the reverse direction of
	 * setSettings(), which is how the host pushes a Settings-tab change down.
	 * main.ts owns disk persistence; the store only ever holds a working copy.
	 */
	onSettingsChanged?: (settings: SignalstoneSettings) => void;

	private state: SignalstoneState;
	private listeners = new Set<() => void>();
	private requestGeneration = 0;
	private readonly knownThreadReplies = new Map<string, Map<string, WebexMessage>>();
	private unsubscribeRealtime?: () => void;
	private unsubscribeRealtimeStatus?: () => void;
	/** Previous lastActivity per space, used to detect background activity for notifications. Undefined until after the first load. */
	private lastKnownActivity?: Map<string, string>;
	/**
	 * Message ids already passed to maybeNotify, so it stays idempotent no
	 * matter how many independent paths detect the same message -- see
	 * maybeNotify's own comment for why that happens routinely, not just in
	 * rare edge cases. Insertion-ordered so overflow trims the oldest first.
	 */
	private readonly notifiedMessageIds = new Set<string>();
	private static readonly MAX_NOTIFIED_MESSAGE_IDS = 500;
	/** Resolved once per direct space (never changes after) and reused across every refreshDirectoryInfo() cycle, so only unresolved spaces cost an extra membership lookup. */
	private readonly otherPersonIdBySpaceId = new Map<string, string>();

	constructor(
		connection: ConnectionState,
		private readonly spacesApi: Pick<SpacesApi, 'list' | 'create' | 'rename' | 'delete'>,
		private readonly messagesApi: Pick<MessagesApi, 'list' | 'listReplies' | 'get' | 'create' | 'update' | 'delete'>,
		private readonly realtimeProvider: RealtimeProvider,
		private readonly attachmentsApi: Pick<AttachmentsApi, 'fetch'>,
		private readonly peopleApi: Pick<PeopleApi, 'list'>,
		private readonly membershipsApi: Pick<MembershipsApi, 'list' | 'add' | 'setModerator' | 'setHidden' | 'remove'>,
		settings: SignalstoneSettings = DEFAULT_SETTINGS,
	) {
		this.state = { connection, realtime: realtimeProvider.status, realtimeDetail: realtimeProvider.detail, settings, spaces: [], selectedSpaceId: null, messages: [], threadParentId: null, threadMessages: [], threadReplyCounts: {}, threadRepliesByParent: {}, readReceiptsBySpace: {}, directoryInfoBySpaceId: {}, hiddenSpaceIds: {}, unreadMessageIdsBySpace: {}, openedWithUnreadIds: [], loading: false };
		this.unsubscribeRealtime = realtimeProvider.onEvent((event) => void this.handleRealtime(event));
		this.unsubscribeRealtimeStatus = realtimeProvider.onStatusChange((realtime) => this.patch({ realtime, realtimeDetail: realtimeProvider.detail }));
	}

	getSnapshot = (): SignalstoneState => this.state;
	subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
	setConnection(connection: ConnectionState): void { this.patch({ connection }); }
	/**
	 * Pushed by the host (main.ts) whenever the user changes a setting, so the
	 * already-rendered UI reflects it immediately without needing a full
	 * reconnect/remount. If this turns on the first of the four avatar/
	 * presence settings, kicks off an immediate refresh rather than waiting
	 * up to a full space-list-poll interval for data to appear.
	 */
	setSettings(settings: SignalstoneSettings): void {
		const wasEnabled = this.wantsDirectoryInfo(this.state.settings);
		const hiddenVisibilityChanged = settings.showHiddenConversations !== this.state.settings.showHiddenConversations;
		this.patch({ settings });
		if (!wasEnabled && this.wantsDirectoryInfo(settings)) void this.refreshDirectoryInfo();
		// Re-applies the hidden/visible filter immediately rather than waiting
		// for the next natural conversation-list refresh.
		if (hiddenVisibilityChanged) void this.loadSpaces();
	}

	async loadSpaces(): Promise<void> {
		this.patch({ loading: true, error: undefined });
		try {
			const page = await this.spacesApi.list({ max: 50 });
			const sorted = page.items.sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity));
			const hiddenSpaceIds = await this.fetchHiddenSpaceIds();
			const visible = this.state.settings.showHiddenConversations ? sorted : sorted.filter((space) => !hiddenSpaceIds[space.id]);
			if (this.notify) await this.notifyBackgroundActivity(visible);
			this.lastKnownActivity = new Map(sorted.map((space) => [space.id, space.lastActivity]));
			this.patch({ spaces: visible, hiddenSpaceIds, loading: false });
			// Piggybacks on this same refresh cycle (initial load, every
			// refresh-space-list event, and a manual refresh click) rather than
			// running its own timer -- see docs/WEBEX_CAPABILITIES.md, "Avatars
			// and presence".
			void this.refreshDirectoryInfo();
		} catch (error) { this.patch({ loading: false, error: this.message(error) }); }
	}

	/**
	 * A space you've hidden (via Signalstone's own "Hide this conversation" or
	 * another Webex client) still exists as a room and would otherwise appear
	 * unchanged in the list; excluding it here is what actually makes hiding
	 * mean something. `GET /memberships` with no roomId returns only the
	 * authenticated user's own membership across every space in one call
	 * (Webex's documented behavior) -- exactly the isRoomHidden flag needed,
	 * without a per-space request. Best-effort: on failure, keeps whatever was
	 * already known rather than treating everything as suddenly un-hidden.
	 */
	private async fetchHiddenSpaceIds(): Promise<Record<string, boolean>> {
		try {
			const page = await this.membershipsApi.list({ max: 200 });
			const hidden: Record<string, boolean> = {};
			for (const membership of page.items) if (membership.isRoomHidden) hidden[membership.spaceId] = true;
			return hidden;
		} catch (error) {
			debugLog('store', 'Failed to fetch hidden-space status', { error: this.message(error) });
			return this.state.hiddenSpaceIds;
		}
	}

	async selectSpace(spaceId: string | null): Promise<void> {
		const generation = ++this.requestGeneration;
		this.realtimeProvider.setActiveView(spaceId ? { spaceId } : null);
		this.knownThreadReplies.clear();
		// Snapshot whatever was unread for this space into openedWithUnreadIds
		// (the stable, viewing-session-long target for the divider/jump
		// button), then clear the space's own entry immediately -- that's
		// what makes the conversation list's badge disappear right away, the
		// same instant Signalstone considers the space "read".
		const openedWithUnreadIds = spaceId ? (this.state.unreadMessageIdsBySpace[spaceId] ?? []) : [];
		const unreadMessageIdsBySpace = spaceId && openedWithUnreadIds.length > 0 ? { ...this.state.unreadMessageIdsBySpace, [spaceId]: [] } : this.state.unreadMessageIdsBySpace;
		this.patch({ selectedSpaceId: spaceId, messages: [], threadParentId: null, threadMessages: [], threadReplyCounts: {}, threadRepliesByParent: {}, nextMessagesUrl: undefined, error: undefined, openedWithUnreadIds, unreadMessageIdsBySpace });
		if (!spaceId) return;
		this.patch({ loading: true });
		try {
			const page = await this.messagesApi.list({ spaceId, max: this.state.settings.messagePageSize });
			if (generation !== this.requestGeneration) return;
			this.recordThreadReplies(page.items);
			this.patch({ messages: this.normalize(page.items.filter((message) => !message.parentId)), nextMessagesUrl: page.nextUrl, loading: false });
		} catch (error) { if (generation === this.requestGeneration) this.patch({ loading: false, error: this.message(error) }); }
	}

	async loadOlder(): Promise<void> {
		if (!this.state.selectedSpaceId || !this.state.nextMessagesUrl || this.state.loading) return;
		this.patch({ loading: true });
		try {
			const page = await this.messagesApi.list({ spaceId: this.state.selectedSpaceId }, this.state.nextMessagesUrl);
			this.recordThreadReplies(page.items);
			this.patch({ messages: this.normalize([...page.items.filter((message) => !message.parentId), ...this.state.messages]), nextMessagesUrl: page.nextUrl, loading: false });
		} catch (error) { this.patch({ loading: false, error: this.message(error) }); }
	}

	/**
	 * For the jump-to-unread button, when more unread messages arrived than
	 * a single page holds: the earliest one is older than what selectSpace's
	 * initial page fetched, so it isn't loaded yet. Pagination here is
	 * cursor-based (each `nextMessagesUrl` already encodes the page size from
	 * the original request — there's no way to ask a single follow-up call
	 * for a specific larger page), so this repeats the same "Load older
	 * messages" step the button already exposes, automatically, until the
	 * target message is loaded or there's nothing older left to try. Capped
	 * at a handful of pages so a message that's been deleted, or a backlog
	 * far larger than normal, can't spin indefinitely.
	 */
	async loadUntilMessageLoaded(messageId: string): Promise<boolean> {
		const spaceId = this.state.selectedSpaceId;
		const MAX_PAGES = 10;
		for (let i = 0; i < MAX_PAGES; i++) {
			if (this.state.messages.some((message) => message.id === messageId)) return true;
			if (this.state.selectedSpaceId !== spaceId || !this.state.nextMessagesUrl) return false;
			await this.loadOlder();
		}
		return this.state.messages.some((message) => message.id === messageId);
	}

	/** Marks a single conversation fully read without needing to leave and reopen it — clears its live unread set and, if it's the one currently open, the divider/jump-button snapshot too. Local-only, see recordUnreadMessage. */
	markSpaceAsRead(spaceId: string): void {
		const existing = this.state.unreadMessageIdsBySpace[spaceId];
		const unreadMessageIdsBySpace = existing?.length ? { ...this.state.unreadMessageIdsBySpace, [spaceId]: [] } : this.state.unreadMessageIdsBySpace;
		const openedWithUnreadIds = this.state.selectedSpaceId === spaceId ? [] : this.state.openedWithUnreadIds;
		if (unreadMessageIdsBySpace === this.state.unreadMessageIdsBySpace && openedWithUnreadIds === this.state.openedWithUnreadIds) return;
		this.patch({ unreadMessageIdsBySpace, openedWithUnreadIds });
	}

	/** Marks every conversation read at once, from the conversation-list header. Local-only, see recordUnreadMessage. */
	markAllAsRead(): void {
		this.patch({ unreadMessageIdsBySpace: {}, openedWithUnreadIds: [] });
	}

	async send(text: string, file?: File): Promise<void> {
		const spaceId = this.state.selectedSpaceId;
		if (!spaceId || (!text.trim() && !file)) return;
		const outgoing = file ? { filename: file.name, contentType: file.type || 'application/octet-stream', data: await file.arrayBuffer() } : undefined;
		const parentId = this.state.threadParentId ?? undefined;
		const message = await this.messagesApi.create({ spaceId, parentId, text: text.trim() || undefined, markdown: text.trim() ? toWebexMarkdown(text.trim()) : undefined, file: outgoing });
		this.bumpSpaceActivity(message.spaceId, message.created);
		if (parentId) { this.recordThreadReplies([message]); this.patch({ threadMessages: this.normalize([...this.state.threadMessages, message]) }); }
		else this.patch({ messages: this.normalize([...this.state.messages, message]) });
	}

	async openThread(parentId: string): Promise<void> {
		const spaceId = this.state.selectedSpaceId;
		if (!spaceId) return;
		this.realtimeProvider.setActiveView({ spaceId, parentId });
		this.patch({ threadParentId: parentId, threadMessages: [], loading: true, error: undefined });
		try { const replies = await this.messagesApi.listReplies(spaceId, parentId); this.recordThreadReplies(replies); this.patch({ threadMessages: this.normalize(replies), loading: false }); }
		catch (error) { this.patch({ loading: false, error: this.message(error) }); }
	}

	closeThread(): void {
		const spaceId = this.state.selectedSpaceId;
		this.realtimeProvider.setActiveView(spaceId ? { spaceId } : null);
		this.patch({ threadParentId: null, threadMessages: [], error: undefined });
	}

	async editMessage(messageId: string, text: string): Promise<void> {
		const spaceId = this.state.selectedSpaceId;
		if (!spaceId || !text.trim()) return;
		const updated = await this.messagesApi.update(messageId, { spaceId, text: text.trim(), markdown: toWebexMarkdown(text.trim()) });
		this.patch({
			messages: this.state.messages.map((message) => message.id === messageId ? updated : message),
			threadMessages: this.state.threadMessages.map((message) => message.id === messageId ? updated : message),
		});
	}

	async deleteMessage(messageId: string): Promise<void> {
		await this.messagesApi.delete(messageId);
		this.patch({ messages: this.state.messages.filter((message) => message.id !== messageId), threadMessages: this.state.threadMessages.filter((message) => message.id !== messageId) });
	}

	async fetchAttachment(url: string): Promise<FetchedFileContent> { return this.attachmentsApi.fetch(url); }

	async searchPeople(query: string): Promise<Person[]> {
		const trimmed = query.trim();
		if (trimmed.length < 2) return [];
		return this.peopleApi.list(trimmed.includes('@') ? { email: trimmed, max: 10 } : { displayName: trimmed, max: 10 });
	}

	async startDirectMessage(recipient: Pick<Person, 'id' | 'displayName'> | { email: string }, text: string): Promise<void> {
		if (!text.trim()) return;
		const target = 'id' in recipient ? { toPersonId: recipient.id } : { toPersonEmail: recipient.email.trim() };
		const message = await this.messagesApi.create({ ...target, text: text.trim(), markdown: toWebexMarkdown(text.trim()) });
		await this.loadSpaces();
		if (!this.state.spaces.some((space) => space.id === message.spaceId)) {
			const title = 'id' in recipient ? recipient.displayName : recipient.email;
			this.patch({ spaces: [{ id: message.spaceId, title, type: 'direct', isLocked: false, lastActivity: message.created, creatorId: message.personId, created: message.created }, ...this.state.spaces] });
		}
		await this.selectSpace(message.spaceId);
	}

	/**
	 * Creates a new group space and adds the given members by email,
	 * best-effort — a member whose add fails (bad email, not found, etc.) is
	 * reported back rather than silently dropped or aborting the whole
	 * operation, since Webex enforces per-member validity server-side and
	 * Signalstone shouldn't guess at it beforehand. Selects the new space on
	 * success.
	 */
	async createSpace(title: string, memberEmails: string[] = []): Promise<{ space: Space; failedMemberEmails: string[] }> {
		const space = await this.spacesApi.create(title.trim());
		const failedMemberEmails: string[] = [];
		for (const raw of memberEmails) {
			const email = raw.trim();
			if (!email) continue;
			try { await this.membershipsApi.add(space.id, email); }
			catch { failedMemberEmails.push(email); }
		}
		this.patch({ spaces: [space, ...this.state.spaces] });
		await this.selectSpace(space.id);
		return { space, failedMemberEmails };
	}

	async renameSpace(spaceId: string, title: string): Promise<void> {
		const trimmed = title.trim();
		if (!trimmed) return;
		const updated = await this.spacesApi.rename(spaceId, trimmed);
		this.patch({ spaces: this.state.spaces.map((space) => (space.id === spaceId ? updated : space)) });
	}

	/**
	 * Local-only, no API call — see docs/WEBEX_CAPABILITIES.md, "Favorites".
	 * Persisted immediately via onSettingsChanged, the reverse direction of
	 * the usual host-pushes-settings-down flow, since this originates from a
	 * UI action (the row context menu) rather than the Settings tab.
	 */
	toggleFavorite(spaceId: string): void {
		const current = this.state.settings.favoriteSpaceIds;
		const favoriteSpaceIds = current.includes(spaceId) ? current.filter((id) => id !== spaceId) : [...current, spaceId];
		const settings = { ...this.state.settings, favoriteSpaceIds };
		this.patch({ settings });
		this.onSettingsChanged?.(settings);
	}

	/**
	 * Deletes the space if the user is a moderator, or simply leaves it
	 * otherwise (Webex's own semantics for DELETE /rooms/{id} — see
	 * SpacesApi.delete). Scoped to group spaces only in the UI: deleting a
	 * direct space ends the 1:1 conversation for both people, which isn't
	 * the "leave" behavior a Leave button should imply.
	 */
	async leaveSpace(spaceId: string): Promise<void> {
		await this.spacesApi.delete(spaceId);
		this.patch({ spaces: this.state.spaces.filter((space) => space.id !== spaceId) });
		if (this.state.selectedSpaceId === spaceId) await this.selectSpace(null);
	}

	/**
	 * Hides a space from the conversation list without leaving it — fully
	 * reversible via unhideSpace/"Show hidden conversations", so unlike
	 * leaveSpace this needs no confirmation step of its own. Offered in the
	 * UI for both group and direct spaces; the underlying membership flag
	 * isn't documented as direct-space-only, only demonstrated that way in
	 * Cisco's own SDK example — if Webex's server does turn out to reject it
	 * for a group space, that surfaces as a normal thrown error (the
	 * context-menu caller shows it as a Notice) rather than silently no-op'ing.
	 */
	async hideSpace(spaceId: string): Promise<void> {
		const membershipId = await this.selfMembershipId(spaceId);
		if (!membershipId) return;
		await this.membershipsApi.setHidden(membershipId, true);
		this.patch({ spaces: this.state.spaces.filter((space) => space.id !== spaceId), hiddenSpaceIds: { ...this.state.hiddenSpaceIds, [spaceId]: true } });
		if (this.state.selectedSpaceId === spaceId) await this.selectSpace(null);
	}

	/** Only reachable for a space already visible via "Show hidden conversations" — see hideSpace. */
	async unhideSpace(spaceId: string): Promise<void> {
		const membershipId = await this.selfMembershipId(spaceId);
		if (!membershipId) return;
		await this.membershipsApi.setHidden(membershipId, false);
		const hiddenSpaceIds = { ...this.state.hiddenSpaceIds };
		delete hiddenSpaceIds[spaceId];
		this.patch({ hiddenSpaceIds });
	}

	private async selfMembershipId(spaceId: string): Promise<string | undefined> {
		const selfId = this.state.connection.status === 'connected' ? this.state.connection.person.id : undefined;
		try {
			const page = await this.membershipsApi.list({ spaceId, personId: selfId });
			return page.items[0]?.id;
		} catch (error) {
			debugLog('store', 'Failed to resolve own membership id', { spaceId, error: this.message(error) });
			return undefined;
		}
	}

	async listMembers(spaceId: string): Promise<Membership[]> {
		const page = await this.membershipsApi.list({ spaceId, max: 100 });
		return page.items;
	}

	async addMember(spaceId: string, email: string): Promise<Membership> {
		return this.membershipsApi.add(spaceId, email.trim());
	}

	async setModerator(membershipId: string, isModerator: boolean): Promise<Membership> {
		return this.membershipsApi.setModerator(membershipId, isModerator);
	}

	async removeMember(membershipId: string): Promise<void> {
		await this.membershipsApi.remove(membershipId);
	}

	destroy(): void { this.unsubscribeRealtime?.(); this.unsubscribeRealtimeStatus?.(); this.listeners.clear(); }

	private async handleRealtime(event: RealtimeEvent): Promise<void> {
		debugLog('store', `handleRealtime: "${event.type}"`, event);
		if (event.type === 'refresh-space-list') { await this.loadSpaces(); return; }
		if (event.type === 'poll-tick') { if (event.view.spaceId === this.state.selectedSpaceId) await this.refreshMessages(); return; }
		if (event.type === 'memberships-changed') return;
		if (event.type === 'membership-seen') { this.recordReadReceipt(event); return; }
		if (event.type === 'message-deleted') {
			// Not gated on event.spaceId matching the open space (see the canonical-ID
			// note below) — filtering an array for an id it doesn't contain is a
			// harmless no-op, so it's simplest and safest to just always try.
			this.removeKnownThreadReply(event.messageId);
			this.patch({
				messages: this.state.messages.filter((message) => message.id !== event.messageId),
				threadMessages: this.state.threadMessages.filter((message) => message.id !== event.messageId),
				unreadMessageIdsBySpace: this.withoutUnreadMessageId(this.state.unreadMessageIdsBySpace, event.messageId),
				openedWithUnreadIds: this.state.openedWithUnreadIds.filter((id) => id !== event.messageId),
			});
			return;
		}

		// event.spaceId comes from the SDK's realtime payload, which does not
		// reliably use the same room-ID encoding as the REST API (this caused a
		// real bug: the open conversation silently stopped live-updating because
		// this check was comparing an SDK-format id against a REST-format id, so
		// it never matched). REST remains the source of truth — always fetch the
		// canonical message and decide "is this the open conversation" from
		// *its* spaceId, not the event's.
		try {
			const message = await this.messagesApi.get(event.messageId);
			const isOpenSpace = message.spaceId === this.state.selectedSpaceId;
			debugLog('store', `Fetched message for realtime "${event.type}"`, { messageId: message.id, messageSpaceId: message.spaceId, eventSpaceId: event.spaceId, selectedSpaceId: this.state.selectedSpaceId, isOpenSpace, hasParent: Boolean(message.parentId) });
			// Reorder the conversation list immediately from the message itself,
			// rather than waiting on a 'refresh-space-list' event — Webex does not
			// reliably push a room-updated event just because a message bumped
			// that room's lastActivity, so this is the reliable, low-latency path
			// (see docs/WEBEX_CAPABILITIES.md — Realtime, issue 5).
			this.bumpSpaceActivity(message.spaceId, message.created);
			if (!isOpenSpace) {
				this.maybeNotify(message);
				return;
			}
			if (message.parentId) {
				this.recordThreadReplies([message]);
				if (message.parentId === this.state.threadParentId) this.patch({ threadMessages: this.normalize([...this.state.threadMessages.filter((item) => item.id !== message.id), message]) });
			} else this.patch({ messages: this.normalize([...this.state.messages.filter((item) => item.id !== message.id), message]) });
		} catch (error) { debugLog('store', 'Failed to fetch message for realtime event', { messageId: event.messageId, error: this.message(error) }); }
	}

	/**
	 * Detects new activity in spaces other than the one currently open by
	 * diffing `lastActivity`, and fetches just the single newest message (not
	 * the space's history) to decide whether it is genuinely notification-worthy.
	 * Skipped entirely when no notify handler is registered, and on the very
	 * first load (no baseline to diff against yet, which would otherwise
	 * announce every existing space as "new").
	 */
	private async notifyBackgroundActivity(spaces: Space[]): Promise<void> {
		if (!this.lastKnownActivity) return;
		for (const space of spaces) {
			if (space.id === this.state.selectedSpaceId) continue;
			const previous = this.lastKnownActivity.get(space.id);
			if (!previous || Date.parse(space.lastActivity) <= Date.parse(previous)) continue;
			try {
				const page = await this.messagesApi.list({ spaceId: space.id, max: 1 });
				const latest = page.items[0];
				if (latest) this.maybeNotify(latest);
			} catch { /* best effort; the next space-list refresh tries again */ }
		}
	}

	/**
	 * Notifies for, and marks unread, a top-level message from someone else
	 * in a space that isn't the one currently open. Notifications and unread
	 * tracking are independently configurable (a Notice popup and an in-app
	 * badge are different concerns), so each is gated by its own setting
	 * here rather than one implying the other.
	 *
	 * Two independent callers can reach this for the very same message: a
	 * live `message-created` realtime event (handleRealtime), and the
	 * always-on background conversation-list poll (notifyBackgroundActivity,
	 * driven by ResilientRealtimeProvider's `refresh-space-list` events,
	 * which keep arriving even while fully `live` -- see its own doc
	 * comment). The live path typically fires first; the next poll cycle
	 * then sees the same space's `lastActivity` bump and, having no idea the
	 * live path already handled it, reports it as "new" again. Confirmed
	 * live: this doubled the Notice, and, worse, could re-mark a message
	 * unread even after it had already been read and cleared, since
	 * recordUnreadMessage only dedupes against a message still *currently*
	 * unread, not one already resolved. notifiedMessageIds makes this
	 * method itself idempotent per message id, regardless of which path (or
	 * how many) detects it, closing both symptoms at their shared root
	 * rather than patching each call site separately.
	 */
	private maybeNotify(message: WebexMessage): void {
		if (message.parentId) return;
		const selfId = this.state.connection.status === 'connected' ? this.state.connection.person.id : undefined;
		if (!selfId || message.personId === selfId) return;
		if (message.spaceId === this.state.selectedSpaceId) return;
		if (this.state.hiddenSpaceIds[message.spaceId]) return;
		if (this.notifiedMessageIds.has(message.id)) return;
		this.rememberNotifiedMessage(message.id);
		if (this.state.settings.trackUnreadMessages) this.recordUnreadMessage(message.spaceId, message.id);
		debugLog('store', 'Notifying for background message', { messageId: message.id, spaceId: message.spaceId, hasNotifyHandler: Boolean(this.notify) });
		this.notify?.(message);
	}

	private rememberNotifiedMessage(messageId: string): void {
		this.notifiedMessageIds.add(messageId);
		const overflow = this.notifiedMessageIds.size - SignalstoneStore.MAX_NOTIFIED_MESSAGE_IDS;
		if (overflow <= 0) return;
		let removed = 0;
		for (const id of this.notifiedMessageIds) {
			if (removed >= overflow) break;
			this.notifiedMessageIds.delete(id);
			removed++;
		}
	}

	/** Local-only, session-only — see docs/WEBEX_CAPABILITIES.md, "Unread messages". */
	private recordUnreadMessage(spaceId: string, messageId: string): void {
		const existing = this.state.unreadMessageIdsBySpace[spaceId] ?? [];
		if (existing.includes(messageId)) return;
		this.patch({ unreadMessageIdsBySpace: { ...this.state.unreadMessageIdsBySpace, [spaceId]: [...existing, messageId] } });
	}

	/** A deleted message shouldn't keep counting (or showing) as unread. */
	private withoutUnreadMessageId(bySpace: Record<string, string[]>, messageId: string): Record<string, string[]> {
		let changed = false;
		const next: Record<string, string[]> = {};
		for (const [spaceId, ids] of Object.entries(bySpace)) {
			if (ids.includes(messageId)) { changed = true; next[spaceId] = ids.filter((id) => id !== messageId); }
			else next[spaceId] = ids;
		}
		return changed ? next : bySpace;
	}

	private async refreshMessages(): Promise<void> {
		const spaceId = this.state.selectedSpaceId;
		if (!spaceId) return;
		try {
			if (this.state.threadParentId) { const replies = await this.messagesApi.listReplies(spaceId, this.state.threadParentId); this.recordThreadReplies(replies); this.patch({ threadMessages: this.normalize([...this.state.threadMessages, ...replies]) }); }
			else { const page = await this.messagesApi.list({ spaceId, max: this.state.settings.messagePageSize }); this.recordThreadReplies(page.items); this.patch({ messages: this.normalize([...this.state.messages, ...page.items.filter((message) => !message.parentId)]) }); }
		} catch { /* retain memory state offline */ }
	}

	/**
	 * Moves a space to reflect a just-seen message's timestamp, re-sorting
	 * `state.spaces` the same way `loadSpaces()` does. A no-op for a space not
	 * already in the list (e.g. one just created) — that's picked up by the
	 * next full space-list refresh instead — and for a timestamp that isn't
	 * actually newer than what's already recorded (a stale/out-of-order event).
	 */
	private bumpSpaceActivity(spaceId: string, activityAt: string): void {
		const existing = this.state.spaces.find((space) => space.id === spaceId);
		if (!existing || Date.parse(activityAt) <= Date.parse(existing.lastActivity)) return;
		const bumped = this.state.spaces.map((space) => (space.id === spaceId ? { ...space, lastActivity: activityAt } : space));
		bumped.sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity));
		this.patch({ spaces: bumped });
	}

	/**
	 * Records someone else's read receipt from a live 'membership-seen' event.
	 * Ignores the current user's own receipts (Signalstone never sends one, so
	 * one showing up would only mean another of the account's own clients did
	 * — not useful to show "seen by you") and an out-of-order event that's
	 * older than what's already recorded for that person.
	 */
	private recordReadReceipt(event: Extract<RealtimeEvent, { type: 'membership-seen' }>): void {
		const selfId = this.state.connection.status === 'connected' ? this.state.connection.person.id : undefined;
		if (event.personId === selfId) return;
		const bySpace = this.state.readReceiptsBySpace[event.spaceId] ?? {};
		const existing = bySpace[event.personId];
		if (existing && Date.parse(event.seenAt) <= Date.parse(existing.seenAt)) return;
		const receipt: ReadReceipt = { personId: event.personId, personDisplayName: event.personDisplayName, personEmail: event.personEmail, lastSeenMessageId: event.lastSeenMessageId, seenAt: event.seenAt };
		this.patch({ readReceiptsBySpace: { ...this.state.readReceiptsBySpace, [event.spaceId]: { ...bySpace, [event.personId]: receipt } } });
	}

	private wantsDirectoryInfo(settings: SignalstoneSettings): boolean {
		return settings.showAvatarsInRecents || settings.showPresenceInRecents || settings.showAvatarsInConversations || settings.showPresenceInConversations;
	}

	/**
	 * Refreshes avatar/presence for every loaded direct space, best-effort.
	 * No-op entirely unless at least one of the four avatar/presence settings
	 * is on — this never runs, and never costs a single extra request,
	 * otherwise. Two steps: resolve each not-yet-known direct space's other
	 * member (once, cached in otherPersonIdBySpaceId for the store's
	 * lifetime — a direct space's two participants never change), then
	 * batch-fetch avatar/status for every known person id in one People API
	 * call. See docs/WEBEX_CAPABILITIES.md, "Avatars and presence".
	 */
	private async refreshDirectoryInfo(): Promise<void> {
		if (!this.wantsDirectoryInfo(this.state.settings)) return;

		const selfId = this.state.connection.status === 'connected' ? this.state.connection.person.id : undefined;
		const directSpaces = this.state.spaces.filter((space) => space.type === 'direct');
		const unresolved = directSpaces.filter((space) => !this.otherPersonIdBySpaceId.has(space.id));

		await Promise.all(
			unresolved.map(async (space) => {
				try {
					const page = await this.membershipsApi.list({ spaceId: space.id, max: 2 });
					const other = page.items.find((member) => member.personId !== selfId);
					if (other) this.otherPersonIdBySpaceId.set(space.id, other.personId);
				} catch (error) { debugLog('store', 'Failed to resolve the other member of a direct space', { spaceId: space.id, error: this.message(error) }); }
			}),
		);

		const personIds = [...new Set(this.otherPersonIdBySpaceId.values())];
		if (personIds.length === 0) return;

		try {
			const people = await this.peopleApi.list({ ids: personIds });
			const byPersonId = new Map(people.map((person) => [person.id, person]));
			const directoryInfoBySpaceId: Record<string, DirectoryInfo> = {};
			for (const [spaceId, personId] of this.otherPersonIdBySpaceId) {
				const person = byPersonId.get(personId);
				if (person) directoryInfoBySpaceId[spaceId] = { avatar: person.avatar, status: person.status };
			}
			this.patch({ directoryInfoBySpaceId });
		} catch (error) { debugLog('store', 'Failed to batch-fetch avatar/presence', { personCount: personIds.length, error: this.message(error) }); }
	}

	private normalize(messages: WebexMessage[]): WebexMessage[] {
		return [...new Map(messages.map((message) => [message.id, message])).values()].sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
	}

	private recordThreadReplies(messages: WebexMessage[]): void {
		for (const message of messages) {
			if (!message.parentId) continue;
			const replies = this.knownThreadReplies.get(message.parentId) ?? new Map<string, WebexMessage>();
			replies.set(message.id, message);
			this.knownThreadReplies.set(message.parentId, replies);
		}
		this.patch({
			threadReplyCounts: Object.fromEntries([...this.knownThreadReplies].map(([parentId, replies]) => [parentId, replies.size])),
			threadRepliesByParent: Object.fromEntries([...this.knownThreadReplies].map(([parentId, replies]) => [parentId, this.normalize([...replies.values()])])),
		});
	}

	private removeKnownThreadReply(messageId: string): void {
		for (const replies of this.knownThreadReplies.values()) replies.delete(messageId);
		this.patch({
			threadReplyCounts: Object.fromEntries([...this.knownThreadReplies].map(([parentId, replies]) => [parentId, replies.size])),
			threadRepliesByParent: Object.fromEntries([...this.knownThreadReplies].map(([parentId, replies]) => [parentId, this.normalize([...replies.values()])])),
		});
	}

	private patch(patch: Partial<SignalstoneState>): void { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
	private message(error: unknown): string { return typeof error === 'object' && error !== null && 'userMessage' in error ? String(error.userMessage) : 'Unable to load data from Webex.'; }
}
