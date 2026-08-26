import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import type SignalstonePlugin from '../main';

export class SignalstoneSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: SignalstonePlugin) { super(app, plugin); }
	display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl).setName('Connection').setHeading();
		new Setting(this.containerEl).setName('Webex access token').setDesc('Select a token from Obsidian Secret Storage. Personal developer tokens expire after about 12 hours and are intended for development/testing.').then((setting) => {
			const secret = new SecretComponent(this.app, setting.controlEl).setValue(this.plugin.settings.secretId);
			secret.onChange(async (value) => { this.plugin.settings.secretId = value; await this.plugin.saveSettings(); await this.plugin.rebuildConnection(); });
		});
		new Setting(this.containerEl).setName('Connection status').setDesc(this.plugin.connectionLabel()).addButton((button) => button.setButtonText('Test connection').onClick(async () => { await this.plugin.auth.validate(); this.display(); }));
		new Setting(this.containerEl).setName('Disconnect').setDesc('Clears the selected secret value and disconnects Signalstone.').addButton((button) => button.setWarning().setButtonText('Disconnect').onClick(async () => { await this.plugin.auth.disconnect(); this.display(); }));
		new Setting(this.containerEl).setName('Messaging').setHeading();
		new Setting(this.containerEl).setName('Notifications').setDesc('Obsidian notifications for incoming messages.').addDropdown((dropdown) => dropdown.addOptions({ off: 'Off', direct: 'Direct messages only', all: 'All messages' }).setValue(this.plugin.settings.notifications).onChange(async (value) => { this.plugin.settings.notifications = value as 'off' | 'direct' | 'all'; await this.plugin.saveSettings(); }));
		new Setting(this.containerEl).setName('About').setHeading();
		new Setting(this.containerEl).setName('Signalstone 0.1.0').setDesc('An unofficial third-party integration. Signalstone connects directly to Cisco Webex services and stores no message history or telemetry.');
	}
}
