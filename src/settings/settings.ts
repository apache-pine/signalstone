export type NotificationMode = 'off' | 'direct' | 'all';
export interface SignalstoneSettings {
	secretId: string;
	notifications: NotificationMode;
	/** Opt-in verbose console logging for the realtime pipeline, for diagnosing connection/delivery issues. Never logs tokens or message content. */
	debugLogging: boolean;
}
export const DEFAULT_SETTINGS: SignalstoneSettings = { secretId: 'signalstone-webex-token', notifications: 'off', debugLogging: false };
