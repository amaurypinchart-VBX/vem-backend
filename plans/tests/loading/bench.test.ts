// Bancs dorés de la loading liste : les 3 chantiers de référence (Klokgebouw, 6059, 6060). La topologie de chaque
// modèle est figée dans fixtures/<id>.topology.json (recalculée et comparée quand le .zip est dans
// reference-reports/loading ; LOADING_BENCH_WRITE=1 la réécrit), puis le moteur tourne avec la base de départ et les
// réponses du chantier, et la liste est comparée au bordereau. Les écarts connus sont listés, jamais forcés.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SiteAnswers, StudyInput } from '../../src/loading/core/answers';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';
import { SEED_OBSERVATIONS, SEED_RULES } from '../../src/loading/library/seed';
import { generate } from '../../src/loading/engine/generate';
import type { RealLine } from '../../src/loading/engine/compare';
import { compareLists } from '../../src/loading/engine/compare';
import { buildTopology } from '../../src/loading/topology/build';
import type { Topology } from '../../src/loading/topology/types';
import { canonical } from '../../src/loading/library/merge';

interface Bench {
  id: string;
  name: string;
  model: string;
  partial: boolean;
  productAnswers: Record<string, string>;
  answers: SiteAnswers;
  study: StudyInput;
  judgements: Record<string, number>;
  known: Record<string, string>;
  real: RealLine[];
}

const FIX = join(__dirname, 'fixtures');
const MODELS = join(__dirname, '..', '..', 'reference-reports', 'loading');
const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));
const bench = (id: string) => JSON.parse(readFileSync(join(FIX, `${id}.bench.json`), 'utf8')) as Bench;

async function topologyOf(b: Bench): Promise<Topology> {
  const snap = join(FIX, `${b.id}.topology.json`);
  const zip = existsSync(MODELS) ? readdirSync(MODELS).find((f) => f.includes(b.model) && f.endsWith('.zip')) : undefined;
  if (!zip) return JSON.parse(readFileSync(snap, 'utf8')) as Topology;
  const { ingest } = await import('../../src/ingest/pipeline');
  const { inlineRunner } = await import('../../src/ingest/cleanup');
  const { exportPackage, loadPackage } = await import('../../src/ingest/package');
  const { DEFAULT_RULES } = await import('../../src/core/classification');
  const { makeLoadedScene } = await import('../../src/scene/loadedScene');
  const buf = readFileSync(join(MODELS, zip));
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const res = await ingest({ fileName: zip, data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  const s = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
  // réponses « Qu'est-ce que c'est ? » du banc, données par libellé de la pièce
  const first = buildTopology({ index: s.index, frames: s.frames, catalogue: cat });
  const answers = Object.fromEntries(first.unknown.filter((u) => b.productAnswers[u.label]).map((u) => [u.signature, b.productAnswers[u.label]]));
  const t = buildTopology({ index: s.index, frames: s.frames, catalogue: cat, answers });
  const text = JSON.stringify(t, null, 1);
  if (process.env.LOADING_BENCH_WRITE || !existsSync(snap)) writeFileSync(snap, text);
  else expect(canonical(JSON.parse(text)), `${b.id}.topology.json périmé (LOADING_BENCH_WRITE=1 pour le réécrire)`).toBe(canonical(JSON.parse(readFileSync(snap, 'utf8'))));
  return t;
}

async function run(id: string) {
  const b = bench(id);
  const topology = await topologyOf(b);
  const list = generate({ topology, rules: SEED_RULES, catalogue: cat, answers: b.answers, study: b.study, observations: SEED_OBSERVATIONS, judgements: b.judgements });
  const cmp = compareLists(list, b.real, { partial: b.partial, known: b.known });
  if (process.env.LOADING_BENCH_LOG)
    console.log(
      `${b.name} : ${cmp.score}\n` +
        cmp.gaps
          .filter((g) => g.kind !== 'identique')
          .map((g) => `  ${g.kind.padEnd(16)} ${g.article} prédit ${g.predicted ?? '—'} / réel ${g.real ?? '—'} [${g.status ?? ''}]${g.known ? ` — connu : ${g.known}` : ''}`)
          .join('\n'),
    );
  return { b, list, cmp };
}

describe.skipIf(!existsSync(join(FIX, 'klokgebouw.bench.json')))('bancs dorés', () => {
  it('Klokgebouw 6055RKLOKVIE / 00055 : 39 lignes sur 39', async () => {
    const { list, cmp } = await run('klokgebouw');
    expect(cmp.score).toBe('39 / 39 lignes reproduites');
    expect(cmp.gaps.filter((g) => g.kind === 'prediction_seule')).toEqual([]);
    // le détail du calcul se lit
    const v = list.lines.find((l) => l.article === '4-700-065')!;
    expect(v.detail).toBe('8 / box × 2 box (I1 1 + I2 1) = 16 · + 20 % arrondi au-dessus → 20');
    expect(list.lines.find((l) => l.article === '4-740-001')!.detail).toBe('2 / plaque de l’étude × 24 plaques 40 × 40 cm de l’étude = 48');
  }, 180000);

  it('6059RFRAMVIE / 00056 : box connectées, couvertes, 3 airco, double porte', async () => {
    const { cmp, list } = await run('6059');
    const bad = cmp.gaps.filter((g) => (g.kind === 'moins' || g.kind === 'reel_seul') && !g.known);
    expect(bad, JSON.stringify(bad)).toEqual([]);
    expect(cmp.identical).toBeGreaterThanOrEqual(29);
    // régime connecté : les règles de box seules ne s'appliquent pas, valeurs observées en repère
    const v = list.lines.find((l) => l.article === '4-700-065')!;
    expect(v.status).toBe('regle_manquante');
    expect(v.detail).toContain('observé 6059RFRAMVIE : 25');
  }, 180000);

  it('6060RIAAHVIE / 00058 : 2 îlots de 2, vitrage 10 mm, charge lourde, montage atelier (jugements)', async () => {
    const { cmp, list } = await run('6060');
    const bad = cmp.gaps.filter((g) => (g.kind === 'moins' || g.kind === 'reel_seul') && !g.known);
    expect(bad, JSON.stringify(bad)).toEqual([]);
    expect(cmp.identical).toBeGreaterThanOrEqual(17);
    // régime 10 mm seul : rien du régime 8.8.2
    expect(list.lines.some((l) => ['4-700-061', '4-700-073'].includes(l.article) && l.qty)).toBe(false);
    expect(list.lines.find((l) => l.article === '7-632-017')).toMatchObject({ qty: 0, status: 'jugement' });
  }, 180000);
});
