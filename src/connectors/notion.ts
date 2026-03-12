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
  created_time?: string;
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
    .neq('status', 'running')
    .not('cursor', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message);
  }

  return data?.cursor ?? null;
}

async function createSyncRun(sourceConnectionId: string): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('sync_runs')
    .insert({
      source_connection_id: sourceConnectionId,
      source: 'notion',
      status: 'running',
      started_at: new Date().toISOString(),
      start_time: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Failed to create sync run');
  }

  return data.id;
}

async function finalizeSyncRun(params: {
  syncRunId: string;
  status: 'ingested' | 'failed';
  cursor: string | null;
  itemsProcessed: number;
  itemsSkipped: number;
  itemsFailed: number;
  startedAt: number;
  errorLog: Array<Record<string, unknown>>;
}): Promise<void> {
  const finishedAt = new Date().toISOString();
  const { error } = await (supabase as any)
    .from('sync_runs')
    .update({
      source: 'notion',
      status: params.status,
      cursor: params.cursor,
      finished_at: finishedAt,
      end_time: finishedAt,
      items_processed: params.itemsProcessed,
      items_skipped: params.itemsSkipped,
      items_failed: params.itemsFailed,
      duration_ms: Date.now() - params.startedAt,
      error_log: params.errorLog,
    })
    .eq('id', params.syncRunId);

  if (error) {
    throw new Error(error.message);
  }
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
  let status: 'ingested' | 'failed' = 'failed';
  let fatalErrorMessage: string | null = null;

  try {
    const notionToken = process.env.NOTION_TOKEN;
    if (!notionToken) {
      throw new Error('Missing env var: NOTION_TOKEN');
    }

    const notion = new Client({ auth: notionToken });
    const sourceConnectionId = await getOrCreateSourceConnectionId();
    syncRunId = await createSyncRun(sourceConnectionId);
    const lastCursor = await getLastCursor(sourceConnectionId);

    const pages: NotionPage[] = [];
    let startCursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      await wait(350);
      const searchResponse = await notion.search({
        filter: { property: 'object', value: 'page' },
        sort: { timestamp: 'last_edited_time', direction: 'descending' },
        page_size: 100,
        start_cursor: startCursor,
      });

      pages.push(...(searchResponse.results as unknown as NotionPage[]));
      hasMore = Boolean(searchResponse.has_more);
      startCursor = searchResponse.next_cursor ?? undefined;
    }

    console.log(`[notion-sync] Found ${pages.length} pages from Notion API`);

    let newOrUpdatedCount = 0;

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
        newOrUpdatedCount += 1;
        await wait(350);
        const blockResponse = await notion.blocks.children.list({ block_id: page.id, page_size: 100 });
        const content = await notionBlocksToText(notion, blockResponse.results as any);

        const rawPayload = {
          pageId: page.id,
          title: extractTitle(page),
          url: page.url ?? '',
          createdTime: page.created_time ?? null,
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

    console.log(`[notion-sync] New/updated: ${newOrUpdatedCount}, Skipped: ${itemsSkipped}`);
    status = itemsFailed > 0 && itemsProcessed === 0 ? 'failed' : 'ingested';

    console.log(
      JSON.stringify({
        source: 'notion',
        run_id: syncRunId,
        duration_ms: Date.now() - startedAt,
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
    status = 'failed';
    fatalErrorMessage = (error as Error).message;
    itemsFailed += 1;

    return {
      success: false,
      syncRunId,
      items_processed: itemsProcessed,
      items_skipped: itemsSkipped,
      items_failed: itemsFailed,
      error: fatalErrorMessage,
    };
  } finally {
    if (syncRunId) {
      const finalErrorLog =
        fatalErrorMessage === null ? errorLog : [...errorLog, { message: fatalErrorMessage }];
      try {
        await finalizeSyncRun({
          syncRunId,
          status,
          cursor: nextCursor,
          itemsProcessed,
          itemsSkipped,
          itemsFailed,
          startedAt,
          errorLog: finalErrorLog,
        });
      } catch (finalizeError) {
        console.error(`[notion-sync] Failed to finalize sync run ${syncRunId}:`, finalizeError);
      }
    }
  }
}
