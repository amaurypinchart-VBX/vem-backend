// Structure d'un type de Viewbox : composant Viewbox entier compris dans son gabarit (jamais demandé comme une pièce),
// sections de toiture propres, contrôles de la fiche, trace des modifications (sources, rapport), sections saisies
// (calculées depuis les dimensions ou reprises de la fiche), résultat « périmé » quand la structure change.
import { describe, expect, it } from 'vitest';
import type { ModuleInfo, NodeInfo, SceneIndex } from '../../src/core/types';
import { makeLookup } from '../../src/core/subset';
import { sectionMap } from '../../src/structure/core/assemble';
import { rhs } from '../../src/structure/core/catalog';
import type { LibraryEntry, ModuleTypeEntry } from '../../src/structure/core/library';
import { isViewboxBody, missingData, recognize } from '../../src/structure/core/recognition';
import { viewboxTemplate } from '../../src/structure/core/templates/viewboxEU';
import {
  FAMILY_SLOTS,
  checkTemplate,
  editedModuleEntry,
  lastModification,
  parseList,
  sectionFromUser,
  slotSection,
  templateChanges,
  withSection,
} from '../../src/structure/core/viewboxEdit';
import { CALC_DEFAULTS, inputKey } from '../../src/structure/studyRun';
import type { StudyInputs } from '../../src/structure/studyRun';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';
import { LOADS, vbx } from './studyHelpers';

const VBX = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
const P = VBX.params!;

let seq = 0;
const node = (p: Partial<NodeInfo>): NodeInfo =>
  ({
    id: p.id ?? `n${++seq}`,
    name: p.name ?? 'Groupe',
    parentId: p.parentId ?? null,
    kind: 'group',
    role: 'item',
    category: null,
    categorySource: null,
    moduleId: null,
    assignment: null,
    level: 0,
    bboxMm: [0, 0, 0, 100, 100, 100],
    triangles: 12,
    ...p,
  }) as NodeInfo;

/** Modèle comme celui de l'utilisateur : chaque VBX-xx contient le composant « 7-962-016 VIEWBOX STANDARD… » classé d'un bloc. */
function bodyModel(n: number): SceneIndex {
  const nodes: NodeInfo[] = [];
  const modules: ModuleInfo[] = [];
  for (let k = 0; k < n; k++) {
    const id = `VBX-${String(k + 1).padStart(2, '0')}`;
    const mn = node({ id: `m${k}`, name: id, role: 'module', moduleId: id });
    nodes.push(
      mn,
      node({
        name: '7-962-016 VIEWBOX STANDARD M16 60MM 5900X2500 H3',
        definition: '7-962-016 VIEWBOX STANDARD M16 60MM 5900X2500 H3',
        articleRef: '7-962-016',
        category: 'VIEWBOX',
        parentId: mn.id,
        moduleId: id,
        assignment: 'hierarchy',
        bboxMm: [0, 0, 0, 5900, 3180, 2500],
        triangles: 20000,
      }),
      // mur de grand côté : aussi long que la Viewbox et haut comme elle, mais mince → reste une pièce
      node({ name: 'Mur', definition: 'Mur Nidaplast', category: 'MUR-LEGER', parentId: mn.id, moduleId: id, assignment: 'hierarchy', bboxMm: [0, 0, 0, 5900, 2520, 45], triangles: 24 }),
    );
    modules.push({
      id,
      nodeId: mn.id,
      name: id,
      level: 0,
      planDimsMm: [5900, 2500],
      heightMm: 3180,
      expected: { label: 'Viewbox 5900', long: 5900, short: 2500, source: 'standard' },
      dimsOk: true,
      bboxMm: [0, 0, 0, 5900, 3180, 2500],
      itemIds: [],
      detectedBy: 'name',
    });
  }
  return { schema: 'vem-plans-index/1', engineVersion: 't', createdAt: '', source: {} as SceneIndex['source'], stats: {} as SceneIndex['stats'], nodes, modules, levels: [], commonIds: [], contextIds: [], warnings: [] };
}

describe('composant Viewbox entier', () => {
  it('corps du module : longueur, largeur et toute la hauteur ; un mur ou un plancher ne le sont pas', () => {
    const e = { long: 5900, short: 2500 };
    expect(isViewboxBody([5900, 3180, 2500], e)).toBe(true);
    expect(isViewboxBody([2500, 5900, 3080], e)).toBe(true);
    expect(isViewboxBody([5890, 2980, 2510], e)).toBe(true);
    expect(isViewboxBody([5900, 2520, 45], e)).toBe(false);
    expect(isViewboxBody([5900, 2500, 60], e)).toBe(false);
    expect(isViewboxBody([8400, 3180, 2500], e)).toBe(false);
  });

  it('9 Viewbox dont le composant est classé « VIEWBOX » : aucune question pour lui, le mur reste à renseigner', () => {
    const index = bodyModel(9);
    const r = recognize({ index, look: makeLookup(index), library: SEED, assignments: {}, accessoryCategories: new Set(['MUR-LEGER']) });
    expect(r.templateParts.size).toBe(9);
    expect(r.types.some((t) => t.label.includes('7-962-016'))).toBe(false);
    const modules = r.types.filter((t) => t.kind === 'module');
    expect(modules).toHaveLength(1);
    expect(modules[0].assignment?.moduleTemplate).toBe('VIEWBOX-5900-EU');
    expect(r.types.some((t) => t.category === 'MUR-LEGER')).toBe(true);
    // couleur de la Viewbox (proposée) sur son composant
    const body = [...r.templateParts.keys()][0];
    expect(r.colors.get(body)).toBe(r.colors.get(index.modules[0].nodeId));
  });

  it('pièce déclarée « Viewbox » à la main : rien à saisir (calculée par le gabarit de sa Viewbox)', () => {
    const templates = new Map([[VBX.key, VBX]]);
    expect(missingData({ role: 'structural', nature: 'viewbox' }, templates, 'item')).toBeNull();
    expect(missingData({ role: 'structural', nature: 'viewbox' }, templates, 'module')).toBe('gabarit de Viewbox à choisir');
  });
});

describe('fiche de structure d’un type de Viewbox', () => {
  it('toiture : sections propres si elles sont données, sinon celles du plancher (notes statico)', () => {
    const base = viewboxTemplate(P);
    const sec = (t: ReturnType<typeof viewboxTemplate>, f: string) => [...new Set(t.members.filter((m) => m.family === f).map((m) => m.section))];
    expect(sec(base, 'rim-roof')).toEqual(['UNP220']);
    expect(sec(base, 'secondary-roof')).toEqual(['RHP120x60x4']);
    const t = viewboxTemplate(withSection(withSection(P, 'rimRoof', 'QHP100x5'), 'secondaryRoof', 'QHP80x3-CF'));
    expect(sec(t, 'rim-roof')).toEqual(['QHP100x5']);
    expect(sec(t, 'secondary-roof')).toEqual(['QHP80x3-CF']);
    expect(sec(t, 'rim-floor')).toEqual(['UNP220']);
    expect(sec(t, 'secondary-floor')).toEqual(['RHP120x60x4']);
    expect(t.members).toHaveLength(base.members.length);
    expect(slotSection(P, FAMILY_SLOTS.find((f) => f.family === 'rim-roof')!)).toBe('UNP220');
  });

  it('contrôles : la base de départ passe ; positions hors Viewbox, section absente ou de liaison refusées', () => {
    expect(checkTemplate(P, SEED)).toEqual({ errors: [], warnings: [] });
    expect(checkTemplate({ ...P, transverseX: [1144, 2344, 6000] }, SEED).errors.join()).toMatch(/Traverse à 6000 mm : hors de la Viewbox/);
    expect(checkTemplate({ ...P, longitudinalY: [835, 880] }, SEED).errors.join()).toMatch(/moins de 100 mm/);
    expect(checkTemplate(withSection(P, 'column', 'NOPE'), SEED).errors.join()).toMatch(/Poteaux d’angle : section NOPE absente/);
    expect(checkTemplate(withSection(P, 'column', 'RD20-EQ'), SEED).errors.join()).toMatch(/sans masse/);
    expect(checkTemplate({ ...P, topZ: 2000 }, SEED).errors.join()).toMatch(/pas plus bas que la toiture/);
    // une seule lisse : cases de 1 201 × 1 245 mm, le contreplaqué porte dans le sens court (1 201 mm), vérifié sur 800 mm
    expect(checkTemplate({ ...P, longitudinalY: [1250] }, SEED).warnings.join()).toMatch(/espacées jusqu’à 1201 mm/);
    expect(parseList('1144 ; 2344, 3544  4745')).toEqual([1144, 2344, 3544, 4745]);
    expect(parseList('12 ; abc')).toBeNull();
  });

  it('modification tracée (sources, rapport), copie sous un autre nom, résultat périmé', () => {
    const next = withSection({ ...P, transverseX: [1145, 2344, 3544, 4745] }, 'rimRoof', 'QHP100x5');
    const edited = editedModuleEntry(VBX, { params: next }, { library: SEED, who: 'A. Pinchart', date: '30/09/2026' });
    expect(templateChanges(VBX, edited, SEED)).toEqual(['rives de toiture UNP 220 → QHP 100×5', 'traverses x 1 144 ; 2 344 ; 3 544 ; 4 745 → 1 145 ; 2 344 ; 3 544 ; 4 745 mm']);
    expect(edited.key).toBe(VBX.key);
    expect(edited.status).toBe('known');
    expect(edited.source).toHaveLength(VBX.source.length + 1);
    expect(lastModification(edited)).toMatch(/^modifié le 30\/09\/2026 par A\. Pinchart : rives de toiture UNP 220 → QHP 100×5/);
    expect(lastModification(VBX)).toBeNull();
    const copy = editedModuleEntry(VBX, { params: next }, { library: SEED, who: 'A. Pinchart', date: '30/09/2026', asNew: { name: 'Viewbox 5900 H3 renforcée' } });
    expect(copy.key).toBe('VIEWBOX-VIEWBOX-5900-H3-RENFORCEE');
    expect(copy.name).toBe('Viewbox 5900 H3 renforcée');
    expect(lastModification(copy)).toMatch(/^copie de « Viewbox 5900 × 2500 \(EU, M16\) » modifié le/);

    // une position changée d'un millimètre (même longueur de texte) rend le résultat périmé
    const lib = (e: ModuleTypeEntry): LibraryEntry[] => SEED.map((x) => (x.kind === 'module_type' && x.key === e.key ? e : x));
    const inputs = (library: LibraryEntry[]): StudyInputs => ({
      modules: [vbx('A', 0, 0)],
      edgeItems: [],
      pointItems: [],
      library,
      sections: sectionMap(library),
      loads: LOADS,
      middleFeet: false,
      sls: true,
      options: CALC_DEFAULTS,
      blocking: [],
    });
    const moved = editedModuleEntry(VBX, { params: { ...P, transverseX: [1145, 2344, 3544, 4745] } }, { library: SEED, who: 'x', date: 'd' });
    expect(inputKey(inputs(lib(moved)))).not.toBe(inputKey(inputs(SEED)));
    expect(inputKey(inputs(SEED))).toBe(inputKey(inputs([...SEED])));
  });
});

describe('sections saisies', () => {
  it('tube rectangulaire : propriétés calculées par l’outil, courbe c (formé à froid) ou a (fini à chaud)', () => {
    const r = sectionFromUser({ designation: 'RHS 120 × 80 × 5', shape: 'RHS', dims: { h: 120, b: 80, t: 5 }, material: 'S355' }, 'A. Pinchart', '30/09/2026');
    expect(r.problems).toEqual([]);
    expect(r.computed).toBe(true);
    const s = r.entry!;
    expect(s.key).toBe('SEC-RHS-120-80-5');
    expect(s.status).toBe('known');
    expect(s.material).toBe('S355');
    const ref = rhs(120, 80, 5, 'cold-formed');
    expect(s.section.A).toBeCloseTo(ref.A, 6);
    expect(s.section.Iy).toBeCloseTo(ref.Iy, 3);
    expect([s.section.curveY, s.section.curveZ]).toEqual(['c', 'c']);
    expect(s.source[0].note).toMatch(/propriétés calculées par l’outil depuis les dimensions/);
    const hot = sectionFromUser({ designation: 'RHS 120 × 80 × 5 H', shape: 'RHS', hotFinished: true, dims: { h: 120, b: 80, t: 5 }, material: 'S355' }, 'x', 'd').entry!;
    expect([hot.section.curveY, hot.section.curveZ]).toEqual(['a', 'a']);
    expect(hot.section.fabrication).toBe('hot-finished');
  });

  it('profil laminé : valeurs de la fiche obligatoires (cm → mm), sinon inutilisable', () => {
    const none = sectionFromUser({ designation: 'UPE 200', shape: 'UNP', dims: { h: 200, b: 80, tw: 6, tf: 11, r: 13 }, material: 'S235' }, 'x', 'd');
    expect(none.entry).toBeNull();
    expect(none.problems.join()).toMatch(/propriétés incomplètes/);
    const upe = sectionFromUser(
      {
        designation: 'UPE 200',
        shape: 'UNP',
        dims: { h: 200, b: 80, tw: 6, tf: 11, r: 13 },
        material: 'S235',
        values: { A: 29, Iy: 1910, Iz: 187, Wely: 191, Welz: 34.4, Wply: 220, Wplz: 64.7, It: 11.9, kgPerM: 22.8 },
        sourceNote: 'catalogue ArcelorMittal',
      },
      'x',
      'd',
    );
    const s = upe.entry!;
    expect(upe.computed).toBe(false);
    expect(s.section.shape).toBe('UNP');
    expect(s.section.A).toBeCloseTo(2900, 6);
    expect(s.section.Iy).toBeCloseTo(1910e4, 0);
    expect(s.section.Wely).toBeCloseTo(191e3, 0);
    expect(s.section.kgPerM).toBe(22.8);
    expect(s.source[0].note).toMatch(/valeurs de la fiche catalogue ArcelorMittal/);
    expect(sectionFromUser({ designation: '', shape: 'FLAT', dims: { b: 60, t: 6 }, material: 'S235' }, 'x', 'd').entry).toBeNull();
  });
});
