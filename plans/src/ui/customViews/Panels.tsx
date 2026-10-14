// Panneaux de l'éditeur de vues spéciales : Direction · Coupes · Éléments retirés · Disposition · Style.
// Chaque panneau reçoit la vue et renvoie une vue modifiée (l'historique annuler / rétablir est dans la page).
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { CameraDir, CustomViewSpec, CutAxis, CutPlane, LevelRef, ModuleRef, SectionBox, ViewLayout, ViewStyle, VisibilityRule } from '../../core/customViews/types';
import { MAX_CUTS } from '../../core/customViews/types';
import type { ModuleRefs } from '../../core/customViews/refs';
import { LEVEL_REF_LABELS, describeRef } from '../../core/customViews/refs';
import { moveRule } from '../../core/customViews/editor';

type Change = (next: CustomViewSpec) => void;

export function Panel({ title, children, open = true, testId }: { title: string; children: ReactNode; open?: boolean; testId?: string }) {
  const [o, setO] = useState(open);
  return (
    <div className="card cv-panel" data-testid={testId}>
      <button className="card-head cv-panel-head" onClick={() => setO(!o)}>
        <h2>{title}</h2>
        <div className="spacer" />
        <span className="hint">{o ? '▾' : '▸'}</span>
      </button>
      {o && <div className="card-body cv-panel-body">{children}</div>}
    </div>
  );
}

const DIRS: Array<[CameraDir, string]> = [
  ['top', 'Dessus'],
  ['bottom', 'Dessous'],
  ['front', 'Avant'],
  ['back', 'Arrière'],
  ['left', 'Gauche'],
  ['right', 'Droite'],
  ['iso', 'Iso'],
  ['iso-below', 'Iso de dessous'],
];

export function DirectionPanel({ spec, onChange, modules }: { spec: CustomViewSpec; onChange: Change; modules: string[] }) {
  const cam = spec.camera;
  const set = (patch: Partial<CustomViewSpec['camera']>) => onChange({ ...spec, camera: { ...cam, ...patch } });
  return (
    <Panel title="Direction" testId="cv-direction">
      <div className="cv-cube">
        {DIRS.map(([d, l]) => (
          <button key={d} className={`btn small${cam.dir === d && !(d === 'bottom' && cam.reflected) ? ' primary' : ''}`} onClick={() => set({ dir: d, reflected: undefined, isoCorner: d.startsWith('iso') ? cam.isoCorner ?? 'fl' : undefined })}>
            {l}
          </button>
        ))}
        <button className={`btn small${cam.dir === 'bottom' && cam.reflected ? ' primary' : ''}`} onClick={() => set({ dir: 'bottom', reflected: true, isoCorner: undefined })} title="Vue de dessous retournée : chaque Viewbox au même endroit que sur le plan de dessus">
          Plafond réfléchi
        </button>
      </div>
      {(cam.dir === 'iso' || cam.dir === 'iso-below') && (
        <div className="row">
          <span className="hint">Coin</span>
          {(['fl', 'fr', 'bl', 'br'] as const).map((c) => (
            <button key={c} className={`btn small${cam.isoCorner === c ? ' primary' : ''}`} onClick={() => set({ isoCorner: c })}>
              {{ fl: 'avant gauche', fr: 'avant droit', bl: 'arrière gauche', br: 'arrière droit' }[c]}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <button className="btn small" onClick={() => set({ rotate: (((cam.rotate + 90) % 360) as 0 | 90 | 180 | 270) })} title="Tourner le dessin d'un quart de tour (sens horaire)">
          ↻ 90°{cam.rotate ? ` (${cam.rotate}°)` : ''}
        </button>
        <button className={`btn small${cam.mirror ? ' primary' : ''}`} onClick={() => set({ mirror: !cam.mirror })} title="Retourner le dessin gauche ↔ droite">
          ⇋ Miroir
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={cam.frame === 'module'} onChange={(e) => set({ frame: e.target.checked ? 'module' : 'world' })} />
        Axes de la Viewbox (avant = petit côté) {cam.frame === 'module' && modules[0] ? `— repère de ${modules[0]}` : ''}
      </label>
      {cam.dir === 'bottom' && (
        <div className="hint">{cam.reflected ? 'Plan de plafond réfléchi : même orientation que le plan de dessus.' : 'Vraie vue de dessous : miroir du plan (comme couché par terre).'}</div>
      )}
    </Panel>
  );
}

const AXES: Array<[CutAxis, string]> = [
  ['horizontal', 'Horizontale'],
  ['long', 'Longitudinale (le long du grand côté)'],
  ['short', 'Transversale (le long du petit côté)'],
  ['x', 'Verticale X (monde)'],
  ['z', 'Verticale Y SketchUp (monde)'],
];

let cutCounter = 0;
const newCutId = () => `c${Date.now().toString(36)}${(cutCounter++).toString(36)}`;

export function newCut(axis: CutAxis): CutPlane {
  if (axis === 'horizontal') return { id: newCutId(), frame: 'module', axis, ref: { kind: 'level', ref: 'roof-bottom' }, offset: -200, keep: 'positive' };
  // longitudinale vue de gauche (observateur côté −y) : garder +y ; transversale vue de face (observateur côté +x) : garder −x
  if (axis === 'long' || axis === 'short') return { id: newCutId(), frame: 'module', axis, ref: { kind: 'module', ref: 'mid' }, offset: 0, keep: axis === 'long' ? 'positive' : 'negative' };
  return { id: newCutId(), frame: 'world', axis, ref: { kind: 'absolute' }, offset: 0, keep: 'negative' };
}

export function CutsPanel({
  spec,
  onChange,
  refs,
  refModule,
  modules,
  boxFor,
}: {
  spec: CustomViewSpec;
  onChange: Change;
  refs: ModuleRefs | undefined;
  refModule: string | undefined;
  modules: string[];
  /** boîte de coupe « Entrer dans » une Viewbox (ses limites, pieds compris) */
  boxFor: (moduleId: string) => SectionBox | undefined;
}) {
  const setCut = (i: number, patch: Partial<CutPlane>) => onChange({ ...spec, cuts: spec.cuts.map((c, k) => (k === i ? ({ ...c, ...patch } as CutPlane) : c)) });
  // une coupe verticale se regarde de face : la vue se met dans les axes de la Viewbox, perpendiculaire au plan
  const add = (axis: CutAxis) =>
    spec.cuts.length < MAX_CUTS &&
    onChange({
      ...spec,
      cuts: [...spec.cuts, newCut(axis)],
      camera: axis === 'long' || axis === 'short' ? { ...spec.camera, frame: 'module', dir: axis === 'long' ? 'left' : 'front', reflected: undefined, isoCorner: undefined } : spec.camera,
    });
  return (
    <Panel title="Coupes" testId="cv-cuts">
      {!spec.cuts.length && !spec.box && <div className="hint">Aucune coupe — ajoute une coupe horizontale pour voir sous la toiture.</div>}
      {spec.cuts.map((c, i) => {
        const vertical = c.axis === 'long' || c.axis === 'short';
        return (
          <div key={c.id} className="cv-cut" data-testid="cv-cut">
            <div className="row">
              <select value={c.axis} onChange={(e) => setCut(i, { ...newCut(e.target.value as CutAxis), id: c.id, label: c.label })} style={{ flex: 1 }}>
                {AXES.map(([a, l]) => (
                  <option key={a} value={a}>
                    {l}
                  </option>
                ))}
              </select>
              <input type="text" value={c.label ?? ''} maxLength={2} placeholder="A" title="Repère (A ⇒ « Coupe A-A »)" style={{ width: 42 }} onChange={(e) => setCut(i, { label: e.target.value.toUpperCase() || undefined })} />
              <button className="btn small ghost" onClick={() => onChange({ ...spec, cuts: spec.cuts.filter((_, k) => k !== i) })} title="Supprimer la coupe">
                ✕
              </button>
            </div>
            {c.axis === 'horizontal' && (
              <div className="row">
                <select value={c.ref.kind === 'level' ? c.ref.ref : 'absolute'} onChange={(e) => setCut(i, { ref: e.target.value === 'absolute' ? { kind: 'absolute' } : { kind: 'level', ref: e.target.value as LevelRef } })} style={{ flex: 1 }}>
                  {(Object.keys(LEVEL_REF_LABELS) as LevelRef[]).map((r) => (
                    <option key={r} value={r}>
                      depuis {LEVEL_REF_LABELS[r]}
                    </option>
                  ))}
                  <option value="absolute">depuis le bas de la Viewbox</option>
                </select>
              </div>
            )}
            {vertical && (
              <div className="row">
                <select value={c.ref.kind === 'module' ? c.ref.ref : 'absolute'} onChange={(e) => setCut(i, { ref: e.target.value === 'absolute' ? { kind: 'absolute' } : { kind: 'module', ref: e.target.value as ModuleRef } })} style={{ flex: 1 }}>
                  <option value="mid">au milieu de la Viewbox</option>
                  <option value="side0">depuis un côté</option>
                  <option value="side1">depuis l’autre côté</option>
                </select>
              </div>
            )}
            <div className="row">
              <input type="range" min={-3000} max={3000} step={10} value={Math.max(-3000, Math.min(3000, c.offset))} onChange={(e) => setCut(i, { offset: Number(e.target.value) })} style={{ flex: 1 }} />
              <input type="number" step={10} value={c.offset} onChange={(e) => setCut(i, { offset: Number(e.target.value) || 0 })} style={{ width: 80 }} />
              <span className="hint">mm</span>
            </div>
            <div className="row">
              <select value={c.keep} onChange={(e) => setCut(i, { keep: e.target.value as 'positive' | 'negative' })} style={{ flex: 1 }}>
                {c.axis === 'horizontal' ? (
                  <>
                    <option value="positive">garder au-dessus</option>
                    <option value="negative">garder en dessous</option>
                  </>
                ) : (
                  <>
                    <option value="negative">garder un côté</option>
                    <option value="positive">garder l’autre côté</option>
                  </>
                )}
              </select>
              <input type="number" min={0} step={100} value={c.depth ?? ''} placeholder="profondeur" title="Profondeur de vue au-delà du plan (mm) ; vide = illimitée" style={{ width: 100 }} onChange={(e) => setCut(i, { depth: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={c.frame === 'module'} disabled={vertical} onChange={(e) => setCut(i, { frame: e.target.checked ? 'module' : 'world' })} />
              Dans chaque Viewbox (à sa propre hauteur)
            </label>
            {c.axis === 'horizontal' && c.ref.kind === 'level' && refs && (
              <div className="hint">
                {refModule} : {describeRef(c.ref.ref, refs[c.ref.ref])} ⇒ coupe à {Math.round(refs[c.ref.ref].local + c.offset).toLocaleString('fr-FR')} mm
              </div>
            )}
          </div>
        );
      })}
      <div className="row">
        <button className="btn small" disabled={spec.cuts.length >= MAX_CUTS} onClick={() => add('horizontal')}>
          ＋ Coupe horizontale
        </button>
        <button className="btn small" disabled={spec.cuts.length >= MAX_CUTS} onClick={() => add('long')}>
          ＋ Longitudinale
        </button>
        <button className="btn small" disabled={spec.cuts.length >= MAX_CUTS} onClick={() => add('short')}>
          ＋ Transversale
        </button>
      </div>
      <div className="row">
        <span className="hint">Entrer dans</span>
        <select
          value={spec.box?.moduleId ?? ''}
          data-testid="cv-enter"
          onChange={(e) => onChange({ ...spec, box: e.target.value ? boxFor(e.target.value) : undefined })}
          style={{ flex: 1 }}
        >
          <option value="">— (toute l’installation)</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </Panel>
  );
}

const OP_ICONS: Record<VisibilityRule['op'], string> = { hide: '🚫', show: '👁', ghost: '◌', isolate: '◎' };

export function RulesPanel({
  spec,
  onChange,
  counts,
  showRemoved,
  onShowRemoved,
  tags,
}: {
  spec: CustomViewSpec;
  onChange: Change;
  counts: ReadonlyMap<string, number>;
  showRemoved: boolean;
  onShowRemoved: (v: boolean) => void;
  tags: Array<{ tag: string; label: string; count: number }>;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [quick, setQuick] = useState('');
  return (
    <Panel title="Éléments retirés" testId="cv-rules">
      {!spec.visibility.length && <div className="hint">Rien n’est retiré. Clique une pièce dans la 3D pour la retirer.</div>}
      <div className="cv-chips">
        {spec.visibility.map((r, i) => {
          const n = counts.get(r.id) ?? 0;
          return (
            <div
              key={r.id}
              className={`cv-chip${r.source === 'ai' ? ' ai' : ''}${n === 0 ? ' empty' : ''}`}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag !== null) onChange({ ...spec, visibility: moveRule(spec.visibility, drag, i) });
                setDrag(null);
              }}
              data-testid="cv-chip"
              title={r.source === 'ai' ? 'Proposé par l’IA' : 'Glisser pour changer l’ordre (la dernière règle gagne)'}
            >
              <span>{OP_ICONS[r.op]}</span>
              <span className="nm">{r.label}</span>
              <span className="meta">{n === 0 ? '⚠ 0' : n}</span>
              <button className="btn small ghost" onClick={() => onChange({ ...spec, visibility: spec.visibility.filter((x) => x.id !== r.id) })} title="Supprimer la règle">
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <div className="row">
        <select value={quick} onChange={(e) => setQuick(e.target.value)} style={{ flex: 1 }}>
          <option value="">Retirer une étiquette partout…</option>
          {tags
            .filter((t) => t.count > 0)
            .map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.label} ({t.count})
              </option>
            ))}
        </select>
        <button
          className="btn small"
          disabled={!quick}
          onClick={() => {
            const t = tags.find((x) => x.tag === quick);
            if (!t) return;
            onChange({ ...spec, visibility: [...spec.visibility, { id: `r${Date.now().toString(36)}`, op: 'hide', match: { viewTags: [t.tag] }, label: `${t.label} — partout`, source: 'click' }] });
            setQuick('');
          }}
        >
          Retirer
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={showRemoved} onChange={(e) => onShowRemoved(e.target.checked)} data-testid="cv-show-removed" />
        Montrer les éléments retirés (rouge, un clic les remet)
      </label>
    </Panel>
  );
}

export function LayoutPanel({ spec, onChange }: { spec: CustomViewSpec; onChange: Change }) {
  const l = spec.layout;
  const set = (patch: Partial<ViewLayout>) => onChange({ ...spec, layout: { ...l, ...patch } });
  return (
    <Panel title="Disposition" testId="cv-layout">
      <div className="cv-cube">
        {(
          [
            ['assembled', 'Ensemble'],
            ['exploded', 'Séparées'],
            ['per-module', 'Chaque Viewbox'],
            ['assembled+exploded', 'Ensemble + séparées'],
          ] as const
        ).map(([m, label]) => (
          <button key={m} className={`btn small${l.mode === m ? ' primary' : ''}`} onClick={() => set({ mode: m })}>
            {label}
          </button>
        ))}
      </div>
      {l.mode !== 'assembled' && (
        <>
          <div className="row">
            <span className="hint">Écart</span>
            <input type="number" step={100} min={0} value={l.gap} onChange={(e) => set({ gap: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 90 }} />
            <span className="hint">mm</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={l.keepArrangement} onChange={(e) => set({ keepArrangement: e.target.checked })} />
            Garder la disposition (rangées / colonnes)
          </label>
          {!l.keepArrangement && (
            <div className="row">
              <span className="hint">Colonnes</span>
              <input type="number" min={1} max={20} value={l.columns ?? ''} placeholder="auto" onChange={(e) => set({ columns: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} style={{ width: 70 }} />
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={l.levels === 'separate'} onChange={(e) => set({ levels: e.target.checked ? 'separate' : 'filter' })} />
            Étages côte à côte (vues en plan)
          </label>
          <label className="check">
            <input type="checkbox" checked={l.groupIdentical} onChange={(e) => set({ groupIdentical: e.target.checked })} />
            Regrouper les Viewbox identiques
          </label>
          <label className="check">
            <input type="checkbox" checked={l.common === 'keep-in-place'} onChange={(e) => set({ common: e.target.checked ? 'keep-in-place' : 'hide' })} />
            Garder les éléments communs (avec la Viewbox la plus proche)
          </label>
        </>
      )}
      <div className="row">
        <span className="hint">Étiquettes</span>
        <select value={l.labels} onChange={(e) => set({ labels: e.target.value as ViewLayout['labels'] })} style={{ flex: 1 }}>
          <option value="none">aucune</option>
          <option value="id">VBX-xx</option>
          <option value="id+type">VBX-xx + type</option>
        </select>
      </div>
    </Panel>
  );
}

export function StylePanel({ spec, onChange }: { spec: CustomViewSpec; onChange: Change }) {
  const st = spec.style;
  const set = (patch: Partial<ViewStyle>) => onChange({ ...spec, style: { ...st, ...patch } });
  return (
    <Panel title="Style" open={false} testId="cv-style">
      <div className="row">
        <span className="hint">Pièces coupées</span>
        <select value={st.cutFill} onChange={(e) => set({ cutFill: e.target.value as ViewStyle['cutFill'] })} style={{ flex: 1 }}>
          <option value="by-material">selon le matériau</option>
          <option value="drawing">dessin d’architecte (hachures, sans aplat)</option>
          <option value="solid">noir plein</option>
          <option value="hatch">hachures</option>
          <option value="none">rien (contour seul)</option>
        </select>
      </div>
      <div className="row">
        <span className="hint">Trait de coupe</span>
        <input type="number" step={0.05} min={0.05} max={2} value={st.cutLine} onChange={(e) => set({ cutLine: Number(e.target.value) || 0.5 })} style={{ width: 70 }} />
        <span className="hint">mm</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={st.beyond === 'thin'} onChange={(e) => set({ beyond: e.target.checked ? 'thin' : 'normal' })} />
        Au-delà de la coupe en trait fin
      </label>
      <label className="check">
        <input type="checkbox" checked={st.hidden} onChange={(e) => set({ hidden: e.target.checked })} />
        Lignes cachées en pointillé
      </label>
      <label className="check">
        <input type="checkbox" checked={st.categoryColors} onChange={(e) => set({ categoryColors: e.target.checked })} />
        Colorer par catégorie (vues de dessus)
      </label>
    </Panel>
  );
}
