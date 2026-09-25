// Chaîne d'ingestion complète : fichier → modèle normalisé (mm, Y-up) + nettoyé + index de scène.
import type { Object3D } from 'three';
import type { ClassificationRules, SceneIndex, Warning } from '../core/types';
import { compileRules } from '../core/classification';
import type { Manifest } from '../core/manifest';
import { parseManifest } from '../core/manifest';
import { readSourceBundle } from './unzip';
import { loadDae, loadRawGlb } from './loadModel';
import type { BatchRunner } from './cleanup';
import { cleanupScene } from './cleanup';
import { buildIndex } from './buildIndex';

export interface IngestOptions {
  fileName: string;
  data: ArrayBuffer;
  sha256: string;
  rules: ClassificationRules;
  runner: BatchRunner;
  onProgress?: (step: string, fraction: number) => void;
  signal?: AbortSignal;
}

export interface IngestResult {
  root: Object3D;
  index: SceneIndex;
  objectsById: Map<string, Object3D>;
  dispose: () => void;
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Annulé', 'AbortError');
}

export async function ingest(opts: IngestOptions): Promise<IngestResult> {
  const startedAt = performance.now();
  const progress = opts.onProgress ?? (() => {});
  const rules = compileRules(opts.rules);
  const warnings: Warning[] = [];

  progress('Lecture du fichier', 0.02);
  const bundle = readSourceBundle(opts.fileName, opts.data);
  let manifest: Manifest | null = null;
  if (bundle.manifestText) {
    try {
      manifest = parseManifest(bundle.manifestText);
    } catch (e) {
      warnings.push({ code: 'MANIFEST_INVALID', severity: 'warning', message: `${(e as Error).message} — ignoré.` });
    }
  }
  checkAbort(opts.signal);

  progress(bundle.format === 'dae' ? 'Analyse du .dae (COLLADA)' : 'Analyse du .glb', 0.08);
  await new Promise((r) => setTimeout(r, 0)); // laisse l'interface afficher l'étape avant le parsing (bloquant)
  const loaded = bundle.format === 'dae' ? await loadDae(bundle) : await loadRawGlb(bundle);
  if (loaded.missingTextures.length) {
    warnings.push({
      code: 'TEXTURES_MISSING',
      severity: 'warning',
      message: `${loaded.missingTextures.length} texture(s) introuvable(s) dans l'archive (${loaded.missingTextures.slice(0, 5).join(', ')}) : zippe le dossier de textures avec le .dae.`,
    });
  }
  if (loaded.upAxis === 'X_UP') {
    warnings.push({ code: 'X_UP', severity: 'warning', message: "Axe vertical X (X_UP) inhabituel : vérifie l'orientation du modèle." });
  }
  checkAbort(opts.signal);

  progress('Nettoyage de la géométrie', 0.35);
  const cleanup = await cleanupScene(
    loaded.root,
    opts.runner,
    (done, total) => progress(`Nettoyage de la géométrie (${done}/${total})`, 0.35 + 0.45 * (done / Math.max(total, 1))),
    opts.signal,
  );
  checkAbort(opts.signal);

  progress('Classification et contrôles', 0.85);
  await new Promise((r) => setTimeout(r, 0));
  const { index, objectsById } = buildIndex({
    root: loaded.root,
    rules,
    manifest,
    source: {
      fileName: opts.fileName,
      sha256: opts.sha256,
      sizeBytes: opts.data.byteLength,
      format: bundle.format,
      unitMeter: loaded.unitMeter,
      unitName: loaded.unitName,
      upAxis: loaded.upAxis,
      loaderAppliedUnit: loaded.loaderAppliedUnit,
      hasManifest: manifest !== null,
      hasEdges: false,
    },
    cleanup,
    extraWarnings: warnings,
    startedAt,
  });
  progress('Terminé', 1);
  return { root: loaded.root, index, objectsById, dispose: loaded.dispose };
}
