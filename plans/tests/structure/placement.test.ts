// Plaques de calage en plan : vérins voisins sur une même plaque, plaques à fleur de la Viewbox (emprise efficace
// B' = B − 2 e de la plaque excentrée) ou centrées, minimum du Prüfbuch TÜV, documents de calage en anglais.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeCalage } from '../../src/structure/core/calage';
import { estimateReactions, gridModules } from '../../src/structure/core/estimate';
import { VIEWBOX_STOCK, bearingFrom, plateKey } from '../../src/structure/core/ground';
import { checkChain } from '../../src/structure/core/spreading';
import { flushCaps, plateGroups, platePlan, supportGeometry } from '../../src/structure/core/placement';
import { TUV_PLATES, tuvConformity } from '../../src/structure/core/tuv';
import { calagePlates, calageSheet } from '../../src/structure/report/calagePlan';
import { groundPointsPages } from '../../src/structure/report/groundPoints';
import { GroundSheetSvg } from '../../src/structure/report/groundSheet';
import { calageInput, DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';
import type { SpreadLayer } from '../../src/structure/core/ground';

const mods = gridModules(
  2,
  2,
  [
    [1, 1],
    [1, 1],
  ],
  false,
);
const hyp = { ...DEFAULT_HYP, bearingValue: 500, bearingUnit: 'kN/m²' as const };
const inp = calageInput(mods, hyp, { plates: [], commercial: [] }, true);
const ply = (side: number, t: number, n: number): SpreadLayer => ({ key: `p${side}`, label: `p ${side}`, l: side, w: side, t, n, material: 'birch', massKg: 1 });

describe('vérins voisins sur une même plaque', () => {
  const est = estimateReactions(mods, inp.estimate);
  const groups = plateGroups(est.reactions, mods, inp.estimate.groupTolerance);

  it('2 × 2 Viewbox : 4 vérins au centre = une plaque, 2 vérins aux jonctions de façade, 1 aux angles extérieurs', () => {
    const corner = groups.filter((g) => !g.reaction.group.middle).map((g) => g.members.length).sort();
    expect(corner).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 4]);
    // vérins centraux : les grands côtés communs portent deux vérins sur une plaque
    const middle = groups.filter((g) => g.reaction.group.middle).map((g) => g.members.length).sort();
    expect(middle).toEqual([1, 1, 1, 1, 2, 2]);
    expect(groups.filter((g) => g.members.length > 1 || g.reaction.group.jack).every((g) => /^C\d+$/.test(g.reaction.group.id))).toBe(true);
  });

  it('réactions additionnées combinaison par combinaison (ELU et ELS séparément)', () => {
    const big = groups.find((g) => g.members.length === 4)!;
    for (const cls of ['ULS', 'SLS'] as const) {
      const combos = big.reaction.combos!.filter((c) => c.cls === cls);
      for (const c of combos) {
        const sum = big.members.reduce((a, m) => a + m.combos!.find((x) => x.cls === cls && x.combo === c.combo)!.R, 0);
        expect(c.R).toBeCloseTo(sum, 6);
      }
    }
    expect(big.reaction.REd).toBeLessThanOrEqual(big.members.reduce((a, m) => a + m.REd, 0) + 1e-6);
    expect(big.reaction.REd).toBeGreaterThan(Math.max(...big.members.map((m) => m.REd)));
  });

  it('surface de contact = rectangle englobant les platines 15 × 15 cm ; plaque centrée sur la jonction de 4 Viewbox', () => {
    const big = groups.find((g) => g.members.length === 4)!;
    const geo = supportGeometry(big, mods);
    // angles des Viewbox à 20 mm, vérins à 155 mm des angles : 2 × 155 + 20 + 150 = 480 mm
    expect(geo.contact[0]).toBeCloseTo(480, 6);
    expect(geo.contact[1]).toBeCloseTo(480, 6);
    expect(geo.sides.map((s) => s.side)).toEqual(['both', 'both']);
    expect(flushCaps(geo).caps).toEqual([Infinity, Infinity]);
  });
});

describe('plaque à fleur de la Viewbox', () => {
  const est = estimateReactions(mods, inp.estimate);
  const groups = plateGroups(est.reactions, mods, inp.estimate.groupTolerance);
  // vérin de l'angle bas gauche (Viewbox VBX-01, angle (5, 5), vérin en (160, 160))
  const g1 = groups.find((g) => g.members.length === 1 && !g.reaction.group.middle && g.reaction.group.position[0] < 1000 && g.reaction.group.position[1] < 1000)!;
  const geo = supportGeometry(g1, mods);

  it('à l’angle extérieur : la plaque part de l’angle de la Viewbox, emprise efficace 2 × 15,5 = 31 cm', () => {
    const plan = platePlan(geo, 700, 700, 'flush');
    expect(plan.corners[0]).toEqual([5, 5]);
    expect(plan.corners[2]).toEqual([705, 705]);
    expect(plan.overhang).toBe(0);
    expect(plan.caps[0]).toBeCloseTo(310, 6);
    expect(plan.caps[1]).toBeCloseTo(310, 6);
    // centrée sous le vérin : dépasse de 35 − 15,5 = 19,5 cm
    expect(platePlan(geo, 700, 700, 'centered').overhang).toBeCloseTo(195, 6);
  });

  it('B’ = B − 2 e : 65,8 kN sur une plaque à fleur de 70 × 70 → 65,8 / 0,31² = 685 kN/m², quelle que soit la plaque', () => {
    const base = { Rzk: 65.8e3, REd: 83.7e3, contact: [150, 150] as [number, number], contactLabel: 'vérin', bearing: 0.5 };
    const caps = flushCaps(geo);
    for (const side of [700, 1000]) {
      const c = checkChain({ ...base, layers: [ply(side, 36, 3)], caps: caps.caps, edgeDist: caps.edgeDist });
      expect(c.pressure * 1e3).toBeCloseTo(65.8 / 0.31 ** 2, 0);
      expect(c.eta).toBeGreaterThan(1);
      expect(c.steps[1].note).toContain('à fleur de la Viewbox : charge à 15,5 cm du bord');
    }
    // centrée, la même plaque de 70 × 70 répartit sur toute sa surface
    const centred = checkChain({ ...base, layers: [ply(700, 36, 3)] });
    expect(centred.pressure * 1e3).toBeCloseTo(65.8 / 0.49, 0);
  });

  it('angle posé sans vérin : à fleur, aucune répartition (charge à 10,5 cm du bord) → automatique = plaque centrée', () => {
    const one = gridModules(1, 1, [[1]], false);
    const r = computeCalage({ ...calageInput(one, DEFAULT_HYP, { plates: [], commercial: [] }), placement: 'auto' });
    for (const c of r.checks) {
      expect(c.placement).toBe('centered');
      expect(c.eta).toBeLessThanOrEqual(1);
      expect(c.advice).toContain('plaque centrée sous l’appui, elle dépasse de');
    }
    const flush = computeCalage({ ...calageInput(one, DEFAULT_HYP, { plates: [], commercial: [] }), placement: 'flush' });
    for (const c of flush.checks) {
      expect(c.placement).toBe('flush');
      expect(c.eta).toBeGreaterThan(1);
    }
  });

  it('automatique avec vérins sur sol ferme : toutes les plaques à fleur, dessinées dans l’emprise des Viewbox', () => {
    const r = computeCalage({ ...inp, placement: 'auto' });
    expect(r.checks.every((c) => c.placement === 'flush' && c.eta <= 1)).toBe(true);
    const xs = mods.flatMap((m) => m.corners.map((p) => p[0]));
    const ys = mods.flatMap((m) => m.corners.map((p) => p[1]));
    for (const c of r.checks)
      for (const p of c.plan!.corners) {
        expect(p[0]).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6);
        expect(p[0]).toBeLessThanOrEqual(Math.max(...xs) + 1e-6);
        expect(p[1]).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6);
        expect(p[1]).toBeLessThanOrEqual(Math.max(...ys) + 1e-6);
      }
    // un point du plan des appuis par vérin, une plaque par appui de calage
    expect(r.estimate.reactions).toHaveLength(24);
    expect(r.checks).toHaveLength(15);
    expect(r.checks.flatMap((c) => c.members).sort()).toEqual(r.estimate.reactions.map((x) => x.group.id).sort());
  });

  it('choix par appui de calage (C…) : la plaque partagée garde son choix', () => {
    const r0 = computeCalage(inp);
    const big = r0.checks.find((c) => c.members.length === 4)!;
    const k100 = plateKey(VIEWBOX_STOCK.find((s) => s.length === 1000 && s.thickness === 36)!);
    const r = computeCalage({ ...inp, choices: { bySupport: { [big.id]: [{ plate: k100, n: 1 }] } } });
    const c = r.checks.find((x) => x.id === big.id)!;
    expect(c.source).toBe('support');
    expect(c.layerList[0].l).toBe(1000);
  });
});

describe('Prüfbuch TÜV 190060 B (statico 18-0573 § 3.9.1)', () => {
  it('plaques minimales par nombre de containers sur la plaque', () => {
    expect(TUV_PLATES.map((p) => [p.containers, p.side, ...p.t])).toEqual([
      [1, 700, 53, 38, 31],
      [2, 850, 40, 29, 24],
      [3, 1000, 61, 43, 35],
      [4, 1150, 78, 55, 45],
    ]);
  });

  it('conformité : taille et épaisseur par plaque ; tôle non comparable ; pied central non prévu', () => {
    expect(tuvConformity(1, false, [ply(700, 36, 3)])!.ok).toBe(true);
    expect(tuvConformity(1, false, [ply(700, 36, 2)])!.ok).toBe(false);
    expect(tuvConformity(2, false, [ply(1000, 36, 2)])!.ok).toBe(true);
    expect(tuvConformity(4, false, [ply(1000, 36, 3)])!.text).toContain('plaque 100 × 100 cm < 115 × 115 cm');
    expect(tuvConformity(1, false, [{ ...ply(500, 10, 1), material: 'steel' }])!.ok).toBeNull();
    expect(tuvConformity(0, true, [ply(400, 36, 1)])).toBeNull();
  });

  it('calage automatique : du stock conforme si possible ; portance < 200 kN/m² signalée hors Prüfbuch', () => {
    const r = computeCalage(inp);
    const one = r.types.find((t) => t.typeKey === '1')!;
    expect(one.tuv!.ok).toBe(true);
    expect(one.chosen!.summary).toMatch(/^3 × 70 × 70 × 36 mm/);
    // 4 containers : 115 × 115 cm requis, le stock s'arrête à 100 × 100
    expect(r.types.find((t) => t.typeKey === '4')!.tuv!.ok).toBe(false);
    expect(r.warnings.some((w) => w.includes('minimum du Prüfbuch 190060 B'))).toBe(true);
    const soft = computeCalage({ ...inp, bearing: bearingFrom(150, 'kN/m²') });
    expect(soft.tuv.bearingOk).toBe(false);
    expect(soft.warnings.some((w) => w.includes('Auflage 4.9'))).toBe(true);
    const off = computeCalage({ ...inp, tuvMinimum: false });
    expect(off.types.every((t) => t.tuv === null)).toBe(true);
  });
});

describe('documents de calage en anglais', () => {
  const r = computeCalage(inp);
  const FRENCH = /à fleur|vérin|centré|\bplaques?\b|\bappuis?\b|\bcalage\b|\bselon\b|\bsol\b|\bpar\b/i;

  it('plan de calage A3 : colonne de texte et étiquettes en anglais', () => {
    const structure = { baseY: 0, modules: [] };
    const plates = calagePlates(structure, r, 'en');
    expect(plates).toHaveLength(r.checks.length);
    const { sheet } = calageSheet({ lang: 'en', modelKey: 'm', include: [], plates, calage: r, bearing: { value: 500, label: 'firm ground' }, jacks: true, number: 'C 1' });
    const txt = sheet.items.filter((i) => i.type === 'text').map((i) => (i as { text: string }).text);
    expect(txt).toContain('REGULATORY REFERENCES (TÜV)');
    expect(txt.join(' ')).toContain('Prüfbuch (inspection book) no. 190060 B');
    for (const t of txt) expect(t).not.toMatch(FRENCH);
  });

  it('plan des appuis au sol et fiche de calage en anglais', () => {
    const pages = groundPointsPages({ modules: mods, estimate: r.estimate, roadway: r.roadway, checks: r.checks, bearingLabel: '500 kN/m²', lang: 'en', info: { project: 'P', source: 's', date: 'd', assumptions: [] } }).map((p) => renderToStaticMarkup(p));
    const all = pages.join(' ');
    for (const k of ['GROUND SUPPORT PLAN', 'REGULATORY REFERENCES (TÜV)', 'corner jack', 'Plate']) expect(all).toContain(k);
    const sheet = renderToStaticMarkup(createElement(GroundSheetSvg, { result: r, modules: mods, info: { project: 'P', source: 's', date: 'd', assumptions: [] }, lang: 'en' }));
    for (const k of ['PACKING SHEET', '5. Regulatory references (TÜV)', '6. Reservations', 'corner jacks on one plate']) expect(sheet).toContain(k);
    const texts = [...sheet.matchAll(/>([^<]+)</g)].map((m) => m[1]);
    for (const t of texts) expect(t).not.toMatch(FRENCH);
  });
});
