import { z } from 'zod';

export const ContentPlatformSchema = z.enum(['youtube', 'linkedin', 'blog', 'other']);

export const ContentItemSchema = z.object({
  id: z.string().uuid().optional(),
  raw_document_id: z.string().uuid().optional(),
  title: z.string(),
  platform: ContentPlatformSchema,
  url: z.string().url().nullable().optional(),
  publish_date: z.string().datetime().nullable().optional(),
  topic: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ContentPlatform = z.infer<typeof ContentPlatformSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
