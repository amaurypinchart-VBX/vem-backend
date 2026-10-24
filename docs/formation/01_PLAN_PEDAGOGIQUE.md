# 01 — Plan pédagogique (formation VEM)

> **Base** : l'inventaire `00_INVENTAIRE_FONCTIONNEL.md` et les décisions d'Amaury du 24.10.2026.
> **Langue** : français, **vouvoiement** partout.
> **Projet fil rouge** fictif : « Hospitality Paddock — Démo », N° interne `9999DEMOVIE`, client « Demo Events SA », contact « Jean Exemple ».

## 1. Décisions qui cadrent le contenu (Amaury, 24.10.2026)

| Sujet | Décision | Effet sur la formation |
|---|---|---|
| Règle du mail | On enseigne ce qui existe | Pièces jointes → Fichiers ; texte du mail → réservations en brouillon. Rien n'est ajouté aux notes, et les logos ne sont pas filtrés. |
| Préfixe | « juste NEW » | Le sujet commence par `NEW` + N° interne. Pas d'avertissement « Newsletter » dans les slides (gardé seulement comme consigne : n'envoyer à cette boîte que des mails de projet). |
| N° interne | 4 chiffres + 4 à 6 lettres + `VIE` | Exemple démo : `9999DEMOVIE` ; exemple réel : `6055RKLOKVIE`. |
| Tâches | Remplacées par la todolist (check-list) | Pas de module Tâches. Consignes : « ☐ Aucun » dans *Tâches à créer*, ignorer ➕ 1 tâche / 📋 Plusieurs tâches, décocher *Tâches* dans le Rapport IA. La check-list devient un chapitre à part entière. |
| Fonctions cassées | Corrigées après la formation | On enseigne les contournements ; liste des réparations dans `07_PROMPT_REPARATIONS.md`. |
| Briefing | Studio + 🪄 Auto-générer | Le mode classique et « ✨ Générer avec l'IA » ne sont pas enseignés. |
| Check-list | Module à part entière | Chapitre 10. |
| Statut du projet | Toute personne qui a accès le change | Slide « cycle de vie » + statut dans la fiche projet. |
| Suppressions | Consigne ajoutée | « Ne jamais supprimer un projet, un client, un rapport ou un handover » (règle d'or n° 6). |
| Ton | Vouvoiement | Vérifié automatiquement (`06_RAPPORT_QA.md`). |
| Visites client | Module abandonné | Exclu ; consigne « ne plus utiliser ». |
| Planning public | À présenter | Slide dans le chapitre 15. |

## 2. Parcours

| Parcours | Public | Chapitres | Durée |
|---|---|---|---|
| 🟦 **Tronc commun** | Tout le monde | 0 Bienvenue · 3 Créer par mail (NEW) · 4 Compléter par mail · 15 Dashboard / calendrier / notifications / planning public · 16 Mise en pratique, FAQ, fiche mémo | ≈ 2 h 10 |
| 🟥 **Bureau** | Sales, Customer Service, Project Managers, Technical Managers | 1 Clients · 2 Créer à la main · 5 Fiche projet · 6 Équipe · 7 Logistique · 8 Bookings · 9 Fichiers & 3D · 13 Briefing Studio · 14 Rapport IA | ≈ 3 h 50 |
| 🟩 **Terrain** (sur téléphone) | Site Managers, installateurs | 9 Fichiers & photos · 10 Check-list · 11 Daily Reports · 12 Handover & signature | ≈ 2 h 10 |

**Formules proposées**
- **Bureau** : tronc commun + Bureau, une journée (2 demi-journées).
- **Terrain** : tronc commun + Terrain, une demi-journée longue, téléphone en main.
- **Technical Managers** : les trois parcours. Ils configurent la check-list et font le handover.

## 3. Chapitres, durées et nombre de slides

| N° | Chapitre | Ancre | Public | Durée | Slides* |
|---|---|---|---|---|---|
| 0 | 🚀 Bienvenue dans VEM (connexion, menu, mobile, cycle de vie, droits, règles d'or) | `#intro` | Tout le monde | 30 min | 11 |
| 1 | 🏢 Clients & contacts | `#clients` | Bureau | 20 min | 8 |
| 2 | 🏗️ Créer un projet à la main | `#projet-creation` | Bureau | 35 min | 10 |
| 3 | 🆕 Créer un projet par mail (NEW) | `#projet-mail` | Tout le monde | 25 min | 9 |
| 4 | 📧 Compléter un projet par mail | `#mail-projet` | Tout le monde | 25 min | 9 |
| 5 | 📋 La fiche projet (onglets, statuts, ✏️ Modifier, archivage, projet complet) | `#fiche-projet` | Tout le monde | 30 min | 10 |
| 6 | 👥 L'équipe | `#equipe` | PM / TM | 25 min | 9 |
| 7 | 🚛 Logistique | `#logistique` | PM / TM / CS | 20 min | 7 |
| 8 | ✈️ Bookings | `#bookings` | PM / CS | 20 min | 7 |
| 9 | 📁 Fichiers & visionneuse 3D | `#fichiers` | Tout le monde | 20 min | 7 |
| 10 | ☑️ Check-list de montage (todolist) | `#checklist` | TM, PM, Site Managers, installateurs | 40 min | 12 |
| 11 | 📓 Daily Reports | `#daily` | Site Managers | 35 min | 9 |
| 12 | 🧾 Handover & signature client | `#handover` | Site Managers, TM | 35 min | 10 |
| 13 | 🎨 Briefing Studio & 🪄 Auto-générer | `#briefing` | PM / TM | 40 min | 9 |
| 14 | 📊 Le Rapport IA | `#rapport` | PM / TM | 20 min | 6 |
| 15 | 📊 Dashboard, calendrier, notifications, planning public | `#dashboard` | Tout le monde | 20 min | 6 |
| 16 | 🏁 Mise en pratique, FAQ, fiche mémo mail | `#pratique` (mémo : `#memo-mail`) | Tout le monde | 30 min | 7 |
| | **Total** | | | **≈ 7 h 50** | **146** |

\* Le nombre de slides inclut la slide de séparation de chaque chapitre.

## 4. Structure identique de chaque chapitre

1. **Séparation** : numéro, titre, public, durée, parcours.
2. **Objectif & où le trouver** : une phrase d'objectif, le public, le chemin d'accès (Menu › Onglet › Bouton).
3. **Étapes** : numérotées, avec les libellés exacts de l'app et une maquette d'écran recréée (ou une capture à faire).
4. **Champs** : obligatoires ou fortement recommandés (tableau à pastilles quand c'est utile).
5. **À quoi ça sert après** : cartes « alimente → ».
6. **Erreurs fréquentes / bonnes pratiques** : contournements des anomalies connues compris.
7. **Exercice sur le projet fil rouge + récap « À retenir »**.

## 5. Matrice « Qui remplit quoi, quand »

| Phase | Qui saisit | Quoi | Canal | Qui l'utilise ensuite |
|---|---|---|---|---|
| **Devis** | Sales / Customer Service | Client + contacts (★, fonction) ; projet : N° interne au bon format, adresse « …, Ville », dates avec heures ; statut 📝 Devis à valider | Formulaire ou mail `NEW <N° interne>` | PM, TM |
| **Devis validé** | Sales / PM | Statut ✅ Devis validé ; description ; 🌐 notes globales ; devis et plans dans 📁 Fichiers | Formulaire ; mail avec le N° interne dans le sujet | Toute l'équipe |
| **Préparation** | PM / TM | Statut 🔧 En préparation ; équipe + phases (onglet 👥 Équipe) ; camions & engins (🚛 Logistique) ; transports & hôtels (✈️ Bookings) ; 🔨 / 🔧 notes installation et démontage ; check-lists configurées (préparation, montage, démontage) | Onglets du projet ; confirmations transférées par mail (→ brouillons à valider) | Entrepôt (planning public, alerte Tubize), équipe, calendrier |
| **Départ** | PM / TM (préparation : Site Manager) | Check-list de préparation ; briefing Studio 🪄 + PDF à l'équipe ; 📤 infos et réservations à chaque membre | Briefing Studio, 📤 dans l'onglet Équipe | Équipe terrain |
| **Installation** | Site Manager | Statut 📍 Sur site → 🏗️ En installation ; check-list de montage chaque jour ; daily report chaque jour (photos, heures par tâche) ; photos et plans par mail | Téléphone ; mail avec le N° interne | PM, client (daily envoyé), Rapport IA |
| **Handover** | Site Manager / TM | Check-list de montage validée ; handover (zones, étendue des travaux) ; signature sur place ou lien 🔗 ; statut 🧾 Handover OK | Onglet 🧾 Handover du projet | Client, direction |
| **Démontage** | Site Manager | Statut 🔨 Démontage ; check-list de démontage ; daily reports ; véhicules → ⚫ Retour entrepôt | Téléphone | Entrepôt, PM |
| **Clôture** | PM | 📊 Rapport IA ; ménage des 📁 Fichiers (doublons, logos de mails) ; statut 🎉 Terminé | Fiche projet | Direction |

## 6. Organisation d'une session

- **Avant** :
  - créer un projet de test par binôme, avec un N° interne fictif au format Viewbox (ne pas réutiliser `9999DEMOVIE` en production) ;
  - réaliser les captures listées dans `05_CAPTURES_A_FAIRE.md` ;
  - imprimer la fiche mémo (`03_FICHE_MEMO_MAIL.md` ou la slide `#memo-mail`).
- **Pendant** : le deck `formation-vem.html` (touche N pour les notes de l'animateur), VEM ouvert à côté, téléphones pour le parcours Terrain.
- **Pendant les exercices mail** : ne pas envoyer de vrais mails `NEW` sans prévenir, car chaque envoi crée un vrai projet.
- **Après** :
  - envoyer le lien direct du chapitre utile (ex. `formation-vem.html#projet-mail`) ;
  - partager `04_CHECKLIST_PROJET_COMPLET.md` ;
  - archiver les projets de test.
