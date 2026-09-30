// Panneau « Sol & calage » : hypothèses (portance, charges, vent), estimation des réactions par groupe d'appuis,
// solutions de répartition par type d'appui, variante longrines, liste de matériel, stock de l'entrepôt, fiche PDF.
// Alimenté par le modèle analysé (onglet Étude structure) ou par une grille de Viewbox (calculateur rapide).
import { useEffect, useMemo, useState } from 'react';
import type { CalageInput, CalageResult } from '../../structure/core/calage';
import { computeCalage } from '../../structure/core/calage';
import type { Estimate, EstimateModule } from '../../structure/core/estimate';
import { ESTIMATE_DEFAULTS } from '../../structure/core/estimate';
import type { CommercialPlate, Solution, StockPlate } from '../../structure/core/ground';
import { BEARING_PRESETS, C24_BEAMS, GROUND_NOTE, PANELS, SUBGRADE_PRESETS, VIEWBOX_STOCK, bearingFrom } from '../../structure/core/ground';
import type { PanelMaterial } from '../../structure/core/ground';
import type { CalcRecord } from '../../structure/core/records';
import { VERDICT_LABEL, verdictOf } from '../../structure/core/records';
import { fmtNumber } from '../../structure/core/units';
import { GroundPlan, TYPE_COLORS } from '../../structure/report/groundSheet';
import type { RoadwayResult } from '../../structure/core/roadway';
import { kNm2, kgm2, planCoords, planOrigin, roadwayPressure, supportType } from '../../structure/core/roadway';
import { pressureFill } from '../../structure/report/groundPoints';
import type { Project } from '../../api/vem';
import { PROJECT_ID, STRUCTURE_STOCK_KEY, vem } from '../../api/vem';
import { downloadBlob } from '../common';

export interface Hypotheses {
  bearingPreset: string;
  bearingValue: number;
  bearingUnit: 'kN/m²' | 't/m²' | 'kg/cm²';
  pointLoadKN: number;
  moduleWeightKg: number;
  ceiling: number;
  floorFinish: number;
  live: number;
  roofLive: number;
  extraKN: number;
  windIn: number;
  windOut: number;
  cp: number;
  middleFeet: boolean;
  evacuateTop: boolean;
  staticoConversion: boolean;
  diffusion: boolean;
  extraPct: number;
  subgrade: string;
  thicknesses: string;
  /** poids propre des plaques de roulage (kg/m²) */
  roadwayKg: number;
}

export const DEFAULT_HYP: Hypotheses = {
  bearingPreset: 'meadow',
  bearingValue: 200,
  bearingUnit: 'kN/m²',
  pointLoadKN: 0,
  moduleWeightKg: 2564,
  ceiling: 0.35,
  floorFinish: 0.4,
  live: 3.5,
  roofLive: 3.5,
  extraKN: 0,
  windIn: 0.2,
  windOut: 0.37,
  cp: 1.3,
  middleFeet: false,
  evacuateTop: true,
  staticoConversion: false,
  diffusion: false,
  extraPct: 0,
  subgrade: 'medium',
  thicknesses: '18, 21, 24, 27, 30, 40',
  roadwayKg: 0,
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

/** Entrées du calcul à partir des hypothèses saisies (unités d'affichage → N, mm) ; `jacks` : 6 pieds à vérin par Viewbox. */
export function calageInput(modules: EstimateModule[], h: Hypotheses, stock: StructureStock, jacks = false): CalageInput {
  const kNm2 = (v: number) => v * 1e-3;
  return {
    modules,
    estimate: {
      ...ESTIMATE_DEFAULTS,
      loads: {
        moduleWeight: h.moduleWeightKg * 9.81,
        ceiling: kNm2(h.ceiling),
        floorFinish: kNm2(h.floorFinish),
        live: kNm2(h.live),
        roofLive: kNm2(h.roofLive),
        extraPerModule: h.extraKN * 1e3,
      },
      windInService: kNm2(h.windIn),
      windOutOfService: kNm2(h.windOut),
      cp: h.cp,
      middleFeet: h.middleFeet || jacks,
      jacks,
      evacuateTopLevel: h.evacuateTop,
      extraFactor: h.extraPct / 100,
    },
    bearing: bearingFrom(h.bearingValue, h.bearingUnit),
    pointLoadMax: BEARING_PRESETS.find((p) => p.key === h.bearingPreset)?.pointLoad && h.pointLoadKN > 0 ? h.pointLoadKN * 1e3 : undefined,
    staticoConversion: h.staticoConversion,
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
  };
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

function SolutionRow({ s, chosen }: { s: Solution; chosen: boolean }) {
  const [open, setOpen] = useState(false);
  const v = verdictOf(s.eta);
  return (
    <div className="card" style={{ background: chosen ? 'rgba(74, 222, 128, .06)' : undefined }}>
      <div className="card-body" style={{ padding: '8px 12px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <b>{s.title}</b> — {s.summary} {chosen && <span className="badge ok">retenue</span>}
            {!s.feasible && <span className="badge orange" style={{ marginLeft: 6 }}>hors standard</span>}
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
            <select value={p.material ?? 'F40'} style={{ width: 150 }} onChange={(e) => setPlate(i, { material: e.target.value as PanelMaterial })}>
              {(Object.keys(PANELS) as PanelMaterial[]).map((k) => (
                <option key={k} value={k}>
                  {PANELS[k].label}
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
          </div>
        ))}
        <div>
          <button className="btn small" onClick={() => setDraft({ ...draft, plates: [...draft.plates, { label: '', length: 1000, width: 1000, thickness: 18, quantity: 0, material: 'birch' }] })}>
            + Plaque
          </button>
          <button className="btn small ghost" onClick={() => setDraft({ ...draft, plates: [...draft.plates, ...VIEWBOX_STOCK.filter((v) => !draft.plates.some((p) => p.length === v.length && p.thickness === v.thickness && p.material === v.material))] })}>
            + Plaques Viewbox standard
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
export function HypothesesForm({ hyp, setHyp, jacks = false }: { hyp: Hypotheses; setHyp: (update: (h: Hypotheses) => Hypotheses) => void; jacks?: boolean }) {
  const set = <K extends keyof Hypotheses>(k: K, v: Hypotheses[K]) => setHyp((h) => ({ ...h, [k]: v }));
  const preset = BEARING_PRESETS.find((p) => p.key === hyp.bearingPreset);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Site et hypothèses</h2>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={() => setHyp(() => ({ ...DEFAULT_HYP }))}>
          Valeurs par défaut
        </button>
      </div>
      <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '8px 24px' }}>
        <Field label="Type de sol / support">
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
        </Field>
        <Field label="Portance admissible" hint={preset?.source}>
          <Num value={hyp.bearingValue} onChange={(v) => set('bearingValue', v)} />
          <select value={hyp.bearingUnit} style={{ width: 90 }} onChange={(e) => set('bearingUnit', e.target.value as Hypotheses['bearingUnit'])}>
            <option>kN/m²</option>
            <option>t/m²</option>
            <option>kg/cm²</option>
          </select>
        </Field>
        {preset?.pointLoad && (
          <Field label="Charge ponctuelle admissible">
            <Num value={hyp.pointLoadKN} onChange={(v) => set('pointLoadKN', v)} /> kN
          </Field>
        )}
        <Field label="Poids d’une Viewbox (planchers + isolants)">
          <Num value={hyp.moduleWeightKg} onChange={(v) => set('moduleWeightKg', v)} /> kg
        </Field>
        <Field label="Plafond + isolation / sol + isolation">
          <Num value={hyp.ceiling} onChange={(v) => set('ceiling', v)} width={60} /> /
          <Num value={hyp.floorFinish} onChange={(v) => set('floorFinish', v)} width={60} /> kN/m²
        </Field>
        <Field label="Exploitation des planchers">
          <Num value={hyp.live} onChange={(v) => set('live', v)} /> kN/m²
        </Field>
        <Field label="Exploitation des toitures accessibles">
          <Num value={hyp.roofLive} onChange={(v) => set('roofLive', v)} /> kN/m²
        </Field>
        <Field label="Murs, garde-corps, logo… par Viewbox">
          <Num value={hyp.extraKN} onChange={(v) => set('extraKN', v)} /> kN
        </Field>
        <Field label="Vent en service / hors service" hint="en service : DIN EN 13814 (h ≤ 8 m) ; hors service : qp × 0,7 (zone 1, h ≤ 9,5 m par défaut)">
          <Num value={hyp.windIn} onChange={(v) => set('windIn', v)} width={60} /> /
          <Num value={hyp.windOut} onChange={(v) => set('windOut', v)} width={60} /> kN/m²
        </Field>
        <Field label="Sol sous longrines (réaction)" hint="valeurs indicatives, à confirmer">
          <select value={hyp.subgrade} onChange={(e) => set('subgrade', e.target.value)}>
            {SUBGRADE_PRESETS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Épaisseurs de contreplaqué du commerce">
          <input type="text" style={{ width: 170 }} value={hyp.thicknesses} onChange={(e) => set('thicknesses', e.target.value)} /> mm
        </Field>
        <Field label="Majoration forfaitaire">
          <Num value={hyp.extraPct} onChange={(v) => set('extraPct', v)} width={60} /> %
        </Field>
        <label className="row hint" title={jacks ? 'pieds à vérin : 6 par Viewbox, pieds centraux compris' : undefined}>
          <input type="checkbox" checked={hyp.middleFeet || jacks} disabled={jacks} onChange={(e) => set('middleFeet', e.target.checked)} /> Pieds centraux des grands côtés calés aussi
          {jacks && ' (vérins : 6 par Viewbox)'}
        </label>
        <label className="row hint">
          <input type="checkbox" checked={hyp.evacuateTop} onChange={(e) => set('evacuateTop', e.target.checked)} /> Dernier niveau évacué par vent fort
        </label>
        <label className="row hint">
          <input type="checkbox" checked={hyp.staticoConversion} onChange={(e) => set('staticoConversion', e.target.checked)} /> Surface des plaques avec Rz,Ed / 1,35 (comme statico)
        </label>
        <label className="row hint">
          <input type="checkbox" checked={hyp.diffusion} onChange={(e) => set('diffusion', e.target.checked)} /> Proposer des couches continues (diffusion à 45°)
        </label>
      </div>
    </div>
  );
}

export interface GroundPanelProps {
  modules: EstimateModule[];
  source: string;
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
}

export function GroundPanel({ modules, source, storageKey, intro, hyp: hypProp, onHypChange, showHypotheses = true, reactions, jacks = false }: GroundPanelProps) {
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

  const input = useMemo(() => ({ ...calageInput(modules, hyp, stock, jacks), reactions: reactions ?? undefined }), [modules, hyp, stock, reactions, jacks]);
  useEffect(() => {
    setPending(true);
    const t = setTimeout(() => {
      try {
        if (!modules.length) throw new Error('Aucune Viewbox à caler.');
        if (!(input.bearing > 0)) throw new Error('Portance admissible à renseigner.');
        setResult(computeCalage(input));
        setError('');
      } catch (e) {
        setError((e as Error).message);
        setResult(null);
      }
      setPending(false);
    }, 250);
    return () => clearTimeout(t);
  }, [input, modules.length]);

  const preset = BEARING_PRESETS.find((p) => p.key === hyp.bearingPreset);

  const assumptions = (): Array<[string, string]> => [
    ['Portance admissible', `${n(hyp.bearingValue, hyp.bearingUnit === 'kN/m²' ? 0 : 2)} ${hyp.bearingUnit} (${preset?.label ?? 'saisie'})`],
    ['Poids d’une Viewbox', `${n(hyp.moduleWeightKg, 0)} kg`],
    ['Plafond / sol', `${n(hyp.ceiling, 2)} / ${n(hyp.floorFinish, 2)} kN/m²`],
    ['Exploitation', `${n(hyp.live, 2)} kN/m² (toitures accessibles ${n(hyp.roofLive, 2)})`],
    ['Vent en / hors service', `${n(hyp.windIn, 2)} / ${n(hyp.windOut, 2)} kN/m², cp ${n(hyp.cp, 1)}`],
    ['Réaction pour la surface', hyp.staticoConversion ? 'Rz,Ed / 1,35 (statico)' : 'caractéristique (ELS)'],
    jacks ? ['Pieds à vérin', '6 par Viewbox (4 angles + 2 centraux), tiges Tr 24 × 5, sortie ≤ 5 cm'] : ['Pieds centraux', hyp.middleFeet ? 'utilisés' : 'non (angles seuls)'],
    ['Viewbox', `${modules.length} (${Math.max(0, ...modules.map((m) => m.level)) + 1} niveau(x))`],
    ['Réactions', reactions ? 'calcul complet (modèle 3D, 2ᵉ ordre)' : 'estimation instantanée (surfaces tributaires)'],
  ];

  const exportPdf = async () => {
    if (!result) return;
    setPdfBusy(true);
    try {
      const [{ renderToStaticMarkup }, { buildPdf, fontsUsed }, { loadFonts }, { GroundSheetSvg }] = await Promise.all([
        import('react-dom/server'),
        import('../../sheets/pdf/pdf'),
        import('../../sheets/pdf/assets'),
        import('../../structure/report/groundSheet'),
      ]);
      const name = project ? `${project.internalNumber ? project.internalNumber + ' · ' : ''}${project.name}` : 'Projet';
      const svg = renderToStaticMarkup(
        <GroundSheetSvg
          result={result}
          modules={modules}
          info={{ project: name, client: project?.client?.name ?? undefined, source, date: new Date().toLocaleDateString('fr-FR'), assumptions: assumptions() }}
        />,
      );
      const fonts = await loadFonts(fontsUsed([svg]));
      const pdf = await buildPdf([{ svg, paper: 'A3', size: { w: 210, h: 297 } }], fonts, { title: `Fiche de calage — ${name}`, subject: source });
      downloadBlob(`Fiche de calage ${name.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`, pdf.output('blob'));
    } catch (e) {
      setError(`PDF impossible : ${(e as Error).message}`);
    }
    setPdfBusy(false);
  };

  const roadway: RoadwayResult | null = useMemo(
    () => (result ? roadwayPressure(modules, result.estimate, input.bearing, (hyp.roadwayKg * 9.81) / 1e6) : null),
    [result, modules, input.bearing, hyp.roadwayKg],
  );
  const bearingLabel = `${n(hyp.bearingValue, hyp.bearingUnit === 'kN/m²' ? 0 : 2)} ${hyp.bearingUnit} (${preset?.label ?? 'saisie'})`;
  const exportPoints = async () => {
    if (!result || !roadway) return;
    setPointsBusy(true);
    try {
      const [{ renderToStaticMarkup }, { buildPdf, fontsUsed }, { loadFonts }, { groundPointsPages }] = await Promise.all([
        import('react-dom/server'),
        import('../../sheets/pdf/pdf'),
        import('../../sheets/pdf/assets'),
        import('../../structure/report/groundPoints'),
      ]);
      const name = project ? `${project.internalNumber ? project.internalNumber + ' · ' : ''}${project.name}` : 'Projet';
      const svgs = groundPointsPages({
        modules,
        estimate: result.estimate,
        roadway,
        bearingLabel,
        info: { project: name, client: project?.client?.name ?? undefined, source, date: new Date().toLocaleDateString('fr-FR'), assumptions: [] },
      }).map((p) => renderToStaticMarkup(p));
      const fonts = await loadFonts(fontsUsed(svgs));
      const pdf = await buildPdf(
        svgs.map((svg) => ({ svg, paper: 'A3' as const, size: { w: 210, h: 297 } })),
        fonts,
        { title: `Plan des appuis au sol — ${name}`, subject: source },
      );
      downloadBlob(`Plan des appuis au sol ${name.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`, pdf.output('blob'));
    } catch (e) {
      setError(`PDF impossible : ${(e as Error).message}`);
    }
    setPointsBusy(false);
  };

  const sel = result?.estimate.reactions.find((r) => r.group.id === selected);
  return (
    <div className="page">
      {intro}
      {reactions !== undefined && (
        <div className="hint" style={{ margin: '4px 0' }}>
          {reactions ? 'Réactions : calcul complet (modèle 3D, 2ᵉ ordre, combinaisons statico).' : 'Réactions : estimation instantanée (surfaces tributaires) — lancer le calcul complet (étape 3) pour les réactions du modèle 3D.'}
        </div>
      )}
      {showHypotheses && <HypothesesForm hyp={hyp} setHyp={setHyp} />}
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
              <div className="v">{result.estimate.groups.length}</div>
              <div className="l">appuis à caler</div>
            </div>
            <div className="stat">
              <div className="v">{n((result.estimate.verticalK ?? result.estimate.totalG + result.estimate.totalQ) / 1e3, 0)} kN</div>
              <div className="l">charge verticale totale (ELS la plus lourde)</div>
            </div>
            <div className="stat">
              <div className="v">{kN(Math.max(...result.estimate.reactions.map((r) => r.Rk)), 0)}</div>
              <div className="l">appui le plus chargé (Rz,k)</div>
            </div>
            <div className={`stat ${result.allPlates ? '' : 'warn'}`}>
              <div className="v">{result.allPlates ? 'plaques' : result.longrine ? 'longrines' : 'à étudier'}</div>
              <div className="l">solution retenue</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{result.estimate.method === 'fem' ? 'Plan des appuis — calcul complet' : 'Plan des appuis — estimation'}</h2>
              <div className="spacer" style={{ flex: 1 }} />
              {Object.entries(jacks ? { '1': 'vérin d’angle', M: 'vérin central' } : { '1': 'angle seul', '2': '2 angles', '3': '3 angles', '4': '4 angles', M: 'pied central' })
                .filter(([k]) => result.estimate.reactions.some((r) => (r.group.middle ? 'M' : String(Math.min(4, r.group.corners))) === k))
                .map(([k, l]) => (
                  <span key={k} className="chip">
                    <i style={{ background: TYPE_COLORS[k] }} />
                    {l}
                  </span>
                ))}
              <button className="btn primary small" disabled={pdfBusy} onClick={() => void exportPdf()}>
                {pdfBusy ? 'PDF…' : '⬇ Fiche PDF'}
              </button>
            </div>
            <div className="card-body">
              <svg viewBox="0 0 1000 420" style={{ width: '100%', maxHeight: 460, background: '#fff', borderRadius: 6 }}>
                <GroundPlan modules={modules} reactions={result.estimate.reactions} x={0} y={0} w={1000} h={420} text={14} selected={selected} onSelect={setSelected} />
              </svg>
              {sel && (
                <div className="hint" style={{ marginTop: 6 }}>
                  <b>{sel.group.id}</b> : {sel.group.jack ? supportType(sel) : sel.group.middle ? 'pied central' : `${sel.group.corners} angle(s)`} ({sel.group.moduleIds.join(', ')}) — Rz,k = {kN(sel.Rk)}{' '}
                  (mini {kN(sel.RkMin)}), Rz,Ed = {kN(sel.REd)} — {sel.combo} ; dont G = {kN(sel.G)}, Q = {kN(sel.Q)}
                </div>
              )}
              <div className="hint" style={{ marginTop: 6 }}>
                {result.estimate.method === 'fem'
                  ? 'Réactions du modèle 3D (2ᵉ ordre, combinaisons statico) : Rz,k maxi de chaque appui sur les combinaisons ELS.'
                  : 'Estimation par surfaces tributaires et basculement en bloc rigide : ordre de grandeur, remplacé par le calcul complet de l’étude structure.'}{' '}
                {GROUND_NOTE}
              </div>
            </div>
          </div>

          {roadway && (
            <div className="card">
              <div className="card-head">
                <h2>Plaques de roulage — répartition uniforme</h2>
                <span className="hint">toute la surface couverte par des plaques jointives : charge verticale / surface</span>
                <div className="spacer" style={{ flex: 1 }} />
                <button className="btn primary small" disabled={pointsBusy} onClick={() => void exportPoints()}>
                  {pointsBusy ? 'PDF…' : '⬇ Plan des appuis au sol (PDF)'}
                </button>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Field label="Poids propre des plaques" hint="acier 20 mm ≈ 157 kg/m², aluminium ≈ 35 kg/m², plaques PEHD ≈ 15 kg/m² ; 0 = non compté">
                  <Num value={hyp.roadwayKg} onChange={(v) => setHyp((h) => ({ ...h, roadwayKg: Math.max(0, v) }))} width={60} /> kg/m²
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
                  <i style={{ background: TYPE_COLORS[t.middle ? 'M' : String(Math.min(4, t.corners))] }} />
                  {t.label}
                </span>
                <span className="hint">
                  {t.reactions.length} appui(s) — Rz,k maxi {kN(t.Rzk)}, Rz,Ed maxi {kN(t.RzEd)} (statico : Rz,Ed / 1,35 = {kN(t.RzEd / 1.35)}) — contact{' '}
                  {t.a1 / 10} × {t.a2 / 10} cm
                </span>
                <div className="spacer" style={{ flex: 1 }} />
                <span className={`badge ${t.standard ? 'ok' : 'orange'}`}>{t.chosen ? (t.standard ? VERDICT_LABEL[verdictOf(t.chosen.eta)] : 'hors standard') : 'aucune solution'}</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              </div>
              <div className="card-body">
                <SolutionRow s={result.longrine.solution} chosen={!result.allPlates} />
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
        </>
      )}
    </div>
  );
}
