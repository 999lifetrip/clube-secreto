// ═════════════════════════════════════════════════════════════════════════
// APP.JS — LÓGICA DE INTERFACE, CHECKOUT PIX, LIGHTBOX & SISTEMA ANTI-BURLA
// ═════════════════════════════════════════════════════════════════════════

const WHATSAPP_NUMBER = "554195993007"; // Central de Vendas & Envio de Códigos
const PIX_CPF = "09658990983";

// Gera ou recupera identificador único e persistente do dispositivo (Anti-Burla)
function getDeviceId() {
  let id = localStorage.getItem("clube_secreto_device_id");
  if (!id) {
    id = "cs_dev_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now().toString(36);
    localStorage.setItem("clube_secreto_device_id", id);
  }
  return id;
}

let currentCategory = "all";
let currentSearch = "";
let isVipActive = false;       // true se VIP Total Semanal ou Admin
let isAdminActive = false;     // true se Admin Master Vitalício
let unlockedModels = new Set(); // Modelos desbloqueadas individualmente (R$ 9,90)
let vipDaysRemaining = 0;
let currentPreviewItem = null;

// Estado do Lightbox
let currentLightboxPhotos = [];
let currentLightboxIndex = 0;
let currentLightboxItem = null;

let selectedItem = {
  name: "PASSE VIP TOTAL (7 DIAS DE ACESSO A TODAS AS MODELOS)",
  price: "24,99",
  duration: "7 Dias de Acesso Total"
};

// Elementos DOM
const cardsGrid = document.getElementById("cardsGrid");
const resultsCount = document.getElementById("resultsCount");
const searchInput = document.getElementById("searchInput");
const categoryPills = document.querySelectorAll(".cat-pill");

// Elementos de Status VIP no Topo
const btnHeaderVip = document.getElementById("btnHeaderVip");
const btnHeaderVipText = document.getElementById("btnHeaderVipText");
const vipActiveBanner = document.getElementById("vipActiveBanner");
const vipActiveBannerText = document.getElementById("vipActiveBannerText");

// Modais
const previewModal = document.getElementById("previewModal");
const previewTitle = document.getElementById("previewTitle");
const previewCreator = document.getElementById("previewCreator");
const previewGrid = document.getElementById("previewGrid");
const previewModalFooter = document.getElementById("previewModalFooter");

const pixModal = document.getElementById("pixModal");
const pixItemName = document.getElementById("pixItemName");
const pixItemValue = document.getElementById("pixItemValue");
const pixItemDuration = document.getElementById("pixItemDuration");
const btnWhatsAppConfirm = document.getElementById("btnWhatsAppConfirm");
const pixInlineCode = document.getElementById("pixInlineCode");

const codeModal = document.getElementById("codeModal");
const vipCodeInput = document.getElementById("vipCodeInput");

// Lightbox DOM
const lightboxModal = document.getElementById("lightboxModal");
const lightboxTitle = document.getElementById("lightboxTitle");
const lightboxCounter = document.getElementById("lightboxCounter");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxWatermark = document.getElementById("lightboxWatermark");
const lightboxImgWrapper = document.getElementById("lightboxImgWrapper");
const lightboxLockedSlide = document.getElementById("lightboxLockedSlide");
const lightboxLockedTitle = document.getElementById("lightboxLockedTitle");

const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
  getDeviceId(); // Garante inicialização do ID do dispositivo
  checkVipStatus();
  renderReelsCarousel();
  renderCatalog();
  setupEventListeners();
  syncStatusWithBackend();

  // 1-Click Auto Ativação por link do WhatsApp (?codigo=... ou ?c=... e opcional &modelo=...)
  const urlParams = new URLSearchParams(window.location.search);
  const autoCode = urlParams.get('codigo') || urlParams.get('c') || urlParams.get('code');
  const autoModel = urlParams.get('modelo') || urlParams.get('m');

  if (autoModel && typeof CREATORS_CATALOG !== 'undefined') {
    const targetModel = CREATORS_CATALOG.find(m => 
      m.id === autoModel || 
      m.id.replace('ensaio-vip-', '') === autoModel.toLowerCase() ||
      m.creatorName.toLowerCase().includes(autoModel.toLowerCase())
    );
    if (targetModel) {
      openPreviewModal(targetModel.id);
    }
  }

  if (autoCode) {
    setTimeout(async () => {
      if (vipCodeInput) vipCodeInput.value = autoCode.trim();
      await submitVipCode(autoCode.trim());
    }, 450);
  }
});

// Verifica se um modelo específico está desbloqueado
function isModelUnlocked(itemId) {
  if (isAdminActive || isVipActive) return true;
  return unlockedModels.has(itemId);
}

// Verifica estado do VIP/Admin salvo localmente
function checkVipStatus() {
  try {
    const raw = localStorage.getItem("clube_secreto_vip");
    if (!raw) {
      isVipActive = false;
      isAdminActive = false;
      unlockedModels.clear();
      updateVipUI();
      return;
    }

    const vipData = JSON.parse(raw);
    const now = Date.now();

    if (vipData.active && vipData.expiresAt && vipData.expiresAt > now) {
      isAdminActive = !!vipData.isAdmin;
      isVipActive = !!vipData.isWeeklyVip || isAdminActive;
      vipDaysRemaining = Math.max(1, Math.ceil((vipData.expiresAt - now) / (1000 * 60 * 60 * 24)));
      unlockedModels = new Set(Array.isArray(vipData.unlockedModels) ? vipData.unlockedModels : []);
    } else {
      isVipActive = false;
      isAdminActive = false;
      unlockedModels.clear();
      localStorage.removeItem("clube_secreto_vip");
    }
  } catch (e) {
    isVipActive = false;
    isAdminActive = false;
    unlockedModels.clear();
  }

  updateVipUI();
}

// Sincroniza com o servidor caso o cache local tenha sido limpo
async function syncStatusWithBackend() {
  try {
    const deviceId = getDeviceId();
    const res = await fetch("/api/check-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId })
    });
    const data = await res.json();
    if (data.success && data.hasActive) {
      if (data.isWeeklyVip) isVipActive = true;
      if (Array.isArray(data.unlockedModels)) {
        data.unlockedModels.forEach(m => unlockedModels.add(m));
      }
      updateVipUI();
      renderCatalog();
    }
  } catch (e) {
    // Modo offline silencioso
  }
}

function updateVipUI() {
  const hasAccess = isAdminActive || isVipActive || unlockedModels.size > 0;
  const btnHeaderVipIcon = document.getElementById("btnHeaderVipIcon");

  if (hasAccess) {
    if (btnHeaderVip) {
      btnHeaderVip.classList.remove("vip-active", "vip-admin");
      if (isAdminActive) {
        btnHeaderVip.classList.add("vip-admin");
        if (btnHeaderVipIcon) btnHeaderVipIcon.textContent = "👑";
        if (btnHeaderVipText) btnHeaderVipText.textContent = "Admin";
      } else if (isVipActive) {
        btnHeaderVip.classList.add("vip-active");
        if (btnHeaderVipIcon) btnHeaderVipIcon.textContent = "🔥";
        if (btnHeaderVipText) btnHeaderVipText.textContent = `VIP (${vipDaysRemaining}d)`;
      } else {
        btnHeaderVip.classList.add("vip-active");
        if (btnHeaderVipIcon) btnHeaderVipIcon.textContent = "🔓";
        if (btnHeaderVipText) btnHeaderVipText.textContent = `Pack (${vipDaysRemaining}d)`;
      }
    }
    if (vipActiveBanner) {
      vipActiveBanner.classList.remove("hidden");
      vipActiveBanner.classList.toggle("admin-mode", isAdminActive);
      if (vipActiveBannerText) {
        if (isAdminActive) {
          vipActiveBannerText.innerHTML = `👑 <strong>Admin Master Ativo</strong>`;
        } else if (isVipActive) {
          vipActiveBannerText.innerHTML = `🔥 <strong>VIP Total Ativo</strong> (${vipDaysRemaining}d restantes)`;
        } else {
          vipActiveBannerText.innerHTML = `✨ <strong>Pack Individual Ativo</strong> (${vipDaysRemaining}d restantes)`;
        }
      }
    }
  } else {
    if (btnHeaderVip) {
      btnHeaderVip.classList.remove("vip-active", "vip-admin");
      if (btnHeaderVipIcon) btnHeaderVipIcon.textContent = "👑";
      if (btnHeaderVipText) btnHeaderVipText.textContent = "Passe VIP";
    }
    if (vipActiveBanner) {
      vipActiveBanner.classList.add("hidden");
    }
  }
}

// Configura eventos
function setupEventListeners() {
  // Busca
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      renderCatalog();
    });
  }

  // Filtros de Categoria
  categoryPills.forEach(pill => {
    pill.addEventListener("click", () => {
      categoryPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      currentCategory = pill.dataset.cat || "all";
      renderCatalog();
    });
  });

  // Fechar modais ao clicar no backdrop escuro
  window.addEventListener("click", (e) => {
    if (e.target === previewModal) closePreviewModal();
    if (e.target === pixModal) closePixModal();
    if (e.target === codeModal) closeCodeModal();
    if (e.target === lightboxModal) closeLightbox();
  });

  // Teclado (ESC para fechar modais e setas para navegar no lightbox)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLightbox();
      closePreviewModal();
      closePixModal();
      closeCodeModal();
    }
    if (lightboxModal && lightboxModal.classList.contains("open")) {
      if (e.key === "ArrowRight") nextLightboxPhoto();
      if (e.key === "ArrowLeft") prevLightboxPhoto();
    }
  });

  // Tecla Enter no campo de código
  if (vipCodeInput) {
    vipCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitVipCode();
    });
  }

  if (pixInlineCode) {
    pixInlineCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") activateFromPixModal();
    });
  }
}

function renderCatalog() {
  const filtered = CREATORS_CATALOG.filter(item => {
    const matchesCategory = currentCategory === "all" || item.category === currentCategory;
    const matchesSearch = !currentSearch || 
      item.title.toLowerCase().includes(currentSearch) ||
      item.creatorName.toLowerCase().includes(currentSearch) ||
      item.username.toLowerCase().includes(currentSearch) ||
      item.categoryLabel.toLowerCase().includes(currentSearch) ||
      item.description.toLowerCase().includes(currentSearch);

    return matchesCategory && matchesSearch;
  });

  resultsCount.textContent = `${filtered.length} ensaio${filtered.length === 1 ? '' : 's'} disponível${filtered.length === 1 ? '' : 'is'}`;

  if (filtered.length === 0) {
    cardsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <span style="font-size: 40px; display: block; margin-bottom: 12px;">🔍</span>
        <h3 style="font-size: 18px; color: #fff; margin-bottom: 6px;">Nenhum ensaio encontrado</h3>
        <p style="font-size: 13px; color: var(--text-muted);">Tente buscar por outro termo ou selecione outra categoria.</p>
      </div>
    `;
    return;
  }

  cardsGrid.innerHTML = filtered.map(item => {
    const unlocked = isModelUnlocked(item.id);

    return `
      <div class="creator-card">
        <div class="card-media" onclick="openPreviewModal('${item.id}')" style="cursor: pointer;" title="Clique para abrir galeria de ${item.creatorName}">
          <img src="${item.cover}" alt="${item.title}" class="card-cover" loading="lazy" />
          <div class="card-gradient-overlay"></div>
          
          <span class="card-badge ${item.isTrending ? 'badge-trending' : ''}">${item.badge}</span>
          <span class="card-photo-count">📸 ${item.photoCount} Fotos${item.videoCount ? ` • 🎬 ${item.videoCount} Vídeos` : ''}</span>

          <div class="card-creator-info">
            <img src="${item.avatar}" alt="${item.creatorName}" class="creator-avatar" />
            <div class="creator-names">
              <span class="creator-name">${item.creatorName} <span class="verified-icon">✓</span></span>
              <span class="creator-username">${item.username}</span>
            </div>
          </div>
        </div>

        <div class="card-body">
          <h3 class="card-title" onclick="openPreviewModal('${item.id}')" style="cursor: pointer;">${item.title}</h3>
          <p class="card-desc">${item.description}</p>

          <div class="card-meta">
            <span>🌟 ${item.rating} (${item.views} views)</span>
            <span>💎 ${item.resolution}</span>
          </div>

          <div class="card-price-box">
            <div class="price-individual">
              <span class="price-label">${unlocked ? 'Status' : 'Pack Desta Modelo'}</span>
              <span class="price-val" style="color: ${unlocked ? '#10b981' : 'var(--text-primary)'};">${unlocked ? 'LIBERADO ✅' : `R$ ${item.individualPrice}`}</span>
            </div>
            <span style="font-size: 11px; color: ${unlocked ? '#10b981' : '#ff4d6d'}; font-weight: 700;">
              ${unlocked ? 'Acesso Ativo' : 'Semanal Total: R$ 24,99'}
            </span>
          </div>

          <div class="card-actions">
            <button class="btn-preview" onclick="openPreviewModal('${item.id}')">
              <span>👁️</span> Prévia
            </button>
            ${unlocked ? `
              <button class="btn-buy" style="background: linear-gradient(135deg, #059669, #047857);" onclick="openPreviewModal('${item.id}')">
                <span>🔓 Ver Ensaio</span>
              </button>
            ` : `
              <button class="btn-buy" onclick="openPixModal('Pack ${item.creatorName} — ${item.title}', '${item.individualPrice}', 'Acesso Individual (${item.creatorName})')">
                <span>R$ ${item.individualPrice}</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

let currentPreviewFilter = 'all'; // 'all' | 'videos' | 'photos'

function setPreviewFilter(filter) {
  currentPreviewFilter = filter;
  const tabAll = document.getElementById("modalTabAll");
  const tabVideos = document.getElementById("modalTabVideos");
  const tabPhotos = document.getElementById("modalTabPhotos");
  if (tabAll) tabAll.classList.toggle("active", filter === "all");
  if (tabVideos) tabVideos.classList.toggle("active", filter === "videos");
  if (tabPhotos) tabPhotos.classList.toggle("active", filter === "photos");

  if (currentPreviewItem) {
    renderPreviewContent(currentPreviewItem);
  }
}

function playVideoFullscreen(videoId) {
  const v = document.getElementById(videoId);
  if (v) {
    try {
      v.play();
    } catch (e) {}

    if (v.requestFullscreen) {
      v.requestFullscreen();
    } else if (v.webkitRequestFullscreen) {
      v.webkitRequestFullscreen();
    } else if (v.webkitEnterFullscreen) {
      v.webkitEnterFullscreen();
    }
  }
}

// Modal de Prévia
function openPreviewModal(itemId) {
  const item = CREATORS_CATALOG.find(i => i.id === itemId);
  if (!item) return;

  currentPreviewItem = item;
  currentPreviewFilter = 'all'; // reinicia no modo completo ao abrir

  const tabAll = document.getElementById("modalTabAll");
  const tabVideos = document.getElementById("modalTabVideos");
  const tabPhotos = document.getElementById("modalTabPhotos");
  if (tabAll) tabAll.classList.add("active");
  if (tabVideos) tabVideos.classList.remove("active");
  if (tabPhotos) tabPhotos.classList.remove("active");

  const numVideos = item.previews.filter(p => (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4'))).length;
  const numPhotos = item.previews.length - numVideos;

  const tabLabelAll = document.getElementById("tabLabelAll");
  const tabLabelVideos = document.getElementById("tabLabelVideos");
  const tabLabelPhotos = document.getElementById("tabLabelPhotos");
  if (tabLabelAll) tabLabelAll.textContent = `✨ Todas as Mídias (${item.previews.length})`;
  if (tabLabelVideos) tabLabelVideos.textContent = `🎬 Só Vídeos (${numVideos})`;
  if (tabLabelPhotos) tabLabelPhotos.textContent = `📸 Só Fotos (${numPhotos})`;

  previewTitle.textContent = item.title;
  previewCreator.textContent = `${item.creatorName} (${item.username}) • ${numPhotos} Fotos 4K + ${numVideos} Vídeos 60fps`;

  renderPreviewContent(item);
  previewModal.classList.add("open");
}

function renderPreviewContent(item) {
  const unlocked = isModelUnlocked(item.id);

  // Coleta fotos para o lightbox
  const photoPreviews = item.previews
    .map((p, idx) => {
      const isVideo = (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4'));
      return isVideo ? null : { url: typeof p === 'object' ? p.url : p, originalIndex: idx };
    })
    .filter(Boolean);

  currentLightboxPhotos = photoPreviews;
  currentLightboxItem = item;

  // Filtra itens de acordo com a aba selecionada (Todas, Só Vídeos, Só Fotos)
  let itemsToDisplay = item.previews.filter(p => {
    const isVideo = (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4'));
    if (currentPreviewFilter === 'videos') return isVideo;
    if (currentPreviewFilter === 'photos') return !isVideo;
    return true; // 'all'
  });

  // Se não desbloqueado, limita para modo teaser (priorizando mídias configuradas no painel ADM)
  let visibleItems = itemsToDisplay;
  if (!unlocked) {
    const adminTeasers = itemsToDisplay.filter(p => typeof p === 'object' && p.isTeaser);
    if (adminTeasers.length > 0) {
      visibleItems = adminTeasers;
    } else {
      if (currentPreviewFilter === 'videos') {
        visibleItems = itemsToDisplay.slice(0, 4); // Mostra 4 vídeos como prévia
      } else if (currentPreviewFilter === 'photos') {
        visibleItems = itemsToDisplay.slice(0, 8); // Mostra 8 fotos como prévia
      } else {
        const vids = itemsToDisplay.filter(p => (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4'))).slice(0, 2);
        const pics = itemsToDisplay.filter(p => !((typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4')))).slice(0, 8);
        visibleItems = [...vids, ...pics];
      }
    }
  }

  const totalVideosInPack = item.previews.filter(p => (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4'))).length;

  let videoSeq = 0;
  let html = visibleItems.map((p, idx) => {
    const isVideo = (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4'));
    const url = typeof p === 'object' ? p.url : p;

    if (isVideo) {
      videoSeq++;
      const playerId = `player_${item.id}_${videoSeq}`;
      return `
        <div class="preview-video-card">
          <div class="preview-video-header">
            <div class="video-header-left">
              <span class="video-icon">🎬</span>
              <span class="video-title">Vídeo ${videoSeq} de ${totalVideosInPack} • ${item.creatorName}</span>
            </div>
            <span class="video-badge-hd">${unlocked ? '🔓 COMPLETO HD' : '🔒 PRÉVIA'}</span>
          </div>

          <div class="preview-video-player-container">
            <video id="${playerId}" src="${url}" controls playsinline preload="metadata" class="responsive-video"></video>
            ${!unlocked ? `<div class="video-watermark-tag">CLUBE SECRETO VIP 🔒</div>` : ''}
          </div>

          <div class="video-action-bar">
            <button class="btn-play-fullscreen" onclick="playVideoFullscreen('${playerId}')">
              <span>▶️ Assistir em Tela Cheia</span>
            </button>
            <span class="video-tip">Toque no centro do vídeo para pausar ou tocar</span>
          </div>
        </div>
      `;
    }

    // Foto
    const photoIdx = photoPreviews.findIndex(pi => pi.url === url);
    return `
      <div class="preview-item" onclick="openLightbox(${photoIdx >= 0 ? photoIdx : 0})" title="Toque para ampliar a foto de ${item.creatorName}">
        <img src="${url}" class="preview-img" alt="Foto do Ensaio" loading="lazy" />
        ${!unlocked ? `<div class="watermark-overlay">CLUBE SECRETO</div>` : ''}
      </div>
    `;
  }).join("");

  // Cards Teaser de Bloqueio quando não desbloqueado
  if (!unlocked) {
    const remainingPhotos = Math.max(1, item.photoCount - 30);
    const remainingVideos = Math.max(1, (item.videoCount || 50) - 8);

    if (currentPreviewFilter === 'all' || currentPreviewFilter === 'photos') {
      html += `
        <div class="preview-item preview-locked-item" onclick="openCodeModal()" title="Desbloquear fotos completas">
          <span class="locked-icon">🔒</span>
          <span class="locked-count">+${remainingPhotos} FOTOS 4K</span>
          <span class="locked-sub">Bloqueadas no Modo Grátis</span>
          <button class="btn-locked-unlock">🔑 Digitar Código</button>
        </div>
      `;
    }

    if (currentPreviewFilter === 'all' || currentPreviewFilter === 'videos') {
      html += `
        <div class="preview-item preview-locked-item" onclick="openCodeModal()" title="Desbloquear todos os vídeos">
          <span class="locked-icon">🎬</span>
          <span class="locked-count">+${remainingVideos} VÍDEOS 60FPS</span>
          <span class="locked-sub">Exclusivos no Acesso Completo</span>
          <button class="btn-locked-unlock">🔑 Liberar Tudo</button>
        </div>
      `;
    }
  }

  previewGrid.innerHTML = html;

  // Atualizar botões no rodapé do modal de prévia (100% acessível e claro)
  if (unlocked) {
    previewModalFooter.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 10px;">
        <div>
          <span style="font-size: 11px; color: #10b981; text-transform: uppercase; font-weight: 800;">Status do Acesso:</span>
          <span style="font-size: 17px; font-weight: 900; color: #10b981; display: block;">🔓 ${isAdminActive ? 'ACESSO MASTER ADMINISTRADOR' : (isVipActive ? 'VIP TOTAL LIBERADO (TODAS)' : 'PACK DESTA MODELO LIBERADO')}</span>
        </div>
        <button class="btn-buy" style="background: linear-gradient(135deg, #059669, #047857); padding: 12px 20px;" onclick="openLightbox(0)">
          <span>👁️ Ver Fotos em Tela Cheia</span>
        </button>
      </div>
    `;
  } else {
    previewModalFooter.innerHTML = `
      <div class="mobile-accessible-footer">
        <button class="btn-accessible-single" onclick="buyCurrentSingle()">
          <span class="btn-acc-icon">🔓</span>
          <div class="btn-acc-texts">
            <span class="btn-acc-main">COMPRAR SÓ ESTA MODELO</span>
            <span class="btn-acc-sub">Apenas R$ ${item.individualPrice || '9,90'} no PIX (Acesso Completo)</span>
          </div>
        </button>

        <button class="btn-accessible-weekly" onclick="buyWeeklyFromPreview()">
          <span class="btn-acc-icon">👑</span>
          <div class="btn-acc-texts">
            <span class="btn-acc-main">LIBERAR TODAS AS MODELOS</span>
            <span class="btn-acc-sub">Plano Semanal VIP R$ 24,99 (Acesso a Tudo)</span>
          </div>
        </button>
      </div>
      <button class="btn-accessible-code" onclick="openCodeModal()">
        <span>🔑 Já realizou o pagamento? Clique aqui para digitar seu código</span>
      </button>
    `;
  }
}

function closePreviewModal() {
  previewModal.classList.remove("open");
  const videos = previewGrid.querySelectorAll("video");
  videos.forEach(v => {
    try {
      v.pause();
      v.currentTime = 0;
    } catch (e) {}
  });
}

function buyCurrentSingle() {
  if (!currentPreviewItem) return;
  closePreviewModal();
  openPixModal(
    `Pack ${currentPreviewItem.creatorName} — ${currentPreviewItem.title}`,
    currentPreviewItem.individualPrice || "9,90",
    `Acesso Completo (${currentPreviewItem.creatorName})`
  );
}

function buyWeeklyFromPreview() {
  closePreviewModal();
  openVipModal();
}

// ═════════════════════════════════════════════════════════════════════════
// LIGHTBOX (VISUALIZADOR EM TELA CHEIA DAS FOTOS)
// ═════════════════════════════════════════════════════════════════════════

function openLightbox(photoIndex) {
  if (!currentLightboxPhotos || currentLightboxPhotos.length === 0) return;

  currentLightboxIndex = photoIndex;
  renderLightboxSlide();
  lightboxModal.classList.add("open");
}

function renderLightboxSlide() {
  if (!currentLightboxItem) return;

  const unlocked = isModelUnlocked(currentLightboxItem.id);
  lightboxTitle.textContent = `${currentLightboxItem.creatorName} — Ensaio Oficial`;

  const totalPhotosInPack = currentLightboxItem.photoCount;
  const numAvailablePreviews = currentLightboxPhotos.length;

  // Se o usuário navegou além das prévias disponíveis no modo bloqueado
  if (currentLightboxIndex >= numAvailablePreviews && !unlocked) {
    lightboxImgWrapper.style.display = "none";
    lightboxLockedSlide.style.display = "block";
    lightboxLockedTitle.textContent = `+${totalPhotosInPack - numAvailablePreviews} Fotos Restantes Bloqueadas`;
    lightboxCounter.textContent = `Foto ${numAvailablePreviews + 1} de ${totalPhotosInPack} (Bloqueada)`;
    return;
  }

  // Foto normal disponível
  lightboxLockedSlide.style.display = "none";
  lightboxImgWrapper.style.display = "flex";

  const safeIdx = Math.max(0, Math.min(currentLightboxIndex, numAvailablePreviews - 1));
  const currentPhoto = currentLightboxPhotos[safeIdx];

  lightboxImg.src = currentPhoto.url;
  lightboxCounter.textContent = `Foto ${safeIdx + 1} de ${totalPhotosInPack} ${!unlocked ? '(Modo Prévia)' : '(Liberada em Ultra HD)'}`;

  if (unlocked) {
    lightboxWatermark.style.display = "none";
  } else {
    lightboxWatermark.style.display = "flex";
  }
}

function nextLightboxPhoto() {
  if (!currentLightboxItem) return;
  const unlocked = isModelUnlocked(currentLightboxItem.id);
  const maxIdx = unlocked ? currentLightboxPhotos.length - 1 : currentLightboxPhotos.length;
  
  if (currentLightboxIndex < maxIdx) {
    currentLightboxIndex++;
    renderLightboxSlide();
  } else {
    if (!unlocked) {
      currentLightboxIndex = currentLightboxPhotos.length;
      renderLightboxSlide();
    }
  }
}

function prevLightboxPhoto() {
  if (currentLightboxIndex > 0) {
    currentLightboxIndex--;
    renderLightboxSlide();
  }
}

function closeLightbox() {
  if (lightboxModal) lightboxModal.classList.remove("open");
}

// ═════════════════════════════════════════════════════════════════════════
// MODAL DE PIX (INDIVIDUAL R$ 9,90 OU PASSE VIP TOTAL R$ 24,99)
// ═════════════════════════════════════════════════════════════════════════

function openPixModal(itemName, itemPrice = "24,99", duration = "7 Dias de Acesso Total") {
  selectedItem = {
    name: itemName,
    price: itemPrice,
    duration: duration
  };

  pixItemName.textContent = itemName;
  pixItemValue.textContent = `R$ ${itemPrice}`;
  if (pixItemDuration) pixItemDuration.textContent = duration;

  const isWeekly = itemPrice === "24,99" || itemName.toLowerCase().includes("semanal") || itemName.toLowerCase().includes("total");
  const actionText = isWeekly ? "PASSE VIP TOTAL (7 DIAS)" : "PACK INDIVIDUAL (R$ 9,90)";

  const message = `Olá! Realizei o PIX de R$ ${itemPrice} para o *${itemName}* (${actionText}) no Clube Secreto.\n\nSegue meu comprovante para envio do meu *CÓDIGO DE ACESSO EXCLUSIVO* para liberar o site:`;
  btnWhatsAppConfirm.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  pixModal.classList.add("open");
}

function closePixModal() {
  pixModal.classList.remove("open");
}

function openVipModal() {
  if (isVipActive) {
    showToast(`Seu Passe VIP Total já está ativo (${vipDaysRemaining} dias restantes)!`);
    return;
  }
  openPixModal("PASSE VIP TOTAL (TODAS AS MODELOS)", "24,99", "7 Dias de Acesso Total");
}

// ═════════════════════════════════════════════════════════════════════════
// MODAL DE CÓDIGO VIP & VALIDAÇÃO ANTI-BURLA DE USO ÚNICO
// ═════════════════════════════════════════════════════════════════════════

function openCodeModal() {
  if (codeModal) {
    if (vipCodeInput) vipCodeInput.value = "";
    codeModal.classList.add("open");
    setTimeout(() => {
      if (vipCodeInput) vipCodeInput.focus();
    }, 150);
  }
}

function closeCodeModal() {
  if (codeModal) codeModal.classList.remove("open");
}

// Validação Segura do Código Único no Backend
async function activateCode(rawCode) {
  if (!rawCode) {
    showToast("⚠️ Digite um código de acesso válido.");
    return false;
  }

  // Normalização ultra flexível: aceita 'vip0000', 'Vip 0000', 'vip-0000', 'VIP0000'
  const cleanCode = (rawCode || '').replace(/[-\s_]/g, '').trim().toUpperCase();
  const deviceId = getDeviceId();
  const targetModelId = currentPreviewItem ? currentPreviewItem.id : null;

  try {
    showToast("⏳ Validando código único com segurança antifraude...");

    const response = await fetch("/api/activate-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: cleanCode,
        deviceId: deviceId,
        targetModelId: targetModelId
      })
    });

    const data = await response.json();

    if (!data.success) {
      showToast(data.error || "❌ Código inválido ou já utilizado.");
      return false;
    }

    // Carrega desbloqueios prévios
    const rawLocal = localStorage.getItem("clube_secreto_vip");
    let currentUnlocked = [];
    if (rawLocal) {
      try {
        const parsed = JSON.parse(rawLocal);
        if (Array.isArray(parsed.unlockedModels)) currentUnlocked = parsed.unlockedModels;
      } catch (e) {}
    }

    if (data.modelId && !currentUnlocked.includes(data.modelId)) {
      currentUnlocked.push(data.modelId);
    }

    const newPayload = {
      active: true,
      isAdmin: !!data.isAdmin,
      isWeeklyVip: !!data.isWeeklyVip || !!data.allModels,
      unlockedModels: currentUnlocked,
      plan: data.plan,
      code: cleanCode,
      activatedAt: Date.now(),
      expiresAt: data.expiresAt
    };

    localStorage.setItem("clube_secreto_vip", JSON.stringify(newPayload));
    checkVipStatus();
    renderCatalog();

    showToast(data.message || "🎉 Código ativado com sucesso!");

    closeCodeModal();
    closePixModal();
    closeLightbox();

    // Se estiver com modal aberto ou se o código for de uma modelo específica, abre direto
    if (currentPreviewItem) {
      openPreviewModal(currentPreviewItem.id);
    } else if (data.modelId) {
      openPreviewModal(data.modelId);
    }

    return true;
  } catch (err) {
    console.error("Erro na ativação:", err);
    showToast("⚠️ Erro ao comunicar com o servidor de validação.");
    return false;
  }
}

async function pasteCodeFromClipboard() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && vipCodeInput) {
        vipCodeInput.value = text.trim();
        showToast("✅ Código colado com sucesso!");
        vipCodeInput.focus();
        return;
      }
    }
  } catch (e) {}
  showToast("Toque no campo de código e segure para colar.");
  if (vipCodeInput) vipCodeInput.focus();
}

function submitVipCode(codeOverride) {
  const code = codeOverride || (vipCodeInput ? vipCodeInput.value : "");
  activateCode(code);
}

// ═════════════════════════════════════════════════════════════════════════
// REELS FEED EM TELA CHEIA (ESTILO TIKTOK & INSTAGRAM REELS)
// Arrastando vendo as modelos com botão sempre fixo abaixo para acessar
// ═════════════════════════════════════════════════════════════════════════

let currentActiveReelModelId = null;
let reelsAudioMuted = true;
let reelsFeedObserver = null;

function renderReelsCarousel() {
  const container = document.getElementById("reelsCarousel");
  if (!container || typeof CREATORS_CATALOG === "undefined") return;

  const modelsWithMedia = CREATORS_CATALOG.filter(m => Array.isArray(m.previews) && m.previews.length > 0);

  container.innerHTML = modelsWithMedia.map(model => {
    const videoPreview = model.previews.find(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4")));
    const videoUrl = videoPreview ? (typeof videoPreview === "object" ? videoPreview.url : videoPreview) : null;
    const coverUrl = model.cover || model.avatar || (typeof model.previews[0] === "object" ? model.previews[0].url : model.previews[0]);
    const numVideos = model.previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;

    return `
      <div class="reel-card" onclick="openReelsFeed('${model.id}')" title="Assistir Reels de ${model.creatorName}">
        <div class="reel-card-inner">
          ${videoUrl ? `
            <video class="reel-video" src="${videoUrl}" muted loop playsinline preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause()"></video>
          ` : `
            <img class="reel-img" src="${coverUrl}" alt="${model.creatorName}" loading="lazy" />
          `}
          <div class="reel-top-tag">
            <span>🎬</span> ${numVideos > 0 ? `${numVideos} VÍDEOS` : "VIP"}
          </div>
          <div class="reel-play-icon">▶</div>
          <div class="reel-overlay-bottom">
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:2px;">
              <img src="${model.avatar || coverUrl}" alt="${model.creatorName}" class="reel-creator-avatar" onerror="this.src='assets/logo.jpg'" />
              <div style="overflow:hidden;">
                <span class="reel-creator-name">${model.creatorName}</span>
                <span class="reel-creator-vids">⚡ ${numVideos} Vídeos</span>
              </div>
            </div>
            <button class="reel-card-access-btn" onclick="event.stopPropagation(); openModelDirectFromReel('${model.id}')">
              <span>🔓 Acessar</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function openReelsFeed(startModelId) {
  const overlay = document.getElementById("reelsFeedOverlay");
  const container = document.getElementById("reelsFeedContainer");
  if (!overlay || !container || typeof CREATORS_CATALOG === "undefined") return;

  const modelsWithVideos = CREATORS_CATALOG.filter(m => 
    Array.isArray(m.previews) && 
    m.previews.some(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4")))
  );

  if (modelsWithVideos.length === 0) {
    showToast("Nenhum vídeo disponível no momento.");
    return;
  }

  container.innerHTML = modelsWithVideos.map((model, idx) => {
    const vid = model.previews.find(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4")));
    const vidUrl = vid ? (typeof vid === "object" ? vid.url : vid) : "";
    const coverUrl = model.cover || model.avatar || "assets/logo.jpg";
    const numVideos = model.previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;
    const likes = (14.2 + (idx * 2.8)).toFixed(1);

    return `
      <div class="reel-slide" data-model-id="${model.id}" id="reelSlide_${model.id}">
        <video class="reel-slide-video" src="${vidUrl}" playsinline loop preload="auto" poster="${coverUrl}" muted onclick="toggleReelSlidePlayback(this)"></video>
        
        <div class="reel-sidebar-actions">
          <div class="reel-action-btn reel-sidebar-avatar-box" onclick="accessCurrentReelModel()">
            <img src="${model.avatar || coverUrl}" class="reel-sidebar-avatar" onerror="this.src='assets/logo.jpg'" />
            <span class="reel-sidebar-badge">✓</span>
          </div>
          <div class="reel-action-btn" onclick="toggleReelHeart(this)">
            <span class="reel-heart-icon">❤️</span>
            <span class="reel-action-count">${likes}k</span>
          </div>
          <div class="reel-action-btn" onclick="accessCurrentReelModel()">
            <span class="reel-action-icon">🎬</span>
            <span class="reel-action-count">${numVideos} Vids</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";

  if (reelsFeedObserver) reelsFeedObserver.disconnect();

  reelsFeedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const vid = entry.target.querySelector("video");
      const modelId = entry.target.getAttribute("data-model-id");

      if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
        currentActiveReelModelId = modelId;
        updateReelsStickyBottom(modelId);

        if (vid) {
          vid.muted = reelsAudioMuted;
          vid.play().catch(() => {});
        }
      } else {
        if (vid) {
          vid.pause();
        }
      }
    });
  }, {
    root: container,
    threshold: [0.55]
  });

  document.querySelectorAll(".reel-slide").forEach(slide => {
    reelsFeedObserver.observe(slide);
  });

  const targetId = startModelId || modelsWithVideos[0].id;
  currentActiveReelModelId = targetId;
  updateReelsStickyBottom(targetId);

  setTimeout(() => {
    const targetSlide = document.getElementById(`reelSlide_${targetId}`);
    if (targetSlide) {
      targetSlide.scrollIntoView({ behavior: "instant" });
      const vid = targetSlide.querySelector("video");
      if (vid) {
        vid.muted = reelsAudioMuted;
        vid.play().catch(() => {});
      }
    }
  }, 100);
}

function closeReelsFeed() {
  const overlay = document.getElementById("reelsFeedOverlay");
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";

  document.querySelectorAll(".reel-slide-video").forEach(v => {
    v.pause();
  });

  if (reelsFeedObserver) {
    reelsFeedObserver.disconnect();
    reelsFeedObserver = null;
  }
}

function updateReelsStickyBottom(modelId) {
  if (typeof CREATORS_CATALOG === "undefined") return;
  const model = CREATORS_CATALOG.find(m => m.id === modelId);
  if (!model) return;

  const avatar = document.getElementById("reelsStickyAvatar");
  const name = document.getElementById("reelsStickyName");
  const tag = document.getElementById("reelsStickyTag");

  if (avatar) avatar.src = model.avatar || model.cover || "assets/logo.jpg";
  if (name) name.textContent = model.creatorName;
  if (tag) {
    const numVids = model.previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;
    tag.textContent = `🎬 ${numVids} Vídeos em Alta Resolução + Fotos 4K`;
  }
}

function accessCurrentReelModel() {
  const modelId = currentActiveReelModelId;
  closeReelsFeed();
  if (modelId) {
    openModelDirectFromReel(modelId);
  }
}

function toggleReelsAudio() {
  reelsAudioMuted = !reelsAudioMuted;
  const icon = document.getElementById("reelsSoundIcon");
  if (icon) icon.textContent = reelsAudioMuted ? "🔇" : "🔊";

  document.querySelectorAll(".reel-slide-video").forEach(v => {
    v.muted = reelsAudioMuted;
  });

  showToast(reelsAudioMuted ? "🔇 Áudio desativado" : "🔊 Áudio ativado!");
}

function toggleReelSlidePlayback(videoEl) {
  if (!videoEl) return;
  if (videoEl.paused) {
    videoEl.play();
  } else {
    videoEl.pause();
  }
}

function toggleReelHeart(btnEl) {
  const heart = btnEl.querySelector(".reel-heart-icon");
  if (heart) {
    heart.style.transform = "scale(1.4)";
    setTimeout(() => {
      heart.style.transform = "scale(1)";
    }, 200);
  }
}

function openModelDirectFromReel(modelId) {
  openPreviewModal(modelId);
  setPreviewFilter("videos"); // vai direto na aba de vídeos da modelo!
}

function activateFromPixModal() {
  const code = pixInlineCode ? pixInlineCode.value : "";
  activateCode(code);
}

// Desativar VIP para testes de administrador
function deactivateVip() {
  localStorage.removeItem("clube_secreto_vip");
  checkVipStatus();
  renderCatalog();
  showToast("Sessão VIP encerrada.");
}

function copyPixKey() {
  const btn = document.querySelector(".btn-copy-pix");
  const originalHtml = btn ? btn.innerHTML : "";

  function notifyCopied() {
    showToast("✅ Chave PIX (09658990983) copiada! Abra o app do seu banco e cole para transferir.");
    if (btn) {
      btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
      btn.style.borderColor = "#34d399";
      btn.innerHTML = "<span>✅</span><span>CHAVE COPIADA COM SUCESSO!</span>";
      setTimeout(() => {
        btn.style.background = "";
        btn.style.borderColor = "";
        btn.innerHTML = originalHtml;
      }, 3000);
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(PIX_CPF).then(notifyCopied).catch(() => {
      fallbackCopy(notifyCopied);
    });
  } else {
    fallbackCopy(notifyCopied);
  }
}

function fallbackCopy(callback) {
  const input = document.createElement("input");
  input.value = PIX_CPF;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
  if (callback) callback();
}

function showToast(msg) {
  toastMsg.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

function scrollToCatalog() {
  document.getElementById("catalogSection").scrollIntoView({ behavior: "smooth" });
}
