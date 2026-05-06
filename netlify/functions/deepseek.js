/**
 * ERA-CAM Netlify Function — DeepSeek API Proxy (OpenAI-compatible)
 * Route: /api/deepseek  →  /.netlify/functions/deepseek
 */

const MODEL_MAP = {
  'deepseek-v3':       'deepseek-chat',
  'deepseek-r1':       'deepseek-reasoner',
  'deepseek-chat':     'deepseek-chat',
  'deepseek-reasoner': 'deepseek-reasoner',
};

function sanitizeKey(key) {
  if (!key) return '';
  const replacements = [
    ['–', '-'], ['—', '-'], ['‒', '-'], ['‑', '-'],
    [''', "'"], [''', "'"], ['"', '"'], ['"', '"'],
  ];
  for (const [bad, good] of replacements) key = key.split(bad).join(good);
  return key.trim().replace(/[^\x20-\x7E]/g, '');
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const apiKey = sanitizeKey(process.env.DEEPSEEK_API_KEY || body.api_key || '');
  if (!apiKey) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'DeepSeek API key belum dikonfigurasi. Set DEEPSEEK_API_KEY di Netlify Environment Variables, atau masukkan di Settings ERA-CAM.',
      }),
    };
  }

  const model    = MODEL_MAP[body.model] || body.model || 'deepseek-chat';
  const messages = [...(body.messages || [])];
  if (body.system) messages.unshift({ role: 'system', content: body.system });

  const payload = {
    model,
    max_tokens: body.max_tokens || 3000,
    messages,
  };

  try {
    // AbortController untuk timeout 24 detik (di bawah Netlify limit 26s)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 24000);

    let res;
    try {
      res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Handle non-JSON responses
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      return {
        statusCode: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `DeepSeek returned non-JSON (${res.status}): ${text.slice(0, 200)}` }),
      };
    }

    const data = await res.json();

    // Normalize to Anthropic-like format so frontend handles both the same way
    if (res.ok) {
      const text = data.choices?.[0]?.message?.content || '';
      const normalized = {
        content: [{ type: 'text', text }],
        model,
        usage: data.usage || {},
        _raw: data,
      };
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(normalized),
      };
    }

    // DeepSeek error response
    const errMsg = data.error?.message || data.message || JSON.stringify(data);
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: `DeepSeek API error (${res.status}): ${errMsg}` }),
    };

  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return {
      statusCode: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: isTimeout
          ? 'DeepSeek API timeout (>24s). Coba lagi atau gunakan DeepSeek-V3 yang lebih cepat.'
          : `Connection error: ${err.message}`,
      }),
    };
  }
};
