import type { Thread } from './types';

/** Quick status filters shown in the board header, keyed by native section status. */
export const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: 'working', label: 'Working' },
  { id: 'needs_input', label: 'Needs input' },
  { id: 'failed', label: 'Failed' },
  { id: 'idle', label: 'Idle' },
];

export interface BoardFilter {
  /** Free text; every word must appear in the title, snippet or last message. */
  query: string;
  /** Native statuses to show; empty = all. */
  states: Set<string>;
}

export function emptyFilter(): BoardFilter {
  return { query: '', states: new Set() };
}

export function isFilterActive(f: BoardFilter): boolean {
  return f.query.trim() !== '' || f.states.size > 0;
}

/** Native status of a thread, normalised (e.g. "Needs input" → "needs_input"). */
export function normalizeState(state: string | undefined): string {
  return (state ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Native statuses that mean the thread is waiting on the user. */
export const NEEDS_INPUT_STATES = new Set(['needs_input', 'blocked']);

/** True when the thread waits on the user and is not resolved. */
export function needsInput(t: Pick<Thread, 'state' | 'resolved'>): boolean {
  return t.resolved !== true && NEEDS_INPUT_STATES.has(normalizeState(t.state));
}

/** Number of threads that wait on the user. */
export function countNeedsInput(threads: Iterable<Pick<Thread, 'state' | 'resolved'>>): number {
  let n = 0;
  for (const t of threads) if (needsInput(t)) n++;
  return n;
}

export function matchesFilter(t: Thread, f: BoardFilter): boolean {
  if (f.states.size && !f.states.has(normalizeState(t.state))) return false;
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [t.title, t.snippet, t.lastMessage].filter(Boolean).join('\n').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/**
 * Map a drop position among the visible (filtered) cards of a column to an
 * index in the full column list, so hidden cards keep their place.
 * `fullIds` and `visibleIds` are in display order; `dragId` is excluded from both.
 */
export function fullDropIndex(fullIds: string[], visibleIds: string[], visibleIndex: number, dragId: string): number {
  const full = fullIds.filter((id) => id !== dragId);
  const visible = visibleIds.filter((id) => id !== dragId);
  if (visibleIndex < visible.length) {
    const i = full.indexOf(visible[visibleIndex]);
    if (i !== -1) return i;
  }
  const lastVisible = visible[visible.length - 1];
  const j = lastVisible ? full.indexOf(lastVisible) : -1;
  return j === -1 ? full.length : j + 1;
}
