import { describe, expect, it, vi } from 'vitest';
import { AttachmentsApi } from '../src/api/AttachmentsApi';
import { WebexClient, type HttpRequest, type HttpResponse } from '../src/api/WebexClient';
import { WebexError } from '../src/api/WebexError';

describe('AttachmentsApi', () => {
	it('retrieves authenticated image bytes and response metadata', async () => {
		const bytes = new Uint8Array([71, 73, 70]).buffer;
		const seen: HttpRequest[] = [];
		const requestUrl = vi.fn(async (request: HttpRequest): Promise<HttpResponse> => { seen.push(request); return { status: 200, headers: { 'content-type': 'image/gif', 'content-disposition': 'attachment; filename="wave.gif"', 'content-length': '3' }, arrayBuffer: bytes, text: '', json: undefined }; });
		const api = new AttachmentsApi(new WebexClient({ getToken: () => 'secret', requestUrl }));
		const result = await api.fetch('https://webexapis.com/v1/contents/abc');
		expect(result.attachment).toMatchObject({ filename: 'wave.gif', contentType: 'image/gif', sizeBytes: 3, kind: 'image' });
		expect(seen[0]?.headers?.Authorization).toBe('Bearer secret');
	});

	it('does not opt into unscannable downloads', () => {
		expect(WebexError.kindForStatus(423)).toBe('locked');
		expect(WebexError.kindForStatus(428)).toBe('precondition-required');
		expect(WebexError.fromStatus(428, 'blocked').userMessage).toContain('did not download');
	});
});
