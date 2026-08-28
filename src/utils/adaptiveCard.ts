import type { CardAttachment } from '../models/Attachment';

/** Webex's documented content type for an Adaptive Card attachment. */
const ADAPTIVE_CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive';

export interface CardFallbackContent {
	/** Plain text extracted from the card's static elements (TextBlock, FactSet, Image alt text), in document order. */
	lines: string[];
	/** Titles of the card's action buttons (Action.Submit, Action.OpenUrl, etc.) — informational only, not clickable. */
	actionTitles: string[];
}

export function isAdaptiveCard(attachment: CardAttachment): boolean {
	return attachment.contentType === ADAPTIVE_CARD_CONTENT_TYPE;
}

/**
 * Best-effort, read-only extraction of an Adaptive Card's static text —
 * deliberately not a renderer. Adaptive Cards support buttons, text/date/
 * choice inputs, and other genuinely interactive elements that would need
 * real interactivity (and, for actions, a round trip to Webex's
 * POST /attachment/actions) to mean anything; none of that is implemented
 * here (see docs/WEBEX_CAPABILITIES.md, "Adaptive cards"). This only walks
 * the handful of *static* element types bots commonly use for
 * already-decided content (TextBlock, FactSet, Container, ColumnSet, and an
 * Image's alt text — never the image itself: its `url` could point anywhere,
 * and loading it would mean fetching from a third party the sender chose,
 * not Webex, on this app's behalf), so a card at least shows something
 * instead of nothing.
 *
 * Card JSON is untrusted, sender-controlled input, so this never assumes a
 * well-formed shape: every field is type-checked before use, recursion is
 * depth-limited, and an unrecognized element type is silently skipped
 * rather than guessed at. Returns null for a non-card attachment, or a card
 * whose `content` isn't a plain object at all.
 */
export function extractCardFallback(attachment: CardAttachment): CardFallbackContent | null {
	if (!isAdaptiveCard(attachment)) return null;
	const card = asRecord(attachment.content);
	if (!card) return null;

	const lines: string[] = [];
	collectText(card.body, lines, 0);

	const actionTitles: string[] = [];
	if (Array.isArray(card.actions)) {
		for (const action of card.actions) {
			const title = asRecord(action)?.title;
			if (typeof title === 'string' && title.trim()) actionTitles.push(title.trim());
		}
	}

	return { lines, actionTitles };
}

const MAX_DEPTH = 20;

function collectText(nodes: unknown, lines: string[], depth: number): void {
	if (depth > MAX_DEPTH || !Array.isArray(nodes)) return;

	for (const node of nodes) {
		const element = asRecord(node);
		if (!element) continue;

		switch (element.type) {
			case 'TextBlock': {
				if (typeof element.text === 'string' && element.text.trim()) lines.push(element.text.trim());
				break;
			}
			case 'FactSet': {
				if (!Array.isArray(element.facts)) break;
				for (const fact of element.facts) {
					const factRecord = asRecord(fact);
					if (factRecord && typeof factRecord.title === 'string' && typeof factRecord.value === 'string') {
						lines.push(`${factRecord.title}: ${factRecord.value}`);
					}
				}
				break;
			}
			case 'Image': {
				if (typeof element.altText === 'string' && element.altText.trim()) lines.push(`[Image: ${element.altText.trim()}]`);
				break;
			}
			case 'Container': {
				collectText(element.items, lines, depth + 1);
				break;
			}
			case 'ColumnSet': {
				if (!Array.isArray(element.columns)) break;
				for (const column of element.columns) {
					collectText(asRecord(column)?.items, lines, depth + 1);
				}
				break;
			}
			default:
				// Input.*, ActionSet, Media, RichTextBlock, and anything else
				// unrecognized: skipped, not guessed at.
				break;
		}
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
