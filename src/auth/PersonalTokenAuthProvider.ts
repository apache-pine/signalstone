import type { AuthenticatedPerson, AuthProvider, ConnectionState } from './AuthProvider';
import { WebexError } from '../api/WebexError';

/**
 * Minimal surface of Obsidian's `SecretStorage` (app.secretStorage, added in
 * Obsidian 1.11.4) that this provider depends on. Kept as a local interface
 * so auth logic is testable without a real Obsidian runtime.
 */
export interface SecretStorageLike {
	setSecret(id: string, secret: string): void;
	getSecret(id: string): string | null;
	listSecrets(): string[];
}

export type TokenValidator = (token: string) => Promise<AuthenticatedPerson>;

export const DEFAULT_SECRET_ID = 'signalstone-webex-token';

/**
 * Webex personal access token authentication.
 *
 * Cisco documents personal access tokens as short-lived (12 hours from
 * developer-portal sign-in) development/testing credentials, not a
 * production authentication mechanism. Signalstone stores only a reference
 * to the secret's storage ID in plugin settings; the token itself lives
 * exclusively in Obsidian's SecretStorage and is never written to
 * `data.json`, logs, or thrown errors.
 */
export class PersonalTokenAuthProvider implements AuthProvider {
	private _state: ConnectionState;
	private listeners = new Set<(state: ConnectionState) => void>();
	private hasEverConnected = false;

	constructor(
		private readonly secretStorage: SecretStorageLike,
		private readonly validator: TokenValidator,
		private readonly secretId: string = DEFAULT_SECRET_ID,
	) {
		this._state = this.getToken() ? { status: 'connecting' } : { status: 'not-configured' };
	}

	get state(): ConnectionState {
		return this._state;
	}

	getToken(): string | null {
		const value = this.secretStorage.getSecret(this.secretId);
		return value && value.length > 0 ? value : null;
	}

	onStateChange(listener: (state: ConnectionState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async setToken(token: string): Promise<ConnectionState> {
		const trimmed = token.trim();
		if (trimmed.length === 0) {
			await this.disconnect();
			return this.state;
		}
		this.secretStorage.setSecret(this.secretId, trimmed);
		return this.validate();
	}

	async disconnect(): Promise<void> {
		// SecretStorage has no delete method as of Obsidian 1.11.4; an empty
		// value is the documented way to clear a previously stored secret.
		this.secretStorage.setSecret(this.secretId, '');
		this.setState({ status: 'not-configured' });
	}

	async validate(): Promise<ConnectionState> {
		const token = this.getToken();
		if (!token) {
			this.setState({ status: 'not-configured' });
			return this.state;
		}

		this.setState({ status: 'connecting' });
		try {
			const person = await this.validator(token);
			this.hasEverConnected = true;
			this.setState({ status: 'connected', person });
		} catch (error) {
			this.setState(this.stateForError(error));
		}
		return this.state;
	}

	private setState(state: ConnectionState): void {
		this._state = state;
		for (const listener of this.listeners) {
			listener(state);
		}
	}

	/**
	 * Webex returns 401 for both a never-valid token and one that has since
	 * expired; there is no server-side signal to tell them apart. Signalstone
	 * distinguishes them locally: a 401 on the very first validation attempt
	 * is reported as an invalid token, while a 401 after a prior successful
	 * connection is reported as expired/unauthorized (the expected behavior
	 * of a 12-hour personal access token).
	 */
	private stateForError(error: unknown): ConnectionState {
		if (error instanceof WebexError) {
			if (error.kind === 'unauthorized' || error.kind === 'forbidden') {
				return this.hasEverConnected ? { status: 'unauthorized' } : { status: 'invalid-token' };
			}
			if (error.kind === 'network-error') {
				return { status: 'network-unavailable' };
			}
		}
		return { status: 'network-unavailable' };
	}
}
