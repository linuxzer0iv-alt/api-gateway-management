# 🛡️ API Gateway & Management System

Sistem **API Gateway** berbasis Express.js + SQLite (`better-sqlite3`) dengan fitur:
- Validasi Bearer Token & expiry
- Per-endpoint quota dengan daily/fixed reset
- Proxy forwarding ke server tujuan
- **Admin Panel** dengan login security
- **Manajemen User** (CRUD + configs)
- **Manajemen Endpoints** (CRUD)

## Quick Start

```bash
npm install
npm start
# Buka http://localhost:3100
# Login: admin / admin123
```

## Struktur

```
api-gateway/
├── database.js              # DB schema + seed
├── server.js                # Express server + semua route
├── middleware/apiGateway.js  # Gateway middleware
├── public/index.html         # Admin SPA
└── data/gateway.db          # SQLite (auto)
```

## API Routes

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /admin/login | Login admin |
| GET | /admin/check | Check session |
| POST | /admin/logout | Logout |
| PUT | /admin/change-password | Ganti password |

### User Management
| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/manage/users | List all users |
| GET | /admin/manage/users/:id | Get user detail |
| POST | /admin/manage/users | Create user + configs |
| PUT | /admin/manage/users/:id | Update user |
| DELETE | /admin/manage/users/:id | Delete user |
| POST | /admin/manage/users/:id/regenerate-key | Regenerate API key |
| POST | /admin/manage/users/:id/configs | Add endpoint config |
| PUT | /admin/manage/users/:id/configs/:cid | Update config |
| DELETE | /admin/manage/users/:id/configs/:cid | Remove config |
| POST | /admin/manage/users/:id/configs/:cid/reset | Reset quota |

### Endpoint Management
| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/endpoints | List endpoints (public) |
| GET | /admin/manage/endpoints | List endpoints (auth) |
| POST | /admin/manage/endpoints | Create endpoint |
| PUT | /admin/manage/endpoints/:id | Update endpoint |
| DELETE | /admin/manage/endpoints/:id | Delete endpoint |

### Gateway
| Method | Path | Description |
|--------|------|-------------|
| * | /api/* | Proxy gateway (Bearer auth) |

## Deploy

```bash
npm install pm2 -g
pm2 start server.js --name api-gateway --port 9998
```
