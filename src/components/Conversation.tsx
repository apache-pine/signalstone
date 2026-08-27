import { useEffect, useState } from 'react';
import type { SpaceType } from '../models/Space';
import type { SignalstoneState, SignalstoneStore } from '../services/SignalstoneStore';
import { ConversationHeader } from './ConversationHeader';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { MemberList } from './MemberList';
import { presenceInfo } from '../utils/presence';

/** The open conversation (or, when a thread is focused, that thread) with its message list and composer. */
export function Conversation({
	title,
	spaceType,
	state,
	store,
	selfId,
	initialView,
	onInitialViewConsumed,
}: {
	title: string;
	spaceType: SpaceType;
	state: SignalstoneState;
	store: SignalstoneStore;
	selfId: string;
	/** Set by the conversation list's row context menu ("Manage members"/"Rename…") to land here directly instead of the normal view. */
	initialView?: 'members' | 'rename';
	onInitialViewConsumed?: () => void;
}) {
	const [draft, setDraft] = useState('');
	const [file, setFile] = useState<File>();
	const [sending, setSending] = useState(false);
	const [showMembers, setShowMembers] = useState(initialView === 'members');
	useEffect(() => {
		if (initialView) onInitialViewConsumed?.();
		// Intentionally fires once, on mount only -- this only ever needs to
		// consume the intent that was present when this conversation first
		// opened, not react to it changing afterward.
	}, []);
	const isThread = state.threadParentId !== null;
	const spaceId = state.selectedSpaceId ?? '';
	const directoryInfo = spaceType === 'direct' ? state.directoryInfoBySpaceId[spaceId] : undefined;
	const avatarUrl = state.settings.showAvatarsInConversations ? directoryInfo?.avatar : undefined;
	const presence = state.settings.showPresenceInConversations ? presenceInfo(directoryInfo?.status) : undefined;

	const send = async (text: string) => {
		if (sending || (!text.trim() && !file)) return;
		setSending(true);
		try {
			await store.send(text, file);
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
				onRename={!isThread && spaceType === 'group' ? (nextTitle) => void store.renameSpace(spaceId, nextTitle) : undefined}
				avatarUrl={avatarUrl}
				presence={presence}
				startEditing={initialView === 'rename'}
			/>
			<MessageList state={state} store={store} selfId={selfId} />
			<MessageComposer
				draft={draft}
				onDraftChange={setDraft}
				file={file}
				onFileChange={setFile}
				sending={sending}
				onSend={(text) => void send(text)}
				isThread={isThread}
				spaceId={spaceId}
				spaceType={spaceType}
				selfId={selfId}
				store={store}
				sendKeybind={state.settings.sendKeybind}
			/>
		</section>
	);
}
