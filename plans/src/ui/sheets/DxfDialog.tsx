// Choix de l'export DXF : planche affichée, tout le jeu (un seul .dxf ou un .zip), planche à l'échelle papier ou vues en grandeur réelle.
import { useEffect, useState } from 'react';
import type { DxfMode } from '../../sheets/dxf/export';

/** « sheet » : la planche affichée ; « zip » : un .dxf par planche dans un .zip ; « single » : tout le jeu dans un seul .dxf. */
export type DxfScope = 'sheet' | 'zip' | 'single';

export interface DxfChoice {
  scope: DxfScope;
  mode: DxfMode;
}

export function DxfDialog({ sheetLabel, sheetCount, onExport, onClose }: { sheetLabel: string; sheetCount: number; onExport: (c: DxfChoice) => void; onClose: () => void }) {
  const [scope, setScope] = useState<DxfScope>('sheet');
  const [mode, setMode] = useState<DxfMode>('paper');
  useEffect(() => {
    // la fenêtre garde le clavier : les raccourcis de l'éditeur ne touchent pas la planche derrière
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal dxf-dialog" role="dialog" aria-label="Export DXF">
        <div className="card-head">
          <h2>⬇ Export DXF (AutoCAD)</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose} title="Fermer (Échap)">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <fieldset>
            <legend>Planches</legend>
            <label className="check">
              <input type="radio" name="dxf-scope" checked={scope === 'sheet'} onChange={() => setScope('sheet')} />
              La planche affichée ({sheetLabel}) — un fichier .dxf
            </label>
            <label className="check">
              <input type="radio" name="dxf-scope" checked={scope === 'single'} onChange={() => setScope('single')} />
              Tout le jeu ({sheetCount} planche{sheetCount > 1 ? 's' : ''}) dans un seul .dxf — planches côte à côte, dans l’ordre du jeu
            </label>
            <label className="check">
              <input type="radio" name="dxf-scope" checked={scope === 'zip'} onChange={() => setScope('zip')} />
              Tout le jeu ({sheetCount} planche{sheetCount > 1 ? 's' : ''}) — un .zip avec un .dxf par planche
            </label>
          </fieldset>
          <fieldset>
            <legend>Échelle</legend>
            <label className="check">
              <input type="radio" name="dxf-mode" checked={mode === 'paper'} onChange={() => setMode('paper')} />
              <span>
                <b>Planche complète</b> comme le PDF : cadre, cartouche, vues, cotes, textes — 1 unité = 1 mm sur la feuille
              </span>
            </label>
            <label className="check">
              <input type="radio" name="dxf-mode" checked={mode === 'real'} onChange={() => setMode('real')} />
              <span>
                <b>Vues en grandeur réelle</b> pour l’architecte : seulement les vues avec leurs cotes et repères — 1 unité = 1 mm réel (on mesure directement dans AutoCAD)
              </span>
            </label>
          </fieldset>
          <p className="hint">
            Calques par type de trait (VBX-VUE-SILHOUETTE, VBX-VUE-VISIBLE, VBX-VUE-CACHE, VBX-CATEGORIE-…, VBX-COTES, VBX-CARTOUCHE…), épaisseurs et couleurs conservées. Les images 3D ne sont pas reprises (cadre seul) : elles restent dans le PDF.
          </p>
        </div>
        <div className="modal-foot">
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn small primary" onClick={() => onExport({ scope, mode })}>
            ⬇ Télécharger
          </button>
        </div>
      </div>
    </div>
  );
}
