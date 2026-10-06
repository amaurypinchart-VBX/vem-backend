// Plan des appuis (écran et PDF) et fiche de calage A4 d'une page : hypothèses, plan, calage par type d'appui,
// matériel à préparer, réserves. SVG en mm (viewBox 210 × 297), converti en PDF vectoriel par sheets/pdf/pdf.ts.
import type { ReactNode } from 'react';
import type { CalageResult, SupportCheck } from '../core/calage';
import type { EstimateModule, GroupReaction, P2 } from '../core/estimate';
import { groupTypeKey } from '../core/estimate';
import { GROUND_NOTE } from '../core/ground';
import type { Lang } from './i18n';
import { LABELS, num } from './i18n';
import { CALAGE_LABELS } from './calageI18n';
import { translate } from './translate';
import { typeColor } from './calagePlan';
import { verdictOf } from '../core/records';
import { fmtNumber } from '../core/units';
import { FONT_SANS } from '../../sheets/template';
import { LOGO_COLOR, VIEWBOX_WORDMARK } from '../../sheets/logos';

export const TYPE_COLORS: Record<string, string> = { '1': '#2563eb', '2': '#16a34a', '3': '#d97706', '4': '#dc2626', M: '#7c3aed', E: '#0891b2' };
export const typeKey = (r: GroupReaction) => groupTypeKey(r.group);

const n1 = (v: number, d = 1) => fmtNumber(v, d);

interface PlanProps {
  modules: EstimateModule[];
  reactions: GroupReaction[];
  /** cadre de dessin (unités de l'appelant : px à l'écran, mm dans le PDF) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** taille des textes (mêmes unités) */
  text: number;
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** texte au centre de l'emprise au sol (sinon le nombre de niveaux) et teinte de l'emprise */
  zoneLabel?: (m: EstimateModule, levels: number) => string[];
  zoneFill?: (m: EstimateModule) => string | undefined;
  /** repère d'implantation : origine en bas à gauche, x vers la droite, y vers le haut */
  axes?: boolean;
  /** couleur de chaque appui (sinon celle de son type) et seconde ligne de son étiquette (sinon Rz,k) */
  pointColor?: (r: GroupReaction) => string | undefined;
  pointSub?: (r: GroupReaction) => string | undefined;
  /** plaques de calage à l'échelle, à leur place (sous les points) */
  plates?: PlanPlate[];
}

/** Plaque de calage en plan (mêmes coordonnées que les Viewbox). */
export interface PlanPlate {
  id: string;
  corners: P2[];
  color: string;
  /** centrée sous l'appui (dépasse de l'installation) */
  centered?: boolean;
}

/** Plaques de calage des appuis (couche du dessous), pour les plans A4. */
export function planPlates(checks: SupportCheck[]): PlanPlate[] {
  return checks.filter((c) => c.plan).map((c) => ({ id: c.id, corners: c.plan!.corners, color: typeColor(c.typeKey), centered: c.plan!.placement === 'centered' && c.plan!.overhang > 5 }));
}

/** « VBX-01/04 » : numéros des Viewbox d'une même emprise, triés (même préfixe regroupé). */
export function compactModuleIds(ids: string[]): string {
  const sorted = [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const m = sorted.map((id) => /^(.*?)(\d+)$/.exec(id));
  if (sorted.length > 1 && m.every((x) => x && x[1] === m[0]![1])) return m[0]![1] + m.map((x) => x![2]).join('/');
  return sorted.join(', ');
}

/** Vue de dessus : emprises des Viewbox (nombre de niveaux au centre), groupes d'appuis colorés par type avec Rz,k. */
export function GroundPlan({ modules, reactions, x, y, w, h, text, selected, onSelect, zoneLabel, zoneFill, axes, pointColor, pointSub, plates }: PlanProps) {
  const pts = [...modules.flatMap((m) => m.corners), ...(plates ?? []).flatMap((p) => p.corners)];
  if (!pts.length) return null;
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const margin = text * 3;
  const s = Math.min((w - 2 * margin) / Math.max(maxX - minX, 1), (h - 2 * margin) / Math.max(maxY - minY, 1));
  const ox = x + (w - (maxX - minX) * s) / 2;
  const oy = y + (h - (maxY - minY) * s) / 2;
  const X = (v: number) => ox + (v - minX) * s;
  const Y = (v: number) => oy + (v - minY) * s;
  // niveaux par emprise (Viewbox empilées au même endroit)
  const stacks = new Map<string, { m: EstimateModule; n: number; ids: string[] }>();
  for (const m of modules) {
    const cx = Math.round(m.corners.reduce((a, p) => a + p[0], 0) / 4 / 200);
    const cy = Math.round(m.corners.reduce((a, p) => a + p[1], 0) / 4 / 200);
    const k = `${cx},${cy}`;
    const e = stacks.get(k);
    if (!e) stacks.set(k, { m, n: 1, ids: [m.id] });
    else {
      e.n++;
      e.ids.push(m.id);
      if (m.level < e.m.level) e.m = m;
    }
  }
  // pastilles plus petites quand des appuis sont très proches (vérins de Viewbox voisines, 31 cm)
  const P = reactions.map((re) => [X(re.group.position[0]), Y(re.group.position[1])] as const);
  let dmin = Infinity;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) dmin = Math.min(dmin, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]));
  const r = Math.max(text * 0.45, Math.min(Math.max(text * 0.9, 250 * s), 0.4 * dmin));
  return (
    <g fontFamily={FONT_SANS}>
      {[...stacks.values()].map(({ m, n, ids }) => {
        const c = m.corners;
        const cx = c.reduce((a, p) => a + p[0], 0) / 4;
        const cy = c.reduce((a, p) => a + p[1], 0) / 4;
        // numéro des Viewbox de l'emprise (empilées : « VBX-01/04 »), puis le texte de l'appelant
        const lines = [compactModuleIds(ids), ...(zoneLabel?.(m, n) ?? [n > 1 ? `${n} niveaux` : m.level > 0 ? `niveau ${m.level}` : '1 niveau'])];
        return (
          <g key={m.id}>
            <polygon
              points={c.map((p) => `${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`).join(' ')}
              fill={m.level === 0 ? (zoneFill?.(m) ?? '#eef1f6') : 'none'}
              stroke="#1a021d"
              strokeWidth={text * 0.08}
              strokeDasharray={m.level === 0 ? undefined : `${text * 0.4} ${text * 0.3}`}
            />
            {lines.map((t, k) => (
              <text
                key={k}
                fontFamily={FONT_SANS}
                x={X(cx)}
                y={Y(cy) + text * 0.35 + (k - (lines.length - 1) / 2) * text * 1.1}
                fontSize={text * 0.9}
                textAnchor="middle"
                fontWeight={k === 0 || (k === 1 && zoneLabel) ? 700 : undefined}
                fill={k === 0 ? '#1a021d' : k === 1 && zoneLabel ? '#111827' : '#6b7280'}
              >
                {t}
              </text>
            ))}
          </g>
        );
      })}
      {(plates ?? []).map((p) => (
        <g key={`pl${p.id}`}>
          <polygon
            points={p.corners.map((q) => `${X(q[0]).toFixed(2)},${Y(q[1]).toFixed(2)}`).join(' ')}
            fill={p.color}
            fillOpacity={0.22}
            stroke={p.color}
            strokeWidth={text * 0.09}
            strokeDasharray={p.centered ? `${text * 0.35} ${text * 0.2}` : undefined}
          />
          {p.centered && (
            <text fontFamily={FONT_SANS} x={X(Math.max(...p.corners.map((q) => q[0])))} y={Y(Math.min(...p.corners.map((q) => q[1]))) + text * 0.7} fontSize={text * 0.75} textAnchor="end" fill={p.color}>
              ▲
            </text>
          )}
        </g>
      ))}
      {reactions.map((re, k) => {
        const col = pointColor?.(re) ?? TYPE_COLORS[typeKey(re)];
        const sel = selected === re.group.id;
        // appuis voisins très proches (vérins de Viewbox côte à côte) : étiquettes vers l'extérieur du groupe
        const [qx, qy] = P[k];
        const group = P.filter(([ox, oy]) => Math.hypot(ox - qx, oy - qy) < text * 3.5);
        const gx = group.reduce((a, g) => a + g[0], 0) / group.length;
        const gy = group.reduce((a, g) => a + g[1], 0) / group.length;
        const sx = group.length < 2 || Math.abs(qx - gx) < text * 0.1 ? 0 : Math.sign(qx - gx);
        const sy = group.length < 2 || Math.abs(qy - gy) < text * 0.1 ? 0 : Math.sign(qy - gy);
        const lx = sx ? qx + sx * (r + text * 0.25) : qx;
        const anchor = sx < 0 ? 'end' : sx > 0 ? 'start' : 'middle';
        // deux lignes (numéro, charge) : à côté du point, au-dessus ou au-dessous
        const [y1, y2] =
          group.length < 2
            ? [qy - r - text * 0.3, qy + r + text * 0.95]
            : sx
              ? [qy - text * 0.1 + sy * text * 0.8, qy + text * 0.8 + sy * text * 0.8]
              : sy < 0
                ? [qy - r - text * 1.15, qy - r - text * 0.3]
                : [qy + r + text * 0.95, qy + r + text * 1.8];
        const labels = [
          { t: re.group.id, yy: y1, size: text * 0.85, bold: true },
          { t: pointSub?.(re) ?? `${n1(re.Rk / 1e3, 0)} kN`, yy: y2, size: text * 0.8, bold: false },
        ];
        return (
          <g key={re.group.id} onClick={onSelect ? () => onSelect(re.group.id) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}>
            <circle cx={qx} cy={qy} r={r} fill={col} stroke={sel ? '#111827' : '#ffffff'} strokeWidth={sel ? text * 0.2 : text * 0.08} />
            {labels.map((l, i) => {
              const w = l.t.length * l.size * 0.58;
              const x0 = anchor === 'end' ? lx - w : anchor === 'start' ? lx : lx - w / 2;
              return (
                <g key={i}>
                  {/* fond blanc : l'étiquette reste lisible sur les rives */}
                  <rect x={x0} y={l.yy - l.size * 0.85} width={w} height={l.size * 1.05} fill="#ffffff" />
                  <text fontFamily={FONT_SANS} x={lx} y={l.yy} fontSize={l.size} textAnchor={anchor} fontWeight={l.bold ? 700 : undefined} fill="#111827">
                    {l.t}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      {axes && (
        <g stroke="#111827" strokeWidth={text * 0.08} fill="none">
          {/* origine ⊕ au coin bas gauche ; flèches x / y à côté, hors du plan */}
          <circle cx={X(minX)} cy={Y(maxY)} r={r * 1.2} />
          <path d={`M ${X(minX) - r * 1.8} ${Y(maxY)} H ${X(minX) + r * 1.8} M ${X(minX)} ${Y(maxY) - r * 1.8} V ${Y(maxY) + r * 1.8}`} />
          <path
            d={`M ${X(minX) - text * 2.6} ${Y(maxY) + text * 2.6} h ${text * 2} m ${-text * 0.5} ${-text * 0.25} l ${text * 0.5} ${text * 0.25} l ${-text * 0.5} ${text * 0.25} M ${X(minX) - text * 2.6} ${Y(maxY) + text * 2.6} v ${-text * 2} m ${-text * 0.25} ${text * 0.5} l ${text * 0.25} ${-text * 0.5} l ${text * 0.25} ${text * 0.5}`}
          />
          <text fontFamily={FONT_SANS} x={X(minX) - text * 0.45} y={Y(maxY) + text * 2.9} fontSize={text * 0.8} fill="#111827" stroke="none">
            x
          </text>
          <text fontFamily={FONT_SANS} x={X(minX) - text * 2.85} y={Y(maxY) + text * 0.35} fontSize={text * 0.8} textAnchor="end" fill="#111827" stroke="none">
            y
          </text>
          <text fontFamily={FONT_SANS} x={X(minX) - r * 1.9} y={Y(maxY) - r * 1.1} fontSize={text * 0.75} textAnchor="end" fill="#111827" stroke="none">
            0,0
          </text>
        </g>
      )}
    </g>
  );
}

export interface SheetInfo {
  project: string;
  client?: string;
  source: string;
  date: string;
  /** hypothèses : lignes « libellé : valeur » */
  assumptions: Array<[string, string]>;
}

/** Découpe un texte en lignes d'au plus `max` caractères (largeur moyenne d'Arimo ≈ 0,5 × corps). */
export function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if ((line + ' ' + word).trim().length > max && line) {
      out.push(line);
      line = word;
    } else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out;
}

const W = 210;
const H = 297;
const M = 12;

const typeCols = (lang: Lang): Array<{ title: string; w: number; align?: 'end' }> => {
  const C = CALAGE_LABELS[lang].sheetCols;
  return [
    { title: C.type, w: 34 },
    { title: C.count, w: 9, align: 'end' },
    { title: 'Rz,k', w: 17, align: 'end' },
    { title: 'Rz,Ed', w: 17, align: 'end' },
    { title: `   ${C.solution}`, w: 76 },
    { title: 'η', w: 9, align: 'end' },
    { title: `  ${C.state}`, w: 24 },
  ];
};

/** Lignes d'un tableau : une cellule trop longue pour sa colonne passe à la ligne (Arimo ≈ 0,5 × corps par caractère). */
export function tableLines(cols: Array<{ w: number }>, rows: string[][], size: number): string[][][] {
  return rows.map((r) => r.map((t, i) => (t.length * size * 0.5 > cols[i].w - 1.5 ? wrap(t, Math.max(8, Math.floor((cols[i].w - 1.5) / (size * 0.5)))) : [t])));
}

function Table({ x, y, cols, rows, size }: { x: number; y: number; cols: Array<{ title: string; w: number; align?: 'end' }>; rows: string[][]; size: number }) {
  const lh = size * 1.55;
  const cells: ReactNode[] = [];
  const lines = tableLines(cols, rows, size);
  // première ligne de chaque rangée (rangées de plusieurs lignes)
  const start: number[] = [];
  lines.reduce((at, r) => (start.push(at), at + Math.max(1, ...r.map((c) => c.length))), 1);
  let cx = x;
  cols.forEach((c, i) => {
    const tx = c.align === 'end' ? cx + c.w - 1 : cx + 1;
    cells.push(
      <text fontFamily={FONT_SANS} key={`h${i}`} x={tx} y={y + size} fontSize={size} fontWeight={700} textAnchor={c.align === 'end' ? 'end' : 'start'} fill="#374151">
        {c.title}
      </text>,
    );
    lines.forEach((r, k) =>
      r[i].forEach((t, j) =>
        cells.push(
          <text fontFamily={FONT_SANS} key={`c${i}-${k}-${j}`} x={tx} y={y + size + lh * (start[k] + j)} fontSize={size} textAnchor={c.align === 'end' ? 'end' : 'start'} fill="#111827">
            {j ? `  ${t.trim()}` : t}
          </text>,
        ),
      ),
    );
    cx += c.w;
  });
  const total = cols.reduce((a, c) => a + c.w, 0);
  return (
    <g>
      <line x1={x} x2={x + total} y1={y + size * 1.45} y2={y + size * 1.45} stroke="#9ca3af" strokeWidth={0.2} />
      {cells}
    </g>
  );
}

/** Fiche de calage A4 portrait (une page), en français, allemand ou anglais. */
export function GroundSheetSvg({ result, modules, info, lang = 'fr' }: { result: CalageResult; modules: EstimateModule[]; info: SheetInfo; lang?: Lang }) {
  const C = CALAGE_LABELS[lang];
  const L = LABELS[lang];
  const E = (t: string) => translate(lang, t);
  const N = (v: number, d = 1) => num(lang, v, d);
  const logoW = 34;
  const body = 2.6;
  const title = (t: string, y: number) => (
    <text fontFamily={FONT_SANS} x={M} y={y} fontSize={3.4} fontWeight={700} fill="#1a021d">
      {t}
    </text>
  );
  let y = 38;
  const blocks: ReactNode[] = [];
  // 1. hypothèses
  blocks.push(<g key="t1">{title(C.s1, y)}</g>);
  y += 5;
  // une ligne par hypothèse (les valeurs sont parfois longues)
  info.assumptions.forEach(([k, v], i) => {
    blocks.push(
      <g key={`a${i}`}>
        <text fontFamily={FONT_SANS} x={M} y={y + i * 3.6} fontSize={body} fill="#6b7280">
          {k}
        </text>
        <text fontFamily={FONT_SANS} x={M + 48} y={y + i * 3.6} fontSize={body} fill="#111827">
          {v}
        </text>
      </g>,
    );
  });
  y += info.assumptions.length * 3.6 + 3;
  // 2. plan des appuis et des plaques
  const fem = result.estimate.method === 'fem';
  blocks.push(<g key="t2">{title(C.s2(fem), y)}</g>);
  const planH = 66;
  blocks.push(
    <g key="plan">
      <rect x={M} y={y + 2} width={W - 2 * M} height={planH} fill="none" stroke="#d1d5db" strokeWidth={0.2} />
      <GroundPlan modules={modules} reactions={result.estimate.reactions} x={M} y={y + 2} w={W - 2 * M} h={planH} text={2.4} plates={planPlates(result.checks)} zoneLabel={(m, n) => [n > 1 ? C.levels(n) : m.level > 0 ? C.level(m.level) : C.levels(1)]} />
    </g>,
  );
  y += planH + 8;
  // 3. calage par type
  blocks.push(<g key="t3">{title(C.s3, y)}</g>);
  y += 3;
  const cols = typeCols(lang);
  const typeRows = result.types.map((t) => [
    E(t.label),
    String(t.reactions.length),
    `${N(t.Rzk / 1e3)} kN`,
    `${N(t.RzEd / 1e3)} kN`,
    `   ${t.chosen ? E(t.chosen.summary) : '—'}`,
    t.chosen ? N(t.chosen.eta, 2) : '—',
    `  ${t.chosen ? (t.standard ? (verdictOf(t.chosen.eta) === 'limit' ? C.stateLimit : C.stateOk) : C.stateOut) : C.stateNone}`,
  ]);
  blocks.push(<Table key="types" x={M} y={y} size={2.4} cols={cols} rows={typeRows} />);
  y += 2.4 * 1.55 * (tableLines(cols, typeRows, 2.4).reduce((a, r) => a + Math.max(1, ...r.map((c) => c.length)), 0) + 1) + 4;
  if (result.longrine) {
    blocks.push(
      <text fontFamily={FONT_SANS} key="lg" x={M} y={y} fontSize={body} fill="#111827">
        {C.longrineVariant(E(result.longrine.solution.summary), N(result.longrine.result.eta, 2))}
      </text>,
    );
    y += 5;
  }
  // 4. matériel
  blocks.push(<g key="t4">{title(C.s4, y)}</g>);
  y += 3;
  const mats = result.materials;
  const SC = C.sheetCols;
  const matCols: Array<{ title: string; w: number; align?: 'end' }> = [
    { title: SC.designation, w: 60 },
    { title: SC.dims, w: 60 },
    { title: SC.qty, w: 26, align: 'end' },
    { title: SC.mass, w: 40, align: 'end' },
  ];
  const matRows = mats.length ? mats.map((m) => [E(m.label), E(m.dims), String(m.quantity), `${N(m.massKg, 0)} kg`]) : [[C.none, '', '', '']];
  blocks.push(<Table key="mat" x={M} y={y} size={2.4} cols={matCols} rows={matRows} />);
  y += 2.4 * 1.55 * (tableLines(matCols, matRows, 2.4).reduce((a, r) => a + Math.max(1, ...r.map((c) => c.length)), 0) + 1) + 5;
  const jacks = result.estimate.reactions.some((r) => r.group.jack);
  const para = (key: string, lines: string[], size: number, step: number, color = '#374151', width = 125) => {
    for (const [i, n] of lines.entries())
      for (const [k, line] of wrap(n, width).entries()) {
        if (y > H - 16) return;
        blocks.push(
          <text fontFamily={FONT_SANS} key={`${key}${i}-${k}`} x={M + (k ? 3 : 0)} y={y} fontSize={size} fill={color}>
            {k ? line : `• ${line}`}
          </text>,
        );
        y += step;
      }
  };
  // 5. références réglementaires (Prüfbuch TÜV)
  blocks.push(<g key="t5">{title(C.s5, y)}</g>);
  y += 4.2;
  const tuvLine = !result.tuv.tuvMinimum ? C.tuvOff : result.tuv.ok === false ? C.tuvKo(result.types.filter((t) => t.tuv?.ok === false).map((t) => E(t.label)).join(', ')) : result.tuv.ok ? C.tuvOk : '';
  para('lg', [...C.legal(jacks), ...(tuvLine ? [tuvLine] : [])], 2.1, 2.9, '#374151', 140);
  y += 2;
  // 6. réserves
  blocks.push(<g key="t6">{title(C.s6, y)}</g>);
  y += 4.2;
  const notes = [
    ...result.warnings.map(E),
    lang === 'fr' ? GROUND_NOTE : L.groundNote,
    fem ? C.femNote : C.estimateNote,
    C.platesNote,
    ...(result.roadwayOn ? [C.roadwayUsed(N(result.roadway.load / 1e3, 0), N(result.roadway.area / 1e6, 1), N(result.roadway.mean * 1e3, 1))] : []),
  ];
  para('n', notes, 2.2, 3.1);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${W}mm`} height={`${H}mm`} viewBox={`0 0 ${W} ${H}`} fontFamily={FONT_SANS}>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      <text fontFamily={FONT_SANS} x={W / 2} y={H / 2} fontSize={8} fill="#9ca3af" fillOpacity={0.18} textAnchor="middle" fontWeight={700} transform={`rotate(-55 ${W / 2} ${H / 2})`}>
        {C.watermark}
      </text>
      <text fontFamily={FONT_SANS} x={M} y={M + 6} fontSize={6} fontWeight={700} fill="#1a021d">
        {C.sheetTitle}
      </text>
      <text fontFamily={FONT_SANS} x={M} y={M + 11.5} fontSize={3} fill="#111827">
        {info.project}
        {info.client ? ` — ${info.client}` : ''}
      </text>
      <text fontFamily={FONT_SANS} x={M} y={M + 16} fontSize={2.5} fill="#6b7280">
        {`${info.source} · ${info.date}`}
      </text>
      <g transform={`translate(${W - M - logoW} ${M - 2}) scale(${logoW / VIEWBOX_WORDMARK.width})`}>
        <path d={VIEWBOX_WORDMARK.d} transform={VIEWBOX_WORDMARK.transform} fill={LOGO_COLOR} />
      </g>
      <line x1={M} x2={W - M} y1={M + 18} y2={M + 18} stroke="#1a021d" strokeWidth={0.3} />
      {blocks}
      <line x1={M} x2={W - M} y1={H - 12} y2={H - 12} stroke="#d1d5db" strokeWidth={0.2} />
      <text fontFamily={FONT_SANS} x={M} y={H - 8} fontSize={2.2} fill="#6b7280">
        {C.footerSheet(fem)}
      </text>
      <text fontFamily={FONT_SANS} x={W - M} y={H - 8} fontSize={2.2} fill="#6b7280" textAnchor="end">
        1 / 1
      </text>
    </svg>
  );
}
