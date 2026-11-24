import { DOM, projectIdFromLocation, threadIdFromHref } from '../shared/claude-endpoints';
import type { Thread } from '../shared/types';

/** Fallback: read thread links straight from the project page. */
export function scanDom(projectId: string): Thread[] {
  const out = new Map<string, Thread>();
  document.querySelectorAll<HTMLAnchorElement>(DOM.threadLink).forEach((a) => {
    const id = threadIdFromHref(a.href);
    if (!id || out.has(id)) return;
    // Links to threads of other projects (e.g. a sidebar) don't belong here.
    const linkProject = projectIdFromLocation(new URL(a.href, location.href));
    if (linkProject && linkProject !== projectId) return;
    const title = (a.innerText || a.textContent || '').split('\n').map((s) => s.trim()).find(Boolean);
    if (!title) return;
    out.set(id, { id, title: title.slice(0, 200), projectId, source: 'dom' });
  });
  return [...out.values()];
}

/** Find the page's own link to a thread, so we can navigate the SPA way. */
export function findThreadLink(threadId: string): HTMLAnchorElement | null {
  for (const a of document.querySelectorAll<HTMLAnchorElement>(DOM.threadLink)) {
    if (threadIdFromHref(a.href) === threadId) return a;
  }
  return null;
}
