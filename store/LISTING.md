# Chrome Web Store listing

Copy these into the Developer Dashboard. Character limits are noted where the store enforces them.

## Store listing tab

**Name** (from manifest, max 75): `Kanban for Claude Projects`

**Summary** (from manifest `description`, max 132):
> Unofficial. See the threads of a claude.ai project as a Kanban board. All data stays in your browser.

**Category:** Productivity → Workflow & Planning (or "Tools" if that category is not offered)

**Language:** English

**Detailed description:**

```
Turn the threads of a claude.ai project into a simple Kanban board.

When a project has many threads, the list view gets hard to follow. This extension adds a board with three
columns, Open, In progress and Resolved, so you can see at a glance what is waiting, what is being worked on,
and what is done.

FEATURES
• One click (or Alt+K) opens the board on any claude.ai project page. Esc closes it.
• Drag cards between and within columns. Layout and order are saved per project.
• Click a card to open the thread (Ctrl/Cmd+click opens a new tab).
• Resolve sync: threads resolved in Claude move to Resolved automatically. After you resolve one thread
  in Claude's own UI, dragging a card to Resolved resolves it in Claude too.
• Switches boards when you move between projects, without reloading the page.

PRIVACY
• All data stays in your browser (chrome.storage.local).
• No analytics, no trackers, no ads, no remote code.
• Requests go only to claude.ai, using your existing session.
• Open source: https://github.com/evgenii-studitskikh/claude-kanban-extension

NOTE
This is an unofficial extension and is not affiliated with or endorsed by Anthropic. Claude is a trademark of
Anthropic, PBC. Because it relies on claude.ai's web interface, it may need an update when claude.ai changes.
Works in the browser only (not in the desktop or mobile apps).
```

**Graphic assets:**
- Store icon 128×128: `public/icon128.png`
- Screenshots (at least 1, up to 5), 1280×800 or 640×400, PNG/JPEG: see `store/SCREENSHOTS.md`
- Small promo tile 440×280: `store/promo-small-440x280.png`
- Marquee 1400×560: optional, skip

**Official URL:** none. **Homepage URL:** https://github.com/evgenii-studitskikh/claude-kanban-extension
**Support URL:** https://github.com/evgenii-studitskikh/claude-kanban-extension/issues

## Privacy tab

**Single purpose description:**
> Shows the threads of a claude.ai project as a Kanban board so the user can organize them into columns and mark them resolved.

**Permission justifications:**
- `storage`: Saves the user's board layout (columns and card order per project), a locally learned resolve
  request template, and settings. Stored only in chrome.storage.local on the user's device.
- Host permission `https://claude.ai/*`: The board is drawn on claude.ai project pages. The extension reads the
  thread list that claude.ai already loads in the tab and, when the user drags a card to Resolved, sends the
  same resolve request claude.ai's own UI sends, using the existing session.

**Remote code:** No, I am not using remote code. (All JavaScript is bundled in the package.)

**Data usage — what user data do you collect?** Leave every box unchecked. The extension processes thread titles
locally but never transmits them off the device, which the store does not count as collection.

If a reviewer asks, the conservative alternative is to check **Website content** and explain it is stored
locally only. Either way, tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**
https://github.com/evgenii-studitskikh/claude-kanban-extension/blob/main/PRIVACY.md

## Distribution tab

- Visibility: **Public** (or **Unlisted** for a soft launch: only people with the link can install).
- Regions: all regions.
- Pricing: free.
