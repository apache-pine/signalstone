import type { ConnectionState } from '../auth/AuthProvider';
import type { MessagesApi } from '../api/MessagesApi';
import type { SpacesApi } from '../api/SpacesApi';
import type { RealtimeEvent, RealtimeProvider, RealtimeStatus } from '../realtime/RealtimeProvider';
import type { Space } from '../models/Space';
import type { WebexMessage } from '../models/Message';
import type { AttachmentsApi, FetchedFileContent } from '../api/AttachmentsApi';
import type { PeopleApi } from '../api/PeopleApi';
import type { Person } from '../models/Person';
import type { MembershipsApi } from '../api/MembershipsApi';
import type { Membership } from '../models/Membership';
import { debugLog } from '../utils/logger';

export interface SignalstoneState {
	connection: ConnectionState;
	realtime: RealtimeStatus;
	realtimeDetail?: string;
	spaces: Space[];
	selectedSpaceId: string | null;
	messages: WebexMessage[];
	threadParentId: string | null;
	threadMessages: WebexMessage[];
	threadReplyCounts: Record<string, number>;
	threadRepliesByParent: Record<string, WebexMessage[]>;
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

	private state: SignalstoneState;
	private listeners = new Set<() => void>();
	private requestGeneration = 0;
	private readonly knownThreadReplies = new Map<string, Map<string, WebexMessage>>();
	private unsubscribeRealtime?: () => void;
	private unsubscribeRealtimeStatus?: () => void;
	/** Previous lastActivity per space, used to detect background activity for notifications. Undefined until after the first load. */
	private lastKnownActivity?: Map<string, string>;

	constructor(
		connection: ConnectionState,
		private readonly spacesApi: Pick<SpacesApi, 'list'>,
		private readonly messagesApi: Pick<MessagesApi, 'list' | 'listReplies' | 'get' | 'create' | 'update' | 'delete'>,
		private readonly realtimeProvider: RealtimeProvider,
		private readonly attachmentsApi: Pick<AttachmentsApi, 'fetch'>,
		private readonly peopleApi: Pick<PeopleApi, 'list'>,
		private readonly membershipsApi: Pick<MembershipsApi, 'list' | 'add' | 'setModerator' | 'remove'>,
	) {
		this.state = { connection, realtime: realtimeProvider.status, realtimeDetail: realtimeProvider.detail, spaces: [], selectedSpaceId: null, messages: [], threadParentId: null, threadMessages: [], threadReplyCounts: {}, threadRepliesByParent: {}, loading: false };
		this.unsubscribeRealtime = realtimeProvider.onEvent((event) => void this.handleRealtime(event));
		this.unsubscribeRealtimeStatus = realtimeProvider.onStatusChange((realtime) => this.patch({ realtime, realtimeDetail: realtimeProvider.detail }));
	}

	getSnapshot = (): SignalstoneState => this.state;
	subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
	setConnection(connection: ConnectionState): void { this.patch({ connection }); }

	async loadSpaces(): Promise<void> {
		this.patch({ loading: true, error: undefined });
		try {
			const page = await this.spacesApi.list({ max: 50 });
			const sorted = page.items.sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity));
			if (this.notify) await this.notifyBackgroundActivity(sorted);
			this.lastKnownActivity = new Map(sorted.map((space) => [space.id, space.lastActivity]));
			this.patch({ spaces: sorted, loading: false });
		} catch (error) { this.patch({ loading: false, error: this.message(error) }); }
	}

	async selectSpace(spaceId: string | null): Promise<void> {
		const generation = ++this.requestGeneration;
		this.realtimeProvider.setActiveView(spaceId ? { spaceId } : null);
		this.knownThreadReplies.clear();
		this.patch({ selectedSpaceId: spaceId, messages: [], threadParentId: null, threadMessages: [], threadReplyCounts: {}, threadRepliesByParent: {}, nextMessagesUrl: undefined, error: undefined });
		if (!spaceId) return;
		this.patch({ loading: true });
		try {
			const page = await this.messagesApi.list({ spaceId, max: 50 });
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

	async send(text: string, file?: File): Promise<void> {
		const spaceId = this.state.selectedSpaceId;
		if (!spaceId || (!text.trim() && !file)) return;
		const outgoing = file ? { filename: file.name, contentType: file.type || 'application/octet-stream', data: await file.arrayBuffer() } : undefined;
		const parentId = this.state.threadParentId ?? undefined;
		const message = await this.messagesApi.create({ spaceId, parentId, text: text.trim() || undefined, markdown: text.trim() || undefined, file: outgoing });
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
		const updated = await this.messagesApi.update(messageId, { spaceId, text: text.trim(), markdown: text.trim() });
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
		const message = await this.messagesApi.create({ ...target, text: text.trim(), markdown: text.trim() });
		await this.loadSpaces();
		if (!this.state.spaces.some((space) => space.id === message.spaceId)) {
			const title = 'id' in recipient ? recipient.displayName : recipient.email;
			this.patch({ spaces: [{ id: message.spaceId, title, type: 'direct', isLocked: false, lastActivity: message.created, creatorId: message.personId, created: message.created }, ...this.state.spaces] });
		}
		await this.selectSpace(message.spaceId);
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
		if (event.type === 'message-deleted') {
			// Not gated on event.spaceId matching the open space (see the canonical-ID
			// note below) — filtering an array for an id it doesn't contain is a
			// harmless no-op, so it's simplest and safest to just always try.
			this.removeKnownThreadReply(event.messageId);
			this.patch({ messages: this.state.messages.filter((message) => message.id !== event.messageId), threadMessages: this.state.threadMessages.filter((message) => message.id !== event.messageId) });
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

	/** Notifies for a top-level message from someone else, in a space that isn't the one currently open. */
	private maybeNotify(message: WebexMessage): void {
		if (message.parentId) return;
		const selfId = this.state.connection.status === 'connected' ? this.state.connection.person.id : undefined;
		if (!selfId || message.personId === selfId) return;
		if (message.spaceId === this.state.selectedSpaceId) return;
		debugLog('store', 'Notifying for background message', { messageId: message.id, spaceId: message.spaceId, hasNotifyHandler: Boolean(this.notify) });
		this.notify?.(message);
	}

	private async refreshMessages(): Promise<void> {
		const spaceId = this.state.selectedSpaceId;
		if (!spaceId) return;
		try {
			if (this.state.threadParentId) { const replies = await this.messagesApi.listReplies(spaceId, this.state.threadParentId); this.recordThreadReplies(replies); this.patch({ threadMessages: this.normalize([...this.state.threadMessages, ...replies]) }); }
			else { const page = await this.messagesApi.list({ spaceId, max: 50 }); this.recordThreadReplies(page.items); this.patch({ messages: this.normalize([...this.state.messages, ...page.items.filter((message) => !message.parentId)]) }); }
		} catch { /* retain memory state offline */ }
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
