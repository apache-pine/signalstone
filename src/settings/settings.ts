export type NotificationMode = 'off' | 'mentions' | 'direct' | 'all';
export type SendKeybind = 'enter-to-send' | 'shift-enter-to-send';
export type MessageDensity = 'comfortable' | 'compact';
export type TimeFormat = 'system' | '12-hour' | '24-hour';
export type SpaceSortOrder = 'recent' | 'alphabetical';
export type SidebarSide = 'left' | 'right';
export type PollingFrequency = 'frequent' | 'normal' | 'relaxed';

export interface SignalstoneSettings {
	secretId: string;
	/** Who to show an Obsidian notification for. 'mentions' relies on Webex's own mentionedPeople/mentionedGroups fields on the message. */
	notifications: NotificationMode;
	/** Whether a notification includes a snippet of the message text, or just who it's from. */
	showMessagePreviewInNotifications: boolean;
	/** Opt-in verbose console logging for the realtime pipeline, for diagnosing connection/delivery issues. Never logs tokens or message content. */
	debugLogging: boolean;
	/** Which key combination sends a message; the other inserts a newline. */
	sendKeybind: SendKeybind;
	/** Whether deleting a message requires a second "Confirm delete" click. */
	confirmBeforeDelete: boolean;
	/** Whether file/image attachments fetch automatically when a conversation opens, instead of waiting for a click. */
	autoLoadAttachments: boolean;
	/** Spacing/padding of messages in the conversation view. */
	messageDensity: MessageDensity;
	/** 12-hour vs 24-hour message timestamps, or 'system' to follow the OS/locale default. */
	timeFormat: TimeFormat;
	/** How the conversation list is ordered. */
	spaceSortOrder: SpaceSortOrder;
	/** Which sidebar Signalstone opens in when there's no existing leaf to reveal. */
	sidebarSide: SidebarSide;
	/** Automatically open the Signalstone view when Obsidian starts. */
	openOnStartup: boolean;
	/** How often the REST-polling fallback checks for updates. Only affects behavior when the live realtime connection is degraded/unavailable. */
	pollingFrequency: PollingFrequency;
	/** How many messages to request per page (initial load and "Load older messages"). */
	messagePageSize: number;
	/** If false, the message list only auto-scrolls to a new message when you were already near the bottom, instead of always jumping down. */
	alwaysScrollToNewest: boolean;
}

export const DEFAULT_SETTINGS: SignalstoneSettings = {
	secretId: 'signalstone-webex-token',
	notifications: 'off',
	showMessagePreviewInNotifications: true,
	debugLogging: false,
	sendKeybind: 'enter-to-send',
	confirmBeforeDelete: true,
	autoLoadAttachments: false,
	messageDensity: 'comfortable',
	timeFormat: 'system',
	spaceSortOrder: 'recent',
	sidebarSide: 'right',
	openOnStartup: false,
	pollingFrequency: 'normal',
	messagePageSize: 50,
	alwaysScrollToNewest: true,
};

/**
 * REST-polling cadence per {@link PollingFrequency} preset. "normal" matches
 * PollingFallback's own historical defaults exactly, so leaving this setting
 * untouched changes nothing. Deliberately a small fixed set of presets
 * (rather than a free-form number) so a user can't accidentally configure a
 * hammering interval against Webex's API.
 */
export const POLLING_FREQUENCY_MS: Record<PollingFrequency, { activeConversationIntervalMs: number; spaceListIntervalMs: number }> = {
	frequent: { activeConversationIntervalMs: 10_000, spaceListIntervalMs: 30_000 },
	normal: { activeConversationIntervalMs: 15_000, spaceListIntervalMs: 45_000 },
	relaxed: { activeConversationIntervalMs: 30_000, spaceListIntervalMs: 90_000 },
};

/** Same guardrail as polling frequency: a fixed set of page sizes, not a free-form number. */
export const MESSAGE_PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
