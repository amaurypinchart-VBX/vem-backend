// Éléments de façade et garde-corps d'après le calcul de type statico 18-0573 (Prüfbuch TÜV 190060 B) § 3.6 – 3.7 :
// les justifications de statico sont faites pour le vent d'une Viewbox ouverte, wk = 1,5 · qp (0,79 kN/m² en zone 4
// côte : wk = 1,185 kN/m²) ; leurs efforts sont proportionnels à wk et sont ramenés ici à la pression du site.
//   § 3.6.1 rails des murs U 60 × 30 × 3 (S275, MRd 1,97 kNm, entraxe des fixations 1,3 m, élément 2,6 m) + vis M8-8.8 ;
//   § 3.6.2 vitrage fixe : âme acier du profil alu 8 × 40 mm (S275, MRd 80 kNcm, MEd 69 kNcm sous 1,185 kN/m²) ;
//   § 3.6.3 verre feuilleté : Stratobel 44.1 (sans risque de chute : σ 5,46 kN/cm² par vitre de 4 mm, flèche 35 mm
//           > 25 mm, à évaluer par l'exploitant) ou 88.2 (obligatoire avec risque de chute : vent + main courante
//           1,0 kN/m à 1,1 m, σ 1,85 kN/cm², flèche 17 mm) ; σRd = 3,47 kN/cm² ;
//   § 3.6.4 panneau sandwich Kingspan Isocab 60 mm : qRk 1,29 kN/m² (Z-10.49-663) ;
//   § 3.7 garde-corps des étages : seulement pour des surfaces ≤ 350 kg/m² (main courante 0,5 kN/m), η 1,01 ≈ 1,0.
// Un vitrage à l'étage (ou au rez-de-chaussée surélevé de plus de 1 m) a un risque de chute : 88.2 obligatoire.
// Fonctions pures ; N, mm, N/mm².
import type { CalcRecord } from '../records';
import { fmtNumber } from '../units';

export interface FacadeItem {
  label: string;
  nature: 'wall' | 'glazing' | 'door' | 'railing';
  /** niveau de la Viewbox (0 = rez-de-chaussée) ; porté par un élément terrasse */
  level: number;
  onTerrace?: boolean;
  /** longueur (mm) */
  length: number;
}

export interface FacadeInput {
  items: FacadeItem[];
  /** pressions du vent en service et hors service (N/mm²) */
  qIn: number;
  qOut: number;
  /** exploitation des planchers (N/mm²) : rez-de-chaussée, étages */
  liveGround: number;
  live: number;
  /** surélévation des Viewbox du rez-de-chaussée (mm) */
  raise?: number;
}

export interface ElementChecks {
  /** taux le plus élevé (Infinity si une vérification est bloquée) */
  eta: number;
  records: CalcRecord[];
  /** points à vérifier sur site (non bloquants) */
  notes: string[];
  /** non conformités : le verdict ne passe pas */
  failures: string[];
  /** cas non couverts par les justifications de référence : verdict incomplet */
  missing: string[];
}

/** statico 18-0573 : wk de référence (1,5 · 0,79 kN/m²), en N/mm² */
const WK_REF = 1.185e-3;
const GAMMA_Q = 1.35;

type Glass = '44.1' | '88.2' | null;
export function glassType(label: string): Glass {
  if (/44[.,]\s?1\b/.test(label)) return '44.1';
  if (/88[.,]\s?2\b/.test(label)) return '88.2';
  return null;
}

const f = (v: number, d = 2) => fmtNumber(v, d);

export function checkFacade(inp: FacadeInput): ElementChecks {
  const records: CalcRecord[] = [];
  const notes: string[] = [];
  const failures: string[] = [];
  const missing: string[] = [];
  const q = Math.max(inp.qIn, inp.qOut);
  const wk = 1.5 * q;
  const r = wk / WK_REF;
  const wkTxt = `wk = 1,5 · ${f(q * 1e3)} = ${f(wk * 1e3, 3)} kN/m²`;
  const closed = inp.items.filter((i) => i.nature !== 'railing');
  const glazing = inp.items.filter((i) => i.nature === 'glazing');
  const walls = inp.items.filter((i) => i.nature === 'wall');
  const rails = inp.items.filter((i) => i.nature === 'railing');

  if (closed.length) {
    // § 3.6.1 rails U 60 × 30 × 3 : poutre à deux travées de 1,3 m, moitié de l'élément de 2,6 m par rail
    const wEd = GAMMA_Q * wk * 2600 * 0.5; // N/mm
    const L = 1300;
    const M = 0.125 * wEd * L * L;
    const MRd = 1.97e6;
    const R = 1.25 * wEd * L;
    const FvRd = 14.06e3;
    records.push({
      key: 'facade.rail',
      title: 'Rails des murs U 60 × 30 × 3 (S275)',
      clause: 'statico 18-0573 § 3.6.1',
      formula: 'wEd = 1,35 · wk · 2,6 m / 2 ; MEd = 0,125 · wEd · L² (deux travées, L = 1,3 m) ≤ MRd = 1,97 kNm',
      withValues: `${wkTxt} ; wEd = ${f(wEd)} kN/m ; MEd = ${f(M / 1e6)} kNm ; η = ${f(M / MRd)}`,
      eta: M / MRd,
    });
    records.push({
      key: 'facade.railBolt',
      title: 'Fixation des rails : vis M8-8.8',
      clause: 'statico 18-0573 § 3.6.1',
      formula: 'Ry,Ed = 1,25 · wEd · L ≤ Fv,Rd = 0,60 · 80 · 0,37 / 1,25 = 14,06 kN',
      withValues: `Ry,Ed = 1,25 · ${f(wEd)} · 1,3 = ${f(R / 1e3)} kN ; η = ${f(R / FvRd)}`,
      eta: R / FvRd,
    });
  }

  if (glazing.length) {
    // § 3.6.2 âme acier du profil de vitrage fixe
    const MEd = 69 * r;
    records.push({
      key: 'facade.glazingFrame',
      title: 'Vitrage fixe : âme acier du profil 8 × 40 mm (S275)',
      clause: 'statico 18-0573 § 3.6.2',
      formula: 'MEd = 69 kNcm · wk / 1,185 kN/m² ≤ MRd = 3,2 cm³ · 27,5 / 1,1 = 80 kNcm',
      withValues: `${wkTxt} ; MEd = ${f(MEd, 1)} kNcm ; η = ${f(MEd / 80)}`,
      eta: MEd / 80,
    });
    // § 3.6.3 verre feuilleté, selon le risque de chute
    const fallRisk = (i: FacadeItem) => i.level > 0 || i.onTerrace || (inp.raise ?? 0) >= 1000;
    const upper = glazing.filter(fallRisk);
    const lower = glazing.filter((i) => !fallRisk(i));
    const t44 = [...new Set(glazing.filter((i) => glassType(i.label) === '44.1').map((i) => i.label))];
    const bad = [...new Set(upper.filter((i) => glassType(i.label) === '44.1').map((i) => i.label))];
    for (const b of bad) failures.push(`${b} : verre 44.1 avec risque de chute (étage) — non admis, Stratobel 88.2 obligatoire (statico 18-0573 § 1.2, § 3.6.3)`);
    if (upper.length) {
      const sigma = (1.85 / 2) * Math.max(1, r);
      records.push({
        key: 'facade.vsg88',
        title: 'Verre feuilleté Stratobel 88.2 (risque de chute)',
        clause: 'statico 18-0573 § 3.6.3.2 ; DIN 18008-2 et -4',
        formula: 'σEd = σ(vent + main courante 1,0 kN/m à 1,1 m) / 2 vitres ≤ σRd = kmod · kc · fk / γM · fVSG = 3,47 kN/cm²',
        withValues: `${wkTxt} ; σEd = 1,85 / 2${r > 1 ? ` · ${f(r)}` : ''} = ${f(sigma)} kN/cm² ; η = ${f(sigma / 3.47)} ; flèche ${f(17 * Math.max(1, r), 0)} mm ≤ 25 mm`,
        eta: sigma / 3.47,
      });
      const unknown = [...new Set(upper.filter((i) => glassType(i.label) === null).map((i) => i.label))];
      if (unknown.length) notes.push(`${unknown.join(', ')} : type de verre non indiqué — à l’étage, Stratobel 88.2 obligatoire (risque de chute)`);
    }
    if (lower.length) {
      const sigma = (5.46 * r) / 2;
      const w = 35 * r;
      records.push({
        key: 'facade.vsg44',
        title: 'Verre feuilleté Stratobel 44.1 (rez-de-chaussée sans risque de chute)',
        clause: 'statico 18-0573 § 3.6.3.1 ; DIN 18008-2',
        formula: 'σEd = 5,46 kN/cm² · wk / 1,185 kN/m² / 2 vitres ≤ σRd = 3,47 kN/cm²',
        withValues: `${wkTxt} ; σEd = ${f(sigma)} kN/cm² ; η = ${f(sigma / 3.47)} ; flèche ${f(w, 0)} mm${w > 25 ? ' > 25 mm' : ' ≤ 25 mm'}`,
        eta: sigma / 3.47,
      });
      if (w > 25 && lower.some((i) => glassType(i.label) !== '88.2'))
        notes.push(`Vitrages 44.1 du rez-de-chaussée : flèche ${f(w, 0)} mm > 25 mm sous le vent (aptitude au service non satisfaite, résistance assurée) — à évaluer par l’exploitant (statico 18-0573 § 3.6.3.1)`);
    }
    if (t44.length && !bad.length) notes.push(`${t44.join(', ')} : verre 44.1 seulement au rez-de-chaussée sans risque de chute`);
    notes.push('Les fenêtres coulissantes vitrées existantes ne sont pas admises (statico 18-0573 § 1.2)');
  }

  if (walls.length) {
    const isocab = walls.filter((i) => /isocab/i.test(i.label));
    const other = [...new Set(walls.filter((i) => !/isocab/i.test(i.label)).map((i) => i.label))];
    if (isocab.length)
      records.push({
        key: 'facade.sandwich',
        title: 'Mur en panneau sandwich Kingspan Isocab 60 mm',
        clause: 'statico 18-0573 § 3.6.4 ; Z-10.49-663',
        formula: 'qEk = wk ≤ qRk = 1,29 kN/m² (portée 2,6 m)',
        withValues: `${wkTxt} ; η = ${f(wk * 1e3, 3)} / 1,29 = ${f(wk / 1.29e-3)}`,
        eta: wk / 1.29e-3,
      });
    if (other.length) notes.push(`${other.join(', ')} : panneau de mur autre que l’Isocab 60 mm du calcul 18-0573 § 3.6.4 — résistance au vent (wk = ${f(wk * 1e3, 2)} kN/m² sur 2,6 m) à justifier par la fiche du fabricant`);
  }

  if (rails.length) {
    const upper = rails.filter((i) => i.level > 0 || i.onTerrace);
    const heavy = rails.filter((i) => (i.level === 0 && !i.onTerrace ? inp.liveGround : inp.live) > 3.5e-3 + 1e-9);
    if (upper.length)
      records.push({
        key: 'facade.railing',
        title: 'Garde-corps des étages (montants 2 × 40 × 20 × 2 S275, platine 200 × 100 × 4, M20-8.8)',
        clause: 'statico 18-0573 § 3.7',
        formula: 'main courante pk = 0,5 kN/m (surfaces ≤ 350 kg/m²) : contraintes η = 1,01 ≈ 1,0 ; vis M20-8.8 : Ft,Ed = 23,63 kN ≤ 141 kN',
        withValues: 'section : η = 1,00 (statico, arrondi) ; vis : η = 0,13',
        eta: 1,
      });
    for (const i of heavy) missing.push(`${i.label} : garde-corps sur une surface de plus de 350 kg/m² — non couvert par statico 18-0573 § 3.7 (main courante 1,0 kN/m à justifier)`);
  }
  const etas = records.map((x) => x.eta ?? 0);
  return { eta: etas.length ? Math.max(...etas) : 0, records, notes: [...new Set(notes)], failures: [...new Set(failures)], missing: [...new Set(missing)] };
}
