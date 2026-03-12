import { syncLinkedIn } from '../connectors/linkedin';
import { syncNotion } from '../connectors/notion';
import { syncGDrive } from '../connectors/gdrive';
import { syncYouTube } from '../connectors/youtube';
import { supabase } from '../lib/supabase';
import { chunkAndEmbed } from './embedding';
import { extractDocument } from './extraction';
import { triageDocument } from './triage';

type ConnectorResult = {
  success: boolean;
  syncRunId: string | null;
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  error?: string;
};

type RawDocumentRow = {
  id: string;
  source_type: 'youtube' | 'linkedin' | 'notion' | 'gdrive';
  raw_payload: Record<string, unknown>;
  business_category?: 'contenu' | 'offre' | 'client' | 'strategie' | 'metrique' | 'process' | 'autre' | null;
  summary?: string | null;
};

type ContentItemRow = { id: string; title?: string | null; summary?: string | null };
type OfferRow = { id: string; name?: string | null; description?: string | null };
type EntityRow = { id: string; name?: string | null; attributes?: Record<string, unknown> | null };

type PipelineSources = Array<'youtube' | 'linkedin' | 'notion' | 'gdrive'>;

export type PipelineResult = {
  sync: { youtube?: ConnectorResult; linkedin?: ConnectorResult; notion?: ConnectorResult; gdrive?: ConnectorResult };
  triage: { processed: number; triaged: number; skipped: number; failed: number };
  extraction: { processed: number; canonicalized: number; failed: number };
  embedding: { processed: number; embedded: number; failed: number };
  duration_ms: number;
};

async function fetchRawDocumentsByStatus(status: string, limit: number): Promise<RawDocumentRow[]> {
  const { data, error } = await (supabase as any)
    .from('raw_documents')
    .select('id,source_type,raw_payload,business_category,summary')
    .eq('processing_status', status)
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RawDocumentRow[];
}

async function hasChunks(entityType: string, entityId: string): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('memory_chunks')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function runSync(sources: PipelineSources): Promise<PipelineResult['sync']> {
  const syncResult: PipelineResult['sync'] = {};

  for (const source of sources) {
    if (source === 'youtube') {
      syncResult.youtube = await syncYouTube();
      continue;
    }

    if (source === 'linkedin') {
      syncResult.linkedin = await syncLinkedIn();
      continue;
    }

    if (source === 'gdrive') {
      syncResult.gdrive = await syncGDrive();
      continue;
    }

    syncResult.notion = await syncNotion();
  }

  return syncResult;
}

export async function runPipeline(options?: {
  sources?: Array<'youtube' | 'linkedin' | 'notion' | 'gdrive'>;
  skipSync?: boolean;
  limit?: number;
}): Promise<PipelineResult> {
  const startedAt = Date.now();
  const runId = `pipeline-${startedAt}`;
  const limit = options?.limit ?? 50;
  const sources = options?.sources ?? ['youtube'];

  const result: PipelineResult = {
    sync: {},
    triage: { processed: 0, triaged: 0, skipped: 0, failed: 0 },
    extraction: { processed: 0, canonicalized: 0, failed: 0 },
    embedding: { processed: 0, embedded: 0, failed: 0 },
    duration_ms: 0,
  };

  if (options?.skipSync !== true) {
    result.sync = await runSync(sources);
  }

  const triageDocs = await fetchRawDocumentsByStatus('ingested', limit);
  for (const rawDoc of triageDocs) {
    try {
      const triage = await triageDocument({
        id: rawDoc.id,
        source_type: rawDoc.source_type,
        raw_payload: rawDoc.raw_payload,
      });
      result.triage.processed += 1;
      if (triage.relevance_score > 0.5) {
        result.triage.triaged += 1;
      } else {
        result.triage.skipped += 1;
      }
    } catch {
      result.triage.failed += 1;
    }
  }

  const extractionDocs = await fetchRawDocumentsByStatus('triaged', limit);
  for (const rawDoc of extractionDocs) {
    if (!rawDoc.business_category || !rawDoc.summary) {
      result.extraction.failed += 1;
      continue;
    }

    try {
      await extractDocument(
        {
          id: rawDoc.id,
          source_type: rawDoc.source_type,
          raw_payload: rawDoc.raw_payload,
        },
        {
          business_category: rawDoc.business_category,
          summary: rawDoc.summary,
        },
      );
      result.extraction.processed += 1;
      result.extraction.canonicalized += 1;
    } catch {
      result.extraction.failed += 1;
    }
  }

  const { data: contentItems, error: contentItemsError } = await (supabase as any)
    .from('content_items')
    .select('id,title,summary')
    .limit(limit);

  if (contentItemsError) {
    throw new Error(contentItemsError.message);
  }

  for (const item of (contentItems ?? []) as ContentItemRow[]) {
    try {
      const alreadyEmbedded = await hasChunks('content_item', item.id);
      if (alreadyEmbedded) {
        continue;
      }

      const text = `${item.title ?? ''} ${item.summary ?? ''}`.trim();
      if (!text) {
        result.embedding.failed += 1;
        continue;
      }

      result.embedding.processed += 1;
      await chunkAndEmbed('content_item', item.id, text);
      result.embedding.embedded += 1;
    } catch {
      result.embedding.failed += 1;
    }
  }

  const { data: offers, error: offersError } = await (supabase as any)
    .from('offers')
    .select('id,name,description')
    .limit(limit);

  if (offersError) {
    throw new Error(offersError.message);
  }

  for (const offer of (offers ?? []) as OfferRow[]) {
    try {
      const alreadyEmbedded = await hasChunks('offer', offer.id);
      if (alreadyEmbedded) {
        continue;
      }

      const text = `${offer.name ?? ''} ${offer.description ?? ''}`.trim();
      if (!text) {
        result.embedding.failed += 1;
        continue;
      }

      result.embedding.processed += 1;
      await chunkAndEmbed('offer', offer.id, text);
      result.embedding.embedded += 1;
    } catch {
      result.embedding.failed += 1;
    }
  }

  const { data: entities, error: entitiesError } = await (supabase as any)
    .from('entities')
    .select('id,name,attributes')
    .limit(limit);

  if (entitiesError) {
    throw new Error(entitiesError.message);
  }

  for (const entity of (entities ?? []) as EntityRow[]) {
    try {
      const alreadyEmbedded = await hasChunks('entity', entity.id);
      if (alreadyEmbedded) {
        continue;
      }

      const text = `${entity.name ?? ''} ${JSON.stringify(entity.attributes ?? {})}`.trim();
      if (!text || text === '{}') {
        result.embedding.failed += 1;
        continue;
      }

      result.embedding.processed += 1;
      await chunkAndEmbed('entity', entity.id, text);
      result.embedding.embedded += 1;
    } catch {
      result.embedding.failed += 1;
    }
  }

  result.duration_ms = Date.now() - startedAt;

  const totalProcessed = result.triage.processed + result.extraction.processed + result.embedding.processed;
  const totalSkipped = result.triage.skipped;
  const totalFailed = result.triage.failed + result.extraction.failed + result.embedding.failed;

  console.log(
    JSON.stringify({
      source: 'pipeline',
      run_id: runId,
      duration_ms: result.duration_ms,
      items_processed: totalProcessed,
      items_skipped: totalSkipped,
      items_failed: totalFailed,
    }),
  );

  return result;
}
