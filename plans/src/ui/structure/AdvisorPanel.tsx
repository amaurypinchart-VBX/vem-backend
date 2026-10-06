// Onglet « Conseil ingénieur » de l'étude structure : discussion avec l'ingénieur IA (qui fait vérifier chaque idée
// par le moteur de calcul), pistes du diagnostic automatique (sans IA), variantes simulées et comparées, application
// d'une variante à l'étude. La conversation et les variantes sont enregistrées avec l'étude.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { AdvisorMessage } from '../../api/vem';
import { vem } from '../../api/vem';
import type { StudyRun } from '../../structure/studyRun';
import type { StudyMods } from '../../structure/core/mods';
import { describeMods } from '../../structure/core/mods';
import type { Issue } from '../../structure/advisor/diagnose';
import { diagnose } from '../../structure/advisor/diagnose';
import { VERDICT_LABEL } from '../../structure/core/records';
import type { Verdict } from '../../structure/core/records';
import { fmtNumber } from '../../structure/core/units';
import type { AdvisorContext, Variant } from './advisorTools';
import { runAdvisorTool } from './advisorTools';
import type { AiState } from './aiUi';
import { AiUsageNote } from './aiUi';

const VERDICT_COLOR: Record<string, string> = { ok: 'var(--ok)', limit: 'var(--warn)', fail: 'var(--danger)', incomplete: 'var(--danger)' };
const SEV: Record<Issue['severity'], { label: string; color: string }> = {
  fail: { label: 'NE PASSE PAS', color: 'var(--danger)' },
  incomplete: { label: 'INCOMPLET', color: 'var(--danger)' },
  limit: { label: 'LIMITE', color: 'var(--warn)' },
};

const SUGGESTIONS = [
  'Pourquoi ça ne passe pas, et que faut-il faire pour que ça passe ?',
  'Le sol n’accepte que 400 kg/m² : que dois-je mettre sous les appuis, et combien de personnes au maximum ?',
  'Je dois surélever les Viewbox de 80 cm avec des poteaux acier : qu’en penses-tu ?',
  'Que faut-il ajouter pour faire un niveau de plus en sécurité ?',
];

const TOOL_LABEL: Record<string, string> = {
  etat_etude: 'Lecture de l’étude',
  diagnostic: 'Diagnostic',
  details_element: 'Détail d’une vérification',
  lister_elements: 'Éléments les plus chargés',
  catalogue: 'Catalogue',
  simuler_variante: 'Simulation',
  chercher_lest: 'Recherche du lest',
  etudier_sol: 'Sol et calage',
  appliquer_variante: 'Application d’une variante',
};

/** Texte de l'IA → éléments : paragraphes, puces, titres, **gras** (sans HTML). */
function RichText({ text, flagged }: { text: string; flagged?: number[] }) {
  const inline = (s: string, k: number) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={`${k}-${i}`}>{p.slice(2, -2)}</b> : <Fragment key={`${k}-${i}`}>{p}</Fragment>));
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`l${out.length}`} style={{ margin: '4px 0 6px 18px', padding: 0 }}>{list.map((l, i) => <li key={i}>{inline(l, i)}</li>)}</ul>);
    list = [];
  };
  lines.forEach((raw, k) => {
    const l = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
    if (bullet) return void list.push(bullet[1]);
    flush();
    if (!l.trim()) return;
    const h = /^#{1,4}\s+(.*)$/.exec(l);
    out.push(h ? <div key={k} style={{ fontWeight: 700, marginTop: 6 }}>{inline(h[1], k)}</div> : <p key={k} style={{ margin: '3px 0' }}>{inline(l, k)}</p>);
  });
  flush();
  return (
    <div>
      {out}
      {flagged?.length ? <div className="hint" style={{ color: 'var(--warn)', marginTop: 4 }}>⚠ Chiffres non vérifiés par le calcul : {flagged.map((v) => fmtNumber(v, 2)).join(' ; ')} — à contrôler avant de s’en servir.</div> : null}
    </div>
  );
}

function VerdictBadge({ v }: { v: string }) {
  return <b style={{ color: VERDICT_COLOR[v] ?? 'var(--text-dim)' }}>{VERDICT_LABEL[v as Verdict] ?? v}</b>;
}

/** Résumé d'un résultat d'outil pour l'historique (une ligne). */
function toolSummary(name: string, input: Record<string, unknown>, result: unknown, error: boolean): React.ReactNode {
  if (error) return <span style={{ color: 'var(--danger)' }}>{String(result)}</span>;
  const r = (result ?? {}) as Record<string, any>;
  if (name === 'simuler_variante' || (name === 'chercher_lest' && r.variante))
    return (
      <span>
        {r.variante} « {String(input.titre ?? r.variante)} » : <VerdictBadge v={r.comparaison?.verdict_avant} /> → <VerdictBadge v={r.comparaison?.verdict_apres} />
        {name === 'chercher_lest' ? ` — ${r.lest_kg_par_viewbox} kg par Viewbox` : ''}
      </span>
    );
  if (name === 'chercher_lest') return <span>{r.basculement ?? ''}</span>;
  if (name === 'etudier_sol') return <span>{r.tout_passe ? 'tous les appuis passent' : 'des appuis ne passent pas'}{r.public_maximal ? ` · public maximal ${r.public_maximal.personnes} personnes` : ''}</span>;
  if (name === 'etat_etude' || name === 'diagnostic') return <span>verdict <VerdictBadge v={r.etude?.verdict ?? r.verdict} /></span>;
  if (name === 'appliquer_variante') return <span>{r.appliquee ? '✅ appliquée' : 'refusée'}</span>;
  return null;
}

interface Props {
  ai: AiState | null;
  studyId: string | null;
  run: StudyRun | null;
  stale: boolean;
  friction: number;
  mods: StudyMods;
  sectionName: (key: string) => string;
  /** contexte des outils (sans la liste des variantes, gérée ici) */
  context: () => Omit<AdvisorContext, 'variants' | 'addVariant' | 'confirmApply' | 'onProgress' | 'signal'>;
  /** clé des entrées de l'étude actuelle : une variante calculée sur une autre base doit être recalculée */
  currentKey: string;
  onApply: (v: Variant) => void;
  onClearMods: () => void;
  onRunStudy: () => void;
  running: boolean;
  /** conversation et variantes de l'étude (partagées avec l'onglet Variantes, enregistrées par la page) */
  messages: AdvisorMessage[];
  setMessages: (m: AdvisorMessage[]) => void;
  variants: Variant[];
  setVariants: (v: Variant[]) => void;
}

interface PendingApply {
  variant: Variant;
  reason: string;
  resolve: (ok: boolean) => void;
}

export function AdvisorPanel(p: Props) {
  const { messages, setMessages, variants, setVariants } = p;
  const [flags, setFlags] = useState<Record<number, number[]>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingApply | null>(null);
  const [usage, setUsage] = useState<{ costUsd: number | null; durationMs: number; model: string; inputTokens: number; outputTokens: number } | null>(null);
  const variantsRef = useRef<Variant[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  variantsRef.current = variants;
  const aiOn = !!p.ai?.enabled;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, busy]);

  const issues = useMemo(() => (p.run && !p.stale ? diagnose(p.run, { friction: p.friction }) : []), [p.run, p.stale, p.friction]);

  const ctxFor = (signal: AbortSignal): AdvisorContext => ({
    ...p.context(),
    variants: variantsRef.current,
    addVariant: (v) => {
      v.baseKey = p.currentKey;
      variantsRef.current = [...variantsRef.current, v];
      setVariants(variantsRef.current);
    },
    confirmApply: (variant, reason) => new Promise<boolean>((resolve) => setPending({ variant, reason, resolve })),
    onProgress: (t) => setBusy(t),
    signal,
  });

  /** Outil lancé à la main (pistes du diagnostic, recalcul d'une variante) : même moteur que pour l'IA. */
  const runTool = async (name: string, inp: Record<string, unknown>) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError('');
    setBusy('Calcul…');
    try {
      return await runAdvisorTool(name, inp, ctxFor(ctrl.signal));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError('');
    setInput('');
    let history: AdvisorMessage[] = [...messages, { role: 'user', content: [{ type: 'text', text: text.trim() }] }];
    setMessages(history);
    try {
      for (let turn = 0; turn < 20; turn++) {
        if (ctrl.signal.aborted) throw Object.assign(new Error('Arrêté'), { name: 'AbortError' });
        setBusy('L’ingénieur réfléchit…');
        const r = await vem.aiAdvisor(history, p.studyId);
        setUsage(r.usage);
        history = [...history, ...r.append];
        setMessages(history);
        if (r.unverified.length) setFlags((f) => ({ ...f, [history.length - 1]: r.unverified }));
        if (r.stopReason !== 'tool_use') break;
        const last = r.append[r.append.length - 1];
        const uses = last.content.filter((b) => b.type === 'tool_use') as unknown as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>;
        const results: AdvisorMessage['content'] = [];
        for (const u of uses) {
          setBusy(`${TOOL_LABEL[u.name] ?? u.name}…`);
          try {
            const out = await runAdvisorTool(u.name, u.input ?? {}, ctxFor(ctrl.signal));
            results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
          } catch (e) {
            if ((e as Error).name === 'AbortError') throw e;
            results.push({ type: 'tool_result', tool_use_id: u.id, content: `Erreur : ${(e as Error).message}`, is_error: true });
          }
        }
        history = [...history, { role: 'user', content: results }];
        setMessages(history);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      // un appel d'outil sans résultat bloquerait la suite : on clôt la question par des résultats « interrompu »
      const last = history[history.length - 1];
      const open = last?.role === 'assistant' ? last.content.filter((b) => b.type === 'tool_use') : [];
      if (open.length) {
        history = [...history, { role: 'user', content: open.map((b) => ({ type: 'tool_result', tool_use_id: String(b.id), content: 'Interrompu par l’utilisateur.', is_error: true })) }];
        setMessages(history);
      }
    } finally {
      setBusy(null);
      setPending((x) => {
        x?.resolve(false);
        return null;
      });
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setPending((x) => {
      x?.resolve(false);
      return null;
    });
  };

  // ─── affichage de la conversation : textes, réflexion résumée, outils avec leur résultat ───
  const resultsById = useMemo(() => {
    const m = new Map<string, { content: unknown; error: boolean }>();
    for (const msg of messages)
      if (msg.role === 'user')
        for (const b of msg.content)
          if (b.type === 'tool_result') {
            let c: unknown = b.content;
            try {
              c = JSON.parse(String(b.content));
            } catch {
              /* texte */
            }
            m.set(String(b.tool_use_id), { content: c, error: !!b.is_error });
          }
    return m;
  }, [messages]);

  const bubbles = messages.map((m, k) => {
    if (m.role === 'user') {
      const text = m.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n');
      if (!text || text.startsWith('[Contrôle automatique de VEM]')) return null;
      return (
        <div key={k} style={{ alignSelf: 'flex-end', maxWidth: '80%', background: 'var(--bg-4)', borderRadius: 10, padding: '8px 12px', whiteSpace: 'pre-wrap' }}>
          {text}
        </div>
      );
    }
    const texts = m.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n').trim();
    const thinking = m.content.filter((b) => b.type === 'thinking' && b.thinking).map((b) => String(b.thinking)).join('\n').trim();
    const tools = m.content.filter((b) => b.type === 'tool_use') as unknown as Array<{ id: string; name: string; input: Record<string, unknown> }>;
    return (
      <div key={k} style={{ alignSelf: 'flex-start', maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {thinking && (
          <details className="hint">
            <summary style={{ cursor: 'pointer' }}>💭 Raisonnement</summary>
            <div style={{ whiteSpace: 'pre-wrap', padding: '4px 0 4px 12px' }}>{thinking}</div>
          </details>
        )}
        {texts && (
          <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', opacity: tools.length ? 0.8 : 1 }}>
            <RichText text={texts} flagged={flags[k]} />
          </div>
        )}
        {tools.map((t) => {
          const r = resultsById.get(t.id);
          return (
            <div key={t.id} className="hint" style={{ paddingLeft: 8 }}>
              🔧 {TOOL_LABEL[t.name] ?? t.name}
              {t.name === 'simuler_variante' && t.input.titre ? ` « ${String(t.input.titre)} »` : ''} {r ? <>→ {toolSummary(t.name, t.input, r.content, r.error)}</> : busy ? '…' : ''}
            </div>
          );
        })}
      </div>
    );
  });

  const applyVariant = (v: Variant) => {
    p.onApply(v);
    const next = variantsRef.current.map((x) => (x.id === v.id ? { ...x, applied: true } : x));
    variantsRef.current = next;
    setVariants(next);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 12, alignItems: 'start' }}>
      {/* ─── discussion ─── */}
      <div className="card">
        <div className="card-head">
          <h2>💬 Ingénieur conseil</h2>
          <span className="badge orange">IA encadrée : chaque chiffre vient du calcul</span>
          <div style={{ flex: 1 }} />
          {usage && <AiUsageNote usage={usage} />}
          {messages.length > 0 && (
            <button className="btn small ghost" disabled={!!busy} onClick={() => setMessages([])} title="Les variantes sont gardées">
              Nouvelle discussion
            </button>
          )}
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 320, maxHeight: '62vh', overflowY: 'auto' }}>
          {!aiOn && (
            <div className="hint">
              {p.ai === null ? 'Connexion à l’IA…' : 'IA non configurée sur le serveur (clé API absente) : la discussion est indisponible, mais les pistes du diagnostic et les simulations de variantes (à droite) fonctionnent sans IA.'}
            </div>
          )}
          {aiOn && !messages.length && (
            <div className="hint" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                Posez vos questions comme à l’ingénieur du bureau d’études : il lit le calcul, explique ce qui ne passe pas, propose des solutions et les fait vérifier par le calcul (variantes) avant de dire que ça passe.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn small" onClick={() => void ask(s)} disabled={!!busy} style={{ whiteSpace: 'normal', textAlign: 'left' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {bubbles}
          {pending && (
            <div style={{ border: '1px solid var(--accent)', borderRadius: 10, padding: 10 }}>
              <b>Appliquer la variante {pending.variant.id} « {pending.variant.title} » à l’étude ?</b>
              <div className="hint">{pending.reason}</div>
              <ul style={{ margin: '4px 0 6px 18px' }}>{pending.variant.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
              <div className="row" style={{ gap: 6 }}>
                <button
                  className="btn small primary"
                  onClick={() => {
                    applyVariant(pending.variant);
                    pending.resolve(true);
                    setPending(null);
                  }}
                >
                  ✓ Appliquer
                </button>
                <button
                  className="btn small"
                  onClick={() => {
                    pending.resolve(false);
                    setPending(null);
                  }}
                >
                  Non
                </button>
              </div>
            </div>
          )}
          {busy && (
            <div className="hint row" style={{ gap: 8 }}>
              <span className="progress" style={{ width: 16, height: 16 }} /> {busy}
              <button className="btn small ghost" onClick={stop}>
                Arrêter
              </button>
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
          <div ref={endRef} />
        </div>
        <div className="card-body" style={{ borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <textarea
            value={input}
            disabled={!aiOn}
            placeholder={aiOn ? 'Ex. « Le sol n’accepte que 400 kg/m², combien de personnes max ? » — Entrée pour envoyer, Maj + Entrée pour aller à la ligne' : 'IA indisponible'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            rows={2}
            style={{ flex: 1, resize: 'vertical' }}
          />
          <button className="btn primary" disabled={!aiOn || !!busy || !input.trim()} onClick={() => void ask(input)}>
            Envoyer
          </button>
        </div>
      </div>

      {/* ─── pistes, variantes, modifications ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card">
          <div className="card-head">
            <h2>Pistes du diagnostic</h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!p.run || p.stale ? (
              <div className="hint">
                {p.run ? 'Calcul périmé (hypothèses modifiées).' : 'Pas encore de calcul.'}{' '}
                <button className="btn small" disabled={p.running} onClick={p.onRunStudy}>
                  {p.running ? 'Calcul…' : 'Lancer le calcul'}
                </button>
              </div>
            ) : !issues.length ? (
              <div className="hint">✅ Rien à signaler : tout passe avec une marge (η ≤ 0,90).</div>
            ) : (
              issues.map((i) => (
                <div key={i.id} style={{ borderLeft: `3px solid ${SEV[i.severity].color}`, paddingLeft: 8 }}>
                  <div>
                    <span className="hint" style={{ color: SEV[i.severity].color, fontWeight: 700 }}>
                      {SEV[i.severity].label}
                    </span>{' '}
                    <b>{i.title}</b>
                  </div>
                  <div className="hint">{i.why}</div>
                  {i.where.length > 0 && <div className="hint">Où : {i.where.slice(0, 4).join(' ; ')}</div>}
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {i.remedies.map((r) => (
                      <li key={r.id} style={{ marginBottom: 4 }}>
                        <span title={r.detail}>{r.title}</span>
                        {r.special && <span className="badge orange" style={{ marginLeft: 4 }}>pièce spéciale</span>}
                        {r.action === 'simulate' && (
                          <button className="btn small" style={{ marginLeft: 6 }} disabled={!!busy} onClick={() => void runTool('simuler_variante', { titre: r.title, piste: `${i.id}/${r.id}` })}>
                            Simuler
                          </button>
                        )}
                        {r.action === 'ballast' && (
                          <button className="btn small" style={{ marginLeft: 6 }} disabled={!!busy} onClick={() => void runTool('chercher_lest', { objectif: i.id === 'sliding' ? 'glissement' : 'les_deux', viewbox: r.modules })}>
                            Chercher le lest
                          </button>
                        )}
                        <div className="hint">{r.detail}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {busy && !messages.length && <div className="hint">{busy}</div>}
            {error && !aiOn && <div className="error-box">{error}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Variantes simulées</h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!variants.length && <div className="hint">Aucune variante : simulez une piste ou demandez à l’ingénieur.</div>}
            {[...variants].reverse().map((v) => {
              const fresh = !!v.baseKey && v.baseKey === p.currentKey;
              return (
                <div key={v.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <b>{v.id}</b> {v.title} <VerdictBadge v={v.digest.verdict} />
                    {v.applied && <span className="badge ok">appliquée</span>}
                  </div>
                  <ul style={{ margin: '4px 0 4px 16px', padding: 0 }} className="hint">
                    {v.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                  <div className="hint">
                    {v.digest.familles
                      .filter((f) => f.verdict !== 'ok')
                      .slice(0, 3)
                      .map((f) => `${f.famille} η ${f.eta_max === null ? '⛔' : fmtNumber(f.eta_max, 2)}`)
                      .join(' · ') || 'toutes les familles passent'}
                    {v.digest.stabilite.glissement.eta !== null ? ` · glissement η ${fmtNumber(v.digest.stabilite.glissement.eta, 2)}` : ''}
                  </div>
                  {!v.applied && (
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      {fresh ? (
                        <button className="btn small primary" disabled={!!busy} onClick={() => applyVariant(v)}>
                          Appliquer à l’étude
                        </button>
                      ) : (
                        <button
                          className="btn small"
                          disabled={!!busy}
                          title="Calculée sur une autre version de l’étude"
                          onClick={() => void runTool('simuler_variante', { titre: v.title, base: v.id })}
                        >
                          Recalculer sur l’étude actuelle
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Modifications de l’étude</h2>
            <div style={{ flex: 1 }} />
            {describeMods(p.mods).length > 0 && (
              <button className="btn small ghost" onClick={p.onClearMods}>
                Tout retirer
              </button>
            )}
          </div>
          <div className="card-body hint">
            {describeMods(p.mods, p.sectionName).length ? (
              <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
                {describeMods(p.mods, p.sectionName).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            ) : (
              'Aucune : l’étude correspond au modèle SketchUp.'
            )}
            <div style={{ marginTop: 6 }}>Ces modifications (hors modèle SketchUp) sont prises en compte dans le calcul, le calage et le rapport ; les reporter dans le modèle et sur le plan de montage.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

