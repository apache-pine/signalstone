export interface MultipartField {
	name: string;
	value: string;
}

export interface MultipartFilePart {
	name: string;
	filename: string;
	contentType: string;
	data: ArrayBuffer;
}

function escapeHeaderValue(value: string): string {
	return value.replace(/[\r\n"]/g, '');
}

/**
 * Builds a `multipart/form-data` body as an ArrayBuffer, since Obsidian's
 * `requestUrl` does not accept `FormData` directly. Used for the Webex
 * "create message with file" endpoint, which takes fields and a binary file
 * in a single multipart POST.
 */
export function buildMultipartBody(
	fields: MultipartField[],
	file?: MultipartFilePart,
): { contentType: string; body: ArrayBuffer } {
	const boundary = `----signalstone-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
	const encoder = new TextEncoder();
	const chunks: Uint8Array[] = [];
	const pushText = (text: string) => chunks.push(encoder.encode(text));

	for (const field of fields) {
		pushText(`--${boundary}\r\n`);
		pushText(`Content-Disposition: form-data; name="${escapeHeaderValue(field.name)}"\r\n\r\n`);
		pushText(`${field.value}\r\n`);
	}

	if (file) {
		pushText(`--${boundary}\r\n`);
		pushText(
			`Content-Disposition: form-data; name="${escapeHeaderValue(file.name)}"; filename="${escapeHeaderValue(file.filename)}"\r\n`,
		);
		pushText(`Content-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`);
		chunks.push(new Uint8Array(file.data));
		pushText('\r\n');
	}

	pushText(`--${boundary}--\r\n`);

	const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return { contentType: `multipart/form-data; boundary=${boundary}`, body: out.buffer };
}
