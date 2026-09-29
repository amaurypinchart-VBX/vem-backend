// Réglages › Bibliothèque structure : ce que l'étude structure « sait », partagé entre tous les projets (base de
// départ du module + entrées confirmées ou modifiées en ligne). Recherche, détail, désactivation, suppression,
// modification des données (JSON), export / import. Écriture : admin, responsable technique, ingénieur.
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { LibraryEntry, LibraryKind, PartTypeEntry } from '../../structure/core/library';
import { NATURE_LABEL, ROLE_LABEL } from '../../structure/core/library';
import type { ServerLibraryRow } from '../../structure/core/libraryStore';
import { mergeLibrary, toPayload } from '../../structure/core/libraryStore';
import { SEED } from '../../structure/library/seed';
import type { VemUser } from '../../api/vem';
import { vem } from '../../api/vem';
import { downloadText } from '../common';

const KIND_LABEL: Record<LibraryKind, string> = {
  module_type: 'Gabarits de modules',
  part_type: 'Types de pièces',
  material: 'Matériaux',
  section: 'Sections',
  connection: 'Assemblages',
  spreading: 'Matériaux de calage',
  stock: 'Stock',
};
const ORIGIN_LABEL = { seed: 'base de départ', override: 'base modifiée', user: 'ajoutée' } as const;
const EDITORS = ['admin', 'technical_manager', 'engineer'];

function summary(e: LibraryEntry): string {
  if (e.kind === 'part_type') {
    const a = (e as PartTypeEntry).assignment;
    if (!a) return '';
    return [ROLE_LABEL[a.role], NATURE_LABEL[a.nature], a.moduleTemplate, a.section, a.weight ? `${a.weight.value} ${a.weight.unit}` : '']
      .filter(Boolean)
      .join(' · ');
  }
  if (e.kind === 'section') return `A = ${(e.section.A / 100).toFixed(2).replace('.', ',')} cm² · ${e.material}`;
  if (e.kind === 'connection') return e.capacities.map((c) => c.label).slice(0, 3).join(' · ');
  if (e.kind === 'module_type') return `${e.nominal.long} × ${e.nominal.short} mm${e.template ? '' : ' — données inconnues'}`;
  return '';
}

export function LibraryPage() {
  const [rows, setRows] = useState<ServerLibraryRow[]>([]);
  const [me, setMe] = useState<VemUser | null>(null);
  const [kind, setKind] = useState<LibraryKind | ''>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ key: string; text: string } | null>(null);
  const [msg, setMsg] = useState('');
  const refresh = () =>
    vem
      .structureLibrary()
      .then(setRows)
      .catch((e: Error) => setMsg(`✗ Bibliothèque en ligne indisponible : ${e.message}`));
  useEffect(() => {
    void refresh();
    vem.me().then(setMe).catch(() => {});
  }, []);
  const canEdit = EDITORS.includes(me?.role ?? '');
  const all = useMemo(() => mergeLibrary(SEED, rows), [rows]);
  const list = all.filter((e) => (!kind || e.kind === kind) && (!q || `${e.name} ${e.key} ${summary(e)}`.toLowerCase().includes(q.toLowerCase())));
  const id = (e: LibraryEntry) => `${e.kind}:${e.key}`;

  const run = async (label: string, f: () => Promise<unknown>) => {
    try {
      await f();
      await refresh();
      setMsg(`✓ ${label}`);
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    }
  };
  const importFile = async (file: File) => {
    const parsed = JSON.parse(await file.text()) as { entries?: LibraryEntry[] };
    if (!Array.isArray(parsed.entries)) throw new Error('Fichier sans « entries »');
    await vem.importLibrary(parsed.entries.map((e) => toPayload(e, 'import')));
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-head">
          <h2>Bibliothèque structure</h2>
          <span className="hint">
            Partagée entre tous les projets. Ce qui est confirmé ici n’est plus jamais redemandé.{canEdit ? '' : ' Lecture seule (modification : admin, responsable technique, ingénieur).'}
          </span>
        </div>
        <div className="card-body row">
          <select value={kind} style={{ width: 220 }} onChange={(e) => setKind(e.target.value as LibraryKind | '')}>
            <option value="">Tous les genres ({all.length})</option>
            {(Object.keys(KIND_LABEL) as LibraryKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]} ({all.filter((e) => e.kind === k).length})
              </option>
            ))}
          </select>
          <input type="text" style={{ width: 260 }} placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="spacer" style={{ flex: 1 }} />
          {msg && <span className="hint">{msg}</span>}
          <button className="btn small" onClick={() => downloadText('bibliotheque-structure.json', JSON.stringify({ entries: all }, null, 2), 'application/json')}>
            ⬇ Exporter
          </button>
          {canEdit && (
            <label className="btn small">
              ⬆ Importer
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void run('Import terminé', () => importFile(f));
                }}
              />
            </label>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <table className="list">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Genre</th>
                <th>Contenu</th>
                <th>Statut</th>
                <th>Origine</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <Fragment key={id(e)}>
                  <tr style={{ opacity: e.disabled ? 0.5 : 1 }}>
                    <td>
                      <button className="btn ghost small" onClick={() => setOpen(open === id(e) ? null : id(e))}>
                        {open === id(e) ? '▾' : '▸'} {e.name}
                      </button>
                    </td>
                    <td className="hint">{KIND_LABEL[e.kind]}</td>
                    <td className="hint">{summary(e)}</td>
                    <td>
                      <span className={`badge ${e.disabled ? '' : e.status === 'known' ? 'ok' : e.status === 'unknown' ? 'ko' : 'orange'}`}>
                        {e.disabled ? 'désactivée' : e.status === 'known' ? 'connue' : e.status === 'unknown' ? 'inconnue' : 'à vérifier'}
                      </span>
                    </td>
                    <td className="hint">{ORIGIN_LABEL[e.origin ?? 'seed']}</td>
                    <td className="actions">
                      {canEdit && (
                        <>
                          <button className="btn small ghost" onClick={() => setEdit({ key: id(e), text: JSON.stringify(toPayload(e).data, null, 2) })}>
                            Modifier
                          </button>
                          <button className="btn small ghost" onClick={() => void run(e.disabled ? 'Réactivée' : 'Désactivée', () => vem.saveLibraryEntry({ ...toPayload(e), disabled: !e.disabled }))}>
                            {e.disabled ? 'Réactiver' : 'Désactiver'}
                          </button>
                          {e.id && (
                            <button
                              className="btn small ghost"
                              title={e.origin === 'override' ? 'Revenir à la base de départ' : 'Supprimer'}
                              onClick={() => {
                                if (window.confirm(e.origin === 'override' ? `Revenir à la base de départ pour « ${e.name} » ?` : `Supprimer « ${e.name} » ?`))
                                  void run('Supprimée', () => vem.deleteLibraryEntry(e.id!));
                              }}
                            >
                              {e.origin === 'override' ? '↺ Base' : '✕'}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                  {open === id(e) && (
                    <tr>
                      <td colSpan={6}>
                        <div className="hint">
                          Clé {e.key}
                          {e.match && Object.keys(e.match).length ? ` · reconnue par ${Object.entries(e.match).map(([k, v]) => `${k} = ${v}`).join(' ; ')}` : ''}
                          {' · '}Sources : {e.source.map((s) => [s.ref, s.page, s.note].filter(Boolean).join(' ')).join(' ; ')}
                        </div>
                        <pre style={{ fontSize: 11, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(toPayload(e).data, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                  {edit?.key === id(e) && (
                    <tr>
                      <td colSpan={6}>
                        <textarea className="mono" rows={14} value={edit.text} onChange={(ev) => setEdit({ key: edit.key, text: ev.target.value })} />
                        <div className="row" style={{ marginTop: 6 }}>
                          <button
                            className="btn primary small"
                            onClick={() =>
                              void run('Enregistrée', async () => {
                                const data = JSON.parse(edit.text) as Record<string, unknown>;
                                await vem.saveLibraryEntry({ ...toPayload(e), data });
                                setEdit(null);
                              })
                            }
                          >
                            Enregistrer
                          </button>
                          <button className="btn small ghost" onClick={() => setEdit(null)}>
                            Annuler
                          </button>
                          <span className="hint">Unités internes : N, mm, N/mm². Une entrée de la base de départ modifiée ici n’est plus remplacée par les mises à jour du module.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
