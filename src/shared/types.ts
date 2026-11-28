/**
 * Column id. The built-in ids are `open`, `in_progress` and `resolved`;
 * user-made columns get generated ids (`col_…`).
 */
export type ColumnId = string;

/** Where new and reopened threads land. Can't be deleted. */
export const OPEN_COLUMN = 'open';
/** Synced with claude.ai's native resolve. Can't be deleted. */
export const RESOLVED_COLUMN = 'resolved';

export interface ColumnDef {
  id: ColumnId;
  title: string;
  /** CSS color (hex) of the column accent; undefined = no accent. */
  color?: string;
}

export const DEFAULT_COLUMNS: readonly ColumnDef[] = [
  { id: 'open', title: 'Open' },
  { id: 'in_progress', title: 'In progress' },
  { id: 'resolved', title: 'Resolved' },
];

export interface Thread {
  id: string;
  title: string;
  /** ISO date of the last activity, if known. */
  updatedAt?: string;
  snippet?: string;
  /** Text of the latest message in the thread, fetched lazily. */
  lastMessage?: string;
  /**
   * Cache key for `lastMessage`: the `updatedAt` value the thread had when it
   * was fetched ('' if unknown). Refetch only when `updatedAt` changes.
   */
  lastMessageFor?: string;
  /** Native resolved flag from claude.ai; undefined = unknown. */
  resolved?: boolean;
  /** Native state string (working, blocked, ...), if known. */
  state?: string;
  projectId?: string;
  /** Where we learned about this thread. */
  source: 'api' | 'dom';
}

/** A request recorded from the page that we can repeat for another thread. */
export interface RequestTemplate {
  method: string;
  /** URL with `{{threadId}}` / `{{projectId}}` placeholders. */
  url: string;
  body?: string;
  headers: Record<string, string>;
  learnedAt: string;
}

export interface ResolveTemplates {
  resolve?: RequestTemplate;
  unresolve?: RequestTemplate;
}

export interface CardEntry {
  column: ColumnId;
  /** Native resolved flag the last time we saw this thread. */
  lastNativeResolved?: boolean;
}

export interface ProjectBoard {
  /** Columns in display order; undefined = DEFAULT_COLUMNS (boards saved before custom columns). */
  columns?: ColumnDef[];
  entries: Record<string, CardEntry>;
  /** Manual card order per column id. A column may have no list yet. */
  order: Record<ColumnId, string[]>;
  /** Last known thread metadata, so the board renders instantly. */
  threads: Record<string, Thread>;
  /** GET endpoint that returned this project's threads (templated). */
  listEndpoint?: string;
}

export function emptyBoard(): ProjectBoard {
  return { entries: {}, order: { open: [], in_progress: [], resolved: [] }, threads: {} };
}
