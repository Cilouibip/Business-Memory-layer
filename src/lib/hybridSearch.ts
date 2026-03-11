import { supabase } from './supabase';
import type { MemorySearchInput } from '../schemas/api';

export type HybridSearchResult = {
  entity_type: string;
  entity_id: string;
  chunk_text: string;
  score: number;
  vector_score: number;
  text_score: number;
  metadata: Record<string, unknown>;
};

type MemoryChunkRow = {
  entity_type: string;
  entity_id: string;
  chunk_text: string;
  chunk_index: number;
  embedding: number[] | string | null;
  created_at: string;
  content_hash: string | null;
};

function toEmbeddingArray(value: number[] | string | null): number[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is number => typeof item === 'number');
    }
  } catch {
    return [];
  }

  return [];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôöùûüç\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function textScore(query: string, text: string): number {
  const queryTokens = tokenize(query);
  const textTokens = tokenize(text);

  if (queryTokens.length === 0 || textTokens.length === 0) {
    return 0;
  }

  const textTokenSet = new Set(textTokens);
  let matches = 0;

  for (const token of queryTokens) {
    if (textTokenSet.has(token)) {
      matches += 1;
    }
  }

  return matches / queryTokens.length;
}

export async function hybridSearch(options: {
  query: string;
  queryEmbedding: number[];
  filters?: MemorySearchInput['filters'];
  limit: number;
}): Promise<HybridSearchResult[]> {
  let chunkQuery = (supabase as any)
    .from('memory_chunks')
    .select('entity_type,entity_id,chunk_text,chunk_index,embedding,created_at,content_hash');

  if (options.filters?.entity_type) {
    chunkQuery = chunkQuery.eq('entity_type', options.filters.entity_type);
  }

  if (options.filters?.date_range?.from) {
    chunkQuery = chunkQuery.gte('created_at', options.filters.date_range.from);
  }

  if (options.filters?.date_range?.to) {
    chunkQuery = chunkQuery.lte('created_at', options.filters.date_range.to);
  }

  const { data: rows, error } = await chunkQuery;
  if (error) {
    throw new Error(error.message);
  }

  let candidateRows = (rows ?? []) as MemoryChunkRow[];

  if (options.filters?.domain) {
    const { data: factRows, error: factsError } = await (supabase as any)
      .from('business_facts')
      .select('source_entity_type,source_entity_id')
      .eq('domain', options.filters.domain)
      .is('valid_until', null);

    if (factsError) {
      throw new Error(factsError.message);
    }

    const allowed = new Set(
      ((factRows ?? []) as Array<{ source_entity_type: string; source_entity_id: string }>).map((row) => {
        return `${row.source_entity_type}:${row.source_entity_id}`;
      }),
    );

    candidateRows = candidateRows.filter((row) => allowed.has(`${row.entity_type}:${row.entity_id}`));
  }

  const scored = candidateRows.map((row) => {
    const chunkEmbedding = toEmbeddingArray(row.embedding);
    const vector = cosineSimilarity(options.queryEmbedding, chunkEmbedding);
    const lexical = textScore(options.query, row.chunk_text);
    const score = 0.7 * vector + 0.3 * lexical;

    return {
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      chunk_text: row.chunk_text,
      score,
      vector_score: vector,
      text_score: lexical,
      metadata: {
        chunk_index: row.chunk_index,
        created_at: row.created_at,
        content_hash: row.content_hash,
      },
    } satisfies HybridSearchResult;
  });

  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, options.limit);
}
