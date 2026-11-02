// Mode 🎓 « Apprendre » (L7) : montrer dans la 3D ce qui demande un accessoire. Les éléments cliqués (jonctions = bandes,
// pieds = croix, côtés = traits gris au sol, box, panneaux de façade, produits) sont décrits par leurs relations ; ce
// qu'ils ont en commun devient un motif (traits à cocher / décocher pour le rendre plus ou moins général), compté sur ce
// chantier avec ses occurrences visibles en 3D. Puis : quel article, combien par occurrence, spare → écran de
// validation des règles (impact sur les bancs, contradictions, raison). Ou « ✍️ Écrire la règle » avec ces éléments en
// contexte (IA). Rien d'enregistré sans validation (admin, responsable technique).
import { useEffect, useMemo, useState } from 'react';
import type { CatalogueItem, LoadingRule, MotifSpec, Spare } from '../../loading/core/types';
import type { Topology } from '../../loading/topology/types';
import type { TElement } from '../../loading/teach/motif';
import { ATTRS, attrText, countMotif, describeElement, describeMotif, equivalentBase, generalize, KIND_LABEL, motifKey, neighbourPair } from '../../loading/teach/motif';
import type { BaseCandidate } from '../../loading/learning/inferBase';
import { proposeRule } from '../../loading/learning/proposal';
import { COUNTING_BASE_LABEL } from '../../loading/core/types';
import { RuleWriter } from './RuleWriter';

export interface TeachPanelProps {
  topology: Topology;
  elements: readonly TElement[];
  /** ids des éléments montrés */
  selection: string[];
  catalogue: CatalogueItem[];
  catMap: ReadonlyMap<string, CatalogueItem>;
  rules: readonly LoadingRule[];
  canEdit: boolean;
  chantier: string;
  onSelection: (ids: string[]) => void;
  onShow: (s: { ids: string[]; label: string } | null) => void;
  onPropose: (rule: LoadingRule, candidates: BaseCandidate[], title: string) => void;
  onClose: () => void;
}

export function TeachPanel(p: TeachPanelProps) {
  const byId = useMemo(() => new Map(p.elements.map((e) => [e.id, e])), [p.elements]);
  const examples = p.selection.map((id) => byId.get(id)).filter((e): e is TElement => !!e);
  const g = useMemo(() => generalize(examples, p.topology, p.catMap), [examples.map((e) => e.id).join(','), p.topology, p.catMap]); // eslint-disable-line react-hooks/exhaustive-deps
  // traits retenus (cochés) : par défaut tous ceux en commun
  const [kept, setKept] = useState<Record<string, boolean>>({});
  useEffect(() => setKept({}), [g.common ? motifKey(g.common) : '']);
  const spec: MotifSpec | null = g.common ? { kind: g.common.kind, attrs: Object.fromEntries(Object.entries(g.common.attrs).filter(([k]) => kept[k] !== false)) } : null;
  const count = useMemo(() => (spec ? countMotif(p.topology, spec, null, p.catMap, p.elements) : null), [spec ? motifKey(spec) : '', p.topology, p.elements]); // eslint-disable-line react-hooks/exhaustive-deps
  // « box seule / box connectées » devient la condition de la règle (lue îlot par îlot), pas un trait du motif
  const scope = spec?.attrs.regime === 'standalone' ? 'standalone' : spec?.attrs.regime === 'connecte' ? 'connecte' : 'toujours';
  const ruleSpec: MotifSpec | null = spec ? { kind: spec.kind, attrs: Object.fromEntries(Object.entries(spec.attrs).filter(([k]) => k !== 'regime')) } : null;
  const eq = ruleSpec ? equivalentBase(p.topology, ruleSpec) : null;
  const [article, setArticle] = useState('');
  const [qty, setQty] = useState('1');
  const [spareType, setSpareType] = useState<'' | 'fixe' | 'pourcent'>('');
  const [spareVal, setSpareVal] = useState('');
  const [writer, setWriter] = useState(false);
  const ref = /^\d-\d{3}-\d{3,5}/.exec(article)?.[0] ?? '';
  const found = ref ? p.catMap.get(ref) : undefined;
  const matches = article.length >= 2 && !found ? p.catalogue.filter((c) => `${c.ref} ${c.designation}`.toLowerCase().includes(article.toLowerCase())).slice(0, 8) : [];
  const pair = examples.length === 2 ? neighbourPair(examples[0], examples[1], p.elements) : null;
  const q = Number(qty.replace(',', '.'));
  const spare: Extract<Spare, { valeur: number }> | undefined = spareType && Number(spareVal) > 0 ? { type: spareType, valeur: Number(spareVal.replace(',', '.')) } : undefined;

  const propose = () => {
    if (!spec || !found || !count || !(q > 0)) return;
    const per = eq?.per ?? 'motif';
    // occurrences sur ce chantier (le motif complet, régime compris)
    const base = count.value;
    const result = spare?.type === 'fixe' ? q * base + spare.valeur : spare?.type === 'pourcent' ? Math.ceil(q * base * (1 + spare.valeur / 100) - 1e-9) : q * base;
    const label = `${q} ${eq ? COUNTING_BASE_LABEL[eq.per] : `par ${describeMotif(ruleSpec!)}`}${scope !== 'toujours' ? (scope === 'connecte' ? ' (box connectées)' : ' (box seules)') : ''}${spare ? (spare.type === 'fixe' ? ` + ${spare.valeur}` : ` + ${spare.valeur} %`) : ''}`;
    const c: BaseCandidate = { per, ...(eq?.trigger ? { trigger: eq.trigger } : {}), ...(per === 'motif' ? { motif: ruleSpec! } : {}), qty: q, spare, base, result, label, score: 0 };
    const rule = proposeRule(
      {
        article: found.ref,
        articleName: found.designation,
        candidate: c,
        scope,
        confidence: 'a_confirmer',
        unit: found.unit,
        source: 'montre_3d',
        chantier: p.chantier,
        remark: `Montrée en 3D sur ${p.chantier} : ${examples.map((e) => describeElement(e)).join(' ; ')}`,
      },
      p.rules,
    );
    p.onPropose(rule, [c], 'Nouvelle règle montrée en 3D');
  };

  return (
    <>
      <div className="card" data-testid="teach-panel">
        <div className="card-head">
          <h2>🎓 Apprendre</h2>
          <span className="hint">Clique dans la 3D ce qui demande l’accessoire : jonctions (bandes), pieds (croix), côtés (traits gris au sol), box, panneaux, produits.</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn small ghost" onClick={p.onClose}>
            ✕
          </button>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          {!examples.length ? (
            <div className="hint">Rien de montré pour l’instant.</div>
          ) : (
            <div>
              <b>Montré ({examples.length})</b>{' '}
              <button className="btn small ghost" onClick={() => p.onSelection([])}>
                Tout retirer
              </button>
              <ul style={{ margin: '4px 0 0 18px' }} data-testid="teach-selection">
                {examples.map((e) => (
                  <li key={e.id}>
                    {describeElement(e)}{' '}
                    <button className="btn small ghost" title="Retirer" onClick={() => p.onSelection(p.selection.filter((x) => x !== e.id))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              {pair && (
                <button className="btn small" onClick={() => p.onSelection([pair.id])} data-testid="teach-pair">
                  C’est la jonction entre ces deux panneaux
                </button>
              )}
            </div>
          )}
          {g.error && <div className="error-box">{g.error}</div>}
          {g.common && spec && count && (
            <>
              <div>
                <b>Ce qu’ils ont en commun</b> <span className="hint">(décocher un trait pour généraliser)</span>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                  {Object.keys(ATTRS[g.common.kind])
                    .filter((k) => k in g.common!.attrs)
                    .map((k) => (
                      <label key={k} className="row" style={{ gap: 4 }}>
                        <input type="checkbox" checked={kept[k] !== false} onChange={(e) => setKept((x) => ({ ...x, [k]: e.target.checked }))} />
                        {attrText(g.common!.kind, k, g.common!.attrs[k])}
                      </label>
                    ))}
                  {!Object.keys(g.common.attrs).length && <span className="hint">rien de plus que « {KIND_LABEL[g.common.kind][0]} »</span>}
                </div>
              </div>
              <div data-testid="teach-motif">
                Motif : <b>{describeMotif(spec)}</b> — <b>{count.value}</b> sur ce chantier{' '}
                <button className="btn small" onClick={() => p.onShow({ ids: count.ids, label: `Motif « ${describeMotif(spec)} » : ${count.value} occurrence(s)` })} data-testid="teach-show">
                  👁 Voir les occurrences
                </button>
                {eq && <div className="hint">= base déjà connue « {eq.per === 'produit' ? `par ${eq.trigger}` : COUNTING_BASE_LABEL[eq.per]} » : c’est elle qui sera proposée.</div>}
              </div>
              {g.variants.length > 1 && (
                <details>
                  <summary className="hint">Variantes plus ou moins générales</summary>
                  <ul style={{ margin: '4px 0 0 18px' }}>
                    {g.variants.map((v) => (
                      <li key={motifKey(v.spec)}>
                        {v.label} — {v.count}{' '}
                        <button className="btn small ghost" onClick={() => setKept(Object.fromEntries(Object.keys(g.common!.attrs).map((k) => [k, k in v.spec.attrs])))}>
                          prendre
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div style={{ display: 'grid', gap: 6 }}>
                <b>Ce qu’il faut pour chacun</b>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <input type="number" min={0} step="any" style={{ width: 70 }} value={qty} onChange={(e) => setQty(e.target.value)} data-testid="teach-qty" />
                  ×
                  <input type="text" style={{ flex: 1, minWidth: 220 }} placeholder="Article : référence ou nom…" value={article} onChange={(e) => setArticle(e.target.value)} data-testid="teach-article" />
                  <select value={spareType} onChange={(e) => setSpareType(e.target.value as '' | 'fixe' | 'pourcent')}>
                    <option value="">sans spare</option>
                    <option value="fixe">+ n en spare</option>
                    <option value="pourcent">+ n %</option>
                  </select>
                  {spareType && <input type="number" min={0} style={{ width: 60 }} value={spareVal} onChange={(e) => setSpareVal(e.target.value)} />}
                </div>
                {matches.map((c) => (
                  <button key={c.ref} className="btn small ghost" style={{ textAlign: 'left' }} onClick={() => setArticle(`${c.ref} ${c.designation}`)}>
                    <b>{c.ref}</b> {c.designation}
                  </button>
                ))}
                {found && (
                  <div className="hint">
                    {q > 0 ? `${q} × ${found.ref} par ${describeMotif(spec)} → ${q * count.value}${spare ? ' + spare' : ''} sur ce chantier` : 'Quantité à saisir'}
                  </div>
                )}
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn primary" disabled={!found || !(q > 0) || !count.value || !p.canEdit} onClick={propose} data-testid="teach-propose" title={p.canEdit ? '' : 'Admin ou responsable technique'}>
                    Proposer la règle…
                  </button>
                  <button className="btn" disabled={!p.canEdit} onClick={() => setWriter(true)}>
                    ✍️ Écrire la règle en texte
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {writer && (
        <RuleWriter
          catalogue={p.catalogue}
          catMap={p.catMap}
          rules={p.rules}
          elements={p.elements}
          context={examples.map((e) => describeElement(e)).join(' ; ')}
          onClose={() => setWriter(false)}
          onDraft={(r) => {
            setWriter(false);
            p.onPropose(r, [], 'Nouvelle règle écrite');
          }}
        />
      )}
    </>
  );
}
