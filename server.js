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

// ── Admin Routes (no gateway) ──────────────────────────────────────────────

/**
 * GET /admin/endpoints
 * Returns all endpoints for the admin panel dropdown.
 */
app.get('/admin/endpoints', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, nama_endpoint, base_url, endpoint_path, deskripsi FROM endpoints ORDER BY id').all();
    res.json(rows);
  } catch (err) {
    console.error('[Admin] Error fetching endpoints:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/users
 * Creates a new user with endpoint configs.
 * Body: { username, expired_at, configs: [{ endpoint_id, quota_limit, reset_type }] }
 */
app.post('/admin/users', (req, res) => {
  try {
    const { username, expired_at, configs } = req.body;

    // Basic validation
    if (!username || !expired_at || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: 'Invalid payload. Requires username, expired_at, and configs array.' });
    }

    // Generate unique API key
    const apiKey = crypto.randomBytes(20).toString('hex');

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(expired_at)) {
      return res.status(400).json({ error: 'expired_at must be in YYYY-MM-DD format.' });
    }

    // Validate configs
    for (const cfg of configs) {
      if (!cfg.endpoint_id || !cfg.quota_limit || !cfg.reset_type) {
        return res.status(400).json({ error: 'Each config must have endpoint_id, quota_limit, and reset_type.' });
      }
      if (!['daily', 'fixed'].includes(cfg.reset_type)) {
        return res.status(400).json({ error: 'reset_type must be "daily" or "fixed".' });
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    // Transaction: insert user + configs
    const createUser = db.transaction(() => {
      // Insert user
      const userResult = db.prepare(`
        INSERT INTO users (username, api_key, expired_at)
        VALUES (?, ?, ?)
      `).run(username, apiKey, expired_at);

      const userId = userResult.lastInsertRowid;

      // Insert configs
      const insertConfig = db.prepare(`
        INSERT INTO user_endpoint_config (user_id, endpoint_id, quota_limit, quota_used, reset_type, last_reset_date)
        VALUES (?, ?, ?, 0, ?, ?)
      `);

      for (const cfg of configs) {
        insertConfig.run(userId, cfg.endpoint_id, cfg.quota_limit, cfg.reset_type, today);
      }

      return userId;
    });

    const userId = createUser();

    console.log(`[Admin] User created — ID: ${userId}, Username: ${username}, API Key: ${apiKey.slice(0, 12)}...`);

    res.status(201).json({
      success: true,
      user_id: userId,
      username,
      api_key: apiKey,
      endpoint_count: configs.length
    });

  } catch (err) {
    console.error('[Admin] Error creating user:', err);

    // Handle unique constraint violations
    if (err.message && err.message.includes('UNIQUE constraint failed: users.username')) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Gateway Routes (protected by middleware) ───────────────────────────────
// All requests under /api/* go through the gateway middleware
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
