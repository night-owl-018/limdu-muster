const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'muster.json');
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

function ensureData() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ members: [], nextId: 1 }, null, 2));
  }
}

function readData() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { members: [], nextId: 1 }; }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Bad JSON')); } });
    req.on('error', reject);
  });
}

function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  try {
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(fs.readFileSync(filePath));
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/') return serveStatic(res, path.join(PUBLIC, 'index.html'));
  if (req.method === 'GET' && /^\/(app\.js|style\.css)$/.test(url)) return serveStatic(res, path.join(PUBLIC, url));
  if (req.method === 'GET' && url === '/api/members') return json(res, readData());

  if (req.method === 'POST' && url === '/api/members') {
    const body = await readBody(req).catch(() => null);
    if (!body || !body.name) return json(res, { error: 'Name required' }, 400);
    const data = readData();
    const m = { id: data.nextId++, name: body.name.toUpperCase().trim(), rate: (body.rate||'').toUpperCase().trim(), sec: (body.sec||'').trim(), wc: (body.wc||'').toUpperCase().trim(), status: '', note: '' };
    data.members.push(m); writeData(data);
    return json(res, m, 201);
  }

  if (req.method === 'POST' && url === '/api/members/bulk') {
    const body = await readBody(req).catch(() => null);
    if (!body || !Array.isArray(body.members)) return json(res, { error: 'Invalid payload' }, 400);
    const data = readData();
    const added = [];
    for (const row of body.members) {
      if (!row.name) continue;
      const m = { id: data.nextId++, name: row.name.toUpperCase().trim(), rate: (row.rate||'').toUpperCase().trim(), sec: (row.sec||'').trim(), wc: (row.wc||'').toUpperCase().trim(), status: '', note: '' };
      data.members.push(m); added.push(m);
    }
    writeData(data);
    return json(res, { added: added.length, members: added }, 201);
  }

  const mMatch = url.match(/^\/api\/members\/(\d+)$/);
  if (mMatch && req.method === 'PUT') {
    const body = await readBody(req).catch(() => null);
    if (!body) return json(res, { error: 'Bad request' }, 400);
    const data = readData();
    const m = data.members.find(x => x.id === parseInt(mMatch[1]));
    if (!m) return json(res, { error: 'Not found' }, 404);
    if (body.status !== undefined) m.status = body.status;
    if (body.note !== undefined) m.note = body.note;
    if (body.name !== undefined) m.name = body.name.toUpperCase().trim();
    if (body.rate !== undefined) m.rate = body.rate.toUpperCase().trim();
    if (body.sec !== undefined) m.sec = body.sec.trim();
    if (body.wc !== undefined) m.wc = body.wc.toUpperCase().trim();
    writeData(data); return json(res, m);
  }

  if (mMatch && req.method === 'DELETE') {
    const data = readData();
    const idx = data.members.findIndex(x => x.id === parseInt(mMatch[1]));
    if (idx === -1) return json(res, { error: 'Not found' }, 404);
    data.members.splice(idx, 1); writeData(data);
    return json(res, { ok: true });
  }

  if (req.method === 'DELETE' && url === '/api/members') {
    const data = readData(); data.members = []; writeData(data);
    return json(res, { ok: true });
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => console.log(`Division Muster running on port ${PORT}`));
