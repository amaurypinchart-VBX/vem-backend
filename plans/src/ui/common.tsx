import type { Category } from '../core/types';
import { LEGEND } from '../core/types';

const NEUTRAL: Partial<Record<Category, string>> = {
  STRUCTURE: '#9aa3b5',
  PLANCHER: '#b08968',
  TOIT: '#6b7280',
  PIED: '#a3a3a3',
  ESCALIER: '#f59e0b',
  'GARDE-CORPS': '#fcd34d',
  VITRE: '#7dd3fc',
};

export function categoryColor(c: Category): string {
  return LEGEND[c]?.color ?? NEUTRAL[c] ?? '#9aa3b5';
}

export function CategoryChip({ category }: { category: Category | null }) {
  if (!category) return <span className="chip none">NON CLASSÉ</span>;
  return (
    <span className="chip">
      <i style={{ background: categoryColor(category) }} />
      {category}
    </span>
  );
}

export function ProgressBar({ label, fraction, onCancel }: { label: string; fraction: number; onCancel?: () => void }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="progress-row">
          <div style={{ minWidth: 260 }}>{label}</div>
          <div className="progress">
            <div style={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` }} />
          </div>
          <div style={{ width: 40, textAlign: 'right' }}>{Math.round(fraction * 100)} %</div>
          {onCancel && (
            <button className="btn small" onClick={onCancel}>
              Annuler
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function downloadText(fileName: string, text: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
