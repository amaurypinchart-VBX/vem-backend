# PROMPT ADDITIF — Étude structure : liaisons inter-modules personnalisées (clamp) — phase S11

> À coller dans Claude Code (racine du repo `amaurypinchart-VBX/vem-backend`), **après** `claude_PROMPT_Etude_Structure_Viewbox.md` et `PROMPT_Etude_Structure_S10_Variantes_Optimisation.md`.
> Il s'appuie sur S10 (paramètres, variantes, statuts d'assemblage `valide / recalculé / indicatif / inconnu`, `dependsOn`, diagnostic/optimiseur). Toutes les règles des deux prompts précédents restent valables (aucun chiffre IA, solveur pur TypeScript, unités N/mm/MPa, CalcRecord, zéro régression Plans Viewbox, migrations idempotentes).

---

## 1. Rôle

Tu es **ingénieur structure senior (assemblages acier EC3-1-8 / DIN EN 1993-1-8 + NA, assemblages par serrage et par forme), architecte logiciel et développeur TypeScript senior**. Tu ajoutes la possibilité de **remplacer la liaison verticale entre Viewbox empilées** (aujourd'hui : plats boulonnés M20) par **un autre système (ex. clamp qui vient prendre un profil)**, dessiné dans SketchUp ou saisi dans l'app, que l'outil **reconnaît, analyse, calcule**, puis **compare à la liaison d'origine** : « équivalent / suffisant / insuffisant / incomplet ».

Réponses à l'utilisateur (Amaury, non développeur) : **directes, sans justification détaillée**. Si manipulation manuelle nécessaire de son côté : **bloc de code complet à chercher**, puis **bloc complet de remplacement**.

---

## 2. Besoin métier

La liaison d'origine entre modules empilés sert à **empêcher le glissement** et **le soulèvement**. Amaury veut la **retirer** et mettre un **autre système** (clamp sur profil, ou autre), en pouvant :

1. **Dessiner la pièce dans SketchUp** (taille, forme, type d'acier, boulons…), la placer sur le projet ;
2. l'envoyer dans l'app : l'outil **reconnaît la pièce**, comprend **sa forme et comment elle s'accroche** (quel profil elle prend, comment elle bloque) ;
3. obtenir : **« même calcul → ça passe »** ou **« non, ça ne passe pas, voici pourquoi et quoi changer »** ;
4. **mémoriser** la pièce validée dans une bibliothèque de liaisons, pour la réutiliser (et la comparer à d'autres) sans redessiner ;
5. pouvoir aussi **la définir sans SketchUp** (formulaire) pour un test rapide.

> Point à confirmer avec l'utilisateur (ne pas supposer) : l'Annexe A.3 du prompt principal décrit la liaison d'origine comme **8 plats 100×10, L = 400 mm, S235, trou Ø22, boulons M20-8.8, HRd = 5,81 kN par plat et par sens** ; l'utilisateur la décrit de mémoire comme « plaque 10 mm d'épaisseur, ~220 mm de haut, ~100 mm de large ». **Vérifier les dimensions réelles** (plan ou mesure) avant de calibrer la liaison « de référence ».

---

## 3. Règles non négociables (en plus des précédentes)

1. **La forme ne dit pas tout.** La géométrie donne : épaisseurs, contours, trous, surfaces de contact, jeux. Elle **ne donne pas** : nuance d'acier, classe et serrage des boulons, taille/longueur des soudures, coefficient de frottement, état de surface (galva/peinture), pré-tension. Ces données sont **demandées** (pop-up), jamais devinées. Donnée absente = **⛔ incomplet**.
2. **Distinguer les deux principes de blocage** et ne jamais les mélanger :
   - **par forme / butée** (crochet, ergot, boulon en cisaillement, plat en traction) : résistance = résistance des composants ;
   - **par serrage / frottement** (clamp qui serre une aile) : résistance = frottement × effort de serrage, **fiable seulement** si le serrage est **défini, contrôlable et maintenu** (boulons précontraints, couple de serrage spécifié, surface connue). Sinon → **indicatif**, verdict plafonné à ⚠️, avec l'avertissement « résistance par frottement non garantie sans serrage contrôlé ».
3. **Méthode des composants** (EC3-1-8) pour tout ce qui est calculable ; **une pièce non décomposable en composants connus → ⛔ « capacité inconnue : essai ou validation ingénieur requis »**. Aucune capacité inventée.
4. **Critère de réussite = capacité ≥ sollicitation** (efforts issus du **calcul complet de l'étude**, pas d'une valeur forfaitaire), dans **chaque direction** (glissement x, glissement y, soulèvement, compression si reprise par la pièce). L'**équivalence avec la liaison d'origine** est une information affichée en plus (« capacité = 83 % de l'ancienne, mais suffisante : η = 0,62 »).
5. **Le solveur remplace la raideur, pas seulement la capacité** : la nouvelle liaison a ses propres raideurs (kx, ky, kz), son **jeu de montage** (glissement avant mise en charge) et son comportement (traction seule, compression seule, frottement). Le modèle est **recalculé** avec ces ressorts ; un jeu important peut dégrader la stabilité d'ensemble.
6. **Statut de la liaison créée** (réutilise S10 §6) : *Recalculé* seulement si **tous** les composants sont calculés avec des données saisies/confirmées ; *Indicatif* si frottement/serrage non maîtrisé ou donnée estimée ; *Inconnu* sinon. Une liaison **personnalisée jamais testée** porte en plus l'étiquette **« prototype — non qualifié »** dans l'UI et dans le rapport, avec la mention « calcul analytique, essai de qualification recommandé ». Le verdict global **n'est jamais ✅** si une liaison est *Indicatif* ou *Inconnu*.
7. **Reconnaissance = proposition** (orange) ; jamais « confirmé » sans validation humaine (comme §5.3 du prompt principal).
8. **Les positions des pièces dans le modèle SketchUp décident des nœuds de liaison.** Si l'utilisateur place 4 clamps par interface, le modèle FEM a 4 liaisons à ces positions (et **plus** les 8 plats d'origine, qui sont retirés pour cette interface si la pièce est marquée « remplace la liaison d'origine »).
9. Aucun chiffre ne vient de l'IA. L'IA peut proposer un rapprochement avec un type de liaison connu ou rédiger un texte, avec les contrôles du §13 du prompt principal.

---

## 4. Modèle de données : `JointDesign` (liaison personnalisée)

```ts
interface JointDesign {
  id: string; name: string;
  function: { antiSlide: boolean; antiUplift: boolean; carriesCompression: boolean };
  replaces: 'verticalLink' | 'horizontalLink' | 'none';   // quelle liaison d'origine elle remplace
  principle: 'positive' /* forme/butée */ | 'friction' | 'mixed';
  components: JointComponent[];          // voir ci-dessous
  engagement: Engagement[];              // ce qu'elle prend / où elle s'appuie
  stiffness: { kx: number; ky: number; kz: number; play_mm: { x: number; y: number; z: number } }; // N/mm
  capacities?: { slideX: number; slideY: number; uplift: number; compression?: number }; // calculées, par pièce, en N
  status: 'recalculated' | 'indicative' | 'unknown';
  qualification: 'prototype' | 'tested' | 'certified';   // défaut 'prototype'
  source: 'sketchup' | 'form' | 'library';
  fingerprint: string; confirmedBy?: string; confirmedAt?: string; history: any[];
}

type JointComponent =
  | { kind: 'plate'; t_mm: number; width_mm: number; height_mm: number; grade: MaterialRef; holes: Hole[]; bend?: BendInfo }
  | { kind: 'bolt'; d_mm: number; class: '4.6'|'5.6'|'8.8'|'10.9'|string; count: number; preload?: { kind: 'none'|'controlled'; Fp_N?: number }; position: Vec3; shearPlane: 'thread'|'shank' }
  | { kind: 'weld'; a_mm: number; length_mm: number; between: [string, string] }   // saisi, jamais déduit de la géométrie
  | { kind: 'contactFace'; area_mm2: number; mu: number; surface: 'bare'|'painted'|'galvanized'|string }
  | { kind: 'hook'; engagementDepth_mm: number; throat_mm: number };

type Engagement =
  | { type: 'clamp'; profile: SectionRef; flangeThickness_mm: number; jawGap_mm: number; jawDepth_mm: number }
  | { type: 'hook';  profile: SectionRef; lipOverlap_mm: number }
  | { type: 'boltThrough'; member: string; edgeDist_mm: number; holeToHole_mm: number }
  | { type: 'bearing'; member: string; area_mm2: number };
```

Stockage : `struct_library_items` avec `kind = 'joint_design'` (clés : empreinte géométrique, nom, réf. SketchUp), colonnes existantes (source, confirmé par/le, historique). Les `JointDesign` sont référencées par `ViewboxParams.joints.verticalLink` (S10 §4) via `JointRef`.

---

## 5. Côté SketchUp (plugin Ruby `viewbox_prep`)

1. Nouvelle catégorie **`LIAISON`** (sous-types : `LIAISON-VERT`, `LIAISON-HORIZ`) dans « Réviser les catégories… » ; la liaison d'origine reste reconnue par le gabarit.
2. Dialogue **« Liaison… »** sur la sélection (groupe/composant) :
   - **Fonction** : anti-glissement / anti-soulèvement / les deux ; **Remplace** : liaison verticale d'origine (oui/non) ;
   - **Principe** : forme/butée · serrage/frottement · mixte ;
   - **Matériau** (nuance), **boulons** (nombre, Ø, classe, serrage spécifié ou non, couple), **soudures** (a × L par cordon, entre quelles pièces), **état de surface** ;
   - **Profil pris** (pré-rempli par détection, §6.2) ;
   - **Nom** + « enregistrer comme type de liaison ».
3. Stockage dans le dictionnaire d'attributs **de la définition** (le type de pièce) pour la description, et de **l'instance** pour ses surcharges ; export manifest : `jointDesign` (champs saisis) + `jointSchemaVersion`. Lecture tolérante : champ absent = pièce non-liaison.
4. Mettre à jour `core.rb`, `manifest.ts`, tests Ruby et Vitest. Un `.zip` sans liaison personnalisée se comporte exactement comme avant.
5. Les pièces `LIAISON` sont **exclues** du décompte « inconnues » des charges/vent (elles ne sont pas des accessoires) mais comptées dans le poids.

---

## 6. Reconnaissance de la pièce (`core/jointRecognition.ts`, pur, testé sur maillages synthétiques et réels)

### 6.1 Décomposition en composants
À partir du maillage isolé de la pièce (même ingestion que `sectionDetect.ts`, §5.5 du prompt principal) :
1. **Clustering de faces planes** (triangles coplanaires, tolérance angulaire/distance paramétrable).
2. **Plaques** : paires de faces planes parallèles, opposées, à distance ≤ 40 mm → plaque d'épaisseur *t*, contour (largeur × hauteur dans le plan), nuance **à confirmer**.
3. **Trous** : boucles intérieures circulaires/oblongues → diamètre, centre, entraxes, distances au bord (→ boulons candidats : Ø de boulon = Ø trou − jeu standard, proposition).
4. **Plis** : arêtes à ~90° ou patches cylindriques → plaque pliée (L/U/Z), rayon, longueurs de branches.
5. **Soudures** : non reconnaissables → liste des **jonctions plaque/plaque candidates** (arêtes de contact) à renseigner (a × L).
6. **Regroupement** en une `JointDesign` brouillon (statut *proposé*, orange) avec la liste de **questions ouvertes** (nuance, classe boulon, soudures, serrage, μ).

### 6.2 Analyse d'engagement (« comment ça s'accroche »)
Avec les éléments voisins du modèle (rive UNP, poteau, platine, plat d'origine) :
- **Contact/recouvrement** : faces de la pièce à ≤ 1–2 mm d'un élément → surface de contact, normale, effort transmissible (compression).
- **Clamp** : deux mâchoires opposées de part et d'autre d'une aile/âme → `jawGap`, épaisseur de l'aile prise `tf`, **jeu = jawGap − tf**, profondeur de prise, position par rapport au bord d'aile ; **alertes** : jeu > tolérance paramétrable (défaut 1 mm), prise < profondeur mini, mâchoire en appui sur congé de raccordement (rayon) au lieu de l'aile droite.
- **Crochet / ergot** : surface de la pièce **derrière** un bord d'élément dans le sens du soulèvement (contre-dépouille) → blocage positif, profondeur d'engagement.
- **Boulon traversant** : trous alignés avec ceux d'un élément (distance centre à centre ≤ 2 mm) → boulon en cisaillement/traction, distances au bord et entre trous (EC3-1-8 Tab. 3.3).
- **Chemins d'effort** (par direction x, y, z) : lister quels composants travaillent pour chaque direction ; direction **sans chemin** → ❌ « cette liaison ne retient rien en … » (ex. un clamp seul ne retient pas le soulèvement si rien ne bloque l'aile vers le haut).

### 6.3 Pop-up « Qu'est-ce que cette liaison ? »
Même logique que §5.4 du prompt principal (liste par type, une réponse s'applique à toutes les instances) : montre la miniature, la décomposition proposée (plaques, trous, mâchoires), le chemin d'effort par direction, et demande uniquement ce que la géométrie ne donne pas. Boutons : *Valider · Valider et suivant · Demander à l'IA (reste orange) · Ignorer*.

---

## 7. Calcul de la liaison (`core/checks/jointDesign.ts`, méthode des composants)

Pour **chaque direction** (glissement x, glissement y, soulèvement, compression si applicable), calculer la **résistance de la liaison par pièce** = le **minimum** des composants du chemin d'effort, avec CalcRecord par composant (formule littérale + valeurs + clause) :

- **Boulons** : cisaillement (plan fileté/lisse), traction, **interaction cisaillement + traction** (EC3-1-8 Tab. 3.4), poinçonnement ; γM2 = 1,25.
- **Pression diamétrale** dans chaque plaque et dans l'élément traversé (**avec son épaisseur réelle**, ex. âme d'UNP), distances au bord/entre trous.
- **Section nette / brute** des plaques en traction, cisaillement de bloc (block tearing).
- **Plaque en flexion** (porte-à-faux, T-stub, effet de levier/prying) quand l'effort est excentré par rapport aux boulons/soudures.
- **Soudures** (méthode directionnelle ou simplifiée EC3-1-8 §4.5) — uniquement avec *a × L* saisis.
- **Serrage/frottement** (EC3-1-8 §3.9) : `Fs,Rd = ks · n · μ · Fp,C / γM3` **uniquement** si boulons précontraints (8.8/10.9) avec `Fp,C = 0,7 · fub · As` et serrage contrôlé ; sinon capacité de frottement = **indicative** (rapportée, non utilisée pour le verdict ✅). Prendre en compte **la perte de serrage** (tassement, vibrations) par un coefficient de prudence paramétrable (défaut 0,8) et l'effet de la **flexion de l'aile prise** ; avec frottement seul, **μ de l'état de surface réel** (peinture/galva : valeurs prudentes en bibliothèque, à confirmer).
- **Profil pris** (vérification locale du **profil existant**, indispensable) : flexion de l'aile en porte-à-faux sous l'effort du clamp, écrasement/voilement local de l'âme, effort sur l'aile par rapport à son épaisseur et au rayon de congé ; ces vérifications utilisent la **section réelle du profil** (ex. UNP 220 : tf et tw des tables) et passent en *Inconnu* si la table ne les contient pas.
- **Compression** : si la liaison remplace le contact poteau/poteau, vérifier qu'une surface d'appui équivalente subsiste (sinon ⛔) ; si le contact d'origine est conservé, la liaison ne reprend pas de compression (déclaré).

Sortie : `capacities` par direction + composant déterminant + η par composant. **Aucune valeur « moyenne » : le minimum du chemin gouverne.**

---

## 8. Intégration au solveur et à l'étude

1. Pour une interface entre deux modules empilés : si une `JointDesign` est affectée (par pièces placées dans SketchUp ou par l'affectation de type dans l'app), **retirer** les barres équivalentes de la liaison d'origine à cette interface (si `replaces`), et **ajouter** à chaque position de pièce un **élément de liaison** à ressorts (kx, ky, kz) avec **jeu** et **comportement** : traction seule en z (soulèvement) ou compression seule selon la fonction, frottement glissant en x/y si principe friction (non linéaire, itérations actif/inactif comme les appuis du §9 du prompt principal).
2. Si aucune pièce n'est placée à une interface empilée : **avertissement** « interface empilée sans liaison » (si la liaison d'origine est retirée et rien ne la remplace) → ⛔ tant que non résolu.
3. Les efforts de chaque liaison (Fx, Fy, Fz par pièce, enveloppe sur toutes les combinaisons RC1/RC2) alimentent la vérification §7 et le **diagnostic** (S10 §9) : leviers ajoutés à l'optimiseur — plus de pièces, boulon plus gros/classe supérieure, plaque plus épaisse, mâchoire plus profonde, soudure plus grande, serrage contrôlé, retour à la liaison d'origine.
4. `dependsOn` S10 : la revalidation se fait automatiquement si on change le profil pris (ex. UNP 220 → UNP 160 modifie *tf*, *tw*, *r* → la vérification de l'aile prise est recalculée ; si la forme du clamp ne s'adapte plus à l'aile → ⛔ « mâchoire incompatible »).

---

## 9. Comparaison « liaison d'origine vs nouvelle » (écran **Comparer les liaisons**)

Tableau côte à côte (liaison d'origine / nouvelle pièce) :
- principe (forme / frottement), nombre de pièces par interface, masse ajoutée/retirée, statut (valide/recalculé/indicatif/inconnu), qualification (prototype/testé/certifié) ;
- capacités par pièce : glissement x, y, soulèvement, compression, composant déterminant ;
- raideurs et jeu ;
- **sollicitation maximale de l'étude** (enveloppe) et **η par direction** pour chaque option ;
- effet sur le **verdict global** : exécution du **calcul complet des deux versions** (base vs variante S10) + tableau des écarts (réactions au sol, glissement global μ requis, déplacements).

**Verdict de la liaison** (affiché en gros, avec raisons) :
- ✅ **Équivalente ou meilleure** : capacités ≥ ancienne dans toutes les directions et ≥ sollicitation ;
- 🟢 **Suffisante** : < ancienne mais ≥ sollicitation (avec marge η affichée) ;
- ⚠️ **Limite / indicative** : η entre 0,90 et 1,00, ou capacité indicative (frottement non garanti, extrapolation) ;
- ❌ **Insuffisante** : direction + composant + η + **pistes chiffrées** pour corriger ;
- ⛔ **Incomplète** : données manquantes (liste explicite des champs à renseigner).

Le rapport (S6) reçoit une section « Liaison personnalisée » : description, croquis/vues 3D de la pièce, hypothèses, CalcRecords, comparaison avec la liaison d'origine, mention « prototype — non qualifié, essai recommandé ».

---

## 10. Mode sans SketchUp (formulaire)

Dans l'onglet « Variantes » (S10 §8) : bouton **« Définir une liaison »** → assistant en 4 étapes (type : clamp / plat boulonné / crochet / autre → dimensions et matériaux → boulons et soudures → profil pris) qui produit la même `JointDesign` ; **mêmes calculs, mêmes résultats** que depuis SketchUp. Gabarits de départ en bibliothèque : « plat boulonné 100×10 M20 » (liaison d'origine), « clamp à 2 mâchoires boulonnées », « clamp à crochet », « équerre boulonnée ».

---

## 11. Architecture (ajouts)

```
plans/src/structure/core/
  jointRecognition.ts   décomposition plaques/trous/plis, engagement (clamp, crochet, boulon traversant, appui)
  jointDesign.ts        types JointDesign, statuts, qualification
  checks/jointDesign.ts méthode des composants + profil pris + frottement
  jointElement.ts       élément de liaison solveur (ressorts, jeu, traction/compression seule, frottement)
  jointCompare.ts       comparaison origine vs nouvelle, verdict
plans/src/ui/structure/
  JointDialog.tsx  JointCompare.tsx  JointWizard.tsx
plans/sketchup/viewbox_prep/   dialogue « Liaison… », catégorie LIAISON
plans/tests/structure/jointRecognition.test.ts, jointDesign.test.ts, jointCompare.test.ts
```

Données : `kind = 'joint_design'` dans `struct_library_items` (SQL idempotent + Prisma, `(prisma as any)`), affectation de la liaison aux interfaces dans `struct_scenarios.overrides` (S10 §10).

---

## 12. Phases S11 (commits courts, `cd plans && npm test && npm run typecheck` verts, `CLAUDE.md` à jour, résumé court + « quoi tester »)

- **S11a — Modèle & calcul par composants** : `JointDesign`, `checks/jointDesign.ts`, liaison d'origine **modélisée avec les mêmes composants** et qui doit **retomber sur les capacités de l'Annexe A.3** (HRd 5,81 kN/plat/sens, Ft,Rd M20 141,1 kN) à ± 2 %. Si ça ne retombe pas, **s'arrêter et signaler** (la méthode n'est pas calée).
- **S11b — Élément de liaison dans le solveur** : ressorts, jeu, traction/compression seule, frottement ; remplacement de la liaison d'origine à une interface ; avertissement interface sans liaison.
- **S11c — Reconnaissance géométrique** : plaques, trous, plis, clamp/crochet/boulon traversant, chemins d'effort, pop-up ; critère : sur 3 pièces test (plat boulonné d'origine, clamp à 2 mâchoires, équerre) la décomposition proposée est correcte et les questions ouvertes sont les bonnes.
- **S11d — SketchUp** : catégorie `LIAISON`, dialogue Ruby, manifest `jointDesign`, tests Ruby.
- **S11e — Comparaison & verdict** : écran *Comparer les liaisons*, calcul complet des deux versions, intégration à l'optimiseur S10, section de rapport.
- **S11f — Calage sur cas réel** : première pièce clamp d'Amaury ; documenter chaque hypothèse ; proposer la liste des **essais de qualification** utiles (glissement, arrachement, serrage).

Avant S11a : **pose les questions du §14**, propose le plan détaillé, attends validation.

---

## 13. Tests et critères d'acceptation

**Tests (Vitest, valeurs de référence avec source) :**
- Liaison d'origine recalculée par composants = capacités de l'Annexe A.3 (± 2 %).
- Chaque composant isolé : cas de manuel (boulon M20-8.8 cisaillement/traction, pression diamétrale avec tw = 9 mm, soudure en cordon, `Fs,Rd` frottement) comparés à des calculs à la main documentés.
- Direction sans chemin d'effort → ❌ (jamais une capacité nulle silencieuse).
- Frottement sans serrage contrôlé → statut *indicatif*, verdict plafonné à ⚠️.
- Donnée manquante (soudure, nuance, classe) → ⛔ incomplet, jamais ✅.
- Équilibre global avec éléments de liaison à jeu (Σ réactions = Σ charges, 1e-6) ; invariance par rotation du modèle de 90°.
- Reconnaissance sur maillages synthétiques : plaque simple, plaque trouée, plaque pliée en U, clamp à 2 mâchoires, crochet ; tolérances documentées.
- Manifest avec et sans `jointDesign` ; round-trip d'une `JointDesign` (bibliothèque/variante).
- Une Viewbox standard (liaison d'origine) donne des résultats **strictement identiques** à avant S11.

**Critères d'acceptation :**
1. Amaury dessine un clamp dans SketchUp, le renseigne (nuance, boulons, soudures), exporte, dépose le `.zip` : l'outil propose la décomposition, ne demande **que** ce que la géométrie ne donne pas, et la mémorise.
2. Le chemin d'effort est affiché par direction (glissement x/y, soulèvement), avec le composant déterminant.
3. Verdict clair : équivalente / suffisante / limite / insuffisante / incomplète, avec **sollicitation réelle de l'étude** et marge ; en cas d'échec : cause + **au moins 2 pistes chiffrées**.
4. Le calcul complet est relancé avec la nouvelle liaison (raideurs et jeu pris en compte) et comparé à la liaison d'origine.
5. Aucun ✅ si frottement non garanti, donnée manquante, extrapolation ou liaison « prototype » non confirmée ; le rapport le dit.
6. Plans Viewbox et étude de base strictement inchangés pour une Viewbox standard.

---

## 14. Questions à poser à l'utilisateur au démarrage (S11)

1. **Liaison d'origine** : dimensions exactes des plats (Annexe : 100×10, L 400 ; ton souvenir : ~10 mm × 220 mm × 100 mm), nombre par module, boulons (M20-8.8), trous (Ø22 ?) : plan ou mesure ?
2. **Nouveau système** : le clamp doit-il retenir **le glissement, le soulèvement, ou les deux** ? Prend-il **quel profil** (aile d'UNP, poteau, autre) ? Le **contact poteau/poteau** (compression) est-il **conservé** ?
3. **Principe de blocage** : serrage/frottement pur, ou aussi une butée/crochet ? Si serrage : **boulons précontraints** avec couple spécifié ?
4. **Fabrication** : nuance d'acier, épaisseurs, boulons (Ø, classe), **soudures** (taille/longueur), traitement de surface (galva, peinture, brut) ?
5. **Montage** : jeu de montage toléré (mm), nombre de pièces par interface, positions voulues (angles, milieux de côté) ?
6. As-tu déjà **dessiné la pièce dans SketchUp** (avec trous et épaisseurs réels) ou partons-nous du formulaire ?
7. Un **ingénieur** peut-il valider la première pièce ou faut-il prévoir un **essai** (glissement/arrachement) avant utilisation sur chantier ?
