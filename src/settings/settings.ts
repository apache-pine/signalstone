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
	/**
	 * Four independent toggles (recents vs. open-conversation, avatar vs.
	 * presence) so e.g. presence-only in the recents list and both in an open
	 * DM is expressible directly, rather than one combined on/off. Direct
	 * (1:1) spaces only — Webex has no avatar/presence concept for a group
	 * space. See docs/WEBEX_CAPABILITIES.md, "Avatars and presence".
	 */
	showAvatarsInRecents: boolean;
	showPresenceInRecents: boolean;
	showAvatarsInConversations: boolean;
	showPresenceInConversations: boolean;
	/** Whether a space you have hidden (from Signalstone or another Webex client) still appears in the conversation list, marked "Hidden", so it can be unhidden from the right-click menu. Off by default: hidden stays hidden. */
	showHiddenConversations: boolean;
	/**
	 * Spaces favorited via the conversation list's right-click menu, always
	 * sorted first regardless of "Sort conversations by". Local-only —
	 * Webex's public API has no favorite/pin concept at all (confirmed
	 * against the installed SDK source; the private, undocumented
	 * `internal-plugin-conversation` service has one, the same territory
	 * already ruled out for emoji reactions and true read/unread state — see
	 * docs/WEBEX_CAPABILITIES.md, "Favorites"), so this exists only in
	 * Signalstone's own persisted settings, keyed by space id.
	 */
	favoriteSpaceIds: string[];
	/**
	 * Local-only, session-scoped read tracking (no public Webex API for this
	 * at all — see docs/WEBEX_CAPABILITIES.md, "Unread messages"). Master
	 * toggle for whether it runs at all; the other four each control one
	 * independent place it shows up, so e.g. the ribbon badge can be on
	 * without the in-conversation divider, or vice versa.
	 */
	trackUnreadMessages: boolean;
	/** The count badge on each conversation-list row. */
	showUnreadBadgeInRecents: boolean;
	/** The "N new messages" divider line inside an open conversation. */
	showUnreadMarkerInConversation: boolean;
	/** The button that scrolls to the divider. */
	showUnreadJumpButton: boolean;
	/** The total-unread-count badge on Signalstone's ribbon icon. */
	showUnreadBadgeOnRibbonIcon: boolean;
	/** The "mark all conversations as read" button in the conversation-list header. Its own toggle (rather than folding it into trackUnreadMessages) since it's specifically about header clutter, not tracking itself. */
	showMarkAllReadButton: boolean;
	/**
	 * Whether a message's own text is selectable (click-and-drag to
	 * highlight, for copying). Forced off, this is a real "select nothing"
	 * lock, not just leaving Obsidian's own default in place — see
	 * docs/WEBEX_CAPABILITIES.md, "Selecting and copying message text".
	 * Selection is free to span multiple messages at once whenever this is
	 * on (ordinary browser text-selection behavior across sibling elements
	 * — nothing extra needed to allow it); right-click "Copy message" (the
	 * whole message) works independently of this setting either way, since
	 * it doesn't rely on a text selection existing at all.
	 */
	allowSelectingMessageText: boolean;
	/**
	 * Whether the sender name/timestamp line above each message is included
	 * when dragging a selection through it. Turning this off lets a
	 * selection that starts in one message's body and ends in a later one's
	 * skip every name/timestamp line in between, for copying several
	 * consecutive messages' text without their headers mixed in.
	 * Independent of allowSelectingMessageText's own on/off state, though
	 * it has no visible effect while that one is off.
	 */
	allowSelectingSenderNames: boolean;
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
	showAvatarsInRecents: false,
	showPresenceInRecents: false,
	showAvatarsInConversations: false,
	showPresenceInConversations: false,
	showHiddenConversations: false,
	favoriteSpaceIds: [],
	trackUnreadMessages: true,
	showUnreadBadgeInRecents: true,
	showUnreadMarkerInConversation: true,
	showUnreadJumpButton: true,
	showUnreadBadgeOnRibbonIcon: true,
	showMarkAllReadButton: true,
	allowSelectingMessageText: true,
	allowSelectingSenderNames: true,
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
