const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'gateway.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create Tables ──────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    UNIQUE NOT NULL,
    api_key     TEXT    UNIQUE NOT NULL,
    expired_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS endpoints (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_endpoint   TEXT    NOT NULL,
    target_url      TEXT    NOT NULL,
    endpoint_path   TEXT    UNIQUE NOT NULL,
    deskripsi       TEXT
  );

  CREATE TABLE IF NOT EXISTS user_endpoint_config (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint_id       INTEGER NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    quota_limit       INTEGER NOT NULL,
    quota_used        INTEGER DEFAULT 0,
    reset_type        TEXT    NOT NULL CHECK(reset_type IN ('daily','fixed')),
    last_reset_date   TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    UNIQUE NOT NULL,
    password    TEXT    NOT NULL
  );
`);

// ── Seed Dummy Endpoints ───────────────────────────────────────────────────

const endpointCount = db.prepare('SELECT COUNT(*) AS cnt FROM endpoints').get().cnt;

if (endpointCount === 0) {
  const insertEndpoint = db.prepare(`
    INSERT INTO endpoints (nama_endpoint, target_url, endpoint_path, deskripsi)
    VALUES (@nama_endpoint, @target_url, @endpoint_path, @deskripsi)
  `);

  const dummyEndpoints = [
    {
      nama_endpoint: 'Todos API',
      target_url:    'https://jsonplaceholder.typicode.com/todos',
      endpoint_path: '/api/todos',
      deskripsi:     'Data todos dari JSONPlaceholder'
    },
    {
      nama_endpoint: 'Posts API',
      target_url:    'https://jsonplaceholder.typicode.com/posts',
      endpoint_path: '/api/posts',
      deskripsi:     'Data posts dari JSONPlaceholder'
    },
    {
      nama_endpoint: 'HTTPBin Anything',
      target_url:    'https://httpbin.org/anything',
      endpoint_path: '/api/anything',
      deskripsi:     'Echo test dari HTTPBin'
    }
  ];

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertEndpoint.run(item);
    }
  });

  insertMany(dummyEndpoints);
  console.log('[DB] Seeded 3 dummy endpoints.');
}

// ── Seed Default Admin ─────────────────────────────────────────────────────

const adminCount = db.prepare('SELECT COUNT(*) AS cnt FROM admin_users').get().cnt;
if (adminCount === 0) {
  const hash = crypto.createHash('sha256').update('admin123').digest('hex');
  db.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run('admin', hash);
  console.log('[DB] Seeded default admin: admin / admin123');
}

module.exports = db;
