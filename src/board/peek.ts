import { PANE_DIVIDER_SELECTOR, THREAD_QUERY_PARAM, THREAD_ID_RE, threadPaneSelector } from '../shared/claude-endpoints';

const FOCUS_ATTR = 'data-claude-kanban-focus';
const STYLE_ID = 'claude-kanban-peek-style';

export interface PeekCallbacks {
  /** Open the thread as a full page (closes the board). */
  onOpenPage(threadId: string): void;
  /** The popup was closed; the thread may have new activity. */
  onClosed(threadId: string): void;
}

/**
 * A popup over the board that shows one thread's chat, so the user can keep
 * talking to Claude without leaving the board.
 *
 * It loads claude.ai's own thread page in a same-origin iframe (claude.ai
 * allows framing by itself: `X-Frame-Options: SAMEORIGIN`), so sending
 * messages, streaming, tool cards and approvals all work exactly as on the
 * page. Inside the frame, the thread's pane is pinned to the whole frame so
 * the project chat and sidebar are hidden. If that pane can't be found, the
 * full page is shown instead.
 *
 * The extension's content scripts don't run inside the frame (no
 * `all_frames` in the manifest), so there is no board or launcher in it.
 */
export class ThreadPeek {
  private el: HTMLElement;
  private frame: HTMLIFrameElement;
  private titleEl: HTMLElement;
  private loadingEl: HTMLElement;
  private threadId: string | null = null;
  private observer?: MutationObserver;
  private focusQueued = false;

  constructor(
    container: HTMLElement,
    private cb: PeekCallbacks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'peek';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="peek-panel" role="dialog" aria-modal="true" aria-label="Thread">
        <header>
          <span class="peek-title"></span>
          <button class="ghost" data-act="page" title="Open the thread in this tab">Open full page</button>
          <button class="ghost" data-act="close" title="Esc">Close</button>
        </header>
        <div class="peek-body">
          <div class="peek-loading">Loading thread…</div>
          <iframe title="Thread chat"></iframe>
        </div>
      </div>`;
    container.append(this.el);
    const $ = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    this.frame = $('iframe');
    this.titleEl = $('.peek-title');
    this.loadingEl = $('.peek-loading');

    $('[data-act="close"]').addEventListener('click', () => this.close());
    $('[data-act="page"]').addEventListener('click', () => {
      const id = this.currentThreadId();
      this.close();
      if (id) this.cb.onOpenPage(id);
    });
    // Click on the dimmed backdrop closes the popup.
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    this.frame.addEventListener('load', () => this.onFrameLoad());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(threadId: string, title: string, href: string): void {
    this.titleEl.textContent = title;
    this.titleEl.title = title;
    this.el.hidden = false;
    if (this.threadId === threadId && this.frame.src) {
      this.frame.focus();
      return;
    }
    this.threadId = threadId;
    this.loadingEl.hidden = false;
    this.frame.classList.add('loading');
    this.frame.src = href;
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    const id = this.currentThreadId();
    if (id) this.cb.onClosed(id);
  }

  /** Drop the loaded page, e.g. when the project changes. */
  reset(): void {
    this.el.hidden = true;
    this.observer?.disconnect();
    this.threadId = null;
    this.frame.removeAttribute('src');
  }

  /** The thread shown in the frame; the user may have navigated inside it. */
  private currentThreadId(): string | null {
    try {
      const href = this.frame.contentWindow?.location.href;
      const id = href ? new URL(href).searchParams.get(THREAD_QUERY_PARAM) : null;
      if (id && THREAD_ID_RE.test(id)) return id;
    } catch {
      /* cross-origin (e.g. a login redirect): fall through */
    }
    return this.threadId;
  }

  private frameDoc(): Document | null {
    try {
      return this.frame.contentDocument;
    } catch {
      return null;
    }
  }

  private onFrameLoad(): void {
    const doc = this.frameDoc();
    this.observer?.disconnect();
    if (!doc) {
      // Not same-origin any more: show whatever loaded.
      this.showFrame();
      return;
    }
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) this.close();
    });
    this.observer = new MutationObserver(() => this.queueFocus());
    this.observer.observe(doc.documentElement, { childList: true, subtree: true });
    this.queueFocus();
    // Don't keep the spinner forever if the pane never shows up.
    window.setTimeout(() => this.showFrame(), 8000);
  }

  private queueFocus(): void {
    if (this.focusQueued) return;
    this.focusQueued = true;
    requestAnimationFrame(() => {
      this.focusQueued = false;
      const doc = this.frameDoc();
      const id = this.currentThreadId();
      if (doc && id && focusThreadPane(doc, id)) this.showFrame();
    });
  }

  private showFrame(): void {
    this.loadingEl.hidden = true;
    this.frame.classList.remove('loading');
  }
}

/**
 * Pin the thread's pane to the whole document. Returns whether the pane was
 * found. Safe to call repeatedly (the page re-renders while it loads).
 */
export function focusThreadPane(doc: Document, threadId: string): boolean {
  const host = doc.querySelector(threadPaneSelector(threadId));
  // The host itself is `display: contents`; pin the nearest box around it.
  let pane: Element | null = host;
  while (pane && pane !== doc.body && doc.defaultView?.getComputedStyle(pane).display === 'contents') {
    pane = pane.parentElement;
  }
  if (!host || !pane || pane === doc.body) return false;
  if (!pane.hasAttribute(FOCUS_ATTR)) {
    doc.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((e) => e.removeAttribute(FOCUS_ATTR));
    pane.setAttribute(FOCUS_ATTR, '');
  }
  if (!doc.getElementById(STYLE_ID)) {
    const view = doc.defaultView;
    const bg = [doc.body, pane]
      .map((e) => view?.getComputedStyle(e).backgroundColor)
      .find((c) => c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') ?? 'Canvas';
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `[${FOCUS_ATTR}] {
      position: fixed !important; inset: 0 !important; width: auto !important; height: auto !important;
      max-width: none !important; max-height: none !important; margin: 0 !important;
      transform: none !important; z-index: 2147483647 !important; background: ${bg} !important;
    }
    ${PANE_DIVIDER_SELECTOR} { display: none !important; }`;
    (doc.head ?? doc.documentElement).append(style);
  }
  return true;
}
