import { supabase } from '../lib/supabase';
import { callClaude, ClaudeZodValidationError } from '../lib/claude';
import { TriageResult, TriageResultSchema } from '../schemas/triage';

type RawDocumentInput = {
  id: string;
  source_type: string;
  raw_payload: Record<string, unknown>;
};

function isOperationalNotionDocument(rawDoc: RawDocumentInput): boolean {
  if (rawDoc.source_type !== 'notion') {
    return false;
  }

  const title = String(rawDoc.raw_payload.title ?? '').toLowerCase();
  const content = String(rawDoc.raw_payload.content ?? '').toLowerCase();
  const text = `${title} ${content}`;

  return (
    text.includes('to do') ||
    text.includes('todo') ||
    text.includes('command center') ||
    text.includes('content pipeline') ||
    text.includes('bible youtube') ||
    text.includes('template') ||
    text.includes('workflow')
  );
}

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

IMPORTANT : Les pages Notion de type opérationnel (to-do lists, command centers, pipelines de contenu, bibles de production, templates de travail) sont TOUJOURS pertinentes pour le business d'un fondateur solo.
- Score minimum 0.6 pour ces pages.
- Catégorie attendue : "process" ou "strategie" selon le contenu.

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

    const operationalNotion = isOperationalNotionDocument(rawDoc);
    const forcedScore = operationalNotion ? Math.max(result.relevance_score, 0.6) : result.relevance_score;
    const forcedCategory =
      operationalNotion && result.business_category === 'autre' ? 'process' : result.business_category;
    const forcedSummary =
      operationalNotion && !result.summary.trim()
        ? 'Document opérationnel Notion pertinent pour le pilotage business.'
        : result.summary;

    const processingStatus = forcedScore > 0.5 ? 'triaged' : 'skipped';
    if (operationalNotion && processingStatus === 'skipped') {
      console.warn(`[triage] Unexpected skipped status for operational Notion doc ${rawDoc.id}`);
    }

    await (supabase as any)
      .from('raw_documents')
      .update({
        relevance_score: forcedScore,
        business_category: forcedCategory,
        summary: forcedSummary,
        processing_status: processingStatus,
      })
      .eq('id', rawDoc.id);

    return {
      relevance_score: forcedScore,
      business_category: forcedCategory,
      summary: forcedSummary,
    };
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
