/**
 * ERA-CAM AI Analysis Panel — reusable panel untuk generate Claude analysis
 * Usage: initAIAnalysis({ containerId, pageTitle, campaignType, systemPrompt })
 */
function initAIAnalysis(cfg) {
  const container = document.getElementById(cfg.containerId);
  if (!container) return;

  let claudeModel  = 'sonnet';
  let activePills  = ['Descriptive'];
  let isGenerating = false;

  const PILL_DEFS = [
    { id: 'Descriptive',  icon: '📊', label: 'Descriptive'  },
    { id: 'Diagnostic',   icon: '🔍', label: 'Diagnostic'   },
    { id: 'Predictive',   icon: '🔮', label: 'Predictive'   },
    { id: 'Prescriptive', icon: '💡', label: 'Prescriptive' },
    { id: 'Sales',        icon: '📈', label: 'Sales'        },
    { id: 'Operation',    icon: '⚙️', label: 'Operation'    },
    { id: 'Financial',    icon: '💰', label: 'Financial'    },
  ];

  /* ── Inject CSS once ── */
  if (!document.getElementById('ai-analysis-css')) {
    const s = document.createElement('style');
    s.id = 'ai-analysis-css';
    s.textContent = `
    .ai-wrap { background:#fff; border-radius:16px; box-shadow:0 2px 16px rgba(0,0,0,0.09); overflow:hidden; margin-bottom:24px; }
    .ai-topbar {
      background: linear-gradient(135deg, #1a2e5a 0%, #3b1f6b 100%);
      padding: 18px 24px; display:flex; align-items:center; gap:14px;
    }
    .ai-topbar-icon { font-size:26px; }
    .ai-topbar-title { font-size:15px; font-weight:800; color:#fff; }
    .ai-topbar-sub   { font-size:11.5px; color:#a8b8d8; margin-top:2px; }
    .ai-topbar-badge {
      margin-left:auto; background:rgba(255,255,255,0.15); color:#fff;
      font-size:10px; font-weight:700; padding:4px 10px; border-radius:10px;
    }
    .ai-body { padding:20px 24px; }

    /* Model tabs */
    .ai-model-tabs { display:flex; gap:10px; margin-bottom:18px; }
    .ai-model-tab {
      flex:1; border:2px solid #e5e7eb; border-radius:10px; padding:10px 12px;
      cursor:pointer; transition:all 0.15s; background:#fafbfc; text-align:center;
    }
    .ai-model-tab:hover { border-color:#1a2e5a; background:#f0f4ff; }
    .ai-model-tab.active { border-color:#1a2e5a; background:#eef2ff; box-shadow:0 0 0 3px rgba(26,46,90,0.1); }
    .ai-model-icon { font-size:18px; }
    .ai-model-name { font-size:13px; font-weight:700; color:#1a2e5a; margin-top:3px; }
    .ai-model-desc { font-size:10px; color:#6b7280; margin-top:1px; }

    /* Custom prompt */
    .ai-prompt-label { font-size:12px; font-weight:700; color:#6b7280; margin-bottom:6px; }
    .ai-prompt-label span { color:#7c3aed; }
    .ai-prompt-textarea {
      width:100%; padding:10px 13px; border:1.5px solid #e5e7eb;
      border-radius:10px; font-size:13px; font-family:inherit;
      resize:vertical; min-height:72px; outline:none; color:#1a1a2e;
      transition:border-color 0.15s;
    }
    .ai-prompt-textarea:focus { border-color:#7c3aed; }

    /* Generate button */
    .ai-gen-btn {
      width:100%; margin-top:14px; padding:13px;
      background:linear-gradient(135deg,#1a2e5a,#3a86ff);
      color:#fff; border:none; border-radius:10px; font-size:14px;
      font-weight:700; cursor:pointer; transition:all 0.2s;
      display:flex; align-items:center; justify-content:center; gap:8px;
    }
    .ai-gen-btn:hover { background:linear-gradient(135deg,#243b6e,#2870e0); transform:translateY(-1px); }
    .ai-gen-btn:disabled { background:#9ca3af; cursor:not-allowed; transform:none; }

    /* Analysis type pills */
    .ai-pills { display:flex; flex-wrap:wrap; gap:7px; margin-top:12px; }
    .ai-pill {
      padding:5px 12px; border:1.5px solid #e5e7eb; border-radius:20px;
      font-size:11.5px; font-weight:600; color:#6b7280; cursor:pointer;
      background:#fff; transition:all 0.15s; user-select:none;
    }
    .ai-pill:hover { border-color:#1a2e5a; color:#1a2e5a; }
    .ai-pill.active { border-color:#1a2e5a; background:#eef2ff; color:#1a2e5a; }

    /* Result area */
    .ai-result {
      margin-top:16px; min-height:180px; border:2px dashed #e5e7eb;
      border-radius:12px; position:relative; transition:all 0.3s;
    }
    .ai-result.has-content { border-style:solid; border-color:#e5e7eb; }
    .ai-empty-state {
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; padding:40px 24px; text-align:center; gap:10px;
    }
    .ai-empty-plus {
      width:40px; height:40px; border-radius:50%; background:#f0f2f7;
      display:flex; align-items:center; justify-content:center;
      font-size:20px; color:#9ca3af;
    }
    .ai-empty-text { font-size:12.5px; color:#9ca3af; line-height:1.6; }

    /* Loading */
    .ai-loading {
      display:flex; align-items:center; justify-content:center;
      gap:12px; padding:40px; color:#6b7280; font-size:13px;
    }
    .ai-spinner {
      width:22px; height:22px; border:2.5px solid #e5e7eb;
      border-top-color:#1a2e5a; border-radius:50%;
      animation:ai-spin 0.7s linear infinite;
    }
    @keyframes ai-spin { to { transform:rotate(360deg); } }

    /* Result content */
    .ai-result-content { padding:20px 22px; }
    .ai-result-header {
      display:flex; align-items:center; justify-content:space-between;
      margin-bottom:16px; padding-bottom:10px; border-bottom:2px solid #f0f2f7;
    }
    .ai-result-title { font-size:14px; font-weight:800; color:#1a2e5a; }
    .ai-result-meta  { font-size:11px; color:#9ca3af; }
    .ai-result-body  { font-size:13px; line-height:1.75; color:#2d3748; }
    .ai-result-body h3 { font-size:13.5px; font-weight:800; color:#1a2e5a; margin:14px 0 6px; }
    .ai-result-body p  { margin-bottom:8px; }
    .ai-result-body ul { padding-left:18px; margin-bottom:8px; }
    .ai-result-body li { margin-bottom:4px; }
    .ai-result-body strong { color:#1a2e5a; }
    .ai-result-body .up   { color:#065f46; font-weight:700; }
    .ai-result-body .dn   { color:#991b1b; font-weight:700; }
    .ai-result-actions { margin-top:14px; display:flex; gap:8px; }
    .ai-action-btn {
      padding:7px 14px; border-radius:8px; font-size:12px; font-weight:600;
      cursor:pointer; border:none; transition:all 0.15s;
    }
    .ai-action-copy { background:#f0f2f7; color:#1a2e5a; }
    .ai-action-copy:hover { background:#e5e7eb; }
    .ai-action-regen { background:#1a2e5a; color:#fff; }
    .ai-action-regen:hover { background:#243b6e; }
    .ai-error-box {
      background:#fee2e2; border:1.5px solid #fca5a5; border-radius:10px;
      padding:14px 16px; font-size:12.5px; color:#991b1b; margin:10px;
    }
    `;
    document.head.appendChild(s);
  }

  /* ── Render panel ── */
  container.innerHTML = `
  <div class="ai-wrap">
    <div class="ai-topbar">
      <div class="ai-topbar-icon">✨</div>
      <div>
        <div class="ai-topbar-title">Generate AI Analysis — Claude</div>
        <div class="ai-topbar-sub">Claude (Anthropic) akan menganalisis data ${cfg.pageTitle} secara lengkap</div>
      </div>
      <div class="ai-topbar-badge">AI POWERED</div>
    </div>
    <div class="ai-body">
      <!-- Model selector -->
      <div class="ai-model-tabs">
        <div class="ai-model-tab" onclick="aiSelectModel(this,'haiku')">
          <div class="ai-model-icon">⚡</div>
          <div class="ai-model-name">Haiku</div>
          <div class="ai-model-desc">Cepat · Hemat</div>
        </div>
        <div class="ai-model-tab active" onclick="aiSelectModel(this,'sonnet')">
          <div class="ai-model-icon">✨</div>
          <div class="ai-model-name">Sonnet</div>
          <div class="ai-model-desc">Terbaik · Dalam</div>
        </div>
        <div class="ai-model-tab" onclick="aiSelectModel(this,'auto')">
          <div class="ai-model-icon">🔄</div>
          <div class="ai-model-name">Auto</div>
          <div class="ai-model-desc">Fallback Otomatis</div>
        </div>
      </div>

      <!-- Custom prompt -->
      <div class="ai-prompt-label">✏️ Custom Prompt <span>(Opsional)</span></div>
      <textarea class="ai-prompt-textarea" id="ai-custom-prompt-${cfg.containerId}"
        placeholder="Tambahkan instruksi khusus untuk analisis Claude (opsional)... Contoh: Fokus ke outlet dengan performa di bawah 20%, atau analisis kenapa outlet X lebih baik dari Y."></textarea>

      <!-- Generate button -->
      <button class="ai-gen-btn" id="ai-gen-btn-${cfg.containerId}" onclick="aiGenerate('${cfg.containerId}')">
        ✨ Generate Analisis dengan Claude
      </button>

      <!-- Analysis type pills -->
      <div class="ai-pills" id="ai-pills-${cfg.containerId}">
        ${PILL_DEFS.map(p => `
          <span class="ai-pill${p.id==='Descriptive'?' active':''}"
            onclick="aiTogglePill(this,'${p.id}','${cfg.containerId}')">${p.icon} ${p.label}</span>
        `).join('')}
      </div>

      <!-- Result -->
      <div class="ai-result" id="ai-result-${cfg.containerId}">
        <div class="ai-empty-state">
          <div class="ai-empty-plus">+</div>
          <div class="ai-empty-text">
            Tekan tombol di atas untuk meminta Claude menganalisis data ${cfg.pageTitle} secara lengkap<br>
            <b>4 metode analisis · ${cfg.aspects || '3'} aspek · rekomendasi prioritas</b>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  /* ── Model select ── */
  window.aiSelectModel = function(el, model) {
    claudeModel = model;
    el.closest('.ai-model-tabs').querySelectorAll('.ai-model-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  };

  /* ── Toggle pill ── */
  window.aiTogglePill = function(el, id, cid) {
    el.classList.toggle('active');
    if (el.classList.contains('active')) {
      activePills.push(id);
    } else {
      activePills = activePills.filter(p => p !== id);
    }
  };

  /* ── Generate ── */
  window.aiGenerate = async function(cid) {
    if (isGenerating) return;
    isGenerating = true;

    const btn    = document.getElementById(`ai-gen-btn-${cid}`);
    const result = document.getElementById(`ai-result-${cid}`);
    const custom = document.getElementById(`ai-custom-prompt-${cid}`)?.value || '';
    const types  = activePills.length ? activePills.join(', ') : 'Descriptive, Diagnostic';

    btn.disabled = true;
    btn.innerHTML = '<div class="ai-spinner"></div> Menganalisis dengan Claude...';
    result.className = 'ai-result';
    result.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div> Claude sedang menganalisis data ${cfg.pageTitle}...</div>`;

    const systemMsg = cfg.systemPrompt + `\n\nFokus analisis yang diminta: ${types}.${custom ? '\n\nInstruksi tambahan: ' + custom : ''}
\nBerikan analisis terstruktur dalam format:\n1. Ringkasan Eksekutif\n2. Temuan Utama (bullet points)\n3. Analisis per tipe yang diminta\n4. Rekomendasi Aksi\n\nGunakan Bahasa Indonesia yang profesional dan data-driven.`;

    try {
      const apiKey = localStorage.getItem('eracam_api_key') || '';
      const resp = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: claudeModel,
          system: systemMsg,
          messages: [{ role: 'user', content: `Analisis data ${cfg.pageTitle} sekarang.` }],
          api_key: apiKey,
          max_tokens: 3000,
        })
      });

      const data = await resp.json();

      if (!resp.ok) {
        result.className = 'ai-result has-content';
        result.innerHTML = `<div class="ai-error-box">⚠ ${data.error || 'API error'}<br><br>Pastikan: (1) server.py berjalan di localhost:8080, (2) API key sudah dimasukkan di chatbot ⚙ Settings.</div>`;
      } else {
        const text = data.content?.[0]?.text || '';
        const ts   = new Date().toLocaleString('id-ID');
        result.className = 'ai-result has-content';
        result.innerHTML = `
          <div class="ai-result-content">
            <div class="ai-result-header">
              <div class="ai-result-title">✨ Analisis Claude — ${cfg.pageTitle}</div>
              <div class="ai-result-meta">${ts} · ${claudeModel}</div>
            </div>
            <div class="ai-result-body">${formatAIText(text)}</div>
            <div class="ai-result-actions">
              <button class="ai-action-btn ai-action-copy" onclick="aiCopy(this, ${JSON.stringify(text)})">📋 Copy</button>
              <button class="ai-action-btn ai-action-regen" onclick="aiGenerate('${cid}')">🔄 Generate Ulang</button>
            </div>
          </div>`;
      }
    } catch (err) {
      result.className = 'ai-result has-content';
      result.innerHTML = `<div class="ai-error-box">⚠ Koneksi gagal: ${err.message}<br><br>Pastikan server.py berjalan: <code>python3 server.py</code></div>`;
    }

    btn.disabled = false;
    btn.innerHTML = '✨ Generate Analisis dengan Claude';
    isGenerating = false;
  };

  window.aiCopy = function(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = '✓ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy', 2000);
    });
  };

  /* ── Format markdown-ish text ── */
  function formatAIText(text) {
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/^### (.*?)$/gm,'<h3>$1</h3>')
      .replace(/^## (.*?)$/gm,'<h3>$1</h3>')
      .replace(/^# (.*?)$/gm,'<h3>$1</h3>')
      .replace(/^[-•] (.*?)$/gm,'<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/\n\n/g,'</p><p>')
      .replace(/\n/g,'<br>')
      .replace(/^(?!<[hup])(.+)/gm, '<p>$1</p>');
  }
}
