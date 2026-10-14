// Chantiers rejoués pour l'impact d'une règle : bancs d'étalonnage de base + listes validées (leur topologie, leurs
// réponses, leurs plaques d'étude, leurs corrections « seulement ce chantier » et leurs quantités finales).
import { vem } from '../../api/vem';
import { SEED_BENCHES } from '../../loading/benches';
import type { SiteAnswers, StudyInput } from '../../loading/core/answers';
import type { ImpactCase } from '../../loading/learning/impact';
import type { Topology } from '../../loading/topology/types';

export function benchCases(): ImpactCase[] {
  return SEED_BENCHES.map((b) => ({ id: `banc:${b.id}`, name: b.name, kind: 'banc', topology: b.topology, answers: b.answers, study: b.study, judgements: b.judgements, real: b.real, partial: b.partial }));
}

export async function impactCases(): Promise<ImpactCase[]> {
  const out = benchCases();
  try {
    const lists = await vem.validatedLoadingLists();
    for (const l of lists) {
      const t = l.topology as Topology | null;
      if (!t?.counts) continue;
      const { meta: _m, ...answers } = (l.answers?.chantier ?? {}) as SiteAnswers & { meta?: unknown };
      void _m;
      out.push({
        id: `liste:${l.id}`,
        name: `${l.project?.internalNumber ?? l.orderNo ?? 'Liste'}${l.project?.name ? ` ${l.project.name}` : ''}`,
        kind: 'liste',
        topology: t,
        answers,
        study: (l.answers?.study as StudyInput | null) ?? null,
        judgements: l.corrections ?? undefined,
        real: (l.lines ?? []).filter((x) => x.qty !== null).map((x) => ({ article: x.article, qty: x.qty! })),
        partial: false,
      });
    }
  } catch {
    /* hors ligne : les bancs seuls */
  }
  return out;
}
