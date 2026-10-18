// src/services/roofCheckLibrary.ts
// Contrôle des jonctions de toiture : bibliothèque des tâches par type de point.
// Base dans le code (jamais écrasée) ; modifications dans app_settings › checklist.roofCheckLibrary :
// une tâche enregistrée remplace la tâche de base de même clé dans le même groupe, les nouvelles s'ajoutent.
// Pur (pas de Prisma) : testé par scripts/test-roofcheck.ts.

export const ROOF_POINT_TYPES = ['seam-long', 'seam-short', 'cross', 'tee', 'end', 'outer-corner', 'step', 'custom'] as const;
export type RoofPointType = typeof ROOF_POINT_TYPES[number];

/** Groupes de la bibliothèque : les deux jonctions partagent leurs tâches, croisement et T aussi. */
export const ROOF_TASK_GROUPS = ['seam', 'node', 'end', 'corner', 'step', 'custom', 'permanent'] as const;
export type RoofTaskGroup = typeof ROOF_TASK_GROUPS[number];

export const ROOF_GROUP_LABELS: Record<RoofTaskGroup, string> = {
  seam: 'Jonction',
  node: 'Croisement / T',
  end: 'Extrémité',
  corner: 'Angle extérieur',
  step: 'Raccord d’étage',
  custom: 'Point libre',
  permanent: 'Viewbox permanente (en plus, sur les jonctions)',
};

export const ROOF_TYPE_LABELS: Record<RoofPointType, string> = {
  'seam-long': 'Jonction grand côté',
  'seam-short': 'Jonction petit côté',
  cross: 'Croisement',
  tee: 'Jonction en T',
  end: 'Extrémité',
  'outer-corner': 'Angle extérieur',
  step: 'Raccord d’étage',
  custom: 'Point libre',
};

export function groupOfType(t: RoofPointType): Exclude<RoofTaskGroup, 'permanent'> {
  switch (t) {
    case 'seam-long': case 'seam-short': return 'seam';
    case 'cross': case 'tee': return 'node';
    case 'end': return 'end';
    case 'outer-corner': return 'corner';
    case 'step': return 'step';
    default: return 'custom';
  }
}

export interface RoofTask {
  key: string;
  label: string;
  /** la tâche se prouve par une photo (mode « 1 photo par tâche ») */
  photo: boolean;
  /** proposée cochée par défaut dans la configuration d'un projet */
  active: boolean;
}

export type RoofLibrary = Record<RoofTaskGroup, RoofTask[]>;

export const ROOF_LIBRARY_BASE: RoofLibrary = {
  seam: [
    { key: 'rubber', label: 'Caoutchouc supérieur posé sur toute la longueur, sans pli ni interruption', photo: true, active: true },
    { key: 'tape', label: 'Bande Rooftec / Rooftape posée, marouflée, bords collés', photo: true, active: true },
    { key: 'u-profile', label: 'Profil en U supérieur siliconé', photo: false, active: false },
  ],
  node: [
    { key: 'cross-tape', label: 'Bandes croisées, recouvrement correct, bords collés', photo: true, active: true },
  ],
  end: [
    { key: 'end-close', label: 'Extrémité du caoutchouc et de la bande fermée / retournée sur la rive', photo: true, active: true },
    { key: 'u-end', label: 'Raccord et extrémité du U siliconés', photo: false, active: true },
  ],
  corner: [
    { key: 'corner', label: 'Angle de toiture étanché', photo: true, active: true },
  ],
  step: [
    { key: 'step', label: 'Raccord étage / toiture inférieure étanché', photo: true, active: true },
  ],
  custom: [
    { key: 'through', label: 'Traversée étanchée (câble, airco, évacuation)', photo: true, active: true },
  ],
  permanent: [
    { key: 'wool', label: 'Profils de toiture (NDCS) remplis de laine de roche', photo: true, active: true },
  ],
};

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Une tâche lue d'un JSON (null si invalide). */
export function cleanTask(raw: any): RoofTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = String(raw.key ?? '').trim().toLowerCase();
  const label = String(raw.label ?? '').trim().slice(0, 300);
  if (!KEY_RE.test(key) || !label) return null;
  return { key, label, photo: raw.photo === true, active: raw.active !== false };
}

/** Modifications enregistrées, lecture tolérante : { tasks: { seam: [...], ... } } (ou directement les groupes). */
export function cleanSavedLibrary(raw: any): Partial<RoofLibrary> {
  const src = raw && typeof raw === 'object' ? (raw.tasks && typeof raw.tasks === 'object' ? raw.tasks : raw) : {};
  const out: Partial<RoofLibrary> = {};
  for (const g of ROOF_TASK_GROUPS) {
    if (!Array.isArray(src[g])) continue;
    const seen = new Set<string>();
    const list: RoofTask[] = [];
    for (const t of src[g]) {
      const c = cleanTask(t);
      if (c && !seen.has(c.key)) { seen.add(c.key); list.push(c); }
    }
    out[g] = list;
  }
  return out;
}

/** Bibliothèque effective : base + modifications (même clé = remplacée, nouvelles clés à la suite). */
export function mergeRoofLibrary(saved: Partial<RoofLibrary> | null | undefined): RoofLibrary {
  const out = {} as RoofLibrary;
  for (const g of ROOF_TASK_GROUPS) {
    const base = ROOF_LIBRARY_BASE[g].map((t) => ({ ...t }));
    const mine = saved?.[g] || [];
    const byKey = new Map(mine.map((t) => [t.key, t]));
    const merged = base.map((t) => (byKey.has(t.key) ? { ...byKey.get(t.key)! } : t));
    for (const t of mine) if (!base.some((b) => b.key === t.key)) merged.push({ ...t });
    out[g] = merged;
  }
  return out;
}

/** Tâches proposées par défaut pour un type de point (actives seulement ; + laine de roche sur les jonctions en permanente). */
export function defaultTasksFor(type: RoofPointType, lib: RoofLibrary, viewboxType?: string | null): RoofTask[] {
  const list = lib[groupOfType(type)].filter((t) => t.active);
  if (viewboxType === 'permanente' && groupOfType(type) === 'seam') list.push(...lib.permanent.filter((t) => t.active));
  return list.map((t) => ({ ...t }));
}
