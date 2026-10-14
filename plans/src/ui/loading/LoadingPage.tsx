// Onglet « Loading liste » d'un modèle analysé : étapes 1 Topologie (ce que l'app a compris : box, îlots, jonctions,
// pieds, façades — chaque valeur corrigeable à la main) · 2 Produits (comptage par pose, miroirs écartés, pièces
// « À identifier » → « Qu'est-ce que c'est ? » → mémoriser) · 3 Questions chantier · 4 Loading liste · 5 Export
// (phases suivantes). Liste à gauche, 3D à droite : un clic sur une ligne surligne d'où elle vient.
// Enregistrement automatique 2 s après la dernière modification (table loading_lists, une liste par version de modèle).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import { nodeIdOf } from '../../scene/loadedScene';
import type { ModelVersion, VemUser } from '../../api/vem';
import { PROJECT_ID, vem } from '../../api/vem';
import { SceneViewer } from '../../viewer/SceneViewer';
import type { GlassTest } from '../../linework/packets';
import type { CatalogueItem, CountingBase } from '../../loading/core/types';
import { COUNTING_BASE_LABEL } from '../../loading/core/types';
import { SEED_CATALOGUE } from '../../loading/library/catalogue';
import type { ServerCatalogueRow } from '../../loading/library/merge';
import { mergeCatalogue } from '../../loading/library/merge';
import { buildTopology, topologySummary } from '../../loading/topology/build';
import type { ProductAnswers } from '../../loading/topology/products';
import type { Topology, TopologyOverrides } from '../../loading/topology/types';
import { HIGHLIGHT, ISLAND_COLORS, JUNCTION_COLORS, nodeColors, topologyOverlay } from '../../loading/topology/overlay';
import type { ServerRuleRow } from '../../loading/library/merge';
import { mergeRules } from '../../loading/library/merge';
import { SEED_OBSERVATIONS, SEED_RULES } from '../../loading/library/seed';
import type { LoadingLine, LoadingList } from '../../loading/engine/generate';
import { generate } from '../../loading/engine/generate';
import type { ListMeta, SiteAnswers, StudyInput } from '../../loading/core/answers';
import { platesFromMaterials } from '../../loading/core/answers';
import type { Project } from '../../api/vem';
import type { BordereauMeta } from '../../loading/xlsx/bordereau';
import { bordereauFileName, bordereauXlsx } from '../../loading/xlsx/bordereau';
import { QuestionsStep } from './QuestionsStep';
import { RuleValidation, WhyDialog } from './RuleValidation';
import type { ValidationProps } from './RuleValidation';
import { impactCases } from './impactCases';
import { inferBase } from '../../loading/learning/inferBase';
import { proposeRule } from '../../loading/learning/proposal';
import type { ObservationRow } from '../../loading/learning/calibration';
import { pendingQuestions } from '../../loading/learning/calibration';
import type { ImpactCase } from '../../loading/learning/impact';
import { ExportStep } from './ExportStep';
import { CONFIDENCE_LABEL, LOADING_CATEGORIES } from '../../loading/core/types';

type Step = 'topology' | 'products' | 'questions' | 'list' | 'export';
type StepState = 'ok' | 'warn' | 'bad' | 'todo';
const STEP_ICON: Record<StepState, string> = { ok: '✔', warn: '⚠', bad: '✖', todo: '·' };
const STEP_COLOR: Record<StepState, string> = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', todo: 'var(--text-dim)' };
const EDITORS = ['admin', 'technical_manager'];
const UNKNOWN_COLOR = 0xf97316;

/** Bases montrées à l'étape Topologie, dans l'ordre. */
const TOPOLOGY_ROWS: CountingBase[] = [
  'box',
  'ilot',
  'ilot_couvert',
  'jonction_grand_cote',
  'jonction_petit_cote',
  'jonction_toit_grand_cote',
  'jonction_toit_petit_cote',
  'pied',
  'pied_box',
  'cote',
  'cote_vitre_court',
  'cote_vitre_long',
  'panneau',
  'panneau_plein',
  'jonction_panneau',
  'jonction_verre',
  'terminaison_vitre',
  'porte_simple',
  'porte_double',
  'porte_coulissante',
  'poteau',
  'airco',
  'bord',
];
const ROW_LABEL: Partial<Record<CountingBase, string>> = {
  box: 'Viewbox',
  ilot: 'Îlots (ensembles de box jointives)',
  ilot_couvert: 'Îlots couverts (toits jointifs)',
  jonction_grand_cote: 'Jonctions grand côté',
  jonction_petit_cote: 'Jonctions petit côté',
  jonction_toit_grand_cote: 'Jonctions de toit grand côté',
  jonction_toit_petit_cote: 'Jonctions de toit petit côté',
  pied: 'Pieds au sol',
  pied_box: 'Pieds de box (avant fusion)',
  cote: 'Côtés de box extérieurs',
  cote_vitre_court: 'Petits côtés vitrés',
  cote_vitre_long: 'Grands côtés vitrés',
  panneau: 'Panneaux de façade',
  panneau_plein: 'Murs pleins',
  jonction_panneau: 'Jonctions de panneaux sans vitre',
  jonction_verre: 'Jonctions avec une vitre',
  terminaison_vitre: 'Bouts de vitre contre un poteau',
  porte_simple: 'Portes simples',
  porte_double: 'Portes doubles',
  porte_coulissante: 'Portes coulissantes',
  poteau: 'Poteaux',
  airco: 'Airco dessinées',
  bord: 'Côtés vers une terrasse ou le vide',
};

interface Props {
  scene: LoadedScene;
  model?: ModelVersion;
  glassTest: GlassTest;
  active: boolean;
  framesVersion: number;
}

export function LoadingPage({ scene, model, glassTest, active, framesVersion }: Props) {
  const [step, setStep] = useState<Step>('topology');
  const [me, setMe] = useState<VemUser | null>(null);
  const [catRows, setCatRows] = useState<ServerCatalogueRow[]>([]);
  const [ruleRows, setRuleRows] = useState<ServerRuleRow[]>([]);
  const [site, setSite] = useState<SiteAnswers>({});
  const [meta, setMeta] = useState<ListMeta>({});
  const [corrections, setCorrections] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<'brouillon' | 'validee'>('brouillon');
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [revision, setRevision] = useState(1);
  const [project, setProject] = useState<Project | null>(null);
  const [study, setStudy] = useState<{ input: StudyInput | null; note: string }>({ input: null, note: 'Étude structure pas encore faite pour ce modèle' });
  const [busy, setBusy] = useState('');
  const [why, setWhy] = useState<{ article: string; before: number | null; after: number } | null>(null);
  const [validation, setValidation] = useState<Omit<ValidationProps, 'cases' | 'rules' | 'catalogue' | 'canEdit' | 'onCancel'> | null>(null);
  const [cases, setCases] = useState<ImpactCase[] | null>(null);
  const [unknownObs, setUnknownObs] = useState<ObservationRow[]>([]);
  const [memory, setMemory] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<TopologyOverrides>({});
  const [answers, setAnswers] = useState<ProductAnswers>({});
  const [listId, setListId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'local'>('idle');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<{ ids: string[]; label: string } | null>(null);
  const loaded = useRef(false);
  /** valeurs saisies + réponses telles que chargées (évite un enregistrement inutile à l'ouverture) */
  const savedKey = useRef('');
  const savedInput = useRef<string | null>(null);

  const refreshMemory = () =>
    vem
      .loadingMatches()
      .then((rows) => setMemory(Object.fromEntries(rows.map((r) => [r.signature, r.article]))))
      .catch(() => {});
  useEffect(() => {
    vem.me().then(setMe).catch(() => {});
    vem.loadingCatalogue().then(setCatRows).catch(() => {});
    vem.loadingRules().then(setRuleRows).catch(() => {});
    if (PROJECT_ID) vem.project(PROJECT_ID).then(setProject).catch(() => {});
    vem.loadingObservations('inconnu').then(setUnknownObs).catch(() => {});
    void refreshMemory();
    if (!PROJECT_ID || !model) {
      setSaveState('local');
      loaded.current = true;
      return;
    }
    (async () => {
      try {
        const lists = await vem.loadingLists(PROJECT_ID);
        let l = lists.find((x) => x.modelVersionId === model.id) ?? null;
        if (!l) {
          // nouvelle version du modèle : les réponses du projet sont reprises, pas les valeurs saisies à la main
          const prev = lists[0];
          l = await vem.createLoadingList(PROJECT_ID, { modelVersionId: model.id, answers: { products: prev?.answers?.products ?? {}, chantier: prev?.answers?.chantier ?? {} } });
        }
        const ov = (l.overrides ?? {}) as TopologyOverrides;
        const pr = (l.answers?.products ?? {}) as ProductAnswers;
        // une liste sans topologie enregistrée (nouvelle) est enregistrée une première fois
        savedKey.current = l.topology ? JSON.stringify({ overrides: ov, products: pr, chantier: l.answers?.chantier ?? {}, corrections: l.corrections ?? {}, orderNo: l.orderNo ?? null }) : '';
        savedInput.current = l.inputKey;
        setListId(l.id);
        setOverrides(ov);
        setAnswers(pr);
        const { meta: m, ...chantier } = (l.answers?.chantier ?? {}) as SiteAnswers & { meta?: ListMeta };
        setSite(chantier);
        setMeta({ ...(m ?? {}), ...(l.orderNo ? { orderNo: l.orderNo } : {}) });
        setCorrections(l.corrections ?? {});
        setStatus(l.status ?? 'brouillon');
        setValidatedAt(l.validatedAt ?? null);
        setRevision(l.revision ?? 1);
        setSaveState('saved');
      } catch (e) {
        setError(`Loading liste non chargée (${(e as Error).message}) : les réponses ne seront pas enregistrées.`);
        setSaveState('local');
      }
      loaded.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  const canEdit = EDITORS.includes(me?.role ?? '');
  const catalogue = useMemo(() => mergeCatalogue(SEED_CATALOGUE, catRows), [catRows]);
  const catMap = useMemo(() => new Map(catalogue.map((c) => [c.ref, c])), [catalogue]);
  const topology = useMemo(
    () => buildTopology({ index: scene.index, frames: scene.frames, catalogue: catMap, answers, memory, overrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, framesVersion, catMap, answers, memory, overrides],
  );
  const summary = useMemo(() => topologySummary(topology, catMap), [topology, catMap]);
  const rules = useMemo(() => mergeRules(SEED_RULES, ruleRows), [ruleRows]);
  // sous-bois : calage de l'Étude structure de ce modèle (étape 5, enregistré avec l'étude) × 2
  const refreshStudy = async () => {
    if (!PROJECT_ID || !model) return;
    try {
      const studies = await vem.listStudies(PROJECT_ID);
      const st = studies.find((x) => x.modelVersionId === model.id);
      const cal = (st?.resultsSummary as { calage?: { at: string; fromCalculation: boolean; materials: { label: string; dims: string; quantity: number }[] } } | undefined)?.calage;
      if (!st) setStudy({ input: null, note: 'Étude structure pas encore faite pour ce modèle (onglet Étude structure)' });
      else if (!cal) setStudy({ input: null, note: 'Étude structure sans calage : ouvrir son étape 5 « Sol & calage »' });
      else {
        const plates = platesFromMaterials(cal.materials);
        const when = new Date(cal.at).toLocaleString('fr-BE');
        const source = `Étude structure, calage du ${when}${cal.fromCalculation ? ' (réactions du calcul)' : ' (estimation instantanée)'}`;
        setStudy({ input: { plates, source }, note: `${source} : ${plates.map((p) => `${p.quantity} × ${p.l / 10} × ${p.w / 10} cm`).join(', ') || 'aucune plaque'}` });
      }
    } catch {
      /* hors ligne : les sous-bois restent une question */
    }
  };
  useEffect(() => {
    if (active) void refreshStudy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, model?.id]);
  const engineInput = { topology, rules, catalogue: catMap, answers: site, study: study.input, observations: SEED_OBSERVATIONS };
  // liste calculée (sans les corrections) : le « prédit » des observations à la validation
  const predicted = useMemo(() => generate(engineInput), [topology, rules, catMap, site, study.input]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => (Object.keys(corrections).length ? generate({ ...engineInput, judgements: corrections }) : predicted), [predicted, corrections]); // eslint-disable-line react-hooks/exhaustive-deps
  // en-tête du bordereau : valeurs saisies, sinon reprises du projet VEM
  const firstTruck = (project as (Project & { trucks?: { loadingDate?: string | null; departureDate?: string | null }[] }) | null)?.trucks
    ?.map((x) => x.loadingDate ?? x.departureDate)
    .filter((d): d is string => !!d)
    .sort()[0];
  const effMeta: ListMeta = {
    orderNo: meta.orderNo ?? project?.internalNumber ?? '',
    client: meta.client ?? project?.client?.name ?? '',
    shippingDate: meta.shippingDate ?? (firstTruck ? firstTruck.slice(0, 10) : undefined),
  };
  const fmtDate = (d?: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-BE') : '');
  const bordereauMeta: BordereauMeta = {
    chantier: project?.name ?? scene.index.source.fileName,
    orderNo: effMeta.orderNo ?? '',
    client: effMeta.client ?? '',
    shippingDate: fmtDate(effMeta.shippingDate),
    modelFile: scene.index.source.fileName,
    modelDate: model?.createdAt ? new Date(model.createdAt).toLocaleDateString('fr-BE') : undefined,
    topology: topologySummary(topology, catMap),
    revision,
    state: status === 'validee' ? `Validée le ${validatedAt ? new Date(validatedAt).toLocaleDateString('fr-BE') : ''}` : 'Brouillon',
  };
  // « je ne sais pas encore » : questions en attente depuis d'autres chantiers, tant que la règle n'a pas bougé
  const pending = useMemo(() => {
    const updated = new Map<string, string>();
    for (const r of ruleRows) if (!updated.has(r.data.article) || updated.get(r.data.article)! < r.updatedAt) updated.set(r.data.article, r.updatedAt);
    return pendingQuestions(unknownObs, updated);
  }, [unknownObs, ruleRows]);
  // correction d'une quantité → « Pourquoi ? »
  const correct = (article: string, v: number | null) => {
    setCorrections((c) => {
      const next = { ...c };
      if (v === null) delete next[article];
      else next[article] = v;
      return next;
    });
    if (v !== null) setWhy({ article, before: predicted.lines.find((l) => l.article === article)?.qty ?? null, after: v });
  };
  const chooseWhy = async (choice: 'chantier' | 'regle' | 'inconnu') => {
    const w = why!;
    setWhy(null);
    const line = list.lines.find((l) => l.article === w.article);
    const ruleKeys = line?.contributions.map((c) => c.ruleKey).filter((k): k is string => !!k) ?? [];
    if (choice === 'chantier') return;
    const chantier = project?.internalNumber ?? scene.index.source.fileName;
    if (choice === 'inconnu') {
      // la règle d'abord (la question doit rester plus récente que la modification) :
      // elle repasse « à confirmer » (si on a le droit de la modifier)
      if (canEdit)
        for (const r of rules.filter((x) => x.active && x.article === w.article && x.confidence === 'confirme' && ruleKeys.includes(x.key)))
          await vem.saveLoadingRule({ ...r, confidence: 'a_confirmer', source: 'correction' }, `Je ne sais pas encore : ${chantier} ${w.before ?? '—'} → ${w.after}`, PROJECT_ID, listId).catch(() => {});
      if (listId)
        await vem
          .addLoadingObservation(listId, { article: w.article, ruleKeys, predicted: w.before, final: w.after, kind: 'inconnu', note: `${chantier} : ${w.before ?? '—'} → ${w.after}` })
          .then((o) => setUnknownObs((x) => [o, ...x]))
          .catch((e) => setError(`Observation non enregistrée : ${(e as Error).message}`));
      if (canEdit) vem.loadingRules().then(setRuleRows).catch(() => {});
      return;
    }
    // « c'est la règle » : bases qui expliquent le chiffre, règle proposée, écran de validation
    const unit = line?.unit ?? catMap.get(w.article)?.unit ?? 'pce';
    const candidates = w.after > 0 ? inferBase(w.article, w.after, topology, { rules, metres: unit !== 'pce' }) : [];
    const existing = rules.find((r) => r.active && r.article === w.article && ruleKeys.includes(r.key));
    if (!candidates.length && !existing) {
      setError(`Aucune base ne donne ${w.after} pour ${w.article} sur ce chantier : saisis la règle à la main dans Réglages › Règles de loading.`);
      return;
    }
    const scope = topology.islands.every((i) => i.regime === 'standalone') ? 'standalone' : topology.islands.every((i) => i.regime === 'connecte') ? 'connecte' : 'toujours';
    const draft = candidates.length
      ? proposeRule({ article: w.article, articleName: catMap.get(w.article)?.designation, candidate: candidates[0], scope, confidence: 'confirme', unit, chantier }, rules)
      : existing!;
    setValidation({
      title: candidates.length ? 'Nouvelle règle, pour tous les projets' : 'Modifier la règle',
      draft,
      candidates,
      target: w.after,
      observations: SEED_OBSERVATIONS,
      reason: `${chantier} : ${w.before ?? '—'} → ${w.after}`,
      onSave: async (toSave, reason) => {
        try {
          for (const r of toSave) await vem.saveLoadingRule(r, reason, PROJECT_ID, listId);
          setRuleRows(await vem.loadingRules());
          setCorrections((c) => {
            const next = { ...c };
            delete next[w.article];
            return next;
          });
          setValidation(null);
          setSaveNote(`✓ Règle validée : elle vaut maintenant pour tous les projets`);
        } catch (e) {
          setError(`Règle non enregistrée : ${(e as Error).message}`);
        }
      },
    });
    if (!cases) impactCases().then(setCases).catch(() => setCases([]));
  };
  const fileName = bordereauFileName(effMeta.orderNo || project?.internalNumber || 'chantier', revision);

  const lastSaved = useRef('');
  useEffect(() => {
    if (!loaded.current || !listId) return;
    const body = {
      overrides,
      answers: { products: answers, chantier: { ...site, meta } as Record<string, unknown>, study: study.input },
      corrections,
      orderNo: meta.orderNo ?? null,
      topology,
      lines: list.lines,
      rulesVersion: list.rulesVersion,
      inputKey: list.inputKey,
    };
    const key = JSON.stringify(body);
    // première ouverture : rien n'a changé depuis l'enregistrement → pas d'envoi
    if (!lastSaved.current) {
      lastSaved.current = key;
      if (savedKey.current === JSON.stringify({ overrides, products: answers, chantier: { ...site, meta }, corrections, orderNo: meta.orderNo ?? null }) && savedInput.current === list.inputKey) return;
    }
    if (key === lastSaved.current && saveState === 'saved') return;
    lastSaved.current = key;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await vem.saveLoadingList(listId, body);
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        setError(`Loading liste non enregistrée : ${(e as Error).message}`);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [overrides, answers, topology, listId, list, site, meta, corrections]);

  // ─── 3D ───
  const holder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const moduleNode = useMemo(() => new Map(scene.index.modules.map((m) => [m.id, m.nodeId])), [scene]);
  const pickRef = useRef<(nodeId: string | null) => void>(() => {});
  const barPickRef = useRef<(i: number | null) => void>(() => {});
  useEffect(() => {
    if (!holder.current) return;
    const v = new SceneViewer(holder.current, scene, glassTest);
    viewerRef.current = v;
    v.onPick((p) => pickRef.current(p?.nodeId ?? null));
    v.onBarPick((i) => barPickRef.current(i));
    return () => {
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  const highlight = useMemo(() => new Set(selected?.ids ?? []), [selected]);
  const overlay = useMemo(() => topologyOverlay(topology, highlight, { junctions: step === 'topology', feet: step === 'topology' }), [topology, highlight, step]);
  const highlightNodes = useMemo(() => {
    const out: string[] = [];
    for (const id of highlight) {
      if (moduleNode.has(id)) out.push(moduleNode.get(id)!);
      else if (id.includes('|')) out.push(...id.split('|'));
      else if (id.includes(':début') || id.includes(':fin')) out.push(id.split(':')[0]);
      else if (scene.look.byId.has(id)) out.push(id);
    }
    return out;
  }, [highlight, moduleNode, scene]);
  const unknownColors = useMemo(() => new Map(topology.unknown.flatMap((u) => u.nodeIds.map((n) => [n, UNKNOWN_COLOR] as const))), [topology]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.setColorOverlay(nodeColors(topology, moduleNode, highlightNodes, step === 'topology', step === 'products' ? unknownColors : undefined));
    v.setBarOverlay(overlay.positions, overlay.colors, 4);
  }, [overlay, topology, moduleNode, highlightNodes, step, unknownColors]);
  useEffect(() => {
    if (!active) return;
    viewerRef.current?.reclaim();
    viewerRef.current?.setColorOverlay(nodeColors(topology, moduleNode, highlightNodes, step === 'topology', step === 'products' ? unknownColors : undefined));
    viewerRef.current?.setBarOverlay(overlay.positions, overlay.colors, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  barPickRef.current = (i) => {
    if (i === null) return;
    const id = overlay.ids[i];
    const j = topology.junctions.find((x) => x.id === id);
    const f = topology.feet.find((x) => x.id === id);
    if (j) setSelected({ ids: [j.id, ...j.modules], label: `${j.id} : jonction ${j.kind === 'grand_cote' ? 'grand côté' : j.kind === 'petit_cote' ? 'petit côté' : 'grand / petit côté'} entre ${j.modules.join(' et ')}${j.offset ? ' (décalée)' : ''}${j.roof ? ', toits jointifs' : ''}` });
    else if (f) setSelected({ ids: [f.id], label: `${f.id} : pied ${f.kind === 'angle' ? 'd’angle' : f.kind === 'milieu' ? 'de milieu' : 'commun'} de ${[...new Set(f.members.map((m) => m.moduleId))].join(', ')}` });
  };
  const [focusUnknown, setFocusUnknown] = useState<string | null>(null);
  pickRef.current = (nodeId) => {
    if (!nodeId) {
      setSelected(null);
      return;
    }
    // pièce cliquée : sa ligne de produit (ou son groupe « À identifier »)
    let item: string | undefined;
    for (let n = scene.look.byId.get(nodeId); n; n = n.parentId ? scene.look.byId.get(n.parentId) : undefined) if (n.role === 'item') item = n.id;
    const u = item ? topology.unknown.find((x) => x.nodeIds.includes(item!)) : undefined;
    const line = item ? topology.products.find((l) => l.nodeIds.includes(item!) || l.mirrorIds.includes(item!)) : undefined;
    if (u) {
      setStep('products');
      setFocusUnknown(u.signature);
      setSelected({ ids: u.nodeIds, label: `À identifier : ${u.label}` });
    } else if (line) setSelected({ ids: line.nodeIds, label: `${line.article} ${catMap.get(line.article)?.designation ?? ''} × ${line.qty}` });
    else {
      const m = scene.index.modules.find((x) => x.nodeId === nodeIdOf(scene.objectsById.get(nodeId) ?? null) || x.nodeId === nodeId);
      setSelected(m ? { ids: [m.id], label: m.id } : null);
    }
  };

  const unknownCount = topology.unknown.reduce((s, u) => s + u.nodeIds.length, 0);
  const stepState: Record<Step, StepState> = {
    topology: topology.counts.pied?.value === null || topology.warnings.some((w) => w.code.startsWith('JUNCTION')) ? 'warn' : 'ok',
    products: unknownCount ? 'warn' : 'ok',
    questions: list.questions.some((q) => q.id.startsWith('q:') && !q.id.startsWith('q:base') && !q.id.startsWith('q:qty') && !q.id.startsWith('q:spare')) ? 'warn' : 'ok',
    list: list.lines.some((l) => l.status === 'regle_manquante' || l.status === 'a_confirmer') ? 'warn' : 'ok',
    export: status === 'validee' ? 'ok' : 'todo',
  };
  const STEPS: { key: Step; label: string; soon?: string }[] = [
    { key: 'topology', label: '1. Topologie' },
    { key: 'products', label: '2. Produits' },
    { key: 'questions', label: '3. Questions chantier' },
    { key: 'list', label: '4. Loading liste' },
    { key: 'export', label: '5. Export' },
  ];
  const [saveNote, setSaveNote] = useState('');
  const saveLabel = { idle: '', saving: 'Enregistrement…', saved: '✓ Enregistrée', error: '✗ Non enregistrée', local: 'Non enregistrée (modèle sans version en ligne)' }[saveState];

  const answer = (signature: string, value: string | null) =>
    setAnswers((a) => {
      const next = { ...a };
      if (value) next[signature] = value;
      else delete next[signature];
      return next;
    });
  const remember = async (signature: string, article: string) => {
    const u = topology.unknown.find((x) => x.signature === signature);
    const n = u ? scene.look.byId.get(u.nodeIds[0]) : undefined;
    try {
      await vem.saveLoadingMatch({ signature, article, keyDefinition: n?.definition ?? null, triangles: n?.triangles });
      await refreshMemory();
      answer(signature, article);
    } catch (e) {
      setError(`Non mémorisé : ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <h2>Loading liste</h2>
          <nav className="tabs" style={{ flexWrap: 'wrap' }}>
            {STEPS.map((s) => (
              <button
                key={s.key}
                className={`tab ${step === s.key ? 'active' : ''}`}
                disabled={!!s.soon}
                onClick={() => {
                  setStep(s.key);
                  setSelected(null);
                }}
                title={s.soon ? `Arrive en phase ${s.soon}` : undefined}
              >
                <span style={{ color: STEP_COLOR[stepState[s.key]], marginRight: 4 }}>{STEP_ICON[stepState[s.key]]}</span>
                {s.label}
              </button>
            ))}
          </nav>
          <div className="spacer" style={{ flex: 1 }} />
          {saveNote && <span className="hint">{saveNote}</span>}
          <span className="hint">{saveLabel}</span>
        </div>
        {error && (
          <div className="card-body">
            <div className="error-box">
              {error}{' '}
              <button className="btn small" onClick={() => setError('')}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
      {why && <WhyDialog article={why.article} before={why.before} after={why.after} canEdit={canEdit} onChoose={(c) => void chooseWhy(c)} onCancel={() => setWhy(null)} />}
      {validation && <RuleValidation {...validation} rules={rules} catalogue={catMap} cases={cases} canEdit={canEdit} onCancel={() => setValidation(null)} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px, 46%) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          {step === 'topology' && (
            <TopologyStep
              topology={topology}
              summary={summary}
              overrides={overrides}
              onOverride={(k, v) =>
                setOverrides((o) => {
                  const next = { ...o };
                  if (v === null) delete next[k];
                  else next[k] = v;
                  return next;
                })
              }
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {step === 'questions' && (
            <QuestionsStep answers={site} onChange={setSite} meta={effMeta} onMeta={setMeta} study={study.input} studyNote={study.note} boxes={topology.counts.box?.value ?? 0} />
          )}
          {step === 'list' && (
            <ListStep
              list={list}
              catalogue={catalogue}
              readOnly={status === 'validee'}
              corrections={corrections}
              onCorrect={correct}
              pending={pending}
              onAppreciation={(article, v) =>
                setSite((a) => {
                  const app = { ...(a.appreciation ?? {}) };
                  if (v === null) delete app[article];
                  else app[article] = v;
                  return { ...a, appreciation: app };
                })
              }
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {step === 'export' && (
            <ExportStep
              list={list}
              meta={bordereauMeta}
              fileName={fileName}
              build={() => bordereauXlsx(list, bordereauMeta)}
              validated={status === 'validee' ? bordereauMeta.state : null}
              canSave={!!listId}
              busy={busy}
              onSave={async () => {
                if (!listId) return;
                setBusy('Enregistrement dans les fichiers du projet…');
                try {
                  const r = await vem.exportLoadingList(listId, bordereauXlsx(list, bordereauMeta), fileName);
                  setRevision(r.list.revision);
                  setBusy('');
                  setError('');
                  setSaveNote(`✓ ${fileName} enregistré dans les fichiers du projet`);
                } catch (e) {
                  setBusy('');
                  setError(`Bordereau non enregistré : ${(e as Error).message}`);
                }
              }}
              onValidate={async () => {
                if (!listId || !window.confirm('Valider la liste et la marquer envoyée à l’entrepôt ? Elle sera figée.')) return;
                setBusy('Validation…');
                const before = new Map(predicted.lines.map((l) => [l.article, l]));
                const observations = list.lines.map((l) => {
                  const p = before.get(l.article);
                  const corrected = corrections[l.article] !== undefined;
                  return {
                    article: l.article,
                    ruleKeys: l.contributions.map((c) => c.ruleKey).filter((k): k is string => !!k),
                    predicted: p?.qty ?? null,
                    final: l.qty,
                    kind: corrected ? 'jugement' : l.qty === null ? 'inconnu' : 'calage',
                  };
                });
                try {
                  const r = await vem.validateLoadingList(listId, { lines: list.lines, rulesVersion: list.rulesVersion, inputKey: list.inputKey, observations });
                  setStatus('validee');
                  setValidatedAt(r.validatedAt ?? new Date().toISOString());
                  setBusy('');
                } catch (e) {
                  setBusy('');
                  setError(`Validation impossible : ${(e as Error).message}`);
                }
              }}
              onReopen={async () => {
                if (!listId) return;
                try {
                  await vem.saveLoadingList(listId, { status: 'brouillon' });
                  setStatus('brouillon');
                  setValidatedAt(null);
                } catch (e) {
                  setError(`Liste non rouverte : ${(e as Error).message}`);
                }
              }}
            />
          )}
          {step === 'products' && (
            <ProductsStep
              topology={topology}
              catalogue={catalogue}
              catMap={catMap}
              answers={answers}
              memory={memory}
              canEdit={canEdit}
              focus={focusUnknown}
              selected={selected}
              onSelect={setSelected}
              onAnswer={answer}
              onRemember={remember}
            />
          )}
        </div>
        <div className="viewer-main" style={{ position: 'sticky', top: 8, height: 'calc(100vh - 170px)', minHeight: 480 }}>
          <div className="viewer-toolbar">
            <span className="hint" style={{ flex: 1 }}>
              {selected ? (
                <>
                  <span style={{ color: '#db2777' }}>■</span> {selected.label}{' '}
                  <button className="btn small ghost" onClick={() => setSelected(null)}>
                    ✕
                  </button>
                </>
              ) : step === 'topology' ? (
                'Clic sur une ligne, une jonction ou un pied : la 3D montre d’où vient le nombre.'
              ) : (
                'Clic sur une pièce : sa ligne de produit. En orange : pièces à identifier.'
              )}
            </span>
          </div>
          <div className="viewer-canvas" ref={holder} />
        </div>
      </div>
    </div>
  );
}

// ─── Étape 1 : topologie ────────────────────────────────────────────────────────────────────────────────────────

function TopologyStep({
  topology: t,
  summary,
  overrides,
  onOverride,
  selected,
  onSelect,
}: {
  topology: Topology;
  summary: string;
  overrides: TopologyOverrides;
  onOverride: (k: CountingBase, v: number | null) => void;
  selected: { ids: string[]; label: string } | null;
  onSelect: (s: { ids: string[]; label: string } | null) => void;
}) {
  const [edit, setEdit] = useState<{ key: CountingBase; text: string } | null>(null);
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Ce que l’app a compris</h2>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 14, lineHeight: 1.5 }} data-testid="topology-summary">
            {summary}
          </div>
          <TopologyPlan topology={t} selected={selected} onSelect={onSelect} />
          <div className="hint">
            Îlots :{' '}
            {t.islands.map((i, k) => (
              <button key={i.id} className="btn small ghost" onClick={() => onSelect({ ids: i.moduleIds, label: `${i.id} : ${i.moduleIds.join(', ')}` })}>
                <span style={{ color: `#${ISLAND_COLORS[k % ISLAND_COLORS.length].toString(16).padStart(6, '0')}` }}>■</span> {i.id} · {i.moduleIds.length} box ·{' '}
                {i.regime === 'standalone' ? 'seule' : 'connectées'}
                {i.covered ? ' · couvert' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>
      {t.warnings.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>À vérifier ({t.warnings.length})</h2>
          </div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
              {t.warnings.map((w, i) => (
                <li key={i}>
                  {w.ids?.length ? (
                    <button className="btn ghost small" style={{ textAlign: 'left' }} onClick={() => onSelect({ ids: w.ids!, label: w.text })}>
                      {w.text}
                    </button>
                  ) : (
                    w.text
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <h2>Bases de comptage</h2>
          <span className="hint">Corriger une valeur quand la 3D n’est pas conforme : elle est marquée « saisi à la main ».</span>
        </div>
        <div className="card-body">
          <table className="list">
            <tbody>
              {TOPOLOGY_ROWS.map((k) => {
                const c = t.counts[k];
                if (!c) return null;
                const isSel = selected?.label.startsWith(ROW_LABEL[k] ?? k);
                return (
                  <tr key={k} style={{ cursor: c.ids.length ? 'pointer' : 'default', background: isSel ? 'var(--bg-3)' : undefined }}>
                    <td onClick={() => c.ids.length && onSelect({ ids: c.ids, label: `${ROW_LABEL[k] ?? COUNTING_BASE_LABEL[k]} : ${c.detail}` })}>{ROW_LABEL[k] ?? COUNTING_BASE_LABEL[k]}</td>
                    <td style={{ width: 120, textAlign: 'right' }}>
                      {edit?.key === k ? (
                        <input
                          type="number"
                          min={0}
                          autoFocus
                          value={edit.text}
                          style={{ width: 70 }}
                          onChange={(e) => setEdit({ key: k, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = Number(edit.text);
                              if (edit.text !== '' && Number.isFinite(v) && v >= 0) onOverride(k, v);
                              setEdit(null);
                            }
                            if (e.key === 'Escape') setEdit(null);
                          }}
                          onBlur={() => setEdit(null)}
                        />
                      ) : (
                        <b
                          title="Cliquer pour corriger"
                          style={{ cursor: 'text' }}
                          onClick={() => setEdit({ key: k, text: c.value === null ? '' : String(c.value) })}
                        >
                          {c.value === null ? '?' : c.value}
                        </b>
                      )}
                    </td>
                    <td className="hint" onClick={() => c.ids.length && onSelect({ ids: c.ids, label: `${ROW_LABEL[k] ?? COUNTING_BASE_LABEL[k]} : ${c.detail}` })}>
                      {c.manual ? (
                        <>
                          <span className="badge orange">saisi à la main</span> détecté : {c.detected ?? '?'}{' '}
                          <button className="btn small ghost" title="Revenir à la valeur détectée" onClick={() => onOverride(k, null)}>
                            ↺
                          </button>
                        </>
                      ) : (
                        c.detail
                      )}
                    </td>
                  </tr>
                );
              })}
              {Object.keys(overrides).length > 0 && (
                <tr>
                  <td colSpan={3} className="hint">
                    {Object.keys(overrides).length} valeur(s) saisie(s) à la main.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Schéma de dessus : box (couleur de l'îlot), jonctions (bleu grand côté, vert petit côté, orange décalée), pieds. */
function TopologyPlan({ topology: t, selected, onSelect }: { topology: Topology; selected: { ids: string[] } | null; onSelect: (s: { ids: string[]; label: string }) => void }) {
  const pts = t.modules.flatMap((m) => m.outline);
  if (!pts.length) return <div className="hint">Aucune Viewbox dans ce modèle.</div>;
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minZ = Math.min(...pts.map((p) => p[1]));
  const maxZ = Math.max(...pts.map((p) => p[1]));
  const pad = 600;
  const w = maxX - minX + 2 * pad;
  const h = maxZ - minZ + 2 * pad;
  const sel = new Set(selected?.ids ?? []);
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const islandIndex = new Map(t.islands.map((i, k) => [i.id, k]));
  const tx = (p: [number, number]) => `${p[0] - minX + pad},${p[1] - minZ + pad}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxHeight: 360, background: '#fff', border: '1px solid var(--border)', borderRadius: 6 }} data-testid="topology-plan">
      {[...t.modules]
        .sort((a, b) => a.level - b.level)
        .map((m) => {
          const k = islandIndex.get(m.islandId) ?? 0;
          const c = m.outline.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]) as [number, number];
          return (
            <g key={m.id} style={{ cursor: 'pointer' }} onClick={() => onSelect({ ids: [m.id], label: `${m.id} — ${m.long} × ${m.short} mm, niveau ${m.level}` })}>
              <polygon
                points={m.outline.map(tx).join(' ')}
                fill={hex(ISLAND_COLORS[k % ISLAND_COLORS.length])}
                fillOpacity={m.level > 0 ? 0.45 : 0.8}
                stroke={sel.has(m.id) ? hex(HIGHLIGHT) : '#334155'}
                strokeWidth={sel.has(m.id) ? 60 : 20}
                strokeDasharray={m.level > 0 ? '120 80' : undefined}
              />
              <text x={c[0] - minX + pad} y={c[1] - minZ + pad + m.level * 480} fontSize={360} textAnchor="middle" dominantBaseline="middle" fill="#0f172a" fontFamily="Arimo, Arial, sans-serif">
                {m.id}
                {m.level > 0 ? ` (niv. ${m.level})` : ''}
              </text>
            </g>
          );
        })}
      {t.junctions.map((j) => (
        <line
          key={j.id}
          x1={j.segment[0][0] - minX + pad}
          y1={j.segment[0][1] - minZ + pad}
          x2={j.segment[1][0] - minX + pad}
          y2={j.segment[1][1] - minZ + pad}
          stroke={sel.has(j.id) ? hex(HIGHLIGHT) : j.offset ? '#ea580c' : hex(JUNCTION_COLORS[j.kind])}
          strokeWidth={140}
          style={{ cursor: 'pointer' }}
          onClick={() => onSelect({ ids: [j.id, ...j.modules], label: `${j.id} : jonction ${j.kind === 'grand_cote' ? 'grand côté' : j.kind === 'petit_cote' ? 'petit côté' : 'grand / petit côté'} entre ${j.modules.join(' et ')}` })}
        />
      ))}
      {t.feet.map((f) => (
        <circle
          key={f.id}
          cx={f.plan[0] - minX + pad}
          cy={f.plan[1] - minZ + pad}
          r={sel.has(f.id) ? 170 : 110}
          fill={sel.has(f.id) ? hex(HIGHLIGHT) : '#92400e'}
          style={{ cursor: 'pointer' }}
          onClick={() => onSelect({ ids: [f.id], label: `${f.id} : pied de ${[...new Set(f.members.map((m) => m.moduleId))].join(', ')}` })}
        />
      ))}
    </svg>
  );
}

// ─── Étape 2 : produits ─────────────────────────────────────────────────────────────────────────────────────────

const SOURCE_LABEL = { modele: 'réf. du modèle', reponse: 'identifiée ici', memoire: 'mémoire' } as const;

function ProductsStep({
  topology: t,
  catalogue,
  catMap,
  answers,
  memory,
  canEdit,
  focus,
  selected,
  onSelect,
  onAnswer,
  onRemember,
}: {
  topology: Topology;
  catalogue: CatalogueItem[];
  catMap: Map<string, CatalogueItem>;
  answers: ProductAnswers;
  memory: Record<string, string>;
  canEdit: boolean;
  focus: string | null;
  selected: { ids: string[]; label: string } | null;
  onSelect: (s: { ids: string[]; label: string } | null) => void;
  onAnswer: (signature: string, value: string | null) => void;
  onRemember: (signature: string, article: string) => Promise<void>;
}) {
  const total = t.products.reduce((s, l) => s + l.qty, 0);
  // pièces identifiées ici ou par la mémoire : on peut revenir sur la réponse
  const answered = Object.entries(answers).filter(([sig]) => !t.unknown.some((u) => u.signature === sig));
  const sel = new Set(selected?.ids ?? []);
  return (
    <>
      {t.unknown.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>À identifier ({t.unknown.length})</h2>
            <span className="hint">Pièces sans référence, en orange dans la 3D. Une réponse vaut pour toutes les pièces identiques.</span>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {t.unknown.map((u) => (
              <IdentifyCard
                key={u.signature}
                label={u.label}
                count={u.nodeIds.length}
                dims={u.dims}
                category={u.category}
                catalogue={catalogue}
                canEdit={canEdit}
                open={focus === u.signature}
                onShow={() => onSelect({ ids: u.nodeIds, label: `À identifier : ${u.label}` })}
                onAnswer={(a) => onAnswer(u.signature, a)}
                onRemember={(a) => onRemember(u.signature, a)}
              />
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <h2>Produits comptés dans la 3D</h2>
          <span className="hint">
            {t.products.length} références · {total} pièces · une pièce par pose, doublons miroir écartés
          </span>
        </div>
        <div className="card-body">
          <table className="list">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th style={{ textAlign: 'right' }}>Quantité</th>
                <th>Origine</th>
              </tr>
            </thead>
            <tbody>
              {t.products.map((l) => {
                const c = catMap.get(l.article);
                const isSel = l.nodeIds.length > 0 && l.nodeIds.every((id) => sel.has(id));
                return (
                  <tr
                    key={l.article}
                    style={{ cursor: 'pointer', background: isSel ? 'var(--bg-3)' : undefined }}
                    onClick={() => onSelect({ ids: l.nodeIds, label: `${l.article} ${c?.designation ?? ''} × ${l.qty}` })}
                  >
                    <td>
                      <b>{l.article}</b>
                    </td>
                    <td>
                      {c?.designation ?? <span className="badge ko">absente du catalogue</span>}
                      {l.mirrorIds.length > 0 && <span className="hint"> · {l.mirrorIds.length} doublon(s) miroir écarté(s)</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <b>{l.qty}</b>
                    </td>
                    <td className="hint">{SOURCE_LABEL[l.source]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {answered.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Réponses données pour ce chantier</h2>
          </div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {answered.map(([sig, a]) => (
                <li key={sig}>
                  {sig.split('|')[0].replace(/^[a-z]+:/, '')} → {a === 'ignore' ? 'pas un produit' : `${a} ${catMap.get(a)?.designation ?? ''}`}
                  {memory[sig] ? <span className="hint"> (aussi en mémoire)</span> : null}{' '}
                  <button className="btn small ghost" onClick={() => onAnswer(sig, null)}>
                    Annuler
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function IdentifyCard({
  label,
  count,
  dims,
  category,
  catalogue,
  canEdit,
  open: initiallyOpen,
  onShow,
  onAnswer,
  onRemember,
}: {
  label: string;
  count: number;
  dims: [number, number, number];
  category: string | null;
  catalogue: CatalogueItem[];
  canEdit: boolean;
  open: boolean;
  onShow: () => void;
  onAnswer: (article: string) => void;
  onRemember: (article: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => setOpen((o) => o || initiallyOpen), [initiallyOpen]);
  const [q, setQ] = useState('');
  const ref = /^\d-\d{3}-\d{3,5}/.exec(q)?.[0] ?? '';
  const found = ref ? catalogue.find((c) => c.ref === ref) : undefined;
  const matches = q.length >= 2 && !found ? catalogue.filter((c) => `${c.ref} ${c.designation}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, display: 'grid', gap: 6 }}>
      <div className="row" style={{ gap: 8 }}>
        <span style={{ color: '#f97316' }}>■</span>
        <b>{label}</b>
        <span className="hint">
          {count} pièce(s) · {dims.join(' × ')} mm{category ? ` · ${category}` : ''}
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onShow}>
          Voir dans la 3D
        </button>
        <button
          className="btn small"
          onClick={() => {
            setOpen(!open);
            onShow();
          }}
        >
          Qu’est-ce que c’est ?
        </button>
      </div>
      {open && (
        <div style={{ display: 'grid', gap: 6 }}>
          <input type="text" autoFocus placeholder="Référence ou nom (ex. 7-625-020, sliding)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} />
          {matches.map((c) => (
            <button key={c.ref} className="btn small ghost" style={{ textAlign: 'left' }} onClick={() => setQ(`${c.ref} ${c.designation}`)}>
              <b>{c.ref}</b> {c.designation}
            </button>
          ))}
          {found && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span>
                → <b>{found.ref}</b> {found.designation}
              </span>
              <button className="btn small primary" onClick={() => onAnswer(found.ref)}>
                Valider pour ce chantier
              </button>
              <button
                className="btn small"
                disabled={!canEdit}
                title={canEdit ? 'Toutes les pièces identiques des projets suivants seront reconnues' : 'Réservé à un admin ou un responsable technique'}
                onClick={() => void onRemember(found.ref)}
              >
                Mémoriser pour les projets suivants
              </button>
            </div>
          )}
          {ref && !found && <span className="hint">Référence {ref} absente du catalogue : l’ajouter dans Réglages › Règles de loading › Catalogue.</span>}
          <div>
            <button className="btn small ghost" onClick={() => onAnswer('ignore')}>
              Ce n’est pas un produit à charger (décor, contexte…)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Étape 4 : la loading liste (aperçu, éditable en L4–L5) ─────────────────────────────────────────────────────

const STATUS_LABEL = { calcule: 'calculé', jugement: 'corrigé pour ce chantier', appreciation: 'appréciation', a_confirmer: 'à confirmer', regle_manquante: 'règle manquante' } as const;
const STATUS_BADGE = { calcule: 'ok', jugement: 'orange', appreciation: '', a_confirmer: 'orange', regle_manquante: 'ko' } as const;
const UNIT_LABEL = { pce: '', m: 'm', m2: 'm²', L: 'L' } as const;

function QtyCell({ line: l, readOnly, onSet }: { line: LoadingLine; readOnly: boolean; onSet: (v: number | null) => void }) {
  const [text, setText] = useState<string | null>(null);
  if (text !== null)
    return (
      <input
        type="number"
        min={0}
        step="any"
        autoFocus
        value={text}
        style={{ width: 72 }}
        aria-label={`Quantité ${l.article}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = Number(text);
            if (text !== '' && Number.isFinite(v) && v >= 0) onSet(v);
            setText(null);
          }
          if (e.key === 'Escape') setText(null);
        }}
        onBlur={() => setText(null)}
      />
    );
  return (
    <b
      title={readOnly ? undefined : 'Cliquer pour corriger'}
      style={{ cursor: readOnly ? 'default' : 'text' }}
      onClick={(e) => {
        e.stopPropagation();
        if (!readOnly) setText(l.qty === null ? '' : String(l.qty));
      }}
    >
      {l.qty ?? '?'}
    </b>
  );
}

function ListStep({
  list,
  catalogue,
  readOnly,
  corrections,
  onCorrect,
  onAppreciation,
  pending,
  selected,
  onSelect,
}: {
  list: LoadingList;
  catalogue: CatalogueItem[];
  pending: Map<string, ObservationRow[]>;
  readOnly: boolean;
  corrections: Record<string, number>;
  onCorrect: (article: string, v: number | null) => void;
  onAppreciation: (article: string, v: number | null) => void;
  selected: { ids: string[]; label: string } | null;
  onSelect: (s: { ids: string[]; label: string } | null) => void;
}) {
  const [adding, setAdding] = useState<{ q: string; qty: string } | null>(null);
  const main = list.lines.filter((l) => l.status === 'calcule' || l.status === 'jugement');
  const sections: { title: string; hint: string; lines: LoadingLine[] }[] = [
    ...LOADING_CATEGORIES.map((c) => ({ title: c.label, hint: '', lines: main.filter((l) => l.categorie === c.key) })),
    { title: 'À valider — appréciation', hint: 'Jamais calculé seul : saisir la quantité.', lines: list.lines.filter((l) => l.status === 'appreciation') },
    { title: 'À confirmer', hint: 'Règle pas encore verrouillée, ou question chantier sans réponse.', lines: list.lines.filter((l) => l.status === 'a_confirmer') },
    { title: 'Règle manquante', hint: 'Rien d’inventé : la règle reste à caler (valeurs observées en repère).', lines: list.lines.filter((l) => l.status === 'regle_manquante') },
  ].filter((s) => s.lines.length);
  const ref = adding ? (/^\d-\d{3}-\d{3,5}/.exec(adding.q)?.[0] ?? '') : '';
  const found = ref ? catalogue.find((c) => c.ref === ref) : undefined;
  const matches = adding && adding.q.length >= 2 && !found ? catalogue.filter((c) => `${c.ref} ${c.designation}`.toLowerCase().includes(adding.q.toLowerCase())).slice(0, 8) : [];
  const nCorr = Object.keys(corrections).length;
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Loading liste</h2>
          <span className="hint">
            {list.lines.length} lignes · règles version {list.rulesVersion}
            {nCorr ? ` · ${nCorr} correction(s) pour ce chantier` : ''}
            {readOnly ? ' · liste validée (figée)' : ' · cliquer une quantité pour la corriger'}
          </span>
        </div>
        {!readOnly && (
          <div className="card-body">
            {adding ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div className="row" style={{ gap: 6 }}>
                  <input type="text" autoFocus placeholder="Référence ou nom…" value={adding.q} style={{ flex: 1 }} onChange={(e) => setAdding({ ...adding, q: e.target.value })} />
                  <input type="number" min={0} placeholder="Qté" value={adding.qty} style={{ width: 70 }} onChange={(e) => setAdding({ ...adding, qty: e.target.value })} />
                  <button
                    className="btn small primary"
                    disabled={!found || !(Number(adding.qty) > 0)}
                    onClick={() => {
                      onCorrect(found!.ref, Number(adding.qty));
                      setAdding(null);
                    }}
                  >
                    Ajouter
                  </button>
                  <button className="btn small ghost" onClick={() => setAdding(null)}>
                    Annuler
                  </button>
                </div>
                {matches.map((c) => (
                  <button key={c.ref} className="btn small ghost" style={{ textAlign: 'left' }} onClick={() => setAdding({ ...adding, q: `${c.ref} ${c.designation}` })}>
                    <b>{c.ref}</b> {c.designation}
                  </button>
                ))}
                <span className="hint">Ajout pour ce chantier seulement (apprendre une règle pour tous les projets : prochaine étape).</span>
              </div>
            ) : (
              <button className="btn small" onClick={() => setAdding({ q: '', qty: '1' })}>
                ＋ Ajouter une ligne
              </button>
            )}
          </div>
        )}
        {(list.questions.length > 0 || list.notes.length > 0) && (
          <div className="card-body" style={{ display: 'grid', gap: 6 }}>
            {list.questions.length > 0 && (
              <div>
                <b>Questions ({list.questions.length})</b>
                <ul style={{ margin: '2px 0 0 18px' }}>
                  {list.questions.map((q) => (
                    <li key={q.id}>{q.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {list.notes.length > 0 && (
              <div className="hint">
                <ul style={{ margin: '2px 0 0 18px' }}>
                  {list.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      {sections.map((s) => (
        <div className="card" key={s.title}>
          <div className="card-head">
            <h2>
              {s.title} ({s.lines.length})
            </h2>
            {s.hint && <span className="hint">{s.hint}</span>}
          </div>
          <div className="card-body">
            <table className="list" data-testid="loading-lines">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th style={{ textAlign: 'right' }}>Quantité</th>
                  <th>Détail du calcul</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l) => {
                  const isSel = selected?.label.startsWith(l.article);
                  const corrected = corrections[l.article] !== undefined;
                  const isApp = l.status === 'appreciation';
                  return (
                    <tr
                      key={l.article}
                      style={{ cursor: l.sources.length ? 'pointer' : 'default', background: isSel ? 'var(--bg-3)' : undefined, verticalAlign: 'top', opacity: l.qty === 0 ? 0.55 : 1 }}
                      onClick={() => l.sources.length && onSelect({ ids: l.sources, label: `${l.article} ${l.designation} : ${l.qty ?? '?'}` })}
                    >
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <b>{l.article}</b>
                      </td>
                      <td>
                        {l.designation}
                        <div>
                          <span className={`badge ${STATUS_BADGE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                          {l.status === 'calcule' && l.confidence !== 'confirme' && <span className="hint"> {CONFIDENCE_LABEL[l.confidence]}</span>}
                          {pending.has(l.article) && (
                            <span className="badge orange" title={pending.get(l.article)!.map((o) => o.note ?? '').join(' ; ')} style={{ marginLeft: 4 }}>
                              ❓ question en attente : {pending.get(l.article)![0].note}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <QtyCell line={l} readOnly={readOnly} onSet={(v) => (isApp ? onAppreciation(l.article, v) : onCorrect(l.article, v))} /> {UNIT_LABEL[l.unit]}
                      </td>
                      <td className="hint" style={{ fontSize: 12 }}>
                        {l.detail}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {!readOnly && corrected && (
                          <button
                            className="btn small ghost"
                            title="Revenir à la quantité calculée"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCorrect(l.article, null);
                            }}
                          >
                            ↺
                          </button>
                        )}
                        {!readOnly && !isApp && l.qty !== 0 && (
                          <button
                            className="btn small ghost"
                            title="Retirer de la liste (ce chantier)"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCorrect(l.article, 0);
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
