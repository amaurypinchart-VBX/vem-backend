// Dialogue « Cadres textile » de l'éditeur de planches : cadres trouvés dans le modèle (types F1, F2… avec dimensions,
// quantités, emplacements) et ce qu'on veut en faire sur le jeu (planches de détail, repères, cotes, masquage).
import { useState } from 'react';
import type { FrameLang, FrameType } from '../../sheets/frames';
import { compactRefs, fmt, frameLocation, frameSize, framesOf } from '../../sheets/frames';

export interface FramesChoice {
  lang: FrameLang;
  sheets: boolean;
  labels: boolean;
  dims: boolean;
  hide: boolean;
}

export function FramesDialog({
  types,
  existing,
  pendingViews,
  onApply,
  onClose,
  onLang,
}: {
  types: FrameType[];
  /** planches « Cadres textile » déjà dans le jeu (remplacées) */
  existing: number;
  /** vues pas encore calculées (repères / cotes posés seulement sur les vues calculées) */
  pendingViews: number;
  onApply: (c: FramesChoice) => void;
  onClose: () => void;
  onLang: (lang: FrameLang) => void;
}) {
  const [c, setC] = useState<FramesChoice>({ lang: 'en', sheets: true, labels: true, dims: true, hide: false });
  const set = (patch: Partial<FramesChoice>) => setC((x) => ({ ...x, ...patch }));
  const frames = framesOf(types);
  const total = frames.length;
  const fromSketchup = frames.filter((f) => f.refSource === 'sketchup').length;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal frames-dialog" role="dialog" aria-label="Cadres textile" data-testid="frames-dialog">
        <div className="card-head">
          <h2>▦ Cadres textile (tissu tendu)</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {!types.length ? (
            <div className="hint" data-testid="frames-none">
              Aucun cadre textile trouvé dans le modèle. Le plus sûr : dans SketchUp (extension Viewbox 1.4), clic droit sur le cadre › Viewbox ›
              « Marquer comme cadre textile », puis réexporter. Sinon un cadre est reconnu par sa catégorie (ex. « FRAME-FOR-TEXTILE ») ou par son
              nom (textile, tissu, fabric, SEG…).
            </div>
          ) : (
            <>
              <div className="hint" style={{ marginBottom: 8 }}>
                {total} cadre{total > 1 ? 's' : ''} ({compactRefs(frames.map((f) => f.ref ?? ''))}) en {types.length} taille{types.length > 1 ? 's' : ''} : un repère
                par cadre (chaque impression est différente), un dessin coté par taille. Repères et visuels saisis dans SketchUp (extension
                1.4 › Cadres textile…) repris tels quels{fromSketchup < total ? ` ; ${total - fromSketchup} cadre(s) numéroté(s) ici automatiquement (Viewbox, tour de la box)` : ''}.
              </div>
              <table className="list frames-table" data-testid="frames-table">
                <thead>
                  <tr>
                    <th>Repère</th>
                    <th>L × H (mm)</th>
                    <th>Ép.</th>
                    <th>Emplacement</th>
                    <th>Visuel</th>
                    <th>Désignation</th>
                  </tr>
                </thead>
                <tbody>
                  {frames.map((f) => (
                    <tr key={f.nodeId}>
                      <td>
                        <b>{f.ref}</b> {f.refSource === 'sketchup' ? <span className="badge">SketchUp</span> : <span className="hint">auto</span>}
                      </td>
                      <td>{frameSize(f)}</td>
                      <td>{fmt(f.t)}</td>
                      <td>{frameLocation(f, 'fr')}</td>
                      <td>{f.visual ?? <span className="hint">—</span>}</td>
                      <td className="hint">{f.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="frames-options">
                <label className="check">
                  <input type="checkbox" checked={c.sheets} data-testid="frames-sheets" onChange={(e) => set({ sheets: e.target.checked })} />
                  Planches « Cadres textile » : nomenclature (une ligne par cadre) + chaque taille dessinée de face, cotée
                  {existing > 0 && <span className="badge">remplace les {existing} planche(s) actuelle(s)</span>}
                </label>
                <label className="check">
                  <input type="checkbox" checked={c.labels && !c.hide} disabled={c.hide} data-testid="frames-labels" onChange={(e) => set({ labels: e.target.checked })} />
                  Repères F1, F2… sur toutes les vues où un cadre se voit
                </label>
                <label className="check">
                  <input type="checkbox" checked={c.dims && !c.hide} disabled={c.hide} data-testid="frames-dims" onChange={(e) => set({ dims: e.target.checked })} />
                  Coter les cadres sur ces vues (position et dimensions, en plus des cotes automatiques)
                </label>
                <label className="check">
                  <input type="checkbox" checked={c.hide} data-testid="frames-hide" onChange={(e) => set({ hide: e.target.checked })} />
                  Masquer les cadres sur toutes les autres vues (seules leurs planches les montrent)
                </label>
                <label className="check">
                  Langue des planches
                  <select
                    value={c.lang}
                    onChange={(e) => {
                      set({ lang: e.target.value as FrameLang });
                      onLang(e.target.value as FrameLang);
                    }}
                    style={{ width: 120 }}
                  >
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </label>
                {pendingViews > 0 && (c.labels || c.dims) && !c.hide && (
                  <div className="hint">
                    ⏳ {pendingViews} vue(s) encore en calcul : leurs repères et cotes seront posés en relançant ce dialogue une fois le calcul fini.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn small" onClick={onClose}>
            Annuler
          </button>
          <button className="btn small primary" disabled={!types.length || (!c.sheets && !c.labels && !c.dims && !c.hide)} data-testid="frames-apply" onClick={() => onApply(c)}>
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
