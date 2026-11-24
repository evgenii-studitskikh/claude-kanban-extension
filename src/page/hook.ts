/**
 * Runs in the page's own JS world (manifest "world": "MAIN") at
 * document_start. It watches the JSON that claude.ai itself loads and the
 * mutating requests it sends, and forwards the interesting ones to the
 * content script. It never sends anything anywhere else.
 */
import {
  API_URL_RE,
  MAX_SNIFF_BYTES,
  REPLAYABLE_HEADER_RE,
  RESOLVE_MUTATION_RE,
  RESPONSE_MUST_CONTAIN,
  SECRET_HEADER_RE,
} from '../shared/claude-endpoints';
import { FROM_CONTENT, FROM_PAGE, type ContentMessage, type PageMessage } from '../shared/messages';

declare global {
  interface Window {
    __claudeKanbanHooked?: boolean;
  }
}

(() => {
  if (window.__claudeKanbanHooked) return;
  window.__claudeKanbanHooked = true;

  type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
  const post = (msg: DistributiveOmit<PageMessage, 'source'>) =>
    window.postMessage({ source: FROM_PAGE, ...msg }, location.origin);

  const absolute = (u: string) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return u;
    }
  };

  const safeHeaders = (h: HeadersInit | Record<string, string> | undefined): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!h) return out;
    new Headers(h as HeadersInit).forEach((v, k) => {
      if (REPLAYABLE_HEADER_RE.test(k) && !SECRET_HEADER_RE.test(k)) out[k] = v;
    });
    return out;
  };

  const inspectText = (url: string, method: string, text: string) => {
    if (text.length > MAX_SNIFF_BYTES || !text.includes(RESPONSE_MUST_CONTAIN)) return;
    try {
      post({ type: 'json', url, method, body: JSON.parse(text) });
    } catch {
      /* not JSON */
    }
  };

  const maybeMutation = (url: string, method: string, body: unknown, headers: Record<string, string>, status: number) => {
    if (method === 'GET' || method === 'HEAD') return;
    const bodyStr = typeof body === 'string' ? body : undefined;
    if (!RESOLVE_MUTATION_RE.test(url) && !(bodyStr && RESOLVE_MUTATION_RE.test(bodyStr))) return;
    post({ type: 'mutation', url, method, body: bodyStr, headers, status });
  };

  /* ---------------- fetch ---------------- */
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const res = await origFetch(input, init);
    try {
      const url = absolute(input instanceof Request ? input.url : String(input));
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (API_URL_RE.test(url)) {
        maybeMutation(url, method, init?.body, safeHeaders(init?.headers ?? (input instanceof Request ? input.headers : undefined)), res.status);
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('json')) {
          res
            .clone()
            .text()
            .then((t) => inspectText(url, method, t))
            .catch(() => {});
        }
      }
    } catch {
      /* never break the page */
    }
    return res;
  };

  /* ---------------- XMLHttpRequest ---------------- */
  type XhrMeta = { url: string; method: string; headers: Record<string, string> };
  const meta = new WeakMap<XMLHttpRequest, XhrMeta>();
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    meta.set(this, { url: absolute(String(url)), method: method.toUpperCase(), headers: {} });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origOpen as any).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.setRequestHeader = function (this: XMLHttpRequest, k: string, v: string) {
    const m = meta.get(this);
    if (m && REPLAYABLE_HEADER_RE.test(k) && !SECRET_HEADER_RE.test(k)) m.headers[k.toLowerCase()] = v;
    return origSetHeader.call(this, k, v);
  };

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const m = meta.get(this);
    if (m && API_URL_RE.test(m.url)) {
      this.addEventListener('loadend', () => {
        try {
          maybeMutation(m.url, m.method, body, m.headers, this.status);
          const ct = this.getResponseHeader('content-type') ?? '';
          if (ct.includes('json') && (this.responseType === '' || this.responseType === 'text')) {
            inspectText(m.url, m.method, this.responseText);
          }
        } catch {
          /* ignore */
        }
      });
    }
    return origSend.call(this, body);
  };

  /* ---------------- replay requests for the content script ---------------- */
  window.addEventListener('message', async (ev: MessageEvent) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const msg = ev.data as ContentMessage;
    if (!msg || msg.source !== FROM_CONTENT || msg.type !== 'replay') return;
    // Only same-origin requests are ever replayed.
    const target = new URL(msg.url, location.href);
    if (target.origin !== location.origin) {
      post({ type: 'replay-result', reqId: msg.reqId, status: 0, error: 'cross-origin refused' });
      return;
    }
    try {
      const res = await origFetch(target.href, {
        method: msg.method,
        headers: msg.headers,
        body: msg.body,
        credentials: 'include',
      });
      let body: unknown;
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      post({ type: 'replay-result', reqId: msg.reqId, status: res.status, body });
    } catch (e) {
      post({ type: 'replay-result', reqId: msg.reqId, status: 0, error: String(e) });
    }
  });
})();
