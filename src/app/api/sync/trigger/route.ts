import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sources = body.sources || ['notion', 'youtube', 'linkedin'];

    const { runPipeline } = await import('@/pipeline/orchestrator');

    const results: Record<string, string> = {};

    for (const source of sources) {
      try {
        await runPipeline({
          sources: [source],
          skipSync: false,
        });
        results[source] = 'ok';
      } catch (error) {
        results[source] = error instanceof Error ? error.message : 'error';
      }
    }

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
