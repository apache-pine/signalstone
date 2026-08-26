import type { WebexClient } from './WebexClient';
import type { Person, PersonStatus, PersonType } from '../models/Person';

interface PersonDto {
	id: string;
	emails?: string[];
	displayName?: string;
	nickName?: string;
	firstName?: string;
	lastName?: string;
	avatar?: string;
	orgId?: string;
	type?: string;
	status?: string;
}

function mapPerson(dto: PersonDto): Person {
	return {
		id: dto.id,
		emails: dto.emails ?? [],
		displayName: dto.displayName ?? dto.emails?.[0] ?? 'Unknown',
		nickName: dto.nickName,
		firstName: dto.firstName,
		lastName: dto.lastName,
		avatar: dto.avatar,
		orgId: dto.orgId ?? '',
		type: (dto.type as PersonType | undefined) ?? 'person',
		status: dto.status as PersonStatus | undefined,
	};
}

export interface ListPeopleQuery {
	email?: string;
	displayName?: string;
	ids?: string[];
	max?: number;
}

/**
 * Wraps the Webex People API (`/v1/people`). Only ordinary user-level
 * directory lookups are used — no admin/org-management scopes.
 */
export class PeopleApi {
	constructor(private readonly client: WebexClient) {}

	async getMe(): Promise<Person> {
		const { data } = await this.client.request<PersonDto>({ path: '/people/me' });
		return mapPerson(data);
	}

	async get(personId: string): Promise<Person> {
		const { data } = await this.client.request<PersonDto>({ path: `/people/${encodeURIComponent(personId)}` });
		return mapPerson(data);
	}

	/** Directory search. Requires at least one of `email`, `displayName`, or `ids`. */
	async list(query: ListPeopleQuery): Promise<Person[]> {
		const { data } = await this.client.request<{ items: PersonDto[] }>({
			path: '/people',
			query: {
				email: query.email,
				displayName: query.displayName,
				id: query.ids?.join(','),
				max: query.max ?? 25,
			},
		});
		return (data.items ?? []).map(mapPerson);
	}
}
