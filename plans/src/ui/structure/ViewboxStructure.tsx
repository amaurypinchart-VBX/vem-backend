// Fiche « Structure de la Viewbox » : ce que l'outil calcule pour chaque Viewbox d'un type — section de chaque
// famille de barres (rives, traverses et lisses, poteaux, réceptions de pied), grille, hauteurs, raideurs des
// assemblages, capacités vérifiées, contreplaqué du plancher, sources. Un clic sur une famille la montre dans la vue
// 3D. Admins, responsables techniques et ingénieurs peuvent la modifier (tous les projets) ou l'enregistrer comme
// nouveau type ; une section absente se crée ici (propriétés calculées par l'outil ou valeurs de la fiche).
import { useEffect, useMemo, useState } from 'react';
import type { BucklingCurve } from '../../structure/core/catalog';
import type { ConnectionEntry, LibraryEntry, ModuleTypeEntry, SectionEntry, ViewboxTemplateParams } from '../../structure/core/library';
import { designation } from '../../structure/core/library';
import { MATERIALS, materialByKey } from '../../structure/core/materials';
import { FAMILY_COLORS, templateSummary } from '../../structure/core/templateView';
import type { TemplateFamily } from '../../structure/core/templates/viewboxEU';
import { fmtNumber } from '../../structure/core/units';
import type { SectionSlot, UserSectionInput, UserShape } from '../../structure/core/viewboxEdit';
import {
  FAMILY_SLOTS,
  USER_SHAPES,
  checkTemplate,
  editedModuleEntry,
  lastModification,
  listText,
  maxSpacing,
  parseList,
  sectionFromUser,
  slotSection,
  toUser,
  fromUser,
  withSection,
} from '../../structure/core/viewboxEdit';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const n = (v: number, d = 0) => fmtNumber(v, d);
const today = () => new Date().toLocaleDateString('fr-BE');

/** Assemblages propres aux Viewbox vérifiés par le calcul (capacités de la bibliothèque). */
const VIEWBOX_JOINTS = ['VBX-CORNER', 'VBX-VERTICAL-CONTACT', 'VBX-VERTICAL-PLATE', 'VBX-HORIZONTAL-BOLT'];

function Num({ value, onChange, width = 80, label }: { value: number; onChange: (v: number) => void; width?: number; label?: string }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  useEffect(() => setText(String(value).replace('.', ',')), [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      style={{ width }}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value.replace(',', '.'));
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

function ListInput({ value, onChange }: { value: number[]; onChange: (v: number[] | null) => void }) {
  const [text, setText] = useState(listText(value));
  useEffect(() => setText(listText(value)), [value]);
  return (
    <input
      type="text"
      style={{ width: 240 }}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseList(e.target.value));
      }}
    />
  );
}

export interface ViewboxStructureProps {
  entry: ModuleTypeEntry;
  library: LibraryEntry[];
  canEdit: boolean;
  /** nom de la personne (trace des modifications) */
  who: string;
  highlight?: TemplateFamily | null;
  onHighlight?: (f: TemplateFamily | null) => void;
  /** enregistre des entrées dans la bibliothèque puis la recharge */
  onSaveEntries?: (entries: LibraryEntry[]) => Promise<void>;
  /** après « enregistrer comme nouveau type » : ce type est choisi pour ces Viewbox */
  onUseType?: (key: string) => void;
}

export function ViewboxStructure({ entry, library, canEdit, who, highlight, onHighlight, onSaveEntries, onUseType }: ViewboxStructureProps) {
  const [draft, setDraft] = useState<ViewboxTemplateParams | null>(null);
  const [asNew, setAsNew] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newSection, setNewSection] = useState<SectionSlot | null>(null);
  useEffect(() => {
    setDraft(null);
    setAsNew(null);
    setError('');
    setNewSection(null);
  }, [entry.key]);
  const sections = useMemo(() => library.filter((e): e is SectionEntry => e.kind === 'section' && !e.disabled && !e.section.massless), [library]);
  const params = draft ?? entry.params;
  const summary = useMemo(() => (params ? templateSummary({ ...entry, params }, library) : []), [entry, params, library]);
  const check = useMemo(() => (draft ? checkTemplate(draft, library) : null), [draft, library]);
  if (!params) {
    return (
      <div className="hint" style={{ color: 'var(--danger)' }}>
        {entry.name} : structure inconnue (pas de gabarit de calcul). Il faut les sections, positions et assemblages de ce type de Viewbox (note de calcul du fabricant) : les ajouter dans
        Réglages › Bibliothèque structure, ou choisir un autre type.
      </div>
    );
  }
  const editing = !!draft;
  const secByKey = new Map(sections.map((s) => [s.key, s]));
  const secLabel = (k: string) => {
    const s = secByKey.get(k) ?? library.find((e): e is SectionEntry => e.kind === 'section' && e.key === k);
    return s ? designation(s.name) : `${k} (absente)`;
  };
  const matLabel = (k: string) => {
    const s = secByKey.get(k);
    return s ? (materialByKey(s.material)?.name ?? s.material) : '—';
  };
  const patch = (p: Partial<ViewboxTemplateParams>) => setDraft((d) => ({ ...(d ?? params), ...p }));
  const modified = lastModification(entry);
  const joints = library.filter((e): e is ConnectionEntry => e.kind === 'connection' && VIEWBOX_JOINTS.includes(e.key));
  const gridU = maxSpacing(params.transverseX, params.x0, params.x1);
  const gridV = maxSpacing(params.longitudinalY, params.y0, params.y1);
  const rowsOf = (f: TemplateFamily) => summary.filter((r) => r.family === f);

  const save = async () => {
    if (!draft || !onSaveEntries) return;
    const c = checkTemplate(draft, library);
    if (c.errors.length) return;
    if (asNew !== null && !asNew.trim()) {
      setError('Nom du nouveau type à saisir');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = editedModuleEntry(entry, { params: draft }, { library, who, date: today(), asNew: asNew !== null ? { name: asNew.trim() } : undefined });
      await onSaveEntries([next]);
      if (asNew !== null) onUseType?.(next.key);
      setDraft(null);
      setAsNew(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="card" style={{ background: 'var(--bg-2)' }}>
      <div className="card-head">
        <h3>Structure de la Viewbox — {entry.name}</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <span className={`badge ${entry.status === 'known' ? 'ok' : entry.status === 'unknown' ? 'ko' : 'orange'}`}>{entry.status === 'known' ? 'connue' : entry.status === 'unknown' ? 'inconnue' : 'à vérifier'}</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="hint">
          Le modèle SketchUp donne la forme et la position des Viewbox ; leur ossature acier vient de cette fiche : chaque Viewbox de ce type est calculée avec ces barres (même modèle que
          le calcul SCIA de la note statico 24-0571). Les liaisons entre Viewbox (boulons, contacts, liaisons d’angle) sont ajoutées par l’outil. Cliquer une famille : ses barres
          ressortent dans la vue 3D.
        </div>
        {modified && <div className="hint" style={{ color: 'var(--warn)' }}>⚠ Fiche modifiée par rapport aux notes de référence — {modified}</div>}

        <table className="list">
          <thead>
            <tr>
              <th>Barres</th>
              <th>Section</th>
              <th>Matériau</th>
              {!editing && <th className="num">Nb</th>}
              {!editing && <th className="num">Longueur</th>}
            </tr>
          </thead>
          <tbody>
            {FAMILY_SLOTS.map((f) => {
              const rows = rowsOf(f.family);
              const key = slotSection(params, f);
              const on = highlight === f.family;
              return (
                <tr key={f.family} style={{ cursor: onHighlight ? 'pointer' : undefined, background: on ? 'rgba(59,130,246,.12)' : undefined }} onClick={() => onHighlight?.(on ? null : f.family)}>
                  <td>
                    <span className="chip">
                      <i style={{ background: hex(FAMILY_COLORS[f.family]) }} />
                      {f.label}
                    </span>
                    {!editing && <div className="hint">{f.hint}</div>}
                  </td>
                  <td onClick={(e) => editing && e.stopPropagation()} style={editing ? { minWidth: 180 } : undefined}>
                    {editing ? (
                      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <select value={key} style={{ width: 145 }} onChange={(e) => setDraft(withSection(params, f.slot, e.target.value))}>
                          {!secByKey.has(key) && <option value={key}>{secLabel(key)}</option>}
                          {sections.map((s) => (
                            <option key={s.key} value={s.key}>
                              {designation(s.name)}
                              {s.status !== 'known' ? ' (à vérifier)' : ''}
                            </option>
                          ))}
                        </select>
                        <button className="btn small ghost" title="Créer une section absente de la liste" onClick={() => setNewSection(f.slot)}>
                          ＋
                        </button>
                      </div>
                    ) : (
                      secLabel(key)
                    )}
                  </td>
                  <td>{editing ? (secByKey.get(key)?.material ?? '—') : matLabel(key)}</td>
                  {!editing && <td className="num">{rows.reduce((a, r) => a + r.count, 0)}</td>}
                  {!editing && <td className="num">{n(rows.reduce((a, r) => a + r.length, 0) / 1e3, 1)} m</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {editing && newSection && (
          <NewSectionForm
            who={who}
            onCancel={() => setNewSection(null)}
            onSave={async (s) => {
              if (!onSaveEntries) return;
              await onSaveEntries([s]);
              setDraft((d) => withSection(d ?? params, newSection, s.key));
              setNewSection(null);
            }}
          />
        )}

        <div className="hint">
          <b>Grille (plancher et toiture)</b> — traverses (selon la largeur) à x ={' '}
          {editing ? <ListInput value={params.transverseX} onChange={(v) => v && patch({ transverseX: v })} /> : <>{listText(params.transverseX)}</>} mm · lisses (selon la longueur) à y ={' '}
          {editing ? <ListInput value={params.longitudinalY} onChange={(v) => v && patch({ longitudinalY: v })} /> : <>{listText(params.longitudinalY)}</>} mm · écart maxi entre barres{' '}
          {n(gridU)} × {n(gridV)} mm. Lignes de système : x {n(params.x0)} → {n(params.x1)}, y {n(params.y0)} → {n(params.y1)} mm.
        </div>
        <div className="hint">
          <b>Hauteurs (lignes de système)</b> — plancher z = {n(params.floorZ)} · toiture z ={' '}
          {editing ? <Num value={params.roofZ} onChange={(v) => patch({ roofZ: v })} /> : n(params.roofZ)} · haut (appui de la Viewbox du dessus) z ={' '}
          {editing ? <Num value={params.topZ} onChange={(v) => patch({ topZ: v })} /> : n(params.topZ)} mm.
        </div>
        <div className="hint">
          <b>Raideurs des assemblages dans le modèle</b> — angles poteau / cadre{' '}
          {editing ? (
            <Num value={Math.round(toUser.rotation(params.springs.columnRotation))} onChange={(v) => patch({ springs: { ...params.springs, columnRotation: fromUser.rotation(v) } })} />
          ) : (
            n(toUser.rotation(params.springs.columnRotation))
          )}{' '}
          kNcm/deg (semi-rigides, en haut et en bas de chaque poteau) · liaisons d’angle entre Viewbox empilées{' '}
          {editing ? (
            <Num value={toUser.stiffness(params.springs.cornerLinkShear)} onChange={(v) => patch({ springs: { ...params.springs, cornerLinkShear: fromUser.stiffness(v) } })} width={60} />
          ) : (
            n(toUser.stiffness(params.springs.cornerLinkShear))
          )}{' '}
          kN/cm · boulons entre Viewbox{' '}
          {editing ? (
            <Num value={toUser.stiffness(params.springs.boltTranslation)} onChange={(v) => patch({ springs: { ...params.springs, boltTranslation: fromUser.stiffness(v) } })} width={60} />
          ) : (
            n(toUser.stiffness(params.springs.boltTranslation))
          )}{' '}
          kN/cm · appuis horizontaux{' '}
          {editing ? (
            <Num value={toUser.stiffness(params.springs.supportHorizontal)} onChange={(v) => patch({ springs: { ...params.springs, supportHorizontal: fromUser.stiffness(v) } })} width={60} />
          ) : (
            n(toUser.stiffness(params.springs.supportHorizontal))
          )}{' '}
          kN/cm.
        </div>
        <div className="hint">
          <b>Plancher</b> —{' '}
          {editing ? (
            <>
              <Num value={params.plywood.floorLayers} onChange={(v) => patch({ plywood: { ...params.plywood, floorLayers: Math.round(v) } })} width={40} /> couche(s) de{' '}
              <Num value={params.plywood.thickness} onChange={(v) => patch({ plywood: { ...params.plywood, thickness: v } })} width={50} /> mm{' '}
              <select value={params.plywood.material} onChange={(e) => patch({ plywood: { ...params.plywood, material: e.target.value } })}>
                {MATERIALS.filter((m) => m.family === 'plywood' || m.key === params.plywood.material).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>{' '}
              · portée maxi du contreplaqué <Num value={params.plywood.maxSpan} onChange={(v) => patch({ plywood: { ...params.plywood, maxSpan: v } })} width={60} /> mm
            </>
          ) : (
            <>
              {params.plywood.floorLayers} × {n(params.plywood.thickness)} mm {materialByKey(params.plywood.material)?.name ?? params.plywood.material}, portée maxi {n(params.plywood.maxSpan)} mm (vérifié en bande de
              1 m, statico § 3.5) ; toiture {params.plywood.roofLayers} couche(s)
            </>
          )}
          .
        </div>
        <div className="hint">
          <b>Poids d’une Viewbox</b> — réglé à l’étape 2 « Site &amp; hypothèses » (poids pesé, planchers et isolants compris, sans murs) ; référence de ce type :{' '}
          {entry.weighedN ? `${n(toUser.kg(entry.weighedN))} kg` : 'inconnue'}. Le calcul ajoute un complément si les barres pèsent moins.
        </div>
        {joints.length > 0 && (
          <div className="hint">
            <b>Assemblages vérifiés (capacités de la bibliothèque)</b>
            <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
              {joints.map((j) => (
                <li key={j.key}>
                  {j.name} : {j.rule?.text ?? j.capacities.map((c) => c.label).join(', ')}{' '}
                  <span style={{ opacity: 0.7 }}>({j.source.map((s) => [s.ref, s.page].filter(Boolean).join(' ')).join(' ; ')})</span>
                </li>
              ))}
            </ul>
            Modifiables dans Réglages › Bibliothèque structure.
          </div>
        )}
        <div className="hint">
          <b>Sources</b> — {entry.source.map((s) => [s.ref, s.page, s.note].filter(Boolean).join(' ')).join(' ; ')}
        </div>

        {editing && check && (
          <>
            {check.errors.map((e, k) => (
              <div key={`e${k}`} className="hint" style={{ color: 'var(--danger)' }}>
                ✖ {e}
              </div>
            ))}
            {check.warnings.map((w, k) => (
              <div key={`w${k}`} className="hint" style={{ color: 'var(--warn)' }}>
                ⚠ {w}
              </div>
            ))}
            <div className="hint">
              L’enregistrement vaut pour toutes les études qui utilisent ce type : leurs résultats déjà calculés deviennent « périmés » et la modification est citée dans le rapport.
            </div>
          </>
        )}
        {error && <div className="error-box">{error}</div>}
        {canEdit && onSaveEntries && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {!editing ? (
              <button className="btn small" onClick={() => setDraft(params)}>
                ✎ Modifier la structure
              </button>
            ) : (
              <>
                {asNew !== null && <input type="text" placeholder="nom du nouveau type (ex. Viewbox 5900 H3 renforcée)" value={asNew} onChange={(e) => setAsNew(e.target.value)} style={{ width: 280 }} />}
                <button className="btn small primary" disabled={busy || !!check?.errors.length} onClick={() => void save()}>
                  {asNew !== null ? 'Enregistrer le nouveau type' : 'Enregistrer (ce type, tous les projets)'}
                </button>
                {asNew === null && (
                  <button className="btn small" disabled={busy} onClick={() => setAsNew(`${entry.name} (variante)`)}>
                    Enregistrer comme nouveau type…
                  </button>
                )}
                <button className="btn small ghost" disabled={busy} onClick={() => [setDraft(null), setAsNew(null), setNewSection(null), setError('')]}>
                  Annuler
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── nouvelle section ───

const DIM_LABEL: Record<string, string> = { h: 'h', b: 'b', t: 't', tw: 'tw', tf: 'tf', d: 'd', r: 'r' };
const VALUE_FIELDS: Array<{ k: keyof NonNullable<UserSectionInput['values']>; label: string }> = [
  { k: 'A', label: 'A (cm²)' },
  { k: 'Iy', label: 'Iy (cm⁴)' },
  { k: 'Iz', label: 'Iz (cm⁴)' },
  { k: 'Wely', label: 'Wel,y (cm³)' },
  { k: 'Welz', label: 'Wel,z (cm³)' },
  { k: 'Wply', label: 'Wpl,y (cm³)' },
  { k: 'Wplz', label: 'Wpl,z (cm³)' },
  { k: 'It', label: 'It (cm⁴)' },
  { k: 'kgPerM', label: 'kg/m' },
];

function NewSectionForm({ who, onSave, onCancel }: { who: string; onSave: (s: SectionEntry) => Promise<void>; onCancel: () => void }) {
  const [x, setX] = useState<UserSectionInput>({ designation: '', shape: 'RHS', dims: {}, material: 'S235', values: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const spec = USER_SHAPES.find((s) => s.shape === x.shape)!;
  const r = useMemo(() => sectionFromUser(x, who, today()), [x, who]);
  const steel = MATERIALS.filter((m) => m.family === 'steel');
  const s = r.entry?.section;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Nouvelle section</h3>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onCancel}>
          ✕
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="row hint" style={{ flexWrap: 'wrap' }}>
          Désignation <input type="text" placeholder="ex. RHS 120 × 80 × 5" value={x.designation} onChange={(e) => setX({ ...x, designation: e.target.value })} style={{ width: 180 }} />
          Forme
          <select value={x.shape} onChange={(e) => setX({ ...x, shape: e.target.value as UserShape, dims: {} })}>
            {USER_SHAPES.map((u) => (
              <option key={u.shape} value={u.shape}>
                {u.label}
              </option>
            ))}
          </select>
          {(x.shape === 'RHS' || x.shape === 'SHS' || x.shape === 'CHS') && (
            <label className="row">
              <input type="checkbox" checked={!!x.hotFinished} onChange={(e) => setX({ ...x, hotFinished: e.target.checked })} /> fini à chaud (sinon formé à froid)
            </label>
          )}
          Nuance
          <select value={x.material} onChange={(e) => setX({ ...x, material: e.target.value })}>
            {steel.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row hint" style={{ flexWrap: 'wrap' }}>
          Dimensions (mm)
          {spec.dims.map((d) => (
            <label key={d} className="row">
              {DIM_LABEL[d]} <Num label={d} value={x.dims[d] ?? 0} onChange={(v) => setX({ ...x, dims: { ...x.dims, [d]: v } })} width={60} />
            </label>
          ))}
          Courbes de flambement y / z
          {(['y', 'z'] as const).map((ax) => (
            <select key={ax} value={x.curves?.[ax] ?? ''} onChange={(e) => setX({ ...x, curves: { ...x.curves, [ax]: (e.target.value || undefined) as BucklingCurve | undefined } })}>
              <option value="">auto (EN 1993-1-1 tab. 6.2)</option>
              {(['a0', 'a', 'b', 'c', 'd'] as BucklingCurve[]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          ))}
        </div>
        <div className="row hint" style={{ flexWrap: 'wrap' }}>
          {spec.computed ? 'Valeurs de la fiche (facultatif, pour contrôle)' : 'Valeurs de la fiche du fournisseur (obligatoires)'}
          {VALUE_FIELDS.map((f) => (
            <label key={f.k} className="row">
              {f.label} <Num value={x.values?.[f.k] ?? 0} onChange={(v) => setX({ ...x, values: { ...x.values, [f.k]: v > 0 ? v : undefined } })} width={60} />
            </label>
          ))}
          Source <input type="text" placeholder="ex. catalogue Voestalpine 2024 p. 12" value={x.sourceNote ?? ''} onChange={(e) => setX({ ...x, sourceNote: e.target.value })} style={{ width: 220 }} />
        </div>
        {s && (
          <div className="hint">
            {r.computed ? 'Calculé par l’outil' : 'Repris de la fiche'} : A {n(s.A / 100, 2)} cm² · Iy {n(s.Iy / 1e4, 1)} · Iz {n(s.Iz / 1e4, 1)} · It {n(s.It / 1e4, 1)} cm⁴ · Wel,y {n(s.Wely / 1e3, 1)} ·
            Wel,z {n(s.Welz / 1e3, 1)} cm³ · courbes {s.curveY ?? 'c'} / {s.curveZ ?? 'c'}
          </div>
        )}
        {r.problems.map((p, k) => (
          <div key={k} className="hint" style={{ color: 'var(--warn)' }}>
            ⚠ {p}
          </div>
        ))}
        {error && <div className="error-box">{error}</div>}
        <div className="row">
          <button
            className="btn small primary"
            disabled={!r.entry || busy}
            onClick={async () => {
              if (!r.entry) return;
              setBusy(true);
              setError('');
              try {
                await onSave(r.entry);
              } catch (e) {
                setError((e as Error).message);
              }
              setBusy(false);
            }}
          >
            Créer la section et l’utiliser
          </button>
          <span className="hint">Elle est ajoutée à la bibliothèque (tous les projets).</span>
        </div>
      </div>
    </div>
  );
}
