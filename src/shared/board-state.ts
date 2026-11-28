import { DEFAULT_COLUMN_BY_STATE } from './claude-endpoints';
import { effectiveColumn, hasColumn } from './columns';
import { OPEN_COLUMN, RESOLVED_COLUMN, type ColumnId, type ProjectBoard, type Thread } from './types';

function cloneOrder(order: ProjectBoard['order']): ProjectBoard['order'] {
  return Object.fromEntries(Object.entries(order).map(([k, v]) => [k, [...v]]));
}

/**
 * Merge freshly seen threads into the board. Native resolve wins:
 *  - resolved natively → "resolved" column;
 *  - was resolved natively, now isn't (reopened in claude.ai) → "open".
 * Other columns are purely local.
 */
export function mergeThreads(board: ProjectBoard, threads: Thread[]): ProjectBoard {
  const next: ProjectBoard = {
    ...board,
    entries: { ...board.entries },
    threads: { ...board.threads },
    order: cloneOrder(board.order),
  };
  for (const t of threads) {
    const prev = next.threads[t.id];
    // DOM data is poorer than API data; don't let it overwrite richer fields.
    next.threads[t.id] =
      prev && t.source === 'dom'
        ? { ...prev, title: prev.title || t.title }
        : { ...prev, ...stripUndefined(t) };

    const entry = next.entries[t.id];
    const nativeResolved = t.resolved;
    if (!entry) {
      const byState = t.state ? DEFAULT_COLUMN_BY_STATE[t.state] : undefined;
      const col: ColumnId =
        nativeResolved === true ? RESOLVED_COLUMN : byState && hasColumn(next, byState) ? byState : OPEN_COLUMN;
      next.entries[t.id] = { column: col, lastNativeResolved: nativeResolved };
      continue;
    }
    if (nativeResolved === true && entry.column !== RESOLVED_COLUMN) {
      next.entries[t.id] = { column: RESOLVED_COLUMN, lastNativeResolved: true };
      moveInOrder(next, t.id, RESOLVED_COLUMN, 0);
    } else if (nativeResolved === false && entry.lastNativeResolved === true && entry.column === RESOLVED_COLUMN) {
      next.entries[t.id] = { column: OPEN_COLUMN, lastNativeResolved: false };
      moveInOrder(next, t.id, OPEN_COLUMN, 0);
    } else if (nativeResolved !== undefined) {
      next.entries[t.id] = { ...entry, lastNativeResolved: nativeResolved };
    }
  }
  return next;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function moveInOrder(board: ProjectBoard, id: string, to: ColumnId, index: number): void {
  for (const col of Object.keys(board.order)) {
    board.order[col] = board.order[col].filter((x) => x !== id);
  }
  const list = (board.order[to] ??= []);
  list.splice(Math.max(0, Math.min(index, list.length)), 0, id);
}

/** User dragged a card. Returns a new board. */
export function moveCard(board: ProjectBoard, id: string, to: ColumnId, index: number): ProjectBoard {
  const next: ProjectBoard = {
    ...board,
    entries: { ...board.entries, [id]: { ...board.entries[id], column: to } },
    order: cloneOrder(board.order),
  };
  // Make sure the order list reflects what's currently shown before inserting.
  next.order[to] = columnCards(board, to).map((t) => t.id).filter((x) => x !== id);
  moveInOrder(next, id, to, index);
  return next;
}

/** Cards of a column in display order: manual order first, then newest. */
export function columnCards(board: ProjectBoard, col: ColumnId): Thread[] {
  const ids = Object.keys(board.threads).filter((id) => effectiveColumn(board, id) === col);
  const manual = (board.order[col] ?? []).filter((id) => ids.includes(id));
  const rest = ids
    .filter((id) => !manual.includes(id))
    .sort((a, b) => (board.threads[b].updatedAt ?? '').localeCompare(board.threads[a].updatedAt ?? ''));
  return [...rest, ...manual].map((id) => board.threads[id]);
}

/** Drop threads that the authoritative list no longer returns (e.g. archived). */
export function pruneMissing(board: ProjectBoard, keep: Set<string>): ProjectBoard {
  const threads = Object.fromEntries(Object.entries(board.threads).filter(([id]) => keep.has(id)));
  if (Object.keys(threads).length === Object.keys(board.threads).length) return board;
  const entries = Object.fromEntries(Object.entries(board.entries).filter(([id]) => keep.has(id)));
  const order = Object.fromEntries(Object.entries(board.order).map(([k, v]) => [k, v.filter((id) => keep.has(id))]));
  return { ...board, threads, entries, order };
}

/** Cache key for a thread's last message: refetch when it changes. */
export function lastMessageKey(t: Thread): string {
  return t.updatedAt ?? '';
}

/**
 * Threads whose last message should be (re)fetched: never fetched, or the
 * thread had activity since. Newest first, at most `limit`. DOM-only threads
 * are skipped because they may not exist in the API.
 */
export function threadsNeedingLastMessage(board: ProjectBoard, limit: number): Thread[] {
  return Object.values(board.threads)
    .filter((t) => t.source === 'api' && t.lastMessageFor !== lastMessageKey(t))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, limit);
}

/** Store a fetched last message. Returns a new board (or the same one if unchanged). */
export function setLastMessage(board: ProjectBoard, id: string, text: string | null, key: string): ProjectBoard {
  const t = board.threads[id];
  if (!t) return board;
  const lastMessage = text ?? undefined;
  if (t.lastMessage === lastMessage && t.lastMessageFor === key) return board;
  return { ...board, threads: { ...board.threads, [id]: { ...t, lastMessage, lastMessageFor: key } } };
}
