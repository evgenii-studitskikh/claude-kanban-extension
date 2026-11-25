import { columnCards } from '../shared/board-state';
import { COLUMNS, type ColumnId, type ProjectBoard, type Thread } from '../shared/types';
import { CSS } from './styles';

export interface BoardCallbacks {
  onMove(threadId: string, to: ColumnId, index: number): void;
  onOpen(threadId: string, newTab: boolean): void;
  onRefresh(): void;
}

export interface BoardStatus {
  text: string;
}

/** The whole UI lives in a Shadow DOM so claude.ai styles can't touch it. */
export class BoardView {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private overlay: HTMLElement;
  private launcher: HTMLButtonElement;
  private columnsEl: HTMLElement;
  private statusEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer?: number;
  private dragId: string | null = null;
  private pendingIds = new Set<string>();
  private last: ProjectBoard | null = null;

  constructor(private cb: BoardCallbacks) {
    this.host = document.createElement('claude-kanban-root');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `
      <style>${CSS}</style>
      <div class="root">
        <button class="launcher" hidden title="Kanban (Alt+K)">▦ Kanban</button>
        <div class="overlay" hidden role="dialog" aria-label="Kanban">
          <header>
            <h1>Project threads</h1>
            <span class="status"></span>
            <button class="ghost" data-act="refresh">Refresh</button>
            <button class="ghost" data-act="close" title="Esc">Close</button>
          </header>
          <div class="columns"></div>
        </div>
        <div class="toast" hidden></div>
      </div>`;
    const $ = <T extends Element>(s: string) => this.shadow.querySelector(s) as T;
    this.overlay = $('.overlay');
    this.launcher = $('.launcher');
    this.columnsEl = $('.columns');
    this.statusEl = $('.status');
    this.toastEl = $('.toast');

    this.launcher.addEventListener('click', () => this.open());
    $('[data-act="close"]').addEventListener('click', () => this.close());
    $('[data-act="refresh"]').addEventListener('click', () => this.cb.onRefresh());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
      if (e.altKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK') && !this.launcher.hidden) {
        e.preventDefault();
        this.isOpen ? this.close() : this.open();
      }
    });
  }

  attach(): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  /** Show the launcher only on project pages. */
  setAvailable(available: boolean): void {
    this.launcher.hidden = !available;
    if (!available) this.close();
  }

  open(): void {
    this.overlay.hidden = false;
    this.launcher.hidden = true;
    this.cb.onRefresh();
  }

  close(): void {
    if (this.overlay.hidden) return;
    this.overlay.hidden = true;
    this.launcher.hidden = false;
  }

  setStatus(s: BoardStatus): void {
    this.statusEl.textContent = s.text;
    this.statusEl.title = s.text;
  }

  setPending(id: string, pending: boolean): void {
    pending ? this.pendingIds.add(id) : this.pendingIds.delete(id);
    if (this.last) this.render(this.last);
  }

  toast(text: string, ms = 5000): void {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), ms);
  }

  render(board: ProjectBoard): void {
    this.last = board;
    if (this.dragId) return; // don't rebuild under the user's cursor
    this.columnsEl.replaceChildren(
      ...COLUMNS.map(({ id, title }) => this.renderColumn(id, title, columnCards(board, id))),
    );
  }

  private renderColumn(colId: ColumnId, title: string, cards: Thread[]): HTMLElement {
    const col = document.createElement('section');
    col.className = 'column';
    col.dataset.col = colId;
    const h = document.createElement('h2');
    h.innerHTML = `<span></span><span class="count"></span>`;
    h.children[0].textContent = title;
    h.children[1].textContent = String(cards.length);
    const list = document.createElement('div');
    list.className = 'list';
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Drop a card here';
      list.append(empty);
    }
    for (const t of cards) list.append(this.renderCard(t));
    col.append(h, list);
    this.wireDrop(col, list, colId);
    return col;
  }

  private renderCard(t: Thread): HTMLElement {
    const card = document.createElement('article');
    card.className = 'card' + (this.pendingIds.has(t.id) ? ' pending' : '');
    card.draggable = true;
    card.dataset.id = t.id;
    card.tabIndex = 0;

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = t.title;
    const meta = document.createElement('div');
    meta.className = 'meta';
    if (t.updatedAt) {
      const d = document.createElement('span');
      d.textContent = formatDate(t.updatedAt);
      d.title = new Date(t.updatedAt).toLocaleString('en-US');
      meta.append(d);
    }
    if (t.state) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = t.state;
      meta.append(b);
    }
    card.append(title, meta);
    const snippet = t.lastMessage ?? t.snippet;
    if (snippet) {
      const s = document.createElement('div');
      s.className = 'snippet';
      s.textContent = snippet;
      s.title = t.lastMessage ? 'Last message' : 'First message';
      card.append(s);
    }

    card.addEventListener('click', (e) => this.cb.onOpen(t.id, e.metaKey || e.ctrlKey || e.button === 1));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cb.onOpen(t.id, e.metaKey || e.ctrlKey);
    });
    card.addEventListener('dragstart', (e) => {
      this.dragId = t.id;
      card.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', t.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      this.dragId = null;
      this.clearDropUi();
      if (this.last) this.render(this.last);
    });
    return card;
  }

  private placeholder = Object.assign(document.createElement('div'), { className: 'placeholder' });

  private wireDrop(col: HTMLElement, list: HTMLElement, colId: ColumnId): void {
    col.addEventListener('dragover', (e) => {
      if (!this.dragId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      this.shadow.querySelectorAll('.column.drop-target').forEach((c) => c !== col && c.classList.remove('drop-target'));
      col.classList.add('drop-target');
      const idx = this.indexAt(list, e.clientY);
      const cards = [...list.querySelectorAll<HTMLElement>('.card:not(.dragging)')];
      list.insertBefore(this.placeholder, cards[idx] ?? null);
    });
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget as Node)) {
        col.classList.remove('drop-target');
        this.placeholder.remove();
      }
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = this.dragId;
      if (!id) return;
      const idx = this.indexAt(list, e.clientY);
      this.dragId = null;
      this.clearDropUi();
      this.cb.onMove(id, colId, idx);
    });
  }

  /** Index among the non-dragged cards at which the pointer would drop. */
  private indexAt(list: HTMLElement, y: number): number {
    const cards = [...list.querySelectorAll<HTMLElement>('.card:not(.dragging)')];
    const i = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i === -1 ? cards.length : i;
  }

  private clearDropUi(): void {
    this.placeholder.remove();
    this.shadow.querySelectorAll('.drop-target').forEach((c) => c.classList.remove('drop-target'));
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d ago`;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
