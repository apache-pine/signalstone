import { describe, expect, it } from 'vitest';
import { extractCardFallback, isAdaptiveCard } from '../src/utils/adaptiveCard';
import type { CardAttachment } from '../src/models/Attachment';

const card = (content: unknown): CardAttachment => ({ contentType: 'application/vnd.microsoft.card.adaptive', content });

describe('isAdaptiveCard', () => {
	it('recognizes the documented content type', () => {
		expect(isAdaptiveCard(card({}))).toBe(true);
	});

	it('rejects anything else, e.g. a future/unknown card type', () => {
		expect(isAdaptiveCard({ contentType: 'application/vnd.microsoft.card.thumbnail', content: {} })).toBe(false);
	});
});

describe('extractCardFallback', () => {
	it('returns null for a non-card attachment', () => {
		expect(extractCardFallback({ contentType: 'application/json', content: {} })).toBeNull();
	});

	it('returns null when content is not a plain object at all (malformed/adversarial input)', () => {
		expect(extractCardFallback(card('not an object'))).toBeNull();
		expect(extractCardFallback(card(null))).toBeNull();
		expect(extractCardFallback(card([1, 2, 3]))).toBeNull();
	});

	it('extracts TextBlock text in document order', () => {
		const result = extractCardFallback(card({ body: [{ type: 'TextBlock', text: 'Approval needed' }, { type: 'TextBlock', text: 'From: Alex' }] }));
		expect(result?.lines).toEqual(['Approval needed', 'From: Alex']);
	});

	it('flattens FactSet entries as "title: value"', () => {
		const result = extractCardFallback(card({ body: [{ type: 'FactSet', facts: [{ title: 'Status', value: 'Pending' }, { title: 'Amount', value: '$50' }] }] }));
		expect(result?.lines).toEqual(['Status: Pending', 'Amount: $50']);
	});

	it('shows an Image only as its alt text, never the image itself (the url could point anywhere)', () => {
		const result = extractCardFallback(card({ body: [{ type: 'Image', url: 'https://evil.example.com/tracker.png', altText: 'Company logo' }] }));
		expect(result?.lines).toEqual(['[Image: Company logo]']);
	});

	it('recurses into Container and ColumnSet items', () => {
		const result = extractCardFallback(
			card({
				body: [
					{ type: 'Container', items: [{ type: 'TextBlock', text: 'Nested in a container' }] },
					{ type: 'ColumnSet', columns: [{ items: [{ type: 'TextBlock', text: 'Column one' }] }, { items: [{ type: 'TextBlock', text: 'Column two' }] }] },
				],
			}),
		);
		expect(result?.lines).toEqual(['Nested in a container', 'Column one', 'Column two']);
	});

	it('silently skips element types it does not recognize, rather than throwing', () => {
		const result = extractCardFallback(
			card({ body: [{ type: 'Input.Text', id: 'name' }, { type: 'ActionSet', actions: [] }, { type: 'TextBlock', text: 'Still extracted' }] }),
		);
		expect(result?.lines).toEqual(['Still extracted']);
	});

	it('extracts action titles separately from body text', () => {
		const result = extractCardFallback(card({ body: [{ type: 'TextBlock', text: 'Approve this request?' }], actions: [{ type: 'Action.Submit', title: 'Approve' }, { type: 'Action.Submit', title: 'Reject' }] }));
		expect(result?.lines).toEqual(['Approve this request?']);
		expect(result?.actionTitles).toEqual(['Approve', 'Reject']);
	});

	it('tolerates a body that is missing or the wrong type entirely', () => {
		expect(extractCardFallback(card({}))).toEqual({ lines: [], actionTitles: [] });
		expect(extractCardFallback(card({ body: 'not an array' }))).toEqual({ lines: [], actionTitles: [] });
	});

	it('does not stack-overflow on pathologically deep nesting', () => {
		let deepest: Record<string, unknown> = { type: 'TextBlock', text: 'buried' };
		for (let i = 0; i < 1000; i += 1) deepest = { type: 'Container', items: [deepest] };
		expect(() => extractCardFallback(card({ body: [deepest] }))).not.toThrow();
	});
});
