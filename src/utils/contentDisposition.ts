/** Parses a `Content-Disposition` header value to extract a filename, if present. */
export function parseFilenameFromContentDisposition(header: string | undefined | null): string | undefined {
	if (!header) return undefined;

	const starMatch = header.match(/filename\*=(?:UTF-8''|utf-8''|"UTF-8''"|"utf-8''")?([^;]+)/i);
	if (starMatch?.[1]) {
		try {
			return decodeURIComponent(starMatch[1].trim().replace(/^"|"$/g, ''));
		} catch {
			// fall through to the plain filename parameter
		}
	}

	const plainMatch = header.match(/filename="?([^";]+)"?/i);
	return plainMatch?.[1]?.trim();
}
