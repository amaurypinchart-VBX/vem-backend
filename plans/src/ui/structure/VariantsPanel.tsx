// Onglet « 🧪 Variantes » de l'étude structure (phase S10) : modifier une Viewbox (hauteur des poteaux, profils du
// catalogue, nuances, contreplaqué, plats d'empilement) sans repasser par SketchUp, voir tout de suite le poids,
// l'élancement et le statut des assemblages, calculer la variante, la comparer à l'étude (A), lire pourquoi ça ne passe
// pas et laisser l'optimiseur chercher les changements minimaux (« Tester » crée une variante calculée). Une variante =
// l'étude + ses changements ; les variantes sont partagées avec le conseil ingénieur et enregistrées avec l'étude.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StudyRun } from '../../structure/studyRun';
import { runStudy } from '../../structure/studyRun';
import type { StudyRunner } from '../../structure/worker/study';
import type { SectionSlot, StudyMods } from '../../structure/core/mods';
import { PLYWOOD_THICKNESSES, SLOT_LABEL, TOPZ_RANGE, describeMods, mergeMods } from '../../structure/core/mods';
import type { SectionEntry } from '../../structure/core/library';
import type { CatalogFamily } from '../../structure/core/sectionCatalog';
import { FAMILY_NAME, familyOf, familySections, sectionMass } from '../../structure/core/sectionCatalog';
import { installationIndicators } from '../../structure/core/moduleIndicators';
import { JOINT_STATUS_LABEL } from '../../structure/core/jointRevalidation';
import type { JointRow, JointStatus } from '../../structure/core/jointRevalidation';
import type { Issue, VariantChanges } from '../../structure/advisor/diagnose';
import { diagnose } from '../../structure/advisor/diagnose';
import type { RunDigest } from '../../structure/advisor/digest';
import { runDigest } from '../../structure/advisor/digest';
import type { OptimizeResult, Proposal } from '../../structure/advisor/optimize';
import { optimize } from '../../structure/advisor/optimize';
import { VERDICT_LABEL } from '../../structure/core/records';
import type { Verdict } from '../../structure/core/records';
import { fmtNumber } from '../../structure/core/units';
import type { InputsSource } from './studyInputs';
import { buildStudyInputs } from './studyInputs';
import type { Variant } from './advisorTools';
import { changeLines, variantSource } from './advisorTools';

const VERDICT_COLOR: Record<string, string> = { ok: 'var(--ok)', limit: 'var(--warn)', fail: 'var(--danger)', incomplete: 'var(--danger)' };
const STATUS_COLOR: Record<JointStatus, string> = { template: 'var(--ok)', recalculated: 'var(--ok)', indicative: 'var(--warn)', user: 'var(--warn)', unknown: 'var(--danger)' };
const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : fmtNumber(v, d));

/** Familles du catalogue proposées pour chaque famille de barres de la Viewbox. */
const SLOT_FAMILIES: Record<SectionSlot, CatalogFamily[]> = {
  'rim-floor': ['UPN', 'IPE', 'HEA', 'HEB', 'RHS'],
  'rim-roof': ['UPN', 'IPE', 'HEA', 'HEB', 'RHS'],
  'secondary-floor': ['RHS', 'SHS', 'UPN', 'IPE'],
  'secondary-roof': ['RHS', 'SHS', 'UPN', 'IPE'],
  column: ['SHS', 'RHS', 'CHS', 'HEA', 'HEB'],
  'foot-corner': [],
  'foot-middle': [],
};
const EDIT_SLOTS: SectionSlot[] = ['rim-floor', 'rim-roof', 'secondary-floor', 'secondary-roof', 'column'];
const GRADES = ['S235', 'S275', 'S355'];

const SLOT_SECTION: Record<SectionSlot, (s: { rim: string; rimRoof?: string; secondary: string; secondaryRoof?: string; column: string; footCorner: string; footMiddle: string }) => string> = {
  'rim-floor': (s) => s.rim,
  'rim-roof': (s) => s.rimRoof ?? s.rim,
  'secondary-floor': (s) => s.secondary,
  'secondary-roof': (s) => s.secondaryRoof ?? s.secondary,
  column: (s) => s.column,
  'foot-corner': (s) => s.footCorner,
  'foot-middle': (s) => s.footMiddle,
};

function VerdictBadge({ v }: { v?: string }) {
  return <b style={{ color: VERDICT_COLOR[v ?? ''] ?? 'var(--text-dim)' }}>{VERDICT_LABEL[v as Verdict] ?? v ?? '—'}</b>;
}

/** Identifiant libre suivant (V1, V2…), commun avec le conseil ingénieur. */
function nextId(variants: readonly Variant[]): string {
  const used = new Set(variants.map((v) => v.id));
  let n = Math.max(0, ...variants.map((v) => Number(v.id.slice(1)) || 0)) + 1;
  while (used.has(`V${n}`)) n++;
  return `V${n}`;
}

interface Draft {
  title: string;
  changes: VariantChanges;
  /** variante de départ (copie modifiée) */
  from?: string;
}

interface Props {
  source: InputsSource;
  run: StudyRun | null;
  stale: boolean;
  currentKey: string;
  variants: Variant[];
  setVariants: (v: Variant[]) => void;
  runner: () => StudyRunner;
  onApply: (v: Variant) => void;
  onRunStudy: () => void;
  running: boolean;
  /** nom de l'utilisateur (capacités saisies) ; peut modifier la bibliothèque */
  who: string;
  /** résultats détaillés (3D colorée par η) d'un calcul */
  renderResults: (run: StudyRun) => React.ReactNode;
  /** variante demandée par un autre onglet (accessoire) : calculée à l'ouverture */
  request?: { id: number; title: string; changes: VariantChanges } | null;
  onRequestDone?: () => void;
}

export function VariantsPanel(p: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scope, setScope] = useState<string>('*');
  const [selected, setSelected] = useState<string>('A');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [opt, setOpt] = useState<{ base: string; result: OptimizeResult } | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [optMinutes, setOptMinutes] = useState(2);
  const abortRef = useRef<AbortController | null>(null);
  const variantsRef = useRef(p.variants);
  variantsRef.current = p.variants;

  const weighed = p.source.hyp.moduleWeightKg * 9.81;
  const friction = p.source.calc.friction;

  // ─── brouillon : entrées et indicateurs instantanés ───
  const draftBuilt = useMemo(() => {
    if (!draft) return null;
    try {
      return buildStudyInputs(variantSource(p.source, draft.changes));
    } catch (e) {
      return { error: (e as Error).message } as never;
    }
  }, [draft, p.source]);
  const baseBuilt = useMemo(() => buildStudyInputs(p.source), [p.source]);
  const indicators = useMemo(() => (draftBuilt && 'inputs' in draftBuilt ? installationIndicators(draftBuilt.inputs.modules, draftBuilt.inputs.sections, weighed) : null), [draftBuilt, weighed]);
  const baseIndicators = useMemo(() => installationIndicators(baseBuilt.inputs.modules, baseBuilt.inputs.sections, weighed), [baseBuilt, weighed]);

  const modules = (draftBuilt && 'inputs' in draftBuilt ? draftBuilt.inputs : baseBuilt.inputs).modules;
  const sections = (draftBuilt && 'inputs' in draftBuilt ? draftBuilt.inputs : baseBuilt.inputs).sections;
  const scopeModules = scope === '*' ? undefined : [scope];
  const refModule = modules.find((m) => m.id === scope) ?? modules[0];
  const baseModule = baseBuilt.inputs.modules.find((m) => m.id === refModule?.id) ?? baseBuilt.inputs.modules[0];

  const setMods = (fn: (m: StudyMods) => StudyMods) => setDraft((d) => (d ? { ...d, changes: { ...d.changes, mods: fn({ ...(d.changes.mods ?? {}) }) } } : d));
  const sameScope = (m?: string[]) => (m?.length ? m.join(',') : '*') === (scopeModules?.join(',') ?? '*');

  const setHeight = (topZ: number | null) =>
    setMods((m) => {
      const rest = (m.geometry ?? []).filter((g) => !sameScope(g.modules));
      return { ...m, geometry: topZ === null ? rest : [...rest, { topZ, modules: scopeModules }] };
    });
  const setSection = (slot: SectionSlot, key: string | null) =>
    setMods((m) => {
      const rest = (m.sections ?? []).filter((s) => !(s.slot === slot && sameScope(s.modules)));
      return { ...m, sections: key === null ? rest : [...rest, { slot, section: key, modules: scopeModules }] };
    });
  const setGrade = (slot: SectionSlot, material: string | null) =>
    setMods((m) => {
      const rest = (m.grades ?? []).filter((g) => !(g.slot === slot && sameScope(g.modules)));
      return { ...m, grades: material === null ? rest : [...rest, { slot, material, modules: scopeModules }] };
    });
  const draftMods = draft?.changes.mods ?? {};
  const heightOverride = draftMods.geometry?.find((g) => sameScope(g.modules));
  const sectionOverride = (slot: SectionSlot) => draftMods.sections?.find((s) => s.slot === slot && sameScope(s.modules));
  const gradeOverride = (slot: SectionSlot) => draftMods.grades?.find((g) => g.slot === slot && sameScope(g.modules));

  const newDraft = (from?: Variant) => {
    setDraft({ title: from ? `${from.title} (modifiée)` : 'Viewbox modifiée', changes: from ? JSON.parse(JSON.stringify(from.changes)) : {}, from: from?.id });
    setOpt(null);
  };

  // ─── calculs ───
  const compute = async (title: string, changes: VariantChanges): Promise<Variant | null> => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError('');
    setBusy(`Calcul de « ${title} »…`);
    try {
      const { inputs, warnings } = buildStudyInputs(variantSource(p.source, changes));
      if (warnings.length) throw new Error(warnings.join(' ; '));
      const run = await runStudy(inputs, p.runner(), (d, t) => setBusy(`Calcul de « ${title} » : ${d} / ${t} combinaisons`), ctrl.signal);
      const v: Variant = {
        id: nextId(variantsRef.current),
        title,
        changes,
        digest: runDigest(run, changes.calc?.friction ?? friction),
        lines: changeLines(changes, p.source.library),
        createdAt: new Date().toISOString(),
        baseKey: p.currentKey,
        run,
      };
      const next = [...variantsRef.current, v];
      variantsRef.current = next;
      p.setVariants(next);
      setSelected(v.id);
      return v;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };
  const recompute = async (v: Variant) => {
    setBusy(`Recalcul de ${v.id}…`);
    try {
      const { inputs } = buildStudyInputs(variantSource(p.source, v.changes));
      const run = await runStudy(inputs, p.runner(), (d, t) => setBusy(`Recalcul de ${v.id} : ${d} / ${t}`));
      const next = variantsRef.current.map((x) => (x.id === v.id ? { ...x, run, digest: runDigest(run, v.changes.calc?.friction ?? friction), baseKey: p.currentKey } : x));
      variantsRef.current = next;
      p.setVariants(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const searchFixes = async (baseId: string) => {
    const v = baseId === 'A' ? null : variantsRef.current.find((x) => x.id === baseId);
    const run = v ? v.run : p.run;
    if (!run) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError('');
    setBusy('Recherche des changements minimaux…');
    try {
      const result = await optimize(
        { changes: v?.changes ?? {}, run, build: (ch) => buildStudyInputs(variantSource(p.source, ch)).inputs },
        p.runner(),
        { friction, signal: ctrl.signal, timeLimitMs: optMinutes * 60000, onProgress: (t) => setBusy(t) },
      );
      setOpt({ base: baseId, result });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const testProposal = (pr: Proposal) => {
    const title = pr.levers.map((l) => l.title).join(' + ');
    const v: Variant = {
      id: nextId(variantsRef.current),
      title,
      changes: pr.changes,
      digest: runDigest(pr.run, pr.changes.calc?.friction ?? friction),
      lines: changeLines(pr.changes, p.source.library),
      createdAt: new Date().toISOString(),
      baseKey: p.currentKey,
      run: pr.run,
    };
    const next = [...variantsRef.current, v];
    variantsRef.current = next;
    p.setVariants(next);
    setSelected(v.id);
  };
  const stop = () => {
    abortRef.current?.abort();
    setBusy(null);
  };
  // variante demandée depuis l'onglet Accessoires
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!p.request || handled.current === p.request.id) return;
    handled.current = p.request.id;
    const r = p.request;
    p.onRequestDone?.();
    void compute(r.title, r.changes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.request?.id]);

  // ─── comparaison ───
  const baseDigest: RunDigest | null = useMemo(() => (p.run && !p.stale ? runDigest(p.run, friction) : null), [p.run, p.stale, friction]);
  const cols: Array<{ id: string; title: string; digest: RunDigest | null; fresh: boolean }> = [
    { id: 'A', title: 'Étude (base)', digest: baseDigest, fresh: true },
    ...p.variants.map((v) => ({ id: v.id, title: v.title, digest: v.digest, fresh: !!v.baseKey && v.baseKey === p.currentKey })),
  ];
  const famNames = [...new Set(cols.flatMap((c) => c.digest?.familles.map((x) => x.famille) ?? []))];
  const famEta = (d: RunDigest | null, fam: string) => d?.familles.find((x) => x.famille === fam)?.eta_max ?? null;
  const diffColor = (a: number | null, b: number | null, lowerIsBetter = true) => {
    if (a === null || b === null || Math.abs(a - b) < 0.005) return undefined;
    return (b < a) === lowerIsBetter ? 'var(--ok)' : 'var(--danger)';
  };

  const selVariant = selected === 'A' ? null : p.variants.find((v) => v.id === selected) ?? null;
  const selRun = selected === 'A' ? (p.run && !p.stale ? p.run : null) : (selVariant?.run ?? null);
  const issues: Issue[] = useMemo(() => (selRun ? diagnose(selRun, { friction: selVariant?.changes.calc?.friction ?? friction }) : []), [selRun, selVariant, friction]);
  const globalIds = new Set(['overturning', 'sliding', 'fem-error']);

  // valeurs venues de SketchUp (« Structure… » sur l'instance) pour la Viewbox affichée
  const sk = p.source.sceneModel.structMods;
  const fromSketchup = (slot: SectionSlot) => !!refModule && !!(sk?.sections?.some((x) => x.slot === slot && x.modules?.includes(refModule.id)) || sk?.grades?.some((x) => x.slot === slot && x.modules?.includes(refModule.id)));
  const heightFromSketchup = !!refModule && !!sk?.geometry?.some((g) => g.modules?.includes(refModule.id));
  const libSections = useMemo(() => [...sections.values()].filter((e) => !e.key.startsWith('CAT-') && !e.key.includes('@') && !e.section.massless), [sections]);

  const sectionSelect = (slot: SectionSlot) => {
    if (!refModule) return null;
    const curKey = SLOT_SECTION[slot](refModule.params.sections).split('@')[0];
    const cur = sections.get(curKey) as SectionEntry | undefined;
    const baseKey = SLOT_SECTION[slot](baseModule.params.sections).split('@')[0];
    const fams = SLOT_FAMILIES[slot];
    const lib = libSections.filter((e) => e.key === baseKey || e.key === curKey || (familyOf(e) && fams.includes(familyOf(e)!)));
    const o = sectionOverride(slot);
    const g = gradeOverride(slot);
    const mat = g?.material ?? cur?.material ?? 'S235';
    return (
      <tr key={slot}>
        <td>{SLOT_LABEL[slot]}</td>
        <td>
          <select value={curKey} onChange={(e) => setSection(slot, e.target.value === baseKey ? null : e.target.value)} style={{ maxWidth: 260 }}>
            <optgroup label="Bibliothèque Viewbox">
              {lib.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.section.name}
                  {e.key === baseKey ? ' — gabarit' : ''}
                </option>
              ))}
            </optgroup>
            {fams.map((fam) => (
              <optgroup key={fam} label={`${FAMILY_NAME[fam]} (catalogue, à confirmer)`}>
                {familySections(fam).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.section.name} — {f(sectionMass(c), 1)} kg/m
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </td>
        <td>
          <select value={mat} onChange={(e) => setGrade(slot, e.target.value === (cur?.material ?? '') && !g ? null : e.target.value)}>
            {GRADES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </td>
        <td>
          {o || g ? (
            <>
              <span className="badge orange">modifié</span>{' '}
              <button
                className="btn small ghost"
                onClick={() => {
                  setSection(slot, null);
                  setGrade(slot, null);
                }}
              >
                Rétablir
              </button>
            </>
          ) : (
            <span className="badge">{fromSketchup(slot) ? 'SketchUp' : curKey.startsWith('CAT-') ? 'catalogue' : 'gabarit'}</span>
          )}
        </td>
      </tr>
    );
  };

  const jointRows: JointRow[] = draftBuilt && 'inputs' in draftBuilt ? (draftBuilt.inputs.joints?.rows ?? []) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ─── barre des variantes ─── */}
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 6 }}>
          <h2>🧪 Variantes</h2>
          <span className="hint">Une variante = l’étude + des changements (profils, hauteur des poteaux, nuances…), calculée et comparée à l’étude.</span>
          <div style={{ flex: 1 }} />
          <button className="btn small primary" disabled={!!busy} onClick={() => newDraft()}>
            ＋ Nouvelle variante
          </button>
        </div>
        <div className="card-body row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {cols.map((c) => (
            <button key={c.id} className={`btn small ${selected === c.id ? 'primary' : ''}`} onClick={() => setSelected(c.id)} title={c.title}>
              {c.id === 'A' ? 'A · étude' : `${c.id} · ${c.title.slice(0, 32)}`} {c.digest ? <VerdictBadge v={c.digest.verdict} /> : null}
              {!c.fresh && ' ⟳'}
            </button>
          ))}
        </div>
        {busy && (
          <div className="card-body hint row" style={{ gap: 8 }}>
            <span className="progress" style={{ width: 16, height: 16 }} /> {busy}
            <button className="btn small ghost" onClick={stop}>
              Arrêter
            </button>
          </div>
        )}
        {error && (
          <div className="card-body">
            <div className="error-box">{error}</div>
          </div>
        )}
      </div>

      {/* ─── éditeur de Viewbox ─── */}
      {draft && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2>Modifier</h2>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ minWidth: 260 }} />
            {draft.from && <span className="hint">copie de {draft.from}</span>}
            <div style={{ flex: 1 }} />
            <label className="hint">
              Portée :{' '}
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="*">Toutes les Viewbox</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} (niveau {m.level})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <b>Géométrie</b>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  Hauteur des poteaux (haut de la Viewbox, appui de celle du dessus) :
                  <input
                    type="number"
                    step={10}
                    min={TOPZ_RANGE[0]}
                    max={TOPZ_RANGE[1]}
                    value={refModule?.params.topZ ?? 3080}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setHeight(v === baseModule.params.topZ ? null : v);
                    }}
                    style={{ width: 90 }}
                  />{' '}
                  mm
                  {[3080, 3500, 4000, 4500, 5000, 6000].map((h) => (
                    <button key={h} className="btn small ghost" onClick={() => setHeight(h === baseModule.params.topZ ? null : h)}>
                      {fmtNumber(h / 1e3, 2)} m
                    </button>
                  ))}
                  {heightOverride ? (
                    <button className="btn small ghost" onClick={() => setHeight(null)}>
                      Rétablir
                    </button>
                  ) : (
                    <span className="badge">{heightFromSketchup ? 'SketchUp' : 'gabarit'}</span>
                  )}
                </div>
                <div className="hint">La toiture suit (même écart sous le haut) ; les Viewbox posées dessus montent avec. Limites de l’outil : {TOPZ_RANGE[0]} à {TOPZ_RANGE[1]} mm.</div>
              </div>
              <div>
                <b>Profils et nuances</b>
                <table className="list" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Barres</th>
                      <th>Section</th>
                      <th>Nuance</th>
                      <th>Origine</th>
                    </tr>
                  </thead>
                  <tbody>{EDIT_SLOTS.map(sectionSelect)}</tbody>
                </table>
                <div className="hint">Sections du catalogue du commerce (Base métaux Belgique) : propriétés recalculées par l’outil, nuance et disponibilité à confirmer avec le fournisseur.</div>
              </div>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <label>
                  Contreplaqué du plancher :{' '}
                  <select
                    value={draftMods.plywood?.thickness ?? baseModule.params.plywood.thickness}
                    onChange={(e) => setMods((m) => ({ ...m, plywood: Number(e.target.value) === baseModule.params.plywood.thickness ? null : { thickness: Number(e.target.value) } }))}
                  >
                    {PLYWOOD_THICKNESSES.map((t) => (
                      <option key={t} value={t}>
                        {t} mm{t === baseModule.params.plywood.thickness ? ' (gabarit)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!!(draft.changes.hyp?.middleFeet ?? p.source.hyp.middleFeet)}
                    onChange={(e) => setDraft({ ...draft, changes: { ...draft.changes, hyp: { ...(draft.changes.hyp ?? {}), middleFeet: e.target.checked } } })}
                  />{' '}
                  Pieds centraux calés
                </label>
                <label>
                  Plats d’empilement par grand côté{' '}
                  <input
                    type="number"
                    min={0}
                    max={6}
                    style={{ width: 50 }}
                    value={draftMods.stackPlates?.perLongSide ?? 4}
                    onChange={(e) => setMods((m) => ({ ...m, stackPlates: { perLongSide: Number(e.target.value), perShortSide: m.stackPlates?.perShortSide ?? 2 } }))}
                  />{' '}
                  par petit côté{' '}
                  <input
                    type="number"
                    min={0}
                    max={4}
                    style={{ width: 50 }}
                    value={draftMods.stackPlates?.perShortSide ?? 2}
                    onChange={(e) => setMods((m) => ({ ...m, stackPlates: { perLongSide: m.stackPlates?.perLongSide ?? 4, perShortSide: Number(e.target.value) } }))}
                  />
                </label>
              </div>
              {describeMods(draftMods).length > 0 && (
                <div className="hint">
                  Changements : {describeMods(draftMods, (k) => (sections.get(k) as SectionEntry | undefined)?.section.name ?? k).join(' ; ')}
                </div>
              )}
              <div className="row" style={{ gap: 6 }}>
                <button className="btn primary" disabled={!!busy || !Object.keys(draft.changes.mods ?? {}).length && !draft.changes.hyp} onClick={() => void compute(draft.title, draft.changes).then((v) => v && setDraft(null))}>
                  Calculer la variante
                </button>
                <button className="btn" onClick={() => setDraft(null)}>
                  Annuler
                </button>
                <span className="hint">≈ {f((p.run?.durationMs ?? 0) / 1e3, 0)} s (comme le calcul de l’étude)</span>
              </div>
            </div>

            {/* indicateurs instantanés */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <b>Tout de suite (sans calcul)</b>
              {draftBuilt && 'error' in draftBuilt && <div className="error-box">{String((draftBuilt as { error: string }).error)}</div>}
              {draftBuilt && 'inputs' in draftBuilt && draftBuilt.warnings.length > 0 && (
                <div className="warnings">
                  {draftBuilt.warnings.map((w, i) => (
                    <div key={i} className="warning warning">
                      <span className="msg">{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {indicators && (
                <>
                  <div>
                    Poids des Viewbox : <b>{f(indicators.weight / 9.81, 0)} kg</b> ({indicators.weightDelta >= 0 ? '+' : '−'}
                    {f(Math.abs(indicators.weightDelta) / 9.81, 0)} kg par rapport à la pesée) · hauteur totale <b>{f(indicators.height / 1e3, 2)} m</b> (étude {f(baseIndicators.height / 1e3, 2)} m)
                  </div>
                  <table className="list" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Viewbox</th>
                        <th>Poteaux</th>
                        <th>λ̄ (nœuds fixes / console)</th>
                        <th>Poids</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indicators.modules.map((m) => (
                        <tr key={m.id}>
                          <td>{m.id}</td>
                          <td>
                            {f(m.columnLength / 1e3, 2)} m · {m.columnSection}
                          </td>
                          <td>
                            {f(m.lambdaFixed)} / {f(m.lambdaSway)}
                          </td>
                          <td>
                            {f(m.weight / 9.81, 0)} kg{m.weightDelta ? ` (${m.weightDelta > 0 ? '+' : '−'}${f(Math.abs(m.weightDelta) / 9.81, 0)})` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {[...indicators.alerts, ...indicators.modules.flatMap((m) => m.alerts.map((a) => `${m.id} : ${a}`))].map((a, i) => (
                    <div key={i} className="hint" style={{ color: 'var(--warn)' }}>
                      ⚠ {a}
                    </div>
                  ))}
                </>
              )}
              <b>Assemblages</b>
              {!jointRows.length ? (
                <div className="hint">Tous les assemblages restent ceux du gabarit (capacités de la bibliothèque).</div>
              ) : (
                jointRows.map((r, i) => <JointRowView key={i} row={r} who={p.who} onCapacity={(caps) => setMods((m) => ({ ...m, jointCapacities: mergeMods({ jointCapacities: m.jointCapacities }, { jointCapacities: caps }).jointCapacities }))} />)
              )}
              <div className="hint">Aucun ✅ tant qu’un assemblage est indicatif, saisi ou inconnu : ces capacités sont à faire valider par un ingénieur.</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── comparaison ─── */}
      <div className="card">
        <div className="card-head">
          <h2>Comparaison</h2>
          {!baseDigest && (
            <button className="btn small" disabled={p.running} onClick={p.onRunStudy}>
              {p.running ? 'Calcul de l’étude…' : 'Calculer l’étude (colonne A)'}
            </button>
          )}
        </div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <table className="list" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th />
                {cols.map((c) => (
                  <th key={c.id} style={{ cursor: 'pointer', color: selected === c.id ? 'var(--accent)' : undefined }} onClick={() => setSelected(c.id)} title={c.title}>
                    {c.id}
                    {!c.fresh ? ' ⟳' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Verdict</td>
                {cols.map((c) => (
                  <td key={c.id}>{c.digest ? <VerdictBadge v={c.digest.verdict} /> : '—'}</td>
                ))}
              </tr>
              {(
                [
                  ['Poids propre (kN)', (d: RunDigest) => d.installation.poids_propre_kN, 1, true],
                  ['Hauteur (m)', (d: RunDigest) => d.installation.hauteur_m, 2, true],
                  ['Réaction max (kN)', (d: RunDigest) => d.appuis.reaction_max_kN, 1, true],
                  ['Charge verticale ELS (kN)', (d: RunDigest) => d.appuis.charge_verticale_caracteristique_kN, 1, true],
                  ['Glissement : μ requis', (d: RunDigest) => d.stabilite.glissement.mu_requis, 2, true],
                  ['Lest contre le glissement (kg)', (d: RunDigest) => d.stabilite.lest_glissement_kg, 0, true],
                  ['Plancher η', (d: RunDigest) => d.plancher_eta, 2, true],
                ] as const
              ).map(([label, get, dec, lower]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {cols.map((c) => {
                    const v = c.digest ? (get(c.digest) as number | null) : null;
                    const a = baseDigest ? (get(baseDigest) as number | null) : null;
                    return (
                      <td key={c.id} style={{ color: c.id === 'A' ? undefined : diffColor(a, v, lower) }}>
                        {f(v, dec)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td>Basculement</td>
                {cols.map((c) => (
                  <td key={c.id}>{c.digest ? (c.digest.stabilite.basculement === 'ok' ? 'ok' : <span style={{ color: 'var(--danger)' }}>{c.digest.stabilite.basculement}</span>) : '—'}</td>
                ))}
              </tr>
              {famNames.map((fam) => (
                <tr key={fam}>
                  <td>η {fam}</td>
                  {cols.map((c) => {
                    const v = famEta(c.digest, fam);
                    return (
                      <td key={c.id} style={{ color: c.id === 'A' ? undefined : diffColor(famEta(baseDigest, fam), v), fontWeight: v !== null && v > 1 ? 700 : undefined }}>
                        {f(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint">Écarts par rapport à l’étude (A) : vert = mieux, rouge = moins bien. ⟳ = calculée sur une autre version de l’étude (à recalculer).</div>
        </div>
      </div>

      {/* ─── variante sélectionnée : pourquoi, propositions ─── */}
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 6 }}>
          <h2>{selected === 'A' ? 'Étude (A)' : `${selected} — ${selVariant?.title ?? ''}`}</h2>
          {selRun && <VerdictBadge v={selRun.verdict.verdict} />}
          <div style={{ flex: 1 }} />
          {selVariant && (
            <>
              <button className="btn small" disabled={!!busy} onClick={() => newDraft(selVariant)}>
                Modifier (copie)
              </button>
              {selVariant.baseKey === p.currentKey && !selVariant.applied ? (
                <button className="btn small primary" disabled={!!busy} onClick={() => p.onApply(selVariant)}>
                  Appliquer à l’étude
                </button>
              ) : !selVariant.applied ? (
                <button className="btn small" disabled={!!busy} onClick={() => void recompute(selVariant)}>
                  Recalculer sur l’étude actuelle
                </button>
              ) : (
                <span className="badge ok">appliquée</span>
              )}
              <button
                className="btn small ghost"
                disabled={!!busy}
                onClick={() => {
                  const next = variantsRef.current.filter((x) => x.id !== selVariant.id);
                  variantsRef.current = next;
                  p.setVariants(next);
                  setSelected('A');
                }}
              >
                Supprimer
              </button>
            </>
          )}
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selVariant && (
            <ul className="hint" style={{ margin: '0 0 0 16px', padding: 0 }}>
              {selVariant.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          {!selRun ? (
            <div className="hint">
              {selected === 'A' ? (p.stale ? 'Calcul de l’étude périmé.' : 'Étude pas encore calculée.') : 'Calcul non gardé après rechargement.'}{' '}
              <button className="btn small" disabled={!!busy || p.running} onClick={() => (selVariant ? void recompute(selVariant) : p.onRunStudy())}>
                Calculer
              </button>
            </div>
          ) : (
            <>
              <b>Pourquoi ça ne passe pas ?</b>
              {!issues.length ? (
                <div className="hint">✅ Rien à signaler : tout passe avec une marge (η ≤ 0,90).</div>
              ) : (
                issues.map((i) => (
                  <div key={i.id} style={{ borderLeft: `3px solid ${i.severity === 'limit' ? 'var(--warn)' : 'var(--danger)'}`, paddingLeft: 8 }}>
                    <div>
                      <b>{i.severity === 'limit' ? 'Limite' : i.severity === 'incomplete' ? 'Incomplet' : 'Ne passe pas'}</b> : {i.title}{' '}
                      <span className="badge">{globalIds.has(i.id) ? 'cause globale (ensemble)' : 'cause locale (élément)'}</span>
                    </div>
                    <div className="hint">{i.why}</div>
                    {i.where.length > 0 && <div className="hint">Où : {i.where.slice(0, 4).join(' ; ')}</div>}
                  </div>
                ))
              )}
              {selRun.verdict.verdict !== 'ok' && (
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn small primary" disabled={!!busy} onClick={() => void searchFixes(selected)}>
                    🔎 Chercher les changements minimaux pour que ça passe
                  </button>
                  <label className="hint">
                    durée maxi{' '}
                    <select value={optMinutes} onChange={(e) => setOptMinutes(Number(e.target.value))}>
                      {[2, 5, 10].map((m) => (
                        <option key={m} value={m}>
                          {m} min
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="hint">Essaie sections supérieures, nuances, contreplaqué, contreventement, plats, lest, base élargie — chaque essai est recalculé.</span>
                </div>
              )}
              {opt && opt.base === selected && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <b>Propositions ({opt.result.runs} calculs{opt.result.partial ? ', arrêté avant la fin : résultats partiels' : ''})</b>
                  {opt.result.proposals.map((pr) => (
                    <div key={pr.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                      <div>
                        <b>{pr.id}</b> {pr.text} <VerdictBadge v={pr.verdict} />
                      </div>
                      <div className="hint">
                        {pr.pieces} pièce(s) modifiée(s) ou ajoutée(s) · {f(pr.addedKg, 0)} kg
                      </div>
                      {pr.flags.map((x, k) => (
                        <div key={k} className="hint" style={{ color: 'var(--warn)' }}>
                          ⚠ {x}
                        </div>
                      ))}
                      <button className="btn small" style={{ marginTop: 4 }} onClick={() => testProposal(pr)}>
                        Tester (créer la variante)
                      </button>
                    </div>
                  ))}
                  {opt.result.usage.length > 0 && <b>Changement d’usage (à part)</b>}
                  {opt.result.usage.map((pr) => (
                    <div key={pr.id} className="hint">
                      {pr.text}{' '}
                      <button className="btn small ghost" onClick={() => testProposal(pr)}>
                        Tester
                      </button>
                    </div>
                  ))}
                  {opt.result.notes.map((n, k) => (
                    <div key={k} className="hint">
                      {n}
                    </div>
                  ))}
                  {opt.result.tried.length > 0 && (
                    <details className="hint">
                      <summary style={{ cursor: 'pointer' }}>Essais faits ({opt.result.tried.length})</summary>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {opt.result.tried.map((t, k) => (
                          <li key={k} className="opt-try">
                            {t.title} → {t.result}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              <div>
                <button className="btn small ghost" onClick={() => setShowDetail((x) => !x)}>
                  {showDetail ? 'Masquer' : 'Afficher'} les résultats détaillés (3D colorée par η)
                </button>
              </div>
              {showDetail && p.renderResults(selRun)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Un assemblage hors gabarit : statut, raisons, capacités avant / après ; saisie des capacités inconnues. */
function JointRowView({ row, who, onCapacity }: { row: JointRow; who: string; onCapacity: (caps: Array<{ connection: string; key: string; value: number; modules?: string[]; by: string; at: string }>) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const unit = (u: string) => (u === 'N·mm' ? 'kNm' : 'kN');
  const conv = (u: string, v: number) => (u === 'N·mm' ? v / 1e6 : v / 1e3);
  return (
    <div style={{ borderLeft: `3px solid ${STATUS_COLOR[row.status]}`, paddingLeft: 8 }}>
      <div>
        <b>{row.name}</b> ({row.modules.join(', ')}) — <span style={{ color: STATUS_COLOR[row.status] }}>{JOINT_STATUS_LABEL[row.status]}</span>
      </div>
      {row.reasons.map((r, i) => (
        <div key={i} className="hint">
          {r}
        </div>
      ))}
      {row.capacities.length > 0 && (
        <div className="hint">
          {row.capacities.map((c) => `${c.label} : ${c.before !== undefined ? `${f(conv(c.unit, c.before))} → ` : ''}${f(conv(c.unit, c.after ?? NaN))} ${unit(c.unit)}`).join(' ; ')}
        </div>
      )}
      {row.status === 'unknown' && row.missing && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {row.missing.map((m) => (
            <label key={m.key} className="hint">
              {m.label}{' '}
              <input style={{ width: 70 }} value={vals[m.key] ?? ''} onChange={(e) => setVals({ ...vals, [m.key]: e.target.value })} /> {unit(m.unit)}
            </label>
          ))}
          <button
            className="btn small"
            onClick={() => {
              const at = new Date().toISOString();
              const caps = row
                .missing!.filter((m) => Number.isFinite(parseFloat((vals[m.key] ?? '').replace(',', '.'))))
                .map((m) => ({ connection: row.connection, key: m.key, value: parseFloat(vals[m.key].replace(',', '.')) * (m.unit === 'N·mm' ? 1e6 : 1e3), modules: row.modules, by: who, at }));
              if (caps.length) onCapacity(caps);
            }}
          >
            Saisir (non vérifié)
          </button>
        </div>
      )}
    </div>
  );
}
