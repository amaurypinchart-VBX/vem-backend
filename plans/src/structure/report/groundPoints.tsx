// Plan des appuis au sol (PDF A4 portrait, une ou plusieurs pages) : plan d'implantation avec chaque point d'appui
// (numéro, réaction caractéristique), repère x / y, pression sous plaques de roulage (répartition uniforme sur toute
// la surface et emprise la plus chargée), tableau des points avec leurs coordonnées. SVG en mm (210 × 297).
import type { ReactElement } from 'react';
import type { Estimate, EstimateModule } from '../core/estimate';
import type { RoadwayResult } from '../core/roadway';
import { kNm2, kgm2, planCoords, planOrigin, supportType } from '../core/roadway';
import { verdictOf } from '../core/records';
import { fmtNumber } from '../core/units';
import { FONT_SANS } from '../../sheets/template';
import { LOGO_COLOR, VIEWBOX_WORDMARK } from '../../sheets/logos';
import type { SheetInfo } from './groundSheet';
import { GroundPlan, wrap } from './groundSheet';

const W = 210;
const H = 297;
const M = 12;
const n1 = (v: number, d = 1) => fmtNumber(v, d);

/** Teinte d'une emprise selon sa pression rapportée à la portance (vert → orange → rouge). */
export function pressureFill(eta: number): string {
  if (!Number.isFinite(eta)) return '#e5e7eb';
  if (eta <= 0.6) return '#dcfce7';
  if (eta <= 0.9) return '#fef9c3';
  if (eta <= 1) return '#fed7aa';
  return '#fecaca';
}

const VERDICT_TEXT = { ok: 'OK', limit: 'limite', fail: 'dépassé', incomplete: '—' } as const;

export interface GroundPointsInput {
  modules: EstimateModule[];
  estimate: Estimate;
  roadway: RoadwayResult;
  info: SheetInfo;
  /** libellé de la portance (« 200 kN/m² (prairie) ») */
  bearingLabel: string;
}

const ROW = 2.4 * 1.55;

function Page({ info, page, pages, children }: { info: SheetInfo; page: number; pages: number; children: ReactElement | ReactElement[] }) {
  const logoW = 34;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${W}mm`} height={`${H}mm`} viewBox={`0 0 ${W} ${H}`} fontFamily={FONT_SANS}>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      <text fontFamily={FONT_SANS} x={W / 2} y={H / 2} fontSize={8} fill="#9ca3af" fillOpacity={0.18} textAnchor="middle" fontWeight={700} transform={`rotate(-55 ${W / 2} ${H / 2})`}>
        PRÉ-ÉTUDE INTERNE — NON VÉRIFIÉE PAR UN INGÉNIEUR
      </text>
      <text fontFamily={FONT_SANS} x={M} y={M + 6} fontSize={6} fontWeight={700} fill="#1a021d">
        PLAN DES APPUIS AU SOL
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
      {children}
      <line x1={M} x2={W - M} y1={H - 12} y2={H - 12} stroke="#d1d5db" strokeWidth={0.2} />
      <text fontFamily={FONT_SANS} x={M} y={H - 8} fontSize={2.2} fill="#6b7280">
        VEM · Plans Viewbox · Étude structure — appuis au sol et plaques de roulage (pré-étude, non vérifiée)
      </text>
      <text fontFamily={FONT_SANS} x={W - M} y={H - 8} fontSize={2.2} fill="#6b7280" textAnchor="end">
        {`${page} / ${pages}`}
      </text>
    </svg>
  );
}

const COLS: Array<{ title: string; w: number; align?: 'end' }> = [
  { title: 'Point', w: 14 },
  { title: 'Type', w: 26 },
  { title: 'Viewbox au sol', w: 44 },
  { title: 'x (m)', w: 17, align: 'end' },
  { title: 'y (m)', w: 17, align: 'end' },
  { title: 'Rz,k (kN)', w: 22, align: 'end' },
  { title: 'Rz,Ed (kN)', w: 22, align: 'end' },
  { title: 'Rz,k (t)', w: 20, align: 'end' },
];

function TableRows({ y, rows, header }: { y: number; rows: string[][]; header: boolean }) {
  const size = 2.4;
  const out: ReactElement[] = [];
  let cx = M;
  COLS.forEach((c, i) => {
    const tx = c.align === 'end' ? cx + c.w - 1 : cx + 1;
    const anchor = c.align === 'end' ? 'end' : 'start';
    if (header)
      out.push(
        <text fontFamily={FONT_SANS} key={`h${i}`} x={tx} y={y + size} fontSize={size} fontWeight={700} textAnchor={anchor} fill="#374151">
          {c.title}
        </text>,
      );
    rows.forEach((r, k) =>
      out.push(
        <text fontFamily={FONT_SANS} key={`c${i}-${k}`} x={tx} y={y + size + ROW * (k + (header ? 1 : 0))} fontSize={size} textAnchor={anchor} fill="#111827">
          {r[i]}
        </text>,
      ),
    );
    cx += c.w;
  });
  const total = COLS.reduce((a, c) => a + c.w, 0);
  return (
    <g>
      {header && <line x1={M} x2={M + total} y1={y + size * 1.45} y2={y + size * 1.45} stroke="#9ca3af" strokeWidth={0.2} />}
      {out}
    </g>
  );
}

/** Pages SVG du plan des appuis au sol. */
export function groundPointsPages({ modules, estimate, roadway, info, bearingLabel }: GroundPointsInput): ReactElement[] {
  const o = planOrigin(modules);
  const zoneOf = new Map(roadway.zones.map((z) => [z.module, z]));
  const ground = new Set(modules.filter((m) => m.level === 0).map((m) => m.id));
  const rows = estimate.reactions.map((r) => {
    const [x, y] = planCoords(r.group.position, o);
    const ids = r.group.moduleIds.filter((id) => ground.has(id));
    return [r.group.id, supportType(r), (ids.length ? ids : r.group.moduleIds).join(', '), n1(x / 1e3, 2), n1(y / 1e3, 2), n1(r.Rk / 1e3), n1(r.REd / 1e3), n1(r.Rk / 9.81e3, 2)];
  });
  const title = (t: string, y: number) => (
    <text fontFamily={FONT_SANS} x={M} y={y} fontSize={3.4} fontWeight={700} fill="#1a021d">
      {t}
    </text>
  );
  // page 1 : plan, plaques de roulage, début du tableau
  const first: ReactElement[] = [];
  let y = 38;
  first.push(<g key="t1">{title('1. Plan d’implantation des appuis (Rz,k caractéristique)', y)}</g>);
  // hauteur du cadre selon les proportions de l'installation (installations allongées : plus de place au tableau)
  const pts = modules.flatMap((m) => m.corners);
  const dx = Math.max(1, Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])));
  const dy = Math.max(1, Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])));
  const planH = Math.round(Math.min(130, Math.max(60, ((W - 2 * M - 13) * dy) / dx + 16)));
  first.push(
    <g key="plan">
      <rect x={M} y={y + 2} width={W - 2 * M} height={planH} fill="none" stroke="#d1d5db" strokeWidth={0.2} />
      <GroundPlan
        modules={modules}
        reactions={estimate.reactions}
        x={M}
        y={y + 2}
        w={W - 2 * M}
        h={planH}
        text={2.2}
        axes
        zoneFill={(m) => (zoneOf.get(m.id) ? pressureFill(zoneOf.get(m.id)!.eta) : undefined)}
        zoneLabel={(m, levels) => {
          const z = zoneOf.get(m.id);
          return z ? [`${n1(kNm2(z.q), 1)} kN/m²`, `${levels} niveau${levels > 1 ? 'x' : ''}`] : [`${levels} niveau${levels > 1 ? 'x' : ''}`];
        }}
      />
    </g>,
  );
  y += planH + 5.5;
  const legend = wrap('Coordonnées depuis le coin bas gauche de l’installation (x vers la droite, y vers le haut, vue de dessus SketchUp). Teinte des emprises : pression sous plaques rapportée à la portance.', 140);
  legend.forEach((t, k) =>
    first.push(
      <text fontFamily={FONT_SANS} key={`leg${k}`} x={M} y={y + k * 3} fontSize={2.2} fill="#6b7280">
        {t}
      </text>,
    ),
  );
  y += legend.length * 3 + 3;
  first.push(<g key="t2">{title('2. Plaques de roulage — répartition uniforme', y)}</g>);
  y += 5;
  const v = (eta: number) => VERDICT_TEXT[verdictOf(eta)];
  const lines: Array<[string, string]> = [
    ['Surface couverte', `${n1(roadway.area / 1e6, 2)} m² (emprise des Viewbox posées au sol)`],
    ['Charge verticale totale', `${n1(roadway.load / 1e3, 0)} kN (${n1(roadway.load / 9.81e3, 1)} t), combinaison caractéristique la plus lourde`],
    ['Poids des plaques', roadway.plates > 0 ? `${n1(kNm2(roadway.plates), 2)} kN/m² (${n1(kgm2(roadway.plates), 0)} kg/m²)` : 'non compté'],
    ['Pression uniforme', `${n1(kNm2(roadway.mean), 2)} kN/m² (${n1(kgm2(roadway.mean), 0)} kg/m²) — portance ${bearingLabel} : η = ${n1(roadway.etaMean, 2)} ${v(roadway.etaMean)}`],
  ];
  if (roadway.max)
    lines.push([
      'Emprise la plus chargée',
      `${roadway.max.stack.join(' + ')} : ${n1(kNm2(roadway.max.q), 2)} kN/m² (${n1(kgm2(roadway.max.q), 0)} kg/m²) — η = ${n1(roadway.etaMax, 2)} ${v(roadway.etaMax)}`,
    ]);
  lines.forEach(([k, t], i) =>
    first.push(
      <g key={`r${i}`}>
        <text fontFamily={FONT_SANS} x={M} y={y + i * 3.6} fontSize={2.6} fill="#6b7280">
          {k}
        </text>
        <text fontFamily={FONT_SANS} x={M + 42} y={y + i * 3.6} fontSize={2.6} fill="#111827" fontWeight={k === 'Pression uniforme' ? 700 : undefined}>
          {t}
        </text>
      </g>,
    ),
  );
  y += lines.length * 3.6 + 1;
  const note =
    'Répartition uniforme : plaques assez rigides, jointives et bien posées sur toute la surface ; si les plaques ne répartissent que sous chaque Viewbox, retenir l’emprise la plus chargée. La pression locale sous chaque platine et la flexion des plaques ne sont pas vérifiées ici.';
  for (const [k, line] of wrap(note, 130).entries()) {
    first.push(
      <text fontFamily={FONT_SANS} key={`n${k}`} x={M} y={y + k * 3.2} fontSize={2.3} fill="#374151">
        {line}
      </text>,
    );
  }
  y += wrap(note, 130).length * 3.2 + 4;
  first.push(<g key="t3">{title(`3. Points d’appui (${rows.length})`, y)}</g>);
  y += 2;
  const bottom = H - 16;
  const firstCount = Math.max(0, Math.floor((bottom - y - ROW) / ROW));
  const chunks: string[][][] = [rows.slice(0, firstCount)];
  const perPage = Math.floor((bottom - 38 - ROW) / ROW);
  for (let k = firstCount; k < rows.length; k += perPage) chunks.push(rows.slice(k, k + perPage));
  if (chunks.length > 1 && !chunks[chunks.length - 1].length) chunks.pop();
  first.push(<TableRows key="tab" y={y} rows={chunks[0]} header />);
  const pages = chunks.length;
  const out = [
    <Page key={1} info={info} page={1} pages={pages}>
      {first}
    </Page>,
  ];
  chunks.slice(1).forEach((c, k) =>
    out.push(
      <Page key={k + 2} info={info} page={k + 2} pages={pages}>
        <g>{title('3. Points d’appui (suite)', 34)}</g>
        <TableRows y={36} rows={c} header />
      </Page>,
    ),
  );
  return out;
}
