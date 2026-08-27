# Manual live-Webex checklist

## Troubleshooting realtime/notification delivery

If messages aren't appearing live or notifications seem inconsistent, turn on **Debug logging** in Signalstone's settings (Messaging section), reproduce the issue, then open DevTools (Ctrl+Shift+I / Cmd+Option+I) → Console and filter for `Signalstone:`. Every `[Signalstone:sdk]` line traces an event from the SDK; `[Signalstone:store]` traces how Signalstone routed it (open conversation vs. background vs. notify); `[Signalstone:main]` traces the final notification decision. Nothing logged means the event never reached that stage — that narrows down where to look far faster than guessing. Never logs your token or message content. Turn it back off when done; it's off by default.

- [ ] Install in a dedicated vault; enable, disable, re-enable, and reload.
- [ ] Open Settings → Signalstone: confirm Connection/Messaging/About render as grouped sections (not a flat list), the token field still works (select/change a secret, connection rebuilds), "Test connection" and "Disconnect" update the status text without a full settings reopen, and the Notifications dropdown / Debug logging toggle persist across an Obsidian restart. This is the declarative settings API (Obsidian 1.13.0+); it's new territory worth confirming directly since it can't be unit-tested (the `obsidian` package ships no runtime implementation to test against).
- [ ] Validate a good, invalid, and expired token.
- [ ] Load/filter recent direct and group spaces and older messages.
- [ ] Send plain text and Markdown; receive from another client.
- [ ] Confirm the header changes from `Connecting…` to `Live`; send from another client and verify it appears without waiting for the 15-second fallback poll.
- [ ] With a conversation *already open*, send a message into it from another client; confirm it appears immediately (not after a 15-second delay). This exact scenario was broken by two separate, now-fixed issues — see `docs/WEBEX_CAPABILITIES.md` — Realtime, issues 3 and 4 — so it's worth checking deliberately rather than assuming the general "receive a message" test above covers it.
- [ ] With no conversation open, have another client send into a space you're not viewing; confirm a background notification still fires (if notifications are enabled) — issue 4 broke this too, silently.
- [ ] Temporarily block/reject the realtime connection; confirm the header shows `Polling`, messages still refresh, and `Live` returns after recovery.
- [ ] If the header stays on `Polling`, hover it for the detail text; if messages don't appear live despite the header showing `Live`, turn on Debug logging (see above) first. Four known issues (a `setDeviceInfo` crash, a confirmed CORS block, a room-id encoding mismatch, and a missing `@webex/plugin-people` registration) were found and fixed — see `docs/WEBEX_CAPABILITIES.md` — Realtime. This checklist item is to catch a *new* failure, not one of those four. If it's a new message, open DevTools (Ctrl+Shift+I / Cmd+Option+I) → Console and Network tabs — an uncaught error naming a specific SDK file/function (as issue 4's did) is usually traceable the same way; a `wss://` (WebSocket) connection attempt that's rejected or closed points at the Mercury transport specifically.
- [ ] Upload PNG, JPEG, GIF, PDF, and a document; paste and drag a file.
- [ ] Cancel and confirm deletion of an own message.
- [ ] In a group space, open the member panel (👥): add a member by email, promote/demote a moderator, and cancel/confirm removing a member. Confirm a direct message shows no member panel.
- [ ] Test offline/recovery without losing loaded content or draft.
- [ ] Test light/dark themes, narrow sidebar, keyboard focus, long URLs, and code.
- [ ] Confirm no history is persisted and no GIPHY integration exists.
- [ ] Set notifications to "All messages". From another client, send a message into a space that is *not* currently open in Signalstone; confirm a Notice appears with sender and a short preview. Send a message into the space that *is* open; confirm no Notice appears. Send a message yourself from Signalstone; confirm no self-notification. Switch to "Direct messages only" and confirm a background group-space message no longer notifies while a background DM still does. Switch to "Off" and confirm neither notifies.

Pending live tests: SDK reconnect/recovery after a real network interruption and after an Obsidian restart, notifications, member panel actions, space creation, and mentions.
