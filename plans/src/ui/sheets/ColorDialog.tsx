// « ＋ Couleur » : nuancier RAL (code ou nom FR / EN / DE), favoris Viewbox partagés, couleurs récentes de cet
// appareil, ou couleur libre ; finition, produit, note.
import { useEffect, useMemo, useState } from 'react';
import type { PaintColor, PaintFinish } from '../../core/paint/types';
import { PAINT_FINISHES } from '../../core/paint/types';
import { RAL_BY_CODE, searchRal } from '../../core/paint/ral';
import type { RalColor } from '../../core/paint/ral';
import { colorCode } from '../../core/paint/ops';

/** Couleur choisie, sans id ni repère (attribués par le panneau). */
export type ColorDraft = Omit<PaintColor, 'id' | 'tag' | 'createdAt' | 'by'>;

const RECENT_KEY = 'vem_paint_recent';
export function readRecent(): ColorDraft[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, 10) : [];
  } catch {
    return [];
  }
}
export function pushRecent(c: ColorDraft): void {
  try {
    const key = (x: ColorDraft) => `${x.system}|${x.code ?? ''}|${x.hex}|${x.finish ?? ''}`;
    const l = [c, ...readRecent().filter((x) => key(x) !== key(c))].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(l));
  } catch {
    /* stockage indisponible (navigation privée) */
  }
}

const fromRal = (r: RalColor, finish?: PaintFinish): ColorDraft => ({ name: r.fr, system: 'RAL', code: r.code, hex: r.hex, ...(finish ? { finish } : {}) });

export function ColorDialog({
  initial,
  favorites,
  canEditFavorites,
  onSave,
  onToggleFavorite,
  onClose,
}: {
  initial?: PaintColor;
  favorites: ColorDraft[];
  canEditFavorites: boolean;
  onSave: (c: ColorDraft) => void;
  onToggleFavorite: (c: ColorDraft, add: boolean) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'ral' | 'free'>(initial && initial.system !== 'RAL' ? 'free' : 'ral');
  const [q, setQ] = useState(initial?.system === 'RAL' ? initial.code ?? '' : '');
  const [draft, setDraft] = useState<ColorDraft | null>(initial ? { name: initial.name, system: initial.system, code: initial.code, hex: initial.hex, finish: initial.finish, product: initial.product, note: initial.note } : null);
  const [free, setFree] = useState({ name: initial?.system !== 'RAL' ? initial?.name ?? '' : '', code: initial?.system !== 'RAL' ? initial?.code ?? '' : '', hex: initial?.hex ?? '#888888' });
  const results = useMemo(() => searchRal(q, 60), [q]);
  const recent = useMemo(readRecent, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const set = (patch: Partial<ColorDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const current: ColorDraft | null = tab === 'free' ? (free.name.trim() || free.code.trim() ? { ...(draft ?? {}), name: free.name.trim() || free.code.trim(), system: 'autre', code: free.code.trim() || undefined, hex: free.hex.toUpperCase() } : null) : draft;
  const isFav = !!current && favorites.some((f) => f.system === current.system && f.code === current.code && f.hex === current.hex);
  const Swatch = ({ c, on, onClick }: { c: ColorDraft; on?: boolean; onClick: () => void }) => (
    <button className={`paint-swatch${on ? ' on' : ''}`} onClick={onClick} title={`${colorCode(c)} ${c.name}`.trim()}>
      <i style={{ background: c.hex }} />
      <span>
        <b>{colorCode(c) || c.code || ''}</b> {c.name}
        {c.finish ? ` · ${c.finish}` : ''}
      </span>
    </button>
  );
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal color-dialog" role="dialog" aria-label="Couleur" data-testid="color-dialog">
        <div className="card-head">
          <h2>{initial ? `Couleur ${initial.tag}` : '＋ Couleur'}</h2>
          <div className="spacer" />
          <button className="btn small ghost" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="modal-body color-dialog-body">
          <div className="tabs">
            <button className={`tab ${tab === 'ral' ? 'active' : ''}`} onClick={() => setTab('ral')}>
              RAL
            </button>
            <button className={`tab ${tab === 'free' ? 'active' : ''}`} onClick={() => setTab('free')}>
              Couleur libre
            </button>
          </div>
          {tab === 'ral' ? (
            <>
              <input type="text" autoFocus placeholder="Code ou nom : 9005, noir foncé, jet black, Tiefschwarz…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="ral-search" />
              {!q && !!favorites.length && (
                <>
                  <div className="group-title">⭐ Favoris Viewbox</div>
                  <div className="paint-swatches">
                    {favorites.map((f, i) => (
                      <Swatch key={`f${i}`} c={f} on={draft?.code === f.code && draft?.hex === f.hex} onClick={() => setDraft({ ...f })} />
                    ))}
                  </div>
                </>
              )}
              {!q && !!recent.length && (
                <>
                  <div className="group-title">Récentes (cet appareil)</div>
                  <div className="paint-swatches">
                    {recent.map((f, i) => (
                      <Swatch key={`r${i}`} c={f} on={draft?.code === f.code && draft?.hex === f.hex} onClick={() => setDraft({ ...f })} />
                    ))}
                  </div>
                </>
              )}
              <div className="group-title">{q ? `${results.length} couleur(s)` : 'Nuancier RAL Classic'}</div>
              <div className="paint-swatches" data-testid="ral-results">
                {results.map((r) => (
                  <Swatch key={r.code} c={fromRal(r)} on={draft?.system === 'RAL' && draft.code === r.code} onClick={() => setDraft({ ...fromRal(r, draft?.finish), product: draft?.product, note: draft?.note })} />
                ))}
              </div>
            </>
          ) : (
            <div className="form-grid compact">
              <label>Nom</label>
              <input type="text" value={free.name} onChange={(e) => setFree({ ...free, name: e.target.value })} placeholder="Noir Viewbox" />
              <label>Code</label>
              <input type="text" value={free.code} onChange={(e) => setFree({ ...free, code: e.target.value })} placeholder="référence fournisseur, NCS…" />
              <label>Écran</label>
              <input type="color" value={free.hex} onChange={(e) => setFree({ ...free, hex: e.target.value })} />
            </div>
          )}
          {current && (
            <div className="color-dialog-chosen">
              <i style={{ background: current.hex }} />
              <b>{colorCode(current)}</b> {current.name}
              {current.system === 'RAL' && current.code && RAL_BY_CODE.get(current.code) && <span className="hint"> · {RAL_BY_CODE.get(current.code)!.en} · {RAL_BY_CODE.get(current.code)!.de}</span>}
            </div>
          )}
          <div className="form-grid compact">
            <label>Finition</label>
            <select value={current?.finish ?? ''} disabled={!current} onChange={(e) => (tab === 'free' ? setDraft({ ...(current as ColorDraft), finish: (e.target.value || undefined) as PaintFinish | undefined }) : set({ finish: (e.target.value || undefined) as PaintFinish | undefined }))}>
              <option value="">—</option>
              {PAINT_FINISHES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <label>Produit</label>
            <input type="text" value={current?.product ?? ''} disabled={!current} onChange={(e) => (tab === 'free' ? setDraft({ ...(current as ColorDraft), product: e.target.value || undefined }) : set({ product: e.target.value || undefined }))} placeholder="fournisseur, gamme…" />
            <label>Note</label>
            <input type="text" value={current?.note ?? ''} disabled={!current} onChange={(e) => (tab === 'free' ? setDraft({ ...(current as ColorDraft), note: e.target.value || undefined }) : set({ note: e.target.value || undefined }))} />
          </div>
        </div>
        <div className="modal-foot">
          <label className="check" title={canEditFavorites ? 'Partagée avec tous les projets' : 'Réservé aux admins et technical managers'}>
            <input type="checkbox" disabled={!current || !canEditFavorites} checked={isFav} onChange={(e) => current && onToggleFavorite(current, e.target.checked)} /> ⭐ Favori Viewbox
          </label>
          <span className="spacer" />
          <button className="btn small" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn small primary"
            data-testid="color-ok"
            disabled={!current}
            onClick={() => {
              if (!current) return;
              pushRecent(current);
              onSave(current);
            }}
          >
            {initial ? 'Enregistrer' : 'Ajouter la couleur'}
          </button>
        </div>
      </div>
    </div>
  );
}
