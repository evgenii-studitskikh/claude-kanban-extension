import { describe, expect, it } from 'vitest';
import { lastMessageKey, mergeThreads, setLastMessage, threadsNeedingLastMessage } from '../src/shared/board-state';
import { THREAD_MESSAGES_URL_RE, threadMessagesUrl } from '../src/shared/claude-endpoints';
import { parseLastMessage } from '../src/shared/extract';
import { emptyBoard, type Thread } from '../src/shared/types';

describe('parseLastMessage', () => {
  it('picks the newest message by timestamp', () => {
    const json = {
      root: { id: 'cmsg_ROOT', body: 'First message', created_at: '2026-11-20T10:00:00Z' },
      data: [
        { id: 'cmsg_R1', body: 'Older reply', created_at: '2026-11-21T10:00:00Z' },
        { id: 'cmsg_R2', body: 'Newest   reply\n\nwith lines', created_at: '2026-11-22T10:00:00Z' },
      ],
    };
    expect(parseLastMessage(json, 'cmsg_ROOT')).toBe('Newest reply with lines');
  });

  it('prefers a reply over the root when there are no timestamps', () => {
    const json = { data: [{ id: 'cmsg_ROOT', body: 'Root' }, { id: 'cmsg_R1', text: 'Reply' }] };
    expect(parseLastMessage(json, 'cmsg_ROOT')).toBe('Reply');
  });

  it('reads content blocks and falls back to the root message', () => {
    const json = { id: 'cmsg_ROOT', content: [{ type: 'text', text: 'Only' }, { type: 'text', text: 'root' }] };
    expect(parseLastMessage(json, 'cmsg_ROOT')).toBe('Only root');
  });

  it('returns null when nothing looks like a message', () => {
    expect(parseLastMessage({ data: [{ id: 'x', body: 'no id' }, { id: 'cmsg_A' }] }, 'cmsg_A')).toBeNull();
    expect(parseLastMessage(null, 'cmsg_A')).toBeNull();
  });

  it('truncates long text', () => {
    const json = { id: 'cmsg_A', body: 'x'.repeat(1000) };
    expect(parseLastMessage(json, 'cmsg_A')).toHaveLength(280);
  });
});

describe('thread messages URL', () => {
  it('builds and matches the endpoint', () => {
    const url = threadMessagesUrl('chan_P1', 'cmsg_T1');
    expect(url).toBe('/v1/code/channels/chan_P1/threads/cmsg_T1?limit=1');
    const m = THREAD_MESSAGES_URL_RE.exec(`https://claude.ai${url}`);
    expect(m?.slice(1)).toEqual(['chan_P1', 'cmsg_T1']);
    expect(THREAD_MESSAGES_URL_RE.test('https://claude.ai/v1/code/channels/chan_P1/threads?limit=100')).toBe(false);
  });
});

describe('last message cache', () => {
  const t = (id: string, updatedAt?: string, source: Thread['source'] = 'api'): Thread => ({
    id,
    title: id,
    updatedAt,
    source,
  });

  it('selects unfetched or changed API threads, newest first', () => {
    let board = mergeThreads(emptyBoard(), [
      t('cmsg_A', '2026-11-20T10:00:00Z'),
      t('cmsg_B', '2026-11-22T10:00:00Z'),
      t('cmsg_C', '2026-11-21T10:00:00Z'),
      t('cmsg_D', undefined, 'dom'),
    ]);
    expect(threadsNeedingLastMessage(board, 10).map((x) => x.id)).toEqual(['cmsg_B', 'cmsg_C', 'cmsg_A']);
    expect(threadsNeedingLastMessage(board, 1).map((x) => x.id)).toEqual(['cmsg_B']);

    board = setLastMessage(board, 'cmsg_B', 'Done', lastMessageKey(board.threads.cmsg_B));
    expect(threadsNeedingLastMessage(board, 10).map((x) => x.id)).toEqual(['cmsg_C', 'cmsg_A']);

    // New activity invalidates the cache, but the old text survives the merge until refetched.
    board = mergeThreads(board, [t('cmsg_B', '2026-11-23T10:00:00Z')]);
    expect(board.threads.cmsg_B.lastMessage).toBe('Done');
    expect(threadsNeedingLastMessage(board, 10).map((x) => x.id)[0]).toBe('cmsg_B');
  });

  it('returns the same board when nothing changed', () => {
    const board = setLastMessage(mergeThreads(emptyBoard(), [t('cmsg_A', 'k')]), 'cmsg_A', 'Hi', 'k');
    expect(setLastMessage(board, 'cmsg_A', 'Hi', 'k')).toBe(board);
    expect(setLastMessage(board, 'cmsg_missing', 'Hi', 'k')).toBe(board);
  });
});
