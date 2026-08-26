export interface AuthenticatedPerson {
	id: string;
	displayName: string;
	emails: string[];
	avatar?: string;
}

export type ConnectionState =
	| { status: 'not-configured' }
	| { status: 'connecting' }
	| { status: 'connected'; person: AuthenticatedPerson }
	| { status: 'invalid-token' }
	| { status: 'unauthorized' }
	| { status: 'network-unavailable' };

/**
 * Abstracts how Signalstone obtains a Webex bearer token so a future
 * authentication mechanism (e.g. OAuth) can be added without changing the
 * messaging client. Implementations must never expose the raw token except
 * through {@link getToken}, and must never persist it anywhere but the
 * platform's secret storage.
 */
export interface AuthProvider {
	readonly state: ConnectionState;

	/** The current bearer token, or null if not configured. */
	getToken(): string | null;

	/** Re-validates the current token against Webex and updates state. */
	validate(): Promise<ConnectionState>;

	/** Stores a new token and validates it. */
	setToken(token: string): Promise<ConnectionState>;

	/** Clears the stored token and returns to the not-configured state. */
	disconnect(): Promise<void>;

	/** Subscribes to state changes; returns an unsubscribe function. */
	onStateChange(listener: (state: ConnectionState) => void): () => void;
}

export function isConnected(state: ConnectionState): state is Extract<ConnectionState, { status: 'connected' }> {
	return state.status === 'connected';
}
