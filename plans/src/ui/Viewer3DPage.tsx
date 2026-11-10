// Vue 3D : liste des Viewbox par niveau + éléments communs, isolation (masquage), catégories masquées,
// voisins en fantôme, face avant des Viewbox, infos au clic, captures haute définition, caméras enregistrées.
// Les captures sont enregistrées avec le modèle (images Cloudinary) : les planches les proposent pour leurs images 3D.
import { useEffect, useMemo, useRef, useState } from 'react';
import { cleanPaint } from '../core/paint/ops';
import { paintContext } from '../core/paint/resolve';
import { paintLayers3D, paintScene } from '../linework/paintScene';
import { prepareExteriorSurvey } from '../linework/paintExterior';
import type { FrontSide } from '../core/views';
import { VIEW_LABELS, frontFromNormal } from '../core/views';
import type { ViewKind } from '../core/views';
import { categoriesIn, subsetAll, subsetForModules } from '../core/subset';
import { bboxDims, displayName, fmtInt } from '../core/report';
import type { LoadedScene } from '../scene/loadedScene';
import type { GlassTest } from '../linework/packets';
import type { ModelSettings, SavedCamera, SavedCapture, SettingsUpdate } from '../api/vem';
import { PROJECT_ID, vem } from '../api/vem';
import { attachmentUrl, thumbUrl } from '../api/cloudinary';
import { fitImageBytes } from '../viewer/uploadSize';
import { newId } from '../sheets/generate';
import type { CameraPose, IsoKind, PickInfo, Projection, StandardView } from '../viewer/SceneViewer';
import { ISO_LABELS, SceneViewer } from '../viewer/SceneViewer';
import { CategoryChip } from './common';
import type { ModuleLabels } from '../core/moduleNumbers';
import { cleanModuleNumbers, entriesFromLabels, formatModuleLabel, labelChanges, labelNumber, labelOf, parseModuleNumber, resolveModuleLabels, setModuleNumber } from '../core/moduleNumbers';

interface Props {
  scene: LoadedScene;
  glassTest: GlassTest;
  active: boolean;
  framesVersion: number;
  settings: ModelSettings;
  /** noms affichés des Viewbox renumérotées dans l'application (réglages du modèle) */
  moduleLabels: ModuleLabels;
  onSetFront: (moduleId: string, front: FrontSide | null) => void;
  onSaveSettings: (update: SettingsUpdate) => Promise<void>;
}

/** Bulle « numéro de cette Viewbox » (mode 🔢 Numéros). */
interface NumberBubble {
  moduleId: string;
  /** position dans la zone 3D (px) */
  at: { x: number; y: number };
  value: string;
}

/** Capture de cette session : fichier pleine résolution + état de l'enregistrement. */
interface LocalCapture {
  id: string;
  blob: Blob;
  blobUrl: string;
  name: string;
  width: number;
  height: number;
  note?: string;
  status: 'saving' | 'saved' | 'error';
  error?: string;
}

const fileNameOf = (name: string, width: number, height: number) =>
  `capture_${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}_${width}x${height}.png`;

const VIEW_BUTTONS: ViewKind[] = ['top', 'front', 'back', 'left', 'right'];
const ISO_BUTTONS: IsoKind[] = ['iso-nw', 'iso-ne', 'iso-sw', 'iso-se'];
const FRONT_LABEL: Record<FrontSide, string> = { '+x': '+X (rouge)', '-x': '−X', '+y': '+Y (vert)', '-y': '−Y' };

export function Viewer3DPage({ scene, glassTest, active, framesVersion, settings, moduleLabels, onSetFront, onSaveSettings }: Props) {
  const { index } = scene;
  const holder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [isolated, setIsolated] = useState<string[] | null>(null); // modules isolés (ids) + 'common'
  const [hiddenCats, setHiddenCats] = useState<string[]>([]);
  const [ghosts, setGhosts] = useState(false);
  const [projection, setProjection] = useState<Projection>('perspective');
  const [picked, setPicked] = useState<PickInfo | null>(null);
  const [frontPick, setFrontPick] = useState<string | null>(null);
  const [capSize, setCapSize] = useState(4000);
  const [capBg, setCapBg] = useState<'white' | 'transparent'>('white');
  const [capMargin, setCapMargin] = useState(3);
  const [capCamera, setCapCamera] = useState('current');
  const [local, setLocal] = useState<LocalCapture[]>([]);
  const [busy, setBusy] = useState('');
  const [camName, setCamName] = useState('');
  // peinture du projet (réglages du modèle) : calque de couleur sur les faces peintes
  const paintSettings = useMemo(() => cleanPaint(settings.paint), [settings.paint]);
  // contexte de peinture construit une fois par modèle (le refaire à chaque enregistrement coûtait cher sur un gros modèle)
  const paintCtx = useMemo(() => paintContext(scene.index), [scene]);
  /** peinture affichée en 3D = celle de cette version (recalculée seulement quand l'onglet est visible) */
  const shownPaint = useRef<unknown>(null);
  const [showPaint, setShowPaint] = useState(() => {
    try {
      return localStorage.getItem('vem_paint_3d') !== '0';
    } catch {
      return true;
    }
  });
  const frontPickRef = useRef<string | null>(null);
  frontPickRef.current = frontPick;
  // ─── numéros des Viewbox (A. Pinchart 10.11.2026 : « cliquer sur la box et dire le numéro ») ───
  const [numbering, setNumbering] = useState(false);
  const [bubble, setBubble] = useState<NumberBubble | null>(null);
  /** numéro proposé au clic suivant (numérotation dans l'ordre des clics) */
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [numberNote, setNumberNote] = useState('');
  const numberingRef = useRef(false);
  numberingRef.current = numbering;
  const labelsRef = useRef(moduleLabels);
  labelsRef.current = moduleLabels;
  const nextRef = useRef(nextNumber);
  nextRef.current = nextNumber;
  /** dernier relâchement du pointeur dans la zone 3D (place la bulle à côté du clic) */
  const lastUp = useRef({ x: 40, y: 40 });
  const nameOf = (id: string) => labelOf(moduleLabels, id);
  const changes = useMemo(() => labelChanges(index.modules.map((m) => m.id), {}, moduleLabels), [index, moduleLabels]);

  const levels = useMemo(() => {
    const byLevel = new Map<number, typeof index.modules>();
    const name = (id: string) => moduleLabels[id] ?? id;
    for (const m of [...index.modules].sort((a, b) => (labelNumber(name(a.id)) ?? 0) - (labelNumber(name(b.id)) ?? 0) || name(a.id).localeCompare(name(b.id)))) {
      const l = byLevel.get(m.level) ?? [];
      l.push(m);
      byLevel.set(m.level, l);
    }
    return [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
  }, [index, moduleLabels]);

  const includeIds = useMemo(() => {
    if (!isolated) return null;
    const mods = isolated.filter((x) => x !== 'common');
    return [...subsetForModules(index, mods), ...(isolated.includes('common') ? index.commonIds : [])];
  }, [isolated, index]);
  const soloModule = isolated && isolated.length === 1 && isolated[0] !== 'common' ? isolated[0] : null;
  const categories = useMemo(() => categoriesIn(index, scene.look, includeIds ?? subsetAll(index)), [index, scene, includeIds]);

  // création / destruction du viewer
  useEffect(() => {
    if (!holder.current) return;
    const v = new SceneViewer(holder.current, scene, glassTest);
    viewerRef.current = v;
    v.onPick((p) => {
      if (numberingRef.current) {
        const node = p ? scene.look.byId.get(p.itemId) ?? scene.look.byId.get(p.nodeId) : undefined;
        const moduleId = node?.moduleId ?? null;
        if (!moduleId) {
          setBubble(null);
          v.setHighlightNode(null);
          setNumberNote(p ? 'Ce n’est pas une Viewbox (élément commun) : clique une box.' : '');
          return;
        }
        openBubble(moduleId, lastUp.current);
        return;
      }
      const fp = frontPickRef.current;
      if (fp) {
        const frame = scene.frames.get(fp);
        if (p?.normal && frame) onSetFront(fp, frontFromNormal(frame, p.normal));
        setFrontPick(null);
        return;
      }
      setPicked(p);
      v.setSelected(p?.itemId ?? null);
    });
    v.onModuleTag((moduleId, at) => openBubble(moduleId, at));
    return () => {
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (!showPaint || !paintSettings.zones.length) {
      v.setPaintDisplay(null);
      shownPaint.current = null;
      return;
    }
    // onglet caché (resté chargé sur ordinateur) : on ne recalcule pas à chaque coup de pinceau des Planches — cela
    // figeait la page (A. Pinchart 04.11.2026 « ça freeze sans raison quand je touche à la peinture ») ; fait à l'ouverture
    if (!active) return;
    const key = [paintSettings, framesVersion, glassTest];
    const prev = shownPaint.current as unknown[] | null;
    if (prev && prev.every((x, i) => x === key[i])) return;
    shownPaint.current = key;
    let alive = true;
    let done = false;
    // « côtés extérieurs » : relevé par tranches d'abord (sans figer la page), puis la peinture
    const exterior = paintSettings.zones.some((z) => z.target.scope === 'exterior');
    void (exterior ? prepareExteriorSurvey(scene, paintCtx, glassTest) : Promise.resolve(null))
      .then(() => {
        if (!alive) return;
        const painted = paintScene(scene, paintSettings, paintCtx, glassTest);
        const hex = new Map(paintSettings.colors.map((c) => [c.id, parseInt(c.hex.slice(1), 16)]));
        v.setPaintDisplay(paintLayers3D(scene, painted).map((l) => ({ nodeId: l.nodeId, color: hex.get(l.colorId) ?? 0x888888, positions: l.positions })));
        done = true;
      })
      .catch((e) => console.error('Peinture 3D', e));
    return () => {
      alive = false;
      // interrompu avant d'afficher : à refaire au prochain passage
      if (!done) shownPaint.current = null;
    };
  }, [scene, paintSettings, showPaint, framesVersion, glassTest, active, paintCtx]);

  useEffect(() => {
    viewerRef.current?.setVisibility(includeIds, hiddenCats, ghosts);
  }, [includeIds, hiddenCats, ghosts]);

  // étiquettes des numéros au-dessus des box (mode 🔢 Numéros)
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (!numbering) {
      v.setModuleTags(null);
      return;
    }
    v.setModuleTags(new Map(index.modules.map((m) => [m.id, labelOf(moduleLabels, m.id)])), bubble?.moduleId ?? null, new Set(Object.keys(moduleLabels)));
  }, [numbering, moduleLabels, bubble?.moduleId, index, scene]);

  useEffect(() => {
    viewerRef.current?.refreshFrames();
  }, [framesVersion]);

  useEffect(() => {
    if (active) viewerRef.current?.reclaim();
  }, [active]);

  const view = (k: StandardView) => viewerRef.current?.setView(k, soloModule ?? undefined);

  const isolate = (ids: string[] | null) => {
    setIsolated(ids);
    setPicked(null);
    viewerRef.current?.setSelected(null);
    // recadre après la mise à jour de la visibilité
    setTimeout(() => viewerRef.current?.setView('iso-sw', undefined), 0);
  };

  const toggleCheck = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Bulle du numéro d'une box : numéro proposé = suite des clics, sinon son numéro actuel. */
  function openBubble(moduleId: string, at: { x: number; y: number }) {
    const current = labelNumber(labelOf(labelsRef.current, moduleId));
    const proposed = nextRef.current ?? current;
    setBubble({ moduleId, at, value: proposed ? String(proposed) : '' });
    setNumberNote('');
    const m = index.modules.find((x) => x.id === moduleId);
    viewerRef.current?.setHighlightNode(m?.nodeId ?? null);
  }

  const closeBubble = () => {
    setBubble(null);
    viewerRef.current?.setHighlightNode(null);
  };

  /** Donne le numéro saisi à la box de la bulle (échange avec la box qui l'avait), enregistré dans les réglages du modèle. */
  const applyNumber = () => {
    if (!bubble) return;
    const n = parseModuleNumber(bubble.value);
    if (n === null) {
      setNumberNote('Numéro invalide : tape un nombre (ex. 5 ou VBX-05).');
      return;
    }
    const r = setModuleNumber(index.modules, moduleLabels, bubble.moduleId, n);
    const name = formatModuleLabel(n);
    if (r.changed) {
      void onSaveSettings((cur) => {
        // depuis les réglages à jour (deux clics rapides ne s'écrasent pas)
        const now = resolveModuleLabels(index.modules, cleanModuleNumbers(cur.moduleNumbers));
        return { moduleNumbers: entriesFromLabels(index.modules, setModuleNumber(index.modules, now, bubble.moduleId, n).labels) };
      });
      setNumberNote(
        r.swappedWith
          ? `${labelOf(moduleLabels, bubble.moduleId)} → ${name} ; ${name} était pris : l’autre box devient ${labelOf(moduleLabels, bubble.moduleId)}.`
          : `${labelOf(moduleLabels, bubble.moduleId)} → ${name}.`,
      );
    } else setNumberNote(`${name} : inchangé.`);
    setNextNumber(n + 1);
    closeBubble();
  };

  const resetNumbers = () => {
    if (!window.confirm('Revenir aux numéros de SketchUp pour toutes les Viewbox ? Les planches proposeront de se mettre à jour.')) return;
    void onSaveSettings({ moduleNumbers: [] });
    setNextNumber(null);
    closeBubble();
    setNumberNote('Numéros SketchUp rétablis.');
  };

  const capturePose = (): CameraPose | undefined => {
    const v = viewerRef.current;
    if (!v || capCamera === 'current') return undefined;
    if (capCamera.startsWith('cam:')) return (settings.cameras ?? []).find((c) => c.name === capCamera.slice(4));
    const [kind, proj] = capCamera.split('|') as [IsoKind, Projection];
    return v.poseFor(kind, undefined, 4 / 3, 1.02, proj);
  };

  /** Nom proposé : ce qui est affiché + la caméra (modifiable ensuite). */
  const captureName = () => {
    const mods = isolated?.filter((x) => x !== 'common') ?? [];
    const what = !isolated
      ? 'Tout le modèle'
      : (mods.length ? (mods.length <= 3 ? mods.map(nameOf).join(', ') : `${mods.length} Viewbox`) : '') +
        (isolated.includes('common') ? (mods.length ? ' + éléments communs' : 'Éléments communs') : '');
    let cam = 'vue libre';
    if (capCamera.startsWith('cam:')) cam = capCamera.slice(4);
    else if (capCamera !== 'current') {
      const [kind, proj] = capCamera.split('|') as [IsoKind, Projection];
      cam = `${ISO_LABELS[kind]} ${proj === 'perspective' ? 'perspective' : 'axonométrie'}`;
    }
    return `${what} · ${cam}`;
  };

  const patchLocal = (id: string, patch: Partial<LocalCapture>) => setLocal((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  /** Envoi de la capture (réduite si > 10 Mo) puis ajout à la liste du modèle. */
  const persist = async (c: LocalCapture) => {
    patchLocal(c.id, { status: 'saving', error: undefined });
    try {
      const fit = await fitImageBytes(c.blob, c.width, c.height);
      const { url } = await vem.uploadAsset(PROJECT_ID, fit.blob, fileNameOf(c.name, fit.width, fit.height));
      const saved: SavedCapture = { id: c.id, url, name: c.name, width: fit.width, height: fit.height, createdAt: new Date().toISOString() };
      await onSaveSettings((s) => ({ captures: [saved, ...(s.captures ?? []).filter((x) => x.id !== c.id)] }));
      patchLocal(c.id, {
        status: 'saved',
        note: fit.width !== c.width ? `enregistrée en ${fit.width} × ${fit.height} px (limite de 10 Mo)` : undefined,
      });
    } catch (e) {
      patchLocal(c.id, { status: 'error', error: (e as Error).message });
    }
  };

  const doCapture = async () => {
    const v = viewerRef.current;
    if (!v) return;
    setBusy('Capture en cours…');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const res = await v.capture({ size: capSize, background: capBg, marginPct: capMargin, pose: capturePose() });
      const c: LocalCapture = {
        id: newId('cap'),
        blob: res.blob,
        blobUrl: URL.createObjectURL(res.blob),
        name: captureName(),
        width: res.width,
        height: res.height,
        note: res.clamped ? `résolution limitée à ${v.maxCaptureSize()} px par la carte graphique` : undefined,
        status: 'saving',
      };
      setLocal((l) => [c, ...l]);
      void persist(c);
    } catch (e) {
      window.alert(`Capture impossible : ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const renameCapture = (id: string, name: string) => {
    patchLocal(id, { name });
    void onSaveSettings((s) => ({ captures: (s.captures ?? []).map((x) => (x.id === id ? { ...x, name } : x)) }));
  };

  const removeCapture = (id: string) => {
    if (!window.confirm('Retirer cette capture de la liste ? Les planches qui l’utilisent déjà la gardent.')) return;
    setLocal((l) => l.filter((x) => x.id !== id));
    void onSaveSettings((s) => ({ captures: (s.captures ?? []).filter((x) => x.id !== id) }));
  };

  // captures de cette session pas encore (ou pas) enregistrées, puis toutes celles du modèle
  const saved = settings.captures ?? [];
  const savedIds = new Set(saved.map((c) => c.id));
  const localById = new Map(local.map((c) => [c.id, c]));
  const captureRows = [...local.filter((c) => !savedIds.has(c.id)), ...saved.map((c) => localById.get(c.id) ?? c)];

  const saveCamera = async () => {
    const v = viewerRef.current;
    const name = camName.trim();
    if (!v || !name) return;
    const pose = v.getPose();
    const cam: SavedCamera = { name, ...pose };
    const cameras = [...(settings.cameras ?? []).filter((c) => c.name !== name), cam];
    setCamName('');
    await onSaveSettings({ cameras });
  };

  const pickedNode = picked ? scene.look.byId.get(picked.itemId) ?? scene.look.byId.get(picked.nodeId) : undefined;
  const frame = soloModule ? scene.frames.get(soloModule) : undefined;

  return (
    <div className="viewer-page">
      <aside className="viewer-side">
        <div className="card">
          <div className="card-head">
            <h2>Viewbox</h2>
            <div className="spacer" />
            <button className="btn small" disabled={!checked.size} onClick={() => isolate([...checked])} title="Afficher uniquement les éléments cochés">
              Isoler
            </button>
            <button className="btn small ghost" onClick={() => isolate(null)}>
              Tout afficher
            </button>
          </div>
          <div className="card-body side-list">
            {levels.map(([level, mods]) => (
              <div key={level}>
                <div className="group-title">{index.levels.find((l) => l.level === level)?.label ?? `Niveau ${level}`}</div>
                {mods.map((m) => (
                  <label key={m.id} className={`side-row${isolated?.includes(m.id) ? ' on' : ''}`}>
                    <input type="checkbox" checked={checked.has(m.id)} onChange={() => toggleCheck(m.id)} />
                    <span className="nm" onClick={(e) => (e.preventDefault(), isolate([m.id]))} title={moduleLabels[m.id] ? `Isoler cette Viewbox (${m.id} dans SketchUp)` : 'Isoler cette Viewbox'}>
                      {nameOf(m.id)}
                      {moduleLabels[m.id] && <em> ({m.id})</em>}
                      {m.type && <em> {m.type}</em>}
                    </span>
                    {numbering ? (
                      <button
                        className="btn small ghost"
                        data-testid={`renumber-${m.id}`}
                        title="Changer le numéro de cette Viewbox"
                        onClick={(e) => {
                          e.preventDefault();
                          openBubble(m.id, { x: 40, y: 40 });
                        }}
                      >
                        ✎
                      </button>
                    ) : (
                      <span className="meta">{m.itemIds.length} acc.</span>
                    )}
                  </label>
                ))}
              </div>
            ))}
            {index.commonIds.length > 0 && (
              <label className={`side-row${isolated?.includes('common') ? ' on' : ''}`}>
                <input type="checkbox" checked={checked.has('common')} onChange={() => toggleCheck('common')} />
                <span className="nm" onClick={(e) => (e.preventDefault(), isolate(['common']))}>
                  Éléments communs
                </span>
                <span className="meta">{index.commonIds.length}</span>
              </label>
            )}
            <label className="side-row" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} />
              <span className="nm">Voisins en fantôme</span>
            </label>
            <div className="hint" style={{ marginTop: 6 }}>
              Clic sur un nom = isoler cette Viewbox. Les autres objets sont masqués, jamais coupés.
            </div>
          </div>
        </div>

        {numbering && (
          <div className="card" data-testid="numbering-card">
            <div className="card-head">
              <h2>Numéros des Viewbox</h2>
              <div className="spacer" />
              <button className="btn small ghost" onClick={() => (setNumbering(false), closeBubble())}>
                ✕
              </button>
            </div>
            <div className="card-body">
              <div className="hint">
                Clique une box dans la 3D et tape son numéro (Entrée). Le clic suivant propose le numéro d’après : clique les box dans l’ordre
                voulu. Un numéro déjà pris est échangé avec l’autre box. Les planches A1 proposent ensuite de se mettre à jour.
              </div>
              {numberNote && (
                <div className="hint" style={{ marginTop: 6, color: 'var(--text)' }} data-testid="numbering-note">
                  {numberNote}
                </div>
              )}
              {changes.length > 0 ? (
                <>
                  <div className="group-title" style={{ marginTop: 8 }}>
                    Changés par rapport à SketchUp
                  </div>
                  {changes.map((c) => (
                    <div key={c.id} className="side-row" data-testid="numbering-change">
                      <span className="nm">
                        {c.before} → <b>{c.after}</b>
                      </span>
                    </div>
                  ))}
                  <button className="btn small ghost" style={{ marginTop: 6 }} onClick={resetNumbers} data-testid="numbering-reset">
                    ↺ Revenir aux numéros SketchUp
                  </button>
                </>
              ) : (
                <div className="hint" style={{ marginTop: 6 }}>
                  Numéros de SketchUp.
                </div>
              )}
              {nextNumber !== null && (
                <div className="row" style={{ marginTop: 6 }}>
                  <span className="hint">Prochain clic : {formatModuleLabel(nextNumber)}</span>
                  <button className="btn small ghost" onClick={() => setNextNumber(null)} title="Le clic suivant propose le numéro actuel de la box">
                    Ne plus suivre
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {frame && soloModule && (
          <div className="card">
            <div className="card-head">
              <h2>Face avant · {nameOf(soloModule)}</h2>
            </div>
            <div className="card-body">
              <div className="row">
                <select
                  value={frame.front}
                  onChange={(e) => onSetFront(soloModule, e.target.value as FrontSide)}
                  style={{ width: 150 }}
                  title="Côté local SketchUp du composant"
                >
                  {(['+x', '-x', '+y', '-y'] as FrontSide[]).map((f) => (
                    <option key={f} value={f}>
                      {FRONT_LABEL[f]}
                    </option>
                  ))}
                </select>
                <button className={`btn small${frontPick ? ' primary' : ''}`} onClick={() => setFrontPick(frontPick ? null : soloModule)}>
                  {frontPick ? 'Clique une face…' : 'Choisir en cliquant'}
                </button>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                {frame.frontSource === 'manual' ? 'Choisie à la main. ' : 'Par défaut : petit côté vers +X du composant. '}
                La flèche rouge sur le toit montre l’avant. Avant/Arrière = petits côtés, Gauche/Droite = grands côtés.
                {frame.frontSource === 'manual' && (
                  <>
                    {' '}
                    <a href="#" onClick={(e) => (e.preventDefault(), onSetFront(soloModule, null))}>
                      Revenir au défaut
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Masquer des catégories</h2>
          </div>
          <div className="card-body side-list">
            {categories.map((c) => (
              <label key={c} className="side-row">
                <input
                  type="checkbox"
                  checked={hiddenCats.includes(c)}
                  onChange={(e) => setHiddenCats((h) => (e.target.checked ? [...h, c] : h.filter((x) => x !== c)))}
                />
                <CategoryChip category={c} />
              </label>
            ))}
            {!categories.length && <div className="hint">Aucune catégorie.</div>}
          </div>
        </div>

        {pickedNode && (
          <div className="card detail">
            <div className="card-head">
              <h2>Objet</h2>
              <div className="spacer" />
              <button className="btn small ghost" onClick={() => (setPicked(null), viewerRef.current?.setSelected(null))}>
                ✕
              </button>
            </div>
            <div className="card-body">
              <dl>
                <dt>Désignation</dt>
                <dd>{displayName(pickedNode)}</dd>
                {pickedNode.definition && (
                  <>
                    <dt>Définition</dt>
                    <dd>{pickedNode.definition}</dd>
                  </>
                )}
                <dt>Catégorie</dt>
                <dd>
                  <CategoryChip category={scene.look.categoryOf(pickedNode.id)} />
                </dd>
                <dt>Réf. article</dt>
                <dd>{pickedNode.articleRef ?? '—'}</dd>
                <dt>Viewbox</dt>
                <dd>
                  {pickedNode.moduleId ? nameOf(pickedNode.moduleId) : pickedNode.assignment === 'common' ? 'élément commun' : '—'}
                  {pickedNode.moduleId && (
                    <button
                      className="btn small ghost"
                      style={{ marginLeft: 6 }}
                      data-testid="renumber-picked"
                      title="Changer le numéro de cette Viewbox (repris par les planches)"
                      onClick={() => {
                        setNumbering(true);
                        openBubble(pickedNode.moduleId!, lastUp.current);
                      }}
                    >
                      ✎ Numéro
                    </button>
                  )}
                </dd>
                <dt>Dimensions</dt>
                <dd>{bboxDims(pickedNode)}</dd>
                <dt>Triangles</dt>
                <dd>{fmtInt(pickedNode.triangles)}</dd>
              </dl>
            </div>
          </div>
        )}
      </aside>

      <section className="viewer-main">
        <div className="viewer-toolbar">
          {VIEW_BUTTONS.map((k) => (
            <button key={k} className="btn small" onClick={() => view(k)} title={soloModule ? `Vue relative à ${soloModule}` : 'Vue standard SketchUp'}>
              {VIEW_LABELS[k]}
            </button>
          ))}
          <span className="sep" />
          {ISO_BUTTONS.map((k) => (
            <button key={k} className="btn small" onClick={() => view(k)}>
              {ISO_LABELS[k]}
            </button>
          ))}
          <span className="sep" />
          <button
            className="btn small"
            onClick={() => {
              const p = projection === 'perspective' ? 'orthographic' : 'perspective';
              viewerRef.current?.setProjection(p);
              setProjection(p);
            }}
          >
            {projection === 'perspective' ? 'Perspective' : 'Orthographique'}
          </button>
          {!!paintSettings.zones.length && (
            <button
              className={`btn small${showPaint ? ' primary' : ''}`}
              data-testid="toggle-paint-3d"
              title="Faces peintes du projet en couleur (les captures prises ici les gardent)"
              onClick={() => {
                setShowPaint(!showPaint);
                try {
                  localStorage.setItem('vem_paint_3d', showPaint ? '0' : '1');
                } catch {
                  /* stockage indisponible */
                }
              }}
            >
              🎨 Peinture
            </button>
          )}
          <button
            className={`btn small${numbering ? ' primary' : ''}`}
            data-testid="toggle-numbering"
            title="Voir les numéros des Viewbox sur la 3D et les changer en cliquant les box (repris par les planches A1)"
            onClick={() => {
              if (numbering) closeBubble();
              else {
                setPicked(null);
                viewerRef.current?.setSelected(null);
              }
              setNumbering(!numbering);
              setNumberNote('');
            }}
          >
            🔢 Numéros
          </button>
          {soloModule && <span className="badge">vues relatives à {nameOf(soloModule)}</span>}
          <span className="spacer" />
          <span className="hint nav-hint" title="Molette enfoncée = tourner, Maj + molette enfoncée = déplacer (comme SketchUp)">
            Clic gauche : tourner · clic droit : déplacer · molette : zoom · double-clic : centrer ici
          </span>
          {frontPick && <span className="badge orange">clique une face de {nameOf(frontPick)} pour en faire l’avant</span>}
          {numbering && !frontPick && <span className="badge orange">clique une Viewbox pour changer son numéro</span>}
        </div>
        <div
          className="viewer-canvas"
          ref={holder}
          onPointerUpCapture={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            lastUp.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          }}
        >
          {bubble && (
            <div
              className="number-bubble"
              data-testid="number-bubble"
              style={{ left: Math.max(8, Math.min(bubble.at.x + 12, (holder.current?.clientWidth ?? 600) - 250)), top: Math.max(8, Math.min(bubble.at.y + 12, (holder.current?.clientHeight ?? 400) - 130)) }}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: 6 }}>
                <b>{nameOf(bubble.moduleId)}</b>
                {moduleLabels[bubble.moduleId] && <span className="hint"> (SketchUp {bubble.moduleId})</span>}
              </div>
              <div className="row">
                <span>Numéro</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  data-testid="number-input"
                  value={bubble.value}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setBubble({ ...bubble, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyNumber();
                    if (e.key === 'Escape') closeBubble();
                  }}
                />
                <button className="btn small primary" data-testid="number-ok" onClick={applyNumber}>
                  OK
                </button>
                <button className="btn small ghost" onClick={closeBubble}>
                  ✕
                </button>
              </div>
              {(() => {
                const n = parseModuleNumber(bubble.value);
                if (n === null) return null;
                const name = formatModuleLabel(n);
                const other = index.modules.find((m) => m.id !== bubble.moduleId && labelOf(moduleLabels, m.id) === name);
                return (
                  <div className="hint" style={{ marginTop: 6 }}>
                    → {name}
                    {other ? ` · déjà pris : l’autre box prendra ${nameOf(bubble.moduleId)}` : ''}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      <aside className="viewer-side">
        <div className="card">
          <div className="card-head">
            <h2>Capture haute définition</h2>
          </div>
          <div className="card-body">
            <div className="form-grid compact">
              <label>Caméra</label>
              <select value={capCamera} onChange={(e) => setCapCamera(e.target.value)}>
                <option value="current">Vue actuelle</option>
                {ISO_BUTTONS.map((k) => (
                  <option key={k + 'o'} value={`${k}|orthographic`}>
                    {ISO_LABELS[k]} — axonométrie
                  </option>
                ))}
                {ISO_BUTTONS.map((k) => (
                  <option key={k + 'p'} value={`${k}|perspective`}>
                    {ISO_LABELS[k]} — perspective 30°
                  </option>
                ))}
                {(settings.cameras ?? []).map((c) => (
                  <option key={c.name} value={`cam:${c.name}`}>
                    📌 {c.name}
                  </option>
                ))}
              </select>
              <label>Résolution</label>
              <select value={capSize} onChange={(e) => setCapSize(Number(e.target.value))}>
                {[2000, 4000, 8000].map((s) => (
                  <option key={s} value={s}>
                    {s} px
                  </option>
                ))}
              </select>
              <label>Fond</label>
              <select value={capBg} onChange={(e) => setCapBg(e.target.value as 'white' | 'transparent')}>
                <option value="white">Blanc</option>
                <option value="transparent">Transparent</option>
              </select>
              <label>Marge</label>
              <input type="number" min={0} max={20} value={capMargin} onChange={(e) => setCapMargin(Number(e.target.value) || 0)} />
            </div>
            <button className="btn primary" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} disabled={!!busy} onClick={() => void doCapture()}>
              {busy || '📷 Capturer'}
            </button>
            <div className="hint" style={{ marginTop: 6 }}>Uniquement les objets affichés, sans sol ni ombre, recadrés automatiquement.</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Caméras enregistrées</h2>
          </div>
          <div className="card-body">
            <div className="row">
              <input type="text" placeholder="ex. 3D entrée" value={camName} onChange={(e) => setCamName(e.target.value)} style={{ flex: 1, width: 'auto' }} />
              <button className="btn small" disabled={!camName.trim()} onClick={() => void saveCamera()}>
                Enregistrer la vue
              </button>
            </div>
            {(settings.cameras ?? []).map((c) => (
              <div key={c.name} className="side-row">
                <span className="nm">📌 {c.name}</span>
                <button className="btn small ghost" onClick={() => viewerRef.current?.applyPose(c)}>
                  Aller
                </button>
                <button
                  className="btn small ghost"
                  onClick={() => void onSaveSettings({ cameras: (settings.cameras ?? []).filter((x) => x.name !== c.name) })}
                  title="Supprimer"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Captures{saved.length ? ` (${saved.length})` : ''}</h2>
          </div>
          <div className="card-body captures">
            {!captureRows.length && (
              <div className="hint">
                Cadre la vue, puis 📷 Capturer : chaque capture est enregistrée avec le modèle et proposée dans les planches (clic sur une image 3D).
              </div>
            )}
            {captureRows.map((c) => (
              <CaptureCard key={c.id} c={c} onRename={(n) => renameCapture(c.id, n)} onRemove={() => removeCapture(c.id)} onRetry={() => 'blob' in c && void persist(c)} />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function CaptureCard({ c, onRename, onRemove, onRetry }: { c: LocalCapture | SavedCapture; onRename: (name: string) => void; onRemove: () => void; onRetry: () => void }) {
  const [name, setName] = useState(c.name);
  useEffect(() => setName(c.name), [c.name]);
  const isLocal = 'blob' in c;
  const status = isLocal ? c.status : 'saved';
  const src = isLocal ? c.blobUrl : thumbUrl(c.url, 560);
  // pleine résolution de cette session si on l'a, sinon l'image enregistrée
  const href = isLocal ? c.blobUrl : attachmentUrl(c.url);
  const commit = () => {
    const n = name.trim();
    if (!n) setName(c.name);
    else if (n !== c.name) onRename(n);
  };
  return (
    <div className="capture">
      <a href={isLocal ? c.blobUrl : c.url} target="_blank" rel="noreferrer">
        <img src={src} alt={c.name} onError={(e) => !isLocal && e.currentTarget.src !== c.url && (e.currentTarget.src = c.url)} />
      </a>
      <input
        type="text"
        value={name}
        disabled={status !== 'saved'}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        title="Nom de la capture (affiché dans les planches)"
      />
      <div className="hint">
        {c.width} × {c.height} px{isLocal ? ` · ${fmtInt(Math.round(c.blob.size / 1024))} Ko` : ''}
        {isLocal && c.note ? ` · ${c.note}` : ''}
        {status === 'saving' && ' · enregistrement…'}
        {status === 'saved' && ' · ✓ disponible dans les planches'}
      </div>
      {status === 'error' && (
        <div className="error-box" style={{ margin: '4px 0', padding: '4px 8px', fontSize: 12 }}>
          Non enregistrée : {isLocal ? c.error : ''}{' '}
          <button className="btn small" onClick={onRetry}>
            Réessayer
          </button>
        </div>
      )}
      <div className="row">
        <a className="btn small" href={href} download={fileNameOf(c.name, c.width, c.height)}>
          ⬇ Télécharger
        </a>
        {status !== 'saving' && (
          <button className="btn small ghost" onClick={onRemove} title="Retirer de la liste">
            🗑
          </button>
        )}
      </div>
    </div>
  );
}
