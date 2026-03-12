import { callClaude, ClaudeZodValidationError } from '../lib/claude';
import { supabase } from '../lib/supabase';
import { ContentExtractionSchema, GenericExtractionSchema, OfferExtractionSchema } from '../schemas/extraction';
import { buildPrompt, getPromptForCategory, getSchemaForCategory, type ExtractionCategory } from './extractionPrompts';
import {
  insertRelationships,
  upsertBusinessFactWithChangeDetection,
  upsertContentItem,
  upsertEntity,
  upsertOffer,
} from './extractionUpserts';

type RawDocumentInput = { id: string; source_type: string; raw_payload: Record<string, unknown> };
type TriageInput = { business_category: ExtractionCategory; summary: string };

export async function extractDocument(rawDoc: RawDocumentInput, triageResult: TriageInput) {
  try {
    const category = triageResult.business_category;
    const prompt = buildPrompt(getPromptForCategory(category), rawDoc, triageResult.summary);
    getSchemaForCategory(category);

    if (category === 'contenu') {
      const extraction = await callClaude({
        model: 'sonnet',
        prompt,
        zodSchema: ContentExtractionSchema,
        maxRetries: 2,
      });

      const canonical = await upsertContentItem(rawDoc.id, extraction.content_item);

      for (const fact of extraction.business_facts) {
        await upsertBusinessFactWithChangeDetection(canonical.sourceEntityType, canonical.sourceEntityId, fact, {
          sourceContentPublishedAt: extraction.content_item.publish_date ?? null,
          rawDocumentId: rawDoc.id,
        });
      }

      await insertRelationships(canonical.sourceEntityType, canonical.sourceEntityId, extraction.relationships);
      await (supabase as any).from('raw_documents').update({ processing_status: 'canonicalized' }).eq('id', rawDoc.id);
      return extraction;
    }

    if (category === 'offre') {
      const extraction = await callClaude({
        model: 'sonnet',
        prompt,
        zodSchema: OfferExtractionSchema,
        maxRetries: 2,
      });

      const canonical = await upsertOffer(rawDoc.id, extraction.offer);

      for (const fact of extraction.business_facts) {
        await upsertBusinessFactWithChangeDetection(canonical.sourceEntityType, canonical.sourceEntityId, fact, {
          rawDocumentId: rawDoc.id,
        });
      }

      await insertRelationships(canonical.sourceEntityType, canonical.sourceEntityId, extraction.relationships);
      await (supabase as any).from('raw_documents').update({ processing_status: 'canonicalized' }).eq('id', rawDoc.id);
      return extraction;
    }

    // Catégories strategie, client, metrique, process, autre → GenericExtractionSchema
    const extraction = await callClaude({
      model: 'sonnet',
      prompt,
      zodSchema: GenericExtractionSchema,
      maxRetries: 2,
    });

    const canonical = await upsertEntity(rawDoc.id, extraction.entity);

    for (const fact of extraction.business_facts) {
      await upsertBusinessFactWithChangeDetection(canonical.sourceEntityType, canonical.sourceEntityId, fact, {
        rawDocumentId: rawDoc.id,
      });
    }

    await insertRelationships(canonical.sourceEntityType, canonical.sourceEntityId, extraction.relationships);
    await (supabase as any).from('raw_documents').update({ processing_status: 'canonicalized' }).eq('id', rawDoc.id);
    return extraction;
  } catch (error) {
    if (error instanceof ClaudeZodValidationError) {
      await (supabase as any).from('raw_documents').update({ processing_status: 'extraction_failed' }).eq('id', rawDoc.id);
    }
    throw error;
  }
}