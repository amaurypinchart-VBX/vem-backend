// Planches consultables sans le modèle 3D (A. Pinchart 05.11.2026 : « une fois qu'on a généré les plans, ça doit
// rester en mémoire et ne plus avoir besoin du modèle 3D »). Quand le modèle est chargé, chaque fenêtre de vue prête
// (traits, peinture visible, contours des Viewbox, base de la vue) est enregistrée sur le serveur dans le cache partagé
// des vues : un « instantané » (même format que le PDF fait par le serveur). Sans le modèle, l'onglet Planches relit ces
// instantanés et les traits : rien à télécharger ni à calculer en 3D.
//
// La clé d'un instantané dit tout ce qui change son dessin : modèle, faces avant, peinture, règles de classement,
// étiquettes de vue, version du moteur, et la fenêtre elle-même (demande, vue spéciale, peinture, clé de calcul…). Le
// serveur range les clés JSON à sa façon : on les trie avant de calculer l'empreinte.
import { hashKey } from '../linework/cache';
import { LINEWORK_ENGINE } from '../linework/provider';
import { CUSTOM_ENGINE } from '../linework/cutMaterial';
import type { ModuleFrame } from '../core/views';
import type { CustomViewSpec } from '../core/customViews/types';
import type { Linework2D } from '../linework/types';
import type { PdfJobViewport } from './pdf/serverJob';
import type { ViewportItem } from './types';

/** version du format des instantanés (à changer si leur contenu change) */
export const CONSULT_VERSION = 1;

/** Copie triée par clé (objets imbriqués compris), sans les valeurs `undefined`. */
export function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : canonical(x)));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canonical(x);
    }
    return out;
  }
  return v;
}

/** Ce qui, pour tout le jeu, change le dessin des vues. */
export interface ConsultEnvInput {
  modelKey: string;
  fronts?: unknown;
  paint?: unknown;
  rules?: unknown;
  viewTags?: unknown;
}

export function consultEnv(i: ConsultEnvInput): Promise<string> {
  return hashKey(canonical({ kind: 'consult-env', v: CONSULT_VERSION, engine: LINEWORK_ENGINE, custom: CUSTOM_ENGINE, ...i, paint: paintForKey(i.paint) }));
}

/**
 * Peinture réduite à ce qui change le dessin : couleurs (repère, code, nom, finition, teinte) et zones (couleur, cible).
 * Les dates / auteurs diffèrent entre la copie locale et celle enregistrée par le serveur.
 */
export function paintForKey(p: unknown): unknown {
  if (!p || typeof p !== 'object') return null;
  const q = p as { colors?: Array<Record<string, unknown>>; zones?: Array<Record<string, unknown>> };
  return {
    colors: (q.colors ?? []).map((c) => ({ id: c.id, tag: c.tag, name: c.name, system: c.system, code: c.code, hex: c.hex, finish: c.finish })),
    zones: (q.zones ?? []).map((z) => ({ id: z.id, colorId: z.colorId, target: z.target })),
  };
}

/** Vue spéciale sans ce qui ne change pas le dessin (nom, dates). */
const specPart = (s: CustomViewSpec | undefined) => (s ? { ...s, name: '', createdAt: '', updatedAt: '', updatedBy: '', source: '', presetKey: '' } : 'absente');

/** Clé de l'instantané d'une fenêtre de vue. */
export function consultKey(vp: ViewportItem, env: string, specOf: (viewId: string) => CustomViewSpec | undefined): Promise<string> {
  return hashKey(
    canonical({
      kind: 'consult-vp',
      env,
      request: vp.request,
      lineworkKey: vp.lineworkKey ?? null,
      custom: vp.custom ? { viewId: vp.custom.viewId, block: vp.custom.block } : null,
      spec: vp.custom ? specPart(specOf(vp.custom.viewId)) : null,
      paint: vp.paint ?? null,
      overlays: vp.overlays ?? null,
      frameView: vp.frameView ?? null,
    }),
  );
}

/** Clé des informations du jeu sans 3D : repères des Viewbox, surfaces peintes (légende). */
export function consultInfoKey(env: string): Promise<string> {
  return hashKey({ kind: 'consult-info', env });
}

/** Traits d'une vue spéciale dans le cache partagé (sa clé locale « custom-… » n'est pas une clé du serveur). */
export function customShareKey(localKey: string): Promise<string> {
  return hashKey({ kind: 'consult-custom', key: localKey });
}

export interface ConsultInfo {
  frames: ModuleFrame[];
  /** surface peinte (m²) par couleur, tout le modèle */
  areas: Array<[string, number]>;
}

/** Lecture des instantanés (mode consultation de la banque des vues). */
export interface LightSource {
  key(vp: ViewportItem): Promise<string>;
  /** l'instantané existe-t-il sur le serveur ? (sans le lire) */
  has(key: string): Promise<boolean>;
  snapshot(key: string): Promise<PdfJobViewport | null>;
  linework(key: string): Promise<Linework2D | null>;
}

/** Fenêtre sans instantané (jamais affichée avec le modèle 3D, ou modifiée depuis). */
export const NOT_PREPARED = 'Vue pas encore prête sans le modèle 3D — « 🧊 Charger le modèle 3D »';
