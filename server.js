const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure dirs
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');

// Simple JSON DB
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

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + 'CHAVES_SALT_2024').digest('hex');
}

function uuid() {
  return crypto.randomUUID();
}

// In-memory admin tokens
const adminTokens = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
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
        try {
          resolve(JSON.parse(buf.toString() || '{}'));
        } catch {
          resolve({});
        }
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
    if (part.includes('Content-Disposition')) {
      const nameMatch = part.match(/name="([^"]+)"/);
      const filenameMatch = part.match(/filename="([^"]+)"/);
      if (!nameMatch) continue;
      const name = nameMatch[1];
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      let data = part.slice(headerEnd + 4);
      // remove trailing \r\n
      if (data.endsWith('\r\n')) data = data.slice(0, -2);
      if (data.endsWith('--')) data = data.slice(0, -2);
      if (data.endsWith('\r\n')) data = data.slice(0, -2);

      if (filenameMatch && filenameMatch[1]) {
        const filename = filenameMatch[1];
        const ext = path.extname(filename) || '.png';
        const newName = uuid() + ext;
        const filePath = path.join(UPLOADS_DIR, newName);
        fs.writeFileSync(filePath, Buffer.from(data, 'binary'));
        files[name] = newName;
      } else {
        fields[name] = data.trim();
      }
    }
  }
  return { fields, files };
}

function requireAdmin(req) {
  const token = req.headers['x-admin-token'];
  if (!token || !adminTokens.has(token)) return false;
  const ts = adminTokens.get(token);
  if (Date.now() - ts > 8 * 60 * 60 * 1000) {
    adminTokens.delete(token);
    return false;
  }
  return true;
}

// Router
async function handleRequest(req, res) {
  // CORS preflight
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

  // API routes
  if (pathname.startsWith('/api/')) {
    const db = loadDB();

    // GET /api/items - available only
    if (pathname === '/api/items' && req.method === 'GET') {
      const items = db.items.filter(i => i.quantity > 0).sort((a, b) => a.name.localeCompare(b.name));
      return sendJSON(res, 200, items);
    }

    // GET /api/items/all
    if (pathname === '/api/items/all' && req.method === 'GET') {
      const items = [...db.items].sort((a, b) => a.name.localeCompare(b.name));
      return sendJSON(res, 200, items);
    }

    // POST /api/request
    if (pathname === '/api/request' && req.method === 'POST') {
      const body = await parseBody(req);
      const { item_id, quantity, nip, nome, setor } = body;
      if (!item_id || !quantity || !nip || !nome || !setor) {
        return sendJSON(res, 400, { error: 'Preencha todos os campos: item, quantidade, NIP, nome e setor.' });
      }
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty < 1) {
        return sendJSON(res, 400, { error: 'Quantidade inválida.' });
      }
      const item = db.items.find(i => i.id === item_id);
      if (!item) return sendJSON(res, 404, { error: 'Item não encontrado.' });
      if (item.quantity < qty) {
        return sendJSON(res, 400, { error: `Quantidade insuficiente. Disponível: ${item.quantity}` });
      }
      item.quantity -= qty;
      db.requests.unshift({
        id: uuid(),
        item_id,
        item_name: item.name,
        quantity: qty,
        nip: String(nip).trim().toUpperCase(),
        nome: String(nome).trim().toUpperCase(),
        setor: String(setor).trim().toUpperCase(),
        created_at: new Date().toISOString()
      });
      saveDB(db);
      return sendJSON(res, 200, { success: true, message: `Solicitação registrada: ${qty}x ${item.name}` });
    }

    // POST /api/admin/login
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const { username, password } = body;
      if (username === db.admin.username && hashPassword(password) === db.admin.password_hash) {
        const token = generateToken();
        adminTokens.set(token, Date.now());
        return sendJSON(res, 200, { success: true, token, username });
      }
      return sendJSON(res, 401, { error: 'Usuário ou senha inválidos.' });
    }

    // POST /api/admin/change-password
    if (pathname === '/api/admin/change-password' && req.method === 'POST') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const body = await parseBody(req);
      const { master_password, new_password } = body;
      if (!master_password || !new_password || new_password.length < 6) {
        return sendJSON(res, 400, { error: 'Senha mestre e nova senha (mín. 6 caracteres) são obrigatórias.' });
      }
      if (hashPassword(master_password) !== db.admin.master_hash) {
        return sendJSON(res, 401, { error: 'Senha mestre incorreta.' });
      }
      db.admin.password_hash = hashPassword(new_password);
      saveDB(db);
      return sendJSON(res, 200, { success: true, message: 'Senha de acesso alterada com sucesso.' });
    }

    // GET /api/admin/requests
    if (pathname === '/api/admin/requests' && req.method === 'GET') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      return sendJSON(res, 200, db.requests);
    }

    // POST /api/admin/items
    if (pathname === '/api/admin/items' && req.method === 'POST') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const parsed = await parseBody(req);
      const fields = parsed.fields || parsed;
      const files = parsed.files || {};
      const name = fields.name;
      const quantity = fields.quantity;
      if (!name || quantity === undefined) {
        return sendJSON(res, 400, { error: 'Nome e quantidade são obrigatórios.' });
      }
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty < 0) return sendJSON(res, 400, { error: 'Quantidade inválida.' });
      const photo = files.photo || null;
      const item = { id: uuid(), name: String(name).trim().toUpperCase(), quantity: qty, photo };
      db.items.push(item);
      saveDB(db);
      return sendJSON(res, 200, { success: true, ...item });
    }

    // PUT /api/admin/items/:id
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
        if (isNaN(qty) || qty < 0) return sendJSON(res, 400, { error: 'Quantidade inválida.' });
        item.quantity = qty;
      }
      // Remover foto
      if (fields.remove_photo === '1' || fields.remove_photo === 'true') {
        if (item.photo) {
          const old = path.join(UPLOADS_DIR, item.photo);
          if (fs.existsSync(old)) fs.unlinkSync(old);
        }
        item.photo = null;
      }
      // Nova foto
      if (files.photo) {
        if (item.photo) {
          const old = path.join(UPLOADS_DIR, item.photo);
          if (fs.existsSync(old)) fs.unlinkSync(old);
        }
        item.photo = files.photo;
      }
      saveDB(db);
      return sendJSON(res, 200, { success: true, ...item });
    }

    // DELETE /api/admin/items/:id
    if (pathname.startsWith('/api/admin/items/') && req.method === 'DELETE') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const id = pathname.split('/').pop();
      const idx = db.items.findIndex(i => i.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: 'Item não encontrado.' });
      const item = db.items[idx];
      if (item.photo) {
        const p = path.join(UPLOADS_DIR, item.photo);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      db.items.splice(idx, 1);
      saveDB(db);
      return sendJSON(res, 200, { success: true });
    }

    // DELETE /api/admin/requests/:id
    if (pathname.startsWith('/api/admin/requests/') && req.method === 'DELETE') {
      if (!requireAdmin(req)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      const id = pathname.split('/').pop();
      const idx = db.requests.findIndex(r => r.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: 'Solicitação não encontrada.' });
      db.requests.splice(idx, 1);
      saveDB(db);
      return sendJSON(res, 200, { success: true });
    }

    // POST /api/admin/logout
    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      const token = req.headers['x-admin-token'];
      if (token) adminTokens.delete(token);
      return sendJSON(res, 200, { success: true });
    }

    return sendJSON(res, 404, { error: 'Rota não encontrada' });
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
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
    sendJSON(res, 500, { error: 'Erro interno do servidor' });
  });
});

server.listen(PORT, () => {
  console.log(`🎖️  Materiais Disponíveis - Criado por CHAVES`);
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`👤 Admin: admin / admin123`);
  console.log(`🔑 Senha mestre: mestreCHAVES`);
});
