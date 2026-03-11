CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS source_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type = ANY (ARRAY['youtube', 'notion', 'linkedin', 'gdrive', 'stripe'])),
  credentials_ref text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_connection_id uuid NOT NULL REFERENCES source_connections(id),
  status text NOT NULL CHECK (status = ANY (ARRAY['running', 'ingested', 'triaged', 'failed'])),
  cursor text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  items_processed integer DEFAULT 0,
  items_skipped integer DEFAULT 0,
  items_failed integer DEFAULT 0,
  error_log jsonb DEFAULT '[]'::jsonb,
  duration_ms integer
);

CREATE TABLE IF NOT EXISTS raw_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_object_id text NOT NULL,
  sync_run_id uuid REFERENCES sync_runs(id),
  raw_payload jsonb NOT NULL,
  relevance_score double precision,
  business_category text,
  processing_status text NOT NULL DEFAULT 'ingested' CHECK (processing_status = ANY (ARRAY['ingested', 'triaged', 'canonicalized', 'skipped', 'extraction_failed'])),
  summary text,
  ingested_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT raw_documents_source_type_source_object_id_key UNIQUE (source_type, source_object_id)
);

CREATE TABLE IF NOT EXISTS content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_document_id uuid UNIQUE REFERENCES raw_documents(id),
  title text NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['youtube', 'linkedin', 'blog', 'other'])),
  url text,
  publish_date timestamptz,
  topic text,
  summary text,
  tags text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT content_items_raw_document_id_unique UNIQUE (raw_document_id)
);

CREATE TABLE IF NOT EXISTS content_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_items(id),
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  watch_time_seconds integer DEFAULT 0,
  click_through_rate double precision,
  utm_source text,
  utm_campaign text,
  conversion_events integer DEFAULT 0,
  snapshot_date timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_document_id uuid UNIQUE REFERENCES raw_documents(id),
  name text NOT NULL,
  description text,
  price numeric,
  currency text DEFAULT 'EUR',
  target_audience text,
  sales_model text,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active', 'archived', 'draft'])),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT offers_raw_document_id_unique UNIQUE (raw_document_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_document_id uuid REFERENCES raw_documents(id),
  title text NOT NULL,
  source text NOT NULL,
  url text,
  doc_type text,
  summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_document_id uuid UNIQUE REFERENCES raw_documents(id),
  entity_type text NOT NULL,
  name text,
  attributes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT entities_raw_document_id_unique UNIQUE (raw_document_id)
);

CREATE TABLE IF NOT EXISTS business_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_type text NOT NULL,
  fact_text text NOT NULL,
  domain text NOT NULL,
  source_entity_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  confidence_score double precision DEFAULT 0.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  needs_review boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  chunk_text text NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  token_count integer,
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  content_hash text
);

CREATE TABLE IF NOT EXISTS relationship_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_type text NOT NULL,
  from_entity_id uuid NOT NULL,
  relation_type text NOT NULL,
  to_entity_type text NOT NULL,
  to_entity_id uuid NOT NULL,
  confidence double precision DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_connections_type ON source_connections (source_type);
CREATE INDEX IF NOT EXISTS idx_sync_runs_source ON sync_runs (source_connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_docs_source ON raw_documents (source_type);
CREATE INDEX IF NOT EXISTS idx_raw_docs_status ON raw_documents (processing_status);
CREATE INDEX IF NOT EXISTS idx_raw_docs_category ON raw_documents (business_category);
CREATE INDEX IF NOT EXISTS idx_content_items_platform ON content_items (platform);
CREATE INDEX IF NOT EXISTS idx_content_items_publish ON content_items (publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_content_metrics_item ON content_metrics (content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_metrics_date ON content_metrics (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers (status);
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents (source);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_facts_domain ON business_facts (domain);
CREATE INDEX IF NOT EXISTS idx_facts_type ON business_facts (fact_type);
CREATE INDEX IF NOT EXISTS idx_facts_source ON business_facts (source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_facts_active ON business_facts (valid_until) WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_chunks_entity ON memory_chunks (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON memory_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_edges_from ON relationship_edges (from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON relationship_edges (relation_type);
CREATE INDEX IF NOT EXISTS idx_edges_to ON relationship_edges (to_entity_type, to_entity_id);
