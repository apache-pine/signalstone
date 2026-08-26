import type { SpaceType } from './Space';
import type { CardAttachment } from './Attachment';

export interface Mention {
	kind: 'person' | 'all';
	personId?: string;
	personEmail?: string;
	displayName?: string;
}

/** Internal representation of a Webex message, normalized for the UI. */
export interface WebexMessage {
	id: string;
	spaceId: string;
	spaceType: SpaceType;
	parentId?: string;
	personId: string;
	personEmail: string;
	personDisplayName?: string;
	text?: string;
	markdown?: string;
	html?: string;
	files?: string[];
	mentionedPeople?: string[];
	mentionedGroups?: string[];
	attachments?: CardAttachment[];
	created: string;
	updated?: string;
	/** True once Webex reports an `updated` timestamp, i.e. an edit. */
	isEdited: boolean;
}

export interface DraftMessage {
	spaceId: string;
	parentId?: string;
	text: string;
	markdown?: string;
	mentions: Mention[];
	files: File[];
}
