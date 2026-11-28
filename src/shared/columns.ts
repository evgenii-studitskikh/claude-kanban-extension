import { DEFAULT_COLUMNS, OPEN_COLUMN, RESOLVED_COLUMN, type ColumnDef, type ColumnId, type ProjectBoard } from './types';

/** Accent colors offered in the column menu. */
export const COLUMN_COLORS: readonly string[] = [
  '#c96442', // terracotta
  '#d4a72c', // amber
  '#3f9b5b', // green
  '#2f7fc1', // blue
  '#8a5cc7', // purple
  '#c2457a', // pink
  '#7a7468', // gray
];

export const MAX_COLUMN_TITLE = 40;

/** The board's columns in display order (defaults for boards saved before custom columns). */
export function boardColumns(board: ProjectBoard): ColumnDef[] {
  const cols = board.columns?.length ? board.columns : DEFAULT_COLUMNS;
  // Open and Resolved must always exist: cards fall back to Open, Resolved syncs with Claude.
  const missing = DEFAULT_COLUMNS.filter(
    (d) => (d.id === OPEN_COLUMN || d.id === RESOLVED_COLUMN) && !cols.some((c) => c.id === d.id),
  );
  return [...cols, ...missing].map((c) => ({ ...c }));
}

export function hasColumn(board: ProjectBoard, id: ColumnId): boolean {
  return boardColumns(board).some((c) => c.id === id);
}

/** Open and Resolved can be renamed, recolored and moved, but not deleted. */
export function isProtectedColumn(id: ColumnId): boolean {
  return id === OPEN_COLUMN || id === RESOLVED_COLUMN;
}

/** The column a card is shown in: its saved column, or Open if that column was deleted. */
export function effectiveColumn(board: ProjectBoard, threadId: string): ColumnId {
  const col = board.entries[threadId]?.column;
  return col && hasColumn(board, col) ? col : OPEN_COLUMN;
}

export type ColumnAction =
  | { type: 'add'; title: string; color?: string }
  | { type: 'rename'; id: ColumnId; title: string }
  | { type: 'color'; id: ColumnId; color?: string }
  /** Move a column to `index` in the display order. */
  | { type: 'move'; id: ColumnId; index: number }
  | { type: 'remove'; id: ColumnId };

export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, MAX_COLUMN_TITLE);
}

function newColumnId(existing: ColumnDef[]): ColumnId {
  for (;;) {
    const id = `col_${Math.random().toString(36).slice(2, 8)}`;
    if (!existing.some((c) => c.id === id)) return id;
  }
}

/** Apply a column edit. Returns the same board when the action is invalid or a no-op. */
export function applyColumnAction(board: ProjectBoard, a: ColumnAction): ProjectBoard {
  const cols = boardColumns(board);
  const withCols = (columns: ColumnDef[], extra: Partial<ProjectBoard> = {}): ProjectBoard => ({
    ...board,
    ...extra,
    columns,
  });
  const idx = a.type === 'add' ? -1 : cols.findIndex((c) => c.id === a.id);
  if (a.type !== 'add' && idx === -1) return board;

  switch (a.type) {
    case 'add': {
      const title = cleanTitle(a.title);
      if (!title) return board;
      const id = newColumnId(cols);
      // New columns go before Resolved, which conventionally stays last.
      const at = cols.findIndex((c) => c.id === RESOLVED_COLUMN);
      const next = [...cols];
      next.splice(at === -1 ? next.length : at, 0, { id, title, ...(a.color ? { color: a.color } : {}) });
      return withCols(next, { order: { ...board.order, [id]: [] } });
    }
    case 'rename': {
      const title = cleanTitle(a.title);
      if (!title || title === cols[idx].title) return board;
      return withCols(cols.map((c, i) => (i === idx ? { ...c, title } : c)));
    }
    case 'color': {
      if (cols[idx].color === a.color) return board;
      return withCols(
        cols.map((c, i) => {
          if (i !== idx) return c;
          const { color: _old, ...rest } = c;
          return a.color ? { ...rest, color: a.color } : rest;
        }),
      );
    }
    case 'move': {
      const to = Math.max(0, Math.min(a.index, cols.length - 1));
      if (to === idx) return board;
      const next = [...cols];
      const [col] = next.splice(idx, 1);
      next.splice(to, 0, col);
      return withCols(next);
    }
    case 'remove': {
      if (isProtectedColumn(a.id)) return board;
      // Cards of the deleted column move to the bottom of Open, keeping their order.
      const moved = Object.keys(board.entries).filter((id) => board.entries[id].column === a.id);
      const removedOrder = board.order[a.id] ?? [];
      const movedSorted = [...removedOrder.filter((id) => moved.includes(id)), ...moved.filter((id) => !removedOrder.includes(id))];
      const entries = { ...board.entries };
      for (const id of moved) entries[id] = { ...entries[id], column: OPEN_COLUMN };
      const order = { ...board.order };
      delete order[a.id];
      const open = (order[OPEN_COLUMN] ?? []).filter((id) => !movedSorted.includes(id));
      order[OPEN_COLUMN] = [...open, ...movedSorted];
      return withCols(cols.filter((c) => c.id !== a.id), { entries, order });
    }
  }
}
