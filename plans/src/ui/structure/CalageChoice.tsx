// Calage appui par appui (étape 5 et calcul rapide) : choix des plaques par type d'appui ou pour un appui, étapes de la
// répartition pied → plaques → sol, diagnostic de chaque groupe d'appuis avec la plaque à prendre, plaques de roulage.
import { useState } from 'react';
import type { CalageResult, CalageType, SupportCheck } from '../../structure/core/calage';
import type { StockPlate } from '../../structure/core/ground';
import { plateKey, stockPlateLabel } from '../../structure/core/ground';
import { verdictOf } from '../../structure/core/records';
import type { CalageChoices, LayerRef } from '../../structure/core/spreading';
import { dimsCm, kN, m2, pressureText } from '../../structure/core/spreading';
import { supportType } from '../../structure/core/roadway';
import { fmtNumber } from '../../structure/core/units';

const n = (v: number, d = 1) => fmtNumber(v, d);
export const badgeOf = (eta: number) => (verdictOf(eta) === 'ok' ? 'ok' : verdictOf(eta) === 'limit' ? 'orange' : 'ko');
/** Couleur d'un appui sur le plan selon son taux de travail (vert, orange, rouge). */
export const CHECK_COLORS = { ok: '#16a34a', limit: '#d97706', fail: '#dc2626' } as const;
export const checkColor = (eta: number) => CHECK_COLORS[verdictOf(eta) === 'ok' ? 'ok' : verdictOf(eta) === 'limit' ? 'limit' : 'fail'];

/** Résumé court d'un calage (« 2 × 100 × 100 × 36 mm », « aucune plaque »). */
export function refsText(refs: LayerRef[] | undefined, stock: StockPlate[]): string {
  if (refs === undefined) return 'automatique';
  if (!refs.length) return 'aucune plaque';
  return refs
    .map((r) => {
      const s = stock.find((p) => plateKey(p) === r.plate);
      return `${r.n} × ${s ? `${s.length / 10} × ${s.width / 10} × ${s.thickness} mm` : r.plate}`;
    })
    .join(' + ');
}

/**
 * Choix des plaques sous un appui : hériter (automatique ou choix du type), aucune plaque, une plaque du stock, ou
 * plusieurs couches (n plaques identiques par couche, la plus petite sous le pied).
 */
export function LayerPicker({ value, onChange, stock, inheritLabel }: { value: LayerRef[] | undefined; onChange: (v: LayerRef[] | undefined) => void; stock: StockPlate[]; inheritLabel: string }) {
  const keys = stock.map(plateKey);
  const labelOf = (k: string) => {
    const s = stock.find((p) => plateKey(p) === k);
    return s ? stockPlateLabel(s) : `${k} (plus au stock)`;
  };
  // éditeur des couches ouvert tant que l'utilisateur y travaille (même revenu à une seule plaque)
  const [multi, setMulti] = useState(false);
  const single = value?.length === 1 && value[0].n === 1 && keys.includes(value[0].plate);
  const mode = value === undefined ? '' : !value.length ? 'none' : single && !multi ? value[0].plate : 'custom';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
        <option value="none">Aucune plaque (pied posé directement)</option>
        {keys.map((k) => (
          <option key={k} value={k}>
            1 × {labelOf(k)}
          </option>
        ))}
        <option value="custom">Plusieurs plaques empilées / plusieurs couches…</option>
      </select>
      {!!value?.length && mode === 'custom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 8, borderLeft: '2px solid rgba(148,163,184,.4)' }}>
          {value.map((l, i) => (
            <div className="row" key={i} style={{ gap: 4, flexWrap: 'nowrap' }}>
              <span className="hint" style={{ minWidth: 78 }}>{i === 0 ? 'sous le pied' : `couche ${i + 1}`}</span>
              <select value={l.n} style={{ width: 56 }} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, n: Number(e.target.value) } : x)))}>
                {[1, 2, 3].map((k) => (
                  <option key={k} value={k}>
                    {k} ×
                  </option>
                ))}
              </select>
              <select value={l.plate} style={{ maxWidth: 300 }} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, plate: e.target.value } : x)))}>
                {[...new Set([...keys, l.plate])].map((k) => (
                  <option key={k} value={k}>
                    {labelOf(k)}
                  </option>
                ))}
              </select>
              <button className="btn small ghost" title="Retirer cette couche" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          {value.length < 3 && keys.length > 0 && (
            <div>
              <button className="btn small ghost" onClick={() => onChange([...value, { plate: keys[keys.length - 1], n: 1 }])}>
                + couche en dessous (plus grande)
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
  setRoadway: (on: boolean) => void;
  reset: () => void;
}

/** Libellé « automatique » d'un type : la solution retenue sans choix de l'utilisateur. */
function autoLabel(t: CalageType | undefined, roadwayOn: boolean): string {
  if (roadwayOn) return 'Automatique : pied posé sur les plaques de roulage';
  if (!t?.chosen) return 'Automatique : aucune solution standard';
  return `Automatique : ${t.chosen.summary}`;
}

/** Appui sélectionné sur le plan : réaction, étapes de la répartition, calage de cet appui, conseil. */
export function SupportPanel({ c, result, stock, set, onClose }: { c: SupportCheck; result: CalageResult; stock: StockPlate[]; set: ChoiceSetters; onClose: () => void }) {
  const typeRefs = set.choices.byType?.[c.typeKey];
  const own = set.choices.bySupport?.[c.id];
  const autoType = result.types.find((t) => t.typeKey === c.typeKey && !t.custom);
  const r = c.reaction;
  return (
    <div className="card support-panel" style={{ marginTop: 8, borderColor: checkColor(c.eta) }}>
      <div className="card-head">
        <h2>
          {c.id} — {supportType(r)}
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
        <ChainTable c={c} />
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <span className="hint" style={{ minWidth: 140, paddingTop: 4 }}>
            Calage de {c.id}
          </span>
          <LayerPicker
            value={own}
            onChange={(v) => set.setSupport(c.id, v)}
            stock={stock}
            inheritLabel={typeRefs !== undefined ? `Comme les autres « ${supportType(r)} » : ${refsText(typeRefs, stock)}` : autoLabel(autoType, result.roadwayOn)}
          />
        </div>
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
}: {
  result: CalageResult;
  set: ChoiceSetters;
  onSelect: (id: string) => void;
  /** public prévu / public maximal avec ce calage */
  publicLine?: { ok: boolean; text: string } | null;
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
          <LayerPicker value={set.choices.byType?.[t.typeKey]} onChange={(v) => set.setType(t.typeKey, v)} stock={stock} inheritLabel={autoLabel(autoType ?? t, result.roadwayOn)} />
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
