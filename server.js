const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const db = require('./database');
const apiGateway = require('./middleware/apiGateway');

const app = express();
const PORT = process.env.PORT || 3100;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static Files (Admin Panel) ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Admin Auth Session Store (in-memory) ───────────────────────────────────
const adminSessions = new Map(); // token -> { username, createdAt }

function generateSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Auth middleware for admin routes
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Admin login required' });
  }
  const token = authHeader.slice(7).trim();
  const session = adminSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }
  // Session valid for 24h
  const age = Date.now() - session.createdAt;
  if (age > 24 * 60 * 60 * 1000) {
    adminSessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized: Session expired' });
  }
  req.admin = session;
  next();
}

// ── Admin Login ────────────────────────────────────────────────────────────

app.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const admin = db.prepare('SELECT id, username FROM admin_users WHERE username = ? AND password = ?').get(username, hash);

    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateSessionToken();
    adminSessions.set(token, { username: admin.username, createdAt: Date.now() });

    res.json({ success: true, token, username: admin.username });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/admin/check', requireAdmin, (req, res) => {
  res.json({ success: true, username: req.admin.username });
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.slice(7).trim();
  adminSessions.delete(token);
  res.json({ success: true });
});

// ── Admin: Endpoints (no auth required for public load) ────────────────────

app.get('/admin/endpoints', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, nama_endpoint, target_url, endpoint_path, deskripsi FROM endpoints ORDER BY id').all();
    res.json(rows);
  } catch (err) {
    console.error('[Admin] Error fetching endpoints:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Admin: Manage Endpoints (CRUD) ─────────────────────────────────────────

app.get('/admin/manage/endpoints', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT id, nama_endpoint, target_url, endpoint_path, deskripsi FROM endpoints ORDER BY id').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/manage/endpoints', requireAdmin, (req, res) => {
  try {
    const { nama_endpoint, target_url, endpoint_path, deskripsi } = req.body;
    if (!nama_endpoint || !target_url || !endpoint_path) {
      return res.status(400).json({ error: 'nama_endpoint, target_url, endpoint_path required' });
    }
    const result = db.prepare('INSERT INTO endpoints (nama_endpoint, target_url, endpoint_path, deskripsi) VALUES (?, ?, ?, ?)').run(nama_endpoint, target_url, endpoint_path, deskripsi || '');
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Endpoint path already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/admin/manage/endpoints/:id', requireAdmin, (req, res) => {
  try {
    const { nama_endpoint, target_url, endpoint_path, deskripsi } = req.body;
    db.prepare('UPDATE endpoints SET nama_endpoint=?, target_url=?, endpoint_path=?, deskripsi=? WHERE id=?').run(nama_endpoint, target_url, endpoint_path, deskripsi || '', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/admin/manage/endpoints/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM endpoints WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Admin: Manage API Users (CRUD) ─────────────────────────────────────────

app.get('/admin/manage/users', requireAdmin, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.api_key, u.expired_at
      FROM users u ORDER BY u.id DESC
    `).all();

    // Attach configs per user
    const getConfigs = db.prepare(`
      SELECT uec.id AS config_id, uec.endpoint_id, uec.quota_limit, uec.quota_used, uec.reset_type, uec.last_reset_date,
             e.nama_endpoint, e.endpoint_path, e.target_url
      FROM user_endpoint_config uec
      JOIN endpoints e ON e.id = uec.endpoint_id
      WHERE uec.user_id = ?
      ORDER BY e.nama_endpoint
    `);

    for (const user of users) {
      user.configs = getConfigs.all(user.id);
    }

    res.json(users);
  } catch (err) {
    console.error('[Admin] Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/admin/manage/users/:id', requireAdmin, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, api_key, expired_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.configs = db.prepare(`
      SELECT uec.id AS config_id, uec.endpoint_id, uec.quota_limit, uec.quota_used, uec.reset_type, uec.last_reset_date,
             e.nama_endpoint, e.endpoint_path, e.target_url
      FROM user_endpoint_config uec
      JOIN endpoints e ON e.id = uec.endpoint_id
      WHERE uec.user_id = ?
      ORDER BY e.nama_endpoint
    `).all(user.id);

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/manage/users', requireAdmin, (req, res) => {
  try {
    const { username, expired_at, configs } = req.body;
    if (!username || !expired_at || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: 'Requires username, expired_at, and configs array' });
    }

    const apiKey = crypto.randomBytes(20).toString('hex');
    const today = new Date().toISOString().slice(0, 10);

    const createUser = db.transaction(() => {
      const result = db.prepare('INSERT INTO users (username, api_key, expired_at) VALUES (?, ?, ?)').run(username, apiKey, expired_at);
      const userId = result.lastInsertRowid;

      const ins = db.prepare('INSERT INTO user_endpoint_config (user_id, endpoint_id, quota_limit, quota_used, reset_type, last_reset_date) VALUES (?, ?, ?, 0, ?, ?)');
      for (const cfg of configs) {
        ins.run(userId, cfg.endpoint_id, cfg.quota_limit, cfg.reset_type, today);
      }
      return userId;
    });

    const userId = createUser();
    res.status(201).json({ success: true, user_id: userId, username, api_key: apiKey, endpoint_count: configs.length });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed: users.username')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/admin/manage/users/:id', requireAdmin, (req, res) => {
  try {
    const { username, expired_at } = req.body;
    if (!username || !expired_at) {
      return res.status(400).json({ error: 'username and expired_at required' });
    }
    db.prepare('UPDATE users SET username = ?, expired_at = ? WHERE id = ?').run(username, expired_at, req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/admin/manage/users/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Admin: Manage User Endpoint Configs ────────────────────────────────────

app.post('/admin/manage/users/:id/configs', requireAdmin, (req, res) => {
  try {
    const { endpoint_id, quota_limit, reset_type } = req.body;
    if (!endpoint_id || !quota_limit || !reset_type) {
      return res.status(400).json({ error: 'endpoint_id, quota_limit, reset_type required' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const result = db.prepare('INSERT INTO user_endpoint_config (user_id, endpoint_id, quota_limit, quota_used, reset_type, last_reset_date) VALUES (?, ?, ?, 0, ?, ?)').run(req.params.id, endpoint_id, quota_limit, reset_type, today);
    res.status(201).json({ success: true, config_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/admin/manage/users/:id/configs/:configId', requireAdmin, (req, res) => {
  try {
    const { quota_limit, reset_type } = req.body;
    db.prepare('UPDATE user_endpoint_config SET quota_limit = ?, reset_type = ? WHERE id = ? AND user_id = ?').run(quota_limit, reset_type, req.params.configId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/admin/manage/users/:id/configs/:configId', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM user_endpoint_config WHERE id = ? AND user_id = ?').run(req.params.configId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Admin: Reset quota ─────────────────────────────────────────────────────

app.post('/admin/manage/users/:id/configs/:configId/reset', requireAdmin, (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('UPDATE user_endpoint_config SET quota_used = 0, last_reset_date = ? WHERE id = ? AND user_id = ?').run(today, req.params.configId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Admin: Regenerate API Key ──────────────────────────────────────────────

app.post('/admin/manage/users/:id/regenerate-key', requireAdmin, (req, res) => {
  try {
    const newKey = crypto.randomBytes(20).toString('hex');
    db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(newKey, req.params.id);
    res.json({ success: true, api_key: newKey });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Admin: Change admin password ──────────────────────────────────────────

app.put('/admin/change-password', requireAdmin, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password required' });
    }
    const hash = crypto.createHash('sha256').update(current_password).digest('hex');
    const admin = db.prepare('SELECT id FROM admin_users WHERE username = ? AND password = ?').get(req.admin.username, hash);
    if (!admin) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const newHash = crypto.createHash('sha256').update(new_password).digest('hex');
    db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(newHash, admin.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Gateway Routes (protected by middleware) ───────────────────────────────

app.use('/api', apiGateway);

// ── Health Check ───────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'API Gateway Management System',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ── 404 Handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  API Gateway & Management System`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Admin Panel: http://localhost:${PORT}`);
  console.log(`  Gateway:     http://localhost:${PORT}/api/*`);
  console.log(`═══════════════════════════════════════════\n`);
});
