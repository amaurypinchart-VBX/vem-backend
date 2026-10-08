// Étape « Reconnaissance » : vue 3D colorée par statut (vert connu, orange proposé, rouge inconnu, gris ignoré),
// liste des types de pièces (une réponse vaut pour toutes les instances), panneau « Qu'est-ce que c'est ? ».
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import { SceneViewer } from '../../viewer/SceneViewer';
import type { LibraryEntry, ModuleTypeEntry, PartAssignment, PartNature, PartRole, SectionEntry, WeightUnit } from '../../structure/core/library';
import { NATURE_LABEL, NATURES_BY_ROLE, ROLE_LABEL, TEMPLATE_NATURES } from '../../structure/core/library';
import type { PartType, Recognition, RecognitionStatus } from '../../structure/core/recognition';
import { STATUS_COLOR, STATUS_LABEL } from '../../structure/core/recognition';
import { MATERIALS } from '../../structure/core/materials';
import { placeFromFrame } from '../../structure/core/assemble';
import { templateSegments } from '../../structure/core/templateView';
import type { TemplateFamily } from '../../structure/core/templates/viewboxEU';
import type { GroupProposal, IdentifySuggestion } from '../../structure/core/ai';
import { AI_CONFIDENCE_MIN, groupPayload, identifyPayload, suggestionToAssignment } from '../../structure/core/ai';
import type { CompositePanel } from '../../structure/core/composite';
import type { AiUsage } from '../../api/vem';
import { vem } from '../../api/vem';
import type { AiState } from './aiUi';
import { AiUsageNote, CompositeEditor, captureTypeImages } from './aiUi';
import { ViewboxStructure } from './ViewboxStructure';
import { CustomTypeSheet, FrameWorkshop } from './FrameWorkshop';
import { isCustomType } from '../../structure/core/moduleTypes';
import type { FrameExtraction } from '../../structure/core/frameExtract';
import type { FrameProposal } from '../../structure/core/ai';

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
  /** IA (clé configurée sur le serveur) : null = inconnue / indisponible */
  ai?: AiState | null;
  studyId?: string | null;
  /** mémorise un panneau composé dans la bibliothèque */
  onSavePanel?: (p: CompositePanel) => Promise<void>;
  /** enregistre des entrées de bibliothèque (structure d'une Viewbox, sections) puis la recharge */
  onSaveEntries?: (entries: LibraryEntry[]) => Promise<void>;
  /** nom de la personne connectée (trace des modifications de la bibliothèque) */
  who?: string;
  /** structure dessinée relevée par type de module (S12.5) */
  drawnStructures?: ReadonlyMap<string, FrameExtraction>;
  /** panneau de l'analyse IA du modèle (S12.6), en tête de la colonne */
  aiPanel?: ReactNode;
  /** propositions de l'IA pour la structure dessinée (atelier) */
  aiFrame?: FrameProposal | null;
  /** type à ouvrir (demandé par le panneau IA ; n change à chaque demande) */
  openKey?: { key: string; n: number } | null;
  /** change après des captures hors écran : la vue 3D reprend la scène */
  reclaimKey?: number;
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
  ai,
  studyId,
  onAskAi,
  onSavePanel,
  group,
  bodyTemplate,
  who,
  onSaveEntries,
  highlight,
  onHighlight,
  moduleDims,
  onPreviewType,
  extraction,
  aiFrame,
}: {
  type: PartType;
  library: LibraryEntry[];
  canEditLibrary: boolean;
  onSubmit: (a: PartAssignment, opts: AnswerOptions, next: boolean) => Promise<void>;
  onClose: () => void;
  hasNext: boolean;
  ai?: AiState | null;
  studyId?: string | null;
  onAskAi?: () => Promise<{ suggestion: IdentifySuggestion; usage: AiUsage }>;
  onSavePanel?: (p: CompositePanel) => Promise<void>;
  /** groupe proposé par l'IA auquel la réponse s'appliquera */
  group?: GroupProposal | null;
  /** type de Viewbox des modules de cette pièce (pièce = la Viewbox elle-même) */
  bodyTemplate?: ModuleTypeEntry;
  who: string;
  onSaveEntries?: (entries: LibraryEntry[]) => Promise<void>;
  highlight: TemplateFamily | null;
  onHighlight: (f: TemplateFamily | null) => void;
  /** dimensions mesurées du module (atelier structure) */
  moduleDims?: { long: number; short: number; height: number };
  /** aperçu 3D d'un type en cours de description dans l'atelier */
  onPreviewType?: (e: ModuleTypeEntry | null) => void;
  extraction?: FrameExtraction | null;
  aiFrame?: FrameProposal | null;
}) {
  const initial: PartAssignment = type.assignment ?? (type.kind === 'module' ? { role: 'structural', nature: 'viewbox' } : { role: 'load', nature: 'other' });
  const [a, setA] = useState<PartAssignment>(initial);
  const [scope, setScope] = useState<'model' | 'project'>('model');
  const [memorize, setMemorize] = useState(canEditLibrary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<{ suggestion: IdentifySuggestion; usage: AiUsage } | null>(null);
  const [composite, setComposite] = useState(false);
  // atelier structure (S12) : nouveau type, ou type personnalisé à modifier
  const [workshop, setWorkshop] = useState<{ entry?: ModuleTypeEntry } | null>(null);
  useEffect(() => {
    setA(type.assignment ?? (type.kind === 'module' ? { role: 'structural', nature: 'viewbox' } : { role: 'load', nature: 'other' }));
    setError('');
    setAiResult(null);
    setComposite(false);
    setWorkshop(null);
    // une bibliothèque rechargée (type enregistré dans l'atelier) redonne un objet neuf : ne pas effacer la réponse en cours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type.key, JSON.stringify(type.assignment ?? null), type.status]);
  const askAi = async () => {
    if (!onAskAi) return;
    setAiBusy(true);
    setError('');
    try {
      const r = await onAskAi();
      setAiResult(r);
      // sous le seuil de confiance : rien n'est rempli, les questions sont affichées
      if (r.suggestion.confidence >= AI_CONFIDENCE_MIN) setA(suggestionToAssignment(r.suggestion).assignment);
    } catch (e) {
      setError(`IA : ${(e as Error).message}`);
    }
    setAiBusy(false);
  };
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
        {type.source === 'ai' && type.ai && (
          <div className="card" style={{ background: 'var(--bg-2)' }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="row">
                <b>🤖 Proposé par l’analyse IA du modèle</b>
                <span className={`badge ${type.ai.confidence >= AI_CONFIDENCE_MIN ? 'orange' : 'ko'}`}>
                  confiance {Math.round(type.ai.confidence * 100)} % — {type.ai.confidence >= AI_CONFIDENCE_MIN ? 'à vérifier puis valider' : 'trop incertaine : reste inconnue'}
                </span>
              </div>
              {type.ai.questions.map((q, k) => (
                <div key={k} className="hint">
                  ❓ {q}
                </div>
              ))}
            </div>
          </div>
        )}
        {group && (
          <div className="hint" style={{ color: 'var(--accent, #2563eb)' }}>
            Groupe proposé par l’IA « {group.label} » : la réponse s’appliquera aux {group.keys.length} types du groupe. {group.reason}
          </div>
        )}
        {aiResult && (
          <div className="card" style={{ background: 'var(--bg-2)' }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="row">
                <b>Proposition de l’IA</b>
                <span className={`badge ${aiResult.suggestion.confidence >= AI_CONFIDENCE_MIN ? 'orange' : 'ko'}`}>
                  confiance {Math.round(aiResult.suggestion.confidence * 100)} % — {aiResult.suggestion.confidence >= AI_CONFIDENCE_MIN ? 'champs remplis, à vérifier puis valider' : 'trop incertaine : reste inconnue'}
                </span>
                <AiUsageNote usage={aiResult.usage} />
              </div>
              <div className="hint">{aiResult.suggestion.rationale}</div>
              {aiResult.suggestion.questions.map((q, k) => (
                <div key={k} className="hint">
                  ❓ {q}
                </div>
              ))}
              {aiResult.suggestion.confidence < AI_CONFIDENCE_MIN && (
                <div>
                  <button className="btn small ghost" onClick={() => setA(suggestionToAssignment(aiResult.suggestion).assignment)}>
                    Remplir quand même avec la proposition
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {type.kind === 'module' ? (
          <>
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
            {(type.structureWarning || type.structureDiffs?.length) && (
              <div className="card" style={{ background: 'var(--bg-2)' }}>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <b style={{ color: 'var(--warn)' }}>⚠ {type.structureWarning ?? 'La structure dessinée n’est pas celle du type proposé par la taille'}</b>
                  <details>
                    <summary className="hint">Voir les écarts ({type.structureDiffs?.length ?? 0})</summary>
                    {(type.structureDiffs ?? []).map((d, k) => (
                      <div key={k} className="hint">
                        • {d}
                      </div>
                    ))}
                  </details>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn small" onClick={() => setWorkshop({})}>
                      🏗 Créer un type de structure à partir du modèle
                    </button>
                    {templates.find((t) => t.key === 'VIEWBOX-5900-EU') && (
                      <button className="btn small ghost" onClick={() => patch({ role: 'structural', nature: 'viewbox', moduleTemplate: 'VIEWBOX-5900-EU' })}>
                        C’est bien une Viewbox standard (écart de dessin)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {!workshop && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button className="btn small ghost" onClick={() => setWorkshop({})} title="La structure dessinée n’est pas une Viewbox standard : décrire ses profils, assemblages et plancher">
                  🏗 Créer un type de structure (atelier)
                </button>
                <span className="hint">si la structure n’est pas une Viewbox standard (autres profils, traverses seules, autres assemblages…)</span>
              </div>
            )}
            {workshop && (
              <FrameWorkshop
                defaultName={type.label}
                dims={moduleDims ?? { long: 5900, short: 2500, height: 3080 }}
                library={library}
                canEdit={canEditLibrary}
                who={who}
                entry={workshop.entry}
                extraction={extraction}
                aiFrame={aiFrame}
                onSaveEntries={onSaveEntries}
                onUseType={(key) => patch({ role: 'structural', nature: 'viewbox', moduleTemplate: key })}
                onPreview={onPreviewType}
                onClose={() => setWorkshop(null)}
              />
            )}
            {(() => {
              const entry = templates.find((t) => t.key === a.moduleTemplate);
              if (entry && isCustomType(entry))
                return <CustomTypeSheet entry={entry} library={library} canEdit={canEditLibrary} onEdit={() => setWorkshop({ entry })} />;
              return entry ? (
                <ViewboxStructure
                  entry={entry}
                  library={library}
                  canEdit={canEditLibrary}
                  who={who}
                  highlight={highlight}
                  onHighlight={onHighlight}
                  onSaveEntries={onSaveEntries}
                  onUseType={(key) => patch({ role: 'structural', nature: 'viewbox', moduleTemplate: key })}
                />
              ) : (
                <div className="hint">Choisir le type de Viewbox : sa fiche de structure (barres, sections, assemblages) s’affiche ici.</div>
              );
            })()}
          </>
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
            {a.nature === 'viewbox' && (
              <>
                <div className="hint">
                  C’est la Viewbox elle-même (son composant SketchUp) : rien à saisir ici, elle est calculée avec la structure de son type de Viewbox
                  {bodyTemplate ? ` (${bodyTemplate.name})` : ''} — poids et barres ci-dessous.
                </div>
                {bodyTemplate && (
                  <ViewboxStructure entry={bodyTemplate} library={library} canEdit={canEditLibrary} who={who} highlight={highlight} onHighlight={onHighlight} onSaveEntries={onSaveEntries} />
                )}
              </>
            )}
            {a.role !== 'ignored' && a.nature !== 'viewbox' && (
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
                <button className="btn small ghost" type="button" onClick={() => setComposite(!composite)} title="Poids au m² calculé à partir des couches du panneau">
                  ⚙ Panneau composé
                </button>
              </label>
            )}
            {composite && (
              <CompositeEditor
                library={library}
                canEditLibrary={canEditLibrary}
                ai={ai ?? null}
                studyId={studyId}
                onClose={() => setComposite(false)}
                onSave={onSavePanel}
                onUse={(kg, panel) => {
                  patch({ weight: { value: kg, unit: 'kg/m²' }, windClosed: true, note: `panneau composé « ${panel.name} »` });
                  setComposite(false);
                }}
              />
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
          <button
            className="btn ghost"
            disabled={!ai?.enabled || aiBusy || busy}
            title={ai?.enabled ? 'Propose rôle, nature, matériau, section et poids (à vérifier) à partir des noms et de deux images de la pièce' : 'IA non configurée sur le serveur : répondre à la main'}
            onClick={() => void askAi()}
          >
            {aiBusy ? '🤖 L’IA regarde la pièce…' : '🤖 Demander à l’IA'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecognitionStep({ scene, glassTest, active, recognition, library, canEditLibrary, onAnswer, onConfirmSuggested, ai, studyId, onSavePanel, onSaveEntries, who = 'utilisateur', drawnStructures, aiPanel, aiFrame, openKey, reclaimKey }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<GroupProposal[] | null>(null);
  const [groupUsage, setGroupUsage] = useState<AiUsage | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupProposal | null>(null);
  const [groupError, setGroupError] = useState('');
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

  useEffect(() => {
    if (openKey) setSelected(openKey.key);
  }, [openKey]);
  useEffect(() => {
    if (!reclaimKey) return;
    viewerRef.current?.reclaim();
    viewerRef.current?.setColorOverlay(recognition.colors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reclaimKey]);
  const type = recognition.types.find((t) => t.key === selected) ?? null;
  // dimensions d'un module (boîte du repère du module, pieds exclus) : départ de l'atelier structure
  const moduleDimsOf = (t: PartType) => {
    const fr = t.kind === 'module' ? scene.frames.get(t.moduleIds[0]) : undefined;
    if (!fr) return undefined;
    const d = [fr.max[0] - fr.min[0], fr.max[1] - fr.min[1]].sort((x, y) => y - x);
    return { long: d[0], short: d[1], height: fr.max[2] - fr.min[2] };
  };
  const [showBars, setShowBars] = useState(true);
  const [hiFamily, setHiFamily] = useState<TemplateFamily | null>(null);
  useEffect(() => setHiFamily(null), [selected]);
  // type de Viewbox d'une Viewbox (type de module) ou de la pièce qui est la Viewbox elle-même
  const templateOf = (t: PartType | null): ModuleTypeEntry | undefined => {
    if (!t) return undefined;
    const key =
      t.kind === 'module'
        ? t.assignment?.moduleTemplate
        : t.assignment?.nature === 'viewbox'
          ? recognition.types.find((m) => m.kind === 'module' && m.moduleIds.some((id) => t.moduleIds.includes(id)))?.assignment?.moduleTemplate
          : undefined;
    return key ? library.find((e): e is ModuleTypeEntry => e.kind === 'module_type' && e.key === key) : undefined;
  };
  // atelier structure : le type en cours de description remplace le type choisi dans l'aperçu 3D
  const [previewType, setPreviewType] = useState<ModuleTypeEntry | null>(null);
  useEffect(() => setPreviewType(null), [selected]);
  const shownTemplate = previewType ?? templateOf(type);
  // Viewbox choisie : barres de son gabarit de calcul par-dessus le modèle (le modèle en transparence) ; une famille
  // choisie dans la fiche ressort, les autres barres passent en gris clair
  const bars = useMemo(() => {
    if (!type || !showBars || !shownTemplate?.params) return null;
    const placed = type.moduleIds.flatMap((id) => {
      const f = scene.frames.get(id);
      const info = scene.index.modules.find((m) => m.id === id);
      const pm = f && info ? placeFromFrame(f, info.level, shownTemplate).module : null;
      return pm ? [pm] : [];
    });
    if (!placed.length) return null;
    const seg = templateSegments(placed);
    if (hiFamily)
      seg.families.forEach((f, k) => {
        if (f !== hiFamily) seg.colors.fill(0.85, k * 6, k * 6 + 6);
      });
    return seg;
  }, [type, shownTemplate, scene, showBars, hiFamily]);
  // la pièce choisie en avant, le reste en fantôme ; gabarit : tout en fantôme sous les barres
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.setBarOverlay(bars?.positions ?? null, bars?.colors);
    v.setVisibility(bars ? [] : type ? type.nodeIds : null, [], !!type);
  }, [type, bars]);

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
          {shownTemplate?.params && (
            <label className="row hint" title="Barres acier que l'outil calcule pour cette Viewbox">
              <input type="checkbox" checked={showBars} onChange={(e) => setShowBars(e.target.checked)} /> barres du calcul
            </label>
          )}
          {STATUS_ORDER.map((s) => (
            <StatusBadge key={s} s={s} />
          ))}
        </div>
        <div ref={holder} style={{ height: 560, position: 'relative' }} />
        <div className="card-body hint">
          Clic sur une pièce : sa fiche s’ouvre et son type est isolé (le reste en transparence). Les pièces propres aux Viewbox (composant Viewbox,
          structure, plancher, toiture, pieds : {recognition.templateParts.size}) sont comprises dans la structure de leur type de Viewbox et prennent sa couleur ; un clic
          dessus ouvre cette structure.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {aiPanel}
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
              {ai?.enabled && queue.filter((t) => t.kind === 'item').length >= 2 && (
                <button
                  className="btn small"
                  disabled={busy}
                  title="L’IA repère les types qui sont la même chose (une seule réponse pour le groupe)"
                  onClick={async () => {
                    setBusy(true);
                    setGroupError('');
                    try {
                      const r = await vem.aiGroup({ types: groupPayload(queue.filter((t) => t.kind === 'item')), studyId: studyId ?? null });
                      setGroups(r.groups);
                      setGroupUsage(r.usage);
                    } catch (e) {
                      setGroupError(`IA : ${(e as Error).message}`);
                    }
                    setBusy(false);
                  }}
                >
                  🤖 Regrouper les types identiques
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
        {(groups || groupError) && (
          <div className="card">
            <div className="card-head">
              <h3>Types identiques (proposition de l’IA)</h3>
              <div className="spacer" style={{ flex: 1 }} />
              <AiUsageNote usage={groupUsage} />
              <button className="btn small ghost" onClick={() => [setGroups(null), setGroupError(''), setActiveGroup(null)]}>
                ✕
              </button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupError && <div className="error-box">{groupError}</div>}
              {groups && !groups.length && <div className="hint">Aucun regroupement sûr : chaque type garde sa réponse.</div>}
              {groups?.map((g, k) => {
                const members = g.keys.map((key) => recognition.types.find((t) => t.key === key)).filter((t): t is PartType => !!t && (t.status === 'unknown' || t.status === 'suggested'));
                if (members.length < 2) return null;
                return (
                  <div key={k} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span>
                      <b>{g.label}</b> — {members.map((t) => `${t.nodeIds.length} × ${t.label}`).join(' · ')}
                      <div className="hint">{g.reason}</div>
                    </span>
                    <button
                      className="btn small primary"
                      onClick={() => {
                        setActiveGroup({ ...g, keys: members.map((t) => t.key) });
                        setSelected(members[0].key);
                      }}
                    >
                      Répondre pour les {members.length}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {type && (
          <PartForm
            type={type}
            library={library}
            canEditLibrary={canEditLibrary}
            hasNext={!!nextAfter(type.key)}
            onClose={() => [setSelected(null), setActiveGroup(null)]}
            ai={ai}
            studyId={studyId}
            onSavePanel={onSavePanel}
            group={activeGroup?.keys.includes(type.key) ? activeGroup : null}
            bodyTemplate={templateOf(type.kind === 'item' ? { ...type, assignment: { role: 'structural', nature: 'viewbox' } } : null)}
            who={who}
            onSaveEntries={onSaveEntries}
            highlight={hiFamily}
            onHighlight={setHiFamily}
            moduleDims={moduleDimsOf(type)}
            onPreviewType={setPreviewType}
            extraction={type.kind === 'module' ? (drawnStructures?.get(type.key) ?? null) : null}
            aiFrame={type.kind === 'module' && aiFrame?.moduleKey === type.key ? aiFrame : null}
            onAskAi={async () => {
              const images = await captureTypeImages(scene, glassTest, type).catch(() => []);
              viewerRef.current?.reclaim();
              return vem.aiIdentify({ ...identifyPayload(type, library), images, studyId: studyId ?? null });
            }}
            onSubmit={async (a, opts, next) => {
              const inGroup = activeGroup?.keys.includes(type.key) ? activeGroup.keys : [type.key];
              const following = next ? nextAfter(type.key) : null;
              for (const key of inGroup) {
                const t = recognition.types.find((x) => x.key === key);
                if (t) await onAnswer(t, a, opts);
              }
              if (inGroup.length > 1) {
                setActiveGroup(null);
                setGroups((gs) => gs?.filter((g) => !g.keys.some((k) => inGroup.includes(k))) ?? null);
              }
              setSelected(following && !inGroup.includes(following.key) ? following.key : null);
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
                        {t.source === 'ai' && <span title="proposé par l’analyse IA, à valider">🤖 </span>}
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
