# 06 — Rapport de contrôle qualité (Phase 4)

> Date : 24.10.2026. Le support a été contrôlé automatiquement par `_source/build.mjs` (fichier `_source/qa-auto.json`) et par un test dans Chromium, sur ordinateur et sur téléphone. Les contrôles de fond ont été faits à la main.

## Synthèse

| Contrôle | Résultat |
|---|---|
| Chaque libellé d'interface cité existe tel quel dans l'app | ✅ 317 / 317 libellés retrouvés (dans `public/index.html`, dans les écrans générés par `public/js/*.js` ou les pages publiques, et 7 libellés composés vérifiés à la main) — 0 écart |
| Aucune mention de Plans 2D / Plans Viewbox / Étude structure / Loading liste / module masqué | ✅ 0 occurrence dans le deck, le script, la fiche mémo, la checklist, le plan et les captures |
| Aucune donnée sensible ni détail technique interne | ✅ 0 occurrence (hébergeur, base de données, stockage, IA, relève, route de debug, console, messagerie interne) — voir § 3 |
| Projet fil rouge cohérent | ✅ une seule source (`_source/fil.mjs`) ; `9999DEMOVIE` partout ; `9999DEMOVI` volontaire (exemple de N° mal tapé) |
| Structure de chaque chapitre (objectif, chemin, étapes, champs, « à quoi ça sert », erreurs, exercice + récap) | ✅ voir § 4 |
| Règle du mail identique dans le deck, la fiche mémo et l'inventaire | ✅ voir § 5 |
| Vouvoiement homogène | ✅ 0 tutoiement dans le texte du support (les libellés exacts de l'app qui tutoient, ex. « Sélectionne un membre », sont cités tels quels) |
| HTML sans erreur console, navigation, impression | ✅ voir § 6 |

## 1. Libellés d'interface

**Méthode**
- Chaque libellé passé par les fonctions `q()`, `btn()`, `field()`, `tabs()`, `win()`, `menu()`, `path()` est cherché :
  - en texte exact ;
  - dans les attributs (placeholder) ;
  - sans espaces quand une balise sépare l'icône du texte (ex. `<span>📓</span> Daily Report`).
- Les fichiers parcourus sont `public/index.html`, `public/js/*.js`, `public/sign-handover.html`, `public/planning-public.html`, `public/viewer3d.html`, `public/vem-3d-integration.js` et, pour les titres de notifications, `src/routes` / `src/services`.

**Libellés composés à l'affichage (vérifiés à la main)**

| Libellé | Preuve |
|---|---|
| ⏳ À vérifier, 🟠 Partiel, ❌ Non fait, ➖ N.A. | `public/js/15-checklists.js:387-391` (icône + label) |
| 🃏 Remplir en diaporama | `public/js/15-checklists.js:807` (« 🃏 ${verb} en diaporama ») |
| 🚛 Ajouter un véhicule | `public/js/10-logistics-bookings.js:9` |
| 💾 Créer | `public/js/10-logistics-bookings.js:920, 1103` |

**Limite** : la recherche prouve que le libellé existe dans l'app. Elle ne prouve pas qu'il est sur l'écran montré par la maquette ; ce point a été vérifié à la lecture de l'inventaire (preuves `fichier:ligne`).

**Libellés volontairement cités alors qu'ils sont à « ne plus utiliser »** (visibles dans l'app, présentés comme tels) : ✅ Tâches, 📸 Visites Client, 📋 Templates tâches, 🛠️ Ticket, 📋 Plusieurs tâches, ➕ 1 tâche, Tickets SAV et Visites client (cases du Rapport IA).

Le tableau complet (libellé → slides → fichier) est à la fin de ce rapport.

## 2. Exclusions respectées

- **Plans 2D / Plans Viewbox / Étude structure / Loading liste** : aucune mention. Le chapitre « Fichiers & 3D » présente seulement les fonctions du lecteur 3D hors plans.
- **Tickets SAV, Entrepôt, Boîtes à outils** (masqués) : non présentés. Seule exception : le bouton « 🛠️ Ticket » de l'en-tête et la case « Tickets SAV » du Rapport IA, encore visibles, signalés comme « ne plus utiliser ».
- **Tâches** (décision du 24.10) : pas de module. Seulement des consignes (☐ Aucun, ne plus utiliser, décocher la section).
- **Visites client** (décision du 24.10) : pas de module, consigne « ne plus utiliser ».
- **Briefing classique et « ✨ Générer avec l'IA »** : non enseignés (Studio + 🪄 seulement).
- **Fonctions cassées** : jamais présentées comme fonctionnelles. Le contournement est enseigné (mot de passe oublié, bloc Équipe, ✏️ Modifier et véhicules, PDF handover, champs du handover, photos sur téléphone, menu de statut vide).

## 3. Confidentialité

- Aucun nom d'hébergeur, de base de données, de service de stockage, de fournisseur ou de modèle d'IA, aucune variable d'environnement, aucune clé, aucune route technique ou de debug, aucune mention de la console.
- Le support dit « l'IA » sans préciser.
- Le planning public est désigné par « l'adresse de VEM suivie de `/planning-public.html` » : c'est une page destinée aux utilisateurs (écran de l'entrepôt), sans URL d'administration. **Avertissement inclus** : la page est consultable sans mot de passe.
- L'adresse `warehouseviewbox@gmail.com` est affichée dans l'app elle-même (onglet Infos) : ce n'est pas une donnée interne.
- Le mot de passe par défaut des nouveaux comptes **n'est pas écrit** dans le support (« affiché dans la fenêtre »).
- Données d'exemple : toutes fictives (`_source/fil.mjs`), noms de domaine en `.example`, plaque `1-ABC-123`.

## 4. Structure des chapitres

| Ch. | Objectif + chemin | Étapes | Champs | Sert après | Erreurs | Exercice + récap |
|---|---|---|---|---|---|---|
| 0 Bienvenue | ✅ | ✅ | ✅ (connexion) | ✅ (cycle de vie) | ✅ (règles d'or) | — (introduction) |
| 1 Clients | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 Projet manuel | ✅ | ✅ | ✅ | ✅ (notes) | ✅ | ✅ |
| 3 Mail NEW | ✅ | ✅ | ✅ (ce que lit l'IA) | ✅ | ✅ | ✅ |
| 4 Mail projet | ✅ | ✅ | ✅ (exemples) | ✅ | ✅ | ✅ |
| 5 Fiche projet | ✅ | ✅ | ✅ (statuts, ✏️) | ✅ (projet complet) | ✅ (dans les slides) | ✅ |
| 6 Équipe | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 Logistique | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 8 Bookings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 9 Fichiers & 3D | ✅ | ✅ | ✅ (formats) | ✅ | ✅ (dans les slides) | ✅ |
| 10 Check-list | ✅ | ✅ | ✅ (statuts, règles) | ✅ (signature) | ✅ | ✅ |
| 11 Daily | ✅ | ✅ | ✅ | ✅ | ✅ (dans les slides) | ✅ |
| 12 Handover | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 13 Briefing | ✅ | ✅ | ✅ (slide → données) | ✅ | ✅ | ✅ |
| 14 Rapport IA | ✅ | ✅ | ✅ (sections) | ✅ (dans les slides) | ✅ (encadrés) | ✅ |
| 15 Dashboard | ✅ | ✅ | ✅ | ✅ (planning public) | ✅ (encadrés) | ✅ |
| 16 Pratique | Matrice, parcours A→Z, FAQ, fiche mémo | | | | | ✅ (exercice final) |

« Dans les slides » : les erreurs ou les usages sont traités dans des encadrés ⚠️ des slides d'étapes plutôt que sur une slide dédiée, pour garder une idée par slide.

## 5. Règle du mail : comparaison des trois sources

| Règle | Deck (ch. 3, 4, fiche `#memo-mail`) | `03_FICHE_MEMO_MAIL.md` | Inventaire I.2 (preuve) |
|---|---|---|---|
| Adresse warehouseviewbox@gmail.com | ✅ | ✅ | `02-detail-loaders.js:195` |
| Relève toutes les 5 min, mails non lus seulement | ✅ | ✅ | `imapPoller.ts:66, 219` |
| Création : sujet qui **commence** par NEW, casse indifférente, « TR: » bloque | ✅ | ✅ | `imapPoller.ts:94-95` |
| Séparateurs NEW: / NEW - acceptés | ✅ | ✅ | `projectFromEmail.ts:47-51` |
| N° interne pris dans le mail ou après NEW | ✅ | ✅ (implicite) | `projectFromEmail.ts:163-170` |
| N° déjà existant → rien | ✅ | ✅ | `projectFromEmail.ts:171-175` |
| Brouillon, « ⚠️ Client à confirmer », notification | ✅ | ✅ | `projectFromEmail.ts:41, 199, 239-254` |
| Sans date → date du jour | ✅ | ✅ | `projectFromEmail.ts:181-184` |
| Projet existant : N° n'importe où dans le sujet | ✅ | ✅ | `imapPoller.ts:118-123` |
| Pièces jointes → Fichiers, sans filtre de logos | ✅ | ✅ | `imapPoller.ts:155-183` |
| Réservations en brouillon ; trajet si membre déjà dans l'équipe | ✅ | ✅ | `bookingFromEmail.ts:200-305` |
| Rien n'est ajouté aux notes | ✅ | ✅ | aucun code |
| Aucun retour à l'expéditeur | ✅ | ✅ | aucun code |

## 6. Tests du HTML (Chromium via Playwright 1.56)

- **Ordinateur, 1600 × 900** :
  - 147 slides, **0 erreur ni avertissement console**, 0 erreur JavaScript ;
  - **0 débordement** : aucun élément ne dépasse le pied de slide ni le bord droit, sur les 147 slides.
- **Navigation** :
  - l'ancre `#projet-mail` ouvre le chapitre 3 ;
  - → passe à la slide suivante ;
  - S ouvre le sommaire ;
  - le compteur et la barre de progression suivent.
- **Téléphone** (390 × 844 et 844 × 390, tactile) :
  - un tap à droite fait avancer d'une slide ;
  - en portrait, un bandeau invite à tourner le téléphone ;
  - en paysage, le texte est lisible.
- **Impression** : export PDF de 147 pages, une slide par page, sans les boutons de navigation.
- **Police** : Inter, chargée depuis Google Fonts ; sans connexion, le support passe sur la police système.

## 7. Mise à jour du 24.10.2026 (modèle d'accès)

Après le commit de sécurité `362a29e`, le support a été mis à jour :
- slide « Qui peut faire quoi ? » réécrite (accès par rôle et par équipe du projet) ;
- nouvelle slide « Droits d'un installateur ou d'un ouvrier » (ch. 6) ;
- mot de passe généré à la création au lieu du mot de passe commun ;
- invitations sans le rôle Technical Manager ;
- clé d'accès du planning public ;
- FAQ « je ne vois pas un projet ».

Les contrôles automatiques ont été relancés : 0 libellé introuvable, 0 débordement, 0 erreur console.

## 8. Points ouverts

- **Captures** : 9 encadrés « [CAPTURE À FAIRE] » restent dans le deck (`05_CAPTURES_A_FAIRE.md`).
- **À confirmer en test réel** (signalés dans l'inventaire, non enseignés comme certains) : refus du `.ifc` à l'envoi, double rendu de l'onglet Logistique, comportement exact du lien « Point visite ».
- **Adresse exacte de VEM** pour le planning public : à communiquer par l'admin.

## Annexe — tous les libellés contrôlés

| Libellé | Slides | Vérification | Fichier(s) |
|---|---|---|---|
| ‹ | S7 | texte exact | public/index.html, public/js/15-checklists.js |
| ← Retour | S50 | texte exact | public/index.html, public/js/07-auth-mobile-daily-ai.js |
| ↶ | S123 | texte exact | public/js/12-briefing-studio-core.js, public/js/15-checklists.js |
| ↷ | S123 | texte exact | public/js/12-briefing-studio-core.js |
| + Ajouter | S68, S111 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/04-edit-clients-templates.js |
| + Ajouter à l'équipe | S59, S62 | texte exact | public/js/02-detail-loaders.js |
| + Ajouter contact | S14 | texte exact | public/index.html, public/js/04-edit-clients-templates.js |
| + Client | S13, S23, S36 | texte exact | public/index.html |
| + Hôtel démontage | S75 | texte exact | public/js/10-logistics-bookings.js |
| + Hôtel installation | S75, S77 | texte exact | public/js/10-logistics-bookings.js |
| + Nouveau Client | S13, S14 | texte exact | public/index.html |
| + Nouveau Handover | S110, S111 | texte exact | public/index.html, public/js/07-auth-mobile-daily-ai.js |
| + Nouveau membre | S59, S60 | texte exact | public/index.html |
| + Nouveau Projet | S21, S22, S135 | texte exact | public/index.html, public/js/03-create-forms.js |
| + Nouveau Rapport | S101 | texte exact | public/index.html, public/js/07-auth-mobile-daily-ai.js |
| + Nouvelle slide | S124 | texte exact | public/js/11-briefing.js, public/js/12-briefing-studio-core.js |
| + Point | S112 | texte exact | public/js/05-templates-trucks-reports.js, public/js/15-checklists.js |
| + Point spécifique au projet | S91 | texte exact | public/js/15-checklists.js |
| + Transport démontage | S75 | texte exact | public/js/10-logistics-bookings.js |
| + Transport installation | S75, S76 | texte exact | public/js/10-logistics-bookings.js |
| ⏭ Passer | S94 | texte exact | public/js/15-checklists.js |
| ⏭️ Sans fichiers | S122 | texte exact | public/js/13-briefing-studio-slides.js |
| ⏱️ Heures par tâche | S102 | texte exact | public/index.html, public/js/04-edit-clients-templates.js |
| ⏱ Les fichiers apparaîtront dans les 5 minutes | S40 | texte exact | public/js/02-detail-loaders.js |
| ⏳ À vérifier | S92 | composé : public/js/15-checklists.js:387 (icône ⏳ + label « À vérifier ») | — |
| ⏳ En attente | S111 | texte exact | public/js/02-detail-loaders.js, public/js/03-create-forms.js, public/js/05-templates-trucks-reports.js |
| ▭ | S123 | texte exact | public/js/12-briefing-studio-core.js |
| ★ | S15 | texte exact | public/js/03-create-forms.js, public/js/04-edit-clients-templates.js, public/js/13-briefing-studio-slides.js |
| ☐ Aucun | S25, S29 | texte exact | public/index.html |
| ☑️ Ouvrir la check-list | S96 | texte exact | public/js/15-checklists.js |
| ☑️ Templates check-list | S7, S97 | texte exact | public/index.html |
| ♻️ Restaurer le projet | S55 | texte exact | public/js/09-files-team-users.js |
| ⚙️ Configurer la check-list | S91 | texte exact | public/js/15-checklists.js |
| ⚠️ Check-list de montage incomplète | S96 | texte exact | public/js/15-checklists.js |
| ⚠️ Client à confirmer | S18, S35, S36 | texte exact | src/services/projectFromEmail.ts |
| ⚠️ Remarque | S111 | texte exact | public/js/03-create-forms.js, public/js/05-templates-trucks-reports.js, public/js/07-auth-mobile-daily-ai.js |
| ⚡ Actions rapides | S135 | texte exact | public/index.html |
| ⚡ Groupe électrogène | S69 | texte exact | public/js/10-logistics-bookings.js |
| ⚫ Retour entrepôt | S70 | texte exact | public/js/10-logistics-bookings.js |
| 🇫🇷 Français | S106, S116, S125 | texte exact | public/js/01-core.js, public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| 🇬🇧 English | S106, S116, S125 | texte exact | public/js/01-core.js, public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| ✂️ Nacelle ciseaux | S69 | texte exact | public/js/10-logistics-bookings.js |
| ✅ Ajouter | S62 | texte exact | public/js/10-logistics-bookings.js, public/js/11-briefing.js, public/js/13-briefing-studio-slides.js |
| ✅ Ajouter le véhicule | S69 | texte exact | public/js/10-logistics-bookings.js |
| ✅ Créer le client | S14 | texte exact | public/index.html |
| ✅ Créer le compte | S60 | texte exact | public/index.html |
| ✅ Créer le Handover | S111 | texte exact | public/index.html |
| ✅ Créer le Projet | S25, S29 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/03-create-forms.js |
| ✅ Devis validé | S53, S57 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| ✅ Générer | S122 | texte exact | public/js/13-briefing-studio-slides.js |
| ✅ OK | S92, S111 | texte exact | public/js/03-create-forms.js, public/js/05-templates-trucks-reports.js, public/js/07-auth-mobile-daily-ai.js |
| ✅ Tâches | S7 | texte exact | public/index.html |
| ✅ Valider et ajouter au journal | S103 | texte exact | public/index.html |
| ✅ Valider la check-list | S95 | texte exact | public/js/15-checklists.js |
| ✅ Valider la signature | S115 | texte exact | public/sign-handover.html |
| ✈️ Bookings | S27, S41, S44, S51, S75, S121 | texte exact | public/index.html, public/js/13-briefing-studio-slides.js |
| ✈️ Transport par membre | S75 | texte exact | public/js/10-logistics-bookings.js |
| ✉️ Adresses manuelles | S105 | texte exact | public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| ✉️ Email | S63 | texte exact | public/js/10-logistics-bookings.js |
| ✉️ Envoyer le PDF | S95 | texte exact | public/js/15-checklists.js |
| ✏️ Modifier | S15, S19, S27, S28, S36, S50, S54, S57, S72, S112, S121, S143 | texte exact | public/index.html, public/js/03-create-forms.js, public/js/04-edit-clients-templates.js |
| ✏️ Modifier le projet | S54 | texte exact | public/js/03-create-forms.js |
| ✏️ Saisie entrée par entrée | S103 | texte exact | public/index.html |
| ✔️ Confirmé | S55 | texte exact | public/js/02-detail-loaders.js |
| ❌ Annulé | S53, S55 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/04-edit-clients-templates.js |
| ❌ Défaut | S111 | texte exact | public/js/03-create-forms.js, public/js/05-templates-trucks-reports.js, public/js/07-auth-mobile-daily-ai.js |
| ❌ Non fait | S92 | composé : public/js/15-checklists.js:390 | — |
| ➕ 1 tâche | S50 | texte exact | public/index.html, public/js/04-edit-clients-templates.js |
| ➕ Nouveau briefing | S120 | texte exact | public/js/11-briefing.js |
| ➖ N.A. | S92 | composé : public/js/15-checklists.js:391 | — |
| ⬆️ Ajouter | S82, S83 | texte exact | public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| ⬇️ Télécharger le PDF | S95 | texte exact | public/js/15-checklists.js |
| ⭕ | S123 | texte exact | public/js/12-briefing-studio-core.js |
| ☰ Liste | S93 | texte exact | public/js/15-checklists.js |
| 🃏 Remplir en diaporama | S94 | composé : public/js/15-checklists.js:807 (« 🃏 ${verb} en diaporama », verb = Remplir) | — |
| 🌐 Langue du PDF | S105 | texte exact | public/js/02-detail-loaders.js, public/js/08-visits-remarks.js, public/js/15-checklists.js |
| 🌐 Notes globales du projet | S24 | texte exact | public/index.html |
| 🌩️ Orage | S106 | texte exact | public/index.html |
| 🎉 Terminé | S49, S53 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| 🎙️ Démarrer la dictée | S103 | texte exact | public/index.html |
| 🎙️ Dictée vocale | S103 | texte exact | public/index.html |
| 🎙️ Voix | S111 | texte exact | public/index.html |
| 🎨 Studio | S120 | texte exact | public/js/11-briefing.js |
| 🎨 Templates ▾ | S123 | texte exact | public/js/12-briefing-studio-core.js |
| 🎮 Voir en 3D | S84, S85 | texte exact | public/js/08-visits-remarks.js |
| 🎯 Filtrer projets | S136 | texte exact | public/index.html, public/js/01-core.js |
| 🎵 Choisir un fichier audio | S103 | texte exact | public/index.html |
| 🏗️ En installation | S53 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| 🏗️ Grue | S69 | texte exact | public/js/10-logistics-bookings.js |
| 🏗️ Installation | S90, S102 | texte exact | public/index.html, public/js/04-edit-clients-templates.js, public/js/05-templates-trucks-reports.js |
| 🏗️ Nouveau Projet | S23 | texte exact | public/index.html, public/js/03-create-forms.js |
| 🏗️ Projets | S7, S22, S36, S49, S59, S68, S75, S82, S101, S110, S120, S129 | texte exact | public/index.html |
| 🏗️ Projets en cours | S135 | texte exact | public/index.html |
| 🏢 Clients | S7, S13, S14, S121 | texte exact | public/index.html |
| 🏢 Nouveau Client | S14 | texte exact | public/index.html |
| 🏨 Hôtels (multi-occupants) | S75 | texte exact | public/js/10-logistics-bookings.js |
| 🏭 Entrepôt Tubize | S69 | texte exact | public/js/10-logistics-bookings.js |
| 👁️ Ouvrir | S112, S116 | texte exact | public/js/07-auth-mobile-daily-ai.js |
| 👁️ Prévisualiser | S131 | texte exact | public/index.html, public/js/05-templates-trucks-reports.js |
| 👁️ Voir | S84 | texte exact | public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| 👤 Mon profil | S6 | texte exact | public/index.html |
| 👤 Nouveau Membre | S60 | texte exact | public/index.html |
| 👥 Équipe | S7, S25, S27, S28, S51, S59, S60, S61, S62, S65, S105, S121 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| 👥 Équipes | S78, S136 | texte exact | public/index.html, public/js/13-briefing-studio-slides.js |
| 👥 Occupants | S44 | texte exact | public/js/10-logistics-bookings.js |
| 👥 Occupants (sélectionne tous les membres logés) | S77 | texte exact | public/js/10-logistics-bookings.js |
| 👷 Ajouter à l'équipe | S62 | texte exact | public/js/10-logistics-bookings.js |
| 👷 Équipes & Membres | S25 | texte exact | public/index.html |
| 💾 Ajouter au projet | S83 | texte exact | public/js/09-files-team-users.js |
| 💾 Créer | S76 | composé : public/js/10-logistics-bookings.js:920, 1103 (« 💾 ${isEdit?'Enregistrer':'Créer'} ») | — |
| 💾 Enregistrer | S43, S44, S70, S91 | texte exact | public/js/02-detail-loaders.js, public/js/03-create-forms.js, public/js/09-files-team-users.js |
| 💾 Enregistrer les modifications | S36, S54 | texte exact | public/js/02-detail-loaders.js, public/js/03-create-forms.js |
| 💾 Sauvegarder | S15, S105, S122 | texte exact | public/index.html, public/viewer3d.html, public/js/04-edit-clients-templates.js |
| 💾 Sauver sur VEM | S85 | texte exact | public/vem-3d-integration.js, public/js/01-core.js |
| 💾 Valider | S6 | texte exact | public/js/01-core.js, public/js/03-create-forms.js |
| 📁 Fichiers | S27, S33, S40, S41, S51, S82, S121 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/06-time-analysis.js |
| 📁 Fichiers à inclure dans le briefing | S122 | texte exact | public/js/13-briefing-studio-slides.js |
| 📂 Depuis projet ▾ | S123 | texte exact | public/js/12-briefing-studio-core.js |
| 📄 Brouillon | S9, S27, S35 | texte exact | public/js/02-detail-loaders.js |
| 📄 Derniers rapports | S63 | texte exact | public/js/10-logistics-bookings.js, src/routes/projects.ts |
| 📄 Générer PDF | S131 | texte exact | public/index.html |
| 📄 Langue du PDF | S125 | texte exact | public/js/01-core.js |
| 📄 PDF | S116, S125 | texte exact | public/js/02-detail-loaders.js, public/js/05-templates-trucks-reports.js, public/js/07-auth-mobile-daily-ai.js |
| 📄 PDF / Envoyer | S95 | texte exact | public/js/15-checklists.js |
| 📅 Arrivée estimée | S69 | texte exact | public/js/10-logistics-bookings.js |
| 📅 Date & heure de chargement | S69 | texte exact | public/js/10-logistics-bookings.js |
| 📊 Dashboard | S7, S22 | texte exact | public/index.html |
| 📊 Progression | S52 | texte exact | public/js/02-detail-loaders.js |
| 📊 Rapport IA | S50, S129 | texte exact | public/index.html |
| 📋 Briefing | S51, S120 | texte exact | public/index.html |
| 📋 Copier | S40, S47, S114 | texte exact | public/viewer3d.html, public/js/02-detail-loaders.js, public/js/09-files-team-users.js |
| 📋 Étendue des travaux (Scope of work) | S112 | texte exact | public/js/09-files-team-users.js |
| 📋 Import texte libre (IA) | S103 | texte exact | public/index.html |
| 📋 Informations | S52 | texte exact | public/sign-handover.html, public/js/02-detail-loaders.js |
| 📋 Infos | S40, S51, S90 | texte exact | public/index.html, public/js/10-logistics-bookings.js, src/routes/projects.ts |
| 📋 Infos du projet | S63 | texte exact | public/js/10-logistics-bookings.js, src/routes/projects.ts |
| 📋 Plusieurs tâches | S50 | texte exact | public/index.html, public/js/04-edit-clients-templates.js |
| 📋 Préparation | S90 | texte exact | public/js/02-detail-loaders.js, public/js/15-checklists.js |
| 📋 Tâches à créer | S25, S28 | texte exact | public/index.html |
| 📋 Templates tâches | S7 | texte exact | public/index.html |
| 📌 Logo ▾ | S123 | texte exact | public/js/12-briefing-studio-core.js |
| 📌 Notification d'assignation | S63 | texte exact | public/js/10-logistics-bookings.js |
| 📍 Présence effective sur site | S76 | texte exact | public/js/10-logistics-bookings.js |
| 📍 Sur site | S53 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/10-logistics-bookings.js |
| 📍 Zone de déchargement | S69 | texte exact | public/js/10-logistics-bookings.js |
| 📎 Pièce jointe (billet, voucher...) | S76 | texte exact | public/js/10-logistics-bookings.js |
| 📎 Pièces jointes | S104 | texte exact | public/index.html, public/js/16-daily-attachments.js |
| 📓 Daily Report | S8, S101 | texte exact | public/index.html, public/js/07-auth-mobile-daily-ai.js, src/services/emailService.ts |
| 📓 Daily Reports | S7, S51, S90, S101 | texte exact | public/index.html |
| 📓 Joindre à un daily report | S95 | texte exact | public/js/15-checklists.js |
| 📓 Rapport Journalier | S102 | texte exact | public/index.html, src/services/emailService.ts |
| 📝 Devis à valider | S9, S27, S29, S50, S53 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| 📝 Handover Certificate — Champs | S112 | texte exact | public/js/09-files-team-users.js |
| 📝 Notes complémentaires | S24 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| 📝 Texte | S123 | texte exact | public/js/12-briefing-studio-core.js |
| 📞 Contact client | S17, S52 | texte exact | public/js/02-detail-loaders.js |
| 📞 Téléphone | S69 | texte exact | public/js/09-files-team-users.js, public/js/10-logistics-bookings.js |
| 📤 Envoyer | S63, S105, S116 | texte exact | public/js/02-detail-loaders.js, public/js/05-templates-trucks-reports.js, public/js/07-auth-mobile-daily-ai.js |
| 📤 Envoyer le rapport | S105 | texte exact | public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| 📤 Sauv. & Envoyer | S105 | texte exact | public/index.html |
| 📥 Charger la bibliothèque Viewbox | S97 | texte exact | public/js/15-checklists.js |
| 📦 | S50 | texte exact | public/index.html, public/viewer3d.html, public/js/01-core.js |
| 📦 Archiver le projet | S55 | texte exact | public/js/09-files-team-users.js |
| 📦 Autre | S69 | texte exact | public/js/10-logistics-bookings.js |
| 📦 Autre lieu (adresse spéciale) | S69 | texte exact | public/js/10-logistics-bookings.js |
| 📦 Voir archivés | S49 | texte exact | public/index.html |
| 📧 Envoyer invitation | S5, S61 | texte exact | public/js/09-files-team-users.js |
| 📧 Envoyer par email | S114 | texte exact | public/js/09-files-team-users.js |
| 📱 Notif | S63 | texte exact | public/js/10-logistics-bookings.js |
| 📱+✉️ Les deux | S63 | texte exact | public/js/10-logistics-bookings.js |
| 📷 Galerie | S85 | texte exact | public/viewer3d.html |
| 📷 Scanner la carte | S60 | texte exact | public/index.html |
| 📸 Prendre / Ajouter photos | S104 | texte exact | public/index.html |
| 📸 Visites Client | S7, S51 | texte exact | public/index.html |
| 🔍 Points d'inspection | S111 | texte exact | public/index.html, public/js/09-files-team-users.js |
| 🔐 Choisissez votre mot de passe | S5, S61 | texte exact | public/js/01-core.js |
| 🔑 Changer mon mot de passe | S6 | texte exact | public/js/03-create-forms.js |
| 🔑 Mot de passe oublié ? | S5 | texte exact | public/index.html |
| 🔔 Notifications | S7, S137 | texte exact | public/index.html |
| 🔗 Ajouter un fichier via URL | S83 | texte exact | public/js/09-files-team-users.js |
| 🔗 Générer le lien | S61 | texte exact | public/index.html, public/js/07-auth-mobile-daily-ai.js |
| 🔗 Inviter | S61 | texte exact | public/index.html |
| 🔗 Lien de Signature Client | S114 | texte exact | public/js/09-files-team-users.js |
| 🔗 Signer | S114 | texte exact | public/js/05-templates-trucks-reports.js, public/js/07-auth-mobile-daily-ai.js |
| 🔗 URL | S82 | texte exact | public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| 🔤 Titre | S123 | texte exact | public/js/12-briefing-studio-core.js |
| 🔧 En préparation | S53 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| 🔧 Manitou / Roto | S69 | texte exact | public/js/10-logistics-bookings.js |
| 🔧 Notes démontage | S24 | texte exact | public/index.html |
| 🔨 Démontage | S53, S90, S102 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/04-edit-clients-templates.js |
| 🔨 Notes installation | S24 | texte exact | public/index.html |
| 🔵 En route | S70 | texte exact | public/js/10-logistics-bookings.js |
| 🖼️ Depuis galerie | S60 | texte exact | public/index.html |
| 🖼️ Image/PDF | S123 | texte exact | public/js/12-briefing-studio-core.js |
| 🗑️ Supprimer ce client | S18 | texte exact | public/js/04-edit-clients-templates.js |
| 🗑️ Supprimer définitivement | S55 | texte exact | public/js/09-files-team-users.js |
| 🗑️ Supprimer la sélection | S84 | texte exact | public/js/08-visits-remarks.js |
| 🤖 Analyser avec l'IA | S103 | texte exact | public/index.html |
| 🤖 Analyser avec l'IA → Extraire les entrées | S103 | texte exact | public/index.html |
| 🤖 Assistant IA | S106 | texte exact | public/js/04-edit-clients-templates.js |
| 🤖 Lancer / relancer l'analyse | S132 | texte exact | public/index.html |
| 🤝 Client | S105 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/08-visits-remarks.js |
| 🧾 Handover | S7, S8, S50, S51, S90, S110, S111 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| 🧾 Handover OK | S53, S115 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| 🧾 Nouveau Handover | S111 | texte exact | public/index.html |
| 🪄 Auto-générer | S122 | texte exact | public/js/12-briefing-studio-core.js, public/js/14-briefing-autogen.js |
| 🚐 Camionnette | S69 | texte exact | public/js/10-logistics-bookings.js |
| 🚚 Ses réservations | S63 | texte exact | public/js/10-logistics-bookings.js |
| 🚛 Ajouter un véhicule | S69 | composé : public/js/10-logistics-bookings.js:9 (« 🚛 ${isEdit ? 'Modifier' : 'Ajouter'} un véhicule ») | — |
| 🚛 Camion (Flatbed) | S69 | texte exact | public/js/10-logistics-bookings.js |
| 🚛 Camion (Tautliner) | S69 | texte exact | public/js/10-logistics-bookings.js |
| 🚛 Camions | S71, S136 | texte exact | public/index.html, public/js/13-briefing-studio-slides.js |
| 🚛 Logistique | S25, S27, S41, S43, S51, S54, S68, S121 | texte exact | public/index.html, public/js/02-detail-loaders.js |
| 🚛 Réservations créées depuis un email | S41, S137 | texte exact | src/services/bookingFromEmail.ts |
| 🚜 Chariot élévateur | S69 | texte exact | public/js/10-logistics-bookings.js |
| 🛠️ Ticket | S50 | texte exact | public/index.html, public/js/10-logistics-bookings.js |
| 🟠 En chargement | S70 | texte exact | public/js/10-logistics-bookings.js |
| 🟠 Partiel | S92 | composé : public/js/15-checklists.js:389 | — |
| 🟢 Livré | S70 | texte exact | public/js/10-logistics-bookings.js |
| 🟣 Planifié | S43, S70 | texte exact | public/js/10-logistics-bookings.js |
| À traiter | S93 | texte exact | public/js/15-checklists.js |
| Admin | S7 | texte exact | public/index.html, public/js/01-core.js, public/js/02-detail-loaders.js |
| Adresse | S14, S16 | texte exact | public/index.html, public/sign-handover.html, public/js/02-detail-loaders.js |
| Adresse * | S23, S26, S33, S121 | texte exact | public/index.html |
| Annuler | S14, S25, S96, S105 | texte exact | public/index.html, public/js/01-core.js, public/js/02-detail-loaders.js |
| Bookings | S130 | texte exact | public/index.html, public/js/01-core.js, public/js/06-time-analysis.js |
| Canal | S63 | texte exact | public/js/10-logistics-bookings.js, src/routes/projects.ts |
| Check-in * | S77 | texte exact | public/js/10-logistics-bookings.js |
| Check-out * | S77 | texte exact | public/js/10-logistics-bookings.js |
| Client * | S13, S17, S23, S26, S143 | texte exact | public/index.html |
| Client / Société | S111 | texte exact | public/index.html |
| Commentaire | S130 | texte exact | public/index.html, public/js/03-create-forms.js, public/js/05-templates-trucks-reports.js |
| Connexion | S5 | texte exact | public/index.html, public/js/01-core.js, src/services/checklistLibrary.ts |
| Daily Reports | S130 | texte exact | public/index.html, public/js/01-core.js, public/js/02-detail-loaders.js |
| Dashboard | S8 | texte exact | public/index.html, public/js/01-core.js, public/js/07-auth-mobile-daily-ai.js |
| Date * | S102 | texte exact | public/index.html |
| Début démontage | S23, S26 | texte exact | public/index.html, public/js/13-briefing-studio-slides.js |
| Début installation * | S23, S26 | texte exact | public/index.html |
| Description / Instructions spéciales | S23, S24, S33 | texte exact | public/index.html |
| Détails (n° de vol, etc.) | S76 | texte exact | public/js/10-logistics-bookings.js |
| Email | S5 | texte exact | public/index.html, public/js/01-core.js, public/js/02-detail-loaders.js |
| Email * | S60 | texte exact | public/index.html |
| Email société | S14, S16 | texte exact | public/index.html, public/js/04-edit-clients-templates.js |
| Enregistrer et suivant → | S94 | texte exact | public/js/15-checklists.js |
| Envoyer des fichiers par email | S40 | texte exact | public/js/02-detail-loaders.js |
| État du véhicule | S43, S70 | texte exact | public/js/10-logistics-bookings.js |
| Fermer | S114 | texte exact | public/js/03-create-forms.js, public/js/05-templates-trucks-reports.js, public/js/06-time-analysis.js |
| Fichiers projet | S130 | texte exact | public/index.html |
| Fin démontage | S23, S26 | texte exact | public/index.html |
| Fin installation * | S23, S26 | texte exact | public/index.html |
| Fonction | S15 | texte exact | public/js/04-edit-clients-templates.js, public/js/13-briefing-studio-slides.js, src/services/checklistLibrary.ts |
| Handover | S130 | texte exact | public/index.html, public/sign-handover.html, public/planning-public.html |
| Lieu de chargement | S69 | texte exact | public/js/10-logistics-bookings.js |
| Lieu de déchargement | S69 | texte exact | public/js/10-logistics-bookings.js |
| Logistique | S130 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/06-time-analysis.js |
| Membre | S62 | texte exact | public/index.html, public/js/04-edit-clients-templates.js, public/js/10-logistics-bookings.js |
| Membre * | S76 | texte exact | public/js/10-logistics-bookings.js |
| Membres équipe | S135 | texte exact | public/index.html |
| Menu | S8 | texte exact | public/index.html, public/js/01-core.js, public/js/07-auth-mobile-daily-ai.js |
| Météo | S102 | texte exact | public/index.html, public/js/04-edit-clients-templates.js, src/services/pdfService.ts |
| Mot de passe | S5 | texte exact | public/index.html, public/js/01-core.js, public/js/03-create-forms.js |
| Moyen de transport | S76 | texte exact | public/js/10-logistics-bookings.js |
| N° Interne | S23, S26, S33 | texte exact | public/index.html, public/sign-handover.html, public/js/02-detail-loaders.js |
| N° TVA / VAT | S14, S16 | texte exact | public/index.html, public/js/04-edit-clients-templates.js |
| 🆕 Projet créé depuis un email | S35, S137 | texte exact | src/services/projectFromEmail.ts |
| Nom * | S23, S26, S33, S60 | texte exact | public/index.html, public/js/04-edit-clients-templates.js, public/js/05-templates-trucks-reports.js |
| Nom / référence supplémentaire (optionnel) | S69 | texte exact | public/js/10-logistics-bookings.js |
| Nom de la société * | S14, S16 | texte exact | public/index.html |
| Nom du chauffeur | S69 | texte exact | public/js/10-logistics-bookings.js |
| Nom du fichier * | S83 | texte exact | public/js/09-files-team-users.js |
| Notes générales | S111 | texte exact | public/index.html, public/js/04-edit-clients-templates.js, public/js/07-auth-mobile-daily-ai.js |
| Notes générales / Résumé | S104 | texte exact | public/index.html |
| Ouvriers | S23, S26, S33 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/04-edit-clients-templates.js |
| Ouvriers présents | S102 | texte exact | public/index.html, public/js/04-edit-clients-templates.js |
| Période : | S136 | texte exact | public/index.html, public/js/07-auth-mobile-daily-ai.js |
| Personnes de contact | S14 | texte exact | public/index.html, public/js/03-create-forms.js, public/js/04-edit-clients-templates.js |
| Phase * | S76, S77 | texte exact | public/js/10-logistics-bookings.js |
| Phase d'intervention | S62 | texte exact | public/js/10-logistics-bookings.js |
| Plaque 1 (Tracteur) | S69 | texte exact | public/js/10-logistics-bookings.js |
| Plaque 2 (Remorque) | S69 | texte exact | public/js/10-logistics-bookings.js |
| Prénom * | S60 | texte exact | public/index.html |
| Présentation client | S129 | texte exact | public/index.html |
| Principal | S7 | texte exact | public/index.html |
| Problèmes | S93 | texte exact | public/js/15-checklists.js |
| Projet * | S102, S111 | texte exact | public/index.html |
| Projets | S8 | texte exact | public/index.html, public/planning-public.html, public/js/01-core.js |
| Projets actifs | S135 | texte exact | public/index.html |
| Quoi envoyer ? | S63 | texte exact | public/js/10-logistics-bookings.js |
| Rapport complet | S129 | texte exact | public/index.html, src/services/pdfService.ts |
| Rechercher un projet... | S49 | texte exact | public/index.html |
| Référence (optionnel) | S77 | texte exact | public/js/10-logistics-bookings.js |
| Représentant présent | S111 | texte exact | public/index.html |
| Résumé IA | S130 | texte exact | public/index.html |
| Rôle | S60 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/03-create-forms.js |
| Rôle attribué | S61 | texte exact | public/index.html |
| Rôle sur ce projet | S62 | texte exact | public/js/10-logistics-bookings.js |
| Se connecter | S5 | texte exact | public/index.html, public/js/01-core.js, src/routes/users.ts |
| Sous-équipe | S60 | texte exact | public/index.html, public/js/09-files-team-users.js |
| Tâches | S130 | texte exact | public/index.html, public/js/01-core.js, public/js/03-create-forms.js |
| Tâches terminées | S135 | texte exact | public/index.html |
| Téléphone | S60 | texte exact | public/index.html, public/js/02-detail-loaders.js, public/js/03-create-forms.js |
| Téléphone société | S14, S16 | texte exact | public/index.html, public/js/04-edit-clients-templates.js |
| Temps par tâche | S130, S132 | texte exact | public/index.html |
| Terrain | S7 | texte exact | public/index.html, public/js/06-time-analysis.js, public/js/07-auth-mobile-daily-ai.js |
| Tickets SAV | S130 | texte exact | public/index.html, public/js/01-core.js, public/js/06-time-analysis.js |
| Tous les statuts | S49 | texte exact | public/index.html |
| Tout | S93 | texte exact | public/index.html, public/viewer3d.html, public/vem-3d-integration.js |
| Tout lire | S137 | texte exact | public/index.html |
| Tout sélectionner | S84 | texte exact | public/js/08-visits-remarks.js |
| Trier par... | S49 | texte exact | public/index.html |
| Type * | S69 | texte exact | public/js/10-logistics-bookings.js |
| URL du fichier * | S83 | texte exact | public/js/09-files-team-users.js |
| Visites client | S130 | texte exact | public/index.html |
| Voir archivés | S70 | texte exact | public/index.html, public/js/11-briefing.js |
| Vue d'ensemble | S130 | texte exact | public/index.html |
