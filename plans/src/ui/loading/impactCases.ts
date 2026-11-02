// Chantiers rejoués pour l'impact d'une règle : bancs d'étalonnage de base + bancs ajoutés dans l'app (rapprochement
// d'une liste avec sa liste réelle, L6) + listes validées (leur topologie, leurs
// réponses, leurs plaques d'étude, leurs corrections « seulement ce chantier » et leurs quantités finales).
import { vem } from '../../api/vem';
import { SEED_BENCHES } from '../../loading/benches';
import type { SiteAnswers, StudyInput } from '../../loading/core/answers';
import type { ImpactCase } from '../../loading/learning/impact';
import type { Topology } from '../../loading/topology/types';
import type { Bench } from '../../loading/benches';
import { benchFromRow } from '../../loading/reconcile/benches';

const benchCase = (b: Bench): ImpactCase => ({
  id: `banc:${b.id}`,
  name: b.name,
  kind: 'banc',
  topology: b.topology,
  answers: b.answers,
  study: b.study?.plates?.length || b.study?.source ? b.study : null,
  judgements: b.judgements,
  real: b.real,
  partial: b.partial,
});

export function benchCases(): ImpactCase[] {
  return SEED_BENCHES.map(benchCase);
}

export async function impactCases(): Promise<ImpactCase[]> {
  const out = benchCases();
  try {
    for (const row of await vem.loadingBenches()) {
      const b = benchFromRow(row);
      if (b) out.push(benchCase(b));
    }
  } catch {
    /* hors ligne : les bancs de base */
  }
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
