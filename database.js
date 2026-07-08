const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'gateway.db');
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create Tables ──────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    UNIQUE NOT NULL,
    api_key     TEXT    UNIQUE NOT NULL,
    expired_at  TEXT    NOT NULL  -- format: YYYY-MM-DD
  );

  CREATE TABLE IF NOT EXISTS endpoints (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_endpoint   TEXT    NOT NULL,
    base_url        TEXT    NOT NULL,
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
    last_reset_date   TEXT    NOT NULL  -- format: YYYY-MM-DD
  );
`);

// ── Seed Dummy Endpoints ───────────────────────────────────────────────────

const endpointCount = db.prepare('SELECT COUNT(*) AS cnt FROM endpoints').get().cnt;

if (endpointCount === 0) {
  const insertEndpoint = db.prepare(`
    INSERT INTO endpoints (nama_endpoint, base_url, endpoint_path, deskripsi)
    VALUES (@nama_endpoint, @base_url, @endpoint_path, @deskripsi)
  `);

  const dummyEndpoints = [
    {
      nama_endpoint: 'Create User Service',
      base_url:      'https://httpbin.org/anything',
      endpoint_path: '/api/create',
      deskripsi:     'Endpoint untuk membuat user baru di sistem internal'
    },
    {
      nama_endpoint: 'View Data Service',
      base_url:      'https://httpbin.org/anything',
      endpoint_path: '/api/view',
      deskripsi:     'Endpoint untuk melihat data dari database internal'
    },
    {
      nama_endpoint: 'Health Check Service',
      base_url:      'https://httpbin.org/anything',
      endpoint_path: '/api/health',
      deskripsi:     'Endpoint pengecekan status server tujuan'
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

module.exports = db;
