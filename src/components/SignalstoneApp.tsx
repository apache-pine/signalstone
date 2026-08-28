import { useEffect, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import { AppProvider } from '../context/AppContext';
import { SignalstoneErrorBoundary } from './ErrorBoundary';
import { ConnectionScreen } from './ConnectionScreen';
import { ConversationList } from './ConversationList';
import { Conversation } from './Conversation';
import { NewMessage } from './NewMessage';
import { NewSpace } from './NewSpace';

export function SignalstoneApp({ store, openSettings, app }: { store: SignalstoneStore; openSettings: () => void; app: App }) {
	return (
		<AppProvider value={app}>
			<SignalstoneErrorBoundary>
				<SignalstoneRouter store={store} openSettings={openSettings} />
			</SignalstoneErrorBoundary>
		</AppProvider>
	);
}

/** Picks which screen to show: connect, an open conversation, starting a new message, or the recent list. */
function SignalstoneRouter({ store, openSettings }: { store: SignalstoneStore; openSettings: () => void }) {
	const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const [startingNewMessage, setStartingNewMessage] = useState(false);
	const [startingNewSpace, setStartingNewSpace] = useState(false);
	// Set by the row context menu's "Manage members"/"Rename…" items so the
	// conversation opens directly into that view instead of the normal one;
	// consumed (cleared) by Conversation on mount, so a later, ordinary open
	// of the same space behaves normally again.
	const [pendingSpaceView, setPendingSpaceView] = useState<{ spaceId: string; view: 'members' | 'rename' } | null>(null);
	const openSpaceWithView = (spaceId: string, view: 'members' | 'rename') => {
		setPendingSpaceView({ spaceId, view });
		void store.selectSpace(spaceId);
	};

	useEffect(() => {
		if (state.connection.status === 'connected' && state.spaces.length === 0) void store.loadSpaces();
	}, [state.connection.status]);

	// Creating a space or starting a DM both select the result as their last
	// step (see SignalstoneStore.createSpace/startDirectMessage), and the
	// caller then closes its own "New…" screen -- but each of those methods
	// patches the store's state more than once along the way (space list,
	// then selection, then the newly opened conversation's messages), and
	// relying on that async chain's own final "now call onClose()" step to
	// land after every one of those updates has actually committed turned
	// out not to be reliable: the "New…" screen could still be flagged
	// active once you back out of the space it had just created, so the
	// same back button that should return to the recent list opened the
	// creation screen again instead. Deriving "close it" from
	// selectedSpaceId becoming set instead can't get out of sync with it,
	// regardless of how many intermediate updates happened on the way there.
	useEffect(() => {
		if (state.selectedSpaceId) {
			setStartingNewMessage(false);
			setStartingNewSpace(false);
		}
	}, [state.selectedSpaceId]);

	if (state.connection.status !== 'connected') {
		return <ConnectionScreen state={state.connection.status} openSettings={openSettings} />;
	}

	const selectedSpace = state.spaces.find((space) => space.id === state.selectedSpaceId);
	if (selectedSpace) {
		return (
			<Conversation
				title={selectedSpace.title || 'Direct message'}
				spaceType={selectedSpace.type}
				state={state}
				store={store}
				selfId={state.connection.person.id}
				initialView={pendingSpaceView?.spaceId === selectedSpace.id ? pendingSpaceView.view : undefined}
				onInitialViewConsumed={() => setPendingSpaceView(null)}
			/>
		);
	}

	if (startingNewMessage) {
		return <NewMessage store={store} onClose={() => setStartingNewMessage(false)} />;
	}

	if (startingNewSpace) {
		return <NewSpace store={store} onClose={() => setStartingNewSpace(false)} />;
	}

	return <ConversationList state={state} store={store} onNewMessage={() => setStartingNewMessage(true)} onNewSpace={() => setStartingNewSpace(true)} onOpenSpaceView={openSpaceWithView} />;
}
