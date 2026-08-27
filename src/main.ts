import { Notice, Plugin, requestUrl } from 'obsidian';
import { PersonalTokenAuthProvider } from './auth/PersonalTokenAuthProvider';
import { WebexClient } from './api/WebexClient';
import { PeopleApi } from './api/PeopleApi';
import { SpacesApi } from './api/SpacesApi';
import { MessagesApi } from './api/MessagesApi';
import { AttachmentsApi } from './api/AttachmentsApi';
import { MembershipsApi } from './api/MembershipsApi';
import { PollingFallback } from './realtime/PollingFallback';
import { WebexRealtimeProvider } from './realtime/WebexRealtimeProvider';
import { ResilientRealtimeProvider } from './realtime/ResilientRealtimeProvider';
import { createWebexSdk } from './realtime/createWebexSdk';
import { installRequestUrlXhrShim } from './realtime/RequestUrlXhrShim';
import type { RealtimeProvider } from './realtime/RealtimeProvider';
import { SignalstoneStore } from './services/SignalstoneStore';
import { SIGNALSTONE_VIEW, SignalstoneView } from './views/SignalstoneView';
import { SignalstoneSettingTab } from './settings/SignalstoneSettingTab';
import { DEFAULT_SETTINGS, POLLING_FREQUENCY_MS, type SignalstoneSettings } from './settings/settings';
import type { WebexMessage } from './models/Message';
import { debugLog, setDebugLogging } from './utils/logger';
import { resolveSenderName } from './utils/format';

export default class SignalstonePlugin extends Plugin {
	settings: SignalstoneSettings = DEFAULT_SETTINGS;
	auth!: PersonalTokenAuthProvider;
	private store!: SignalstoneStore;
	private realtime!: RealtimeProvider;
	private pollingFallback!: PollingFallback;
	private unsubscribeAuth?: () => void;
	private uninstallXhrShim?: () => void;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applyDebugLogging();
		// Must be installed before any Webex SDK instance exists (createSdk is
		// only actually called after auth succeeds, but this keeps the two
		// concerns cleanly ordered regardless of connection state).
		this.uninstallXhrShim = installRequestUrlXhrShim(requestUrl);
		this.buildServices();
		this.registerView(SIGNALSTONE_VIEW, (leaf) => new SignalstoneView(leaf, this.store, () => new Notice('Open Obsidian settings → community plugins → Signalstone to configure your token.')));
		this.addRibbonIcon('radio', 'Open Signalstone', () => void this.activateView());
		this.addCommand({ id: 'open', name: 'Open', callback: () => void this.activateView() });
		this.addCommand({ id: 'refresh', name: 'Refresh conversations', callback: () => void this.store.loadSpaces() });
		this.addSettingTab(new SignalstoneSettingTab(this.app, this));
		await this.auth.validate();
		if (this.settings.openOnStartup) await this.activateView();
	}

	onunload(): void { this.unsubscribeAuth?.(); this.store.destroy(); void this.realtime.stop(); this.uninstallXhrShim?.(); }

	async activateView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(SIGNALSTONE_VIEW)[0];
		if (!leaf) {
			const side = this.settings.sidebarSide === 'left' ? this.app.workspace.getLeftLeaf(false) : this.app.workspace.getRightLeaf(false);
			leaf = side ?? this.app.workspace.getLeaf(true);
			await leaf.setViewState({ type: SIGNALSTONE_VIEW, active: true });
		}
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> { this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() as Partial<SignalstoneSettings> | null) }; }
	async saveSettings(): Promise<void> { await this.saveData(this.settings); }
	applyDebugLogging(): void { setDebugLogging(this.settings.debugLogging); }
	/** Pushes the current settings to already-rendered UI and, for polling frequency, the running fallback provider — without disturbing the connection or the open view. */
	applyLiveSettings(): void {
		this.store.setSettings(this.settings);
		this.pollingFallback.setIntervals(POLLING_FREQUENCY_MS[this.settings.pollingFrequency].activeConversationIntervalMs, POLLING_FREQUENCY_MS[this.settings.pollingFrequency].spaceListIntervalMs);
	}
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
		const pollingIntervals = POLLING_FREQUENCY_MS[this.settings.pollingFrequency];
		this.pollingFallback = new PollingFallback({ ...pollingIntervals, registerInterval: (id) => this.registerInterval(id) });
		const webexRealtime = new WebexRealtimeProvider({
			getToken: () => this.auth.getToken(),
			createSdk: createWebexSdk,
		});
		this.realtime = new ResilientRealtimeProvider(webexRealtime, this.pollingFallback);
		const spaces = new SpacesApi(client);
		this.store = new SignalstoneStore(this.auth.state, spaces, new MessagesApi(client), this.realtime, new AttachmentsApi(client), people, new MembershipsApi(client), this.settings);
		this.store.notify = (message) => this.showNotification(message);
		this.store.onSettingsChanged = (settings) => { this.settings = settings; void this.saveSettings(); };
		this.unsubscribeAuth = this.auth.onStateChange((state) => { this.store.setConnection(state); if (state.status === 'connected') { void this.realtime.start(); void this.store.loadSpaces(); } else { void this.realtime.stop(); } });
	}

	/**
	 * Called only for a top-level message from someone else, in a space that
	 * isn't currently open (see SignalstoneStore.maybeNotify). This applies
	 * the user's notification preference and shows an Obsidian Notice — no
	 * custom sound, nothing persisted.
	 */
	private showNotification(message: WebexMessage): void {
		debugLog('main', 'showNotification called', { messageId: message.id, spaceType: message.spaceType, notificationsSetting: this.settings.notifications });
		if (this.settings.notifications === 'off') return;
		if (this.settings.notifications === 'direct' && message.spaceType !== 'direct') return;
		if (this.settings.notifications === 'mentions' && message.spaceType !== 'direct' && !this.mentionsMe(message)) return;

		const space = this.store.getSnapshot().spaces.find((item) => item.id === message.spaceId);
		const from = resolveSenderName(message, space);
		const where = message.spaceType === 'direct' ? '' : space ? ` in ${space.title}` : '';
		if (!this.settings.showMessagePreviewInNotifications) {
			new Notice(`${from}${where} sent a message`);
			return;
		}
		const text = message.text ?? (message.files?.length ? 'Sent an attachment' : 'Sent a message');
		const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
		new Notice(`${from}${where}: ${preview}`);
	}

	/**
	 * Whether the current user is @mentioned in this message, using Webex's
	 * own `mentionedPeople`/`mentionedGroups` fields on the Message resource
	 * (documented: https://developer.webex.com/docs/api/v1/messages) rather
	 * than re-parsing markdown — Webex has already done that resolution.
	 * A direct (1:1) message always counts as addressed to you.
	 */
	private mentionsMe(message: WebexMessage): boolean {
		const state = this.auth.state;
		if (state.status !== 'connected') return false;
		return Boolean(message.mentionedPeople?.includes(state.person.id)) || Boolean(message.mentionedGroups?.includes('all'));
	}
}
