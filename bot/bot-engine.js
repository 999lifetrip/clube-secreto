const { loadAudioCatalog, getAudioById } = require('./audios-manifest');
const store = require('./bot-store');
const evo = require('./evolution-client');
const { planTurnActions } = require('./bot-flows');

const PENDING_DEBOUNCE = new Map();
const IN_FLIGHT_CHAINS = new Map();
let GLOBAL_OUTBOUND_CHAIN = Promise.resolve();
const BOT_LOGS = [];
let FOLLOWUP_TIMER = null;
let POLL_TIMER = null;
let POLL_IN_PROGRESS = false;

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
    msg.interactiveMessage?.body?.text ||
    msg.interactiveMessage?.contextInfo?.externalAdReply?.greetingMessageBody ||
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
 * Serializa execução assíncrona por lead e em fila global calma para evitar rajada no WhatsApp.
 */
function enqueueLeadWork(leadKey, fn) {
  const leadPrev = IN_FLIGHT_CHAINS.get(leadKey) || Promise.resolve();
  const next = leadPrev.then(() => {
    const gPrev = GLOBAL_OUTBOUND_CHAIN;
    const job = gPrev.then(fn, fn).then(async (res) => {
      await evo.sleep(1600);
      return res;
    });
    GLOBAL_OUTBOUND_CHAIN = job.catch(() => {});
    return job;
  }, () => fn());

  IN_FLIGHT_CHAINS.set(leadKey, next);
  next.finally(() => {
    if (IN_FLIGHT_CHAINS.get(leadKey) === next) {
      IN_FLIGHT_CHAINS.delete(leadKey);
    }
  });
  return next;
}

/**
 * Executa as ações planejadas (áudios PTT, prévia viewOnce, textos, PIX) contra Evolution API,
 * marcando cada áudio enviado imediatamente para nunca repetir.
 */
async function executePlannedActions({ leadKey, replyJid, actions, nextStage, pauseAfterTurn, needsHumanReview, cfg }) {
  const lead = store.getOrCreateLead(leadKey, { replyJid });
  let okCount = 0;
  let failCount = 0;

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
        okCount++;
        store.markAudioSent(leadKey, act.audioId);
        store.appendLeadHistory(lead, 'bot_audio', `🎙️ ${aud.title} (${aud.durationSec}s)`);
        addBotLog('info', `Áudio PTT enviado: ${aud.title}`, { leadKey, durationSec: aud.durationSec });
      } else {
        failCount++;
        addBotLog('error', `Falha ao enviar áudio ${act.audioId}`, { leadKey, status: res.status, raw: res.raw || res.error });
      }
      await evo.sleep(650);
    } else if (act.type === 'preview_image') {
      if (lead.sentPrevia) continue;
      const res = await evo.sendPreviewImage(cfg, replyJid, act.filePath, act.caption || '', act.viewOnce !== false);
      if (res.ok) {
        okCount++;
        lead.sentPrevia = true;
        store.persistBotState();
        store.appendLeadHistory(lead, 'bot_preview', res.usedViewOnce ? '🖼️ Prévia visualização única' : '🖼️ Prévia foto');
        addBotLog('info', res.usedViewOnce ? 'Prévia viewOnce enviada (1x)' : 'Prévia foto enviada (1x)', { leadKey });
      } else {
        failCount++;
        addBotLog('error', 'Falha ao enviar foto prévia', { leadKey, status: res.status, raw: res.raw || res.error });
      }
      await evo.sleep(600);
    } else if (act.type === 'text') {
      const res = await evo.sendText(cfg, replyJid, act.text, true);
      if (res.ok) {
        okCount++;
        store.markTextSent(leadKey, act.key);
        store.appendLeadHistory(lead, 'bot_text', act.text);
        addBotLog('info', `Texto enviado [${act.key}]`, { leadKey });
      } else {
        failCount++;
        addBotLog('error', `Falha ao enviar texto [${act.key}]`, { leadKey, status: res.status, raw: res.raw || res.error });
      }
      await evo.sleep(500);
    } else if (act.type === 'pix') {
      const res = await evo.sendPixPayment(cfg, replyJid);
      if (res.ok) {
        okCount++;
        store.markTextSent(leadKey, 'pix_card');
        store.appendLeadHistory(lead, 'bot_pix', res.usedFallback ? '💠 Chave PIX (Texto)' : '💠 Cartão PIX Nativo');
        addBotLog('info', res.usedFallback ? 'PIX enviado via texto fallback' : 'Cartão PIX nativo enviado', { leadKey });
      } else {
        failCount++;
        addBotLog('error', 'Falha ao enviar PIX', { leadKey, status: res.status, raw: res.raw || res.error });
      }
      await evo.sleep(500);
    } else if (act.type === 'video' && act.url) {
      const res = await evo.sendMediaUrl(cfg, replyJid, act.url, 'video', act.caption || '');
      if (res.ok) {
        okCount++;
        store.appendLeadHistory(lead, 'bot_video', act.url);
        addBotLog('info', 'Vídeo prévia enviado', { leadKey });
      } else {
        failCount++;
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
  return { okCount, failCount };
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
  const isAdmin =
    phoneMatchesList(candidate, cfg.adminNumbers) ||
    (canonical.lidJid && phoneMatchesList(canonical.lidJid, cfg.adminNumbers));
  const isPilot =
    phoneMatchesList(candidate, cfg.pilotNumbers) ||
    (canonical.lidJid && cfg.pilotNumbers.includes(canonical.lidJid));
  // Em produção: nunca responde números administrativos internos (ex: Rique/equipe), a menos que estejam na whitelist de teste
  if (isAdmin && !isPilot) {
    return false;
  }
  return true;
}

/**
 * Hidrata o estado de um chat desconhecido direto do histórico da Evolution API
 * para nunca repetir áudios já enviados e respeitar conversas manuais (X1/pessoal).
 */
async function hydrateLeadFromEvolution(cfg, remoteJid, lead, canonical) {
  if (lead.hydratedFromHistory || !cfg.evolutionKey) return true;
  const msgRes = await evo.findMessages(cfg, remoteJid, 20);
  if (!msgRes.ok) {
    addBotLog('warn', `Não foi possível ler histórico de ${remoteJid}; pulando por segurança`, { status: msgRes.status });
    return false;
  }

  const records = Array.isArray(msgRes.data?.messages?.records)
    ? msgRes.data.messages.records
    : (Array.isArray(msgRes.data) ? msgRes.data : []);

  const manualFromMe = records.filter((r) => r?.key?.fromMe === true && !evo.wasSentByBot(r?.key?.id));
  if (manualFromMe.length > 0) {
    for (const r of manualFromMe) {
      const m = r.message || {};
      const t = String(m.conversation || m.extendedTextMessage?.text || '');
      if (t.includes('TABELA DE PREÇOS') && !lead.sentTexts.includes('price_table')) {
        lead.sentTexts.push('price_table');
        if (lead.stage === 'NEW') lead.stage = 'PRICING_SENT';
      }
      if (m.interactiveMessage?.nativeFlowMessage?.buttons?.some((b) => b.name === 'payment_info') || t.includes(cfg.pixKey)) {
        if (!lead.sentTexts.includes('pix_card')) lead.sentTexts.push('pix_card');
        lead.stage = 'PIX_SENT';
      }
      if (m.imageMessage?.viewOnce) lead.sentPrevia = true;
      const sec = Number(m.audioMessage?.seconds || 0);
      if (sec === 6 && !lead.sentAudios.includes('ask_interest_pack')) lead.sentAudios.push('ask_interest_pack');
      if (sec === 3 && !lead.sentAudios.includes('how_are_you')) lead.sentAudios.push('how_are_you');
      if ((sec === 10 || sec === 11) && !lead.sentAudios.includes('greeting_save')) lead.sentAudios.push('greeting_save');
    }
    const pauseHours = Number(cfg.humanPauseHours) || 24;
    lead.paused = true;
    lead.pauseReason = 'Conversa manual prévia (X1)';
    lead.pausedUntil = Date.now() + pauseHours * 3600 * 1000;
    lead.hydratedFromHistory = true;
    store.persistBotState();
    addBotLog('info', 'Chat já tinha atendimento manual — pausado automaticamente', { leadKey: canonical.leadKey });
    return false;
  }

  lead.hydratedFromHistory = true;
  store.persistBotState();
  return true;
}

/**
 * Ponto de entrada principal para webhooks e eventos do poller Evolution.
 */
async function handleIncomingWebhook(payload, opts = {}) {
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

  if (cfg.mode === 'off' || !cfg.enabled) {
    return { handled: false, reason: 'mode_off' };
  }
  if (cfg.mode === 'pilot' && !isLeadAllowedByMode(canonical, cfg)) {
    return { handled: false, reason: 'mode_pilot_filtered', leadKey: canonical.leadKey };
  }

  // Intervenção humana / Echo das mensagens do próprio bot
  if (parsed.fromMe) {
    if (parsed.msgId && evo.wasSentByBot(parsed.msgId)) {
      return { handled: true, reason: 'own_bot_echo' };
    }

    const txtLower = parsed.text.toLowerCase().trim();
    const lead = store.getOrCreateLead(canonical.leadKey, canonical);
    lead.hydratedFromHistory = true;

    // Se o próprio bot respondeu a menos de 12s e Evolution devolveu echo sem key.id conhecido, não pausa o lead
    if (
      lead.lastOutboundBotAt &&
      (Date.now() - lead.lastOutboundBotAt) < 12000 &&
      (
        parsed.text.includes('TABELA DE PREÇOS') ||
        parsed.text.includes(cfg.postPixText) ||
        parsed.text === cfg.greetingText ||
        (parsed.hasAudio && !parsed.text)
      )
    ) {
      return { handled: true, reason: 'own_bot_recent_echo' };
    }

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

  if (!lead.hydratedFromHistory && opts.hydrateHistory !== false) {
    const canAutoAttend = await hydrateLeadFromEvolution(cfg, parsed.remoteJid, lead, canonical);
    if (!canAutoAttend) {
      return { handled: false, reason: 'hydrated_manual_paused', leadKey: canonical.leadKey };
    }
  }

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

  const delayMs = opts.immediate ? 50 : (Number(cfg.debounceMs) || 5000);

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
  }, delayMs);

  return {
    handled: true,
    queued: true,
    leadKey: canonical.leadKey,
    debounceMs: delayMs
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
      } else if (act.type === 'preview_image') {
        baseLead.sentPrevia = true;
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

/**
 * Polling ativo na Evolution API: dispensa redeploy/webhook e também zera fila de leads esperando.
 */
async function runPollTick() {
  if (POLL_IN_PROGRESS) return { skipped: true };
  const cfg = store.loadBotConfig();
  if (!cfg.enabled || cfg.mode === 'off' || cfg.pollingEnabled === false || !cfg.evolutionKey) {
    return { skipped: true };
  }

  POLL_IN_PROGRESS = true;
  let queuedCount = 0;
  try {
    const res = await evo.findChats(cfg);
    if (!res.ok || !Array.isArray(res.data)) {
      return { ok: false, status: res.status };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = (Number(cfg.backlogMaxMinutes) || 180) * 60;

    // Mais recentes primeiro para priorizar quem acabou de mandar mensagem
    const candidates = res.data
      .filter((c) => c?.lastMessage?.key?.remoteJid)
      .filter((c) => {
        const jid = String(c.lastMessage.key.remoteJid);
        if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return false;
        const ts = Number(c.lastMessage.messageTimestamp || 0);
        return ts > 0 && (nowSec - ts) <= maxAgeSec;
      })
      .sort((a, b) => Number(b.lastMessage.messageTimestamp || 0) - Number(a.lastMessage.messageTimestamp || 0));

    for (const chat of candidates) {
      const lm = chat.lastMessage;
      const msgId = String(lm.key?.id || '');
      if (msgId && store.isMessageProcessed(msgId)) continue;

      const ts = Number(lm.messageTimestamp || 0);
      const ageSec = nowSec - ts;
      const syntheticPayload = {
        event: 'messages.upsert',
        data: {
          ...lm,
          pushName: lm.pushName || chat.pushName || ''
        }
      };

      const out = await handleIncomingWebhook(syntheticPayload, {
        hydrateHistory: true,
        immediate: ageSec > 18
      });

      if (out?.queued) queuedCount++;
    }
    return { ok: true, queuedCount };
  } catch (err) {
    addBotLog('error', 'Erro no polling Evolution', { err: err.message });
    return { ok: false, error: err.message };
  } finally {
    POLL_IN_PROGRESS = false;
  }
}

function startBotEngine() {
  loadAudioCatalog();
  const cfg = store.loadBotConfig();

  if (!FOLLOWUP_TIMER) {
    FOLLOWUP_TIMER = setInterval(() => {
      runFollowUpTick().catch((err) => addBotLog('error', 'Erro no agendador de follow-up', { err: err.message }));
    }, 60 * 1000);
    if (typeof FOLLOWUP_TIMER.unref === 'function') FOLLOWUP_TIMER.unref();
  }

  if (!POLL_TIMER) {
    const intervalMs = Math.max(3000, Number(cfg.pollIntervalMs) || 4500);
    POLL_TIMER = setInterval(() => {
      runPollTick().catch(() => {});
    }, intervalMs);
    if (typeof POLL_TIMER.unref === 'function') POLL_TIMER.unref();

    // Primeira varredura 2.5s após subir o servidor
    setTimeout(() => {
      runPollTick().catch(() => {});
    }, 2500).unref();
  }

  addBotLog('info', `Bot WhatsApp inicializado (modo: ${cfg.mode}, polling: ${cfg.pollingEnabled !== false}, instância: ${cfg.evolutionInstance})`);
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
  runPollTick,
  getLogs
};
