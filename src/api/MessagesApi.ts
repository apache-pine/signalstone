import type { WebexClient } from './WebexClient';
import type { WebexMessage } from '../models/Message';
import type { SpaceType } from '../models/Space';
import type { Page } from './SpacesApi';
import { buildMultipartBody } from '../utils/multipart';

interface MessageDto {
	id: string;
	roomId: string;
	roomType?: string;
	parentId?: string;
	personId: string;
	personEmail: string;
	text?: string;
	markdown?: string;
	html?: string;
	files?: string[];
	mentionedPeople?: string[];
	mentionedGroups?: string[];
	attachments?: { contentType: string; content: unknown }[];
	created: string;
	updated?: string;
}

function mapMessage(dto: MessageDto): WebexMessage {
	return {
		id: dto.id,
		spaceId: dto.roomId,
		spaceType: (dto.roomType as SpaceType | undefined) ?? 'group',
		parentId: dto.parentId,
		personId: dto.personId,
		personEmail: dto.personEmail,
		text: dto.text,
		markdown: dto.markdown,
		html: dto.html,
		files: dto.files,
		mentionedPeople: dto.mentionedPeople,
		mentionedGroups: dto.mentionedGroups,
		attachments: dto.attachments,
		created: dto.created,
		updated: dto.updated,
		isEdited: dto.updated !== undefined,
	};
}

export interface ListMessagesQuery {
	spaceId: string;
	parentId?: string;
	/** ISO timestamp; only messages posted before this time are returned. */
	before?: string;
	/** Message ID; only messages posted before this message are returned. */
	beforeMessage?: string;
	max?: number;
}

export interface OutgoingFile {
	filename: string;
	contentType: string;
	data: ArrayBuffer;
}

export interface CreateMessageInput {
	spaceId?: string;
	toPersonId?: string;
	toPersonEmail?: string;
	parentId?: string;
	text?: string;
	markdown?: string;
	/** Webex's create-message endpoint currently accepts at most one file per message. */
	file?: OutgoingFile;
}

export interface UpdateMessageInput {
	spaceId: string;
	text?: string;
	markdown?: string;
}

/** Wraps the Webex Messages API (`/v1/messages`), including threaded replies via `parentId`. */
export class MessagesApi {
	constructor(private readonly client: WebexClient) {}

	async list(query: ListMessagesQuery, pageUrl?: string): Promise<Page<WebexMessage>> {
		const { data, links } = pageUrl
			? await this.client.request<{ items: MessageDto[] }>({ url: pageUrl })
			: await this.client.request<{ items: MessageDto[] }>({
					path: '/messages',
					query: {
						roomId: query.spaceId,
						parentId: query.parentId,
						before: query.before,
						beforeMessage: query.beforeMessage,
						max: query.max ?? 50,
					},
				});
		return { items: (data.items ?? []).map(mapMessage), nextUrl: links['next'] };
	}

	/** Lists replies to a thread's parent message. */
	async listReplies(spaceId: string, parentId: string, max = 100): Promise<WebexMessage[]> {
		const page = await this.list({ spaceId, parentId, max });
		return page.items;
	}

	async get(messageId: string): Promise<WebexMessage> {
		const { data } = await this.client.request<MessageDto>({ path: `/messages/${encodeURIComponent(messageId)}` });
		return mapMessage(data);
	}

	async create(input: CreateMessageInput): Promise<WebexMessage> {
		const fields: { name: string; value: string }[] = [];
		if (input.spaceId) fields.push({ name: 'roomId', value: input.spaceId });
		if (input.toPersonId) fields.push({ name: 'toPersonId', value: input.toPersonId });
		if (input.toPersonEmail) fields.push({ name: 'toPersonEmail', value: input.toPersonEmail });
		if (input.parentId) fields.push({ name: 'parentId', value: input.parentId });
		if (input.text !== undefined) fields.push({ name: 'text', value: input.text });
		if (input.markdown !== undefined) fields.push({ name: 'markdown', value: input.markdown });

		if (input.file) {
			const { contentType, body } = buildMultipartBody(fields, {
				name: 'files',
				filename: input.file.filename,
				contentType: input.file.contentType,
				data: input.file.data,
			});
			const { data } = await this.client.request<MessageDto>({
				method: 'POST',
				path: '/messages',
				raw: { contentType, body },
			});
			return mapMessage(data);
		}

		const { data } = await this.client.request<MessageDto>({
			method: 'POST',
			path: '/messages',
			json: {
				roomId: input.spaceId,
				toPersonId: input.toPersonId,
				toPersonEmail: input.toPersonEmail,
				parentId: input.parentId,
				text: input.text,
				markdown: input.markdown,
			},
		});
		return mapMessage(data);
	}

	async update(messageId: string, input: UpdateMessageInput): Promise<WebexMessage> {
		const { data } = await this.client.request<MessageDto>({
			method: 'PUT',
			path: `/messages/${encodeURIComponent(messageId)}`,
			json: { roomId: input.spaceId, text: input.text, markdown: input.markdown },
		});
		return mapMessage(data);
	}

	async delete(messageId: string): Promise<void> {
		await this.client.requestVoid({ method: 'DELETE', path: `/messages/${encodeURIComponent(messageId)}` });
	}
}
