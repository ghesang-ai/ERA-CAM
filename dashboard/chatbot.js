/* ERA-CAM Chatbot Widget — floating assistant, support Claude & DeepSeek */
(function () {
  'use strict';

  /* ── System prompt context ── */
  const SYSTEM_PROMPT = `Kamu adalah ERA-CAM Assistant, chatbot cerdas untuk Erajaya Campaign Analytics & Monitoring System.

Kamu memiliki pengetahuan tentang data kampanye berikut:

FLYER CAMPAIGN (Januari – Maret 2026):
- Total outlet: 135 (Jabodetabek + Banten)
- Revenue Maret: Rp 218,8 M | Incremental Revenue: Rp 82,0 M
- Store Impact Rate: 94,8% (128/135 outlet)
- Strong Impact: 85 outlet | Excellent Tier: 73 outlet
- Growth avg Feb→Mar: +53,1%
- Top outlet: ERAFONE AND MORE BINTARO X-CHANGE (growth +84,2%), ERAFONE AND MORE CIPUTRA CITRA RAYA (+81,0%)

SPANDUK FASAD — BEBAS TUKAR (13 Feb – 12 Jun 2026):
- 13 outlet, biaya media Rp 23,9 jt total
- ROI avg: 72,2x | 11 berhasil (84,6%), 2 belum berhasil
- Walk-in growth avg: +22,5% | Sales growth avg: +23,8%
- Top ROI: ERAFONE 2.5 PAJAJARAN PAMULANG (317x), ERAFONE 2.5 GRAND BATAVIA (298,8x)
- Outlet belum berhasil: ERAFONE 2.5 SAMANHUDI (-144,7x), ERAFONE 2.5 MENCENG (-43,6x)

UMBUL-UMBUL SAMSUNG SEP (Campaign April 2026):
- Lokasi: Serpong Paradise (Samsung SEP)
- Baseline Mar: WIC 79, Transaksi 76, Revenue Rp 527,7 jt
- Campaign Apr: WIC 66, Transaksi 42, Revenue Rp 291,4 jt
- Looker naik +700% (3→24 orang) — brand awareness meningkat
- Conversion turun 96,2%→63,6% — perlu investigasi faktor eksternal

Jawab pertanyaan tentang performa kampanye, outlet, ROI, dan analitik dalam Bahasa Indonesia.
Gunakan format yang jelas dengan angka dan insight yang actionable.
Jika tidak tahu sesuatu, katakan jujur.`;

  /* ── Quick reply suggestions ── */
  const QUICK_REPLIES = [
    '📊 Ringkasan semua campaign?',
    '🏆 Top 5 outlet Flyer?',
    '💰 ROI tertinggi Spanduk?',
    '🏮 Insight Umbul-Umbul?',
    '📉 Outlet yang perlu perhatian?',
  ];

  /* ── Model definitions ── */
  const MODELS = [
    { id: 'haiku',             label: '⚡ Haiku',    sub: 'Cepat',     provider: 'anthropic', color: '#f4a11d' },
    { id: 'sonnet',            label: '✨ Sonnet',   sub: 'Dalam',     provider: 'anthropic', color: '#f4a11d' },
    { id: 'deepseek-chat',     label: '🚀 DS-V3',    sub: 'Murah',     provider: 'deepseek',  color: '#7c3aed' },
    { id: 'deepseek-reasoner', label: '🧠 DS-R1',    sub: 'Reasoning', provider: 'deepseek',  color: '#7c3aed' },
  ];

  const PROVIDER_INFO = {
    anthropic: { name: 'Claude (Anthropic)', lsKey: 'eracam_api_key',      endpoint: '/api/claude',   color: '#f4a11d' },
    deepseek:  { name: 'DeepSeek AI',        lsKey: 'eracam_deepseek_key', endpoint: '/api/deepseek', color: '#7c3aed' },
  };

  let isOpen      = false;
  let messages    = [];
  let isLoading   = false;
  let showSettings = false;
  let selectedModel = localStorage.getItem('eracam_chat_model') || 'haiku';

  function getCurrentProvider() {
    const m = MODELS.find(m => m.id === selectedModel) || MODELS[0];
    return PROVIDER_INFO[m.provider];
  }
  function getApiKey() {
    return localStorage.getItem(getCurrentProvider().lsKey) || '';
  }
  function isDeepSeek() {
    return (MODELS.find(m => m.id === selectedModel) || {}).provider === 'deepseek';
  }

  /* ── Inject CSS ── */
  const style = document.createElement('style');
  style.textContent = `
  #eracam-chat-wrap * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
  #eracam-fab {
    position: fixed; bottom: 28px; right: 28px; z-index: 9999;
    width: 56px; height: 56px; border-radius: 50%;
    background: linear-gradient(135deg, #1a2e5a, #3a86ff);
    box-shadow: 0 4px 16px rgba(26,46,90,0.4);
    border: none; cursor: pointer; display: flex; align-items: center;
    justify-content: center; font-size: 22px; transition: transform 0.2s, box-shadow 0.2s;
  }
  #eracam-fab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(26,46,90,0.5); }
  #eracam-fab.open { background: linear-gradient(135deg, #e63946, #ff6b6b); }
  #eracam-fab-badge {
    position: absolute; top: -2px; right: -2px;
    background: #f4a11d; color: #1a2e5a; font-size: 9px; font-weight: 800;
    padding: 2px 5px; border-radius: 8px; line-height: 1.3;
    display: none;
  }
  #eracam-panel {
    position: fixed; bottom: 96px; right: 28px; z-index: 9998;
    width: 380px; max-height: 600px;
    background: #fff; border-radius: 16px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.2);
    display: flex; flex-direction: column; overflow: hidden;
    transform: scale(0.92) translateY(12px); opacity: 0;
    pointer-events: none; transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
  }
  #eracam-panel.open {
    transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
  }
  .ec-header {
    background: linear-gradient(135deg, #1a2e5a, #243b6e);
    padding: 14px 16px; color: #fff;
    display: flex; align-items: center; justify-content: space-between;
    flex-shrink: 0;
  }
  .ec-header-left { display: flex; align-items: center; gap: 10px; }
  .ec-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: linear-gradient(135deg, #f4a11d, #e59310);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; flex-shrink: 0;
  }
  .ec-title { font-size: 13.5px; font-weight: 700; }
  .ec-subtitle { font-size: 10.5px; color: #a8b8d8; margin-top: 1px; display: flex; align-items: center; gap: 5px; }
  .ec-provider-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .ec-header-btns { display: flex; gap: 4px; }
  .ec-hbtn {
    background: rgba(255,255,255,0.12); border: none; color: #a8b8d8;
    border-radius: 6px; padding: 5px 8px; cursor: pointer; font-size: 13px;
    transition: all 0.15s;
  }
  .ec-hbtn:hover { background: rgba(255,255,255,0.22); color: #fff; }

  /* Settings panel */
  .ec-settings {
    background: #f8f9fb; border-bottom: 1px solid #e5e7eb;
    padding: 14px 16px; flex-shrink: 0; overflow-y: auto; max-height: 260px;
  }
  .ec-settings-title { font-size: 11.5px; font-weight: 800; color: #1a2e5a; margin-bottom: 12px;
    display: flex; align-items: center; justify-content: space-between; }
  .ec-settings-link { font-size: 10.5px; font-weight: 600; color: #3a86ff; text-decoration: none; }
  .ec-settings-link:hover { text-decoration: underline; }
  .ec-settings-label { font-size: 11px; color: #6b7280; margin-bottom: 4px; font-weight: 600; }

  /* Provider tabs */
  .ec-provider-tabs { display: flex; gap: 0; margin-bottom: 10px; border-radius: 8px; overflow: hidden; border: 1.5px solid #e5e7eb; }
  .ec-provider-tab {
    flex: 1; padding: 7px 4px; border: none; cursor: pointer; font-size: 11px; font-weight: 700;
    text-align: center; background: #fff; color: #6b7280; transition: all 0.15s;
  }
  .ec-provider-tab + .ec-provider-tab { border-left: 1.5px solid #e5e7eb; }
  .ec-provider-tab.active-a { background: #fef3c7; color: #92400e; }
  .ec-provider-tab.active-d { background: #ede9fe; color: #5b21b6; }

  /* Model tabs */
  .ec-model-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
  .ec-model-tab {
    padding: 7px 6px; border: 1.5px solid #e5e7eb;
    border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 600;
    text-align: center; background: #fff; color: #6b7280; transition: all 0.15s; display:none;
  }
  .ec-model-tab.visible { display: block; }
  .ec-model-tab.active-a { border-color: #f4a11d; background: #fef9ec; color: #92400e; }
  .ec-model-tab.active-d { border-color: #7c3aed; background: #f5f3ff; color: #5b21b6; }

  .ec-key-status { font-size: 10.5px; margin-top: 4px; padding: 4px 8px; border-radius: 6px; font-weight: 600; }
  .ec-key-ok  { background: #dcfce7; color: #166534; }
  .ec-key-err { background: #fee2e2; color: #991b1b; }

  .ec-save-btn {
    margin-top: 2px; width: 100%; padding: 8px; background: #1a2e5a;
    color: #fff; border: none; border-radius: 8px; font-size: 12px;
    font-weight: 700; cursor: pointer; transition: background 0.15s;
  }
  .ec-save-btn:hover { background: #243b6e; }

  /* Messages */
  .ec-messages {
    flex: 1; overflow-y: auto; padding: 14px 14px 8px;
    display: flex; flex-direction: column; gap: 10px; min-height: 0;
  }
  .ec-messages::-webkit-scrollbar { width: 4px; }
  .ec-messages::-webkit-scrollbar-track { background: transparent; }
  .ec-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }

  .ec-bubble {
    max-width: 88%; word-wrap: break-word; font-size: 13px; line-height: 1.55;
  }
  .ec-bubble.user {
    background: linear-gradient(135deg, #1a2e5a, #243b6e);
    color: #fff; padding: 10px 13px; border-radius: 14px 14px 4px 14px;
    align-self: flex-end;
  }
  .ec-bubble.bot {
    background: #f0f2f7; color: #1a1a2e;
    padding: 10px 13px; border-radius: 14px 14px 14px 4px;
    align-self: flex-start;
  }
  .ec-bubble.bot-ds {
    background: #f5f3ff; color: #1a1a2e;
    padding: 10px 13px; border-radius: 14px 14px 14px 4px;
    align-self: flex-start; border-left: 3px solid #7c3aed;
  }
  .ec-bubble.error {
    background: #fee2e2; color: #991b1b;
    padding: 10px 13px; border-radius: 14px;
    align-self: flex-start; font-size: 12px;
  }
  .ec-typing {
    display: flex; gap: 4px; padding: 10px 13px; background: #f0f2f7;
    border-radius: 14px 14px 14px 4px; align-self: flex-start; width: fit-content;
  }
  .ec-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #9ca3af;
    animation: ec-bounce 1.2s infinite ease-in-out;
  }
  .ec-dot:nth-child(2) { animation-delay: 0.2s; }
  .ec-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes ec-bounce { 0%,80%,100% { transform:scale(0.7); opacity:0.5; } 40% { transform:scale(1); opacity:1; } }

  /* Welcome / quick replies */
  .ec-welcome { font-size: 12.5px; color: #6b7280; text-align: center; padding: 8px 4px; }
  .ec-quick-wrap { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 14px 8px; flex-shrink: 0; }
  .ec-quick {
    font-size: 11.5px; padding: 5px 10px; border: 1.5px solid #e5e7eb;
    border-radius: 20px; cursor: pointer; background: #fff; color: #1a2e5a;
    font-weight: 600; transition: all 0.15s; white-space: nowrap;
  }
  .ec-quick:hover { background: #eef2ff; border-color: #1a2e5a; }

  /* Input */
  .ec-input-wrap {
    display: flex; gap: 8px; padding: 10px 12px 12px;
    border-top: 1px solid #f0f2f7; flex-shrink: 0;
    align-items: flex-end;
  }
  .ec-input {
    flex: 1; padding: 9px 12px; border: 1.5px solid #e5e7eb;
    border-radius: 10px; font-size: 13px; outline: none; resize: none;
    font-family: inherit; max-height: 90px; overflow-y: auto;
    transition: border-color 0.15s;
  }
  .ec-input:focus { border-color: #1a2e5a; }
  .ec-send {
    width: 38px; height: 38px; border-radius: 10px; border: none;
    background: #1a2e5a; color: #fff; cursor: pointer; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background 0.15s;
  }
  .ec-send:hover { background: #243b6e; }
  .ec-send:disabled { background: #9ca3af; cursor: not-allowed; }

  /* Powered by */
  .ec-footer-note { font-size: 10px; color: #9ca3af; text-align: center; padding: 0 12px 8px; }

  @media (max-width: 480px) {
    #eracam-panel { width: calc(100vw - 24px); right: 12px; bottom: 88px; }
    #eracam-fab { right: 16px; bottom: 20px; }
  }
  `;
  document.head.appendChild(style);

  /* ── Build HTML ── */
  const wrap = document.createElement('div');
  wrap.id = 'eracam-chat-wrap';
  wrap.innerHTML = `
  <button id="eracam-fab" title="ERA-CAM Assistant" onclick="eracamToggle()">💬
    <span id="eracam-fab-badge">AI</span>
  </button>
  <div id="eracam-panel">
    <div class="ec-header">
      <div class="ec-header-left">
        <div class="ec-avatar">🤖</div>
        <div>
          <div class="ec-title">ERA-CAM Assistant</div>
          <div class="ec-subtitle" id="ec-status-text">
            <span class="ec-provider-dot" id="ec-provider-dot"></span>
            <span id="ec-provider-label">Campaign AI</span>
          </div>
        </div>
      </div>
      <div class="ec-header-btns">
        <button class="ec-hbtn" title="Settings" onclick="eracamToggleSettings()">⚙</button>
        <button class="ec-hbtn" title="Clear chat" onclick="eracamClear()">🗑</button>
        <button class="ec-hbtn" title="Tutup" onclick="eracamToggle()">✕</button>
      </div>
    </div>

    <!-- Settings Panel -->
    <div class="ec-settings" id="ec-settings" style="display:none">
      <div class="ec-settings-title">
        ⚙ Model &amp; AI Settings
        <a class="ec-settings-link" href="settings.html">🔑 Kelola API Keys →</a>
      </div>

      <!-- Provider tabs -->
      <div class="ec-settings-label">Provider</div>
      <div class="ec-provider-tabs">
        <button class="ec-provider-tab" id="ec-ptab-anthropic" onclick="eracamSwitchProvider('anthropic')">🟠 Anthropic</button>
        <button class="ec-provider-tab" id="ec-ptab-deepseek"  onclick="eracamSwitchProvider('deepseek')">🔵 DeepSeek</button>
      </div>

      <!-- Model tabs -->
      <div class="ec-settings-label">Model</div>
      <div class="ec-model-tabs" id="ec-model-tabs">
        ${MODELS.map(m => `
          <div class="ec-model-tab" id="ec-mtab-${m.id}" data-provider="${m.provider}"
            onclick="eracamSelectModel('${m.id}')">
            ${m.label}<br><span style="font-size:10px;font-weight:400">${m.sub}</span>
          </div>`).join('')}
      </div>

      <!-- Key status -->
      <div id="ec-key-status" class="ec-key-status ec-key-err">⚠️ API key belum dikonfigurasi</div>

      <button class="ec-save-btn" onclick="eracamSaveSettings()">💾 Simpan &amp; Tutup Settings</button>
    </div>

    <div class="ec-messages" id="ec-messages">
      <div class="ec-welcome">
        👋 Halo! Saya ERA-CAM Assistant.<br>
        Tanya apapun tentang data campaign Erajaya.
      </div>
    </div>

    <div class="ec-quick-wrap" id="ec-quick-replies"></div>

    <div class="ec-input-wrap">
      <textarea class="ec-input" id="ec-input" rows="1"
        placeholder="Tanya tentang Flyer, Spanduk, Umbul-Umbul..."
        onkeydown="eracamKeydown(event)"
        oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
      <button class="ec-send" id="ec-send-btn" onclick="eracamSend()" title="Kirim">➤</button>
    </div>
    <div class="ec-footer-note" id="ec-footer-note">Powered by Claude (Anthropic) · ERA-CAM v2</div>
  </div>`;
  document.body.appendChild(wrap);

  /* ── Init UI state ── */
  function initUI() {
    updateSubtitle();
    updateSettingsPanel();
    renderQuickReplies();
  }

  function updateSubtitle() {
    const prov = getCurrentProvider();
    const mInfo = MODELS.find(m => m.id === selectedModel) || MODELS[0];
    const dot   = document.getElementById('ec-provider-dot');
    const lbl   = document.getElementById('ec-provider-label');
    const foot  = document.getElementById('ec-footer-note');
    if (dot) dot.style.background = mInfo.color;
    if (lbl) lbl.textContent = `${prov.name} · ${mInfo.label.replace(/[🟠🔵⚡✨🚀🧠]/g,'').trim()}`;
    if (foot) {
      foot.textContent = isDeepSeek()
        ? 'Powered by DeepSeek AI · ERA-CAM v2'
        : 'Powered by Claude (Anthropic) · ERA-CAM v2';
    }
  }

  function updateSettingsPanel() {
    const mInfo     = MODELS.find(m => m.id === selectedModel) || MODELS[0];
    const provider  = mInfo.provider;
    const isDS      = provider === 'deepseek';

    // Provider tabs highlight
    const pTabA = document.getElementById('ec-ptab-anthropic');
    const pTabD = document.getElementById('ec-ptab-deepseek');
    if (pTabA) { pTabA.className = 'ec-provider-tab' + (isDS ? '' : ' active-a'); }
    if (pTabD) { pTabD.className = 'ec-provider-tab' + (isDS ? ' active-d' : ''); }

    // Show only models for active provider
    document.querySelectorAll('.ec-model-tab').forEach(el => {
      const show = el.dataset.provider === provider;
      el.classList.toggle('visible', show);
      el.classList.remove('active-a', 'active-d');
    });

    // Highlight selected model
    const activeTab = document.getElementById('ec-mtab-' + selectedModel);
    if (activeTab) activeTab.classList.add(isDS ? 'active-d' : 'active-a');

    // Key status
    const key    = getApiKey();
    const ksEl   = document.getElementById('ec-key-status');
    if (ksEl) {
      if (key) {
        ksEl.className = 'ec-key-status ec-key-ok';
        ksEl.textContent = `✅ ${isDS ? 'DeepSeek' : 'Anthropic'} key terkonfigurasi`;
      } else {
        ksEl.className = 'ec-key-status ec-key-err';
        ksEl.textContent = `⚠️ ${isDS ? 'DeepSeek' : 'Anthropic'} API key belum diset — buka 🔑 Kelola API Keys`;
      }
    }
  }

  /* ── Render quick replies ── */
  function renderQuickReplies() {
    const container = document.getElementById('ec-quick-replies');
    if (!container) return;
    if (messages.length > 1) { container.style.display = 'none'; return; }
    container.innerHTML = QUICK_REPLIES.map(q =>
      `<span class="ec-quick" onclick="eracamQuick(${JSON.stringify(q)})">${q}</span>`
    ).join('');
    container.style.display = 'flex';
  }
  renderQuickReplies();

  /* ── Toggle open/close ── */
  window.eracamToggle = function() {
    isOpen = !isOpen;
    const panel = document.getElementById('eracam-panel');
    const fab   = document.getElementById('eracam-fab');
    panel.classList.toggle('open', isOpen);
    fab.classList.toggle('open', isOpen);
    fab.textContent = isOpen ? '✕' : '💬';
    if (isOpen) {
      fab.insertAdjacentHTML('beforeend', '<span id="eracam-fab-badge">AI</span>');
      document.getElementById('ec-input')?.focus();
    }
  };

  /* ── Toggle settings ── */
  window.eracamToggleSettings = function() {
    showSettings = !showSettings;
    const s = document.getElementById('ec-settings');
    s.style.display = showSettings ? 'block' : 'none';
    if (showSettings) updateSettingsPanel();
  };

  /* ── Switch provider ── */
  window.eracamSwitchProvider = function(provider) {
    // Switch to first model of that provider
    const first = MODELS.find(m => m.provider === provider);
    if (first) { selectedModel = first.id; }
    updateSettingsPanel();
    updateSubtitle();
  };

  /* ── Select model ── */
  window.eracamSelectModel = function(modelId) {
    selectedModel = modelId;
    localStorage.setItem('eracam_chat_model', modelId);
    updateSettingsPanel();
    updateSubtitle();
  };

  /* ── Save settings ── */
  window.eracamSaveSettings = function() {
    localStorage.setItem('eracam_chat_model', selectedModel);
    const mInfo = MODELS.find(m => m.id === selectedModel) || MODELS[0];
    eracamToggleSettings();
    addMessage('bot', `✓ Model dipilih: **${mInfo.label}** (${getCurrentProvider().name}). ${getApiKey() ? 'API key siap.' : '⚠️ API key belum diset — buka halaman Settings.'}`);
  };

  /* ── Clear chat ── */
  window.eracamClear = function() {
    messages = [];
    const container = document.getElementById('ec-messages');
    container.innerHTML = `<div class="ec-welcome">👋 Halo! Saya ERA-CAM Assistant.<br>Tanya apapun tentang data campaign Erajaya.</div>`;
    renderQuickReplies();
  };

  /* ── Quick reply ── */
  window.eracamQuick = function(text) {
    document.getElementById('ec-input').value = text;
    eracamSend();
  };

  /* ── Keydown handler ── */
  window.eracamKeydown = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); eracamSend(); }
  };

  /* ── Add message to UI ── */
  function addMessage(role, text) {
    if (role !== 'typing') {
      messages.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
    }
    const container = document.getElementById('ec-messages');
    const div = document.createElement('div');
    const bubbleClass = role === 'typing' ? 'ec-typing'
                      : role === 'user'   ? 'ec-bubble user'
                      : role === 'error'  ? 'ec-bubble error'
                      : isDeepSeek()      ? 'ec-bubble bot-ds'
                      : 'ec-bubble bot';
    div.className = bubbleClass;
    div.id = role === 'typing' ? 'ec-typing-indicator' : '';
    if (role === 'typing') {
      div.innerHTML = '<div class="ec-dot"></div><div class="ec-dot"></div><div class="ec-dot"></div>';
    } else {
      div.innerHTML = text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    if (role !== 'typing') renderQuickReplies();
    return div;
  }

  /* ── Send message ── */
  window.eracamSend = async function() {
    const input = document.getElementById('ec-input');
    const text  = input.value.trim();
    if (!text || isLoading) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      addMessage('error',
        `⚠️ API key belum dikonfigurasi untuk ${getCurrentProvider().name}.\n` +
        `Klik ⚙ → atau buka halaman <a href="settings.html" style="color:#3a86ff">🔑 API Keys Settings</a>.`
      );
      return;
    }

    input.value = '';
    input.style.height = 'auto';
    isLoading = true;
    document.getElementById('ec-send-btn').disabled = true;

    addMessage('user', text);
    const typing = addMessage('typing', '');

    try {
      const prov     = getCurrentProvider();
      const payload  = {
        model:      selectedModel,
        system:     SYSTEM_PROMPT,
        messages:   messages.filter(m => m.role === 'user' || m.role === 'assistant'),
        api_key:    apiKey,
        max_tokens: 1500,
      };

      const resp = await fetch(prov.endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await resp.json();
      typing.remove();

      if (!resp.ok) {
        addMessage('error', '⚠ ' + (data.error || data.message || `HTTP ${resp.status}`));
      } else {
        const reply = data.content?.[0]?.text || 'Tidak ada respons.';
        addMessage('bot', reply);
      }
    } catch (err) {
      typing.remove();
      addMessage('error', '⚠ Tidak dapat terhubung ke server. Pastikan server.py berjalan.');
    }

    isLoading = false;
    document.getElementById('ec-send-btn').disabled = false;
    document.getElementById('ec-input').focus();
  };

  // Init
  initUI();

  // Show badge after 2s
  setTimeout(() => {
    const badge = document.getElementById('eracam-fab-badge');
    if (badge && !isOpen) badge.style.display = 'block';
  }, 2000);

})();
