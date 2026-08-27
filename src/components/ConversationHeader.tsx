import { useState } from 'react';
import type { PresenceCategory } from '../utils/presence';

/** Back button plus title, shared by the open-conversation and thread screens. Group spaces can rename in place via onRename. avatarUrl/presence are pre-resolved by Conversation.tsx (direct spaces only — see docs/WEBEX_CAPABILITIES.md, "Avatars and presence"). */
export function ConversationHeader({
	title,
	isThread,
	subtitle,
	onBack,
	onOpenMembers,
	onRename,
	avatarUrl,
	presence,
	startEditing,
}: {
	title: string;
	isThread: boolean;
	subtitle?: string;
	onBack: () => void;
	onOpenMembers?: () => void;
	/** Present only for the main conversation view of a group space — see Conversation.tsx. Webex enforces who may actually rename a space server-side. */
	onRename?: (title: string) => void;
	avatarUrl?: string;
	presence?: { category: PresenceCategory; label: string };
	/** Opens straight into rename editing — set when arriving here via the conversation list's "Rename…" context-menu item. Only consulted on first mount, like any useState initial value. */
	startEditing?: boolean;
}) {
	const [editing, setEditing] = useState(startEditing ?? false);
	const [draft, setDraft] = useState(title);

	const save = () => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== title) onRename?.(trimmed);
		setEditing(false);
	};

	return (
		<header>
			<button onClick={onBack} aria-label={isThread ? 'Back to conversation' : 'Back to conversations'}>
				←
			</button>
			{avatarUrl && <img className="signalstone-avatar" src={avatarUrl} alt="" loading="lazy" />}
			{editing ? (
				<div className="signalstone-rename">
					<input
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						aria-label="Space name"
						autoFocus
						onKeyDown={(event) => {
							if (event.key === 'Enter') save();
							if (event.key === 'Escape') { setDraft(title); setEditing(false); }
						}}
					/>
					<button onClick={save} aria-label="Save space name">
						✓
					</button>
					<button onClick={() => { setDraft(title); setEditing(false); }} aria-label="Cancel rename">
						×
					</button>
				</div>
			) : (
				<div>
					<div className="signalstone-header-title">
						<h2>{title}</h2>
						{presence && <span className={`signalstone-presence is-${presence.category}`} title={presence.label} aria-label={presence.label} />}
					</div>
					{subtitle && <small>{subtitle}</small>}
				</div>
			)}
			{onRename && !editing && (
				<button className="signalstone-header-action" onClick={() => { setDraft(title); setEditing(true); }} aria-label="Rename this space">
					✎
				</button>
			)}
			{onOpenMembers && (
				<button className="signalstone-header-action" onClick={onOpenMembers} aria-label="View members">
					👥
				</button>
			)}
		</header>
	);
}
