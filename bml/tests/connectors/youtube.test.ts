import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncYouTube } from '../../src/connectors/youtube';
import { google } from 'googleapis';

type SupabaseState = {
  sourceConnections: Array<Record<string, unknown>>;
  syncRuns: Array<Record<string, unknown>>;
  rawDocuments: Map<string, Record<string, unknown>>;
};

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
  },
}));

vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase }));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    youtube: vi.fn(),
  },
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

function mockYouTubeApi(options?: { throwOnVideoId?: string }) {
  const videos = {
    'video-1': {
      snippet: {
        title: 'Titre 1',
        description: 'Desc 1',
        publishedAt: '2026-03-01T10:00:00Z',
        tags: ['storytelling'],
      },
      statistics: { viewCount: '1200', likeCount: '45' },
      contentDetails: { duration: 'PT12M30S' },
    },
    'video-2': {
      snippet: {
        title: 'Titre 2',
        description: 'Desc 2',
        publishedAt: '2026-03-02T10:00:00Z',
        tags: ['youtube'],
      },
      statistics: { viewCount: '800', likeCount: '20' },
      contentDetails: { duration: 'PT10M00S' },
    },
  };

  (google.youtube as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    search: {
      list: vi.fn().mockResolvedValue({
        data: {
          items: [{ id: { videoId: 'video-1' } }, { id: { videoId: 'video-2' } }],
        },
      }),
    },
    videos: {
      list: vi.fn().mockImplementation(({ id }: { id: string[] }) => {
        if (options?.throwOnVideoId === id[0]) {
          throw new Error('YouTube API failed');
        }
        return Promise.resolve({ data: { items: [videos[id[0] as 'video-1' | 'video-2']] } });
      }),
    },
    captions: {
      list: vi.fn().mockResolvedValue({ data: { items: [{ id: 'caption-1' }] } }),
      download: vi.fn().mockResolvedValue({ data: 'transcript text' }),
    },
  });
}

describe('syncYouTube', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YOUTUBE_CLIENT_ID = 'client-id';
    process.env.YOUTUBE_CLIENT_SECRET = 'client-secret';
    process.env.YOUTUBE_REFRESH_TOKEN = 'refresh-token';
    process.env.YOUTUBE_CHANNEL_ID = 'channel-id';
  });

  it('sync avec 2 vidéos crée 2 raw_documents et 1 sync_run', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockYouTubeApi();

    const result = await syncYouTube();

    expect(result.success).toBe(true);
    expect(result.items_processed).toBe(2);
    expect(state.rawDocuments.size).toBe(2);
    expect(state.syncRuns).toHaveLength(1);
  });

  it('relancer la même sync ne crée pas de doublons', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockYouTubeApi();

    await syncYouTube();
    await syncYouTube();

    expect(state.rawDocuments.size).toBe(2);
  });

  it('une erreur API est loggée dans sync_runs.error_log', async () => {
    const state = createSupabaseState();
    wireSupabaseMock(state);
    mockYouTubeApi({ throwOnVideoId: 'video-1' });

    const result = await syncYouTube();

    expect(result.items_failed).toBeGreaterThan(0);
    expect(state.syncRuns[0].error_log).toBeDefined();
    expect(Array.isArray(state.syncRuns[0].error_log)).toBe(true);
    expect((state.syncRuns[0].error_log as unknown[]).length).toBeGreaterThan(0);
  });
});
