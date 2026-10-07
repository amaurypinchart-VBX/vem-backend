// Assemblages Viewbox (§9.3), règles et capacités de la bibliothèque (relevées dans statico 24-0571 § 3.7–3.10) :
//   · angle poteau / cadre (VBX-CORNER) aux deux extrémités de chaque poteau : η = min(η₂ₐₓ, η₁ₐₓ),
//     η₂ₐₓ = max(|My|, |Mz|) / 8,0 kNm, η₁ₐₓ = max(max(|My|, |Mz|) / 11,5 ; min(|My|, |Mz|) / 3,3) ; traction ≤ 70 kN
//     par les boulons, compression par contact poteau / couvercle ≤ 176 kN ;
//   · liaison verticale entre Viewbox empilées (VBX-VERTICAL-PLATE, VBX-VERTICAL-CONTACT) : compression ≤ 176 kN par
//     angle ; soulèvement par les plats des demi-côtés extérieurs voisins (4 par grand côté, 2 par petit côté, faces
//     extérieures seulement), TRd = min(cisaillement M20, pression diamétrale plat / âme, section nette) ; glissement de
//     toute la Viewbox du dessus : (H − 0,1 · ΣRz) / (n · 5,81 kN) par direction (checkStackShear) ;
//   · boulons horizontaux (VBX-HORIZONTAL-BOLT, M16 × 150 classe 10.9 dans les écrous M20 soudés) : Fv / min(Fv,Rd ; Fb,Rd)
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

/** Liaison personnalisée entre Viewbox empilées (atelier des accessoires, S11) : résistances d'une pièce. */
export interface CustomJoint {
  key: string;
  name: string;
  /** pièces par angle ; remplace les plats d'origine (sinon s'y ajoute) */
  perCorner: number;
  replaces: boolean;
  /** résistance d'une pièce (N) : 0 = ne retient rien dans cette direction, null = données manquantes */
  uplift: number | null;
  slideLong: number | null;
  slideShort: number | null;
  status: 'recalculated' | 'indicative' | 'unknown';
  qualification: string;
  missing: string[];
}

export interface ConnectionSet {
  /**
   * type de structure personnalisé (S12) : nom du type, cité quand un assemblage manque — jamais de repli sur les
   * assemblages Viewbox (VBX-*)
   */
  typeName?: string;
  /** liaison personnalisée à la place (ou en plus) des plats d'empilement */
  custom?: CustomJoint;
  corner?: ConnectionEntry;
  contact?: ConnectionEntry;
  plate?: ConnectionEntry;
  bolt?: ConnectionEntry;
  jack?: ConnectionEntry;
  bracing?: ConnectionEntry;
  stairHook?: ConnectionEntry;
  stairLanding?: ConnectionEntry;
  stairJack?: ConnectionEntry;
}

export function connectionSet(library: readonly LibraryEntry[]): ConnectionSet {
  const get = (key: string) => library.find((e): e is ConnectionEntry => e.kind === 'connection' && e.key === key && !e.disabled);
  return {
    corner: get('VBX-CORNER'),
    contact: get('VBX-VERTICAL-CONTACT'),
    plate: get('VBX-VERTICAL-PLATE'),
    bolt: get('VBX-HORIZONTAL-BOLT'),
    jack: get('VBX-JACK'),
    bracing: get('VBX-BRACING'),
    stairHook: get('STAIR-HOOK-LANDING'),
    stairLanding: get('STAIR-LANDING-VBX'),
    stairJack: get('STAIR-JACK-LAYHER60'),
  };
}

const cap = (c: ConnectionEntry | undefined, key: string) => c?.capacities.find((x) => x.key === key)?.value;
const usable = (c: ConnectionEntry | undefined) => !!c && c.status !== 'unknown';
const minCapacity = (c: ConnectionEntry | undefined) => (c && c.capacities.length ? Math.min(...c.capacities.filter((x) => x.unit === 'N').map((x) => x.value)) : undefined);
const blocked = (reason: string): JointResult => ({ eta: Infinity, governing: 'bloqué', blocked: reason, parts: {} });
/** assemblage absent : message Viewbox, ou « capacité inconnue — <type> : <assemblage> » pour un type personnalisé */
const lacking = (c: ConnectionSet, what: string, viewbox: string): JointResult => blocked(c.typeName ? `Capacité inconnue — ${c.typeName} : ${what}` : viewbox);

/** Angle poteau / cadre, efforts à une extrémité du poteau. */
export function checkCorner(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const j = c.corner;
  const N0 = cap(j, 'N');
  const Mb = cap(j, 'M_biax');
  const M1 = cap(j, 'M_uniax_max');
  const M2 = cap(j, 'M_uniax_min');
  if (!usable(j) || !N0 || !Mb || !M1 || !M2) return lacking(c, 'angle poteau / cadre', 'Angle Viewbox (VBX-CORNER) : capacités absentes de la bibliothèque');
  const hi = Math.max(Math.abs(f.My), Math.abs(f.Mz));
  const lo = Math.min(Math.abs(f.My), Math.abs(f.Mz));
  const biax = hi / Mb;
  const uniax = Math.max(hi / M1, lo / M2);
  const etaM = Math.min(biax, uniax);
  const Ncontact = minCapacity(c.contact);
  const tension = f.N > 0;
  if (!tension && !Ncontact) return lacking(c, 'contact poteau / cadre en compression', 'Contact poteau / couvercle (VBX-VERTICAL-CONTACT) : capacité absente de la bibliothèque');
  const etaN = tension ? f.N / N0 : -f.N / Ncontact!;
  const eta = Math.max(etaM, etaN);
  return {
    eta,
    governing: etaM >= etaN ? (biax <= uniax ? 'M biaxial' : 'M uniaxial') : tension ? 'N traction' : 'N contact',
    parts: { biax, uniax, M: etaM, N: etaN },
    record: {
      key: `corner.${label}`,
      title: `Angle poteau / cadre — ${label}`,
      clause: j!.status === 'suggested' ? 'statico 24-0571 § 3.7 (ideaStatiCa) — capacités hors gabarit, indicatives' : 'statico 24-0571 § 3.7 (ideaStatiCa)',
      formula: `η = min(max(|My|, |Mz|) / ${f2(Mb / 1e6, 1)} kNm ; max(max(|My|, |Mz|) / ${f2(M1 / 1e6, 1)} kNm ; min(|My|, |Mz|) / ${f2(M2 / 1e6, 1)} kNm)) ; traction N / ${f2(N0 / 1e3, 0)} kN, compression N / ${Ncontact ? f2(Ncontact / 1e3, 0) : '—'} kN (contact)`,
      withValues: `My = ${kNm(f.My)}, Mz = ${kNm(f.Mz)}, N = ${kN(f.N)} ; η₂ₐₓ = ${f2(biax)}, η₁ₐₓ = ${f2(uniax)} → ${f2(etaM)} ; ηN = ${f2(etaN)}`,
      eta,
      combination,
    },
  };
}

/** Plats d'empilement de la bibliothèque : nombre par côté extérieur et résistance au soulèvement d'un plat. */
export function stackPlates(c: ConnectionSet): { perLong: number; perShort: number; TRd?: number; HRd?: number; mu?: number } {
  const parts = ['FvRd_M20', 'FbRd_plate', 'FbRd_web', 'NuRd_plate'].map((k) => cap(c.plate, k)).filter((v): v is number => v !== undefined && v > 0);
  return { perLong: cap(c.plate, 'perLongSide') ?? 2, perShort: cap(c.plate, 'perShortSide') ?? 2, TRd: parts.length ? Math.min(...parts) : undefined, HRd: cap(c.plate, 'HRd'), mu: cap(c.plate, 'mu') };
}

/** Plats repris par un angle au soulèvement : moitié des plats de chacun des deux côtés voisins, s'ils sont extérieurs. */
export function platesPerCorner(c: ConnectionSet, outer: { long: boolean; short: boolean } = { long: true, short: true }): { n: number; TRd?: number } {
  const p = stackPlates(c);
  return { n: (outer.long ? p.perLong / 2 : 0) + (outer.short ? p.perShort / 2 : 0), TRd: p.TRd };
}

/**
 * Liaison verticale à un angle entre une Viewbox et celle du dessus (barre de liaison d'angle) : compression par le
 * contact poteau / poteau, soulèvement par les plats des demi-côtés extérieurs voisins. L'effort horizontal est vérifié
 * pour toute la Viewbox (checkStackShear).
 */
export function checkVerticalLink(c: ConnectionSet, f: Forces, label: string, combination?: string, outer?: { long: boolean; short: boolean }): JointResult {
  if (c.custom) return checkCustomVerticalLink(c, c.custom, f, label, combination, outer);
  const NRd = minCapacity(c.contact);
  if (!usable(c.plate)) return lacking(c, 'liaison d’empilement', 'Plats de liaison verticale (VBX-VERTICAL-PLATE) : capacités absentes de la bibliothèque');
  if (!usable(c.contact) || !NRd) return lacking(c, 'contact vertical entre modules empilés', 'Contact vertical (VBX-VERTICAL-CONTACT) : capacité absente de la bibliothèque');
  const { n, TRd } = platesPerCorner(c, outer);
  const T = Math.max(0, f.N);
  const C = Math.max(0, -f.N);
  if (T > 1e3 && !TRd)
    return { ...blocked(`Liaison verticale ${label} tendue (${kN(f.N)}) : capacité des plats en traction non renseignée`), parts: { T: Infinity } };
  if (T > 1e3 && n <= 0)
    return {
      eta: Infinity,
      governing: 'T soulèvement sans plat',
      parts: { T: Infinity },
      record: {
        key: `vlink.${label}`,
        title: `Liaison verticale — ${label}`,
        clause: 'statico 24-0571 § 3.8–3.9',
        formula: 'soulèvement T / (n · TRd), n = plats des demi-côtés extérieurs de l’angle',
        withValues: `T = ${kN(T)} ; angle sans plat d’empilement (ses deux côtés sont contre d’autres Viewbox) : le soulèvement n’est retenu par rien`,
        eta: Infinity,
        combination,
      },
    };
  const etaN = C / NRd;
  // soulèvement ≤ 1 kN à un angle sans plat : négligé (comme le seuil ci-dessus), pas de division par zéro
  const etaT = T > 0 && TRd && n > 0 ? T / (n * TRd) : 0;
  const eta = Math.max(etaN, etaT);
  return {
    eta,
    governing: etaT > etaN ? 'T soulèvement' : 'N contact',
    parts: { N: etaN, T: etaT },
    record: {
      key: `vlink.${label}`,
      title: `Liaison verticale — ${label}`,
      clause: 'statico 24-0571 § 3.8–3.9, EN 1993-1-8 tab. 3.4',
      formula: 'compression Rz / NRd (contact) ; soulèvement T / (n · TRd), n = plats des demi-côtés extérieurs de l’angle',
      withValues: T > 0 && TRd && n > 0 ? `T = ${kN(T)} ; n = ${f2(n, 1)} plat(s), TRd = ${kN(TRd)} → ${f2(etaT)}` : `Rz = ${kN(C)} / ${kN(NRd)} = ${f2(etaN)}`,
      eta,
      combination,
    },
  };
}

/**
 * Glissement entre une Viewbox et celle du dessous (somme des 4 liaisons d'angle, dans les axes de la Viewbox du dessus) :
 * frottement acier / acier sous le poids, le reste par les plats des côtés extérieurs perpendiculaires à l'effort ; un
 * plat ne travaille que dans un sens (statico) → moitié des plats par sens.
 */
/** Liaison personnalisée à un angle : compression par le contact poteau / poteau, soulèvement par les pièces. */
function checkCustomVerticalLink(c: ConnectionSet, j: CustomJoint, f: Forces, label: string, combination?: string, outer?: { long: boolean; short: boolean }): JointResult {
  const NRd = minCapacity(c.contact);
  if (!usable(c.contact) || !NRd) return lacking(c, 'contact vertical entre modules empilés', 'Contact vertical (VBX-VERTICAL-CONTACT) : capacité absente de la bibliothèque');
  if (j.uplift === null) return blocked(`Liaison « ${j.name} » : résistance au soulèvement incomplète (${j.missing.slice(0, 3).join(' ; ')})`);
  const T = Math.max(0, f.N);
  const C = Math.max(0, -f.N);
  const plates = j.replaces ? { n: 0, TRd: 0 } : platesPerCorner(c, outer);
  const R = j.perCorner * j.uplift + (plates.n && plates.TRd ? plates.n * plates.TRd : 0);
  const etaN = C / NRd;
  const etaT = T > 1e3 ? (R > 0 ? T / R : Infinity) : 0;
  const eta = Math.max(etaN, etaT);
  return {
    eta,
    governing: etaT > etaN ? (R > 0 ? 'T soulèvement (liaison personnalisée)' : 'T soulèvement : rien ne retient') : 'N contact',
    parts: { N: etaN, T: etaT },
    record: {
      key: `vlink.${label}`,
      title: `Liaison verticale (« ${j.name} ») — ${label}`,
      clause: `méthode des composants, EN 1993-1-8 — ${j.qualification}`,
      formula: `compression Rz / NRd (contact) ; soulèvement T / (n · Rd,pièce${j.replaces ? '' : ' + plats d’origine'})`,
      withValues: T > 1e3 ? `T = ${kN(T)} ; ${f2(j.perCorner, 1)} pièce(s) × ${kN(j.uplift)}${plates.n ? ` + ${f2(plates.n, 1)} plat(s) × ${kN(plates.TRd ?? 0)}` : ''} = ${kN(R)} → ${f2(etaT)}` : `Rz = ${kN(C)} / ${kN(NRd)} = ${f2(etaN)}`,
      eta,
      combination,
    },
  };
}

/** « · groupe VBX-13, VBX-14 boulonnées entre elles » */
const groupText = (g?: StackGroup) => (g ? ` · groupe ${g.modules.join(', ')} boulonnées entre elles` : '');

/**
 * Effort horizontal laissé aux plats (ou pièces) après frottement μ · ΣRz, par direction. Résistances des deux
 * directions : reste = max(0, H − μ · ΣRz) réparti selon u et v au prorata (statico). Une direction sans plat
 * (côtés contre d'autres Viewbox) : le frottement la reprend entièrement (cercle de Coulomb, |Hv| ≤ μ · ΣRz) et
 * les plats de l'autre direction prennent le reste, |Hu| − √((μ · ΣRz)² − Hv²).
 */
function slideRest(Hu: number, Hv: number, F: number, RU: number, RV: number): { u: number; v: number; rest: number } {
  const [au, av] = [Math.abs(Hu), Math.abs(Hv)];
  const H = Math.hypot(au, av);
  const rest = Math.max(0, H - F);
  if (RU > 0 === RV > 0 || rest <= 0) return { u: H > 0 ? (au * rest) / H : 0, v: H > 0 ? (av * rest) / H : 0, rest };
  if (RU > 0) return av <= F ? { u: Math.max(0, au - Math.sqrt(F * F - av * av)), v: 0, rest } : { u: au, v: av - F, rest };
  return au <= F ? { u: 0, v: Math.max(0, av - Math.sqrt(F * F - au * au)), rest } : { u: au - F, v: av, rest };
}

/** Viewbox du dessus boulonnées entre elles qui glissent d'un bloc : nombre de petits / grands côtés extérieurs du groupe. */
export interface StackGroup {
  modules: string[];
  shortSides: number;
  longSides: number;
}

export function checkStackShear(c: ConnectionSet, sum: { Hu: number; Hv: number; C: number }, outer: Record<'u0' | 'u1' | 'v0' | 'v1', boolean>, label: string, combination?: string, group?: StackGroup): JointResult {
  if (c.custom) return checkCustomStackShear(c, c.custom, sum, outer, label, combination, group);
  const p = stackPlates(c);
  if (!usable(c.plate) || !p.HRd || p.mu === undefined) return lacking(c, 'liaison d’empilement', 'Plats de liaison verticale (VBX-VERTICAL-PLATE) : capacités absentes de la bibliothèque');
  // effort selon u (grand côté) : plats des petits côtés extérieurs ; selon v : plats des grands côtés extérieurs
  const [shortSides, longSides] = group ? [group.shortSides, group.longSides] : [(outer.u0 ? 1 : 0) + (outer.u1 ? 1 : 0), (outer.v0 ? 1 : 0) + (outer.v1 ? 1 : 0)];
  const nU = shortSides * p.perShort * 0.5;
  const nV = longSides * p.perLong * 0.5;
  const { u, v, rest } = slideRest(sum.Hu, sum.Hv, p.mu * sum.C, nU, nV);
  const one = (h: number, n: number) => (h <= 1 ? 0 : n > 0 ? h / (n * p.HRd!) : Infinity);
  const etaU = one(u, nU);
  const etaV = one(v, nV);
  const eta = Math.max(etaU, etaV);
  return {
    eta,
    governing: !Number.isFinite(eta) ? 'H sans plat dans cette direction' : etaU >= etaV ? 'H plats (petits côtés)' : 'H plats (grands côtés)',
    parts: { Hu: etaU, Hv: etaV },
    record: {
      key: `stack.${label}`,
      title: `Glissement entre Viewbox empilées — ${label}${groupText(group)}`,
      clause: 'statico 24-0571 § 3.8–3.9',
      formula: 'H = √(ΣHu² + ΣHv²) ; reste = max(0, H − μ · ΣRz) réparti selon u et v (direction sans plat : reprise par le frottement, cercle de Coulomb) ; Hu,reste / (nu · HRd), Hv,reste / (nv · HRd) ; n = moitié des plats des côtés extérieurs (un plat par sens)',
      withValues: `ΣHu = ${kN(sum.Hu)}, ΣHv = ${kN(sum.Hv)}, ΣRz = ${kN(sum.C)}, μ = ${f2(p.mu, 1)} ; reste ${kN(rest)} (Hu ${kN(u)}, Hv ${kN(v)}) ; nu = ${f2(nU, 1)}, nv = ${f2(nV, 1)} plat(s) de ${kN(p.HRd)} → ${f2(etaU)} / ${f2(etaV)}`,
      eta,
      combination,
    },
  };
}

/** Glissement entre Viewbox empilées avec une liaison personnalisée : pièces aux 4 angles (et plats s'ils restent). */
function checkCustomStackShear(c: ConnectionSet, j: CustomJoint, sum: { Hu: number; Hv: number; C: number }, outer: Record<'u0' | 'u1' | 'v0' | 'v1', boolean>, label: string, combination?: string, group?: StackGroup): JointResult {
  if (j.slideLong === null || j.slideShort === null) return blocked(`Liaison « ${j.name} » : résistance au glissement incomplète (${j.missing.slice(0, 3).join(' ; ')})`);
  const p = stackPlates(c);
  const mu = p.mu ?? 0.1;
  const pieces = 4 * j.perCorner * (group?.modules.length ?? 1);
  const [shortSides, longSides] = group ? [group.shortSides, group.longSides] : [(outer.u0 ? 1 : 0) + (outer.u1 ? 1 : 0), (outer.v0 ? 1 : 0) + (outer.v1 ? 1 : 0)];
  const plU = j.replaces || !p.HRd ? 0 : shortSides * p.perShort * 0.5 * p.HRd;
  const plV = j.replaces || !p.HRd ? 0 : longSides * p.perLong * 0.5 * p.HRd;
  const RU = pieces * j.slideLong + plU;
  const RV = pieces * j.slideShort + plV;
  const { u, v, rest } = slideRest(sum.Hu, sum.Hv, mu * sum.C, RU, RV);
  const one = (h: number, R: number) => (h <= 1 ? 0 : R > 0 ? h / R : Infinity);
  const etaU = one(u, RU);
  const etaV = one(v, RV);
  const eta = Math.max(etaU, etaV);
  return {
    eta,
    governing: !Number.isFinite(eta) ? 'H : rien ne retient dans cette direction' : etaU >= etaV ? 'H le long du grand côté (liaison personnalisée)' : 'H le long du petit côté (liaison personnalisée)',
    parts: { Hu: etaU, Hv: etaV },
    record: {
      key: `stack.${label}`,
      title: `Glissement entre Viewbox empilées (« ${j.name} ») — ${label}${groupText(group)}`,
      clause: `méthode des composants, EN 1993-1-8 — ${j.qualification}`,
      formula: `reste = max(0, H − μ · ΣRz) ; Hu,reste / (4 · n · Rd,u${j.replaces ? '' : ' + plats'}), Hv,reste / (4 · n · Rd,v${j.replaces ? '' : ' + plats'})`,
      withValues: `ΣHu = ${kN(sum.Hu)}, ΣHv = ${kN(sum.Hv)}, ΣRz = ${kN(sum.C)}, μ = ${f2(mu, 1)} ; reste ${kN(rest)} (Hu ${kN(u)}, Hv ${kN(v)}) ; ${f2(pieces, 0)} pièce(s) : Ru = ${kN(RU)}, Rv = ${kN(RV)} → ${f2(etaU)} / ${f2(etaV)}`,
      eta,
      combination,
    },
  };
}

/** Boulon horizontal entre deux Viewbox (barre équivalente : N traction +, cisaillements). */
export function checkBolt(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const FtB = cap(c.bolt, 'FtRd');
  const FvB = cap(c.bolt, 'FvRd');
  if (!usable(c.bolt) || !FtB || !FvB) return lacking(c, 'liaison entre modules côte à côte', 'Boulons horizontaux (VBX-HORIZONTAL-BOLT) : capacités absentes de la bibliothèque');
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
  if (!usable(c.bracing) || !NRd) return lacking(c, 'contreventement', 'Contreventement (VBX-BRACING) : capacités absentes de la bibliothèque');
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
  if (!spec) return lacking(c, 'pieds à vérin', 'Pieds à vérin (VBX-JACK) : tige non renseignée dans la bibliothèque');
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

/** Accroche d'un limon au palier (STAIR-HOOK-LANDING, statico 24-0569 § 3.2) : effort tranchant vertical / Vz,Rd. */
export function checkStairHook(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const VRd = cap(c.stairHook, 'VzRd');
  if (!usable(c.stairHook) || !VRd) return blocked('Accroche des limons (STAIR-HOOK-LANDING) : capacité absente de la bibliothèque');
  const V = Math.abs(f.Vz);
  const eta = V / VRd;
  return {
    eta,
    governing: 'Vz crochets',
    parts: { V: eta },
    record: {
      key: `stairhook.${label}`,
      title: `Accroche du limon — ${label}`,
      clause: 'statico 24-0569 § 3.2 (crochets 80 × 5 + 2 × M12-8.8)',
      formula: 'Vz,Ed / Vz,Rd ≤ 1 ; Vz,Rd = 8 cm · (0,5 cm)² / 4 · fy / γM0 · 4 / 8 cm',
      withValues: `N = ${kN(f.N)}, Vy = ${kN(f.Vy)}, Vz = ${kN(f.Vz)} ; ${kN(V)} / ${kN(VRd)} = ${f2(eta)}`,
      eta,
      combination,
    },
  };
}

/**
 * Attache du palier à la Viewbox (STAIR-LANDING-VBX, statico 24-0569 § 3.2) : par boulon M20, traction perpendiculaire
 * à la Viewbox plus effort tranchant le long du côté repris par le capot plié (excentricité 10,5 cm, bras 2 × 5 cm) :
 * FEd = N + V · 10,5 / 4 / (10 / 2) ≤ Ft,Rd (U 100 × 8) ; la compression passe par contact.
 */
export function checkStairLink(c: ConnectionSet, f: Forces, label: string, combination?: string): JointResult {
  const FtRd = cap(c.stairLanding, 'FtRd');
  if (!usable(c.stairLanding) || !FtRd) return blocked('Attache du palier (STAIR-LANDING-VBX) : capacité absente de la bibliothèque');
  const N = Math.max(0, f.N);
  const V = Math.abs(f.Vy);
  const F = N + (V * 105) / 4 / 50;
  const eta = F / FtRd;
  return {
    eta,
    governing: N >= F - N ? 'traction boulon' : 'effort le long du côté',
    parts: { N: N / FtRd, V: (F - N) / FtRd },
    record: {
      key: `stairlink.${label}`,
      title: `Attache du palier — ${label}`,
      clause: 'statico 24-0569 § 3.2 (2 × M20-8.8, capot 155 × 105 × 3 renforcé par un U 100 × 8)',
      formula: 'FEd = Nt,Ed + V∥,Ed · 10,5 cm / 4 / (10 cm / 2) ≤ Ft,Rd',
      withValues: `N = ${kN(f.N)}, V∥ = ${kN(f.Vy)} ; FEd = ${kN(N)} + ${kN(V)} · 10,5 / 4 / 5 = ${kN(F)} ≤ ${kN(FtRd)} → ${f2(eta)}`,
      eta,
      combination,
    },
  };
}

/**
 * Vérin Layher 60 sous un montant d'escalier (STAIR-JACK-LAYHER60, statico 18-0573 § 3.8.3) : sortie maxi h = 30 cm,
 * Lcr = 2 · (h − écrou), M = H · h ; N / (χ Npl,Rd) + kyy · M / Mpl,Rd ≤ 1 (6.3.3, annexe B, Cmy 0,9, courbe c).
 */
export function checkLayherJack(c: ConnectionSet, R: { N: number; H: number }, label: string, combination?: string, gammaM = 1.1): JointResult {
  const j = c.stairJack;
  const [A, Wpl, i, fy, nut, h] = ['A', 'Wpl', 'i', 'fy', 'nut', 'extensionMax'].map((k) => cap(j, k));
  if (!usable(j) || !A || !Wpl || !i || !fy || nut === undefined || !h) return blocked('Vérin Layher 60 (STAIR-JACK-LAYHER60) : données de la tige absentes de la bibliothèque');
  const Lcr = 2 * (h - nut);
  const lambda = Lcr / i / (Math.PI * Math.sqrt(E_STEEL / fy));
  const chi = bucklingReduction(lambda, 'c');
  const NRd = (A * fy) / gammaM;
  const MRd = (Wpl * fy) / gammaM;
  const N = Math.max(0, R.N);
  const M = R.H * h;
  const n = N / (chi * NRd);
  const kyy = Math.min(0.9 * (1 + (lambda - 0.2) * n), 0.9 * (1 + 0.8 * n));
  const eta = n + (kyy * M) / MRd;
  return {
    eta,
    governing: 'N + M flambement',
    parts: { N: n, M: M / MRd },
    record: {
      key: `stairjack.${label}`,
      title: `Vérin Layher 60 — ${label}`,
      clause: 'statico 18-0573 § 3.8.3 ; EN 1993-1-1 6.3.3 (6.61) annexe B',
      formula: 'Lcr = 2 · (h − h écrou) ; M = H · h ; N / (χ Npl,Rd) + kyy · M / Mpl,Rd ≤ 1, kyy = Cmy (1 + (λ̄ − 0,2) n), Cmy = 0,9',
      withValues: `h = ${f2(h / 10, 1)} cm, Lcr = ${f2(Lcr / 10, 1)} cm ; A = ${f2(A / 100)} cm², Wpl = ${f2(Wpl / 1000)} cm³, fy = ${f2(fy / 10)} kN/cm² ; Npl,Rd = ${kN(NRd)}, Mpl,Rd = ${f2(MRd / 1e4)} kNcm ; λ̄ = ${f2(lambda)}, χ = ${f2(chi)}, kyy = ${f2(kyy)} ; N = ${kN(N)}, H = ${kN(R.H)}, M = ${f2(M / 1e4)} kNcm ; ${f2(n)} + ${f2(kyy)} · ${f2(M / MRd)} = ${f2(eta)}`,
      eta,
      combination,
    },
  };
}
