// Étape « 4. Résultats » : charge d'exploitation maximale admissible (rez-de-chaussée, étages) avec la même
// installation — plancher bois, structure, sol et calage — en kg/m² et en personnes par m².
import type { CapacityCriterion, CapacityKey, LiveCapacity } from '../../structure/capacity';
import { fmtNumber } from '../../structure/core/units';

const kg = (q: number) => (q * 1e6) / 9.81;
const n = (v: number, d = 0) => fmtNumber(v, d);
const PERSON_KG = 80;

export const CAPACITY_LABEL: Record<CapacityKey, string> = {
  floor: 'Plancher bois (contreplaqué)',
  structure: 'Structure Viewbox et assemblages',
  ground: 'Sol et calage',
};
const TARGET_LABEL = { ground: 'Rez-de-chaussée', upper: 'Étages' } as const;

function value(c: CapacityCriterion): string {
  return `${c.above ? 'plus de ' : c.approx ? '≈ ' : ''}${n(kg(c.q))} kg/m²`;
}

export function CapacityCard({ capacity, progress }: { capacity?: LiveCapacity; progress: { done: number; total: number } | null }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-head">
        <h3>📈 Charge d’exploitation maximale</h3>
        <span className="hint">jusqu’où on peut charger les planchers avec la même installation</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!capacity && (
          <div className="hint">
            {progress ? `Calcul en cours : calculs complets à charge croissante (${progress.done} / ${progress.total})…` : 'Pas encore calculée : relancer le calcul (étape 3).'}
          </div>
        )}
        {capacity?.levels.map((l) => {
          const gov = l.criteria.find((c) => c.key === l.governing);
          return (
            <div key={l.target}>
              <div style={{ lineHeight: 1.6 }}>
                <b>{TARGET_LABEL[l.target]}</b> : étude à {n(kg(l.q0))} kg/m² → maximum{' '}
                <b style={{ fontSize: '1.15em', color: l.qMax >= l.q0 - 1e-9 ? 'var(--ok)' : 'var(--danger)' }}>
                  {l.above ? 'plus de ' : ''}
                  {n(kg(l.qMax))} kg/m²
                </b>{' '}
                <span className="hint">
                  (= {n(l.qMax * 1e3, 2)} kN/m² ≈ {n(kg(l.qMax) / PERSON_KG, 1)} personnes de {PERSON_KG} kg par m²)
                </span>
              </div>
              <div className="hint">
                {l.above
                  ? 'Aucune limite atteinte jusqu’à cette charge (recherche arrêtée).'
                  : `Limité par : ${CAPACITY_LABEL[l.governing].toLowerCase()}${l.governingLabel ? ` — ${l.governingLabel}` : ''}${gov?.approx ? ' (valeur interpolée)' : ''}.`}
              </div>
              <table className="list cap" style={{ width: 'auto', marginTop: 4 }}>
                <tbody>
                  {l.criteria.map((c) => (
                    <tr key={c.key}>
                      <td>{CAPACITY_LABEL[c.key]}</td>
                      <td style={{ textAlign: 'right', fontWeight: c.key === l.governing ? 700 : 400 }}>{value(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {capacity?.notes.map((t, k) => (
          <div key={k} className="hint">
            ⚠ {t}
          </div>
        ))}
        {!!capacity?.levels.length && (
          <div className="hint" style={{ lineHeight: 1.45 }}>
            Le toit d’une Viewbox ne reçoit jamais de public. L’étude, le calage et le rapport restent faits pour la charge de l’étude : pour exploiter à une charge plus forte, la saisir à l’étape 2 et
            relancer le calcul (le calage au sol peut changer). « ≈ » : valeur interpolée entre deux calculs.
          </div>
        )}
      </div>
    </div>
  );
}
