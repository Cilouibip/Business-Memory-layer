import { supabase } from './supabase';
import { generateEmbedding } from './openai';
import { hybridSearch } from './hybridSearch';
import { callClaude } from './claude';
import { z } from 'zod';

export async function searchMemory(query: string, filters?: { entity_type?: string; domain?: string }, limit = 10) {
  if (!query.trim()) {
    throw new Error('Query must not be empty');
  }

  const queryEmbedding = await generateEmbedding(query);
  const results = await hybridSearch({
    query,
    queryEmbedding,
    filters,
    limit,
  });

  return results.map((item) => ({
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    chunk_text: item.chunk_text,
    score: item.score,
    metadata: item.metadata,
  }));
}

export async function getBusinessSummary(domain?: string) {
  let query = (supabase as any)
    .from('business_facts')
    .select('id,domain,fact_type,fact_text,confidence_score,source_entity_type,source_entity_id,valid_from')
    .is('valid_until', null);

  if (domain) {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const facts = (data ?? []) as any[];
  const domains: Record<string, { facts: any[]; count: number }> = {};
  
  for (const fact of facts) {
    if (!domains[fact.domain]) {
      domains[fact.domain] = { facts: [], count: 0 };
    }

    domains[fact.domain].facts.push(fact);
    domains[fact.domain].count += 1;
  }

  return {
    domains,
    total_active_facts: facts.length,
  };
}

export async function getEntity(type: string, id: string) {
  let table = '';
  switch (type) {
    case 'content_item':
      table = 'content_items';
      break;
    case 'offer':
      table = 'offers';
      break;
    case 'entity':
      table = 'entities';
      break;
    default:
      throw new Error('Invalid entity type');
  }

  const { data: entity, error: entityError } = await (supabase as any)
    .from(table)
    .select('*')
    .eq('id', id)
    .single();

  if (entityError) {
    if (entityError.code === 'PGRST116') {
      throw new Error('Entity not found');
    }
    throw new Error(entityError.message);
  }

  const { data: facts, error: factsError } = await (supabase as any)
    .from('business_facts')
    .select('id,domain,fact_type,fact_text,confidence_score,valid_from')
    .eq('source_entity_type', type)
    .eq('source_entity_id', id)
    .is('valid_until', null);

  if (factsError) {
    throw new Error(factsError.message);
  }

  const { data: outgoing, error: outgoingError } = await (supabase as any)
    .from('relationship_edges')
    .select('id,relation_type,from_entity_type,from_entity_id,to_entity_type,to_entity_id,confidence,metadata,created_at')
    .eq('from_entity_type', type)
    .eq('from_entity_id', id);

  if (outgoingError) {
    throw new Error(outgoingError.message);
  }

  const { data: incoming, error: incomingError } = await (supabase as any)
    .from('relationship_edges')
    .select('id,relation_type,from_entity_type,from_entity_id,to_entity_type,to_entity_id,confidence,metadata,created_at')
    .eq('to_entity_type', type)
    .eq('to_entity_id', id);

  if (incomingError) {
    throw new Error(incomingError.message);
  }

  return {
    entity,
    active_facts: facts ?? [],
    relationships: {
      outgoing: outgoing ?? [],
      incoming: incoming ?? [],
    },
  };
}

const ContextSummarySchema = z.object({
  context: z.string(),
});

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function buildContext(goal: string, options?: { include_domains?: string[]; max_tokens?: number }) {
  const maxTokens = options?.max_tokens ?? 4000;
  
  const searchResults = await searchMemory(goal, undefined, 5);

  const summary = await getBusinessSummary();
  let facts: any[] = [];
  
  const includeDomains = options?.include_domains;

  for (const [domainName, domainData] of Object.entries(summary.domains)) {
    if (includeDomains && !includeDomains.includes(domainName)) {
      continue;
    }
    facts = [...facts, ...domainData.facts];
  }

  facts.sort((a, b) => b.confidence_score - a.confidence_score);

  const chunkLines = searchResults.map((item, index) => {
    return `[CHUNK ${index + 1}] (score=${item.score.toFixed(2)})\n${item.chunk_text}`;
  });

  const factLines = facts.map((fact, index) => {
    return `[FACT ${index + 1}] (${fact.domain}/${fact.fact_type}, confidence=${fact.confidence_score})\n${fact.fact_text}`;
  });

  const assembled = [`GOAL: ${goal}`, '', 'MEMORY CHUNKS', ...chunkLines, '', 'ACTIVE FACTS', ...factLines]
    .join('\n')
    .trim();

  let context = assembled;
  let tokenCount = estimateTokenCount(context);

  if (tokenCount > maxTokens) {
    const aiSummary = await callClaude({
      model: 'sonnet',
      prompt: [
        'Tu es un assistant qui résume un contexte business pour un fondateur.',
        `Objectif utilisateur: ${goal}`,
        `Limite de tokens: ${maxTokens}`,
        'Résume le contexte ci-dessous sans perdre les faits critiques ni les nuances de décision.',
        'Réponds UNIQUEMENT en JSON valide: {"context":"..."}',
        '',
        assembled,
      ].join('\n'),
      zodSchema: ContextSummarySchema,
      maxRetries: 2,
    });

    context = aiSummary.context;
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

  return {
    context,
    token_count: tokenCount,
    sources,
  };
}