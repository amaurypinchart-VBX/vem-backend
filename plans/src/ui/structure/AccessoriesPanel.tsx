// Onglet « 🔩 Accessoires » de l'étude structure (phase S11) : décrire une pièce de liaison (clamp, plat boulonné,
// équerre…) par ses composants et son chemin d'effort, l'importer d'un dessin 3D (.dae / .zip SketchUp), en discuter
// avec l'assistant IA (qui propose sans jamais calculer), voir tout de suite ce qu'elle retient (méthode des composants,
// EN 1993-1-8) et les données qui manquent, la comparer aux plats d'empilement d'origine, la mémoriser dans la
// bibliothèque, puis calculer l'étude avec elle (variante « liaison personnalisée »). Prototype = jamais ✅.
import { useMemo, useRef, useState } from 'react';
import type { Object3D } from 'three';
import { Matrix4, Mesh, Vector3 } from 'three';
import type { BoltGrade, JointComponent, JointDesign, JointDirection, PathStep, StepMode } from '../../structure/core/jointDesign';
import { DIRECTION_LABEL, JOINT_TEMPLATES, MODE_KIND, MODE_LABEL, QUALIFICATION_LABEL, designFromTemplate, jointKey, jointMass } from '../../structure/core/jointDesign';
import type { DirectionResult } from '../../structure/core/checks/jointDesign';
import { BOLT_AS, computeJoint } from '../../structure/core/checks/jointDesign';
import type { JointDesignEntry, LibraryEntry } from '../../structure/core/library';
import type { PartRecognition } from '../../structure/core/jointRecognition';
import { plateText, recognizePart } from '../../structure/core/jointRecognition';
import { readSourceBundle } from '../../ingest/unzip';
import { loadDae } from '../../ingest/loadModel';
import { fmtNumber } from '../../structure/core/units';
import type { StudyRun } from '../../structure/studyRun';
import type { AiState } from './aiUi';
import { vem } from '../../api/vem';
import { PartPreview } from './PartPreview';

const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : fmtNumber(v, d));
const kN = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${f(v / 1e3)} kN`);
const DIRS: JointDirection[] = ['uplift', 'slideLong', 'slideShort', 'compression'];
const STATUS = { recalculated: { label: 'calculé', color: 'var(--ok)' }, indicative: { label: 'indicatif', color: 'var(--warn)' }, unknown: { label: 'incomplet', color: 'var(--danger)' } } as const;
const GRADES = ['', 'S235', 'S275', 'S355'];
const BOLT_GRADES: Array<BoltGrade | ''> = ['', '4.6', '5.6', '8.8', '10.9'];
const BOLT_D = Object.keys(BOLT_AS).map(Number);

/** Triangles d'une scène chargée (mm, repère monde), à plat. */
function sceneTriangles(root: Object3D): Float32Array {
  const out: number[] = [];
  const v = new Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = g.getAttribute('position');
    const mw = new Matrix4().copy(m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw);
      out.push(v.x, v.y, v.z);
    }
  });
  return Float32Array.from(out);
}

interface Props {
  library: LibraryEntry[];
  canEdit: boolean;
  who: string;
  ai: AiState | null;
  studyId: string | null;
  /** Viewbox empilées dans l'étude (la liaison s'applique à leurs angles) */
  stackedCount: number;
  run: StudyRun | null;
  onSave: (e: JointDesignEntry) => Promise<void>;
  /** calcule l'étude avec cette liaison (variante) et ouvre l'onglet Variantes */
  onUseInStudy: (d: JointDesign) => void;
}

export function AccessoriesPanel(p: Props) {
  const saved = useMemo(() => p.library.filter((e): e is JointDesignEntry => e.kind === 'joint_design' && !e.disabled), [p.library]);
  const [design, setDesign] = useState<JointDesign | null>(null);
  const [part, setPart] = useState<{ name: string; positions: Float32Array; rec: PartRecognition } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'user' | 'assistant'; text: string; proposal?: Partial<JointDesign>; questions?: string[] }>>([]);
  const [input, setInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const calc = useMemo(() => (design ? computeJoint(design) : null), [design]);
  const origin = useMemo(() => computeJoint(JOINT_TEMPLATES.find((t) => t.key === 'JD-ORIGINE-PLAT')!), []);

  const set = (fn: (d: JointDesign) => JointDesign) => setDesign((d) => (d ? fn(JSON.parse(JSON.stringify(d)) as JointDesign) : d));
  const setComp = (id: string, patch: Partial<JointComponent>) => set((d) => ({ ...d, components: d.components.map((c) => (c.id === id ? ({ ...c, ...patch } as JointComponent) : c)) }));
  const setStep = (dir: JointDirection, k: number, patch: Partial<PathStep>) => set((d) => ({ ...d, paths: { ...d.paths, [dir]: (d.paths[dir] ?? []).map((s, i) => (i === k ? { ...s, ...patch } : s)) } }));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

  const startFrom = (key: string) => {
    const tpl = JOINT_TEMPLATES.find((t) => t.key === key);
    const lib = saved.find((e) => e.key === key);
    if (lib) setDesign(JSON.parse(JSON.stringify(lib.design)));
    else if (tpl) {
      const name = tpl.key === 'JD-ORIGINE-PLAT' ? tpl.name : `${tpl.name} (${new Date().toLocaleDateString('fr-BE')})`;
      setDesign(designFromTemplate(tpl, jointKey(name), name));
    }
    setChat([]);
  };

  const importDrawing = async (file: File) => {
    setBusy('Lecture du dessin…');
    setError('');
    try {
      const bundle = readSourceBundle(file.name, await file.arrayBuffer());
      if (bundle.format !== 'dae') throw new Error('Format attendu : .dae ou .zip exporté de SketchUp');
      const model = await loadDae(bundle, true);
      const positions = sceneTriangles(model.root);
      model.dispose();
      if (!positions.length) throw new Error('Aucun triangle dans le dessin');
      setPart({ name: file.name, positions, rec: recognizePart(positions) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!design || !calc) return;
    setBusy('Enregistrement…');
    try {
      const entry: JointDesignEntry = {
        kind: 'joint_design',
        key: design.key,
        name: design.name,
        status: calc.status === 'recalculated' && design.qualification !== 'prototype' ? 'known' : 'suggested',
        source: [{ ref: 'user', note: `${p.who}, ${new Date().toLocaleDateString('fr-BE')} — ${QUALIFICATION_LABEL[design.qualification]}` }],
        design: { ...design, source: design.source === 'template' ? 'form' : design.source, history: [...(design.history ?? []), { at: new Date().toISOString(), by: p.who, note: 'mémorisé dans la bibliothèque' }] },
      };
      await p.onSave(entry);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const ask = async () => {
    if (!design || !input.trim()) return;
    const msgs = [...chat, { role: 'user' as const, text: input.trim() }];
    setChat(msgs);
    setInput('');
    setBusy('L’assistant lit la pièce…');
    try {
      const r = await vem.aiJoint({
        studyId: p.studyId,
        messages: msgs.map((m) => ({ role: m.role, text: m.text })),
        design,
        recognition: part ? { plates: part.rec.plates.map((x) => ({ id: x.id, t: x.t, length: x.length, width: x.width, holes: x.holes })), junctions: part.rec.junctions } : null,
        calc: calc ? { status: calc.status, missing: calc.missing, indicative: calc.indicative, capacities: Object.fromEntries(DIRS.map((d) => [d, calc.directions[d].capacity])) } : null,
      });
      setChat([...msgs, { role: 'assistant', text: r.reply, proposal: r.proposal ?? undefined, questions: r.questions }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const applyProposal = (pr: Partial<JointDesign>) =>
    set((d) => ({
      ...d,
      ...(pr.description ? { description: pr.description } : {}),
      ...(pr.function ? { function: pr.function } : {}),
      ...(pr.principle ? { principle: pr.principle } : {}),
      ...(pr.replaces ? { replaces: pr.replaces } : {}),
      ...(pr.perCorner ? { perCorner: pr.perCorner } : {}),
      ...(pr.components?.length ? { components: pr.components } : {}),
      ...(pr.paths ? { paths: pr.paths } : {}),
      ...(pr.stiffness ? { stiffness: { ...d.stiffness, ...pr.stiffness } } : {}),
      source: 'ai',
      history: [...(d.history ?? []), { at: new Date().toISOString(), by: 'assistant IA (proposition validée par ' + p.who + ')', note: 'proposition appliquée' }],
    }));

  const dirCard = (r: DirectionResult, per: number, originPer?: number | null) => (
    <div key={r.direction} style={{ borderLeft: `3px solid ${r.noPath ? 'var(--text-dim)' : r.capacity === null ? 'var(--danger)' : r.indicative.length ? 'var(--warn)' : 'var(--ok)'}`, paddingLeft: 8 }}>
      <div>
        <b>{DIRECTION_LABEL[r.direction]}</b> :{' '}
        {r.noPath ? 'ne retient rien (aucun chemin d’effort)' : r.capacity === null ? 'incomplet' : `${kN(r.capacity)} par pièce · ${kN(r.capacity * per)} par angle`}
        {originPer !== undefined && originPer !== null ? <span className="hint"> (plats d’origine : {kN(originPer)} par angle)</span> : null}
      </div>
      {r.governing && <div className="hint">gouverne : {r.governing.label}</div>}
      {r.steps.map((s, i) => (
        <div key={i} className="hint" style={{ paddingLeft: 8, color: s.value === null ? 'var(--danger)' : undefined }}>
          {s.label} : {s.value === null ? `⛔ ${s.missing.join(' ; ')}` : `${kN(s.value)} — ${s.record?.formula ?? ''} = ${s.record?.withValues ?? ''}`}
          {s.indicative && <span style={{ color: 'var(--warn)' }}> · {s.indicative}</span>}
        </div>
      ))}
    </div>
  );

  // plats d'origine à un angle libre : 3 plats (moitié de 4 + moitié de 2), uplift = TRd, glissement = HRd (un sens)
  const originCorner = (dir: JointDirection) => {
    const c = origin.directions[dir].capacity;
    return c === null ? null : dir === 'uplift' ? 3 * c : dir === 'compression' ? null : 1.5 * c;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2>🔩 Accessoires et liaisons</h2>
          <span className="hint">Remplacer les plats d’empilement par une autre pièce (clamp…) : la décrire, l’importer, la calculer, la comparer, l’enregistrer.</span>
          <div style={{ flex: 1 }} />
          <select value="" onChange={(e) => e.target.value && startFrom(e.target.value)}>
            <option value="">＋ Nouvelle pièce à partir de…</option>
            <optgroup label="Modèles de départ">
              {JOINT_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="Bibliothèque">
                {saved.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {(busy || error) && (
          <div className="card-body">
            {busy && <div className="hint">{busy}</div>}
            {error && <div className="error-box">{error}</div>}
          </div>
        )}
        {!design && (
          <div className="card-body hint">
            Choisis un modèle de départ (« Clamp sous le gousset d’angle + M20 dans la platine de pied » correspond à ta pièce) ou une pièce de la bibliothèque. L’outil dit tout de suite ce qu’il manque pour la calculer.
          </div>
        )}
      </div>

      {design && calc && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(320px, 1fr)', gap: 12, alignItems: 'start' }}>
          {/* ─── description de la pièce ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card">
              <div className="card-head" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input value={design.name} onChange={(e) => set((d) => ({ ...d, name: e.target.value }))} style={{ minWidth: 300, fontWeight: 600 }} />
                <span className="badge" style={{ color: STATUS[calc.status].color }}>
                  {STATUS[calc.status].label}
                </span>
                <span className="badge orange">{QUALIFICATION_LABEL[design.qualification]}</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea rows={3} value={design.description ?? ''} placeholder="Décris la pièce et comment elle travaille (ce qu’elle prend, ce qui la bloque)…" onChange={(e) => set((d) => ({ ...d, description: e.target.value }))} />
                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  {(['antiUplift', 'antiSlide', 'carriesCompression'] as const).map((k) => (
                    <label key={k}>
                      <input type="checkbox" checked={design.function[k]} onChange={(e) => set((d) => ({ ...d, function: { ...d.function, [k]: e.target.checked } }))} />{' '}
                      {k === 'antiUplift' ? 'retient le soulèvement' : k === 'antiSlide' ? 'retient le glissement' : 'reprend la compression'}
                    </label>
                  ))}
                </div>
                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <label>
                    Principe{' '}
                    <select value={design.principle} onChange={(e) => set((d) => ({ ...d, principle: e.target.value as JointDesign['principle'] }))}>
                      <option value="positive">par forme / butée</option>
                      <option value="friction">par serrage / frottement</option>
                      <option value="mixed">les deux</option>
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" checked={design.replaces === 'verticalLink'} onChange={(e) => set((d) => ({ ...d, replaces: e.target.checked ? 'verticalLink' : 'none' }))} /> remplace les plats d’empilement
                  </label>
                  <label>
                    Pièces par angle <input type="number" min={0} step={0.5} style={{ width: 60 }} value={design.perCorner} onChange={(e) => set((d) => ({ ...d, perCorner: Number(e.target.value) }))} />
                  </label>
                  <label>
                    Qualification{' '}
                    <select value={design.qualification} onChange={(e) => set((d) => ({ ...d, qualification: e.target.value as JointDesign['qualification'] }))}>
                      {(['prototype', 'tested', 'certified'] as const).map((q) => (
                        <option key={q} value={q}>
                          {QUALIFICATION_LABEL[q]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <label>
                    Raideur au glissement d’une pièce{' '}
                    <input style={{ width: 70 }} value={design.stiffness.slide === undefined ? '' : String(design.stiffness.slide / 1000).replace('.', ',')} onChange={(e) => set((d) => ({ ...d, stiffness: { ...d.stiffness, slide: num(e.target.value) === undefined ? undefined : num(e.target.value)! * 1000 } }))} /> kN/mm
                  </label>
                  <label>
                    Jeu de montage <input style={{ width: 50 }} value={design.stiffness.play ?? ''} onChange={(e) => set((d) => ({ ...d, stiffness: { ...d.stiffness, play: num(e.target.value) } }))} /> mm
                  </label>
                  <span className="hint">masse ajoutée ≈ {f(jointMass(design), 1)} kg par pièce</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head" style={{ gap: 6, flexWrap: 'wrap' }}>
                <h2>Composants</h2>
                <div style={{ flex: 1 }} />
                {(['plate', 'bolt', 'weld', 'contact'] as const).map((k) => (
                  <button
                    key={k}
                    className="btn small ghost"
                    onClick={() =>
                      set((d) => {
                        const id = `${k[0].toUpperCase()}${d.components.length + 1}`;
                        const label = { plate: 'plaque', bolt: 'boulon', weld: 'soudure', contact: 'surface de contact' }[k];
                        return { ...d, components: [...d.components, { id, kind: k, label } as JointComponent] };
                      })
                    }
                  >
                    ＋ {k === 'plate' ? 'plaque' : k === 'bolt' ? 'boulon' : k === 'weld' ? 'soudure' : 'contact'}
                  </button>
                ))}
              </div>
              <div className="card-body" style={{ overflowX: 'auto' }}>
                <table className="list" style={{ fontSize: 12 }}>
                  <tbody>
                    {design.components.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <b>{c.id}</b>
                        </td>
                        <td>
                          <input value={c.label} onChange={(e) => setComp(c.id, { label: e.target.value })} style={{ width: 200 }} />
                        </td>
                        <td>
                          {c.kind === 'plate' && (
                            <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                              t <input style={{ width: 44 }} value={c.t ?? ''} onChange={(e) => setComp(c.id, { t: num(e.target.value) })} /> b{' '}
                              <input style={{ width: 50 }} value={c.width ?? ''} onChange={(e) => setComp(c.id, { width: num(e.target.value) })} /> L{' '}
                              <input style={{ width: 50 }} value={c.length ?? ''} onChange={(e) => setComp(c.id, { length: num(e.target.value) })} />
                              <select value={c.grade ?? ''} onChange={(e) => setComp(c.id, { grade: e.target.value || undefined })}>
                                {GRADES.map((g) => (
                                  <option key={g} value={g}>
                                    {g || 'nuance ?'}
                                  </option>
                                ))}
                              </select>
                              trou Ø <input style={{ width: 40 }} value={c.hole?.d0 ?? ''} onChange={(e) => setComp(c.id, { hole: { ...c.hole, d0: num(e.target.value) } })} /> e1{' '}
                              <input style={{ width: 40 }} value={c.hole?.e1 ?? ''} onChange={(e) => setComp(c.id, { hole: { ...c.hole, e1: num(e.target.value) } })} /> e2{' '}
                              <input style={{ width: 40 }} value={c.hole?.e2 ?? ''} onChange={(e) => setComp(c.id, { hole: { ...c.hole, e2: num(e.target.value) } })} />
                              <label>
                                <input type="checkbox" checked={!!c.existing} onChange={(e) => setComp(c.id, { existing: e.target.checked })} /> pièce de la Viewbox
                              </label>
                            </span>
                          )}
                          {c.kind === 'bolt' && (
                            <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                              M
                              <select value={c.d ?? ''} onChange={(e) => setComp(c.id, { d: num(e.target.value) })}>
                                <option value="">?</option>
                                {BOLT_D.map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                              <select value={c.grade ?? ''} onChange={(e) => setComp(c.id, { grade: (e.target.value || undefined) as BoltGrade | undefined })}>
                                {BOLT_GRADES.map((g) => (
                                  <option key={g} value={g}>
                                    {g || 'classe ?'}
                                  </option>
                                ))}
                              </select>
                              <label>
                                <input type="checkbox" checked={c.threadInShear !== false} onChange={(e) => setComp(c.id, { threadInShear: e.target.checked })} /> filetage dans le plan de cisaillement
                              </label>
                              <select value={c.preload ?? 'none'} onChange={(e) => setComp(c.id, { preload: e.target.value as 'none' | 'controlled' })}>
                                <option value="none">serrage non spécifié</option>
                                <option value="controlled">précontraint, couple contrôlé</option>
                              </select>
                              taraudage <input style={{ width: 40 }} value={c.tappedLength ?? ''} onChange={(e) => setComp(c.id, { tappedLength: num(e.target.value) })} /> mm
                            </span>
                          )}
                          {c.kind === 'weld' && (
                            <span className="row" style={{ gap: 4 }}>
                              a <input style={{ width: 40 }} value={c.a ?? ''} onChange={(e) => setComp(c.id, { a: num(e.target.value) })} /> mm × L{' '}
                              <input style={{ width: 50 }} value={c.length ?? ''} onChange={(e) => setComp(c.id, { length: num(e.target.value) })} /> mm
                              <select value={c.grade ?? ''} onChange={(e) => setComp(c.id, { grade: e.target.value || undefined })}>
                                {GRADES.map((g) => (
                                  <option key={g} value={g}>
                                    {g || 'nuance (S235)'}
                                  </option>
                                ))}
                              </select>
                            </span>
                          )}
                          {c.kind === 'contact' && (
                            <span className="row" style={{ gap: 4 }}>
                              surface <input style={{ width: 60 }} value={c.area ?? ''} onChange={(e) => setComp(c.id, { area: num(e.target.value) })} /> mm² · μ{' '}
                              <input style={{ width: 44 }} value={c.mu ?? ''} onChange={(e) => setComp(c.id, { mu: num(e.target.value) })} />
                              <select value={c.surface ?? ''} onChange={(e) => setComp(c.id, { surface: e.target.value || undefined })}>
                                <option value="">état ?</option>
                                <option value="brut">brut</option>
                                <option value="peint">peint</option>
                                <option value="galvanisé">galvanisé</option>
                              </select>
                            </span>
                          )}
                        </td>
                        <td>
                          <button className="btn small ghost" title="Retirer" onClick={() => set((d) => ({ ...d, components: d.components.filter((x) => x.id !== c.id) }))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Chemin d’effort (ce qui travaille, dans l’ordre)</h2>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {DIRS.map((dir) => (
                  <div key={dir}>
                    <div className="row" style={{ gap: 6 }}>
                      <b>{DIRECTION_LABEL[dir]}</b>
                      <button className="btn small ghost" onClick={() => set((d) => ({ ...d, paths: { ...d.paths, [dir]: [...(d.paths[dir] ?? []), { component: d.components[0]?.id ?? '', mode: 'bolt-shear' as StepMode }] } }))}>
                        ＋ maillon
                      </button>
                    </div>
                    {(design.paths[dir] ?? []).map((s, k) => {
                      const comp = design.components.find((c) => c.id === s.component);
                      const modes = (Object.keys(MODE_LABEL) as StepMode[]).filter((m) => !comp || MODE_KIND[m] === comp.kind);
                      return (
                        <div key={k} className="row" style={{ gap: 4, flexWrap: 'wrap', paddingLeft: 10, fontSize: 12 }}>
                          <select value={s.component} onChange={(e) => setStep(dir, k, { component: e.target.value })}>
                            {design.components.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.id} {c.label}
                              </option>
                            ))}
                          </select>
                          <select value={s.mode} onChange={(e) => setStep(dir, k, { mode: e.target.value as StepMode })}>
                            {modes.map((m) => (
                              <option key={m} value={m}>
                                {MODE_LABEL[m]}
                              </option>
                            ))}
                          </select>
                          {s.mode === 'plate-bearing' && (
                            <select value={s.bolt ?? ''} onChange={(e) => setStep(dir, k, { bolt: e.target.value || undefined })}>
                              <option value="">boulon ?</option>
                              {design.components.filter((c) => c.kind === 'bolt').map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.id} {c.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {s.mode === 'bolt-punching' && (
                            <select value={s.plate ?? ''} onChange={(e) => setStep(dir, k, { plate: e.target.value || undefined })}>
                              <option value="">plaque sous la tête ?</option>
                              {design.components.filter((c) => c.kind === 'plate').map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.id} {c.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {(s.mode === 'plate-bending' || s.mode === 'plate-hinges') && (
                            <>
                              bras <input style={{ width: 50 }} value={s.lever ?? ''} onChange={(e) => setStep(dir, k, { lever: num(e.target.value) })} /> mm
                            </>
                          )}
                          {s.mode === 'friction' && (
                            <>
                              plans <input style={{ width: 36 }} value={s.planes ?? 1} onChange={(e) => setStep(dir, k, { planes: num(e.target.value) })} />
                            </>
                          )}
                          × <input style={{ width: 36 }} value={s.count ?? 1} onChange={(e) => setStep(dir, k, { count: num(e.target.value) })} />
                          <button className="btn small ghost" onClick={() => set((d) => ({ ...d, paths: { ...d.paths, [dir]: (d.paths[dir] ?? []).filter((_, i) => i !== k) } }))}>
                            ✕
                          </button>
                        </div>
                      );
                    })}
                    {!(design.paths[dir] ?? []).length && <div className="hint" style={{ paddingLeft: 10 }}>aucun maillon : la pièce ne retient rien dans cette direction</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-head" style={{ gap: 8 }}>
                <h2>📐 Dessin 3D de la pièce</h2>
                <div style={{ flex: 1 }} />
                <input ref={fileRef} type="file" accept=".dae,.zip" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && void importDrawing(e.target.files[0])} />
                <button className="btn small" onClick={() => fileRef.current?.click()}>
                  Importer (.dae ou .zip SketchUp)
                </button>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!part ? (
                  <div className="hint">Exporte la pièce seule depuis SketchUp (Fichier › Exporter › Modèle 3D › .dae) : l’outil retrouve les plaques (épaisseur, dimensions), les trous (Ø, pinces), les plis et les jonctions à souder.</div>
                ) : (
                  <>
                    <PartPreview positions={part.positions} />
                    <div className="hint">
                      {part.name} — boîte {part.rec.size.map((x) => f(x, 0)).join(' × ')} mm
                    </div>
                    {part.rec.plates.map((pl) => (
                      <div key={pl.id} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <span className="badge orange">proposé</span> {pl.id} : {plateText(pl)}
                        <select
                          value=""
                          onChange={(e) => {
                            const target = e.target.value;
                            if (!target) return;
                            const h = pl.holes[0];
                            const patch = { t: pl.t, width: pl.width, length: pl.length, ...(h ? { hole: { d0: h.d, e1: Math.max(...h.edge), e2: Math.min(...h.edge) } } : {}) };
                            if (target === '+') set((d) => ({ ...d, components: [...d.components, { id: `P${d.components.length + 1}`, kind: 'plate', label: `plaque ${pl.id} (dessin)`, ...patch }] }));
                            else setComp(target, patch);
                          }}
                        >
                          <option value="">utiliser pour…</option>
                          {design.components.filter((c) => c.kind === 'plate').map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.id} {c.label}
                            </option>
                          ))}
                          <option value="+">une nouvelle plaque</option>
                        </select>
                      </div>
                    ))}
                    {part.rec.junctions.map((j, i) => (
                      <div key={i} className="hint">
                        {j.a} – {j.b} : {j.kind === 'bend' ? 'pli' : 'jonction à souder (a × L à renseigner)'}, {j.angle}°, ≈ {f(j.length, 0)} mm
                      </div>
                    ))}
                    {part.rec.notes.map((n, i) => (
                      <div key={i} className="hint" style={{ color: 'var(--warn)' }}>
                        {n}
                      </div>
                    ))}
                    <div className="hint">À renseigner (la géométrie ne le dit pas) : {part.rec.questions.join(' ; ')}.</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ─── résultat, comparaison, assistant ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card">
              <div className="card-head">
                <h2>Ce que la pièce retient</h2>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DIRS.filter((d) => d !== 'compression' || design.function.carriesCompression || (design.paths.compression ?? []).length).map((d) => dirCard(calc.directions[d], design.perCorner, originCorner(d)))}
                {calc.missing.length > 0 && (
                  <div className="error-box">
                    ⛔ Incomplet — à renseigner :
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {calc.missing.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {calc.indicative.map((m, i) => (
                  <div key={i} className="hint" style={{ color: 'var(--warn)' }}>
                    ⚠ {m}
                  </div>
                ))}
                {design.qualification === 'prototype' && <div className="hint" style={{ color: 'var(--warn)' }}>⚠ Prototype non qualifié : calcul analytique seulement, essai de qualification recommandé (glissement, arrachement) — jamais ✅ dans l’étude.</div>}
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn small primary" disabled={!p.stackedCount || !!busy} onClick={() => p.onUseInStudy(design)} title={p.stackedCount ? '' : 'Aucune Viewbox empilée dans ce modèle'}>
                    Calculer l’étude avec cette pièce
                  </button>
                  {p.canEdit && (
                    <button className="btn small" disabled={!!busy || design.key === 'JD-ORIGINE-PLAT'} onClick={() => void save()}>
                      Mémoriser dans la bibliothèque
                    </button>
                  )}
                </div>
                <div className="hint">
                  {p.stackedCount ? `Crée une variante où la pièce remplace${design.replaces === 'verticalLink' ? '' : ' (complète)'} les plats d’empilement de ${p.stackedCount} Viewbox empilée(s), calculée et comparée à l’étude dans l’onglet Variantes.` : 'Aucune Viewbox empilée dans ce modèle : la pièce peut être décrite et mémorisée, mais pas encore calculée dans une étude.'}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>💬 Assistant</h2>
                <span className="badge orange">propose, ne calcule pas</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!p.ai?.enabled && <div className="hint">{p.ai === null ? 'Connexion à l’IA…' : 'IA non configurée sur le serveur : décris la pièce dans le formulaire.'}</div>}
                {chat.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '95%', background: m.role === 'user' ? 'var(--bg-4)' : 'var(--bg-3)', borderRadius: 8, padding: '6px 10px', whiteSpace: 'pre-wrap' }}>
                    {m.text}
                    {m.questions?.length ? (
                      <ul className="hint" style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {m.questions.map((q, k) => (
                          <li key={k}>{q}</li>
                        ))}
                      </ul>
                    ) : null}
                    {m.proposal && (
                      <div style={{ marginTop: 4 }}>
                        <button className="btn small" onClick={() => applyProposal(m.proposal!)}>
                          Appliquer la proposition (à vérifier)
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <textarea
                  rows={3}
                  disabled={!p.ai?.enabled || !!busy}
                  value={input}
                  placeholder="Ex. « La pièce passe sous le gousset trapèze, remonte de sa hauteur, un M20 vient de la platine de pied du dessus. Comment tu la calcules ? »"
                  onChange={(e) => setInput(e.target.value)}
                />
                <button className="btn small primary" disabled={!p.ai?.enabled || !!busy || !input.trim()} onClick={() => void ask()}>
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
