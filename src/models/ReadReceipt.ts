/**
 * Someone else's read position in a space, learned from a live Webex
 * `membership:seen` event. Receive-only — see docs/WEBEX_CAPABILITIES.md,
 * "Read/unread state" — so this only accumulates from events observed while
 * connected; there is no way to fetch existing receipt state on load.
 */
export interface ReadReceipt {
	personId: string;
	personDisplayName?: string;
	personEmail?: string;
	/** The id of the last message this person has seen. */
	lastSeenMessageId: string;
	/** When the read receipt itself was recorded by Webex. */
	seenAt: string;
}
