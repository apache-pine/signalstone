import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugLog, setDebugLogging } from '../src/utils/logger';

describe('logger', () => {
	afterEach(() => {
		setDebugLogging(false);
	});

	it('does not log when debug logging is disabled', () => {
		const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		debugLog('test', 'should not appear');
		expect(spy).not.toHaveBeenCalled();
	});

	it('logs once enabled', () => {
		const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		setDebugLogging(true);
		debugLog('test', 'should appear', { a: 1 });
		expect(spy).toHaveBeenCalledWith('[Signalstone:test] should appear', { a: 1 });
	});
});
