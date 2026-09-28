// Choix de l'image d'une image 3D : captures enregistrées dans la vue 3D (la plus récente en premier) + images déjà
// présentes dans le jeu. Grille compacte dans les propriétés, grande fenêtre au double-clic ou à l'ajout.
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { SavedCapture } from '../../api/vem';
import { thumbUrl } from '../../api/cloudinary';
import type { PickableImage } from '../../sheets/images';

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

function Tile({ img, on, large, onPick }: { img: PickableImage; on: boolean; large?: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`capture-tile${on ? ' on' : ''}`} onClick={onPick} title={`${img.name} — ${img.width} × ${img.height} px`}>
      <img
        src={thumbUrl(img.url, large ? 480 : 260)}
        alt={img.name}
        loading="lazy"
        onError={(e) => e.currentTarget.src !== img.url && (e.currentTarget.src = img.url)}
      />
      <span className="nm">{img.name}</span>
      {large && (
        <span className="meta">
          {img.width} × {img.height} px{img.createdAt ? ` · ${when(img.createdAt)}` : ''}
        </span>
      )}
    </button>
  );
}

export function CaptureGrid({
  captures,
  others,
  current,
  large,
  onPick,
}: {
  captures: SavedCapture[];
  others: PickableImage[];
  current?: string;
  large?: boolean;
  onPick: (img: PickableImage) => void;
}) {
  return (
    <div className="capture-groups">
      {captures.length > 0 ? (
        <div className={`capture-grid${large ? ' large' : ''}`}>
          {captures.map((c) => (
            <Tile key={c.id} img={c} on={c.url === current} large={large} onPick={() => onPick(c)} />
          ))}
        </div>
      ) : (
        <div className="hint">Aucune capture enregistrée : onglet Vue 3D → cadre la vue → 📷 Capturer. Elle apparaîtra ici.</div>
      )}
      {others.length > 0 && (
        <>
          <div className="group-title">Autres images du jeu</div>
          <div className={`capture-grid${large ? ' large' : ''}`}>
            {others.map((o) => (
              <Tile key={o.url} img={o} on={o.url === current} large={large} onPick={() => onPick(o)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CapturePicker({
  title,
  onClose,
  footer,
  ...grid
}: {
  title: string;
  captures: SavedCapture[];
  others: PickableImage[];
  current?: string;
  onPick: (img: PickableImage) => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    // la fenêtre garde le clavier : les raccourcis de l'éditeur (Suppr, flèches…) ne touchent pas la planche derrière
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal capture-picker" role="dialog" aria-label={title}>
        <div className="card-head">
          <h2>{title}</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose} title="Fermer (Échap)">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <CaptureGrid {...grid} large />
        </div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
