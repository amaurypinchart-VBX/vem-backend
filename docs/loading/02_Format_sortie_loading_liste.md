# Format de sortie — loading liste générée — VIEWBOX

But : que chaque loading liste produite par Claude ressemble à tes vrais bordereaux, soit
directement utilisable, et surtout **auditable** (tu dois pouvoir vérifier d'où sort chaque
quantité avant de l'envoyer en entrepôt).

---

## Le processus, en une phrase

Claude lit le .DAE → en déduit la topologie (boxes, niveaux, connexions, standalone ou non) →
applique le classeur de règles (accessoires par produit/box/jonction/pied/unité, ajouts chantier,
spares) → sort une loading liste au niveau produit + accessoires, avec les items d'appréciation à part.

---

## Livrable

**Un fichier Excel** (`.xlsx`) reprenant la mise en forme de tes bordereaux de picking, **plus**
un court résumé dans la conversation. La loading liste reste **au niveau loading liste** : on
n'y met que les SKU produits et les accessoires du catalogue — jamais les sous-composants du 3D.

### En-tête du fichier
- Nom du chantier / n° d'order (ex. `6055RKLOKVIE` / `RVIE/OUT/00055`)
- Date / shipping date
- Source 3D (nom du fichier .DAE)
- **Topologie détectée** : nb de boxes (VBX), nb de niveaux, résumé des connexions
  (longueur / largeur / angles) **ou mention « standalone »**

### Colonnes du tableau
| Colonne | Contenu |
|---|---|
| Référence | code catalogue `N-NNN-NNN` |
| Désignation | libellé catalogue |
| Quantité | quantité finale (base + spares inclus) |
| Unité | `Units` |
| Catégorie | Structure/façade · Quincaillerie · Joint · Électrique · Consommable · Ajout chantier |
| Détail du calcul | traçabilité : ex. `4 côtés × 2 box = 8, +20% → 10` |

La colonne **Détail du calcul** est obligatoire : c'est elle qui te permet de valider en un
coup d'œil, et de repérer une règle mal appliquée. (Vérifié sur Klokgebouw : reproduit le
bordereau 00055 à 39 lignes sur 39.)

---

## Organisation du tableau

1. **Regroupé par catégorie**, dans cet ordre : Structure/façade → Quincaillerie/liaison →
   Joints/étanchéité → Électrique → Consommables/finition → Ajouts chantier.
2. Un **sous-total par catégorie** (nombre de lignes / poids si dispo).
3. Deux sections nettement séparées à la fin :
   - **« À valider — appréciation »** : ce que Claude ne calcule pas seul (AIRCO, sous-bois,
     charge lourde…). Quantité proposée à 0 ou en fourchette, à toi de trancher.
   - **« À confirmer »** : toute ligne issue d'une règle marquée `a_confirmer` / `hypothese`
     dans le classeur (cellules ambre), pour que tu saches ce qui n'est pas verrouillé.

---

## Comptage des ensembles depuis le 3D

Comptage **par instances** (nombre de poses de chaque définition), pas par occurrence de nom.
**Dédoublonner les définitions miroir** : sur Klokgebouw le glasswall `7-637-020` est lu 2×16
pour 16 réels. Tant que le compteur n'est pas calé sur une vérité terrain, les comptes sont
donnés comme **provisoires** avec l'écart affiché.

---

## Règles de calcul à respecter

- **Spares** : selon la colonne `Spare` du classeur. `+2` = deux unités fixes ; `+20%` =
  **arrondi au supérieur** (Klokgebouw : verticaux 16 → 20, confirmé sur les 4 rubbers
  structurels `4-700-065/075/066/071`). Le détail du calcul montre toujours base + spare séparément.
- **Base de comptage par accessoire** — bien distinguer :
  - `par produit` (ex. 1 rubber square par fenêtre 8.8.2)
  - `par box` (ex. spots 6/box, corners 4/box, verticaux 8/box)
  - `par jonction` (multiplié par le **nb de jonctions détecté**, pas par le nb de boxes)
  - `par pied` (ex. cale 40×40 : 4/pied)
  - `par côté` (ex. rubber square seamless `4-700-073` : 2/côté → 4 côtés/box)
  - `par porte` (ex. 3 steps par porte simple)
  - `par unité séparée` (ex. terre `4-730-001`, one-plug `4-730-007` : 1 par cluster isolé)
  - `par jonction vitre` — **régime 10 mm** (6060/00058) : plexi `4-700-060` ~1/jonction
    verre-verre ; square `4-700-072` par jonction vitre/poteau (arrondi sup. + porte)
  - `par côté vitre` — **régime 10 mm** : `4-700-067` (petits côtés bas+haut),
    `4-700-074` (grands côtés bas+haut) ; ne sortent QUE du côté vitré
  - `par paire de box connectées` — pieds : **9 pieds/double-box** (rangée milieu partagée),
    base des cales `4-740-00x` en régime connecté ; boulons `4-710-001` ~10/jonction (5 h + 5 b)
- **AIRCO** (`4-700-027`) : à spécifier par l'utilisateur (jamais dans le 3D). Quand retenue,
  elle **remplace** 1 mur `7-636-008` par le mur spécial `4-700-083` (substitution) et ajoute
  1 câble IP44 `4-730-009` — bien décrémenter le nombre de nidaplast.
- **Conditionnels d'adjacence** : plaques inter-box (`4-700-039/040`), roof rubber, roof tape
  ne sortent **que** si des box sont connectées. Standalone → 0.
- **Deux régimes de vitrage seamless distincts** : le 8.8.2 (`7-637-020`) utilise `4-700-061`
  (plexi 18 mm) + `4-700-073` (square 8.8.2) ; le 10 mm (`7-637-009`) utilise `4-700-060`
  (plexi 10 mm) + `4-700-072` (square 10 mm) + `4-700-067/074` (petits/grands côtés). Ne pas
  mélanger : sur un même job, seul le régime correspondant au vitrage présent doit sortir.
- **Ajouts chantier** (toolbox, échelles, câbles de rallonge, peinture, laminé…) : `quantité
  pour / par tranche de`, arrondi au supérieur. Base = nb de VBX, ou m² de plancher, ou forfait job.
- **Rien d'inventé** : si une règle manque pour un produit présent dans le 3D, Claude
  **ne devine pas** — il liste le produit et signale « règle manquante » dans À confirmer.
  (Ex. : réfs roof rubber/tape non encore renseignées.)

---

## Contrôle avant usage

La loading liste générée est un **brouillon à valider**, surtout tant que des règles sont ambre
(`a_confirmer`). Claude termine toujours par un court récap : nb de lignes, ce qui est verrouillé
(bleu), ce qui reste à confirmer (ambre) ou à estimer (appréciation). Le contrôle humain reste
la dernière étape.
