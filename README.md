# Signalstone

Signalstone is an independent, lightweight Webex messaging client for an Obsidian sidebar. It keeps recent spaces, message history, composing, uploads, and basic message management close to your notes without persisting conversations into your vault.

> Screenshot coming after live-service UI validation.

## Features

- Token selection through Obsidian Secret Storage and `/people/me` validation
- Recent direct/group spaces, filtering, and paginated history
- Plain text/Webex Markdown sending and one-file upload with paste/drag-and-drop
- Safe text/link/code rendering without injecting Webex HTML
- Threaded replies, editing/deleting own messages, and inline file/image previews
- Official Webex Browser SDK events with automatic conservative polling fallback
- Responsive theme-native sidebar, offline states, and in-memory drafts

New direct messages are supported. Group spaces have a member panel (list, add by email, promote/demote moderator, remove) and `@mention` autocomplete (plus `@all`) in the composer. Incoming Markdown — bold, italic, links, lists, blockquotes, code — renders as real formatting, not raw syntax; outgoing text is sent through Webex's `markdown` field. Optional notifications (off / direct messages only / all messages, configurable in settings) surface top-level messages from someone else in a space you don't currently have open — never your own messages, never the conversation you're already looking at, and no sound. Space creation remains future work. See [the capability record](docs/WEBEX_CAPABILITIES.md). GIPHY is intentionally excluded; ordinary GIF files upload and display normally.

## Install and connect

Signalstone requires Obsidian 1.13.0+ (for the declarative settings API and secret storage). Build it, then copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/signalstone/`. Enable it and select an Obsidian secret containing a Webex token in Signalstone settings.

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

Personal tokens must be replaced when expired. Loaded content remains in memory while offline. Signalstone connects live through the official Webex SDK and delivers new messages immediately; if that connection is ever unavailable, degraded, or reconnecting, it automatically falls back to REST polling — the open conversation every 15 seconds, the conversation list every 45 seconds. The connectivity indicator always shows which mode is active. See "Realtime" in [docs/WEBEX_CAPABILITIES.md](docs/WEBEX_CAPABILITIES.md) for the issues that had to be fixed to get there.

Signalstone is unofficial and is not endorsed, sponsored, supported, or approved by Cisco/Webex or Obsidian. Their names describe compatibility; their logos are not used.

No license has been selected. Choose one (MIT is a reasonable permissive option) before Community Plugin publication.
