import { Notice } from 'obsidian';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { SignalstoneState, SignalstoneStore } from '../services/SignalstoneStore';
import type { ReadReceipt } from '../models/ReadReceipt';
import { MessageItem } from './MessageItem';
import { showConfirmMenu } from './confirmMenu';

/** How close to the bottom (in pixels) counts as "already near the bottom" for the smart-scroll behavior below. */
const NEAR_BOTTOM_THRESHOLD_PX = 80;

/**
 * The scrollable message area for the open conversation or thread: parent
 * context (in a thread), older-message paging, the messages themselves with
 * their inline replies, and the error/retry row. Auto-scrolls to the newest
 * message whenever the visible list grows — always, or only when the reader
 * was already near the bottom, per the "Always scroll to the newest message"
 * setting (settings.alwaysScrollToNewest).
 */
export function MessageList({ state, store, selfId }: { state: SignalstoneState; store: SignalstoneStore; selfId: string }) {
	const end = useRef<HTMLDivElement>(null);
	const container = useRef<HTMLDivElement>(null);
	const unreadDivider = useRef<HTMLDivElement>(null);
	const wasNearBottom = useRef(true);
	// Set while waiting for loadUntilMessageLoaded to bring the earliest
	// unread message into the loaded window (see the jump button below);
	// the actual scroll happens from the effect once that message's divider
	// has had a chance to render and attach its ref.
	const [pendingJump, setPendingJump] = useState(false);
	const threadParent = state.threadParentId ? state.messages.find((message) => message.id === state.threadParentId) : undefined;
	const displayedMessages = state.threadParentId ? state.threadMessages : state.messages;
	const space = state.spaces.find((item) => item.id === state.selectedSpaceId);
	const { alwaysScrollToNewest, confirmBeforeDelete, autoLoadAttachments, timeFormat, messageDensity, allowSelectingMessageText, allowSelectingSenderNames } = state.settings;

	// Unread tracking is top-level-only (see SignalstoneStore.maybeNotify), so
	// there's nothing to mark inside a thread. openedWithUnreadIds is a fixed
	// snapshot taken when this conversation was opened (see selectSpace) — it
	// doesn't grow as new messages arrive while open, and doesn't shrink as
	// you scroll past it, so the divider stays put for the whole viewing
	// session. The divider renders at the earliest of those ids that's
	// actually loaded; earliestUnreadId (openedWithUnreadIds[0], since that
	// array is built in arrival order) is the *true* earliest, which may not
	// be loaded at all yet if more unread messages arrived than a single
	// page holds — see loadUntilMessageLoaded and the jump button below.
	const unreadIds = state.threadParentId ? new Set<string>() : new Set(state.openedWithUnreadIds);
	const firstUnreadIndex = unreadIds.size > 0 ? displayedMessages.findIndex((message) => unreadIds.has(message.id)) : -1;
	const unreadCount = state.openedWithUnreadIds.length;
	const earliestUnreadId = state.openedWithUnreadIds[0];
	const earliestUnreadLoaded = !earliestUnreadId || displayedMessages.some((message) => message.id === earliestUnreadId);

	// Group the space's known read receipts by the exact message each person
	// last saw, so a message can show "Seen by …" only for whoever's receipt
	// currently points at it — receive-only and live-only, see
	// docs/WEBEX_CAPABILITIES.md, "Read/unread state".
	const readByMessageId = new Map<string, ReadReceipt[]>();
	const spaceReceipts = state.selectedSpaceId ? state.readReceiptsBySpace[state.selectedSpaceId] : undefined;
	if (spaceReceipts) {
		for (const receipt of Object.values(spaceReceipts)) {
			const readers = readByMessageId.get(receipt.lastSeenMessageId) ?? [];
			readers.push(receipt);
			readByMessageId.set(receipt.lastSeenMessageId, readers);
		}
	}

	useEffect(() => {
		const shouldScroll = alwaysScrollToNewest || wasNearBottom.current;
		const target = end.current;
		if (shouldScroll && target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'end' });
		// Deliberately keyed only on list length: alwaysScrollToNewest and
		// wasNearBottom are read fresh each run without needing to re-trigger
		// this effect when they change on their own.
	}, [displayedMessages.length]);

	// Completes a jump-to-unread click that had to load older pages first:
	// loadUntilMessageLoaded's own await resolves before this component has
	// re-rendered with the newly loaded messages, so the divider's ref isn't
	// attached yet at that point -- this runs after each re-render instead
	// and only actually scrolls once it's attached.
	useEffect(() => {
		if (pendingJump && unreadDivider.current) {
			unreadDivider.current.scrollIntoView({ block: 'center' });
			setPendingJump(false);
		}
	}, [pendingJump, displayedMessages.length]);

	const jumpToUnread = async () => {
		if (earliestUnreadLoaded) {
			unreadDivider.current?.scrollIntoView({ block: 'center' });
			return;
		}
		setPendingJump(true);
		const loaded = earliestUnreadId ? await store.loadUntilMessageLoaded(earliestUnreadId) : false;
		if (!loaded) {
			setPendingJump(false);
			new Notice("Couldn't load far enough back to reach that message — it may have been deleted, or there's a very large backlog.");
		}
	};

	const retry = () => {
		if (state.threadParentId) void store.openThread(state.threadParentId);
		else void store.selectSpace(state.selectedSpaceId);
	};

	return (
		<div
			className={`signalstone-messages${messageDensity === 'compact' ? ' is-compact' : ''}`}
			ref={container}
			onScroll={() => {
				const element = container.current;
				if (!element) return;
				wasNearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;
			}}
		>
			{!state.threadParentId && unreadCount > 0 && (
				<div className="signalstone-unread-controls">
					{state.settings.showUnreadJumpButton && (
						<button className="signalstone-jump-to-unread" onClick={() => void jumpToUnread()} disabled={pendingJump}>
							{pendingJump ? 'Loading…' : `↑ ${unreadCount} new message${unreadCount === 1 ? '' : 's'}`}
						</button>
					)}
					<button
						className="signalstone-mark-read"
						aria-label="Mark this conversation as read"
						onClick={(event) =>
							showConfirmMenu(event.nativeEvent, `Mark ${unreadCount} message${unreadCount === 1 ? '' : 's'} as read?`, 'Mark as read', () => {
								if (state.selectedSpaceId) store.markSpaceAsRead(state.selectedSpaceId);
							})
						}
					>
						Mark as read
					</button>
				</div>
			)}
			{threadParent && (
				<div className="signalstone-thread-parent">
					<MessageItem message={threadParent} own={threadParent.personId === selfId} store={store} space={space} confirmBeforeDelete={confirmBeforeDelete} autoLoadAttachments={autoLoadAttachments} timeFormat={timeFormat} readBy={readByMessageId.get(threadParent.id)} allowSelectingMessageText={allowSelectingMessageText} allowSelectingSenderNames={allowSelectingSenderNames} compact />
				</div>
			)}
			{!state.threadParentId && state.nextMessagesUrl && (
				<button className="signalstone-load-older" onClick={() => void store.loadOlder()} disabled={state.loading}>
					{state.loading ? 'Loading…' : 'Load older messages'}
				</button>
			)}
			{!state.loading && displayedMessages.length === 0 && !state.error && (
				<div className="signalstone-empty-list">
					<p>{state.threadParentId ? 'No replies yet.' : 'No messages yet.'}</p>
				</div>
			)}
			{displayedMessages.map((message, index) => (
				<Fragment key={message.id}>
					{index === firstUnreadIndex && (
						// Always rendered (as the jump button's scroll target) even when
						// the visible divider setting is off, just without content/
						// styling then -- otherwise turning the marker off would
						// silently break the jump button too.
						<div className={`signalstone-unread-divider${state.settings.showUnreadMarkerInConversation ? '' : ' is-anchor-only'}`} ref={unreadDivider}>
							{state.settings.showUnreadMarkerInConversation && `${unreadCount} new message${unreadCount === 1 ? '' : 's'}`}
						</div>
					)}
					<MessageItem
						message={message}
						own={message.personId === selfId}
						store={store}
						space={space}
						confirmBeforeDelete={confirmBeforeDelete}
						autoLoadAttachments={autoLoadAttachments}
						timeFormat={timeFormat}
						readBy={readByMessageId.get(message.id)}
						replyCount={state.threadReplyCounts[message.id] ?? 0}
						onReply={state.threadParentId ? undefined : () => void store.openThread(message.id)}
						onDelete={() => void store.deleteMessage(message.id)}
						allowSelectingMessageText={allowSelectingMessageText}
						allowSelectingSenderNames={allowSelectingSenderNames}
					/>
					{!state.threadParentId &&
						(state.threadRepliesByParent[message.id] ?? []).map((reply) => (
							<div className="signalstone-inline-reply" key={reply.id}>
								<MessageItem message={reply} own={reply.personId === selfId} store={store} space={space} confirmBeforeDelete={confirmBeforeDelete} autoLoadAttachments={autoLoadAttachments} timeFormat={timeFormat} readBy={readByMessageId.get(reply.id)} onDelete={() => void store.deleteMessage(reply.id)} allowSelectingMessageText={allowSelectingMessageText} allowSelectingSenderNames={allowSelectingSenderNames} compact />
							</div>
						))}
				</Fragment>
			))}
			{state.error && (
				<div className="signalstone-error">
					<span>{state.error || 'Unable to load this thread from Webex.'}</span>
					<button onClick={retry}>Retry</button>
				</div>
			)}
			<div ref={end} />
		</div>
	);
}
