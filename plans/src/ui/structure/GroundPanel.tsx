// Panneau « Sol & calage » : hypothèses (portance, charges, vent), estimation des réactions par groupe d'appuis,
// solutions de répartition par type d'appui, variante longrines, liste de matériel, stock de l'entrepôt, fiche PDF.
// Alimenté par le modèle analysé (onglet Étude structure) ou par une grille de Viewbox (calculateur rapide).
import type { DrawnBlock } from '../../structure/core/blocks';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalageInput, CalageResult } from '../../structure/core/calage';
import type { PublicMax } from '../../structure/core/calage';
import { computeCalage, maxPublic } from '../../structure/core/calage';
import type { AddedSupport, Estimate, EstimateModule, EstimateOptions } from '../../structure/core/estimate';
import { TERRACE } from '../../structure/core/terrace';
import { ESTIMATE_DEFAULTS } from '../../structure/core/estimate';
import { DEFAULTS } from '../../structure/library/defaults';
import type { BearingUnit, CommercialPlate, Solution, StockPlate } from '../../structure/core/ground';
import { BEARING_PRESETS, C24_BEAMS, GROUND_NOTE, PLATE_LABEL, SUBGRADE_PRESETS, VIEWBOX_STOCK, bearingFrom } from '../../structure/core/ground';
import type { PlateMaterial } from '../../structure/core/ground';
import type { CalageChoices } from '../../structure/core/spreading';
import type { CalcRecord } from '../../structure/core/records';
import { VERDICT_LABEL, verdictOf } from '../../structure/core/records';
import { fmtNumber } from '../../structure/core/units';
import { GroundPlan, checkPlan, planPlates } from '../../structure/report/groundSheet';
import type { CalageRemedy, RemedyVerdict } from '../../structure/core/calageRemedies';
import { calageRemedies } from '../../structure/core/calageRemedies';
import { typeColor } from '../../structure/report/calagePlan';
import type { PlatePlacement } from '../../structure/core/placement';
import type { Terrain } from '../../structure/core/wind';
import type { Lang } from '../../structure/report/i18n';
import { LANGS, LANG_LABEL, num } from '../../structure/report/i18n';
import { CALAGE_LABELS } from '../../structure/report/calageI18n';
import { translate } from '../../structure/report/translate';
import type { FrSnowRegion, FrWindSite } from '../../structure/core/codeFR';
import { DEFAULT_FR_WIND, frOutOfService, serviceWindPressure, spdHorizontalRatio } from '../../structure/core/codeFR';
import { kNm2, kgm2, planCoords, planOrigin, supportType } from '../../structure/core/roadway';
import { pressureFill } from '../../structure/report/groundPoints';
import { STACK_LABELS, slabBudgetTable, stackHeightText, stackLines, stacksFigureSvg } from '../../structure/report/stackFigure';
import type { ChoiceSetters } from './CalageChoice';
import { CHECK_COLORS, CalageDiagnostic, SupportPanel, TypeChoice } from './CalageChoice';
import type { Project } from '../../api/vem';
import { PROJECT_ID, STRUCTURE_STOCK_KEY, vem } from '../../api/vem';
import { downloadBlob } from '../common';
import type { GroundLevel } from '../../structure/core/groundLevels';
import { GroundLevelsCard, LEVEL_COLORS, levelPointStyle } from './GroundLevels';
import { freshImport } from '../newVersion';

export interface Hypotheses {
  /**
   * référentiel de calcul : absent / 'DE' = Allemagne (DIN EN 13814, notes statico, Prüfbuch TÜV) ; 'FR' = France
   * (Eurocodes avec annexes nationales françaises + arrêté du 25 juillet 2022 sur les structures provisoires et démontables)
   */
  code?: 'DE' | 'FR';
  /** France : vent (région, catégorie de terrain, durée de l'installation, vent de service) */
  frWind?: FrWindSite;
  /** France : neige (région de la carte, altitude du site en m) — la neige au sol en est déduite (`snowKgm2`) */
  frSnow?: { region: FrSnowRegion; altitude: number };
  bearingPreset: string;
  bearingValue: number;
  bearingUnit: BearingUnit;
  /**
   * lecture de la valeur : pression maxi sous chaque appui (sol) ou charge répartie admissible (dalle, plancher,
   * toiture : poids au m² vérifié sous chaque Viewbox) ; absent = selon le type de support
   */
  bearingMode?: 'pressure' | 'distributed';
  pointLoadKN: number;
  /** poids pesé d'une Viewbox (kg) : structure, plancher, sol, plafond et isolants compris */
  moduleWeightKg: number;
  /** pesée d'une unité par type de structure personnalisé (kg, clé du type) ; absent = poids calculé (S12) */
  moduleWeights?: Record<string, number>;
  /** plafond / isolation et revêtement de sol ajoutés en plus du poids pesé (kN/m², 0 = Viewbox standard) */
  ceilingExtra?: number;
  floorExtra?: number;
  /** exploitation des étages (kN/m²) */
  live: number;
  /** exploitation du rez-de-chaussée (kN/m²) : 5,0 dans le calcul de type statico 18-0573 (EG 500 kg/m²) */
  liveGround?: number;
  /** calage rapide sans modèle seulement : murs, vitrages… par Viewbox (kN) ; une étude les prend dans le modèle */
  extraKN: number;
  windIn: number;
  windOut: number;
  /** profil du vent hors service choisi (texte du rapport) ; « manual » = vitesse saisie */
  windProfile?: Terrain;
  cp: number;
  middleFeet: boolean;
  evacuateTop: boolean;
  /** niveaux fermés au public (pas d'exploitation) : 1 = premier étage… */
  closedLevels?: number[];
  staticoConversion: boolean;
  diffusion: boolean;
  extraPct: number;
  subgrade: string;
  thicknesses: string;
  /** poids propre des plaques de roulage (kg/m²) */
  roadwayKg: number;
  /** épaisseur des plaques de roulage (mm, coupe du calage) ; 0 / absent = inconnue */
  roadwayMm?: number;
  /** public pour le sol : charge réglementaire (kN/m²) ou nombre de personnes limité sur toute l'installation */
  publicMode: 'norm' | 'persons';
  persons: number;
  personKg: number;
  /** calage choisi par type d'appui ou par appui, plaques de roulage */
  calage?: CalageChoices;
  /** neige au sol sk (kg/m²) ; 0 = pas de neige (été, ou neige empêchée / déblayée) */
  snowKgm2?: number;
  /** pose des plaques : à fleur de la Viewbox, centrées si nécessaire (défaut) ; toujours à fleur ; centrées (statico) */
  platePlacement?: PlatePlacement;
  /** plaques minimales du Prüfbuch TÜV 190060 B (plan 18-0573-03) — défaut oui */
  tuvMinimum?: boolean;
  /** niveaux du sol relevés sous les pieds (mm, relatifs ; pied sans relevé = absent) */
  groundLevels?: GroundLevel[];
}

export const DEFAULT_HYP: Hypotheses = {
  bearingPreset: 'meadow',
  bearingValue: 20390,
  bearingUnit: 'kg/m²',
  pointLoadKN: 0,
  moduleWeightKg: 2564,
  ceilingExtra: 0,
  floorExtra: 0,
  live: 3.5,
  liveGround: 5,
  extraKN: 0,
  windIn: 0.2,
  windOut: 0.37,
  cp: 1.3,
  middleFeet: false,
  evacuateTop: true,
  closedLevels: [],
  staticoConversion: false,
  diffusion: false,
  extraPct: 0,
  subgrade: 'medium',
  thicknesses: '18, 21, 24, 27, 30, 40',
  roadwayKg: 0,
  publicMode: 'norm',
  persons: 10,
  personKg: 80,
  snowKgm2: 0,
};

export interface StructureStock {
  plates: StockPlate[];
  commercial: CommercialPlate[];
}

const n = (v: number, d = 1) => fmtNumber(v, d);
const kN = (v: number, d = 1) => `${n(v / 1e3, d)} kN`;

function readStored(key: string): Partial<Hypotheses> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<Hypotheses>) : {};
  } catch {
    return {};
  }
}

/** Neige sur les toitures du dernier niveau (N/mm²) : s = 0,8 · sk (EN 1991-1-3, toiture plate). */
export const roofSnow = (h: Pick<Hypotheses, 'snowKgm2'>) => (0.8 * Math.max(0, h.snowKgm2 ?? 0) * 9.81) / 1e6;

/**
 * Entrées du calcul à partir des hypothèses saisies (unités d'affichage → N, mm) ; `jacks` : 6 pieds à vérin par
 * Viewbox. Le poids pesé est retenu tel quel (tout compris) ; murs, vitrages… : portés par chaque module d'après le
 * modèle (`EstimateModule.carried`), ou forfait par Viewbox du calage rapide sans modèle (`withoutModel`).
 */
/** Supports dont la valeur se lit d'office comme une charge répartie admissible (dalle, toiture, exploitant). */
export const DISTRIBUTED_PRESETS = ['slab', 'roof', 'operator'];
/** Lecture de la portance : choix enregistré, sinon selon le type de support. */
export const bearingModeOf = (h: Pick<Hypotheses, 'bearingMode' | 'bearingPreset'>): 'pressure' | 'distributed' => h.bearingMode ?? (DISTRIBUTED_PRESETS.includes(h.bearingPreset) ? 'distributed' : 'pressure');

/**
 * Pressions du vent retenues (kN/m²) : Allemagne = valeurs de l'étape 2 ; France = vent de service de l'arrêté
 * (q = ½ ρ v²) et vent hors service de NF EN 1991-1-4/NA à la hauteur de l'installation (mm).
 */
export function windPressures(h: Pick<Hypotheses, 'code' | 'frWind' | 'windIn' | 'windOut'>, heightMm: number): { windIn: number; windOut: number } {
  if (h.code !== 'FR') return { windIn: h.windIn, windOut: h.windOut };
  const s = h.frWind ?? DEFAULT_FR_WIND;
  return { windIn: serviceWindPressure(s.serviceSpeed) * 1e3, windOut: frOutOfService(s, heightMm) * 1e3 };
}

/** Hauteur de l'installation pour le vent (mm) : niveaux × hauteur des Viewbox. */
export function estimateHeight(modules: readonly EstimateModule[]): number {
  return modules.length ? Math.max(...modules.map((m) => (m.level + 1) * m.height)) : 3080;
}

/** Surface des planchers ouverts au public (mm²) : charge horizontale de l'arrêté (6 %, 10 % au-delà de 500 m²). */
function planArea(corners: ReadonlyArray<readonly [number, number]>): number {
  return Math.abs(corners.reduce((a, p, i) => a + p[0] * corners[(i + 1) % corners.length][1] - corners[(i + 1) % corners.length][0] * p[1], 0)) / 2;
}

export function calageInput(modules: EstimateModule[], h: Hypotheses, stock: StructureStock, jacks = false, extraSupports: AddedSupport[] = [], withoutModel = false, contact: EstimateOptions['contact'] = null): CalageInput {
  const kNm2 = (v: number) => v * 1e-3;
  const fr = h.code === 'FR';
  const wind = windPressures(h, estimateHeight(modules));
  return {
    modules,
    ...(extraSupports.length ? { extraSupports } : {}),
    estimate: {
      ...ESTIMATE_DEFAULTS,
      loads: {
        moduleWeight: h.moduleWeightKg * 9.81,
        weightMode: 'weighed',
        ceiling: DEFAULTS.ceiling.value,
        floorFinish: DEFAULTS.floorFinish.value,
        ceilingExtra: kNm2(h.ceilingExtra ?? 0),
        floorExtra: kNm2(h.floorExtra ?? 0),
        live: kNm2(h.live),
        liveGround: kNm2(h.liveGround ?? DEFAULT_HYP.liveGround!),
        // le toit d'une Viewbox ne reçoit jamais de public (terrasse posée dessus : `EstimateModule.terrace`)
        roofLive: 0,
        extraPerModule: withoutModel ? h.extraKN * 1e3 : 0,
        snowRoof: roofSnow(h),
        terraceG: TERRACE.selfWeight + TERRACE.deck,
      },
      windInService: kNm2(wind.windIn),
      windOutOfService: kNm2(wind.windOut),
      cp: h.cp,
      ...(fr ? { code: 'FR' as const, horizontalRatio: spdHorizontalRatio(modules.reduce((a, m) => a + planArea(m.corners), 0)) } : {}),
      middleFeet: h.middleFeet || jacks,
      jacks,
      ...(contact && !jacks ? { contact } : {}),
      evacuateTopLevel: h.evacuateTop,
      extraFactor: h.extraPct / 100,
    },
    bearing: bearingFrom(h.bearingValue, h.bearingUnit),
    pointLoadMax: (BEARING_PRESETS.find((p) => p.key === h.bearingPreset)?.pointLoad || bearingModeOf(h) === 'distributed') && h.pointLoadKN > 0 ? h.pointLoadKN * 1e3 : undefined,
    bearingMode: bearingModeOf(h),
    // France : réactions caractéristiques (pas de conversion statico), pas de Prüfbuch TÜV
    staticoConversion: fr ? false : h.staticoConversion,
    ...(fr ? { code: 'FR' as const } : {}),
    thicknesses: h.thicknesses
      .split(/[;,\s]+/)
      .map((x) => parseFloat(x.replace(',', '.')))
      .filter((x) => x > 0)
      .sort((a, b) => a - b),
    // stock de l'entrepôt ; tant qu'il n'est pas saisi : plaques de calage Viewbox (multiplex bouleau, quantités à vérifier)
    stock: stock.plates.length ? stock.plates : VIEWBOX_STOCK,
    commercial: stock.commercial,
    longrine: { k: SUBGRADE_PRESETS.find((s) => s.key === h.subgrade)?.k ?? 0.03, beams: C24_BEAMS, overhang: 55, maxCount: 6 },
    diffusion: h.diffusion,
    choices: h.calage,
    ...(h.publicMode === 'persons' ? { publicLimit: { persons: Math.max(0, Math.round(h.persons)), kg: h.personKg } } : {}),
    roadwayPlates: (h.roadwayKg * 9.81) / 1e6,
    ...(h.roadwayMm && h.roadwayMm > 0 ? { roadwayThickness: h.roadwayMm } : {}),
    placement: h.platePlacement ?? 'auto',
    tuvMinimum: h.tuvMinimum ?? true,
    ...(h.groundLevels?.length ? { levels: h.groundLevels } : {}),
  };
}

/** « 200 kN/m² = 20 390 kg/m² = 2,04 kg/cm² » : la portance dans les trois unités (évite 400 kN/m² ≠ 400 kg/m²). */
export function bearingConversions(value: number, unit: BearingUnit): string {
  const q = bearingFrom(value, unit);
  return `= ${fmtNumber(q * 1e3, q * 1e3 < 10 ? 2 : 0)} kN/m² = ${fmtNumber(kgm2(q), 0)} kg/m² = ${fmtNumber((q * 1e2) / 9.81, 2)} kg/cm²`;
}

function BearingInputs({ hyp, set }: { hyp: Hypotheses; set: <K extends keyof Hypotheses>(k: K, v: Hypotheses[K]) => void }) {
  return (
    <>
      <Num value={hyp.bearingValue} onChange={(v) => set('bearingValue', v)} />
      <select value={hyp.bearingUnit} style={{ width: 90 }} onChange={(e) => set('bearingUnit', e.target.value as BearingUnit)}>
        <option>kN/m²</option>
        <option>kg/m²</option>
        <option>t/m²</option>
        <option>kg/cm²</option>
      </select>
    </>
  );
}

function Num({ value, onChange, step = 0.05, width = 80 }: { value: number; onChange: (v: number) => void; step?: number; width?: number }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  useEffect(() => setText(String(value).replace('.', ',')), [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      style={{ width }}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value.replace(',', '.'));
        if (Number.isFinite(v)) onChange(v);
      }}
      data-step={step}
    />
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="row" style={{ justifyContent: 'space-between', gap: 8 }} title={hint}>
      <span className="hint" style={{ minWidth: 170 }}>
        {label}
      </span>
      <span className="row" style={{ gap: 4 }}>
        {children}
      </span>
    </label>
  );
}

function Records({ records }: { records: CalcRecord[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      {records.map((r, k) => (
        <div key={k} style={{ fontSize: 12, lineHeight: 1.45 }}>
          <b>{r.title}</b> <span className="hint">— {r.clause}</span>
          <div className="hint">{r.formula}</div>
          <div>
            {r.withValues}
            {r.eta !== undefined && (
              <span className={`badge ${verdictOf(r.eta) === 'ok' ? 'ok' : verdictOf(r.eta) === 'limit' ? 'orange' : 'ko'}`} style={{ marginLeft: 6 }}>
                η = {n(r.eta, 2)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const REMEDY_BADGE: Record<RemedyVerdict, { cls: string; text: string }> = {
  ok: { cls: 'ok', text: '✔ passe (calculé)' },
  fail: { cls: 'ko', text: '✖ ne suffit pas' },
  study: { cls: 'orange', text: 'à dimensionner' },
  info: { cls: '', text: 'information' },
};

/** Solution(s) retenue(s) parmi les pistes : ce qui est appliqué au calage, avec « Retirer ». */
function AppliedRemedies({ result, centreBlocks, onRemove }: { result: CalageResult; centreBlocks: boolean; onRemove: (what: 'remedy' | 'centre') => void }) {
  const r = result.remedy?.remedy;
  if (!r && !centreBlocks) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }} data-testid="remedy-applied">
      {centreBlocks && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <b>✔ Retenu : blocs centrés sous les pieds</b>
          <span className="hint">
            {result.centredBlocks?.length ? result.centredBlocks.map((b) => `${b.id} à déplacer de ${n(b.move / 10, 0)} cm`).join(', ') : 'blocs déjà centrés'} — le modèle n’est pas modifié, à poser ainsi sur site
          </span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn small ghost" onClick={() => onRemove('centre')} data-testid="remedy-remove-centre">
            Retirer
          </button>
        </div>
      )}
      {r && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <b>✔ Solution retenue : {r.title}</b>
          <span className={`badge ${r.verdict === 'ok' ? 'ok' : 'ko'}`}>{r.verdict === 'ok' ? 'passe' : 'ne passe pas'}{r.eta !== undefined ? ` · η ${n(r.eta, 2)}` : ''}</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn small ghost" onClick={() => onRemove('remedy')} data-testid="remedy-remove">
            Retirer (revenir aux plaques)
          </button>
          <div className="hint" style={{ width: '100%' }}>
            {r.summary} Le plan, la vérification de chaque appui, le matériel, la fiche, le plan de calage A3 et le rapport sont calculés avec cette solution ; elle est revérifiée à chaque changement (charges, portance, raideur du sol).
          </div>
        </div>
      )}
    </div>
  );
}

/** Pistes chiffrées quand le calage ne passe pas : ce que propose l'outil, avec ses hypothèses et le matériel. */
function RemediesCard({
  remedies,
  bearing,
  searching,
  onSearch,
  result,
  choices,
  onApply,
  onRemove,
}: {
  remedies: CalageRemedy[] | null;
  bearing: number;
  searching: boolean;
  onSearch: () => void;
  result: CalageResult;
  choices: CalageChoices;
  onApply: (r: CalageRemedy) => void;
  onRemove: (what: 'remedy' | 'centre') => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const applied = <AppliedRemedies result={result} centreBlocks={!!choices.centreBlocks} onRemove={onRemove} />;
  const isApplied = (r: CalageRemedy) => (r.apply === 'centre-blocks' ? !!choices.centreBlocks : !!r.apply && choices.remedy?.key === r.apply.key);
  if (!remedies)
    return (
      <div className="card" data-testid="calage-remedies">
        <div className="card-head">
          <h2>🛠 Solutions pour que le sol passe</h2>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn small primary" disabled={searching} onClick={onSearch} data-testid="remedies-search">
            {searching ? 'Recherche en cours…' : 'Chercher des solutions'}
          </button>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {applied}
          <div className="hint">
            L’outil essaie : blocs centrés sous les pieds, surface d’appui nécessaire, grille de madriers C24 sous chaque rangée, plateau continu en madriers (avec et sans les blocs,
            sans débord puis 50 cm), et dit ce que chaque piste suppose. Quelques secondes. Chaque piste calculée peut ensuite être appliquée : le calage est recalculé avec elle.
          </div>
        </div>
      </div>
    );
  return (
    <div className="card" data-testid="calage-remedies">
      <div className="card-head">
        <h2>🛠 Solutions pour que le sol passe</h2>
        <span className="hint">
          portance {n(bearing * 1e3, bearing * 1e3 < 10 ? 1 : 0)} kN/m² ({n((bearing * 1e6) / 9.81, 0)} kg/m²) — pistes calculées par l’outil, les vérifiées d’abord
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {applied}
        {!remedies.length && <div className="hint">Aucune autre piste : tous les appuis passent avec le calage actuel.</div>}
        {remedies.map((r) => (
          <div key={r.key} style={{ borderLeft: `3px solid ${r.verdict === 'ok' ? '#16a34a' : r.verdict === 'fail' ? '#dc2626' : r.verdict === 'study' ? '#d97706' : '#9ca3af'}`, paddingLeft: 10 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <b>{r.title}</b>
              <span className={`badge ${REMEDY_BADGE[r.verdict].cls}`}>
                {REMEDY_BADGE[r.verdict].text}
                {r.eta !== undefined ? ` · η ${n(r.eta, 2)}` : ''}
              </span>
              {(r.details.length > 0 || r.records.length > 0 || r.notes.length > 0) && (
                <button className="btn small ghost" onClick={() => setOpen(open === r.key ? null : r.key)}>
                  {open === r.key ? 'Masquer le détail' : 'Voir le détail'}
                </button>
              )}
              {r.apply &&
                (isApplied(r) ? (
                  <span className="badge ok">✔ retenue</span>
                ) : (
                  <button
                    className={`btn small ${r.verdict === 'ok' ? 'primary' : ''}`}
                    onClick={() => onApply(r)}
                    data-testid={`remedy-apply-${r.key}`}
                    title={r.verdict === 'ok' ? 'Recalculer le calage avec cette solution' : 'Cette piste ne passe pas seule : l’appliquer pour voir le calage avec elle (ou la combiner avec une autre)'}
                  >
                    Appliquer cette solution
                  </button>
                ))}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 2 }}>{r.summary}</div>
            {!!r.materials.length && (
              <div className="hint">
                Matériel : {r.materials.map((m) => `${m.quantity} × ${m.label} ${m.dims} (${n(m.massKg, 0)} kg)`).join(' ; ')}
              </div>
            )}
            {open === r.key && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {r.details.map((d, k) => (
                  <div key={k} className="hint">
                    • {d}
                  </div>
                ))}
                {r.notes.map((d, k) => (
                  <div key={`n${k}`} className="hint" style={{ fontStyle: 'italic' }}>
                    {d}
                  </div>
                ))}
                {!!r.records.length && <Records records={r.records} />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SolutionRow({ s, chosen }: { s: Solution; chosen: boolean }) {
  const [open, setOpen] = useState(false);
  const v = verdictOf(s.eta);
  return (
    <div className="card" style={{ background: chosen ? 'rgba(74, 222, 128, .06)' : undefined }}>
      <div className="card-body" style={{ padding: '8px 12px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <b>{s.title}</b> — {s.summary} {chosen && <span className="badge ok">retenue</span>}
            {!s.feasible && (
              <span className="badge orange" style={{ marginLeft: 6 }}>
                {s.kind === 'custom' || s.kind === 'roadway' ? 'dépassé' : 'hors standard'}
              </span>
            )}
          </div>
          <div className="row">
            {Number.isFinite(s.eta) && <span className={`badge ${v === 'ok' ? 'ok' : v === 'limit' ? 'orange' : 'ko'}`}>η = {n(s.eta, 2)}</span>}
            <button className="btn small ghost" onClick={() => setOpen(!open)}>
              {open ? 'Masquer le calcul' : 'Voir le calcul'}
            </button>
          </div>
        </div>
        {!!s.remarks.length && <div className="hint">⚠ {s.remarks.join(' ; ')}</div>}
        {!!s.materials.length && (
          <div className="hint">
            Matériel : {s.materials.map((m) => `${m.quantity} × ${m.label} ${m.dims} (${n(m.massKg, 0)} kg)`).join(' ; ')}
          </div>
        )}
        {open && <Records records={s.records} />}
      </div>
    </div>
  );
}

function StockEditor({ stock, onSaved }: { stock: StructureStock; onSaved: (s: StructureStock) => void }) {
  const [draft, setDraft] = useState(stock);
  const [msg, setMsg] = useState('');
  useEffect(() => setDraft(stock), [stock]);
  const setPlate = (i: number, patch: Partial<StockPlate>) => setDraft({ ...draft, plates: draft.plates.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setCom = (i: number, patch: Partial<CommercialPlate>) => setDraft({ ...draft, commercial: draft.commercial.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const save = async () => {
    try {
      await vem.saveSetting(STRUCTURE_STOCK_KEY, draft);
      onSaved(draft);
      setMsg('✓ Stock enregistré');
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    }
  };
  return (
    <div className="card">
      <div className="card-head">
        <h2>Stock de calage de l’entrepôt</h2>
        <span className="hint">Partagé entre tous les projets. Les plaques du stock sont proposées en priorité.</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 12 }}>Plaques de calage</b>
        {!draft.plates.length && <div className="hint">Stock non saisi : le calcul utilise les plaques Viewbox standard (multiplex bouleau 18 / 36 mm, 40 × 40, 70 × 70, 100 × 100 cm), quantités non contrôlées.</div>}
        {draft.plates.map((p, i) => (
          <div className="row" key={i}>
            <input type="text" style={{ width: 160 }} placeholder="nom" value={p.label ?? ''} onChange={(e) => setPlate(i, { label: e.target.value })} />
            <select value={p.material ?? 'F40'} style={{ width: 150 }} onChange={(e) => setPlate(i, { material: e.target.value as PlateMaterial })}>
              {(Object.keys(PLATE_LABEL) as PlateMaterial[]).map((k) => (
                <option key={k} value={k}>
                  {PLATE_LABEL[k]}
                </option>
              ))}
            </select>
            <Num value={p.length} onChange={(v) => setPlate(i, { length: v })} width={70} /> ×
            <Num value={p.width} onChange={(v) => setPlate(i, { width: v })} width={70} /> ×
            <Num value={p.thickness} onChange={(v) => setPlate(i, { thickness: v })} width={50} /> mm
            <span className="hint" title="0 = non renseignée">quantité</span>
            <Num value={p.quantity} onChange={(v) => setPlate(i, { quantity: Math.round(v) })} width={60} />
            <button className="btn small ghost" onClick={() => setDraft({ ...draft, plates: draft.plates.filter((_, j) => j !== i) })}>
              ✕
            </button>
            {p.material === 'hdpe' && (
              <div className="row hint" style={{ width: '100%', paddingLeft: 12, gap: 6, flexWrap: 'wrap' }}>
                fiche technique :
                <Num value={p.massKg ?? 0} onChange={(v) => setPlate(i, { massKg: v > 0 ? v : undefined })} width={50} /> kg / plaque · module E
                <Num value={p.E ?? 0} onChange={(v) => setPlate(i, { E: v > 0 ? v : undefined })} width={60} /> N/mm² · compression
                <Num value={p.fc ?? 0} onChange={(v) => setPlate(i, { fc: v > 0 ? v : undefined })} width={60} /> N/mm² · flexion
                <Num value={p.fm ?? 0} onChange={(v) => setPlate(i, { fm: v > 0 ? v : undefined })} width={50} /> N/mm² · poinçonnement
                <Num value={p.punchingKg ?? 0} onChange={(v) => setPlate(i, { punchingKg: v > 0 ? v : undefined })} width={60} /> kg sur Ø
                <Num value={p.punchingDiameter ?? 0} onChange={(v) => setPlate(i, { punchingDiameter: v > 0 ? v : undefined })} width={40} /> mm
                <span style={{ width: '100%' }}>
                  Plaque souple : elle ne répartit que près de ce qui est posé dessus. Sans module E (ou si la plaque n’est pas pleine : masse &lt; 80 % du PEHD plein), seule la diffusion à 45° dans
                  son épaisseur est comptée. La raideur du sol est celle choisie dans « Sol » (module de réaction).
                </span>
              </div>
            )}
          </div>
        ))}
        <div>
          <button className="btn small" onClick={() => setDraft({ ...draft, plates: [...draft.plates, { label: '', length: 1000, width: 1000, thickness: 18, quantity: 0, material: 'birch' }] })}>
            + Plaque
          </button>
          <button className="btn small ghost" onClick={() => setDraft({ ...draft, plates: [...draft.plates, ...VIEWBOX_STOCK.filter((v) => !draft.plates.some((p) => p.length === v.length && p.thickness === v.thickness && p.material === v.material))] })}>
            + Plaques Viewbox standard
          </button>
          <button
            className="btn small ghost"
            title="Plaque de répartition en polyéthylène vierge haute densité 2,2 × 1,1 m × 38 mm, 46 kg ; compression 7 288 kN/m² ; poinçonnement 1 173 kg sur Ø 20 mm (données fournisseur) — module E à saisir depuis la fiche technique"
            onClick={() =>
              setDraft({ ...draft, plates: [...draft.plates, { label: 'PEHD 220 × 110 × 38', length: 2200, width: 1100, thickness: 38, quantity: 0, material: 'hdpe', massKg: 46, fc: 7.288, punchingKg: 1173, punchingDiameter: 20 }] })
            }
          >
            + Plaque PEHD 220 × 110 × 38
          </button>
        </div>
        <b style={{ fontSize: 12 }}>Plaques de répartition du commerce (capacité du fabricant)</b>
        {draft.commercial.map((p, i) => (
          <div className="row" key={i}>
            <input type="text" style={{ width: 160 }} placeholder="modèle" value={p.label} onChange={(e) => setCom(i, { label: e.target.value })} />
            <Num value={p.length} onChange={(v) => setCom(i, { length: v })} width={70} /> ×
            <Num value={p.width} onChange={(v) => setCom(i, { width: v })} width={70} /> mm
            <span className="hint">charge admissible</span>
            <Num value={p.capacity / 1e3} onChange={(v) => setCom(i, { capacity: v * 1e3 })} width={60} /> kN
            <Num value={p.massKg} onChange={(v) => setCom(i, { massKg: v })} width={50} /> kg
            <button className="btn small ghost" onClick={() => setDraft({ ...draft, commercial: draft.commercial.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <button className="btn small" onClick={() => setDraft({ ...draft, commercial: [...draft.commercial, { label: '', length: 1200, width: 800, capacity: 100e3, massKg: 25 }] })}>
            + Plaque du commerce
          </button>
          <div className="spacer" style={{ flex: 1 }} />
          {msg && <span className="hint">{msg}</span>}
          <button className="btn primary small" onClick={() => void save()}>
            Enregistrer le stock
          </button>
        </div>
      </div>
    </div>
  );
}

/** Formulaire « Site et hypothèses » (portance, charges, vent, options de calage). */
import { HypothesesForm } from './SiteForm';
export { HypothesesForm };

/** Langue des PDF de calage et du rapport : dernier choix, mémorisé dans ce navigateur (étapes 5 et 6). */
const PDF_LANG_KEY = 'vem_structure_pdf_lang';
export function storedPdfLang(): Lang {
  try {
    const v = localStorage.getItem(PDF_LANG_KEY);
    return v === 'de' || v === 'en' ? v : 'fr';
  } catch {
    return 'fr';
  }
}
export function storePdfLang(l: Lang) {
  try {
    localStorage.setItem(PDF_LANG_KEY, l);
  } catch {
    /* stockage local indisponible */
  }
}

/** Choix de la langue d'un PDF (fiche de calage, plan des appuis, rapport, plan de calage A3). */
export function PdfLangSelect({ value, onChange, label = 'Langue du PDF' }: { value: Lang; onChange: (l: Lang) => void; label?: string }) {
  return (
    <label className="row" style={{ gap: 4 }} title="Langue du document PDF : français, allemand ou anglais">
      <span className="hint">🌐 {label}</span>
      <select
        value={value}
        data-testid="pdf-lang"
        onChange={(e) => {
          const l = e.target.value as Lang;
          storePdfLang(l);
          onChange(l);
        }}
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface GroundPanelProps {
  modules: EstimateModule[];
  /** origine des données, en tête des PDF (texte, ou un texte par langue du PDF) */
  source: string | Record<Lang, string>;
  /** clé de stockage local des hypothèses (panneau autonome) */
  storageKey: string;
  intro?: React.ReactNode;
  /** hypothèses fournies par l'étude (enregistrées avec elle) : le panneau ne les stocke pas lui-même */
  hyp?: Hypotheses;
  onHypChange?: (h: Hypotheses) => void;
  showHypotheses?: boolean;
  /** réactions du calcul complet (sinon estimation instantanée) */
  reactions?: Estimate | null;
  /** pieds à vérin (étape 3) : 6 appuis par Viewbox, chacun sur sa platine */
  jacks?: boolean;
  /** appuis hors des Viewbox (pieds des éléments terrasse posés au sol) */
  extraSupports?: AddedSupport[];
  /** blocs de calage bois dessinés dans le modèle sous les pieds (ou plaques sous la structure, contact par tronçons) */
  blocks?: DrawnBlock[];
  /** contact par tronçons (étape 3) : Viewbox posées au sol ou sur plaques / blocs */
  contact?: EstimateOptions['contact'];
  /** calage rapide sans modèle : murs, vitrages… saisis en forfait par Viewbox */
  withoutModel?: boolean;
  /** sortie de tige de vérin vérifiée par le calcul (mm) : rattrapage des niveaux pris par les vérins jusque-là */
  jackMax?: number;
  /** ouvre l'étape où le plan de calage A3 s'ajoute à un jeu de plans 2D */
  onSendToPlans?: () => void;
  /** calage calculé (ou null) : son matériel est enregistré avec l'étude (loading liste : sous-bois × 2) */
  onCalage?: (r: CalageResult | null) => void;
}

export function GroundPanel({ modules, source, storageKey, intro, hyp: hypProp, onHypChange, showHypotheses = true, reactions, jacks = false, extraSupports, blocks, contact = null, withoutModel = false, jackMax, onSendToPlans, onCalage }: GroundPanelProps) {
  const [localHyp, setLocalHyp] = useState<Hypotheses>(() => ({ ...DEFAULT_HYP, ...readStored(storageKey) }));
  const hyp = hypProp ?? localHyp;
  const setHyp = (update: (h: Hypotheses) => Hypotheses) => {
    if (onHypChange) onHypChange(update(hyp));
    else setLocalHyp(update);
  };
  const [stock, setStock] = useState<StructureStock>({ plates: [], commercial: [] });
  const [project, setProject] = useState<Project | null>(null);
  const [result, setResult] = useState<CalageResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showStock, setShowStock] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pointsBusy, setPointsBusy] = useState(false);
  const [showPoints, setShowPoints] = useState(false);
  const [planView, setPlanView] = useState<'check' | 'type' | 'level'>('check');
  // langue des PDF de calage (fiche, plan des appuis) : dernier choix mémorisé
  const [pdfLang, setPdfLang] = useState<Lang>(storedPdfLang);
  const sourceIn = (l: Lang) => (typeof source === 'string' ? source : source[l]);
  const [maxPub, setMaxPub] = useState<PublicMax | null>(null);
  const onCalageRef = useRef(onCalage);
  onCalageRef.current = onCalage;
  useEffect(() => onCalageRef.current?.(result), [result]);

  useEffect(() => {
    vem
      .getSetting<StructureStock>(STRUCTURE_STOCK_KEY)
      .then((s) => s && setStock({ plates: s.plates ?? [], commercial: s.commercial ?? [] }))
      .catch(() => {});
    if (PROJECT_ID) vem.project(PROJECT_ID).then(setProject).catch(() => {});
  }, []);

  useEffect(() => {
    if (hypProp) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(hyp));
    } catch {
      /* stockage local indisponible */
    }
  }, [hyp, storageKey, hypProp]);

  const input = useMemo(
    () => ({ ...calageInput(modules, hyp, stock, jacks, extraSupports, withoutModel, contact), reactions: reactions ?? undefined, ...(jackMax ? { jackMax } : {}), ...(blocks?.length ? { blocks } : {}) }),
    [modules, hyp, stock, reactions, jacks, extraSupports, withoutModel, jackMax, blocks, contact],
  );
  useEffect(() => {
    setPending(true);
    const t = setTimeout(() => {
      try {
        if (!modules.length) throw new Error('Aucune Viewbox à caler.');
        if (!(input.bearing > 0)) throw new Error('Portance admissible à renseigner.');
        setResult(computeCalage(input));
        // public maximal avec ce calage (dichotomie sur le nombre de personnes)
        setMaxPub(maxPublic(input, hyp.personKg));
        setError('');
      } catch (e) {
        setError((e as Error).message);
        setResult(null);
      }
      setPending(false);
    }, 250);
    return () => clearTimeout(t);
  }, [input, modules.length, hyp.personKg]);

  const preset = BEARING_PRESETS.find((p) => p.key === hyp.bearingPreset);

  // « 4 000 kg/m² = 39 kN/m² (prairie) » : toujours aussi en kN/m²
  const bearingText = () => {
    const whole = hyp.bearingUnit === 'kN/m²' || hyp.bearingUnit === 'kg/m²';
    const q = bearingFrom(hyp.bearingValue, hyp.bearingUnit);
    return `${n(hyp.bearingValue, whole ? 0 : 2)} ${hyp.bearingUnit}${hyp.bearingUnit === 'kN/m²' ? '' : ` = ${n(q * 1e3, q * 1e3 < 10 ? 1 : 0)} kN/m²`} (${preset?.label ?? 'saisie'})`;
  };
  /** hypothèses de la fiche de calage, dans la langue du PDF */
  const assumptions = (lang: Lang): Array<[string, string]> => {
    const N = (v: number, d = 0) => num(lang, v, d);
    const q = bearingFrom(hyp.bearingValue, hyp.bearingUnit) * 1e3;
    const bearing = `${N(hyp.bearingValue, hyp.bearingUnit === 'kN/m²' || hyp.bearingUnit === 'kg/m²' ? 0 : 2)} ${hyp.bearingUnit}${hyp.bearingUnit === 'kN/m²' ? '' : ` = ${N(q, q < 10 ? 1 : 0)} kN/m²`}`;
    const presetName = preset ? translate(lang, preset.label) : null;
    const levels = Math.max(0, ...modules.map((m) => m.level)) + 1;
    const placement = hyp.platePlacement ?? 'auto';
    const extras = (hyp.ceilingExtra ?? 0) > 0 || (hyp.floorExtra ?? 0) > 0 ? [((hyp.ceilingExtra ?? 0) * 1000) / 9.81, ((hyp.floorExtra ?? 0) * 1000) / 9.81] : null;
    // exploitation du rez-de-chaussée sous les 5 kN/m² du calcul de type statico 18-0573 : la structure n'est pas
    // vérifiée avec la charge réglementaire (ne pas l'écrire)
    const liveReduced = (hyp.liveGround ?? 5) < 5 - 1e-9;
    const T = {
      fr: {
        bearing: ['Portance admissible', `${bearing} (${preset?.label ?? 'saisie'})`],
        weight: ['Poids d’une Viewbox', `${N(hyp.moduleWeightKg)} kg pesés (plancher, sol, plafond et isolants compris)${extras ? ` + plafond ${N(extras[0])} kg/m² + sol ${N(extras[1])} kg/m² en plus` : ''}`],
        finishes: ['Murs, vitrages, garde-corps', withoutModel ? `${N((hyp.extraKN * 1000) / 9.81)} kg par Viewbox` : 'd’après le modèle, objet par objet'],
        live: ['Exploitation', `rez-de-chaussée ${N(hyp.liveGround ?? 5, 2)} kN/m², étages ${N(hyp.live, 2)} kN/m²`],
        pub: ['Public pour le sol', hyp.publicMode === 'persons' ? `limité à ${Math.round(hyp.persons)} personnes × ${N(hyp.personKg)} kg (nombre contrôlé sur place ; ${liveReduced ? `structure calculée avec ${N(hyp.liveGround ?? 5, 2)} kN/m² au rez-de-chaussée, moins que la charge réglementaire de 5 kN/m²` : 'structure vérifiée avec la charge réglementaire'})` : 'charge réglementaire (public libre)'],
        wind: ['Vent en / hors service', `${N(hyp.windIn, 2)} / ${N(hyp.windOut, 2)} kN/m², cp ${N(hyp.cp, 1)}`],
        react: ['Réaction pour la surface', hyp.staticoConversion ? 'Rz,Ed / 1,35 (statico)' : 'caractéristique (ELS)'],
        feet: contact
          ? ['Pose au sol', contact.mode === 'rims' ? 'posées directement au sol : toute la rive (UNP) porte, appui continu (tronçons d’environ 1 m vérifiés un par un)' : `sur ${contact.pads.length} plaque(s) / bloc(s) : la rive (UNP) porte sur la largeur de chaque plaque, une plaque hors rive porte les traverses / lisses`]
          : jacks ? ['Pieds à vérin', '6 par Viewbox (4 angles + 2 centraux), tiges Tr 24 × 5, sortie ≤ 5 cm ; vérins voisins sur une même plaque'] : ['Pieds centraux', hyp.middleFeet ? 'utilisés' : 'non (angles seuls)'],
        place: ['Pose des plaques', { auto: 'à fleur de la Viewbox, centrées seulement si nécessaire', flush: 'toujours à fleur de la Viewbox', centered: 'centrées sous chaque appui (statico)' }[placement]],
        vbx: ['Viewbox', `${modules.length} (${levels} niveau${levels > 1 ? 'x' : ''})`],
        src: ['Réactions', reactions ? (contact ? 'calcul complet (modèle 3D, 2ᵉ ordre), appuis élastiques le long des rives / profils (raideur du sol)' : jacks ? 'calcul complet (modèle 3D, 2ᵉ ordre), au moins l’estimation sous chaque vérin (vérins réglables)' : 'calcul complet (modèle 3D, 2ᵉ ordre)') : contact ? 'estimation instantanée (plancher rigide sur appuis élastiques)' : 'estimation instantanée (surfaces tributaires)'],
      },
      de: {
        bearing: ['Zul. Bodenpressung', `${bearing} (${presetName ?? 'Eingabe'})`],
        weight: ['Gewicht einer Viewbox', `${N(hyp.moduleWeightKg)} kg gewogen (inkl. Boden, Bodenbelag, Decke und Dämmung)${extras ? ` + Decke ${N(extras[0])} kg/m² + Boden ${N(extras[1])} kg/m² zusätzlich` : ''}`],
        finishes: ['Wände, Verglasungen, Geländer', withoutModel ? `${N((hyp.extraKN * 1000) / 9.81)} kg je Viewbox` : 'aus dem Modell, Bauteil für Bauteil'],
        live: ['Verkehrslast', `Erdgeschoss ${N(hyp.liveGround ?? 5, 2)} kN/m², Obergeschosse ${N(hyp.live, 2)} kN/m²`],
        pub: ['Publikum für den Boden', hyp.publicMode === 'persons' ? `begrenzt auf ${Math.round(hyp.persons)} Personen × ${N(hyp.personKg)} kg (vor Ort kontrolliert; ${liveReduced ? `Tragwerk mit ${N(hyp.liveGround ?? 5, 2)} kN/m² im Erdgeschoss berechnet, weniger als die Normlast von 5 kN/m²` : 'Tragwerk mit der Normlast nachgewiesen'})` : 'Normlast (freies Publikum)'],
        wind: ['Wind in / außer Betrieb', `${N(hyp.windIn, 2)} / ${N(hyp.windOut, 2)} kN/m², cp ${N(hyp.cp, 1)}`],
        react: ['Auflagerkraft für die Fläche', hyp.staticoConversion ? 'Rz,Ed / 1,35 (statico)' : 'charakteristisch (GZG)'],
        feet: contact
          ? ['Auflagerung', contact.mode === 'rims' ? 'direkt auf dem Boden: der ganze Randträger (UNP) trägt, durchgehende Auflagerung (Abschnitte von etwa 1 m einzeln nachgewiesen)' : `auf ${contact.pads.length} Platte(n) / Klotz/Klötzen: der Randträger (UNP) liegt über die Breite jeder Platte auf, eine Platte ohne Randträger trägt die Quer- / Längsträger`]
          : jacks ? ['Spindelfüße', '6 je Viewbox (4 Ecken + 2 Mitte), Gewindestangen Tr 24 × 5, Auszug ≤ 5 cm; benachbarte Spindeln auf einer Platte'] : ['Mittelfüße', hyp.middleFeet ? 'verwendet' : 'nein (nur Ecken)'],
        place: ['Lage der Platten', { auto: 'bündig mit der Viewbox, nur wenn nötig mittig', flush: 'immer bündig mit der Viewbox', centered: 'mittig unter jedem Auflager (statico)' }[placement]],
        vbx: ['Viewbox', `${modules.length} (${levels} Ebene${levels > 1 ? 'n' : ''})`],
        src: ['Auflagerkräfte', reactions ? (contact ? 'Gesamtberechnung (3D-Modell, Theorie II. Ordnung), elastische Bettung entlang der Träger (Bettungsmodul)' : jacks ? 'Gesamtberechnung (3D-Modell, Theorie II. Ordnung), unter jeder Spindel mindestens die Schätzung (verstellbare Spindeln)' : 'Gesamtberechnung (3D-Modell, Theorie II. Ordnung)') : 'Sofortschätzung (Einzugsflächen)'],
      },
      en: {
        bearing: ['Allowable bearing', `${bearing} (${presetName ?? 'entered'})`],
        weight: ['Weight of one Viewbox', `${N(hyp.moduleWeightKg)} kg weighed (floor, floor finish, ceiling and insulation included)${extras ? ` + ceiling ${N(extras[0])} kg/m² + floor ${N(extras[1])} kg/m² in addition` : ''}`],
        finishes: ['Walls, glazing, railings', withoutModel ? `${N((hyp.extraKN * 1000) / 9.81)} kg per Viewbox` : 'from the model, item by item'],
        live: ['Imposed load', `ground floor ${N(hyp.liveGround ?? 5, 2)} kN/m², upper floors ${N(hyp.live, 2)} kN/m²`],
        pub: ['Public for the ground', hyp.publicMode === 'persons' ? `limited to ${Math.round(hyp.persons)} persons × ${N(hyp.personKg)} kg (number controlled on site; ${liveReduced ? `structure calculated with ${N(hyp.liveGround ?? 5, 2)} kN/m² on the ground floor, less than the code load of 5 kN/m²` : 'structure checked with the code load'})` : 'code load (free public)'],
        wind: ['Wind in / out of service', `${N(hyp.windIn, 2)} / ${N(hyp.windOut, 2)} kN/m², cp ${N(hyp.cp, 1)}`],
        react: ['Reaction for the area', hyp.staticoConversion ? 'Rz,Ed / 1.35 (statico)' : 'characteristic (SLS)'],
        feet: contact
          ? ['Bearing on the ground', contact.mode === 'rims' ? 'placed directly on the ground: the whole floor edge beam (UNP) bears, continuous support (segments of about 1 m checked one by one)' : `on ${contact.pads.length} plate(s) / block(s): the edge beam (UNP) bears over the width of each plate, a plate away from the edge carries the cross / longitudinal members`]
          : jacks ? ['Jack feet', '6 per Viewbox (4 corners + 2 middle), Tr 24 × 5 rods, extension ≤ 5 cm; neighbouring jacks on one plate'] : ['Middle feet', hyp.middleFeet ? 'used' : 'no (corners only)'],
        place: ['Plate laying', { auto: 'flush with the Viewbox, centred only where needed', flush: 'always flush with the Viewbox', centered: 'centred under each support (statico)' }[placement]],
        vbx: ['Viewbox', `${modules.length} (${levels} level${levels > 1 ? 's' : ''})`],
        src: ['Reactions', reactions ? (contact ? 'full calculation (3D model, 2nd order), elastic supports along the beams (subgrade modulus)' : jacks ? 'full calculation (3D model, 2nd order), at least the estimate under each jack (adjustable jacks)' : 'full calculation (3D model, 2nd order)') : 'instant estimate (tributary areas)'],
      },
    }[lang];
    return [T.bearing, T.weight, T.finishes, T.live, T.pub, T.wind, T.react, T.feet, T.place, T.vbx, T.src] as Array<[string, string]>;
  };

  const exportPdf = async () => {
    if (!result) return;
    setPdfBusy(true);
    try {
      const [{ renderToStaticMarkup }, { buildPdf, fontsUsed }, { loadFonts }, { groundSheetPages }] = await Promise.all([
        freshImport(() => import('react-dom/server')),
        freshImport(() => import('../../sheets/pdf/pdf')),
        freshImport(() => import('../../sheets/pdf/assets')),
        freshImport(() => import('../../structure/report/groundSheet')),
      ]);
      const name = project ? `${project.internalNumber ? project.internalNumber + ' · ' : ''}${project.name}` : 'Projet';
      const svgs = groundSheetPages({
        result,
        modules,
        info: { project: name, client: project?.client?.name ?? undefined, source: sourceIn(pdfLang), date: new Date().toLocaleDateString(pdfLang === 'en' ? 'en-GB' : pdfLang === 'de' ? 'de-DE' : 'fr-FR'), assumptions: assumptions(pdfLang) },
        lang: pdfLang,
      }).map((p) => renderToStaticMarkup(p));
      const fonts = await loadFonts(fontsUsed(svgs));
      const title = { fr: 'Fiche de calage', de: 'Unterpallungsblatt', en: 'Packing sheet' }[pdfLang];
      const pdf = await buildPdf(svgs.map((svg) => ({ svg, paper: 'A3' as const, size: { w: 210, h: 297 } })), fonts, { title: `${title} — ${name}`, subject: sourceIn(pdfLang) });
      downloadBlob(`${title} ${name.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`, pdf.output('blob'));
    } catch (e) {
      setError(`PDF impossible : ${(e as Error).message}`);
    }
    setPdfBusy(false);
  };

  const roadway = result?.roadway ?? null;
  // choix de calage (enregistrés avec les hypothèses)
  const choices: CalageChoices = hyp.calage ?? {};
  const setChoices = (update: (c: CalageChoices) => CalageChoices) => setHyp((h) => ({ ...h, calage: update(h.calage ?? {}) }));
  const setIn = <T,>(map: Record<string, T> | undefined, k: string, v: T | undefined) => {
    const out = { ...(map ?? {}) };
    if (v === undefined) delete out[k];
    else out[k] = v;
    return out;
  };
  // pistes pour faire passer le sol (madriers, plateau, blocs centrés…) : cherchées sur demande (quelques secondes)
  const [remedies, setRemedies] = useState<CalageRemedy[] | null>(null);
  const [searching, setSearching] = useState(false);
  // les pistes restent affichées quand on en applique ou en retire une (le calcul change, pas les pistes)
  const keepRemedies = useRef(false);
  useEffect(() => {
    if (keepRemedies.current) keepRemedies.current = false;
    else setRemedies(null);
  }, [result]);
  const searchRemedies = () => {
    if (!result) return;
    setSearching(true);
    setTimeout(() => {
      try {
        // pistes cherchées sur le calage sans la solution retenue (les plaques), blocs centrés gardés s'ils sont retenus
        const baseInput = input.choices?.remedy ? { ...input, choices: { ...input.choices, remedy: undefined } } : input;
        setRemedies(calageRemedies(baseInput, baseInput === input ? result : computeCalage(baseInput)));
      } finally {
        setSearching(false);
      }
    }, 20);
  };
  const applyRemedy = (r: CalageRemedy) => {
    if (!r.apply) return;
    const a = r.apply;
    keepRemedies.current = true;
    setChoices((c) => (a === 'centre-blocks' ? { ...c, centreBlocks: true } : { ...c, remedy: a, roadway: false, longrine: false }));
  };
  const removeRemedy = (what: 'remedy' | 'centre') => {
    keepRemedies.current = true;
    setChoices((c) => {
      const out = { ...c };
      if (what === 'remedy') delete out.remedy;
      else delete out.centreBlocks;
      return out;
    });
  };
  const choiceSet: ChoiceSetters = {
    choices,
    setType: (k, v) => setChoices((c) => ({ ...c, byType: setIn(c.byType, k, v) })),
    setSupport: (id, v) => setChoices((c) => ({ ...c, bySupport: setIn(c.bySupport, id, v) })),
    setPlace: (id, v) => setChoices((c) => ({ ...c, placeBySupport: setIn(c.placeBySupport, id, v) })),
    setRoadway: (on) => setChoices((c) => ({ ...c, roadway: on })),
    setRoadwayOverhang: (mm) => setChoices((c) => ({ ...c, roadwayOverhang: mm })),
    reset: () => setChoices(() => ({})),
  };
  const bearingLabel = (() => {
    if (pdfLang === 'fr') return bearingText();
    const q = bearingFrom(hyp.bearingValue, hyp.bearingUnit) * 1e3;
    const name = preset ? translate(pdfLang, preset.label) : pdfLang === 'de' ? 'Eingabe' : 'entered';
    return `${num(pdfLang, q, q < 10 ? 1 : 0)} kN/m² = ${num(pdfLang, (q * 1e3) / 9.81, 0)} kg/m² (${name})`;
  })();
  const exportPoints = async () => {
    if (!result || !roadway) return;
    setPointsBusy(true);
    try {
      const [{ renderToStaticMarkup }, { buildPdf, fontsUsed }, { loadFonts }, { groundPointsPages }] = await Promise.all([
        freshImport(() => import('react-dom/server')),
        freshImport(() => import('../../sheets/pdf/pdf')),
        freshImport(() => import('../../sheets/pdf/assets')),
        freshImport(() => import('../../structure/report/groundPoints')),
      ]);
      const name = project ? `${project.internalNumber ? project.internalNumber + ' · ' : ''}${project.name}` : 'Projet';
      const svgs = groundPointsPages({
        modules,
        estimate: result.estimate,
        roadway,
        bearingLabel,
        checks: result.checks,
        levels: result.levels,
        lang: pdfLang,
        noTuv: !!result.tuv.notApplicable,
        remedy: result.remedy,
        slab: result.slab,
        info: { project: name, client: project?.client?.name ?? undefined, source: sourceIn(pdfLang), date: new Date().toLocaleDateString(pdfLang === 'en' ? 'en-GB' : pdfLang === 'de' ? 'de-DE' : 'fr-FR'), assumptions: [] },
      }).map((p) => renderToStaticMarkup(p));
      const fonts = await loadFonts(fontsUsed(svgs));
      const title = { fr: 'Plan des appuis au sol', de: 'Auflagerplan', en: 'Ground support plan' }[pdfLang];
      const pdf = await buildPdf(
        svgs.map((svg) => ({ svg, paper: 'A3' as const, size: { w: 210, h: 297 } })),
        fonts,
        { title: `${title} — ${name}`, subject: sourceIn(pdfLang) },
      );
      downloadBlob(`${title} ${name.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`, pdf.output('blob'));
    } catch (e) {
      setError(`PDF impossible : ${(e as Error).message}`);
    }
    setPointsBusy(false);
  };

  // appui de calage (plaque) d'un point : les vérins voisins partagent une plaque
  const checkById = new Map((result?.checks ?? []).flatMap((c) => [c.id, ...c.members].map((id) => [id, c] as const)));
  const selCheck = selected ? checkById.get(selected) : undefined;
  const failing = result ? result.checks.filter((c) => verdictOf(c.eta) === 'fail').length : 0;
  const persons = hyp.publicMode === 'persons' ? Math.max(0, Math.round(hyp.persons)) : null;
  const publicLine = (() => {
    if (!maxPub) return null;
    const mx = `${maxPub.persons} personne${maxPub.persons > 1 ? 's' : ''}`;
    if (persons !== null) {
      const kn = n((persons * hyp.personKg * 9.81) / 1e3, 1);
      if (maxPub.empty) return { ok: false, text: `Public limité à ${persons} personnes (${kn} kN) : même sans public, ce calage ne passe pas — changer les plaques ou prendre des plaques de roulage.` };
      if (persons <= maxPub.persons) return { ok: true, text: `Public limité à ${persons} personnes (${kn} kN) : OK — ce calage accepte jusqu’à ${maxPub.full ? `la charge réglementaire complète (≈ ${maxPub.fullPersons} personnes)` : mx}.` };
      return { ok: false, text: `Public limité à ${persons} personnes (${kn} kN) : trop pour ce calage — au plus ${mx}, ou des plaques plus grandes.` };
    }
    if (maxPub.full) return { ok: true, text: `Public libre : la charge réglementaire complète (≈ ${maxPub.fullPersons} personnes de ${n(hyp.personKg, 0)} kg) passe avec ce calage.` };
    if (maxPub.empty) return { ok: false, text: 'Même sans public, ce calage ne passe pas : changer les plaques ou prendre des plaques de roulage.' };
    return {
      ok: false,
      text: `Avec la charge réglementaire (≈ ${maxPub.fullPersons} personnes) ce calage ne passe pas. Pour le garder, limiter le public à ${mx} (Public pour le sol › nombre de personnes limité), ou changer les plaques.`,
    };
  })();
  const select = (id: string) => {
    setSelected(id);
    setPlanView('check');
  };
  return (
    <div className="page">
      {intro}
      {reactions !== undefined && (
        <div className="hint" style={{ margin: '4px 0' }}>
          {reactions ? 'Réactions : calcul complet (modèle 3D, 2ᵉ ordre, combinaisons statico).' : 'Réactions : estimation instantanée (surfaces tributaires) — lancer le calcul complet (étape 3) pour les réactions du modèle 3D.'}
        </div>
      )}
      {showHypotheses && <HypothesesForm hyp={hyp} setHyp={setHyp} withoutModel={withoutModel} />}
      {!showHypotheses && (
        <div className="card">
          <div className="card-body row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <b>Sol</b>
            <select
              value={hyp.bearingPreset}
              onChange={(e) => {
                const p = BEARING_PRESETS.find((x) => x.key === e.target.value);
                setHyp((h) => ({ ...h, bearingPreset: e.target.value, ...(p?.value ? { bearingValue: p.value * 1e3, bearingUnit: 'kN/m²' as const } : {}) }));
              }}
            >
              {BEARING_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                  {p.value ? ` — ${p.value * 1e3} kN/m²` : ' — à renseigner'}
                </option>
              ))}
            </select>
            <span className="row" style={{ gap: 4 }}>
              portance admissible <BearingInputs hyp={hyp} set={(k, v) => setHyp((h) => ({ ...h, [k]: v }))} />
            </span>
            <span className="hint">{bearingConversions(hyp.bearingValue, hyp.bearingUnit)}</span>
            <select value={bearingModeOf(hyp)} onChange={(e) => setHyp((h) => ({ ...h, bearingMode: e.target.value as 'pressure' | 'distributed' }))} data-testid="bearing-mode-quick">
              <option value="pressure">pression maxi sous chaque plaque (sol)</option>
              <option value="distributed">poids admis par m² de dalle (charge répartie)</option>
            </select>
          </div>
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
      {pending && !result && <div className="hint">Calcul…</div>}
      {result && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="v">{modules.length}</div>
              <div className="l">Viewbox</div>
            </div>
            <div className="stat">
              <div className="v">{result.checks.length}</div>
              <div className="l">plaques de calage ({result.estimate.groups.length} points d’appui)</div>
            </div>
            <div className="stat">
              <div className="v">{n((result.estimate.verticalK ?? result.estimate.totalG + result.estimate.totalQ) / 1e3, 0)} kN</div>
              <div className="l">charge verticale totale (ELS la plus lourde)</div>
            </div>
            <div className="stat">
              <div className="v">{kN(Math.max(...result.estimate.reactions.map((r) => r.Rk)), 0)}</div>
              <div className="l">appui le plus chargé (Rz,k)</div>
            </div>
            {maxPub && (
              <div className={`stat ${publicLine?.ok ? '' : 'warn'}`}>
                <div className="v">{persons !== null ? `${persons} / ${maxPub.persons}` : maxPub.full ? 'libre' : String(maxPub.persons)}</div>
                <div className="l">
                  {persons !== null
                    ? 'personnes prévues / maximum avec ce calage'
                    : maxPub.full
                      ? `public : charge réglementaire admise (≈ ${maxPub.fullPersons} pers.)`
                      : `personnes au plus avec ce calage (réglementaire ≈ ${maxPub.fullPersons})`}
                </div>
              </div>
            )}
            <div className="stat">
              <div className="v">{n(kNm2(input.bearing), kNm2(input.bearing) < 10 ? 1 : 0)} kN/m²</div>
              <div className="l">{result.slab ? `charge admise sur la dalle (${n(kgm2(input.bearing), 0)} kg/m²) — ensemble : ${n(kgm2(result.slab.global.q), 0)} kg/m²` : `portance admissible (${n(kgm2(input.bearing), 0)} kg/m²)`}</div>
            </div>
            <div className={`stat ${failing ? 'warn' : ''}`}>
              <div className="v">{failing ? `${failing} ✖` : 'OK'}</div>
              <div className="l">{failing ? `appui(s) trop chargé(s) pour le sol ou les plaques` : `calage vérifié${result.roadwayOn ? ' (plaques de roulage)' : ''}`}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{result.estimate.method === 'fem' ? 'Plan des appuis — calcul complet' : 'Plan des appuis — estimation'}</h2>
              <div className="spacer" style={{ flex: 1 }} />
              <div className="row" style={{ gap: 2 }}>
                <button className={`tab ${planView === 'check' ? 'active' : ''}`} onClick={() => setPlanView('check')}>
                  Pression au sol
                </button>
                <button className={`tab ${planView === 'type' ? 'active' : ''}`} onClick={() => setPlanView('type')}>
                  Types d’appui
                </button>
                <button className={`tab ${planView === 'level' ? 'active' : ''}`} onClick={() => setPlanView('level')} title="Niveaux du sol relevés sous chaque pied (mm) : cliquer un pied et taper sa valeur">
                  Niveaux du sol{hyp.groundLevels?.length ? ` (${result.levels?.known ?? 0})` : ''}
                </button>
              </div>
              {planView === 'check'
                ? (
                    [
                      ['ok', 'OK'],
                      ['limit', 'limite (η 0,9–1)'],
                      ['fail', 'dépassé'],
                    ] as const
                  ).map(([k, l]) => (
                    <span key={k} className="chip">
                      <i style={{ background: CHECK_COLORS[k] }} />
                      {l}
                    </span>
                  ))
                : planView === 'level'
                  ? (
                      [
                        ['ref', 'référence (point haut)'],
                        ['known', 'relevé'],
                        ['over', 'au-delà du vérin'],
                        ['unknown', 'inconnu'],
                      ] as const
                    ).map(([k, l]) => (
                      <span key={k} className="chip">
                        <i style={{ background: LEVEL_COLORS[k] }} />
                        {l}
                      </span>
                    ))
                  : [...new Map(result.types.map((t) => [t.typeKey, t.label.split(' — ')[0]])).entries()].map(([k, l]) => (
                    <span key={k} className="chip">
                      <i style={{ background: typeColor(k) }} />
                      {l}
                    </span>
                  ))}
              <PdfLangSelect value={pdfLang} onChange={setPdfLang} />
              <button className="btn primary small" disabled={pdfBusy} onClick={() => void exportPdf()}>
                {pdfBusy ? 'PDF…' : '⬇ Fiche PDF'}
              </button>
            </div>
            <div className="card-body">
              <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                <label className="row" style={{ gap: 6 }} title="À fleur : la plaque ne dépasse pas de l’installation ; la charge n’étant pas au centre de la plaque, seule l’emprise centrée sur la charge compte (B’ = B − 2 e) — sous un angle extérieur, 2 × 15,5 cm avec vérins.">
                  <b>Pose des plaques</b>
                  <select value={hyp.platePlacement ?? 'auto'} onChange={(e) => setHyp((h) => ({ ...h, platePlacement: e.target.value as PlatePlacement }))}>
                    <option value="auto">À fleur de la Viewbox, centrées si nécessaire (conseillé)</option>
                    <option value="flush">Toujours à fleur de la Viewbox</option>
                    <option value="centered">{result.tuv.notApplicable ? 'Centrées sous chaque appui' : 'Centrées sous chaque appui (statico / TÜV)'}</option>
                  </select>
                </label>
                {/* Prüfbuch TÜV : seulement pour des Viewbox (types de structure personnalisés : non applicable) */}
                {!result.tuv.notApplicable && (
                  <label className="row" style={{ gap: 6 }} title={CALAGE_LABELS.fr.legal(jacks).join('\n')}>
                    <input type="checkbox" checked={hyp.tuvMinimum ?? true} onChange={(e) => setHyp((h) => ({ ...h, tuvMinimum: e.target.checked }))} />
                    Plaques minimales du Prüfbuch TÜV 190060 B (plan 18-0573-03)
                  </label>
                )}
                {result.tuv.tuvMinimum && (
                  <span className={`badge ${result.tuv.ok === false || !result.tuv.bearingOk ? 'warn' : ''}`}>
                    {!result.tuv.bearingOk ? 'portance < 200 kN/m² : hors Prüfbuch' : result.tuv.ok === false ? 'calage < minimum du Prüfbuch' : result.tuv.ok ? 'conforme au Prüfbuch' : 'Prüfbuch : non comparable'}
                  </span>
                )}
              </div>
              <svg viewBox="0 0 1000 420" style={{ width: '100%', maxHeight: 460, background: '#fff', borderRadius: 6 }}>
                <GroundPlan
                  modules={modules}
                  reactions={result.estimate.reactions}
                  x={0}
                  y={0}
                  w={1000}
                  h={420}
                  text={14}
                  selected={selected}
                  onSelect={planView === 'level' ? setSelected : select}
                  {...(planView === 'check'
                    ? // même plan que la fiche PDF (checkPlan)
                      checkPlan(result)
                    : planView === 'level'
                    ? {
                        plates: planPlates(result.checks, { remedy: result.remedy }),
                        pointColor: (r) => levelPointStyle(result, hyp.groundLevels, r).color,
                        pointSub: (r) => levelPointStyle(result, hyp.groundLevels, r).sub,
                      }
                    : {
                        plates: planPlates(result.checks, { remedy: result.remedy }),
                        pointColor: (r) => {
                          const c = checkById.get(r.group.id);
                          return c ? typeColor(c.typeKey) : undefined;
                        },
                      })}
                />
              </svg>
              <div className="hint" style={{ marginTop: 4 }}>
                {planView === 'level'
                  ? 'Niveau du sol relevé sous chaque pied (mm, valeurs relatives) ; ↑ = rehausse à apporter pour poser la Viewbox de niveau (le point le plus haut sert de référence).'
                  : planView === 'check'
                    ? result.slab
                      ? `Dalle en charge répartie (${n((input.bearing * 1e6) / 9.81, 0)} kg/m² admis) : chaque zone en pointillés = la dalle sous une Viewbox. « Dalle : … kg/m² » au milieu de chaque zone = poids sur la dalle au m² sous cette Viewbox (tous ses pieds ensemble dans la combinaison la plus lourde + calage, divisé par la surface) : c’est lui qui est vérifié. Le chiffre dans chaque plaque ou bloc = ce même poids au m² sur la dalle à cet endroit (ce n’est pas une pression).${result.roadwayOn ? ' Grand contour en tirets = plaques de roulage sur toute la surface.' : ''} Ajouter des appuis sous une Viewbox répartit sa charge entre ses pieds mais ne change pas ce poids ; la charge sous chaque pied (kN) est à comparer à la charge ponctuelle admise par l’exploitant. Ensemble de l’installation : ${n((result.slab.global.q * 1e6) / 9.81, 0)} kg/m². Cliquer sur un appui pour voir le détail.`
                      : `Chiffres dans chaque plaque ou bloc = pression au sol finale (portance admise : ${n(input.bearing * 1e3, input.bearing * 1e3 < 10 ? 1 : 0)} kN/m² = ${n((input.bearing * 1e6) / 9.81, 0)} kg/m²). Couleur = pression au sol avec le calage appliqué, rapportée à la portance. Cliquer sur un appui pour voir le détail et changer son calage.`
                    : 'Couleur = type d’appui.'}{' '}
                Plaques dessinées à l’échelle à leur place (pointillés ▲ = plaque centrée, elle dépasse de la Viewbox) ; les vérins voisins sont sur une même plaque.
              </div>
              {planView === 'level' && (
                <GroundLevelsCard
                  result={result}
                  modules={modules}
                  levels={hyp.groundLevels}
                  onChange={(lv: GroundLevel[]) => setHyp((h) => ({ ...h, groundLevels: lv }))}
                  selected={selected}
                  onSelect={setSelected}
                  jacks={jacks}
                  onSendToPlans={onSendToPlans}
                />
              )}
              {selCheck && planView !== 'level' && <SupportPanel c={selCheck} result={result} stock={input.stock} set={choiceSet} onClose={() => setSelected(null)} />}
              <div className="hint" style={{ marginTop: 6 }}>
                {result.estimate.method === 'fem'
                  ? result.estimate.envelope
                    ? 'Réactions du modèle 3D (2ᵉ ordre, combinaisons statico), et au moins celles de l’estimation sous chaque vérin : le calcul 3D met tous les vérins exactement au même niveau, sur site leur réglage répartit la charge autrement (les pieds centraux peuvent porter plus).'
                    : 'Réactions du modèle 3D (2ᵉ ordre, combinaisons statico) : Rz,k maxi de chaque appui sur les combinaisons ELS.'
                  : 'Estimation par surfaces tributaires et basculement en bloc rigide : ordre de grandeur, remplacé par le calcul complet de l’étude structure.'}{' '}
                {GROUND_NOTE}
              </div>
            </div>
          </div>

          <CalageDiagnostic result={result} set={choiceSet} onSelect={select} publicLine={publicLine} />
          {(result.checks.some((c) => c.eta > 1) || !!choices.remedy || !!choices.centreBlocks) && (
            <RemediesCard
              remedies={remedies}
              bearing={input.bearing}
              searching={searching}
              onSearch={searchRemedies}
              result={result}
              choices={choices}
              onApply={applyRemedy}
              onRemove={removeRemedy}
            />
          )}

          {roadway && (
            <div className="card">
              <div className="card-head">
                <h2>Plaques de roulage — répartition uniforme</h2>
                <span className="hint">toute la surface couverte par des plaques jointives : charge verticale / surface</span>
                <div className="spacer" style={{ flex: 1 }} />
                <PdfLangSelect value={pdfLang} onChange={setPdfLang} />
                <button className="btn primary small" disabled={pointsBusy} onClick={() => void exportPoints()}>
                  {pointsBusy ? 'PDF…' : '⬇ Plan des appuis au sol (PDF)'}
                </button>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Field label="Poids propre des plaques" hint="acier 20 mm ≈ 157 kg/m², aluminium ≈ 35 kg/m², plaques PEHD ≈ 15 kg/m² ; 0 = non compté">
                  <Num value={hyp.roadwayKg} onChange={(v) => setHyp((h) => ({ ...h, roadwayKg: Math.max(0, v) }))} width={60} /> kg/m²
                </Field>
                <Field label="Épaisseur des plaques" hint="pour la coupe du calage et la hauteur de la Viewbox au-dessus de la dalle ; 0 = inconnue">
                  <Num value={hyp.roadwayMm ?? 0} onChange={(v) => setHyp((h) => ({ ...h, roadwayMm: Math.max(0, v) }))} width={60} /> mm
                </Field>
                <div className="stats">
                  <div className="stat">
                    <div className="v">{n(roadway.area / 1e6, 1)} m²</div>
                    <div className="l">surface couverte</div>
                  </div>
                  <div className="stat">
                    <div className="v">{n(roadway.load / 1e3, 0)} kN</div>
                    <div className="l">charge verticale ({n(roadway.load / 9.81e3, 1)} t)</div>
                  </div>
                  <div className={`stat ${verdictOf(roadway.etaMean) === 'ok' ? '' : 'warn'}`}>
                    <div className="v">{n(kNm2(roadway.mean), 2)} kN/m²</div>
                    <div className="l">
                      répartition uniforme ({n(kgm2(roadway.mean), 0)} kg/m²) — η {n(roadway.etaMean, 2)}
                    </div>
                  </div>
                  {roadway.max && (
                    <div className={`stat ${verdictOf(roadway.etaMax) === 'ok' ? '' : 'warn'}`}>
                      <div className="v">{n(kNm2(roadway.max.q), 2)} kN/m²</div>
                      <div className="l">
                        emprise la plus chargée ({n(kgm2(roadway.max.q), 0)} kg/m²) — {roadway.max.stack.join(' + ')}
                      </div>
                    </div>
                  )}
                </div>
                <svg viewBox="0 0 1000 420" style={{ width: '100%', maxHeight: 460, background: '#fff', borderRadius: 6 }}>
                  <GroundPlan
                    modules={modules}
                    reactions={result.estimate.reactions}
                    x={0}
                    y={0}
                    w={1000}
                    h={420}
                    text={14}
                    axes
                    selected={selected}
                    onSelect={setSelected}
                    zoneFill={(m) => {
                      const z = roadway.zones.find((x) => x.module === m.id);
                      return z ? pressureFill(z.eta) : undefined;
                    }}
                    zoneLabel={(m, levels) => {
                      const z = roadway.zones.find((x) => x.module === m.id);
                      const lv = `${levels} niveau${levels > 1 ? 'x' : ''}`;
                      return z ? [`${n(kNm2(z.q), 1)} kN/m²`, lv] : [lv];
                    }}
                  />
                </svg>
                <Records records={roadway.records} />
                <div className="hint">
                  Portance {bearingLabel}. Répartition uniforme : plaques rigides, jointives et bien posées ; si elles ne répartissent que sous chaque Viewbox, retenir l’emprise la plus chargée (teinte : pression /
                  portance). Pression locale sous les platines et flexion des plaques non vérifiées.
                </div>
                <div>
                  <button className="btn small ghost" onClick={() => setShowPoints(!showPoints)}>
                    {showPoints ? 'Masquer les coordonnées' : `Coordonnées des ${result.estimate.reactions.length} appuis`}
                  </button>
                </div>
                {showPoints && (
                  <table className="list">
                    <thead>
                      <tr>
                        <th>Point</th>
                        <th>Type</th>
                        <th>Viewbox au sol</th>
                        <th className="num">x (m)</th>
                        <th className="num">y (m)</th>
                        <th className="num">Rz,k</th>
                        <th className="num">Rz,Ed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const o = planOrigin(modules);
                        return result.estimate.reactions.map((r) => {
                          const [x, y] = planCoords(r.group.position, o);
                          return (
                            <tr key={r.group.id} onClick={() => setSelected(r.group.id)} style={{ cursor: 'pointer', background: selected === r.group.id ? 'rgba(96,165,250,.12)' : undefined }}>
                              <td>{r.group.id}</td>
                              <td>{supportType(r)}</td>
                              <td>{r.group.moduleIds.filter((id) => modules.some((m) => m.id === id && m.level === 0)).join(', ') || r.group.moduleIds.join(', ')}</td>
                              <td className="num">{n(x / 1e3, 2)}</td>
                              <td className="num">{n(y / 1e3, 2)}</td>
                              <td className="num">{kN(r.Rk)}</td>
                              <td className="num">{kN(r.REd)}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {!!result.warnings.length && (
            <div className="warnings">
              {result.warnings.map((w, k) => (
                <div key={k} className="warning warning">
                  <span className="sev">ATTENTION</span>
                  <span className="msg">{w}</span>
                </div>
              ))}
            </div>
          )}

          {result.types.map((t) => (
            <div className="card" key={t.key}>
              <div className="card-head">
                <span className="chip">
                  <i style={{ background: typeColor(t.typeKey) }} />
                  {t.label}
                </span>
                {t.tuv && <span className={`badge ${t.tuv.ok === false ? 'warn' : ''}`} title={t.tuv.text}>{t.tuv.ok === false ? 'Prüfbuch ✖' : t.tuv.ok ? 'Prüfbuch ✔' : 'Prüfbuch —'}</span>}
                <span className="hint">
                  {t.reactions.length} appui(s) — Rz,k maxi {kN(t.Rzk)}, Rz,Ed maxi {kN(t.RzEd)} (statico : Rz,Ed / 1,35 = {kN(t.RzEd / 1.35)}) —{' '}
                  {t.block && t.checks[0]?.block
                    ? `pied ${n(t.a1 / 10, 0)} × ${n(t.a2 / 10, 0)} cm sur le bloc, bloc ${t.checks[0].block.dims} ${result.roadwayOn ? 'sur les plaques de roulage' : t.checks[0].layerList.length ? 'sur les plaques choisies' : 'au sol'}`
                    : `contact ${n(t.a1 / 10, 0)} × ${n(t.a2 / 10, 0)} cm`}
                </span>
                <div className="spacer" style={{ flex: 1 }} />
                <span className={`badge ${t.standard ? 'ok' : 'orange'}`}>
                  {t.chosen ? (t.standard || t.chosen.kind === 'custom' || t.chosen.kind === 'roadway' ? VERDICT_LABEL[verdictOf(t.chosen.eta)] : 'hors standard') : 'aucune solution'}
                </span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <TypeChoice t={t} result={result} stock={input.stock} set={choiceSet} onSelect={select} selected={selected} />
                {t.block && (
                  <div className="hint">
                    Blocs de bois dessinés dans le modèle : {[...new Set(t.checks.map((c) => `${c.block!.id} ${c.block!.dims} (${n(c.block!.massKg, 0)} kg${c.block!.massSource === 'computed' ? ', calculé' : ''})`))].join(' · ')}. Pieds → bois sous chaque pied → diffusion dans le bloc (45°, centrée
                    sur la charge) → poids du bloc → sol ; les plaques choisies se posent sous le bloc, centrées.
                  </div>
                )}
                {!t.block && (
                <table className="list" style={{ maxWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Plaques empilées</th>
                      <th className="num">1</th>
                      <th className="num">2</th>
                      <th className="num">3</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        {t.plate.side / 10} × {t.plate.side / 10} cm — épaisseur requise par plaque
                      </td>
                      {t.plate.h.map((h, k) => (
                        <td key={k} className="num">
                          {n(h / 10, 1)} cm
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                )}
                {t.solutions.map((s, k) => (
                  <SolutionRow key={k} s={s} chosen={s === t.chosen} />
                ))}
                {!!t.extra.length && <Records records={t.extra} />}
              </div>
            </div>
          ))}

          {result.longrine && (
            <div className="card">
              <div className="card-head">
                <h2>Variante : longrines sous les grands côtés</h2>
                <div className="spacer" style={{ flex: 1 }} />
                <button
                  className={`btn small ${result.longrineChosen ? '' : 'ghost'}`}
                  data-testid="longrine-toggle"
                  onClick={() => setChoices((c) => ({ ...c, longrine: !result.longrineChosen }))}
                  title="Par défaut le plan de calage dessine les plaques de chaque type d’appui (Prüfbuch). Les longrines ne remplacent les plaques que si tu les choisis."
                >
                  {result.longrineChosen ? '↩ Revenir aux plaques' : 'Retenir les longrines'}
                </button>
              </div>
              <div className="card-body">
                <SolutionRow s={result.longrine.solution} chosen={result.longrineChosen} />
                {!result.longrineChosen && <div className="hint">Variante seulement : le plan de calage, la fiche et le matériel gardent les plaques par type d’appui.</div>}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Matériel à préparer</h2>
              <div className="spacer" style={{ flex: 1 }} />
              <button className="btn small ghost" onClick={() => setShowStock(!showStock)}>
                {showStock ? 'Masquer le stock' : `Stock de l’entrepôt (${stock.plates.length + stock.commercial.length})`}
              </button>
            </div>
            <div className="card-body">
              {result.materials.length ? (
                <table className="list">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th>Dimensions</th>
                      <th className="num">Quantité</th>
                      <th className="num">Masse totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.materials.map((m, k) => (
                      <tr key={k}>
                        <td>{m.label}</td>
                        <td>{m.dims}</td>
                        <td className="num">{m.quantity}</td>
                        <td className="num">{n(m.massKg, 0)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="hint">Aucune solution standard : étude de répartition spécifique.</div>
              )}
            </div>
          </div>
          {showStock && <StockEditor stock={stock} onSaved={setStock} />}
          <StackCard result={result} />
          <SlabBudgetCard result={result} />
        </>
      )}
    </div>
  );
}

/** Coupe du calage (de la dalle à la Viewbox) : croquis et couches de bas en haut, comme la fiche et le rapport. */
function StackCard({ result }: { result: CalageResult }) {
  const stacks = result.stacks ?? [];
  if (!stacks.length) return null;
  const S = STACK_LABELS.fr;
  const h = Math.ceil(stacks.length / 4) * 46;
  return (
    <div className="card" data-testid="calage-stack">
      <div className="card-head">
        <h2>{S.stackTitle}</h2>
        <span className="hint">ce qui est posé sur la dalle, couche par couche — repris dans la fiche de calage et le rapport</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <svg viewBox={`0 0 186 ${h}`} style={{ width: '100%', maxWidth: 760, background: '#fff' }} dangerouslySetInnerHTML={{ __html: stacksFigureSvg(stacks, 'fr')(0, 0, 186, h) }} />
        <table className="list">
          <thead>
            <tr>
              <th>{S.colSupports}</th>
              <th>{S.colLayers}</th>
              <th className="num">{S.colHeight}</th>
            </tr>
          </thead>
          <tbody>
            {stacks.map((st, k) => (
              <tr key={k}>
                <td>{st.supports.join(', ')}</td>
                <td>
                  {stackLines(st, 'fr').map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </td>
                <td className="num">{stackHeightText(st, 'fr')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Dalle en charge répartie : poids sous chaque Viewbox, poste par poste. */
function SlabBudgetCard({ result }: { result: CalageResult }) {
  const b = slabBudgetTable(result, 'fr');
  if (!b) return null;
  const S = STACK_LABELS.fr;
  return (
    <div className="card" data-testid="slab-budget">
      <div className="card-head">
        <h2>{S.slabTitle}</h2>
        <span className="hint">{S.slabIntro}</span>
      </div>
      <div className="card-body">
        <table className="list">
          <thead>
            <tr>
              {b.cols.map((c, i) => (
                <th key={i} className={i ? 'num' : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, k) => (
              <tr key={k} style={r.bold ? { fontWeight: 700 } : undefined}>
                <td style={r.proposed ? { color: '#b45309' } : undefined}>{r.label}</td>
                {r.values.map((v, i) => (
                  <td key={i} className="num">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {b.rows.some((r) => r.proposed) && <div className="hint">En orange : poids type proposé d’après la catégorie (valeur statico), pas confirmé — saisir le poids réel à l’étape 1 (fiche produit).</div>}
      </div>
    </div>
  );
}
