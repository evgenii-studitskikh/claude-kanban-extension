import { FROM_CONTENT, FROM_PAGE, type PageMessage } from '../shared/messages';

type Listener = (msg: PageMessage) => void;
const listeners: Listener[] = [];
const pending = new Map<string, (r: { status: number; body?: unknown; error?: string }) => void>();

window.addEventListener('message', (ev: MessageEvent) => {
  if (ev.source !== window || ev.origin !== location.origin) return;
  const msg = ev.data as PageMessage;
  if (!msg || msg.source !== FROM_PAGE) return;
  if (msg.type === 'replay-result') {
    pending.get(msg.reqId)?.(msg);
    pending.delete(msg.reqId);
    return;
  }
  for (const l of listeners) l(msg);
});

export function onPageMessage(l: Listener): void {
  listeners.push(l);
}

/** Ask the page-world hook to perform a same-origin request with the user's session. */
export function replay(req: {
  method: string;
  url: string;
  body?: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body?: unknown; error?: string }> {
  const reqId = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    pending.set(reqId, resolve);
    window.postMessage(
      { source: FROM_CONTENT, type: 'replay', reqId, headers: {}, ...req },
      location.origin,
    );
    setTimeout(() => {
      if (pending.delete(reqId)) resolve({ status: 0, error: 'timeout' });
    }, 15_000);
  });
}
