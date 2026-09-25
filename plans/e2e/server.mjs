// Faux backend VEM pour tester public/plans dans un vrai navigateur (outil de développement, hors production).
// Mêmes routes que src/routes/plans.ts (+ projects, auth/me, settings). Données en mémoire.
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
let failUploads = Number(process.env.FAIL_UPLOADS || 0);
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
    if (a === '/projects/p1')
      return json(res, {
        id: 'p1', name: 'NVIDIA Hospitality Berlin', internalNumber: '6066RNVIDVIE', address: 'Messedamm 22', city: 'Berlin', installationStart: '2026-10-05T00:00:00Z',
        client: { name: 'Image Construction Messe- und Eventbau GmbH' },
        technicalManager: { id: 'u1', firstName: 'Amaury', lastName: 'Pinchart', email: 'amaury.pinchart@span-tech.com' },
        team: [{ role: 'sales_engineer', user: { id: 'u2', firstName: 'Norick', lastName: 'Palm', email: 'norick.palm@span-tech.com' } }],
      });
    if (a === '/auth/me') return json(res, { id: 'u1', firstName: 'Amaury', lastName: 'Pinchart', role: 'technical_manager' });
    if (a === '/projects/p1/files') return json(res, [{ id: 'f1', fileName: ZIP_NAME, fileUrl: '/files/model.zip', fileSize: statSync(ZIP).size, createdAt: new Date().toISOString() }]);
    if (a.startsWith('/settings/')) return json(res, null);
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
