# Webex capabilities

| Feature | Public capability | Implementation |
|---|---|---|
| Text/limited Markdown | [Create Message](https://developer.webex.com/docs/api/v1/messages/create-a-message) | Implemented |
| Spaces/direct spaces | [Rooms API](https://developer.webex.com/docs/api/v1/rooms) | List/open implemented |
| Paginated history | [List Messages](https://developer.webex.com/docs/api/v1/messages/list-messages) | Implemented |
| File/GIF upload | Supported; one file per request | Upload and authenticated received preview/save implemented |
| Threads | Supported via `parentId` | Reply, focused thread, and inline reply context implemented |
| Edit/delete own message | Supported | Implemented for the authenticated user's messages |
| Mentions | Supported with documented markup | API pass-through; autocomplete pending |
| Membership management | [Memberships API](https://developer.webex.com/docs/api/v1/memberships) | List, add by email, moderator toggle, and remove implemented for group spaces; space creation/rename UI still pending |
| Realtime | [Browser SDK](https://developer.webex.com/messaging/docs/sdks/browser) | Confirmed reaching `Live`; four issues found and fixed along the way (a crash, a CORS block, a room-id encoding mismatch, and a missing plugin that silently broke every event envelope) — see below |
| Notifications | Obsidian `Notice` API | Off / direct messages only / all messages, for top-level messages from someone else in a space that isn't open; no sound |
| Read state | SDK membership last-seen behavior exists | Not wired; no canonical-unread claim |
| Emoji reactions | Not exposed in reviewed ordinary REST API | Not implemented |
| Adaptive cards | Public APIs exist | Safe fallback only |
| GIPHY | Intentionally excluded | Not implemented |

## Realtime: four issues found and fixed; confirmed reaching Live

Getting the Webex Browser SDK to connect from inside Obsidian was an
iterative process of live-testing, each fix revealing the next real blocker.
Live testing has since confirmed the connection reaches `Live` and delivers
messages immediately. Documented here in order, so a future contributor (or
a new live-test failure) has the full trail rather than a guess.

### 1. A synchronous crash before any network call (fixed)

An early live test failed with "Webex device registration failed" and no
detail. A follow-up live test surfaced the real underlying error —
`Cannot read properties of undefined (reading 'setDeviceInfo')` — traceable
in the installed SDK source:

- `@webex/internal-plugin-metrics` only builds its `callDiagnosticMetrics`
  helper once the SDK-wide `ready` event fires
  (`src/new-metrics.ts`: `this.webex.once('ready', () => { this.callDiagnosticMetrics = ... })`).
- `@webex/internal-plugin-device` calls
  `webex.internal.newMetrics.callDiagnosticMetrics.setDeviceInfo(this)`
  unconditionally as the *first line* of device registration
  (`src/device.js`, `_registerInternal()`) — before any network request is
  made, and regardless of whether `ready` has fired.
- In this embedding, `ready` does not fire in time, so `callDiagnosticMetrics`
  is still `undefined` and that call throws synchronously. Device
  registration never reached the network at this point.

**Fix:** `createWebexSdk.ts` stubs `callDiagnosticMetrics` with a no-op
`setDeviceInfo` immediately after SDK construction — the only method called
on it in this code path (confirmed by exhaustive search). This isn't a
workaround around wanted behavior: Signalstone doesn't want Cisco's
call-diagnostic telemetry active anyway (see `PRIVACY.md`), so
short-circuiting this hook is the correct outcome. Covered by a unit test in
`test/realtime.test.ts`.

### 2. CORS blocks the SDK's own HTTP client (fixed)

With the crash fixed, the next live test reached a real network call, which
failed with `SDK request failed (0)`. Status `0` with no response is the
textbook signature of a browser-level CORS block, and Obsidian's own DevTools
Network tab confirmed it explicitly (`CORS error`, on the `catalog?...&format=hostmap`
service-discovery request, made as `xhr`).

This is now understood precisely, not inferred:

- Obsidian's renderer is an ordinary Electron/Chromium context subject to
  normal browser CORS — that's exactly why `requestUrl` exists: it routes
  through Electron's main process instead of the renderer's `fetch`/XHR,
  which is what lets it bypass CORS. Signalstone's own REST calls all use
  `requestUrl`, which is why they work.
- `@webex/http-core` has a browser-specific transport
  (`request/request.shim.js`) that makes every request via a bare
  `new XMLHttpRequest()` — fully subject to the renderer's CORS enforcement.
  It doesn't use, and has no way to use, `requestUrl`.
- Cisco's device/service-discovery endpoints (under the `internal-plugin-*`
  npm scope, itself a signal these aren't a documented third-party
  integration surface) don't return CORS headers permitting Obsidian's
  renderer origin.

**Fix:** `src/realtime/RequestUrlXhrShim.ts` implements the small subset of
the `XMLHttpRequest` interface that `@webex/http-core`'s transport actually
uses (verified by reading both `request/request.shim.js` and `lib/xhr.js`:
`open`/`setRequestHeader`/`send`/`abort`, `readyState`/`status`/
`response(Text)`/`getAllResponseHeaders`, and the `onreadystatechange`/
`onload`/`onerror`/`onabort` handlers), backed by `requestUrl` internally.
`esbuild.config.mjs` uses esbuild's `define` to redirect the bare
`XMLHttpRequest` identifier — *only as referenced inside `@webex/http-core`'s
bundled code* — to this shim class. This does not touch Obsidian's real
`window.XMLHttpRequest`, and a search across every `@webex/*` package
confirmed only these two files reference the bare identifier, so nothing
else in the dependency tree is affected. Covered by unit tests in
`test/xhr-shim.test.ts` (success, network-failure, abort, and
`responseType: 'arraybuffer'` paths).

### 3. Realtime events use a different room-id encoding than REST (fixed)

With both of the above fixed, live testing confirmed the SDK reaches `Live`
and delivers new messages immediately — with one remaining bug: opening a
conversation right after a message arrived showed it correctly, but a
message arriving *while* that conversation was already open didn't appear
until the next poll.

The cause: `SignalstoneStore.handleRealtime` decided whether an incoming
realtime event belonged to the currently open conversation by comparing
`event.spaceId` (from the SDK's Mercury event payload) directly against
`state.selectedSpaceId` (always a REST/Hydra-format id, since that's what
`SpacesApi`/`MessagesApi` return). These two do not reliably use the same
room-id encoding — Webex's internal realtime protocol and its public Hydra
REST API are known to disagree on this. When they didn't match, a message
for the open conversation was routed down the "background" path instead.

Tellingly, this never caused a spurious notification while the conversation
was open: `maybeNotify` independently re-derives the space match using the
*freshly-fetched* message's own `spaceId` (REST-canonical, since it comes
from `messagesApi.get()`), so notification-suppression was already correct
— only the view-update path was comparing the wrong pair of ids.

**Fix:** REST remains the source of truth. `handleRealtime` now always
fetches the canonical message first and decides "is this the open
conversation" from *its* `spaceId`, never from `event.spaceId`. Deletions
(where there's no message left to fetch) are simply attempted against local
state unconditionally — filtering an array for an id it doesn't contain is a
harmless no-op, which sidesteps needing a reliable id comparison for that
case at all. Covered by a regression test in `test/store.test.ts` that
deliberately sets `event.spaceId` to a different value than the fetched
message's `spaceId`, reproducing the exact bug.

### 4. Missing `@webex/plugin-people` silently broke every event envelope (fixed)

After issue 3 shipped, a live test reported no change: messages still
weren't appearing live in an open conversation, and background notifications
were inconsistent. Debug logging (see below) wasn't even needed this time —
the browser console showed the real error directly, once for each of
messages/rooms/memberships, right as `.listen()` was called:

```
Uncaught (in promise) Error: Unable to get person info for messages event
envelope: Cannot read properties of undefined (reading 'get')
```

Traced to `@webex/common/src/event-envelope.js`, used internally by the
messages/rooms/memberships plugins to wrap every realtime event:

```js
export async function ensureMyIdIsAvailable(webex) {
  if ('me' in webex.internal) return Promise.resolve();
  return webex.people.get('me').then((person) => { webex.internal.me = person; });
}
```

Signalstone's SDK setup only registered `@webex/plugin-messages`,
`@webex/plugin-memberships`, `@webex/plugin-rooms`, and `@webex/plugin-logger`
— deliberately excluding `@webex/plugin-people`, since Signalstone's own
directory lookups go through `PeopleApi` (`requestUrl`-backed), not the SDK.
That was the oversight: the messaging plugins' own *internal* event-envelope
machinery depends on `webex.people` regardless, to cache the current user's
identity before it will wrap and emit anything. With `webex.people`
undefined, this threw on every call, `'me' in webex.internal` never became
true, and — because of a real bug in that SDK helper itself (the `.catch()`
handler creates a `Promise.reject(...)` but never returns it, so the error
becomes an orphaned unhandled rejection instead of propagating to the
caller) — the failure was silent and total: every realtime event failed to
envelope, with no exception ever reaching Signalstone's own code to catch or
log.

**Fix:** `createWebexSdk.ts` also imports `@webex/plugin-people` (version
3.7.0, matching every other `@webex/*` package here) as a direct dependency.
It's already lightweight — its own dependencies (`@webex/common`,
`@webex/internal-plugin-mercury`, `@webex/webex-core`) were already pulled
in transitively — and the bundle grew by under 5 KB.

### What this proves, and what's still open

Issue 3's fix was real and still correct (a genuine encoding mismatch, now
covered by a regression test), but it's possible it was never actually
observable in practice until issue 4 was also fixed — if literally zero
realtime events were ever successfully enveloped, no message-created
listener call ever fired for issue 3's logic to run on, live-updating the
open conversation or otherwise. Issue 4 is the more likely explanation for
"no change was reported" between those two fixes. Both fixes are correct
and stay; only live testing can confirm they're together sufficient.

Not yet live-verified: reconnect/backoff behavior after a genuine network
interruption, and behavior across an Obsidian restart. If a new live test
surfaces a failure, that's new information to trace the same way — the
opt-in "Debug logging" setting added alongside issue 4 (see
`src/utils/logger.ts`) traces every hop from raw SDK event through to the
final notify/patch decision, specifically to make that tracing fast rather
than another guess-and-check round.

Polling (15s for the open conversation, 45s for the space list) remains the
automatic fallback whenever the SDK connection is unavailable, degraded, or
reconnecting.
