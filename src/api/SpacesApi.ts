import type { WebexClient } from './WebexClient';
import type { Space, SpaceType } from '../models/Space';

interface SpaceDto {
	id: string;
	title?: string;
	type?: string;
	isLocked?: boolean;
	teamId?: string;
	lastActivity?: string;
	creatorId?: string;
	created?: string;
	ownerId?: string;
	description?: string;
}

function mapSpace(dto: SpaceDto): Space {
	return {
		id: dto.id,
		title: dto.title ?? '',
		type: (dto.type as SpaceType | undefined) ?? 'group',
		isLocked: dto.isLocked ?? false,
		teamId: dto.teamId,
		lastActivity: dto.lastActivity ?? dto.created ?? new Date(0).toISOString(),
		creatorId: dto.creatorId ?? '',
		created: dto.created ?? new Date(0).toISOString(),
		ownerId: dto.ownerId,
		description: dto.description,
	};
}

export interface ListSpacesQuery {
	type?: SpaceType;
	sortBy?: 'id' | 'lastactivity' | 'created';
	teamId?: string;
	max?: number;
}

export interface Page<T> {
	items: T[];
	nextUrl?: string;
}

/** Wraps the Webex Rooms API (`/v1/rooms`), which Signalstone presents to users as "spaces". */
export class SpacesApi {
	constructor(private readonly client: WebexClient) {}

	async list(query: ListSpacesQuery = {}, pageUrl?: string): Promise<Page<Space>> {
		const { data, links } = pageUrl
			? await this.client.request<{ items: SpaceDto[] }>({ url: pageUrl })
			: await this.client.request<{ items: SpaceDto[] }>({
					path: '/rooms',
					query: {
						type: query.type,
						sortBy: query.sortBy ?? 'lastactivity',
						teamId: query.teamId,
						max: query.max ?? 50,
					},
				});
		return { items: (data.items ?? []).map(mapSpace), nextUrl: links['next'] };
	}

	async get(spaceId: string): Promise<Space> {
		const { data } = await this.client.request<SpaceDto>({ path: `/rooms/${encodeURIComponent(spaceId)}` });
		return mapSpace(data);
	}

	async create(title: string, teamId?: string): Promise<Space> {
		const { data } = await this.client.request<SpaceDto>({
			method: 'POST',
			path: '/rooms',
			json: { title, teamId },
		});
		return mapSpace(data);
	}

	async rename(spaceId: string, title: string): Promise<Space> {
		const { data } = await this.client.request<SpaceDto>({
			method: 'PUT',
			path: `/rooms/${encodeURIComponent(spaceId)}`,
			json: { title },
		});
		return mapSpace(data);
	}

	/** Deletes the space (if the user is a moderator) or, for a non-moderator, leaves it. */
	async delete(spaceId: string): Promise<void> {
		await this.client.requestVoid({ method: 'DELETE', path: `/rooms/${encodeURIComponent(spaceId)}` });
	}
}
