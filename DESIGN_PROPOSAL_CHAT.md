# PROPOSITION DE REFONTE UX/UI — PAGE CHAT IA (/chat) - VISION "LEVEL UP"

## L'objectif : Passer d'un simple Chat à un véritable "Business Copilot"

L'audit initial corrigeait les défauts d'interface (layout, boutons moches). Mais pour apporter une **vraie valeur business**, l'interface ne doit pas juste être "jolie" : elle doit te faire gagner du temps et rendre visible la puissance du *Business Memory Layer* (BML). 

Voici la vision "Level Up" avec 3 fonctionnalités à fort impact (Power Features) intégrées au design.

---

## 1. Les 3 "Power Features" (Ce qui change la donne)

### A. La Transparence de la Mémoire ("Memory Cards")
Actuellement, l'IA exécute des actions en arrière-plan, mais la richesse de ta base de données (le BML) n'est pas palpable. 
**L'idée :** Quand le chat récupère des données (ex: "Quel est mon résumé pipeline ?"), plutôt que de vomir du texte plat, l'interface doit afficher une carte structurée native (ex: une "Pipeline Card" injectée directement dans le chat, avec des chiffres clairs, ou une "Contact Card" pour un lead).
*Impact Business : Rendre l'information immédiatement lisible et exploitable, sans lire 3 paragraphes de texte généré par l'IA.*

### B. Les "Quick Actions" Contextuelles
Souvent, tu vas sur le chat pour les mêmes tâches répétitives. Devoir taper "Ajoute un contact nommé Thomas Pinet..." est long.
**L'idée :** Au-dessus du champ de texte vide, afficher 3 à 4 "Pilules d'actions rapides" (ex: `⚡ Créer un Lead`, `📝 Ébaucher un Post LinkedIn`, `🧠 Faire le point sur la semaine`). 
Cliquer sur une pilule pré-remplit le prompt ou déclenche directement le workflow.
*Impact Business : Zéro friction. Le chat te guide vers les actions les plus rentables sans effort cognitif.*

### C. Le mode "Deep Thinking" (Feedback Système)
Quand tu demandes à l'IA d'analyser ton historique ou de croiser des données Notion/YouTube, le backend travaille fort, mais le front-end affiche juste un bouton grisé. Tu ne sais pas ce qui se passe.
**L'idée :** Afficher un vrai pipeline visuel de la pensée de l'IA pendant le chargement (ex: "🔍 Recherche dans BML...", puis "⚙️ Exécution outil CRM...", puis "✍️ Rédaction de la réponse...").
*Impact Business : Bâtir la confiance. Tu sais exactement sur quelles données ton Copilote se base pour te répondre.*

---

## 2. L'Architecture UX/UI (La fondation)

Pour supporter ces Power Features, le layout doit être robuste et industriel :

### Le Layout "2 Colonnes Pro"
- **Sidebar Gauche (Historique) :** 
  - Regroupement intelligent : "Aujourd'hui", "Cette Semaine", "Plus ancien".
  - Titres générés tronqués proprement.
  - Bouton "+ Nouvelle interaction" mis en évidence.
- **Zone Principale (Droite) :** 
  - Pleine hauteur (100% de l'écran, fini la boîte limitée à 470px).
  - Un champ de saisie (Textarea) qui grandit automatiquement, avec gestion native du `Shift+Entrée` pour structurer de longs briefs.
  - Raccourci clavier (ex: `Cmd+K`) pour focaliser immédiatement le champ de chat.

### Design des messages
- **Bulles différenciées :** Une UI propre avec l'avatar BML pour les réponses de l'assistant.
- **Markdown Pro :** Support parfait des listes, du gras, et des retours à la ligne via une librairie robuste (`react-markdown` si possible, sinon une refonte de la fonction actuelle) pour que les brouillons LinkedIn ou les résumés soient formatés de façon irréprochable.

---

## 3. Plan d'exécution technique

1. **Restructurer le Layout** : Flexbox 2 colonnes (Sidebar historique + Main Chat Area).
2. **Implémenter les Quick Actions** : Coder les pilules cliquables au-dessus de l'input vide.
3. **Améliorer le feedback "Tool Calls"** : Remplacer les badges verts actuels par un système de logs d'étapes (Deep Thinking) et des cartes d'exécution propres.
4. **Refondre l'Input** : Composant `textarea` auto-resize avec gestion des events clavier.
