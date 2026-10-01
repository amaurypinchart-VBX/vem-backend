// Calculateur de calage rapide, sans modèle 3D (chantiers en cours) : une grille de Viewbox (nombre de niveaux par
// emplacement), puis le panneau Sol & calage habituel (estimation, plaques, longrines, matériel, fiche PDF).
import { useEffect, useMemo, useState } from 'react';
import { gridModules } from '../../structure/core/estimate';
import { PROJECT_ID } from '../../api/vem';
import { GroundPanel } from './GroundPanel';

interface Grid {
  nx: number;
  ny: number;
  levels: number[][];
  roof: boolean;
}

const KEY = `vem.structure.quickGrid.${PROJECT_ID}`;

function readGrid(): Grid {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Grid | null;
    if (g && g.nx > 0 && g.ny > 0 && Array.isArray(g.levels)) return g;
  } catch {
    /* stockage local indisponible */
  }
  return { nx: 3, ny: 1, levels: [[1, 1, 1]], roof: false };
}

export function QuickGroundPage({ onBack }: { onBack: () => void }) {
  const [grid, setGrid] = useState<Grid>(readGrid);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(grid));
    } catch {
      /* stockage local indisponible */
    }
  }, [grid]);
  const resize = (nx: number, ny: number) =>
    setGrid((g) => ({
      ...g,
      nx,
      ny,
      levels: Array.from({ length: ny }, (_, j) => Array.from({ length: nx }, (_, i) => g.levels[j]?.[i] ?? 1)),
    }));
  const modules = useMemo(() => gridModules(grid.nx, grid.ny, grid.levels, grid.roof), [grid]);
  const setCell = (i: number, j: number, v: number) => setGrid((g) => ({ ...g, levels: g.levels.map((row, jj) => row.map((x, ii) => (ii === i && jj === j ? v : x))) }));
  const intro = (
    <div className="card">
      <div className="card-head">
        <button className="btn" onClick={onBack}>
          ← Modèles
        </button>
        <h2>Calage rapide — sans modèle 3D</h2>
        <span className="hint">Viewbox 5900 × 2500 juxtaposées ; indique le nombre de niveaux de chaque emplacement (0 = vide).</span>
      </div>
      <div className="card-body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="row hint">
            Viewbox en longueur
            <select value={grid.nx} style={{ width: 70 }} onChange={(e) => resize(Number(e.target.value), grid.ny)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="row hint">
            Viewbox en largeur
            <select value={grid.ny} style={{ width: 70 }} onChange={(e) => resize(grid.nx, Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="row hint">
            <input type="checkbox" checked={grid.roof} onChange={(e) => setGrid({ ...grid, roof: e.target.checked })} /> Toitures du dernier niveau accessibles
            (terrasses)
          </label>
        </div>
        <table className="list" style={{ width: 'auto' }}>
          <tbody>
            {grid.levels.map((row, j) => (
              <tr key={j}>
                {row.map((v, i) => (
                  <td key={i} style={{ padding: 3 }}>
                    <select
                      value={v}
                      style={{ width: 96, background: v ? 'rgba(59, 130, 246, .12)' : undefined }}
                      onChange={(e) => setCell(i, j, Number(e.target.value))}
                      title={`Emplacement ${i + 1} × ${j + 1}`}
                    >
                      {[0, 1, 2, 3].map((k) => (
                        <option key={k} value={k}>
                          {k === 0 ? 'vide' : `${k} niveau${k > 1 ? 'x' : ''}`}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return <GroundPanel modules={modules} source="Calage rapide (grille de Viewbox, sans modèle)" storageKey={`vem.structure.quick.${PROJECT_ID}`} intro={intro} />;
}
