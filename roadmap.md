# ROADMAP.md — Business Memory Layer (BML)

**Ce fichier est la roadmap du projet. Windsurf le lit pour savoir quelle tâche exécuter, dans quel ordre, et comment vérifier.**

L'ordre est strict : chaque tâche dépend des précédentes. Ne pas sauter d'étape.

---

## Tâche 1 — Setup projet Next.js + Supabase

**Prérequis :** Aucun (première tâche)
**Doc de référence :** AGENTS.md pour la structure

**Ce que l'agent doit faire :**
1. Créer un projet Next.js avec App Router (`npx create-next-app@latest bml --typescript --app`)
2. Installer les dépendances : `@supabase/supabase-js`, `zod`, `@anthropic-ai/sdk`, `openai`
3. Créer la structure de dossiers exacte du AGENTS.md (`/src/lib`, `/src/connectors`, `/src/pipeline`, etc.)
4. Créer `/src/lib/supabase.ts` avec le client Supabase initialisé depuis les env vars
5. Créer `.env.local.example` avec toutes les variables nécessaires
6. AGENTS.md doit être à la racine du repo

**Fichiers à créer :** `/src/lib/supabase.ts`, `.env.local.example`, structure de dossiers
**Critères de succès :** Le projet compile (`npm run build`), la structure correspond au AGENTS.md, le client Supabase s'initialise sans erreur avec les bonnes env vars.
**Estimation :** 30 min

---

## Tâche 2 — Exécuter les migrations SQL

**Prérequis :** Tâche 1
**Doc de référence :** Le fichier `/supabase/migrations/001_initial_schema.sql`

**Ce que l'agent doit faire :**
1. Créer `/supabase/migrations/001_initial_schema.sql` avec le schéma SQL complet (11 tables, pgvector, index)
2. Exécuter le SQL dans Supabase (via MCP Server Supabase ou Supabase CLI)
3. Vérifier que les 11 tables existent et que l'extension pgvector est active
4. Vérifier que les index sont créés (notamment l'index HNSW sur memory_chunks)

**Fichiers à créer :** `/supabase/migrations/001_initial_schema.sql`
**Critères de succès :** Les 11 tables existent dans Supabase, `SELECT * FROM source_connections` retourne un résultat vide sans erreur, `CREATE EXTENSION IF NOT EXISTS vector` ne lève pas d'erreur.
**Estimation :** 20 min

---

## Tâche 3 — Créer les schémas Zod

**Prérequis :** Tâche 1
**Doc de référence :** Le SQL du Doc 04 pour les types, Doc 06 pour les schémas d'extraction

**Ce que l'agent doit faire :**
1. Créer `/src/schemas/rawDocument.ts` — schéma Zod pour raw_documents
2. Créer `/src/schemas/contentItem.ts` — schéma pour content_items
3. Créer `/src/schemas/offer.ts` — schéma pour offers
4. Créer `/src/schemas/entity.ts` — schéma pour entities
5. Créer `/src/schemas/businessFact.ts` — schéma pour business_facts
6. Créer `/src/schemas/triage.ts` — schéma TriageResultSchema
7. Créer `/src/schemas/extraction.ts` — schémas ContentExtractionSchema, OfferExtractionSchema, GenericExtractionSchema
8. Créer `/src/schemas/api.ts` — schémas d'input pour les endpoints API

**Fichiers à créer :** 8 fichiers dans `/src/schemas/`
**Critères de succès :** Tous les fichiers compilent sans erreur TypeScript, un test rapide avec `schema.parse({...})` valide et rejette correctement.
**Estimation :** 45 min

---

## Tâche 4 — Connecteur YouTube : sync + raw_documents

**Prérequis :** Tâches 1, 2, 3
**Doc de référence :** Doc 05 (section YouTube dans Notion)

**Ce que l'agent doit faire :**
1. Installer `googleapis` et `google-auth-library`
2. Créer `/src/connectors/youtube.ts` avec la fonction `syncYouTube()`
3. Implémenter la sync incrémentale : lire le cursor depuis sync_runs, appeler YouTube API, upsert dans raw_documents
4. Gérer le refresh token OAuth
5. Créer une entrée sync_runs après chaque sync
6. Écrire un test Vitest qui mock l'API YouTube et vérifie l'upsert

**Fichiers à créer :** `/src/connectors/youtube.ts`, `/tests/connectors/youtube.test.ts`
**Critères de succès :** Le test passe, l'upsert est idempotent (lancer 2 fois ne crée pas de doublon), sync_runs contient une entrée avec le bon statut.
**Estimation :** 1h30

---

## Tâche 5 — Connecteur LinkedIn : sync + raw_documents

**Prérequis :** Tâches 1, 2, 3
**Doc de référence :** Doc 05 (section LinkedIn dans Notion)

**Ce que l'agent doit faire :**
1. Installer `linkedin-api-client`
2. Créer `/src/connectors/linkedin.ts` avec la fonction `syncLinkedIn()`
3. Implémenter la sync : récupérer les posts du profil, upsert dans raw_documents
4. Gérer les headers obligatoires (`Linkedin-Version`, `X-Restli-Protocol-Version`)
5. Créer une entrée sync_runs
6. Test Vitest avec mock

**Fichiers à créer :** `/src/connectors/linkedin.ts`, `/tests/connectors/linkedin.test.ts`
**Critères de succès :** Mêmes critères que YouTube (test passe, idempotence, sync_runs OK).
**Estimation :** 1h30

---

## Tâche 6 — Connecteur Notion : sync + raw_documents

**Prérequis :** Tâches 1, 2, 3
**Doc de référence :** Doc 05 (section Notion dans Notion)

**Ce que l'agent doit faire :**
1. Installer `@notionhq/client` (v5+)
2. Créer `/src/connectors/notion.ts` avec la fonction `syncNotion()`
3. Implémenter la sync incrémentale par `last_edited_time`
4. Extraire le contenu des blocs récursivement (blocks enfants, toggles, etc.)
5. Créer un helper `/src/lib/notionBlocksToText.ts` pour convertir les blocs Notion en texte brut
6. Test Vitest avec mock

**Fichiers à créer :** `/src/connectors/notion.ts`, `/src/lib/notionBlocksToText.ts`, `/tests/connectors/notion.test.ts`
**Critères de succès :** Test passe, les blocs Notion sont convertis en texte lisible, idempotence OK.
**Estimation :** 2h

---

## Tâche 7 — Pipeline triage : scoring + catégorisation

**Prérequis :** Tâches 1, 2, 3, au moins un connecteur (4, 5, ou 6)
**Doc de référence :** Doc 06 (étape 1 — triage dans Notion)

**Ce que l'agent doit faire :**
1. Créer `/src/pipeline/triage.ts`
2. Implémenter `triageDocument(rawDoc)` : appelle Claude Haiku avec le prompt du Doc 06
3. Valider la réponse avec `TriageResultSchema`
4. Mettre à jour `raw_documents` avec le score, la catégorie, le résumé, et le statut
5. Implémenter le batching : `triageBatch(rawDocs[])` qui traite un tableau
6. Implémenter le fallback Zod (retry avec prompt correctif)
7. Créer `/src/lib/claude.ts` avec un wrapper réutilisable pour les appels Claude (timeout 60s, retry 2x, validation Zod)
8. Test Vitest

**Fichiers à créer :** `/src/pipeline/triage.ts`, `/src/lib/claude.ts`, `/tests/pipeline/triage.test.ts`
**Critères de succès :** Un document test est trié avec un score et une catégorie valides, le fallback Zod fonctionne, le statut est mis à jour en base.
**Estimation :** 1h30

---

## Tâche 8 — Pipeline extraction : entités + faits + détection de changements

**Prérequis :** Tâches 1-3, 7
**Doc de référence :** Doc 06 (étapes 2 et 3 dans Notion)

**Ce que l'agent doit faire :**
1. Créer `/src/pipeline/extraction.ts`
2. Implémenter `extractDocument(rawDoc, triageResult)` : appelle Claude Sonnet avec le prompt adapté à la catégorie
3. Valider avec le bon schéma Zod selon la catégorie
4. Insérer dans les tables canoniques (content_items, offers, entities) avec le `raw_document_id`
5. Insérer les faits dans business_facts avec la logique de détection de changements
6. Insérer les relations dans relationship_edges
7. Mettre à jour `raw_documents.processing_status = 'canonicalized'`
8. Test Vitest

**Fichiers à créer :** `/src/pipeline/extraction.ts`, `/tests/pipeline/extraction.test.ts`
**Critères de succès :** Un document trié produit des entités et faits en base, la détection de changements fonctionne (un prix modifié crée un nouveau fait et ferme l'ancien), le statut passe à canonicalized.
**Estimation :** 2h

---

## Tâche 9 — Pipeline embedding : chunking + vectorisation

**Prérequis :** Tâches 1-3, 8
**Doc de référence :** Doc 06 (étape 4 dans Notion)

**Ce que l'agent doit faire :**
1. Créer `/src/pipeline/embedding.ts`
2. Implémenter `chunkAndEmbed(entityType, entityId, text)` : découper le texte, générer les embeddings via OpenAI, insérer dans memory_chunks
3. Créer `/src/lib/chunker.ts` avec les fonctions de découpage par type
4. Créer `/src/lib/openai.ts` avec le client OpenAI et la fonction `generateEmbedding(text)`
5. Test Vitest

**Fichiers à créer :** `/src/pipeline/embedding.ts`, `/src/lib/chunker.ts`, `/src/lib/openai.ts`, `/tests/pipeline/embedding.test.ts`
**Critères de succès :** Un texte de 3000 tokens est découpé en chunks corrects, chaque chunk a un embedding de 1536 dimensions en base, le chunk_index est correct.
**Estimation :** 1h30

---

## Tâche 10 — Endpoint POST /api/memory/search

**Prérequis :** Tâches 1-3, 9
**Doc de référence :** Doc 07 (endpoint 1 dans Notion)

**Ce que l'agent doit faire :**
1. Créer `/app/api/memory/search/route.ts`
2. Implémenter la recherche hybride (pgvector + full-text)
3. Valider l'input avec le schéma Zod
4. Test Vitest

**Fichiers à créer :** `/app/api/memory/search/route.ts`, `/tests/api/memorySearch.test.ts`
**Critères de succès :** Un POST avec un query retourne des résultats pertinents avec score, les filtres fonctionnent, erreur 400 si query vide.
**Estimation :** 1h

---

## Tâche 11 — Endpoint GET /api/business-summary

**Prérequis :** Tâches 1-3, 8
**Doc de référence :** Doc 07 (endpoint 2 dans Notion)

**Ce que l'agent doit faire :**
1. Créer `/app/api/business-summary/route.ts`
2. Implémenter le groupement de faits par domaine
3. Test Vitest

**Fichiers à créer :** `/app/api/business-summary/route.ts`, `/tests/api/businessSummary.test.ts`
**Critères de succès :** Le GET retourne des faits groupés par domaine, le filtre domain fonctionne, total_active_facts est correct.
**Estimation :** 45 min

---

## Tâche 12 — Endpoint POST /api/context/build

**Prérequis :** Tâches 1-3, 9, 10
**Doc de référence :** Doc 07 (endpoint 3 dans Notion)

**Ce que l'agent doit faire :**
1. Créer `/app/api/context/build/route.ts`
2. Implémenter l'assemblage de contexte avec retrieval hybride + résumé LLM si nécessaire
3. Test Vitest

**Fichiers à créer :** `/app/api/context/build/route.ts`, `/tests/api/contextBuild.test.ts`
**Critères de succès :** Un POST avec un goal retourne un contexte assemblé, le token_count est respecté, le résumé LLM se déclenche si le contexte est trop long.
**Estimation :** 1h30

---

## Tâche 13 — Endpoints restants (entity + sync status)

**Prérequis :** Tâches 1-3, 8
**Doc de référence :** Doc 07 (endpoints 4 et 5 dans Notion)

**Ce que l'agent doit faire :**
1. Créer `/app/api/entity/[type]/[id]/route.ts`
2. Créer `/app/api/sync/status/route.ts`
3. Tests pour les deux

**Fichiers à créer :** 2 route.ts + 2 tests
**Critères de succès :** GET entity retourne l'entité + faits + relations, 404 si non trouvé. GET sync/status retourne l'état par source.
**Estimation :** 1h

---

## Tâche 14 — Cron orchestrateur + test end-to-end

**Prérequis :** Toutes les tâches précédentes
**Doc de référence :** Docs 05, 06 dans Notion

**Ce que l'agent doit faire :**
1. Créer `/app/api/cron/sync/route.ts` qui orchestre le pipeline complet : sync → triage → extraction → embedding
2. Configurer le cron dans Vercel (ou Supabase Edge Functions)
3. Test end-to-end : insérer une vidéo YouTube de test, vérifier qu'elle traverse tout le pipeline jusqu'aux embeddings et faits
4. Vérifier l'idempotence : relancer le cron ne crée pas de doublons

**Fichiers à créer :** `/app/api/cron/sync/route.ts`, `/tests/e2e/pipeline.test.ts`
**Critères de succès :** Le pipeline complet tourne sans erreur, un contenu test passe de raw_document à content_item + business_facts + memory_chunks, le cron est idempotent.
**Estimation :** 2h

---

## Tâche 15 (OPTIONNEL) — Connecteur Google Drive

**Prérequis :** Tâches 1-3
**Doc de référence :** Doc 05 (section Google Drive dans Notion)
**Si le temps le permet.** Même pattern que les autres connecteurs.
**Estimation :** 1h30

---

## Estimation totale

Tâches 1-14 : environ 16-18 heures de sessions d'agent IA.
Avec les itérations et le débug : prévoir 25-30 heures au total.
Soit environ 5-7 jours de travail focusé.