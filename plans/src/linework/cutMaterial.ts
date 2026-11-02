// Matériau d'une pièce pour le remplissage des coupes (vues spéciales, « Vue du sol » des planches) et version du
// calcul des coupes. Fichier à part : le fournisseur des vues l'utilise sans importer tout le module des vues spéciales.
import type { LoadedScene } from '../scene/loadedScene';
import { MATERIAL } from './customJob';

/** Version du calcul des vues spéciales (découpe, bouchons, remplissages) : la changer invalide leur cache seulement. */
export const CUSTOM_ENGINE = 'vs3-cut-1';

const GLASS_RE = /VITRE|GLASS|VERRE|GLAS\b/;
const WOOD_RE = /BOIS|WOOD|PLY|CONTREPLAQUE|MULTIPLEX|MDF|OSB|TIMBER|HOLZ|BIRCH|BOULEAU/;
const STEEL_RE = /ACIER|STEEL|METAL|INOX|GALVA|ALU|STAHL/;

/** Matériau d'une pièce pour le remplissage des coupes. */
export function materialOf(scene: Pick<LoadedScene, 'look'>, id: string): number {
  const n = scene.look.byId.get(id);
  const cat = scene.look.categoryOf(id) ?? '';
  const mats = (n?.materialNames ?? []).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (n?.glass || cat.startsWith('VITRE') || (mats && GLASS_RE.test(mats) && !WOOD_RE.test(mats) && !STEEL_RE.test(mats))) return MATERIAL.glass;
  if (WOOD_RE.test(mats)) return MATERIAL.wood;
  if (STEEL_RE.test(mats)) return MATERIAL.steel;
  if (cat === 'PLANCHER') return MATERIAL.wood;
  if (cat === 'STRUCTURE' || cat === 'PIED' || cat === 'TOIT') return MATERIAL.steel;
  return MATERIAL.other;
}

