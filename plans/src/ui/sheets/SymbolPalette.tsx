// Palette des symboles d'équipement (outil « ⚡ Symboles » de l'éditeur de planches) : choisir un symbole, puis cliquer
// sur la planche autant de fois que nécessaire (Échap pour finir). Quantités posées dans tout le jeu, pour la commande.
import { useMemo, useState } from 'react';
import type { DrawingSet, Sheet, SymbolItem } from '../../sheets/types';
import { SYMBOLS, SYMBOL_FAMILIES, symbolCounts } from '../../sheets/symbols';
import { SymbolIcon } from '../../sheets/SheetSvg';

export function SymbolPalette({ doc, sheet, current, onPick, onAddLegend, onClose }: { doc: DrawingSet; sheet: Sheet; current: string; onPick: (key: string) => void; onAddLegend: () => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const norm = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const shown = SYMBOLS.filter((s) => !q.trim() || norm(`${s.label.fr} ${s.label.en} ${s.key}`).includes(norm(q.trim())));
  const totals = useMemo(() => symbolCounts(doc.sheets.flatMap((s) => s.items.filter((i): i is SymbolItem => i.type === 'symbol').map((i) => i.symbol))), [doc]);
  const hasLegend = sheet.items.some((i) => i.type === 'symbolLegend');
  return (
    <aside className="sheet-props symbol-palette" data-testid="symbol-palette">
      <div className="tabs">
        <span className="tab active">⚡ Symboles</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onClose} title="Terminer (Échap)">
          ✕
        </button>
      </div>
      <div className="sheet-props-body">
        <div className="hint" style={{ marginBottom: 6 }}>
          Choisis un symbole puis clique sur la planche (autant de fois que nécessaire). Sur une vue, un symbole mural se tourne tout seul vers le mur le plus proche et un symbole
          linéaire se pose le long du trait. Échap pour finir.
        </div>
        <input type="search" placeholder="Rechercher (prise, spot, RJ45…)" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        {SYMBOL_FAMILIES.map((f) => {
          const list = shown.filter((s) => s.family === f.key);
          if (!list.length) return null;
          return (
            <div key={f.key} className="symbol-family">
              <div className="symbol-family-title" style={{ color: f.color }}>
                {f.label.fr}
              </div>
              <div className="symbol-grid">
                {list.map((s) => (
                  <button key={s.key} className={`symbol-btn${s.key === current ? ' on' : ''}`} title={`${s.label.fr}${s.wall ? ' — mural' : ''}${s.linear ? ' — linéaire' : ''}`} data-symbol={s.key} onClick={() => onPick(s.key)}>
                    <SymbolIcon symbol={s.key} px={30} />
                    <span>{s.label.fr}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div className="row" style={{ gap: 6, margin: '10px 0' }}>
          <button className="btn small" disabled={hasLegend} onClick={onAddLegend} title="Légende comptée des symboles de cette planche (ajoutée automatiquement au premier symbole posé)">
            ＋ Légende sur cette planche
          </button>
        </div>
        {!!totals.length && (
          <div className="symbol-totals">
            <div className="symbol-family-title">Quantités posées dans le jeu</div>
            <table className="list">
              <tbody>
                {totals.map(({ def, count }) => (
                  <tr key={def.key}>
                    <td style={{ width: 28 }}>
                      <SymbolIcon symbol={def.key} px={20} />
                    </td>
                    <td>{def.label.fr}</td>
                    <td style={{ textAlign: 'right' }}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  );
}
