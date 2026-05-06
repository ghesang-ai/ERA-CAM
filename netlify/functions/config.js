/**
 * ERA-CAM Netlify Function — Config endpoint (dummy, keys managed via env vars)
 * Route: /api/config  →  /.netlify/functions/config
 */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
      has_deepseek_key:  !!process.env.DEEPSEEK_API_KEY,
      note: 'Di Netlify, API keys dikelola via Environment Variables (Site Settings → Environment Variables)',
    }),
  };
};
