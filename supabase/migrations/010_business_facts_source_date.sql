-- Ajout de la date de publication du contenu source sur business_facts
-- valid_from reste la date de versioning système

ALTER TABLE public.business_facts
ADD COLUMN IF NOT EXISTS source_content_published_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_business_facts_source_published
ON public.business_facts (source_content_published_at)
WHERE source_content_published_at IS NOT NULL;

-- Backfill 1: content_items.publish_date -> business_facts
UPDATE public.business_facts bf
SET source_content_published_at = ci.publish_date
FROM public.content_items ci
WHERE bf.source_entity_type = 'content_item'
  AND bf.source_entity_id = ci.id
  AND bf.source_content_published_at IS NULL
  AND ci.publish_date IS NOT NULL;

-- Backfill 2: facts liés à entities depuis raw_payload avec parsing robuste
UPDATE public.business_facts bf
SET source_content_published_at = COALESCE(
  CASE
    WHEN (rd.raw_payload->>'publishedAt') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'publishedAt')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(rd.raw_payload->'createdAt') = 'number'
      THEN to_timestamp((rd.raw_payload->>'createdAt')::double precision / 1000.0)
    WHEN (rd.raw_payload->>'createdAt') ~ '^\d{13}$'
      THEN to_timestamp((rd.raw_payload->>'createdAt')::double precision / 1000.0)
    WHEN (rd.raw_payload->>'createdAt') ~ '^\d{10}(\.\d+)?$'
      THEN to_timestamp((rd.raw_payload->>'createdAt')::double precision)
    WHEN (rd.raw_payload->>'createdAt') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'createdAt')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN (rd.raw_payload->>'createdTime') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'createdTime')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN (rd.raw_payload->>'created_time') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'created_time')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN (rd.raw_payload->>'lastEditedTime') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'lastEditedTime')::timestamptz
    ELSE NULL
  END
)
FROM public.entities e
JOIN public.raw_documents rd ON e.raw_document_id = rd.id
WHERE bf.source_entity_type = 'entity'
  AND bf.source_entity_id = e.id
  AND bf.source_content_published_at IS NULL;

-- Backfill 3: facts liés à content_items sans publish_date, fallback raw_payload
UPDATE public.business_facts bf
SET source_content_published_at = COALESCE(
  CASE
    WHEN (rd.raw_payload->>'publishedAt') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'publishedAt')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(rd.raw_payload->'createdAt') = 'number'
      THEN to_timestamp((rd.raw_payload->>'createdAt')::double precision / 1000.0)
    WHEN (rd.raw_payload->>'createdAt') ~ '^\d{13}$'
      THEN to_timestamp((rd.raw_payload->>'createdAt')::double precision / 1000.0)
    WHEN (rd.raw_payload->>'createdAt') ~ '^\d{10}(\.\d+)?$'
      THEN to_timestamp((rd.raw_payload->>'createdAt')::double precision)
    WHEN (rd.raw_payload->>'createdAt') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'createdAt')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN (rd.raw_payload->>'createdTime') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'createdTime')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN (rd.raw_payload->>'created_time') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'created_time')::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN (rd.raw_payload->>'lastEditedTime') ~ '^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$'
      THEN (rd.raw_payload->>'lastEditedTime')::timestamptz
    ELSE NULL
  END
)
FROM public.content_items ci
JOIN public.raw_documents rd ON ci.raw_document_id = rd.id
WHERE bf.source_entity_type = 'content_item'
  AND bf.source_entity_id = ci.id
  AND bf.source_content_published_at IS NULL
  AND ci.publish_date IS NULL;
