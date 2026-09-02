import { Menu, Notice } from 'obsidian';
import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import type { WebexMessage } from '../models/Message';
import type { ReadReceipt } from '../models/ReadReceipt';
import type { Space } from '../models/Space';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import type { TimeFormat } from '../settings/settings';
import { errorMessage, formatDate, resolveSenderName } from '../utils/format';
import { renderWebexMarkdown } from '../utils/webexMarkdown';
import { extractCardFallback } from '../utils/adaptiveCard';
import { AttachmentPreview } from './AttachmentPreview';
import { AdaptiveCardFallback } from './AdaptiveCardFallback';

/** Neither prefixed nor unprefixed `user-select` is in React's built-in CSSProperties typing, so this widens it for exactly those two. */
type SelectableStyle = CSSProperties & { userSelect?: 'text' | 'none'; WebkitUserSelect?: 'text' | 'none' };
const selectable = (allowed: boolean): SelectableStyle => ({ userSelect: allowed ? 'text' : 'none', WebkitUserSelect: allowed ? 'text' : 'none' });

export function MessageItem({
	message,
	own,
	store,
	space,
	onDelete,
	onReply,
	replyCount = 0,
	compact = false,
	confirmBeforeDelete = true,
	autoLoadAttachments = false,
	timeFormat = 'system',
	readBy,
	allowSelectingMessageText = true,
	allowSelectingSenderNames = true,
}: {
	message: WebexMessage;
	own: boolean;
	store: SignalstoneStore;
	/** The open conversation's space, used to resolve a DM sender's display name (see resolveSenderName). */
	space?: Space;
	onDelete?: () => void;
	onReply?: () => void;
	replyCount?: number;
	compact?: boolean;
	/** Whether Delete requires a second confirming click. Defaults to true, the original behavior. */
	confirmBeforeDelete?: boolean;
	/** Whether attachments on this message should fetch as soon as it renders. Defaults to false, the original click-to-load behavior. */
	autoLoadAttachments?: boolean;
	timeFormat?: TimeFormat;
	/** Other members whose live read receipt currently points at this exact message. See docs/WEBEX_CAPABILITIES.md, "Read/unread state" — receive-only, live-only. */
	readBy?: ReadReceipt[];
	/** Whether this message's own text can be click-and-drag selected. See docs/WEBEX_CAPABILITIES.md, "Selecting and copying message text". */
	allowSelectingMessageText?: boolean;
	/** Whether the sender name/timestamp line is included when a selection is dragged through it. */
	allowSelectingSenderNames?: boolean;
}) {
	const [editing, setEditing] = useState(false);
	const [editText, setEditText] = useState(message.markdown || message.text || '');
	const [saving, setSaving] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	const saveEdit = async () => {
		setSaving(true);
		try {
			await store.editMessage(message.id, editText);
			setEditing(false);
		} finally {
			setSaving(false);
		}
	};

	const text = message.markdown || message.text || '';
	/**
	 * Right-click "Copy message" for the whole message at once, independent
	 * of allowSelectingMessageText -- it writes to the clipboard directly
	 * rather than relying on a text selection existing. Only takes over the
	 * context menu when there's something to copy and nothing is already
	 * selected: an active selection (the "capture just portions" case) falls
	 * through to the native context menu instead, so its own standard Copy
	 * still targets exactly what was highlighted rather than being replaced
	 * by "the whole message" unexpectedly.
	 */
	const onContextMenu = (event: ReactMouseEvent) => {
		if (!text || window.getSelection()?.toString()) return;
		event.preventDefault();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle('Copy message')
				.setIcon('copy')
				.onClick(() => {
					void navigator.clipboard
						.writeText(text)
						.then(() => new Notice('Message copied.'))
						.catch((reason: unknown) => new Notice(errorMessage(reason, 'Unable to copy message.')));
				}),
		);
		menu.showAtMouseEvent(event.nativeEvent);
	};

	return (
		<article className={`signalstone-message${own ? ' is-own' : ''}${compact ? ' is-compact' : ''}`}>
			<div style={selectable(allowSelectingSenderNames)}>
				<strong>{own ? 'You' : resolveSenderName(message, space)}</strong>
				<time>{formatDate(message.created, timeFormat)}</time>
			</div>
			{editing ? (
				<div className="signalstone-edit">
					<textarea value={editText} onChange={(event) => setEditText(event.target.value)} aria-label="Edit message" />
					<div>
						<button onClick={() => setEditing(false)}>Cancel</button>
						<button className="mod-cta" disabled={saving || !editText.trim()} onClick={() => void saveEdit()}>
							{saving ? 'Saving…' : 'Save'}
						</button>
					</div>
				</div>
			) : (
				<div className="signalstone-message-text" style={selectable(allowSelectingMessageText)} onContextMenu={onContextMenu}>
					{renderWebexMarkdown(text)}
				</div>
			)}
			{message.files?.map((url) => <AttachmentPreview url={url} store={store} autoLoad={autoLoadAttachments} key={url} />)}
			{message.attachments?.map((attachment, index) => {
				const fallback = extractCardFallback(attachment);
				return fallback && <AdaptiveCardFallback content={fallback} key={index} />;
			})}
			{message.isEdited && <small>(edited)</small>}
			{readBy && readBy.length > 0 && (
				<small className="signalstone-read-receipt">Seen by {readBy.map((reader) => reader.personDisplayName || reader.personEmail || 'someone').join(', ')}</small>
			)}
			{!compact && (
				<div className={`signalstone-message-actions${replyCount > 0 ? ' has-thread' : ''}`}>
					{onReply && <button onClick={onReply}>{replyCount > 0 ? `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : 'Reply'}</button>}
					{own && !editing && !confirmingDelete && <button onClick={() => setEditing(true)}>Edit</button>}
					{own && onDelete && !confirmingDelete && (
						<button
							onClick={() => {
								if (confirmBeforeDelete) setConfirmingDelete(true);
								else onDelete();
							}}
						>
							Delete
						</button>
					)}
					{own && onDelete && confirmingDelete && (
						<>
							<button onClick={() => setConfirmingDelete(false)}>Cancel</button>
							<button
								className="mod-warning"
								onClick={() => {
									setConfirmingDelete(false);
									onDelete();
								}}
							>
								Confirm delete
							</button>
						</>
					)}
				</div>
			)}
		</article>
	);
}
