import { supabase } from '../lib/supabase';
import { unipileClient } from '../lib/unipile';

type ConnectorResult = {
  success: boolean;
  syncRunId: string | null;
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  error?: string;
};

type UnipilePost = {
  id?: string;
  social_id?: string;
  text?: string;
  parsed_datetime?: string;
  date?: string;
  visibility?: string;
  reaction_counter?: number;
  comment_counter?: number;
  repost_counter?: number;
  attachments?: unknown[];
};

async function getOrCreateSourceConnectionId(): Promise<string> {
  const { data: existing, error: existingError } = await (supabase as any)
    .from('source_connections')
    .select('id')
    .eq('source_type', 'linkedin')
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
    .insert({ source_type: 'linkedin', credentials_ref: 'env', is_active: true })
    .select('id')
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message ?? 'Failed to create source connection for linkedin');
  }

  return created.id;
}

async function getLastCursor(sourceConnectionId: string): Promise<number | null> {
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

  const value = Number(data?.cursor);
  return Number.isNaN(value) ? null : value;
}

function resolveCreatedAt(post: UnipilePost): number {
  if (post.parsed_datetime) {
    const parsed = Date.parse(post.parsed_datetime);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (post.date) {
    const parsed = Date.parse(post.date);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Date.now();
}

export async function syncLinkedIn(): Promise<ConnectorResult> {
  const startedAt = Date.now();
  let syncRunId: string | null = null;
  let itemsProcessed = 0;
  let itemsSkipped = 0;
  let itemsFailed = 0;
  let nextCursor: number | null = null;
  const errorLog: Array<Record<string, unknown>> = [];

  try {
    const accountId = process.env.UNIPILE_ACCOUNT_ID;
    const identifier = process.env.UNIPILE_IDENTIFIER;

    if (!accountId || !identifier) {
      throw new Error('Missing env vars: UNIPILE_ACCOUNT_ID, UNIPILE_IDENTIFIER');
    }

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

    const postsResponse = await (unipileClient as any).users.getAllPosts({
      account_id: accountId,
      identifier,
      limit: 100,
    });

    const posts: UnipilePost[] = postsResponse?.items ?? [];

    for (const post of posts) {
      try {
        const createdAt = resolveCreatedAt(post);
        if (lastCursor && createdAt <= lastCursor) {
          itemsSkipped += 1;
          continue;
        }

        const postUrn = post.social_id ?? post.id;
        if (!postUrn) {
          itemsSkipped += 1;
          continue;
        }

        const rawPayload = {
          postUrn,
          commentary: post.text ?? '',
          createdAt,
          visibility: post.visibility ?? 'PUBLIC',
          contentType: post.attachments && post.attachments.length > 0 ? 'media' : 'text',
          engagement: {
            likes: post.reaction_counter ?? 0,
            comments: post.comment_counter ?? 0,
            shares: post.repost_counter ?? 0,
          },
        };

        const { error: upsertError } = await (supabase as any)
          .from('raw_documents')
          .upsert(
            {
              source_type: 'linkedin',
              source_object_id: `linkedin:post:${postUrn}`,
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
        if (!nextCursor || createdAt > nextCursor) {
          nextCursor = createdAt;
        }
      } catch (error) {
        itemsFailed += 1;
        errorLog.push({ post: post.social_id ?? post.id ?? null, message: (error as Error).message });
      }
    }

    const status = itemsFailed > 0 && itemsProcessed === 0 ? 'failed' : 'ingested';
    const durationMs = Date.now() - startedAt;

    await (supabase as any)
      .from('sync_runs')
      .update({
        status,
        cursor: nextCursor ? String(nextCursor) : null,
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
        source: 'linkedin',
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
