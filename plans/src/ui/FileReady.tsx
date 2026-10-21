// Écran « PDF prêt » (téléphone / tablette) : Ouvrir, Partager / Enregistrer, Fichiers du projet VEM.
import { useEffect, useState } from 'react';
import { PROJECT_FILE_MAX, formatSize, openBlob, shareOrDownload } from './deliver';

export interface ReadyFile {
  blob: Blob;
  name: string;
}

export function FileReadyDialog({ file, onSaveToProject, onClose }: { file: ReadyFile; onSaveToProject?: (f: ReadyFile) => Promise<void>; onClose: () => void }) {
  const [state, setState] = useState<{ saving?: boolean; saved?: boolean; error?: string; note?: string }>({});
  const kind = /\.pdf$/i.test(file.name) ? 'PDF' : /\.zip$/i.test(file.name) ? 'Archive' : /\.dxf$/i.test(file.name) ? 'DXF' : 'Fichier';
  const tooBig = file.blob.size > PROJECT_FILE_MAX;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal file-ready" role="dialog" aria-label={`${kind} prêt`} data-testid="file-ready">
        <div className="card-head">
          <h2>
            {kind} prêt ({formatSize(file.blob.size)})
          </h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="modal-body file-ready-body">
          <div className="hint file-name">{file.name}</div>
          {kind === 'PDF' && (
            <button className="btn primary" data-testid="ready-open" onClick={() => openBlob(file.blob)}>
              📄 Ouvrir
            </button>
          )}
          <button
            className="btn"
            data-testid="ready-share"
            onClick={async () => {
              const r = await shareOrDownload(file.blob, file.name);
              setState((s) => ({ ...s, note: r === 'downloaded' ? 'Téléchargé' : r === 'shared' ? 'Partagé' : '' }));
            }}
          >
            ↗ Partager / Enregistrer
          </button>
          {onSaveToProject && (
            <button
              className="btn"
              data-testid="ready-project"
              disabled={tooBig || state.saving || state.saved}
              onClick={async () => {
                setState({ saving: true });
                try {
                  await onSaveToProject(file);
                  setState({ saved: true });
                } catch (e) {
                  setState({ error: (e as Error).message });
                }
              }}
            >
              {state.saved ? '✓ Enregistré dans les Fichiers du projet' : state.saving ? 'Enregistrement…' : '💾 Enregistrer dans les Fichiers du projet VEM'}
            </button>
          )}
          {onSaveToProject && tooBig && <div className="hint">Plus de 10 Mo : refusé par le stockage des fichiers du projet. Partage-le ou fais un PDF par planche.</div>}
          {state.error && <div className="error-box">{state.error}</div>}
          {state.note && <div className="hint">{state.note}</div>}
        </div>
      </div>
    </div>
  );
}
