import type { MembershipsApi } from '../api/MembershipsApi';
import type { SpacesApi } from '../api/SpacesApi';
import type { Space } from '../models/Space';

/** Resolves labels that the room-list response cannot reliably provide, especially for direct rooms. */
export class ConversationService {
	constructor(private readonly spacesApi: Pick<SpacesApi, 'get'>, private readonly membershipsApi: Pick<MembershipsApi, 'list'>) {}

	async enrich(spaces: Space[], selfId: string): Promise<Space[]> {
		const output = [...spaces];
		let cursor = 0;
		const worker = async (): Promise<void> => {
			while (cursor < output.length) {
				const index = cursor++;
				const space = output[index];
				if (!space) continue;
				output[index] = await this.enrichOne(space, selfId);
			}
		};
		await Promise.all(Array.from({ length: Math.min(4, output.length) }, worker));
		return output;
	}

	private async enrichOne(space: Space, selfId: string): Promise<Space> {
		let result = space;
		if (!result.title.trim()) {
			try { result = { ...result, ...(await this.spacesApi.get(result.id)) }; } catch { /* The list item remains usable. */ }
		}
		if (result.type !== 'direct') return { ...result, title: result.title.trim() || 'Unnamed space' };
		try {
			const page = await this.membershipsApi.list({ spaceId: result.id, max: 100 });
			const other = page.items.find((membership) => membership.personId !== selfId);
			if (!other) return { ...result, title: result.title.trim() || 'Direct message' };
			const displayName = other.personDisplayName?.trim() || other.personEmail;
			return { ...result, title: displayName, otherPerson: { id: other.personId, displayName, email: other.personEmail } };
		} catch {
			return { ...result, title: result.title.trim() || 'Direct message' };
		}
	}
}
