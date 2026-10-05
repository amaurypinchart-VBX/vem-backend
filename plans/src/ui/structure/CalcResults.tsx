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
import { modelSegments } from '../../structure/core/templateView';
import { familyName } from '../../structure/report/build';
import { materialByKey } from '../../structure/core/materials';
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
  blocking: string[];
  warnings: string[];
  running: boolean;
  progress: { done: number; total: number } | null;
  run: StudyRun | null;
  stale: boolean;
  error: string;
  onRun: () => void;
  onCancel: () => void;
  onShowResults: () => void;
  /** modifications de l'étude hors modèle SketchUp (conseil ingénieur) */
  modsLines?: string[];
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
          <label className="row" style={{ justifyContent: 'space-between' }} title="frottement calage / sol pour le glissement global (valeur prudente à confirmer)">
            Frottement disponible (glissement)
            <input type="number" step={0.05} min={0.05} max={1} value={o.friction} onChange={(e) => set('friction', Math.max(0.05, parseFloat(e.target.value) || 0.4))} style={{ width: 80 }} />
          </label>
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
          <label className="row">
            <input type="checkbox" checked={o.upliftAll} onChange={(e) => set('upliftAll', e.target.checked)} /> Appui soulevé : plus de retenue horizontale (prudent)
          </label>
          <label className="row">
            <input type="checkbox" checked={o.internalPressure} onChange={(e) => set('internalPressure', e.target.checked)} /> Pression intérieure sur le plancher (installation ouverte)
          </label>
          <label className="row" title="S275 et courbes a pour les tubes, contacts encastrés : comme l'annexe SCIA des notes statico">
            <input type="checkbox" checked={o.calibration} onChange={(e) => set('calibration', e.target.checked)} /> Calage statico (matériaux et courbes de flambement de l’annexe SCIA)
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
}

export function ResultsPanel({ scene, glassTest, active, recognition, run, stale, ai, studyId, facts }: ResultsPanelProps) {
  const holder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [showBars, setShowBars] = useState(false);
  const [bar, setBar] = useState<number | null>(null);

  // taux maxi par Viewbox → couleur de la Viewbox et de ses pièces
  const colors = useMemo(() => (run ? moduleEtaColors(run, scene, recognition, family) : new Map<string, number>()), [run, scene, recognition, family]);

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
    if (!run || !showBars) {
      v.setBarOverlay(null);
      v.onBarPick(null);
      v.setVisibility(null);
      return;
    }
    const seg = modelSegments(run.structure, (k) => {
      const ts = barItems.get(k);
      if (!ts?.length) return 0x9ca3af;
      return etaColor(Math.max(...ts.map((t) => run.summary.states[t]?.eta ?? Infinity)));
    });
    v.setVisibility([], [], true);
    v.setBarOverlay(seg.positions, seg.colors, 3);
    v.onBarPick((k) => setBar(k));
  }, [run, showBars, active, barItems]);

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
          <span>— {showBars ? 'pire taux de chaque barre (clic : ses vérifications)' : `pire taux de chaque Viewbox${family ? ` (${family})` : ''}`}</span>
        </div>
        {showBars && bar !== null && run.structure.meta[bar] && (
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
                <td>Plancher contreplaqué (bande de 1 m)</td>
                <td>—</td>
                <td>
                  <Eta eta={pctx.blocked ? undefined : pctx.eta} />
                </td>
                <td className="hint">qEd statico</td>
              </tr>
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
