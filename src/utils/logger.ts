/**
 * Opt-in debug logging for the realtime pipeline. Off by default; production
 * builds do not spew routine activity into the console unless the user
 * turns this on in settings specifically to diagnose a problem.
 *
 * Never pass a bearer token, Authorization header, or message body/text to
 * this — space/message/person IDs are opaque resource identifiers, not
 * secrets, and are fine to log; message content and tokens are not.
 */
let enabled = false;

export function setDebugLogging(value: boolean): void {
	enabled = value;
}

export function debugLog(scope: string, message: string, data?: Record<string, unknown>): void {
	if (!enabled) return;
	console.debug(`[Signalstone:${scope}] ${message}`, data ?? {});
}
