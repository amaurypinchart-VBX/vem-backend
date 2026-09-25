// Inspecteur de modèle : la boussole pour corriger le fichier SketchUp (§5.5 du cahier des charges).
import { useMemo, useState } from 'react';
import type { NodeInfo, SceneIndex, Warning } from '../core/types';
import { bboxDims, buildTextReport, displayName, fmtBytes, fmtInt } from '../core/report';
import type { ModelVersion } from '../api/vem';
import { CategoryChip, downloadText } from './common';

export type SaveState = 'idle' | 'saving' | 'packaging' | 'saved' | 'packaged' | 'error';

interface Props {
  index: SceneIndex;
  model?: ModelVersion;
  saveState: SaveState;
  saveMessage?: string;
  onBack: () => void;
  /** affiché dans l'espace de travail : le bouton retour et le nom du fichier y sont déjà */
  embedded?: boolean;
  onReloadPackage?: () => void;
  reloadMessage?: string;
  reloading?: boolean;
}

const SEV_LABEL: Record<Warning['severity'], string> = { blocking: 'BLOQUANT', warning: 'ATTENTION', info: 'INFO' };
const SOURCE_LABEL: Record<string, string> = {
  manifest: 'choisi dans SketchUp (manifest)',
  name: "nom d'instance",
  definition: 'nom de définition',
  article: 'référence article',
  material: 'matériau (vitre)',
  inherited: 'hérité du parent',
};

function baseFileName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
}

export function Inspector(props: Props) {
  const { index } = props;
  const [tab, setTab] = useState<'modules' | 'tree' | 'unclassified'>('modules');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warningIdx, setWarningIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const byId = useMemo(() => new Map(index.nodes.map((n) => [n.id, n])), [index]);
  const children = useMemo(() => {
    const m = new Map<string | null, NodeInfo[]>();
    for (const n of index.nodes) {
      const l = m.get(n.parentId) ?? [];
      l.push(n);
      m.set(n.parentId, l);
    }
    return m;
  }, [index]);
  const unclassified = useMemo(() => index.nodes.filter((n) => n.role === 'item' && !n.category), [index]);
  const highlight = useMemo(() => new Set(warningIdx !== null ? (index.warnings[warningIdx]?.nodeIds ?? []) : []), [warningIdx, index]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectNode = (id: string) => {
    setSelectedId(id);
    // déplie les ancêtres pour l'arbre complet
    setExpanded((s) => {
      const n = new Set(s);
      for (let p = byId.get(id)?.parentId ?? null; p; p = byId.get(p)?.parentId ?? null) n.add(p);
      return n;
    });
  };

  const st = index.stats;
  const nBlocking = index.warnings.filter((w) => w.severity === 'blocking').length;
  const nWarn = index.warnings.filter((w) => w.severity === 'warning').length;
  const selected = selectedId ? byId.get(selectedId) : undefined;

  const row = (n: NodeInfo, depth: number, expandable = false, showModule = false) => (
    <div
      key={n.id}
      className={`tree-row${selectedId === n.id ? ' selected' : ''}${highlight.has(n.id) ? ' highlight' : ''}`}
      style={{ paddingLeft: 6 + depth * 16 }}
      onClick={() => setSelectedId(n.id)}
    >
      <span
        className="tw"
        onClick={(e) => {
          if (!expandable) return;
          e.stopPropagation();
          toggle(n.id);
        }}
      >
        {expandable ? (expanded.has(n.id) ? '▾' : '▸') : ''}
      </span>
      <span className="nm">
        {displayName(n)}
        {n.definition && n.definition !== displayName(n) && <em>{n.definition}</em>}
        {n.assignment === 'spatial' && <em>· rattaché par sa position</em>}
      </span>
      {n.articleRef && <span className="badge">{n.articleRef}</span>}
      {showModule && n.moduleId && <span className="badge">{n.moduleId}</span>}
      {n.role === 'context' ? <span className="badge">contexte</span> : n.role !== 'wrapper' && n.role !== 'module' && <CategoryChip category={n.category} />}
      <span className="meta">{bboxDims(n)}</span>
    </div>
  );

  const renderTree = (parentId: string | null, depth: number): React.ReactNode =>
    (children.get(parentId) ?? []).map((n) => {
      const kids = children.get(n.id);
      const open = expanded.has(n.id);
      return (
        <div key={n.id}>
          {row(n, depth, !!kids?.length, true)}
          {open && kids && renderTree(n.id, depth + 1)}
        </div>
      );
    });

  return (
    <div className="page">
      <div className="row">
        {!props.embedded && (
          <>
            <button className="btn" onClick={props.onBack}>
              ← Retour
            </button>
            <h1 style={{ fontSize: 16 }}>{index.source.fileName}</h1>
          </>
        )}
        <span className="badge">
          {index.source.unitName || '?'} · {index.source.upAxis}
        </span>
        <span className={`badge ${index.source.hasManifest ? 'ok' : ''}`}>manifest {index.source.hasManifest ? 'oui' : 'non'}</span>
        <span className="badge">analysé en {(st.durationMs / 1000).toFixed(1)} s</span>
        <div className="spacer" />
        <button className="btn" onClick={() => downloadText(`rapport_${baseFileName(index.source.fileName)}.txt`, buildTextReport(index))}>
          📄 Exporter le rapport
        </button>
        <button
          className="btn"
          onClick={() => downloadText(`index_${baseFileName(index.source.fileName)}.json`, JSON.stringify(index, null, 1), 'application/json')}
        >
          {'{ }'} Index JSON
        </button>
      </div>

      <SaveBanner {...props} />

      <div className="stats">
        <div className={`stat ${st.modules === 0 ? 'bad' : ''}`}>
          <div className="v">{st.modules}</div>
          <div className="l">Viewbox détectées</div>
        </div>
        <div className="stat">
          <div className="v">{st.levels}</div>
          <div className="l">niveau(x)</div>
        </div>
        <div className="stat">
          <div className="v">{fmtInt(st.items)}</div>
          <div className="l">objets (accessoires, structure…)</div>
        </div>
        <div className={`stat ${st.unclassified ? 'warn' : ''}`}>
          <div className="v">{fmtInt(st.unclassified)}</div>
          <div className="l">non classé(s)</div>
        </div>
        <div className="stat">
          <div className="v">{fmtInt(st.triangles)}</div>
          <div className="l">triangles</div>
        </div>
        <div className={`stat ${nBlocking ? 'bad' : nWarn ? 'warn' : ''}`}>
          <div className="v">
            {nBlocking} / {nWarn}
          </div>
          <div className="l">bloquant(s) / avertissement(s)</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Avertissements ({index.warnings.length})</h2>
          <span className="hint">Clique un avertissement pour repérer les objets concernés.</span>
        </div>
        <div className="card-body warnings">
          {!index.warnings.length && <div className="hint">Aucun avertissement : le fichier est conforme.</div>}
          {index.warnings.map((w, i) => (
            <div
              key={i}
              className={`warning ${w.severity}${w.nodeIds?.length ? ' clickable' : ''}${warningIdx === i ? ' selected' : ''}`}
              onClick={() => w.nodeIds?.length && setWarningIdx(warningIdx === i ? null : i)}
            >
              <span className="sev">{SEV_LABEL[w.severity]}</span>
              <span className="msg">{w.message}</span>
              {w.nodeIds?.length ? <span className="badge">{w.nodeIds.length} objet(s)</span> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="inspector">
        <div className="card">
          <div className="card-head">
            <div className="tabs">
              <button className={`tab ${tab === 'modules' ? 'active' : ''}`} onClick={() => setTab('modules')}>
                Par Viewbox
              </button>
              <button className={`tab ${tab === 'unclassified' ? 'active' : ''}`} onClick={() => setTab('unclassified')}>
                Non classés ({unclassified.length})
              </button>
              <button className={`tab ${tab === 'tree' ? 'active' : ''}`} onClick={() => setTab('tree')}>
                Arbre complet ({fmtInt(index.nodes.length)})
              </button>
            </div>
            <div className="spacer" />
            <span className="hint">Dimensions : largeur × profondeur × hauteur (mm)</span>
          </div>
          <div className="card-body tree">
            {tab === 'modules' && (
              <>
                {index.levels.map((lv) => (
                  <div key={lv.level}>
                    <div className="group-title">
                      Niveau {lv.level} — {lv.label} · {lv.moduleIds.length} Viewbox
                    </div>
                    {lv.moduleIds.map((mid) => {
                      const m = index.modules.find((x) => x.id === mid);
                      if (!m) return null;
                      const node = byId.get(m.nodeId);
                      const open = expanded.has(m.nodeId);
                      return (
                        <div key={mid}>
                          <div
                            className={`tree-row${selectedId === m.nodeId ? ' selected' : ''}${highlight.has(m.nodeId) ? ' highlight' : ''}`}
                            onClick={() => setSelectedId(m.nodeId)}
                          >
                            <span
                              className="tw"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(m.nodeId);
                              }}
                            >
                              {open ? '▾' : '▸'}
                            </span>
                            <span className="nm">
                              <b>{m.id}</b>
                              {node && m.name !== m.id && <em>{m.name}</em>}
                              {m.type && <em>· {m.type}</em>}
                            </span>
                            <span
                              className={`badge ${m.dimsOk ? 'ok' : 'ko'}`}
                              title={`Attendu ${m.expected.long} × ${m.expected.short} mm (${m.expected.source === 'nominal' ? 'dimensions nominales saisies dans SketchUp' : 'taille standard ' + m.expected.label})`}
                            >
                              {fmtInt(m.planDimsMm[0])} × {fmtInt(m.planDimsMm[1])} mm {m.dimsOk ? '✓' : '✗'}
                            </span>
                            <span className="meta">h {fmtInt(m.heightMm)} · {m.itemIds.length} objets</span>
                          </div>
                          {open &&
                            m.itemIds.map((id) => {
                              const n = byId.get(id);
                              return n ? row(n, 1) : null;
                            })}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="group-title">Éléments communs · {index.commonIds.length}</div>
                {!index.commonIds.length && <div className="hint" style={{ padding: '0 6px' }}>Aucun.</div>}
                {index.commonIds.map((id) => {
                  const n = byId.get(id);
                  return n ? row(n, 0) : null;
                })}
                <div className="group-title">Contexte ignoré (CTX_) · {index.contextIds.length}</div>
                {index.contextIds.map((id) => {
                  const n = byId.get(id);
                  return n ? row(n, 0) : null;
                })}
              </>
            )}
            {tab === 'unclassified' && (
              <>
                {!unclassified.length && <div className="hint">Tous les objets sont classés.</div>}
                {unclassified.map((n) => (
                  row(n, 0, false, true)
                ))}
              </>
            )}
            {tab === 'tree' && renderTree(null, 0)}
          </div>
        </div>

        <div className="sticky" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {warningIdx !== null && highlight.size > 0 && (
            <div className="card">
              <div className="card-head">
                <h2>Objets concernés ({highlight.size})</h2>
              </div>
              <div className="card-body tree" style={{ maxHeight: 300, overflow: 'auto' }}>
                {[...highlight].map((id) => {
                  const n = byId.get(id);
                  return n ? (
                    <div key={id} className={`tree-row${selectedId === id ? ' selected' : ''}`} onClick={() => selectNode(id)}>
                      <span className="nm">{displayName(n)}</span>
                      {n.moduleId && <span className="badge">{n.moduleId}</span>}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
          <div className="card detail">
            <div className="card-head">
              <h2>Détail</h2>
            </div>
            <div className="card-body">
              {!selected && <div className="hint">Sélectionne un objet pour voir sa fiche.</div>}
              {selected && <NodeDetail n={selected} byId={byId} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NodeDetail({ n, byId }: { n: NodeInfo; byId: Map<string, NodeInfo> }) {
  const path: string[] = [];
  for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) path.unshift(displayName(p));
  return (
    <dl>
      {n.label && (
        <>
          <dt>Désignation</dt>
          <dd>
            <b>{n.label}</b>
          </dd>
        </>
      )}
      <dt>Nom</dt>
      <dd>
        {n.sourceName || n.name || '(sans nom)'}
        {n.sourceName && n.sourceName !== n.name && <span className="hint"> · dans le .dae : {n.name}</span>}
      </dd>
      {n.definition && (
        <>
          <dt>Définition</dt>
          <dd>{n.definition}</dd>
        </>
      )}
      <dt>Chemin</dt>
      <dd>{path.join(' › ') || '(racine)'}</dd>
      <dt>Catégorie</dt>
      <dd>
        <CategoryChip category={n.category} />
        {n.categorySource && <span className="hint"> · {SOURCE_LABEL[n.categorySource]}</span>}
      </dd>
      <dt>Rôle</dt>
      <dd>{n.role}</dd>
      <dt>Viewbox</dt>
      <dd>
        {n.moduleId ?? '—'}
        {n.assignment === 'spatial' && <span className="hint"> · rattaché par sa position</span>}
        {n.assignment === 'common' && <span className="hint"> · élément commun</span>}
      </dd>
      <dt>Niveau</dt>
      <dd>{n.level ?? '—'}</dd>
      <dt>Dimensions</dt>
      <dd>{bboxDims(n)} mm</dd>
      <dt>Triangles</dt>
      <dd>{fmtInt(n.triangles)}</dd>
      {n.articleRef && (
        <>
          <dt>Réf. article</dt>
          <dd>{n.articleRef}</dd>
        </>
      )}
      {n.materialNames && (
        <>
          <dt>Matériaux</dt>
          <dd>{n.materialNames.join(', ')}</dd>
        </>
      )}
      <dt>Identifiant</dt>
      <dd className="hint">{n.id}</dd>
    </dl>
  );
}

function SaveBanner(props: Props) {
  const { saveState, model } = props;
  let text = '';
  let cls = 'hint';
  if (saveState === 'saving') text = '⏳ Enregistrement de l’analyse dans VEM…';
  else if (saveState === 'packaging') text = '⏳ Création et envoi du paquet 3D (GLB)…';
  else if (saveState === 'saved') text = '✓ Analyse enregistrée dans VEM (sans paquet 3D).';
  else if (saveState === 'packaged') text = `✓ Analyse et paquet 3D enregistrés dans VEM (${fmtBytes(model?.glbSize)}).`;
  else if (saveState === 'error') {
    text = '✗ Enregistrement impossible.';
    cls = 'error-box';
  }
  if (!text && !props.saveMessage) return null;
  return (
    <div className={cls === 'error-box' ? 'error-box' : 'card'}>
      <div className={cls === 'error-box' ? '' : 'card-body'}>
        <div className="row">
          <span>{text}</span>
          {props.saveMessage && <span className={saveState === 'error' ? '' : 'hint'}>{props.saveMessage}</span>}
          <div className="spacer" />
          {props.onReloadPackage && model?.glbUrl && (
            <button className="btn small" disabled={props.reloading} onClick={props.onReloadPackage}>
              {props.reloading ? '⏳ Rechargement…' : '⟳ Recharger le paquet 3D (chrono)'}
            </button>
          )}
        </div>
        {props.reloadMessage && <div style={{ marginTop: 6 }}>{props.reloadMessage}</div>}
      </div>
    </div>
  );
}
