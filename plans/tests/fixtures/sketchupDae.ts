// Générateur de .dae de test imitant un export COLLADA de SketchUp (pouces, Z vers le haut,
// hiérarchie de composants conservée, définition de module partagée par toutes les Viewbox).
// Toutes les cotes sont données en mm et converties en pouces à l'écriture.

type V3 = [number, number, number];
const INCH = 25.4;

interface GeomSpec {
  id: string;
  boxes: Array<[V3, V3]>; // [min, max] en mm
  material: string;
  twoSided?: boolean;
  edges?: boolean;
}

function num(v: number) {
  return (v / INCH).toFixed(6).replace(/\.?0+$/, '');
}

function geometryXml(g: GeomSpec): string {
  const pos: number[] = [];
  const tris: number[] = [];
  const backTris: number[] = [];
  const lines: number[] = [];
  const normals: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [a, b] of g.boxes) {
    const o = pos.length / 3;
    const c: V3[] = [
      [a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]],
      [a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]],
    ];
    for (const p of c) pos.push(...p);
    // faces (sens trigonométrique vu de l'extérieur) + indice de normale
    const faces: Array<[number, number, number, number, number]> = [
      [1, 2, 6, 5, 0], [0, 4, 7, 3, 1], [3, 7, 6, 2, 2], [0, 1, 5, 4, 3], [4, 5, 6, 7, 4], [0, 3, 2, 1, 5],
    ];
    for (const [i0, i1, i2, i3, n] of faces) {
      tris.push(o + i0, n, o + i1, n, o + i2, n, o + i0, n, o + i2, n, o + i3, n);
      const nb = n % 2 === 0 ? n + 1 : n - 1; // normale opposée
      backTris.push(o + i0, nb, o + i2, nb, o + i1, nb, o + i0, nb, o + i3, nb, o + i2, nb);
    }
    const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [p, q] of e) lines.push(o + p, o + q);
  }
  const posStr = [];
  for (let i = 0; i < pos.length; i++) posStr.push(num(pos[i]));
  const nrm = normals.flat().join(' ');
  return `
    <geometry id="${g.id}" name="${g.id}"><mesh>
      <source id="${g.id}-pos"><float_array id="${g.id}-pos-array" count="${pos.length}">${posStr.join(' ')}</float_array>
        <technique_common><accessor source="#${g.id}-pos-array" count="${pos.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
      <source id="${g.id}-nrm"><float_array id="${g.id}-nrm-array" count="18">${nrm}</float_array>
        <technique_common><accessor source="#${g.id}-nrm-array" count="6" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
      <vertices id="${g.id}-vtx"><input semantic="POSITION" source="#${g.id}-pos"/></vertices>
      <triangles count="${tris.length / 6}" material="M"><input semantic="VERTEX" source="#${g.id}-vtx" offset="0"/><input semantic="NORMAL" source="#${g.id}-nrm" offset="1"/><p>${tris.join(' ')}</p></triangles>
      ${g.twoSided ? `<triangles count="${backTris.length / 6}" material="MB"><input semantic="VERTEX" source="#${g.id}-vtx" offset="0"/><input semantic="NORMAL" source="#${g.id}-nrm" offset="1"/><p>${backTris.join(' ')}</p></triangles>` : ''}
      ${g.edges ? `<lines count="${lines.length / 2}" material="EDGE"><input semantic="VERTEX" source="#${g.id}-vtx" offset="0"/><p>${lines.join(' ')}</p></lines>` : ''}
    </mesh></geometry>`;
}

function instGeom(g: GeomSpec): string {
  return `<instance_geometry url="#${g.id}"><bind_material><technique_common>
      <instance_material symbol="M" target="#${g.material}"/>
      <instance_material symbol="MB" target="#${g.material}"/>
      <instance_material symbol="EDGE" target="#MAT_edge"/>
    </technique_common></bind_material></instance_geometry>`;
}

function matrix(m: number[]): string {
  // m : 12 valeurs (3 lignes × 4), translation en mm → pouces
  const v = [m[0], m[1], m[2], m[3] / INCH, m[4], m[5], m[6], m[7] / INCH, m[8], m[9], m[10], m[11] / INCH, 0, 0, 0, 1];
  return `<matrix>${v.join(' ')}</matrix>`;
}
const translate = (x: number, y: number, z: number) => matrix([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]);
const rotZ90 = (x: number, y: number, z: number) => matrix([0, -1, 0, x, 1, 0, 0, y, 0, 0, 1, z]);

export interface FixtureOptions {
  unitMeter?: number;
  unitName?: string;
  twoSided?: boolean;
  edges?: boolean;
}

export function makeSketchupDae(opts: FixtureOptions = {}): string {
  const two = opts.twoSided ?? true;
  const edges = opts.edges ?? true;
  const G = (id: string, boxes: Array<[V3, V3]>, material = 'MAT_steel'): GeomSpec => ({ id, boxes, material, twoSided: two, edges });
  const geoms = {
    slab: G('GEO_slab', [[[0, 0, 0], [5900, 2500, 150]]]),
    frame: G('GEO_frame', [
      [[0, 0, 150], [100, 100, 2800]], [[5800, 0, 150], [5900, 100, 2800]],
      [[0, 2400, 150], [100, 2500, 2800]], [[5800, 2400, 150], [5900, 2500, 2800]],
      [[0, 0, 2700], [5900, 2500, 2800]],
    ]),
    glass: G('GEO_glass', [[[100, 0, 150], [5800, 20, 2700]]], 'MAT_vitre'),
    door: G('GEO_door', [[[5880, 800, 150], [5900, 1700, 2300]]], 'MAT_door'),
    foot: G('GEO_foot', [[[-50, -50, -100], [150, 150, 0]]]),
    misc: G('GEO_misc', [[[2000, 1000, 150], [2200, 1200, 400]]]),
    stair: G('GEO_stair', [[[-2000, 0, 0], [-500, 1000, 2800]]]),
    orphan: G('GEO_orphan', [[[30000, 0, 0], [31800, 100, 2300]]], 'MAT_door'),
    spatial: G('GEO_spatial', [[[8000, 1000, 500], [8100, 1500, 2000]]]),
    ground: G('GEO_ground', [[[-10000, -10000, -10], [40000, 20000, 0]]]),
  };
  const feet = [
    [0, 0], [5900 - 100, 0], [0, 2500 - 100], [5900 - 100, 2500 - 100],
  ].map(([x, y], i) => `<node id="N_foot${i}" name="PIED_0${i + 1}">${translate(x, y, 0)}${instGeom(geoms.foot)}</node>`).join('');

  const material = (id: string, r: number, g: number, b: number, a = 1) => ({
    mat: `<material id="${id}" name="${id.replace('MAT_', '')}"><instance_effect url="#${id}-fx"/></material>`,
    fx: `<effect id="${id}-fx"><profile_COMMON><technique sid="COMMON"><lambert>
        <diffuse><color>${r} ${g} ${b} 1</color></diffuse>
        ${a < 1 ? `<transparent opaque="A_ONE"><color>1 1 1 1</color></transparent><transparency><float>${a}</float></transparency>` : ''}
      </lambert></technique></profile_COMMON></effect>`,
  });
  const mats = [
    material('MAT_steel', 0.2, 0.2, 0.2),
    material('MAT_vitre', 0.8, 0.9, 0.95, 0.35),
    material('MAT_door', 0.5, 0.1, 0.1),
    material('MAT_edge', 0, 0, 0),
  ];

  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor><authoring_tool>SketchUp 26.0.0</authoring_tool></contributor>
    <unit meter="${opts.unitMeter ?? 0.0254}" name="${opts.unitName ?? 'inch'}"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_visual_scenes>
    <visual_scene id="ID1">
      <node name="SketchUp">
        <node id="N_vbx1" name="VBX-01">${translate(0, 0, 0)}<instance_node url="#DEF_viewbox"/></node>
        <node id="N_vbx2" name="VBX-2">${translate(5900, 0, 0)}<instance_node url="#DEF_viewbox"/></node>
        <node id="N_vbx3" name="VBX-03">${rotZ90(17500, 0, 0)}<instance_node url="#DEF_viewbox"/></node>
        <node id="N_vbx4" name="VBX-04">${translate(0, 0, 2800)}<instance_node url="#DEF_viewbox"/></node>
        <node id="N_stair" name="COMMUN_ESCALIER-01">${instGeom(geoms.stair)}</node>
        <node id="N_orphan" name="PORTE-DOUBLE orpheline">${instGeom(geoms.orphan)}</node>
        <node id="N_spatial" name="MUR-LEGER_spatial">${instGeom(geoms.spatial)}</node>
        <node id="N_ground" name="CTX_sol">${instGeom(geoms.ground)}</node>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <library_nodes>
    <node id="DEF_viewbox" name="Viewbox 5900">
      ${instGeom(geoms.slab)}
      <node id="N_frame" name="STRUCTURE_cadre">${instGeom(geoms.frame)}</node>
      <node id="N_glass" name="VITRE-SEAMLESS_#7-230-044">${instGeom(geoms.glass)}</node>
      <node id="N_doorInst" name="instance_3">${translate(0, 0, 0)}<instance_node url="#DEF_door"/></node>
      ${feet}
      <node id="N_misc" name="Group 12">${instGeom(geoms.misc)}</node>
    </node>
    <node id="DEF_door" name="Porte simple 900">${instGeom(geoms.door)}</node>
  </library_nodes>
  <library_geometries>${Object.values(geoms).map(geometryXml).join('')}</library_geometries>
  <library_materials>${mats.map((m) => m.mat).join('')}</library_materials>
  <library_effects>${mats.map((m) => m.fx).join('')}</library_effects>
  <scene><instance_visual_scene url="#ID1"/></scene>
</COLLADA>`;
}
