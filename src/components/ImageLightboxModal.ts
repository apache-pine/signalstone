import { App, Modal } from 'obsidian';

/**
 * A minimal, native Obsidian Modal showing one already-loaded image at up to
 * near-viewport size. There is no dedicated "image viewer" API in Obsidian
 * to hook into for an arbitrary (non-vault) image — `Modal` is the standard,
 * idiomatic building block plugins use for this, and it gets Escape and
 * backdrop-click dismissal for free; clicking the image itself also closes
 * it, as a lightbox convenience. Reuses the object URL AttachmentPreview
 * already created (no extra fetch).
 */
export class ImageLightboxModal extends Modal {
	constructor(
		app: App,
		private readonly imageUrl: string,
		private readonly filename: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('signalstone-lightbox');
		this.setTitle(this.filename);
		const img = this.contentEl.createEl('img', { cls: 'signalstone-lightbox-image', attr: { src: this.imageUrl, alt: this.filename } });
		img.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
