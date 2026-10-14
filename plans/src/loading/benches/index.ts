// Bancs d'étalonnage de base (chantiers réels, § 7.3) : topologie figée du modèle + réponses chantier + plaques de
// l'étude + liste réelle + jugements + écarts connus. Rejoués à chaque nouvelle règle (impact) et par les tests dorés
// (tests/loading/bench.test.ts). Les bancs ajoutés dans l'app (table loading_benches) viennent en plus (phase L6).
import type { SiteAnswers, StudyInput } from '../core/answers';
import type { RealLine } from '../engine/compare';
import type { Topology } from '../topology/types';
import klokBench from './klokgebouw.bench.json';
import klokTopo from './klokgebouw.topology.json';
import b6059 from './6059.bench.json';
import t6059 from './6059.topology.json';
import b6060 from './6060.bench.json';
import t6060 from './6060.topology.json';

export interface BenchData {
  id: string;
  name: string;
  order: string;
  bordereau: string;
  model: string;
  partial: boolean;
  source: string;
  productAnswers: Record<string, string>;
  answers: SiteAnswers;
  study: StudyInput;
  judgements: Record<string, number>;
  known: Record<string, string>;
  real: RealLine[];
}

export interface Bench extends BenchData {
  topology: Topology;
}

export const SEED_BENCHES: Bench[] = [
  { ...(klokBench as unknown as BenchData), topology: klokTopo as unknown as Topology },
  { ...(b6059 as unknown as BenchData), topology: t6059 as unknown as Topology },
  { ...(b6060 as unknown as BenchData), topology: t6060 as unknown as Topology },
];
