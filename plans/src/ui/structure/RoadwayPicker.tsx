// Choix de la plaque de roulage (étape 5) : offres du catalogue (acier, aluminium, plastique) ou plaque saisie depuis la
// fiche d'un loueur ; position des pieds sur les plaques. Le calcul (raideur, résistance, répartition sous chaque appui)
// est fait par `roadwaySpread` dans le calage.
import { useState } from 'react';
import type { CalageResult } from '../../structure/core/calage';
import type { RoadwayMaterial, RoadwayPlate, RoadwayPosition } from '../../structure/core/roadwayPlates';
import { ROADWAY_MATERIALS, ROADWAY_MATERIAL_ORDER, ROADWAY_PLATES, findRoadwayPlate, roadwayStiffness } from '../../structure/core/roadwayPlates';
import type { CalageChoices } from '../../structure/core/spreading';
import { fmtNumber } from '../../structure/core/units';

const n = (v: number, d = 0) => fmtNumber(v, d);
const NEW = '__new';

export type RoadwayPatch = Pick<CalageChoices, 'roadwayPlate' | 'roadwayCustom' | 'roadwayPosition'>;

function optionText(p: RoadwayPlate): string {
  const kgm2 = p.massKg / ((p.l * p.w) / 1e6);
  return `${p.name}${p.supplier ? ` — ${p.supplier}` : ''} · ${n(p.massKg)} kg (${n(kgm2)} kg/m²)`;
}

interface Draft {
  name: string;
  supplier: string;
  material: RoadwayMaterial;
  l: string;
  w: string;
  t: string;
  massKg: string;
  E: string;
  EI: string;
  fm: string;
  fc: string;
  joints: 'locked' | 'loose';
  url: string;
  offer: string;
}

const draftOf = (p?: RoadwayPlate | null): Draft => ({
  name: p?.custom ? p.name : p ? `${p.name} (modifiée)` : '',
  supplier: p?.supplier ?? '',
  material: p?.material ?? 'plastic',
  l: p ? String(p.l) : '',
  w: p ? String(p.w) : '',
  t: p ? String(p.t) : '',
  massKg: p ? String(p.massKg) : '',
  E: p?.E ? String(p.E) : '',
  EI: p?.EI ? String(p.EI / 1e6) : '',
  fm: p?.fm ? String(p.fm) : '',
  fc: p?.fc ? String(p.fc) : '',
  joints: p?.joints ?? 'loose',
  url: p?.url ?? '',
  offer: p?.offer ?? 'location',
});

const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

function plateOfDraft(d: Draft, base: RoadwayPlate | null): RoadwayPlate | string {
  const l = num(d.l);
  const w = num(d.w);
  const t = num(d.t);
  const massKg = num(d.massKg);
  if (!d.name.trim()) return 'Nom de la plaque à saisir.';
  if (!l || !w || !t) return 'Dimensions (longueur, largeur, épaisseur) à saisir.';
  if (!massKg) return 'Masse d’une plaque à saisir (fiche du loueur).';
  const EI = num(d.EI);
  return {
    key: 'custom',
    custom: true,
    name: d.name.trim(),
    supplier: d.supplier.trim(),
    material: d.material,
    l,
    w,
    t,
    massKg,
    offer: d.offer.trim() || 'à demander',
    ...(num(d.E) ? { E: num(d.E)! } : {}),
    ...(EI ? { EI: EI * 1e6 } : {}),
    ...(num(d.fm) ? { fm: num(d.fm)! } : {}),
    ...(num(d.fc) ? { fc: num(d.fc)! } : {}),
    ...(base?.punching ? { punching: base.punching } : {}),
    joints: d.joints,
    ...(d.url.trim() ? { url: d.url.trim() } : {}),
    source: `saisie depuis la fiche du fabricant / du loueur${base && !base.custom ? ` (d’après ${base.name})` : ''} — valeurs non vérifiées`,
  };
}

function CustomEditor({ start, onSave, onCancel }: { start: RoadwayPlate | null; onSave: (p: RoadwayPlate) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(() => draftOf(start));
  const [err, setErr] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const field = (k: keyof Draft, label: string, unit: string, hint?: string, width = 80) => (
    <label className="row" style={{ gap: 6 }} title={hint}>
      <span style={{ minWidth: 170 }}>{label}</span>
      <input style={{ width }} value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} data-testid={`roadway-custom-${k}`} />
      <span className="hint">{unit}</span>
    </label>
  );
  return (
    <div className="card" style={{ background: 'var(--panel-2, #f7f7f9)' }} data-testid="roadway-custom">
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <b>Autre plaque — données de la fiche du fabricant / du loueur</b>
        {field('name', 'Nom', '', undefined, 280)}
        {field('supplier', 'Fabricant / loueur', '', undefined, 200)}
        <label className="row" style={{ gap: 6 }}>
          <span style={{ minWidth: 170 }}>Matériau</span>
          <select value={d.material} onChange={(e) => set('material', e.target.value as RoadwayMaterial)} data-testid="roadway-custom-material">
            {ROADWAY_MATERIAL_ORDER.map((m) => (
              <option key={m} value={m}>
                {ROADWAY_MATERIALS[m].label}
              </option>
            ))}
          </select>
        </label>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {field('l', 'Longueur', 'mm')}
          {field('w', 'Largeur', 'mm')}
          {field('t', 'Épaisseur', 'mm')}
          {field('massKg', 'Masse d’une plaque', 'kg')}
        </div>
        {field('E', 'Module d’élasticité E', 'N/mm²', 'plastique : valeur du fabricant pour la durée de la charge (le plastique flue) ; acier / aluminium : vide = valeur de la norme')}
        <div className="hint" style={{ marginLeft: 176 }}>
          {d.material === 'plastic'
            ? 'Plastique : demander au fabricant le module pour une charge de plusieurs jours (fluage). Sans lui, seule l’épaisseur compte. Les valeurs « courte durée » des fiches (700–1 200 N/mm² pour du PEHD plein) surestiment la répartition d’une charge qui reste plusieurs jours.'
            : `Vide = ${ROADWAY_MATERIALS[d.material].source}.`}
        </div>
        {field('EI', 'Raideur E I (si donnée)', 'kN·m² par m de largeur', 'plaques nervurées / alvéolées : sinon, plaque pleine de même masse (valeur minimale)')}
        {field('fm', 'Résistance en flexion', 'N/mm²', 'vide = acier S235 / aluminium 6063 T5 ; plastique : à donner par le fabricant')}
        {field('fc', 'Résistance à la compression', 'N/mm²', 'information du fabricant (plastique)')}
        <label className="row" style={{ gap: 6 }}>
          <span style={{ minWidth: 170 }}>Assemblage des plaques</span>
          <select value={d.joints} onChange={(e) => set('joints', e.target.value as 'locked' | 'loose')} data-testid="roadway-custom-joints">
            <option value="locked">reliées par verrous / connecteurs</option>
            <option value="loose">posées bord à bord (sans liaison)</option>
          </select>
        </label>
        {field('offer', 'Offre', '', undefined, 280)}
        {field('url', 'Lien de la fiche', '', undefined, 320)}
        {err && <div className="hint" style={{ color: 'var(--ko, #c62828)' }}>{err}</div>}
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn small primary"
            data-testid="roadway-custom-save"
            onClick={() => {
              const p = plateOfDraft(d, start);
              if (typeof p === 'string') setErr(p);
              else onSave(p);
            }}
          >
            Utiliser cette plaque
          </button>
          <button className="btn small ghost" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/** Choix de la plaque de roulage et de la pose, avec ce que le calcul en retient. */
export function RoadwayPicker({ result, choices, onChange }: { result: CalageResult; choices: CalageChoices; onChange: (p: RoadwayPatch) => void }) {
  const [editing, setEditing] = useState<RoadwayPlate | null | false>(false);
  const current = findRoadwayPlate(choices.roadwayPlate, choices.roadwayCustom);
  const info = result.roadwayPlate;
  const custom = choices.roadwayCustom;
  const st = current ? roadwayStiffness(current) : null;
  const position: RoadwayPosition = choices.roadwayPosition ?? 'joint';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 22 }} data-testid="roadway-picker">
      <label className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span>Plaque de roulage</span>
        <select
          value={current ? current.key : ''}
          style={{ maxWidth: 560 }}
          data-testid="roadway-plate"
          onChange={(e) => {
            const v = e.target.value;
            if (v === NEW) setEditing(current);
            else onChange({ roadwayPlate: v || undefined });
          }}
        >
          <option value="">— Choisir la plaque (sinon : supposées rigides, calcul non vérifié) —</option>
          {ROADWAY_MATERIAL_ORDER.map((m) => (
            <optgroup key={m} label={ROADWAY_MATERIALS[m].label}>
              {ROADWAY_PLATES.filter((p) => p.material === m).map((p) => (
                <option key={p.key} value={p.key}>
                  {optionText(p)}
                </option>
              ))}
            </optgroup>
          ))}
          {custom && (
            <optgroup label="Saisie">
              <option value={custom.key}>✎ {optionText(custom)}</option>
            </optgroup>
          )}
          <option value={NEW}>＋ Autre plaque (fiche du loueur)…</option>
        </select>
        {current && (
          <button className="btn small ghost" onClick={() => setEditing(current)} data-testid="roadway-edit">
            ✎ Modifier les données
          </button>
        )}
      </label>
      {current && st && (
        <div className="hint" style={{ lineHeight: 1.5 }} data-testid="roadway-plate-info">
          {n(current.l)} × {n(current.w)} × {n(current.t)} mm, {n(current.massKg)} kg — {ROADWAY_MATERIALS[current.material].label.toLowerCase()} —{' '}
          {current.joints === 'locked' ? 'plaques reliées par verrous' : 'plaques posées bord à bord'} — offre : {current.offer}
          {current.rated ? ` — annoncé : ${current.rated}` : ''}.
          <br />
          {info ? (
            st.EI ? (
              <>
                Sur ce sol, une plaque répartit la charge d’un pied jusqu’à <b>≈ {n(info.reach / 10)} cm</b> autour de lui ({st.text}).
              </>
            ) : (
              <span style={{ color: 'var(--warn, #b26a00)' }}>
                Module d’élasticité non donné par le fabricant : seule l’épaisseur ({n(current.t / 10, 1)} cm) compte — le demander au loueur et le saisir (« ✎ Modifier les données »).
              </span>
            )
          ) : null}
          {info ? <> ≈ {info.count} plaques pour couvrir la surface (sans les chutes).</> : null}
          <br />
          Source : {current.source}
          {current.url ? (
            <>
              {' '}
              —{' '}
              <a href={current.url} target="_blank" rel="noreferrer">
                fiche
              </a>
            </>
          ) : null}
        </div>
      )}
      {current && (
        <label className="row" style={{ gap: 6 }}>
          <span>Position des pieds sur les plaques</span>
          <select value={position} onChange={(e) => onChange({ roadwayPosition: e.target.value as RoadwayPosition })} data-testid="roadway-position">
            <option value="joint">un pied peut tomber sur un joint (pose libre, prudent)</option>
            <option value="middle">chaque pied au milieu d’une plaque (pose contrôlée sur site)</option>
          </select>
        </label>
      )}
      {editing !== false && (
        <CustomEditor
          start={editing}
          onCancel={() => setEditing(false)}
          onSave={(p) => {
            onChange({ roadwayCustom: p, roadwayPlate: p.key });
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
