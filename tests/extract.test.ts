import { describe, expect, it } from 'vitest';
import {
  classifyMutation,
  extractThreads,
  fillTemplate,
  flipTemplate,
  makeTemplate,
} from '../src/shared/extract';

describe('extractThreads', () => {
  it('finds thread-like objects anywhere in JSON and ignores messages', () => {
    const json = {
      data: {
        threads: [
          {
            id: 'cmsg_A1',
            title: 'Fix Safari export',
            last_activity_at: '2026-11-20T10:00:00Z',
            state: 'working',
            resolved: false,
            channel_id: 'chan_P1',
            last_message: { text: 'Pushed a fix' },
          },
          { ts: 'cmsg_B2', name: 'Write docs', resolved_at: '2026-11-21T10:00:00Z' },
        ],
        messages: [{ id: 'cmsg_C3', text: 'hello' }],
      },
    };
    const threads = extractThreads(json);
    expect(threads.map((t) => t.id).sort()).toEqual(['cmsg_A1', 'cmsg_B2']);
    const a = threads.find((t) => t.id === 'cmsg_A1')!;
    expect(a).toMatchObject({
      title: 'Fix Safari export',
      state: 'working',
      resolved: false,
      projectId: 'chan_P1',
      snippet: 'Pushed a fix',
    });
    expect(threads.find((t) => t.id === 'cmsg_B2')!.resolved).toBe(true);
  });

  it('reads content-block snippets and unix timestamps', () => {
    const [t] = extractThreads([
      { id: 'cmsg_X', title: 'T', updated_at: 1_700_000_000, preview: [{ type: 'text', text: 'hi there' }] },
    ]);
    expect(t.snippet).toBe('hi there');
    expect(t.updatedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });
});

describe('resolve learning', () => {
  it('classifies resolve/unresolve requests', () => {
    expect(classifyMutation('https://claude.ai/api/x/threads/cmsg_1/resolve', undefined)).toEqual({
      kind: 'resolve',
      threadId: 'cmsg_1',
    });
    expect(classifyMutation('https://claude.ai/api/x/threads/cmsg_1', '{"resolved":false}')?.kind).toBe('unresolve');
    expect(classifyMutation('https://claude.ai/api/x/threads/cmsg_1', '{"title":"x"}')).toBeNull();
  });

  it('templates ids and flips the body', () => {
    const tpl = makeTemplate(
      'PATCH',
      'https://claude.ai/api/p/chan_P/threads/cmsg_1',
      '{"thread":"cmsg_1","resolved":true}',
      {},
      'cmsg_1',
      'chan_P',
    );
    expect(tpl.url).toBe('https://claude.ai/api/p/{{projectId}}/threads/{{threadId}}');
    expect(fillTemplate(tpl.url, 'cmsg_9', 'chan_Q')).toBe('https://claude.ai/api/p/chan_Q/threads/cmsg_9');
    expect(flipTemplate(tpl)!.body).toBe('{"thread":"{{threadId}}","resolved":false}');
  });
});

describe('parseThreadSections (real claude.ai shape)', () => {
  it('reads threads from sections', () => {
    const json = {
      items: [],
      rows_by_id: [],
      truncated: false,
      sections: [
        { status: 'needs_input', count: '0', data: [] },
        {
          status: 'working',
          count: '1',
          data: [
            {
              id: 'cmsg_W1',
              body: 'Spec of the extension\nmore text',
              bound_sessions: [{ id: 'cse_1', status: 'active', status_bucket: 'working', title: 'Build Kanban board' }],
              channel_id: 'chan_P',
              created_at: '2026-11-24T10:36:22Z',
              last_reply_at: '2026-11-24T12:03:11Z',
              thread_status: 'working',
            },
          ],
        },
        { status: 'resolved', count: '1', data: [{ id: 'cmsg_R1', body: 'Old task', bound_sessions: [] }] },
        { status: 'archived', count: '1', data: [{ id: 'cmsg_A1', body: 'Gone', bound_sessions: [] }] },
      ],
    };
    const threads = extractThreads(json);
    expect(threads.map((t) => t.id)).toEqual(['cmsg_W1', 'cmsg_R1']);
    expect(threads[0]).toMatchObject({
      title: 'Build Kanban board',
      state: 'working',
      resolved: false,
      projectId: 'chan_P',
      updatedAt: '2026-11-24T12:03:11.000Z',
      snippet: 'Spec of the extension more text',
    });
    expect(threads[1]).toMatchObject({ title: 'Old task', resolved: true, state: 'resolved' });
  });
});
