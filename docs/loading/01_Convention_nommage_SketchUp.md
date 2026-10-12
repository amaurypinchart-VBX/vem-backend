# Convention de nommage SketchUp — VIEWBOX

But : structurer chaque modèle 3D pour que Claude puisse lire tout seul, sans deviner, le
nombre de boxes, les niveaux, les connexions entre boxes, et le type et le **nombre** de
chaque élément. Si cette convention est respectée à la création du 3D, la génération de
loading liste devient fiable, y compris sur des montages jamais vus.

Export en **.DAE (COLLADA)** — format qui conserve les noms. Jamais .STL (aucun nom).

---

## 0. Le point le plus important : instanciation propre, un seul niveau

SketchUp stocke un composant **une fois** (définition) puis le **place plusieurs fois**
(instances). Selon la façon de modéliser :
- élément **bien fait** → compté juste (Klokgebouw : nidaplast `7-636-008` = 10 poses pour 10 livrés). ✔
- élément **en double miroir** → surcompté. Klokgebouw : le glasswall `7-637-020` existe en deux
  définitions (`…_Secuglass` et `…_Secuglass_1`), lues **2×16 pour 16 réels**. ✗
- élément **à moitié fait** (1 seul nommé, les autres en sous-pièces) → faux.
- élément **brut** (jamais nommé au niveau produit) → invisible.
- **cas extrême 6060** (`6060_..._scania.dae`) : nommage au niveau **sous-pièce** avec réfs
  **tronquées** (`_7-355-14_STRIP1`, `_7-364-27_UPN220`, `HM20_DIN_934`…) et le gros du modèle
  en `Body1` anonyme → **rien de comptable au SKU**. La traversée du graphe n'a résolu que 2
  positions de poteaux. Résultat : topologie prise de la dictée, bordereau comme vérité. À éviter.

Règle d'or :
1. **Chaque ensemble = une définition nommée par sa référence catalogue, instanciée une fois
   par pose.** 12 standards posés = 12 instances de la définition `7-962-016`.
2. **Une seule définition par référence** : ne pas dupliquer un composant en variante « miroir »
   nommée pareil, sinon le compteur additionne les deux (cas glasswall Klokgebouw).
3. **Ne pas mélanger les niveaux** : soit un mur est un ensemble nommé (SKU), soit il est en
   sous-pièces — mais pas un nommé et douze autres en vrac.
4. Objectif : que le comptage d'instances par référence reproduise **exactement** la loading liste.

---

## 1. Une box = un groupe (ou composant) nommé

```
BOX_N{niveau}_L{index longueur}_W{index largeur}
```
- `N0` = rez, `N1` = 1er étage, `N2`…
- `L` = position le long de la **longueur** ; `W` le long de la **largeur**.

Exemples : `BOX_N0_L2_W1` · `BOX_N1_L2_W1`.

Claude en déduit : nombre de boxes (= nb VBX des règles), niveaux, et **connexions** — deux
boxes qui se suivent en L (même W, même N) = connectées sur la **longueur** ; en W = sur la
**largeur** ; les deux = jonction d'angle. **Boxes non adjacentes = standalone** (cas Klokgebouw :
2 box séparées, installées à 2 endroits) → pas de plaques inter-box ni de roof rubber/tape.

Axe constant d'un projet à l'autre : **X = longueur, Y = largeur, Z = hauteur.**

---

## 2. Les éléments de façade / ensembles : nommés par leur référence catalogue

Le **groupe parent** de l'ensemble porte la **référence catalogue** du produit assemblé.

```
{référence}            ex.  7-637-020   (GLASSWALL SEAMLESS 8.8.2)
{référence}_{n}        ex.  7-962-016_3 (3e exemplaire — PAS un miroir dupliqué)
```

- Référence en **tête de nom**, dernier segment sur **3 chiffres** : `7-220-005`, pas `7-220-05`.
- Nommer au niveau **assemblé** (le standard complet, le glasswall complet, le nidaplast complet,
  la porte), pas seulement les sous-pièces.
- Un objet par pose : **ne jamais fusionner ni exploser**, et **ne pas dupliquer la définition**
  en variante miroir portant le même nom (voir §0).

Concerne : standards (7-962-xxx), nidaplast/stadur (7-636-xxx), glasswalls (7-637-xxx),
portes simples (7-199-xxx), portes vitrées (7-625-xxx), plateformes/escaliers (7-632-xxx),
poteaux (7-355-xxx), planchers (7-207-xxx), clim (4-700-027), cadres textile (4-700-08x).

---

## 3. Ce que Claude déduit seul (à ne PAS nommer)

- **Position d'un pied** (angle / bord / milieu) : déduite de la place de la box dans la grille.
- **Nombre de jonctions** entre boxes et **connexions** (longueur/largeur/angle) : déduits des voisinages L/W.
- **Accessoires invisibles** (base plates, joints, rubbers, câbles, spots, steps, sub-blocks,
  cales bois) : jamais dans le 3D — ils viennent des règles.

Explicitation optionnelle d'un pied : `PIED_{box}_{angle|bord|milieu}`.

---

## 4. Origine, axes, unités

- Origine sur un **coin fixe** du montage, le même d'un projet à l'autre.
- **Z vers le haut** ; les niveaux se séparent nettement en Z (sol ≈ 0, étage ≈ 3 m).
- Unités cohérentes (Klokgebouw est exporté en pouces — accepté tant que c'est constant).

---

## 5. Checklist avant export

- [ ] Chaque box = groupe `BOX_N…_L…_W…`
- [ ] Chaque ensemble = **une définition nommée par sa réf**, dernier segment sur 3 chiffres
- [ ] **Une instance par pose** ; **une seule définition par réf** (pas de miroir dupliqué)
- [ ] Aucun mélange SKU / sous-pièces ; rien de fusionné
- [ ] Axes X=longueur, Y=largeur, Z=hauteur ; origine sur le coin fixe habituel
- [ ] Export en **.DAE**

---

## 6. Ce que ça donne côté lecture

Modèle conforme → Claude sort d'abord la topologie (« N niveaux, N boxes en L×W, connexions
longueur/largeur/angles, ou standalone ») **et** le comptage d'ensembles par référence (miroirs
dédoublonnés), te les présente pour validation, puis applique les règles d'accessoires.
