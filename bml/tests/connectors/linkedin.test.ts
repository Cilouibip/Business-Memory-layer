import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncLinkedIn } from '../../src/connectors/linkedin';

type SupabaseState = {
  sourceConnections: Array<Record<string, unknown>>;
  syncRuns: Array<Record<string, unknown>>;
  rawDocuments: Map<string, Record<string, unknown>>;
};

const { mockSupabase, mockUnipile } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
  mockUnipile: {
    users: {
      getAllPosts: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase }));
vi.mock('../../src/lib/unipile', () => ({ unipileClient: mockUnipile }));

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

function mockLinkedInPosts() {
  mockUnipile.users.getAllPosts.mockResolvedValue({
    items: [
      {
        social_id: 'urn:li:share:1',
        text: 'Post 1',
        parsed_datetime: '2026-03-01T10:00:00Z',
        visibility: 'PUBLIC',
        reaction_counter: 10,
        comment_counter: 2,
        repost_counter: 1,
        attachments: [],
      },
      {
        social_id: 'urn:li:share:2',
        text: 'Post 2',
        parsed_datetime: '2026-03-02T10:00:00Z',
        visibility: 'PUBLIC',
        reaction_counter: 20,
        comment_counter: 4,
        repost_counter: 2,
        attachments: [],
      },
    ],
  });
}

describe('syncLinkedIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UNIPILE_DSN = 'https://dsn.unipile.local';
    process.env.UNIPILE_ACCESS_TOKEN = 'access-token';
    process.env.UNIPILE_ACCOUNT_ID = 'account-id';
    process.env.UNIPILE_IDENTIFIER = 'me';
  });

  it('sync avec 2 posts crée 2 raw_documents et 1 sync_run', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockLinkedInPosts();

    const result = await syncLinkedIn();

    expect(result.success).toBe(true);
    expect(result.items_processed).toBe(2);
    expect(state.rawDocuments.size).toBe(2);
    expect(state.syncRuns).toHaveLength(1);
  });

  it('relancer la même sync ne crée pas de doublons', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockLinkedInPosts();

    await syncLinkedIn();
    await syncLinkedIn();

    expect(state.rawDocuments.size).toBe(2);
  });

  it('une erreur API est loggée dans sync_runs.error_log', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockUnipile.users.getAllPosts.mockRejectedValue(new Error('Unipile is down'));

    const result = await syncLinkedIn();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unipile is down');
    expect(state.syncRuns[0].error_log).toBeDefined();
    expect(Array.isArray(state.syncRuns[0].error_log)).toBe(true);
  });
});
