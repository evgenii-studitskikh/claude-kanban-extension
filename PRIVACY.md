# Privacy Policy — Kanban for Claude Projects

_Last updated: 2026-11-24_

Kanban for Claude Projects ("the extension") is an unofficial, open-source Chrome extension that shows the
threads of a claude.ai project as a Kanban board. It is not affiliated with or endorsed by Anthropic.

## Summary

- The extension does **not** collect, sell, or share any personal data.
- Everything it stores stays **in your browser** (`chrome.storage.local`).
- It does **not** send data to the developer or to any third party. There are no analytics, trackers, ads, or remote code.

## What the extension reads

The extension runs only on `https://claude.ai/*`. While you use claude.ai, it reads data that claude.ai already
loads in your tab (thread ids, titles and status of threads in the project you are viewing) and the page content
needed to build the board.

## What the extension stores (locally only)

- Your board layout per project: which column each thread is in and the card order.
- Thread ids and titles needed to draw the board.
- A "resolve" request template learned from claude.ai's own UI (URL, method, body shape, and non-sensitive headers
  such as `content-type`). `Authorization` headers, cookies, tokens and similar secrets are **never** stored.
- Extension settings.

This data never leaves your device. You can delete it at any time by removing the extension or clearing its
storage from `chrome://extensions`.

## Network requests

The extension makes requests **only to claude.ai**, using your existing claude.ai session in the same tab, and
only to do what you asked (for example, marking a thread resolved when you drag its card to **Resolved**).
It never sends your data anywhere else.

## Permissions

- `storage` — save your board layout and settings locally.
- Host access to `https://claude.ai/*` — show the board on claude.ai project pages and read the thread list.

## Limited Use

The use of information received by the extension adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements. Data is used only to provide the board feature and is not transferred,
sold, or used for advertising, creditworthiness, or any purpose unrelated to that feature.

## Changes and contact

Changes to this policy are published in this file in the GitHub repository. Questions or requests:
open an issue at https://github.com/evgenii-studitskikh/claude-kanban-extension/issues.
