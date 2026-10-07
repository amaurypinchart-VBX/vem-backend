// Étapes « 3. Calcul » (options, lancement, progression, annulation, résultat périmé) et « 4. Résultats » (verdict,
// familles, éléments les plus sollicités avec leurs formules, stabilité, plancher, vue 3D colorée par taux de travail).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import { SceneViewer } from '../../viewer/SceneViewer';
import { EC3_METHOD_LABEL } from '../../structure/core/checks/ec3';
import type { Ec3Method } from '../../structure/core/checks/ec3';
import type { CalcRecord, Verdict } from '../../structure/core/records';
import { VERDICT_LABEL, verdictOf } from '../../structure/core/records';
import type { Recognition } from '../../structure/core/recognition';
import { fmtNumber } from '../../structure/core/units';
import type { CalcOptions, StudyRun } from '../../structure/studyRun';
import type { ElementChecks } from '../../structure/core/checks/facade';
import { modelSegments } from '../../structure/core/templateView';
import { familyName } from '../../structure/report/build';
import { materialByKey } from '../../structure/core/materials';
import type { VariantChanges } from '../../structure/advisor/diagnose';
import type { ModuleExplain } from '../../structure/advisor/explain';
import { BAND_TEXT, explainModule } from '../../structure/advisor/explain';
import type { AiState } from './aiUi';
import { AiReviewCard } from './aiUi';

const n = (v: number, d = 2) => fmtNumber(v, d);
const VERDICT_COLOR: Record<Verdict, string> = { ok: 'var(--ok)', limit: 'var(--warn)', fail: 'var(--danger)', incomplete: 'var(--danger)' };

/** Couleur d'un taux de travail (vue 3D et barres). */
export function etaColor(eta: number | undefined): number {
  if (eta === undefined || !Number.isFinite(eta)) return 0x8b5cf6;
  if (eta <= 0.5) return 0x22c55e;
  if (eta <= 0.9) return 0xeab308;
  if (eta <= 1) return 0xf97316;
  return 0xef4444;
}
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Couleur de chaque Viewbox (et de ses pièces) selon son pire taux de travail, éventuellement pour une famille. */
export function moduleEtaColors(run: StudyRun, scene: LoadedScene, recognition: Recognition, family: string | null = null): Map<string, number> {
  const map = new Map<string, number>();
  const byModule = new Map<string, number>();
  run.index.items.forEach((it, t) => {
    if (family && it.family !== family) return;
    const e = run.summary.states[t]?.eta ?? Infinity;
    byModule.set(it.module, Math.max(byModule.get(it.module) ?? 0, e));
  });
  for (const m of scene.index.modules) if (byModule.has(m.id)) map.set(m.nodeId, etaColor(byModule.get(m.id)));
  for (const [nodeId, moduleId] of recognition.templateParts) {
    const node = scene.index.modules.find((m) => m.id === moduleId);
    if (node && map.has(node.nodeId)) map.set(nodeId, map.get(node.nodeId)!);
  }
  return map;
}

/** Viewbox d'un objet cliqué dans la vue 3D : le module lui-même, une de ses pièces ou un objet qui lui est rattaché. */
export function moduleOfNode(scene: LoadedScene, recognition: Recognition, nodeId: string | null | undefined): string | null {
  if (!nodeId) return null;
  const byNode = new Map(scene.index.nodes.map((n) => [n.id, n]));
  let id: string | null = nodeId;
  for (let guard = 0; id && guard < 64; guard++) {
    const mod = scene.index.modules.find((m) => m.nodeId === id);
    if (mod) return mod.id;
    const tp = recognition.templateParts.get(id);
    if (tp) return tp;
    const n = byNode.get(id);
    if (!n) return null;
    if (n.moduleId && n.assignment !== 'common') return n.moduleId;
    id = n.parentId;
  }
  return null;
}

function Eta({ eta }: { eta: number | undefined }) {
  const w = eta !== undefined && Number.isFinite(eta) ? Math.min(1.2, eta) / 1.2 : 1;
  return (
    <span className="row" style={{ gap: 6, minWidth: 130 }}>
      <span style={{ display: 'inline-block', width: 70, height: 8, background: 'var(--bg-3)', borderRadius: 4, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${w * 100}%`, height: '100%', background: hex(etaColor(eta)) }} />
      </span>
      <b style={{ color: hex(etaColor(eta)) }}>{eta !== undefined && Number.isFinite(eta) ? n(eta) : '⛔'}</b>
    </span>
  );
}

function Records({ records }: { records: CalcRecord[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
      {records.map((r) => (
        <div key={r.key} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 8 }}>
          <div>
            <b>{r.title}</b> <span className="hint">— {r.clause}</span>
            {r.eta !== undefined && <span style={{ float: 'right' }}>η = {n(r.eta)}</span>}
          </div>
          <div className="hint">{r.formula}</div>
          <div>{r.withValues}</div>
        </div>
      ))}
    </div>
  );
}

// ─── étape 3 ───

export interface CalcPanelProps {
  options: CalcOptions;
  setOptions: (o: CalcOptions) => void;
  /** tige des pieds à vérin (bibliothèque VBX-JACK) */
  jack?: { d: number; d3: number; fy: number; extensionMax: number; perModule: number } | null;
  modulesCount: number;
  /** escaliers extérieurs calculés */
  stairs: number;
  blocking: string[];
  warnings: string[];
  running: boolean;
  progress: { done: number; total: number } | null;
  /** recherche de la charge maximale admissible en cours (calculs complets) */
  capProgress?: { done: number; total: number } | null;
  run: StudyRun | null;
  stale: boolean;
  error: string;
  onRun: () => void;
  onCancel: () => void;
  onShowResults: () => void;
  /** modifications de l'étude hors modèle SketchUp (conseil ingénieur) */
  modsLines?: string[];
  /** pieds du milieu calés (Site & hypothèses › options avancées) */
  middleFeet?: boolean;
}

export function CalcPanel(p: CalcPanelProps) {
  const o = p.options;
  const set = <K extends keyof CalcOptions>(k: K, v: CalcOptions[K]) => p.setOptions({ ...o, [k]: v });
  return (
    <div className="card">
      <div className="card-head">
        <h3>Calcul complet</h3>
        <div className="spacer" style={{ flex: 1 }} />
        {p.running ? (
          <button className="btn small" onClick={p.onCancel}>
            Annuler
          </button>
        ) : (
          <button className="btn small primary" onClick={p.onRun} disabled={!p.modulesCount}>
            {p.run ? '↻ Relancer le calcul' : '▶ Lancer le calcul'}
          </button>
        )}
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="hint">
          Modèle filaire 3D des {p.modulesCount} Viewbox (gabarit relevé sur les modèles SCIA statico), charges et vent, 42 combinaisons statico (ELU, stabilité, ELS), 2ᵉ ordre avec défaut d’aplomb
          1/200, appuis et contacts en compression seule ; vérifications EC3 de chaque tronçon, assemblages Viewbox, stabilité, plancher.
        </div>
        {!!p.modsLines?.length && (
          <div className="hint">
            <b>Modifications de l’étude (hors modèle SketchUp)</b> — onglet Conseil ingénieur :
            <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
              {p.modsLines.map((l, k) => (
                <li key={k}>{l}</li>
              ))}
            </ul>
          </div>
        )}
        {p.blocking.length > 0 && (
          <div className="warnings">
            {p.blocking.map((w, k) => (
              <div key={k} className="warning error">
                <span className="sev">BLOQUANT</span>
                <span className="msg">{w}</span>
              </div>
            ))}
          </div>
        )}
        {p.warnings.length > 0 && (
          <div className="warnings">
            {p.warnings.map((w, k) => (
              <div key={k} className="warning warning">
                <span className="sev">ATTENTION</span>
                <span className="msg">{w}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '6px 24px' }}>
          <label className="row" style={{ justifyContent: 'space-between' }}>
            Méthode des vérifications acier
            <select value={o.ec3Method} onChange={(e) => set('ec3Method', e.target.value as Ec3Method)}>
              {(Object.keys(EC3_METHOD_LABEL) as Ec3Method[]).map((m) => (
                <option key={m} value={m}>
                  {EC3_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="row" style={{ justifyContent: 'space-between' }} title="frottement calage / sol pour le glissement global (DIN EN 13814 tab. 3, statico 18-0573 § 4)">
            Frottement disponible (glissement)
            <input type="number" step={0.05} min={0.05} max={1} value={o.friction} onChange={(e) => set('friction', Math.max(0.05, parseFloat(e.target.value) || 0.6))} style={{ width: 80 }} />
          </label>
          <div className="hint" style={{ marginTop: -4 }}>
            0,6 : bois sur béton ou asphalte, couches de bois vissées entre elles et au pied · 0,4 : bois sur bois, acier sur bois, couches non liées (DIN EN 13814 tab. 3, statico 18-0573 § 4).{' '}
            <button className="btn small ghost" onClick={() => set('friction', 0.6)}>
              0,6
            </button>{' '}
            <button className="btn small ghost" onClick={() => set('friction', 0.4)}>
              0,4
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="row">
              <input type="checkbox" checked={o.jacks} onChange={(e) => set('jacks', e.target.checked)} /> Pieds à vérin utilisés (appuis aux réceptions de pied)
            </label>
            {o.jacks && (
              <div className="hint" style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.jack ? (
                  <>
                    <span>
                      Tige Tr {n(p.jack.d, 0)} × 5 classe 10.9 (noyau {n(p.jack.d3, 1)} mm, fy {n(p.jack.fy, 0)} N/mm²), {n(p.jack.perModule, 0)} vérins par Viewbox (4 angles + milieu des 2 grands côtés), sortie{' '}
                      {n(p.jack.extensionMax / 10, 0)} cm au plus.
                    </span>
                    <label className="row" style={{ gap: 6 }}>
                      Sortie des tiges
                      <input
                        type="number"
                        step={0.5}
                        min={0.5}
                        max={p.jack.extensionMax / 10}
                        value={Math.min(o.jackExtension, p.jack.extensionMax) / 10}
                        onChange={(e) => set('jackExtension', Math.min(p.jack!.extensionMax, Math.max(5, (parseFloat(e.target.value) || 0) * 10)))}
                        style={{ width: 70 }}
                      />{' '}
                      cm (maxi {n(p.jack.extensionMax / 10, 0)} cm, calcul au plus défavorable par défaut)
                    </label>
                  </>
                ) : (
                  <span>Tige de vérin absente ou désactivée dans la bibliothèque (VBX-JACK).</span>
                )}
              </div>
            )}
          </div>
          {!o.jacks && (
            <label className="row" title="Sans vérins : la cale du milieu du grand côté est posée directement sous la rive (UNP) et non sous la réception centrale, 155 mm à l’intérieur — la rive n’est plus tordue par l’appui du milieu">
              <input type="checkbox" checked={!!o.middleUnderRim} disabled={!p.middleFeet} onChange={(e) => set('middleUnderRim', e.target.checked)} /> Cale du milieu directement sous la rive (UNP)
              {!p.middleFeet && <span className="hint">&nbsp;— pieds du milieu non calés (Site & hypothèses › options avancées)</span>}
            </label>
          )}
          <label className="row">
            <input type="checkbox" checked={o.upliftAll} onChange={(e) => set('upliftAll', e.target.checked)} /> Appui soulevé : plus de retenue horizontale (prudent)
          </label>
          {p.stairs > 0 && (
            <label className="row" title="Bâches ou panneaux sous les limons et le palier : le vent agit sur toute la hauteur jusqu'au sol (statico : lest des pieds d'escalier si habillé)">
              <input type="checkbox" checked={!!o.stairClad} onChange={(e) => set('stairClad', e.target.checked)} /> Escalier habillé (bâches ou panneaux sous les limons et le palier)
            </label>
          )}
          <label className="row">
            <input type="checkbox" checked={o.internalPressure} onChange={(e) => set('internalPressure', e.target.checked)} /> Pression intérieure sur le plancher (installation ouverte)
          </label>
          <label className="row" title="Appuis de l'annexe SCIA Hoka / Qatar (50 kN/cm horizontalement, rigides verticalement), pas de boulons de toiture sous un étage ; sinon appuis du calcul de type 18-0573 (100 / 1 000 kN/cm)">
            <input type="checkbox" checked={o.calibration} onChange={(e) => set('calibration', e.target.checked)} /> Calage statico (appuis et assemblages des annexes SCIA Hoka / Qatar)
          </label>
        </div>
        {p.running && p.progress && (
          <div className="progress-row">
            <div className="progress">
              <div style={{ width: `${(100 * p.progress.done) / Math.max(1, p.progress.total)}%` }} />
            </div>
            <span className="hint">
              {p.progress.done} / {p.progress.total} combinaisons
            </span>
          </div>
        )}
        {!p.running && p.capProgress && (
          <div className="progress-row">
            <div className="progress">
              <div style={{ width: `${(100 * p.capProgress.done) / Math.max(1, p.capProgress.total)}%` }} />
            </div>
            <span className="hint">Charge maximale admissible : calculs à charge croissante… (les résultats sont déjà disponibles)</span>
          </div>
        )}
        {p.error && <div className="error-box">{p.error}</div>}
        {p.run && !p.running && (
          <div className="row" style={{ gap: 12 }}>
            <b style={{ color: VERDICT_COLOR[p.run.verdict.verdict] }}>{VERDICT_LABEL[p.run.verdict.verdict]}</b>
            <span className="hint">
              {p.run.structure.fem.nodes.length} nœuds, {p.run.structure.fem.members.length} barres, {p.run.summary.done.length} combinaisons en {n(p.run.durationMs / 1000, 1)} s
            </span>
            {p.stale && <span className="badge orange">périmé : les données ont changé depuis le calcul</span>}
            <button className="btn small" onClick={p.onShowResults}>
              Voir les résultats →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── étape 4 ───

export interface ResultsPanelProps {
  scene: LoadedScene;
  glassTest: GlassTest;
  active: boolean;
  recognition: Recognition;
  run: StudyRun | null;
  stale: boolean;
  ai?: AiState | null;
  studyId?: string | null;
  /** données du calcul pour la relecture par l'IA */
  facts?: () => Record<string, unknown>;
  /** frottement de l'étude (pistes de la fiche Viewbox) */
  friction?: number;
  /** « Simuler » une piste de la fiche Viewbox : variante calculée et comparée (onglet Variantes) */
  onSimulate?: (title: string, changes: VariantChanges) => void;
}

export function ResultsPanel({ scene, glassTest, active, recognition, run, stale, ai, studyId, facts, friction, onSimulate }: ResultsPanelProps) {
  const holder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [showBars, setShowBars] = useState(false);
  const [bar, setBar] = useState<number | null>(null);
  // Viewbox cliquée : sa fiche (pourquoi cette couleur, risque, pistes)
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => setFocus(null), [run]);
  const fiche = useMemo(() => (run && focus ? explainModule(run, focus, { friction: friction ?? 0.6 }) : null), [run, focus, friction]);

  // taux maxi par Viewbox → couleur de la Viewbox et de ses pièces ; Viewbox cliquée : les autres en gris clair
  const colors = useMemo(() => {
    if (!run) return new Map<string, number>();
    const m = moduleEtaColors(run, scene, recognition, family);
    if (!focus) return m;
    const keep = new Set([scene.index.modules.find((x) => x.id === focus)?.nodeId, ...[...recognition.templateParts].filter(([, mod]) => mod === focus).map(([k]) => k)]);
    for (const k of m.keys()) if (!keep.has(k)) m.set(k, 0xd1d5db);
    return m;
  }, [run, scene, recognition, family, focus]);

  // le cadre 3D n'existe qu'une fois un résultat disponible : la vue est créée à ce moment-là
  const hasRun = !!run;
  useEffect(() => {
    if (!holder.current) return;
    const v = new SceneViewer(holder.current, scene, glassTest);
    viewerRef.current = v;
    return () => {
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, hasRun]);
  useEffect(() => {
    if (!active) return;
    viewerRef.current?.reclaim();
    viewerRef.current?.setColorOverlay(colors);
  }, [active, colors, hasRun]);
  // clic sur une Viewbox : sa fiche ; clic dans le vide : plus de fiche
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !active || !run) return;
    v.onPick((p) => {
      setFocus(moduleOfNode(scene, recognition, p?.nodeId));
      setBar(null);
    });
    return () => v.onPick(null);
  }, [active, run, scene, recognition, hasRun]);

  // barres du modèle de calcul colorées par le pire taux des vérifications qui les contiennent
  const barItems = useMemo(() => {
    const m = new Map<number, number[]>();
    run?.index.items.forEach((it, t) => {
      for (const k of it.members) {
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(t);
      }
    });
    return m;
  }, [run]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !active) return;
    if (!run || (!showBars && !focus)) {
      v.setBarOverlay(null);
      v.onBarPick(null);
      v.setVisibility(null);
      return;
    }
    const colorOf = (k: number) => {
      const ts = barItems.get(k);
      if (!ts?.length) return 0x9ca3af;
      return etaColor(Math.max(...ts.map((t) => run.summary.states[t]?.eta ?? Infinity)));
    };
    if (showBars) {
      const seg = modelSegments(run.structure, colorOf);
      v.setVisibility([], [], true);
      v.setBarOverlay(seg.positions, seg.colors, 3);
    } else {
      // Viewbox cliquée : ses barres vérifiées par-dessus le modèle, colorées par leur taux (où est la pièce orange / rouge)
      const own = run.structure.meta.map((m, k) => (m.module === focus && barItems.has(k) ? k : -1)).filter((k) => k >= 0);
      const all = modelSegments(run.structure, colorOf);
      const pos = new Float32Array(own.length * 6);
      const col = new Float32Array(own.length * 6);
      own.forEach((k, i) => {
        pos.set(all.positions.subarray(k * 6, k * 6 + 6), i * 6);
        col.set(all.colors.subarray(k * 6, k * 6 + 6), i * 6);
      });
      v.setVisibility(null);
      v.setBarOverlay(pos, col, 4);
      const ownBar = (i: number | null) => setBar(i === null ? null : own[i]);
      v.onBarPick(ownBar);
      return;
    }
    v.onBarPick((k) => setBar(k));
  }, [run, showBars, active, barItems, focus]);

  if (!run)
    return (
      <div className="card">
        <div className="card-body hint">Pas encore de résultat : lancer le calcul à l’étape 3.</div>
      </div>
    );
  const v = run.verdict;
  const st = run.summary.states;
  const top = v.ranking.filter((t) => !family || run.index.items[t].family === family).slice(0, 20);
  const pctx = run.plywood;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(420px, 2fr)', gap: 16, alignItems: 'start' }}>
      <div className="card" style={{ position: 'sticky', top: 0 }}>
        <div ref={holder} style={{ height: 520 }} />
        <div className="card-body row hint" style={{ gap: 12, flexWrap: 'wrap' }}>
          <label className="row" title="Barres du modèle de calcul (gabarit de chaque Viewbox + liaisons), cliquables">
            <input type="checkbox" checked={showBars} onChange={(e) => setShowBars(e.target.checked)} /> barres du calcul
          </label>
          {[
            ['≤ 0,50', 0.4],
            ['≤ 0,90', 0.8],
            ['≤ 1,00', 0.95],
            ['> 1,00', 1.2],
            ['bloqué', Infinity],
          ].map(([l, e]) => (
            <span key={l as string} className="row" style={{ gap: 4 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: hex(etaColor(e as number)) }} /> {l as string}
            </span>
          ))}
          <span>— {showBars ? 'pire taux de chaque barre (clic : ses vérifications)' : focus ? `barres de ${focus} (clic : ses vérifications)` : `pire taux de chaque Viewbox${family ? ` (${family})` : ''} — cliquer une Viewbox pour savoir pourquoi`}</span>
        </div>
        {(showBars || focus) && bar !== null && run.structure.meta[bar] && (
          <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
            {(() => {
              const m = run.structure.meta[bar];
              const sec = run.structure.fem.members[bar];
              const ts = barItems.get(bar) ?? [];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    <b>{m.label}</b>{' '}
                    <span className="hint">
                      — {m.section} · {materialByKey(m.material)?.name ?? m.material}
                      {m.massless ? ' · barre de liaison sans masse' : ''} · barre {sec.id}
                    </span>
                  </div>
                  {ts.length ? (
                    ts.map((t) => (
                      <div key={t}>
                        <div className="row" style={{ gap: 8 }}>
                          <span>{run.index.items[t].label}</span>
                          <Eta eta={run.summary.states[t]?.eta} />
                          <span className="hint">
                            {run.summary.states[t]?.combo} · {run.summary.states[t]?.governing}
                          </span>
                        </div>
                        <Records records={run.summary.states[t]?.records ?? []} />
                      </div>
                    ))
                  ) : (
                    <div className="hint">Barre de liaison ou de contact : pas de vérification propre (ses efforts sont vérifiés par l’assemblage correspondant).</div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fiche ? (
          <ModuleCard fiche={fiche} onClose={() => setFocus(null)} onSimulate={onSimulate} />
        ) : (
          <div className="hint" style={{ padding: '0 4px' }}>
            👆 Cliquer une Viewbox dans la vue 3D : pourquoi elle est verte, jaune, orange ou rouge, ce qui se passerait au-delà de 1, quoi changer, et où se situe statico.
          </div>
        )}
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: VERDICT_COLOR[v.verdict] }}>{VERDICT_LABEL[v.verdict]}</div>
            {stale && <span className="badge orange">Résultat périmé : les données ont changé depuis le calcul — relancer l’étape 3</span>}
            {v.reasons.map((r, k) => (
              <div key={k} className="hint" style={{ color: 'var(--danger)' }}>
                {r}
              </div>
            ))}
            <div className="hint">Pré-étude interne, non vérifiée par un ingénieur.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Par famille</h3>
            {family && (
              <button className="btn small ghost" onClick={() => setFamily(null)}>
                toutes
              </button>
            )}
          </div>
          <table className="list">
            <thead>
              <tr>
                <th>Famille</th>
                <th>Nb</th>
                <th>η max</th>
                <th>Combinaison</th>
              </tr>
            </thead>
            <tbody>
              {v.families.map((f) => (
                <tr key={f.family} onClick={() => setFamily(f.family === family ? null : f.family)} style={{ cursor: 'pointer', background: f.family === family ? 'var(--bg-3)' : undefined }}>
                  <td>{familyName(f.family)}</td>
                  <td>{f.count}</td>
                  <td>
                    <Eta eta={st[f.item]?.eta} />
                  </td>
                  <td className="hint">
                    {st[f.item]?.combo} · {st[f.item]?.governing}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  Plancher contreplaqué
                  {pctx.build && (pctx.build.layers > 1 ? ` ${pctx.build.layers} × ${n(pctx.build.thickness, 0)} mm = ${n(pctx.build.layers * pctx.build.thickness, 0)} mm` : ` ${n(pctx.build.thickness, 0)} mm (1 couche)`)} (bande de 1 m)
                </td>
                <td>—</td>
                <td>
                  <Eta eta={pctx.blocked ? undefined : pctx.eta} />
                </td>
                <td className="hint">qEd statico</td>
              </tr>
              {[
                ['Façades et garde-corps (18-0573 § 3.6 – 3.7)', run.facade],
                ['Éléments terrasse (18-0573 § 3.5)', run.terraces],
              ]
                .filter(([, c]) => (c as ElementChecks | undefined)?.records.length)
                .map(([label, c]) => (
                  <tr key={label as string}>
                    <td>{label as string}</td>
                    <td>{(c as ElementChecks).records.length}</td>
                    <td>
                      <Eta eta={(c as ElementChecks).eta} />
                    </td>
                    <td className="hint">vent du site / exploitation</td>
                  </tr>
                ))}
              <tr>
                <td>Glissement global (μ requis {n(run.stability.sliding.muReq)})</td>
                <td>—</td>
                <td>
                  <Eta eta={run.stability.sliding.eta} />
                </td>
                <td className="hint">{run.stability.sliding.combo}</td>
              </tr>
            </tbody>
          </table>
          <div className="card-body hint" style={{ color: run.stability.overturning.verdict === 'ok' ? undefined : 'var(--danger)' }}>
            Basculement : {run.stability.overturning.text}
          </div>
        </div>
        {[
          ['Façades et garde-corps', run.facade],
          ['Éléments terrasse', run.terraces],
        ]
          .filter(([, c]) => {
            const x = c as ElementChecks | undefined;
            return x && (x.records.length || x.notes.length || x.failures.length || x.missing.length);
          })
          .map(([title, c]) => {
            const x = c as ElementChecks;
            return (
              <div className="card" key={title as string}>
                <div className="card-head">
                  <h3>{title as string}</h3>
                  <span className="hint">statico 18-0573 (Prüfbuch TÜV)</span>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...x.failures, ...x.missing].map((m, k) => (
                    <div key={`f${k}`} className="hint" style={{ color: 'var(--danger)' }}>
                      {m}
                    </div>
                  ))}
                  {x.notes.map((m, k) => (
                    <div key={`n${k}`} className="hint" style={{ color: 'var(--warn)' }}>
                      ⚠ {m}
                    </div>
                  ))}
                  <Records records={x.records} />
                </div>
              </div>
            );
          })}
        <div className="card">
          <div className="card-head">
            <h3>Les plus sollicités{family ? ` — ${family}` : ''}</h3>
          </div>
          <table className="list">
            <tbody>
              {top.map((t) => {
                const s = st[t];
                const it = run.index.items[t];
                return (
                  <Fragment key={it.id}>
                    <tr onClick={() => setOpen(open === t ? null : t)} style={{ cursor: 'pointer' }}>
                      <td>
                        {it.label}
                        <div className="hint">{it.family}</div>
                      </td>
                      <td>
                        <Eta eta={s?.eta} />
                      </td>
                      <td className="hint">
                        {s?.combo} · {s?.governing} · {verdictOf(s?.eta) === 'ok' ? '✅' : verdictOf(s?.eta) === 'limit' ? '⚠️' : s?.blocked ? '⛔' : '❌'}
                      </td>
                    </tr>
                    {open === t && s && (
                      <tr>
                        <td colSpan={3}>
                          {s.blocked && <div style={{ color: 'var(--danger)' }}>{s.blocked}</div>}
                          <Records records={s.records} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Stabilité, plancher, hypothèses de charge</h3>
          </div>
          <div className="card-body">
            <Records records={[...(run.stability.sliding.record ? [run.stability.sliding.record] : []), ...pctx.records, ...run.loads.records]} />
          </div>
        </div>
        {facts && !stale && <AiReviewCard ai={ai ?? null} facts={facts} studyId={studyId} />}
        {(run.warnings.length > 0 || run.summary.errors.length > 0) && (
          <div className="card">
            <div className="card-head">
              <h3>Messages du calcul</h3>
            </div>
            <div className="card-body warnings">
              {run.summary.errors.map((e, k) => (
                <div key={`e${k}`} className="warning error">
                  <span className="sev">{e.combo}</span>
                  <span className="msg">{e.message}</span>
                </div>
              ))}
              {run.warnings.map((w, k) => (
                <div key={k} className="warning warning">
                  <span className="sev">ATTENTION</span>
                  <span className="msg">{w}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── fiche d'une Viewbox (clic dans la vue 3D) ───

function ModuleCard({ fiche, onClose, onSimulate }: { fiche: ModuleExplain; onClose: () => void; onSimulate?: (title: string, changes: VariantChanges) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const w = fiche.worst;
  const color = hex(etaColor(w ? fiche.eta : 0));
  return (
    <div className="card" style={{ borderColor: color, borderWidth: 2 }}>
      <div className="card-head">
        <h3>
          {fiche.module} <span className="hint">— {fiche.level ? `niveau ${fiche.level}` : 'rez-de-chaussée'}</span>
        </h3>
        <div style={{ flex: 1 }} />
        {w && <Eta eta={fiche.eta} />}
        <button className="btn small ghost" onClick={onClose} title="Fermer la fiche">
          ✕
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="hint" style={{ color }}>
          {BAND_TEXT[fiche.band]}
        </div>
        <div className="hint">{fiche.supports}</div>
        {w ? (
          <>
            <div>
              <div>
                <b>Ce qui donne la couleur :</b> {w.item.label}
              </div>
              <div className="hint">{w.what}</div>
            </div>
            <div>
              <b>Ce qui est vérifié :</b> {w.check}
            </div>
            <div>
              <b>Dans quel cas :</b> {w.scenario}
            </div>
            {fiche.causes.length > 0 && (
              <div>
                <b>Pourquoi c’est chargé :</b>
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  {fiche.causes.map((c, k) => (
                    <li key={k}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ color: fiche.eta > 1 ? 'var(--danger)' : undefined }}>
              <b>Le risque :</b> {w.risk.replace(/^Si η dépasse 1 : /, `si η dépasse 1, `)}
            </div>
            {w.statico && (
              <div className="hint">
                <b>Pour situer — statico :</b> {w.statico}
              </div>
            )}
            {fiche.remedies.length > 0 && (
              <div>
                <b>Ce qu’on peut changer :</b>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {fiche.remedies.map((r) => (
                    <div key={r.id} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 8 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <b>{r.title}</b>
                        {r.special && <span className="badge orange">pièce spéciale</span>}
                        <div style={{ flex: 1 }} />
                        {r.action === 'simulate' && r.changes && onSimulate && (
                          <button className="btn small" onClick={() => onSimulate(r.title, r.changes!)} title="Calculer cette variante et la comparer à l’étude (onglet Variantes)">
                            🧪 Simuler
                          </button>
                        )}
                      </div>
                      <div className="hint">{r.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {fiche.eta <= 0.9 && <div className="hint">Rien à changer pour cette Viewbox : toutes ses vérifications gardent une réserve.</div>}
            <div>
              <b>Toutes ses vérifications</b> <span className="hint">(une ligne par famille, clic : formules)</span>
              <table className="list">
                <tbody>
                  {fiche.families.map((f) => (
                    <Fragment key={f.t}>
                      <tr onClick={() => setOpen(open === f.t ? null : f.t)} style={{ cursor: 'pointer' }}>
                        <td>
                          {f.item.family}
                          <div className="hint">{f.item.label}</div>
                        </td>
                        <td>
                          <Eta eta={f.state.eta} />
                        </td>
                        <td className="hint">
                          {f.state.combo} · {f.state.governing}
                        </td>
                      </tr>
                      {open === f.t && (
                        <tr>
                          <td colSpan={3}>
                            <div className="hint" style={{ marginBottom: 4 }}>
                              {f.what} {f.check} {f.risk}
                            </div>
                            <div className="hint" style={{ marginBottom: 4 }}>
                              {f.scenario}
                            </div>
                            {f.state.blocked && <div style={{ color: 'var(--danger)' }}>{f.state.blocked}</div>}
                            <Records records={f.state.records} />
                            {f.statico && <div className="hint">statico : {f.statico}</div>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="hint">Aucune vérification propre à cette Viewbox dans le calcul.</div>
        )}
      </div>
    </div>
  );
}
