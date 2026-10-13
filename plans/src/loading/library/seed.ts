// Généré par scripts/import-loading-rules.mjs depuis VIEWBOX_regles_loading_3.xlsx (+ library/decisions.ts) — règles, observations et décisions.
// Ne pas modifier à la main : corriger le classeur ou decisions.ts, puis relancer l'import.
import type { LoadingRule, SeedObservation } from '../core/types';
import type { DecisionLog } from './decisions';

export const SEED_META = {
  "classeur": "VIEWBOX_regles_loading_3.xlsx",
  "sheets": [
    "LisezMoi",
    "Regles_accessoires",
    "Ajouts_chantier",
    "Appreciation",
    "Catalogue_ref"
  ],
  "rules": 91,
  "activeRules": 67,
  "observations": 8,
  "catalogue": 218
} as const;

export const SEED_RULES: LoadingRule[] = [
  {
    "key": "acc:4-700-075@4.4.2/produit",
    "kind": "accessoire",
    "trigger": {
      "articles": [
        "7-637-008"
      ],
      "vitrage": "4.4.2"
    },
    "article": "4-700-075",
    "articleName": "Window/Wall Rubber BIG 5700mm",
    "qty": 1,
    "per": "produit",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [],
    "remark": "Déduit : 24 glasswalls ↔ 24 joints 5700",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 2
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "group": "additionne:4-700-075"
  },
  {
    "key": "acc:4-157-003@4.4.2/produit",
    "kind": "accessoire",
    "trigger": {
      "articles": [
        "7-637-008"
      ],
      "vitrage": "4.4.2"
    },
    "article": "4-157-003",
    "articleName": "Silicon AM85-1 RAL7024",
    "qty": 1,
    "per": "produit",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [],
    "remark": "Déduit : 24 ↔ 24",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 3
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "group": "additionne:4-157-003"
  },
  {
    "key": "acc:4-157-004@4.4.2/produit",
    "kind": "accessoire",
    "trigger": {
      "articles": [
        "7-637-008"
      ],
      "vitrage": "4.4.2"
    },
    "article": "4-157-004",
    "articleName": "Silicon Crystal",
    "qty": 1,
    "per": "produit",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "CONFIRME 6060 : 4-157-004 = crystal transparent (distinct du 7024=4-157-003)."
      }
    ],
    "remark": "Déduit : 24 ↔ 24 || CONFIRME 6060 : 4-157-004 = crystal transparent (distinct du 7024=4-157-003).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 4
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "group": "additionne:4-157-004"
  },
  {
    "key": "acc:4-700-083@4-700-027/airco",
    "kind": "accessoire",
    "trigger": {
      "articles": [
        "4-700-027"
      ]
    },
    "article": "4-700-083",
    "articleName": "NIDAPLAST WALL + trou airco",
    "qty": 1,
    "per": "airco",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "SUBSTITUTION CONDITIONNELLE (confirmee par Amaury) : decrementer 1 nidaplast 7-636-008 par airco SEULEMENT si le slot airco est dessine en nidaplast dans le 3D (compte dans le total). Sinon (slot vide) = ajout. Klok : slots dessines en nidaplast -> decrement. !! ACCROC 6059/00056 : Amaury indique que les 3 slots airco ETAIENT dessines en nidaplast (dans les 11). La regle predit donc 11-3=8 nidaplast livres, mais le bordereau montre 11 nidaplast + 3 airco. Ecart de +3 nidaplast NON EXPLIQUE : le generateur suivant la regle sortirait 8, le reel = 11. A RECONCILIER (sur-livraison/spare ? airco compte a part sans decrement effectif ? erreur bordereau ?)."
      }
    ],
    "remark": "SUBSTITUTION CONDITIONNELLE (confirmee par Amaury) : decrementer 1 nidaplast 7-636-008 par airco SEULEMENT si le slot airco est dessine en nidaplast dans le 3D (compte dans le total). Sinon (slot vide) = ajout. Klok : slots dessines en nidaplast -> decrement. !! ACCROC 6059/00056 : Amaury indique que les 3 slots airco ETAIENT dessines en nidaplast (dans les 11). La regle predit donc 11-3=8 nidaplast livres, mais le bordereau montre 11 nidaplast + 3 airco. Ecart de +3 nidaplast NON EXPLIQUE : le generateur suivant la regle sortirait 8, le reel = 11. A RECONCILIER (sur-livraison/spare ? airco compte a part sans decrement effectif ? erreur bordereau ?).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 5
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "sub:4-700-083@airco[nidaplast]"
  },
  {
    "key": "acc:4-730-009@4-700-027/box",
    "kind": "accessoire",
    "trigger": {
      "articles": [
        "4-700-027"
      ]
    },
    "article": "4-730-009",
    "articleName": "Câble SHUKO Multiprise IP44",
    "qty": 1,
    "per": "box",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "REVISE 6060/00058 (Amaury) : base = 1 IP44 PAR VBX (et non 2/airco). 6060 : 4 VBX -> 4. Supplement par airco A L'APPRECIATION, toujours arrondir vers le haut. 6059 : 6 pour 4 VBX + 3 airco = base 4 + ~2 en rab (coherent)."
      }
    ],
    "remark": "REVISE 6060/00058 (Amaury) : base = 1 IP44 PAR VBX (et non 2/airco). 6060 : 4 VBX -> 4. Supplement par airco A L'APPRECIATION, toujours arrondir vers le haut. 6059 : 6 pour 4 VBX + 3 airco = base 4 + ~2 en rab (coherent).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 6
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-730-009@box"
  },
  {
    "key": "acc:4-700-003@box",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-003",
    "articleName": "Viewbox Ceiling Black tensed Fabric",
    "qty": 1,
    "per": "box",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "1 par box + 1 à 2 spares. Klok 00055 : 2 box + 1 spare = 3"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 1/VBX × 4 + 1 spare = 5 ✓ → spare fixé à +1."
      }
    ],
    "remark": "1 par box + 1 à 2 spares. Klok 00055 : 2 box + 1 spare = 3 | 6059/00056 : 1/VBX × 4 + 1 spare = 5 ✓ → spare fixé à +1.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 7
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "fixe",
      "valeur": 1
    }
  },
  {
    "key": "acc:4-700-035@box[angle]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-035",
    "articleName": "WOOD Base Plate Corner M16 325x325",
    "qty": 4,
    "per": "box",
    "unit": "pce",
    "when": {
      "position": "angle"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 4 coins/box × 2 = 8. Bouche les pieds de levage aux coins"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "RECONFIRMÉ 6059/00056 : 4/VBX × 4 = 16 ✓ (chaque bay garde ses 4 pieds de levage même adjacente)."
      }
    ],
    "remark": "Klok 00055 : 4 coins/box × 2 = 8. Bouche les pieds de levage aux coins | RECONFIRMÉ 6059/00056 : 4/VBX × 4 = 16 ✓ (chaque bay garde ses 4 pieds de levage même adjacente).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 8
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-700-036@box[milieu]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-036",
    "articleName": "WOOD Base Plate Middle M16 320x325",
    "qty": 2,
    "per": "box",
    "unit": "pce",
    "when": {
      "position": "milieu"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 2 milieux/box × 2 = 4"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "RECONFIRMÉ 6059/00056 : 2/VBX × 4 = 8 ✓."
      }
    ],
    "remark": "Klok 00055 : 2 milieux/box × 2 = 4 | RECONFIRMÉ 6059/00056 : 2/VBX × 4 = 8 ✓.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 9
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-730-012@box",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-730-012",
    "articleName": "SPOT BLACK LED 24W (Pologne 2026)",
    "qty": 6,
    "per": "box",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 6/box × 2 = 12. Light : black 4-730-012 (neuf) / ancien 4-700-016 ; variante white existe"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "RECONFIRMÉ 6059/00056 : 6/VBX × 4 = 24 ✓ (le \"box\" = un standard)."
      }
    ],
    "remark": "Klok 00055 : 6/box × 2 = 12. Light : black 4-730-012 (neuf) / ancien 4-700-016 ; variante white existe | RECONFIRMÉ 6059/00056 : 6/VBX × 4 = 24 ✓ (le \"box\" = un standard).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 10
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "kit:7-632-017@7-199-067/produit",
    "kind": "kit",
    "trigger": {
      "articles": [
        "7-199-067"
      ]
    },
    "article": "7-632-017",
    "articleName": "PLATFORM STEP 1100x500x150",
    "qty": 3,
    "per": "produit",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 3 steps/porte simple (2 bas +1 haut) × 2 = 6. Ajouté MEME si absent du 3D. Porte double : à préciser"
      }
    ],
    "remark": "Klok 00055 : 3 steps/porte simple (2 bas +1 haut) × 2 = 6. Ajouté MEME si absent du 3D. Porte double : à préciser",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 11
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "kit:7-632-017@porte_simple"
  },
  {
    "key": "acc:4-700-065@box[standalone]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-065",
    "articleName": "Window/Wall Rubber BIG 2550mm",
    "qty": 8,
    "per": "box",
    "unit": "pce",
    "when": {
      "regime": "standalone"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 4 côtés remplis → 8/box × 2 = 16, +20% = 20. Verticaux des U"
      }
    ],
    "remark": "Klok 00055 : 4 côtés remplis → 8/box × 2 = 16, +20% = 20. Verticaux des U",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 12
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 20
    }
  },
  {
    "key": "acc:4-700-075@box[standalone]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-075",
    "articleName": "Window/Wall Rubber BIG 5700mm",
    "qty": 4,
    "per": "box",
    "unit": "pce",
    "when": {
      "regime": "standalone"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 2/grand côté (h+b) → 4/box × 2 = 8, +20% = 10. Murs ET fenêtres 8.8.2. NB même réf que joint glasswall 4.4.2 (Brandenburg, autre contexte)"
      }
    ],
    "remark": "Klok 00055 : 2/grand côté (h+b) → 4/box × 2 = 8, +20% = 10. Murs ET fenêtres 8.8.2. NB même réf que joint glasswall 4.4.2 (Brandenburg, autre contexte)",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 13
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 20
    },
    "group": "additionne:4-700-075"
  },
  {
    "key": "acc:4-700-066@box[standalone]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-066",
    "articleName": "Window/Wall Rubber BIG 2300mm",
    "qty": 4,
    "per": "box",
    "unit": "pce",
    "when": {
      "regime": "standalone"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 2 petits côtés → 4/box × 2 = 8, +20% = 10"
      }
    ],
    "remark": "Klok 00055 : 2 petits côtés → 4/box × 2 = 8, +20% = 10",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 14
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 20
    }
  },
  {
    "key": "acc:4-700-071@jonction_panneau[standalone]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-071",
    "articleName": "Window/Wall Rubber Carrosserie 2530mm",
    "qty": 1,
    "per": "jonction_panneau",
    "unit": "pce",
    "when": {
      "regime": "standalone"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 4 jonctions/grand côté → 8, +20% = 10"
      }
    ],
    "remark": "Klok 00055 : 4 jonctions/grand côté → 8, +20% = 10",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 15
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 20
    }
  },
  {
    "key": "acc:4-700-070@jonction_panneau[standalone]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-070",
    "articleName": "Window/Wall Rubber Carrosserie 10cm",
    "qty": 2,
    "per": "jonction_panneau",
    "unit": "pce",
    "when": {
      "regime": "standalone"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 2/jonction × 4 × 2 box = 16 (pas de +20%)"
      }
    ],
    "remark": "Klok 00055 : 2/jonction × 4 × 2 box = 16 (pas de +20%)",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 16
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-700-073@cote[standalone]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-073",
    "articleName": "Window/Wall Rubber Square 25x30x2550 seamless 8.8.2",
    "qty": 2,
    "per": "cote",
    "unit": "pce",
    "when": {
      "regime": "standalone"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "2 par côté de box (finit la fenêtre contre le poteau) → 4 côtés = 8/box × 2 = 16. Klok 00055 : 16 ✓"
      }
    ],
    "remark": "2 par côté de box (finit la fenêtre contre le poteau) → 4 côtés = 8/box × 2 = 16. Klok 00055 : 16 ✓",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 17
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-700-064@panneau[standalone]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-064",
    "articleName": "Sub Block for windows and wall 45x100",
    "qty": 2,
    "per": "panneau",
    "unit": "pce",
    "when": {
      "regime": "standalone"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 2/panneau (4 par porte double) ; 14 panneaux/box → 28 × 2 = 56, marge → 70. ~2 tous les 1 m"
      }
    ],
    "remark": "Klok 00055 : 2/panneau (4 par porte double) ; 14 panneaux/box → 28 × 2 = 56, marge → 70. ~2 tous les 1 m",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 18
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 25
    }
  },
  {
    "key": "acc:4-700-068@box",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-068",
    "articleName": "Window/Wall Rubber 10cm",
    "qty": 20,
    "per": "box",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : ~20/box × 2 = 40. Consommable de pose"
      }
    ],
    "remark": "Klok 00055 : ~20/box × 2 = 40. Consommable de pose",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 19
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-700-061@8.8.2/box[standalone]",
    "kind": "accessoire",
    "trigger": {
      "vitrage": "8.8.2"
    },
    "article": "4-700-061",
    "articleName": "Plexi profil 18mmx2530mm",
    "qty": 6,
    "per": "box",
    "unit": "pce",
    "when": {
      "regime": "standalone"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 4 (grand côté) + 2 (petits) = 6/box × 2 = 12. Entre fenêtres 8.8.2 adjacentes"
      }
    ],
    "remark": "Klok 00055 : 4 (grand côté) + 2 (petits) = 6/box × 2 = 12. Entre fenêtres 8.8.2 adjacentes",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 20
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-157-003@box",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-157-003",
    "articleName": "Silicon DL AM85-1 RAL7024 (profils)",
    "qty": 3,
    "per": "box",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : ~3/box × 2 = 6 cartouches"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "RECONFIRMÉ 6059/00056 : 3/VBX × 4 = 12 ✓."
      }
    ],
    "remark": "Klok 00055 : ~3/box × 2 = 6 cartouches | RECONFIRMÉ 6059/00056 : 3/VBX × 4 = 12 ✓.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 21
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "group": "additionne:4-157-003"
  },
  {
    "key": "acc:4-157-004@box",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-157-004",
    "articleName": "Silicon DL Crystal (vitrages)",
    "qty": 2,
    "per": "box",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : ~2/box × 2 = 4"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 6 pour 4 VBX (≈1,5/VBX, ne scale pas net) → a_confirmer."
      },
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "CONFIRME 6060 : 4-157-004 = crystal transparent (distinct du 7024=4-157-003)."
      }
    ],
    "remark": "Klok 00055 : ~2/box × 2 = 4 | 6059/00056 : 6 pour 4 VBX (≈1,5/VBX, ne scale pas net) → a_confirmer. || CONFIRME 6060 : 4-157-004 = crystal transparent (distinct du 7024=4-157-003).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 22
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "group": "additionne:4-157-004"
  },
  {
    "key": "acc:4-730-007@ilot",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-730-007",
    "articleName": "Cable ONE PLUG MALE 3G1.5 /10M",
    "qty": 1,
    "per": "ilot",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 1/unité séparée × 2 = 2. Préciser 10 m"
      },
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "RECONFIRME 6060/00058 : 2 clusters -> 2."
      }
    ],
    "remark": "Klok 00055 : 1/unité séparée × 2 = 2. Préciser 10 m || RECONFIRME 6060/00058 : 2 clusters -> 2.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 23
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-730-001@ilot",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-730-001",
    "articleName": "GROUND CABLE jaune/vert + socket",
    "qty": 1,
    "per": "ilot",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 1/unité séparée × 2 = 2. Un seul câble même si 10 box groupées"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "RECONFIRMÉ 6059/00056 : montage CONNECTÉ = 1 seul cluster → 1 ✓."
      },
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "RECONFIRME 6060/00058 : 2 CLUSTERS separes -> 2 (1/cluster, peu importe le nb de box dedans). Regle unite_separee verrouillee."
      }
    ],
    "remark": "Klok 00055 : 1/unité séparée × 2 = 2. Un seul câble même si 10 box groupées | RECONFIRMÉ 6059/00056 : montage CONNECTÉ = 1 seul cluster → 1 ✓. || RECONFIRME 6060/00058 : 2 CLUSTERS separes -> 2 (1/cluster, peu importe le nb de box dedans). Regle unite_separee verrouillee.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 24
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-730-008@box",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-730-008",
    "articleName": "Cable SHUKO SQUARE Multiprise",
    "qty": 2,
    "per": "box",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : ≥2/box × 2 = 4 (postes ordinateur)"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "RECONFIRMÉ 6059/00056 : 2/VBX × 4 = 8 ✓."
      }
    ],
    "remark": "Klok 00055 : ≥2/box × 2 = 4 (postes ordinateur) | RECONFIRMÉ 6059/00056 : 2/VBX × 4 = 8 ✓.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 25
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-740-003@box[angle]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-740-003",
    "articleName": "WOOD SUBPLATE LEVELING 1000x1000",
    "qty": 4,
    "per": "box",
    "unit": "pce",
    "when": {
      "position": "angle"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 4 pieds coin/box → 8, ×2 (hauteur) = 16. Adapter si charge (voiture)"
      },
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "6059/00056 : 2/pied × 10 = 20 (ici sous TOUS les pieds). Klok = 2/pied de coin seulement. La composition de la pile de cales dépend de la CHARGE (jugement)."
      }
    ],
    "remark": "Klok 00055 : 4 pieds coin/box → 8, ×2 (hauteur) = 16. Adapter si charge (voiture) | 6059/00056 : 2/pied × 10 = 20 (ici sous TOUS les pieds). Klok = 2/pied de coin seulement. La composition de la pile de cales dépend de la CHARGE (jugement).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 26
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-740-003@sous_bois_etude"
  },
  {
    "key": "acc:4-740-002@box[milieu]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-740-002",
    "articleName": "WOOD SUBPLATE LEVELING 700x700",
    "qty": 2,
    "per": "box",
    "unit": "pce",
    "when": {
      "position": "milieu"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : milieux → 4, ×2 = 8"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 1/pied × 10 = 10 (ici sous tous les pieds). Composition selon charge."
      }
    ],
    "remark": "Klok 00055 : milieux → 4, ×2 = 8 | 6059/00056 : 1/pied × 10 = 10 (ici sous tous les pieds). Composition selon charge.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 27
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-740-002@sous_bois_etude"
  },
  {
    "key": "acc:4-740-001@pied",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-740-001",
    "articleName": "WOOD SUBPLATE LEVELING 400x400",
    "qty": 4,
    "per": "pied",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 4/pied × 12 pieds = 48 (réglage hauteur)"
      }
    ],
    "remark": "Klok 00055 : 4/pied × 12 pieds = 48 (réglage hauteur)",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 28
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-740-001@sous_bois_etude"
  },
  {
    "key": "acc:4-700-039@jonction_box[connecte]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-039",
    "articleName": "In-between plate large",
    "qty": 1,
    "per": "jonction_box",
    "unit": "pce",
    "when": {
      "regime": "connecte"
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "2 box l’une contre l’autre. Klok = standalone → 0. Réf à confirmer"
      },
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "2e POINT 6060/00058 : 12 pour 2 jonctions (5 par cote de box +marge). Fourchette ~10-12/jonction. Reste a_confirmer."
      }
    ],
    "remark": "2 box l’une contre l’autre. Klok = standalone → 0. Réf à confirmer || 2e POINT 6060/00058 : 12 pour 2 jonctions (5 par cote de box +marge). Fourchette ~10-12/jonction. Reste a_confirmer.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 29
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-700-039@jonction_grand_cote"
  },
  {
    "key": "acc:4-700-040@bord",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-040",
    "articleName": "In-between plate simple",
    "qty": 1,
    "per": "bord",
    "unit": "pce",
    "when": {
      "regime": "connecte"
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Box vers terrasse/rien. Klok → 0. Réf à confirmer"
      }
    ],
    "remark": "Box vers terrasse/rien. Klok → 0. Réf à confirmer",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 30
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 30
    }
  },
  {
    "key": "kit:7-632-022@7-199-066/produit",
    "kind": "kit",
    "trigger": {
      "articles": [
        "7-199-066"
      ]
    },
    "article": "7-632-022",
    "articleName": "PLATFORM STEP 2200x1000x150 |7024|",
    "qty": 1,
    "per": "produit",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : kit escalier DOUBLE porte = 1×2200x1000 + 1×2200x500 + 2×1100x500. Ajouté même si absent du 3D."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : kit escalier DOUBLE porte = 1×2200x1000 + 1×2200x500 + 2×1100x500. Ajouté même si absent du 3D.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 31
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "kit:7-632-022@porte_double"
  },
  {
    "key": "kit:7-632-018@7-199-066/produit",
    "kind": "kit",
    "trigger": {
      "articles": [
        "7-199-066"
      ]
    },
    "article": "7-632-018",
    "articleName": "PLATFORM STEP 2200x500x150 DARK GREY",
    "qty": 1,
    "per": "produit",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : voir kit double porte."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : voir kit double porte.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 32
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "kit:7-632-018@porte_double"
  },
  {
    "key": "kit:7-632-017@7-199-066/produit",
    "kind": "kit",
    "trigger": {
      "articles": [
        "7-199-066"
      ]
    },
    "article": "7-632-017",
    "articleName": "PLATFORM STEP 1100x500x150 DARK GREY",
    "qty": 2,
    "per": "produit",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : 2 marches basses du kit double porte. (Porte SIMPLE = 3×7-632-017, voir plus haut.)"
      }
    ],
    "remark": "NOUVEAU 6059/00056 : 2 marches basses du kit double porte. (Porte SIMPLE = 3×7-632-017, voir plus haut.)",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 33
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "kit:7-632-017@porte_double"
  },
  {
    "key": "acc:4-700-096@module_toit[connecte,suspendu]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-096",
    "articleName": "Roof Rubber EPDM 57x32x5900 |VBX|",
    "qty": 1,
    "per": "module_toit",
    "unit": "pce",
    "when": {
      "regime": "connecte",
      "appui": "suspendu"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "NOUVEAU 6059/00056 : 1 EPDM par module de toit 7-632-002 (= 1/VBX ici) → 4. N’apparaît QUE si box couvertes/connectées. Klok standalone = 0. Réf à AJOUTER au catalogue."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : 1 EPDM par module de toit 7-632-002 (= 1/VBX ici) → 4. N’apparaît QUE si box couvertes/connectées. Klok standalone = 0. Réf à AJOUTER au catalogue. | VERROUILLE (Amaury) : les rubbers/joints de TOIT ne sortent QUE si les boxes sont connectees (toits jointifs). Standalone -> 0.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 34
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-700-096@jonction_toit_grand_cote"
  },
  {
    "key": "acc:4-720-011@poteau",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-720-011",
    "articleName": "Viewbox Poles Rubber FLAT adhésive 20x4mm /M",
    "qty": 2.53,
    "per": "poteau",
    "unit": "m",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : ~1 bande de 2,53 m par poteau. Poteaux = 7-355-014 + 7-355-015 (8 → 20 m) ✓. Réf à AJOUTER au catalogue."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : ~1 bande de 2,53 m par poteau. Poteaux = 7-355-014 + 7-355-015 (8 → 20 m) ✓. Réf à AJOUTER au catalogue.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 35
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-720-011@poteau_connecte"
  },
  {
    "key": "acc:4-700-039@box[connecte]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-039",
    "articleName": "In Between Plate Large 120x1140x18",
    "qty": 5,
    "per": "box",
    "unit": "pce",
    "when": {
      "regime": "connecte"
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : observé 20 pour 4 VBX / 3 jonctions (≈5/VBX ou ≈6,7/jonction — pas net). CONFIRME que la réf sort bien quand box connectées. Ratio à re-caler sur 2e chantier connecté."
      },
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "2e POINT 6060/00058 : 12 pour 2 jonctions (5 par cote de box +marge). Fourchette ~10-12/jonction. Reste a_confirmer."
      }
    ],
    "remark": "6059/00056 : observé 20 pour 4 VBX / 3 jonctions (≈5/VBX ou ≈6,7/jonction — pas net). CONFIRME que la réf sort bien quand box connectées. Ratio à re-caler sur 2e chantier connecté. || 2e POINT 6060/00058 : 12 pour 2 jonctions (5 par cote de box +marge). Fourchette ~10-12/jonction. Reste a_confirmer.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 36
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-700-039@jonction_grand_cote"
  },
  {
    "key": "acc:4-710-001@box",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-710-001",
    "articleName": "Connecting BOLT M16 HEX M16x110",
    "qty": null,
    "per": "box",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : observé 36 pour 4 VBX (≈9/VBX) ou ≈12/jonction. Boulonnage des standards. À re-caler."
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "2e POINT 6060/00058 : 10/jonction (5 haut + 5 bas) ; 2 jonctions x10=20, +spare -> 26. Coherent ~10-12/jonction (6059=~12)."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : observé 36 pour 4 VBX (≈9/VBX) ou ≈12/jonction. Boulonnage des standards. À re-caler. || 2e POINT 6060/00058 : 10/jonction (5 haut + 5 bas) ; 2 jonctions x10=20, +spare -> 26. Coherent ~10-12/jonction (6059=~12).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 37
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "qtyText": "~10/jonction",
    "supersededBy": "acc:4-710-001@jonction_grand_cote"
  },
  {
    "key": "acc:4-700-060@10mm/jonction_verre",
    "kind": "accessoire",
    "trigger": {
      "vitrage": "10mm"
    },
    "article": "4-700-060",
    "articleName": "Plexi profil 10mmx2530mm",
    "qty": 1,
    "per": "jonction_verre",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "VALIDE 6060/00058 (bordereau reel) 6060/00058 : ~1 plexi 10mm par jonction verre-verre. Scania 7 vitres en ligne -> 5 plexi. Analogue 10mm du 4-700-061 (18mm/8.8.2)."
      }
    ],
    "remark": "VALIDE 6060/00058 (bordereau reel) 6060/00058 : ~1 plexi 10mm par jonction verre-verre. Scania 7 vitres en ligne -> 5 plexi. Analogue 10mm du 4-700-061 (18mm/8.8.2).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 46
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "acc:4-700-072@10mm/terminaison_vitre",
    "kind": "accessoire",
    "trigger": {
      "vitrage": "10mm"
    },
    "article": "4-700-072",
    "articleName": "Window/Wall Rubber Square 25x40x2550 seamless 10mm",
    "qty": 1,
    "per": "terminaison_vitre",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "VALIDE 6060/00058 (bordereau reel) 6060/00058 : square 10mm = terminaison de vitre contre poteau. Scania 6 jonctions -> arrondi 8 ; + porte coulissante = +2 -> 10. Analogue 10mm du 4-700-073 (8.8.2)."
      }
    ],
    "remark": "VALIDE 6060/00058 (bordereau reel) 6060/00058 : square 10mm = terminaison de vitre contre poteau. Scania 6 jonctions -> arrondi 8 ; + porte coulissante = +2 -> 10. Analogue 10mm du 4-700-073 (8.8.2).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 47
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 20
    },
    "group": "square-10mm"
  },
  {
    "key": "acc:4-700-067@10mm/cote_vitre_court",
    "kind": "accessoire",
    "trigger": {
      "vitrage": "10mm"
    },
    "article": "4-700-067",
    "articleName": "Window/Wall Rubber Little 2300mm",
    "qty": 2,
    "per": "cote_vitre_court",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "VALIDE 6060/00058 (bordereau reel) 6060/00058 : joint bas+haut petits cotes vitres. Scania : 2 petits cotes vitres x2 (bas+haut)=4, +spare -> 6. Ne sort QUE cote vitre (10mm)."
      }
    ],
    "remark": "VALIDE 6060/00058 (bordereau reel) 6060/00058 : joint bas+haut petits cotes vitres. Scania : 2 petits cotes vitres x2 (bas+haut)=4, +spare -> 6. Ne sort QUE cote vitre (10mm).",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 48
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 50
    }
  },
  {
    "key": "acc:4-700-074@10mm/cote_vitre_long",
    "kind": "accessoire",
    "trigger": {
      "vitrage": "10mm"
    },
    "article": "4-700-074",
    "articleName": "Window/Wall Rubber Little 5700mm",
    "qty": 2,
    "per": "cote_vitre_long",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "VALIDE 6060/00058 (bordereau reel) 6060/00058 : joint bas+haut grands cotes vitres. Scania : 1 grand cote vitre x2 (bas+haut)=2, +spare -> 3."
      }
    ],
    "remark": "VALIDE 6060/00058 (bordereau reel) 6060/00058 : joint bas+haut grands cotes vitres. Scania : 1 grand cote vitre x2 (bas+haut)=2, +spare -> 3.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 49
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "spare": {
      "type": "pourcent",
      "valeur": 50
    }
  },
  {
    "key": "acc:4-700-096@ilot_couvert[connecte,suspendu]",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-096",
    "articleName": "Roof Rubber EPDM 5900 |VBX| (subst. 4-700-045 OK)",
    "qty": 1,
    "per": "ilot_couvert",
    "unit": "pce",
    "when": {
      "regime": "connecte",
      "appui": "suspendu"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "RESOLU 6060/00058 (Amaury) : ref correcte = 4-700-096 ; le 4-700-045 est acceptable en substitut. 1 EPDM par CLUSTER/module couvert -> 2 clusters = 2. !! 4-700-096 encore ABSENT du catalogue : a ajouter."
      }
    ],
    "remark": "RESOLU 6060/00058 (Amaury) : ref correcte = 4-700-096 ; le 4-700-045 est acceptable en substitut. 1 EPDM par CLUSTER/module couvert -> 2 clusters = 2. !! 4-700-096 encore ABSENT du catalogue : a ajouter.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 50
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-700-096@jonction_toit_grand_cote"
  },
  {
    "key": "sub:7-636-006@7-636-008/produit[7024]",
    "kind": "substitution",
    "trigger": {
      "articles": [
        "7-636-008"
      ]
    },
    "article": "7-636-006",
    "articleName": "Nidaplast/TUV WALL Vinyle White/7024 1130x2520 COMPLETE",
    "qty": 1,
    "per": "produit",
    "unit": "pce",
    "when": {
      "ralMurs": "7024"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "6060/00058 : variante SKU du mur plein en 7024 une face (remplace 7-636-008 white/white). 25 poses. Description a adapter selon RAL demande."
      }
    ],
    "remark": "6060/00058 : variante SKU du mur plein en 7024 une face (remplace 7-636-008 white/white). 25 poses. Description a adapter selon RAL demande.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 51
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed",
    "replaces": {
      "article": "7-636-008",
      "qty": 1
    }
  },
  {
    "key": "acc:4-730-009@box",
    "kind": "accessoire",
    "trigger": {},
    "article": "4-730-009",
    "articleName": "Cable SHUKO Multiprise IP44",
    "qty": 1,
    "per": "box",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "note": "RESOLU 6060/00058 (Amaury) : 1 IP44 par VBX + supplement airco a l'appreciation (toujours en mettre un peu plus que necessaire). 4 VBX -> 4. Voir aussi ligne 4-700-027."
      }
    ],
    "remark": "RESOLU 6060/00058 (Amaury) : 1 IP44 par VBX + supplement airco a l'appreciation (toujours en mettre un peu plus que necessaire). 4 VBX -> 4. Voir aussi ligne 4-700-027.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 53
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-750-001@box",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-750-001",
    "articleName": "BIG CASE TOOL KIT",
    "qty": 1,
    "per": "box",
    "unit": "pce",
    "tranche": {
      "mode": "paliers",
      "paliers": [
        {
          "min": 1,
          "max": 7,
          "qty": 1
        },
        {
          "min": 8,
          "max": 15,
          "qty": 2
        }
      ]
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "1 toolkit <10 box, 2 dès 10 box. Klok 00055 : 2 box → 1"
      }
    ],
    "remark": "1 toolkit <10 box, 2 dès 10 box. Klok 00055 : 2 box → 1 || 2026-10-12 Amaury : 2 dès 8 VBX.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 2
      }
    ],
    "version": 1,
    "active": true,
    "source": "decision"
  },
  {
    "key": "aj:4-750-002@box",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-750-002",
    "articleName": "WAKU Ladder 4X4",
    "qty": 4,
    "per": "box",
    "unit": "pce",
    "tranche": {
      "mode": "tranche",
      "pour": 4,
      "parTranche": 12,
      "arrondi": "sup"
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Kit échelles : 4× par ~12 VBX. Klok 00055 : 2 box → 1 kit → 4"
      }
    ],
    "remark": "Kit échelles : 4× par ~12 VBX. Klok 00055 : 2 box → 1 kit → 4",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 3
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-750-003@box",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-750-003",
    "articleName": "WAKU Ladder 5X6",
    "qty": 1,
    "per": "box",
    "unit": "pce",
    "tranche": {
      "mode": "tranche",
      "pour": 1,
      "parTranche": 12,
      "arrondi": "sup"
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Kit échelles : 1× (grande) par ~12 VBX. Klok 00055 : 2 box → 1"
      }
    ],
    "remark": "Kit échelles : 1× (grande) par ~12 VBX. Klok 00055 : 2 box → 1",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 4
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "app:4-730-005@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-730-005",
    "articleName": "Cable NO PLUG 3G1.5 /M",
    "qty": null,
    "per": "job",
    "unit": "m",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Rallonges à confectionner. Klok 00055 (petit job) : 40 m"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 50 m."
      }
    ],
    "remark": "Rallonges à confectionner. Klok 00055 (petit job) : 40 m | 6059/00056 : 50 m.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 5
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "app:4-730-003@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-730-003",
    "articleName": "Cable Shuko 3G2.5 20M",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 2"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 4."
      }
    ],
    "remark": "Klok 00055 : 2 | 6059/00056 : 4.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 6
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "app:4-730-002@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-730-002",
    "articleName": "Cable Shuko 3G2.5 10M",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 2"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 6."
      }
    ],
    "remark": "Klok 00055 : 2 | 6059/00056 : 6.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 7
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "app:4-730-004@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-730-004",
    "articleName": "Cable Shuko 3G2.5 5M",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 4"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 8."
      }
    ],
    "remark": "Klok 00055 : 4 | 6059/00056 : 8.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 8
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "app:4-730-009@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-730-009",
    "articleName": "Cable SHUKO Multiprise IP44",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 2. (Brandenburg : 1 par AIRCO — voir Regles)"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059 : voir Regles (≈2/airco)."
      }
    ],
    "remark": "Klok 00055 : 2. (Brandenburg : 1 par AIRCO — voir Regles) | 6059 : voir Regles (≈2/airco).",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 9
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-730-009@box"
  },
  {
    "key": "aj:4-700-001@job[petit]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-700-001",
    "articleName": "PAINT LEVASSEUR 1K RAL7024 2.5L",
    "qty": 2,
    "per": "job",
    "unit": "pce",
    "when": {
      "tailleJob": "petit"
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Petit job : 2 pots. Klok 00055 : 2"
      }
    ],
    "remark": "Petit job : 2 pots. Klok 00055 : 2",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 10
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-700-044@job[petit]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-700-044",
    "articleName": "PAINT KIT",
    "qty": 1,
    "per": "job",
    "unit": "pce",
    "when": {
      "tailleJob": "petit"
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Petit job (≤ qq box) : 1. Klok 00055 : 1"
      }
    ],
    "remark": "Petit job (≤ qq box) : 1. Klok 00055 : 1",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 11
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-740-010@box[plancherLamine]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-740-010",
    "articleName": "Laminate LAMETT DOURO HONEY (/m²)",
    "qty": 15,
    "per": "box",
    "unit": "m2",
    "when": {
      "plancherLamine": true
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "SI plancher laminé (souvent absent du 3D). Klok 00055 : 15 m²/box × 2 = 30 m²"
      }
    ],
    "remark": "SI plancher laminé (souvent absent du 3D). Klok 00055 : 15 m²/box × 2 = 30 m²",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 12
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-157-005@m2_plancher[plancherLamine]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-157-005",
    "articleName": "Gaffa TAPE NISHIBAN BLACK",
    "qty": 1,
    "per": "m2_plancher",
    "unit": "pce",
    "tranche": {
      "mode": "tranche",
      "pour": 1,
      "parTranche": 15,
      "arrondi": "sup"
    },
    "when": {
      "plancherLamine": true
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "SI plancher : 1 par 15 m². Klok 00055 : 2"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 4."
      }
    ],
    "remark": "SI plancher : 1 par 15 m². Klok 00055 : 2 | 6059/00056 : 4.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 13
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-157-012@m2_plancher[plancherLamine]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-157-012",
    "articleName": "Tape TWO SIDE for VYNYL",
    "qty": 1,
    "per": "m2_plancher",
    "unit": "pce",
    "tranche": {
      "mode": "tranche",
      "pour": 1,
      "parTranche": 15,
      "arrondi": "sup"
    },
    "when": {
      "plancherLamine": true
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "SI plancher : 1 par 15 m². Klok 00055 : 2"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "6059/00056 : 2."
      }
    ],
    "remark": "SI plancher : 1 par 15 m². Klok 00055 : 2 | 6059/00056 : 2.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 14
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-700-033@job[couvert]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-700-033",
    "articleName": "Roof Rubber roller TEC7 15cmx1000cm",
    "qty": 1,
    "per": "job",
    "unit": "pce",
    "when": {
      "couvert": true
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "NOUVEAU 6059/00056 : 1 rouleau (conditionnel box couvertes/connectées). Klok standalone = 0."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : 1 rouleau (conditionnel box couvertes/connectées). Klok standalone = 0.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 15
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-700-096@module_toit",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-700-096",
    "articleName": "Roof Rubber EPDM 5900 |VBX|",
    "qty": 1,
    "per": "module_toit",
    "unit": "pce",
    "confidence": "confirme",
    "calibration": [],
    "remark": "ALT : géré dans Regles (1/module toit). Rappel : conditionnel box couvertes.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 16
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-700-096@module_toit[connecte,suspendu]"
  },
  {
    "key": "aj:4-750-006@job[hauteur]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-750-006",
    "articleName": "TUV BOOK",
    "qty": 1,
    "per": "job",
    "unit": "pce",
    "when": {
      "hauteur": true
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "NOUVEAU 6059/00056 : 1 si montage avec travail en hauteur/toit. Klok (sans toit) = 0. a_confirmer."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : 1 si montage avec travail en hauteur/toit. Klok (sans toit) = 0. a_confirmer.",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 17
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-750-005@job[hauteur]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-750-005",
    "articleName": "FULL SAFETY LINE",
    "qty": 1,
    "per": "job",
    "unit": "pce",
    "when": {
      "hauteur": true
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : 1. a_confirmer (lié hauteur)."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : 1. a_confirmer (lié hauteur).",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 18
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-750-004@job[hauteur]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-750-004",
    "articleName": "FULL BODY SAFETY HARNESS",
    "qty": 2,
    "per": "job",
    "unit": "pce",
    "when": {
      "hauteur": true
    },
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : 2. a_confirmer (2 monteurs en hauteur)."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : 2. a_confirmer (2 monteurs en hauteur).",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 19
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "aj:4-700-002@job[gros]",
    "kind": "ajout_chantier",
    "trigger": {},
    "article": "4-700-002",
    "articleName": "PAINT LEVASSEUR 1K RAL7024 20L",
    "qty": 1,
    "per": "job",
    "unit": "pce",
    "when": {
      "tailleJob": "gros"
    },
    "confidence": "confirme",
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : 1 bidon 20 L sur gros job (vs 4-700-001 2,5 L sur petit job)."
      }
    ],
    "remark": "NOUVEAU 6059/00056 : 1 bidon 20 L sur gros job (vs 4-700-001 2,5 L sur petit job).",
    "origin": [
      {
        "sheet": "Ajouts_chantier",
        "row": 20
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "app:4-700-027@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-700-027",
    "articleName": "AIRCO WALL TROTEC",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "hypothese",
    "calibration": [],
    "remark": "À SPÉCIFIER par toi à chaque chantier (jamais dans le 3D) — Si retenue : +1 AIRCO 4-700-027, +1 mur spécial 4-700-083 EN REMPLACEMENT d’1 mur 7-636-008, +1 câble IP44 4-730-009. Voir Regles_accessoires",
    "origin": [
      {
        "sheet": "Appreciation",
        "row": 2
      }
    ],
    "version": 1,
    "active": true,
    "source": "seed"
  },
  {
    "key": "app:4-700-083@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-700-083",
    "articleName": "NIDAPLAST WALL + trou airco",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "hypothese",
    "calibration": [
      {
        "chantier": "Brandenburg",
        "note": "Brandenburg : 1 par clim. Voir Regles_accessoires (a_confirmer)"
      }
    ],
    "remark": "Si AIRCO retenue — Brandenburg : 1 par clim. Voir Regles_accessoires (a_confirmer)",
    "origin": [
      {
        "sheet": "Appreciation",
        "row": 3
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-700-083@airco"
  },
  {
    "key": "app:4-700-096+4-700-033@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-700-096+4-700-033",
    "articleName": "ROOF RUBBER EPDM / ROOF ROLLER TEC7",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "hypothese",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "6059/00056 : réfs CALÉES. 4-700-096 = 1/module toit ; 4-700-033 = 1 rouleau/job. Klok standalone = 0. VERROUILLE : conditionnel a la CONNEXION des boxes (Amaury)."
      }
    ],
    "remark": "Uniquement si box couvertes/connectées (toits jointifs) — 6059/00056 : réfs CALÉES. 4-700-096 = 1/module toit ; 4-700-033 = 1 rouleau/job. Klok standalone = 0. VERROUILLE : conditionnel a la CONNEXION des boxes (Amaury).",
    "origin": [
      {
        "sheet": "Appreciation",
        "row": 4
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-700-096@jonction_toit_grand_cote"
  },
  {
    "key": "app:4-740-001+4-740-002+4-740-003@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-740-001+4-740-002+4-740-003",
    "articleName": "WOOD SUBPLATE (charge lourde)",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "hypothese",
    "calibration": [],
    "remark": "Si véhicule/charge sur la box — Doubler/renforcer les cales. Jugement humain",
    "origin": [
      {
        "sheet": "Appreciation",
        "row": 5
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-740-001@sous_bois_etude"
  },
  {
    "key": "app:4-740-001+4-740-002+4-740-003@job#2",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-740-001+4-740-002+4-740-003",
    "articleName": "WOOD SUBPLATE LEVELING (pile par pied)",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "6059 : 4×400+2×1000+1×700 par pied, 10 pieds (uniforme). Klok : pile plus lourde aux coins. Base = nb de pieds (déduit du 3D) ; répartition = jugement."
      }
    ],
    "remark": "Composition de la pile selon la CHARGE — 6059 : 4×400+2×1000+1×700 par pied, 10 pieds (uniforme). Klok : pile plus lourde aux coins. Base = nb de pieds (déduit du 3D) ; répartition = jugement.",
    "origin": [
      {
        "sheet": "Appreciation",
        "row": 6
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "acc:4-740-001@sous_bois_etude"
  },
  {
    "key": "app:4-750-004+4-750-005+4-750-006@job",
    "kind": "appreciation",
    "trigger": {},
    "article": "4-750-004+4-750-005+4-750-006",
    "articleName": "SÉCURITÉ HAUTEUR (harnais, ligne de vie, TUV)",
    "qty": null,
    "per": "job",
    "unit": "pce",
    "confidence": "a_confirmer",
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "6059 : harnais×2, ligne×1, TUV×1. Absent des montages sans toit (Klok). a_confirmer."
      }
    ],
    "remark": "Si montage avec toit/travail en hauteur — 6059 : harnais×2, ligne×1, TUV×1. Absent des montages sans toit (Klok). a_confirmer.",
    "origin": [
      {
        "sheet": "Appreciation",
        "row": 7
      }
    ],
    "version": 1,
    "active": false,
    "source": "seed",
    "supersededBy": "aj:4-750-004@job[hauteur]"
  },
  {
    "calibration": [],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-740-001",
    "articleName": "WOOD SUBPLATE LEVELING M16 | VIEWBOX | 400x400mm",
    "qty": 2,
    "per": "sous_bois_etude",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Plaques de calage de l’Étude structure de ce modèle (même dimension) × 2.",
    "source": "decision",
    "key": "acc:4-740-001@sous_bois_etude",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-740-002",
    "articleName": "WOOD SUBPLATE LEVELING M16 | VIEWBOX | 700x700mm",
    "qty": 2,
    "per": "sous_bois_etude",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Plaques de calage de l’Étude structure de ce modèle (même dimension) × 2.",
    "source": "decision",
    "key": "acc:4-740-002@sous_bois_etude",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-740-003",
    "articleName": "WOOD SUBPLATE LEVELING M16 | VIEWBOX | 1000x1000mm",
    "qty": 2,
    "per": "sous_bois_etude",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Plaques de calage de l’Étude structure de ce modèle (même dimension) × 2.",
    "source": "decision",
    "key": "acc:4-740-003@sous_bois_etude",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "SUBSTITUTION CONDITIONNELLE (confirmee par Amaury) : decrementer 1 nidaplast 7-636-008 par airco SEULEMENT si le slot airco est dessine en nidaplast dans le 3D (compte dans le total). Sinon (slot vide) = ajout. Klok : slots dessines en nidaplast -> decrement. !! ACCROC 6059/00056 : Amaury indique que les 3 slots airco ETAIENT dessines en nidaplast (dans les 11). La regle predit donc 11-3=8 nidaplast livres, mais le bordereau montre 11 nidaplast + 3 airco. Ecart de +3 nidaplast NON EXPLIQUE : le generateur suivant la regle sortirait 8, le reel = 11. A RECONCILIER (sur-livraison/spare ? airco compte a part sans decrement effectif ? erreur bordereau ?)."
      }
    ],
    "trigger": {},
    "article": "4-700-083",
    "articleName": "NIDAPLAST WALL WHITE / WHITE 1130x2520 With AIRCO HOLE - VIEWBOX M16",
    "qty": 1,
    "per": "airco",
    "unit": "pce",
    "confidence": "confirme",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 5
      }
    ],
    "kind": "substitution",
    "replaces": {
      "article": "7-636-008",
      "qty": 1
    },
    "when": {
      "aircoSlot": "nidaplast"
    },
    "remark": "Airco non dessinée, emplacement dessiné en nidaplast : le mur à trou remplace 1 mur 7-636-008.",
    "source": "seed",
    "key": "sub:4-700-083@airco[nidaplast]",
    "version": 1,
    "active": false,
    "supersededBy": "acc:4-700-083@airco"
  },
  {
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "SUBSTITUTION CONDITIONNELLE (confirmee par Amaury) : decrementer 1 nidaplast 7-636-008 par airco SEULEMENT si le slot airco est dessine en nidaplast dans le 3D (compte dans le total). Sinon (slot vide) = ajout. Klok : slots dessines en nidaplast -> decrement. !! ACCROC 6059/00056 : Amaury indique que les 3 slots airco ETAIENT dessines en nidaplast (dans les 11). La regle predit donc 11-3=8 nidaplast livres, mais le bordereau montre 11 nidaplast + 3 airco. Ecart de +3 nidaplast NON EXPLIQUE : le generateur suivant la regle sortirait 8, le reel = 11. A RECONCILIER (sur-livraison/spare ? airco compte a part sans decrement effectif ? erreur bordereau ?)."
      }
    ],
    "trigger": {},
    "article": "4-700-083",
    "articleName": "NIDAPLAST WALL WHITE / WHITE 1130x2520 With AIRCO HOLE - VIEWBOX M16",
    "qty": 1,
    "per": "airco",
    "unit": "pce",
    "confidence": "confirme",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 5
      }
    ],
    "kind": "accessoire",
    "when": {
      "aircoSlot": "autre"
    },
    "remark": "Module airco / HVAC dessiné dans la 3D (ou emplacement vide) : 1 mur à trou airco en plus, aucun mur décompté.",
    "source": "decision",
    "key": "acc:4-700-083@airco[autre]",
    "version": 1,
    "active": false,
    "supersededBy": "acc:4-700-083@airco"
  },
  {
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "base": 2,
        "predit": 3,
        "livre": 2,
        "note": "2 îlots de 2 VBX : 2 jonctions de toit grand côté"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "base": 3,
        "predit": 4,
        "livre": 4,
        "note": "4 VBX côte à côte : 3 jonctions → 3 ; livré 4 (écart +1 à expliquer)"
      }
    ],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-096",
    "articleName": "Roof Rubber EPDM 57x32x5900 |VBX|",
    "qty": 1,
    "per": "jonction_toit_grand_cote",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Substitut accepté : 4-700-045 (50×40×5900). Jonctions petit côté : EPDM 2500 4-700-097.",
    "source": "decision",
    "key": "acc:4-700-096@jonction_toit_grand_cote",
    "version": 1,
    "active": true,
    "group": "epdm-toit",
    "spare": {
      "type": "fixe",
      "valeur": 1
    }
  },
  {
    "calibration": [],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-097",
    "articleName": "Roof Rubber EPDM 2500 |VBX|",
    "qty": 1,
    "per": "jonction_toit_petit_cote",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "EPDM 2500 des jonctions de toit petit côté (Amaury 12.10.2026).",
    "source": "decision",
    "group": "epdm-toit",
    "key": "acc:4-700-097@jonction_toit_petit_cote",
    "version": 1,
    "active": true,
    "spare": {
      "type": "fixe",
      "valeur": 1
    }
  },
  {
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "base": 2,
        "predit": 13,
        "livre": 12,
        "note": "2 jonctions × 5 = 10, + 20 % → 12"
      },
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "base": 3,
        "predit": 20,
        "livre": 20,
        "note": "3 jonctions × 5 = 15, + 20 % → 18 ; livré 20"
      }
    ],
    "kind": "accessoire",
    "trigger": {},
    "unit": "pce",
    "confidence": "confirme",
    "spare": {
      "type": "pourcent",
      "valeur": 30
    },
    "source": "decision",
    "group": "jonctions-box",
    "article": "4-700-039",
    "articleName": "In Between Plate Large |120 x 1140 x 18 mm | VIEWBOX",
    "qty": 5,
    "per": "jonction_grand_cote",
    "key": "acc:4-700-039@jonction_grand_cote",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "accessoire",
    "trigger": {},
    "unit": "pce",
    "confidence": "confirme",
    "spare": {
      "type": "pourcent",
      "valeur": 30
    },
    "source": "decision",
    "group": "jonctions-box",
    "article": "4-700-039",
    "articleName": "In Between Plate Large |120 x 1140 x 18 mm | VIEWBOX",
    "qty": 2,
    "per": "jonction_petit_cote",
    "key": "acc:4-700-039@jonction_petit_cote",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "base": 3,
        "predit": 39,
        "livre": 36,
        "note": "3 jonctions × 10 = 30, + 20 % → 36"
      },
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "base": 2,
        "predit": 26,
        "livre": 26,
        "note": "2 jonctions × 10 = 20, + 20 % → 24 ; livré 26"
      }
    ],
    "kind": "accessoire",
    "trigger": {},
    "unit": "pce",
    "confidence": "confirme",
    "spare": {
      "type": "pourcent",
      "valeur": 30
    },
    "source": "decision",
    "group": "jonctions-box",
    "article": "4-710-001",
    "articleName": "Connecting BOLT M16 HEX BOLT M16x110 |VIEWBOX|",
    "qty": 10,
    "per": "jonction_grand_cote",
    "key": "acc:4-710-001@jonction_grand_cote",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "accessoire",
    "trigger": {},
    "unit": "pce",
    "confidence": "confirme",
    "spare": {
      "type": "pourcent",
      "valeur": 30
    },
    "source": "decision",
    "group": "jonctions-box",
    "article": "4-710-001",
    "articleName": "Connecting BOLT M16 HEX BOLT M16x110 |VIEWBOX|",
    "qty": 4,
    "per": "jonction_petit_cote",
    "key": "acc:4-710-001@jonction_petit_cote",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "6060RIAAHVIE",
        "bordereau": "00058",
        "base": 1,
        "predit": 2,
        "livre": 2
      }
    ],
    "kind": "accessoire",
    "trigger": {
      "vitrage": "10mm"
    },
    "article": "4-700-072",
    "articleName": "Window/Wall Rubber black Square 25x40x2550mm for seamless 10mm |VIEWBOX|",
    "qty": 2,
    "per": "porte_coulissante",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Classeur (6060/00058) : « + porte coulissante = +2 → 10 ».",
    "source": "decision",
    "group": "square-10mm",
    "key": "acc:4-700-072@10mm/porte_coulissante",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "Klokgebouw",
        "bordereau": "00055",
        "note": "Klok 00055 : 3 steps/porte simple (2 bas +1 haut) × 2 = 6. Ajouté MEME si absent du 3D. Porte double : à préciser"
      }
    ],
    "kind": "kit",
    "trigger": {},
    "article": "7-632-017",
    "articleName": "PLATFORM STEP 1100x500x150 DARK GREY - VIEWBOX",
    "qty": 3,
    "per": "porte_simple",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Klok 00055 : 3 steps/porte simple (2 bas +1 haut) × 2 = 6. Ajouté MEME si absent du 3D. Porte double : à préciser",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 11
      }
    ],
    "source": "decision",
    "group": "marches-portes",
    "key": "kit:7-632-017@porte_simple",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : kit escalier DOUBLE porte = 1×2200x1000 + 1×2200x500 + 2×1100x500. Ajouté même si absent du 3D."
      }
    ],
    "kind": "kit",
    "trigger": {},
    "article": "7-632-022",
    "articleName": "PLATFORM STEP 2200x1000x150 |7024| - VIEWBOX",
    "qty": 1,
    "per": "porte_double",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "NOUVEAU 6059/00056 : kit escalier DOUBLE porte = 1×2200x1000 + 1×2200x500 + 2×1100x500. Ajouté même si absent du 3D.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 31
      }
    ],
    "source": "decision",
    "group": "marches-portes",
    "key": "kit:7-632-022@porte_double",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : voir kit double porte."
      }
    ],
    "kind": "kit",
    "trigger": {},
    "article": "7-632-018",
    "articleName": "PLATFORM STEP 2200x500x150 DARK GREY - VIEWBOX",
    "qty": 1,
    "per": "porte_double",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "NOUVEAU 6059/00056 : voir kit double porte.",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 32
      }
    ],
    "source": "decision",
    "group": "marches-portes",
    "key": "kit:7-632-018@porte_double",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "note": "NOUVEAU 6059/00056 : 2 marches basses du kit double porte. (Porte SIMPLE = 3×7-632-017, voir plus haut.)"
      }
    ],
    "kind": "kit",
    "trigger": {},
    "article": "7-632-017",
    "articleName": "PLATFORM STEP 1100x500x150 DARK GREY - VIEWBOX",
    "qty": 2,
    "per": "porte_double",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "NOUVEAU 6059/00056 : 2 marches basses du kit double porte. (Porte SIMPLE = 3×7-632-017, voir plus haut.)",
    "origin": [
      {
        "sheet": "Regles_accessoires",
        "row": 33
      }
    ],
    "source": "decision",
    "group": "marches-portes",
    "key": "kit:7-632-017@porte_double",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "kit",
    "trigger": {},
    "article": "7-632-022",
    "articleName": "PLATFORM STEP 2200x1000x150 |7024| - VIEWBOX",
    "qty": 2,
    "per": "porte_coulissante",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Porte coulissante : mêmes marches que la porte double, en double (Amaury 12.10.2026).",
    "source": "decision",
    "group": "marches-portes",
    "key": "kit:7-632-022@porte_coulissante",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "kit",
    "trigger": {},
    "article": "7-632-018",
    "articleName": "PLATFORM STEP 2200x500x150 DARK GREY - VIEWBOX",
    "qty": 2,
    "per": "porte_coulissante",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Porte coulissante : mêmes marches que la porte double, en double (Amaury 12.10.2026).",
    "source": "decision",
    "group": "marches-portes",
    "key": "kit:7-632-018@porte_coulissante",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "kit",
    "trigger": {},
    "article": "7-632-017",
    "articleName": "PLATFORM STEP 1100x500x150 DARK GREY - VIEWBOX",
    "qty": 4,
    "per": "porte_coulissante",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Porte coulissante : mêmes marches que la porte double, en double (Amaury 12.10.2026).",
    "source": "decision",
    "group": "marches-portes",
    "key": "kit:7-632-017@porte_coulissante",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-730-013",
    "articleName": "Câble de liaison électrique (lampes) entre Viewbox",
    "qty": 1,
    "per": "jonction_box",
    "unit": "pce",
    "when": {
      "regime": "connecte"
    },
    "confidence": "confirme",
    "remark": "Amaury 12–13.10.2026 : 4-730-013 = 1 par jonction entre box, 4-730-014 = 1 par paire de box (lampes).",
    "source": "decision",
    "group": "cables-entre-box",
    "key": "acc:4-730-013@jonction_box[connecte]",
    "version": 1,
    "active": true
  },
  {
    "calibration": [],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-730-014",
    "articleName": "Câble de liaison électrique (lampes) pour 2 Viewbox",
    "qty": 1,
    "per": "paire_box",
    "unit": "pce",
    "when": {
      "regime": "connecte"
    },
    "confidence": "confirme",
    "remark": "Amaury 12–13.10.2026 : 4-730-013 = 1 par jonction entre box, 4-730-014 = 1 par paire de box (lampes).",
    "source": "decision",
    "group": "cables-entre-box",
    "key": "acc:4-730-014@paire_box[connecte]",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "base": 3,
        "predit": 3,
        "livre": 3,
        "note": "11 nidaplast + 3 murs à trou livrés"
      }
    ],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-700-083",
    "articleName": "NIDAPLAST WALL WHITE / WHITE 1130x2520 With AIRCO HOLE - VIEWBOX M16",
    "qty": 1,
    "per": "airco",
    "unit": "pce",
    "confidence": "confirme",
    "remark": "Un mur à trou par airco ; les murs dessinés restent (spares).",
    "source": "decision",
    "key": "acc:4-700-083@airco",
    "version": 1,
    "active": true
  },
  {
    "calibration": [
      {
        "chantier": "6059RFRAMVIE",
        "bordereau": "00056",
        "base": 6,
        "predit": 20,
        "livre": 20,
        "note": "6 × 2,53 = 15,18 m, + 30 % → 20 m"
      }
    ],
    "kind": "accessoire",
    "trigger": {},
    "article": "4-720-011",
    "articleName": "Viewbox Poles Rubber FLAT adhésive 20x4mm /M",
    "qty": 2.53,
    "per": "poteau_connecte",
    "unit": "m",
    "spare": {
      "type": "pourcent",
      "valeur": 30
    },
    "confidence": "confirme",
    "remark": "Une bande de 2,53 m par paire de poteaux jointifs, 4 bandes là où 4 poteaux se touchent.",
    "source": "decision",
    "key": "acc:4-720-011@poteau_connecte",
    "version": 1,
    "active": true
  }
];

export const SEED_OBSERVATIONS: SeedObservation[] = [
  {
    "key": "obs:4-700-065@connecté#38",
    "article": "4-700-065",
    "articleName": "Window/Wall Rubber BIG 2550mm",
    "chantier": "6059RFRAMVIE",
    "valeur": 25,
    "contexte": "régime BOX ADJACENTES (4 VBX / 3 jonctions)",
    "regime": "connecte",
    "note": "6059/00056 observé (verticaux). En connecté les côtés intérieurs disparaissent → les règles Klok STANDALONE (8/box +20%) NE transfèrent PAS. Valeur brute à re-caler.",
    "origin": {
      "sheet": "Regles_accessoires",
      "row": 38
    }
  },
  {
    "key": "obs:4-700-066@connecté#39",
    "article": "4-700-066",
    "articleName": "Window/Wall Rubber BIG 2300mm",
    "chantier": "6059RFRAMVIE",
    "valeur": 20,
    "contexte": "régime BOX ADJACENTES",
    "regime": "connecte",
    "note": "6059/00056 observé (petits côtés). À re-caler en connecté.",
    "origin": {
      "sheet": "Regles_accessoires",
      "row": 39
    }
  },
  {
    "key": "obs:4-700-075@connecté#40",
    "article": "4-700-075",
    "articleName": "Window/Wall Rubber BIG 5700mm",
    "chantier": "6059RFRAMVIE",
    "valeur": 6,
    "contexte": "régime BOX ADJACENTES",
    "regime": "connecte",
    "note": "6059/00056 observé. NB : bien moins qu’en standalone (grands côtés partagés). À re-caler.",
    "origin": {
      "sheet": "Regles_accessoires",
      "row": 40
    }
  },
  {
    "key": "obs:4-700-071@connecté#41",
    "article": "4-700-071",
    "articleName": "Window/Wall Rubber Carrosserie 2530mm",
    "chantier": "6059RFRAMVIE",
    "valeur": 8,
    "contexte": "régime BOX ADJACENTES",
    "regime": "connecte",
    "note": "6059/00056 observé (jonctions panneaux). À re-caler.",
    "origin": {
      "sheet": "Regles_accessoires",
      "row": 41
    }
  },
  {
    "key": "obs:4-700-070@connecté#42",
    "article": "4-700-070",
    "articleName": "Window/Wall Rubber Carrosserie 10cm",
    "chantier": "6059RFRAMVIE",
    "valeur": 22,
    "contexte": "régime BOX ADJACENTES",
    "regime": "connecte",
    "note": "6059/00056 observé. À re-caler.",
    "origin": {
      "sheet": "Regles_accessoires",
      "row": 42
    }
  },
  {
    "key": "obs:4-700-073@connecté#43",
    "article": "4-700-073",
    "articleName": "Window/Wall Rubber Square seamless 8.8.2",
    "chantier": "6059RFRAMVIE",
    "valeur": 12,
    "contexte": "régime BOX ADJACENTES",
    "regime": "connecte",
    "note": "6059/00056 observé. Klok standalone = 8/box. En connecté = 12 pour 4 VBX. À re-caler.",
    "origin": {
      "sheet": "Regles_accessoires",
      "row": 43
    }
  },
  {
    "key": "obs:4-700-064@connecté#44",
    "article": "4-700-064",
    "articleName": "Sub Block for windows and wall 45x100",
    "chantier": "6059RFRAMVIE",
    "valeur": 50,
    "contexte": "régime BOX ADJACENTES",
    "regime": "connecte",
    "note": "6059/00056 observé (~2/panneau, ~28 panneaux). À re-caler.",
    "origin": {
      "sheet": "Regles_accessoires",
      "row": 44
    }
  },
  {
    "key": "obs:4-700-061@connecté#45",
    "article": "4-700-061",
    "articleName": "Plexi profil 18mmx2530mm",
    "chantier": "6059RFRAMVIE",
    "valeur": 10,
    "contexte": "régime BOX ADJACENTES",
    "regime": "connecte",
    "note": "6059/00056 observé (entre fenêtres 8.8.2). Klok standalone = 6/box. À re-caler.",
    "origin": {
      "sheet": "Regles_accessoires",
      "row": 45
    }
  }
];

export const SEED_DECISIONS: DecisionLog[] = [
  {
    "id": "sous-bois-etude",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Les sous-bois (cales 400×400, 700×700, 1000×1000) viennent de l’Étude structure, qui donne combien de plaques et où. La loading liste prend la quantité de l’étude × 2 (ex. l’étude dit 25 × 40×40 → 50 dans la liste), pour tous les sous-bois.",
    "applied": true,
    "details": [
      "ajout acc:4-740-001@sous_bois_etude",
      "acc:4-740-001@pied → remplacée par acc:4-740-001@sous_bois_etude",
      "ajout acc:4-740-002@sous_bois_etude",
      "acc:4-740-002@box[milieu] → remplacée par acc:4-740-002@sous_bois_etude",
      "ajout acc:4-740-003@sous_bois_etude",
      "acc:4-740-003@box[angle] → remplacée par acc:4-740-003@sous_bois_etude"
    ]
  },
  {
    "id": "toolkit-8-vbx",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Toolkit 4-750-001 : 1 jusqu’à 7 VBX, 2 dès 8 VBX. Au-delà de 15 VBX : pas encore de règle (à confirmer).",
    "applied": true,
    "details": [
      "aj:4-750-001@box : paliers 1–7 → 1, 8–15 → 2"
    ]
  },
  {
    "id": "airco-mur-trou",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Un module airco / HVAC vu dans la 3D demande un mur avec trou airco 4-700-083 (explique les +3 nidaplast de 6059 : les 11 murs dessinés + 3 murs à trou). Le décompte d’un mur 7-636-008 reste réservé au cas où l’airco n’est pas dessinée et que son emplacement est dessiné en nidaplast (règle du classeur).",
    "applied": true,
    "details": [
      "ajout sub:4-700-083@airco[nidaplast]",
      "ajout acc:4-700-083@airco[autre]",
      "acc:4-700-083@4-700-027/airco → remplacée par sub:4-700-083@airco[nidaplast]",
      "4-700-027 marqué « airco / HVAC »"
    ]
  },
  {
    "id": "ip44-par-vbx",
    "date": "2026-10-12",
    "by": "remarque du classeur (révisé 6060/00058)",
    "text": "Câble IP44 4-730-009 : 1 par VBX, airco ou non (la ligne « par airco » et le forfait chantier sont remplacés).",
    "applied": true,
    "details": [
      "acc:4-730-009@4-700-027/box → remplacée par acc:4-730-009@box"
    ]
  },
  {
    "id": "epdm-alt",
    "date": "2026-10-12",
    "by": "remarque du classeur (« ALT : géré dans Regles »)",
    "text": "La ligne EPDM 4-700-096 de l’onglet Ajouts_chantier est un doublon des règles d’accessoires : désactivée.",
    "applied": true,
    "details": [
      "aj:4-700-096@module_toit → remplacée par acc:4-700-096@module_toit[connecte,suspendu]"
    ]
  },
  {
    "id": "vitrage-7-637-010",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Le glasswall seamless 10 mm 7-637-010 (alu mat) prend les mêmes accessoires que 7-637-009 (régime 10 mm).",
    "applied": true,
    "details": [
      "7-637-010 : régime 10 mm"
    ]
  },
  {
    "id": "pieds-par-type",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Pieds par box : Viewbox standard 5900 = 6 (4 coins + 2 milieux), Viewbox 8,4 m = 8, Viewbox M20 = 10.",
    "applied": true,
    "details": [
      "7-962-016 : 6 pieds",
      "7-962-012 : 8 pieds",
      "7-962-008 : 10 pieds"
    ]
  },
  {
    "id": "lamine-par-box",
    "date": "2026-10-12",
    "by": "remarque du classeur (« 15 m²/box »)",
    "text": "Plancher laminé 4-740-010 : 15 m² par box (si plancher laminé). Gaffa et adhésif : 1 par tranche de 15 m² de laminé.",
    "applied": true,
    "details": [
      "4-740-010 : 15 m² / box → aj:4-740-010@box[plancherLamine]",
      "4-740-010 : unité m2"
    ]
  },
  {
    "id": "peinture-petit-job",
    "date": "2026-10-12",
    "by": "remarque du classeur (« Petit job : 2 pots », « Petit job : 1 »)",
    "text": "Peinture : petit job = 2 pots 4-700-001 + 1 kit 4-700-044 ; gros job = 1 bidon 20 L 4-700-002. La taille du job est une question chantier.",
    "applied": true,
    "details": [
      "app:4-700-001@job → aj:4-700-001@job[petit] (2)",
      "app:4-700-044@job → aj:4-700-044@job[petit] (1)"
    ]
  },
  {
    "id": "unites-metre",
    "date": "2026-10-12",
    "by": "classeur (quantités en mètres)",
    "text": "Unités : bande poteau 4-720-011 et câble sans prise 4-730-005 au mètre.",
    "applied": true,
    "details": [
      "4-720-011 : unité m",
      "4-730-005 : unité m"
    ]
  },
  {
    "id": "epdm-jonctions-toit",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "EPDM de toit : 1 par jonction de toit. Deux toits qui se touchent par les grands côtés → l’EPDM 5900 (4-700-096, substitut 4-700-045) ; par les petits côtés → l’EPDM 2500 (4-700-097).",
    "applied": true,
    "details": [
      "ajout acc:4-700-096@jonction_toit_grand_cote",
      "ajout acc:4-700-097@jonction_toit_petit_cote",
      "acc:4-700-096@module_toit[connecte,suspendu] → remplacée par acc:4-700-096@jonction_toit_grand_cote",
      "acc:4-700-096@ilot_couvert[connecte,suspendu] → remplacée par acc:4-700-096@jonction_toit_grand_cote"
    ]
  },
  {
    "id": "plaques-boulons-jonctions",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Jonctions entre box : plaque inter-box 4-700-039 = 5 par jonction grand côté, 2 par jonction petit côté ; boulons 4-710-001 = 10 par jonction grand côté (5 en bas + 5 en haut), 4 par jonction petit côté (2 + 2). Boulonnerie, quincaillerie, plaques de jonction : + 20 % de spare.",
    "applied": true,
    "details": [
      "ajout acc:4-700-039@jonction_grand_cote",
      "ajout acc:4-700-039@jonction_petit_cote",
      "acc:4-700-039@jonction_box[connecte] → remplacée par acc:4-700-039@jonction_grand_cote",
      "acc:4-700-039@box[connecte] → remplacée par acc:4-700-039@jonction_grand_cote",
      "ajout acc:4-710-001@jonction_grand_cote",
      "ajout acc:4-710-001@jonction_petit_cote",
      "acc:4-710-001@box → remplacée par acc:4-710-001@jonction_grand_cote",
      "acc:4-700-040@bord : + 20 % (plaque de jonction)"
    ]
  },
  {
    "id": "spares-joints-10mm",
    "date": "2026-10-12",
    "by": "Amaury (« spare rajouté », + 50 % confirmé)",
    "text": "Joints du vitrage 10 mm : on rajoute du spare. Square 10 mm 4-700-072 : + 20 % puis + 2 par porte coulissante (6060 : 6 → 8 → 10) ; joints petits / grands côtés vitrés 4-700-067 / 4-700-074 : + 50 % (6060 : 4 → 6 et 2 → 3).",
    "applied": true,
    "details": [
      "acc:4-700-072@10mm/terminaison_vitre : spare « texte » → + 20 % (6060 : 6 → 8)",
      "acc:4-700-067@10mm/cote_vitre_court : spare « texte » → + 50 % (6060 : 4 → 6)",
      "acc:4-700-074@10mm/cote_vitre_long : spare « texte » → + 50 % (6060 : 2 → 3)",
      "ajout acc:4-700-072@10mm/porte_coulissante"
    ]
  },
  {
    "id": "marches-toutes-portes",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Marches : dès que c’est une porte. Toute porte simple (pleine ou vitrée) → 3 marches 7-632-017 ; toute porte double (pleine ou vitrée) → 7-632-022 + 7-632-018 + 2 × 7-632-017 ; porte coulissante → le kit de la porte double en double (2 + 2 + 4). Le type de porte vient de la désignation du catalogue.",
    "applied": true,
    "details": [
      "ajout kit:7-632-017@porte_simple",
      "kit:7-632-017@7-199-067/produit → remplacée par kit:7-632-017@porte_simple",
      "ajout kit:7-632-022@porte_double",
      "kit:7-632-022@7-199-066/produit → remplacée par kit:7-632-022@porte_double",
      "ajout kit:7-632-018@porte_double",
      "kit:7-632-018@7-199-066/produit → remplacée par kit:7-632-018@porte_double",
      "ajout kit:7-632-017@porte_double",
      "kit:7-632-017@7-199-066/produit → remplacée par kit:7-632-017@porte_double",
      "ajout kit:7-632-022@porte_coulissante",
      "ajout kit:7-632-018@porte_coulissante",
      "ajout kit:7-632-017@porte_coulissante",
      "portes du catalogue : 7-625-013 simple, 7-625-017 simple, 7-625-018 double, 7-625-019 double, 7-625-020 coulissante, 7-625-022 simple, 7-625-014 simple, 7-625-021 coulissante, 7-625-023 coulissante, 7-199-067 simple, 7-199-066 double"
    ]
  },
  {
    "id": "toujours-un-peu-plus",
    "date": "2026-10-12",
    "by": "Amaury (« rajoute toujours un peu plus que trouvé, comme là », + 30 % confirmé)",
    "text": "Toujours un peu plus que ce qui est trouvé : la quincaillerie et les plaques de jonction passent à + 30 % (le plus petit spare qui couvre tout ce qui a été livré sur 6059 et 6060 : plaques 15 → 20, boulons 20 → 26), l’EPDM de toit à + 1 (6059 : 3 → 4).",
    "applied": true,
    "details": [
      "acc:4-700-040@bord : + 30 %",
      "acc:4-700-039@jonction_grand_cote : + 30 %",
      "acc:4-700-039@jonction_petit_cote : + 30 %",
      "acc:4-710-001@jonction_grand_cote : + 30 %",
      "acc:4-710-001@jonction_petit_cote : + 30 %",
      "acc:4-700-096@jonction_toit_grand_cote : + 1",
      "acc:4-700-097@jonction_toit_petit_cote : + 1"
    ]
  },
  {
    "id": "vitrage-442-additionne",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Vitrage 4.4.2 : le joint 4-700-075 et les silicones 4-157-003 / 4-157-004 « 1 par vitre » s’ajoutent aux règles « par box ».",
    "applied": true,
    "details": [
      "acc:4-700-075@4.4.2/produit + acc:4-700-075@box[standalone] : s’additionnent",
      "acc:4-157-003@4.4.2/produit + acc:4-157-003@box : s’additionnent",
      "acc:4-157-004@4.4.2/produit + acc:4-157-004@box : s’additionnent"
    ]
  },
  {
    "id": "pieds-6059",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Pieds 6059 : on garde 15 (4 box côte à côte × 6 pieds, pieds communs fusionnés) ; le « 10 » du classeur n’est pas une règle.",
    "applied": true,
    "details": [
      "aucune règle modifiée : le nombre de pieds vient de la topologie"
    ]
  },
  {
    "id": "joints-10mm-bas-haut",
    "date": "2026-10-12",
    "by": "remarque du classeur (6060/00058 : « 2 petits côtés vitrés × 2 (bas + haut) = 4 », « 1 grand côté vitré × 2 = 2 »)",
    "text": "Joints 4-700-067 / 4-700-074 : 2 par côté vitré (un en bas, un en haut), puis + 50 % (6060 : 4 → 6 et 2 → 3).",
    "applied": true,
    "details": [
      "acc:4-700-067@10mm/cote_vitre_court : 2 par côté vitré (bas + haut)",
      "acc:4-700-074@10mm/cote_vitre_long : 2 par côté vitré (bas + haut)"
    ]
  },
  {
    "id": "plaque-simple-connecte",
    "date": "2026-10-12",
    "by": "remarque du classeur (« Klok → 0 », plaques de jonction conditionnelles à l’adjacence)",
    "text": "Plaque simple 4-700-040 (box → terrasse / vide) : seulement pour des box connectées ; Klokgebouw (box seules) = 0.",
    "applied": true,
    "details": [
      "acc:4-700-040@bord : box connectées seulement"
    ]
  },
  {
    "id": "mur-ral-7024",
    "date": "2026-10-12",
    "by": "remarque du classeur (6060/00058 : « remplace 7-636-008 white/white »)",
    "text": "Murs RAL 7024 une face demandés : chaque nidaplast 7-636-008 dessiné sort en 7-636-006 (question chantier « RAL des murs »).",
    "applied": true,
    "details": [
      "7-636-006 : remplace 7-636-008 quand les murs sont demandés en RAL 7024 → sub:7-636-006@7-636-008/produit[7024]"
    ]
  },
  {
    "id": "inclus-dans-standard",
    "date": "2026-10-12",
    "by": "Amaury",
    "text": "Les modules de toit 7-632-001 / 7-632-002 et les poteaux 7-355-014 / 7-355-015 sont compris dans le standard 7-962-016 : jamais une ligne à part. La bande poteau 4-720-011 (par poteau) a donc besoin du nombre de poteaux par box (à préciser).",
    "applied": true,
    "details": [
      "7-632-001 : compris dans 7-962-016",
      "7-632-002 : compris dans 7-962-016",
      "7-355-014 : compris dans 7-962-016",
      "7-355-015 : compris dans 7-962-016"
    ]
  },
  {
    "id": "cables-entre-box",
    "date": "2026-10-12",
    "by": "Amaury (« par Viewbox on peut rajouter 4-730-013 … et 4-730-014 pour 2 Viewbox »)",
    "text": "Câbles électriques des lampes entre box : 4-730-013 = 1 par jonction entre box, 4-730-014 = 1 par paire de box ; pas en box seules (Klokgebouw n’en a pas).",
    "applied": true,
    "details": [
      "ajout acc:4-730-013@jonction_box[connecte]",
      "ajout acc:4-730-014@paire_box[connecte]"
    ]
  },
  {
    "id": "airco-sans-decompte",
    "date": "2026-10-12",
    "by": "Amaury (« ne retire pas de mur, laisse-les comme ça, ça fait des spares »)",
    "text": "Airco : 1 mur avec trou airco 4-700-083 par airco (dessinée ou à prévoir), toujours en plus ; aucun mur 7-636-008 n’est retiré.",
    "applied": true,
    "details": [
      "ajout acc:4-700-083@airco",
      "sub:4-700-083@airco[nidaplast] → remplacée par acc:4-700-083@airco",
      "acc:4-700-083@airco[autre] → remplacée par acc:4-700-083@airco"
    ]
  },
  {
    "id": "bande-poteaux-jointifs",
    "date": "2026-10-13",
    "by": "Amaury (« 2 × 014 et 2 × 015 par Viewbox ; la bande poteau quand les poteaux sont connectés : par deux c’est 1, par 4 c’est 4 »)",
    "text": "Poteaux : 4 par Viewbox standard (2 × 7-355-014 + 2 × 7-355-015, compris dans la box, jamais dans la liste). Bande poteau 4-720-011 : 2,53 m par bande, 1 bande là où 2 poteaux se touchent, 4 bandes là où 4 se touchent, + 30 % (6059 : 6 × 2,53 = 15,2 → 20 m livrés).",
    "applied": true,
    "details": [
      "ajout acc:4-720-011@poteau_connecte",
      "acc:4-720-011@poteau → remplacée par acc:4-720-011@poteau_connecte"
    ]
  }
];

/** Réfs que le classeur demande d'ajouter au catalogue (ajout par validation dans l'app, jamais en silence). */
export const SEED_CATALOGUE_TO_ADD: string[] = ["4-700-096","4-720-011","4-700-002"];
