import { z } from 'zod';

export const ProcessingStatusSchema = z.enum([
  'ingested',
  'triaged',
  'canonicalized',
  'skipped',
  'extraction_failed'
]);

export const RawDocumentSchema = z.object({
  id: z.string().uuid().optional(),
  source_type: z.string(),
  source_object_id: z.string(),
  sync_run_id: z.string().uuid().optional(),
  raw_payload: z.record(z.string(), z.any()),
  relevance_score: z.number().nullable().optional(),
  business_category: z.string().nullable().optional(),
  processing_status: ProcessingStatusSchema.default('ingested'),
  summary: z.string().nullable().optional(),
  ingested_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;
export type RawDocument = z.infer<typeof RawDocumentSchema>;
