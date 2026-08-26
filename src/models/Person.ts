export type PersonType = 'person' | 'bot' | 'appuser';

export type PersonStatus =
	| 'active'
	| 'call'
	| 'DoNotDisturb'
	| 'inactive'
	| 'meeting'
	| 'OutOfOffice'
	| 'pending'
	| 'presenting'
	| 'unknown';

/** A Webex directory entry, as returned by the People API. */
export interface Person {
	id: string;
	emails: string[];
	displayName: string;
	nickName?: string;
	firstName?: string;
	lastName?: string;
	avatar?: string;
	orgId: string;
	type: PersonType;
	status?: PersonStatus;
}
