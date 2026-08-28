import type { CardFallbackContent } from '../utils/adaptiveCard';

/** A read-only rendering of what could be extracted from an Adaptive Card attachment — see utils/adaptiveCard.ts for what "extracted" means and why. */
export function AdaptiveCardFallback({ content }: { content: CardFallbackContent }) {
	return (
		<div className="signalstone-card-fallback">
			{content.lines.length > 0 ? (
				content.lines.map((line, index) => <p key={index}>{line}</p>)
			) : (
				<p className="signalstone-card-fallback-empty">This message includes a card with no preview available here.</p>
			)}
			{content.actionTitles.length > 0 && (
				<p className="signalstone-card-fallback-actions">Actions on this card (not interactive here): {content.actionTitles.join(', ')}</p>
			)}
			<small>Open this message in another Webex client for the full interactive card.</small>
		</div>
	);
}
