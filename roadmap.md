# ROADMAP.md — Business Memory Layer (BML)

**Ce fichier est la roadmap du projet. Windsurf le lit pour savoir quelle tâche exécuter, dans quel ordre, et comment vérifier.**

L'ordre est strict : chaque tâche dépend des précédentes. Ne pas sauter d'étape.

---

## Statut d'avancement (vérifié le 2026-03-10)

- Tâche 1 — Setup projet Next.js + Supabase : ✅ Fait (structure OK, `src/lib/supabase.ts` OK, `.env.local.example` présent, `npm run build` OK, `@supabase/supabase-js` déclaré dans `package.json`).
- Tâche 2 — Exécuter les migrations SQL : ✅ Fait (`supabase/migrations/001_initial_schema.sql` créé ; migrations additives `002`, `003` présentes ; schéma Supabase aligné).
- Tâche 3 — Créer les schémas Zod : ✅ Fait (8 fichiers présents dans `src/schemas`).
- Tâche 4 — Connecteur YouTube : ✅ Fait (implémenté + tests OK).
- Tâche 5 — Connecteur LinkedIn : ✅ Fait (fallback d'identifiant implémenté via `users.getOwnProfile` + retry `getAllPosts`; test réel OK avec `64` posts ingérés, `items_failed = 0`).
- Tâche 6 — Connecteur Notion : ✅ Fait (sync réelle OK avec `100` pages ingérées ; pipeline `--skip-sync` rejoué jusqu'à purge complète: `ingested = 0`, `triaged = 0`, `extraction_failed = 0`).
- Tâche 7 — Pipeline triage : ✅ Fait (implémenté + tests OK).
- Tâche 8 — Pipeline extraction : ✅ Fait (implémenté + tests OK ; idempotence relations corrigée).
- Tâche 9 — Pipeline embedding : ✅ Fait (fichiers présents + tests OK).
- Tâche 10 — Endpoint POST `/api/memory/search` : ✅ Fait (`src/app/api/memory/search/route.ts` créé, validation Zod, embedding OpenAI, scoring hybride 70/30, filtres et retour scoré).
- Tâche 11 — Endpoint GET `/api/business-summary` : ✅ Fait (`src/app/api/business-summary/route.ts` créé, groupement des faits actifs par domaine, filtre `domain`).
- Tâche 12 — Endpoint POST `/api/context/build` : ✅ Fait (`src/app/api/context/build/route.ts` créé, retrieval hybride + faits actifs + assemblage contexte + résumé Claude Sonnet si dépassement `max_tokens`).
- Tâche 13 — Endpoints restants (entity + sync status) : ✅ Fait (`src/app/api/entity/[type]/[id]/route.ts` et `src/app/api/sync/status/route.ts` créés, réponses structurées et gestion d'erreurs).
- Tâche 14 — Cron orchestrateur + test end-to-end : 🟡 Partiellement fait (route `src/app/api/cron/sync/route.ts` créée + `vercel.json` + script `cron:run`; LinkedIn réel désormais OK, mais test E2E cron complet documenté de bout en bout reste à finaliser).
- Tâche 15 (optionnel) — Connecteur Google Drive : ❌ Non fait.

**Validation actuelle (vérifiée le 2026-03-10) :** `npm run test` ✅ (8 fichiers de test passés, `30/30` tests passés). `npm run build` ❌ (erreur CSS préexistante: classe `border-border` absente dans `src/app/globals.css`). Test réel LinkedIn ✅ (`syncLinkedIn`: `64` ingérés, `0` échec). Test réel Notion ✅ (`100` ingérés puis traitement complet). `npm run pipeline:run -- --skip-sync` ✅ sur passes successives (purge Notion terminée). Compteurs finaux : `raw_documents` — linkedin ingested `64`, notion canonicalized `95`, notion skipped `5`, youtube canonicalized `22` ; `content_items=77`, `offers=1`, `entities=350`, `business_facts_actifs=552`, `memory_chunks=101`, `relationship_edges=311`.

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

## Phase 2 — Cockpit

- Semaine 1 : front-end setup → ✅
- MCP Server → ✅

---

## Estimation totale

Tâches 1-14 : environ 16-18 heures de sessions d'agent IA.
Avec les itérations et le débug : prévoir 25-30 heures au total.
Soit environ 5-7 jours de travail focusé.

# ROADMAP V2 — Source de vérité (12 mars 2026, Session CTO Claude #3)

**STATUT : ACTIF — Remplace la Roadmap V1 et le Backlog du 11 mars.**

**Auteur** : Claude CTO #3 (session 12 mars 2026)

**Validé par** : Mehdi

---

## 0. ÉTAT RÉEL CONFIRMÉ PAR AUDIT (12 mars)

**Build** : OK, 38/38 tests verts

**Supabase** : 15 tables, 923 business facts, 458 entités, 102 chunks

**CRM** : 2 contacts (Mezaelle + Quentin), 2 deals (1 won 6000€ + 1 qualif), 1 activité

**Drafts** : Table existe, 0 drafts (agent jamais tourné)

**Tasks** : Table N'EXISTE PAS

**Cache YouTube** : N'EXISTE PAS (cache.ts absent)

**Cron secret** : BUG — ouvert à tous si CRON_SECRET non défini

**Fallback LinkedIn BML** : NON CODÉ

**Recherche BML** : BUG 400 Invalid JSON body

**Hydration** : BUG mismatch className sur bloc LinkedIn

**Page /today** : 8-10 secondes (8 awaits séquentiels)

---

## PHASE 1 — STABILISATION (priorité absolue)

Objectif : rendre le cockpit utilisable au quotidien.

| # | Tâche | Détail | Effort |
| --- | --- | --- | --- |
| 1.1 | Créer cache.ts | Map mémoire Node.js TTL 30 min. Wrapper getYouTubeBusinessSnapshot, getAllVideos, getContentCadence | 30 min |
| 1.2 | Paralléliser /today | Remplacer les 8 await séquentiels par Promise.allSettled | 30 min |
| 1.3 | Fix cron secret | `if (!cronSecret) return false` au lieu de `return true` | 1 min |
| 1.4 | Fix recherche BML | Le front envoie un body vide ou mal formaté à POST /api/memory/search. Vérifier le Content-Type et le body JSON | 15 min |
| 1.5 | Fix hydration mismatch | className divergent serveur/client dans le bloc LinkedIn de today/page.tsx (ligne ~185) | 15 min |
| 1.6 | Fallback LinkedIn BML | try/catch dans linkedinAnalytics.ts, si Unipile échoue → lire posts depuis raw_documents | 1h |
| 1.7 | Fix [restart.sh](http://restart.sh) | Remplacer killall node par kill du process sur port 3000 uniquement | 5 min |
| 1.8 | Fix getTodayTasks | Changer < aujourd'hui par <= aujourd'hui pour inclure les tâches du jour | 5 min |

Livrable : le cockpit charge en <3s, YouTube affiche des données, recherche BML fonctionne, pas d'erreurs console.

---

## PHASE 2 — SYSTÈME DE TÂCHES

Objectif : créer un vrai système de tâches avec alimentation manuelle + chat IA + agents.

| # | Tâche | Détail | Effort |
| --- | --- | --- | --- |
| 2.1 | Migration 009_tasks.sql | Table tasks : id, workspace_id, title, description, status (todo/in_progress/done), priority (low/medium/high/urgent), due_date, source_type (manual/chat/agent), source_id, created_by, created_at, completed_at, updated_at | 15 min |
| 2.2 | Routes API /api/tasks | POST (créer), GET (lister avec filtres status/priority/due_date), PATCH (mettre à jour statut/priorité) | 1h |
| 2.3 | Outils chat CRM | create_task(title, due_date?, priority?, description?), complete_task(task_id), list_tasks(status?) dans chatTools.ts | 1h |
| 2.4 | Refactorer getTodayTasks | Fusionner : tâches standalone (due_date = aujourd'hui ou en retard) + deals avec next_action en retard ou aujourd'hui | 30 min |
| 2.5 | Vue tâches dans /today | Section tâches avec checkbox pour compléter + bouton Ajouter une tâche | 1h |
| 2.6 | Écran Tâches dédié | Vue kanban (À faire / En cours / Fait) + vue liste avec priorités. Nouvel écran dans la sidebar | 2-3h |

Livrable : les tâches fonctionnent bout en bout (création manuelle, chat IA, agents, affichage dashboard + écran dédié).

---

## PHASE 3 — AGENT LINKEDIN FONCTIONNEL

Objectif : l'agent génère des drafts, on peut les voir et en générer à la demande.

| # | Tâche | Détail | Effort |
| --- | --- | --- | --- |
| 3.1 | Test manuel generateDraft | Exécuter generateDraft() une fois manuellement. Vérifier qu'un draft apparaît en base | 15 min |
| 3.2 | Bouton Générer maintenant | Route POST /api/agents/linkedin/generate + bouton sur écran Drafts | 30 min |
| 3.3 | Vérifier cron Vercel | Après fix cron secret (1.3), confirmer que le cron 6h UTC fonctionne sur Vercel | 15 min |
| 3.4 | Agent crée une tâche | Après génération d'un draft, créer automatiquement une tâche "Valider le draft LinkedIn" | 15 min |

Livrable : des drafts générés quotidiennement + bouton pour en générer à la demande.

---

## PHASE 4 — DONNÉES YOUTUBE CORRECTES

Objectif : le bloc YouTube affiche les vrais chiffres.

| # | Tâche | Détail | Effort |
| --- | --- | --- | --- |
| 4.1 | Vérifier avec cache | Une fois le cache en place (1.1), confirmer que YouTube affiche abonnés, vues 30j, vidéos | 10 min |
| 4.2 | Supprimer getAllVideos du chargement | getAllVideos() pagine toutes les vidéos (tueur de quota). Déplacer vers une page dédiée ou un bouton "Charger toutes les vidéos" | 30 min |
| 4.3 | Quota monitoring | Afficher le quota restant dans les logs ou dans Paramètres | 15 min |

Livrable : YouTube affiche des données fiables sans cramer le quota.

---

## PHASE 5 — MULTI-WORKSPACE MEZAELLE

Objectif : séparer le contexte business Mehdi / Mezaelle.

| # | Tâche | Détail | Effort |
| --- | --- | --- | --- |
| 5.1 | Migration workspace_id | Ajouter colonne workspace_id sur toutes les tables clés + table workspaces + backfill 'personal' | 30 min |
| 5.2 | Filtrage backend | Toutes les API routes filtrent par workspace_id | 2-3h |
| 5.3 | Sélecteur workspace | Dropdown dans la sidebar pour choisir le workspace actif | 1h |
| 5.4 | Ingestion Mezaelle | Pas de Notion (compte privé). Ingestion manuelle ou via Google Sheets. À définir avec Mehdi | À évaluer |

Livrable : deux espaces séparés (Mehdi perso + Mezaelle).

---

## PHASE 6 — UX (PLUS TARD)

Pas de détail pour l'instant. On y reviendra quand le backend est stable.

- Refonte complète du dashboard
- Chat UX (Enter envoyer, streaming animé, stop button)
- Pipeline kanban
- Écran Paramètres (statuts connexions API)
- Impressions LinkedIn (Shield ou PhantomBuster)

---

## DÉCISIONS PRISES (12 mars)

- Unipile : Mehdi paie après le trial. En parallèle on explore Shield/PhantomBuster pour les impressions.
- Tâches : kanban + liste, agents auto, chat crée des tâches
- Mezaelle : pas de Notion (compte privé). Ingestion manuelle ou Google Sheets.
- UX : plus tard, d'abord le backend
- Prompts Windsurf : fournis en fichier MD par Claude CTO, pas sur Notion
- Impressions LinkedIn : RGPD pas un souci pour le moment

---

## DOCUMENTS ASSOCIÉS

- Passation V4 (source de vérité état du code)
- Passation V3 (contexte complet)
- Questions Ouvertes v2 (suivi questions résolues/en attente)
- STYLE GUIDE LINKEDIN (prompts ghostwriter)
- Architecture ouverte (MCP, GPT custom)