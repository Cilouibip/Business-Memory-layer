import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

type SourceStatus = {
  last_sync: string | null;
  status: string | null;
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  duration_ms: number | null;
  cursor: string | null;
};

async function getSourceStatus(sourceType: 'youtube' | 'linkedin' | 'notion'): Promise<SourceStatus> {
  const { data: sourceConnection, error: sourceError } = await (supabase as any)
    .from('source_connections')
    .select('id')
    .eq('source_type', sourceType)
    .limit(1)
    .single();

  if (sourceError && sourceError.code !== 'PGRST116') {
    throw new Error(sourceError.message);
  }

  if (!sourceConnection?.id) {
    return {
      last_sync: null,
      status: null,
      items_processed: 0,
      items_skipped: 0,
      items_failed: 0,
      duration_ms: null,
      cursor: null,
    };
  }

  const { data: syncRun, error: syncError } = await (supabase as any)
    .from('sync_runs')
    .select('started_at,status,items_processed,items_skipped,items_failed,duration_ms,cursor')
    .eq('source_connection_id', sourceConnection.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (syncError && syncError.code !== 'PGRST116') {
    throw new Error(syncError.message);
  }

  return {
    last_sync: syncRun?.started_at ?? null,
    status: syncRun?.status ?? null,
    items_processed: syncRun?.items_processed ?? 0,
    items_skipped: syncRun?.items_skipped ?? 0,
    items_failed: syncRun?.items_failed ?? 0,
    duration_ms: syncRun?.duration_ms ?? null,
    cursor: syncRun?.cursor ?? null,
  };
}

export async function GET() {
  try {
    const [youtube, linkedin, notion] = await Promise.all([
      getSourceStatus('youtube'),
      getSourceStatus('linkedin'),
      getSourceStatus('notion'),
    ]);

    return NextResponse.json({
      sources: {
        youtube,
        linkedin,
        notion,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
