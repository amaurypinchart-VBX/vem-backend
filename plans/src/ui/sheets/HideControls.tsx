// Planches : « Masquer » d'une fenêtre de vue (catégories, éléments — plafond tendu, éclairage, cadres textile… —,
// pièces masquées en cliquant, « Vue du sol ») et dialogue « Masquer sur tout le jeu ».
import { useMemo, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import { categoriesIn, subsetAll } from '../../core/subset';
import { FLOOR_CUT_DEFAULT, tagHideRule, tagsInSubset } from '../../core/subsetHide';
import { TEXTILE_TAG } from '../../core/customViews/tags';
import type { LineworkRequest, LineworkSubset, SubsetHideRule } from '../../linework/types';
import { hideRuleCounts, subsetEnv, subsetScope } from '../../linework/subset';
import type { DrawingSet, ViewportItem } from '../../sheets/types';
import type { HideTarget } from '../../sheets/hideSet';
import { hiddenCount, setHidden, standardViewports, withHidden } from '../../sheets/hideSet';
import { actions } from '../../sheets/store';
import { CategoryChip } from '../common';

/** Étiquettes proposées en premier (les plus demandées sur les vues de dessus). */
const TAG_ORDER = ['plafond-tendu', 'fixations-plafond', 'eclairage', TEXTILE_TAG, 'mobilier', 'logo', 'couverture'];

function orderTags<T extends { tag: string }>(list: T[]): T[] {
  const rank = (t: string) => (TAG_ORDER.includes(t) ? TAG_ORDER.indexOf(t) : 99);
  return [...list].sort((a, b) => rank(a.tag) - rank(b.tag));
}

export function ViewportHide({
  vp,
  scene,
  onRequest,
  onHideTool,
  onSetWide,
  onDimFrames,
}: {
  vp: ViewportItem;
  scene: LoadedScene;
  /** nouvelle demande pour la vue (même cadrage, calcul refait) */
  onRequest: (req: LineworkRequest, label: string) => void;
  onHideTool?: () => void;
  onSetWide?: () => void;
  onDimFrames?: (on: boolean) => void;
}) {
  const subset = vp.request.subset;
  const categories = useMemo(() => categoriesIn(scene.index, scene.look, subset.include), [scene, subset.include]);
  const tags = useMemo(() => orderTags(tagsInSubset(subsetEnv(scene).tags, subsetScope(scene, subset.include))), [scene, subset.include]);
  const counts = useMemo(() => hideRuleCounts(scene, subset), [scene, subset]);
  const hideCats = subset.hideCategories ?? [];
  const rules = subset.hide ?? [];
  const tagRule = (tag: string) => rules.find((r) => r.match.viewTags?.length === 1 && r.match.viewTags[0] === tag && Object.keys(r.match).length === 1);
  const clickRules = rules.filter((r) => !(r.match.viewTags?.length === 1 && Object.keys(r.match).length === 1));
  const set = (s: LineworkSubset, label: string) => onRequest({ ...vp.request, subset: s }, label);
  const toggle = (t: HideTarget, on: boolean, label: string) => set(withHidden(subset, t, on), label);
  const top = vp.request.view.kind === 'top';
  const cut = vp.request.floorCut;
  const [cutText, setCutText] = useState(String(cut ?? FLOOR_CUT_DEFAULT));
  const setCut = (h: number | null) => {
    const req: LineworkRequest = { ...vp.request };
    if (h == null) delete req.floorCut;
    else req.floorCut = h;
    onRequest(req, h == null ? 'Vue du sol retirée' : `Vue du sol (coupe à ${h} mm)`);
  };
  const hasFrames = tags.some((t) => t.tag === TEXTILE_TAG);
  return (
    <div className="prop-field vp-hide" data-testid="vp-hide">
      <span>Masquer</span>
      {top && (
        <div className="floor-cut" title="Coupe horizontale dans chaque Viewbox : toiture, plafond tendu, éclairage, haut des cadres retirés ; plancher, murs, vitres, portes et poteaux coupés restent — pour prévoir le passage des câbles">
          <label className="check">
            <input type="checkbox" data-testid="floor-cut" checked={cut != null} onChange={(e) => setCut(e.target.checked ? Number(cutText) || FLOOR_CUT_DEFAULT : null)} />
            🟫 <b>Vue du sol</b> : coupe à
          </label>
          <input
            type="number"
            min={100}
            max={3000}
            step={50}
            value={cutText}
            onChange={(e) => setCutText(e.target.value)}
            onBlur={() => cut != null && Number(cutText) > 0 && Number(cutText) !== cut && setCut(Number(cutText))}
            onKeyDown={(e) => e.key === 'Enter' && cut != null && Number(cutText) > 0 && setCut(Number(cutText))}
            style={{ width: 70 }}
          />
          <span className="hint">mm au-dessus du plancher</span>
        </div>
      )}
      <div className="hint">Catégories</div>
      <div className="chips-select">
        {categories.map((c) => (
          <label key={c} className={`chip-toggle${hideCats.includes(c) ? ' off' : ''}`}>
            <input type="checkbox" checked={hideCats.includes(c)} onChange={(e) => toggle({ kind: 'category', key: c }, e.target.checked, 'Masquer une catégorie')} />
            <CategoryChip category={c} />
          </label>
        ))}
      </div>
      {tags.length > 0 && (
        <>
          <div className="hint">Éléments (reconnus par leur nom ou mémorisés)</div>
          <div className="chips-select" data-testid="vp-hide-tags">
            {tags.map((t) => {
              const on = !!tagRule(t.tag);
              return (
                <label key={t.tag} className={`chip-toggle${on ? ' off' : ''}`} data-tag={t.tag}>
                  <input type="checkbox" checked={on} onChange={(e) => toggle({ kind: 'rule', rule: tagHideRule(t.tag, t.label) }, e.target.checked, `${e.target.checked ? 'Masquer' : 'Montrer'} : ${t.label}`)} />
                  <span className="chip tag-chip">
                    {t.label} <span className="muted">{t.count}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
      {clickRules.length > 0 && (
        <>
          <div className="hint">Masqués en cliquant</div>
          <div className="chips-select" data-testid="vp-hide-rules">
            {clickRules.map((r) => (
              <span key={r.id} className={`chip rule-chip${counts.get(r.id) === 0 ? ' warn' : ''}`} title={counts.get(r.id) === 0 ? 'Aucune pièce trouvée dans cette vue' : `${counts.get(r.id) ?? 0} pièce(s)`}>
                {counts.get(r.id) === 0 ? '⚠ ' : ''}
                {r.label}
                <button className="chip-x" onClick={() => toggle({ kind: 'rule', rule: r }, false, `Montrer : ${r.label}`)} title="Montrer à nouveau">
                  ✕
                </button>
              </span>
            ))}
          </div>
        </>
      )}
      <div className="row wrap">
        {onHideTool && (
          <button className="btn small" data-testid="hide-tool" onClick={onHideTool} title="Clique une pièce dans une vue : la masquer seule, dans toutes les Viewbox, tout ce type, ou son étiquette partout">
            🖱 Masquer en cliquant
          </button>
        )}
        {onSetWide && (
          <button className="btn small ghost" onClick={onSetWide} title="Masquer / montrer une catégorie ou un élément sur toutes les vues du jeu d’un coup">
            ⤢ Sur tout le jeu…
          </button>
        )}
      </div>
      {hasFrames && onDimFrames && (
        <label className="check" title="« Coter automatiquement » ajoute la position et les dimensions de chaque cadre textile vu de face (chaîne en haut, hauteurs à droite)">
          <input type="checkbox" data-testid="dim-frames" checked={!!vp.dimFrames} onChange={(e) => onDimFrames(e.target.checked)} />
          Coter les cadres textile
        </label>
      )}
    </div>
  );
}

/** Une ligne du dialogue « Masquer sur tout le jeu ». */
interface WideRow {
  key: string;
  label: string;
  target: HideTarget;
  category?: string;
}

export function SetHideDialog({ doc, scene, onClose }: { doc: DrawingSet; scene: LoadedScene; onClose: () => void }) {
  const rows = useMemo<WideRow[]>(() => {
    const all = subsetAll(scene.index);
    const out: WideRow[] = [];
    for (const t of orderTags(tagsInSubset(subsetEnv(scene).tags, subsetScope(scene, all))))
      out.push({ key: `t:${t.tag}`, label: `${t.label} (${t.count})`, target: { kind: 'rule', rule: tagHideRule(t.tag, t.label) } });
    const seen = new Set<string>();
    for (const vp of standardViewports(doc))
      for (const r of vp.request.subset.hide ?? []) {
        if (r.match.viewTags?.length === 1 && Object.keys(r.match).length === 1) continue;
        const k = JSON.stringify(r.match);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ key: `r:${k}`, label: r.label, target: { kind: 'rule', rule: r as SubsetHideRule } });
      }
    for (const c of categoriesIn(scene.index, scene.look, all)) out.push({ key: `c:${c}`, label: c, target: { kind: 'category', key: c }, category: c });
    return out;
  }, [doc, scene]);
  const apply = (row: WideRow, on: boolean) => {
    actions.editDoc(`${on ? 'Masquer' : 'Montrer'} ${row.category ?? row.label} sur toutes les vues`, (d) => void setHidden(d as DrawingSet, row.target, on));
  };
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal set-hide" role="dialog" aria-label="Masquer sur tout le jeu" data-testid="set-hide">
        <div className="card-head">
          <h2>🙈 Masquer sur toutes les vues du jeu</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="hint" style={{ marginBottom: 8 }}>
            Chaque vue garde son échelle et son cadrage ; elle est recalculée. Les planches de détail des cadres textile, les vues spéciales et le
            plan d’implantation ne changent pas. Les images 3D ne sont pas modifiées (« 📷 Recapturer »).
          </div>
          <table className="list set-hide-table">
            <tbody>
              {rows.map((r) => {
                const c = hiddenCount(doc, r.target);
                return (
                  <tr key={r.key} data-row={r.key}>
                    <td>{r.category ? <CategoryChip category={r.category} /> : <span className="chip tag-chip">{r.label}</span>}</td>
                    <td className="hint">
                      masqué sur {c.hidden} / {c.total} vue{c.total > 1 ? 's' : ''}
                    </td>
                    <td className="actions">
                      <button className="btn small" disabled={c.hidden === c.total} onClick={() => apply(r, true)}>
                        Masquer partout
                      </button>
                      <button className="btn small ghost" disabled={!c.hidden} onClick={() => apply(r, false)}>
                        Montrer partout
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button className="btn small primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
