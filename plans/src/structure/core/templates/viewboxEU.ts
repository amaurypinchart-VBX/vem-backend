// Gabarit filaire « Viewbox 5900 — EU », relevé sur le modèle SCIA des notes statico (24-0571 Hoka, annexe B) :
// rives UNP 220 (plancher z = 0, toiture z = 2 790), traverses et lisses RHP 120 × 60 × 4 en grille rigide, poteaux
// QHP 100 × 5 semi-rigides aux deux bouts (3 500 kNcm/deg), réceptions de pied en T avec plats (triangle d'angle),
// réceptions centrales des grands côtés. Repère local du module (mm) : u le long du grand côté, v le petit côté,
// z vers le haut, origine au coin extérieur bas. Fonction pure.
import type { EndSpec } from '../fem/types';
import type { ViewboxTemplateParams } from '../library';

export type TemplateFamily = 'rim-floor' | 'rim-roof' | 'secondary-floor' | 'secondary-roof' | 'column' | 'foot-corner' | 'foot-plate' | 'foot-middle';

export interface TemplateNode {
  key: string;
  u: number;
  v: number;
  z: number;
}

export interface TemplateMember {
  family: TemplateFamily;
  section: string;
  i: string;
  j: string;
  endI?: EndSpec;
  endJ?: EndSpec;
  /** barre physique (une rive, une ligne de traverses, un poteau…) : longueurs de flambement */
  line: string;
}

/** Côté du module : u = 0, u = L, v = 0, v = W. */
export type Side = 'u0' | 'u1' | 'v0' | 'v1';

export interface TemplateFace {
  side: Side;
  /** nœuds d'angle aux deux bouts du côté, au plancher et en toiture */
  cornersFloor: [string, string];
  cornersRoof: [string, string];
  /** boulons horizontaux (plancher et toiture) et leur abscisse depuis le premier angle du côté */
  bolts: Array<{ floor: string; roof: string; s: number }>;
  /** contacts verticaux avec une Viewbox empilée (grands côtés) */
  contacts: Array<{ floor: string; roof: string; s: number }>;
  /** tous les nœuds de la rive (plancher, toiture), du premier au second angle */
  rimFloor: string[];
  rimRoof: string[];
  /** longueur du côté entre lignes de système (mm) */
  length: number;
}

/** Case de plancher ou de toiture entre deux lignes de la grille (charges surfaciques). */
export interface TemplatePanel {
  level: 'floor' | 'roof';
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface ViewboxTemplate {
  nodes: TemplateNode[];
  members: TemplateMember[];
  faces: TemplateFace[];
  panels: TemplatePanel[];
  /** angles du plancher (appuis sans vérins), des pieds (appuis sur vérins), de la toiture ; pieds centraux */
  cornerFloor: string[];
  cornerRoof: string[];
  footNodes: string[];
  middleFeet: string[];
  /** nœuds de la rive plancher au droit des pieds centraux (cale posée directement sous l'UNP, sans vérin) */
  middleRim: string[];
  params: ViewboxTemplateParams;
}

const uniq = (xs: number[]) => [...new Set(xs.map((x) => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
const nodeKey = (u: number, v: number, z: number) => `${Math.round(u)}:${Math.round(v)}:${Math.round(z)}`;

/** Nœuds supplémentaires sur les rives (abscisse locale le long de la rive), aux deux niveaux : jonctions en T. */
export type RimExtras = Partial<Record<Side, number[]>>;

export function viewboxTemplate(p: ViewboxTemplateParams, extras: RimExtras = {}): ViewboxTemplate {
  const nodes = new Map<string, TemplateNode>();
  const node = (u: number, v: number, z: number) => {
    const k = nodeKey(u, v, z);
    if (!nodes.has(k)) nodes.set(k, { key: k, u, v, z });
    return k;
  };
  const members: TemplateMember[] = [];
  const { x0, x1, y0, y1 } = p;
  const feetU = [x0 + p.footOffset, x1 - p.footOffset];
  const feetV = [y0 + p.footOffset, y1 - p.footOffset];
  const chain = (pts: Array<[number, number]>, z: number, family: TemplateFamily, section: string, line: string) => {
    for (let k = 0; k + 1 < pts.length; k++) members.push({ family, section, i: node(pts[k][0], pts[k][1], z), j: node(pts[k + 1][0], pts[k + 1][1], z), line });
  };
  for (const [lvl, z] of [
    ['floor', p.floorZ],
    ['roof', p.roofZ],
  ] as const) {
    const floor = lvl === 'floor';
    // nœuds des rives : angles, traverses, boulons, et au plancher les attaches des réceptions de pied
    const longU = uniq([x0, x1, ...p.transverseX, ...p.boltLongX, ...(p.verticalContactX ?? []), ...(floor ? [...feetU, p.middleFootX] : [])]);
    const shortV = uniq([y0, y1, ...p.longitudinalY, ...p.boltShortY, ...(floor ? feetV : [])]);
    const rim: TemplateFamily = floor ? 'rim-floor' : 'rim-roof';
    const sec: TemplateFamily = floor ? 'secondary-floor' : 'secondary-roof';
    const along = (base: number[], side: Side) => uniq([...base, ...(extras[side] ?? [])]);
    // toiture : sections propres si elles sont données, sinon celles du plancher (notes statico)
    const rimSec = floor ? p.sections.rim : (p.sections.rimRoof ?? p.sections.rim);
    const secSec = floor ? p.sections.secondary : (p.sections.secondaryRoof ?? p.sections.secondary);
    chain(along(longU, 'v0').map((u) => [u, y0] as [number, number]), z, rim, rimSec, `${lvl}:v0`);
    chain(along(longU, 'v1').map((u) => [u, y1] as [number, number]), z, rim, rimSec, `${lvl}:v1`);
    chain(along(shortV, 'u0').map((v) => [x0, v] as [number, number]), z, rim, rimSec, `${lvl}:u0`);
    chain(along(shortV, 'u1').map((v) => [x1, v] as [number, number]), z, rim, rimSec, `${lvl}:u1`);
    // traverses (selon v) aux abscisses transverseX, lisses (selon u) aux ordonnées longitudinalY
    const vs = uniq([y0, y1, ...p.longitudinalY]);
    const us = uniq([x0, x1, ...p.transverseX]);
    for (const u of p.transverseX) chain(vs.map((v) => [u, v] as [number, number]), z, sec, secSec, `${lvl}:t${Math.round(u)}`);
    for (const v of p.longitudinalY) chain(us.map((u) => [u, v] as [number, number]), z, sec, secSec, `${lvl}:l${Math.round(v)}`);
  }
  // poteaux d'angle, semi-rigides en flexion aux deux extrémités (torsion et translations encastrées)
  const k = p.springs.columnRotation;
  const semi: EndSpec = ['rigid', 'rigid', 'rigid', 'rigid', k, k];
  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  corners.forEach(([u, v], c) => members.push({ family: 'column', section: p.sections.column, i: node(u, v, p.floorZ), j: node(u, v, p.roofZ), endI: semi, endJ: semi, line: `column:${c}` }));
  // réceptions de pied : T en diagonale depuis l'angle, plats vers les deux rives (triangle d'angle)
  const footNodes: string[] = [];
  corners.forEach(([u, v], c) => {
    const fu = u === x0 ? feetU[0] : feetU[1];
    const fv = v === y0 ? feetV[0] : feetV[1];
    const f = node(fu, fv, p.floorZ);
    footNodes.push(f);
    members.push({ family: 'foot-corner', section: p.sections.footCorner, i: f, j: node(u, v, p.floorZ), line: `foot:${c}` });
    members.push({ family: 'foot-plate', section: p.sections.footPlate, i: f, j: node(fu, v, p.floorZ), line: `footplate:${c}:u` });
    members.push({ family: 'foot-plate', section: p.sections.footPlate, i: f, j: node(u, fv, p.floorZ), line: `footplate:${c}:v` });
  });
  // réceptions centrales des grands côtés
  const middleFeet: string[] = [];
  const middleRim: string[] = [];
  for (const [v, fv] of [
    [y0, feetV[0]],
    [y1, feetV[1]],
  ]) {
    const m = node(p.middleFootX, fv, p.floorZ);
    middleFeet.push(m);
    const r = node(p.middleFootX, v, p.floorZ);
    middleRim.push(r);
    members.push({ family: 'foot-middle', section: p.sections.footMiddle, i: m, j: r, line: `footmid:${Math.round(v)}` });
  }
  const rimNodes = (side: Side, z: number) => {
    const line = `${z === p.floorZ ? 'floor' : 'roof'}:${side}`;
    const rm = members.filter((m) => m.line === line);
    return [rm[0].i, ...rm.map((m) => m.j)];
  };
  const face = (side: Side): TemplateFace => {
    const alongU = side === 'v0' || side === 'v1';
    const fixed = side === 'u0' ? x0 : side === 'u1' ? x1 : side === 'v0' ? y0 : y1;
    const at = (s: number, z: number) => (alongU ? nodeKey(s, fixed, z) : nodeKey(fixed, s, z));
    const [a, b] = alongU ? [x0, x1] : [y0, y1];
    return {
      side,
      cornersFloor: [at(a, p.floorZ), at(b, p.floorZ)],
      cornersRoof: [at(a, p.roofZ), at(b, p.roofZ)],
      bolts: (alongU ? p.boltLongX : p.boltShortY).map((s) => ({ floor: at(s, p.floorZ), roof: at(s, p.roofZ), s: s - a })),
      contacts: (alongU ? (p.verticalContactX ?? []) : []).map((s) => ({ floor: at(s, p.floorZ), roof: at(s, p.roofZ), s: s - a })),
      rimFloor: rimNodes(side, p.floorZ),
      rimRoof: rimNodes(side, p.roofZ),
      length: b - a,
    };
  };
  const us = uniq([x0, x1, ...p.transverseX]);
  const vs = uniq([y0, y1, ...p.longitudinalY]);
  const panels: TemplatePanel[] = [];
  for (const level of ['floor', 'roof'] as const)
    for (let a = 0; a + 1 < us.length; a++) for (let b = 0; b + 1 < vs.length; b++) panels.push({ level, u0: us[a], u1: us[a + 1], v0: vs[b], v1: vs[b + 1] });
  return {
    nodes: [...nodes.values()],
    members,
    faces: (['u0', 'u1', 'v0', 'v1'] as Side[]).map(face),
    panels,
    cornerFloor: corners.map(([u, v]) => nodeKey(u, v, p.floorZ)),
    cornerRoof: corners.map(([u, v]) => nodeKey(u, v, p.roofZ)),
    footNodes,
    middleFeet,
    middleRim,
    params: p,
  };
}
