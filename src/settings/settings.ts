export type NotificationMode = 'off' | 'direct' | 'all';
export interface SignalstoneSettings { secretId: string; notifications: NotificationMode; }
export const DEFAULT_SETTINGS: SignalstoneSettings = { secretId: 'signalstone-webex-token', notifications: 'off' };
