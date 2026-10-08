// « Ce que l'IA a reconnu » (S12.6) : résultat de l'analyse IA du modèle entier, en 4 blocs — Structure, Produits,
// Regroupements, Alertes et questions. Tout est « proposé » : chaque ligne s'accepte, se modifie (pop-up de la pièce ou
// atelier) ou se refuse ; une réponse humaine n'est jamais remplacée (l'IA ne fait qu'une alerte, « Appliquer sa
// proposition » sur clic) ; « ↩ Annuler l'analyse IA » remet les réponses d'avant. Aucun chiffre ne vient de l'IA.
import { useState } from 'react';
import type { AnalysisProposals, StoredAnalysis } from '../../structure/core/ai';
import { AI_CONFIDENCE_MIN } from '../../structure/core/ai';
import type { FrameRole, LibraryEntry, PartAssignment, PartNature, PartRole } from '../../structure/core/library';
import { FRAME_ROLE_LABEL, NATURE_LABEL, ROLE_LABEL } from '../../structure/core/library';
import type { Assignments } from '../../structure/core/recognition';
import { fmtNumber } from '../../structure/core/units';
import type { AiState } from './aiUi';

const COLUMN: Record<string, string> = { semi: 'angles semi-rigides (boulonnés)', rigid: 'angles rigides (soudés)', pinned: 'angles articulés', unknown: 'angles : on ne sait pas' };
const STACK: Record<string, string> = {
  plates: 'empilement par plats boulonnés (comme la Viewbox)',
  'corner-casting': 'empilement par pièces d’angle (type conteneur)',
  clamp: 'empilement par clamp / serrage',
  bolted: 'empilement boulonné directement',
  none: 'pas d’attache d’empilement',
  unknown: 'empilement : on ne sait pas',
};
const SIDE: Record<string, string> = { bolts: 'box côte à côte boulonnées', 'contact-only': 'box côte à côte en simple contact', custom: 'liaison côte à côte spéciale (clamp…)', unknown: 'liaison côte à côte : on ne sait pas' };
const VERDICT: Record<string, string> = { viewbox: 'Viewbox standard', 'library-type': 'type déjà dans la bibliothèque', 'new-type': 'nouveau type de structure', unsure: 'incertain' };

const pct = (c: number) => `${Math.round(c * 100)} %`;
const describe = (a: PartAssignment, library: readonly LibraryEntry[]) =>
  [
    a.role === 'ignored' ? ROLE_LABEL.ignored : `${ROLE_LABEL[a.role as PartRole] ?? a.role} · ${NATURE_LABEL[a.nature as PartNature] ?? a.nature}`,
    a.material && `matériau ${library.find((e) => e.key === a.material)?.name ?? a.material}`,
    a.section && `section ${library.find((e) => e.key === a.section)?.name ?? a.section}`,
    a.weight && `${fmtNumber(a.weight.value, 0)} ${a.weight.unit}`,
    a.windClosed !== undefined && (a.windClosed ? 'face fermée au vent' : 'ouvert au vent'),
  ]
    .filter(Boolean)
    .join(' · ');

export interface ModelAnalysisPanelProps {
  ai: AiState | null;
  analysis: StoredAnalysis | null;
  proposals: AnalysisProposals | null;
  assignments: Assignments;
  library: readonly LibraryEntry[];
  busy: boolean;
  error: string;
  /** coût estimé avant le lancement ($) */
  estimate: () => number | null;
  onRun: (answers?: Array<{ question: string; answer: string }>) => void;
  onAccept: (typeKey: string, force?: boolean) => void;
  onAcceptAll: () => void;
  onRefuse: (key: string) => void;
  onUndo: () => void;
  /** ouvre le pop-up d'un type (module : atelier structure accessible) */
  onOpen: (typeKey: string) => void;
}

export function ModelAnalysisPanel(p: ModelAnalysisPanelProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [open, setOpen] = useState(true);
  if (!p.ai?.enabled) return null;
  const a = p.analysis;
  const pr = p.proposals;
  const refused = new Set(a?.refused ?? []);
  const accepted = (key: string) => !!a && p.assignments[key]?.ai === a.id;
  const pending = pr?.products.filter((x) => !x.human && !refused.has(x.typeKey) && !accepted(x.typeKey) && x.confidence >= AI_CONFIDENCE_MIN) ?? [];
  const fr = pr?.frame;
  if (!a)
    return (
      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" disabled={p.busy} onClick={() => p.onRun()}>
              {p.busy ? '🤖 L’IA analyse le modèle… (jusqu’à 5 min)' : '🤖 Analyser le modèle avec l’IA'}
            </button>
            {!p.busy && (() => {
              const c = p.estimate();
              return c !== null ? <span className="hint">coût estimé ≈ {fmtNumber(c, 2)} $</span> : null;
            })()}
          </div>
          <div className="hint">
            L’IA regarde tout le modèle (structure des box, produits) et propose rôles, natures et sections parmi les listes de l’outil. Tout arrive « proposé » : rien n’est
            retenu sans ton clic, et aucune réponse déjà donnée n’est remplacée.
          </div>
          {p.error && <div className="error-box">{p.error}</div>}
        </div>
      </div>
    );
  return (
    <div className="card">
      <div className="card-head">
        <h3>🤖 Ce que l’IA a reconnu</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="hint">
          {new Date(a.at).toLocaleString('fr-BE')} · {a.model}
          {a.costUsd !== null ? ` · ≈ ${fmtNumber(a.costUsd, 2)} $` : ''}
        </span>
        <button className="btn small ghost" onClick={() => setOpen((x) => !x)}>
          {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn small" disabled={!pending.length} onClick={p.onAcceptAll}>
              ✔ Tout accepter (confiance ≥ 0,5) {pending.length ? `(${pending.length})` : ''}
            </button>
            <button className="btn small ghost" onClick={() => window.confirm('Remettre l’étape 1 dans l’état d’avant l’analyse IA ?') && p.onUndo()}>
              ↩ Annuler l’analyse IA
            </button>
            <button className="btn small ghost" disabled={p.busy} onClick={() => p.onRun()} title="Une nouvelle analyse ne touche que ce qui est encore « proposé » ou « inconnu »">
              {p.busy ? '🤖 Analyse…' : '🤖 Relancer l’analyse'}
            </button>
          </div>
          {p.error && <div className="error-box">{p.error}</div>}
          {a.removed.length > 0 && (
            <details>
              <summary className="hint">{a.removed.length} élément(s) de la réponse retiré(s) par le contrôle (hors listes ou chiffres non retrouvés)</summary>
              {a.removed.map((r, k) => (
                <div key={k} className="hint">
                  • {r}
                </div>
              ))}
            </details>
          )}

          {/* ─── Structure ─── */}
          {fr && (
            <div className="card" style={{ background: 'var(--bg-2)' }}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <b>Structure</b>
                  <span className={`badge ${fr.confidence >= AI_CONFIDENCE_MIN ? 'orange' : 'ko'}`}>
                    {VERDICT[fr.verdict]}
                    {fr.moduleTemplate ? ` : ${p.library.find((e) => e.key === fr.moduleTemplate)?.name ?? fr.moduleTemplate}` : ''} — confiance {pct(fr.confidence)}
                  </span>
                  {refused.has('structure') && <span className="badge ko">refusé</span>}
                  {accepted(fr.moduleKey) && <span className="badge ok">accepté</span>}
                </div>
                {fr.reasons.map((r, k) => (
                  <div key={k} className="hint">
                    • {r}
                  </div>
                ))}
                <div className="hint">
                  Assemblages probables : {COLUMN[fr.joints.column]} · {STACK[fr.joints.stack]} · {SIDE[fr.joints.side]}
                  {fr.joints.evidence ? ` — ${fr.joints.evidence}` : ''}
                </div>
                {(fr.joints.stack === 'clamp' || fr.joints.side === 'custom') && (
                  <div className="hint">→ Décrire la pièce (clamp…) dans l’onglet « 🔩 Accessoires » : ses capacités sont calculées par l’outil, jamais par l’IA.</div>
                )}
                {fr.groups.length > 0 && (
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Groupe</th>
                        <th>Barres</th>
                        <th>Relevé</th>
                        <th>Proposé par l’IA</th>
                        <th>Conf.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {fr.groups.map((g) => (
                        <tr key={g.group} title={g.note}>
                          <td>{g.group}</td>
                          <td>{g.count}</td>
                          <td>
                            {FRAME_ROLE_LABEL[g.roleGuess]} · {g.currentName ?? '—'}
                          </td>
                          <td>
                            {g.role !== g.roleGuess ? <b>{FRAME_ROLE_LABEL[g.role as FrameRole]}</b> : FRAME_ROLE_LABEL[g.role as FrameRole]}
                            {g.section && g.section !== g.current ? (
                              <>
                                {' '}
                                · <b>{g.sectionName}</b>
                              </>
                            ) : null}
                            {g.note ? <div className="hint">{g.note}</div> : null}
                          </td>
                          <td>{pct(g.confidence)}</td>
                          <td>
                            <button className="btn small ghost" title="Refuser cette proposition" onClick={() => p.onRefuse(g.group)}>
                              ✖
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {fr.moduleTemplate && !refused.has('structure') && !accepted(fr.moduleKey) && (
                    <button className="btn small" onClick={() => p.onAccept(fr.moduleKey)}>
                      ✔ Accepter le type proposé
                    </button>
                  )}
                  <button className="btn small ghost" onClick={() => p.onOpen(fr.moduleKey)}>
                    {fr.verdict === 'new-type' ? '🏗 Ouvrir l’atelier (propositions de l’IA)' : '✎ Modifier'}
                  </button>
                  {!refused.has('structure') && (
                    <button className="btn small ghost" onClick={() => p.onRefuse('structure')}>
                      ✖ Refuser
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Produits ─── */}
          {pr && pr.products.length > 0 && (
            <div>
              <b>Produits</b>
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Proposition</th>
                      <th>Conf.</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pr.products.map((x) => {
                      const st = accepted(x.typeKey) ? 'accepted' : x.human ? 'human' : refused.has(x.typeKey) ? 'refused' : 'pending';
                      return (
                        <tr key={x.typeKey} style={{ opacity: st === 'refused' ? 0.5 : 1 }}>
                          <td>
                            <a href="#" onClick={(e) => [e.preventDefault(), p.onOpen(x.typeKey)]}>
                              {x.label}
                            </a>
                          </td>
                          <td>
                            {describe(x.assignment, p.library)}
                            <div className="hint">{x.rationale}</div>
                            {x.questions.map((q, k) => (
                              <div key={k} className="hint">
                                ❓ {q}
                              </div>
                            ))}
                            {x.disagree && <div className="hint" style={{ color: 'var(--warn)' }}>⚠ {x.disagree}</div>}
                          </td>
                          <td>
                            <span className={`badge ${x.confidence >= AI_CONFIDENCE_MIN ? 'orange' : 'ko'}`}>{pct(x.confidence)}</span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {st === 'pending' && (
                              <>
                                <button className="btn small ghost" title="Accepter" onClick={() => p.onAccept(x.typeKey)}>
                                  ✔
                                </button>
                                <button className="btn small ghost" title="Modifier" onClick={() => p.onOpen(x.typeKey)}>
                                  ✎
                                </button>
                                <button className="btn small ghost" title="Refuser" onClick={() => p.onRefuse(x.typeKey)}>
                                  ✖
                                </button>
                              </>
                            )}
                            {st === 'accepted' && <span className="badge ok">accepté</span>}
                            {st === 'refused' && <span className="hint">refusé</span>}
                            {st === 'human' &&
                              (x.disagree ? (
                                <button className="btn small ghost" onClick={() => window.confirm(`Remplacer ta réponse pour « ${x.label} » par la proposition de l’IA ?`) && p.onAccept(x.typeKey, true)}>
                                  Appliquer sa proposition
                                </button>
                              ) : (
                                <span className="hint">réponse gardée</span>
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Regroupements ─── */}
          {pr && pr.groups.length > 0 && (
            <div>
              <b>Regroupements</b>
              {pr.groups.map((g, k) => (
                <div key={k} className="hint">
                  • « {g.label} » : {g.keys.length} types — {g.reason}{' '}
                  <a href="#" onClick={(e) => [e.preventDefault(), p.onOpen(g.keys[0])]}>
                    ouvrir
                  </a>{' '}
                  ·{' '}
                  <a href="#" onClick={(e) => [e.preventDefault(), p.onRefuse(`group:${g.label}`)]}>
                    refuser
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* ─── Alertes et questions ─── */}
          {pr && (pr.alerts.length > 0 || pr.questions.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <b>Alertes et questions</b>
              {pr.alerts.map((x, k) => (
                <div key={k} className="hint" style={{ color: 'var(--warn)' }}>
                  ⚠ {x}
                </div>
              ))}
              {pr.questions.map((q, k) => (
                <label key={k} className="hint" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  ❓ {q}
                  <input type="text" value={answers[k] ?? ''} onChange={(e) => setAnswers((x) => ({ ...x, [k]: e.target.value }))} aria-label={`Réponse ${k + 1}`} />
                </label>
              ))}
              {pr.questions.length > 0 && (
                <div>
                  <button
                    className="btn small"
                    disabled={p.busy || a.relaunched || !Object.values(answers).some((x) => x.trim())}
                    title={a.relaunched ? 'Une seule relance avec les réponses' : undefined}
                    onClick={() => p.onRun(pr.questions.map((q, k) => ({ question: q, answer: (answers[k] ?? '').trim() })).filter((x) => x.answer))}
                  >
                    🤖 Relancer avec mes réponses
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
