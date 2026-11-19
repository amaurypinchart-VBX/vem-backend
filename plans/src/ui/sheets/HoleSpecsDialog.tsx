// Dialogue « 🔩 Trous et taraudages » des plans de production : pour chaque Ø dessiné dans le modèle (tout le modèle) et
// chaque groupe de trous d'une pièce (cette pièce seulement), ce qu'on en fait — perçage, taraudage, fraisage, vis
// autoperceuse, rivet, rien. Les choix sont enregistrés avec le modèle (settings.holeSpecs) ; les planches PR les
// reprennent à la génération, ou tout de suite avec « Appliquer aux planches » dans l'éditeur.
import { useMemo, useState } from 'react';
import type { PartType } from '../../production/parts';
import { holeAction, holeGroups } from '../../production/parts';
import type { HoleOp, HoleSpec, HoleSpecs } from '../../production/holeSpecs';
import {
  HOLE_OPS,
  HOLE_OP_LABEL,
  METRIC_SIZES,
  clearanceFor,
  coarsePitch,
  countersinkFor,
  diameterClasses,
  diameterSpec,
  partHoleKey,
  partSignature,
  specSummary,
  tapDrill,
} from '../../production/holeSpecs';

const AXIS: Record<string, string> = { u: 'le long', v: 'travers', w: 'épaisseur' };
const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const parseNum = (s: string) => {
  const v = Number(s.replace(',', '.').trim());
  return s.trim() && Number.isFinite(v) && v > 0 ? v : undefined;
};

/** Valeurs proposées quand on choisit une opération pour un trou dessiné de Ø `drawn`. */
function startSpec(op: HoleOp, drawn: number, detectedM?: number): HoleSpec {
  const nearM = detectedM ?? METRIC_SIZES.reduce((a, m) => (Math.abs((clearanceFor(m) ?? m) - drawn) < Math.abs((clearanceFor(a) ?? a) - drawn) ? m : a), 8);
  switch (op) {
    case 'tap':
      return { op, size: detectedM ?? METRIC_SIZES.reduce((a, m) => (Math.abs((tapDrill(m) ?? m) - drawn) < Math.abs((tapDrill(a) ?? a) - drawn) ? m : a), 8) };
    case 'countersink':
      return { op, size: nearM };
    case 'none':
      return { op };
    default:
      return { op, d: Math.round(drawn * 10) / 10 };
  }
}

function SpecEditor({
  spec,
  drawn,
  detectedM,
  inherit,
  testId,
  onChange,
}: {
  spec: HoleSpec | undefined;
  drawn: number;
  detectedM?: number;
  /** texte de l'option « pas de choix ici » */
  inherit: string;
  testId: string;
  onChange: (s: HoleSpec | undefined) => void;
}) {
  const field = (k: 'd' | 'pitch' | 'head', placeholder: string, w = 64) => (
    <input
      key={`${k}-${spec?.op}`}
      type="text"
      inputMode="decimal"
      style={{ width: w }}
      defaultValue={spec?.[k] !== undefined ? fmt(spec[k]!) : ''}
      placeholder={placeholder}
      data-testid={`${testId}-${k}`}
      onBlur={(e) => {
        const v = parseNum(e.target.value);
        const n = { ...spec! };
        if (v === undefined) delete n[k];
        else n[k] = v;
        onChange(n);
      }}
    />
  );
  return (
    <span className="hole-spec-editor" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      <select
        style={{ width: 'auto', maxWidth: 260 }}
        value={spec?.op ?? ''}
        data-testid={`${testId}-op`}
        onChange={(e) => onChange(e.target.value ? startSpec(e.target.value as HoleOp, drawn, detectedM) : undefined)}
      >
        <option value="">{inherit}</option>
        {HOLE_OPS.map((op) => (
          <option key={op} value={op}>
            {HOLE_OP_LABEL[op]}
          </option>
        ))}
      </select>
      {spec && (spec.op === 'tap' || spec.op === 'countersink') && (
        <select
          style={{ width: 'auto' }}
          value={spec.size ?? ''}
          data-testid={`${testId}-size`}
          onChange={(e) => {
            const n: HoleSpec = { ...spec, size: Number(e.target.value) };
            delete n.pitch;
            onChange(n);
          }}
        >
          {spec.op === 'countersink' && <option value="">vis ?</option>}
          {METRIC_SIZES.map((m) => (
            <option key={m} value={m}>
              M{m}
            </option>
          ))}
        </select>
      )}
      {spec?.op === 'tap' && (
        <>
          <span className="hint">pas</span>
          {field('pitch', fmt(coarsePitch(spec.size!) ?? 0), 52)}
          <span className="hint">perçage Ø</span>
          {field('d', fmt(tapDrill(spec.size!, spec.pitch) ?? 0))}
        </>
      )}
      {spec?.op === 'countersink' && (
        <>
          <span className="hint">passage Ø</span>
          {field('d', spec.size ? fmt(clearanceFor(spec.size) ?? drawn) : fmt(drawn))}
          <span className="hint">fraisage Ø</span>
          {field('head', spec.size ? fmt(countersinkFor(spec.size) ?? 0) : '')}
        </>
      )}
      {spec && (spec.op === 'drill' || spec.op === 'rivet') && (
        <>
          <span className="hint">Ø</span>
          {field('d', fmt(drawn))}
        </>
      )}
      {spec?.op === 'screw' && (
        <>
          <span className="hint">préperçage Ø</span>
          {field('d', 'aucun')}
        </>
      )}
      {spec && spec.op !== 'none' && (
        <input
          key={`note-${spec.op}`}
          type="text"
          style={{ width: 170 }}
          placeholder="précision (vis 5,5 × 25…)"
          defaultValue={spec.note ?? ''}
          data-testid={`${testId}-note`}
          onBlur={(e) => {
            const n = { ...spec };
            if (e.target.value.trim()) n.note = e.target.value.trim();
            else delete n.note;
            onChange(n);
          }}
        />
      )}
    </span>
  );
}

const mOf = (name: string) => {
  const m = /^M(\d+)/.exec(name);
  return m ? Number(m[1]) : undefined;
};

export function HoleSpecsDialog({
  types,
  specs,
  moduleLabel,
  applyLabel,
  readOnly,
  onSave,
  onClose,
}: {
  /** pièces telles que détectées (sans les choix) */
  types: PartType[];
  specs: HoleSpecs;
  moduleLabel: string;
  /** éditeur : « Enregistrer et refaire les planches PR » */
  applyLabel?: string;
  readOnly?: boolean;
  onSave: (specs: HoleSpecs) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<HoleSpecs>(() => ({ byDiameter: { ...specs.byDiameter }, byPart: { ...specs.byPart } }));
  const classes = useMemo(() => diameterClasses(types), [types]);
  const withHoles = types.filter((t) => t.rep.geo.holes.length);
  const setD = (key: string, s: HoleSpec | undefined) =>
    setDraft((x) => {
      const byDiameter = { ...x.byDiameter };
      if (s) byDiameter[key] = s;
      else delete byDiameter[key];
      return { ...x, byDiameter };
    });
  const setP = (key: string, s: HoleSpec | undefined) =>
    setDraft((x) => {
      const byPart = { ...x.byPart };
      if (s) byPart[key] = s;
      else delete byPart[key];
      return { ...x, byPart };
    });
  const nChoices = Object.keys(draft.byDiameter).length + Object.keys(draft.byPart).length;
  return (
    <div className="modal-backdrop">
      <div className="modal hole-specs-dialog" role="dialog" aria-label="Trous et taraudages" data-testid="hole-specs-dialog" style={{ maxWidth: 1100, width: '96vw' }}>
        <div className="card-head">
          <h2>🔩 Trous et taraudages — {moduleLabel}</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {!withHoles.length ? (
            <div className="hint" data-testid="hole-specs-none">
              Aucun trou dessiné dans les pièces de cette Viewbox. Les trous doivent être dessinés dans SketchUp (cylindre traversant la pièce)
              pour apparaître sur les plans de production.
            </div>
          ) : (
            <>
              <div className="hint" style={{ marginBottom: 8 }}>
                Le modèle donne la position et le Ø dessiné de chaque trou. Dis ici ce qu’il faut en faire. Un choix « pour tout le modèle »
                vaut pour tous les trous de ce Ø ; un choix sur une pièce gagne sur celui du modèle. Sans choix, la détection reste (taraudage
                proposé d’après le Ø, marqué « to confirm » sur les plans). « Rien à usiner » retire ces trous des plans.
              </div>
              <h3 style={{ margin: '8px 0 4px' }}>Pour tout le modèle (par Ø dessiné)</h3>
              <table className="list" data-testid="hole-classes">
                <thead>
                  <tr>
                    <th>Ø dessiné</th>
                    <th>Trous / VBX</th>
                    <th>Pièces</th>
                    <th>Détection</th>
                    <th>Ce qu’on fait</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => {
                    const cur = diameterSpec(draft, c.d);
                    return (
                      <tr key={c.key} data-testid={`hole-class-${c.key}`}>
                        <td>Ø{fmt(c.d)}</td>
                        <td>{c.holes}</td>
                        <td>{c.parts.join(', ')}</td>
                        <td>{c.detected}</td>
                        <td>
                          {readOnly ? (
                            cur ? specSummary(cur.spec, c.d) : '—'
                          ) : (
                            <SpecEditor
                              spec={cur?.spec}
                              drawn={c.d}
                              detectedM={mOf(c.detected)}
                              inherit="Comme détecté"
                              testId={`hole-class-${c.key}`}
                              onChange={(s) => setD(cur?.key ?? c.key, s)}
                            />
                          )}
                          {cur && <div className="hint">{specSummary(cur.spec, c.d)}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <h3 style={{ margin: '12px 0 4px' }}>Par pièce (gagne sur le modèle)</h3>
              {withHoles.map((t) => {
                const sig = partSignature(t);
                return (
                  <div key={t.mark} style={{ marginBottom: 8 }} data-testid={`hole-part-${t.mark}`}>
                    <div>
                      <b>{t.mark}</b> — {t.name || t.description} <span className="hint">({t.qty} / VBX)</span>
                    </div>
                    <table className="list">
                      <tbody>
                        {holeGroups(t.rep.geo.holes).map((g) => {
                          const h = g.holes[0];
                          const key = partHoleKey(sig, h);
                          const own = draft.byPart[key];
                          const model = diameterSpec(draft, g.d);
                          const eff = own ?? model?.spec;
                          return (
                            <tr key={key} data-testid={`hole-part-${t.mark}-${g.ref}`}>
                              <td style={{ width: 28 }}>{g.ref}</td>
                              <td style={{ width: 150 }}>
                                {g.holes.length}× {g.name} <span className="hint">({AXIS[g.axis]}{g.walls > 1 ? `, ${g.walls} parois` : ''})</span>
                              </td>
                              <td>
                                {readOnly ? null : (
                                  <SpecEditor
                                    spec={own}
                                    drawn={g.d}
                                    detectedM={g.thread ? mOf(g.thread.name) : undefined}
                                    inherit={model ? 'Comme le modèle' : 'Comme détecté'}
                                    testId={`hole-part-${t.mark}-${g.ref}`}
                                    onChange={(s) => setP(key, s)}
                                  />
                                )}
                                <div className="hint" data-testid={`hole-part-${t.mark}-${g.ref}-result`}>
                                  {eff ? specSummary(eff, g.d, g.walls) : `${holeAction(g)} (détection)`}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div className="modal-foot">
          <span className="hint">{nChoices} choix</span>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose}>
            Annuler
          </button>
          {!readOnly && (
            <button className="btn small primary" data-testid="hole-specs-save" onClick={() => onSave(draft)}>
              {applyLabel ?? 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
