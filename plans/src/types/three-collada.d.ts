// Déclarations minimales des modules internes du ColladaLoader de three.js (non typés par @types/three).
declare module 'three/addons/loaders/collada/ColladaParser.js' {
  export interface ColladaNodeData {
    id: string;
    name: string;
    nodes: string[];
    instanceNodes: string[];
    [key: string]: unknown;
  }
  export interface ColladaLibrary {
    nodes: Record<string, ColladaNodeData>;
    [key: string]: unknown;
  }
  export class ColladaParser {
    parse(text: string): { library: ColladaLibrary; asset: { unit: number; upAxis: string }; collada: Element } | null;
  }
}

declare module 'three/addons/loaders/collada/ColladaComposer.js' {
  import type { AnimationClip, Group, Object3D, TextureLoader } from 'three';
  import type { ColladaLibrary, ColladaNodeData } from 'three/addons/loaders/collada/ColladaParser.js';
  export class ColladaComposer {
    constructor(library: ColladaLibrary, collada: Element, textureLoader: TextureLoader, tgaLoader?: unknown);
    library: ColladaLibrary;
    buildNode(data: ColladaNodeData): Object3D;
    compose(): { scene: Group; animations: AnimationClip[]; kinematics: unknown };
  }
}
