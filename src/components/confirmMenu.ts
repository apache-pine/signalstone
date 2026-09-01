import { Menu } from 'obsidian';

/**
 * A small Obsidian `Menu`, anchored at the triggering click, that requires
 * one extra deliberate choice before an action runs — used anywhere a
 * single click shouldn't be enough (leaving a space, marking a conversation
 * or everything read). Native styling, outside-click dismissal, and
 * keyboard nav all come "for free" from Obsidian's own Menu, the same
 * reasoning as openSpaceContextMenu; not unit-testable for the same reason
 * (see spaceContextMenu.ts's own note), verified through the manual
 * checklist in docs/TESTING.md instead.
 */
export function showConfirmMenu(event: MouseEvent, question: string, confirmLabel: string, onConfirm: () => void, options: { icon?: string; warning?: boolean } = {}): void {
	const menu = new Menu();
	menu.addItem((item) => item.setTitle(question).setIsLabel(true));
	menu.addSeparator();
	menu.addItem((item) => item.setTitle('Cancel').setIcon('x'));
	menu.addItem((item) => item.setTitle(confirmLabel).setIcon(options.icon ?? 'check').setWarning(options.warning ?? false).onClick(onConfirm));
	menu.showAtMouseEvent(event);
}
