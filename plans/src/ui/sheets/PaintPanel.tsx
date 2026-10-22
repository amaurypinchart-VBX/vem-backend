// Panneau « 🎨 Peinture du projet » (outil Peinture de l'éditeur de planches) : couleurs du projet, outils pinceau /
// pipette / gomme, zones peintes par couleur (surface, ⚠ sans effet), affichage sur les vues, légende.
import { useState } from 'react';
import type { PaintColor, PaintSettings } from '../../core/paint/types';
import { colorCode } from '../../core/paint/ops';
import type { PaintedScene } from '../../linework/paintScene';

export type PaintMode = 'brush' | 'pipette' | 'eraser';

const m2 = (v: number) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

export function PaintPanel({
  paint,
  painted,
  active,
  mode,
  saving,
  error,
  disabled,
  selectedZone,
  onActive,
  onMode,
  onNewColor,
  onEditColor,
  onReplace,
  onDeleteColor,
  onDeleteZone,
  onSelectZone,
  onDisplayAll,
  onAddLegend,
  onExcel,
  onClose,
}: {
  paint: PaintSettings;
  painted: PaintedScene | null;
  active: string | null;
  mode: PaintMode;
  saving: boolean;
  error: string;
  disabled: boolean;
  selectedZone: string | null;
  onActive: (id: string) => void;
  onMode: (m: PaintMode) => void;
  onNewColor: () => void;
  onEditColor: (c: PaintColor) => void;
  onReplace: (from: string, to: string) => void;
  onDeleteColor: (c: PaintColor) => void;
  onDeleteZone: (id: string) => void;
  onSelectZone: (id: string | null) => void;
  onDisplayAll: (mode: 'marks' | 'fill' | 'off') => void;
  onExcel: () => void;
  onAddLegend: () => void;
  onClose: () => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const zonesOf = (c: PaintColor) => paint.zones.filter((z) => z.colorId === c.id);
  return (
    <aside className="sheet-props paint-panel" data-testid="paint-panel">
      <div className="tabs" style={{ alignItems: 'center' }}>
        <b style={{ padding: '0 6px' }}>🎨 Peinture du projet</b>
        <span className="spacer" />
        <button className="btn small ghost" onClick={onClose} aria-label="Fermer la peinture">
          ✕
        </button>
      </div>
      <div className="sheet-props-body">
        {disabled && <div className="error-box">Modèle pas encore enregistré : la peinture ne peut pas être gardée.</div>}
        {error && <div className="error-box">{error}</div>}
        <div className="paint-modes">
          {(
            [
              ['brush', '🖌 Pinceau', 'Tape une face d’une vue pour la peindre'],
              ['pipette', '💧 Pipette', 'Tape une zone peinte : sa couleur devient la couleur active'],
              ['eraser', '⌫ Gomme', 'Tape une face peinte : sa peinture est retirée'],
            ] as const
          ).map(([m, label, title]) => (
            <button key={m} className={`btn small${mode === m ? ' primary' : ''}`} data-testid={`paint-mode-${m}`} title={title} onClick={() => onMode(m)}>
              {label}
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="prop-title">Couleurs</span>
          <button className="btn small" data-testid="paint-new-color" disabled={disabled} onClick={onNewColor}>
            ＋ Couleur
          </button>
        </div>
        {!paint.colors.length && <div className="hint">Aucune couleur — « ＋ Couleur » pour commencer.</div>}
        <div className="paint-colors">
          {paint.colors.map((c) => {
            const zones = zonesOf(c);
            return (
              <div key={c.id} className={`paint-color${active === c.id ? ' on' : ''}`}>
                <button className="paint-color-main" data-testid={`paint-color-${c.tag}`} onClick={() => onActive(c.id)} title="Couleur active">
                  <i style={{ background: c.hex }} />
                  <b>{c.tag}</b>
                  <span className="nm">
                    {colorCode(c)} {c.name !== colorCode(c) ? c.name : ''}
                    {c.finish ? ` · ${c.finish}` : ''}
                  </span>
                  <span className="meta">
                    {zones.length} zone{zones.length > 1 ? 's' : ''} · {m2(painted?.areaByColor.get(c.id) ?? 0)}
                  </span>
                </button>
                <button className="btn small ghost" onClick={() => setMenu(menu === c.id ? null : c.id)} aria-label={`Actions ${c.tag}`}>
                  ⋯
                </button>
                {menu === c.id && (
                  <div className="paint-color-menu">
                    <button className="btn small" onClick={() => (setMenu(null), onEditColor(c))}>
                      ✎ Modifier
                    </button>
                    {paint.colors.length > 1 && (
                      <select
                        value=""
                        onChange={(e) => {
                          setMenu(null);
                          if (e.target.value) onReplace(c.id, e.target.value);
                        }}
                      >
                        <option value="">Remplacer {c.tag} partout par…</option>
                        {paint.colors
                          .filter((x) => x.id !== c.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.tag} · {colorCode(x)} {x.name}
                            </option>
                          ))}
                      </select>
                    )}
                    <button className="btn small danger" onClick={() => (setMenu(null), onDeleteColor(c))}>
                      🗑 Supprimer
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!!paint.zones.length && (
          <>
            <div className="prop-title" style={{ marginTop: 6 }}>
              Zones peintes
            </div>
            <div className="paint-zones">
              {paint.colors.map((c) =>
                zonesOf(c).map((z) => {
                  const dead = painted?.noEffect.has(z.id);
                  return (
                    <div key={z.id} className={`paint-zone${selectedZone === z.id ? ' on' : ''}${dead ? ' dead' : ''}`}>
                      <button className="paint-zone-main" onClick={() => onSelectZone(selectedZone === z.id ? null : z.id)} title={dead ? 'Cette zone ne touche plus rien (modèle changé)' : 'Montrer la zone'}>
                        <i style={{ background: c.hex }} />
                        <span className="nm">
                          {dead && '⚠ '}
                          {z.label}
                        </span>
                        <span className="meta">{dead ? 'sans effet' : m2(painted?.areaByZone.get(z.id) ?? 0)}</span>
                      </button>
                      <button className="btn small ghost" onClick={() => onDeleteZone(z.id)} aria-label="Retirer la zone">
                        ✕
                      </button>
                    </div>
                  );
                }),
              )}
            </div>
          </>
        )}
        <div className="prop-field" style={{ marginTop: 8 }}>
          <span>Peinture sur toutes les vues du jeu</span>
          <div className="row">
            <button className="btn small" onClick={() => onDisplayAll('marks')}>
              Repères
            </button>
            <button className="btn small" data-testid="paint-display-fill" onClick={() => onDisplayAll('fill')} title="Hachures fines dans la couleur, sous les traits, en plus des repères">
              Couleurs
            </button>
            <button className="btn small" onClick={() => onDisplayAll('off')}>
              Rien
            </button>
          </div>
        </div>
        <button className="btn small" onClick={onAddLegend}>
          ＋ Légende « PAINTING » sur la planche
        </button>
        <button className="btn small" disabled={!paint.colors.length} onClick={onExcel} data-testid="paint-excel">
          ⬇ Liste peinture (Excel)
        </button>
        <div className="hint">
          {saving ? 'Enregistrement…' : 'Enregistré avec le modèle, repris à la version suivante.'} Ctrl+Z / ↶ annule la dernière action de peinture tant que l’outil est ouvert.
        </div>
      </div>
    </aside>
  );
}
