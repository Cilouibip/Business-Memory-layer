# DIAGNOSTIC — SYNC NOTION (2026-03-11)

## 1) Lecture du code (ce que fait réellement le flux)

### `src/connectors/notion.ts`
- Le connecteur fait bien un `upsert` dans `raw_documents` (`onConflict: source_type,source_object_id`).
- Les champs écrits: `source_type`, `source_object_id`, `sync_run_id`, `raw_payload`, `processing_status='ingested'`.
- Filtrage avant ingestion:
  - skip si `last_edited_time` absent
  - skip si `lastCursor` existe et `editedAt <= lastCursor`
- Le curseur est lu via `getLastCursor()` depuis `sync_runs.cursor`.
- Logging existant: pages trouvées, new/updated vs skipped, et résumé JSON final.

### `src/pipeline/orchestrator.ts`
- `runPipeline()` exécute:
  1. `runSync(sources)` (si `skipSync !== true`)
  2. triage des `raw_documents.processing_status='ingested'` (limite `limit`, défaut 50)
  3. extraction des `processing_status='triaged'` (même limite)
  4. embeddings à partir des tables canoniques
- Donc sync + pipeline sont bien enchaînés dans un même appel.

### `src/app/api/sync/trigger/route.ts`
- Le bouton Full Sync:
  - reset `sync_runs.cursor = null` pour les sources demandées
  - puis appelle `runPipeline({ sources:[source], skipSync:false })` pour chaque source
- Ce n’est **pas** "sync only" : la route lance sync + triage + extraction + embedding.

## 2) Résultats SQL (base Supabase réelle)

> Note schéma réel: `raw_documents` utilise `source_type`, `processing_status`, `ingested_at`, et le titre est dans `raw_payload->>'title'`.

### Requêtes demandées (adaptées aux colonnes réelles)

1. Nombre de documents Notion dans `raw_documents`
```sql
SELECT COUNT(*) FROM raw_documents WHERE source_type = 'notion';
```
Résultat: **106**

2. Nombre de documents Notion créés après le 11 mars
```sql
SELECT COUNT(*) FROM raw_documents WHERE source_type = 'notion' AND ingested_at > '2026-03-11';
```
Résultat: **6**

3. Statuts pipeline des documents Notion
```sql
SELECT processing_status, COUNT(*)
FROM raw_documents
WHERE source_type = 'notion'
GROUP BY processing_status;
```
Résultat:
- `canonicalized`: **95**
- `ingested`: **6**
- `skipped`: **5**

4. Documents Notion non terminés
```sql
SELECT id, raw_payload->>'title' AS title, processing_status, ingested_at
FROM raw_documents
WHERE source_type = 'notion' AND processing_status != 'canonicalized'
ORDER BY ingested_at DESC
LIMIT 20;
```
Résultat: les plus récents (6 docs du 11 mars) sont `ingested`, les 5 plus anciens sont `skipped`.

5. Nombre de `content_items` liés à des documents Notion
```sql
SELECT COUNT(*)
FROM content_items
WHERE raw_document_id IN (
  SELECT id FROM raw_documents WHERE source_type = 'notion'
);
```
Résultat: **55**

6. Recherche pages opérationnelles
```sql
SELECT id, raw_payload->>'title' AS title, processing_status
FROM raw_documents
WHERE source_type = 'notion'
  AND ((raw_payload->>'title') ILIKE '%command center%'
    OR (raw_payload->>'title') ILIKE '%to do weekly%'
    OR (raw_payload->>'title') ILIKE '%content pipeline%'
    OR (raw_payload->>'title') ILIKE '%bible youtube%');
```
Résultat:
- `🚀 Command Center — Weekly Ops & Business` trouvé, statut `canonicalized`
- Les autres titres demandés (`To Do Weekly`, `Content Pipeline`, `Bible YouTube 2026`) **non trouvés** dans `raw_documents`.

### Vérification complémentaire
- `sync_runs` Notion montre des runs récents en `running` sans `finished_at` (run interrompu/non finalisé).
- `memory_chunks` pour content_items Notion existent (`29`), donc une partie de la chaîne va jusqu’à l’embedding.

## 3) Où les pages se perdent dans la chaîne

Chaîne observée: `sync -> raw_documents -> triage -> extraction -> canonical tables -> memory_chunks`

Constat:
- La chaîne fonctionne pour une partie des docs (95 canonicalized, chunks présents).
- Le problème principal n’est **pas** un simple reset curseur.
- Le problème est un **drainage incomplet** après Full Sync:
  - runs Notion laissés en `running`
  - nouveaux docs restés en `ingested`
  - pipeline post-sync limité à des batches (limit par défaut 50), sans boucle explicite de vidage.

## 4) Hypothèse confirmée et fix proposé

### Hypothèse confirmée (H1, version réelle)
H1 est partiellement confirmée: les docs sont bien insérés, mais le traitement complet triage/extraction/embedding n’est pas garanti jusqu’au bout lors d’un Full Sync lourd.

### Hypothèses non confirmées
- H2 (triage rejette massivement Notion): non confirmé (seulement 5 `skipped`).
- H3 (contenu Notion vide systématiquement): non confirmé (beaucoup de contenus longs; quelques pages à 0 mais non systémique).
- H4 (dédup content_hash bloque): non confirmé ici (upsert se fait sur `source_type,source_object_id`).

### Fix appliqué
- Renforcer `api/sync/trigger` pour:
  1. laisser plus de temps d’exécution (`maxDuration` augmenté),
  2. après chaque sync source, exécuter des passes `runPipeline(skipSync:true)` en boucle pour **vider** les statuts `ingested/triaged` de la source.

Effet attendu:
- Après Full Sync Notion, les docs ne restent plus bloqués en `ingested` par manque de passes pipeline.
- Les documents opérationnels présents dans Notion et réellement ingérés passent plus systématiquement jusqu’aux tables canoniques/chunks.

## 5) Résultats post-fix V2 (2026-03-12)

### Changements appliqués
- `src/connectors/notion.ts`
  - exclusion des runs `running` lors de la lecture du cursor (`getLastCursor`)
  - création/finalisation explicite du sync run via helpers `createSyncRun` / `finalizeSyncRun`
  - finalisation garantie via `finally` (statut + métriques + `finished_at`/`end_time`)
- `src/pipeline/triage.ts`
  - ajout d’une règle explicite pour pages Notion opérationnelles (score min 0.6, catégorie process/strategie)
  - forçage de score/catégorie pour éviter le faux rejet sur cette classe de pages
- `scripts/drain-pipeline.ts`
  - nouveau script de drain ciblé source Notion
  - traite les documents `ingested` et `triaged` vers extraction + embedding
  - logs par document + résumé final
- `package.json`
  - ajout du script `drain:notion`

### Exécution
- Nettoyage des runs fantômes Notion (`running` + `finished_at IS NULL`) via SQL
- `npm run drain:notion` exécuté deux fois
  - run 1: `total=352`, `completed=327`, `failed=6`, `skipped=19`
  - run 2: `total=6`, `completed=2`, `failed=4`, `skipped=0`

### État base après fix
```sql
SELECT processing_status, COUNT(*) FROM raw_documents WHERE source_type='notion' GROUP BY processing_status;
```
- `canonicalized`: **328**
- `skipped`: **19**
- `extraction_failed`: **1**
- `ingested`: **4**

Reste bloquant principal sur les 4 docs restants: erreurs LLM `prompt is too long (>200000 tokens)`.

```sql
SELECT COUNT(*) FROM sync_runs
WHERE status='running'
  AND finished_at IS NULL
  AND source_connection_id IN (SELECT id FROM source_connections WHERE source_type='notion');
```
- Résultat: **0**

```sql
SELECT COUNT(*) FROM content_items ci
JOIN raw_documents rd ON ci.raw_document_id = rd.id
WHERE rd.source_type='notion';
```
- Résultat: **139**

```sql
SELECT COUNT(*) FROM memory_chunks
WHERE entity_type='content_item'
  AND entity_id IN (
    SELECT ci.id FROM content_items ci
    JOIN raw_documents rd ON ci.raw_document_id = rd.id
    WHERE rd.source_type='notion'
  );
```
- Résultat: **139**

### Pages opérationnelles ciblées
```sql
SELECT rd.raw_payload->>'title' AS title, rd.processing_status
FROM raw_documents rd
WHERE rd.source_type='notion'
  AND ((rd.raw_payload->>'title') ILIKE '%command center%'
    OR (rd.raw_payload->>'title') ILIKE '%to do%'
    OR (rd.raw_payload->>'title') ILIKE '%bible youtube%'
    OR (rd.raw_payload->>'title') ILIKE '%content pipeline%');
```
- `🚀 Command Center — Weekly Ops & Business`: `canonicalized`
- `📈 To do weekly v2`: `canonicalized`
- `🎬 Content Pipeline`: `canonicalized`
- `📖 Bible YouTube 2026 — Mehdi Benchaffi`: `canonicalized`

### Validation build/tests
- `npm run build`: ✅ pass
- `npm run test`: ✅ pass (`38/38`)
