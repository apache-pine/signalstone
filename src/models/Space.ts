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
}
