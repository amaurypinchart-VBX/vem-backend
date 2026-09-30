// Plancher en contreplaqué (§9.4), méthode statico 24-0571 § 3.5 / 24-0569 § 3.3 : une seule couche (côté de la
// sécurité) comme bande de 1 m sur deux appuis, portée ≤ 80 cm, KLED moyen, NKL 2 (kmod 0,8), γM 1,3 ;
// vRd = b · t · kmod · fv,k / 1,5 / γM, mRd = b · t² / 6 · kmod · fm,k / γM ;
// qEd = γG,Q · g + γQ · q (+ γW · 0,8 · qp de pression intérieure si l'installation est ouverte).
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
}

export interface PlywoodResult {
  eta: number;
  blocked?: string;
  records: CalcRecord[];
}

const f2 = (v: number, d = 2) => fmtNumber(v, d);

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
  const vEd = (qEd * b * p.span) / 2;
  const mEd = (qEd * b * p.span * p.span) / 8;
  const eta = Math.max(vEd / vRd, mEd / mRd);
  const qTxt = `${f2(p.gammaG)} · ${f2(p.g * 1e3)} + ${f2(p.gammaQ)} · ${f2(p.q * 1e3)}${p.internal ? ` + ${f2(p.gammaW)} · ${f2(p.internal * 1e3)}` : ''} = ${f2(qEd * 1e3)} kN/m²`;
  return {
    eta,
    records: [
      {
        key: `plywood.${p.label}`,
        title: `${p.label} — ${m.name.replace(/\s*\(.*\)\s*$/, '')}, bande de 1 m`,
        clause: 'DIN EN 1995-1-1 ; statico 24-0571 § 3.5',
        formula: 'vRd = b · t · kmod · fv,k / 1,5 / γM ; mRd = b · t² / 6 · kmod · fm,k / γM ; vEd = qEd · L / 2 ; mEd = qEd · L² / 8',
        withValues: `t = ${f2(t / 10, 1)} cm, L = ${f2(p.span / 10, 0)} cm, kmod = ${f2(p.kmod)} ; vRd = ${f2(vRd / 1e3)} kN/m, mRd = ${f2(mRd / 1e4)} kNcm/m ; qEd = ${qTxt} ; vEd = ${f2(vEd / 1e3)} kN/m, mEd = ${f2(mEd / 1e4)} kNcm/m`,
        eta,
      },
    ],
  };
}
