import { describe, expect, it } from 'vitest';
import { columnCards, mergeThreads, moveCard } from '../src/shared/board-state';
import { emptyBoard, type Thread } from '../src/shared/types';

const t = (id: string, extra: Partial<Thread> = {}): Thread => ({ id, title: id, source: 'api', ...extra });

describe('board state', () => {
  it('places new threads by native status', () => {
    const b = mergeThreads(emptyBoard(), [t('a'), t('b', { resolved: true }), t('c', { state: 'working' })]);
    expect(b.entries.a.column).toBe('open');
    expect(b.entries.b.column).toBe('resolved');
    expect(b.entries.c.column).toBe('in_progress');
  });

  it('keeps local columns, but native resolve/reopen wins', () => {
    let b = mergeThreads(emptyBoard(), [t('a', { resolved: false })]);
    b = moveCard(b, 'a', 'in_progress', 0);
    b = mergeThreads(b, [t('a', { resolved: false })]);
    expect(b.entries.a.column).toBe('in_progress');
    b = mergeThreads(b, [t('a', { resolved: true })]);
    expect(b.entries.a.column).toBe('resolved');
    b = mergeThreads(b, [t('a', { resolved: false })]);
    expect(b.entries.a.column).toBe('open');
  });

  it('keeps a local-only resolve when native status never was resolved', () => {
    let b = mergeThreads(emptyBoard(), [t('a', { resolved: false })]);
    b = moveCard(b, 'a', 'resolved', 0);
    b = mergeThreads(b, [t('a', { resolved: false })]);
    expect(b.entries.a.column).toBe('resolved');
  });

  it('orders cards manually, new ones on top by date', () => {
    let b = mergeThreads(emptyBoard(), [
      t('a', { updatedAt: '2026-01-01' }),
      t('b', { updatedAt: '2026-01-02' }),
      t('c', { updatedAt: '2026-01-03' }),
    ]);
    expect(columnCards(b, 'open').map((x) => x.id)).toEqual(['c', 'b', 'a']);
    b = moveCard(b, 'a', 'open', 0);
    expect(columnCards(b, 'open').map((x) => x.id)).toEqual(['a', 'c', 'b']);
    b = mergeThreads(b, [t('d', { updatedAt: '2026-01-04' })]);
    expect(columnCards(b, 'open').map((x) => x.id)).toEqual(['d', 'a', 'c', 'b']);
  });

  it('does not let DOM data overwrite API data', () => {
    let b = mergeThreads(emptyBoard(), [t('a', { title: 'Real', snippet: 's' })]);
    b = mergeThreads(b, [{ id: 'a', title: 'Real\nextra', source: 'dom' }]);
    expect(b.threads.a).toMatchObject({ title: 'Real', snippet: 's', source: 'api' });
  });
});

describe('pruneMissing', () => {
  it('drops threads not in the list', async () => {
    const { pruneMissing } = await import('../src/shared/board-state');
    let b = mergeThreads(emptyBoard(), [t('a'), t('b')]);
    b = moveCard(b, 'b', 'open', 0);
    b = pruneMissing(b, new Set(['a']));
    expect(Object.keys(b.threads)).toEqual(['a']);
    expect(b.order.open).toEqual(['a']);
  });
});
