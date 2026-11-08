// ═════════════════════════════════════════════════════════════════════════
// ADMIN.JS — PAINEL DE CONTROLE ADMINISTRATIVO MASTER CLUBE SECRETO
// Gestão de Modelos, Prévias vs. VIP, Upload de Mídias e Códigos PIX
// ═════════════════════════════════════════════════════════════════════════

let catalogCache = [];
let codesCache = [];
let currentCodesFilter = 'all';
let selectedFilesToUpload = [];

const CATEGORY_NAMES = {
  estudio: '📸 Estúdio & Glamour',
  cosplay: '🎭 Cosplay & Geek',
  praia: '🏋️ Praia & Fitness',
  moda: '👗 Moda & Editorial',
  streetwear: '🏙️ Streetwear & Urbana',
  viagem: '🌴 Lifestyle & Viagem'
};

function updateCoverPreview(url) {
  const img = document.getElementById('imgCoverPreview');
  const txt = document.getElementById('coverPreviewText');
  if (!img) return;
  if (url && url.trim()) {
    img.src = url.trim();
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; if (txt) txt.textContent = '❌ Imagem não encontrada'; };
    img.onload = () => { if (txt) txt.textContent = '✅ Prévia da Capa carregada'; };
  } else {
    img.style.display = 'none';
    if (txt) txt.textContent = 'Digite a URL ou selecione abaixo';
  }
}

function updateAvatarPreview(url) {
  const img = document.getElementById('imgAvatarPreview');
  const txt = document.getElementById('avatarPreviewText');
  if (!img) return;
  if (url && url.trim()) {
    img.src = url.trim();
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; if (txt) txt.textContent = '❌ Avatar não encontrado'; };
    img.onload = () => { if (txt) txt.textContent = '✅ Prévia do Avatar carregada'; };
  } else {
    img.style.display = 'none';
    if (txt) txt.textContent = 'Digite a URL ou selecione';
  }
}

async function syncAdminToGitHub() {
  const key = getAdminKey();
  if (!key) {
    showToast('Chave Master não informada.');
    return;
  }
  showToast('⏳ Sincronizando catálogo e códigos com GitHub & VPS...');
  try {
    const res = await fetch('/api/admin/sync-github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`🚀 Sincronizado com sucesso com GitHub & VPS! (${data.commitSha ? data.commitSha.slice(0, 7) : 'OK'})`);
    } else {
      showToast(data.error || 'Erro ao sincronizar com GitHub.');
    }
  } catch (err) {
    console.error('Erro na sincronização:', err);
    showToast('Erro de conexão ao sincronizar com GitHub.');
  }
}

async function generateAndCopySingleCode(modelId, creatorName, price) {
  const key = getAdminKey();
  if (!key) return;
  showToast(`⏳ Gerando código PIX para ${creatorName}...`);
  try {
    const res = await fetch('/api/admin/codes/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ type: 'SINGLE_MODEL', modelId: modelId, count: 1 })
    });
    const data = await res.json();
    if (res.ok && data.success && data.codes && data.codes.length > 0) {
      const code = data.codes[0].code;
      copyWhatsAppMessage(code, 'SINGLE_MODEL', `R$ ${price || '9,90'}`);
      showToast(`🎉 Código ${code} gerado! Mensagem WhatsApp copiada.`);
      if (document.getElementById('tab-codes') && document.getElementById('tab-codes').classList.contains('active')) {
        await loadAdminCodes();
      }
    } else {
      showToast(data.error || 'Erro ao gerar código PIX.');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro de conexão ao gerar código.');
  }
}

function getAdminKey() {
  return (sessionStorage.getItem('cs_admin_key') || '').trim();
}

function setAdminKey(key) {
  sessionStorage.setItem('cs_admin_key', (key || '').trim().toUpperCase());
}

function clearAdminKey() {
  sessionStorage.removeItem('cs_admin_key');
}

// ═════════════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO DO ADMIN
// ═════════════════════════════════════════════════════════════════════════

async function doAdminLogin(keyOverride) {
  const input = document.getElementById('adminKeyInput');
  const key = keyOverride || (input ? input.value : '');

  if (!key || !key.trim()) {
    showToast('Por favor, digite a Chave Master do Administrador.');
    if (input) input.focus();
    return;
  }

  const cleanKey = key.trim().toUpperCase();

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: cleanKey })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      setAdminKey(cleanKey);
      document.getElementById('adminLoginScreen').classList.add('hidden');
      document.getElementById('adminApp').classList.remove('hidden');
      showToast('👑 Bem-vindo, AN0N! Painel Master liberado.');
      
      // Carregar dados iniciais
      await loadAdminCatalog();
      await loadAdminCodes();
    } else {
      showToast(data.error || 'Chave Master incorreta. Acesso negado.');
      clearAdminKey();
    }
  } catch (err) {
    console.error('Erro no login:', err);
    showToast('Falha na comunicação com o servidor.');
  }
}

function doAdminLogout() {
  clearAdminKey();
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('adminLoginScreen').classList.remove('hidden');
  const input = document.getElementById('adminKeyInput');
  if (input) {
    input.value = '';
    input.focus();
  }
  showToast('Sessão encerrada com segurança.');
}

// ═════════════════════════════════════════════════════════════════════════
// NAVEGAÇÃO DE ABAS
// ═════════════════════════════════════════════════════════════════════════

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  document.querySelectorAll('.admin-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `tab-${tabName}`);
  });

  if (tabName === 'models') {
    loadAdminCatalog();
  } else if (tabName === 'media') {
    populateModelMediaSelect();
  } else if (tabName === 'codes') {
    loadAdminCodes();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('adminToast');
  const msgEl = document.getElementById('adminToastMsg');
  if (!toast || !msgEl) return;

  msgEl.textContent = msg;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// ═════════════════════════════════════════════════════════════════════════
// GESTÃO DE MODELOS & ENSAIOS
// ═════════════════════════════════════════════════════════════════════════

async function loadAdminCatalog() {
  const key = getAdminKey();
  if (!key) return;

  try {
    const res = await fetch('/api/admin/catalog', {
      headers: { 'x-admin-key': key }
    });

    if (res.status === 401) {
      doAdminLogout();
      return;
    }

    const data = await res.json();
    if (data.success && Array.isArray(data.catalog)) {
      catalogCache = data.catalog;
      renderModelsGrid();
      populateModelMediaSelect();
    }
  } catch (err) {
    console.error('Erro ao carregar catálogo:', err);
    showToast('Erro ao carregar catálogo de modelos.');
  }
}

function renderModelsGrid() {
  const grid = document.getElementById('modelsGrid');
  if (!grid) return;

  if (catalogCache.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
      Nenhuma modelo cadastrada ainda. Clique em "➕ Adicionar Nova Modelo" para começar!
    </div>`;
    return;
  }

  grid.innerHTML = catalogCache.map(model => {
    const previews = Array.isArray(model.previews) ? model.previews : [];
    const teasersCount = previews.filter(p => typeof p === 'object' && p.isTeaser).length;
    const vipsCount = previews.length - teasersCount;
    const avatarSrc = model.avatar || model.cover || 'assets/logo.jpg';
    const coverSrc = model.cover || avatarSrc;
    const catLabel = CATEGORY_NAMES[model.category] || model.category || 'Ensaio VIP';

    return `
      <div class="model-card" data-id="${model.id}">
        <!-- Capa / Banner da Modelo com Badges -->
        <div style="position: relative; width: 100%; height: 130px; border-radius: 8px; overflow: hidden; background: #0b0e14;">
          <img src="${coverSrc}" alt="${model.creatorName}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='assets/logo.jpg'" />
          <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(10,12,18,0.85) 100%);"></div>
          
          <span style="position: absolute; top: 8px; left: 8px; font-size: 10px; font-weight: 800; background: rgba(0,0,0,0.75); color: #fff; padding: 3px 8px; border-radius: 20px; backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.15);">
            ${catLabel}
          </span>

          <span style="position: absolute; top: 8px; right: 8px; font-size: 10px; font-weight: 800; background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; padding: 3px 8px; border-radius: 20px; box-shadow: 0 2px 8px rgba(225,29,72,0.4);">
            ${model.badge || 'VIP 🔥'}
          </span>
        </div>

        <!-- Avatar e Nomes -->
        <div class="model-card-top" style="margin-top: -24px; position: relative; z-index: 2; padding: 0 4px;">
          <img src="${avatarSrc}" alt="${model.creatorName}" class="model-card-avatar" style="border: 3px solid #0f131d; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" onerror="this.src='assets/logo.jpg'" />
          <div class="model-card-names">
            <div class="model-card-name" style="font-size: 15px;">${model.creatorName}</div>
            <div class="model-card-username">${model.username || ''} • <strong style="color: #10b981;">R$ ${model.individualPrice || '9,90'}</strong></div>
          </div>
        </div>

        <div style="font-size: 12px; color: #94a3b8; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; padding: 0 4px;">
          ${model.title || model.description || 'Ensaio VIP Oficial'}
        </div>

        <div class="model-card-stats">
          <span>📁 Total: <strong>${previews.length}</strong></span>
          <span style="color:#10b981;">👁️ <strong>${teasersCount}</strong> Prévias</span>
          <span style="color:#f43f5e;">🔒 <strong>${vipsCount}</strong> VIPs</span>
        </div>

        <!-- Linha 1 de Ações: Ver no Site & Gerar PIX R$ 9,90 WhatsApp -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <a href="/?modelo=${model.id}" target="_blank" class="btn-secondary" style="font-size: 11px; padding: 8px 10px; justify-content: center; text-decoration: none; border-color: rgba(255,255,255,0.15);" title="Ver modelo no site oficial">
            <span>👁️ Ver no Site</span>
          </a>
          <button class="btn-primary" style="font-size: 11px; padding: 8px 10px; justify-content: center; background: linear-gradient(135deg, #10b981, #059669); border: none;" onclick="generateAndCopySingleCode('${model.id}', '${model.creatorName}', '${model.individualPrice || '9,90'}')" title="Gera 1 código novo de R$ 9,90 (Vitalício) e copia mensagem pronta para WhatsApp">
            <span>🔑 PIX Vitalício (R$ 9,90)</span>
          </button>
        </div>

        <!-- Linha 2 de Ações: Editar, Mídias e Excluir -->
        <div class="model-card-actions">
          <button class="btn-secondary" style="flex: 1; padding: 7px 10px;" onclick="openEditModelModal('${model.id}')">
            <span>✏️ Editar</span>
          </button>
          <button class="btn-primary" style="flex: 1.2; padding: 7px 10px;" onclick="selectModelAndGoToMedia('${model.id}')">
            <span>🎬 Mídias (${previews.length})</span>
          </button>
          <button class="btn-danger" style="padding: 7px 12px;" title="Excluir Modelo" onclick="deleteModel('${model.id}', '${model.creatorName}')">
            <span>🗑️</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function selectModelAndGoToMedia(modelId) {
  switchAdminTab('media');
  const select = document.getElementById('selectModelMedia');
  if (select) {
    select.value = modelId;
    onSelectModelChange();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// MODAL: CRIAR OU EDITAR MODELO
// ═════════════════════════════════════════════════════════════════════════

function openNewModelModal() {
  document.getElementById('modalModelTitle').textContent = '➕ Adicionar Nova Modelo';
  document.getElementById('editModelId').value = '';
  document.getElementById('inputCreatorName').value = '';
  document.getElementById('inputUsername').value = '';
  document.getElementById('inputTitle').value = '';
  document.getElementById('inputCategory').value = 'estudio';
  document.getElementById('inputPrice').value = '9,90';
  document.getElementById('inputBadge').value = 'NOVO LANÇAMENTO VIP 🔥';
  document.getElementById('inputPhotoCount').value = '40';
  document.getElementById('inputVideoCount').value = '24';
  document.getElementById('inputDescription').value = '';
  document.getElementById('inputCover').value = '';
  document.getElementById('inputAvatar').value = '';
  if (document.getElementById('inputReelsVideo')) document.getElementById('inputReelsVideo').value = '';
  updateCoverPreview('');
  updateAvatarPreview('');

  document.getElementById('modalModel').classList.add('open');
}

function openEditModelModal(modelId) {
  const model = catalogCache.find(m => m.id === modelId);
  if (!model) return;

  document.getElementById('modalModelTitle').textContent = `✏️ Editar Modelo — ${model.creatorName}`;
  document.getElementById('editModelId').value = model.id;
  document.getElementById('inputCreatorName').value = model.creatorName || '';
  document.getElementById('inputUsername').value = model.username || '';
  document.getElementById('inputTitle').value = model.title || '';
  document.getElementById('inputCategory').value = model.category || 'estudio';
  document.getElementById('inputPrice').value = model.individualPrice || '9,90';
  document.getElementById('inputBadge').value = model.badge || 'VIP';
  document.getElementById('inputPhotoCount').value = model.photoCount || 0;
  document.getElementById('inputVideoCount').value = model.videoCount || 0;
  document.getElementById('inputDescription').value = model.description || '';
  document.getElementById('inputCover').value = model.cover || '';
  document.getElementById('inputAvatar').value = model.avatar || '';
  if (document.getElementById('inputReelsVideo')) document.getElementById('inputReelsVideo').value = model.reelsVideo || '';
  updateCoverPreview(model.cover || '');
  updateAvatarPreview(model.avatar || '');

  document.getElementById('modalModel').classList.add('open');
}

function closeModelModal() {
  document.getElementById('modalModel').classList.remove('open');
}

async function saveModelForm() {
  const key = getAdminKey();
  if (!key) return;

  const id = document.getElementById('editModelId').value.trim();
  const creatorName = document.getElementById('inputCreatorName').value.trim();
  const username = document.getElementById('inputUsername').value.trim();
  const title = document.getElementById('inputTitle').value.trim();
  const category = document.getElementById('inputCategory').value;
  const individualPrice = document.getElementById('inputPrice').value.trim() || '9,90';
  const badge = document.getElementById('inputBadge').value.trim();
  const photoCount = parseInt(document.getElementById('inputPhotoCount').value, 10) || 0;
  const videoCount = parseInt(document.getElementById('inputVideoCount').value, 10) || 0;
  const description = document.getElementById('inputDescription').value.trim();
  const cover = document.getElementById('inputCover').value.trim();
  const avatar = document.getElementById('inputAvatar').value.trim();
  const reelsVideo = document.getElementById('inputReelsVideo') ? document.getElementById('inputReelsVideo').value.trim() : '';

  if (!creatorName) {
    showToast('Informe o nome da criadora/modelo.');
    document.getElementById('inputCreatorName').focus();
    return;
  }

  const payload = {
    id: id || undefined,
    creatorName,
    username: username || `@${creatorName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    title: title || `Coleção Oficial ${creatorName} — Ensaio VIP & Bastidores`,
    category,
    individualPrice,
    badge: badge || 'VIP 🔥',
    photoCount,
    videoCount,
    description: description || `Ensaio exclusivo de ${creatorName} em alta definição.`,
    cover,
    avatar,
    reelsVideo: reelsVideo || undefined
  };

  try {
    const res = await fetch('/api/admin/model/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.isNew ? '🎉 Nova modelo criada com sucesso!' : '✅ Modelo atualizada com sucesso!');
      closeModelModal();
      await loadAdminCatalog();
    } else {
      showToast(data.error || 'Erro ao salvar modelo.');
    }
  } catch (err) {
    console.error('Erro ao salvar modelo:', err);
    showToast('Erro de rede ao salvar modelo.');
  }
}

async function deleteModel(modelId, creatorName) {
  const key = getAdminKey();
  if (!key) return;

  const confirmMsg = `Tem certeza que deseja excluir "${creatorName}"?\nEssa ação não poderá ser desfeita.`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch('/api/admin/model/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ id: modelId })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Modelo "${creatorName}" removida.`);
      await loadAdminCatalog();
    } else {
      showToast(data.error || 'Erro ao excluir modelo.');
    }
  } catch (err) {
    console.error('Erro ao excluir modelo:', err);
    showToast('Erro de conexão ao excluir.');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// GERENCIADOR DE MÍDIAS (PRÉVIAS VS. VIP)
// ═════════════════════════════════════════════════════════════════════════

function populateModelMediaSelect() {
  const select = document.getElementById('selectModelMedia');
  if (!select) return;

  const prevVal = select.value;
  select.innerHTML = catalogCache.map(m => `
    <option value="${m.id}">${m.creatorName} (${Array.isArray(m.previews) ? m.previews.length : 0} mídias)</option>
  `).join('');

  if (prevVal && catalogCache.some(m => m.id === prevVal)) {
    select.value = prevVal;
  }

  onSelectModelChange();
}

let currentMediaFilter = 'all';

function setMediaFilter(filter) {
  currentMediaFilter = filter;
  onSelectModelChange();
}

async function applyBatchMediaAction(modelId, action) {
  const key = getAdminKey();
  if (!key) return;

  const msg = action === 'all_vip' 
    ? 'Deseja realmente bloquear TODAS as mídias desta modelo como VIP exclusivo?' 
    : 'Deseja definir 1 vídeo e 3 fotos como prévias grátis e o restante como VIP?';
  if (!confirm(msg)) return;

  showToast('⏳ Aplicando alteração em lote...');
  try {
    const res = await fetch('/api/admin/media/batch-toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ modelId, action })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('✅ Mídias atualizadas em lote no catálogo!');
      await loadAdminCatalog();
    } else {
      showToast(data.error || 'Erro na alteração em lote.');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro de conexão ao alterar mídias em lote.');
  }
}

function onSelectModelChange() {
  const select = document.getElementById('selectModelMedia');
  if (!select) return;

  const modelId = select.value;
  const model = catalogCache.find(m => m.id === modelId);

  const statsEl = document.getElementById('modelMediaStats');
  const gridEl = document.getElementById('mediaManageGrid');

  if (!model) {
    if (statsEl) statsEl.innerHTML = '';
    if (gridEl) gridEl.innerHTML = '<div style="color:var(--text-muted); padding:30px;">Selecione uma modelo acima.</div>';
    return;
  }

  const previews = Array.isArray(model.previews) ? model.previews : [];
  const teasers = previews.filter(p => typeof p === 'object' && p.isTeaser);
  const vips = previews.filter(p => !(typeof p === 'object' && p.isTeaser));
  const allVids = previews.filter(p => (typeof p === 'object' && p.type === 'video') || /\.(mp4|webm|mov)$/i.test(typeof p === 'object' ? p.url : p));
  const allPics = previews.filter(p => !((typeof p === 'object' && p.type === 'video') || /\.(mp4|webm|mov)$/i.test(typeof p === 'object' ? p.url : p)));

  if (statsEl) {
    statsEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 10px;">
        <div>
          <span>Modelo Selecionada: <strong style="color:#fff; font-size:15px;">${model.creatorName}</strong></span>
          <span style="margin-left: 14px;">Total: <strong>${previews.length}</strong> mídias</span>
          <span style="color:#10b981; margin-left: 14px;">👁️ Prévias Grátis: <strong>${teasers.length}</strong> (Visíveis no site)</span>
          <span style="color:#e11d48; margin-left: 14px;">🔒 Exclusivos VIP: <strong>${vips.length}</strong> (Bloqueadas até ativar código)</span>
        </div>

        <div style="display: flex; gap: 8px;">
          <button class="btn-secondary" style="font-size: 11px; padding: 6px 12px; border-color: rgba(16,185,129,0.5); color: #10b981;" onclick="applyBatchMediaAction('${model.id}', 'first_teasers')" title="Marca 1 vídeo e 3 fotos como prévias, e bloqueia todo o restante como VIP">
            ⚡ Prévia Padrão (1 Vídeo + 3 Fotos)
          </button>
          <button class="btn-secondary" style="font-size: 11px; padding: 6px 12px; border-color: rgba(244,63,94,0.5); color: #f43f5e;" onclick="applyBatchMediaAction('${model.id}', 'all_vip')" title="Bloqueia 100% das fotos e vídeos desta modelo como VIP">
            🔒 Bloquear Todas como VIP
          </button>
        </div>
      </div>

      <!-- Barra de Filtros de Mídia -->
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; width: 100%; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
        <button class="btn-pill-filter ${currentMediaFilter === 'all' ? 'active' : ''}" onclick="setMediaFilter('all')">✨ Todas (${previews.length})</button>
        <button class="btn-pill-filter ${currentMediaFilter === 'teasers' ? 'active' : ''}" style="border-color: #10b981; color: ${currentMediaFilter === 'teasers' ? '#fff' : '#10b981'};" onclick="setMediaFilter('teasers')">👁️ Só Prévias Grátis (${teasers.length})</button>
        <button class="btn-pill-filter ${currentMediaFilter === 'vips' ? 'active' : ''}" style="border-color: #e11d48; color: ${currentMediaFilter === 'vips' ? '#fff' : '#e11d48'};" onclick="setMediaFilter('vips')">🔒 Só Exclusivos VIP (${vips.length})</button>
        <button class="btn-pill-filter ${currentMediaFilter === 'videos' ? 'active' : ''}" onclick="setMediaFilter('videos')">🎬 Só Vídeos (${allVids.length})</button>
        <button class="btn-pill-filter ${currentMediaFilter === 'photos' ? 'active' : ''}" onclick="setMediaFilter('photos')">📷 Só Fotos (${allPics.length})</button>
      </div>
    `;
  }

  if (gridEl) {
    let filteredPreviews = previews;
    if (currentMediaFilter === 'teasers') {
      filteredPreviews = previews.filter(p => typeof p === 'object' && p.isTeaser);
    } else if (currentMediaFilter === 'vips') {
      filteredPreviews = previews.filter(p => !(typeof p === 'object' && p.isTeaser));
    } else if (currentMediaFilter === 'videos') {
      filteredPreviews = previews.filter(p => (typeof p === 'object' && p.type === 'video') || /\.(mp4|webm|mov)$/i.test(typeof p === 'object' ? p.url : p));
    } else if (currentMediaFilter === 'photos') {
      filteredPreviews = previews.filter(p => !((typeof p === 'object' && p.type === 'video') || /\.(mp4|webm|mov)$/i.test(typeof p === 'object' ? p.url : p)));
    }

    if (filteredPreviews.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-card); border-radius: 8px;">
          Nenhuma mídia encontrada com este filtro.<br />
          <button class="btn-secondary" style="margin-top:10px;" onclick="setMediaFilter('all')">Ver Todas</button>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = filteredPreviews.map((item, index) => {
      const url = typeof item === 'object' ? item.url : item;
      const isTeaser = typeof item === 'object' ? !!item.isTeaser : false;
      const isVideo = (typeof item === 'object' && item.type === 'video') || /\.(mp4|webm|mov)$/i.test(url);
      const isCover = model.cover === url;
      const isAvatar = model.avatar === url;
      const isReels = model.reelsVideo === url;

      return `
        <div class="media-card" data-url="${url}" style="border: 1px solid ${isTeaser ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)'};">
          <div class="media-card-preview">
            ${isVideo 
              ? `<video src="${url}" class="media-card-vid" muted loop playsinline onmouseenter="this.play()" onmouseleave="this.pause()"></video>`
              : `<img src="${url}" alt="Mídia" class="media-card-img" loading="lazy" />`
            }
            <span class="media-type-badge">${isVideo ? '🎬 VÍDEO' : '📷 FOTO'}</span>
            <span class="media-role-badge ${isTeaser ? 'teaser' : 'vip'}" onclick="toggleMediaTeaser('${model.id}', '${url}', ${!isTeaser})" title="Clique para alternar Prévia vs. VIP">
              ${isTeaser ? '👁️ Prévia Grátis' : '🔒 Exclusivo VIP'}
            </span>
            ${isReels ? '<span style="position:absolute; bottom:6px; left:6px; background:#8b5cf6; color:#fff; font-size:10px; font-weight:900; padding:3px 7px; border-radius:4px; box-shadow:0 2px 8px rgba(139,92,246,0.6);">⭐ VÍDEO DO REELS</span>' : ''}
            ${isCover && !isReels ? '<span style="position:absolute; bottom:6px; left:6px; background:#e11d48; color:#fff; font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px;">CAPA OFICIAL</span>' : ''}
            ${isAvatar ? '<span style="position:absolute; bottom:6px; right:6px; background:#3b82f6; color:#fff; font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px;">PERFIL</span>' : ''}
          </div>

          <div class="media-card-controls">
            <button class="btn-toggle-teaser ${isTeaser ? 'teaser' : 'vip'}" style="flex:1;" onclick="toggleMediaTeaser('${model.id}', '${url}', ${!isTeaser})">
              ${isTeaser ? 'Tornar VIP 🔒' : 'Tornar Prévia 👁️'}
            </button>
            ${isVideo ? `
              <button class="btn-copy-sm" style="background:${isReels ? '#8b5cf6' : '#1e293b'}; color:#fff; border:1px solid ${isReels ? '#a78bfa' : 'rgba(255,255,255,0.2)'}; font-weight:700;" title="Definir este vídeo como o Reel principal da modelo" onclick="setMediaRole('${model.id}', '${url}', 'reels')">
                ${isReels ? '⭐ Reels Atual' : '🎬 Definir Reels'}
              </button>
            ` : `
              <button class="btn-copy-sm" title="Definir como Capa" onclick="setMediaRole('${model.id}', '${url}', 'cover')">Capa</button>
              <button class="btn-copy-sm" title="Definir como Avatar" onclick="setMediaRole('${model.id}', '${url}', 'avatar')">Perfil</button>
            `}
            <button class="btn-del-media" title="Remover Mídia" onclick="deleteMediaItem('${model.id}', '${url}')">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }
}

async function toggleMediaTeaser(modelId, mediaUrl, isTeaser) {
  const key = getAdminKey();
  if (!key) return;

  try {
    const res = await fetch('/api/admin/media/toggle-teaser', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ modelId, mediaUrl, isTeaser })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(isTeaser ? '👁️ Mídia definida como Prévia Grátis (Já aparece no site!)' : '🔒 Mídia bloqueada como Exclusivo VIP (Bloqueada no site!)');
      // Atualizar no catálogo local
      const model = catalogCache.find(m => m.id === modelId);
      if (model && Array.isArray(model.previews)) {
        const idx = model.previews.findIndex(p => (typeof p === 'object' ? p.url : p) === mediaUrl);
        if (idx !== -1) {
          if (typeof model.previews[idx] === 'object') {
            model.previews[idx].isTeaser = isTeaser;
          } else {
            model.previews[idx] = {
              type: mediaUrl.endsWith('.mp4') ? 'video' : 'image',
              url: mediaUrl,
              isTeaser: isTeaser
            };
          }
        }
      }
      onSelectModelChange();
    } else {
      showToast(data.error || 'Erro ao alterar status da mídia.');
    }
  } catch (err) {
    console.error('Erro ao alternar status:', err);
    showToast('Falha na comunicação com o servidor.');
  }
}

async function setMediaRole(modelId, mediaUrl, role) {
  const key = getAdminKey();
  if (!key) return;

  try {
    const res = await fetch('/api/admin/media/set-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ modelId, mediaUrl, role })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Foto definida como ${role === 'cover' ? 'Capa Oficial' : 'Avatar de Perfil'}!`);
      await loadAdminCatalog();
    } else {
      showToast(data.error || 'Erro ao definir foto.');
    }
  } catch (err) {
    showToast('Erro ao atualizar foto.');
  }
}

async function deleteMediaItem(modelId, mediaUrl) {
  const key = getAdminKey();
  if (!key) return;

  if (!confirm('Deseja realmente remover esta foto/vídeo do catálogo?')) return;

  try {
    const res = await fetch('/api/admin/media/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ modelId, mediaUrl })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Mídia removida com sucesso!');
      await loadAdminCatalog();
    } else {
      showToast(data.error || 'Erro ao remover mídia.');
    }
  } catch (err) {
    console.error('Erro ao remover mídia:', err);
    showToast('Erro de conexão ao remover mídia.');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// UPLOAD DE FOTOS E VÍDEOS
// ═════════════════════════════════════════════════════════════════════════

function openUploadModal() {
  const select = document.getElementById('selectModelMedia');
  if (!select || !select.value) {
    showToast('Selecione ou crie uma modelo antes de enviar mídias.');
    return;
  }

  const model = catalogCache.find(m => m.id === select.value);
  if (!model) return;

  document.getElementById('uploadTargetModelName').textContent = model.creatorName;
  document.getElementById('fileUploadInput').value = '';
  document.getElementById('uploadQueueContainer').innerHTML = '';
  document.getElementById('btnStartUpload').disabled = true;
  selectedFilesToUpload = [];

  document.getElementById('modalUpload').classList.add('open');
}

function closeUploadModal() {
  document.getElementById('modalUpload').classList.remove('open');
  selectedFilesToUpload = [];
}

function onFilesSelected(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  selectedFilesToUpload = files;
  const container = document.getElementById('uploadQueueContainer');
  const btn = document.getElementById('btnStartUpload');

  container.innerHTML = files.map((file, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:#07090e; padding:8px 12px; border-radius:6px; margin-bottom:6px; font-size:12px;">
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">
        ${file.type.startsWith('video') ? '🎬' : '📷'} ${file.name}
      </span>
      <span style="color:var(--text-muted); font-size:11px;">
        ${(file.size / (1024 * 1024)).toFixed(2)} MB
      </span>
    </div>
  `).join('');

  btn.disabled = false;
  btn.innerHTML = `<span>🚀 Iniciar Envio (${files.length} arquivo${files.length > 1 ? 's' : ''})</span>`;
}

async function startUploadQueue() {
  const key = getAdminKey();
  if (!key) return;

  const select = document.getElementById('selectModelMedia');
  const modelId = select ? select.value : '';
  if (!modelId) {
    showToast('Modelo não selecionada.');
    return;
  }

  if (selectedFilesToUpload.length === 0) {
    showToast('Selecione pelo menos uma foto ou vídeo.');
    return;
  }

  const isTeaser = document.querySelector('input[name="uploadRole"]:checked').value === 'teaser';
  const btn = document.getElementById('btnStartUpload');
  btn.disabled = true;

  let uploadedCount = 0;
  for (let i = 0; i < selectedFilesToUpload.length; i++) {
    const file = selectedFilesToUpload[i];
    btn.innerHTML = `<span>⏳ Enviando ${i + 1} de ${selectedFilesToUpload.length}...</span>`;

    try {
      const base64Data = await readFileAsBase64(file);
      const res = await fetch('/api/admin/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': key
        },
        body: JSON.stringify({
          modelId,
          fileName: file.name,
          fileType: file.type.startsWith('video') ? 'video' : 'image',
          base64Data,
          isTeaser
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        uploadedCount++;
      } else {
        console.error('Falha no upload do arquivo:', file.name, data.error);
      }
    } catch (err) {
      console.error('Erro no arquivo:', file.name, err);
    }
  }

  showToast(`🎉 ${uploadedCount} mídia(s) enviada(s) com sucesso!`);
  closeUploadModal();
  await loadAdminCatalog();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = err => reject(err);
    reader.readAsDataURL(file);
  });
}

// ═════════════════════════════════════════════════════════════════════════
// GERENCIADOR DE CÓDIGOS DE VENDA PIX
// ═════════════════════════════════════════════════════════════════════════

async function loadAdminCodes() {
  const key = getAdminKey();
  if (!key) return;

  try {
    const res = await fetch('/api/admin/codes', {
      headers: { 'x-admin-key': key }
    });

    if (res.status === 401) {
      doAdminLogout();
      return;
    }

    const data = await res.json();
    codesCache = data.codes || [];

    document.getElementById('sumTotalCodes').textContent = data.total || 0;
    document.getElementById('sumAvailCodes').textContent = data.availableCount || 0;
    document.getElementById('sumUsedCodes').textContent = data.usedCount || 0;

    renderCodesTable();
  } catch (err) {
    console.error('Erro ao carregar códigos:', err);
    showToast('Erro ao carregar lista de códigos.');
  }
}

function setCodesFilter(filter) {
  currentCodesFilter = filter;
  document.querySelectorAll('.btn-pill-filter').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(
      filter === 'all' ? 'todos' : (filter === 'available' ? 'disponíveis' : 'resgatados')
    ));
  });
  renderCodesTable();
}

function renderCodesTable() {
  const tbody = document.getElementById('codesTableBody');
  if (!tbody) return;

  const search = (document.getElementById('filterCodesInput').value || '').trim().toUpperCase();

  let filtered = codesCache.filter(item => {
    if (currentCodesFilter === 'available' && item.status !== 'AVAILABLE') return false;
    if (currentCodesFilter === 'used' && item.status !== 'USED') return false;
    if (search) {
      const matchCode = item.code.toUpperCase().includes(search);
      const matchLabel = (item.label || '').toUpperCase().includes(search);
      const matchStatus = (item.status || '').toUpperCase().includes(search);
      if (!matchCode && !matchLabel && !matchStatus) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum código encontrado com os filtros atuais.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const isAvail = item.status === 'AVAILABLE';
    const isMaster = item.isMaster || item.type === 'ADMIN_MASTER';
    const priceText = item.price ? `R$ ${item.price}` : (item.type === 'WEEKLY_VIP' ? 'R$ 24,99' : 'R$ 9,90');
    
    let statusBadge = '';
    if (isMaster) {
      statusBadge = '<span class="code-badge-status" style="background:rgba(245,158,11,0.2); border:1px solid #f59e0b; color:#fbbf24;">👑 MASTER ADMIN</span>';
    } else if (isAvail) {
      statusBadge = '<span class="code-badge-status available">🟢 DISPONÍVEL</span>';
    } else {
      statusBadge = '<span class="code-badge-status used">🔴 RESGATADO</span>';
    }

    let details = '—';
    if (item.status === 'USED' && item.usedAt) {
      const d = new Date(item.usedAt);
      details = `Ativado em ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
      if (item.modelId) details += ` (${item.modelId})`;
    } else if (item.modelId) {
      details = `Vinculado: ${item.modelId}`;
    }

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <code style="font-size:13px; font-weight:800; color:#fff; background:#040508; padding:4px 8px; border-radius:4px; letter-spacing:0.05em;">${item.code}</code>
            <button class="btn-copy-sm" onclick="copyCodeOnly('${item.code}')" title="Copiar apenas o código">Copiar</button>
          </div>
        </td>
        <td><strong>${item.label || item.type}</strong></td>
        <td><strong style="color:var(--primary);">${priceText}</strong></td>
        <td>${statusBadge}</td>
        <td style="font-size:12px; color:var(--text-muted);">${details}</td>
        <td>
          <button class="btn-copy-sm" style="background:linear-gradient(135deg, #25D366, #128C7E); color:#fff; border:none;" onclick="copyWhatsAppMessage('${item.code}', '${item.type}', '${priceText}')">
            📲 Mensagem Pronta WhatsApp
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function copyCodeOnly(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Código ${code} copiado!`);
  }).catch(() => {
    prompt('Copie o código:', code);
  });
}

function copyWhatsAppMessage(code, type, price) {
  const isWeekly = type === 'WEEKLY_VIP';
  const siteUrl = 'https://clubesecreto.omelhorvendedoronline.com.br';
  const autoLink = `${siteUrl}/?codigo=${code}`;

  const msg = isWeekly
    ? `Olá! Seu acesso ao CLUBE SECRETO VIP está liberado! 👑✨\n\n` +
      `🔥 Plano Semanal VIP (${price}) — Acesso total a todas as criadoras, fotos 4K e vídeos exclusivos.\n\n` +
      `👉 TOQUE NO LINK ABAIXO PARA ENTRAR DIRETO (Já libera automático):\n${autoLink}\n\n` +
      `🔑 Ou se preferir digitar seu código no site:\n${code}\n\n` +
      `Válido por 7 dias. Bom proveito! Qualquer dúvida estamos à disposição. 🔥`
    : `Olá! Seu acesso ao PACK INDIVIDUAL VITALÍCIO está liberado! 🔒✨\n\n` +
      `📸 Ensaio Completo em Alta Resolução (${price}) — ACESSO VITALÍCIO (Para Sempre) liberado!\n\n` +
      `👉 TOQUE NO LINK ABAIXO PARA ENTRAR DIRETO (Já libera automático):\n${autoLink}\n\n` +
      `🔑 Ou se preferir digitar seu código no site:\n${code}\n\n` +
      `Seu acesso a este ensaio é vitalício e não expira nunca. Bom proveito! 🔥`;

  navigator.clipboard.writeText(msg).then(() => {
    showToast('📋 Mensagem pronta copiada com link direto!');
  }).catch(() => {
    prompt('Copie a mensagem para enviar:', msg);
  });
}

async function generateBatchCodes(type, modelId, count = 10) {
  const key = getAdminKey();
  if (!key) return;

  try {
    const res = await fetch('/api/admin/codes/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ type, modelId, count })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`🎉 ${data.generatedCount} novos códigos gerados com sucesso!`);
      await loadAdminCodes();
    } else {
      showToast(data.error || 'Erro ao gerar códigos.');
    }
  } catch (err) {
    console.error('Erro ao gerar códigos:', err);
    showToast('Erro de conexão ao gerar novos códigos.');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO AUTOMÁTICA
// ═════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const savedKey = getAdminKey();
  if (savedKey) {
    doAdminLogin(savedKey);
  }

  // Atalho Enter no login
  const keyInput = document.getElementById('adminKeyInput');
  if (keyInput) {
    keyInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doAdminLogin();
    });
  }
});

