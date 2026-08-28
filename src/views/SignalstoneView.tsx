import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { SignalstoneApp } from '../components/SignalstoneApp';
import type { SignalstoneStore } from '../services/SignalstoneStore';

export const SIGNALSTONE_VIEW = 'signalstone-view';
export class SignalstoneView extends ItemView {
	private root?: Root;
	constructor(leaf: WorkspaceLeaf, private readonly store: SignalstoneStore, private readonly openSettings: () => void) { super(leaf); }
	getViewType(): string { return SIGNALSTONE_VIEW; }
	getDisplayText(): string { return 'Signalstone'; }
	getIcon(): string { return 'radio'; }
	async onOpen(): Promise<void> { this.contentEl.empty(); this.contentEl.addClass('signalstone-view'); this.root = createRoot(this.contentEl); this.root.render(<SignalstoneApp store={this.store} openSettings={this.openSettings} app={this.app} />); }
	async onClose(): Promise<void> { this.root?.unmount(); this.root = undefined; }
}
