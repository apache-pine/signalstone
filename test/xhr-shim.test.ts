import { describe, expect, it, vi } from 'vitest';
import { RequestUrlXMLHttpRequest, installRequestUrlXhrShim } from '../src/realtime/RequestUrlXhrShim';
import type { HttpResponse } from '../src/api/WebexClient';

const response = (overrides: Partial<HttpResponse> = {}): HttpResponse => ({
	status: 200,
	headers: { 'content-type': 'application/json' },
	arrayBuffer: new ArrayBuffer(0),
	text: '{"ok":true}',
	json: { ok: true },
	...overrides,
});

const flush = () => new Promise((resolve) => window.setTimeout(resolve, 0));

describe('RequestUrlXMLHttpRequest', () => {
	it('sends via the configured requestUrl and reports success through the XHR-style callbacks', async () => {
		const requestUrl = vi.fn(async () => response());
		RequestUrlXMLHttpRequest.requestUrl = requestUrl;

		const xhr = new RequestUrlXMLHttpRequest();
		const onreadystatechange = vi.fn();
		const onload = vi.fn();
		xhr.onreadystatechange = onreadystatechange;
		xhr.onload = onload;

		xhr.open('POST', 'https://webexapis.com/v1/thing');
		xhr.setRequestHeader('Authorization', 'Bearer token');
		xhr.send('{"a":1}');
		await flush();

		expect(requestUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'https://webexapis.com/v1/thing',
				method: 'POST',
				headers: { Authorization: 'Bearer token' },
				body: '{"a":1}',
				throw: false,
			}),
		);
		expect(xhr.readyState).toBe(4);
		expect(xhr.status).toBe(200);
		expect(xhr.responseText).toBe('{"ok":true}');
		expect(xhr.getAllResponseHeaders()).toBe('content-type: application/json');
		expect(onreadystatechange).toHaveBeenCalledOnce();
		expect(onload).toHaveBeenCalledOnce();
	});

	it('reports a network-level failure as status 0 through onerror, not onload', async () => {
		RequestUrlXMLHttpRequest.requestUrl = vi.fn(async () => {
			throw new Error('network down');
		});

		const xhr = new RequestUrlXMLHttpRequest();
		const onerror = vi.fn();
		const onload = vi.fn();
		xhr.onerror = onerror;
		xhr.onload = onload;

		xhr.open('GET', 'https://webexapis.com/v1/thing');
		xhr.send();
		await flush();

		expect(xhr.status).toBe(0);
		expect(onerror).toHaveBeenCalledWith(expect.any(Error));
		expect(onload).not.toHaveBeenCalled();
	});

	it('suppresses completion callbacks once aborted', async () => {
		let resolveRequest!: (value: HttpResponse) => void;
		RequestUrlXMLHttpRequest.requestUrl = vi.fn(() => new Promise<HttpResponse>((resolve) => (resolveRequest = resolve)));

		const xhr = new RequestUrlXMLHttpRequest();
		const onload = vi.fn();
		const onabort = vi.fn();
		xhr.onload = onload;
		xhr.onabort = onabort;

		xhr.open('GET', 'https://webexapis.com/v1/thing');
		xhr.send();
		xhr.abort();
		resolveRequest(response());
		await flush();

		expect(onabort).toHaveBeenCalledOnce();
		expect(onload).not.toHaveBeenCalled();
	});

	it('returns arraybuffer responses when responseType is set to arraybuffer', async () => {
		const buffer = new ArrayBuffer(4);
		RequestUrlXMLHttpRequest.requestUrl = vi.fn(async () => response({ arrayBuffer: buffer }));

		const xhr = new RequestUrlXMLHttpRequest();
		xhr.responseType = 'arraybuffer';
		xhr.open('GET', 'https://webexapis.com/v1/contents/abc');
		xhr.send();
		await flush();

		expect(xhr.response).toBe(buffer);
	});
});

describe('installRequestUrlXhrShim', () => {
	it('exposes the shim class on window and cleans it up on unload', () => {
		const requestUrl = vi.fn();
		const uninstall = installRequestUrlXhrShim(requestUrl);

		expect(window.__signalstoneWebexXhrShim).toBe(RequestUrlXMLHttpRequest);
		expect(RequestUrlXMLHttpRequest.requestUrl).toBe(requestUrl);

		uninstall();

		expect(window.__signalstoneWebexXhrShim).toBeUndefined();
		expect(RequestUrlXMLHttpRequest.requestUrl).toBeNull();
	});
});
