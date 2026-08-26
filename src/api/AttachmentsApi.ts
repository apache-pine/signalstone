import type { WebexClient } from './WebexClient';
import type { FileAttachment } from '../models/Attachment';
import { isImageContentType } from '../models/Attachment';
import { parseFilenameFromContentDisposition } from '../utils/contentDisposition';

export interface FetchedFileContent {
	data: ArrayBuffer;
	attachment: FileAttachment;
}

/**
 * Reads Webex message file attachments. Webex message payloads only include
 * an authenticated content URL per file — no filename, size, or content type
 * — so that metadata is recovered from the response headers of a GET against
 * the URL (Webex documents no separate metadata-only endpoint).
 */
export class AttachmentsApi {
	constructor(private readonly client: WebexClient) {}

	async fetch(url: string, fallbackName = 'attachment'): Promise<FetchedFileContent> {
		const response = await this.client.requestRaw(url);
		const contentType = (response.headers['content-type'] ?? response.headers['Content-Type'] ?? 'application/octet-stream')
			.split(';')[0]
			?.trim() ?? 'application/octet-stream';
		const filename =
			parseFilenameFromContentDisposition(response.headers['content-disposition'] ?? response.headers['Content-Disposition']) ??
			fallbackName;
		const sizeHeader = response.headers['content-length'] ?? response.headers['Content-Length'];
		const sizeBytes = sizeHeader ? Number(sizeHeader) : response.arrayBuffer.byteLength;

		return {
			data: response.arrayBuffer,
			attachment: {
				url,
				filename,
				contentType,
				sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
				kind: isImageContentType(contentType) ? 'image' : 'file',
			},
		};
	}
}
