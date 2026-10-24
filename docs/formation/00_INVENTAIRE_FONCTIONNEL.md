# 00 — Inventaire fonctionnel VEM (Phase 1 de la formation)

> **Document de travail interne pour Amaury, pas un support de formation.**
> Audit du code en lecture seule, état du dépôt au 23.10.2026 (branche `main`, commit `651dcc4`). Aucun fichier existant n'a été modifié.
> Chaque constat cite sa preuve `fichier:ligne`. Ce que le code seul ne permet pas de prouver est marqué « À confirmer » et ne passera pas dans les slides.
> Les sections « Notes techniques » des parties détaillées ne doivent **jamais** être reprises dans la formation (règle 6).

> **Décisions d'Amaury du 24.10.2026** (réponses aux questions de la partie I.6) :
> - mail : on enseigne ce qui existe ;
> - préfixe : uniquement `NEW` ;
> - N° interne : 4 chiffres + 4 à 6 lettres + `VIE` ;
> - pas de tâches : elles sont remplacées par la check-list (todolist) ;
> - fonctions cassées : réparées après la formation (voir `07_PROMPT_REPARATIONS.md`), contournements enseignés en attendant ;
> - briefing : Studio + 🪄 Auto-générer ;
> - check-list : module à part entière ;
> - statut : modifiable par toute personne qui a accès ;
> - consigne « ne jamais supprimer » ajoutée ;
> - vouvoiement ;
> - Visites client exclues (module probablement supprimé) ;
> - planning public présenté.

## Sommaire

- Partie I — Synthèse : ce qu'il faut retenir, la règle du mail, exclusions, qui voit quoi, anomalies bloquantes, questions pour Amaury
- Partie II — Détail par module (inventaire complet, preuves, anomalies, questions, notes techniques)
  - II.1 Connexion, navigation, profil, mobile, dashboard, calendrier, notifications, liste des projets
  - II.2 Clients, création / modification de projet, fiche projet, archivage, Fichiers, lecteur 3D
  - II.3 Équipe, Logistique, Bookings, droits par rôle
  - II.4 Tâches, Templates tâches, Rapport IA
  - II.5 Briefing (classique, Studio, Auto-générer)
  - II.6 Daily Reports et check-list de montage
  - II.7 Visites client et Handover

---

# PARTIE I — SYNTHÈSE

## I.1 Ce qu'il faut retenir pour construire la formation

1. **Le parcours « projet » repose sur 3 voies d'entrée, dont 2 par mail.** Elles fonctionnent comme suit, avec deux écarts importants par rapport aux « pistes connues » (§ I.2).
2. **Plusieurs fonctions visibles sont cassées aujourd'hui** (§ I.5). Former les collègues dessus produirait de la frustration ; il faut décider : corriger avant la formation, ou les taire.
3. **Les tâches sont « à moitié retirées »** : l'onglet projet ✅ Tâches est masqué depuis le 16.10.2026 (le suivi passe par la check-list dans 📓 Daily Reports), mais Terrain › ✅ Tâches, « ➕ 1 tâche », « 📋 Plusieurs tâches » et le bloc « Tâches à créer » du formulaire projet restent visibles. **Décision nécessaire** sur ce qu'on enseigne (question Q1).
4. **Il n'y a pratiquement aucun contrôle par rôle** : tout compte connecté voit tous les menus (y compris « Admin ») et peut modifier ou supprimer projets, clients, fichiers, daily reports, handovers… Les seules restrictions réelles concernent : création et modification des membres, invitations, check-list (installateur et site manager limités à leurs projets), forçage du lien de signature, Assistant, réinitialisation des templates. Le tableau « Qui voit quoi » de la formation sera donc court et honnête (§ I.4).
5. **Le briefing auto-généré dépend directement du remplissage du projet** : 13 types de slides, chacune sautée si la donnée manque. C'est l'argument central de la formation (tableau détaillé en II.5 § 4.3).
6. **Le statut d'un projet ne change jamais automatiquement** (ni à la signature du handover, ni aux dates). Un projet neuf est en « 📄 Brouillon », valeur **absente** du menu déroulant de statut de la fiche.

## I.2 La règle du mail — vérifiée dans le code

Adresse affichée dans l'app : **warehouseviewbox@gmail.com**. Elle figure dans l'encart « Envoyer des fichiers par email » de l'onglet 📋 Infos (`public/js/02-detail-loaders.js:190-199`) ; le bouton « 📋 Copier » copie `À: warehouseviewbox@gmail.com / Sujet: <N° interne> / (Joindre les fichiers…)` (`public/js/01-core.js:541`).

**Relève** : toutes les **5 minutes** par défaut (réglable côté serveur), premier passage 30 s après un redémarrage du serveur (`src/services/imapPoller.ts:219-232`). Seuls les mails **non lus** sont traités (`imapPoller.ts:66`). Un mail traité est marqué lu, donc **jamais retraité** (`:86, :114, :128, :188`).

### A. Créer un projet par mail
- **Déclencheur** : le sujet **commence par `NEW`**, majuscules ou minuscules indifférentes, espaces de début ignorés (`imapPoller.ts:94-95`). Le séparateur après NEW est libre : `NEW `, `NEW:`, `NEW -` (`projectFromEmail.ts:47-51`). ⚠️ `NEW` est un simple début de texte : un sujet comme « Newsletter… » ou « NEWS » déclencherait aussi une création. À confirmer avec Amaury, possible piège de formation.
- **Ce que l'IA extrait du sujet + corps** (premiers 8 000 caractères du corps uniquement, `projectFromEmail.ts:159`) : nom du projet, N° interne, client final, contact (nom, e-mail, tél.), adresse, ville, dates d'installation et de démontage, nombre d'ouvriers, description (montage), instructions logistiques (`:59-111`). Consigne donnée à l'IA : ne jamais inventer de date, ne pas confondre l'expéditeur Viewbox avec le client.
- **N° interne** : celui trouvé par l'IA ; sinon le reste du sujet après `NEW`, s'il fait ≤ 24 caractères sans espace ; sinon `VEM-<année>-<4 chiffres>` (`:163-170`). → Exemple fiable : `NEW 6055RKLOKVIE`.
- **Doublon** : si ce N° existe déjà, **rien n'est créé** et l'utilisateur n'est pas prévenu (seulement un log serveur) (`:171-175`).
- **Client** : nom identique (sans casse) dans la base, sinon recherche par e-mail du contact si l'IA ne trouve aucun nom. Si un nom est trouvé mais inconnu, **un nouveau client est créé automatiquement** (risque de doublons de clients). Si aucun nom n'est trouvé, le projet est rattaché au client générique **« ⚠️ Client à confirmer »** (`:41, :121-155`).
- **Dates manquantes** : installation = **date du jour** (un seul jour) par défaut (`:181-184`). À vérifier systématiquement après création.
- **Statut** : 📄 Brouillon (`:199`). Les instructions spéciales commencent par « 📧 Projet créé automatiquement depuis un mail de … » (+ « ⚠️ CLIENT À CONFIRMER… » si besoin) (`:186-191`). ⚠️ Ce champ « instructions spéciales » n'a pas de saisie dans la fiche projet (voir II.5 Q4).
- **Pièces jointes** : **toutes** ajoutées au projet dans 📁 Fichiers (`:212-236`).
- **Notification** in-app « 🆕 Projet créé depuis un email » à tous les **admins et project managers** actifs (`:239-254`).
- **Ne crée PAS** de camions, hôtels ni trajets (ce traitement n'existe que pour un projet existant).

### B. Compléter un projet existant par mail
- **Reconnaissance** : le **N° interne du projet apparaît n'importe où dans le sujet** (sans casse) ; si plusieurs N° conviennent, le **plus long** gagne (`imapPoller.ts:118-123`). Le sujet ne doit **pas** commencer par NEW.
- **Pièces jointes** → 📁 Fichiers du projet, **toutes** sans tri (`:154-183`).
- **Corps du mail → réservations en brouillon** (l'IA lit le corps, premiers 8 000 caractères) (`bookingFromEmail.ts`) :
  - camions et engins : 7 types possibles (camion, camionnette, grue, nacelle ciseaux, manitou, chariot élévateur, générateur), statut brouillon (`:38, :200-226`) ;
  - hôtels : la phase « démontage » doit être reconnue dans le mail ; dates par défaut = dates de la phase du projet ; un hôtel sans nom est ignoré (`:229-257`) ;
  - trajets d'équipe : **uniquement si la personne est déjà dans l'onglet 👥 Équipe du projet** (rapprochement par nom), sinon ignoré (`:260-305`) ;
  - chaque élément porte la note « 📧 Créé auto depuis mail — à valider (mail de …) » (`:37, :197`) ;
  - notification « 🚛 Réservations créées depuis un email » (« … en brouillon. À valider. ») aux admins et PM (`:308-333`).
- **Cas d'échec** (ce que voit l'utilisateur : **rien** dans tous les cas, aucune notification d'échec) :
  - sujet vide → ignoré, marqué lu (`imapPoller.ts:84-89`) ;
  - aucun N° interne reconnu → ignoré, marqué lu, **perdu** (`:125-131`) ;
  - mail sans pièce jointe et sans réservation → marqué lu, rien ne se passe ;
  - mail déjà lu dans la boîte (ouvert par quelqu'un dans Gmail avant la relève) → **jamais traité** (`:66`) ;
  - pièces jointes toutes en échec → le mail reste non lu et sera retenté à la relève suivante (`:185-190`).

### ❌ Écarts avec les « pistes connues » du prompt (ne PAS enseigner)
| Piste connue | Réalité dans le code |
|---|---|
| Corps du mail ajouté aux notes (installation / démontage / global selon mots-clés) | **N'existe pas.** Aucun code n'écrit dans les notes du projet depuis un mail (`grep installNotes/dismantleNotes/scope` dans `src/services`, `src/routes`). Le corps sert uniquement à la création du projet (NEW) ou aux réservations. |
| Signatures et logos inline des mails ignorés | **N'existe pas.** Toutes les pièces jointes, images de signature comprises, sont ajoutées aux Fichiers (`imapPoller.ts:155-183`, `projectFromEmail.ts:213-236`). |
| Badge « Brouillon » sur les réservations | Camions : statut brouillon mais l'onglet Logistique affiche le mot brut « draft ». Hôtels / trajets : aucun badge, seulement la note « à valider » (II.3 § 3.4, 4.4). |
| Règle NEW expliquée dans l'app | Aucune explication visible dans l'app : seul l'encart « projet existant » existe. |
| Import WhatsApp | Aucune trace dans le code. |

## I.3 Éléments exclus de la formation (masqués ou hors périmètre)

| Élément | Raison | Preuve |
|---|---|---|
| Menu « SAV & Stock » : 🛠️ Tickets SAV, 📦 Entrepôt, 🧰 Boîtes à outils | `display:none` | `public/index.html:170-176` |
| Tuiles / boutons tickets et entrepôt du dashboard, onglet mobile 🛠️ Tickets, FAB « 🛠️ Ticket SAV » | `display:none` | `index.html:125, 142, 238, 249-252, 256, 259` |
| Onglets projet ✅ Tâches, 🛠️ Tickets, 📦 Entrepôt, 🧰 Boîtes à outils | `display:none` | `index.html:368, 372-374` |
| « 🤖 Import réunion » | n'existe que dans l'onglet Tâches masqué | II.4 § 1.8 |
| Plans 2D / Plans Viewbox / Étude structure / Loading liste : « 📐 Plans Viewbox » (Infos › Modèles 3D, haut de l'onglet Fichiers), « 📐 Plan 2D → » dans le lecteur 3D | exclusion imposée | II.2 § 5.2, § 7 |
| « 📋 Loading List » du lecteur 3D | proche de la Loading liste des Plans → exclu par prudence, question Q14 | II.2 Q10 |
| Fenêtre « 📸 Nouvelle Visite Client » de `index.html` | jamais ouverte par l'app (code mort) | II.7 § A10 |
| « 🔍 Diag » (Templates tâches) | bouton de diagnostic cassé | II.4 § 2.6 |
| Bloc classique « 📊 Gantt » du briefing | inutilisable | II.5 § 6 |
| Planning public (écran d'entrepôt) | accessible sans connexion, mais lié nulle part dans l'app : à confirmer avant d'en parler | II.1 § 9 |
| « 🛠️ Ticket » dans l'en-tête de la fiche projet | **visible** mais renvoie à un module masqué → anomalie, non enseigné | `index.html:360` |

## I.4 Qui voit quoi (vérifié dans le code)

Il n'y a **aucun masquage de menu par rôle** : tous les comptes voient la même navigation, section « Admin » comprise. Seul le bouton rond « 🤖 Assistant VEM » n'apparaît que pour admin, project manager, technical manager et site manager (`01-core.js:394-420`).

| Action | Qui peut réellement le faire | Preuve |
|---|---|---|
| Voir, créer, modifier, **supprimer définitivement** un projet ; équipe projet, Logistique, Bookings, Fichiers, Briefing, Daily Reports, Visites, Handover | **Tout compte connecté**, y compris un compte Client | `src/routes/projects.ts`, `teamBookings.ts`, `dailyReports.ts`, `handover.ts`… (aucun contrôle) |
| Créer un membre | Admin, Project Manager, Technical Manager | `users.ts:57` |
| Modifier la fiche d'un autre membre, « 📧 Envoyer invitation » | Admin, Project Manager | `users.ts:105, 128` |
| Générer un lien d'invitation | Admin, Project Manager (les autres reçoivent un faux lien « mode démo ») | `auth.ts:257`, `07-auth-mobile-daily-ai.js:190-197` |
| Configurer la check-list d'un projet | Admin, Technical Manager, Project Manager | II.6 § 10 |
| Remplir la check-list | les 3 précédents + Site Manager (uniquement ses projets) ; Installateur : lecture seule, ses projets | `checklists.ts:26-28`, `projectAccess.ts:10` |
| Forcer le lien de signature handover malgré la check-list | Admin, Technical Manager | `handover.ts:370` |
| « 🔄 Viewbox standard » (templates tâches) | Admin (bouton visible pour tous) | `taskTemplates.ts:362` |
| Logo global du Briefing Studio | Admin | II.5 § 3.7 |
| Liste des tâches limitée à ses propres tâches | rôle Ouvrier uniquement | `tasks.ts:16` |

## I.5 Anomalies bloquantes pour la formation (vérifiées)

Corrections recommandées **avant** de diffuser la formation. Je ne corrige rien moi-même (règle 1). Les anomalies mineures (libellés, codes bruts, doublons) sont listées dans chaque partie II.

| # | Anomalie | Impact formation | Preuve |
|---|---|---|---|
| A1 | **« 🔑 Mot de passe oublié ? » ne fonctionne pas** : l'envoi plante (faute de frappe dans l'appel d'envoi) et le lien mène à une page inexistante | Impossible d'enseigner la récupération autonome | `src/routes/auth.ts:150, 153` |
| A2 | **Le bloc « 👷 Équipes & Membres » de « Nouveau Projet » ne s'affiche jamais et n'enregistre rien** | L'équipe doit être ajoutée après, dans l'onglet 👥 Équipe | `public/js/09-files-team-users.js:684-689` (fonction vide), `02-detail-loaders.js:1105` |
| A3 | **« ✏️ Modifier » un projet ignore les blocs Équipe / Tâches / Logistique** : les changements de véhicules sont perdus sans avertissement | Enseigner : véhicules uniquement dans l'onglet 🚛 Logistique | II.2 § 3.2 |
| A4 | **Photos des points de visite jamais enregistrées** (le navigateur envoie une adresse, le serveur attend un fichier ; l'écran affiche quand même « Point ajouté ✅ ») | Module Visites client à moitié inutilisable | `08-visits-remarks.js:558, 591, 763, 795` vs `src/routes/clientRemarks.ts:66` |
| A5 | **« 📄 PDF » sur les cartes de l'onglet projet 🧾 Handover sans effet** (fonction inexistante) ; la page globale Handover produit un ancien PDF (FR, sans signatures) ; seul le « 📄 PDF » de la fiche ouverte est correct | Montrer un seul chemin | `07-auth-mobile-daily-ai.js:1165` ; II.7 § B9 |
| A6 | Handover : « Date de réception » et « Email client » saisis à la création **non enregistrés** ; « Comments / Reservations » du certificat ne marche pas ; Title / Name non repris dans le PDF | Champs à ne pas présenter comme utiles | II.7 § B1, B5 |
| A7 | Statut : un projet neuf (Brouillon) ou restauré (Confirmé) a un **menu de statut vide** (valeurs absentes de la liste) | À expliquer, ou à corriger | `index.html:342-352` ; II.1 § 7 |
| A8 | Fiche tâche : commentaires jamais réaffichés, photos non rattachées | Ne pas enseigner les commentaires / photos de tâche | II.4 § 1.5 |
| A9 | Mot de passe par défaut « VEM2025! » annoncé « à changer à la première connexion » mais **jamais imposé** ; photo de profil du nouveau membre jamais enregistrée | Message erroné à l'écran | `index.html:1231` ; II.3 § 1.2 |
| A10 | Daily report (modification) : météo « Orage » absente (repasse à « Ensoleillé ») ; supprimer toutes les entrées n'est pas enregistré ; « Tâche liée » jamais enregistrée ; sur téléphone, une nouvelle sélection de photos remplace la précédente | Bonnes pratiques à adapter | II.6 § 12 |
| A11 | Sous-équipes gardées uniquement dans le navigateur de leur créateur | Ne pas enseigner les sous-équipes comme partagées | II.3 § 1.1 |

**Failles de sécurité** (hors formation, à traiter en priorité, détails dans les notes techniques des parties II) :
- n'importe quel compte peut se donner le rôle admin en modifiant sa propre fiche (`src/routes/users.ts:15-19, 105`, vérifié) ;
- la personne invitée peut choisir son propre rôle, et ce choix l'emporte sur celui de l'invitation ;
- les données d'identité (registre national, n° de carte) sont lisibles par tous les rôles, y compris Client ;
- tout compte peut supprimer définitivement projets, clients et fichiers ;
- la route de traduction est ouverte sans authentification ;
- une clé de service de cartes est visible en clair dans le code de la page (Briefing).

## I.6 Questions pour Amaury (consolidées, par priorité)

Les listes complètes, avec leur contexte, sont à la fin de chaque partie II (≈ 80 questions au total). Voici celles qui **conditionnent le contenu de la formation** :

**Règle du mail**
- Q1. Confirmez-vous qu'on enseigne **uniquement** ce qui existe : pièces jointes → Fichiers et réservations en brouillon, **sans** ajout aux notes ni filtrage des logos ? Ou ces deux fonctions sont-elles prévues prochainement (et faut-il attendre) ?
- Q2. Préfixe `NEW` : confirmez-vous l'exemple de sujet officiel `NEW 6055RKLOKVIE` ? Faut-il prévenir que tout sujet commençant par « New… » (ex. « Newsletter ») crée un projet ?
- Q3. Un mail ouvert dans Gmail avant la relève n'est jamais traité. Qui consulte la boîte warehouseviewbox@gmail.com ? Faut-il le dire en formation (« ne jamais ouvrir ces mails dans Gmail ») ?
- Q4. Quel est le format officiel du N° interne (ex. `6055RKLOKVIE`, `6072ROACEVIE`) ? Faut-il le rendre obligatoire à la création manuelle (sans N° interne, le projet ne peut pas recevoir de mails) ?

**Périmètre**
- Q5. **Tâches** : abandonnées (on n'enseigne ni Terrain › Tâches, ni ➕ 1 tâche, ni 📋 Plusieurs tâches, et on dit de décocher « Tâches à créer ») ou conservées (onglet réaffiché) ? Les Templates tâches restent-ils à enseigner pour « ⏱️ Heures par tâche » du Daily Report ?
- Q6. Les anomalies A1 à A11 sont-elles corrigées avant la formation ? Sinon, je rédige la formation avec les contournements (ex. équipe ajoutée après création, véhicules uniquement dans l'onglet Logistique, PDF handover depuis la fiche ouverte).
- Q7. Briefing : enseigne-t-on les deux modes ou seulement **Studio + 🪄 Auto-générer** (recommandé) ?
- Q8. Visites client : enseigne-t-on le « 📸 Point visite » du bouton ＋ mobile (le point n'apparaît pas dans l'onglet Visites Client) ou seulement les visites de l'onglet projet ?
- Q9. Planning public (écran d'entrepôt) : à présenter ou non ?
- Q10. Check-list de montage (Templates check-list, configuration, remplissage Liste / Diaporama, PDF) : la prompt dit « uniquement si présente et visible ». Elle l'est, et c'est maintenant le cœur du suivi terrain. Je l'intègre comme module à part entière (Daily Reports + Handover) ?

**Organisation et rôles**
- Q11. Statuts : quel cycle de vie enseigner ? (Brouillon, Confirmé, Chargement, Handover existent mais ne sont pas sélectionnables ; aucun statut ne change automatiquement.) Qui change le statut, et quand ?
- Q12. Les rôles terrain (installateur, ouvrier) doivent-ils être formés au fait qu'ils **peuvent** modifier et supprimer presque tout ? Faut-il une consigne « ne supprimez jamais un projet / client / rapport » en attendant des droits ?
- Q13. Vouvoiement ou tutoiement pour tout le support ? (L'app mélange : « Accédez à votre espace », « Sélectionne un projet ».)
- Q14. « 📋 Loading List » du lecteur 3D : à exclure avec les Plans (proposé) ou à enseigner ?
- Q15. Qui reçoit le PDF signé du handover (aujourd'hui : la personne qui a créé le handover + l'e-mail de la fiche client) ? Est-ce le comportement à enseigner ?

---

# PARTIE II — DÉTAIL PAR MODULE

> Les parties suivantes sont l'inventaire complet produit module par module. Les chemins d'accès, libellés exacts, champs, résultats et preuves `fichier:ligne` servent de référence pour le script des slides (Phase 2). Les sections « Notes techniques » ne sont **pas** destinées à la formation.


---

## II.1 — Audit formation VEM — Lot 1 : connexion, navigation, profil, mobile, dashboard, calendrier, notifications, liste des projets

Audit en lecture seule du code (état du dépôt au 23.10.2026). Chaque constat donne : chemin d'accès, libellés exacts, champs, actions, résultat, ce que ça alimente ailleurs, preuves `fichier:ligne`. « À confirmer » = non prouvable par le code seul (à tester dans l'app).

---

### 1. Connexion

#### 1.1 Écran « Connexion »
- **Chemin** : ouverture de l'app (sans session enregistrée) → écran de connexion. `public/js/07-auth-mobile-daily-ai.js:301-308` (si un jeton est déjà enregistré dans le navigateur, l'app s'ouvre directement sur le Dashboard).
- **Libellés** : logo VIEWBOX + « Event Manager », titre « Connexion », sous-titre « Accédez à votre espace de gestion ». `public/index.html:23-28`
- **Champs** :
  - « Email » (obligatoire, format e-mail, placeholder « votre@email.com ») `index.html:30-31`
  - « Mot de passe » (obligatoire) `index.html:34-35`
  - Case « Rester connecté » (cochée par défaut) `index.html:37-40`
- **Actions** : bouton « Se connecter » ou touche Entrée dans le champ mot de passe (`01-core.js:327`).
- **Résultats / messages** :
  - Champ vide → « Remplis tous les champs » (`01-core.js:299`).
  - Mauvais identifiants ou compte désactivé → « Identifiants invalides » (`src/routes/auth.ts:29,32`, affiché `01-core.js:321`). Le libellé par défaut de la zone d'erreur est « Email ou mot de passe incorrect » (`index.html:42`).
  - Pendant l'envoi le bouton affiche « Connexion... » (`01-core.js:302`).
  - Succès → ouverture du Dashboard (`01-core.js:377-384`), sauf mot de passe temporaire (voir 1.4).
- **Durée de session** : la session dure **8 heures** (`auth.ts:18`). Au-delà, la première action de l'utilisateur ramène silencieusement à l'écran de connexion (toute réponse « non autorisé » déconnecte : `01-core.js:284`). La date de dernière connexion est enregistrée (`auth.ts:34`) — visible ailleurs (fiche membre, hors périmètre).
- **« Rester connecté » — ce que ça fait réellement : RIEN.** La case n'est lue nulle part (`grep remember-me` → seulement `index.html:37-38`). La session est **toujours** mémorisée dans le navigateur (stockage permanent) que la case soit cochée ou non (`01-core.js:310-311`), et elle expire de toute façon après 8 h. → Ne pas présenter cette case en formation comme une option fonctionnelle (voir anomalies).
- **Déconnexion** : « 🚪 Se déconnecter » (menu utilisateur), « 🚪 Déconnexion » (bas du menu latéral), « 🚪 Déconnexion » (fenêtre Mon profil). Effet : efface la session du navigateur et revient à l'écran de connexion (`01-core.js:484-496`). La conversation de l'assistant IA est effacée.

#### 1.2 « 🔑 Mot de passe oublié ? »
- **Chemin** : écran Connexion › lien « 🔑 Mot de passe oublié ? » (`index.html:44`).
- **Fenêtre** : titre « 🔑 Réinitialiser le mot de passe », texte « Entrez votre email — vous recevrez un lien de réinitialisation. », champ « Email », bouton « 📤 Envoyer le lien », lien « ← Retour à la connexion » (`07-auth-mobile-daily-ai.js:106-127`).
- **Messages prévus** :
  - succès : « ✅ Si cet email existe, vous recevrez un lien de réinitialisation dans quelques minutes. » + bouton « ✅ Email envoyé » (`07…js:149-150`) ;
  - erreur : « Erreur — vérifiez votre email ou contactez un administrateur. » + bouton « 📤 Renvoyer » (`07…js:154-155`) ;
  - réseau : « Erreur réseau — réessayez. »
- **E-mail prévu** : objet « 🔑 Réinitialisation de votre mot de passe VEM », bouton « 🔑 Réinitialiser mon mot de passe », lien valable **15 minutes** (`auth.ts:139,166-179`).
- **⚠️ Fonctionnement réel : très probablement CASSÉ (à confirmer par un test)** :
  1. pour une adresse qui existe, le serveur plante avant l'envoi (fonction d'envoi mal nommée, voir notes techniques) → l'utilisateur voit « Erreur — vérifiez votre email ou contactez un administrateur. » ; pour une adresse inconnue il voit le message de succès (aucun mail) ;
  2. même si l'e-mail partait, le lien pointe vers une page « /reset-password » qui **n'existe pas** dans l'app : l'utilisateur atterrirait sur l'écran de connexion normal, sans champ pour saisir un nouveau mot de passe (aucune page ni code front ne lit le jeton : `grep reset-password public` → rien).
  - **Procédure réelle à enseigner** : en cas d'oubli, demander à un admin ou chef de projet de renvoyer une invitation (« 📧 Envoyer invitation » sur la fiche du membre, voir 1.4).

#### 1.3 « Créer mon compte » (lien d'invitation)
- **Qui génère le lien** : Menu › Admin › 👥 Équipe › bouton « 🔗 Inviter » (`index.html:536`) → fenêtre « 🔗 Inviter par lien », texte « Générez un lien : la personne créera elle-même son compte. » (`index.html:567-604`).
  - Champs : « Rôle attribué » (👷 Ouvrier / Équipe, 🔧 Installateur, 🏗️ Site Manager, ⚙️ Technical Manager, 📊 Project Manager, 💼 Sales Engineer, 📦 Entrepôt) ; « Email (optionnel — verrouille l'invitation sur cette adresse) » ; « Note interne (optionnel) ».
  - Bouton « 🔗 Générer le lien » → le lien s'affiche sous « Lien d'invitation (copié automatiquement) : » avec bouton « 📋 » ; toast « Lien copié ✅ » (`07…js:174-209`).
  - **Seuls admin et project_manager** peuvent générer un vrai lien (`auth.ts:257`). Pour les autres rôles, l'app affiche quand même un lien + le message « Lien généré (API invite non déployée — fonctionne en mode démo) » : **ce lien ne fonctionne pas** (`07…js:191-198`).
  - **Validité du lien : 15 minutes**, usage unique (`auth.ts:260`, `auth.ts:289-290`).
- **Page d'inscription** (ouverte par le lien) : titre « Créer mon compte », sous-titre « Complétez vos informations » ou « Rôle : … » (`index.html:59-60`, `07…js:228-240`).
  - Champs (tous obligatoires sauf rôle) : « Prénom », « Nom », « Email », « Rôle » (liste modifiable, pré-sélectionnée selon le lien), « Mot de passe (8 caractères min) », « Confirmer le mot de passe » (`index.html:61-94`).
  - Bouton « ✅ Créer mon compte » ; lien « ← Retour à la connexion ».
  - Messages : « Tous les champs obligatoires doivent être remplis. », « Le mot de passe doit contenir au moins 8 caractères. », « Les mots de passe ne correspondent pas. » (`07…js:261-263`) ; serveur : « Invitation invalide », « Cette invitation a déjà été utilisée », « Invitation expirée », « Cette invitation est réservée à une autre adresse email », « Un compte existe déjà avec cet email » (`auth.ts:288-296`).
  - Succès : connexion automatique, toast « Bienvenue <prénom> ! 🎉 » (`07…js:277-287`).
  - ⚠️ Le rôle **choisi par la personne sur la page** l'emporte sur le rôle choisi par l'admin dans l'invitation (`auth.ts:299`) — voir anomalies.

#### 1.4 Premier accès par mot de passe temporaire (changement obligatoire)
- **Déclenchement** : Menu › Admin › 👥 Équipe › fiche d'un membre › « 📧 Envoyer invitation » (`09-files-team-users.js:575`). Confirmation « Envoyer un mot de passe temporaire (valable 15 min) à <email> ? » ; toast « Invitation envoyée à <email> ✅ (valable 15 min) » (`09…js:622-634`). Réservé admin / project_manager (`src/routes/users.ts:125`).
- **E-mail reçu** : objet « Votre acces VEM - mot de passe temporaire » ; contient l'e-mail, un mot de passe temporaire de 8 caractères, l'avertissement « Ce mot de passe expire dans 15 minutes. Connectez-vous tout de suite. », bouton « Se connecter » (`users.ts:131-180`). L'ancien mot de passe du membre est remplacé et ses sessions sont coupées (`users.ts:135,145`).
- **À la connexion** avec ce mot de passe : fenêtre bloquante « 🔐 Choisissez votre mot de passe » — « Votre accès était temporaire. Définissez maintenant votre mot de passe personnel. », champs « Nouveau mot de passe (8 caractères min) » et « Confirmer », bouton « 💾 Valider » (`01-core.js:330-351`).
  - Messages : « Au moins 8 caractères. », « Les mots de passe ne correspondent pas. », « Choisissez un mot de passe différent du temporaire. », toast « Mot de passe défini ✅ » (`01-core.js:360-369`).
  - Après 15 min : « Mot de passe temporaire expiré. Demandez un nouvel envoi à un administrateur. » (`auth.ts:46`).

---

### 2. Profil — « 👤 Mon profil »

- **Chemin** : bureau : clic sur son nom en bas du menu latéral › « 👤 Mon profil » (`index.html:186-195`) ; en haut à droite (initiales) › « 👤 Mon profil » (`index.html:211-214`, visible bureau et mobile).
- **Contenu** (`03-create-forms.js:931-978`) : titre « 👤 Mon Profil », initiales, Prénom Nom, rôle, bloc « Email » / « Rôle ».
- **Modifiable : uniquement le mot de passe.** Bouton « 🔑 Changer mon mot de passe » → panneau « 🔑 Changer le mot de passe » : « Ancien mot de passe », « Nouveau mot de passe (8 caractères min) », « Confirmer le nouveau mot de passe », boutons « Annuler » / « 💾 Valider ».
  - Messages : « Remplis tous les champs », « Le nouveau mot de passe doit faire au moins 8 caractères », « Les deux nouveaux mots de passe ne correspondent pas », « Le nouveau doit être différent de l'ancien », « Ancien mot de passe incorrect » (serveur), succès « Mot de passe modifié ✅ » (`03…js:986-1003`, `auth.ts:228-252`).
  - Effet : les autres appareils devront se reconnecter à terme (`auth.ts:248`) — à confirmer en pratique (la session en cours continue jusqu'à 8 h).
- **Non modifiable depuis le profil** : nom, e-mail, téléphone, photo, langue (aucun champ). La photo/avatar n'est pas utilisée : partout ce sont les initiales. Pas de choix de langue de l'interface (l'interface est en français ; la langue n'est choisie qu'à l'export de certains PDF : « 📄 Langue du PDF » 🇫🇷 Français / 🇬🇧 English, `01-core.js:22-47`).
- Boutons du bas : « Fermer », « 🚪 Déconnexion ».
- Le rôle s'affiche sous forme de **code technique** (ex. « technical_manager ») dans le profil (`03…js:942,947`).

---

### 3. Navigation bureau (menu latéral)

#### 3.1 Éléments visibles (`index.html:150-202`)
- Logo VIEWBOX « Event Manager » ; bouton « ‹ » (« Replier / déplier la barre ») — le choix replié/déplié est **mémorisé** dans le navigateur (`01-core.js:526-537`).
- **Principal** : « 📊 Dashboard », « 🏗️ Projets »
- **Terrain** : « ✅ Tâches », « 📓 Daily Reports », « 🧾 Handover », « 📸 Visites Client »
- **Admin** : « 📋 Templates tâches », « ☑️ Templates check-list », « 🏢 Clients », « 👥 Équipe », « 🔔 Notifications » (avec compteur)
- Bas : nom + rôle de l'utilisateur (menu « 👤 Mon profil » / « 🚪 Se déconnecter »), « 🚪 Déconnexion ».
- Barre du haut : titre de la page, « 🔔 » (ouvre Notifications), initiales (menu profil).

#### 3.2 Éléments CACHÉS (exclus de la formation)
- Section entière « SAV & Stock » : « 🛠️ Tickets SAV », « 📦 Entrepôt », « 🧰 Boîtes à outils » — `style="display:none"` (`index.html:170-176`).
- Dashboard : carte stat « Tickets ouverts » (`index.html:238`), carte « 🚨 Tickets urgents » (`index.html:249-252`), actions rapides « 🛠️ Ticket SAV » et « 📦 Entrepôt » (`index.html:256,259`).
- Mobile : onglet bas « 🛠️ Tickets » (`index.html:125`) et entrée FAB « 🛠️ Ticket SAV » (`index.html:142`).
- (Hors périmètre mais même logique) onglets projet « ✅ Tâches », « 🛠️ Tickets », « 📦 Entrepôt », « 🧰 Boîtes à outils » cachés (`index.html:368,372-374`).

#### 3.3 Visibilité selon le rôle
- **Aucun élément du menu n'est masqué selon le rôle** : tout le monde (ouvrier, installateur, entrepôt, client…) voit la même navigation, y compris la section « Admin » (aucun test de rôle sur le menu : `grep "role ===" public/js` → uniquement assistant, plans, check-lists).
- Seul élément de navigation dépendant du rôle : le bouton rond « 🤖 » « Assistant VEM » en bas à droite, visible uniquement pour admin, project_manager, technical_manager, site_manager (`01-core.js:394-420`). Placeholder : « Pose ta question… ».
- Les droits réels sont vérifiés action par action côté serveur (ex. invitation : admin/project_manager). Un utilisateur peut donc voir un bouton et recevoir une erreur « Permission insuffisante ».
- Accès « Plans 2D » : activé personne par personne (fiche membre), message sinon « Accès aux Plans 2D non activé pour ton compte » (`01-core.js:118-127`) — détail dans un autre lot.
- Libellé du rôle sous le nom : Admin, Chef Projet, Site Manager, Tech. Manager, Engineer, Ouvrier, Client ; pour installateur / entrepôt / sales engineer, le **code brut** s'affiche (`01-core.js:502-505`).

---

### 4. Mobile (écran ≤ 768 px)

- Le menu latéral est masqué ; **barre du bas** (`index.html:111-137`, CSS `public/css/app.css:414-445`) :
  - « 📊 Dashboard », « 🏗️ Projets », bouton central rond « ＋ » (FAB), « ☰ Menu ». (« 🛠️ Tickets » caché.)
- « ☰ Menu » (et aussi « ☰ » en haut à gauche de la barre du haut) ouvre le **même menu latéral** que sur ordinateur, par-dessus l'écran ; il se ferme en touchant le fond sombre ou un élément du menu (`07…js:34-44,79-86`).
- **FAB « ＋ »** (`index.html:140-145`) :
  - « 📓 Daily Report » → ouvre la fenêtre de création de daily report (champ « Projet * » à choisir) ;
  - « 🧾 Handover » → fenêtre de création de handover ;
  - « 📸 Point visite » → fenêtre « 📍 Nouveau Point Terrain » (« Avec le client sur site »), bouton « 📍 Enregistrer » (`08-visits-remarks.js:609-640`) ;
  - (« 🛠️ Ticket SAV » caché).
- **« 📸 Point visite » sans projet ouvert** : la fenêtre s'ouvre normalement (aucun choix de projet) ; à l'enregistrement, le point est rattaché au **dernier projet ouvert pendant la session** (la mémoire du « projet en cours » n'est pas remise à zéro quand on revient au Dashboard : `01-core.js:605-607`, `goto` ne la vide pas `01-core.js:552-583`). Si aucun projet n'a été ouvert depuis la connexion, l'enregistrement échoue avec un message d'erreur après la saisie (projet vide envoyé, `08…js:733-734,776-779`) — **à confirmer** par test. → En formation : « ouvrez toujours d'abord le projet ».
- Barre du haut mobile : « ☰ », titre, « 🔔 », initiales (menu « 👤 Mon profil » / « 🚪 Se déconnecter »).
- Les fenêtres s'ouvrent en « feuille » depuis le bas ; fermeture uniquement par la croix « × » (le glisser vers le bas est désactivé, `07…js:94-97`).
- Le bouton « 🤖 » (rôles pilotage) reste en bas à droite : chevauchement possible avec la barre du bas — **à confirmer** visuellement.

---

### 5. Dashboard

- **Chemin** : « 📊 Dashboard » (menu, barre du bas) ; page d'arrivée après connexion.
- En-tête : « Bonjour, <Prénom> 👋 », date du jour en toutes lettres (`01-core.js:508-511`) ; bouton « + Nouveau Projet » (`index.html:232`).

#### 5.1 Compteurs (`index.html:235-240`)
- **« Projets actifs »** = nombre de projets au statut **🔧 En préparation, 🏗️ En installation ou 📍 Sur site** uniquement (`01-core.js:631`). Ne comptent PAS : Brouillon, Confirmé, Devis à valider, Devis validé, Chargement, Handover, Handover OK, Démontage, Terminé, Annulé.
- **« Tâches terminées »** : affiche **toujours « — »** (valeur jamais calculée, `01-core.js:660`).
- **« Membres équipe »** = nombre total de comptes utilisateurs actifs de VEM (pas l'équipe d'un projet) (`01-core.js:642`, `src/routes/users.ts:32`).

#### 5.2 « 🏗️ Projets en cours » (`index.html:244-245`, `01-core.js:664-669`)
- Affiche au plus **3** projets aux statuts En préparation, **Chargement**, En installation ou Sur site, dans l'ordre du calendrier (ordre manuel ▲▼ puis date d'installation).
- Chaque carte : badge statut, n° interne, nom, « 📍 ville (ou adresse) · client », barre de progression + % (progression = points de check-list traités). Clic = ouvre le projet.
- Message si vide : « Aucun projet actif ». Lien « Voir tout → » = page Projets.

#### 5.3 « ⚡ Actions rapides » (`index.html:253-261`)
- « 📓 Daily report » → page Daily Reports ; « 🧾 Handover » → page Handover. (« 🛠️ Ticket SAV » et « 📦 Entrepôt » cachés.)

#### 5.4 « 📅 Calendrier projets » (`index.html:265-300`, `01-core.js:815-1062`)
- **Période** : « 2 sem. », « 4 sem. », « 6 sem. » (défaut), « 8 sem. », « 12 sem. », « 20 sem. », « 26 sem. (6 mois) ». Commence toujours au **lundi de la semaine en cours** (pas de retour dans le passé). Jusqu'à 12 semaines, une ligne jour par jour (L M M J V S D) avec week-ends colorés et aujourd'hui en rouge ; au-delà, semaines notées « S<n° de semaine> ».
- **Projets affichés** : ceux qui ont une date de début d'installation et dont la période d'installation ou de démontage tombe dans la fenêtre, moins ceux décochés dans le filtre. ⚠️ Les projets **archivés/annulés et terminés y apparaissent aussi** (aucun filtre de statut, `01-core.js:840-841`).
- **Barres** : **bleue** = installation (« 📐 », dates « jj/mm → jj/mm » si la barre est assez large) ; **orange** = démontage (« 📦 ») ; trait rouge vertical = aujourd'hui. Infobulle au survol avec les dates complètes. Légende en bas : « 📐 Installation », « 📦 Démontage », « Week-end », « Aujourd'hui » (+ « 🚛 Camion », « Pointillés = trajets » selon options).
- **« 🚛 Camions »** (case) : sous chaque projet, une sous-ligne par véhicule « └ <icône> <n° camion / plaque / « Véhicule »> » + chauffeur, barre **verte** de la date de chargement à la date d'arrivée (à défaut, dates d'installation) (`01-core.js:969-995`).
- **« 👥 Équipes »** (case) : sous chaque projet, une sous-ligne par réservation d'équipe (onglet Bookings) « └ 🏗️/🔨 Prénom Nom » + rôle ; barre bleue (installation) ou orange (démontage) = présence sur site, **hachures** = trajet aller / retour ; « └ Aucun booking équipe » si rien (`01-core.js:998-1031`).
- **« 🎯 Filtrer projets (x/y) »** : liste de cases à cocher « Projets visibles » avec « Tout cocher » / « Tout décocher » ; seuls les projets non annulés avec date d'installation y figurent (`01-core.js:697-770`). Message si aucun : « Aucun projet planifié ». Si plus rien n'est visible : « Aucun projet visible sur N semaines. Vérifie le filtre "🎯 Filtrer projets" si tu as décoché des projets. »
- **Réordonner** : flèches **▲ « Monter » / ▼ « Descendre »** à gauche de chaque projet (pas de glisser-déposer). L'ordre est **enregistré pour tout le monde** (partagé) et sert aussi d'ordre par défaut à la liste Projets et à « Projets en cours » (`01-core.js:774-812`, `src/routes/projects.ts:30,82-97`).
- **Clic** sur le nom ou sur la barre d'un projet = ouvre la fiche projet.
- **Mémorisation** : le filtre de projets décochés est **mémorisé dans ce navigateur** (`01-core.js:690-694`) ; la période et les cases Camions / Équipes **ne sont pas mémorisées** (retour à 6 semaines, cases décochées à chaque chargement). L'ordre ▲▼ est enregistré sur le serveur.
- « Voir tous → » = page Projets.

---

### 6. Liste des projets

- **Chemin** : Menu › Principal › « 🏗️ Projets » (ou barre du bas « 🏗️ Projets », ou « Voir tout → »). Titre « Projets », sous-titre « Gestion des installations », bouton « + Nouveau Projet » (`index.html:304-331`).
- **Recherche** « Rechercher un projet... » : sur le **nom** et le **n° interne** uniquement (pas le client ni la ville) (`01-core.js:1149`).
- **Filtre statut** : « Tous les statuts », « Brouillon », « Préparation », « Installation », « Terminé » (`index.html:311-317`). Seuls 4 des 13 statuts sont proposés. « Terminé » ne montre rien tant que « 📦 Voir archivés » n'est pas coché.
- **Tri** « Trier par... » : « 📐 Installation (plus proche) », « 📐 Installation (plus loin) », « 📦 Démontage (plus proche) », « 📦 Démontage (plus loin) » ; projets sans date en fin de liste (`01-core.js:1157-1170`). Sans tri choisi : ordre du calendrier (▲▼) puis date d'installation.
- **« 📦 Voir archivés »** : décoché = masque les projets **Annulé (archivé) et Terminé** ; coché = affiche **tout** (archivés inclus, mélangés aux actifs) (`01-core.js:1151-1154`).
- **Carte projet** (`01-core.js:1118-1140`) : badge statut, n° interne, nom, client, « 📍 ville », « 📐 Installation : date → date », « 📦 Démontage : date → date », « 👷 <nombre d'ouvriers prévus> », badge rouge « 🛠️ n » si tickets, barre de progression + %, nom du Technical Manager. Clic = fiche projet. Liste vide : « Aucun projet » / « Créez votre premier projet ».
- **Archivage : uniquement manuel.** Fiche projet › bouton « 📦 » (« Archiver / Supprimer ») → fenêtre « 📦 Archiver le projet » : « Archiver le projet » (« Le projet est conservé mais masqué de la liste active. Récupérable à tout moment. »), « ♻️ Restaurer le projet » (si déjà archivé — « Remettre le projet en statut actif. »), « 🗑️ Supprimer définitivement » (« Action irréversible — toutes les données seront perdues. » → « Confirmer la suppression ? » « Non » / « Oui, supprimer »), « Annuler » (`09-files-team-users.js:1095-1201`).
  - Archiver = passer le statut à « ❌ Annulé » (même chose que choisir « ❌ Annulé » dans la liste des statuts). Toast « Projet archivé 📦 ».
  - Restaurer = statut « Confirmé ». Toast « Projet restauré ♻️ ».
  - Aucun archivage automatique (aucune règle de date ou de statut côté serveur).
- **Visibilité par rôle** : tous les utilisateurs voient **tous les projets** (aucune restriction dans la liste, `src/routes/projects.ts:19-80`).

---

### 7. Statuts de projet

#### 7.1 Liste complète et libellés (`prisma/schema.prisma:23-37`, libellés `02-detail-loaders.js:2-19`)
| Code | Libellé fiche projet | Dans le menu déroulant de la fiche ? | Compté « Projets actifs » ? | Dans « Projets en cours » ? |
|---|---|---|---|---|
| draft | 📄 Brouillon | **Non** | Non | Non |
| confirmed | ✔️ Confirmé | **Non** | Non | Non |
| quote_to_validate | 📝 Devis à valider | Oui | Non | Non |
| quote_validated | ✅ Devis validé | Oui | Non | Non |
| in_preparation | 🔧 En préparation | Oui | **Oui** | Oui |
| loading | 📦 Chargement | **Non** | Non | **Oui** |
| on_site | 📍 Sur site | Oui | **Oui** | Oui |
| installation | 🏗️ En installation | Oui | **Oui** | Oui |
| handover | 🧾 Handover | **Non** | Non | Non |
| handover_ok | 🧾 Handover OK | Oui | Non | Non |
| dismantling | 🔨 Démontage | Oui | Non | Non |
| completed | 🎉 Terminé | Oui | Non | Non (masqué de la liste sauf « Voir archivés ») |
| cancelled | ❌ Annulé (= « 📦 Archivé » sur la carte) | Oui | Non | Non (masqué de la liste sauf « Voir archivés ») |

- **Menu déroulant** sous le nom du projet (fiche projet, `index.html:342-352`) : ordre affiché 📝 Devis à valider, ✅ Devis validé, 🔧 En préparation, 🏗️ En installation, 📍 Sur site, 🧾 Handover OK, 🔨 Démontage, 🎉 Terminé, ❌ Annulé. Changer la valeur enregistre immédiatement — toast « Statut du projet mis à jour ✅ » (`01-core.js:1177-1194`). Le statut est aussi affiché dans la carte Infos (ligne « Statut »).
- **Projet en Brouillon** (cas de **tout projet créé avec « + Nouveau Projet »** — aucun statut n'est envoyé, valeur par défaut « draft » — et des projets créés automatiquement à partir d'un e-mail, `src/services/projectFromEmail.ts:199`) : la valeur n'existe pas dans le menu → le menu déroulant apparaît **vide** (à confirmer visuellement) ; la carte Infos affiche bien « 📄 Brouillon ». Impossible de revenir à Brouillon / Confirmé / Chargement / Handover via le menu.
- Un projet restauré passe à « Confirmé », lui aussi absent du menu (menu vide).
- **Effets d'un statut** (dans le périmètre) : compteur « Projets actifs », carte « Projets en cours », masquage dans la liste (Terminé / Annulé), couleur sur le planning public. **Aucun changement de statut automatique** n'existe (ni à la signature du handover, ni aux dates) : `grep` des mises à jour de statut dans `src/` → seulement la création par e-mail (draft) et la modification manuelle (`src/routes/projects.ts:184-210`).

---

### 8. Notifications

#### 8.1 Page « Notifications »
- **Chemin** : Menu › Admin › « 🔔 Notifications » ; ou « 🔔 » dans la barre du haut (`index.html:183,210`).
- Titre « Notifications », bouton « Tout lire » (toast « Tout marqué comme lu ✅ ») (`index.html:548-553`, `02-detail-loaders.js:1033-1037`).
- Liste des **50 dernières** notifications de l'utilisateur, plus récentes en premier (`src/routes/notifications.ts:8-17`). Chaque ligne : icône, titre (gras si non lue), texte · date, badge « Nouveau » ou « Lu ». **Clic sur une ligne = la marque comme lue** (n'ouvre pas le projet concerné) (`02-detail-loaders.js:1000-1031`). Vide : « Aucune notification ».
- **Compteur** : pastille rouge à côté de « 🔔 Notifications » dans le menu = nombre de non lues ; mise à jour à la connexion, en ouvrant la page Projets ou la page Notifications (pas en temps réel) (`01-core.js:655-657`).
- ⚠️ Le petit point rouge sur la « 🔔 » de la barre du haut ne correspond PAS aux notifications : il s'allume quand il existe des tickets SAV ouverts (fonction cachée) (`01-core.js:653`).

#### 8.2 Types de notifications créés dans l'app (inventaire complet : `grep notification.create src`)
| Titre exact | Qui la reçoit | Quand |
|---|---|---|
| « 🆕 Projet créé depuis un email » — texte « <nom> (<n°>) · client : <client> · n fichier(s). À vérifier. » | tous les admins et chefs de projet (project_manager) actifs | quand un e-mail entrant crée automatiquement un projet (en Brouillon) (`src/services/projectFromEmail.ts:233-256`) |
| « 🚛 Réservations créées depuis un email » — texte « <n°> · n camion(s), n hôtel(s), n trajet(s) en brouillon. À valider. » | tous les admins et chefs de projet actifs | quand un e-mail entrant crée des réservations (camions / hôtels / trajets) en brouillon (`src/services/bookingFromEmail.ts:307-333`) |
| « 📤 <nom du projet> » — mot personnel + résumé choisi | le membre d'équipe visé | quand quelqu'un utilise « 📤 » (« Envoyer infos / notifier ») sur un membre dans l'onglet 👥 Équipe d'un projet, canal « 📱 Notif » ou « 📱+✉️ Les deux » (`src/routes/projects.ts:268-401`, `10-logistics-bookings.js:305-412`, bouton `02-detail-loaders.js:330`) |
- Contenus possibles du « 📤 » : « 📌 Notification d'assignation », « 📋 Infos du projet », « 📊 Briefings », « 🚚 Ses réservations », « 📄 Derniers rapports », « 🤖 Message personnalisé (IA) » + « Message (optionnel) ».
- Pas de notification push sur le téléphone, ni d'alerte sonore, ni de mise à jour en direct de la liste.

#### 8.3 E-mails envoyés aux utilisateurs (périmètre compte / projet)
- « Votre acces VEM - mot de passe temporaire » : à la personne, quand un admin/chef de projet clique « 📧 Envoyer invitation » (voir 1.4).
- « 🔑 Réinitialisation de votre mot de passe VEM » : prévu sur « Mot de passe oublié », non fonctionnel (voir 1.2).
- « [VEM] <projet> — infos projet » : au membre d'équipe, via « 📤 » canal « ✉️ Email » ou « 📱+✉️ Les deux » (`src/routes/projects.ts:405-411`), bouton « Ouvrir VEM » dans le mail.
- Autres envois (hors périmètre de ce lot, à couvrir ailleurs) : daily report, handover PDF, check-list PDF, visites client, ticket assigné (tickets cachés).

#### 8.4 Telegram
- Un message Telegram est envoyé **au groupe de l'entrepôt** (pas aux utilisateurs individuels) quand un véhicule est **créé** ou quand sa date de chargement / d'arrivée, son lieu de chargement / déchargement ou son statut est **modifié**, **uniquement si le lieu de chargement ou de déchargement contient « Tubize »** (`src/services/telegramService.ts:126-170`, `src/routes/projects.ts:511-569`). Contenu : « 🆕 Camion planifié » / « ✏️ Camion modifié », trajet, type, projet, date, chauffeur, « 👤 À assigner : <responsable entrepôt> », notes. Une tâche est aussi créée dans l'app entrepôt (hors périmètre).

---

### 9. Planning public (écran d'entrepôt)

- Page autonome « Planning Projets — 2 mois » (`public/planning-public.html`), accessible **sans connexion** à l'adresse de l'app suivie de `/planning-public.html`.
- **Aucun lien dans l'interface VEM** n'y mène (`grep planning-public public` → seulement la page elle-même) : il faut connaître l'adresse.
- Contenu : 60 jours à partir d'aujourd'hui, projets non annulés qui chevauchent cette période (`src/routes/publicCalendar.ts:43-84`) ; colonne nom / client / n° · ville ; barre « Installation » colorée selon le statut, barre « Démontage » hachurée orange, 🚛 au jour de chargement de chaque camion, repère « AUJOURD'HUI ». Légende : Confirmé, Préparation, Installation, Sur site, Handover OK, Terminé, Démontage, 🚛 Camion. Mention « Dernière MAJ : … » et « Actualisation auto toutes les 6h ». Message vide : « Aucun projet planifié sur les 2 prochains mois. »
- Lecture seule, aucun clic utile. Affiche les noms de projets et de clients à quiconque a l'adresse (voir questions).

---

### 10. Traduction automatique

- Utilisée dans l'interface uniquement par **Briefing Studio** : à l'export PDF d'un briefing, si l'on choisit « 🇬🇧 English » dans « 📄 Langue du PDF », les textes des slides sont traduits automatiquement (`public/js/13-briefing-studio-slides.js:578-659`).
- Côté serveur la même traduction sert aux PDF en anglais (handover, check-list, daily report : textes saisis traduits) (`src/services/pdfService.ts:461-473,756,1084,1480`).
- Langues : français ↔ anglais seulement.

---

### 11. Anomalies / incohérences UX (à corriger ou à signaler en formation)

1. **« Rester connecté » ne fait rien** : case jamais lue ; session toujours mémorisée, expiration fixe 8 h (`index.html:37-38`, `01-core.js:310-311`, `auth.ts:18`). De plus, cliquer directement sur la case (et non sur le texte) semble la cocher puis décocher aussitôt (double déclenchement `index.html:37`) — à confirmer.
2. **« Mot de passe oublié » cassé** (envoi en erreur + page de réinitialisation inexistante) (`auth.ts:150-153`, aucune page front).
3. **Déconnexion silencieuse après 8 h** : retour à l'écran de connexion sans message, saisie en cours perdue (`01-core.js:284`).
4. **Invitation par lien** : rôle modifiable par la personne invitée, qui prime sur celui choisi par l'admin (`index.html:77-85`, `auth.ts:299`) ; lien valable 15 min seulement ; faux lien « mode démo » généré si l'utilisateur n'a pas le droit (`07…js:191-198`) ; libellés de rôle différents entre le sous-titre de la page d'inscription (« 👷 Installation Team », « ⚙️ Sales Engineer » pour engineer, « 🔧 Technical Manager », « 📦 Warehouse Labour ») et la liste (« 👷 Ouvrier / Équipe », « ⚙️ Technical Manager », « 💼 Sales Engineer », « 📦 Entrepôt ») (`07…js:229-235` vs `index.html:78-84`) ; installer / project_manager / sales_engineer n'ont pas de sous-titre.
5. **Premier accès** : si la personne recharge la page pendant la fenêtre « 🔐 Choisissez votre mot de passe », elle entre dans l'app sans changer le mot de passe (le démarrage ne vérifie pas l'obligation, `07…js:304-305`), puis ne pourra plus se reconnecter après 15 min — à confirmer.
6. **Rôle affiché en code brut** dans « Mon profil » (« technical_manager ») et sous le nom pour installer / warehouse / sales_engineer (`03-create-forms.js:942,947`, `01-core.js:502`). Le libellé « Chef Projet » (menu) ≠ « 📊 Project Manager » (invitation).
7. **Titre de page brut** : pour « 🏢 Clients » et « 📋 Templates tâches », la barre du haut affiche « clients » / « templates » (clés absentes de `pgTitles`, `01-core.js:515-521,560`). « Templates check-list » s'affiche « Templates Check-list ».
8. **Section « Admin » visible par tous les rôles**, sans filtrage (boutons visibles → refus serveur possible).
9. **« Tâches terminées » toujours « — »** sur le Dashboard (`01-core.js:660`), alors que les tâches sont par ailleurs masquées dans les projets.
10. **« Projets actifs » ≠ « Projets en cours »** : le compteur ignore « Chargement », la carte l'inclut ; ni l'un ni l'autre ne comptent Brouillon, Confirmé, Devis, Handover OK, Démontage (un projet en démontage n'est plus « actif »). « Projets en cours » limité à 3 sans le dire.
11. **Statut affiché en code brut sur les cartes de la liste Projets** (ex. « in_preparation », « on_site », « handover_ok ») au lieu des libellés français (`01-core.js:1121`), alors que le Dashboard et la fiche utilisent des libellés (et ces deux jeux de libellés diffèrent : « Préparation » vs « 🔧 En préparation », « Installation » vs « 🏗️ En installation »).
12. **Menu des statuts incomplet** : Brouillon, Confirmé, Chargement, Handover absents → menu vide pour tout nouveau projet (créé manuellement ou par e-mail) et pour un projet restauré (`index.html:342-352`). Filtre de la liste limité à 4 statuts, libellés différents.
13. **« Annulé » = « Archivé »** : deux mots pour la même chose (statut « ❌ Annulé » dans la fiche, badge « 📦 Archivé » sur la carte, bouton « 📦 »). Un projet terminé est aussi rangé dans « archivés » sans être archivé.
14. **« 📦 Voir archivés »** affiche tout (actifs + archivés + terminés) au lieu des seuls archivés ; le filtre « Terminé » ne donne rien si la case n'est pas cochée.
15. **Calendrier** : projets annulés/archivés et terminés affichés ; les annulés n'apparaissent pas dans « 🎯 Filtrer projets », donc impossibles à masquer un par un ; compteur « (x/y) » potentiellement faux après « Tout décocher » (`01-core.js:1057-1060`) ; période et cases Camions/Équipes non mémorisées ; commentaire « drag » mais seulement ▲▼ ; l'ordre ▲▼ est global (modifie l'ordre de tous les collègues) sans avertissement.
16. **Recherche projets** : ne cherche pas le client ni la ville.
17. **Point rouge de la 🔔 (barre du haut) lié aux tickets cachés**, pas aux notifications ; sur mobile, aucun compteur de notifications visible hors menu ; compteur non rafraîchi en continu ; clic sur une notification ne mène pas au projet.
18. **FAB « 📸 Point visite »** : rattaché au dernier projet ouvert sans l'indiquer ; échec seulement à l'enregistrement si aucun projet ouvert.
19. **Doublons** : deux boutons de déconnexion dans le menu latéral (« 🚪 Se déconnecter » dans le menu utilisateur + « 🚪 Déconnexion » juste dessous) + un dans le profil ; deux « ☰ » sur mobile (haut et bas) ; deux accès « 👤 Mon profil » sur bureau ; « + Nouveau Projet » sur Dashboard et Projets (normal).
20. **Bouton « 🛠️ Ticket »** dans la fiche projet reste visible alors que les tickets SAV sont cachés partout ailleurs (`index.html:360`) ; carte projet affiche encore « 🛠️ n » (tickets).
21. Message technique possible pour l'utilisateur lors d'un point visite en échec : « SQL client_remarks manquant dans Railway » (`08-visits-remarks.js:778`).
22. Après archivage, la liste Projets est rechargée deux fois avec des règles différentes (terminés visibles un instant puis masqués) — à confirmer.
23. « Membres équipe » = tous les comptes VEM actifs (y compris rôles client / entrepôt), libellé trompeur.

---

### 12. Questions pour le product owner

1. « Rester connecté » : faut-il le faire fonctionner (session longue sur appareil personnel / courte sinon) ou retirer la case ? Durée souhaitée d'une session (8 h aujourd'hui) ?
2. « Mot de passe oublié » : on le répare (page de réinitialisation) ou on le remplace par « demandez à un admin » ?
3. Lien d'invitation : la personne invitée doit-elle pouvoir choisir son rôle ? 15 minutes de validité suffisent-elles ?
4. Quels statuts doivent vraiment exister ? (Brouillon, Confirmé, Chargement, Handover ne sont pas sélectionnables.) Quel statut un nouveau projet doit-il avoir ?
5. Définition de « Projets actifs » : doit-elle inclure Chargement, Handover OK, Démontage, Confirmé / Devis validé ?
6. « Tâches terminées » : remplacer par un indicateur de check-list (puisque les tâches sont masquées) ou supprimer ?
7. Archivage : un projet « Terminé » doit-il être considéré comme archivé ? Faut-il un archivage automatique (ex. X jours après démontage) ?
8. Le calendrier doit-il exclure les projets annulés / terminés ? Mémoriser période et options ? L'ordre ▲▼ doit-il rester commun à tous ?
9. Faut-il masquer la section « Admin » et certains boutons selon le rôle (ouvrier, installateur, entrepôt, client) ? Les installateurs/site managers doivent-ils voir tous les projets ?
10. Notifications : faut-il un compteur visible sur mobile, un clic qui ouvre le projet, d'autres déclencheurs (assignation automatique, nouveau daily, handover signé) ?
11. Planning public : qui doit en connaître l'adresse ? Accepte-t-on qu'il soit consultable sans mot de passe (noms clients visibles) ? Faut-il un lien dans l'app ?
12. Telegram : le groupe entrepôt et le responsable « À assigner » sont-ils à jour ? D'autres lieux que Tubize ?
13. Langue de l'interface : besoin d'une interface en anglais pour certains collègues ?

---

### Notes techniques (NE PAS mettre en formation)

- **Session** : JWT d'accès 8 h (`src/routes/auth.ts:18`), refresh token 30 j créé et stocké en base (`auth.ts:56-60`) mais **jamais stocké ni utilisé par le front** (`grep refreshToken public/js` → rien) ; `POST /auth/refresh` et `/auth/logout` inutilisés. Jeton en `localStorage` `vem_token` / `vem_user` (`01-core.js:265-266,310-311`).
- **Forgot password** : `nodemailer.createTransporter` n'existe pas (l'API est `createTransport`, cf. `node_modules/nodemailer/lib/nodemailer.js:21`) → TypeError → 500 pour les e-mails existants ; table `password_reset_tokens` non créée dans `src/utils/migrations.ts` (seulement en commentaire `auth.ts:115-122`) ; envoi via SMTP direct et non via le relais habituel `sendMail` ; URL `${APP_URL}/reset-password?token=` sans page (le catch-all `src/index.ts:149` renvoie `index.html` qui ignore le paramètre). `POST /auth/reset-password` existe côté API (`auth.ts:192-224`).
- **Register** : `finalRole = role || invite.role` (`auth.ts:299`) → élévation de privilège possible (n'importe quel rôle, y compris `admin`, via l'API). Fallback front qui fabrique un faux jeton client (`07…js:192-197`).
- **PATCH /users/:id** : un utilisateur peut modifier son propre compte avec la liste blanche `EDITABLE_FIELDS` qui contient `role` et `isActive` (`src/routes/users.ts:16-18,102-120`) → auto-promotion possible via l'API.
- **Projets** : aucune restriction par rôle sur `GET /projects`, `PATCH /projects/:id` (statut), `DELETE /projects/:id` (suppression définitive ouverte à tout utilisateur connecté, `src/routes/projects.ts:215-220`), `PATCH /projects/reorder`.
- **/api/v1/translate** monté **sans authMiddleware** (`src/index.ts:124`) → endpoint de traduction payant (OpenAI, `translationService`) appelable publiquement.
- **Planning public** `/api/v1/public/calendar` sans auth (`src/index.ts:95`), expose nom, client, ville, dates, camions.
- **Socket.IO** : le serveur émet `notification:new` / `project:updated` (`projects.ts:207,397`) mais le front n'a aucun client socket (`grep socket public/js` → rien).
- **Telegram** : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WAREHOUSE_CHAT_ID`, mot-clé `TELEGRAM_WAREHOUSE_TUBIZE_KEYWORD` (défaut « Tubize »), destinataire `TELEGRAM_WAREHOUSE_ASSIGNEE` (défaut « Oliver ») (`telegramService.ts:19-25`). Création de tâche EntrepôtApp `createWarehouseTask`.
- Notifications créées : types `project_created_email`, `bookings_created_email`, `project_info` (icône 🔔 pour les trois car le front ne reconnaît que `ticket` / `task` / `daily`, `02-detail-loaders.js:1011`).
- `loadProjects()` (`01-core.js:1096-1109`) et `filterProjects()` appliquent des règles d'archivage différentes ; `proj-count` n'existe pas dans le HTML.
- `notif-pip` alimenté par `tickets/stats` (`01-core.js:653`).
- Point visite en échec : message d'erreur mentionnant l'hébergeur (`08-visits-remarks.js:778`).
- `app_settings` / Plans : `hasPlansAccess` (`01-core.js:118-120`), resynchronisé à chaque `loadAll` (`01-core.js:636-640`).

---

## II.2 — Audit formation VEM — n° 2 : Clients, création / modification de projet, fiche projet (en-tête + 📋 Infos), archivage / suppression, 📁 Fichiers et visionneuse 3D

Audit en lecture seule du code (rien n'a été modifié). Date : 23.10.2026.
Convention : `fichier:ligne`. « À confirmer » = non prouvable par le code seul.
Les libellés entre « » sont recopiés exactement de l'écran (emojis compris).

---

### 0. Où se trouvent les choses (menus)

| Élément | Chemin | Preuve |
|---|---|---|
| Page Clients | Menu gauche › section « Admin » › « 🏢 Clients » | `public/index.html:181` |
| Page Projets | Menu gauche › « Principal » › « 🏗️ Projets » | `public/index.html:161` |
| Bouton nouveau projet | « + Nouveau Projet » sur le Dashboard **et** sur la page Projets | `public/index.html:232`, `:307` |
| Fiche projet | clic sur une carte projet (page Projets) | `public/js/01-core.js:1118` (`openProject`) |

Aucun élément de ce périmètre n'est masqué selon le rôle côté écran (pas de test de rôle trouvé dans `01`…`09` hors Plans 2D) — voir § 9.

---

### 1. Clients et contacts

#### 1.1 Page « 🏢 Clients »
- Chemin : Menu › Admin › 🏢 Clients. Titre « 🏢 Clients », sous-titre « Sociétés et contacts », bouton « + Nouveau Client » (`public/index.html:522-526`).
- Une carte par client, triés par nom (A→Z) (`src/routes/clients.ts:38-40`). Contenu de la carte : « 🏢 Nom », « 👤 » nom du contact principal, « ✉️ » email société, « 📞 » téléphone société, « 📍 » adresse ; bouton « ✏️ » (modifier) en haut à droite (`public/js/03-create-forms.js:1105-1116`).
- Aucun client : « Aucun client » / « Créez votre premier client » (`03-create-forms.js:1101`).
- Le nombre de projets du client est renvoyé par le serveur mais **pas affiché** sur la carte (`clients.ts:40` vs `03-create-forms.js:1105-1116`).

#### 1.2 Fiche client (clic sur la carte)
- Fenêtre « 🏢 <Nom> » (`03-create-forms.js:1147`) : blocs « TVA », « EMAIL SOCIÉTÉ », « TÉLÉPHONE », « ADRESSE » (affichés seulement s'ils sont remplis) (`:1148-1153`).
- « Personnes de contact (n) » : « ★ » devant le contact principal, nom, « — fonction », « ✉️ email · 📞 téléphone » (`:1127-1142`). Ordre : principal d'abord, puis ordre de saisie (`clients.ts:56`).
- « Projets (n) » : liste cliquable (ouvre la fiche projet) avec le statut — **le statut est affiché en code brut anglais** (ex. `in_preparation`) (`03-create-forms.js:1155`).
- Boutons « Fermer » et « ✏️ Modifier » (`:1157-1158`).

#### 1.3 Créer un client — fenêtre « 🏢 Nouveau Client »
Chemin : Clients › « + Nouveau Client », ou formulaire projet › bouton « + Client » (`index.html:617`).

| Champ (libellé exact) | Obligatoire ? | Format / remarque | Preuve |
|---|---|---|---|
| « Nom de la société * » | Oui (écran : « Nom de société obligatoire » ; serveur : « Le nom du client est obligatoire ») | texte | `index.html:727`, `03-create-forms.js:711`, `clients.ts:68` |
| « N° TVA / VAT » | Non | texte libre, exemple « BE0123456789 », aucun contrôle de format | `index.html:728` |
| « Adresse » | Non | « Rue, Code postal, Ville » | `index.html:730` |
| « Email société » | Non | type email (pas de blocage réel) | `index.html:732` |
| « Téléphone société » | Non | texte | `index.html:733` |
| « Personnes de contact » (lignes) | Non | par ligne : « Prénom Nom », « Email », « Téléphone » ; bouton « + Ajouter contact » ; ✕ pour retirer une ligne ajoutée | `index.html:738-748`, `03-create-forms.js:694-707` |

- **Pas de champ « Fonction »** à la création (il n'existe qu'en modification, § 1.4) (`index.html:743-747`).
- **Le contact principal ne se choisit pas à la création** : la 1re ligne porte l'étiquette fixe « Principal » ; c'est le 1er contact rempli qui devient principal (`index.html:747`, `03-create-forms.js:724`, `clients.ts:86-88`).
- Une ligne avec seulement un email ou un téléphone (sans nom) est **ignorée sans avertissement** (`03-create-forms.js:730`, `clients.ts:84`).
- Si « Email société » / « Téléphone société » sont vides, l'app y recopie l'email / le téléphone du contact principal (`03-create-forms.js:737-738`).
- Bouton « ✅ Créer le client » ; message « Client "<nom>" créé ✅ » puis « Client sélectionné dans le projet » (`index.html:753`, `03-create-forms.js:744`, `:763`).
- **Depuis le formulaire projet (« + Client »)** : oui, le nouveau client est **sélectionné automatiquement** dans la liste « Client * » du projet (`03-create-forms.js:759-763`). Le formulaire projet reste ouvert derrière (fenêtres empilées).
- Échec : message générique « Erreur création client » (le message précis du serveur n'est pas montré) (`03-create-forms.js:764`).

#### 1.4 Modifier un client — fenêtre « ✏️ Modifier <Nom> »
Chemin : Clients › « ✏️ » sur la carte, ou fiche client › « ✏️ Modifier » (`03-create-forms.js:1109`, `:1158`).
- Champs : « Nom société * », « N° TVA / VAT », « Adresse », « Email société », « Téléphone société » (`04-edit-clients-templates.js:16-24`).
- « Personnes de contact (n) » + « + Ajouter contact » ; par ligne : « Prénom Nom * », **« Fonction »**, « Email », « Téléphone », bouton radio **« ★ »** (= « Marquer comme contact principal ») et « ✕ » (« Supprimer ») (`:26-33`, `:58-78`).
- Ici on **peut choisir** le contact principal (★). Si aucun ★ coché, le 1er devient principal (`clients.ts:117-119`).
- Lignes sans nom ignorées (`04-…:88`). « 💾 Sauvegarder » → « Client mis à jour ✅ » (`:39`, `:110`). « Annuler ».
- Le « contact » affiché ensuite sur la carte client et sur la fiche projet = le contact ★ (champ recopié) (`04-…:103`).

#### 1.5 Supprimer un client
- Bouton rouge « 🗑️ Supprimer ce client » dans la fenêtre de modification (`04-…:36`).
- Confirmation : « Êtes-vous sûr de vouloir supprimer ce client ?\n\nSi des projets y sont rattachés, la suppression sera refusée. » (`04-…:120`).
- **Blocage** : refus si au moins 1 projet (y compris archivé) est lié : « Impossible de supprimer : N projet(s) associé(s) à ce client. Réassignez ou supprimez d'abord ces projets. » (`clients.ts:147-152`). Ce message est bien affiché (`04-…:128`).
- Sinon suppression **définitive** ; les contacts et les visites client de ce client sont effacés avec lui (`clients.ts:154-155`, schéma `ClientContact onDelete: Cascade`).
- Succès : « Client supprimé ».

#### 1.6 Ce que les clients alimentent ailleurs
- Liste « Client * » du formulaire projet (`03-create-forms.js:680-689`).
- Fiche projet › Infos › « 📞 Contact client » (contact ★ + téléphone/email **de la société**) (`02-detail-loaders.js:102-110`).
- Formulaire Handover : liste « — Choisir dans la base — » + pré-remplissage nom / email / responsable (`03-create-forms.js:837-889`).
- Clients créés automatiquement par e-mail (projets « NEW… ») : client existant retrouvé par nom (casse ignorée), sinon créé ; sans nom → client « ⚠️ Client à confirmer » (`src/services/projectFromEmail.ts:120-153`, `:41`). → doublons possibles (« Audi » vs « Audi SA »).

---

### 2. Créer un projet à la main — fenêtre « 🏗️ Nouveau Projet »

Chemin : Dashboard ou Projets › « + Nouveau Projet » (`index.html:232`, `:307`). La fenêtre est vidée à chaque ouverture en mode création (`03-create-forms.js:787-805`). Elle ne se ferme pas en cliquant à côté (seulement × ou « Annuler ») (`03-create-forms.js:906-910`).

#### 2.1 Champs, dans l'ordre

| # | Libellé exact | Obligatoire ? (écran / serveur) | Format | Champ enregistré | Preuve |
|---|---|---|---|---|---|
| 1 | « Nom * » | Oui / non contrôlé côté serveur (base : obligatoire) | texte, ex. « Salon Audi Paris » | `name` | `index.html:612`, `02-detail-loaders.js:1093` |
| 2 | « Client * » + bouton « + Client » | Oui / non contrôlé (base : obligatoire) | liste « — Sélectionner — » | `clientId` | `index.html:614-618` |
| 3 | « N° Interne » | Non | texte, ex. « VEM-2025-003 » ; **vide → généré automatiquement** au format `VEM-<année>-<4 chiffres>` (4 derniers chiffres de l'horloge, pas un compteur) ; **doit être unique** : sinon « Valeur déjà existante (contrainte unique) » | `internalNumber` | `index.html:622`, `src/routes/projects.ts:160`, `src/middleware/errorHandler.ts:12` |
| 4 | « Ouvriers » | Non | nombre, **5 par défaut** | `workersCount` | `index.html:623` |
| 5 | « Adresse * » | Oui (écran) | « Adresse complète, Ville » — **la partie après la dernière virgule devient la « ville »** affichée « 📍 » sur la carte projet | `address` + `city` | `index.html:625`, `02-…:1115`, `01-core.js:1126` |
| 6 | « Début installation * (date + heure) » | Oui (écran) | date + heure | `installationStart` | `index.html:627` |
| 7 | « Fin installation * (date + heure) » | Oui (écran) ; **pas de contrôle fin > début** | date + heure | `installationEnd` | `index.html:628` |
| 8 | « Début démontage (date + heure) » | Non | date + heure | `dismantlingStart` | `index.html:631` |
| 9 | « Fin démontage (date + heure) » | Non | date + heure | `dismantlingEnd` | `index.html:632` |
| 10 | « Description / Instructions spéciales » | Non | texte | `description` | `index.html:634` |

Message si un champ * manque : « Remplis les champs obligatoires (Nom, Client, Adresse, Dates installation) » (`02-…:1094`). Le serveur ne revérifie rien (`projects.ts:154-177`).

#### 2.2 Bloc « 📝 Notes complémentaires »
Sous-titre affiché : « Visibles dans le Rapport IA (section Vue d'ensemble) » (`index.html:639-640`).

| Libellé | Champ | Où ça ressort ensuite |
|---|---|---|
| « 🌐 Notes globales du projet » | `scope` | Infos (encart « 🌐 Global ») `02-…:84-88` ; Rapport IA « Notes complémentaires › Notes globales » `06-time-analysis.js:661-667` ; Briefing auto (« OBJET » / « ▶ OBJET ») `14-briefing-autogen.js:63`, `:509` ; briefing IA `src/services/briefingAI.ts:46` |
| « 🔨 Notes installation » | `installNotes` | Infos « 🔨 Installation » `02-…:89-93` ; Rapport IA `06-…:669-672` ; Briefing « NOTES INSTALLATION » / « ▶ INSTALLATION » `14-…:65`, `:511` ; briefing IA `briefingAI.ts:47` |
| « 🔧 Notes démontage » | `dismantleNotes` | Infos « 🔧 Démontage » `02-…:94-98` ; Rapport IA ; Briefing « NOTES DÉMONTAGE » `14-…:66`, `:512` ; briefing IA `briefingAI.ts:48` |
| (champ « Description ») | `description` | Infos (texte sous l'adresse) `02-…:78` ; Briefing « DESCRIPTION » `14-…:64`, `11-briefing.js:395` |

#### 2.3 Bloc « 👷 Équipes & Membres »
- Sous-titre « Sélectionne les équipes et membres présents sur ce projet », bouton « + Sous-équipe », compteur « 0 membre(s) sélectionné(s) » (`index.html:660-670`).
- Prévu : membres groupés par sous-équipe (« 👷 <sous-équipe> », « ✅ Tout »), puis « 🔧 Installateurs sans équipe » (installateur, ouvrier, site manager, technical manager), puis « 📋 Management » (sales engineer, project manager, engineer, admin) (`09-files-team-users.js:684-756`).
- **⚠ Anomalie bloquante** : cette liste n'est **jamais chargée** à l'ouverture (elle reste sur « Chargement... ») ; elle ne s'affiche qu'après un clic sur « + Sous-équipe » (`index.html:665` est le seul appel de `loadProjTeamSelector`). Et **les membres cochés ne sont jamais enregistrés** : la fonction qui les lit (`getSelectedProjMembers`, `09-…:778`) n'est appelée nulle part, et `createProject` n'envoie aucune équipe (`02-…:1105-1116`). → L'équipe se compose **après** création, dans l'onglet « 👥 Équipe » (couvert par un autre audit).
- « + Sous-équipe » ouvre une question « Nom de la sous-equipe ? ex: Equipe Ruslan » ; le nom n'est mémorisé **que dans ce navigateur** (`09-…:249-285`). Pas de notion de phase ni de rôle ici (la phase se règle dans l'onglet Équipe : « 🔄 Les deux / 🔨 Installation / 🔧 Démontage », `02-…:315-325`).

#### 2.4 Bloc « 📋 Tâches à créer »
- Sous-titre « Cochez, assignez et datez chaque tâche » ; boutons « ✅ Tout » / « ☐ Aucun » (`index.html:676-684`).
- Barre « Appliquer à tout : » = une date + « — Assigner tout à... — » (`index.html:687-693`) : met la date / la personne sur **toutes** les lignes, cochées ou non (`04-edit-clients-templates.js:488-495`).
- Liste par étape du modèle de tâches (icônes : 📋 To Do, 🔧 PRE-PROD, 📞 Booking Supplier, 📦 Warehouse Preparation, 🏗️ Installation, 🔨 Dismantling, 🏠 Come Back Warehouse) ; en-tête d'étape cliquable (replier ▼/▶), « n tâches », ✅ / ☐ par étape ; par tâche : case, titre, date, assigné « — Équipe — » (`04-…:155-159`, `:400-462`). Les étapes viennent de Menu › Admin › « 📋 Templates tâches » (`03-create-forms.js:461-475`).
- **Toutes les tâches sont cochées par défaut** (`04-…:439`). Compteur « x / y tâche(s) sélectionnée(s) » (`04-…:501`).
- À la création : 1 tâche par case cochée, statut « à faire », priorité normale, date = date de la ligne sinon **le début d'installation** ; l'étape est écrite dans la description « Stage: … » (`02-…:1150-1171`).
- ⚠ L'onglet « ✅ Tâches » de la fiche projet est masqué (§ 4) : ces tâches ne sont visibles que dans Menu › Terrain › « ✅ Tâches ».

#### 2.5 Bloc « 🚛 Logistique »
- Sous-titre « Camions, machines et véhicules prévus » ; boutons « + Ajouter » et « 🚛 Ajouter un camion / véhicule » (doublon, même action) (`index.html:702-712`).
- Par véhicule (`09-…:1047-1092`) : type (« Camion », « Camionnette », « Grue », « Nacelle », « Manitou », « Chariot élév. », « Groupe élec. », « Autre »), « N° camion / immat... », « 🪪 Immatriculation », « 👤 Chauffeur », « 📞 Téléphone », « 📦 Chargement (date + heure) », « 📍 Arrivée sur site (date + heure) », « Notes... », ✕.
- Un véhicule **sans « N° camion » ni « Immatriculation » est ignoré sans prévenir** (`02-…:1183-1186`). Les véhicules enregistrés ont le statut « Planifié » (`02-…:1196`).

#### 2.6 « ✅ Créer le Projet » — ce qui se passe
1. Création du projet (`02-…:1121-1123`) → statut initial **« 📄 Brouillon » (draft)** (valeur par défaut, `prisma/schema.prisma` modèle Project `status … @default(draft)` ; rien n'est envoyé par le formulaire).
2. Création des tâches cochées (messages « Création de n tâche(s)... », « n tâche(s) créée(s) ✅ ») (`02-…:1152-1171`).
3. Création des véhicules (« n véhicule(s) ajouté(s) 🚛 ») (`02-…:1179-1206`).
4. Fermeture, retour sur Projets, ouverture automatique de la nouvelle fiche ~1 s après (`02-…:1210-1218`).
- Équipe : **rien** (voir § 2.3). Le « Responsable technique » n'est pas saisissable dans ce formulaire (champ `technicalManagerId` accepté par le serveur mais absent de l'écran, `projects.ts:193`).

---

### 3. En-tête de la fiche projet

Ligne du haut (`index.html:336-364`) : « ← Retour », nom du projet, « N° interne · Client », liste de statut, puis boutons.

#### 3.1 Liste de statut (à côté du n° interne)
- Options : « 📝 Devis à valider », « ✅ Devis validé », « 🔧 En préparation », « 🏗️ En installation », « 📍 Sur site », « 🧾 Handover OK », « 🔨 Démontage », « 🎉 Terminé », « ❌ Annulé » (`index.html:342-352`). Changement immédiat : « Statut du projet mis à jour ✅ » (`01-core.js:1177-1194`).
- ⚠ Il manque « Brouillon », « Confirmé », « Chargement », « Handover » qui existent ailleurs (`02-…:3-17`). Un projet neuf (Brouillon) ou restauré (Confirmé, § 3.7) affiche donc une **liste vide** — À confirmer visuellement selon le navigateur.

#### 3.2 « ✏️ Modifier » (`index.html:357`)
Rouvre la **même fenêtre** que la création, titre « ✏️ Modifier le projet », bouton « 💾 Enregistrer les modifications » (`03-create-forms.js:809-810`, `02-…:1035-1082`).
- Réellement modifiables : Nom, Client, N° Interne, Ouvriers, Adresse (et ville), dates installation, dates démontage, Description, 3 notes (`02-…:1105-1118`, serveur `projects.ts:192-198`).
- ⚠ Les blocs « Équipes & Membres », « Tâches à créer » et « Logistique » restent affichés (véhicules existants pré-remplis) **mais sont ignorés à l'enregistrement** (`02-…:1133-1147`) — un véhicule modifié ici n'est pas sauvé (passer par l'onglet 🚛 Logistique).
- ⚠ On ne peut pas **effacer** une date de démontage ni la description en vidant le champ : la valeur vide n'est pas envoyée, l'ancienne reste (`02-…:1109`, `:1117-1118`). Les 3 notes, elles, s'effacent bien (`:1110-1112`).
- Le statut ne se modifie pas ici (liste de l'en-tête). Succès : « Projet mis à jour ✅ ».

#### 3.3 « 📊 Rapport IA » (`index.html:358`)
Ouvre « 📊 Générer un Rapport » (`index.html:1243-1249`, `05-templates-trucks-reports.js:1010`). Les notes complémentaires y apparaissent (§ 2.2). Le PDF du rapport est **copié automatiquement dans les Fichiers du projet** à chaque téléchargement (`projects.ts:617`). Détail du rapport : hors périmètre.

#### 3.4 « 🧾 Handover » (`index.html:359`)
Va à la **page globale** Menu › Terrain › Handover (`goto('handover')`), pas à l'onglet « 🧾 Handover » du projet. Doublon trompeur avec l'onglet.

#### 3.5 « 🛠️ Ticket » (`index.html:360`)
Ouvre « 🛠️ Nouveau Ticket SAV » (`index.html:785`) ; la création envoie un e-mail (« Ticket créé · Email envoyé 📧 », `03-create-forms.js:14`). ⚠ **Anomalie** : les Tickets sont masqués partout ailleurs (menu « SAV & Stock » `index.html:170-176`, barre mobile `:125`, bouton + mobile `:142`, Dashboard `:238`, `:256`, onglet projet `:372`) — on peut en créer mais plus les consulter.

#### 3.6 « 📋 Plusieurs tâches » / « ➕ 1 tâche » (`index.html:361-362`)
- « 📋 Plusieurs tâches » → « 📋 Ajouter des tâches depuis le template » : recherche « 🔍 Rechercher une tâche (titre ou étape)... », assignation groupée « — Assigner toutes les tâches cochées à... — » + « Appliquer », **rien coché par défaut**, bouton « ➕ Ajouter les tâches cochées » (`04-…:168-230`, `:356-398`).
- « ➕ 1 tâche » → fenêtre tâche libre (« Titre, projet et date obligatoires », `03-create-forms.js:22`).
- ⚠ Même remarque : onglet Tâches masqué. Et l'étape est enregistrée différemment (champ « étape » ici, « Stage: … » dans la description à la création du projet, `04-…:382` vs `02-…:1160`).

#### 3.7 « 📦 » — Archiver / Supprimer (`index.html:363`, `09-…:1095-1203`)
Fenêtre « 📦 Archiver le projet », texte « Que souhaitez-vous faire avec <nom> ? » :
- « 📦 Archiver le projet » — « Le projet est conservé mais masqué de la liste active. Récupérable à tout moment. » → statut **= « ❌ Annulé » (cancelled)** ; message « Projet archivé 📦 » ; retour à la liste (`09-…:1166-1176`). Il n'y a donc **pas de différence** entre « archivé » et « annulé ».
- « ♻️ Restaurer le projet » (seulement si déjà archivé) — « Remettre le projet en statut actif. » → statut « Confirmé » (`09-…:1178-1186`).
- « 🗑️ Supprimer définitivement » — « Action irréversible — toutes les données seront perdues. » → 2e étape « Confirmer la suppression ? » « Non » / « Oui, supprimer » → suppression **réelle et définitive** (pas de corbeille) : tâches, daily reports, handovers, fichiers, équipe, camions… effacés avec le projet (`projects.ts:215-220`, relations `onDelete: Cascade` du schéma). Message « Projet supprimé ».
- **Qui peut supprimer ?** Tout utilisateur connecté : aucun contrôle de rôle, ni à l'écran ni sur le serveur (`index.html:363`, `src/index.ts:99`, `projects.ts:215`).
- Retrouver un archivé : Projets › case « 📦 Voir archivés » (`index.html:325-328`). Attention : sur la page Projets, les projets « 🎉 Terminé » sont aussi cachés tant que la case n'est pas cochée (`01-core.js:1153-1154`).

---

### 4. Onglets de la fiche projet

Visibles : « 📋 Infos », « 📓 Daily Reports », « 🧾 Handover », « 📸 Visites Client », « 👥 Équipe », « 🚛 Logistique », « ✈️ Bookings », « 📋 Briefing », « 📁 Fichiers » (`index.html:366-380`).

**Masqués (à exclure de la formation)** : « ✅ Tâches » (masqué le 16.10.2026, suivi par la check-list), « 🛠️ Tickets », « 📦 Entrepôt », « 🧰 Boîtes à outils » (`index.html:368`, `:372-374`).

Note : deux onglets portent l'icône 📋 (« 📋 Infos » et « 📋 Briefing »).

---

### 5. Onglet « 📋 Infos »

Ordre des blocs :
1. **Carte check-list de préparation** (en tout premier) — existe (`index.html:381`, `02-…:30`) ; couverte par l'audit check-lists.
2. **« 📋 Informations »** (`02-…:65-112`) : « Client », « N° Interne », « Installation » (début → fin ; l'heure n'apparaît que si ≠ minuit, `03-create-forms.js:1021-1032`), « Démontage » (ou « Non défini »), « Ouvriers » (« N personnes »), « Statut » (badge) ; puis « Adresse », la description ; puis « 📝 Notes complémentaires » (encarts « 🌐 Global », « 🔨 Installation », « 🔧 Démontage », seulement si remplis) ; puis « 📞 Contact client » (👤 contact principal, 📞 et ✉️ cliquables — **ce sont le téléphone et l'email de la société**, pas ceux du contact).
3. **« 📊 Progression »** (`02-…:115-148`) : % = points de check-list « OK » ou « N.A. » / total des points, **toutes phases confondues** (préparation + montage + démontage) (`src/services/checklistService.ts:233-255`). Libellés « Points de check-list validés (OK ou N.A.) », « Points au total », « Validés », barres par phase « 📋 Préparation », « 🏗️ Montage », « 🔨 Démontage ». Sans check-list : « — », « Aucune check-list configurée pour ce projet », « La progression suit la check-list de préparation (onglet Infos) et de montage / démontage (onglet Daily Reports). ». Les tâches ne comptent plus. Même % sur la carte projet (`projects.ts:73`).
4. **« 🚛 Logistique — Dates clés »** (si des véhicules ont des dates ; livrés/retournés exclus) : « 📦 Chargement entrepôt : », « 🚀 Départ : », « ✅ Arrivée site : » ou « ⏳ En attente d'arrivée sur site », bouton « Voir tous » → onglet Logistique (`02-…:39`, `:153-175`).
5. **« 📁 Fichiers »** (`02-…:178-299`) : boutons « Gérer » (→ onglet Fichiers), « 🔗 URL », « ⬆️ Ajouter » ; encart e-mail (§ 5.1) ; puis fichiers groupés : « 🖼️ Photos (n) » (vignettes, clic = plein écran), « 📄 PDF (n) » (aperçu intégré + « 🔍 Plein écran » + « ⬇️ »), « 🎨 Modèles 3D (n) », « 📎 Documents (n) » (clic = ouvre dans un nouvel onglet). Pas de suppression depuis Infos.

#### 5.1 Encart « Envoyer des fichiers par email » (`02-…:190-199`)
Texte exact : « 📧 Envoyer des fichiers par email » / « Mail à **warehouseviewbox@gmail.com** avec **<N° interne>** dans le sujet » / « ⏱ Les fichiers apparaîtront dans les 5 minutes » ; bouton « 📋 Copier ».
- « 📋 Copier » met dans le presse-papiers (`01-core.js:540-550`) :
  ```
  À: warehouseviewbox@gmail.com
  Sujet: <N° interne>

  (Joindre les fichiers à envoyer dans le projet <N° interne>)
  ```
  Message « Instructions copiées 📋 ».
- Fonctionnement : le N° interne doit figurer **n'importe où** dans le sujet (le plus long n° trouvé gagne) ; pièces jointes ajoutées aux fichiers du projet (catégorie « e-mail ») ; un mail sans n° reconnu est ignoré sans retour à l'expéditeur (`src/services/imapPoller.ts:118-131`, `:153-178`).
- ⚠ À savoir pour la formation : le **texte du mail** est aussi lu automatiquement pour créer des réservations (camions, hôtels, trajets) dans le projet (`imapPoller.ts:133-151`). Et un sujet qui **commence par « NEW »** crée un **nouveau projet** (statut Brouillon) au lieu d'ajouter des fichiers (`imapPoller.ts:91-96`).

#### 5.2 Section « 🎨 Modèles 3D » et « 📐 Plans Viewbox » (Plans 2D — À EXCLURE de la formation)
- « 🎨 Modèles 3D (n) » regroupe .glb .gltf .usdz .skp .obj .stl .fbx .dae .3ds .blend .ifc .zip (`02-…:210`). Carte : nom + mention « .GLB · Visualisable », « .DAE · Aperçu indispo », « .ZIP · Peut contenir un modèle 3D » ; bouton « 🎮 Ouvrir Viewer 3D (mesures + photos) » pour glb, gltf, stl, obj, dae, zip (`02-…:260-274`).
- « 📐 Plans Viewbox » apparaît : (a) dans l'en-tête « 🎨 Modèles 3D » de l'onglet Infos, seulement s'il y a au moins un modèle 3D (`02-…:257`) ; (b) en haut de l'onglet « 📁 Fichiers » (`08-visits-remarks.js:1056`) ; uniquement pour les comptes ayant l'accès Plans 2D (`01-core.js:118-127`). → **Exclu de la formation.**

---

### 6. Onglet « 📁 Fichiers »

Rendu : `public/js/08-visits-remarks.js:1027-1133` ; envoi : `public/js/09-files-team-users.js:110-180`.

#### 6.1 En-tête
« 📁 Fichiers du projet » ; boutons « 📐 Plans Viewbox » (accès Plans seulement, exclu), « 🔗 URL », « ⬆️ Ajouter » (`08-…:1053-1063`).

#### 6.2 Ajouter des fichiers (« ⬆️ Ajouter »)
- Sélection multiple possible. Formats proposés par le sélecteur : images, .pdf, .ppt/.pptx, .xls/.xlsx, .doc/.docx, .mp4, .mov, .glb, .gltf, .usdz, .obj, .stl, .skp, .fbx, .dae, .zip (`08-…:1060`).
- Projet sans fichier : grande zone « 📁 Glissez vos fichiers ici » / « Photos, PDF, PowerPoint, Excel... » (`08-…:1076-1082`) — c'est en réalité un **clic** pour choisir (aucun glisser-déposer programmé : À confirmer en test) ; son sélecteur n'accepte **que** images, PDF, Office, vidéos (pas la 3D).
- Taille : refus au-delà de 50 Mo côté serveur, **mais limite pratique ≈ 10 Mo** (l'écran le dit lui-même : « Pour les gros fichiers (> 10 Mo) hébergés ailleurs », `09-…:8`). Au-delà / format refusé : message « Erreur upload <nom>: <code> » (`09-…:145-149`).
- Formats acceptés par le serveur : images (jpg, png, webp, gif, heic, bmp, svg), PDF, vidéos mp4/webm/mov, Word/Excel/PowerPoint, audio, 3D glb, gltf, usdz, skp, obj, stl, fbx, dae, 3ds, blend, zip (`src/services/cloudinaryService.ts:19-47`). **.ifc n'y figure pas** → probablement refusé (À confirmer).
- Astuce automatique : si on sélectionne **en même temps** un modèle .dae / .gltf / .obj et ses textures, l'app les regroupe en un seul « <nom>_3d-package.zip » (« Empaquetage du modèle 3D et de ses fichiers annexes... ») (`09-…:114-127`).
- Fin : « n fichier(s) uploadé(s) ✅ ».

#### 6.3 « 🔗 URL » — « 🔗 Ajouter un fichier via URL » (`09-…:1-83`)
- Utile pour un fichier > 10 Mo déjà hébergé ailleurs (le fichier n'est pas copié, VEM garde seulement le lien).
- Champs : « Nom du fichier * » (ex. « HOKA_2026_July.glb » — **l'extension compte** : elle décide de l'icône et de l'ouverture 3D), « URL du fichier * » (doit commencer par http(s):// et pointer directement vers le fichier, « pas une page web »), « Taille approx. (Mo) — optionnel ». Bouton « 💾 Ajouter au projet ».
- L'encart d'aide décrit une méthode technique (« GitHub Releases ») — voir notes techniques.

#### 6.4 Affichage / regroupement
- Barre « Tout sélectionner » + « n sélectionné(s) » + « 🗑️ Supprimer la sélection » (confirmation « Supprimer n fichier(s) ? ») (`08-…:1066-1073`, `09-…:213-242`).
- **Deux groupes seulement** : « 🖼️ Photos (n) » (vignettes avec case, ✕ supprimer, ▲▼ ordre ; clic = plein écran) et « 📎 Documents (n) » (tout le reste : icône, nom, type · taille en KB ; ▲ « Monter » / ▼ « Descendre » ; « 🎮 Voir en 3D » pour glb, gltf, stl, obj, dae, zip ; « 👁️ Voir » = nouvel onglet ; « ⬇️ » = télécharger ; « 🗑️ » supprimer) (`08-…:1086-1131`).
- **Aucune séparation par origine** : les fichiers reçus par e-mail (catégorie « email »), les PDF générés automatiquement (daily report, handover, handover signé, visite client, rapport projet), les captures 3D, les loading listes et les plans sont mélangés avec les fichiers ajoutés à la main (`src/utils/saveProjectFile.ts`, `src/routes/reports.ts:25`, `:71`, `handover.ts:276`, `:360`, `publicHandoverSign.ts:128`, `clientVisits.ts:151`, `:197`, `projects.ts:617`). ⚠ Chaque re-téléchargement d'un de ces PDF **ajoute une nouvelle copie** dans Fichiers.
- Ordre : ordre choisi avec ▲▼ (mémorisé pour tous), sinon les plus récents d'abord (`projects.ts:640`, `09-…:192-211`). ▲▼ ne déplace qu'au sein des photos ou au sein des documents.
- Supprimer : « Supprimer ce fichier ? » → « Fichier supprimé » (`09-…:182-187`). Définitif ; tout utilisateur connecté peut le faire.

#### 6.5 Visionneuse (clic sur un fichier) — `01-core.js:129-259`
- **Image** : plein écran sur fond noir, « × » et « ⬇️ Télécharger ».
- **PDF** : sur ordinateur, fenêtre avec le PDF + « ⬇️ Télécharger » ; sur téléphone / tablette, ouverture dans un nouvel onglet (sinon iOS n'affiche que la 1re page).
- **3D .glb .gltf .stl .obj .dae .zip** : ouvre le **Lecteur 3D** dans un nouvel onglet (§ 7).
- **.usdz** : visionneuse simple intégrée (« Pinçer/Molette : zoom · Glisser : tourner », « ⬇️ Télécharger »), avec réalité augmentée sur mobile compatible.
- **.skp, .fbx, .3ds, .blend** : message « 🎨 Fichier 3D — <nom> » expliquant d'exporter en glTF/GLB (pour SketchUp : « Fichier → Exporter → 3D Model »), boutons « ⬇️ Télécharger » / « OK ».
- **Autres** (Office, vidéo, .ifc…) : ouverture dans un nouvel onglet / téléchargement.

---

### 7. Lecteur 3D (`public/viewer3d.html` + `public/vem-3d-integration.js`)

- Ouvert depuis « 🎮 Voir en 3D » (Fichiers) ou « 🎮 Ouvrir Viewer 3D (mesures + photos) » (Infos), dans un **nouvel onglet** ; le modèle se charge seul (« 📥 Téléchargement depuis VEM... ») ; le nom du projet s'affiche en orange sous le titre « Lecteur 3D Chantier » (`01-core.js:101-114`, `vem-3d-integration.js:125-180`).
- Formats lus : .STL, .OBJ, .GLTF, .GLB, .IFC, .DAE, .ZIP (zip contenant un modèle + textures) (`viewer3d.html:528-536`, `:1454-1495`). .ifc ouvrable seulement via « 📁 Ouvrir un fichier » dans le lecteur (pas de bouton 🎮 côté VEM, § 9).
- En-tête : « ≡ » (arborescence), « 📷 Galerie », « 📋 Loading List », thème, « 📁 Ouvrir un fichier » ; « 📐 Plan 2D → » (accès Plans seulement — exclu) (`viewer3d.html:454-461`, `:2613-2622`).
- Souris : clic gauche glissé = tourner, clic droit ou molette-clic glissé = déplacer, molette = zoom (`viewer3d.html:951-987`). **Aucun geste tactile programmé** → pas utilisable au doigt (À confirmer sur tablette).
- Boutons sur la vue + raccourcis : Recadrer (F), Wireframe (W), Grille (G), Axes (A), Vue éclatée (E), Mesurer (M — « clique 2 points », Échap pour quitter), Prendre une photo (P) (`viewer3d.html:488-509`, `:2940-2958`).
- Panneau « Outils » : « 🧭 Élément sélectionné » + « 📋 Copier les infos » ; « 📏 Mesures » (« Unité du modèle source » Mètres/Centimètres/Millimètres, « → Affichage toujours en mm », « Dimensions auto », « 📏 Activer la règle », « 🗑 Effacer les mesures ») ; « 🎛 Affichage » (« Matériaux réels », « Vue éclatée », « Opacité », « Rotation auto », « Grille », « Axes ») ; arborescence avec « Regrouper par composant » (`viewer3d.html:463-610`). Double-clic sur une cote = la modifier « juste pour la photo » (`:2139`).
- Photos : « 📷 Galerie » ; sur chaque photo « 💾 Sauver sur VEM », et « 💾 Tout sauver sur VEM » → ajoutées aux Fichiers du projet sous le nom « 3D_capture_<date>.png » (`vem-3d-integration.js:186-270`).
- « 📋 Loading List » (avec « 🤖 Compléter avec IA », « ⚙️ Règles métier ») : ancien outil distinct de la Loading liste des Plans — recommandation : **ne pas former** (question PO).

---

### 8. Restrictions de rôle (périmètre)

- Serveur : `/clients`, `/projects` (y compris fichiers, suppression) et `/upload` exigent seulement d'être connecté — **aucun contrôle de rôle** (`src/index.ts:98-99`, `:109` ; aucun `requireRole` dans `clients.ts`, `projects.ts`, `upload.ts`).
- Écran : aucun bouton de ce périmètre masqué selon le rôle (seuls « 📐 Plans Viewbox » / « 📐 Plan 2D → » dépendent de l'accès Plans 2D, `01-core.js:118-127`). La section de menu « Admin » (Clients…) est visible par tous (`index.html:177-184`).
- Tous les utilisateurs voient **tous** les projets (le filtrage par équipe n'existe que pour les check-lists, cf. CLAUDE.md / `src/middleware/projectAccess.ts`).
- Conséquence formation : un ouvrier ou un installateur peut créer / modifier / supprimer définitivement un client, un projet ou un fichier.

---

### 9. Anomalies / incohérences UX (à signaler)

1. **Équipe du formulaire projet inopérante** : liste jamais chargée (« Chargement... ») et sélection jamais enregistrée (`index.html:665`, `09-…:684`, `:778` jamais appelé, `02-…:1105-1116`).
2. **Formulaire « Modifier »** : blocs Équipe / Tâches / Logistique visibles mais ignorés ; véhicules pré-remplis dont les modifications sont perdues sans avertissement (`02-…:1133-1147`).
3. Impossible d'**effacer** les dates de démontage ou la description via « Modifier » (`02-…:1109`, `:1117-1118`).
4. Liste de statut de l'en-tête incomplète (pas Brouillon / Confirmé / Chargement / Handover) alors qu'un projet créé est « Brouillon » et un projet restauré « Confirmé » (`index.html:342-352`, `09-…:1179`).
5. « Archiver » = statut « ❌ Annulé » : impossible de distinguer un projet annulé d'un projet archivé ; « Restaurer » remet « Confirmé » quel que soit le statut d'avant (`09-…:1167`, `:1179`).
6. Suppression définitive d'un projet / client / fichier ouverte à tous les rôles (§ 8).
7. Bouton « 🛠️ Ticket » visible alors que les tickets sont masqués partout ailleurs (`index.html:360` vs `:170-176`, `:372`).
8. « ➕ 1 tâche » / « 📋 Plusieurs tâches » / « Tâches à créer » (toutes cochées par défaut) alors que l'onglet Tâches est masqué → création massive de tâches invisibles depuis la fiche (`04-…:439`, `index.html:368`).
9. « 🧾 Handover » (en-tête) mène à la page globale, pas à l'onglet Handover du projet (`index.html:359`).
10. Création client : pas de champ « Fonction » ni de choix du principal (contrairement à la modification) ; contacts sans nom perdus silencieusement ; si on retire une ligne de contact intermédiaire avant d'enregistrer, les contacts suivants peuvent être **perdus** (index de ligne décalé : `03-create-forms.js:715-718` lit `contact-${i}` alors que les ids suivent un compteur).
11. Après « ✅ Créer le client » depuis la page Clients, la grille Clients n'est pas rafraîchie (seule la liste du projet l'est) et le message « Client sélectionné dans le projet » s'affiche même hors projet (`03-create-forms.js:760-763`).
12. Erreur de création client : message générique, la vraie raison n'est pas montrée (`03-create-forms.js:764`).
13. Statut du projet affiché en code anglais brut dans la fiche client (`03-…:1155`) et sur les cartes projet (`01-core.js:1121`).
14. « 📞 Contact client » de l'onglet Infos montre le nom du contact principal mais le **téléphone / email de la société** (`02-…:106-108`).
15. N° interne automatique non séquentiel (4 derniers chiffres de l'horloge) → risque de doublon / numéros peu lisibles (`projects.ts:160`).
16. « Fin installation » peut être avant « Début » (aucun contrôle) (`02-…:1093`).
17. Deux boutons identiques « + Ajouter » et « 🚛 Ajouter un camion / véhicule » (`index.html:707`, `:710`) ; véhicule sans n° ni plaque ignoré sans message (`02-…:1183`) ; types de véhicules différents entre le formulaire (Nacelle, Manitou…) et l'onglet Logistique (lift, trailer, machine…) (`09-…:1041-1045` vs `02-…:340`).
18. Listes de formats différentes selon le bouton « Ajouter » : Infos inclut .ifc (avec fichiers) mais pas les vidéos ; Fichiers inclut les vidéos mais pas .ifc ; zone vide de l'onglet Fichiers sans 3D ; serveur refuse .ifc (`02-…:186`, `:206`, `08-…:1060`, `:1082`, `cloudinaryService.ts:44`).
19. Libellés 3D contradictoires dans Infos : « .DAE · Aperçu indispo » avec un bouton « 🎮 Ouvrir Viewer 3D » qui fonctionne ; .ifc classé « Modèles 3D » mais sans bouton 3D et téléchargé au clic (`02-…:262-273`).
20. « Glissez vos fichiers ici » : pas de vrai glisser-déposer (À confirmer).
21. Les PDF générés (rapport, daily, handover, visite) s'accumulent en double dans Fichiers à chaque téléchargement ; pas de rubrique « reçus par e-mail » ni « générés ».
22. Sous-équipes (« + Sous-équipe ») enregistrées seulement dans le navigateur de la personne (`09-…:249-254`).
23. Le sous-titre des notes dit « Visibles dans le Rapport IA » alors qu'elles servent aussi (et surtout) à l'onglet Infos et au Briefing.
24. Sur la page Projets, « 🎉 Terminé » est caché comme un archivé, mais pas au premier chargement (`01-core.js:1100-1103` vs `:1153`) — comportement variable.
25. Lecteur 3D sans gestes tactiles.
26. Deux onglets avec la même icône 📋 (Infos, Briefing).
27. E-mail : tout sujet commençant par « NEW » (ex. « Newsletter ») crée un projet ; un mail sans n° reconnu disparaît sans retour.

---

### 10. Questions pour le product owner

1. Faut-il réparer ou retirer le bloc « 👷 Équipes & Membres » du formulaire projet (aujourd'hui sans effet) ? Idem blocs Tâches / Logistique en mode « Modifier ».
2. « Archiver » doit-il rester identique à « Annulé » ? Statut à restaurer : « Confirmé » ou statut d'origine ?
3. Qui doit pouvoir supprimer définitivement un projet / client / fichier ? (aujourd'hui : tout le monde)
4. Le bouton « 🛠️ Ticket » doit-il disparaître comme le reste des tickets ?
5. Les tâches (onglet masqué) : faut-il encore cocher « Tâches à créer » par défaut ? Retirer « ➕ 1 tâche » / « 📋 Plusieurs tâches » de la fiche ?
6. Ajouter « Brouillon / Confirmé / Chargement / Handover » à la liste de statut de l'en-tête ?
7. Format officiel du N° interne (ex. 6072ROACEVIE vu ailleurs) ? Doit-il devenir obligatoire ?
8. Faut-il un champ « Responsable technique » dans le formulaire projet ?
9. Faut-il séparer dans Fichiers : reçus par e-mail / générés par VEM / ajoutés à la main ? Éviter les copies à chaque téléchargement de PDF ?
10. « 📋 Loading List » du Lecteur 3D : à garder, former, ou retirer (doublon avec la Loading liste des Plans) ?
11. Le bloc « 📞 Contact client » doit-il montrer le téléphone / l'email **du contact** plutôt que ceux de la société ?
12. Peut-on ajouter « Fonction » et le choix ★ dès la création du client ?
13. .ifc : doit-on l'accepter à l'envoi (aujourd'hui probablement refusé) ?

---

### 11. Notes techniques (NE PAS METTRE EN FORMATION)

- Stockage : fichiers envoyés via `POST /api/v1/upload/photo` (dossier `general`, multer 50 Mo, liste blanche mime + extensions `cloudinaryService.ts:16-48`) puis référence `POST /projects/:id/files` (catégorie `project`) ; le plan Cloudinary refuse > 10 Mo (CLAUDE.md). Captures 3D via `POST /upload/project-file/:projectId` (catégorie `general`). Fichiers e-mail : catégorie `email` (IMAP Gmail `imapPoller.ts`, intervalle `IMAP_POLL_INTERVAL` défaut 5 min ; webhook Brevo `emailWebhook.ts:127`). PDF auto : catégories `daily_report`, `handover`, `visite_client`, `rapport_projet` (`saveProjectFile.ts`), `loading_liste`, `plans`.
- Création de projet par e-mail : préfixe `NEW_PROJECT_SUBJECT_PREFIX` (défaut NEW), extraction par modèle IA, client placeholder « ⚠️ Client à confirmer » (`projectFromEmail.ts`). Réservations depuis le corps du mail : `bookingFromEmail.ts`.
- Aide « 🔗 URL » mentionne GitHub Releases ; les commentaires code citent Backblaze / Drive (`09-…:13-21`, `08-…:1135-1141`).
- `deleteFromCloudinary(publicId)` sans `resource_type` : la suppression d'un fichier « raw » (.dae/.zip/.pdf raw) chez l'hébergeur échoue probablement en silence (fichier orphelin) (`cloudinaryService.ts:67-72`, `projects.ts:689`). La suppression d'un projet ne supprime pas ses fichiers chez l'hébergeur.
- `Ticket` et `Toolbox` ont une relation Project sans `onDelete: Cascade` (`schema.prisma:627`, `:727`) — comportement à la suppression à vérifier (SetNull par défaut Prisma).
- `POST /projects` étale `req.body` dans `prisma.project.create` (aucune liste blanche, aucune validation) (`projects.ts:156-160`). Accepte `siteManagerIds` / `engineerIds` jamais envoyés par le front.
- Le lien du Lecteur 3D et de Plans contient le jeton de session dans l'URL (`01-core.js:112`, `:126`).
- Lecteur 3D : three.js r128 + xlsx depuis CDN (`viewer3d.html:700-701`), model-viewer 3.5.0 pour usdz (`01-core.js:215`), JSZip 3.10.1 pour l'empaquetage (`09-…:91`). Décompression Draco/Meshopt auto (`vem-3d-integration.js:155-167`).
- `api()` ne remonte pas les statuts HTTP sauf 401 → déconnexion (`01-core.js:275-290`).
- Code mort / doublons : `_origShowModal`, `_origShowModal2` (`04-…:152`, `09-…:666`), `showModal_toolboxNew`.

---

## II.3 — Audit formation n° 3 — Équipe · Logistique · Bookings · Droits par rôle

Audit en lecture seule du code au 23.10.2026. Chaque constat donne le chemin dans l'interface, les libellés exacts, les champs, le résultat, ce que ça alimente ailleurs et la preuve `fichier:ligne`. Ce qui n'a pas pu être prouvé par le code est marqué « À confirmer ».
Abréviations des preuves : `idx` = public/index.html, `09` = public/js/09-files-team-users.js, `10` = public/js/10-logistics-bookings.js, `02` = public/js/02-detail-loaders.js, `03` = public/js/03-create-forms.js, `07` = public/js/07-auth-mobile-daily-ai.js, `01` = public/js/01-core.js, `05` = public/js/05-templates-trucks-reports.js, `11` = public/js/11-briefing.js.

---

### 1. Page Équipe (menu latéral › 👥 Équipe)

**Chemin** : menu › « 👥 Équipe » (`idx:182`). Titre « Équipe », sous-titre « N membres actifs » (`idx:534`, `09:381`).
**Boutons en haut** : « 🔗 Inviter » et « + Nouveau membre » (`idx:536-537`). Ces boutons sont visibles pour **tous les rôles** : aucun masquage selon le rôle.

#### 1.1 Regroupement des membres
- Les membres sont regroupés par **rôle du compte**, dans cet ordre : 💼 Sales Engineer, 📊 Project Manager, ⚙️ Technical Manager, 🏗️ Site Manager, 🔧 Installateur, 👷 Ouvrier / Équipe, 🔑 Admin, 🛠️ Engineer, 📦 Entrepôt, 🤝 Client (`02:518-529`, `09:393-449`). Chaque groupe affiche son nombre de membres.
- Pour 🔧 Installateur et 👷 Ouvrier / Équipe, quand des sous-équipes existent : un bouton « + Sous-équipe », un bloc par sous-équipe (« 👷 <nom> », « N membres », 🗑️ pour supprimer la sous-équipe), puis « Sans sous-équipe » (`09:399-445`).
- Carte d'un membre : photo ou initiales, nom, e-mail, « 📞 téléphone » (le lien appelle le numéro), « 🌍 nationalité », 📐 si l'accès Plans 2D est actif, point vert (Actif) ou gris (Inactif) (`09:465-483`).
- Seuls les comptes **actifs** sont listés : la liste ne demande au serveur que les comptes actifs (`src/routes/users.ts:32`). Un compte désactivé disparaît donc complètement de la page (et de toutes les listes de choix de membres).

#### 1.2 « + Nouveau membre » (fenêtre « 👤 Nouveau Membre » — « Fiche membre complète »)
Preuves : `idx:1136-1240`, `03:641-662`.

| Champ (libellé exact) | Obligatoire | Format / remarque |
|---|---|---|
| 🪪 Scan carte d'identité — remplissage automatique : « 📷 Scanner la carte » / « 🖼️ Depuis galerie » | non | image |
| Photo (rond 👤) | non | image, appareil photo frontal sur téléphone |
| Prénom * | **oui** | texte |
| Nom * | **oui** | texte |
| Date de naissance | non | date |
| Nationalité | non | texte (« ex: Belge, Français... ») |
| N° Registre national | non | texte, 15 caractères max (« XX.XX.XX-XXX.XX ») |
| N° Carte d'identité | non | texte (« 592-XXXXXXX-XX ») |
| Validité carte d'identité | non | date |
| Lieu de naissance | non | « Ville, Pays » |
| Email * | **oui** | e-mail (enregistré en minuscules, `users.ts:66`) |
| Téléphone | non | « +32 477 ... » |
| Rôle | oui (valeur par défaut 🔧 Installateur) | liste ci-dessous |
| Sous-équipe | non | visible **uniquement** si le rôle est Installateur ou Ouvrier (`09:256-262`) ; bouton « + » pour en créer une |

- **Liste des rôles** (`idx:1206-1215`) : 💼 Sales Engineer, 📊 Project Manager, ⚙️ Technical Manager, 🏗️ Site Manager, 🔧 Installateur (par défaut), 👷 Ouvrier / Équipe, 📦 Entrepôt, 🛠️ Engineer, 🔑 Admin, 🤝 Client.
- Validation : si Prénom, Nom ou Email manquent → message « Remplis tous les champs » (`03:646`).
- Bouton « ✅ Créer le compte » ; message de succès « Compte créé · Mot de passe : VEM2025! ✅ » ; en cas d'échec : « Erreur création compte » (message générique, même pour un e-mail déjà utilisé) (`03:660-661`).
- **Mot de passe par défaut** : la fenêtre affiche « Mot de passe par défaut : **VEM2025!** — à changer à la première connexion. » (`idx:1230-1232`). Le compte est bien créé avec `VEM2025!` (`users.ts:58`). **Le changement n'est PAS imposé** : la connexion ne demande un nouveau mot de passe que pour un mot de passe temporaire envoyé par « 📧 Envoyer invitation » (`auth.ts:36-52`, `01:314`). La personne garde donc VEM2025! tant qu'elle ne le change pas d'elle-même (Mon profil › « 🔑 Changer mon mot de passe », `03:951`).
- **Scan de la carte d'identité** (`09:288-362`) : l'image est réduite (1 500 px max, JPEG) puis envoyée à l'IA, qui renvoie ce qu'elle lit. Champs remplis : Prénom, Nom, Date de naissance, Lieu de naissance, Nationalité, N° Carte d'identité, N° Registre national, Validité carte d'identité (`09:341-348`). Statut affiché : « ⏳ Analyse en cours... » puis « ✅ N champ(s) rempli(s) automatiquement » ou « ❌ … — remplissez manuellement ». Accepte carte d'identité, passeport ou permis de conduire (`src/routes/ai.ts:133`). **L'image n'est pas conservée** : elle est seulement montrée en aperçu dans la fenêtre et analysée ; aucun enregistrement de l'image (`src/routes/ai.ts:111-160` ne stocke rien, `03:648-658` n'envoie pas l'image avec la fiche). Le téléphone et l'e-mail ne sont jamais remplis par le scan.
- **Photo** : l'aperçu s'affiche (`09:365-373`) mais **la photo n'est jamais enregistrée** (elle n'est pas envoyée à la création, `03:648-658`). Aucun autre écran ne permet de mettre une photo de profil. → anomalie.
- **Sous-équipes** : créées par « + » / « + Sous-équipe » (question « Nom de la sous-equipe ? ex: Equipe Ruslan »), couleur attribuée automatiquement, message « Sous-équipe "X" créée ✅ » (`09:271-286`). **Elles ne sont mémorisées que dans le navigateur de la personne qui les crée** (`09:249-254`) : un collègue sur un autre ordinateur / téléphone ne les voit pas ; les membres rattachés à une sous-équipe inconnue de son navigateur apparaissent comme n'en ayant pas. Suppression : 🗑️ → « Supprimer cette sous-équipe ? Les membres ne seront pas supprimés. » (`09:485-491`).
- Ce que ça alimente : listes de membres partout (équipe projet, bookings, hôtels, tâches, visites, handover…), droits (rôle), sélecteur d'équipe par sous-équipe dans « Nouveau Projet » (voir § 3.6).

#### 1.3 Fiche d'un membre (clic sur une carte)
Preuves : `09:494-586`.
- En-tête : photo / initiales, nom, « icône + rôle » et « · 👷 sous-équipe ».
- Affichage : 📧 e-mail (lien), 📞 téléphone (lien), 🌍 nationalité, 🪪 registre national, 🆔 n° de carte « · exp. date », 🎂 date « — lieu » de naissance. Fiche vide → « Aucune information renseignée — clique sur Modifier pour compléter la fiche. »
- « 📐 Accès Plans 2D » (case à cocher) : visible seulement pour un Admin ou quelqu'un qui a déjà l'accès (`09:588-590`, serveur `users.ts:45`). Message « Accès Plans 2D activé ✅ » / « Accès Plans 2D retiré ». Se retirer soi-même demande confirmation.
- Boutons : « Fermer », « 📧 Envoyer invitation », « ✏️ Modifier ».
- **« ✏️ Modifier »** : Prénom, Nom, Email, Téléphone, Rôle (les 10 rôles), Équipe (= sous-équipe), bloc « 🪪 Carte d'identité » : Date de naissance (texte « YYYY-MM-DD »), Lieu de naissance, Nationalité, N° de carte, Expiration (« YYYY-MM-DD »), N° registre national. Prénom, nom et e-mail obligatoires (« Prénom, nom et email obligatoires »). « 💾 Enregistrer » → « Fiche mise à jour ✅ » (`09:636-669`). Côté serveur, seuls **Admin et Project Manager** peuvent modifier la fiche d'un autre ; chacun peut modifier la sienne (`users.ts:105`). Un Technical Manager voit le bouton mais reçoit « Permission insuffisante ».
- **« 📧 Envoyer invitation »** : confirmation « Envoyer un mot de passe temporaire (valable 15 min) à <email> ? » ; un nouveau mot de passe de 8 caractères est créé, **il remplace le mot de passe actuel** et ferme toutes les sessions ouvertes du membre (`users.ts:131-149`) ; e-mail « Votre acces VEM - mot de passe temporaire » avec le bouton « Se connecter ». À la connexion avec ce mot de passe : fenêtre obligatoire « 🔐 Choisissez votre mot de passe » (8 caractères min., différent du temporaire) (`01:326-371`). Passé 15 min : « Mot de passe temporaire expiré. Demandez un nouvel envoi à un administrateur. » (`auth.ts:44-46`). Réservé à Admin / Project Manager (`users.ts:128`).
- **Désactiver / supprimer un membre : aucun bouton n'existe.** Il n'y a pas de suppression de compte dans le serveur ; la désactivation n'est possible que techniquement (voir notes techniques). Un compte désactivé ne peut plus se connecter (`auth.ts:28`) et n'apparaît plus nulle part, donc il ne peut pas non plus être réactivé depuis l'écran.

#### 1.4 « 🔗 Inviter » (fenêtre « 🔗 Inviter par lien »)
Preuves : `idx:567-605`, `07:174-208`, `auth.ts:255-317`.
- Texte : « Générez un lien : la personne créera elle-même son compte. »
- « Rôle attribué » : 👷 Ouvrier / Équipe (défaut), 🔧 Installateur, 🏗️ Site Manager, ⚙️ Technical Manager, 📊 Project Manager, 💼 Sales Engineer, 📦 Entrepôt (pas Admin, Engineer ni Client).
- « Email (optionnel — verrouille l'invitation sur cette adresse) ».
- « Note interne (optionnel) » (stockée, jamais réaffichée nulle part).
- « 🔗 Générer le lien » → « Lien d'invitation (copié automatiquement) : » + bouton 📋 ; message « Lien copié ✅ ».
- **Validité : 15 minutes** (`auth.ts:260`) — ce délai n'est affiché nulle part dans l'écran. **Usage unique** (`auth.ts:289`, `310`).
- Réservé à **Admin et Project Manager** (`auth.ts:257`). Pour les autres rôles, le bouton est visible mais l'écran fabrique un **faux lien** avec le message « Lien généré (API invite non déployée — fonctionne en mode démo) » — ce lien ne fonctionne pas (`07:190-197`).
- **Ce que voit l'invité** (écran « Créer mon compte », `idx:51-101`, `07:215-292`) : logo, « Créer mon compte », ligne « Rôle : … » (libellés : 👷 Installation Team, ⚙️ Sales Engineer [pour Engineer], 🏗️ Site Manager, 🔧 Technical Manager, 📦 Warehouse Labour ; sinon « Complétez vos informations »), champs Prénom, Nom, Email, **Rôle (liste modifiable)**, « Mot de passe (8 caractères min) », « Confirmer le mot de passe », bouton « ✅ Créer mon compte », lien « ← Retour à la connexion ». Tous les champs sont obligatoires. Après succès : connexion automatique et « Bienvenue <prénom> ! 🎉 ».
- Erreurs possibles : « Cette invitation a déjà été utilisée », « Invitation expirée », « Cette invitation est réservée à une autre adresse email », « Un compte existe déjà avec cet email », « Invitation invalide ».
- **Le rôle choisi par l'invité dans la liste l'emporte sur le rôle de l'invitation** (`auth.ts:299`) : un invité « Ouvrier » peut se créer un compte Project Manager ou Technical Manager. → anomalie importante.
- Le compte créé par invitation n'a ni téléphone ni données d'identité ; il faut compléter la fiche ensuite.

---

### 2. Onglet projet « 👥 Équipe »

**Chemin** : Projets › ouvrir un projet › onglet « 👥 Équipe » (`idx:375`). Carte « 👥 Équipe du Projet » (`02:301-335`).
- Boutons : « + Créer membre » (ouvre la même fenêtre « 👤 Nouveau Membre » ; le membre créé **n'est pas** ajouté au projet automatiquement) et « + Ajouter à l'équipe ».
- Tableau : **Nom | Rôle | Phase | Téléphone | Lead | (actions)**. Le rôle est affiché en code brut (ex. `site_manager`, `installer`) et non en libellé français (`02:313`). Téléphone du membre ou « — ». L'e-mail n'est pas affiché dans le tableau.

#### 2.1 « + Ajouter à l'équipe » (fenêtre « 👷 Ajouter à l'équipe »)
Preuves : `10:228-282`, `projects.ts:222-240`.
- « Membre » : tous les comptes actifs, affichés « Prénom Nom (code rôle) » (ex. « (installer) »). Obligatoire (« Sélectionne un membre »).
- « Rôle sur ce projet » : 🔧 Installateur, 🏗️ Site Manager, ⚙️ Technical Manager, 👷 Ouvrier, 🛠️ Engineer (5 valeurs ; pas Project Manager, Sales Engineer, Entrepôt…).
- « Phase d'intervention » : 🔄 Les deux phases (installation + démontage) (défaut), 🔨 Uniquement installation, 🔧 Uniquement démontage.
- « ✅ Ajouter » → « Membre ajouté ✅ ». Une même personne ne peut être qu'une fois dans l'équipe d'un projet (erreur « Déjà dans l'équipe », `projects.ts:237`).
- Aucune notification n'est envoyée automatiquement à l'ajout.

#### 2.2 Modifier / retirer
- **Phase** : modifiable directement dans le tableau (liste 🔄 Les deux / 🔨 Installation / 🔧 Démontage) → « Phase mise à jour ✅ » (`02:314-320`, `10:285-291`).
- **Rôle sur le projet** : **non modifiable** depuis l'écran (le serveur le permet, aucun bouton) — il faut retirer puis rajouter la personne.
- **Retirer** : « ✕ » → confirmation « Retirer <Prénom Nom> de l'équipe ? » → « Membre retiré ✅ » (`02:324`, `10:294-299`). Les bookings de la personne sur ce projet ne sont pas supprimés.
- **Lead** : la colonne affiche « ⭐ Lead » mais **aucun écran ne permet de désigner un lead** (À confirmer : seul un ancien mécanisme de création de projet le posait ; l'écran actuel ne l'envoie pas).
- **Technical manager du projet** : champ propre au projet (affiché « Chef technique » dans le briefing, `11:394`, et dans la liste des projets, `01:1137`), **aucun écran ne permet de le choisir** (À confirmer : rempli autrement ? aucun code d'interface trouvé).

#### 2.3 « 📤 » Envoyer infos / notifier un membre (fenêtre « 📤 Envoyer à <nom> »)
Preuves : `10:305-407`, `projects.ts:269-415`.
- Rappel du rôle (code brut), de la phase, de l'e-mail ou « ⚠️ Aucun email — seule la notification in-app sera possible ».
- « Quoi envoyer ? » : 📌 Notification d'assignation (cochée par défaut) · 📋 Infos du projet · 📊 Briefings · 🚚 Ses réservations · 📄 Derniers rapports (5 derniers) · 🤖 Message personnalisé (IA).
- « Canal » : 📱 Notif · ✉️ Email · 📱+✉️ Les deux (défaut si e-mail connu).
- « Message (optionnel) » (« Mot personnel ajouté en haut du message... »), bouton « 📤 Envoyer ». Résultat : « ✅ <prénom> : notification envoyée + email envoyé à … ».
- L'e-mail s'intitule « [VEM] <projet> — infos projet ». « Ses réservations » reprend les transports et hôtels de la personne sur ce projet (onglet Bookings).

#### 2.4 Ce que l'équipe projet alimente
- **Accès restreint** : un Installateur ou un Site Manager ne peut ouvrir la check-list et les pièces jointes check-list des daily reports **que** s'il est dans l'équipe du projet (ou technical manager du projet) (`src/middleware/projectAccess.ts:10-31`). Pour tout le reste, l'appartenance à l'équipe ne change rien (voir § 5).
- Liste des membres reconnus quand un e-mail crée des trajets automatiquement (§ 4.4).
- Rapport projet, briefing (« Infos projet », « Équipe »), rapport d'analyse (`06-time-analysis.js:654`).

---

### 3. Onglet projet « 🚛 Logistique » (camions & engins)

**Chemin** : Projets › projet › onglet « 🚛 Logistique » (`idx:376`). Contenu chargé par `11:1-73`.

#### 3.1 Liste
- En-tête : « N véhicule(s) actif(s) » + « · N archivé(s) », case « Voir archivés » (si des véhicules sont archivés), bouton « + Ajouter ».
- Vide : « Aucun véhicule actif » — « Ajoute un camion, une grue ou un forklift. » ou « N véhicule(s) archivé(s) — coche "Voir archivés" pour les afficher ».
- Carte : « icône Type — nom », « (archivé) », « 📦 Chargement : lieu », « 🏗️ Déchargement : lieu », « 🪪 plaques · 👤 chauffeur · 📞 téléphone », badge de statut, ✏️ (modifier), 🗑️ (« Supprimer ce véhicule ? »), « 📅 Chargement » et « 📅 Arrivée » (date + heure), « 📝 notes ».

#### 3.2 « + Ajouter » / ✏️ (fenêtre « 🚛 Ajouter un véhicule » / « 🚛 Modifier un véhicule »)
Preuves : `10:1-222`.
- **🚛 Véhicule** — « Type * » (`10:19-29`) :
  - 🚛 Camion (Tautliner)
  - 🚛 Camion (Flatbed)
  - 🚐 Camionnette
  - 🏗️ Grue
  - ✂️ Nacelle ciseaux
  - 🔧 Manitou / Roto
  - 🚜 Chariot élévateur
  - ⚡ Groupe électrogène
  - 📦 Autre
  
  « Nom / référence supplémentaire (optionnel) » (« Ex: Camion Volvo n°2, Grue Liebherr 70T »), « Plaque 1 (Tracteur) », « Plaque 2 (Remorque) » (enregistrées ensemble « P1 / P2 »).
- **👤 Chauffeur** — « Nom du chauffeur », « 📞 Téléphone ».
- **📦 Chargement** — « Lieu de chargement » : 🏭 Entrepôt Tubize (défaut) · 📍 Directement sur site événement · 📦 Autre lieu (adresse spéciale) → champ « Adresse du lieu de chargement » ; « 📅 Date & heure de chargement ».
- **🏗️ Déchargement** — « Lieu de déchargement » : 📍 Site événement (défaut) · 🏭 Entrepôt Tubize · 📦 Autre lieu (adresse spéciale) → « Adresse du lieu de déchargement » ; « 📅 Arrivée estimée » ; « 📍 Zone de déchargement » (« ex: Entrée Est, Quai A, Parking Nord... »), ajoutée aux notes sous la forme « Zone: … » (`10:191`).
- Lieux enregistrés : « Entrepôt Tubize », « Site événement » ou l'adresse tapée (« Autre lieu » si vide) (`10:174-178`).
- **⚙️ Statut** (seulement en modification) — « État du véhicule » : 🟣 Planifié · 🟠 En chargement · 🔵 En route · 🟢 Livré (= archivé) · ⚫ Retour entrepôt (= archivé), avec le texte « Les véhicules "Livré" ou "Retour entrepôt" sont automatiquement masqués des vues principales » (`10:115-123`). À la création, le statut est toujours « Planifié » (`10:186`).
- « 📝 Notes » (« Instructions spéciales, matériel transporté... »).
- Boutons « Annuler » / « ✅ Ajouter le véhicule » ou « 💾 Enregistrer » ; messages « Véhicule ajouté ✅ » / « Véhicule modifié ✅ ».
- Seul le type a une étoile ; aucun champ n'est réellement bloquant.

#### 3.3 Archivage automatique
- Règle : un véhicule est « archivé » **uniquement par son statut** : Livré ou Retour entrepôt (`10:1187`). Pas d'archivage par date.
- Effets : masqué de l'onglet Logistique (sauf « Voir archivés », carte grisée « (archivé) ») (`11:8-9`, `11:47`) et du bloc « 🚛 Logistique — Dates clés » de l'onglet Infos (`02:39`, `02:151-171`).
- **Pas masqué** du calendrier du Dashboard ni du planning public (voir § 3.5).

#### 3.4 Véhicules créés par e-mail (« Brouillon »)
- Un e-mail transféré dont le sujet contient le **numéro interne du projet** est lu automatiquement ; l'IA y repère camions, hôtels et trajets. Chaque véhicule est créé avec le statut « draft » et la note « 📧 Créé auto depuis mail — à valider (mail de <expéditeur>). » (`src/services/bookingFromEmail.ts:37`, `197-219`).
- Les Admin et Project Manager reçoivent la notification « 🚛 Réservations créées depuis un email » — « <n° projet> · N camion(s), N hôtel(s), N trajet(s) en brouillon. À valider. » (`bookingFromEmail.ts:313-326`).
- **Affichage** : le badge « 📝 Brouillon » existe dans l'ancienne vue des cartes (`02:342`), dans le rapport (`06-time-analysis.js:904`) et dans une fiche camion qui n'est plus ouverte nulle part (`05:844-933`). **Dans l'onglet Logistique actuel, un brouillon s'affiche avec le badge « draft » (mot brut, gris)** car ce statut manque à la liste des libellés (`10:1177-1180`, `11:39`). → anomalie.
- **Validation** : il n'y a pas de bouton « Valider ». En pratique : ✏️ → la liste « État du véhicule » ne contient pas « Brouillon », elle se positionne sur « 🟣 Planifié » → « 💾 Enregistrer » fait passer le véhicule en Planifié (`10:115-121`, `10:186`). La note « à valider » reste tant qu'on ne l'efface pas à la main. (Comportement déduit du code, à confirmer en test.)

#### 3.5 Où les véhicules apparaissent ailleurs
- **Onglet 📋 Infos** : carte « 🚛 Logistique — Dates clés » (véhicules non archivés ayant une date) : « 📦 Chargement entrepôt », « 🚀 Départ », « ✅ Arrivée site » ou « ⏳ En attente d'arrivée sur site », bouton « Voir tous » (`02:151-171`).
- **Dashboard › calendrier** : case « 🚛 Camions » (`idx:281-284`) → une sous-ligne par véhicule sous chaque projet « └ icône nom/plaque » + chauffeur, barre verte du chargement à l'arrivée (à défaut : dates du projet), légende « 🚛 Camion ». Tous les statuts, y compris brouillons et archivés (`01:917-1001`). Case voisine « 👥 Équipes » → sous-lignes des bookings transport (pointillés = trajets aller/retour, « └ Aucun booking équipe ») (`01:1003-1035`).
- **Planning public (écran entrepôt)** : une icône 🚛 au jour de chargement (sinon départ, sinon arrivée), info-bulle « 🚛 nom ou plaque ou "Camion" » ; tous les véhicules, brouillons et archivés compris ; aucun type d'engin distingué ; **les équipes / bookings n'y figurent pas** (`src/routes/publicCalendar.ts:38-66`, `public/planning-public.html:192-199`). Projets affichés : tous sauf annulés, fenêtre aujourd'hui + 60 jours.
- **Entrepôt Tubize** : si le lieu de chargement ou de déchargement contient « Tubize », l'entrepôt est prévenu à la création et lors d'un changement de date, de lieu ou de statut (pas pour chauffeur / notes) (`projects.ts:509-523`, `541-572`). Les brouillons créés par e-mail ne préviennent pas l'entrepôt à leur création, seulement quand on les modifie.
- **Nouveau Projet** : section « 🚛 Logistique — Camions, machines et véhicules prévus » avec « + Ajouter » / « 🚛 Ajouter un camion / véhicule » : Type (Camion, Camionnette, Grue, Nacelle, Manitou, Chariot élév., Groupe élec., Autre — pas de Flatbed), « N° camion / immat... », « 🪪 Immatriculation », « 👤 Chauffeur », « 📞 Téléphone », « 📦 Chargement (date + heure) », « 📍 Arrivée sur site (date + heure) », « Notes... » ; **pas de lieux**. Un véhicule sans N° ni immatriculation est ignoré sans message (`09:1009-1093`, `02:1176-1205`).
- Briefing (bloc « 🚛 Logistique (auto) »), rapport projet, assistant.

---

### 4. Onglet projet « ✈️ Bookings » (transport & hôtels)

**Chemin** : Projets › projet › onglet « ✈️ Bookings » (`idx:377`, `10:658-742`).

#### 4.1 Section « ✈️ Transport par membre »
- Sous-titre « N booking(s) — un par membre+phase » ; boutons « + Transport démontage » et « + Transport installation ».
- Vide : « Aucun transport » — « Un booking transport par membre+phase (installation OU démontage) ».
- Groupes « 🏗️ Installation (N) » et « 🔨 Démontage (N) ». Carte : initiales, nom, rôle (code brut), ✏️, 🗑️ (« Supprimer ce transport ? »), « 📍 Sur site date → date », « Aller · mode » + date-heure + détails, « Retour · mode » + date-heure + détails (❔ si mode inconnu), « 📝 notes » (`10:744-788`). **La pièce jointe n'apparaît pas sur la carte** (seulement en ouvrant ✏️).

**Fenêtre « ➕ Nouveau transport — 🏗️ Installation » / « ✏️ Modifier transport — … »** (`10:827-928`, `973-1008`) :
| Champ | Obligatoire | Remarque |
|---|---|---|
| Membre * | oui | tous les comptes actifs « Prénom Nom (rôle) » — **pas limité à l'équipe du projet** ; non modifiable en édition |
| Phase * | oui | 🏗️ Installation / 🔨 Démontage |
| 📍 Présence effective sur site — Du * / Au * | oui | dates (« Les dates de présence sont requises ») |
| ✈️ Trajet aller (vers le site) — Moyen de transport | non | — Non renseigné — · ✈️ Avion · 🚄 Train · 🚗 Voiture · 🚌 Bus / Car · 🛫 Autre (`10:646-652`) |
| … Date + heure | non | date-heure |
| … Détails (n° de vol, etc.) | non | « Ex: AF1234 dép. 14h35 - CDG T2E » |
| 🛬 Trajet retour — Moyen / Date + heure / Détails | non | mêmes modes |
| Notes | non | |
| 📎 Pièce jointe (billet, voucher...) | non | PDF ou image ; « ⏳ Upload en cours... » puis « ✅ Fichier prêt — clique "Enregistrer" pour confirmer » ; ✕ pour retirer |
Bouton « 💾 Créer » / « 💾 Enregistrer » → « Transport créé ✅ » / « Transport mis à jour ✅ ».
- « Un par membre+phase » est seulement indicatif : rien n'empêche deux transports pour la même personne et la même phase.

#### 4.2 Section « 🏨 Hôtels (multi-occupants) »
- Sous-titre « N réservation(s) — un hôtel peut héberger plusieurs membres » ; boutons « + Hôtel démontage » / « + Hôtel installation ». Vide : « Aucune réservation hôtel » — « Crée une réservation et sélectionne tous les occupants concernés en une fois ».
- Carte jaune : 🏨 nom, adresse, ✏️, 🗑️ (« Supprimer cette réservation hôtel ? »), « 📅 Séjour date → date », « Réf. : … », « 👥 Occupants (N) » (pastilles nom), « 📝 notes » (`10:790-824`). Pièce jointe non visible sur la carte.

**Fenêtre « ➕ Nouvelle réservation hôtel — … »** (`10:1018-1152`) :
| Champ | Obligatoire | Remarque |
|---|---|---|
| Phase * | oui | 🏗️ Installation / 🔨 Démontage |
| Référence (optionnel) | non | « Ex: Booking.com #XYZ » |
| 🏨 Hôtel — Nom * | oui | « Nom de l'hôtel requis » |
| Adresse | non | « Rue, ville, pays » |
| Check-in * / Check-out * | oui | dates (« Check-in et check-out requis ») |
| 👥 Occupants (sélectionne tous les membres logés) | oui, au moins 1 | « Tout cocher » / « Tout décocher », « 🔎 Filtrer par nom... », compteur « N occupant(s) sélectionné(s) » ; tous les comptes actifs, pas seulement l'équipe |
| Notes (contact, particularités, etc.) | non | |
| 📎 Pièce jointe (confirmation, voucher...) | non | PDF ou image |
Message : « Hôtel créé pour N occupant(s) ✅ » / « Hôtel mis à jour ✅ ».

#### 4.3 Ce que les bookings alimentent
- Dashboard › calendrier, case « 👥 Équipes » (transports uniquement, pas les hôtels) (`01:1003-1035`).
- « 📤 Envoyer à … » › « 🚚 Ses réservations » (transports + hôtels de la personne) (`projects.ts:340-360`).
- Briefing : blocs « ✈️ Transport équipe (auto) » et « 🏨 Hôtels équipe (auto) » (`11:99-100`).
- Rapport PDF du projet : nombre de trajets et liste des hôtels avec occupants (`src/services/pdfService.ts:1388-1395`).
- **Pas d'export dédié** (pas de PDF / Excel / e-mail « liste des bookings »), pas de vue globale des bookings tous projets confondus dans l'interface (À confirmer : une liste serveur « calendrier des bookings » existe mais aucun écran ne l'utilise).

#### 4.4 Bookings créés par e-mail (« à valider »)
- Même mécanisme que les camions (§ 3.4) : hôtels et trajets reçoivent dans leurs **notes** le texte « 📧 Créé auto depuis mail — à valider (mail de <expéditeur>). » (`bookingFromEmail.ts:197`, `240-251`, `283-299`). Il n'existe **ni badge ni statut** « à valider » : seul ce texte dans la ligne « 📝 » de la carte le signale.
- Trajets : créés uniquement si le nom cité correspond à un membre **de l'équipe du projet** ; sinon ignorés (`bookingFromEmail.ts:260-272`). Dates de présence manquantes → dates d'installation / démontage du projet.
- Hôtels : créés **sans aucun occupant** (« 👥 Occupants (0) ») ; dates manquantes → dates de la phase du projet (`bookingFromEmail.ts:229-251`).
- **Validation** : aucun bouton. Ouvrir ✏️, compléter (pour un hôtel : cocher au moins un occupant, sinon l'enregistrement est refusé), effacer à la main la mention « à valider » dans Notes, « 💾 Enregistrer ». (Déduit du code, à confirmer.)

---

### 5. Droits par rôle (uniquement ce que le code vérifie)

Légende : ✅ autorisé · ❌ refusé par le serveur · 👁 bouton visible mais l'action échoue · « Tous » = tout compte connecté, y compris Client.

| Action | Admin | Project Manager | Technical Manager | Site Manager | Installateur | Ouvrier | Engineer | Sales Eng. | Entrepôt | Client | Preuve |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Voir la page Équipe et toutes les fiches (y compris n° de registre national, n° de carte, date de naissance) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `users.ts:29-40`, aucun masquage `idx:182` |
| Créer un membre (+ Nouveau membre) | ✅ | ✅ | ✅ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | `users.ts:57` |
| Modifier la fiche d'un autre | ✅ | ✅ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | `users.ts:105` |
| Modifier sa propre fiche (y compris son rôle — voir anomalie) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `users.ts:105` |
| Générer un lien d'invitation | ✅ | ✅ | 👁 (faux lien « mode démo ») | idem | idem | idem | idem | idem | idem | idem | `auth.ts:257`, `07:190-197` |
| « 📧 Envoyer invitation » (mot de passe temporaire) | ✅ | ✅ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | 👁❌ | `users.ts:128` |
| Donner / retirer l'accès Plans 2D | ✅ | si accès Plans | si accès Plans | si accès | si accès | si accès | si accès | si accès | si accès | si accès | `users.ts:45`, `09:588` |
| Voir / modifier tout projet, son équipe, ses véhicules, ses bookings, envoyer des infos à un membre | Tous ✅ (aucune vérification de rôle ni d'appartenance au projet) | | | | | | | | | | `projects.ts:19-600`, `teamBookings.ts` (aucun contrôle) |
| Ouvrir / remplir la check-list d'un projet | ✅ | ✅ | ✅ | seulement ses projets | seulement ses projets (lecture ; remplir ❌) | ❌ remplir | ❌ remplir | ❌ remplir | ❌ remplir | ❌ | `checklists.ts:26-28`, `projectAccess.ts:10` |
| Forcer le lien de signature du handover | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | `handover.ts:370` |
| Assistant | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | `src/index.ts:123`, `01:394` |
| Tâches / tickets : liste limitée à ce qui lui est assigné | — | — | — | — | — | ✅ (seul rôle filtré) | — | — | — | — | `tasks.ts:16`, `tickets.ts:19` |
| Réinitialiser les templates de tâches | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | `taskTemplates.ts:362` |

**Où il n'y a AUCUNE restriction** : toutes les pages du menu sont visibles pour tous les rôles (aucun masquage de menu par rôle) ; projets (création, modification, suppression), équipe projet, Logistique, Bookings, notifications aux membres, liste et fiches détaillées des membres (données d'identité comprises) sont accessibles à tout compte connecté, **y compris un compte Client**. La restriction « seulement mes projets » (Installateur, Site Manager) ne s'applique qu'à la check-list et aux pièces jointes check-list des daily reports.

---

### 6. Anomalies et incohérences (UX)

1. **Photo de profil jamais enregistrée** (aperçu seulement) — `03:648-658`.
2. **« à changer à la première connexion » non appliqué** pour VEM2025! — `idx:1231` vs `auth.ts:36-52`.
3. **Sous-équipes stockées dans le navigateur** : invisibles pour les collègues, perdues si on change d'appareil ou vide le cache — `09:249`.
4. **Rôle choisi par l'invité prioritaire sur l'invitation** — `auth.ts:299` + liste modifiable `idx:77`.
5. Validité du lien d'invitation **15 min**, non indiquée à l'écran ; trop court pour un envoi par WhatsApp / SMS — `auth.ts:260`.
6. Bouton « 🔗 Inviter » visible pour tous ; hors Admin / PM il produit un **faux lien « mode démo »** inutilisable — `07:190-197`.
7. Libellés de rôle incohérents à l'inscription (« ⚙️ Sales Engineer » pour Engineer, « 🔧 Technical Manager », « Installation Team », « Warehouse Labour ») — `07:226-232`. Rôles affichés en code brut dans l'équipe projet, bookings, « Mon Profil » et le bandeau utilisateur pour Installateur / Entrepôt / Sales Engineer — `02:313`, `03:942`, `01:502`.
8. **Aucun moyen de désactiver ou supprimer un membre** depuis l'écran ; un compte désactivé ne réapparaît nulle part.
9. « 📧 Envoyer invitation » **écrase le mot de passe actuel** d'un membre déjà actif et le déconnecte partout — `users.ts:142-149` ; le texte ne le dit pas.
10. Technical Manager peut créer un membre mais pas le modifier ni l'inviter.
11. Fenêtre « 👤 Nouveau Membre » : rien n'indique qu'elle est remise à zéro après une création (À confirmer : les champs du membre précédent semblent rester) — `03:776-898` sans reset pour `modal-user`.
12. Création de membre depuis l'onglet projet (« + Créer membre ») n'ajoute pas la personne au projet.
13. « Nouveau Projet » › « 👷 Équipes & Membres » : la liste reste sur « Chargement... » (elle n'est chargée que si on clique « + Sous-équipe ») et **les membres cochés ne sont jamais enregistrés** — `09:684`, `02:1084-1218`.
14. Colonne « Lead » et « Chef technique » affichées mais **aucun écran pour les définir**.
15. Rôle sur le projet non modifiable après ajout ; liste de 5 rôles seulement.
16. Logistique : statut **« draft » affiché en brut** ; pas de bouton « Valider » ; la liste de statuts de la fenêtre de modification ne contient pas Brouillon (validation implicite en ouvrant / enregistrant).
17. Deux jeux de libellés de statut : fenêtre (🟣 Planifié, 🔵 En route, ⚫ Retour entrepôt) vs ancienne vue / rapport (Planifié, En transit, Retourné, ✅ Livré).
18. L'onglet Logistique est dessiné par deux codes différents : à l'ouverture du projet ou après une suppression / un enregistrement, l'ancienne vue (bouton « ✅ Arrivé », « + Ajouter camion / machine », brouillons tous visibles, archivés non masqués) peut réapparaître à la place de la nouvelle — `02:338-374` vs `11:1-73` (à confirmer en test).
19. Une fiche camion complète (photos, « ✅ Confirmer l'arrivée ») existe mais n'est plus accessible ; les photos qu'elle envoyait n'étaient de toute façon rattachées à aucun véhicule — `05:844-997`.
20. « Zone de déchargement » non pré-remplie en modification, stockée dans les notes : risque de doublon « Zone: … | Zone: … » — `10:105-107`, `10:191`.
21. Date de « 🚀 Départ » affichée (Infos, planning public) mais non saisissable dans l'écran (seulement remplie par e-mail).
22. Véhicules ajoutés depuis « Nouveau Projet » : pas de lieux, pas de Flatbed, ignorés sans message s'ils n'ont ni N° ni immatriculation.
23. Archivés et brouillons visibles sur le calendrier Dashboard et le planning public (écran entrepôt) alors qu'ils sont masqués dans le projet.
24. Bookings créés par e-mail : mode de transport écrit en toutes lettres par l'IA (« avion », « train ») non reconnu → icône ❔, et **effacé** si on enregistre la fiche sans le re-sélectionner — `bookingFromEmail.ts:140`, `10:877-880`.
25. Hôtels créés par e-mail sans occupant ; aucun indicateur « à valider » autre que le texte des notes.
26. Pièce jointe des transports / hôtels non visible sur les cartes.
27. Choix du membre / des occupants : tous les comptes actifs, pas seulement l'équipe du projet ; aucun contrôle de cohérence (dates de présence hors dates du projet, check-out avant check-in, doublon membre + phase).
28. Pas d'export ni d'envoi groupé des bookings (seulement membre par membre via « 📤 »).

### 7. Questions pour le product owner

1. Le mot de passe VEM2025! doit-il être obligatoirement changé à la première connexion (comme le texte l'annonce) ?
2. Les sous-équipes doivent-elles être partagées entre tous les utilisateurs (aujourd'hui propres à chaque navigateur) ?
3. L'invité doit-il pouvoir choisir son rôle ? Sinon, figer le rôle de l'invitation. Quelle durée de validité pour le lien (15 min aujourd'hui) ?
4. Qui doit pouvoir créer / modifier / inviter des membres ? (aujourd'hui trois règles différentes : création Admin/PM/TM, modification et invitations Admin/PM).
5. Faut-il un bouton « Désactiver » (départ d'un ouvrier) et une vue des comptes désactivés ?
6. Les données d'identité (registre national, n° de carte) doivent-elles être visibles par tous les rôles, y compris Client ?
7. Qui désigne le « Lead » et le « Chef technique » d'un projet, et où ?
8. Quels rôles doivent voir / modifier Logistique et Bookings ? Un Client ou un Ouvrier doit-il voir les projets des autres ?
9. Pour les brouillons venant d'e-mails : souhaitez-vous un bouton « ✅ Valider » et un badge visible (camions, hôtels, trajets) ?
10. Les véhicules livrés / retournés et les brouillons doivent-ils disparaître aussi du planning public et du calendrier ?
11. Faut-il une liste ou un export (PDF / Excel / e-mail) des bookings par projet ou toutes équipes confondues ?
12. La sélection « 👷 Équipes & Membres » de « Nouveau Projet » doit-elle être réparée ou retirée ?
13. La fiche camion avec photos / confirmation d'arrivée doit-elle revenir ?

---

### Notes techniques (ne pas mettre en formation)

- **Élévation de privilèges** : `PATCH /api/v1/users/:id` autorise l'utilisateur lui-même (`users.ts:105`) et la liste blanche contient `role` et `isActive` (`users.ts:15-19`) → tout compte peut se donner le rôle `admin` via l'API. À corriger en priorité.
- `POST /auth/register` prend `req.body.role` avant `invite.role` (`auth.ts:299`) → l'invité choisit son rôle (même `admin` via appel direct).
- `GET /users` renvoie à tout utilisateur authentifié les champs d'identité (`nationalNumber`, `idNumber`, `birthDate`…) (`users.ts:22-27`) ; aucun filtrage de rôle (RGPD).
- Aucun contrôle de rôle ni `assertProjectAccess` sur `src/routes/projects.ts` (équipe, camions, notify, suppression de projet) ni sur `src/routes/teamBookings.ts`. `projectAccess` n'est utilisé que par `checklists.ts` et `dailyReports.ts:311`.
- `TEAM_GROUPS` en `localStorage` `vem_team_groups` (`09:249`) alors que `users.team_group_id` est en base : ids `tg_<timestamp>` locaux.
- Photo de profil : `avatarUrl` jamais envoyé ; pas d'upload.
- Scan ID : `POST /ai/scan-id`, image base64 envoyée au modèle IA via `callClaudeJSON`, non persistée ; seule sa taille est journalisée (`ai.ts:118`).
- Désactivation possible uniquement via `PATCH /users/:id {isActive:false}` (Admin/PM) ; aucune route DELETE ; `GET /users` filtre `isActive: true`.
- `mustChangePassword` ne dépend que de la table `invite_passwords` (remplie par `send-invite`), pas du mot de passe par défaut.
- `/auth/forgot-password` utilise `nodemailer.createTransporter` (n'existe pas, c'est `createTransport`) et le SMTP — à vérifier, probablement cassé (`auth.ts:153`) ; hors périmètre mais à signaler.
- Secrets JWT avec valeurs par défaut en dur si variables absentes (`auth.ts:12-13`, `middleware/auth.ts:16`).
- `openTruckDetail`, `confirmTruckArrival`, `uploadTruckPhotos` (`05:844-997`) : code mort ; `truck.photos` n'existe pas dans le modèle `Truck`.
- Double rendu de `#detail-trucks-content` : `loadProjectDetail` (`02:338-374`) et `loadDetailTrucks` (`11:1`), appels concurrents dans `saveTruck` (`10:216-218`) et `deleteTruck` (`11:76`).
- `TRUCK_STATUS_LABELS` / `TRUCK_STATUS_COLORS` sans `draft` (`10:1177-1185`).
- `loadProjTeamSelector` jamais appelé à l'ouverture de `modal-proj` ; `getSelectedProjMembers` jamais utilisé ; `POST /projects` attend `siteManagerIds` / `engineerIds` (seul moyen de poser `isLead`), jamais envoyés.
- `technicalManagerId` accepté par `PATCH /projects/:id` mais aucun champ front ne l'envoie.
- Création par e-mail : `imapPoller.ts` → `createBookingsFromEmail` (sujet contenant le n° interne ; préfixe `NEW` = création de projet). Camions `status: 'draft'` créés via Prisma direct ⇒ pas de notification Telegram / tâche app entrepôt à la création. Modes de transport libres (pas de normalisation vers `plane/train/car/bus/other`). Hôtels sans occupants. Notification aux rôles admin + project_manager.
- Notifications Tubize : `telegramService.notifyTubizeTruckMovement` + `warehouseAppService.createWarehouseTask/updateWarehouseTask`, mot-clé configurable par variable d'environnement.
- `GET /bookings/calendar` (`teamBookings.ts:191-212`) non utilisé par le front.
- Upload des pièces jointes bookings via `POST /upload/photo` avec `folder` `team-bookings` / `hotel-bookings` (stockage externe).
- `generateAiMemberMessage` appelle l'API IA en direct avec un modèle codé en dur (`projects.ts:465-488`), hors `aiService`.
- `PATCH /hotel-bookings/:id` supprime puis recrée les occupants hors transaction (`teamBookings.ts:160-163`).
- Fichier vide parasite `src/routes/teamb` (0 octet).
- Route publique `/api/v1/public/calendar` sans authentification : expose n° interne, nom, client, ville, dates et plaques / noms des camions.

---

## II.4 — Audit 4 — Tâches, Templates tâches, Rapport IA (inventaire formation)

Audit en lecture seule du dépôt `/home/user/vem-backend` (23.10.2026). Les preuves sont notées `fichier:ligne`. Ce qui n'a pas pu être prouvé dans le code est noté « À confirmer ».

---

### 0. Ce qu'il faut retenir pour la formation

- Le **suivi de chantier ne passe plus par les tâches** : l'onglet projet « ✅ Tâches » est masqué depuis le 16.10.2026 (« le suivi se fait par la check-list (Daily Reports) ») — `public/index.html:368`. Pourtant **plusieurs points d'entrée vers les tâches restent visibles** (voir § 1.1). Il faut décider quoi enseigner (voir questions, § 7).
- Les **Templates tâches** servent encore à deux choses bien réelles :
  1. la liste « 📋 Tâches à créer » du formulaire **Nouveau projet** ;
  2. le tableau **« ⏱️ Heures par tâche »** des Daily Reports (seuls les templates qui ont une **Phase** Installation / Démontage y apparaissent). C'est ce tableau qui alimente « ⏱️ Temps par tâche » dans le Rapport IA.
- Le **📊 Rapport IA** fonctionne quel que soit l'état des tâches. Chaque génération (aperçu compris) **enregistre une copie PDF dans les fichiers du projet**.

---

### 1. Tâches

#### 1.1 Où voit-on les tâches ? (état réel de l'interface)

| Point d'entrée | Visible ? | Preuve |
|---|---|---|
| Menu **Terrain › ✅ Tâches** (page « Tâches », sous-titre « Kanban de toutes les tâches ») | **Oui** | `public/index.html:165`, `397-407` |
| En-tête de la fiche projet : **« 📋 Plusieurs tâches »** et **« ➕ 1 tâche »** | **Oui** | `public/index.html:361-362` |
| Onglet du projet **« ✅ Tâches »** (kanban par étape, avec « 🤖 Import réunion ») | **Non** (masqué : `display:none`) | `public/index.html:368` ; contenu `public/js/04-edit-clients-templates.js:1032-1107` |
| Formulaire Nouveau projet › **« 📋 Tâches à créer »** | **Oui** | `public/index.html:673-697` |
| Daily Report › **« ✅ Avancement tâches »** (« Cocher = terminé ») | **Oui** | `public/index.html:919-929` ; `public/js/03-create-forms.js:286-339` |
| Barre mobile et bouton « ＋ » (FAB) | Aucun accès aux tâches | `public/index.html:113-145` |
| Assistant (bulle de chat) : il peut lister et créer des tâches | Oui, pour les rôles qui ont l'assistant | `src/services/assistantService.ts:168-193`, `706-731` ; `src/index.ts:123` |

**Incohérence à signaler** : avec l'onglet masqué, « ➕ 1 tâche » et « 📋 Plusieurs tâches » créent des tâches **qu'on ne voit plus dans le projet**. On ne les retrouve que dans Terrain › ✅ Tâches (mélangées avec les autres projets), dans le Daily Report (« Avancement tâches ») et dans le Rapport IA. Le seul retour visible est un message de confirmation (toast). Le bouton « 🤖 Import réunion » n'existe que dans l'onglet masqué : il est donc **inaccessible**.

#### 1.2 Page Terrain › ✅ Tâches (kanban global)

- **Chemin** : Menu › Terrain › ✅ Tâches. Titre « Tâches », sous-titre « Kanban de toutes les tâches », bouton **« + Nouvelle Tâche »** (`public/index.html:399-400`).
- **Colonnes** (par statut) : **« 📋 À faire »**, **« ⚡ En cours »**, **« ✅ Terminé »**, **« 🔴 Bloqué »** (`public/index.html:402-405`). Il n'y a **pas de colonne Annulé** : une tâche annulée disparaît du kanban (`public/js/02-detail-loaders.js:398-402`).
- **Contenu** : les tâches de **tous les projets** mélangées. Il n'y a **ni filtre** (projet, personne, date), **ni nom de projet sur la carte** (`02-detail-loaders.js:394-407`, `378-391`).
- **Carte** : titre, « 📅 date », « 👤 Prénom Nom », un badge de priorité **affiché en anglais brut** (`low` / `normal` / `high` / `critical`), et un bouton **« ✓ »** (= marquer terminé), absent quand la tâche est terminée (`02-detail-loaders.js:378-391`).
- **Glisser-déposer** : **non** (rien dans le code). On change le statut avec « ✓ » ou depuis la fiche.
- **Clic sur une carte** : ouvre la fiche tâche (§ 1.5).
- **Rôle « worker »** : ne voit que les tâches qui lui sont assignées (`src/routes/tasks.ts:16`). Les autres rôles voient tout.

#### 1.3 Kanban de l'onglet projet (masqué, pour information)

Il est groupé **par étape** (catégorie de template), pas par statut. Sur chaque carte : un badge de statut, un sélecteur rapide (📋 À faire / ⚡ En cours / ✅ Terminé / ❌ Annulé, **sans « Bloqué »**) et « ✓ ». Les boutons d'en-tête sont « 🤖 Import réunion », « 📋 Plusieurs tâches (template) » et « ➕ 1 tâche ». Preuve : `04-edit-clients-templates.js:1032-1107`.

#### 1.4 « ➕ 1 tâche » / « + Nouvelle Tâche » (fenêtre « ✅ Nouvelle Tâche »)

- **Chemins** : Fiche projet › en-tête › **➕ 1 tâche**, ou Terrain › Tâches › **+ Nouvelle Tâche**. Les deux ouvrent la même fenêtre (`public/index.html:812-848`).
- **Champs** :

| Libellé | Obligatoire | Format / valeurs | Remarque |
|---|---|---|---|
| Projet | **Oui** (refusé sinon) | liste « Nom (N° interne) » | **Pas présélectionné**, même depuis la fiche projet (`03-create-forms.js:776-786`, `667-677`) |
| Titre * | Oui | texte | |
| Date | **Oui** (refusé sinon) | date, préremplie à aujourd'hui | `03-create-forms.js:786` |
| Assigné à | Non | liste des utilisateurs | |
| Heure début / Heure fin | Non | heure, 08:00 / 12:00 par défaut | **Enregistrées mais affichées nulle part** (ni sur la carte, ni dans la fiche) |
| Priorité | — | **Faible / Normal / Haute / Critique** (Normal par défaut) | Libellés sans émoji, « Haute » (ailleurs « Élevé ») |
| Statut | — | À faire / En cours / Terminé | Ni « Bloqué » ni « Annulé » |
| Description | Non | texte | |

- **Bouton** : **« ✅ Créer »**. Message d'erreur : « Titre, projet et date obligatoires ». Réussite : « Tâche créée ✅ » (`03-create-forms.js:18-35`).
- **Résultat** : la tâche est créée **sans étape** (dans le kanban projet masqué, elle tomberait dans « (Sans étape) »).

#### 1.5 Fiche tâche (clic sur une carte)

Fenêtre « ✅ <titre> » avec la date et l'assigné en sous-titre. Trois onglets (`05-templates-trucks-reports.js:454-547`).

- **« ✏️ Modifier »** :
  - Statut : 📋 À faire / ⚡ En cours / ✅ Terminé / 🔴 Bloqué (pas « Annulé »).
  - Priorité : 🟢 Faible / 🔵 Normal / 🟠 Élevé / 🔴 Critique.
  - Date, Assigné à (« — Non assigné — »), Description.
  - Le **titre n'est pas modifiable**. Les heures début / fin, les heures estimées et réelles ne sont pas affichées.
- **« 📊 Avancement »** : « Ajouter un point d'avancement » + « + Ajouter ».
  - Le commentaire est enregistré (`src/routes/tasks.ts:70-78`), mais **les commentaires existants ne sont jamais réaffichés** quand on rouvre la fiche : il n'existe aucune lecture des commentaires (`05-…:560-584`).
  - Si l'enregistrement échoue, le message est « Commentaire ajouté (local) », alors que **rien n'est sauvegardé**.
- **« 📸 Photos »** : « 📸 Ajouter photos / fichiers » (images ou PDF, plusieurs à la fois).
  - Les fichiers sont envoyés en ligne, mais **ne sont pas rattachés à la tâche** : ils sont **perdus à la réouverture** (`05-…:586-610` ; envoi générique `src/routes/upload.ts:10-16`, aucune photo de tâche n'est créée).
- **Boutons** :
  - « 🗑️ Supprimer » (confirmation « Supprimer cette tâche ? ») : suppression **définitive**.
  - « Fermer ».
  - « 💾 Sauvegarder » (message « Tâche mise à jour ✅ ») (`04-…:1125-1145`).

#### 1.6 « 📋 Plusieurs tâches » (fenêtre « 📋 Ajouter des tâches depuis le template »)

- **Chemin** : Fiche projet › en-tête › **📋 Plusieurs tâches** (`index.html:361`). Message si aucun projet n'est ouvert : « Ouvre un projet avant ».
- **Déroulé** (`04-edit-clients-templates.js:168-398`) :
  1. Les templates s'affichent groupés **par catégorie (étape)**. Chaque groupe a un compteur « n tâches », des boutons ✅ / ☐ (tout cocher / tout décocher) et ▼ / ▶ (plier / déplier).
  2. **Rien n'est coché** au départ.
  3. Recherche « 🔍 Rechercher une tâche (titre ou étape)... » (sans tenir compte des accents), avec le résultat « x / y tâche(s) correspondent à … ».
  4. Pour chaque ligne : une date et un assigné (« — Aucun — »), facultatifs.
  5. Raccourci : « — Assigner toutes les tâches cochées à... — » + « Appliquer ».
  6. Compteur « x / y tâche(s) cochée(s) ». Bouton **« ➕ Ajouter les tâches cochées »** (inactif si rien n'est coché).
- **Résultat** :
  - Chaque tâche est créée avec le titre du template, l'**étape** = nom de la catégorie, le statut « À faire » et la priorité « normal ».
  - **La priorité, la durée et la description du template ne sont pas reprises.**
  - Sans date choisie, la tâche est datée d'**aujourd'hui** (`src/routes/tasks.ts:33-39`).
  - Messages : « n tâche(s) ajoutée(s) au projet ✅ » / « … échec(s) ».
- **Icônes des étapes** : elles sont écrites en dur dans l'écran et ne viennent pas de la catégorie. Exemple : PRE-PROD = 🔧 dans cette fenêtre, 📐 dans l'administration (`04-…:155-159` vs `src/routes/taskTemplates.ts:368`).

#### 1.7 Nouveau projet › « 📋 Tâches à créer »

- **Chemin** : Projets › Nouveau projet (fenêtre « 🏗️ Nouveau Projet »), bloc « 📋 Tâches à créer — Cochez, assignez et datez chaque tâche » (`index.html:673-697`).
- **Attention** : **tous les templates sont cochés par défaut** (`04-…:427`, attribut `checked`, et la liste est reconstruite à chaque ouverture `03-…:811`). Sans action, la création d'un projet crée **toutes les tâches du catalogue** (50 avec le catalogue Viewbox standard).
- **Outils** : « ✅ Tout » / « ☐ Aucun », « Appliquer à tout : » (une date et un assigné pour toutes les lignes), et une date / un assigné (« — Équipe — ») par ligne.
- **Résultat** (`02-detail-loaders.js:1150-1170`) :
  - Sans date, la tâche prend la **date de début d'installation**.
  - Priorité « normal ».
  - L'étape est écrite dans la description (« Stage: … ») et **pas dans le champ étape** : ces tâches tomberaient dans « (Sans étape) » du kanban projet. C'est différent de « 📋 Plusieurs tâches ».
- **En modification d'un projet**, le bloc reste affiché (tout coché), mais il est **ignoré** : aucune tâche n'est créée (`02-…:1140-1147`).

#### 1.8 « 🤖 Import réunion » (existe, mais inaccessible aujourd'hui)

- **Où** : uniquement dans l'onglet projet « ✅ Tâches », qui est masqué (`04-…:1055`).
- **Fenêtre** « 🤖 Import tâches depuis réunion — Colle le compte-rendu — l'IA crée les tâches ». Bouton « 🤖 Analyser et créer le draft » (`04-…:1147-1167`).
- **Ce que fait l'IA** (`04-…:1169-1263`) : elle lit le compte-rendu collé et la liste des membres de l'équipe. Elle propose un brouillon de tâches : titre (80 caractères maximum), description, personne assignée (si elle est citée), priorité déduite du contexte (« urgent » → haute / critique), échéance (si elle est citée) et heures estimées.
- **Avant validation**, l'utilisateur peut modifier le titre, la priorité (🟢 Faible / 🔵 Normal / 🟠 Élevé / 🔴 Critique), l'assigné (« — Non assigné — ») et la « Deadline ».
- **Validation** : « ✅ Créer n tâche(s) » (`05-…:1-22`). L'étape n'est pas renseignée, et les heures estimées par l'IA ne sont pas enregistrées.

#### 1.9 Lien avec les Daily Reports

- Dans le Daily Report, le bloc « ✅ Avancement tâches » liste les tâches du projet (sauf les annulées), groupées En cours / À faire / Bloqué / Terminé.
- Cocher une tâche la marque **terminée** ; « ▶ En cours » la passe en cours.
- Ces changements sont appliqués **à l'enregistrement du rapport** (« … · n tâche(s) mises à jour ») — `03-create-forms.js:286-339`, `529-535`.
- **À noter** : ce bloc est **différent** du tableau « ⏱️ Heures par tâche ». Ce tableau-là utilise les **templates** (Installation / Démontage), pas les tâches du projet (§ 3).

---

### 2. Admin › 📋 Templates tâches

**Chemin** : Menu › Admin › 📋 Templates tâches. Titre « 📋 Templates de Tâches — Bibliothèque de tâches réutilisables par catégorie » (`index.html:494-507`). Le titre de la barre du haut affiche « templates » (en minuscules, en anglais), car ce libellé manque dans la liste des titres de page (`01-core.js:515-521`).

Boutons d'en-tête : « 🔍 Diag », « + Catégorie », « 📥 Import Excel », « 🔄 Viewbox standard », « + Template ».

#### 2.1 Affichage

- Une carte par catégorie : icône, nom en couleur, « n template(s) », et les boutons « + Template » et « 🗑️ ».
- Chaque template montre : titre, « ⏱️ 4h · normal », puis « · 🏗️ Installation » ou « · 🔨 Démontage » si une phase est définie. Boutons ✏️ (modifier) et 🗑️ (supprimer) (`05-templates-trucks-reports.js:27-74`).
- La priorité est affichée **en anglais brut**.

#### 2.2 Catégories (« + Catégorie »)

- Fenêtre « 🗂️ Nouvelle Catégorie » : **Nom \*** (obligatoire, « Nom obligatoire »), **Icône** (📋 par défaut, saisie libre), **Couleur** (#4895ef par défaut), **Description**. Bouton « ✅ Créer » (`05-…:186-218`).
- **Pas de phase sur une catégorie** : la phase se règle template par template.
- **Renommer / modifier une catégorie** : **impossible depuis l'écran** (aucun bouton, alors que le serveur le permet — `src/routes/taskTemplates.ts:37-46`).
- **Supprimer** (🗑️) : confirmation « Supprimer cette catégorie et tous ses templates ? ». En réalité la catégorie est seulement **masquée** et ses templates restent en base (`taskTemplates.ts:48-57`).
- **Ordre** des catégories : non modifiable à l'écran.

#### 2.3 Templates (« + Template » / ✏️)

- **Création** — fenêtre « 📋 Nouveau Template » :
  - **Catégorie \*** et **Titre \*** (message « Catégorie et titre obligatoires »).
  - Description.
  - **Durée (heures)** : 4 par défaut, pas de 0,5, minimum 0,5.
  - **Priorité** : 🟢 Faible / 🔵 Normal / 🟠 Élevé / 🔴 Critique.
  - **Phase (rapports journaliers)** : « — Aucune (n'apparaît pas dans les rapports) — » / 🏗️ Installation / 🔨 Démontage.
  - Bouton « ✅ Créer » (`05-…:76-130`).
- **Modification** — fenêtre « ✏️ Modifier Template » : Titre, Durée, Priorité, Phase ; boutons « 🗑️ Supprimer », « 💾 Sauvegarder ». On **ne peut pas** y changer la catégorie ni la description (`05-…:132-177`).
- **Suppression** : confirmation « Supprimer ce template ? ». Le template est masqué (`taskTemplates.ts:138-147`).
- **Ce que ça alimente** :
  1. la liste « Tâches à créer » (Nouveau projet) et « 📋 Plusieurs tâches » (titre + étape seulement) ;
  2. le tableau « ⏱️ Heures par tâche » des Daily Reports : seuls les templates qui ont une **phase** y apparaissent, selon la phase choisie dans le rapport (`03-create-forms.js:80`, `04-…:671-682`).
- **Durée et priorité** d'un template : **utilisées nulle part** dans les écrans actuels.

#### 2.4 « 📥 Import Excel » (fenêtre « 📥 Import Templates depuis Excel/CSV »)

Preuve : `05-…:612-799`, serveur `taskTemplates.ts:161-288`.

- **Format affiché à l'écran** : « Colonne A = Catégorie, Colonne B = Titre de la tâche, Colonne C = Durée (h), Colonne D = Priorité (low/normal/high/critical) ». Exemple « Installation | Montage structure aluminium | 6 | high ».
- **Format réellement lu** : une ligne par template, les colonnes séparées par **point-virgule, virgule ou tabulation** (au choix).

  | Col. | Contenu | Obligatoire | Si vide / invalide |
  |---|---|---|---|
  | A | Catégorie | Oui (ligne ignorée sinon) | — |
  | B | Titre | Oui (ligne ignorée sinon) | — |
  | C | Durée en heures (nombre, point décimal) | Non | 4 |
  | D | Priorité : `low` / `normal` / `high` / `critical` (**en anglais**) | Non | `normal` |

  - **Ligne d'en-tête** : sautée seulement si la 1re colonne vaut exactement « Catégorie / Categorie / Category / Stage / Step / Étape / Etape ». Exemple d'en-tête accepté : `Catégorie;Titre;Durée(h);Priorité`.
  - Les guillemets en début et fin de valeur sont retirés. **Une virgule dans un titre coupe la ligne** : les guillemets ne protègent pas.
  - **Impossible d'importer** la **Phase** ou la **Description**. Les templates importés n'apparaissent donc pas dans « Heures par tâche » tant qu'on n'a pas ajouté la phase à la main (✏️).
- **Types de fichier** : le sélecteur accepte `.xlsx`, `.xls` et `.csv`, mais le fichier est **lu comme du texte**. Un **vrai fichier Excel (.xlsx / .xls) ne peut pas être lu** : il faut l'**enregistrer en CSV** (de préférence « CSV UTF-8 », sinon les accents risquent d'être abîmés) ou **copier-coller** les cellules dans la zone « Option 2 — Coller le contenu CSV » (le copier-coller depuis Excel donne des tabulations, ce qui est accepté). Preuve : `05-…:662-675` (lecture en texte).
- **Boutons** :
  - « 👁️ Prévisualiser » et « 📥 Importer » font **la même chose** : ils affichent l'aperçu « n tâche(s) dans m catégorie(s) » (`05-…:733-735`).
  - L'import réel se fait avec **« ✅ Confirmer l'import »**.
- **Doublons** :
  - Une catégorie **de même nom** (sans tenir compte des majuscules) est **réutilisée**, et réaffichée si elle avait été supprimée.
  - Un template **de même titre dans la même catégorie** (sans tenir compte des majuscules), encore actif, est **ignoré**.
  - Les nouvelles catégories reçoivent l'icône 📋 et une couleur grise.
- **Message final** : « ✅ n tâche(s) créée(s) · x catégorie(s) créée(s) · y catégorie(s) réutilisée(s) · z ignorée(s) (déjà en base) · ⚠️ k échec(s) (F12) ».
- L'import **ajoute** : il ne remplace ni ne supprime rien.

#### 2.5 « 🔄 Viewbox standard »

- **Info-bulle** : « Recharge la liste standard des 52 tâches Viewbox ».
- **Confirmation** : « ⚠️ Cela va EFFACER tous les templates et catégories actuels puis recréer les 52 tâches Viewbox standard. Continuer ? » (`05-…:801-817`).
- **Ce que ça fait réellement** (`taskTemplates.ts:360-397`) :
  - Suppression **définitive** de **toutes** les catégories et de **tous** les templates, y compris ceux créés à la main ou importés.
  - Puis recréation de **7 catégories et 50 templates** (et non 52). Détail : To Do 2, PRE-PROD 10, Booking Supplier 10, Warehouse Preparation 1, Installation 13, Dismantling 11, Come Back Warehouse 3.
  - Tous les templates sont recréés avec 4 h et la priorité normal. **Installation** → phase Installation, **Dismantling** → phase Démontage, les autres sans phase.
  - **Destructif et irréversible.**
- **Réservé à l'admin** côté serveur, mais le bouton est **visible par tous**. Un non-admin obtient « ❌ Échec reset : Réservé aux admins ».
- **Effets collatéraux** :
  - Les tâches déjà créées dans les projets ne sont pas touchées (titre et étape sont copiés en texte).
  - En revanche, les **heures déjà saisies** dans les Daily Reports perdent leur lien avec leur template. Dans « Temps par tâche », elles apparaissent alors « (hors templates) », sans icône ni catégorie.
  - Le message de réussite annonce le nombre réel (« ✅ 50 tâches Viewbox recréées (7 catégories) »), ce qui contredit le « 52 » de la confirmation.

#### 2.6 « 🔍 Diag »

- Bouton gris, info-bulle « Diagnostic état BD templates » (`index.html:498`).
- Il appelle une fonction **qui n'existe pas côté serveur** : le bouton est **cassé** et affiche « Erreur réseau » puis « Diag impossible : erreur » (`05-…:819-842` ; aucune route correspondante dans `src/routes/taskTemplates.ts`).
- **À retirer de l'interface et ne pas montrer en formation.**

---

### 3. Lien entre templates et « ⏱️ Heures par tâche » (Daily Reports)

- Dans le Daily Report, le bloc « ⏱️ Heures par tâche » propose deux choix : « 🏗️ Installation » / « 🔨 Démontage » (`index.html:868-889`).
- Le choix affiche **les templates de cette phase**. Pour chacun, on saisit les **heures** et le **nombre d'hommes**. On peut aussi ajouter une ligne libre : « Ajouter une autre tâche... » + « + Ajouter ».
- Ces lignes sont la **seule source** de l'analyse « ⏱️ Temps par tâche » du Rapport IA (`src/services/taskHours.ts:22-44`, `src/routes/projects.ts:626-633`).

---

### 4. 📊 Rapport IA

#### 4.1 Accès

- **Fiche projet › en-tête › 📊 Rapport IA** (`index.html:358`). C'est le seul accès.
- Fenêtre « 📊 Générer un Rapport — Choisissez les sections à inclure ». Le sous-titre devient « Projet : <nom> » (`05-…:1010-1041`).
- Aucune restriction de rôle dans le code : toute personne connectée qui ouvre un projet peut générer un rapport.

#### 4.2 Les deux types

| Type | Libellé à l'écran | Différences réelles dans le document |
|---|---|---|
| `full` (par défaut) | « 📋 Rapport complet — Toutes les données du projet » | Titre « Rapport de Projet ». Tout est inclus. |
| `client` | « 🤝 Présentation client — Format soigné pour le client » | Titre « Rapport Client ». **La mise en page est identique.** Différences : section Tâches **sans les tâches terminées** et **sans les assignés** ; sections **Daily Reports** et **Tickets SAV** **omises même si elles sont cochées**. Preuve : `06-time-analysis.js:711`, `717`, `814`, `864`. |

**Attention, Présentation client** : les **e-mails et téléphones de l'équipe** (Vue d'ensemble), le **chauffeur et son téléphone** (Logistique), les transports et hôtels (Bookings), tous les fichiers du projet et les chiffres internes (heures-hommes) **restent inclus** si leur section est cochée.

#### 4.3 Sections (ordre dans le document) et données utilisées

L'**en-tête** est toujours présent : nom du projet, client, ville, n° interne, statut du projet (**code brut en anglais**, ex. `installation`), barre d'avancement, et les chiffres :
- « Avancement » = % de la **check-list** du projet, pas des tâches (`src/routes/projects.ts:61-73`) ;
- « Tâches » = terminées / total ;
- « Ouvriers » = nombre prévu ;
- tickets non résolus (si le projet en a).

| # | Section (case dans la fenêtre) | Cochée par défaut | Contenu dans le document | Source |
|---|---|---|---|---|
| 1 | 📋 **Vue d'ensemble** — « Infos projet, dates, équipe » | Oui | Dates de début et de fin d'installation, client, démontage (début → fin), adresse, ouvriers ; équipe (nom, rôle, ⭐ = responsable, e-mail, téléphone) ; « 📝 Notes complémentaires » : **🌐 Notes globales**, **🔨 Notes installation**, **🔧 Notes démontage** | `06-…:632-681` |
| 2 | 🤖 **Résumé IA** — « Analyse et points clés » | Oui | « Résumé Exécutif » : texte rédigé par l'IA dans la langue choisie, 3-4 paragraphes (état / points forts / risques / prochaines étapes) | `06-…:414-457`, `683-693` |
| 3 | ✅ **Tâches** — « Statut et avancement » | Oui | Compteurs Terminé / En cours / À faire / Bloqué, puis la liste (titre, date, statut, prénom de l'assigné) | `06-…:695-720` |
| 4 | ⏱️ **Temps par tâche** — « Heures × ouvriers par catégorie » | Non | « Temps passé par tâche » : total général en heures-hommes, période, encadré « 🤖 Analyse IA » (3-5 phrases), puis un bloc par tâche (catégorie, % du total, tableau Quand / Tâche / Durée × Ouvriers / Total) | `06-…:722-811` |
| 5 | 📓 **Daily Reports** — « Journal journalier » | Oui | Les **7 rapports les plus récents** (date, ouvriers, météo, entrées horodatées, notes générales), puis « ... et n rapport(s) supplémentaire(s) ». Omis en Présentation client | `06-…:813-842` |
| 6 | 🧾 **Handover** — « Rapport de réception » | Non | Par handover : nom du client, date, statut (Signé…), zones colorées OK / remarque / défaut, notes | `06-…:844-861` |
| 7 | 🛠️ **Tickets SAV** — « Incidents et résolutions » | Non | Titre, emplacement, statut. Omis en Présentation client | `06-…:863-879` |
| 8 | 📸 **Visites client** — « Points et remarques » | Non | Les **10 premiers** points de visite (titre, zone, En cours / Résolu) | `06-…:881-899` |
| 9 | 🚛 **Logistique** — « Camions et machines » | Non | Tableau Véhicule / Chauffeur (+ téléphone) / Chargement entrepôt / Départ / Arrivée site / Statut. **Les véhicules « Livré » et « Retourné » sont exclus** | `06-…:406`, `901-940` |
| 10 | 💬 **Commentaire** — « Note personnalisée » | Non | Le texte de « 💬 Commentaire personnalisé » (encadré jaune). Ignoré si la case n'est pas cochée ou si le texte est vide | `06-…:942-951` ; `index.html:1325-1333` |
| 11 | ✈️ **Bookings** — « Transport & hôtels équipe » | Non | « 🚆 Transports équipe » (personne, phase, dates sur site, aller / retour, pièce jointe, notes) et « 🏨 Hôtels » (adresse, dates, référence, occupants, confirmation, notes) | `06-…:953-1029` |
| 12 | 📁 **Fichiers projet** — « Photos et documents » | Non | Toutes les photos du projet en vignettes, chaque PDF affiché page par page (10 pages max) avec le lien « Original ↗ », les autres documents en lien « Voir ↗ » | `06-…:1031-1097` |

En bas du document : « Généré le <date> par VEM — ViewBox Event Manager » et le n° interne.

#### 4.4 Notes du projet qui alimentent le rapport

| Champ du formulaire projet (Nouveau / ✏️ Modifier) | Utilisé dans le rapport ? | Où |
|---|---|---|
| « Description / Instructions spéciales » | **Non**, ni dans le document ni dans le résumé IA | — (`index.html:634` ; aucune utilisation dans `06-…`) |
| « 🌐 Notes globales du projet » | Oui | Vue d'ensemble › Notes complémentaires › 🌐 Notes globales |
| « 🔨 Notes installation » | Oui | Vue d'ensemble › 🔨 Notes installation |
| « 🔧 Notes démontage » | Oui | Vue d'ensemble › 🔧 Notes démontage |

Le formulaire projet l'annonce lui-même : « 📝 Notes complémentaires — Visibles dans le Rapport IA (section Vue d'ensemble) » (`index.html:638-640`). Ces trois notes **ne sont pas transmises au résumé IA** : le résumé se base sur le statut, l'avancement, les dates, l'équipe, le nombre d'ouvriers, les tickets ouverts et critiques, le dernier Daily Report, les handovers signés et les points de visite en cours (`06-…:425-445`).

#### 4.5 « ⏱️ Temps par tâche » — panneau d'analyse

- Le panneau apparaît quand la case est cochée : « ⏱️ Analyse temps par tâche — Reprend les heures et le nombre d'hommes saisis tâche par tâche dans les rapports journaliers (Installation / Démontage) et ajoute une courte synthèse IA. » Bouton « 🤖 Lancer / relancer l'analyse » (`index.html:1300-1320`).
- **Données** : les lignes « ⏱️ Heures par tâche » de **tous** les Daily Reports du projet. Les chiffres sont **exacts** (aucun calcul par l'IA). L'IA rédige seulement 3-5 phrases de synthèse (`06-…:5-116`).
- **Regroupement** : par tâche (template ou ligne libre). Une ligne = une journée (« Journée du AAAA-MM-JJ »). Heures-hommes = heures × hommes. Les tâches sont triées de la plus longue à la plus courte. Une ligne libre est marquée « (hors templates) ».
- **Correction avant export** : on peut modifier la durée et le nombre d'ouvriers ou supprimer une ligne (✕), et les totaux se recalculent. Ces corrections **valent uniquement pour ce rapport** : les Daily Reports ne sont pas modifiés (`06-…:210-239`).
- **Si aucune heure n'a été saisie** : « ⚠️ Aucune heure saisie — remplis le tableau "Heures par tâche" dans les rapports journaliers ».
- **Lancement automatique** : si la case est cochée sans avoir lancé l'analyse, elle se lance seule à la génération (`06-…:723-728`).
- **Texte d'aide obsolète** : « 💡 Les champs bordure orange indiquent que l'IA n'a pas trouvé le nombre d'ouvriers — complète-les. » (`06-…:204`). L'IA ne cherche plus ce nombre.

#### 4.6 Langue

- Choix « Langue : » **Français** (par défaut) / **English** / **Nederlands** (`index.html:1335-1340`).
- Sont traduits : le résumé IA, le titre du rapport, les noms de section principaux et les statuts.
- **Restent en français** dans les trois langues : « Vue ensemble » (aussi en NL), « Date début / fin », « Ouvriers », « Adresse », « Démontage », toute la section Temps par tâche, la date des Daily Reports (format français), « Fichiers du projet », les libellés Logistique et Bookings, « En cours ». Le statut du projet reste un code anglais (`06-…:567-581`, `625-644`, `796`, `827`).

#### 4.7 « 👁️ Prévisualiser » vs « 📄 Générer PDF »

- Les deux boutons ouvrent **un nouvel onglet** (« ⏳ Génération du rapport en cours… »), qui se remplit avec le rapport. Si le navigateur bloque les fenêtres : « Autorise les popups pour générer le rapport » (`06-…:368-375`).
- **👁️ Prévisualiser** : le rapport s'affiche simplement dans l'onglet.
- **📄 Générer PDF** : même affichage, puis la **fenêtre d'impression du navigateur** s'ouvre automatiquement. C'est à l'utilisateur de choisir « Enregistrer au format PDF » : **aucun fichier n'est téléchargé** directement (`06-…:1114-1119`).
- **Dans les deux cas**, un PDF du rapport est **enregistré automatiquement dans 📁 Fichiers du projet** (catégorie « rapport_ia », nom `Rapport_<n°>_<date>_<horodatage>.pdf`). Message « Rapport enregistré dans les fichiers du projet ✅ », ou « Rapport généré mais non sauvegardé dans le projet » en cas d'échec (`06-…:323-341`, `1125`).
- **Conséquences** :
  - chaque aperçu ajoute un fichier ;
  - un rapport suivant qui coche « 📁 Fichiers projet » ré-affiche les pages des rapports précédents.
- **Envoi par e-mail** : **aucun** depuis cette fenêtre.
- **Durée** : « jusqu'à une minute si l'analyse IA est incluse ».

#### 4.8 Autre « rapport projet » (à ne pas confondre)

L'**assistant** (bulle de chat, rôles admin / chef de projet / responsable technique / chef de chantier) peut produire un « rapport complet » par une autre voie, avec le bouton « 📄 Télécharger le PDF ».
- Son contenu : équipe, logistique, tâches (dont **en retard**), tickets, rapports journaliers et synthèse IA.
- Il propose une langue FR / EN au téléchargement.
- Il est rangé dans les fichiers du projet (catégorie « rapport_projet »).

Preuves : `src/services/assistantService.ts:862-877`, `src/services/projectReportService.ts`, `src/routes/projects.ts:597-624`, `public/js/01-core.js:443-456`.

---

### 5. Restrictions de rôle (périmètre)

| Élément | Restriction | Preuve |
|---|---|---|
| Lecture des tâches | Le rôle « worker » ne voit que ses tâches assignées | `src/routes/tasks.ts:16` |
| Création / modification / suppression de tâches, commentaires | Aucune restriction (toute personne connectée) | `src/routes/tasks.ts` |
| Menu Admin › Templates tâches | Visible par tous (aucun masquage selon le rôle) | `index.html:177-179` |
| Catégories, templates, import | Aucune restriction serveur | `src/routes/taskTemplates.ts` |
| 🔄 Viewbox standard | **Admin seulement** (côté serveur ; bouton visible par tous) | `taskTemplates.ts:362` |
| 📊 Rapport IA | Aucune restriction | `src/routes/projects.ts`, `src/routes/ai.ts` |
| Assistant (rapport projet, création de tâches) | Admin, chef de projet, responsable technique, chef de chantier | `src/index.ts:123` |

---

### 6. Anomalies et incohérences (UX)

1. **Onglet projet « ✅ Tâches » masqué** alors que « ➕ 1 tâche », « 📋 Plusieurs tâches » (en-tête projet) et Terrain › ✅ Tâches restent visibles. Les tâches créées depuis le projet n'y sont plus visibles. « 🤖 Import réunion » est inaccessible.
2. **Nouveau projet** : toutes les tâches template sont **cochées par défaut** (50 tâches créées si on ne décoche pas), alors que le suivi par tâches est abandonné.
3. **Priorités** :
   - libellés différents selon l'écran : « Faible / Normal / Haute / Critique » (Nouvelle tâche) contre « 🟢 Faible / 🔵 Normal / 🟠 Élevé / 🔴 Critique » (fiche, templates, import réunion) ;
   - codes anglais bruts (`normal`, `high`) sur les cartes et dans les templates ;
   - valeurs anglaises obligatoires dans l'import CSV.
4. **Statuts** différents selon l'écran :
   - Nouvelle tâche = 3 statuts ;
   - fiche = 4, sans « Annulé » ;
   - sélecteur du kanban projet = 4, sans « Bloqué » ;
   - kanban global : pas de colonne Annulé, les tâches annulées disparaissent.
5. **Kanban global** : aucun filtre, aucun nom de projet sur les cartes, pas de glisser-déposer.
6. **Fiche tâche** :
   - commentaires jamais réaffichés ;
   - photos jamais rattachées (perdues) ;
   - faux succès « Commentaire ajouté (local) » ;
   - titre non modifiable ;
   - heures début / fin saisies mais jamais affichées.
7. **« ➕ 1 tâche » depuis un projet** : le projet n'est pas présélectionné.
8. Trois façons de créer des tâches depuis les templates, avec **trois comportements différents** :
   - étape enregistrée ou mise dans la description ;
   - date par défaut = aujourd'hui ou début d'installation ;
   - priorité, durée et description du template ignorées.
9. **« 🔍 Diag »** : bouton de débogage visible par tous **et cassé**.
10. **« 🔄 Viewbox standard »** :
    - annonce 52 tâches, en recrée 50 ;
    - efface **tout** sans retour possible, y compris les templates importés ou créés à la main ;
    - visible par tous mais réservé à l'admin ;
    - détache les heures déjà saisies dans les Daily Reports (« hors templates »).
11. **Import Excel** :
    - le .xlsx et le .xls sont proposés mais illisibles (CSV ou copier-coller seulement) ;
    - « 📥 Importer » ne fait qu'un aperçu ;
    - impossible d'importer la phase ou la description ;
    - une virgule dans un titre casse la ligne ;
    - risque d'accents abîmés avec un CSV Windows.
12. **Catégories** : pas de renommage ni de tri possible. Le message « Supprimer … et tous ses templates » ne correspond pas à ce qui se passe (la catégorie est seulement masquée).
13. Le titre de la page Templates s'affiche « templates » dans la barre du haut.
14. Les icônes d'étape sont écrites en dur dans les fenêtres de sélection (PRE-PROD 🔧 contre 📐).
15. **Rapport IA** :
    - le PDF passe par la fenêtre d'impression (pas de téléchargement direct) ;
    - chaque aperçu est archivé dans les fichiers du projet ;
    - un rapport avec « Fichiers projet » ré-imprime les anciens rapports ;
    - traductions EN / NL partielles ;
    - statut du projet en code anglais ;
    - « Présentation client » expose les e-mails et téléphones de l'équipe et du chauffeur ;
    - la Logistique exclut les véhicules Livré / Retourné ;
    - « Description / Instructions spéciales » du projet n'est jamais reprise ;
    - le texte d'aide sur « l'IA n'a pas trouvé le nombre d'ouvriers » est obsolète ;
    - les Daily Reports sont limités aux 7 plus récents et les visites aux 10 premières, sans le dire à l'utilisateur.
16. Deux « rapports projet » différents coexistent : 📊 Rapport IA (fiche projet) et rapport de l'assistant. Leur contenu et leur format sont différents.

---

### 7. Questions pour le product owner

1. Les tâches sont-elles **abandonnées** (on masque aussi Terrain › Tâches, « ➕ 1 tâche », « 📋 Plusieurs tâches », la section Tâches du Rapport IA et le bloc « Avancement tâches » du Daily Report) ou **conservées** (on réaffiche l'onglet) ? Que doit-on enseigner ?
2. À la création d'un projet, faut-il laisser toutes les tâches cochées par défaut ? Les décocher ? Supprimer le bloc ?
3. Le menu Admin › Templates tâches doit-il être réservé à l'admin / au responsable technique ? Faut-il le renommer, puisque son usage principal est désormais le tableau « Heures par tâche » ?
4. « 🔄 Viewbox standard » : le garder ? Avec quel nombre officiel de tâches (50 ou 52) ? Faut-il le cacher aux non-admins ?
5. « 🔍 Diag » : peut-on le retirer ?
6. Import : faut-il un vrai support Excel et une colonne Phase ?
7. Rapport IA : le PDF doit-il être un **vrai téléchargement** ? Faut-il **archiver aussi les aperçus** ? Faut-il **exclure les anciens rapports** de la section Fichiers ? Faut-il **masquer les coordonnées** en Présentation client ? Faut-il un **envoi par e-mail** ?
8. Faut-il ajouter « Description / Instructions spéciales » au Rapport IA ?
9. La traduction complète EN / NL du Rapport IA est-elle attendue ?
10. Fiche tâche : faut-il réparer les commentaires et les photos, ou retirer ces onglets ?

---

### 8. Notes techniques (ne pas mettre en formation)

- **Onglet masqué** : `public/index.html:368`, à retirer `display:none` pour le remettre. Kanban projet : `public/js/04-edit-clients-templates.js:1032-1107`.
- **Routes concernées** :
  - `/api/v1/tasks` (GET / POST / PATCH / DELETE, POST `/:id/comments`) — `src/routes/tasks.ts`. Pas de lecture des commentaires, pas de route pour les photos de tâche (le modèle `TaskPhoto` existe, `prisma/schema.prisma:399-410`, mais il est inutilisé).
  - PATCH `/tasks/:id` transmet le corps de la requête tel quel à la base (`tasks.ts:58`).
- **Templates** : `src/routes/taskTemplates.ts`.
  - Route `/apply` non utilisée par le frontend. Elle écrit `assigneeId` au lieu de `assignedToId` (`:346`), ce qui la ferait échouer.
  - `/reset` : `deleteMany` sur les templates et les catégories ; le lien `daily_report_task_hours.task_template_id` passe à `ON DELETE SET NULL` (`src/utils/migrations.ts:750-752`).
  - `/diag` n'existe pas : la requête tombe sur le catch-all `app.get('*')` qui renvoie `index.html` (`src/index.ts:156`) ; le `r.json()` échoue, ce qui donne « Erreur réseau ».
- **IA** :
  - Résumé exécutif, synthèse Temps par tâche et Import réunion passent tous par `POST /api/v1/ai/parse-daily` avec `mode: 'text'` ou `mode: 'json'`. Le prompt est construit **côté client** (`src/routes/ai.ts:22-61`) : n'importe quel utilisateur connecté peut envoyer un prompt libre au modèle.
  - Le résumé IA est découpé en paragraphes sur `' | '` (`06-…:690`).
- **Données Temps par tâche** : `GET /projects/:id/task-hours` → `src/services/taskHours.ts` (table `daily_report_task_hours`).
- **Archivage du rapport** : capture html2canvas + jsPDF, envoyée sur `POST /upload/project-file/:projectId`, catégorie `rapport_ia` (`06-…:265-341`, `src/routes/upload.ts:52-58`). La limite de taille du stockage de fichiers (10 Mo) peut faire échouer l'archivage d'un gros rapport (À confirmer).
- **Rapport de l'assistant** : `GET /projects/:id/report/pdf` (pdfkit, `generateProjectReportPdf`), archivé en `rapport_projet`.
- **Icônes d'étape** codées en dur : `STAGE_ICONS` (`04-…:155-159`) et `STAGE_ICONS_LOCAL` (`04-…:1077`).
- `pgTitles` sans clé `templates` : `01-core.js:515-521`.
- Le sélecteur de projet du rapport (`report-project-row` / `report-project-select`, `05-…:1022-1031`) n'existe pas dans `index.html` : c'est du code mort, sans effet puisque le rapport s'ouvre toujours depuis une fiche projet.

---

## II.5 — Audit 5 — Onglet projet « 📋 Briefing » (mode classique, Briefing Studio, 🪄 Auto-générer, PDF & langue)

Périmètre lu intégralement : `public/js/11-briefing.js` (l. 86-1163 pour le briefing ; l. 1-84 = onglet Logistique, hors périmètre), `public/js/12-briefing-studio-core.js`, `public/js/13-briefing-studio-slides.js`, `public/js/14-briefing-autogen.js`, `src/routes/briefing.ts`, `src/services/briefingAI.ts`, modèle `Briefing` (`prisma/schema.prisma:888-901`), plus les points d'appel dans `public/index.html`, `public/js/01-core.js`, `public/js/02-detail-loaders.js`, `public/js/10-logistics-bookings.js`, `src/routes/projects.ts`, `src/routes/settings.ts`.
Audit en lecture seule, aucun fichier du dépôt modifié.

---

### 0. Vue d'ensemble (à retenir pour la formation)

- Un projet peut avoir **plusieurs briefings** (liste de cartes). Chaque briefing contient **deux contenus indépendants** :
  - le **mode classique** (slides faites de « blocs » : texte, contacts, infos projet…) → impression via le navigateur ;
  - le **Briefing Studio** (éditeur visuel de slides façon Canva, format 16:9) → export PDF FR ou EN.
- On ouvre **toujours d'abord le mode classique** ; le bouton « 🎨 Studio » bascule vers le Studio.
- Deux générateurs automatiques, à ne pas confondre :
  - « ✨ Générer avec l'IA » (liste des briefings) → crée un **nouveau briefing classique** avec un texte d'intro et un planning rédigés par l'IA ;
  - « 🪄 Auto-générer » (dans le Studio) → **remplace toutes les slides du Studio** par un jeu de slides construit à partir des données du projet, **sans IA**.
- Pas d'enregistrement automatique : il faut cliquer « 💾 Enregistrer » (classique) ou « 💾 Sauvegarder » (Studio).
- Message clé : **plus le projet est rempli, meilleur est le briefing** — l'auto-génération saute simplement les slides dont les données manquent (voir tableau § 4.3).

---

### 1. Accès et liste des briefings

**Chemin** : Projets › (ouvrir un projet) › onglet « 📋 Briefing »
- Onglet : `public/index.html:378` ; chargement `loadDetailBriefing` à l'ouverture de l'onglet (`public/js/01-core.js:602`).
- Pas de restriction de rôle côté écran (aucun masquage de l'onglet trouvé) ; côté serveur, seul le contrôle « utilisateur connecté » s'applique (`src/index.ts:116`).

**Écran liste** (`11-briefing.js:114-166`)
- Compteur « N briefing(s) ».
- Boutons : « ✨ Générer avec l'IA » (infobulle « Génère un premier jet (intro, planning, contacts) à partir des données du projet ») et « ➕ Nouveau briefing » (`11-briefing.js:131-132`).
- Liste vide : « Aucun briefing » / « Clique sur "Nouveau briefing" pour en créer un. » (`11-briefing.js:136-139`).
- Chaque carte : titre, badge « 🎨 Studio » (si le Studio contient des slides) ou « 📝 Classique », « N slide(s) · Modifié le jj/mm/aa hh:mm », boutons « ✏️ Ouvrir » et « 🗑️ » (`11-briefing.js:143-161`). Le mode du badge est calculé côté serveur (`src/routes/briefing.ts:29-42`). Tri : dernier modifié en premier (`briefing.ts:16`).
- Le nombre de slides affiché = slides Studio si le Studio en contient, sinon slides classiques (`briefing.ts:30-33`).

**➕ Nouveau briefing** (`11-briefing.js:181-188`) : fenêtre « Nom du briefing : » pré-remplie « Briefing jj/mm/aaaa » → toast « Briefing créé ✅ » → ouvre l'éditeur classique.

**🗑️ Supprimer** (`11-briefing.js:191-200`) : confirmation « Supprimer définitivement ce briefing ? » → toast « Briefing supprimé ». Supprime les deux contenus (classique + Studio).

**Par phase ?** Non : un briefing n'est pas lié à une phase (le modèle n'a que titre, slides classiques, slides Studio — `schema.prisma:888-901`). On peut créer un briefing installation et un briefing démontage séparés en les nommant ainsi. Seul le bloc classique « Planning » a un sélecteur de phase (§ 2.2).

---

### 2. Mode classique

#### 2.1 Écran d'édition (`11-briefing.js:272-321`)
- Barre haute : « ← Liste » (retour, **sans enregistrer ni prévenir**), champ titre (placeholder « Nom du briefing… »), « 🎨 Studio », « 🖨️ Imprimer », « 💾 Enregistrer ».
- Colonne gauche « Slides (N) » : une ligne par slide (icônes des 4 premiers blocs + titre, ou « Slide n ») avec « ▲ » Monter, « ▼ » Descendre, « × » Supprimer (confirmation « Supprimer cette slide ? », `11-briefing.js:746-751`) ; bouton « + Nouvelle slide » (`11-briefing.js:312`). Vide : « Aucune slide ».
- Zone droite : champ « Titre de la slide… », les blocs, puis « + Ajouter un bloc à cette slide » avec un bouton par type (`11-briefing.js:333-337`). Slide vide : « Cette slide est vide — ajoute un bloc ci-dessous ».
- Chaque bloc a un en-tête « icône + libellé » et « ▲ » / « ▼ » / « × » (confirmation « Supprimer ce bloc ? ») (`11-briefing.js:710-721`, `773-777`).

#### 2.2 Types de blocs (`11-briefing.js:93-105`) — libellés exacts des boutons

| Bouton | Contenu / champs | Source | Preuve |
|---|---|---|---|
| 📝 Texte / notes | Zone de texte libre (placeholder « Notes, instructions, remarques... ») | Saisie | 346-348 |
| 📞 Contacts | Lignes Nom / Rôle / Téléphone / Email + « × » ; « + Contact manuel », « 🤝 Depuis les clients » (fenêtre « 🤝 Choisir un contact client », recherche, client du projet en tête avec badge « CLIENT DU PROJET », bouton « + Ajouter ce contact »), liste « + Membre de l'équipe… » + « Ajouter » (tous les utilisateurs VEM) | Saisie + fiche Client + utilisateurs | 349-364 ; 12-core 1-77 ; 874-884 |
| 🏷️ Infos projet (auto) | Lecture seule : Projet, N° interne, Statut, Client, Contact client, Adresse, Installation, Démontage, Ouvriers prévus, Chef technique, Description, Instructions spéciales — « mises à jour à chaque ouverture du briefing » | Fiche projet | 379-398 |
| ✅ Tâches (auto) | Lecture seule : date · titre — statut | Tâches du projet | 365-371 |
| 🚛 Logistique (auto) | Lecture seule : type, n°, chauffeur, téléphone, arrivée | Onglet 🚛 Logistique | 372-378 |
| ✈️ Transport équipe (auto) | Lecture seule (voir anomalie A1) | Onglet ✈️ Bookings | 458-486, 509-522 |
| 🏨 Hôtels équipe (auto) | Lecture seule (voir anomalie A1) | Onglet ✈️ Bookings | 487-508, 523-532 |
| 📸 Photos / PDF | « 📎 Importer photos / PDF » (images + PDF, plusieurs) et « 📁 Choisir parmi les fichiers du projet » (fenêtre « 📁 Fichiers du projet — Sélectionner pour le briefing », recherche, « déjà ajouté », « ✅ Ajouter au briefing ») ; légende par fichier ; PDF affiché page par page (10 pages max à l'écran) avec « ↗ Ouvrir le PDF original » | Saisie / onglet 📁 Fichiers | 399-443, 892-912, 1074-1158 |
| 📍 Localisation | Champs « Adresse », « N° de stand / hall », « Notes (accès, parking, horaires) » ; bouton « 🗺️ Google Maps » si adresse. **Non pré-rempli** depuis le projet | Saisie | 444-457 |
| 📅 Planning installation / démontage | « Phase concernée » (🏗️ Installation, 🔨 Démontage, 🎉 Jour de l'événement, 📦 Pré-production / Atelier, 📅 Autre), « Date / Libellé (optionnel) », étapes Heure / durée / Description / Responsable, « + Ajouter une étape », « ⚡ Générer depuis le projet » ; astuce « 💡 Astuce : laisser un champ vide pour le masquer » | Saisie + dates du projet | 654-708, 803-864 |
| 📊 Gantt / Planning hebdomadaire | Prévu : titre, préfixe colonnes (KW, Sem.), colonnes, tâches avec De / À / note / couleur — **inutilisable, voir anomalie A2** | Saisie | 533-653 |

« ⚡ Générer depuis le projet » (`11-briefing.js:812-864`) : remplace les étapes par un modèle générique (installation 7 étapes : « Arrivée sur site, briefing équipe », « Déchargement camions », « Montage structure principale », « Pause déjeuner », « Installation équipements / habillage », « Tests + ajustements », « Nettoyage chantier + briefing fin de journée » ; démontage 6 étapes ; jour de l'événement 3 étapes), heure de la 1re étape = heure de début de la phase. Sans date : toast « Pas de date de installation renseignée sur le projet ». Toast final « Planning Installation pré-rempli — adapte les horaires à ton chantier ».

#### 2.3 Enregistrer / imprimer / envoyer
- « 💾 Enregistrer » : toast « Briefing enregistré ✅ » (`11-briefing.js:915-921`). **Pas d'enregistrement automatique.**
- « 🖨️ Imprimer » (`11-briefing.js:924-1070`) : enregistre d'abord, puis ouvre un nouvel onglet A4 (page de garde logo VIEWBOX + « 📋 titre » + nom du projet, ville, date de début) et lance l'impression du navigateur → l'utilisateur choisit « Enregistrer en PDF » dans la fenêtre d'impression. Français uniquement, pas de choix de langue. PDF joints : jusqu'à 15 pages imprimées.
- **Envoi** : pas de bouton d'envoi dans l'onglet Briefing. Seul lien : Projets › projet › 👥 Équipe › « 📤 » sur un membre (`02-detail-loaders.js:330`) › case « 📊 Briefings — Briefings créés pour ce projet » (`10-logistics-bookings.js:341`) : le message dit seulement qu'un briefing existe + lien « Ouvrir VEM », sans contenu ni PDF (`src/routes/projects.ts:329-340`) — et voir anomalie A6.

#### 2.4 « ✨ Générer avec l'IA » (brouillon classique)
Chemin : onglet 📋 Briefing › « ✨ Générer avec l'IA » (`11-briefing.js:170-178`). Pendant : « ✨ Génération... ». Fin : toast « Brouillon généré ✅ — relis et ajuste avant envoi », ouvre l'éditeur.
Crée **un nouveau briefing** nommé « Briefing IA — <nom du projet> » (n'écrase rien) avec 5 slides (`briefingAI.ts:111-134`) :
1. « Infos projet » — bloc 🏷️ Infos projet (auto).
2. « Contacts » — contacts réels de la fiche client (nom, rôle sinon « Contact client », téléphone, email) + le responsable technique du projet avec le rôle « Responsable technique Viewbox ».
3. « Introduction » — texte de 2 à 4 phrases **rédigé par l'IA** à partir de : nom, client, adresse, dates installation / démontage, effectif, description (ou notes globales), notes installation, notes démontage, consignes spéciales (`briefingAI.ts:38-62`). Consigne donnée à l'IA : ne rien inventer.
4. « Planning » — bloc Planning phase Installation, libellé = date de début d'installation, 3 à 8 étapes **proposées par l'IA** (sans heures si les données n'en donnent pas).
5. « Logistique » — blocs 🚛 Logistique, ✈️ Transport équipe, 🏨 Hôtels équipe (auto).
Erreur : toast « Erreur génération IA » (ou message serveur).

---

### 3. Briefing Studio

#### 3.1 Accès
Onglet 📋 Briefing › « ✏️ Ouvrir » sur un briefing › « 🎨 Studio » (`11-briefing.js:285`, `12-core.js:453-469`). S'ouvre en plein écran par-dessus VEM. Premier passage : 1 slide vide « Slide 1 » ; ensuite reprend le contenu Studio sauvegardé.

#### 3.2 En-tête (`12-core.js:688-698`)
- « 🎨 Briefing Studio » + champ titre du briefing.
- « 🪄 Auto-générer » (§ 4).
- « 📄 PDF » (§ 3.8).
- « 💾 Sauvegarder » → toast « Briefing sauvegardé ✅ » (`13-slides.js:561-576`). Pas d'autosave.
- « ✕ » Fermer → confirmation « Fermer le Studio ? Pensez à sauvegarder. » puis retour à la liste des briefings (`13-slides.js:714-723`).

#### 3.3 Barre d'outils (`12-core.js:701-748`) — libellés exacts
| Bouton (infobulle) | Action | Preuve |
|---|---|---|
| ↶ (Annuler (Ctrl+Z)) / ↷ (Rétablir (Ctrl+Y)) | Annuler / rétablir, 30 pas, **par slide** (historique remis à zéro quand on change de slide) | 1095-1143 ; 13-slides 513-518 |
| 📝 Texte | Zone de texte « Texte... » (largeur réglable, le texte se replie) | 828-833 |
| 🔤 Titre | Texte « Titre principal » (54 pt, gras) | 834-838 |
| 🖼️ Image/PDF | Image → posée sur la slide ; PDF → **une nouvelle slide par page** (« ✅ PDF ajouté : N slide(s) créée(s) »). Le fichier est aussi ajouté aux fichiers du projet | 839-884 |
| ▭ (Rectangle), ⭕ (Cercle), — Ligne, ➜ Flèche | Formes | 885-907 |
| 📂 Depuis projet ▾ | Menu de données du projet (§ 3.4) | 13-slides 731-924 |
| 🎨 Templates ▾ | Slides modèles (§ 3.5) | 13-slides 1-128 |
| 📥 Depuis Classique | Convertit les slides du mode classique en slides Studio (§ 3.6) | 13-slides 280-414 |
| ⬆ (Avancer) / ⬇ (Reculer) | Ordre de superposition | 909-910 |
| 📋 (Copier (Ctrl+C)) / 📥 (Coller (Ctrl+V)) | Copier-coller d'élément ; collages successifs décalés en escalier | 915-943 |
| ⎘ (Dupliquer) | Duplique l'élément sélectionné | 911-914 |
| 🗑️ (Supprimer (Suppr)) | Supprime la sélection | 944-950 |
| Couleur : | Couleur du texte / de la forme / de la ligne | 953-967 |
| Police : | Helvetica, Arial, Verdana, Trebuchet MS, Georgia, Times New Roman, Courier New, Impact, Comic Sans | 729-739 |
| Taille : − [24] + | Taille du texte | 741-743, 968-979 |
| **B** (Gras) / *I* (Italique) | Style du texte | 744-745 |
| 📌 Logo ▾ (Gestion du logo de fond) | Menu logo (§ 3.7) | 1019-1092 |

Raccourcis clavier (`12-core.js:790-825`) : Ctrl/Cmd+Z annuler ; Ctrl/Cmd+Y ou Ctrl/Cmd+Maj+Z rétablir ; Ctrl/Cmd+C copier ; Ctrl/Cmd+X couper (pas de bouton) ; Ctrl/Cmd+V coller ; Suppr ou Retour arrière supprimer. Inactifs pendant la saisie dans un champ ou l'édition d'un texte.
Redimensionner un texte change sa taille de police / sa largeur sans le déformer (`12-core.js:996-1007`).

#### 3.4 « 📂 Depuis projet ▾ » — toutes les sources (`13-slides.js:736-752`)
Tout est inséré **sur la slide courante** (pas de nouvelle slide, sauf PDF). Les listes ouvrent une fenêtre de choix (tout coché par défaut, « Tout cocher », « Décocher », « 🔎 Rechercher... », « Annuler », « ✅ Ajouter au canvas ») (`13-slides.js:947-1004`).

| Section | Libellé exact | Données insérées | Message si vide | Preuve |
|---|---|---|---|---|
| PROJET | 🏷️ Infos projet (résumé) | Texte : NOM DU PROJET, « Ref : » n° interne, « Client : », « 📍 » adresse + ville, « 📅 Install : » début → fin, « 🔨 Démontage : » début → fin | — | 781-786 ; 1114-1128 |
| PROJET | 📅 Planning install/démontage | Texte « 📅 PLANNING » : INSTALLATION / DÉMONTAGE, Début / Fin (jour + date + heure) | — (affiche « ? ») | 787-792 ; 1130-1150 |
| PROJET | 📍 Localisation + lien Maps | Adresse en gros + **carte** centrée avec repère rouge (sans lien cliquable malgré le libellé) | Sans adresse : « Pas d'adresse pour ce projet. Veux-tu placer une carte manuellement ? » ; carte introuvable : proposition de saisie manuelle (adresse, coordonnées GPS ou lien Google Maps) | 793-798 ; 14-autogen 37-59 ; 12-core 420-443 |
| PROJET | 📓 Notes projet (scope, install...) | Texte « 📓 NOTES PROJET » : OBJET (notes globales), DESCRIPTION, NOTES INSTALLATION, NOTES DÉMONTAGE, INSTRUCTIONS SPÉCIALES | « Aucune note saisie sur ce projet » | 799-808 ; 14-autogen 61-69 |
| PERSONNES | 📞 Contacts du client | Tableau Nom (★ = principal) / Rôle / Téléphone / Email — contacts de la fiche client, sinon contact principal du client | « Pas de client lié à ce projet » / « Aucun contact défini pour ce client » | 876-894 ; 14-autogen 692-707 |
| PERSONNES | 👥 Équipes (+ téléphones) | Tableau Nom / Rôle / Phase / Téléphone (membres de l'onglet 👥 Équipe) | « Aucun membre dans l'équipe » | 820-830 ; 14-autogen 20-34 |
| LOGISTIQUE | 🚛 Camions (détaillé) | Tableau Type / Trajet (lieu chargement → déchargement) / Chargement (date) / Chauffeur (+ tél.) | « Aucun camion sur ce projet » | 809-819 ; 14-autogen 1-18 |
| LOGISTIQUE | ✈️ Bookings transport équipe | Tableau Membre / Phase / Sur site / Aller / Retour | « Aucun booking transport sur ce projet » | 831-845 ; 14-autogen 636-654 |
| LOGISTIQUE | 🏨 Réservations hôtels équipe | Tableau Hôtel / Phase / Séjour / Occupants / Réf. | « Aucune réservation hôtel sur ce projet » | 846-860 ; 14-autogen 656-673 |
| CONTENU | 📋 Tâches | Tableau Tâche / Date / Assigné / Statut (✓ Terminé, ↻ En cours, ○ À faire) | « Aucune tâche sur ce projet » | 861-875 ; 14-autogen 675-690 |
| CONTENU | 📁 Fichiers / Photos | Images (jpg, png, gif, webp, heic, svg) posées sur la slide courante ; PDF = une nouvelle slide par page (bandeau « 📄 nom — Page n/N ») | « Aucun fichier image/PDF sur ce projet » | 895-907 ; 14-autogen 187-262 |
| CONTENU | ⚠️ Remarques client | Tableau Remarque / Status / Priorité / Date | « Aucune remarque client sur ce projet » | 909-919 ; 14-autogen 263-277 |

Non proposés : check-lists, daily reports, handover, modèles 3D / Plans Viewbox (sauf s'ils ont été déposés comme fichiers image/PDF dans 📁 Fichiers — À confirmer pour les captures 3D).

#### 3.5 « 🎨 Templates ▾ » (`13-slides.js:6-14`)
Titre de menu « Ajouter une slide depuis un modèle » ; insère une **nouvelle slide après la slide courante**, avec textes d'exemple à remplacer (aucune donnée projet) :
- 📝 Titre + points clés (nom de slide « Liste »)
- 🖼️ Photo + texte (« Photo + texte » — cadre gris « Glisser une image ici »)
- 📞 Contacts (tableau d'exemple « Nom 1 / Rôle / +32 ... / mail@... »)
- 📅 Calendrier / Planning (tableau Phase / Début / Fin avec « dd/mm/yyyy »)
- 🎯 Page de garde (« BRIEFING », « NOM DU PROJET », « Client : ... »)
- 📍 Séparateur de section (fond bleu marine, « TITRE DE SECTION », « Sous-titre / contexte »)
Style Viewbox : fond gris clair, cadre titre bleu marine, logo Viewbox en haut à droite, grand « WB » blanc en bas à droite (`12-core.js:165-203`).

#### 3.6 « 📥 Depuis Classique » (`13-slides.js:280-414`)
Confirmation « Importer N slide(s) du Briefing Classique dans le Studio ? Elles seront insérées juste après la slide courante. » Convertis : textes, contacts, infos projet (Projet, N° interne, Client, Adresse, Installation, Ouvriers), tâches (12 max), camions, photos (pas les PDF). **Ignorés** : Localisation, Planning, Gantt, Transport équipe, Hôtels. Sans slide : « Aucune slide classique à importer ».

#### 3.7 « 📌 Logo ▾ » (`12-core.js:1019-1092`)
- « 📤 Uploader un logo pour ce briefing » → logo discret (transparent, en bas à droite) sur toutes les slides de ce briefing.
- « 🌐 Définir comme logo global Viewbox » → devient le logo par défaut de tous les briefings ; **réservé aux admins** (sinon toast « Logo appliqué à ce briefing mais pas globalisé : … »).
- « 🔄 Réutiliser le logo global Viewbox » ; « ✕ Retirer le logo de ce briefing ».
Le logo est enregistré avec le briefing au « 💾 Sauvegarder ». Distinct du logo Viewbox placé par les modèles de slide.

#### 3.8 Gestion des slides (barre latérale « Slides », `13-slides.js:527-558`)
- Chaque miniature : « ⋮⋮ » glisser-déposer pour réordonner, numéro, **nom modifiable directement**, « ▲ » Monter, « ▼ » Descendre, « 🗐 » Dupliquer la slide (toast « Slide dupliquée 🗐 »), « × » Supprimer (confirmation « Supprimer la slide "nom" ? » ; impossible de supprimer la dernière : « Au moins une slide doit rester »).
- « + Nouvelle slide » : insère après la slide courante une slide au style Viewbox « Titre de la slide » (`13-slides.js:252-269`).

#### 3.9 « 📄 PDF » et langue (`13-slides.js:625-712`, `01-core.js:22-47`)
1. Fenêtre « 📄 Langue du PDF » : « 🇫🇷 Français », « 🇬🇧 English », « Annuler ».
2. Chaque slide devient une page A4 paysage (image ; texte non sélectionnable). Progression sur le bouton : « ⏳ Slide n/N... », « 🌐 Traduction slide n/N... ».
3. **English** : tous les textes de chaque slide (y compris les cellules des tableaux) sont traduits automatiquement par un service de traduction, uniquement pour le PDF ; le briefing lui-même reste en français.
4. Le PDF est téléchargé (« <titre>_fr.pdf » / « <titre>_en.pdf ») **et** ajouté automatiquement aux fichiers du projet (📁 Fichiers). Toast « PDF exporté + sauvegardé dans les fichiers ✅ (N textes traduits) ».
Le mode classique n'a pas de choix de langue (impression navigateur en français).

#### 3.10 Mobile / tablette
Aucune adaptation spécifique trouvée : le Studio est en plein écran, barre d'outils qui passe à la ligne, colonne de slides fixe de 200 px, slide réduite à la largeur disponible (`12-core.js:757-788`). Raccourcis clavier inutilisables sans clavier ; le glisser-déposer des miniatures repose sur le glisser-déposer du navigateur (sur écran tactile, utiliser ▲ / ▼). Comportement réel au doigt : **À confirmer** (tests manuels). Le mode classique utilise une grille fixe 240 px + éditeur (`11-briefing.js:291`) : lisibilité sur téléphone À confirmer. Recommandation formation : utiliser le Briefing Studio sur ordinateur.

---

### 4. « 🪄 Auto-générer » (Studio)

#### 4.1 Déroulé (`14-autogen.js:286-634`)
- Chemin : Briefing › ✏️ Ouvrir › 🎨 Studio › « 🪄 Auto-générer » (infobulle « Génère automatiquement un briefing complet à partir des données du projet »).
- Confirmation exacte : « 🪄 Auto-générer un briefing complet à partir des données du projet ? / Les slides actuelles seront REMPLACÉES. / (Tu peux les éditer ensuite.) » (`14-autogen.js:287`). Toutes les slides Studio sont effacées (`14-autogen.js:346`) ; la sauvegarde n'est faite qu'au clic sur « 💾 Sauvegarder » (fermer sans sauvegarder = on garde l'ancienne version).
- Si le projet a des fichiers image / PDF : fenêtre « 📁 Fichiers à inclure dans le briefing » (« Chaque fichier coché créera une slide dédiée dans le briefing. », aucun coché par défaut, boutons « Annuler » = génération annulée (toast « Génération annulée »), « ⏭️ Sans fichiers », « ✅ Générer ») (`13-slides.js:1010-1092`).
- **Pas d'IA** dans l'auto-génération (aucun appel IA dans `brfAutoGenerateBriefing`). La seule IA du Studio est la traduction du PDF anglais.
- Fin : toast « ✅ N slides générées — pense à sauvegarder ! » et retour à la 1re slide.

#### 4.2 Slides générées, dans l'ordre, et conditions
| # | Slide (nom barre latérale / titre) | Condition d'apparition | Contenu | Preuve |
|---|---|---|---|---|
| 1 | Couverture | Toujours | « BRIEFING », NOM DU PROJET en majuscules ; « Client : … » si client ; « 📅 Installation : début → fin » si date ; « 📍 adresse, ville » si adresse | 367-400 |
| 2 | Planning / « Planning » | Date de début d'installation **ou** de démontage | Tableau Phase / Début / Fin (🏗️ Installation, 🔨 Démontage) ; date manquante = « ? » | 402-416 |
| 3 | Lieu / « Localisation » | Adresse | Adresse en gros + carte (si l'adresse est trouvée ; sinon slide sans carte, sans message) | 418-429 |
| 4 | Équipe / « Équipe » | Au moins un membre dans l'équipe | Tableau Nom / Rôle / Phase (🔨 Démontage, 🏗️ Install., « Les deux ») / Téléphone | 431-444 |
| 5 | Contacts / « Contacts — <client> » | Contacts du client (ou contact principal) | Tableau Nom (★ principal) / Rôle / Téléphone / Email | 446-456 |
| 6 | Logistique / « Logistique » | Au moins un véhicule | Tableau Type / Trajet / Chargement / Chauffeur | 458-470 |
| 7 | Transport équipe | Au moins un booking transport | Tableau Membre / Phase / Sur site / Aller / Retour | 472-488 |
| 8 | Hôtels / « Hôtels équipe » | Au moins une réservation hôtel | Tableau Hôtel / Phase / Séjour / Occupants / Réf. | 490-503 |
| 9 | Notes / « Notes projet » | Au moins une note | ▶ OBJET, ▶ DESCRIPTION, ▶ INSTALLATION, ▶ DÉMONTAGE, ▶ INSTRUCTIONS SPÉCIALES | 505-516 |
| 10 | Tâches clés / « Tâches importantes » | Tâches de priorité **Haute** ou **Critique** (12 max) | Tableau Tâche / Date / Assigné / Statut | 518-531 |
| 11 | Remarques / « Remarques client » | Remarques client non résolues (10 max) | Tableau Remarque / Status / Priorité / Date | 533-545 |
| 12+ | une slide par fichier coché | Fichiers cochés | Image : slide au style Viewbox titrée du nom du fichier ; PDF : une slide par page (30 pages max), bandeau « 📄 nom — Page n/N » | 547-610 ; 74-95 |
| fin | Merci | Toujours | « MERCI » / « Des questions ? » sur fond bleu marine | 612-620 |

Donnée manquante = la slide est **sautée** (pas de slide vide, pas de texte d'attente). Exceptions : « ? » pour une date de fin ou un lieu de chargement / déchargement manquant, « — » pour un nom manquant. Non utilisés par l'auto-génération : check-lists, daily reports, handover, nombre d'ouvriers, n° interne, responsable technique, modèles 3D / plans (sauf fichiers image / PDF), tâches de priorité Normale / Faible.

#### 4.3 Tableau formation : « Slide générée → données utilisées → où les saisir dans VEM »

| Slide générée | Données du projet utilisées | Où on les saisit dans VEM |
|---|---|---|
| Couverture | Nom du projet, client, début / fin d'installation, adresse | Projet › « ✏️ Modifier » : « Nom * », « Client * », « Adresse * », « Début installation * » / « Fin installation * » (`index.html:357`, `609-627`) |
| Planning | Début / fin d'installation et de démontage (date + heure ; 00:00 = date seule) | Projet › ✏️ Modifier : « Début / Fin installation », « Début démontage », « Fin démontage » (`index.html:625-632`) |
| Localisation (carte) | Adresse complète | Projet › ✏️ Modifier : « Adresse * » (« Adresse complète, Ville ») |
| Équipe | Membres, leur rôle dans le projet, leur phase, leur téléphone | Projet › onglet « 👥 Équipe » (ou bloc « 👷 Équipes & Membres » du formulaire projet) ; téléphone = profil de l'utilisateur |
| Contacts | Contacts de la fiche client (nom, rôle, téléphone, email), sinon contact principal du client | Fiche du client (page Clients) — À confirmer pour le libellé exact du menu Clients |
| Logistique | Type de véhicule, lieu de chargement, lieu de déchargement, date de chargement, chauffeur, téléphone chauffeur | Projet › onglet « 🚛 Logistique » › « + Ajouter » |
| Transport équipe | Membre, phase, dates sur site, mode + date aller, mode + date retour | Projet › onglet « ✈️ Bookings » (transport) |
| Hôtels équipe | Nom de l'hôtel, phase, arrivée / départ, occupants, référence | Projet › onglet « ✈️ Bookings » (hôtels) |
| Notes projet | « 🌐 Notes globales du projet » (→ OBJET), « Description / Instructions spéciales » (→ DESCRIPTION), « 🔨 Notes installation », « 🔧 Notes démontage », instructions spéciales | Projet › ✏️ Modifier › « Description / Instructions spéciales » et « 📝 Notes complémentaires » (`index.html:634-656`). Le champ « instructions spéciales » séparé n'a pas de saisie dans l'écran (À confirmer : rempli par l'automatisation e-mail ?) |
| Tâches importantes | Tâches de priorité Haute / Critique : titre, date, assigné, statut | Fenêtre tâche, champ « Priorité » (Faible / Normal / Haute / Critique, `index.html:826-832`). Attention : l'onglet « ✅ Tâches » est masqué depuis le 16.10.2026 (`index.html:368`) et les tâches créées depuis le formulaire projet sont en priorité Normal (`02-detail-loaders.js:1162`) → cette slide n'apparaîtra presque jamais |
| Remarques client | Remarques non résolues : titre / description, statut, priorité, date | Projet › onglet « 📸 Visites Client » |
| Slides fichiers | Photos et PDF du projet (cochés au moment de la génération) | Projet › onglet « 📁 Fichiers » |

Message formation : chaque ligne vide dans VEM = une slide en moins. Remplir avant de générer : adresse, dates (avec heures), équipe et téléphones, contacts du client, camions, bookings, hôtels, notes, photos / plans PDF dans Fichiers.

---

### 5. Rôles
- Aucune restriction de rôle sur l'onglet Briefing, ni à l'écran ni côté serveur : tout utilisateur connecté qui ouvre le projet peut créer, modifier, supprimer, générer (`src/routes/briefing.ts` sans contrôle de rôle ; `src/index.ts:116`).
- Seule exception : « 🌐 Définir comme logo global Viewbox » réservé aux admins (`src/routes/settings.ts:26-34`).
- Le contrôle « installateur / site manager ne voient que leurs projets » (`projectAccess`) n'est pas appliqué aux briefings.

### 6. Éléments masqués / code mort à exclure de la formation
- Onglet « ✅ Tâches » masqué (`index.html:368`) — ne pas l'enseigner pour alimenter « Tâches importantes ».
- Écran d'accueil « Briefing Studio » avec « ✏️ Ouvrir le Studio » et « ↩︎ Revenir au mode classique » : jamais affiché (`11-briefing.js:250-270`, aucun appel).
- Anciens modèles de slide (`brfApplyTemplate`, `brfTemplateName`, `13-slides.js:130-213`) : jamais appelés (le texte « cliquer sur "📂 Depuis projet" puis "Contacts du client" » n'apparaît donc nulle part).
- Bloc 📊 Gantt : bouton visible mais éditeur inutilisable (A2) — à ne pas montrer tant que non corrigé.

---

### 7. Anomalies UX / incohérences (avec preuves)

- **A1 — Blocs « ✈️ Transport équipe » et « 🏨 Hôtels équipe » (classique)** : l'éditeur affiche directement un tableau d'impression, **sans l'en-tête du bloc** (pas de ▲ ▼ ×) → impossible de déplacer ou supprimer ces blocs. Cause : `if` qui retournent tôt après la chaîne `else if` (`11-briefing.js:509-532`). Concerne aussi la slide « Logistique » du brouillon « ✨ Générer avec l'IA ».
- **A2 — Bloc « 📊 Gantt / Planning hebdomadaire » (classique)** : l'éditeur (titre, colonnes, tâches, « + Ajouter une tâche ») est remplacé par l'aperçu (`11-briefing.js:620-653`) → rien n'est saisissable, et le bloc ne peut pas être supprimé (pas d'en-tête).
- **A3 — Impression classique** : les blocs Transport équipe, Hôtels et Gantt ne sont **pas imprimés** (`renderBlockPrint` ne les gère pas, `11-briefing.js:934-1040`) — disparition silencieuse.
- **A4 — Pas d'enregistrement automatique ni d'alerte** : « ← Liste » en mode classique perd les modifications sans prévenir ; Studio : seulement « Fermer le Studio ? Pensez à sauvegarder. ».
- **A5 — Deux contenus parallèles** dans un même briefing (classique et Studio) sans indication claire : modifier l'un ne change pas l'autre ; le badge de la liste n'affiche que « Studio » ou « Classique ». « 📥 Depuis Classique » ignore Localisation, Planning, Gantt, Transport, Hôtels et les PDF.
- **A6 — E-mail « 📊 Briefings » depuis 👥 Équipe › 📤** : annonce toujours « Un briefing est disponible pour ce projet. » même s'il n'en existe aucun (le test porte sur une liste, toujours vraie ; `src/routes/projects.ts:330`), et n'inclut ni contenu ni PDF.
- **A7 — Adresse en double** : la ville est déduite de la dernière partie de l'adresse (`02-detail-loaders.js` createProject `city: address.split(',').pop()`), puis les slides affichent « adresse, ville » → ex. « Rue X 1, Bruxelles, Bruxelles » (couverture `14-autogen.js:396`, Localisation `421`, Infos projet classique `11-briefing.js:390`, `13-slides.js:1120`). À confirmer sur des données réelles.
- **A8 — Codes techniques visibles** : statut du projet brut (ex. « in_preparation », `11-briefing.js:387`), statut des tâches brut (« todo », `369`), type de véhicule brut (« truck », `376`), rôle utilisateur brut (« site_manager ») dans la liste « + Membre de l'équipe… » (`360`) et dans la colonne Rôle de la slide Équipe (`14-autogen.js:440`).
- **A9 — Libellés différents pour la même donnée** : « 🌐 Notes globales du projet » (formulaire) devient « OBJET » dans le Studio ; « Description / Instructions spéciales » (formulaire) devient « DESCRIPTION » ; « Instructions spéciales » apparaît dans les briefings mais n'a pas de champ de saisie.
- **A10 — « 📍 Localisation + lien Maps »** (Studio) : n'insère pas de lien Google Maps, seulement une carte image. En auto-génération, si l'adresse n'est pas trouvée, la slide sort sans carte et sans message.
- **A11 — Modèle « 🖼️ Photo + texte »** : texte « Glisser une image ici » alors que le glisser-déposer d'image sur la slide n'existe pas (seul « 🖼️ Image/PDF »).
- **A12 — Tableaux longs** : pas de pagination ; au-delà d'environ 12 lignes (équipe, camions, bookings), le tableau dépasse du bas de la slide (`brfRenderDataTable`, hauteur fixe 720, départ à y = 200). Tâches limitées à 12, remarques à 10 sans le dire.
- **A13 — « ⚡ Générer depuis le projet »** remplace les étapes déjà saisies sans confirmation (`11-briefing.js:861`) ; pour « Pré-production » / « Autre », utilise les dates d'installation.
- **A14 — Effets de bord dans 📁 Fichiers** : chaque export PDF du Studio, chaque image / PDF importé par « 🖼️ Image/PDF » et chaque logo envoyé sont ajoutés aux fichiers du projet → doublons à chaque export (`13-slides.js:680-705`, `12-core.js:845`, `1055`). À l'inverse, les fichiers importés dans un bloc classique « 📸 Photos / PDF » ne vont pas dans 📁 Fichiers.
- **A15 — Icônes ambiguës** : « 📥 » sert à la fois pour « Coller » et « 📥 Depuis Classique ».
- **A16 — Undo par slide** : changer de slide efface l'historique d'annulation ; « 🪄 Auto-générer » n'est pas annulable (sauf en fermant sans sauvegarder).
- **A17 — Traduction EN** : tous les textes sont traduits, y compris noms propres, adresses, références d'hôtel (risque d'altération — À confirmer en test). Le titre du fichier reste en français.
- **A18 — PDF Studio en images** : texte non sélectionnable / non cherchable ; ~1 s par slide minimum ; slides de PDF limitées à 30 pages, PDF classique à 15 pages imprimées / 10 affichées.
- **A19 — Contrôles « 🤝 Depuis les clients »** : liste tous les clients de la base (pas seulement celui du projet) — risque d'erreur de contact.

### 8. Questions pour le product owner
1. Faut-il garder les deux modes (classique + Studio) ? Lequel enseigner en priorité ? (recommandation audit : Studio + 🪄 Auto-générer).
2. Corriger les blocs classiques Gantt / Transport / Hôtels (A1-A3) ou retirer ces boutons ?
3. Faut-il restreindre la création / suppression de briefings à certains rôles (worker, installer, client) ?
4. Le champ « instructions spéciales » doit-il avoir une saisie dans la fiche projet ? Qui le remplit aujourd'hui ?
5. La slide « Tâches importantes » est-elle encore voulue alors que l'onglet Tâches est masqué ? Remplacer par la check-list de montage (non utilisée par le briefing aujourd'hui) ?
6. Ajouter les check-lists, les captures 3D / plans Viewbox, le responsable technique et le nombre d'ouvriers à l'auto-génération ?
7. Un vrai envoi du briefing (PDF joint) aux membres de l'équipe est-il souhaité (A6) ?
8. Faut-il éviter l'ajout automatique de chaque export PDF dans 📁 Fichiers (ou remplacer la version précédente) ?
9. Faut-il un enregistrement automatique (comme les autres modules VEM : 2 s après la dernière modification) ?
10. Un briefing par phase (installation / démontage) : convention de nommage à recommander, ou ajout d'un champ phase ?
11. Usage attendu sur téléphone / tablette du Studio ?

---

### 9. Notes techniques (NE PAS mettre en formation)
- Modèle `Briefing` : `slides` (JSON classique, défaut `[]`), `studioSlides` (JSON `{version: 2, logoUrl, title, slides:[{id, name, json (Fabric), thumbnail (dataURL JPEG)}]}`) (`schema.prisma:888-901` ; `13-slides.js:564-571`). Les vignettes dataURL sont stockées en base → poids des enregistrements.
- Routes `src/routes/briefing.ts` : `GET /briefings/project/:projectId`, `POST /briefings/project/:projectId`, `POST /briefings/project/:projectId/generate`, `GET/PATCH/DELETE /briefings/:id`. Aucune vérification que le briefing appartient à un projet accessible (lecture / modification / suppression par id pour tout utilisateur authentifié). Erreurs renvoyées en 500 avec `e.message` (sauf `/generate` → `next(err)`), hors convention `AppError`.
- « ✨ Générer avec l'IA » : `briefingAI.ts` → `callClaudeJSON` (`aiService`), `maxTokens: 1500`, schéma zod `{intro, planningSteps[]}` avec `.catch` ; pas de contrôle explicite `stop_reason === 'max_tokens'` visible ici (À confirmer dans `aiService.callClaudeJSON`). Le commentaire mentionne `BLOCK_TYPES dans public/index.html` (obsolète : dans `11-briefing.js`).
- Traduction EN du PDF Studio : `POST /api/v1/translate` (`src/routes/translate.ts`) → `translationService.ts` (service OpenAI, modèle gpt-4o-mini, clé `OPENAI_API_KEY` ; sans clé, renvoie les textes originaux sans erreur → PDF « EN » en français silencieusement). Route montée sans `authMiddleware` selon CLAUDE.md (le front envoie quand même le token). Limite 200 textes / 4000 caractères par requête : une slide très chargée peut dépasser → 400 → `brfTranslateSlideTexts` renvoie 0, slide non traduite sans alerte.
- Cartes : géocodage Nominatim (OpenStreetMap, appels depuis le navigateur, throttle 250 ms) + image statique Geoapify avec **clé API en clair dans le front** (`12-core.js:341`).
- Upload Studio (images, PDF, logo, PDF exporté) : `POST /api/v1/upload/project-file/:projectId` (Cloudinary + `project_files`) ; bloc classique Photos : `POST /upload/photo`. PDF découpés en pages via transformations Cloudinary `pg_N` / `f_jpg` (sondage page par page, 8 s max par page, 30 pages max) — PDF hors Cloudinary : « hors Cloudinary — impossible de séparer les pages ». Images chargées en CORS puis sans CORS (canvas « tainted » → export PDF / vignettes peuvent échouer : toast « ⚠️ Image ajoutée (export PDF risque de rater) »).
- Logo global : `app_settings` clé `briefing-default-logo` (`GET /settings/briefing-default-logo` ; PUT admin seulement).
- `12-briefing-studio-core.js:486-629` : déclarations dupliquées (`BRF_TPL`, `brfPreloadLogo`, `brfAddLogoTopRight`, `brfApplyStandardTemplate`, `brfRenderDataTable`) à l'intérieur de `openBriefingStudio` (masquage local, indentation cassée) — dette technique, sans effet fonctionnel visible.
- Fabric.js et jsPDF chargés en `defer` depuis CDN (`index.html`) ; `openBriefingStudio` attend `fabric` en boucle sans délai maximum.
- E-mail « briefings » (`projects.ts:329-340`) : `p.briefing` est une relation `Briefing[]` (`schema.prisma:224`) → toujours vrai, `.title` indéfini.
- Pas de socket temps réel pour les briefings : deux personnes qui éditent le même briefing s'écrasent mutuellement (dernier PATCH gagne ; classique et Studio écrivent des colonnes différentes).

---

## II.6 — Audit 6 — Daily Reports et Check-list de montage (inventaire pour la formation)

Périmètre : rapports journaliers (menu, onglet projet, fenêtre « 📓 Rapport Journalier », liste, détail, modification, PDF, envoi, pièces jointes) et check-list de montage telle que les utilisateurs la voient (cartes, remplissage Liste / Diaporama, export, bibliothèque admin, effet sur la signature du handover).
Audit en lecture seule, le 23.10.2026. Chaque affirmation renvoie au code (`fichier:ligne`). « À confirmer » = pas prouvable par le code seul.

---

### 1. Accès aux Daily Reports

#### 1.1 Chemins d'accès
| Chemin | Libellés exacts | Preuve |
|---|---|---|
| Menu (ordinateur) › section « Terrain » › « 📓 Daily Reports » | page « Daily Reports » / « Rapports journaliers », bouton « + Nouveau Rapport » | `public/index.html:164-166`, `:411-417` |
| Téléphone : bouton central « ＋ » de la barre du bas › « 📓 Daily Report » | ouvre directement la fenêtre de création | `public/index.html:122-124`, `:141` |
| Téléphone : « ☰ Menu » (barre du bas) › même menu que sur ordinateur | | `public/index.html:132-134` |
| Dashboard › carte « ⚡ Actions rapides » › « 📓 Daily report » | ouvre la page Daily Reports | `public/index.html:257` |
| Projet › onglet « 📓 Daily Reports » | carte check-list en haut, puis bouton « + Nouveau Rapport » et la liste des rapports du projet | `public/index.html:369`, `:383` ; `public/js/07-auth-mobile-daily-ai.js:1037-1062` |

#### 1.2 Liste globale (page Daily Reports)
- Montre **tous les rapports de tous les projets** (aucun filtre par projet ni par rôle) : `public/js/02-detail-loaders.js:532-577`, `src/routes/dailyReports.ts:54-75`.
- Carte : « 📓 Rapport du <date> », « Par <Prénom Nom> · N ouvriers · <météo> », pastilles « ⏱️ N entrée(s) », « 📸 N photo(s) », « 📎 N pièce(s) jointe(s) », « Modifié le … », aperçu des 3 premières entrées, notes. Badge « ✉️ Envoyé » si déjà envoyé. Boutons « 📄 PDF », « 🖨️ », « 📤 Envoyer » (seulement si pas encore envoyé). `02-detail-loaders.js:547-575`.
- **Un clic sur la carte ouvre directement la modification** (« ✏️ Modifier le Rapport »), pas la lecture. `02-detail-loaders.js:547`.
- Pas de bouton supprimer sur cette carte (supprimer = dans la fenêtre de modification).

#### 1.3 Liste d'un projet (onglet 📓 Daily Reports)
- Carte : « 📓 <date> », « N ouvriers · météo · N entrée(s) · 📎 N », notes ; badge « ✉️ » si envoyé ; boutons icônes 👁️ (lecture), ✏️ (modifier), 📄 (PDF), 🗑️ (supprimer). Clic sur la carte = lecture. `07-auth-mobile-daily-ai.js:1044-1061`.
- Vide : « Aucun rapport journalier ». `07-auth-mobile-daily-ai.js:1044`.

---

### 2. Fenêtre « 📓 Rapport Journalier » (création)

Titre « 📓 Rapport Journalier », sous-titre « Journal de chantier complet ». `public/index.html:851-856`.
À l'ouverture : date du jour, formulaire remis à zéro, projet courant pré-sélectionné si on vient d'un projet, heure courante dans le champ heure. `public/js/03-create-forms.js:779-785`, `:46-71`.

#### 2.1 Infos générales
| Champ | Obligatoire | Format / valeurs | Preuve |
|---|---|---|---|
| « Projet * » | oui | liste « Nom (numéro interne) » ; choisir un projet charge ses tâches et ses check-lists à joindre | `index.html:861` ; `03-create-forms.js:671-675`, `:286-289` |
| « Date * » | oui | date, défaut = aujourd'hui | `index.html:862` ; `03-create-forms.js:780` |
| « Météo » | non (toujours une valeur) | « ☀️ Ensoleillé », « ⛅ Nuageux », « 🌧️ Pluie », « ❄️ Froid », « 🌩️ Orage » | `index.html:863` |
| « Ouvriers présents » | non | nombre ≥ 0, défaut 0 | `index.html:864` |
Message si projet ou date manquant : « Projet et date obligatoires ». `03-create-forms.js:495`.
Plusieurs rapports le même jour pour le même projet sont permis (matin / soir, équipiers différents). `src/routes/dailyReports.ts:99-102`.

#### 2.2 « ⏱️ Heures par tâche »
- Choix « 🏗️ Installation » / « 🔨 Démontage » (boutons radio). Avant le choix : « Choisis d'abord Installation ou Démontage pour afficher les tâches. » `index.html:868-881`.
- **Origine des noms de tâches** : les modèles de tâches actifs (Admin › 📋 Templates tâches) dont la phase est « installation » ou « dismantling ». `03-create-forms.js:70-88` ; `src/routes/taskTemplates.ts:64-67` (actifs seulement), `:80-104` (champ phase). Bibliothèque d'origine : catégories « Installation » (13 tâches, en anglais : « GENERAL TASK », « Placing Facade elements »…) et « Dismantling » (11 tâches). `src/routes/taskTemplates.ts:371-372`.
- Colonnes « Tâche » / « Heures » (pas de 0,25) / « Hommes » (entier), ✕ pour retirer une ligne. `index.html:882-884` ; `03-create-forms.js:110-121`.
- Ajouter une tâche libre : champ « Ajouter une autre tâche... » + « + Ajouter » (message « Nom de la tâche requis » si vide). `index.html:886-889` ; `03-create-forms.js:131-138`.
- Ne sont enregistrées que les lignes avec heures > 0 ou hommes > 0. `03-create-forms.js:499-501`.
- **Ce que ça alimente** : l'« ⏱️ Analyse temps par tâche » (bouton « 🤖 Lancer / relancer l'analyse » du générateur de rapport projet) lit ces heures. `public/js/06-time-analysis.js:5-25`, `public/index.html:1318-1322`. Message si rien n'est saisi : « Aucune heure saisie — remplis le tableau "Heures par tâche" dans les rapports journaliers ». **Les heures par tâche n'apparaissent pas dans le PDF du daily report** (non chargées par le constructeur du PDF). `src/services/dailyAttachments.ts:153-167`, `src/services/pdfService.ts:1042-1056`.

#### 2.3 Trois modes de saisie du journal (onglets)
Onglets « ✏️ Saisie entrée par entrée », « 📋 Import texte libre (IA) », « 🎙️ Dictée vocale ». `index.html:893-897`.

**a) ✏️ Saisie entrée par entrée** (`index.html:900-930`)
- Bloc « ⏱️ Journal de chantier » + compteur « N entrée(s) ». Champ heure (pré-rempli à l'heure actuelle), champ « Tâche liée (optionnel) », zone « Décrivez ce qui a été fait... », bouton « + Ajouter ». Message si vide : « Décrivez ce qui a été fait ».
- Après ajout : liste triée par heure, ✕ pour supprimer, **l'heure avance automatiquement de 30 min**. `03-create-forms.js:140-160`.
- Sans heure : enregistrée « 00:00 ». `03-create-forms.js:144`.
- Bloc « ✅ Avancement tâches » (« Cocher = terminé ») : tâches du projet groupées En cours / À faire / Bloqué / Terminé ; case à cocher = terminé ; bouton « ▶ En cours ». Les statuts sont appliqués aux tâches à l'enregistrement du rapport. `03-create-forms.js:286-341`, `:527-533`.

**b) 📋 Import texte libre (IA)** (`index.html:933-971`)
- Aide : « 💡 Collez votre rapport brut — l'IA va extraire automatiquement les heures, créer les entrées chronologiques et suggérer les tâches correspondantes. »
- Bouton « 🤖 Analyser avec l'IA → Extraire les entrées » (« 🤖 Analyse en cours... »). Message si vide : « Colle ton texte de rapport dabord ».
- Résultat : « ✅ Entrées extraites — vérifie, ajuste et valide : », chaque entrée modifiable (heure + texte), étiquette de catégorie, ✕ ; « 📄 Voir texte source » / « 📄 Masquer texte source » ; « ➕ Ajouter un point manuellement » ; « Recommencer » ; « ✅ Valider et ajouter au journal » (bascule vers l'onglet saisie). `07-auth-mobile-daily-ai.js:793-936`.
- Règles de l'IA : une entrée par point du texte, heure seulement si écrite (jamais inventée), **texte rendu en français** (grammaire corrigée, pas de résumé). `src/routes/ai.ts:62-92`.
- La catégorie proposée par l'IA (arrivée, installation, pause…) est affichée mais **pas enregistrée** ; « suggérer les tâches correspondantes » n'est pas fait (aucune tâche n'est cochée). `07-auth-mobile-daily-ai.js:910-936`.

**c) 🎙️ Dictée vocale** (`index.html:974-1004`)
- « Cliquez pour commencer la dictée » / « 🎙️ Démarrer la dictée » → « 🔴 Enregistrement en cours... » / « ⏹️ Arrêter la dictée » → « Dictée terminée » / « 🎙️ Nouvelle dictée ». Reconnaissance du navigateur, **français uniquement**, transcription en direct ; relance automatique si le navigateur coupe. Navigateur non compatible : « Vocal non supporté sur ce navigateur — essayez Chrome ». `03-create-forms.js:179-283`.
- Import d'un fichier audio : « 🎵 Choisir un fichier audio », « Formats : MP3, M4A, WAV, OGG, WebM, AAC · Max 50 Mo · transcrit automatiquement ». Statuts « ⏳ Transcription en cours (~Ns)... », « ✅ Transcription OK (N caractères) », « ⚠️ Aucun texte détecté dans l'audio ». Transcription en français. `index.html:982-991` ; `07-auth-mobile-daily-ai.js:938-1000` ; `src/routes/ai.ts:171-209`.
- Ensuite : « + Ajouter comme entrée manuelle » (une seule entrée avec l'heure du champ heure) ou « 🤖 Analyser avec l'IA » (passe par l'import IA). `index.html:997-1003` ; `07-auth-mobile-daily-ai.js:1002-1021`.

#### 2.4 Notes, photos, pièces jointes
- « Notes générales / Résumé » (« Résumé, incidents, points importants... »). `index.html:999-1002`.
- « 📸 Photos de la journée » › « 📸 Prendre / Ajouter photos » (images, plusieurs), aperçu 3 colonnes, « N photo(s) sélectionnée(s) ». Envoyées après la création du rapport. `index.html:1003-1011` ; `03-create-forms.js:477-525`.
- « 📎 Pièces jointes » (`index.html:1014-1024`, `public/js/16-daily-attachments.js:161-217`) :
  - cases « ☑️ Joindre la check-list de montage — état actuel (x/y) », « 🔨 Joindre la check-list de démontage… », « 📋 Joindre la check-list de préparation… » — seulement pour les check-lists configurées du projet choisi (`16-daily-attachments.js:66-73`, `:164-175`) ;
  - « 📎 Ajouter un fichier (PDF, photo, Word, Excel) » : PDF, images, .doc/.docx, .xls/.xlsx, .ppt/.pptx, **10 Mo maximum par fichier** (« … : trop lourd (10 Mo maximum) »), contrôle aussi côté serveur (« Fichier trop lourd : 10 Mo maximum. »). `16-daily-attachments.js:7-8`, `:177-185` ; `src/routes/dailyReports.ts:283-302`, `src/services/dailyAttachments.ts:19` ;
  - aide : « PDF et photos : ajoutés lisibles à la fin du PDF du rapport. Check-list : reprise dans le rapport telle qu'elle est maintenant. »
- Bas de fenêtre : compteur « N entrée(s) · N tâche(s) à mettre à jour », « Annuler », « 💾 Sauvegarder », « 📤 Sauv. & Envoyer ». `index.html:1026-1033` ; `07-auth-mobile-daily-ai.js:1023-1035`.

#### 2.5 « 💾 Sauvegarder » vs « 📤 Sauv. & Envoyer »
- Les deux créent le rapport, envoient photos, check-lists cochées et fichiers, mettent à jour les tâches cochées ; toast « Rapport sauvegardé ✅ · N tâche(s) mises à jour ». `03-create-forms.js:492-542`.
- « 📤 Sauv. & Envoyer » **n'envoie pas tout de suite** : il ouvre la fenêtre « 📤 Envoyer le rapport » (voir 3.4). `03-create-forms.js:539`.

---

### 3. Lecture, modification, PDF, envoi, suppression

#### 3.1 Lecture (👁️ ou clic sur la carte dans l'onglet projet)
Fenêtre « 📓 Daily Report — <date> » : projet · ouvriers · météo, « ⏱️ Journal chronologique », « 📝 Notes », « 📸 Photos (N) » (✕ rouge sur chaque photo pour la supprimer directement), « 📎 Pièces jointes (N) » (cliquer = ouvrir le fichier), boutons « 🗑️ Supprimer », « Fermer », « ✏️ Modifier », « 📄 PDF », « 🖨️ Imprimer », « 📤 Envoyer » (si pas encore envoyé). `07-auth-mobile-daily-ai.js:1064-1127`. Les heures par tâche ne sont pas affichées en lecture.

#### 3.2 Modification (« ✏️ Modifier le Rapport »)
`public/js/04-edit-clients-templates.js:538-664`, enregistrement `:963-1010`.
- Champs : « Date », « Météo » (4 valeurs seulement, voir anomalies), « Ouvriers présents », « ⏱️ Heures par tâche » (mêmes règles), « ⏱️ Journal » (lignes heure + description modifiables, ✕, « + Ajouter une ligne »), « Notes générales », « 📸 Photos (N) » (✕ supprimer, ✏️ légende via une petite fenêtre « Légende de la photo : », « 📸 Ajouter photos »), bloc « 📎 Pièces jointes » modifiable, « 🗑️ Supprimer », « Annuler », « 💾 Sauvegarder ».
- **« 🤖 Assistant IA »** (replié par défaut) : « 🤖 Colle un nouveau texte ou enregistre un audio — l'IA extrait les entrées et les **ajoute** à ton journal existant. » ; « 🎙️ Transcrire un audio » (50 Mo max), zone de texte, « 🤖 Analyser & Ajouter au journal ». Les entrées sont ajoutées puis triées par heure ; rien n'est remplacé. `04-edit-clients-templates.js:599-626`, `:731-822`.
- Pas de bloc « ✅ Avancement tâches » en modification.
- Pièces jointes en modification (`16-daily-attachments.js:79-159`) : liste avec ce que devient chaque fichier dans le PDF (« PDF · N page(s) · … · pages ajoutées au PDF du rapport », « Image · … · ajoutée au PDF du rapport », « PDF protégé / illisible · envoyé en lien seulement », « Word / Excel ne s'affiche pas dans un PDF : envoyé en lien (exporte-le en PDF pour qu'il soit lisible dedans) »), check-list jointe « État du <date heure> · x/y OK · ⚠️ N problème(s) · N à vérifier · reprise dans le PDF » avec « ↻ Actualiser » (reprend l'état actuel) et ✕ « Retirer » ; boutons « ☑️ Joindre la check-list de montage (x/y) » etc. pour les check-lists pas encore jointes.

#### 3.3 PDF
- « 📄 PDF » / « 📄 » : fenêtre « 📄 Langue du PDF » → « 🇫🇷 Français » / « 🇬🇧 English » / « Annuler », puis téléchargement. `public/js/01-core.js:22-47` ; `02-detail-loaders.js:579-602`.
- « 🖨️ » / « 🖨️ Imprimer » : même choix de langue, puis le PDF s'ouvre dans un nouvel onglet (« Préparation du PDF… ») pour imprimer avec le navigateur. `16-daily-attachments.js:225-247`.
- Contenu du PDF (`src/services/pdfService.ts:1042-1300`, `src/services/dailyAttachments.ts:152-284`) : en-tête « DAILY REPORT » + projet + n° « REP-… », « Rapport du <date> », infos (auteur, météo, ouvriers, date), **bloc contact client** (nom, contact, e-mail, téléphone, adresse), journal chronologique, notes, liste des pièces jointes, chaque check-list jointe sur une nouvelle page, pages photos, puis annexes (pages des PDF joints, max 100 pages par PDF, et une page par image) avec un bandeau « Daily report du <date> - Annexe n : <nom> - page p/pp ».
- En anglais : journal, notes, légendes de photos, météo et textes de la check-list sont traduits automatiquement. `pdfService.ts:1068-1098`, `:461-480`.

#### 3.4 Envoi (« 📤 Envoyer » ou « 📤 Sauv. & Envoyer »)
Fenêtre « 📤 Envoyer le rapport » (`02-detail-loaders.js:604-706`) :
- « 🌐 Langue du PDF » : « 🇫🇷 Français » (défaut) / « 🇬🇧 English ».
- « 👥 Équipe » : **tous les utilisateurs actifs de VEM ayant un e-mail** (pas seulement l'équipe du projet), **aucun coché par défaut**. `02-detail-loaders.js:605-607`, `:640-648`.
- « 🤝 Client » : e-mail du client du projet, **coché par défaut**. `02-detail-loaders.js:650-657`.
- « ✉️ Adresses manuelles » (une par ligne ou séparées par des virgules).
- « Annuler » / « 📤 Envoyer ». Au moins un destinataire (« Sélectionne au moins un destinataire »). Résultat « Rapport envoyé à N destinataire(s) ✉️ ».
- E-mail : objet « [VEM] Daily Report — <projet> — <date> », texte d'intro FR/EN, entrées du journal, notes, PDF joint ; si les fichiers intégrés dépassent ~18 Mo au total, ils restent en lien (« Autres pièces jointes (liens) »). `src/services/emailService.ts:275-330` ; `src/services/dailyAttachments.ts:22-23`, `:205-207` ; `src/routes/dailyReports.ts:206-243`.
- Après envoi : badge « ✉️ Envoyé », **le bouton « 📤 Envoyer » disparaît** (pas de renvoi possible depuis l'interface). `02-detail-loaders.js:562-565`, `07-auth-mobile-daily-ai.js:1121`.

#### 3.5 Suppression
« 🗑️ » / « 🗑️ Supprimer » → confirmation « Supprimer ce rapport ? » → « Rapport supprimé ». `04-edit-clients-templates.js:1012-1017`.

#### 3.6 Qui peut faire quoi (Daily Reports)
- **Aucune restriction de rôle ni de projet** sur lecture, création, modification, envoi, suppression des daily reports, photos et fichiers : seule la connexion est exigée. `src/index.ts:106` ; `src/routes/dailyReports.ts` (aucun contrôle de rôle). Seule exception : joindre une check-list vérifie l'accès au projet (installateur / site manager non affecté → refus). `dailyReports.ts:311`.

---

### 4. Check-list de montage — où elle apparaît

Phases et libellés : « 📋 Préparation », « 🏗️ Installation », « 🔨 Démontage ». `public/js/15-checklists.js:9`. Statuts : « ⏳ À vérifier », « ✅ OK », « 🟠 Partiel », « ❌ Non fait », « ➖ N.A. ». `15-checklists.js:386-392` ; `src/services/checklistService.ts:15-21`.

| Où | Ce qu'on voit | Preuve |
|---|---|---|
| Projet › « 📋 Infos » (en haut) | carte « 📋 Préparation de l'installation » (« Points à vérifier avant le début du montage (commentaires, photos, documents). ») | `index.html:381` ; `02-detail-loaders.js:30` ; `15-checklists.js:466-469` |
| Projet › « 📓 Daily Reports » (en haut) | carte « ☑️ Check-list de montage » (« À remplir au jour le jour pendant le montage. Elle est reprise automatiquement dans le handover (fiche, PDF, page de signature du client). ») avec un bloc « 🏗️ Installation » et un bloc « 🔨 Démontage » (le bloc Démontage non configuré est masqué pour ceux qui ne peuvent pas configurer) | `index.html:383` ; `07-auth-mobile-daily-ai.js:1039` ; `15-checklists.js:466-468`, `:517-558` |
| Projet › « 🧾 Handover » (en haut) | rappel « ☑️ Check-list de montage » + ligne « ☑️ Check-list : x/y OK · N N.A. · N à reprendre · N à vérifier · ⚠️ N critique(s) ouvert(s) · ✅ validée » + « Remplie dans l'onglet Daily Reports, reprise dans le handover (fiche, PDF, signature). » + boutons d'ouverture + « 📓 Onglet Daily Reports » | `15-checklists.js:487-515`, `:1951-1961` |
| Fiche d'un handover | section « ☑️ Check-list de montage » (statistiques, « Voir le détail des N points », « ✍️ Remplir ») | `15-checklists.js:1970-2018` |
| Admin › « ☑️ Templates check-list » | bibliothèque | `index.html:180`, `:510-519` |
| Carte projet « 📊 Progression » | % de points OK + N.A. sur toutes les phases configurées | `src/services/checklistService.ts:219-260` ; `src/routes/projects.ts:62-74` ; `02-detail-loaders.js:25-26`, `:116` |

Contenu d'un bloc de carte : badge type « Éphémère » / « Permanente », badge « ✅ Validée le … », boutons « 🃏 Remplir en diaporama » + « ☰ Liste » (ou « 🃏 Voir en diaporama » + « ☰ Liste » pour qui ne peut pas remplir), « 📄 PDF / Envoyer », « ⚙️ Configurer la check-list » / « ⚙️ Modifier la sélection » ; barre de progression x/y, compteurs ✅ 🟠 ❌ ➖ ⏳, badges « ⚠️ N critique(s) ouvert(s) », « 📷 N photo(s) manquante(s) ». Non configurée : « Pas encore configurée — le Technical Manager la prépare. » `15-checklists.js:524-548`, `:804-809`, `:433-451`.

---

### 5. Configurer la check-list d'un projet (« ⚙️ Configurer la check-list »)

Réservé à admin, technical_manager, project_manager. `15-checklists.js:8` ; `src/routes/checklists.ts:26`, `:351`.
Fenêtre « ☑️ Configurer la check-list — <phase> » / « ☑️ Modifier la check-list — <phase> » : « Coche les points à contrôler sur ce projet. Ils sont copiés dans le projet : la bibliothèque peut changer ensuite sans toucher à cette check-list. » `15-checklists.js:604-633`.
- « Type de Viewbox » : « ⛺ Éphémère » (points communs à toutes les Viewbox) / « 🏠 Permanente » (points communs + isolation, pare-vapeur, enveloppe) — affiché seulement si la phase contient des points « permanentes ». `15-checklists.js:610-611`, `:681-688`.
- Pré-cochage à la première configuration : tous les points actifs sauf « si présent » et sauf les points « Permanentes » en Éphémère. `15-checklists.js:644-654`.
- Catégories repliables avec case « Tout cocher / décocher » et compteur n/N ; « Tout déplier » / « Tout replier » ; badges des points (PERM, 📷 photo, ⚠️ critique, si présent, désactivé) et « déjà vérifié » si le point a déjà été rempli. `15-checklists.js:690-722`, `:57-64`.
- « Points spécifiques au projet » › « + Point spécifique au projet » : « Point à contrôler * », « Catégorie » (défaut « Points spécifiques au projet »), « 📷 Photo obligatoire », « ⚠️ Critique ». `15-checklists.js:624-629`, `:729-756`.
- « Annuler » / « 💾 Enregistrer » → « Check-list enregistrée ✅ N point(s) · N ajouté(s) · N retiré(s) ». Si des points déjà remplis seraient retirés : confirmation listant ces points (« … vont être retirés de la check-list, avec leurs photos et leur historique … Retirer quand même ? »). `15-checklists.js:765-797` ; `src/routes/checklists.ts:422-435`.
- Ajouter des points à une check-list validée **annule sa validation**. `src/routes/checklists.ts:480-482`.
- Bibliothèque vide : « ☑️ Bibliothèque vide » + « Ouvrir la bibliothèque ». `15-checklists.js:581-597`.

---

### 6. Remplissage plein écran (Liste / Diaporama)

Ouvert par « 🃏 Remplir en diaporama » ou « ☰ Liste » (ou « ✍️ Remplir » dans la fiche handover = dernier mode utilisé). Le choix Liste / Diaporama est mémorisé sur l'appareil. `15-checklists.js:796-841`.
Remplir = admin, technical_manager, project_manager, site_manager ; les autres rôles voient en lecture seule. `15-checklists.js:384` ; `src/routes/checklists.ts:28`.

#### 6.1 En-tête (commun)
« ← Fermer » (avertit s'il reste des points non enregistrés : « N point(s) pas encore enregistré(s) (commentaire manquant ou erreur réseau). Fermer quand même ? »), titre « ☑️ Check-list de montage » / « ☑️ Check-list de démontage » / « 📋 Check-list de préparation », projet · numéro, « 📄 PDF », bascule « ☰ Liste » / « 🃏 Diaporama », barre de progression x/y + badges ⚠️ / 📷. `15-checklists.js:843-855`, `:900-933`, `:1203-1212`.

#### 6.2 Mode « ☰ Liste »
- Bloc infos : badge « Viewbox Éphémère/Permanente », « ✅ Validée le … par … », « 👷 Site Manager : … », « ⚙️ Configurée le … par … », champ « Boxes contrôlées » (« ex: VBX-01 à VBX-12 », pas en préparation). `15-checklists.js:935-958`.
- Filtres « À traiter (n) » (défaut : À vérifier + Partiel + Non fait), « Problèmes (n) » (Partiel + Non fait), « Tout (n) ». `15-checklists.js:870-874`, `:1227-1231`.
- Catégories repliables avec « fermés/total · ⚠️ problèmes ». Légende « ✓ OK · ½ Partiel · ✕ Non fait · N/A Non applicable · ＋ photo / document / commentaire ». `15-checklists.js:962-990`.
- Une ligne par point : libellé (⚠️ critique, 📷 photo obligatoire), précision, « Prénom N. · date heure » de qui a vérifié ; 4 boutons ✓ ½ ✕ N/A ; bouton volet (＋ ou 📷n 📎n 💬). Volet : « Commentaire » + 🎙️ (dictée), tuiles « 📸 Photo » (appareil photo), « 🖼️ Galerie », « 📎 Document », « Historique (n) », « ↺ Remettre à vérifier ». `15-checklists.js:1026-1067`, `:1088-1182`.
- Pied : « Notes générales » (« Remarques sur l'ensemble du montage »), « ✅ Valider la check-list » / « ✅ Valider à nouveau la check-list » (grisé tant qu'il reste des points « À vérifier » : « Il reste N point(s) « À vérifier ». »), avertissement « ⚠️ N point(s) critique(s) pas OK : ils bloqueront la signature du handover. » `15-checklists.js:1215-1235`.

#### 6.3 Règles de remplissage (vérifiées côté serveur)
- **Commentaire obligatoire** pour Partiel, Non fait et N.A. : le statut n'est enregistré qu'avec le commentaire (« Pourquoi « Partiel » ? (obligatoire) », « ⚠️ Commentaire obligatoire : le statut sera enregistré avec le commentaire. »). Serveur : « Commentaire obligatoire pour « … » : explique pourquoi. » `15-checklists.js:385`, `:1245-1262` ; `src/routes/checklists.ts:520-521`.
- **Photo obligatoire** : OK refusé sans au moins une photo (« 📷 Photo obligatoire : prends d'abord une photo de ce point. ») ; un document PDF / Office ne compte pas. On ne peut pas supprimer la dernière photo d'un point OK « photo obligatoire ». `15-checklists.js:1247-1252` ; `src/routes/checklists.ts:522-523`, `:592-593`.
- Commentaire enregistré automatiquement 1,5 s après la frappe ou en quittant le champ. `15-checklists.js:1264-1281`.
- Photos réduites (2000 px, JPEG) avant envoi ; documents 10 Mo max (« « nom » est trop lourd (max 10 Mo) »). `15-checklists.js:1325-1386`.
- Chaque changement de statut est historisé (fenêtre « 🕘 Historique » : ancien → nouveau statut, date, personne, commentaire). Remettre un point « À vérifier » annule la validation. `15-checklists.js:1415-1438` ; `src/routes/checklists.ts:530-543`.
- Validation : confirmation « Valider la check-list ? » (+ avertissement critiques), refusée s'il reste des points « À vérifier ». `15-checklists.js:1440-1455` ; `src/routes/checklists.ts:640-656`.
- Erreur réseau : « Non enregistré (réseau) » + « ↻ Réessayer ». `15-checklists.js:1171-1177`.

#### 6.4 Mode « 🃏 Diaporama »
- Une carte par point : bandeau couleur du statut, catégorie + « n / N » dans la catégorie, « POINT n / N », libellé, précision, « ⚠️ Point critique », « 📷 Photo obligatoire », outils « 📸 Photo » (« 📸 Prendre la photo » si obligatoire), « 🖼️ Galerie », « 📎 Document », « 💬 Commentaire », « Enregistrer et suivant → » quand un commentaire est requis. `15-checklists.js:1600-1670`, `:1739-1756`.
- Barre « stories » en haut : un segment par point (couleur du statut), toucher = aller au point. `15-checklists.js:1673-1694`.
- Boutons en bas : « ↶ Retour », « ✕ NON », « ½ PARTIEL », « N/A », « ✓ OK », « ⏭ Passer » (sans rien changer). `15-checklists.js:1656-1663`.
- Gestes : glisser à droite = OK, à gauche = Non fait (≥ 110 px), tampons « OK » / « NON » ; la carte tremble et reste si une photo ou un commentaire manque. Aide affichée « ⇠ glisser : Non fait · glisser : OK ⇢ ». `15-checklists.js:1494`, `:1767-1781`, `:1850-1898`.
- Clavier (ordinateur) : → OK, ← Non fait, P Partiel, A N/A, Retour arrière = précédent, Espace = passer. `15-checklists.js:1931-1944`.
- La série est figée à l'entrée (filtres « À traiter » / « Problèmes » / « Tout ») et commence au premier point « À vérifier ». `15-checklists.js:1583-1590`.
- Lecture seule : « ‹ Précédent » / « › Suivant ».
- Écran de fin : anneau %, « N / N fermés », « Tout est OK, bravo ! » / « Tout est vérifié » / « Fin de la série » / « Rien dans cette série », compteurs OK / Partiel / Non / N.A. / À vérifier, « ▶ Continuer : N point(s) à vérifier », « ⚠️ Revoir les problèmes (N) », « ↺ Revoir tous les points », « ☰ Voir en liste », puis infos, notes générales et bouton de validation. `15-checklists.js:1900-1928`.

---

### 7. Export « 📄 PDF / Envoyer »

Fenêtre « 📄 <Check-list de …> » — « <projet> · <n°> — état actuel » (`15-checklists.js:2058-2116`) :
- Avertissement si des points ne sont pas encore enregistrés (« ils ne seront pas dans le PDF »).
- « 🌐 Langue du PDF » « 🇫🇷 Français » / « 🇬🇧 English » ; « ⬇️ Télécharger le PDF » ; « 🖨️ Ouvrir pour imprimer ».
- « ✉️ Envoyer par e-mail » (repliable) : client du projet + tous les utilisateurs actifs (équipe du projet en premier, marquée 👷), **rien de coché par défaut**, « Autres adresses (séparées par des virgules) », « Message (facultatif) », « ✉️ Envoyer le PDF » (30 destinataires max). E-mail « [VEM] <titre> — <projet> » avec le PDF. `src/routes/checklists.ts:316-333` ; `src/services/emailService.ts:334-355`.
- « 📓 Joindre à un daily report » (ouvert par défaut, sauf préparation) : « ➕ Nouveau daily report d'aujourd'hui avec la check-list » (crée un rapport vide du jour puis ouvre sa modification) ou un des 8 derniers rapports (« 📓 Daily report du … · Prénom » / « Joindre » ou « ✉️ envoyé »). `15-checklists.js:2104-2181`.
- PDF de la check-list : « État au <date> », tableau par catégorie (point, statut, commentaire, vérifié par), points N.A. regroupés sur une ligne à la fin, 2 photos par point, textes traduits en anglais si EN. `src/services/pdfService.ts:497-668` ; `src/routes/checklists.ts:285-314`.

---

### 8. Effet sur la signature du handover

- Générer le lien de signature est refusé (fenêtre « ⚠️ Check-list de montage incomplète ») si la check-list **Installation** a des points critiques ni OK ni N.A., **ou** des points encore « À vérifier ». Les points Partiel / Non fait non critiques ne bloquent pas. `src/routes/handover.ts:366-390` ; `src/services/checklistService.ts:46-56`.
- Seuls **admin et technical_manager** voient « Générer quand même » (« Le client verra la check-list telle qu'elle est sur la page de signature et dans le PDF. Continuer quand même ? ») ; les autres : « Complète la check-list avant de faire signer le client. Seul un admin ou un technical manager peut générer le lien quand même. » Bouton « ☑️ Ouvrir la check-list ». `15-checklists.js:2021-2047` ; `public/js/09-files-team-users.js:958-963`.
- La page de signature client montre la check-list sans les points N.A. ni les documents (photos seulement). `src/services/checklistService.ts:182-207`.

---

### 9. Admin › « ☑️ Templates check-list »

Page « ☑️ Templates Check-list » — « Points de contrôle du montage, copiés dans la check-list d'un projet à sa configuration ». `index.html:510-519` ; `15-checklists.js:29-174`.
- Visible par tous (le menu Admin n'est pas masqué selon le rôle — À confirmer à l'écran) ; modifiable par admin, technical_manager, project_manager, sinon « Lecture seule : la bibliothèque est modifiée par les admins, technical managers et project managers. » `15-checklists.js:8`, `:126` ; `src/routes/checklists.ts:26`.
- Bibliothèque vide : « Bibliothèque vide » — « La liste Viewbox contient 1 catégorie de préparation, 13 d'installation, 3 de démontage et 116 points. » + **« 📥 Charger la bibliothèque Viewbox »**. Vérifié : 17 catégories, 116 points (`src/services/checklistLibrary.ts:37-192`). Admin seulement : « 🔄 Recharger Viewbox » (efface toutes les modifications de la bibliothèque ; les projets ne changent pas). `15-checklists.js:96-110`, `:202-212` ; `src/routes/checklists.ts:110-145`.
- Onglets de phase « 📋 Préparation (n) », « 🏗️ Installation (n) », « 🔨 Démontage (n) » ; « N point(s) actif(s) · pré-cochés : N en Éphémère, N en Permanente » ; « Tout déplier » / « Tout replier ». `15-checklists.js:117-131`.
- Catégories : « + Catégorie » (« Nom * », « Phase »), ↑ ↓, « + Point », ✏️ « Renommer / changer de phase », 🗑️ (supprime ses points de la bibliothèque, pas des projets). `15-checklists.js:141-147`, `:223-277`.
- Points : « + Point » → « Catégorie * », « Point à contrôler * », « Précision (affichée en petit sous le point) », « Viewbox concernées » (« Toutes (éphémères et permanentes) » / « Permanentes uniquement (PERM) »), cases « 📷 Photo obligatoire », « ⚠️ Critique » (« Doit être OK ou N.A. avant de générer le lien de signature du handover. »), « Si présent » (non pré-coché), « Actif » (en modification) ; « 🗑️ Supprimer » ; sur chaque ligne ↑ ↓ 🚫/♻️ (désactiver / réactiver) ✏️. `15-checklists.js:66-84`, `:289-378`.
- Règle : modifier la bibliothèque ne change jamais une check-list déjà configurée. `15-checklists.js:1-6`, messages de confirmation `:225`, `:375`.

---

### 10. Restrictions de rôle

| Action | Rôles | Preuve |
|---|---|---|
| Voir une check-list de projet | tous sauf « client » ; **installer et site_manager seulement sur les projets où ils sont dans l'équipe ou technical manager** | `src/routes/checklists.ts:79-82` ; `src/middleware/projectAccess.ts:10-30` |
| Remplir (statut, commentaire, photos, documents, notes, boxes, valider) | admin, technical_manager, project_manager, site_manager (+ accès projet) | `src/routes/checklists.ts:26-28`, `:513`, `:557`, `:576`, `:589`, `:625`, `:643` |
| Configurer, modifier la bibliothèque | admin, technical_manager, project_manager | `src/routes/checklists.ts:26`, `:110-262`, `:351` |
| Recharger la bibliothèque d'origine | admin | `src/routes/checklists.ts:113-114` |
| Forcer le lien de signature | admin, technical_manager | `src/routes/handover.ts:370` |
| Daily reports (tout) | tout utilisateur connecté, tous projets | `src/routes/dailyReports.ts` |
Conséquence pour la formation : un **installateur** voit la check-list en lecture seule (« 🃏 Voir en diaporama ») et seulement sur ses projets ; un **site manager** remplit sur ses projets mais ne configure pas.

---

### 11. Éléments masqués à exclure de la formation
- Onglet projet « ✅ Tâches » masqué depuis le 16.10.2026 (« le suivi se fait par la check-list »). `index.html:368`. (Mais le bloc « ✅ Avancement tâches » reste dans la fenêtre Daily — voir anomalies.)
- Section menu « SAV & Stock », onglets projet Tickets / Entrepôt / Boîtes à outils, FAB « Ticket SAV », actions rapides Ticket / Entrepôt. `index.html:125`, `:142`, `:170-176`, `:254`, `:258`, `:372-374`.
- Ancienne « checklist » simple du daily report (cases cochées) : jamais remplie par l'interface actuelle, à ne pas présenter. `src/routes/dailyReports.ts:96`, `pdfService.ts:1208-1228`.
- Fonction `runTimeAnalysis__V1_REMOVED` : code mort. `07-auth-mobile-daily-ai.js:424-790`.

---

### 12. Anomalies / incohérences UX

1. **Photos du rapport sur téléphone** : chaque nouvelle sélection **remplace** la précédente (au lieu de s'ajouter). Prendre 3 photos une par une = seule la dernière est gardée. `03-create-forms.js:478`.
2. **Météo en modification** : « 🌩️ Orage » manque ; un rapport « Orage » modifié puis sauvegardé repasse en « ☀️ Ensoleillé » sans prévenir. `04-edit-clients-templates.js:562-567` vs `index.html:863`.
3. **Supprimer toutes les entrées en modification** ne s'enregistre pas (les anciennes reviennent). `04-edit-clients-templates.js:987` + `src/routes/dailyReports.ts:130-142`.
4. **Changer Installation / Démontage en modification** efface les heures déjà saisies (liste remise à 0). `04-edit-clients-templates.js:671-682`.
5. Champ « Tâche liée (optionnel) » affiché mais **jamais enregistré**. `index.html:911`, `03-create-forms.js:140-146`.
6. Import IA : « suggérer les tâches correspondantes » annoncé mais non fait ; la catégorie proposée est affichée puis perdue ; un texte en anglais est rendu en français. `index.html:935`, `07-auth-mobile-daily-ai.js:910-936`, `src/routes/ai.ts:73`.
7. « 📤 Sauv. & Envoyer » : le **client est coché par défaut** dans la fenêtre d'envoi et la liste « 👥 Équipe » contient **toute l'entreprise**, pas l'équipe du projet (dans l'export check-list, l'équipe est au moins mise en premier). Risque d'envoi au client par réflexe. `02-detail-loaders.js:605-657`.
8. **Impossible de renvoyer** un rapport déjà envoyé (bouton masqué). `02-detail-loaders.js:565`, `07-auth-mobile-daily-ai.js:1121`.
9. Les heures par tâche ne figurent ni dans le PDF ni dans la vue de lecture.
10. Le PDF du daily report contient le **bloc contact client** (e-mail, téléphone, adresse) — à savoir avant de l'envoyer à des tiers. `pdfService.ts:1156-1176`.
11. Page globale Daily Reports : clic sur la carte = modification directe (alors que dans le projet = lecture) ; pas de 👁️ ni de 🗑️ sur cette carte. `02-detail-loaders.js:547-566`.
12. Bouton « 🗑️ Supprimer » de la fenêtre de modification : la fenêtre se ferme même si on annule la confirmation. `04-edit-clients-templates.js:658`.
13. Date par défaut calculée en heure UTC : entre minuit et 1 h/2 h (heure belge), le rapport est daté de la veille. `03-create-forms.js:778-780` (l'export check-list utilise, lui, la date locale : `15-checklists.js:2172-2173`).
14. Erreurs d'envoi de photos ignorées sans message (`catch {}`), et le toast « photos ajoutées » ne s'affiche jamais. `03-create-forms.js:515-536`.
15. « Max 50 Mo » pour l'audio : le service de transcription externe limite probablement à 25 Mo — À confirmer par un essai.
16. Mise en page téléphone : la ligne Projet / Date / Météo / Ouvriers (4 colonnes) et Notes / Photos (2 colonnes) ne passent pas en une colonne (styles en ligne non surchargés par la feuille mobile) — À confirmer à l'écran. `index.html:860`, `:998` ; `public/css/app.css:452`.
17. Textes obsolètes après le déplacement de la check-list vers l'onglet Daily Reports : bibliothèque « Contrôle du montage — onglet Handover… », « Contrôle du démontage — onglet Handover. » ; fiche handover « Pas encore configurée (onglet Handover du projet) ». `15-checklists.js:13-14`, `:1979`.
18. Diaporama en lecture seule : l'aide dit « ⇠ précédent / suivant ⇢ » mais glisser vers la gauche va au **suivant** et vers la droite au **précédent**. `15-checklists.js:1654` vs `:1888`.
19. « Avancement tâches » toujours présent dans la fenêtre Daily alors que l'onglet Tâches est masqué (doublon de suivi avec la check-list).
20. Pas de mise à jour en direct de la check-list chez un collègue (le serveur l'annonce mais l'écran n'écoute pas) : deux personnes qui remplissent en même temps ne voient pas les changements de l'autre avant de rouvrir. `src/routes/checklists.ts:57-59` ; aucun écouteur `checklist:updated` dans `public/js/`.
21. Le bouton d'aide « Remplir » de la note Handover évoqué dans la doc technique n'existe pas tel quel : ce sont les boutons « 🃏 Remplir en diaporama » / « ☰ Liste ».
22. E-mail du daily en anglais : notes probablement restées en français alors que les entrées sont traduites (À confirmer). `pdfService.ts:1089-1095`, `src/routes/dailyReports.ts:233`.

---

### 13. Questions pour le product owner
1. Les installateurs / ouvriers doivent-ils pouvoir voir, modifier et **supprimer** les daily reports de tous les projets ? (aucune restriction aujourd'hui).
2. Faut-il décocher le client par défaut dans « 📤 Envoyer le rapport » et limiter « 👥 Équipe » à l'équipe du projet ?
3. Faut-il permettre de renvoyer un rapport déjà envoyé (correction après envoi) ?
4. Les heures par tâche doivent-elles figurer dans le PDF du daily ?
5. « ✅ Avancement tâches » doit-il rester dans la fenêtre Daily maintenant que le suivi passe par la check-list ?
6. Les installateurs doivent-ils pouvoir cocher la check-list (aujourd'hui : lecture seule) ?
7. Le bloc contact client doit-il rester dans le PDF du daily ?
8. Un point critique « Partiel » ou « Non fait » bloque la signature, un point non critique « Non fait » non : est-ce voulu ?
9. Le menu Admin (dont « ☑️ Templates check-list ») doit-il être caché aux rôles terrain ?

---

### Notes techniques (ne pas mettre en formation)
- Daily : `src/routes/dailyReports.ts` (montage `/api/v1/daily-reports`, `authMiddleware` seul, `src/index.ts:106`) ; route de diagnostic `POST /daily-reports/test-email` (`dailyReports.ts:248-256`) — à ne pas montrer.
- Transcription audio via un service externe (clé d'environnement requise, sinon message d'erreur technique visible par l'utilisateur mentionnant l'hébergeur) : `src/routes/ai.ts:174-178`. Analyse texte et traduction PDF par le service IA (`aiService`).
- Stockage des fichiers chez l'hébergeur d'images : limite 10 Mo par fichier ; upload multer 50 Mo (`src/services/cloudinaryService.ts:16-46`).
- Photos de création : `POST /upload/daily-photo/:reportId` (`src/routes/upload.ts:87-97`) ; photos en modification : `POST /upload/photo` puis `POST /daily-reports/:id/photos`.
- PDF : `buildDailyReportPdf` (`src/services/dailyAttachments.ts:152`), utilisé par `/daily-reports/:id/pdf`, `/send` et `src/routes/reports.ts:18`. Annexes via pdf-lib, 100 pages max par PDF, seuil e-mail 18 Mo.
- Check-list : `src/routes/checklists.ts` (`/api/v1/checklists`), stats `src/services/checklistService.ts`, bibliothèque `src/services/checklistLibrary.ts` (marques [P] [C] [PERM] [opt]), événement socket `checklist:updated` non écouté côté front.
- Préférence de mode : localStorage `vem_checklist_mode`.
- La traduction EN du PDF modifie en mémoire les objets « entries » réutilisés pour le corps de l'e-mail (`pdfService.ts:1089-1093` + `dailyRoutes.ts:234`).

---

## II.7 — Audit 7 — 📸 Visites Client et 🧾 Handover (inventaire formation)

Audit en lecture seule du code au 23.10.2026 (dépôt `/home/user/vem-backend`). Les preuves sont données en `fichier:ligne`. Ce qui n'a pas pu être prouvé par le code est marqué « À confirmer » (à vérifier en test réel).

---

### PARTIE A — 📸 VISITES CLIENT

#### A0. Deux systèmes cohabitent (point essentiel pour la formation)

| Système | Ce que c'est | Où on le crée | Où on le voit |
|---|---|---|---|
| **Visite** (`ClientVisit`) | Un rapport de visite daté qui regroupe plusieurs points | Onglet projet « 📸 Visites Client » › « ➕ Nouvelle visite » | Onglet projet « 📸 Visites Client » (liste des visites), PDF de la visite, envoi par e-mail |
| **Point isolé** (`ClientRemark` sans visite) | Un point « terrain » qui n'appartient à aucune visite | Bouton flottant mobile ＋ › « 📸 Point visite » | **N'apparaît PAS dans l'onglet Visites Client** (l'onglet ne liste que les visites). Visible seulement dans le Rapport projet (section « Visites client ») et dans le Briefing (« ⚠️ Remarques client ») |

Les points d'une visite sont aussi des `ClientRemark` (avec un lien vers la visite) : ils apparaissent donc eux aussi dans le Rapport projet et le Briefing.
Preuves : modèle `prisma/schema.prisma` (ClientRemark.visitId optionnel « FK optionnelle vers ClientVisit ») ; la liste de l'onglet lit `GET /client-visits` `public/js/08-visits-remarks.js:41` ; le point du bouton flottant est créé sans `visitId` `public/js/08-visits-remarks.js:733-741` ; consommateurs de `/client-remarks` : `public/js/06-time-analysis.js:392` (rapport), `public/js/13-briefing-studio-slides.js:752,910`, `public/js/14-briefing-autogen.js:300`.

#### A1. Menu › Terrain › « 📸 Visites Client » (page globale)
- Chemin : barre latérale, section « Terrain », entrée « 📸 Visites Client » (`public/index.html:168`).
- Contenu : **confirmé : aucune donnée affichée**. Titre « 📸 Visites Client », sous-titre « Todo list terrain — points à régler par projet », texte « Sélectionne un projet pour voir ses visites client. » et bouton « → Aller aux Projets » (`public/index.html:428-441`). Rien n'est chargé pour cette page (`public/js/01-core.js:577` : `if (page === 'remarks') {} // loaded per project`).
- Résultat : renvoie simplement vers la liste des projets.

#### A2. Projet › onglet « 📸 Visites Client » — liste des visites
- Chemin : Projets › (ouvrir un projet) › onglet « 📸 Visites Client » (`public/index.html:371`, chargement `public/js/01-core.js:596`).
- En-tête : « 📋 Visites terrain » + compteur « N visite(s) enregistrée(s) » + bouton « ➕ Nouvelle visite » (`08-visits-remarks.js:44-51`).
- Liste vide : grand bouton « Créer la première visite » — « Un rapport de visite contient plusieurs points avec photos » (`08-visits-remarks.js:53-62`).
- Chaque carte de visite : titre, « 📅 date » (+ « 🤝 client » si choisi), notes (2 lignes), pastille « 📸 N point(s) », bouton « 🗑️ » (`08-visits-remarks.js:65-83`). Tri : date de visite la plus récente d'abord (`src/routes/clientVisits.ts:29`).
- Clic sur la carte = ouvre le détail de la visite (A4).
- 🗑️ : confirmation « Supprimer cette visite et tous ses points ? », supprime la visite **et tous ses points** (`08-visits-remarks.js:139-144`, suppression en cascade `clientVisits.ts:107-113`).

#### A3. Créer une visite — fenêtre « ➕ Nouvelle visite terrain »
- Chemin : Projet › 📸 Visites Client › « ➕ Nouvelle visite » (ou « Créer la première visite »).
- Champs (`08-visits-remarks.js:96-107`) :
  - « Titre de la visite * » — **obligatoire** (sinon message « Le titre est obligatoire », `:119`) ; exemple « Ex: Visite client du 4 juin — point d'avancement ».
  - « Date » — date, aujourd'hui par défaut.
  - « Client (optionnel) » — liste de tous les clients de la base, « — Aucun — » par défaut (**pas pré-rempli** avec le client du projet).
  - « Notes (optionnel) » — « Contexte de la visite, personnes présentes... ».
- Boutons « Annuler » / « ➕ Créer ». Un clic à côté de la fenêtre ne la ferme pas (`:114`).
- Résultat : message « Visite créée ✅ », la liste est rechargée et **la visite s'ouvre directement** pour ajouter des points (`:128-133`).
- Le client choisi sert plus tard à proposer son e-mail dans « 📤 Envoyer » (A8).
- Une visite ne peut **pas être modifiée** après création (titre, date, client, notes) : aucun bouton dans l'interface (le serveur le permettrait, `clientVisits.ts:85-105`).

#### A4. Détail d'une visite
- Titre « 📋 <titre> », « 📅 date longue · 🤝 client », notes en italique (`08-visits-remarks.js:227-236`).
- Bloc « 📸 Points (N) » ; si vide « Aucun point pour le moment » (`:239-242`).
- Chaque point (`:175-225`) : numéro, titre, description, pastille de **statut** et pastille de **priorité**, « 📍 zone », sélecteur d'assignation « 👤 » (« — Non assigné — » ou une personne), sélecteur « Priorité : » (🟢 Faible / 🔵 Normal / 🟠 Élevé / 🔴 Critique) — **changements enregistrés immédiatement** (messages « Assigné mis à jour » / « Priorité mise à jour », `:266-277`), photos (clic = agrandir), boutons :
  - « ✅ Marquer OK » (visible tant que le point n'est pas résolu) → statut « Résolu » (`:220`, `:572-575`) ;
  - « 📸 + photo » → ajoute une photo au point (`:221`, `:583-597`) ;
  - « 🗑️ » → « Supprimer ce point ? » (`:222`, `:577-581`).
- Libellés de statut affichés (`:164`) : « Ouvert », « En cours », « Résolu », « Archivé », « ⚡ URGENT ». En pratique seuls « Ouvert » (à la création) et « Résolu » (via « ✅ Marquer OK ») sont atteignables depuis cet écran : **pas de bouton pour rouvrir un point ni pour le passer « En cours »**.
- Le titre, la description et la zone d'un point **ne sont plus modifiables** après création (pas d'écran de modification dans la visite).
- Grand bouton « ➕ Ajouter un point » (`:244-247`).
- Barre du bas : texte « ✓ Visite sauvegardée automatiquement après chaque ajout — tu peux fermer et revenir plus tard » + boutons « 📄 PDF », « 📤 Envoyer », « ✅ Terminer » (`:250-259`).
- « ✅ Terminer » : **ferme simplement la fenêtre** (`:257`). Rien ne change (une visite n'a pas de statut « terminée »).

#### A5. Ajouter un point dans une visite — fenêtre « 📍 Nouveau point »
- Chemin : détail de la visite › « ➕ Ajouter un point » (`08-visits-remarks.js:401-464`).
- Champs :
  - « 📸 Photo(s) » — zone « Ajouter photo(s) », plusieurs photos possibles, aperçu avant enregistrement.
  - « Titre du point * » — **obligatoire** (« Le titre est obligatoire », `:534`) ; ex. « Ex: Trace au mur côté entrée ».
  - « Description (optionnel) » avec bouton « 🎤 Dicter » (dictée continue en français ; devient « ⏹️ Stop » et affiche « 🔴 Enregistrement en cours... » ; message « Reconnaissance vocale non supportée sur ce navigateur » si le navigateur ne le permet pas) (`:428-435`, `:485-530`).
  - « Zone » — texte libre (« Ex: Salle principale, façade nord »).
  - « Priorité » — 🔵 Normal (défaut) / 🟠 Élevé / 🔴 Critique / 🟢 Faible.
  - « Assigner à (optionnel) » — « — Personne (non assigné) — » ou un utilisateur actif.
- Boutons « Annuler » / « ➕ Ajouter ». Résultat : « Point ajouté ✅ », statut « Ouvert », la visite se rouvre (`:566-569`).
- Pas de champ « Action requise » dans ce formulaire (il n'existe que dans le point isolé du bouton flottant, A9).
- ⚠️ **Photos des points : très probablement non enregistrées** — voir anomalie V1 (« À confirmer » par un test : ajouter une photo puis rouvrir la visite).

#### A6. Assignation
- L'assignation d'un point **n'envoie aucune notification ni e-mail** d'après le code (simple mise à jour du point, `src/routes/clientRemarks.ts:47-57`). La personne assignée n'a pas de liste « mes points » dédiée. À confirmer si une notification existe ailleurs : aucune trouvée dans les routes de ce périmètre.

#### A7. « 📄 PDF » de la visite
- Chemin : détail de la visite › « 📄 PDF ».
- Une petite fenêtre « 📄 Langue du PDF » demande « 🇫🇷 Français » / « 🇬🇧 English » / « Annuler » (`public/js/01-core.js:22-47`, appel `08-visits-remarks.js:281`).
- Téléchargement « Visite_xxxxxxxx_fr.pdf » / « _en.pdf » (`08-visits-remarks.js:293`).
- Contenu (`src/services/pdfService.ts:1436` et suivantes) : titre « VISITE CLIENT », n° « VIS-… », date, client, notes, « Points (N) » avec statut (OUVERT / EN COURS / RÉSOLU / URGENT / ARCHIVÉ), priorité (« Priorité Critique / Élevée / Normale / Faible »), zone, « Assigné à », photos.
- En anglais : les textes saisis (titre, notes, titres/descriptions/zones des points) sont **traduits automatiquement** (`pdfService.ts`, bloc « Traduction … si lang !== 'fr' »).
- Ce que ça alimente : **une copie du PDF est ajoutée aux Fichiers du projet** à chaque téléchargement (`clientVisits.ts:151`) → doublons si on télécharge plusieurs fois.

#### A8. « 📤 Envoyer » la visite — fenêtre « 📤 Envoyer le rapport de visite »
- Chemin : détail de la visite › « 📤 Envoyer » (`08-visits-remarks.js:306-376`).
- Contenu : rappel « titre · date » ; « 🌐 Langue du PDF » (🇫🇷 Français coché / 🇬🇧 English) ; « 👥 Équipe » = cases à cocher de **tous les utilisateurs actifs ayant un e-mail** (aucune cochée par défaut) ; « 🤝 Client » = e-mail du client choisi sur la visite, **coché par défaut** (n'apparaît que si la visite a un client avec e-mail) ; « ✉️ Adresses manuelles » (« Une adresse par ligne ou séparées par des virgules »).
- L'utilisateur choisit donc librement les destinataires. Au moins un destinataire obligatoire (« Sélectionne au moins un destinataire »).
- Résultat : « Visite envoyée à N destinataire(s) ✉️ » ; e-mail « [VEM] Rapport de visite — <projet> (<n°>) » avec le PDF en pièce jointe (`src/routes/clientVisits.ts:211-236`). Copie du PDF ajoutée aux Fichiers du projet (`:197`).
- ⚠️ **Le choix « 🇬🇧 English » est ignoré** : l'envoi part toujours en français (anomalie V2).

#### A9. Bouton flottant mobile ＋ › « 📸 Point visite » (point isolé)
- Visible **uniquement sur téléphone / petit écran** (≤ 768 px), barre du bas, bouton central « ＋ » (`public/index.html:121-145`, masqué au-delà de 769 px `public/css/app.css:401-402`). Menu : « 📓 Daily Report », « 🧾 Handover », « 📸 Point visite » (« 🛠️ Ticket SAV » est caché).
- Ouvre « 📍 Nouveau Point Terrain » — « Avec le client sur site » (`08-visits-remarks.js:609-686`), pour le **dernier projet ouvert** (`openAddPointModal(CURRENT_PROJECT_ID)`, `index.html:144`).
- Champs : « 📸 Photo du problème » (« Ajouter une photo » — « Caméra, galerie ou fichier », plusieurs photos) ; « Description du problème * » (obligatoire : « Décris le problème », bouton 🎙️ dictée) ; « 📍 Zone / Emplacement » ; « 🔴 Priorité » (🔴 Critique / 🟠 Élevé / 🔵 Normal (défaut) / 🟢 Faible) ; « ✅ Action requise » (🎙️) ; « 👤 Assigner à » (« — À toute l'équipe — » ou une personne).
- Bouton « 📍 Enregistrer » (« ⏳ Sauvegarde... », deux essais en cas de réseau faible). Résultat « Point enregistré ✅ ».
- Où le retrouver : **nulle part dans l'onglet Visites Client** (point sans visite) ; seulement Rapport projet (section « Visites client ») et Briefing. « Action requise » est stockée comme description.
- Sans projet ouvert : le point ne peut pas être créé (pas de projet) → message d'erreur. Texte exact « À confirmer ».
- Si on a quitté le projet (retour Dashboard), le point est quand même rattaché **au dernier projet ouvert** sans le dire (`CURRENT_PROJECT_ID` n'est pas remis à zéro par la navigation, `public/js/01-core.js:605-607`).
- ⚠️ Même problème de photos que A5 (anomalie V1).

#### A10. Fenêtre « 📸 Nouvelle Visite Client » (index.html) — À EXCLURE
- La fenêtre `modal-new-visite` (champs Projet *, Date *, Heure, Représentant client présent, Assigné à, Description, bouton « ✅ Créer la Visite ») existe dans `public/index.html:758-780` mais **n'est ouverte par aucun bouton** (aucun `showModal('modal-new-visite')` dans le code). Ne pas la présenter. (Si un jour elle était rebranchée, elle créerait un point isolé + une tâche, pas une visite : `public/js/05-templates-trucks-reports.js:231-265`.)

#### A11. Rôles (Visites)
- Tout utilisateur connecté peut créer, modifier, supprimer visites et points, et envoyer les e-mails ; aucune restriction de rôle côté serveur (`src/routes/clientVisits.ts`, `src/routes/clientRemarks.ts` : aucune vérification de rôle ; montées seulement derrière la connexion, `src/index.ts:114-115`) ni côté écran.

---

### PARTIE B — 🧾 HANDOVER

#### B0. Points d'entrée (3, comportements différents)
1. Menu › Terrain › « 🧾 Handover » (page globale, `public/index.html:167`, `:420-426`).
2. Projet › onglet « 🧾 Handover » (`public/index.html:370`, `:384`).
3. Bouton flottant mobile ＋ › « 🧾 Handover » (`public/index.html:143`).
Les trois ouvrent la même fenêtre de création « 🧾 Nouveau Handover ». Mais la page globale et l'onglet projet n'offrent **pas les mêmes boutons** sur les cartes (voir B2/B3).

#### B1. Créer — fenêtre « 🧾 Nouveau Handover »
- Ouverture : « + Nouveau Handover » (page globale `index.html:423` ou onglet projet `07-auth-mobile-daily-ai.js:1134`) ou bouton flottant.
- Sous-titre affiché : « Rapport de réception — SPANTECH » (`public/index.html:1042`) — voir anomalie H9.
- Bloc « 📋 Infos générales » (`index.html:1050-1088`) :
  - « Projet * » — **obligatoire** (« Sélectionne un projet », `03-create-forms.js:549`) ; pré-sélectionné avec le projet ouvert.
  - « Date de réception » — aujourd'hui par défaut. ⚠️ **non enregistrée** (anomalie H3).
  - « Client / Société » : liste « — Choisir dans la base — » **ou** champ « Saisie libre ». Si un projet est ouvert, son client est pré-sélectionné et le nom / l'e-mail / le contact se pré-remplissent (`03-create-forms.js:836-848`, `:866-891`).
  - « Représentant présent » : liste « — Choix base — » (contact du client) ou « ou Saisie libre ». N'est utilisé que si le champ client est vide (`createHandover` envoie `clientName || responsible`, `03-create-forms.js:569`).
  - « Email client (pour envoi PDF) » — « auto-rempli ou saisie libre ». ⚠️ **non enregistré** (anomalie H3).
- Bloc « 🔍 Points d'inspection » (`index.html:1090-1104`, rendu `03-create-forms.js:404-441`) : boutons « 🎙️ Voix » (dicte le nom d'une nouvelle zone, « 🎙️ Parlez la zone... ») et « + Ajouter », grand bouton « ＋ Ajouter un point terrain ». Deux points vides au départ (`03-create-forms.js:824`). Chaque point :
  - nom « Zone / Emplacement... » ;
  - 🎙️ « Dicter commentaire » ;
  - ✕ supprimer ;
  - statut : **« ✅ OK » / « ⚠️ Remarque » / « ❌ Défaut » / « ⏳ En attente »** (libellés exacts, `03-create-forms.js:425-428`) ;
  - « Commentaire... » ;
  - 📸 photo (une à la fois, plusieurs possibles).
  - Les points sans nom sont ignorés ; s'il n'en reste aucun, un point « Inspection générale » (OK) est créé (`03-create-forms.js:558-564`).
- « Notes générales » — « Observations générales... ».
- Boutons « Annuler » / « ✅ Créer le Handover » (« ⏳ Création... »).
- Résultat : « Handover créé ✅ » (+ « N photo(s) uploadée(s) » ou « N photo(s) en échec — voir console »). Statut initial : brouillon. La personne qui crée le handover devient son **Site Manager** (`siteManagerId: CURRENT_USER.id`, `03-create-forms.js:571`) — c'est elle qui recevra le PDF signé par e-mail (B7).
- On peut créer **plusieurs handovers par projet** (aucune limite, `src/routes/handover.ts:63-99`).

#### B2. Projet › onglet « 🧾 Handover »
- En haut : carte rappel « ☑️ Check-list de montage » (stats « ☑️ Check-list : 42/48 OK · … », texte « Remplie dans l’onglet Daily Reports, reprise dans le handover (fiche, PDF, signature). », boutons pour ouvrir la check-list et « 📓 Onglet Daily Reports ») (`public/js/15-checklists.js:492-515`). Détails : audit check-list.
- Bouton « + Nouveau Handover ». Liste vide : « Aucun handover » (`07-auth-mobile-daily-ai.js:1134-1135`).
- Carte d'un handover (`07-auth-mobile-daily-ai.js:1144-1177`) : titre « 🧾 <nom du client> », date de création, Site Manager, « N zone(s) », compteurs « ✅ N OK », « ⚠️ N remarque(s) », « ❌ N défaut(s) », ligne check-list, pastille de statut **« En cours »** (brouillon) / **« ✅ Signé »**, pastilles des zones, boutons « 👁️ Ouvrir », « ✏️ Modifier », « 📄 PDF », « 🔗 Signer », « 🗑️ ». Clic sur la carte = « 👁️ Ouvrir ».
- ⚠️ « 📄 PDF » de cette carte **ne fait rien** (anomalie H1) → utiliser « 📄 PDF » dans la fiche ouverte.
- « 🗑️ » : « Supprimer ce handover ? » (`04-edit-clients-templates.js:1022-1026`) — supprime le handover, ses points et photos. **Seul endroit** où l'on peut supprimer un handover.

#### B3. Menu › Terrain › « 🧾 Handover » (page globale)
- Titre « Handover », sous-titre « Rapports de réception », bouton « + Nouveau Handover » (`index.html:420-426`).
- Liste **de tous les handovers de tous les projets** (pas de filtre) (`02-detail-loaders.js:708-735`, `src/routes/handover.ts:15-33`). Carte : « 🧾 <nom du projet> », client · date, pastille de statut **brute en anglais** « draft » / « signed », boutons « 📄 PDF » et « 📤 Générer & Envoyer », pastilles des zones.
- Pas d'ouverture de la fiche, pas de modification, pas de signature, pas de suppression depuis cette page.
- ⚠️ « 📄 PDF » ici produit un **PDF incomplet** (français seulement, sans signatures, sans étendue des travaux, sans check-list) (anomalie H2).

#### B4. Fiche du handover (« 👁️ Ouvrir »)
- Titre « 🧾 <projet> », « client · date · Site Manager » (`05-templates-trucks-reports.js:321-447`).
- Compteurs « OK », « Remarques », « Défauts » ; pastille « ✅ Signé » / « En attente » ; boutons « + Point », « ✏️ Modifier », « 🔗 Signer », « 📄 PDF ».
- Liste des zones : nom, commentaire, sélecteur de statut (« ✅ OK », « ⚠️ Remarque », « ❌ Défaut », « ⏳ Attente » — libellé raccourci ici), enregistré immédiatement (« Zone mise à jour ✅ », `07-auth-mobile-daily-ai.js:362-368`) ; photos ; « 📸 » pour ajouter une photo (la fiche se recharge).
- Section « ☑️ Check-list de montage » (lecture : type de Viewbox, « ✅ Validée le … », stats, « Voir le détail des N points », « ✍️ Remplir ») (`15-checklists.js:1969-2020`).
- « 📝 notes générales » si présentes.
- « ✍️ Signatures » : deux cadres de signature sur place (voir B6).
- Bas : « Fermer », « ✏️ », « 📄 PDF », « 🔗 Signer », « 📤 Envoyer ».
- « + Point » ouvre « 🔍 Ajouter un point d'inspection » (`10-logistics-bookings.js:413-461`) : « Zone / Emplacement * » (obligatoire, « Indique la zone », 🎙️ dictée), « Statut » (✅ OK / ⚠️ Remarque / ❌ Défaut / ⏳ En attente), « Commentaire » (« Observation... »), « 📸 Photo » (« 📸 Prendre une photo », une photo) ; boutons « Annuler » / « ✅ Ajouter » → « Point ajouté ✅ ».
- Il n'existe **aucun moyen de supprimer ou renommer un point d'inspection** après la création du handover.

#### B5. « ✏️ Modifier » — fenêtre « 📝 Handover Certificate — Champs »
- Sous-titre « Prérempli depuis le projet — modifiez si besoin » (`09-files-team-users.js:799-921`).
- « 📄 Page 1 — Infos projet » : « PROJECT (nom affiché) », « Date de réception », « Client », « Site address (séparée par virgules) », « 📋 Étendue des travaux (Scope of work) » (vide = phrase automatique « Installation et remise en service de la structure événementielle pour le projet « … » incluant N zone(s) inspectée(s). », `pdfService.ts:42`).
- « ✍️ Page 2 — Signatures » : « Comments / Reservations » ; bloc « CLIENT » : « Title », « Name » ; bloc « SPANTECH INTERNATIONAL SA » : « Title » (défaut « Site Manager »), « Name ».
- « 🔍 Points d'inspection (N) » : statut et commentaire de chaque point, enregistrés **dès qu'on change** (sans attendre « Sauvegarder »).
- Boutons « Annuler », « 💾 Sauv. & PDF », « 💾 Sauvegarder » (« Handover mis à jour ✅ »).
- ⚠️ Ce qui arrive réellement dans le PDF : **seuls « Client » et « Étendue des travaux »**. Nom du projet, date, adresse, Title / Name client et Viewbox sont enregistrés mais **ignorés par le PDF** (anomalie H4). « Comments / Reservations » ne s'enregistre pas du tout (anomalie H5).
- Le texte imprimé dans le PDF sous « Remarques / Réservations » = les « Notes générales » saisies à la création (non modifiables ensuite, anomalie H6).

#### B6. Signature sur place (dans la fiche)
- Deux cadres de dessin (doigt ou souris) : « Site Manager — <nom> » et « Client — <nom du client> », chacun avec « Effacer » et « ✅ Valider » (`05-templates-trucks-reports.js:400-427`, `07-auth-mobile-daily-ai.js:310-360`). Cadre vide → « Signez dans le cadre avant de valider ».
- Après validation : « Signature Site Manager enregistrée ✅ » / « Signature client enregistrée ✅ », le cadre devient « ✅ Signé le <date> ».
- N'importe quel utilisateur connecté peut signer dans le cadre « Site Manager » (aucune vérification que c'est bien le Site Manager).
- Statut : passe à « ✅ Signé » **seulement quand les deux signatures sont présentes** (`src/routes/handover.ts:192-198`).
- La signature sur place **n'est pas bloquée** par la check-list incomplète (le blocage ne concerne que le lien 🔗, anomalie H8).

#### B7. « 🔗 Signer » — lien de signature pour le client
- Bouton exact : « 🔗 Signer » (carte de l'onglet projet et fiche) (`07-auth-mobile-daily-ai.js:1166`, `05-templates-trucks-reports.js:364,441`).
- **Blocage check-list** (`src/routes/handover.ts:366-390`) : si la check-list de montage (phase installation) du projet existe et a des points critiques non validés **ou** des points encore « À vérifier », le lien n'est pas créé. Fenêtre « ⚠️ Check-list de montage incomplète » : « N point(s) critique(s) non validé(s) », « ⏳ N point(s) encore « À vérifier » » ; texte « Complète la check-list avant de faire signer le client. Seul un admin ou un technical manager peut générer le lien quand même. » ; boutons « Annuler », « ☑️ Ouvrir la check-list ». Pour **admin et technical manager** : texte « Le client verra la check-list telle qu’elle est sur la page de signature et dans le PDF. Continuer quand même ? » + bouton « Générer quand même » (`15-checklists.js:2023-2045`). Sans check-list configurée : aucun blocage.
- Fenêtre « 🔗 Lien de Signature Client » (`09-files-team-users.js:958-1001`) : « ✅ Nouveau lien généré (les liens précédents pour ce handover sont désactivés) », « Envoyez ce lien au client : » + champ lien + « 📋 Copier » (« Lien copié ✅ »), rappels « 🔒 Lien à usage unique — expire après la première signature », « 📱 Le client peut signer depuis son téléphone ou ordinateur », « ✉️ Vous recevrez le PDF signé par email automatiquement », « ⚠️ Si vous regénérez un lien, l'ancien sera invalidé » ; boutons « Fermer » et « 📧 Envoyer par email » (ouvre la messagerie de l'appareil avec un message prêt « Signature du handover », **destinataire à saisir soi-même**).
- Usage unique : oui (le lien ne marche plus après la signature) ; un nouveau lien annule l'ancien. **Pas d'expiration dans le temps** : un lien non utilisé reste valable indéfiniment (`publicHandoverSign.ts:20-24` ne vérifie que « déjà utilisé »).

#### B8. Page publique de signature (ce que voit le client)
- Page « Signature Handover — VIEWBOX », en **français uniquement** (`public/sign-handover.html`).
- En-tête « VIEWBOX » — « Event Manager — Handover Certificate » (`:186-193`).
- « 📋 Informations Projet » : Projet, N° Interne, Adresse, Client, Site Manager, Date (date de création du handover) (`:195-203`).
- « 📐 Étendue des travaux » (si saisie), « 🔍 Zones inspectées (N) » avec statut OK / Remarque / Défaut / En attente et commentaire — **sans les photos des zones** (`:210-213`, `publicHandoverSign.ts:48-52`).
- « ☑️ Check-list de montage (N points) » : type de Viewbox, boxes contrôlées, « ✅ Validée le … » ou « Check-list pas encore validée », compteurs OK / Partiel / Non fait / À vérifier, alerte points critiques, détail par catégorie avec photos (points N.A. masqués) (`:97-141`).
- « 📝 Remarques / Réservations » (= notes générales), « ✍️ Signature Site Manager » si déjà signée.
- « ✏️ Votre signature » : « Votre nom complet » (pré-rempli, **obligatoire** : « Veuillez saisir votre nom. »), cadre « Signez ci-dessous avec votre doigt ou la souris », mention « En signant, vous confirmez avoir lu et approuvé le contenu de ce handover. », boutons « 🗑️ Effacer » / « ✅ Valider la signature » (`:230-245`, `:302-305`).
- Après signature : « ✅ Signature enregistrée ! — Merci. Une copie du document signé a été envoyée par email à l'équipe VIEWBOX et au client. Vous pouvez fermer cette page. » (`:323-328`).
- Lien déjà utilisé : « ⚠️ Ce lien a déjà été utilisé ou a expiré. Si vous devez signer un nouveau document, demandez un nouveau lien à votre interlocuteur VIEWBOX. » (`:151-157`).
- Effets côté VEM (`src/routes/publicHandoverSign.ts:92-154`) :
  - signature client enregistrée, le **nom du client du handover est remplacé** par le nom tapé par le signataire ;
  - statut « ✅ Signé » **seulement si le Site Manager avait déjà signé** ; sinon reste « En cours » jusqu'à la signature Site Manager dans la fiche ;
  - PDF signé (en **français**, pas de choix) rangé dans les Fichiers du projet (« Handover_<n°>_signed.pdf ») ;
  - e-mail « [VEM] Handover signé — <projet> » avec le PDF à : **le Site Manager du handover (= la personne qui l'a créé)** et **l'e-mail du client du projet** (fiche client de la base). Pas l'e-mail saisi dans la fenêtre de création (non enregistré), pas la personne qui a généré le lien si ce n'est pas elle qui a créé le handover.

#### B9. « 📄 PDF » du handover
- Depuis la fiche (« 📄 PDF ») ou « 💾 Sauv. & PDF » : fenêtre « 📄 Langue du PDF » 🇫🇷 Français / 🇬🇧 English (`01-core.js:75-77`). Fichier « Handover_xxxxxxxx_fr.pdf ».
- Contenu (`pdfService.ts:729-1040`) : « HANDOVER REPORT », « CERTIFICAT DE RÉCEPTION » / « HANDOVER CERTIFICATE », « Informations Projet » (Projet, N° Interne, Adresse, Client, Entrepreneur = « VIEWBOX International SA », Site Manager, « Date réception » = date de création), « Étendue des travaux », « Certification » (deux paragraphes fixes), « Zones inspectées » (statut + commentaire + photos), section check-list de montage, « Remarques / Réservations » (notes générales), « Signatures » : CLIENT (Titre « Représentant du client », Nom, Signature) et « VIEWBOX International SA » (Titre « Site Manager », Nom, Signature).
- En anglais : textes saisis traduits automatiquement.
- Chaque téléchargement **ajoute une copie aux Fichiers du projet** (doublons) (`src/routes/handover.ts:360`).
- Depuis la page globale : PDF incomplet (H2) ; depuis la carte de l'onglet projet : bouton cassé (H1).

#### B10. « 📤 Envoyer » / « 📤 Générer & Envoyer »
- Fenêtre « 📤 Envoyer le handover » (`02-detail-loaders.js:750-847`) : « 🌐 Langue du PDF » (🇫🇷 / 🇬🇧, **respectée** ici), « 👥 Équipe » (tous les utilisateurs actifs avec e-mail, aucun coché), « 🤝 Client » (e-mail de la fiche client du projet, coché par défaut, si présent), « ✉️ Adresses manuelles ». Au moins un destinataire.
- Résultat : « Handover envoyé à N destinataire(s) ✉️ » ; e-mail « [VEM] Rapport de handover — <projet> (<n°>) » / « [VEM] Handover Report — … » avec le PDF (`src/routes/handover.ts:233-316`). Copie dans les Fichiers du projet.

#### B11. Statut du projet
- **Signer un handover ne change pas le statut du projet** (ni « 🧾 Handover », ni « 🧾 Handover OK ») : aucune ligne du code de ce périmètre ne modifie le projet (`src/routes/handover.ts`, `src/routes/publicHandoverSign.ts`). Le statut projet « Handover OK » existe (`02-detail-loaders.js:13`) mais se règle à la main sur le projet.

#### B12. Rôles (Handover)
- Tout utilisateur connecté peut créer, modifier, supprimer, signer, générer un lien et envoyer (aucune vérification de rôle dans `src/routes/handover.ts`, monté derrière la connexion `src/index.ts:102`).
- Seule exception : « Générer quand même » le lien malgré une check-list incomplète = **admin et technical manager** (`handover.ts:370`).
- La page de signature client est publique (sans compte), accès par le lien uniquement (`src/index.ts:93`).

---

### PARTIE C — Éléments masqués / morts à exclure de la formation
- Fenêtre « 📸 Nouvelle Visite Client » (`index.html:758-780`) : jamais ouverte.
- « 🛠️ Ticket SAV » du bouton flottant (`index.html:142`, `display:none`), onglets projet Tickets / Entrepôt / Boîtes à outils / Tâches masqués (`index.html:368-374`).
- Fonctions sans bouton : `editHandoverInfo` « ✏️ Modifier Handover » (`08-visits-remarks.js:1-29`), `openPointDetail` « ✏️ Modifier le Point » (`:807-872`), `resolveRemark`, `uploadPointPhoto`, `assignPointQuick`, `exportVisitePDF` « 📋 RAPPORT DE VISITE TERRAIN » (`:910-1005`), `updatePointStatus` (`09-files-team-users.js:785-795`), `buildTerrainPDFHeader` (`06-time-analysis.js:1152`), champ `handover-site-manager` (`03-create-forms.js:827`, inexistant dans la page).

---

### PARTIE D — Anomalies / incohérences

#### Visites
- **V1 — Photos des points de visite probablement jamais enregistrées.** Le navigateur envoie l'adresse de la photo déjà téléversée (JSON) à `POST /client-remarks/:id/photos`, mais cette route attend un fichier (`upload.single('file')`) et répond « Fichier manquant » (`src/routes/clientRemarks.ts:66-75` vs `08-visits-remarks.js:558-560, 591, 763-767`). L'écran affiche quand même « Point ajouté ✅ » / « Photo(s) ajoutée(s) ». À confirmer par un test, mais le code est sans ambiguïté.
- **V2 — Langue de l'envoi de visite ignorée** : la fenêtre propose 🇬🇧 English mais `submitSendVisit` n'envoie pas la langue → toujours français (`08-visits-remarks.js:389` ; le serveur l'accepterait, `clientVisits.ts:165`).
- **V3 — Points du bouton flottant invisibles dans l'onglet Visites Client** (A0, A9) ; rattachés au dernier projet ouvert même après l'avoir quitté.
- **V4** — Libellés incohérents : menu / onglet « 📸 Visites Client », en-tête de l'onglet « 📋 Visites terrain », sous-titre de la page « Todo list terrain », écran vide initial « 🔁 Aucune remarque » (`index.html:385`), PDF « VISITE CLIENT ».
- **V5** — Dictée : « 🎤 Dicter » (visite) vs « 🎙️ » (ailleurs) ; deux formulaires de point différents (visite : Titre + Description ; flottant : Description du problème + Action requise).
- **V6** — Pas de modification de la visite ni d'un point (titre, zone, description) ; pas de retour « Ouvert » après « ✅ Marquer OK » ; « ✅ Terminer » ne fait que fermer.
- **V7** — Le client de la visite n'est pas pré-rempli avec le client du projet ; l'e-mail client proposé à l'envoi dépend de ce choix.
- **V8** — Message d'erreur technique possible à l'utilisateur : « SQL client_remarks manquant dans Railway » (`08-visits-remarks.js:778`).

#### Handover
- **H1 — « 📄 PDF » de la carte (onglet projet) cassé** : appelle `generateHandoverPDF`, fonction inexistante (`07-auth-mobile-daily-ai.js:1165`) → rien ne se passe.
- **H2 — « 📄 PDF » de la page globale = ancien PDF** (`/reports/handover/:id`, `02-detail-loaders.js:737-748`, `src/routes/reports.ts:33-75`) : français seulement, sans signatures, sans étendue des travaux, sans check-list.
- **H3 — Champs de création non enregistrés** : « Date de réception », « Email client (pour envoi PDF) » et (si client rempli) « Représentant présent » ne sont pas envoyés (`03-create-forms.js:568-574`). Le PDF et la page client affichent la date de **création**.
- **H4 — Champs du certificat ignorés par le PDF** : les champs de « 📝 Handover Certificate — Champs » sont stockés mais le PDF ne les reçoit pas (aucune des routes ne transmet `customFields` : `handover.ts:263-275, 345-357`, `publicHandoverSign.ts:115-127`, `reports.ts:62-69`). Seuls « Client » et « Étendue des travaux » sont pris en compte.
- **H5 — « Comments / Reservations » ne fonctionne pas** : balise mal écrite `<textarea clasid="hf-comments">` (`09-files-team-users.js:861`), l'écran cherche `hf-comments-area` (`:913`) → ni pré-rempli ni enregistré.
- **H6** — Les « Notes générales » (imprimées « Remarques / Réservations ») ne sont plus modifiables après création (le certificat lit un champ `hf-projectSummary` qui n'existe pas, `09-files-team-users.js:946`).
- **H7** — Statuts affichés différemment : « En cours » (carte projet), « En attente » (fiche), « draft » / « signed » brut (page globale) ; « ⏳ En attente » vs « ⏳ Attente ».
- **H8** — Le blocage check-list ne s'applique qu'au lien 🔗 ; la signature client sur place dans la fiche passe outre.
- **H9 — Marque** : sous-titre « Rapport de réception — SPANTECH », bloc « SPANTECH INTERNATIONAL SA » dans le certificat, mais PDF / page client / e-mails disent « VIEWBOX International SA » / « l'équipe VIEWBOX ». Titre PDF « HANDOVER REPORT » même en français.
- **H10** — Le texte du lien « ✉️ Vous recevrez le PDF signé par email » n'est vrai que pour la personne qui a **créé** le handover (Site Manager) ; le message de la page client « envoyée … à l'équipe VIEWBOX et au client » suppose une fiche client avec e-mail.
- **H11** — PDF signé par le client toujours en français ; page client en français uniquement.
- **H12** — Pas d'expiration du lien dans le temps, alors que la page parle de lien « expiré ».
- **H13** — Chaque téléchargement / envoi de PDF (visite ou handover) ajoute une copie dans les Fichiers du projet → doublons.
- **H14** — Pas de suppression / renommage d'un point d'inspection après création ; suppression du handover seulement depuis l'onglet projet.
- **H15** — Le titre de carte diffère : nom du client (onglet projet) vs nom du projet (page globale).
- **H16** — En cas d'erreur à la création, le bouton revient avec le texte « ✅ Créer et signer » au lieu de « ✅ Créer le Handover » (`03-create-forms.js:625`).
- **H17** — Fiche handover sans check-list : texte « Pas encore configurée (onglet Handover du projet) » alors que la check-list se configure désormais dans l'onglet Daily Reports (`15-checklists.js:1979`).
- **H18** — Page globale Handover : liste tous les handovers de tous les projets, sans filtre ni recherche ; boutons différents de l'onglet projet.

---

### PARTIE E — Questions pour le product owner
1. Les points isolés du bouton flottant « 📸 Point visite » doivent-ils apparaître dans l'onglet Visites Client (ou être rattachés à une visite du jour) ?
2. Faut-il corriger V1 (photos des points) en priorité avant la formation ?
3. La « Date de réception » et l'« Email client » de la création doivent-ils être enregistrés et utilisés (PDF, envoi du PDF signé) ?
4. Les champs Title / Name / adresse / nom du projet du certificat doivent-ils figurer dans le PDF ? Le bloc doit-il dire SPANTECH ou VIEWBOX ?
5. Signer doit-il faire passer le projet en « 🧾 Handover OK » automatiquement ?
6. Le blocage check-list doit-il aussi s'appliquer à la signature client sur place ?
7. Qui doit recevoir le PDF signé (Site Manager créateur, technical manager, e-mail saisi, contact client) ? Faut-il une version anglaise de la page / du PDF signé ?
8. Un lien de signature doit-il expirer après N jours ?
9. Restreindre la création / suppression de handovers et la signature « Site Manager » à certains rôles ?
10. Garder la page globale « Handover » (avec son ancien PDF) ou la rediriger vers les projets comme « Visites Client » ?
11. Un point de visite doit-il pouvoir être rouvert / passé « En cours », et la visite modifiée ?
12. Faut-il éviter les doublons de PDF dans les Fichiers du projet ?

---

### PARTIE F — Notes techniques (NE PAS mettre en formation)
- Routes : `/api/v1/client-visits` (`src/routes/clientVisits.ts`), `/api/v1/client-remarks` (`src/routes/clientRemarks.ts`), `/api/v1/handover` (`src/routes/handover.ts`), publique `/api/v1/public/handover-sign/:token` (`src/routes/publicHandoverSign.ts`), ancien PDF `/api/v1/reports/handover/:id` (`src/routes/reports.ts:33`).
- Modèles : `Handover` (status `draft` | `signed`, `customFields` JSON, `signatureToken` / `signatureTokenUsed` / `signatureTokenCreatedAt`), `HandoverItem`, `HandoverPhoto` (via `/upload/handover-photo`, `itemId`), `HandoverItemPhoto` (via `/handover/:id/items/:itemId/photo`) ; `ClientVisit`, `ClientRemark` (`visitId` optionnel, status texte, `priority` enum ; pas de colonne `resolutionNotes`), `ClientRemarkPhoto`.
- Jeton de signature : `crypto.randomBytes(32).toString('base64url')`, invalidé seulement par `signatureTokenUsed` ou régénération ; `signatureTokenCreatedAt` non vérifié.
- Blocage : `checklistSummaries([projectId])` phase `installation`, 409 si `criticalOpen > 0 || pending > 0`, `force` accepté pour `admin` / `technical_manager`.
- PDF : `generateHandoverPdf` / `generateVisitReportPdf` (`src/services/pdfService.ts:729`, `:1436`), traduction automatique des textes saisis pour `lang=en` (service IA de traduction), archivage `saveProjectFilePdf` (stockage fichiers distant + table `project_files`, catégories `handover` / `visite_client`).
- E-mails : `sendMail` (`src/services/emailService.ts:180`) via relais externe ; sujets `[VEM] …`.
- Bug V1 : `clientRemarks.ts:66` `upload.single('file')` + JSON → `req.file` absent → 400.
- Bug H1 : `generateHandoverPDF` non défini (`07-auth-mobile-daily-ai.js:1165`) ; il existe `downloadHandoverPDF` (ancien) et `downloadHandoverPdf` (nouveau).
- Bug H5 : `09-files-team-users.js:861` `clasid=` ; `:913` `hf-comments-area`.
- Message d'erreur exposant l'hébergeur : `08-visits-remarks.js:778`.
- Aucun contrôle d'accès par projet / rôle sur ces routes (`projectAccess` non utilisé ici).
