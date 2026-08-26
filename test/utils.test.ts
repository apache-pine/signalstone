import { describe, expect, it } from 'vitest';
import { parseLinkHeader } from '../src/api/pagination';
import { parseFilenameFromContentDisposition } from '../src/utils/contentDisposition';
import { isImageContentType } from '../src/models/Attachment';

describe('safe parsing helpers', () => {
	it('parses pagination links', () => expect(parseLinkHeader('<https://webexapis.com/v1/messages?x=1>; rel="next"').next).toContain('x=1'));
	it('decodes attachment filenames', () => expect(parseFilenameFromContentDisposition("attachment; filename*=UTF-8''hello%20world.gif")).toBe('hello world.gif'));
	it('recognizes supported inline images including GIF', () => { expect(isImageContentType('image/gif')).toBe(true); expect(isImageContentType('text/html')).toBe(false); });
});
