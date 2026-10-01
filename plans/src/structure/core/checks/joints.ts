// Assemblages Viewbox (§9.3), règles et capacités de la bibliothèque (relevées dans statico 24-0571 § 3.7–3.10) :
//   · angle poteau / cadre (VBX-CORNER) aux deux extrémités de chaque poteau : η = min(η₂ₐₓ, η₁ₐₓ),
//     η₂ₐₓ = max(|My|, |Mz|) / 8,0 kNm, η₁ₐₓ = max(max(|My|, |Mz|) / 11,5 ; min(|My|, |Mz|) / 3,3) ; traction ≤ 70 kN
//     par les boulons, compression par contact poteau / couvercle ≤ 176 kN ;
//   · liaison verticale entre Viewbox empilées (VBX-VERTICAL-PLATE, VBX-VERTICAL-CONTACT) : compression ≤ 176 kN ;
//     par angle, les plats des deux demi-côtés voisins (2 par grand côté, 1 par petit côté : 1 + 0,5 par angle) :
//     horizontal (H − 0,1 · Rz) / (n · 5,81 kN) dans chaque direction (un plat ne reprend que l'effort perpendiculaire
//     à son côté, frottement acier / acier), soulèvement T / (n · TRd) avec TRd = min(cisaillement M20, pression
//     diamétrale plat / âme, section nette) ;
//   · boulons horizontaux (VBX-HORIZONTAL-BOLT, M16 × 150 dans les trous M20) : Fv / min(Fv,Rd ; Fb,Rd)
//     + Ft / (1,4 · min(Ft,Rd ; Bp,Rd)) ≤ 1 et Ft ≤ min(Ft,Rd ; Bp,Rd) (DIN EN 1993-1-8 tab. 3.4) ;
//   · contreventements (VBX-BRACING, plat 60 × 6 + ridoir) : traction seule, N ≤ min des capacités (ridoir 39,8 kN) ;
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
  bracing?: ConnectionEntry;
}

export function connectionSet(library: readonly LibraryEntry[]): ConnectionSet {
  const get = (key: string) => library.find((e): e is ConnectionEntry => e.kind === 'connection' && e.key === key && !e.disabled);
  return { corner: get('VBX-CORNER'), contact: get('VBX-VERTICAL-CONTACT'), plate: get('VBX-VERTICAL-PLATE'), bolt: get('VBX-HORIZONTAL-BOLT'), jack: get('VBX-JACK'), bracing: get('VBX-BRACING') };
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

/** Plats d'empilement repris par un angle : moitié des plats de chaque côté voisin (défaut statico : 1 par direction). */
export function platesPerCorner(c: ConnectionSet): { alongU: number; alongV: number; TRd?: number } {
  const long = cap(c.plate, 'perLongSide');
  const short = cap(c.plate, 'perShortSide');
  const parts = ['FvRd_M20', 'FbRd_plate', 'FbRd_web', 'NuRd_plate'].map((k) => cap(c.plate, k)).filter((v): v is number => v !== undefined && v > 0);
  // effort selon u (grand côté) : plats des petits côtés ; selon v : plats des grands côtés
  return { alongU: short === undefined ? 1 : short / 2, alongV: long === undefined ? 1 : long / 2, TRd: parts.length ? Math.min(...parts) : undefined };
}

/**
 * Liaison verticale entre une Viewbox et celle du dessus (barre de liaison d'angle : N, cisaillements ; axe local z le
 * long du grand côté u de la Viewbox du dessus, y le long du petit côté v).
 */
export function checkVerticalLink(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const HRd = cap(c.plate, 'HRd');
  const mu = cap(c.plate, 'mu');
  const NRd = minCapacity(c.contact);
  if (!usable(c.plate) || HRd === undefined || mu === undefined) return blocked('Plats de liaison verticale (VBX-VERTICAL-PLATE) : capacités absentes de la bibliothèque');
  if (!usable(c.contact) || !NRd) return blocked('Contact vertical (VBX-VERTICAL-CONTACT) : capacité absente de la bibliothèque');
  const n = platesPerCorner(c);
  const T = Math.max(0, f.N);
  if (T > 1e3 && !n.TRd)
    return {
      ...blocked(`Liaison verticale ${label} tendue (${kN(f.N)}) : soulèvement de la Viewbox du dessus, capacité des plats en traction non renseignée`),
      parts: { N: Infinity },
    };
  const C = Math.max(0, -f.N);
  const Hu = Math.abs(f.Vz);
  const Hv = Math.abs(f.Vy);
  const cap1 = (H: number, count: number) => (count > 0 ? Math.max(0, H - mu * C) / (count * HRd) : H > 1e3 ? Infinity : 0);
  const etaU = cap1(Hu, n.alongU);
  const etaV = cap1(Hv, n.alongV);
  const etaH = Math.max(etaU, etaV);
  const etaN = C / NRd;
  const nT = n.alongU + n.alongV;
  const etaT = T > 0 && n.TRd ? T / (nT * n.TRd) : 0;
  // soulèvement : les boulons des plats travaillent aussi au cisaillement horizontal (somme prudente)
  const eta = Math.max(etaH + (T > 0 ? etaT : 0), etaN, etaT);
  const governing = etaT > 0 && etaT >= etaH ? 'T soulèvement' : etaH >= etaN ? (etaU >= etaV ? 'H plats (petits côtés)' : 'H plats (grands côtés)') : 'N contact';
  return {
    eta,
    governing,
    parts: { H: etaH, Hu: etaU, Hv: etaV, N: etaN, T: etaT },
    record: {
      key: `vlink.${label}`,
      title: `Liaison verticale — ${label}`,
      clause: 'statico 24-0571 § 3.8–3.9, EN 1993-1-8 tab. 3.4',
      formula: 'H : (H − μ · Rz) / (n · HRd) par direction (n = plats de l’angle) ; soulèvement T / (n · TRd) ; Rz / NRd (contact)',
      withValues:
        `Hu = ${kN(Hu)} (${f2(n.alongU, 1)} plat), Hv = ${kN(Hv)} (${f2(n.alongV, 1)} plat), Rz = ${kN(C)} ; (${kN(Hu)} − ${f2(mu, 1)} · ${kN(C)}) / (${f2(n.alongU, 1)} · ${kN(HRd)}) = ${f2(etaU)}, (${kN(Hv)} − ${f2(mu, 1)} · ${kN(C)}) / (${f2(n.alongV, 1)} · ${kN(HRd)}) = ${f2(etaV)} ; ${kN(C)} / ${kN(NRd)} = ${f2(etaN)}` +
        (T > 0 && n.TRd ? ` ; T = ${kN(T)} / (${f2(nT, 1)} · ${kN(n.TRd)}) = ${f2(etaT)}` : ''),
      eta,
      combination,
    },
  };
}

/** Boulon horizontal entre deux Viewbox (barre équivalente : N traction +, cisaillements). */
export function checkBolt(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const FtB = cap(c.bolt, 'FtRd');
  const FvB = cap(c.bolt, 'FvRd');
  if (!usable(c.bolt) || !FtB || !FvB) return blocked('Boulons horizontaux (VBX-HORIZONTAL-BOLT) : capacités absentes de la bibliothèque');
  const Fb = cap(c.bolt, 'FbRd');
  const Bp = cap(c.bolt, 'BpRd');
  const Fv = Fb ? Math.min(FvB, Fb) : FvB;
  const Ft = Bp ? Math.min(FtB, Bp) : FtB;
  const d = cap(c.bolt, 'd') ?? 20;
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
      title: `Boulon horizontal M${f2(d, 0)} — ${label}`,
      clause: 'DIN EN 1993-1-8 tab. 3.4',
      formula: 'Fv,Ed / min(Fv,Rd ; Fb,Rd) + Ft,Ed / (1,4 · min(Ft,Rd ; Bp,Rd)) ≤ 1 ; Ft,Ed ≤ min(Ft,Rd ; Bp,Rd)',
      withValues: `Fv,Ed = ${kN(v)}, Ft,Ed = ${kN(t)} ; ${kN(v)} / ${kN(Fv)} + ${kN(t)} / (1,4 · ${kN(Ft)}) = ${f2(inter)}`,
      eta,
      combination,
    },
  };
}

/** Diamètre des boulons horizontaux (affichage : « Boulons horizontaux M16 »). */
export function boltDiameter(c: ConnectionSet): number {
  return cap(c.bolt, 'd') ?? 20;
}

/** Contreventement en plat + ridoir : traction seule (barre tendue du modèle). */
export function checkBrace(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const NRd = minCapacity(c.bracing);
  if (!usable(c.bracing) || !NRd) return blocked('Contreventement (VBX-BRACING) : capacités absentes de la bibliothèque');
  const T = Math.max(0, f.N);
  const eta = T / NRd;
  return {
    eta,
    governing: 'N traction',
    parts: { N: eta },
    record: {
      key: `brace.${label}`,
      title: `Contreventement — ${label}`,
      clause: 'statico 24-0569 § 3.9',
      formula: 'N,Ed / NRd ≤ 1 ; NRd = min(section brute, section nette, pression diamétrale, ridoir, boulon)',
      withValues: `N,Ed = ${kN(T)} / ${kN(NRd)} = ${f2(eta)}`,
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
