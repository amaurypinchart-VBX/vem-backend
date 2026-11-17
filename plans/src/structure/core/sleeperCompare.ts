// Madriers choisis à la main : les deux variantes côte à côte quand des blocs sont dessinés (A. Pinchart 16.11.2026 :
// « pourquoi laisser les blocs de 1 m / 1 m ? » — en charge répartie ils n'aident pas la dalle, ils ajoutent leur poids
// et ne servent qu'à surélever). Chaque variante est appliquée au calage pour donner ce qui change vraiment : charge
// sur la dalle (ou au sol), poids du calage, hauteur sous la Viewbox. Fonctions pures ; N, mm.
import type { CalageInput, CalageResult } from './calage';
import { computeCalage } from './calage';
import type { CalageRemedy, SleeperChoice } from './calageRemedies';
import { sleeperOption } from './calageRemedies';

export interface SleeperVariant {
  /** blocs dessinés gardés (sous les vérins, sur les madriers) ou retirés (vérins directement sur les madriers) */
  withBlocks: boolean;
  remedy: CalageRemedy;
  /** calage recalculé avec la variante appliquée (null : la piste n'est pas applicable) */
  result: CalageResult | null;
  /** tous les appuis passent avec la variante */
  ok: boolean;
  /** dalle en charge répartie : charge de la zone la plus chargée (N/mm²) ; sol : charge moyenne et maxi sous les madriers */
  slabQ?: number;
  groundMean?: number;
  groundMax?: number;
  /** poids posé sous les Viewbox par le calage (madriers + blocs gardés + plaques), kg */
  packingKg: number;
  /** hauteur connue du calage sous la Viewbox, hors sortie de vérin (mm, la plus grande des coupes) */
  height: number;
  /** variante conseillée : passe, et la plus légère pour la dalle (charge répartie) ou le calage le plus léger (sol) */
  recommended?: boolean;
}

/**
 * Madriers `choice` sous les rangées d'appuis, avec et sans les blocs dessinés (une seule variante sans blocs dans le
 * modèle), sur le calage `res` calculé sans solution retenue.
 */
export function sleeperVariants(inp: CalageInput, res: CalageResult, choice: SleeperChoice): SleeperVariant[] {
  const slab = inp.bearingMode === 'distributed';
  const hasBlocks = res.checks.some((c) => c.block);
  const out: SleeperVariant[] = [];
  for (const withBlocks of hasBlocks ? [false, true] : [true]) {
    const remedy = sleeperOption(inp, res, { ...choice, withBlocks });
    if (!remedy) continue;
    const result = typeof remedy.apply === 'object' ? computeCalage({ ...inp, choices: { ...(inp.choices ?? {}), remedy: remedy.apply, roadway: false, longrine: false } }) : null;
    const lower = (result?.remedy?.outlines ?? []).filter((o) => o.timber?.layer === 'lower' && o.ground);
    const area = (c: Array<readonly [number, number]>) => Math.abs(c.reduce((a, p, i) => a + p[0] * c[(i + 1) % c.length][1] - c[(i + 1) % c.length][0] * p[1], 0)) / 2;
    const A = lower.reduce((a, o) => a + area(o.corners), 0);
    out.push({
      withBlocks,
      remedy,
      result,
      ok: !!result && result.checks.every((c) => c.eta <= 1) && (!result.slab || result.slab.global.eta <= 1),
      ...(slab && result?.slab ? { slabQ: Math.max(...result.slab.zones.map((z) => z.q)) } : {}),
      ...(!slab && lower.length
        ? { groundMean: lower.reduce((a, o) => a + o.ground!.mean * area(o.corners), 0) / Math.max(A, 1), groundMax: Math.max(...lower.map((o) => o.ground!.max)) }
        : {}),
      packingKg: (result?.materials ?? remedy.materials).reduce((a, m) => a + m.massKg, 0),
      height: Math.max(0, ...(result?.stacks ?? []).map((s) => s.known)),
    });
  }
  // conseillée : parmi celles qui passent, la plus légère pour la dalle (charge répartie), sinon le calage le plus léger
  const key = (v: SleeperVariant) => (slab ? (v.slabQ ?? Infinity) : v.packingKg);
  const best = out.filter((v) => v.ok).sort((a, b) => key(a) - key(b))[0];
  if (best && out.length > 1) best.recommended = true;
  return out;
}
