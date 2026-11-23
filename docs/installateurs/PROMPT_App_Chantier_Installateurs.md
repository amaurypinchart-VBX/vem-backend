# VEM Chantier — l'application des installateurs

Cahier des charges — A. Pinchart, 23.11.2026 (discussion + réponses du même jour).

## 1. But

Une petite application **pour les installateurs sur chantier** (ouvriers, intérimaires, indépendants), pensée pour des personnes qui ne sont pas à l'aise avec un téléphone :

- **gros boutons**, peu de texte, une seule chose par écran ;
- **téléphone d'abord** (une main, en extérieur, avec des gants si possible) ;
- **4 langues** : français, anglais, néerlandais, polonais — changeables d'un appui en haut de chaque écran ;
- les installateurs ne voient **que leurs projets**, et seulement **pendant la période du chantier** ;
- le **chef d'équipe** remplit la **feuille de temps de toute l'équipe** (plusieurs tâches par jour, avec heures, personnes, quantités, commentaire) ;
- les feuilles sont **validées** par le site manager, puis **exportées vers Odoo** (fichier Excel d'abord, liaison directe plus tard) ;
- les **tâches** viennent surtout **d'Odoo** (import), mais peuvent aussi être créées dans VEM.

Ce n'est pas le VEM complet : c'est une page à part (`/chantier`), installable comme une icône sur l'écran d'accueil du téléphone.

## 2. Décisions (A. Pinchart, 23.11.2026)

| Sujet | Décision |
|---|---|
| Qui remplit la feuille de temps | **Le chef d'équipe, pour toute l'équipe.** Plusieurs tâches par jour. |
| Langues | **FR, EN, NL, PL**, sélecteur toujours visible en haut. |
| Installateurs dans Odoo | **Pas nécessairement** : surtout intérimaires / indépendants. Au départ : on considère qu'ils **n'ont pas** de fiche employé Odoo. |
| Tâches | Elles **existent déjà dans les projets Odoo** → **import Odoo → VEM** (cas principal). On doit **aussi** pouvoir en créer dans VEM. Les deux sens. |
| Validation | **Obligatoire** avant export (site manager / responsable). |
| Liaison Odoo | **Fichier Excel** à importer dans Odoo pour commencer. Écriture directe dans Odoo plus tard, après accord de l'informaticien. |
| Page d'un projet | Gros boutons. **Infos** (adresse du chantier, contacts, planning) dans un bouton « Infos ». |
| Accès dans le temps | Visible de **2 semaines avant l'installation** à **2 semaines après le démontage** ; après, il faut **redonner l'accès**. |

## 3. Parcours de l'installateur

### 3.1 Invitation et connexion

1. Au bureau (admin, technical manager, project manager, site manager du projet) : « 📲 Inviter un installateur » → nom, téléphone, langue, projet(s), chef d'équipe ou non → un **lien** (envoi WhatsApp / SMS / copier) et un **QR code** (à scanner sur place, sur le téléphone du gars).
2. Le gars ouvre le lien : il voit son nom, choisit sa **langue** (4 drapeaux), choisit un **code à 4 chiffres** (deux fois). C'est tout — **pas d'e-mail, pas de mot de passe**.
3. L'écran propose « 📌 Ajouter à l'écran d'accueil » (avec un petit dessin pour iPhone / Android).
4. Il reste **connecté 90 jours** sur ce téléphone. Pour se reconnecter : son numéro de téléphone + son code.
5. Code oublié : le bureau ou le chef d'équipe lui envoie un **nouveau lien** (bouton « 🔁 Nouveau lien »).

Sécurité : 5 codes faux ⇒ blocage 15 min puis nouveau lien nécessaire ; lien d'invitation valable 7 jours, utilisable une fois.

### 3.2 Accueil : « Mes chantiers »

- Une **grosse carte par projet** : nom, ville, dates (« Installation 2–6 déc. »), une pastille « Aujourd'hui » si le chantier est en cours.
- Seulement les projets où il est **dans l'équipe** et **dans la période d'accès** (§ 5).
- Aucun projet : message simple « Aucun chantier pour le moment — appelle ton responsable » + bouton 📞.

### 3.3 Page d'un projet : 5 gros boutons

| Bouton | Contenu |
|---|---|
| ℹ️ **Infos** | Adresse du chantier (bouton « 🧭 Itinéraire » → Google Maps / Waze), **contacts** (site manager, chef d'équipe, contact client sur place — appui = appel), **planning** (dates installation / démontage, horaires, planning estimatif de montage s'il existe), hôtel et transport de l'équipe si renseignés. |
| 📐 **Plans** | Les PDF de plans du projet (catégorie `plans`), **les plans validés par le client en premier** (`…_VALIDE.pdf`). Ouverture plein écran. |
| 📋 **Briefing** | La dernière **version publiée** du briefing (PDF, dans sa langue si disponible). |
| ⏱ **Remplir la journée** | **Chef d'équipe seulement.** La feuille de temps (§ 3.4). |
| ✅ **Tâches réalisées** | L'historique jour par jour : ce qui a été fait, combien, par qui, état de la validation. |

Les autres installateurs (pas chefs) voient Infos, Plans, Briefing, Tâches réalisées — sans rien pouvoir modifier.

### 3.4 Remplir la journée (chef d'équipe)

**Écran 1 — Le jour.** Aujourd'hui par défaut ; flèches ◀ ▶ pour hier / un autre jour du chantier.

**Écran 2 — Qui était là aujourd'hui ?** Les membres de l'équipe du projet en grosses cases avec photo / initiales, **tous cochés par défaut** ; décocher les absents ; « ➕ Quelqu'un d'autre » = un nom libre (intérimaire pas encore inscrit — il pourra être invité plus tard et ses heures lui seront rattachées).

**Écran 3 — Les tâches du jour.** Grosses cases :
1. en haut, les **tâches prévues / assignées** pour ce jour (tâches du projet, importées d'Odoo ou créées dans VEM) ;
2. puis « ➕ Autre chose » : la liste des tâches du projet / des modèles de la phase (recherche simple), ou **texte libre** (→ crée une tâche du projet marquée « créée sur chantier », à confirmer par le bureau).

**Écran 4 — Une tâche.** Pour chaque tâche choisie :
- **Qui** : l'équipe du jour, toute cochée par défaut, décocher ceux qui n'y étaient pas ;
- **Heures** : gros boutons ½ h · 1 h · 2 h · 4 h · 8 h + « − / + » par ½ h (ou heure de début / fin, au choix du chef) ;
- **Quantités**, seulement si la tâche en a (§ 4) : un compteur « − 6 + » par élément (« Viewbox », « Panneaux », « Vitres », « Portes »…) ;
- **Commentaire** : écrit ou **dicté** (🎤) — dans sa langue, traduit automatiquement pour le bureau (l'original est gardé) ;
- 📷 photo (facultatif).

Le chef ajoute autant de tâches qu'il faut dans la journée. Sous la liste : **total d'heures par personne** ; alerte si quelqu'un dépasse 12 h, ou s'il est sur deux tâches aux mêmes heures (quand début / fin sont utilisés).

**Écran 5 — Envoyer.** Récapitulatif simple → « ✅ Envoyer au responsable ». Tant que ce n'est pas validé, le chef peut encore corriger. Une feuille renvoyée par le responsable revient avec son commentaire (« ⚠ À corriger »).

Brouillon gardé sur le téléphone : une coupure de réseau ne fait rien perdre ; l'envoi part dès que le réseau revient.

## 4. Quantités dans les tâches (et dans les rapports journaliers)

Aujourd'hui le tableau des rapports journaliers = tâche × nombre de gars × heures. On ajoute **des quantités facultatives** :

- chaque **modèle de tâche** (Réglages › tâches) peut avoir **0, 1 ou plusieurs compteurs** : libellé (FR / EN / NL / PL) + unité. Exemples : « Construction Viewbox » → `Viewbox` ; « Façades » → `Panneaux`, `Vitres`, `Portes` ;
- une tâche sans compteur reste exactement comme aujourd'hui ;
- les tâches du projet (créées depuis un modèle ou importées d'Odoo) reçoivent les compteurs du modèle, modifiables ;
- le **site manager** voit et remplit les mêmes quantités dans le rapport journalier de VEM ;
- plus tard : **total attendu** connu par le modèle 3D / la loading liste (« 6 / 16 Viewbox », barre d'avancement), et chiffres de productivité (Viewbox par homme et par jour) pour estimer les plannings.

**Lien avec le rapport journalier.** Une feuille validée remplit le tableau heures / gars / quantités du **rapport journalier du même jour** (créé s'il n'existe pas). Le site manager garde une seule vue de la journée ; rien n'est compté deux fois (une ligne venant d'une feuille porte sa référence et se met à jour si la feuille est corrigée).

## 5. Accès dans le temps

- Par défaut, un installateur voit un projet de **J − 14 avant le début de l'installation** jusqu'à **J + 14 après la fin du démontage** (fin d'installation s'il n'y a pas de démontage).
- Les deux délais (14 / 14) sont réglables globalement (Réglages) et par projet.
- Après la période : le projet disparaît de son accueil. Le bureau peut **« Redonner l'accès »** sur la fiche de la personne ou dans l'équipe du projet (jusqu'au …).
- Retirer quelqu'un de l'équipe ou désactiver son compte coupe l'accès immédiatement (déjà le cas dans VEM).

## 6. Validation (bureau)

- Dans VEM, onglet **Daily Reports** du projet + notification : « 📝 Feuilles de temps à valider ».
- Peuvent valider : site manager du projet, technical manager, project manager, admin.
- Actions : **Valider**, **Corriger puis valider** (chaque modification est tracée : avant / après / par qui), **Renvoyer au chef** avec un commentaire.
- Statuts : `brouillon` → `envoyée` → `validée` (ou `à corriger`) → `exportée`.

## 7. Odoo

### 7.1 Import des tâches Odoo → VEM (cas principal)

- Dans Odoo : vue liste des tâches du projet → Exporter (Excel) avec au minimum **ID**, **Projet**, **Titre**, **Étape**, **Heures prévues**, **Date limite**, **Assigné à**.
- Dans VEM, projet › Tâches › « ⬆ Importer les tâches d'Odoo » : on dépose le fichier → aperçu (nouvelles / modifiées / inchangées / introuvables) → Importer.
- Correspondance **projet** : numéro interne VEM dans le nom ou la référence du projet Odoo (+ la société : VIE, SPI…, les numéros pouvant se répéter d'une société à l'autre). Correspondance **tâche** : l'**ID Odoo** est gardé dans VEM (re-importer met à jour, ne duplique jamais).
- Une tâche importée garde son nom Odoo ; on peut lui associer un **modèle de tâche VEM** (pour les compteurs et les statistiques) — mémorisé par nom pour les imports suivants.

### 7.2 Tâches créées dans VEM → Odoo

- Les tâches créées dans VEM (ou sur chantier, une fois confirmées) sans ID Odoo sortent dans un fichier « Tâches à créer dans Odoo » (format d'import Odoo). Après import dans Odoo, on ré-importe la liste Odoo → les ID sont rattachés.

### 7.3 Export des feuilles de temps → Odoo (Excel)

- Bouton « ⬇ Export Odoo » (par projet, ou toutes les feuilles validées non encore exportées sur une période).
- **Une ligne par personne et par tâche et par jour** (c'est le format des feuilles de temps Odoo) : Date · Projet · Tâche (ID Odoo si connu, sinon nom) · Personne · Société / agence d'intérim · Heures · Description (tâche + quantités + commentaire traduit).
- Les lignes exportées sont marquées `exportée` (pas de double export ; ré-export possible volontairement).
- Bonus utile : récapitulatif **par personne / par agence d'intérim** sur la période (pour contrôler les factures d'intérim).

### 7.4 Plus tard : liaison directe

Après accord de l'informaticien : lecture des tâches et écriture des feuilles de temps directement dans Odoo (API avec une clé dédiée), même logique que les fichiers.

## 8. Phases proposées

| Phase | Contenu |
|---|---|
| **I1** | Invitation (lien + QR), connexion téléphone + code, langues FR / EN / NL / PL, accueil « Mes chantiers », accès dans le temps + « Redonner l'accès », boutons Infos / Plans / Briefing. |
| **I2** | Compteurs de quantités dans les modèles de tâches et dans le rapport journalier du site manager. |
| **I3** | Feuille de temps du chef d'équipe (hors ligne), Tâches réalisées, validation au bureau → rapport journalier. |
| **I4** | Odoo par fichiers : import des tâches, export des tâches créées dans VEM, export des feuilles de temps + récapitulatif intérim. |
| **I5** | Liaison directe Odoo (après accord IT). |

## 9. Questions encore ouvertes

1. **Feuilles de temps Odoo sans fiche employé** : dans Odoo, une ligne de feuille de temps doit être liée à un employé. Pour des intérimaires sans fiche, il faut choisir avec l'informaticien : un employé générique par agence d'intérim, la création de fiches, ou un autre circuit (contrôle des factures d'intérim). L'export Excel de la phase I4 donnera de toute façon le nom de la personne et son agence.
2. **Chef d'équipe** : on reprend « responsable » (`isLead`) de l'équipe du projet, ou un réglage à part « chef d'équipe chantier » ? Peut-il y avoir deux chefs (deux équipes) sur un même chantier le même jour ?
3. **Heures** : durée seulement, ou heure de début / fin ? Pause de midi déduite ? Temps de trajet compté (et sur quelle tâche Odoo) ?
4. **Les autres gars** voient-ils les heures de toute l'équipe dans « Tâches réalisées », ou seulement ce qui a été fait (sans les heures) ?
5. **Qui peut inviter** : bureau seulement, ou aussi le site manager / le chef d'équipe sur place ?
6. **Plans** : seulement les plans validés par le client, ou tous les PDF de la catégorie plans ?

## 10. Notes techniques (pour l'implémentation)

- Page séparée `public/chantier.html` + son JS (pas la coquille `index.html` et ses 21 scripts), servie à `/chantier`, manifeste PWA + icône, petit service worker pour le hors-ligne de la feuille de temps. Dictionnaire de traductions FR / EN / NL / PL comme `sign-handover.html` / `plan-approval.html`.
- Rôle existant `installer` ; le chef d'équipe = droit par projet (pas un nouveau rôle). `access.ts` reste le seul endroit où les rôles deviennent des droits ; nouvelles routes = règles `RULES` dans `scopeGuard.ts`, **plus** le filtre de période (§ 5) appliqué aux installateurs.
- `users.email` est obligatoire et unique : pour un installateur sans e-mail, adresse interne générée (non utilisée pour l'envoi) ; connexion par téléphone + code (hash, limité en essais comme le login actuel, `rateLimit.ts`).
- Nouvelles tables (Prisma + SQL idempotent dans `runStartupMigrations()`) : invitations installateurs, feuilles de temps (projet, jour, chef, statut, validé par / le, commentaire de renvoi), lignes (tâche VEM / ID Odoo / modèle, titre, heures, début / fin, personnes [utilisateur ou nom libre], quantités JSON, commentaire + traduction, photos), historique des corrections ; colonnes : compteurs sur `task_templates` et `tasks`, `quantities` sur `daily_report_task_hours`, `odoo_id` / `source` sur `tasks`, délais d'accès + prolongation sur `project_team` / projet.
- Écriture Excel : réutiliser l'écrivain `.xlsx` maison (`plans/src/loading/xlsx/write.ts`) ou un équivalent côté serveur ; lecture du fichier d'export Odoo côté navigateur (lecteur `.xlsx` maison de la loading liste).
