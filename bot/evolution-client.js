const fs = require('fs');
const path = require('path');
const store = require('./bot-store');

const BOT_SENT_MSG_IDS = new Map();
const BOT_SENT_TTL_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerBotMessageId(msgId) {
  if (!msgId) return;
  const id = String(msgId);
  const now = Date.now();
  BOT_SENT_MSG_IDS.set(id, now);
  try { store.addBotSentId(id); } catch (e) {}
  if (BOT_SENT_MSG_IDS.size > 500) {
    for (const [k, ts] of BOT_SENT_MSG_IDS.entries()) {
      if (now - ts > BOT_SENT_TTL_MS) BOT_SENT_MSG_IDS.delete(k);
    }
  }
}

function wasSentByBot(msgId) {
  if (!msgId) return false;
  const id = String(msgId);
  const ts = BOT_SENT_MSG_IDS.get(id);
  if (ts && (Date.now() - ts <= BOT_SENT_TTL_MS)) return true;
  try {
    return store.isBotSentId(id);
  } catch (e) {
    return false;
  }
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

    const sentKeyId = json?.key?.id || json?.message?.key?.id || (Array.isArray(json) ? json[0]?.key?.id : null);
    if (res.ok && sentKeyId) {
      registerBotMessageId(sentKeyId);
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

async function findChats(cfg) {
  return evoRequest(cfg, 'POST', `/chat/findChats/${instSeg(cfg)}`, {});
}

async function findMessages(cfg, remoteJid, offset = 20) {
  return evoRequest(cfg, 'POST', `/chat/findMessages/${instSeg(cfg)}`, {
    where: { key: { remoteJid } },
    page: 1,
    offset
  });
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

/**
 * Envia confirmação de leitura (tick azul) antes de iniciar digitação/gravação, simulando abertura real do chat.
 */
async function markMessageAsRead(cfg, items = []) {
  const valid = (Array.isArray(items) ? items : [])
    .filter((i) => i && i.remoteJid && i.id)
    .map((i) => ({ remoteJid: i.remoteJid, fromMe: false, id: i.id }));
  if (!valid.length) return { ok: true, skipped: true };
  return evoRequest(cfg, 'POST', `/chat/markMessageAsRead/${instSeg(cfg)}`, {
    readMessages: valid
  });
}

async function sendText(cfg, number, text, simulateTyping = true) {
  if (simulateTyping) {
    const typingMs = Math.min(1200, Math.max(600, String(text || '').length * 15));
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
  const holder = cfg.pixHolder || 'Luan Batista';
  const roleNote = cfg.pixHolderRole ? ` (${cfg.pixHolderRole})` : '';
  const keyTypeLabel = String(cfg.pixKeyType || 'cpf').toUpperCase();
  const cleanKey = String(cfg.pixKey || '09658990983').trim();

  if (cfg.sendNativePixButton === true) {
    const btnRes = await evoRequest(cfg, 'POST', `/message/sendButtons/${instSeg(cfg)}`, {
      number,
      title: cfg.pixCardTitle || 'Pagamento PIX',
      description: cfg.pixCardDesc || 'Copie a chave PIX abaixo para concluir seu pagamento:',
      footer: cfg.pixCardFooter || 'Clube Secreto',
      buttons: [
        {
          type: 'pix',
          currency: 'BRL',
          name: `${holder} (Gerente)`,
          keyType: cfg.pixKeyType || 'cpf',
          key: cleanKey
        }
      ]
    });
    if (btnRes.ok) return { ...btnRes, usedFallback: false };
    console.warn('[EvolutionClient] sendButtons PIX falhou, usando fallback texto:', btnRes.status, btnRes.raw);
  }

  const infoText = [
    '💜 *DADOS DO PIX*',
    '',
    `👤 *Nome:* ${holder}${roleNote}`,
    `🧾 *Tipo:* ${keyTypeLabel}`,
    '',
    '👇 Vou mandar só a chave aqui embaixo pra vc copiar e colar fácil:'
  ].join('\n');

  const infoRes = await sendText(cfg, number, infoText, true);
  if (!infoRes.ok) return { ...infoRes, usedFallback: true };

  await sleep(450);
  // Mensagem isolada só com os dígitos da chave para o cliente segurar e copiar em 1 toque
  const keyRes = await sendText(cfg, number, cleanKey, false);
  return { ...keyRes, usedFallback: true };
}

async function sendMediaUrl(cfg, number, mediaUrl, mediatype = 'video', caption = '') {
  return evoRequest(cfg, 'POST', `/message/sendMedia/${instSeg(cfg)}`, {
    number,
    mediatype,
    media: mediaUrl,
    caption
  });
}

/**
 * Envia foto de prévia do disco em modo visualização única (viewOnce) com fallback sem viewOnce.
 */
async function sendPreviewImage(cfg, number, filePath, caption = '', viewOnce = true) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, status: 404, error: `Arquivo de prévia não encontrado: ${filePath}` };
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimetype = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
  const b64 = fs.readFileSync(filePath).toString('base64');

  await sendPresence(cfg, number, 'composing', 1400);
  await sleep(1400);

  const basePayload = {
    number,
    mediatype: 'image',
    mimetype,
    caption: String(caption || ''),
    media: b64,
    fileName: path.basename(filePath) || 'previa.jpg'
  };

  if (viewOnce) {
    const voRes = await evoRequest(cfg, 'POST', `/message/sendMedia/${instSeg(cfg)}`, {
      ...basePayload,
      viewOnce: true
    });
    if (voRes.ok) return { ...voRes, usedViewOnce: true };
  }

  const normalRes = await evoRequest(cfg, 'POST', `/message/sendMedia/${instSeg(cfg)}`, basePayload);
  return { ...normalRes, usedViewOnce: false };
}

module.exports = {
  sleep,
  wasSentByBot,
  registerBotMessageId,
  fetchConnectionState,
  findChats,
  findMessages,
  findWebhook,
  setWebhook,
  sendPresence,
  markMessageAsRead,
  sendText,
  sendWhatsAppAudio,
  sendPixPayment,
  sendMediaUrl,
  sendPreviewImage
};
