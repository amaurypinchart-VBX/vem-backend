// Onglet « Toiture » : plan de contrôle de l'étanchéité de toiture. L'outil trouve sur chaque toit les points à
// contrôler (jonctions, croisements, extrémités, angles, raccords d'étage — core/roofCheck/detect.ts), les montre
// niveau par niveau et les publie dans VEM, où le site manager les remplit un par un avec une photo
// (projet › Daily Reports › check-list de montage › « 💧 Plan de toiture »). Une nouvelle publication garde le statut
// et les photos des points déjà contrôlés (même clé) ; les points qui n'existent plus sont archivés, jamais supprimés.
import { useEffect, useMemo, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import type { ModelVersion, RoofCheckView } from '../../api/vem';
import { PROJECT_ID, vem } from '../../api/vem';
import type { ModuleLabels } from '../../core/moduleNumbers';
import type { RoofDetection, RoofLevel, RoofPoint, RoofPointType } from '../../core/roofCheck/detect';
import { ROOF_ENGINE, ROOF_TYPE_LABELS, countByType, detectRoofPoints, roofBoxes } from '../../core/roofCheck/detect';

interface Props {
  scene: LoadedScene;
  model?: ModelVersion;
  moduleLabels: ModuleLabels;
  framesVersion: number;
  active: boolean;
}

/** Couleur d'un point : statut dans VEM s'il est publié, sinon son type. */
export const STATUS_COLORS: Record<string, string> = {
  pending: '#64748b', ok: '#16a34a', partial: '#f59e0b', nok: '#dc2626', na: '#94a3b8',
};
export const TYPE_COLORS: Record<RoofPointType, string> = {
  'seam-long': '#2563eb', 'seam-short': '#0891b2', cross: '#7c3aed', tee: '#9333ea', end: '#db2777', 'outer-corner': '#ea580c', step: '#0d9488',
};
const STATUS_LABELS: Record<string, string> = { pending: 'à faire', ok: 'OK', partial: 'partiel', nok: 'non fait', na: 'N.A.' };
const TYPES: RoofPointType[] = ['seam-long', 'seam-short', 'cross', 'tee', 'end', 'outer-corner', 'step'];

export function RoofCheckPage({ scene, model, moduleLabels, framesVersion, active }: Props) {
  const [level, setLevel] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [remote, setRemote] = useState<RoofCheckView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const detection: RoofDetection = useMemo(() => {
    const labels: Record<number, string> = {};
    for (const l of scene.index.levels) labels[l.level] = l.label;
    return detectRoofPoints(roofBoxes(scene.index.modules, scene.frames, moduleLabels), labels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, moduleLabels, framesVersion]);

  const reload = () => {
    if (!PROJECT_ID) return;
    vem.roofCheck(PROJECT_ID).then(setRemote).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    if (active) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const levels = detection.levels;
  const lvl = levels.find((l) => l.level === level) ?? levels[0];
  const pts = detection.points.filter((p) => p.level === lvl?.level);
  const byKey = useMemo(() => new Map((remote?.points ?? []).map((p) => [p.key, p])), [remote]);
  const published = !!remote?.roofCheck?.publishedAt;
  const fresh = detection.points.filter((p) => !byKey.has(p.key)).length;
  const keys = new Set(detection.points.map((p) => p.key));
  const gone = (remote?.points ?? []).filter((p) => p.source !== 'field' && !keys.has(p.key)).length;
  const counts = countByType(detection.points);
  const sel = detection.points.find((p) => p.key === selected) ?? null;

  const publish = async () => {
    if (!PROJECT_ID) return;
    const withStatus = (remote?.points ?? []).filter((p) => !keys.has(p.key) && p.source !== 'field' && (p.status !== 'pending' || p.photos.length));
    if (withStatus.length && !confirm(`${withStatus.length} point(s) déjà contrôlé(s) dans VEM n'existent plus sur ce modèle : ils seront archivés (photos et statut gardés).\n\nPublier quand même ?`)) return;
    setBusy(true);
    setError('');
    setDone('');
    try {
      const view = await vem.publishRoofCheck(PROJECT_ID, {
        modelVersionId: model?.id ?? null,
        sha256: scene.index.source.sha256,
        engineVersion: ROOF_ENGINE,
        expectedRevision: remote?.roofCheck?.revision ?? 0,
        levels: detection.levels,
        points: detection.points.map(({ key, code, type, level: l, modules, at, seg, lengthMm, label, hint, covered, order }) => ({
          key, code, type, level: l, modules, at, seg, lengthMm, label, hint, covered, order,
        })),
      });
      setRemote(view);
      setDone(`Plan de toiture publié dans VEM (${detection.points.length} points). Le site manager le remplit dans le projet › Daily Reports › check-list de montage › « 💧 Plan de toiture ».`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!detection.points.length && !levels.length)
    return (
      <div className="page">
        <div className="card">
          <div className="card-body">Aucune Viewbox trouvée dans ce modèle : pas de toiture à contrôler.</div>
        </div>
      </div>
    );

  return (
    <div className="page" data-testid="roof-page">
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2>💧 Plan de contrôle de l’étanchéité de toiture</h2>
          <div style={{ flex: 1 }} />
          {remote?.perms.canPublish ? (
            <button className="btn primary" disabled={busy || !PROJECT_ID} onClick={publish} data-testid="roof-publish">
              {busy ? 'Publication…' : published ? '📤 Republier dans VEM' : '📤 Publier dans VEM'}
            </button>
          ) : (
            remote && <span className="hint">Publication réservée aux admins, technical managers et project managers.</span>
          )}
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          <div className="hint" style={{ lineHeight: 1.6 }}>
            Chaque jonction, croisement, extrémité, angle de toiture et raccord d’étage devient un point à contrôler. Dans VEM, le site manager touche un point sur ce
            plan, prend la photo et le valide : le client voit ensuite dans le handover et le PDF de la check-list que toute l’étanchéité a été faite.
          </div>
          {error && <div className="error-box">{error}</div>}
          {done && <div style={{ border: '1px solid var(--ok)', color: 'var(--ok)', padding: '10px 14px', borderRadius: 8 }} data-testid="roof-done">{done}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TYPES.filter((t) => counts[t]).map((t) => (
              <span key={t} className="chip" style={{ borderColor: TYPE_COLORS[t] }}>
                <span style={{ color: TYPE_COLORS[t] }}>●</span> {ROOF_TYPE_LABELS[t]} : {counts[t]}
              </span>
            ))}
            <span className="chip">
              <b>{detection.points.length}</b>&nbsp;points
            </span>
          </div>
          <div className="hint" data-testid="roof-state">
            {published
              ? `Dans VEM : publication n° ${remote!.roofCheck!.revision} du ${new Date(remote!.roofCheck!.publishedAt!).toLocaleDateString('fr-BE')}` +
                (remote!.summary ? ` — ${remote!.summary.closed}/${remote!.summary.total} points contrôlés` : '') +
                (fresh || gone ? ` · ce modèle : ${fresh} nouveau(x) point(s), ${gone} point(s) qui n’existent plus` : ' · à jour avec ce modèle')
              : remote
                ? 'Pas encore publié dans VEM.'
                : PROJECT_ID
                  ? 'Lecture de l’état dans VEM…'
                  : 'Ouvert hors d’un projet VEM : publication impossible.'}
          </div>
          {detection.warnings.map((w) => (
            <div key={w} className="hint" style={{ color: 'var(--warn)' }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <nav className="tabs">
            {levels.map((l) => (
              <button key={l.level} className={`tab ${l.level === lvl?.level ? 'active' : ''}`} onClick={() => setLevel(l.level)}>
                {l.label} ({detection.points.filter((p) => p.level === l.level).length})
              </button>
            ))}
          </nav>
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 14 }}>
          {lvl && (
            <RoofPlanSvg
              level={lvl}
              points={pts}
              colorOf={(p) => (byKey.get(p.key) ? STATUS_COLORS[byKey.get(p.key)!.status] ?? STATUS_COLORS.pending : TYPE_COLORS[p.type])}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {sel && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 10 }} data-testid="roof-selected">
                <b>{sel.code}</b> — {sel.label}
                <div className="hint">
                  {ROOF_TYPE_LABELS[sel.type]}
                  {sel.covered ? ' · sous l’étage du dessus : à contrôler avant de le poser' : ''}
                  {byKey.get(sel.key) ? ` · dans VEM : ${STATUS_LABELS[byKey.get(sel.key)!.status] ?? byKey.get(sel.key)!.status}` : published ? ' · nouveau (pas encore dans VEM)' : ''}
                </div>
              </div>
            )}
            <table className="list">
              <tbody>
                {pts.map((p) => {
                  const r = byKey.get(p.key);
                  return (
                    <tr key={p.key} onClick={() => setSelected(p.key)} style={{ cursor: 'pointer', background: p.key === selected ? 'rgba(230,57,70,.12)' : undefined }}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ color: r ? STATUS_COLORS[r.status] : TYPE_COLORS[p.type] }}>●</span> {p.code.replace(/^N\d+-/, '')}
                      </td>
                      <td>
                        {p.label}
                        {p.covered && <span className="hint"> · sous l’étage</span>}
                      </td>
                      <td className="hint" style={{ whiteSpace: 'nowrap' }}>{r ? STATUS_LABELS[r.status] ?? r.status : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Schéma d'un niveau : box (étage du dessus en pointillés), jonctions et pastilles numérotées. Même dessin que dans VEM. */
export function RoofPlanSvg({
  level,
  points,
  colorOf,
  selected,
  onSelect,
}: {
  level: RoofLevel;
  points: RoofPoint[];
  colorOf: (p: RoofPoint) => string;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const all = [...level.boxes, ...level.above].flatMap((b) => b.c);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minZ = Math.min(...all.map((p) => p[1])), maxZ = Math.max(...all.map((p) => p[1]));
  const pad = 900;
  const w = maxX - minX + 2 * pad, h = maxZ - minZ + 2 * pad;
  const tx = (p: [number, number]) => `${p[0] - minX + pad},${p[1] - minZ + pad}`;
  const r = Math.max(180, Math.min(320, Math.max(w, h) / 60));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxHeight: 560, background: '#fff', border: '1px solid var(--border)', borderRadius: 6 }} data-testid="roof-plan">
      {level.boxes.map((b) => {
        const c = b.c.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]) as [number, number];
        return (
          <g key={b.id}>
            <polygon points={b.c.map(tx).join(' ')} fill="#e2e8f0" stroke="#334155" strokeWidth={25} />
            <text x={c[0] - minX + pad} y={c[1] - minZ + pad} fontSize={340} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontFamily="Arimo, Arial, sans-serif">
              {b.label}
            </text>
          </g>
        );
      })}
      {level.above.map((b) => (
        <polygon key={`u-${b.id}`} points={b.c.map(tx).join(' ')} fill="#94a3b8" fillOpacity={0.18} stroke="#475569" strokeWidth={30} strokeDasharray="160 110" />
      ))}
      {points.map((p) =>
        p.seg ? (
          <line
            key={`s-${p.key}`}
            x1={p.seg.a[0] - minX + pad}
            y1={p.seg.a[1] - minZ + pad}
            x2={p.seg.b[0] - minX + pad}
            y2={p.seg.b[1] - minZ + pad}
            stroke={colorOf(p)}
            strokeWidth={p.key === selected ? 150 : 90}
            strokeLinecap="round"
            opacity={0.85}
          />
        ) : null,
      )}
      {points.map((p) => {
        const x = p.at.x - minX + pad, y = p.at.z - minZ + pad;
        return (
          <g key={p.key} style={{ cursor: 'pointer' }} onClick={() => onSelect(p.key)}>
            <circle cx={x} cy={y} r={p.key === selected ? r * 1.35 : r} fill={colorOf(p)} stroke={p.covered ? '#0f172a' : '#fff'} strokeWidth={p.covered ? 50 : 40} strokeDasharray={p.covered ? '70 50' : undefined} />
            <text x={x} y={y} fontSize={r * 0.9} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight={700} fontFamily="Arimo, Arial, sans-serif">
              {p.code.replace(/^N\d+-/, '')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
