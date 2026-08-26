import { describe, expect, it, vi } from 'vitest';
import { PersonalTokenAuthProvider } from '../src/auth/PersonalTokenAuthProvider';
import { WebexError } from '../src/api/WebexError';

function storage(initial?: string) {
	let value = initial ?? '';
	return { setSecret: vi.fn((_id: string, next: string) => { value = next; }), getSecret: vi.fn(() => value || null), listSecrets: () => [] };
}

describe('PersonalTokenAuthProvider', () => {
	it('reports missing secrets without validating', async () => { const validate = vi.fn(); const auth = new PersonalTokenAuthProvider(storage(), validate); expect((await auth.validate()).status).toBe('not-configured'); expect(validate).not.toHaveBeenCalled(); });
	it('validates and never writes token into ordinary settings', async () => { const secrets = storage(); const auth = new PersonalTokenAuthProvider(secrets, async () => ({ id: 'me', displayName: 'Me', emails: [] })); expect((await auth.setToken(' token ')).status).toBe('connected'); expect(secrets.setSecret).toHaveBeenCalledWith('signalstone-webex-token', 'token'); });
	it('classifies a first 401 as invalid', async () => { const auth = new PersonalTokenAuthProvider(storage('bad'), async () => { throw WebexError.fromStatus(401, 'no'); }); expect((await auth.validate()).status).toBe('invalid-token'); });
});
