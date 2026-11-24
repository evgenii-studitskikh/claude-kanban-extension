export type ColumnId = 'open' | 'in_progress' | 'resolved';

export const COLUMNS: { id: ColumnId; title: string }[] = [
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
  entries: Record<string, CardEntry>;
  order: Record<ColumnId, string[]>;
  /** Last known thread metadata, so the board renders instantly. */
  threads: Record<string, Thread>;
  /** GET endpoint that returned this project's threads (templated). */
  listEndpoint?: string;
}

export function emptyBoard(): ProjectBoard {
  return { entries: {}, order: { open: [], in_progress: [], resolved: [] }, threads: {} };
}
