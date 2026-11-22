const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + 'CHAVES_SALT_2024').digest('hex');
}
function uuid() {
  return crypto.randomUUID();
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      admin: {
        username: 'admin',
        password_hash: hashPassword('admin123'),
        master_hash: hashPassword('mestreCHAVES')
      },
      items: [
        { id: uuid(), name: 'CADEIRA SIMPLES', quantity: 7, photo: 'cadeira_simples.png' },
        { id: uuid(), name: 'ESTANTE DE ESCRITÓRIO DUAS PORTAS', quantity: 6, photo: 'estante_escritorio.png' },
        { id: uuid(), name: 'GAVETEIRO 3 GABETAS C/RODINHAS', quantity: 26, photo: 'gaveteiro.png' },
        { id: uuid(), name: 'ESTANTE EM AÇO COM 06 PRATELEIRAS', quantity: 1, photo: 'estante_aco_6.png' },
        { id: uuid(), name: 'ESTANTE EM AÇO C 2 PRATELEIRAS E 12 COLMEIAS', quantity: 1, photo: 'estante_aco_2.png' }
      ],
      requests: []
    };
    saveDB(initial);
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const adminTokens = new Map();
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}
function requireAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token || !adminTokens.has(token)) return false;
  if (Date.now() - adminTokens.get(token) > 8 * 60 * 60 * 1000) {
    adminTokens.delete(token);
    return false;
  }
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json'
};

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try { resolve(JSON.parse(buf.toString() || '{}')); }
        catch { resolve({}); }
      } else if (contentType.includes('multipart/form-data')) {
        resolve(parseMultipart(buf, contentType));
      } else {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) return { fields: {}, files: {} };
  const boundary = '--' + boundaryMatch[1];
  const parts = buffer.toString('binary').split(boundary);
  const fields = {};
  const files = {};

  for (const part of parts) {
    if (!part.includes('Content-Disposition')) continue;
    const nameMatch = part.match(/name="([^"]+)"/);
    const filenameMatch = part.match(/filename="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    let data = part.slice(headerEnd + 4);
    if (data.endsWith('\r\n')) data = data.slice(0, -2);
    if (data.endsWith('--')) data = data.slice(0, -2);
    if (data.endsWith('\r\n')) data = data.slice(0, -2);

    if (filenameMatch && filenameMatch[1]) {
      const ext = path.extname(filenameMatch[1]) || '.png';
      const newName = uuid() + ext;
      fs.writeFileSync(path.join(ROOT, newName), Buffer.from(data, 'binary'));
      files[name] = newName;
    } else {
      fields[name] = data.trim();
    }
  }
  return { fields, files };
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const db = loadDB();

  // API
  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/items' && req.method === 'GET') {
      return sendJSON(res, 200, db.items.filter(i => i.quantity > 0).sort((a,b) => a.name.localeCompare(b.name)));
    }
    if (pathname === '/api/items/all' && req.method === 'GET') {
      return sendJSON(res, 200, [...db.items].sort((a,b) => a.name.localeCompare(b.name)));
    }
    if (pathname === '/api/request' && req.method === 'POST') {
      const body = await parseBody(req);
      const { item_id, quantity, nip, nome, setor } = body;
      if (!item_id || !quantity || !nip || !nome || !setor) return sendJSON(res, 400, { error: 'Preencha todos os campos.' });
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty < 1) return sendJSON(res, 400, { error: 'Quantidade inválida.' });
      const item = db.items.find(i => i.id === item_id);
      if (!item) return sendJSON(res, 404, { error: 'Item não encontrado.' });
      if (item.quantity < qty) return sendJSON(res, 400, { error: `Disponível: ${item.quantity}` });
      item.quantity -= qty;
      db.requests.unshift({
        id: uuid(), item_id, item_name: item.name, quantity: qty,
        nip: String(nip).trim().toUpperCase(),
        nome: String(nome).trim().toUpperCase(),
        setor: String(setor).trim().toUpperCase(),
        created_at: new Date().toISOString()
      });
      saveDB(db);
      return sendJSON(res, 200, { success: true, message: `Solicitação registrada: ${qty}x ${item.name}` });
    }
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await parseBody(req);
      if (body.username === db.admin.username && hashPassword(body.password) === db.admin.password_hash) {
        const token = generateToken();
        adminTokens.set(token, Date.now());
        return sendJSON(res, 200, { success: true, token });
      }
      return sendJSON(res, 401, { error: 'Usuário ou senha inválidos.' });
    }
    if (pathname === '/api/admin/change-password' && req.method === 'POST') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const body = await parseBody(req);
      if (!body.master_password || !body.new_password || body.new_password.length < 6) {
        return sendJSON(res, 400, { error: 'Dados inválidos.' });
      }
      if (hashPassword(body.master_password) !== db.admin.master_hash) {
        return sendJSON(res, 401, { error: 'Senha mestre incorreta.' });
      }
      db.admin.password_hash = hashPassword(body.new_password);
      saveDB(db);
      return sendJSON(res, 200, { success: true, message: 'Senha alterada com sucesso.' });
    }
    if (pathname === '/api/admin/requests' && req.method === 'GET') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      return sendJSON(res, 200, db.requests);
    }
    if (pathname.startsWith('/api/admin/requests/') && req.method === 'DELETE') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const id = pathname.split('/').pop();
      db.requests = db.requests.filter(r => r.id !== id);
      saveDB(db);
      return sendJSON(res, 200, { success: true });
    }
    if (pathname === '/api/admin/items' && req.method === 'POST') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const parsed = await parseBody(req);
      const fields = parsed.fields || parsed;
      const files = parsed.files || {};
      const name = fields.name;
      const quantity = fields.quantity;
      if (!name || quantity === undefined) return sendJSON(res, 400, { error: 'Nome e quantidade obrigatórios.' });
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty < 0) return sendJSON(res, 400, { error: 'Quantidade inválida.' });
      const item = { id: uuid(), name: String(name).trim().toUpperCase(), quantity: qty, photo: files.photo || null };
      db.items.push(item);
      saveDB(db);
      return sendJSON(res, 200, { success: true, ...item });
    }
    if (pathname.startsWith('/api/admin/items/') && req.method === 'PUT') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const id = pathname.split('/').pop();
      const item = db.items.find(i => i.id === id);
      if (!item) return sendJSON(res, 404, { error: 'Item não encontrado.' });
      const parsed = await parseBody(req);
      const fields = parsed.fields || parsed;
      const files = parsed.files || {};
      if (fields.name) item.name = String(fields.name).trim().toUpperCase();
      if (fields.quantity !== undefined) {
        const qty = parseInt(fields.quantity, 10);
        if (!isNaN(qty) && qty >= 0) item.quantity = qty;
      }
      if (fields.remove_photo === '1' || fields.remove_photo === 'true') {
        item.photo = null;
      }
      if (files.photo) item.photo = files.photo;
      saveDB(db);
      return sendJSON(res, 200, { success: true, ...item });
    }
    if (pathname.startsWith('/api/admin/items/') && req.method === 'DELETE') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const id = pathname.split('/').pop();
      db.items = db.items.filter(i => i.id !== id);
      saveDB(db);
      return sendJSON(res, 200, { success: true });
    }
    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      const token = req.headers['x-admin-token'];
      if (token) adminTokens.delete(token);
      return sendJSON(res, 200, { success: true });
    }
    return sendJSON(res, 404, { error: 'Rota não encontrada' });
  }

  // Arquivos estáticos (raiz)
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error(err);
    sendJSON(res, 500, { error: 'Erro interno' });
  });
});

server.listen(PORT, () => {
  console.log(`Materiais Disponíveis (CHAVES) rodando na porta ${PORT}`);
});
