// Bulle de clic sur une pièce (vues spéciales) : fil d'Ariane (survol = surbrillance de ce niveau dans la 3D),
// actions avec le nombre de pièces touchées, « Mémoriser comme » (étiquette de vue, admin / TM).
import { useMemo } from 'react';
import type { Crumb } from '../../core/customViews/editor';
import { clickActions } from '../../core/customViews/editor';
import type { ActionProposal } from '../../core/customViews/editor';
import type { VisibilityContext } from '../../core/customViews/visibility';

interface Props {
  ctx: VisibilityContext;
  crumbs: Crumb[];
  level: string;
  scopeNodes: ReadonlySet<string>;
  onLevel: (id: string) => void;
  onHover: (id: string | null) => void;
  onAction: (a: ActionProposal) => void;
  onClose: () => void;
  /** étiquettes proposées pour « Mémoriser comme » ; absent = pas de droit */
  memorise?: { tags: Array<{ tag: string; label: string }>; current: string | null; reason?: string; onChange: (tag: string | null) => void };
}

export function ClickBubble({ ctx, crumbs, level, scopeNodes, onLevel, onHover, onAction, onClose, memorise }: Props) {
  const actions = useMemo(() => clickActions(ctx, level, scopeNodes), [ctx, level, scopeNodes]);
  const tag = ctx.tags.ownTag(level);
  return (
    <div className="cv-bubble" data-testid="cv-bubble" onMouseLeave={() => onHover(null)}>
      <div className="cv-bubble-head">
        <div className="cv-crumbs">
          {crumbs.map((c, i) => (
            <span key={c.id}>
              {i > 0 && <span className="sep"> › </span>}
              <button className={`crumb${c.id === level ? ' on' : ''}`} onClick={() => onLevel(c.id)} onMouseEnter={() => onHover(c.id)} title="Choisir ce niveau">
                {c.label}
              </button>
            </span>
          ))}
        </div>
        <button className="btn small ghost" onClick={onClose} title="Fermer">
          ✕
        </button>
      </div>
      {tag && (
        <div className="hint">
          Étiquette : <b>{tag.label}</b> {tag.source === 'memorised' ? '(mémorisé)' : tag.source === 'name' ? '(deviné par le nom)' : '(par la catégorie)'}
        </div>
      )}
      <div className="cv-actions">
        {actions.map((a) => (
          <button key={a.action} className={`btn small${a.primary ? ' primary' : ''}`} onClick={() => onAction(a)} data-action={a.action}>
            {a.text}
          </button>
        ))}
      </div>
      {memorise && (
        <label className="check" title={memorise.reason}>
          Mémoriser comme
          <select value={memorise.current ?? ''} disabled={!!memorise.reason} onChange={(e) => memorise.onChange(e.target.value || null)} style={{ width: 190 }}>
            <option value="">—</option>
            {memorise.tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
