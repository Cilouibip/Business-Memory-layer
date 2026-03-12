# PROPOSITION DE REFONTE UX/UI — PAGE TÂCHES (/tasks)

## 1. Audit des problèmes actuels (L'existant)

Après analyse du code (`src/app/(cockpit)/tasks/page.tsx`) et de l'interface actuelle, voici les 20 problématiques majeures d'UX/UI identifiées :

### Layout & Navigation
1. **Sélecteur de vue cassé/mal placé** : Le composant `Tabs` (Kanban / Liste) affiche un comportement ou style étrange, parfois poussé sur le côté ou en bas selon le rendu.
2. **Alignement du Header** : Le champ "Nouvelle tâche" est écrasé à droite sans hiérarchie claire avec le titre de la page.
3. **Absence de filtrage** : Impossible de filtrer les tâches par priorité, source (CRM vs manuel) ou statut.

### Kanban
4. **Composants natifs disgracieux** : L'utilisation de `<select>` et `<input type="date">` natifs du navigateur donne un rendu vieillot (années 2000) et casse l'immersion SaaS.
5. **Redondance visuelle** : Les cartes affichent la priorité en badge ET juste en dessous via un sélecteur déroulant. Idem pour le statut.
6. **Actions de carte encombrantes** : Les contrôles rapides (`TaskQuickControls`) prennent trop de place verticalement dans chaque carte Kanban.
7. **Pas d'ajout rapide par colonne** : Impossible d'ajouter directement une tâche dans "En cours" ou "Fait" ; tout passe par le champ en haut.
8. **Drag & Drop très basique** : L'utilisation de l'API HTML5 native `draggable` manque de fluidité et de retours visuels modernes (pas d'animation framer-motion ou dnd-kit, effet de survol natif abrupt).
9. **Hiérarchie typographique faible** : Le titre de la tâche, la date et la source manquent de contraste et de séparation.
10. **Design des colonnes** : Les colonnes (À faire, En cours, Fait) n'ont pas de fond distinctif (ex: `bg-slate-50`), donnant une impression de flottement aux cartes.
11. **Compteurs de colonnes illisibles** : Le badge affichant le nombre de tâches dans une colonne (ex: `[ 1 ]`) manque de style et d'intégration au titre de la colonne.

### Vue Liste
12. **Tableau brut** : Le tableau HTML natif (`<table>`) manque de padding, de hover states et de style moderne.
13. **Checkboxes basiques** : La case à cocher "Done" est une simple `<input type="checkbox">` native sans style.
14. **Édition rapide surchargée** : La colonne "Quick edit" du tableau affiche encore les selects natifs, cassant l'alignement vertical des lignes.
15. **Manque de tri** : Impossible de cliquer sur les en-têtes de colonne pour trier (ex: par date d'échéance ou priorité).
16. **Pas d'actions groupées** : On ne peut pas sélectionner plusieurs tâches pour les supprimer ou changer leur statut.

### Création & Interactions
17. **Création limitée** : Le champ de création rapide en haut ne permet de définir que le titre. La priorité et la date doivent être modifiées *après* la création.
18. **Feedback de sauvegarde invisible ou intrusif** : Le message "Sauvegarde en cours..." est un simple texte en haut, loin de l'action de l'utilisateur.
19. **Iconographie confuse** : Utilisation d'emojis `📌` ou d'icônes disparates au lieu d'une bibliothèque unifiée (Lucide).
20. **Gestion des erreurs non stylisée** : Les messages d'erreur apparaissent en texte rouge brut sans composant Toast ou Alert.

---

## 2. Nouvelle Proposition UX/UI (La Cible)

Pour amener cette page au niveau 100% "Copilote IA Premium" (comme pour `/today`), voici la refonte proposée :

### A. Layout Général
- **Header épuré** : Titre à gauche, Switcher Kanban/Liste au centre (façon Vercel/Linear), Bouton principal "Nouvelle tâche" à droite qui ouvre une Modale (Dialog) complète au lieu d'un simple champ texte.
- **Barre de filtres** : Ajout d'une barre de recherche/filtrage sous le header (filtrer par Priorité, Source).

### B. Le Kanban "Premium"
- **Fonds de colonnes** : Un léger fond gris (`bg-slate-50 dark:bg-slate-900/50`) pour délimiter les 3 zones.
- **Cartes épurées** : 
  - Titre en gras.
  - Badges de style modernes pour la priorité (High = badge rouge subtil, Medium = jaune, etc.).
  - Icône Lucide pour la source (ex: Bot pour l'agent LinkedIn, Utilisateur pour manuel).
  - Un menu "3 petits points" (DropdownMenu) pour modifier la priorité/date/supprimer au lieu de gros selects moches persistants.
- **Drag & Drop** : Conservation de l'API HTML5 mais avec un meilleur style de la cible (`ring-2 ring-indigo-500 bg-indigo-50/50`).

### C. La Vue Liste "DataTable"
- Remplacement du vieux tableau par un design "Data Table" moderne (façon shadcn/ui).
- Lignes aérées (`py-4`), effet de survol (`hover:bg-slate-50`).
- Checkbox stylisée (shadcn `Checkbox`) pour passer en Done.
- Sélecteurs de priorité et de statut intégrés dans des menus déroulants propres (sans cadre lourd).

### D. Création de Tâche
- **Bouton + Nouvelle Tâche** ouvre un composant `<Dialog>` shadcn avec : Titre, Description, Priorité (sélecteur shadcn), et Date (composant Popover + Calendar).

---

## 3. Plan d'exécution

1. **Création des composants UI manquants** : Si besoin, s'assurer que `DropdownMenu`, `Dialog`, `Checkbox` sont dispo, sinon on fera des sélecteurs customisés propres avec Tailwind en attendant.
2. **Refonte `TaskQuickControls.tsx`** : Abandonner les selects natifs. Créer un composant discret utilisant des icônes ou un menu pour changer l'état.
3. **Mise à jour `page.tsx`** : Implémenter le nouveau layout (Switch de vue central, Kanban stylisé, Liste stylisée).
4. **Validation des couleurs** : S'assurer que les codes couleurs (slate, indigo, rose, emerald) correspondent au Design System mis en place dans `/today`.
