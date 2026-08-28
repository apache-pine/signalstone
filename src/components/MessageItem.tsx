import { useState } from 'react';
import type { WebexMessage } from '../models/Message';
import type { ReadReceipt } from '../models/ReadReceipt';
import type { Space } from '../models/Space';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import type { TimeFormat } from '../settings/settings';
import { formatDate, resolveSenderName } from '../utils/format';
import { renderWebexMarkdown } from '../utils/webexMarkdown';
import { extractCardFallback } from '../utils/adaptiveCard';
import { AttachmentPreview } from './AttachmentPreview';
import { AdaptiveCardFallback } from './AdaptiveCardFallback';

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

	return (
		<article className={`signalstone-message${own ? ' is-own' : ''}${compact ? ' is-compact' : ''}`}>
			<div>
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
				<div className="signalstone-message-text">{renderWebexMarkdown(message.markdown || message.text || '')}</div>
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
