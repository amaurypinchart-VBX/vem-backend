// Écran de validation d'une règle (§ 7) : la règle en français, où elle s'applique, les bases proposées par inferBase
// (ou saisie à la main), les règles qui la contredisent et le choix (remplacer / ajouter une condition / garder les
// deux), l'impact rejoué sur les bancs et les listes validées, la raison ; puis Valider / Annuler. Rien n'est
// enregistré sans « Valider » ; réservé à admin et responsable technique.
import { useEffect, useMemo, useState } from 'react';
import type { CatalogueItem, Confidence, CountingBase, LoadingRule, RuleConditions, SeedObservation, Spare } from '../../loading/core/types';
import { CONFIDENCE_LABEL, COUNTING_BASE_LABEL } from '../../loading/core/types';
import { describeRule } from '../../loading/core/describe';
import type { BaseCandidate } from '../../loading/learning/inferBase';
import type { ConflictChoice, Scope } from '../../loading/learning/proposal';
import { conflictsFor, resolveConflicts } from '../../loading/learning/proposal';
import type { ImpactCase } from '../../loading/learning/impact';
import { impactOf, impactSentence } from '../../loading/learning/impact';
import { ruleKey } from '../../loading/library/importClasseur';

const BASES = Object.keys(COUNTING_BASE_LABEL) as CountingBase[];

export interface ValidationProps {
  title: string;
  /** règle de départ (proposée, ou existante à modifier) */
  draft: LoadingRule;
  candidates?: BaseCandidate[];
  /** quantité visée sur ce chantier (correction) */
  target?: number;
  rules: readonly LoadingRule[];
  catalogue: ReadonlyMap<string, CatalogueItem>;
  observations?: readonly SeedObservation[];
  cases: ImpactCase[] | null;
  canEdit: boolean;
  reason?: string;
  onSave: (rules: LoadingRule[], reason: string) => Promise<void>;
  onCancel: () => void;
}

const scopeOf = (w?: RuleConditions): Scope => (w?.regime === 'standalone' ? 'standalone' : w?.regime === 'connecte' ? 'connecte' : 'toujours');

export function RuleValidation(p: ValidationProps) {
  const [rule, setRule] = useState<LoadingRule>(p.draft);
  const [manual, setManual] = useState(!p.candidates?.length);
  const [cand, setCand] = useState(0);
  const [choice, setChoice] = useState<ConflictChoice>('remplacer');
  const [condScope, setCondScope] = useState<Scope>('connecte');
  const [reason, setReason] = useState(p.reason ?? '');
  const [busy, setBusy] = useState('');
  const isNew = !p.rules.some((r) => r.key === p.draft.key && r.active);
  // une base choisie dans la liste remplace base / quantité / spare / produit déclencheur
  const pick = (i: number) => {
    const c = p.candidates![i];
    setCand(i);
    setManual(false);
    setRule((r) => withKey({ ...r, per: c.per, qty: c.qty, spare: c.spare, trigger: c.trigger ? { articles: [c.trigger] } : {} }));
  };
  const withKey = (r: LoadingRule) => (isNew ? { ...r, key: uniqueKey(ruleKey(r), p.rules) } : r);
  useEffect(() => {
    if (p.candidates?.length && !manual) pick(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (patch: Partial<LoadingRule>) => setRule((r) => withKey({ ...r, ...patch }));
  const setScope = (s: Scope) => {
    const w: RuleConditions = { ...(rule.when ?? {}) };
    delete w.regime;
    if (s !== 'toujours') w.regime = s;
    set({ when: Object.keys(w).length ? w : undefined });
  };
  const conflicts = useMemo(() => conflictsFor(rule, p.rules.filter((r) => r.key !== p.draft.key)), [rule, p.rules, p.draft.key]);
  const toSave = useMemo(() => resolveConflicts(rule, conflicts, choice, condScope === 'toujours' ? {} : { regime: condScope }), [rule, conflicts, choice, condScope]);
  const after = useMemo(() => {
    const changed = new Map(toSave.map((r) => [r.key, r]));
    return [...p.rules.filter((r) => !changed.has(r.key) && r.key !== p.draft.key), ...changed.values()];
  }, [toSave, p.rules, p.draft.key]);
  const impact = useMemo(() => (p.cases ? impactOf(p.cases, p.rules, after, p.catalogue, p.observations, [rule.article]) : null), [p.cases, p.rules, after, p.catalogue, p.observations, rule.article]);
  const worse = impact?.filter((r) => r.worse) ?? [];
  const sp = rule.spare;
  return (
    <div className="modal-backdrop" style={backdrop} onClick={p.onCancel}>
      <div className="card" style={{ maxWidth: 860, width: '96vw', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()} data-testid="rule-validation">
        <div className="card-head">
          <h2>{p.title}</h2>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn small ghost" onClick={p.onCancel}>
            ✕
          </button>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 15 }}>
            <b>{rule.article}</b> {p.catalogue.get(rule.article)?.designation ?? rule.articleName ?? ''}
            <div style={{ marginTop: 4 }} data-testid="rule-sentence">
              {describeRule(rule, p.catalogue)}
            </div>
          </div>
          {p.candidates && p.candidates.length > 0 && (
            <div>
              <b>Ce qui explique {p.target !== undefined ? `les ${p.target}` : 'la quantité'} sur ce chantier</b>
              <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
                {p.candidates.map((c, i) => (
                  <label key={i} className="row" style={{ gap: 6 }}>
                    <input type="radio" checked={!manual && cand === i} onChange={() => pick(i)} />
                    <span>
                      {c.label} <span className="hint">({c.base} ici)</span>
                    </span>
                  </label>
                ))}
                <label className="row" style={{ gap: 6 }}>
                  <input type="radio" checked={manual} onChange={() => setManual(true)} />
                  Autre (saisir la règle)
                </label>
              </div>
            </div>
          )}
          {manual && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <label>
                Quantité{' '}
                <input type="number" step="any" min={0} style={{ width: 80 }} value={rule.qty ?? ''} onChange={(e) => set({ qty: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label>
                par{' '}
                <select value={rule.per} onChange={(e) => set({ per: e.target.value as CountingBase })}>
                  {BASES.map((b) => (
                    <option key={b} value={b}>
                      {COUNTING_BASE_LABEL[b]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                spare{' '}
                <select
                  value={sp?.type === 'pourcent' ? `p${sp.valeur}` : sp?.type === 'fixe' ? `f${sp.valeur}` : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    const s: Spare | undefined = !v ? undefined : v[0] === 'p' ? { type: 'pourcent', valeur: Number(v.slice(1)) } : { type: 'fixe', valeur: Number(v.slice(1)) };
                    set({ spare: s });
                  }}
                >
                  <option value="">aucun</option>
                  {[10, 20, 25, 30, 50].map((x) => (
                    <option key={x} value={`p${x}`}>
                      + {x} %
                    </option>
                  ))}
                  {[1, 2].map((x) => (
                    <option key={x} value={`f${x}`}>
                      + {x}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label>
              Où elle s’applique{' '}
              <select value={scopeOf(rule.when)} onChange={(e) => setScope(e.target.value as Scope)} aria-label="Où elle s’applique">
                <option value="toujours">tous les chantiers</option>
                <option value="standalone">seulement les box seules</option>
                <option value="connecte">seulement les box connectées</option>
              </select>
            </label>
            <label>
              Confiance{' '}
              <select value={rule.confidence} onChange={(e) => set({ confidence: e.target.value as Confidence })}>
                {(['confirme', 'a_confirmer'] as Confidence[]).map((c) => (
                  <option key={c} value={c}>
                    {CONFIDENCE_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {conflicts.length > 0 && (
            <div className="warning warning" style={{ display: 'block' }} data-testid="rule-conflicts">
              <b>Contredit {conflicts.length > 1 ? 'des règles' : 'une règle'} du même article :</b>
              <ul style={{ margin: '4px 0 6px 18px' }}>
                {conflicts.map((c) => (
                  <li key={c.rule.key}>
                    {describeRule(c.rule, p.catalogue)} <span className="hint">({c.rule.key})</span>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'grid', gap: 2 }}>
                <label className="row" style={{ gap: 6 }}>
                  <input type="radio" checked={choice === 'remplacer'} onChange={() => setChoice('remplacer')} /> Remplacer (l’ancienne est désactivée, gardée dans l’historique)
                </label>
                <label className="row" style={{ gap: 6 }}>
                  <input type="radio" checked={choice === 'condition'} onChange={() => setChoice('condition')} /> Ajouter une condition à la nouvelle :{' '}
                  <select value={condScope} onChange={(e) => setCondScope(e.target.value as Scope)} disabled={choice !== 'condition'}>
                    <option value="standalone">seulement les box seules</option>
                    <option value="connecte">seulement les box connectées</option>
                  </select>
                </label>
                <label className="row" style={{ gap: 6 }}>
                  <input type="radio" checked={choice === 'garder'} onChange={() => setChoice('garder')} /> Garder les deux (elles s’additionnent)
                </label>
              </div>
            </div>
          )}
          <div data-testid="rule-impact">
            <b>Impact</b>{' '}
            {!impact ? (
              <span className="hint">calcul…</span>
            ) : (
              <>
                <span>{impactSentence(impact, rule.article)}</span>
                <table className="list" style={{ marginTop: 4 }}>
                  <tbody>
                    {impact
                      .filter((r) => r.changes.length || r.scoreBefore !== r.scoreAfter)
                      .map((r) => (
                        <tr key={r.case.id}>
                          <td>
                            {r.case.kind === 'banc' ? 'Banc' : 'Liste validée'} — {r.case.name}
                          </td>
                          <td className="hint">{r.changes.map((c) => `${c.article} ${c.before ?? '—'} → ${c.after ?? '—'}`).join(' ; ')}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {r.scoreBefore && (
                              <span className={`badge ${r.worse ? 'ko' : r.scoreAfter !== r.scoreBefore ? 'ok' : ''}`}>
                                {r.scoreBefore} → {r.scoreAfter}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {worse.length > 0 && (
                  <div style={{ color: 'var(--danger)', marginTop: 4 }}>
                    ⚠ Cette règle fait reculer {worse.map((w) => `${w.case.name} (${w.scoreBefore} → ${w.scoreAfter})`).join(', ')}. À valider en connaissance de cause.
                  </div>
                )}
              </>
            )}
          </div>
          <label style={{ display: 'grid', gap: 4 }}>
            <b>Pourquoi (gardé dans l’historique)</b>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. 6060 : boulons comptés 13 par jonction" />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn primary"
              disabled={!p.canEdit || !!busy || rule.qty === null || !reason.trim()}
              title={!p.canEdit ? 'Réservé à un admin ou un responsable technique' : !reason.trim() ? 'Écrire pourquoi' : ''}
              onClick={async () => {
                setBusy('Enregistrement…');
                try {
                  await p.onSave(toSave, reason.trim());
                } finally {
                  setBusy('');
                }
              }}
            >
              ✔ Valider la règle
            </button>
            <button className="btn ghost" onClick={p.onCancel}>
              Annuler
            </button>
            {busy && <span className="hint">{busy}</span>}
            {!p.canEdit && <span className="hint">Seuls un admin ou un responsable technique peuvent valider une règle pour tous les projets.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function uniqueKey(key: string, rules: readonly LoadingRule[]): string {
  let k = key;
  for (let n = 2; rules.some((r) => r.key === k && r.active); n++) k = `${key}#${n}`;
  return k;
}

export const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.55)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 50,
};

export function WhyDialog({ article, before, after, canEdit, onChoose, onCancel }: { article: string; before: number | null; after: number; canEdit: boolean; onChoose: (c: 'chantier' | 'regle' | 'inconnu') => void; onCancel: () => void }) {
  return (
    <div style={backdrop} onClick={onCancel}>
      <div className="card" style={{ maxWidth: 560, width: '94vw' }} onClick={(e) => e.stopPropagation()} data-testid="why-dialog">
        <div className="card-head">
          <h2>Pourquoi ?</h2>
          <span className="hint">
            {article} : {before ?? '—'} → {after}
          </span>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          <button className="btn" style={{ textAlign: 'left' }} onClick={() => onChoose('chantier')}>
            <b>Seulement ce chantier</b>
            <div className="hint">Montage atelier, demande du client, stock… La règle ne bouge pas.</div>
          </button>
          <button className="btn" style={{ textAlign: 'left' }} disabled={!canEdit} onClick={() => onChoose('regle')} title={canEdit ? '' : 'Réservé à un admin ou un responsable technique'}>
            <b>C’est la règle, pour tous les projets</b>
            <div className="hint">L’app propose la règle qui explique ce chiffre ; tu valides.</div>
          </button>
          <button className="btn" style={{ textAlign: 'left' }} onClick={() => onChoose('inconnu')}>
            <b>Je ne sais pas encore</b>
            <div className="hint">Gardé comme observation ; la question reviendra au prochain projet.</div>
          </button>
        </div>
      </div>
    </div>
  );
}
