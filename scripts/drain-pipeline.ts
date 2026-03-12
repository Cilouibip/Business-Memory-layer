import { supabase } from '../src/lib/supabase';
import { chunkAndEmbed } from '../src/pipeline/embedding';
import { extractDocument } from '../src/pipeline/extraction';
import { triageDocument } from '../src/pipeline/triage';

type SourceType = 'youtube' | 'linkedin' | 'notion' | 'gdrive';

type RawDocRow = {
  id: string;
  source_type: SourceType;
  raw_payload: Record<string, unknown>;
  processing_status: string;
  business_category: 'contenu' | 'offre' | 'client' | 'strategie' | 'metrique' | 'process' | 'autre' | null;
  summary: string | null;
};

type CliOptions = {
  source: SourceType;
  limit?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { source: 'notion' };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--source') {
      const value = (argv[index + 1] ?? '').trim();
      index += 1;
      if (value === 'youtube' || value === 'linkedin' || value === 'notion' || value === 'gdrive') {
        options.source = value;
      }
      continue;
    }

    if (arg === '--limit') {
      const value = Number(argv[index + 1]);
      index += 1;
      if (!Number.isNaN(value) && value > 0) {
        options.limit = value;
      }
    }
  }

  return options;
}

async function hasChunk(entityType: 'content_item' | 'offer' | 'entity', entityId: string): Promise<boolean> {
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

async function embedCanonicalByRawDocumentId(rawDocumentId: string): Promise<void> {
  const { data: contentItem, error: contentError } = await (supabase as any)
    .from('content_items')
    .select('id,title,summary')
    .eq('raw_document_id', rawDocumentId)
    .limit(1)
    .single();

  if (contentError && contentError.code !== 'PGRST116') {
    throw new Error(contentError.message);
  }

  if (contentItem?.id) {
    const already = await hasChunk('content_item', contentItem.id);
    if (!already) {
      const text = `${contentItem.title ?? ''} ${contentItem.summary ?? ''}`.trim();
      if (text) {
        await chunkAndEmbed('content_item', contentItem.id, text);
      }
    }
  }

  const { data: offer, error: offerError } = await (supabase as any)
    .from('offers')
    .select('id,name,description')
    .eq('raw_document_id', rawDocumentId)
    .limit(1)
    .single();

  if (offerError && offerError.code !== 'PGRST116') {
    throw new Error(offerError.message);
  }

  if (offer?.id) {
    const already = await hasChunk('offer', offer.id);
    if (!already) {
      const text = `${offer.name ?? ''} ${offer.description ?? ''}`.trim();
      if (text) {
        await chunkAndEmbed('offer', offer.id, text);
      }
    }
  }

  const { data: entity, error: entityError } = await (supabase as any)
    .from('entities')
    .select('id,name,attributes')
    .eq('raw_document_id', rawDocumentId)
    .limit(1)
    .single();

  if (entityError && entityError.code !== 'PGRST116') {
    throw new Error(entityError.message);
  }

  if (entity?.id) {
    const already = await hasChunk('entity', entity.id);
    if (!already) {
      const text = `${entity.name ?? ''} ${JSON.stringify(entity.attributes ?? {})}`.trim();
      if (text && text !== '{}') {
        await chunkAndEmbed('entity', entity.id, text);
      }
    }
  }
}

async function fetchPendingDocs(source: SourceType, limit?: number): Promise<RawDocRow[]> {
  const query = (supabase as any)
    .from('raw_documents')
    .select('id,source_type,raw_payload,processing_status,business_category,summary')
    .eq('source_type', source)
    .in('processing_status', ['ingested', 'triaged'])
    .order('ingested_at', { ascending: true });

  if (limit) {
    query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RawDocRow[];
}

async function fetchRawDocState(id: string): Promise<RawDocRow> {
  const { data, error } = await (supabase as any)
    .from('raw_documents')
    .select('id,source_type,raw_payload,processing_status,business_category,summary')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? `Failed to load raw document ${id}`);
  }

  return data as RawDocRow;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const docs = await fetchPendingDocs(options.source, options.limit);

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`[drain] Found ${docs.length} pending docs for source=${options.source}`);

  for (const doc of docs) {
    const title = String(doc.raw_payload.title ?? 'Untitled');
    try {
      let triagedState: RawDocRow | null = null;
      if (doc.processing_status === 'ingested') {
        const triage = await triageDocument({
          id: doc.id,
          source_type: doc.source_type,
          raw_payload: doc.raw_payload,
        });

        const afterTriage = await fetchRawDocState(doc.id);
        if (afterTriage.processing_status === 'skipped') {
          skipped += 1;
          console.log(`[drain] Processing doc ${doc.id} "${title}" -> skipped (${triage.relevance_score.toFixed(2)})`);
          continue;
        }

        if (afterTriage.processing_status !== 'triaged' || !afterTriage.business_category || !afterTriage.summary) {
          failed += 1;
          console.log(`[drain] Processing doc ${doc.id} "${title}" -> failed (triage output invalid)`);
          continue;
        }

        triagedState = afterTriage;
      } else if (doc.processing_status === 'triaged') {
        if (!doc.business_category || !doc.summary) {
          failed += 1;
          console.log(`[drain] Processing doc ${doc.id} "${title}" -> failed (triaged doc missing category/summary)`);
          continue;
        }

        triagedState = doc;
      } else {
        skipped += 1;
        console.log(`[drain] Processing doc ${doc.id} "${title}" -> skipped (status=${doc.processing_status})`);
        continue;
      }

      await extractDocument(
        {
          id: doc.id,
          source_type: doc.source_type,
          raw_payload: doc.raw_payload,
        },
        {
          business_category: triagedState.business_category!,
          summary: triagedState.summary!,
        },
      );

      const afterExtraction = await fetchRawDocState(doc.id);
      if (afterExtraction.processing_status !== 'canonicalized') {
        failed += 1;
        console.log(`[drain] Processing doc ${doc.id} "${title}" -> failed (status=${afterExtraction.processing_status})`);
        continue;
      }

      await embedCanonicalByRawDocumentId(doc.id);
      completed += 1;
      console.log(`[drain] Processing doc ${doc.id} "${title}" -> canonicalized`);
    } catch (error) {
      failed += 1;
      console.log(`[drain] Processing doc ${doc.id} "${title}" -> failed (${error instanceof Error ? error.message : 'unknown'})`);
    }
  }

  console.log(
    JSON.stringify(
      {
        total: docs.length,
        processed: docs.length,
        completed,
        failed,
        skipped,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[drain:pipeline] failed', error instanceof Error ? error.message : error);
  process.exit(1);
});
