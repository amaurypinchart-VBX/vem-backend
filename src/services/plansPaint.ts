// src/services/plansPaint.ts
// Peinture d'un modèle Plans Viewbox (settings.paint) : opérations du navigateur appliquées côté serveur, fusion par
// identifiant (deux personnes qui peignent en même temps ne s'écrasent pas). Même logique que
// plans/src/core/paint/ops.ts `applyOps` (les deux côtés ne peuvent pas s'importer : build Docker séparé).

export const PAINT_LIMITS = { colors: 200, zones: 5000, bytes: 150_000, ops: 2000 };

type Obj = Record<string, unknown>;
export interface PaintDoc { v: 1; colors: Obj[]; zones: Obj[]; updatedAt: string; updatedBy?: string }

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : null);

/** Peinture actuelle lue telle quelle (tolérant) */
export function currentPaint(v: unknown): PaintDoc {
  const o = isObj(v) ? v : {};
  return {
    v: 1,
    colors: Array.isArray(o.colors) ? o.colors.filter((c) => isObj(c) && id(c.id)) as Obj[] : [],
    zones: Array.isArray(o.zones) ? o.zones.filter((z) => isObj(z) && id(z.id) && id(z.colorId)) as Obj[] : [],
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
  };
}

/** Opérations validées (types, ids, couleur d'écran) ; lève une erreur lisible sinon. */
export function cleanOps(v: unknown): Array<{ op: string; color?: Obj; zone?: Obj; id?: string }> {
  if (!Array.isArray(v) || !v.length) throw new Error('ops (tableau non vide) requis');
  if (v.length > PAINT_LIMITS.ops) throw new Error('Trop d’opérations');
  return v.map((o, i) => {
    if (!isObj(o)) throw new Error(`Opération ${i + 1} invalide`);
    if (o.op === 'color.put') {
      const c = o.color;
      if (!isObj(c) || !id(c.id) || typeof c.tag !== 'string' || typeof c.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c.hex)) throw new Error(`Couleur ${i + 1} invalide`);
      return { op: 'color.put', color: c };
    }
    if (o.op === 'zone.put') {
      const z = o.zone;
      if (!isObj(z) || !id(z.id) || !id(z.colorId) || !isObj(z.target) || !isObj((z.target as Obj).match)) throw new Error(`Zone ${i + 1} invalide`);
      return { op: 'zone.put', zone: z };
    }
    if ((o.op === 'color.del' || o.op === 'zone.del') && id(o.id)) return { op: o.op, id: o.id as string };
    throw new Error(`Opération ${i + 1} inconnue`);
  });
}

/** put = ajoute ou remplace par id (à sa place), del = retire ; une couleur retirée emporte ses zones. */
export function applyPaintOps(p: PaintDoc, ops: ReturnType<typeof cleanOps>, by?: string): PaintDoc {
  let colors = [...p.colors];
  let zones = [...p.zones];
  for (const o of ops) {
    if (o.op === 'color.put' && o.color) {
      const i = colors.findIndex((c) => c.id === o.color!.id);
      if (i >= 0) colors[i] = o.color;
      else colors.push(o.color);
    } else if (o.op === 'color.del') colors = colors.filter((c) => c.id !== o.id);
    else if (o.op === 'zone.put' && o.zone) {
      const i = zones.findIndex((z) => z.id === o.zone!.id);
      if (i >= 0) zones[i] = o.zone;
      else zones.push(o.zone);
    } else if (o.op === 'zone.del') zones = zones.filter((z) => z.id !== o.id);
  }
  const ids = new Set(colors.map((c) => c.id));
  zones = zones.filter((z) => ids.has(z.colorId));
  if (colors.length > PAINT_LIMITS.colors) throw new Error(`Plus de ${PAINT_LIMITS.colors} couleurs`);
  if (zones.length > PAINT_LIMITS.zones) throw new Error(`Plus de ${PAINT_LIMITS.zones} zones peintes`);
  const out: PaintDoc = { v: 1, colors, zones, updatedAt: new Date().toISOString(), ...(by ? { updatedBy: by } : {}) };
  if (JSON.stringify(out).length > PAINT_LIMITS.bytes) throw new Error('Peinture trop volumineuse');
  return out;
}
