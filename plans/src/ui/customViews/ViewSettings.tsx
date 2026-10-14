// Réglages › « Vues spéciales » : étiquettes de vue (base dans le code + mémorisées pour tous les projets) et
// préréglages partagés (app_settings › plans.viewTags / plans.viewPresets). Modifiable par admin et technical manager.
import { useEffect, useState } from 'react';
import type { VemUser } from '../../api/vem';
import { vem } from '../../api/vem';
import type { ViewTagRule } from '../../core/customViews/types';
import { BASE_VIEW_TAGS, cleanViewTags } from '../../core/customViews/tags';
import type { SharedPresetRecord } from '../../core/customViews/presets';
import { VIEW_PRESETS, cleanSharedPresetRecords } from '../../core/customViews/presets';
import { downloadText } from '../common';

const TAGS_KEY = 'plans.viewTags';
const PRESETS_KEY = 'plans.viewPresets';

const matchText = (r: ViewTagRule) =>
  r.match.definition ? `définition « ${r.match.definition} »` : r.match.articleRef ? `référence ${r.match.articleRef}` : `nom contenant /${r.match.namePattern}/`;

export function ViewSettings() {
  const [me, setMe] = useState<VemUser | null>(null);
  const [tags, setTags] = useState<ViewTagRule[]>([]);
  const [presets, setPresets] = useState<SharedPresetRecord[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [newTag, setNewTag] = useState('plafond-tendu');
  const [newLabel, setNewLabel] = useState('');
  const [newPattern, setNewPattern] = useState('');

  useEffect(() => {
    vem.me().then(setMe).catch(() => {});
    vem
      .getSetting<unknown>(TAGS_KEY)
      .then((v) => setTags(cleanViewTags(v)))
      .catch((e) => setError((e as Error).message));
    vem
      .getSetting<unknown>(PRESETS_KEY)
      .then((v) => setPresets(cleanSharedPresetRecords(v)))
      .catch((e) => setError((e as Error).message));
  }, []);

  const editor = me?.role === 'admin' || me?.role === 'technical_manager';
  const allTags = [...BASE_VIEW_TAGS.map((t) => ({ tag: t.tag, label: t.label })), ...tags.filter((t) => !BASE_VIEW_TAGS.some((b) => b.tag === t.tag)).map((t) => ({ tag: t.tag, label: t.label }))];
  const uniqTags = allTags.filter((t, i) => allTags.findIndex((x) => x.tag === t.tag) === i);

  const saveTags = async (next: ViewTagRule[], msg: string) => {
    setError('');
    try {
      await vem.saveSetting(TAGS_KEY, next);
      setTags(next);
      setInfo(msg);
    } catch (e) {
      setError(`Non enregistré : ${(e as Error).message}`);
    }
  };
  const savePresets = async (next: SharedPresetRecord[], msg: string) => {
    setError('');
    try {
      await vem.saveSetting(PRESETS_KEY, next);
      setPresets(next);
      setInfo(msg);
    } catch (e) {
      setError(`Non enregistré : ${(e as Error).message}`);
    }
  };

  const importJson = (kind: 'tags' | 'presets') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const raw = JSON.parse(await f.text());
        if (kind === 'tags') {
          const add = cleanViewTags(raw);
          const merged = [...tags.filter((t) => !add.some((a) => JSON.stringify(a.match) === JSON.stringify(t.match))), ...add];
          await saveTags(merged, `${add.length} étiquette(s) importée(s).`);
        } else {
          const add = cleanSharedPresetRecords(raw);
          const merged = [...presets.filter((p) => !add.some((a) => a.key === p.key)), ...add];
          await savePresets(merged, `${add.length} préréglage(s) importé(s).`);
        }
      } catch (e) {
        setError(`Fichier illisible : ${(e as Error).message}`);
      }
    };
    input.click();
  };

  return (
    <div className="page" data-testid="view-settings">
      {!editor && <div className="hint">Lecture seule : seuls les administrateurs et technical managers modifient les étiquettes et préréglages partagés.</div>}
      {error && <div className="error-box">{error}</div>}
      {info && <div className="hint" style={{ color: 'var(--ok)' }}>{info}</div>}

      <div className="card">
        <div className="card-head">
          <h2>Étiquettes de vue mémorisées</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={() => downloadText('etiquettes-de-vue.json', JSON.stringify(tags, null, 2), 'application/json')}>
            ⬇ Exporter (JSON)
          </button>
          {editor && (
            <button className="btn small ghost" onClick={() => importJson('tags')}>
              ⬆ Importer (JSON)
            </button>
          )}
        </div>
        <div className="card-body">
          <div className="hint" style={{ marginBottom: 8 }}>
            Une étiquette dit « cette pièce est un plafond tendu, un spot… » pour tous les projets. Elle se mémorise d’un clic dans Vues 2D › Vues spéciales (bulle « Mémoriser comme »), par
            définition SketchUp. Elle passe avant les motifs de nom de la base. Elle ne change jamais l’étude structure.
          </div>
          {!tags.length && <div className="hint">Aucune étiquette mémorisée.</div>}
          {tags.length > 0 && (
            <table className="list" data-testid="vs-tags">
              <thead>
                <tr>
                  <th>Étiquette</th>
                  <th>Pièces concernées</th>
                  <th>Par</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tags.map((t, i) => (
                  <tr key={i}>
                    <td>
                      {editor ? (
                        <select
                          value={t.tag}
                          onChange={(e) => {
                            const tag = e.target.value;
                            const label = uniqTags.find((x) => x.tag === tag)?.label ?? tag;
                            void saveTags(
                              tags.map((x, k) => (k === i ? { ...x, tag, label } : x)),
                              'Étiquette modifiée.',
                            );
                          }}
                        >
                          {uniqTags.map((x) => (
                            <option key={x.tag} value={x.tag}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        t.label
                      )}
                    </td>
                    <td>{matchText(t)}</td>
                    <td className="hint">
                      {t.by ?? ''} {t.at ? new Date(t.at).toLocaleDateString('fr-FR') : ''}
                    </td>
                    <td className="actions">
                      {editor && (
                        <button className="btn small ghost" onClick={() => void saveTags(tags.filter((_, k) => k !== i), 'Étiquette supprimée.')}>
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {editor && (
            <div className="row" style={{ marginTop: 10 }}>
              <span className="hint">Ajouter par motif de nom :</span>
              <select value={newTag} onChange={(e) => setNewTag(e.target.value)} style={{ width: 200 }}>
                {uniqTags.map((x) => (
                  <option key={x.tag} value={x.tag}>
                    {x.label}
                  </option>
                ))}
                <option value="__new">＋ nouvelle étiquette…</option>
              </select>
              {newTag === '__new' && <input type="text" placeholder="Nom (ex. Écran LED)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ width: 180 }} />}
              <input type="text" placeholder="motif (ex. barrisol|toile)" value={newPattern} onChange={(e) => setNewPattern(e.target.value)} style={{ width: 200 }} />
              <button
                className="btn small"
                disabled={!newPattern.trim() || (newTag === '__new' && !newLabel.trim())}
                onClick={() => {
                  const label = newTag === '__new' ? newLabel.trim() : uniqTags.find((x) => x.tag === newTag)?.label ?? newTag;
                  const tag = newTag === '__new' ? label : newTag;
                  const add = cleanViewTags([{ tag, label, match: { namePattern: newPattern.trim() }, by: [me?.firstName, me?.lastName].filter(Boolean).join(' '), at: new Date().toISOString() }]);
                  if (!add.length) return setError('Motif invalide.');
                  void saveTags([...tags, ...add], 'Étiquette ajoutée.');
                  setNewPattern('');
                  setNewLabel('');
                }}
              >
                Ajouter
              </button>
            </div>
          )}
          <details style={{ marginTop: 10 }}>
            <summary className="hint">Étiquettes de base (motifs de nom, dans le code)</summary>
            <table className="list">
              <tbody>
                {BASE_VIEW_TAGS.map((t) => (
                  <tr key={t.tag}>
                    <td>{t.label}</td>
                    <td className="hint">
                      {[...(t.patterns ?? []), ...(t.categories ?? []).map((c) => `catégorie ${c}`), ...(t.categoryPrefixes ?? []).map((c) => `catégorie ${c}*`)].join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Préréglages partagés</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={() => downloadText('prereglages-vues.json', JSON.stringify(presets, null, 2), 'application/json')}>
            ⬇ Exporter (JSON)
          </button>
          {editor && (
            <button className="btn small ghost" onClick={() => importJson('presets')}>
              ⬆ Importer (JSON)
            </button>
          )}
        </div>
        <div className="card-body">
          <div className="hint" style={{ marginBottom: 8 }}>
            Une vue enregistrée avec « ⭐ Préréglage » dans Vues spéciales, réutilisable dans tous les projets. Les {VIEW_PRESETS.length} préréglages de base restent toujours proposés.
          </div>
          {!presets.length && <div className="hint">Aucun préréglage partagé.</div>}
          {presets.length > 0 && (
            <table className="list" data-testid="vs-presets">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Explication</th>
                  <th>Actif</th>
                  <th>Par</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {presets.map((p) => (
                  <tr key={p.key}>
                    <td>
                      {editor ? (
                        <input type="text" defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && void savePresets(presets.map((x) => (x.key === p.key ? { ...x, name: e.target.value.trim() } : x)), 'Préréglage renommé.')} />
                      ) : (
                        p.name
                      )}
                    </td>
                    <td>
                      {editor ? (
                        <input type="text" defaultValue={p.description} onBlur={(e) => e.target.value !== p.description && void savePresets(presets.map((x) => (x.key === p.key ? { ...x, description: e.target.value } : x)), 'Explication modifiée.')} />
                      ) : (
                        p.description
                      )}
                    </td>
                    <td>
                      <input type="checkbox" checked={!p.disabled} disabled={!editor} onChange={(e) => void savePresets(presets.map((x) => (x.key === p.key ? { ...x, disabled: !e.target.checked || undefined } : x)), e.target.checked ? 'Préréglage réactivé.' : 'Préréglage désactivé.')} />
                    </td>
                    <td className="hint">
                      {p.by ?? ''} {p.at ? new Date(p.at).toLocaleDateString('fr-FR') : ''}
                    </td>
                    <td className="actions">
                      {editor && (
                        <button className="btn small ghost" onClick={() => window.confirm(`Supprimer le préréglage « ${p.name} » ?`) && void savePresets(presets.filter((x) => x.key !== p.key), 'Préréglage supprimé.')}>
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
