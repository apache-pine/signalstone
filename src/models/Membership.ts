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
	/** Whether the authenticated user has hidden this space from their own view (a per-membership flag; direct spaces only in Signalstone's UI — see SignalstoneStore.hideSpace/unhideSpace). */
	isRoomHidden: boolean;
}
