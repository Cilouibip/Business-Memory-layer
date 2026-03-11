import { Client } from '@notionhq/client';
import { supabase } from '../lib/supabase';
import { notionBlocksToText } from '../lib/notionBlocksToText';

type ConnectorResult = {
  success: boolean;
  syncRunId: string | null;
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  error?: string;
};

type NotionPage = {
  id: string;
  url?: string;
  properties?: Record<string, unknown>;
  last_edited_time?: string;
};

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getOrCreateSourceConnectionId(): Promise<string> {
  const { data: existing, error: existingError } = await (supabase as any)
    .from('source_connections')
    .select('id')
    .eq('source_type', 'notion')
    .limit(1)
    .single();

  if (existingError && existingError.code !== 'PGRST116') {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: createError } = await (supabase as any)
    .from('source_connections')
    .insert({ source_type: 'notion', credentials_ref: 'env', is_active: true })
    .select('id')
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message ?? 'Failed to create source connection for notion');
  }

  return created.id;
}

async function getLastCursor(sourceConnectionId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('sync_runs')
    .select('cursor')
    .eq('source_connection_id', sourceConnectionId)
    .not('cursor', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message);
  }

  return data?.cursor ?? null;
}

function extractTitle(page: NotionPage): string {
  const properties = page.properties ?? {};

  for (const value of Object.values(properties)) {
    const typed = value as { type?: string; title?: Array<{ plain_text?: string }> };
    if (typed.type === 'title' && typed.title && typed.title.length > 0) {
      return typed.title.map((item) => item.plain_text ?? '').join('').trim();
    }
  }

  return 'Untitled';
}

export async function syncNotion(): Promise<ConnectorResult> {
  const startedAt = Date.now();
  let syncRunId: string | null = null;
  let itemsProcessed = 0;
  let itemsSkipped = 0;
  let itemsFailed = 0;
  let nextCursor: string | null = null;
  const errorLog: Array<Record<string, unknown>> = [];

  try {
    const notionToken = process.env.NOTION_TOKEN;
    if (!notionToken) {
      throw new Error('Missing env var: NOTION_TOKEN');
    }

    const notion = new Client({ auth: notionToken });
    const sourceConnectionId = await getOrCreateSourceConnectionId();

    const { data: createdSyncRun, error: createSyncRunError } = await (supabase as any)
      .from('sync_runs')
      .insert({
        source_connection_id: sourceConnectionId,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createSyncRunError || !createdSyncRun?.id) {
      throw new Error(createSyncRunError?.message ?? 'Failed to create sync run');
    }

    syncRunId = createdSyncRun.id;
    const lastCursor = await getLastCursor(sourceConnectionId);

    await wait(350);
    const searchResponse = await notion.search({
      filter: { property: 'object', value: 'page' },
      sort: { timestamp: 'last_edited_time', direction: 'descending' },
      page_size: 100,
    });

    const pages = searchResponse.results as unknown as NotionPage[];

    for (const page of pages) {
      const editedAt = page.last_edited_time ?? null;
      if (!editedAt) {
        itemsSkipped += 1;
        continue;
      }

      if (lastCursor && editedAt <= lastCursor) {
        itemsSkipped += 1;
        continue;
      }

      try {
        await wait(350);
        const blockResponse = await notion.blocks.children.list({ block_id: page.id, page_size: 100 });
        const content = await notionBlocksToText(notion, blockResponse.results as any);

        const rawPayload = {
          pageId: page.id,
          title: extractTitle(page),
          url: page.url ?? '',
          lastEditedTime: editedAt,
          properties: page.properties ?? {},
          content,
        };

        const { error: upsertError } = await (supabase as any)
          .from('raw_documents')
          .upsert(
            {
              source_type: 'notion',
              source_object_id: `notion:page:${page.id}`,
              sync_run_id: syncRunId,
              raw_payload: rawPayload,
              processing_status: 'ingested',
            },
            { onConflict: 'source_type,source_object_id' },
          );

        if (upsertError) {
          throw new Error(upsertError.message);
        }

        itemsProcessed += 1;
        if (!nextCursor || editedAt > nextCursor) {
          nextCursor = editedAt;
        }
      } catch (error) {
        itemsFailed += 1;
        errorLog.push({ pageId: page.id, message: (error as Error).message });
      }
    }

    const status = itemsFailed > 0 && itemsProcessed === 0 ? 'failed' : 'ingested';
    const durationMs = Date.now() - startedAt;

    await (supabase as any)
      .from('sync_runs')
      .update({
        status,
        cursor: nextCursor,
        finished_at: new Date().toISOString(),
        items_processed: itemsProcessed,
        items_skipped: itemsSkipped,
        items_failed: itemsFailed,
        duration_ms: durationMs,
        error_log: errorLog,
      })
      .eq('id', syncRunId);

    console.log(
      JSON.stringify({
        source: 'notion',
        run_id: syncRunId,
        duration_ms: durationMs,
        items_processed: itemsProcessed,
        items_skipped: itemsSkipped,
        items_failed: itemsFailed,
      }),
    );

    return {
      success: status !== 'failed',
      syncRunId,
      items_processed: itemsProcessed,
      items_skipped: itemsSkipped,
      items_failed: itemsFailed,
    };
  } catch (error) {
    if (syncRunId) {
      await (supabase as any)
        .from('sync_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          items_processed: itemsProcessed,
          items_skipped: itemsSkipped,
          items_failed: itemsFailed + 1,
          duration_ms: Date.now() - startedAt,
          error_log: [...errorLog, { message: (error as Error).message }],
        })
        .eq('id', syncRunId);
    }

    return {
      success: false,
      syncRunId,
      items_processed: itemsProcessed,
      items_skipped: itemsSkipped,
      items_failed: itemsFailed + 1,
      error: (error as Error).message,
    };
  }
}
