// Contrôles en direct d'un type de structure personnalisé (atelier structure, S12) : structure complète (rives d'angle à
// angle), sections connues, barres non reliées, plancher, pré-contrôle de stabilité (le module seul sur ses pieds,
// 1 kN horizontal en tête selon u puis selon v, poids propre symbolique), données manquantes pour enregistrer. Pur.
import type { PlacedModule } from './assemble';
import { assembleStructure } from './assemble';
import { analyze } from './fem/analysis';
import type { LoadSet, Vec3 } from './fem/types';
import type { FrameRole, ModuleTypeEntry, SectionEntry, ViewboxTemplateParams } from './library';
import { materialByKey } from './materials';
import type { FrameParams } from './templates/frameModule';
import { frameTemplate } from './templates/frameModule';

export interface FrameCheck {
  /** bloquent l'enregistrement du type */
  errors: string[];
  /** à lire, n'empêchent pas d'enregistrer */
  warnings: string[];
  /** pré-contrôle de stabilité : 'ok', mécanisme (message clair) ou non fait (structure incomplète) */
  stability: { u: 'ok' | 'mechanism' | 'skipped'; v: 'ok' | 'mechanism' | 'skipped'; message?: string };
  /** barres porteuses dont une extrémité ne touche rien */
  unconnected: string[];
  /** données à renseigner pour que le calcul ne soit pas incomplet */
  missing: string[];
  /** nombre de barres porteuses par rôle */
  counts: Partial<Record<FrameRole, number>>;
}

const MECHANISM =
  'Avec ces angles et sans diagonale, la box n’est pas stable : choisir des angles soudés ou boulonnés, ou ajouter des diagonales.';

export function checkFrame(params: FrameParams, sections: ReadonlyMap<string, SectionEntry>, entry?: Pick<ModuleTypeEntry, 'footContact' | 'connections'>): FrameCheck {
  const out: FrameCheck = { errors: [], warnings: [], stability: { u: 'skipped', v: 'skipped' }, unconnected: [], missing: [], counts: {} };
  const fr = params.frame;
  const bars = fr.bars.filter((b) => b.role !== 'none');
  for (const b of bars) out.counts[b.role] = (out.counts[b.role] ?? 0) + 1;
  // sections
  for (const key of [...new Set(bars.map((b) => (b.grade ? `${b.section}@${b.grade}` : b.section)))]) {
    const s = sections.get(key);
    if (!s) out.errors.push(`Section ${key} inconnue : la choisir dans la bibliothèque ou le catalogue.`);
    else if (s.section.massless) out.errors.push(`Section ${s.section.name} : barre équivalente sans masse, pas une section de profil.`);
    else if (materialByKey(s.material)?.family === 'aluminium') out.warnings.push(`${s.section.name} en aluminium : non vérifié par l’outil (EN 1999), calcul incomplet.`);
  }
  if (!out.counts.column) out.errors.push('Aucun poteau.');
  if (!fr.deck.floor) out.missing.push('plancher (matériau, épaisseur, sens de portée)');
  if (!entry?.footContact) out.missing.push('surface d’appui d’un pied');
  const c = entry?.connections ?? {};
  if (fr.joints.column.model === 'semi' && !c.corner) out.missing.push('capacités des angles poteau / cadre boulonnés');
  if (fr.joints.column.model === 'semi' && !c.contact) out.missing.push('compression du poteau sur le cadre (contact)');
  if (fr.joints.side.model === 'bolts' && !c.bolt) out.missing.push('capacités des boulons entre modules côte à côte');
  if (!c.plate && !c.stackDesign) out.missing.push('liaison d’empilement (si des modules sont empilés)');
  if (fr.joints.column.model === 'rigid') out.warnings.push('Angles soudés : supposés pleine résistance, à justifier — verdict « limite » au mieux.');
  // gabarit (rives complètes d'angle à angle)
  let tpl: ReturnType<typeof frameTemplate> | null = null;
  try {
    tpl = frameTemplate(params);
  } catch (e) {
    out.errors.push((e as Error).message);
  }
  if (!tpl) return out;
  // barres non reliées : extrémité d'une barre qui ne touche aucune autre barre ni un pied
  const degree = new Map<string, number>();
  for (const m of tpl.members) for (const k of [m.i, m.j]) degree.set(k, (degree.get(k) ?? 0) + 1);
  const feet = new Set([...tpl.footNodes, ...tpl.middleFeet]);
  const loose = new Set([...degree].filter(([k, d]) => d === 1 && !feet.has(k)).map(([k]) => k));
  for (const m of tpl.members) if (loose.has(m.i) || loose.has(m.j)) out.unconnected.push(m.line);
  out.unconnected = [...new Set(out.unconnected)];
  if (out.unconnected.length) out.errors.push(`${out.unconnected.length} barre(s) non reliée(s) : ${out.unconnected.slice(0, 4).join(', ')}${out.unconnected.length > 4 ? '…' : ''}.`);
  if (out.errors.length || !sectionsOk(params, sections)) return out;
  // pré-contrôle de stabilité : module seul posé sur ses angles
  const pm: PlacedModule = { id: 'M', level: 0, origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], params: params as ViewboxTemplateParams, templateKey: 'TYPE' };
  try {
    const s = assembleStructure([pm], { sections, jacks: false, middleFeet: false, upliftReleases: 'vertical', calibration: false });
    const roof = s.fem.nodes.map((n, k) => ({ n, k })).filter(({ n }) => Math.abs(n.y - params.roofZ) < 1);
    const push = (dir: Vec3, id: string): LoadSet => ({ id, member: [], nodal: roof.map(({ k }) => ({ node: k, f: [(dir[0] * 1000) / roof.length, -1000, (dir[2] * 1000) / roof.length, 0, 0, 0] })) });
    for (const [axis, dir] of [
      ['u', [1, 0, 0]],
      ['v', [0, 0, -1]],
    ] as const) {
      try {
        const [r] = analyze(s.fem, [push(dir as Vec3, axis)], { secondOrder: false });
        const big = Math.max(...Array.from(r.displacements).map(Math.abs));
        out.stability[axis] = big > 1e4 ? 'mechanism' : 'ok';
      } catch {
        out.stability[axis] = 'mechanism';
      }
    }
    if (out.stability.u === 'mechanism' || out.stability.v === 'mechanism') {
      out.stability.message = MECHANISM;
      out.errors.push(MECHANISM);
    }
  } catch (e) {
    out.errors.push(`Assemblage du module : ${(e as Error).message}`);
  }
  return out;
}

const sectionsOk = (p: FrameParams, sections: ReadonlyMap<string, SectionEntry>) =>
  p.frame.bars.every((b) => b.role === 'none' || sections.has(b.grade ? `${b.section}@${b.grade}` : b.section)) &&
  [p.sections.cornerLink, p.sections.bolt, p.sections.contact].every((k) => sections.has(k));
