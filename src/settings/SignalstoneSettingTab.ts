import { App, PluginSettingTab, SecretComponent } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type SignalstonePlugin from '../main';
import type { NotificationMode } from './settings';

/**
 * Declarative settings tab (Obsidian 1.13.0+). `SettingSecretControl` exists
 * in Obsidian's own type declarations but isn't included in the public
 * `SettingControl` union yet, so the token field uses the `render` escape
 * hatch — imperatively embedding `SecretComponent`, same as before this
 * migration — rather than an unsafe cast around that gap.
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
				],
			},
			{
				type: 'group',
				heading: 'Messaging',
				items: [
					{
						name: 'Notifications',
						desc: 'Obsidian notifications for incoming messages.',
						control: {
							type: 'dropdown',
							key: 'notifications',
							options: { off: 'Off', direct: 'Direct messages only', all: 'All messages' },
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
		if (key === 'notifications') return this.plugin.settings.notifications;
		if (key === 'debugLogging') return this.plugin.settings.debugLogging;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'notifications') {
			this.plugin.settings.notifications = value as NotificationMode;
		} else if (key === 'debugLogging') {
			this.plugin.settings.debugLogging = value as boolean;
		} else {
			return;
		}
		await this.plugin.saveSettings();
		if (key === 'debugLogging') this.plugin.applyDebugLogging();
	}
}
