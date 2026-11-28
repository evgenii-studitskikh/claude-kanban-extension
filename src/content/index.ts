/**
 * Content script (isolated world). Glues together:
 *  - thread data from the page hook (JSON claude.ai already loads) and the DOM;
 *  - per-project board state in chrome.storage.local;
 *  - the Shadow DOM board;
 *  - syncing the "resolved" column with claude.ai's native resolve.
 */
import { BoardView } from '../board/board';
import {
  lastMessageKey,
  mergeThreads,
  moveCard,
  pruneMissing,
  setLastMessage,
  threadsNeedingLastMessage,
} from '../shared/board-state';
import {
  API_HEADERS,
  THREAD_MESSAGES_URL_RE,
  projectIdFromLocation,
  threadMessagesUrl,
  threadsListUrl,
  threadUrl,
} from '../shared/claude-endpoints';
import {
  classifyMutation,
  extractThreads,
  fillTemplate,
  flipTemplate,
  makeTemplate,
  parseLastMessage,
  templateUrlFor,
} from '../shared/extract';
import { applyColumnAction, effectiveColumn, type ColumnAction } from '../shared/columns';
import { RESOLVED_COLUMN, type ColumnId, type ProjectBoard, type RequestTemplate, type ResolveTemplates, type Thread } from '../shared/types';
import { onPageMessage, replay } from './bridge';
import { findThreadLink, scanDom } from './dom-source';
import { loadBoard, loadSettings, loadTemplates, saveBoard, saveTemplates, type Settings } from './storage';

const TAG = '[Claude Kanban]';
const REFRESH_MS = 60_000;
/** Last-message requests per refresh, and how many run at once. */
const LAST_MESSAGE_BATCH = 40;
const LAST_MESSAGE_CONCURRENCY = 3;

let settings: Settings = { debug: true };
let templates: ResolveTemplates = {};
let projectId: string | null = null;
let board: ProjectBoard | null = null;
/** Data that arrived before the board for the current project was loaded. */
let buffered: { threads: Thread[]; listUrl?: string }[] = [];
let view: BoardView | null = null;
let lastLoggedSignature = '';
/** Whether the last request to the thread list endpoint succeeded. */
let apiOk = false;

const log = (...a: unknown[]) => settings.debug && console.log(TAG, ...a);

/* ------------------------------------------------------------------ */
/* Incoming data                                                       */
/* ------------------------------------------------------------------ */

onPageMessage((msg) => {
  if (msg.type === 'json') {
    if (msg.method === 'GET') noteLastMessage(msg.url, msg.body);
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
/* Last message on cards                                               */
/* ------------------------------------------------------------------ */

/** The page loaded a thread's messages itself: reuse it for free. */
function noteLastMessage(url: string, body: unknown): void {
  const m = THREAD_MESSAGES_URL_RE.exec(url);
  if (!m || !board || m[1] !== projectId) return;
  const t = board.threads[m[2]];
  const text = parseLastMessage(body, m[2]);
  if (!t || !text) return;
  board = setLastMessage(board, t.id, text, lastMessageKey(t));
  void persist();
  render();
}

let loadingLastMessages = false;

/**
 * Fetch the latest message of threads that changed since we last looked.
 * Runs only while the board is open; results are cached on the thread and
 * keyed by its last-activity time, so unchanged threads are never refetched.
 */
async function loadLastMessages(): Promise<void> {
  if (loadingLastMessages || !projectId || !board || !view?.isOpen) return;
  loadingLastMessages = true;
  const pid = projectId;
  const queue = threadsNeedingLastMessage(board, LAST_MESSAGE_BATCH);
  let changed = 0;
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      if (projectId !== pid || !board) return;
      const key = lastMessageKey(t);
      const res = await replay({ method: 'GET', url: threadMessagesUrl(pid, t.id), headers: API_HEADERS });
      if (projectId !== pid || !board) return;
      if (res.status < 200 || res.status >= 300) {
        log('last message request failed', t.id, res.status, res.error);
        continue; // retried on the next refresh
      }
      // Keep the old text if the shape wasn't recognised, but mark it as fetched.
      const text = parseLastMessage(res.body, t.id) ?? board.threads[t.id]?.lastMessage ?? null;
      const next = setLastMessage(board, t.id, text, key);
      if (next !== board) {
        board = next;
        changed++;
        render();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: LAST_MESSAGE_CONCURRENCY }, worker));
  } finally {
    loadingLastMessages = false;
  }
  if (changed && projectId === pid) {
    log(`loaded last message for ${changed} thread(s)`);
    void persist();
  }
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
    headers: { ...API_HEADERS, ...tpl.headers },
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
  const from = effectiveColumn(board, id);
  board = moveCard(board, id, to, index);
  void persist();
  render();
  if (from !== to && (to === RESOLVED_COLUMN || from === RESOLVED_COLUMN)) {
    void syncResolve(id, to === RESOLVED_COLUMN);
  }
}

function onColumnAction(action: ColumnAction): void {
  if (!board) return;
  const next = applyColumnAction(board, action);
  if (next === board) return;
  board = next;
  void persist();
  render();
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
  const pid = projectId;
  ingest(scanDom(pid));

  // Primary source: the project's thread list endpoint.
  const url = threadsListUrl(pid);
  const res = await replay({ method: 'GET', url, headers: API_HEADERS });
  if (res.status >= 200 && res.status < 300 && res.body && projectId === pid && board) {
    apiOk = true;
    const threads = extractThreads(res.body);
    log(`GET ${url} → ${threads.length} thread(s)`);
    const truncated = typeof res.body === 'object' && (res.body as { truncated?: boolean }).truncated;
    if (!truncated) board = pruneMissing(board, new Set(threads.map((t) => t.id)));
    ingest(threads);
  } else if (board?.listEndpoint) {
    apiOk = false;
    log('thread list request failed, falling back to learned endpoint', url, res.status, res.error);
    const fallback = fillTemplate(board.listEndpoint, '', pid);
    const r2 = await replay({ method: 'GET', url: fallback, headers: API_HEADERS });
    if (r2.status >= 200 && r2.status < 300 && r2.body) ingest(extractThreads(r2.body), fallback);
  } else {
    apiOk = false;
    log('thread list request failed', url, res.status, res.error);
  }
  updateStatus();
  void loadLastMessages();
}

function updateStatus(): void {
  if (!view || !board) return;
  const n = Object.keys(board.threads).length;
  const sync = templateFor('resolve') ? 'resolve sync: on' : 'resolve sync: not learned yet';
  const src = apiOk || board.listEndpoint ? 'source: API' : 'source: page';
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
  view?.resetPeek();
  if (!next) return;
  const loaded = await loadBoard(next);
  if (projectId !== next) return; // user navigated again meanwhile
  board = loaded;
  const early = buffered;
  buffered = [];
  for (const b of early) ingest(b.threads, b.listUrl);
  log('project', next, 'loaded with', Object.keys(board.threads).length, 'cached thread(s)');
  render();
  void refresh();
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
  view = new BoardView({
    onMove,
    onColumnAction,
    onOpen,
    onRefresh: () => void refresh(),
    threadHref: (id) => (projectId ? threadUrl(projectId, id) : null),
  });
  view.attach();
  watchUrl();
  watchDom();
  await onRoute();
  window.setInterval(() => view?.isOpen && void refresh(), REFRESH_MS);
  log('ready', { resolveSyncLearned: !!templateFor('resolve') });
}

void main();
