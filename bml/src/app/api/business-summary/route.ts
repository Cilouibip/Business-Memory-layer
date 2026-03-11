import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { BusinessSummaryQuerySchema } from '../../../schemas/api';

type ActiveFact = {
  id: string;
  domain: 'contenu' | 'offre' | 'client' | 'strategie' | 'metrique' | 'process';
  fact_type: string;
  fact_text: string;
  confidence_score: number;
  source_entity_type: string;
  source_entity_id: string;
  valid_from: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = BusinessSummaryQuerySchema.safeParse({
    domain: url.searchParams.get('domain') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params', details: parsed.error.flatten() }, { status: 400 });
  }

  let query = (supabase as any)
    .from('business_facts')
    .select('id,domain,fact_type,fact_text,confidence_score,source_entity_type,source_entity_id,valid_from')
    .is('valid_until', null);

  if (parsed.data.domain) {
    query = query.eq('domain', parsed.data.domain);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const facts = (data ?? []) as ActiveFact[];
  const domains: Record<string, { facts: ActiveFact[]; count: number }> = {};

  for (const fact of facts) {
    if (!domains[fact.domain]) {
      domains[fact.domain] = { facts: [], count: 0 };
    }

    domains[fact.domain].facts.push(fact);
    domains[fact.domain].count += 1;
  }

  return NextResponse.json({
    domains,
    total_active_facts: facts.length,
  });
}
