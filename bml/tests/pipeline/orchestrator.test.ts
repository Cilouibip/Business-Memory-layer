import { beforeEach, describe, expect, it, vi } from 'vitest';

type RawDocument = {
  id: string;
  source_type: 'youtube' | 'linkedin' | 'notion';
  raw_payload: Record<string, unknown>;
  processing_status: 'ingested' | 'triaged' | 'canonicalized' | 'skipped' | 'extraction_failed';
  business_category?: 'contenu' | 'offre' | 'client' | 'strategie' | 'metrique' | 'process' | 'autre' | null;
  summary?: string | null;
};

type State = {
  raw_documents: RawDocument[];
  content_items: Array<{ id: string; title?: string | null; summary?: string | null }>;
  offers: Array<{ id: string; name?: string | null; description?: string | null }>;
  entities: Array<{ id: string; name?: string | null; attributes?: Record<string, unknown> | null }>;
  memory_chunks: Array<{ id: string; entity_type: string; entity_id: string }>;
};

const { mockSyncYouTube, mockSyncLinkedIn, mockSyncNotion, mockTriageDocument, mockExtractDocument, mockChunkAndEmbed, mockSupabase } =
  vi.hoisted(() => ({
    mockSyncYouTube: vi.fn(),
    mockSyncLinkedIn: vi.fn(),
    mockSyncNotion: vi.fn(),
    mockTriageDocument: vi.fn(),
    mockExtractDocument: vi.fn(),
    mockChunkAndEmbed: vi.fn(),
    mockSupabase: { from: vi.fn() },
  }));

vi.mock('../../src/connectors/youtube', () => ({ syncYouTube: mockSyncYouTube }));
vi.mock('../../src/connectors/linkedin', () => ({ syncLinkedIn: mockSyncLinkedIn }));
vi.mock('../../src/connectors/notion', () => ({ syncNotion: mockSyncNotion }));
vi.mock('../../src/pipeline/triage', () => ({ triageDocument: mockTriageDocument }));
vi.mock('../../src/pipeline/extraction', () => ({ extractDocument: mockExtractDocument }));
vi.mock('../../src/pipeline/embedding', () => ({ chunkAndEmbed: mockChunkAndEmbed }));
vi.mock('../../src/lib/supabase', () => ({ supabase: mockSupabase }));

function createState(): State {
  return {
    raw_documents: [],
    content_items: [],
    offers: [],
    entities: [],
    memory_chunks: [],
  };
}

function wireSupabaseMock(state: State): void {
  mockSupabase.from.mockImplementation((table: keyof State) => {
    const filters: Record<string, unknown> = {};

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((field: string, value: unknown) => {
        filters[field] = value;
        return builder;
      }),
      limit: vi.fn((value: number) => {
        if (table === 'memory_chunks') {
          return builder;
        }

        let rows = [...(state[table] as Array<Record<string, unknown>>)];
        if (table === 'raw_documents' && filters.processing_status) {
          rows = rows.filter((row) => row.processing_status === filters.processing_status);
        }

        return Promise.resolve({ data: rows.slice(0, value), error: null });
      }),
      single: vi.fn(async () => {
        if (table !== 'memory_chunks') {
          return { data: null, error: { code: 'PGRST116' } };
        }

        const found = state.memory_chunks.find(
          (row) => row.entity_type === filters.entity_type && row.entity_id === filters.entity_id,
        );

        if (found) {
          return { data: { id: found.id }, error: null };
        }

        return { data: null, error: { code: 'PGRST116' } };
      }),
    };

    return builder;
  });
}

describe('runPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSyncYouTube.mockResolvedValue({ success: true, syncRunId: 'sync-youtube', items_processed: 1, items_skipped: 0, items_failed: 0 });
    mockSyncLinkedIn.mockResolvedValue({ success: true, syncRunId: 'sync-linkedin', items_processed: 0, items_skipped: 0, items_failed: 0 });
    mockSyncNotion.mockResolvedValue({ success: true, syncRunId: 'sync-notion', items_processed: 0, items_skipped: 0, items_failed: 0 });
  });

  it('pipeline complet avec mocks (sync -> triage -> extraction -> embedding)', async () => {
    const state = createState();
    state.raw_documents.push({
      id: 'raw-1',
      source_type: 'youtube',
      raw_payload: { title: 'Video 1' },
      processing_status: 'ingested',
    });

    wireSupabaseMock(state);

    mockTriageDocument.mockImplementation(async ({ id }: { id: string }) => {
      const doc = state.raw_documents.find((row) => row.id === id);
      if (doc) {
        doc.processing_status = 'triaged';
        doc.business_category = 'contenu';
        doc.summary = 'Résumé';
      }
      return { relevance_score: 0.9, business_category: 'contenu', summary: 'Résumé' };
    });

    mockExtractDocument.mockImplementation(async ({ id }: { id: string }) => {
      const doc = state.raw_documents.find((row) => row.id === id);
      if (doc) {
        doc.processing_status = 'canonicalized';
      }

      if (!state.content_items.some((item) => item.id === 'content-1')) {
        state.content_items.push({ id: 'content-1', title: 'Video 1', summary: 'Résumé' });
      }
    });

    mockChunkAndEmbed.mockImplementation(async (entityType: string, entityId: string) => {
      if (!state.memory_chunks.some((row) => row.entity_type === entityType && row.entity_id === entityId)) {
        state.memory_chunks.push({ id: `chunk-${entityType}-${entityId}`, entity_type: entityType, entity_id: entityId });
      }
    });

    const { runPipeline } = await import('../../src/pipeline/orchestrator');
    const result = await runPipeline({ sources: ['youtube', 'linkedin', 'notion'], limit: 10 });

    expect(mockSyncYouTube).toHaveBeenCalledTimes(1);
    expect(mockSyncLinkedIn).toHaveBeenCalledTimes(1);
    expect(mockSyncNotion).toHaveBeenCalledTimes(1);
    expect(result.triage.processed).toBe(1);
    expect(result.extraction.canonicalized).toBe(1);
    expect(result.embedding.embedded).toBe(1);
    expect(state.raw_documents[0].processing_status).toBe('canonicalized');
  });

  it('idempotence: relancer ne crée pas de doublons de chunks', async () => {
    const state = createState();
    state.content_items.push({ id: 'content-1', title: 'Title', summary: 'Summary' });

    wireSupabaseMock(state);

    mockTriageDocument.mockResolvedValue({ relevance_score: 0.9, business_category: 'contenu', summary: 'Résumé' });
    mockExtractDocument.mockResolvedValue(undefined);
    mockChunkAndEmbed.mockImplementation(async (entityType: string, entityId: string) => {
      if (!state.memory_chunks.some((row) => row.entity_type === entityType && row.entity_id === entityId)) {
        state.memory_chunks.push({ id: `chunk-${entityType}-${entityId}`, entity_type: entityType, entity_id: entityId });
      }
    });

    const { runPipeline } = await import('../../src/pipeline/orchestrator');
    await runPipeline({ skipSync: true, limit: 10 });
    const firstCount = state.memory_chunks.length;
    await runPipeline({ skipSync: true, limit: 10 });

    expect(state.memory_chunks.length).toBe(firstCount);
    expect(mockChunkAndEmbed).toHaveBeenCalledTimes(1);
  });

  it('skipSync=true n’appelle aucun connecteur', async () => {
    const state = createState();
    wireSupabaseMock(state);

    mockTriageDocument.mockResolvedValue({ relevance_score: 0.9, business_category: 'contenu', summary: 'Résumé' });
    mockExtractDocument.mockResolvedValue(undefined);
    mockChunkAndEmbed.mockResolvedValue(undefined);

    const { runPipeline } = await import('../../src/pipeline/orchestrator');
    await runPipeline({ skipSync: true, sources: ['youtube', 'linkedin', 'notion'], limit: 10 });

    expect(mockSyncYouTube).not.toHaveBeenCalled();
    expect(mockSyncLinkedIn).not.toHaveBeenCalled();
    expect(mockSyncNotion).not.toHaveBeenCalled();
  });
});
