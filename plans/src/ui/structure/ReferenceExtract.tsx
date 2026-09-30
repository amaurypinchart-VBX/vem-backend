// Réglages › Bibliothèque structure › « Lire un document de référence (IA) » : l'IA recopie les sections et les
// capacités d'assemblages d'une note de calcul ou d'une fiche technique (PDF), avec la page ; l'outil recalcule chaque
// section depuis ses dimensions et la compare aux valeurs imprimées, vérifie que les valeurs figurent dans le document,
// et l'utilisateur choisit ce qu'il importe (entrées « proposées », source = report:<n°>).
import { useMemo, useState } from 'react';
import type { ExtractResult } from '../../structure/core/ai';
import { connectionFromExtract, sectionFromExtract } from '../../structure/core/ai';
import { toPayload } from '../../structure/core/libraryStore';
import { fmtNumber } from '../../structure/core/units';
import type { AiUsage } from '../../api/vem';
import { vem } from '../../api/vem';
import { AiUsageNote } from './aiUi';

const VERIFIED: Record<string, { text: string; color: string }> = {
  citation: { text: 'valeurs retrouvées dans le document', color: 'var(--ok)' },
  quote: { text: 'valeurs dans l’extrait recopié par l’IA (à vérifier)', color: 'var(--warn)' },
  no: { text: 'valeurs NON retrouvées dans le document', color: 'var(--danger)' },
};

const MAX_MB = 20;

export function ReferenceExtract({ onImported }: { onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<(ExtractResult & { usage: AiUsage }) | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const reportRef = ref.trim() || result?.document.reference || file?.name.replace(/\.pdf$/i, '') || 'document';
  const sections = useMemo(() => (result?.sections ?? []).map((x, k) => ({ id: `s${k}`, x, r: sectionFromExtract(x, reportRef) })), [result, reportRef]);
  const connections = useMemo(() => (result?.connections ?? []).map((x, k) => ({ id: `c${k}`, x, entry: connectionFromExtract(x, reportRef) })), [result, reportRef]);

  const read = async () => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`PDF de ${(file.size / 1e6).toFixed(1)} Mo : plus de ${MAX_MB} Mo. N’envoyer que les pages utiles (par exemple l’annexe de calcul, imprimée en PDF).`);
      return;
    }
    setBusy('L’IA lit le document… (une à plusieurs minutes selon le nombre de pages)');
    setError('');
    setResult(null);
    try {
      const r = await vem.aiExtract(file, ref.trim() || file.name.replace(/\.pdf$/i, ''), hint);
      setResult(r);
      // cochées d'office : valeurs retrouvées dans le document et section recalculée sans écart
      const ok = new Set<string>();
      r.sections.forEach((x, k) => {
        const s = sectionFromExtract(x, ref.trim() || r.document.reference || 'document');
        if (x.check.verified === 'citation' && s.entry && s.computed && !s.problems.length) ok.add(`s${k}`);
      });
      r.connections.forEach((x, k) => x.check.verified === 'citation' && ok.add(`c${k}`));
      setPicked(ok);
    } catch (e) {
      setError(`IA : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const importPicked = async () => {
    setBusy('Import…');
    setError('');
    try {
      for (const s of sections) if (picked.has(s.id) && s.r.entry) await vem.saveLibraryEntry(toPayload(s.r.entry, `report:${reportRef}`));
      for (const c of connections) if (picked.has(c.id)) await vem.saveLibraryEntry(toPayload(c.entry, `report:${reportRef}`));
      await onImported();
      setResult(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  };
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="card">
      <div className="card-head">
        <h3>Lire un document de référence (IA)</h3>
        <div className="spacer" style={{ flex: 1 }} />
        {result && <AiUsageNote usage={result.usage} />}
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="hint">
          Note de calcul ou fiche technique en PDF (≤ {MAX_MB} Mo) : l’IA recopie les sections de barres et les capacités d’assemblages avec leur page. L’outil
          recalcule chaque section à partir de ses dimensions et la compare aux valeurs du document ; vous choisissez ce qui entre dans la bibliothèque (entrées
          « à vérifier »). Aucun calcul n’utilise une entrée tant que vous ne l’avez pas choisie pour une pièce.
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input type="text" placeholder="n° du document (ex. 24-0571)" value={ref} onChange={(e) => setRef(e.target.value)} style={{ width: 200 }} />
          <input type="text" placeholder="indication (ex. annexe SCIA pages B1–B40)" value={hint} onChange={(e) => setHint(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button className="btn small primary" disabled={!file || !!busy} onClick={() => void read()}>
            Lire le document
          </button>
        </div>
        {busy && <div className="hint">{busy}</div>}
        {error && <div className="error-box">{error}</div>}
        {result && (
          <>
            <div className="hint">
              {result.document.title} {result.document.reference && `(${result.document.reference})`} — {result.sections.length} section(s), {result.connections.length} assemblage(s),{' '}
              {result.citations} citation(s) du document.
            </div>
            {sections.length > 0 && (
              <table className="list">
                <thead>
                  <tr>
                    <th />
                    <th>Section</th>
                    <th>Page</th>
                    <th>Contrôle</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(({ id, x, r }) => (
                    <tr key={id}>
                      <td>
                        <input type="checkbox" disabled={!r.entry} checked={picked.has(id)} onChange={() => toggle(id)} />
                      </td>
                      <td>
                        <b>{x.designation}</b> {x.role && <span className="hint">— {x.role}</span>}
                        <div className="hint">
                          {x.material ?? 'nuance ?'} · A {x.values.A ?? '—'} cm² · Iy {x.values.Iy ?? '—'} · Iz {x.values.Iz ?? '—'} cm⁴
                        </div>
                      </td>
                      <td>{x.page}</td>
                      <td>
                        <div className="hint" style={{ color: VERIFIED[x.check.verified].color }} title={x.quote}>
                          {VERIFIED[x.check.verified].text}
                        </div>
                        {r.comparisons.length > 0 && (
                          <div className="hint">
                            recalcul : {r.comparisons.map((c) => `${c.prop} ${c.deviation >= 0 ? '+' : ''}${fmtNumber(c.deviation * 100, 1)} %`).join(' · ')}
                          </div>
                        )}
                        {r.problems.map((p, k) => (
                          <div key={k} className="hint" style={{ color: 'var(--warn)' }}>
                            ⚠ {p}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {connections.length > 0 && (
              <table className="list">
                <thead>
                  <tr>
                    <th />
                    <th>Assemblage</th>
                    <th>Page</th>
                    <th>Contrôle</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map(({ id, x }) => (
                    <tr key={id}>
                      <td>
                        <input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)} />
                      </td>
                      <td>
                        <b>{x.name}</b>
                        <div className="hint">{x.composition}</div>
                        <div className="hint">{x.capacities.map((c) => `${c.label} = ${fmtNumber(c.value, 2)} ${c.unit}`).join(' · ')}</div>
                      </td>
                      <td>{x.page}</td>
                      <td className="hint" style={{ color: VERIFIED[x.check.verified].color }} title={x.quote}>
                        {VERIFIED[x.check.verified].text}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row">
              <button className="btn small primary" disabled={!picked.size || !!busy} onClick={() => void importPicked()}>
                Importer la sélection ({picked.size})
              </button>
              <span className="hint">Entrées importées « à vérifier », source report:{reportRef}.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
