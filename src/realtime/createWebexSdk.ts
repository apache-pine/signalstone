import '@webex/plugin-messages';
import '@webex/plugin-memberships';
import '@webex/plugin-rooms';
// Required even though Signalstone's own People lookups go through PeopleApi
// (requestUrl-backed), not this SDK plugin: @webex/common's event-envelope
// helper (used internally by messages/rooms/memberships to wrap every
// realtime event) calls `webex.people.get('me')` to cache the current user's
// own identity before it will emit anything. Without this registered, every
// single realtime event silently failed to envelope — "Unable to get person
// info for <resource> event envelope: Cannot read properties of undefined
// (reading 'get')" — which is why messages/rooms/memberships listeners
// never fired even after reaching `Live`. See docs/WEBEX_CAPABILITIES.md.
import '@webex/plugin-people';
import '@webex/plugin-logger';
import * as WebexCoreModule from '@webex/webex-core';
import type { WebexSdkFactory, WebexSdkHandle } from './WebexRealtimeProvider';

interface WebexCoreConstructor {
	new(options: {
		credentials: { access_token: string };
		config: {
			sdkType: string;
			hydra: string;
			hydraServiceUrl: string;
			credentials: { clientType: string };
			device: { validateDomains: boolean; ephemeral: boolean };
			logger: { level: string; historyLength: number };
		};
	}): unknown;
}

interface WebexCoreStatic {
	extend(definition: { webex: boolean; version: string }): WebexCoreConstructor;
}

interface CallDiagnosticMetricsStub {
	setDeviceInfo(device: unknown): void;
}

interface NewMetricsPlugin {
	callDiagnosticMetrics?: CallDiagnosticMetricsStub;
}

export interface WebexMessagingSdk extends WebexSdkHandle {
	internal: {
		mercury: { disconnect(): Promise<void> };
		newMetrics?: NewMetricsPlugin;
	};
}

/**
 * Creates a messaging-only build of the official Webex Browser SDK after
 * authentication succeeds. Scoped packages are all synchronized at the same
 * SDK version, as required by the SDK's supported modular-install guidance.
 */
export const createWebexSdk: WebexSdkFactory = async (token) => {
	const Constructor = resolveWebexCore(WebexCoreModule).extend({ webex: true, version: '3.7.0' });
	const sdk = new Constructor({
		credentials: { access_token: token },
		config: {
			sdkType: 'webex',
			hydra: 'https://api.ciscospark.com/v1',
			hydraServiceUrl: 'https://api.ciscospark.com/v1',
			credentials: { clientType: 'confidential' },
			device: { validateDomains: true, ephemeral: true },
			logger: { level: 'silent', historyLength: 0 },
		},
	});
	const messaging = sdk as WebexMessagingSdk;
	stubCallDiagnosticMetrics(messaging);
	return {
		messages: messaging.messages,
		rooms: messaging.rooms,
		memberships: messaging.memberships,
		disconnect: () => messaging.internal.mercury.disconnect(),
	};
};

/**
 * `@webex/internal-plugin-metrics` only builds its `callDiagnosticMetrics`
 * helper once the SDK-wide `ready` event fires, but `@webex/internal-plugin-device`
 * calls `newMetrics.callDiagnosticMetrics.setDeviceInfo(this)` as the very
 * first line of device registration — unconditionally, before that event has
 * any chance to fire. In this embedding `ready` does not fire in time (or at
 * all), so that call throws "Cannot read properties of undefined (reading
 * 'setDeviceInfo')" before device registration ever reaches the network.
 *
 * Signalstone does not want Cisco's call-diagnostic telemetry active anyway
 * (see PRIVACY.md), so rather than chasing why `ready` doesn't fire, this
 * substitutes a no-op for the one method device registration actually calls.
 * If `ready` does eventually fire, the SDK's real implementation overwrites
 * this stub, which is harmless. Verified by exhaustive search of the
 * messaging-relevant SDK packages that `setDeviceInfo` is the only method
 * called on `callDiagnosticMetrics` in this code path.
 */
export function stubCallDiagnosticMetrics(sdk: WebexMessagingSdk): void {
	const newMetrics = (sdk.internal.newMetrics ??= {});
	newMetrics.callDiagnosticMetrics ??= { setDeviceInfo: () => undefined };
}

/** Handles the SDK's differing ESM/CommonJS export shapes in tests and Obsidian. */
function resolveWebexCore(module: unknown): WebexCoreStatic {
	let candidate = module;
	for (let depth = 0; depth < 3; depth += 1) {
		if ((typeof candidate === 'object' && candidate !== null) || typeof candidate === 'function') {
			const possible = candidate as { extend?: unknown; default?: unknown };
			if (typeof candidate === 'function' && typeof possible.extend === 'function') return possible as WebexCoreStatic;
			candidate = possible.default;
			continue;
		}
		break;
	}
	throw new Error('Webex SDK core export is unavailable');
}
