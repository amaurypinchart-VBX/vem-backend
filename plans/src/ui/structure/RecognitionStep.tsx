// Étape « Reconnaissance » : vue 3D colorée par statut (vert connu, orange proposé, rouge inconnu, gris ignoré),
// liste des types de pièces (une réponse vaut pour toutes les instances), panneau « Qu'est-ce que c'est ? ».
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import { SceneViewer } from '../../viewer/SceneViewer';
import type { LibraryEntry, ModuleTypeEntry, PartAssignment, PartNature, PartRole, SectionEntry, WeightUnit } from '../../structure/core/library';
import { NATURE_LABEL, NATURES_BY_ROLE, ROLE_LABEL, TEMPLATE_NATURES } from '../../structure/core/library';
import type { PartType, Recognition, RecognitionStatus } from '../../structure/core/recognition';
import { STATUS_COLOR, STATUS_LABEL } from '../../structure/core/recognition';
import { MATERIALS } from '../../structure/core/materials';

export interface AnswerOptions {
  scope: 'model' | 'project';
  memorize: boolean;
}

interface Props {
  scene: LoadedScene;
  glassTest: GlassTest;
  active: boolean;
  recognition: Recognition;
  library: LibraryEntry[];
  canEditLibrary: boolean;
  onAnswer: (t: PartType, a: PartAssignment, opts: AnswerOptions) => Promise<void>;
  onConfirmSuggested: () => Promise<void>;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const STATUS_ORDER: RecognitionStatus[] = ['unknown', 'suggested', 'known', 'ignored'];
const SECTION_TITLE: Record<RecognitionStatus, string> = {
  unknown: 'À renseigner (bloquant)',
  suggested: 'Propositions à confirmer',
  known: 'Connus',
  ignored: 'Ignorés',
};

function StatusBadge({ s }: { s: RecognitionStatus }) {
  return (
    <span className="chip">
      <i style={{ background: hex(STATUS_COLOR[s]) }} />
      {STATUS_LABEL[s]}
    </span>
  );
}

function PartForm({
  type,
  library,
  canEditLibrary,
  onSubmit,
  onClose,
  hasNext,
}: {
  type: PartType;
  library: LibraryEntry[];
  canEditLibrary: boolean;
  onSubmit: (a: PartAssignment, opts: AnswerOptions, next: boolean) => Promise<void>;
  onClose: () => void;
  hasNext: boolean;
}) {
  const initial: PartAssignment = type.assignment ?? (type.kind === 'module' ? { role: 'structural', nature: 'viewbox' } : { role: 'load', nature: 'other' });
  const [a, setA] = useState<PartAssignment>(initial);
  const [scope, setScope] = useState<'model' | 'project'>('model');
  const [memorize, setMemorize] = useState(canEditLibrary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setA(type.assignment ?? (type.kind === 'module' ? { role: 'structural', nature: 'viewbox' } : { role: 'load', nature: 'other' }));
    setError('');
  }, [type]);
  const templates = library.filter((e): e is ModuleTypeEntry => e.kind === 'module_type' && !e.disabled);
  const sections = library.filter((e): e is SectionEntry => e.kind === 'section' && !e.disabled && !e.section.massless);
  const patch = (p: Partial<PartAssignment>) => setA((x) => ({ ...x, ...p }));
  const n = type.sample;
  const fp = type.fingerprint;
  const submit = async (assignment: PartAssignment, next: boolean) => {
    setBusy(true);
    setError('');
    try {
      await onSubmit(assignment, { scope, memorize: memorize && canEditLibrary }, next);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  const structural = a.role === 'structural' && !TEMPLATE_NATURES.has(a.nature);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Qu’est-ce que c’est ?</h2>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <b>{type.label}</b> — {type.nodeIds.length} instance(s) <StatusBadge s={type.status} />
          <div className="hint">{type.reason}</div>
          <div className="hint">
            {n?.definition && <>Définition : {n.definition} · </>}
            {n?.label && <>Désignation : {n.label} · </>}
            {n?.articleRef && <>Article : {n.articleRef} · </>}
            {type.category && <>Catégorie : {type.category} · </>}
            {fp && <>Dimensions : {fp.dims.join(' × ')} mm · </>}
            {type.moduleIds.length > 0 && <>Viewbox : {type.moduleIds.slice(0, 6).join(', ')}{type.moduleIds.length > 6 ? '…' : ''}</>}
          </div>
        </div>
        {type.kind === 'module' ? (
          <label className="row hint">
            Gabarit de calcul
            <select value={a.moduleTemplate ?? ''} style={{ maxWidth: 360 }} onChange={(e) => patch({ role: 'structural', nature: 'viewbox', moduleTemplate: e.target.value || undefined })}>
              <option value="">— choisir —</option>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                  {t.status === 'unknown' ? ' (données inconnues)' : t.status === 'suggested' ? ' (à vérifier)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="row hint">
              Rôle
              <select
                value={a.role}
                style={{ maxWidth: 260 }}
                onChange={(e) => {
                  const role = e.target.value as PartRole;
                  patch({ role, nature: NATURES_BY_ROLE[role].includes(a.nature) ? a.nature : NATURES_BY_ROLE[role][0] });
                }}
              >
                {(Object.keys(ROLE_LABEL) as PartRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              Nature
              <select value={a.nature} style={{ maxWidth: 260 }} onChange={(e) => patch({ nature: e.target.value as PartNature })}>
                {NATURES_BY_ROLE[a.role].map((k) => (
                  <option key={k} value={k}>
                    {NATURE_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {structural && (
              <>
                <label className="row hint">
                  Matériau
                  <select value={a.material ?? ''} style={{ maxWidth: 260 }} onChange={(e) => patch({ material: e.target.value || undefined })}>
                    <option value="">— choisir —</option>
                    {MATERIALS.filter((m) => m.family !== 'massless').map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  Section
                  <select value={a.section ?? ''} style={{ maxWidth: 320 }} onChange={(e) => patch({ section: e.target.value || undefined })}>
                    <option value="">— choisir —</option>
                    {sections.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="row hint">
                  Liaisons
                  <select
                    value={a.connection?.kind ?? ''}
                    style={{ maxWidth: 220 }}
                    onChange={(e) => patch({ connection: e.target.value ? { ...a.connection, kind: e.target.value as NonNullable<PartAssignment['connection']>['kind'] } : undefined })}
                  >
                    <option value="">— à définir —</option>
                    <option value="fixed">encastrées</option>
                    <option value="pinned">articulées</option>
                    <option value="bolted">boulonnées</option>
                    <option value="welded">soudées</option>
                    <option value="contact">contact (compression seule)</option>
                  </select>
                  {a.connection?.kind === 'bolted' && (
                    <>
                      <input
                        type="number"
                        style={{ width: 60 }}
                        min={1}
                        value={a.connection.bolts?.count ?? 2}
                        onChange={(e) => patch({ connection: { kind: 'bolted', bolts: { count: Number(e.target.value), diameter: a.connection?.bolts?.diameter ?? 12, grade: a.connection?.bolts?.grade ?? '8.8' } } })}
                      />
                      × M
                      <input
                        type="number"
                        style={{ width: 60 }}
                        min={6}
                        value={a.connection.bolts?.diameter ?? 12}
                        onChange={(e) => patch({ connection: { kind: 'bolted', bolts: { count: a.connection?.bolts?.count ?? 2, diameter: Number(e.target.value), grade: a.connection?.bolts?.grade ?? '8.8' } } })}
                      />
                      <select
                        value={a.connection.bolts?.grade ?? '8.8'}
                        style={{ width: 80 }}
                        onChange={(e) => patch({ connection: { kind: 'bolted', bolts: { count: a.connection?.bolts?.count ?? 2, diameter: a.connection?.bolts?.diameter ?? 12, grade: e.target.value } } })}
                      >
                        {['4.6', '5.6', '8.8', '10.9'].map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </select>
                    </>
                  )}
                </label>
              </>
            )}
            {a.role !== 'ignored' && (
              <label className="row hint">
                Poids
                <input
                  type="number"
                  style={{ width: 90 }}
                  min={0}
                  value={a.weight?.value ?? ''}
                  onChange={(e) => patch({ weight: e.target.value === '' ? undefined : { value: Number(e.target.value), unit: a.weight?.unit ?? 'kg/m' } })}
                />
                <select value={a.weight?.unit ?? 'kg/m'} style={{ width: 80 }} onChange={(e) => patch({ weight: { value: a.weight?.value ?? 0, unit: e.target.value as WeightUnit } })}>
                  <option>kg/m</option>
                  <option>kg/m²</option>
                  <option>kg</option>
                </select>
                {(a.role === 'load' || a.role === 'wind') && (
                  <>
                    <input type="checkbox" checked={!!a.windClosed} onChange={(e) => patch({ windClosed: e.target.checked })} /> ferme la face au vent
                  </>
                )}
              </label>
            )}
          </>
        )}
        <div className="row hint">
          Appliquer à
          <label className="row">
            <input type="radio" checked={scope === 'model'} onChange={() => setScope('model')} /> toutes les instances de ce modèle
          </label>
          <label className="row">
            <input type="radio" checked={scope === 'project'} onChange={() => setScope('project')} /> tout le projet
          </label>
          <label className="row" title={canEditLibrary ? '' : 'Réservé aux admins, responsables techniques et ingénieurs'}>
            <input type="checkbox" disabled={!canEditLibrary} checked={memorize && canEditLibrary} onChange={(e) => setMemorize(e.target.checked)} /> mémoriser dans la bibliothèque
            (tous les projets)
          </label>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => void submit(a, false)}>
            Valider
          </button>
          {hasNext && (
            <button className="btn primary" disabled={busy} onClick={() => void submit(a, true)}>
              Valider et suivant
            </button>
          )}
          {type.kind === 'item' && (
            <button className="btn" disabled={busy} onClick={() => void submit({ role: 'ignored', nature: 'decor' }, hasNext)}>
              Ignorer (non structurel)
            </button>
          )}
          <button className="btn ghost" disabled title="Arrive avec l’étape IA (S7)">
            🤖 Demander à l’IA
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecognitionStep({ scene, glassTest, active, recognition, library, canEditLibrary, onAnswer, onConfirmSuggested }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typeByNode = useMemo(() => {
    const m = new Map<string, PartType>();
    for (const t of recognition.types) for (const id of t.nodeIds) m.set(id, t);
    const moduleType = new Map<string, PartType>();
    for (const t of recognition.types) if (t.kind === 'module') for (const mid of t.moduleIds) moduleType.set(mid, t);
    for (const [nodeId, moduleId] of recognition.templateParts) {
      const t = moduleType.get(moduleId);
      if (t) m.set(nodeId, t);
    }
    return m;
  }, [recognition]);
  const typeOf = (nodeId: string): PartType | undefined => {
    for (let n = scene.look.byId.get(nodeId); n; n = n.parentId ? scene.look.byId.get(n.parentId) : undefined) {
      const t = typeByNode.get(n.id);
      if (t) return t;
    }
    return undefined;
  };
  const selRef = useRef<(id: string | null) => void>(() => {});
  selRef.current = (nodeId) => {
    const t = nodeId ? typeOf(nodeId) : undefined;
    setSelected(t?.key ?? null);
  };

  useEffect(() => {
    if (!holder.current) return;
    const v = new SceneViewer(holder.current, scene, glassTest);
    viewerRef.current = v;
    v.onPick((p) => {
      v.setSelected(p?.itemId ?? null);
      selRef.current(p?.nodeId ?? null);
    });
    return () => {
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  useEffect(() => {
    viewerRef.current?.setColorOverlay(recognition.colors);
  }, [recognition]);
  useEffect(() => {
    if (!active) return;
    viewerRef.current?.reclaim();
    viewerRef.current?.setColorOverlay(recognition.colors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const type = recognition.types.find((t) => t.key === selected) ?? null;
  // la pièce choisie en avant, le reste en fantôme
  useEffect(() => {
    viewerRef.current?.setVisibility(type ? type.nodeIds : null, [], !!type);
  }, [type]);

  const queue = recognition.types.filter((t) => t.status === 'unknown' || t.status === 'suggested');
  const nextAfter = (key: string) => {
    const rest = queue.filter((t) => t.key !== key);
    return rest.find((t) => t.status === 'unknown') ?? rest[0] ?? null;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(360px, 2fr)', gap: 16, alignItems: 'start' }}>
      <div className="card" style={{ position: 'sticky', top: 0 }}>
        <div className="card-head">
          <h2>Vue 3D — statut des pièces</h2>
          <div className="spacer" style={{ flex: 1 }} />
          {STATUS_ORDER.map((s) => (
            <StatusBadge key={s} s={s} />
          ))}
        </div>
        <div ref={holder} style={{ height: 560, position: 'relative' }} />
        <div className="card-body hint">
          Clic sur une pièce : sa fiche s’ouvre et son type est isolé (le reste en transparence). Les pièces propres aux Viewbox (structure,
          plancher, toiture, pieds : {recognition.templateParts.size}) sont comprises dans le gabarit et prennent la couleur de leur Viewbox.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <b>{recognition.counts.unknown}</b> type(s) à renseigner · <b>{recognition.counts.suggested}</b> proposition(s) à confirmer ·{' '}
              {recognition.counts.known} connu(s) · {recognition.counts.ignored} ignoré(s)
            </div>
            {recognition.blocking > 0 && <div className="hint">Tant qu’il reste un type inconnu, le verdict de l’étude reste « incomplet ».</div>}
            <div className="row">
              {queue.length > 0 && (
                <button className="btn primary small" onClick={() => setSelected((queue.find((t) => t.status === 'unknown') ?? queue[0]).key)}>
                  Traiter la file ({queue.length})
                </button>
              )}
              {recognition.counts.suggested > 0 && (
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(`Confirmer telles quelles les ${recognition.counts.suggested} proposition(s) ?`)) return;
                    setBusy(true);
                    try {
                      await onConfirmSuggested();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Confirmer toutes les propositions
                </button>
              )}
              {type && (
                <button className="btn small ghost" onClick={() => setSelected(null)}>
                  Tout afficher
                </button>
              )}
            </div>
          </div>
        </div>
        {type && (
          <PartForm
            type={type}
            library={library}
            canEditLibrary={canEditLibrary}
            hasNext={!!nextAfter(type.key)}
            onClose={() => setSelected(null)}
            onSubmit={async (a, opts, next) => {
              const following = next ? nextAfter(type.key) : null;
              await onAnswer(type, a, opts);
              setSelected(following?.key ?? null);
            }}
          />
        )}
        {STATUS_ORDER.map((s) => {
          const list = recognition.types.filter((t) => t.status === s);
          if (!list.length) return null;
          return (
            <div className="card" key={s}>
              <div className="card-head">
                <span className="chip">
                  <i style={{ background: hex(STATUS_COLOR[s]) }} />
                  {SECTION_TITLE[s]} ({list.length})
                </span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflow: 'auto' }}>
                {list.map((t) => (
                  <button
                    key={t.key}
                    className="btn ghost"
                    style={{ justifyContent: 'space-between', textAlign: 'left', whiteSpace: 'normal', background: t.key === selected ? 'rgba(59,130,246,.12)' : undefined }}
                    onClick={() => setSelected(t.key)}
                  >
                    <span>
                      <b>
                        {t.nodeIds.length} × {t.label}
                      </b>
                      <span className="hint"> — {t.reason}</span>
                    </span>
                    <span className="hint">{t.kind === 'module' ? 'Viewbox' : t.category ?? 'non classé'}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
