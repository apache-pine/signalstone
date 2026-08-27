import type { RequestUrlFn } from '../api/WebexClient';

type VoidHandler = (() => void) | null;
type ErrorHandler = ((error: Error) => void) | null;

/**
 * See `docs/WEBEX_CAPABILITIES.md` — "Realtime: CORS blocks the SDK's own
 * HTTP client" — for the full story. In short: `@webex/http-core`'s browser
 * transport (`request/request.shim.js`) makes every request via a bare
 * `new XMLHttpRequest()`, which is fully subject to the Obsidian renderer's
 * CORS enforcement, unlike `requestUrl`, which bypasses it by routing
 * through Electron's main process. `esbuild.config.mjs` redirects that one
 * bare identifier — wherever `@webex/http-core` references it — to this
 * class via esbuild's `define`. Nothing about Obsidian's real
 * `window.XMLHttpRequest` changes, and nothing outside that one dependency
 * is affected: a search across every `@webex/*` package confirmed only
 * `request.shim.js` and `lib/xhr.js` reference the bare identifier, and only
 * `request.shim.js`'s call site is actually reached in Signalstone's
 * messaging-only configuration.
 *
 * This implements only the subset of the XMLHttpRequest contract those two
 * files actually use (verified by reading both): `open`/`setRequestHeader`/
 * `send`/`abort`, `readyState`/`status`/`response(Text)`/
 * `getAllResponseHeaders`, and the `onreadystatechange`/`onload`/`onerror`/
 * `onabort` handler properties. It is not a general-purpose polyfill and
 * must not be used for anything beyond this one dependency's requests.
 */
export class RequestUrlXMLHttpRequest {
	/** Bound once, at plugin load, by {@link installRequestUrlXhrShim}. */
	static requestUrl: RequestUrlFn | null = null;

	readyState = 0;
	status = 0;
	statusText = '';
	response: unknown = '';
	responseText = '';
	responseType = '';
	withCredentials = false;
	readonly upload: { onprogress: VoidHandler } = { onprogress: null };

	onreadystatechange: VoidHandler = null;
	onload: VoidHandler = null;
	onabort: VoidHandler = null;
	onprogress: VoidHandler = null;
	onerror: ErrorHandler = null;
	ontimeout: ErrorHandler = null;

	private method = 'GET';
	private url = '';
	private readonly requestHeaders: Record<string, string> = {};
	private responseHeaders: Record<string, string> = {};
	private aborted = false;

	open(method: string, url: string): void {
		this.method = method.toUpperCase();
		this.url = url;
		this.readyState = 1;
	}

	setRequestHeader(name: string, value: string): void {
		this.requestHeaders[name] = value;
	}

	getAllResponseHeaders(): string {
		return Object.entries(this.responseHeaders)
			.map(([name, value]) => `${name}: ${value}`)
			.join('\r\n');
	}

	abort(): void {
		this.aborted = true;
		this.onabort?.();
	}

	send(body?: unknown): void {
		void this.performRequest(body);
	}

	private async performRequest(body: unknown): Promise<void> {
		const requestUrl = RequestUrlXMLHttpRequest.requestUrl;
		if (!requestUrl) {
			this.fail(new Error('Signalstone: requestUrl was not configured for the Webex SDK transport shim.'));
			return;
		}

		try {
			const response = await requestUrl({
				url: this.url,
				method: this.method,
				headers: this.requestHeaders,
				body: toRequestBody(body),
				throw: false,
			});
			if (this.aborted) return;

			this.status = response.status;
			this.responseHeaders = response.headers;
			if (this.responseType === 'arraybuffer') {
				this.response = response.arrayBuffer;
			} else {
				this.response = response.text;
				this.responseText = response.text;
			}
			this.readyState = 4;
			this.onreadystatechange?.();
			this.onload?.();
		} catch (error) {
			if (this.aborted) return;
			this.fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private fail(error: Error): void {
		this.status = 0;
		this.readyState = 4;
		this.onerror?.(error);
	}
}

function toRequestBody(body: unknown): string | ArrayBuffer | undefined {
	if (body === undefined || body === null) return undefined;
	if (typeof body === 'string' || body instanceof ArrayBuffer) return body;
	if (ArrayBuffer.isView(body)) return body.buffer as ArrayBuffer;
	// @webex/http-core's browser transport only ever sends a JSON string
	// through this path for the requests Signalstone's messaging-only SDK
	// surface reaches (device registration, service discovery, Mercury
	// bootstrap); anything else is unexpected but stringified defensively
	// rather than silently dropped.
	return JSON.stringify(body);
}

declare global {
	interface Window {
		__signalstoneWebexXhrShim?: typeof RequestUrlXMLHttpRequest;
	}
}

/**
 * Binds the shim to a `requestUrl` implementation and exposes the class as
 * `window.__signalstoneWebexXhrShim`, which is exactly what
 * `esbuild.config.mjs`'s `define` points the bare `XMLHttpRequest` identifier
 * at inside `@webex/http-core`. Call once at plugin load, before any Webex
 * SDK instance is created. Returns a cleanup function that unbinds it, so a
 * stale reference can't outlive plugin unload.
 *
 * Uses `window` rather than `globalThis` per Obsidian's popout-window
 * guidance; in this Electron renderer context the two are the same object,
 * but this is a plain JS-level registration used once at plugin load (not
 * per-view DOM work), so the plugin's single main-window context is correct
 * either way.
 */
export function installRequestUrlXhrShim(requestUrl: RequestUrlFn): () => void {
	RequestUrlXMLHttpRequest.requestUrl = requestUrl;
	window.__signalstoneWebexXhrShim = RequestUrlXMLHttpRequest;
	return () => {
		RequestUrlXMLHttpRequest.requestUrl = null;
		window.__signalstoneWebexXhrShim = undefined;
	};
}
