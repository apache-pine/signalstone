/** Back button plus title, shared by the open-conversation and thread screens. */
export function ConversationHeader({
	title,
	isThread,
	subtitle,
	onBack,
	onOpenMembers,
}: {
	title: string;
	isThread: boolean;
	subtitle?: string;
	onBack: () => void;
	onOpenMembers?: () => void;
}) {
	return (
		<header>
			<button onClick={onBack} aria-label={isThread ? 'Back to conversation' : 'Back to conversations'}>
				←
			</button>
			<div>
				<h2>{title}</h2>
				{subtitle && <small>{subtitle}</small>}
			</div>
			{onOpenMembers && (
				<button className="signalstone-header-action" onClick={onOpenMembers} aria-label="View members">
					👥
				</button>
			)}
		</header>
	);
}
