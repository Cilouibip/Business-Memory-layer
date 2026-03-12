import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { completeTaskByTitle } from '@/lib/taskQueries';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await (supabase as any)
    .from('linkedin_drafts')
    .update({
      status: body.status,
      ...(body.status === 'approved' ? { published_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.status === 'approved') {
    try {
      await completeTaskByTitle('Valider draft LinkedIn');
    } catch (e) {
      console.error('[hook] Failed to complete draft validation task:', e);
    }
  }

  return NextResponse.json(data);
}
