import { z } from 'zod';

export const EntitySchema = z.object({
  id: z.string().uuid().optional(),
  raw_document_id: z.string().uuid().optional(),
  entity_type: z.string(),
  name: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.any()).default({}),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Entity = z.infer<typeof EntitySchema>;
