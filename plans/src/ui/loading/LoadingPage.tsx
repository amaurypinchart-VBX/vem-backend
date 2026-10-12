// Onglet « Loading liste » d'un modèle analysé : étapes 1 Topologie (ce que l'app a compris : box, îlots, jonctions,
// pieds, façades — chaque valeur corrigeable à la main) · 2 Produits (comptage par pose, miroirs écartés, pièces
// « À identifier » → « Qu'est-ce que c'est ? » → mémoriser) · 3 Questions chantier · 4 Loading liste · 5 Export
// (phases suivantes). Liste à gauche, 3D à droite : un clic sur une ligne surligne d'où elle vient.
// Enregistrement automatique 2 s après la dernière modification (table loading_lists, une liste par version de modèle).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import { nodeIdOf } from '../../scene/loadedScene';
import type { ModelVersion, VemUser } from '../../api/vem';
import { PROJECT_ID, vem } from '../../api/vem';
import { SceneViewer } from '../../viewer/SceneViewer';
import type { GlassTest } from '../../linework/packets';
import type { CatalogueItem, CountingBase } from '../../loading/core/types';
import { COUNTING_BASE_LABEL } from '../../loading/core/types';
import { SEED_CATALOGUE } from '../../loading/library/catalogue';
import type { ServerCatalogueRow } from '../../loading/library/merge';
import { mergeCatalogue } from '../../loading/library/merge';
import { buildTopology, topologySummary } from '../../loading/topology/build';
import type { ProductAnswers } from '../../loading/topology/products';
import type { Topology, TopologyOverrides } from '../../loading/topology/types';
import { HIGHLIGHT, ISLAND_COLORS, JUNCTION_COLORS, nodeColors, topologyOverlay } from '../../loading/topology/overlay';

type Step = 'topology' | 'products' | 'questions' | 'list' | 'export';
type StepState = 'ok' | 'warn' | 'bad' | 'todo';
const STEP_ICON: Record<StepState, string> = { ok: '✔', warn: '⚠', bad: '✖', todo: '·' };
const STEP_COLOR: Record<StepState, string> = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', todo: 'var(--text-dim)' };
const EDITORS = ['admin', 'technical_manager'];
const UNKNOWN_COLOR = 0xf97316;

/** Bases montrées à l'étape Topologie, dans l'ordre. */
const TOPOLOGY_ROWS: CountingBase[] = [
  'box',
  'ilot',
  'ilot_couvert',
  'jonction_grand_cote',
  'jonction_petit_cote',
  'jonction_toit_grand_cote',
  'jonction_toit_petit_cote',
  'pied',
  'pied_box',
  'cote',
  'cote_vitre_court',
  'cote_vitre_long',
  'panneau',
  'panneau_plein',
  'jonction_panneau',
  'jonction_verre',
  'terminaison_vitre',
  'porte_simple',
  'porte_double',
  'porte_coulissante',
  'poteau',
  'airco',
  'bord',
];
const ROW_LABEL: Partial<Record<CountingBase, string>> = {
  box: 'Viewbox',
  ilot: 'Îlots (ensembles de box jointives)',
  ilot_couvert: 'Îlots couverts (toits jointifs)',
  jonction_grand_cote: 'Jonctions grand côté',
  jonction_petit_cote: 'Jonctions petit côté',
  jonction_toit_grand_cote: 'Jonctions de toit grand côté',
  jonction_toit_petit_cote: 'Jonctions de toit petit côté',
  pied: 'Pieds au sol',
  pied_box: 'Pieds de box (avant fusion)',
  cote: 'Côtés de box extérieurs',
  cote_vitre_court: 'Petits côtés vitrés',
  cote_vitre_long: 'Grands côtés vitrés',
  panneau: 'Panneaux de façade',
  panneau_plein: 'Murs pleins',
  jonction_panneau: 'Jonctions de panneaux sans vitre',
  jonction_verre: 'Jonctions avec une vitre',
  terminaison_vitre: 'Bouts de vitre contre un poteau',
  porte_simple: 'Portes simples',
  porte_double: 'Portes doubles',
  porte_coulissante: 'Portes coulissantes',
  poteau: 'Poteaux',
  airco: 'Airco dessinées',
  bord: 'Côtés vers une terrasse ou le vide',
};

interface Props {
  scene: LoadedScene;
  model?: ModelVersion;
  glassTest: GlassTest;
  active: boolean;
  framesVersion: number;
}

export function LoadingPage({ scene, model, glassTest, active, framesVersion }: Props) {
  const [step, setStep] = useState<Step>('topology');
  const [me, setMe] = useState<VemUser | null>(null);
  const [catRows, setCatRows] = useState<ServerCatalogueRow[]>([]);
  const [memory, setMemory] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<TopologyOverrides>({});
  const [answers, setAnswers] = useState<ProductAnswers>({});
  const [listId, setListId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'local'>('idle');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<{ ids: string[]; label: string } | null>(null);
  const loaded = useRef(false);
  /** valeurs saisies + réponses telles que chargées (évite un enregistrement inutile à l'ouverture) */
  const savedKey = useRef('');

  const refreshMemory = () =>
    vem
      .loadingMatches()
      .then((rows) => setMemory(Object.fromEntries(rows.map((r) => [r.signature, r.article]))))
      .catch(() => {});
  useEffect(() => {
    vem.me().then(setMe).catch(() => {});
    vem.loadingCatalogue().then(setCatRows).catch(() => {});
    void refreshMemory();
    if (!PROJECT_ID || !model) {
      setSaveState('local');
      loaded.current = true;
      return;
    }
    (async () => {
      try {
        const lists = await vem.loadingLists(PROJECT_ID);
        let l = lists.find((x) => x.modelVersionId === model.id) ?? null;
        if (!l) {
          // nouvelle version du modèle : les réponses du projet sont reprises, pas les valeurs saisies à la main
          const prev = lists[0];
          l = await vem.createLoadingList(PROJECT_ID, { modelVersionId: model.id, answers: { products: prev?.answers?.products ?? {}, chantier: prev?.answers?.chantier ?? {} } });
        }
        const ov = (l.overrides ?? {}) as TopologyOverrides;
        const pr = (l.answers?.products ?? {}) as ProductAnswers;
        // une liste sans topologie enregistrée (nouvelle) est enregistrée une première fois
        savedKey.current = l.topology ? JSON.stringify({ overrides: ov, products: pr }) : '';
        setListId(l.id);
        setOverrides(ov);
        setAnswers(pr);
        setSaveState('saved');
      } catch (e) {
        setError(`Loading liste non chargée (${(e as Error).message}) : les réponses ne seront pas enregistrées.`);
        setSaveState('local');
      }
      loaded.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  const canEdit = EDITORS.includes(me?.role ?? '');
  const catalogue = useMemo(() => mergeCatalogue(SEED_CATALOGUE, catRows), [catRows]);
  const catMap = useMemo(() => new Map(catalogue.map((c) => [c.ref, c])), [catalogue]);
  const topology = useMemo(
    () => buildTopology({ index: scene.index, frames: scene.frames, catalogue: catMap, answers, memory, overrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, framesVersion, catMap, answers, memory, overrides],
  );
  const summary = useMemo(() => topologySummary(topology, catMap), [topology, catMap]);

  const lastSaved = useRef('');
  useEffect(() => {
    if (!loaded.current || !listId) return;
    const body = { overrides, answers: { products: answers }, topology };
    const key = JSON.stringify(body);
    // première ouverture : rien n'a changé depuis l'enregistrement → pas d'envoi
    if (!lastSaved.current) {
      lastSaved.current = key;
      if (savedKey.current === JSON.stringify({ overrides, products: answers })) return;
    }
    if (key === lastSaved.current && saveState === 'saved') return;
    lastSaved.current = key;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await vem.saveLoadingList(listId, body);
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        setError(`Loading liste non enregistrée : ${(e as Error).message}`);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [overrides, answers, topology, listId]);

  // ─── 3D ───
  const holder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const moduleNode = useMemo(() => new Map(scene.index.modules.map((m) => [m.id, m.nodeId])), [scene]);
  const pickRef = useRef<(nodeId: string | null) => void>(() => {});
  const barPickRef = useRef<(i: number | null) => void>(() => {});
  useEffect(() => {
    if (!holder.current) return;
    const v = new SceneViewer(holder.current, scene, glassTest);
    viewerRef.current = v;
    v.onPick((p) => pickRef.current(p?.nodeId ?? null));
    v.onBarPick((i) => barPickRef.current(i));
    return () => {
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  const highlight = useMemo(() => new Set(selected?.ids ?? []), [selected]);
  const overlay = useMemo(() => topologyOverlay(topology, highlight, { junctions: step === 'topology', feet: step === 'topology' }), [topology, highlight, step]);
  const highlightNodes = useMemo(() => {
    const out: string[] = [];
    for (const id of highlight) {
      if (moduleNode.has(id)) out.push(moduleNode.get(id)!);
      else if (id.includes('|')) out.push(...id.split('|'));
      else if (id.includes(':début') || id.includes(':fin')) out.push(id.split(':')[0]);
      else if (scene.look.byId.has(id)) out.push(id);
    }
    return out;
  }, [highlight, moduleNode, scene]);
  const unknownColors = useMemo(() => new Map(topology.unknown.flatMap((u) => u.nodeIds.map((n) => [n, UNKNOWN_COLOR] as const))), [topology]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.setColorOverlay(nodeColors(topology, moduleNode, highlightNodes, step === 'topology', step === 'products' ? unknownColors : undefined));
    v.setBarOverlay(overlay.positions, overlay.colors, 4);
  }, [overlay, topology, moduleNode, highlightNodes, step, unknownColors]);
  useEffect(() => {
    if (!active) return;
    viewerRef.current?.reclaim();
    viewerRef.current?.setColorOverlay(nodeColors(topology, moduleNode, highlightNodes, step === 'topology', step === 'products' ? unknownColors : undefined));
    viewerRef.current?.setBarOverlay(overlay.positions, overlay.colors, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  barPickRef.current = (i) => {
    if (i === null) return;
    const id = overlay.ids[i];
    const j = topology.junctions.find((x) => x.id === id);
    const f = topology.feet.find((x) => x.id === id);
    if (j) setSelected({ ids: [j.id, ...j.modules], label: `${j.id} : jonction ${j.kind === 'grand_cote' ? 'grand côté' : j.kind === 'petit_cote' ? 'petit côté' : 'grand / petit côté'} entre ${j.modules.join(' et ')}${j.offset ? ' (décalée)' : ''}${j.roof ? ', toits jointifs' : ''}` });
    else if (f) setSelected({ ids: [f.id], label: `${f.id} : pied ${f.kind === 'angle' ? 'd’angle' : f.kind === 'milieu' ? 'de milieu' : 'commun'} de ${[...new Set(f.members.map((m) => m.moduleId))].join(', ')}` });
  };
  const [focusUnknown, setFocusUnknown] = useState<string | null>(null);
  pickRef.current = (nodeId) => {
    if (!nodeId) {
      setSelected(null);
      return;
    }
    // pièce cliquée : sa ligne de produit (ou son groupe « À identifier »)
    let item: string | undefined;
    for (let n = scene.look.byId.get(nodeId); n; n = n.parentId ? scene.look.byId.get(n.parentId) : undefined) if (n.role === 'item') item = n.id;
    const u = item ? topology.unknown.find((x) => x.nodeIds.includes(item!)) : undefined;
    const line = item ? topology.products.find((l) => l.nodeIds.includes(item!) || l.mirrorIds.includes(item!)) : undefined;
    if (u) {
      setStep('products');
      setFocusUnknown(u.signature);
      setSelected({ ids: u.nodeIds, label: `À identifier : ${u.label}` });
    } else if (line) setSelected({ ids: line.nodeIds, label: `${line.article} ${catMap.get(line.article)?.designation ?? ''} × ${line.qty}` });
    else {
      const m = scene.index.modules.find((x) => x.nodeId === nodeIdOf(scene.objectsById.get(nodeId) ?? null) || x.nodeId === nodeId);
      setSelected(m ? { ids: [m.id], label: m.id } : null);
    }
  };

  const unknownCount = topology.unknown.reduce((s, u) => s + u.nodeIds.length, 0);
  const stepState: Record<Step, StepState> = {
    topology: topology.counts.pied?.value === null || topology.warnings.some((w) => w.code.startsWith('JUNCTION')) ? 'warn' : 'ok',
    products: unknownCount ? 'warn' : 'ok',
    questions: 'todo',
    list: 'todo',
    export: 'todo',
  };
  const STEPS: { key: Step; label: string; soon?: string }[] = [
    { key: 'topology', label: '1. Topologie' },
    { key: 'products', label: '2. Produits' },
    { key: 'questions', label: '3. Questions chantier', soon: 'L4' },
    { key: 'list', label: '4. Loading liste', soon: 'L3–L4' },
    { key: 'export', label: '5. Export', soon: 'L4' },
  ];
  const saveLabel = { idle: '', saving: 'Enregistrement…', saved: '✓ Enregistrée', error: '✗ Non enregistrée', local: 'Non enregistrée (modèle sans version en ligne)' }[saveState];

  const answer = (signature: string, value: string | null) =>
    setAnswers((a) => {
      const next = { ...a };
      if (value) next[signature] = value;
      else delete next[signature];
      return next;
    });
  const remember = async (signature: string, article: string) => {
    const u = topology.unknown.find((x) => x.signature === signature);
    const n = u ? scene.look.byId.get(u.nodeIds[0]) : undefined;
    try {
      await vem.saveLoadingMatch({ signature, article, keyDefinition: n?.definition ?? null, triangles: n?.triangles });
      await refreshMemory();
      answer(signature, article);
    } catch (e) {
      setError(`Non mémorisé : ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <h2>Loading liste</h2>
          <nav className="tabs" style={{ flexWrap: 'wrap' }}>
            {STEPS.map((s) => (
              <button
                key={s.key}
                className={`tab ${step === s.key ? 'active' : ''}`}
                disabled={!!s.soon}
                onClick={() => {
                  setStep(s.key);
                  setSelected(null);
                }}
                title={s.soon ? `Arrive en phase ${s.soon}` : undefined}
              >
                <span style={{ color: STEP_COLOR[stepState[s.key]], marginRight: 4 }}>{STEP_ICON[stepState[s.key]]}</span>
                {s.label}
              </button>
            ))}
          </nav>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="hint">{saveLabel}</span>
        </div>
        {error && (
          <div className="card-body">
            <div className="error-box">
              {error}{' '}
              <button className="btn small" onClick={() => setError('')}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px, 46%) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          {step === 'topology' && (
            <TopologyStep
              topology={topology}
              summary={summary}
              overrides={overrides}
              onOverride={(k, v) =>
                setOverrides((o) => {
                  const next = { ...o };
                  if (v === null) delete next[k];
                  else next[k] = v;
                  return next;
                })
              }
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {step === 'products' && (
            <ProductsStep
              topology={topology}
              catalogue={catalogue}
              catMap={catMap}
              answers={answers}
              memory={memory}
              canEdit={canEdit}
              focus={focusUnknown}
              selected={selected}
              onSelect={setSelected}
              onAnswer={answer}
              onRemember={remember}
            />
          )}
        </div>
        <div className="viewer-main" style={{ position: 'sticky', top: 8, height: 'calc(100vh - 170px)', minHeight: 480 }}>
          <div className="viewer-toolbar">
            <span className="hint" style={{ flex: 1 }}>
              {selected ? (
                <>
                  <span style={{ color: '#db2777' }}>■</span> {selected.label}{' '}
                  <button className="btn small ghost" onClick={() => setSelected(null)}>
                    ✕
                  </button>
                </>
              ) : step === 'topology' ? (
                'Clic sur une ligne, une jonction ou un pied : la 3D montre d’où vient le nombre.'
              ) : (
                'Clic sur une pièce : sa ligne de produit. En orange : pièces à identifier.'
              )}
            </span>
          </div>
          <div className="viewer-canvas" ref={holder} />
        </div>
      </div>
    </div>
  );
}

// ─── Étape 1 : topologie ────────────────────────────────────────────────────────────────────────────────────────

function TopologyStep({
  topology: t,
  summary,
  overrides,
  onOverride,
  selected,
  onSelect,
}: {
  topology: Topology;
  summary: string;
  overrides: TopologyOverrides;
  onOverride: (k: CountingBase, v: number | null) => void;
  selected: { ids: string[]; label: string } | null;
  onSelect: (s: { ids: string[]; label: string } | null) => void;
}) {
  const [edit, setEdit] = useState<{ key: CountingBase; text: string } | null>(null);
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Ce que l’app a compris</h2>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 14, lineHeight: 1.5 }} data-testid="topology-summary">
            {summary}
          </div>
          <TopologyPlan topology={t} selected={selected} onSelect={onSelect} />
          <div className="hint">
            Îlots :{' '}
            {t.islands.map((i, k) => (
              <button key={i.id} className="btn small ghost" onClick={() => onSelect({ ids: i.moduleIds, label: `${i.id} : ${i.moduleIds.join(', ')}` })}>
                <span style={{ color: `#${ISLAND_COLORS[k % ISLAND_COLORS.length].toString(16).padStart(6, '0')}` }}>■</span> {i.id} · {i.moduleIds.length} box ·{' '}
                {i.regime === 'standalone' ? 'seule' : 'connectées'}
                {i.covered ? ' · couvert' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>
      {t.warnings.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>À vérifier ({t.warnings.length})</h2>
          </div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
              {t.warnings.map((w, i) => (
                <li key={i}>
                  {w.ids?.length ? (
                    <button className="btn ghost small" style={{ textAlign: 'left' }} onClick={() => onSelect({ ids: w.ids!, label: w.text })}>
                      {w.text}
                    </button>
                  ) : (
                    w.text
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <h2>Bases de comptage</h2>
          <span className="hint">Corriger une valeur quand la 3D n’est pas conforme : elle est marquée « saisi à la main ».</span>
        </div>
        <div className="card-body">
          <table className="list">
            <tbody>
              {TOPOLOGY_ROWS.map((k) => {
                const c = t.counts[k];
                if (!c) return null;
                const isSel = selected?.label.startsWith(ROW_LABEL[k] ?? k);
                return (
                  <tr key={k} style={{ cursor: c.ids.length ? 'pointer' : 'default', background: isSel ? 'var(--bg-3)' : undefined }}>
                    <td onClick={() => c.ids.length && onSelect({ ids: c.ids, label: `${ROW_LABEL[k] ?? COUNTING_BASE_LABEL[k]} : ${c.detail}` })}>{ROW_LABEL[k] ?? COUNTING_BASE_LABEL[k]}</td>
                    <td style={{ width: 120, textAlign: 'right' }}>
                      {edit?.key === k ? (
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={edit.text}
                          style={{ width: 70 }}
                          onChange={(e) => setEdit({ key: k, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = Number(edit.text);
                              if (edit.text !== '' && Number.isFinite(v) && v >= 0) onOverride(k, v);
                              setEdit(null);
                            }
                            if (e.key === 'Escape') setEdit(null);
                          }}
                          onBlur={() => setEdit(null)}
                        />
                      ) : (
                        <b
                          title="Cliquer pour corriger"
                          style={{ cursor: 'text' }}
                          onClick={() => setEdit({ key: k, text: c.value === null ? '' : String(c.value) })}
                        >
                          {c.value === null ? '?' : c.value}
                        </b>
                      )}
                    </td>
                    <td className="hint" onClick={() => c.ids.length && onSelect({ ids: c.ids, label: `${ROW_LABEL[k] ?? COUNTING_BASE_LABEL[k]} : ${c.detail}` })}>
                      {c.manual ? (
                        <>
                          <span className="badge orange">saisi à la main</span> détecté : {c.detected ?? '?'}{' '}
                          <button className="btn small ghost" title="Revenir à la valeur détectée" onClick={() => onOverride(k, null)}>
                            ↺
                          </button>
                        </>
                      ) : (
                        c.detail
                      )}
                    </td>
                  </tr>
                );
              })}
              {Object.keys(overrides).length > 0 && (
                <tr>
                  <td colSpan={3} className="hint">
                    {Object.keys(overrides).length} valeur(s) saisie(s) à la main.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Schéma de dessus : box (couleur de l'îlot), jonctions (bleu grand côté, vert petit côté, orange décalée), pieds. */
function TopologyPlan({ topology: t, selected, onSelect }: { topology: Topology; selected: { ids: string[] } | null; onSelect: (s: { ids: string[]; label: string }) => void }) {
  const pts = t.modules.flatMap((m) => m.outline);
  if (!pts.length) return <div className="hint">Aucune Viewbox dans ce modèle.</div>;
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minZ = Math.min(...pts.map((p) => p[1]));
  const maxZ = Math.max(...pts.map((p) => p[1]));
  const pad = 600;
  const w = maxX - minX + 2 * pad;
  const h = maxZ - minZ + 2 * pad;
  const sel = new Set(selected?.ids ?? []);
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const islandIndex = new Map(t.islands.map((i, k) => [i.id, k]));
  const tx = (p: [number, number]) => `${p[0] - minX + pad},${p[1] - minZ + pad}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxHeight: 360, background: '#fff', border: '1px solid var(--border)', borderRadius: 6 }} data-testid="topology-plan">
      {[...t.modules]
        .sort((a, b) => a.level - b.level)
        .map((m) => {
          const k = islandIndex.get(m.islandId) ?? 0;
          const c = m.outline.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]) as [number, number];
          return (
            <g key={m.id} style={{ cursor: 'pointer' }} onClick={() => onSelect({ ids: [m.id], label: `${m.id} — ${m.long} × ${m.short} mm, niveau ${m.level}` })}>
              <polygon
                points={m.outline.map(tx).join(' ')}
                fill={hex(ISLAND_COLORS[k % ISLAND_COLORS.length])}
                fillOpacity={m.level > 0 ? 0.45 : 0.8}
                stroke={sel.has(m.id) ? hex(HIGHLIGHT) : '#334155'}
                strokeWidth={sel.has(m.id) ? 60 : 20}
                strokeDasharray={m.level > 0 ? '120 80' : undefined}
              />
              <text x={c[0] - minX + pad} y={c[1] - minZ + pad + m.level * 480} fontSize={360} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" fontFamily="Arimo, Arial, sans-serif">
                {m.id}
                {m.level > 0 ? ` (niv. ${m.level})` : ''}
              </text>
            </g>
          );
        })}
      {t.junctions.map((j) => (
        <line
          key={j.id}
          x1={j.segment[0][0] - minX + pad}
          y1={j.segment[0][1] - minZ + pad}
          x2={j.segment[1][0] - minX + pad}
          y2={j.segment[1][1] - minZ + pad}
          stroke={sel.has(j.id) ? hex(HIGHLIGHT) : j.offset ? '#ea580c' : hex(JUNCTION_COLORS[j.kind])}
          strokeWidth={140}
          style={{ cursor: 'pointer' }}
          onClick={() => onSelect({ ids: [j.id, ...j.modules], label: `${j.id} : jonction ${j.kind === 'grand_cote' ? 'grand côté' : j.kind === 'petit_cote' ? 'petit côté' : 'grand / petit côté'} entre ${j.modules.join(' et ')}` })}
        />
      ))}
      {t.feet.map((f) => (
        <circle
          key={f.id}
          cx={f.plan[0] - minX + pad}
          cy={f.plan[1] - minZ + pad}
          r={sel.has(f.id) ? 170 : 110}
          fill={sel.has(f.id) ? hex(HIGHLIGHT) : '#92400e'}
          style={{ cursor: 'pointer' }}
          onClick={() => onSelect({ ids: [f.id], label: `${f.id} : pied de ${[...new Set(f.members.map((m) => m.moduleId))].join(', ')}` })}
        />
      ))}
    </svg>
  );
}

// ─── Étape 2 : produits ─────────────────────────────────────────────────────────────────────────────────────────

const SOURCE_LABEL = { modele: 'réf. du modèle', reponse: 'identifiée ici', memoire: 'mémoire' } as const;

function ProductsStep({
  topology: t,
  catalogue,
  catMap,
  answers,
  memory,
  canEdit,
  focus,
  selected,
  onSelect,
  onAnswer,
  onRemember,
}: {
  topology: Topology;
  catalogue: CatalogueItem[];
  catMap: Map<string, CatalogueItem>;
  answers: ProductAnswers;
  memory: Record<string, string>;
  canEdit: boolean;
  focus: string | null;
  selected: { ids: string[]; label: string } | null;
  onSelect: (s: { ids: string[]; label: string } | null) => void;
  onAnswer: (signature: string, value: string | null) => void;
  onRemember: (signature: string, article: string) => Promise<void>;
}) {
  const total = t.products.reduce((s, l) => s + l.qty, 0);
  // pièces identifiées ici ou par la mémoire : on peut revenir sur la réponse
  const answered = Object.entries(answers).filter(([sig]) => !t.unknown.some((u) => u.signature === sig));
  const sel = new Set(selected?.ids ?? []);
  return (
    <>
      {t.unknown.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>À identifier ({t.unknown.length})</h2>
            <span className="hint">Pièces sans référence, en orange dans la 3D. Une réponse vaut pour toutes les pièces identiques.</span>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {t.unknown.map((u) => (
              <IdentifyCard
                key={u.signature}
                label={u.label}
                count={u.nodeIds.length}
                dims={u.dims}
                category={u.category}
                catalogue={catalogue}
                canEdit={canEdit}
                open={focus === u.signature}
                onShow={() => onSelect({ ids: u.nodeIds, label: `À identifier : ${u.label}` })}
                onAnswer={(a) => onAnswer(u.signature, a)}
                onRemember={(a) => onRemember(u.signature, a)}
              />
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <h2>Produits comptés dans la 3D</h2>
          <span className="hint">
            {t.products.length} références · {total} pièces · une pièce par pose, doublons miroir écartés
          </span>
        </div>
        <div className="card-body">
          <table className="list">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th style={{ textAlign: 'right' }}>Quantité</th>
                <th>Origine</th>
              </tr>
            </thead>
            <tbody>
              {t.products.map((l) => {
                const c = catMap.get(l.article);
                const isSel = l.nodeIds.length > 0 && l.nodeIds.every((id) => sel.has(id));
                return (
                  <tr
                    key={l.article}
                    style={{ cursor: 'pointer', background: isSel ? 'var(--bg-3)' : undefined }}
                    onClick={() => onSelect({ ids: l.nodeIds, label: `${l.article} ${c?.designation ?? ''} × ${l.qty}` })}
                  >
                    <td>
                      <b>{l.article}</b>
                    </td>
                    <td>
                      {c?.designation ?? <span className="badge ko">absente du catalogue</span>}
                      {l.mirrorIds.length > 0 && <span className="hint"> · {l.mirrorIds.length} doublon(s) miroir écarté(s)</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <b>{l.qty}</b>
                    </td>
                    <td className="hint">{SOURCE_LABEL[l.source]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {answered.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Réponses données pour ce chantier</h2>
          </div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {answered.map(([sig, a]) => (
                <li key={sig}>
                  {sig.split('|')[0].replace(/^[a-z]+:/, '')} → {a === 'ignore' ? 'pas un produit' : `${a} ${catMap.get(a)?.designation ?? ''}`}
                  {memory[sig] ? <span className="hint"> (aussi en mémoire)</span> : null}{' '}
                  <button className="btn small ghost" onClick={() => onAnswer(sig, null)}>
                    Annuler
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function IdentifyCard({
  label,
  count,
  dims,
  category,
  catalogue,
  canEdit,
  open: initiallyOpen,
  onShow,
  onAnswer,
  onRemember,
}: {
  label: string;
  count: number;
  dims: [number, number, number];
  category: string | null;
  catalogue: CatalogueItem[];
  canEdit: boolean;
  open: boolean;
  onShow: () => void;
  onAnswer: (article: string) => void;
  onRemember: (article: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => setOpen((o) => o || initiallyOpen), [initiallyOpen]);
  const [q, setQ] = useState('');
  const ref = /^\d-\d{3}-\d{3,5}/.exec(q)?.[0] ?? '';
  const found = ref ? catalogue.find((c) => c.ref === ref) : undefined;
  const matches = q.length >= 2 && !found ? catalogue.filter((c) => `${c.ref} ${c.designation}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, display: 'grid', gap: 6 }}>
      <div className="row" style={{ gap: 8 }}>
        <span style={{ color: '#f97316' }}>■</span>
        <b>{label}</b>
        <span className="hint">
          {count} pièce(s) · {dims.join(' × ')} mm{category ? ` · ${category}` : ''}
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onShow}>
          Voir dans la 3D
        </button>
        <button
          className="btn small"
          onClick={() => {
            setOpen(!open);
            onShow();
          }}
        >
          Qu’est-ce que c’est ?
        </button>
      </div>
      {open && (
        <div style={{ display: 'grid', gap: 6 }}>
          <input type="text" autoFocus placeholder="Référence ou nom (ex. 7-625-020, sliding)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} />
          {matches.map((c) => (
            <button key={c.ref} className="btn small ghost" style={{ textAlign: 'left' }} onClick={() => setQ(`${c.ref} ${c.designation}`)}>
              <b>{c.ref}</b> {c.designation}
            </button>
          ))}
          {found && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span>
                → <b>{found.ref}</b> {found.designation}
              </span>
              <button className="btn small primary" onClick={() => onAnswer(found.ref)}>
                Valider pour ce chantier
              </button>
              <button
                className="btn small"
                disabled={!canEdit}
                title={canEdit ? 'Toutes les pièces identiques des projets suivants seront reconnues' : 'Réservé à un admin ou un responsable technique'}
                onClick={() => void onRemember(found.ref)}
              >
                Mémoriser pour les projets suivants
              </button>
            </div>
          )}
          {ref && !found && <span className="hint">Référence {ref} absente du catalogue : l’ajouter dans Réglages › Règles de loading › Catalogue.</span>}
          <div>
            <button className="btn small ghost" onClick={() => onAnswer('ignore')}>
              Ce n’est pas un produit à charger (décor, contexte…)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

