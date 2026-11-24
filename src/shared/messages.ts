/**
 * Protocol between the page-world hook (src/page/hook.ts) and the
 * extension's content script, over window.postMessage.
 */
export const FROM_PAGE = 'claude-kanban:page';
export const FROM_CONTENT = 'claude-kanban:content';

export type PageMessage =
  | { source: typeof FROM_PAGE; type: 'json'; url: string; method: string; body: unknown }
  | {
      source: typeof FROM_PAGE;
      type: 'mutation';
      url: string;
      method: string;
      body?: string;
      headers: Record<string, string>;
      status: number;
    }
  | { source: typeof FROM_PAGE; type: 'replay-result'; reqId: string; status: number; body?: unknown; error?: string };

export type ContentMessage = {
  source: typeof FROM_CONTENT;
  type: 'replay';
  reqId: string;
  method: string;
  url: string;
  body?: string;
  headers: Record<string, string>;
};
