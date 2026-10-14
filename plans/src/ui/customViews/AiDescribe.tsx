// « 🤖 Décris la vue… » : champ de la barre du haut de l'éditeur de vues spéciales, et bandeau orange de la
// proposition (raison, confiance, ce qui a été retiré, coût, questions + une relance, Accepter / Modifier / Annuler).
import { useState } from 'react';

export interface AiProposalInfo {
  rationale: string;
  confidence: number;
  removed: string[];
  questions: string[];
  costUsd: number | null;
  model: string;
  /** relance déjà faite (une seule) */
  relaunched: boolean;
}

export function AiField({ busy, hasView, onSend }: { busy: boolean; hasView: boolean; onSend: (text: string, fromCurrent: boolean) => void }) {
  const [text, setText] = useState('');
  const [fromCurrent, setFromCurrent] = useState(true);
  return (
    <div className="cv-ai" data-testid="cv-ai">
      <input
        type="text"
        value={text}
        placeholder="🤖 Décris la vue… (ex. « dessous de la toiture sans le plafond tendu, ensemble puis séparées »)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && text.trim() && !busy && onSend(text.trim(), fromCurrent && hasView)}
        data-testid="cv-ai-text"
      />
      {hasView && (
        <label className="check" title="Modifier la vue ouverte au lieu d’en créer une nouvelle">
          <input type="checkbox" checked={fromCurrent} onChange={(e) => setFromCurrent(e.target.checked)} />
          partir de la vue actuelle
        </label>
      )}
      <button className="btn small" disabled={busy || !text.trim()} onClick={() => onSend(text.trim(), fromCurrent && hasView)} data-testid="cv-ai-send">
        {busy ? 'L’IA réfléchit…' : 'Proposer'}
      </button>
    </div>
  );
}

export function AiBanner({ info, busy, onAccept, onEdit, onCancel, onAnswer }: { info: AiProposalInfo; busy: boolean; onAccept: () => void; onEdit: () => void; onCancel: () => void; onAnswer: (answers: Array<{ question: string; answer: string }>) => void }) {
  const [answers, setAnswers] = useState<string[]>(info.questions.map(() => ''));
  return (
    <div className="cv-ai-banner" data-testid="cv-ai-banner">
      <div className="row">
        <b>🤖 Proposition de l’IA</b>
        <span className="badge orange">confiance {info.confidence.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</span>
        <span className="hint">
          {info.model}
          {info.costUsd !== null ? ` · ${info.costUsd.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} $` : ''}
        </span>
        <div className="spacer" />
        <button className="btn small primary" onClick={onAccept} data-testid="cv-ai-accept">
          Accepter
        </button>
        <button className="btn small" onClick={onEdit} title="Garder la proposition et continuer à la régler à la main">
          Modifier
        </button>
        <button className="btn small" onClick={onCancel} data-testid="cv-ai-cancel">
          Annuler
        </button>
      </div>
      {info.rationale && <div className="hint">{info.rationale}</div>}
      {info.removed.length > 0 && <div className="hint">Écarté (inconnu ou hors bornes) : {info.removed.join(' · ')}</div>}
      {info.questions.length > 0 && (
        <div className="cv-ai-questions" data-testid="cv-ai-questions">
          {info.questions.map((q, i) => (
            <label key={i} className="prop-field">
              <span>{q}</span>
              <input type="text" value={answers[i] ?? ''} onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} />
            </label>
          ))}
          {!info.relaunched && (
            <button className="btn small" disabled={busy || answers.every((a) => !a.trim())} onClick={() => onAnswer(info.questions.map((q, i) => ({ question: q, answer: answers[i] ?? '' })).filter((a) => a.answer.trim()))}>
              Relancer avec mes réponses
            </button>
          )}
        </div>
      )}
    </div>
  );
}
