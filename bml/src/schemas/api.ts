import { z } from 'zod';

export const MemorySearchInputSchema = z.object({
  query: z.string().min(1).max(1000),
  filters: z.object({
    entity_type: z.string().optional(),
    domain: z.string().optional(),
    date_range: z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).optional(),
  }).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export type MemorySearchInput = z.infer<typeof MemorySearchInputSchema>;

export const ContextBuildInputSchema = z.object({
  goal: z.string().min(1).max(2000),
  include_domains: z.array(
    z.enum(['contenu', 'offre', 'client', 'strategie', 'metrique', 'process'])
  ).optional(),
  max_tokens: z.number().int().min(500).max(8000).default(4000),
  include_facts: z.boolean().default(true),
  include_chunks: z.boolean().default(true),
  include_metrics: z.boolean().default(false),
});

export type ContextBuildInput = z.infer<typeof ContextBuildInputSchema>;

export const BusinessSummaryQuerySchema = z.object({
  domain: z.enum(['contenu', 'offre', 'client', 'strategie', 'metrique', 'process']).optional(),
});

export type BusinessSummaryQuery = z.infer<typeof BusinessSummaryQuerySchema>;
