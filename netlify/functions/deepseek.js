/**
 * ERA-CAM Netlify Function — DeepSeek API Proxy
 * Menggunakan https module bawaan Node.js (kompatibel semua versi)
 */
const https = require('https');

const MODEL_MAP = {
  'deepseek-v3':       'deepseek-chat',
  'deepseek-r1':       'deepseek-reasoner',
  'deepseek-chat':     'deepseek-chat',
  'deepseek-reasoner': 'deepseek-reasoner',
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

  const apiKey = sanitizeKey(process.env.DEEPSEEK_API_KEY || body.api_key || '');
  if (!apiKey) {
    return {
      statusCode: 401, headers: CORS,
      body: JSON.stringify({ error: 'DeepSeek API key belum dikonfigurasi.' }),
    };
  }

  const model    = MODEL_MAP[body.model] || body.model || 'deepseek-chat';
  const messages = [...(body.messages || [])];
  if (body.system) messages.unshift({ role: 'system', content: body.system });

  const payload = JSON.stringify({
    model,
    max_tokens: body.max_tokens || 2000,
    messages,
  });

  const options = {
    hostname: 'api.deepseek.com',
    path:     '/v1/chat/completions',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Authorization':  `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  try {
    const result = await httpsPost(options, payload);

    let data;
    try { data = JSON.parse(result.body); }
    catch {
      return {
        statusCode: result.status, headers: CORS,
        body: JSON.stringify({ error: `DeepSeek non-JSON response (${result.status}): ${result.body.slice(0,200)}` }),
      };
    }

    if (result.status === 200) {
      const text = data.choices?.[0]?.message?.content || '';
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          content: [{ type: 'text', text }],
          model,
          usage: data.usage || {},
        }),
      };
    }

    const errMsg = data.error?.message || data.message || JSON.stringify(data);
    return {
      statusCode: result.status, headers: CORS,
      body: JSON.stringify({ error: `DeepSeek (${result.status}): ${errMsg}` }),
    };

  } catch (err) {
    const isTimeout = err.message === 'timeout';
    return {
      statusCode: isTimeout ? 504 : 500, headers: CORS,
      body: JSON.stringify({
        error: isTimeout
          ? 'DeepSeek timeout (>24s). Coba lagi atau gunakan model deepseek-chat.'
          : `Network error: ${err.message}`,
      }),
    };
  }
};
