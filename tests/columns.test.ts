import { describe, expect, it } from 'vitest';
import { columnCards, mergeThreads, moveCard } from '../src/shared/board-state';
import { applyColumnAction, boardColumns, effectiveColumn } from '../src/shared/columns';
import { emptyBoard, type ProjectBoard, type Thread } from '../src/shared/types';

const t = (id: string, extra: Partial<Thread> = {}): Thread => ({ id, title: id, source: 'api', ...extra });
const ids = (b: ProjectBoard) => boardColumns(b).map((c) => c.id);
const titles = (b: ProjectBoard) => boardColumns(b).map((c) => c.title);

describe('custom columns', () => {
  it('uses the default columns for old boards', () => {
    expect(ids(emptyBoard())).toEqual(['open', 'in_progress', 'resolved']);
  });

  it('adds a column before Resolved with a trimmed title', () => {
    const b = applyColumnAction(emptyBoard(), { type: 'add', title: '  Review   later ' });
    expect(titles(b)).toEqual(['Open', 'In progress', 'Review later', 'Resolved']);
    const id = ids(b)[2];
    expect(id).toMatch(/^col_/);
    expect(b.order[id]).toEqual([]);
  });

  it('ignores empty titles and unknown columns', () => {
    const b = emptyBoard();
    expect(applyColumnAction(b, { type: 'add', title: '   ' })).toBe(b);
    expect(applyColumnAction(b, { type: 'rename', id: 'nope', title: 'X' })).toBe(b);
    expect(applyColumnAction(b, { type: 'rename', id: 'open', title: ' ' })).toBe(b);
  });

  it('renames and recolors any column, including Resolved', () => {
    let b = applyColumnAction(emptyBoard(), { type: 'rename', id: 'resolved', title: 'Done' });
    b = applyColumnAction(b, { type: 'color', id: 'resolved', color: '#3f9b5b' });
    expect(boardColumns(b)[2]).toEqual({ id: 'resolved', title: 'Done', color: '#3f9b5b' });
    b = applyColumnAction(b, { type: 'color', id: 'resolved', color: undefined });
    expect(boardColumns(b)[2]).toEqual({ id: 'resolved', title: 'Done' });
  });

  it('reorders columns and clamps the target index', () => {
    let b = applyColumnAction(emptyBoard(), { type: 'move', id: 'resolved', index: 0 });
    expect(ids(b)).toEqual(['resolved', 'open', 'in_progress']);
    b = applyColumnAction(b, { type: 'move', id: 'resolved', index: 99 });
    expect(ids(b)).toEqual(['open', 'in_progress', 'resolved']);
  });

  it('does not delete Open or Resolved', () => {
    const b = emptyBoard();
    expect(applyColumnAction(b, { type: 'remove', id: 'open' })).toBe(b);
    expect(applyColumnAction(b, { type: 'remove', id: 'resolved' })).toBe(b);
  });

  it('moves cards of a deleted column to the bottom of Open, keeping their order', () => {
    let b = mergeThreads(emptyBoard(), [
      t('a', { updatedAt: '2026-01-01' }),
      t('b', { updatedAt: '2026-01-02' }),
      t('c', { updatedAt: '2026-01-03' }),
    ]);
    b = moveCard(b, 'a', 'in_progress', 0);
    b = moveCard(b, 'b', 'in_progress', 1);
    b = applyColumnAction(b, { type: 'remove', id: 'in_progress' });
    expect(ids(b)).toEqual(['open', 'resolved']);
    expect(b.order.in_progress).toBeUndefined();
    expect(b.entries.a.column).toBe('open');
    expect(columnCards(b, 'open').map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('lets cards move into a custom column and back', () => {
    let b = applyColumnAction(mergeThreads(emptyBoard(), [t('a')]), { type: 'add', title: 'Review' });
    const review = ids(b)[2];
    b = moveCard(b, 'a', review, 0);
    expect(columnCards(b, review).map((x) => x.id)).toEqual(['a']);
    expect(columnCards(b, 'open')).toEqual([]);
    b = moveCard(b, 'a', 'open', 0);
    expect(columnCards(b, 'open').map((x) => x.id)).toEqual(['a']);
  });

  it('shows cards whose column no longer exists in Open', () => {
    const b = mergeThreads(emptyBoard(), [t('a')]);
    b.entries.a = { column: 'col_gone' };
    expect(effectiveColumn(b, 'a')).toBe('open');
    expect(columnCards(b, 'open').map((x) => x.id)).toEqual(['a']);
  });

  it('puts working threads in Open when In progress was deleted', () => {
    const b = applyColumnAction(emptyBoard(), { type: 'remove', id: 'in_progress' });
    const merged = mergeThreads(b, [t('a', { state: 'working' })]);
    expect(merged.entries.a.column).toBe('open');
  });

  it('keeps native resolve sync with custom columns', () => {
    let b = applyColumnAction(mergeThreads(emptyBoard(), [t('a', { resolved: false })]), { type: 'add', title: 'Review' });
    b = moveCard(b, 'a', ids(b)[2], 0);
    b = mergeThreads(b, [t('a', { resolved: true })]);
    expect(b.entries.a.column).toBe('resolved');
  });

  it('restores Open and Resolved if a saved column list lacks them', () => {
    const b: ProjectBoard = { ...emptyBoard(), columns: [{ id: 'col_x', title: 'X' }] };
    expect(ids(b)).toEqual(['col_x', 'open', 'resolved']);
  });
});
