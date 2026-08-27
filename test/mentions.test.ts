import { describe, expect, it } from 'vitest';
import { detectActiveMention, filterMentionCandidates, insertMention, mentionMarkupFor, resolveMentions, shouldOfferAllMention } from '../src/utils/mentions';
import type { Membership } from '../src/models/Membership';

const member = (overrides: Partial<Membership> = {}): Membership => ({
	id: 'm1',
	spaceId: 'room',
	personId: 'p1',
	personEmail: 'anthony.perez@example.com',
	personDisplayName: 'Anthony Perez',
	isModerator: false,
	isMonitor: false,
	isRoomHidden: false,
	created: '2026-01-01T00:00:00Z',
	...overrides,
});

describe('detectActiveMention', () => {
	it('detects an @ token at the start of the text', () => {
		expect(detectActiveMention('@ant', 4)).toEqual({ start: 0, query: 'ant' });
	});

	it('detects an @ token after whitespace', () => {
		expect(detectActiveMention('hey @ant', 8)).toEqual({ start: 4, query: 'ant' });
	});

	it('returns null once the mention token is closed by a space', () => {
		expect(detectActiveMention('hey @ant ', 9)).toBeNull();
	});

	it('does not trigger inside an email-shaped word, since the @ has no preceding whitespace', () => {
		expect(detectActiveMention('reach me at name@example.com', 20)).toBeNull();
	});

	it('returns an empty query right after typing just @', () => {
		expect(detectActiveMention('hi @', 4)).toEqual({ start: 3, query: '' });
	});
});

describe('filterMentionCandidates', () => {
	const members = [member(), member({ id: 'm2', personId: 'p2', personEmail: 'sam.lee@example.com', personDisplayName: 'Sam Lee' })];

	it('matches by display name, case-insensitively', () => {
		expect(filterMentionCandidates(members, 'ant').map((m) => m.id)).toEqual(['m1']);
	});

	it('matches by email when the display name does not match', () => {
		expect(filterMentionCandidates(members, 'sam.lee').map((m) => m.id)).toEqual(['m2']);
	});

	it('excludes the given person id, e.g. the current user', () => {
		expect(filterMentionCandidates(members, '', 'p1').map((m) => m.id)).toEqual(['m2']);
	});
});

describe('shouldOfferAllMention', () => {
	it('offers @all while the query is a prefix of "all"', () => {
		expect(shouldOfferAllMention('a')).toBe(true);
		expect(shouldOfferAllMention('al')).toBe(true);
		expect(shouldOfferAllMention('')).toBe(true);
	});

	it('does not offer @all once the query diverges from "all"', () => {
		expect(shouldOfferAllMention('anthony')).toBe(false);
	});
});

describe('mentionMarkupFor', () => {
	it('produces the documented personEmail markup for a member', () => {
		expect(mentionMarkupFor(member())).toEqual({ displayName: 'Anthony Perez', markup: '<@personEmail:anthony.perez@example.com|Anthony Perez>' });
	});

	it('falls back to the email as the display name when Webex has no personDisplayName', () => {
		expect(mentionMarkupFor(member({ personDisplayName: undefined })).displayName).toBe('anthony.perez@example.com');
	});

	it('produces the documented <@all> markup', () => {
		expect(mentionMarkupFor('all')).toEqual({ displayName: 'all', markup: '<@all>' });
	});
});

describe('insertMention', () => {
	it('replaces the @query token with friendly text and a trailing space, positioning the cursor after it', () => {
		const result = insertMention('hey @ant, are you free?', 4, 3, 'Anthony Perez');
		expect(result.text).toBe('hey @Anthony Perez , are you free?');
		expect(result.cursor).toBe('hey @Anthony Perez '.length);
	});
});

describe('resolveMentions', () => {
	it('substitutes friendly mention text with the real Webex markup at send time', () => {
		const resolved = resolveMentions('hey @Anthony Perez , are you free?', [{ displayName: 'Anthony Perez', markup: '<@personEmail:anthony.perez@example.com|Anthony Perez>' }]);
		expect(resolved).toBe('hey <@personEmail:anthony.perez@example.com|Anthony Perez> , are you free?');
	});

	it('leaves the text unchanged, harmlessly, when the friendly text was since edited away', () => {
		const resolved = resolveMentions('hey Ant, are you free?', [{ displayName: 'Anthony Perez', markup: '<@personEmail:x|Anthony Perez>' }]);
		expect(resolved).toBe('hey Ant, are you free?');
	});
});
