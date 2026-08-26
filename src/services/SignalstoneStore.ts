import type { ConnectionState } from '../auth/AuthProvider';
import type { MessagesApi } from '../api/MessagesApi';
import type { SpacesApi } from '../api/SpacesApi';
import type { RealtimeEvent, RealtimeProvider, RealtimeStatus } from '../realtime/RealtimeProvider';
import type { Space } from '../models/Space';
import type { WebexMessage } from '../models/Message';
import type { ConversationService } from './ConversationService';

export interface SignalstoneState {
	connection: ConnectionState;
	realtime: RealtimeStatus;
	spaces: Space[];
	selectedSpaceId: string | null;
	messages: WebexMessage[];
	nextMessagesUrl?: string;
	loading: boolean;
	error?: string;
}

export class SignalstoneStore {
	private state: SignalstoneState;
	private listeners = new Set<() => void>();
	private requestGeneration = 0;
	private unsubscribeRealtime?: () => void;

	constructor(
		connection: ConnectionState,
		private readonly spacesApi: SpacesApi,
		private readonly messagesApi: MessagesApi,
		private readonly realtimeProvider: RealtimeProvider,
		private readonly conversationService: ConversationService,
	) {
		this.state = { connection, realtime: realtimeProvider.status, spaces: [], selectedSpaceId: null, messages: [], loading: false };
		this.unsubscribeRealtime = realtimeProvider.onEvent((event) => void this.handleRealtime(event));
		realtimeProvider.onStatusChange((realtime) => this.patch({ realtime }));
	}

	getSnapshot = (): SignalstoneState => this.state;
	subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
	setConnection(connection: ConnectionState): void { this.patch({ connection }); }

	async loadSpaces(): Promise<void> {
		this.patch({ loading: true, error: undefined });
		try {
			const page = await this.spacesApi.list({ max: 50 });
			const sorted = page.items.sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity));
			this.patch({ spaces: sorted, loading: false });
			if (this.state.connection.status === 'connected') {
				const enriched = await this.conversationService.enrich(sorted, this.state.connection.person.id);
				this.patch({ spaces: enriched });
			}
		} catch (error) { this.patch({ loading: false, error: this.message(error) }); }
	}

	async selectSpace(spaceId: string | null): Promise<void> {
		const generation = ++this.requestGeneration;
		this.realtimeProvider.setActiveView(spaceId ? { spaceId } : null);
		this.patch({ selectedSpaceId: spaceId, messages: [], nextMessagesUrl: undefined, error: undefined });
		if (!spaceId) return;
		this.patch({ loading: true });
		try {
			const page = await this.messagesApi.list({ spaceId, max: 50 });
			if (generation !== this.requestGeneration) return;
			this.patch({ messages: this.normalize(page.items), nextMessagesUrl: page.nextUrl, loading: false });
		} catch (error) { if (generation === this.requestGeneration) this.patch({ loading: false, error: this.message(error) }); }
	}

	async loadOlder(): Promise<void> {
		if (!this.state.selectedSpaceId || !this.state.nextMessagesUrl || this.state.loading) return;
		this.patch({ loading: true });
		try {
			const page = await this.messagesApi.list({ spaceId: this.state.selectedSpaceId }, this.state.nextMessagesUrl);
			this.patch({ messages: this.normalize([...page.items, ...this.state.messages]), nextMessagesUrl: page.nextUrl, loading: false });
		} catch (error) { this.patch({ loading: false, error: this.message(error) }); }
	}

	async send(text: string, file?: File): Promise<void> {
		const spaceId = this.state.selectedSpaceId;
		if (!spaceId || (!text.trim() && !file)) return;
		const outgoing = file ? { filename: file.name, contentType: file.type || 'application/octet-stream', data: await file.arrayBuffer() } : undefined;
		const message = await this.messagesApi.create({ spaceId, text: text.trim() || undefined, markdown: text.trim() || undefined, file: outgoing });
		this.patch({ messages: this.normalize([...this.state.messages, message]) });
	}

	async deleteMessage(messageId: string): Promise<void> {
		await this.messagesApi.delete(messageId);
		this.patch({ messages: this.state.messages.filter((message) => message.id !== messageId) });
	}

	destroy(): void { this.unsubscribeRealtime?.(); this.listeners.clear(); }

	private async handleRealtime(event: RealtimeEvent): Promise<void> {
		if (event.type === 'refresh-space-list') { await this.loadSpaces(); return; }
		if (event.type === 'poll-tick') { if (event.view.spaceId === this.state.selectedSpaceId) await this.refreshMessages(); return; }
		if (event.type === 'memberships-changed') return;
		if (event.spaceId !== this.state.selectedSpaceId) return;
		if (event.type === 'message-deleted') { this.patch({ messages: this.state.messages.filter((message) => message.id !== event.messageId) }); return; }
		try {
			const message = await this.messagesApi.get(event.messageId);
			this.patch({ messages: this.normalize([...this.state.messages.filter((item) => item.id !== message.id), message]) });
		} catch { /* A later poll reconciles transient event-fetch failures. */ }
	}

	private async refreshMessages(): Promise<void> {
		const spaceId = this.state.selectedSpaceId;
		if (!spaceId) return;
		try { const page = await this.messagesApi.list({ spaceId, max: 50 }); this.patch({ messages: this.normalize([...this.state.messages, ...page.items]) }); } catch { /* retain memory state offline */ }
	}

	private normalize(messages: WebexMessage[]): WebexMessage[] {
		return [...new Map(messages.map((message) => [message.id, message])).values()].sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
	}

	private patch(patch: Partial<SignalstoneState>): void { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
	private message(error: unknown): string { return typeof error === 'object' && error !== null && 'userMessage' in error ? String(error.userMessage) : 'Unable to load data from Webex.'; }
}
