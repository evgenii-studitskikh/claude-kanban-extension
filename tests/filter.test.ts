import { describe, expect, it } from 'vitest';
import { emptyFilter, fullDropIndex, isFilterActive, matchesFilter, normalizeState } from '../src/shared/filter';
import type { Thread } from '../src/shared/types';

const t = (extra: Partial<Thread> = {}): Thread => ({ id: 'cmsg_a', title: 'Fix Safari export', source: 'api', ...extra });

describe('board filter', () => {
  it('matches everything when empty', () => {
    expect(isFilterActive(emptyFilter())).toBe(false);
    expect(matchesFilter(t(), emptyFilter())).toBe(true);
  });

  it('matches every query word in title, snippet or last message, case-insensitively', () => {
    const thread = t({ snippet: 'The button does nothing', lastMessage: 'PR opened' });
    const f = (query: string) => ({ ...emptyFilter(), query });
    expect(matchesFilter(thread, f('safari'))).toBe(true);
    expect(matchesFilter(thread, f('  BUTTON  export '))).toBe(true);
    expect(matchesFilter(thread, f('pr opened'))).toBe(true);
    expect(matchesFilter(thread, f('safari chrome'))).toBe(false);
    expect(isFilterActive(f('  '))).toBe(false);
  });

  it('filters by native status', () => {
    const f = { query: '', states: new Set(['needs_input', 'failed']) };
    expect(matchesFilter(t({ state: 'needs_input' }), f)).toBe(true);
    expect(matchesFilter(t({ state: 'Needs input' }), f)).toBe(true);
    expect(matchesFilter(t({ state: 'working' }), f)).toBe(false);
    expect(matchesFilter(t(), f)).toBe(false);
    expect(isFilterActive(f)).toBe(true);
  });

  it('normalises status strings', () => {
    expect(normalizeState(' Needs-Input ')).toBe('needs_input');
    expect(normalizeState(undefined)).toBe('');
  });
});

describe('fullDropIndex', () => {
  const full = ['a', 'b', 'c', 'd', 'e'];
  it('inserts before the visible card under the pointer', () => {
    expect(fullDropIndex(full, ['b', 'd'], 1, 'x')).toBe(3);
    expect(fullDropIndex(full, ['b', 'd'], 0, 'x')).toBe(1);
  });
  it('inserts after the last visible card when dropped at the end', () => {
    expect(fullDropIndex(full, ['b', 'd'], 2, 'x')).toBe(4);
  });
  it('appends when nothing is visible', () => {
    expect(fullDropIndex(full, [], 0, 'x')).toBe(5);
  });
  it('ignores the dragged card itself', () => {
    expect(fullDropIndex(full, ['a', 'c', 'e'], 1, 'a')).toBe(3); // before 'e' in [b,c,d,e]
    expect(fullDropIndex(full, ['a', 'c', 'e'], 0, 'a')).toBe(1);
  });
  it('is the identity when nothing is filtered', () => {
    expect(fullDropIndex(full, full, 2, 'x')).toBe(2);
  });
});
