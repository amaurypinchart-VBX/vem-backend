// Réponses aux questions chantier (tout ce qui n'est jamais dans la 3D) et plaques de calage données par l'Étude
// structure. Une réponse absente = question posée, jamais une supposition.

export interface SiteAnswers {
  /** airco à prévoir, non dessinées dans la 3D */
  aircoCount?: number;
  /** emplacement de ces airco dans la 3D : dessiné en nidaplast (le mur à trou remplace un mur) ou vide (ajout) */
  aircoSlot?: 'nidaplast' | 'vide';
  chargeLourde?: boolean;
  plancherLamine?: boolean;
  /** m² de plancher laminé (sinon 15 m² par box, règle du laminé) */
  plancherM2?: number;
  /** travail en hauteur / sur le toit */
  hauteur?: boolean;
  tailleJob?: 'petit' | 'gros';
  montage?: 'atelier' | 'chantier';
  /** RAL des murs demandé (« 7024 » = nidaplast RAL 7024 une face) ; absent / « blanc » = blanc */
  ralMurs?: string;
  /** quantités saisies pour les lignes à l'appréciation (câbles forfait…), par référence */
  appreciation?: Record<string, number>;
}

/** Plaque de calage d'une dimension, en nombre de pièces, donnée par l'Étude structure. */
export interface StudyPlate {
  l: number;
  w: number;
  t?: number;
  quantity: number;
  label?: string;
}

export interface StudyInput {
  plates: StudyPlate[];
  /** d'où viennent les plaques (« Étude structure du 12/10, calage automatique ») */
  source: string;
}

/** Matériel de calage de l'Étude structure (`CalageResult.materials` : « 400 × 400 × 18 mm ») → plaques. */
export function platesFromMaterials(materials: readonly { label: string; dims: string; quantity: number }[]): StudyPlate[] {
  const out: StudyPlate[] = [];
  for (const m of materials) {
    const d = /(\d+(?:[.,]\d+)?)\s*×\s*(\d+(?:[.,]\d+)?)(?:\s*×\s*(\d+(?:[.,]\d+)?))?\s*mm/.exec(m.dims);
    if (!d || /C24|longrine/i.test(m.label)) continue;
    const n = (s: string) => Number(s.replace(',', '.'));
    out.push({ l: n(d[1]), w: n(d[2]), t: d[3] ? n(d[3]) : undefined, quantity: m.quantity, label: m.label });
  }
  return out;
}
