import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncNotion } from '../../src/connectors/notion';
import { notionBlocksToText } from '../../src/lib/notionBlocksToText';

type SupabaseState = {
  sourceConnections: Array<Record<string, unknown>>;
  syncRuns: Array<Record<string, unknown>>;
  rawDocuments: Map<string, Record<string, unknown>>;
};

const { mockSupabase, mockNotionInstance } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
  mockNotionInstance: {
    search: vi.fn(),
    blocks: {
      children: {
        list: vi.fn(),
      },
    },
  },
}));

vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase }));
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => mockNotionInstance),
}));

function createSupabaseState(): SupabaseState {
  return {
    sourceConnections: [],
    syncRuns: [],
    rawDocuments: new Map(),
  };
}

function wireSupabaseMock(state: SupabaseState) {
  let idCounter = 0;

  mockSupabase.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    let notNullField: string | null = null;
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;

    const api = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((field: string, value: unknown) => {
        filters[field] = value;
        if (pendingUpdate && table === 'sync_runs' && field === 'id') {
          const idx = state.syncRuns.findIndex((row) => row.id === value);
          if (idx >= 0) {
            state.syncRuns[idx] = { ...state.syncRuns[idx], ...pendingUpdate };
          }
          return Promise.resolve({ error: null });
        }
        return api;
      }),
      not: vi.fn((field: string) => {
        notNullField = field;
        return api;
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(async () => {
        if (pendingInsert) {
          const row = { ...pendingInsert };
          if (!row.id) {
            idCounter += 1;
            row.id = `${table}-${idCounter}`;
          }

          if (table === 'source_connections') {
            state.sourceConnections.push(row);
          }

          if (table === 'sync_runs') {
            state.syncRuns.push(row);
          }

          return { data: row, error: null };
        }

        if (table === 'source_connections') {
          const found = state.sourceConnections.find((row) => row.source_type === filters.source_type);
          return found ? { data: found, error: null } : { data: null, error: { code: 'PGRST116' } };
        }

        if (table === 'sync_runs') {
          const matches = state.syncRuns
            .filter((row) => row.source_connection_id === filters.source_connection_id)
            .filter((row) => !notNullField || row[notNullField] !== null && row[notNullField] !== undefined)
            .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')));
          return matches[0] ? { data: matches[0], error: null } : { data: null, error: { code: 'PGRST116' } };
        }

        return { data: null, error: { code: 'PGRST116' } };
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        pendingInsert = payload;
        return api;
      }),
      upsert: vi.fn(async (payload: Record<string, unknown>) => {
        const key = `${payload.source_type}:${payload.source_object_id}`;
        state.rawDocuments.set(key, payload);
        return { error: null };
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        pendingUpdate = payload;
        return api;
      }),
    };

    return api;
  });
}

function mockNotionPages() {
  mockNotionInstance.search.mockResolvedValue({
    results: [
      {
        id: 'page-1',
        url: 'https://notion.so/page-1',
        last_edited_time: '2026-03-10T10:00:00Z',
        properties: {
          title: {
            type: 'title',
            title: [{ plain_text: 'Titre Notion 1' }],
          },
        },
      },
      {
        id: 'page-2',
        url: 'https://notion.so/page-2',
        last_edited_time: '2026-03-09T10:00:00Z',
        properties: {
          title: {
            type: 'title',
            title: [{ plain_text: 'Titre Notion 2' }],
          },
        },
      },
    ],
  });

  mockNotionInstance.blocks.children.list.mockResolvedValue({
    results: [{ id: 'block-1', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Texte' }] } }],
  });
}

describe('syncNotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOTION_TOKEN = 'notion-token';
    vi.spyOn(global, 'setTimeout').mockImplementation((handler: TimerHandler) => {
      if (typeof handler === 'function') handler();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
  });

  it('sync avec 2 pages crée 2 raw_documents et 1 sync_run', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockNotionPages();

    const result = await syncNotion();

    expect(result.success).toBe(true);
    expect(result.items_processed).toBe(2);
    expect(state.rawDocuments.size).toBe(2);
    expect(state.syncRuns).toHaveLength(1);
  });

  it('relancer la même sync ne crée pas de doublons', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockNotionPages();

    await syncNotion();
    await syncNotion();

    expect(state.rawDocuments.size).toBe(2);
  });

  it('une erreur API est loggée dans sync_runs.error_log', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockNotionInstance.search.mockRejectedValue(new Error('Notion API failed'));

    const result = await syncNotion();

    expect(result.success).toBe(false);
    expect(state.syncRuns[0].error_log).toBeDefined();
    expect(Array.isArray(state.syncRuns[0].error_log)).toBe(true);
  });

  it('convertit les blocs Notion en texte', async () => {
    const notion = {
      blocks: {
        children: {
          list: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'child-1',
                type: 'paragraph',
                paragraph: { rich_text: [{ plain_text: 'Contenu enfant' }] },
              },
            ],
          }),
        },
      },
    } as any;

    const text = await notionBlocksToText(notion, [
      {
        id: 'block-1',
        type: 'heading_1',
        has_children: true,
        heading_1: { rich_text: [{ plain_text: 'Titre' }] },
      },
    ] as any);

    expect(text).toContain('Titre');
    expect(text).toContain('Contenu enfant');
  });
});
