// Étape 6 « Chantier réel » : la liste de ce qui est vraiment parti (bordereau Excel, export Odoo, CSV, ou texte copié
// du PDF du bon de livraison) est lue, ses colonnes devinées (corrigeables, choix mémorisé par type de fichier), puis
// rapprochée de la loading liste ligne à ligne : ✔ identique · ↕ quantité différente · ➕ seulement dans le réel ·
// ➖ seulement dans la liste, avec un score. Chaque écart reçoit une proposition de classement que l'utilisateur
// confirme ou change (règle à revoir → écran de validation des règles ; seulement ce chantier ; erreur du 3D ; erreur
// du bordereau ; je ne sais pas encore). « Enregistrer » garde le rapprochement et les observations ; « Ajouter comme
// banc » (admin, responsable technique) en fait un chantier de référence rejoué à chaque nouvelle règle.
import { useEffect, useMemo, useState } from 'react';
import type { CatalogueItem, LoadingRule } from '../../loading/core/types';
import type { LoadingList } from '../../loading/engine/generate';
import type { ColumnMap, ParsedRealList, RealTable } from '../../loading/reconcile/parseRealList';
import { applySavedMap, bestTable, extractRealLines, guessColumns, headerSignature, tableFromText, tablesFromWorkbook } from '../../loading/reconcile/parseRealList';
import type { GapDecision, ReconKind, ReconRow, StoredReconciliation } from '../../loading/reconcile/reconcile';
import { DECISION_LABEL, RECON_ICON, RECON_LABEL, reconcile } from '../../loading/reconcile/reconcile';
import { colName, readXlsx } from '../../loading/xlsx/read';

const MAP_KEY = 'vem_loading_colmap';
const KIND_COLOR: Record<ReconKind, string> = {
  identique: 'var(--ok)',
  plus: 'var(--warn)',
  moins: 'var(--warn)',
  a_determiner: 'var(--text-dim)',
  reel_seul: 'var(--danger)',
  prediction_seule: 'var(--danger)',
};
const DECISIONS: GapDecision[] = ['regle', 'chantier', 'erreur_3d', 'erreur_bordereau', 'inconnu'];

function savedMaps(): Record<string, ColumnMap> {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') as Record<string, ColumnMap>;
  } catch {
    return {};
  }
}
function rememberMap(sig: string, map: ColumnMap) {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify({ ...savedMaps(), [sig]: map }));
  } catch {
    /* navigation privée : pas mémorisé */
  }
}

const q = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(Math.round(n * 1000) / 1000).replace('.', ','));

interface Source {
  fileName: string;
  tables: RealTable[];
  table: number;
  /** null = texte libre */
  map: ColumnMap | null;
}

export interface ReconcileStepProps {
  list: LoadingList;
  computed: LoadingList;
  catalogue: ReadonlyMap<string, CatalogueItem>;
  rules: readonly LoadingRule[];
  stored: StoredReconciliation | null;
  canEdit: boolean;
  canSave: boolean;
  busy: string;
  /** nom proposé pour le banc (« 6072ROACEVIE OACE Ice cube ») */
  benchName: string;
  onSave: (rec: StoredReconciliation) => Promise<void>;
  onBench: (rec: StoredReconciliation, name: string) => Promise<void>;
  /** « Règle à revoir » → écran de validation des règles avec la quantité réelle comme cible */
  onRule: (article: string, computed: number | null, real: number) => void;
  selected: { ids: string[]; label: string } | null;
  onSelect: (s: { ids: string[]; label: string } | null) => void;
}

export function ReconcileStep(p: ReconcileStepProps) {
  const [src, setSrc] = useState<Source | null>(null);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');
  const [decisions, setDecisions] = useState<Record<string, GapDecision>>(p.stored?.decisions ?? {});
  const [filter, setFilter] = useState<ReconKind | 'ecarts' | ''>('ecarts');
  const [benchName, setBenchName] = useState<string | null>(null);
  useEffect(() => setDecisions(p.stored?.decisions ?? {}), [p.stored]);

  const load = (fileName: string, tables: RealTable[]) => {
    if (!tables.length) throw new Error('Rien à lire dans ce fichier');
    const table = bestTable(tables);
    const t = tables[table];
    const guess = guessColumns(t);
    const saved = guess ? applySavedMap(t, savedMaps()[headerSignature(t, guess)]) : null;
    // une seule colonne (texte copié d'un PDF) : lecture ligne par ligne
    const width = Math.max(0, ...t.rows.map((r) => r.length));
    setSrc({ fileName, tables, table, map: width <= 1 ? null : (saved ?? guess) });
    setErr('');
  };
  const readFile = async (f: File) => {
    try {
      const name = f.name.toLowerCase();
      if (name.endsWith('.xls')) throw new Error('Ancien format Excel (.xls) : l’enregistrer en .xlsx, ou copier les lignes et les coller ci-dessous');
      if (name.endsWith('.pdf')) throw new Error('PDF : ouvrir le bon de livraison, tout sélectionner, copier, puis coller le texte ci-dessous');
      if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) load(f.name, tablesFromWorkbook(readXlsx(await f.arrayBuffer())));
      else load(f.name, [tableFromText(await f.text(), f.name)]);
    } catch (e) {
      setErr(`✗ ${(e as Error).message}`);
    }
  };

  const parsed: ParsedRealList | null = useMemo(() => {
    if (!src) return null;
    return extractRealLines(src.tables[src.table], src.map);
  }, [src]);
  // lignes réelles : celles lues à l'instant, sinon celles du rapprochement enregistré
  const real = parsed?.lines ?? p.stored?.real ?? null;
  const rec = useMemo(
    () => (real ? reconcile(p.list, real, { computed: p.computed, catalogue: p.catalogue, rules: p.rules }) : null),
    [real, p.list, p.computed, p.catalogue, p.rules],
  );
  const gaps = rec ? rec.rows.filter((r) => r.kind !== 'identique') : [];
  const decided = gaps.filter((r) => decisions[r.article]).length;
  const current = (): StoredReconciliation | null => {
    if (!rec || !real) return null;
    const keep = Object.fromEntries(Object.entries(decisions).filter(([a]) => gaps.some((g) => g.article === a)));
    return {
      fileName: src?.fileName ?? p.stored?.fileName ?? '',
      picking: parsed?.picking ?? p.stored?.picking,
      table: src ? src.tables[src.table].name : p.stored?.table,
      columnMap: src ? src.map : (p.stored?.columnMap ?? null),
      real,
      ignored: parsed?.ignored ?? p.stored?.ignored ?? [],
      decisions: keep,
      score: rec.score,
      identical: rec.identical,
      total: rec.total,
    };
  };
  const dirty = !!src || JSON.stringify(decisions) !== JSON.stringify(p.stored?.decisions ?? {});

  const t = src?.tables[src.table];
  const width = t ? Math.max(0, ...t.rows.map((r) => r.length)) : 0;
  const colLabel = (i: number) => {
    const h = t && src?.map && src.map.headerRow >= 0 ? t.rows[src.map.headerRow][i] : '';
    return `${colName(i)}${h ? ` — ${h}` : ''}`;
  };
  const setMap = (m: Partial<ColumnMap>) => {
    if (!src || !t) return;
    const base: ColumnMap = src.map ?? guessColumns(t) ?? { headerRow: -1, ref: 0, qty: Math.min(1, width - 1) };
    const next = { ...base, ...m };
    for (const k of ['designation', 'unit'] as const) if ((next[k] ?? -1) < 0) delete next[k];
    rememberMap(headerSignature(t, next), next);
    setSrc({ ...src, map: next });
  };
  const rows = rec ? rec.rows.filter((r) => (filter === 'ecarts' ? r.kind !== 'identique' : !filter || r.kind === filter)) : [];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Liste réelle</h2>
          <span className="hint">Ce qui est vraiment parti à l’entrepôt : bordereau Excel, export Odoo, CSV, ou texte copié du bon de livraison.</span>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          {p.stored && !src && (
            <div data-testid="recon-stored">
              <span className="badge ok">✔ Rapproché</span> {p.stored.fileName}
              {p.stored.picking ? ` · bon ${p.stored.picking}` : ''}
              {p.stored.at ? ` · le ${new Date(p.stored.at).toLocaleDateString('fr-BE')}` : ''} · {p.stored.score} (au moment de l’enregistrement)
            </div>
          )}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <label className="btn primary">
              📄 {p.stored || src ? 'Lire un autre fichier' : 'Lire le fichier de la liste réelle'}
              <input
                type="file"
                data-testid="recon-file"
                accept=".xlsx,.xlsm,.csv,.txt,.xls,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void readFile(f);
                }}
              />
            </label>
            {src && (
              <button className="btn small ghost" onClick={() => setSrc(null)}>
                Annuler la lecture
              </button>
            )}
          </div>
          <details>
            <summary className="hint">… ou coller la liste (copiée du PDF du bon de livraison ou d’Excel)</summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              <textarea
                rows={6}
                data-testid="recon-paste"
                value={paste}
                placeholder={'[4-700-065] RUBBER VERTICAL … 20,00 Units\n[7-962-016] VIEWBOX STANDARD … 4,00 Units'}
                onChange={(e) => setPaste(e.target.value)}
              />
              <div>
                <button className="btn small" disabled={!paste.trim()} onClick={() => load('Texte collé', [tableFromText(paste)])}>
                  Lire le texte collé
                </button>
              </div>
            </div>
          </details>
          {err && <div className="error-box">{err}</div>}
        </div>
      </div>

      {src && t && (
        <div className="card">
          <div className="card-head">
            <h2>Colonnes</h2>
            <span className="hint">
              {src.fileName}
              {parsed?.picking ? ` · bon ${parsed.picking}` : ''} · devinées, à corriger si besoin (choix retenu pour ce type de fichier)
            </span>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 8 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {src.tables.length > 1 && (
                <label>
                  Feuille{' '}
                  <select value={src.table} onChange={(e) => {
                    const i = Number(e.target.value);
                    const nt = src.tables[i];
                    setSrc({ ...src, table: i, map: guessColumns(nt) });
                  }}>
                    {src.tables.map((x, i) => (
                      <option key={i} value={i}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <input type="checkbox" checked={!src.map} disabled={width <= 1} onChange={(e) => setSrc({ ...src, map: e.target.checked ? null : (guessColumns(t) ?? { headerRow: -1, ref: 0, qty: 1 }) })} /> Texte libre (une ligne = une ligne du bon)
              </label>
            </div>
            {src.map && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }} data-testid="recon-columns">
                <label>
                  En-tête ligne{' '}
                  <input type="number" min={0} max={t.rows.length} style={{ width: 60 }} value={src.map.headerRow + 1} onChange={(e) => setMap({ headerRow: Math.max(-1, Number(e.target.value) - 1) })} />
                </label>
                {(['ref', 'qty', 'designation', 'unit'] as const).map((k) => (
                  <label key={k}>
                    {{ ref: 'Référence', qty: 'Quantité', designation: 'Désignation', unit: 'Unité' }[k]}{' '}
                    <select value={src.map![k] ?? -1} onChange={(e) => setMap({ [k]: Number(e.target.value) })}>
                      {(k === 'designation' || k === 'unit') && <option value={-1}>—</option>}
                      {[...Array(width).keys()].map((i) => (
                        <option key={i} value={i}>
                          {colLabel(i)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            {parsed && (
              <div className="hint" data-testid="recon-read">
                {parsed.lines.length} référence(s) lue(s)
                {parsed.ignored.length > 0 && (
                  <details style={{ display: 'inline' }}>
                    <summary style={{ display: 'inline', cursor: 'pointer' }}> · {parsed.ignored.length} ligne(s) laissée(s) de côté</summary>
                    <ul style={{ margin: '2px 0 0 18px' }}>
                      {parsed.ignored.slice(0, 50).map((i) => (
                        <li key={i.row}>
                          ligne {i.row + 1} ({i.reason}) : {i.text.slice(0, 140)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {!parsed?.lines.length && <div className="error-box">Aucune référence lue : choisir la colonne des références et celle des quantités.</div>}
          </div>
        </div>
      )}

      {rec && (
        <div className="card">
          <div className="card-head" style={{ flexWrap: 'wrap' }}>
            <h2>Rapprochement</h2>
            <span data-testid="recon-score">
              <b>{rec.score}</b>
            </span>
            <span className="hint">
              {decided} / {gaps.length} écart(s) classé(s)
            </span>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 8 }}>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className={`btn small ${filter === 'ecarts' ? 'primary' : 'ghost'}`} onClick={() => setFilter('ecarts')}>
                Écarts ({gaps.length})
              </button>
              {(['identique', 'plus', 'moins', 'a_determiner', 'reel_seul', 'prediction_seule'] as ReconKind[])
                .filter((k) => rec.counts[k])
                .map((k) => (
                  <button key={k} className={`btn small ${filter === k ? 'primary' : 'ghost'}`} onClick={() => setFilter(filter === k ? '' : k)}>
                    <span style={{ color: KIND_COLOR[k] }}>{RECON_ICON[k]}</span> {RECON_LABEL[k]} ({rec.counts[k]})
                  </button>
                ))}
              <button className={`btn small ${filter === '' ? 'primary' : 'ghost'}`} onClick={() => setFilter('')}>
                Tout ({rec.rows.length})
              </button>
            </div>
            {gaps.some((g) => g.suggestion && !decisions[g.article]) && (
              <div>
                <button
                  className="btn small"
                  onClick={() =>
                    setDecisions((d) => {
                      const next = { ...d };
                      for (const g of gaps) if (g.suggestion && !next[g.article]) next[g.article] = g.suggestion.decision;
                      return next;
                    })
                  }
                >
                  Reprendre les propositions pour les écarts non classés
                </button>
              </div>
            )}
            <table className="list" data-testid="recon-rows">
              <thead>
                <tr>
                  <th />
                  <th>Référence</th>
                  <th style={{ textAlign: 'right' }}>Liste</th>
                  <th style={{ textAlign: 'right' }}>Réel</th>
                  <th style={{ textAlign: 'right' }}>Écart</th>
                  <th>Classement</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row
                    key={r.article}
                    r={r}
                    decision={decisions[r.article]}
                    selected={p.selected?.label.startsWith(r.article) ?? false}
                    onSelect={() => p.onSelect(r.sources.length ? { ids: r.sources, label: `${r.article} ${r.designation}` } : null)}
                    onDecide={(d) =>
                      setDecisions((x) => {
                        const next = { ...x };
                        if (d) next[r.article] = d;
                        else delete next[r.article];
                        return next;
                      })
                    }
                    onRule={() => p.onRule(r.article, r.computed, r.real ?? 0)}
                  />
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="hint">
                      Rien dans ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn primary"
                data-testid="recon-save"
                disabled={!p.canSave || !!p.busy || !dirty}
                title={p.canSave ? '' : 'Modèle sans version en ligne'}
                onClick={() => {
                  const c = current();
                  if (c) void p.onSave(c).then(() => setSrc(null));
                }}
              >
                💾 Enregistrer le rapprochement
              </button>
              {p.canEdit &&
                (benchName === null ? (
                  <button className="btn" disabled={!!p.busy} onClick={() => setBenchName(p.benchName)}>
                    ➕ Ajouter comme banc d’étalonnage
                  </button>
                ) : (
                  <span className="row" style={{ gap: 6 }}>
                    <input type="text" value={benchName} style={{ width: 260 }} onChange={(e) => setBenchName(e.target.value)} data-testid="recon-bench-name" />
                    <button
                      className="btn primary small"
                      disabled={!benchName.trim() || !!p.busy}
                      onClick={() => {
                        const c = current();
                        if (c) void p.onBench(c, benchName.trim()).then(() => setBenchName(null));
                      }}
                    >
                      Ajouter le banc
                    </button>
                    <button className="btn small ghost" onClick={() => setBenchName(null)}>
                      Annuler
                    </button>
                  </span>
                ))}
              {p.busy && <span className="hint">{p.busy}</span>}
            </div>
            <div className="hint">
              Enregistrer garde le rapprochement et, pour chaque ligne identique et chaque écart classé, le calculé et le réel (calage des règles,
              questions en attente). Un banc d’étalonnage est rejoué à chaque nouvelle règle (écran de validation, Réglages › Règles de loading ›
              Bancs) ; « seulement ce chantier » y devient une correction du banc, les autres classements des écarts connus.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  r,
  decision,
  selected,
  onSelect,
  onDecide,
  onRule,
}: {
  r: ReconRow;
  decision: GapDecision | undefined;
  selected: boolean;
  onSelect: () => void;
  onDecide: (d: GapDecision | null) => void;
  onRule: () => void;
}) {
  return (
    <tr className={selected ? 'selected' : ''} data-article={r.article} data-kind={r.kind} data-real={r.real ?? ''}>
      <td style={{ color: KIND_COLOR[r.kind], fontWeight: 700 }} title={RECON_LABEL[r.kind]}>
        {RECON_ICON[r.kind]}
      </td>
      <td style={{ cursor: r.sources.length ? 'pointer' : undefined }} onClick={onSelect}>
        <b>{r.article}</b> <span className="hint">{r.designation}</span>
        {r.detail && <div className="hint" style={{ fontSize: 11 }}>{r.detail}</div>}
        {r.computed !== r.listed && <div className="hint" style={{ fontSize: 11 }}>calculé par les règles : {q(r.computed)} (corrigé pour ce chantier)</div>}
        {r.known && <div className="hint" style={{ fontSize: 11 }}>écart connu : {r.known}</div>}
      </td>
      <td style={{ textAlign: 'right' }}>{q(r.listed)}</td>
      <td style={{ textAlign: 'right' }}>{q(r.real)}</td>
      <td style={{ textAlign: 'right' }}>{r.delta === null ? '' : r.delta > 0 ? `+${q(r.delta)}` : q(r.delta)}</td>
      <td style={{ minWidth: 220 }}>
        {r.kind === 'identique' ? (
          <span className="hint">point de calage</span>
        ) : (
          <div style={{ display: 'grid', gap: 3 }}>
            <select value={decision ?? ''} onChange={(e) => onDecide((e.target.value || null) as GapDecision | null)} data-testid="recon-decision">
              <option value="">— à classer —</option>
              {DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {DECISION_LABEL[d]}
                  {r.suggestion?.decision === d ? ' (proposé)' : ''}
                </option>
              ))}
            </select>
            {r.suggestion && (
              <span className="hint" style={{ fontSize: 11 }}>
                Proposé : {DECISION_LABEL[r.suggestion.decision].toLowerCase()} — {r.suggestion.why}
              </span>
            )}
            {decision === 'regle' && r.real !== null && (
              <button className="btn small" onClick={onRule}>
                Revoir la règle (cible {q(r.real)})…
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
