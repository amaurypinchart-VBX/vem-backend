// Pieds à vérin (tiges Tr 24 × 5 classe 10.9, sortie ≤ 5 cm, 6 par Viewbox) : vérification de la tige, calcul complet
// avec les 6 appuis, estimation instantanée et calage ; plaques de roulage (répartition uniforme) et plan des appuis
// au sol en PDF. GROUND_POINTS_PDF_OUT=/chemin.pdf pour garder le fichier.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sectionMap } from '../../src/structure/core/assemble';
import { computeCalage } from '../../src/structure/core/calage';
import { checkJack, connectionSet, jackSpec } from '../../src/structure/core/checks/joints';
import { estimateReactions, gridModules } from '../../src/structure/core/estimate';
import { planCoords, planOrigin, roadwayPressure } from '../../src/structure/core/roadway';
import { SEED } from '../../src/structure/library/seed';
import { groundPointsPages } from '../../src/structure/report/groundPoints';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import { FONT_FILE, buildPdf, fontsUsed } from '../../src/sheets/pdf/pdf';
import type { FontFiles, FontKey } from '../../src/sheets/pdf/pdf';
import { LOADS, vbx } from './studyHelpers';

const proto = (globalThis as unknown as { SVGElement: { prototype: Record<string, unknown> } }).SVGElement.prototype;
proto.getBBox ??= function (this: Element) {
  const size = parseFloat(this.getAttribute('font-size') ?? '16');
  return { x: 0, y: 0, width: (this.textContent ?? '').length * size * 0.5, height: size };
};
(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: () => null } } }).HTMLCanvasElement.prototype.getContext = () => null;

const fontDir = join(__dirname, '../../src/sheets/pdf/fonts');
function readFonts(keys: FontKey[]): FontFiles {
  const out: FontFiles = {};
  for (const k of keys) {
    const [family, variant] = k.split('-') as ['Gelasio' | 'Arimo', keyof typeof FONT_FILE];
    const b = readFileSync(join(fontDir, `${family}-${FONT_FILE[variant]}.ttf`));
    out[k] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  return out;
}

const texts = (svg: string) => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

describe('pieds à vérin', () => {
  const c = connectionSet(SEED);

  it('bibliothèque : tige Tr 24 × 5 classe 10.9, noyau 18,5 mm, sortie 5 cm, 6 par Viewbox', () => {
    expect(c.jack?.status).toBe('known');
    expect(jackSpec(c)).toEqual({ d: 24, d3: 18.5, fy: 900, extensionMax: 50, perModule: 6 });
  });

  it('tige en console : Lcr = 2 e, M = H · e, section et flambement (courbe c, Cm 0,9)', () => {
    const r = checkJack(c, { N: 30e3, H: 2e3 }, 50, 'VBX-01 · vérin d’angle 1', 'CO1');
    // A = 268,8 mm², Wel = 621,6 mm³, λ̄ = 0,451, χ = 0,870 ; section 0,333, flambement 0,341
    expect(r.parts.section).toBeCloseTo(0.33303, 4);
    expect(r.parts.buckling).toBeCloseTo(0.34121, 4);
    expect(r.eta).toBeCloseTo(0.34121, 4);
    expect(r.governing).toBe('N + M flambement');
    expect(r.record!.withValues).toContain('λ̄ = 0,45');
    expect(r.record!.withValues).toContain('χ = 0,87');
    // moins de sortie : moins de flexion
    expect(checkJack(c, { N: 30e3, H: 2e3 }, 20, 'x').eta).toBeLessThan(r.eta);
    // sortie au-delà de 5 cm refusée, vérin soulevé sans effort
    expect(checkJack(c, { N: 30e3, H: 2e3 }, 60, 'x').blocked).toContain('> 5,0 cm');
    expect(checkJack(c, { N: 0, H: 0 }, 50, 'x').eta).toBe(0);
    // vérin désactivé dans la bibliothèque : vérification bloquée
    expect(checkJack({ ...c, jack: undefined }, { N: 1, H: 0 }, 50, 'x').blocked).toContain('VBX-JACK');
  });

  const base: StudyInputs = {
    modules: [vbx('A', 0, 0), vbx('B', 5.9, 0)],
    edgeItems: [],
    pointItems: [],
    library: SEED,
    sections: sectionMap(SEED),
    loads: LOADS,
    middleFeet: false,
    sls: true,
    options: { ...CALC_DEFAULTS, jacks: true, friction: 0.6 },
    blocking: [],
  };

  it('calcul complet : 6 appuis par Viewbox, chaque tige vérifiée, verdict complet', async () => {
    const run = await runStudy(base, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    expect(run.structure.fem.supports).toHaveLength(12);
    const jacks = run.index.items.map((it, t) => ({ it, t })).filter(({ it }) => it.kind === 'jack');
    expect(jacks).toHaveLength(12);
    expect(jacks.filter(({ it }) => it.label.includes('vérin central'))).toHaveLength(4);
    for (const { t } of jacks) {
      const s = run.summary.states[t]!;
      expect(s.blocked).toBeUndefined();
      expect(s.eta).toBeGreaterThan(0.02);
      expect(s.eta).toBeLessThan(1);
      expect(s.records[0].title).toMatch(/^Vérin Tr 24 × 5/);
    }
    expect(run.verdict.families.some((f) => f.family === 'Pieds à vérin (tiges filetées)')).toBe(true);
    expect(run.verdict.reasons.some((r) => r.includes('VBX-JACK'))).toBe(false);
    expect(run.verdict.verdict).not.toBe('incomplete');
    // la sortie compte : 2 cm au lieu de 5 cm → tiges moins chargées
    const short = await runStudy({ ...base, options: { ...base.options, jackExtension: 20 } }, createInlineStudyRunner());
    const worst = (r: typeof run) => Math.max(...r.index.items.map((it, t) => (it.kind === 'jack' ? r.summary.states[t]!.eta : 0)));
    expect(worst(short)).toBeLessThan(worst(run));
    // réactions du calcul → calage : un vérin par appui, platine 15 × 15 cm
    expect(run.ground.groups).toHaveLength(12);
    expect(run.ground.groups.every((g) => g.jack)).toBe(true);
    const cal = computeCalage({ ...calageInput([], DEFAULT_HYP, { plates: [], commercial: [] }, true), reactions: run.ground });
    expect(cal.types.map((t) => t.label).sort()).toEqual(['vérin central', 'vérin d’angle']);
    expect(cal.types.every((t) => t.a1 === 150 && t.a2 === 150)).toBe(true);
    // charge verticale totale = combinaison ELS la plus lourde
    expect(run.ground.verticalK).toBeGreaterThan(0);
    expect(run.ground.verticalK!).toBeLessThanOrEqual(run.ground.reactions.reduce((s, r) => s + r.Rk, 0) + 1);
  }, 180000);

  it('estimation instantanée : 6 vérins par Viewbox, un angle partagé devient deux vérins, charges conservées', () => {
    const mods = gridModules(2, 1, [[1, 1]], false);
    const inp = calageInput(mods, DEFAULT_HYP, { plates: [], commercial: [] });
    const plain = estimateReactions(mods, { ...inp.estimate, middleFeet: true });
    const est = estimateReactions(mods, { ...inp.estimate, jacks: true });
    expect(est.groups).toHaveLength(12);
    expect(est.groups.filter((g) => g.middle)).toHaveLength(4);
    expect(est.groups.every((g) => g.jack && g.moduleIds.length === 1)).toBe(true);
    const sum = (e: typeof est) => e.reactions.reduce((s, r) => s + r.G + r.Q, 0);
    expect(sum(est)).toBeCloseTo(sum(plain), 3);
    // pieds d'angle décalés de 155 mm en diagonale, pieds centraux de 155 mm vers l'intérieur
    const p1 = est.groups.find((g) => !g.middle && g.moduleIds[0] === 'VBX-01' && g.position[0] < 1000 && g.position[1] < 1000)!;
    expect(p1.position[0]).toBeCloseTo(5 + 155, 6);
    expect(p1.position[1]).toBeCloseTo(5 + 155, 6);
    const m1 = est.groups.find((g) => g.middle && g.moduleIds[0] === 'VBX-01' && g.position[1] < 1000)!;
    expect(m1.position[0]).toBeCloseTo(2950, 6);
    expect(m1.position[1]).toBeCloseTo(5 + 155, 6);
    // calage : vérins d'angle et vérins centraux, chacun sur sa plaque
    const cal = computeCalage(calageInput(mods, DEFAULT_HYP, { plates: [], commercial: [] }, true));
    expect(cal.types.map((t) => t.label).sort()).toEqual(['vérin central', 'vérin d’angle']);
    expect(cal.warnings.some((w) => w.includes('platine 15 × 15 cm'))).toBe(true);
  });
});

describe('plaques de roulage et plan des appuis au sol', () => {
  // 3 × 2 Viewbox, deux niveaux sur 4 emprises
  const mods = gridModules(3, 2, [
    [2, 2, 1],
    [2, 2, 0],
  ], false);
  const inp = calageInput(mods, DEFAULT_HYP, { plates: [], commercial: [] });
  const est = estimateReactions(mods, inp.estimate);

  it('répartition uniforme = charge totale / surface couverte ; emprise empilée plus chargée', () => {
    const r = roadwayPressure(mods, est, 0.2);
    const area = 5 * 5900 * 2500;
    expect(r.area).toBe(area);
    expect(r.load).toBeCloseTo(est.totalG + est.totalQ, 6);
    expect(r.mean).toBeCloseTo((est.totalG + est.totalQ) / area, 12);
    expect(r.zones).toHaveLength(5);
    expect(r.max!.stack).toHaveLength(2);
    expect(r.max!.q).toBeGreaterThan(r.mean);
    const single = r.zones.find((z) => z.stack.length === 1)!;
    expect(single.q).toBeLessThan(r.max!.q);
    // la somme des charges des emprises couvre toutes les réactions
    expect(r.zones.reduce((s, z) => s + z.load, 0)).toBeCloseTo(est.reactions.reduce((s, x) => s + x.Rk, 0), 3);
    // poids des plaques ajouté à la pression (157 kg/m² ≈ 1,54 kN/m²)
    const steel = roadwayPressure(mods, est, 0.2, (157 * 9.81) / 1e6);
    expect((steel.mean - r.mean) * 1e3).toBeCloseTo(1.54, 2);
    expect(r.records.map((x) => x.key)).toEqual(['roadway.mean', 'roadway.max']);
    expect(r.etaMean).toBeCloseTo(r.mean / 0.2, 12);
  });

  it('repère d’implantation : origine en bas à gauche du plan, y vers le haut', () => {
    const o = planOrigin(mods);
    expect(o).toEqual({ x: 5, y: 2510 + 2500 - 5 });
    expect(planCoords([5, 2510 + 2500 - 5], o)).toEqual([0, 0]);
    expect(planCoords([5905, 5], o)).toEqual([5900, 5000]);
  });

  it('PDF A4 : plan, plaques de roulage, tableau des points avec coordonnées, pages de suite', async () => {
    const r = roadwayPressure(mods, est, 0.2);
    const info = { project: '26-0001 · Test', client: 'Client', source: 'Calage rapide', date: '30/09/2026', assumptions: [] };
    const pages = groundPointsPages({ modules: mods, estimate: est, roadway: r, info, bearingLabel: '200 kN/m² (prairie)' }).map((p) => renderToStaticMarkup(p));
    expect(pages).toHaveLength(1);
    const all = pages.flatMap(texts).join('\n');
    for (const t of ['PLAN DES APPUIS AU SOL', '1. Plan d’implantation', '2. Plaques de roulage', '3. Points d’appui', 'Pression uniforme', 'Emprise la plus chargée', 'x (m)', 'PRÉ-ÉTUDE INTERNE'])
      expect(all).toContain(t);
    for (const g of est.groups) expect(all).toContain(g.id);
    expect(all).not.toMatch(/NaN|undefined|Infinity/);
    expect(fontsUsed(pages).every((k) => k.startsWith('Arimo'))).toBe(true);
    // beaucoup de points (vérins, 30 Viewbox) : le tableau continue sur d'autres pages
    const big = gridModules(6, 5, Array.from({ length: 5 }, () => [1, 1, 1, 1, 1, 1]), false);
    const bigEst = estimateReactions(big, calageInput(big, DEFAULT_HYP, { plates: [], commercial: [] }, true).estimate);
    expect(bigEst.groups).toHaveLength(180);
    const many = groundPointsPages({ modules: big, estimate: bigEst, roadway: roadwayPressure(big, bigEst, 0.2), info, bearingLabel: '200 kN/m²' }).map((p) => renderToStaticMarkup(p));
    expect(many.length).toBeGreaterThan(2);
    const listed = many.flatMap(texts).filter((t) => /^[PM]\d+$/.test(t));
    for (const g of bigEst.groups) expect(listed).toContain(g.id);
    expect(texts(many[many.length - 1])).toContain(`${many.length} / ${many.length}`);
    const pdf = await buildPdf(
      pages.map((svg) => ({ svg, paper: 'A3' as const, size: { w: 210, h: 297 } })),
      readFonts(fontsUsed(pages)),
      { title: 'Plan des appuis au sol' },
    );
    expect(pdf.getNumberOfPages()).toBe(1);
    const out = process.env.GROUND_POINTS_PDF_OUT;
    if (out) writeFileSync(out, Buffer.from(pdf.output('arraybuffer')));
  });
});
