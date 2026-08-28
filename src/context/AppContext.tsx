import { createContext, useContext } from 'react';
import type { App } from 'obsidian';

/**
 * Obsidian's `App` handle, needed only by leaf components that construct a
 * native Obsidian UI class directly (currently just ImageLightboxModal,
 * whose constructor requires it) — a context avoids threading `app` as a
 * prop through every intermediate component in the tree that has no use for
 * it itself (Conversation, MessageList, MessageItem).
 */
const AppContext = createContext<App | undefined>(undefined);

export const AppProvider = AppContext.Provider;

export function useObsidianApp(): App | undefined {
	return useContext(AppContext);
}
