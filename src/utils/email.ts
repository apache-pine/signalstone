const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A permissive, client-side sanity check only — Webex is the actual source of truth on whether an address is valid/reachable. */
export function isValidEmail(value: string): boolean {
	return EMAIL_PATTERN.test(value.trim());
}
