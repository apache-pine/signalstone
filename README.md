# Signalstone

Signalstone is an independent, lightweight Webex messaging client for an Obsidian sidebar. It keeps recent spaces, message history, composing, uploads, and basic message management close to your notes without persisting conversations into your vault.

## Features

- Token selection through Obsidian Secret Storage and `/people/me` validation
- Recent direct/group spaces, filtering, and paginated history
- Plain text/Webex Markdown sending and one-file upload with paste/drag-and-drop
- Safe text/link/code rendering without injecting Webex HTML
- Threaded replies, editing/deleting own messages, and inline file/image previews (click a loaded image for a full-size view, or unload it back to click-to-load once you're done looking)
- Click-and-drag text selection in the transcript, free to span several messages at once (unlike Webex's own client); right-click any message to copy the whole thing regardless of selection
- Local, session-only unread tracking at the individual message level — a count badge per conversation, a "new messages" divider and jump button inside it (which loads older pages automatically if needed to reach it), and a badge on the ribbon icon, each independently toggleable; mark a single conversation or everything read on demand, each behind a confirmation
- Official Webex Browser SDK events with automatic conservative polling fallback
- Responsive theme-native sidebar, offline states, and in-memory drafts

Directory search (when starting a new message or adding members to a new space) shows each result's photo and a colored presence dot (active/busy/away), sourced from the same lookup — no extra requests. Avatars and presence can also be shown in the conversation list and inside an open direct message, each independently toggleable in settings; both are direct-space-only — Webex has no avatar/presence concept for a group space. Right-click a conversation in the list for more actions — Favorite/Unfavorite and Open are available everywhere, group spaces also get Manage members/Rename/Leave, and direct messages also get Copy email address/Hide. Favoriting is entirely local (Webex has no public favorite/pin API at all) and always sorts a space to the top of the list. Hiding removes a direct message from the list without leaving it and is fully reversible; see the "Show hidden conversations" setting to find and unhide one — Webex's server confirmed rejects hiding a group space, so it's not offered there. New direct messages are supported, and new group spaces can be created (with an optional set of initial members added by email) via the 👥 button next to "New message". Group spaces have a member panel (list, add by email, promote/demote moderator, remove, leave the space) and `@mention` autocomplete (plus `@all`) in the composer; the space name can be renamed in place from the conversation header. Other members' read receipts ("Seen by …") appear live under a message once Webex reports someone has read up to it — receive-only, since Signalstone has no way to send its own. Incoming Markdown — bold, italic, links, lists, blockquotes, code — renders as real formatting, not raw syntax; outgoing text is sent through Webex's `markdown` field. An Adaptive Card attachment shows its text content (titles, labels, facts) read-only, with a note that it isn't interactive here — see [the capability record](docs/WEBEX_CAPABILITIES.md) for what full interactivity would take. Optional notifications (off / direct messages + @mentions / direct messages only / all messages, with an optional message preview, configurable in settings) surface top-level messages from someone else in a space you don't currently have open — never your own messages, never the conversation you're already looking at, and no sound. See [the capability record](docs/WEBEX_CAPABILITIES.md). GIPHY is intentionally excluded; ordinary GIF files upload and display normally.

## Settings

Every behavior below defaults to the plugin's original, unconfigured behavior — nothing changes until you deliberately change a setting. Open Settings → Signalstone:

- **Connection** — token, connection status, disconnect, whether to open Signalstone automatically on startup, and which sidebar it opens in.
- **Composing** — whether Enter or Shift+Enter sends a message (the other always inserts a newline).
- **Notifications** — who to notify for (off / direct messages + mentions / direct messages only / all messages) and whether a notification includes a text preview.
- **Appearance** — message spacing (comfortable/compact), 12-hour vs. 24-hour vs. system timestamps, and conversation list sort order (recent activity vs. alphabetical).
- **Avatars & presence** — four independent toggles: avatar/presence, each for the conversation list and for an open direct message. Direct spaces only.
- **Conversations** — whether deleting a message requires a confirming second click, whether attachments load automatically instead of on click, whether the message list always scrolls to a new message or only when you were already near the bottom, whether hidden conversations (see the right-click menu) show up in the list, marked "Hidden", so they can be found and unhidden, whether message text can be click-and-drag selected at all, and whether a selection includes the sender name/timestamp line above each message.
- **Unread messages** — whether unread tracking runs at all (device- and session-local; nothing about it syncs or persists, and it starts fresh every restart), plus independent toggles for the conversation-list count badge, the in-conversation "N new messages" divider, the jump-to-unread button, the ribbon icon's unread count, and the "mark all as read" header button.
- **Advanced** — the REST-polling fallback's cadence (only relevant while the connectivity indicator shows "Polling" rather than "Live"), how many messages load per page, and debug logging.

## Install and connect

Signalstone requires Obsidian 1.13.0+ (for the declarative settings API and secret storage). Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/apache-pine/signalstone/releases/latest) into `<vault>/.obsidian/plugins/signalstone/` — or build from source (see Development below) and copy those same three files from the project root after `npm run build`. Enable it and select an Obsidian secret containing a Webex token in Signalstone settings.

A Webex account is required. Personal developer tokens normally expire after about 12 hours and Cisco positions them for development/testing, not production authentication. Signalstone embeds no OAuth client secret.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

## Network and privacy

Signalstone connects directly to Cisco Webex REST and realtime messaging services. It stores only preferences and a Secret Storage identifier. Tokens stay in Secret Storage; history, files, drafts, and directory results are not persisted. There is no telemetry. See [PRIVACY.md](PRIVACY.md).

Personal tokens must be replaced when expired. Loaded content remains in memory while offline. Signalstone connects live through the official Webex SDK and delivers new messages immediately; if that connection is ever unavailable, degraded, or reconnecting, it automatically falls back to REST polling for the open conversation (every 15 seconds by default; configurable in settings). The conversation list also re-checks itself every 45 seconds as a low-cost safety net, live or not, since Webex doesn't reliably push a live event for every conversation-ordering change. The connectivity indicator always shows which mode is active. See "Realtime" in [docs/WEBEX_CAPABILITIES.md](docs/WEBEX_CAPABILITIES.md) for the issues that had to be fixed to get there.

Signalstone is unofficial and is not endorsed, sponsored, supported, or approved by Cisco/Webex or Obsidian. Their names describe compatibility; their logos are not used.

## License

[MIT](LICENSE)
