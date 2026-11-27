import { describe, expect, it } from 'vitest';
import { countNeedsInput, needsInput } from '../src/shared/filter';
import type { Thread } from '../src/shared/types';

const t = (extra: Partial<Thread> = {}): Thread => ({ id: 'cmsg_a', title: 'Thread', source: 'api', ...extra });

describe('needs input', () => {
  it('flags threads whose native status waits on the user', () => {
    expect(needsInput(t({ state: 'needs_input' }))).toBe(true);
    expect(needsInput(t({ state: 'Needs input' }))).toBe(true);
    expect(needsInput(t({ state: 'blocked' }))).toBe(true);
  });

  it('ignores other statuses, unknown status and resolved threads', () => {
    expect(needsInput(t({ state: 'working' }))).toBe(false);
    expect(needsInput(t({ state: 'idle' }))).toBe(false);
    expect(needsInput(t())).toBe(false);
    expect(needsInput(t({ state: 'needs_input', resolved: true }))).toBe(false);
  });

  it('counts waiting threads', () => {
    const threads = [
      t({ state: 'needs_input' }),
      t({ state: 'working' }),
      t({ state: 'blocked' }),
      t({ state: 'needs_input', resolved: true }),
    ];
    expect(countNeedsInput(threads)).toBe(2);
    expect(countNeedsInput([])).toBe(0);
  });
});
