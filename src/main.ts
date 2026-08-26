import { Notice, Plugin, requestUrl } from 'obsidian';
import { PersonalTokenAuthProvider } from './auth/PersonalTokenAuthProvider';
import { WebexClient } from './api/WebexClient';
import { PeopleApi } from './api/PeopleApi';
import { SpacesApi } from './api/SpacesApi';
import { MessagesApi } from './api/MessagesApi';
import { MembershipsApi } from './api/MembershipsApi';
import { PollingFallback } from './realtime/PollingFallback';
import { SignalstoneStore } from './services/SignalstoneStore';
import { ConversationService } from './services/ConversationService';
import { SIGNALSTONE_VIEW, SignalstoneView } from './views/SignalstoneView';
import { SignalstoneSettingTab } from './settings/SignalstoneSettingTab';
import { DEFAULT_SETTINGS, type SignalstoneSettings } from './settings/settings';

export default class SignalstonePlugin extends Plugin {
	settings: SignalstoneSettings = DEFAULT_SETTINGS;
	auth!: PersonalTokenAuthProvider;
	private store!: SignalstoneStore;
	private realtime!: PollingFallback;
	private unsubscribeAuth?: () => void;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.buildServices();
		this.registerView(SIGNALSTONE_VIEW, (leaf) => new SignalstoneView(leaf, this.store, () => new Notice('Open Obsidian Settings → Community plugins → Signalstone to configure your token.')));
		this.addRibbonIcon('radio', 'Open Signalstone', () => void this.activateView());
		this.addCommand({ id: 'open-signalstone', name: 'Open Signalstone', callback: () => void this.activateView() });
		this.addCommand({ id: 'refresh-signalstone', name: 'Refresh conversations', callback: () => void this.store.loadSpaces() });
		this.addSettingTab(new SignalstoneSettingTab(this.app, this));
		await this.auth.validate();
	}

	onunload(): void { this.unsubscribeAuth?.(); this.store.destroy(); void this.realtime.stop(); }

	async activateView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(SIGNALSTONE_VIEW)[0];
		if (!leaf) { leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true); await leaf.setViewState({ type: SIGNALSTONE_VIEW, active: true }); }
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> { this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() as Partial<SignalstoneSettings> | null) }; }
	async saveSettings(): Promise<void> { await this.saveData(this.settings); }
	async rebuildConnection(): Promise<void> { this.unsubscribeAuth?.(); this.store.destroy(); await this.realtime.stop(); this.buildServices(); await this.auth.validate(); this.app.workspace.detachLeavesOfType(SIGNALSTONE_VIEW); await this.activateView(); }

	connectionLabel(): string {
		const state = this.auth.state;
		if (state.status === 'connected') return `Connected as ${state.person.displayName}`;
		return ({ 'not-configured': 'Not configured', connecting: 'Connecting…', 'invalid-token': 'Token invalid', unauthorized: 'Token expired or unauthorized', 'network-unavailable': 'Network unavailable' } as Record<string, string>)[state.status] ?? state.status;
	}

	private buildServices(): void {
		const client = new WebexClient({ getToken: () => this.auth?.getToken() ?? this.app.secretStorage.getSecret(this.settings.secretId), requestUrl });
		const people = new PeopleApi(client);
		this.auth = new PersonalTokenAuthProvider(this.app.secretStorage, () => people.getMe(), this.settings.secretId);
		this.realtime = new PollingFallback({ registerInterval: (id) => this.registerInterval(id) });
		const spaces = new SpacesApi(client);
		this.store = new SignalstoneStore(this.auth.state, spaces, new MessagesApi(client), this.realtime, new ConversationService(spaces, new MembershipsApi(client)));
		this.unsubscribeAuth = this.auth.onStateChange((state) => { this.store.setConnection(state); if (state.status === 'connected') { void this.realtime.start(); void this.store.loadSpaces(); } else { void this.realtime.stop(); } });
		this.realtime.start().catch(() => new Notice('Signalstone realtime polling could not start.'));
	}
}
