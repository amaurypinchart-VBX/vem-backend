// Saisie des niveaux du sol sous chaque pied (étape 5, vue « Niveaux du sol » du plan des appuis) : on clique un pied
// sur le plan (ou une ligne du tableau), on tape sa valeur en mm, Entrée passe au pied suivant (de bas en haut, de
// gauche à droite). Vide = pas de relevé. Le rattrapage (rehausse à apporter sous chaque pied), la sortie de vérin et
// les cales en plus sont calculés aussitôt et repris par le plan de calage A3 (plans 2D).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalageResult } from '../../structure/core/calage';
import type { EstimateModule, GroupReaction } from '../../structure/core/estimate';
import type { GroundLevel } from '../../structure/core/groundLevels';
import { formatLevel, levelAt, parseLevel, withLevel } from '../../structure/core/groundLevels';
import { planCoords, planOrigin, supportType } from '../../structure/core/roadway';
import { fmtNumber } from '../../structure/core/units';

/** Couleurs des pieds dans la vue « Niveaux du sol ». */
export const LEVEL_COLORS = { known: '#0e7490', ref: '#15803d', over: '#dc2626', unknown: '#9ca3af' };

/** Pieds dans l'ordre de saisie : rangée du bas d'abord, de gauche à droite. */
export function levelOrder(reactions: GroupReaction[], modules: EstimateModule[]): GroupReaction[] {
  const o = planOrigin(modules);
  const at = new Map(reactions.map((r) => [r.group.id, planCoords(r.group.position, o)]));
  return [...reactions].sort((a, b) => {
    const [ax, ay] = at.get(a.group.id)!;
    const [bx, by] = at.get(b.group.id)!;
    return Math.abs(ay - by) > 300 ? ay - by : ax - bx;
  });
}

/** Couleur et étiquette d'un pied dans la vue « Niveaux du sol ». */
export function levelPointStyle(result: CalageResult, levels: GroundLevel[] | undefined, r: GroupReaction): { color: string; sub: string } {
  const lv = levelAt(levels, r.group.position);
  if (lv === undefined) return { color: LEVEL_COLORS.unknown, sub: '—' };
  const row = result.levels?.rows.find((x) => x.id === r.group.id);
  const color = row?.shims ? LEVEL_COLORS.over : result.levels?.ref === lv ? LEVEL_COLORS.ref : LEVEL_COLORS.known;
  return { color, sub: `${formatLevel(lv)} mm${row?.makeUp ? ` · ↑${row.makeUp}` : ''}` };
}

export function GroundLevelsCard({
  result,
  modules,
  levels,
  onChange,
  selected,
  onSelect,
  jacks,
  onSendToPlans,
}: {
  result: CalageResult;
  modules: EstimateModule[];
  levels: GroundLevel[] | undefined;
  onChange: (levels: GroundLevel[]) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  jacks: boolean;
  onSendToPlans?: () => void;
}) {
  const order = useMemo(() => levelOrder(result.estimate.reactions, modules), [result, modules]);
  const sel = order.find((r) => r.group.id === selected) ?? null;
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const s = result.levels;

  // nouveau pied choisi : sa valeur dans le champ, prêt à taper
  useEffect(() => {
    if (!sel) return;
    const lv = levelAt(levels, sel.group.position);
    setText(lv === undefined ? '' : String(lv));
    setBad(false);
    requestAnimationFrame(() => input.current?.select());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.group.id]);

  const save = (r: GroupReaction, raw: string): boolean => {
    const v = parseLevel(raw);
    if (Number.isNaN(v)) {
      setBad(true);
      return false;
    }
    onChange(withLevel(levels, r.group.position, v));
    return true;
  };
  const step = (delta: 1 | -1) => {
    if (!sel) return;
    const i = order.findIndex((r) => r.group.id === sel.group.id);
    const next = order[(i + delta + order.length) % order.length];
    onSelect(next.group.id);
  };
  const o = planOrigin(modules);
  const known = s?.known ?? 0;
  const N = (v: number, d = 0) => fmtNumber(v, d);

  return (
    <div className="levels-card">
      <div className="stats">
        <div className="stat">
          <div className="v">
            {known} / {order.length}
          </div>
          <div className="l">pieds relevés (vide = inconnu)</div>
        </div>
        {s?.ref !== undefined && (
          <div className="stat">
            <div className="v">{formatLevel(s.ref)} mm</div>
            <div className="l">point le plus haut = référence ({s.refIds.join(', ')})</div>
          </div>
        )}
        {s?.spread !== undefined && known > 1 && (
          <div className="stat">
            <div className="v">{N(s.spread)} mm</div>
            <div className="l">dénivelé total = rattrapage maximal</div>
          </div>
        )}
        {s?.slope && (
          <div className={`stat ${s.slope.pct > 2 ? 'warn' : ''}`}>
            <div className="v">{N(s.slope.pct, 1)} %</div>
            <div className="l">
              pente la plus forte ({s.slope.a} → {s.slope.b})
            </div>
          </div>
        )}
        {jacks && known > 0 && (
          <div className={`stat ${s?.overJack.length ? 'warn' : ''}`}>
            <div className="v">{s?.overJack.length ? `${s.overJack.length} ✖` : 'OK'}</div>
            <div className="l">{s?.overJack.length ? `pied(s) au-delà de la sortie de vérin vérifiée (${s.jackMax} mm) : cales en plus` : `rattrapage pris par les vérins (sortie ≤ ${s?.jackMax ?? 50} mm)`}</div>
          </div>
        )}
      </div>

      {sel ? (
        <div className="level-editor">
          <b>{sel.group.id}</b>
          <span className="hint">
            {supportType(sel)} · {sel.group.moduleIds.join(', ')} · x {N(planCoords(sel.group.position, o)[0] / 1e3, 2)} m, y {N(planCoords(sel.group.position, o)[1] / 1e3, 2)} m
          </span>
          <label className="row" style={{ gap: 6 }}>
            Niveau du sol
            <input
              ref={input}
              type="text"
              inputMode="decimal"
              value={text}
              placeholder="vide = inconnu"
              className={bad ? 'invalid' : undefined}
              style={{ width: 110 }}
              onChange={(e) => {
                setText(e.target.value);
                setBad(false);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  if (save(sel, text)) step(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') onSelect(null);
              }}
              onBlur={() => save(sel, text)}
              autoFocus
            />
            mm
          </label>
          <button className="btn small ghost" onClick={() => step(-1)} title="Pied précédent (Maj + Entrée)">
            ←
          </button>
          <button className="btn small" onClick={() => save(sel, text) && step(1)} title="Enregistrer et passer au pied suivant (Entrée)">
            Suivant →
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              setText('');
              onChange(withLevel(levels, sel.group.position, undefined));
            }}
            title="Pas de relevé pour ce pied"
          >
            Vider
          </button>
          {(() => {
            const row = s?.rows.find((x) => x.id === sel.group.id);
            if (!row || row.makeUp === undefined) return null;
            return (
              <span className={`badge ${row.shims ? 'warn' : ''}`}>
                {row.makeUp === 0 ? 'référence : calage de base' : `rehausse ${row.makeUp} mm`}
                {row.jackOut !== undefined && row.makeUp > 0 ? ` (vérin +${row.jackOut} mm${row.shims ? ` + cales ${row.shims} mm` : ''})` : ''}
              </span>
            );
          })()}
          {bad && <span className="badge warn">nombre en mm attendu, ex. −15</span>}
        </div>
      ) : (
        <div className="hint" style={{ margin: '6px 0' }}>
          Cliquer un pied sur le plan, taper son niveau en mm (ex. <b>0</b>, <b>-15</b>, <b>+8</b>) puis <b>Entrée</b> pour passer au suivant (de bas en haut, de gauche à droite). Laisser vide si le niveau n’est pas connu.
        </div>
      )}

      {!!s?.notes.length && (
        <div className="warnings">
          {s.notes.map((t, k) => (
            <div key={k} className="warning warning">
              <span className="sev">NIVEAUX</span>
              <span className="msg">{t}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="btn small ghost" onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Masquer le tableau' : `Saisir en tableau (${order.length} pieds)`}
        </button>
        <button className="btn small ghost" disabled={!levels?.length} onClick={() => window.confirm('Effacer tous les niveaux relevés ?') && onChange([])}>
          Tout effacer
        </button>
        <span className="spacer" style={{ flex: 1 }} />
        {onSendToPlans && (
          <button className="btn small primary" onClick={onSendToPlans} title="Le plan de calage A3 reprend les niveaux : étape 6 › « ＋ Ajouter le plan de calage au jeu de plans »">
            📐 Envoyer le plan de calage dans les plans 2D…
          </button>
        )}
      </div>

      {showTable && (
        <table className="list levels-table">
          <thead>
            <tr>
              <th>Pied</th>
              <th>Type</th>
              <th>Viewbox</th>
              <th className="num">x (m)</th>
              <th className="num">y (m)</th>
              <th className="num">Niveau (mm)</th>
              <th className="num">Rehausse (mm)</th>
              {jacks && <th>Vérin / cales</th>}
            </tr>
          </thead>
          <tbody>
            {order.map((r) => {
              const [x, y] = planCoords(r.group.position, o);
              const row = s?.rows.find((q) => q.id === r.group.id);
              const lv = levelAt(levels, r.group.position);
              return (
                <tr key={r.group.id} style={{ background: selected === r.group.id ? 'rgba(96,165,250,.12)' : undefined }}>
                  <td>
                    <b>{r.group.id}</b>
                  </td>
                  <td>{supportType(r)}</td>
                  <td>{r.group.moduleIds.join(', ')}</td>
                  <td className="num">{N(x / 1e3, 2)}</td>
                  <td className="num">{N(y / 1e3, 2)}</td>
                  <td className="num">
                    <input
                      key={`${r.group.id}:${lv ?? ''}`}
                      type="text"
                      inputMode="decimal"
                      defaultValue={lv === undefined ? '' : String(lv)}
                      placeholder="—"
                      style={{ width: 70, textAlign: 'right' }}
                      onFocus={() => onSelect(r.group.id)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      onBlur={(e) => {
                        const v = parseLevel(e.target.value);
                        if (!Number.isNaN(v) && v !== lv) onChange(withLevel(levels, r.group.position, v));
                      }}
                    />
                  </td>
                  <td className="num">{row?.makeUp === undefined ? '—' : row.makeUp}</td>
                  {jacks && <td>{row?.makeUp === undefined ? '—' : row.shims ? `vérin +${row.jackOut} + cales ${row.shims} mm` : `vérin +${row.jackOut} mm`}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
