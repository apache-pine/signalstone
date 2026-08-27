import { App, PluginSettingTab, SecretComponent } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type SignalstonePlugin from '../main';
import { MESSAGE_PAGE_SIZE_OPTIONS } from './settings';
import type { MessageDensity, NotificationMode, PollingFrequency, SendKeybind, SidebarSide, SpaceSortOrder, TimeFormat } from './settings';

/**
 * Declarative settings tab (Obsidian 1.13.0+). `SettingSecretControl` exists
 * in Obsidian's own type declarations but isn't included in the public
 * `SettingControl` union yet, so the token field uses the `render` escape
 * hatch — imperatively embedding `SecretComponent`, same as before this
 * migration — rather than an unsafe cast around that gap.
 *
 * Every setting here defaults to Signalstone's pre-existing behavior, so
 * installing this version changes nothing until a user opens this tab and
 * deliberately changes something.
 */
export class SignalstoneSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: SignalstonePlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: 'Connection',
				items: [
					{
						name: 'Webex access token',
						desc: 'Select a token from Obsidian secret storage. Personal developer tokens expire after about 12 hours and are intended for development and testing.',
						render: (setting) => {
							const secret = new SecretComponent(this.app, setting.controlEl).setValue(this.plugin.settings.secretId);
							secret.onChange(async (value) => {
								this.plugin.settings.secretId = value;
								await this.plugin.saveSettings();
								await this.plugin.rebuildConnection();
							});
						},
					},
					{
						name: 'Connection status',
						desc: this.plugin.connectionLabel(),
						render: (setting) => {
							setting.addButton((button) =>
								button.setButtonText('Test connection').onClick(async () => {
									await this.plugin.auth.validate();
									this.update();
								}),
							);
						},
					},
					{
						name: 'Disconnect',
						desc: 'Clears the selected secret value and disconnects Signalstone.',
						render: (setting) => {
							setting.addButton((button) =>
								button
									.setDestructive()
									.setButtonText('Disconnect')
									.onClick(async () => {
										await this.plugin.auth.disconnect();
										this.update();
									}),
							);
						},
					},
					{
						name: 'Open Signalstone when Obsidian starts',
						desc: 'Automatically reveal the Signalstone view on launch, rather than waiting for the ribbon icon or command.',
						control: { type: 'toggle', key: 'openOnStartup' },
					},
					{
						name: 'Sidebar side',
						desc: 'Which sidebar Signalstone opens in when it has no existing view to reveal.',
						control: { type: 'dropdown', key: 'sidebarSide', options: { right: 'Right', left: 'Left' } },
					},
				],
			},
			{
				type: 'group',
				heading: 'Composing',
				items: [
					{
						name: 'Send message with',
						desc: 'Which key sends a message. The other one always inserts a newline.',
						control: {
							type: 'dropdown',
							key: 'sendKeybind',
							options: { 'enter-to-send': 'Enter (Shift+Enter for a new line)', 'shift-enter-to-send': 'Shift+Enter (Enter for a new line)' },
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Notifications',
				items: [
					{
						name: 'Notify me for',
						desc: 'Obsidian notifications for incoming messages, in a space you do not currently have open.',
						control: {
							type: 'dropdown',
							key: 'notifications',
							options: { off: 'Off', mentions: 'Direct messages and @mentions', direct: 'Direct messages only', all: 'All messages' },
						},
					},
					{
						name: 'Show a message preview',
						desc: 'Include a snippet of the message text in the notification. Turn off to only see who it is from — useful if your screen is visible to others.',
						control: { type: 'toggle', key: 'showMessagePreviewInNotifications' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Appearance',
				items: [
					{
						name: 'Message spacing',
						desc: 'How much room each message takes up in the conversation view.',
						control: { type: 'dropdown', key: 'messageDensity', options: { comfortable: 'Comfortable', compact: 'Compact' } },
					},
					{
						name: 'Time format',
						desc: 'How message timestamps are displayed.',
						control: { type: 'dropdown', key: 'timeFormat', options: { system: 'Match system', '12-hour': '12-hour', '24-hour': '24-hour' } },
					},
					{
						name: 'Sort conversations by',
						desc: 'How the conversation list is ordered.',
						control: { type: 'dropdown', key: 'spaceSortOrder', options: { recent: 'Most recent activity', alphabetical: 'Alphabetical' } },
					},
				],
			},
			{
				type: 'group',
				heading: 'Avatars & presence',
				items: [
					{
						name: 'Show avatars in the conversation list',
						desc: 'Direct messages only — Webex has no avatar image for a group space.',
						control: { type: 'toggle', key: 'showAvatarsInRecents' },
					},
					{
						name: 'Show presence in the conversation list',
						desc: 'A colored dot for each direct message (active/busy/away). Refreshes on the same cadence as the conversation list itself.',
						control: { type: 'toggle', key: 'showPresenceInRecents' },
					},
					{
						name: 'Show avatars in direct message conversations',
						desc: 'Shown in the conversation header.',
						control: { type: 'toggle', key: 'showAvatarsInConversations' },
					},
					{
						name: 'Show presence in direct message conversations',
						desc: 'Shown in the conversation header, next to the other person\'s name.',
						control: { type: 'toggle', key: 'showPresenceInConversations' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Conversations',
				items: [
					{
						name: 'Confirm before deleting messages',
						desc: 'Require a second "Confirm delete" click. Turn off to delete with a single click.',
						control: { type: 'toggle', key: 'confirmBeforeDelete' },
					},
					{
						name: 'Automatically load attachments',
						desc: 'Fetch files and images as soon as a conversation opens, instead of waiting for a click. Off by default to avoid using data on attachments you may not want.',
						control: { type: 'toggle', key: 'autoLoadAttachments' },
					},
					{
						name: 'Always scroll to the newest message',
						desc: 'Turn off to only auto-scroll when you were already near the bottom — so scrolling up to read history is not interrupted by a new message arriving.',
						control: { type: 'toggle', key: 'alwaysScrollToNewest' },
					},
					{
						name: 'Show hidden conversations',
						desc: 'A direct message you hide (via the right-click menu, or another Webex client) is excluded from the list by default. Turn this on to see hidden conversations too, marked "Hidden", so they can be unhidden from the same right-click menu.',
						control: { type: 'toggle', key: 'showHiddenConversations' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Advanced',
				items: [
					{
						name: 'Realtime polling frequency',
						desc: 'How often Signalstone checks for updates over REST when the live connection is degraded or unavailable. Only matters while the status indicator shows "Polling" rather than "Live".',
						control: {
							type: 'dropdown',
							key: 'pollingFrequency',
							options: { frequent: 'Frequent (10s / 30s)', normal: 'Normal (15s / 45s)', relaxed: 'Relaxed (30s / 90s)' },
						},
					},
					{
						name: 'Messages per page',
						desc: 'How many messages to request at a time — for a conversation\'s initial load and each "Load older messages" click.',
						control: {
							type: 'dropdown',
							key: 'messagePageSize',
							options: Object.fromEntries(MESSAGE_PAGE_SIZE_OPTIONS.map((size) => [String(size), String(size)])),
						},
					},
					{
						name: 'Debug logging',
						desc: 'Logs realtime connection and message-delivery activity to the developer console, to help diagnose problems. Never logs your token or message content. Off by default.',
						control: {
							type: 'toggle',
							key: 'debugLogging',
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'About',
				items: [
					{
						name: `Signalstone ${this.plugin.manifest.version}`,
						desc: 'An unofficial third-party integration. Signalstone connects directly to Cisco Webex services and stores no message history or telemetry.',
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		const settings = this.plugin.settings;
		switch (key) {
			case 'notifications': return settings.notifications;
			case 'showMessagePreviewInNotifications': return settings.showMessagePreviewInNotifications;
			case 'debugLogging': return settings.debugLogging;
			case 'sendKeybind': return settings.sendKeybind;
			case 'confirmBeforeDelete': return settings.confirmBeforeDelete;
			case 'autoLoadAttachments': return settings.autoLoadAttachments;
			case 'messageDensity': return settings.messageDensity;
			case 'timeFormat': return settings.timeFormat;
			case 'spaceSortOrder': return settings.spaceSortOrder;
			case 'sidebarSide': return settings.sidebarSide;
			case 'openOnStartup': return settings.openOnStartup;
			case 'pollingFrequency': return settings.pollingFrequency;
			case 'messagePageSize': return String(settings.messagePageSize);
			case 'alwaysScrollToNewest': return settings.alwaysScrollToNewest;
			case 'showAvatarsInRecents': return settings.showAvatarsInRecents;
			case 'showPresenceInRecents': return settings.showPresenceInRecents;
			case 'showAvatarsInConversations': return settings.showAvatarsInConversations;
			case 'showPresenceInConversations': return settings.showPresenceInConversations;
			case 'showHiddenConversations': return settings.showHiddenConversations;
			default: return undefined;
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		switch (key) {
			case 'notifications': settings.notifications = value as NotificationMode; break;
			case 'showMessagePreviewInNotifications': settings.showMessagePreviewInNotifications = value as boolean; break;
			case 'debugLogging': settings.debugLogging = value as boolean; break;
			case 'sendKeybind': settings.sendKeybind = value as SendKeybind; break;
			case 'confirmBeforeDelete': settings.confirmBeforeDelete = value as boolean; break;
			case 'autoLoadAttachments': settings.autoLoadAttachments = value as boolean; break;
			case 'messageDensity': settings.messageDensity = value as MessageDensity; break;
			case 'timeFormat': settings.timeFormat = value as TimeFormat; break;
			case 'spaceSortOrder': settings.spaceSortOrder = value as SpaceSortOrder; break;
			case 'sidebarSide': settings.sidebarSide = value as SidebarSide; break;
			case 'openOnStartup': settings.openOnStartup = value as boolean; break;
			case 'pollingFrequency': settings.pollingFrequency = value as PollingFrequency; break;
			case 'messagePageSize': settings.messagePageSize = Number(value); break;
			case 'alwaysScrollToNewest': settings.alwaysScrollToNewest = value as boolean; break;
			case 'showAvatarsInRecents': settings.showAvatarsInRecents = value as boolean; break;
			case 'showPresenceInRecents': settings.showPresenceInRecents = value as boolean; break;
			case 'showAvatarsInConversations': settings.showAvatarsInConversations = value as boolean; break;
			case 'showPresenceInConversations': settings.showPresenceInConversations = value as boolean; break;
			case 'showHiddenConversations': settings.showHiddenConversations = value as boolean; break;
			default: return;
		}
		await this.plugin.saveSettings();
		if (key === 'debugLogging') this.plugin.applyDebugLogging();
		this.plugin.applyLiveSettings();
	}
}
