import { Fragment, useEffect, useRef } from 'react';
import type { SignalstoneState, SignalstoneStore } from '../services/SignalstoneStore';
import type { ReadReceipt } from '../models/ReadReceipt';
import { MessageItem } from './MessageItem';

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
	const wasNearBottom = useRef(true);
	const threadParent = state.threadParentId ? state.messages.find((message) => message.id === state.threadParentId) : undefined;
	const displayedMessages = state.threadParentId ? state.threadMessages : state.messages;
	const space = state.spaces.find((item) => item.id === state.selectedSpaceId);
	const { alwaysScrollToNewest, confirmBeforeDelete, autoLoadAttachments, timeFormat, messageDensity } = state.settings;

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
			{threadParent && (
				<div className="signalstone-thread-parent">
					<MessageItem message={threadParent} own={threadParent.personId === selfId} store={store} space={space} confirmBeforeDelete={confirmBeforeDelete} autoLoadAttachments={autoLoadAttachments} timeFormat={timeFormat} readBy={readByMessageId.get(threadParent.id)} compact />
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
			{displayedMessages.map((message) => (
				<Fragment key={message.id}>
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
					/>
					{!state.threadParentId &&
						(state.threadRepliesByParent[message.id] ?? []).map((reply) => (
							<div className="signalstone-inline-reply" key={reply.id}>
								<MessageItem message={reply} own={reply.personId === selfId} store={store} space={space} confirmBeforeDelete={confirmBeforeDelete} autoLoadAttachments={autoLoadAttachments} timeFormat={timeFormat} readBy={readByMessageId.get(reply.id)} onDelete={() => void store.deleteMessage(reply.id)} compact />
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
