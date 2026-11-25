# Claude Threads Kanban

Unofficial Chrome extension (Manifest V3) that shows the threads of a claude.ai project
(`claude.ai/code/project/chan_…`) as a Kanban board: **Open**, **In progress**, **Resolved**.

All data stays in your browser (`chrome.storage.local`). The extension sends nothing to third-party
servers: it only reads responses claude.ai already loads, and repeats claude.ai's own requests using
your existing session.

## Install (development)

```bash
npm install
npm run build        # or: npm run watch
```

Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

## Usage

* On a project page a **▦ Kanban** button appears in the bottom-right corner (or press `Alt+K`). `Esc` closes the board.
* Clicking a card opens the thread in the same tab (Ctrl/Cmd+click opens a new tab).
* Drag cards between and within columns; columns and order are saved per project.
* Cards show a fragment of the thread's last message. It is fetched while the board is open, cached, and
  refetched only after new activity in the thread. Hover the text to see whether it is the first or the last message.
* Navigating to another project switches the board without a page reload.
* The DevTools console shows what the extension found: `[Claude Kanban] … thread(s) in project …` with a table
  of threads, which JSON responses contained threads, and which requests look like a "resolve".

### Resolve sync

The resolve endpoint is not hard-coded. The extension **learns** it: resolve any thread once in the regular
Claude UI, and the extension records that request as a template (with `{{threadId}}`/`{{projectId}}` placeholders).
From then on, dragging a card into **Resolved** replays it (and the inverse request when dragging a card out).
`Authorization`, cookies, tokens and similar headers are never stored; the request relies on your session cookies.
Until the template is learned, moving a card to **Resolved** is saved locally only.

Column rules: the native resolve status always wins. A thread resolved in Claude goes to **Resolved**; a thread
reopened in Claude goes back to **Open**. **Open** and **In progress** are local only.

## Architecture

| File | Purpose |
| --- | --- |
| `src/shared/claude-endpoints.ts` | **All** assumptions about claude.ai: URLs, id formats, JSON field names, DOM selectors, resolve-detection rules. Fix breakages here. |
| `src/page/hook.ts` | Runs in the page's JS world: wraps `fetch`/`XHR`, forwards JSON containing threads and resolve-like requests, and replays requests. |
| `src/shared/extract.ts` | Heuristics that find thread-like objects in any JSON; learning the resolve template. |
| `src/shared/board-state.ts` | Column and card-order logic (unit tested). |
| `src/content/*` | Content script: per-project routing, DOM fallback, storage, sync. |
| `src/board/*` | Board UI inside a Shadow DOM. |

```bash
npm run typecheck && npm test
```

## Limitations

* Unofficial: it may break when claude.ai changes its markup or internal APIs (see `docs/RESEARCH.md`).
* Browser only; does not work in the desktop or mobile apps.
