// Panneau de droite de l'éditeur : propriétés de l'élément sélectionné, de la planche, et cartouche du jeu.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SceneIndex } from '../../core/types';
import type { ViewKind } from '../../core/views';
import { VIEW_LABELS } from '../../core/views';
import { categoriesIn, subsetAll, subsetForLevel, subsetForModule } from '../../core/subset';
import type { LoadedScene } from '../../scene/loadedScene';
import type { DrawingSet, Image3dItem, LabelItem, Person, Sheet, SheetItem, TextItem, TitleBlockData, ViewportItem } from '../../sheets/types';
import { STANDARD_SCALES, fitScale } from '../../sheets/scales';
import type { ViewportData } from '../../sheets/SheetSvg';
import { actions, useEditor } from '../../sheets/store';
import { CategoryChip } from '../common';

/** Libellés fréquents des planches Viewbox (repères). */
export const FREQUENT_LABELS = ['Bleu extérieur', 'Blanc intérieur', 'Pas peindre', 'Pas peinture', 'Vitre', 'Blanc/Blanc', 'Bleu', 'Blanc'];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

type Scope = { kind: 'all' } | { kind: 'level'; level: number } | { kind: 'module'; moduleId: string };

function scopeOf(vp: ViewportItem, index: SceneIndex): Scope {
  const f = vp.request.view.kind !== 'custom' ? vp.request.view.frame : 'world';
  if (typeof f === 'object') return { kind: 'module', moduleId: f.moduleId };
  const inc = new Set(vp.request.subset.include);
  for (const lv of index.levels) {
    const s = subsetForLevel(index, lv.level);
    if (s.length === inc.size && s.every((id) => inc.has(id)) && index.levels.length > 1) return { kind: 'level', level: lv.level };
  }
  return { kind: 'all' };
}

function ViewportProps({ vp, data, scene }: { vp: ViewportItem; data?: ViewportData; scene: LoadedScene }) {
  const { index } = scene;
  const scope = scopeOf(vp, index);
  const kind = vp.request.view.kind === 'custom' ? 'top' : vp.request.view.kind;
  const categories = useMemo(() => categoriesIn(index, scene.look, vp.request.subset.include), [index, scene, vp.request.subset.include]);
  const hide = vp.request.subset.hideCategories ?? [];
  const setReq = (patch: Partial<ViewportItem['request']>, label: string, extra: Partial<ViewportItem> = {}) =>
    actions.updateItem(vp.id, { request: { ...vp.request, ...patch }, lineworkKey: undefined, center: undefined, ...extra } as Partial<SheetItem>, label);
  const setScope = (v: string) => {
    const s: Scope = v === 'all' ? { kind: 'all' } : v.startsWith('l:') ? { kind: 'level', level: Number(v.slice(2)) } : { kind: 'module', moduleId: v.slice(2) };
    const include = s.kind === 'all' ? subsetAll(index) : s.kind === 'level' ? subsetForLevel(index, s.level) : subsetForModule(index, s.moduleId);
    const frame = s.kind === 'module' ? { moduleId: s.moduleId } : ('world' as const);
    setReq({ subset: { ...vp.request.subset, include }, view: { kind, frame } }, 'Changer le sous-ensemble', { scale: 0 });
  };
  const fitNow = () => {
    if (!data?.lw) return;
    const b = data.lw.boundsMm;
    actions.updateItem(vp.id, { scale: fitScale(b, vp.rect), center: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] } as Partial<SheetItem>, 'Ajuster au cadre');
  };
  return (
    <>
      <Field label="Titre">
        <div className="row">
          <input type="text" value={vp.label ?? ''} onChange={(e) => actions.updateItem(vp.id, { label: e.target.value } as Partial<SheetItem>, 'Titre de vue')} style={{ flex: 1, width: 'auto' }} />
          <input type="checkbox" checked={vp.showLabel} onChange={(e) => actions.updateItem(vp.id, { showLabel: e.target.checked } as Partial<SheetItem>, 'Titre de vue')} title="Afficher le titre" />
        </div>
      </Field>
      <Field label="Sous-ensemble">
        <select value={scope.kind === 'all' ? 'all' : scope.kind === 'level' ? `l:${scope.level}` : `m:${scope.moduleId}`} onChange={(e) => setScope(e.target.value)}>
          <option value="all">Tout le modèle</option>
          {index.levels.length > 1 &&
            index.levels.map((l) => (
              <option key={l.level} value={`l:${l.level}`}>
                {l.label}
              </option>
            ))}
          {[...index.modules]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((m) => (
              <option key={m.id} value={`m:${m.id}`}>
                {m.id} (vues relatives à la Viewbox)
              </option>
            ))}
        </select>
      </Field>
      <Field label="Vue">
        <select value={kind} onChange={(e) => setReq({ view: { kind: e.target.value as ViewKind, frame: vp.request.view.kind === 'custom' ? 'world' : vp.request.view.frame } }, 'Changer la vue', { scale: 0 })}>
          {(['top', 'front', 'back', 'left', 'right', 'bottom'] as ViewKind[]).map((k) => (
            <option key={k} value={k}>
              {VIEW_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Échelle">
        <div className="row">
          <select value={vp.scale} onChange={(e) => actions.updateItem(vp.id, { scale: Number(e.target.value) } as Partial<SheetItem>, 'Échelle')} style={{ flex: 1, width: 'auto' }}>
            {!STANDARD_SCALES.includes(vp.scale) && <option value={vp.scale}>{vp.scale ? `1:${vp.scale}` : '—'}</option>}
            {STANDARD_SCALES.map((s) => (
              <option key={s} value={s}>
                1:{s}
              </option>
            ))}
          </select>
          <button className="btn small" disabled={!data?.lw} onClick={fitNow} title="Plus grande échelle normalisée qui tient dans le cadre, vue recentrée">
            Ajuster
          </button>
        </div>
      </Field>
      <Field label="Masquer">
        <div className="chips-select">
          {categories.map((c) => (
            <label key={c} className={`chip-toggle${hide.includes(c) ? ' off' : ''}`}>
              <input
                type="checkbox"
                checked={hide.includes(c)}
                onChange={(e) =>
                  setReq({ subset: { ...vp.request.subset, hideCategories: e.target.checked ? [...hide, c] : hide.filter((x) => x !== c) } }, 'Masquer une catégorie')
                }
              />
              <CategoryChip category={c} />
            </label>
          ))}
        </div>
      </Field>
      <div className="prop-checks">
        <label className="check">
          <input type="checkbox" checked={vp.request.style.glassTransparent} onChange={(e) => setReq({ style: { ...vp.request.style, glassTransparent: e.target.checked } }, 'Style')} />
          Vitres transparentes
        </label>
        <label className="check">
          <input type="checkbox" checked={vp.request.style.hiddenLines} onChange={(e) => setReq({ style: { ...vp.request.style, hiddenLines: e.target.checked } }, 'Style')} />
          Lignes cachées
        </label>
        <label className="check">
          <input type="checkbox" checked={vp.request.style.colorByCategory} onChange={(e) => setReq({ style: { ...vp.request.style, colorByCategory: e.target.checked } }, 'Style')} />
          Colorer par catégorie (dessus)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!vp.overlays?.moduleOutlines}
            onChange={(e) => actions.updateItem(vp.id, { overlays: { ...vp.overlays, moduleOutlines: e.target.checked } } as Partial<SheetItem>, 'Contours des Viewbox')}
          />
          Contour des Viewbox
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!vp.overlays?.moduleNumbers}
            onChange={(e) => actions.updateItem(vp.id, { overlays: { ...vp.overlays, moduleNumbers: e.target.checked } } as Partial<SheetItem>, 'Numéros des Viewbox')}
          />
          Numéros des Viewbox
        </label>
      </div>
      {data?.stale && (
        <div className="stale-box">
          Le modèle a changé depuis la mise en page de cette vue.{' '}
          <button className="btn small primary" onClick={() => actions.updateItem(vp.id, { lineworkKey: undefined, center: undefined } as Partial<SheetItem>, 'Recalculer')}>
            Recalculer
          </button>
        </div>
      )}
      <div className="hint">Alt + glisser dans la vue : recadrer son contenu.</div>
    </>
  );
}

function LabelProps({ label, suggestions }: { label: LabelItem; suggestions: string[] }) {
  return (
    <>
      <Field label="Texte">
        <input type="text" value={label.text} autoFocus onChange={(e) => actions.updateItem(label.id, { text: e.target.value } as Partial<SheetItem>, 'Texte du repère')} />
      </Field>
      <Field label="Style">
        <select value={label.style} onChange={(e) => actions.updateItem(label.id, { style: e.target.value } as Partial<SheetItem>, 'Style du repère')}>
          <option value="bold">Gras</option>
          <option value="normal">Normal</option>
        </select>
      </Field>
      <div className="suggestions">
        {[...new Set([...suggestions, ...FREQUENT_LABELS])].map((s) => (
          <button key={s} className="btn small ghost" onClick={() => actions.updateItem(label.id, { text: s } as Partial<SheetItem>, 'Texte du repère')}>
            {s}
          </button>
        ))}
      </div>
      <div className="hint">{label.anchor3d ? 'Ancré sur un point du modèle : il suit la vue.' : 'Ancré sur la planche.'}</div>
    </>
  );
}

function TextProps({ t }: { t: TextItem }) {
  return (
    <>
      <Field label="Texte">
        <textarea rows={4} value={t.text} onChange={(e) => actions.updateItem(t.id, { text: e.target.value } as Partial<SheetItem>, 'Texte')} />
      </Field>
      <Field label="Hauteur (mm)">
        <input type="number" min={1} max={60} step={0.5} value={t.size} onChange={(e) => actions.updateItem(t.id, { size: Number(e.target.value) || 3 } as Partial<SheetItem>, 'Taille du texte')} />
      </Field>
      <div className="prop-checks">
        <label className="check">
          <input type="checkbox" checked={!!t.bold} onChange={(e) => actions.updateItem(t.id, { bold: e.target.checked } as Partial<SheetItem>, 'Gras')} />
          Gras
        </label>
        <label className="check">
          <input type="checkbox" checked={t.font === 'sans'} onChange={(e) => actions.updateItem(t.id, { font: e.target.checked ? 'sans' : 'serif' } as Partial<SheetItem>, 'Police')} />
          Police Arial
        </label>
        <select value={t.align ?? 'left'} onChange={(e) => actions.updateItem(t.id, { align: e.target.value } as Partial<SheetItem>, 'Alignement')} style={{ width: 110 }}>
          <option value="left">À gauche</option>
          <option value="center">Centré</option>
          <option value="right">À droite</option>
        </select>
      </div>
    </>
  );
}

function ImageProps({ it, onRecapture }: { it: Image3dItem; onRecapture: (view: string) => void }) {
  const [view, setView] = useState('iso-sw|perspective');
  return (
    <>
      <Field label="Titre">
        <div className="row">
          <input type="text" value={it.label ?? ''} onChange={(e) => actions.updateItem(it.id, { label: e.target.value } as Partial<SheetItem>, 'Titre')} style={{ flex: 1, width: 'auto' }} />
          <input type="checkbox" checked={!!it.showLabel} onChange={(e) => actions.updateItem(it.id, { showLabel: e.target.checked } as Partial<SheetItem>, 'Titre')} />
        </div>
      </Field>
      <Field label="Refaire la capture">
        <div className="row">
          <select value={view} onChange={(e) => setView(e.target.value)} style={{ flex: 1, width: 'auto' }}>
            {['iso-sw', 'iso-se', 'iso-nw', 'iso-ne'].map((k) => (
              <optgroup key={k} label={k.replace('iso-', 'Iso ').toUpperCase().replace('W', 'O')}>
                <option value={`${k}|perspective`}>{k.replace('iso-', 'Iso ').toUpperCase().replace('W', 'O')} — perspective</option>
                <option value={`${k}|orthographic`}>{k.replace('iso-', 'Iso ').toUpperCase().replace('W', 'O')} — axonométrie</option>
              </optgroup>
            ))}
          </select>
          <button className="btn small" onClick={() => onRecapture(view)}>
            Capturer
          </button>
        </div>
      </Field>
      <div className="hint">Image {it.width} × {it.height} px (seul élément non vectoriel de la planche).</div>
    </>
  );
}

function TitleBlockForm({ doc }: { doc: DrawingSet }) {
  const tb = doc.titleBlock;
  const set = (patch: Partial<TitleBlockData>) =>
    useEditor.getState().apply('Cartouche', (d) => {
      Object.assign(d.titleBlock, patch);
    });
  const text = (key: keyof TitleBlockData, label: string) => (
    <Field label={label}>
      <input type="text" value={tb[key] as string} onChange={(e) => set({ [key]: e.target.value } as Partial<TitleBlockData>)} />
    </Field>
  );
  const person = (key: 'salesEngineer' | 'technicalManager' | 'projectManager', label: string) => (
    <Field label={label}>
      <div className="row">
        <input type="text" placeholder="Nom" value={tb[key].name} onChange={(e) => set({ [key]: { ...tb[key], name: e.target.value } as Person })} style={{ flex: 1, width: 'auto' }} />
        <input type="text" placeholder="e-mail" value={tb[key].email} onChange={(e) => set({ [key]: { ...tb[key], email: e.target.value } as Person })} style={{ flex: 1.3, width: 'auto' }} />
      </div>
    </Field>
  );
  return (
    <>
      {text('client', 'Client')}
      {text('address', 'Adresse d’installation')}
      {text('projectName', 'Nom du projet')}
      {text('projectNumber', 'N° de projet')}
      {text('projectDate', 'Date du projet')}
      {text('issue', 'Issue')}
      {person('salesEngineer', 'Sales engineer')}
      {person('technicalManager', 'Technical manager')}
      {person('projectManager', 'Project manager')}
      {text('drawnBy', 'Dessiné par')}
      {text('createdDate', 'Date de création')}
      {text('drawingVersion', 'Version')}
      {text('deadline', 'Validation avant le')}
      {text('description', 'Description (couverture)')}
      <Field label="General notes">
        <textarea
          rows={8}
          value={doc.notes}
          onChange={(e) => useEditor.getState().apply('Notes générales', (d) => void (d.notes = e.target.value))}
          style={{ fontFamily: 'inherit' }}
        />
      </Field>
    </>
  );
}

export function PropertiesPanel({
  doc,
  sheet,
  scene,
  viewData,
  suggestionsFor,
  onRecapture,
}: {
  doc: DrawingSet;
  sheet: Sheet;
  scene: LoadedScene;
  viewData: (vp: ViewportItem) => ViewportData | undefined;
  suggestionsFor: (label: LabelItem) => string[];
  onRecapture: (item: Image3dItem, view: string) => void;
}) {
  const selection = useEditor((s) => s.selection);
  const [tab, setTab] = useState<'item' | 'titleblock'>('item');
  const items = sheet.items.filter((i) => selection.includes(i.id));
  const one = items.length === 1 ? items[0] : null;
  return (
    <aside className="sheet-props">
      <div className="tabs">
        <button className={`tab ${tab === 'item' ? 'active' : ''}`} onClick={() => setTab('item')}>
          {one ? 'Élément' : 'Planche'}
        </button>
        <button className={`tab ${tab === 'titleblock' ? 'active' : ''}`} onClick={() => setTab('titleblock')}>
          Cartouche
        </button>
      </div>
      <div className="sheet-props-body">
        {tab === 'titleblock' ? (
          <TitleBlockForm doc={doc} />
        ) : one ? (
          <>
            <div className="prop-title">
              {one.type === 'viewport' ? 'Fenêtre de vue' : one.type === 'image3d' ? 'Image 3D' : one.type === 'label' ? 'Repère' : one.type === 'text' ? 'Texte' : one.type === 'logo' ? 'Logo' : 'Forme'}
              {one.locked && <span className="badge">verrouillé</span>}
            </div>
            {one.type === 'viewport' && <ViewportProps vp={one} data={viewData(one)} scene={scene} />}
            {one.type === 'label' && <LabelProps label={one} suggestions={suggestionsFor(one)} />}
            {one.type === 'text' && <TextProps t={one} />}
            {one.type === 'image3d' && <ImageProps it={one} onRecapture={(v) => onRecapture(one, v)} />}
          </>
        ) : items.length > 1 ? (
          <div className="hint">{items.length} éléments sélectionnés : aligner / répartir depuis la barre d’outils.</div>
        ) : (
          <>
            <Field label="Numéro">
              <input type="text" value={sheet.number} onChange={(e) => actions.updateSheet(sheet.id, { number: e.target.value })} />
            </Field>
            <Field label="Titre (encadré)">
              <input type="text" value={sheet.title} onChange={(e) => actions.updateSheet(sheet.id, { title: e.target.value })} />
            </Field>
            <div className="hint" style={{ marginTop: 8 }}>
              Format {sheet.paper} paysage. Clique un élément pour le modifier ; Maj + clic pour en sélectionner plusieurs. Molette : zoom · molette enfoncée ou
              Espace + glisser : se déplacer · Suppr : supprimer · Ctrl+Z / Ctrl+Y : annuler / rétablir · Ctrl+C / Ctrl+V : copier / coller (aussi d’une
              planche à l’autre) · flèches : décaler de 1 mm (Maj : 5 mm).
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
