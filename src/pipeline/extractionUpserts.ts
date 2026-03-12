import { supabase } from '../lib/supabase';
import { resolveSourcePublishDate } from '../lib/sourceDateResolver';
import { ContentExtraction, GenericExtraction, OfferExtraction } from '../schemas/extraction';

export type CanonicalEntity = {
  sourceEntityType: 'content_item' | 'offer' | 'entity';
  sourceEntityId: string;
};

function normalizeOptionalIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : trimmed;
}


export async function upsertContentItem(
  rawDocId: string,
  payload: ContentExtraction['content_item'],
): Promise<CanonicalEntity> {
  const publishDate = normalizeOptionalIsoDate(payload.publish_date);

  const { data, error } = await (supabase as any)
    .from('content_items')
    .upsert(
      {
        raw_document_id: rawDocId,
        title: payload.title,
        platform: payload.platform,
        url: payload.url ?? null,
        publish_date: publishDate,
        topic: payload.topic ?? null,
        summary: payload.summary,
        tags: payload.tags,
      },
      { onConflict: 'raw_document_id' },
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Failed to upsert content item');
  }

  return { sourceEntityType: 'content_item', sourceEntityId: data.id };
}

export async function upsertOffer(
  rawDocId: string,
  payload: OfferExtraction['offer'],
): Promise<CanonicalEntity> {
  const { data, error } = await (supabase as any)
    .from('offers')
    .upsert(
      {
        raw_document_id: rawDocId,
        name: payload.name,
        description: payload.description ?? null,
        price: payload.price ?? null,
        currency: payload.currency,
        target_audience: payload.target_audience ?? null,
        sales_model: payload.sales_model ?? null,
        status: payload.status,
      },
      { onConflict: 'raw_document_id' },
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Failed to upsert offer');
  }

  return { sourceEntityType: 'offer', sourceEntityId: data.id };
}

export async function upsertEntity(
  rawDocId: string,
  payload: GenericExtraction['entity'],
): Promise<CanonicalEntity> {
  const { data, error } = await (supabase as any)
    .from('entities')
    .upsert(
      {
        raw_document_id: rawDocId,
        entity_type: payload.entity_type,
        name: payload.name ?? null,
        attributes: payload.attributes,
      },
      { onConflict: 'raw_document_id' },
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Failed to upsert entity');
  }

  return { sourceEntityType: 'entity', sourceEntityId: data.id };
}

export async function upsertBusinessFactWithChangeDetection(
  sourceEntityType: string,
  sourceEntityId: string,
  fact: { fact_type: string; fact_text: string; domain: string; confidence_score: number },
  options?: { sourceContentPublishedAt?: string | null; rawDocumentId?: string | null },
): Promise<void> {
  const { data: existing, error: existingError } = await (supabase as any)
    .from('business_facts')
    .select('id,fact_text')
    .eq('domain', fact.domain)
    .eq('source_entity_type', sourceEntityType)
    .eq('source_entity_id', sourceEntityId)
    .eq('fact_type', fact.fact_type)
    .is('valid_until', null)
    .limit(1)
    .single();

  if (existingError && existingError.code !== 'PGRST116') {
    throw new Error(existingError.message);
  }

  const now = new Date().toISOString();
  const resolvedSourceDate = await resolveSourcePublishDate(
    sourceEntityType,
    sourceEntityId,
    options?.rawDocumentId,
    options?.sourceContentPublishedAt,
  );

  if (existing?.id) {
    if (existing.fact_text === fact.fact_text) {
      return;
    }

    await (supabase as any).from('business_facts').update({ valid_until: now }).eq('id', existing.id);
  }

  await (supabase as any).from('business_facts').insert({
    fact_type: fact.fact_type,
    fact_text: fact.fact_text,
    domain: fact.domain,
    source_entity_type: sourceEntityType,
    source_entity_id: sourceEntityId,
    confidence_score: fact.confidence_score,
    source_content_published_at: resolvedSourceDate,
    valid_from: now,
    valid_until: null,
  });
}

export async function insertRelationships(
  sourceEntityType: string,
  sourceEntityId: string,
  relationships: Array<{ relation_type: string; target_description: string }>,
): Promise<void> {
  const resolveTargetEntityId = async (targetDescription: string): Promise<string> => {
    const { data: existing, error: existingError } = await (supabase as any)
      .from('entities')
      .select('id')
      .eq('entity_type', 'relationship_target')
      .eq('name', targetDescription)
      .limit(1)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error(existingError.message ?? 'Failed to check relationship target entity');
    }

    if (existing?.id) {
      return existing.id;
    }

    const { data: created, error: createError } = await (supabase as any)
      .from('entities')
      .insert({
        entity_type: 'relationship_target',
        name: targetDescription,
        attributes: { kind: 'relationship_target' },
      })
      .select('id')
      .single();

    if (createError || !created?.id) {
      throw new Error(createError?.message ?? 'Failed to create relationship target entity');
    }

    return created.id;
  };

  for (const relation of relationships) {
    const targetEntityId = await resolveTargetEntityId(relation.target_description);

    const existingResult = await (supabase as any)
      .from('relationship_edges')
      .select('id')
      .eq('from_entity_type', sourceEntityType)
      .eq('from_entity_id', sourceEntityId)
      .eq('relation_type', relation.relation_type)
      .eq('to_entity_type', 'entity')
      .eq('to_entity_id', targetEntityId)
      .limit(1);

    const existingRows = (existingResult as any).data;
    const existingError = (existingResult as any).error;

    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error(existingError.message ?? 'Failed to check existing relationship');
    }

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      continue;
    }

    const { error: insertError } = await (supabase as any).from('relationship_edges').insert({
      from_entity_type: sourceEntityType,
      from_entity_id: sourceEntityId,
      relation_type: relation.relation_type,
      to_entity_type: 'entity',
      to_entity_id: targetEntityId,
      metadata: { target_description: relation.target_description },
    });

    if (insertError) {
      throw new Error(insertError.message ?? 'Failed to insert relationship');
    }
  }
}
