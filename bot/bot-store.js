const fs = require('fs');
const path = require('path');

const BOT_CONFIG_DIR = path.join(__dirname, 'config');
const BOT_DATA_DIR = path.join(__dirname, 'data');
const BOT_CONFIG_FILE = path.join(BOT_CONFIG_DIR, 'bot-config.json');
const BOT_STATE_FILE = path.join(BOT_DATA_DIR, 'bot-state.json');

const DEFAULT_BOT_CONFIG = {
  enabled: true,
  // 'off' | 'pilot' (só responde números na lista de teste) | 'production' (todos os leads novos)
  mode: 'pilot',
  pollingEnabled: true,
  pollIntervalMs: 5000,
  backlogMaxMinutes: 60,
  backlogDelayMinMs: 12000,
  backlogDelayMaxMs: 25000,
  batchPauseEvery: 8,
  batchPauseMs: 90000,
  evolutionUrl: process.env.EVOLUTION_URL || 'https://evolution.omelhorvendedoronline.com.br',
  evolutionKey: process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_KEY || '',
  evolutionInstance: process.env.EVOLUTION_INSTANCE || 'PROJETO COMBO',
  webhookUrl: 'https://clubesecreto.omelhorvendedoronline.com.br/api/bot/webhook',
  webhookSecret: '',
  pilotNumbers: [],
  adminNumbers: [
    '554198818471',
    '5541998818471',
    '554191914551',
    '5541991914551',
    '554195993007',
    '23871579246654@lid'
  ],
  debounceMs: 5000,
  recMinMs: 1400,
  recMaxMs: 3200,
  humanPauseHours: 24,
  followUpEnabled: false,
  followUp1Minutes: 15,
  followUp2Minutes: 120,
  sendViewOncePreview: true,
  previewImagePath: path.join(__dirname, 'previews', 'previa_modelo4.jpg'),
  previewCaption: '',
  useBedTeaserAudio: false,
  teaserVideoUrl: '',
  sendNativePixButton: true,
  pixKey: '09658990983',
  pixKeyType: 'cpf',
  pixHolder: 'Luan Batista',
  pixCardTitle: 'Pagamento PIX',
  pixCardDesc: 'Copie a chave PIX abaixo para concluir seu pagamento:',
  pixCardFooter: 'Clube Secreto',
  greetingText: 'Estou aqui meu amor 💞',
  priceTableText: [
    '💜 *TABELA DE PREÇOS*',
    '',
    '📸 1 Foto — R$ 5,00',
    '🎬 1 Vídeo — R$ 9,99',
    '🎬 2 Vídeos + 1 Foto — R$ 14,99'
  ].join('\n'),
  includeVipSiteOption: false,
  vipSiteOptionText: '💎 *Acesso VIP Completo (Site):* R$ 15,00\n👉 https://clubesecreto.omelhorvendedoronline.com.br',
  videoCallText: '📹 *Chamada de Vídeo ao Vivo:* R$ 79,90\nSe quiser fechar agora já te mando o PIX meu amor 💞',
  postPixText: 'Assim que enviar o comprovante libero o acesso',
  receiptPendingText: 'Recebi seu comprovante amor! Vou conferir rapidinho aqui e já te libero 💕',
  receiptMissingMediaText: 'Pode me mandar a foto ou PDF do comprovante aqui amor? Assim que enviar eu já libero o acesso! 💕',
  audioOverrides: {}
};

function ensureDirs() {
  if (!fs.existsSync(BOT_CONFIG_DIR)) fs.mkdirSync(BOT_CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(BOT_DATA_DIR)) fs.mkdirSync(BOT_DATA_DIR, { recursive: true });
}

/**
 * Grava JSON de forma atômica via arquivo temporário.
 * @param {string} targetPath
 * @param {object} data
 */
function writeJsonAtomic(targetPath, data) {
  ensureDirs();
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

/**
 * Normaliza lista de telefones mantendo apenas dígitos DDI+DDD+Número.
 * @param {Array<string>|string} rawList
 * @returns {Array<string>}
 */
function normalizeNumberList(rawList) {
  const arr = Array.isArray(rawList)
    ? rawList
    : String(rawList || '').split(/[\n,;]+/);
  const cleaned = arr
    .map((item) => {
      const s = String(item || '').trim();
      if (!s) return '';
      if (s.endsWith('@lid')) return s;
      return s.replace(/@.*$/, '').replace(/\D/g, '');
    })
    .filter((n) => n.length >= 8);
  return Array.from(new Set(cleaned));
}

function loadBotConfig() {
  ensureDirs();
  try {
    if (fs.existsSync(BOT_CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(BOT_CONFIG_FILE, 'utf8'));
      const merged = { ...DEFAULT_BOT_CONFIG, ...parsed };
      merged.pilotNumbers = normalizeNumberList(merged.pilotNumbers);
      merged.adminNumbers = normalizeNumberList(merged.adminNumbers);
      merged.audioOverrides = merged.audioOverrides && typeof merged.audioOverrides === 'object'
        ? merged.audioOverrides
        : {};
      return merged;
    }
  } catch (err) {
    console.error('[BotStore] Erro ao ler bot-config.json:', err.message);
  }
  const initial = { ...DEFAULT_BOT_CONFIG };
  writeJsonAtomic(BOT_CONFIG_FILE, initial);
  return initial;
}

function saveBotConfig(patch) {
  const current = loadBotConfig();
  const merged = {
    ...current,
    ...patch
  };

  merged.mode = ['off', 'pilot', 'production'].includes(merged.mode) ? merged.mode : 'pilot';
  merged.enabled = merged.mode !== 'off';
  merged.pollingEnabled = merged.pollingEnabled !== false;
  merged.pollIntervalMs = Math.max(2500, Math.min(30000, Number(merged.pollIntervalMs) || 5000));
  merged.backlogMaxMinutes = Math.max(5, Math.min(1440, Number(merged.backlogMaxMinutes) || 60));
  merged.backlogDelayMinMs = Math.max(1000, Math.min(120000, Number(merged.backlogDelayMinMs) || 12000));
  merged.backlogDelayMaxMs = Math.max(merged.backlogDelayMinMs, Math.min(180000, Number(merged.backlogDelayMaxMs) || 25000));
  merged.batchPauseEvery = Math.max(1, Math.min(50, Number(merged.batchPauseEvery) || 8));
  merged.batchPauseMs = Math.max(5000, Math.min(600000, Number(merged.batchPauseMs) || 90000));
  merged.evolutionUrl = String(merged.evolutionUrl || DEFAULT_BOT_CONFIG.evolutionUrl).trim().replace(/\/+$/, '');
  const incomingKey = typeof patch.evolutionKey === 'string' ? patch.evolutionKey.trim() : '';
  merged.evolutionKey = incomingKey || current.evolutionKey || DEFAULT_BOT_CONFIG.evolutionKey;
  merged.evolutionInstance = String(merged.evolutionInstance || DEFAULT_BOT_CONFIG.evolutionInstance).trim();
  merged.webhookUrl = String(merged.webhookUrl || DEFAULT_BOT_CONFIG.webhookUrl).trim();
  merged.pilotNumbers = normalizeNumberList(merged.pilotNumbers);
  merged.adminNumbers = normalizeNumberList(merged.adminNumbers);
  merged.debounceMs = Math.max(1000, Math.min(20000, Number(merged.debounceMs) || 5000));
  merged.recMinMs = Math.max(800, Math.min(10000, Number(merged.recMinMs) || 2200));
  merged.recMaxMs = Math.max(merged.recMinMs, Math.min(15000, Number(merged.recMaxMs) || 6500));
  merged.humanPauseHours = Math.max(1, Math.min(720, Number(merged.humanPauseHours) || 24));
  merged.followUp1Minutes = Math.max(1, Math.min(1440, Number(merged.followUp1Minutes) || 15));
  merged.followUp2Minutes = Math.max(merged.followUp1Minutes + 5, Math.min(4320, Number(merged.followUp2Minutes) || 120));
  merged.pixKey = String(merged.pixKey || DEFAULT_BOT_CONFIG.pixKey).trim();
  merged.pixKeyType = ['cpf', 'cnpj', 'phone', 'email', 'random'].includes(merged.pixKeyType)
    ? merged.pixKeyType
    : 'cpf';
  merged.pixHolder = String(merged.pixHolder || DEFAULT_BOT_CONFIG.pixHolder).trim();

  writeJsonAtomic(BOT_CONFIG_FILE, merged);
  return merged;
}

function createEmptyState() {
  return {
    version: 1,
    lidAliases: {},
    processedMsgIds: [],
    botSentIds: [],
    leads: {},
    stats: {
      totalInbound: 0,
      totalAudiosSent: 0,
      totalPixSent: 0,
      blockedRepeats: 0
    }
  };
}

let STATE_CACHE = null;

function loadBotState() {
  if (STATE_CACHE) return STATE_CACHE;
  ensureDirs();
  try {
    if (fs.existsSync(BOT_STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(BOT_STATE_FILE, 'utf8'));
      STATE_CACHE = {
        ...createEmptyState(),
        ...parsed,
        lidAliases: parsed.lidAliases || {},
        processedMsgIds: Array.isArray(parsed.processedMsgIds) ? parsed.processedMsgIds : [],
        botSentIds: Array.isArray(parsed.botSentIds) ? parsed.botSentIds : [],
        leads: parsed.leads || {},
        stats: { ...createEmptyState().stats, ...(parsed.stats || {}) }
      };
      return STATE_CACHE;
    }
  } catch (err) {
    console.error('[BotStore] Erro ao ler bot-state.json:', err.message);
  }
  STATE_CACHE = createEmptyState();
  writeJsonAtomic(BOT_STATE_FILE, STATE_CACHE);
  return STATE_CACHE;
}

function persistBotState() {
  const st = loadBotState();
  // Mantém apenas últimos 2000 IDs deduplicados para não crescer infinito
  if (st.processedMsgIds.length > 2000) {
    st.processedMsgIds = st.processedMsgIds.slice(-2000);
  }
  if (st.botSentIds.length > 2000) {
    st.botSentIds = st.botSentIds.slice(-2000);
  }
  writeJsonAtomic(BOT_STATE_FILE, st);
  return st;
}

/**
 * Resolve chave canônica única por pessoa (mesmo quando WhatsApp alterna @lid e @s.whatsapp.net).
 * @param {string} remoteJid
 * @param {string} remoteJidAlt
 * @returns {{ leadKey: string, replyJid: string, phoneDigits: string, lidJid: string|null }}
 */
function resolveCanonicalLead(remoteJid, remoteJidAlt) {
  const st = loadBotState();
  const rJid = String(remoteJid || '').trim();
  const altJid = String(remoteJidAlt || '').trim();

  const extractPhone = (jid) => {
    if (!jid || jid.endsWith('@lid') || jid.endsWith('@g.us')) return '';
    return jid.replace(/@.*$/, '').replace(/\D/g, '');
  };

  let phoneDigits = extractPhone(altJid) || extractPhone(rJid);
  const lidJid = rJid.endsWith('@lid') ? rJid : (altJid.endsWith('@lid') ? altJid : null);

  // Se veio apenas @lid mas já conhecemos o telefone dele antes, unifica no mesmo leadKey!
  if (!phoneDigits && lidJid && st.lidAliases[lidJid]) {
    phoneDigits = st.lidAliases[lidJid];
  }

  // Normaliza dígitos BR (ex: 5541998818471 / 554198818471 mantêm o que já existe se bater últimos 8 dígitos com mesmo DDD?)
  let leadKey = phoneDigits || lidJid || rJid;
  if (phoneDigits && lidJid && st.lidAliases[lidJid] !== phoneDigits) {
    st.lidAliases[lidJid] = phoneDigits;
    // Se já existia estado salvo somente sob o lidJid antes de sabermos o phoneDigits, migra!
    if (st.leads[lidJid] && !st.leads[phoneDigits]) {
      st.leads[phoneDigits] = {
        ...st.leads[lidJid],
        leadKey: phoneDigits,
        lidJid
      };
      delete st.leads[lidJid];
    }
    persistBotState();
  }

  // Para responder na Evolution API sem duplicar thread: usa exatamente o remoteJid original (@lid ou @s.whatsapp.net)
  const replyJid = rJid || altJid || (phoneDigits ? `${phoneDigits}@s.whatsapp.net` : '');

  return { leadKey, replyJid, phoneDigits, lidJid };
}

function getOrCreateLead(leadKey, meta = {}) {
  const st = loadBotState();
  if (!st.leads[leadKey]) {
    st.leads[leadKey] = {
      leadKey,
      replyJid: meta.replyJid || leadKey,
      phoneDigits: meta.phoneDigits || '',
      lidJid: meta.lidJid || null,
      pushName: meta.pushName || '',
      stage: 'NEW',
      sentAudios: [],
      sentTexts: [],
      sentPrevia: false,
      followUpSent: [],
      paused: false,
      pauseReason: '',
      pausedUntil: null,
      hydratedFromHistory: false,
      needsHumanReview: false,
      lastInboundAt: null,
      lastOutboundBotAt: null,
      lastHumanAt: null,
      messagesCount: 0,
      history: []
    };
  }
  const lead = st.leads[leadKey];
  if (meta.replyJid) lead.replyJid = meta.replyJid;
  if (meta.phoneDigits) lead.phoneDigits = meta.phoneDigits;
  if (meta.lidJid) lead.lidJid = meta.lidJid;
  if (meta.pushName && !lead.pushName) lead.pushName = meta.pushName;
  return lead;
}

function appendLeadHistory(lead, role, summary) {
  lead.history = Array.isArray(lead.history) ? lead.history : [];
  lead.history.push({
    at: Date.now(),
    role,
    summary: String(summary || '').slice(0, 220)
  });
  if (lead.history.length > 20) {
    lead.history = lead.history.slice(-20);
  }
}

function markAudioSent(leadKey, audioId) {
  const st = loadBotState();
  const lead = getOrCreateLead(leadKey);
  if (!lead.sentAudios.includes(audioId)) {
    lead.sentAudios.push(audioId);
    st.stats.totalAudiosSent = (st.stats.totalAudiosSent || 0) + 1;
    persistBotState();
    return true;
  }
  return false;
}

function markTextSent(leadKey, textKey) {
  const st = loadBotState();
  const lead = getOrCreateLead(leadKey);
  if (textKey && !lead.sentTexts.includes(textKey)) {
    lead.sentTexts.push(textKey);
  }
  if (textKey === 'pix_card') {
    st.stats.totalPixSent = (st.stats.totalPixSent || 0) + 1;
  }
  persistBotState();
}

function markMessageProcessed(msgId) {
  if (!msgId) return false;
  const st = loadBotState();
  if (st.processedMsgIds.includes(msgId)) return false;
  st.processedMsgIds.push(msgId);
  persistBotState();
  return true;
}

function isMessageProcessed(msgId) {
  if (!msgId) return false;
  return loadBotState().processedMsgIds.includes(msgId);
}

function unmarkMessageProcessed(msgIds = []) {
  const arr = Array.isArray(msgIds) ? msgIds : [msgIds];
  if (!arr.length) return;
  const set = new Set(arr.filter(Boolean));
  if (!set.size) return;
  const st = loadBotState();
  st.processedMsgIds = st.processedMsgIds.filter((id) => !set.has(id));
  persistBotState();
}

function addBotSentId(msgId) {
  if (!msgId) return;
  const st = loadBotState();
  if (!st.botSentIds.includes(msgId)) {
    st.botSentIds.push(msgId);
    persistBotState();
  }
}

function isBotSentId(msgId) {
  if (!msgId) return false;
  return loadBotState().botSentIds.includes(msgId);
}

function resetLeadState(leadKey) {
  const st = loadBotState();
  if (st.leads[leadKey]) {
    delete st.leads[leadKey];
    persistBotState();
    return true;
  }
  return false;
}

function setLeadPaused(leadKey, paused, reason = '') {
  const lead = getOrCreateLead(leadKey);
  lead.paused = Boolean(paused);
  lead.pauseReason = paused ? (reason || 'Pausado manualmente') : '';
  lead.pausedUntil = null;
  if (!paused) lead.needsHumanReview = false;
  persistBotState();
  return lead;
}

function listLeadsSummary() {
  const st = loadBotState();
  return Object.values(st.leads)
    .sort((a, b) => (b.lastInboundAt || 0) - (a.lastInboundAt || 0))
    .slice(0, 120);
}

module.exports = {
  BOT_CONFIG_FILE,
  BOT_STATE_FILE,
  DEFAULT_BOT_CONFIG,
  normalizeNumberList,
  loadBotConfig,
  saveBotConfig,
  loadBotState,
  persistBotState,
  resolveCanonicalLead,
  getOrCreateLead,
  appendLeadHistory,
  markAudioSent,
  markTextSent,
  markMessageProcessed,
  unmarkMessageProcessed,
  isMessageProcessed,
  addBotSentId,
  isBotSentId,
  resetLeadState,
  setLeadPaused,
  listLeadsSummary
};
