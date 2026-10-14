// Préréglages de vues spéciales (base dans le code). Portables : aucun identifiant de nœud, seulement des étiquettes
// de vue, des catégories, des références de hauteur. Aucun ne double une planche existante (implantation des pieds =
// planche « Plan d'implantation » ; plan de calage = Étude structure) : « Implantation des pieds » est donc une vue de
// dessous, avec les plaques de calage et le dessous du plancher, que les planches n'ont pas.
import type { CustomViewSpec, VisibilityRule } from './types';
import { DEFAULT_CAMERA, DEFAULT_LAYOUT, DEFAULT_STYLE } from './types';

export interface ViewPreset {
  key: string;
  name: string;
  /** une ligne d'explication (liste, IA) */
  description: string;
  /** options proposées à la création (règles en plus, cochées ou non) */
  options?: Array<{ key: string; label: string; rule: VisibilityRule; default: boolean }>;
  spec: Omit<CustomViewSpec, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'name'>;
}

const tagRule = (id: string, op: VisibilityRule['op'], tags: string[], label: string): VisibilityRule => ({ id, op, match: { viewTags: tags }, label, source: 'preset' });

const base = (): ViewPreset['spec'] => ({
  v: 1,
  scope: { modules: 'all', common: true },
  camera: { ...DEFAULT_CAMERA },
  cuts: [],
  visibility: [],
  layout: { ...DEFAULT_LAYOUT },
  style: { ...DEFAULT_STYLE },
  output: 'vector',
});

const LIGHTS = tagRule('p-eclairage', 'hide', ['eclairage'], 'Éclairage — toutes les Viewbox');

export const VIEW_PRESETS: ViewPreset[] = [
  {
    key: 'roof-under-no-ceiling',
    name: 'Dessous de toiture — sans plafond',
    description: 'Vue de dessous coupée sous la toiture, plafond tendu retiré (ses fixations restent) : structure de toiture, panneaux, plaques d’angle.',
    options: [{ key: 'lights', label: 'Retirer aussi l’éclairage (spots, rails)', rule: LIGHTS, default: false }],
    spec: {
      ...base(),
      camera: { ...DEFAULT_CAMERA, dir: 'bottom' },
      cuts: [{ id: 'c-roof', frame: 'module', axis: 'horizontal', ref: { kind: 'level', ref: 'roof-bottom' }, offset: -200, keep: 'positive' }],
      visibility: [tagRule('p-plafond', 'hide', ['plafond-tendu'], 'Plafond tendu — toutes les Viewbox')],
    },
  },
  {
    key: 'roof-under',
    name: 'Dessous de toiture — avec plafond',
    description: 'Vue de dessous coupée sous la toiture, plafond tendu en place.',
    options: [{ key: 'lights', label: 'Retirer l’éclairage (spots, rails)', rule: LIGHTS, default: false }],
    spec: {
      ...base(),
      camera: { ...DEFAULT_CAMERA, dir: 'bottom' },
      cuts: [{ id: 'c-roof', frame: 'module', axis: 'horizontal', ref: { kind: 'level', ref: 'roof-bottom' }, offset: -200, keep: 'positive' }],
    },
  },
  {
    key: 'box-under',
    name: 'Dessous de la box',
    description: 'Vue de dessous sans coupe : plancher, pieds, calage.',
    options: [{ key: 'calage', label: 'Retirer le calage', rule: tagRule('p-calage', 'hide', ['calage'], 'Calage — toutes les Viewbox'), default: false }],
    spec: { ...base(), camera: { ...DEFAULT_CAMERA, dir: 'bottom' } },
  },
  {
    key: 'plan-cut-1200',
    name: 'Plan coupé à 1,20 m',
    description: 'Vue de dessus coupée à 1 200 mm au-dessus du plancher, jusqu’au dessous du plancher.',
    spec: {
      ...base(),
      camera: { ...DEFAULT_CAMERA, dir: 'top' },
      cuts: [{ id: 'c-plan', frame: 'module', axis: 'horizontal', ref: { kind: 'level', ref: 'floor-top' }, offset: 1200, keep: 'negative', depth: 1500 }],
    },
  },
  {
    key: 'section-long',
    name: 'Coupe longitudinale A-A',
    description: 'Coupe verticale au milieu de chaque Viewbox, parallèle au grand côté, vue de face.',
    spec: {
      ...base(),
      camera: { ...DEFAULT_CAMERA, frame: 'module', dir: 'left' },
      // vue gauche = observateur côté −y local ⇒ on garde le côté +y (au-delà du plan)
      cuts: [{ id: 'c-a', label: 'A', frame: 'module', axis: 'long', ref: { kind: 'module', ref: 'mid' }, offset: 0, keep: 'positive' }],
    },
  },
  {
    key: 'section-short',
    name: 'Coupe transversale B-B',
    description: 'Coupe verticale au milieu de chaque Viewbox, parallèle au petit côté.',
    spec: {
      ...base(),
      camera: { ...DEFAULT_CAMERA, frame: 'module', dir: 'front' },
      cuts: [{ id: 'c-b', label: 'B', frame: 'module', axis: 'short', ref: { kind: 'module', ref: 'mid' }, offset: 0, keep: 'negative' }],
    },
  },
  {
    key: 'structure-only',
    name: 'Structure seule',
    description: 'Vue iso sans façades, plafond tendu, éclairage ni mobilier.',
    spec: {
      ...base(),
      camera: { ...DEFAULT_CAMERA, dir: 'iso', isoCorner: 'fl' },
      visibility: [
        tagRule('p-facade', 'hide', ['facade'], 'Façades — vitrages, murs, portes'),
        tagRule('p-plafond', 'hide', ['plafond-tendu'], 'Plafond tendu'),
        tagRule('p-eclairage', 'hide', ['eclairage'], 'Éclairage'),
        tagRule('p-mobilier', 'hide', ['mobilier'], 'Mobilier'),
      ],
    },
  },
  {
    key: 'feet-layout',
    name: 'Implantation des pieds (vue de dessous)',
    description: 'Vue de dessous : pieds, calage et dessous du plancher seulement.',
    spec: {
      ...base(),
      camera: { ...DEFAULT_CAMERA, dir: 'bottom' },
      cuts: [{ id: 'c-feet', frame: 'module', axis: 'horizontal', ref: { kind: 'level', ref: 'floor-top' }, offset: 0, keep: 'negative' }],
      visibility: [tagRule('p-facade', 'hide', ['facade'], 'Façades')],
    },
  },
];

/** Vue spéciale créée depuis un préréglage (options choisies ajoutées à la fin des règles). */
export function specFromPreset(p: ViewPreset, id: string, now: string, options: string[] = p.options?.filter((o) => o.default).map((o) => o.key) ?? []): CustomViewSpec {
  const extra = (p.options ?? []).filter((o) => options.includes(o.key)).map((o) => ({ ...o.rule, match: { ...o.rule.match } }));
  const spec = JSON.parse(JSON.stringify(p.spec)) as ViewPreset['spec'];
  return { ...spec, id, name: p.name, source: 'preset', presetKey: p.key, createdAt: now, updatedAt: now, visibility: [...spec.visibility, ...extra] };
}

/** Un préréglage ne contient que des clés portables (pas d'identifiant de nœud). */
export function isPortable(spec: Pick<CustomViewSpec, 'visibility' | 'box'>): boolean {
  return spec.visibility.every((r) => !r.match.nodeIds?.length) && !(spec.box?.moduleId);
}

/** Préréglage partagé tel qu'il est stocké (app_settings › plans.viewPresets). */
export interface SharedPresetRecord {
  key: string;
  name: string;
  description: string;
  /** vue portable (sans identifiant de nœud) */
  spec: unknown;
  disabled?: boolean;
  by?: string;
  at?: string;
}

/** Lecture tolérante des préréglages partagés (entrées illisibles écartées, clés en double écartées). */
export function cleanSharedPresetRecords(raw: unknown): SharedPresetRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SharedPresetRecord[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const key = typeof o.key === 'string' ? o.key.trim().slice(0, 80) : '';
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 200) : '';
    if (!key || !name || seen.has(key) || !o.spec || typeof o.spec !== 'object') continue;
    seen.add(key);
    const rec: SharedPresetRecord = { key, name, description: typeof o.description === 'string' ? o.description.slice(0, 400) : '', spec: o.spec };
    if (o.disabled === true) rec.disabled = true;
    if (typeof o.by === 'string') rec.by = o.by;
    if (typeof o.at === 'string') rec.at = o.at;
    out.push(rec);
  }
  return out;
}

/** Préréglage utilisable (null si sa vue est illisible). */
export function presetFromRecord(r: SharedPresetRecord, clean: (raw: unknown) => CustomViewSpec | null): ViewPreset | null {
  const spec = clean({ ...(r.spec as object), id: 'preset' });
  if (!spec) return null;
  const { id: _i, createdAt: _c, updatedAt: _u, source: _s, name: _n, presetKey: _p, updatedBy: _b, ...rest } = spec;
  return { key: r.key, name: r.name, description: r.description, spec: rest };
}

/**
 * Enregistre une vue comme préréglage partagé : seules les clés portables sont gardées (règles « cette pièce
 * seulement » et boîte « Entrer dans VBX-xx » retirées) ; `dropped` = règles retirées.
 */
export function presetRecordFromSpec(spec: CustomViewSpec, name: string, description: string, by: string, at: string, key?: string): { record: SharedPresetRecord; dropped: string[] } {
  const dropped = spec.visibility.filter((r) => r.match.nodeIds?.length).map((r) => r.label);
  const visibility = spec.visibility.filter((r) => !r.match.nodeIds?.length).map((r) => ({ ...r, source: 'preset' as const }));
  const { id: _i, createdAt: _c, updatedAt: _u, source: _s, name: _n, presetKey: _p, updatedBy: _b, box, ...rest } = spec;
  const portable = { ...rest, visibility, ...(box && !box.moduleId ? { box } : {}) };
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return { record: { key: key ?? `shared-${slug || 'vue'}`, name, description, spec: portable, by, at }, dropped };
}
