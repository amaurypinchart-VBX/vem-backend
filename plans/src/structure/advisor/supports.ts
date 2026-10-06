// Appuis à ajouter sous les angles de Viewbox posés dans le vide : propositions de l'assemblage (poteau jusqu'au sol,
// poutre de reprise sur la toiture de la Viewbox du dessous), puis dimensionnées par calculs complets successifs
// (profil suivant de la même famille tant que l'appui ajouté dépasse η = 1). Rien ne vient de l'IA.
import type { CornerSupport } from '../core/assemble';
import type { StudyMods } from '../core/mods';
import { mergeMods } from '../core/mods';
import { designation } from '../core/library';
import { strongerSections } from '../core/sectionCatalog';
import { fmtNumber } from '../core/units';
import type { StudyInputs, StudyRun } from '../studyRun';
import { assembleStudy, runStudy } from '../studyRun';
import type { StudyRunner } from '../worker/study';
import { withMods } from './variant';

export const supportKey = (a: { module: string; corner: number }) => `${a.module}|${a.corner}`;

/** Pire taux de chaque appui ajouté (tronçons du poteau ou de la poutre de reprise) et section utilisée. */
export function addedSupportEtas(run: StudyRun): Map<string, { eta: number; section: string }> {
  const out = new Map<string, { eta: number; section: string }>();
  run.index.items.forEach((it, k) => {
    const m = it.kind === 'member' ? /^span:(?:post|transfer):(.+)\/(\d+)#/.exec(it.id) : null;
    if (!m) return;
    const key = `${m[1]}|${m[2]}`;
    const eta = run.summary.states[k]?.eta ?? 0;
    const section = run.structure.meta[it.members[0]]?.section ?? '';
    const prev = out.get(key);
    if (!prev || eta > prev.eta) out.set(key, { eta, section });
  });
  return out;
}

export interface SupportSizing {
  supports: CornerSupport[];
  run: StudyRun | null;
  /** chaque appui passe (η ≤ 1) */
  ok: boolean;
  steps: string[];
}

/**
 * Ajoute les appuis proposés pour chaque angle dans le vide (en gardant ceux déjà ajoutés) et les dimensionne : au
 * plus `maxRuns` calculs complets ; un appui qui dépasse prend le premier profil plus fort dont le module élastique
 * couvre le dépassement.
 */
export async function sizeAddedSupports(base: StudyInputs, mods: StudyMods, runner: StudyRunner, opts: { maxRuns?: number; signal?: AbortSignal; onStep?: (text: string) => void } = {}): Promise<SupportSizing> {
  const steps: string[] = [];
  const note = (t: string) => {
    steps.push(t);
    opts.onStep?.(t);
  };
  const first = assembleStudy(withMods(base, mods).inputs);
  let supports = mergeMods(mods, { supports: first.unsupported.map((u) => u.proposal) }).supports ?? [];
  if (first.unsupported.length) note(`${first.unsupported.length} appui(s) proposé(s) : ${first.unsupported.map((u) => `${u.module} angle ${u.corner + 1} (${u.proposal.kind === 'post' ? 'poteau' : 'poutre de reprise'})`).join(', ')}.`);
  let run: StudyRun | null = null;
  for (let i = 0; i < (opts.maxRuns ?? 4); i++) {
    const inputs = withMods(base, { ...mods, supports }).inputs;
    const s = assembleStudy(inputs);
    if (s.errors.length) {
      note(`Assemblage impossible : ${s.errors.join(' ; ')}`);
      return { supports, run, ok: false, steps };
    }
    note(`Calcul ${i + 1}…`);
    run = await runStudy(inputs, runner, undefined, opts.signal);
    const etas = addedSupportEtas(run);
    let changed = false;
    supports = supports.map((a) => {
      const r = etas.get(supportKey(a));
      if (!r || r.eta <= 1) return a;
      const cur = inputs.sections.get(r.section);
      const up = cur ? strongerSections(cur) : [];
      // dépassement non chiffrable (section de classe 4 trop élancée…) : comme un taux de 3
      const f = Number.isFinite(r.eta) ? Math.min(r.eta, 3) : 3;
      const next = up.find((c) => c.section.Wely >= cur!.section.Wely * f * 0.95) ?? up[up.length - 1];
      if (!next) return a;
      changed = true;
      note(`${a.module} angle ${a.corner + 1} : ${designation(cur!.name)} η ${Number.isFinite(r.eta) ? fmtNumber(r.eta, 2) : '∞'} → ${designation(next.name)}.`);
      return { ...a, section: next.key };
    });
    if (!changed) {
      const worst = Math.max(0, ...[...etas.values()].map((x) => x.eta));
      const ok = worst <= 1;
      if (etas.size) note(ok ? `Appuis ajoutés vérifiés (η max ${fmtNumber(worst, 2)}).` : `Appuis ajoutés encore au-delà de η = 1 (${fmtNumber(worst, 2)}) : pas de profil plus fort dans le catalogue.`);
      return { supports, run, ok, steps };
    }
  }
  note('Dimensionnement arrêté après plusieurs calculs : relancer le calcul pour voir le résultat.');
  return { supports, run: null, ok: false, steps };
}
