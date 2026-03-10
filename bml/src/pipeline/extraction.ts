import { supabase } from '../lib/supabase';
import { callClaude, ClaudeZodValidationError } from '../lib/claude';
import {
  ContentExtraction,
  ContentExtractionSchema,
  GenericExtraction,
  GenericExtractionSchema,
  OfferExtraction,
  OfferExtractionSchema,
} from '../schemas/extraction';

type RawDocumentInput = {
  id: string;
  source_type: string;
  raw_payload: Record<string, unknown>;
};

type TriageInput = {
  business_category: 'contenu' | 'offre' | 'client' | 'strategie' | 'metrique' | 'process' | 'autre';
  summary: string;
};

// =============================================================================
// PROMPTS D'EXTRACTION — Un prompt calibré par catégorie business
// =============================================================================

const CONTENT_PROMPT_TEMPLATE = `Tu es un assistant qui extrait des informations structurées depuis des documents business.

Ce document est classé "contenu" (vidéo, post, article).

Extrais les informations suivantes dans le format JSON demandé :
1. L'objet contenu (titre, plateforme, URL, date, sujet, résumé, tags)
2. Les faits business déduits de ce contenu (positionnement, audience, performance, thèmes récurrents)
3. Les relations détectées (ce contenu mentionne-t-il une offre ? un client ? une stratégie ?)

Source : {source_type}
Données : {raw_payload}
Résumé du triage : {summary}

Réponds UNIQUEMENT en JSON valide :
{
  "content_item": { "title": "...", "platform": "youtube|linkedin|blog|other", "url": "...", "publish_date": "ISO8601", "topic": "...", "summary": "...", "tags": ["..."] },
  "business_facts": [
    { "fact_type": "...", "fact_text": "...", "domain": "contenu|offre|client|strategie|metrique|process", "confidence_score": 0.0-1.0 }
  ],
  "relationships": [
    { "relation_type": "mentions|promotes|references", "target_description": "..." }
  ]
}`;

const OFFER_PROMPT_TEMPLATE = `Tu es un assistant qui extrait des informations structurées depuis des documents business.

Ce document est classé "offre" — il décrit une offre commerciale, un pricing, une page de vente, un descriptif de service, des modules ou upsells.

Contexte du fondateur : consultant/créateur B2B qui vend des services à des experts, infopreneurs, consultants et petites agences (2-15 personnes, 10K-100K€/mois). Ses offres sont structurées en briques (modules fonctionnels) avec un prix de base et des modules accélérateurs (upsells). Devise par défaut : EUR.

Extrais les informations suivantes dans le format JSON demandé :

1. L'objet offre :
   - name : nom commercial de l'offre
   - description : résumé en 1-3 phrases de ce que l'offre délivre
   - price : prix de base en nombre (sans symbole). Si fourchette, prendre le prix de base (entrée de gamme). Si pas de prix explicite, null.
   - currency : devise (défaut "EUR")
   - target_audience : qui est la cible (profil, taille, CA)
   - sales_model : modèle de vente ("done_for_you", "coaching", "formation", "saas", "recurring", "one_shot", "hybrid")
   - status : "active" si l'offre est en vente, "draft" si en construction, "archived" si abandonnée

2. Les faits business déduits :
   - Composition de l'offre (briques, modules, livrables)
   - Positionnement prix par rapport au marché
   - Garanties ou promesses de résultat
   - Upsells et modules complémentaires avec leurs prix
   - Process commercial (étapes de vente, durée de livraison)
   - Évolutions par rapport à des versions précédentes si mentionnées

3. Les relations détectées :
   - Cette offre cible-t-elle un segment client spécifique ?
   - Cette offre est-elle liée à un contenu (vidéo, post) qui en fait la promotion ?
   - Cette offre remplace-t-elle ou complète-t-elle une autre offre ?

Règles :
- fact_type pour les offres : "offer_composition", "offer_pricing", "offer_guarantee", "offer_upsell", "offer_sales_process", "offer_evolution"
- Si le document mentionne plusieurs offres distinctes, extrais uniquement l'offre PRINCIPALE du document. Les autres sont des relations.
- Si un prix est exprimé en fourchette (ex: 1500 - 3000€), utilise le bas de la fourchette comme price et mentionne la fourchette complète dans un fait.

Source : {source_type}
Données : {raw_payload}
Résumé du triage : {summary}

Réponds UNIQUEMENT en JSON valide :
{
  "offer": { "name": "...", "description": "...", "price": null, "currency": "EUR", "target_audience": "...", "sales_model": "...", "status": "active|archived|draft" },
  "business_facts": [
    { "fact_type": "...", "fact_text": "...", "domain": "offre", "confidence_score": 0.0-1.0 }
  ],
  "relationships": [
    { "relation_type": "targets|replaces|complements|promoted_by", "target_description": "..." }
  ]
}`;

const STRATEGIE_PROMPT_TEMPLATE = `Tu es un assistant qui extrait des informations structurées depuis des documents business.

Ce document est classé "strategie" — il contient une décision stratégique, un pivot, un choix de positionnement, une réflexion sur la direction du business.

Contexte du fondateur : ex-COO de grandes entreprises (L'Oréal, Getir, Mindeo) qui construit maintenant son propre business de consulting/contenu B2B. Il prend des décisions fréquentes sur : son positionnement, ses offres, ses canaux d'acquisition (YouTube, LinkedIn), ses outils techniques, sa cible. Ses décisions sont souvent des pivots (abandon d'une offre, changement de cible, nouveau canal).

Extrais les informations suivantes :

1. L'entité stratégique :
   - entity_type : "decision"
   - name : titre court de la décision (ex: "Pivot vers Machine à Revenus")
   - attributes (objet JSON) :
     - decision_type : "pivot", "launch", "abandon", "repositioning", "tool_choice", "pricing_change", "channel_change", "target_change"
     - description : ce qui a été décidé, en 2-4 phrases
     - reasoning : pourquoi cette décision a été prise
     - date : date de la décision si mentionnée (ISO8601), sinon null
     - impact_areas : tableau des domaines impactés ["offre", "contenu", "client", "process", "metrique"]
     - status : "decided", "exploring", "abandoned"

2. Les faits business déduits :
   - Le fait stratégique principal (ex: "Le fondateur a abandonné l'offre Growth Accelerator au profit de Machine à Revenus")
   - Les raisons clés de la décision
   - Les conséquences anticipées ou observées
   - Les alternatives considérées et rejetées

3. Les relations :
   - Cette décision impacte-t-elle une offre ? Un process ? Un canal de contenu ?
   - Cette décision en remplace-t-elle ou contredit-elle une précédente ?

Règles :
- fact_type pour les stratégies : "strategic_decision", "strategic_reasoning", "strategic_consequence", "strategic_alternative_rejected"
- domain des faits : "strategie" (sauf si le fait porte sur un autre domaine, ex: un changement de prix → domain "offre")
- Si le document contient plusieurs décisions, extrais la décision PRINCIPALE. Les autres sont des faits secondaires.

Source : {source_type}
Données : {raw_payload}
Résumé du triage : {summary}

Réponds UNIQUEMENT en JSON valide :
{
  "entity": { "entity_type": "decision", "name": "...", "attributes": { "decision_type": "...", "description": "...", "reasoning": "...", "date": "...", "impact_areas": [...], "status": "..." } },
  "business_facts": [
    { "fact_type": "...", "fact_text": "...", "domain": "strategie", "confidence_score": 0.0-1.0 }
  ],
  "relationships": [
    { "relation_type": "impacts|replaces|contradicts", "target_description": "..." }
  ]
}`;

const CLIENT_PROMPT_TEMPLATE = `Tu es un assistant qui extrait des informations structurées depuis des documents business.

Ce document est classé "client" — il contient des informations sur un lead, un prospect, un client actuel, ou un segment de clientèle.

Contexte du fondateur : il cible des experts, infopreneurs, consultants et petites agences (2-15 personnes, CA de 10K à 100K€/mois). Son avatar principal est "l'expert de l'ombre" — quelqu'un de très compétent mais qui déteste prospecter et vendre. Son acquisition est organique (YouTube, LinkedIn). Ses clients viennent via appel stratégique de 30 min.

Extrais les informations suivantes :

1. L'entité client/lead :
   - entity_type : "client" (si relation commerciale existante) ou "lead" (si prospect/contact)
   - name : nom de la personne ou de l'entreprise
   - attributes (objet JSON) :
     - company : nom de l'entreprise si mentionné
     - segment : type de business ("infopreneur", "consultant", "agence", "saas", "ecommerce", "autre")
     - estimated_revenue : tranche de CA si mentionnée ("<10k", "10k-50k", "50k-100k", ">100k")
     - source : comment le contact a été acquis ("youtube", "linkedin", "referral", "outbound", "event", "unknown")
     - status : "lead", "qualified", "proposal_sent", "client", "churned", "lost"
     - interactions : tableau de chaînes décrivant les interactions clés
     - pain_points : les problèmes identifiés du client
     - offer_interest : quelle offre l'intéresse si mentionné

2. Les faits business déduits :
   - Informations sur le profil et les besoins du client
   - Canal d'acquisition d'où vient ce lead
   - Stade dans le processus commercial
   - Fit avec l'avatar cible

3. Les relations :
   - Ce client est-il lié à une offre spécifique ?
   - Ce client a-t-il été mentionné dans un contenu (témoignage, étude de cas) ?
   - Ce client a-t-il un lien avec un autre client ou une décision stratégique ?

Règles :
- fact_type pour les clients : "client_profile", "client_acquisition_source", "client_pain_point", "client_status_change", "client_feedback"
- Si le document parle d'un SEGMENT (pas d'un individu), entity_type = "client_segment" et name = le nom du segment.
- Si plusieurs personnes sont mentionnées, extrais la personne PRINCIPALE. Les autres sont des relations.

Source : {source_type}
Données : {raw_payload}
Résumé du triage : {summary}

Réponds UNIQUEMENT en JSON valide :
{
  "entity": { "entity_type": "client|lead|client_segment", "name": "...", "attributes": { "company": "...", "segment": "...", "estimated_revenue": "...", "source": "...", "status": "...", "interactions": [...], "pain_points": [...], "offer_interest": "..." } },
  "business_facts": [
    { "fact_type": "...", "fact_text": "...", "domain": "client", "confidence_score": 0.0-1.0 }
  ],
  "relationships": [
    { "relation_type": "interested_in|acquired_via|testimonial_for", "target_description": "..." }
  ]
}`;

const METRIQUE_PROMPT_TEMPLATE = `Tu es un assistant qui extrait des informations structurées depuis des documents business.

Ce document est classé "metrique" — il contient des chiffres de performance, des analytics, des données de revenus, des KPIs.

Contexte du fondateur : créateur de contenu B2B avec une chaîne YouTube (~700 abonnés, vidéos 10-30 min sur le storytelling business) et une présence LinkedIn active. Il vend du consulting/done-for-you (Machine à Revenus, 3000€). Les métriques qui comptent pour lui : vues YouTube, engagement LinkedIn (likes, commentaires, partages), taux de conversion contenu → appel stratégique, CA mensuel, nombre de clients actifs.

Extrais les informations suivantes :

1. L'entité métrique :
   - entity_type : "metric"
   - name : nom descriptif de la métrique (ex: "YouTube views mars 2026", "CA mensuel février 2026")
   - attributes (objet JSON) :
     - metric_type : "revenue", "content_performance", "conversion", "growth", "engagement", "cost", "retention"
     - value : la valeur numérique principale
     - unit : l'unité ("EUR", "views", "subscribers", "percent", "count", "hours")
     - period : la période couverte ("daily", "weekly", "monthly", "quarterly", "yearly", "snapshot")
     - period_start : date de début de période si connue (ISO8601)
     - period_end : date de fin de période si connue (ISO8601)
     - source_platform : d'où vient cette métrique ("youtube", "linkedin", "stripe", "manual", "hubspot")
     - trend : "up", "down", "stable", "unknown" — par rapport à la période précédente si mentionné
     - comparison_value : valeur de la période précédente si mentionnée

2. Les faits business déduits :
   - La métrique principale et sa signification pour le business
   - Les tendances détectées (croissance, stagnation, baisse)
   - Les corrélations mentionnées (ex: "les vidéos storytelling performent 2x mieux")
   - Les objectifs mentionnés et l'écart avec le réel

3. Les relations :
   - Cette métrique est-elle liée à un contenu spécifique (ex: vues d'une vidéo) ?
   - Cette métrique est-elle liée à une offre (ex: CA de Machine à Revenus) ?
   - Cette métrique influence-t-elle une décision stratégique ?

Règles :
- fact_type pour les métriques : "metric_snapshot", "metric_trend", "metric_correlation", "metric_vs_objective"
- Si le document contient PLUSIEURS métriques, extrais la métrique la plus importante comme entité principale. Les autres sont des faits.
- Toujours inclure la date ou période si disponible. Une métrique sans date a peu de valeur.
- confidence_score plus élevé si la source est explicite (ex: capture YouTube Analytics = 0.95) vs estimation vague (= 0.5).

Source : {source_type}
Données : {raw_payload}
Résumé du triage : {summary}

Réponds UNIQUEMENT en JSON valide :
{
  "entity": { "entity_type": "metric", "name": "...", "attributes": { "metric_type": "...", "value": 0, "unit": "...", "period": "...", "period_start": "...", "period_end": "...", "source_platform": "...", "trend": "...", "comparison_value": null } },
  "business_facts": [
    { "fact_type": "...", "fact_text": "...", "domain": "metrique", "confidence_score": 0.0-1.0 }
  ],
  "relationships": [
    { "relation_type": "measures|influences|tracks", "target_description": "..." }
  ]
}`;

const PROCESS_PROMPT_TEMPLATE = `Tu es un assistant qui extrait des informations structurées depuis des documents business.

Ce document est classé "process" — il décrit une méthode de travail, un workflow, un template, un SOP, une habitude ou routine du fondateur.

Contexte du fondateur : il a un workflow YouTube structuré (Idée → Script → Prêt à filmer → Filmé → Montage → Publié), un guide d'écriture documenté, un process commercial pour son offre (appel stratégique 30 min → proposition → kick-off → build J+7 à J+45 → livraison J+45 à J+60). Il catégorise son contenu en 3 types : Reach (audience large), Lead Gen (qualifie vers l'offre), Branding (connexion personnelle). Il utilise Notion, YouTube, LinkedIn, Windsurf/Codex pour coder, Supabase.

Extrais les informations suivantes :

1. L'entité process :
   - entity_type : "process"
   - name : nom descriptif du process (ex: "Workflow création vidéo YouTube", "Process commercial Machine à Revenus")
   - attributes (objet JSON) :
     - process_type : "creation", "commercial", "delivery", "operational", "technical", "communication"
     - steps : tableau ordonné des étapes [{"step_number": 1, "name": "...", "description": "..."}]
     - tools : tableau des outils utilisés dans ce process ["Notion", "YouTube Studio", "Windsurf"]
     - frequency : à quelle fréquence ce process est exécuté ("daily", "weekly", "per_project", "per_client", "ad_hoc")
     - owner : qui exécute ce process ("mehdi", "team", "automated", "client")
     - duration : durée estimée si mentionnée (ex: "60 jours" pour le delivery Machine à Revenus)
     - status : "active", "draft", "deprecated"

2. Les faits business déduits :
   - Les étapes clés et leur ordre
   - Les outils et leur rôle dans le process
   - Les goulots d'étranglement ou points de friction mentionnés
   - Les améliorations récentes ou prévues
   - Les conventions ou règles implicites

3. Les relations :
   - Ce process est-il lié à une offre (ex: process de livraison de Machine à Revenus) ?
   - Ce process produit-il du contenu (ex: workflow YouTube → vidéos) ?
   - Ce process a-t-il évolué suite à une décision stratégique ?

Règles :
- fact_type pour les process : "process_step", "process_tool", "process_bottleneck", "process_improvement", "process_convention"
- Si le document décrit un TEMPLATE (pas un process actif), mentionner status = "draft" et fact_type = "process_template".
- Si le document contient plusieurs process, extrais le process PRINCIPAL. Les autres sont des relations ou des faits.
- Les étapes doivent être ordonnées. Si l'ordre n'est pas explicite, déduire l'ordre logique.

Source : {source_type}
Données : {raw_payload}
Résumé du triage : {summary}

Réponds UNIQUEMENT en JSON valide :
{
  "entity": { "entity_type": "process", "name": "...", "attributes": { "process_type": "...", "steps": [{"step_number": 1, "name": "...", "description": "..."}], "tools": [...], "frequency": "...", "owner": "...", "duration": "...", "status": "active|draft|deprecated" } },
  "business_facts": [
    { "fact_type": "...", "fact_text": "...", "domain": "process", "confidence_score": 0.0-1.0 }
  ],
  "relationships": [
    { "relation_type": "delivers|produces|evolved_from", "target_description": "..." }
  ]
}`;

const GENERIC_PROMPT_TEMPLATE = `Tu es un assistant qui extrait des informations structurées depuis des documents business.

Ce document est classé dans la catégorie "autre" — il est pertinent pour le business mais ne rentre pas dans les catégories spécifiques (contenu, offre, client, stratégie, métrique, process).

Source : {source_type}
Données : {raw_payload}
Résumé du triage : {summary}

Réponds UNIQUEMENT en JSON valide :
{
  "entity": { "entity_type": "...", "name": "...", "attributes": {} },
  "business_facts": [
    { "fact_type": "...", "fact_text": "...", "domain": "contenu|offre|client|strategie|metrique|process", "confidence_score": 0.0-1.0 }
  ],
  "relationships": [
    { "relation_type": "mentions|promotes|references", "target_description": "..." }
  ]
}`;

// =============================================================================
// HELPERS
// =============================================================================

type CanonicalEntity = {
  sourceEntityType: 'content_item' | 'offer' | 'entity';
  sourceEntityId: string;
};

function buildPrompt(template: string, rawDoc: RawDocumentInput, summary: string): string {
  return template
    .replace('{source_type}', rawDoc.source_type)
    .replace('{raw_payload}', JSON.stringify(rawDoc.raw_payload))
    .replace('{summary}', summary);
}

function getPromptForCategory(category: string): string {
  switch (category) {
    case 'contenu': return CONTENT_PROMPT_TEMPLATE;
    case 'offre': return OFFER_PROMPT_TEMPLATE;
    case 'strategie': return STRATEGIE_PROMPT_TEMPLATE;
    case 'client': return CLIENT_PROMPT_TEMPLATE;
    case 'metrique': return METRIQUE_PROMPT_TEMPLATE;
    case 'process': return PROCESS_PROMPT_TEMPLATE;
    default: return GENERIC_PROMPT_TEMPLATE;
  }
}

function getSchemaForCategory(category: string) {
  switch (category) {
    case 'contenu': return ContentExtractionSchema;
    case 'offre': return OfferExtractionSchema;
    default: return GenericExtractionSchema;
  }
}

// =============================================================================
// UPSERT FUNCTIONS
// =============================================================================

async function upsertContentItem(rawDocId: string, payload: ContentExtraction['content_item']): Promise<CanonicalEntity> {
  const { data, error } = await (supabase as any)
    .from('content_items')
    .upsert(
      {
        raw_document_id: rawDocId,
        title: payload.title,
        platform: payload.platform,
        url: payload.url ?? null,
        publish_date: payload.publish_date ?? null,
        topic: payload.topic ?? null,
        summary: payload.summary,
        tags: payload.tags,
      },
      { onConflict: 'raw_document_id' },
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Failed to upsert content item');
  }

  return { sourceEntityType: 'content_item', sourceEntityId: data.id };
}

async function upsertOffer(rawDocId: string, payload: OfferExtraction['offer']): Promise<CanonicalEntity> {
  const { data, error } = await (supabase as any)
    .from('offers')
    .upsert(
      {
        raw_document_id: rawDocId,
        name: payload.name,
        description: payload.description ?? null,
        price: payload.price ?? null,
        currency: payload.currency,
        target_audience: payload.target_audience ?? null,
        sales_model: payload.sales_model ?? null,
        status: payload.status,
      },
      { onConflict: 'raw_document_id' },
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Failed to upsert offer');
  }

  return { sourceEntityType: 'offer', sourceEntityId: data.id };
}

async function upsertEntity(rawDocId: string, payload: GenericExtraction['entity']): Promise<CanonicalEntity> {
  const { data, error } = await (supabase as any)
    .from('entities')
    .upsert(
      {
        raw_document_id: rawDocId,
        entity_type: payload.entity_type,
        name: payload.name ?? null,
        attributes: payload.attributes,
      },
      { onConflict: 'raw_document_id' },
    )
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Failed to upsert entity');
  }

  return { sourceEntityType: 'entity', sourceEntityId: data.id };
}

// =============================================================================
// BUSINESS FACTS — Change detection (Doc 06, Étape 3)
// =============================================================================

async function upsertBusinessFactWithChangeDetection(
  sourceEntityType: string,
  sourceEntityId: string,
  fact: { fact_type: string; fact_text: string; domain: string; confidence_score: number },
): Promise<void> {
  const { data: existing, error: existingError } = await (supabase as any)
    .from('business_facts')
    .select('id,fact_text')
    .eq('domain', fact.domain)
    .eq('source_entity_type', sourceEntityType)
    .eq('source_entity_id', sourceEntityId)
    .eq('fact_type', fact.fact_type)
    .is('valid_until', null)
    .limit(1)
    .single();

  if (existingError && existingError.code !== 'PGRST116') {
    throw new Error(existingError.message);
  }

  const now = new Date().toISOString();

  if (existing?.id) {
    if (existing.fact_text === fact.fact_text) {
      return; // Idempotence — même fait, on ne fait rien
    }

    // Fait différent → fermer l'ancien
    await (supabase as any)
      .from('business_facts')
      .update({ valid_until: now })
      .eq('id', existing.id);
  }

  // Insérer le nouveau fait
  await (supabase as any).from('business_facts').insert({
    fact_type: fact.fact_type,
    fact_text: fact.fact_text,
    domain: fact.domain,
    source_entity_type: sourceEntityType,
    source_entity_id: sourceEntityId,
    confidence_score: fact.confidence_score,
    valid_from: now,
    valid_until: null,
  });
}

// =============================================================================
// RELATIONSHIPS
// =============================================================================

async function insertRelationships(
  sourceEntityType: string,
  sourceEntityId: string,
  relationships: Array<{ relation_type: string; target_description: string }>,
): Promise<void> {
  for (const relation of relationships) {
    await (supabase as any).from('relationship_edges').insert({
      source_entity_type: sourceEntityType,
      source_entity_id: sourceEntityId,
      relation_type: relation.relation_type,
      target_description: relation.target_description,
    });
  }
}

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

export async function extractDocument(rawDoc: RawDocumentInput, triageResult: TriageInput) {
  try {
    const category = triageResult.business_category;
    const prompt = buildPrompt(getPromptForCategory(category), rawDoc, triageResult.summary);
    const zodSchema = getSchemaForCategory(category);

    if (category === 'contenu') {
      const extraction = await callClaude({
        model: 'sonnet',
        prompt,
        zodSchema: ContentExtractionSchema,
        maxRetries: 2,
      });

      const canonical = await upsertContentItem(rawDoc.id, extraction.content_item);

      for (const fact of extraction.business_facts) {
        await upsertBusinessFactWithChangeDetection(canonical.sourceEntityType, canonical.sourceEntityId, fact);
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
        await upsertBusinessFactWithChangeDetection(canonical.sourceEntityType, canonical.sourceEntityId, fact);
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
      await upsertBusinessFactWithChangeDetection(canonical.sourceEntityType, canonical.sourceEntityId, fact);
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