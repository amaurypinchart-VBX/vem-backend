# Module « Loading liste » — Plan (phase L0)

> État au 14/10/2026 : **L1 à L5 faites** (Klokgebouw 39/39, bordereau Excel, validation, « Pourquoi ? » + règles apprises, impact, historique, classeur Excel exporté). Prochaine phase : L6 (import d’une liste réelle, réconciliation, bancs). `docs/loading/RVIE_OUT_00067.xlsx` = en-tête de picking Odoo sans lignes produit : il faut l’export avec les lignes (mouvements de stock). Liste des produits Odoo (« Quants », 14/10/2026) intégrée au catalogue : la référence Odoo = la référence Viewbox ; onglet « Odoo » dans le bordereau. 4ᵉ banc OACE (6072ROACEVIE) depuis le picking Odoo réel RVIE/OUT/00066 : 19 / 42 lignes identiques, écarts = questions du 14/10/2026.

État au 12/10/2026. Rédigé après lecture de `CLAUDE.md`, de `plans/reference-reports/03_Prompt_module_loading_liste_VEM.md` et du code cité au § 3 du prompt.

> **Bloquant :** les 4 fichiers métier (`VIEWBOX_regles_loading_3.xlsx`, `00_Methode_et_etat.md`, `01_Convention_nommage_SketchUp.md`, `02_Format_sortie_loading_liste.md`) et les bordereaux 00055 / 00056 / 00058 ne sont **pas** dans le repo (ni `docs/loading/`, ni ailleurs sur la machine). Ce plan s'appuie donc sur le résumé du § 6 du prompt. Il sera relu contre le classeur avant L1.

---

## 1. Ce que j'ai vérifié dans le code (et qui change le prompt)

| Sujet | Ce que dit le prompt | Ce que dit le code | Décision proposée |
|---|---|---|---|
| Extension SketchUp | v1.2.1 | `main.rb` = **1.3.0** | Aucun impact : le module lit seulement `SceneIndex`. |
| Pieds | positions des pieds par VBX | Les pieds ne sont en général **pas** des objets séparés : ils sont dans le composant Viewbox (`7-962-016`, voir l'analyse Qatar). | Pieds = **gabarit** dans le `ModuleFrame` : 4 coins + 2 milieux des grands côtés (même disposition que les vérins de l'Étude structure, 6 par Viewbox). Fusion ≤ 100 mm. Les objets `PIED` présents dans le modèle remplacent le gabarit pour leur Viewbox. |
| Régime de vitrage | 8.8.2 = `7-637-020`, 10 mm = `7-637-009` | Le modèle Qatar utilise **`7-637-010`** « Glasswall Seamless 10mm ». Les catégories `VITRE-SEAMLESS` / `VITRE-CADRE` ne disent pas l'épaisseur. | Le régime vient d'un champ `vitrage` du **catalogue** (par réf.), jamais d'une liste de réfs en dur. Réf. inconnue → question. |
| Jonction | faces parallèles ≤ 50 mm, recouvrement ≥ 80 % | L'Étude structure utilise ≤ 30 mm / ≥ 100 mm (`assemble.ts`), Plans utilise des « unités » à 2,5 m (`installUnits.ts`). | Nouveau calcul propre au module, tolérances 50 mm / 80 % réglables. Réutilise `moduleFootprint` et `ModuleFrame`. Les deux autres notions ne changent pas. |
| Îlot | composante connexe des jonctions | — | Îlot ≠ « unité » des planches (2,5 m). Deux mots différents à l'écran pour ne pas les confondre. |
| Superposition | — | `SceneIndex.levels` | Deux VBX superposées ne font pas une jonction. Toute règle « étage » non calée → « règle manquante ». |
| Box elle-même | — | La Viewbox est un objet avec réf. (`7-962-016`) | Elle sort comme ligne produit, comptée par module (pas par nœud). |
| Comptage produits | par instance + dédoublonnage miroir | Signature existante : `structure/core/signature.ts` `itemTypeKey` (`art:` → `def:` → `name:|fp` → `geo:`) | **Import direct** de `itemTypeKey` / `roundDims` (pas de copie). Miroir = même réf + même boîte monde ± 5 mm. |
| Fichiers du projet | « Enregistré dans les Fichiers du projet » | `saveProjectFilePdf` ne gère que le PDF. | Nouvelle fonction générique `saveProjectFile(buffer, nom, type MIME, catégorie)` à côté ; l'ancienne reste inchangée. Catégorie `loading_liste`. |
| Extraction de packing list existante | « vérifie l'app Picking Opération » | **Rien** dans ce repo (seulement des noms de tâches « Packing list… »). | Lecteur écrit dans le module (§ 4). Si l'app Picking Opération est dans un autre repo, me dire lequel. |
| Excel | exceljs ou équivalent | Aucune lib Excel. `fflate` (zip) est déjà là ; le DXF a déjà son propre écrivain. | **Écrivain + lecteur XLSX maison sur `fflate`**, comme le DXF (pas de dépendance, pas de polyfill Node dans Vite, testable). Chargé à la demande. |
| IA | même garde que l'IA structure | Le build Docker de `plans/` copie seulement `structureAiGuard.ts`. | Garde dans un nouveau `src/services/loadingAiGuard.ts` (pur) + une ligne `COPY` dans le `Dockerfile` (L7). |

## 2. Emplacement

Conforme au § 5.1 du prompt, avec ces précisions :

```
plans/src/loading/
  core/        types.ts, countingBases.ts, spare.ts, conditions.ts, patterns.ts, inputKey.ts
  topology/    junctions.ts, islands.ts, feet.ts, facades.ts, relations.ts, products.ts, topology.ts
  library/     seed.ts (généré), catalogue.ts (généré), merge.ts, store.ts
  engine/      generate.ts, substitutions.ts, kits.ts, explain.ts
  learning/    inferBase.ts, generalize.ts, proposal.ts, conflicts.ts, impact.ts, calibration.ts
  reconcile/   parseRealList.ts, reconcile.ts, classifyGap.ts
  xlsx/        write.ts, read.ts, bordereau.ts, rulesWorkbook.ts
plans/src/ui/loading/  LoadingPage.tsx, TopologyStep.tsx, ProductsStep.tsx, QuestionsStep.tsx,
                       ListStep.tsx, ExportStep.tsx, WhyDialog.tsx, ValidateRule.tsx,
                       TeachPanel3D.tsx, ReconcilePage.tsx, RuleLibrary.tsx
plans/scripts/import-loading-rules.mjs   (classeur → library/seed.ts + catalogue.ts + docs/loading/rapport-import.md)
src/routes/loading.ts            monté sur /api/v1/loading (authMiddleware + requirePlansAccess)
src/services/loadingAi.ts, src/services/loadingAiGuard.ts
plans/tests/loading/  (+ fixtures/ : bancs en JSON)
plans/e2e/run-loading.mjs        (+ routes /loading/* dans le faux serveur server.mjs)
```

- **Onglet** : un seul ajout dans `ui/Workspace.tsx` (`Tab` + bouton « Loading liste » + bloc chargé à la première visite, comme `StructurePage`). Les autres onglets ne changent pas.
- **Réglages** : section « Règles de loading » dans `SettingsPage.tsx` (bibliothèque des règles, comme « Bibliothèque structure »).
- Tout le calcul dans le navigateur. Le serveur stocke et héberge l'IA.

## 3. Tables (Prisma + SQL idempotent en bas de `runStartupMigrations()`)

Accès dans les routes par `(prisma as any).xxx`. JSON nullable remis à zéro avec `Prisma.DbNull`.

```sql
-- Règles enregistrées (fusion avec le seed : même clé ⇒ la base gagne, comme mergeLibrary)
CREATE TABLE IF NOT EXISTS loading_rules (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,          -- ex. 'acc:4-700-065@box:standalone'
  kind          TEXT NOT NULL,                 -- accessoire | ajout_chantier | appreciation | substitution | kit | exclusion
  article       TEXT NOT NULL,                 -- réf. qui sort (index)
  data          JSONB NOT NULL,                -- LoadingRule complète (trigger, qty, per, tranche, when, spare, calibration…)
  confidence    TEXT NOT NULL,                 -- confirme | a_confirmer | hypothese | observe
  source        TEXT NOT NULL,                 -- seed | correction | montre_3d | chantier_reel | atelier_texte
  active        BOOLEAN NOT NULL DEFAULT true,
  version       INTEGER NOT NULL DEFAULT 1,
  updated_by    TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loading_rules_article_idx ON loading_rules(article);

-- Historique append-only (jamais modifié ni supprimé)
CREATE TABLE IF NOT EXISTS loading_rule_history (
  id TEXT PRIMARY KEY, rule_key TEXT NOT NULL, version INTEGER NOT NULL,
  before JSONB, after JSONB,                   -- before NULL = création
  reason TEXT, source TEXT NOT NULL, project_id TEXT, list_id TEXT,
  user_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loading_rule_history_key_idx ON loading_rule_history(rule_key, version);

-- Catalogue ajouté par le circuit de validation (le seed Catalogue_ref reste en lecture seule dans le code)
CREATE TABLE IF NOT EXISTS loading_catalogue_items (
  ref TEXT PRIMARY KEY, designation TEXT NOT NULL, data JSONB NOT NULL,  -- unité, catégorie bordereau, vitrage…
  created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mémoire « Qu'est-ce que c'est ? » : signature de pièce → réf. catalogue
CREATE TABLE IF NOT EXISTS loading_product_matches (
  id TEXT PRIMARY KEY, signature TEXT NOT NULL UNIQUE,   -- clé itemTypeKey (art:/def:/name:|fp/geo:)
  key_definition TEXT, key_fingerprint TEXT, article TEXT NOT NULL,
  triangles INTEGER, user_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une loading liste par version de modèle (comme struct_studies)
CREATE TABLE IF NOT EXISTS loading_lists (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  model_version_id TEXT,                       -- NULL = topologie saisie à la main
  topology JSONB, overrides JSONB,             -- topologie détectée + valeurs « saisi à la main »
  answers JSONB,                               -- questions chantier
  lines JSONB, corrections JSONB,              -- lignes générées + corrections (avec motif : chantier / règle / ne sait pas)
  status TEXT NOT NULL DEFAULT 'brouillon',    -- brouillon | validee
  rules_version TEXT, input_key TEXT,
  order_no TEXT, revision INTEGER NOT NULL DEFAULT 1,
  validated_by TEXT, validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loading_lists_project_idx ON loading_lists(project_id);

-- Prédit vs final, ligne par ligne, à la validation d'une liste ou d'un banc
CREATE TABLE IF NOT EXISTS loading_observations (
  id TEXT PRIMARY KEY, list_id TEXT REFERENCES loading_lists(id) ON DELETE CASCADE, bench_id TEXT,
  article TEXT NOT NULL, rule_keys JSONB, predicted NUMERIC, final NUMERIC,
  kind TEXT NOT NULL,                          -- calage | jugement | inconnu | erreur_3d | erreur_bordereau
  note TEXT, user_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loading_observations_article_idx ON loading_observations(article);

-- Bancs d'étalonnage (chantiers réels)
CREATE TABLE IF NOT EXISTS loading_benches (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,   -- ex. 'Klokgebouw 6055RKLOKVIE'
  project_id TEXT, model_version_id TEXT,
  topology JSONB NOT NULL, answers JSONB NOT NULL,
  real_lines JSONB NOT NULL,                   -- réf. / quantité du bordereau réel
  judgements JSONB,                            -- corrections « seulement ce chantier »
  column_map JSONB, created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Les 3 bancs de départ (Klokgebouw, 6059, 6060) sont aussi dans le code (`tests/loading/fixtures/*.json`) et chargés comme « bancs de base » non supprimables, même mécanique seed + base.

## 4. Choix techniques principaux

- **Topologie** (`Topology`, sérialisable) : chaque nombre garde ses ids (modules, nœuds, jonctions, côtés, pieds). Côtés de box par le `ModuleFrame` (`longAxis`, `front`). Objets de façade rangés sur un côté par leur boîte projetée dans le repère du module (côté le plus proche ≤ 300 mm, même seuil que `studyModel.placeItem`), puis ordonnés le long du côté → séquence vitre / mur / porte / vide → jonctions panneau-panneau, verre-verre, terminaisons vitre-poteau. Topologie saisie à la main = même objet, champs marqués `manual`.
- **Moteur** `generate(topology, products, answers, rules) → LoadingList` pur, déterministe. `inputKey` = hash FNV (déjà dans `core/hash.ts`) de topologie + réponses + version des règles. « Regénérer » montre le diff avant d'écraser et garde les corrections « seulement ce chantier ».
- **Version des règles** = hash des règles actives (seed + base, triées par clé).
- **Excel maison** : `xlsx/write.ts` produit un vrai .xlsx (styles, remplissages doux, bordures, volets figés, lignes d'en-tête répétées, A4 portrait ajusté à la largeur, sous-totaux en formules). `xlsx/read.ts` lit les .xlsx (chaînes partagées, nombres, dates) — sert au script d'import du classeur (Node) **et** à la lecture des bordereaux réels (navigateur). Vérifié par un test qui relit ce qu'il écrit + ouverture LibreOffice en e2e. `.xls` ancien format / CSV : à confirmer (question 2).
- **Script d'import** `import-loading-rules.mjs` : lit le classeur avec le même lecteur, génère `seed.ts` + `catalogue.ts` et `docs/loading/rapport-import.md`. Toute ligne qui ne se traduit pas proprement (quantité en texte, doublon, contradiction) n'est **pas** tranchée : elle sort en `a_confirmer` / `observe` et dans le rapport.
- **Export du classeur** (bibliothèque) : même écrivain, mêmes onglets que `VIEWBOX_regles_loading_N.xlsx`.
- **3D** : `SceneViewer` existant — `setColorOverlay` pour surligner la provenance d'une ligne, `setBarOverlay` pour dessiner jonctions / côtés / pieds cliquables en mode 🎓. Aucune modification de l'isolation ni des matériaux.
- **Autosave 2 s**, reprise des réponses chantier de la liste précédente du projet, « périmé » quand `inputKey` change : copie de la mécanique `struct_studies`.
- **Droits** : lire / corriger une liste « seulement ce chantier » = accès Plans. Écrire une règle, le catalogue, un banc = rôles à confirmer (question 3), contrôlés côté serveur.

## 5. Phases

Une phase à la fois, arrêt et compte rendu à chaque fin. Chaque phase : `cd plans && npm test && npm run typecheck` verts, `tests/real-models.test.ts` et la base S12 inchangés, `npx tsc --noEmit -p .` côté serveur.

| Phase | Contenu | Tests |
|---|---|---|
| **L1** Base de règles | types, lecteur XLSX, script d'import, seed + catalogue générés, rapport d'import, fusion seed + base, version des règles, tables + routes `/loading/rules`, `/loading/catalogue`, `/loading/history`, page Réglages en lecture | lecteur XLSX, import (chaque cas connu du § 5.3 sort dans le rapport), fusion, hash |
| **L2** Topologie | jonctions, îlots, pieds, façades, relations, comptage produits + miroirs + « À identifier » ; étapes 1 Topologie (schéma de dessus, valeurs corrigeables) et 2 Produits (« Qu'est-ce que c'est ? » + mémoriser) | jonctions (côté long / court / décalé), îlots, pieds (12 Klokgebouw, 9 par paire), miroirs, modèles réels de `test-models/` |
| **L3** Moteur | génération, bases de comptage, tranches, spares, conditions, exclusion 8.8.2 / 10 mm, kits, substitution airco, détail du calcul, provenance | bancs dorés : Klokgebouw 39/39, 6059, 6060 (jugements atelier injectés) ; écarts connus marqués « connu » |
| **L4** Onglet et export | questions chantier, tableau groupé, couleurs, lien ligne ↔ 3D, « Ce que cet élément fait sortir », écrivain XLSX bordereau, enregistrement dans les Fichiers du projet, « Liste validée » | écrivain relu par le lecteur, mise en page, e2e « générer → exporter » |
| **L5** Corriger et mémoriser | fenêtre « Pourquoi ? », `inferBase`, écran de validation, contradictions, impact (listes validées + bancs), historique + retour arrière, calage automatique, bibliothèque complète + export classeur | `inferBase`, contradictions, impact ; e2e « corriger → c'est la règle → autre modèle → la règle s'applique » |
| **L6** Chantier réel | import du bordereau (mapping de colonnes mémorisé), rapprochement ✔ ↕ ➕ ➖ + score, traitement des écarts, bancs rejoués à chaque règle | rapprochement, classement des écarts |
| **L7** 3D 🎓 + français | mode Apprendre (sélection jonctions / côtés / pieds), description par les relations, `generalize`, motifs + aperçu des occurrences, `loadingAi.ts` + garde (aucun chiffre de l'IA, 503 sans clé → formulaire manuel) | `generalize`, comptage de motifs, garde IA ; e2e mode 🎓 |

## 6. Réponses d'Amaury (12/10/2026)

1. Fichiers métier déposés dans `docs/loading/` (classeur, fiches 00 / 01 / 02). Les 3 modèles (Klokgebouw, 6059, 6060) sont rangés dans `plans/reference-reports/loading/` (non envoyé sur GitHub). Pas de bordereaux Excel 00055 / 00056 / 00058 : les valeurs réelles viennent des remarques du classeur.
2. Export : se baser sur le classeur Excel. Plus tard l'export ira vers **Odoo** : Amaury fournira un fichier de base donnant un code spécial à ajouter aux lignes (champ `CatalogueItem.odoo` prévu, vide pour l'instant).
3. Règles pour tous les projets : **admin + technical_manager**.
4. Modèles des chantiers de référence : fournis.
5. EPDM : « ça dépend quel EPDM » → question précisée dans `rapport-import.md`. Toolkit : **2 dès 8 VBX**. Les +3 nidaplast de 6059 : un module airco / HVAC vu dans la 3D demande un **mur avec trou airco** (4-700-083). Pieds : à lire dans la 3D, en lien avec l'**Étude structure** — c'est elle qui donne le nombre de sous-bois et leurs emplacements ; la loading liste prend **la quantité de l'étude × 2** pour tous les sous-bois (ex. 25 × 40×40 → 50).
6. Pieds : Viewbox 5900 = **6**, 8,4 m = **8**, M20 = **10**.
7. `7-637-010` = même régime que `7-637-009` (10 mm).
8. N° d'order : dans le projet VEM.
9. Livraison : branche puis push direct sur `main` à la fin de chaque phase.

Conséquences sur le plan :
- **Sous-bois (L3)** : les cales `4-740-001/002/003` ne viennent plus d'un ratio par pied mais des plaques de l'Étude structure de la même version de modèle (`computeCalage` → matériel par dimension 400 / 700 / 1000 → réf. par `CatalogueItem.plaque`), × 2. Sans étude calculée → question « Faire l'étude structure » (pas de supposition). Une plaque de l'étude sans réf. catalogue → « règle manquante ».
- **Pieds (L2)** : gabarit par type de box (`CatalogueItem.pieds`), fusion ≤ 100 mm, recoupés avec les appuis de l'Étude structure quand elle existe.
- Les questions restantes sont en tête de `docs/loading/rapport-import.md`.
