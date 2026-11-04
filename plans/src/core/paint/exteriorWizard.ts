// « Peindre les côtés extérieurs des Viewbox » dès la génération du jeu de plans (A. Pinchart 04.11.2026) : les
// opérations de peinture (nouvelle couleur RAL si besoin + zone « côtés extérieurs ») faites d'un coup, comme le
// dialogue « 🧱 Côtés extérieurs » de l'éditeur. Pur, testé.
import type { ExteriorRule } from './exterior';
import { defaultExclude, exteriorLabel } from './exterior';
import { nextTag } from './ops';
import type { RalColor } from './ral';
import type { PaintColor, PaintOp, PaintSettings, PaintZone } from './types';

export interface ExteriorChoice {
  /** couleur déjà dans la palette du modèle */
  colorId?: string;
  /** sinon une nouvelle couleur RAL (ajoutée à la palette, repère P suivant) */
  ral?: RalColor;
  sides: Array<'long' | 'short'>;
}

export function exteriorPaintOps(
  paint: PaintSettings,
  choice: ExteriorChoice,
  ctx: { categories: Iterable<string>; moduleCount: number; uid: (prefix: string) => string; now?: string; by?: string },
): { ops: PaintOp[]; colorId: string; tag: string } | null {
  const now = ctx.now ?? new Date().toISOString();
  const ops: PaintOp[] = [];
  let color = choice.colorId ? paint.colors.find((c) => c.id === choice.colorId) : undefined;
  if (!color && choice.ral) {
    // même RAL déjà dans la palette : on la réutilise (pas de doublon P1 / P2 de la même couleur)
    color = paint.colors.find((c) => c.system === 'RAL' && c.code === choice.ral!.code);
    if (!color) {
      color = { id: ctx.uid('c'), tag: nextTag(paint.colors), name: choice.ral.fr, system: 'RAL', code: choice.ral.code, hex: choice.ral.hex, createdAt: now } as PaintColor;
      ops.push({ op: 'color.put', color });
    }
  }
  if (!color || !choice.sides.length) return null;
  const rule: ExteriorRule = { sides: [...choice.sides].sort(), exclude: defaultExclude(ctx.categories) };
  // même couleur déjà posée sur les côtés extérieurs : la zone est remplacée (pas empilée)
  const existing = paint.zones.find((z) => z.target.scope === 'exterior' && z.colorId === color!.id);
  const zone: PaintZone = {
    id: existing?.id ?? ctx.uid('z'),
    colorId: color.id,
    target: { scope: 'exterior', match: {}, exterior: rule },
    label: exteriorLabel(rule, ctx.moduleCount),
    source: 'click',
    createdAt: now,
    ...(ctx.by ? { by: ctx.by } : {}),
  };
  ops.push({ op: 'zone.put', zone });
  return { ops, colorId: color.id, tag: color.tag };
}
