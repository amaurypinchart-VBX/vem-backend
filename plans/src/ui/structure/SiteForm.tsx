// Onglet « 2. Site & hypothèses » (et calage rapide) : les hypothèses du calcul expliquées pour quelqu'un qui n'est pas
// ingénieur — poids en kg, vent en km/h, neige, public, sol — avec la conversion dans les unités du calcul (kN/m²) en
// petit à côté. Les valeurs restent enregistrées comme avant (kN/m², kN) : les études existantes ne changent pas.
import { useEffect, useState } from 'react';
import type { BearingUnit } from '../../structure/core/ground';
import { BEARING_PRESETS, SUBGRADE_PRESETS, bearingFrom } from '../../structure/core/ground';
import { DEFAULT_SITE, TERRAIN_LABEL, peakPressure } from '../../structure/core/wind';
import type { WindZone } from '../../structure/core/wind';
import { fmtNumber } from '../../structure/core/units';
import type { Hypotheses } from './GroundPanel';
import { DEFAULT_HYP, bearingModeOf } from './GroundPanel';
import { PROJECT_ID, vem } from '../../api/vem';
import type { FrDuration, FrSnowRegion, FrTerrain, FrWindRegion, FrWindSite } from '../../structure/core/codeFR';
import { DEFAULT_FR_WIND, FR_DURATIONS, FR_DURATION_KEYS, FR_SNOW_KEYS, FR_SNOW_SK200, FR_TERRAINS, FR_TERRAIN_KEYS, FR_WIND_REGIONS, RHO_AIR, SPD, frPeak, frSnowGround, serviceWindPressure } from '../../structure/core/codeFR';

const G = 9.81;
const n = (v: number, d = 0) => fmtNumber(v, d);
/** kN/m² ↔ kg/m² */
const kgOf = (kNm2: number) => (kNm2 * 1000) / G;
const kNOf = (kgm2: number) => (kgm2 * G) / 1000;
/** pression du vent (kN/m²) ↔ vitesse (km/h) : q = ½ ρ v², ρ = 1,25 kg/m³ */
const kmhOf = (q: number) => Math.sqrt((2 * q * 1000) / 1.25) * 3.6;
const qOf = (kmh: number) => (0.5 * 1.25 * (kmh / 3.6) ** 2) / 1000;
const PERSON_KG = 80;

/** Cartes des régions de vent et de neige (France) : la région se choisit d'après la commune du site. */
const FR_WIND_MAP = 'https://eurocodes-tools.com/en/wind-zones-map-france/';
const FR_SNOW_MAP = 'https://eurocodes-tools.com/en/snow-zones-map-france/';

/**
 * Lieu du projet pour choisir les régions : adresse / ville et département (2 premiers chiffres du code postal, Corse
 * 2A / 2B). Les départements partagés entre plusieurs régions sont découpés par commune dans les annexes nationales.
 */
export function projectPlace(p: { address?: string | null; city?: string | null } | null): { text: string; department: string | null } | null {
  if (!p) return null;
  const text = [p.address, p.city].filter((x) => x && x.trim()).join(', ');
  if (!text) return null;
  const cp = /\b(\d{5})\b/.exec(text)?.[1];
  const department = !cp ? null : cp.startsWith('20') ? (Number(cp) < 20200 ? '2A' : '2B') : cp.startsWith('97') ? cp.slice(0, 3) : cp.slice(0, 2);
  return { text, department };
}

/** Valeurs propres au référentiel France (arrêté du 25 juillet 2022 : 5 kN/m² partout où le public accède). */
const FR_DEFAULTS: Partial<Hypotheses> = { code: 'FR', frWind: DEFAULT_FR_WIND, live: 5, liveGround: 5, staticoConversion: false };
/**
 * Retour au référentiel Allemagne : charges du public du calcul de type statico 18-0573. Fonction (pas une constante) :
 * GroundPanel importe ce fichier, DEFAULT_HYP n'existe pas encore quand ce module est évalué.
 */
const deDefaults = (): Partial<Hypotheses> => ({ code: 'DE', live: DEFAULT_HYP.live, liveGround: DEFAULT_HYP.liveGround });
/** km/h de la vitesse v (m/s) */
const kmh = (v: number) => v * 3.6;

/** Neige au sol (kg/m²) des cas courants, en plaine (à vérifier selon l'altitude du site). */
const SNOW_PRESETS: Array<{ label: string; kg: number }> = [
  { label: 'Pas de neige (été, ou neige empêchée / déblayée)', kg: 0 },
  { label: 'Belgique, plaine (0,50 kN/m²)', kg: 51 },
  { label: 'Allemagne zone 1, plaine (0,65 kN/m²)', kg: 66 },
  { label: 'Allemagne zone 2, plaine (0,85 kN/m²)', kg: 87 },
  { label: 'Allemagne zone 3, plaine (1,10 kN/m²)', kg: 112 },
];

/** Champ numérique tolérant la virgule. */
function Num({ value, onChange, width = 80, decimals = 0 }: { value: number; onChange: (v: number) => void; width?: number; decimals?: number }) {
  const show = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10 ** decimals) / 10 ** decimals).replace('.', ',') : '');
  const [text, setText] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focus]);
  return (
    <input
      type="text"
      inputMode="decimal"
      style={{ width, textAlign: 'right' }}
      value={text}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value.replace(/\s/g, '').replace(',', '.'));
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

/** Une question : intitulé, explication en clair, saisie et conversion. */
function Q({ label, help, children, conv }: { label: string; help: React.ReactNode; children: React.ReactNode; conv?: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '2px 16px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div className="hint" style={{ marginTop: 2, lineHeight: 1.45 }}>
          {help}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <div className="row" style={{ gap: 4 }}>
          {children}
        </div>
        {conv && (
          <div className="hint" style={{ fontSize: 11, textAlign: 'right' }}>
            {conv}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, intro, children }: { icon: string; title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>
          {icon} {title}
        </h2>
      </div>
      <div className="card-body">
        <div style={{ marginBottom: 4, lineHeight: 1.5 }}>{intro}</div>
        {children}
      </div>
    </div>
  );
}

function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label className="row" style={{ gap: 6, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span>{children}</span>
    </label>
  );
}

export interface HypothesesFormProps {
  hyp: Hypotheses;
  setHyp: (update: (h: Hypotheses) => Hypotheses) => void;
  jacks?: boolean;
  /** nombre de niveaux de Viewbox du modèle */
  levels?: number;
  /** calage rapide sans modèle : murs, vitrages… en forfait par Viewbox */
  withoutModel?: boolean;
  /** objets portés par les Viewbox d'après le modèle (murs, vitrages, garde-corps, logos, lest) */
  carried?: { count: number; kg: number };
  /** types de structure personnalisés de l'étude (S12) : poids calculé (kg) affiché, pesée facultative */
  customTypes?: Array<{ key: string; name: string; computedKg: number; count: number }>;
  /** l'étude contient des Viewbox (sinon la pesée Viewbox ne sert pas) */
  hasViewbox?: boolean;
}

export function HypothesesForm({ hyp, setHyp, jacks = false, levels = 1, withoutModel = false, carried, customTypes = [], hasViewbox = true }: HypothesesFormProps) {
  const set = <K extends keyof Hypotheses>(k: K, v: Hypotheses[K]) => setHyp((h) => ({ ...h, [k]: v }));
  const preset = BEARING_PRESETS.find((p) => p.key === hyp.bearingPreset);
  const q = bearingFrom(hyp.bearingValue, hyp.bearingUnit);
  const bearingKg = (q * 1e6) / G;
  const persons = (kNm2: number) => kgOf(kNm2) / PERSON_KG;
  const snow = hyp.snowKgm2 ?? 0;
  const [advanced, setAdvanced] = useState(false);
  const zones: WindZone[] = [1, 2, 3, 4];
  const fr = hyp.code === 'FR';
  // lieu du projet (adresse VEM) pour choisir les régions de vent et de neige
  const [place, setPlace] = useState<ReturnType<typeof projectPlace>>(null);
  useEffect(() => {
    if (!fr || !PROJECT_ID) return;
    let alive = true;
    vem
      .project(PROJECT_ID)
      .then((p) => alive && setPlace(projectPlace(p)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fr]);
  const placeHint = (map: string, what: string) => (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }} data-testid={`fr-place-${what}`}>
      {place ? (
        <span>
          Lieu du projet : <b>{place.text}</b>
          {place.department ? ` (département ${place.department})` : ''}.
        </span>
      ) : (
        <span>Adresse du projet non renseignée dans VEM.</span>
      )}
      <a href={map} target="_blank" rel="noreferrer">
        🗺 Carte des régions de {what}
      </a>
      <span>— un département partagé entre plusieurs régions se lit commune par commune.</span>
    </div>
  );
  const frw: FrWindSite = hyp.frWind ?? DEFAULT_FR_WIND;
  const setFrw = (patch: Partial<FrWindSite>) => setHyp((h) => ({ ...h, frWind: { ...(h.frWind ?? DEFAULT_FR_WIND), ...patch } }));
  // hauteur pour le vent hors service (l'étude reprend la hauteur exacte du modèle)
  const heightMm = Math.max(1, levels) * 3080;
  const frPk = fr ? frPeak(frw, heightMm) : null;
  const frOut = fr ? (frw.manualQp && frw.manualQp > 0 ? frw.manualQp : frPk!.qp) * 1e3 : 0;
  const setSnowFR = (region: FrSnowRegion, altitude: number) =>
    setHyp((h) => ({ ...h, frSnow: { region, altitude }, snowKgm2: Math.round((frSnowGround(region, Math.min(2000, altitude)) * 1000) / G) }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-body row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 300, lineHeight: 1.5 }}>
            Ces hypothèses décrivent <b>le site et l’usage</b> de l’installation : ce que le sol supporte, combien de personnes montent, le vent, la neige. Le calcul (étape 3) et le calage (étape 5) s’en
            servent. {fr ? 'Les valeurs proposées sont celles des Eurocodes (annexes nationales françaises) et de l’arrêté du 25 juillet 2022' : 'Les valeurs proposées sont celles des notes de calcul statico'} ; changez-les seulement si le site ou l’usage est différent. Chaque valeur est expliquée et convertie dans les unités du
            calcul (en gris).
          </span>
          <button className="btn small ghost" onClick={() => setHyp((h) => ({ ...DEFAULT_HYP, ...(h.code === 'FR' ? FR_DEFAULTS : {}) }))}>
            Revenir aux valeurs par défaut
          </button>
        </div>
      </div>

      <Section
        icon="📐"
        title="Référentiel de calcul (pays)"
        intro="Les règles de calcul dépendent du pays où l’installation est montée : charges, vent, neige, coefficients de sécurité, contrôles."
      >
        <Q
          label="Pays / règles de calcul"
          help={
            fr ? (
              <>
                <b>France</b> : Eurocodes avec les annexes nationales françaises (NF EN 1990, 1991-1-1, 1991-1-3, 1991-1-4, 1993-1-1, 1995-1-1) et l’<b>arrêté du 25 juillet 2022</b> sur les structures
                provisoires et démontables. Vent de service au moins 72 km/h (évacuation au-delà), tempête hors exploitation selon la région de vent, 5 kN/m² de public, coefficients 1,35 / 1,5,
                acier γM0 = 1,00. Pas de Prüfbuch TÜV (livre d’examen allemand). Valeurs des annexes à confirmer sur les textes AFNOR.
              </>
            ) : (
              <>
                <b>Allemagne</b> : constructions temporaires (DIN EN 13814, DIN EN 1991-1-4/NA), calcul de type statico 18-0573 et Prüfbuch TÜV 190060 B. Valable aussi par défaut hors d’Allemagne quand
                aucun autre référentiel n’est demandé.
              </>
            )
          }
        >
          <select
            value={fr ? 'FR' : 'DE'}
            data-testid="design-code"
            onChange={(e) => setHyp((h) => ({ ...h, ...(e.target.value === 'FR' ? { ...FR_DEFAULTS, frWind: h.frWind ?? DEFAULT_FR_WIND } : deDefaults()) }))}
          >
            <option value="DE">Allemagne — DIN EN 13814, statico, Prüfbuch TÜV</option>
            <option value="FR">France — Eurocodes + arrêté du 25 juillet 2022</option>
          </select>
        </Q>
      </Section>

      <Section icon="🌱" title="Le sol" intro="Les Viewbox reposent sur le sol par leurs pieds (et des plaques de calage). Il faut savoir quel poids le sol accepte sans s’enfoncer.">
        <Q label="Sur quoi pose-t-on les Viewbox ?" help={preset?.value ? `Valeur courante pour ce sol : ${n(kgOf(preset.value * 1e3), 0)} kg par m² (${preset.source}).` : 'Pour ce support, la valeur doit être donnée par l’exploitant du site ou du bâtiment.'}>
          <select
            value={hyp.bearingPreset}
            onChange={(e) => {
              const p = BEARING_PRESETS.find((x) => x.key === e.target.value);
              setHyp((h) => ({ ...h, bearingPreset: e.target.value, ...(p?.value ? { bearingValue: Math.round(kgOf(p.value * 1e3) / 10) * 10, bearingUnit: 'kg/m²' as const } : {}) }));
            }}
          >
            {BEARING_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Q>
        <Q
          label="Poids que le sol supporte (portance)"
          help={
            <>
              Le poids qu’un mètre carré de sol accepte sans s’enfoncer. Si l’organisateur ou le bureau de contrôle donne « 400 kg/m² », tapez 400 en kg/m². Attention : <b>400 kg/m² est un sol très faible</b>{' '}
              (moins de 4 kN/m²) ; une prairie carrossable fait environ 20 000 kg/m² (200 kN/m²).
            </>
          }
          conv={`= ${n(q * 1e3, q * 1e3 < 10 ? 2 : 0)} kN/m² = ${n(bearingKg / 1000, 1)} tonnes par m²`}
        >
          <Num value={hyp.bearingValue} onChange={(v) => set('bearingValue', v)} width={90} decimals={2} />
          <select value={hyp.bearingUnit} style={{ width: 90 }} onChange={(e) => set('bearingUnit', e.target.value as BearingUnit)}>
            <option>kg/m²</option>
            <option>t/m²</option>
            <option>kN/m²</option>
            <option>kg/cm²</option>
          </select>
        </Q>
        <Q
          label="Que veut dire cette valeur ?"
          help={
            <>
              <b>Sol</b> (prairie, terre, enrobé) : c’est la pression maximale sous chaque plaque. <b>Dalle, plancher, toiture, bouche de métro…</b> : c’est le <b>poids admis par m²</b> de dalle (charge
              répartie) — l’outil vérifie le poids au m² sous chaque Viewbox (tous ses pieds ensemble + le calage, sur la surface de dalle qu’elle charge) et l’ensemble de l’installation, pas la pression juste sous la plaque ; la charge sous chaque pied reste affichée (charge ponctuelle à confirmer avec l’exploitant).
            </>
          }
        >
          <select value={bearingModeOf(hyp)} onChange={(e) => set('bearingMode', e.target.value as 'pressure' | 'distributed')} data-testid="bearing-mode">
            <option value="pressure">Pression maximale sous chaque plaque (sol)</option>
            <option value="distributed">Poids admis par m² de dalle (charge répartie : dalle, plancher, toiture)</option>
          </select>
        </Q>
        {(preset?.pointLoad || bearingModeOf(hyp) === 'distributed') && (
          <Q label="Charge maximale sous un seul pied" help="Une dalle ou une toiture a aussi une limite par point (sous un pied, poinçonnement). Valeur de la fiche du bâtiment ; 0 = inconnue (à faire confirmer par l’exploitant)." conv={`= ${n(hyp.pointLoadKN, 1)} kN`}>
            <Num value={(hyp.pointLoadKN * 1000) / G} onChange={(v) => set('pointLoadKN', (v * G) / 1000)} /> kg
          </Q>
        )}
      </Section>

      <Section
        icon="📦"
        title="Les Viewbox et ce qu’elles portent"
        intro="Le poids pesé d’une Viewbox comprend tout : structure acier, plancher, sol, plafond et isolants. Ce qui est fixé dessus (murs, vitrages, portes, garde-corps, logos) est compté en plus, objet par objet."
      >
        {hasViewbox && (
          <Q
            label="Poids d’une Viewbox (pesée)"
            help="Pesée Viewbox : 2 564 kg, structure, plancher, sol, plafond et isolants compris. Le calcul retient exactement ce poids. À changer seulement pour une Viewbox différente."
            conv={`= ${n((hyp.moduleWeightKg * G) / 1000, 1)} kN`}
          >
            <Num value={hyp.moduleWeightKg} onChange={(v) => set('moduleWeightKg', v)} /> kg
          </Q>
        )}
        {customTypes.map((t) => {
          const w = hyp.moduleWeights?.[t.key];
          return (
            <Q
              key={t.key}
              label={`Poids d’un module « ${t.name} » (${t.count})`}
              help="Type de structure personnalisé. Sans pesée, l’outil calcule le poids : barres du type + plafond + sol (le plancher du type compté une seule fois). Une pesée saisie le remplace (structure, plancher, sol, plafond et isolants compris)."
              conv={w ? `= ${n((w * G) / 1000, 1)} kN pesés` : `calculé ≈ ${n(t.computedKg)} kg (sans pesée)`}
            >
              <input
                type="text"
                inputMode="decimal"
                placeholder="pesée (kg)"
                aria-label={`Pesée ${t.name}`}
                value={w ?? ''}
                style={{ width: 90 }}
                onChange={(e) => {
                  const v = parseFloat(e.target.value.replace(',', '.'));
                  setHyp((h) => {
                    const ws = { ...(h.moduleWeights ?? {}) };
                    if (Number.isFinite(v) && v > 0) ws[t.key] = v;
                    else delete ws[t.key];
                    return { ...h, moduleWeights: ws };
                  });
                }}
              />{' '}
              kg
            </Q>
          );
        })}
        {withoutModel ? (
          <Q
            label="Murs, vitrages, garde-corps par Viewbox"
            help="Calage rapide sans modèle : poids moyen de ce qui est fixé sur chaque Viewbox (murs, vitrages, portes, garde-corps, logos). Dans une étude, ils sont pris dans le modèle SketchUp."
            conv={`= ${n(hyp.extraKN, 1)} kN par Viewbox`}
          >
            <Num value={(hyp.extraKN * 1000) / G} onChange={(v) => set('extraKN', (v * G) / 1000)} /> kg
          </Q>
        ) : (
          <Q
            label="Murs, vitrages, portes, garde-corps, logos"
            help={
              <>
                Comptés d’après le modèle SketchUp, objet par objet (une Viewbox sans mur ne porte rien, une autre peut porter 10 murs et 5 vitrages) : poids de chaque type à l’étape 1
                « Reconnaissance ».
                {carried && carried.count > 0 && (
                  <>
                    {' '}
                    Dans ce modèle : <b>{carried.count}</b> objet{carried.count > 1 ? 's' : ''}, <b>{n(carried.kg)} kg</b> au total.
                  </>
                )}
              </>
            }
          >
            <span className="hint">d’après le modèle</span>
          </Q>
        )}
        <div style={{ fontWeight: 600, marginTop: 10 }}>En option : poids ajouté à une Viewbox standard</div>
        <div className="hint" style={{ lineHeight: 1.45 }}>
          À remplir seulement si on ajoute quelque chose qui n’est pas dans la pesée (deuxième isolation, faux plafond lourd, plancher surélevé, parquet, moquette épaisse…). 0 = Viewbox standard.
        </div>
        <Q label="Plafond ou isolation en plus (par m²)" help="Ajouté sous la toiture de chaque Viewbox, en plus du poids pesé." conv={`= ${n(hyp.ceilingExtra ?? 0, 2)} kN/m² ≈ ${n(kgOf(hyp.ceilingExtra ?? 0) * 14.75)} kg par Viewbox`}>
          <Num value={kgOf(hyp.ceilingExtra ?? 0)} onChange={(v) => set('ceilingExtra', kNOf(Math.max(0, v)))} /> kg/m²
        </Q>
        <Q label="Revêtement de sol en plus (par m²)" help="Ajouté sur le plancher de chaque Viewbox, en plus du poids pesé." conv={`= ${n(hyp.floorExtra ?? 0, 2)} kN/m² ≈ ${n(kgOf(hyp.floorExtra ?? 0) * 14.75)} kg par Viewbox`}>
          <Num value={kgOf(hyp.floorExtra ?? 0)} onChange={(v) => set('floorExtra', kNOf(Math.max(0, v)))} /> kg/m²
        </Q>
      </Section>

      <Section icon="👥" title="Le public" intro="Les personnes sur les planchers (et les terrasses) pèsent sur la structure et poussent aussi un peu de côté quand elles bougent.">
        <Q
          label="Charge du public au rez-de-chaussée"
          help={
            fr
              ? `Arrêté du 25 juillet 2022 (ensembles accessibles au public) : 5 kN/m², soit environ ${n(persons(5), 1)} personnes de ${PERSON_KG} kg par m², avec une poussée horizontale de 6 % (10 % au-delà de 500 m² de planchers). Ne la baisser que si l’accès est vraiment limité.`
              : `Calcul de type statico 18-0573 (Prüfbuch TÜV) : 5,0 kN/m² au rez-de-chaussée (« 500 kg/m² » dans la note), public sans foule dense, soit environ ${n(persons(5), 1)} personnes de ${PERSON_KG} kg par m². Ne la baisser que si l’accès est vraiment limité.`
          }
          conv={`= ${n(hyp.liveGround ?? 5, 2)} kN/m² ≈ ${n(persons(hyp.liveGround ?? 5), 1)} personnes par m²`}
        >
          <Num value={kgOf(hyp.liveGround ?? 5)} onChange={(v) => set('liveGround', kNOf(v))} /> kg/m²
        </Q>
        <Q
          label="Charge du public aux étages"
          help={
            fr
              ? `Arrêté du 25 juillet 2022 : 5 kN/m² aussi aux étages accessibles au public (environ ${n(persons(5), 1)} personnes par m²).`
              : `Valeur réglementaire pour un étage ouvert au public sans foule dense (DIN EN 13814, statico 18-0573) : 357 kg par m², soit environ ${n(persons(3.5), 1)} personnes de ${PERSON_KG} kg par m². L’organisateur empêche une foule dense (personnel formé).`
          }
          conv={`= ${n(hyp.live, 2)} kN/m² ≈ ${n(persons(hyp.live), 1)} personnes par m²`}
        >
          <Num value={kgOf(hyp.live)} onChange={(v) => set('live', kNOf(v))} /> kg/m²
        </Q>
        {Array.from({ length: Math.max(0, levels - 1) }, (_, k) => k + 1).map((lv) => (
          <Check key={lv} checked={(hyp.closedLevels ?? []).includes(lv)} onChange={(v) => set('closedLevels', v ? [...new Set([...(hyp.closedLevels ?? []), lv])].sort() : (hyp.closedLevels ?? []).filter((x) => x !== lv))}>
            <b>Niveau {lv} fermé au public</b>
            <div className="hint">Étage non accessible (stockage, décor, comme le 3ᵉ niveau Pall Mall) : pas de charge du public sur son plancher. L’accès doit être physiquement fermé.</div>
          </Check>
        ))}
        <div className="hint" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.45 }}>
          Le toit d’une Viewbox ne reçoit jamais de public. Il y a du public à l’étage seulement sur une Viewbox posée au-dessus, ou sur un élément terrasse dessiné dans le modèle (même
          charge que les étages).
        </div>
        <Q
          label="Public pour le sol et le calage"
          help="Si l’organisateur s’engage à ne pas dépasser un nombre de personnes sur toute l’installation (comptage, contrôle d’accès), le calage au sol peut être fait pour ce nombre. La structure reste vérifiée avec la charge réglementaire ci-dessus."
        >
          <select value={hyp.publicMode} onChange={(e) => set('publicMode', e.target.value as Hypotheses['publicMode'])}>
            <option value="norm">public libre (charge réglementaire)</option>
            <option value="persons">nombre de personnes limité</option>
          </select>
        </Q>
        {hyp.publicMode === 'persons' && (
          <Q label="Nombre de personnes au plus" help="Sur toute l’installation. Le calcul les place au pire endroit : toutes serrées au-dessus de l’appui le plus chargé." conv={`= ${n(Math.max(0, Math.round(hyp.persons)) * hyp.personKg)} kg au total`}>
            <Num value={hyp.persons} onChange={(v) => set('persons', Math.max(0, Math.round(v)))} width={60} /> personnes de
            <Num value={hyp.personKg} onChange={(v) => set('personKg', Math.max(1, v))} width={50} /> kg
          </Q>
        )}
      </Section>

      <Section
        icon="💨"
        title="Le vent"
        intro={
          <>
            Le vent pousse sur les côtés fermés (murs, vitrages) et peut faire glisser ou basculer l’installation. On vérifie deux situations : <b>en exploitation</b> (le public est dedans, on
            évacue au-delà d’une vitesse donnée) et <b>hors exploitation</b> (installation vide, la tempête la plus forte attendue sur le site).
          </>
        }
      >
        {fr ? (
          <>
            <Q
              label="Vent de service (vitesse d’évacuation)"
              help={`Arrêté du 25 juillet 2022 : la structure, occupée ou non, résiste à un « vent de service » d’au moins 20 m/s (72 km/h) ; au-delà, le public est évacué (consigne du rapport). Une valeur plus haute permet d’exploiter plus longtemps, la structure est alors calculée pour elle.`}
              conv={`= ${n(frw.serviceSpeed, 1)} m/s ; q = ½ · ${n(RHO_AIR, 3)} · v² = ${n(serviceWindPressure(frw.serviceSpeed) * 1e3, 3)} kN/m²${frw.serviceSpeed < SPD.serviceMin - 1e-9 ? ' — sous le minimum de l’arrêté' : ''}`}
            >
              <Num value={kmh(frw.serviceSpeed)} onChange={(v) => setFrw({ serviceSpeed: Math.max(0, v) / 3.6 })} width={60} /> km/h
            </Q>
            <Q
              label="Région de vent (carte de l’annexe nationale)"
              help={
                <>
                  Région de la commune du site sur la carte des vents de NF EN 1991-1-4/NA (France métropolitaine, 4 régions). Outre-mer ou relief marqué : saisir la pression plus bas.
                  {placeHint(FR_WIND_MAP, 'vent')}
                </>
              }
            >
              <select value={frw.region} data-testid="fr-wind-region" onChange={(e) => setFrw({ region: Number(e.target.value) as FrWindRegion })}>
                {([1, 2, 3, 4] as FrWindRegion[]).map((r) => (
                  <option key={r} value={r}>
                    Région {r} — vb,0 = {FR_WIND_REGIONS[r]} m/s
                  </option>
                ))}
              </select>
            </Q>
            <Q label="Environnement du site (catégorie de terrain)" help={FR_TERRAINS[frw.terrain].label}>
              <select value={frw.terrain} data-testid="fr-wind-terrain" onChange={(e) => setFrw({ terrain: e.target.value as FrTerrain })}>
                {FR_TERRAIN_KEYS.map((t) => (
                  <option key={t} value={t}>
                    {t} — {FR_TERRAINS[t].label.split(',')[0]}
                  </option>
                ))}
              </select>
            </Q>
            <Q
              label="Durée de l’installation"
              help="Une installation de courte durée est calculée pour la tempête de la période correspondante (NF EN 1991-1-6) : 2 ans pour 3 jours, 5 ans pour 3 mois, 10 ans pour un an, 50 ans au-delà — jamais moins de 20 m/s pour moins de 3 mois."
            >
              <select value={frw.duration} data-testid="fr-wind-duration" onChange={(e) => setFrw({ duration: e.target.value as FrDuration })}>
                {FR_DURATION_KEYS.map((d) => (
                  <option key={d} value={d}>
                    {FR_DURATIONS[d].label} (tempête sur {FR_DURATIONS[d].years} ans)
                  </option>
                ))}
              </select>
            </Q>
            <Q
              label="Tempête à supporter, installation vide"
              help={
                <>
                  Calculée (NF EN 1991-1-4/NA, relief plat) pour une hauteur de {n(heightMm / 1000, 1)} m — l’étude reprend la hauteur exacte du modèle. Site particulier (colline, bord de falaise, outre-mer) :
                  saisir la pression de pointe donnée par le bureau d’études (0 = calculée).
                </>
              }
              conv={
                frw.manualQp && frw.manualQp > 0
                  ? `pression saisie : ${n(frw.manualQp * 1e3, 2)} kN/m²`
                  : `vb = ${n(frPk!.vb, 1)} m/s${frPk!.raised ? ' (minimum 20 m/s)' : ''} ; qp = ${n(frOut, 2)} kN/m² ≈ rafale de ${n(kmhOf(frOut))} km/h`
              }
            >
              <Num value={(frw.manualQp ?? 0) * 1e3} onChange={(v) => setFrw({ manualQp: v > 0 ? v / 1e3 : undefined })} width={60} decimals={2} /> kN/m²
            </Q>
          </>
        ) : (
          <>
        <Q
          label="Vent maximal avec du public (vitesse d’arrêt)"
          help="Au-delà de cette vitesse de vent (rafales), l’exploitation s’arrête et le public est évacué : c’est la consigne de vent du rapport. Valeur de la norme des constructions temporaires (DIN EN 13814) pour une hauteur jusqu’à 8 m : 64 km/h."
          conv={`= ${n(hyp.windIn, 2)} kN/m²`}
        >
          <Num value={kmhOf(hyp.windIn)} onChange={(v) => set('windIn', qOf(v))} width={60} /> km/h
        </Q>
        <Q
          label="Tempête à supporter, installation vide"
          help={
            <>
              Rafale la plus forte attendue sur le site pendant la durée de l’installation. Par défaut : intérieur des terres, Allemagne zone 1, hauteur jusqu’à 9,5 m, avec la réduction des constructions
              temporaires. Près de la mer (bande de 5 km), sur une île ou en zone plus ventée : choisir la ligne et la zone, ou demander au bureau d’études.
              {(['inland', 'coast', 'island'] as const).map((terrain) => (
                <div key={terrain} className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                  <span style={{ minWidth: 170 }}>{TERRAIN_LABEL[terrain]} :</span>
                  {(terrain === 'island' ? ([4] as WindZone[]) : zones).map((z) => {
                    const qz = peakPressure({ ...DEFAULT_SITE, zone: z, terrain }, 9500) * 1e3;
                    const on = (hyp.windProfile ?? 'inland') === terrain && Math.abs(hyp.windOut - Math.round(qz * 1000) / 1000) < 1e-6;
                    return (
                      <button key={z} className={`btn small ${on ? '' : 'ghost'}`} onClick={() => setHyp((h) => ({ ...h, windOut: Math.round(qz * 1000) / 1000, windProfile: terrain }))}>
                        Zone {z} : {n(kmhOf(qz))} km/h
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          }
          conv={`= ${n(hyp.windOut, 2)} kN/m²`}
        >
          <Num value={kmhOf(hyp.windOut)} onChange={(v) => setHyp((h) => ({ ...h, windOut: qOf(v), windProfile: Math.abs(qOf(v) - h.windOut) > 1e-6 ? 'manual' : h.windProfile }))} width={60} /> km/h
        </Q>
          </>
        )}
        {fr ? (
          <div className="hint" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', lineHeight: 1.45 }}>
            Au-delà du vent de service, toute l’installation est évacuée : la tempête hors exploitation est calculée sans public.
          </div>
        ) : (
          <Check checked={hyp.evacuateTop} onChange={(v) => set('evacuateTop', v)}>
            <b>Le dernier niveau est vidé par vent fort</b>
            <div className="hint">Hors exploitation, il n’y a plus personne au dernier étage (comme sur les terrasses). Décocher si du public peut rester en haut pendant une tempête.</div>
          </Check>
        )}
      </Section>

      <Section
        icon="❄️"
        title="La neige"
        intro="La neige s’accumule sur les toits du dernier niveau. Sans neige possible (été) ou si elle est déblayée tout de suite, choisir « pas de neige » : le rapport demande alors de l’empêcher."
      >
        <Q
          label="Neige au sol sur le site"
          help={
            <>
              Poids de la neige tombée sur un m² de sol, d’après la carte de neige du pays (en plaine ; plus en altitude). Sur les toitures plates, on compte 80 % de cette valeur.
              {fr && placeHint(FR_SNOW_MAP, 'neige')}
              {fr && (
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                  <span>Région de neige (NF EN 1991-1-3/NA) :</span>
                  <select value={hyp.frSnow?.region ?? ''} data-testid="fr-snow-region" onChange={(e) => (e.target.value ? setSnowFR(e.target.value as FrSnowRegion, hyp.frSnow?.altitude ?? 100) : setHyp((h) => ({ ...h, frSnow: undefined, snowKgm2: 0 })))}>
                    <option value="">— choisir —</option>
                    {FR_SNOW_KEYS.map((r) => (
                      <option key={r} value={r}>
                        {r} ({n(FR_SNOW_SK200[r], 2)} kN/m² en plaine)
                      </option>
                    ))}
                  </select>
                  <span>altitude</span>
                  <Num value={hyp.frSnow?.altitude ?? 100} onChange={(v) => hyp.frSnow && setSnowFR(hyp.frSnow.region, Math.max(0, v))} width={60} /> m
                </div>
              )}
              <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {SNOW_PRESETS.filter((p) => !fr || p.kg === 0).map((p) => (
                  <button key={p.label} className={`btn small ${snow === p.kg ? '' : 'ghost'}`} onClick={() => setHyp((h) => ({ ...h, snowKgm2: p.kg, ...(p.kg === 0 ? { frSnow: undefined } : {}) }))}>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          }
          conv={snow > 0 ? `toitures : ${n(0.8 * snow)} kg/m² = ${n(kNOf(0.8 * snow), 2)} kN/m²` : 'pas de neige dans le calcul'}
        >
          <Num value={snow} onChange={(v) => set('snowKgm2', Math.max(0, v))} width={60} /> kg/m²
        </Q>
      </Section>

      <div className="card">
        <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => setAdvanced((x) => !x)}>
          <h2>{advanced ? '▾' : '▸'} Options avancées du calage</h2>
          <span className="hint">(à laisser par défaut sauf demande du bureau d’études)</span>
        </div>
        {advanced && (
          <div className="card-body">
            <Check checked={hyp.middleFeet || jacks} disabled={jacks} onChange={(v) => set('middleFeet', v)}>
              <b>Calage aussi sous les pieds du milieu des grands côtés</b>
              <div className="hint">{jacks ? 'Avec les pieds à vérin, les 6 pieds de chaque Viewbox sont toujours calés.' : 'Répartit mieux le poids du plancher ; sinon seuls les 4 angles portent.'}</div>
            </Check>
            <Q label="Raideur du sol (longrines, plaques PEHD)" help="Sert à la variante « longrines » (madriers sous les grands côtés) et aux plaques souples en PEHD : plus le sol est dur, moins une plaque souple répartit loin de l’appui. Valeurs indicatives du module de réaction, à confirmer par l’exploitant ou le géotechnicien.">
              <select value={hyp.subgrade} onChange={(e) => set('subgrade', e.target.value)}>
                {SUBGRADE_PRESETS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Q>
            <Q label="Épaisseurs de contreplaqué disponibles dans le commerce" help="Pour proposer des plaques à acheter quand le stock ne suffit pas.">
              <input type="text" style={{ width: 170 }} value={hyp.thicknesses} onChange={(e) => set('thicknesses', e.target.value)} /> mm
            </Q>
            <Q label="Marge supplémentaire sur les charges au sol" help="Majoration forfaitaire des réactions au sol (par prudence, si des charges sont mal connues).">
              <Num value={hyp.extraPct} onChange={(v) => set('extraPct', v)} width={60} /> %
            </Q>
            {!fr && (
              <Check checked={hyp.staticoConversion} onChange={(v) => set('staticoConversion', v)}>
                <b>Taille des plaques calculée comme statico</b>
                <div className="hint">Utilise la charge de calcul divisée par 1,35 au lieu des charges réelles (méthode des notes statico, un peu différente).</div>
              </Check>
            )}
            <Check checked={hyp.diffusion} onChange={(v) => set('diffusion', v)}>
              <b>Proposer des couches continues (diffusion à 45°)</b>
              <div className="hint">Pour un sol avec une couche de grave ou de sable compacté qui répartit la charge.</div>
            </Check>
          </div>
        )}
      </div>
    </div>
  );
}
