// Faux backend VEM pour tester public/plans dans un vrai navigateur (outil de développement, hors production).
// Mêmes routes que src/routes/plans.ts et src/routes/structure.ts (+ projects, auth/me, settings). Données en mémoire.
//   cd plans && npm run build && E2E_FIXTURE_OUT=e2e/fixture.zip npx vitest run tests/e2e-fixture.test.ts
//   node e2e/server.mjs            (ZIP=/chemin/vers/un/export.zip pour un vrai modèle)
//   node e2e/run-sheets.mjs        (autre terminal)
// FAIL_UPLOADS=n : les n premiers envois de morceaux du paquet 3D sont refusés (comme Cloudinary > 10 Mo).
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, '..', '..', 'public');
const ZIP = process.env.ZIP ?? join(here, 'fixture.zip');
const ZIP_NAME = basename(ZIP);
const PORT = Number(process.env.PORT || 4173);
const models = new Map();
const sets = new Map();
const blobs = new Map();
// projet VEM (PATCH /projects/p1 = modification faite dans VEM, pour tester la reprise dans le cartouche)
const project = {
  id: 'p1', name: 'NVIDIA Hospitality Berlin', internalNumber: '6066RNVIDVIE', address: 'Messedamm 22', city: 'Berlin', installationStart: '2026-10-05T00:00:00Z',
  client: { name: 'Image Construction Messe- und Eventbau GmbH' },
  technicalManager: { id: 'u1', firstName: 'Amaury', lastName: 'Pinchart', email: 'amaury.pinchart@span-tech.com' },
  team: [{ role: 'sales_engineer', user: { id: 'u2', firstName: 'Norick', lastName: 'Palm', email: 'norick.palm@span-tech.com' } }],
};
let failUploads = Number(process.env.FAIL_UPLOADS || 0);
// étude structure : bibliothèque en ligne et études
const library = new Map();
const studies = new Map();
const reports = new Map();
const advisorThreads = new Map();
const advisorVariants = [];
let seqStruct = 0;
const libraryRow = (b, prev) => ({
  id: prev?.id ?? `L${++seqStruct}`, kind: b.kind, key: b.key, name: b.name, data: b.data ?? {}, source: b.source ?? null,
  keyStructRef: b.match?.structRef ?? null, keyArticle: b.match?.articleRef ?? null, keyDefinition: b.match?.definition ?? null,
  keyFingerprint: b.match?.fingerprint ?? null, keyModuleType: b.match?.moduleType ?? null, disabled: !!b.disabled,
  confirmedBy: 'u1', confirmedAt: new Date().toISOString(),
});
let saves = 0;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.rbz': 'application/zip', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };

const json = (res, data, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: status < 400, data, error: status >= 400 ? data : undefined }));
};
const body = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const list = (m) => { const { sceneIndex, ...rest } = m; return rest; };
function multipart(req, raw) {
  const boundary = '--' + req.headers['content-type'].split('boundary=')[1];
  const fields = {};
  let file = null;
  for (const chunk of raw.toString('latin1').split(boundary)) {
    const m = chunk.match(/name="([^"]+)"(; filename="[^"]*")?\r\n(?:Content-Type: [^\r]*\r\n)?\r\n([\s\S]*)\r\n$/);
    if (!m) continue;
    if (m[2]) file = Buffer.from(m[3], 'latin1');
    else fields[m[1]] = m[3];
  }
  return { fields, file };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p.startsWith('/api/v1/')) {
    if (req.headers.authorization !== 'Bearer tok') return json(res, 'Non autorisé', 401);
    const a = p.slice(7);
    if (a === '/projects/p1' && req.method === 'PATCH') { Object.assign(project, JSON.parse((await body(req)).toString())); return json(res, project); }
    if (a === '/projects/p1') return json(res, project);
    if (a === '/auth/me') return json(res, { id: 'u1', firstName: 'Amaury', lastName: 'Pinchart', role: 'technical_manager', plansAccess: true });
    if (a === '/projects/p1/files') return json(res, [{ id: 'f1', fileName: ZIP_NAME, fileUrl: '/files/model.zip', fileSize: statSync(ZIP).size, createdAt: new Date().toISOString() }]);
    if (a.startsWith('/settings/')) return json(res, null);
    if (a === '/structure/library' && req.method === 'GET') return json(res, [...library.values()]);
    if (a === '/structure/library' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      const k = `${b.kind}:${b.key}`;
      library.set(k, libraryRow(b, library.get(k)));
      return json(res, library.get(k));
    }
    if (a === '/structure/library/import' && req.method === 'POST') {
      const { entries } = JSON.parse((await body(req)).toString());
      for (const b of entries) library.set(`${b.kind}:${b.key}`, libraryRow(b, library.get(`${b.kind}:${b.key}`)));
      return json(res, { imported: entries.length });
    }
    const lib = a.match(/^\/structure\/library\/(\w+)$/);
    if (lib && req.method === 'DELETE') { for (const [k, v] of library) if (v.id === lib[1]) library.delete(k); return json(res, null); }
    if (a === '/structure/project/p1/studies' && req.method === 'GET') return json(res, [...studies.values()].reverse());
    if (a === '/structure/project/p1/studies' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      const now = new Date().toISOString();
      const st = { id: `S${++seqStruct}`, projectId: 'p1', modelVersionId: null, name: 'Étude structure', settings: {}, assignments: {}, resultsSummary: {}, status: 'draft', stale: false, createdAt: now, updatedAt: now, ...b };
      studies.set(st.id, st);
      return json(res, st);
    }
    // IA de l'étude structure : réponses simulées (le vrai serveur appelle Claude, avec contrôle des chiffres)
    const usage = { model: 'mock', inputTokens: 1200, outputTokens: 300, costUsd: 0.01, durationMs: 800 };
    if (a === '/structure/ai/status') return json(res, { enabled: process.env.AI !== '0', model: 'mock' });
    if (a === '/structure/ai/calls') return json(res, { days: 30, count: 3, costUsd: 0.03, calls: [] });
    if (a === '/structure/ai/identify' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      console.log(`[server] IA identify : ${b.type.label}, ${b.images?.length ?? 0} image(s) de ${b.images?.map((i) => i.data.length).join(' / ')} car.`);
      return json(res, { suggestion: { role: 'load', nature: 'wall', material: null, section: null, weight: { value: 50, unit: 'kg/m' }, windClosed: true, confidence: 0.72, questions: ['La paroi est-elle vitrée ?'], rationale: 'Élément plan vertical le long d’un côté : mur léger.' }, usage });
    }
    if (a === '/structure/ai/group' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      return json(res, { groups: b.types.length >= 2 ? [{ keys: b.types.slice(0, 2).map((t) => t.key), label: 'même pièce', reason: 'même catégorie et dimensions proches' }] : [], usage });
    }
    if (a === '/structure/ai/review' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      const n = b.facts?.installation?.viewbox;
      return json(res, { alerts: [{ severity: 'info', message: `Les ${n} Viewbox sont reliées ; aucune incohérence de poids relevée.`, elements: [] }], dropped: 0, usage });
    }
    if (a === '/structure/ai/write' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      const i = b.facts.installation;
      return json(res, { texts: { description: `Installation de ${i.viewbox} Viewbox sur ${i.niveaux} niveaux, rédigée par l’IA simulée.`, instructions: ['Surveiller le vent pendant l’exploitation.'], conclusion: `Conclusion de l’IA simulée : ${b.facts.verdict.resultat}.` }, attempts: 1, usage });
    }
    if (a === '/structure/ai/material-search' && req.method === 'POST') {
      return json(res, { name: 'Panneau mural', layers: [{ name: 'Nidaplast 8', material: 'PP', thicknessMm: 45, densityKgM3: 80, surfaceMassKgM2: null, url: 'https://example.com/nidaplast', title: 'Nidaplast', quote: 'densité 80 kg/m³', check: { verified: 'citation', missing: [] } }], frame: { name: 'profilé alu', kgPerM: 1.2, url: 'https://example.com/alu', title: 'alu', quote: '1,2 kg/m', check: { verified: 'quote', missing: [] } }, questions: [], notes: '', sources: [], usage });
    }
    // conseil ingénieur : conversation simulée (le vrai serveur appelle Claude ; les outils tournent dans le navigateur)
    const adv = a.match(/^\/structure\/studies\/(\w+)\/advisor$/);
    if (adv && req.method === 'GET') return json(res, advisorThreads.get(adv[1]) ?? { studyId: adv[1], messages: [], variants: [] });
    if (adv && req.method === 'PUT') { const b = JSON.parse((await body(req)).toString()); advisorThreads.set(adv[1], { studyId: adv[1], ...b }); return json(res, { updatedAt: new Date().toISOString() }); }
    if (a === '/structure/ai/advisor' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      const msgs = b.messages;
      const last = msgs[msgs.length - 1];
      const results = last.content.filter((c) => c.type === 'tool_result').map((c) => { try { return JSON.parse(c.content); } catch { return c.content; } });
      const question = [...msgs].reverse().find((m) => m.role === 'user' && m.content.some((c) => c.type === 'text'))?.content.find((c) => c.type === 'text').text ?? '';
      const tool = (name, input) => ({ type: 'tool_use', id: `tu_${++seqStruct}`, name, input });
      const say = (text) => json(res, { append: [{ role: 'assistant', content: [{ type: 'thinking', thinking: 'Je relis le calcul et je vérifie la solution par une simulation.', signature: 'x' }, { type: 'text', text }] }], stopReason: 'end_turn', unverified: [], usage });
      const call = (...uses) => json(res, { append: [{ role: 'assistant', content: [{ type: 'text', text: 'Je regarde le calcul.' }, ...uses] }], stopReason: 'tool_use', unverified: [], usage });
      console.log(`[server] conseil ingénieur : ${msgs.length} messages, ${results.length} résultat(s) d'outil`);
      if (/applique/i.test(question)) {
        if (!results.length) return call(tool('appliquer_variante', { variante: [...advisorVariants].pop(), raison: 'la variante passe' }));
        return say(results[0].appliquee ? `C’est appliqué : la variante ${results[0].variante} est maintenant l’étude.` : 'D’accord, je n’applique pas.');
      }
      if (/sol/i.test(question)) {
        if (!results.length) return call(tool('etudier_sol', { portance: { valeur: 400, unite: 'kg/m²' } }));
        const r = results[0];
        const t = r.types_appui[0];
        return say(`Avec **${r.portance.kg_m2} kg/m²** (${String(r.portance.kN_m2).replace('.', ',')} kN/m²), l’appui le plus chargé (${t.appui_le_plus_charge.appui}) pousse ${t.appui_le_plus_charge.pression_kg_m2} kg/m² sur le sol.\n- Solution : ${t.solution?.resume ?? 'aucune'}\n- Public maximal : ${r.public_maximal ? r.public_maximal.personnes : '?'} personnes`);
      }
      if (!results.length) return call(tool('etat_etude', {}), tool('diagnostic', {}));
      const diag = results.find((r) => r && r.problemes);
      if (diag) {
        const piste = diag.problemes.flatMap((p) => p.pistes).find((x) => x.simulable);
        if (!piste) return say('Tout passe déjà.');
        return call(tool('simuler_variante', { titre: piste.titre, piste: piste.piste }));
      }
      const sim = results.find((r) => r && r.variante);
      if (sim) {
        advisorVariants.push(sim.variante);
        return say(`La variante **${sim.variante}** donne : ${sim.comparaison.verdict_avant} → **${sim.comparaison.verdict_apres}**.\n- ${sim.changements.join('\n- ')}\nJe peux l’appliquer à l’étude si vous êtes d’accord.`);
      }
      return say('Je n’ai pas compris le résultat.');
    }
    // rapports PDF d'une étude
    const rps = a.match(/^\/structure\/studies\/(\w+)\/reports$/);
    if (rps && req.method === 'GET') return json(res, [...reports.values()].filter((r) => r.studyId === rps[1]).reverse());
    if (rps && req.method === 'POST') {
      const { fields, file } = multipart(req, await body(req));
      const key = 'pdf-' + blobs.size;
      blobs.set(key, { buf: file, type: 'application/pdf' });
      const r = { id: `R${++seqStruct}`, studyId: rps[1], lang: fields.lang, variant: fields.variant, verdict: fields.verdict, pages: Number(fields.pages), fileName: fields.fileName, url: '/blob/' + key, sizeBytes: file.length, createdBy: 'u1', createdAt: new Date().toISOString() };
      reports.set(r.id, r);
      console.log(`[server] rapport ${r.id} : ${r.fileName}, ${r.pages} pages, ${file.length} octets`);
      return json(res, r);
    }
    const rpd = a.match(/^\/structure\/reports\/(\w+)$/);
    if (rpd && req.method === 'DELETE') { reports.delete(rpd[1]); return json(res, null); }
    const stu = a.match(/^\/structure\/studies\/(\w+)$/);
    if (stu && req.method === 'PUT') { const st = studies.get(stu[1]); Object.assign(st, JSON.parse((await body(req)).toString()), { updatedAt: new Date().toISOString() }); return json(res, st); }
    if (stu && req.method === 'GET') return json(res, studies.get(stu[1]));
    if (a === '/plans/project/p1/models' && req.method === 'GET') return json(res, [...models.values()].map(list));
    if (a === '/plans/project/p1/models' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      const same = [...models.values()].find((x) => x.sha256 === b.sha256);
      if (same) { Object.assign(same, b, { glbUrl: null, glbParts: null, glbSize: null, glbEncoding: null, status: 'indexed', updatedAt: new Date().toISOString() }); return json(res, list(same)); }
      const id = 'm' + (models.size + 1);
      const m = { id, projectId: 'p1', ...b, settings: {}, status: 'indexed', glbUrl: null, glbSize: null, glbParts: null, glbEncoding: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      models.set(id, m);
      return json(res, list(m), 201);
    }
    const pp = a.match(/^\/plans\/models\/(\w+)\/package\/part$/);
    if (pp) {
      const { fields, file } = multipart(req, await body(req));
      if (failUploads > 0) { failUploads--; return json(res, 'File size too large. Got 13555940. Maximum is 10485760.', 400); }
      const m = models.get(pp[1]);
      const index = Number(fields.index);
      if (index === 0) m.glbParts = [];
      const key = `${pp[1]}-${Date.now()}-${index}`;
      blobs.set(key, { buf: file, type: 'application/octet-stream' });
      m.glbParts[index] = { url: '/blob/' + key, size: file.length };
      if (index === Number(fields.count) - 1) Object.assign(m, { glbUrl: m.glbParts[0].url, glbSize: Number(fields.totalSize), glbEncoding: fields.encoding, status: 'packaged' });
      return json(res, list(m));
    }
    const st = a.match(/^\/plans\/models\/(\w+)\/settings$/);
    if (st && req.method === 'PATCH') { const b = JSON.parse((await body(req)).toString()); const m = models.get(st[1]); m.settings = { ...m.settings, ...b.settings }; return json(res, { id: m.id, settings: m.settings }); }
    const gm = a.match(/^\/plans\/models\/(\w+)$/);
    if (gm && req.method === 'GET') return json(res, models.get(gm[1]));
    if (a === '/plans/project/p1/drawing-sets' && req.method === 'GET') return json(res, [...sets.values()].map(({ data, ...r }) => r));
    if (a === '/plans/project/p1/drawing-sets' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString());
      const id = 'd' + (sets.size + 1);
      const s = { id, projectId: 'p1', modelVersionId: b.modelVersionId ?? null, title: b.title, data: b.data, revision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      sets.set(id, s);
      console.log(`[server] jeu de plans ${id} : ${b.data.sheets.length} planches, ${JSON.stringify(b.data).length} octets`);
      return json(res, s, 201);
    }
    const ds = a.match(/^\/plans\/drawing-sets\/(\w+)$/);
    if (ds && req.method === 'GET') return json(res, sets.get(ds[1]));
    if (ds && req.method === 'PUT') {
      const b = JSON.parse((await body(req)).toString());
      const s = sets.get(ds[1]);
      if (b.data) s.data = b.data;
      if (b.title) s.title = b.title;
      if (Number.isInteger(b.revision)) s.revision = b.revision;
      s.updatedAt = new Date().toISOString();
      console.log(`[server] enregistrement n° ${++saves}`);
      const { data, ...r } = s;
      return json(res, r);
    }
    if (ds && req.method === 'DELETE') { sets.delete(ds[1]); return json(res, null); }
    if (a === '/plans/project/p1/assets') {
      const { file } = multipart(req, await body(req));
      const key = 'img-' + blobs.size;
      blobs.set(key, { buf: file, type: 'image/png' });
      return json(res, { url: '/blob/' + key, publicId: key });
    }
    return json(res, 'inconnu ' + a, 404);
  }
  if (p === '/files/model.zip') { res.writeHead(200, { 'Content-Length': statSync(ZIP).size }); return res.end(readFileSync(ZIP)); }
  if (p.startsWith('/blob/')) { const g = blobs.get(p.slice(6)); res.writeHead(200, { 'Content-Length': g.buf.length, 'Content-Type': g.type }); return res.end(g.buf); }
  const f = join(PUBLIC, p.endsWith('/') ? p + 'index.html' : p);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(PORT, () => console.log(`[server] http://localhost:${PORT}/plans/?projectId=p1&token=tok`));
