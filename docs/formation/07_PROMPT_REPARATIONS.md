# PROMPT — Réparations VEM après la formation (à coller dans Claude Code, à la racine du repo `vem-backend`)

---

## 1. Contexte

L'audit fonctionnel du 23.10.2026 (`docs/formation/00_INVENTAIRE_FONCTIONNEL.md`, preuves `fichier:ligne`) a relevé des fonctions cassées, des failles de droits et des incohérences d'interface. La formation (`docs/formation/formation-vem.html`) enseigne aujourd'hui des **contournements**. Ce prompt liste tout ce qu'il faut réparer, par priorité.

**Décisions d'Amaury (24.10.2026)**
- Les **tâches** sont remplacées par la **check-list** (todolist).
- Le module **Visites client** sera probablement supprimé.
- Le **briefing** se fait avec **Studio + 🪄 Auto-générer**.
- Le **statut du projet** est modifiable par toute personne qui a accès.
- Format du **N° interne** : 4 chiffres + 4 à 6 lettres + `VIE` (ex. `6055RKLOKVIE`).

## 2. Règles de travail (obligatoires)

1. Lis `CLAUDE.md` en entier avant de commencer, notamment :
   - conventions des routes (`AppError`, `{ success, data }`) ;
   - migrations **idempotentes** dans `src/utils/migrations.ts`, pas de migration Prisma ;
   - nouveaux modèles via `(prisma as any)` ;
   - ne pas lancer `npm run build` à la racine : utiliser `npx tsc --noEmit -p .` ;
   - le frontend = scripts globaux `public/js/01…16`, sans bundler.
2. **Ne touche à rien de ce qui concerne Plans Viewbox / Étude structure / Loading liste** (`plans/`, `src/routes/plans.ts`, `structure.ts`, `loading.ts`).
3. Avant chaque correction, **relis le code cité** dans l'inventaire : le numéro de ligne peut avoir bougé.
4. Une correction = un commit clair, en français. **Ne pousse rien sans mon accord.** Je suis non technique : à la fin, donne-moi un résumé court (quoi, où, comment tester) et, si je dois copier-coller, des blocs complets.
5. Après chaque lot :
   - `npx tsc --noEmit -p .` doit passer ;
   - vérifie dans un navigateur (Chromium est installé) les écrans touchés, sur ordinateur et en largeur téléphone (≤ 768 px) ;
   - zéro erreur console.
6. Quand un libellé enseigné dans la formation change, **mets à jour le support** :
   - édite `docs/formation/_source/m*.mjs` ;
   - relance `node docs/formation/_source/build.mjs` ;
   - la vérification des libellés (`_source/qa-auto.json`) doit rester à 0 introuvable.

## 3. Lot P0 — Sécurité (à faire en premier)

| # | Problème | Preuve | Correction attendue |
|---|---|---|---|
| S1 | Tout compte peut se donner le rôle admin en modifiant sa propre fiche (`role` et `isActive` sont dans la liste blanche, et l'utilisateur peut modifier sa fiche). | `src/routes/users.ts:15-19`, `:102-120` | Pour soi-même : seulement nom, prénom, téléphone. `role`, `isActive`, `email` uniquement pour admin / project_manager. |
| S2 | À l'inscription par invitation, le rôle choisi par l'invité l'emporte sur celui de l'invitation. | `src/routes/auth.ts:299`, `public/index.html:77-85` | Rôle = celui de l'invitation, toujours. Champ « Rôle » de la page d'inscription en lecture seule. |
| S3 | Données d'identité (registre national, n° de carte, date et lieu de naissance) renvoyées à tous les rôles, y compris Client. | `src/routes/users.ts:22-40` | Ne les renvoyer qu'à admin / project_manager / technical_manager et à la personne elle-même. Ailleurs, sélection réduite (nom, rôle, téléphone, e-mail). |
| S4 | Suppression définitive d'un projet, d'un client ou d'un fichier ouverte à tout compte connecté. | `src/routes/projects.ts:215-220`, `clients.ts:147-155`, `projects.ts:689` | Réserver `DELETE` projet / client à admin (et project_manager pour les fichiers). Masquer les boutons pour les autres rôles. |
| S5 | Route de traduction montée sans authentification (service payant appelable publiquement). | `src/index.ts:124` | Ajouter `authMiddleware`. Vérifier que l'export PDF anglais du Briefing Studio fonctionne toujours. |
| S6 | Clé d'un service de cartes en clair dans le code de la page. | `public/js/12-briefing-studio-core.js:341` | Passer par une route serveur (proxy) qui lit la clé dans une variable d'environnement. Prévenir Amaury de régénérer la clé. |
| S7 | Briefings lisibles, modifiables et supprimables par id sans contrôle. | `src/routes/briefing.ts` | Vérifier que le briefing existe et appartient à un projet ; refuser la suppression aux rôles client et worker. |
| S8 | `POST /ai/parse-daily` : prompt construit côté client, donc n'importe quel utilisateur peut envoyer un prompt libre. | `src/routes/ai.ts:22-61` | Construire les prompts côté serveur à partir de paramètres typés (mode, texte). |
| S9 | `POST /projects` étale `req.body` sans liste blanche. | `src/routes/projects.ts:156-160` | Liste blanche des champs (comme `PATCH`). |
| S10 | Secrets JWT avec valeur par défaut en dur. | `src/routes/auth.ts:12-13`, `src/middleware/auth.ts:16` | Refuser de démarrer sans la variable d'environnement (log clair). |
| S11 | Message d'erreur affiché à l'utilisateur qui cite l'hébergeur. | `public/js/08-visits-remarks.js:778` | Message neutre. |

## 4. Lot P1 — Fonctions cassées enseignées avec un contournement

| # | Problème | Preuve | Correction attendue |
|---|---|---|---|
| F1 | « 🔑 Mot de passe oublié ? » : l'envoi plante (`nodemailer.createTransporter`), la table des jetons n'est pas créée et la page `/reset-password` n'existe pas. | `src/routes/auth.ts:115-224` | Envoyer via `sendMail` (`src/services/emailService.ts`, le relais habituel). Créer la table en SQL idempotent. Ajouter un écran « Nouveau mot de passe » qui lit `?token=` (même style que l'écran de connexion). Lien valable 30 min. |
| F2 | Bloc « 👷 Équipes & Membres » du formulaire Nouveau Projet : jamais chargé et jamais enregistré. | `public/js/09-files-team-users.js:684-689` (fonction tronquée), `:778`, `02-detail-loaders.js:1105` | Recharger la liste à l'ouverture et envoyer les membres cochés, avec rôle et **phase**. Côté serveur : création des `ProjectTeam` dans la même requête. Sous-équipes : voir F12. |
| F3 | « ✏️ Modifier » un projet : blocs Équipe / Tâches / Logistique affichés mais ignorés (modifications de véhicules perdues). | `02-detail-loaders.js:1133-1147` | En mode modification, masquer ces trois blocs. Ajouter un lien « Gérer dans l'onglet 🚛 Logistique / 👥 Équipe ». |
| F4 | Impossible d'effacer une date de démontage ou la description via ✏️ Modifier. | `02-detail-loaders.js:1109, 1117-1118` | Envoyer `null` quand le champ est vidé. |
| F5 | Menu de statut vide pour un projet Brouillon ou Confirmé (valeurs absentes de la liste). | `public/index.html:342-352` | Ajouter 📄 Brouillon, ✔️ Confirmé, 📦 Chargement, 🧾 Handover à la liste (dans l'ordre du cycle). Statut initial d'un projet manuel : à confirmer avec Amaury (proposition : 📝 Devis à valider). |
| F6 | « 📄 PDF » des cartes de l'onglet projet 🧾 Handover sans effet (`generateHandoverPDF` n'existe pas). | `public/js/07-auth-mobile-daily-ai.js:1165` | Appeler `downloadHandoverPdf` (`01-core.js:75`, avec choix de langue). |
| F7 | « 📄 PDF » de la page Menu › Handover = ancien PDF (FR, sans signatures, sans check-list). | `02-detail-loaders.js:737-748`, `src/routes/reports.ts:33-75` | Utiliser le même PDF que la fiche (`downloadHandoverPdf`). Ajouter « 👁️ Ouvrir » sur ces cartes. Statut affiché en français. |
| F8 | Création de handover : « Date de réception » et « Email client » non enregistrés ; « Représentant présent » perdu si le client est rempli. | `03-create-forms.js:568-574` | Enregistrer date (affichée dans le PDF et sur la page client) et e-mail. Envoyer le PDF signé aussi à cet e-mail. |
| F9 | Certificat (« 📝 Handover Certificate — Champs ») : Title / Name / adresse / nom du projet ignorés par le PDF ; « Comments / Reservations » cassé (`clasid=`) ; notes générales non modifiables. | `09-files-team-users.js:861, 913, 946` ; `handover.ts:263-275, 345-357`, `publicHandoverSign.ts:115-127` | Transmettre `customFields` au PDF. Corriger la balise. Rendre les notes générales modifiables. Remplacer « SPANTECH INTERNATIONAL SA » / « Rapport de réception — SPANTECH » par VIEWBOX International SA (à confirmer avec Amaury). |
| F10 | Handover : pas de suppression ni de renommage d'un point d'inspection. | `05-templates-trucks-reports.js:321-447` | ✏️ et 🗑️ sur chaque zone de la fiche. |
| F11 | Signature handover : le statut du projet ne passe jamais à 🧾 Handover OK. Le PDF signé est envoyé seulement au créateur et à l'e-mail de la fiche client. Page client et PDF signé en français uniquement. Lien sans expiration. | `src/routes/publicHandoverSign.ts:92-154` | À valider avec Amaury : passage automatique à Handover OK (proposé). Choix de la langue (FR / EN) de la page client et du PDF signé. Expiration du lien après 30 jours. Ajouter le Technical Manager du projet aux destinataires. |
| F12 | Sous-équipes stockées dans le navigateur (`localStorage`), alors que `users.team_group_id` existe en base. | `09-files-team-users.js:249-254` | Table `team_groups` (SQL idempotent) + routes CRUD. Migrer à la volée les groupes locaux du créateur. |
| F13 | Photo de profil jamais enregistrée ; mot de passe par défaut `VEM2025!` jamais imposé au changement. | `03-create-forms.js:648-658`, `index.html:1231`, `auth.ts:36-52` | Envoyer la photo (upload existant, `avatarUrl`) et l'afficher à la place des initiales. Forcer « 🔐 Choisissez votre mot de passe » à la première connexion d'un compte créé avec le mot de passe par défaut. |
| F14 | Aucun moyen de désactiver un membre. | `src/routes/users.ts` | Bouton « Désactiver / Réactiver » (admin, PM) et filtre « Afficher les comptes désactivés » sur la page Équipe. |
| F15 | « Rester connecté » sans effet ; déconnexion silencieuse après 8 h. | `index.html:37-38`, `01-core.js:284, 310-311`, `auth.ts:18` | Utiliser le refresh token (déjà émis) quand la case est cochée. Sinon, message « Session expirée, reconnectez-vous » au lieu d'un retour muet. |
| F16 | Invitation par lien : faux lien « mode démo » pour les rôles non autorisés ; validité de 15 min non affichée et trop courte. | `07-auth-mobile-daily-ai.js:190-197`, `auth.ts:260` | Masquer « 🔗 Inviter » aux rôles non autorisés. Validité de 7 jours, affichée à l'écran. |
| F17 | Daily (création) : sur téléphone, une nouvelle sélection de photos remplace la précédente. Les erreurs d'envoi de photos sont silencieuses. | `03-create-forms.js:478, 515-536` | Cumuler les sélections (avec ✕ par photo). Toast d'erreur si un envoi échoue. |
| F18 | Daily (modification) : météo « Orage » absente ; supprimer toutes les entrées n'est pas enregistré ; changer de phase efface les heures ; le bouton 🗑️ ferme la fenêtre même si on annule. | `04-edit-clients-templates.js:562-567, 658, 671-682, 987` ; `dailyReports.ts:130-142` | Corriger les quatre points. |
| F19 | Daily : « Tâche liée » jamais enregistrée ; impossible de renvoyer un rapport ; client coché par défaut à l'envoi ; liste « Équipe » = toute l'entreprise ; date par défaut en UTC (rapport daté de la veille entre minuit et 2 h). | `index.html:911`, `02-detail-loaders.js:562-657`, `03-create-forms.js:778-780` | Retirer « Tâche liée » (tâches abandonnées). Bouton « 📤 Renvoyer ». Client décoché par défaut (à confirmer). Équipe du projet en premier, marquée 👷. Date locale. |
| F20 | Photos des points de visite jamais enregistrées (JSON envoyé à une route qui attend un fichier). | `08-visits-remarks.js:558, 591, 763, 795` vs `src/routes/clientRemarks.ts:66` | **Seulement si les Visites client sont conservées**, sinon voir le lot P3. |
| F21 | Camions : statut « draft » affiché brut ; pas de bouton « Valider » ; double rendu de l'onglet Logistique (ancienne vue qui réapparaît). | `10-logistics-bookings.js:1177-1185`, `02-detail-loaders.js:338-374` vs `11-briefing.js:1-73` | Ajouter `draft: '📝 Brouillon'` aux libellés et couleurs. Bouton « ✅ Valider » sur les brouillons (statut → Planifié, mention « à valider » retirée des notes). Supprimer l'ancien rendu de `loadProjectDetail`. |
| F22 | Bookings créés par mail : hôtels sans occupant, mode de transport libre (« avion ») non reconnu puis effacé à l'enregistrement, aucun badge « à valider ». | `src/services/bookingFromEmail.ts:140, 229-305`, `10-logistics-bookings.js:877-880` | Normaliser le mode (`plane/train/car/bus/other`). Rattacher les occupants d'un hôtel si les noms correspondent à l'équipe. Champ ou badge « 📝 À valider » + bouton « ✅ Valider » sur les cartes transport et hôtel. |
| F23 | Rapport IA : « 📄 Générer PDF » ouvre l'impression au lieu de télécharger ; chaque aperçu est archivé dans Fichiers ; traductions EN / NL partielles ; « Description / Instructions spéciales » absente ; coordonnées de l'équipe visibles en « Présentation client ». | `06-time-analysis.js:323-341, 567-644, 1114-1125` | Vrai téléchargement PDF. Archiver seulement au PDF (pas à l'aperçu). Compléter les traductions. Ajouter la description. Masquer e-mails et téléphones en Présentation client. Retirer les sections Tâches / Tickets / Visites. |
| F24 | Briefing Studio : pas d'enregistrement automatique ; tableaux de plus de 12 lignes qui débordent ; chaque export PDF ajouté en doublon dans Fichiers ; « 📍 Localisation + lien Maps » sans lien. | `13-briefing-studio-slides.js:561-576, 680-705`, `brfRenderDataTable` | Enregistrement automatique 2 s après la dernière modification (comme les autres modules). Pagination des tableaux. Remplacer la version précédente du PDF au lieu d'en ajouter une. Lien Maps cliquable dans le PDF. |
| F25 | Ville du projet = texte après la dernière virgule de l'adresse, donc risque de « Bruxelles, Bruxelles » dans le briefing. | `02-detail-loaders.js` (createProject), `14-briefing-autogen.js:396, 421` | Champ « Ville » explicite (prérempli) ou dédoublonnage à l'affichage. |
| F26 | Projet par mail `NEW` : sans date, installation = date du jour ; N° interne déjà existant = abandon sans prévenir ; client inconnu = nouveau client créé (doublons). | `src/services/projectFromEmail.ts:121-191` | Dates vides si absentes du mail, et le projet reste en Brouillon avec une alerte « ⚠️ Dates à compléter ». Notifier admins et PM si le N° existe déjà. Rapprocher le client par nom approchant (sans « SA / SPRL / BV… ») avant d'en créer un. |
| F27 | Mails : aucun retour à l'expéditeur ; logos et signatures inline enregistrés comme fichiers ; un mail ouvert dans Gmail avant la relève n'est jamais traité. | `src/services/imapPoller.ts:66, 125-183` | Ignorer les pièces jointes `inline` / `cid` de moins de 50 Ko (images). Notification in-app « 📧 Mail non rattaché » avec sujet et expéditeur quand aucun projet n'est trouvé. Option : traiter aussi les mails lus sans le libellé Gmail « VEM-traité ». |
| F28 | Validation du format du N° interne absente (projet manuel : `VEM-année-xxxx` inventé si vide). | `src/routes/projects.ts:160`, `index.html:622` | Champ obligatoire, contrôle du format `^\d{4}[A-Z]{4,6}VIE$` (insensible à la casse) avec message clair. À confirmer : exceptions pour les anciens projets. |

## 5. Lot P2 — Cohérence et confort (les contournements de la formation disparaissent)

**Tâches abandonnées**
- Retirer : menu Terrain › ✅ Tâches, « ➕ 1 tâche », « 📋 Plusieurs tâches », bloc « 📋 Tâches à créer » (Nouveau Projet), bloc « ✅ Avancement tâches » (Daily), section Tâches du Rapport IA, slide « Tâches importantes » de l'auto-génération, tuile « Tâches terminées » du Dashboard.
- Garder « Templates tâches » uniquement pour « ⏱️ Heures par tâche » : le renommer « Tâches types (heures) ». Garder la phase. Import CSV avec colonne Phase. Corriger le « 52 » de « 🔄 Viewbox standard ». Supprimer « 🔍 Diag ».

**Bouton et éléments de l'en-tête projet**
- Retirer « 🛠️ Ticket » (tickets masqués partout ailleurs) et le badge 🛠️ des cartes projet.
- « 🧾 Handover » de l'en-tête ouvre l'**onglet** du projet.
- Le point rouge de la 🔔 doit suivre les notifications non lues, pas les tickets.

**Libellés**
- Remplacer tous les codes bruts affichés à l'écran par des libellés français : statut sur les cartes Projets et la fiche client, rôles dans Mon profil, l'équipe projet, les bookings et le briefing, priorités, type de véhicule.
- Titres de page « clients » / « templates » dans la barre du haut.

**Navigation par rôle**
- Masquer la section Admin aux rôles worker, installer, warehouse et client.
- Masquer les boutons dont l'action sera refusée par le serveur.

**Dashboard**
- « Projets actifs » cohérent avec « Projets en cours » (inclure Chargement, Démontage).
- Calendrier : masquer les projets annulés, mémoriser la période et les cases Camions / Équipes.
- Avertir que ▲▼ change l'ordre pour tout le monde.

**Notifications**
- Clic = ouvrir le projet concerné.
- Compteur visible sur mobile.

**Fichiers**
- Séparer « Reçus par mail », « Générés par VEM » et « Ajoutés à la main ».
- Ne plus créer une copie à chaque téléchargement de PDF : remplacer la version précédente.
- Accepter `.ifc` à l'envoi (le lecteur 3D le lit).

**Clients**
- Champ « Fonction » et choix ★ dès la création.
- Afficher le téléphone et l'e-mail **du contact** dans « 📞 Contact client ».
- Message d'erreur précis à la création.
- Bug de perte de contacts quand on retire une ligne intermédiaire (`03-create-forms.js:715-718`).

**Équipe projet**
- Rôle modifiable sur place.
- Désignation du Lead et du Technical Manager du projet.
- « + Créer membre » depuis un projet ajoute aussi la personne au projet.

**Check-list**
- Textes obsolètes « onglet Handover » (`15-checklists.js:13-14, 1979`).
- Sens du glissement du diaporama en lecture seule.
- Mise à jour en direct (écouter `checklist:updated`).

**Lien de signature**
- Le blocage de la check-list s'applique aussi à la signature client sur place, avec la même exception admin / TM.

## 6. Lot P3 — Nettoyage (selon décisions)

- **Visites client** (si suppression confirmée) :
  - retirer le menu, l'onglet, le choix « 📸 Point visite » du bouton ＋ mobile, la section du Rapport IA et la slide « Remarques client » de l'auto-génération ;
  - conserver les données en base (pas de `DROP`) ;
  - sinon, corriger F20 et unifier les deux systèmes (points isolés / visites).
- **Code mort** à supprimer :
  - ancienne fiche camion (`05-templates-trucks-reports.js:844-997`) ;
  - `runTimeAnalysis__V1_REMOVED` ;
  - écran d'accueil du Studio jamais affiché ;
  - anciens modèles de slides ;
  - fenêtre `modal-new-visite` ;
  - fonctions handover / visite sans bouton (liste en II.7 partie C de l'inventaire) ;
  - fichier vide `src/routes/teamb`.
- **Briefing classique** : retirer les blocs « 📊 Gantt » (inutilisable), « ✈️ Transport équipe » et « 🏨 Hôtels équipe » (non déplaçables, non imprimés), ou les réparer. Décision : le classique n'est plus enseigné.

## 7. Livrable attendu de toi (Claude Code)

1. Un tableau récapitulatif (n° · corrigé ✅ / reporté ⏸ / à décider ❓ · fichier · comment tester).
2. Les questions qui restent pour Amaury, regroupées.
3. Le support de formation mis à jour (`_source/m*.mjs` + rebuild) pour les contournements devenus inutiles :
   - chapitre 0 « Mot de passe oublié » ;
   - chapitre 2 bloc Équipe et ☐ Aucun ;
   - chapitre 4 et 7 « draft » et validation ;
   - chapitre 5 menu de statut vide ;
   - chapitre 11 photos ;
   - chapitre 12 PDF de la fiche, date et e-mail.
4. Aucun commit ni push sans mon accord.
