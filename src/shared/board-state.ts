import { DEFAULT_COLUMN_BY_STATE } from './claude-endpoints';
import type { ColumnId, ProjectBoard, Thread } from './types';

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
    order: { open: [...board.order.open], in_progress: [...board.order.in_progress], resolved: [...board.order.resolved] },
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
      const col: ColumnId =
        nativeResolved === true ? 'resolved' : (t.state && DEFAULT_COLUMN_BY_STATE[t.state]) || 'open';
      next.entries[t.id] = { column: col, lastNativeResolved: nativeResolved };
      continue;
    }
    if (nativeResolved === true && entry.column !== 'resolved') {
      next.entries[t.id] = { column: 'resolved', lastNativeResolved: true };
      moveInOrder(next, t.id, 'resolved', 0);
    } else if (nativeResolved === false && entry.lastNativeResolved === true && entry.column === 'resolved') {
      next.entries[t.id] = { column: 'open', lastNativeResolved: false };
      moveInOrder(next, t.id, 'open', 0);
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
  for (const col of Object.keys(board.order) as ColumnId[]) {
    board.order[col] = board.order[col].filter((x) => x !== id);
  }
  const list = board.order[to];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, id);
}

/** User dragged a card. Returns a new board. */
export function moveCard(board: ProjectBoard, id: string, to: ColumnId, index: number): ProjectBoard {
  const next: ProjectBoard = {
    ...board,
    entries: { ...board.entries, [id]: { ...board.entries[id], column: to } },
    order: { open: [...board.order.open], in_progress: [...board.order.in_progress], resolved: [...board.order.resolved] },
  };
  // Make sure the order list reflects what's currently shown before inserting.
  next.order[to] = columnCards(board, to).map((t) => t.id).filter((x) => x !== id);
  moveInOrder(next, id, to, index);
  return next;
}

/** Cards of a column in display order: manual order first, then newest. */
export function columnCards(board: ProjectBoard, col: ColumnId): Thread[] {
  const ids = Object.keys(board.threads).filter((id) => (board.entries[id]?.column ?? 'open') === col);
  const manual = board.order[col].filter((id) => ids.includes(id));
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
  const order = {
    open: board.order.open.filter((id) => keep.has(id)),
    in_progress: board.order.in_progress.filter((id) => keep.has(id)),
    resolved: board.order.resolved.filter((id) => keep.has(id)),
  };
  return { ...board, threads, entries, order };
}
