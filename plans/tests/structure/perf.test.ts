// Performance et robustesse sur un modèle de la taille de Hoka (27 Viewbox) : 2ᵉ ordre + appuis et contacts non linéaires.
import { describe, expect, it } from 'vitest';
import { analyzeLoadSet, prepare } from '../../src/structure/core/fem/analysis';
import { clusterLoads, viewboxCluster } from './syntheticViewbox';

describe('modèle de la taille de Hoka', () => {
  it('3 × 3 × 3 Viewbox : cas de charge en 2ᵉ ordre non linéaire, équilibre vertical', () => {
    const c = viewboxCluster(3, 3, 3);
    const t0 = performance.now();
    const prep = prepare(c.model);
    const tPrep = performance.now() - t0;
    const sets = clusterLoads(c, 2);
    const times: number[] = [];
    for (const s of sets) {
      const t = performance.now();
      const r = analyzeLoadSet(prep, s, { secondOrder: true });
      times.push(performance.now() - t);
      const total = s.member.reduce((acc, l) => acc + (l.kind === 'distributed' ? -l.q1 * 830 : 0), 0);
      const ry = r.reactions.reduce((acc, x) => acc + x.R[1], 0);
      expect(Math.abs(ry - total) / total).toBeLessThan(0.02);
      console.log(`${s.id} : ${r.iterations} itérations, ${Math.round(times[times.length - 1])} ms`);
      // garde-fou large (≈ 1,2 s sur un portable) : détecte une régression grossière de la factorisation
      expect(times[times.length - 1]).toBeLessThan(20000);
    }
    console.log(
      `${c.model.nodes.length} nœuds, ${c.model.members.length} barres, ${prep.nodes.length} nœuds de calcul, ` +
        `renumérotation ${prep.pattern.method}, ${prep.pattern.Lp[prep.pattern.n]} blocs dans le facteur, préparation ${Math.round(tPrep)} ms`,
    );
  });
});
