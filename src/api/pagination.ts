/**
 * Parses an RFC 5988 `Link` header as returned by Webex list endpoints, e.g.
 * `<https://webexapis.com/v1/messages?...>; rel="next"`.
 */
export function parseLinkHeader(header: string | undefined | null): Record<string, string> {
	const links: Record<string, string> = {};
	if (!header) return links;

	for (const part of header.split(',')) {
		const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
		if (match?.[1] && match[2]) {
			links[match[2]] = match[1];
		}
	}
	return links;
}
