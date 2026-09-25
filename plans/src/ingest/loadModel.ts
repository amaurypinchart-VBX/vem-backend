// Chargement d'un modèle et normalisation : millimètres, Y vers le haut.
// L'unité et l'axe du .dae sont appliqués ICI et une seule fois (on n'utilise pas ColladaLoader.parse,
// qui les applique lui aussi : on reprend ses briques internes, parseur + compositeur).
import { LoadingManager, Object3D, TextureLoader } from 'three';
import { ColladaParser } from 'three/addons/loaders/collada/ColladaParser.js';
import type { ColladaNodeData } from 'three/addons/loaders/collada/ColladaParser.js';
import { ColladaComposer } from 'three/addons/loaders/collada/ColladaComposer.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SourceBundle } from './unzip';
import { baseName } from './unzip';

export interface LoadedModel {
  /** racine normalisée : ses matrices monde donnent des mm, Y vers le haut */
  root: Object3D;
  unitMeter: number;
  unitName: string;
  upAxis: 'X_UP' | 'Y_UP' | 'Z_UP';
  loaderAppliedUnit: boolean;
  missingTextures: string[];
  dispose: () => void;
}

/**
 * Compositeur COLLADA qui mémorise, sur chaque objet, l'id du <node> COLLADA et le nom de la
 * définition de composant instanciée. Sans ça, quand une instance SketchUp nommée ("VBX-03") pointe
 * vers une définition ("Viewbox 5900"), three.js remplace le nom de la définition par celui de
 * l'instance et le nom de définition est perdu — or il sert à classer les accessoires.
 */
class TaggingComposer extends ColladaComposer {
  override buildNode(data: ColladaNodeData): Object3D {
    const obj = super.buildNode(data);
    const defs = (data.instanceNodes ?? [])
      .map((id) => this.library.nodes[id]?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    obj.userData = { ...obj.userData, colladaId: data.id };
    if (defs.length === 1) obj.userData.definitionName = defs[0];
    else delete obj.userData.definitionName;
    return obj;
  }
}

function mimeOf(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

/** Gestionnaire de chargement qui sert les textures depuis le contenu du .zip (blob URLs). */
function assetManager(assets: Map<string, Uint8Array>) {
  const urls = new Map<string, string>();
  const missing: string[] = [];
  let started = 0;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  const manager = new LoadingManager(
    () => resolveDone(),
    undefined,
    (url) => missing.push(baseName(decodeURIComponent(url))),
  );
  manager.onStart = () => {
    started++;
  };
  manager.setURLModifier((url) => {
    if (/^(data:|blob:)/i.test(url)) return url;
    let key: string;
    try {
      key = baseName(decodeURIComponent(url)).toLowerCase();
    } catch {
      key = baseName(url).toLowerCase();
    }
    const data = assets.get(key);
    if (!data) return url;
    let u = urls.get(key);
    if (!u) {
      u = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeOf(key) }));
      urls.set(key, u);
    }
    return u;
  });
  return {
    manager,
    missing,
    /** attend la fin du chargement des textures (ou rien s'il n'y en a pas), 60 s maximum */
    waitTextures: () =>
      started === 0 ? Promise.resolve() : Promise.race([done, new Promise<void>((r) => setTimeout(r, 60000))]),
    revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}

export async function loadDae(bundle: SourceBundle): Promise<LoadedModel> {
  if (!bundle.daeText) throw new Error('Contenu .dae absent');
  const parsed = new ColladaParser().parse(bundle.daeText);
  if (!parsed) throw new Error('Fichier .dae vide ou illisible');
  const { library, asset, collada } = parsed;
  const am = assetManager(bundle.assets);
  const composer = new TaggingComposer(library, collada, new TextureLoader(am.manager), new TGALoader(am.manager));
  const { scene } = composer.compose();

  const upAxis = asset.upAxis === 'Z_UP' || asset.upAxis === 'X_UP' ? asset.upAxis : 'Y_UP';
  if (upAxis === 'Z_UP') scene.rotation.set(-Math.PI / 2, 0, 0);
  else if (upAxis === 'X_UP') scene.rotation.set(0, 0, Math.PI / 2);
  const unitMeter = asset.unit > 0 ? asset.unit : 1;
  scene.scale.setScalar(unitMeter * 1000); // unité du fichier → mm, appliqué une seule fois ici
  scene.updateMatrixWorld(true);
  await am.waitTextures();

  const unitTag = bundle.daeText.slice(0, 20000).match(/<unit\b[^>]*name\s*=\s*"([^"]+)"/i);
  return {
    root: scene,
    unitMeter,
    unitName: unitTag?.[1] ?? '',
    upAxis,
    loaderAppliedUnit: false,
    missingTextures: am.missing,
    dispose: am.revoke,
  };
}

/** GLB brut (ex. export GLB natif de SketchUp) : glTF = mètres, Y vers le haut. */
export async function loadRawGlb(bundle: SourceBundle): Promise<LoadedModel> {
  if (!bundle.glb) throw new Error('Contenu .glb absent');
  const gltf = await new GLTFLoader().parseAsync(bundle.glb, '');
  const root = gltf.scene;
  root.scale.setScalar(1000);
  root.updateMatrixWorld(true);
  return { root, unitMeter: 1, unitName: 'meter', upAxis: 'Y_UP', loaderAppliedUnit: false, missingTextures: [], dispose: () => {} };
}
