/**
 * Webex message payloads only carry an array of authenticated content URLs in
 * `files`; filename/size/type are not included and must be discovered from
 * the response headers of an authenticated GET against the URL (Webex does
 * not document a HEAD-only metadata endpoint for message files).
 */
export interface FileAttachment {
	url: string;
	filename: string;
	contentType: string;
	sizeBytes: number | null;
	kind: 'image' | 'file';
}

export const IMAGE_CONTENT_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/gif',
	'image/webp',
]);

export function isImageContentType(contentType: string): boolean {
	return IMAGE_CONTENT_TYPES.has(contentType.toLowerCase());
}

/** A Webex Adaptive Card (or other structured) attachment on a message. */
export interface CardAttachment {
	contentType: string;
	content: unknown;
}

/** A file selected locally by the user, pending upload. */
export interface PendingUpload {
	id: string;
	file: File;
	filename: string;
	sizeBytes: number;
	contentType: string;
	status: 'pending' | 'uploading' | 'failed';
	error?: string;
}
