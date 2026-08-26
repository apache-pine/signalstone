export type SpaceType = 'direct' | 'group';

/** A Webex space ("room" in the REST API) the authenticated user belongs to. */
export interface Space {
	id: string;
	title: string;
	type: SpaceType;
	isLocked: boolean;
	teamId?: string;
	lastActivity: string;
	creatorId: string;
	created: string;
	ownerId?: string;
	description?: string;
	/** Populated locally for direct spaces so the UI can show the other person's name. */
	otherPerson?: {
		id: string;
		displayName: string;
		email?: string;
		avatar?: string;
	};
}
