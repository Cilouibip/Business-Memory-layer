import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callClaude } from '../../../../lib/claude';
import { generateEmbedding } from '../../../../lib/openai';
import { hybridSearch } from '../../../../lib/hybridSearch';
import { supabase } from '../../../../lib/supabase';
import { ContextBuildInputSchema } from '../../../../schemas/api';

const ContextSummarySchema = z.object({
  context: z.string().min(1),
});

type ActiveFact = {
  id: string;
  domain: string;
  fact_type: string;
  fact_text: string;
  confidence_score: number;
  source_entity_type: string;
  source_entity_id: string;
};

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ContextBuildInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;

  try {
    const goalEmbedding = await generateEmbedding(input.goal);
    const searchResults = await hybridSearch({
      query: input.goal,
      queryEmbedding: goalEmbedding,
      limit: 20,
    });

    let facts: ActiveFact[] = [];

    if (input.include_facts) {
      let factsQuery = (supabase as any)
        .from('business_facts')
        .select('id,domain,fact_type,fact_text,confidence_score,source_entity_type,source_entity_id')
        .is('valid_until', null);

      if (input.include_domains && input.include_domains.length > 0) {
        factsQuery = factsQuery.in('domain', input.include_domains);
      }

      const { data: factsData, error: factsError } = await factsQuery;
      if (factsError) {
        throw new Error(factsError.message);
      }

      facts = (factsData ?? []) as ActiveFact[];
    }

    const chunkLines = input.include_chunks
      ? searchResults.map((row, index) => {
          return `[CHUNK ${index + 1}] (${row.entity_type}:${row.entity_id}, score=${row.score.toFixed(4)})\n${row.chunk_text}`;
        })
      : [];

    const factLines = facts.map((fact, index) => {
      return `[FACT ${index + 1}] (${fact.domain}/${fact.fact_type}, confidence=${fact.confidence_score})\n${fact.fact_text}`;
    });

    const assembled = [`GOAL: ${input.goal}`, '', 'MEMORY CHUNKS', ...chunkLines, '', 'ACTIVE FACTS', ...factLines]
      .join('\n')
      .trim();

    let context = assembled;
    let tokenCount = estimateTokenCount(context);

    if (tokenCount > input.max_tokens) {
      const summary = await callClaude({
        model: 'sonnet',
        prompt: [
          'Tu es un assistant qui résume un contexte business pour un fondateur.',
          `Objectif utilisateur: ${input.goal}`,
          `Limite de tokens: ${input.max_tokens}`,
          'Résume le contexte ci-dessous sans perdre les faits critiques ni les nuances de décision.',
          'Réponds UNIQUEMENT en JSON valide: {"context":"..."}',
          '',
          assembled,
        ].join('\n'),
        zodSchema: ContextSummarySchema,
        maxRetries: 2,
      });

      context = summary.context;
      tokenCount = estimateTokenCount(context);
    }

    const sources = [
      ...searchResults.map((row) => ({
        source_type: 'chunk',
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        score: row.score,
      })),
      ...facts.map((fact) => ({
        source_type: 'fact',
        entity_type: fact.source_entity_type,
        entity_id: fact.source_entity_id,
        domain: fact.domain,
        fact_type: fact.fact_type,
      })),
    ];

    return NextResponse.json({
      context,
      token_count: tokenCount,
      sources,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
