// Plan du calage retenu en figure du rapport : le même dessin que le plan « pression au sol » de l'étape 5 et de la
// fiche de calage (`checkPlan` + `GroundPlan` : blocs / plaques colorés par taux de travail, madriers de la solution
// retenue avec leurs joints et leur légende, plaques de roulage, zones de dalle), rendu en SVG (mm) pour les pages A4.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CalageResult } from '../core/calage';
import type { EstimateModule } from '../core/estimate';
import { CALAGE_LABELS } from './calageI18n';
import { GroundPlan, checkPlan } from './groundSheet';
import type { Lang } from './i18n';

/** Figure (x, y, w, h en mm → SVG) du plan du calage retenu. */
export function calagePlanFigure(result: CalageResult, modules: Array<Pick<EstimateModule, 'id' | 'level' | 'corners'>>, lang: Lang) {
  const C = CALAGE_LABELS[lang];
  return (x: number, y: number, w: number, h: number): string =>
    renderToStaticMarkup(
      createElement(GroundPlan, {
        modules: modules as EstimateModule[],
        reactions: result.estimate.reactions,
        x,
        y,
        w,
        h,
        text: 2.3,
        ...checkPlan(result, lang),
        zoneLabel: (m: EstimateModule, n: number) => [n > 1 ? C.levels(n) : m.level > 0 ? C.level(m.level) : C.levels(1)],
      }),
    );
}
