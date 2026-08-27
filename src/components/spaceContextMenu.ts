import { Menu, Notice } from 'obsidian';
import type { Space } from '../models/Space';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import { errorMessage } from '../utils/format';

/**
 * Right-click menu for a conversation-list row. Built on Obsidian's own
 * `Menu`/`Notice` (native styling, outside-click dismissal, keyboard nav —
 * all "for free"), rather than a hand-rolled dropdown component. Not unit
 * testable — like SignalstoneSettingTab, this depends on Obsidian API
 * classes the `obsidian` npm package ships no runtime implementation for
 * (types only); verified through the manual checklist in docs/TESTING.md
 * instead.
 *
 * Group and direct spaces get different item sets, since the available
 * actions genuinely differ:
 *  - Group: Open, Favorite/Unfavorite, Manage members, Rename…, and a
 *    warning-styled "Leave this space…" that opens a small chained confirm
 *    menu at the same position rather than acting immediately (Webex
 *    resolves DELETE /rooms/{id} to a delete if the user is a moderator, or
 *    a leave otherwise — either way, not something a single misclick should
 *    trigger).
 *  - Direct: Open, Favorite/Unfavorite, Copy email address (resolved on
 *    demand — not gated behind the avatar/presence settings, which are for
 *    a different purpose and might be off), and Hide/Unhide.
 *
 * Hide/Unhide is direct-space only in this menu — confirmed live that
 * Webex's server rejects it for a group membership (see
 * docs/WEBEX_CAPABILITIES.md). SignalstoneStore.hideSpace/unhideSpace
 * themselves are left fully general (no space-type check), in case that
 * ever changes; only this menu's item list is scoped.
 *
 * Favorite/Unfavorite has no server round-trip at all — see
 * docs/WEBEX_CAPABILITIES.md, "Favorites" — so it needs no confirmation and
 * cannot fail.
 */
export function openSpaceContextMenu(
	event: MouseEvent,
	space: Space,
	options: {
		selfId: string;
		isHidden: boolean;
		isFavorite: boolean;
		store: SignalstoneStore;
		onOpenView: (spaceId: string, view: 'members' | 'rename') => void;
	},
): void {
	const menu = new Menu();

	menu.addItem((item) => item.setTitle('Open').setIcon('message-square').onClick(() => void options.store.selectSpace(space.id)));
	menu.addItem((item) =>
		item
			.setTitle(options.isFavorite ? 'Remove from favorites' : 'Add to favorites')
			.setIcon(options.isFavorite ? 'star-off' : 'star')
			.onClick(() => options.store.toggleFavorite(space.id)),
	);

	if (space.type === 'group') {
		menu.addItem((item) => item.setTitle('Manage members').setIcon('users').onClick(() => options.onOpenView(space.id, 'members')));
		menu.addItem((item) => item.setTitle('Rename…').setIcon('pencil').onClick(() => options.onOpenView(space.id, 'rename')));
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Leave this space…')
				.setIcon('log-out')
				.setWarning(true)
				.onClick(() =>
					showConfirmMenu(event, 'Leave this space?', 'Leave this space', () =>
						void options.store.leaveSpace(space.id).catch((reason: unknown) => new Notice(errorMessage(reason, 'Unable to leave this space.'))),
					),
				),
		);
	} else {
		menu.addItem((item) =>
			item
				.setTitle('Copy email address')
				.setIcon('copy')
				.onClick(() => void copyOtherMemberEmail(space.id, options.store, options.selfId)),
		);
		menu.addSeparator();
		addHideToggle(menu, space, options);
	}

	menu.showAtMouseEvent(event);
}

function addHideToggle(menu: Menu, space: Space, options: { isHidden: boolean; store: SignalstoneStore }): void {
	if (options.isHidden) {
		menu.addItem((item) =>
			item
				.setTitle('Unhide this conversation')
				.setIcon('eye')
				.onClick(() => {
					void options.store
						.unhideSpace(space.id)
						.then(() => new Notice('Conversation unhidden.'))
						.catch((reason: unknown) => new Notice(errorMessage(reason, 'Unable to unhide this conversation.')));
				}),
		);
	} else {
		menu.addItem((item) =>
			item
				.setTitle('Hide this conversation')
				.setIcon('eye-off')
				.onClick(() => {
					void options.store
						.hideSpace(space.id)
						.then(() => new Notice('Conversation hidden. Turn on "show hidden conversations" in settings to find it again.'))
						.catch((reason: unknown) => new Notice(errorMessage(reason, 'Unable to hide this conversation.')));
				}),
		);
	}
}

/** A small second menu at the same position, so a destructive action always needs one extra deliberate click rather than acting on the first one. */
function showConfirmMenu(event: MouseEvent, question: string, confirmLabel: string, onConfirm: () => void): void {
	const menu = new Menu();
	menu.addItem((item) => item.setTitle(question).setIsLabel(true));
	menu.addSeparator();
	menu.addItem((item) => item.setTitle('Cancel').setIcon('x'));
	menu.addItem((item) => item.setTitle(confirmLabel).setIcon('log-out').setWarning(true).onClick(onConfirm));
	menu.showAtMouseEvent(event);
}

async function copyOtherMemberEmail(spaceId: string, store: SignalstoneStore, selfId: string): Promise<void> {
	try {
		const members = await store.listMembers(spaceId);
		const other = members.find((member) => member.personId !== selfId);
		if (!other) {
			new Notice("Could not find that person's email address.");
			return;
		}
		await navigator.clipboard.writeText(other.personEmail);
		new Notice('Email address copied.');
	} catch {
		new Notice("Unable to copy that person's email address.");
	}
}
