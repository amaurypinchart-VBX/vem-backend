// Onglet « Étude structure » de l'espace de travail. Étape disponible : Sol & calage, alimentée par l'estimation
// instantanée à partir des Viewbox du modèle (repères, niveaux). Reconnaissance, calcul complet, vérifications et
// rapport viendront compléter cet onglet (phases S3 à S6).
import { useMemo, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import { moduleFootprint } from '../../core/installUnits';
import type { EstimateModule } from '../../structure/core/estimate';
import { GroundPanel } from './GroundPanel';

/** Viewbox du modèle → modules de l'estimation (emprise en plan, niveau, surface). */
export function modulesFromScene(scene: LoadedScene, roofAccessible: boolean): { modules: EstimateModule[]; warnings: string[] } {
  const warnings: string[] = [];
  const idx = scene.index;
  const modules: EstimateModule[] = [];
  for (const m of idx.modules) {
    const fp = moduleFootprint(idx, m.id, scene.frames);
    if (!fp) continue;
    modules.push({ id: m.id, level: m.level, corners: fp, area: m.planDimsMm[0] * m.planDimsMm[1], height: 3080, roofAccessible: false });
    if (Math.abs(m.expected.long - 5900) > 50) warnings.push(`${m.id} (${m.expected.label}) : données de structure inconnues, poids pris au prorata de la surface.`);
  }
  // toitures accessibles : Viewbox sans rien au-dessus
  if (roofAccessible)
    for (const m of modules) {
      const above = modules.some((o) => o.level === m.level + 1 && o.corners.some((c) => m.corners.some((d) => Math.hypot(c[0] - d[0], c[1] - d[1]) < 200)));
      m.roofAccessible = !above;
    }
  return { modules, warnings };
}

export function StructurePage({ scene, framesVersion }: { scene: LoadedScene; framesVersion: number }) {
  const [roof, setRoof] = useState(false);
  // framesVersion : les repères des Viewbox ont été recalculés (face avant modifiée)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { modules, warnings } = useMemo(() => modulesFromScene(scene, roof), [scene, framesVersion, roof]);
  const intro = (
    <div className="card">
      <div className="card-head">
        <h2>Étude structure</h2>
        <span className="badge orange">pré-étude interne</span>
        <span className="hint">
          Étape disponible : sol et calage (estimation). La reconnaissance des pièces, le calcul complet, les vérifications et le rapport
          arrivent dans les prochaines étapes.
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label className="row hint">
          <input type="checkbox" checked={roof} onChange={(e) => setRoof(e.target.checked)} /> Toitures sans Viewbox au-dessus accessibles (terrasses)
        </label>
        {warnings.map((w, k) => (
          <div key={k} className="warning warning">
            <span className="sev">ATTENTION</span>
            <span className="msg">{w}</span>
          </div>
        ))}
        {!modules.length && <div className="hint">Aucune Viewbox reconnue dans ce modèle.</div>}
      </div>
    </div>
  );
  return <GroundPanel modules={modules} source={`Modèle ${scene.index.source.fileName}`} storageKey={`vem.structure.model.${scene.modelKey}`} intro={intro} />;
}
