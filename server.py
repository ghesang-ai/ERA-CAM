#!/usr/bin/env python3
"""ERA-CAM Local Dev Server — serves dashboard/ with Claude & DeepSeek API proxy."""
import http.server, urllib.request, json, os
from pathlib import Path

PORT = 4567
SERVE_DIR = Path(__file__).parent / 'dashboard'
_api_key      = os.environ.get('ANTHROPIC_API_KEY', '')
_deepseek_key = os.environ.get('DEEPSEEK_API_KEY', '')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SERVE_DIR), **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors(); self.end_headers()

    def do_POST(self):
        if   self.path == '/api/claude':           self._claude()
        elif self.path == '/api/deepseek':         self._deepseek()
        elif self.path == '/api/config':           self._config()
        elif self.path == '/api/save-campaign':    self._save_campaign()
        elif self.path == '/api/delete-campaign':  self._delete_campaign()
        else:
            self.send_response(404); self.end_headers()

    @staticmethod
    def _sanitize_key(key):
        """Normalize API key: ganti karakter tipografis, pastikan pure ASCII."""
        if not key:
            return key
        # Ganti typographic dashes/quotes yang sering muncul akibat autocorrect
        for bad, good in [('–','-'),('—','-'),('‒','-'),('‑','-'),
                          ('‘',"'"),('’',"'"),('“','"'),('”','"'),
                          ('­',''),('​',''),(' ',' ')]:
            key = key.replace(bad, good)
        # Final: strip spasi & pastikan ASCII-only
        return key.strip().encode('ascii', errors='ignore').decode('ascii')

    def _claude(self):
        global _api_key
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))

        key = self._sanitize_key(_api_key or body.pop('api_key', ''))
        if not key:
            return self._resp(401, {'error': 'API key belum dikonfigurasi. Masukkan Anthropic API key di panel Settings chatbot (ikon ⚙ di pojok chat).'})

        model_raw = body.get('model', 'haiku')
        model_map = {
            'haiku':  'claude-haiku-4-5-20251001',
            'sonnet': 'claude-sonnet-4-6',
            'auto':   'claude-sonnet-4-6',
        }
        model = model_map.get(model_raw, model_raw)

        payload = {
            'model': model,
            'max_tokens': body.get('max_tokens', 3000),
            'messages': body['messages'],
        }
        if body.get('system'):
            payload['system'] = body['system']

        req = urllib.request.Request(
            'https://api.anthropic.com/v1/messages',
            data=json.dumps(payload).encode(),
            headers={
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
            method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                self._resp(200, json.loads(r.read()))
        except urllib.error.HTTPError as e:
            self._resp(e.code, json.loads(e.read()))
        except Exception as e:
            self._resp(500, {'error': str(e)})

    def _deepseek(self):
        """POST /api/deepseek — proxy ke DeepSeek OpenAI-compatible API."""
        global _deepseek_key
        length = int(self.headers.get('Content-Length', 0))
        body   = json.loads(self.rfile.read(length))

        key = self._sanitize_key(_deepseek_key or body.pop('api_key', ''))
        if not key:
            return self._resp(401, {'error': 'DeepSeek API key belum dikonfigurasi. Masukkan di Settings (menu Admin → API Keys Settings).'})

        model_raw = body.get('model', 'deepseek-chat')
        model_map = {
            'deepseek-v3':       'deepseek-chat',
            'deepseek-r1':       'deepseek-reasoner',
            'deepseek-chat':     'deepseek-chat',
            'deepseek-reasoner': 'deepseek-reasoner',
        }
        model = model_map.get(model_raw, model_raw)

        # DeepSeek uses OpenAI-compatible format
        payload = {
            'model':      model,
            'max_tokens': body.get('max_tokens', 3000),
            'messages':   body['messages'],
        }
        if body.get('system'):
            payload['messages'] = [{'role': 'system', 'content': body['system']}] + payload['messages']

        req = urllib.request.Request(
            'https://api.deepseek.com/v1/chat/completions',
            data=json.dumps(payload).encode(),
            headers={
                'Content-Type':  'application/json',
                'Authorization': f'Bearer {key}',
            },
            method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                resp_data = json.loads(r.read())
                # Normalize to Anthropic-like response so frontend can handle both
                content_text = resp_data.get('choices', [{}])[0].get('message', {}).get('content', '')
                normalized = {
                    'content': [{'type': 'text', 'text': content_text}],
                    'model': model,
                    'usage': resp_data.get('usage', {}),
                    '_raw': resp_data,
                }
                self._resp(200, normalized)
        except urllib.error.HTTPError as e:
            try:    err_body = json.loads(e.read())
            except: err_body = {'error': f'HTTP {e.code}'}
            self._resp(e.code, err_body)
        except Exception as e:
            self._resp(500, {'error': str(e)})

    def _save_campaign(self):
        """POST /api/save-campaign — tulis entry baru ke campaignRegistry di data.js"""
        length = int(self.headers.get('Content-Length', 0))
        body   = json.loads(self.rfile.read(length))

        required = ['id','nama','bulan','tahun','quarter','tipe','icon',
                    'jumlah_toko','biaya_cetak','biaya_media','revenue_increment',
                    'status','catatan']
        for f in required:
            if f not in body:
                return self._resp(400, {'error': f'Field wajib tidak ada: {f}'})

        data_js = SERVE_DIR / 'data.js'
        try:
            content = data_js.read_text(encoding='utf-8')

            # Cek duplikat ID — hanya cek pada baris aktif (bukan di dalam komentar //)
            import re as _re
            dup_pat = _re.compile(
                r'^\s{0,4}id\s*:\s*"' + _re.escape(body['id']) + r'"',
                _re.MULTILINE
            )
            if dup_pat.search(content):
                return self._resp(409, {'error': f'ID "{body["id"]}" sudah ada di data.js. Gunakan ID yang berbeda.'})

            # Build JS entry string
            c = body
            entry = (
                f'  {{\n'
                f'    id:                 "{c["id"]}",\n'
                f'    nama:               "{c["nama"]}",\n'
                f'    bulan:              {c["bulan"]},\n'
                f'    tahun:              {c["tahun"]},\n'
                f'    quarter:            "{c["quarter"]}",\n'
                f'    tipe:               "{c["tipe"]}",\n'
                f'    icon:               "{c["icon"]}",\n'
                f'    jumlah_toko:        {c["jumlah_toko"]},\n'
                f'    biaya_cetak:        {c["biaya_cetak"]},\n'
                f'    biaya_media:        {c["biaya_media"]},\n'
                f'    revenue_increment:  {c["revenue_increment"]},\n'
                f'    status:             "{c["status"]}",\n'
                f'    catatan:            "{c["catatan"]}",\n'
                f'  }},\n\n'
            )

            # Insertion strategy: cari quarter section berikutnya, atau fallback ke TEMPLATE marker
            q_order  = ['Q1','Q2','Q3','Q4']
            inserted = False

            if body['quarter'] in q_order:
                q_idx = q_order.index(body['quarter'])
                for next_q in q_order[q_idx + 1:]:
                    marker = f'  // ── {next_q} 2026'
                    if marker in content:
                        content  = content.replace(marker, entry + marker, 1)
                        inserted = True
                        break

            if not inserted:
                # Fallback: insert sebelum blok TEMPLATE
                template_marker = '  // ── TEMPLATE'
                if template_marker in content:
                    content  = content.replace(template_marker, entry + template_marker, 1)
                    inserted = True

            if not inserted:
                return self._resp(500, {'error': 'Tidak bisa menemukan insertion point di data.js'})

            data_js.write_text(content, encoding='utf-8')
            print(f'  ✓ Campaign SAVED  : {body["id"]} — {body["nama"]}')
            self._resp(200, {'success': True, 'id': body['id'], 'nama': body['nama']})

        except Exception as e:
            self._resp(500, {'error': str(e)})

    def _delete_campaign(self):
        """POST /api/delete-campaign — hapus entry dari campaignRegistry di data.js berdasarkan id"""
        length = int(self.headers.get('Content-Length', 0))
        body   = json.loads(self.rfile.read(length))
        cam_id = body.get('id', '').strip()

        if not cam_id:
            return self._resp(400, {'error': 'Field "id" wajib diisi'})

        data_js = SERVE_DIR / 'data.js'
        try:
            content = data_js.read_text(encoding='utf-8')

            if f'"{cam_id}"' not in content:
                return self._resp(404, {'error': f'ID "{cam_id}" tidak ditemukan di data.js'})

            # Cari blok entry: mulai dari baris '  {' sebelum id, sampai baris '  },'
            # Pendekatan line-based: lebih robust dari regex
            import re
            lines     = content.split('\n')
            id_line   = f'    id:                 "{cam_id}",'
            id_idx    = next((i for i,l in enumerate(lines) if l.strip().startswith('id:') and f'"{cam_id}"' in l), -1)
            if id_idx == -1:
                return self._resp(500, {'error': f'Gagal menemukan baris id "{cam_id}" — hapus manual di data.js'})
            # Walk back to opening '  {'
            open_idx = id_idx
            while open_idx >= 0 and lines[open_idx].rstrip() != '  {':
                open_idx -= 1
            # Walk forward to closing '  },'
            close_idx = id_idx
            while close_idx < len(lines) and lines[close_idx].rstrip() not in ('  },', '  },'):
                close_idx += 1
            if open_idx < 0 or close_idx >= len(lines):
                return self._resp(500, {'error': f'Gagal parse blok entry "{cam_id}" — hapus manual di data.js'})
            # Remove lines open_idx .. close_idx (inclusive) + one trailing blank line if present
            end = close_idx + 1
            if end < len(lines) and lines[end] == '':
                end += 1
            del lines[open_idx:end]
            new_content = '\n'.join(lines)
            n           = 1
            # (n always 1 when we reach here via line-based approach)

            # Bersihkan double blank line berlebih
            new_content = re.sub(r'\n{3,}', '\n\n', new_content)
            data_js.write_text(new_content, encoding='utf-8')
            print(f'  ✓ Campaign DELETED: {cam_id}')
            self._resp(200, {'success': True, 'id': cam_id})

        except Exception as e:
            self._resp(500, {'error': str(e)})

    def _config(self):
        global _api_key, _deepseek_key
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
        if 'api_key' in body:
            _api_key = body['api_key'].strip()
            print(f'  ✓ Anthropic key updated — {"configured" if _api_key else "cleared"}')
        if 'deepseek_key' in body:
            _deepseek_key = body['deepseek_key'].strip()
            print(f'  ✓ DeepSeek key updated  — {"configured" if _deepseek_key else "cleared"}')
        self._resp(200, {
            'ok': True,
            'has_anthropic_key': bool(_api_key),
            'has_deepseek_key':  bool(_deepseek_key),
        })

    def _resp(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        print(f'  [{self.address_string()}] {fmt % args}')

if __name__ == '__main__':
    print('─' * 60)
    print('  ERA-CAM Local Development Server')
    print(f'  URL        : http://localhost:{PORT}')
    print(f'  Anthropic  : {"✓ Configured via env" if _api_key else "✗ Not set — masukkan di Settings (API Keys)"}')
    print(f'  DeepSeek   : {"✓ Configured via env" if _deepseek_key else "✗ Not set — masukkan di Settings (API Keys)"}')
    print(f'  Files      : {SERVE_DIR}')
    print(f'  Settings   : http://localhost:{PORT}/settings.html')
    print('─' * 60)
    http.server.HTTPServer(('', PORT), Handler).serve_forever()
