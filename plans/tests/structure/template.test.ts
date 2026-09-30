// Gabarit Viewbox 5900 EU : nœuds, barres, sections et liaisons identiques à une Viewbox du modèle SCIA de la note
// statico 24-0571 (Hoka). Le modèle SCIA (extrait de l'annexe du PDF, non versionné) est lu s'il est présent :
// plans/reference-reports/extract/hoka-model.json, ou VEM_REFS=<dossier>.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { viewboxTemplate } from '../../src/structure/core/templates/viewboxEU';
import { SEED_MODULES } from '../../src/structure/library/seed';

const params = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!.params!;
const tpl = viewboxTemplate(params);

const candidates = [process.env.VEM_REFS, join(__dirname, '../../reference-reports/extract'), '/workspaces/vem-backend/plans/reference-reports/extract']
  .filter((x): x is string => !!x)
  .map((d) => join(d, 'hoka-model.json'));
const scia = candidates.find((f) => existsSync(f));

describe('gabarit Viewbox 5900 EU', () => {
  it('structure du gabarit', () => {
    const count = (f: string) => tpl.members.filter((m) => m.family === f).length;
    // rives : plancher avec attaches de pieds (plus de nœuds) ; poteaux, réceptions
    expect(count('column')).toBe(4);
    expect(count('foot-corner')).toBe(4);
    expect(count('foot-plate')).toBe(8);
    expect(count('foot-middle')).toBe(2);
    expect(tpl.panels).toHaveLength(30);
    expect(tpl.faces.map((f) => f.bolts.length)).toEqual([2, 2, 4, 4]);
    // poteaux semi-rigides 3 500 kNcm/deg aux deux bouts
    const col = tpl.members.find((m) => m.family === 'column')!;
    expect(col.endI![4]).toBeCloseTo(2.0054e9, -6);
    expect(col.endJ![5]).toBe(col.endI![5]);
    // longueurs totales (m) : rives 2 × 16,76 ; traverses 4 × 2,49 + lisses 2 × 5,89 par niveau
    const len = (f: string) =>
      tpl.members
        .filter((m) => m.family === f)
        .reduce((s, m) => {
          const a = tpl.nodes.find((n) => n.key === m.i)!;
          const b = tpl.nodes.find((n) => n.key === m.j)!;
          return s + Math.hypot(a.u - b.u, a.v - b.v, a.z - b.z);
        }, 0) / 1000;
    expect(len('rim-floor')).toBeCloseTo(16.76, 6);
    expect(len('rim-roof')).toBeCloseTo(16.76, 6);
    expect(len('secondary-floor')).toBeCloseTo(4 * 2.49 + 2 * 5.89, 6);
  });

  it.skipIf(!scia)('identique à une Viewbox du modèle SCIA statico (Hoka, annexe B)', () => {
    const M = JSON.parse(readFileSync(scia!, 'utf8')) as {
      nodes: Record<string, [number, number, number]>;
      members: Record<string, { family: string; section: string; i: string; j: string; length: number }>;
      hinges: Array<{ member: string; at: string; dofs: Array<string | number | null> }>;
    };
    const inBox = (p: [number, number, number]) => p[0] >= 0.004 && p[0] <= 5.896 && p[1] >= 0.004 && p[1] <= 2.496 && (p[2] === 0 || p[2] === 2.79);
    const sciaNodes = new Set(
      Object.values(M.nodes)
        .filter(inBox)
        .map((p) => `${Math.round(p[0] * 1000)}:${Math.round(p[1] * 1000)}:${Math.round(p[2] * 1000)}`),
    );
    // nœuds d'une Viewbox dans SCIA ⊂ nœuds du gabarit ; le gabarit n'en a pas d'autres sur la structure
    const ours = new Set(tpl.nodes.map((n) => n.key));
    const missing = [...sciaNodes].filter((k) => !ours.has(k));
    expect(missing).toEqual([]);
    // en plus dans le gabarit : seulement des nœuds de boulons et de contacts verticaux (SCIA ne les crée que côté voisin)
    const bolts = new Set(tpl.faces.flatMap((f) => [...f.bolts, ...f.contacts].flatMap((b) => [b.floor, b.roof])));
    const extra = [...ours].filter((k) => !sciaNodes.has(k));
    expect(extra.every((k) => bolts.has(k))).toBe(true);
    // familles et sections des barres de cette Viewbox
    const fam: Record<string, string> = {
      Randträger: 'UNP220',
      Deckenträger: 'RRO120X60X4',
      Bodenträger: 'RRO120X60X4',
      Stütze: 'QRO100X5',
    };
    const box = Object.entries(M.members).filter(([, m]) => M.nodes[m.i] && M.nodes[m.j] && inBox(M.nodes[m.i]) && inBox(M.nodes[m.j]));
    const lenOf = (f: string) => box.filter(([, m]) => m.family === f).reduce((s, [, m]) => s + m.length, 0);
    for (const f of Object.keys(fam)) expect(box.filter(([, m]) => m.family === f).every(([, m]) => m.section.startsWith(fam[f]))).toBe(true);
    const ourLen = (fs: string[]) =>
      tpl.members
        .filter((m) => fs.includes(m.family))
        .reduce((s, m) => {
          const a = tpl.nodes.find((n) => n.key === m.i)!;
          const b = tpl.nodes.find((n) => n.key === m.j)!;
          return s + Math.hypot(a.u - b.u, a.v - b.v, a.z - b.z) / 1000;
        }, 0);
    expect(ourLen(['rim-floor', 'rim-roof'])).toBeCloseTo(lenOf('Randträger'), 2);
    expect(ourLen(['secondary-roof'])).toBeCloseTo(lenOf('Deckenträger'), 2);
    expect(ourLen(['secondary-floor'])).toBeCloseTo(lenOf('Bodenträger'), 2);
    expect(ourLen(['column'])).toBeCloseTo(lenOf('Stütze'), 3);
    expect(ourLen(['foot-corner'])).toBeCloseTo(lenOf('Fußaufnahme_Ecke'), 2);
    expect(ourLen(['foot-plate'])).toBeCloseTo(lenOf('Fußaufnahme_Plattenersatz'), 2);
    expect(ourLen(['foot-middle'])).toBeCloseTo(lenOf('Fußaufnahme_mitte'), 2);
    // liaisons des poteaux : ressorts de rotation 3 500 kNcm/deg aux deux bouts, comme dans SCIA
    const colHinges = M.hinges.filter((h) => box.some(([b, m]) => b === h.member && m.family === 'Stütze'));
    expect(colHinges.length).toBe(4);
    for (const h of colHinges) {
      expect(h.at).toBe('Beide');
      expect(h.dofs.slice(4)).toEqual([3500, 3500]);
    }
  });
});
