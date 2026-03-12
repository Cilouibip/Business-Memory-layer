import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const maxDuration = 900;
const VALID_SOURCES = ['notion', 'youtube', 'linkedin', 'gdrive'] as const;
type ValidSource = (typeof VALID_SOURCES)[number];

async function countPendingForSource(source: string): Promise<number> {
  const { count, error } = await (supabase as any)
    .from('raw_documents')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', source)
    .in('processing_status', ['ingested', 'triaged']);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sources = Array.isArray(body.sources)
      ? body.sources.filter((source: unknown): source is ValidSource => {
          return typeof source === 'string' && (VALID_SOURCES as readonly string[]).includes(source);
        })
      : [...VALID_SOURCES];
    const fullSync = body.fullSync === true;
    console.log(`[sync-trigger] Starting sync for sources: ${sources.join(', ')}`);

    const { runPipeline } = await import('@/pipeline/orchestrator');

    const results: Record<string, string> = {};

    if (fullSync) {
      for (const source of sources) {
        const { data: conn, error: connError } = await (supabase as any)
          .from('source_connections')
          .select('id')
          .eq('source_type', source)
          .single();

        if (connError || !conn?.id) {
          continue;
        }

        await (supabase as any)
          .from('sync_runs')
          .update({ cursor: null })
          .eq('source_connection_id', conn.id);
      }
    }

    for (const source of sources) {
      try {
        console.log(`[sync-trigger] Sync+pipeline start for source=${source}`);
        await runPipeline({
          sources: [source],
          skipSync: false,
          limit: 200,
        });

        let pending = await countPendingForSource(source);
        let drainIteration = 0;
        const maxDrainIterations = 10;

        while (pending > 0 && drainIteration < maxDrainIterations) {
          drainIteration += 1;
          console.log(
            `[sync-trigger] Drain pass ${drainIteration}/${maxDrainIterations} for source=${source}, pending=${pending}`,
          );
          await runPipeline({
            sources: [source],
            skipSync: true,
            limit: 200,
          });
          pending = await countPendingForSource(source);
        }

        if (pending > 0) {
          console.warn(`[sync-trigger] Source=${source} still has ${pending} pending docs after drain passes`);
        }

        results[source] = 'ok';
      } catch (error) {
        results[source] = error instanceof Error ? error.message : 'error';
      }
    }

    console.log('[sync-trigger] Sync completed:', results);

    return NextResponse.json({
      status: 'completed',
      results,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
