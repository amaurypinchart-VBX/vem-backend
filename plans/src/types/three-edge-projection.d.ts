// Déclarations minimales des modules internes de three-edge-projection (JS sans types) utilisés par le moteur 2D.
declare module 'three-edge-projection/src/utils/generateEdges.js' {
  import type { BufferGeometry, Line3, Matrix4 } from 'three';
  export function generateEdges(
    geometry: BufferGeometry,
    target?: Line3[],
    options?: { matrix?: Matrix4 | null; thresholdAngle?: number; iterationTime?: number },
  ): Generator<void, Line3[], void>;
}

declare module 'three-edge-projection/src/utils/generateIntersectionEdges.js' {
  import type { Line3, Matrix4 } from 'three';
  import type { MeshBVH } from 'three-mesh-bvh';
  export function generateIntersectionEdges(bvhA: MeshBVH, bvhB: MeshBVH, matrixBToA: Matrix4, target?: Line3[]): Line3[];
}

declare module 'three-edge-projection/src/utils/LineObjectsBVH.js' {
  import type { Line3 } from 'three';
  import { BVH } from 'three-mesh-bvh';
  export class LineObjectsBVH extends BVH {
    constructor(lines: Line3[], options?: Record<string, unknown>);
    readonly lines: Line3[];
  }
}

declare module 'three-edge-projection/src/utils/bvhcastEdges.js' {
  import type { Mesh } from 'three';
  import type { MeshBVH } from 'three-mesh-bvh';
  import type { LineObjectsBVH } from 'three-edge-projection/src/utils/LineObjectsBVH.js';
  export function bvhcastEdges(edgesBvh: LineObjectsBVH, bvh: MeshBVH, mesh: Mesh, hiddenOverlapMap: Array<Array<[number, number]>>): void;
}

declare module 'three-edge-projection/src/utils/overlapUtils.js' {
  import type { Line3 } from 'three';
  export function overlapsToLines(line: Line3, overlaps: Array<[number, number]>, invert?: boolean, target?: Float32Array[]): number;
}

declare module 'three-edge-projection/src/utils/triangleLineUtils.js' {
  import type { Line3 } from 'three';
  import type { ExtendedTriangle } from 'three-mesh-bvh';
  export function isLineTriangleEdge(tri: ExtendedTriangle, line: Line3): boolean;
}

declare module 'three-edge-projection/src/utils/trimToBeneathTriPlane.js' {
  import type { Line3 } from 'three';
  import type { ExtendedTriangle } from 'three-mesh-bvh';
  export function trimToBeneathTriPlane(tri: ExtendedTriangle, line: Line3, lineTarget: Line3): boolean;
}

declare module 'three-edge-projection/src/utils/getProjectedLineOverlap.js' {
  import type { Line3 } from 'three';
  import type { ExtendedTriangle } from 'three-mesh-bvh';
  export function getProjectedLineOverlap(line: Line3, triangle: ExtendedTriangle, lineTarget?: Line3): Line3 | null;
}

declare module 'three-edge-projection/src/utils/getProjectedOverlaps.js' {
  import type { Line3 } from 'three';
  export function appendOverlapRange(line: Line3, overlapLine: Line3, overlapsTarget: Array<[number, number]>): boolean;
}
