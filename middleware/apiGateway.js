const db = require('../database');
const axios = require('axios');

/**
 * API Gateway Middleware
 *
 * Steps:
 *   1. Extract Bearer token
 *   2. Validate user & expiry
 *   3. Resolve endpoint via JOIN
 *   4. Daily quota reset
 *   5. Check quota remaining
 *   6. Deduct quota_used
 *   7. Proxy request to base_url + endpoint_path
 */
async function apiGateway(req, res, next) {
  try {
    // ── 1. Extract Bearer Token ──────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized: Missing or invalid token format'
      });
    }
    const apiKey = authHeader.slice(7).trim();
    if (!apiKey) {
      return res.status(401).json({
        error: 'Unauthorized: Missing or invalid token format'
      });
    }

    // ── 2. Validate User & Expiry ────────────────────────────────────────────
    const user = db.prepare('SELECT id, username, api_key, expired_at FROM users WHERE api_key = ?').get(apiKey);
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid API key'
      });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (today > user.expired_at) {
      return res.status(403).json({
        error: 'Forbidden: Account has expired'
      });
    }

    // ── 3. Resolve Endpoint (JOIN) ───────────────────────────────────────────
    // req.path e.g. "/api/create" – we need to match against endpoint_path
    // The gateway listens on /api/* so req.path is already the full gateway path.
    // We store the same path in endpoint_path (e.g. "/api/create").
    // When mounted at /api, req.path is "/create" — reconstruct full path
    const reqPath = req.baseUrl + req.path; // e.g. "/api/create"

    const endpoint = db.prepare(`
      SELECT
        e.id           AS endpoint_id,
        e.base_url,
        e.endpoint_path,
        uec.id         AS config_id,
        uec.quota_limit,
        uec.quota_used,
        uec.reset_type,
        uec.last_reset_date
      FROM user_endpoint_config uec
      INNER JOIN endpoints e ON e.id = uec.endpoint_id
      WHERE uec.user_id = ?
        AND e.endpoint_path = ?
    `).get(user.id, reqPath);

    if (!endpoint) {
      return res.status(403).json({
        error: 'Forbidden: You do not have access to this endpoint'
      });
    }

    // ── 4. Daily Reset ───────────────────────────────────────────────────────
    if (endpoint.reset_type === 'daily' && endpoint.last_reset_date !== today) {
      db.prepare(`
        UPDATE user_endpoint_config
        SET quota_used = 0, last_reset_date = ?
        WHERE id = ?
      `).run(today, endpoint.config_id);

      // Reflect reset in memory for downstream checks
      endpoint.quota_used = 0;
      endpoint.last_reset_date = today;
    }

    // ── 5. Check Quota ───────────────────────────────────────────────────────
    if (endpoint.quota_used >= endpoint.quota_limit) {
      return res.status(429).json({
        error: 'Too Many Requests: Quota exceeded for this endpoint'
      });
    }

    // ── 6. Deduct Quota ──────────────────────────────────────────────────────
    db.prepare(`
      UPDATE user_endpoint_config
      SET quota_used = quota_used + 1
      WHERE id = ?
    `).run(endpoint.config_id);

    // ── 7. Proxy Request ─────────────────────────────────────────────────────
    // ── 7. Proxy / Forward Request (via Axios) ────────────────────────────────
    const targetUrl = endpoint.base_url.replace(/\/+$/, '') + endpoint.endpoint_path;
    const method = req.method.toLowerCase();
    const allowedMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

    if (!allowedMethods.includes(method)) {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const proxyResponse = await axios({
        method,
        url: targetUrl,
        params: req.query,
        data: req.body,
        headers: {
          // Forward relevant headers (omit host, connection, etc.)
          'accept': req.headers.accept,
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent'],
          'referer': req.headers.referer,
          'accept-encoding': req.headers['accept-encoding']
        },
        responseType: 'arraybuffer',
        validateStatus: () => true // don't throw on any status
      });

      // Forward response status + headers + body
      const contentType = proxyResponse.headers['content-type'] || 'application/octet-stream';
      res.status(proxyResponse.status).set('content-type', contentType);

      // Forward select headers
      ['x-request-id', 'x-trace-id', 'cache-control', 'etag', 'last-modified'].forEach(h => {
        if (proxyResponse.headers[h]) res.set(h, proxyResponse.headers[h]);
      });

      return res.send(proxyResponse.data);
    } catch (proxyErr) {
      console.error('[Gateway] Proxy error:', proxyErr.message);
      return res.status(502).json({
        error: 'Bad Gateway: Upstream server unreachable',
        detail: proxyErr.message
      });
    }

  } catch (err) {
    console.error('[Gateway Error]', err);
    return res.status(500).json({
      error: 'Internal Server Error: Gateway processing failed'
    });
  }
}

module.exports = apiGateway;
