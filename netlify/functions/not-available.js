/**
 * ERA-CAM Netlify Function — Fitur tidak tersedia di Netlify
 * Route: /api/save-campaign, /api/delete-campaign
 * Campaign CRUD membutuhkan akses tulis ke data.js — tidak bisa di serverless.
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
    statusCode: 503,
    headers,
    body: JSON.stringify({
      error: '⚠️ Fitur ini tidak tersedia di Netlify. Untuk menambah/hapus campaign, jalankan server lokal: python3 server.py (localhost:4567) lalu edit data.js secara manual.',
      mode: 'netlify-static',
    }),
  };
};
