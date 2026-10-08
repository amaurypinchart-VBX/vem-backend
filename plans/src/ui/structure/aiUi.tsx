// Éléments d'interface de l'IA de l'étude structure (phase S7) : état de l'IA (clé configurée côté serveur), captures
// d'une pièce pour l'identification, éditeur de panneau composé (couches + cadre, recherche des données sur internet),
// relecture de cohérence d'une étude. Sans IA, tout reste faisable à la main.
import { useEffect, useMemo, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import { SceneViewer } from '../../viewer/SceneViewer';
import type { PartType } from '../../structure/core/recognition';
import type { LibraryEntry } from '../../structure/core/library';
import type { CompositePanel, PanelLayer } from '../../structure/core/composite';
import { panelFromSearch, panelMass, panelsOf } from '../../structure/core/composite';
import { fmtNumber } from '../../structure/core/units';
import type { AiAlert, AiUsage } from '../../api/vem';
import { vem } from '../../api/vem';

export interface AiState {
  enabled: boolean;
  model: string;
}

let statusPromise: Promise<AiState> | null = null;

/** IA disponible (clé API configurée sur le serveur) ; null tant que la réponse n'est pas arrivée. */
export function useAiStatus(): AiState | null {
  const [s, setS] = useState<AiState | null>(null);
  useEffect(() => {
    statusPromise ??= vem.aiStatus().catch(() => ({ enabled: false, model: '' }));
    let alive = true;
    void statusPromise.then((v) => alive && setS(v));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

export function AiUsageNote({ usage }: { usage?: AiUsage | null }) {
  if (!usage) return null;
  return (
    <span className="hint">
      IA {usage.model} · {fmtNumber(usage.durationMs / 1000, 0)} s{usage.costUsd !== null ? ` · ≈ ${fmtNumber(usage.costUsd, 2)} $` : ''}
    </span>
  );
}

/** Blob d'image → JPEG en base64 (sans l'en-tête data:), au plus `max` px de côté. */
async function jpegBase64(blob: Blob, max = 1024): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}

/** Deux images pour l'identification : la pièce seule, puis la pièce (en rouge) dans sa Viewbox. */
export async function captureTypeImages(scene: LoadedScene, glassTest: GlassTest, t: PartType): Promise<Array<{ media: 'image/jpeg'; data: string; caption: string }>> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1170px;height:900px;pointer-events:none;';
  document.body.appendChild(host);
  const viewer = new SceneViewer(host, scene, glassTest);
  viewer.setFrontMarkers(false);
  const out: Array<{ media: 'image/jpeg'; data: string; caption: string }> = [];
  try {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const node = t.nodeIds[0];
    viewer.setVisibility([node]);
    const shot = async (caption: string) => {
      const pose = viewer.poseFor('iso-sw', undefined, 1.3, 1.05, 'perspective');
      const r = await viewer.capture({ size: 1024, background: 'white', marginPct: 4, pose });
      out.push({ media: 'image/jpeg', data: await jpegBase64(r.blob), caption });
    };
    await shot(t.kind === 'module' ? 'le module seul' : 'la pièce seule (une instance)');
    const mod = t.kind === 'item' ? scene.index.modules.find((m) => m.id === t.moduleIds[0]) : undefined;
    if (mod) {
      viewer.setVisibility([mod.nodeId, node]);
      viewer.setColorOverlay(new Map([[node, 0xef4444]]));
      await shot(`la pièce (en rouge) dans sa Viewbox ${mod.id}`);
    }
  } finally {
    viewer.dispose();
    host.remove();
  }
  return out;
}

/**
 * Images de l'analyse du modèle (S12.6), 6 au plus, JPEG ≤ 1 600 px : vue d'ensemble, une box seule, sa structure
 * (barres porteuses seules), la box vue de dessous, et une planche contact des produits inconnus (vignettes numérotées,
 * le numéro renvoie à la clé du type dans la légende).
 */
export async function captureModelImages(
  scene: LoadedScene,
  glassTest: GlassTest,
  o: { moduleNodeId?: string; structureNodes?: string[]; unknown: PartType[] },
): Promise<Array<{ media: 'image/jpeg'; data: string; caption: string }>> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1170px;height:900px;pointer-events:none;';
  document.body.appendChild(host);
  const viewer = new SceneViewer(host, scene, glassTest);
  viewer.setFrontMarkers(false);
  const out: Array<{ media: 'image/jpeg'; data: string; caption: string }> = [];
  try {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const shot = async (caption: string, kind: 'iso-sw' | 'iso-ne' = 'iso-sw', size = 1600) => {
      const pose = viewer.poseFor(kind, undefined, 1.3, 1.05, 'perspective');
      const r = await viewer.capture({ size, background: 'white', marginPct: 4, pose });
      out.push({ media: 'image/jpeg', data: await jpegBase64(r.blob, 1600), caption });
    };
    viewer.setVisibility(null);
    await shot('vue d’ensemble du modèle');
    if (o.moduleNodeId) {
      viewer.setVisibility([o.moduleNodeId]);
      await shot('une box seule');
      if (o.structureNodes?.length) {
        viewer.setVisibility(o.structureNodes);
        await shot('la structure de cette box seule (profils porteurs, sans panneaux)');
        await shot('la structure de cette box vue de l’autre côté', 'iso-ne');
      }
    }
    // planche contact : 12 types inconnus au plus, 4 × 3 vignettes numérotées
    const list = o.unknown.slice(0, 12);
    if (list.length) {
      const cell = 400;
      const cols = 4;
      const c = document.createElement('canvas');
      c.width = cols * cell;
      c.height = Math.ceil(list.length / cols) * cell;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      for (let k = 0; k < list.length; k++) {
        viewer.setVisibility([list[k].nodeIds[0]]);
        const pose = viewer.poseFor('iso-sw', undefined, 1, 1.1, 'perspective');
        const r = await viewer.capture({ size: cell, background: 'white', marginPct: 6, pose });
        const bmp = await createImageBitmap(r.blob);
        const s = Math.min(cell / bmp.width, cell / bmp.height);
        const x = (k % cols) * cell;
        const y = Math.floor(k / cols) * cell;
        g.drawImage(bmp, x + (cell - bmp.width * s) / 2, y + (cell - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
        bmp.close();
        g.strokeStyle = '#ccc';
        g.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        g.fillStyle = '#111';
        g.font = 'bold 28px sans-serif';
        g.fillText(String(k + 1), x + 10, y + 34);
      }
      const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
      out.push({ media: 'image/jpeg', data: await jpegBase64(blob, 1600), caption: `planche des produits inconnus : ${list.map((t, k) => `${k + 1} = ${t.key}`).join(' ; ')}` });
    }
  } finally {
    viewer.dispose();
    host.remove();
  }
  return out.slice(0, 6);
}

const CHECK_LABEL: Record<string, { text: string; color: string }> = {
  citation: { text: 'valeur retrouvée dans la source', color: 'var(--ok)' },
  quote: { text: 'valeur dans l’extrait recopié (à vérifier)', color: 'var(--warn)' },
  no: { text: 'valeur non retrouvée dans la source', color: 'var(--danger)' },
  user: { text: 'saisie', color: 'var(--text-dim)' },
};

function SourceBadge({ layer }: { layer: Pick<PanelLayer, 'source'> }) {
  const s = layer.source;
  if (!s) return null;
  const c = CHECK_LABEL[s.check ?? 'user'];
  return (
    <span className="hint" style={{ color: c.color }} title={s.quote}>
      {s.url ? (
        <a href={s.url} target="_blank" rel="noreferrer">
          source
        </a>
      ) : (
        'source'
      )}{' '}
      · {c.text}
    </span>
  );
}

const EMPTY: CompositePanel = { name: '', layers: [{ name: '', thickness: 0, density: 0 }] };

/**
 * Panneau composé : couches (épaisseur × masse volumique) et cadre de profilés ; l'outil calcule le poids au m².
 * « Chercher sur internet » demande à l'IA les données des fabricants, avec leurs sources, à vérifier.
 */
export function CompositeEditor({
  library,
  canEditLibrary,
  ai,
  studyId,
  onUse,
  onSave,
  onClose,
}: {
  library: LibraryEntry[];
  canEditLibrary: boolean;
  ai: AiState | null;
  studyId?: string | null;
  onUse: (kgPerM2: number, panel: CompositePanel) => void;
  onSave?: (panel: CompositePanel) => Promise<void>;
  onClose: () => void;
}) {
  const saved = panelsOf(library);
  const [p, setP] = useState<CompositePanel>(EMPTY);
  const [withFrame, setWithFrame] = useState(false);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState<{ questions: string[]; notes: string; usage?: AiUsage } | null>(null);
  const mass = useMemo(() => panelMass(withFrame ? p : { ...p, frame: undefined }), [p, withFrame]);
  const setLayer = (k: number, patch: Partial<PanelLayer>) => setP({ ...p, layers: p.layers.map((l, j) => (j === k ? { ...l, ...patch, source: patch.source ?? (patch.density !== undefined ? { check: 'user' } : l.source) } : l)) });
  const num = (v: string) => {
    const x = parseFloat(v.replace(',', '.'));
    return Number.isFinite(x) ? x : 0;
  };
  const search = async () => {
    setBusy('Recherche sur internet…');
    setError('');
    try {
      const r = await vem.aiMaterial({ description: desc || p.name, studyId: studyId ?? null });
      const next = panelFromSearch(r, p.frame ?? { width: 1000, height: 2790 });
      setP(next);
      setWithFrame(!!next.frame);
      setInfo({ questions: r.questions, notes: r.notes, usage: r.usage });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  };
  return (
    <div className="card" style={{ background: 'var(--bg-2)' }}>
      <div className="card-head">
        <h3>Panneau composé</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {saved.length > 0 && (
          <label className="row hint">
            Panneau de la bibliothèque
            <select
              value=""
              onChange={(e) => {
                const s = saved.find((x) => x.key === e.target.value);
                if (s) {
                  setP(s.panel);
                  setWithFrame(!!s.panel.frame);
                }
              }}
            >
              <option value="">— choisir —</option>
              {saved.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                  {s.status === 'suggested' ? ' (à vérifier)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="row hint">
          Nom <input type="text" style={{ flex: 1 }} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="ex. Panneau mural alu 45 mm" />
        </label>
        {ai?.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Décrire le panneau pour chercher ses données sur internet, ex. : profilés aluminium 45 mm creux autour d’un panneau Nidaplast 45 mm, parement VEKA 2 mm collé dessus"
            />
            <div className="row">
              <button className="btn small" disabled={!!busy || !(desc || p.name)} onClick={() => void search()}>
                🔎 Chercher les données sur internet (IA)
              </button>
              <AiUsageNote usage={info?.usage} />
            </div>
          </div>
        )}
        <table className="list">
          <thead>
            <tr>
              <th>Couche</th>
              <th className="num">Épaisseur (mm)</th>
              <th className="num">Masse volumique (kg/m³)</th>
              <th className="num">kg/m²</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {p.layers.map((l, k) => (
              <tr key={k}>
                <td>
                  <input type="text" value={l.name} onChange={(e) => setLayer(k, { name: e.target.value })} style={{ width: '100%' }} />
                  <SourceBadge layer={l} />
                </td>
                <td className="num">
                  <input type="text" inputMode="decimal" style={{ width: 70 }} value={l.thickness || ''} onChange={(e) => setLayer(k, { thickness: num(e.target.value) })} />
                </td>
                <td className="num">
                  <input type="text" inputMode="decimal" style={{ width: 80 }} value={l.density || ''} onChange={(e) => setLayer(k, { density: num(e.target.value) })} />
                </td>
                <td className="num">{fmtNumber((l.thickness / 1000) * l.density, 2)}</td>
                <td>
                  <button className="btn small ghost" onClick={() => setP({ ...p, layers: p.layers.filter((_, j) => j !== k) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button className="btn small" onClick={() => setP({ ...p, layers: [...p.layers, { name: '', thickness: 0, density: 0 }] })}>
            + Couche
          </button>
          <label className="row hint">
            <input type="checkbox" checked={withFrame} onChange={(e) => setWithFrame(e.target.checked)} /> cadre de profilés autour du panneau
          </label>
        </div>
        {withFrame && (
          <div className="row hint" style={{ flexWrap: 'wrap' }}>
            <input type="text" style={{ width: 170 }} placeholder="profilé" value={p.frame?.name ?? ''} onChange={(e) => setP({ ...p, frame: { ...(p.frame ?? { kgPerM: 0, width: 1000, height: 2790, name: '' }), name: e.target.value } })} />
            <input
              type="text"
              inputMode="decimal"
              style={{ width: 70 }}
              value={p.frame?.kgPerM || ''}
              onChange={(e) => setP({ ...p, frame: { ...(p.frame ?? { name: '', width: 1000, height: 2790, kgPerM: 0 }), kgPerM: num(e.target.value), source: { check: 'user' } } })}
            />{' '}
            kg/m, module de panneau
            <input type="text" inputMode="decimal" style={{ width: 60 }} value={p.frame?.width ?? 1000} onChange={(e) => setP({ ...p, frame: { ...(p.frame ?? { name: '', kgPerM: 0, height: 2790, width: 0 }), width: num(e.target.value) } })} /> ×
            <input type="text" inputMode="decimal" style={{ width: 60 }} value={p.frame?.height ?? 2790} onChange={(e) => setP({ ...p, frame: { ...(p.frame ?? { name: '', kgPerM: 0, width: 1000, height: 0 }), height: num(e.target.value) } })} /> mm
            {p.frame && <SourceBadge layer={{ source: p.frame.source }} />}
          </div>
        )}
        {info && (info.questions.length > 0 || info.notes) && (
          <div className="hint">
            {info.notes}
            {info.questions.map((q, k) => (
              <div key={k}>❓ {q}</div>
            ))}
          </div>
        )}
        <div className="hint">{mass.record.withValues}</div>
        {error && <div className="error-box">{error}</div>}
        {busy && <div className="hint">{busy}</div>}
        <div className="row">
          <button className="btn small primary" disabled={!(mass.kgPerM2 > 0)} onClick={() => onUse(Math.round(mass.kgPerM2 * 10) / 10, withFrame ? p : { ...p, frame: undefined })}>
            Utiliser ce poids ({fmtNumber(mass.kgPerM2, 1)} kg/m²)
          </button>
          {onSave && canEditLibrary && (
            <button
              className="btn small"
              disabled={!p.name || !(mass.kgPerM2 > 0) || !!busy}
              onClick={async () => {
                setBusy('Enregistrement…');
                try {
                  await onSave(withFrame ? p : { ...p, frame: undefined });
                } catch (e) {
                  setError((e as Error).message);
                }
                setBusy('');
              }}
            >
              Mémoriser le panneau
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const SEVERITY: Record<AiAlert['severity'], { label: string; cls: string }> = {
  info: { label: 'INFO', cls: 'warning' },
  warning: { label: 'ATTENTION', cls: 'warning' },
  error: { label: 'À VÉRIFIER', cls: 'error' },
};

/** Relecture de cohérence d'une étude par l'IA : alertes affichées, le calcul ne change pas. */
export function AiReviewCard({ ai, facts, studyId }: { ai: AiState | null; facts: () => Record<string, unknown>; studyId?: string | null }) {
  const [alerts, setAlerts] = useState<AiAlert[] | null>(null);
  const [dropped, setDropped] = useState(0);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!ai?.enabled) return null;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Relecture par l’IA</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <AiUsageNote usage={usage} />
        <button
          className="btn small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const r = await vem.aiReview({ facts: facts(), studyId: studyId ?? null });
              setAlerts(r.alerts);
              setDropped(r.dropped);
              setUsage(r.usage);
            } catch (e) {
              setError((e as Error).message);
            }
            setBusy(false);
          }}
        >
          {busy ? 'Relecture…' : alerts ? '↻ Relire' : '🤖 Relire la cohérence'}
        </button>
      </div>
      <div className="card-body warnings">
        {!alerts && !error && <div className="hint">L’IA relit les données et les résultats comme un ingénieur (poids, liaisons, charges oubliées…). Ses remarques sont à vérifier ; elles ne changent pas le calcul.</div>}
        {error && <div className="error-box">{error}</div>}
        {alerts && !alerts.length && <div className="hint">Aucune incohérence relevée.</div>}
        {alerts?.map((a, k) => (
          <div key={k} className={`warning ${SEVERITY[a.severity].cls}`}>
            <span className="sev">{SEVERITY[a.severity].label}</span>
            <span className="msg">
              {a.message}
              {a.elements.length ? <span className="hint"> ({a.elements.join(', ')})</span> : null}
            </span>
          </div>
        ))}
        {dropped > 0 && <div className="hint">{dropped} remarque(s) écartée(s) : elles citaient des chiffres absents du calcul.</div>}
      </div>
    </div>
  );
}
