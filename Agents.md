# AGENTS.md — Business Memory Layer (BML)

**Ce fichier est le cadre du projet. Tout agent IA (Windsurf, Codex, Claude) le lit AVANT de coder.**

---

## Identité du projet

Ce projet s'appelle Business Memory Layer (BML). C'est un backend qui centralise les données business d'un fondateur solo, les transforme en mémoire structurée, et expose le contexte via API.

Documentation complète dans le Hub Notion : docs 01 à 08.

---

## Stack obligatoire

- Runtime : Node.js / TypeScript
- Framework : Next.js (App Router, API routes)
- Base de données : Supabase Postgres + pgvector
- ORM / query : Supabase JS client (@supabase/supabase-js)
- Validation : Zod pour tous les schémas
- LLM : Claude API (@anthropic-ai/sdk)
- Embeddings : OpenAI text-embedding-3-small
- Storage : Supabase Storage
- Tests : Vitest

---

## Interdits absolus

1. Le code de l'application BML est en TypeScript. Si un outil externe en Python est nécessaire plus tard (agents IA, frameworks ML), il tourne comme un service séparé, jamais mélangé dans le code principal.
2. Ne jamais ajouter de dépendance non listée sans validation explicite. Pas de LangChain, pas de LlamaIndex, pas de Cognee, pas de Mem0 sans discussion.
3. Si une nouvelle table SQL semble nécessaire : proposer le CREATE TABLE, expliquer pourquoi, attendre validation humaine. Ne jamais créer la table automatiquement.
4. Ne jamais hardcoder des secrets. Tout dans les variables d'environnement (.env.local).
5. Ne jamais modifier le data model (ajouter/supprimer des colonnes) sans validation explicite.
6. Ne jamais écrire de code sans validation Zod sur les entrées et les sorties LLM.
7. Ne jamais laisser un appel LLM sans gestion d'erreur (retry 2 fois avec exponential backoff 1s → 3s, timeout 60 secondes).
8. Ne jamais insérer de données invalides. Si la validation Zod échoue : retry une fois avec prompt correctif, sinon marquer l'objet comme extraction_failed. Jamais d'insert sans validation.

---

## Invariants système (NE JAMAIS VIOLER)

1. raw_documents est la source de vérité pour toutes les données ingérées.
2. Les tables canoniques (content_items, offers, documents, entities) sont dérivées de raw_documents via le pipeline. Elles ne doivent JAMAIS être modifiées directement par les connecteurs.
3. Les embeddings ne sont générés QUE depuis memory_chunks, jamais depuis raw_documents directement.
4. Les business_facts doivent toujours référencer une entité source (source_entity_type + source_entity_id).
5. Aucun appel LLM ne doit modifier la base sans validation Zod + score de confiance.
6. Les endpoints API sont read-only. Les écritures viennent uniquement des connecteurs et du pipeline. Exception : les endpoints de contexte peuvent faire des appels LLM en lecture pour assembler le contexte (timeout 60s).

---

## Idempotence obligatoire

Toutes les opérations d'ingestion doivent être idempotentes :
- Relancer une sync ne doit JAMAIS créer de doublons
- Les inserts doivent utiliser upsert avec clés uniques (source_type + source_object_id)
- Chaque document doit avoir un source_object_id stable
- Si l'idempotence n'est pas garantie, la tâche n'est PAS terminée

---

## Règles d'utilisation des LLM

Les LLM sont coûteux et lents.

Interdit :
- Appeler un LLM dans une boucle sans batching
- Appeler un LLM dans les endpoints d'ingestion/écriture

Tout appel LLM doit être :
- Batché si possible (regrouper les documents à traiter)
- Traçable (run_id logué)
- Timeout 60 secondes
- Retry 2 fois avec exponential backoff (1s → 3s)

Recommandé (pas obligatoire en phase 1) : mettre en cache les résultats LLM pour éviter de re-traiter les mêmes documents.

---

## Règles migrations SQL

Les migrations ne doivent JAMAIS :
- Supprimer une table
- Supprimer une colonne
- Modifier un type de colonne existant

Les migrations doivent être :
- Additives uniquement (ajouter tables, colonnes, index)
- Versionnées dans /supabase/migrations
- Testées localement avant merge

---

## Conventions de code

### Structure des fichiers
```
/src
  /lib           → utilitaires partagés (supabase client, types, schemas Zod)
  /connectors    → un fichier par source (notion.ts, youtube.ts, linkedin.ts, gdrive.ts)
  /pipeline      → triage.ts, extraction.ts, embedding.ts
  /types         → types TypeScript globaux
  /schemas       → schémas Zod (un fichier par entité)
/app/api         → Next.js API routes (App Router)
/supabase
  /migrations    → fichiers SQL de migration
/tests           → tests Vitest
```

### Nommage

- Fichiers : camelCase (monFichier.ts)
- Types/Interfaces : PascalCase (ContentItem, BusinessFact)
- Fonctions : camelCase (syncNotion, triageDocument)
- Tables SQL : snake_case (content_items, business_facts)
- Colonnes SQL : snake_case (relevance_score, valid_from)

### Taille maximale

Un fichier ne doit jamais dépasser 300 lignes. Si un fichier dépasse 300 lignes, le refactoriser en modules.

### DRY obligatoire

Si une logique existe déjà dans /src/lib, elle doit être réutilisée. Interdit de copier-coller une fonction existante. Toujours chercher d'abord dans /src/lib.

### Requêtes SQL

Recommandation forte : sélectionner explicitement les colonnes au lieu de SELECT *. Toujours vérifier que les colonnes filtrées sont indexées sur les tables volumineuses.

### Création d'endpoints API

Ne pas créer de nouveaux endpoints sans vérifier :
- Si un endpoint similaire existe déjà
- Si la logique peut être intégrée à un endpoint existant

---

## Patterns obligatoires

### Chaque connecteur doit :
- Avoir une fonction sync() qui fait la sync incrémentale
- Lire le dernier cursor depuis sync_runs
- Écrire les données brutes dans raw_documents (upsert, jamais insert brut)
- Créer une entrée dans sync_runs avec le statut et le nouveau cursor
- Gérer les erreurs et les logger dans sync_runs.error_log

### Chaque appel LLM doit :
- Avoir un schéma Zod de sortie défini AVANT l'appel
- Valider la réponse avec Zod après l'appel
- Si validation échouée : retry 1 fois avec prompt correctif, sinon marquer extraction_failed
- Logger l'entrée et la sortie en dev (pas en prod)
- Timeout 60 secondes, retry 2 fois avec backoff

### Chaque endpoint API doit :
- Valider les paramètres d'entrée avec Zod
- Retourner du JSON structuré
- Gérer les erreurs avec des codes HTTP corrects
- Ne jamais exposer de données brutes (raw_documents) — toujours des objets canoniques

---

## Logs obligatoires

Chaque pipeline doit logger :
- Début de sync (source, run_id)
- Nombre d'objets traités
- Nombre d'objets ignorés (skipped)
- Nombre d'erreurs
- Durée totale

Format : { source, run_id, duration_ms, items_processed, items_skipped, items_failed }

---

## Workflow de développement

### Avant de coder une tâche
1. Lire la description de la tâche dans le doc "08 — Roadmap"
2. Vérifier que les tables nécessaires existent dans le doc "04 — Data Model SQL"
3. Vérifier que les schémas Zod correspondants existent dans /src/schemas

### Après avoir codé
1. Le code compile sans erreur TypeScript
2. Les tests Vitest passent
3. Les schémas Zod valident correctement
4. Aucune nouvelle dépendance non autorisée n'a été ajoutée
5. Aucune table SQL n'a été modifiée sans autorisation
6. Tous les fichiers font moins de 300 lignes
7. Idempotence vérifiée sur les opérations d'écriture

### Gestion du contexte entre sessions

Quand un nouvel agent (Claude, Windsurf, Codex) démarre une session :
1. Il lit AGENTS.md (ce fichier)
2. Il lit le doc pertinent dans le Hub Notion (docs 01 à 08)
3. Il regarde l'état actuel du code (quels fichiers existent, quels tests passent)
4. Il ne présume JAMAIS de ce qui a été fait avant — il vérifie
Toujours vérifier @roadmap.md pour savoir quelle tâche exécuter ensuite.