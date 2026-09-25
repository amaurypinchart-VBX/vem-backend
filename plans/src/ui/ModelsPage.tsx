// Page principale : fichiers 3D du projet, analyses enregistrées, lancement d'une analyse.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Object3D } from 'three';
import type { ClassificationRules, SceneIndex } from '../core/types';
import { ENGINE_VERSION } from '../core/types';
import { sha256Hex } from '../core/hash';
import { fmtBytes, fmtInt } from '../core/report';
import { ingest } from '../ingest/pipeline';
import { createWorkerRunner } from '../ingest/cleanup';
import { exportPackage, loadPackage } from '../ingest/package';
import type { ModelVersion, ProjectFile } from '../api/vem';
import { PROJECT_ID, downloadWithProgress, vem } from '../api/vem';
import { Inspector } from './Inspector';
import type { SaveState } from './Inspector';
import { ProgressBar } from './common';

const MODEL_EXTS = ['zip', 'dae', 'glb'];
const MAX_PACKAGE_BYTES = 49.5 * 1024 * 1024; // limite d'upload VEM : 50 Mo

const extOf = (f: ProjectFile) => (f.fileName || f.fileUrl || '').split('.').pop()?.toLowerCase() ?? '';

interface Current {
  index: SceneIndex;
  model?: ModelVersion;
  saveState: SaveState;
  saveMessage?: string;
}

interface Job {
  label: string;
  fraction: number;
  cancel?: () => void;
}

export function ModelsPage({ rules }: { rules: ClassificationRules }) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [loadError, setLoadError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<Current | null>(null);
  const [reload, setReload] = useState<{ busy: boolean; message?: string }>({ busy: false });
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [f, m] = await Promise.all([vem.projectFiles(PROJECT_ID), vem.listModels(PROJECT_ID)]);
      setFiles(f.filter((x) => MODEL_EXTS.includes(extOf(x))));
      setModels(m);
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const analyze = async (fileName: string, data: ArrayBuffer, meta: { sourceFileId?: string; sourceUrl?: string }) => {
    setError('');
    const ctrl = new AbortController();
    const runner = createWorkerRunner();
    let root: Object3D | null = null;
    let dispose = () => {};
    try {
      setJob({ label: "Calcul de l'empreinte du fichier", fraction: 0.01 });
      const sha256 = await sha256Hex(data);
      const existing = models.find((m) => m.sha256 === sha256);
      if (
        existing &&
        existing.engineVersion === ENGINE_VERSION &&
        !window.confirm(
          `Ce fichier a déjà été analysé le ${new Date(existing.updatedAt).toLocaleString('fr-FR')}.\n\nOK = réanalyser (par ex. après avoir modifié les règles)\nAnnuler = ouvrir l'analyse existante`,
        )
      ) {
        setJob(null);
        await openModel(existing.id);
        return;
      }
      const res = await ingest({
        fileName,
        data,
        sha256,
        rules,
        runner: runner.run,
        signal: ctrl.signal,
        onProgress: (label, fraction) => setJob({ label, fraction, cancel: () => ctrl.abort() }),
      });
      root = res.root;
      dispose = res.dispose;
      setJob(null);
      setCurrent({ index: res.index, saveState: 'saving' });

      const saved = await vem.saveModel(PROJECT_ID, {
        sourceFileId: meta.sourceFileId,
        sourceUrl: meta.sourceUrl,
        fileName,
        sha256,
        sizeBytes: data.byteLength,
        engineVersion: ENGINE_VERSION,
        unitMeter: res.index.source.unitMeter,
        upAxis: res.index.source.upAxis,
        stats: res.index.stats,
        warnings: res.index.warnings,
        sceneIndex: res.index,
      });
      setCurrent({ index: res.index, model: saved, saveState: 'packaging' });
      const glb = await exportPackage(res.root);
      if (glb.byteLength > MAX_PACKAGE_BYTES) {
        setCurrent({
          index: res.index,
          model: saved,
          saveState: 'saved',
          saveMessage: `Paquet 3D trop lourd pour VEM (${fmtBytes(glb.byteLength)} > 50 Mo) : purge le modèle ou retire les textures inutiles. L'analyse reste consultable.`,
        });
      } else {
        const packaged = await vem.uploadPackage(saved.id, glb);
        setCurrent({ index: res.index, model: packaged, saveState: 'packaged' });
      }
      await refresh();
    } catch (e) {
      const err = e as Error;
      setJob(null);
      if (err.name === 'AbortError') setError('Analyse annulée.');
      else {
        console.error('[plans] analyse', err);
        setCurrent((c) => (c ? { ...c, saveState: 'error', saveMessage: err.message } : c));
        if (!root) setError(`Échec de l'analyse : ${err.message}`);
      }
    } finally {
      runner.dispose();
      dispose();
    }
  };

  const analyzeProjectFile = async (f: ProjectFile) => {
    const ctrl = new AbortController();
    try {
      setError('');
      setJob({ label: `Téléchargement de ${f.fileName}`, fraction: 0, cancel: () => ctrl.abort() });
      const data = await downloadWithProgress(
        f.fileUrl,
        (p) => setJob({ label: `Téléchargement de ${f.fileName}`, fraction: p, cancel: () => ctrl.abort() }),
        ctrl.signal,
      );
      await analyze(f.fileName, data, { sourceFileId: f.id, sourceUrl: f.fileUrl });
    } catch (e) {
      setJob(null);
      setError((e as Error).name === 'AbortError' ? 'Téléchargement annulé.' : `Téléchargement impossible : ${(e as Error).message}`);
    }
  };

  const analyzeLocalFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!MODEL_EXTS.includes(ext)) {
      setError(`Format .${ext} non géré : dépose un .zip (dae + textures + manifest.json), un .dae ou un .glb.`);
      return;
    }
    await analyze(file.name, await file.arrayBuffer(), {});
  };

  const openModel = async (id: string) => {
    try {
      setError('');
      setJob({ label: 'Ouverture de l’analyse', fraction: 0.5 });
      const m = await vem.getModel(id);
      setJob(null);
      if (!m.sceneIndex) throw new Error('Index de scène absent');
      setReload({ busy: false });
      setCurrent({ index: m.sceneIndex, model: m, saveState: m.glbUrl ? 'packaged' : 'saved' });
    } catch (e) {
      setJob(null);
      setError(`Ouverture impossible : ${(e as Error).message}`);
    }
  };

  const reloadPackage = async () => {
    const m = current?.model;
    if (!m?.glbUrl || !current) return;
    setReload({ busy: true });
    try {
      const t0 = performance.now();
      const data = await downloadWithProgress(m.glbUrl);
      const tDownload = performance.now() - t0;
      const pkg = await loadPackage(data);
      const total = performance.now() - t0;
      const found = current.index.nodes.filter((n) => pkg.objectsById.has(n.id)).length;
      const ok = found === current.index.nodes.length;
      setReload({
        busy: false,
        message: `${ok ? '✓' : '⚠'} Paquet rechargé en ${(total / 1000).toFixed(2).replace('.', ',')} s (téléchargement ${(tDownload / 1000).toFixed(2).replace('.', ',')} s + lecture ${(pkg.durationMs / 1000).toFixed(2).replace('.', ',')} s) — ${fmtInt(found)} / ${fmtInt(current.index.nodes.length)} nœuds retrouvés.`,
      });
    } catch (e) {
      setReload({ busy: false, message: `✗ Rechargement impossible : ${(e as Error).message}` });
    }
  };

  const deleteModel = async (m: ModelVersion) => {
    if (!window.confirm(`Supprimer l'analyse de « ${m.fileName} » ? (le fichier source du projet n'est pas touché)`)) return;
    try {
      await vem.deleteModel(m.id);
      await refresh();
    } catch (e) {
      setError(`Suppression impossible : ${(e as Error).message}`);
    }
  };

  if (current && !job) {
    return (
      <Inspector
        index={current.index}
        model={current.model}
        saveState={current.saveState}
        saveMessage={current.saveMessage}
        onBack={() => {
          setCurrent(null);
          setReload({ busy: false });
        }}
        onReloadPackage={reloadPackage}
        reloading={reload.busy}
        reloadMessage={reload.message}
      />
    );
  }

  const busy = job !== null;
  return (
    <div className="page">
      {job && <ProgressBar label={job.label} fraction={job.fraction} onCancel={job.cancel} />}
      {error && <div className="error-box">{error}</div>}
      {loadError && <div className="error-box">{loadError}</div>}

      <div className="card">
        <div className="card-head">
          <h2>Modèles 3D du projet</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={() => void refresh()}>
            ↻ Actualiser
          </button>
        </div>
        <div className="card-body">
          {!files.length ? (
            <div className="hint">
              Aucun .zip, .dae ou .glb dans les fichiers de ce projet. Ajoute le .zip exporté par l’extension SketchUp Viewbox dans
              les fichiers du projet VEM, ou analyse un fichier de ton ordinateur ci-dessous.
            </div>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Fichier</th>
                  <th className="num">Taille</th>
                  <th>Ajouté le</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>{f.fileName}</td>
                    <td className="num">{fmtBytes(f.fileSize)}</td>
                    <td>{f.createdAt ? new Date(f.createdAt).toLocaleDateString('fr-FR') : ''}</td>
                    <td className="actions">
                      <button className="btn primary small" disabled={busy} onClick={() => void analyzeProjectFile(f)}>
                        Analyser
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div
            className={`dropzone${dragOver ? ' over' : ''}`}
            style={{ marginTop: 12 }}
            onClick={() => !busy && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f && !busy) void analyzeLocalFile(f);
            }}
          >
            Ou glisse ici un .zip / .dae / .glb de ton ordinateur (ou clique pour le choisir)
            <input
              ref={fileInput}
              type="file"
              accept=".zip,.dae,.glb"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void analyzeLocalFile(f);
              }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Analyses enregistrées</h2>
        </div>
        <div className="card-body">
          {!models.length ? (
            <div className="hint">Aucune analyse pour l’instant.</div>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Fichier</th>
                  <th className="num">Viewbox</th>
                  <th className="num">Non classés</th>
                  <th>Avertissements</th>
                  <th>Paquet 3D</th>
                  <th>Analysé le</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const w = Array.isArray(m.warnings) ? m.warnings : [];
                  const nb = w.filter((x) => x.severity === 'blocking').length;
                  const nw = w.filter((x) => x.severity === 'warning').length;
                  return (
                    <tr key={m.id}>
                      <td>
                        {m.fileName}
                        {m.engineVersion !== ENGINE_VERSION && <span className="badge orange" style={{ marginLeft: 6 }}>moteur ancien : réanalyser</span>}
                      </td>
                      <td className="num">{m.stats?.modules ?? '—'}</td>
                      <td className="num">{m.stats?.unclassified ?? '—'}</td>
                      <td>
                        {nb > 0 && <span className="badge ko">{nb} bloquant(s)</span>} {nw > 0 && <span className="badge orange">{nw} avertissement(s)</span>}
                        {nb + nw === 0 && <span className="badge ok">conforme</span>}
                      </td>
                      <td>{m.glbUrl ? <span className="badge ok">{fmtBytes(m.glbSize)}</span> : <span className="badge">—</span>}</td>
                      <td>{new Date(m.updatedAt).toLocaleString('fr-FR')}</td>
                      <td className="actions">
                        <button className="btn small" disabled={busy} onClick={() => void openModel(m.id)}>
                          Ouvrir
                        </button>
                        <button className="btn small ghost" disabled={busy} onClick={() => void deleteModel(m)} title="Supprimer l'analyse">
                          🗑
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Préparer le fichier SketchUp</h2>
        </div>
        <div className="card-body hint">
          <p>
            Installe l’extension <a href="tools/viewbox_prep.rbz" download>viewbox_prep.rbz</a> dans SketchUp (Extensions › Gestionnaire
            d’extensions › Installer l’extension), puis <b>Extensions › Viewbox › Préparer &amp; exporter pour VEM…</b>. Elle contrôle et nomme
            les Viewbox (VBX-01, VBX-02…), classe les accessoires d’après leurs balises, et produit un .zip prêt à déposer ici (.dae aux bons
            réglages + textures + manifest.json).
          </p>
        </div>
      </div>
    </div>
  );
}
