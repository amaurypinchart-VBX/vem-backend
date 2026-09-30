// Assemblages Viewbox (§9.3), règles et capacités de la bibliothèque (relevées dans statico 24-0571 § 3.7–3.10) :
//   · angle poteau / cadre (VBX-CORNER) aux deux extrémités de chaque poteau : η = min(η₂ₐₓ, η₁ₐₓ),
//     η₂ₐₓ = max(|My|, |Mz|) / 8,0 kNm, η₁ₐₓ = max(max(|My|, |Mz|) / 11,5 ; min(|My|, |Mz|) / 3,3) ; traction ≤ 70 kN
//     par les boulons, compression par contact poteau / couvercle ≤ 176 kN ;
//   · liaison verticale entre Viewbox empilées (VBX-VERTICAL-PLATE, VBX-VERTICAL-CONTACT) : compression ≤ 176 kN,
//     η = (H − 0,1 · Rz) / 5,81 kN (un plat par sens, frottement acier / acier), traction : capacité non renseignée ⛔ ;
//   · boulons horizontaux M20-8.8 (VBX-HORIZONTAL-BOLT) : Fv / Fv,Rd + Ft / (1,4 Ft,Rd) ≤ 1 et Ft ≤ Ft,Rd
//     (DIN EN 1993-1-8 tab. 3.4 ; pression diamétrale dans l'âme tw 9 mm non déterminante selon statico § 3.10) ;
//   · pieds à vérin (VBX-JACK) : tige Tr 24 × 5 classe 10.9, noyau d3 = 18,5 mm, sortie e ≤ 50 mm, console encastrée
//     dans le pied et posée sur sa platine → Lcr = 2 · e, M = H · e ; section N / NRd + M / Mel,Rd ≤ 1 et flambement
//     N / (χ NRd) + k · M / Mel,Rd ≤ 1 (EN 1993-1-1 6.3.3, annexe B tab. B.1 classe 3, Cm = 0,9 mode à nœuds
//     déplaçables, courbe c des sections pleines), flexion élastique (acier de boulonnerie).
// Fonctions pures ; N, N·mm.
import type { ConnectionEntry, LibraryEntry } from '../library';
import type { CalcRecord } from '../records';
import { fmtNumber } from '../units';
import { bucklingReduction } from '../catalog';
import type { Forces } from './ec3';

export interface JointResult {
  eta: number;
  governing: string;
  blocked?: string;
  record?: CalcRecord;
  parts: Record<string, number>;
}

const f2 = (v: number, d = 2) => fmtNumber(v, d);
const kN = (v: number) => `${f2(v / 1e3)} kN`;
const kNm = (v: number) => `${f2(v / 1e6)} kNm`;

export interface ConnectionSet {
  corner?: ConnectionEntry;
  contact?: ConnectionEntry;
  plate?: ConnectionEntry;
  bolt?: ConnectionEntry;
  jack?: ConnectionEntry;
}

export function connectionSet(library: readonly LibraryEntry[]): ConnectionSet {
  const get = (key: string) => library.find((e): e is ConnectionEntry => e.kind === 'connection' && e.key === key && !e.disabled);
  return { corner: get('VBX-CORNER'), contact: get('VBX-VERTICAL-CONTACT'), plate: get('VBX-VERTICAL-PLATE'), bolt: get('VBX-HORIZONTAL-BOLT'), jack: get('VBX-JACK') };
}

const cap = (c: ConnectionEntry | undefined, key: string) => c?.capacities.find((x) => x.key === key)?.value;
const usable = (c: ConnectionEntry | undefined) => !!c && c.status !== 'unknown';
const minCapacity = (c: ConnectionEntry | undefined) => (c && c.capacities.length ? Math.min(...c.capacities.filter((x) => x.unit === 'N').map((x) => x.value)) : undefined);
const blocked = (reason: string): JointResult => ({ eta: Infinity, governing: 'bloqué', blocked: reason, parts: {} });

/** Angle poteau / cadre, efforts à une extrémité du poteau. */
export function checkCorner(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const j = c.corner;
  const N0 = cap(j, 'N');
  const Mb = cap(j, 'M_biax');
  const M1 = cap(j, 'M_uniax_max');
  const M2 = cap(j, 'M_uniax_min');
  if (!usable(j) || !N0 || !Mb || !M1 || !M2) return blocked('Angle Viewbox (VBX-CORNER) : capacités absentes de la bibliothèque');
  const hi = Math.max(Math.abs(f.My), Math.abs(f.Mz));
  const lo = Math.min(Math.abs(f.My), Math.abs(f.Mz));
  const biax = hi / Mb;
  const uniax = Math.max(hi / M1, lo / M2);
  const etaM = Math.min(biax, uniax);
  const Ncontact = minCapacity(c.contact);
  const tension = f.N > 0;
  if (!tension && !Ncontact) return blocked('Contact poteau / couvercle (VBX-VERTICAL-CONTACT) : capacité absente de la bibliothèque');
  const etaN = tension ? f.N / N0 : -f.N / Ncontact!;
  const eta = Math.max(etaM, etaN);
  return {
    eta,
    governing: etaM >= etaN ? (biax <= uniax ? 'M biaxial' : 'M uniaxial') : tension ? 'N traction' : 'N contact',
    parts: { biax, uniax, M: etaM, N: etaN },
    record: {
      key: `corner.${label}`,
      title: `Angle poteau / cadre — ${label}`,
      clause: 'statico 24-0571 § 3.7 (ideaStatiCa)',
      formula: 'η = min(max(|My|, |Mz|) / 8,0 kNm ; max(max(|My|, |Mz|) / 11,5 kNm ; min(|My|, |Mz|) / 3,3 kNm)) ; traction N / 70 kN, compression N / 176 kN (contact)',
      withValues: `My = ${kNm(f.My)}, Mz = ${kNm(f.Mz)}, N = ${kN(f.N)} ; η₂ₐₓ = ${f2(biax)}, η₁ₐₓ = ${f2(uniax)} → ${f2(etaM)} ; ηN = ${f2(etaN)}`,
      eta,
      combination,
    },
  };
}

/** Liaison verticale entre une Viewbox et celle du dessus (barre de liaison d'angle : N, cisaillements). */
export function checkVerticalLink(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const HRd = cap(c.plate, 'HRd');
  const mu = cap(c.plate, 'mu');
  const NRd = minCapacity(c.contact);
  if (!usable(c.plate) || HRd === undefined || mu === undefined) return blocked('Plats de liaison verticale (VBX-VERTICAL-PLATE) : capacités absentes de la bibliothèque');
  if (!usable(c.contact) || !NRd) return blocked('Contact vertical (VBX-VERTICAL-CONTACT) : capacité absente de la bibliothèque');
  if (f.N > 1e3)
    return {
      ...blocked(`Liaison verticale ${label} tendue (${kN(f.N)}) : soulèvement de la Viewbox du dessus, capacité en traction non renseignée`),
      parts: { N: Infinity },
    };
  const C = Math.max(0, -f.N);
  const H = Math.max(Math.abs(f.Vy), Math.abs(f.Vz));
  const etaH = Math.max(0, H - mu * C) / HRd;
  const etaN = C / NRd;
  const eta = Math.max(etaH, etaN);
  return {
    eta,
    governing: etaH >= etaN ? 'H plats' : 'N contact',
    parts: { H: etaH, N: etaN },
    record: {
      key: `vlink.${label}`,
      title: `Liaison verticale — ${label}`,
      clause: 'statico 24-0571 § 3.8–3.9',
      formula: 'η = (H − μ · Rz) / HRd (un plat par sens) ; Rz / NRd (contact)',
      withValues: `H = max(|Vy|, |Vz|) = ${kN(H)}, Rz = ${kN(C)} ; (${kN(H)} − ${f2(mu, 1)} · ${kN(C)}) / ${kN(HRd)} = ${f2(etaH)} ; ${kN(C)} / ${kN(NRd)} = ${f2(etaN)}`,
      eta,
      combination,
    },
  };
}

/** Boulon horizontal M20-8.8 entre deux Viewbox (barre équivalente : N traction +, cisaillements). */
export function checkBolt(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const Ft = cap(c.bolt, 'FtRd');
  const Fv = cap(c.bolt, 'FvRd');
  if (!usable(c.bolt) || !Ft || !Fv) return blocked('Boulons horizontaux (VBX-HORIZONTAL-BOLT) : capacités absentes de la bibliothèque');
  const t = Math.max(0, f.N);
  const v = Math.hypot(f.Vy, f.Vz);
  const inter = v / Fv + t / (1.4 * Ft);
  const tens = t / Ft;
  const eta = Math.max(inter, tens);
  return {
    eta,
    governing: inter >= tens ? 'V + T' : 'T',
    parts: { V: v / Fv, T: tens, VT: inter },
    record: {
      key: `bolt.${label}`,
      title: `Boulon horizontal M20-8.8 — ${label}`,
      clause: 'DIN EN 1993-1-8 tab. 3.4',
      formula: 'Fv,Ed / Fv,Rd + Ft,Ed / (1,4 · Ft,Rd) ≤ 1 ; Ft,Ed ≤ Ft,Rd',
      withValues: `Fv,Ed = ${kN(v)}, Ft,Ed = ${kN(t)} ; ${kN(v)} / ${kN(Fv)} + ${kN(t)} / (1,4 · ${kN(Ft)}) = ${f2(inter)}`,
      eta,
      combination,
    },
  };
}

/** Tige de vérin retenue : sortie maxi et nombre par Viewbox (bibliothèque VBX-JACK), pour l'affichage. */
export function jackSpec(c: ConnectionSet): { d: number; d3: number; fy: number; extensionMax: number; perModule: number } | null {
  const j = c.jack;
  const d3 = cap(j, 'd3');
  const fy = cap(j, 'fyb');
  const eMax = cap(j, 'extensionMax');
  if (!usable(j) || !d3 || !fy || !eMax) return null;
  return { d: cap(j, 'd') ?? 24, d3, fy, extensionMax: eMax, perModule: cap(j, 'perModule') ?? 6 };
}

const E_STEEL = 210000;

/**
 * Pied à vérin sous une réaction d'appui : N = réaction verticale (compression), H = réaction horizontale, sortie e.
 * La tige travaille en console (encastrée dans la douille du pied, posée sur la platine) : Lcr = 2 · e, M = H · e.
 */
export function checkJack(c: ConnectionSet, R: { N: number; H: number }, extension: number, label: string, combination?: string, gammaM = 1.1): JointResult {
  const spec = jackSpec(c);
  if (!spec) return blocked('Pieds à vérin (VBX-JACK) : tige non renseignée dans la bibliothèque');
  const e = extension;
  if (e > spec.extensionMax + 1e-6) return blocked(`Vérin ${label} : sortie ${f2(e / 10, 1)} cm > ${f2(spec.extensionMax / 10, 1)} cm autorisés`);
  const { d3, fy } = spec;
  const A = (Math.PI * d3 * d3) / 4;
  const W = (Math.PI * d3 ** 3) / 32;
  const i = d3 / 4;
  const Lcr = Math.max(2 * e, 1);
  const lambda = Lcr / i / (Math.PI * Math.sqrt(E_STEEL / fy));
  const chi = bucklingReduction(lambda, 'c');
  const NRd = (A * fy) / gammaM;
  const MRd = (W * fy) / gammaM;
  const N = Math.max(0, R.N);
  const M = R.H * e;
  const n = N / (chi * NRd);
  const Cm = 0.9;
  const k = Math.min(Cm * (1 + 0.6 * lambda * n), Cm * (1 + 0.6 * n));
  const section = N / NRd + M / MRd;
  const buckling = n + k * (M / MRd);
  const eta = Math.max(section, buckling);
  return {
    eta,
    governing: buckling >= section ? 'N + M flambement' : 'N + M section',
    parts: { section, buckling, N: N / NRd, M: M / MRd },
    record: {
      key: `jack.${label}`,
      title: `Vérin Tr ${f2(spec.d, 0)} × 5 — ${label}`,
      clause: 'EN 1993-1-1 6.2.1(7), 6.3.3 (6.61) annexe B',
      formula: 'noyau d3 : A = π d3²/4, Wel = π d3³/32 ; Lcr = 2 · e ; M = H · e ; N / NRd + M / MRd ≤ 1 ; N / (χ NRd) + k · M / MRd ≤ 1, k = Cm (1 + 0,6 λ̄ n), Cm = 0,9',
      withValues: `d3 = ${f2(d3, 1)} mm, fy = ${f2(fy, 0)} N/mm², e = ${f2(e / 10, 1)} cm ; A = ${f2(A, 0)} mm², Wel = ${f2(W, 0)} mm³ ; NRd = ${kN(NRd)}, MRd = ${f2(MRd / 1e3, 1)} kNmm ; λ̄ = ${f2(lambda)}, χ = ${f2(chi)} ; N = ${kN(N)}, H = ${kN(R.H)}, M = ${f2(M / 1e3, 1)} kNmm ; section ${f2(section)}, flambement ${f2(buckling)}`,
      eta,
      combination,
    },
  };
}
