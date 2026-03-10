import { z } from 'zod';

export const BusinessFactSchema = z.object({
  id: z.string().uuid().optional(),
  fact_type: z.string(),
  fact_text: z.string(),
  domain: z.enum(['contenu', 'offre', 'client', 'strategie', 'metrique', 'process']),
  source_entity_type: z.string(),
  source_entity_id: z.string().uuid(),
  confidence_score: z.number().min(0).max(1).default(0),
  valid_from: z.string().datetime().optional(),
  valid_until: z.string().datetime().nullable().optional(),
  needs_review: z.boolean().default(false),
  created_at: z.string().datetime().optional(),
});

export type BusinessFact = z.infer<typeof BusinessFactSchema>;
