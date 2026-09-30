// Plan des appuis (écran et PDF) et fiche de calage A4 d'une page : hypothèses, plan, calage par type d'appui,
// matériel à préparer, réserves. SVG en mm (viewBox 210 × 297), converti en PDF vectoriel par sheets/pdf/pdf.ts.
import type { ReactNode } from 'react';
import type { CalageResult } from '../core/calage';
import type { EstimateModule, GroupReaction } from '../core/estimate';
import { GROUND_NOTE } from '../core/ground';
import { verdictOf } from '../core/records';
import { fmtNumber } from '../core/units';
import { FONT_SANS } from '../../sheets/template';
import { LOGO_COLOR, VIEWBOX_WORDMARK } from '../../sheets/logos';

export const TYPE_COLORS: Record<string, string> = { '1': '#2563eb', '2': '#16a34a', '3': '#d97706', '4': '#dc2626', M: '#7c3aed' };
export const typeKey = (r: GroupReaction) => (r.group.middle ? 'M' : String(Math.min(4, r.group.corners)));

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
}

/** Vue de dessus : emprises des Viewbox (nombre de niveaux au centre), groupes d'appuis colorés par type avec Rz,k. */
export function GroundPlan({ modules, reactions, x, y, w, h, text, selected, onSelect, zoneLabel, zoneFill, axes }: PlanProps) {
  const pts = modules.flatMap((m) => m.corners);
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
  const stacks = new Map<string, { m: EstimateModule; n: number }>();
  for (const m of modules) {
    const cx = Math.round(m.corners.reduce((a, p) => a + p[0], 0) / 4 / 200);
    const cy = Math.round(m.corners.reduce((a, p) => a + p[1], 0) / 4 / 200);
    const k = `${cx},${cy}`;
    const e = stacks.get(k);
    if (!e || m.level < e.m.level) stacks.set(k, { m, n: (e?.n ?? 0) + 1 });
    else e.n++;
  }
  // pastilles plus petites quand des appuis sont très proches (vérins de Viewbox voisines, 31 cm)
  const P = reactions.map((re) => [X(re.group.position[0]), Y(re.group.position[1])] as const);
  let dmin = Infinity;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) dmin = Math.min(dmin, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]));
  const r = Math.max(text * 0.45, Math.min(Math.max(text * 0.9, 250 * s), 0.4 * dmin));
  return (
    <g fontFamily={FONT_SANS}>
      {[...stacks.values()].map(({ m, n }) => {
        const c = m.corners;
        const cx = c.reduce((a, p) => a + p[0], 0) / 4;
        const cy = c.reduce((a, p) => a + p[1], 0) / 4;
        const lines = zoneLabel?.(m, n) ?? [n > 1 ? `${n} niveaux` : m.level > 0 ? `niveau ${m.level}` : '1 niveau'];
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
                fontWeight={k === 0 && zoneLabel ? 700 : undefined}
                fill={k === 0 && zoneLabel ? '#111827' : '#6b7280'}
              >
                {t}
              </text>
            ))}
          </g>
        );
      })}
      {reactions.map((re, k) => {
        const col = TYPE_COLORS[typeKey(re)];
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
          { t: `${n1(re.Rk / 1e3, 0)} kN`, yy: y2, size: text * 0.8, bold: false },
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

function Table({ x, y, cols, rows, size }: { x: number; y: number; cols: Array<{ title: string; w: number; align?: 'end' }>; rows: string[][]; size: number }) {
  const lh = size * 1.55;
  const cells: ReactNode[] = [];
  let cx = x;
  cols.forEach((c, i) => {
    const tx = c.align === 'end' ? cx + c.w - 1 : cx + 1;
    cells.push(
      <text fontFamily={FONT_SANS} key={`h${i}`} x={tx} y={y + size} fontSize={size} fontWeight={700} textAnchor={c.align === 'end' ? 'end' : 'start'} fill="#374151">
        {c.title}
      </text>,
    );
    rows.forEach((r, k) =>
      cells.push(
        <text fontFamily={FONT_SANS} key={`c${i}-${k}`} x={tx} y={y + size + lh * (k + 1)} fontSize={size} textAnchor={c.align === 'end' ? 'end' : 'start'} fill="#111827">
          {r[i]}
        </text>,
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

/** Fiche de calage A4 portrait (une page). */
export function GroundSheetSvg({ result, modules, info }: { result: CalageResult; modules: EstimateModule[]; info: SheetInfo }) {
  const logoW = 34;
  const body = 2.6;
  const title = (t: string, y: number) => (
    <text fontFamily={FONT_SANS} x={M} y={y} fontSize={3.4} fontWeight={700} fill="#1a021d">
      {t}
    </text>
  );
  let y = 38;
  const blocks: ReactNode[] = [];
  // 1. hypothèses (deux colonnes)
  blocks.push(<g key="t1">{title('1. Installation et hypothèses', y)}</g>);
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
  // 2. plan des appuis
  const fem = result.estimate.method === 'fem';
  blocks.push(<g key="t2">{title(fem ? '2. Plan des appuis (réactions caractéristiques du calcul complet)' : '2. Plan des appuis (réactions caractéristiques estimées)', y)}</g>);
  const planH = 72;
  blocks.push(
    <g key="plan">
      <rect x={M} y={y + 2} width={W - 2 * M} height={planH} fill="none" stroke="#d1d5db" strokeWidth={0.2} />
      <GroundPlan modules={modules} reactions={result.estimate.reactions} x={M} y={y + 2} w={W - 2 * M} h={planH} text={2.4} />
    </g>,
  );
  y += planH + 8;
  // 3. calage par type
  blocks.push(<g key="t3">{title('3. Calage par type d’appui', y)}</g>);
  y += 3;
  const rows = result.types.map((t) => [
    t.label,
    String(t.reactions.length),
    `${n1(t.Rzk / 1e3)} kN`,
    `${n1(t.RzEd / 1e3)} kN`,
    t.chosen ? t.chosen.summary : '—',
    t.chosen ? n1(t.chosen.eta, 2) : '—',
    t.chosen ? (t.standard ? (verdictOf(t.chosen.eta) === 'limit' ? 'limite' : 'OK') : 'hors standard') : 'aucune',
  ]);
  blocks.push(
    <Table
      key="types"
      x={M}
      y={y}
      size={2.4}
      cols={[
        { title: 'Type', w: 34 },
        { title: 'Nb', w: 9, align: 'end' },
        { title: 'Rz,k', w: 17, align: 'end' },
        { title: 'Rz,Ed', w: 17, align: 'end' },
        { title: '   Solution retenue', w: 76 },
        { title: 'η', w: 9, align: 'end' },
        { title: '  État', w: 24 },
      ]}
      rows={rows.map((r) => [r[0], r[1], r[2], r[3], `   ${r[4]}`, r[5], `  ${r[6]}`])}
    />,
  );
  y += 2.4 * 1.55 * (rows.length + 1) + 4;
  if (result.longrine) {
    blocks.push(
      <text fontFamily={FONT_SANS} key="lg" x={M} y={y} fontSize={body} fill="#111827">
        {`Variante longrines : ${result.longrine.solution.summary} (η = ${n1(result.longrine.result.eta, 2)}).`}
      </text>,
    );
    y += 5;
  }
  // 4. matériel
  blocks.push(<g key="t4">{title('4. Matériel à préparer', y)}</g>);
  y += 3;
  const mats = result.materials;
  blocks.push(
    <Table
      key="mat"
      x={M}
      y={y}
      size={2.4}
      cols={[
        { title: 'Désignation', w: 60 },
        { title: 'Dimensions', w: 60 },
        { title: 'Quantité', w: 26, align: 'end' },
        { title: 'Masse totale', w: 40, align: 'end' },
      ]}
      rows={
        mats.length
          ? mats.map((m) => [m.label, m.dims, String(m.quantity), `${n1(m.massKg, 0)} kg`])
          : [['aucune solution standard', '', '', '']]
      }
    />,
  );
  y += 2.4 * 1.55 * (Math.max(1, mats.length) + 1) + 5;
  // 5. réserves
  blocks.push(<g key="t5">{title('5. Réserves', y)}</g>);
  y += 4.5;
  const notes = [
    ...result.warnings,
    GROUND_NOTE,
    fem
      ? 'Réactions du calcul complet (modèle 3D, 2ᵉ ordre, combinaisons statico) : Rz,k maxi de chaque appui sur les combinaisons ELS.'
      : 'Valeurs issues d’une estimation (surfaces tributaires et basculement en bloc rigide), à confirmer par le calcul complet de l’étude structure.',
    'Plaques : pression uniforme supposée sous la plaque (méthode statico) ; contreplaqué F40/30, kmod 0,9, γM 1,3.',
  ];
  for (const n of notes)
    for (const [k, line] of wrap(n, 125).entries()) {
      if (y > H - 20) break;
      blocks.push(
        <text fontFamily={FONT_SANS} key={`n${y}`} x={M + (k ? 3 : 0)} y={y} fontSize={2.3} fill="#374151">
          {k ? line : `• ${line}`}
        </text>,
      );
      y += 3.3;
    }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${W}mm`} height={`${H}mm`} viewBox={`0 0 ${W} ${H}`} fontFamily={FONT_SANS}>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      <text fontFamily={FONT_SANS} x={W / 2} y={H / 2} fontSize={8} fill="#9ca3af" fillOpacity={0.18} textAnchor="middle" fontWeight={700} transform={`rotate(-55 ${W / 2} ${H / 2})`}>
        PRÉ-ÉTUDE INTERNE — NON VÉRIFIÉE PAR UN INGÉNIEUR
      </text>
      <text fontFamily={FONT_SANS} x={M} y={M + 6} fontSize={6} fontWeight={700} fill="#1a021d">
        FICHE DE CALAGE
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
        {`VEM · Plans Viewbox · Étude structure — ${fem ? 'calage' : 'estimation du calage'} (pré-étude, non vérifiée)`}
      </text>
      <text fontFamily={FONT_SANS} x={W - M} y={H - 8} fontSize={2.2} fill="#6b7280" textAnchor="end">
        1 / 1
      </text>
    </svg>
  );
}
