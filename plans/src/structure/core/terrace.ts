// Éléments terrasse Viewbox (5,9 × 2,5 m, sans toiture) d'après le calcul de type statico 18-0573 § 3.5 et § 3.9.3
// (et 24-0571 § 3.7) : rives en U plié 200 × 80 × 4 S275, solives bois 150 × 50 à 53 cm d'entraxe portant sur 2,5 m,
// platelage contreplaqué 18 mm (trois travées, ≤ 60 cm) ou Twinson (Z-10.9-599).
//   · posé au sol (rez-de-chaussée, 5,0 kN/m²) : appuis aux 4 angles et au milieu des grands côtés, rives en poutres à
//     deux travées ; ses appuis s'ajoutent au calage (pieds « T » et « TM ») ;
//   · posé sur la toiture d'une Viewbox (étage, 3,5 kN/m²) : appui continu sur les rives de toiture de la Viewbox du
//     dessous ; son poids et son public sont des charges du calcul complet (`LoadInputs.roofTerraces`) et sa rive
//     reprend sa part du moment selon les raideurs (statico 18-0573 § 3.5.1 : U 200 et UNP 220 travaillent ensemble).
// Fonctions pures ; N, mm, N/mm².
import type { PlacedModule } from './assemble';
import type { ElementChecks } from './checks/facade';
import { coldFormedU } from './catalog';
import type { AddedSupport, P2 } from './estimate';
import { materialByKey } from './materials';
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

export interface PlacedTerrace {
  id: string;
  label: string;
  kind: 'roof' | 'ground';
  /** Viewbox du dessous (terrasse posée sur sa toiture) */
  module?: string;
  /** 4 angles en plan (x, z du monde, mm) */
  corners: P2[];
  length: number;
  width: number;
}

/** Données de l'élément terrasse (statico 18-0573 § 3.5). */
export const TERRACE = {
  long: 5900,
  short: 2500,
  /** poids propre (cadre, solives) et platelage (N/mm²) : < 50 + 50 kg/m² (§ 3.5.1), 100 kg/m² pour les solives (§ 3.5.3) */
  selfWeight: 0.5e-3,
  deck: 0.5e-3,
  rim: { label: 'U plié 200 × 80 × 4 (S275)', h: 200, b: 80, t: 4, fy: 275 },
  joist: { label: 'solive bois 150 × 50 C30', b: 50, h: 150, spacing: 530, material: 'C30' },
  /** platelage contreplaqué F20/15 18 mm, trois travées sur les solives ; charge du revêtement < 35 kg/m² */
  ply: { thickness: 18, material: 'CP-F20/15', gk: 0.35e-3 },
  /** rive de toiture de la Viewbox du dessous : UNP 220, Iy = 2 690 cm⁴ */
  roofRimIy: 2690e4,
  /** retrait des pieds par rapport aux angles de l'élément (mm) */
  footInset: 40,
  gammaM0: 1.1,
  kmod: 0.9,
  gammaMTimber: 1.3,
  kcr: 0.67,
} as const;

const f = (v: number, d = 2) => fmtNumber(v, d);

/**
 * Élément terrasse du modèle (boîte englobante monde, mm) → terrasse placée : sur la toiture d'une Viewbox (dessous de la
 * boîte au haut d'une Viewbox ± 150 mm, centre dans son emprise), sinon au sol (au niveau des Viewbox du rez-de-chaussée
 * ± 400 mm). Dimensions en plan 5,9 × 2,5 m ± 20 cm.
 */
export function placeTerrace(b: readonly number[], id: string, label: string, modules: PlacedModule[]): { terrace: PlacedTerrace | null; reason?: string } {
  const ex = b[3] - b[0];
  const ez = b[5] - b[2];
  const long = Math.max(ex, ez);
  const short = Math.min(ex, ez);
  if (Math.abs(long - TERRACE.long) > 200 || Math.abs(short - TERRACE.short) > 200)
    return { terrace: null, reason: `${label} : emprise ${f(long / 1e3)} × ${f(short / 1e3)} m, élément terrasse 5,90 × 2,50 m attendu (aligné sur les axes) — terrasse non calculée.` };
  const corners: P2[] = [
    [b[0], b[2]],
    [b[3], b[2]],
    [b[3], b[5]],
    [b[0], b[5]],
  ];
  const c: P2 = [(b[0] + b[3]) / 2, (b[2] + b[5]) / 2];
  const inside = (pm: PlacedModule) => {
    const d = [c[0] - pm.origin[0], c[1] - pm.origin[2]];
    const u = d[0] * pm.u[0] + d[1] * pm.u[2];
    const v = d[0] * pm.v[0] + d[1] * pm.v[2];
    const p = pm.params;
    return u > 0 && u < p.x0 + p.x1 && v > 0 && v < p.y0 + p.y1;
  };
  const below = modules.filter((pm) => inside(pm) && Math.abs(pm.origin[1] + pm.params.topZ - b[1]) <= 150);
  if (below.length) {
    const pm = below[0];
    if (modules.some((o) => o.level === pm.level + 1 && inside(o)))
      return { terrace: null, reason: `${label} : posée sur ${pm.id}, qui porte déjà une Viewbox — terrasse non calculée.` };
    return { terrace: { id, label, kind: 'roof', module: pm.id, corners, length: long, width: short } };
  }
  const ground = modules.filter((m) => m.level === 0);
  const g0 = ground.length ? Math.min(...ground.map((m) => m.origin[1])) : 0;
  if (Math.abs(b[1] - g0) <= 400) return { terrace: { id, label, kind: 'ground', corners, length: long, width: short } };
  return { terrace: null, reason: `${label} : à ${f((b[1] - g0) / 1e3)} m du sol sans Viewbox dessous — terrasse non calculée.` };
}

/** Appui supplémentaire du calage (pied d'un élément terrasse posé au sol) : charges caractéristiques (N). */
export type ExtraSupport = AddedSupport;

/** Pieds des terrasses posées au sol : rives en poutres à deux travées, angles 0,375 · w · L/2, milieux 1,25 · w · L/2. */
export function terraceSupports(terraces: readonly PlacedTerrace[], liveGround: number): ExtraSupport[] {
  const out: ExtraSupport[] = [];
  const g = TERRACE.selfWeight + TERRACE.deck;
  for (const t of terraces) {
    if (t.kind !== 'ground') continue;
    const c = t.corners;
    const center: P2 = [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2];
    const inset = (p: P2): P2 => {
      const d = [center[0] - p[0], center[1] - p[1]];
      return [p[0] + Math.sign(d[0]) * TERRACE.footInset, p[1] + Math.sign(d[1]) * TERRACE.footInset];
    };
    const half = t.length / 2;
    // charge par rive (N/mm) : moitié de la largeur
    const wg = (g * t.width) / 2;
    const wq = (liveGround * t.width) / 2;
    c.forEach((p, k) => out.push({ label: `${t.id} · pied d’angle ${k + 1}`, position: inset(p), middle: false, G: 0.375 * wg * half, Q: 0.375 * wq * half }));
    // milieux des grands côtés
    const edges: Array<[P2, P2]> = [
      [c[0], c[1]],
      [c[1], c[2]],
      [c[2], c[3]],
      [c[3], c[0]],
    ];
    edges
      .sort((a, b) => Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) - Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]))
      .slice(0, 2)
      .forEach(([a, b], k) => out.push({ label: `${t.id} · pied central ${k + 1}`, position: inset([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), middle: true, G: 1.25 * wg * half, Q: 1.25 * wq * half }));
  }
  return out;
}

/** Vérifications des éléments terrasse (rives, solives, platelage), statico 18-0573 § 3.5. */
export function checkTerraces(terraces: readonly PlacedTerrace[], live: number, liveGround: number): ElementChecks {
  const records: CalcRecord[] = [];
  const notes: string[] = [];
  const missing: string[] = [];
  const kinds = (['ground', 'roof'] as const).filter((k) => terraces.some((t) => t.kind === k));
  const rim = coldFormedU(TERRACE.rim.h, TERRACE.rim.b, TERRACE.rim.t);
  const Wpl = rim.Wply ?? rim.Wely;
  const MRd = (Wpl * TERRACE.rim.fy) / TERRACE.gammaM0;
  const wood = materialByKey(TERRACE.joist.material);
  const ply = materialByKey(TERRACE.ply.material);
  const g = TERRACE.selfWeight + TERRACE.deck;
  for (const kind of kinds) {
    const list = terraces.filter((t) => t.kind === kind);
    const ids = list.map((t) => t.id).join(', ');
    const q = kind === 'ground' ? liveGround : live;
    const where = kind === 'ground' ? 'au sol' : 'sur toiture';
    const L = Math.max(...list.map((t) => t.length));
    const b = Math.max(...list.map((t) => t.width));
    // rives
    const qk = ((g + q) * b) / 2;
    if (kind === 'ground') {
      const M = (1.35 * qk * (L / 2) ** 2) / 8;
      records.push({
        key: 'terrace.rim.ground',
        title: `Terrasses ${where} (${ids}) : rives ${TERRACE.rim.label}, deux travées`,
        clause: 'statico 18-0573 § 3.5.1 ; EN 1993-1-1 6.2.5',
        formula: 'qk = b / 2 · (g + q) ; MEd = 1,35 · qk · (L / 2)² / 8 ≤ MRd = Wpl · fy / γM0',
        withValues: `qk = ${f(b / 2e3)} · (${f(g * 1e3)} + ${f(q * 1e3)}) = ${f(qk)} kN/m ; MEd = ${f(M / 1e6)} kNm ; MRd = ${f(Wpl / 1e3, 1)} cm³ · ${f(TERRACE.rim.fy / 10, 1)} / ${f(TERRACE.gammaM0)} = ${f(MRd / 1e6)} kNm ; η = ${f(M / MRd)}`,
        eta: M / MRd,
      });
    } else {
      const share = rim.Iy / (rim.Iy + TERRACE.roofRimIy);
      const M = (1.35 * qk * L * L) / 8;
      records.push({
        key: 'terrace.rim.roof',
        title: `Terrasses ${where} (${ids}) : rives ${TERRACE.rim.label} avec la rive UNP 220 du dessous`,
        clause: 'statico 18-0573 § 3.5.1',
        formula: 'MEd = 1,35 · qk · L² / 8 partagé selon les raideurs : MEd,U = Iy,U / (Iy,U + Iy,UNP) · MEd ≤ MRd',
        withValues: `qk = ${f(qk)} kN/m ; MEd = ${f(M / 1e6)} kNm ; part ${f(rim.Iy / 1e4, 0)} / (${f(rim.Iy / 1e4, 0)} + 2 690) = ${f(share)} ; MEd,U = ${f((share * M) / 1e6)} kNm ≤ ${f(MRd / 1e6)} kNm ; η = ${f((share * M) / MRd)} (la rive UNP 220 est vérifiée par le calcul complet)`,
        eta: (share * M) / MRd,
      });
    }
    // solives
    if (wood?.strength?.fmk && wood.strength.fvk) {
      const e = TERRACE.joist.spacing;
      const w = (g + q) * e;
      const M = (1.35 * w * b * b) / 8;
      const V = (1.35 * w * b) / 2;
      const W = (TERRACE.joist.b * TERRACE.joist.h ** 2) / 6;
      const sm = M / W;
      const tau = (1.5 * V) / (TERRACE.kcr * TERRACE.joist.b * TERRACE.joist.h);
      const fmd = (TERRACE.kmod * wood.strength.fmk) / TERRACE.gammaMTimber;
      const fvd = (TERRACE.kmod * wood.strength.fvk) / TERRACE.gammaMTimber;
      const eta = Math.max(sm / fmd, tau / fvd);
      records.push({
        key: `terrace.joist.${kind}`,
        title: `Terrasses ${where} : ${TERRACE.joist.label} (entraxe ${f(e / 10, 0)} cm, portée ${f(b / 1e3)} m)`,
        clause: 'statico 18-0573 § 3.5.3 ; EN 1995-1-1 6.1.6, 6.1.7',
        formula: 'σm,d = 1,35 · (g + q) · e · L² / 8 / W ≤ kmod · fm,k / γM ; τd = 1,5 · VEd / (kcr · b · h) ≤ kmod · fv,k / γM',
        withValues: `σm,d = ${f(sm / 10, 2)} kN/cm² ≤ ${f(fmd / 10, 2)} kN/cm² ; τd = ${f(tau / 10, 3)} ≤ ${f(fvd / 10, 3)} kN/cm² (kmod ${f(TERRACE.kmod, 1)}, NKL 2) ; η = ${f(eta)}`,
        eta,
      });
    }
    // platelage
    if (ply?.strength?.fmk && ply.strength.fvk) {
      const l = TERRACE.joist.spacing;
      const qEd = 1.35 * (q + TERRACE.ply.gk);
      const t = TERRACE.ply.thickness;
      const M = 0.117 * qEd * l * l;
      const V = 0.617 * qEd * l;
      const sm = M / ((t * t) / 6);
      const tau = (1.5 * V) / t;
      const fmd = (TERRACE.kmod * ply.strength.fmk) / TERRACE.gammaMTimber;
      const fvd = (TERRACE.kmod * ply.strength.fvk) / TERRACE.gammaMTimber;
      const eta = Math.max(sm / fmd, tau / fvd);
      records.push({
        key: `terrace.deck.${kind}`,
        title: `Terrasses ${where} : platelage contreplaqué F20/15 ${t} mm, trois travées de ${f(l / 10, 0)} cm`,
        clause: 'statico 18-0573 § 3.5.4.1 ; EN 1995-1-1',
        formula: 'qEd = 1,35 · (q + g) ; mEd = 0,117 · qEd · l² ; vEd = 0,617 · qEd · l ; σ = mEd / (t² / 6) ≤ kmod · fm,k / γM ; τ = 1,5 · vEd / t ≤ kmod · fv,k / γM',
        withValues: `qEd = 1,35 · (${f(q * 1e3)} + ${f(TERRACE.ply.gk * 1e3)}) = ${f(qEd * 1e3)} kN/m² ; σ = ${f(sm / 10, 2)} ≤ ${f(fmd / 10, 2)} kN/cm² ; τ = ${f(tau / 10, 3)} ≤ ${f(fvd / 10, 3)} kN/cm² ; η = ${f(eta)}`,
        eta,
      });
    }
    if (kind === 'ground') {
      const [sup] = terraceSupports(list.slice(0, 1), liveGround).filter((s) => s.middle);
      if (sup)
        records.push({
          key: 'terrace.supports',
          title: `Terrasses au sol : réactions des pieds`,
          clause: 'statico 18-0573 § 3.5.1, § 3.9.3',
          formula: 'poutre à deux travées par rive : angles 0,375 · w · L/2, milieux 1,25 · w · L/2 (w = b / 2 · (g + q))',
          withValues: `pied central : Rk = ${f((sup.G + sup.Q) / 1e3)} kN (G ${f(sup.G / 1e3)} + Q ${f(sup.Q / 1e3)}) ; plaque minimale du Prüfbuch 55 × 55 cm (statico : 56,2 kN pour toute la largeur)`,
        });
      notes.push('Terrasses au sol : poser les pieds aux 4 angles et au milieu des 2 grands côtés, chacun calé (statico 18-0573 § 3.5.1)');
    }
  }
  if (terraces.length) notes.push('Platelage Twinson P9555 30 mm (au lieu du contreplaqué) : 5,0 kN/m² selon Z-10.9-599 si portée ≤ 50 cm, appui ≥ 50 mm et qp ≤ 1,40 kN/m² — vérifier la validité de l’agrément');
  const etas = records.map((r) => r.eta ?? 0);
  return { eta: etas.length ? Math.max(...etas) : 0, records, notes, failures: [], missing };
}
