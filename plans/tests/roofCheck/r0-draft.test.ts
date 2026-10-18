// R0 — brouillon de comptage des points de contrôle toiture sur les modèles réels présents (skipIf).
// Pas la détection finale (R2) : sert seulement à discuter des nombres avec Amaury.
// Lancer : ROOF_R0=1 ROOF_OUT=/chemin/r0.txt npx vitest run tests/roofCheck/r0-draft.test.ts
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES } from '../../src/core/classification';
import { makeLoadedScene } from '../../src/scene/loadedScene';

const ROOT = join(__dirname, '..', '..');
const FILES = [
  join(ROOT, '..', 'test-models', 'Qatar_Airways_2024_VEM_20261001-1529.zip'),
  join(ROOT, 'reference-reports', 'Xiaomi_Paris_2026_VEM_20260929-0951.zip'),
  join(ROOT, 'reference-reports', 'test_structurelle_VEM_20261001-1554.zip'),
  join(ROOT, 'reference-reports', 'loading', 'OACE_Ice_cube_Dusseldorf_VEM_20261002-1345.zip'),
  join(ROOT, 'reference-reports', 'loading', 'Sans_6055RKLOKVIE_Klokgebouw_Eindhoven_VEM_20261012-1021.zip'),
  join(ROOT, 'reference-reports', 'loading', '6059RFRAMVIE_4_Viewbox_2026_VEM_20261012-1022.zip'),
  join(ROOT, 'reference-reports', 'loading', '6060_Conainer_scania_VEM_20261012-1023.zip'),
  ...(process.env.ROOF_ZIP ? [process.env.ROOF_ZIP] : []),
].filter((f) => existsSync(f));

type P = [number, number];
interface Fp { id: string; level: number; c: P[]; top: number; len: number[] }
const GAP = 60, OVER = 200, MERGE = 50, COVER = 100;

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const norm = (a: P): P => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function inside(fp: Fp, p: P, margin = 0): boolean {
  // rectangle orienté : projections sur ses deux axes
  const o = fp.c[0], ex = sub(fp.c[1], o), ey = sub(fp.c[3], o);
  const lx = Math.hypot(...ex), ly = Math.hypot(...ey);
  const u = dot(sub(p, o), ex) / lx, v = dot(sub(p, o), ey) / ly;
  return u >= -margin && u <= lx + margin && v >= -margin && v <= ly + margin;
}

function analyse(fps: Fp[], upper: Fp[]) {
  const seams: { a: string; b: string; p: P; q: P; kind: 'long' | 'short'; dh: number }[] = [];
  const nearMiss: string[] = [];
  for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
    const A = fps[i], B = fps[j];
    for (let ea = 0; ea < 4; ea++) for (let eb = 0; eb < 4; eb++) {
      const a0 = A.c[ea], a1 = A.c[(ea + 1) % 4], b0 = B.c[eb], b1 = B.c[(eb + 1) % 4];
      const da = norm(sub(a1, a0)), db = norm(sub(b1, b0));
      if (dot(da, db) > -Math.cos(Math.PI / 180)) continue; // arêtes en vis-à-vis = sens opposés (contours dans le même sens)
      const n: P = [-da[1], da[0]];
      const gap = Math.abs(dot(sub(b0, a0), n));
      const t0 = 0, t1 = Math.hypot(...sub(a1, a0));
      const s0 = dot(sub(b0, a0), da), s1 = dot(sub(b1, a0), da);
      const lo = Math.max(t0, Math.min(s0, s1)), hi = Math.min(t1, Math.max(s0, s1));
      if (hi - lo < OVER) continue;
      if (gap > GAP) { if (gap <= 300) nearMiss.push(`${A.id}–${B.id} ${Math.round(gap)} mm`); continue; }
      const off: P = [n[0] * gap / 2 * Math.sign(dot(sub(b0, a0), n) || 1), n[1] * gap / 2 * Math.sign(dot(sub(b0, a0), n) || 1)];
      const p: P = [a0[0] + da[0] * lo + off[0], a0[1] + da[1] * lo + off[1]];
      const q: P = [a0[0] + da[0] * hi + off[0], a0[1] + da[1] * hi + off[1]];
      seams.push({ a: A.id, b: B.id, p, q, kind: A.len[ea] > 4000 ? 'long' : 'short', dh: Math.abs(A.top - B.top) });
    }
  }
  // nœuds = extrémités fusionnées
  const nodes: P[] = [];
  for (const s of seams) for (const e of [s.p, s.q]) if (!nodes.some((n) => dist(n, e) <= MERGE)) nodes.push(e);
  const R = 150;
  const covered = (p: P) => fps.some((f) => inside(f, p, GAP / 2));
  let cross = 0, tee = 0, end = 0, other = 0;
  const nodeCov: P[] = [];
  for (const n of nodes) {
    const touch = fps.filter((f) => inside(f, n, GAP)).length;
    const onContour = [...Array(8)].some((_, k) => !covered([n[0] + R * Math.cos(k * Math.PI / 4 + 0.2), n[1] + R * Math.sin(k * Math.PI / 4 + 0.2)]));
    if (touch >= 4) cross++; else if (touch === 3) tee++; else if (onContour) end++; else other++;
    if (upper.some((u) => inside(u, n, COVER))) nodeCov.push(n);
  }
  let outer = 0;
  for (const f of fps) for (const c of f.c) {
    const k = [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([sx, sy]) => covered([c[0] + sx * R, c[1] + sy * R])).length;
    if (k === 1) outer++;
  }
  const seamCov = seams.filter((s) => upper.some((u) => inside(u, [(s.p[0] + s.q[0]) / 2, (s.p[1] + s.q[1]) / 2], COVER))).length;
  return { seams, nodes, cross, tee, end, other, outer, seamCov, nodeCov: nodeCov.length, nearMiss };
}

describe.skipIf(FILES.length === 0 || !process.env.ROOF_R0)('R0 — premier comptage des points toiture sur les modèles réels', () => {
  for (const file of FILES) {
    it(file.split('/').pop()!, async () => {
      const buf = readFileSync(file);
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const res = await ingest({ fileName: 'm.zip', data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
      const pkg = await loadPackage(await exportPackage(res.root));
      const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
      const fps: Fp[] = [];
      const lines: string[] = [`\n=== ${file.split('/').pop()} — ${scene.index.modules.length} Viewbox, niveaux ${scene.index.levels.map((l) => `${l.level}:${l.moduleIds.length}`).join(' ')}`];
      for (const m of scene.index.modules) {
        const f = scene.frames.get(m.id);
        if (!f) { lines.push(`  ${m.id} sans repère (repli bbox)`); continue; }
        const w = (x: number, y: number, z: number) => [0, 1, 2].map((k) => f.origin[k] + x * f.xAxis[k] + y * f.yAxis[k] + z * f.up[k]);
        const cs = [[f.min[0], f.min[1]], [f.max[0], f.min[1]], [f.max[0], f.max[1]], [f.min[0], f.max[1]]].map(([x, y]) => w(x, y, f.min[2]));
        // contour dans le sens trigonométrique en plan (x, z) pour que les arêtes en vis-à-vis soient de sens opposés
        let c: P[] = cs.map((p) => [p[0], p[2]]);
        const area = c.reduce((s, p, i) => s + p[0] * c[(i + 1) % 4][1] - c[(i + 1) % 4][0] * p[1], 0);
        if (area < 0) c = [c[0], c[3], c[2], c[1]];
        const top = w(0, 0, f.max[2])[1];
        fps.push({ id: m.id, level: m.level, c, top, len: c.map((p, i) => dist(p, c[(i + 1) % 4])) });
        const ang = Math.atan2(f.xAxis[2], f.xAxis[0]) * 180 / Math.PI;
        lines.push(`  ${m.id} N${m.level} ${Math.round(f.max[0] - f.min[0])}×${Math.round(f.max[1] - f.min[1])} toit y=${Math.round(top)} angle ${Math.round(ang)}° origine (${Math.round(f.origin[0])}, ${Math.round(f.origin[2])})`);
      }
      const levels = [...new Set(fps.map((f) => f.level))].sort();
      for (const L of levels) {
        const here = fps.filter((f) => f.level === L), up = fps.filter((f) => f.level === L + 1);
        const r = analyse(here, up);
        const nl = r.seams.filter((s) => s.kind === 'long').length;
        lines.push(`  Toit N${L} : ${r.seams.length} jonctions (${nl} grand côté, ${r.seams.length - nl} petit côté) · ${r.cross} croisements · ${r.tee} T · ${r.end} extrémités · ${r.outer} angles ext.` +
          (r.other ? ` · ${r.other} nœuds non classés` : '') +
          (up.length ? ` — sous l'étage : ${r.seamCov} jonctions, ${r.nodeCov} nœuds` : '') +
          (r.nearMiss.length ? ` — écarts 60–300 mm : ${r.nearMiss.join(', ')}` : '') +
          (r.seams.some((s) => s.dh > 50) ? ` — hauteurs différentes : ${r.seams.filter((s) => s.dh > 50).map((s) => `${s.a}/${s.b} ${Math.round(s.dh)} mm`).join(', ')}` : ''));
        for (const s of r.seams) lines.push(`    ${s.a} | ${s.b} ${s.kind} ${Math.round(dist(s.p, s.q))} mm`);
      }
      console.log(lines.join("\n")); appendFileSync(process.env.ROOF_OUT ?? "/dev/null", lines.join("\n") + "\n");
    }, 600000);
  }
});
