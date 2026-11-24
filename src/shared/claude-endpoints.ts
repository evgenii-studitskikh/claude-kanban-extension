/**
 * EVERYTHING that depends on claude.ai internals lives in this file:
 * URL shapes, id formats, JSON field names, DOM selectors and the rules used
 * to recognise the "resolve" request. When claude.ai changes, fix it here.
 *
 * None of these were verified against a logged-in session yet. Items marked
 * `VERIFY` are educated guesses; see docs/RESEARCH.md for how to check them
 * in DevTools → Network.
 */

/** Project page: https://claude.ai/code/project/chan_XXXX?thread=cmsg_YYYY */
export const PROJECT_PATH_RE = /^\/code\/project\/(chan_[A-Za-z0-9]+)/;

/** Query parameter that selects a thread inside a project page. */
export const THREAD_QUERY_PARAM = 'thread';

/** Thread ids look like `cmsg_...` (the id of the thread's root message). VERIFY */
export const THREAD_ID_RE = /^cmsg_[A-Za-z0-9]+$/;
export const PROJECT_ID_RE = /^chan_[A-Za-z0-9]+$/;

export function projectIdFromLocation(loc: Pick<Location, 'pathname'>): string | null {
  const m = PROJECT_PATH_RE.exec(loc.pathname);
  return m ? m[1] : null;
}

export function threadUrl(projectId: string, threadId: string): string {
  return `/code/project/${projectId}?${THREAD_QUERY_PARAM}=${encodeURIComponent(threadId)}`;
}

/* ------------------------------------------------------------------------ */
/* Known endpoints (verified on claude.ai, 2026-11-24)                       */
/* ------------------------------------------------------------------------ */

/**
 * claude.ai's /v1 API rejects requests without this header
 * ("anthropic-version: header is required").
 */
export const API_HEADERS: Record<string, string> = { 'anthropic-version': '2023-06-01' };

/**
 * Thread list of a project. Response shape:
 *   { sections: [{ status, count, data: [rootMessage, ...] }], truncated }
 * where status is one of needs_input | failed | working | idle | resolved | archived,
 * and each root message has id (cmsg_…), body (first message text),
 * bound_sessions[0].title (thread title), last_reply_at, created_at, thread_status.
 */
export function threadsListUrl(projectId: string): string {
  return `/v1/code/channels/${encodeURIComponent(projectId)}/threads?limit=100`;
}

/** Section statuses that mean "resolved" natively. */
export const RESOLVED_SECTIONS = new Set(['resolved']);
/** Section statuses that are hidden from the board entirely. */
export const HIDDEN_SECTIONS = new Set(['archived']);

/* ------------------------------------------------------------------------ */
/* Network sniffing (page-hook runs in the page's own JS world)              */
/* ------------------------------------------------------------------------ */

/** Only responses from URLs matching this are inspected. VERIFY */
export const API_URL_RE = /\/(api|edge-api|v1|v2)\//;

/** Cheap pre-filter on the raw response text before JSON.parse. */
export const RESPONSE_MUST_CONTAIN = 'cmsg_';

/** Bigger bodies are ignored to keep the page fast. */
export const MAX_SNIFF_BYTES = 5 * 1024 * 1024;

/**
 * A non-GET request is reported to the extension as a possible
 * "resolve/unresolve thread" call if its URL or body matches this. VERIFY
 */
export const RESOLVE_MUTATION_RE = /resolv|reopen|archiv/i;

/** Request headers that may be replayed when we repeat a learned request. */
export const REPLAYABLE_HEADER_RE = /^(content-type|accept|anthropic-[a-z0-9-]+|x-[a-z0-9-]+)$/i;
/** Never store or replay these, even if they match the pattern above. */
export const SECRET_HEADER_RE = /auth|cookie|token|secret|key|csrf|session/i;

/* ------------------------------------------------------------------------ */
/* JSON field names — the extractor walks any JSON and picks objects that    */
/* look like threads using these candidates (first match wins). VERIFY all   */
/* ------------------------------------------------------------------------ */

export const FIELDS = {
  id: ['thread_id', 'root_id', 'root_message_id', 'ts', 'id', 'uuid'],
  title: ['title', 'thread_title', 'name', 'summary_title'],
  updatedAt: [
    'last_activity_at',
    'last_message_at',
    'updated_at',
    'resolved_at',
    'created_at',
  ],
  snippet: [
    'last_message_preview',
    'preview',
    'snippet',
    'last_message.text',
    'last_message.body',
    'last_message.content',
    'latest_message.text',
    'summary',
  ],
  resolvedBool: ['resolved', 'is_resolved'],
  resolvedAt: ['resolved_at'],
  state: ['state', 'status'],
  projectId: ['project_id', 'channel_id', 'channel', 'project'],
} as const;

/** Values of `state`/`status` that mean the thread is resolved natively. VERIFY */
export const RESOLVED_STATES = new Set(['resolved', 'archived', 'closed']);

/**
 * Where a thread that the user has never moved starts. Keys are native
 * `state` values (as seen in the project UI: working, blocked, review_ready,
 * done, failed, stopped). Anything unlisted starts in "open".
 */
export const DEFAULT_COLUMN_BY_STATE: Record<string, 'open' | 'in_progress'> = {
  working: 'in_progress',
  needs_input: 'in_progress',
  blocked: 'in_progress',
  review_ready: 'in_progress',
};

/* ------------------------------------------------------------------------ */
/* DOM fallback — used when no JSON endpoint has been seen                   */
/* ------------------------------------------------------------------------ */

export const DOM = {
  /** Links to threads in the project's thread list. VERIFY */
  threadLink: `a[href*="${THREAD_QUERY_PARAM}=cmsg_"]`,
  /** Element whose presence means the thread list area is on screen. */
  observeRoot: 'body',
};

/** Pull the thread id out of an href like `...?thread=cmsg_123`. */
export function threadIdFromHref(href: string): string | null {
  try {
    const u = new URL(href, 'https://claude.ai');
    const id = u.searchParams.get(THREAD_QUERY_PARAM);
    return id && THREAD_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}
