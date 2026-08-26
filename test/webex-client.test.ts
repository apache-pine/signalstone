import { describe, expect, it, vi } from 'vitest';
import { WebexClient, type HttpRequest, type HttpResponse } from '../src/api/WebexClient';
import { WebexError } from '../src/api/WebexError';

const response = (status: number, json: unknown, headers: Record<string, string> = {}): HttpResponse => ({ status, json, headers, text: json === undefined ? '' : JSON.stringify(json), arrayBuffer: new ArrayBuffer(0) });

describe('WebexClient', () => {
	it('adds auth and parses pagination', async () => { const seen: HttpRequest[] = []; const request = vi.fn(async (input: HttpRequest) => { seen.push(input); return response(200, { items: [] }, { link: '<https://webexapis.com/v1/rooms?cursor=x>; rel="next"' }); }); const client = new WebexClient({ getToken: () => 'secret', requestUrl: request }); const result = await client.request({ path: '/rooms' }); expect(result.links.next).toContain('cursor=x'); expect(seen[0]?.headers?.Authorization).toBe('Bearer secret'); });
	it('retries a rate-limited GET once', async () => { const request = vi.fn().mockResolvedValueOnce(response(429, {}, { 'retry-after': '0' })).mockResolvedValueOnce(response(200, { ok: true })); const client = new WebexClient({ getToken: () => 'x', requestUrl: request, sleep: async () => undefined }); await client.request({ path: '/people/me' }); expect(request).toHaveBeenCalledTimes(2); });
	it('rejects untrusted attachment hosts before sending credentials', async () => { const request = vi.fn(); const client = new WebexClient({ getToken: () => 'secret', requestUrl: request }); await expect(client.requestRaw('https://evil.example/file')).rejects.toBeInstanceOf(WebexError); expect(request).not.toHaveBeenCalled(); });
	it('maps network failures and malformed data', async () => { const offline = new WebexClient({ getToken: () => 'x', requestUrl: async () => { throw new Error('offline'); } }); await expect(offline.request({ path: '/rooms' })).rejects.toMatchObject({ kind: 'network-error' }); const malformed = new WebexClient({ getToken: () => 'x', requestUrl: async () => ({ ...response(200, undefined), text: '{', json: undefined }) }); await expect(malformed.request({ path: '/rooms' })).rejects.toMatchObject({ kind: 'malformed-response' }); });
});
