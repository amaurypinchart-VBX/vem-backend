// Réglages › Règles de loading › Bancs d'étalonnage : les chantiers de référence (bancs de base dans le code + bancs
// ajoutés depuis l'étape « Chantier réel » d'une loading liste), rejoués avec les règles du moment : score, écarts
// ligne à ligne (écarts connus en repère). Un banc ajouté dans l'app peut être retiré (admin, responsable technique).
import { Fragment, useEffect, useMemo, useState } from 'react';
import { SEED_BENCHES } from '../../loading/benches';
import type { CatalogueItem, LoadingRule } from '../../loading/core/types';
import { SEED_OBSERVATIONS } from '../../loading/library/seed';
import type { AppBench, BenchRow } from '../../loading/reconcile/benches';
import { benchFromRow, replayBench } from '../../loading/reconcile/benches';
import { vem } from '../../api/vem';

const GAP_LABEL = { identique: '✔', plus: '↕ plus', moins: '↕ moins', reel_seul: '➕ réel seul', prediction_seule: '➖ liste seule' } as const;

export function BenchesPanel({ rules, catalogue, canEdit }: { rules: readonly LoadingRule[]; catalogue: ReadonlyMap<string, CatalogueItem>; canEdit: boolean }) {
  const [rows, setRows] = useState<BenchRow[]>([]);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () =>
    vem
      .loadingBenches()
      .then(setRows)
      .catch((e: Error) => setErr(`Bancs ajoutés dans l’app indisponibles : ${e.message}`));
  useEffect(() => {
    void refresh();
  }, []);
  const benches: AppBench[] = useMemo(
    () => [...SEED_BENCHES.map((b) => ({ ...b, origin: 'seed' as const })), ...rows.map(benchFromRow).filter((b): b is AppBench => !!b)],
    [rows],
  );
  const replays = useMemo(() => benches.map((b) => replayBench(b, rules, catalogue, SEED_OBSERVATIONS)), [benches, rules, catalogue]);
  const broken = rows.length - benches.filter((b) => b.origin === 'app').length;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Bancs d’étalonnage ({benches.length})</h2>
        <span className="hint">
          Chantiers réels rejoués avec les règles du moment. Ajouter un banc : loading liste d’un projet › 6. Chantier réel › « Ajouter comme banc
          d’étalonnage ».
        </span>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 6 }}>
        {err && <div className="error-box">{err}</div>}
        {broken > 0 && <div className="hint">{broken} banc(s) illisible(s) ignoré(s).</div>}
        <table className="list" data-testid="loading-benches">
          <thead>
            <tr>
              <th>Banc</th>
              <th>Bon</th>
              <th>Score</th>
              <th>Écarts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {replays.map(({ bench: b, comparison: c }) => {
              const app = b as AppBench;
              const gaps = c.gaps.filter((g) => g.kind !== 'identique');
              const unknown = gaps.filter((g) => !g.known).length;
              return (
                <Fragment key={b.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(open === b.id ? null : b.id)}>
                    <td>
                      <b>{b.name}</b> <span className="badge">{app.origin === 'app' ? 'ajouté dans l’app' : 'de base'}</span>
                      <div className="hint" style={{ fontSize: 11 }}>
                        {b.source}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{b.bordereau || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <b>
                        {c.identical} / {c.total}
                      </b>
                    </td>
                    <td>
                      {gaps.length} {unknown ? <span className="badge orange">{unknown} non expliqué(s)</span> : gaps.length ? <span className="hint">tous connus</span> : null}
                    </td>
                    <td>
                      {app.origin === 'app' && canEdit && (
                        <button
                          className="btn small ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!window.confirm(`Retirer le banc « ${b.name} » ? Il ne sera plus rejoué.`)) return;
                            vem
                              .deleteLoadingBench(app.rowId!)
                              .then(refresh)
                              .catch((er: Error) => setErr(`Banc non retiré : ${er.message}`));
                          }}
                        >
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === b.id && (
                    <tr>
                      <td colSpan={5}>
                        <table className="list">
                          <tbody>
                            {gaps.map((g) => (
                              <tr key={g.article}>
                                <td style={{ whiteSpace: 'nowrap' }}>{GAP_LABEL[g.kind]}</td>
                                <td>
                                  <b>{g.article}</b> <span className="hint">{catalogue.get(g.article)?.designation ?? ''}</span>
                                </td>
                                <td style={{ textAlign: 'right' }}>liste {g.predicted ?? '—'}</td>
                                <td style={{ textAlign: 'right' }}>réel {g.real ?? '—'}</td>
                                <td className="hint">{g.known ? `connu : ${g.known}` : <span className="badge orange">non expliqué</span>}</td>
                              </tr>
                            ))}
                            {!gaps.length && (
                              <tr>
                                <td className="hint">Aucun écart.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
