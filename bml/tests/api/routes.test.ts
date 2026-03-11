import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGenerateEmbedding, mockHybridSearch, mockSupabase } = vi.hoisted(() => ({
  mockGenerateEmbedding: vi.fn(),
  mockHybridSearch: vi.fn(),
  mockSupabase: { from: vi.fn() },
}));

vi.mock('../../src/lib/openai', () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

vi.mock('../../src/lib/hybridSearch', () => ({
  hybridSearch: mockHybridSearch,
}));

vi.mock('../../src/lib/supabase', () => ({
  supabase: mockSupabase,
}));

type SourceConnectionRow = { id: string; source_type: 'youtube' | 'linkedin' | 'notion' };
type SyncRunRow = {
  source_connection_id: string;
  started_at: string;
  status: string;
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  duration_ms: number;
  cursor: string | null;
};

type State = {
  businessFacts: Array<Record<string, unknown>>;
  sourceConnections: SourceConnectionRow[];
  syncRuns: SyncRunRow[];
};

function createState(): State {
  return {
    businessFacts: [
      {
        id: 'fact-1',
        domain: 'offre',
        fact_type: 'offer_pricing',
        fact_text: 'Prix moyen 3000 EUR',
        confidence_score: 0.9,
        source_entity_type: 'offer',
        source_entity_id: 'offer-1',
        valid_from: '2026-03-10T10:00:00Z',
        valid_until: null,
      },
      {
        id: 'fact-2',
        domain: 'contenu',
        fact_type: 'content_theme',
        fact_text: 'Le storytelling performe',
        confidence_score: 0.8,
        source_entity_type: 'content_item',
        source_entity_id: 'content-1',
        valid_from: '2026-03-10T11:00:00Z',
        valid_until: null,
      },
    ],
    sourceConnections: [
      { id: 'sc-youtube', source_type: 'youtube' },
      { id: 'sc-linkedin', source_type: 'linkedin' },
      { id: 'sc-notion', source_type: 'notion' },
    ],
    syncRuns: [
      {
        source_connection_id: 'sc-youtube',
        started_at: '2026-03-10T12:00:00Z',
        status: 'ingested',
        items_processed: 3,
        items_skipped: 1,
        items_failed: 0,
        duration_ms: 1200,
        cursor: '2026-03-10T12:00:00Z',
      },
      {
        source_connection_id: 'sc-linkedin',
        started_at: '2026-03-10T12:05:00Z',
        status: 'ingested',
        items_processed: 2,
        items_skipped: 0,
        items_failed: 0,
        duration_ms: 900,
        cursor: '1773140000000',
      },
      {
        source_connection_id: 'sc-notion',
        started_at: '2026-03-10T12:10:00Z',
        status: 'ingested',
        items_processed: 4,
        items_skipped: 0,
        items_failed: 0,
        duration_ms: 1600,
        cursor: '2026-03-10T12:10:00Z',
      },
    ],
  };
}

function wireSupabaseMock(state: State): void {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'business_facts') {
      const filters: Record<string, unknown> = {};

      const builder = {
        select: vi.fn(() => builder),
        is: vi.fn(() => builder),
        eq: vi.fn((field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        }),
        then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) => {
          let rows = state.businessFacts.filter((fact) => fact.valid_until === null);

          if (filters.domain) {
            rows = rows.filter((fact) => fact.domain === filters.domain);
          }

          resolve({ data: rows, error: null });
        },
      };

      return builder;
    }

    if (table === 'source_connections') {
      const filters: Record<string, unknown> = {};

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        }),
        limit: vi.fn(() => builder),
        single: vi.fn(async () => {
          const row = state.sourceConnections.find((item) => item.source_type === filters.source_type);
          if (!row) {
            return { data: null, error: { code: 'PGRST116', message: 'Not found' } };
          }

          return { data: row, error: null };
        }),
      };

      return builder;
    }

    if (table === 'sync_runs') {
      const filters: Record<string, unknown> = {};

      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(async () => {
          const rows = state.syncRuns.filter((item) => item.source_connection_id === filters.source_connection_id);
          const row = rows[0];

          if (!row) {
            return { data: null, error: { code: 'PGRST116', message: 'Not found' } };
          }

          return { data: row, error: null };
        }),
      };

      return builder;
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe('API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/memory/search avec query valide retourne 200', async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockHybridSearch.mockResolvedValue([
      {
        entity_type: 'content_item',
        entity_id: 'content-1',
        chunk_text: 'Le chunk',
        score: 0.88,
        metadata: { chunk_index: 0 },
      },
    ]);

    const { POST } = await import('../../src/app/api/memory/search/route');

    const response = await POST(
      new Request('http://localhost/api/memory/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'storytelling', limit: 5 }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.results).toHaveLength(1);
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('POST /api/memory/search sans query retourne 400', async () => {
    const { POST } = await import('../../src/app/api/memory/search/route');

    const response = await POST(
      new Request('http://localhost/api/memory/search', {
        method: 'POST',
        body: JSON.stringify({ query: '' }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('GET /api/business-summary retourne des faits groupés par domaine', async () => {
    const state = createState();
    wireSupabaseMock(state);

    const { GET } = await import('../../src/app/api/business-summary/route');
    const response = await GET(new Request('http://localhost/api/business-summary'));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.total_active_facts).toBe(2);
    expect(payload.domains.offre.count).toBe(1);
    expect(payload.domains.contenu.count).toBe(1);
  });

  it('GET /api/sync/status retourne un objet avec les sources', async () => {
    const state = createState();
    wireSupabaseMock(state);

    const { GET } = await import('../../src/app/api/sync/status/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.sources.youtube.status).toBe('ingested');
    expect(payload.sources.linkedin.items_processed).toBe(2);
    expect(payload.sources.notion.items_processed).toBe(4);
  });
});
