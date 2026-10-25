# PROMPT ADDITIF — Étude structure : variantes, modification de profils, diagnostic & optimisation (phase S10)

> À coller dans Claude Code (racine du repo `amaurypinchart-VBX/vem-backend`), **après** `claude_PROMPT_Etude_Structure_Viewbox.md`.
> Ce prompt **complète** le prompt principal (S0–S9) et ne remplace rien. Toutes ses règles (§4 : aucun chiffre IA, solveur pur TypeScript, unités N/mm/MPa, CalcRecord, zéro régression Plans Viewbox, migrations idempotentes…) restent valables.

---

## 1. Rôle

Tu es à la fois **ingénieur structure senior (EC3 / EC5 / DIN EN 13814), architecte logiciel et développeur TypeScript senior**. Tu ajoutes à l'outil « Étude structure » la capacité de **modifier une Viewbox** (profils, hauteur de poteaux, matériaux, plancher…), de **recalculer**, de **dire pourquoi ça ne passe pas**, de **proposer les changements minimaux pour que ça passe**, et de **comparer les variantes**.

Réponses à l'utilisateur (Amaury, non développeur) : **directes, sans justification détaillée**. Si une manipulation manuelle est nécessaire de son côté : donne le **bloc de code complet à chercher**, puis le **bloc complet de remplacement**.

---

## 2. Besoin métier (parcours cibles)

**A. Depuis SketchUp** — Amaury modélise une Viewbox modifiée (ex. rives **UNP 160** au lieu de UNP 220, poteaux **5 m** au lieu de 3,08 m). Le plugin Ruby `viewbox_prep` lui permet de dire « ce module est une Viewbox **avec ces paramètres** ». Il exporte, dépose le `.zip` dans l'app : l'étude reprend ces paramètres, sans les redemander.

**B. Depuis l'app** — Dans l'onglet « Étude structure », il peut changer les tailles/profils/matériaux d'un module (ou de tous les modules d'un même type), puis cliquer **Calculer**.

**C. Diagnostic** — Si ça ne passe pas : l'outil dit **quoi** ne passe pas (élément, vérification, combinaison, taux η), **pourquoi** (cause lisible), et **ce qu'il faut changer** (2 à 3 solutions chiffrées, classées).

**D. Boucle d'itération** — Un onglet **« Variantes »** : A (base) / B / C… Il modifie, recalcule, compare avec la base (tableau des écarts), garde ce qui marche. Le tout en quelques clics, sans repasser par SketchUp.

---

## 3. Règles non négociables (en plus du §4 du prompt principal)

1. **Une variante = la base + un diff de paramètres.** On ne duplique jamais l'étude complète : on stocke seulement les **surcharges** (`overrides`).
2. **Le type reste le type.** Une Viewbox modifiée reste « Viewbox » pour la reconnaissance (§5.2 du prompt principal) ; la signature ne change pas. Les différences vivent dans les **paramètres d'instance/type**, pas dans la signature. Deux instances de la même définition peuvent avoir des paramètres différents.
3. **Jamais de capacité héritée à tort.** Les capacités d'assemblage de l'Annexe A.3 (angle poteau/cadre 8,0 kNm…, contact vertical 176 kN, plats 5,81 kN, etc.) ne valent **que** pour le gabarit d'origine. Dès qu'un profil ou une géométrie concernés par un assemblage change, l'assemblage passe en statut « **hors gabarit** » (§6) : recalculé si c'est faisable avec EC3-1-8, sinon ⛔ « capacité inconnue ». **Jamais ✅ sur une capacité extrapolée sans le dire.**
4. **Le contrôle « poids module nu = 20 kN ± 10 % »** ne s'applique qu'au gabarit d'origine. Pour une variante : afficher le poids **calculé** et la variation par rapport à la base, sans avertissement de recalage.
5. **Le solveur recalcule toujours** (une section plus rigide attire plus d'effort : on ne « revérifie » jamais avec les anciens efforts).
6. **L'optimiseur ne modifie jamais rien tout seul** : il propose, l'utilisateur clique « Tester » (→ nouvelle variante) puis valide.
7. **Aucun chiffre ne vient de l'IA** (identique au prompt principal). Les phrases de diagnostic sont générées par **gabarits de texte déterministes** ; l'IA peut seulement reformuler, avec le même contrôle « tout nombre du texte existe dans les données » (§13 du prompt principal).
8. Priorité des valeurs, de la plus forte à la plus faible : **surcharge de variante (app) > attribut SketchUp d'instance > paramètre de type (projet) > bibliothèque > défaut du gabarit**. Chaque champ affiche son **origine** (badge : SketchUp / Bibliothèque / Modifié / Défaut) et un bouton « Rétablir ».

---

## 4. Gabarit Viewbox paramétrique

Remplacer le gabarit figé `templates/viewbox5900eu.ts` par un **générateur paramétrique** `templates/viewboxParametric.ts` dont les valeurs par défaut reproduisent **exactement** le gabarit de l'Annexe A (aucune différence de résultat pour une Viewbox standard : test de non-régression sur les cas S8).

```ts
interface ViewboxParams {
  geometry: {
    length_mm: number;            // 5900 (défaut)
    width_mm: number;             // 2500
    postHeight_mm: number;        // 3080 (haut de poteau)
    roofLineOffset_mm: number;    // 290 (3080 - 2790) : ligne de système toiture sous le haut de poteau
    secondarySpacing: 'default' | number[]; // abscisses des traverses ; 'default' = 1144/2344/3544/4745
    longitudinalRails_y_mm: number[];       // 835 / 1665
  };
  sections: {
    floorEdge: SectionRef;        // UNP 220
    roofEdge: SectionRef;         // UNP 220
    secondary: SectionRef;        // RHP 120×60×4
    post: SectionRef;             // QHP 100×5
    footReceiver: SectionRef;     // T soudé âme 10 / semelle 15
  };
  materials: {                    // nuance par famille
    edge: MaterialRef; secondary: MaterialRef; post: MaterialRef; foot: MaterialRef;
  };
  decks: {
    floorPly_mm: number; floorLayers: number;   // 18 × 2
    roofPly_mm: number;  roofLayers: number;    // 18 × 1
    plyGrade: 'F20/15' | 'F40/30' | string;
  };
  options: {
    intermediateFoot: boolean;                  // pied central (défaut false)
    midHeightRing: boolean;                     // cadre intermédiaire de poteau (utile si poteaux hauts)
    bracing: BracingParam[];                    // contreventements proposés/forcés
  };
  joints: {                                     // assemblages (voir §6)
    cornerJoint: JointRef;                      // 4×M16-8.8, platines 10 mm…
    verticalLink: JointRef; verticalContact: JointRef; horizontalLink: JointRef;
  };
}
```

- `SectionRef` = `{ catalogId }` **ou** `{ custom: { shape: 'U'|'RHS'|'SHS'|'CHS'|'I'|'FLAT'|'ANGLE', h, b, tw, tf, t, r } }` (propriétés calculées par formules, voir §5).
- Le générateur **dérive tout** de ces paramètres : positions de nœuds, ligne de plancher/toiture/haut de poteau (poteaux plus hauts → toute la géométrie, les surfaces de vent, le centre de gravité et le poids suivent), maillage, liaisons inter-modules, appuis.
- **Hauteur de poteau modifiée** : prévoir explicitement (a) élancement et flambement des poteaux (2ᵉ ordre déjà présent), (b) moment d'angle plus grand, (c) la hauteur totale d'empilement pour le vent (seuils h ≤ 8 m / ≤ 20 m déjà dans `wind.ts`), (d) l'avertissement « poteau > X m sans maintien intermédiaire → proposer `midHeightRing` ou contreventement ».
- Un module dont la hauteur ou le profil change **reste empilable** seulement si l'interface d'empilement (plat de contact, platines de liaison) est compatible : sinon → ⛔ « interface d'empilement non définie pour cette variante ».
- Tout champ non modifié reprend la valeur de la base : **une variante sans surcharge doit donner des résultats identiques à la base** (test exact).

---

## 5. Catalogue de sections étendu

Dans `core/catalog.ts` :
- Ajouter les familles courantes avec **toutes les tailles standard** : **UNP 80→300**, UPE, IPE, HEA, HEB, **SHS/RHS formés à froid et à chaud**, **CHS**, plats, cornières, U/C pliés paramétriques.
- Propriétés (A, Iy, Iz, Wel, Wpl, It, Iw, masse linéique, classe de flambement/courbes, tw, tf, h, b) : **chargées depuis les tables fabricant** (données saisies en JSON dans `library/sections.json`, avec source) et **recontrôlées** par un test qui compare avec les formules géométriques (écart < 2 % pour A, Iy, Wel). Ne **pas** inventer de valeurs de mémoire : si une taille n'est pas dans les tables fournies, elle n'est pas proposée.
- Chaque section : drapeau `availability: 'standard' | 'special'` et `inStock?: boolean` (alimenté par la bibliothèque `stock` du prompt principal) pour classer les propositions de l'optimiseur.
- Les sections ajoutées par l'utilisateur (saisie h×b×t) s'enregistrent dans la bibliothèque (`kind: 'section'`).
- Relation d'ordre : chaque famille a une **liste ordonnée par rigidité/masse** (ex. UNP 160 < 180 < 200 < 220 < 240…) utilisée par l'optimiseur.

---

## 6. Revalidation des assemblages en cas de modification

Pour chaque assemblage de la bibliothèque, déclarer les **paramètres dont il dépend** (`dependsOn: ['edge.tw','edge.h','post.shape','post.size', ...]`). À chaque variante :

| Statut | Condition | Traitement |
|---|---|---|
| **Valide (gabarit)** | aucun paramètre dépendant modifié | capacité de la bibliothèque, comme aujourd'hui |
| **Recalculé** | paramètres modifiés mais assemblage calculable en EC3-1-8 (boulons en cisaillement/traction, pression diamétrale dans l'âme avec le **nouveau tw**, soudure à cordon, plat en traction/compression) | capacité recalculée + CalcRecord avec formules |
| **Extrapolé (indicatif)** | assemblage non calculable en simple (ex. angle poteau/cadre à platines soudées, rigidité semi-rigide 3 500 kNcm/°) mais comparable | capacité mise à l'échelle **prudente** (règle documentée), affichée 🟠 « indicatif — à valider par un ingénieur », **verdict plafonné à ⚠️** |
| **Inconnu** | aucune base de calcul | ⛔ « capacité inconnue : à saisir ou à faire valider » + champ de saisie manuelle de la capacité (stockée avec source) |

- La rigidité semi-rigide des angles est un paramètre du solveur : en variante, la reprendre de la base **avec avertissement** tant qu'elle n'est pas recalculée.
- Une capacité saisie à la main par l'utilisateur est mémorisée (`source: 'user'`, auteur, date) et marquée « non vérifiée » dans le rapport.
- Le verdict global ne peut être ✅ que si **aucun** assemblage n'est « Inconnu » ni « Extrapolé ».

---

## 7. Côté SketchUp (plugin Ruby `viewbox_prep`)

Étendre `plans/sketchup/viewbox_prep/core.rb` (et le dialogue « Réviser les catégories… ») :
1. Nouveau dialogue **« Structure… »** sur la sélection (module Viewbox = groupe/composant) :
   - listes déroulantes **Profil rive plancher / rive toiture / secondaires / poteaux**, **nuance**, **hauteur de poteau** (pré-remplie depuis la boîte englobante du module, modifiable), option « pied central », « cadre intermédiaire », épaisseur/pli de contreplaqué ;
   - bouton « Rétablir les valeurs standard » ;
   - indicateur « module standard » / « module modifié (n paramètres) ».
2. Stockage dans le **dictionnaire d'attributs de l'instance** (pas de la définition) : `viewbox_struct` → JSON `{ v: 1, params: { …seulement les valeurs différentes du standard… } }`. Ainsi deux instances de la même définition peuvent différer.
3. Export dans le manifest : champ `structParams` par module + `structSchemaVersion`. Mettre à jour `manifest.ts` (lecture tolérante : champ absent = standard), les tests Ruby et les tests Vitest du manifest.
4. **Lecture de la géométrie réelle** (si Amaury a modélisé les vrais profils) : quand les barres internes existent, utiliser `sectionDetect.ts` (§5.5 du prompt principal) pour **proposer** (orange, à confirmer) le profil détecté, et comparer à l'attribut saisi ; en cas d'écart → avertissement « le dessin et les paramètres ne correspondent pas ».
5. Les valeurs inconnues du catalogue (ex. profil non listé) sont exportées en `custom` (h, b, tw, tf…) et créées dans la bibliothèque côté app après confirmation.
6. Aucune régression : un `.zip` sans `structParams` se comporte exactement comme avant.

---

## 8. Onglet « Variantes » (UI)

Dans `Workspace.tsx` › Étude structure, nouvelle étape/onglet **« Variantes »** (français, messages courts) :

- **Barre de variantes** : A (base, non modifiable) · B · C … ; boutons *Dupliquer*, *Renommer*, *Supprimer*, *Définir comme référence*.
- **Éditeur de module** : sélection d'un module dans la 3D ou la liste → formulaire groupé : *Géométrie* · *Profils* · *Matériaux* · *Plancher/toiture* · *Assemblages* · *Options*. Chaque champ : valeur, badge d'origine, bouton Rétablir. Sélecteur de portée : **Ce module · Tous les modules du même type · Tous les modules du modèle**.
- **Indicateurs instantanés** (sans calcul FEM) affichés dès la modification : poids du module et variation, hauteur totale, élancement des poteaux, alertes de géométrie (ex. « poteau 5 m : maintien intermédiaire à prévoir »), statut des assemblages (valide / recalculé / indicatif / inconnu).
- **Bouton « Calculer la variante »** (Web Worker, progression, annulable) ; estimation du temps affichée ; résultat mémorisé par variante, marqué « périmé » dès qu'un paramètre change.
- **Tableau de comparaison** : colonnes = variantes, lignes = poids total, réactions d'appui max, pression au sol, plaques de répartition requises, η max par famille (barres, poteaux, angles, liaisons, contreventements, glissement…), verdict. Écarts colorés par rapport à la base.
- **Panneau « Pourquoi ça ne passe pas ? »** (§9) et **« Propositions »** avec bouton *Tester* par proposition (crée une variante dérivée et lance le calcul).
- **3D colorée par η** pour la variante affichée ; bascule rapide base ↔ variante pour voir ce qui change.
- Mode **« Module seul »** (sans modèle SketchUp) : formulaire pour calculer rapidement 1 Viewbox ou une pile (n niveaux), avec ses paramètres modifiés — même moteur, mêmes résultats.

---

## 9. Diagnostic et optimisation (`core/diagnose.ts`, `core/optimize.ts`, pur et testé)

### 9.1 Diagnostic (déterministe)
Pour chaque élément/assemblage avec η > 1 (ou ⛔) produire un `Diagnosis` :
```ts
{ element, family, check: 'flexion-déversement' | 'flambement' | 'interaction N+M' | 'cisaillement' | 'angle biaxial' | 'liaison' | 'sol' | 'glissement' | 'déplacement' | …,
  eta, governingCombo, clause, governingEffect: { name, value, unit }, capacity: { value, unit },
  cause: string /* gabarit de texte FR */, levers: LeverEffect[] }
```
- Regrouper les éléments identiques (« 12 rives UNP 160 : η max 1,34 en flexion-déversement, combinaison CO x+3 »).
- Texte type : « **Ne passe pas** : rives de plancher UNP 160, η = 1,34 (limite 1,00). Cause : flexion avec déversement, vent hors service direction +x. »
- Distinguer **cause locale** (la barre est trop faible) et **cause globale** (rigidité d'ensemble, glissement, soulèvement, sol).

### 9.2 Leviers testables
Famille de leviers, chacun avec une direction « améliore » et un **coût** (masse ajoutée, nb de pièces modifiées, disponibilité) :
1. **Section supérieure** dans la même famille (liste ordonnée §5), pour : rives, secondaires, poteaux, platines.
2. **Nuance d'acier** supérieure (S235 → S275 → S355) si la vérification est gouvernée par la résistance, pas par la stabilité/déformation.
3. **Pied central** / **appuis intermédiaires** ; **cadre intermédiaire** de poteau.
4. **Contreventement** (positions candidates issues du §6.2 du prompt principal).
5. **Contreplaqué** : épaisseur / nombre de plis / réduction de la portée par traverse supplémentaire.
6. **Hypothèses d'exploitation** (réduire Q, évacuation des terrasses au-delà d'un seuil de vent, retirer l'habillage d'un côté) — proposées à part, étiquetées « changement d'usage », jamais mélangées aux changements de matière.
7. **Sol** : plaques plus grandes, tôle, madriers, lest, interdire vérins (§11 du prompt principal).

### 9.3 Algorithme
1. Lancer le calcul complet de la variante courante ; collecter les `Diagnosis`.
2. Pour chaque cause **locale** : parcourir les leviers pertinents **un à la fois** ; pour chaque candidat, **re-résoudre** (warm start, uniquement les combinaisons gouvernantes — top-k par taux — pour aller vite).
3. Recherche du **changement minimal** : par famille, avancer dans la liste ordonnée jusqu'à η ≤ 0,90 (cible paramétrable ; 1,00 minimum) ; si la monotonie n'est pas vérifiée (redistribution d'efforts), tester aussi le candidat suivant avant de conclure.
4. **Combinaisons de leviers** : glouton, **3 leviers maximum**, jusqu'à convergence ou échec explicite.
5. **Vérification finale** des 3 meilleures solutions par un **calcul complet** (toutes combinaisons) avant affichage.
6. **Classement** : (a) passe avec ✅ ; (b) masse ajoutée minimale ; (c) nombre minimal de pièces modifiées ; (d) disponibilité (standard, en stock) ; (e) pas d'assemblage « Inconnu/Extrapolé » créé.
7. Sortie : 1 à 3 propositions chiffrées : « **Passe avec** : rives UNP 200 (η 0,95, +38 kg/module) — ou ajouter 1 pied central (η 0,81). » ; si aucune solution dans les limites des leviers : « **Aucune solution simple trouvée** : voir causes globales (…) ».
8. Limites : durée maxi paramétrable (défaut 120 s), annulable, résultats partiels affichés ; jamais de boucle infinie ; message clair si une modification déplace le problème (« corrige les rives mais fait passer les angles à 1,12 »).

---

## 10. Données, API, migrations

- Table `struct_scenarios` (Prisma **et** SQL idempotent en bas de `runStartupMigrations()`) : `id, study_id, name, parent_scenario_id, is_base BOOLEAN, overrides JSONB, results_summary JSONB, diagnosis JSONB, stale BOOLEAN, created_by, created_at, updated_at`. Autosave 2 s comme les autres. `(prisma as any).structScenarios`, colonnes JSON nullables remises à zéro avec `Prisma.DbNull`.
- `struct_library_items` : ajouter `kind = 'section'` et `kind = 'joint_capacity'` (avec `dependsOn`).
- Routes dans `src/routes/structure.ts` (convention du repo `async (req,res,next)`, `{ success, data }`, `AppError`) : `GET/POST /studies/:id/scenarios`, `PUT/DELETE /scenarios/:sid`, `POST /scenarios/:sid/duplicate`. **Le calcul reste côté client (Worker)** ; le serveur ne fait que persister.
- Nouvelle version du modèle SketchUp → variantes marquées « périmées », surcharges reprises par signature.
- Droits : mêmes que l'étude ; écriture bibliothèque (sections, capacités) = admin, technical_manager, engineer.
- Rapport (S6) : si une variante est imprimée, ajouter une section « Variante : paramètres modifiés par rapport au standard » (tableau avant/après, statut de chaque assemblage modifié, mention « non vérifié par un ingénieur » renforcée si assemblage extrapolé/saisi à la main).

---

## 11. Architecture (ajouts)

```
plans/src/structure/core/
  params.ts          ViewboxParams, fusion des niveaux (défaut < bibliothèque < type < SketchUp < variante), origine des champs
  templates/viewboxParametric.ts
  sectionProps.ts    propriétés par formules (contrôle des tables)
  jointRevalidation.ts  dependsOn, statuts valide / recalculé / indicatif / inconnu
  diagnose.ts
  optimize.ts
  scenarios.ts       diff, application, comparaison
plans/src/ui/structure/
  VariantsPanel.tsx  ModuleEditor.tsx  CompareTable.tsx  DiagnosisPanel.tsx  ProposalList.tsx
plans/sketchup/viewbox_prep/   (core.rb + dialogue « Structure… »)
plans/tests/structure/params.test.ts, jointRevalidation.test.ts, diagnose.test.ts, optimize.test.ts, scenarios.test.ts
```

---

## 12. Phases S10 (un ou plusieurs commits par phase, `cd plans && npm test && npm run typecheck` verts, `CLAUDE.md` mis à jour, résumé court + « quoi tester » à l'utilisateur)

- **S10a — Paramètres & gabarit paramétrique** : `params.ts`, `viewboxParametric.ts`, catalogue étendu, indicateurs instantanés. Critère : Viewbox standard → résultats **identiques** à avant ; changer UNP 220 → 160 ou poteaux 3,08 → 5 m produit un modèle cohérent (poids, nœuds, surfaces de vent).
- **S10b — Revalidation des assemblages** : `jointRevalidation.ts`, statuts, saisie manuelle de capacité, plafonnement du verdict.
- **S10c — Variantes** : table + routes + onglet « Variantes », éditeur de module, comparaison, 3D par η.
- **S10d — Diagnostic & optimisation** : `diagnose.ts`, `optimize.ts`, panneau « Pourquoi ? » et propositions « Tester ».
- **S10e — SketchUp** : dialogue Ruby « Structure… », attribut d'instance, manifest `structParams`, détection de section par géométrie, tests Ruby.
- **S10f — Calage** : avec un cas réel modifié (ex. UNP 160 + poteaux 5 m) : documenter les écarts avec ce qu'un ingénieur valide ; ajuster les règles d'extrapolation prudente.

Avant S10a : **pose les questions du §14**, propose le plan détaillé, attends validation (même méthode que S0).

---

## 13. Tests et critères d'acceptation

**Tests (Vitest, valeurs de référence avec leur source) :**
- Variante sans surcharge = base (résultats **strictement** identiques).
- Viewbox standard après S10 = valeurs de calage S8 (inchangées).
- Propriétés de section des tables vs formules géométriques (écart < 2 %).
- Rotation du modèle de 90° ne change pas les taux (variante comprise).
- Équilibre global Σ réactions = Σ charges (1e-6) pour chaque variante.
- Statut des assemblages : modification d'un paramètre `dependsOn` → bon statut ; sinon inchangé.
- Optimiseur : termine toujours ; toute solution proposée passe le **calcul complet** ; ne propose jamais une solution créant un assemblage « Inconnu » sans le signaler ; déterministe (mêmes entrées → mêmes sorties).
- Diagnostic : le texte généré ne contient que des nombres présents dans les données.
- Round-trip diff/application des surcharges ; autosave ; variantes périmées après nouveau modèle.
- Manifest : lecture avec et sans `structParams`.

**Critères d'acceptation :**
1. Amaury modifie dans SketchUp les rives d'un module (UNP 160) et ses poteaux (5 m), exporte, dépose le `.zip` : l'app reprend les paramètres **sans question** et marque le module « modifié ».
2. Dans l'app, il change une taille, clique *Calculer* : résultat en moins de 60 s pour un cas courant (≤ 9 modules).
3. Si ça ne passe pas : l'outil indique l'élément, la vérification, la combinaison, le taux, la cause, et propose **au moins 2 solutions chiffrées** (ou explique clairement qu'il n'y en a pas avec les leviers disponibles).
4. *Tester* une proposition crée une variante, calcule, et la compare à la base.
5. Aucun ✅ si un assemblage est « Inconnu » ou « Extrapolé » ; les capacités non vérifiées sont dites dans l'UI **et** dans le rapport.
6. Plans Viewbox et étude de base strictement inchangés pour une Viewbox standard.

---

## 14. Questions à poser à l'utilisateur au démarrage (S10)

1. Quelles **modifications réelles** veux-tu étudier en priorité (profils concernés, hauteurs de poteaux, nuances) ? Quels profils sont **réellement disponibles** chez le fournisseur ?
2. Une Viewbox à **poteaux de 5 m** : doit-elle rester **empilable** ? Mêmes platines d'angle et mêmes contacts d'empilement ? Y a-t-il un dessin d'exécution ?
3. As-tu des **capacités d'assemblage** (angle, contact, liaisons) pour les variantes — plan, note de calcul, ou un ingénieur qui peut les valider ?
4. Veux-tu fixer un **taux cible** pour l'optimiseur (0,90 par défaut) et une **limite de masse ajoutée** par module ?
5. As-tu déjà modélisé ces variantes dans SketchUp (avec ou sans les barres internes réelles) ? Sinon, on part du formulaire et des attributs seulement.
6. Qui doit pouvoir modifier la bibliothèque (sections, capacités) : admin / technical_manager / engineer comme prévu ?
