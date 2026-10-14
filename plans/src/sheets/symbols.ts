// Symboles d'équipement posés sur les planches (prises, commandes, éclairage, distribution, courants faibles,
// sécurité, CVC / plomberie), dessinés comme sur un plan d'architecte : graphisme IEC 60617 / NF C 15-100 (prise =
// demi-cercle sur le mur, + trait de terre ; point lumineux = cercle barré ; tableau = rectangle à moitié noirci…), à
// taille constante sur le papier quelle que soit l'échelle de la vue, couleur par corps d'état, légende comptée. Les
// symboles linéaires (réglette, rail, bandeau LED, chemin de câbles) ont une longueur réelle (mm modèle) qui suit
// l'échelle. Données et géométrie pures (aucun DOM).
//
// Repère d'un symbole : boîte 10 × 10 centrée sur le point de pose, y vers le bas ; les symboles muraux ont le mur
// en bas (y = +5) — la pose les tourne vers le mur le plus proche.

export type SymbolFamily = 'prises' | 'commandes' | 'eclairage' | 'distribution' | 'faibles' | 'securite' | 'cvc';
export type SymbolLang = 'fr' | 'en' | 'de';

export interface SymbolDef {
  key: string;
  family: SymbolFamily;
  label: Record<SymbolLang, string>;
  /** traits (chemins SVG dans la boîte 10 × 10) */
  strokes: string[];
  /** surfaces pleines, de la couleur du symbole */
  fills?: string[];
  /** textes dans le symbole (unités de la boîte) */
  texts?: Array<{ x: number; y: number; t: string; size: number; bold?: boolean }>;
  /** posé contre un mur : orienté vers le trait le plus proche à la pose */
  wall?: boolean;
  /** symbole linéaire : longueur réelle (mm modèle) */
  linear?: boolean;
  /** couleur propre (sinon celle du corps d'état) */
  color?: string;
  /** texte proposé à côté du symbole (« 32 A », « IP44 ») */
  note?: string;
  /** longueur proposée des symboles linéaires (mm) */
  length?: number;
}

export const SYMBOL_FAMILIES: Array<{ key: SymbolFamily; label: Record<SymbolLang, string>; color: string; dxf: string }> = [
  { key: 'prises', label: { fr: 'Prises de courant', en: 'Power sockets', de: 'Steckdosen' }, color: '#dc2626', dxf: 'VBX-SYMB-PRISES' },
  { key: 'commandes', label: { fr: 'Commandes', en: 'Switches & controls', de: 'Schalter' }, color: '#9333ea', dxf: 'VBX-SYMB-COMMANDES' },
  { key: 'eclairage', label: { fr: 'Éclairage', en: 'Lighting', de: 'Beleuchtung' }, color: '#d97706', dxf: 'VBX-SYMB-ECLAIRAGE' },
  { key: 'distribution', label: { fr: 'Distribution électrique', en: 'Power distribution', de: 'Stromverteilung' }, color: '#991b1b', dxf: 'VBX-SYMB-DISTRIBUTION' },
  { key: 'faibles', label: { fr: 'Courants faibles / multimédia', en: 'Data & multimedia', de: 'Schwachstrom / Medien' }, color: '#2563eb', dxf: 'VBX-SYMB-COURANTS-FAIBLES' },
  { key: 'securite', label: { fr: 'Sécurité', en: 'Safety', de: 'Sicherheit' }, color: '#16a34a', dxf: 'VBX-SYMB-SECURITE' },
  { key: 'cvc', label: { fr: 'Climatisation / plomberie', en: 'HVAC & plumbing', de: 'Klima / Sanitär' }, color: '#0891b2', dxf: 'VBX-SYMB-CVC' },
];

// ─── briques de dessin ───
/** cercle complet (deux arcs) */
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
/** croix inscrite dans un cercle */
const cross = (cx: number, cy: number, r: number) => {
  const a = r * Math.SQRT1_2;
  return `M${cx - a} ${cy - a} L${cx + a} ${cy + a} M${cx - a} ${cy + a} L${cx + a} ${cy - a}`;
};
const rect = (x0: number, y0: number, x1: number, y1: number) => `M${x0} ${y0} H${x1} V${y1} H${x0} Z`;
/** prise : demi-cercle (côté opposé au mur) sur son diamètre, tige jusqu'au mur */
const SOCKET = ['M0 5 V1', 'M-3 1 H3', 'M-3 1 A3 3 0 0 1 3 1'];
const EARTH = 'M-3 -3 H3';
/** arcs concentriques vers le haut (ondes), centre (cx, cy) */
const waves = (cx: number, cy: number, radii: number[]) =>
  radii.map((r) => {
    const a = r * Math.SQRT1_2;
    return `M${cx - a} ${cy - a} A${r} ${r} 0 0 1 ${cx + a} ${cy - a}`;
  });

const L = (fr: string, en: string, de: string) => ({ fr, en, de });

export const SYMBOLS: SymbolDef[] = [
  // ─── prises ───
  { key: 'prise-2pt', family: 'prises', wall: true, label: L('Prise 2P+T 16 A', 'Socket 16 A with earth', 'Schutzkontaktsteckdose 16 A'), strokes: [...SOCKET, EARTH] },
  {
    key: 'prise-double',
    family: 'prises',
    wall: true,
    label: L('Prise double 2P+T 16 A', 'Double socket 16 A', 'Doppelsteckdose 16 A'),
    strokes: ['M0 5 V1', 'M-4.2 1 H4.2', 'M-4.2 1 A2 2 0 0 1 -0.2 1', 'M0.2 1 A2 2 0 0 1 4.2 1', 'M-4.2 -2.4 H4.2'],
  },
  { key: 'prise-ip', family: 'prises', wall: true, note: 'IP44', label: L('Prise étanche 2P+T (IP44 / IP55)', 'Weatherproof socket (IP44 / IP55)', 'Feuchtraumsteckdose (IP44 / IP55)'), strokes: [...SOCKET, EARTH, 'M-3 -4.2 H3'] },
  { key: 'prise-32a', family: 'prises', wall: true, note: '32 A', label: L('Prise CEE 32 A monophasée', 'CEE socket 32 A single-phase', 'CEE-Steckdose 32 A einphasig'), strokes: [...SOCKET, EARTH], fills: ['M-3 1 A3 3 0 0 1 3 1 Z'] },
  {
    key: 'prise-tri',
    family: 'prises',
    wall: true,
    note: '400 V',
    label: L('Prise CEE triphasée 3P+N+T', 'CEE socket 3-phase 3P+N+E', 'CEE-Drehstromsteckdose 3P+N+PE'),
    strokes: [...SOCKET, EARTH, 'M-1 2.6 L1 1.8', 'M-1 3.5 L1 2.7', 'M-1 4.4 L1 3.6'],
    fills: ['M-3 1 A3 3 0 0 1 3 1 Z'],
  },
  { key: 'prise-sol', family: 'prises', label: L('Boîte de sol (prises au sol)', 'Floor box (floor sockets)', 'Bodentank (Bodensteckdosen)'), strokes: [rect(-4, -4, 4, 4), 'M-2.5 1.8 H2.5', 'M-2.5 1.8 A2.5 2.5 0 0 1 2.5 1.8', 'M-2.5 -1.6 H2.5'] },
  { key: 'prise-usb', family: 'prises', wall: true, label: L('Prise USB', 'USB socket', 'USB-Steckdose'), strokes: ['M0 5 V2.4', rect(-4.6, -2, 4.6, 2.4)], texts: [{ x: 0, y: 1.3, t: 'USB', size: 3.2 }] },

  // ─── commandes ───
  { key: 'inter-simple', family: 'commandes', wall: true, label: L('Interrupteur simple', 'One-way switch', 'Ausschalter'), strokes: [circle(0, 3.5, 1.5), 'M1.06 2.44 L3.4 -1.4 L4.6 -0.6'] },
  { key: 'inter-double', family: 'commandes', wall: true, label: L('Interrupteur double', 'Two-gang switch', 'Serienschalter'), strokes: [circle(0, 3.5, 1.5), 'M1.06 2.44 L3.4 -1.4 L4.6 -0.6', 'M0.4 2.05 L1.6 -2.4 L2.9 -1.9'] },
  { key: 'va-et-vient', family: 'commandes', wall: true, label: L('Interrupteur va-et-vient', 'Two-way switch', 'Wechselschalter'), strokes: [circle(0, 3, 1.5), 'M1.06 1.94 L3.4 -1.9 L4.6 -1.1', 'M-1.06 1.94 L-3.4 -1.9 L-4.6 -1.1'] },
  { key: 'poussoir', family: 'commandes', wall: true, label: L('Bouton poussoir', 'Push button', 'Taster'), strokes: [circle(0, 3, 2)], fills: [circle(0, 3, 0.8)] },
  {
    key: 'variateur',
    family: 'commandes',
    wall: true,
    label: L('Variateur', 'Dimmer', 'Dimmer'),
    strokes: [circle(0, 3.5, 1.5), 'M1.06 2.44 L3.4 -1.4 L4.6 -0.6', 'M-3.6 4 L-1.2 -0.8'],
    fills: ['M-1.2 -0.8 L-2.4 -0.2 L-1.5 0.4 Z'],
  },
  { key: 'detecteur', family: 'commandes', wall: true, label: L('Détecteur de présence', 'Presence detector', 'Präsenzmelder'), strokes: ['M-2.5 5 A2.5 2.5 0 0 1 2.5 5', 'M0 2 V0', 'M-1.8 3 L-3.3 1.6', 'M1.8 3 L3.3 1.6'] },

  // ─── éclairage ───
  { key: 'point-lumineux', family: 'eclairage', label: L('Point lumineux (plafonnier)', 'Ceiling light', 'Deckenleuchte'), strokes: [circle(0, 0, 3), cross(0, 0, 3)] },
  { key: 'applique', family: 'eclairage', wall: true, label: L('Applique murale', 'Wall light', 'Wandleuchte'), strokes: [circle(0, 0, 2.5), cross(0, 0, 2.5), 'M0 2.5 V5'] },
  { key: 'spot', family: 'eclairage', label: L('Spot encastré', 'Recessed downlight', 'Einbaustrahler'), strokes: [circle(0, 0, 2.2)], fills: [circle(0, 0, 0.9)] },
  { key: 'projecteur', family: 'eclairage', label: L('Projecteur orientable', 'Spotlight / floodlight', 'Strahler'), strokes: [circle(-1.6, 0, 2), cross(-1.6, 0, 2), 'M0.3 -1.2 L4.6 -3.2', 'M0.3 1.2 L4.6 3.2'] },
  { key: 'caisson', family: 'eclairage', label: L('Caisson / enseigne lumineuse', 'Light box / illuminated sign', 'Leuchtkasten'), strokes: [rect(-4.5, -2.5, 4.5, 2.5), 'M-4.5 -2.5 L4.5 2.5 M-4.5 2.5 L4.5 -2.5'] },
  { key: 'reglette', family: 'eclairage', linear: true, length: 1200, label: L('Réglette / tube LED', 'LED batten', 'LED-Lichtleiste'), strokes: [] },
  { key: 'rail', family: 'eclairage', linear: true, length: 2000, label: L('Rail d’éclairage avec spots', 'Lighting track with spots', 'Stromschiene mit Strahlern'), strokes: [] },
  { key: 'bandeau-led', family: 'eclairage', linear: true, length: 2000, label: L('Bandeau / ruban LED', 'LED strip', 'LED-Band'), strokes: [] },

  // ─── distribution ───
  { key: 'tableau', family: 'distribution', wall: true, note: 'TD', label: L('Tableau électrique', 'Distribution board', 'Unterverteilung'), strokes: [rect(-4.5, 1, 4.5, 5)], fills: ['M-4.5 5 L4.5 1 L4.5 5 Z'] },
  { key: 'coffret', family: 'distribution', label: L('Coffret de chantier / armoire de distribution', 'Site distribution box', 'Baustromverteiler'), strokes: [rect(-4, -3, 4, 3)], texts: [{ x: 0, y: 1.1, t: 'DB', size: 3.2, bold: true }] },
  { key: 'derivation', family: 'distribution', label: L('Boîte de dérivation', 'Junction box', 'Abzweigdose'), strokes: [rect(-1.8, -1.8, 1.8, 1.8)], fills: [circle(0, 0, 0.6)] },
  {
    key: 'alimentation',
    family: 'distribution',
    label: L('Point d’alimentation (arrivée de courant)', 'Power supply point', 'Stromanschluss'),
    strokes: [circle(0, 0, 3.5)],
    fills: ['M0.7 -2.7 L-1.7 0.4 H0 L-0.7 2.7 L1.7 -0.4 H0 Z'],
  },
  { key: 'groupe', family: 'distribution', label: L('Groupe électrogène', 'Generator', 'Stromaggregat'), strokes: [circle(0, 0, 3.5), 'M-1.8 2 q0.9 -0.9 1.8 0 t1.8 0'], texts: [{ x: 0, y: 0.6, t: 'G', size: 3.4, bold: true }] },
  { key: 'chemin-cables', family: 'distribution', linear: true, length: 3000, label: L('Chemin de câbles / goulotte', 'Cable tray / trunking', 'Kabelrinne / Kabelkanal'), strokes: [] },

  // ─── courants faibles ───
  { key: 'rj45', family: 'faibles', wall: true, label: L('Prise réseau RJ45', 'Data outlet RJ45', 'Netzwerkdose RJ45'), strokes: ['M0 5 V2.4', rect(-4.6, -2, 4.6, 2.4)], texts: [{ x: 0, y: 1.3, t: 'RJ45', size: 3 }] },
  { key: 'tv', family: 'faibles', wall: true, label: L('Prise TV / antenne', 'TV / aerial outlet', 'Antennendose'), strokes: ['M0 5 V2.4', rect(-4.6, -2, 4.6, 2.4)], texts: [{ x: 0, y: 1.4, t: 'TV', size: 3.4 }] },
  { key: 'ecran', family: 'faibles', wall: true, label: L('Écran / moniteur', 'Screen / monitor', 'Bildschirm'), strokes: [rect(-4.5, 2.6, 4.5, 5)], fills: [rect(-4.5, 2.6, 4.5, 3.4)] },
  { key: 'haut-parleur', family: 'faibles', label: L('Haut-parleur', 'Loudspeaker', 'Lautsprecher'), strokes: [rect(-3.5, -1.2, -1.4, 1.2), 'M-1.4 -1.2 L2.4 -3.6 V3.6 L-1.4 1.2'] },
  { key: 'wifi', family: 'faibles', label: L('Borne Wi-Fi', 'Wi-Fi access point', 'WLAN-Zugangspunkt'), strokes: waves(0, 2.6, [1.8, 3.2, 4.6]), fills: [circle(0, 2.6, 0.6)] },
  { key: 'camera', family: 'faibles', label: L('Caméra', 'Camera', 'Kamera'), strokes: [rect(-4, -1.5, 1.6, 1.5), 'M1.6 -0.8 L4 -2 V2 L1.6 0.8'] },

  // ─── sécurité ───
  { key: 'baes', family: 'securite', wall: true, label: L('Bloc de secours (BAES)', 'Emergency light', 'Notleuchte'), strokes: [rect(-4, 1, 4, 5), circle(0, 3, 1.4)], fills: ['M0 1.6 A1.4 1.4 0 0 1 0 4.4 Z'] },
  { key: 'sortie', family: 'securite', label: L('Sortie de secours', 'Emergency exit', 'Notausgang'), strokes: [rect(-4.5, -2, 4.5, 2), 'M-3 0 H2.6', 'M1 -1.3 L2.8 0 L1 1.3'] },
  { key: 'extincteur', family: 'securite', color: '#dc2626', label: L('Extincteur', 'Fire extinguisher', 'Feuerlöscher'), strokes: [circle(0, 0, 3)], texts: [{ x: 0, y: 1.25, t: 'E', size: 3.6, bold: true }] },
  { key: 'detecteur-fumee', family: 'securite', color: '#dc2626', label: L('Détecteur de fumée', 'Smoke detector', 'Rauchmelder'), strokes: [circle(0, 0, 3), 'M-1.6 1.2 q0.8 -1.2 0 -2.4', 'M0 1.2 q0.8 -1.2 0 -2.4', 'M1.6 1.2 q0.8 -1.2 0 -2.4'] },
  { key: 'declencheur', family: 'securite', wall: true, color: '#dc2626', label: L('Déclencheur manuel d’alarme', 'Manual call point', 'Druckknopfmelder'), strokes: [rect(-3, -1, 3, 5)], fills: [circle(0, 2, 1.5)] },

  // ─── climatisation / plomberie ───
  { key: 'clim', family: 'cvc', wall: true, label: L('Climatisation (unité murale)', 'Air conditioning (wall unit)', 'Klimagerät (Wandgerät)'), strokes: [rect(-4.5, 2.2, 4.5, 5), 'M-2.5 2.2 V-0.8', 'M0 2.2 V-1.8', 'M2.5 2.2 V-0.8', 'M-3.3 0 L-2.5 -0.8 L-1.7 0', 'M-0.8 -1 L0 -1.8 L0.8 -1', 'M1.7 0 L2.5 -0.8 L3.3 0'] },
  { key: 'chauffage', family: 'cvc', wall: true, label: L('Chauffage / radiateur', 'Heater / radiator', 'Heizkörper'), strokes: [rect(-4.5, 2, 4.5, 5), 'M-3 2 V5', 'M-1.5 2 V5', 'M0 2 V5', 'M1.5 2 V5', 'M3 2 V5'] },
  { key: 'eau', family: 'cvc', label: L('Arrivée d’eau', 'Water supply', 'Wasseranschluss'), strokes: [circle(0, 0, 3)], fills: ['M-1.6 -1.1 H1.6 L0 1.7 Z'] },
  { key: 'evacuation', family: 'cvc', label: L('Évacuation (eaux usées)', 'Drain', 'Abwasser'), strokes: [circle(0, 0, 3), 'M-3 0 H3'], fills: ['M-3 0 A3 3 0 0 0 3 0 Z'] },
];

export const SYMBOL_BY_KEY = new Map(SYMBOLS.map((s) => [s.key, s]));

/** Taille d'un symbole sur le papier (mm, A1 ; × échelle du gabarit en A3). */
export const SYMBOL_SIZE = 4.5;
/** Épaisseur des traits d'un symbole sur le papier (mm, A1). */
export const SYMBOL_STROKE = 0.25;

export function familyOf(key: SymbolFamily) {
  return SYMBOL_FAMILIES.find((f) => f.key === key)!;
}

/** Couleur d'un symbole : la sienne, sinon celle de son corps d'état. */
export function symbolColor(def: SymbolDef): string {
  return def.color ?? familyOf(def.family).color;
}

/**
 * Motif d'un symbole linéaire de longueur `len` (mm papier) le long de l'axe x, centré : traits et surfaces (mm
 * papier, avant rotation), taille de référence `size` (épaisseur du motif).
 */
export function linearShape(key: string, len: number, size: number): { strokes: string[]; fills: string[]; dash?: string } {
  const a = len / 2;
  const h = size / 10;
  const f = (v: number) => Math.round(v * 1000) / 1000;
  switch (key) {
    case 'reglette':
      // tube : trait épais (rectangle fin) fermé par deux traits d'extrémité
      return { strokes: [`M${f(-a)} ${f(-0.7 * h)} H${f(a)} V${f(0.7 * h)} H${f(-a)} Z`, `M${f(-a)} ${f(-1.8 * h)} V${f(1.8 * h)}`, `M${f(a)} ${f(-1.8 * h)} V${f(1.8 * h)}`], fills: [] };
    case 'rail': {
      // rail : deux traits, un spot (cercle barré) tous les ~ 8 symboles de long, au moins 2
      const n = Math.max(2, Math.round(len / (size * 1.8)));
      const spots: string[] = [];
      const r = 1.6 * h;
      for (let i = 0; i < n; i++) {
        const x = -a + ((i + 0.5) * len) / n;
        spots.push(circle(f(x), 0, f(r)), cross(f(x), 0, f(r)));
      }
      return { strokes: [`M${f(-a)} ${f(-0.5 * h)} H${f(a)}`, `M${f(-a)} ${f(0.5 * h)} H${f(a)}`, ...spots], fills: [] };
    }
    case 'bandeau-led':
      return { strokes: [`M${f(-a)} 0 H${f(a)}`], fills: [], dash: `${f(2.2 * h * 4)} ${f(1.2 * h * 4)}` };
    case 'chemin-cables': {
      // deux rives et un zigzag entre elles
      const w = 1.6 * h;
      const step = 3 * w;
      const n = Math.max(1, Math.round(len / step));
      const pts: string[] = [];
      for (let i = 0; i <= n; i++) pts.push(`${f(-a + (i * len) / n)} ${f(i % 2 ? w : -w)}`);
      return { strokes: [`M${f(-a)} ${f(-w)} H${f(a)}`, `M${f(-a)} ${f(w)} H${f(a)}`, `M${pts.join(' L')}`], fills: [] };
    }
    default:
      return { strokes: [`M${f(-a)} 0 H${f(a)}`], fills: [] };
  }
}

/** Légende : clés utilisées (ordre du catalogue) et nombre de symboles posés pour chacune. */
export function symbolCounts(keys: string[]): Array<{ def: SymbolDef; count: number }> {
  const n = new Map<string, number>();
  for (const k of keys) n.set(k, (n.get(k) ?? 0) + 1);
  return SYMBOLS.filter((s) => n.has(s.key)).map((def) => ({ def, count: n.get(def.key)! }));
}

/** Titre de la légende des symboles. */
export const SYMBOL_LEGEND_TITLE: Record<SymbolLang, string> = { fr: 'LÉGENDE DES ÉQUIPEMENTS', en: 'EQUIPMENT LEGEND', de: 'LEGENDE AUSSTATTUNG' };

/** « h 1,10 m » / « h 1.10 m » : hauteur de pose au-dessus du sol fini. */
export function heightText(mm: number, lang: SymbolLang): string {
  const m = (mm / 1000).toFixed(2);
  return `h ${lang === 'en' ? m : m.replace('.', ',')} m`;
}

/**
 * Orientation d'un symbole mural vers le mur le plus proche : segments du dessin (mm papier) à moins de `tol` mm du
 * point cliqué → angle (°, sens horaire sur le papier) qui tourne le bas du symbole (côté mur) vers le segment, et
 * point de pose ramené contre le trait (le symbole touche le mur). null : aucun trait assez près.
 */
export function orientToWall(p: { x: number; y: number }, segments: Iterable<readonly [number, number, number, number]>, tol: number, size: number): { at: { x: number; y: number }; rotation: number } | null {
  let best: { d: number; qx: number; qy: number } | null = null;
  for (const [x0, y0, x1, y1] of segments) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / l2));
    const qx = x0 + t * dx;
    const qy = y0 + t * dy;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d <= tol && (!best || d < best.d)) best = { d, qx, qy };
  }
  if (!best) return null;
  let vx = best.qx - p.x;
  let vy = best.qy - p.y;
  const n = Math.hypot(vx, vy);
  if (n < 1e-6) {
    // clic sur le trait : on garde le symbole du côté où il était déjà (sous le trait)
    vx = 0;
    vy = 1;
  } else {
    vx /= n;
    vy /= n;
  }
  // le bas du symbole (0, +1) doit pointer vers le mur : rotation = angle(v) − 90°
  const rotation = Math.round((((Math.atan2(vy, vx) * 180) / Math.PI - 90 + 360) % 360) * 10) / 10;
  return { at: { x: best.qx - (vx * size) / 2, y: best.qy - (vy * size) / 2 }, rotation: Math.abs(rotation - 360) < 0.05 ? 0 : rotation };
}

/**
 * Symbole linéaire posé le long du trait le plus proche (réglette sur un mur, chemin de câbles le long d'une rive) :
 * angle du trait (°, ramené dans ]−90 ; 90]) et point de pose sur le trait, décalé de `offset` mm du côté du clic.
 */
export function alongWall(p: { x: number; y: number }, segments: Iterable<readonly [number, number, number, number]>, tol: number, offset: number): { at: { x: number; y: number }; rotation: number } | null {
  let best: { d: number; qx: number; qy: number; ang: number } | null = null;
  for (const [x0, y0, x1, y1] of segments) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / l2));
    const qx = x0 + t * dx;
    const qy = y0 + t * dy;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d <= tol && (!best || d < best.d)) best = { d, qx, qy, ang: (Math.atan2(dy, dx) * 180) / Math.PI };
  }
  if (!best) return null;
  let rotation = best.ang;
  while (rotation > 90) rotation -= 180;
  while (rotation <= -90) rotation += 180;
  const n = best.d > 1e-6 ? [(p.x - best.qx) / best.d, (p.y - best.qy) / best.d] : [0, 0];
  return { at: { x: best.qx + n[0] * offset, y: best.qy + n[1] * offset }, rotation: Math.round(rotation * 10) / 10 };
}
