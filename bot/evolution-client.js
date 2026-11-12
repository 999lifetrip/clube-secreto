const BOT_SENT_MSG_IDS = new Map();
const BOT_SENT_TTL_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerBotMessageId(msgId) {
  if (!msgId) return;
  const now = Date.now();
  BOT_SENT_MSG_IDS.set(String(msgId), now);
  if (BOT_SENT_MSG_IDS.size > 500) {
    for (const [k, ts] of BOT_SENT_MSG_IDS.entries()) {
      if (now - ts > BOT_SENT_TTL_MS) BOT_SENT_MSG_IDS.delete(k);
    }
  }
}

function wasSentByBot(msgId) {
  if (!msgId) return false;
  const ts = BOT_SENT_MSG_IDS.get(String(msgId));
  if (!ts) return false;
  if (Date.now() - ts > BOT_SENT_TTL_MS) {
    BOT_SENT_MSG_IDS.delete(String(msgId));
    return false;
  }
  return true;
}

/**
 * Chamada HTTP genérica para Evolution API v2.
 * @param {object} cfg
 * @param {string} method
 * @param {string} endpointPath
 * @param {object|null} body
 */
async function evoRequest(cfg, method, endpointPath, body = null) {
  const baseUrl = String(cfg.evolutionUrl || '').replace(/\/+$/, '');
  const url = `${baseUrl}${endpointPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': String(cfg.evolutionKey || '')
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) {}

    if (res.ok && json?.key?.id) {
      registerBotMessageId(json.key.id);
    }

    return {
      ok: res.ok,
      status: res.status,
      data: json,
      raw: text
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err.message,
      data: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

function instSeg(cfg) {
  return encodeURIComponent(String(cfg.evolutionInstance || 'PROJETO COMBO'));
}

async function fetchConnectionState(cfg) {
  return evoRequest(cfg, 'GET', `/instance/connectionState/${instSeg(cfg)}`);
}

async function findWebhook(cfg) {
  return evoRequest(cfg, 'GET', `/webhook/find/${instSeg(cfg)}`);
}

async function setWebhook(cfg, webhookUrl) {
  const targetUrl = String(webhookUrl || cfg.webhookUrl || '').trim();
  if (!targetUrl) {
    return { ok: false, status: 400, error: 'URL do webhook vazia.' };
  }
  const secretSuffix = cfg.webhookSecret ? `?secret=${encodeURIComponent(cfg.webhookSecret)}` : '';
  const finalUrl = targetUrl.includes('?') ? targetUrl : `${targetUrl}${secretSuffix}`;

  return evoRequest(cfg, 'POST', `/webhook/set/${instSeg(cfg)}`, {
    webhook: {
      enabled: true,
      url: finalUrl,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT']
    }
  });
}

async function sendPresence(cfg, number, presence = 'recording', delayMs = 2000) {
  return evoRequest(cfg, 'POST', `/chat/sendPresence/${instSeg(cfg)}`, {
    number,
    presence,
    delay: Math.max(500, Math.round(delayMs))
  });
}

async function sendText(cfg, number, text, simulateTyping = true) {
  if (simulateTyping) {
    const typingMs = Math.min(2400, Math.max(900, String(text || '').length * 22));
    await sendPresence(cfg, number, 'composing', typingMs);
    await sleep(typingMs);
  }
  return evoRequest(cfg, 'POST', `/message/sendText/${instSeg(cfg)}`, {
    number,
    text: String(text || '')
  });
}

/**
 * Envia nota de voz PTT nativa com simulação prévia de "gravando áudio...".
 * @param {object} cfg
 * @param {string} number
 * @param {string} base64Ogg
 * @param {number} durationSec
 */
async function sendWhatsAppAudio(cfg, number, base64Ogg, durationSec = 5) {
  const minMs = Number(cfg.recMinMs) || 2200;
  const maxMs = Number(cfg.recMaxMs) || 6500;
  const recMs = Math.min(maxMs, Math.max(minMs, Math.round(durationSec * 850)));

  await sendPresence(cfg, number, 'recording', recMs);
  await sleep(recMs);

  return evoRequest(cfg, 'POST', `/message/sendWhatsAppAudio/${instSeg(cfg)}`, {
    number,
    audio: base64Ogg
  });
}

/**
 * Envia cartão PIX nativo via /message/sendButtons, com fallback em texto caso falhe.
 * @param {object} cfg
 * @param {string} number
 */
async function sendPixPayment(cfg, number) {
  if (cfg.sendNativePixButton !== false) {
    const btnRes = await evoRequest(cfg, 'POST', `/message/sendButtons/${instSeg(cfg)}`, {
      number,
      title: cfg.pixCardTitle || 'Pagamento PIX',
      description: cfg.pixCardDesc || 'Copie a chave PIX abaixo para concluir seu pagamento:',
      footer: cfg.pixCardFooter || 'Clube Secreto',
      buttons: [
        {
          type: 'pix',
          currency: 'BRL',
          name: cfg.pixHolder || 'Luan Batista',
          keyType: cfg.pixKeyType || 'cpf',
          key: cfg.pixKey || '09658990983'
        }
      ]
    });
    if (btnRes.ok) return { ...btnRes, usedFallback: false };
    console.warn('[EvolutionClient] sendButtons PIX falhou, usando fallback texto:', btnRes.status, btnRes.raw);
  }

  const fallbackText = [
    `💠 *CHAVE PIX (${String(cfg.pixKeyType || 'cpf').toUpperCase()})*`,
    `👤 *Nome:* ${cfg.pixHolder || 'Luan Batista'}`,
    `🔑 *Chave:* \`${cfg.pixKey || '09658990983'}\``
  ].join('\n');

  const txtRes = await sendText(cfg, number, fallbackText, true);
  return { ...txtRes, usedFallback: true };
}

async function sendMediaUrl(cfg, number, mediaUrl, mediatype = 'video', caption = '') {
  return evoRequest(cfg, 'POST', `/message/sendMedia/${instSeg(cfg)}`, {
    number,
    mediatype,
    media: mediaUrl,
    caption
  });
}

module.exports = {
  sleep,
  wasSentByBot,
  registerBotMessageId,
  fetchConnectionState,
  findWebhook,
  setWebhook,
  sendPresence,
  sendText,
  sendWhatsAppAudio,
  sendPixPayment,
  sendMediaUrl
};
