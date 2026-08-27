import { describe, expect, it } from 'vitest';
import { parseLinkHeader } from '../src/api/pagination';
import { parseFilenameFromContentDisposition } from '../src/utils/contentDisposition';
import { isImageContentType } from '../src/models/Attachment';
import { resolveSenderName } from '../src/utils/format';
import type { Space } from '../src/models/Space';

describe('safe parsing helpers', () => {
	it('parses pagination links', () => expect(parseLinkHeader('<https://webexapis.com/v1/messages?x=1>; rel="next"').next).toContain('x=1'));
	it('decodes attachment filenames', () => expect(parseFilenameFromContentDisposition("attachment; filename*=UTF-8''hello%20world.gif")).toBe('hello world.gif'));
	it('recognizes supported inline images including GIF', () => { expect(isImageContentType('image/gif')).toBe(true); expect(isImageContentType('text/html')).toBe(false); });
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
