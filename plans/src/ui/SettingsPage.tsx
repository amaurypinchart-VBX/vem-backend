// Réglages : règles de classification éditables sans toucher au code (§5.3).
import { useMemo, useState } from 'react';
import type { Category, ClassificationRules } from '../core/types';
import { CATEGORIES } from '../core/types';
import {
  DEFAULT_RULES,
  articleRefFromName,
  categoryFromName,
  compileRules,
  isCommonName,
  isContextName,
  moduleIdFromName,
} from '../core/classification';
import { vem } from '../api/vem';
import { CategoryChip } from './common';

function articleMapToText(m: Record<string, Category>): string {
  return Object.entries(m)
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n');
}

function textToArticleMap(text: string): { map: Record<string, Category>; errors: string[] } {
  const map: Record<string, Category> = {};
  const errors: string[] = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const m = t.match(/^([\d-]+)\s*[=:;]\s*([A-Z-]+)$/i);
    const cat = m?.[2].toUpperCase();
    if (!m || !(CATEGORIES as readonly string[]).includes(cat!)) errors.push(`ligne ${i + 1} : « ${t} »`);
    else map[m[1]] = cat as Category;
  });
  return { map, errors };
}

export function SettingsPage({ rules, onSaved }: { rules: ClassificationRules; onSaved: (r: ClassificationRules) => void }) {
  const [draft, setDraft] = useState<ClassificationRules>(() => structuredClone(rules));
  const [articleText, setArticleText] = useState(() => articleMapToText(rules.articleCategories));
  const [testName, setTestName] = useState('VBX-03|PORTE-SIMPLE|02|#7-230-044');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const articles = useMemo(() => textToArticleMap(articleText), [articleText]);
  const compiled = useMemo(() => {
    try {
      return { rules: compileRules({ ...draft, articleCategories: articles.map }), error: '' };
    } catch (e) {
      return { rules: null, error: (e as Error).message };
    }
  }, [draft, articles.map]);

  const test = useMemo(() => {
    const r = compiled.rules;
    if (!r || !testName.trim()) return null;
    const art = articleRefFromName(testName, r);
    return {
      module: moduleIdFromName(testName, r),
      category: categoryFromName(testName, r) ?? (art ? (r.articleCategories[art] ?? null) : null),
      article: art,
      context: isContextName(testName, r),
      common: isCommonName(testName, r),
    };
  }, [compiled.rules, testName]);

  const set = <K extends keyof ClassificationRules>(k: K, v: ClassificationRules[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setPatterns = (i: number, text: string) =>
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, j) => (j === i ? { ...c, patterns: text.split('\n').map((s) => s.trim()).filter(Boolean) } : c)),
    }));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const c = [...d.categories];
      const j = i + dir;
      if (j < 0 || j >= c.length) return d;
      [c[i], c[j]] = [c[j], c[i]];
      return { ...d, categories: c };
    });

  const save = async () => {
    if (compiled.error || articles.errors.length) {
      setStatus({ kind: 'error', text: 'Corrige les erreurs avant d’enregistrer.' });
      return;
    }
    setSaving(true);
    try {
      const value = { ...draft, articleCategories: articles.map };
      await vem.saveRules(value);
      onSaved(value);
      setStatus({ kind: 'ok', text: '✓ Règles enregistrées. Réanalyse les modèles pour les appliquer.' });
    } catch (e) {
      const err = e as Error & { status?: number };
      setStatus({ kind: 'error', text: err.status === 403 ? 'Seul un administrateur VEM peut modifier les règles.' : err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-head">
          <h2>Tester un nom</h2>
        </div>
        <div className="card-body">
          <input type="text" className="mono" value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="Nom d'instance ou de définition SketchUp" />
          {test && (
            <div className="test-result">
              {test.module && <span className="badge ok">Viewbox {test.module}</span>}
              {!test.module && <CategoryChip category={test.category} />}
              {test.article && <span className="badge">réf. {test.article}</span>}
              {test.context && <span className="badge">contexte (ignoré)</span>}
              {test.common && <span className="badge">élément commun</span>}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Règles générales</h2>
        </div>
        <div className="card-body form-grid">
          <label>Nom d’une Viewbox (regex, numéro entre parenthèses)</label>
          <input type="text" className="mono" value={draft.modulePattern} onChange={(e) => set('modulePattern', e.target.value)} />
          <label>Référence article (regex, groupe 1)</label>
          <input type="text" className="mono" value={draft.articlePattern} onChange={(e) => set('articlePattern', e.target.value)} />
          <label>Contexte ignoré</label>
          <input type="text" className="mono" value={draft.contextPattern} onChange={(e) => set('contextPattern', e.target.value)} />
          <label>Éléments communs</label>
          <input type="text" className="mono" value={draft.commonPattern} onChange={(e) => set('commonPattern', e.target.value)} />
          <label>Matériau de vitre</label>
          <input type="text" className="mono" value={draft.glassMaterialPattern} onChange={(e) => set('glassMaterialPattern', e.target.value)} />
          <label>Dimensions d’un module (mm)</label>
          <div className="row">
            <input type="number" style={{ width: 100 }} value={draft.moduleDims.long} onChange={(e) => set('moduleDims', { ...draft.moduleDims, long: +e.target.value })} />
            ×
            <input type="number" style={{ width: 100 }} value={draft.moduleDims.short} onChange={(e) => set('moduleDims', { ...draft.moduleDims, short: +e.target.value })} />
            ±
            <input
              type="number"
              style={{ width: 80 }}
              value={draft.moduleDims.toleranceMm}
              onChange={(e) => set('moduleDims', { ...draft.moduleDims, toleranceMm: +e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Catégories (la première qui correspond gagne)</h2>
          <span className="hint">Un motif (regex) par ligne, testé sur le nom en majuscules sans accents.</span>
        </div>
        <div className="card-body">
          {draft.categories.map((c, i) => (
            <div className="rule-row" key={c.key}>
              <div>
                <CategoryChip category={c.key} />
              </div>
              <textarea rows={Math.max(2, c.patterns.length)} value={c.patterns.join('\n')} onChange={(e) => setPatterns(i, e.target.value)} />
              <div className="row" style={{ flexDirection: 'column' }}>
                <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">
                  ▲
                </button>
                <button className="btn small" onClick={() => move(i, 1)} disabled={i === draft.categories.length - 1} title="Descendre">
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Références article → catégorie</h2>
          <span className="hint">Une par ligne, ex. « 7-230-044 = MUR-LEGER ». Utilisé quand le nom ne suffit pas.</span>
        </div>
        <div className="card-body">
          <textarea rows={6} value={articleText} onChange={(e) => setArticleText(e.target.value)} />
          {articles.errors.length > 0 && <div className="error-box" style={{ marginTop: 8 }}>Lignes invalides : {articles.errors.join(' · ')}</div>}
        </div>
      </div>

      {compiled.error && <div className="error-box">{compiled.error}</div>}
      {status && <div className={status.kind === 'error' ? 'error-box' : 'card'}>{status.kind === 'ok' ? <div className="card-body">{status.text}</div> : status.text}</div>}
      <div className="row">
        <button className="btn primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Enregistrement…' : 'Enregistrer les règles'}
        </button>
        <button
          className="btn"
          onClick={() => {
            if (!window.confirm('Revenir aux règles par défaut ? (non enregistré tant que tu ne cliques pas « Enregistrer »)')) return;
            setDraft(structuredClone(DEFAULT_RULES));
            setArticleText('');
          }}
        >
          Règles par défaut
        </button>
      </div>
    </div>
  );
}
