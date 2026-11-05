// « 🧱 Côtés extérieurs » (outil Peinture des planches) : peint d'un coup les côtés des Viewbox qu'on voit de dehors,
// jamais un côté collé à une autre box. Plan de l'installation (côtés extérieurs dans la couleur, collés en gris),
// choix de la couleur, des Viewbox, grands / petits côtés et des éléments peints (surfaces vues de dehors). Une seule
// zone par couleur (règle recalculée sur le modèle) : repères P1… sur les vues de chaque Viewbox, légende, m², Excel.
import { useEffect, useMemo, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import type { PaintContext } from '../../core/paint/resolve';
import type { PaintSettings } from '../../core/paint/types';
import type { ExteriorRule } from '../../core/paint/exterior';
import { defaultExclude, sideText } from '../../core/paint/exterior';
import { colorCode } from '../../core/paint/ops';
import type { GlassTest } from '../../linework/packets';
import type { ExteriorSurvey } from '../../linework/paintExterior';
import { exteriorAreas, prepareExteriorSurvey } from '../../linework/paintExterior';

const m2 = (v: number) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

export function ExteriorDialog({
  scene,
  ctx,
  glassTest,
  paint,
  activeColor,
  categoryLabel,
  onNewColor,
  onApply,
  onClose,
}: {
  scene: LoadedScene;
  ctx: PaintContext;
  glassTest: GlassTest;
  paint: PaintSettings;
  activeColor: string | null;
  categoryLabel: (key: string) => string;
  onNewColor: () => void;
  /** `replaceZone` = zone « côtés extérieurs » de cette couleur déjà là : elle est remplacée */
  onApply: (rule: ExteriorRule, colorId: string, replaceZone?: string) => void;
  onClose: () => void;
}) {
  const [survey, setSurvey] = useState<ExteriorSurvey | null>(null);
  const [error, setError] = useState('');
  // relevé des faces extérieures (une fois par modèle) : après l'affichage du dialogue, la page ne se fige pas sans rien
  useEffect(() => {
    let alive = true;
    // par tranches : la page reste utilisable pendant le relevé d'un très gros modèle
    prepareExteriorSurvey(scene, ctx, glassTest)
      .then((sv) => alive && setSurvey(sv))
      .catch((e) => {
        console.error('Côtés extérieurs', e);
        if (alive) setError((e as Error).message || String(e));
      });
    return () => {
      alive = false;
    };
  }, [scene, ctx, glassTest]);
  const [colorId, setColorId] = useState<string | null>(activeColor);
  // une couleur créée depuis ce dialogue devient la couleur active : on la prend
  useEffect(() => {
    if (activeColor) setColorId(activeColor);
  }, [activeColor]);
  const color = paint.colors.find((c) => c.id === colorId) ?? null;
  const modules = useMemo(() => [...scene.frames.keys()].sort(), [scene]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(modules));
  const [sides, setSides] = useState<Set<'long' | 'short'>>(new Set(['long', 'short']));
  const all = picked.size === modules.length;
  const scope = { modules: all ? undefined : [...picked].sort(), sides: [...sides] };
  const areas = useMemo(() => (survey ? exteriorAreas(survey, scope) : null), [survey, all, [...picked].join(), [...sides].join()]); // eslint-disable-line react-hooks/exhaustive-deps
  // catégories présentes sur toutes les faces extérieures (stable quand on coche / décoche des Viewbox)
  const categories = useMemo(() => (survey ? [...exteriorAreas(survey, { sides: ['long', 'short'] }).byCategory.keys()].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))) : []), [survey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [exclude, setExclude] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (survey && !exclude) setExclude(new Set(defaultExclude(categories)));
  }, [survey, categories, exclude]);
  const [glass, setGlass] = useState(false);
  const ex = exclude ?? new Set<string>();
  const total = areas ? [...areas.byCategory].reduce((s, [c, a]) => s + (ex.has(c) ? 0 : a), 0) + (glass ? areas.glass : 0) : 0;
  const existing = color ? paint.zones.find((z) => z.colorId === color.id && z.target.scope === 'exterior') : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const toggle = <T,>(set: Set<T>, v: T, on: boolean) => {
    const n = new Set(set);
    if (on) n.add(v);
    else n.delete(v);
    return n;
  };
  const apply = () => {
    if (!color || !survey || !sides.size || !picked.size) return;
    const rule: ExteriorRule = { ...(all ? {} : { modules: [...picked].sort() }), sides: (['long', 'short'] as const).filter((s) => sides.has(s)), exclude: [...ex].sort(), ...(glass ? { glass: true } : {}) };
    onApply(rule, color.id, existing?.id);
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal exterior-dialog" role="dialog" aria-label="Côtés extérieurs" data-testid="exterior-dialog">
        <div className="card-head">
          <h2>🧱 Peindre les côtés extérieurs des Viewbox</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="modal-body exterior-body">
          <div className="hint">
            Tous les côtés qu’on voit de dehors, d’un coup. Un côté collé à une autre box (≤ 50 mm, même en partie) n’est pas peint ; sur un côté extérieur, seules les faces vues de l’extérieur le sont. La zone suit le modèle :
            une nouvelle version ou une box ajoutée est reprise automatiquement.
          </div>
          {error && <div className="error-box">Analyse impossible : {error}</div>}
          <div className="exterior-grid">
            <div>
              <div className="prop-title">Couleur</div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {paint.colors.map((c) => (
                  <button key={c.id} className={`paint-swatch${c.id === colorId ? ' on' : ''}`} onClick={() => setColorId(c.id)} data-testid={`exterior-color-${c.tag}`}>
                    <i style={{ background: c.hex }} />
                    <span>
                      <b>{c.tag}</b> {colorCode(c) || c.name}
                    </span>
                  </button>
                ))}
                <button className="btn small" onClick={onNewColor} data-testid="exterior-new-color">
                  ＋ Couleur (RAL…)
                </button>
              </div>
              {!paint.colors.length && <div className="hint">Choisis d’abord la couleur : « ＋ Couleur (RAL…) ».</div>}

              <div className="prop-title" style={{ marginTop: 10 }}>
                Côtés
              </div>
              <label className="check">
                <input type="checkbox" checked={sides.has('long')} onChange={(e) => setSides(toggle(sides, 'long', e.target.checked))} /> Grands côtés
              </label>{' '}
              <label className="check">
                <input type="checkbox" checked={sides.has('short')} onChange={(e) => setSides(toggle(sides, 'short', e.target.checked))} /> Petits côtés
              </label>

              <div className="prop-title" style={{ marginTop: 10 }}>
                Viewbox
              </div>
              <label className="check">
                <input type="checkbox" checked={all} onChange={(e) => setPicked(e.target.checked ? new Set(modules) : new Set())} /> Toutes ({modules.length}) — y compris celles ajoutées plus tard
              </label>
              <div className="exterior-modules">
                {modules.map((m) => (
                  <label key={m} className="check">
                    <input type="checkbox" checked={picked.has(m)} onChange={(e) => setPicked(toggle(picked, m, e.target.checked))} /> {m}
                  </label>
                ))}
              </div>

              <div className="prop-title" style={{ marginTop: 10 }}>
                Éléments peints <span className="hint">(surface vue de dehors)</span>
              </div>
              {!survey && !error && <div className="hint">Analyse des côtés…</div>}
              {survey && !categories.length && !areas?.glass && <div className="hint">Aucune face extérieure trouvée.</div>}
              <div className="exterior-cats" data-testid="exterior-cats">
                {categories.map((c) => (
                  <label key={c || '-'} className="check">
                    <input type="checkbox" checked={!ex.has(c)} onChange={(e) => setExclude(toggle(ex, c, !e.target.checked))} />
                    {categoryLabel(c)}
                    <span className="hint">{m2(areas?.byCategory.get(c) ?? 0)}</span>
                  </label>
                ))}
                {!!areas?.glass && (
                  <label className="check">
                    <input type="checkbox" checked={glass} onChange={(e) => setGlass(e.target.checked)} />
                    Vitrages (verre)
                    <span className="hint">{m2(areas.glass)}</span>
                  </label>
                )}
              </div>
            </div>
            <div>{survey && <ExteriorPlan survey={survey} picked={picked} sides={sides} hex={color?.hex ?? '#F97316'} />}</div>
          </div>
        </div>
        <div className="modal-foot">
          <span className="hint" data-testid="exterior-total">
            {survey ? `${m2(total)} peints${color ? ` en ${color.tag} · ${colorCode(color) || color.name}` : ''}` : ''}
            {existing ? ` — remplace la zone « côtés extérieurs » de ${color?.tag}` : ''}
          </span>
          <span className="spacer" />
          <button className="btn small" onClick={onClose}>
            Annuler
          </button>
          <button className="btn small primary" data-testid="exterior-ok" disabled={!survey || !color || !sides.size || !picked.size || total <= 0} onClick={apply}>
            🧱 Peindre les côtés extérieurs
          </button>
        </div>
      </div>
    </div>
  );
}

/** Plan de l'installation, un par niveau : chaque côté coloré s'il sera peint, gris s'il est collé à une autre box. */
function ExteriorPlan({ survey, picked, sides, hex }: { survey: ExteriorSurvey; picked: Set<string>; sides: Set<'long' | 'short'>; hex: string }) {
  const pts = survey.sides.flatMap((s) => s.corners.map((c) => [c[0], c[2]]));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(x1 - x0, y1 - y0) * 0.05 + 300;
  const vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`;
  const w = Math.max(x1 - x0, y1 - y0) / 110;
  // niveaux : bas des box regroupés à 500 mm près (box posées les unes sur les autres)
  const base = new Map<string, number>();
  for (const s of survey.sides) base.set(s.moduleId, Math.min(base.get(s.moduleId) ?? Infinity, s.v[0]));
  const levels: number[] = [];
  for (const v of [...base.values()].sort((a, b) => a - b)) if (!levels.length || v - levels[levels.length - 1] > 500) levels.push(v);
  const levelOf = (m: string) => levels.reduce((k, v, i) => (base.get(m)! >= v - 500 ? i : k), 0);
  return (
    <div className="exterior-plans">
      {levels.map((_, li) => {
        const boxes = [...new Set(survey.sides.map((s) => s.moduleId))].filter((m) => levelOf(m) === li);
        return (
          <div key={li}>
            {levels.length > 1 && <div className="prop-title">{li === 0 ? 'Niveau 0 (au sol)' : `Niveau ${li}`}</div>}
            <svg viewBox={vb} className="exterior-plan" data-testid="exterior-plan">
              {boxes.map((m) => {
                const ss = survey.sides.filter((s) => s.moduleId === m);
                const cs = ss.flatMap((s) => s.corners.slice(0, 2));
                const cx = cs.reduce((a, c) => a + c[0], 0) / cs.length;
                const cy = cs.reduce((a, c) => a + c[2], 0) / cs.length;
                const on = picked.has(m);
                const minDim = Math.min(...ss.map((s) => s.u[1] - s.u[0]));
                return (
                  <g key={m} opacity={on ? 1 : 0.35}>
                    {ss.map((s) => {
                      const [a, b] = s.corners;
                      const painted = on && sides.has(s.kind) && s.exposure !== 'interieur';
                      const title = `${m} — ${sideText(s)} : ${s.exposure === 'interieur' ? `collé à ${s.neighbours.join(', ')}, pas peint` : s.exposure === 'partiel' ? `collé en partie à ${s.neighbours.join(', ')} : seulement la partie libre` : 'extérieur'}`;
                      const dash = !painted || s.exposure === 'partiel' ? `${w * 3} ${w * 2}` : undefined;
                      return (
                        <g key={s.local}>
                          <title>{title}</title>
                          {painted && <line x1={a[0]} y1={a[2]} x2={b[0]} y2={b[2]} stroke="#111" strokeWidth={w * 2.4} strokeDasharray={dash} strokeLinecap="round" />}
                          <line x1={a[0]} y1={a[2]} x2={b[0]} y2={b[2]} stroke={painted ? hex : '#9aa3b2'} strokeWidth={painted ? w * 1.6 : w * 0.6} strokeDasharray={dash} strokeLinecap="round" />
                        </g>
                      );
                    })}
                    <text x={cx} y={cy} fontSize={Math.min(w * 3.6, minDim / 5)} textAnchor="middle" dominantBaseline="middle" fill="currentColor">
                      {m}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
      <div className="hint">
        <span style={{ color: hex, textShadow: '0 0 1px #000' }}>━</span> peint · <span style={{ color: '#9aa3b2' }}>╌</span> collé à une autre box (pas peint). Survole un côté pour le détail.
      </div>
    </div>
  );
}
