# Webex capabilities

| Feature | Public capability | Implementation |
|---|---|---|
| Markdown | [Create Message](https://developer.webex.com/docs/api/v1/messages/create-a-message), [documented syntax](https://developer.webex.com/formatting-messages.html) | Outgoing: sent via the `markdown` field. Incoming: rendered as React elements (never HTML) for bold, italic, links, ordered/unordered lists with nesting, blockquotes, inline code, fenced code blocks, and mentions — see `src/utils/webexMarkdown.tsx` |
| Spaces/direct spaces | [Rooms API](https://developer.webex.com/docs/api/v1/rooms) | List/open/create/rename/leave implemented via a right-click menu; direct spaces can also be hidden/unhidden without leaving them (confirmed rejected for group spaces — see below); favoriting (any space, always sorts first) is local-only, no public API for it exists |
| Paginated history | [List Messages](https://developer.webex.com/docs/api/v1/messages/list-messages) | Implemented |
| File/GIF upload | Supported; one file per request | Upload and authenticated received preview/save implemented |
| Threads | Supported via `parentId` | Reply, focused thread, and inline reply context implemented |
| Edit/delete own message | Supported | Implemented for the authenticated user's messages |
| Mentions | Sending: documented markup (`<@personEmail:...\|Name>`, `<@personId:...\|Name>`, `<@all>`). Rendering: `<spark-mention>` — Webex's own tag, undocumented but confirmed live, see below | Incoming: renders both forms as a styled `@Name`/`@all` span. Outgoing: type `@` in a group space's composer for autocomplete against loaded members, plus `@all`; resolves to the documented send-time markup. Not offered in direct spaces (no one else to mention) or the edit-in-place box |
| Membership management | [Memberships API](https://developer.webex.com/docs/api/v1/memberships) | List, add by email, moderator toggle, and remove implemented for group spaces |
| Directory search / avatars / presence | [People API](https://developer.webex.com/docs/api/v1/people) | Name/email search implemented, results always show avatar/presence. Also available (four independent settings) in the conversation list and open direct-message conversations, direct spaces only — no avatar/presence concept exists for a group space. Refreshed on the conversation-list poll cadence, not live — see below |
| Realtime | [Browser SDK](https://developer.webex.com/messaging/docs/sdks/browser) | Confirmed reaching `Live`; five issues found and fixed along the way (a crash, a CORS block, a room-id encoding mismatch, a missing plugin that silently broke every event envelope, and a conversation list that went stale once live) — see below |
| Notifications | Obsidian `Notice` API | Off / direct messages + @mentions / direct messages only / all messages, for top-level messages from someone else in a space that isn't open; optional message preview; no sound. Mention detection uses the Message resource's own documented `mentionedPeople`/`mentionedGroups` fields (https://developer.webex.com/docs/api/v1/messages), not markdown parsing |
| Read state | `memberships.on('seen', ...)` — public, live-wired; establishing/sending your own is private-only — see below | Receive-only, live-only: shows "Seen by …" on a message once a live receipt points at it |
| Emoji reactions | Private/internal only — see below | Intentionally not implemented |
| Adaptive cards | Documented public feature (rendering is a client concern; submitting an action is `POST /attachment/actions`, not confirmed live) | Read-only text extraction, not interactive — see below |
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

## Line breaks: the documented soft-join rule doesn't hold for rendering, at all

Reported live in two parts, and the fix changed shape between them —
documented here with both rounds intact rather than cleaned up into a
single tidy story, since the correction itself is the useful part.

**Round one.** A message got reported rendering as one line instead of one
row per line — a Wordle result. The working theory at the time: Webex's
documented "a bare newline is a soft join; only two trailing spaces make a
hard break" rule is a *Markdown-syntax* convention, so a message with no
`markdown` field at all (assumed to be a bot integration sending only
`text`) never opted into it — plain text has no soft-join rule to apply.
Shipped as a `plainText` option on `renderWebexMarkdown()`, active only
when `message.markdown` was falsy.

**Round two, immediately after.** Turned out there was no bot — it's a
person pasting NYT Wordle's own share text straight into Webex's native
compose box. That single fact invalidates the field-presence theory
entirely: Webex's own client populates `markdown` for everything typed or
pasted there, formatted or not, so the "no `markdown` field" condition the
round-one fix keyed off would never have been true for this message in the
first place, and the fix would not have helped it. If a message that *does*
have a `markdown` field still needs every newline treated as a real break,
the field's presence was never a meaningful signal to begin with — the
rule doesn't hold for rendering *at all*, not just for a narrower plain-text
case.

**Fix.** `renderParagraphLines()` (in `webexMarkdown.tsx`) now treats every
newline as a real line break unconditionally, no exceptions, no `plainText`
option. This matches how the plain preformatted-text display worked before
this renderer existed at all — and, apparently, how Webex's real clients
actually behave, regardless of what the formatting docs describe. A line's
trailing spaces (still meaningful on the *outgoing* side — see below) are
now just stripped before display rather than inspected.

**The outgoing side is unaffected and stays as previously fixed.**
`toWebexMarkdown()` still inserts Webex's documented two-trailing-space
hard-break marker on every newline within a paragraph when Signalstone
sends a message — confirmed working correctly for how *other* Webex
clients render what Signalstone sends, a genuinely different question from
how Signalstone renders what it receives. It still leaves an actual blank
line (a paragraph break, two Shift+Enters) untouched rather than
hard-break-encoding it, for the reason recorded when that part was fixed:
a line that's purely whitespace does not reliably survive Webex's server
round-trip, so encoding a blank line's own newlines the same way as a
content line's silently lost the gap once the sent message came back and
was re-rendered.

Neither the original bug nor the round-one fix's own gap were caught by
testing before shipping — both are live usage patterns (a real pasted
result; a message that turned out not to be from a bot after all) the
original test suite didn't happen to construct, and in round one's case,
a plausible-sounding theory that direct live clarification from the person
who'd actually see the bug disproved before it ever reached testing.
Covered now by regression tests in `test/webex-markdown.test.tsx`
reproducing the actual scenario — a pasted multi-line grid with a
`markdown`-shaped block, one row per line, no hard-break markers.

**Round three: a blank line specifically was still invisible, and this
part had nothing to do with data at all.** After round two shipped, a
sent message with a genuine blank line (two Shift+Enters) still showed no
visible gap in Signalstone — confirmed via the message's own edit box
(which shows the raw stored `markdown`/`text`) that the blank line really
was present in what Webex returned; editing is not run through
`renderWebexMarkdown` at all, so this ruled out every part of rounds one
and two, and the earlier outgoing round-one-adjacent fix (leaving a blank
line's own newlines un-hard-break-encoded — see above), in one step. The
bug was purely visual: `splitBlocks` already splits a blank line into two
separate `<p>` elements correctly (structurally, this was never broken),
but `.signalstone-message-text p`'s CSS only added 4px of margin between
paragraphs — imperceptible next to the block's own 1.45 line-height, so
a message with a blank line and one without looked identical. Fixed with
`.signalstone-message-text p + p { margin-top: 1em; }`: two adjacent `<p>`
elements can only ever occur when the source had a real blank line between
them (every other block transition — into a list, quote, or code fence —
does not require one, so this doesn't affect that spacing), so it's safe
to give specifically that transition a distinctly larger gap without a
false positive.

## Avatars and presence

Both are fields already returned by `GET /people` — `avatar` (a Cisco-hosted
image URL) and `status` (`active`/`call`/`meeting`/`presenting`/
`DoNotDisturb`/`OutOfOffice`/`inactive`/`pending`/`unknown`, all documented) —
parsed into `Person` by `PeopleApi`. `NewMessage`/`NewSpace` search results,
the conversation list, and an open direct-message conversation can all show
them, via four independent settings (avatar/presence × recents/
conversations — see settings.ts) that each default off.

**Group spaces confirmed to have neither.** Checked directly against the
installed `@webex/plugin-rooms` source, the same way as the read-receipt and
reaction investigations below — no `avatar`/`image`/`photo`/`icon` field
appears anywhere in it, and the public Room resource schema has none either.
Native Webex clients render a space's icon as generated initials/color, not
an uploaded image, which matches: there is nothing to fetch. Avatars and
presence are therefore direct-space-only everywhere in Signalstone, by
necessity rather than choice.

**Directory search** (`NewMessage`/`NewSpace`) costs nothing extra — every
result already carries both fields from the search itself; showing them is
pure rendering. **The conversation list and an open DM cost more**, since
neither `Space` nor `Membership` carries the other participant's `avatar`/
`status` — getting there takes two steps, run only when at least one of the
four settings is on:

1. **Resolve** each direct space's other member via `membershipsApi.list({
   spaceId })` (the same call `MemberList` already uses for group spaces) —
   once per space, ever, cached in memory for the store's lifetime. A direct
   space's two participants never change, so this never repeats for a space
   already resolved.
2. **Batch-fetch** avatar/status for every resolved person id in one
   `people.list({ ids: [...] })` call (`PeopleApi` already supported batching
   by id; it just had no caller). One request regardless of how many DMs are
   open in the list.

**Refresh cadence: piggybacked on the conversation-list refresh, not a
separate timer.** `refreshDirectoryInfo()` runs at the end of `loadSpaces()`
— which already fires on initial load, a manual refresh click, and every
`refresh-space-list` realtime event (live or not, every `pollingFrequency`-
configured interval since issue 5's fix). Turning a setting on for the first
time also triggers one immediate refresh (via `setSettings()`), so results
appear right away rather than waiting up to a full interval. No new
setInterval, and the existing "Realtime polling frequency" setting already
controls how fresh this is, rather than adding a second, redundant cadence
knob.

Two things worth being explicit about, both true regardless of where a photo
is shown:

- **The avatar `<img src>` is unauthenticated**, unlike message attachment
  URLs. Attachment content requires the bearer token as an Authorization
  header (see AttachmentPreview's `requestUrl`-backed fetch-then-blob-URL
  approach, and why a bare `<img src>` can't be used there at all) — Webex's
  avatar URLs are plain, directly loadable CDN links, so a bare `<img>` tag
  works and is loaded lazily (`loading="lazy"`).
- **Presence is a periodic snapshot, not a live subscription.** There is no
  realtime presence-change event wired up (and no plan to poll faster than
  the conversation-list cadence for it) — it reflects whatever `GET /people`
  last returned, refreshed on the cadence described above.

## Conversation-list right-click menu, favorites, and hiding a direct message

A row in the conversation list now has a right-click menu, built on
Obsidian's own `Menu` class (native styling, keyboard nav, outside-click
dismissal — see `src/components/spaceContextMenu.ts`) rather than a
hand-rolled dropdown. Group and direct spaces get different item sets, since
the available actions genuinely differ:

- **Group**: Open, Favorite/Unfavorite, Manage members, Rename…, and a
  warning-styled "Leave this space…". Leave never acts on the first click —
  it opens a small second confirm menu at the same position ("Cancel" / a
  red "Leave this space") first, the same principle as every other
  destructive action in Signalstone (message delete, member remove).
- **Direct**: Open, Favorite/Unfavorite, Copy email address, and Hide/Unhide.

"Manage members" and "Rename…" open the space directly into that view
(member panel, or the header's inline rename editor already used for the ✎
button) instead of the normal message view — a small piece of router state
(`pendingSpaceView` in `SignalstoneApp.tsx`) carries the intent across the
navigation and is consumed once, on that screen's first mount.

**Hiding** removes a space from your own view without leaving it or ending
it for anyone else — the practical DM-equivalent of a group's Leave, for a
conversation you can't (and shouldn't be able to) delete unilaterally — and
needs no confirmation step of its own: it's fully reversible. It uses the
Memberships resource's own `isRoomHidden` field (confirmed public —
`PUT /memberships/{id}` with `{isRoomHidden}`, the same `service: 'hydra'`
REST layer every other membership write already uses, not the private
`webex.internal.conversation` service the read/unread investigation above
ruled out for a different purpose). Hiding a space only changes *your*
membership; the room itself, and everyone else's access to it, is untouched.

**Confirmed live: direct-space only.** Cisco's own SDK JSDoc demonstrates
`isRoomHidden` specifically as "hide a one on one space," and that turned
out to be a real restriction, not just an example — live testing confirmed
Webex's server rejects the write for a group-space membership. The
right-click menu now only offers Hide/Unhide for direct spaces.
`SignalstoneStore.hideSpace()`/`unhideSpace()` themselves are left fully
general (no space-type check) rather than removed outright, in case Cisco
ever changes this — only the menu's item list is scoped, so restoring the
group case later is a one-line change, not a rebuild. The `.catch()` added
alongside this finding stays regardless: any future failure mode still
surfaces as a Notice instead of an unhandled rejection.

Knowing which spaces are hidden costs one bulk call, not one per space:
`GET /memberships` with no `roomId` returns the authenticated user's own
membership across every space in a single request (Webex's documented
behavior) — exactly the `isRoomHidden` flag needed. This runs on every
`loadSpaces()` call unconditionally (not gated behind a setting, unlike
avatar/presence): the cost is comparable to the room list fetch that already
happens on the same cadence, and a correct recents list — one that actually
excludes what you've hidden, matching every other Webex client — is baseline
behavior, not an opt-in enhancement.

A hidden space is simply excluded from `state.spaces` by default. The new
"Show hidden conversations" setting (off by default) makes it reappear,
marked "Hidden" and dimmed, so it can be found again and unhidden from the
same right-click menu — without this, hiding would be a one-way trip with no
way back, which would have made it unsafe to ship.

Covered by new tests in `test/store.test.ts` for the filter/include
behavior, `hideSpace`/`unhideSpace`, and that a hidden space's background
activity does not notify. `spaceContextMenu.ts` itself is not unit tested —
like `SignalstoneSettingTab.ts`, it depends on Obsidian API classes
(`Menu`, `Notice`) the `obsidian` npm package ships no runtime for; verified
through the manual checklist in `docs/TESTING.md` instead.

### Favorites: confirmed local-only, Webex has no public equivalent

Checked directly against the installed SDK source, the same way as every
other capability question here. `favorite`/`unfavorite` do exist as real
Webex concepts — `@webex/internal-plugin-conversation` defines them as
simple activities (`Conversation.prototype.favorite`/`.unfavorite`, alongside
`hide`/`lock`/`mute` and their inverses, all submitted the same generic way)
— but, like the emoji-reaction and true-read/unread findings, that's the
private, undocumented `internal-plugin-*` service, not `webexapis.com`. A
search across every *public* plugin (`plugin-rooms`, `plugin-memberships`,
`plugin-messages`, `plugin-people`) turns up no favorite/pin/star concept of
any kind — not even a documented field that's merely unused. Unlike read
receipts (receive-only was still possible through a public event) or hiding
(a public field existed for a related purpose), there is no public angle
into favoriting at all.

Implemented entirely client-side as a result: `favoriteSpaceIds: string[]`
on `SignalstoneSettings`, toggled by `SignalstoneStore.toggleFavorite()`
(synchronous — no API call, nothing to fail) and persisted through
`onSettingsChanged`, a new callback on the store mirroring the existing
`notify` pattern but running in the opposite direction — this is the first
case where a UI-triggered action (the row context menu) needs to write back
into the settings `main.ts` owns and persists to disk, rather than the
Settings tab pushing a change down to the store. Favorited spaces sort
first in the conversation list via a stable partition applied after the
existing recent/alphabetical sort (stability, guaranteed by spec since
ES2019, keeps each group's relative order intact — favorites stay sorted
among themselves too, not just dumped in arbitrary order at the top).

Since this never touches Webex, it's also the one action in the whole
right-click menu with no possible failure mode and no confirmation need —
toggling it is instantaneous and always succeeds.

## Enlarged image preview

Obsidian has no dedicated "image viewer" API for an arbitrary (non-vault)
image — checked the public type declarations directly, not just docs;
`Modal` is the closest thing and the standard building block plugins use for
custom dialogs including this exact case. Clicking an already-loaded image
attachment now opens `ImageLightboxModal`, a small `Modal` subclass showing
it at up to 90vw/80vh. Reuses the same object URL `AttachmentPreview` already
created — no extra fetch. Escape and backdrop-click close it via `Modal`'s
own built-in behavior; clicking the lightbox image does too, as a lightbox
convenience.

Needs Obsidian's `App` handle, which `Modal`'s constructor requires and
nothing else in the component tree between `SignalstoneApp` and
`AttachmentPreview` otherwise needs — threading it as an ordinary prop
through Conversation/MessageList/MessageItem for that one leaf would mean
changing four signatures for a dependency three of them don't care about, so
it's provided once via a new React context (`src/context/AppContext.tsx`)
instead. Not unit tested, for the same reason as `spaceContextMenu.ts`
(`Modal` has no runtime in the `obsidian` npm package's types-only build) —
verified through the manual checklist instead.

**Regression, reported live, two rounds — confirmed root cause: Obsidian's
own button styling wins the cascade over a single custom class.** The
original implementation made the click target by wrapping the inline
`<img>` in a `<button>`, styled with an ordinary single-class CSS reset
(`.signalstone-image-trigger { padding: 0; border: 0; background:
transparent; ... }`, no `!important`). Round one: the image started
rendering clipped partway through. Round two, after switching to an
overlay approach instead of wrapping (below): the overlay button itself
rendered as an opaque box covering the image instead of transparent —
confirmed directly by deleting the button element in DevTools, which made
the image display correctly underneath it. That's conclusive: Obsidian's
or the active theme's own `button` styling has higher effective priority
than a single class selector, for both sizing-related properties (round
one) and `background` (round two).

This codebase had already hit the same problem once before, for the
conversation-list row buttons (`.signalstone-view .signalstone-space-list
> button { ...!important; }`), and already established the fix there:
`!important` on the specific properties Obsidian's own styling contests.
The image trigger just wasn't using it yet.

**Fix, in two parts.** First, decoupling: the click/keyboard target is a
separate, absolutely-positioned `<button>` (`.signalstone-image-trigger`)
overlaid on top of the image via a plain `<div>` wrapper
(`.signalstone-image-wrapper`, `position: relative`) rather than wrapping
the image — a `<div>` carries no default styling to fight in the first
place, so the image renders exactly as it did before the lightbox feature
existed regardless of what happens to the button layered on top of it.
Second, the button's own reset (`padding`, `border`, `background`,
`background-color`, `box-shadow`) now uses `!important`, matching the
established pattern, so it's actually guaranteed to render invisible.

**Unloading an image after viewing it.** `AttachmentPreview` already starts
every attachment idle (click-to-load, unless "Automatically load
attachments" is on) rather than fetching eagerly, specifically so opening a
conversation doesn't download every image in it. That covers not loading in
the first place, but not the requested "I looked at it, now put it back"
case — previously the only way back to the click-to-load state was leaving
and reopening the conversation, which resets every attachment in it, not
just the one you were done with. `unload()` reverts a single image's own
component state back to `idle` (`AttachmentPreview` tracks `status`/
`objectUrl`/`metadata` locally, per attachment instance, not in
`SignalstoneStore` — there was already nothing shared to update) and revokes
its object URL, so this is a genuine release of the decoded image data, not
just a CSS hide — a later "Load attachment" click re-fetches it from Webex
from scratch. Surfaced as a small "🙈 Unload" button next to Save, images
only (the request was specifically about pictures/GIFs, not documents), and
needs no setting of its own for the same reason Save doesn't: it's a
one-off manual action on an already-loaded item, not passive UI that could
clutter an idle conversation.

## Opening Obsidian's own Settings modal: one deliberate exception to public-API-only

The "Open settings" button on ConnectionScreen (shown before a token is
configured) originally just showed a Notice explaining where to go, rather
than actually navigating there — reported live as a real UX gap. Checked
directly against the public `obsidian` package's type declarations: `App`
has no `setting` property at all, and there is no documented way to open
the Settings modal from plugin code — not to a specific tab, not even
generally. The only way to do it is `app.setting.open()` /
`app.setting.openTabById(id)`, an internal, untyped object that exists at
runtime but isn't part of the public API surface.

Every other place this document rules out an undocumented surface
(`internal-plugin-*` for reactions/read-receipts, `tabHeaderInnerTitleEl`
for a tab badge), a fully public alternative covered the actual need
instead, so avoiding the internal API cost nothing. Here there simply isn't
one — no public API opens Settings at all, to any tab — and `app.setting`
is also, unusually for an internal API, the de facto standard nearly every
community plugin already relies on for this exact button, not an obscure
trick. That combination (no public alternative exists, and the workaround
is already the ecosystem norm) is why this is the one deliberate exception:
`openPluginSettings()` in `main.ts` uses it, behind a small
`InternalSettingModal` interface documenting exactly why, and falls back to
the original Notice if `app.setting` isn't present at all (e.g. a future
Obsidian release removes or renames it) so the button degrades gracefully
rather than doing nothing.

## Adaptive cards: read-only text extraction, deliberately not interactive

Unlike everything marked "private-only" elsewhere in this document, Adaptive
Cards genuinely are a documented, public Webex feature — Cisco's own
developer docs cover them, and there's a corresponding public
`POST /attachment/actions` endpoint for submitting a card's collected input
back to the bot that sent it (not confirmed against a live card in this
session — worth a real test before relying on it). The gap here isn't a
private API; it's that full support is a materially bigger feature than
everything else in this document; see "What full interactivity would take"
below.

**What was actually happening before this pass**: nothing. `CardAttachment`
existed as a parsed data type (`message.attachments`), but no component ever
read it — a message containing only a card, no plain-text fallback, rendered
completely empty. The previous "Safe fallback only" line in this doc's
table was aspirational, not an accurate description of the code.

**What's implemented now**: `src/utils/adaptiveCard.ts` walks a card's JSON
body and extracts only its *static* text — `TextBlock` text, `FactSet`
entries (as "Title: Value"), and an `Image`'s `altText` (never the image
itself — its `url` can point anywhere, and fetching it would mean this app
requesting from a third party the message's sender chose, not Webex, exactly
the kind of thing "remote content is untrusted input" already rules out
elsewhere in this codebase), recursing into `Container`/`ColumnSet`
children. Action button titles (`Action.Submit`, `Action.OpenUrl`, etc.) are
listed separately, as plain informational text — not rendered as buttons,
so there's no ambiguity about what's actually clickable. Any element type
this doesn't recognize (every kind of `Input.*`, `ActionSet`, `Media`,
`RichTextBlock`, and anything not yet invented) is silently skipped rather
than guessed at, since card JSON is sender-controlled, untrusted input,
same as message text. Depth-limited recursion guards against a
pathologically (or adversarially) nested card. Covered by
`test/adaptive-card.test.ts`, including malformed-input and deep-nesting
cases specifically because this parses untrusted data.

**What full interactivity would take**, if ever revisited: actually
rendering inputs and buttons as real UI, and wiring `Action.Submit` to
`POST /attachment/actions`. That means either adopting Microsoft's own
`adaptivecards` npm package (a real new dependency that would render
untrusted, remote, sender-controlled JSON directly into the DOM — a
different and larger security review than anything else in this codebase,
which has otherwise avoided every third-party renderer in favor of
hand-written ones specifically to keep that surface small and known) or
hand-building a partial renderer for the small set of elements Webex bots
commonly use. Meaningfully bigger than any single feature built so far —
realistically its own multi-session effort, not an extension of this one.
Not started; revisit if a real card workflow (an approval bot, a poll, a
form) turns out to matter in practice.

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

## Unread messages: local-only, session-only — no Webex API involved at all

There is no public Webex endpoint for "unread" at the granularity this
feature needs (see "Read/unread state" above — even the space-level
`listWithReadStatus`/`updateLastSeen` methods that come closest are private,
`webex.internal.conversation`-backed, not public REST). Rather than wait on
that, unread tracking is implemented entirely client-side, in
`SignalstoneStore`, using only data Signalstone already has: incoming
messages' own `id` field (stable and unique — nothing about a message's
content is ever logged for this) and the same open-space/hidden-space/
own-message filtering `maybeNotify` already does for the existing Notice
popup. It piggybacks on that method rather than duplicating its rules, so the
in-app badge and the OS notification always agree on what counts.

**Session-scoped by construction, not by a special reset step.** Unread
state lives only in `SignalstoneState` (`unreadMessageIdsBySpace`,
`openedWithUnreadIds`) — the same in-memory object as `readReceiptsBySpace`
and `directoryInfoBySpaceId` — with no settings-persistence involvement at
all. A plugin reload or Obsidian restart naturally starts from an empty
object; there is nothing to explicitly clear.

**Two-state design**, driven directly by the "don't remove the mark too
soon" requirement: `unreadMessageIdsBySpace` is the live, growing set of
unread message ids per space, appended to by `recordUnreadMessage` as
messages arrive and cleared for a space the instant it's opened
(`selectSpace`). `openedWithUnreadIds` is a *fixed snapshot* of what was
unread at the moment a space was opened — it does not grow while the
conversation stays open, and does not shrink as the reader scrolls past
those messages, so the "N new messages" divider and the jump button's target
both stay put and stay accurate for the whole viewing session, regardless of
scroll position. A message that's deleted while still unread is scrubbed
from both sets (`withoutUnreadMessageId`, wired into the existing
`message-deleted` realtime handling) so it can't be jumped to or counted.

All of it is gated behind `settings.trackUnreadMessages` (default on), with
four further, independently-toggleable settings (all default on) controlling
only presentation, never the underlying tracking: `showUnreadBadgeInRecents`
(the count badge on a conversation-list row), `showUnreadMarkerInConversation`
(the "N new messages" divider line in the transcript), `showUnreadJumpButton`
(the sticky jump-to-first-unread button), and `showUnreadBadgeOnRibbonIcon`
(the total-across-all-spaces badge on the ribbon icon). Turning the divider
off doesn't disable the jump button: the divider's DOM element (and its ref)
still renders as an invisible zero-size anchor (`.is-anchor-only`) purely so
the jump button always has a real scroll target, even with its own visible
styling suppressed — the two settings had to be decoupled at the DOM level,
not just the CSS level, since the button is meaningless without something to
scroll to.

**No tab badge.** Checked directly against the installed type declarations
(`node_modules/obsidian/obsidian.d.ts`) rather than assumed: `addRibbonIcon()`
and `addStatusBarItem()` both explicitly return an `HTMLElement` documented as
the caller's to modify, which is what the ribbon-icon badge uses. A
workspace tab's own header, by contrast, has no equivalent public surface —
`WorkspaceLeaf`/`View`/`ItemView` expose `getDisplayText()` for the title
but nothing to force Obsidian to re-read it, and no badge/decoration method
of any kind. Some community plugins reach into the tab header's internal DOM
directly (e.g. `tabHeaderInnerTitleEl`) to fake this, but that's undocumented
internal structure, not a stable API — consistent with this project's
standing avoidance of undocumented surfaces elsewhere (see the
`internal-plugin-*` packages ruled out for emoji reactions and read
receipts above), so it was deliberately skipped in favor of the ribbon icon
badge, which is fully public.

Covered by tests in `test/store.test.ts`: unread ids recorded only for a
background, non-thread, not-own, not-hidden message; tracking fully disabled
by the setting; multiple ids accumulating in arrival order; the
snapshot-and-clear behavior on `selectSpace`; and cleanup of a deleted
message from both sets.

**Marking read on demand, without leaving the conversation.** The divider/
badge/jump-button trio only ever clears on `selectSpace` — deliberately, so
it survives the whole viewing session (see above). That leaves no way to
dismiss it early other than leaving and reopening, which a live test
surfaced as a real annoyance: `markSpaceAsRead(spaceId)` and `markAllAsRead()`
were added directly to `SignalstoneStore` to close that gap, each wired to a
small button behind Obsidian's own `Menu` for a one-extra-click confirmation
(`components/confirmMenu.ts`, factored out of the existing space
context-menu's "Leave this space…" confirm so both share one
implementation) — one next to the jump-to-unread button for the open
conversation, one in the conversation-list header for every conversation at
once. The header button's visibility is governed only by its own setting,
`showMarkAllReadButton` (for exactly the "header feels cramped" case it
exists to avoid) — it's disabled (not hidden) while there's nothing to
mark, rather than appearing and disappearing with the unread count.
The first version tied its visibility to the unread count directly, on top
of the setting; a live test then reported turning the setting back on as
"not working" — the button really was gone, but because nothing happened
to be unread at that exact moment, not because of the setting. Disabling
instead of hiding makes the setting the only thing that controls whether
the button is there at all, so toggling it always has a visible, immediate
effect regardless of unread state. The per-conversation button has no such
setting, since it only ever appears alongside the same unread state the
jump button already does.

**Auto-loading older pages for the jump button.** The divider/jump target is
whichever unread message is earliest, but only what's already loaded can be
searched — if more unread messages arrived than a single page holds (see
`messagePageSize`), the true earliest one is older than what `selectSpace`'s
initial fetch pulled in, and previously the button would just jump to
whatever loaded unread message happened to be earliest, silently wrong.
`loadUntilMessageLoaded(messageId)` fixes this by repeating the same
`loadOlder()` step "Load older messages" already exposes, automatically,
until that specific message is loaded or there's nothing left to load
(capped at 10 pages, so a deleted target or an unusually large backlog can't
loop forever) — Webex's pagination here is cursor-based, with the page size
already baked into `nextMessagesUrl` from the original request, so there's
no way to ask a single follow-up call for a bigger page instead; looping the
existing step was the option actually available. Covered by
`test/store.test.ts`: successfully loading enough pages to reach the target,
and giving up cleanly once history runs out.

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
