import { z } from 'zod';

export const OfferStatusSchema = z.enum(['active', 'archived', 'draft']);

export const OfferSchema = z.object({
  id: z.string().uuid().optional(),
  raw_document_id: z.string().uuid().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().default('EUR'),
  target_audience: z.string().nullable().optional(),
  sales_model: z.string().nullable().optional(),
  status: OfferStatusSchema.default('active'),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type OfferStatus = z.infer<typeof OfferStatusSchema>;
export type Offer = z.infer<typeof OfferSchema>;
