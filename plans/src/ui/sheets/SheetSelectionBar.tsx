// Barre des planches sélectionnées (dupliquer, supprimer, déplacer après…, PDF de la sélection) et choix des Viewbox
// pour « Dupliquer pour d'autres Viewbox ».
import { useEffect, useState } from 'react';
import type { DrawingSet } from '../../sheets/types';
import { actions } from '../../sheets/store';
import type { LoadedScene } from '../../scene/loadedScene';

export function SheetSelectionBar({ doc, ids, busy, onPdf, onClose }: { doc: DrawingSet; ids: string[]; busy: boolean; onPdf: () => void; onClose: () => void }) {
  const chosen = doc.sheets.filter((s) => ids.includes(s.id));
  const n = chosen.length;
  return (
    <div className="sheet-selbar" data-testid="sheet-selbar">
      <b>{n ? `${n} planche${n > 1 ? 's' : ''}` : 'Touche les planches à choisir'}</b>
      {n > 0 && (
        <>
          <button className="btn small" data-testid="selbar-duplicate" onClick={() => actions.duplicateSheets(chosen.map((s) => s.id))} title="Dupliquer (Ctrl+D) — un seul Ctrl+Z annule tout">
            ⧉ Dupliquer
          </button>
          <button
            className="btn small"
            disabled={n >= doc.sheets.length}
            onClick={() => window.confirm(`Supprimer ${n} planche${n > 1 ? 's' : ''} (${chosen.map((s) => s.number).join(', ')}) ?\n\nCtrl+Z pour annuler.`) && actions.deleteSheets(chosen.map((s) => s.id))}
          >
            🗑 Supprimer
          </button>
          <select
            value=""
            title="Placer les planches choisies juste après une autre, dans le même ordre"
            onChange={(e) => {
              const v = e.target.value;
              if (v) actions.moveSheetsAfter(chosen.map((s) => s.id), v === '__first' ? null : v);
            }}
          >
            <option value="">↕ Déplacer après…</option>
            <option value="__first">— en tête du jeu</option>
            {doc.sheets
              .filter((x) => !ids.includes(x.id))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.number} · {x.title}
                </option>
              ))}
          </select>
          <button className="btn small" disabled={busy} data-testid="selbar-pdf" onClick={onPdf}>
            ⬇ PDF de la sélection
          </button>
        </>
      )}
      <span className="spacer" />
      <button className="btn small ghost" onClick={onClose} title="Fin de la sélection">
        ✕
      </button>
    </div>
  );
}

/** Choix des Viewbox cibles d'une planche « une par Viewbox ». */
export function ModulePickDialog({ scene, from, onConfirm, onCancel }: { scene: LoadedScene; from: string; onConfirm: (ids: string[]) => void; onCancel: () => void }) {
  const src = scene.index.modules.find((m) => m.id === from);
  const mods = scene.index.modules.filter((m) => m.id !== from).sort((a, b) => a.id.localeCompare(b.id));
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal module-pick" role="dialog" aria-label="Dupliquer pour d’autres Viewbox">
        <div className="card-head">
          <h2>⧉ Dupliquer pour d’autres Viewbox</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="hint" style={{ marginBottom: 8 }}>
            Une copie de la planche de {from} par Viewbox choisie : vues refaites sur la box, cotes automatiques recalculées, image 3D à refaire.
          </div>
          <div className="module-pick-list">
            {mods.map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} /> {m.id}
                {m.type && m.type !== src?.type && <span className="badge">autre type : cotes manuelles retirées</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn small ghost" onClick={() => setPicked(picked.length === mods.length ? [] : mods.map((m) => m.id))}>
            {picked.length === mods.length ? 'Aucune' : 'Toutes'}
          </button>
          <span className="spacer" />
          <button className="btn small" onClick={onCancel}>
            Annuler
          </button>
          <button className="btn small primary" disabled={!picked.length} onClick={() => onConfirm(picked)}>
            Dupliquer ({picked.length})
          </button>
        </div>
      </div>
    </div>
  );
}
