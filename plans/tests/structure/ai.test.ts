// IA de l'étude structure (S7), parties sans IA : garde-fou des chiffres (serveur), propositions → formulaire,
// sections lues dans un document recalculées par l'outil, capacités converties, panneaux composés, données envoyées
// pour la rédaction, gabarit de calcul rendu visible. Aucun appel réel à l'API ici.
import { describe, expect, it } from 'vitest';
import { checkText, costOf, normalizeGroups, normalizeIdentify, numbersIn, verifyExtract } from '../../../src/services/structureAiGuard';
import type { ExtractedConnection, ExtractedSection } from '../../src/structure/core/ai';
import { AI_CONFIDENCE_MIN, connectionFromExtract, identifyPayload, sectionFromExtract, suggestionToAssignment } from '../../src/structure/core/ai';
import { panelFromSearch, panelMass } from '../../src/structure/core/composite';
import type { PartType } from '../../src/structure/core/recognition';
import { templateSegments, templateSummary } from '../../src/structure/core/templateView';
import { placeItem } from '../../src/structure/scene/studyModel';
import type { EdgeItem, PointItem } from '../../src/structure/core/loads';
import type { ModuleTypeEntry } from '../../src/structure/core/library';
import { SEED } from '../../src/structure/library/seed';
import { vbx } from './studyHelpers';

describe('garde-fou : aucun chiffre ne vient de l’IA', () => {
  it('nombres isolés d’un texte, identifiants ignorés', () => {
    expect(numbersIn('4 Viewbox sur 2 niveaux, η max = 0,81 ; vent 0.37 kN/m² ; 2 564 kg ; −0,5')).toEqual([4, 2, 0.81, 0.37, 2564, -0.5]);
    // VBX-02, CO303, S235, M20, EN 1993-1-1, F40/30 : identifiants, pas des valeurs
    expect(numbersIn('VBX-02, CO303, S235, M20-8.8, DIN EN 1993-1-1, F40/30, UNP 220x80')).toEqual([]);
  });
  it('texte accepté seulement si ses nombres sont dans les données (arrondis compris)', () => {
    const facts = { viewbox: 4, eta: 0.8123, vent: { q: 0.37 }, motif: 'μ requis 0,52 > 0,40' };
    expect(checkText('Les 4 Viewbox passent avec un taux de 0,81 sous un vent de 0,37 kN/m².', facts)).toEqual([]);
    expect(checkText('Le glissement demande μ = 0,52.', facts)).toEqual([]);
    expect(checkText('Le taux maximal est de 0,95 et 6 Viewbox.', facts)).toEqual([0.95, 6]);
    // petits entiers admis (comptages, « 2ᵉ ordre »)
    expect(checkText('calcul au 2ᵉ ordre, 3 cas', facts)).toEqual([]);
  });
  it('valeur lue dans un document : retrouvée dans une citation exacte, sinon dans l’extrait recopié', () => {
    expect(verifyExtract({ A: 13.5, Iy: 247 }, '', [{ text: 'RRO120X60X4  A = 13,50 cm²  Iy = 247,00 cm4' }])).toEqual({ verified: 'citation', missing: [] });
    expect(verifyExtract({ A: 13.5 }, 'A = 13,5 cm²', [])).toEqual({ verified: 'quote', missing: [] });
    expect(verifyExtract({ A: 14.2 }, 'A = 13,5 cm²', [{ text: 'autre chose' }]).verified).toBe('no');
  });
  it('proposition hors des listes permises : corrigée et confiance plafonnée', () => {
    const opt = { natures: { load: ['wall', 'other'], structural: ['beam'] }, materials: [{ key: 'S235' }], sections: [{ key: 'UNP220' }] };
    const r = normalizeIdentify({ role: 'load', nature: 'tank', material: 'S999', section: null, weight: { value: 50, unit: 'kg/m' }, confidence: 0.9, questions: [] }, opt);
    expect(r.nature).toBe('wall');
    expect(r.material).toBeNull();
    expect(r.confidence).toBeLessThanOrEqual(0.4);
    expect(r.questions.join(' ')).toMatch(/corrigée par l’outil/);
    expect(normalizeGroups({ groups: [{ keys: ['a', 'b', 'zz'], label: 'g', reason: '' }, { keys: ['b', 'c'], label: 'h', reason: '' }] }, new Set(['a', 'b', 'c']))).toEqual([{ keys: ['a', 'b'], label: 'g', reason: '' }]);
  });
  it('coût estimé des appels', () => {
    expect(costOf('claude-opus-5-5', { input_tokens: 1e6, output_tokens: 1e5 })).toBeCloseTo(4 + 2, 9);
    expect(costOf('inconnu', { input_tokens: 10 })).toBeNull();
  });
});

describe('propositions de l’IA dans l’outil', () => {
  const t = {
    key: 'def:garde-corps',
    kind: 'item',
    label: 'Garde-corps 2 m',
    category: 'GARDE-CORPS',
    nodeIds: ['n1', 'n2'],
    moduleIds: ['VBX-01'],
    fingerprint: { dims: [2000, 1100, 40], materials: ['alu'], category: 'GARDE-CORPS', triangles: 400 },
    signature: {},
    status: 'unknown',
    source: 'none',
    reason: 'inconnu',
  } as unknown as PartType;
  it('données envoyées : noms, empreinte et seules réponses permises', () => {
    const p = identifyPayload(t, SEED);
    expect(p.type.instances).toBe(2);
    expect(p.type.dims).toEqual([2000, 1100, 40]);
    expect(p.options.sections.some((s) => s.key === 'UNP220')).toBe(true);
    expect(p.options.materials.some((m) => m.key === 'S235')).toBe(true);
  });
  it('réponse → formulaire : « proposé » au-dessus du seuil, « inconnu » en dessous', () => {
    const s = { role: 'load', nature: 'railing', weight: { value: 10, unit: 'kg/m' as const }, windClosed: false, confidence: 0.8, questions: [], rationale: 'garde-corps alu' };
    const a = suggestionToAssignment(s);
    expect(a.status).toBe('suggested');
    expect(a.assignment).toMatchObject({ role: 'load', nature: 'railing', weight: { value: 10, unit: 'kg/m' }, windClosed: false });
    expect(suggestionToAssignment({ ...s, confidence: AI_CONFIDENCE_MIN - 0.01 }).status).toBe('unknown');
  });
  it('section lue : recalculée par l’outil depuis ses dimensions et comparée aux valeurs imprimées (SCIA Hoka)', () => {
    const x: ExtractedSection = {
      designation: 'RRO 120x60x4',
      role: 'traverses',
      shape: 'RHS',
      fabrication: 'cold',
      dims: { h: 120, b: 60, t: 4 },
      material: 'S235',
      values: { A: 13.5, Iy: 247, Iz: 82.7, Wely: 41.1, Welz: 27.6, Wply: 51.5, Wplz: 31.6, It: 199 },
      curves: { y: 'c', z: 'c' },
      page: 'B6',
      quote: '',
      check: { verified: 'citation', missing: [] },
    };
    const r = sectionFromExtract(x, '24-0571');
    expect(r.computed).toBe(true);
    expect(r.comparisons.length).toBeGreaterThanOrEqual(6);
    for (const c of r.comparisons) expect(Math.abs(c.deviation)).toBeLessThan(0.03);
    expect(r.entry!.status).toBe('suggested');
    expect(r.entry!.source[0]).toMatchObject({ ref: 'report:24-0571', page: 'B6' });
    // valeur imprimée fausse : écart signalé
    const bad = sectionFromExtract({ ...x, values: { ...x.values, A: 20 } }, '24-0571');
    expect(bad.problems.join(' ')).toMatch(/A recalculé/);
    // UNP laminé : pas de recalcul, valeurs du document reprises et signalées
    const unp = sectionFromExtract({ ...x, designation: 'UNP 220', shape: 'U', fabrication: 'hot', dims: { h: 220, b: 80 } }, '24-0571');
    expect(unp.computed).toBe(false);
    expect(unp.entry!.section.A).toBeCloseTo(1350, 6);
    expect(unp.problems.join(' ')).toMatch(/non recalculable/);
  });
  it('capacités lues : converties en unités internes (N, N·mm, N·mm/rad)', () => {
    const x: ExtractedConnection = {
      name: 'Eckverbindung',
      composition: '4 × M16-8.8',
      capacities: [
        { label: 'N', value: 70, unit: 'kN' },
        { label: 'M', value: 8, unit: 'kNm' },
        { label: 'k', value: 3500, unit: 'kNcm/deg' },
      ],
      page: 'A22',
      quote: '',
      check: { verified: 'quote', missing: [] },
    };
    const e = connectionFromExtract(x, '24-0571');
    expect(e.capacities.map((c) => c.unit)).toEqual(['N', 'N·mm', 'N·mm/rad']);
    expect(e.capacities[0].value).toBeCloseTo(70e3, 6);
    expect(e.capacities[1].value).toBeCloseTo(8e6, 6);
    // 3 500 kNcm/deg = 2,0054e9 N·mm/rad (rigidité des angles du gabarit)
    expect(e.capacities[2].value / 2.0054e9).toBeCloseTo(1, 3);
    expect(e.status).toBe('suggested');
    expect(e.key.startsWith('REF-24-0571-')).toBe(true);
  });
});

describe('panneaux composés', () => {
  it('poids au m² : couches + cadre de profilés, calculé par l’outil', () => {
    const m = panelMass({
      name: 'Panneau mural',
      layers: [
        { name: 'Nidaplast', thickness: 45, density: 80 },
        { name: 'VEKA', thickness: 2, density: 1400 },
      ],
      frame: { name: 'profilé alu 45', kgPerM: 1.5, width: 1000, height: 2790 },
    });
    expect(m.kgPerM2).toBeCloseTo(3.6 + 2.8 + (1.5 * 2 * 3.79) / 2.79, 9);
    expect(m.record.withValues).toContain('kg/m²');
  });
  it('résultat de recherche : masse volumique déduite de la masse surfacique par l’outil', () => {
    const p = panelFromSearch({
      name: 'Panneau',
      layers: [{ name: 'VEKA', material: 'PVC', thicknessMm: 2, densityKgM3: null, surfaceMassKgM2: 2.8, url: 'https://x', title: 't', quote: '2,8 kg/m²', check: { verified: 'citation', missing: [] } }],
      frame: null,
      questions: [],
      notes: '',
      sources: [],
    });
    expect(p.layers[0].density).toBeCloseTo(1400, 9);
    expect(p.layers[0].source?.check).toBe('citation');
  });
});

describe('charges des objets', () => {
  it('panneau vertical en kg/m² : longueur × hauteur, en charge linéique sur la rive (pas l’emprise au sol)', () => {
    const m = vbx('VBX-01', 0, 0);
    const edge: EdgeItem[] = [];
    const point: PointItem[] = [];
    // mur le long du grand côté v0 (SketchUp y = 0 → monde z = 0), 45 mm d'épaisseur, 2,79 m de haut
    placeItem([5, 0, -45, 5895, 2790, 0], 'VBX-01', { role: 'load', nature: 'wall', weight: { value: 20, unit: 'kg/m²' } }, 'mur', [m], edge, point);
    expect(point).toEqual([]);
    expect(edge).toHaveLength(1);
    expect(edge[0].side).toBe('v0');
    expect(edge[0].q).toBeCloseTo((20 * 9.81 * 2790) / 1e6, 9);
  });
});

describe('gabarit de calcul visible', () => {
  const entry = SEED.find((e): e is ModuleTypeEntry => e.kind === 'module_type' && e.key === 'VIEWBOX-5900-EU')!;
  it('résumé par famille : sections et matériaux du modèle SCIA', () => {
    const rows = templateSummary(entry, SEED);
    const rim = rows.find((r) => r.family === 'rim-floor')!;
    expect(rim.section).toBe('UNP 220');
    expect(rim.count).toBe(4);
    expect(rim.length / 1000).toBeCloseTo(2 * (5.89 + 2.49), 6);
    expect(rows.find((r) => r.family === 'column')!).toMatchObject({ section: 'QHP 100×5', count: 4 });
  });
  it('segments 3D : une paire de points et une couleur par barre', () => {
    const seg = templateSegments([vbx('A', 0, 0), vbx('B', 5.9, 0)]);
    expect(seg.positions.length).toBe(seg.colors.length);
    expect(seg.positions.length / 6).toBe(seg.families.length);
    // poteaux jusqu'à la ligne de toiture (le haut de poteau est porté par la liaison avec la Viewbox du dessus)
    expect(Math.max(...seg.positions.filter((_, k) => k % 3 === 1))).toBeCloseTo(2790, 6);
  });
});

describe('garde-fou du conseil ingénieur', () => {
  it('nombres permis : consignes, utilisateur, résultats d’outils (JSON lu comme données) ; pas ceux refusés', async () => {
    const { advisorAllowedNumbers, unknownNumbers } = await import('../../../src/services/structureAiGuard');
    const messages = [
      { role: 'user' as const, content: [{ type: 'text', text: 'Le sol n’accepte que 400 kg/m²' }] },
      { role: 'assistant' as const, content: [{ type: 'tool_use', id: 't1', name: 'etudier_sol', input: {} }] },
      { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 't1', content: JSON.stringify({ portance: { kN_m2: 3.92 }, positions: [210, 2290], public_maximal: { personnes: 37 } }) }] },
      { role: 'user' as const, content: [{ type: 'text', text: '[Contrôle automatique de VEM] nombres refusés : 55' }] },
    ];
    const allowed = advisorAllowedNumbers('Module de 5,90 m', messages);
    expect(unknownNumbers('Avec 400 kg/m² (3,92 kN/m²), au plus 37 personnes ; module de 5,90 m, trous à 2 290 mm.', allowed)).toEqual([]);
    expect(unknownNumbers('Il faut 55 plaques et 1 200 kg de lest.', allowed)).toEqual([55, 1200]);
  });
});
