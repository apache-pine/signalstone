import { WebexError } from './WebexError';
import { parseLinkHeader } from './pagination';

/**
 * Minimal surface of Obsidian's `requestUrl` this client depends on, kept as
 * a local interface so the client is testable without a real Obsidian
 * runtime. `obsidian.requestUrl` satisfies this shape directly.
 */
export interface HttpRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string | ArrayBuffer;
	/** Always pass false; WebexClient classifies non-2xx responses itself. */
	throw?: boolean;
}

export interface HttpResponse {
	status: number;
	headers: Record<string, string>;
	arrayBuffer: ArrayBuffer;
	text: string;
	json: unknown;
}

export type RequestUrlFn = (request: HttpRequest) => Promise<HttpResponse>;

export type QueryValue = string | number | boolean | undefined;

export interface WebexRequestOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
	/** Path relative to the API base URL, e.g. "/messages". Ignored if `url` is set. */
	path?: string;
	/** A full, already-Webex-controlled URL (e.g. from a Link header). */
	url?: string;
	query?: Record<string, QueryValue>;
	/** JSON-serializable request body. */
	json?: unknown;
	/** Raw request body with an explicit content type, for multipart uploads. */
	raw?: { contentType: string; body: string | ArrayBuffer };
}

export interface WebexListResult<T> {
	data: T;
	links: Record<string, string>;
}

const DEFAULT_BASE_URL = 'https://webexapis.com/v1';
const MAX_AUTO_RETRY_WAIT_SECONDS = 30;

export interface WebexClientOptions {
	getToken: () => string | null;
	requestUrl: RequestUrlFn;
	baseUrl?: string;
	sleep?: (ms: number) => Promise<void>;
}

/**
 * Typed, centralized Webex REST client. Owns the base URL, auth header,
 * JSON encoding/decoding, pagination, and error/rate-limit handling so
 * nothing above this layer needs to know about raw HTTP.
 *
 * UI code must never call this directly — go through the `*Api` classes and
 * `services/`.
 */
export class WebexClient {
	private readonly baseUrl: string;
	private readonly allowedOrigin: string;

	constructor(private readonly options: WebexClientOptions) {
		this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
		this.allowedOrigin = new URL(this.baseUrl).origin;
	}

	async request<T>(opts: WebexRequestOptions): Promise<WebexListResult<T>> {
		const url = this.buildUrl(opts);
		const response = await this.send(url, opts);
		const links = parseLinkHeader(response.headers['link'] ?? response.headers['Link']);
		const data = this.parseJson<T>(response);
		return { data, links };
	}

	/** Fetches raw bytes (e.g. an attachment) with the same auth/error handling, no JSON parsing. */
	async requestRaw(url: string): Promise<HttpResponse> {
		return this.send(url, { method: 'GET' });
	}

	async requestVoid(opts: WebexRequestOptions): Promise<void> {
		const url = this.buildUrl(opts);
		await this.send(url, opts);
	}

	private buildUrl(opts: WebexRequestOptions): string {
		const base = opts.url ?? `${this.baseUrl}${opts.path ?? ''}`;
		if (!opts.query) return base;

		const url = new URL(base);
		for (const [key, value] of Object.entries(opts.query)) {
			if (value === undefined) continue;
			url.searchParams.set(key, String(value));
		}
		return url.toString();
	}

	private async send(url: string, opts: WebexRequestOptions, attempt = 0): Promise<HttpResponse> {
		this.assertTrustedOrigin(url);

		const headers: Record<string, string> = {};
		const token = this.options.getToken();
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		let body: string | ArrayBuffer | undefined;
		if (opts.raw) {
			headers['Content-Type'] = opts.raw.contentType;
			body = opts.raw.body;
		} else if (opts.json !== undefined) {
			headers['Content-Type'] = 'application/json';
			body = JSON.stringify(opts.json);
		}

		let response: HttpResponse;
		try {
			response = await this.options.requestUrl({
				url,
				method: opts.method ?? 'GET',
				headers,
				body,
				throw: false,
			});
		} catch (cause) {
			throw new WebexError('network-error', 'Failed to reach Webex.', { cause });
		}

		if (response.status === 429 && attempt === 0 && (opts.method ?? 'GET') === 'GET') {
			const retryAfter = this.parseRetryAfter(response.headers);
			if (retryAfter !== undefined && retryAfter <= MAX_AUTO_RETRY_WAIT_SECONDS) {
				await this.sleep(retryAfter * 1000);
				return this.send(url, opts, attempt + 1);
			}
		}

		if (response.status >= 400) {
			throw this.errorForResponse(response);
		}

		return response;
	}

	private assertTrustedOrigin(url: string): void {
		let origin: string;
		try {
			origin = new URL(url).origin;
		} catch (cause) {
			throw new WebexError('unknown', 'Refused to request an invalid URL.', { cause });
		}
		if (origin !== this.allowedOrigin) {
			throw new WebexError(
				'unknown',
				'Refused to send Webex credentials to an untrusted host.',
			);
		}
	}

	private parseJson<T>(response: HttpResponse): T {
		if (response.status === 204 || response.text.length === 0) {
			return undefined as T;
		}
		try {
			return (response.json ?? JSON.parse(response.text)) as T;
		} catch (cause) {
			throw new WebexError('malformed-response', 'Webex returned a response that could not be parsed.', {
				status: response.status,
				cause,
			});
		}
	}

	private parseRetryAfter(headers: Record<string, string>): number | undefined {
		const raw = headers['retry-after'] ?? headers['Retry-After'];
		if (!raw) return undefined;
		const seconds = Number(raw);
		return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
	}

	private errorForResponse(response: HttpResponse): WebexError {
		const trackingId = response.headers['trackingid'] ?? response.headers['TrackingID'];
		let message = `Webex request failed with status ${response.status}.`;
		try {
			const parsed = response.json as { message?: string } | undefined;
			if (parsed?.message) message = parsed.message;
		} catch {
			// fall back to the generic message
		}

		return WebexError.fromStatus(response.status, message, {
			retryAfterSeconds: this.parseRetryAfter(response.headers),
			trackingId,
		});
	}

	private sleep(ms: number): Promise<void> {
		if (this.options.sleep) return this.options.sleep(ms);
		return new Promise((resolve) => window.setTimeout(resolve, ms));
	}
}
