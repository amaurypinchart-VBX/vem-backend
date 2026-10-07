// Plancher en contreplaqué (§9.4), méthode statico 24-0571 § 3.5 / 24-0569 § 3.3 : bande de 1 m sur deux appuis,
// portée ≤ 80 cm, KLED moyen, NKL 2 (kmod 0,8), γM 1,3 ; statico ne compte qu'une couche (côté de la sécurité). Le
// plancher Viewbox a deux couches de 18 mm croisées et vissées (A. Pinchart 06.10.2026) : non collées, elles ne font
// pas une section de 36 mm, chacune porte sa part (qEd / n) ; les valeurs de la direction faible (statico) sont
// gardées pour chaque couche, la couche croisée comprise (prudent : la couche du sens fort, plus raide, en prend plus
// mais résiste plus) ;
// vRd = b · t · kmod · fv,k / 1,5 / γM, mRd = b · t² / 6 · kmod · fm,k / γM ;
// qEd = γG,Q · g + γQ · q (+ γW · 0,8 · qp de pression intérieure si l'installation est ouverte).
// Variante statico 18-0573 § 3.4.4 (plancher du rez-de-chaussée à 5,0 kN/m²) : poutre continue sur trois travées
// (vEd = 0,617 · qEd · L, mEd = 0,117 · qEd · L²), KLED court (kmod 0,9), qEd = 1,35 · (g + q).
// Fonctions pures ; N, mm.
import { materialByKey } from '../materials';
import type { CalcRecord } from '../records';
import { fmtNumber } from '../units';

export interface PlywoodInput {
  material: string;
  /** épaisseur d'une couche (mm), portée (mm) */
  thickness: number;
  span: number;
  kmod: number;
  gammaM: number;
  /** charges (N/mm²) et coefficients */
  g: number;
  q: number;
  gammaG: number;
  gammaQ: number;
  /** pression intérieure (N/mm², 0 si non retenue) et γW */
  internal: number;
  gammaW: number;
  label: string;
  /** couches croisées vissées (non collées), 1 par défaut comme statico */
  layers?: number;
  /** 1 travée (statico 24-0571, défaut) ou 3 travées continues (statico 18-0573 § 3.4.4) */
  spans?: 1 | 3;
  clause?: string;
}

export interface PlywoodResult {
  eta: number;
  blocked?: string;
  records: CalcRecord[];
  /** plancher vérifié : nombre de couches croisées et épaisseur d'une couche (mm) */
  build?: { layers: number; thickness: number };
}

const f2 = (v: number, d = 2) => fmtNumber(v, d);

const LAYERS_FORMULA = ' ; n couches croisées vissées, non collées : chacune porte qEd / n (valeurs de la direction faible pour chacune) ; η = max(vEd / (n · vRd) ; mEd / (n · mRd))';

export function checkPlywoodStrip(p: PlywoodInput): PlywoodResult {
  const m = materialByKey(p.material);
  const fm = m?.strength?.fmk;
  const fv = m?.strength?.fvk;
  if (!m || !fm || !fv) return { eta: Infinity, blocked: `${p.label} : résistances du contreplaqué ${p.material} inconnues`, records: [] };
  const b = 1000;
  const t = p.thickness;
  const vRd = (b * t * p.kmod * fv) / 1.5 / p.gammaM;
  const mRd = ((b * t * t) / 6) * p.kmod * (fm / p.gammaM);
  const qEd = p.gammaG * p.g + p.gammaQ * p.q + p.gammaW * p.internal;
  const three = p.spans === 3;
  const vEd = three ? 0.617 * qEd * b * p.span : (qEd * b * p.span) / 2;
  const mEd = three ? 0.117 * qEd * b * p.span * p.span : (qEd * b * p.span * p.span) / 8;
  const n = Math.max(1, Math.round(p.layers ?? 1));
  const eta = Math.max(vEd / (n * vRd), mEd / (n * mRd));
  const qTxt = `${f2(p.gammaG)} · ${f2(p.g * 1e3)} + ${f2(p.gammaQ)} · ${f2(p.q * 1e3)}${p.internal ? ` + ${f2(p.gammaW)} · ${f2(p.internal * 1e3)}` : ''} = ${f2(qEd * 1e3)} kN/m²`;
  return {
    eta,
    build: { layers: n, thickness: t },
    records: [
      {
        key: `plywood.${p.label}`,
        title: `${p.label} — ${m.name.replace(/\s*\(.*\)\s*$/, '')}, bande de 1 m${three ? ', trois travées' : ''}${n > 1 ? `, ${n} couches croisées` : ''}`,
        clause: p.clause ?? 'DIN EN 1995-1-1 ; statico 24-0571 § 3.5',
        formula:
          (three
            ? 'vRd = b · t · kmod · fv,k / 1,5 / γM ; mRd = b · t² / 6 · kmod · fm,k / γM ; vEd = 0,617 · qEd · L ; mEd = 0,117 · qEd · L²'
            : 'vRd = b · t · kmod · fv,k / 1,5 / γM ; mRd = b · t² / 6 · kmod · fm,k / γM ; vEd = qEd · L / 2 ; mEd = qEd · L² / 8') + (n > 1 ? LAYERS_FORMULA : ''),
        withValues: `t = ${f2(t / 10, 1)} cm${n > 1 ? ` (${n} × ${f2(t / 10, 1)} = ${f2((n * t) / 10, 1)} cm)` : ''}, L = ${f2(p.span / 10, 0)} cm, kmod = ${f2(p.kmod)} ; vRd = ${f2(vRd / 1e3)} kN/m, mRd = ${f2(mRd / 1e4)} kNcm/m ; qEd = ${qTxt} ; vEd = ${f2(vEd / 1e3)} kN/m, mEd = ${f2(mEd / 1e4)} kNcm/m${n > 1 ? ` ; n = ${n} → η = max(${f2(vEd / 1e3)} / ${f2((n * vRd) / 1e3)} ; ${f2(mEd / 1e4)} / ${f2((n * mRd) / 1e4)})` : ''}`,
        eta,
      },
    ],
  };
}
