# Webex capabilities

| Feature | Public capability | Implementation |
|---|---|---|
| Markdown | [Create Message](https://developer.webex.com/docs/api/v1/messages/create-a-message), [documented syntax](https://developer.webex.com/formatting-messages.html) | Outgoing: sent via the `markdown` field. Incoming: rendered as React elements (never HTML) for bold, italic, links, ordered/unordered lists with nesting, blockquotes, inline code, fenced code blocks, and mentions — see `src/utils/webexMarkdown.tsx` |
| Spaces/direct spaces | [Rooms API](https://developer.webex.com/docs/api/v1/rooms) | List/open/create/rename/leave implemented |
| Paginated history | [List Messages](https://developer.webex.com/docs/api/v1/messages/list-messages) | Implemented |
| File/GIF upload | Supported; one file per request | Upload and authenticated received preview/save implemented |
| Threads | Supported via `parentId` | Reply, focused thread, and inline reply context implemented |
| Edit/delete own message | Supported | Implemented for the authenticated user's messages |
| Mentions | Sending: documented markup (`<@personEmail:...\|Name>`, `<@personId:...\|Name>`, `<@all>`). Rendering: `<spark-mention>` — Webex's own tag, undocumented but confirmed live, see below | Incoming: renders both forms as a styled `@Name`/`@all` span. Outgoing: type `@` in a group space's composer for autocomplete against loaded members, plus `@all`; resolves to the documented send-time markup. Not offered in direct spaces (no one else to mention) or the edit-in-place box |
| Membership management | [Memberships API](https://developer.webex.com/docs/api/v1/memberships) | List, add by email, moderator toggle, and remove implemented for group spaces |
| Realtime | [Browser SDK](https://developer.webex.com/messaging/docs/sdks/browser) | Confirmed reaching `Live`; five issues found and fixed along the way (a crash, a CORS block, a room-id encoding mismatch, a missing plugin that silently broke every event envelope, and a conversation list that went stale once live) — see below |
| Notifications | Obsidian `Notice` API | Off / direct messages + @mentions / direct messages only / all messages, for top-level messages from someone else in a space that isn't open; optional message preview; no sound. Mention detection uses the Message resource's own documented `mentionedPeople`/`mentionedGroups` fields (https://developer.webex.com/docs/api/v1/messages), not markdown parsing |
| Read state | `memberships.on('seen', ...)` — public, live-wired; establishing/sending your own is private-only — see below | Receive-only, live-only: shows "Seen by …" on a message once a live receipt points at it |
| Emoji reactions | Private/internal only — see below | Intentionally not implemented |
| Adaptive cards | Public APIs exist | Safe fallback only |
| GIPHY | Intentionally excluded | Not implemented |

## Why not render with Obsidian's own MarkdownRenderer?

Obsidian ships a capable Markdown renderer (`MarkdownRenderer.render()`),
and it was considered for incoming messages instead of a hand-written one.
Rejected for two concrete reasons, not just preference:

- **Feature mismatch.** Obsidian's dialect includes wikilinks, embeds,
  callouts, and tags that aren't part of Webex Markdown. A message that
  happens to contain `[[...]]` or `#topic` text (meant literally, not as
  vault syntax) would render as if it were a vault reference — wrong, and
  confusing.
- **Embed risk.** Obsidian's embeds (`![[note]]`) can pull in and display
  content from the user's own vault. Feeding that renderer remote,
  untrusted Webex message text means a message could reference — and
  Obsidian would then render — vault content the sender never sent and has
  no business seeing, which is exactly the kind of thing "remote message
  content is untrusted input" is meant to prevent.

`src/utils/webexMarkdown.tsx` renders the same documented subset instead,
as plain React elements assembled from parsed string tokens — never an
HTML string, never `dangerouslySetInnerHTML`, and no code path that can
reference the vault. Covered by `test/webex-markdown.test.tsx`, including a
regression test asserting that literal `<script>`/`<img onerror>` text in a
message stays inert text rather than becoming a DOM element.

## Mentions render differently than they're sent — confirmed live, not documented

The documented mention syntax (`<@personEmail:...|Name>` etc.) is what you
*send* through the `markdown` field — that part matches the docs exactly.
What comes back is different: live testing (sending a mention to a real
space and inspecting the response Signalstone actually receives) showed
Webex rewrites a processed mention into its own tag,
`<spark-mention data-object-type="person" data-object-id="...">Name</spark-mention>`
— including in the response to Signalstone's own send call, not just on
messages from other clients. This tag isn't in the public Markdown
formatting docs; it's what Webex's own web/desktop client evidently renders
directly, and the only way to know about it was to look at a real response.

`webexMarkdown.tsx` recognizes both forms: the documented `<@...>` syntax
(kept, since it's the correct thing to send, and may still appear as
literal text before Webex has processed a message) and `<spark-mention>`
(the only form actually observed coming back from a live send). Both
extract just the inner display name and render it as a styled span — the
tag's attributes (`data-object-type`, `data-object-id`) are skipped over,
never read as anything meaningful, and the raw tag is never treated as
HTML. Covered by a regression test in `test/webex-markdown.test.tsx` using
the exact tag observed live.

## Space management: create, rename, leave

All three use `POST`/`PUT`/`DELETE /rooms` — the same public, documented
Rooms REST endpoints `SpacesApi` already wrapped for `list()`/`get()`; the
`create`/`rename`/`delete` methods existed in that file unused until now, so
this was mostly wiring rather than new API surface.

`DELETE /rooms/{id}` is Webex's single endpoint for both "delete" and
"leave": it deletes the space if the caller is a moderator, and simply
removes the caller's own membership otherwise. The "Leave this space" action
is deliberately offered only for group spaces, not direct ones — deleting a
1:1 space ends that conversation for both people, which isn't what a Leave
button should imply for a DM. Confirmed with a two-step "Confirm leave" click
in the member panel, the same pattern already used for removing another
member.

Creating a space adds members by email best-effort: a failed add (bad
address, not found, etc.) is reported back to the UI rather than silently
dropped or aborting the whole space, since Webex — not Signalstone —
determines whether a given address is valid.

## Read/unread state: receive-only, live-only — sending is private-only

Investigated directly against the installed SDK source, the same way as
emoji reactions below — this isn't a documentation gap, it's a real answer
about what the public API can and can't do, and it splits cleanly down the
middle: receiving someone else's read receipt is public; establishing or
sending your own is not.

The public, documented Rooms and Memberships REST resources
(`GET /rooms`, `GET /memberships`) carry no unread/last-seen field at all —
`Room` has `lastActivity` (when the space last had activity) but nothing
about *this user's* read position in it; `Membership` has no equivalent
either. Both `@webex/plugin-rooms` and `@webex/plugin-memberships` — the same
public plugins Signalstone already depends on for everything else — do have
extra methods that look like exactly what's needed:

- `rooms.listWithReadStatus()` / `rooms.getWithReadStatus()` — "For rooms
  where `lastActivityDate > lastSeenDate` the space can be considered to be
  'unread'" (`plugin-rooms/src/rooms.js`, JSDoc directly above each method).
- `memberships.listWithReadStatus()` — returns each member's `lastSeenId`/
  `lastSeenDate` (`plugin-memberships/src/memberships.js`).
- `memberships.updateLastSeen(message)` — the way a client would mark a
  message as read, described in its own JSDoc as sending a "read receipt".

All three call `this.webex.internal.conversation` directly — `.list()`,
`.get()`, and `.acknowledge()` respectively — not `service: 'hydra'`, the
public REST layer every other method in these same two files uses
(`rooms.list()`, `memberships.create()/update()/remove()`, etc. all pass
`service: 'hydra'`; these three don't). `webex.internal.conversation` is the
same private conversation service already ruled out for emoji reactions, for
the same reason: not `webexapis.com`, not a documented integration surface.
Establishing your own baseline read position on load (`listWithReadStatus`)
and sending your own read receipt (`updateLastSeen`) both require it — there
is no public way to do either, and that split is not expected to close
without Cisco documenting a public endpoint.

**What is public and implemented:** `memberships.on('seen', ...)` is a
documented event on the same public `.listen()/.on()` contract Signalstone
already uses for messages/rooms/memberships, confirmed dispatched end-to-end
from a real Mercury `acknowledge` activity (`memberships.js`'s
`onWebexApiEvent`, case `ACTIVITY_VERB.ACKNOWLEDGE` →
`trigger(EVENT_TYPE.SEEN, ...)`) — it reports when *someone else* (never the
current user, since Signalstone has no public way to generate its own)
has read up to a given message. `WebexRealtimeProvider` translates it into a
`membership-seen` realtime event; `SignalstoneStore` records it in
`readReceiptsBySpace` (keyed by space, then by person, replacing an older
receipt only with a newer one — an out-of-order event is dropped); a message
shows a "Seen by …" line once a receipt's `lastSeenMessageId` matches it.

Two real limitations, both direct consequences of being receive-only with no
baseline fetch, not implementation gaps: it only ever shows a receipt for a
message currently loaded in the visible list (a receipt pointing at an older,
not-yet-loaded message just doesn't render anywhere yet — not wrong, just
invisible until that message loads too), and it starts from nothing on every
launch — there is no "who had already read what" to restore, only what's
observed live from that point forward, consistent with Signalstone persisting
no message history generally.

Sending your own read receipt remains not implemented, and not planned unless
Cisco documents a public endpoint for it — same standing as emoji reactions.
Covered by tests in `test/realtime.test.ts` (the SDK event translation, and a
malformed payload correctly dropped) and `test/store.test.ts`
(`recordReadReceipt`: recording, ignoring the current user's own, and
ignoring an out-of-order older event).

## Emoji reactions: confirmed private-only, not implemented

Checked directly against the installed SDK source, not just documentation
search: `@webex/internal-plugin-conversation` has real reaction handling
(`sendReaction`/`deleteReaction`, sending an activity with
`objectType: 'reaction2'` to the conversation service), which is what the
native Webex clients use. The public `@webex/plugin-messages` package —
the one built on the documented REST API — has no reaction-related code at
all, and the public [Messages API reference](https://developer.webex.com/docs/api/v1/messages)
has no reaction endpoint or field. Cisco's own developer community has
confirmed the same conclusion.

This is the same `internal-plugin-*` territory already avoided for
realtime, for the same reason: it's not `webexapis.com`, not a documented
integration surface, and reverse-engineering it would mean guessing at an
undocumented, private protocol rather than using a supported API. Not
implemented, and not planned unless Cisco documents a public endpoint.

## Realtime: five issues found and fixed; confirmed reaching Live

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

### 5. The conversation list went stale once live, because its only refresh path stopped (fixed)

After issues 1–4 shipped and live testing confirmed instant message delivery
into an open conversation, a live tester reported two related symptoms once
the connection had settled into `Live` for a while: notifications for a
background space, and the conversation list's ordering, both felt like they
were "still based on polling" — arriving late, or not until something else
happened.

The conversation list half of this is traceable precisely, not a guess:
`state.spaces` only ever reorders on a `refresh-space-list` event, and that
event previously came from exactly two sources — `PollingFallback`'s 45-second
timer, or a live SDK `rooms` "created"/"updated" event. `ResilientRealtimeProvider`
stopped `PollingFallback` entirely the moment the primary connection reached
`live` (`if (status === 'live') { await this.fallback.stop(); ... }`), so the
45-second correction stopped happening at exactly the point the connection
became reliable. That left the list dependent entirely on Webex pushing a
live `rooms` event — and a room's `lastActivity` is a REST-layer field
computed from its most recent message, not necessarily something Mercury
pushes its own event for on every message. The result: while solidly `Live`,
the list could go stale indefinitely, only correcting itself on the rare
`rooms` event that did fire.

Unlike issues 1–4, this part isn't traced to an exact line in the installed
SDK source — there's no public documentation of Mercury's internal
`rooms`-event firing rules to confirm or rule out, and reproducing it
requires a live multi-client Webex session rather than something inspectable
offline. The fix is deliberately robust to that uncertainty rather than
depending on a specific theory being right:

**Fix, part one — stop depending on a `rooms` event at all for reordering.**
`SignalstoneStore.handleRealtime` already fetches the canonical message for
every `message-created`/`message-updated` event (needed for issue 3's
open-conversation logic). It now also calls a new `bumpSpaceActivity()`
helper with that message's own `spaceId`/`created` timestamp — updating and
re-sorting `state.spaces` immediately, the same way `loadSpaces()` sorts,
whether or not the space is the one currently open. `send()` calls it too, so
sending a message reorders your own view the same way. This makes the list
reorder instantly, in lockstep with message delivery, independent of whether
a `rooms` event ever fires. (A message in a space not yet in the loaded list
— e.g. one you were just added to — is a no-op here and still picked up by a
full space-list refresh instead.)

**Fix, part two — keep a low-cost safety net running even while live.**
`ResilientRealtimeProvider` no longer stops `PollingFallback` on reaching
`live`; it now runs continuously for the lifetime of the connection. Its
events are still filtered before reaching the rest of the app: the
per-conversation poll (`poll-tick`) stays suppressed while live, since live
delivery already covers the open conversation and firing it too would just be
a redundant REST call every 15 seconds — but `refresh-space-list` is now
always forwarded, live or not. That's one `GET /rooms` call every 45 seconds
(the same cost as before this fix, just no longer switched off), and it
independently catches anything part one's direct bump might miss — including,
via `notifyBackgroundActivity`'s existing `lastActivity` diffing, background
notifications, if the direct `message-created` → `maybeNotify` path (which
looks correct on inspection, and is the same code path already confirmed
instant for open conversations) turns out to have some as-yet-unconfirmed gap
of its own.

Covered by regression tests in `test/store.test.ts` (`bumpSpaceActivity`, both
the reorder and the "space not loaded yet" no-op case) and a rewritten
`test/realtime.test.ts` `ResilientRealtimeProvider` suite asserting the
fallback is never stopped by a live transition and that only `poll-tick` is
suppressed while live.

Still not fully confirmed live: whether the notification delay the tester
also reported was ever real, or was actually the conversation-list staleness
being perceived as "no notification." Worth re-testing specifically once this
fix is live, since notifications may turn out to have been working correctly
all along.

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

Polling now serves two distinct roles, since issue 5's fix. The 15-second
open-conversation poll remains purely a fallback: suppressed while live,
active whenever the SDK connection is unavailable, degraded, or reconnecting.
The 45-second space-list poll runs continuously regardless of connection
status — a fallback while not live, and a low-cost live safety net otherwise.
