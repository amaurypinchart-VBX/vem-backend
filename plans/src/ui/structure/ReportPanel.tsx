// Étape « 6. Rapport » : rapport PDF de l'étude (FR par défaut, DE, EN ; version compacte ou détaillée avec annexe),
// vues 3D rendues par un viewer caché (modèle, taux de travail), plan de calage A3 fait avec le moteur de planches
// (vue de dessus du niveau 0 calculée par le moteur 2D + plaques en surcouche), aperçu des pages, téléchargement,
// enregistrement dans le projet (Cloudinary, 10 Mo au plus) et liste des rapports enregistrés.
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LoadedScene } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import type { BrowserHlrProvider } from '../../linework/provider';
import type { Linework2D } from '../../linework/types';
import { subsetForLevel } from '../../core/subset';
import { viewBasis } from '../../core/views';
import { LineworkBank } from '../../sheets/bank';
import type { ViewportData } from '../../sheets/SheetSvg';
import { SheetSvg } from '../../sheets/SheetSvg';
import { fitScale } from '../../sheets/scales';
import { titleBlockFromProject, fmtDate } from '../../sheets/titleBlock';
import type { DrawingSet, Sheet, ViewportItem } from '../../sheets/types';
import { DEFAULT_GENERAL_NOTES } from '../../sheets/template';
import { newId, renumber } from '../../sheets/generate';
import { actions as sheetActions, useEditor } from '../../sheets/store';
import { SceneViewer } from '../../viewer/SceneViewer';
import type { CalageResult } from '../../structure/core/calage';
import { computeCalage } from '../../structure/core/calage';
import type { EstimateModule } from '../../structure/core/estimate';
import { BEARING_PRESETS, bearingFrom } from '../../structure/core/ground';
import type { Recognition } from '../../structure/core/recognition';
import { ignoredStructural } from '../../structure/scene/studyModel';
import { VERDICT_LABEL } from '../../structure/core/records';
import type { ReportImage, ReportOutput, ReportVariant } from '../../structure/report/build';
import { buildReport } from '../../structure/report/build';
import { calagePlates, calageSheet, calageTitleBlock, fitCalageViewport, outlineLinework } from '../../structure/report/calagePlan';
import type { Lang } from '../../structure/report/i18n';
import { LABELS, LANG_LABEL, LANGS } from '../../structure/report/i18n';
import type { StudyInputs, StudyRun } from '../../structure/studyRun';
import type { AiTexts, AiUsage, DrawingSetRecord, ModelVersion, Project, StructReportRecord, StudyRecord, VemUser } from '../../api/vem';
import { studyFacts } from '../../structure/report/facts';
import type { AiState } from './aiUi';
import { AiUsageNote } from './aiUi';
import { PROJECT_ID, STRUCTURE_STOCK_KEY, vem } from '../../api/vem';
import { downloadBlob } from '../common';
import { moduleEtaColors } from './CalcResults';
import type { Hypotheses, StructureStock } from './GroundPanel';
import { calageInput } from './GroundPanel';
import { groundExtras } from './studyInputs';

/** Version affichée dans les rapports. */
export const STRUCTURE_VERSION = 'v1.0';
const MAX_UPLOAD = 10 * 1024 * 1024;

interface Props {
  scene: LoadedScene;
  provider: BrowserHlrProvider | null;
  glassTest: GlassTest;
  run: StudyRun | null;
  stale: boolean;
  inputs: StudyInputs;
  hyp: Hypotheses;
  modules: EstimateModule[];
  recognition: Recognition;
  model?: ModelVersion;
  study: StudyRecord | null;
  me: VemUser | null;
  ai?: AiState | null;
  /** modifications de l'étude hors modèle SketchUp (conseil ingénieur) */
  modifications?: string[];
}

interface Prepared {
  key: string;
  report: ReportOutput;
  fileName: string;
}

/** Captures 3D du rapport (modèle, taux de travail) par un viewer caché : JPEG, fond blanc. */
async function captureViews(scene: LoadedScene, glassTest: GlassTest, colors: Map<string, number>): Promise<{ view3d: ReportImage; eta3d: ReportImage }> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1350px;height:900px;pointer-events:none;';
  document.body.appendChild(host);
  const viewer = new SceneViewer(host, scene, glassTest);
  viewer.setFrontMarkers(false);
  const toImage = async (blob: Blob, width: number, height: number): Promise<ReportImage> => {
    const { pdfImageDataUrl } = await import('../../sheets/pdf/assets');
    const url = URL.createObjectURL(blob);
    try {
      return { href: await pdfImageDataUrl(url, 0.85), width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  try {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    viewer.setVisibility(null);
    const pose = viewer.poseFor('iso-sw', undefined, 1.5, 1.02, 'perspective');
    const a = await viewer.capture({ size: 1800, background: 'white', marginPct: 2, pose });
    viewer.setColorOverlay(colors);
    const b = await viewer.capture({ size: 1800, background: 'white', marginPct: 2, pose });
    return { view3d: await toImage(a.blob, a.width, a.height), eta3d: await toImage(b.blob, b.width, b.height) };
  } finally {
    viewer.dispose();
    host.remove();
  }
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

export function ReportPanel({ scene, provider, glassTest, run, stale, inputs, hyp, modules, recognition, model, study, me, ai, modifications }: Props) {
  const [lang, setLang] = useState<Lang>('fr');
  const [variant, setVariant] = useState<ReportVariant>('compact');
  const [withPlan, setWithPlan] = useState(true);
  const [with3d, setWith3d] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [stock, setStock] = useState<StructureStock>({ plates: [], commercial: [] });
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<StructReportRecord[]>([]);
  const [page, setPage] = useState(0);
  const images = useRef<{ key: unknown; value: { view3d: ReportImage; eta3d: ReportImage } } | null>(null);
  // textes rédigés par l'IA (contrôlés côté serveur), modifiables, dans la langue où ils ont été demandés
  const [aiTexts, setAiTexts] = useState<(AiTexts & { lang: Lang }) | null>(null);
  const [useAiTexts, setUseAiTexts] = useState(true);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  // jeux de plans 2D du projet (ajout du plan de calage) ; '' = nouveau jeu
  const [sets, setSets] = useState<DrawingSetRecord[]>([]);
  const [targetSet, setTargetSet] = useState('');
  const [addInfo, setAddInfo] = useState('');
  const refreshSets = async () => {
    if (!PROJECT_ID) return;
    try {
      const list = await vem.listDrawingSets(PROJECT_ID);
      setSets(list);
      setTargetSet((t) => t || list.find((x) => x.modelVersionId === model?.id)?.id || list[0]?.id || '');
    } catch {
      /* liste indisponible */
    }
  };

  useEffect(() => {
    if (PROJECT_ID) vem.project(PROJECT_ID).then(setProject).catch(() => {});
    vem
      .getSetting<StructureStock>(STRUCTURE_STOCK_KEY)
      .then((s) => s && setStock({ plates: s.plates ?? [], commercial: s.commercial ?? [] }))
      .catch(() => {});
  }, []);
  const refreshSaved = async () => {
    if (!study) return;
    try {
      setSaved(await vem.listReports(study.id));
    } catch {
      /* liste indisponible (hors ligne) */
    }
  };
  useEffect(() => {
    void refreshSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);
  useEffect(() => {
    void refreshSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study?.id]);

  // calage avec les réactions du calcul (mêmes entrées que l'étape 5)
  const calage = useMemo((): CalageResult | null => {
    if (!run || stale || !modules.length) return null;
    const input = { ...calageInput(modules, hyp, stock, false, groundExtras(inputs)), reactions: run.ground };
    if (!(input.bearing > 0)) return null;
    try {
      return computeCalage(input);
    } catch {
      return null;
    }
  }, [run, stale, modules, hyp, stock, inputs]);
  const bearing = useMemo(() => {
    const v = bearingFrom(hyp.bearingValue, hyp.bearingUnit) * 1e3;
    return v > 0 ? { value: v, label: BEARING_PRESETS.find((p) => p.key === hyp.bearingPreset)?.label ?? '—' } : null;
  }, [hyp]);
  const texts = useAiTexts && aiTexts && aiTexts.lang === lang ? aiTexts : undefined;
  const key = JSON.stringify([lang, variant, withPlan, with3d, run?.durationMs, !!run?.capacity, stale, calage?.materials, project?.id, texts, modifications]);
  useEffect(() => {
    if (prepared && prepared.key !== key) setPrepared(null);
  }, [key, prepared]);

  const projectName = project ? `${project.internalNumber ? project.internalNumber + ' ' : ''}${project.name}` : (model?.fileName ?? 'Projet');

  /** Planche du plan de calage A3 : vue de dessus du niveau 0 par le moteur 2D (pieds, sinon planchers), plaques en surcouche. */
  const planSheet = async (l: Lang) => {
    if (!run || !calage) return null;
    const lowest = Math.min(...scene.index.modules.map((m) => m.level));
    const include = subsetForLevel(scene.index, lowest);
    const plates = calagePlates(run.structure, calage, l);
    const { sheet, notes, legend, viewport } = calageSheet({ lang: l, modelKey: scene.modelKey, include, plates, calage, bearing, jacks: inputs.options.jacks, number: '' });
    const basis = viewBasis(viewport.request.view, scene.frames);
    let data: ((vp: ViewportItem) => ViewportData) | null = null;
    let lw: Linework2D | null = null;
    let engine = false;
    if (provider) {
      const bank = new LineworkBank(scene, provider);
      let r = await bank.load(viewport);
      if (!r) {
        // pas de pieds dans le modèle : planchers et structure du niveau 0
        viewport.request = { ...viewport.request, subset: { include, hideCategories: ['TOIT'] } };
        r = await bank.load(viewport);
      }
      if (r) {
        lw = r.lw;
        viewport.lineworkKey = r.key;
        data = (vp) => bank.data(vp);
        engine = true;
      }
    }
    if (!lw) {
      lw = outlineLinework(run.structure, basis);
      const fallback = lw;
      data = () => ({ lw: fallback, basis });
    }
    fitCalageViewport(viewport, lw, plates, basis, fitScale);
    return { sheet, notes, legend, viewData: data!, engine };
  };

  /** Plan de calage A3 rendu en SVG (rapport, PDF seul). */
  const planPage = async (l: Lang): Promise<((label: string) => string) | null> => {
    const p = await planSheet(l);
    if (!p) return null;
    const tb = calageTitleBlock(titleBlockFromProject(project, me), l);
    return (label: string) => renderToStaticMarkup(<SheetSvg sheet={{ ...p.sheet, number: label }} titleBlock={tb} notes={p.notes} legend={p.legend} viewData={p.viewData} />);
  };

  /** Ajoute le plan de calage (planche A3) à un jeu de plans 2D du projet, ou en crée un. */
  const addToDrawingSet = async () => {
    setError('');
    setAddInfo('');
    try {
      setBusy('Plan de calage…');
      const p = await planSheet(lang);
      if (!p) throw new Error('calage non dimensionné (portance ou calcul manquant)');
      if (!p.engine) throw new Error('vue de dessus indisponible (moteur 2D non prêt) : réessayer dans un instant');
      // identifiants propres à la planche ajoutée
      const sheet: Sheet = structuredClone(p.sheet);
      sheet.id = newId('s');
      for (const it of sheet.items) it.id = newId(it.type[0]);
      const L = LABELS[lang];
      sheet.title = `${L.calagePlan} — ${new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-DE' : 'fr-FR')}`;
      setBusy('Jeu de plans…');
      const open = useEditor.getState().doc;
      if (targetSet && open?.id === targetSet) {
        // jeu ouvert dans l'onglet « Planches » : ajouté dans l'éditeur (enregistrement automatique)
        sheetActions.addSheet(sheet);
        setAddInfo(`Planche ajoutée au jeu « ${open.title} » (onglet Planches A1).`);
      } else if (targetSet) {
        const rec = await vem.getDrawingSet(targetSet);
        const data = rec.data as DrawingSet;
        data.sheets.push(sheet);
        renumber(data.sheets);
        await vem.saveDrawingSet(rec.id, { title: rec.title, data: { ...data, updatedAt: new Date().toISOString() } });
        setAddInfo(`Planche ${sheet.number} ajoutée au jeu « ${rec.title} » (onglet Planches A1).`);
      } else {
        if (!PROJECT_ID) throw new Error('projet VEM inconnu');
        renumber([sheet]);
        const title = `${L.calagePlan} ${projectName}`;
        const data: DrawingSet = {
          id: '',
          projectId: PROJECT_ID,
          modelVersionId: model?.id ?? null,
          modelKey: scene.modelKey,
          title,
          templateId: 'viewbox',
          titleBlock: titleBlockFromProject(project, me),
          notes: DEFAULT_GENERAL_NOTES,
          sheets: [sheet],
          revision: 0,
          updatedAt: new Date().toISOString(),
        };
        const rec = await vem.createDrawingSet(PROJECT_ID, { title, modelVersionId: model?.id ?? null, data });
        setTargetSet(rec.id);
        setAddInfo(`Nouveau jeu de plans « ${title} » créé avec la planche ${sheet.number} (onglet Planches A1).`);
      }
      await refreshSets();
    } catch (e) {
      setError(`Ajout aux plans 2D impossible : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const prepare = async (): Promise<Prepared | null> => {
    if (!run) return null;
    setError('');
    try {
      let imgs: { view3d: ReportImage; eta3d: ReportImage } | undefined;
      if (with3d) {
        const ik = [run.durationMs, lang];
        if (images.current && JSON.stringify(images.current.key) === JSON.stringify(ik)) imgs = images.current.value;
        else {
          setBusy('Vues 3D…');
          imgs = await captureViews(scene, glassTest, moduleEtaColors(run, scene, recognition));
          images.current = { key: ik, value: imgs };
        }
      }
      setBusy('Plan de calage…');
      const plan = withPlan ? await planPage(lang) : null;
      setBusy('Mise en page…');
      await new Promise((r) => setTimeout(r, 0));
      const tb = titleBlockFromProject(project, me);
      const report = buildReport({
        lang,
        variant,
        project: { name: tb.projectName || model?.fileName || '', number: tb.projectNumber, client: tb.client, address: tb.address, installation: tb.projectDate },
        author: tb.drawnBy,
        date: new Date(),
        model: { fileName: scene.index.source.fileName, date: model ? fmtDate(model.createdAt).replace(/ \/ /g, '.') : fmtDate(new Date()).replace(/ \/ /g, '.') },
        version: STRUCTURE_VERSION,
        study: inputs,
        run,
        calage,
        bearing,
        moduleWeightKg: hyp.moduleWeightKg,
        sceneWarnings: [],
        ignoredParts: ignoredStructural(recognition),
        images: imgs,
        calagePlan: plan ?? undefined,
        texts,
        modifications,
      });
      const L = LABELS[lang];
      const p: Prepared = { key, report, fileName: safeName(`${L.coverTitle} ${projectName} ${lang.toUpperCase()}${variant === 'detailed' ? ' +' : ''}.pdf`) };
      setPrepared(p);
      setPage(0);
      return p;
    } catch (e) {
      setError(`Rapport impossible : ${(e as Error).message}`);
      return null;
    } finally {
      setBusy('');
    }
  };

  const writeTexts = async () => {
    if (!run) return;
    setAiBusy(true);
    setError('');
    try {
      const tb = titleBlockFromProject(project, me);
      const facts = studyFacts({ lang, run, inputs, calage, project: { name: tb.projectName, client: tb.client, address: tb.address }, bearing: bearing?.value ?? null });
      const r = await vem.aiWrite({ lang, facts, studyId: study?.id ?? null });
      setAiTexts({ ...r.texts, lang });
      setAiUsage(r.usage);
      setUseAiTexts(true);
    } catch (e) {
      setError(`IA : ${(e as Error).message}`);
    }
    setAiBusy(false);
  };

  const toPdf = async (pages: ReportOutput['pages'], title: string): Promise<Blob> => {
    const [{ buildPdf, fontsUsed }, { loadFonts }] = await Promise.all([import('../../sheets/pdf/pdf'), import('../../sheets/pdf/assets')]);
    setBusy('PDF : polices…');
    const fonts = await loadFonts(fontsUsed(pages.map((p) => p.svg)));
    const pdf = await buildPdf(
      pages.map((p) => ({ svg: p.svg, paper: 'A3' as const, size: p.size })),
      fonts,
      { title, subject: `VEM · Étude structure ${STRUCTURE_VERSION}` },
      (d, n) => setBusy(`PDF : page ${d}/${n}…`),
    );
    return pdf.output('blob');
  };

  const download = async () => {
    const p = prepared ?? (await prepare());
    if (!p) return;
    try {
      downloadBlob(p.fileName, await toPdf(p.report.pages, p.fileName.replace(/\.pdf$/, '')));
    } catch (e) {
      setError(`PDF impossible : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const downloadPlan = async () => {
    setError('');
    try {
      setBusy('Plan de calage…');
      const plan = await planPage(lang);
      if (!plan) throw new Error('calage non dimensionné (portance ou calcul manquant)');
      const L = LABELS[lang];
      const name = safeName(`${L.calagePlan} ${projectName}.pdf`);
      downloadBlob(name, await toPdf([{ svg: plan('C 1'), size: { w: 420, h: 297 } }], name.replace(/\.pdf$/, '')));
    } catch (e) {
      setError(`Plan de calage impossible : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const save = async () => {
    if (!study) return;
    const p = prepared ?? (await prepare());
    if (!p) return;
    try {
      const blob = await toPdf(p.report.pages, p.fileName.replace(/\.pdf$/, ''));
      if (blob.size > MAX_UPLOAD) throw new Error(`PDF de ${(blob.size / 1e6).toFixed(1)} Mo : plus de 10 Mo, refusé par Cloudinary — décocher les vues 3D ou choisir la version compacte`);
      setBusy('Envoi…');
      await vem.uploadReport(study.id, blob, { fileName: p.fileName, lang, variant, verdict: p.report.verdict, pages: p.report.pages.length });
      await refreshSaved();
    } catch (e) {
      setError(`Enregistrement impossible : ${(e as Error).message}`);
    }
    setBusy('');
  };

  if (!run)
    return (
      <div className="card">
        <div className="card-body hint">Pas encore de résultat : lancer le calcul à l’étape 3, le rapport est fait à partir du calcul complet.</div>
      </div>
    );
  const cur = prepared?.report.pages[page];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(0, 2fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card">
          <div className="card-head">
            <h3>Rapport PDF</h3>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stale && <div className="error-box">Résultat périmé : les données ont changé depuis le calcul. Relancer l’étape 3 avant de faire le rapport.</div>}
            {!stale && !run.capacity && <div className="hint">Charge d’exploitation maximale encore en calcul (étape 4) : elle sera dans le rapport dès qu’elle sera prête (refaire l’aperçu).</div>}
            <label className="row" style={{ justifyContent: 'space-between' }}>
              Langue
              <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {LANG_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="row" style={{ justifyContent: 'space-between' }}>
              Version
              <select value={variant} onChange={(e) => setVariant(e.target.value as ReportVariant)}>
                <option value="compact">Compacte (synthèse + chapitres)</option>
                <option value="detailed">Détaillée (avec annexe de calcul)</option>
              </select>
            </label>
            <label className="row hint">
              <input type="checkbox" checked={withPlan} onChange={(e) => setWithPlan(e.target.checked)} /> Joindre le plan de calage A3
            </label>
            <label className="row hint">
              <input type="checkbox" checked={with3d} onChange={(e) => setWith3d(e.target.checked)} /> Vues 3D (modèle et taux de travail)
            </label>
            {!calage && <div className="hint" style={{ color: 'var(--warn)' }}>Calage non dimensionné (portance à renseigner à l’étape 2) : le rapport le signale.</div>}
            {ai?.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div className="row">
                  <button className="btn small" disabled={aiBusy || stale} onClick={() => void writeTexts()} title="Description de l’ouvrage, consignes particulières et conclusion, à partir des résultats du calcul">
                    {aiBusy ? '🤖 Rédaction…' : aiTexts ? '↻ Rédiger à nouveau (IA)' : '🤖 Rédiger les textes (IA)'}
                  </button>
                  <AiUsageNote usage={aiUsage} />
                </div>
                {aiTexts && (
                  <>
                    <label className="row hint">
                      <input type="checkbox" checked={useAiTexts} onChange={(e) => setUseAiTexts(e.target.checked)} /> utiliser ces textes dans le rapport
                      {aiTexts.lang !== lang && <span style={{ color: 'var(--warn)' }}> — rédigés en {LANG_LABEL[aiTexts.lang]} : rédiger à nouveau pour {LANG_LABEL[lang]}</span>}
                    </label>
                    <span className="hint">Description de l’ouvrage</span>
                    <textarea rows={5} value={aiTexts.description} onChange={(e) => setAiTexts({ ...aiTexts, description: e.target.value })} />
                    <span className="hint">Consignes particulières (une par ligne)</span>
                    <textarea rows={3} value={aiTexts.instructions.join('\n')} onChange={(e) => setAiTexts({ ...aiTexts, instructions: e.target.value.split('\n') })} />
                    <span className="hint">Conclusion</span>
                    <textarea rows={4} value={aiTexts.conclusion} onChange={(e) => setAiTexts({ ...aiTexts, conclusion: e.target.value })} />
                    <span className="hint">Textes contrôlés : aucun chiffre qui ne vient pas du calcul. Relisez-les ; vos corrections sont reprises telles quelles.</span>
                  </>
                )}
              </div>
            )}
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="btn small" disabled={!!busy || stale} onClick={() => void prepare()}>
                {prepared ? '↻ Refaire l’aperçu' : 'Aperçu'}
              </button>
              <button className="btn small primary" disabled={!!busy || stale} onClick={() => void download()}>
                ⬇ PDF du rapport
              </button>
              <button className="btn small" disabled={!!busy || stale || !calage} onClick={() => void downloadPlan()} title="Plan de calage seul, pour l'équipe de montage">
                ⬇ Plan de calage A3
              </button>
              <button className="btn small" disabled={!!busy || stale || !study} onClick={() => void save()} title={study ? 'PDF enregistré dans le projet' : 'Étude non enregistrée'}>
                Enregistrer dans le projet
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <b style={{ fontSize: 13 }}>📐 Plan de calage dans les plans 2D</b>
              <label className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
                Jeu de plans
                <select value={targetSet} onChange={(e) => setTargetSet(e.target.value)}>
                  {sets.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                  <option value="">＋ Nouveau jeu « {LABELS[lang].calagePlan} »</option>
                </select>
              </label>
              <button className="btn small" disabled={!!busy || stale || !calage || !provider} onClick={() => void addToDrawingSet()} title="Ajoute la planche A3 du plan de calage (plaques, types d’appui, matériel, références TÜV) dans la langue choisie ; modifiable ensuite dans l’onglet Planches A1">
                ＋ Ajouter le plan de calage au jeu de plans
              </button>
              {addInfo && <div className="hint" style={{ color: 'var(--ok, #15803d)' }}>{addInfo}</div>}
            </div>
            {busy && <div className="hint">{busy}</div>}
            {error && <div className="error-box">{error}</div>}
            {prepared && (
              <div className="hint">
                {VERDICT_LABEL[prepared.report.verdict]} · {prepared.report.pages.length} pages ({prepared.report.mainPages} + {prepared.report.annexPages} d’annexe + page de garde)
              </div>
            )}
            <div className="hint">Pré-étude interne, non vérifiée par un ingénieur : filigrane sur chaque page.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Rapports enregistrés</h3>
          </div>
          <div className="card-body">
            {saved.length ? (
              <table className="list">
                <tbody>
                  {saved.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.fileName}
                        </a>
                        <div className="hint">
                          {new Date(r.createdAt).toLocaleString('fr-FR')} · {r.lang.toUpperCase()} · {r.variant === 'detailed' ? 'détaillée' : 'compacte'}
                          {r.pages ? ` · ${r.pages} p.` : ''}
                        </div>
                      </td>
                      <td>{r.verdict ? VERDICT_LABEL[r.verdict as keyof typeof VERDICT_LABEL] : ''}</td>
                      <td>
                        <button
                          className="btn small ghost"
                          onClick={async () => {
                            if (!window.confirm(`Supprimer « ${r.fileName} » ?`)) return;
                            try {
                              await vem.deleteReport(r.id);
                              await refreshSaved();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="hint">Aucun rapport enregistré pour cette étude.</div>
            )}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Aperçu</h3>
          <div className="spacer" style={{ flex: 1 }} />
          {prepared && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                ◀
              </button>
              <span className="hint">
                {page + 1} / {prepared.report.pages.length}
              </span>
              <button className="btn small ghost" disabled={page >= prepared.report.pages.length - 1} onClick={() => setPage(page + 1)}>
                ▶
              </button>
            </div>
          )}
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {cur ? (
            <img
              className="report-page"
              alt={`page ${page + 1}`}
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(cur.svg)}`}
              style={{ width: '100%', maxWidth: cur.size.w > cur.size.h ? 1100 : 760, background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,.25)' }}
            />
          ) : (
            <div className="hint">« Aperçu » prépare les pages (vues 3D, plan de calage, mise en page) sans télécharger.</div>
          )}
          {prepared && (
            <div className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {prepared.report.pages.map((_, k) => (
                <button key={k} className={`btn small ${k === page ? 'primary' : 'ghost'}`} onClick={() => setPage(k)} title={`page ${k + 1}`}>
                  {k === 0 ? 'Garde' : k}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
