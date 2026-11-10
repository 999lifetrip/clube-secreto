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
  try {
    document.cookie = "clube_device_id=" + encodeURIComponent(id) + "; path=/; max-age=31536000; SameSite=Lax";
  } catch(e) {}
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
  if (sessionStorage.getItem("cs_visitor_preview") === "1") return false;
  if (isAdminActive || isVipActive) return true;
  return unlockedModels.has(itemId);
}

// Alternar entre visão normal e simulação de visitante comum (para o Admin testar)
function toggleVisitorMode() {
  const isVisitor = sessionStorage.getItem("cs_visitor_preview") === "1";
  if (isVisitor) {
    sessionStorage.removeItem("cs_visitor_preview");
    showToast("👑 Modo Administrador restaurado! Visualizando tudo liberado.");
  } else {
    sessionStorage.setItem("cs_visitor_preview", "1");
    showToast("👁️ Modo Visitante Comum ativado! Visualizando o site 100% bloqueado.");
  }
  checkVipStatus();
  syncLiveCatalog();
}

// Verifica estado do VIP/Admin salvo localmente
function checkVipStatus() {
  const isVisitorTestMode = sessionStorage.getItem("cs_visitor_preview") === "1";
  if (isVisitorTestMode) {
    isVipActive = false;
    isAdminActive = false;
    unlockedModels.clear();
    updateVipUI();
    return;
  }

  try {
    const rawAdminKey = (sessionStorage.getItem("cs_admin_key") || "").trim().toUpperCase();
    const hasValidAdminKey = (rawAdminKey === "ADM-CLUBE-98319-LUAN-X99");
    if (hasValidAdminKey) {
      isAdminActive = true;
      isVipActive = true;
    }

    const raw = localStorage.getItem("clube_secreto_vip");
    if (!raw && !hasValidAdminKey) {
      isVipActive = false;
      isAdminActive = false;
      unlockedModels.clear();
      updateVipUI();
      return;
    }

    if (raw) {
      const vipData = JSON.parse(raw);
      const now = Date.now();

      const isLifetime = !!vipData.isLifetime || vipData.expiresAt === null;
      const isNotExpired = isLifetime || (vipData.expiresAt && vipData.expiresAt > now);

      if (vipData.active && isNotExpired) {
        isAdminActive = isAdminActive || !!vipData.isAdmin;
        isVipActive = isVipActive || !!vipData.isWeeklyVip || isAdminActive;
        vipDaysRemaining = vipData.expiresAt ? Math.max(1, Math.ceil((vipData.expiresAt - now) / (1000 * 60 * 60 * 24))) : 9999;
        unlockedModels = new Set(Array.isArray(vipData.unlockedModels) ? vipData.unlockedModels : []);
      } else if (!hasValidAdminKey) {
        isVipActive = false;
        isAdminActive = false;
        unlockedModels.clear();
        localStorage.removeItem("clube_secreto_vip");
      }
    }
  } catch (e) {
    if (!hasValidAdminKey) {
      isVipActive = false;
      isAdminActive = false;
      unlockedModels.clear();
    }
  }

  updateVipUI();
}

// Sincroniza com o servidor (O Servidor é a ÚNICA fonte de verdade anti-fraude)
async function syncStatusWithBackend() {
  try {
    const isVisitorTestMode = sessionStorage.getItem("cs_visitor_preview") === "1";
    if (isVisitorTestMode) {
      isVipActive = false;
      isAdminActive = false;
      unlockedModels.clear();
      updateVipUI();
      renderCatalog();
      return;
    }

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
      renderReelsCarousel();
    } else {
      // Se não tem compra ativa vinculada ao dispositivo no servidor:
      // Verifica se o usuário é o Admin com sessão ativa no painel
      const rawLocal = localStorage.getItem("clube_secreto_vip");
      let localIsAdmin = false;
      if (rawLocal) {
        try { localIsAdmin = !!JSON.parse(rawLocal).isAdmin; } catch(e){}
      }
      if (!localIsAdmin) {
        // Dispositivo comum não-pago: purga qualquer dado adulterado ou expirado
        isVipActive = false;
        isAdminActive = false;
        unlockedModels.clear();
        localStorage.removeItem("clube_secreto_vip");
        updateVipUI();
        renderCatalog();
        renderReelsCarousel();
      }
    }
  } catch (e) {
    // Modo offline silencioso
  }
}

function updateVipUI() {
  const isVisitorTestMode = sessionStorage.getItem("cs_visitor_preview") === "1";
  const hasAccess = !isVisitorTestMode && (isAdminActive || isVipActive || unlockedModels.size > 0);
  const btnHeaderVipIcon = document.getElementById("btnHeaderVipIcon");

  // Barra de Controle Rápido do Administrador (Para testar o site exatamente como visitante)
  let testBar = document.getElementById("adminTestBar");
  if (isVisitorTestMode) {
    if (!testBar) {
      testBar = document.createElement("div");
      testBar.id = "adminTestBar";
      testBar.style.cssText = "background: linear-gradient(90deg, #dc2626, #991b1b); color: #fff; padding: 10px 16px; font-size: 13px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10000; box-shadow: 0 2px 12px rgba(0,0,0,0.6);";
      document.body.prepend(testBar);
    }
    testBar.style.display = "flex";
    testBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🔒</span>
        <span><strong>MODO VISITANTE ATIVO (CONTEÚDO BLOQUEADO)</strong> — Teste como se não tivesse pago.</span>
      </div>
      <button onclick="toggleVisitorMode()" style="background: #fff; color: #dc2626; border: none; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 800; cursor: pointer; text-transform: uppercase;">
        👑 Voltar ao Modo Admin
      </button>
    `;
  } else if (isAdminActive) {
    if (!testBar) {
      testBar = document.createElement("div");
      testBar.id = "adminTestBar";
      testBar.style.cssText = "background: linear-gradient(90deg, #7c3aed, #4f46e5); color: #fff; padding: 8px 16px; font-size: 12px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.5);";
      document.body.prepend(testBar);
    }
    testBar.style.display = "flex";
    testBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 15px;">👑</span>
        <span><strong>Modo Admin Master Ativo</strong> (Você está vendo tudo liberado)</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="toggleVisitorMode()" style="background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.5); color: #fff; padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">
          👁️ Ver como Visitante Não-Pago
        </button>
        <a href="/admin" style="background: #fff; color: #4f46e5; padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; text-decoration: none;">
          Painel Master ↗
        </a>
      </div>
    `;
  } else if (testBar) {
    testBar.style.display = "none";
  }

  const btnHeroBuy = document.getElementById("btnHeroBuy");
  const heroTag = document.querySelector(".hero-tag");
  const heroSecBtn = document.querySelector(".hero-cta .btn-secondary-glass");

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
        if (btnHeaderVipText) btnHeaderVipText.textContent = "Pack Vitalício";
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
          vipActiveBannerText.innerHTML = `✨ <strong>Pack Individual Ativo</strong> (Acesso Vitalício ✅)`;
        }
      }
    }
    if (btnHeroBuy) {
      btnHeroBuy.innerHTML = `<span>🎬</span> VER VÍDEOS & REELS (VIP LIBERADO)`;
      btnHeroBuy.onclick = () => openReelsFeed();
      btnHeroBuy.style.background = "linear-gradient(135deg, #10b981, #059669)";
      btnHeroBuy.style.boxShadow = "0 0 20px rgba(16, 185, 129, 0.5)";
    }
    if (heroTag) {
      heroTag.innerHTML = `<span>👑</span> ACESSO VIP 100% LIBERADO`;
      heroTag.style.borderColor = "#10b981";
      heroTag.style.color = "#34d399";
    }
    if (heroSecBtn) {
      heroSecBtn.innerHTML = `<span>🔥</span> Ver Modelos Desbloqueadas`;
      heroSecBtn.onclick = () => {
        openPreviewModal("ensaio-vip-alinabelle");
        setPreviewFilter("videos");
      };
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
    if (btnHeroBuy) {
      btnHeroBuy.innerHTML = `<span>👑</span> ASSINAR PLANO SEMANAL (R$ 24,99)`;
      btnHeroBuy.onclick = () => openVipModal();
      btnHeroBuy.style.background = "";
      btnHeroBuy.style.boxShadow = "";
    }
    if (heroTag) {
      heroTag.innerHTML = `<span>🔒</span> PLANO SEMANAL VIP`;
      heroTag.style.borderColor = "";
      heroTag.style.color = "";
    }
    if (heroSecBtn) {
      heroSecBtn.innerHTML = `<span>🔑</span> Já Tenho Código de Acesso`;
      heroSecBtn.onclick = () => openCodeModal();
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
              <span class="price-label">${unlocked ? 'Status' : 'Pack Vitalício'}</span>
              <span class="price-val" style="color: ${unlocked ? '#10b981' : 'var(--text-primary)'};">${unlocked ? 'LIBERADO VITALÍCIO ✅' : `R$ ${item.individualPrice}`}</span>
            </div>
            <span style="font-size: 11px; color: ${unlocked ? '#10b981' : '#ff4d6d'}; font-weight: 700;">
              ${unlocked ? 'Acesso Permanente' : 'Semanal Total: R$ 24,99'}
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
              <button class="btn-buy" onclick="openPixModal('Pack ${item.creatorName} — ${item.title}', '${item.individualPrice}', 'Acesso Vitalício (${item.creatorName})')">
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

// Modal de Prévia Limpo e Direto (Sem poluição visual)
function openPreviewModal(itemId) {
  const item = CREATORS_CATALOG.find(i => i.id === itemId);
  if (!item) return;

  currentPreviewItem = item;

  const numVideos = item.previews.filter(p => (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4'))).length;
  const numPhotos = item.previews.length - numVideos;

  previewTitle.textContent = item.title;
  previewCreator.textContent = `${item.creatorName} (${item.username}) • ${numPhotos} Fotos 4K + ${numVideos} Vídeos 60fps`;

  renderPreviewContent(item);
  previewModal.classList.add("open");
}

function renderPreviewContent(item) {
  const unlocked = isModelUnlocked(item.id);

  // Vídeos e Fotos
  const allVids = item.previews.filter(p => (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4')));
  const allPics = item.previews.filter(p => !((typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4'))));

  // Prévias estritamente configuradas pelo Admin (isTeaser === true)
  const teaserVids = allVids.filter(v => typeof v === 'object' && v.isTeaser);
  const teaserPics = allPics.filter(p => typeof p === 'object' && p.isTeaser);

  // Se o ensaio está desbloqueado: exibe TODAS as fotos
  // Se o ensaio está bloqueado: exibe as fotos marcadas como prévia (mínimo 3)
  let displayPics = unlocked 
    ? allPics 
    : (teaserPics.length > 0 ? teaserPics : allPics.slice(0, 3));

  // Coleta fotos para o visualizador tela cheia (Lightbox)
  const availablePics = unlocked ? allPics : displayPics;
  const photoPreviews = availablePics.map((p, idx) => ({
    url: typeof p === 'object' ? p.url : p,
    originalIndex: idx
  }));

  currentLightboxPhotos = photoPreviews;
  currentLightboxItem = item;

  let html = '';
  const devId = getDeviceId();

  // 1. BANNER HERO MODO REELS (Atalho direto no topo para assistir todos os vídeos em tela cheia)
  if (allVids.length > 0) {
    html += `
      <div class="model-reels-hero-banner" onclick="openModelReels('${item.id}', 0)" title="Toque para abrir todos os vídeos no Modo Reels">
        <div class="hero-reels-left">
          <span class="hero-reels-badge">NOVO MODO REELS 📱</span>
          <h4 class="hero-reels-title">Assistir Todos os ${allVids.length} Vídeos em Tela Cheia</h4>
          <p class="hero-reels-sub">Feed vertical arrastando para cima estilo TikTok/Instagram • 60 FPS</p>
        </div>
        <button class="hero-reels-cta" onclick="event.stopPropagation(); openModelReels('${item.id}', 0);">
          <span class="reels-play-icon">▶</span>
          <span>Assistir Reels</span>
        </button>
      </div>
    `;
  }

  // 2. BLOCO DE AÇÃO DIRETO E LIMPO (Apenas no modo prévia bloqueado)
  if (!unlocked) {
    html += `
      <div class="modal-quick-actions">
        <button class="btn-quick-single" onclick="buyCurrentSingle()">
          <span class="quick-btn-icon">🔓</span>
          <div class="quick-btn-info">
            <span class="quick-btn-title">Comprar Só Esta Modelo (Acesso Vitalício)</span>
            <span class="quick-btn-sub">Apenas R$ ${item.individualPrice || '9,90'} no PIX • Acesso Vitalício sem expiração</span>
          </div>
        </button>

        <button class="btn-quick-weekly" onclick="buyWeeklyFromPreview()">
          <span class="quick-btn-icon">👑</span>
          <div class="quick-btn-info">
            <span class="quick-btn-title">Liberar Todas as ${CREATORS_CATALOG.length} Modelos</span>
            <span class="quick-btn-sub">Plano Semanal VIP R$ 24,99 (Acesso a Tudo)</span>
          </div>
        </button>

        <button class="btn-quick-code" onclick="openCodeModal()">
          <span>🔑 Já realizou o pagamento? Toque aqui para digitar o código</span>
        </button>
      </div>
    `;
  }

  // 3. FOTOS PRIMEIRO! (ENSAIO FOTOGRÁFICO EM DESTAQUE NO TOPO DA PÁGINA)
  if (allPics.length > 0) {
    html += `
      <div class="gallery-section-title">
        <div>
          <span class="section-title-main">📸 Fotos do Ensaio (${allPics.length} Fotos)</span>
          <span class="section-title-sub"> • Toque em qualquer foto para ver em alta definição</span>
        </div>
        <button class="btn-sm-reels" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 11px; padding: 4px 10px; border-radius: 6px; cursor: pointer;" onclick="openLightbox(0)">
          🔍 Tela Cheia
        </button>
      </div>
    `;

    // Fotos de Prévia (ou todas se desbloqueado)
    displayPics.forEach((p) => {
      const rawUrl = typeof p === 'object' ? p.url : p;
      const url = devId ? (rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'dev=' + encodeURIComponent(devId)) : rawUrl;
      const photoIdx = photoPreviews.findIndex(pi => pi.url === rawUrl);
      html += `
        <div class="preview-item" onclick="openLightbox(${photoIdx >= 0 ? photoIdx : 0})" title="Toque para ampliar">
          <img src="${url}" class="preview-img" alt="Foto do Ensaio" loading="lazy" />
          ${!unlocked ? `<div class="watermark-overlay">CLUBE SECRETO</div>` : ''}
        </div>
      `;
    });

    // Se bloqueado: Fotos VIP restantes com blur e selo
    if (!unlocked) {
      const lockedPics = allPics.filter(p => !displayPics.some(dp => (typeof dp === 'object' ? dp.url : dp) === (typeof p === 'object' ? p.url : p)));
      lockedPics.forEach((p, pIdx) => {
        const pUrl = typeof p === 'object' ? p.url : p;
        const thumbUrl = pUrl.replace('.jpg', '_thumb.jpg');
        html += `
          <div class="preview-item preview-item-locked" onclick="openCodeModal()" title="Foto VIP Exclusiva • Toque para liberar">
            <img src="${thumbUrl}" class="media-blurred" alt="Foto VIP" loading="lazy" onerror="this.src='${pUrl}'" />
            <div class="locked-blur-overlay">
              <div class="locked-blur-pill">
                <span class="lock-icon">🔒</span>
                <span class="lock-text">FOTO VIP ${pIdx + displayPics.length + 1}</span>
              </div>
            </div>
          </div>
        `;
      });
    }
  }

  // 4. VÍDEOS & CENAS (CARDS INTERATIVOS QUE ABREM DIRETO NO MODO REELS)
  if (allVids.length > 0) {
    html += `
      <div class="gallery-section-title">
        <div>
          <span class="section-title-main">🎬 Vídeos & Cenas (${allVids.length} Vídeos)</span>
          <span class="section-title-sub"> • Toque para assistir no Modo Reels arrastando pra cima</span>
        </div>
        <button class="hero-reels-cta" style="padding: 6px 14px; font-size: 11px;" onclick="openModelReels('${item.id}', 0)">
          ▶ Abrir Reels
        </button>
      </div>
    `;

    allVids.forEach((v, vIdx) => {
      const isTeaser = typeof v === 'object' ? !!v.isTeaser : false;
      const vUrl = typeof v === 'object' ? v.url : v;
      const thumbUrl = vUrl.replace(/\.(mp4|webm|mov)$/i, '_thumb.jpg');

      if (unlocked || isTeaser) {
        html += `
          <div class="preview-item preview-video-tile" onclick="openModelReels('${item.id}', ${vIdx})" title="Toque para assistir este vídeo no Modo Reels">
            <img src="${thumbUrl}" class="video-tile-thumb" alt="Vídeo ${vIdx + 1}" loading="lazy" onerror="this.src='${item.cover}'" />
            <div class="video-tile-overlay">
              <div class="video-tile-play-btn">▶</div>
              <div class="video-tile-badges">
                <span class="video-tile-num">🎬 Vídeo ${vIdx + 1}</span>
                <span class="video-tile-quality">${unlocked ? '🔓 HD 60FPS' : '🔒 PRÉVIA'}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="preview-item preview-item-locked" onclick="openCodeModal()" title="Vídeo VIP Exclusivo • Toque para liberar">
            <img src="${thumbUrl}" class="media-blurred" alt="Vídeo VIP" loading="lazy" onerror="this.src='${item.cover}'" />
            <div class="locked-blur-overlay">
              <div class="locked-blur-pill">
                <span class="lock-icon">▶ 🔒</span>
                <span class="lock-text">VÍDEO VIP ${vIdx + 1}</span>
              </div>
            </div>
          </div>
        `;
      }
    });
  }

  // 5. BARRA FLUTUANTE DE DESBLOQUEIO VIP (Se bloqueado)
  if (!unlocked) {
    const lockedVidsCount = allVids.filter(v => !(typeof v === 'object' && v.isTeaser)).length;
    const lockedPicsCount = allPics.filter(p => !(typeof p === 'object' && p.isTeaser)).length;

    html += `
      <div class="vip-floating-unlock-bar" onclick="openCodeModal()" title="Toque para desbloquear">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; width: 100%;">
          <div style="text-align: left;">
            <div style="font-weight: 900; font-size: 15px; color: #fff; letter-spacing: 0.3px;">👑 DESBLOQUEAR TODO O CONTEÚDO VIP</div>
            <div style="font-size: 12px; color: #fda4af; margin-top: 3px;">+${lockedPicsCount} Fotos 4K & +${lockedVidsCount} Vídeos 60FPS liberados sem censura</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn-primary" style="padding: 10px 18px; font-size: 12px; font-weight: 800;" onclick="event.stopPropagation(); buyCurrentSingle();">
              🔓 Liberar Só Esta Modelo (R$ ${item.individualPrice || '9,90'})
            </button>
            <button class="btn-secondary" style="padding: 10px 18px; font-size: 12px; font-weight: 800; border-color: rgba(225,29,72,0.6);" onclick="event.stopPropagation(); openCodeModal();">
              🔑 Digitar Código
            </button>
          </div>
        </div>
      </div>
    `;
  }

  previewGrid.innerHTML = html;

  // Rodapé do Modal (limpo, sem botões duplicados que poluem a tela)
  if (unlocked) {
    previewModalFooter.style.display = 'block';
    previewModalFooter.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 10px;">
        <div>
          <span style="font-size: 11px; color: #10b981; text-transform: uppercase; font-weight: 800;">Status do Acesso:</span>
          <span style="font-size: 15px; font-weight: 900; color: #10b981; display: block;">🔓 ${isAdminActive ? 'ACESSO MASTER ADMINISTRADOR' : (isVipActive ? 'VIP TOTAL LIBERADO (TODAS)' : 'PACK DESTA MODELO LIBERADO (ACESSO VITALÍCIO)')}</span>
        </div>
        <button class="btn-buy" style="background: linear-gradient(135deg, #059669, #047857); padding: 10px 16px;" onclick="openModelReels('${item.id}', 0)">
          <span>🎬 Assistir Vídeos no Modo Reels</span>
        </button>
      </div>
    `;
  } else {
    previewModalFooter.style.display = 'none';
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
    `Acesso Vitalício (${currentPreviewItem.creatorName})`
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
  const durationText = isWeekly ? "7 Dias de Acesso Total" : "Acesso Vitalício (Sem Expiração)";
  if (pixItemDuration) pixItemDuration.textContent = durationText;

  const actionText = isWeekly ? "PASSE VIP TOTAL (7 DIAS)" : "PACK INDIVIDUAL VITALÍCIO (R$ 9,90)";

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
  const modal = document.getElementById("codeModal") || codeModal;
  const input = document.getElementById("vipCodeInput") || vipCodeInput;
  if (modal) {
    if (input) input.value = "";
    modal.classList.add("open");
    modal.style.display = "flex";
    modal.style.zIndex = "99999";
    setTimeout(() => {
      if (input) input.focus();
    }, 150);
  }
}

function closeCodeModal() {
  const modal = document.getElementById("codeModal") || codeModal;
  if (modal) {
    modal.classList.remove("open");
    modal.style.display = "";
  }
}

window.openCodeModal = openCodeModal;
window.closeCodeModal = closeCodeModal;

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
      setPreviewFilter("videos");
    } else if (data.modelId) {
      openPreviewModal(data.modelId);
      setPreviewFilter("videos");
    } else if (data.isWeeklyVip || data.allModels) {
      // VIP Semanal ativado: abre imediatamente a primeira modelo (Alina Belle) com a aba de vídeos aberta!
      openPreviewModal("ensaio-vip-alinabelle");
      setPreviewFilter("videos");
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
window.submitVipCode = submitVipCode;

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
    // Busca prioritária do vídeo do Reels:
    // 1. model.reelsVideo (definido pelo admin)
    // 2. Primeiro vídeo marcado como prévia pública (isTeaser === true)
    let videoUrl = null;
    if (model.reelsVideo) {
      videoUrl = model.reelsVideo;
    } else {
      const teaserVid = model.previews.find(p => (typeof p === 'object' && p.type === 'video' && p.isTeaser) || (typeof p === 'object' && p.isTeaser && p.url && p.url.endsWith('.mp4')));
      if (teaserVid) {
        videoUrl = typeof teaserVid === 'object' ? teaserVid.url : teaserVid;
      }
    }
    const coverUrl = model.cover || model.avatar || "assets/logo.jpg";
    const numVideos = model.previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;

    return `
      <div class="reel-card" onclick="openReelsFeed('${model.id}')" title="Assistir Reels de ${model.creatorName}">
        <div class="reel-card-inner">
          ${videoUrl ? `
            <video class="reel-video" src="${videoUrl}" poster="${coverUrl}" preload="none" muted loop playsinline onmouseenter="this.play()" onmouseleave="this.pause()"></video>
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

let currentReelsMode = 'global'; // 'global' ou 'model'
let currentActiveVideoIndex = 0;

function openModelReels(modelId, startVideoIndex = 0) {
  if (typeof CREATORS_CATALOG === "undefined") return;
  const model = CREATORS_CATALOG.find(m => m.id === modelId);
  if (!model) return;

  const overlay = document.getElementById("reelsFeedOverlay");
  const container = document.getElementById("reelsFeedContainer");
  if (!overlay || !container) return;

  const unlocked = isModelUnlocked(model.id);
  const devId = getDeviceId();

  const allVids = model.previews.filter(p => (typeof p === 'object' && p.type === 'video') || (typeof p === 'string' && p.endsWith('.mp4')));
  if (allVids.length === 0) {
    showToast("Nenhum vídeo disponível para esta modelo.");
    return;
  }

  currentReelsMode = 'model';
  currentActiveReelModelId = model.id;
  currentActiveVideoIndex = startVideoIndex;

  const coverUrl = model.cover || model.avatar || "assets/logo.jpg";

  container.innerHTML = allVids.map((v, idx) => {
    const isTeaser = typeof v === 'object' ? !!v.isTeaser : false;
    const isAvailable = unlocked || isTeaser;
    const rawUrl = typeof v === 'object' ? v.url : v;
    const thumbUrl = rawUrl.replace(/\.(mp4|webm|mov)$/i, '_thumb.jpg');
    const vidUrl = isAvailable
      ? (devId ? (rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'dev=' + encodeURIComponent(devId)) : rawUrl)
      : '';
    const likes = (14.2 + (idx * 2.1)).toFixed(1);

    if (isAvailable) {
      return `
        <div class="reel-slide" data-model-id="${model.id}" data-video-idx="${idx}" id="modelReelSlide_${idx}">
          <div class="reel-slide-backdrop" style="background-image: url('${thumbUrl}');"></div>
          <img class="reel-slide-poster" src="${thumbUrl}" alt="${model.creatorName}" loading="eager" onerror="this.src='${coverUrl}'" />

          <video class="reel-slide-video" data-src="${vidUrl}" poster="${thumbUrl}" playsinline webkit-playsinline="true" x5-playsinline="true" loop muted preload="none" onclick="toggleReelSlidePlayback(this)"></video>

          <div class="reel-play-center-btn" onclick="toggleReelSlidePlayback(this.parentElement.querySelector('video'))">
            <span class="reel-play-triangle">▶</span>
            <span class="reel-play-text">Toque para Assistir</span>
          </div>

          <div class="reel-sidebar-actions">
            <div class="reel-action-btn reel-sidebar-avatar-box" onclick="closeReelsFeed()" title="Ver Galeria de Fotos">
              <img src="${model.avatar || coverUrl}" class="reel-sidebar-avatar" onerror="this.src='assets/logo.jpg'" />
              <span class="reel-sidebar-badge">✓</span>
            </div>
            <div class="reel-action-btn" onclick="toggleReelHeart(this)">
              <span class="reel-heart-icon">❤️</span>
              <span class="reel-action-count">${likes}k</span>
            </div>
            <div class="reel-action-btn" onclick="closeReelsFeed()" title="Ver Fotos">
              <span class="reel-action-icon">📸</span>
              <span class="reel-action-count">Fotos</span>
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="reel-slide" data-model-id="${model.id}" data-video-idx="${idx}" id="modelReelSlide_${idx}">
          <div class="reel-slide-backdrop" style="background-image: url('${thumbUrl}');"></div>
          <img class="reel-slide-poster media-blurred" src="${thumbUrl}" alt="${model.creatorName}" loading="eager" onerror="this.src='${coverUrl}'" />

          <div class="locked-glass-content" style="position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 20px; text-align: center; background: rgba(8,10,16,0.75); backdrop-filter: blur(8px);">
            <div class="locked-icon-wrapper" style="width: 58px; height: 58px; border-radius: 50%; background: rgba(225,29,72,0.3); border: 2px solid rgba(225,29,72,0.6); display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 12px;">🔒</div>
            <h3 style="color: #fff; font-size: 18px; font-weight: 900; margin-bottom: 6px;">Vídeo Exclusivo VIP • ${idx + 1} de ${allVids.length}</h3>
            <p style="color: #cbd5e1; font-size: 13px; max-width: 320px; margin-bottom: 16px;">Este vídeo em 4K 60FPS faz parte do ensaio fechado de ${model.creatorName}.</p>
            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 280px;">
              <button class="btn-primary" style="padding: 12px 20px; font-size: 13px; font-weight: 800;" onclick="event.stopPropagation(); closeReelsFeed(); buyCurrentSingle();">
                🔓 Liberar Só Esta Modelo (R$ ${model.individualPrice || '9,90'})
              </button>
              <button class="btn-secondary" style="padding: 10px 20px; font-size: 12px; font-weight: 800;" onclick="event.stopPropagation(); closeReelsFeed(); openCodeModal();">
                🔑 Já Tenho Código VIP
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }).join("");

  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";

  updateReelsStickyBottom(model.id, startVideoIndex, allVids.length, unlocked);

  // IntersectionObserver para detectar qual slide está ativo ao rolar com CSS scroll-snap
  if (reelsFeedObserver) reelsFeedObserver.disconnect();
  reelsFeedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
        const slide = entry.target;
        const vIdx = parseInt(slide.getAttribute("data-video-idx") || "0", 10);
        currentActiveVideoIndex = vIdx;
        updateReelsStickyBottom(model.id, vIdx, allVids.length, unlocked);
        playReelSlide(slide, model.id);
      }
    });
  }, {
    root: container,
    threshold: [0.45]
  });

  document.querySelectorAll(".reel-slide").forEach(slide => {
    reelsFeedObserver.observe(slide);
  });

  const targetIdx = Math.max(0, Math.min(startVideoIndex, allVids.length - 1));
  const targetSlide = document.getElementById(`modelReelSlide_${targetIdx}`) || document.querySelector(".reel-slide");
  if (targetSlide) {
    targetSlide.scrollIntoView({ behavior: "instant" });
    playReelSlide(targetSlide, model.id);
  }
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

  currentReelsMode = 'global';

  container.innerHTML = modelsWithVideos.map((model, idx) => {
    let vidUrl = model.reelsVideo;
    if (!vidUrl) {
      const teaserVid = model.previews.find(p => (typeof p === 'object' && p.type === 'video' && p.isTeaser) || (typeof p === 'object' && p.isTeaser && p.url && p.url.endsWith('.mp4')));
      if (teaserVid) {
        vidUrl = typeof teaserVid === 'object' ? teaserVid.url : teaserVid;
      }
    }
    const coverUrl = model.cover || model.avatar || "assets/logo.jpg";
    const numVideos = model.previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;
    const likes = (14.2 + (idx * 2.8)).toFixed(1);

    return `
      <div class="reel-slide" data-model-id="${model.id}" id="reelSlide_${model.id}">
        <!-- Imagem de Capa HD NUNCA SOME: sempre presente no fundo e no centro -->
        <div class="reel-slide-backdrop" style="background-image: url('${coverUrl}');"></div>
        <img class="reel-slide-poster" src="${coverUrl}" alt="${model.creatorName}" loading="eager" />

        <!-- Vídeo otimizado com lazy-loading e suporte universal a mobile -->
        <video class="reel-slide-video" data-src="${vidUrl}" playsinline webkit-playsinline="true" x5-playsinline="true" loop muted preload="none" onclick="toggleReelSlidePlayback(this)"></video>

        <!-- Botão Play Central (aparece se pausado ou se precisar de interação de toque) -->
        <div class="reel-play-center-btn" onclick="toggleReelSlidePlayback(this.parentElement.querySelector('video'))">
          <span class="reel-play-triangle">▶</span>
          <span class="reel-play-text">Toque para Assistir</span>
        </div>

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

  // Teclado (setas para cima e para baixo no computador)
  window.onkeydown = (e) => {
    if (overlay.style.display !== "flex") return;
    if (e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      goToNextReel();
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      goToPrevReel();
    } else if (e.key === "Escape") {
      closeReelsFeed();
    }
  };

  // IntersectionObserver para detectar qual slide está ativo ao rolar com CSS scroll-snap
  if (reelsFeedObserver) reelsFeedObserver.disconnect();
  reelsFeedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
        const slide = entry.target;
        const modelId = slide.getAttribute("data-model-id");
        if (modelId !== currentActiveReelModelId) {
          playReelSlide(slide, modelId);
        }
      }
    });
  }, {
    root: container,
    threshold: [0.45]
  });

  document.querySelectorAll(".reel-slide").forEach(slide => {
    reelsFeedObserver.observe(slide);
  });

  const targetId = startModelId || modelsWithVideos[0].id;
  currentActiveReelModelId = targetId;
  window.currentActiveReelModelId = targetId;
  updateReelsStickyBottom(targetId);

  // Ativa o slide inicial
  const targetSlide = document.getElementById(`reelSlide_${targetId}`) || document.querySelector(".reel-slide");
  if (targetSlide) {
    targetSlide.scrollIntoView({ behavior: "instant" });
    playReelSlide(targetSlide, targetId);
  }
}

function playReelSlide(slide, modelId) {
  if (!slide) return;
  currentActiveReelModelId = modelId;
  window.currentActiveReelModelId = modelId;

  const slides = [...document.querySelectorAll(".reel-slide")];
  const activeIdx = slides.indexOf(slide);

  // Pausa vídeos de outros slides preservando o buffer
  slides.forEach((s) => {
    const vid = s.querySelector("video");
    const playBtn = s.querySelector(".reel-play-center-btn");
    if (s !== slide) {
      if (vid && !vid.paused) {
        try { vid.pause(); } catch(e) {}
      }
      s.classList.remove("video-playing");
      if (playBtn) playBtn.style.display = "none";
    }
  });

  const vid = slide.querySelector("video");
  const playBtn = slide.querySelector(".reel-play-center-btn");

  if (vid) {
    if (!vid.src && vid.dataset.src) {
      vid.src = vid.dataset.src;
    }

    vid.muted = reelsAudioMuted;
    vid.defaultMuted = reelsAudioMuted;

    // Transição suave: o poster só desaparece quando frames reais do vídeo começam a ser renderizados
    vid.ontimeupdate = () => {
      if (vid.currentTime > 0.05) {
        slide.classList.add("video-playing");
        if (playBtn) playBtn.style.display = "none";
      }
    };

    vid.onplaying = () => {
      if (vid.currentTime > 0.05) {
        slide.classList.add("video-playing");
      }
      if (playBtn) playBtn.style.display = "none";
    };

    vid.onpause = () => {
      if (currentActiveReelModelId === modelId && vid.currentTime > 0) {
        if (playBtn) playBtn.style.display = "flex";
      }
    };

    vid.onerror = () => {
      slide.classList.remove("video-playing");
      if (playBtn) playBtn.style.display = "none";
    };

    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Reproduzindo com sucesso
        })
        .catch(() => {
          slide.classList.remove("video-playing");
          if (playBtn) playBtn.style.display = "flex";
        });
    }
  }

  // Pre-carrega o próximo vídeo
  if (activeIdx + 1 < slides.length) {
    const nextVid = slides[activeIdx + 1].querySelector("video");
    if (nextVid && !nextVid.src && nextVid.dataset.src) {
      nextVid.src = nextVid.dataset.src;
      nextVid.preload = "metadata";
    }
  }
}

function goToNextReel() {
  const slides = [...document.querySelectorAll(".reel-slide")];
  if (slides.length === 0) return;
  const currentIdx = slides.findIndex(s => s.getAttribute("data-model-id") === currentActiveReelModelId && (currentReelsMode !== 'model' || parseInt(s.getAttribute("data-video-idx") || "0", 10) === currentActiveVideoIndex));
  const nextIdx = (currentIdx + 1) % slides.length;
  scrollToReelIndex(nextIdx);
}

function goToPrevReel() {
  const slides = [...document.querySelectorAll(".reel-slide")];
  if (slides.length === 0) return;
  const currentIdx = slides.findIndex(s => s.getAttribute("data-model-id") === currentActiveReelModelId && (currentReelsMode !== 'model' || parseInt(s.getAttribute("data-video-idx") || "0", 10) === currentActiveVideoIndex));
  const prevIdx = (currentIdx - 1 + slides.length) % slides.length;
  scrollToReelIndex(prevIdx);
}

function scrollToReelIndex(idx) {
  const slides = [...document.querySelectorAll(".reel-slide")];
  if (!slides[idx]) return;
  slides[idx].scrollIntoView({ behavior: "smooth" });
  const modelId = slides[idx].getAttribute("data-model-id");
  playReelSlide(slides[idx], modelId);
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

function updateReelsStickyBottom(modelId, videoIdx, totalVideos, isUnlocked) {
  if (typeof CREATORS_CATALOG === "undefined") return;
  const model = CREATORS_CATALOG.find(m => m.id === modelId);
  if (!model) return;

  const avatar = document.getElementById("reelsStickyAvatar");
  const name = document.getElementById("reelsStickyName");
  const tag = document.getElementById("reelsStickyTag");
  const btn = document.getElementById("btnReelsAccess");

  if (avatar) avatar.src = model.avatar || model.cover || "assets/logo.jpg";
  if (name) name.textContent = model.creatorName;
  if (tag) {
    if (videoIdx !== undefined && totalVideos) {
      tag.textContent = `🎬 Vídeo ${videoIdx + 1} de ${totalVideos} • Alta Definição 60FPS`;
    } else {
      const numVids = model.previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;
      tag.textContent = `🎬 ${numVids} Vídeos em Alta Resolução + Fotos 4K`;
    }
  }

  const unlocked = isUnlocked !== undefined ? isUnlocked : isModelUnlocked(model.id);
  if (btn) {
    if (unlocked) {
      btn.innerHTML = `
        <span class="reels-btn-text">👑 ACESSO VIP LIBERADO</span>
        <span class="reels-btn-sub">Você tem acesso vitalício a todos os vídeos e fotos</span>
      `;
      btn.style.background = "linear-gradient(135deg, #059669, #047857)";
      btn.onclick = () => closeReelsFeed();
    } else {
      btn.innerHTML = `
        <span class="reels-btn-glow"></span>
        <span class="reels-btn-text">🔓 ACESSAR CONTEÚDO COMPLETO</span>
        <span class="reels-btn-sub">Pack Individual Vitalício R$ ${model.individualPrice || '9,90'} ou Plano VIP Semanal</span>
      `;
      btn.style.background = "linear-gradient(135deg, #e11d48, #be123c)";
      btn.onclick = () => accessCurrentReelModel();
    }
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
    v.defaultMuted = reelsAudioMuted;
  });

  showToast(reelsAudioMuted ? "🔇 Áudio desativado" : "🔊 Áudio ativado!");
}

function toggleReelSlidePlayback(videoEl) {
  if (!videoEl) return;
  const slide = videoEl.closest(".reel-slide");
  const playBtn = slide ? slide.querySelector(".reel-play-center-btn") : null;

  if (videoEl.paused) {
    if (!videoEl.src && videoEl.dataset.src) {
      videoEl.src = videoEl.dataset.src;
    }
    videoEl.play().then(() => {
      if (slide) slide.classList.add("video-playing");
      if (playBtn) playBtn.style.display = "none";
    }).catch(() => {});
  } else {
    videoEl.pause();
    if (playBtn) playBtn.style.display = "flex";
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

// ═════════════════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO EM TEMPO REAL DO CATÁLOGO COM O SERVIDOR (SEM CACHE)
// Garante que qualquer alteração feita no painel admin apareça no site na hora!
// ═════════════════════════════════════════════════════════════════════════
async function syncLiveCatalog() {
  try {
    const isVisitorTestMode = sessionStorage.getItem("cs_visitor_preview") === "1";
    const devId = isVisitorTestMode ? '' : getDeviceId();
    const adminKey = isVisitorTestMode ? '' : (sessionStorage.getItem("cs_admin_key") || '');

    let url = '/api/catalog?t=' + Date.now();
    if (devId) url += '&deviceId=' + encodeURIComponent(devId);
    if (adminKey) url += '&key=' + encodeURIComponent(adminKey);

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        ...(devId ? { 'x-device-id': devId } : {}),
        ...(adminKey ? { 'x-admin-key': adminKey } : {})
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        window.CREATORS_CATALOG = data;
        renderCatalog();
        renderReelsCarousel();
      }
    }
  } catch (err) {
    console.warn('Fallback catálogo estático:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', syncLiveCatalog);
} else {
  syncLiveCatalog();
}

