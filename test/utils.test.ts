import { describe, expect, it } from 'vitest';
import { parseLinkHeader } from '../src/api/pagination';
import { parseFilenameFromContentDisposition } from '../src/utils/contentDisposition';
import { isImageContentType } from '../src/models/Attachment';
import { formatDate, resolveSenderName } from '../src/utils/format';
import { isValidEmail } from '../src/utils/email';
import { presenceInfo } from '../src/utils/presence';
import type { Space } from '../src/models/Space';

describe('safe parsing helpers', () => {
	it('parses pagination links', () => expect(parseLinkHeader('<https://webexapis.com/v1/messages?x=1>; rel="next"').next).toContain('x=1'));
	it('decodes attachment filenames', () => expect(parseFilenameFromContentDisposition("attachment; filename*=UTF-8''hello%20world.gif")).toBe('hello world.gif'));
	it('recognizes supported inline images including GIF', () => { expect(isImageContentType('image/gif')).toBe(true); expect(isImageContentType('text/html')).toBe(false); });
});

describe('isValidEmail', () => {
	it('accepts a well-formed address, tolerating surrounding whitespace', () => {
		expect(isValidEmail('  anthony.perez@example.com  ')).toBe(true);
	});

	it('rejects a bare name with no @ or domain', () => {
		expect(isValidEmail('anthony')).toBe(false);
		expect(isValidEmail('anthony@example')).toBe(false);
	});
});

describe('presenceInfo', () => {
	it('returns undefined when there is no status at all, so no dot renders', () => {
		expect(presenceInfo(undefined)).toBeUndefined();
	});

	it('categorizes busy-shaped statuses (call, meeting, presenting, DoNotDisturb) as busy', () => {
		expect(presenceInfo('call')?.category).toBe('busy');
		expect(presenceInfo('meeting')?.category).toBe('busy');
		expect(presenceInfo('presenting')?.category).toBe('busy');
		expect(presenceInfo('DoNotDisturb')?.category).toBe('busy');
	});

	it('categorizes active as available', () => {
		expect(presenceInfo('active')).toEqual({ category: 'available', label: 'Active' });
	});

	it('still returns a renderable (gray, "unknown") entry for the documented "unknown" status value, distinct from no status at all', () => {
		expect(presenceInfo('unknown')).toEqual({ category: 'unknown', label: 'Status unknown' });
	});
});

describe('resolveSenderName', () => {
	const directSpace: Space = { id: 'space', title: 'Anthony Perez', type: 'direct', isLocked: false, lastActivity: '2026-01-01T00:00:00Z', creatorId: 'them', created: '2026-01-01T00:00:00Z' };
	const groupSpace: Space = { ...directSpace, type: 'group', title: 'Data Team' };

	it('prefers a real personDisplayName when Webex provides one', () => {
		expect(resolveSenderName({ personDisplayName: 'Anthony Perez', personEmail: 'anthony.perez@example.com' }, groupSpace)).toBe('Anthony Perez');
	});

	it('falls back to the direct space title, since Webex auto-populates it with the other person\'s name', () => {
		expect(resolveSenderName({ personEmail: 'anthony.perez@example.com' }, directSpace)).toBe('Anthony Perez');
	});

	it('falls back to the raw email in a group space, where the space title is not a specific person', () => {
		expect(resolveSenderName({ personEmail: 'anthony.perez@example.com' }, groupSpace)).toBe('anthony.perez@example.com');
	});

	it('falls back to the raw email when no space is known', () => {
		expect(resolveSenderName({ personEmail: 'anthony.perez@example.com' }, undefined)).toBe('anthony.perez@example.com');
	});
});

describe('formatDate time format', () => {
	const when = '2026-01-01T14:30:00Z';

	it('defaults to "system", leaving hour12 to the locale (matches the original unconditional behavior)', () => {
		expect(formatDate(when)).toBe(formatDate(when, 'system'));
	});

	// Deliberately timezone-agnostic: whichever local hour this maps to, a
	// forced 12-hour clock always carries an AM/PM marker and a forced
	// 24-hour clock never does — that distinction is what the setting controls.
	it('forces a 12-hour clock when requested', () => {
		expect(formatDate(when, '12-hour')).toMatch(/\b(AM|PM)\b/);
	});

	it('forces a 24-hour clock when requested', () => {
		expect(formatDate(when, '24-hour')).not.toMatch(/\b(AM|PM)\b/);
	});
});
