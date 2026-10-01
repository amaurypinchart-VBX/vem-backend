// Barres en bois (EN 1995-1-1) : poteaux de surélévation, madriers… — section rectangulaire, compression ou traction
// avec flexion biaxiale et flambement (6.3.2, (6.23) / (6.24), βc 0,2 bois massif / 0,1 lamellé-collé, km 0,7), cisaillement
// avec kcr 0,67. kmod selon l'action la plus courte de la combinaison (classe de service 2) : permanente 0,6, exploitation
// 0,8, vent 0,9 ; γM 1,3 (bois massif) ou 1,25 (lamellé-collé). Déversement non vérifié (poteaux trapus). Fonction pure.
import type { Combination } from '../combos';
import type { CalcRecord } from '../records';
import { fmtNumber } from '../units';
import type { Ec3Result, SpanInput } from './ec3';

/** Module d'élasticité au fractile 5 % (EN 338 / EN 14080), sinon 2/3 du module moyen. */
const E005: Record<string, number> = { C24: 7400, GL24h: 9600 };

export function timberKmod(combo?: Pick<Combination, 'factors'>): number {
  const ids = (combo?.factors ?? []).filter(([, f]) => f).map(([id]) => id);
  if (ids.some((id) => id.startsWith('W'))) return 0.9;
  if (ids.some((id) => id.startsWith('Q'))) return 0.8;
  return 0.6;
}

const f2 = (v: number, d = 2) => fmtNumber(v, d);

export function checkTimberSpan(inp: SpanInput, combo: Pick<Combination, 'factors'> | undefined, detail = false): Ec3Result {
  const s = inp.section;
  const m = inp.material;
  const st = m.strength ?? {};
  const blocked = (reason: string): Ec3Result => ({ eta: Infinity, governing: 'bloqué', cls: 1, blocked: reason, records: [], parts: {}, method: 'classic' });
  if (!st.fmk || !st.fc0k || !st.ft0k || !st.fvk) return blocked(`${s.name} : résistances du bois ${m.name} incomplètes`);
  const glulam = m.key.startsWith('GL');
  const gammaM = glulam ? 1.25 : 1.3;
  const kmod = timberKmod(combo);
  const fd = (fk: number) => (kmod * fk) / gammaM;
  const [fmd, fc0d, ft0d, fvd] = [fd(st.fmk), fd(st.fc0k), fd(st.ft0k), fd(st.fvk)];
  const E05 = E005[m.key] ?? (2 / 3) * m.E;
  const betaC = glulam ? 0.1 : 0.2;
  const kc = (I: number) => {
    const i = Math.sqrt(I / s.A);
    const lrel = (inp.length / i / Math.PI) * Math.sqrt(st.fc0k! / E05);
    if (lrel <= 0.3) return { kc: 1, lrel };
    const k = 0.5 * (1 + betaC * (lrel - 0.3) + lrel * lrel);
    return { kc: 1 / (k + Math.sqrt(k * k - lrel * lrel)), lrel };
  };
  const ky = kc(s.Iy);
  const kz = kc(s.Iz);
  const km = 0.7;
  let worst = { eta: 0, x: 0, what: '', parts: {} as Record<string, number>, N: 0, My: 0, Mz: 0, V: 0 };
  for (const p of inp.stations) {
    const sm = Math.abs(p.My) / s.Wely / fmd;
    const sz = Math.abs(p.Mz) / s.Welz / fmd;
    let axial: number;
    let what: string;
    if (p.N < 0) {
      const sc = -p.N / s.A;
      axial = Math.max(sc / (ky.kc * fc0d) + sm + km * sz, sc / (kz.kc * fc0d) + km * sm + sz);
      what = 'compression + flexion (6.23 / 6.24)';
    } else {
      const t = p.N / s.A / ft0d;
      axial = Math.max(t + sm + km * sz, t + km * sm + sz);
      what = 'traction + flexion (6.17 / 6.19)';
    }
    const V = Math.hypot(p.Vy, p.Vz);
    const shear = (1.5 * V) / (0.67 * s.A) / fvd;
    const eta = Math.max(axial, shear);
    if (eta > worst.eta) worst = { eta, x: p.x, what: shear > axial ? 'cisaillement (6.13)' : what, parts: { axial, shear }, N: p.N, My: p.My, Mz: p.Mz, V };
  }
  const records: CalcRecord[] = detail
    ? [
        {
          key: `${inp.key}.ec5`,
          title: `${inp.label} — bois EN 1995-1-1`,
          clause: 'EN 1995-1-1 6.3.2 (6.23) / (6.24), 6.1.7',
          formula: 'σc / (kc fc,0,d) + σm,y / fm,d + km σm,z / fm,d ≤ 1 (et inversement) ; τ = 1,5 V / (kcr A) ≤ fv,d ; fd = kmod fk / γM',
          withValues: `${m.name}, kmod = ${f2(kmod, 1)}, γM = ${f2(gammaM)} ; fc,0,d = ${f2(fc0d)} N/mm², fm,d = ${f2(fmd)} N/mm² ; L = ${f2(inp.length / 1e3)} m, λrel,y = ${f2(ky.lrel)}, kc,y = ${f2(ky.kc)}, λrel,z = ${f2(kz.lrel)}, kc,z = ${f2(kz.kc)} ; N = ${f2(worst.N / 1e3)} kN, My = ${f2(worst.My / 1e6)} kNm, Mz = ${f2(worst.Mz / 1e6)} kNm, V = ${f2(worst.V / 1e3)} kN → ${f2(worst.eta)}`,
          eta: worst.eta,
          combination: inp.combination,
        },
      ]
    : [];
  return { eta: worst.eta, governing: worst.what || 'compression + flexion (6.23 / 6.24)', cls: 1, records, parts: worst.parts, method: 'classic' };
}
