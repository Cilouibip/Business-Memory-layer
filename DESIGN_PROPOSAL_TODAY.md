# PROPOSITION DESIGN — DASHBOARD /TODAY

## 1.1 — Design System proposé

**Inspiration** : Vercel, Linear, Raycast. Un design clair, aéré, où la donnée prime, avec un mode sombre élégant.

### Palette de couleurs (Tailwind)
*La palette s'appuiera sur les couleurs natives de Tailwind (Slate pour les neutres, Indigo/Emerald/Rose pour les accents).*

- **Mode Clair (Light)**
  - Background principal : `bg-slate-50`
  - Surfaces (Cards) : `bg-white` avec bordure `border-slate-200` et ombre `shadow-sm`
  - Texte Primaire : `text-slate-900`
  - Texte Secondaire : `text-slate-500`
- **Mode Sombre (Dark)**
  - Background principal : `bg-slate-950`
  - Surfaces (Cards) : `bg-slate-900` avec bordure `border-slate-800` et ombre désactivée
  - Texte Primaire : `text-slate-50`
  - Texte Secondaire : `text-slate-400`
- **Couleurs d'Accents (Sémantiques)**
  - Primaire (BML/Marque) : `indigo-600` (light) / `indigo-500` (dark)
  - Succès (Pipeline won, tâches faites) : `emerald-600` (light) / `emerald-500` (dark)
  - Warning (Cadence lente, retards) : `amber-500`
  - Danger (Erreur API, baisse vues) : `rose-600` (light) / `rose-500` (dark)

### Typographie
- **Font** : `Geist` (ou `Inter` si Geist n'est pas dispo). Propre, ultra lisible pour les interfaces denses.
- **Hiérarchie** :
  - Titres de section : `text-lg font-semibold tracking-tight`
  - Chiffres clés (KPIs) : `text-3xl font-bold tracking-tighter`
  - Texte standard : `text-sm`
  - Métadonnées / timestamps : `text-xs text-muted-foreground`

### Espacements & Formes
- **Gaps** : Grille avec `gap-6` entre les blocs.
- **Paddings** : `p-6` ou `p-5` dans les grandes cards pour laisser respirer.
- **Radius (Coins)** : `rounded-xl` pour les grandes surfaces (Cards), `rounded-md` pour les éléments interactifs (boutons, badges).

### Gestion Dark Mode
- Utilisation de `next-themes` pour gérer la classe `dark` sur la balise `<html>`.
- Les variables CSS dans `globals.css` définiront le `--background`, `--foreground`, `--card`, etc.

---

## 1.2 — Structure du dashboard /today

L'objectif est d'avoir une lecture "en Z" : des KPIs globaux en haut, puis les actions urgentes, puis les datas d'analyse.

```text
[Header] Bonjour Mehdi 👋 (Date)                    [Actions: + Tâche | 🔄 Sync | ✍️ Draft]

[ Ligne 1 : Les 4 KPIs Vitaux (4 colonnes) ]
| CA du mois (Pipeline) | Vues YouTube 30j  | Engagement LinkedIn 30j | Tâches restantes |

[ Ligne 2 : L'Opérationnel & L'Action (2/3 gauche, 1/3 droite) ]
+------------------------------------------+ +-----------------------------------------+
| Pipeline Commercial                      | | Draft LinkedIn du jour                  |
| [Barre de progression des statuts]       | | [Contenu flouté/clampé avec focus]      |
| Liste des deals chauds / à relancer      | | [Boutons : Approuver | Éditer | Rejeter] |
+------------------------------------------+ +-----------------------------------------+

[ Ligne 3 : L'Exécution (2/3 gauche, 1/3 droite) ]
+------------------------------------------+ +-----------------------------------------+
| Priorités du jour (Tâches)               | | Cadence de publication                  |
| [x] Relancer X                           | | YT : X jours ago (Warning si > 7)       |
| [ ] Configurer onboarding Y              | | LI : Y jours ago (Warning si > 3)       |
+------------------------------------------+ +-----------------------------------------+

[ Ligne 4 : L'Analyse & Le Système (2 colonnes égales) ]
+------------------------------------------+ +-----------------------------------------+
| Mémoire BML (Recherche)                  | | État du système (Sync Status)           |
| [Barre de recherche globale]             | | 🟢 Notion (il y a 2h)                   |
| 3 derniers faits / chunks ajoutés        | | 🟢 YouTube (il y a 3h)                  |
|                                          | | 🔴 LinkedIn (Erreur)                    |
+------------------------------------------+ +-----------------------------------------+
```

---

## 1.3 — Composants UI proposés

1. **KPI Card**
   - Look : Fond uni, icône subtile en filigrane, gros chiffre.
   - Variantes : Affichage d'un badge "+X%" en vert ou "-Y%" en rouge à côté du chiffre.
2. **Pipeline Mini (Nouveau)**
   - Look : Une barre horizontale empilée (stacked bar) représentant la proportion de Leads / Qualified / Proposal.
   - En dessous : liste des 3 deals avec l'action "due today".
3. **Task Item (Refonte)**
   - Look : Checkbox circulaire personnalisée. Barre latérale de couleur selon priorité (rouge=urgent, bleu=medium).
   - Interaction : Hover state pour faire apparaître le bouton delete/edit.
4. **Draft Card (Refonte)**
   - Look : Carte mise en avant (border primaire). Le texte est partiellement affiché avec un effet de fondu (gradient mask) si trop long pour inciter à lire. Boutons d'actions très distincts.
5. **Sync Status Badge**
   - Look : Design style "Server Status" de Vercel. Un point clignotant vert/orange/rouge + texte "Notion - 2h ago".

---

## 1.4 — Interactions proposées

- **Toggle Dark Mode** : Dans le header global du layout.
- **Boutons d'Action Rapide** : Dans le header du dashboard, des boutons "pill" pour déclencher une action sans chercher (ex: `Générer un Draft LinkedIn`).
- **Animations d'entrée** : Les cards s'affichent avec un léger fade-in + slide-up (`duration-500` et délai en cascade) lors du chargement de la page pour un effet "Dashboard premium".
- **Empty States** : Si 0 tâche ou 0 deal, affichage d'une illustration subtile (Lucide icon en grande taille grisée) avec un message encourageant.
- **Squelettes (Skeletons)** : Remplacement du texte "Chargement..." par des `Skeleton` de shadcn/ui qui pulsent doucement.

---

## 1.5 — Librairies suggérées

Pour implémenter cette vision sans alourdir le projet :

1. **next-themes** : Le standard Next.js pour le Dark Mode (facile à brancher sur Tailwind).
2. **recharts** : Pour les graphiques (si besoin de sparklines dans les KPIs). Léger et composable.
3. **framer-motion** : (Optionnel mais recommandé) Pour les animations de liste (tâches qui disparaissent avec fluidité quand on les coche) et l'apparition du dashboard.
4. **date-fns** : Pour formater les dates ("il y a 2h") de manière lisible (formatDistanceToNow).
5. **shadcn/ui (radix-ui)** : On garde la base actuelle, on ajoutera juste le composant `Skeleton` et `Tooltip`.

---

**ATTENTE DE VALIDATION :**
Mehdi, est-ce que cette direction UI/UX te convient ? Si oui, je passe à l'étape 2 (installation des libs, config Tailwind, refonte du code de `/today`).
