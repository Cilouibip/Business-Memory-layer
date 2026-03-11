import { google, youtube_v3 } from 'googleapis';
import { createGoogleOAuth2Client } from '../lib/googleAuth';
import { supabase } from '../lib/supabase';

type ConnectorResult = {
  success: boolean;
  syncRunId: string | null;
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  error?: string;
};

async function getOrCreateSourceConnectionId(): Promise<string> {
  const { data: existing, error: existingError } = await (supabase as any)
    .from('source_connections')
    .select('id')
    .eq('source_type', 'youtube')
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
    .insert({ source_type: 'youtube', credentials_ref: 'env', is_active: true })
    .select('id')
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message ?? 'Failed to create source connection for youtube');
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

function parseCount(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function fetchTranscript(
  youtubeClient: youtube_v3.Youtube,
  videoId: string,
): Promise<string | null> {
  try {
    const captionsResponse = await youtubeClient.captions.list({
      part: ['snippet'],
      videoId,
    });

    const captionId = captionsResponse.data.items?.[0]?.id;
    if (!captionId) {
      return null;
    }

    const downloadResponse = await (youtubeClient.captions as any).download({
      id: captionId,
      tfmt: 'srt',
    });

    if (typeof downloadResponse?.data === 'string') {
      return downloadResponse.data;
    }

    if (Buffer.isBuffer(downloadResponse?.data)) {
      return downloadResponse.data.toString('utf-8');
    }

    return null;
  } catch {
    return null;
  }
}

export async function syncYouTube(): Promise<ConnectorResult> {
  const startedAt = Date.now();
  let syncRunId: string | null = null;
  let itemsProcessed = 0;
  let itemsSkipped = 0;
  let itemsFailed = 0;
  let nextCursor: string | null = null;
  const errorLog: Array<Record<string, unknown>> = [];

  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    if (!channelId) {
      throw new Error('Missing env var: YOUTUBE_CHANNEL_ID');
    }

    const oauthClient = createGoogleOAuth2Client();
    const youtubeClient = google.youtube({ version: 'v3', auth: oauthClient });

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

    const searchResponse = await youtubeClient.search.list({
      part: ['id', 'snippet'],
      channelId,
      type: ['video'],
      maxResults: 50,
      order: 'date',
      publishedAfter: lastCursor ?? undefined,
    });

    const videoItems = searchResponse.data.items ?? [];

    for (const item of videoItems) {
      const videoId = item.id?.videoId;
      if (!videoId) {
        itemsSkipped += 1;
        continue;
      }

      try {
        const videoDetailsResponse = await youtubeClient.videos.list({
          part: ['snippet', 'statistics', 'contentDetails'],
          id: [videoId],
        });

        const video = videoDetailsResponse.data.items?.[0];
        if (!video?.snippet) {
          itemsSkipped += 1;
          continue;
        }

        const transcript = await fetchTranscript(youtubeClient, videoId);

        const rawPayload = {
          videoId,
          title: video.snippet.title ?? '',
          description: video.snippet.description ?? '',
          publishedAt: video.snippet.publishedAt ?? null,
          statistics: {
            viewCount: parseCount(video.statistics?.viewCount),
            likeCount: parseCount(video.statistics?.likeCount),
          },
          duration: video.contentDetails?.duration ?? null,
          tags: video.snippet.tags ?? [],
          transcript,
        };

        const { error: upsertError } = await (supabase as any)
          .from('raw_documents')
          .upsert(
            {
              source_type: 'youtube',
              source_object_id: `youtube:video:${videoId}`,
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

        const publishedAt = rawPayload.publishedAt;
        if (publishedAt && (!nextCursor || publishedAt > nextCursor)) {
          nextCursor = publishedAt;
        }
      } catch (error) {
        itemsFailed += 1;
        errorLog.push({ videoId, message: (error as Error).message });
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
        source: 'youtube',
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
