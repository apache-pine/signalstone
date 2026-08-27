import { useRef, useState } from 'react';
import type { Membership } from '../models/Membership';
import type { SpaceType } from '../models/Space';
import type { SignalstoneStore } from '../services/SignalstoneStore';
import { formatSize } from '../utils/format';
import { detectActiveMention, filterMentionCandidates, insertMention, mentionMarkupFor, resolveMentions, shouldOfferAllMention, type PendingMention } from '../utils/mentions';

/**
 * The message input: plain text or Webex Markdown, one attachment via file
 * picker, drag-and-drop, or clipboard paste. Enter sends; Shift+Enter inserts
 * a newline. The draft is controlled by the parent so it survives a failed
 * send rather than being cleared optimistically.
 *
 * @mention autocomplete: typing `@` in a group space offers matching
 * members (plus `@all`). The composer shows friendly `@Name` text while
 * typing, and resolves it to the exact Webex-documented markup
 * (`<@personEmail:...|Name>` / `<@all>`) only at send time — a plain
 * textarea can't reliably track a mention as a distinct "chip" through
 * arbitrary further edits, so this is a deliberate, simple middle ground:
 * a mention whose friendly text survives unedited to send time resolves
 * correctly; one that gets edited away is left as harmless plain text.
 * Scoped to group spaces only — a direct (1:1) space has no one else to
 * mention. Not offered in the edit-in-place box on an existing message.
 */
export function MessageComposer({
	draft,
	onDraftChange,
	file,
	onFileChange,
	sending,
	onSend,
	isThread,
	spaceId,
	spaceType,
	selfId,
	store,
}: {
	draft: string;
	onDraftChange: (value: string) => void;
	file?: File;
	onFileChange: (file: File | undefined) => void;
	sending: boolean;
	onSend: (text: string) => void;
	isThread: boolean;
	spaceId: string;
	spaceType: SpaceType;
	selfId: string;
	store: SignalstoneStore;
}) {
	const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
	const [highlighted, setHighlighted] = useState(0);
	const [members, setMembers] = useState<Membership[]>([]);
	const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const membersRequested = useRef(false);

	const canMention = spaceType === 'group';
	const candidates = mention ? filterMentionCandidates(members, mention.query, selfId) : [];
	const offerAll = mention ? shouldOfferAllMention(mention.query) : false;
	const options: (Membership | 'all')[] = offerAll ? [...candidates, 'all'] : candidates;

	const loadMembersOnce = () => {
		if (!canMention || membersRequested.current) return;
		membersRequested.current = true;
		store.listMembers(spaceId).then(setMembers).catch(() => {
			membersRequested.current = false; // allow retrying on the next @ trigger
		});
	};

	const send = () => {
		if (sending || (!draft.trim() && !file)) return;
		onSend(resolveMentions(draft, pendingMentions));
		setPendingMentions([]);
		setMention(null);
	};

	const selectMention = (candidate: Membership | 'all') => {
		if (!mention || !textareaRef.current) return;
		const { displayName, markup } = mentionMarkupFor(candidate);
		const result = insertMention(draft, mention.start, mention.query.length, displayName);
		onDraftChange(result.text);
		setPendingMentions((prev) => [...prev, { displayName, markup }]);
		setMention(null);
		const textarea = textareaRef.current;
		window.requestAnimationFrame(() => {
			textarea.focus();
			textarea.setSelectionRange(result.cursor, result.cursor);
		});
	};

	return (
		<div
			className="signalstone-composer"
			onDrop={(event) => {
				event.preventDefault();
				const dropped = event.dataTransfer.files[0];
				if (dropped) onFileChange(dropped);
			}}
			onDragOver={(event) => event.preventDefault()}
		>
			{file && (
				<div className="signalstone-file">
					<span>{file.name}</span>
					<small>{formatSize(file.size)}</small>
					<button onClick={() => onFileChange(undefined)} aria-label="Remove attachment">
						×
					</button>
				</div>
			)}
			<div className="signalstone-composer-input">
				{mention && options.length > 0 && (
					<ul className="signalstone-mention-suggestions" role="listbox" aria-label="Mention suggestions">
						{options.map((option, index) => {
							const isAll = option === 'all';
							const key = isAll ? 'all' : option.id;
							return (
								<li
									key={key}
									role="option"
									aria-selected={index === highlighted}
									className={index === highlighted ? 'is-highlighted' : ''}
									onMouseDown={(event) => {
										event.preventDefault();
										selectMention(option);
									}}
								>
									<strong>{isAll ? '@all' : option.personDisplayName || option.personEmail}</strong>
									<small>{isAll ? 'Notify everyone in this space' : option.personEmail}</small>
								</li>
							);
						})}
					</ul>
				)}
				<textarea
					ref={textareaRef}
					aria-label={isThread ? 'Write a reply' : 'Write a message'}
					placeholder={isThread ? 'Write a reply…' : 'Write a message…'}
					value={draft}
					onChange={(event) => {
						const value = event.target.value;
						onDraftChange(value);
						if (!canMention) return;
						const active = detectActiveMention(value, event.target.selectionStart ?? value.length);
						setMention(active);
						setHighlighted(0);
						if (active) loadMembersOnce();
					}}
					onPaste={(event) => {
						const pasted = event.clipboardData.files[0];
						if (pasted) onFileChange(pasted);
					}}
					onKeyDown={(event) => {
						if (mention && options.length > 0) {
							if (event.key === 'ArrowDown') {
								event.preventDefault();
								setHighlighted((h) => (h + 1) % options.length);
								return;
							}
							if (event.key === 'ArrowUp') {
								event.preventDefault();
								setHighlighted((h) => (h - 1 + options.length) % options.length);
								return;
							}
							if (event.key === 'Escape') {
								event.preventDefault();
								setMention(null);
								return;
							}
							if (event.key === 'Enter' || event.key === 'Tab') {
								event.preventDefault();
								const chosen = options[highlighted];
								if (chosen) selectMention(chosen);
								return;
							}
						}
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault();
							send();
						}
					}}
				/>
			</div>
			<div>
				<label className="signalstone-attach" aria-label="Attach a file">
					📎
					<input type="file" onChange={(event) => onFileChange(event.target.files?.[0])} />
				</label>
				<button className="mod-cta" disabled={sending || (!draft.trim() && !file)} onClick={send}>
					{sending ? 'Sending…' : isThread ? 'Reply' : 'Send'}
				</button>
			</div>
		</div>
	);
}
