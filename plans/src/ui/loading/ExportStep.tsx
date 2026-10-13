// Étape 5 « Export » : bordereau Excel (téléchargé et / ou enregistré dans les Fichiers du projet VEM, nom
// « {order}_loading_v{n}.xlsx ») et « Liste validée / envoyée à l'entrepôt » (la liste est figée ; prédit et final
// de chaque ligne sont gardés pour caler les règles).
import type { LoadingList } from '../../loading/engine/generate';
import type { BordereauMeta } from '../../loading/xlsx/bordereau';
import { downloadBlob } from '../common';

export function ExportStep({
  list,
  meta,
  fileName,
  build,
  validated,
  canSave,
  busy,
  onSave,
  onValidate,
  onReopen,
}: {
  list: LoadingList;
  meta: BordereauMeta;
  fileName: string;
  build: () => Uint8Array;
  validated: string | null;
  canSave: boolean;
  busy: string;
  onSave: () => void;
  onValidate: () => void;
  onReopen: () => void;
}) {
  const open = list.questions.length;
  const missing = list.lines.filter((l) => l.status === 'regle_manquante').length;
  const toConfirm = list.lines.filter((l) => l.status === 'a_confirmer').length;
  const appreciation = list.lines.filter((l) => l.status === 'appreciation' && l.qty === null).length;
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Bordereau Excel</h2>
          <span className="hint">{fileName}</span>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          <table className="list">
            <tbody>
              {[
                ['Chantier', meta.chantier],
                ['N° d’order', meta.orderNo || '—'],
                ['Client', meta.client || '—'],
                ['Date d’expédition', meta.shippingDate || '—'],
                ['Fichier 3D', meta.modelFile],
                ['Topologie', meta.topology],
                ['Lignes', `${list.lines.length}`],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ width: 160 }}>
                    <b>{k}</b>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(open > 0 || missing > 0 || toConfirm > 0 || appreciation > 0) && (
            <div className="warning warning" style={{ display: 'block' }}>
              Avant d’envoyer à l’entrepôt : {open > 0 && `${open} question(s) sans réponse · `}
              {toConfirm > 0 && `${toConfirm} ligne(s) à confirmer · `}
              {appreciation > 0 && `${appreciation} appréciation(s) sans quantité · `}
              {missing > 0 && `${missing} règle(s) manquante(s)`}. Elles sortent dans des sections à part du bordereau.
            </div>
          )}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => downloadBlob(fileName, new Blob([build() as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))}>
              ⬇ Télécharger l’Excel
            </button>
            <button className="btn" disabled={!canSave || !!busy} onClick={onSave} title={canSave ? '' : 'Modèle sans version en ligne'}>
              💾 Enregistrer dans les fichiers du projet
            </button>
            {busy && <span className="hint">{busy}</span>}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Envoi à l’entrepôt</h2>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          {validated ? (
            <>
              <div>
                <span className="badge ok">✔ Liste validée / envoyée à l’entrepôt</span> <span className="hint">{validated}</span>
              </div>
              <div className="hint">La liste est figée. Pour la modifier : la rouvrir (elle redevient un brouillon).</div>
              <div>
                <button className="btn small" disabled={!canSave || !!busy} onClick={onReopen}>
                  Rouvrir la liste
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="hint">
                Fige la liste. Pour chaque ligne, la quantité calculée et la quantité finale sont gardées : elles servent à caler les règles (les
                corrections « seulement ce chantier » sont gardées à part).
              </div>
              <div>
                <button className="btn primary" disabled={!canSave || !!busy} onClick={onValidate}>
                  ✔ Liste validée / envoyée à l’entrepôt
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
