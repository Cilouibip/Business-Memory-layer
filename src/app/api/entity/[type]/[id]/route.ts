import { NextResponse } from 'next/server';
import { supabase } from '../../../../../lib/supabase';

type RouteParams = { params: Promise<{ type: string; id: string }> };

const SUPPORTED_TYPES = new Set(['content_item', 'offer', 'entity']);

export async function GET(_: Request, context: RouteParams) {
  const { type, id } = await context.params;

  if (!SUPPORTED_TYPES.has(type)) {
    return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
  }

  const table = type === 'content_item' ? 'content_items' : type === 'offer' ? 'offers' : 'entities';

  const { data: entity, error: entityError } = await (supabase as any).from(table).select('*').eq('id', id).single();

  if (entityError) {
    if (entityError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    return NextResponse.json({ error: entityError.message }, { status: 500 });
  }

  const { data: facts, error: factsError } = await (supabase as any)
    .from('business_facts')
    .select('id,domain,fact_type,fact_text,confidence_score,valid_from')
    .eq('source_entity_type', type)
    .eq('source_entity_id', id)
    .is('valid_until', null);

  if (factsError) {
    return NextResponse.json({ error: factsError.message }, { status: 500 });
  }

  const { data: outgoing, error: outgoingError } = await (supabase as any)
    .from('relationship_edges')
    .select('id,relation_type,from_entity_type,from_entity_id,to_entity_type,to_entity_id,confidence,metadata,created_at')
    .eq('from_entity_type', type)
    .eq('from_entity_id', id);

  if (outgoingError) {
    return NextResponse.json({ error: outgoingError.message }, { status: 500 });
  }

  const { data: incoming, error: incomingError } = await (supabase as any)
    .from('relationship_edges')
    .select('id,relation_type,from_entity_type,from_entity_id,to_entity_type,to_entity_id,confidence,metadata,created_at')
    .eq('to_entity_type', type)
    .eq('to_entity_id', id);

  if (incomingError) {
    return NextResponse.json({ error: incomingError.message }, { status: 500 });
  }

  return NextResponse.json({
    entity,
    active_facts: facts ?? [],
    relationships: {
      outgoing: outgoing ?? [],
      incoming: incoming ?? [],
    },
  });
}
