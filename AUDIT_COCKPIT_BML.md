# AUDIT_COCKPIT_BML

Date audit: 2026-03-11
Scope audité: `/Users/mehdi/Business memory brai/bml`
Mode: lecture seule (aucune modification applicative)

## SECTION 1 — ROUTES API

| Route | Fichier | Méthodes | Ce que la route fait | Dépendances critiques | Compile ? |
|---|---|---|---|---|---|
| `/api/agents/linkedin/generate` | `src/app/api/agents/linkedin/generate/route.ts` | `POST` | Génère un draft LinkedIn via l’agent puis renvoie le draft. | `generateDraft`, Supabase (via agent), Claude (via agent), Tavily optionnel | Oui |
| `/api/business-summary` | `src/app/api/business-summary/route.ts` | `GET` | Retourne les `business_facts` actifs groupés par domaine. | `supabase`, `BusinessSummaryQuerySchema` | Oui |
| `/api/chat` | `src/app/api/chat/route.ts` | `GET`, `POST` | Gère listing/historique conversations et streaming chat IA + outils CRM. | `@ai-sdk/anthropic`, `ai/streamText`, `crmTools`, `searchMemory`, `supabase` | Oui |
| `/api/context/build` | `src/app/api/context/build/route.ts` | `POST` | Construit un contexte business (chunks + facts), avec résumé Claude si dépassement tokens. | `generateEmbedding`, `hybridSearch`, `callClaude`, `supabase`, `ContextBuildInputSchema` | Oui |
| `/api/cron/linkedin` | `src/app/api/cron/linkedin/route.ts` | `GET` | Déclenche génération draft LinkedIn derrière auth Bearer `CRON_SECRET`. | `generateDraft`, `process.env.CRON_SECRET` | Oui |
| `/api/cron/sync` | `src/app/api/cron/sync/route.ts` | `GET` | Déclenche `runPipeline` (youtube+linkedin+notion), auth Bearer optionnelle si secret absent. | `runPipeline`, `process.env.CRON_SECRET` | Oui |
| `/api/drafts` | `src/app/api/drafts/route.ts` | `GET` | Liste les drafts LinkedIn par `workspace_id` et `status`. | `supabase` | Oui |
| `/api/drafts/[id]` | `src/app/api/drafts/[id]/route.ts` | `PATCH` | Met à jour statut draft; si approuvé, marque une tâche associée comme faite. | `supabase`, `completeTaskByTitle` | Oui |
| `/api/entity/[type]/[id]` | `src/app/api/entity/[type]/[id]/route.ts` | `GET` | Retourne détail entité + facts actifs + relations entrantes/sortantes. | `supabase` | Oui |
| `/api/memory/search` | `src/app/api/memory/search/route.ts` | `POST` | Fait recherche mémoire hybride (embedding + lexical). | `generateEmbedding`, `hybridSearch`, `MemorySearchInputSchema` | Oui |
| `/api/sync/status` | `src/app/api/sync/status/route.ts` | `GET` | Retourne statut de sync par source (`youtube/linkedin/notion`). | `supabase`, tables `source_connections`/`sync_runs` | Oui |
| `/api/sync/trigger` | `src/app/api/sync/trigger/route.ts` | `POST` | Lance pipeline source par source, peut reset cursor en full sync. | `runPipeline` (import dynamique), `supabase` | Oui |
| `/api/tasks` | `src/app/api/tasks/route.ts` | `GET`, `POST` | Liste ou crée des tâches. | `listTasks`, `createTask` | Oui |
| `/api/tasks/[id]` | `src/app/api/tasks/[id]/route.ts` | `PATCH` | Met à jour une tâche. | `updateTask` | Oui |

## SECTION 2 — PAGES FRONTEND

| Route URL | Fichier principal | Composants importés | Données chargées | Compile ? |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | aucun | redirection vers `/today` | Oui |
| `/today` | `src/app/(cockpit)/today/page.tsx` | `Badge`, `Card*`, `MemorySearchForm`, `TodayLinkedInDraftCard`, `TodayTasks`, `SyncButton` | `getDashboardStats`, `getYouTubeBusinessSnapshot`, `getAllVideos`, `getAllLinkedInPosts`, `getContentCadence`, `getWeeklyStats`, `getPipelineBusinessSummary`, `getTodayTasks`, requête `linkedin_drafts` | Oui |
| `/chat` | `src/app/(cockpit)/chat/page.tsx` | `Badge`, `Button`, `Card*`, `Input`, `ScrollArea` | Appels client `/api/chat` (GET/POST streaming) | Oui |
| `/drafts` | `src/app/(cockpit)/drafts/page.tsx` | `Badge`, `Button`, `Card*`, `Tabs*` | Appels client `/api/drafts`, `/api/agents/linkedin/generate`, `/api/drafts/[id]` | Oui |
| `/pipeline` | `src/app/(cockpit)/pipeline/page.tsx` | `Badge`, `Button`, `Card*`, `Input`, `Tabs*` | `getDealsWithContacts`, `createDealWithContact`, `updateDeal`, `deleteDeal` | Oui |
| `/tasks` | `src/app/(cockpit)/tasks/page.tsx` | logique UI native + config `taskBoardConfig` | Appels client `/api/tasks`, `/api/tasks/[id]` | Oui |

## SECTION 3 — COMPOSANTS PARTAGÉS

### `src/components/cockpit/`

| Composant | Utilisé où | Props principales |
|---|---|---|
| `MemorySearchForm` | `/today` | aucune |
| `SyncButton` | `/today` | aucune |
| `TodayLinkedInDraftCard` | `/today` | `initialDraft: { id, content, style } \| null` |
| `TodayTasks` | `/today` | `initialTasks: TaskItem[]` |
| `taskBoardConfig` (module) | `/tasks` | exports types/constantes (`Task`, `TaskStatus`, `kanbanColumns`, etc.) |

### `src/components/ui/`

| Composant | Utilisé où | Props principales |
|---|---|---|
| `Badge` | `/today`, `/chat`, `/drafts`, `/pipeline` | `variant`, `className`, `render` |
| `Button` | `/chat`, `/drafts`, `/pipeline` | `variant`, `size`, props bouton Base UI |
| `Card`, `CardHeader`, `CardContent`, `CardTitle`, `CardDescription` | `/today`, `/chat`, `/drafts`, `/pipeline` | `className`, props HTML; `Card` a `size` |
| `Input` | `/chat`, `/pipeline`, `MemorySearchForm` | props input standard + `className` |
| `ScrollArea` | `/chat` | props `ScrollAreaPrimitive.Root` |
| `Separator` | `layout cockpit` | `orientation`, `className` |
| `Tabs`, `TabsList`, `TabsTrigger` | `/drafts`, `/pipeline` | `orientation`, `variant`, props tabs |
| `Avatar*` | non utilisé dans les pages cockpit auditées | `size`, props Base UI avatar |

## SECTION 4 — FICHIERS LIB CRITIQUES

| Fichier | Fonctions/export principaux | Dépendances externes notables |
|---|---|---|
| `src/lib/cache.ts` | `getCached`, `setCache`, `clearCache` | Aucune externe (Map mémoire process) |
| `src/lib/chatTools.ts` | `crmTools` (toolset IA: contacts/deals/tasks) | `ai/tool`, `zod`, `crmQueries`, `taskQueries` |
| `src/lib/chunker.ts` | `chunkText` | Aucune |
| `src/lib/claude.ts` | `ClaudeZodValidationError`, `callClaude` | `@anthropic-ai/sdk`, `zod`, `ANTHROPIC_API_KEY` |
| `src/lib/crmContactResolver.ts` | `resolveContactByName`, types `Contact`, `ContactMatch` | `supabase` |
| `src/lib/crmPipelineQueries.ts` | `getPipelineSummary`, `getOverdueActions` | `supabase` |
| `src/lib/crmQueries.ts` | `createContact`, `createDealByContactName`, `updateDealByContactName`, `logActivityByContactName`, re-export `getPipelineSummary/getOverdueActions` | `supabase`, `crmContactResolver`, `crmPipelineQueries`, `taskQueries` |
| `src/lib/dashboardQueries.ts` | `getDashboardStats`, `getPipelineBusinessSummary`, `getTodayTasks`, `getContentCadence`, `getWeeklyStats` | `supabase`, `linkedinAnalytics`, `taskQueries`, `youtubeAnalytics` |
| `src/lib/draftsQueries.ts` | `getDrafts`, `updateDraftStatus`, `updateDraftContent`, `deleteDraft`, `regenerateDraft` | `requireSupabaseBrowser` |
| `src/lib/googleAuth.ts` | `createGoogleOAuth2Client` | `googleapis`, env YouTube OAuth |
| `src/lib/hybridSearch.ts` | `hybridSearch`, type `HybridSearchResult` | `supabase` |
| `src/lib/linkedinAnalytics.ts` | `getLatestLinkedInPosts`, `getAllLinkedInPosts`, type `LinkedInPostStats` | `unipileClient`, `supabase`, `UNIPILE_ACCOUNT_ID` |
| `src/lib/memoryQueries.ts` | `searchMemory`, `getBusinessSummary`, `getEntity`, `buildContext` | `supabase`, `openai`, `hybridSearch`, `claude`, `zod` |
| `src/lib/notionBlocksToText.ts` | `notionBlocksToText` | `@notionhq/client` |
| `src/lib/openai.ts` | `generateEmbedding` | `openai`, `OPENAI_API_KEY` |
| `src/lib/pipelineQueries.ts` | `getDealsWithContacts`, `createDealWithContact`, `updateDeal`, `deleteDeal` | `requireSupabaseBrowser` |
| `src/lib/supabase.ts` | `supabase`, type `Database` | `@supabase/supabase-js`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `src/lib/supabaseBrowser.ts` | `supabaseBrowser`, `requireSupabaseBrowser` | `@supabase/supabase-js`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `src/lib/taskQueries.ts` | `createTask`, `listTasks`, `updateTask`, `completeTaskByTitle`, `getTodayAndOverdueTasks`, type `Task` | `supabase` |
| `src/lib/unipile.ts` | `unipileClient` | `unipile-node-sdk`, `UNIPILE_DSN`, `UNIPILE_ACCESS_TOKEN` |
| `src/lib/utils.ts` | `cn` | `clsx`, `tailwind-merge` |
| `src/lib/youtubeAnalytics.ts` | `getYouTubeChannelStats`, `getYouTubeLatestVideos`, `getAllVideos`, `getYouTubeViewsLast30Days`, `getYouTubeWeeklyViews`, `getYouTubeSubscribersGainedLast7Days`, `getYouTubeBusinessSnapshot` | `googleapis`, `googleAuth`, `cache`, `YOUTUBE_CHANNEL_ID` |

### Points d’attention demandés
- `dashboardQueries.ts`: alimente `/today`; contient logique pipeline/tâches et fallbacks.
- `crmQueries.ts`: logique CRM + hooks de création tâches sur statuts deal.
- `taskQueries.ts`: CRUD tâches + matching fuzzy par titre.
- `chatTools.ts`: expose outils CRM/Tâches au LLM `ai`.
- `youtubeAnalytics.ts`: appels YouTube Data/Analytics + cache mémoire process.
- `linkedinAnalytics.ts`: source primaire Unipile, fallback `raw_documents`.
- `cache.ts`: cache en mémoire locale (TTL 30 min), non distribué.

## SECTION 5 — AGENTS & CONNECTEURS

| Fichier | Ce qu’il fait | État observé | Dépendances / secrets |
|---|---|---|---|
| `src/agents/linkedin/generateDraft.ts` | Génère draft LinkedIn via pipeline `searchMemory -> extraction Claude -> writer Claude -> insert draft -> createTask`. | Fonctionnel en test (`tests/agents/linkedin.test.ts` passe). | `ANTHROPIC_API_KEY`, `TAVILY_API_KEY` (optionnel), Supabase |
| `src/agents/linkedin/prompts.ts` | Contient prompts extracteur/ghostwriter (gros prompt engineering). | Fonctionnel (consommé par `generateDraft`). | Aucun secret direct |
| `src/connectors/notion.ts` | Sync incrémentale Notion vers `raw_documents` + `sync_runs`. | Couvert en tests connecteur, passe. | `NOTION_TOKEN`, Supabase |
| `src/connectors/linkedin.ts` | Sync incrémentale LinkedIn via Unipile, avec fallback d’identifiant (`UNIPILE_IDENTIFIER`, `provider_id`, `public_identifier`). | Couvert en tests connecteur, passe. | `UNIPILE_DSN`, `UNIPILE_ACCESS_TOKEN`, `UNIPILE_ACCOUNT_ID`, `UNIPILE_IDENTIFIER` |
| `src/connectors/youtube.ts` | Sync incrémentale YouTube vidéos + transcript vers `raw_documents`. | Couvert en tests connecteur, passe. | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `YOUTUBE_CHANNEL_ID` |
| `src/pipeline/orchestrator.ts` | Orchestration sync + triage + extraction + embedding. | Couvert en tests pipeline, passe. | Supabase + connecteurs + pipeline modules |

## SECTION 6 — MCP SERVER

Fichier: `src/mcp/server.ts`

### Outils exposés
1. `search_memory`
2. `get_business_summary`
3. `build_context`
4. `get_entity`

### Commande de lancement
- Script npm: `npm run mcp:start`
- Commande réelle (`package.json`): `node --env-file=.env.local ./node_modules/.bin/tsx src/mcp/server.ts`
- Transport: `StdioServerTransport`

### Config JSON Claude Desktop trouvée
- Fichier local: `/Users/mehdi/Library/Application Support/Claude/claude_desktop_config.json`
- Serveur configuré: `bml`
- Commande: `node --env-file=/Users/mehdi/Business memory brai/bml/.env.local /Users/mehdi/Business memory brai/bml/node_modules/tsx/dist/cli.mjs /Users/mehdi/Business memory brai/bml/src/mcp/server.ts`

## SECTION 7 — MIGRATIONS SQL

| Migration | Ce qu’elle fait | Appliquée ? |
|---|---|---|
| `001_initial_schema.sql` | Crée extensions + schéma principal BML (`source_connections`, `sync_runs`, `raw_documents`, tables canoniques, indexes). | Indéterminable en local (pas de check DB fait pendant audit) |
| `002_add_content_hash.sql` | Ajoute `content_hash` à `memory_chunks`. | Indéterminable en local |
| `003_add_unique_raw_document_id.sql` | Ajoute contraintes uniques `raw_document_id` (content/offers/entities). | Indéterminable en local |
| `004_crm_tables.sql` | Crée tables CRM (`contacts`, `deals`, `activities`) + indexes. | Indéterminable en local |
| `005_sync_runs.sql` | Crée/normalise table `sync_runs` version `source/start_time/end_time` + indexes. | Indéterminable en local |
| `006_chat_history.sql` | Crée historique chat (`chat_conversations`, `chat_messages`) + indexes. | Indéterminable en local |
| `007_rls_policies.sql` | Désactive RLS sur tables CRM + chat. | Indéterminable en local |
| `008_linkedin_drafts.sql` | Crée table `linkedin_drafts` + indexes statut/workspace. | Indéterminable en local |
| `009_tasks.sql` | Crée table `tasks` + contraintes + indexes. | Indéterminable en local |

## SECTION 8 — VARIABLES D’ENVIRONNEMENT

| Variable | Où utilisée | Critique (crash/fail) ? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase.ts`, `src/lib/supabaseBrowser.ts` | Oui (accès DB cassé sinon) |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase.ts` | Oui |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabaseBrowser.ts` | Oui pour flows browser (`pipelineQueries`, `draftsQueries`) |
| `ANTHROPIC_API_KEY` | `src/lib/claude.ts` | Oui pour fonctionnalités Claude (`chat`, `context`, agent) |
| `OPENAI_API_KEY` | `src/lib/openai.ts` | Oui pour recherche/context hybride (embeddings) |
| `YOUTUBE_CLIENT_ID` | `src/lib/googleAuth.ts`, tests | Oui pour YouTube API OAuth |
| `YOUTUBE_CLIENT_SECRET` | `src/lib/googleAuth.ts`, tests | Oui pour YouTube API OAuth |
| `YOUTUBE_REFRESH_TOKEN` | `src/lib/googleAuth.ts`, tests | Oui pour YouTube API OAuth |
| `YOUTUBE_CHANNEL_ID` | `src/lib/youtubeAnalytics.ts`, `src/connectors/youtube.ts`, tests | Oui pour analytics/sync YouTube |
| `UNIPILE_DSN` | `src/lib/unipile.ts`, tests | Oui pour accès Unipile |
| `UNIPILE_ACCESS_TOKEN` | `src/lib/unipile.ts`, tests | Oui pour accès Unipile |
| `UNIPILE_ACCOUNT_ID` | `src/lib/linkedinAnalytics.ts`, `src/connectors/linkedin.ts`, tests | Oui pour LinkedIn via Unipile |
| `UNIPILE_IDENTIFIER` | `src/connectors/linkedin.ts`, tests | Importante mais fallback partiel existe |
| `NOTION_TOKEN` | `src/connectors/notion.ts`, tests | Oui pour sync Notion |
| `CRON_SECRET` | `src/app/api/cron/sync/route.ts`, `src/app/api/cron/linkedin/route.ts` | Oui pour sécurisation cron (sinon comportement ouvert/401 selon route) |
| `TAVILY_API_KEY` | `src/agents/linkedin/generateDraft.ts` | Non bloquant global (feature news fallback à `[]`) |
| `NODE_ENV` | `src/lib/claude.ts` | Non critique (logging dev) |
| `GOOGLE_CLIENT_ID` | `scripts/getYoutubeRefreshToken.cjs` | Oui pour script token (pas runtime app) |
| `GOOGLE_CLIENT_SECRET` | `scripts/getYoutubeRefreshToken.cjs` | Oui pour script token (pas runtime app) |

## SECTION 9 — BUGS CONFIRMÉS

> Severité: `bloquant` (feature KO), `visible` (comportement faux/inattendu), `cosmétique`.

1. **Pipeline `/today` peut sous-compter “proposals”**
   - Hypothèse initiale demandée: casse status.
   - Constat code: mismatch exact entre statuts (`proposal_sent` vs `proposal`).
   - Fichiers/lignes: `src/lib/dashboardQueries.ts:131`, `src/lib/dashboardQueries.ts:179`, `src/lib/dashboardQueries.ts:198`, `src/lib/crmPipelineQueries.ts:14`, `src/lib/crmPipelineQueries.ts:31`
   - Sévérité: `visible`

2. **Doublons tâches potentiels (pas d’idempotence applicative)**
   - Les hooks créent des tâches sans clé unique/guard (`createTask` brute).
   - Fichiers/lignes: `src/lib/crmQueries.ts:151`, `src/lib/crmQueries.ts:166`, `src/agents/linkedin/generateDraft.ts:221`, `src/lib/taskQueries.ts:33`
   - Sévérité: `visible`

3. **Date incohérente type “2025-01-17” sur tâche**
   - Entrées `due_date` non normalisées côté API, stockage direct.
   - Fichiers/lignes: `src/app/api/tasks/route.ts:6`, `src/lib/taskQueries.ts:40`, `src/lib/taskQueries.ts:87`
   - Sévérité: `visible`

4. **YouTube “Données indisponibles” si API/quota KO**
   - Le fallback UI est volontaire mais non dégradé (pas de cache persistant ni message détaillé).
   - Fichiers/lignes: `src/app/(cockpit)/today/page.tsx:118`, `src/lib/youtubeAnalytics.ts:68`, `src/lib/youtubeAnalytics.ts:180`
   - Sévérité: `visible`

5. **Lenteur `/today` (agrégations multiples et APIs externes)**
   - 9 promesses en parallèle incluant APIs externes + DB; latence dépendante d’Unipile/YouTube.
   - Fichiers/lignes: `src/app/(cockpit)/today/page.tsx:24`
   - Sévérité: `visible`

6. **Sync Notion: reset curseur possible sans preuve d’ingestion réelle**
   - `fullSync` remet `cursor = null` puis lance pipeline; pas de garde d’ingestion explicite dans trigger.
   - Fichiers/lignes: `src/app/api/sync/trigger/route.ts:29`, `src/connectors/notion.ts:150`
   - Sévérité: `visible`

7. **Écran `/tasks`: mode kanban+liste non totalement couvert par tests UI**
   - Tests existants API/lib, pas de test d’intégration UI pour interactions écran.
   - Fichiers/lignes: `src/app/(cockpit)/tasks/page.tsx`
   - Sévérité: `visible`

8. **Risque de divergence schéma `sync_runs` (legacy vs v005)**
   - Le code lit/écrit à la fois `source_connection_id/started_at/finished_at` et `source/start_time/end_time` selon modules/migrations.
   - Fichiers/lignes: `src/connectors/notion.ts:107`, `src/connectors/linkedin.ts:158`, `src/connectors/youtube.ts:122`, `src/lib/dashboardQueries.ts:71`, `supabase/migrations/005_sync_runs.sql:1`
   - Sévérité: `visible`

9. **Route `/api/chat` écrit en DB alors que règle projet “API read-only”**
   - Écritures `chat_conversations`/`chat_messages` côté endpoint.
   - Fichiers/lignes: `src/app/api/chat/route.ts:168`, `src/app/api/chat/route.ts:189`, `src/app/api/chat/route.ts:214`
   - Sévérité: `visible` (incohérence d’architecture avec AGENTS)

10. **`prompts.ts` > 300 lignes (règle AGENTS dépassée)**
   - Fichier à 619 lignes.
   - Fichiers/lignes: `src/agents/linkedin/prompts.ts`
   - Sévérité: `cosmétique` (maintenabilité)

## SECTION 10 — TESTS

- Nombre de fichiers de tests exécutés: **10**
- Nombre de tests exécutés: **38**
- Localisation détectée:
  - `tests/agents/linkedin.test.ts`
  - `tests/api/chat.test.ts`
  - `bml/tests/api/routes.test.ts`
  - `bml/tests/connectors/*.test.ts`
  - `bml/tests/pipeline/*.test.ts`

### Résultat exact `npm run test`

```text
> bml@0.1.0 test
> vitest run

Test Files  10 passed (10)
Tests       38 passed (38)
Duration    3.22s
```

Notes:
- Un log d’erreur contrôlé apparaît dans `tests/agents/linkedin.test.ts` (`Failed to create draft validation task`) mais le test est vert.

## SECTION 11 — BUILD

### Résultat exact `npm run build`

```text
> bml@0.1.0 build
> next build

✓ Compiled successfully
✓ Finished TypeScript
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

### Statut
- **Build passe: oui**

### Warnings notables
- Warning Next.js sur détection de racine workspace et lockfiles multiples:
  - lockfile externe détecté: `/Users/mehdi/pnpm-lock.yaml`
  - lockfile local détecté: `/Users/mehdi/Business memory brai/bml/package-lock.json`
  - recommandation: configurer `turbopack.root`.
