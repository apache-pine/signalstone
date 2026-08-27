import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import { SignalstoneErrorBoundary } from './ErrorBoundary';
import { ConnectionScreen } from './ConnectionScreen';
import { ConversationList } from './ConversationList';
import { Conversation } from './Conversation';
import { NewMessage } from './NewMessage';

export function SignalstoneApp({ store, openSettings }: { store: SignalstoneStore; openSettings: () => void }) {
	return (
		<SignalstoneErrorBoundary>
			<SignalstoneRouter store={store} openSettings={openSettings} />
		</SignalstoneErrorBoundary>
	);
}

/** Picks which screen to show: connect, an open conversation, starting a new message, or the recent list. */
function SignalstoneRouter({ store, openSettings }: { store: SignalstoneStore; openSettings: () => void }) {
	const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const [startingNewMessage, setStartingNewMessage] = useState(false);

	useEffect(() => {
		if (state.connection.status === 'connected' && state.spaces.length === 0) void store.loadSpaces();
	}, [state.connection.status]);

	if (state.connection.status !== 'connected') {
		return <ConnectionScreen state={state.connection.status} openSettings={openSettings} />;
	}

	const selectedSpace = state.spaces.find((space) => space.id === state.selectedSpaceId);
	if (selectedSpace) {
		return <Conversation title={selectedSpace.title || 'Direct message'} spaceType={selectedSpace.type} state={state} store={store} selfId={state.connection.person.id} />;
	}

	if (startingNewMessage) {
		return <NewMessage store={store} onClose={() => setStartingNewMessage(false)} />;
	}

	return <ConversationList state={state} store={store} onNewMessage={() => setStartingNewMessage(true)} />;
}
