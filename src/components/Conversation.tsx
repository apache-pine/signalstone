import { useState } from 'react';
import type { SpaceType } from '../models/Space';
import type { SignalstoneState, SignalstoneStore } from '../services/SignalstoneStore';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { MemberList } from './MemberList';

/** The open conversation (or, when a thread is focused, that thread) with its message list and composer. */
export function Conversation({
	title,
	spaceType,
	state,
	store,
	selfId,
}: {
	title: string;
	spaceType: SpaceType;
	state: SignalstoneState;
	store: SignalstoneStore;
	selfId: string;
}) {
	const [draft, setDraft] = useState('');
	const [file, setFile] = useState<File>();
	const [sending, setSending] = useState(false);
	const [showMembers, setShowMembers] = useState(false);
	const isThread = state.threadParentId !== null;

	const send = async () => {
		if (sending || (!draft.trim() && !file)) return;
		setSending(true);
		try {
			await store.send(draft, file);
			setDraft('');
			setFile(undefined);
		} finally {
			setSending(false);
		}
	};

	if (showMembers && state.selectedSpaceId) {
		return <MemberList spaceId={state.selectedSpaceId} selfId={selfId} store={store} onClose={() => setShowMembers(false)} />;
	}

	return (
		<section className="signalstone-app signalstone-conversation">
			<ConversationHeader
				title={isThread ? 'Thread' : title}
				subtitle={isThread ? title : undefined}
				isThread={isThread}
				onBack={() => (isThread ? store.closeThread() : void store.selectSpace(null))}
				onOpenMembers={!isThread && spaceType === 'group' ? () => setShowMembers(true) : undefined}
			/>
			<MessageList state={state} store={store} selfId={selfId} />
			<MessageComposer draft={draft} onDraftChange={setDraft} file={file} onFileChange={setFile} sending={sending} onSend={() => void send()} isThread={isThread} />
		</section>
	);
}
