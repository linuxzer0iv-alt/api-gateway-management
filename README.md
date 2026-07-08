# 🛡️ API Gateway & Management System

Sistem **API Gateway** berbasis Express.js + SQLite (`better-sqlite3`) yang berfungsi sebagai pintu masuk (gatekeeper) untuk memvalidasi API Key, memeriksa & memotong kuota per endpoint, dan meneruskan (proxy) request ke server tujuan.

## Fitur

- ✅ **Validasi Bearer Token** — Autentikasi via `Authorization: Bearer <api_key>`
- ✅ **Cek Masa Aktif Akun** — Tolak request jika `expired_at` sudah lewat
- ✅ **Otorisasi Per-Endpoint** — Setiap user hanya bisa akses endpoint yang diizinkan
- ✅ **Kuota per Endpoint** — Batasi jumlah request per endpoint per user
- ✅ **Reset Harian Otomatis** — Kuota `daily` di-reset otomatis tiap hari
- ✅ **Proxy Request** — Forward request ke server tujuan (`base_url` + `endpoint_path`)
- ✅ **Admin Panel Web** — UI untuk membuat user dan mengatur akses endpoint

## Struktur File

```
api-gateway/
├── data/               # Database SQLite (auto-generated)
├── middleware/
│   └── apiGateway.js   # Gateway middleware logic
├── public/
│   └── index.html      # Admin Panel SPA (Tailwind CSS)
├── database.js         # DB initialization & schema
├── server.js           # Express.js entry point
├── package.json
└── README.md
```

## Instalasi & Menjalankan

```bash
# 1. Clone repositori ini
git clone https://github.com/yourusername/api-gateway.git
cd api-gateway

# 2. Install dependencies
npm install

# 3. Jalankan server
npm start

# 4. Buka admin panel
#    http://localhost:3100
```

## Cara Kerja

### Gateway Flow

```
Client → [API Gateway] → [Target Server]
            │
            ├─ 1. Ekstrak Bearer Token
            ├─ 2. Validasi User & Expiry
            ├─ 3. Cari Endpoint (JOIN)
            ├─ 4. Reset Daily (jika perlu)
            ├─ 5. Cek Kuota
            ├─ 6. Kurangi Saldo Quota
            └─ 7. Proxy Request → Target
```

### Admin Panel

Buka `http://localhost:3100` di browser. Dari sini admin bisa:

1. Masukkan **Username** dan **Expiration Date**
2. Centang endpoint yang ingin diakses user baru
3. Atur **Quota Limit** dan **Reset Type** (Daily / Fixed) per endpoint
4. Klik **Create User** → API Key akan muncul di modal untuk di-copy

### Testing Gateway

Setelah membuat user, gunakan API Key untuk mengakses gateway:

```bash
# Contoh request ke gateway
curl -H "Authorization: Bearer <API_KEY>" http://localhost:3100/api/create
curl -H "Authorization: Bearer <API_KEY>" http://localhost:3100/api/view
curl -H "Authorization: Bearer <API_KEY>" http://localhost:3100/api/health
```

## Endpoint API

| Method | Path                | Auth     | Deskripsi                          |
|--------|---------------------|----------|------------------------------------|
| GET    | `/health`           | ❌       | Health check server                |
| GET    | `/admin/endpoints`  | ❌       | Ambil daftar endpoint (admin)      |
| POST   | `/admin/users`      | ❌       | Buat user baru (admin)             |
| GET    | `/api/*`            | ✅ Bearer | Gateway — forward ke target server |
| POST   | `/api/*`            | ✅ Bearer | Gateway — forward ke target server |
| PUT    | `/api/*`            | ✅ Bearer | Gateway — forward ke target server |
| DELETE | `/api/*`            | ✅ Bearer | Gateway — forward ke target server |

## Skema Database

### `users`
| Kolom       | Tipe    | Keterangan            |
|-------------|---------|-----------------------|
| id          | INTEGER | Primary Key           |
| username    | TEXT    | Unique                |
| api_key     | TEXT    | Unique                |
| expired_at  | TEXT    | YYYY-MM-DD            |

### `endpoints`
| Kolom          | Tipe    | Keterangan                  |
|----------------|---------|-----------------------------|
| id             | INTEGER | Primary Key                 |
| nama_endpoint  | TEXT    | Nama endpoint               |
| base_url       | TEXT    | Server tujuan               |
| endpoint_path  | TEXT    | Path (unique)               |
| deskripsi      | TEXT    | Deskripsi                   |

### `user_endpoint_config`
| Kolom           | Tipe    | Keterangan                    |
|-----------------|---------|-------------------------------|
| id              | INTEGER | Primary Key                   |
| user_id         | INTEGER | FK → users.id                 |
| endpoint_id     | INTEGER | FK → endpoints.id             |
| quota_limit     | INTEGER | Batas maksimal request        |
| quota_used      | INTEGER | Request terpakai (default 0)  |
| reset_type      | TEXT    | daily / fixed                 |
| last_reset_date | TEXT    | YYYY-MM-DD                    |

## Dummy Endpoints

Secara default sistem menyediakan 3 dummy endpoint yang semuanya mengarah ke `https://httpbin.org/anything` (echo server untuk testing):

| Nama Endpoint         | Path            | Method |
|-----------------------|-----------------|--------|
| Create User Service   | `/api/create`   | Any    |
| View Data Service     | `/api/view`     | Any    |
| Health Check Service  | `/api/health`   | Any    |

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** SQLite (`better-sqlite3`)
- **Proxy:** `express-http-proxy`
- **Frontend:** Tailwind CSS (CDN)
