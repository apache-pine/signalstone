import type { WebexClient } from './WebexClient';
import type { Membership } from '../models/Membership';
import type { Page } from './SpacesApi';

interface MembershipDto {
	id: string;
	roomId: string;
	personId: string;
	personEmail: string;
	personDisplayName?: string;
	personOrgId?: string;
	isModerator?: boolean;
	isMonitor?: boolean;
	isRoomHidden?: boolean;
	created?: string;
}

function mapMembership(dto: MembershipDto): Membership {
	return {
		id: dto.id,
		spaceId: dto.roomId,
		personId: dto.personId,
		personEmail: dto.personEmail,
		personDisplayName: dto.personDisplayName,
		personOrgId: dto.personOrgId,
		isModerator: dto.isModerator ?? false,
		isMonitor: dto.isMonitor ?? false,
		isRoomHidden: dto.isRoomHidden ?? false,
		created: dto.created ?? new Date(0).toISOString(),
	};
}

export interface ListMembershipsQuery {
	/** Omit to list the authenticated user's own membership across every space they belong to (Webex's documented behavior for GET /memberships with no roomId) — used to bulk-resolve which spaces are hidden, see SignalstoneStore.loadSpaces. */
	spaceId?: string;
	personId?: string;
	personEmail?: string;
	max?: number;
}

/** Wraps the Webex Memberships API (`/v1/memberships`). */
export class MembershipsApi {
	constructor(private readonly client: WebexClient) {}

	async list(query: ListMembershipsQuery, pageUrl?: string): Promise<Page<Membership>> {
		const { data, links } = pageUrl
			? await this.client.request<{ items: MembershipDto[] }>({ url: pageUrl })
			: await this.client.request<{ items: MembershipDto[] }>({
					path: '/memberships',
					query: {
						roomId: query.spaceId,
						personId: query.personId,
						personEmail: query.personEmail,
						max: query.max ?? 100,
					},
				});
		return { items: (data.items ?? []).map(mapMembership), nextUrl: links['next'] };
	}

	async add(spaceId: string, personEmail: string, isModerator = false): Promise<Membership> {
		const { data } = await this.client.request<MembershipDto>({
			method: 'POST',
			path: '/memberships',
			json: { roomId: spaceId, personEmail, isModerator },
		});
		return mapMembership(data);
	}

	async setModerator(membershipId: string, isModerator: boolean): Promise<Membership> {
		const { data } = await this.client.request<MembershipDto>({
			method: 'PUT',
			path: `/memberships/${encodeURIComponent(membershipId)}`,
			json: { isModerator },
		});
		return mapMembership(data);
	}

	/** Hides or unhides a space from the authenticated user's own view, without leaving it. Direct spaces only in Signalstone's UI — see docs/WEBEX_CAPABILITIES.md. */
	async setHidden(membershipId: string, isRoomHidden: boolean): Promise<Membership> {
		const { data } = await this.client.request<MembershipDto>({
			method: 'PUT',
			path: `/memberships/${encodeURIComponent(membershipId)}`,
			json: { isRoomHidden },
		});
		return mapMembership(data);
	}

	async remove(membershipId: string): Promise<void> {
		await this.client.requestVoid({ method: 'DELETE', path: `/memberships/${encodeURIComponent(membershipId)}` });
	}
}
