// ═════════════════════════════════════════════════════════════════════════
// APP.JS — LÓGICA DE INTERFACE, PIX + WHATSAPP PRÁTICO, PÁGINA LIBERADA & REELS
// ═════════════════════════════════════════════════════════════════════════

const INITIAL_SETTINGS = (typeof window !== "undefined" && window.__CS_SETTINGS__) || {};

let SITE_SETTINGS = {
  vipPrice: INITIAL_SETTINGS.vipPrice || "15,00",
  vipOldPrice: INITIAL_SETTINGS.vipOldPrice !== undefined ? INITIAL_SETTINGS.vipOldPrice : "29,90",
  vipPlanTitle: INITIAL_SETTINGS.vipPlanTitle || "ACESSO VIP COMPLETO",
  vipPlanSubtitle: INITIAL_SETTINGS.vipPlanSubtitle || "Todas as modelos, fotos 4K e vídeos 60fps sem censura",
  pixKey: INITIAL_SETTINGS.pixKey || "09658990983",
  pixHolder: INITIAL_SETTINGS.pixHolder || "Luan Batista",
  whatsappNumber: INITIAL_SETTINGS.whatsappNumber || "554195993007",
  whatsappMessage: INITIAL_SETTINGS.whatsappMessage || "Olá! Quero liberar meu Acesso VIP no Clube Secreto (R$ {PRICE})! Chave PIX {PIX}. Segue meu comprovante:"
};

const IS_UNLOCKED_ROUTE = (typeof window !== "undefined" && window.__CS_PAGE_MODE__ === "unlocked");
const VIP_ROUTE_TOKEN = (typeof window !== "undefined" && window.__CS_VIP_TOKEN__) || "";

function getCatalog() {
  if (typeof window !== "undefined" && Array.isArray(window.CREATORS_CATALOG)) {
    return window.CREATORS_CATALOG;
  }
  if (typeof CREATORS_CATALOG !== "undefined" && Array.isArray(CREATORS_CATALOG)) {
    return CREATORS_CATALOG;
  }
  return [];
}

function appendMediaAuth(url) {
  if (!url) return "";
  let out = url;
  const devId = getDeviceId();
  if (devId && out.startsWith("/media/") && !out.includes("dev=")) {
    out += (out.includes("?") ? "&" : "?") + "dev=" + encodeURIComponent(devId);
  }
  if (IS_UNLOCKED_ROUTE && VIP_ROUTE_TOKEN && out.startsWith("/media/") && !out.includes("vip=")) {
    out += (out.includes("?") ? "&" : "?") + "vip=" + encodeURIComponent(VIP_ROUTE_TOKEN);
  }
  return out;
}

function formatWhatsappLink(customMessage) {
  const num = (SITE_SETTINGS.whatsappNumber || "554195993007").replace(/\D/g, "") || "554195993007";
  let text = customMessage || SITE_SETTINGS.whatsappMessage || "Olá! Quero liberar meu Acesso VIP no Clube Secreto por R$ {PRICE}!";
  text = text
    .replace(/\{PRICE\}/g, SITE_SETTINGS.vipPrice || "15,00")
    .replace(/\{PIX\}/g, SITE_SETTINGS.pixKey || "09658990983");
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

// Gera ou recupera identificador único e persistente do dispositivo
function getDeviceId() {
  let id = localStorage.getItem("clube_secreto_device_id");
  if (!id) {
    id = "cs_dev_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now().toString(36);
    localStorage.setItem("clube_secreto_device_id", id);
  }
  try {
    document.cookie = "clube_device_id=" + encodeURIComponent(id) + "; path=/; max-age=31536000; SameSite=Lax";
  } catch (e) {}
  return id;
}

let currentCategory = "all";
let currentSearch = "";
let isVipActive = false;       // true na rota VIP Tudo Liberado, Admin, ou código VIP legado
let isAdminActive = false;     // true se Admin Master ativo
let unlockedModels = new Set();
let vipDaysRemaining = 9999;
let currentPreviewItem = null;

// Estado do Lightbox
let currentLightboxPhotos = [];
let currentLightboxIndex = 0;
let currentLightboxItem = null;

// Elementos DOM
const cardsGrid = document.getElementById("cardsGrid");
const resultsCount = document.getElementById("resultsCount");
const searchInput = document.getElementById("searchInput");
const categoryPills = document.querySelectorAll(".cat-pill");

const btnHeaderVip = document.getElementById("btnHeaderVip");
const btnHeaderVipText = document.getElementById("btnHeaderVipText");
const vipActiveBanner = document.getElementById("vipActiveBanner");
const vipActiveBannerText = document.getElementById("vipActiveBannerText");

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
  getDeviceId();
  checkVipStatus();
  applySettingsToDOM();
  renderReelsCarousel();
  renderCatalog();
  setupEventListeners();
  syncLiveSettings();
  syncStatusWithBackend();
  syncLiveCatalog();

  const urlParams = new URLSearchParams(window.location.search);
  const autoCode = urlParams.get("codigo") || urlParams.get("c") || urlParams.get("code");
  const autoModel = urlParams.get("modelo") || urlParams.get("m");

  if (autoModel) {
    const cat = getCatalog();
    const targetModel = cat.find(m =>
      m.id === autoModel ||
      m.id.replace("ensaio-vip-", "") === autoModel.toLowerCase() ||
      m.creatorName.toLowerCase().includes(autoModel.toLowerCase())
    );
    if (targetModel) {
      openPreviewModal(targetModel.id);
    }
  }

  if (autoCode) {
    setTimeout(async () => {
      await activateCode(autoCode.trim());
    }, 450);
  }
});

async function syncLiveSettings() {
  try {
    const res = await fetch("/api/settings?t=" + Date.now(), { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.settings) {
        SITE_SETTINGS = { ...SITE_SETTINGS, ...data.settings };
        applySettingsToDOM();
        renderCatalog();
        updateVipUI();
      }
    }
  } catch (e) {}
}

function applySettingsToDOM() {
  const price = SITE_SETTINGS.vipPrice || "15,00";
  const oldPrice = (SITE_SETTINGS.vipOldPrice || "").trim();
  const pixKey = SITE_SETTINGS.pixKey || "09658990983";
  const pixHolder = SITE_SETTINGS.pixHolder || "Luan Batista";
  const planTitle = SITE_SETTINGS.vipPlanTitle || "ACESSO VIP COMPLETO";

  const heroOldPriceEl = document.getElementById("heroOldPrice");
  const heroVipPriceEl = document.getElementById("heroVipPrice");
  const heroPixKeyEl = document.getElementById("heroPixKeyText");
  const heroPixHolderEl = document.getElementById("heroPixHolderText");
  const btnHeroWpp = document.getElementById("btnHeroWhatsapp");
  const btnHeroWppText = document.getElementById("btnHeroWhatsappText");
  const btnHeaderWpp = document.getElementById("btnHeaderWhatsapp");
  const floatingWpp = document.getElementById("floatingWhatsappBtn");
  const lightboxWpp = document.getElementById("lightboxWhatsappBtn");
  const lightboxPriceEl = document.getElementById("lightboxPriceHighlight");
  const lightboxPixBtnText = document.getElementById("lightboxPixBtnText");
  const pixModalKeyEl = document.getElementById("pixModalKeyDisplay");
  const pixHolderEl = document.getElementById("pixHolderDisplay");
  const pixStepPriceEl = document.getElementById("pixStepPrice");
  const pixStepHolderEl = document.getElementById("pixStepHolder");

  if (heroOldPriceEl) {
    if (oldPrice) {
      heroOldPriceEl.textContent = `de R$ ${oldPrice}`;
      heroOldPriceEl.style.display = "inline-block";
    } else {
      heroOldPriceEl.style.display = "none";
    }
  }
  if (heroVipPriceEl) heroVipPriceEl.textContent = `POR APENAS R$ ${price}`;
  if (heroPixKeyEl) heroPixKeyEl.textContent = pixKey;
  if (heroPixHolderEl) heroPixHolderEl.textContent = `(${pixHolder})`;

  const defaultWppHref = formatWhatsappLink();
  if (btnHeroWpp) btnHeroWpp.href = defaultWppHref;
  if (btnHeroWppText) btnHeroWppText.textContent = `CHAMAR NO WHATSAPP / LIBERAR VIP (R$ ${price})`;
  if (btnHeaderWpp) btnHeaderWpp.href = defaultWppHref;
  if (floatingWpp) floatingWpp.href = defaultWppHref;
  if (lightboxWpp) lightboxWpp.href = defaultWppHref;
  if (lightboxPriceEl) lightboxPriceEl.textContent = `R$ ${price}`;
  if (lightboxPixBtnText) lightboxPixBtnText.textContent = `💠 VER CHAVE PIX (${pixKey}) — R$ ${price}`;

  if (pixModalKeyEl) pixModalKeyEl.textContent = pixKey;
  if (pixHolderEl) pixHolderEl.textContent = pixHolder;
  if (pixStepPriceEl) pixStepPriceEl.textContent = `R$ ${price}`;
  if (pixStepHolderEl) pixStepHolderEl.textContent = pixHolder;
  if (pixItemName && (!pixModal || !pixModal.classList.contains("open"))) {
    pixItemName.textContent = planTitle;
  }
  if (pixItemValue && (!pixModal || !pixModal.classList.contains("open"))) {
    pixItemValue.textContent = `R$ ${price}`;
  }
}

// Verifica se um modelo específico está desbloqueado
function isModelUnlocked(itemId) {
  if (sessionStorage.getItem("cs_visitor_preview") === "1") return false;
  if (IS_UNLOCKED_ROUTE || isAdminActive || isVipActive) return true;
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
    showToast("👁️ Modo Visitante ativado! Visualizando a página bloqueada.");
  }
  checkVipStatus();
  syncLiveCatalog();
}

// Verifica estado VIP/Admin
function checkVipStatus() {
  const isVisitorTestMode = sessionStorage.getItem("cs_visitor_preview") === "1";
  if (isVisitorTestMode) {
    isVipActive = false;
    isAdminActive = false;
    unlockedModels.clear();
    updateVipUI();
    return;
  }

  if (IS_UNLOCKED_ROUTE) {
    isVipActive = true;
    vipDaysRemaining = 9999;
  }

  let hasValidAdminKey = false;
  try {
    const rawAdminKey = (sessionStorage.getItem("cs_admin_key") || "").trim().toUpperCase();
    hasValidAdminKey = (rawAdminKey === "ADM-CLUBE-98319-LUAN-X99");
    if (hasValidAdminKey) {
      isAdminActive = true;
      isVipActive = true;
    }

    if (!IS_UNLOCKED_ROUTE) {
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
    }
  } catch (e) {
    if (!hasValidAdminKey && !IS_UNLOCKED_ROUTE) {
      isVipActive = false;
      isAdminActive = false;
      unlockedModels.clear();
    }
  }

  updateVipUI();
}

async function syncStatusWithBackend() {
  if (IS_UNLOCKED_ROUTE) return;
  try {
    const isVisitorTestMode = sessionStorage.getItem("cs_visitor_preview") === "1";
    if (isVisitorTestMode) return;

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
      const rawLocal = localStorage.getItem("clube_secreto_vip");
      let localIsAdmin = false;
      if (rawLocal) {
        try { localIsAdmin = !!JSON.parse(rawLocal).isAdmin; } catch (e) {}
      }
      if (!localIsAdmin && !isAdminActive) {
        isVipActive = false;
        isAdminActive = false;
        unlockedModels.clear();
        localStorage.removeItem("clube_secreto_vip");
        updateVipUI();
        renderCatalog();
        renderReelsCarousel();
      }
    }
  } catch (e) {}
}

function updateVipUI() {
  const isVisitorTestMode = sessionStorage.getItem("cs_visitor_preview") === "1";
  const hasAccess = !isVisitorTestMode && (IS_UNLOCKED_ROUTE || isAdminActive || isVipActive || unlockedModels.size > 0);
  const price = SITE_SETTINGS.vipPrice || "15,00";

  const btnHeaderVipIcon = document.getElementById("btnHeaderVipIcon");
  const btnHeaderWhatsapp = document.getElementById("btnHeaderWhatsapp");
  const heroPixBox = document.getElementById("heroPixBox");
  const heroSubHint = document.getElementById("heroSubHint");
  const btnHeroWhatsapp = document.getElementById("btnHeroWhatsapp");
  const btnHeroBuy = document.getElementById("btnHeroBuy");
  const heroTag = document.getElementById("heroTag");
  const heroTitle = document.getElementById("heroTitle");
  const heroDesc = document.getElementById("heroDesc");
  const btnVipBannerExit = document.getElementById("btnVipBannerExit");

  // Barra de Controle Rápido do Administrador (se Admin logado)
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
        <span><strong>MODO VISITANTE ATIVO (PÁGINA BLOQUEADA)</strong> — Vendo exatamente como quem ainda não pagou.</span>
      </div>
      <button onclick="toggleVisitorMode()" style="background: #fff; color: #dc2626; border: none; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 800; cursor: pointer; text-transform: uppercase;">
        👑 Voltar ao Modo Admin
      </button>
    `;
  } else if (isAdminActive && !IS_UNLOCKED_ROUTE) {
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
        <span><strong>Modo Admin Master Ativo</strong> (Tudo liberado para você)</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="toggleVisitorMode()" style="background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.5); color: #fff; padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">
          👁️ Ver como Visitante Bloqueado
        </button>
        <a href="/admin" style="background: #fff; color: #4f46e5; padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; text-decoration: none;">
          Painel Master ↗
        </a>
      </div>
    `;
  } else if (testBar) {
    testBar.style.display = "none";
  }

  if (hasAccess) {
    if (btnHeaderWhatsapp) btnHeaderWhatsapp.style.display = "none";
    if (btnHeaderVip) {
      btnHeaderVip.classList.remove("vip-active", "vip-admin");
      if (isAdminActive && !IS_UNLOCKED_ROUTE) {
        btnHeaderVip.classList.add("vip-admin");
        if (btnHeaderVipIcon) btnHeaderVipIcon.textContent = "👑";
        if (btnHeaderVipText) btnHeaderVipText.textContent = "Admin";
      } else {
        btnHeaderVip.classList.add("vip-active");
        if (btnHeaderVipIcon) btnHeaderVipIcon.textContent = "🔓";
        if (btnHeaderVipText) btnHeaderVipText.textContent = "VIP Liberado";
      }
      btnHeaderVip.onclick = () => scrollToCatalog();
    }
    if (vipActiveBanner) {
      vipActiveBanner.classList.remove("hidden");
      vipActiveBanner.classList.toggle("admin-mode", isAdminActive && !IS_UNLOCKED_ROUTE);
      if (vipActiveBannerText) {
        vipActiveBannerText.innerHTML = (isAdminActive && !IS_UNLOCKED_ROUTE)
          ? `👑 <strong>Admin Ativo — Tudo Liberado</strong>`
          : `🔓 <strong>VIP LIBERADO!</strong> Todas as ${getCatalog().length} modelos liberadas!`;
      }
      if (btnVipBannerExit) {
        btnVipBannerExit.style.display = IS_UNLOCKED_ROUTE ? "none" : "inline-block";
      }
    }
    if (heroPixBox) heroPixBox.style.display = "none";
    if (heroSubHint) heroSubHint.style.display = "none";
    if (heroTag) {
      heroTag.innerHTML = `<span>👑</span> ÁREA VIP OFICIAL • TUDO LIBERADO`;
      heroTag.style.borderColor = "#10b981";
      heroTag.style.color = "#34d399";
    }
    if (heroTitle) {
      heroTitle.innerHTML = `Tudo <span class="hero-title-accent" style="background: linear-gradient(135deg, #34d399, #10b981); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">100% Liberado</span> 🔥`;
    }
    if (heroDesc) {
      heroDesc.innerHTML = `Bem-vindo à Área VIP! Toque em qualquer modelo abaixo para ver <strong>todas as fotos em 4K e todos os vídeos completos</strong> sem bloqueios.`;
    }
    if (btnHeroWhatsapp) {
      btnHeroWhatsapp.href = "#";
      btnHeroWhatsapp.onclick = (e) => { e.preventDefault(); openReelsFeed(); };
      btnHeroWhatsapp.innerHTML = `<span>🎬</span><span>ASSISTIR TODOS OS VÍDEOS NO REELS</span>`;
    }
    if (btnHeroBuy) {
      btnHeroBuy.innerHTML = `<span>💃</span><span>VER TODAS AS MODELOS ABAIXO</span>`;
      btnHeroBuy.onclick = () => scrollToCatalog();
      btnHeroBuy.style.background = "linear-gradient(135deg, #059669, #047857)";
      btnHeroBuy.style.boxShadow = "0 0 20px rgba(16, 185, 129, 0.45)";
    }
  } else {
    // MODO BLOQUEADO (PRÉVIA COM PIX + BOTÃO GRANDE WHATSAPP)
    if (btnHeaderWhatsapp) {
      btnHeaderWhatsapp.style.display = "inline-flex";
      btnHeaderWhatsapp.href = formatWhatsappLink();
    }
    if (btnHeaderVip) {
      btnHeaderVip.classList.remove("vip-active", "vip-admin");
      if (btnHeaderVipIcon) btnHeaderVipIcon.textContent = "👑";
      if (btnHeaderVipText) btnHeaderVipText.textContent = `VIP R$ ${price}`;
      btnHeaderVip.onclick = () => openVipModal();
    }
    if (vipActiveBanner) vipActiveBanner.classList.add("hidden");
    if (heroPixBox) heroPixBox.style.display = "block";
    if (heroSubHint) {
      heroSubHint.style.display = "block";
      heroSubHint.innerHTML = `⚡ Enviou o PIX de <strong>R$ ${price}</strong>? Mande o comprovante no WhatsApp e receba o link com <strong>TUDO LIBERADO</strong> na hora! (Quer só 1 modelo específica? Chame no WhatsApp!)`;
    }
    if (heroTag) {
      heroTag.innerHTML = `<span>🔒</span> PRÉVIA GRÁTIS • ACESSO VIP COMPLETO`;
      heroTag.style.borderColor = "";
      heroTag.style.color = "";
    }
    if (heroTitle) {
      heroTitle.innerHTML = `Portfólios & Ensaios <span class="hero-title-accent">Exclusivos</span>`;
    }
    if (heroDesc) {
      heroDesc.innerHTML = `Veja as prévias grátis abaixo! Para liberar <strong>TODAS as fotos 4K e TODOS os vídeos</strong> sem censura de todas as ${getCatalog().length} modelos, é só fazer o PIX e chamar no WhatsApp:`;
    }
    if (btnHeroWhatsapp) {
      btnHeroWhatsapp.href = formatWhatsappLink();
      btnHeroWhatsapp.onclick = null;
      btnHeroWhatsapp.innerHTML = `<span>💬</span><span id="btnHeroWhatsappText">CHAMAR NO WHATSAPP / LIBERAR VIP (R$ ${price})</span>`;
    }
    if (btnHeroBuy) {
      btnHeroBuy.innerHTML = `<span>💠</span><span>PAGAR NO PIX (R$ ${price})</span>`;
      btnHeroBuy.onclick = () => openVipModal();
      btnHeroBuy.style.background = "";
      btnHeroBuy.style.boxShadow = "";
    }
  }
}

// Configura eventos
function setupEventListeners() {
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      renderCatalog();
    });
  }

  categoryPills.forEach(pill => {
    pill.addEventListener("click", () => {
      categoryPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      currentCategory = pill.dataset.cat || "all";
      renderCatalog();
    });
  });

  window.addEventListener("click", (e) => {
    if (e.target === previewModal) closePreviewModal();
    if (e.target === pixModal) closePixModal();
    if (e.target === lightboxModal) closeLightbox();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLightbox();
      closePreviewModal();
      closePixModal();
    }
    if (lightboxModal && lightboxModal.classList.contains("open")) {
      if (e.key === "ArrowRight") nextLightboxPhoto();
      if (e.key === "ArrowLeft") prevLightboxPhoto();
    }
  });
}

function renderCatalog() {
  const catalog = getCatalog();
  const sorted = [...catalog].sort((a, b) => (a.order || 999) - (b.order || 999));
  const filtered = sorted.filter(item => {
    const matchesCategory = currentCategory === "all" || item.category === currentCategory;
    const matchesSearch = !currentSearch ||
      item.title.toLowerCase().includes(currentSearch) ||
      item.creatorName.toLowerCase().includes(currentSearch) ||
      item.username.toLowerCase().includes(currentSearch) ||
      item.categoryLabel.toLowerCase().includes(currentSearch) ||
      item.description.toLowerCase().includes(currentSearch);

    return matchesCategory && matchesSearch;
  });

  if (resultsCount) {
    resultsCount.textContent = `${filtered.length} ensaio${filtered.length === 1 ? "" : "s"} disponível${filtered.length === 1 ? "" : "is"}`;
  }

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

  const price = SITE_SETTINGS.vipPrice || "15,00";
  const oldPrice = (SITE_SETTINGS.vipOldPrice || "").trim();

  cardsGrid.innerHTML = filtered.map(item => {
    const unlocked = isModelUnlocked(item.id);
    const coverSrc = item.cover || "/assets/logo.jpg";
    const avatarSrc = item.avatar || coverSrc;

    return `
      <div class="creator-card">
        <div class="card-media" onclick="openPreviewModal('${item.id}')" style="cursor: pointer;" title="Clique para abrir galeria de ${item.creatorName}">
          <img src="${coverSrc}" alt="${item.title}" class="card-cover" loading="lazy" onerror="this.src='/assets/logo.jpg'" />
          <div class="card-gradient-overlay"></div>

          <span class="card-badge ${item.isTrending ? "badge-trending" : ""}">${item.badge}</span>
          <span class="card-photo-count">📸 ${item.photoCount} Fotos${item.videoCount ? ` • 🎬 ${item.videoCount} Vídeos` : ""}</span>

          <div class="card-creator-info">
            <img src="${avatarSrc}" alt="${item.creatorName}" class="creator-avatar" onerror="this.src='/assets/logo.jpg'" />
            <div class="creator-names">
              <span class="creator-name">${item.creatorName} <span class="verified-icon">✓</span></span>
              <span class="creator-username">${item.username}</span>
            </div>
          </div>
        </div>

        <div class="card-body">
          <h3 class="card-title" onclick="openPreviewModal('${item.id}')" style="cursor: pointer;">${item.title}</h3>
          <p class="card-desc">${item.description}</p>

          <div class="card-meta" style="margin-bottom: 14px;">
            <span>🌟 ${item.rating} (${item.views} views)</span>
            <span>💎 ${item.resolution}</span>
          </div>

          <div class="card-actions">
            ${unlocked ? `
              <button class="btn-preview" onclick="openPreviewModal('${item.id}')">
                <span>📸 Fotos (${item.photoCount})</span>
              </button>
              <button class="btn-buy" style="background: linear-gradient(135deg, #059669, #047857);" onclick="openModelReels('${item.id}', 0)">
                <span>🎬 Vídeos (${item.videoCount || ""})</span>
              </button>
            ` : `
              <button class="btn-preview" onclick="openPreviewModal('${item.id}')">
                <span>👁️ Ver Prévia</span>
              </button>
              <button class="btn-buy btn-buy-wpp" onclick="openVipModal('${item.creatorName.replace(/'/g, "\\'")}')">
                <span>🔓 Liberar R$ ${price}</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

let currentPreviewFilter = "all";

function setPreviewFilter(filter) {
  currentPreviewFilter = filter;
  if (currentPreviewItem) {
    renderPreviewContent(currentPreviewItem);
  }
}

function openPreviewModal(itemId) {
  const item = getCatalog().find(i => i.id === itemId);
  if (!item) return;

  currentPreviewItem = item;
  const previews = Array.isArray(item.previews) ? item.previews : [];
  const numVideos = previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;
  const numPhotos = previews.length - numVideos;

  previewTitle.textContent = item.title;
  previewCreator.textContent = `${item.creatorName} (${item.username}) • ${numPhotos} Fotos 4K + ${numVideos} Vídeos 60fps`;

  renderPreviewContent(item);
  previewModal.classList.add("open");
}

function renderPreviewContent(item) {
  const catalog = getCatalog();
  const unlocked = isModelUnlocked(item.id);
  const previews = Array.isArray(item.previews) ? item.previews : [];
  const price = SITE_SETTINGS.vipPrice || "15,00";
  const pixKey = SITE_SETTINGS.pixKey || "09658990983";
  const pixHolder = SITE_SETTINGS.pixHolder || "Luan Batista";

  const allVids = previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4")));
  const allPics = previews.filter(p => !((typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))));

  const teaserPics = allPics.filter(p => typeof p === "object" && p.isTeaser && p.url);
  const hasTeaserFlags = allPics.some(p => typeof p === "object" && "isTeaser" in p);
  let displayPics = unlocked
    ? allPics.filter(p => (typeof p === "object" ? !!p.url : !!p))
    : (hasTeaserFlags ? teaserPics : allPics.filter(p => (typeof p === "object" ? !!p.url : !!p)).slice(0, 3));

  const photoPreviews = displayPics.map((p, idx) => ({
    url: typeof p === "object" ? p.url : p,
    originalIndex: idx
  }));

  currentLightboxPhotos = photoPreviews;
  currentLightboxItem = item;

  let html = "";
  const wppUrl = formatWhatsappLink(`Olá! Vi a prévia da *${item.creatorName}* no Clube Secreto e quero liberar o Acesso VIP por R$ ${price}! (Chave PIX: ${pixKey})`);

  // 1. BANNER HERO MODO REELS
  if (allVids.length > 0) {
    html += `
      <div class="model-reels-hero-banner" onclick="openModelReels('${item.id}', 0)" title="Toque para assistir no Modo Reels">
        <div class="hero-reels-left">
          <span class="hero-reels-badge">${unlocked ? "REELS VIP LIBERADO 🔓" : "PRÉVIA EM REELS 📱"}</span>
          <h4 class="hero-reels-title">${unlocked ? `Assistir Todos os ${allVids.length} Vídeos em Tela Cheia` : `Assistir Prévia em Vídeo + Fotos 4K`}</h4>
          <p class="hero-reels-sub">Feed vertical arrastando para cima estilo TikTok/Instagram • 60 FPS</p>
        </div>
        <button class="hero-reels-cta" onclick="event.stopPropagation(); openModelReels('${item.id}', 0);">
          <span class="reels-play-icon">▶</span>
          <span>Assistir Reels</span>
        </button>
      </div>
    `;
  }

  // 2. BLOCO PRÁTICO WHATSAPP + PIX (Apenas no modo bloqueado)
  if (!unlocked) {
    html += `
      <div class="modal-quick-actions practical-cta-box">
        <div class="practical-cta-header">
          <span class="practical-cta-title">🔓 LIBERAR TUDO POR APENAS R$ ${price}</span>
          <span class="practical-cta-sub">Libera TODAS as ${catalog.length} modelos (incluindo ${item.creatorName}) sem censura!</span>
        </div>

        <a href="${wppUrl}" target="_blank" rel="noopener noreferrer" class="btn-quick-whatsapp-big">
          <span style="font-size: 26px;">💬</span>
          <div class="quick-btn-info">
            <span class="quick-btn-title">CHAMAR NO WHATSAPP / LIBERAR AGORA</span>
            <span class="quick-btn-sub">Envie o comprovante ou tire dúvidas direto no WhatsApp</span>
          </div>
        </a>

        <div class="practical-pix-strip">
          <div class="practical-pix-details">
            <span class="practical-pix-badge">💠 PIX (CPF): <strong>${pixKey}</strong></span>
            <span class="practical-pix-holder">Titular: ${pixHolder} • Valor: R$ ${price}</span>
          </div>
          <button type="button" class="btn-quick-copy-pix" onclick="copyPixKey(this)">
            <span>📋 Copiar Chave PIX</span>
          </button>
        </div>

        <div class="practical-single-note">
          💡 Quer comprar só o pack da <strong>${item.creatorName}</strong>? Toque no botão verde acima e fale comigo no WhatsApp!
        </div>
      </div>
    `;
  }

  // 3. FOTOS PRIMEIRO
  if (allPics.length > 0) {
    html += `
      <div class="gallery-section-title">
        <div>
          <span class="section-title-main">📸 Fotos do Ensaio (${allPics.length} Fotos)</span>
          <span class="section-title-sub"> • Toque em qualquer foto para ampliar</span>
        </div>
        <button class="btn-sm-reels" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 11px; padding: 4px 10px; border-radius: 6px; cursor: pointer;" onclick="openLightbox(0)">
          🔍 Tela Cheia
        </button>
      </div>
    `;

    displayPics.forEach((p) => {
      const rawUrl = typeof p === "object" ? p.url : p;
      const url = appendMediaAuth(rawUrl);
      const photoIdx = photoPreviews.findIndex(pi => pi.url === rawUrl);
      html += `
        <div class="preview-item" onclick="openLightbox(${photoIdx >= 0 ? photoIdx : 0})" title="Toque para ampliar">
          <img src="${url}" class="preview-img" alt="Foto de ${item.creatorName}" loading="lazy" onerror="this.src='${item.cover || "/assets/logo.jpg"}'" />
          ${!unlocked ? `<div class="watermark-overlay">CLUBE SECRETO</div>` : ""}
        </div>
      `;
    });

    if (!unlocked) {
      const lockedPics = allPics.filter(p => !displayPics.some(dp => (typeof dp === "object" ? dp.url : dp) === (typeof p === "object" ? p.url : p)));
      lockedPics.forEach((p, pIdx) => {
        const pUrl = typeof p === "object" ? (p.url || "") : (p || "");
        const thumbSrc = (typeof p === "object" && p.thumbUrl) ? p.thumbUrl : (item.cover || "/assets/logo.jpg");
        const fallbackCover = item.cover || "/assets/logo.jpg";
        html += `
          <div class="preview-item preview-item-locked" onclick="openVipModal('${item.creatorName.replace(/'/g, "\\'")}')" title="Foto VIP Exclusiva • Toque para liberar">
            <img src="${thumbSrc || fallbackCover}" class="media-blurred" alt="Foto VIP" loading="lazy" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${fallbackCover}';}" />
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

  // 4. VÍDEOS & CENAS
  if (allVids.length > 0) {
    html += `
      <div class="gallery-section-title">
        <div>
          <span class="section-title-main">🎬 Vídeos & Cenas (${allVids.length} Vídeos)</span>
          <span class="section-title-sub"> • Toque para assistir no Modo Reels</span>
        </div>
        <button class="hero-reels-cta" style="padding: 6px 14px; font-size: 11px;" onclick="openModelReels('${item.id}', 0)">
          ▶ Abrir Reels
        </button>
      </div>
    `;

    allVids.forEach((v, vIdx) => {
      const isTeaser = typeof v === "object" ? !!v.isTeaser : false;
      const vUrl = typeof v === "object" ? (v.url || "") : (v || "");
      const thumbUrl = (typeof v === "object" && v.thumbUrl)
        ? v.thumbUrl
        : (vUrl ? vUrl.replace(/\.(mp4|webm|mov)$/i, "_thumb.jpg") : (item.cover || "/assets/logo.jpg"));
      const fallbackCover = item.cover || "/assets/logo.jpg";

      if (unlocked || isTeaser) {
        html += `
          <div class="preview-item preview-video-tile" onclick="openModelReels('${item.id}', ${vIdx})" title="Toque para assistir este vídeo no Modo Reels">
            <img src="${thumbUrl}" class="video-tile-thumb" alt="Vídeo ${vIdx + 1}" loading="lazy" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${fallbackCover}';}" />
            <div class="video-tile-overlay">
              <div class="video-tile-play-btn">▶</div>
              <div class="video-tile-badges">
                <span class="video-tile-num">🎬 Vídeo ${vIdx + 1}</span>
                <span class="video-tile-quality">${unlocked ? "🔓 HD 60FPS" : "👁️ PRÉVIA"}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="preview-item preview-item-locked" onclick="openVipModal('${item.creatorName.replace(/'/g, "\\'")}')" title="Vídeo VIP Exclusivo • Toque para liberar">
            <img src="${thumbUrl}" class="media-blurred" alt="Vídeo VIP" loading="lazy" onerror="if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${fallbackCover}';}" />
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

  // 5. BARRA FINAL DE DESBLOQUEIO PRÁTICO (Se bloqueado)
  if (!unlocked) {
    const lockedVidsCount = allVids.filter(v => !(typeof v === "object" && v.isTeaser)).length;
    const lockedPicsCount = Math.max(0, allPics.length - displayPics.length);

    html += `
      <div class="vip-floating-unlock-bar">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; width: 100%;">
          <div style="text-align: left;">
            <div style="font-weight: 900; font-size: 16px; color: #fff;">👑 LIBERAR TUDO POR R$ ${price}</div>
            <div style="font-size: 12px; color: #fda4af; margin-top: 3px;">+${lockedPicsCount} Fotos 4K & +${lockedVidsCount} Vídeos desta modelo + TODAS as outras!</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; width: 100%;">
            <a href="${wppUrl}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-confirm" style="flex: 1.5; min-width: 210px; padding: 13px 16px; font-size: 13px;">
              <span>💬 CHAMAR NO WHATSAPP</span>
            </a>
            <button type="button" class="btn-primary-glow" style="flex: 1; min-width: 150px; justify-content: center; padding: 13px 16px; font-size: 13px;" onclick="openVipModal('${item.creatorName.replace(/'/g, "\\'")}')">
              <span>💠 VER PIX (R$ ${price})</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  previewGrid.innerHTML = html;

  if (unlocked) {
    previewModalFooter.style.display = "block";
    previewModalFooter.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 10px;">
        <div>
          <span style="font-size: 11px; color: #10b981; text-transform: uppercase; font-weight: 800;">Status do Acesso:</span>
          <span style="font-size: 15px; font-weight: 900; color: #10b981; display: block;">🔓 ACESSO VIP TOTAL LIBERADO</span>
        </div>
        <button class="btn-buy" style="background: linear-gradient(135deg, #059669, #047857); padding: 10px 16px;" onclick="openModelReels('${item.id}', 0)">
          <span>🎬 Assistir Vídeos no Modo Reels</span>
        </button>
      </div>
    `;
  } else {
    previewModalFooter.style.display = "none";
  }
}

function closePreviewModal() {
  if (!previewModal) return;
  previewModal.classList.remove("open");
  const videos = previewGrid.querySelectorAll("video");
  videos.forEach(v => {
    try {
      v.pause();
      v.currentTime = 0;
    } catch (e) {}
  });
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

  const totalPhotosInPack = currentLightboxItem.photoCount || currentLightboxPhotos.length;
  const numAvailablePreviews = currentLightboxPhotos.length;
  const price = SITE_SETTINGS.vipPrice || "15,00";
  const pixKey = SITE_SETTINGS.pixKey || "09658990983";

  if (currentLightboxIndex >= numAvailablePreviews && !unlocked) {
    lightboxImgWrapper.style.display = "none";
    lightboxLockedSlide.style.display = "block";
    lightboxLockedTitle.textContent = `+${Math.max(1, totalPhotosInPack - numAvailablePreviews)} Fotos & Vídeos Bloqueados`;
    lightboxCounter.textContent = `Foto ${numAvailablePreviews + 1} de ${totalPhotosInPack} (Bloqueada)`;

    const wppBtn = document.getElementById("lightboxWhatsappBtn");
    if (wppBtn) {
      wppBtn.href = formatWhatsappLink(`Olá! Vi as fotos de prévia da *${currentLightboxItem.creatorName}* e quero liberar o Acesso VIP por R$ ${price} (PIX ${pixKey})!`);
    }
    return;
  }

  lightboxLockedSlide.style.display = "none";
  lightboxImgWrapper.style.display = "flex";

  const safeIdx = Math.max(0, Math.min(currentLightboxIndex, numAvailablePreviews - 1));
  const currentPhoto = currentLightboxPhotos[safeIdx];
  lightboxImg.src = appendMediaAuth(currentPhoto.url);
  lightboxCounter.textContent = `Foto ${safeIdx + 1} de ${totalPhotosInPack} ${!unlocked ? "(Modo Prévia)" : "(Liberada em 4K)"}`;

  lightboxWatermark.style.display = unlocked ? "none" : "flex";
}

function nextLightboxPhoto() {
  if (!currentLightboxItem) return;
  const unlocked = isModelUnlocked(currentLightboxItem.id);
  const maxIdx = unlocked ? currentLightboxPhotos.length - 1 : currentLightboxPhotos.length;

  if (currentLightboxIndex < maxIdx) {
    currentLightboxIndex++;
    renderLightboxSlide();
  } else if (!unlocked) {
    currentLightboxIndex = currentLightboxPhotos.length;
    renderLightboxSlide();
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
// MODAL DE PIX SIMPLIFICADO (PREÇO ÚNICO VIP + BOTÃO GIGANTE WHATSAPP)
// ═════════════════════════════════════════════════════════════════════════

function openPixModal(modelHint) {
  const price = SITE_SETTINGS.vipPrice || "15,00";
  const pixKey = SITE_SETTINGS.pixKey || "09658990983";
  const pixHolder = SITE_SETTINGS.pixHolder || "Luan Batista";
  const planTitle = SITE_SETTINGS.vipPlanTitle || "ACESSO VIP COMPLETO";
  const catalogCount = getCatalog().length;

  if (pixItemName) pixItemName.textContent = `${planTitle} (${catalogCount} Modelos)`;
  if (pixItemValue) pixItemValue.textContent = `R$ ${price}`;
  if (pixItemDuration) pixItemDuration.textContent = "Todas as Fotos 4K + Todos os Vídeos";

  const modalKeyEl = document.getElementById("pixModalKeyDisplay");
  const holderEl = document.getElementById("pixHolderDisplay");
  const stepPriceEl = document.getElementById("pixStepPrice");
  const stepHolderEl = document.getElementById("pixStepHolder");
  if (modalKeyEl) modalKeyEl.textContent = pixKey;
  if (holderEl) holderEl.textContent = pixHolder;
  if (stepPriceEl) stepPriceEl.textContent = `R$ ${price}`;
  if (stepHolderEl) stepHolderEl.textContent = pixHolder;

  const extra = modelHint ? ` (Vi a modelo ${modelHint})` : "";
  const message = `Olá! Quero liberar meu Acesso VIP de *R$ ${price}* no Clube Secreto!${extra}\n\nChave PIX: ${pixKey} (${pixHolder}). Segue meu comprovante (ou me chame aqui):`;
  if (btnWhatsAppConfirm) {
    btnWhatsAppConfirm.href = formatWhatsappLink(message);
  }

  if (pixModal) pixModal.classList.add("open");
}

function closePixModal() {
  if (pixModal) pixModal.classList.remove("open");
}

function openVipModal(modelHint) {
  if (isModelUnlocked("any") && !sessionStorage.getItem("cs_visitor_preview")) {
    showToast("👑 Seu Acesso VIP já está 100% liberado!");
    return;
  }
  openPixModal(modelHint);
}

// Compatibilidade caso links antigos ainda chamem openCodeModal
window.openCodeModal = function () {
  openVipModal();
};

// Compatibilidade caso cliente antigo acesse com ?codigo=
async function activateCode(rawCode) {
  if (!rawCode) return false;
  const cleanCode = (rawCode || "").replace(/[-\s_]/g, "").trim().toUpperCase();
  const deviceId = getDeviceId();
  try {
    const response = await fetch("/api/activate-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cleanCode, deviceId })
    });
    const data = await response.json();
    if (!data.success) return false;

    localStorage.setItem("clube_secreto_vip", JSON.stringify({
      active: true,
      isAdmin: !!data.isAdmin,
      isWeeklyVip: !!data.isWeeklyVip || !!data.allModels,
      unlockedModels: data.modelId ? [data.modelId] : [],
      plan: data.plan,
      code: cleanCode,
      activatedAt: Date.now(),
      expiresAt: data.expiresAt
    }));
    checkVipStatus();
    renderCatalog();
    showToast(data.message || "🎉 Acesso VIP ativado!");
    return true;
  } catch (err) {
    return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// REELS FEED EM TELA CHEIA (CORRIGIDO PARA MOBILE E DESKTOP — 100% SINCRONIZADO)
// ═════════════════════════════════════════════════════════════════════════

let currentActiveReelModelId = null;
let reelsAudioMuted = false;
let reelsFeedObserver = null;
let currentReelsMode = "global"; // "global" ou "model"
let currentActiveVideoIndex = 0;
let currentModelTotalVideos = 0;
let currentModelIsUnlocked = false;

function renderReelsCarousel() {
  const container = document.getElementById("reelsCarousel");
  const catalog = getCatalog();
  if (!container || catalog.length === 0) return;

  const sorted = [...catalog].sort((a, b) => (a.order || 999) - (b.order || 999));
  const modelsWithMedia = sorted.filter(m => Array.isArray(m.previews) && m.previews.length > 0);

  container.innerHTML = modelsWithMedia.map(model => {
    const unlocked = isModelUnlocked(model.id);
    let videoUrl = null;
    if (model.reelsVideo) {
      videoUrl = appendMediaAuth(model.reelsVideo);
    } else {
      const teaserVid = model.previews.find(p => (typeof p === "object" && p.type === "video" && p.isTeaser) || (typeof p === "object" && p.isTeaser && p.url && p.url.endsWith(".mp4")));
      if (teaserVid) {
        videoUrl = appendMediaAuth(typeof teaserVid === "object" ? teaserVid.url : teaserVid);
      }
    }
    const coverUrl = model.cover || model.avatar || "/assets/logo.jpg";
    const numVideos = model.videoCount || model.previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;

    return `
      <div class="reel-card" onclick="openReelsFeed('${model.id}')" title="Assistir Reels de ${model.creatorName}">
        <div class="reel-card-inner">
          ${videoUrl ? `
            <video class="reel-video" src="${videoUrl}" poster="${coverUrl}" preload="none" muted loop playsinline onmouseenter="this.play()" onmouseleave="this.pause()"></video>
          ` : `
            <img class="reel-img" src="${coverUrl}" alt="${model.creatorName}" loading="lazy" onerror="this.src='/assets/logo.jpg'" />
          `}
          <div class="reel-top-tag">
            <span>🎬</span> ${numVideos > 0 ? `${numVideos} VÍDEOS` : "VIP"}
          </div>
          <div class="reel-play-icon">▶</div>
          <div class="reel-overlay-bottom">
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:2px;">
              <img src="${model.avatar || coverUrl}" alt="${model.creatorName}" class="reel-creator-avatar" onerror="this.src='/assets/logo.jpg'" />
              <div style="overflow:hidden;">
                <span class="reel-creator-name">${model.creatorName}</span>
                <span class="reel-creator-vids">⚡ ${numVideos} Vídeos</span>
              </div>
            </div>
            <button class="reel-card-access-btn" onclick="event.stopPropagation(); openModelDirectFromReel('${model.id}')">
              <span>${unlocked ? "▶ Ver Tudo" : "👁️ Prévia"}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function attachReelsScrollSync(container) {
  let rafPending = false;
  let settleTimer = null;

  const syncActiveSlideFromViewport = () => {
    const cRect = container.getBoundingClientRect();
    if (!cRect || cRect.height <= 0) return;

    const viewCenterY = cRect.top + cRect.height / 2;
    const slides = container.querySelectorAll(".reel-slide");
    let bestSlide = null;
    let minDistance = Infinity;

    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const sRect = s.getBoundingClientRect();
      const sCenterY = sRect.top + sRect.height / 2;
      const dist = Math.abs(sCenterY - viewCenterY);
      if (dist < minDistance) {
        minDistance = dist;
        bestSlide = s;
      }
    }

    if (!bestSlide) return;
    const mid = bestSlide.getAttribute("data-model-id");
    if (!mid) return;

    if (currentReelsMode === "global") {
      if (mid !== currentActiveReelModelId) {
        currentActiveReelModelId = mid;
        window.currentActiveReelModelId = mid;
        updateReelsStickyBottom(mid);
        playReelSlide(bestSlide, mid);
      }
    } else {
      const vIdx = parseInt(bestSlide.getAttribute("data-video-idx") || "0", 10);
      if (vIdx !== currentActiveVideoIndex || mid !== currentActiveReelModelId) {
        currentActiveReelModelId = mid;
        window.currentActiveReelModelId = mid;
        currentActiveVideoIndex = vIdx;
        updateReelsStickyBottom(mid, vIdx, currentModelTotalVideos, currentModelIsUnlocked);
        playReelSlide(bestSlide, mid);
      }
    }
  };

  container.onscroll = () => {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        syncActiveSlideFromViewport();
      });
    }
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(syncActiveSlideFromViewport, 120);
  };

  container.onscrollend = syncActiveSlideFromViewport;
  container.ontouchend = () => setTimeout(syncActiveSlideFromViewport, 180);

  if (reelsFeedObserver) reelsFeedObserver.disconnect();
  reelsFeedObserver = new IntersectionObserver((entries) => {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting && entries[i].intersectionRatio >= 0.55) {
        syncActiveSlideFromViewport();
        break;
      }
    }
  }, {
    root: container,
    threshold: [0.55]
  });

  container.querySelectorAll(".reel-slide").forEach(slide => {
    reelsFeedObserver.observe(slide);
  });

  window.onkeydown = (e) => {
    const overlay = document.getElementById("reelsFeedOverlay");
    if (!overlay || overlay.style.display !== "flex") return;
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

  return syncActiveSlideFromViewport;
}

function openModelReels(modelId, startVideoIndex = 0) {
  const catalog = getCatalog();
  const model = catalog.find(m => m.id === modelId);
  if (!model) return;

  const overlay = document.getElementById("reelsFeedOverlay");
  const container = document.getElementById("reelsFeedContainer");
  if (!overlay || !container) return;

  const unlocked = isModelUnlocked(model.id);
  const price = SITE_SETTINGS.vipPrice || "15,00";
  const pixKey = SITE_SETTINGS.pixKey || "09658990983";

  const allVids = (model.previews || []).filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4")));
  if (allVids.length === 0) {
    showToast("Nenhum vídeo disponível para esta modelo.");
    return;
  }

  currentReelsMode = "model";
  currentActiveReelModelId = model.id;
  window.currentActiveReelModelId = model.id;
  currentActiveVideoIndex = startVideoIndex;
  currentModelTotalVideos = allVids.length;
  currentModelIsUnlocked = unlocked;

  const coverUrl = model.cover || model.avatar || "/assets/logo.jpg";

  container.innerHTML = allVids.map((v, idx) => {
    const isTeaser = typeof v === "object" ? !!v.isTeaser : false;
    const isAvailable = unlocked || isTeaser;
    const rawUrl = typeof v === "object" ? (v.url || "") : (v || "");
    const thumbUrl = (typeof v === "object" && v.thumbUrl)
      ? v.thumbUrl
      : (rawUrl ? rawUrl.replace(/\.(mp4|webm|mov)$/i, "_thumb.jpg") : coverUrl);
    const vidUrl = isAvailable ? appendMediaAuth(rawUrl) : "";
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
              <img src="${model.avatar || coverUrl}" class="reel-sidebar-avatar" onerror="this.src='/assets/logo.jpg'" />
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
      const wppUrl = formatWhatsappLink(`Olá! Vi a *${model.creatorName}* no Clube Secreto e quero liberar o Acesso VIP por R$ ${price} (PIX ${pixKey})!`);
      return `
        <div class="reel-slide" data-model-id="${model.id}" data-video-idx="${idx}" id="modelReelSlide_${idx}">
          <div class="reel-slide-backdrop" style="background-image: url('${thumbUrl}');"></div>
          <img class="reel-slide-poster media-blurred" src="${thumbUrl}" alt="${model.creatorName}" loading="eager" onerror="this.src='${coverUrl}'" />

          <div class="locked-glass-content" style="position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 20px; text-align: center; background: rgba(8,10,16,0.78); backdrop-filter: blur(8px);">
            <div class="locked-icon-wrapper" style="width: 58px; height: 58px; border-radius: 50%; background: rgba(225,29,72,0.3); border: 2px solid rgba(225,29,72,0.6); display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 12px;">🔒</div>
            <h3 style="color: #fff; font-size: 18px; font-weight: 900; margin-bottom: 6px;">Vídeo Exclusivo VIP • ${idx + 1} de ${allVids.length}</h3>
            <p style="color: #cbd5e1; font-size: 13px; max-width: 320px; margin-bottom: 16px;">Libere TODOS os vídeos e fotos de ${model.creatorName} e de todas as outras modelos por apenas <strong>R$ ${price}</strong>!</p>
            <div style="display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 290px;">
              <a href="${wppUrl}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-confirm" style="padding: 14px 18px; font-size: 14px; font-weight: 900;">
                <span>💬 CHAMAR NO WHATSAPP (R$ ${price})</span>
              </a>
              <button class="btn-primary" style="padding: 12px 18px; font-size: 13px; font-weight: 800; width: 100%; justify-content: center;" onclick="event.stopPropagation(); closeReelsFeed(); openVipModal('${model.creatorName.replace(/'/g, "\\'")}');">
                <span>💠 VER PIX (${pixKey}) — R$ ${price}</span>
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
  attachReelsScrollSync(container);

  const targetIdx = Math.max(0, Math.min(startVideoIndex, allVids.length - 1));
  const targetSlide = document.getElementById(`modelReelSlide_${targetIdx}`) || document.querySelector(".reel-slide");
  if (targetSlide) {
    container.scrollTop = targetSlide.offsetTop;
    playReelSlide(targetSlide, model.id);
  }
}

function openReelsFeed(startModelId) {
  const overlay = document.getElementById("reelsFeedOverlay");
  const container = document.getElementById("reelsFeedContainer");
  const catalog = getCatalog();
  if (!overlay || !container || catalog.length === 0) return;

  const sorted = [...catalog].sort((a, b) => (a.order || 999) - (b.order || 999));
  const modelsWithVideos = sorted.filter(m =>
    Array.isArray(m.previews) &&
    m.previews.some(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4")))
  );

  if (modelsWithVideos.length === 0) {
    showToast("Nenhum vídeo disponível no momento.");
    return;
  }

  currentReelsMode = "global";

  container.innerHTML = modelsWithVideos.map((model, idx) => {
    let vidUrl = model.reelsVideo ? appendMediaAuth(model.reelsVideo) : null;
    if (!vidUrl) {
      const teaserVid = model.previews.find(p => ((typeof p === "object" && p.type === "video" && p.isTeaser) || (typeof p === "object" && p.isTeaser && p.url && p.url.endsWith(".mp4"))));
      if (teaserVid) {
        vidUrl = appendMediaAuth(typeof teaserVid === "object" ? teaserVid.url : teaserVid);
      }
    }
    const coverUrl = model.cover || model.avatar || "/assets/logo.jpg";
    const numVideos = model.videoCount || model.previews.filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;
    const likes = (14.2 + (idx * 2.8)).toFixed(1);

    return `
      <div class="reel-slide" data-model-id="${model.id}" data-slide-idx="${idx}" id="reelSlide_${model.id}">
        <div class="reel-slide-backdrop" style="background-image: url('${coverUrl}');"></div>
        <img class="reel-slide-poster" src="${coverUrl}" alt="${model.creatorName}" loading="eager" onerror="this.src='/assets/logo.jpg'" />

        <video class="reel-slide-video" data-src="${vidUrl || ""}" playsinline webkit-playsinline="true" x5-playsinline="true" loop muted preload="none" onclick="toggleReelSlidePlayback(this)"></video>

        <div class="reel-play-center-btn" onclick="toggleReelSlidePlayback(this.parentElement.querySelector('video'))">
          <span class="reel-play-triangle">▶</span>
          <span class="reel-play-text">Toque para Assistir</span>
        </div>

        <div class="reel-sidebar-actions">
          <div class="reel-action-btn reel-sidebar-avatar-box" onclick="accessCurrentReelModel()">
            <img src="${model.avatar || coverUrl}" class="reel-sidebar-avatar" onerror="this.src='/assets/logo.jpg'" />
            <span class="reel-sidebar-badge">✓</span>
          </div>
          <div class="reel-action-btn" onclick="toggleReelHeart(this)">
            <span class="reel-heart-icon">❤️</span>
            <span class="reel-action-count">${likes}k</span>
          </div>
          <div class="reel-action-btn" onclick="accessCurrentReelModel()">
            <span class="reel-action-icon">📸</span>
            <span class="reel-action-count">${numVideos} Vids</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";

  attachReelsScrollSync(container);

  const targetId = startModelId || modelsWithVideos[0].id;
  currentActiveReelModelId = targetId;
  window.currentActiveReelModelId = targetId;
  updateReelsStickyBottom(targetId);

  const targetSlide = document.getElementById(`reelSlide_${targetId}`) || document.querySelector(".reel-slide");
  if (targetSlide) {
    container.scrollTop = targetSlide.offsetTop;
    playReelSlide(targetSlide, targetId);
  }
}

function playReelSlide(slide, modelId) {
  if (!slide) return;
  currentActiveReelModelId = modelId;
  window.currentActiveReelModelId = modelId;

  if (currentReelsMode === "global") {
    updateReelsStickyBottom(modelId);
  }

  const slides = [...document.querySelectorAll(".reel-slide")];
  const activeIdx = slides.indexOf(slide);

  slides.forEach((s) => {
    const vid = s.querySelector("video");
    const playBtn = s.querySelector(".reel-play-center-btn");
    if (s !== slide) {
      if (vid && !vid.paused) {
        try { vid.pause(); } catch (e) {}
      }
      s.classList.remove("video-playing");
      if (playBtn) playBtn.style.display = "none";
    }
  });

  const vid = slide.querySelector("video");
  const playBtn = slide.querySelector(".reel-play-center-btn");

  if (vid && (vid.src || vid.dataset.src)) {
    if (!vid.src && vid.dataset.src) {
      vid.src = vid.dataset.src;
    }

    vid.muted = reelsAudioMuted;
    vid.defaultMuted = reelsAudioMuted;

    vid.ontimeupdate = () => {
      if (vid.currentTime > 0.02) {
        slide.classList.add("video-playing");
        if (playBtn) playBtn.style.display = "none";
      }
    };

    vid.onplaying = () => {
      slide.classList.add("video-playing");
      if (playBtn) playBtn.style.display = "none";
    };

    vid.onpause = () => {
      if (currentActiveReelModelId === modelId && vid.currentTime > 0) {
        if (playBtn) playBtn.style.display = "flex";
      }
    };

    vid.onerror = () => {
      slide.classList.remove("video-playing");
      if (playBtn) playBtn.style.display = "flex";
    };

    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          slide.classList.add("video-playing");
          if (playBtn) playBtn.style.display = "none";
        })
        .catch(() => {
          if (!vid.muted) {
            vid.muted = true;
            vid.play()
              .then(() => {
                slide.classList.add("video-playing");
                if (playBtn) playBtn.style.display = "none";
              })
              .catch(() => {
                slide.classList.remove("video-playing");
                if (playBtn) playBtn.style.display = "flex";
              });
          } else {
            slide.classList.remove("video-playing");
            if (playBtn) playBtn.style.display = "flex";
          }
        });
    }
  }

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
  const currentIdx = slides.findIndex(s =>
    s.getAttribute("data-model-id") === currentActiveReelModelId &&
    (currentReelsMode !== "model" || parseInt(s.getAttribute("data-video-idx") || "0", 10) === currentActiveVideoIndex)
  );
  const safeCurrent = currentIdx >= 0 ? currentIdx : 0;
  const nextIdx = (safeCurrent + 1) % slides.length;
  scrollToReelIndex(nextIdx);
}

function goToPrevReel() {
  const slides = [...document.querySelectorAll(".reel-slide")];
  if (slides.length === 0) return;
  const currentIdx = slides.findIndex(s =>
    s.getAttribute("data-model-id") === currentActiveReelModelId &&
    (currentReelsMode !== "model" || parseInt(s.getAttribute("data-video-idx") || "0", 10) === currentActiveVideoIndex)
  );
  const safeCurrent = currentIdx >= 0 ? currentIdx : 0;
  const prevIdx = (safeCurrent - 1 + slides.length) % slides.length;
  scrollToReelIndex(prevIdx);
}

function scrollToReelIndex(idx) {
  const container = document.getElementById("reelsFeedContainer");
  const slides = [...document.querySelectorAll(".reel-slide")];
  if (!slides[idx] || !container) return;

  container.scrollTo({ top: slides[idx].offsetTop, behavior: "smooth" });
  const modelId = slides[idx].getAttribute("data-model-id");
  if (currentReelsMode === "model") {
    const vIdx = parseInt(slides[idx].getAttribute("data-video-idx") || String(idx), 10);
    currentActiveVideoIndex = vIdx;
    updateReelsStickyBottom(modelId, vIdx, currentModelTotalVideos, currentModelIsUnlocked);
  } else {
    updateReelsStickyBottom(modelId);
  }
  playReelSlide(slides[idx], modelId);
}

function closeReelsFeed() {
  const overlay = document.getElementById("reelsFeedOverlay");
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";

  document.querySelectorAll(".reel-slide-video").forEach(v => {
    try { v.pause(); } catch (e) {}
  });

  if (reelsFeedObserver) {
    reelsFeedObserver.disconnect();
    reelsFeedObserver = null;
  }
}

function updateReelsStickyBottom(modelId, videoIdx, totalVideos, isUnlocked) {
  const catalog = getCatalog();
  const model = catalog.find(m => m.id === modelId);
  if (!model) return;

  const avatar = document.getElementById("reelsStickyAvatar");
  const name = document.getElementById("reelsStickyName");
  const tag = document.getElementById("reelsStickyTag");
  const btn = document.getElementById("btnReelsAccess");
  const actionsDiv = document.getElementById("reelsStickyActions") || document.querySelector(".reels-sticky-actions");

  if (avatar) avatar.src = model.avatar || model.cover || "/assets/logo.jpg";
  if (name) name.textContent = model.creatorName;
  if (tag) {
    if (videoIdx !== undefined && totalVideos) {
      tag.textContent = `🎬 Vídeo ${videoIdx + 1} de ${totalVideos} • Alta Definição 60FPS`;
    } else {
      const numVids = model.videoCount || (model.previews || []).filter(p => (typeof p === "object" && p.type === "video") || (typeof p === "string" && p.endsWith(".mp4"))).length;
      const numPics = model.photoCount || ((model.previews || []).length - numVids);
      tag.textContent = `🎬 ${numVids} Vídeos + 📸 ${numPics} Fotos 4K`;
    }
  }

  const unlocked = isUnlocked !== undefined ? isUnlocked : isModelUnlocked(model.id);
  const price = SITE_SETTINGS.vipPrice || "15,00";

  if (unlocked) {
    if (btn) btn.style.display = "none";
    if (actionsDiv) actionsDiv.style.display = "none";
  } else {
    if (actionsDiv) actionsDiv.style.display = "flex";
    if (btn) {
      btn.style.display = "flex";
      btn.innerHTML = `
        <span class="reels-btn-glow"></span>
        <span class="reels-btn-text">💬 LIBERAR TUDO — R$ ${price} (PIX / WHATSAPP)</span>
        <span class="reels-btn-sub">Toque para pagar no PIX ou chamar no WhatsApp agora</span>
      `;
      btn.style.background = "linear-gradient(135deg, #22c55e, #15803d)";
      btn.onclick = () => {
        closeReelsFeed();
        openVipModal(model.creatorName);
      };
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
    videoEl.muted = reelsAudioMuted;
    videoEl.play().then(() => {
      if (slide) slide.classList.add("video-playing");
      if (playBtn) playBtn.style.display = "none";
    }).catch(() => {
      videoEl.muted = true;
      videoEl.play().then(() => {
        if (slide) slide.classList.add("video-playing");
        if (playBtn) playBtn.style.display = "none";
      }).catch(() => {});
    });
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
}

function deactivateVip() {
  localStorage.removeItem("clube_secreto_vip");
  checkVipStatus();
  renderCatalog();
  renderReelsCarousel();
  showToast("Sessão encerrada.");
}

function copyPixKey(triggerBtn) {
  const pixKey = SITE_SETTINGS.pixKey || "09658990983";
  const price = SITE_SETTINGS.vipPrice || "15,00";
  const btn = triggerBtn || document.querySelector(".btn-copy-pix");
  const originalHtml = btn ? btn.innerHTML : "";

  function notifyCopied() {
    showToast(`✅ Chave PIX (${pixKey}) copiada! Faça o PIX de R$ ${price} e envie no WhatsApp.`);
    if (btn) {
      btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
      btn.style.borderColor = "#34d399";
      btn.style.color = "#fff";
      btn.innerHTML = "<span>✅ CHAVE COPIADA! ENVIE NO WHATSAPP</span>";
      setTimeout(() => {
        btn.style.background = "";
        btn.style.borderColor = "";
        btn.style.color = "";
        btn.innerHTML = originalHtml;
      }, 3500);
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pixKey).then(notifyCopied).catch(() => {
      fallbackCopy(pixKey, notifyCopied);
    });
  } else {
    fallbackCopy(pixKey, notifyCopied);
  }
}

function fallbackCopy(val, callback) {
  const input = document.createElement("input");
  input.value = val;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
  if (callback) callback();
}

function showToast(msg) {
  if (!toast || !toastMsg) return;
  toastMsg.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 4200);
}

function scrollToCatalog() {
  const el = document.getElementById("catalogSection");
  if (el) el.scrollIntoView({ behavior: "smooth" });
}

// ═════════════════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO EM TEMPO REAL DO CATÁLOGO COM O SERVIDOR (SEM CACHE)
// ═════════════════════════════════════════════════════════════════════════
async function syncLiveCatalog() {
  try {
    const isVisitorTestMode = sessionStorage.getItem("cs_visitor_preview") === "1";
    const devId = isVisitorTestMode ? "" : getDeviceId();
    const adminKey = (isVisitorTestMode || !isAdminActive) ? "" : (sessionStorage.getItem("cs_admin_key") || "");
    const pageMode = (IS_UNLOCKED_ROUTE && !isVisitorTestMode) ? "unlocked" : "blocked";

    let url = `/api/catalog?t=${Date.now()}&mode=${encodeURIComponent(pageMode)}`;
    if (devId) url += "&deviceId=" + encodeURIComponent(devId);
    if (adminKey) url += "&key=" + encodeURIComponent(adminKey);
    if (IS_UNLOCKED_ROUTE && VIP_ROUTE_TOKEN && !isVisitorTestMode) {
      url += "&vipToken=" + encodeURIComponent(VIP_ROUTE_TOKEN);
    }

    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "x-page-mode": pageMode,
        ...(devId ? { "x-device-id": devId } : {}),
        ...(adminKey ? { "x-admin-key": adminKey } : {}),
        ...(IS_UNLOCKED_ROUTE && VIP_ROUTE_TOKEN && !isVisitorTestMode ? { "x-vip-token": VIP_ROUTE_TOKEN } : {})
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        if (typeof CREATORS_CATALOG !== "undefined") {
          CREATORS_CATALOG = data;
        }
        window.CREATORS_CATALOG = data;
        renderCatalog();
        renderReelsCarousel();
        updateVipUI();
      }
    }
  } catch (err) {
    console.warn("Fallback catálogo estático:", err);
  }
}

window.openReelsFeed = openReelsFeed;
window.openModelReels = openModelReels;
window.closeReelsFeed = closeReelsFeed;
window.openPreviewModal = openPreviewModal;
window.closePreviewModal = closePreviewModal;
window.openVipModal = openVipModal;
window.openPixModal = openPixModal;
window.closePixModal = closePixModal;
window.copyPixKey = copyPixKey;
window.toggleVisitorMode = toggleVisitorMode;
window.goToNextReel = goToNextReel;
window.goToPrevReel = goToPrevReel;
window.toggleReelsAudio = toggleReelsAudio;
