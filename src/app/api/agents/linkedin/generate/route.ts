import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const workspaceId = body.workspace_id || 'personal';
    const topic = body.topic || undefined;
    void topic;

    const { generateDraft } = await import('@/agents/linkedin/generateDraft');
    const draft = await generateDraft(workspaceId);

    return NextResponse.json({
      status: 'success',
      draft: {
        id: draft.id,
        content: draft.content,
        style: draft.style,
        status: draft.status,
        created_at: draft.created_at,
      },
    });
  } catch (error) {
    console.error('[linkedin-agent] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Draft generation failed' },
      { status: 500 },
    );
  }
}
