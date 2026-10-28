# PROMPT — Demandes d'infos par mail (VEM)

Rôle : ingénieur logiciel senior + chef de projet senior sur VEM (Express + Prisma + front `public/js`, déployé par Railway).
Demande d'A. Pinchart (28.10.2026) : depuis un projet, envoyer à la bonne personne les bonnes questions sur les infos
qui manquent ; la personne répond **en répondant au mail** (modèle dans le mail) et l'info entre toute seule dans le
projet ; rappels automatiques sur ce qui n'a pas été répondu, rythme réglable et selon l'urgence ; on peut tout
arrêter ; une info saisie à la main dans VEM arrête ses rappels.

## 1. Parcours

1. Fiche projet › bouton **« 📨 Demander des infos »** (en-tête du projet et carte « Demandes d'infos » de l'onglet Infos).
2. Fenêtre « Demander des infos » :
   - liste des infos qu'on peut demander, groupées (Lieu · Dates · Équipe · Logistique · Infos pratiques), avec la
     valeur actuelle dans VEM ; ce qui est vide est pré-coché ;
   - pour chaque info cochée : **« À qui ? »** (menu déroulant : personnes VEM avec e-mail, contacts du client du
     projet, « Autre adresse e-mail… ») et **« Pour le »** (date à laquelle on en a besoin, pré-remplie selon l'info :
     ex. camions = 14 jours avant le montage) ; le dernier destinataire choisi pour chaque info est retenu
     (ex. camions → Tao) ;
   - **questions libres** (texte + destinataire) ;
   - **rappels** : « Selon l'urgence (recommandé) » · « 2 fois par jour » · « Tous les jours » · « Tous les 2 jours » ·
     « Toutes les semaines » · « Personnalisé (toutes les N heures) » · « Aucun rappel » ; premier rappel si pas de
     réponse après 24 h (12 / 24 / 48 h) ; pas de rappel le week-end (coché) ; au plus N rappels (20) ;
   - langue du mail FR / EN, message perso facultatif ;
   - résumé « Norick recevra 3 questions · Tao 1 question » + aperçu du rythme, **« 👁 Aperçu du mail »**, **« 📨 Envoyer »**.
3. Un mail **par destinataire** (toutes ses questions du projet regroupées), référence unique `INFO-XXXXXX` dans le
   sujet.
4. La personne répond :
   - **en répondant au mail** : elle écrit sa réponse après chaque numéro (`1 : Tour & Taxis, Bruxelles`) ou dans le
     modèle `[1] … :` repris dans la réponse ;
   - **bouton « ✉️ Répondre par mail »** : ouvre un nouveau mail déjà adressé, avec la référence et le modèle à remplir ;
   - **bouton « 📝 Répondre en ligne »** (secours, le plus sûr pour les dates) : page publique avec un champ par question.
5. VEM lit la réponse (boîte IMAP déjà relevée toutes les 5 min, `warehouseviewbox@gmail.com`), remplit le projet,
   prévient le demandeur (notification VEM), répond « bien reçu » à la personne (ce qui est rempli, ce qui reste).
6. Rappels : seulement les questions encore en attente, mêmes numéros, jusqu'à la réponse, l'arrêt ou le maximum.

## 2. Infos demandables (catalogue serveur `infoRequestLogic.ts` `INFO_FIELDS`)

| Clé | Libellé | Type | Où ça va | Rempli à la main = détecté |
|---|---|---|---|---|
| address | Adresse de montage | texte | `projects.address` | valeur changée et non vide |
| city | Ville | texte | `projects.city` | idem |
| installationStart / installationEnd | Début / fin du montage | date (+ heure) | `projects.*` | date changée |
| dismantlingStart / dismantlingEnd | Début / fin du démontage | date (+ heure) | `projects.*` | date changée |
| workersCount | Nombre de monteurs | nombre | `projects.workers_count` | valeur changée |
| team | Équipe : qui vient ? | liste de noms | `project_team` (noms reconnus dans VEM ; les autres en note) | membre ajouté depuis l'envoi |
| trucks | Camions : quel camion arrive quand ? | texte libre | camions en brouillon (extraction IA existante `bookingFromEmail`) | camion ajouté depuis l'envoi |
| hotels | Hôtel | texte libre | hôtels en brouillon (idem) | hôtel ajouté depuis l'envoi |
| teamTravel | Trajets de l'équipe | texte libre | trajets en brouillon (idem) | trajet ajouté depuis l'envoi |
| siteContact | Contact sur place | texte | ajouté aux notes d'installation | — (réponse ou « marquer reçu ») |
| siteAccess | Accès, horaires, déchargement | texte | ajouté aux notes d'installation | — |
| dismantleInfo | Infos démontage | texte | ajouté aux notes de démontage | — |
| custom | Question libre | texte | ajouté aux notes globales du projet | — |

« Rempli à la main » : chaque question garde la valeur au moment de l'envoi (`before`) ; si la valeur du projet change
(ou qu'un camion / membre / hôtel est ajouté après l'envoi), la question passe « ✏️ Rempli dans VEM » et ses rappels
s'arrêtent. Contrôlé avant chaque rappel, à l'ouverture de la carte et après chaque modification du projet.

## 3. Lecture des réponses (pur, testé : `infoRequestLogic.ts`)

- Référence : `INFO-` + 6 caractères sans ambiguïté, cherchée dans le sujet puis le corps.
- Interceptée **avant** la logique existante du relevé IMAP (sinon le n° interne dans le sujet déclencherait l'extraction
  de réservations) ; aussi dans le webhook Brevo.
- Ignorés : réponses automatiques (absence, `Auto-Submitted`, `X-Autoreply`, sujet « Réponse automatique / Out of
  office »), non-distribution (mailer-daemon → événement « ⚠️ mail non distribué » + notification).
- Modèle `[n] libellé (format) : réponse` (réponse sur la ligne ou les lignes suivantes, jusqu'au prochain `[n]`, la
  ligne `----- FIN -----`, une signature ou un en-tête de citation). Numéros simples `1 :`, `1)`, `1.`, `1 -` acceptés
  seulement dans le texte écrit par la personne (avant l'en-tête de citation). Première réponse non vide gagne.
- Réponses vides, `?`, « je ne sais pas », « pas encore », « TBC »… = pas de réponse (la question reste en attente).
- Dates : `12/11/2026`, `12/11`, `12-11-26`, `2026-11-12`, `12 novembre`, `Nov 12`, heure `8h`, `8h30`, `08:30`, `2pm` ;
  sans année = la prochaine ; heure de Bruxelles ; sans heure = minuit (VEM affiche alors la date seule).
- Texte libre sans modèle ou réponse non comprise : **IA (Claude, `callClaudeJSON`)** sur les seules questions en
  attente, texte cité retiré ; la valeur repasse par les mêmes contrôles (une date doit être une vraie date). Marquée
  « via IA ». Sans clé IA : réponse gardée, « non comprise », la question reste en attente et le demandeur voit le texte.
- Une réponse à une question arrêtée ou déjà remplie dans VEM est gardée dans l'historique, **jamais appliquée**.
- Expéditeur différent du destinataire : accepté (collègue qui répond à sa place), noté dans l'historique.

## 4. Rappels (pur : `nextReminderAt`)

- Rythme fixe : toutes les N heures (6 h = 2 fois par jour, 24 h, 48 h, 168 h, personnalisé ≥ 2 h).
- **Selon l'urgence** : basé sur la date « pour le » la plus proche parmi les questions encore en attente :
  plus de 7 jours avant → 1 par semaine ; de 7 à 2 jours → 1 par jour ; moins de 2 jours ou en retard → 2 par jour.
  Un changement de palier déclenche un rappel au début du palier (ex. J-7), puis le nouveau rythme.
  Exemple d'A. Pinchart : event dans 2 mois, camions utiles 2 semaines avant → hebdo pendant ~1,5 mois, puis quotidien,
  puis 2×/jour.
- Premier rappel : après min(24 h — réglable —, intervalle du rythme).
- Fenêtre d'envoi : 8 h – 18 h heure de Bruxelles, lundi–vendredi si « pas le week-end » ; hors fenêtre → début de la
  fenêtre suivante.
- Arrêt : toutes les questions répondues / remplies / arrêtées, bouton « ⏹ Arrêter », maximum de rappels atteint
  (notification au demandeur), projet terminé ou annulé.
- Tâche de fond toutes les 5 min (`INFO_REQUESTS_TICK_MIN`), chaque rappel « réservé » par une mise à jour conditionnelle
  (pas de double envoi).

## 5. Données (Prisma + SQL idempotent dans `runStartupMigrations()`)

- `info_requests` : projet (cascade), `ref` unique, `web_token` unique (32 car.), destinataire (user VEM ou e-mail +
  nom), langue, message, statut `open | done | stopped`, `plan` JSON (mode, intervalle, premier rappel, week-end, max),
  `next_reminder_at`, `reminders_sent`, `last_sent_at`, `history` JSON (envoi, rappel, réponse, appliqué, arrêt, erreur),
  `created_by`.
- `info_request_items` : demande (cascade), `number` (stable), `field`, `label`, `question` (libre), `kind`,
  `needed_by`, statut `pending | answered | received | filled | stopped`, `before`, `answer_raw`, `answer_value`,
  `answered_at`, `source` (`email`, `email-ai`, `web`, `app`, `manual`), `note`.

## 6. API

Authentifié, rôles « tous les projets » + site manager (contrôle `assertProjectAccess`) :
`GET /api/v1/info-requests/fields` · `GET /status` (mail / IMAP / IA configurés, adresse de réponse) ·
`GET /project/:projectId` (synchronise puis liste + valeurs actuelles + contacts) · `POST /project/:projectId`
(crée et envoie, un mail par destinataire) · `POST /project/:projectId/preview` (HTML du mail) ·
`PATCH /:id` (rythme, arrêter / reprendre) · `POST /:id/remind` (rappel maintenant) · `DELETE /:id` ·
`PATCH /items/:itemId` (`stop`, `resume`, `done` = marquer reçu).
Public : page `/info/:token` (`public/info-request.html`) + `GET/POST /api/v1/public/info-request/:token`
(limitée en débit).

## 7. Hors périmètre (étapes suivantes possibles)

Vue « toutes les demandes en cours » sur le tableau de bord ; modèles de demandes (« demande standard d'un nouveau
projet ») ; relance par WhatsApp / Telegram ; réponses vocales.

## 8. Contrôle

Typecheck `npx tsc --noEmit -p .` ; tests de la logique pure (lecture des réponses, dates, rythme) ; essai bout en bout
sur une base PostgreSQL locale (création → mail (journal) → réponse simulée → projet rempli → rappels → arrêt manuel).
