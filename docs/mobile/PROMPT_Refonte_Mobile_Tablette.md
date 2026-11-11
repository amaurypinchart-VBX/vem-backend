# PROMPT — VEM sur téléphone et tablette : corrections puis nouveau système visuel

> À donner tel quel à une session Claude Code sur ce dépôt, **phase par phase** (une phase = une
> session / une PR). Point de départ : l'audit `docs/mobile/AUDIT_Mobile_Tablette.md` (11.11.2026),
> dont les numéros (S1, M2, P1, H1…) sont repris ici. Décisions d'A. Pinchart à prendre avant la
> phase M2 : § 9.

## 1. Rôle et contexte

Tu es intégrateur front-end senior, spécialiste iPhone Safari, iPad Safari, Android Chrome /
Firefox. VEM (`public/`) est une app **sans framework ni bundler** : `index.html` + `css/app.css` +
19 scripts numérotés qui partagent des variables globales et construisent l'interface en chaînes
HTML avec ≈ 2 800 lignes de `style="…"` en dur. Les équipes l'utilisent **sur chantier, au
téléphone, souvent en 4G, parfois avec des gants**, et les chefs de projet sur ordinateur et iPad.
A. Pinchart n'est pas développeur : réponses courtes, en français ; il valide sur son iPhone.

Lis `CLAUDE.md` (déploiement Railway, conventions, check-lists, daily, planning de montage) avant
de commencer.

## 2. Règles (non négociables)

1. **L'ordinateur ne change pas**, sauf ce qui est explicitement demandé (bugs H1, S12, toasts du
   Studio) : au-dessus de 1180 px, captures avant / après identiques (§ 8).
2. **Pas de framework, pas de bundler, pas de réécriture globale.** On ajoute des classes CSS et de
   petits utilitaires JS ; on remplace les `style="…"` **seulement là où on touche**, par des classes.
3. **Un seul endroit par règle** : la mise en page tactile vit dans `public/css/responsive.css`
   (nouveau, chargé après `app.css` et `briefing-next.css`) ; la gestion des fenêtres / historique
   dans `public/js/20-mobile-ui.js` (nouveau, chargé en dernier). Pas de nouveau `@media` dispersé
   dans les scripts, sauf composants autonomes déjà ainsi (check-lists, WhatsApp).
4. **Points de rupture** : téléphone `≤ 640 px`, tablette `641–1180 px`, ordinateur `> 1180 px` ;
   et, indépendamment de la largeur, `(pointer: coarse)` = doigt (cibles ≥ 44 px, pas de survol).
5. Pas de `100vh` : `100dvh` (repli `100vh`). Zones de sécurité : `viewport-fit=cover` +
   `env(safe-area-inset-*)`.
6. Chaque phase se termine par : `node tests/mobile/audit.mjs` (0 débordement, 0 bouton caché sur
   les 6 appareils, § 8), captures ordinateur identiques, mise à jour de `CLAUDE.md` (une puce
   courte), et la **liste de recette** du § 8 à faire sur son iPhone.

## 3. Phase M0 — filet de sécurité (déjà fait en partie)

- `tests/mobile/audit.mjs` + `fixtures.sql` + `README.md` existent (débordement, boutons cachés,
  petites cibles, captures sur 6 appareils).
- **À ajouter** : `tests/mobile/desktop-shots.mjs` = captures 1440 × 900 et 1920 × 1080 de chaque
  page / onglet / fenêtre, comparées pixel par pixel à celles du commit précédent (comme
  `plans/e2e/run-desktop-shots.mjs`). Toute différence non voulue bloque.
- Étendre `audit.mjs` : vérifier qu'aucun élément ne dépasse dans les fenêtres ouvertes, et que
  toute fenêtre ouverte masque la barre du bas.

## 4. Phase M1 — corrections bloquantes (sans changer le look)

Objectif : plus aucune page qui glisse de côté, plus aucune fenêtre qui se ferme toute seule ou
dont on n'atteint pas « Enregistrer », plus de sortie de l'app au geste retour.

### 4.1 Débordement horizontal (S1, S2, P1, P3, C1, E2, M7, N1–N4, F1, H2, H3)
- **D'abord `.main { min-width: 0 }`** (`app.css:39`) : à lui seul il ramène la page projet de 477 → 0 px
  de débordement sur iPad portrait et 207 → 0 en paysage (essai de l'audit, § 4).
- Garde-fou : `html, body { overflow-x: clip; }` (pas `hidden` : `clip` ne casse pas
  `position: sticky`) ; `min-width: 0` sur les enfants de `.grid-*`, `.card`, `.card-body`,
  `.main` ; grilles en `minmax(0, 1fr)`.
- **Corriger chaque source** (le garde-fou ne suffit pas, il coupe) : `.sbar` et `.card-header`
  avec retour à la ligne ; `.btn-xs { padding: 3px 8px; font-size: 11px; }` ; grilles en dur de
  la fenêtre daily (`index.html:869`), du nouveau projet, des contacts, des camions, de l'analyse
  des temps, des bookings (`minmax(min(340px,100%),1fr)`) ; rangées de boutons des cartes Handover
  et des fichiers ; lignes de tâches (date / responsable sur une 2ᵉ ligne au téléphone).
- **Planning du dashboard** (P1), correctif minimal : le Gantt dans une zone qui défile
  (`overflow-x: auto`), colonne des noms collante (`position: sticky; left: 0`) de 120 px au
  téléphone, largeur de jour fixe (28 px), barre de défilement visible, ouverture centrée sur
  aujourd'hui. (La vue agenda vient en M2.)
- iPad (S2) : de 769 à 1180 px, barre latérale repliée en icônes par défaut (mode existant
  `body.nav-collapsed`), grilles `.grid-2-1` / `.stat-grid` qui se replient, `.pg-actions` qui
  passe à la ligne.

### 4.2 Fenêtres (M1–M8, S3, S5, C3, C4, A1)
Dans `20-mobile-ui.js`, un **gestionnaire de fenêtres** unique :
- Il repère toute fenêtre ouverte (`.overlay.open`, `.overlay` ajoutée au `body`, `.ap-ov`,
  `#clf-view`, Studios) par un `MutationObserver` — aucun écran n'a besoin d'être réécrit pour en
  profiter.
- Tant qu'une fenêtre est ouverte : classe `body.has-sheet` → barre du bas, menu ＋ et bouton 🤖
  masqués ; **défilement de la page bloqué** (méthode compatible iOS : `body { position: fixed;
  top: -scrollY }` puis restauration).
- **Plus aucune fermeture au tap sur le fond** : retirer les 28 écouteurs listés en M1 de l'audit
  (et n'en remettre aucun). Fermeture = ✕, Annuler, ou retour (4.3). Si un champ a changé
  (`input` / `change` dans la fenêtre) → « Quitter sans enregistrer ? ».
- **Une seule zone qui défile** au téléphone : les listes internes à hauteur fixe (daily création
  `index.html:894/916/934/961`, édition `04:588/628`, nouveau projet `index.html:676/704`,
  handover `05:370`) passent à hauteur libre ≤ 640 px.
- **Pied collant** : nouvelle classe `.modal-foot` (`position: sticky; bottom: 0`, fond opaque,
  marge `env(safe-area-inset-bottom)`, boutons qui passent à la ligne, action principale à
  droite / pleine largeur au téléphone). La poser sur la rangée de boutons de **chaque** fenêtre
  (statique et générée), en commençant par : daily (nouveau, lecture, édition, envoi), handover
  (vue, édition, envoi), check-list (configuration, export), camion, booking, projet, tâche,
  visite, demande d'infos, planning de montage › Envoyer.
- Feuille au téléphone : `.modal` en plein écran (`100dvh`), en-tête collant avec ✕ à gauche ou à
  droite (constant partout), marges de l'en-tête = marges de la fenêtre (C3).
- Ne pas rouvrir une fenêtre déjà ouverte (M6) : l'overlay porte un `id` stable, on sort si
  présent ; indicateur de chargement sur la carte touchée.
- Contenu qui arrive après coup (M5, P5) : place réservée (`min-height`) ; cocher une tâche du daily
  met à jour la ligne sans recharger la liste.
- Éditeur du planning de montage et autres plein écrans : au-dessus de la barre (z-index ≥ 10000).
- **Échelle des z-index** (variables CSS, documentées dans `app.css`) : page < barre du bas (100) <
  fenêtres (1000) < plein écrans / Studios (2000) < menus et bulles (3000) < toasts (4000).

### 4.3 Retour arrière (S4)
- `goto(page)` et `openProject(id)` ajoutent une entrée d'historique (`history.pushState`) ;
  `popstate` revient à la page précédente sans en ajouter.
- Ouvrir une fenêtre ajoute une entrée ; retour = fermer la fenêtre du dessus (avec la question
  « Quitter sans enregistrer ? » si besoin). Fermer par ✕ consomme l'entrée (`history.back()`
  contrôlé, sans double fermeture).
- Rechargement de la page : revenir sur la même page / le même projet (état dans l'URL,
  `?p=project&id=…`), pas sur le dashboard.

### 4.4 Bugs isolés
H1 (`generateHandoverPDF` absente → brancher sur l'export PDF existant du handover), M8 (fermer
après suppression réussie seulement), M9 (photos ajoutées et non remplacées, réponse vérifiée,
réduction comme `checklistShrinkPhoto`), S6 (onglet Tickets → voir § 9, badge stylé), S7 (onglet
actif recalculé, un seul ☰), S10 (`color-scheme: dark`), S12 (connexion centrée), E3 (pas de focus
automatique au doigt), C2 (onglet actif ramené à l'écran + indicateur), B3 (impression : ouvrir la
fenêtre dans le clic, la remplir ensuite), B4 / A1 (toasts au premier plan), X2 (demande d'infos :
garder les réponses tapées après une erreur), X4 (pages publiques en 16 px).

**Critère de fin M1** : `audit.mjs` = 0 débordement et 0 bouton caché sur les 6 appareils ; captures
ordinateur identiques ; recette § 8 points 1 à 6 validée par A. Pinchart sur iPhone.

### 4.5 État de M1 (11.11.2026)

**Fait** (commit « Téléphone / tablette M1 ») : 4.1 en entier (`.main { min-width: 0 }` +
`overflow-x: clip`, recherche / en-têtes de carte / rangées de boutons qui passent à la ligne,
`.btn-xs`, grilles du daily, des contacts, des camions, des bookings, carte et vue handover,
fichiers, lignes de tâches, planning du dashboard défilant avec noms collants, iPad = barre
latérale en icônes par défaut) ; 4.2 (`20-mobile-ui.js` : `body.has-sheet`, page bloquée, plus
aucune fermeture au tap sur le fond, une seule zone qui défile au téléphone, pied collant au
téléphone, double ouverture du daily, contenu qui ne bouge plus, en-tête des fenêtres aligné,
`dvh` dans l'envoi du planning de montage) ; 4.3 (historique, `#projet/<id>`) ; 4.4 : H1, M8, M9,
S6, S7 (onglet actif), S10, S12, E3, C2, B3, B4 / A1 (toasts), X2, X4, et X3 (signature).

**Résultat** (`tests/mobile/audit.mjs`) : 0 px de débordement sur iPhone 14, Android 360 et iPad
portrait / paysage, sur toutes les pages, onglets et fenêtres ; 0 bouton d'action caché au
téléphone (sur iPad, 3 signalements étaient des boutons plus bas dans une fenêtre qui défile,
atteignables en défilant — l'outil ne les compte plus).
Ordinateur (`desktop-shots.mjs`, 1440 et 1920) : identique au pixel, sauf les icônes calendrier /
horloge des champs date / heure, désormais visibles (S10, voulu).

**Reporté** : échelle complète des z-index (seuls les toasts sont remontés), pied collant sur
tablette, S7 (deux ☰), S8, S11, S13, S14, M10, M11, P2, P4, N4 (analyse des temps), E1 (équipe en
cartes), F3, F4, F6, A2, Studios (B1–B8), visionneuse 3D, Plan 2D Studio, planning public →
M2 / M3 / M4.

## 5. Phase M2 — nouveau système visuel téléphone (≤ 640 px)

Principe : **VEM au téléphone = l'outil du chantier**. On garde les couleurs (fond sombre, rouge
Viewbox) mais on change la structure. Tout est en classes CSS (§ 7), plus de mise en page en dur
dans les écrans touchés.

### 5.1 Coque
```
┌─────────────────────────────┐
│ ‹  Salon Audi Bruxelles   🔔 │  barre du haut : retour (si sous-page) · titre · cloche
├─────────────────────────────┤
│                             │
│          contenu            │  une seule zone qui défile
│                             │
├─────────────────────────────┤
│ 🏠      🏗️     ⊕     📓   ☰ │  barre du bas : 4 destinations + action
│Accueil Projets    Daily Plus│  (masquée dès qu'une fenêtre est ouverte)
└─────────────────────────────┘
```
- Barre du haut : sur une sous-page (projet, daily), **‹ retour** à la place de ☰ ; titre = nom du
  projet ; avatar et ☰ du haut supprimés (ils sont dans « Plus »).
- Barre du bas (proposition, § 9-1) : **Accueil · Projets · ⊕ · Daily · Plus**. « Plus » = feuille
  avec le reste du menu (Handover, Visites, Équipe, Templates, Notifications, Profil, Formation,
  Déconnexion).
- ⊕ = **feuille d'actions** (pas une pile de boutons flottants) : Daily report · Point de visite ·
  Photo sur la check-list · Handover — et si aucun projet n'est ouvert, d'abord « Pour quel
  projet ? » (projets en cours en premier).
- Toasts en bas au centre, au-dessus de la barre, sans capter les taps.
- Bouton 🤖 : dans « Plus » (et dans ⊕ pour les rôles qui y ont droit).

### 5.2 Accueil (« Aujourd'hui »)
```
 Bonjour Amaury · mer. 11 nov.
 ┌ SUR SITE AUJOURD'HUI ───────┐
 │ Salon Audi Bruxelles   J2/4 │  carte : nom, phase, jour n / durée,
 │ 🏗 Installation · 8 pers.   │  check-list 34 / 99, daily du jour fait ✓ / à faire
 │ ☑ 34/99   📓 à faire  [Ouvrir]│
 └─────────────────────────────┘
 CETTE SEMAINE / LA SEMAINE PROCHAINE   ← agenda (remplace le Gantt au téléphone)
  lun 16  BMW Liège — 🚛 chargement
  mar 17  Salon Audi — 📦 démontage
```
- Planning au téléphone = **agenda par semaine** (liste chronologique des débuts / fins de phase,
  camions, arrivées d'équipe), bouton « Vue Gantt » qui ouvre le Gantt défilant de M1 en plein
  écran paysage.
- Statistiques (projets actifs…) en une ligne compacte, ou retirées (§ 9-2).

### 5.3 Projet
- En-tête compact : nom, client · numéro, puce de statut (touchable = changer le statut), une
  rangée de **2 actions principales** selon la phase (ex. « 📓 Daily du jour », « ☑ Check-list ») +
  **⋯** = feuille avec toutes les autres (Modifier, Demander des infos, Rapport IA, Handover,
  Tâches, Archiver).
- Onglets **collants** sous la barre du haut, défilant de côté avec l'actif centré, ou menu
  « Section ▾ » (§ 9-3).
- Contenus en **cartes / lignes** (jamais de tableau) : équipe (avatar, rôle en français, 📞 et ✉️
  cliquables), camions, bookings, fichiers (nom sur toute la largeur, actions dans ⋯), handover.
- Fichiers / PDF : liste avec miniature réduite, « Ouvrir » (nouvel onglet ou partage natif), pas
  de PDF dans un cadre.

### 5.4 Fenêtres = feuilles plein écran
```
┌─────────────────────────────┐
│ ✕   Modifier le rapport      │ en-tête collant
├─────────────────────────────┤
│ Date        [11/11/2026]    │
│ Météo       [☀️ Ensoleillé ▾]│ une colonne, champs 48 px, libellés au-dessus
│ Journal                      │
│  07:30  Arrivée équipe…   ⋯ │
│  ＋ Ajouter une ligne        │
│ …                           │
├─────────────────────────────┤
│ [ Annuler ]  [ Enregistrer ] │ pied collant, toujours visible
└─────────────────────────────┘
```
- Les suppressions dans une ligne passent par ⋯ (ou glisser vers la gauche + « Annuler » dans un
  toast), jamais un ✕ de 20 px à côté d'un champ.
- Saisie : `inputmode` / `autocomplete` / `enterkeyhint` justes, sélecteurs date / heure natifs,
  photo = appareil photo direct (`capture`) avec ajout en série.

### 5.5 Outils lourds au téléphone (§ 9-4)
Briefing Studio, planning de montage, Plan 2D Studio, visionneuse 3D : **consultation** au téléphone
(slides / planning en plein écran, PDF, partager) avec la mention « modification sur tablette ou
ordinateur ». Le diaporama check-list reste l'exemple à suivre (plein écran, gros boutons, gestes).

## 6. Phase M3 — tablette (641–1180 px) et doigt

- Barre latérale en icônes (64 px) par défaut, dépliable en surimpression ; contenu sur deux
  colonnes quand il y a la place (iPad paysage = presque l'ordinateur, iPad portrait = une
  colonne large + panneaux repliables).
- `(pointer: coarse)` partout : cibles ≥ 44 px, pas d'information seulement en infobulle (`title`),
  pas d'effet de survol qui reste collé, pas de glisser-déposer HTML5 sans alternative (▲▼ ou
  appui long + déplacer).
- Gantt du dashboard et planning de montage : poignées ≥ 44 px, glisser au doigt, pincer pour zoomer
  la période ; menus et bulles qui restent dans l'écran.
- Briefing : **Studio Next** rendu pleinement tactile (barre d'outils sur une ligne défilante avec
  libellés, poignées à l'échelle, sélection multiple sans Maj, `dvh`) ; Studio Fabric : seulement
  les corrections B4 / B5 / B7 / B8, pas d'investissement (recommandation de l'audit).
- Visionneuse 3D : `<head>` + viewport, contrôles au doigt (1 doigt tourne, 2 doigts pincent /
  déplacent), panneaux repliables. Plan 2D Studio : `100dvh`, cotes éditables au doigt.

## 7. Phase M4 — système visuel global (toutes tailles, sur décision § 9-5)

- **Jetons** dans `:root` : espacements 4 / 8 / 12 / 16 / 24 / 32, rayons, ombres, échelle de texte
  (12 / 14 / 16 / 20 / 24), z-index (§ 4.2), couleurs sémantiques (succès, alerte, danger, info,
  phase installation / démontage) — remplacer les couleurs en dur (`#111318`, `#f4a261`…).
- **Composants** (classes) : bouton (primaire, secondaire, fantôme, danger, icône ; tailles
  s / m / l), puce de statut, carte, ligne de liste, feuille, feuille d'actions, onglets
  segmentés, champ + libellé + aide + erreur, barre d'outils, toast, état vide, squelette de
  chargement. Une page « Kit d'interface » cachée (`?ui-kit`) qui les montre tous, pour vérifier
  d'un coup d'œil sur chaque appareil.
- **Typographie** : Syne seulement pour le titre de page (≤ 20 px au téléphone, elle est très
  large) ; Inter pour le reste ; libellés de statut / rôle en français partout (P4).
- **Icônes** : les emoji s'affichent différemment sur iPhone, Android et Windows (tailles,
  couleurs, certains absents) → jeu d'icônes SVG en ligne (style Lucide, sous licence libre) pour
  la navigation et les actions ; emoji conservés dans les contenus.
- **Thème clair** optionnel pour le soleil sur chantier (§ 9-6), grâce aux jetons.
- **App installable** (§ 9-7) : manifeste, icônes, `theme-color`, `viewport-fit=cover` ; chargement
  à la demande de Fabric / jsPDF / html2canvas (S14). Tester alors téléchargements, impression et
  `window.open` en mode installé.

## 8. Validation à chaque phase

**Automatique** (doit passer avant de pousser) :
1. `node tests/mobile/audit.mjs` → `out/resume.txt` vide de débordement et de bouton caché.
2. `node tests/mobile/desktop-shots.mjs` → aucune différence ordinateur non voulue.
3. `npx tsc --noEmit -p .` si le backend est touché.

**Recette sur appareils** (A. Pinchart, iPhone + un Android + un iPad si possible) :
1. Daily : ouvrir un rapport, le modifier, défiler très vite de haut en bas plusieurs fois (en
   commençant en haut, au milieu, tout en bas) → ne se ferme jamais, « Enregistrer » toujours
   visible ; enregistrer.
2. Nouveau daily depuis ⊕ : 3 photos d'affilée, 2 lignes de journal au clavier, enregistrer.
3. Geste retour (bord gauche iPhone, retour Android) avec une fenêtre ouverte → la fenêtre se
   ferme (question si saisie), on reste dans VEM.
4. Dashboard : aucune page qui glisse de côté ; planning lisible.
5. Projet : changer d'onglet sans remonter ; handover → PDF, lien de signature.
6. Check-list : diaporama, photo, retour.
7. iPad portrait et paysage : dashboard, projet, daily, Briefing.
8. Page de signature client : signer, tourner le téléphone, signer encore.

## 9. Décisions à prendre (A. Pinchart) — avec recommandation

1. **Barre du bas** : Accueil · Projets · ⊕ · Daily · Plus ? *(recommandé ; « Tickets » sort car
   le module est caché ailleurs)* — ou adaptée au rôle (installateur : Mes chantiers · Daily ·
   Check-list) ?
2. **Accueil au téléphone** : « Aujourd'hui » (chantiers du jour + agenda) au lieu des chiffres et du
   Gantt ? *(recommandé)*
3. **Onglets du projet au téléphone** : barre d'onglets collante qui défile *(recommandé, proche de
   l'existant)* ou menu « Section ▾ » ?
4. **Briefing Studio, planning de montage, Plan 2D, 3D au téléphone** : consultation seulement
   *(recommandé)* ou modification complète ?
5. **Système visuel global (M4)** : maintenant, après M1–M3, ou seulement les jetons ?
6. **Thème clair** pour le chantier : oui / non / plus tard ?
7. **App installable** sur l'écran d'accueil (sans barres Safari) : oui / non ?
8. Ordre : M1 tout de suite (corrections, sans changement visible au-delà des bugs), puis M2
   téléphone, M3 tablette ? *(recommandé)*

## 10. Fichiers concernés (repères)

`public/index.html` (coque, fenêtres statiques, `<head>`), `public/css/app.css`,
`public/css/responsive.css` (nouveau), `public/js/20-mobile-ui.js` (nouveau),
`01-core.js` (goto, planning, visionneuse, 🤖), `02-detail-loaders.js` (onglets projet),
`03-create-forms.js` (showModal, daily nouveau, photos, toasts), `04-edit-clients-templates.js`
(daily édition, tâches), `05-templates-trucks-reports.js` (handover), `07-auth-mobile-daily-ai.js`
(barre du bas, daily lecture, handover carte, connexion), `08-visits-remarks.js` (fichiers),
`09-files-team-users.js`, `10-logistics-bookings.js`, `11…14` + `briefing-next*` (Briefing),
`15-checklists.js`, `16-daily-attachments.js`, `19-assembly-plan.js`, pages publiques
`sign-handover.html`, `info-request.html`, `planning-public.html`, `viewer3d.html`,
`plan2d-studio.html`. Outils : `tests/mobile/`.
