export type WebexErrorKind =
	| 'bad-request'
	| 'unauthorized'
	| 'forbidden'
	| 'not-found'
	| 'conflict'
	| 'rate-limited'
	| 'server-error'
	| 'network-error'
	| 'malformed-response'
	| 'unknown';

export interface WebexErrorOptions {
	status?: number;
	retryAfterSeconds?: number;
	trackingId?: string;
	cause?: unknown;
}

/**
 * Typed error for all Webex API failures. UI code should render
 * {@link WebexError.userMessage} rather than the raw `message`/response body,
 * and must never log a token or Authorization header alongside it.
 */
export class WebexError extends Error {
	readonly kind: WebexErrorKind;
	readonly status?: number;
	readonly retryAfterSeconds?: number;
	readonly trackingId?: string;
	readonly cause?: unknown;

	constructor(kind: WebexErrorKind, message: string, options: WebexErrorOptions = {}) {
		super(message);
		this.name = 'WebexError';
		this.kind = kind;
		this.status = options.status;
		this.retryAfterSeconds = options.retryAfterSeconds;
		this.trackingId = options.trackingId;
		if (options.cause !== undefined) {
			this.cause = options.cause;
		}
	}

	/** A message safe to show directly to the user. Never contains raw JSON, status codes alone, or secrets. */
	get userMessage(): string {
		switch (this.kind) {
			case 'unauthorized':
				return 'Your Webex token is no longer valid. Update it in Signalstone settings.';
			case 'forbidden':
				return "You don't have permission to do that in Webex.";
			case 'not-found':
				return 'That Webex conversation or message could no longer be found.';
			case 'rate-limited':
				return 'Webex is temporarily rate limiting requests. Signalstone will retry shortly.';
			case 'server-error':
				return 'Webex is having trouble right now. Please try again in a moment.';
			case 'network-error':
				return 'Signalstone could not reach Webex. Check your network connection.';
			case 'bad-request':
				return 'Webex rejected that request.';
			case 'conflict':
				return 'That action conflicts with the current state in Webex.';
			case 'malformed-response':
				return 'Webex returned an unexpected response.';
			default:
				return 'Something went wrong talking to Webex.';
		}
	}

	static fromStatus(status: number, message: string, options: Omit<WebexErrorOptions, 'status'> = {}): WebexError {
		return new WebexError(WebexError.kindForStatus(status), message, { ...options, status });
	}

	static kindForStatus(status: number): WebexErrorKind {
		if (status === 400) return 'bad-request';
		if (status === 401) return 'unauthorized';
		if (status === 403) return 'forbidden';
		if (status === 404) return 'not-found';
		if (status === 409) return 'conflict';
		if (status === 429) return 'rate-limited';
		if (status >= 500) return 'server-error';
		return 'unknown';
	}
}
