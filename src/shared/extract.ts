import {
  FIELDS,
  HIDDEN_SECTIONS,
  RESOLVED_SECTIONS,
  PROJECT_ID_RE,
  RESOLVED_STATES,
  RESOLVE_MUTATION_RE,
  THREAD_ID_RE,
} from './claude-endpoints';
import type { RequestTemplate, Thread } from './types';

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Read `a.b.c` from an object. */
function getPath(o: Obj, path: string): unknown {
  let cur: unknown = o;
  for (const k of path.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function firstString(o: Obj, paths: readonly string[]): string | undefined {
  for (const p of paths) {
    const v = getPath(o, p);
    if (typeof v === 'string' && v.trim()) return v.trim();
    // Content blocks: [{type:'text', text:'...'}]
    if (Array.isArray(v)) {
      const text = v
        .map((b) => (isObj(b) && typeof b.text === 'string' ? b.text : typeof b === 'string' ? b : ''))
        .join(' ')
        .trim();
      if (text) return text;
    }
  }
  return undefined;
}

function toIso(v: unknown): string | undefined {
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  if (typeof v === 'string' && v) {
    // Slack-like "1700000000.000200" timestamps.
    if (/^\d{9,11}(\.\d+)?$/.test(v)) return new Date(parseFloat(v) * 1000).toISOString();
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return undefined;
}

function threadIdOf(o: Obj): string | undefined {
  for (const k of FIELDS.id) {
    const v = o[k];
    if (typeof v === 'string' && THREAD_ID_RE.test(v)) return v;
  }
  return undefined;
}

function projectIdOf(o: Obj): string | undefined {
  for (const p of FIELDS.projectId) {
    const v = getPath(o, p);
    if (typeof v === 'string' && PROJECT_ID_RE.test(v)) return v;
    if (isObj(v)) {
      const id = v.id ?? v.uuid;
      if (typeof id === 'string' && PROJECT_ID_RE.test(id)) return id;
    }
  }
  return undefined;
}

export function objectToThread(o: Obj): Thread | null {
  const id = threadIdOf(o);
  if (!id) return null;
  const title = firstString(o, FIELDS.title);
  if (!title) return null; // messages have cmsg_ ids too, but no title

  let updatedAt: string | undefined;
  for (const p of FIELDS.updatedAt) {
    updatedAt = toIso(getPath(o, p));
    if (updatedAt) break;
  }

  const state = firstString(o, FIELDS.state)?.toLowerCase();
  let resolved: boolean | undefined;
  for (const k of FIELDS.resolvedBool) {
    if (typeof o[k] === 'boolean') {
      resolved = o[k] as boolean;
      break;
    }
  }
  if (resolved === undefined) {
    for (const k of FIELDS.resolvedAt) {
      if (k in o) {
        resolved = o[k] != null && o[k] !== '';
        break;
      }
    }
  }
  if (resolved === undefined && state && RESOLVED_STATES.has(state)) resolved = true;

  const snippet = firstString(o, FIELDS.snippet);
  return {
    id,
    title,
    updatedAt,
    snippet: snippet && snippet !== title ? snippet.slice(0, 280) : undefined,
    resolved,
    state,
    projectId: projectIdOf(o),
    source: 'api',
  };
}

/**
 * Parse the known thread-list response (see threadsListUrl). Returns null if
 * the JSON doesn't have that shape.
 */
export function parseThreadSections(json: unknown): Thread[] | null {
  if (!isObj(json) || !Array.isArray(json.sections)) return null;
  const out: Thread[] = [];
  for (const section of json.sections) {
    if (!isObj(section) || !Array.isArray(section.data)) continue;
    const status = typeof section.status === 'string' ? section.status : undefined;
    if (status && HIDDEN_SECTIONS.has(status)) continue;
    for (const m of section.data) {
      if (!isObj(m) || typeof m.id !== 'string' || !THREAD_ID_RE.test(m.id)) continue;
      const body = typeof m.body === 'string' ? m.body.trim() : '';
      const sessions = Array.isArray(m.bound_sessions) ? m.bound_sessions : [];
      const sessionTitle = sessions
        .map((b) => (isObj(b) && typeof b.title === 'string' ? b.title.trim() : ''))
        .find(Boolean);
      const firstLine = body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
      const title = sessionTitle || firstLine.slice(0, 120) || m.id;
      const state = status ?? (typeof m.thread_status === 'string' ? m.thread_status : undefined);
      const snippet = body && body !== title ? body.replace(/\s+/g, ' ').slice(0, 280) : undefined;
      out.push({
        id: m.id,
        title,
        updatedAt: toIso(m.last_reply_at) ?? toIso(m.created_at),
        snippet,
        resolved: state ? RESOLVED_SECTIONS.has(state) : undefined,
        state,
        projectId: typeof m.channel_id === 'string' ? m.channel_id : undefined,
        source: 'api',
      });
    }
  }
  return out;
}

/** Walk any JSON value and collect everything that looks like a thread. */
export function extractThreads(json: unknown, maxNodes = 50_000): Thread[] {
  const known = parseThreadSections(json);
  if (known) return known;
  const out = new Map<string, Thread>();
  const stack: unknown[] = [json];
  let seen = 0;
  while (stack.length && seen++ < maxNodes) {
    const v = stack.pop();
    if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (isObj(v)) {
      const t = objectToThread(v);
      if (t && !out.has(t.id)) out.set(t.id, t);
      for (const x of Object.values(v)) if (typeof x === 'object' && x) stack.push(x);
    }
  }
  return [...out.values()];
}

/* ------------------------------------------------------------------------ */
/* Learning the native "resolve" request                                     */
/* ------------------------------------------------------------------------ */

export type ResolveKind = 'resolve' | 'unresolve';

/**
 * Decide whether a recorded mutation resolves or unresolves a thread, and
 * which thread. Returns null when it doesn't look like one.
 */
export function classifyMutation(
  url: string,
  body: string | undefined,
): { kind: ResolveKind; threadId: string } | null {
  const hay = `${url}\n${body ?? ''}`;
  if (!RESOLVE_MUTATION_RE.test(hay)) return null;
  const ids = hay.match(/cmsg_[A-Za-z0-9]+/g);
  if (!ids) return null;
  const threadId = ids[0];

  let kind: ResolveKind = 'resolve';
  if (/unresolv|reopen|unarchiv/i.test(url)) kind = 'unresolve';
  else if (body && /"(resolved|is_resolved|archived)"\s*:\s*false/i.test(body)) kind = 'unresolve';
  return { kind, threadId };
}

export function makeTemplate(
  method: string,
  url: string,
  body: string | undefined,
  headers: Record<string, string>,
  threadId: string,
  projectId: string | null,
): RequestTemplate {
  const sub = (s: string) => {
    let r = s.split(threadId).join('{{threadId}}');
    if (projectId) r = r.split(projectId).join('{{projectId}}');
    return r;
  };
  return { method, url: sub(url), body: body ? sub(body) : undefined, headers, learnedAt: new Date().toISOString() };
}

/** Derive the opposite request when only one direction was learned. */
export function flipTemplate(t: RequestTemplate): RequestTemplate | undefined {
  if (!t.body || !/"(resolved|is_resolved|archived)"\s*:\s*(true|false)/.test(t.body)) return undefined;
  return {
    ...t,
    body: t.body.replace(/("(?:resolved|is_resolved|archived)"\s*:\s*)(true|false)/g, (_m, k, v) =>
      `${k}${v === 'true' ? 'false' : 'true'}`,
    ),
  };
}

export function fillTemplate(s: string, threadId: string, projectId: string): string {
  return s.split('{{threadId}}').join(threadId).split('{{projectId}}').join(projectId);
}

export function templateUrlFor(url: string, projectId: string): string {
  return url.split(projectId).join('{{projectId}}');
}
