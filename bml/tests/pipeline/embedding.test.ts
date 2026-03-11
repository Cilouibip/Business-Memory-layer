import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chunkText } from '../../src/lib/chunker';
import { chunkAndEmbed } from '../../src/pipeline/embedding';

type MemoryChunkRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  chunk_text: string;
  chunk_index: number;
  token_count: number;
  embedding: number[];
  content_hash: string;
};

type State = {
  memoryChunks: MemoryChunkRow[];
};

const { mockGenerateEmbedding, mockSupabase } = vi.hoisted(() => ({
  mockGenerateEmbedding: vi.fn(),
  mockSupabase: { from: vi.fn() },
}));

vi.mock('../../src/lib/openai', () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

vi.mock('../../src/lib/supabase', () => ({
  supabase: mockSupabase,
}));

function createState(): State {
  return { memoryChunks: [] };
}

function wireSupabaseMock(state: State): void {
  let idCounter = 0;

  mockSupabase.from.mockImplementation((table: string) => {
    if (table !== 'memory_chunks') {
      throw new Error(`Unexpected table: ${table}`);
    }

    const filters: Record<string, unknown> = {};
    let deleteMode = false;

    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((field: string, value: unknown) => {
        filters[field] = value;

        if (deleteMode && filters.entity_type && filters.entity_id) {
          state.memoryChunks = state.memoryChunks.filter(
            (row) => !(row.entity_type === filters.entity_type && row.entity_id === filters.entity_id),
          );

          return Promise.resolve({ error: null });
        }

        return builder;
      }),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(async () => {
        const row = state.memoryChunks.find((item) => {
          const sameEntityType = item.entity_type === filters.entity_type;
          const sameEntityId = item.entity_id === filters.entity_id;

          if (!sameEntityType || !sameEntityId) {
            return false;
          }

          if (filters.content_hash) {
            return item.content_hash === filters.content_hash;
          }

          return true;
        });

        if (row) {
          return { data: { id: row.id }, error: null };
        }

        return { data: null, error: { code: 'PGRST116' } };
      }),
      delete: vi.fn(() => {
        deleteMode = true;
        return builder;
      }),
      insert: vi.fn(async (payload: Omit<MemoryChunkRow, 'id'>) => {
        idCounter += 1;
        state.memoryChunks.push({ id: `memory_chunks-${idCounter}`, ...payload });
        return { error: null };
      }),
    };

    return builder;
  });
}

function buildLongText(): string {
  return Array.from({ length: 120 }, (_, index) => {
    return `Phrase ${index + 1}. Ceci est un texte long pour tester le chunking du pipeline embedding.`;
  }).join(' ');
}

describe('chunkAndEmbed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue(new Array<number>(1536).fill(0));
  });

  it('un texte long (>5000 chars) est découpé en plusieurs chunks', () => {
    const longText = buildLongText();
    const chunks = chunkText(longText);

    expect(longText.length).toBeGreaterThan(5000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.trim().length > 0)).toBe(true);
  });

  it('un texte court (<500 chars) produit un seul chunk', () => {
    const shortText = 'Texte court. Une seule phrase.';
    const chunks = chunkText(shortText);

    expect(shortText.length).toBeLessThan(500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(shortText);
  });

  it('chaque chunk insère un embedding avec chunk_index séquentiel et token_count', async () => {
    const state = createState();
    wireSupabaseMock(state);

    const longText = buildLongText();
    await chunkAndEmbed('content_item', 'content-1', longText);

    expect(state.memoryChunks.length).toBeGreaterThan(1);

    const indexes = state.memoryChunks.map((chunk) => chunk.chunk_index);
    expect(indexes).toEqual(Array.from({ length: state.memoryChunks.length }, (_, i) => i));

    for (const chunk of state.memoryChunks) {
      expect(chunk.embedding).toHaveLength(1536);
      expect(chunk.token_count).toBe(Math.ceil(chunk.chunk_text.length / 4));
      expect(chunk.token_count).toBeGreaterThan(0);
    }
  });

  it('relancer avec le même texte ne crée pas de doublons (hash identique)', async () => {
    const state = createState();
    wireSupabaseMock(state);

    const text = buildLongText();

    await chunkAndEmbed('entity', 'entity-1', text);
    const firstCount = state.memoryChunks.length;

    await chunkAndEmbed('entity', 'entity-1', text);
    const secondCount = state.memoryChunks.length;

    expect(firstCount).toBeGreaterThan(0);
    expect(secondCount).toBe(firstCount);
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(firstCount);
  });

  it('relancer avec un texte différent supprime les anciens chunks puis réinsère', async () => {
    const state = createState();
    wireSupabaseMock(state);

    const firstText = buildLongText();
    const secondText = 'Nouveau contenu totalement différent. Il doit remplacer les anciens chunks.';

    await chunkAndEmbed('offer', 'offer-1', firstText);
    const firstHash = crypto.createHash('sha256').update(firstText).digest('hex');
    const firstInsertCount = state.memoryChunks.length;

    await chunkAndEmbed('offer', 'offer-1', secondText);
    const secondHash = crypto.createHash('sha256').update(secondText).digest('hex');

    expect(firstInsertCount).toBeGreaterThan(0);
    expect(state.memoryChunks.length).toBeGreaterThan(0);
    expect(state.memoryChunks.every((chunk) => chunk.content_hash === secondHash)).toBe(true);
    expect(state.memoryChunks.some((chunk) => chunk.content_hash === firstHash)).toBe(false);
    expect(state.memoryChunks.map((chunk) => chunk.chunk_index)).toEqual(
      Array.from({ length: state.memoryChunks.length }, (_, i) => i),
    );
  });
});
