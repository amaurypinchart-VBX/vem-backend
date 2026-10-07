// Atelier structure (S12) : décrire un type de structure « comme une Viewbox » mais différent (profils, grille,
// assemblages, plancher, poids, pieds) et l'enregistrer dans la bibliothèque comme un type de module. Départs :
// « Partir de la Viewbox 5900 » (barres du gabarit Viewbox) ou « Grille paramétrique ». Les barres s'affichent sur le
// modèle 3D (aperçu) ; contrôles en direct (structure complète, barres non reliées, stabilité, données manquantes).
import { useEffect, useMemo, useState } from 'react';
import { sectionMap } from '../../structure/core/assemble';
import { checkFrame } from '../../structure/core/frameChecks';
import type { ConnectionEntry, DeckSpec, FrameBar, FrameRole, JointDesignEntry, LibraryEntry, ModuleTypeEntry, SectionEntry } from '../../structure/core/library';
import { FRAME_ROLE_LABEL } from '../../structure/core/library';
import { deckWeight } from '../../structure/core/moduleTypes';
import { FAMILY_NAME, familySections, sectionMass } from '../../structure/core/sectionCatalog';
import type { CatalogFamily } from '../../structure/core/sectionCatalog';
import type { FrameParams, ParametricSpec } from '../../structure/core/templates/frameModule';
import { frameSections, parametricFrame, viewboxPresetFrame } from '../../structure/core/templates/frameModule';
import { templateSteelWeight, templateSummary } from '../../structure/core/templateView';
import { KN, KNCM_PER_DEG, KNM, fmtNumber } from '../../structure/core/units';
import { slug } from '../../structure/core/ai';
import { deckSpan } from '../../structure/studyRun';
import { NewSectionForm, Num } from './ViewboxStructure';

const f = (v: number, d = 0) => fmtNumber(v, d);
const today = () => new Date().toLocaleDateString('fr-BE');
const GRADES = ['S235', 'S275', 'S355'];
const PLYWOODS = [
  { key: 'CP-F20/15', label: 'Contreplaqué F20/15' },
  { key: 'CP-F40/30', label: 'Contreplaqué F40/30' },
];
/** familles du catalogue proposées pour chaque rôle */
const ROLE_FAMILIES: Record<FrameRole, CatalogFamily[]> = {
  'rim-floor': ['UPN', 'U_MARCHAND', 'IPE', 'RHS'],
  'rim-roof': ['UPN', 'U_MARCHAND', 'IPE', 'RHS'],
  'transverse-floor': ['RHS', 'SHS', 'UPN', 'U_MARCHAND', 'IPE'],
  'transverse-roof': ['RHS', 'SHS', 'UPN', 'U_MARCHAND', 'IPE'],
  'stringer-floor': ['RHS', 'SHS', 'UPN', 'U_MARCHAND'],
  'stringer-roof': ['RHS', 'SHS', 'UPN', 'U_MARCHAND'],
  column: ['SHS', 'RHS', 'CHS', 'HEA', 'HEB'],
  foot: ['PLAT', 'T', 'L'],
  brace: ['PLAT', 'ROND', 'L'],
  other: ['RHS', 'SHS', 'UPN', 'IPE', 'HEA', 'L'],
  none: [],
};

type Start = 'parametric' | 'viewbox';
type CornerModel = 'semi' | 'rigid' | 'pinned';

export interface FrameWorkshopProps {
  /** nom proposé (type SketchUp ou définition du module) et dimensions mesurées du module (mm) */
  defaultName: string;
  dims: { long: number; short: number; height: number };
  library: LibraryEntry[];
  canEdit: boolean;
  who: string;
  /** type existant à modifier (sinon nouveau) */
  entry?: ModuleTypeEntry;
  onSaveEntries?: (entries: LibraryEntry[]) => Promise<void>;
  /** type enregistré : le module y est rattaché */
  onUseType: (key: string) => void;
  /** aperçu 3D du type en cours (barres sur le modèle) ; null = arrêter l'aperçu */
  onPreview?: (entry: ModuleTypeEntry | null) => void;
  onClose: () => void;
}

const vbx = (library: LibraryEntry[]) => library.find((e): e is ModuleTypeEntry => e.kind === 'module_type' && e.key === 'VIEWBOX-5900-EU')!;

function defaultSpec(dims: FrameWorkshopProps['dims'], base: ModuleTypeEntry): ParametricSpec {
  const P = base.params!;
  return {
    long: Math.round(dims.long),
    short: Math.round(dims.short),
    inset: 40,
    roofZ: Math.round(dims.height - 150),
    topZ: Math.round(dims.height),
    sections: {
      rimFloorLong: P.sections.rim,
      rimFloorShort: P.sections.rim,
      rimRoofLong: P.sections.rimRoof ?? P.sections.rim,
      rimRoofShort: P.sections.rimRoof ?? P.sections.rim,
      transverseFloor: P.sections.secondary,
      transverseRoof: P.sections.secondaryRoof ?? P.sections.secondary,
      column: P.sections.column,
    },
    transversesFloor: 5,
    transversesRoof: 5,
    stringersFloor: [],
    stringersRoof: [],
    intermediateColumns: 0,
    middleFeet: true,
    columnModel: { model: 'semi', stiffness: P.springs.columnRotation },
    secondaryModel: 'pinned',
    sideModel: 'bolts',
    floor: { material: 'CP-F20/15', thickness: 18, layers: 2, span: 'u' },
    roof: null,
    base: { sections: P.sections, springs: P.springs, plywood: P.plywood },
  };
}

export function FrameWorkshop(p: FrameWorkshopProps) {
  const base = vbx(p.library);
  const [name, setName] = useState(p.entry?.name ?? p.defaultName);
  const [start, setStart] = useState<Start>(p.entry?.params?.frame?.origin === 'preset-viewbox' ? 'viewbox' : 'parametric');
  const [spec, setSpec] = useState<ParametricSpec>(() => defaultSpec(p.dims, base));
  const [params, setParams] = useState<FrameParams>(() => (p.entry?.params?.frame ? (p.entry.params as FrameParams) : parametricFrame(defaultSpec(p.dims, base))));
  const [weightKg, setWeightKg] = useState<number | null>(p.entry?.weighedN ? Math.round(p.entry.weighedN / 9.81) : null);
  const [foot, setFoot] = useState(p.entry?.footContact ?? { a1: 210, a2: 210 });
  const [conn, setConn] = useState<NonNullable<ModuleTypeEntry['connections']>>(p.entry?.connections ?? { plate: undefined });
  // capacités des angles boulonnés saisies (kN, kNm) : connexion « saisie, non vérifiée »
  const [cornerCaps, setCornerCaps] = useState<{ N: number; Mb: number; M1: number; M2: number; C: number } | null>(null);
  const [newSection, setNewSection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = p.entry?.key ?? `TYPE-${slug(name || 'structure')}`;

  // départ : grille paramétrique (régénérée à chaque changement de la grille) ou barres de la Viewbox 5900
  const regenerate = (s: ParametricSpec) => {
    setSpec(s);
    setParams(parametricFrame(s));
  };
  const chooseStart = (s: Start) => {
    setStart(s);
    if (s === 'viewbox') setParams({ ...base.params!, frame: { ...viewboxPresetFrame(base.params!), origin: 'preset-viewbox' } });
    else setParams(parametricFrame(spec));
  };
  const frame = params.frame;
  const setFrame = (fr: Partial<FrameParams['frame']>) => setParams((x) => ({ ...x, frame: { ...x.frame, ...fr } }));

  // connexion saisie pour les angles
  const cornerEntry: ConnectionEntry | null = cornerCaps
    ? {
        kind: 'connection',
        key: `${key}-CORNER`,
        name: `Angle poteau / cadre « ${name} » (saisi)`,
        status: 'suggested',
        composition: 'capacités saisies par l’utilisateur, non vérifiées',
        capacities: [
          { key: 'N', label: 'effort normal transmis par les boulons', value: cornerCaps.N * KN, unit: 'N', source: { ref: 'user', note: 'saisi, non vérifié' } },
          { key: 'M_biax', label: 'moment biaxial My et Mz (chacun)', value: cornerCaps.Mb * KNM, unit: 'N·mm', source: { ref: 'user', note: 'saisi, non vérifié' } },
          { key: 'M_uniax_max', label: 'moment dominant (uniaxial)', value: cornerCaps.M1 * KNM, unit: 'N·mm', source: { ref: 'user', note: 'saisi, non vérifié' } },
          { key: 'M_uniax_min', label: 'moment secondaire (uniaxial)', value: cornerCaps.M2 * KNM, unit: 'N·mm', source: { ref: 'user', note: 'saisi, non vérifié' } },
        ],
        source: [{ ref: 'user', note: `saisi le ${today()} par ${p.who}` }],
      }
    : null;
  // compression du poteau sur le cadre (contact) : capacité saisie avec les angles
  const contactEntry: ConnectionEntry | null =
    cornerCaps && cornerCaps.C > 0
      ? {
          kind: 'connection',
          key: `${key}-CONTACT`,
          name: `Contact poteau / cadre « ${name} » (saisi)`,
          status: 'suggested',
          composition: 'capacité saisie par l’utilisateur, non vérifiée',
          capacities: [{ key: 'NRd', label: 'compression transmise par contact', value: cornerCaps.C * KN, unit: 'N', source: { ref: 'user', note: 'saisi, non vérifié' } }],
          source: [{ ref: 'user', note: `saisi le ${today()} par ${p.who}` }],
        }
      : null;
  // assemblages de la Viewbox repris (mêmes boulons M16) : capacités Viewbox, indicatives pour ce type (plats et profils différents)
  const [reuse, setReuse] = useState(() => !!p.entry?.connections?.corner?.endsWith('-CORNER') && !!p.library.find((e) => e.key === p.entry?.connections?.corner)?.source.some((x) => x.ref.startsWith('copy:')));
  const copyOf = (from: string, suffix: string, what: string): ConnectionEntry | null => {
    const e = p.library.find((x): x is ConnectionEntry => x.kind === 'connection' && x.key === from);
    return e
      ? {
          ...e,
          key: `${key}-${suffix}`,
          name: `${what} « ${name} » (repris de la Viewbox)`,
          status: 'suggested',
          origin: undefined,
          id: undefined,
          source: [{ ref: `copy:${from}`, note: `assemblage Viewbox repris le ${today()} par ${p.who} : mêmes boulons, plats et profils du type à confirmer — capacités indicatives` }],
        }
      : null;
  };
  const reused = reuse
    ? [!cornerEntry && copyOf('VBX-CORNER', 'CORNER', 'Angle poteau / cadre'), !contactEntry && copyOf('VBX-VERTICAL-CONTACT', 'CONTACT', 'Contact poteau / cadre'), frame.joints.side.model === 'bolts' && copyOf('VBX-HORIZONTAL-BOLT', 'BOLT', 'Boulons entre modules')].filter((e): e is ConnectionEntry => !!e)
    : [];
  const typed = [cornerEntry, contactEntry, ...reused].filter((e): e is ConnectionEntry => !!e);
  const library = useMemo(() => (typed.length ? [...p.library.filter((e) => !typed.some((t) => t.key === e.key)), ...typed] : p.library), [p.library, JSON.stringify(typed)]); // eslint-disable-line react-hooks/exhaustive-deps
  const connections = {
    ...conn,
    ...Object.fromEntries(reused.map((e) => [e.key.endsWith('-CORNER') ? 'corner' : e.key.endsWith('-CONTACT') ? 'contact' : 'bolt', e.key])),
    ...(cornerEntry ? { corner: cornerEntry.key } : {}),
    ...(contactEntry ? { contact: contactEntry.key } : {}),
  };
  const sections = useMemo(() => frameSections([{ params }], sectionMap(library)), [params, library]);
  const check = useMemo(() => checkFrame(params, sections, { footContact: foot, connections }), [params, sections, foot, connections]);
  const steel = useMemo(() => {
    try {
      return templateSteelWeight(params, sections);
    } catch {
      return 0;
    }
  }, [params, sections]);
  const area = (params.x1 - params.x0) * (params.y1 - params.y0);
  const deck = deckWeight(params);
  const span = deckSpan(params);

  const entry: ModuleTypeEntry = useMemo(
    () => ({
      kind: 'module_type',
      key,
      name: name.trim() || key,
      status: 'known',
      template: 'frame',
      family: 'other',
      nominal: { long: Math.round(p.dims.long), short: Math.round(p.dims.short), height: Math.round(params.topZ) },
      params: { ...params, frame: { ...params.frame, origin: start === 'viewbox' ? 'preset-viewbox' : params.frame.origin === 'parametric' ? 'parametric' : params.frame.origin } },
      ...(weightKg ? { weighedN: weightKg * 9.81 } : {}),
      connections,
      footContact: foot,
      source: [...(p.entry?.source ?? []), { ref: 'user', note: `${p.entry ? 'modifié' : 'créé'} dans l’atelier structure le ${today()} par ${p.who} (${start === 'viewbox' ? 'à partir de la Viewbox 5900' : 'grille paramétrique'})` }],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, name, params, weightKg, foot, JSON.stringify(connections), start],
  );
  // aperçu 3D sur le modèle
  useEffect(() => {
    p.onPreview?.(check.errors.some((e) => /incomplète/.test(e)) ? null : entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);
  useEffect(() => () => p.onPreview?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // barres groupées par rôle + section + nuance
  const groups = useMemo(() => {
    const g = new Map<string, { role: FrameRole; section: string; grade?: string; count: number; length: number; status: string }>();
    for (const b of frame.bars) {
      const k = `${b.role}|${b.section}|${b.grade ?? ''}`;
      const row = g.get(k) ?? { role: b.role, section: b.section, grade: b.grade, count: 0, length: 0, status: b.source?.sectionStatus ?? 'user' };
      row.count++;
      row.length += Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]);
      g.set(k, row);
    }
    return [...g.values()];
  }, [frame.bars]);
  const editGroup = (g: { role: FrameRole; section: string; grade?: string }, patch: Partial<FrameBar>) =>
    setFrame({ bars: frame.bars.map((b) => (b.role === g.role && b.section === g.section && (b.grade ?? '') === (g.grade ?? '') ? { ...b, ...patch, source: { ...(b.source ?? {}), sectionStatus: 'user' } } : b)) });
  const libSections = useMemo(() => library.filter((e): e is SectionEntry => e.kind === 'section' && !e.disabled && !e.section.massless && !e.key.includes('@')), [library]);
  const connOf = (pred: (e: ConnectionEntry) => boolean) => library.filter((e): e is ConnectionEntry => e.kind === 'connection' && !e.disabled && pred(e));
  const designs = library.filter((e): e is JointDesignEntry => e.kind === 'joint_design' && !e.disabled);
  const cornerModel: CornerModel = frame.joints.column.model;
  const setCornerModel = (m: CornerModel) => {
    setFrame({ joints: { ...frame.joints, column: { model: m, ...(m === 'semi' ? { stiffness: frame.joints.column.stiffness ?? base.params!.springs.columnRotation } : {}) } } });
    if (start === 'parametric') setSpec((s) => ({ ...s, columnModel: { model: m, ...(m === 'semi' ? { stiffness: s.columnModel.stiffness ?? base.params!.springs.columnRotation } : {}) } }));
  };
  const setDeck = (d: Partial<DeckSpec> | null) => {
    const cur = frame.deck.floor ?? { material: 'CP-F20/15', thickness: 18, layers: 2, span: 'u' as const };
    const next = d === null ? null : { ...cur, ...d };
    setFrame({ deck: { ...frame.deck, floor: next } });
    if (start === 'parametric') setSpec((s) => ({ ...s, floor: next }));
  };

  const save = async () => {
    if (!p.onSaveEntries) return;
    setBusy(true);
    setError('');
    try {
      const extra = [...sections.values()].filter((s) => s.key.startsWith('CAT-') && !p.library.some((e) => e.key === s.key) && frame.bars.some((b) => b.section === s.key));
      await p.onSaveEntries([...extra, ...typed, entry]);
      p.onUseType(entry.key);
      p.onClose();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const sectionSelect = (value: string, role: FrameRole, onChange: (k: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 240 }}>
      {!sections.has(value) && <option value={value}>{value} (inconnue)</option>}
      <optgroup label="Bibliothèque">
        {libSections.map((e) => (
          <option key={e.key} value={e.key}>
            {e.section.name}
          </option>
        ))}
      </optgroup>
      {ROLE_FAMILIES[role].map((fam) => (
        <optgroup key={fam} label={`${FAMILY_NAME[fam]} (catalogue, à confirmer)`}>
          {familySections(fam).map((c) => (
            <option key={c.key} value={c.key}>
              {c.section.name} — {f(sectionMass(c), 1)} kg/m
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
  const blocking = check.errors.length > 0;
  return (
    <div className="card">
      <div className="card-head">
        <h2>🏗 Atelier structure</h2>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={p.onClose}>
          ✕
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="hint">Décrire une structure du même principe que la Viewbox (cadre bas, cadre haut, poteaux) mais avec ses propres profils, assemblages et plancher. Les barres s’affichent sur le modèle 3D.</div>
        <label className="row hint">
          Nom du type <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 260 }} aria-label="Nom du type" />
          <span className="hint">clé {key}</span>
        </label>
        <div className="row" style={{ gap: 6 }}>
          <span className="hint">Départ :</span>
          <button className={`btn small ${start === 'parametric' ? '' : 'ghost'}`} onClick={() => chooseStart('parametric')}>
            Grille paramétrique
          </button>
          <button className={`btn small ${start === 'viewbox' ? '' : 'ghost'}`} onClick={() => chooseStart('viewbox')}>
            Partir de la Viewbox 5900
          </button>
        </div>

        {start === 'parametric' && (
          <div className="card" style={{ background: 'var(--bg-2)' }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <b>Grille</b>
              <div className="row hint" style={{ flexWrap: 'wrap' }}>
                Longueur <Num value={spec.long} onChange={(v) => regenerate({ ...spec, long: v })} label="Longueur" /> mm · largeur <Num value={spec.short} onChange={(v) => regenerate({ ...spec, short: v })} label="Largeur" /> mm · axe des rives à{' '}
                <Num value={spec.inset} onChange={(v) => regenerate({ ...spec, inset: v })} width={50} label="Retrait" /> mm du bord
              </div>
              <div className="row hint" style={{ flexWrap: 'wrap' }}>
                Axe des rives de toiture à <Num value={spec.roofZ} onChange={(v) => regenerate({ ...spec, roofZ: v })} label="Hauteur toiture" /> mm · plancher du module du dessus à{' '}
                <Num value={spec.topZ} onChange={(v) => regenerate({ ...spec, topZ: v })} label="Pas d’empilement" /> mm (au-dessus de l’axe du plancher)
              </div>
              <div className="row hint" style={{ flexWrap: 'wrap' }}>
                Traverses : plancher <Num value={typeof spec.transversesFloor === 'number' ? spec.transversesFloor : spec.transversesFloor.length} onChange={(v) => regenerate({ ...spec, transversesFloor: Math.max(0, Math.round(v)) })} width={40} label="Traverses plancher" /> · toiture{' '}
                <Num value={typeof spec.transversesRoof === 'number' ? spec.transversesRoof : spec.transversesRoof.length} onChange={(v) => regenerate({ ...spec, transversesRoof: Math.max(0, Math.round(v)) })} width={40} label="Traverses toiture" /> (réparties)
                <label className="row">
                  <input type="checkbox" checked={spec.stringersFloor.length > 0} onChange={(e) => regenerate({ ...spec, stringersFloor: e.target.checked ? [Math.round(spec.short / 2)] : [], stringersRoof: e.target.checked ? [Math.round(spec.short / 2)] : [] })} /> lisse centrale (plancher et toiture)
                </label>
              </div>
              <div className="row hint" style={{ flexWrap: 'wrap' }}>
                Poteaux intermédiaires par grand côté
                <select value={spec.intermediateColumns} onChange={(e) => regenerate({ ...spec, intermediateColumns: Number(e.target.value) as 0 | 1 | 2 })}>
                  {[0, 1, 2].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <label className="row">
                  <input type="checkbox" checked={spec.middleFeet} onChange={(e) => regenerate({ ...spec, middleFeet: e.target.checked })} /> pieds au milieu des grands côtés (calés si besoin)
                </label>
              </div>
              <div className="hint">Changer la grille régénère les barres (les sections choisies ci-dessous par groupe sont reprises de la grille).</div>
              <div className="row hint" style={{ flexWrap: 'wrap', gap: 6 }}>
                Rives plancher {sectionSelect(spec.sections.rimFloorLong, 'rim-floor', (k) => regenerate({ ...spec, sections: { ...spec.sections, rimFloorLong: k, rimFloorShort: k } }))}
                Rives toiture {sectionSelect(spec.sections.rimRoofLong, 'rim-roof', (k) => regenerate({ ...spec, sections: { ...spec.sections, rimRoofLong: k, rimRoofShort: k } }))}
              </div>
              <div className="row hint" style={{ flexWrap: 'wrap', gap: 6 }}>
                Traverses plancher {sectionSelect(spec.sections.transverseFloor, 'transverse-floor', (k) => regenerate({ ...spec, sections: { ...spec.sections, transverseFloor: k } }))}
                Traverses toiture {sectionSelect(spec.sections.transverseRoof, 'transverse-roof', (k) => regenerate({ ...spec, sections: { ...spec.sections, transverseRoof: k } }))}
                Poteaux {sectionSelect(spec.sections.column, 'column', (k) => regenerate({ ...spec, sections: { ...spec.sections, column: k } }))}
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="row">
            <b>Barres du calcul</b>
            <div className="spacer" style={{ flex: 1 }} />
            {p.canEdit && p.onSaveEntries && (
              <button className="btn small ghost" onClick={() => setNewSection(true)} title="Créer une section absente de la liste (profil plié, tube…)">
                ＋ Nouvelle section
              </button>
            )}
          </div>
          {newSection && (
            <NewSectionForm
              who={p.who}
              onCancel={() => setNewSection(false)}
              onSave={async (s) => {
                await p.onSaveEntries!([s]);
                setNewSection(false);
              }}
            />
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Rôle</th>
                <th>Barres</th>
                <th>Longueur</th>
                <th>Section</th>
                <th>Nuance</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const s = sections.get(g.grade ? `${g.section}@${g.grade}` : g.section);
                return (
                  <tr key={`${g.role}|${g.section}|${g.grade ?? ''}`}>
                    <td>{FRAME_ROLE_LABEL[g.role]}</td>
                    <td>{g.count}</td>
                    <td>{f(g.length / 1e3, 1)} m</td>
                    <td>{sectionSelect(g.section, g.role, (k) => editGroup(g, { section: k, grade: undefined }))}</td>
                    <td>
                      <select value={g.grade ?? s?.material ?? 'S235'} onChange={(e) => editGroup(g, { grade: e.target.value === (sections.get(g.section)?.material ?? '') ? undefined : e.target.value })}>
                        {GRADES.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {!s ? (
                        <span className="badge ko">inconnue</span>
                      ) : g.section.startsWith('CAT-') || s.status !== 'known' ? (
                        <span className="badge orange">à confirmer</span>
                      ) : (
                        <span className="badge ok">reconnue</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ background: 'var(--bg-2)' }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b>Assemblages</b>
            <label className="row hint" style={{ flexWrap: 'wrap' }}>
              <input type="checkbox" checked={reuse} onChange={(e) => setReuse(e.target.checked)} aria-label="Reprendre les assemblages Viewbox" />
              Mêmes assemblages que la Viewbox (mêmes boulons M16) : reprendre ses capacités (angles, contact, boulons entre modules)
              {reuse && <span className="badge orange">indicatif : plats et profils de ce type différents → verdict « limite » au mieux</span>}
            </label>
            <div className="row hint" style={{ flexWrap: 'wrap' }}>
              Angles poteau / cadre
              {(['semi', 'rigid', 'pinned'] as CornerModel[]).map((m) => (
                <label key={m} className="row">
                  <input type="radio" checked={cornerModel === m} onChange={() => setCornerModel(m)} />
                  {m === 'semi' ? 'boulonnés (capacités à saisir)' : m === 'rigid' ? 'soudés' : 'articulés'}
                </label>
              ))}
            </div>
            {cornerModel === 'semi' && (
              <>
                <div className="row hint" style={{ flexWrap: 'wrap' }}>
                  Raideur en rotation{' '}
                  <Num value={Math.round((frame.joints.column.stiffness ?? base.params!.springs.columnRotation) / KNCM_PER_DEG)} onChange={(v) => setFrame({ joints: { ...frame.joints, column: { model: 'semi', stiffness: v * KNCM_PER_DEG } } })} label="Raideur des angles" /> kNcm/deg
                  · capacités
                  <select value={cornerCaps ? '__typed' : (conn.corner ?? '')} onChange={(e) => (e.target.value === '__typed' ? setCornerCaps({ N: 0, Mb: 0, M1: 0, M2: 0, C: 0 }) : [setCornerCaps(null), setConn({ ...conn, corner: e.target.value || undefined })])}>
                    <option value="">— à renseigner —</option>
                    <option value="__typed">saisir les capacités (non vérifiées)</option>
                    {connOf((e) => e.capacities.some((c) => c.key === 'M_biax')).map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
                {cornerCaps && (
                  <div className="row hint" style={{ flexWrap: 'wrap' }}>
                    N <Num value={cornerCaps.N} onChange={(v) => setCornerCaps({ ...cornerCaps, N: v })} width={60} label="N" /> kN · M biaxial <Num value={cornerCaps.Mb} onChange={(v) => setCornerCaps({ ...cornerCaps, Mb: v })} width={60} label="M biaxial" /> kNm · M dominant{' '}
                    <Num value={cornerCaps.M1} onChange={(v) => setCornerCaps({ ...cornerCaps, M1: v })} width={60} label="M dominant" /> kNm · M secondaire <Num value={cornerCaps.M2} onChange={(v) => setCornerCaps({ ...cornerCaps, M2: v })} width={60} label="M secondaire" /> kNm · compression par contact{' '}
                    <Num value={cornerCaps.C} onChange={(v) => setCornerCaps({ ...cornerCaps, C: v })} width={60} label="Compression contact" /> kN
                    <span className="badge orange">saisi, non vérifié : verdict « limite » au mieux</span>
                  </div>
                )}
              </>
            )}
            <div className="row hint" style={{ flexWrap: 'wrap' }}>
              Modules côte à côte
              <select value={frame.joints.side.model} onChange={(e) => setFrame({ joints: { ...frame.joints, side: { model: e.target.value as 'bolts' | 'contact-only' | 'custom' } } })}>
                <option value="bolts">boulonnés</option>
                <option value="contact-only">simple contact</option>
              </select>
              {frame.joints.side.model === 'bolts' && (
                <select value={conn.bolt ?? ''} onChange={(e) => setConn({ ...conn, bolt: e.target.value || undefined })}>
                  <option value="">— capacités à renseigner —</option>
                  {connOf((e) => e.capacities.some((c) => c.key === 'FvRd')).map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="row hint" style={{ flexWrap: 'wrap' }}>
              Empilement
              <select
                value={conn.stackDesign ? `jd:${conn.stackDesign}` : conn.plate ? `c:${conn.plate}` : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setConn({ ...conn, plate: v.startsWith('c:') ? v.slice(2) : undefined, contact: v.startsWith('c:') ? 'VBX-VERTICAL-CONTACT' : conn.contact, stackDesign: v.startsWith('jd:') ? v.slice(3) : undefined });
                }}
              >
                <option value="">— à renseigner (pas d’empilement vérifié) —</option>
                {connOf((e) => e.key === 'VBX-VERTICAL-PLATE').map((e) => (
                  <option key={e.key} value={`c:${e.key}`}>
                    plats Viewbox ({e.name})
                  </option>
                ))}
                {designs.map((d) => (
                  <option key={d.key} value={`jd:${d.key}`}>
                    pièce de l’atelier Accessoires : {d.name}
                  </option>
                ))}
              </select>
              <span className="hint">(clamp, plat, pièce d’angle… : à décrire dans l’onglet « 🔩 Accessoires »)</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ background: 'var(--bg-2)' }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b>Plancher</b>
            {frame.deck.floor ? (
              <div className="row hint" style={{ flexWrap: 'wrap' }}>
                <select value={frame.deck.floor.material} onChange={(e) => setDeck({ material: e.target.value })}>
                  {PLYWOODS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <Num value={frame.deck.floor.layers} onChange={(v) => setDeck({ layers: Math.max(1, Math.round(v)) })} width={40} label="Couches" /> couche(s) de{' '}
                <Num value={frame.deck.floor.thickness} onChange={(v) => setDeck({ thickness: v })} width={50} label="Épaisseur" /> mm · porte
                <select value={frame.deck.floor.span} onChange={(e) => setDeck({ span: e.target.value as DeckSpec['span'] })}>
                  <option value="u">d’une traverse à l’autre (sens de la longueur)</option>
                  <option value="v">d’une lisse à l’autre (sens de la largeur)</option>
                  <option value="two-way">sur une grille (deux sens)</option>
                </select>
                {span && (
                  <span>
                    portée mesurée {f(span.span)} mm, {span.count} travée(s)
                  </span>
                )}
              </div>
            ) : (
              <div className="row hint">
                <span className="badge ko">plancher à renseigner</span>
                <button className="btn small ghost" onClick={() => setDeck({})}>
                  Contreplaqué
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="card" style={{ background: 'var(--bg-2)', flex: 1, minWidth: 260 }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <b>Poids d’une unité</b>
              <div className="hint">
                Calculé : barres {f(steel / 9.81)} kg + plancher {f((deck * area) / 9.81)} kg (sans plafond, murs ni garde-corps)
              </div>
              <label className="row hint">
                Pesée (kg, facultatif)
                <input type="text" inputMode="decimal" value={weightKg ?? ''} onChange={(e) => setWeightKg(parseFloat(e.target.value.replace(',', '.')) || null)} style={{ width: 80 }} aria-label="Pesée" />
                {!weightKg && <span className="hint">sans pesée : poids calculé (barres + plafond + sol)</span>}
              </label>
            </div>
          </div>
          <div className="card" style={{ background: 'var(--bg-2)', flex: 1, minWidth: 260 }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <b>Pieds</b>
              <div className="hint">
                {frame.feet.filter((x) => x.kind === 'corner').length} pieds d’angle{frame.feet.some((x) => x.kind === 'middle') ? ` + ${frame.feet.filter((x) => x.kind === 'middle').length} pieds centraux (calés si besoin)` : ''}
              </div>
              <label className="row hint">
                Surface posée sur le calage
                <Num value={foot.a1 / 10} onChange={(v) => setFoot({ ...foot, a1: v * 10 })} width={50} label="Contact a1" /> ×
                <Num value={foot.a2 / 10} onChange={(v) => setFoot({ ...foot, a2: v * 10 })} width={50} label="Contact a2" /> cm
              </label>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <b>Contrôles</b>
            {check.errors.map((e, k) => (
              <div key={`e${k}`} style={{ color: 'var(--danger)' }}>
                ✖ {e}
              </div>
            ))}
            {!check.errors.length && <div style={{ color: 'var(--ok)' }}>✔ Structure complète, barres reliées, stable sur ses pieds (1 kN en tête selon la longueur et la largeur).</div>}
            {check.warnings.map((w, k) => (
              <div key={`w${k}`} style={{ color: 'var(--warn)' }}>
                ⚠ {w}
              </div>
            ))}
            {check.missing.length > 0 && <div className="hint">À renseigner pour un calcul complet (sinon ⛔ incomplet) : {check.missing.join(' ; ')}.</div>}
            <div className="hint">Type non couvert par une note de calcul de référence : le rapport le dira, verdict « limite » au mieux.</div>
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        <div className="row">
          {p.canEdit && p.onSaveEntries ? (
            <button className="btn" disabled={busy || blocking} onClick={save} title={blocking ? 'Corriger les erreurs ci-dessus avant d’enregistrer' : ''}>
              💾 Enregistrer le type et l’utiliser pour ce module
            </button>
          ) : (
            <span className="hint">Enregistrer un type : administrateur, responsable technique ou ingénieur.</span>
          )}
          {blocking && <span className="hint">Corriger d’abord : {check.errors[0]}</span>}
        </div>
      </div>
    </div>
  );
}

/** Fiche d'un type de structure personnalisé (étape 1, Réglages › Bibliothèque) : barres par famille, assemblages, pieds, poids. */
export function CustomTypeSheet({ entry, library, canEdit, onEdit }: { entry: ModuleTypeEntry; library: LibraryEntry[]; canEdit: boolean; onEdit?: () => void }) {
  const rows = useMemo(() => {
    try {
      return templateSummary(entry, library);
    } catch {
      return [];
    }
  }, [entry, library]);
  const name = (k?: string) => (k ? (library.find((e) => e.key === k)?.name ?? k) : 'à renseigner');
  const c = entry.connections ?? {};
  const fr = entry.params?.frame;
  const col = fr?.joints.column.model;
  return (
    <div className="card" style={{ background: 'var(--bg-2)' }}>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="row">
          <b>Structure du type « {entry.name} »</b>
          <span className="badge orange">type personnalisé</span>
          <div className="spacer" style={{ flex: 1 }} />
          {canEdit && onEdit && (
            <button className="btn small ghost" onClick={onEdit}>
              ✎ Ouvrir dans l’atelier
            </button>
          )}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Famille</th>
              <th>Section</th>
              <th>Barres</th>
              <th>Longueur</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.family}|${r.section}`}>
                <td>
                  <i style={{ display: 'inline-block', width: 10, height: 10, background: `#${r.color.toString(16).padStart(6, '0')}`, marginRight: 6 }} />
                  {r.label}
                </td>
                <td>
                  {r.section} <span className="hint">{r.material}</span>
                </td>
                <td>{r.count}</td>
                <td>{f(r.length / 1e3, 1)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint">
          Angles : {col === 'semi' ? `boulonnés (${name(c.corner)})` : col === 'rigid' ? 'soudés (pleine résistance supposée, à justifier)' : 'articulés'} · côte à côte : {fr?.joints.side.model === 'bolts' ? `boulons (${name(c.bolt)})` : 'simple contact'} · empilement :{' '}
          {name(c.stackDesign ?? c.plate)}
        </div>
        <div className="hint">
          Plancher : {fr?.deck.floor ? `${fr.deck.floor.layers} × ${f(fr.deck.floor.thickness)} mm ${fr.deck.floor.material}` : 'à renseigner'} · pied {entry.footContact ? `${f(entry.footContact.a1 / 10)} × ${f(entry.footContact.a2 / 10)} cm` : 'à renseigner'} · poids{' '}
          {entry.weighedN ? `${f(entry.weighedN / 9.81)} kg pesés` : 'calculé (non pesé)'}
        </div>
        <div className="hint">{entry.source.map((s) => s.note).filter(Boolean).slice(-2).join(' · ')}</div>
      </div>
    </div>
  );
}
