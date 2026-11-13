// Plan de contrôle de l'étanchéité de toiture : points trouvés sur des dispositions de Viewbox simples.
import { describe, expect, it } from 'vitest';
import { makeModuleFrame } from '../../src/core/views';
import type { ModuleFrame } from '../../src/core/views';
import { countByType, detectRoofPoints, roofBoxes } from '../../src/core/roofCheck/detect';

const H = 3080;

/** Viewbox w × d posée en plan sur [x, x + w] × [z, z + d] (tournée : grand côté le long de z). */
function vbx(id: string, x: number, z: number, level = 0, opts: { w?: number; d?: number; turned?: boolean } = {}) {
  const w = opts.w ?? 5900, d = opts.d ?? 2500;
  const frame: ModuleFrame = opts.turned
    // x local le long de +z, y local = up × x = +x monde
    ? makeModuleFrame(id, { xAxis: [0, 0, 1], yAxis: [1, 0, 0], up: [0, 1, 0], origin: [x, level * H, z] }, [0, 0, 0], [w, d, H])
    // x local le long de +x, y local = up × x = −z monde : origine sur le bord z + d
    : makeModuleFrame(id, { xAxis: [1, 0, 0], yAxis: [0, 0, -1], up: [0, 1, 0], origin: [x, level * H, z + d] }, [0, 0, 0], [w, d, H]);
  return { id, level, frame };
}

function detect(list: ReturnType<typeof vbx>[], labels: Record<string, string> = {}) {
  const frames = new Map(list.map((m) => [m.id, m.frame]));
  return detectRoofPoints(roofBoxes(list, frames, labels));
}

describe('points de contrôle de toiture', () => {
  it('une Viewbox seule : 4 angles', () => {
    const r = detect([vbx('VBX-01', 0, 0)]);
    expect(countByType(r.points)).toMatchObject({ 'seam-long': 0, 'outer-corner': 4, end: 0 });
    expect(r.levels).toHaveLength(1);
    expect(r.levels[0].boxes[0].c).toHaveLength(4);
  });

  it('deux Viewbox par le grand côté : 1 jonction, 2 extrémités, 4 angles', () => {
    const r = detect([vbx('VBX-01', 0, 0), vbx('VBX-02', 0, 2500 + 20)]);
    const c = countByType(r.points);
    expect(c).toMatchObject({ 'seam-long': 1, 'seam-short': 0, end: 2, 'outer-corner': 4, cross: 0, tee: 0 });
    const seam = r.points.find((p) => p.type === 'seam-long')!;
    expect(seam.lengthMm).toBe(5900);
    expect(seam.at.z).toBe(2510);
    expect(seam.key).toBe('seam|VBX-01|VBX-02');
    expect(seam.label).toContain('VBX-01 / VBX-02');
  });

  it('deux Viewbox bout à bout : jonction petit côté', () => {
    const r = detect([vbx('VBX-01', 0, 0), vbx('VBX-02', 5900, 0)]);
    expect(countByType(r.points)).toMatchObject({ 'seam-short': 1, end: 2, 'outer-corner': 4 });
  });

  it('carré de 4 : 4 jonctions, 1 croisement, 4 extrémités, 4 angles', () => {
    const r = detect([vbx('VBX-01', 0, 0), vbx('VBX-02', 5900, 0), vbx('VBX-03', 0, 2500), vbx('VBX-04', 5900, 2500)]);
    expect(countByType(r.points)).toMatchObject({ 'seam-long': 2, 'seam-short': 2, cross: 1, tee: 0, end: 4, 'outer-corner': 4 });
    const cross = r.points.find((p) => p.type === 'cross')!;
    expect([cross.at.x, cross.at.z]).toEqual([5900, 2500]);
    expect(cross.modules).toEqual(['VBX-01', 'VBX-02', 'VBX-03', 'VBX-04']);
  });

  it('décalées : jonction en T au milieu, extrémités aux angles rentrants', () => {
    // VBX-01 à cheval au-dessus de VBX-02 et VBX-03
    const r = detect([vbx('VBX-01', 2950, 0), vbx('VBX-02', 0, 2500), vbx('VBX-03', 5900, 2500)]);
    const c = countByType(r.points);
    expect(c.tee).toBe(1);
    expect(c.cross).toBe(0);
    expect(c['seam-long'] + c['seam-short']).toBe(3);
    expect(c.end).toBe(3); // 2 bouts de la jonction du haut (angles rentrants) + bas de VBX-02 / VBX-03
    expect(c['outer-corner']).toBe(6);
  });

  it('box presque jointives : pas de jonction, un avertissement', () => {
    const r = detect([vbx('VBX-01', 0, 0), vbx('VBX-02', 0, 2500 + 120)]);
    expect(countByType(r.points)['seam-long']).toBe(0);
    expect(r.warnings[0]).toMatch(/120 mm d’écart/);
  });

  it('Viewbox tournées (grand côté le long de z)', () => {
    const r = detect([vbx('VBX-01', 0, 0, 0, { turned: true }), vbx('VBX-02', 2500, 0, 0, { turned: true })]);
    expect(countByType(r.points)).toMatchObject({ 'seam-long': 1, end: 2, 'outer-corner': 4 });
  });

  it('étage : raccord du côté où le toit du dessous continue, jonction sous l’étage', () => {
    // VBX-01 + VBX-02 au rez, VBX-03 posée sur VBX-01 seulement
    const r = detect([vbx('VBX-01', 0, 0), vbx('VBX-02', 0, 2500), vbx('VBX-03', 0, 0, 1)]);
    const n0 = r.points.filter((p) => p.level === 0);
    const steps = n0.filter((p) => p.type === 'step');
    expect(steps).toHaveLength(1);
    expect(steps[0].modules).toEqual(['VBX-03', 'VBX-02']);
    expect(steps[0].lengthMm).toBeGreaterThan(5000);
    // le raccord longe la jonction VBX-01 / VBX-02 : sa pastille ne recouvre pas celle de la jonction
    const seam = n0.find((p) => p.type === 'seam-long')!;
    expect(Math.hypot(steps[0].at.x - seam.at.x, steps[0].at.z - seam.at.z)).toBeGreaterThanOrEqual(700);
    expect(steps[0].at.z).toBe(2500);
    // les angles de VBX-01 sont sous VBX-03
    expect(n0.filter((p) => p.type === 'outer-corner' && p.covered)).toHaveLength(2);
    expect(r.levels[0].above.map((b) => b.id)).toEqual(['VBX-03']);
    // niveau 1 : la box du dessus seule
    expect(countByType(r.points.filter((p) => p.level === 1))).toMatchObject({ 'outer-corner': 4, step: 0 });
    // à cheval : la jonction du rez passe sous l'étage
    const r2 = detect([vbx('VBX-01', 0, 0), vbx('VBX-02', 0, 2500), vbx('VBX-03', 0, 1250, 1)]);
    expect(r2.points.find((p) => p.type === 'seam-long')!.covered).toBe(true);
    expect(r2.points.filter((p) => p.type === 'step')).toHaveLength(2);
  });

  it('codes par niveau et par lettre, clés indépendantes des numéros affichés', () => {
    const list = [vbx('VBX-01', 0, 0), vbx('VBX-02', 5900, 0), vbx('VBX-03', 0, 2500), vbx('VBX-04', 5900, 2500)];
    const a = detect(list);
    const b = detect(list, { 'VBX-01': 'VBX-11', 'VBX-02': 'VBX-12' });
    expect(b.points.map((p) => p.key)).toEqual(a.points.map((p) => p.key));
    expect(b.points.find((p) => p.type === 'cross')!.label).toContain('VBX-11');
    expect(new Set(a.points.map((p) => p.key)).size).toBe(a.points.length);
    expect(a.points.filter((p) => p.type === 'seam-long' || p.type === 'seam-short').map((p) => p.code).sort()).toEqual(['N0-J01', 'N0-J02', 'N0-J03', 'N0-J04']);
    expect(a.points.map((p) => p.order)).toEqual(a.points.map((_, i) => i + 1));
  });
});
