/**
 * Content script (isolated world). Glues together:
 *  - thread data from the page hook (JSON claude.ai already loads) and the DOM;
 *  - per-project board state in chrome.storage.local;
 *  - the Shadow DOM board;
 *  - syncing the "resolved" column with claude.ai's native resolve.
 */
import { BoardView } from '../board/board';
import { mergeThreads, moveCard } from '../shared/board-state';
import { projectIdFromLocation, threadUrl } from '../shared/claude-endpoints';
import {
  classifyMutation,
  extractThreads,
  fillTemplate,
  flipTemplate,
  makeTemplate,
  templateUrlFor,
} from '../shared/extract';
import type { ColumnId, ProjectBoard, RequestTemplate, ResolveTemplates, Thread } from '../shared/types';
import { onPageMessage, replay } from './bridge';
import { findThreadLink, scanDom } from './dom-source';
import { loadBoard, loadSettings, loadTemplates, saveBoard, saveTemplates, type Settings } from './storage';

const TAG = '[Claude Kanban]';
const REFRESH_MS = 60_000;

let settings: Settings = { debug: true };
let templates: ResolveTemplates = {};
let projectId: string | null = null;
let board: ProjectBoard | null = null;
/** Data that arrived before the board for the current project was loaded. */
let buffered: { threads: Thread[]; listUrl?: string }[] = [];
let view: BoardView | null = null;
let lastLoggedSignature = '';

const log = (...a: unknown[]) => settings.debug && console.log(TAG, ...a);

/* ------------------------------------------------------------------ */
/* Incoming data                                                       */
/* ------------------------------------------------------------------ */

onPageMessage((msg) => {
  if (msg.type === 'json') {
    const threads = extractThreads(msg.body);
    if (!threads.length) return;
    log(`JSON ${msg.method} ${msg.url} → ${threads.length} thread(s)`);
    ingest(threads, msg.method === 'GET' ? msg.url : undefined);
  } else if (msg.type === 'mutation') {
    void learnMutation(msg.url, msg.method, msg.body, msg.headers, msg.status);
  }
});

function ingest(threads: Thread[], listUrl?: string): void {
  if (!projectId || !board) {
    if (buffered.length < 200) buffered.push({ threads, listUrl });
    return;
  }
  const mine = threads.filter((t) => !t.projectId || t.projectId === projectId);
  if (!mine.length) return;
  // Remember the GET endpoint that lists this project's threads, so we can re-request it.
  if (listUrl && mine.length >= 2 && listUrl.includes(projectId)) {
    const tpl = templateUrlFor(listUrl, projectId);
    if (board.listEndpoint !== tpl) {
      board.listEndpoint = tpl;
      log('learned thread-list endpoint:', tpl);
    }
  }
  board = mergeThreads(board, mine);
  void persist();
  render();
  logThreads();
}

function logThreads(): void {
  if (!board || !settings.debug) return;
  const rows = Object.values(board.threads).map((t) => ({
    id: t.id,
    title: t.title,
    column: board!.entries[t.id]?.column,
    resolved: t.resolved,
    state: t.state,
    updatedAt: t.updatedAt,
    source: t.source,
  }));
  const sig = JSON.stringify(rows);
  if (sig === lastLoggedSignature) return;
  lastLoggedSignature = sig;
  console.groupCollapsed(`${TAG} ${rows.length} thread(s) in project ${projectId}`);
  console.table(rows);
  console.groupEnd();
}

/* ------------------------------------------------------------------ */
/* Resolve sync                                                        */
/* ------------------------------------------------------------------ */

async function learnMutation(
  url: string,
  method: string,
  body: string | undefined,
  headers: Record<string, string>,
  status: number,
): Promise<void> {
  const c = classifyMutation(url, body);
  log('mutation seen', { method, url, body, status, classifiedAs: c });
  if (!c || status < 200 || status >= 300) return;
  const tpl = makeTemplate(method, url, body, headers, c.threadId, projectId);
  templates = { ...templates, [c.kind]: tpl };
  await saveTemplates(templates);
  log(`learned native "${c.kind}" request`, tpl);
  view?.toast(c.kind === 'resolve' ? 'Learned how Claude resolves threads — resolve sync is on' : 'Learned how Claude reopens threads');
}

function templateFor(kind: 'resolve' | 'unresolve'): RequestTemplate | undefined {
  const direct = templates[kind];
  if (direct) return direct;
  const other = templates[kind === 'resolve' ? 'unresolve' : 'resolve'];
  return other ? flipTemplate(other) : undefined;
}

async function syncResolve(threadId: string, resolved: boolean): Promise<boolean> {
  if (!projectId) return false;
  const tpl = templateFor(resolved ? 'resolve' : 'unresolve');
  if (!tpl) {
    view?.toast(
      resolved
        ? 'Saved locally. To sync with Claude, resolve any thread once in the regular Claude UI — the extension will learn the request.'
        : 'Saved locally. The native resolved status was not changed.',
      8000,
    );
    return false;
  }
  view?.setPending(threadId, true);
  const res = await replay({
    method: tpl.method,
    url: fillTemplate(tpl.url, threadId, projectId),
    body: tpl.body ? fillTemplate(tpl.body, threadId, projectId) : undefined,
    headers: tpl.headers,
  });
  view?.setPending(threadId, false);
  const ok = res.status >= 200 && res.status < 300;
  log(`sync ${resolved ? 'resolve' : 'unresolve'} ${threadId}:`, res);
  if (ok && board?.threads[threadId]) {
    board.threads[threadId] = { ...board.threads[threadId], resolved };
    board.entries[threadId] = { ...board.entries[threadId], lastNativeResolved: resolved };
    void persist();
  } else if (!ok) {
    view?.toast(`Could not sync with Claude (HTTP ${res.status || res.error}). The card was moved locally only.`, 8000);
  }
  return ok;
}

/* ------------------------------------------------------------------ */
/* Board actions                                                       */
/* ------------------------------------------------------------------ */

function onMove(id: string, to: ColumnId, index: number): void {
  if (!board) return;
  const from = board.entries[id]?.column ?? 'open';
  board = moveCard(board, id, to, index);
  void persist();
  render();
  if (from !== to && (to === 'resolved' || from === 'resolved')) {
    void syncResolve(id, to === 'resolved');
  }
}

function onOpen(id: string, newTab: boolean): void {
  if (!projectId) return;
  const href = threadUrl(projectId, id);
  if (newTab) {
    window.open(href, '_blank', 'noopener');
    return;
  }
  view?.close();
  const link = findThreadLink(id);
  if (link) link.click(); // client-side navigation, no reload
  else location.assign(href);
}

async function refresh(): Promise<void> {
  if (!projectId || !board) return;
  ingest(scanDom(projectId));
  if (board.listEndpoint) {
    const url = fillTemplate(board.listEndpoint, '', projectId);
    const res = await replay({ method: 'GET', url });
    if (res.status >= 200 && res.status < 300 && res.body) {
      ingest(extractThreads(res.body), url);
    } else {
      log('re-request of list endpoint failed', url, res);
    }
  }
  updateStatus();
}

function updateStatus(): void {
  if (!view || !board) return;
  const n = Object.keys(board.threads).length;
  const sync = templateFor('resolve') ? 'resolve sync: on' : 'resolve sync: not learned yet';
  const src = board.listEndpoint ? 'source: API' : 'source: page';
  view.setStatus({ text: `${n} thread(s) · ${src} · ${sync}` });
}

function render(): void {
  if (view && board) {
    view.render(board);
    updateStatus();
  }
}

let saveTimer: number | undefined;
function persist(): Promise<void> {
  clearTimeout(saveTimer);
  return new Promise((resolve) => {
    saveTimer = window.setTimeout(async () => {
      if (projectId && board) await saveBoard(projectId, board);
      resolve();
    }, 250);
  });
}

/* ------------------------------------------------------------------ */
/* Routing: switch projects without reloading the board                */
/* ------------------------------------------------------------------ */

async function onRoute(): Promise<void> {
  const next = projectIdFromLocation(location);
  if (next === projectId) return;
  if (projectId && board) await saveBoard(projectId, board);
  // Data buffered while on another project belongs to that project.
  if (projectId !== null || next === null) buffered = [];
  projectId = next;
  board = null;
  lastLoggedSignature = '';
  view?.setAvailable(!!next);
  if (!next) return;
  const loaded = await loadBoard(next);
  if (projectId !== next) return; // user navigated again meanwhile
  board = loaded;
  const early = buffered;
  buffered = [];
  for (const b of early) ingest(b.threads, b.listUrl);
  log('project', next, 'loaded with', Object.keys(board.threads).length, 'cached thread(s)');
  render();
  if (view?.isOpen) void refresh();
}

function watchUrl(): void {
  let href = location.href;
  const check = () => {
    if (location.href !== href) {
      href = location.href;
      void onRoute();
    }
  };
  window.addEventListener('popstate', check);
  setInterval(check, 500);
}

function watchDom(): void {
  let t: number | undefined;
  new MutationObserver(() => {
    clearTimeout(t);
    t = window.setTimeout(() => projectId && board && ingest(scanDom(projectId)), 800);
  }).observe(document.body, { childList: true, subtree: true });
}

async function main(): Promise<void> {
  [settings, templates] = await Promise.all([loadSettings(), loadTemplates()]);
  if (document.readyState === 'loading') {
    await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
  }
  view = new BoardView({ onMove, onOpen, onRefresh: () => void refresh() });
  view.attach();
  watchUrl();
  watchDom();
  await onRoute();
  window.setInterval(() => view?.isOpen && void refresh(), REFRESH_MS);
  log('ready', { resolveSyncLearned: !!templateFor('resolve') });
}

void main();
