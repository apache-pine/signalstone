import type { PersonStatus } from '../models/Person';

export type PresenceCategory = 'available' | 'busy' | 'away' | 'unknown';

/** A human-readable label plus a coarse category (for a colored dot) for each documented People API status value. */
const PRESENCE_INFO: Record<PersonStatus, { category: PresenceCategory; label: string }> = {
	active: { category: 'available', label: 'Active' },
	call: { category: 'busy', label: 'On a call' },
	meeting: { category: 'busy', label: 'In a meeting' },
	presenting: { category: 'busy', label: 'Presenting' },
	DoNotDisturb: { category: 'busy', label: 'Do not disturb' },
	OutOfOffice: { category: 'away', label: 'Out of office' },
	inactive: { category: 'away', label: 'Inactive' },
	pending: { category: 'away', label: 'Invitation pending' },
	unknown: { category: 'unknown', label: 'Status unknown' },
};

/** Returns undefined for a person with no status at all (distinct from the documented "unknown" status value), so callers can skip rendering a dot entirely rather than showing one for "unknown". */
export function presenceInfo(status: PersonStatus | undefined): { category: PresenceCategory; label: string } | undefined {
	if (!status) return undefined;
	return PRESENCE_INFO[status];
}
