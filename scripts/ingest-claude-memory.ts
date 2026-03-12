import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const CLAUDE_MEMORY_SOURCE = 'claude_memory';
const CLAUDE_MEMORY_PREFIX = 'claude_memory_export_';

const sectionTitleMap: Record<string, string> = {
  identite: 'Identité Mehdi',
  parcours_professionnel: 'Parcours professionnel',
  business_actuel: 'Business actuel',
  content_strategy: 'Stratégie de contenu',
  projets_tech: 'Projets tech',
  philosophie_business: 'Philosophie business',
  collaborations: 'Collaborations',
};

const ClaudeMemoryExportSchema = z.object({
  source: z.string(),
  export_date: z.string(),
  description: z.string(),
  sections: z.object({
    identite: z.record(z.string(), z.unknown()),
    parcours_professionnel: z.record(z.string(), z.unknown()),
    business_actuel: z.record(z.string(), z.unknown()),
    content_strategy: z.record(z.string(), z.unknown()),
    projets_tech: z.record(z.string(), z.unknown()),
    philosophie_business: z.record(z.string(), z.unknown()),
    collaborations: z.record(z.string(), z.unknown()),
  }),
});

type ClaudeMemoryExport = z.infer<typeof ClaudeMemoryExportSchema>;

type UpsertedDoc = {
  id: string;
  source_type: string;
  source_object_id: string;
  raw_payload: Record<string, unknown>;
};

type SupabaseLike = {
  from: (table: string) => {
    upsert: (payload: unknown, options?: { onConflict?: string }) => {
      select: (columns: string) => { single: () => Promise<{ data: unknown; error: { message: string } | null }> };
    };
  };
};

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const normalizedValue = rawValue.replace(/^['\"]|['\"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = normalizedValue;
    }
  }
}

function toReadableValue(value: unknown, depth = 0): string {
  const indent = '  '.repeat(depth);

  if (value === null || value === undefined) {
    return `${indent}- (vide)`;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${indent}${String(value)}`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}- (liste vide)`;
    }

    return value
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          return `${indent}- ${String(item)}`;
        }

        const nested = toReadableObject(item as Record<string, unknown>, depth + 1);
        return `${indent}-\n${nested}`;
      })
      .join('\n');
  }

  return toReadableObject(value as Record<string, unknown>, depth);
}

function toReadableObject(objectValue: Record<string, unknown>, depth = 0): string {
  const indent = '  '.repeat(depth);
  const entries = Object.entries(objectValue);

  if (entries.length === 0) {
    return `${indent}(objet vide)`;
  }

  return entries
    .map(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

      if (value === null || value === undefined) {
        return `${indent}${label} : (vide)`;
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return `${indent}${label} : ${String(value)}`;
      }

      if (Array.isArray(value)) {
        const readableArray = toReadableValue(value, depth + 1);
        return `${indent}${label} :\n${readableArray}`;
      }

      const nested = toReadableObject(value as Record<string, unknown>, depth + 1);
      return `${indent}${label} :\n${nested}`;
    })
    .join('\n');
}

function buildSectionText(sectionKey: string, sectionData: Record<string, unknown>): string {
  const sectionTitle = sectionTitleMap[sectionKey] ?? sectionKey;
  const header = `Profil du fondateur — ${sectionTitle}`;
  const content = toReadableObject(sectionData);
  return `${header}\n${content}`;
}

function parseExportFile(filePath: string): ClaudeMemoryExport {
  const rawContent = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(rawContent) as unknown;
  return ClaudeMemoryExportSchema.parse(parsed);
}

async function upsertSectionDocuments(exportData: ClaudeMemoryExport, supabaseClient: SupabaseLike): Promise<UpsertedDoc[]> {
  const upsertedDocs: UpsertedDoc[] = [];

  for (const [sectionKey, sectionData] of Object.entries(exportData.sections)) {
    const sourceObjectId = `${CLAUDE_MEMORY_PREFIX}${sectionKey}`;
    const title = sectionTitleMap[sectionKey] ?? sectionKey;
    const contentText = buildSectionText(sectionKey, sectionData);

    const rawPayload = {
      source: exportData.source,
      export_date: exportData.export_date,
      section_key: sectionKey,
      title,
      doc_type: 'profile',
      workspace_id: 'personal',
      raw_payload_text: contentText,
      content_text: contentText,
      data: sectionData,
    };

    console.log(`[claude-memory] upsert ${sourceObjectId}`);

    const { data, error } = await (supabaseClient as any)
      .from('raw_documents')
      .upsert(
        {
          source_type: CLAUDE_MEMORY_SOURCE,
          source_object_id: sourceObjectId,
          raw_payload: rawPayload,
          processing_status: 'ingested',
        },
        { onConflict: 'source_type,source_object_id' },
      )
      .select('id,source_type,source_object_id,raw_payload')
      .single();

    if (error || !data) {
      throw new Error(`Failed to upsert ${sourceObjectId}: ${error?.message ?? 'unknown error'}`);
    }

    upsertedDocs.push(data as UpsertedDoc);
  }

  return upsertedDocs;
}

async function processInsertedDocuments(
  docs: UpsertedDoc[],
  triageDocumentFn: (doc: { id: string; source_type: string; raw_payload: Record<string, unknown> }) => Promise<{
    relevance_score: number;
    business_category: string;
    summary: string;
  }>,
  extractDocumentFn: (
    doc: { id: string; source_type: string; raw_payload: Record<string, unknown> },
    triage: {
      business_category: 'contenu' | 'offre' | 'client' | 'strategie' | 'metrique' | 'process' | 'autre';
      summary: string;
    },
  ) => Promise<unknown>,
): Promise<void> {
  console.log(`[claude-memory] triage start (${docs.length} documents)`);

  const triaged: Array<{
    id: string;
    source_type: string;
    raw_payload: Record<string, unknown>;
    business_category: string;
    summary: string;
  }> = [];

  for (const doc of docs) {
    try {
      const triage = await triageDocumentFn({
        id: doc.id,
        source_type: doc.source_type,
        raw_payload: doc.raw_payload,
      });

      if (triage.relevance_score > 0.5) {
        triaged.push({
          id: doc.id,
          source_type: doc.source_type,
          raw_payload: doc.raw_payload,
          business_category: triage.business_category,
          summary: triage.summary,
        });
      }
    } catch (error) {
      console.error(
        `[claude-memory] triage failed for ${doc.source_object_id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(`[claude-memory] extraction start (${triaged.length} documents triaged)`);

  for (const doc of triaged) {
    try {
      await extractDocumentFn(
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
    } catch (error) {
      console.error(
        `[claude-memory] extraction failed for ${doc.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const [{ supabase }, { triageDocument }, { extractDocument }] = await Promise.all([
    import('../src/lib/supabase'),
    import('../src/pipeline/triage'),
    import('../src/pipeline/extraction'),
  ]);

  const filePath = resolve(process.cwd(), 'data/claude_memory_export.json');
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log('[claude-memory] reading export file');
  const exportData = parseExportFile(filePath);

  console.log('[claude-memory] upserting raw_documents');
  const docs = await upsertSectionDocuments(exportData, supabase as unknown as SupabaseLike);

  console.log('[claude-memory] launching triage/extraction pipeline for claude_memory docs');
  await processInsertedDocuments(docs, triageDocument, extractDocument);

  console.log('[claude-memory] done');
}

main().catch((error) => {
  console.error('[claude-memory] ingestion failed', error instanceof Error ? error.message : error);
  process.exit(1);
});
