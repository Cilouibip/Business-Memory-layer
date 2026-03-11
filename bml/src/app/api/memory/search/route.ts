import { NextResponse } from 'next/server';
import { generateEmbedding } from '../../../../lib/openai';
import { MemorySearchInputSchema } from '../../../../schemas/api';
import { hybridSearch } from '../../../../lib/hybridSearch';

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = MemorySearchInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  if (!input.query.trim()) {
    return NextResponse.json({ error: 'Query must not be empty' }, { status: 400 });
  }

  try {
    const queryEmbedding = await generateEmbedding(input.query);
    const results = await hybridSearch({
      query: input.query,
      queryEmbedding,
      filters: input.filters,
      limit: input.limit,
    });

    return NextResponse.json({
      results: results.map((item) => ({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        chunk_text: item.chunk_text,
        score: item.score,
        metadata: item.metadata,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
