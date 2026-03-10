import { z } from 'zod';

export const BusinessDomainSchema = z.enum([
  'contenu', 'offre', 'client', 'strategie', 'metrique', 'process'
]);

export const ExtractedFactSchema = z.object({
  fact_type: z.string(),
  fact_text: z.string(),
  domain: BusinessDomainSchema,
  confidence_score: z.number().min(0).max(1),
});

export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

export const RelationshipSchema = z.object({
  relation_type: z.string(),
  target_description: z.string(),
});

export const ContentExtractionSchema = z.object({
  content_item: z.object({
    title: z.string(),
    platform: z.enum(['youtube', 'linkedin', 'blog', 'other']),
    url: z.string().optional(),
    publish_date: z.string().optional(),
    topic: z.string().optional(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
  }),
  business_facts: z.array(ExtractedFactSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
});

export type ContentExtraction = z.infer<typeof ContentExtractionSchema>;

export const OfferExtractionSchema = z.object({
  offer: z.object({
    name: z.string(),
    description: z.string().optional(),
    price: z.number().optional(),
    currency: z.string().default('EUR'),
    target_audience: z.string().optional(),
    sales_model: z.string().optional(),
    status: z.enum(['active', 'archived', 'draft']).default('active'),
  }),
  business_facts: z.array(ExtractedFactSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
});

export type OfferExtraction = z.infer<typeof OfferExtractionSchema>;

export const GenericExtractionSchema = z.object({
  entity: z.object({
    entity_type: z.string(),
    name: z.string().optional(),
    attributes: z.record(z.string(), z.unknown()).default({}),
  }),
  business_facts: z.array(ExtractedFactSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
});

export type GenericExtraction = z.infer<typeof GenericExtractionSchema>;
