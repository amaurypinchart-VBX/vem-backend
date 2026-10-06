// Assemblages d'une Viewbox modifiée par l'étude (phase S10b). Les capacités de la bibliothèque (statico 24-0571,
// IDEA StatiCa) ne valent que pour le gabarit d'origine : dès qu'un profil ou une nuance dont un assemblage dépend
// change, l'assemblage prend un statut —
//   · « gabarit »   : rien de ce dont il dépend n'a changé, capacités de la bibliothèque ;
//   · « recalculé » : composants calculables (EN 1993-1-8 : pression diamétrale, poinçonnement, plat en flexion,
//                     paroi du poteau) recalculés avec le nouveau profil, avec leur formule ;
//   · « indicatif » : pas recalculable simplement (angle poteau / cadre à platines, moments IDEA StatiCa) mais
//                     comparable : capacité du gabarit réduite, jamais augmentée (règle prudente ci-dessous), verdict
//                     plafonné à « limite » ;
//   · « inconnu »   : plus de base de calcul (platine ou couvercle qui ne s'adapte plus au profil) : vérification
//                     bloquée tant qu'une capacité n'est pas saisie (« saisi », non vérifié, verdict plafonné aussi).
// Règle prudente de l'angle : M_Rd = M_Rd,gabarit · min(1 ; Wel,poteau / Wel,poteau gabarit ; tw,rive / tw,rive gabarit
// ; fy / fy gabarit). Fonctions pures ; N, mm.
import type { PlacedModule } from './assemble';
import { planOverlap } from './assemble';
import type { ConnectionSet } from './checks/joints';
import { connectionSet } from './checks/joints';
import type { Capacity, ConnectionEntry, LibraryEntry, SectionEntry, ViewboxTemplateParams } from './library';
import { designation } from './library';
import { materialByKey, steelStrength } from './materials';
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

export type JointStatus = 'template' | 'recalculated' | 'indicative' | 'unknown' | 'user';

export const JOINT_STATUS_LABEL: Record<JointStatus, string> = {
  template: 'valide (gabarit)',
  recalculated: 'recalculé',
  indicative: 'indicatif — à valider par un ingénieur',
  unknown: 'capacité inconnue',
  user: 'capacité saisie — non vérifiée',
};

/** Capacité saisie à la main pour un assemblage hors gabarit (stockée dans l'étude, avec son auteur). */
export interface UserCapacity {
  connection: string;
  key: string;
  value: number;
  modules?: string[];
  by?: string;
  at?: string;
  note?: string;
}

export interface JointRow {
  connection: string;
  name: string;
  modules: string[];
  status: JointStatus;
  /** ce qui a changé (dépendances) et pourquoi ce statut */
  reasons: string[];
  /** capacités avant / après (valeurs internes) */
  capacities: Array<{ key: string; label: string; before?: number; after?: number; unit: Capacity['unit'] }>;
  records: CalcRecord[];
  /** capacités à saisir quand le statut est « inconnu » */
  missing?: Array<{ key: string; label: string; unit: Capacity['unit'] }>;
}

export interface JointRevalidation {
  /** jeu d'assemblages propre à chaque Viewbox modifiée (les autres utilisent celui de la bibliothèque) */
  perModule: Record<string, ConnectionSet>;
  rows: JointRow[];
  /** plafond du verdict : un assemblage indicatif ou saisi → « limite » au mieux */
  cap: 'none' | 'limit';
  reasons: string[];
}

/** De quoi dépend chaque assemblage de la Viewbox. */
export const JOINT_DEPENDS: Record<string, string[]> = {
  'VBX-HORIZONTAL-BOLT': ['rives : épaisseur d’âme tw et nuance (pression diamétrale, poinçonnement)'],
  'VBX-VERTICAL-PLATE': ['rives : hauteur h (bras de levier du plat), épaisseur d’âme tw et nuance'],
  'VBX-VERTICAL-CONTACT': ['poteaux : dimensions extérieures (couvercle 100 × 100), épaisseur et nuance de la paroi'],
  'VBX-CORNER': ['poteaux : section et nuance (platines, 4 × M16 entraxe 110 mm)', 'rives : épaisseur d’âme et nuance'],
};

const GM0 = 1.0;
const GM1 = 1.1;
const GM2 = 1.25;
const f2 = (v: number, d = 2) => fmtNumber(v, d);
const kN = (v: number) => `${f2(v / 1e3)} kN`;
const cm = (v: number) => f2(v / 10, 2);
const kNcm2 = (v: number) => f2(v / 10, 1);

interface Prof {
  key: string;
  name: string;
  /** épaisseur de l'âme (profil ouvert) ou de la paroi (tube), hauteur, largeur */
  tw?: number;
  h?: number;
  b?: number;
  fy: number;
  fu: number;
  Wel: number;
}

function prof(sections: ReadonlyMap<string, SectionEntry>, key: string | undefined): Prof | null {
  if (!key) return null;
  const e = sections.get(key);
  const m = e ? materialByKey(e.material) : undefined;
  if (!e || !m) return null;
  const d = e.section.dims;
  const tw = e.section.shape === 'UNP' || e.section.shape === 'I' || e.section.shape === 'T' ? d.tw : d.t;
  const st = steelStrength(m, Math.max(d.t ?? 0, d.tf ?? 0, d.tw ?? 0));
  return { key, name: designation(e.section.name), tw, h: d.h ?? d.d, b: d.b ?? d.h ?? d.d, fy: st?.fy ?? 235, fu: st?.fu ?? 360, Wel: Math.min(e.section.Wely, e.section.Welz) };
}

const rimFloor = (p: ViewboxTemplateParams) => p.sections.rim;
const rimRoof = (p: ViewboxTemplateParams) => p.sections.rimRoof ?? p.sections.rim;

const get = (c: ConnectionEntry | undefined, key: string) => c?.capacities.find((x) => x.key === key);
const setCaps = (c: ConnectionEntry, values: Record<string, { value: number; formula?: string; label?: string }>, status: ConnectionEntry['status'], note: string): ConnectionEntry => ({
  ...c,
  status,
  capacities: c.capacities.map((x) => (values[x.key] ? { ...x, value: values[x.key].value, formula: values[x.key].formula ?? x.formula, label: values[x.key].label ?? x.label, source: { ref: 'study', note } } : x)),
  notes: [...(c.notes ?? []), note],
});

/** Viewbox du dessous d'une Viewbox empilée (au moins 2 angles en plan communs, niveau inférieur). */
function below(U: PlacedModule, modules: readonly PlacedModule[]): PlacedModule[] {
  const corners = (pm: PlacedModule) => {
    const { x0, x1, y0, y1 } = pm.params;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(([u, v]) => [pm.origin[0] + pm.u[0] * u + pm.v[0] * v, pm.origin[2] + pm.u[2] * u + pm.v[2] * v]);
  };
  const cu = corners(U);
  return modules.filter((L) => L.level === U.level - 1 && corners(L).filter((c) => cu.some((d) => Math.hypot(c[0] - d[0], c[1] - d[1]) <= 40)).length >= 2 && planOverlap(U, L) > 0.25);
}

export function revalidateJoints(inp: {
  modules: readonly PlacedModule[];
  original: ReadonlyMap<string, ViewboxTemplateParams>;
  sections: ReadonlyMap<string, SectionEntry>;
  library: readonly LibraryEntry[];
  user?: readonly UserCapacity[];
}): JointRevalidation {
  const base = connectionSet(inp.library);
  const perModule: Record<string, ConnectionSet> = {};
  const rows = new Map<string, JointRow>();
  const S = inp.sections;
  const P = (k: string | undefined) => prof(S, k);
  const changed = (a: string | undefined, b: string | undefined) => (a ?? '') !== (b ?? '');
  const userFor = (connection: string, module: string) => (inp.user ?? []).filter((u) => u.connection === connection && (!u.modules?.length || u.modules.includes(module)));

  const addRow = (module: string, r: Omit<JointRow, 'modules'>) => {
    const key = `${r.connection}|${r.status}|${r.reasons.join('|')}|${r.capacities.map((c) => `${c.key}:${Math.round(c.after ?? -1)}`).join(',')}`;
    const row = rows.get(key);
    if (row) row.modules.push(module);
    else rows.set(key, { ...r, modules: [module] });
  };

  for (const pm of inp.modules) {
    const o = inp.original.get(pm.id);
    if (!o) continue;
    const p = pm.params;
    const set: ConnectionSet = { ...base };
    let touched = false;
    const lowers = below(pm, inp.modules);

    // ─── boulons horizontaux : âme des rives (plancher et toiture de cette Viewbox) ───
    if (base.bolt && (changed(rimFloor(p), rimFloor(o)) || changed(rimRoof(p), rimRoof(o)))) {
      touched = true;
      const rims = [P(rimFloor(p)), P(rimRoof(p))];
      const c0 = base.bolt;
      const d = get(c0, 'd')?.value ?? 16;
      if (rims.some((r) => !r || !r.tw)) {
        set.bolt = { ...c0, status: 'unknown' };
        addRow(pm.id, { connection: c0.key, name: c0.name, status: 'unknown', reasons: ['rive sans épaisseur d’âme connue : pression diamétrale non calculable'], capacities: [], records: [] });
      } else {
        const tw = Math.min(...rims.map((r) => r!.tw!));
        const fu = Math.min(...rims.map((r) => r!.fu));
        const FbRd = (2.5 * 1.0 * fu * d * tw) / GM2;
        const dm = get(c0, 'BpRd')?.formula?.match(/π · ([\d,]+) cm/)?.[1];
        const dmm = dm ? parseFloat(dm.replace(',', '.')) * 10 : 25.4;
        const BpRd = (0.6 * Math.PI * dmm * tw * fu) / GM2;
        const note = `rives ${rims.map((r) => r!.name).join(' / ')} (tw ${f2(tw, 1)} mm, fu ${f2(fu, 0)} N/mm²)`;
        set.bolt = setCaps(
          c0,
          {
            FbRd: { value: FbRd, formula: `2,5 · 1,0 · ${kNcm2(fu)} kN/cm² · ${cm(d)} cm · ${cm(tw)} cm / 1,25`, label: `pression diamétrale dans l’âme tw ${f2(tw, 1)} mm` },
            BpRd: { value: BpRd, formula: `0,6 · π · ${cm(dmm)} cm · ${cm(tw)} cm · ${kNcm2(fu)} kN/cm² / 1,25` },
          },
          'known',
          `recalculé pour ${note}`,
        );
        addRow(pm.id, {
          connection: c0.key,
          name: c0.name,
          status: 'recalculated',
          reasons: [`${note}`],
          capacities: [
            { key: 'FbRd', label: 'pression diamétrale dans l’âme', before: get(c0, 'FbRd')?.value, after: FbRd, unit: 'N' },
            { key: 'BpRd', label: 'poinçonnement de l’âme', before: get(c0, 'BpRd')?.value, after: BpRd, unit: 'N' },
          ],
          records: [
            { key: `joint.bolt.Fb.${pm.id}`, title: `Boulons horizontaux — pression diamétrale (${pm.id})`, clause: 'DIN EN 1993-1-8 tab. 3.4', formula: 'Fb,Rd = k1 · αb · fu · d · t / γM2', withValues: `2,5 · 1,0 · ${kNcm2(fu)} · ${cm(d)} · ${cm(tw)} / 1,25 = ${kN(FbRd)}`, result: FbRd },
            { key: `joint.bolt.Bp.${pm.id}`, title: `Boulons horizontaux — poinçonnement (${pm.id})`, clause: 'DIN EN 1993-1-8 tab. 3.4', formula: 'Bp,Rd = 0,6 · π · dm · tp · fu / γM2', withValues: `0,6 · π · ${cm(dmm)} · ${cm(tw)} · ${kNcm2(fu)} / 1,25 = ${kN(BpRd)}`, result: BpRd },
          ],
        });
      }
    }

    // ─── plats d'empilement : rive du plancher de cette Viewbox et rive de toiture de celle du dessous ───
    const lowerRoof = lowers.map((L) => ({ L, o: inp.original.get(L.id) })).filter((x) => x.o);
    const plateChanged = changed(rimFloor(p), rimFloor(o)) || lowerRoof.some(({ L, o: lo }) => changed(rimRoof(L.params), rimRoof(lo!)));
    if (base.plate && pm.level > 0 && lowers.length && plateChanged) {
      touched = true;
      const c0 = base.plate;
      const rims = [P(rimFloor(p)), ...lowers.map((L) => P(rimRoof(L.params)))];
      if (rims.some((r) => !r || !r.tw || !r.h)) {
        set.plate = { ...c0, status: 'unknown' };
        addRow(pm.id, { connection: c0.key, name: c0.name, status: 'unknown', reasons: ['rive sans hauteur ou épaisseur d’âme connue'], capacities: [], records: [], missing: [{ key: 'HRd', label: 'effort horizontal par plat', unit: 'N' }] });
      } else {
        // plat 100 × 10 S235 L 400, boulons entraxe 290 mm : il s'appuie au dos de la rive, à h / 2 du boulon
        const tp = 10;
        const bp = 100;
        const d0 = 22;
        const e = 290;
        const fyp = 235;
        const hmin = Math.min(...rims.map((r) => r!.h!));
        const arm = e - hmin / 2;
        const Mnet = (((bp - d0) * tp * tp) / 4) * (fyp / GM0);
        const Mgross = ((bp * tp * tp) / 4) * (fyp / GM0);
        const HRd = (Mnet + Mgross) / arm;
        const tw = Math.min(...rims.map((r) => r!.tw!));
        const fu = Math.min(...rims.map((r) => r!.fu));
        const FbRd = (2.5 * 1.0 * fu * 20 * tw) / GM2;
        const note = `rives ${[...new Set(rims.map((r) => r!.name))].join(' / ')} (h ${f2(hmin, 0)} mm, tw ${f2(tw, 1)} mm)`;
        set.plate = setCaps(
          c0,
          {
            HRd: { value: HRd, formula: `(${f2(Mnet / 1e4, 2)} kNcm + ${f2(Mgross / 1e4, 2)} kNcm) / ${cm(arm)} cm` },
            FbRd_web: { value: FbRd, formula: `2,5 · 1,0 · ${kNcm2(fu)} kN/cm² · 2,0 cm · ${cm(tw)} cm / 1,25`, label: `pression diamétrale dans l’âme de la rive (tw ${f2(tw, 1)} mm)` },
          },
          'known',
          `recalculé pour ${note}`,
        );
        addRow(pm.id, {
          connection: c0.key,
          name: c0.name,
          status: 'recalculated',
          reasons: [note, `bras de levier du plat 290 − h / 2 = ${f2(arm, 0)} mm (gabarit 180 mm)`],
          capacities: [
            { key: 'HRd', label: 'effort horizontal par plat', before: get(c0, 'HRd')?.value, after: HRd, unit: 'N' },
            { key: 'FbRd_web', label: 'pression diamétrale dans l’âme', before: get(c0, 'FbRd_web')?.value, after: FbRd, unit: 'N' },
          ],
          records: [
            {
              key: `joint.plate.H.${pm.id}`,
              title: `Plats d’empilement — effort horizontal (${pm.id})`,
              clause: 'méthode statico 24-0571 § 3.9 (deux rotules plastiques)',
              formula: 'HRd = (Mpl,net + Mpl,brut) / (e − h / 2) ; Mpl = b · t² / 4 · fy / γM0',
              withValues: `(${f2(Mnet / 1e4, 2)} + ${f2(Mgross / 1e4, 2)}) kNcm / (29 − ${cm(hmin / 2)}) cm = ${kN(HRd)}`,
              result: HRd,
            },
          ],
        });
      }
    }

    // ─── contact vertical : paroi des poteaux (cette Viewbox et celle du dessous), couvercle 100 × 100 ───
    const colChanged = changed(p.sections.column, o.sections.column) || lowers.some((L) => changed(L.params.sections.column, inp.original.get(L.id)?.sections.column));
    if (base.contact && colChanged) {
      touched = true;
      const c0 = base.contact;
      const cols = [P(p.sections.column), ...lowers.map((L) => P(L.params.sections.column))];
      const sq = cols.every((c) => c && c.tw && c.b && Math.abs(c.b - 100) <= 1 && Math.abs((c.h ?? 0) - 100) <= 1);
      const u = userFor(c0.key, pm.id);
      if (!sq) {
        if (u.length) {
          set.contact = setCaps(c0, Object.fromEntries(u.map((x) => [x.key, { value: x.value }])), 'suggested', `capacité saisie par ${u[0].by ?? 'l’utilisateur'}`);
          addRow(pm.id, { connection: c0.key, name: c0.name, status: 'user', reasons: ['poteau de dimensions extérieures ≠ 100 × 100 : couvercle et larmier à redessiner', `capacité saisie (${u.map((x) => `${x.key} ${kN(x.value)}`).join(', ')}), non vérifiée`], capacities: u.map((x) => ({ key: x.key, label: x.key, after: x.value, unit: 'N' })), records: [] });
        } else {
          set.contact = { ...c0, status: 'unknown' };
          addRow(pm.id, { connection: c0.key, name: c0.name, status: 'unknown', reasons: ['poteau de dimensions extérieures ≠ 100 × 100 : couvercle 100 × 100 et larmier à redessiner'], capacities: [], records: [], missing: [{ key: 'NRd_weld', label: 'compression transmise par le contact (min. des composants)', unit: 'N' }] });
        }
      } else {
        const t = Math.min(...cols.map((c) => c!.tw!));
        const fy = Math.min(...cols.map((c) => c!.fy));
        const NRd = (2 * 100 * t * fy) / GM1;
        const note = `poteaux ${[...new Set(cols.map((c) => c!.name))].join(' / ')} (t ${f2(t, 1)} mm, fy ${f2(fy, 0)} N/mm²)`;
        set.contact = setCaps(c0, { NRd_wall: { value: NRd, formula: `2 · 10 cm · ${cm(t)} cm · ${kNcm2(fy)} kN/cm² / 1,1` } }, 'known', `recalculé pour ${note}`);
        addRow(pm.id, {
          connection: c0.key,
          name: c0.name,
          status: 'recalculated',
          reasons: [note],
          capacities: [{ key: 'NRd_wall', label: 'introduction dans la paroi du poteau', before: get(c0, 'NRd_wall')?.value, after: NRd, unit: 'N' }],
          records: [{ key: `joint.contact.${pm.id}`, title: `Contact vertical — paroi du poteau (${pm.id})`, clause: 'statico 24-0571 § 3.8', formula: 'NRd = 2 · b · t · fy / γM1', withValues: `2 · 10 · ${cm(t)} · ${kNcm2(fy)} / 1,1 = ${kN(NRd)}`, result: NRd }],
        });
      }
    }

    // ─── angle poteau / cadre (platines, 4 × M16, IDEA StatiCa) : indicatif, jamais augmenté ───
    const cornerChanged = changed(p.sections.column, o.sections.column) || changed(rimFloor(p), rimFloor(o)) || changed(rimRoof(p), rimRoof(o));
    if (base.corner && cornerChanged) {
      touched = true;
      const c0 = base.corner;
      const col = P(p.sections.column);
      const col0 = P(o.sections.column);
      const rims = [P(rimFloor(p)), P(rimRoof(p))];
      const rims0 = [P(rimFloor(o)), P(rimRoof(o))];
      const u = userFor(c0.key, pm.id);
      const fits = col && col0 && col.b && col0.b && Math.abs(col.b - col0.b) <= 1 && Math.abs((col.h ?? 0) - (col0.h ?? 0)) <= 1;
      if (!fits || rims.some((r) => !r?.tw) || rims0.some((r) => !r?.tw)) {
        if (u.length) {
          set.corner = setCaps(c0, Object.fromEntries(u.map((x) => [x.key, { value: x.value }])), 'suggested', `capacité saisie par ${u[0].by ?? 'l’utilisateur'}`);
          addRow(pm.id, { connection: c0.key, name: c0.name, status: 'user', reasons: ['poteau d’autres dimensions extérieures : platines et 4 × M16 à redessiner', `capacités saisies (${u.map((x) => x.key).join(', ')}), non vérifiées`], capacities: u.map((x) => ({ key: x.key, label: get(c0, x.key)?.label ?? x.key, before: get(c0, x.key)?.value, after: x.value, unit: get(c0, x.key)?.unit ?? 'N' })), records: [] });
        } else {
          set.corner = { ...c0, status: 'unknown' };
          addRow(pm.id, {
            connection: c0.key,
            name: c0.name,
            status: 'unknown',
            reasons: [col && col0 ? `poteau ${col.name} : dimensions extérieures ≠ ${col0.name}, platines et 4 × M16 (entraxe 110 mm) à redessiner` : 'section de poteau ou de rive inconnue'],
            capacities: [],
            records: [],
            missing: c0.capacities.filter((x) => x.unit === 'N·mm' || x.key === 'N').map((x) => ({ key: x.key, label: x.label, unit: x.unit })),
          });
        }
      } else {
        const ratios = [
          { what: 'Wel poteau', r: col!.Wel / col0!.Wel },
          { what: 'tw rive', r: Math.min(...rims.map((r) => r!.tw!)) / Math.min(...rims0.map((r) => r!.tw!)) },
          { what: 'fy poteau', r: col!.fy / col0!.fy },
        ];
        const k = Math.min(1, ...ratios.map((x) => x.r));
        const vals: Record<string, { value: number; formula: string }> = {};
        for (const key of ['M_biax', 'M_uniax_max', 'M_uniax_min', 'N']) {
          const c = get(c0, key);
          if (c) vals[key] = { value: c.value * k, formula: `${c.unit === 'N·mm' ? `${f2(c.value / 1e6, 1)} kNm` : kN(c.value)} · ${f2(k, 3)} (règle prudente hors gabarit)` };
        }
        set.corner = setCaps(c0, vals, 'suggested', `hors gabarit : capacités du gabarit × ${f2(k, 3)}, indicatives`);
        addRow(pm.id, {
          connection: c0.key,
          name: c0.name,
          status: 'indicative',
          reasons: [`${col!.name}, rives ${[...new Set(rims.map((r) => r!.name))].join(' / ')} : angle à platines non recalculable simplement`, `k = min(1 ; ${ratios.map((x) => `${x.what} ${f2(x.r, 3)}`).join(' ; ')}) = ${f2(k, 3)}`, 'raideur en rotation du gabarit (3 500 kNcm/°) gardée, non recalculée'],
          capacities: Object.entries(vals).map(([key, v]) => ({ key, label: get(c0, key)!.label, before: get(c0, key)!.value, after: v.value, unit: get(c0, key)!.unit })),
          records: [
            {
              key: `joint.corner.${pm.id}`,
              title: `Angle poteau / cadre hors gabarit (${pm.id})`,
              clause: 'règle prudente de l’outil (capacités IDEA StatiCa du gabarit, statico 24-0571 § 3.7)',
              formula: 'M_Rd = M_Rd,gabarit · min(1 ; Wel / Wel,gabarit ; tw / tw,gabarit ; fy / fy,gabarit)',
              withValues: `k = ${f2(k, 3)} → M biaxial ${f2((vals.M_biax?.value ?? 0) / 1e6, 2)} kNm, M uniaxial ${f2((vals.M_uniax_max?.value ?? 0) / 1e6, 2)} / ${f2((vals.M_uniax_min?.value ?? 0) / 1e6, 2)} kNm`,
            },
          ],
        });
      }
    }
    if (touched) perModule[pm.id] = set;
  }
  const all = [...rows.values()];
  const soft = all.filter((r) => r.status === 'indicative' || r.status === 'user');
  const hard = all.filter((r) => r.status === 'unknown');
  const reasons = [
    ...soft.map((r) => `${r.name} (${r.modules.join(', ')}) : ${JOINT_STATUS_LABEL[r.status]}`),
    ...hard.map((r) => `${r.name} (${r.modules.join(', ')}) : capacité inconnue hors gabarit — à saisir ou à faire valider`),
  ];
  return { perModule, rows: all, cap: soft.length ? 'limit' : 'none', reasons };
}
