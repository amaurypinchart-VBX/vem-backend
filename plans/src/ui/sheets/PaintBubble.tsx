// Bulle après un clic sur une face (outil Peinture) : fil d'Ariane, cible avec le nombre de pièces touchées, couleur,
// « Appliquer », « Application rapide » (les clics suivants appliquent la même cible et la même couleur).
import type { PaintColor } from '../../core/paint/types';
import { colorCode } from '../../core/paint/ops';
import type { TargetKey, TargetOption } from '../../core/paint/targets';

export function PaintBubble({
  crumbs,
  options,
  choice,
  colors,
  colorId,
  quick,
  at,
  onChoice,
  onColor,
  onNewColor,
  onQuick,
  onApply,
  onClose,
}: {
  crumbs: string[];
  options: TargetOption[];
  choice: TargetKey;
  colors: PaintColor[];
  colorId: string | null;
  quick: boolean;
  at: { x: number; y: number };
  onChoice: (k: TargetKey) => void;
  onColor: (id: string) => void;
  onNewColor: () => void;
  onQuick: (v: boolean) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="paint-bubble" style={{ left: at.x, top: at.y }} data-testid="paint-bubble" onPointerDown={(e) => e.stopPropagation()}>
      <div className="cv-bubble-head">
        <div className="cv-crumbs">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="sep"> › </span>}
              <b>{c}</b>
            </span>
          ))}
        </div>
        <button className="btn small ghost" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>
      <div className="paint-targets">
        {options.map((o) => (
          <label key={o.key} className="check">
            <input type="radio" name="paint-target" checked={choice === o.key} onChange={() => onChoice(o.key)} data-testid={`paint-target-${o.key}`} />
            {o.label}
            {o.count > 1 && o.key !== 'face-all' && o.key !== 'face-type' ? ` (${o.count} pièces)` : ''}
          </label>
        ))}
      </div>
      <div className="paint-bubble-colors">
        {colors.map((c) => (
          <button key={c.id} className={`paint-dot${colorId === c.id ? ' on' : ''}`} title={`${c.tag} · ${colorCode(c)} ${c.name}`} onClick={() => onColor(c.id)} data-testid={`bubble-color-${c.tag}`}>
            <i style={{ background: c.hex }} />
            {c.tag}
          </button>
        ))}
        <button className="btn small" onClick={onNewColor}>
          ＋ Couleur
        </button>
      </div>
      <div className="row">
        <label className="check" title="Les clics suivants appliquent directement la même cible et la même couleur">
          <input type="checkbox" checked={quick} onChange={(e) => onQuick(e.target.checked)} /> Application rapide
        </label>
        <span className="spacer" />
        <button className="btn small primary" disabled={!colorId} onClick={onApply} data-testid="paint-apply">
          Appliquer
        </button>
      </div>
    </div>
  );
}
