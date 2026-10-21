// Menu d'un élément de la planche (appui long au doigt) : remplace le clic droit, le survol et le double-clic.
import { useEffect } from 'react';
import type { SheetItem } from '../../sheets/types';
import { actions, useEditor } from '../../sheets/store';

export function ItemMenu({
  item,
  at,
  editMode,
  onClose,
  onProps,
  onOpenImage,
  onEdit,
}: {
  item: SheetItem;
  at: { x: number; y: number };
  editMode: boolean;
  onClose: () => void;
  onProps: () => void;
  onOpenImage: () => void;
  onEdit: () => void;
}) {
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!(e.target as Element)?.closest?.('.item-menu')) onClose();
    };
    const t = setTimeout(() => window.addEventListener('pointerdown', close), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close);
    };
  }, [onClose]);
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const left = Math.max(8, Math.min(at.x, window.innerWidth - 230));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - 280));
  return (
    <div className="item-menu" role="menu" data-testid="item-menu" style={{ left, top }}>
      <button className="btn" onClick={run(onProps)}>
        ☰ Propriétés
      </button>
      {item.type === 'image3d' && (
        <button className="btn" onClick={run(onOpenImage)}>
          📷 Changer l’image
        </button>
      )}
      {editMode ? (
        <>
          <button
            className="btn"
            onClick={run(() => {
              actions.copy([item.id]);
              actions.paste();
            })}
          >
            ⧉ Dupliquer
          </button>
          <button className="btn" onClick={run(() => actions.toggleLock([item.id]))}>
            {item.locked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}
          </button>
          <button
            className="btn danger"
            onClick={run(() => {
              actions.deleteItems([item.id]);
              useEditor.getState().select([]);
            })}
          >
            🗑 Supprimer
          </button>
        </>
      ) : (
        <button className="btn" onClick={run(onEdit)}>
          ✏️ Passer en édition
        </button>
      )}
    </div>
  );
}
