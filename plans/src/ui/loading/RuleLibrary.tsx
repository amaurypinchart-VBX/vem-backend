// Réglages › Règles de loading : ce que le module sait pour sortir une loading liste, partagé entre tous les projets
// (base de départ générée du classeur VIEWBOX_regles_loading + règles validées dans l'app). Lecture : règles en
// français, conditions, spares, confiance, points de calage, historique ; décisions d'Amaury ; valeurs observées.
// Catalogue : références du classeur (lecture seule) + ajout des références manquantes (admin, responsable technique).
// La modification des règles passe par l'écran de validation (phase L5), jamais en direct ici.
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CatalogueItem, Confidence, LoadingCategory } from '../../loading/core/types';
import { CONFIDENCE_LABEL, COUNTING_BASE_LABEL, LOADING_CATEGORIES } from '../../loading/core/types';
import { describeRule } from '../../loading/core/describe';
import type { EffectiveRule, ServerCatalogueRow, ServerRuleRow } from '../../loading/library/merge';
import { mergeCatalogue, mergeRules, rulesVersion } from '../../loading/library/merge';
import { SEED_CATALOGUE_TO_ADD, SEED_DECISIONS, SEED_META, SEED_OBSERVATIONS, SEED_RULES } from '../../loading/library/seed';
import { SEED_CATALOGUE } from '../../loading/library/catalogue';
import type { LoadingHistoryRow, VemUser } from '../../api/vem';
import { vem } from '../../api/vem';
import { downloadBlob, downloadText } from '../common';
import type { LoadingRule } from '../../loading/core/types';
import { classeurXlsx } from '../../loading/library/exportClasseur';
import type { ObservationRow } from '../../loading/learning/calibration';
import { pendingQuestions, promotionProposals } from '../../loading/learning/calibration';
import type { ImpactCase } from '../../loading/learning/impact';
import { RuleValidation } from './RuleValidation';
import { impactCases } from './impactCases';

const EDITORS = ['admin', 'technical_manager'];
const CONF_BADGE: Record<Confidence, string> = { confirme: 'ok', a_confirmer: 'orange', hypothese: 'orange', observe: '' };
const ORIGIN_LABEL = { seed: 'classeur', override: 'classeur modifié', user: 'ajoutée' } as const;
type Tab = 'rules' | 'catalogue' | 'decisions';
type Status = '' | 'active' | 'conflict' | 'inactive';

export function RuleLibrary() {
  const [tab, setTab] = useState<Tab>('rules');
  const [rows, setRows] = useState<ServerRuleRow[]>([]);
  const [catRows, setCatRows] = useState<ServerCatalogueRow[]>([]);
  const [me, setMe] = useState<VemUser | null>(null);
  const [msg, setMsg] = useState('');
  const refresh = async () => {
    try {
      const [r, c] = await Promise.all([vem.loadingRules(), vem.loadingCatalogue()]);
      setRows(r);
      setCatRows(c);
    } catch (e) {
      setMsg(`✗ Règles en ligne indisponibles (base de départ seule) : ${(e as Error).message}`);
    }
  };
  useEffect(() => {
    void refresh();
    vem.me().then(setMe).catch(() => {});
  }, []);
  const canEdit = EDITORS.includes(me?.role ?? '');
  const rules = useMemo(() => mergeRules(SEED_RULES, rows), [rows]);
  const catalogue = useMemo(() => mergeCatalogue(SEED_CATALOGUE, catRows), [catRows]);
  const catMap = useMemo(() => new Map(catalogue.map((c) => [c.ref, c])), [catalogue]);
  const version = useMemo(() => rulesVersion(rules), [rules]);
  const [obs, setObs] = useState<ObservationRow[]>([]);
  useEffect(() => {
    vem.loadingObservations().then(setObs).catch(() => {});
  }, []);
  const [editing, setEditing] = useState<LoadingRule | null>(null);
  const [cases, setCases] = useState<ImpactCase[] | null>(null);
  const edit = (r: LoadingRule) => {
    setEditing(r);
    if (!cases) impactCases().then(setCases).catch(() => setCases([]));
  };
  const saveRules = async (list: LoadingRule[], reason: string) => {
    for (const r of list) await vem.saveLoadingRule(r, reason);
    await refresh();
    setMsg(`✓ ${list.length > 1 ? `${list.length} règles enregistrées` : 'Règle enregistrée'}`);
  };
  const promotions = useMemo(() => promotionProposals(rules, obs), [rules, obs]);
  const pending = useMemo(() => {
    const updated = new Map<string, string>();
    for (const r of rows) if (!updated.has(r.data.article) || updated.get(r.data.article)! < r.updatedAt) updated.set(r.data.article, r.updatedAt);
    return pendingQuestions(obs, updated);
  }, [obs, rows]);
  const importFile = async (file: File) => {
    const parsed = JSON.parse(await file.text()) as { rules?: LoadingRule[] };
    const list = (parsed.rules ?? []).filter((r) => r && typeof r.key === 'string' && typeof r.article === 'string');
    if (!list.length) throw new Error('Aucune règle dans ce fichier');
    if (!window.confirm(`Importer ${list.length} règle(s) ? Chacune remplace la règle de même clé (historique gardé).`)) return;
    for (const r of list) await vem.saveLoadingRule({ ...r, version: r.version ?? 1 }, `import JSON ${file.name}`);
    await refresh();
    setMsg(`✓ ${list.length} règle(s) importée(s)`);
  };
  const active = rules.filter((r) => r.active);

  return (
    <div className="page">
      <div className="card">
        <div className="card-head">
          <h2>Règles de loading</h2>
          <span className="hint">
            Partagées entre tous les projets. Base de départ : {SEED_META.classeur}. {active.length} règles actives · version {version}.
            {canEdit ? '' : ' Lecture seule (modification : admin, responsable technique).'}
          </span>
        </div>
        <div className="card-body row">
          <nav className="tabs">
            <button className={`tab ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>
              Règles ({rules.length})
            </button>
            <button className={`tab ${tab === 'catalogue' ? 'active' : ''}`} onClick={() => setTab('catalogue')}>
              Catalogue ({catalogue.length})
            </button>
            <button className={`tab ${tab === 'decisions' ? 'active' : ''}`} onClick={() => setTab('decisions')}>
              Décisions et observations
            </button>
          </nav>
          <div className="spacer" style={{ flex: 1 }} />
          {msg && <span className="hint">{msg}</span>}
          <button
            className="btn small"
            onClick={() => downloadText(`regles-loading-${version}.json`, JSON.stringify({ version, rules, catalogue }, null, 2), 'application/json')}
          >
            ⬇ Exporter (JSON)
          </button>
          <button
            className="btn small"
            onClick={() =>
              downloadBlob(
                `VIEWBOX_regles_loading_${version}.xlsx`,
                new Blob([classeurXlsx(rules, catalogue, { version, date: new Date().toLocaleDateString('fr-BE'), decisions: SEED_DECISIONS }) as Uint8Array<ArrayBuffer>], {
                  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                }),
              )
            }
          >
            ⬇ Classeur Excel
          </button>
          {canEdit && (
            <label className="btn small">
              ⬆ Importer (JSON)
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) importFile(f).catch((err: Error) => setMsg(`✗ ${err.message}`));
                }}
              />
            </label>
          )}
        </div>
      </div>
      {tab === 'rules' && (promotions.length > 0 || pending.size > 0) && (
        <div className="card">
          <div className="card-head">
            <h2>À regarder</h2>
            <span className="hint">Calage automatique et questions laissées en attente sur les chantiers.</span>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 6 }}>
            {promotions.map((p) => (
              <div key={p.rule.key} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="badge ok">juste 2 fois de suite</span>
                <b>{p.rule.article}</b> {describeRule(p.rule, catMap)}
                <span className="hint">({p.hits.map((h) => `${h.predicted}`).join(', ')})</span>
                <button
                  className="btn small primary"
                  disabled={!canEdit}
                  onClick={() => void saveRules([{ ...p.rule, confidence: 'confirme' }], `juste sur ${p.hits.length} chantiers de suite : passée confirmée`).catch((e: Error) => setMsg(`✗ ${e.message}`))}
                >
                  Passer « confirmée »
                </button>
              </div>
            ))}
            {[...pending].map(([article, os]) => (
              <div key={article} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="badge orange">❓ question en attente</span>
                <b>{article}</b> {catMap.get(article)?.designation ?? ''} <span className="hint">— {os.map((o) => o.note).join(' ; ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'rules' && <RulesTable rules={rules} catMap={catMap} canEdit={canEdit} onEdit={edit} onSave={saveRules} />}
      {editing && (
        <RuleValidation
          title="Modifier la règle"
          draft={editing}
          rules={rules}
          catalogue={catMap}
          observations={SEED_OBSERVATIONS}
          cases={cases}
          canEdit={canEdit}
          onSave={async (list, reason) => {
            try {
              await saveRules(list, reason);
              setEditing(null);
            } catch (e) {
              setMsg(`✗ ${(e as Error).message}`);
            }
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {tab === 'catalogue' && (
        <CatalogueTable
          catalogue={catalogue}
          rules={rules}
          canEdit={canEdit}
          onSave={async (item) => {
            try {
              const { ref, designation, ...data } = item;
              await vem.saveLoadingCatalogue({ ref, designation, data });
              await refresh();
              setMsg(`✓ ${ref} ajoutée au catalogue`);
            } catch (e) {
              setMsg(`✗ ${(e as Error).message}`);
            }
          }}
        />
      )}
      {tab === 'decisions' && <Decisions />}
    </div>
  );
}

function RulesTable({
  rules,
  catMap,
  canEdit,
  onEdit,
  onSave,
}: {
  rules: EffectiveRule[];
  catMap: Map<string, CatalogueItem>;
  canEdit: boolean;
  onEdit: (r: LoadingRule) => void;
  onSave: (rules: LoadingRule[], reason: string) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [conf, setConf] = useState<Confidence | ''>('');
  const [cat, setCat] = useState<LoadingCategory | ''>('');
  const [status, setStatus] = useState<Status>('active');
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, LoadingHistoryRow[] | 'erreur'>>({});
  const list = rules.filter((r) => {
    if (conf && r.confidence !== conf) return false;
    if (cat && (catMap.get(r.article)?.categorie ?? 'structure') !== cat) return false;
    if (status === 'active' && !r.active) return false;
    if (status === 'inactive' && r.active) return false;
    if (status === 'conflict' && !(r.active && r.conflict)) return false;
    if (!q) return true;
    const text = `${r.key} ${r.article} ${catMap.get(r.article)?.designation ?? r.articleName ?? ''} ${r.remark ?? ''} ${describeRule(r, catMap)}`.toLowerCase();
    return text.includes(q.toLowerCase());
  });
  const toggle = (key: string) => {
    setOpen(open === key ? null : key);
    if (open !== key && !history[key])
      vem
        .loadingRuleHistory(key)
        .then((h) => setHistory((x) => ({ ...x, [key]: h })))
        .catch(() => setHistory((x) => ({ ...x, [key]: 'erreur' })));
  };
  const conflicts = rules.filter((r) => r.active && r.conflict).length;
  return (
    <div className="card">
      <div className="card-body row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} style={{ width: 200 }}>
          <option value="active">Règles actives</option>
          <option value="conflict">Contradictions à trancher ({conflicts})</option>
          <option value="inactive">Remplacées / doublons</option>
          <option value="">Toutes</option>
        </select>
        <select value={conf} onChange={(e) => setConf(e.target.value as Confidence | '')} style={{ width: 170 }}>
          <option value="">Toute confiance</option>
          {(Object.keys(CONFIDENCE_LABEL) as Confidence[]).map((c) => (
            <option key={c} value={c}>
              {CONFIDENCE_LABEL[c]}
            </option>
          ))}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value as LoadingCategory | '')} style={{ width: 210 }}>
          <option value="">Toutes catégories</option>
          {LOADING_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input type="text" style={{ width: 260 }} placeholder="Réf., désignation, chantier…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="hint">{list.length} règle(s)</span>
      </div>
      <div className="card-body">
        <table className="list">
          <thead>
            <tr>
              <th>Article</th>
              <th>Règle</th>
              <th>Confiance</th>
              <th>Origine</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <Fragment key={r.key}>
                <tr style={{ opacity: r.active ? 1 : 0.5, cursor: 'pointer' }} onClick={() => toggle(r.key)}>
                  <td>
                    {open === r.key ? '▾' : '▸'} <b>{r.article}</b> <span className="hint">{catMap.get(r.article)?.designation ?? r.articleName ?? ''}</span>
                  </td>
                  <td>{describeRule(r, catMap)}</td>
                  <td>
                    <span className={`badge ${CONF_BADGE[r.confidence]}`}>{CONFIDENCE_LABEL[r.confidence]}</span>
                    {r.active && r.conflict && (
                      <span className="badge ko" title="Contredit une autre règle du même article : à trancher" style={{ marginLeft: 4 }}>
                        contradiction
                      </span>
                    )}
                    {!r.active && <span className="hint"> {r.supersededBy ? 'remplacée' : 'désactivée'}</span>}
                  </td>
                  <td className="hint">{ORIGIN_LABEL[r.origin2]}</td>
                </tr>
                {open === r.key && (
                  <tr>
                    <td colSpan={4}>
                      <RuleDetail
                        rule={r}
                        history={history[r.key]}
                        canEdit={canEdit}
                        onEdit={() => onEdit(r)}
                        onRevert={async (data, reason) => {
                          await (data ? onSave([data], reason) : vem.resetLoadingRule(r.key, reason).then(() => onSave([], reason)));
                          setHistory((x) => {
                            const n = { ...x };
                            delete n[r.key];
                            return n;
                          });
                          setOpen(null);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RuleDetail({
  rule: r,
  history,
  canEdit,
  onEdit,
  onRevert,
}: {
  rule: EffectiveRule;
  history?: LoadingHistoryRow[] | 'erreur';
  canEdit: boolean;
  onEdit: () => void;
  onRevert: (data: LoadingRule | null, reason: string) => Promise<void>;
}) {
  const [err, setErr] = useState('');
  const revert = (data: LoadingRule | null, label: string) => {
    if (!window.confirm(`${label} ?`)) return;
    onRevert(data, label).catch((e: Error) => setErr(e.message));
  };
  return (
    <div style={{ padding: '6px 12px', display: 'grid', gap: 6 }}>
      {canEdit && (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={onEdit}>
            ✎ Modifier la règle
          </button>
          {r.origin2 === 'override' && (
            <button className="btn small ghost" onClick={() => revert(null, 'Revenir à la règle du classeur')}>
              ↺ Revenir au classeur
            </button>
          )}
          {err && <span className="hint">✗ {err}</span>}
        </div>
      )}
      <div className="hint">
        Clé <code>{r.key}</code> · {COUNTING_BASE_LABEL[r.per]} · genre {r.kind} · version {r.version}
        {r.origin?.length ? ` · classeur : ${r.origin.map((o) => `${o.sheet} ligne ${o.row}`).join(', ')}` : ''}
        {r.supersededBy ? ` · remplacée par ${r.supersededBy}` : ''}
        {r.conflict ? ` · contradiction avec ${r.conflict === r.key ? 'la ou les règles suivantes du même article' : r.conflict}` : ''}
      </div>
      {r.remark && <div style={{ whiteSpace: 'pre-wrap' }}>{r.remark.replace(/\s*\|\|\s*/g, '\n')}</div>}
      {r.calibration.length > 0 && (
        <div>
          <b>Points de calage</b>
          <ul style={{ margin: '2px 0 0 18px' }}>
            {r.calibration.map((c, i) => (
              <li key={i}>
                {c.chantier}
                {c.bordereau ? ` (${c.bordereau})` : ''} : {c.note ?? `prédit ${c.predit ?? '?'}, livré ${c.livre ?? '?'}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <b>Historique</b>{' '}
        {history === undefined ? (
          <span className="hint">chargement…</span>
        ) : history === 'erreur' ? (
          <span className="hint">indisponible</span>
        ) : history.length === 0 ? (
          <span className="hint">jamais modifiée dans l’app (base de départ du classeur)</span>
        ) : (
          <ul style={{ margin: '2px 0 0 18px' }}>
            {history.map((h) => (
              <li key={h.id}>
                v{h.version} — {new Date(h.createdAt).toLocaleString('fr-BE')} — {h.source}
                {h.reason ? ` : ${h.reason}` : ''}
                {canEdit && h.after && h.version !== r.version ? (
                  <button className="btn small ghost" onClick={() => revert({ ...(h.after as LoadingRule) }, `Revenir à la version ${h.version}`)}>
                    ↺ revenir à cette version
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CatalogueTable({
  catalogue,
  rules,
  canEdit,
  onSave,
}: {
  catalogue: CatalogueItem[];
  rules: EffectiveRule[];
  canEdit: boolean;
  onSave: (item: CatalogueItem) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<CatalogueItem | null>(null);
  const known = new Set(catalogue.map((c) => c.ref));
  // réfs que le classeur demande d'ajouter + réfs utilisées par une règle active et absentes du catalogue
  const missing = [...new Set([...SEED_CATALOGUE_TO_ADD, ...rules.filter((r) => r.active && /^\d-\d{3}-\d{3,5}$/.test(r.article)).map((r) => r.article)])].filter(
    (ref) => !known.has(ref),
  );
  const nameFor = (ref: string) => rules.find((r) => r.article === ref && r.articleName)?.articleName ?? '';
  const list = catalogue.filter((c) => !q || `${c.ref} ${c.designation}`.toLowerCase().includes(q.toLowerCase()));
  const start = (ref: string) =>
    setDraft({ ref, designation: nameFor(ref), gros: false, categorie: 'structure', unit: 'pce', source: 'ajout' });
  return (
    <>
      {missing.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Références à ajouter au catalogue ({missing.length})</h2>
            <span className="hint">Utilisées par des règles ou signalées par le classeur, mais absentes de Catalogue_ref.</span>
          </div>
          <div className="card-body row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {missing.map((ref) => (
              <button key={ref} className="btn small" disabled={!canEdit} onClick={() => start(ref)} title={nameFor(ref)}>
                ＋ {ref}
              </button>
            ))}
            <button className="btn small ghost" disabled={!canEdit} onClick={() => start('')}>
              ＋ Autre référence…
            </button>
          </div>
          {draft && (
            <div className="card-body" style={{ display: 'grid', gap: 6, maxWidth: 720 }}>
              <label>
                Référence{' '}
                <input type="text" value={draft.ref} onChange={(e) => setDraft({ ...draft, ref: e.target.value.trim() })} style={{ width: 140 }} />
              </label>
              <label>
                Désignation{' '}
                <input type="text" value={draft.designation} onChange={(e) => setDraft({ ...draft, designation: e.target.value })} style={{ width: 520 }} />
              </label>
              <div className="row" style={{ gap: 12 }}>
                <label>
                  Catégorie{' '}
                  <select value={draft.categorie} onChange={(e) => setDraft({ ...draft, categorie: e.target.value as LoadingCategory })}>
                    {LOADING_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unité{' '}
                  <select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as CatalogueItem['unit'] })}>
                    <option value="pce">pièce</option>
                    <option value="m">mètre</option>
                    <option value="m2">m²</option>
                    <option value="L">litre</option>
                  </select>
                </label>
                <label>
                  <input type="checkbox" checked={draft.gros} onChange={(e) => setDraft({ ...draft, gros: e.target.checked })} /> visible dans la 3D (gros produit)
                </label>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn primary small"
                  disabled={!/^\d-\d{3}-\d{3,5}$/.test(draft.ref) || !draft.designation.trim()}
                  onClick={() => void onSave(draft).then(() => setDraft(null))}
                >
                  Ajouter au catalogue
                </button>
                <button className="btn small ghost" onClick={() => setDraft(null)}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="card">
        <div className="card-body row">
          <input type="text" style={{ width: 300 }} placeholder="Rechercher une référence…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="hint">{list.length} référence(s)</span>
        </div>
        <div className="card-body">
          <table className="list">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th>Catégorie</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.ref}>
                  <td>
                    <b>{c.ref}</b>
                  </td>
                  <td>{c.designation}</td>
                  <td className="hint">{LOADING_CATEGORIES.find((x) => x.key === c.categorie)?.label}</td>
                  <td className="hint">
                    {[
                      c.gros ? 'visible en 3D' : '',
                      c.vitrage ? `vitrage ${c.vitrage}` : '',
                      c.pieds ? `${c.pieds.total} pieds` : '',
                      c.plaque ? `plaque ${c.plaque.l} × ${c.plaque.w}` : '',
                      c.hvac ? 'airco / HVAC' : '',
                      c.unit !== 'pce' ? `unité ${c.unit}` : '',
                      c.source === 'ajout' ? 'ajoutée dans l’app' : '',
                      c.source === 'odoo' ? 'ajoutée depuis Odoo' : '',
                      !c.odoo && !c.inclusDans ? 'pas dans Odoo' : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Decisions() {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Décisions appliquées par-dessus le classeur</h2>
          <span className="hint">Chaque réponse d’Amaury est datée et tracée (docs/loading/rapport-import.md).</span>
        </div>
        <div className="card-body">
          <ul style={{ margin: '0 0 0 18px', display: 'grid', gap: 6 }}>
            {SEED_DECISIONS.map((d) => (
              <li key={d.id}>
                <b>
                  {d.date} — {d.by}
                </b>{' '}
                : {d.text}
                {!d.applied && <span className="badge ko"> partiellement appliquée</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Valeurs observées sans règle (régime connecté, à re-caler)</h2>
          <span className="hint">Cellules mauves du classeur : en box connectées, ces articles sortent en « règle manquante » avec ces valeurs pour repère.</span>
        </div>
        <div className="card-body">
          <table className="list">
            <tbody>
              {SEED_OBSERVATIONS.map((o) => (
                <tr key={o.key}>
                  <td>
                    <b>{o.article}</b> <span className="hint">{o.articleName}</span>
                  </td>
                  <td>{o.valeur}</td>
                  <td className="hint">
                    {o.chantier} — {o.contexte}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
