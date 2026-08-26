# Signalstone

Signalstone is an independent, lightweight Webex messaging client for an Obsidian sidebar. It keeps recent spaces, message history, composing, uploads, and basic message management close to your notes without persisting conversations into your vault.

> Screenshot coming after live-service UI validation.

## Features

- Token selection through Obsidian Secret Storage and `/people/me` validation
- Recent direct/group spaces, filtering, and paginated history
- Plain text/Webex Markdown sending and one-file upload with paste/drag-and-drop
- Safe text/link/code rendering without injecting Webex HTML
- Delete-own-message and conservative polling for incoming activity
- Responsive theme-native sidebar, offline states, and in-memory drafts

Threads, editing, received attachment previews, new DMs, membership management, and SDK WebSocket wiring remain UI work. See [the capability record](docs/WEBEX_CAPABILITIES.md). GIPHY is intentionally excluded; ordinary GIF files upload normally.

## Install and connect

Signalstone requires Obsidian 1.11.4+. Build it, then copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/signalstone/`. Enable it and select an Obsidian secret containing a Webex token in Signalstone settings.

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

Signalstone connects directly to `https://webexapis.com` for identity and messaging. It stores only preferences and a Secret Storage identifier. Tokens stay in Secret Storage; history, files, drafts, and directory results are not persisted. There is no telemetry. See [PRIVACY.md](PRIVACY.md).

Personal tokens must be replaced when expired. Loaded content remains in memory while offline. This release polls the open space every 15 seconds and the list every 45 seconds.

Signalstone is unofficial and is not endorsed, sponsored, supported, or approved by Cisco/Webex or Obsidian. Their names describe compatibility; their logos are not used.

No license has been selected. Choose one (MIT is a reasonable permissive option) before Community Plugin publication.
