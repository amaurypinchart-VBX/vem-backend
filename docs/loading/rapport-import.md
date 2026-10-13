# Rapport d'import — VIEWBOX_regles_loading_3.xlsx

Généré par `plans/scripts/import-loading-rules.mjs`. À relire par Amaury : rien n'a été tranché en silence.

## Résumé

- Onglets lus : LisezMoi, Regles_accessoires, Ajouts_chantier, Appreciation, Catalogue_ref
- Catalogue : 218 références (48 « gros produits »)
- Règles : 91 lues, **67 actives** (48 confirmées, 18 à confirmer, 1 hypothèses), 24 remplacées ou doublons gardés pour l'historique
- Valeurs observées en régime connecté (mauve, pas des règles) : 8
- Décisions appliquées : 24 / 24

## Questions pour Amaury

1. Pieds de la 8,4 m (8) et de la M20 (10) : les pieds intermédiaires sont-ils répartis régulièrement sur les grands côtés (2 par grand côté pour la 8,4 m, 3 pour la M20) ?
2. Plaques de base 4-700-035 (coin) / 4-700-036 (milieu) : sur une 8,4 m ou une M20, 1 par pied (4 coins + 4 ou 6 milieux) ? Et toujours sans spare (Klokgebouw et 6059 livrés sans) ?
3. Airco / HVAC : seul 4-700-027 (AIRCO WALL) est marqué comme demandant un mur à trou. Et 4-700-026 (airco mobile), 4-700-028 / 4-700-030 (chauffage), 4-700-029 (convertisseur) ?
4. Plaque simple 4-700-040 « box → terrasse / vide » : Klokgebouw (standalone) = 0. Elle sort seulement pour une box connectée dont un côté donne sur une terrasse ou le vide ? Par côté ou par mètre ?
5. Ajouts chantier sans couleur ou en vert (échelles, câbles, peinture, laminé, gaffa) : importés « à confirmer ». Lesquels sont confirmés ?
6. Références absentes du catalogue, à ajouter (dans l'app : Réglages › Règles de loading › Catalogue, « Ajouter ») : `4-700-096`, `4-720-011`, `4-700-002`, `4-700-001`, `4-740-010`, `4-700-097`, `4-730-013`, `4-730-014`.

## Décisions appliquées par-dessus le classeur

- **2026-10-12 — Amaury** : Les sous-bois (cales 400×400, 700×700, 1000×1000) viennent de l’Étude structure, qui donne combien de plaques et où. La loading liste prend la quantité de l’étude × 2 (ex. l’étude dit 25 × 40×40 → 50 dans la liste), pour tous les sous-bois.
  - ajout acc:4-740-001@sous_bois_etude
  - acc:4-740-001@pied → remplacée par acc:4-740-001@sous_bois_etude
  - ajout acc:4-740-002@sous_bois_etude
  - acc:4-740-002@box[milieu] → remplacée par acc:4-740-002@sous_bois_etude
  - ajout acc:4-740-003@sous_bois_etude
  - acc:4-740-003@box[angle] → remplacée par acc:4-740-003@sous_bois_etude
- **2026-10-12 — Amaury** : Toolkit 4-750-001 : 1 jusqu’à 7 VBX, 2 dès 8 VBX. Au-delà de 15 VBX : pas encore de règle (à confirmer).
  - aj:4-750-001@box : paliers 1–7 → 1, 8–15 → 2
- **2026-10-12 — Amaury** : Un module airco / HVAC vu dans la 3D demande un mur avec trou airco 4-700-083 (explique les +3 nidaplast de 6059 : les 11 murs dessinés + 3 murs à trou). Le décompte d’un mur 7-636-008 reste réservé au cas où l’airco n’est pas dessinée et que son emplacement est dessiné en nidaplast (règle du classeur).
  - ajout sub:4-700-083@airco[nidaplast]
  - ajout acc:4-700-083@airco[autre]
  - acc:4-700-083@4-700-027/airco → remplacée par sub:4-700-083@airco[nidaplast]
  - 4-700-027 marqué « airco / HVAC »
- **2026-10-12 — remarque du classeur (révisé 6060/00058)** : Câble IP44 4-730-009 : 1 par VBX, airco ou non (la ligne « par airco » et le forfait chantier sont remplacés).
  - acc:4-730-009@4-700-027/box → remplacée par acc:4-730-009@box
- **2026-10-12 — remarque du classeur (« ALT : géré dans Regles »)** : La ligne EPDM 4-700-096 de l’onglet Ajouts_chantier est un doublon des règles d’accessoires : désactivée.
  - aj:4-700-096@module_toit → remplacée par acc:4-700-096@module_toit[connecte,suspendu]
- **2026-10-12 — Amaury** : Le glasswall seamless 10 mm 7-637-010 (alu mat) prend les mêmes accessoires que 7-637-009 (régime 10 mm).
  - 7-637-010 : régime 10 mm
- **2026-10-12 — Amaury** : Pieds par box : Viewbox standard 5900 = 6 (4 coins + 2 milieux), Viewbox 8,4 m = 8, Viewbox M20 = 10.
  - 7-962-016 : 6 pieds
  - 7-962-012 : 8 pieds
  - 7-962-008 : 10 pieds
- **2026-10-12 — remarque du classeur (« 15 m²/box »)** : Plancher laminé 4-740-010 : 15 m² par box (si plancher laminé). Gaffa et adhésif : 1 par tranche de 15 m² de laminé.
  - 4-740-010 : 15 m² / box → aj:4-740-010@box[plancherLamine]
  - 4-740-010 : unité m2
- **2026-10-12 — remarque du classeur (« Petit job : 2 pots », « Petit job : 1 »)** : Peinture : petit job = 2 pots 4-700-001 + 1 kit 4-700-044 ; gros job = 1 bidon 20 L 4-700-002. La taille du job est une question chantier.
  - app:4-700-001@job → aj:4-700-001@job[petit] (2)
  - app:4-700-044@job → aj:4-700-044@job[petit] (1)
- **2026-10-12 — classeur (quantités en mètres)** : Unités : bande poteau 4-720-011 et câble sans prise 4-730-005 au mètre.
  - 4-720-011 : unité m
  - 4-730-005 : unité m
- **2026-10-12 — Amaury** : EPDM de toit : 1 par jonction de toit. Deux toits qui se touchent par les grands côtés → l’EPDM 5900 (4-700-096, substitut 4-700-045) ; par les petits côtés → l’EPDM 2500 (4-700-097).
  - ajout acc:4-700-096@jonction_toit_grand_cote
  - ajout acc:4-700-097@jonction_toit_petit_cote
  - acc:4-700-096@module_toit[connecte,suspendu] → remplacée par acc:4-700-096@jonction_toit_grand_cote
  - acc:4-700-096@ilot_couvert[connecte,suspendu] → remplacée par acc:4-700-096@jonction_toit_grand_cote
- **2026-10-12 — Amaury** : Jonctions entre box : plaque inter-box 4-700-039 = 5 par jonction grand côté, 2 par jonction petit côté ; boulons 4-710-001 = 10 par jonction grand côté (5 en bas + 5 en haut), 4 par jonction petit côté (2 + 2). Boulonnerie, quincaillerie, plaques de jonction : + 20 % de spare.
  - ajout acc:4-700-039@jonction_grand_cote
  - ajout acc:4-700-039@jonction_petit_cote
  - acc:4-700-039@jonction_box[connecte] → remplacée par acc:4-700-039@jonction_grand_cote
  - acc:4-700-039@box[connecte] → remplacée par acc:4-700-039@jonction_grand_cote
  - ajout acc:4-710-001@jonction_grand_cote
  - ajout acc:4-710-001@jonction_petit_cote
  - acc:4-710-001@box → remplacée par acc:4-710-001@jonction_grand_cote
  - acc:4-700-040@bord : + 20 % (plaque de jonction)
- **2026-10-12 — Amaury (« spare rajouté », + 50 % confirmé)** : Joints du vitrage 10 mm : on rajoute du spare. Square 10 mm 4-700-072 : + 20 % puis + 2 par porte coulissante (6060 : 6 → 8 → 10) ; joints petits / grands côtés vitrés 4-700-067 / 4-700-074 : + 50 % (6060 : 4 → 6 et 2 → 3).
  - acc:4-700-072@10mm/terminaison_vitre : spare « texte » → + 20 % (6060 : 6 → 8)
  - acc:4-700-067@10mm/cote_vitre_court : spare « texte » → + 50 % (6060 : 4 → 6)
  - acc:4-700-074@10mm/cote_vitre_long : spare « texte » → + 50 % (6060 : 2 → 3)
  - ajout acc:4-700-072@10mm/porte_coulissante
- **2026-10-12 — Amaury** : Marches : dès que c’est une porte. Toute porte simple (pleine ou vitrée) → 3 marches 7-632-017 ; toute porte double (pleine ou vitrée) → 7-632-022 + 7-632-018 + 2 × 7-632-017 ; porte coulissante → le kit de la porte double en double (2 + 2 + 4). Le type de porte vient de la désignation du catalogue.
  - ajout kit:7-632-017@porte_simple
  - kit:7-632-017@7-199-067/produit → remplacée par kit:7-632-017@porte_simple
  - ajout kit:7-632-022@porte_double
  - kit:7-632-022@7-199-066/produit → remplacée par kit:7-632-022@porte_double
  - ajout kit:7-632-018@porte_double
  - kit:7-632-018@7-199-066/produit → remplacée par kit:7-632-018@porte_double
  - ajout kit:7-632-017@porte_double
  - kit:7-632-017@7-199-066/produit → remplacée par kit:7-632-017@porte_double
  - ajout kit:7-632-022@porte_coulissante
  - ajout kit:7-632-018@porte_coulissante
  - ajout kit:7-632-017@porte_coulissante
  - portes du catalogue : 7-625-013 simple, 7-625-017 simple, 7-625-018 double, 7-625-019 double, 7-625-020 coulissante, 7-625-022 simple, 7-625-014 simple, 7-625-021 coulissante, 7-625-023 coulissante, 7-199-067 simple, 7-199-066 double
- **2026-10-12 — Amaury (« rajoute toujours un peu plus que trouvé, comme là », + 30 % confirmé)** : Toujours un peu plus que ce qui est trouvé : la quincaillerie et les plaques de jonction passent à + 30 % (le plus petit spare qui couvre tout ce qui a été livré sur 6059 et 6060 : plaques 15 → 20, boulons 20 → 26), l’EPDM de toit à + 1 (6059 : 3 → 4).
  - acc:4-700-040@bord : + 30 %
  - acc:4-700-039@jonction_grand_cote : + 30 %
  - acc:4-700-039@jonction_petit_cote : + 30 %
  - acc:4-710-001@jonction_grand_cote : + 30 %
  - acc:4-710-001@jonction_petit_cote : + 30 %
  - acc:4-700-096@jonction_toit_grand_cote : + 1
  - acc:4-700-097@jonction_toit_petit_cote : + 1
- **2026-10-12 — Amaury** : Vitrage 4.4.2 : le joint 4-700-075 et les silicones 4-157-003 / 4-157-004 « 1 par vitre » s’ajoutent aux règles « par box ».
  - acc:4-700-075@4.4.2/produit + acc:4-700-075@box[standalone] : s’additionnent
  - acc:4-157-003@4.4.2/produit + acc:4-157-003@box : s’additionnent
  - acc:4-157-004@4.4.2/produit + acc:4-157-004@box : s’additionnent
- **2026-10-12 — Amaury** : Pieds 6059 : on garde 15 (4 box côte à côte × 6 pieds, pieds communs fusionnés) ; le « 10 » du classeur n’est pas une règle.
  - aucune règle modifiée : le nombre de pieds vient de la topologie
- **2026-10-12 — remarque du classeur (6060/00058 : « 2 petits côtés vitrés × 2 (bas + haut) = 4 », « 1 grand côté vitré × 2 = 2 »)** : Joints 4-700-067 / 4-700-074 : 2 par côté vitré (un en bas, un en haut), puis + 50 % (6060 : 4 → 6 et 2 → 3).
  - acc:4-700-067@10mm/cote_vitre_court : 2 par côté vitré (bas + haut)
  - acc:4-700-074@10mm/cote_vitre_long : 2 par côté vitré (bas + haut)
- **2026-10-12 — remarque du classeur (« Klok → 0 », plaques de jonction conditionnelles à l’adjacence)** : Plaque simple 4-700-040 (box → terrasse / vide) : seulement pour des box connectées ; Klokgebouw (box seules) = 0.
  - acc:4-700-040@bord : box connectées seulement
- **2026-10-12 — remarque du classeur (6060/00058 : « remplace 7-636-008 white/white »)** : Murs RAL 7024 une face demandés : chaque nidaplast 7-636-008 dessiné sort en 7-636-006 (question chantier « RAL des murs »).
  - 7-636-006 : remplace 7-636-008 quand les murs sont demandés en RAL 7024 → sub:7-636-006@7-636-008/produit[7024]
- **2026-10-12 — Amaury** : Les modules de toit 7-632-001 / 7-632-002 et les poteaux 7-355-014 / 7-355-015 sont compris dans le standard 7-962-016 : jamais une ligne à part. La bande poteau 4-720-011 (par poteau) a donc besoin du nombre de poteaux par box (à préciser).
  - 7-632-001 : compris dans 7-962-016
  - 7-632-002 : compris dans 7-962-016
  - 7-355-014 : compris dans 7-962-016
  - 7-355-015 : compris dans 7-962-016
- **2026-10-12 — Amaury (« par Viewbox on peut rajouter 4-730-013 … et 4-730-014 pour 2 Viewbox »)** : Câbles électriques des lampes entre box : 4-730-013 = 1 par jonction entre box, 4-730-014 = 1 par paire de box ; pas en box seules (Klokgebouw n’en a pas).
  - ajout acc:4-730-013@jonction_box[connecte]
  - ajout acc:4-730-014@paire_box[connecte]
- **2026-10-12 — Amaury (« ne retire pas de mur, laisse-les comme ça, ça fait des spares »)** : Airco : 1 mur avec trou airco 4-700-083 par airco (dessinée ou à prévoir), toujours en plus ; aucun mur 7-636-008 n’est retiré.
  - ajout acc:4-700-083@airco
  - sub:4-700-083@airco[nidaplast] → remplacée par acc:4-700-083@airco
  - acc:4-700-083@airco[autre] → remplacée par acc:4-700-083@airco
- **2026-10-13 — Amaury (« 2 × 014 et 2 × 015 par Viewbox ; la bande poteau quand les poteaux sont connectés : par deux c’est 1, par 4 c’est 4 »)** : Poteaux : 4 par Viewbox standard (2 × 7-355-014 + 2 × 7-355-015, compris dans la box, jamais dans la liste). Bande poteau 4-720-011 : 2,53 m par bande, 1 bande là où 2 poteaux se touchent, 4 bandes là où 4 se touchent, + 30 % (6059 : 6 × 2,53 = 15,2 → 20 m livrés).
  - ajout acc:4-720-011@poteau_connecte
  - acc:4-720-011@poteau → remplacée par acc:4-720-011@poteau_connecte

## Interprétations faites à l’import

- Regles_accessoires ligne 52 (4-740-001) : Ligne de topologie (« (nb de pieds — paire de box connectees) » = 9 double_box) : ce n’est pas une règle d’article, c’est une base de comptage des pieds. Gardée comme information (calcul des pieds par la topologie).
- Regles_accessoires ligne 12 (4-700-065) : 4-700-065 : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.
- Regles_accessoires ligne 13 (4-700-075) : 4-700-075 : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.
- Regles_accessoires ligne 14 (4-700-066) : 4-700-066 : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.
- Regles_accessoires ligne 15 (4-700-071) : 4-700-071 : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.
- Regles_accessoires ligne 16 (4-700-070) : 4-700-070 : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.
- Regles_accessoires ligne 17 (4-700-073) : 4-700-073 : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.
- Regles_accessoires ligne 18 (4-700-064) : 4-700-064 : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.
- Regles_accessoires ligne 20 (4-700-061) : 4-700-061 : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.

## Textes non traduits automatiquement

- Regles_accessoires ligne 22 (4-157-004) : Confiance « confirmé » mais la remarque dit « → a_confirmer » : gardée « confirmé ». Remarque : Klok 00055 : ~2/box × 2 = 4 | 6059/00056 : 6 pour 4 VBX (≈1,5/VBX, ne scale pas net) → a_confirmer. || CONFIRME 6060 : 4-157-004 = crystal transparent (distinct
- Regles_accessoires ligne 34 (4-700-096) : Appui « suspendu » gardé tel quel : la topologie ne sait pas encore le détecter.
- Regles_accessoires ligne 37 (4-710-001) : Quantité en texte « ~10/jonction » (par box) : la règle sort en « à confirmer » sans quantité calculée.
- Regles_accessoires ligne 47 (4-700-072) : Spare en texte « +arrondi » : non appliqué automatiquement. Remarque : VALIDE 6060/00058 (bordereau reel) 6060/00058 : square 10mm = terminaison de vitre contre poteau. Scania 6 jonctions -> arrondi 8 ; + porte coulissante = +2 -> 10. Analogue 10mm du 4-700-073 (8.8.2).
- Regles_accessoires ligne 48 (4-700-067) : Spare en texte « +spare » : non appliqué automatiquement. Remarque : VALIDE 6060/00058 (bordereau reel) 6060/00058 : joint bas+haut petits cotes vitres. Scania : 2 petits cotes vitres x2 (bas+haut)=4, +spare -> 6. Ne sort QUE cote vitre (10mm).
- Regles_accessoires ligne 49 (4-700-074) : Spare en texte « +spare » : non appliqué automatiquement. Remarque : VALIDE 6060/00058 (bordereau reel) 6060/00058 : joint bas+haut grands cotes vitres. Scania : 1 grand cote vitre x2 (bas+haut)=2, +spare -> 3.
- Regles_accessoires ligne 50 (4-700-096) : Appui « suspendu » gardé tel quel : la topologie ne sait pas encore le détecter.
- Regles_accessoires ligne 54 (4-157-003) : Base « box_gap » inconnue (Silicon AM85-1 (2e ligne = transparent), quantité 6) : ligne non traduite en règle. Remarque : RESOLU 6060/00058 (Amaury) : 4-157-003 = RAL 7024 (colore) ; 4-157-004 = CRYSTAL transparent. Le transparent doit sortir en 4-157-004 (bordereau 00058 l'avait mal etiquete en 4-157-003). Voir lignes d
- Ajouts_chantier ligne 2 (4-750-001) : Ligne verte (pré-remplie, à vérifier) : importée « à confirmer ».
- Ajouts_chantier ligne 3 (4-750-002) : Ligne verte (pré-remplie, à vérifier) : importée « à confirmer ».
- Ajouts_chantier ligne 4 (4-750-003) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 5 (4-730-005) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 6 (4-730-003) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 7 (4-730-002) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 8 (4-730-004) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 9 (4-730-009) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 10 (4-700-001) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 11 (4-700-044) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 12 (4-740-010) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 13 (4-157-005) : Ligne sans couleur : importée « à confirmer ».
- Ajouts_chantier ligne 14 (4-157-012) : Ligne sans couleur : importée « à confirmer ».
- Appreciation ligne 4 : Référence « 4-700-096 / 4-700-033 » (plusieurs articles ou réf. générique) : gardée comme note d’appréciation.
- Appreciation ligne 5 : Référence « 4-740-00x » (plusieurs articles ou réf. générique) : gardée comme note d’appréciation.
- Appreciation ligne 6 : Référence « 4-740-001/002/003 » (plusieurs articles ou réf. générique) : gardée comme note d’appréciation.
- Appreciation ligne 7 : Référence « 4-750-004/005/006 » (plusieurs articles ou réf. générique) : gardée comme note d’appréciation.

## Doublons

- Ajouts_chantier ligne 9 (4-730-009) : Note d’appréciation « Cable SHUKO Multiprise IP44 » déjà couverte par acc:4-730-009@box : gardée comme information, inactive.
- Appreciation ligne 3 (4-700-083) : Note d’appréciation « NIDAPLAST WALL + trou airco » déjà couverte par acc:4-700-083@airco : gardée comme information, inactive.
- Appreciation ligne 4 (4-700-096+4-700-033) : Note d’appréciation « ROOF RUBBER EPDM / ROOF ROLLER TEC7 » déjà couverte par acc:4-700-096@jonction_toit_grand_cote, aj:4-700-033@job[couvert] : gardée comme information, inactive.
- Appreciation ligne 5 (4-740-001+4-740-002+4-740-003) : Note d’appréciation « WOOD SUBPLATE (charge lourde) » déjà couverte par acc:4-740-001@sous_bois_etude, acc:4-740-002@sous_bois_etude, acc:4-740-003@sous_bois_etude : gardée comme information, inactive.
- Appreciation ligne 6 (4-740-001+4-740-002+4-740-003) : Note d’appréciation « WOOD SUBPLATE LEVELING (pile par pied) » déjà couverte par acc:4-740-001@sous_bois_etude, acc:4-740-002@sous_bois_etude, acc:4-740-003@sous_bois_etude : gardée comme information, inactive.
- Appreciation ligne 7 (4-750-004+4-750-005+4-750-006) : Note d’appréciation « SÉCURITÉ HAUTEUR (harnais, ligne de vie, TUV) » déjà couverte par aj:4-750-004@job[hauteur], aj:4-750-005@job[hauteur], aj:4-750-006@job[hauteur] : gardée comme information, inactive.

## Catalogue

- Regles_accessoires ligne 34 (4-700-096) : 4-700-096 (Roof Rubber EPDM 57x32x5900 |VBX|) n’est pas dans Catalogue_ref.
- Regles_accessoires ligne 35 (4-720-011) : 4-720-011 (Viewbox Poles Rubber FLAT adhésive 20x4mm /M) n’est pas dans Catalogue_ref.
- Regles_accessoires ligne 50 (4-700-096) : 4-700-096 (Roof Rubber EPDM 5900 |VBX| (subst. 4-700-045 OK)) n’est pas dans Catalogue_ref.
- Ajouts_chantier ligne 10 (4-700-001) : 4-700-001 (PAINT LEVASSEUR 1K RAL7024 2.5L) n’est pas dans Catalogue_ref.
- Ajouts_chantier ligne 12 (4-740-010) : 4-740-010 (Laminate LAMETT DOURO HONEY (/m²)) n’est pas dans Catalogue_ref.
- Ajouts_chantier ligne 16 (4-700-096) : 4-700-096 (Roof Rubber EPDM 5900 |VBX|) n’est pas dans Catalogue_ref.
- Ajouts_chantier ligne 20 (4-700-002) : 4-700-002 (PAINT LEVASSEUR 1K RAL7024 20L) n’est pas dans Catalogue_ref.

## Ignoré

- Catalogue_ref ligne 142 : « testplate » n’est pas une référence N-NNN-NNN : ignorée.

## Règles actives

### Structure / façade

| Article | Quantité | Base | Conditions | Spare | Confiance | Clé |
|---|---|---|---|---|---|---|
| 4-700-003 Viewbox Ceilling Black tensed Fabric 2195mm X 5695mm /VISIX/ | 1 | par box |  | +1 | confirmé | `acc:4-700-003@box` |
| 4-700-001 PAINT LEVASSEUR 1K RAL7024 2.5L | 2 | forfait chantier | tailleJob = petit |  | à confirmer | `aj:4-700-001@job[petit]` |
| 4-740-010 Laminate LAMETT DOURO HONEY (/m²) | 15 | par box | plancherLamine |  | à confirmer | `aj:4-740-010@box[plancherLamine]` |
| 4-700-002 PAINT LEVASSEUR 1K RAL7024 20L | 1 | forfait chantier | tailleJob = gros |  | confirmé | `aj:4-700-002@job[gros]` |
| 4-700-027 AIRCO WALL TROTEC 2,6KW  220V - VBX COOLING AND HEATING SYSTEM | à apprécier | forfait chantier |  |  | hypothèse | `app:4-700-027@job` |
| 4-700-096 Roof Rubber EPDM 57x32x5900 /VBX/ | 1 | par jonction de toit grand côté |  | +1 | confirmé | `acc:4-700-096@jonction_toit_grand_cote` |
| 4-700-097 Roof Rubber EPDM 2500 /VBX/ | 1 | par jonction de toit petit côté |  | +1 | confirmé | `acc:4-700-097@jonction_toit_petit_cote` |
| 7-632-017 PLATFORM STEP 1100x500x150 DARK GREY - VIEWBOX | 3 | par porte simple |  |  | confirmé | `kit:7-632-017@porte_simple` |
| 7-632-022 PLATFORM STEP 2200x1000x150 /7024/ - VIEWBOX | 1 | par porte double |  |  | confirmé | `kit:7-632-022@porte_double` |
| 7-632-018 PLATFORM STEP 2200x500x150 DARK GREY - VIEWBOX | 1 | par porte double |  |  | confirmé | `kit:7-632-018@porte_double` |
| 7-632-017 PLATFORM STEP 1100x500x150 DARK GREY - VIEWBOX | 2 | par porte double |  |  | confirmé | `kit:7-632-017@porte_double` |
| 7-632-022 PLATFORM STEP 2200x1000x150 /7024/ - VIEWBOX | 2 | par porte coulissante |  |  | confirmé | `kit:7-632-022@porte_coulissante` |
| 7-632-018 PLATFORM STEP 2200x500x150 DARK GREY - VIEWBOX | 2 | par porte coulissante |  |  | confirmé | `kit:7-632-018@porte_coulissante` |
| 7-632-017 PLATFORM STEP 1100x500x150 DARK GREY - VIEWBOX | 4 | par porte coulissante |  |  | confirmé | `kit:7-632-017@porte_coulissante` |
| 4-730-013 Câble de liaison électrique (lampes) entre Viewbox | 1 | par jonction de box | regime = connecte |  | confirmé | `acc:4-730-013@jonction_box[connecte]` |
| 4-730-014 Câble de liaison électrique (lampes) pour 2 Viewbox | 1 | par paire de box | regime = connecte |  | confirmé | `acc:4-730-014@paire_box[connecte]` |
| 4-700-083 NIDAPLAST WALL WHITE / WHITE 1130x2520 With AIRCO HOLE - VIEWBOX M16 | 1 | par airco |  |  | confirmé | `acc:4-700-083@airco` |
| 4-720-011 Viewbox Poles Rubber FLAT adhésive 20x4mm /M | 2,53 | par bande de poteaux jointifs |  | +30 % | confirmé | `acc:4-720-011@poteau_connecte` |

### Quincaillerie / liaison

| Article | Quantité | Base | Conditions | Spare | Confiance | Clé |
|---|---|---|---|---|---|---|
| 4-700-035 WOOD Base Plate Corner M16 / VIEWBOX / 325X325mm | 4 | par box | position = angle |  | confirmé | `acc:4-700-035@box[angle]` |
| 4-700-036 WOOD Base Plate Middle M16 / VIEWBOX / 320X325mm | 2 | par box | position = milieu |  | confirmé | `acc:4-700-036@box[milieu]` |
| 4-700-040 In Between Plate Simple /60 x 1140 x 18 mm / VIEWBOX | 1 | par bord libre | regime = connecte | +30 % | à confirmer | `acc:4-700-040@bord` |
| 4-740-001 WOOD SUBPLATE LEVELING M16 / VIEWBOX / 400x400mm | 2 | selon l’étude structure |  |  | confirmé | `acc:4-740-001@sous_bois_etude` |
| 4-740-002 WOOD SUBPLATE LEVELING M16 / VIEWBOX / 700x700mm | 2 | selon l’étude structure |  |  | confirmé | `acc:4-740-002@sous_bois_etude` |
| 4-740-003 WOOD SUBPLATE LEVELING M16 / VIEWBOX / 1000x1000mm | 2 | selon l’étude structure |  |  | confirmé | `acc:4-740-003@sous_bois_etude` |
| 4-700-039 In Between Plate Large /120 x 1140 x 18 mm / VIEWBOX | 5 | par jonction grand côté |  | +30 % | confirmé | `acc:4-700-039@jonction_grand_cote` |
| 4-700-039 In Between Plate Large /120 x 1140 x 18 mm / VIEWBOX | 2 | par jonction petit côté |  | +30 % | confirmé | `acc:4-700-039@jonction_petit_cote` |
| 4-710-001 Connecting BOLT M16 HEX BOLT M16x110 /VIEWBOX/ | 10 | par jonction grand côté |  | +30 % | confirmé | `acc:4-710-001@jonction_grand_cote` |
| 4-710-001 Connecting BOLT M16 HEX BOLT M16x110 /VIEWBOX/ | 4 | par jonction petit côté |  | +30 % | confirmé | `acc:4-710-001@jonction_petit_cote` |

### Joints / étanchéité

| Article | Quantité | Base | Conditions | Spare | Confiance | Clé |
|---|---|---|---|---|---|---|
| 4-700-075 Window/Wall Rubber black BIG 5700mm /VIEWBOX/ | 1 | par produit (vitrage 4.4.2) |  |  | à confirmer | `acc:4-700-075@4.4.2/produit` |
| 4-157-003 Silicon DL CHEMICALS AM85-1 RAL 7024 / VIEWBOX / | 1 | par produit (vitrage 4.4.2) |  |  | à confirmer | `acc:4-157-003@4.4.2/produit` |
| 4-157-004 Silicon DL CHEMICALS Crystal / VIEWBOX / | 1 | par produit (vitrage 4.4.2) |  |  | à confirmer | `acc:4-157-004@4.4.2/produit` |
| 4-700-065 Window/Wall Rubber black BIG 2550mm /VIEWBOX/ | 8 | par box | regime = standalone | +20 % | confirmé | `acc:4-700-065@box[standalone]` |
| 4-700-075 Window/Wall Rubber black BIG 5700mm /VIEWBOX/ | 4 | par box | regime = standalone | +20 % | confirmé | `acc:4-700-075@box[standalone]` |
| 4-700-066 Window/Wall Rubber black BIG 2300mm /VIEWBOX/ | 4 | par box | regime = standalone | +20 % | confirmé | `acc:4-700-066@box[standalone]` |
| 4-700-071 Window/Wall Rubber black Carrosserie 2530mm /VIEWBOX/ | 1 | par jonction de panneaux sans vitre | regime = standalone | +20 % | confirmé | `acc:4-700-071@jonction_panneau[standalone]` |
| 4-700-070 Window/Wall Rubber black Carrosserie 10cm /VIEWBOX/ | 2 | par jonction de panneaux sans vitre | regime = standalone |  | confirmé | `acc:4-700-070@jonction_panneau[standalone]` |
| 4-700-073 Window/Wall Rubber black Square 25x30x2550mm for seamless 8.8.2 /VIEWBOX/ | 2 | par côté de box | regime = standalone |  | confirmé | `acc:4-700-073@cote[standalone]` |
| 4-700-064 Sub Block for windows and wall 45x100 /VIEWBOX/ | 2 | par panneau | regime = standalone | +25 % | confirmé | `acc:4-700-064@panneau[standalone]` |
| 4-700-068 Window/Wall Rubber black 10cm /VIEWBOX/ | 20 | par box |  |  | confirmé | `acc:4-700-068@box` |
| 4-700-061 Plexi profil 18mmx2530mm | 6 | par box (vitrage 8.8.2) | regime = standalone |  | confirmé | `acc:4-700-061@8.8.2/box[standalone]` |
| 4-157-003 Silicon DL CHEMICALS AM85-1 RAL 7024 / VIEWBOX / | 3 | par box |  |  | confirmé | `acc:4-157-003@box` |
| 4-157-004 Silicon DL CHEMICALS Crystal / VIEWBOX / | 2 | par box |  |  | confirmé | `acc:4-157-004@box` |
| 4-700-060 Plexi profil 10mmx2530mm | 1 | par jonction avec une vitre (vitrage 10mm) |  |  | confirmé | `acc:4-700-060@10mm/jonction_verre` |
| 4-700-072 Window/Wall Rubber black Square 25x40x2550mm for seamless 10mm /VIEWBOX/ | 1 | par terminaison vitre / poteau (vitrage 10mm) |  | +20 % | confirmé | `acc:4-700-072@10mm/terminaison_vitre` |
| 4-700-067 Window/Wall Rubber black Little 2300mm /VIEWBOX/ | 2 | par petit côté vitré (vitrage 10mm) |  | +50 % | confirmé | `acc:4-700-067@10mm/cote_vitre_court` |
| 4-700-074 Window/Wall Rubber black Little 5700mm /VIEWBOX/ | 2 | par grand côté vitré (vitrage 10mm) |  | +50 % | confirmé | `acc:4-700-074@10mm/cote_vitre_long` |
| 4-700-033 Roof Rubber roller TEC7 /15CMX1000CM /VBX/ | 1 | forfait chantier | couvert |  | confirmé | `aj:4-700-033@job[couvert]` |
| 4-700-072 Window/Wall Rubber black Square 25x40x2550mm for seamless 10mm /VIEWBOX/ | 2 | par porte coulissante (vitrage 10mm) |  |  | confirmé | `acc:4-700-072@10mm/porte_coulissante` |

### Électrique

| Article | Quantité | Base | Conditions | Spare | Confiance | Clé |
|---|---|---|---|---|---|---|
| 4-730-012 SPOT BLACK LED 24W /2700-6000K/ /2700lm/ /VIEWBOX/ /2026/ POLSKA FIRMA | 6 | par box |  |  | confirmé | `acc:4-730-012@box` |
| 4-730-007 Electrical cable ONE PLUG MALE / 3G1.5 /M / VIEWBOX | 1 | par îlot |  |  | confirmé | `acc:4-730-007@ilot` |
| 4-730-001 Electrical GROUND CABLE  YELLOW/GREEN + Socket / / VIEWBOX | 1 | par îlot |  |  | confirmé | `acc:4-730-001@ilot` |
| 4-730-008 Electrical cable SHUKO SQUARE Multiprise / BLACK / 3G1.5 /M / VIEWBOX | 2 | par box |  |  | confirmé | `acc:4-730-008@box` |
| 4-730-009 Electrical cable SHUKO Multiprise IP44 / BLACK / 3G1.5 /M / VIEWBOX | 1 | par box |  |  | confirmé | `acc:4-730-009@box` |
| 4-730-005 Electrical cable NO PLUG /3G1.5 /M / VIEWBOX | à apprécier | forfait chantier |  |  | à confirmer | `app:4-730-005@job` |
| 4-730-003 Electrical cable  Shuko  / 3G2.5 / 20M / VIEWBOX | à apprécier | forfait chantier |  |  | à confirmer | `app:4-730-003@job` |
| 4-730-002 Electrical cable  Shuko  / 3G2.5 / 10M / VIEWBOX | à apprécier | forfait chantier |  |  | à confirmer | `app:4-730-002@job` |
| 4-730-004 Electrical cable  Shuko  / 3G2.5 / 5M / VIEWBOX | à apprécier | forfait chantier |  |  | à confirmer | `app:4-730-004@job` |

### Consommables / finition

| Article | Quantité | Base | Conditions | Spare | Confiance | Clé |
|---|---|---|---|---|---|---|
| 7-636-006 TUV WALL Painted 1130x2520 COMPLETE - VIEWBOX M16 | 1 | par produit (7-636-008) | ralMurs = 7024 |  | confirmé | `sub:7-636-006@7-636-008/produit[7024]` |
| 4-700-044 PAINT KIT / VIEWBOX / | 1 | forfait chantier | tailleJob = petit |  | à confirmer | `aj:4-700-044@job[petit]` |
| 4-157-005 Gaffa TAPE NISHIBAN BLACK / VIEWBOX / | 1 par tranche de 15 (arrondi sup.) | par m² de plancher | plancherLamine |  | à confirmer | `aj:4-157-005@m2_plancher[plancherLamine]` |
| 4-157-012 Tape TWO SIDE for VYNYL 50mmx50M/ VIEWBOX / | 1 par tranche de 15 (arrondi sup.) | par m² de plancher | plancherLamine |  | à confirmer | `aj:4-157-012@m2_plancher[plancherLamine]` |

### Ajouts chantier

| Article | Quantité | Base | Conditions | Spare | Confiance | Clé |
|---|---|---|---|---|---|---|
| 4-750-001 BIG CASE TOOL KIT / VIEWBOX / | 1–7 → 1, 8–15 → 2 | par box |  |  | confirmé | `aj:4-750-001@box` |
| 4-750-002 WAKU Ladder 4X4 / VIEWBOX / | 4 par tranche de 12 (arrondi sup.) | par box |  |  | à confirmer | `aj:4-750-002@box` |
| 4-750-003 WAKU Ladder 5X6 / VIEWBOX / | 1 par tranche de 12 (arrondi sup.) | par box |  |  | à confirmer | `aj:4-750-003@box` |
| 4-750-006 TUV BOOK / VIEWBOX / | 1 | forfait chantier | hauteur |  | à confirmer | `aj:4-750-006@job[hauteur]` |
| 4-750-005 FULL  SAFETY LINE / VIEWBOX / | 1 | forfait chantier | hauteur |  | à confirmer | `aj:4-750-005@job[hauteur]` |
| 4-750-004 FULL BODY SAFETY HARNESS / VIEWBOX / | 2 | forfait chantier | hauteur |  | à confirmer | `aj:4-750-004@job[hauteur]` |

## Valeurs observées (régime connecté, à re-caler)

- 4-700-065 Window/Wall Rubber BIG 2550mm : 25 (6059RFRAMVIE, régime BOX ADJACENTES (4 VBX / 3 jonctions))
- 4-700-066 Window/Wall Rubber BIG 2300mm : 20 (6059RFRAMVIE, régime BOX ADJACENTES)
- 4-700-075 Window/Wall Rubber BIG 5700mm : 6 (6059RFRAMVIE, régime BOX ADJACENTES)
- 4-700-071 Window/Wall Rubber Carrosserie 2530mm : 8 (6059RFRAMVIE, régime BOX ADJACENTES)
- 4-700-070 Window/Wall Rubber Carrosserie 10cm : 22 (6059RFRAMVIE, régime BOX ADJACENTES)
- 4-700-073 Window/Wall Rubber Square seamless 8.8.2 : 12 (6059RFRAMVIE, régime BOX ADJACENTES)
- 4-700-064 Sub Block for windows and wall 45x100 : 50 (6059RFRAMVIE, régime BOX ADJACENTES)
- 4-700-061 Plexi profil 18mmx2530mm : 10 (6059RFRAMVIE, régime BOX ADJACENTES)
