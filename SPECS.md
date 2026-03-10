# SPECS.md — Business Memory Layer — Spécifications techniques

**Ce fichier contient les specs techniques détaillées. Windsurf DOIT le lire avant de coder les tâches 4 à 14.**
**Ne jamais inventer de valeurs, catégories, ou structures qui ne sont pas dans ce fichier.**

---

## Catégories business (utilisées PARTOUT dans le projet)

Ces catégories sont en FRANÇAIS. Elles sont utilisées dans le triage, l'extraction, les faits, et l'API.

```
contenu, offre, client, strategie, metrique, process, autre
```

- `autre` est utilisé uniquement dans le triage (pas dans les faits ou l'API)
- Ne JAMAIS utiliser des catégories en anglais (pas de "content", "offer", "strategy", etc.)

---

## Connecteur YouTube (Tâche 4)

**SDK :** `googleapis` + `google-auth-library`
**Auth :** OAuth 2.0, scope `youtube.readonly`, refresh token dans env vars
**Sync incrémentale :** `youtube.search.list` avec `publishedAfter` = dernier cursor (date ISO 8601)
**Détails par vidéo :** `youtube.videos.list` (parts: snippet, statistics, contentDetails)
**Transcriptions :** `youtube.captions.list` puis `youtube.captions.download` si disponible

**source_object_id :** `youtube:video:{videoId}`

**Format raw_payload JSONB :**
```json
{
  "videoId": "abc123",
  "title": "Mon titre",
  "description": "...",
  "publishedAt": "2026-03-01T10:00:00Z",
  "statistics": { "viewCount": 1200, "likeCount": 45 },
  "duration": "PT12M30S",
  "tags": ["storytelling", "youtube"],
  "transcript": "texte complet si disponible"
}
```

**Rate limits :** 10 000 unités/jour. search.list = 100 unités, videos.list = 1 unité.
**Piège :** Les tokens OAuth Google expirent après 1h. Toujours utiliser le refresh token.

---

## Connecteur LinkedIn (Tâche 5)

**SDK :** `unipile-node-sdk`
**Auth :** Access Token Unipile + DSN
**Client :** `new UnipileClient(process.env.UNIPILE_DSN, process.env.UNIPILE_ACCESS_TOKEN)`
**Fichier client :** `/src/lib/unipile.ts`

**source_object_id :** `linkedin:post:{postUrn}`

**Format raw_payload JSONB :**
```json
{
  "postUrn": "urn:li:share:7123456789",
  "commentary": "Texte du post...",
  "createdAt": 1709290000000,
  "visibility": "PUBLIC",
  "contentType": "text",
  "engagement": { "likes": 34, "comments": 8, "shares": 2 }
}
```

**Sync incrémentale :** Stocker `createdAt` du dernier post dans sync_runs.cursor.

---

## Connecteur Notion (Tâche 6)

**SDK :** `@notionhq/client` v5+
**Auth :** Integration token (API key) dans `NOTION_TOKEN`
**Sync incrémentale :** `notion.search()` filtré par `last_edited_time` > cursor

**source_object_id :** `notion:page:{pageId}`

**Format raw_payload JSONB :**
```json
{
  "pageId": "31ecaa0d-8092-...",
  "title": "Mon document stratégie",
  "url": "https://notion.so/...",
  "lastEditedTime": "2026-03-09T18:00:00Z",
  "properties": {},
  "content": "Texte complet extrait des blocks..."
}
```

**Rate limits :** 3 requêtes/seconde. Ajouter un délai de 350ms entre les appels.
**Piège :** Les blocs imbriqués (toggle, callout) nécessitent des appels récursifs à `blocks.children.list()`.

---

## Pipeline Triage (Tâche 7)

**Modèle :** Claude Haiku
**Timeout :** 60 secondes
**Retry :** 2 fois avec backoff (1s → 3s)

### Prompt EXACT de triage

```
Tu es un assistant qui classe des documents business.

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
{"relevance_score": <number>, "business_category": "<string>", "summary": "<string>"}
```

### Logique post-triage

- Si `relevance_score > 0.5` → `processing_status = 'triaged'`, passer à l'extraction
- Si `relevance_score <= 0.5` → `processing_status = 'skipped'`
- Si Zod échoue → retry 1 fois avec prompt correctif, sinon `processing_status = 'extraction_failed'`

---

## Pipeline Extraction (Tâche 8)

**Modèle :** Claude Sonnet
**Timeout :** 60 secondes
**Un prompt par catégorie.**

### Prompt extraction catégorie "contenu"

```
Tu es un assistant qui extrait des informations structurées depuis des documents business.

Ce document est classé "contenu" (vidéo, post, article).

Extrais les informations suivantes dans le format JSON demandé :
1. L'objet contenu (titre, plateforme, URL, date, sujet, résumé, tags)
2. Les faits business déduits de ce contenu (positionnement, audience, performance, thèmes récurrents)
3. Les relations détectées (ce contenu mentionne-t-il une offre ? un client ? une stratégie ?)

Source : {source_type}
Données : {raw_payload en JSON}
Résumé du triage : {summary du triage}

Réponds UNIQUEMENT en JSON valide :
{
  "content_item": { "title": "...", "platform": "youtube|linkedin|blog|other", "url": "...", "publish_date": "ISO8601", "topic": "...", "summary": "...", "tags": ["..."] },
  "business_facts": [
    { "fact_type": "...", "fact_text": "...", "domain": "contenu|offre|client|strategie|metrique|process", "confidence_score": 0.0-1.0 }
  ],
  "relationships": [
    { "relation_type": "mentions|promotes|references", "target_description": "..." }
  ]
}
```

### Détection de changements (business_facts)

```
Pour chaque fait extrait :
  1. Chercher dans business_facts un fait existant avec :
     - même domain
     - même source_entity_type + source_entity_id
     - même fact_type
     - valid_until IS NULL (fait actif)

  2. Si trouvé ET fact_text différent :
     - UPDATE l'ancien : valid_until = now()
     - INSERT le nouveau : valid_from = now(), valid_until = NULL

  3. Si trouvé ET fact_text identique :
     - Ne rien faire (idempotence)

  4. Si non trouvé :
     - INSERT le nouveau fait
```

### Fallback Zod

Si validation échoue :
1. Retry avec : "Ta réponse précédente n'était pas du JSON valide. Voici l'erreur Zod : {error}. Corrige et renvoie uniquement du JSON valide."
2. Si retry échoue : `processing_status = 'extraction_failed'`, logger dans `sync_runs.error_log`
3. Ne JAMAIS insérer de données non validées

---

## Pipeline Embedding (Tâche 9)

**Modèle :** OpenAI `text-embedding-3-small` (1536 dimensions)

### Stratégie de chunking

- Transcripts YouTube : 1000-1500 tokens, 200 tokens chevauchement, découper sur les phrases
- Posts LinkedIn : un seul chunk (sauf si > 3000 caractères)
- Documents Notion : découper par headings (H1, H2), max 1500 tokens par chunk
- Business facts : embed individuellement, un fait = un chunk
- Offres : nom + description = un chunk

### Scoring hybride (retrieval)

- 70% similarité vectorielle (pgvector cosine)
- 30% full-text search (Postgres ts_vector + ts_query)
- Score final = 0.7 * vector_score + 0.3 * text_score
- Filtres SQL AVANT le scoring : entity_type, domain, date_range

---

## Context API (Tâches 10-13)

### POST /api/memory/search
- Pas d'appel LLM
- Input : query, filters (entity_type, domain, date_range), limit
- Output : résultats avec chunk_text, score, metadata

### GET /api/business-summary
- Pas d'appel LLM
- Input : ?domain= (optionnel)
- Output : faits actifs groupés par domaine

### POST /api/context/build
- Appel LLM possible (Claude Sonnet, timeout 60s) si contexte trop long
- Input : goal, include_domains, max_tokens, include_facts, include_chunks, include_metrics
- Output : contexte assemblé avec token_count

### GET /api/entity/:type/:id
- Pas d'appel LLM
- Output : entité + faits actifs + relations

### GET /api/sync/status
- Pas d'appel LLM
- Output : dernière sync par source avec stats

### Routes Next.js App Router

```
/app/api/memory/search/route.ts       → POST
/app/api/business-summary/route.ts    → GET
/app/api/context/build/route.ts       → POST
/app/api/entity/[type]/[id]/route.ts  → GET
/app/api/sync/status/route.ts         → GET
```