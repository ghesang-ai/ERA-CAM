/**
 * ERA-CAM Netlify Function — Anthropic Claude API Proxy
 * Menggunakan https module bawaan Node.js (kompatibel semua versi)
 */
const https = require('https');

const MODEL_MAP = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  auto:   'claude-sonnet-4-6',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function sanitizeKey(key) {
  if (!key) return '';
  const map = [['–','-'],['—','-'],['‒','-'],['‑','-'],['­','']];
  for (const [b, g] of map) key = key.split(b).join(g);
  return key.trim().replace(/[^\x20-\x7E]/g, '');
}

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(24000, () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const apiKey = sanitizeKey(process.env.ANTHROPIC_API_KEY || body.api_key || '');
  if (!apiKey) {
    return {
      statusCode: 401, headers: CORS,
      body: JSON.stringify({ error: 'Anthropic API key belum dikonfigurasi.' }),
    };
  }

  const model   = MODEL_MAP[body.model] || body.model || MODEL_MAP.haiku;
  const payload_obj = {
    model,
    max_tokens: body.max_tokens || 3000,
    messages:   body.messages || [],
  };
  if (body.system) payload_obj.system = body.system;

  const payload = JSON.stringify(payload_obj);

  const options = {
    hostname: 'api.anthropic.com',
    path:     '/v1/messages',
    method:   'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length':    Buffer.byteLength(payload),
    },
  };

  try {
    const result = await httpsPost(options, payload);

    let data;
    try { data = JSON.parse(result.body); }
    catch {
      return {
        statusCode: result.status, headers: CORS,
        body: JSON.stringify({ error: `Anthropic non-JSON response (${result.status})` }),
      };
    }

    return { statusCode: result.status, headers: CORS, body: JSON.stringify(data) };

  } catch (err) {
    const isTimeout = err.message === 'timeout';
    return {
      statusCode: isTimeout ? 504 : 500, headers: CORS,
      body: JSON.stringify({
        error: isTimeout ? 'Claude API timeout (>24s).' : `Network error: ${err.message}`,
      }),
    };
  }
};
