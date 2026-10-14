// Étape 3 « Questions chantier » : tout ce qui n'est jamais dans la 3D. Une question sans réponse reste une question
// dans la liste (jamais une supposition). Reprise de la liste précédente du projet ; en-tête du bordereau repris du
// projet VEM (n° d'order, client, date d'expédition = premier chargement de camion), modifiable.
import type { ReactNode } from 'react';
import type { ListMeta, SiteAnswers, StudyInput } from '../../loading/core/answers';
import { unansweredSiteQuestions } from '../../loading/core/answers';

type YesNo = boolean | undefined;

function Choice<T extends string | boolean>({ value, options, onChange }: { value: T | undefined; options: [T, string][]; onChange: (v: T | undefined) => void }) {
  return (
    <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
      {options.map(([v, label]) => (
        <button key={String(v)} className={`btn small ${value === v ? 'primary' : ''}`} onClick={() => onChange(value === v ? undefined : v)}>
          {label}
        </button>
      ))}
      {value === undefined && <span className="badge orange">sans réponse</span>}
    </span>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 10, alignItems: 'start', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <b>{label}</b>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function QuestionsStep({
  answers: a,
  onChange,
  meta,
  onMeta,
  study,
  studyNote,
  boxes,
}: {
  answers: SiteAnswers;
  onChange: (a: SiteAnswers) => void;
  meta: ListMeta;
  onMeta: (m: ListMeta) => void;
  study: StudyInput | null;
  studyNote: string;
  boxes: number;
}) {
  const set = <K extends keyof SiteAnswers>(k: K, v: SiteAnswers[K] | undefined) => {
    const next = { ...a };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const open = unansweredSiteQuestions(a);
  const yes: [boolean, string][] = [
    [true, 'Oui'],
    [false, 'Non'],
  ];
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Questions chantier</h2>
          <span className="hint">{open.length ? `Encore sans réponse : ${open.join(', ')}.` : 'Tout est répondu.'}</span>
        </div>
        <div className="card-body" data-testid="site-questions">
          <Row label="Airco à prévoir" hint="En plus de celles dessinées dans la 3D. Chaque airco : 1 mur à trou en plus.">
            <span className="row" style={{ gap: 6 }}>
              <input
                type="number"
                min={0}
                style={{ width: 70 }}
                value={a.aircoCount ?? ''}
                placeholder="?"
                aria-label="Airco à prévoir"
                onChange={(e) => set('aircoCount', e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))))}
              />
              {a.aircoCount === undefined && <span className="badge orange">sans réponse</span>}
            </span>
          </Row>
          <Row label="Charge lourde" hint="Véhicule ou charge sur les box : sous-bois renforcés (à saisir dans l’Étude structure).">
            <Choice<boolean> value={a.chargeLourde as YesNo} options={yes} onChange={(v) => set('chargeLourde', v)} />
          </Row>
          <Row label="Revêtement de sol" hint="Vinyle clic « laminate » style parquet (4-740-010) ou vinyle floor (4-740-011) ; gaffa et adhésif double face : 1 rouleau par 15 m².">
            <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Choice<boolean> value={a.plancherLamine as YesNo} options={yes} onChange={(v) => set('plancherLamine', v)} />
              {a.plancherLamine && (
                <>
                  <Choice<'laminate' | 'vinyle'>
                    value={a.revetementSol}
                    options={[
                      ['laminate', 'Vinyle clic laminate (parquet)'],
                      ['vinyle', 'Vinyle floor'],
                    ]}
                    onChange={(v) => set('revetementSol', v)}
                  />
                  <label className="row" style={{ gap: 4 }}>
                    m²
                    <input
                      type="number"
                      min={0}
                      style={{ width: 70 }}
                      value={a.plancherM2 ?? ''}
                      placeholder={String(15 * boxes)}
                      onChange={(e) => set('plancherM2', e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))}
                    />
                    <span className="hint">vide = 15 m² par box</span>
                  </label>
                </>
              )}
            </span>
          </Row>
          <Row label="Boarding sous les box" hint="Bakélite noire 4-740-009 : la quantité se saisit à l’étape 4 (à l’appréciation).">
            <Choice<boolean> value={a.boarding as YesNo} options={yes} onChange={(v) => set('boarding', v)} />
          </Row>
          <Row label="Travail en hauteur / sur le toit" hint="Livre TÜV, ligne de vie, harnais.">
            <Choice<boolean> value={a.hauteur as YesNo} options={yes} onChange={(v) => set('hauteur', v)} />
          </Row>
          <Row label="Taille du job" hint="Peinture : 2 pots + kit (petit) ou un bidon de 20 L (gros).">
            <Choice<'petit' | 'gros'>
              value={a.tailleJob}
              options={[
                ['petit', 'Petit'],
                ['gros', 'Gros'],
              ]}
              onChange={(v) => set('tailleJob', v)}
            />
          </Row>
          <Row label="Montage" hint="Un montage atelier se corrige ligne par ligne à l’étape 4 (« seulement ce chantier »).">
            <Choice<'atelier' | 'chantier'>
              value={a.montage}
              options={[
                ['chantier', 'Sur chantier'],
                ['atelier', 'En atelier'],
              ]}
              onChange={(v) => set('montage', v)}
            />
          </Row>
          <Row label="RAL des murs" hint="7024 une face : les nidaplast blancs sortent en 7-636-006.">
            <Choice<string>
              value={a.ralMurs}
              options={[
                ['blanc', 'Blanc / blanc'],
                ['7024', 'RAL 7024 une face'],
              ]}
              onChange={(v) => set('ralMurs', v)}
            />
          </Row>
          <Row label="Sous-bois" hint="Plaques de calage de l’Étude structure (étape 5 « Sol & calage ») × 2.">
            {study ? <span>{studyNote}</span> : <span style={{ color: 'var(--orange)' }}>⚠ {studyNote}</span>}
          </Row>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>En-tête du bordereau</h2>
          <span className="hint">Repris du projet VEM, modifiable.</span>
        </div>
        <div className="card-body">
          <Row label="N° d’order">
            <input type="text" value={meta.orderNo ?? ''} style={{ width: 240 }} onChange={(e) => onMeta({ ...meta, orderNo: e.target.value })} />
          </Row>
          <Row label="Client">
            <input type="text" value={meta.client ?? ''} style={{ width: 320 }} onChange={(e) => onMeta({ ...meta, client: e.target.value })} />
          </Row>
          <Row label="Date d’expédition">
            <input type="date" value={meta.shippingDate ?? ''} onChange={(e) => onMeta({ ...meta, shippingDate: e.target.value || undefined })} />
          </Row>
        </div>
      </div>
    </>
  );
}
