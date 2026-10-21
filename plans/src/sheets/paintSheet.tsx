// Peinture sur les planches : contours des faces peintes visibles (sous le dessin), repères « P1 » et légende
// « PAINTING ». Calques DXF VBX-PEINTURE-<code>, VBX-PEINTURE-REPERES, VBX-PEINTURE-LEGENDE.
import type { PaintColor } from '../core/paint/types';
import { colorCode, luminance } from '../core/paint/ops';
import type { PaintRegion } from '../linework/paintOverlay';
import type { PaintLegendItem, PointMm, RectMm } from './types';
import { FONT_SANS } from './template';

/** Peinture d'une fenêtre de vue (calculée par la banque des vues). */
export interface ViewportPaint {
  regions: PaintRegion[];
  colors: Map<string, PaintColor>;
}

/** Couleurs et surfaces du projet, pour la légende. */
export interface PaintSheetInfo {
  colors: PaintColor[];
  /** surface peinte (m²) par couleur, tout le modèle */
  areas: Map<string, number>;
  /** couleurs visibles sur au moins une vue du jeu */
  usedInSet: Set<string>;
}

const num = (v: number) => Math.round(v * 1000) / 1000;

/** « VBX-PEINTURE-RAL9005 » ; couleur libre : son nom en majuscules sans accents. */
export function paintLayer(c: PaintColor | undefined): string {
  if (!c) return 'VBX-PEINTURE';
  const raw = c.system === 'RAL' && c.code ? `RAL${c.code}` : c.code || c.name || c.tag;
  const clean = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `VBX-PEINTURE-${clean || c.tag}`;
}

/** Trait d'une couleur sur le papier blanc : les couleurs très claires sont foncées pour rester lisibles. */
export function strokeOf(hex: string): string {
  if (luminance(hex) < 0.6) return hex;
  const k = 0.55;
  const out = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const loopsD = (loops: Float64Array[]) => {
  let d = '';
  for (const l of loops) {
    if (l.length < 6) continue;
    d += `M${num(l[0])} ${num(l[1])}`;
    for (let i = 2; i < l.length; i += 2) d += `L${num(l[i])} ${num(l[i + 1])}`;
    d += 'Z';
  }
  return d;
};

/** Contours des faces peintes (repère du dessin, mm modèle ; `s` = échelle) : sous les traits de la vue. */
export function PaintOutlines({ paint, s, preview }: { paint?: ViewportPaint; s: number; preview?: PaintRegion[] }) {
  if (!paint?.regions.length && !preview?.length) return null;
  const byColor = new Map<string, PaintRegion[]>();
  for (const r of paint?.regions ?? []) byColor.set(r.colorId, [...(byColor.get(r.colorId) ?? []), r]);
  return (
    <>
      {[...byColor].map(([colorId, regions]) => {
        const c = paint!.colors.get(colorId);
        if (!c) return null;
        return (
          <path
            key={`paint-${colorId}`}
            d={loopsD(regions.flatMap((r) => r.loops))}
            fill="none"
            stroke={strokeOf(c.hex)}
            strokeWidth={num(0.35 * s)}
            strokeLinejoin="round"
            fillRule="evenodd"
            data-dxf={paintLayer(c)}
          />
        );
      })}
      {!!preview?.length && <path d={loopsD(preview.flatMap((r) => r.loops))} fill="#fb923c" fillOpacity={0.25} stroke="#f97316" strokeWidth={num(0.6 * s)} data-paint-preview="1" />}
    </>
  );
}

/**
 * Repères « P1 » : cercle + texte (2,5 mm papier × gabarit) au point le plus intérieur de chaque région ; région trop
 * petite → repère à côté avec une ligne de rappel ; pas deux repères l'un sur l'autre ; 8 par couleur et par vue au plus.
 */
export function PaintTags({ paint, s, k, toPaper, rect }: { paint?: ViewportPaint; s: number; k: number; toPaper: (x: number, y: number) => PointMm; rect: RectMm }) {
  if (!paint?.regions.length) return null;
  const r = 2.4 * k;
  const placed: PointMm[] = [];
  const perColor = new Map<string, number>();
  const tags: Array<{ key: string; c: PaintColor; at: PointMm; from?: PointMm }> = [];
  for (const [i, reg] of paint.regions.entries()) {
    const c = paint.colors.get(reg.colorId);
    if (!c) continue;
    const n = perColor.get(c.id) ?? 0;
    if (n >= 8) continue;
    // région de moins de 1,5 × 1,5 mm sur le papier : contour seulement
    if (reg.area / (s * s) < 2.25 && n > 0) continue;
    const a = toPaper(reg.anchor.x, reg.anchor.y);
    let at = a;
    let from: PointMm | undefined;
    if (reg.anchor.d / s < r * 1.1) {
      from = a;
      at = { x: a.x + 5 * k, y: a.y - 5 * k };
    }
    for (let tries = 0; tries < 6 && placed.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < 2 * r + 0.4 * k); tries++) {
      from = from ?? a;
      at = { x: at.x + (2 * r + 1 * k) * (tries % 2 ? -1 : 1) * Math.ceil((tries + 1) / 2), y: at.y - 2 * k };
    }
    if (at.x < rect.x + r || at.x > rect.x + rect.w - r || at.y < rect.y + r || at.y > rect.y + rect.h - r) {
      if (from) at = a;
      if (at.x < rect.x || at.x > rect.x + rect.w || at.y < rect.y || at.y > rect.y + rect.h) continue;
      from = undefined;
    }
    placed.push(at);
    perColor.set(c.id, n + 1);
    tags.push({ key: `t${i}`, c, at, from });
  }
  return (
    <g data-dxf="VBX-PEINTURE-REPERES" fontFamily={FONT_SANS}>
      {tags.map(({ key, c, at, from }) => (
        <g key={key}>
          {from && <line x1={num(from.x)} y1={num(from.y)} x2={num(at.x)} y2={num(at.y)} stroke={strokeOf(c.hex)} strokeWidth={num(0.25 * k)} />}
          {from && <circle cx={num(from.x)} cy={num(from.y)} r={num(0.5 * k)} fill={strokeOf(c.hex)} />}
          <circle cx={num(at.x)} cy={num(at.y)} r={num(r)} fill="#fff" stroke={strokeOf(c.hex)} strokeWidth={num(0.35 * k)} />
          <text x={num(at.x)} y={num(at.y + 0.9 * k)} fontSize={num(2.5 * k)} textAnchor="middle" fontWeight={700} fontFamily={FONT_SANS} fill="#000">
            {c.tag}
          </text>
        </g>
      ))}
    </g>
  );
}

export const PAINT_LEGEND_TITLE = { fr: 'PEINTURE', en: 'PAINTING', de: 'ANSTRICH' } as const;
const FINISH: Record<string, { fr: string; en: string; de: string }> = {
  mat: { fr: 'mat', en: 'matt', de: 'matt' },
  satiné: { fr: 'satiné', en: 'satin', de: 'seidenmatt' },
  brillant: { fr: 'brillant', en: 'gloss', de: 'glänzend' },
  texturé: { fr: 'texturé', en: 'textured', de: 'strukturiert' },
  structuré: { fr: 'structuré', en: 'fine texture', de: 'Feinstruktur' },
};

/** m² au format de la langue : « 0,62 m² » / « 0.62 m² » */
const m2 = (v: number, lang: 'fr' | 'en' | 'de') => `${v.toLocaleString(lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-DE' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

/** Légende de la peinture : une ligne par couleur visible (pastille, repère, code, nom, finition, surface). */
export function PaintLegendView({ it, k, info, usedOnSheet }: { it: PaintLegendItem; k: number; info?: PaintSheetInfo; usedOnSheet: Set<string> }) {
  const used = it.scope === 'set' ? info?.usedInSet ?? new Set<string>() : usedOnSheet;
  const rows = (info?.colors ?? []).filter((c) => used.has(c.id));
  const r = it.rect;
  const pad = 2 * k;
  const titleSize = 3 * k;
  const head = titleSize * 1.9;
  const rowH = rows.length ? Math.min(7 * k, (r.h - head - pad) / rows.length) : 7 * k;
  const text = Math.min(2.4 * k, rowH * 0.4);
  return (
    <g>
      <rect x={num(r.x)} y={num(r.y)} width={num(r.w)} height={num(r.h)} fill="#fff" stroke="#000" strokeWidth={num(0.18 * k)} />
      <text x={num(r.x + pad)} y={num(r.y + pad + titleSize * 0.8)} fontSize={num(titleSize)} fontFamily={FONT_SANS} fontWeight={700}>
        {it.title || PAINT_LEGEND_TITLE[it.lang]}
      </text>
      {!rows.length && (
        <text x={num(r.x + pad)} y={num(r.y + head + text * 1.4)} fontSize={num(text)} fontFamily={FONT_SANS} fill="#6b7280">
          {it.lang === 'fr' ? 'Aucune peinture visible' : it.lang === 'de' ? 'Kein Anstrich sichtbar' : 'No painting visible'}
        </text>
      )}
      {rows.map((c, i) => {
        const top = r.y + head + i * rowH;
        const cy = top + rowH / 2;
        const sw = Math.min(5 * k, rowH * 0.7);
        const x0 = r.x + pad;
        const line = [colorCode(c), c.name !== colorCode(c) ? c.name : '', c.finish ? FINISH[c.finish]?.[it.lang] ?? c.finish : ''].filter(Boolean).join(' · ');
        return (
          <g key={c.id}>
            <rect x={num(x0)} y={num(cy - sw / 2)} width={num(sw * 1.4)} height={num(sw)} fill={c.hex} stroke="#000" strokeWidth={num(0.13 * k)} data-dxf={paintLayer(c)} />
            <text x={num(x0 + sw * 1.4 + 1.5 * k)} y={num(cy + text * 0.35)} fontSize={num(text)} fontFamily={FONT_SANS} fontWeight={700}>
              {c.tag}
            </text>
            <text x={num(x0 + sw * 1.4 + 8 * k)} y={num(cy + text * 0.35)} fontSize={num(text)} fontFamily={FONT_SANS}>
              {line}
            </text>
            {it.areas && (
              <text x={num(r.x + r.w - pad)} y={num(cy + text * 0.35)} fontSize={num(text)} fontFamily={FONT_SANS} textAnchor="end">
                {m2(info?.areas.get(c.id) ?? 0, it.lang)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
