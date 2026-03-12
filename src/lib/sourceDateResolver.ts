import { supabase } from './supabase';

function normalizeUnknownDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const asDate = new Date(millis);
    return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{13}$/.test(trimmed)) {
    const asDate = new Date(Number(trimmed));
    return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
  }

  if (/^\d{10}$/.test(trimmed)) {
    const asDate = new Date(Number(trimmed) * 1000);
    return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

async function resolveRawDocumentIdForEntity(
  sourceEntityType: string,
  sourceEntityId: string,
): Promise<string | null> {
  if (sourceEntityType === 'content_item') {
    const { data, error } = await (supabase as any)
      .from('content_items')
      .select('raw_document_id')
      .eq('id', sourceEntityId)
      .single();
    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }
    return data?.raw_document_id ?? null;
  }

  if (sourceEntityType === 'entity') {
    const { data, error } = await (supabase as any)
      .from('entities')
      .select('raw_document_id')
      .eq('id', sourceEntityId)
      .single();
    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }
    return data?.raw_document_id ?? null;
  }

  if (sourceEntityType === 'offer') {
    const { data, error } = await (supabase as any)
      .from('offers')
      .select('raw_document_id')
      .eq('id', sourceEntityId)
      .single();
    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }
    return data?.raw_document_id ?? null;
  }

  return null;
}

export async function resolveSourcePublishDate(
  sourceEntityType: string,
  sourceEntityId: string,
  rawDocumentId?: string | null,
  sourceContentPublishedAt?: string | null,
): Promise<string | null> {
  const explicitSourceDate = normalizeUnknownDate(sourceContentPublishedAt);
  if (explicitSourceDate) {
    return explicitSourceDate;
  }

  if (sourceEntityType === 'content_item') {
    const { data, error } = await (supabase as any)
      .from('content_items')
      .select('publish_date')
      .eq('id', sourceEntityId)
      .single();
    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }

    const publishDate = normalizeUnknownDate(data?.publish_date);
    if (publishDate) {
      return publishDate;
    }
  }

  let effectiveRawDocumentId = rawDocumentId ?? null;
  if (!effectiveRawDocumentId) {
    effectiveRawDocumentId = await resolveRawDocumentIdForEntity(sourceEntityType, sourceEntityId);
  }

  if (!effectiveRawDocumentId) {
    return null;
  }

  const { data: rawDoc, error: rawDocError } = await (supabase as any)
    .from('raw_documents')
    .select('raw_payload')
    .eq('id', effectiveRawDocumentId)
    .single();
  if (rawDocError && rawDocError.code !== 'PGRST116') {
    throw new Error(rawDocError.message);
  }

  const payload = (rawDoc?.raw_payload ?? {}) as Record<string, unknown>;
  return (
    normalizeUnknownDate(payload.publishedAt) ??
    normalizeUnknownDate(payload.createdAt) ??
    normalizeUnknownDate(payload.createdTime) ??
    normalizeUnknownDate(payload.created_time) ??
    normalizeUnknownDate(payload.lastEditedTime)
  );
}
