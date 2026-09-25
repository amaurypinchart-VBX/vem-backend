// Rapport d'analyse lisible (texte), pour corriger le fichier SketchUp.
import type { NodeInfo, SceneIndex } from './types';

const SEV = { blocking: 'BLOQUANT', warning: 'ATTENTION', info: 'INFO' } as const;

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return '—';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' Ko';
  return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
}

/** Nom affiché : désignation saisie dans SketchUp > nom d'instance d'origine > nom > définition. */
export function displayName(n: NodeInfo): string {
  return n.label || n.sourceName || n.name || n.definition || '(sans nom)';
}

/** Dimensions hors tout d'une boîte : largeur X × profondeur Z × hauteur Y, en mm. */
export function bboxDims(n: NodeInfo): string {
  if (!n.bboxMm) return '—';
  const [x0, y0, z0, x1, y1, z1] = n.bboxMm;
  return `${fmtInt(x1 - x0)} × ${fmtInt(z1 - z0)} × ${fmtInt(y1 - y0)}`;
}

export function buildTextReport(index: SceneIndex): string {
  const byId = new Map(index.nodes.map((n) => [n.id, n]));
  const L: string[] = [];
  const s = index.source;
  L.push("RAPPORT D'ANALYSE — Plans Viewbox (VEM)");
  L.push('='.repeat(60));
  L.push(`Fichier       : ${s.fileName} (${fmtInt(s.sizeBytes / 1024)} Ko)`);
  L.push(`SHA-256       : ${s.sha256}`);
  L.push(`Analysé le    : ${new Date(index.createdAt).toLocaleString('fr-FR')} (moteur ${index.engineVersion})`);
  L.push(`Unités        : ${s.unitName || '?'} (1 unité = ${s.unitMeter} m) · axe vertical ${s.upAxis}`);
  L.push(`manifest.json : ${s.hasManifest ? 'oui' : 'non'} · arêtes SketchUp : ${s.hasEdges ? 'oui' : 'non'}`);
  const st = index.stats;
  L.push(
    `Résumé        : ${st.modules} Viewbox · ${st.levels} niveau(x) · ${st.items} objets · ${st.unclassified} non classé(s) · ${fmtInt(st.triangles)} triangles · ${(st.durationMs / 1000).toFixed(1)} s`,
  );
  L.push('');
  L.push('AVERTISSEMENTS');
  L.push('-'.repeat(60));
  if (!index.warnings.length) L.push('Aucun.');
  for (const w of index.warnings) {
    L.push(`[${SEV[w.severity]}] ${w.message}`);
    if (w.nodeIds?.length) {
      const names = w.nodeIds.slice(0, 30).map((id) => {
        const n = byId.get(id);
        return n ? `${displayName(n)}${n.moduleId ? ` (${n.moduleId})` : ''}` : id;
      });
      L.push(`    → ${names.join(', ')}${w.nodeIds.length > 30 ? ` … (+${w.nodeIds.length - 30})` : ''}`);
    }
  }
  L.push('');
  L.push('VIEWBOX');
  L.push('-'.repeat(60));
  for (const lv of index.levels) {
    L.push(`Niveau ${lv.level} — ${lv.label}`);
    for (const mid of lv.moduleIds) {
      const m = index.modules.find((x) => x.id === mid);
      if (!m) continue;
      L.push(
        `  ${m.id.padEnd(8)} ${fmtInt(m.planDimsMm[0])} × ${fmtInt(m.planDimsMm[1])} mm ${m.dimsOk ? '✓' : '✗'} (attendu ${m.expected.long} × ${m.expected.short}, ${m.expected.label}) · h ${fmtInt(m.heightMm)} mm · ${m.itemIds.length} objets${m.type ? ` · type « ${m.type} »` : ''}${m.detectedBy === 'dimensions' ? ' (détecté par ses dimensions)' : ''}`,
      );
      for (const id of m.itemIds) {
        const n = byId.get(id);
        if (!n) continue;
        L.push(
          `      - ${(n.category ?? 'NON CLASSÉ').padEnd(18)} ${displayName(n)}${n.definition && n.definition !== displayName(n) ? ` — ${n.definition}` : ''}${n.articleRef ? ` [${n.articleRef}]` : ''}${n.categorySource === 'manifest' ? ' (choisi dans SketchUp)' : ''}${n.assignment === 'spatial' ? ' (rattaché par sa position)' : ''}`,
        );
      }
    }
  }
  L.push('');
  L.push('ÉLÉMENTS COMMUNS');
  L.push('-'.repeat(60));
  if (!index.commonIds.length) L.push('Aucun.');
  for (const id of index.commonIds) {
    const n = byId.get(id);
    if (n) L.push(`  - ${(n.category ?? 'NON CLASSÉ').padEnd(18)} ${displayName(n)} · ${bboxDims(n)} mm`);
  }
  L.push('');
  L.push(`CONTEXTE IGNORÉ : ${index.contextIds.map((id) => byId.get(id)?.name ?? id).join(', ') || 'aucun'}`);
  return L.join('\n');
}
