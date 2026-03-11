**STATUT : VALIDÉ — Document de référence pour tout agent qui implémente le système de tâches.**

**Auteur** : Claude CTO #3 (12 mars 2026)

**Validé par** : Mehdi

**Rattaché à** : Roadmap V2, Phase 2

---

## 1. VISION

Le système de tâches est le centre nerveux du cockpit BML. Il est alimenté par 3 sources en parallèle et doit être la vue unifiée de TOUT ce que Mehdi doit faire.

Règle d'or : Mehdi ne devrait JAMAIS avoir à créer une tâche manuellement si un agent ou un événement business peut le faire à sa place.

---

## 2. LES 3 SOURCES DE TÂCHES

### Source 1 — Mehdi via le chat IA

Mehdi parle naturellement à l'agent. L'agent comprend l'intention et crée/met à jour les tâches.

Exemples concrets :

- "Je dois rappeler Quentin jeudi" → create_task(title: "Rappeler Quentin", due_date: jeudi, priority: high, source_type: chat)
- "C'est fait pour le call Quentin, il est chaud" → complete_task + update_deal(status: proposal) + create_task("Envoyer proposition Quentin")
- "J'ai posté le post LinkedIn" → complete_task("Publier post LinkedIn") si elle existe

Outils chat nécessaires :

- create_task(title, due_date?, priority?, description?)
- complete_task(task_id ou fuzzy title match)
- list_tasks(status?, priority?, due_date?)
- update_task(task_id, status?, priority?, due_date?, description?)

### Source 2 — Agents IA autonomes

Chaque agent qui produit un livrable crée une tâche associée.

Agent LinkedIn (existe, Phase 3 de la roadmap) :

- Après génération d'un draft → create_task(title: "Valider draft LinkedIn du jour", priority: high, due_date: aujourd'hui, source_type: agent, source_id: draft_id)
- Quand Mehdi valide le draft sur l'écran Drafts → complete_task automatiquement
- Quand Mehdi rejette le draft → create_task("Regénérer draft LinkedIn", priority: medium)

Futur agent veille (pas encore codé) :

- Génère un brief hebdo le lundi → create_task("Lire brief veille semaine", priority: medium, due_date: lundi)

Futur agent analytics :

- Détecte 5j sans post LinkedIn → create_task("Publier un post LinkedIn (5j sans publication)", priority: high, due_date: aujourd'hui)
- Détecte une vidéo YouTube qui performe → create_task("Recycler vidéo [titre] en post LinkedIn", priority: medium)

Implémentation technique :

Dans chaque agent (ex: generateDraft.ts), après le traitement principal, appeler la même fonction createTask() utilisée par le chat. Pas de code dupliqué — une seule fonction partagée.

### Source 3 — Événements business automatiques

Le BML observe ce qui se passe et réagit. 2 niveaux.

Niveau 1 — Hooks réactifs (Phase 2, faisable maintenant) :

Ce sont des triggers dans le code existant qui créent des tâches quand certaines actions se produisent.

| Événement | Trigger dans le code | Tâche créée |
| --- | --- | --- |
| Deal passe en "won" | Hook dans updateDealByContactName() quand status = won | "Configurer onboarding [client]" + "Envoyer kit bienvenue [client]" |
| Deal passe en "proposal" | Hook dans updateDealByContactName() quand status = proposal | "Préparer et envoyer proposition [client]" |
| Deal en qualif sans activité depuis 3j | Vérifié par getTodayTasks() | "Relancer [client] (3j sans activité)" |
| Nouveau post LinkedIn ingéré par le pipeline | Hook dans le connecteur LinkedIn après sync | Complète la tâche "Publier post LinkedIn" si elle existe |
| Draft LinkedIn validé dans l'écran Drafts | Hook dans la route PATCH /api/drafts quand status = approved | Complète "Valider draft LinkedIn du jour" |

Implémentation : ajouter un appel createTask() ou completeTask() à la fin des fonctions concernées dans crmQueries.ts, le pipeline d'ingestion, et les routes API drafts.

Niveau 2 — Agent orchestrateur quotidien (Phase 2-3, quelques semaines) :

Un cron daily (ex: 7h UTC, après l'agent LinkedIn de 6h) qui :

1. Récupère le contexte BML complet (buildContext)
2. Récupère les tâches en cours et les deals actifs
3. Envoie tout à Claude avec le prompt : "Analyse l'état du business. Quelles tâches créer, compléter ou mettre à jour ?"
4. Claude utilise les mêmes outils (create_task, complete_task, update_task) pour agir

Exemples de ce que l'orchestrateur détecterait :

- 2 deals en qualif sans activité depuis 3j → créer tâches de relance
- Dernière vidéo YouTube date de 2 semaines → créer tâche "Planifier prochaine vidéo"
- Post LinkedIn planifié mais pas posté → rappel
- CA mensuel en baisse → tâche "Analyser pipeline et identifier blocages"

Implémentation : nouvelle route /api/cron/orchestrator + fichier src/agents/orchestrator/dailyReview.ts. Même pattern que l'agent LinkedIn (cron Vercel + appel Claude + outils).

---

## 3. SCHÉMA TABLE TASKS

Migration 009_tasks.sql :

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL DEFAULT 'personal',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'chat', 'agent', 'hook', 'orchestrator')),
  source_id TEXT,
  related_deal_id UUID REFERENCES deals(id),
  related_contact_id UUID REFERENCES contacts(id),
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_workspace_status ON tasks(workspace_id, status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_priority ON tasks(priority);
```

Statuts : todo → in_progress → done

Priorités : low, medium, high, urgent

Sources : manual (UI), chat (via agent IA chat), agent (via agent LinkedIn etc.), hook (via trigger code), orchestrator (via cron daily)

---

## 4. ROUTES API

POST /api/tasks — Créer une tâche

Body : { title, description?, status?, priority?, due_date?, source_type?, source_id?, related_deal_id?, related_contact_id?, workspace_id? }

Retour : la tâche créée

GET /api/tasks — Lister les tâches

Query params : status?, priority?, due_date?, workspace_id?

Retour : tableau de tâches triées par priorité puis due_date

PATCH /api/tasks/[id] — Mettre à jour une tâche

Body : { status?, priority?, due_date?, title?, description? }

Si status passe à "done" : remplir completed_at automatiquement

Retour : la tâche mise à jour

---

## 5. OUTILS CHAT IA

Ajouter dans chatTools.ts (même pattern que les 6 outils CRM existants) :

create_task : tool({ description: "Crée une tâche", inputSchema: z.object({ title, due_date?, priority?, description? }) })

complete_task : tool({ description: "Complète une tâche par titre (fuzzy match) ou id", inputSchema: z.object({ task_title?: string, task_id?: string }) })

list_tasks : tool({ description: "Liste les tâches", inputSchema: z.object({ status?, priority? }) })

update_task : tool({ description: "Met à jour une tâche", inputSchema: z.object({ task_title?: string, task_id?: string, status?, priority?, due_date? }) })

Le complete_task doit faire du fuzzy matching sur le titre (même logique que resolveContactByName dans crmQueries.ts).

---

## 6. INTÉGRATION DASHBOARD /today

Refactorer getTodayTasks() dans dashboardQueries.ts pour fusionner :

1. Tâches standalone : SELECT FROM tasks WHERE status != 'done' AND (due_date <= today OR due_date IS NULL) ORDER BY priority DESC, due_date ASC
2. Relances deals : SELECT FROM deals WHERE next_action_date <= today AND status NOT IN ('won', 'lost')

Résultat unifié affiché dans le bloc "Tâches du jour" avec :

- Checkbox pour compléter (appel PATCH /api/tasks/[id] avec status: done)
- Badge priorité (couleur : urgent=rouge, high=orange, medium=bleu, low=gris)
- Source (icône : chat, agent, hook, manual)
- Bouton "+" pour ajouter une tâche manuellement

---

## 7. ÉCRAN TÂCHES DÉDIÉ (nouvel écran sidebar)

URL : /tasks

Deux vues toggle :

Vue Kanban :

- 3 colonnes : À faire | En cours | Fait
- Chaque carte : titre, priorité (badge couleur), due date, source (icône)
- Drag and drop entre colonnes (met à jour le statut)

Vue Liste :

- Tableau avec colonnes : Checkbox | Titre | Priorité | Due date | Source | Statut
- Tri par priorité puis due date
- Filtre par statut et priorité

Bouton "+ Nouvelle tâche" en haut (modal ou inline)

---

## 8. HOOKS À IMPLÉMENTER (Niveau 1)

Chaque hook est un appel à createTask() ou completeTask() ajouté dans le code existant.

Dans crmQueries.ts > updateDealByContactName() :

```
if (input.status === 'won') {
  await createTask({ title: `Configurer onboarding ${contact.name}`, priority: 'high', due_date: today+3, source_type: 'hook', related_deal_id: deal.id });
}
if (input.status === 'proposal') {
  await createTask({ title: `Envoyer proposition ${contact.name}`, priority: 'high', due_date: today+2, source_type: 'hook', related_deal_id: deal.id });
}
```

Dans generateDraft.ts, après insertion du draft :

```
await createTask({ title: 'Valider draft LinkedIn du jour', priority: 'high', due_date: today, source_type: 'agent', source_id: draft.id });
```

Dans la route PATCH drafts, quand status = approved :

```
await completeTaskByTitle('Valider draft LinkedIn');
```

---

## 9. AGENT ORCHESTRATEUR QUOTIDIEN (Niveau 2)

Fichier : src/agents/orchestrator/dailyReview.ts

Cron : 7h UTC (après l'agent LinkedIn de 6h)

Route : /api/cron/orchestrator

Flow :

1. Récupérer buildContext("revue quotidienne du business")
2. Récupérer list_tasks(status: todo) + list_tasks(status: in_progress)
3. Récupérer getPipelineSummary() + getOverdueActions()
4. Appeler Claude avec le system prompt :

"Tu es l'orchestrateur business de Mehdi. Chaque matin tu analyses l'état du business et tu crées/mets à jour les tâches nécessaires.

Règles : ne crée pas de doublon (vérifie les tâches existantes), priorise ce qui génère du revenu, max 5 nouvelles tâches par jour."

1. Claude utilise les outils create_task, complete_task, update_task pour agir
2. Log le résultat dans les logs

---

## 10. ORDRE D'IMPLÉMENTATION

1. Migration 009 + routes API (30 min)
2. Outils chat create_task/complete_task/list_tasks (1h)
3. Refactorer getTodayTasks() + affichage dashboard (1h)
4. Hooks dans crmQueries.ts et generateDraft.ts (30 min)
5. Écran Tâches dédié avec kanban + liste (2-3h)
6. Agent orchestrateur quotidien (2-3h)

Total estimé : 2-3 prompts Windsurf, 1-2 jours de travail.

---

## 11. CE QU'ON NE FAIT PAS (MVP)

- Pas de sous-tâches
- Pas d'assignation multi-utilisateur
- Pas de tags/labels
- Pas de récurrence automatique
- Pas de notifications push
- Pas de sync bidirectionnelle avec Notion

Ces features viendront avec l'usage si nécessaire.