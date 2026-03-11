import { syncYouTube } from '../src/connectors/youtube';
import { triageDocument } from '../src/pipeline/triage';
import { extractDocument } from '../src/pipeline/extraction';
import { chunkAndEmbed } from '../src/pipeline/embedding';
import { supabase } from '../src/lib/supabase';

type RawDocumentRow = {
  id: string;
  source_type: string;
  raw_payload: Record<string, unknown>;
  business_category?: string | null;
  summary?: string | null;
};

type ContentItemRow = {
  id: string;
  summary?: string | null;
  topic?: string | null;
};

function logStepError(step: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${step}] failed: ${message}`);
}

async function countRows(table: string, filter?: { column: string; value: string }): Promise<number> {
  let query = (supabase as any).from(table).select('id', { count: 'exact', head: true });

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Count failed for ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function runE2EYouTube(): Promise<number> {
  console.log('=== E2E YOUTUBE PIPELINE ===');

  try {
    const syncResult = await syncYouTube();

    if (!syncResult.success) {
      throw new Error(syncResult.error ?? 'Unknown sync error');
    }

    console.log(`YouTube sync: ${syncResult.items_processed} documents ingested`);
  } catch (error) {
    logStepError('ÉTAPE 1 — Sync YouTube', error);
    return 1;
  }

  try {
    const { data, error } = await (supabase as any)
      .from('raw_documents')
      .select('id,source_type,raw_payload')
      .eq('processing_status', 'ingested')
      .eq('source_type', 'youtube')
      .limit(3);

    if (error) {
      throw new Error(error.message);
    }

    const docs = (data ?? []) as RawDocumentRow[];
    let processed = 0;
    let triaged = 0;
    let skipped = 0;

    for (const doc of docs) {
      const result = await triageDocument({
        id: doc.id,
        source_type: doc.source_type,
        raw_payload: doc.raw_payload,
      });

      processed += 1;
      if (result.relevance_score > 0.5) {
        triaged += 1;
      } else {
        skipped += 1;
      }
    }

    console.log(`Triage: ${processed} processed, ${triaged} triaged (score > 0.5), ${skipped} skipped`);
  } catch (error) {
    logStepError('ÉTAPE 2 — Triage', error);
    return 1;
  }

  try {
    const { data, error } = await (supabase as any)
      .from('raw_documents')
      .select('id,source_type,raw_payload,business_category,summary')
      .eq('processing_status', 'triaged')
      .eq('source_type', 'youtube')
      .limit(3);

    if (error) {
      throw new Error(error.message);
    }

    const docs = (data ?? []) as RawDocumentRow[];
    let processed = 0;

    for (const doc of docs) {
      if (!doc.business_category || !doc.summary) {
        console.warn(`[ÉTAPE 3 — Extraction] skipped doc ${doc.id}: missing business_category or summary`);
        continue;
      }

      await extractDocument(
        {
          id: doc.id,
          source_type: doc.source_type,
          raw_payload: doc.raw_payload,
        },
        {
          business_category: doc.business_category as
            | 'contenu'
            | 'offre'
            | 'client'
            | 'strategie'
            | 'metrique'
            | 'process'
            | 'autre',
          summary: doc.summary,
        },
      );

      processed += 1;
    }

    console.log(`Extraction: ${processed} documents processed`);
  } catch (error) {
    logStepError('ÉTAPE 3 — Extraction', error);
    return 1;
  }

  try {
    const { data, error } = await (supabase as any)
      .from('content_items')
      .select('id,summary,topic')
      .order('id', { ascending: false })
      .limit(3);

    if (error) {
      throw new Error(error.message);
    }

    const items = (data ?? []) as ContentItemRow[];
    let embedded = 0;

    for (const item of items) {
      const text = `${item.summary ?? ''} ${item.topic ?? ''}`.trim();
      if (!text) {
        console.warn(`[ÉTAPE 4 — Embedding] skipped content_item ${item.id}: empty summary/topic`);
        continue;
      }

      await chunkAndEmbed('content_item', item.id, text);
      embedded += 1;
    }

    console.log(`Embedding: ${embedded} content_items embedded`);
  } catch (error) {
    logStepError('ÉTAPE 4 — Embedding', error);
    return 1;
  }

  try {
    const rawDocumentsCount = await countRows('raw_documents', { column: 'source_type', value: 'youtube' });
    const contentItemsCount = await countRows('content_items');
    const businessFactsCount = await countRows('business_facts');
    const memoryChunksCount = await countRows('memory_chunks');

    console.log('=== E2E RESULTS ===');
    console.log(`raw_documents: ${rawDocumentsCount}`);
    console.log(`content_items: ${contentItemsCount}`);
    console.log(`business_facts: ${businessFactsCount}`);
    console.log(`memory_chunks: ${memoryChunksCount}`);

    if (contentItemsCount >= 1 && memoryChunksCount >= 1) {
      console.log('PIPELINE SUCCESS');
    } else {
      console.log('PIPELINE FAILED — vérifier les étapes ci-dessus');
    }
  } catch (error) {
    logStepError('ÉTAPE 5 — Vérification', error);
    return 1;
  }

  return 0;
}

runE2EYouTube()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    logStepError('E2E runtime', error);
    process.exit(1);
  });
