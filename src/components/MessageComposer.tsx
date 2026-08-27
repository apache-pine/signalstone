import { formatSize } from '../utils/format';

/**
 * The message input: plain text or Webex Markdown, one attachment via file
 * picker, drag-and-drop, or clipboard paste. Enter sends; Shift+Enter inserts
 * a newline. The draft is controlled by the parent so it survives a failed
 * send rather than being cleared optimistically.
 */
export function MessageComposer({
	draft,
	onDraftChange,
	file,
	onFileChange,
	sending,
	onSend,
	isThread,
}: {
	draft: string;
	onDraftChange: (value: string) => void;
	file?: File;
	onFileChange: (file: File | undefined) => void;
	sending: boolean;
	onSend: () => void;
	isThread: boolean;
}) {
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
			<textarea
				aria-label={isThread ? 'Write a reply' : 'Write a message'}
				placeholder={isThread ? 'Write a reply…' : 'Write a message…'}
				value={draft}
				onChange={(event) => onDraftChange(event.target.value)}
				onPaste={(event) => {
					const pasted = event.clipboardData.files[0];
					if (pasted) onFileChange(pasted);
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' && !event.shiftKey) {
						event.preventDefault();
						onSend();
					}
				}}
			/>
			<div>
				<label className="signalstone-attach" aria-label="Attach a file">
					📎
					<input type="file" onChange={(event) => onFileChange(event.target.files?.[0])} />
				</label>
				<button className="mod-cta" disabled={sending || (!draft.trim() && !file)} onClick={onSend}>
					{sending ? 'Sending…' : isThread ? 'Reply' : 'Send'}
				</button>
			</div>
		</div>
	);
}
