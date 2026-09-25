// Réglages : règles de classification éditables sans toucher au code (§5.3). Elles valent pour tous
// les projets ; les corrections propres à un modèle se font dans SketchUp (extension Viewbox).
import { useMemo, useState } from 'react';
import type { Category, ClassificationRules, ModuleSize } from '../core/types';
import {
  DEFAULT_RULES,
  articleRefFromName,
  categoryFromName,
  categoryInfo,
  categoryKey,
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

function textToArticleMap(text: string, keys: Set<string>): { map: Record<string, Category>; errors: string[] } {
  const map: Record<string, Category> = {};
  const errors: string[] = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const m = t.match(/^([\d-]+)\s*[=:;]\s*(.+)$/);
    const cat = m ? categoryKey(m[2]) : '';
    if (!m || !keys.has(cat)) errors.push(`ligne ${i + 1} : « ${t} »`);
    else map[m[1]] = cat;
  });
  return { map, errors };
}

export function SettingsPage({ rules, onSaved }: { rules: ClassificationRules; onSaved: (r: ClassificationRules) => void }) {
  const [draft, setDraft] = useState<ClassificationRules>(() => structuredClone(rules));
  const [articleText, setArticleText] = useState(() => articleMapToText(rules.articleCategories));
  const [testName, setTestName] = useState('7-637-010 Glasswall Seamless 10mm 2500X1130X#1');
  const [newCategory, setNewCategory] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const keys = useMemo(() => new Set(draft.categories.map((c) => c.key)), [draft.categories]);
  const articles = useMemo(() => textToArticleMap(articleText, keys), [articleText, keys]);
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
  const updateCategory = (i: number, patch: Partial<ClassificationRules['categories'][number]>) =>
    setDraft((d) => ({ ...d, categories: d.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const c = [...d.categories];
      const j = i + dir;
      if (j < 0 || j >= c.length) return d;
      [c[i], c[j]] = [c[j], c[i]];
      return { ...d, categories: c };
    });
  const addCategory = () => {
    const key = categoryKey(newCategory);
    if (!key) return;
    if (keys.has(key)) {
      setStatus({ kind: 'error', text: `La catégorie ${key} existe déjà.` });
      return;
    }
    setDraft((d) => ({
      ...d,
      categories: [...d.categories, { key, label: newCategory.trim(), color: '#22d3ee', patterns: [], accessory: true, custom: true }],
    }));
    setNewCategory('');
    setStatus(null);
  };
  const updateSize = (i: number, patch: Partial<ModuleSize>) =>
    setDraft((d) => ({ ...d, moduleSizes: d.moduleSizes.map((z, j) => (j === i ? { ...z, ...patch } : z)) }));

  const save = async () => {
    if (compiled.error || articles.errors.length) {
      setStatus({ kind: 'error', text: 'Corrige les erreurs avant d’enregistrer.' });
      return;
    }
    if (!draft.moduleSizes.length) {
      setStatus({ kind: 'error', text: 'Garde au moins une taille de Viewbox.' });
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
        <div className="card-body hint">
          Ces règles valent pour <b>tous les projets</b> (vocabulaire de tes composants). Pour corriger un objet précis d’un modèle
          (« ceci est une porte spéciale », « ce frame fait 8400 × 2500 »), utilise dans SketchUp{' '}
          <b>Extensions › Viewbox › Réviser les catégories…</b> : tes choix sont enregistrés dans le fichier SketchUp et priment sur ces règles.
        </div>
      </div>

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
          <h2>Tailles de Viewbox (en plan)</h2>
          <span className="hint">Sert au contrôle des dimensions et à reconnaître une Viewbox sans nom.</span>
        </div>
        <div className="card-body">
          {draft.moduleSizes.map((z, i) => (
            <div className="row" key={i} style={{ marginBottom: 6 }}>
              <input type="text" style={{ width: 200 }} value={z.label} onChange={(e) => updateSize(i, { label: e.target.value })} />
              <input type="number" style={{ width: 100 }} value={z.long} onChange={(e) => updateSize(i, { long: +e.target.value })} />
              ×
              <input type="number" style={{ width: 100 }} value={z.short} onChange={(e) => updateSize(i, { short: +e.target.value })} />
              mm
              <button className="btn small ghost" onClick={() => set('moduleSizes', draft.moduleSizes.filter((_, j) => j !== i))} title="Supprimer">
                🗑
              </button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => set('moduleSizes', [...draft.moduleSizes, { label: 'Viewbox', long: 5900, short: 2500 }])}>
              + Ajouter une taille
            </button>
            <span className="hint">Tolérance ±</span>
            <input type="number" style={{ width: 80 }} value={draft.moduleToleranceMm} onChange={(e) => set('moduleToleranceMm', +e.target.value)} />
            <span className="hint">mm</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Catégories (la première qui correspond gagne)</h2>
          <span className="hint">Motifs : un par ligne (regex), testés sur le nom en majuscules sans accents. Couleur et libellé = légende des planches.</span>
        </div>
        <div className="card-body">
          {draft.categories.map((c, i) => {
            const info = categoryInfo(c.key, draft);
            return (
              <div className="rule-row" key={c.key} style={{ gridTemplateColumns: '220px 1fr auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <CategoryChip category={c.key} />
                  <input type="text" value={c.label ?? info.label} placeholder="Libellé de légende" onChange={(e) => updateCategory(i, { label: e.target.value })} />
                  <div className="row">
                    <input type="color" value={info.color} onChange={(e) => updateCategory(i, { color: e.target.value })} style={{ width: 40, height: 26, padding: 0, border: 'none', background: 'none' }} />
                    <label className="hint" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="checkbox" checked={c.accessory ?? false} onChange={(e) => updateCategory(i, { accessory: e.target.checked })} />
                      accessoire de façade
                    </label>
                  </div>
                </div>
                <textarea
                  rows={Math.max(3, c.patterns.length)}
                  value={c.patterns.join('\n')}
                  placeholder="(aucun motif : catégorie choisie uniquement à la main dans SketchUp)"
                  onChange={(e) => updateCategory(i, { patterns: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                />
                <div className="row" style={{ flexDirection: 'column' }}>
                  <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">
                    ▲
                  </button>
                  <button className="btn small" onClick={() => move(i, 1)} disabled={i === draft.categories.length - 1} title="Descendre">
                    ▼
                  </button>
                  {c.custom && (
                    <button className="btn small ghost" onClick={() => set('categories', draft.categories.filter((_, j) => j !== i))} title="Supprimer cette catégorie">
                      🗑
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 10 }}>
            <input
              type="text"
              style={{ width: 260 }}
              value={newCategory}
              placeholder="Nouvelle catégorie, ex. Porte orangerie"
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            />
            <button className="btn small" onClick={addCategory} disabled={!categoryKey(newCategory)}>
              + Ajouter la catégorie {categoryKey(newCategory) && `(${categoryKey(newCategory)})`}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Références article → catégorie</h2>
          <span className="hint">Une par ligne, ex. « 7-636-008 = MUR-LEGER ». Utilisé quand le nom ne suffit pas.</span>
        </div>
        <div className="card-body">
          <textarea rows={6} value={articleText} onChange={(e) => setArticleText(e.target.value)} />
          {articles.errors.length > 0 && <div className="error-box" style={{ marginTop: 8 }}>Lignes invalides (catégorie inconnue ?) : {articles.errors.join(' · ')}</div>}
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
