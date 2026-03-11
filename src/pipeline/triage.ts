import { supabase } from '../lib/supabase';
import { callClaude, ClaudeZodValidationError } from '../lib/claude';
import { TriageResult, TriageResultSchema } from '../schemas/triage';

type RawDocumentInput = {
  id: string;
  source_type: string;
  raw_payload: Record<string, unknown>;
};

const TRIAGE_PROMPT_TEMPLATE = `Tu es un assistant qui classe des documents business.

Contexte : Tu travailles pour un fondateur solo (consultant, créateur de contenu B2B). Tu reçois un document brut provenant de ses outils (YouTube, LinkedIn, Notion, Google Drive).

Ta tâche :
1. Évaluer la pertinence de ce document pour le business du fondateur (score de 0.0 à 1.0)
2. Classer le document dans UNE catégorie business
3. Rédiger un résumé court (1-2 phrases)

Catégories autorisées :
- contenu : vidéo YouTube, post LinkedIn, article, script
- offre : description d'offre, pricing, page de vente
- client : information sur un lead, client, prospect
- strategie : décision, pivot, positionnement, réflexion stratégique
- metrique : chiffres de performance, analytics, revenus
- process : méthode de travail, template, workflow, habitude
- autre : document pertinent mais ne rentrant dans aucune catégorie

Règles de scoring :
- 0.8-1.0 : directement lié au business (offre, client, stratégie, contenu publié)
- 0.5-0.8 : indirectement utile (notes, brouillons, références)
- 0.2-0.5 : faiblement pertinent (contenu générique, admin)
- 0.0-0.2 : non pertinent (spam, bruit)

Document à analyser :
Source : {source_type}
Données : {raw_payload en JSON}

Réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après :
{"relevance_score": <number>, "business_category": "<string>", "summary": "<string>"}`;

function buildTriagePrompt(rawDoc: RawDocumentInput): string {
  return TRIAGE_PROMPT_TEMPLATE
    .replace('{source_type}', rawDoc.source_type)
    .replace('{raw_payload en JSON}', JSON.stringify(rawDoc.raw_payload));
}

export async function triageDocument(rawDoc: RawDocumentInput): Promise<TriageResult> {
  const prompt = buildTriagePrompt(rawDoc);

  try {
    const result = await callClaude({
      model: 'haiku',
      prompt,
      zodSchema: TriageResultSchema,
      maxRetries: 2,
    });

    const processingStatus = result.relevance_score > 0.5 ? 'triaged' : 'skipped';

    await (supabase as any)
      .from('raw_documents')
      .update({
        relevance_score: result.relevance_score,
        business_category: result.business_category,
        summary: result.summary,
        processing_status: processingStatus,
      })
      .eq('id', rawDoc.id);

    return result;
  } catch (error) {
    if (error instanceof ClaudeZodValidationError) {
      await (supabase as any)
        .from('raw_documents')
        .update({ processing_status: 'extraction_failed' })
        .eq('id', rawDoc.id);
    }

    throw error;
  }
}

export async function triageBatch(rawDocs: RawDocumentInput[]): Promise<{ processed: number; skipped: number; failed: number }> {
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const rawDoc of rawDocs) {
    try {
      const result = await triageDocument(rawDoc);
      processed += 1;
      if (result.relevance_score <= 0.5) {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { processed, skipped, failed };
}
