import { z } from 'zod';

export const TriageResultSchema = z.object({
  relevance_score: z.number().min(0).max(1),
  business_category: z.enum([
    'contenu', 'offre', 'client', 'strategie',
    'metrique', 'process', 'autre'
  ]),
  summary: z.string().min(5).max(500),
});

export type TriageResult = z.infer<typeof TriageResultSchema>;
