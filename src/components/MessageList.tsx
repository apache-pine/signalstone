import { Fragment, useEffect, useRef } from 'react';
import type { SignalstoneState, SignalstoneStore } from '../services/SignalstoneStore';
import { MessageItem } from './MessageItem';

/**
 * The scrollable message area for the open conversation or thread: parent
 * context (in a thread), older-message paging, the messages themselves with
 * their inline replies, and the error/retry row. Auto-scrolls to the newest
 * message whenever the visible list grows.
 */
export function MessageList({ state, store, selfId }: { state: SignalstoneState; store: SignalstoneStore; selfId: string }) {
	const end = useRef<HTMLDivElement>(null);
	const threadParent = state.threadParentId ? state.messages.find((message) => message.id === state.threadParentId) : undefined;
	const displayedMessages = state.threadParentId ? state.threadMessages : state.messages;

	useEffect(() => {
		const target = end.current;
		if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'end' });
	}, [displayedMessages.length]);

	const retry = () => {
		if (state.threadParentId) void store.openThread(state.threadParentId);
		else void store.selectSpace(state.selectedSpaceId);
	};

	return (
		<div className="signalstone-messages">
			{threadParent && (
				<div className="signalstone-thread-parent">
					<MessageItem message={threadParent} own={threadParent.personId === selfId} store={store} compact />
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
						replyCount={state.threadReplyCounts[message.id] ?? 0}
						onReply={state.threadParentId ? undefined : () => void store.openThread(message.id)}
						onDelete={() => void store.deleteMessage(message.id)}
					/>
					{!state.threadParentId &&
						(state.threadRepliesByParent[message.id] ?? []).map((reply) => (
							<div className="signalstone-inline-reply" key={reply.id}>
								<MessageItem message={reply} own={reply.personId === selfId} store={store} onDelete={() => void store.deleteMessage(reply.id)} compact />
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
