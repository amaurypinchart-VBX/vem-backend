// Outils du conseil ingénieur exécutés par le navigateur (sans IA) : lecture de l'étude, diagnostic, variante simulée
// depuis une piste, recherche du lest, sol à 400 kg/m² et public maximal, application confirmée, erreurs de saisie.
import { describe, expect, it } from 'vitest';
import { SEED } from '../../src/structure/library/seed';
import { placedToEstimate } from '../../src/structure/core/mods';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import type { StudyRun } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import type { AdvisorContext, Variant } from '../../src/ui/structure/advisorTools';
import { parseChanges, runAdvisorTool } from '../../src/ui/structure/advisorTools';
import { buildStudyInputs } from '../../src/ui/structure/studyInputs';
import type { InputsSource } from '../../src/ui/structure/studyInputs';
import { DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';
import { vbx } from './studyHelpers';

function context(modules = [vbx('A', 0, 0), vbx('B', 5.9, 0)]) {
  const source: InputsSource = {
    sceneModel: { modules, edgeItems: [], pointItems: [], errors: [], warnings: [] },
    library: SEED,
    hyp: { ...DEFAULT_HYP, evacuateTop: false },
    roof: false,
    calc: CALC_DEFAULTS,
  };
  const runner = createInlineStudyRunner();
  let run: StudyRun | null = null;
  const variants: Variant[] = [];
  const applied: string[] = [];
  const ctx: AdvisorContext = {
    source,
    ensureRun: async () => (run ??= await runStudy(buildStudyInputs(source).inputs, runner)),
    runner: () => runner,
    groundModules: modules.map(placedToEstimate),
    stock: { plates: [], commercial: [] },
    variants,
    addVariant: (v) => variants.push(v),
    confirmApply: async (v) => {
      applied.push(v.id);
      return true;
    },
  };
  return { ctx, variants, applied };
}

describe('outils du conseil ingénieur', () => {
  it('étude, diagnostic, piste simulée, lest cherché, sol à 400 kg/m², application', async () => {
    const { ctx, variants, applied } = context();
    const etat = (await runAdvisorTool('etat_etude', {}, ctx)) as any;
    expect(etat.etude.verdict).toBe('fail');
    expect(etat.viewbox.find((v: any) => v.viewbox === 'A').voisines).toEqual(['B']);
    expect(etat.assemblages.boulons_entre_viewbox.diametre_mm).toBe(16);
    expect(etat.assemblages.plats_empilement).toMatchObject({ par_grand_cote: 2, par_petit_cote: 1 });
    const diag = (await runAdvisorTool('diagnostic', {}, ctx)) as any;
    const slide = diag.problemes.find((p: any) => p.id === 'sliding');
    expect(slide.pistes.map((x: any) => x.piste)).toContain('sliding/ballast-slide');
    // piste « lest contre le glissement » simulée : le glissement passe
    const sim = (await runAdvisorTool('simuler_variante', { titre: 'lest', piste: 'sliding/ballast-slide' }, ctx)) as any;
    expect(sim.variante).toBe('V1');
    expect(sim.comparaison.glissement_eta.apres).toBeLessThanOrEqual(1);
    expect(sim.changements.some((l: string) => l.includes('lest de'))).toBe(true);
    // recherche du lest (glissement exact, basculement déjà stable)
    const lest = (await runAdvisorTool('chercher_lest', { objectif: 'les_deux' }, ctx)) as any;
    expect(lest.lest_trouve).toBe(true);
    expect(lest.lest_kg_par_viewbox % 100).toBe(0);
    expect(lest.basculement).toBe('stable sans lest');
    expect(variants).toHaveLength(2);
    // sol à 400 kg/m² : pression par appui, conversions, public maximal
    const sol = (await runAdvisorTool('etudier_sol', { portance: { valeur: 400, unite: 'kg/m²' }, variante: 'V1' }, ctx)) as any;
    expect(sol.portance.kg_m2).toBe(400);
    expect(sol.portance.kN_m2).toBeCloseTo(3.92, 2);
    expect(sol.types_appui.length).toBeGreaterThan(0);
    expect(sol.types_appui[0].appui_le_plus_charge.pression_kg_m2).toBeGreaterThan(0);
    expect(sol.public_maximal).not.toBeNull();
    const app = (await runAdvisorTool('appliquer_variante', { variante: 'V1', raison: 'le glissement passe' }, ctx)) as any;
    expect(app.appliquee).toBe(true);
    expect(applied).toEqual(['V1']);
  }, 300000);

  it('surélévation en bois créée par l’IA, contreventement, erreurs de saisie claires', async () => {
    const { ctx } = context([vbx('A', 0, 0)]);
    const ch = parseChanges(
      {
        modifications: {
          surelevation: { hauteur_mm: 800, section_creee: { forme: 'RECT', h: 140, b: 140, materiau: 'C24' }, tete: 'encastree', croix: true },
          contreventements: [{ viewbox: 'A', cote: 'grand_cote_1' }],
        },
      },
      SEED,
    );
    expect(ch.mods!.customSections![0].key).toBe(ch.mods!.raise!.section);
    expect(ch.mods!.bracings).toEqual([{ module: 'A', side: 'v0' }]);
    const sim = (await runAdvisorTool('simuler_variante', { titre: 'surélévation bois', modifications: { surelevation: { hauteur_mm: 800, section_creee: { forme: 'RECT', h: 140, b: 140, materiau: 'C24' }, tete: 'encastree', croix: true } } }, ctx)) as any;
    const posts = sim.comparaison.familles.find((f: any) => f.famille.startsWith('Poteau de surélévation'));
    expect(posts).toBeTruthy();
    expect(posts.eta_apres).toBeGreaterThan(0);
    const detail = (await runAdvisorTool('lister_elements', { famille: 'surélévation' }, ctx)) as any;
    expect(detail.elements).toEqual([]); // l'étude actuelle n'a pas de surélévation
    await expect(runAdvisorTool('simuler_variante', { titre: 'x', modifications: { contreventements: [{ viewbox: 'A', cote: 'dessous' }] } }, ctx)).rejects.toThrow(/côté dessous inconnu/);
    await expect(runAdvisorTool('simuler_variante', { titre: 'x', modifications: { sections: [{ barres: 'column', section: 'HEB999' }] } }, ctx)).rejects.toThrow(/absente du catalogue/);
    await expect(runAdvisorTool('etudier_sol', { variante: 'V9' }, ctx)).rejects.toThrow(/V9 inconnue/);
  }, 300000);
});
