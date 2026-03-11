import { NextRequest, NextResponse } from 'next/server';
import { updateTask } from '@/lib/taskQueries';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const task = await updateTask(id, body);
    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update task' },
      { status: 500 },
    );
  }
}
