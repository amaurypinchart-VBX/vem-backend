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
import { DEFAULT_HYP } from './GroundPanel';

const G = 9.81;
const n = (v: number, d = 0) => fmtNumber(v, d);
/** kN/m² ↔ kg/m² */
const kgOf = (kNm2: number) => (kNm2 * 1000) / G;
const kNOf = (kgm2: number) => (kgm2 * G) / 1000;
/** pression du vent (kN/m²) ↔ vitesse (km/h) : q = ½ ρ v², ρ = 1,25 kg/m³ */
const kmhOf = (q: number) => Math.sqrt((2 * q * 1000) / 1.25) * 3.6;
const qOf = (kmh: number) => (0.5 * 1.25 * (kmh / 3.6) ** 2) / 1000;
const PERSON_KG = 80;

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
  /** toitures accessibles au public (étude complète) */
  roof?: boolean;
  setRoof?: (v: boolean) => void;
  /** nombre de niveaux de Viewbox du modèle */
  levels?: number;
}

export function HypothesesForm({ hyp, setHyp, jacks = false, roof, setRoof, levels = 1 }: HypothesesFormProps) {
  const set = <K extends keyof Hypotheses>(k: K, v: Hypotheses[K]) => setHyp((h) => ({ ...h, [k]: v }));
  const preset = BEARING_PRESETS.find((p) => p.key === hyp.bearingPreset);
  const q = bearingFrom(hyp.bearingValue, hyp.bearingUnit);
  const bearingKg = (q * 1e6) / G;
  const persons = (kNm2: number) => kgOf(kNm2) / PERSON_KG;
  const snow = hyp.snowKgm2 ?? 0;
  const [advanced, setAdvanced] = useState(false);
  const zones: WindZone[] = [1, 2, 3, 4];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-body row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 300, lineHeight: 1.5 }}>
            Ces hypothèses décrivent <b>le site et l’usage</b> de l’installation : ce que le sol supporte, combien de personnes montent, le vent, la neige. Le calcul (étape 3) et le calage (étape 5) s’en
            servent. Les valeurs proposées sont celles des notes de calcul statico ; changez-les seulement si le site ou l’usage est différent. Chaque valeur est expliquée et convertie dans les unités du
            calcul (en gris).
          </span>
          <button className="btn small ghost" onClick={() => setHyp(() => ({ ...DEFAULT_HYP }))}>
            Revenir aux valeurs par défaut
          </button>
        </div>
      </div>

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
        {preset?.pointLoad && (
          <Q label="Charge maximale sous un seul pied" help="Une dalle ou une toiture a aussi une limite par point (sous un pied). Valeur de la fiche du bâtiment." conv={`= ${n(hyp.pointLoadKN, 1)} kN`}>
            <Num value={(hyp.pointLoadKN * 1000) / G} onChange={(v) => set('pointLoadKN', (v * G) / 1000)} /> kg
          </Q>
        )}
      </Section>

      <Section icon="📦" title="Les Viewbox et ce qu’elles portent" intro="Le poids propre des Viewbox et de tout ce qui est fixé dessus (murs, vitrages, logos…) appuie sur la structure et sur le sol.">
        <Q label="Poids d’une Viewbox" help="Pesée Viewbox : 2 564 kg, planchers et isolants compris. À changer seulement pour une Viewbox différente.">
          <Num value={hyp.moduleWeightKg} onChange={(v) => set('moduleWeightKg', v)} /> kg
        </Q>
        <Q
          label="Quel poids retenir ?"
          help="Le modèle de calcul additionne les barres acier, le plafond et le sol (≈ 2 810 kg). « Le plus lourd » garde la valeur la plus défavorable (conseillé) ; « la pesée » retient exactement le poids pesé."
        >
          <select value={hyp.weightMode} onChange={(e) => set('weightMode', e.target.value as Hypotheses['weightMode'])}>
            <option value="max">le plus lourd (conseillé)</option>
            <option value="weighed">la pesée exactement ({n(hyp.moduleWeightKg)} kg)</option>
          </select>
        </Q>
        <Q label="Plafond et isolation (par m²)" help="Poids du faux plafond et de l’isolant de toiture, réparti sur chaque m²." conv={`= ${n(hyp.ceiling, 2)} kN/m²`}>
          <Num value={kgOf(hyp.ceiling)} onChange={(v) => set('ceiling', kNOf(v))} /> kg/m²
        </Q>
        <Q label="Sol et isolation (par m²)" help="Poids du plancher fini (revêtement, isolant) sur chaque m²." conv={`= ${n(hyp.floorFinish, 2)} kN/m²`}>
          <Num value={kgOf(hyp.floorFinish)} onChange={(v) => set('floorFinish', kNOf(v))} /> kg/m²
        </Q>
        <Q
          label="Poids supplémentaire par Viewbox"
          help="Murs, garde-corps, logos, mobilier lourd… qui ne sont pas dans le modèle SketchUp. Ceux du modèle sont déjà comptés (étape 1)."
          conv={`= ${n(hyp.extraKN, 1)} kN par Viewbox`}
        >
          <Num value={(hyp.extraKN * 1000) / G} onChange={(v) => set('extraKN', (v * G) / 1000)} /> kg
        </Q>
      </Section>

      <Section icon="👥" title="Le public" intro="Les personnes sur les planchers (et les terrasses) pèsent sur la structure et poussent aussi un peu de côté quand elles bougent.">
        <Q
          label="Charge du public au rez-de-chaussée"
          help={`Calcul de type statico 18-0573 (Prüfbuch TÜV) : 5,0 kN/m² au rez-de-chaussée (« 500 kg/m² » dans la note), public sans foule dense, soit environ ${n(persons(5), 1)} personnes de ${PERSON_KG} kg par m². Ne la baisser que si l’accès est vraiment limité.`}
          conv={`= ${n(hyp.liveGround ?? 5, 2)} kN/m² ≈ ${n(persons(hyp.liveGround ?? 5), 1)} personnes par m²`}
        >
          <Num value={kgOf(hyp.liveGround ?? 5)} onChange={(v) => set('liveGround', kNOf(v))} /> kg/m²
        </Q>
        <Q
          label="Charge du public aux étages"
          help={`Valeur réglementaire pour un étage ouvert au public sans foule dense (DIN EN 13814, statico 18-0573) : 357 kg par m², soit environ ${n(persons(3.5), 1)} personnes de ${PERSON_KG} kg par m². L’organisateur empêche une foule dense (personnel formé).`}
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
        {setRoof && (
          <Check checked={!!roof} onChange={setRoof}>
            <b>Toitures ouvertes au public (terrasses)</b>
            <div className="hint">Les toits sans Viewbox au-dessus reçoivent alors aussi du public (valeur ci-dessous). Par neige ou vent fort, les terrasses sont fermées.</div>
          </Check>
        )}
        <Q label="Charge du public sur les terrasses" help="Même règle que les planchers ; seulement si les toitures sont ouvertes au public." conv={`= ${n(hyp.roofLive, 2)} kN/m² ≈ ${n(persons(hyp.roofLive), 1)} personnes par m²`}>
          <Num value={kgOf(hyp.roofLive)} onChange={(v) => set('roofLive', kNOf(v))} /> kg/m²
        </Q>
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
        <Check checked={hyp.evacuateTop} onChange={(v) => set('evacuateTop', v)}>
          <b>Le dernier niveau est vidé par vent fort</b>
          <div className="hint">Hors exploitation, il n’y a plus personne au dernier étage (comme sur les terrasses). Décocher si du public peut rester en haut pendant une tempête.</div>
        </Check>
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
              <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {SNOW_PRESETS.map((p) => (
                  <button key={p.label} className={`btn small ${snow === p.kg ? '' : 'ghost'}`} onClick={() => set('snowKgm2', p.kg)}>
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
            <Q label="Type de sol sous les longrines (madriers)" help="Sert seulement à la variante « longrines » (madriers sous les grands côtés) : plus le sol est dur, mieux le madrier répartit. Valeurs indicatives.">
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
            <Check checked={hyp.staticoConversion} onChange={(v) => set('staticoConversion', v)}>
              <b>Taille des plaques calculée comme statico</b>
              <div className="hint">Utilise la charge de calcul divisée par 1,35 au lieu des charges réelles (méthode des notes statico, un peu différente).</div>
            </Check>
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
