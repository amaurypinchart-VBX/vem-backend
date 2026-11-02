// « ✍️ Écrire une règle » (atelier texte, L7) : la règle écrite en français → l'IA la traduit en choisissant dans les
// listes (catalogue, bases, conditions, traits des motifs) ; aucun chiffre ne vient d'elle (garde serveur) : ce qu'elle
// a proposé sans que ce soit écrit est listé « à renseigner ». Une relance avec les réponses à ses questions. Le
// brouillon s'ouvre dans l'écran de validation des règles (contradictions, impact, raison). Sans IA (pas de clé) :
// choisir l'article et saisir la règle à la main dans le même écran.
import { useEffect, useMemo, useState } from 'react';
import { vem } from '../../api/vem';
import type { CatalogueItem, LoadingRule } from '../../loading/core/types';
import { describeRule } from '../../loading/core/describe';
import type { AiRuleAnswer } from '../../loading/teach/aiRule';
import { aiAllowed, draftFromAi } from '../../loading/teach/aiRule';
import type { TElement } from '../../loading/teach/motif';
import { ruleKey } from '../../loading/library/importClasseur';

export interface RuleWriterProps {
  catalogue: CatalogueItem[];
  catMap: ReadonlyMap<string, CatalogueItem>;
  rules: readonly LoadingRule[];
  /** éléments de la topologie du chantier ouvert (traits des motifs permis) */
  elements?: readonly TElement[];
  /** éléments montrés en 3D, en français (contexte pour l'IA) */
  context?: string;
  onDraft: (rule: LoadingRule, text: string) => void;
  onClose?: () => void;
}

export function RuleWriter(p: RuleWriterProps) {
  const [status, setStatus] = useState<{ enabled: boolean; model: string } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [answer, setAnswer] = useState<AiRuleAnswer | null>(null);
  const [replies, setReplies] = useState<string[]>([]);
  const [relaunched, setRelaunched] = useState(false);
  const [article, setArticle] = useState('');
  useEffect(() => {
    vem
      .loadingAiStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, model: '' }));
  }, []);
  const allowed = useMemo(() => aiAllowed(p.catalogue, p.elements), [p.catalogue, p.elements]);
  const ask = async (withAnswers: boolean) => {
    setBusy(true);
    setErr('');
    try {
      const answers = withAnswers && answer ? answer.questions.map((q, i) => ({ question: q, answer: replies[i] ?? '' })).filter((x) => x.answer.trim()) : undefined;
      const a = await vem.loadingAiRule({ text, allowed, context: p.context, answers });
      setAnswer(a);
      setReplies([]);
      if (withAnswers) setRelaunched(true);
      if (a.draft.article) setArticle(a.draft.article);
    } catch (e) {
      const m = (e as Error).message;
      setErr(/503|non configurée/.test(m) ? 'IA non configurée : choisir l’article et saisir la règle à la main.' : `✗ ${m}`);
      if (/503|non configurée/.test(m)) setStatus({ enabled: false, model: '' });
    }
    setBusy(false);
  };
  const ref = /^\d-\d{3}-\d{3,5}/.exec(article)?.[0] ?? '';
  const found = ref ? p.catMap.get(ref) : undefined;
  const matches = article.length >= 2 && !found ? p.catalogue.filter((c) => `${c.ref} ${c.designation}`.toLowerCase().includes(article.toLowerCase())).slice(0, 8) : [];
  const draft = answer && found ? draftFromAi(answer, p.rules, p.catMap, { article: found.ref, text }) : null;
  const manual = (): LoadingRule | null => {
    if (!found) return null;
    const r: LoadingRule = { key: '', kind: 'accessoire', trigger: {}, article: found.ref, articleName: found.designation, qty: null, per: 'box', unit: found.unit ?? 'pce', confidence: 'a_confirmer', calibration: [], version: 1, active: true, source: 'atelier_texte', ...(text ? { remark: `Écrite : « ${text.slice(0, 300)} »` } : {}) };
    r.key = ruleKey(r);
    for (let n = 2; p.rules.some((x) => x.key === r.key && x.active); n++) r.key = `${ruleKey(r)}#${n}`;
    return r;
  };
  const aiOn = status?.enabled;
  return (
    <div className="card" data-testid="rule-writer">
      <div className="card-head">
        <h2>✍️ Écrire une règle</h2>
        <span className="hint">
          {aiOn ? `Écrite comme tu la dirais ; l’IA (${status!.model}) la traduit, aucun chiffre ne vient d’elle.` : status ? 'IA non configurée : saisie à la main.' : ''}
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        {p.onClose && (
          <button className="btn small ghost" onClick={p.onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 8 }}>
        {p.context && <div className="hint">Éléments montrés : {p.context}</div>}
        <textarea
          rows={3}
          value={text}
          data-testid="rule-writer-text"
          placeholder="Ex. : 2 plaques 4-700-040 par jonction décalée, + 1 en spare, seulement en box connectées"
          onChange={(e) => setText(e.target.value)}
        />
        {aiOn && (
          <div>
            <button className="btn primary small" disabled={busy || text.trim().length < 3} onClick={() => void ask(false)} data-testid="rule-writer-ai">
              {busy ? 'Traduction…' : '🤖 Traduire en règle'}
            </button>
          </div>
        )}
        {err && <div className="error-box">{err}</div>}
        {answer && (
          <div style={{ display: 'grid', gap: 6, border: '1px solid var(--warn)', borderRadius: 6, padding: 8 }} data-testid="rule-writer-answer">
            <div>
              <b>Proposition de l’IA</b> <span className="hint">confiance {Math.round(answer.confidence * 100)} %</span>
              {answer.usage?.costUsd != null && <span className="hint"> · {answer.usage.costUsd.toFixed(3)} $</span>}
            </div>
            {draft ? <div data-testid="rule-writer-sentence">{describeRule(draft, p.catMap)}</div> : <div className="hint">Choisir l’article pour voir la règle.</div>}
            {answer.rationale && <div className="hint">{answer.rationale}</div>}
            {answer.removed.length > 0 && (
              <div className="warning" style={{ display: 'block' }}>
                À renseigner dans l’écran de validation : {answer.removed.join(' · ')}
              </div>
            )}
            {answer.questions.length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                {answer.questions.map((q, i) => (
                  <label key={i} style={{ display: 'grid', gap: 2 }}>
                    <span>❓ {q}</span>
                    <input type="text" value={replies[i] ?? ''} disabled={relaunched} onChange={(e) => setReplies((r) => Object.assign([...r], { [i]: e.target.value }))} />
                  </label>
                ))}
                {!relaunched && (
                  <div>
                    <button className="btn small" disabled={busy || !replies.some((x) => x?.trim())} onClick={() => void ask(true)}>
                      Relancer avec mes réponses
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {(answer || (status && !aiOn)) && (
          <div style={{ display: 'grid', gap: 4 }}>
            <label className="row" style={{ gap: 6 }}>
              Article <input type="text" style={{ flex: 1 }} value={article} placeholder="Référence ou nom…" onChange={(e) => setArticle(e.target.value)} data-testid="rule-writer-article" />
            </label>
            {matches.map((c) => (
              <button key={c.ref} className="btn small ghost" style={{ textAlign: 'left' }} onClick={() => setArticle(`${c.ref} ${c.designation}`)}>
                <b>{c.ref}</b> {c.designation}
              </button>
            ))}
            {found && <span className="hint">{found.designation}</span>}
          </div>
        )}
        {(answer || (status && !aiOn)) && (
          <div>
            <button
              className="btn primary"
              disabled={!found}
              data-testid="rule-writer-open"
              onClick={() => {
                const r = draft ?? manual();
                if (r) p.onDraft(r, text);
              }}
            >
              Vérifier et valider la règle…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
