// ═════════════════════════════════════════════════════════════════════════
// ADMIN.JS — PAINEL DE CONTROLE ADMINISTRATIVO MASTER CLUBE SECRETO
// Gestão de Modelos, Prévias vs. VIP, Upload de Mídias e Códigos PIX
// ═════════════════════════════════════════════════════════════════════════

let catalogCache = [];
let codesCache = [];
let settingsCache = {
  vipPrice: '15,00',
  vipOldPrice: '29,90',
  vipPlanTitle: 'ACESSO VIP COMPLETO',
  vipPlanSubtitle: 'Todas as modelos, fotos 4K e vídeos 60fps sem censura',
  pixKey: '09658990983',
  pixHolder: 'Luan Batista',
  whatsappNumber: '554195993007',
  whatsappMessage: 'Olá! Quero liberar meu Acesso VIP no Clube Secreto (R$ {PRICE})! Chave PIX {PIX}. Segue meu comprovante:',
  unlockedSlug: 'vip-liberado',
  vipAccessToken: 'CS-VIP-LIBERADO-2026'
};
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
  const urlParams = new URLSearchParams(window.location.search);
  const qKey = (urlParams.get('key') || '').trim();
  if (qKey) {
    setAdminKey(qKey);
    return qKey.toUpperCase();
  }
  const sessionKey = (sessionStorage.getItem('cs_admin_key') || '').trim();
  if (sessionKey) return sessionKey;
  const match = document.cookie.match(/(?:^|;\s*)cs_admin_key=([^;]+)/);
  if (match) return decodeURIComponent(match[1]).trim();
  return '';
}

function setAdminKey(key) {
  const clean = (key || '').trim().toUpperCase();
  sessionStorage.setItem('cs_admin_key', clean);
  document.cookie = `cs_admin_key=${encodeURIComponent(clean)}; path=/; max-age=2592000; SameSite=Lax`;
}

function clearAdminKey() {
  sessionStorage.removeItem('cs_admin_key');
  document.cookie = 'cs_admin_key=; path=/; max-age=0; SameSite=Lax';
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
      await loadAdminSettings();
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
    loadAdminSettings();
    loadAdminCatalog();
  } else if (tabName === 'pricing') {
    loadAdminSettings();
  } else if (tabName === 'media') {
    populateModelMediaSelect();
  } else if (tabName === 'codes') {
    loadAdminCodes();
  } else if (tabName === 'backups') {
    loadBackupsList();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// GESTÃO DE PREÇOS, PIX, WHATSAPP & PÁGINA TUDO LIBERADO
// ═════════════════════════════════════════════════════════════════════════

function getUnlockedFullUrl(slugOverride) {
  const slug = (slugOverride || settingsCache.unlockedSlug || 'vip-liberado').replace(/^\/+/, '');
  const origin = window.location.origin && !window.location.origin.includes('localhost')
    ? window.location.origin
    : 'https://clubesecreto.omelhorvendedoronline.com.br';
  return `${origin}/${slug}`;
}

function updateUnlockedPreviewUrl() {
  const input = document.getElementById('settingUnlockedSlug');
  const preview = document.getElementById('unlockedFullUrlPreview');
  const btnTest = document.getElementById('btnTestUnlockedPage');
  const quickBadge = document.getElementById('quickUnlockedPathBadge');
  const quickLink = document.getElementById('quickOpenUnlockedLink');

  const raw = input ? input.value : (settingsCache.unlockedSlug || 'vip-liberado');
  const cleanSlug = raw.toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9_-]/g, '') || 'vip-liberado';

  if (preview) preview.textContent = getUnlockedFullUrl(cleanSlug);
  if (btnTest) btnTest.href = `/${cleanSlug}`;
  if (quickBadge) quickBadge.textContent = `/${cleanSlug}`;
  if (quickLink) quickLink.href = `/${cleanSlug}`;
}

async function loadAdminSettings() {
  const key = getAdminKey();
  if (!key) return;
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'x-admin-key': key }
    });
    const data = await res.json();
    if (res.ok && data.success && data.settings) {
      settingsCache = { ...settingsCache, ...data.settings };

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val !== undefined && val !== null ? val : '';
      };
      setVal('settingVipPrice', settingsCache.vipPrice);
      setVal('settingVipOldPrice', settingsCache.vipOldPrice);
      setVal('settingVipPlanTitle', settingsCache.vipPlanTitle);
      setVal('settingVipPlanSubtitle', settingsCache.vipPlanSubtitle);
      setVal('settingPixKey', settingsCache.pixKey);
      setVal('settingPixHolder', settingsCache.pixHolder);
      setVal('settingWhatsappNumber', settingsCache.whatsappNumber);
      setVal('settingWhatsappMessage', settingsCache.whatsappMessage);
      setVal('settingUnlockedSlug', settingsCache.unlockedSlug);

      const quickPriceBadge = document.getElementById('quickVipPriceBadge');
      if (quickPriceBadge) quickPriceBadge.textContent = `R$ ${settingsCache.vipPrice || '15,00'}`;
      updateUnlockedPreviewUrl();
    }
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

async function saveAdminSettings(regenerateToken = false) {
  const key = getAdminKey();
  if (!key) return;

  const getVal = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : undefined;
  };

  const payload = {
    vipPrice: getVal('settingVipPrice') || settingsCache.vipPrice,
    vipOldPrice: getVal('settingVipOldPrice') ?? settingsCache.vipOldPrice,
    vipPlanTitle: getVal('settingVipPlanTitle') || settingsCache.vipPlanTitle,
    vipPlanSubtitle: getVal('settingVipPlanSubtitle') ?? settingsCache.vipPlanSubtitle,
    pixKey: getVal('settingPixKey') || settingsCache.pixKey,
    pixHolder: getVal('settingPixHolder') || settingsCache.pixHolder,
    whatsappNumber: getVal('settingWhatsappNumber') || settingsCache.whatsappNumber,
    whatsappMessage: getVal('settingWhatsappMessage') ?? settingsCache.whatsappMessage,
    unlockedSlug: getVal('settingUnlockedSlug') || settingsCache.unlockedSlug,
    regenerateToken
  };

  showToast('⏳ Salvando preços e configurações...');
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      settingsCache = { ...settingsCache, ...data.settings };
      await loadAdminSettings();
      showToast('✅ Preços e Página Liberada salvos! Clique em "Sincronizar Tudo" para publicar na VPS.');
    } else {
      showToast(data.error || 'Erro ao salvar configurações.');
    }
  } catch (err) {
    showToast('Erro de conexão ao salvar configurações.');
  }
}

async function regenerateUnlockedAccess() {
  if (!confirm('Deseja gerar um NOVO endereço secreto para a Página Tudo Liberado?\n\nQuem tinha o link antigo deixará de entrar por ele.')) {
    return;
  }
  await saveAdminSettings(true);
}

function copyUnlockedLink() {
  const url = getUnlockedFullUrl();
  navigator.clipboard.writeText(url).then(() => {
    showToast(`📋 Link Tudo Liberado copiado: ${url}`);
  }).catch(() => {
    prompt('Copie o Link da Página Tudo Liberado:', url);
  });
}

function copyUnlockedWhatsappMessage(modelHint) {
  const url = getUnlockedFullUrl();
  const intro = modelHint
    ? `Oi! Seu pagamento foi confirmado! ✅\n\nO acesso completo da *${modelHint}* + TODAS as outras modelos do CLUBE SECRETO já está 100% liberado!`
    : `Oi! Seu pagamento foi confirmado! ✅\n\nSeu acesso ao CLUBE SECRETO VIP já está 100% liberado!`;

  const msg = `${intro}\n\n` +
    `👉 É só TOCAR NO LINK AZUL ABAIXO para abrir tudo liberado na hora (não precisa digitar senha nem código!):\n` +
    `${url}\n\n` +
    `Pode abrir fotos 4K e vídeos completos à vontade. Qualquer dúvida me chama aqui! 🔥`;

  navigator.clipboard.writeText(msg).then(() => {
    showToast('📲 Mensagem pronta com Link Tudo Liberado copiada para colar no WhatsApp!');
  }).catch(() => {
    prompt('Copie a mensagem para enviar no WhatsApp:', msg);
  });
}

async function bulkUpdateIndividualPrices() {
  const key = getAdminKey();
  if (!key) return;
  const input = document.getElementById('bulkIndividualPrice');
  const val = input ? input.value.trim() : '';
  if (!val) {
    showToast('⚠️ Digite o novo preço individual antes de aplicar.');
    if (input) input.focus();
    return;
  }
  if (!confirm(`Aplicar preço de referência individual "R$ ${val}" em todas as modelos?`)) return;

  try {
    const res = await fetch('/api/admin/prices/bulk-individual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ individualPrice: val })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      catalogCache = data.catalog || catalogCache;
      renderModelsGrid();
      showToast(data.message);
    } else {
      showToast(data.error || 'Erro ao atualizar preços.');
    }
  } catch (e) {
    showToast('Erro de conexão.');
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

  grid.innerHTML = catalogCache.map((model, index) => {
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
          
          <span class="model-position-badge" title="Posição na vitrine do site">
            <span>#${index + 1}</span>
          </span>

          <div class="model-quick-order-btns">
            ${index > 0 ? `<button class="btn-order-move" onclick="event.stopPropagation(); moveModel('${model.id}', -1)" title="Subir posição">⬆</button>` : ''}
            ${index < catalogCache.length - 1 ? `<button class="btn-order-move" onclick="event.stopPropagation(); moveModel('${model.id}', 1)" title="Descer posição">⬇</button>` : ''}
            ${index > 0 ? `<button class="btn-order-move" style="background: rgba(225,29,72,0.9); border-color: #ff4d6d;" onclick="event.stopPropagation(); moveModelToTop('${model.id}')" title="Promover para o 1º Lugar da Vitrine">🔝</button>` : ''}
          </div>

          <span style="position: absolute; bottom: 8px; right: 8px; font-size: 10px; font-weight: 800; background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; padding: 3px 8px; border-radius: 20px; box-shadow: 0 2px 8px rgba(225,29,72,0.4);">
            ${model.badge || 'VIP 🔥'}
          </span>
        </div>

        <!-- Avatar e Nomes -->
        <div class="model-card-top" style="margin-top: -24px; position: relative; z-index: 2; padding: 0 4px;">
          <img src="${avatarSrc}" alt="${model.creatorName}" class="model-card-avatar" style="border: 3px solid #0f131d; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" onerror="this.src='assets/logo.jpg'" />
          <div class="model-card-names">
            <div class="model-card-name" style="font-size: 15px;">${model.creatorName}</div>
            <div class="model-card-username">${model.username || ''} • <strong style="color: #10b981;">VIP R$ ${settingsCache.vipPrice || '15,00'}</strong> <span style="opacity:0.75;">(x1: R$ ${model.individualPrice || '9,90'})</span></div>
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

        <!-- Linha 1 de Ações: Ver no Site & Enviar Página Tudo Liberado -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <a href="/?modelo=${model.id}" target="_blank" class="btn-secondary" style="font-size: 11px; padding: 8px 10px; justify-content: center; text-decoration: none; border-color: rgba(255,255,255,0.15);" title="Ver modelo no site oficial">
            <span>👁️ Ver no Site</span>
          </a>
          <button class="btn-primary" style="font-size: 11px; padding: 8px 10px; justify-content: center; background: linear-gradient(135deg, #25d366, #128c7e); border: none;" onclick="copyUnlockedWhatsappMessage('${model.creatorName.replace(/'/g, "\\'")}')" title="Copia mensagem pronta com o link da Página Tudo Liberado para enviar no WhatsApp">
            <span>📲 Enviar Liberado</span>
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
let currentMediaPage = 1;
let lastSelectedModelId = null;
const MEDIA_PER_PAGE = 24;

function loadMoreMedia() {
  currentMediaPage++;
  onSelectModelChange();
}

function showAllMedia() {
  currentMediaPage = 999;
  onSelectModelChange();
  showToast('✅ Todas as mídias da modelo foram exibidas!');
}

function renderMediaManager() {
  onSelectModelChange();
}

function setMediaFilter(filter) {
  currentMediaFilter = filter;
  currentMediaPage = 1;
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
  if (lastSelectedModelId !== modelId) {
    currentMediaPage = 1;
    lastSelectedModelId = modelId;
  }
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
          <span style="color:#e11d48; margin-left: 14px;">🔒 Exclusivos VIP: <strong>${vips.length}</strong> (Bloqueadas na página prévia)</span>
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

    const adminKey = getAdminKey();
    const visibleCount = currentMediaPage * MEDIA_PER_PAGE;
    const visibleItems = filteredPreviews.slice(0, visibleCount);

    let gridHtml = visibleItems.map((item, index) => {
      const url = typeof item === 'object' ? item.url : item;
      const isTeaser = typeof item === 'object' ? !!item.isTeaser : false;
      const isVideo = (typeof item === 'object' && item.type === 'video') || /\.(mp4|webm|mov)$/i.test(url);
      const isCover = model.cover === url;
      const isAvatar = model.avatar === url;
      const isReels = model.reelsVideo === url;
      const mediaSrc = adminKey ? `${url}?key=${encodeURIComponent(adminKey)}` : url;
      const thumbUrl = url.replace(/\.(mp4|webm|mov)$/i, '_thumb.jpg');
      const posterSrc = adminKey ? `${thumbUrl}?key=${encodeURIComponent(adminKey)}` : thumbUrl;

      return `
        <div class="media-card" data-url="${url}" style="border: 1px solid ${isTeaser ? 'rgba(16,185,129,0.4)' : 'rgba(244,63,94,0.4)'};">
          <div class="media-card-preview" onclick="openAdminMediaInspector('${model.id}', '${url}', ${isVideo}, ${isTeaser}, ${isReels}, ${isCover}, ${isAvatar})" style="cursor: pointer; position: relative; background: #0b0d14;" title="Clique para ampliar e ver em tamanho real">
            ${isVideo 
              ? `
                <img src="${posterSrc}" alt="Prévia Vídeo" class="media-card-img" loading="lazy"
                  onerror="if(!this.dataset.err){this.dataset.err='1'; this.src='${model.cover || 'assets/logo.jpg'}';}" />
                <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; background: rgba(0,0,0,0.22);">
                  <div style="background: rgba(225, 29, 72, 0.92); width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.7); border: 2px solid rgba(255,255,255,0.4);">▶</div>
                </div>
              `
              : `<img src="${mediaSrc}" alt="Mídia" class="media-card-img" loading="lazy" onerror="if(!this.dataset.err){this.dataset.err='1'; this.src='${model.cover || 'assets/logo.jpg'}';}" />`
            }
            <span class="media-type-badge">${isVideo ? '🎬 VÍDEO' : '📷 FOTO'}</span>
            <span class="media-role-badge ${isTeaser ? 'teaser' : 'vip'}" onclick="event.stopPropagation(); toggleMediaTeaser('${model.id}', '${url}', ${!isTeaser})" title="Clique para alternar Prévia vs. VIP">
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

    if (filteredPreviews.length > visibleCount) {
      gridHtml += `
        <div style="grid-column: 1 / -1; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; padding: 25px 0 15px 0;">
          <button class="btn-primary" style="padding: 12px 28px; font-size: 14px; font-weight: 800; box-shadow: 0 4px 20px rgba(225,29,72,0.4);" onclick="loadMoreMedia()">
            ⬇️ Carregar Mais Mídias (${filteredPreviews.length - visibleCount} restantes)
          </button>
          <button class="btn-secondary" style="padding: 12px 28px; font-size: 14px; font-weight: 800; border-color: rgba(16,185,129,0.5); color: #10b981;" onclick="showAllMedia()">
            ⚡ Mostrar Todas as Mídias (${filteredPreviews.length})
          </button>
        </div>
      `;
    }

    gridEl.innerHTML = gridHtml;
  }
}

function openAdminMediaInspector(modelId, mediaUrl, isVideo, isTeaser, isReels, isCover, isAvatar) {
  const modal = document.getElementById('adminMediaInspectorModal');
  const title = document.getElementById('inspectorModalTitle');
  const container = document.getElementById('inspectorMediaContainer');
  const actions = document.getElementById('inspectorActionsContainer');
  const urlText = document.getElementById('inspectorMediaUrlText');
  if (!modal || !container) return;

  const adminKey = getAdminKey();
  const mediaSrc = adminKey ? `${mediaUrl}?key=${encodeURIComponent(adminKey)}` : mediaUrl;

  title.textContent = isVideo ? '🎬 Inspetor de Vídeo' : '📷 Inspetor de Foto';
  if (urlText) urlText.textContent = mediaUrl;

  if (isVideo) {
    const thumbUrl = mediaUrl.replace(/\.(mp4|webm|mov)$/i, '_thumb.jpg');
    const posterSrc = adminKey ? `${thumbUrl}?key=${encodeURIComponent(adminKey)}` : thumbUrl;
    container.innerHTML = `
      <video src="${mediaSrc}" poster="${posterSrc}" controls autoplay playsinline style="max-height: 480px; width: 100%; object-fit: contain; background: #000; border-radius: 6px;"></video>
    `;
  } else {
    container.innerHTML = `
      <img src="${mediaSrc}" alt="Mídia" style="max-height: 480px; width: 100%; object-fit: contain; background: #000; border-radius: 6px;" />
    `;
  }

  actions.innerHTML = `
    <button class="btn-toggle-teaser ${isTeaser ? 'teaser' : 'vip'}" style="padding: 10px 16px; font-size: 13px;" onclick="toggleMediaTeaser('${modelId}', '${mediaUrl}', ${!isTeaser}); closeAdminMediaInspector();">
      ${isTeaser ? '🔒 Mudar para Exclusivo VIP' : '👁️ Mudar para Prévia Grátis'}
    </button>
    ${isVideo ? `
      <button class="btn-primary" style="background:#8b5cf6; padding: 10px 16px; font-size: 13px;" onclick="setMediaRole('${modelId}', '${mediaUrl}', 'reels'); closeAdminMediaInspector();">
        🎬 Definir como Vídeo do Reels
      </button>
    ` : `
      <button class="btn-secondary" style="padding: 10px 16px; font-size: 13px;" onclick="setMediaRole('${modelId}', '${mediaUrl}', 'cover'); closeAdminMediaInspector();">
        🖼️ Definir como Capa Oficial
      </button>
      <button class="btn-secondary" style="padding: 10px 16px; font-size: 13px;" onclick="setMediaRole('${modelId}', '${mediaUrl}', 'avatar'); closeAdminMediaInspector();">
        👤 Definir como Foto de Perfil
      </button>
    `}
  `;

  modal.classList.add('open');
}

function closeAdminMediaInspector() {
  const modal = document.getElementById('adminMediaInspectorModal');
  if (modal) {
    modal.classList.remove('open');
    const container = document.getElementById('inspectorMediaContainer');
    if (container) {
      const vid = container.querySelector('video');
      if (vid) { vid.pause(); vid.src = ''; }
      container.innerHTML = '';
    }
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
      const roleName = role === 'reels' ? 'Vídeo Principal do Reels' : (role === 'cover' ? 'Capa Oficial' : 'Avatar de Perfil');
      showToast(`✅ ${roleName} atualizado com sucesso!`);
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
// GERENCIADOR DE CÓDIGOS DE VENDA PIX & AUDITORIA DE ATIVAÇÃO
// ═════════════════════════════════════════════════════════════════════════

function getRelativeTimeString(timeMs) {
  if (!timeMs) return '';
  const diffSec = Math.floor((Date.now() - timeMs) / 1000);
  if (diffSec < 45) return 'Agora mesmo';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}

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

    const totalEl = document.getElementById('sumTotalCodes');
    const availEl = document.getElementById('sumAvailCodes');
    const usedEl = document.getElementById('sumUsedCodes');
    const lastEl = document.getElementById('sumLastActivated');

    if (totalEl) totalEl.textContent = data.total || 0;
    if (availEl) availEl.textContent = data.availableCount || 0;
    if (usedEl) usedEl.textContent = data.usedCount || 0;

    // Localiza a última ativação registrada
    const usedList = codesCache.filter(c => c.status === 'USED' && (c.activatedAt || c.usedAt));
    usedList.sort((a, b) => (b.activatedAt || b.usedAt || 0) - (a.activatedAt || a.usedAt || 0));
    if (lastEl) {
      if (usedList.length > 0) {
        const last = usedList[0];
        const actTime = last.activatedAt || last.usedAt;
        const d = new Date(actTime);
        const rel = getRelativeTimeString(actTime);
        lastEl.innerHTML = `<span style="color:#10b981; font-weight:900;">${last.code}</span> — ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})} <span style="font-size:11px; color:#a7f3d0;">(${rel})</span>`;
      } else {
        lastEl.textContent = 'Nenhuma ativação registrada ainda';
      }
    }

    renderCodesTable();
  } catch (err) {
    console.error('Erro ao carregar códigos:', err);
    showToast('Erro ao carregar lista de códigos.');
  }
}

function setCodesFilter(filter) {
  currentCodesFilter = filter;
  document.querySelectorAll('.codes-filter-buttons .btn-pill-filter').forEach(btn => {
    const txt = btn.textContent.toLowerCase();
    const active = (filter === 'all' && txt.includes('todos')) ||
                   (filter === 'available' && txt.includes('disponíveis')) ||
                   (filter === 'used' && txt.includes('já ativados')) ||
                   (filter === 'recent' && txt.includes('recent'));
    btn.classList.toggle('active', active);
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
    if (currentCodesFilter === 'recent') {
      if (item.status !== 'USED') return false;
      const actTime = item.activatedAt || item.usedAt;
      if (!actTime) return false;
      return (Date.now() - actTime) < (48 * 60 * 60 * 1000); // últimas 48 horas
    }
    if (search) {
      const matchCode = item.code.toUpperCase().includes(search);
      const matchLabel = (item.label || '').toUpperCase().includes(search);
      const matchStatus = (item.status || '').toUpperCase().includes(search);
      const matchModel = (item.modelId || '').toUpperCase().includes(search);
      const matchDevice = (item.usedByDeviceId || '').toUpperCase().includes(search);
      const matchIp = (item.activatedIp || '').toUpperCase().includes(search);
      if (!matchCode && !matchLabel && !matchStatus && !matchModel && !matchDevice && !matchIp) return false;
    }
    return true;
  });

  // Ordenação por ativação mais recente quando filtrado por usados ou recentes
  if (currentCodesFilter === 'recent' || currentCodesFilter === 'used') {
    filtered.sort((a, b) => (b.activatedAt || b.usedAt || 0) - (a.activatedAt || a.usedAt || 0));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum código encontrado com os filtros atuais.</td></tr>`;
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
      statusBadge = '<span class="code-badge-status used">🔴 ATIVADO</span>';
    }

    // Coluna 5: Data e Hora de Ativação
    let activationHtml = '';
    const actTime = item.activatedAt || item.usedAt;
    if (item.status === 'USED' && actTime) {
      const d = new Date(actTime);
      const dateStr = d.toLocaleDateString('pt-BR');
      const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const relTime = getRelativeTimeString(actTime);
      activationHtml = `
        <div style="display: flex; flex-direction: column; gap: 3px;">
          <span style="display: inline-flex; align-items: center; gap: 5px; color: #10b981; font-weight: 800; font-size: 13px;">
            <span>✅</span> ${dateStr} às ${timeStr}
          </span>
          <span style="font-size: 11px; color: #6ee7b7; font-weight: 600;">⏱️ ${relTime}</span>
        </div>
      `;
    } else if (isMaster) {
      activationHtml = '<span style="color:#fbbf24; font-size:12px; font-weight:700;">👑 Ativo Permanente</span>';
    } else {
      activationHtml = '<span style="color:var(--text-muted); font-size:12px;">⏳ Aguardando Venda</span>';
    }

    // Coluna 6: Dispositivo / IP / Validade
    let infoHtml = '';
    if (item.status === 'USED') {
      const devSnippet = item.usedByDeviceId ? (item.usedByDeviceId.length > 16 ? item.usedByDeviceId.slice(0, 16) + '...' : item.usedByDeviceId) : 'Dispositivo Anônimo';
      let expText = item.isLifetime ? 'Acesso Vitalício (Sem Expiração)' : '7 Dias';
      if (!item.isLifetime && item.expiresAt) {
        const leftMs = item.expiresAt - Date.now();
        const days = Math.ceil(leftMs / (1000 * 60 * 60 * 24));
        expText = days > 0 ? `Válido por mais ${days} dia(s)` : 'Expirado';
      }
      infoHtml = `
        <div style="font-size: 11px; line-height: 1.45;">
          <span style="color: #e2e8f0;">📱 <code style="background: rgba(255,255,255,0.06); padding: 1px 4px; border-radius: 3px;">${devSnippet}</code></span>
          ${item.activatedIp ? `<br /><span style="color: #94a3b8;">🌐 IP: ${item.activatedIp}</span>` : ''}
          <br /><span style="color: ${item.isLifetime ? '#10b981' : '#f59e0b'}; font-weight: 700;">⏳ ${expText}</span>
          ${item.modelId ? `<br /><span style="color: #c084fc;">Modelo: ${item.modelId}</span>` : ''}
        </div>
      `;
    } else {
      infoHtml = item.modelId ? `<span style="font-size:12px; color:#c084fc;">Vinculado a: ${item.modelId}</span>` : '<span style="color:var(--text-muted); font-size:12px;">—</span>';
    }

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <code style="font-size:13px; font-weight:800; color:#fff; background:#040508; padding:5px 9px; border-radius:4px; letter-spacing:0.05em; border: 1px solid rgba(255,255,255,0.1);">${item.code}</code>
            <button class="btn-copy-sm" onclick="copyCodeOnly('${item.code}')" title="Copiar apenas o código">Copiar</button>
          </div>
        </td>
        <td><strong>${item.label || item.type}</strong></td>
        <td><strong style="color:var(--primary); font-size:13px;">${priceText}</strong></td>
        <td>${statusBadge}</td>
        <td>${activationHtml}</td>
        <td>${infoHtml}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button class="btn-copy-sm" style="background:linear-gradient(135deg, #25D366, #128C7E); color:#fff; border:none; padding: 5px 10px;" onclick="copyWhatsAppMessage('${item.code}', '${item.type}', '${priceText}')" title="Copiar mensagem personalizada com link direto para o cliente no WhatsApp">
              📲 WhatsApp
            </button>
            ${item.status === 'USED' ? `
              <button class="btn-copy-sm" style="background:#1e293b; color:#38bdf8; border:1px solid rgba(56,189,248,0.3); padding: 5px 8px;" onclick="openCodeAuditModal('${item.code}')" title="Ver auditoria detalhada de ativação">
                🔍 Auditoria
              </button>
            ` : ''}
            ${!isMaster ? `
              <button class="btn-copy-sm" style="background:#271017; color:#f43f5e; border:1px solid rgba(244,63,94,0.3); padding: 5px 8px;" onclick="deleteVipCode('${item.code}')" title="Excluir código">
                ✕
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openCodeAuditModal(code) {
  const codeItem = codesCache.find(c => c.code === code);
  if (!codeItem) return;

  const modal = document.getElementById('modalCodeAudit');
  const body = document.getElementById('codeAuditBody');
  if (!modal || !body) return;

  const actTime = codeItem.activatedAt || codeItem.usedAt;
  const d = actTime ? new Date(actTime) : null;
  const dateFormatted = d ? `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR')} (Horário de Brasília)` : 'Não registrado';
  const relTime = getRelativeTimeString(actTime);

  let expInfo = codeItem.isLifetime ? 'Acesso Vitalício Permanente (Nunca Expira)' : '7 Dias';
  if (!codeItem.isLifetime && codeItem.expiresAt) {
    const leftMs = codeItem.expiresAt - Date.now();
    const days = Math.ceil(leftMs / (1000 * 60 * 60 * 24));
    const expDate = new Date(codeItem.expiresAt).toLocaleDateString('pt-BR');
    expInfo = days > 0 ? `Ativo até ${expDate} (Restam ${days} dia(s))` : `Expirado em ${expDate}`;
  }

  body.innerHTML = `
    <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 18px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px; margin-bottom: 14px;">
        <div>
          <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Código de Acesso</span>
          <h2 style="font-size: 22px; font-weight: 900; color: #fff; margin: 2px 0 0 0; letter-spacing: 0.05em;">${codeItem.code}</h2>
        </div>
        <div>
          <span class="code-badge-status used" style="font-size: 13px; padding: 6px 14px;">🔴 ATIVADO / EM USO</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 13px;">
        <div>
          <span style="color: var(--text-muted); font-size: 11px; display: block;">DATA E HORA DA ATIVAÇÃO</span>
          <strong style="color: #10b981; font-size: 14px;">📅 ${dateFormatted}</strong>
          <span style="display: block; font-size: 11px; color: #a7f3d0; margin-top: 2px;">⏱️ ${relTime}</span>
        </div>

        <div>
          <span style="color: var(--text-muted); font-size: 11px; display: block;">TIPO / PLANO CONTRATADO</span>
          <strong style="color: #fff; font-size: 14px;">${codeItem.label || codeItem.type}</strong>
          <span style="display: block; font-size: 12px; color: var(--primary); font-weight: 700;">R$ ${codeItem.price || '9,90'}</span>
        </div>

        <div>
          <span style="color: var(--text-muted); font-size: 11px; display: block;">ENDEREÇO IP DO CLIENTE</span>
          <code style="color: #38bdf8; font-size: 13px; background: rgba(56,189,248,0.1); padding: 3px 6px; border-radius: 4px;">🌐 ${codeItem.activatedIp || '127.0.0.1 / Desconhecido'}</code>
        </div>

        <div>
          <span style="color: var(--text-muted); font-size: 11px; display: block;">STATUS DO ACESSO / EXPIRAÇÃO</span>
          <strong style="color: ${codeItem.isLifetime ? '#10b981' : '#f59e0b'}; font-size: 13px;">⏳ ${expInfo}</strong>
        </div>

        <div style="grid-column: 1 / -1;">
          <span style="color: var(--text-muted); font-size: 11px; display: block;">IDENTIFICADOR ÚNICO DO APARELHO (DEVICE ID)</span>
          <code style="color: #cbd5e1; font-size: 12px; word-break: break-all; background: rgba(255,255,255,0.05); padding: 5px 8px; border-radius: 4px; display: block; margin-top: 4px;">📱 ${codeItem.usedByDeviceId || '—'}</code>
        </div>

        ${codeItem.activatedUserAgent ? `
          <div style="grid-column: 1 / -1;">
            <span style="color: var(--text-muted); font-size: 11px; display: block;">NAVEGADOR / DISPOSITIVO DO CLIENTE</span>
            <span style="color: #94a3b8; font-size: 11px; word-break: break-all; line-height: 1.4;">${codeItem.activatedUserAgent}</span>
          </div>
        ` : ''}

        ${codeItem.modelId ? `
          <div style="grid-column: 1 / -1;">
            <span style="color: var(--text-muted); font-size: 11px; display: block;">MODELO VINCULADA</span>
            <strong style="color: #c084fc; font-size: 14px;">⭐ ${codeItem.modelId}</strong>
          </div>
        ` : ''}
      </div>
    </div>

    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button class="btn-copy-sm" style="background: linear-gradient(135deg, #25D366, #128C7E); color: #fff; border: none; padding: 8px 16px; font-size: 12px;" onclick="copyWhatsAppMessage('${codeItem.code}', '${codeItem.type}', 'R$ ${codeItem.price || '9,90'}')">
        📲 Copiar Mensagem WhatsApp
      </button>
      <button class="btn-secondary" style="font-size: 12px; padding: 8px 16px;" onclick="closeCodeAuditModal()">Fechar</button>
    </div>
  `;

  modal.classList.add('open');
}

function closeCodeAuditModal() {
  const modal = document.getElementById('modalCodeAudit');
  if (modal) modal.classList.remove('open');
}

async function deleteVipCode(code) {
  if (!confirm(`Deseja realmente excluir o código ${code}? Esta ação não pode ser desfeita.`)) return;
  const key = getAdminKey();
  if (!key) return;

  try {
    const res = await fetch('/api/admin/codes/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Código ${code} removido!`);
      await loadAdminCodes();
    } else {
      showToast(data.error || 'Erro ao excluir código.');
    }
  } catch (e) {
    showToast('Erro de conexão ao excluir código.');
  }
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
// GERENCIAMENTO DA ORDEM DAS MODELOS NA VITRINE
// ═════════════════════════════════════════════════════════════════════════

let reorderDraft = [];

async function saveModelsOrder(orderedIds) {
  const key = getAdminKey();
  if (!key) return;

  try {
    const res = await fetch('/api/admin/models/reorder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': key
      },
      body: JSON.stringify({ orderedIds })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (Array.isArray(data.catalog)) {
        catalogCache = data.catalog;
      }
      renderModelsGrid();
      populateModelMediaSelect();
      showToast('✅ Nova ordem salva na vitrine!');
    } else {
      showToast(data.error || 'Erro ao salvar ordem.');
    }
  } catch (err) {
    console.error('Erro ao salvar ordem:', err);
    showToast('Erro de conexão ao salvar nova ordem.');
  }
}

async function moveModel(modelId, delta) {
  const idx = catalogCache.findIndex(m => m.id === modelId);
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= catalogCache.length) return;

  const item = catalogCache.splice(idx, 1)[0];
  catalogCache.splice(newIdx, 0, item);
  renderModelsGrid();

  const orderedIds = catalogCache.map(m => m.id);
  await saveModelsOrder(orderedIds);
}

async function moveModelToTop(modelId) {
  const idx = catalogCache.findIndex(m => m.id === modelId);
  if (idx === -1 || idx === 0) return;

  const item = catalogCache.splice(idx, 1)[0];
  catalogCache.unshift(item);
  renderModelsGrid();

  const orderedIds = catalogCache.map(m => m.id);
  await saveModelsOrder(orderedIds);
}

function applyModelSortPreset(preset) {
  if (preset === 'custom') return;

  const copy = [...catalogCache];
  if (preset === 'trending') {
    copy.sort((a, b) => (parseInt(b.views) || 0) - (parseInt(a.views) || 0));
  } else if (preset === 'rating') {
    copy.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
  } else if (preset === 'newest') {
    copy.reverse();
  } else if (preset === 'alpha') {
    copy.sort((a, b) => (a.creatorName || '').localeCompare(b.creatorName || ''));
  }

  catalogCache = copy;
  renderModelsGrid();
  saveModelsOrder(catalogCache.map(m => m.id));
}

function openReorderModal() {
  const modal = document.getElementById('modalReorder');
  if (!modal) return;
  reorderDraft = [...catalogCache];
  renderReorderList();
  modal.classList.add('open');
}

function closeReorderModal() {
  const modal = document.getElementById('modalReorder');
  if (modal) modal.classList.remove('open');
}

function resetReorderToCatalog() {
  reorderDraft = [...catalogCache];
  renderReorderList();
}

function renderReorderList() {
  const container = document.getElementById('reorderListContainer');
  if (!container) return;

  container.innerHTML = reorderDraft.map((model, idx) => {
    const avatar = model.avatar || model.cover || 'assets/logo.jpg';
    return `
      <div class="reorder-item-card">
        <div class="reorder-item-left">
          <input type="number" min="1" max="${reorderDraft.length}" value="${idx + 1}" class="reorder-pos-input" onchange="setReorderPosition(${idx}, parseInt(this.value, 10))" title="Digite a posição desejada" />
          <img src="${avatar}" alt="${model.creatorName}" class="reorder-item-thumb" onerror="this.src='assets/logo.jpg'" />
          <div class="reorder-item-info">
            <span class="reorder-item-title">${model.creatorName}</span>
            <span class="reorder-item-sub">${model.title || model.username || ''}</span>
          </div>
        </div>
        <div class="reorder-item-controls">
          ${idx > 0 ? `<button class="btn-order-move" onclick="moveReorderItem(${idx}, -1)" title="Subir">⬆</button>` : '<div style="width:26px;"></div>'}
          ${idx < reorderDraft.length - 1 ? `<button class="btn-order-move" onclick="moveReorderItem(${idx}, 1)" title="Descer">⬇</button>` : '<div style="width:26px;"></div>'}
          ${idx > 0 ? `<button class="btn-order-move" style="background:#e11d48;" onclick="moveReorderItemToTop(${idx})" title="1º Lugar">🔝</button>` : '<div style="width:26px;"></div>'}
        </div>
      </div>
    `;
  }).join('');
}

function moveReorderItem(idx, delta) {
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= reorderDraft.length) return;
  const item = reorderDraft.splice(idx, 1)[0];
  reorderDraft.splice(newIdx, 0, item);
  renderReorderList();
}

function moveReorderItemToTop(idx) {
  if (idx <= 0) return;
  const item = reorderDraft.splice(idx, 1)[0];
  reorderDraft.unshift(item);
  renderReorderList();
}

function setReorderPosition(fromIdx, targetPos) {
  if (isNaN(targetPos) || targetPos < 1 || targetPos > reorderDraft.length) {
    renderReorderList();
    return;
  }
  const toIdx = targetPos - 1;
  const item = reorderDraft.splice(fromIdx, 1)[0];
  reorderDraft.splice(toIdx, 0, item);
  renderReorderList();
}

async function saveReorderChanges() {
  const orderedIds = reorderDraft.map(m => m.id);
  closeReorderModal();
  await saveModelsOrder(orderedIds);
}

// ═════════════════════════════════════════════════════════════════════════
// GERENCIAMENTO DE BANCO DE DADOS & BACKUPS
// ═════════════════════════════════════════════════════════════════════════

function downloadDatabaseBackup() {
  const key = getAdminKey();
  if (!key) {
    showToast('⚠️ Faça login como Administrador.');
    return;
  }
  showToast('💾 Gerando download do backup do banco...');
  const url = `/api/admin/backups/export?key=${encodeURIComponent(key)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_clube_secreto_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function createManualBackup() {
  const key = getAdminKey();
  if (!key) return;

  try {
    showToast('⚡ Criando ponto de restauração...');
    const res = await fetch('/api/admin/backups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('✅ ' + data.message);
      await loadBackupsList();
    } else {
      showToast(data.error || 'Erro ao criar backup.');
    }
  } catch(e) {
    showToast('Erro de conexão ao criar backup.');
  }
}

async function loadBackupsList() {
  const key = getAdminKey();
  if (!key) return;

  const tbody = document.getElementById('backupsTableBody');
  const countModels = document.getElementById('backupModelsCount');
  const countCodes = document.getElementById('backupCodesCount');
  const countSnapshots = document.getElementById('backupSnapshotsCount');

  if (countModels && catalogCache) countModels.textContent = catalogCache.length;
  if (countCodes && codesCache) countCodes.textContent = codesCache.length;

  try {
    const res = await fetch('/api/admin/backups/list', {
      headers: { 'x-admin-key': key }
    });
    const data = await res.json();
    if (res.ok && data.success && Array.isArray(data.backups)) {
      if (countSnapshots) countSnapshots.textContent = data.backups.length;
      if (!tbody) return;

      if (data.backups.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 25px; color: var(--text-muted);">Nenhum backup em disco ainda.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.backups.map(b => {
        const reasonLabels = {
          server_startup: '🚀 Inicialização do Servidor',
          manual_admin: '⚡ Manual pelo Admin',
          before_reorder_models: '🔀 Reordenação de Modelos',
          before_settings_save: '💰 Alteração de Preços & PIX',
          before_catalog_save: '💃 Alteração no Catálogo',
          before_codes_save: '🔑 Geração/Exclusão de Códigos',
          catalog_update: '💃 Alteração no Catálogo',
          codes_update: '🔑 Geração/Exclusão de Códigos',
          pre_restore: '🛡️ Segurança Pré-Restauração',
          pre_import: '🛡️ Segurança Pré-Importação'
        };
        const label = reasonLabels[b.reason] || `ℹ️ ${b.reason || 'Automático'}`;
        return `
          <tr>
            <td>
              <strong style="color: #fff; font-size: 13px;">${b.date}</strong>
              <span style="display:block; font-size: 10px; color: var(--text-muted); font-family: monospace;">${b.filename}</span>
            </td>
            <td>
              <span style="background: rgba(255,255,255,0.08); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #cbd5e1;">${label}</span>
            </td>
            <td><strong style="color: #fbbf24;">${b.modelsCount}</strong></td>
            <td><strong style="color: #38bdf8;">${b.codesCount}</strong></td>
            <td><span style="color: #94a3b8; font-size: 12px;">${b.sizeKb} KB</span></td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn-copy-sm" style="background: #10b981; border: none;" onclick="restoreLocalBackup('${b.filename}')" title="Restaurar o banco para este ponto">
                  <span>📥 Restaurar</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar backups:', err);
  }
}

async function restoreLocalBackup(filename) {
  if (!confirm(`Tem certeza que deseja restaurar o banco de dados para o ponto "${filename}"?\n\nUm backup de segurança do estado atual será criado antes da restauração.`)) {
    return;
  }
  const key = getAdminKey();
  if (!key) return;

  try {
    showToast('🔄 Restaurando banco de dados...');
    const res = await fetch('/api/admin/backups/restore-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: JSON.stringify({ filename })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('🎉 ' + data.message);
      await loadAdminCatalog();
      await loadAdminCodes();
      await loadBackupsList();
    } else {
      showToast(data.error || 'Erro ao restaurar backup.');
    }
  } catch (err) {
    showToast('Erro de conexão ao restaurar.');
  }
}

async function uploadAndRestoreBackup() {
  const input = document.getElementById('backupFileInput');
  if (!input || !input.files || input.files.length === 0) {
    showToast('⚠️ Selecione um arquivo de backup .json primeiro.');
    return;
  }

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backupData = JSON.parse(e.target.result);
      if (!Array.isArray(backupData.catalog) || !Array.isArray(backupData.vipCodes)) {
        showToast('❌ Arquivo inválido! Não contém catálogo ou códigos VIP.');
        return;
      }

      if (!confirm(`Confirmar restauração de backup com ${backupData.catalog.length} modelos e ${backupData.vipCodes.length} códigos VIP?`)) {
        return;
      }

      const key = getAdminKey();
      showToast('🔄 Importando e aplicando backup...');
      const res = await fetch('/api/admin/backups/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({ backupData })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('🎉 ' + data.message);
        input.value = '';
        await loadAdminCatalog();
        await loadAdminCodes();
        await loadBackupsList();
      } else {
        showToast(data.error || 'Erro ao importar backup.');
      }
    } catch(err) {
      showToast('❌ Erro ao ler arquivo JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
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

