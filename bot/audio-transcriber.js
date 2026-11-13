const fs = require('fs');
const path = require('path');

const TRANSCRIBE_CACHE = new Map();
const CACHE_MAX = 500;

function resolveOpenAiKey(cfg) {
  if (cfg?.openaiApiKey && String(cfg.openaiApiKey).startsWith('sk-')) {
    return String(cfg.openaiApiKey).trim();
  }
  if (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).startsWith('sk-')) {
    return String(process.env.OPENAI_API_KEY).trim();
  }
  // Fallback: tentar ler do arquivo .env central se existir
  try {
    const fallbackPath = path.resolve(__dirname, '../../../nexus-studio/apps/api/.env');
    if (fs.existsSync(fallbackPath)) {
      const content = fs.readFileSync(fallbackPath, 'utf8');
      const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
      if (match && match[1].trim().startsWith('sk-')) {
        return match[1].trim();
      }
    }
  } catch (e) {}
  return '';
}

/**
 * Baixa nota de voz da Evolution API e transcreve via OpenAI Whisper em português.
 * @param {object} cfg
 * @param {string} msgId
 * @returns {Promise<{ ok: boolean, text?: string, error?: string }>}
 */
async function transcribeAudioFromEvolution(cfg, msgId) {
  if (!msgId) return { ok: false, error: 'missing_msg_id' };
  if (TRANSCRIBE_CACHE.has(msgId)) {
    return { ok: true, text: TRANSCRIBE_CACHE.get(msgId), fromCache: true };
  }

  const apiKey = resolveOpenAiKey(cfg);
  if (!apiKey) {
    return { ok: false, error: 'openai_key_missing' };
  }

  const inst = encodeURIComponent(String(cfg.evolutionInstance || 'PROJETO COMBO'));
  const url = `${String(cfg.evolutionUrl || '').replace(/\/+$/, '')}/chat/getBase64FromMediaMessage/${inst}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const mediaRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': String(cfg.evolutionKey || '')
      },
      body: JSON.stringify({
        message: { key: { id: msgId } },
        convertToMp4: false
      }),
      signal: controller.signal
    }).then((r) => r.json());

    if (!mediaRes || !mediaRes.base64) {
      return { ok: false, error: 'no_base64_from_evolution', raw: mediaRes };
    }

    const audioBuf = Buffer.from(mediaRes.base64, 'base64');
    if (audioBuf.length < 500) {
      return { ok: false, error: 'audio_too_small' };
    }

    const form = new FormData();
    form.append('file', new Blob([audioBuf], { type: 'audio/ogg' }), 'audio.ogg');
    form.append('model', 'whisper-1');
    form.append('language', 'pt');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form,
      signal: controller.signal
    }).then((r) => r.json());

    const text = String(whisperRes.text || '').trim();
    if (!text) {
      return { ok: false, error: 'empty_transcription', raw: whisperRes };
    }

    TRANSCRIBE_CACHE.set(msgId, text);
    if (TRANSCRIBE_CACHE.size > CACHE_MAX) {
      const firstKey = TRANSCRIBE_CACHE.keys().next().value;
      TRANSCRIBE_CACHE.delete(firstKey);
    }

    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  transcribeAudioFromEvolution,
  resolveOpenAiKey
};
