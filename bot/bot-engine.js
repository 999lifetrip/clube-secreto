const { loadAudioCatalog, getAudioById } = require('./audios-manifest');
const store = require('./bot-store');
const evo = require('./evolution-client');
const { planTurnActions } = require('./bot-flows');

const PENDING_DEBOUNCE = new Map();
const IN_FLIGHT_CHAINS = new Map();
const BOT_LOGS = [];
let FOLLOWUP_TIMER = null;

function addBotLog(level, msg, extra = null) {
  const entry = {
    at: new Date().toISOString(),
    level,
    msg,
    extra
  };
  BOT_LOGS.unshift(entry);
  if (BOT_LOGS.length > 150) BOT_LOGS.pop();
  const prefix = `[WhatsAppBot:${level.toUpperCase()}]`;
  if (level === 'error') console.error(prefix, msg, extra || '');
  else console.log(prefix, msg, extra ? JSON.stringify(extra) : '');
}

/**
 * Compara telefones tolerando variação do 9º dígito BR e prefixo 55.
 * @param {string} target
 * @param {Array<string>} list
 */
function phoneMatchesList(target, list = []) {
  const cleanTarget = String(target || '').replace(/@.*$/, '').replace(/\D/g, '');
  if (!cleanTarget && !target) return false;

  const rawTarget = String(target || '').trim();
  for (const item of list) {
    const rawItem = String(item || '').trim();
    if (!rawItem) continue;
    if (rawItem === rawTarget) return true;
    const cleanItem = rawItem.replace(/@.*$/, '').replace(/\D/g, '');
    if (!cleanItem || !cleanTarget) continue;
    if (cleanItem === cleanTarget) return true;
    // Mesmo DDD + últimos 8 dígitos (cobre 554198818471 == 5541998818471 == 4198818471)
    if (cleanTarget.length >= 10 && cleanItem.length >= 10) {
      const tTail = cleanTarget.slice(-8);
      const iTail = cleanItem.slice(-8);
      const tDdd = cleanTarget.replace(/^55/, '').slice(0, 2);
      const iDdd = cleanItem.replace(/^55/, '').slice(0, 2);
      if (tTail === iTail && tDdd === iDdd) return true;
    }
  }
  return false;
}

/**
 * Normaliza eventos de webhook recebidos da Evolution API v2.3.7.
 */
function parseEvolutionWebhook(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const eventRaw = String(payload.event || '').toLowerCase();
  if (eventRaw && !eventRaw.includes('messages.upsert') && !eventRaw.includes('messages_upsert')) {
    return null;
  }

  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const key = data.key || {};
  const remoteJid = String(key.remoteJid || data.remoteJid || '').trim();
  const remoteJidAlt = String(key.remoteJidAlt || data.remoteJidAlt || '').trim();

  if (!remoteJid) return null;
  if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter')) {
    return { ignoredReason: 'group_or_status', remoteJid };
  }

  const msg = data.message || {};
  const msgType = String(data.messageType || '').toLowerCase();
  const docMsg = msg.documentMessage || msg.documentWithCaptionMessage?.message?.documentMessage;

  const text = String(
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    docMsg?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    ''
  ).trim();

  const hasImage = Boolean(msg.imageMessage || msgType.includes('image'));
  const hasDocument = Boolean(docMsg || msgType.includes('document'));
  const hasAudio = Boolean(msg.audioMessage || msgType.includes('audio'));
  const hasSticker = Boolean(msg.stickerMessage || msgType.includes('sticker'));
  const hasVideo = Boolean(msg.videoMessage || msgType.includes('video'));

  return {
    msgId: String(key.id || ''),
    fromMe: Boolean(key.fromMe === true),
    remoteJid,
    remoteJidAlt,
    pushName: String(data.pushName || '').trim(),
    text,
    hasImage,
    hasDocument,
    hasAudio,
    hasSticker,
    hasVideo
  };
}

/**
 * Serializa execução assíncrona por lead para impedir envios simultâneos/duplicados.
 */
function enqueueLeadWork(leadKey, fn) {
  const prev = IN_FLIGHT_CHAINS.get(leadKey) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (IN_FLIGHT_CHAINS.get(leadKey) === next) {
      IN_FLIGHT_CHAINS.delete(leadKey);
    }
  });
  IN_FLIGHT_CHAINS.set(leadKey, next);
  return next;
}

/**
 * Executa as ações planejadas (áudios PTT, textos, PIX) contra Evolution API,
 * marcando cada áudio enviado imediatamente para nunca repetir.
 */
async function executePlannedActions({ leadKey, replyJid, actions, nextStage, pauseAfterTurn, needsHumanReview, cfg }) {
  const lead = store.getOrCreateLead(leadKey, { replyJid });

  for (const act of actions) {
    if (act.type === 'audio') {
      if (lead.sentAudios.includes(act.audioId)) {
        const st = store.loadBotState();
        st.stats.blockedRepeats = (st.stats.blockedRepeats || 0) + 1;
        store.persistBotState();
        addBotLog('info', `Bloqueado reenvio repetido do áudio ${act.audioId}`, { leadKey });
        continue;
      }

      const aud = getAudioById(act.audioId);
      if (!aud || !aud.exists || !aud.base64) {
        addBotLog('error', `Áudio ausente no disco: ${act.audioId}`, { leadKey });
        continue;
      }

      const res = await evo.sendWhatsAppAudio(cfg, replyJid, aud.base64, aud.durationSec);
      if (res.ok) {
        store.markAudioSent(leadKey, act.audioId);
        store.appendLeadHistory(lead, 'bot_audio', `🎙️ ${aud.title} (${aud.durationSec}s)`);
        addBotLog('info', `Áudio PTT enviado: ${aud.title}`, { leadKey, durationSec: aud.durationSec });
      } else {
        addBotLog('error', `Falha ao enviar áudio ${act.audioId}`, { leadKey, status: res.status, raw: res.raw || res.error });
      }
      await evo.sleep(650);
    } else if (act.type === 'text') {
      const res = await evo.sendText(cfg, replyJid, act.text, true);
      if (res.ok) {
        store.markTextSent(leadKey, act.key);
        store.appendLeadHistory(lead, 'bot_text', act.text);
        addBotLog('info', `Texto enviado [${act.key}]`, { leadKey });
      } else {
        addBotLog('error', `Falha ao enviar texto [${act.key}]`, { leadKey, status: res.status, raw: res.raw || res.error });
      }
      await evo.sleep(500);
    } else if (act.type === 'pix') {
      const res = await evo.sendPixPayment(cfg, replyJid);
      if (res.ok) {
        store.markTextSent(leadKey, 'pix_card');
        store.appendLeadHistory(lead, 'bot_pix', res.usedFallback ? '💠 Chave PIX (Texto)' : '💠 Cartão PIX Nativo');
        addBotLog('info', res.usedFallback ? 'PIX enviado via texto fallback' : 'Cartão PIX nativo enviado', { leadKey });
      } else {
        addBotLog('error', 'Falha ao enviar PIX', { leadKey, status: res.status, raw: res.raw || res.error });
      }
      await evo.sleep(500);
    } else if (act.type === 'video' && act.url) {
      const res = await evo.sendMediaUrl(cfg, replyJid, act.url, 'video', act.caption || '');
      if (res.ok) {
        store.appendLeadHistory(lead, 'bot_video', act.url);
        addBotLog('info', 'Vídeo prévia enviado', { leadKey });
      } else {
        addBotLog('error', 'Falha ao enviar vídeo prévia', { leadKey, status: res.status });
      }
      await evo.sleep(500);
    }
  }

  lead.stage = nextStage;
  lead.lastOutboundBotAt = Date.now();
  if (pauseAfterTurn) {
    lead.paused = true;
    lead.pauseReason = 'Comprovante enviado — aguardando conferência';
    lead.pausedUntil = null;
  }
  if (needsHumanReview) {
    lead.needsHumanReview = true;
  }
  store.persistBotState();
}

/**
 * Processa o pacote consolidado de mensagens após o debounce anti-rajada.
 */
function flushLeadBuffer(leadKey) {
  const bucket = PENDING_DEBOUNCE.get(leadKey);
  if (!bucket) return;
  PENDING_DEBOUNCE.delete(leadKey);

  return enqueueLeadWork(leadKey, async () => {
    const cfg = store.loadBotConfig();
    if (!cfg.enabled || cfg.mode === 'off') return;

    const lead = store.getOrCreateLead(leadKey, { replyJid: bucket.replyJid });
    if (lead.paused) return;

    const combinedText = bucket.msgs.map((m) => m.text).filter(Boolean).join(' ').trim();
    const msgMeta = {
      hasImage: bucket.msgs.some((m) => m.hasImage),
      hasDocument: bucket.msgs.some((m) => m.hasDocument),
      hasAudio: bucket.msgs.some((m) => m.hasAudio),
      hasSticker: bucket.msgs.some((m) => m.hasSticker),
      hasVideo: bucket.msgs.some((m) => m.hasVideo)
    };

    // Se o lead mandou apenas um áudio sem legenda na primeira abordagem, trata como saudação natural
    const effectiveText = combinedText || (msgMeta.hasAudio ? 'oi tudo bem como funciona' : 'oi');

    lead.messagesCount = (lead.messagesCount || 0) + bucket.msgs.length;
    store.appendLeadHistory(lead, 'lead', effectiveText || (msgMeta.hasImage ? '[Imagem enviada]' : '[Mídia]'));
    store.persistBotState();

    const plan = planTurnActions({
      leadState: lead,
      combinedText: effectiveText,
      msgMeta,
      cfg
    });

    if (!plan.actions.length) return;

    await executePlannedActions({
      leadKey,
      replyJid: lead.replyJid || bucket.replyJid,
      actions: plan.actions,
      nextStage: plan.nextStage,
      pauseAfterTurn: plan.pauseAfterTurn,
      needsHumanReview: plan.needsHumanReview,
      cfg
    });
  });
}

/**
 * Verifica se o lead está elegível no modo atual ('pilot' vs 'production').
 */
function isLeadAllowedByMode(canonical, cfg) {
  if (!cfg.enabled || cfg.mode === 'off') return false;
  const candidate = canonical.phoneDigits || canonical.leadKey;
  if (cfg.mode === 'pilot') {
    return phoneMatchesList(candidate, cfg.pilotNumbers) || (canonical.lidJid && cfg.pilotNumbers.includes(canonical.lidJid));
  }
  // Em produção: nunca responde números administrativos internos (ex: Rique/equipe), a menos que estejam na whitelist de teste
  if (phoneMatchesList(candidate, cfg.adminNumbers) && !phoneMatchesList(candidate, cfg.pilotNumbers)) {
    return false;
  }
  return true;
}

/**
 * Ponto de entrada principal para webhooks recebidos em /api/bot/webhook.
 */
async function handleIncomingWebhook(payload) {
  const parsed = parseEvolutionWebhook(payload);
  if (!parsed) return { handled: false, reason: 'ignored_event' };
  if (parsed.ignoredReason) return { handled: false, reason: parsed.ignoredReason };

  if (parsed.msgId && store.isMessageProcessed(parsed.msgId)) {
    return { handled: false, reason: 'duplicate_msg' };
  }
  if (parsed.msgId) {
    store.markMessageProcessed(parsed.msgId);
  }

  const canonical = store.resolveCanonicalLead(parsed.remoteJid, parsed.remoteJidAlt);
  const cfg = store.loadBotConfig();

  // Intervenção humana / Echo das mensagens do próprio bot
  if (parsed.fromMe) {
    if (parsed.msgId && evo.wasSentByBot(parsed.msgId)) {
      return { handled: true, reason: 'own_bot_echo' };
    }

    const txtLower = parsed.text.toLowerCase().trim();
    const lead = store.getOrCreateLead(canonical.leadKey, canonical);

    if (txtLower === '/bot on') {
      store.setLeadPaused(canonical.leadKey, false);
      addBotLog('info', 'Bot reativado manualmente via comando /bot on', { leadKey: canonical.leadKey });
      return { handled: true, reason: 'human_cmd_bot_on' };
    }
    if (txtLower === '/bot reset') {
      store.resetLeadState(canonical.leadKey);
      addBotLog('info', 'Estado do lead resetado via comando /bot reset', { leadKey: canonical.leadKey });
      return { handled: true, reason: 'human_cmd_bot_reset' };
    }

    // Cancelar debounce se humano assumiu no meio da espera
    const pending = PENDING_DEBOUNCE.get(canonical.leadKey);
    if (pending) {
      clearTimeout(pending.timer);
      PENDING_DEBOUNCE.delete(canonical.leadKey);
    }

    const pauseHours = Number(cfg.humanPauseHours) || 24;
    lead.paused = true;
    lead.pauseReason = 'Atendimento humano manual';
    lead.lastHumanAt = Date.now();
    lead.pausedUntil = Date.now() + pauseHours * 3600 * 1000;
    store.appendLeadHistory(lead, 'human', parsed.text || '[Resposta manual]');
    store.persistBotState();
    addBotLog('info', `Atendimento humano detectado — bot pausado por ${pauseHours}h`, { leadKey: canonical.leadKey });
    return { handled: true, reason: 'human_takeover_paused' };
  }

  if (!isLeadAllowedByMode(canonical, cfg)) {
    return { handled: false, reason: `mode_${cfg.mode}_filtered`, leadKey: canonical.leadKey };
  }

  const lead = store.getOrCreateLead(canonical.leadKey, {
    ...canonical,
    pushName: parsed.pushName
  });

  // Auto-retomada se o tempo de pausa humana expirou (exceto quando há comprovante aguardando)
  if (lead.paused && lead.pausedUntil && Date.now() >= lead.pausedUntil && lead.stage !== 'PAYMENT_REVIEW') {
    lead.paused = false;
    lead.pauseReason = '';
    lead.pausedUntil = null;
  }

  lead.lastInboundAt = Date.now();
  const st = store.loadBotState();
  st.stats.totalInbound = (st.stats.totalInbound || 0) + 1;
  store.persistBotState();

  if (lead.paused) {
    return { handled: false, reason: 'lead_paused', leadKey: canonical.leadKey };
  }

  // Buffer anti-rajada (agrupa mensagens em sequência do mesmo lead)
  let bucket = PENDING_DEBOUNCE.get(canonical.leadKey);
  if (bucket) {
    clearTimeout(bucket.timer);
  } else {
    bucket = {
      replyJid: canonical.replyJid,
      msgs: [],
      timer: null
    };
    PENDING_DEBOUNCE.set(canonical.leadKey, bucket);
  }

  bucket.replyJid = canonical.replyJid || bucket.replyJid;
  bucket.msgs.push(parsed);
  bucket.timer = setTimeout(() => {
    flushLeadBuffer(canonical.leadKey);
  }, Number(cfg.debounceMs) || 5000);

  return {
    handled: true,
    queued: true,
    leadKey: canonical.leadKey,
    debounceMs: Number(cfg.debounceMs) || 5000
  };
}

/**
 * Envia follow-up automático (máx 1x cada áudio) para leads parados após tabela/vácuo.
 */
async function runFollowUpTick() {
  const cfg = store.loadBotConfig();
  if (!cfg.enabled || cfg.mode === 'off' || !cfg.followUpEnabled) return;

  const now = Date.now();
  const st = store.loadBotState();
  const fu1Ms = (Number(cfg.followUp1Minutes) || 15) * 60 * 1000;
  const fu2Ms = (Number(cfg.followUp2Minutes) || 120) * 60 * 1000;

  for (const lead of Object.values(st.leads)) {
    if (!lead || lead.paused || lead.stage === 'PAYMENT_REVIEW') continue;
    if (!lead.lastOutboundBotAt || (lead.lastInboundAt && lead.lastInboundAt > lead.lastOutboundBotAt)) continue;
    if (cfg.mode === 'pilot' && !phoneMatchesList(lead.phoneDigits || lead.leadKey, cfg.pilotNumbers)) continue;

    const silentMs = now - lead.lastOutboundBotAt;

    if (
      ['PRICING_SENT', 'PIX_SENT'].includes(lead.stage) &&
      silentMs >= fu1Ms &&
      !lead.followUpSent.includes('followup_table_ghost') &&
      !lead.sentAudios.includes('followup_table_ghost')
    ) {
      await enqueueLeadWork(lead.leadKey, async () => {
        const freshCfg = store.loadBotConfig();
        const freshLead = store.getOrCreateLead(lead.leadKey);
        if (freshLead.paused || freshLead.sentAudios.includes('followup_table_ghost')) return;
        await executePlannedActions({
          leadKey: freshLead.leadKey,
          replyJid: freshLead.replyJid,
          actions: [{ type: 'audio', audioId: 'followup_table_ghost' }],
          nextStage: freshLead.stage,
          pauseAfterTurn: false,
          needsHumanReview: false,
          cfg: freshCfg
        });
        if (freshLead.sentAudios.includes('followup_table_ghost') && !freshLead.followUpSent.includes('followup_table_ghost')) {
          freshLead.followUpSent.push('followup_table_ghost');
          store.persistBotState();
        }
      });
    } else if (
      silentMs >= fu2Ms &&
      !lead.followUpSent.includes('followup_only_views') &&
      !lead.sentAudios.includes('followup_only_views') &&
      (lead.followUpSent.includes('followup_table_ghost') || lead.sentAudios.includes('followup_table_ghost') || lead.stage === 'GREETED')
    ) {
      await enqueueLeadWork(lead.leadKey, async () => {
        const freshCfg = store.loadBotConfig();
        const freshLead = store.getOrCreateLead(lead.leadKey);
        if (freshLead.paused || freshLead.sentAudios.includes('followup_only_views')) return;
        await executePlannedActions({
          leadKey: freshLead.leadKey,
          replyJid: freshLead.replyJid,
          actions: [{ type: 'audio', audioId: 'followup_only_views' }],
          nextStage: freshLead.stage,
          pauseAfterTurn: false,
          needsHumanReview: false,
          cfg: freshCfg
        });
        if (freshLead.sentAudios.includes('followup_only_views') && !freshLead.followUpSent.includes('followup_only_views')) {
          freshLead.followUpSent.push('followup_only_views');
          store.persistBotState();
        }
      });
    }
  }
}

/**
 * Simula um turno localmente (sem enviar para WhatsApp real), útil para validar
 * intenções e a trava anti-repetição dos áudios no Painel Admin e nos testes.
 */
function simulateLeadMessage({ leadKey = 'sim_test_lead', text = 'Oi', hasImage = false, hasDocument = false, commitState = false }) {
  const cfg = store.loadBotConfig();
  const baseLead = commitState
    ? store.getOrCreateLead(leadKey, { phoneDigits: leadKey, replyJid: `${leadKey}@s.whatsapp.net` })
    : {
        leadKey,
        stage: 'NEW',
        sentAudios: [],
        sentTexts: [],
        followUpSent: [],
        messagesCount: 0,
        needsHumanReview: false
      };

  const plan = planTurnActions({
    leadState: baseLead,
    combinedText: text,
    msgMeta: { hasImage, hasDocument },
    cfg
  });

  if (commitState) {
    baseLead.messagesCount = (baseLead.messagesCount || 0) + 1;
    baseLead.lastInboundAt = Date.now();
    for (const act of plan.actions) {
      if (act.type === 'audio' && !baseLead.sentAudios.includes(act.audioId)) {
        baseLead.sentAudios.push(act.audioId);
      } else if ((act.type === 'text' || act.type === 'pix') && act.key && !baseLead.sentTexts.includes(act.key)) {
        baseLead.sentTexts.push(act.key);
      }
    }
    baseLead.stage = plan.nextStage;
    baseLead.needsHumanReview = plan.needsHumanReview;
    store.persistBotState();
  }

  return {
    leadKey,
    stageBefore: commitState ? undefined : baseLead.stage,
    nextStage: plan.nextStage,
    sentAudiosAfter: commitState ? [...baseLead.sentAudios] : plan.actions.filter((a) => a.type === 'audio').map((a) => a.audioId),
    actions: plan.actions.map((a) => {
      if (a.type === 'audio') {
        const meta = getAudioById(a.audioId);
        return { type: 'audio', audioId: a.audioId, title: meta?.title, durationSec: meta?.durationSec };
      }
      if (a.type === 'pix') {
        return { type: 'pix', holder: cfg.pixHolder, key: cfg.pixKey, keyType: cfg.pixKeyType };
      }
      return a;
    })
  };
}

/**
 * Dispara uma mensagem simulada de ponta a ponta contra Evolution API para testar 1 número.
 */
async function sendRealTestTurn(targetNumber, text = 'Oi tudo bem?') {
  const clean = String(targetNumber || '').replace(/\D/g, '');
  if (!clean) throw new Error('Número de teste inválido.');
  const cfg = store.loadBotConfig();
  const replyJid = `${clean}@s.whatsapp.net`;
  const lead = store.getOrCreateLead(clean, { phoneDigits: clean, replyJid });
  const plan = planTurnActions({
    leadState: lead,
    combinedText: text,
    msgMeta: {},
    cfg
  });

  await executePlannedActions({
    leadKey: clean,
    replyJid,
    actions: plan.actions,
    nextStage: plan.nextStage,
    pauseAfterTurn: plan.pauseAfterTurn,
    needsHumanReview: plan.needsHumanReview,
    cfg
  });

  return {
    targetNumber: clean,
    actions: plan.actions,
    lead: store.getOrCreateLead(clean)
  };
}

function startBotEngine() {
  loadAudioCatalog();
  if (!FOLLOWUP_TIMER) {
    FOLLOWUP_TIMER = setInterval(() => {
      runFollowUpTick().catch((err) => addBotLog('error', 'Erro no agendador de follow-up', { err: err.message }));
    }, 60 * 1000);
    if (typeof FOLLOWUP_TIMER.unref === 'function') FOLLOWUP_TIMER.unref();
  }
  const cfg = store.loadBotConfig();
  addBotLog('info', `Bot WhatsApp inicializado (modo: ${cfg.mode}, instância: ${cfg.evolutionInstance})`);
}

function getLogs() {
  return BOT_LOGS.slice(0, 60);
}

module.exports = {
  startBotEngine,
  handleIncomingWebhook,
  parseEvolutionWebhook,
  phoneMatchesList,
  simulateLeadMessage,
  sendRealTestTurn,
  runFollowUpTick,
  getLogs
};
