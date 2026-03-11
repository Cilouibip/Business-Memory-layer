CREATE TABLE IF NOT EXISTS linkedin_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT DEFAULT 'personal',
  content TEXT NOT NULL,
  style TEXT NOT NULL,
  sources JSONB,
  news_used JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_linkedin_drafts_status ON linkedin_drafts(status);
CREATE INDEX IF NOT EXISTS idx_linkedin_drafts_workspace ON linkedin_drafts(workspace_id);
