# Webex capabilities

| Feature | Public capability | Implementation |
|---|---|---|
| Text/limited Markdown | [Create Message](https://developer.webex.com/docs/api/v1/messages/create-a-message) | Implemented |
| Spaces/direct spaces | [Rooms API](https://developer.webex.com/docs/api/v1/rooms) | List/open implemented |
| Paginated history | [List Messages](https://developer.webex.com/docs/api/v1/messages/list-messages) | Implemented |
| File/GIF upload | Supported; one file per request | Upload implemented; received preview pending |
| Threads | Supported via `parentId` | API implemented; UI pending |
| Edit/delete own message | Supported | Delete UI implemented; edit UI pending |
| Mentions | Supported with documented markup | API pass-through; autocomplete pending |
| Membership management | [Memberships API](https://developer.webex.com/docs/api/v1/memberships) | API implemented; UI pending |
| Realtime | [Browser SDK](https://developer.webex.com/messaging/docs/sdks/browser) | Provider implemented; production wiring pending; polling active |
| Read state | SDK membership last-seen behavior exists | Not wired; no canonical-unread claim |
| Emoji reactions | Not exposed in reviewed ordinary REST API | Not implemented |
| Adaptive cards | Public APIs exist | Safe fallback only |
| GIPHY | Intentionally excluded | Not implemented |
