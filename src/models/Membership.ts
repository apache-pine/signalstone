/** A Webex space membership record. */
export interface Membership {
	id: string;
	spaceId: string;
	personId: string;
	personEmail: string;
	personDisplayName?: string;
	personOrgId?: string;
	isModerator: boolean;
	isMonitor: boolean;
	created: string;
}
