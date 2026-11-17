// Bulle de l'outil « 📏 Coter une pièce » : niveau (la pièce, son groupe… survol = surbrillance), toutes les pièces
// identiques de la vue, hauteurs depuis le plancher ou le sol, ce qui sera coté ; les cotes sont montrées en aperçu sur
// la planche avant d'être posées.
import type { CSSProperties } from 'react';
import type { HeightFrom, PieceCrumb, PieceMode } from '../../sheets/pieceDims';
import { HEIGHT_FROM_LABELS } from '../../sheets/pieceDims';

interface Props {
  crumbs: PieceCrumb[];
  level: string;
  mode: PieceMode;
  /** pièces identiques dans la vue (0 = pas de définition / nom pour les reconnaître) */
  sameCount: number;
  from: HeightFrom;
  /** la vue porte la hauteur (élévation, coupe verticale) */
  heights: boolean;
  /** « 3 pièces (3 debout) » */
  summary: string;
  notes: string[];
  dimCount: number;
  style?: CSSProperties;
  onLevel: (id: string) => void;
  onHover: (id: string | null) => void;
  onMode: (m: PieceMode) => void;
  onFrom: (f: HeightFrom) => void;
  onApply: () => void;
  onClose: () => void;
}

export function PieceDimBubble({ crumbs, level, mode, sameCount, from, heights, summary, notes, dimCount, style, onLevel, onHover, onMode, onFrom, onApply, onClose }: Props) {
  return (
    <div className="cv-bubble" data-testid="piece-dim-bubble" onMouseLeave={() => onHover(null)} style={style}>
      <div className="cv-bubble-head">
        <div className="cv-crumbs">
          {crumbs.map((c, i) => (
            <span key={c.id}>
              {i > 0 && <span className="sep"> › </span>}
              <button
                className={`crumb${c.id === level ? ' on' : ''}`}
                onClick={() => (onLevel(c.id), onMode('level'))}
                onMouseEnter={() => onHover(c.id)}
                onMouseLeave={() => onHover(null)}
                title="Coter ce niveau : chaque groupe ou composant qu’il contient est une pièce"
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>
        <button className="btn small ghost" onClick={onClose} title="Fermer">
          ✕
        </button>
      </div>
      <label className="check" title={sameCount > 1 ? 'Même composant SketchUp (ou même nom), partout dans cette vue' : 'Pas d’autre pièce identique (même composant ou même nom) dans cette vue'}>
        <input type="checkbox" data-testid="piece-dim-same" checked={mode === 'same'} disabled={sameCount < 2 && mode !== 'same'} onChange={(e) => onMode(e.target.checked ? 'same' : 'level')} />
        Toutes les pièces identiques de la vue{sameCount > 1 ? ` (${sameCount})` : ''}
      </label>
      {heights && (
        <label className="check">
          Hauteurs depuis
          <select data-testid="piece-dim-from" value={from} onChange={(e) => onFrom(e.target.value as HeightFrom)}>
            {(Object.keys(HEIGHT_FROM_LABELS) as HeightFrom[]).map((k) => (
              <option key={k} value={k}>
                le {HEIGHT_FROM_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="hint" data-testid="piece-dim-summary">
        <b>{summary}</b> en surbrillance
        {notes.map((n, i) => (
          <div key={i}>{n}</div>
        ))}
        <div>Un bois dessiné comme groupe ou composant dans SketchUp = une pièce.</div>
      </div>
      <div className="row wrap">
        <button className="btn small primary" data-testid="piece-dim-apply" disabled={!dimCount} onClick={onApply}>
          📏 Poser {dimCount > 1 ? `les ${dimCount} cotes` : dimCount ? 'la cote' : 'les cotes'}
        </button>
        <span className="hint">Aperçu des cotes sur la planche · Ctrl+Z pour les retirer après</span>
      </div>
    </div>
  );
}
