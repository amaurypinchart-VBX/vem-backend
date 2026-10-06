// Étape 3 : angles de Viewbox du dessus posés dans le vide (ni angle ni rive de Viewbox, ni poutre dessous). Plan de
// l'installation (où ça coince), appui proposé pour chaque angle (poteau jusqu'au sol ou poutre de reprise sur la
// toiture du dessous), ajout + dimensionnement par le calcul, appuis déjà ajoutés par l'étude (retirables).
import type { CornerSupport, ModelMember, PlacedModule, UnsupportedCorner } from '../../structure/core/assemble';
import type { Vec3 } from '../../structure/core/fem/types';
import { fmtNumber } from '../../structure/core/units';

export interface SupportsCardProps {
  modules: PlacedModule[];
  members: ModelMember[];
  unsupported: UnsupportedCorner[];
  /** appuis déjà ajoutés par l'étude, avec leur pire taux du dernier calcul (si à jour) */
  added: Array<CornerSupport & { eta?: number; sectionName: string }>;
  sizing: { running: boolean; steps: string[] } | null;
  canEdit: boolean;
  onAddAndSize: () => void;
  onRemove: (s: CornerSupport | null) => void;
}

const n = (v: number, d = 2) => fmtNumber(v, d);

function cornerOf(pm: PlacedModule, c: number): Vec3 {
  const { x0, x1, y0, y1 } = pm.params;
  const [u, v] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ][c];
  return [pm.origin[0] + pm.u[0] * u + pm.v[0] * v, pm.origin[1], pm.origin[2] + pm.u[2] * u + pm.v[2] * v];
}

/** Poutre de reprise en plan : de rive à rive de la Viewbox du dessous, passant sous l'angle. */
function transferLine(over: PlacedModule, p: Vec3): [Vec3, Vec3] {
  const d: Vec3 = [p[0] - over.origin[0], 0, p[2] - over.origin[2]];
  const u = d[0] * over.u[0] + d[2] * over.u[2];
  const at = (v: number): Vec3 => [over.origin[0] + over.u[0] * u + over.v[0] * v, 0, over.origin[2] + over.u[2] * u + over.v[2] * v];
  return [at(over.params.y0), at(over.params.y1)];
}

export function SupportsCard(p: SupportsCardProps) {
  if (!p.unsupported.length && !p.added.length) return null;
  const byId = new Map(p.modules.map((m) => [m.id, m]));
  // emprise du plan (mm, monde : x vers la droite, z vers le bas = Y SketchUp vers le haut)
  const pts = p.modules.flatMap((m) => [0, 1, 2, 3].map((c) => cornerOf(m, c)));
  for (const mm of p.members) pts.push(mm.a, mm.b);
  const xs = pts.map((q) => q[0]);
  const zs = pts.map((q) => q[2]);
  const pad = 800;
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad];
  const W = maxX - minX;
  const H = maxZ - minZ;
  const levels = [...new Set(p.modules.map((m) => m.level))].sort((a, b) => a - b);
  const levelColor = (l: number) => ['#94a3b8', '#3b82f6', '#8b5cf6', '#ec4899'][Math.min(l, 3)];
  const fs = Math.max(W, H) / 45;
  const supportAt = (s: { module: string; corner: number }) => {
    const U = byId.get(s.module);
    return U ? cornerOf(U, s.corner) : null;
  };
  return (
    <div className="card" style={{ marginBottom: 12, borderColor: p.unsupported.length ? 'var(--red, #dc2626)' : undefined }}>
      <div className="card-head">
        <h3>{p.unsupported.length ? `Appuis manquants — ${p.unsupported.length} angle(s) de Viewbox posé(s) dans le vide` : 'Appuis ajoutés par l’étude'}</h3>
      </div>
      <div className="card-body" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <svg viewBox={`${minX} ${minZ} ${W} ${H}`} style={{ width: 420, maxWidth: '100%', height: 'auto', background: 'var(--bg-soft, rgba(127,127,127,0.06))', borderRadius: 6 }}>
          {levels.map((l) =>
            p.modules
              .filter((m) => m.level === l)
              .map((m) => {
                const c = [0, 1, 2, 3].map((k) => cornerOf(m, k));
                const mid = c.reduce<[number, number]>((a, q) => [a[0] + q[0] / 4, a[1] + q[2] / 4], [0, 0]);
                return (
                  <g key={m.id}>
                    <polygon
                      points={c.map((q) => `${q[0]},${q[2]}`).join(' ')}
                      fill={l === 0 ? 'rgba(148,163,184,0.25)' : 'none'}
                      stroke={levelColor(l)}
                      strokeWidth={fs / 6}
                      strokeDasharray={l === 0 ? undefined : `${fs / 2} ${fs / 3}`}
                    />
                    <text x={mid[0]} y={mid[1] + (l === 0 ? fs * 0.4 : -fs * 0.6)} fontSize={fs} textAnchor="middle" fill={levelColor(l)}>
                      {m.id}
                    </text>
                  </g>
                );
              }),
          )}
          {p.members.map((mm) => (
            <line key={mm.id} x1={mm.a[0]} y1={mm.a[2]} x2={mm.b[0]} y2={mm.b[2]} stroke="#92400e" strokeWidth={fs / 2.5} strokeLinecap="round">
              <title>{`${mm.id} « ${mm.label} » (${mm.section})`}</title>
            </line>
          ))}
          {p.added.map((s) => {
            const q = supportAt(s);
            if (!q) return null;
            const over = s.kind === 'transfer' ? p.modules.find((m) => m.id !== s.module && m.origin[1] < byId.get(s.module)!.origin[1] && inside(m, q)) : undefined;
            const line = over ? transferLine(over, q) : null;
            return (
              <g key={`a${s.module}${s.corner}`}>
                {line ? <line x1={line[0][0]} y1={line[0][2]} x2={line[1][0]} y2={line[1][2]} stroke="#16a34a" strokeWidth={fs / 2.5} /> : <rect x={q[0] - fs / 2} y={q[2] - fs / 2} width={fs} height={fs} fill="#16a34a" />}
              </g>
            );
          })}
          {p.unsupported.map((u) => {
            const over = u.over ? byId.get(u.over) : undefined;
            const line = over ? transferLine(over, u.position) : null;
            return (
              <g key={`u${u.module}${u.corner}`}>
                {line ? (
                  <line x1={line[0][0]} y1={line[0][2]} x2={line[1][0]} y2={line[1][2]} stroke="#f97316" strokeWidth={fs / 3} strokeDasharray={`${fs / 2} ${fs / 4}`} />
                ) : (
                  <rect x={u.position[0] - fs / 2} y={u.position[2] - fs / 2} width={fs} height={fs} fill="none" stroke="#f97316" strokeWidth={fs / 5} />
                )}
                <circle cx={u.position[0]} cy={u.position[2]} r={fs * 0.45} fill="#dc2626" />
                <text x={u.position[0] + fs * 0.6} y={u.position[2] - fs * 0.5} fontSize={fs * 0.85} fill="#dc2626">
                  {u.module}·{u.corner + 1}
                </text>
              </g>
            );
          })}
        </svg>
        <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.unsupported.length > 0 && (
            <>
              <div className="hint">
                Un angle de Viewbox du dessus doit porter sur quelque chose : un angle ou une rive de toiture d’une Viewbox du dessous, une poutre ou un poteau dessiné dans le modèle. Ces angles-ci ne portent sur
                rien (● rouge sur le plan) : le calcul ne peut pas être lancé. Pour chacun, l’outil propose l’appui le plus simple (en orange : □ poteau jusqu’au sol, ┅ poutre de reprise posée de rive à rive
                sur la toiture de la Viewbox du dessous) :
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {p.unsupported.map((u) => (
                  <li key={`${u.module}${u.corner}`}>{u.text}</li>
                ))}
              </ul>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn small primary" disabled={p.sizing?.running || !p.canEdit} onClick={p.onAddAndSize}>
                  ＋ Ajouter les appuis proposés et les dimensionner
                </button>
                <span className="hint">Le calcul complet choisit le profil (du gabarit Viewbox, puis plus fort du catalogue si η &gt; 1).</span>
              </div>
              <div className="hint">
                Ou dans SketchUp : dessiner la poutre ou le poteau réel (à l’étape 1, pièce porteuse « Poutre » / « Poteau » avec sa section : il est alors calculé), ou déplacer la Viewbox pour poser ses angles sur
                ceux de la Viewbox du dessous.
              </div>
            </>
          )}
          {p.sizing && (
            <div className="hint" style={{ borderLeft: '3px solid var(--orange, #f97316)', paddingLeft: 8 }}>
              {p.sizing.steps.map((s, k) => (
                <div key={k}>{s}</div>
              ))}
              {p.sizing.running && <div>…</div>}
            </div>
          )}
          {p.added.length > 0 && (
            <div>
              <b>Appuis ajoutés par l’étude</b> (■ vert sur le plan) :
              <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                {p.added.map((s) => (
                  <li key={`${s.module}${s.corner}`}>
                    {s.kind === 'post' ? 'Poteau d’appui' : 'Poutre de reprise'} {s.sectionName} sous {s.module} angle {s.corner + 1}
                    {s.eta !== undefined && Number.isFinite(s.eta) && (
                      <span style={{ color: s.eta > 1 ? 'var(--red, #dc2626)' : s.eta > 0.9 ? 'var(--orange, #f97316)' : 'var(--green, #16a34a)' }}> — η {n(s.eta)}</span>
                    )}{' '}
                    {p.canEdit && (
                      <button className="btn small ghost" onClick={() => p.onRemove(s)}>
                        Retirer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {p.canEdit && p.added.length > 1 && (
                <button className="btn small ghost" onClick={() => p.onRemove(null)}>
                  Tout retirer
                </button>
              )}
              <div className="hint">Pied du poteau articulé sur une platine 15 × 15 cm (à confirmer) et calé comme un pied d’escalier (type R au calage) ; attaches sous l’angle à détailler.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function inside(pm: PlacedModule, p: Vec3): boolean {
  const d: Vec3 = [p[0] - pm.origin[0], 0, p[2] - pm.origin[2]];
  const u = d[0] * pm.u[0] + d[2] * pm.u[2];
  const v = d[0] * pm.v[0] + d[2] * pm.v[2];
  return u > pm.params.x0 && u < pm.params.x1 && v > pm.params.y0 && v < pm.params.y1;
}
