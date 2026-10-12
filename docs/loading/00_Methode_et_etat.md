# Méthode & état — générateur de loading liste VIEWBOX

Fiche de tête du projet : à lire en premier. Résume comment le système fonctionne et où on en est.

---

## L'objectif

À partir d'un 3D (.DAE) d'un montage, générer sa loading liste au niveau produit + accessoires,
y compris tout ce qui n'apparaît pas dans le 3D (boulons, joints, câbles, spots, embases, spares…).

## Le principe : trois briques

1. **Perception** (Claude) — lire le 3D : niveaux, nombre de boxes, connexions
   (longueur / largeur / angles), et nombre d'ensembles par référence (comptage **par
   instances**). Repose sur la convention de nommage.
2. **Règles** (toi) — le classeur de règles : accessoires par produit, ratios chantier,
   items d'appréciation, spares. C'est la source de vérité ; Claude lit le fichier, ne
   « retient » rien de tête.
3. **Assemblage** (Claude) — topologie × règles = loading liste, au format de la fiche dédiée.

## Ce qui est acquis / vérifié

- Les niveaux se lisent proprement dans la géométrie (Brandenburg, Onberg : 2 niveaux nets).
- Le comptage **par instances** est validé. Sur **Klokgebouw** : nidaplast `7-636-008` nommé au
  niveau SKU = **10 poses pour 10** livrés (exact). Attention : le glasswall `7-637-020` existe en
  **deux définitions miroir** (`…_Secuglass` et `…_Secuglass_1`), lues 2×16 pour **16** réels →
  les définitions dupliquées/miroir gonflent le compte, il faut les dédoublonner.
- Les accessoires ne sont jamais dans le 3D → 100 % pilotés par les règles.
- **Klokgebouw = premier chantier entièrement calé** (`RVIE/OUT/00055`, 39/39).
- **Mécanisme clé : le spare `+20 % arrondi au supérieur`** sur les quatre rubbers structurels
  (`4-700-065/075/066/071`) réconcilie la base dictée et la quantité livrée.
- **Standalone vs adjacentes** : plaques inter-box (`4-700-039/040`), roof rubber / roof tape
  sont **conditionnels** à une connexion entre boxes.
- **Par unité séparée (pas par box)** : câble de terre `4-730-001` et one-plug mâle `4-730-007`
  = **1 par cluster isolé**. Klokgebouw : 2 clusters → 2. **RECONFIRMÉ 6060/00058 : 2 clusters
  séparés → 2** (peu importe le nombre de box dans chaque cluster). Règle verrouillée.
- **`4-700-073` = 2 par côté de box** (finit la fenêtre 8.8.2 contre le poteau) → 16 (confirmé).
- **Échelles** : un **kit** (`4×4-750-002` + `1×4-750-003`) par **~12 VBX**.

### Acquis 6059/00056 (connecté / couvert, 4 VBX)
- Kit escalier **double porte** `7-199-066` = `1×7-632-022` + `1×7-632-018` + `2×7-632-017`.
- **Toit couvert/connecté** : roof rubber EPDM + roof roller `4-700-033` ne sortent QUE si
  toits jointifs (boxes connectées). Standalone → 0. **Verrouillé.**
- Régime connecté observé (verticaux, petits/grands côtés, carrosseries, sub-blocks) : les
  règles Klok STANDALONE ne transfèrent pas → valeurs brutes à re-caler (violet dans le classeur).

### Acquis 6060/00058 (2 stands × 2 VBX connectés/couverts, clusters séparés) — NOUVEAU
- **Régime 10 mm glasswall (`7-637-009`) VERROUILLÉ** — l'analogue 10 mm du régime 8.8.2 :
  - `4-700-060` plexi profil 10 mm : **~1 par jonction verre-verre** (7 vitres en ligne → 5).
  - `4-700-072` square 10 mm (terminaison vitre/poteau) : **par jonction vitre**, arrondi au
    sup. + porte (Scania 6 → 8, + porte coulissante +2 → 10). Analogue 10 mm du `4-700-073`.
  - `4-700-067` joint petit côté vitre (bas+haut) : 2 petits côtés vitres ×2, +spare → 6.
  - `4-700-074` joint grand côté vitre (bas+haut) : 1 grand côté vitre ×2, +spare → 3.
  - Ne sortent QUE du côté vitré (Scania ici ; VW = 0).
- **Régime connecté — 2ᵉ point de calage** (après 6059) :
  - Boulons `4-710-001` = **~10/jonction** (5 haut + 5 bas). 2 jonctions → 20 + spare = 26.
    Cohérent avec 6059 (~12/jonction) → fourchette **~10-12/jonction** qui se resserre.
  - Plaques inter-box `4-700-039` = **~5 par côté de box** à une jonction (12 pour 2 jonctions).
    Toujours pas parfaitement linéaire vs 6059 (20/3 jonctions) → reste `a_confirmer`.
- **Comptage des pieds en connecté** : une **paire de box connectées = 9 pieds** (rangée du
  milieu partagée), et non 12. Base à utiliser pour toutes les cales `4-740-00x` en connecté.
- **Variante mur** : `7-636-006` (nidaplast/TUV RAL 7024 une face) utilisé en remplacement du
  `7-636-008` (white/white). Même logique de comptage, description à adapter au RAL.
- **Charge lourde (véhicule)** : cales renforcées confirmées (`4-740-003`=15, `-002`=12, `-001`=36).
- **Câble IP44 `4-730-009` = 1 par VBX** (base), + supplément par airco **à l'appréciation**
  (toujours en mettre un peu plus que nécessaire). 6060 : 4 VBX → 4. L'ancienne hypothèse
  « 2/airco » est abandonnée.
- **Roof rubber EPDM** : réf correcte = **`4-700-096`** (le `4-700-045` est acceptable en
  substitut). 1 par cluster/module couvert → 2 clusters = 2. (`4-700-096` reste à ajouter au catalogue.)
- **Silicone** : `4-157-003` = **RAL 7024** (coloré) ; `4-157-004` = **crystal transparent**.
  Le transparent sort en `4-157-004` (le bordereau 00058 l'avait mal étiqueté).
- **Écarts de JUGEMENT** (montage atelier = plus léger, pas des changements de règle) :
  steps supprimés (le monteur SAN gère l'accès), `4-730-008`=2 au lieu de 8, `4-750-002`=3 au
  lieu de 4, harnais `4-750-004`=1 au lieu de 2, `4-700-068`/`4-700-070` omis.

## Points de vigilance

- Un même 3D peut mélanger trois régimes de modélisation (bien nommé / à moitié / brut). La
  **convention de nommage** supprime ce problème.
- **DAE non conformes** : Klokgebouw (`SketchUp_Instance_N`…) et **6060 (sous-pièces + réfs
  tronquées `7-355-14`, profils `7-364-xxx`, gros du modèle en `Body1` anonyme)** ne sont pas
  comptables au SKU. Sur 6060, seules 2 positions de poteaux se résolvent via le graphe → la
  **topologie a été prise de la dictée**, le bordereau servant de vérité chiffrée.
- **AIRCO** (`4-700-027`) : jamais dans le 3D → **à spécifier par toi**. Substitution mur
  `7-636-008` → `4-700-083` **conditionnelle** au fait que le slot soit dessiné en nidaplast
  (accroc 6059 non résolu : +3 nidaplast inexpliqués).

## Bancs d'étalonnage

- **Klokgebouw Eindhoven** (`6055RKLOKVIE` / `00055`) — 2 U-box séparées, mono-niveau, standalone.
  Référence de reproduction (39/39).
- **Onberg** — paire 3D + listes 00049/00050 (glasswall 4.4.2).
- **6059RFRAMVIE** (`00056`) — 4 VBX connectés/couverts. Régime connecté + kit double porte + toit.
- **6060RIAAHVIE** (`00058`) — 2 stands séparés, chacun 2 VBX connectés/couverts (2 clusters).
  Scania (double porte + single door, 7 vitres seamless 10 mm, airco, plafond/spots blancs) +
  VW (porte coulissante, 12 panneaux pleins, spots noirs, pas d'airco). Charge lourde véhicule.
  DAE non conforme → topologie de la dictée. Sert de banc pour : **régime 10 mm** et **2ᵉ point
  connecté**.

## Organisation des conversations

- **Atelier des règles** (1 conversation permanente) : tu décris tes chantiers, Claude en
  extrait les règles et régénère le classeur. Toujours joindre le classeur à jour.
- **Un job = une conversation** : tu déposes le .DAE, Claude pioche dans le knowledge et génère.
- La vérité vit dans les **fichiers du knowledge**, pas dans la mémoire de Claude.

## Contenu du knowledge

- `00_Methode_et_etat.md` (cette fiche)
- `01_Convention_nommage_SketchUp.md`
- `02_Format_sortie_loading_liste.md`
- `VIEWBOX_regles_loading_3.xlsx` (**version courante** — remplace `_2`) : classeur de règles + catalogue.

## Prochaines étapes

1. (Résolu 6060) **Régime 10 mm glasswall calé et validé** (bordereau réel) — les 4 règles
   sont posées et passées bleu.
2. (Résolu 6060) **3 gaps tranchés** : IP44 = 1/VBX + appréciation airco ; roof EPDM =
   `4-700-096` (subst. `4-700-045`) ; silicone transparent = `4-157-004`.
3. Continuer à caler le **régime connecté** (boulons ~10-12/jonction, plaques ~5/côté) sur un
   3ᵉ chantier connecté pour verrouiller les ratios.
4. **Multi-niveaux** : jamais tenté — à caler quand un montage étagé arrive.
5. Ajouter au catalogue les **7 réfs absentes** : `7-355-014`, `7-355-015`, `7-632-001`,
   `7-632-002`, `4-700-096`, `4-720-011`, `4-700-002`.
6. Adopter la convention de nommage à la création des 3D (dédoublonnage des définitions miroir).
