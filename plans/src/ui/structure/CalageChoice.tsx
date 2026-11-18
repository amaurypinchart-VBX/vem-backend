// Calage appui par appui (étape 5 et calcul rapide) : choix des plaques par type d'appui ou pour un appui, étapes de la
// répartition pied → plaques → sol, diagnostic de chaque groupe d'appuis avec la plaque à prendre, plaques de roulage.
import { useState } from 'react';
import type { CalageResult, CalageType, SupportCheck } from '../../structure/core/calage';
import type { DrawnBlock } from '../../structure/core/blocks';
import type { RoadwayType, StockPlate } from '../../structure/core/ground';
import { BLOCK_PLATE_THICKNESSES, JOIST_SECTIONS, PLATE_LABEL, blockPlateKey, joistKey, layerThickness, parseBlockPlateKey, parseJoistKey, plateKey, stockPlateLabel } from '../../structure/core/ground';
import { verdictOf } from '../../structure/core/records';
import type { CalageChoices, LayerRef } from '../../structure/core/spreading';
import { dimsCm, kN, m2, pressureText, resolveLayers } from '../../structure/core/spreading';
import { supportType } from '../../structure/core/roadway';
import { fmtNumber } from '../../structure/core/units';

const n = (v: number, d = 1) => fmtNumber(v, d);
export const badgeOf = (eta: number) => (verdictOf(eta) === 'ok' ? 'ok' : verdictOf(eta) === 'limit' ? 'orange' : 'ko');
/** Couleur d'un appui sur le plan selon son taux de travail (vert, orange, rouge). */
// couleurs des taux : les mêmes que sur les plans (écran et fiche PDF)
export { CHECK_COLORS, checkColor } from '../../structure/report/groundSheet';
import { checkColor } from '../../structure/report/groundSheet';

/** Libellé court d'une couche choisie : plaque du stock, plaque à la taille du bloc ou madriers sur chant. */
function refText(r: LayerRef, stock: StockPlate[]): string {
  const j = parseJoistKey(r.plate);
  if (j) return `${r.n} madrier${r.n > 1 ? 's' : ''} ${j.b} × ${j.h} sur chant`;
  const bp = parseBlockPlateKey(r.plate);
  if (bp) return `${r.n} × ${bp.t} mm`;
  const s = stock.find((p) => plateKey(p) === r.plate);
  return `${r.n} × ${s ? `${s.length / 10} × ${s.width / 10} × ${s.thickness} mm` : r.plate}`;
}

/** Résumé court d'un calage (« 2 × 100 × 100 × 36 mm », « aucune plaque »). */
export function refsText(refs: LayerRef[] | undefined, stock: StockPlate[]): string {
  if (refs === undefined) return 'automatique';
  if (!refs.length) return 'aucune plaque';
  return refs.map((r) => refText(r, stock)).join(' + ');
}

/** Couches toutes faites (A. Pinchart 18.11.2026) : de haut en bas, avec la plaque `plate` (1 × 1 m, 18 mm). */
export function stackPresets(plate: string | null): Array<{ label: string; title: string; refs: LayerRef[] }> {
  if (!plate) return [];
  const J = joistKey(75, 225);
  return [
    {
      label: 'Rehausse sur madriers (3 + 3 madriers + 4)',
      title: 'De haut en bas : 3 plaques, 3 madriers 75 × 225 sur chant (un à chaque bord, un au milieu), 4 plaques',
      refs: [
        { plate, n: 3 },
        { plate: J, n: 3 },
        { plate, n: 4 },
      ],
    },
    {
      label: 'Cale caisson (1 + 3 madriers + 1)',
      title: 'De haut en bas : 1 plaque, 3 madriers 75 × 225 sur chant (un à chaque bord, un au milieu), 1 plaque',
      refs: [
        { plate, n: 1 },
        { plate: J, n: 3 },
        { plate, n: 1 },
      ],
    },
  ];
}

/** Plaques proposées dans le choix des couches : celles du stock. */
export const stockOptions = (stock: StockPlate[]) => stock.map((s) => ({ key: plateKey(s), label: stockPlateLabel(s) }));

/** Plaque des couches toutes faites : multiplex 100 × 100 × 18 mm du stock, sinon la plus grande plaque de 18 mm. */
export function presetPlate(stock: StockPlate[]): string | null {
  const t18 = stock.filter((s) => s.thickness === 18 && (s.material ?? 'F40') !== 'hdpe');
  const exact = t18.find((s) => s.length === 1000 && s.width === 1000 && s.material === 'birch') ?? t18.find((s) => s.length === 1000 && s.width === 1000);
  const big = [...t18].sort((a, b) => b.length * b.width - a.length * a.width)[0];
  const p = exact ?? big;
  return p ? plateKey(p) : null;
}

/** Plaques d'une cale composée : à la taille du bloc, multiplex bouleau ou F40/30, épaisseurs courantes. */
export const blockPlateOptions = () =>
  (['birch', 'F40'] as const).flatMap((m) => BLOCK_PLATE_THICKNESSES.map((t) => ({ key: blockPlateKey(m, t), label: `${PLATE_LABEL[m]} ${t} mm (à la taille du bloc)` })));

/**
 * Blocs bois dessinés dans le modèle : bloc de bois plein (comme dessiné) ou cale composée — plaques à la taille du bloc
 * et madriers sur chant (A. Pinchart 18.11.2026 : « une cale de 1 × 1 m : une plaque de 18 mm, des madriers 75 × 225 sur
 * leur tranche à gauche, à droite et au milieu, puis une plaque de 18 mm »). Hauteur et masse comparées au dessin.
 */
export function BlockCompositionCard({ blocks, value, onChange, stock }: { blocks: DrawnBlock[]; value: LayerRef[] | undefined; onChange: (v: LayerRef[] | undefined) => void; stock: StockPlate[] }) {
  const composed = !!value?.length;
  // blocs de même taille regroupés : hauteur et masse dessinées, puis celles de la cale
  const sizes = new Map<string, { n: number; b: DrawnBlock }>();
  for (const b of blocks) {
    const k = `${Math.round(b.x1 - b.x0)}x${Math.round(b.z1 - b.z0)}x${Math.round(b.top - b.bottom)}`;
    const e = sizes.get(k);
    if (e) e.n++;
    else sizes.set(k, { n: 1, b });
  }
  const cm = (mm: number) => n(mm / 10, mm % 10 ? 1 : 0);
  return (
    <div className="card" data-testid="block-composition">
      <div className="card-head">
        <h2>🧱 Blocs dessinés : de quoi sont-ils faits ?</h2>
        <span className="hint">un bloc dessiné peut être une cale faite de plaques et de madriers sur chant — elle est calculée, dessinée dans la coupe et comptée dans le matériel</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <select
            value={composed ? 'composed' : 'solid'}
            onChange={(e) => onChange(e.target.value === 'solid' ? undefined : [{ plate: blockPlateKey('birch', 18), n: 1 }, { plate: joistKey(75, 225), n: 3 }, { plate: blockPlateKey('birch', 18), n: 1 }])}
            data-testid="block-composition-mode"
          >
            <option value="solid">Bloc de bois plein, comme dessiné (masse du modèle)</option>
            <option value="composed">Cale composée : plaques et madriers sur chant</option>
          </select>
        </div>
        {composed && (
          <>
            <LayerPicker
              value={value}
              onChange={(v) => onChange(v?.length ? v : undefined)}
              stock={stock}
              plates={blockPlateOptions()}
              inheritLabel="Bloc de bois plein, comme dessiné"
              noneLabel="Bloc de bois plein, comme dessiné"
              firstLabel="dessus de la cale"
              presets={stackPresets(blockPlateKey('birch', 18))}
              testId="block-composition-layers"
            />
            <div className="hint">
              {[...sizes.values()].map(({ n: count, b }) => {
                const { layers } = resolveLayers(value!, stock, [b.x1 - b.x0, b.z1 - b.z0]);
                const h = layers.reduce((a, l) => a + layerThickness(l), 0);
                const m = layers.reduce((a, l) => a + l.n * l.massKg, 0);
                const dh = h - (b.top - b.bottom);
                return (
                  <div key={b.id}>
                    {count} bloc{count > 1 ? 's' : ''} {cm(b.x1 - b.x0)} × {cm(b.z1 - b.z0)} cm : dessiné{count > 1 ? 's' : ''} {cm(b.top - b.bottom)} cm de haut, {n(b.massKg, 0)} kg → cale composée {cm(h)} cm, {n(m, 0)} kg
                    {Math.abs(dh) > 10 ? ` (${n(Math.abs(dh) / 10, 1)} cm ${dh > 0 ? 'plus haut' : 'plus bas'} que le dessin : les vérins sortent d’autant ${dh > 0 ? 'moins' : 'plus'})` : ''}
                  </div>
                );
              })}
            </div>
            <div className="hint">
              Les plaques posées <b>sous</b> la cale (ex. 3 plaques de 18 mm sur les plaques de roulage) se choisissent dans la carte de chaque type d’appui (« Calage de ce type »). Madriers : un à chaque bord, les autres à intervalles
              égaux, vissés aux plaques en tête et en pied.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export interface RoadwayFieldsProps {
  types: RoadwayType[];
  /** clé du type choisi ; '' = autre (saisi à la main) */
  value: string;
  kgm2: number;
  mm: number;
  onType: (key: string) => void;
  onKg: (v: number) => void;
  onMm: (v: number) => void;
}

/** Type de plaques de roulage (stock, PEHD Viewbox, tôles…) : poids au m² et épaisseur repris, ou saisis. */
export function RoadwayTypeFields(p: RoadwayFieldsProps) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span>Type de plaques de roulage</span>
      <select value={p.value} style={{ maxWidth: 360 }} onChange={(e) => p.onType(e.target.value)} data-testid="roadway-type">
        <option value="">Autre : poids et épaisseur saisis</option>
        {p.types.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <input type="number" min={0} step={1} style={{ width: 70 }} value={Math.round(p.kgm2 * 10) / 10} onChange={(e) => p.onKg(Math.max(0, parseFloat(e.target.value) || 0))} data-testid="roadway-kg" />
      <span>kg/m²</span>
      <input type="number" min={0} step={1} style={{ width: 60 }} value={p.mm} onChange={(e) => p.onMm(Math.max(0, parseFloat(e.target.value) || 0))} data-testid="roadway-mm" />
      <span>mm</span>
      <span className="hint">— poids compté sur le sol / la dalle, épaisseur dans la coupe du calage</span>
    </div>
  );
}

/**
 * Choix des couches sous un appui : hériter (automatique ou choix du type), aucune plaque, une plaque du stock, ou
 * plusieurs couches (n plaques identiques par couche, ou des madriers sur chant entre deux couches de plaques).
 * `plates` = plaques proposées (le stock, ou les plaques à la taille du bloc pour une cale composée).
 */
export function LayerPicker({
  value,
  onChange,
  stock,
  inheritLabel,
  plates,
  presets,
  noneLabel = 'Aucune plaque (pied posé directement)',
  firstLabel = 'sous le pied',
  testId,
}: {
  value: LayerRef[] | undefined;
  onChange: (v: LayerRef[] | undefined) => void;
  stock: StockPlate[];
  inheritLabel: string;
  plates?: Array<{ key: string; label: string }>;
  presets?: Array<{ label: string; title: string; refs: LayerRef[] }>;
  noneLabel?: string;
  firstLabel?: string;
  testId?: string;
}) {
  const options = plates ?? stockOptions(stock);
  const keys = options.map((o) => o.key);
  const labelOf = (k: string) => options.find((o) => o.key === k)?.label ?? `${k} (plus au stock)`;
  // éditeur des couches ouvert tant que l'utilisateur y travaille (même revenu à une seule plaque)
  const [multi, setMulti] = useState(false);
  const single = value?.length === 1 && value[0].n === 1 && keys.includes(value[0].plate);
  const mode = value === undefined ? '' : !value.length ? 'none' : single && !multi ? value[0].plate : 'custom';
  const set = (i: number, patch: Partial<LayerRef>) => onChange(value!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => {
    const v = [...value!];
    [v[i], v[i + d]] = [v[i + d], v[i]];
    onChange(v);
  };
  const lastPlate = [...(value ?? [])].reverse().find((r) => !parseJoistKey(r.plate))?.plate ?? keys[keys.length - 1];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={testId}>
      <select
        value={mode}
        style={{ maxWidth: 440 }}
        onChange={(e) => {
          const v = e.target.value;
          setMulti(v === 'custom');
          if (v === '') onChange(undefined);
          else if (v === 'none') onChange([]);
          else if (v === 'custom') {
            if (!value?.length) onChange(keys.length ? [{ plate: keys[keys.length - 1], n: 1 }] : []);
          } else onChange([{ plate: v, n: 1 }]);
        }}
      >
        <option value="">{inheritLabel}</option>
        <option value="none">{noneLabel}</option>
        {keys.map((k) => (
          <option key={k} value={k}>
            1 × {labelOf(k)}
          </option>
        ))}
        <option value="custom">Plusieurs couches (plaques empilées, madriers sur chant)…</option>
      </select>
      {!!presets?.length && (
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          <span className="hint">Tout fait :</span>
          {presets.map((p) => (
            <button
              key={p.label}
              className="btn small ghost"
              title={p.title}
              onClick={() => {
                setMulti(true);
                onChange(p.refs.map((r) => ({ ...r })));
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {!!value?.length && mode === 'custom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 8, borderLeft: '2px solid rgba(148,163,184,.4)' }} data-testid={testId ? `${testId}-layers` : undefined}>
          <span className="hint">De haut en bas (la première couche est directement sous le pied).</span>
          {value.map((l, i) => {
            const j = parseJoistKey(l.plate);
            return (
              <div className="row" key={i} style={{ gap: 4, flexWrap: 'wrap' }}>
                <span className="hint" style={{ minWidth: 78 }}>{i === 0 ? firstLabel : `couche ${i + 1}`}</span>
                <select
                  value={j ? 'joists' : 'plate'}
                  style={{ width: 150 }}
                  onChange={(e) => set(i, e.target.value === 'joists' ? { plate: joistKey(75, 225), n: 3, along: undefined } : { plate: lastPlate ?? keys[0], n: 1, along: undefined })}
                >
                  <option value="plate">plaques empilées</option>
                  <option value="joists">madriers sur chant</option>
                </select>
                <select value={l.n} style={{ width: 56 }} onChange={(e) => set(i, { n: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6].map((k) => (
                    <option key={k} value={k}>
                      {k} ×
                    </option>
                  ))}
                </select>
                {j ? (
                  <>
                    <select value={l.plate} style={{ width: 180 }} onChange={(e) => set(i, { plate: e.target.value })} title="section des madriers : largeur posée × hauteur (sur chant)">
                      {[...new Set([...JOIST_SECTIONS.map((x) => joistKey(x.b, x.h)), l.plate])].map((k) => {
                        const x = parseJoistKey(k)!;
                        return (
                          <option key={k} value={k}>
                            madriers {x.b} × {x.h} mm
                          </option>
                        );
                      })}
                    </select>
                    <select value={l.along ?? ''} style={{ width: 200 }} onChange={(e) => set(i, { along: (e.target.value || undefined) as 'u' | 'v' | undefined })} title="sens des madriers ; un à chaque bord, les autres à intervalles égaux">
                      <option value="">sens : le plus favorable</option>
                      <option value="u">parallèles au grand côté</option>
                      <option value="v">parallèles au petit côté</option>
                    </select>
                  </>
                ) : (
                  <select value={l.plate} style={{ maxWidth: 300 }} onChange={(e) => set(i, { plate: e.target.value })}>
                    {[...new Set([...keys, l.plate])].map((k) => (
                      <option key={k} value={k}>
                        {labelOf(k)}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn small ghost" title="Monter cette couche" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button className="btn small ghost" title="Descendre cette couche" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button className="btn small ghost" title="Retirer cette couche" onClick={() => onChange(value.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </div>
            );
          })}
          {value.length < 8 && (
            <div className="row" style={{ gap: 4 }}>
              {keys.length > 0 && (
                <button className="btn small ghost" onClick={() => onChange([...value, { plate: lastPlate ?? keys[keys.length - 1], n: 1 }])}>
                  + plaques en dessous
                </button>
              )}
              <button className="btn small ghost" onClick={() => onChange([...value, { plate: joistKey(75, 225), n: 3 }])}>
                + madriers sur chant en dessous
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Étapes de la répartition d'un appui : pression au sol si le calage s'arrêtait à chaque étape. */
export function ChainTable({ c }: { c: SupportCheck }) {
  return (
    <table className="list" style={{ fontSize: 12 }}>
      <thead>
        <tr>
          <th>Étape (du pied vers le sol)</th>
          <th>Emprise au sol</th>
          <th className="num">Surface</th>
          <th className="num">Pression au sol</th>
          <th className="num">η sol</th>
        </tr>
      </thead>
      <tbody>
        {c.steps.map((s, k) => {
          const last = k === c.steps.length - 1;
          return (
            <tr key={k} style={{ fontWeight: last ? 700 : undefined }}>
              <td>
                {s.label}
                {s.note && (
                  <div className="hint" style={{ fontWeight: 400 }}>
                    ⚠ {s.note}
                  </div>
                )}
              </td>
              <td>{s.dims ? dimsCm(s.dims) : 'toute la surface'}</td>
              <td className="num">{m2(s.area)}</td>
              <td className="num">{pressureText(s.pressure)}</td>
              <td className="num">
                <span className={`badge ${badgeOf(s.eta)}`}>{n(s.eta, 2)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export interface ChoiceSetters {
  choices: CalageChoices;
  setType: (key: string, v: LayerRef[] | undefined) => void;
  setSupport: (id: string, v: LayerRef[] | undefined) => void;
  /** pose des plaques d'un appui (à fleur / centrées), undefined = réglage général */
  setPlace: (id: string, v: 'flush' | 'centered' | undefined) => void;
  setRoadway: (on: boolean) => void;
  /** débord des plaques de roulage tout autour (mm) */
  setRoadwayOverhang: (mm: number) => void;
  reset: () => void;
}

/** Libellé « automatique » d'un type : la solution retenue sans choix de l'utilisateur. */
function autoLabel(t: CalageType | undefined, roadwayOn: boolean): string {
  if (roadwayOn && !t?.block) return 'Automatique : pied posé sur les plaques de roulage';
  if (!t?.chosen) return 'Automatique : aucune solution standard';
  return `Automatique : ${t.chosen.summary}`;
}

/** Appui sélectionné sur le plan : réaction, étapes de la répartition, calage de cet appui, conseil. */
export function SupportPanel({ c, result, stock, set, onClose }: { c: SupportCheck; result: CalageResult; stock: StockPlate[]; set: ChoiceSetters; onClose: () => void }) {
  const typeRefs = set.choices.byType?.[c.typeKey];
  const own = set.choices.bySupport?.[c.id];
  const autoType = result.types.find((t) => t.typeKey === c.typeKey && !t.custom);
  const r = c.reaction;
  const label = result.types.find((t) => t.checks.includes(c))?.label ?? supportType(r);
  const over = c.plan && c.plan.placement === 'centered' ? Math.round(c.plan.overhang / 10) : 0;
  return (
    <div className="card support-panel" style={{ marginTop: 8, borderColor: checkColor(c.eta) }}>
      <div className="card-head">
        <h2>
          {c.id} — {label}
        </h2>
        <span className="hint">
          {r.group.moduleIds.join(', ')} · Rz,k = {kN(c.Rzk)} (mini {kN(r.RkMin)}) · Rz,Ed = {kN(c.REd)} · dont G = {kN(r.G)}, Q = {kN(r.Q)}
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        <span className={`badge ${badgeOf(c.eta)}`}>η = {n(c.eta, 2)}</span>
        <button className="btn small ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>{c.advice}</div>
        <div className="hint">
          {c.members.length > 1 || c.members[0] !== c.id ? `Une plaque sous ${c.members.length > 1 ? `les appuis ${c.members.join(', ')}` : `l’appui ${c.members[0]}`}. ` : ''}
          {c.block
            ? c.block.composition
              ? `Posé sur la cale composée ${c.block.id} (de haut en bas : ${c.block.composition.layers.map((l) => (l.joist ? `${l.n} madriers ${l.joist.b} × ${l.joist.h} sur chant` : `${l.n} × ${l.t} mm`)).join(', ')} ; ${n(c.block.composition.height / 10, 1)} cm, ${n(c.block.massKg, 0)} kg)${c.layerList.length ? ', plaques centrées sous la cale' : ''}.`
              : `Posé sur le bloc bois dessiné ${c.block.id} (${c.block.dims}, ${n(c.block.massKg, 0)} kg${c.block.massSource === 'computed' ? ' = volume × masse volumique' : ''})${c.layerList.length ? ', plaques centrées sous le bloc' : ''}.`
            : c.plan ? (c.plan.placement === 'flush' ? 'Plaque à fleur de la Viewbox (ne dépasse pas).' : `Plaque centrée sous l’appui : elle dépasse de ${over} cm.`) : ''}
          {c.tuv ? ` Prüfbuch TÜV : ${c.tuv.text}.` : ''}
        </div>
        <ChainTable c={c} />
        {c.zone && (
          <div className="hint">
            Dalle en charge répartie : ce qui compte, c’est le poids de toute la Viewbox {c.zone.id} sur la dalle qu’elle charge ({n(c.zone.load / 1e3, 1)} kN sur {n(c.zone.area / 1e6, 2)} m²). Des plaques posées
            <b>à l’intérieur</b> de l’installation n’y changent rien (elles ajoutent seulement leur poids) ; la surface augmente avec des plaques qui <b>dépassent de l’installation</b> ou des plaques de roulage
            qui débordent tout autour. Il faudrait {n(c.zone.load / (result.slab?.bearing ?? 1) / 1e6, 2)} m² pour passer. Sous ce seul appui : {n(c.Rzk / 1e3, 1)} kN (charge ponctuelle).
          </div>
        )}
        {c.chainBase.timber ? (
          <div className="hint">
            Appui posé sur les madriers de la solution retenue (« {result.remedy?.remedy.title} ») : pas de plaque ici. Pour revenir aux plaques, « Retirer » la solution dans « 🛠 Solutions pour que le sol passe ».
          </div>
        ) : (
        <>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="hint" style={{ minWidth: 140 }}>Pose des plaques de {c.id}</span>
          <select
            value={set.choices.placeBySupport?.[c.id] ?? ''}
            style={{ maxWidth: 360 }}
            onChange={(e) => set.setPlace(c.id, (e.target.value || undefined) as 'flush' | 'centered' | undefined)}
            title="À fleur : la plaque part du bord de la Viewbox et ne dépasse pas (seule la zone centrée sous la charge compte). Centrée : la plaque dépasse mais répartit mieux. Pour empiler des plaques ici, choisir 2 ou 3 plaques dans « Calage de … » ci-dessous."
          >
            <option value="">comme le réglage général ({c.placement === 'flush' ? 'ici : à fleur' : 'ici : centrée'})</option>
            <option value="flush">à fleur de la Viewbox (ne dépasse pas)</option>
            <option value="centered">centrée sous l’appui (peut dépasser)</option>
          </select>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <span className="hint" style={{ minWidth: 140, paddingTop: 4 }}>
            Calage de {c.id}
          </span>
          <LayerPicker
            value={own}
            onChange={(v) => set.setSupport(c.id, v)}
            stock={stock}
            inheritLabel={typeRefs !== undefined ? `Comme les autres « ${label} » : ${refsText(typeRefs, stock)}` : autoLabel(autoType, result.roadwayOn)}
            presets={stackPresets(presetPlate(stock))}
            {...(c.block ? { firstLabel: c.block.composition ? 'sous la cale' : 'sous le bloc' } : {})}
          />
        </div>
        </>
        )}
        <div className="hint">Pression au sol si le calage s’arrêtait à chaque étape ; la dernière ligne est celle vérifiée. Choix enregistré avec l’étude.</div>
      </div>
    </div>
  );
}

/** Diagnostic : chaque groupe d'appuis (par type et par calage) avec son état et la plaque à prendre, plaques de roulage. */
export function CalageDiagnostic({
  result,
  set,
  onSelect,
  publicLine,
  roadwayFields,
}: {
  result: CalageResult;
  set: ChoiceSetters;
  onSelect: (id: string) => void;
  /** public prévu / public maximal avec ce calage */
  publicLine?: { ok: boolean; text: string } | null;
  /** type de plaques de roulage (affiché sous la case quand elles sont retenues) */
  roadwayFields?: RoadwayFieldsProps;
}) {
  const failing = result.checks.filter((c) => verdictOf(c.eta) === 'fail');
  const anyChoice = result.roadwayOn || !!Object.keys(set.choices.byType ?? {}).length || !!Object.keys(set.choices.bySupport ?? {}).length;
  const rw = result.roadway;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Diagnostic du calage</h2>
        <span className="hint">
          {failing.length ? `${failing.length} appui(s) sur ${result.checks.length} dépassent — ${failing.map((c) => c.id).join(', ')}` : `les ${result.checks.length} appuis passent`}
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        {anyChoice && (
          <button className="btn small ghost" onClick={set.reset}>
            Tout remettre en automatique
          </button>
        )}
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {publicLine && (
          <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
            <span className={`badge ${publicLine.ok ? 'ok' : 'ko'}`} style={{ minWidth: 62, textAlign: 'center' }}>
              public
            </span>
            <div style={{ fontSize: 13, lineHeight: 1.45 }}>{publicLine.text}</div>
          </div>
        )}
        {result.types.map((t) => {
          const worst = t.checks.reduce((a, c) => (c.eta > a.eta ? c : a), t.checks[0]);
          if (!worst) return null;
          return (
            <div key={t.key} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
              <span className={`badge ${badgeOf(worst.eta)}`} style={{ minWidth: 62, textAlign: 'center' }}>
                η {n(worst.eta, 2)}
              </span>
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                <b>{t.label}</b> ({t.checks.length} : {t.checks.map((c) => c.id).join(', ')}) — {t.chosen ? t.chosen.summary : 'aucune solution'}
                {t.custom ? ' (choisi)' : ''}
                <div>
                  {worst.advice}{' '}
                  <button className="btn small ghost" onClick={() => onSelect(worst.id)}>
                    Voir {worst.id}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <label className="row" style={{ gap: 6, marginTop: 4 }}>
          <input type="checkbox" checked={result.roadwayOn} onChange={(e) => set.setRoadway(e.target.checked)} />
          <span>
            <b>Plaques de roulage jointives sur toute la surface</b> : charge totale {kN(rw.load)} / {m2(rw.area)} = {pressureText(rw.mean)}{' '}
            <span className={`badge ${badgeOf(rw.etaMean)}`}>η {n(rw.etaMean, 2)}</span>
          </span>
        </label>
        {result.roadwayOn && roadwayFields && (
          <div style={{ marginLeft: 22 }}>
            <RoadwayTypeFields {...roadwayFields} />
          </div>
        )}
        {result.roadwayOn && (
          <label className="row" style={{ gap: 6, marginLeft: 22 }}>
            <span>Les plaques de roulage dépassent de l’installation de</span>
            <input
              type="number"
              min={0}
              step={5}
              style={{ width: 70 }}
              value={Math.round((set.choices.roadwayOverhang ?? 0) / 10)}
              onChange={(e) => set.setRoadwayOverhang(Math.max(0, (parseFloat(e.target.value) || 0) * 10))}
              data-testid="roadway-overhang"
            />
            <span>cm tout autour</span>
            <span className="hint">
              {result.slab ? '— agrandit la surface de dalle chargée par les pieds du bord (zones des angles et des côtés).' : '— agrandit la surface couverte de la répartition uniforme.'}
            </span>
          </label>
        )}
        <div className="hint">
          Choisir le calage d’un type dans sa carte ci-dessous, ou d’un seul appui en cliquant sur le plan. Une plaque trop mince ne compte que pour la partie qu’elle peut porter en flexion
          (emprise efficace).
        </div>
      </div>
    </div>
  );
}

/** Calage d'un type d'appui (carte du type) et liste de ses appuis. */
export function TypeChoice({ t, result, stock, set, onSelect, selected }: { t: CalageType; result: CalageResult; stock: StockPlate[]; set: ChoiceSetters; onSelect: (id: string) => void; selected: string | null }) {
  const own = t.checks.some((c) => c.source === 'support' && JSON.stringify(set.choices.bySupport?.[c.id]) !== JSON.stringify(set.choices.byType?.[t.typeKey]));
  const autoType = result.types.find((x) => x.typeKey === t.typeKey && !x.custom);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {own ? (
        <div className="hint">
          Calage propre à {t.checks.map((c) => c.id).join(', ')} : {refsText(t.refs, stock)} — le modifier depuis le plan (clic sur l’appui).
        </div>
      ) : (
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <span className="hint" style={{ minWidth: 140, paddingTop: 4 }}>
            Calage de ce type
          </span>
          <LayerPicker
            value={set.choices.byType?.[t.typeKey]}
            onChange={(v) => set.setType(t.typeKey, v)}
            stock={stock}
            inheritLabel={autoLabel(autoType ?? t, result.roadwayOn)}
            presets={stackPresets(presetPlate(stock))}
            testId={`type-layers-${t.typeKey}`}
            {...(t.block ? { firstLabel: t.checks.some((c) => c.block?.composition) ? 'sous la cale' : 'sous le bloc' } : {})}
          />
        </div>
      )}
      <div style={{ fontSize: 13, lineHeight: 1.45 }}>{t.advice}</div>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {[...t.checks]
          .sort((a, b) => b.eta - a.eta)
          .map((c) => (
            <button
              key={c.id}
              className="btn small ghost"
              onClick={() => onSelect(c.id)}
              style={{ borderColor: checkColor(c.eta), outline: selected === c.id ? `2px solid ${checkColor(c.eta)}` : undefined }}
              title={c.advice}
            >
              {c.id} · {kN(c.Rzk)} · {n(c.pressure * 1e3, c.pressure * 1e3 < 10 ? 1 : 0)} kN/m² · η {n(c.eta, 2)}
            </button>
          ))}
      </div>
    </div>
  );
}
