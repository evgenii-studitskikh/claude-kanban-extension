# How claude.ai loads threads — what to verify

## Verified (2026-11-24, in a signed-in Chrome)

* Thread list: `GET /v1/code/channels/{chan_id}/threads?limit=100`, sent with the header
  `anthropic-version: 2023-06-01` (without it the API answers 400). The response is
  `{ sections: [{ status, count, data: [rootMessage…] }], truncated }`, with section statuses
  `needs_input`, `failed`, `working`, `idle`, `resolved`, `archived`.
  Each root message has `id` (`cmsg_…`), `body` (the first message), `bound_sessions[0].title`
  (the thread title), `last_reply_at`, `created_at`, `thread_status`.
* The project page does not render thread links as `<a href>` elements, so the DOM fallback finds nothing there.
* The page also loads `GET /v1/code/channels/{chan_id}/timeline?limit=200` (project chat messages) and
  `GET /v1/code/channels/{chan_id}/threads/{cmsg_id}?limit=1`.
  Cards use the latter to show the thread's last message (`threadMessagesUrl`). Its response shape is
  **not verified**: `parseLastMessage` treats any object with a `cmsg_…` id and a `body`/`text`/`content`
  field as a message and picks the newest by `created_at`. To verify, open a thread with DevTools → Network,
  find that request and check that the newest message is in the response. If cards keep showing the first
  message, adjust `MESSAGE_FIELDS` or the URL.
* Thread chat popup (2026-11-25): claude.ai pages send `X-Frame-Options: SAMEORIGIN`, so the project page can
  load itself in an iframe. The thread page loads and works there (sending messages included). Each pane is
  rendered inside `[data-tile-host="thread:cmsg_…"]` (`display: contents`; the project chat is
  `data-tile-host="coordinator"`), and panes are separated by a `[data-tile-divider]` resize handle. The popup
  pins the thread pane's nearest box to the whole frame and hides the divider (`threadPaneSelector`,
  `PANE_DIVIDER_SELECTOR`). If those attributes change, the popup falls back to the full project page.
* Still unknown: the request that resolves a thread. It wasn't in the loaded JS bundles; it's learned
  at runtime from the first manual resolve.

The sections below are the original, unverified assumptions used by the generic fallback.

The research was done without being signed in to claude.ai, so the real endpoints are **not confirmed**.
The extension is designed not to depend on exact URLs: it inspects any JSON the page loads and learns the
resolve request by example. The heuristics still rely on the assumptions below — verify them in DevTools.

## Assumptions (all in `src/shared/claude-endpoints.ts`)

| # | Assumption | Where | How to verify |
|---|---|---|---|
| 1 | Project page is `/code/project/chan_…`, a thread is selected with `?thread=cmsg_…` | `PROJECT_PATH_RE`, `THREAD_QUERY_PARAM` | Address bar when opening a thread. |
| 2 | Data requests go to paths containing `/api/`, `/edge-api/`, `/v1/` or `/v2/` and return `application/json` | `API_URL_RE` | Network → `Fetch/XHR` filter, open a project. |
| 3 | The thread list arrives as JSON where a thread has a `cmsg_…` id in `id`/`thread_id`/`root_id`/`ts`/`uuid` and a title in `title`/`name` | `FIELDS.id`, `FIELDS.title`, `THREAD_ID_RE` | Find the thread-list response in Network and check Preview. |
| 4 | Resolved status is a boolean `resolved`/`is_resolved`, or `resolved_at`, or `state`/`status` = `resolved` | `FIELDS.resolved*`, `RESOLVED_STATES` | Compare an open and a resolved thread in that response. |
| 5 | Last activity date and preview come from `last_activity_at`/`updated_at`…, `last_message_preview`/`last_message.text`… | `FIELDS.updatedAt`, `FIELDS.snippet` | Same response. If there is no preview in the list, cards show no snippet. |
| 6 | Resolving is a plain HTTP request (not WebSocket) whose URL or body contains `resolv`/`reopen`/`archiv` and the thread id | `RESOLVE_MUTATION_RE` | Click "Resolve" on a thread and find the POST/PATCH in Network. |
| 7 | Thread links in the DOM are `<a href="…?thread=cmsg_…">` | `DOM.threadLink` | Elements → inspect a thread in the list. |

## Quick check

1. Load the extension, open a project, open DevTools → Console.
2. You should see a `[Claude Kanban] N thread(s) in project chan_…` group and lines like
   `JSON GET <url> → N thread(s)`. If the only source is the DOM (`source: dom`), assumptions 2–3 didn't match:
   find the thread-list request in Network and adjust `API_URL_RE`/`FIELDS`.
3. Resolve a thread in the Claude UI. The console should show `mutation seen …` and
   `learned native "resolve" request`. If not, assumption 6 didn't match (or resolve goes over WebSocket);
   capture the request URL/method/body from Network.
4. On the board, drag another thread into **Resolved** and check that it became resolved in Claude.
