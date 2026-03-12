# AUDIT TEMPORALITE BML

Date audit: 2026-03-11
Projet Supabase: `aplwrufybkrndjjyapmt`
Mode: lecture seule (aucune modification applicative)

---

## SECTION 1 — STRUCTURE ACTUELLE DES TABLES (schéma réel)

### 1) `business_facts`

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| fact_type | text | NO | null |
| fact_text | text | NO | null |
| domain | text | NO | null |
| source_entity_type | text | NO | null |
| source_entity_id | uuid | NO | null |
| confidence_score | double precision | YES | 0.0 |
| valid_from | timestamp with time zone | YES | now() |
| valid_until | timestamp with time zone | YES | null |
| needs_review | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

### 2) `raw_documents`

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| source_type | text | NO | null |
| source_object_id | text | NO | null |
| sync_run_id | uuid | YES | null |
| raw_payload | jsonb | NO | null |
| relevance_score | double precision | YES | null |
| business_category | text | YES | null |
| processing_status | text | NO | 'ingested'::text |
| summary | text | YES | null |
| ingested_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### 3) `content_items`

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| raw_document_id | uuid | YES | null |
| title | text | NO | null |
| platform | text | NO | null |
| url | text | YES | null |
| publish_date | timestamp with time zone | YES | null |
| topic | text | YES | null |
| summary | text | YES | null |
| tags | ARRAY | YES | '{}'::text[] |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### 4) `entities`

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| raw_document_id | uuid | YES | null |
| entity_type | text | NO | null |
| name | text | YES | null |
| attributes | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### 5) `memory_chunks`

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| entity_type | text | NO | null |
| entity_id | uuid | NO | null |
| chunk_text | text | NO | null |
| chunk_index | integer | NO | 0 |
| token_count | integer | YES | null |
| embedding | USER-DEFINED | YES | null |
| created_at | timestamp with time zone | YES | now() |
| content_hash | text | YES | null |

---

## SECTION 2 — ÉTAT DES DONNÉES TEMPORELLES

### 6) Nombre de `business_facts` actifs par domaine

| domain | count |
|---|---:|
| strategie | 274 |
| contenu | 197 |
| process | 143 |
| metrique | 79 |
| client | 30 |
| offre | 27 |

### 7) Distribution `valid_from` des `business_facts` actifs

| day | count |
|---|---:|
| 2026-03-10 | 700 |
| 2026-03-11 | 50 |

Observation: très forte concentration sur les dates d’ingestion/extraction récentes.

### 8) Lien vers contenu source (`source_entity_type`)

| source_entity_type | count |
|---|---:|
| content_item | 525 |
| entity | 218 |
| offer | 7 |

Observation: la majorité des facts pointent vers `content_item`, ce qui donne un point d’ancrage exploitable pour récupérer une date de publication.

### 9) État `publish_date` sur `content_items`

- `total`: 101
- `with_publish_date`: 73
- `without_publish_date`: 28
- `oldest_publish_date`: 2023-07-18 08:00:01.087+00
- `newest_publish_date`: 2026-03-10 13:31:00+00

### 10) Distribution `publish_date` (`LIMIT 30` demandé)

Requête exécutée telle que fournie (tri ascendant + `LIMIT 30`) => retourne les 30 jours les plus anciens:

- 2023-07-18 (1)
- 2023-07-26 (1)
- 2023-08-01 (1)
- 2023-08-16 (1)
- 2023-08-17 (1)
- 2023-08-31 (1)
- 2023-09-05 (1)
- 2023-10-17 (1)
- 2024-01-30 (1)
- 2024-05-28 (1)
- 2024-10-01 (1)
- 2024-12-23 (1)
- 2025-01-27 (1)
- 2025-02-05 (1)
- 2025-02-17 (1)
- 2025-02-24 (1)
- 2025-03-21 (1)
- 2025-03-26 (1)
- 2025-04-06 (1)
- 2025-05-04 (1)
- 2025-05-22 (1)
- 2025-08-21 (1)
- 2025-08-22 (2)
- 2025-08-23 (1)
- 2025-08-24 (1)
- 2025-09-04 (1)
- 2025-09-05 (1)
- 2025-09-08 (1)
- 2025-09-10 (1)
- 2025-09-18 (1)

### 11) Colonnes date/publish/created dans `raw_documents`

La requête fournie a été exécutée **exactement**. Elle est trop large à cause de la priorité des `OR` et remonte des colonnes de multiples tables système.

Résultat brut (extrait): nombreuses occurrences de `created_at`, `created_by`, `published_at`, `publish_date`, etc.

Interprétation utile pour `raw_documents` (croisée avec Section 1):
- `raw_documents` ne contient pas de colonne dédiée `publish_date`/`content_date`/`created_at_source`.
- Seules dates natives table: `ingested_at`, `updated_at`.

### 12) État pipeline par source

La requête demandée avec `source` échoue (`column "source" does not exist`).
Résultat équivalent exécuté avec `source_type as source`:

| source | processing_status | count |
|---|---|---:|
| claude_memory | canonicalized | 7 |
| linkedin | canonicalized | 29 |
| linkedin | skipped | 35 |
| notion | canonicalized | 95 |
| notion | ingested | 6 |
| notion | skipped | 5 |
| youtube | canonicalized | 22 |

### 13) Exemples `business_facts` restauration

20 lignes retournées (sample). Points saillants:
- Facts liés à des contenus LinkedIn de restauration/live shopping/dark kitchen.
- `valid_from` majoritairement en mars 2026 (date de traitement), y compris pour des contenus publiés en 2023/2025.
- `source_entity_type` = `content_item` pour les exemples retournés.

### 14) `fact_created` vs `content_published` (facts restauration)

Exemples retournés:
- Fact créé `2026-03-10`, contenu publié `2025-03-21`.
- Fact créé `2026-03-10`, contenu publié `2023-10-17`.
- Fact créé `2026-03-10`, contenu publié `2023-08-31`.

Conclusion directe: les faits héritent d’une temporalité d’ingestion/extraction (`valid_from`) et non de la temporalité du contenu source.

---

## SECTION 3 — ANALYSE DU PIPELINE D’EXTRACTION

### 1) `src/pipeline/orchestrator.ts`

- Le pipeline lit `raw_documents` avec `id, source_type, raw_payload, business_category, summary`.
- Aucune date explicite de contenu (`publish_date`/`createdAt`) n’est propagée comme champ de contexte dédié vers triage/extraction.
- La date n’existe que potentiellement dans `raw_payload` brut (si connecteur l’y a mise).

### 2) `src/pipeline/triage.ts`

- Le prompt inclut `Source` + `raw_payload` JSON complet.
- Pas de champ date explicite demandé dans la sortie triage (`TriageResultSchema`), seulement `relevance_score`, `business_category`, `summary`.

### 3) `src/pipeline/extraction.ts`

- Le prompt inclut aussi `raw_payload` JSON complet.
- En catégorie `contenu`, `ContentExtractionSchema` accepte `content_item.publish_date`.
- Stockage: `upsertContentItem` écrit `publish_date` dans `content_items`.
- **Mais** `upsertBusinessFactWithChangeDetection` n’utilise pas cette date; il force `valid_from = now()`.

### 4) `src/connectors/youtube.ts`

- Oui, `video.snippet.publishedAt` est stocké dans `raw_payload.publishedAt`.

### 5) `src/connectors/linkedin.ts`

- Oui, la date est stockée dans `raw_payload.createdAt` (timestamp ms) via `resolveCreatedAt`.

### 6) `src/connectors/notion.ts`

- `last_edited_time` est stocké en `raw_payload.lastEditedTime`.
- `created_time` n’est pas explicitement stocké.

---

## SECTION 4 — ANALYSE DES SCHÉMAS ZOD

### 1) `ContentExtractionSchema`

- Oui, champ `content_item.publish_date?: string` présent.

### 2) `OfferExtractionSchema`

- Pas de champ date natif pour l’offre.

### 3) `GenericExtractionSchema`

- Pas de champ date structuré au niveau racine.
- Des dates peuvent exister en `entity.attributes` libre, sans contrat fort.

### 4) `TriageResultSchema`

- Aucun champ date.

---

## SECTION 5 — DIAGNOSTIC

### 1) Où la date du contenu original est perdue

La perte utile se fait au moment de l’upsert des facts:
- `src/pipeline/extractionUpserts.ts` -> `upsertBusinessFactWithChangeDetection`
- `valid_from` est systématiquement positionné à `now()`.
- Aucune propagation de la date source (`content_items.publish_date` ou date dans `raw_payload`) vers `business_facts`.

### 2) Ce qui existe déjà

- `content_items.publish_date` existe et est renseigné sur 73/101 contenus.
- Les connecteurs stockent des dates dans `raw_payload`:
  - YouTube: `publishedAt`
  - LinkedIn: `createdAt`
  - Notion: `lastEditedTime`
- `business_facts` possède déjà `valid_from`/`valid_until`.

### 3) Ce qui manque

- Un champ explicite de temporalité source sur `business_facts`.
- Une logique de propagation de la date source au moment de création des facts.
- Une stratégie fallback cohérente quand la date source est absente/invalide.

### 4) Proposition de solution (migration SQL + pipeline)

#### Migration SQL (additive)

Objectif: distinguer la date business du fait et la date de publication source.

```sql
ALTER TABLE public.business_facts
ADD COLUMN source_content_published_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_business_facts_source_content_published_at
ON public.business_facts (source_content_published_at);
```

Backfill initial recommandé:

```sql
UPDATE public.business_facts bf
SET source_content_published_at = ci.publish_date
FROM public.content_items ci
WHERE bf.source_entity_type = 'content_item'
  AND bf.source_entity_id = ci.id
  AND bf.source_content_published_at IS NULL;
```

#### Modifications pipeline recommandées

1. Introduire une résolution de date source par fact:
   - si `source_entity_type = content_item` => utiliser `content_items.publish_date`
   - sinon fallback sur date normalisée dans `raw_payload` (`publishedAt`, `createdAt`, `lastEditedTime`)
   - sinon `NULL`

2. Adapter `upsertBusinessFactWithChangeDetection` pour insérer aussi `source_content_published_at`.

3. Conserver `valid_from` comme date de versioning système (ingestion/changement), **pas** comme date de publication.

4. Côté dashboard/query:
   - utiliser d’abord `source_content_published_at` pour la fraîcheur business,
   - fallback sur `valid_from` uniquement si `source_content_published_at` est null.

5. (Optionnel mais recommandé) Renforcer le contrat extraction:
   - garder `content_item.publish_date` obligatoire pour catégorie `contenu` quand disponible,
   - ajouter normalisation date centralisée (ISO) avant upsert.

---

## Notes d’exécution

- MCP Supabase a fonctionné en séquentiel.
- Requête 11 exécutée telle que demandée (mais syntaxe large).
- Requête 12 corrigée (`source_type as source`) car colonne `source` absente.
- Audit réalisé en lecture seule; aucun fichier applicatif modifié.
