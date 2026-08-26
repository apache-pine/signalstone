import { describe, expect, it, vi } from 'vitest';
import { ConversationService } from '../src/services/ConversationService';
import type { Space } from '../src/models/Space';

const space = (overrides: Partial<Space>): Space => ({ id: 'room', title: '', type: 'direct', isLocked: false, lastActivity: '2026-01-01T00:00:00Z', creatorId: 'me', created: '2026-01-01T00:00:00Z', ...overrides });

describe('ConversationService', () => {
	it('labels a direct conversation from the other membership', async () => {
		const service = new ConversationService(
			{ get: vi.fn(async () => space({ title: 'Server fallback' })) },
			{ list: vi.fn(async () => ({ items: [
				{ id: 'a', spaceId: 'room', personId: 'me', personEmail: 'me@example.com', personDisplayName: 'Me', isModerator: false, isMonitor: false, created: '' },
				{ id: 'b', spaceId: 'room', personId: 'other', personEmail: 'alex@example.com', personDisplayName: 'Alex Rivera', isModerator: false, isMonitor: false, created: '' },
			], nextUrl: undefined })) },
		);
		const [result] = await service.enrich([space({})], 'me');
		expect(result?.title).toBe('Alex Rivera');
		expect(result?.otherPerson?.email).toBe('alex@example.com');
	});

	it('retries missing group titles and retains a useful fallback', async () => {
		const get = vi.fn(async () => space({ type: 'group', title: 'Design review' }));
		const service = new ConversationService({ get }, { list: vi.fn() });
		const [resolved, fallback] = await service.enrich([space({ type: 'group' }), space({ id: 'broken', type: 'group' })], 'me');
		expect(resolved?.title).toBe('Design review');
		expect(fallback?.title).toBe('Design review');
		expect(get).toHaveBeenCalledTimes(2);
	});

	it('does not fail the conversation list when enrichment is unavailable', async () => {
		const service = new ConversationService({ get: vi.fn(async () => { throw new Error('temporary'); }) }, { list: vi.fn(async () => { throw new Error('temporary'); }) });
		const [result] = await service.enrich([space({})], 'me');
		expect(result?.title).toBe('Direct message');
	});
});
