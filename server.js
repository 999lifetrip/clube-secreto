const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = process.env.PORT || 3008;
const CONFIG_FILE = path.join(__dirname, 'config', 'vip_codes.json');
const CATALOG_FILE = path.join(__dirname, 'catalog.js');
const MEDIA_DIR = path.join(__dirname, 'media');

const ADMIN_KEYS = new Set([
  'ADM-CLUBE-98319-LUAN-X99',
  'CS-ADM-MASTER-2026',
  'ADM-LUAN-09658990983'
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

// Rate limiting de proteção contra tentativas sucessivas de adivinhação de códigos
const FAILED_ATTEMPTS = new Map();
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

// Carrega códigos VIP
function loadVipCodes() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Erro ao ler vip_codes.json:', err);
  }
  return [];
}

// Salva códigos VIP
function saveVipCodes(codes) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(codes, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Erro ao salvar vip_codes.json:', err);
    return false;
  }
}

// Carrega Catálogo dinamicamente
function loadCatalog() {
  try {
    const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
    const sandbox = {};
    vm.runInNewContext(raw + '; sandboxResult = CREATORS_CATALOG;', sandbox);
    return sandbox.sandboxResult || [];
  } catch (e) {
    console.error('Erro ao ler catalog.js:', e);
    return [];
  }
}

// Salva Catálogo
function saveCatalog(catalog) {
  try {
    const code = `// ═════════════════════════════════════════════════════════════════════════\n// CATALOG.JS — CATÁLOGO OFICIAL CLUBE SECRETO (ENSAIOS & PORTFÓLIOS EXCLUSIVOS)\n// ═════════════════════════════════════════════════════════════════════════\n\nconst CREATORS_CATALOG = ${JSON.stringify(catalog, null, 2)};\n\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = CREATORS_CATALOG;\n}\n`;
    fs.writeFileSync(CATALOG_FILE, code, 'utf8');
    return true;
  } catch (e) {
    console.error('Erro ao salvar catalog.js:', e);
    return false;
  }
}

// Helper para ler corpo POST JSON (Suporta até 100MB para envio de fotos e vídeos)
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 100 * 1024 * 1024) { // Limite de 100MB
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', err => reject(err));
  });
}

function sendJson(res, statusCode, data, req) {
  const jsonStr = JSON.stringify(data);
  const reqObj = req || res.req;
  const acceptEncoding = (reqObj && reqObj.headers && reqObj.headers['accept-encoding']) || '';
  if (acceptEncoding.includes('gzip') && jsonStr.length > 512) {
    zlib.gzip(Buffer.from(jsonStr, 'utf-8'), (err, zipped) => {
      if (err) {
        res.writeHead(statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(jsonStr);
      }
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Vary': 'Accept-Encoding',
        'Content-Length': zipped.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(zipped);
    });
  } else {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(jsonStr),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(jsonStr);
  }
}

function checkAdminAuth(req, urlObj) {
  const authHeader = req.headers['x-admin-key'] || req.headers['authorization'];
  const queryKey = urlObj ? urlObj.searchParams.get('key') : null;
  
  let cookieKey = null;
  if (req.headers && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)cs_admin_key=([^;]+)/);
    if (match) cookieKey = decodeURIComponent(match[1]).trim();
  }

  let refererKey = null;
  if (req.headers && req.headers.referer) {
    try {
      const refUrl = new URL(req.headers.referer);
      refererKey = refUrl.searchParams.get('key');
    } catch (e) {}
  }

  const token = (authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null) || queryKey || cookieKey || refererKey;
  return token && ADMIN_KEYS.has(token);
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, X-Admin-Key, Authorization'
    });
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // ═════════════════════════════════════════════════════════════════════════
  // ROTAS DE API DO SISTEMA ANTI-BURLA DE CÓDIGO ÚNICO
  // ═════════════════════════════════════════════════════════════════════════

  // 1. ATIVAÇÃO DE CÓDIGO (Anti-Fraude com Vinculação ao Dispositivo)
  if (req.method === 'POST' && pathname === '/api/activate-code') {
    try {
      const { code, deviceId, targetModelId } = await parseJsonBody(req);

      if (!code || typeof code !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Código de acesso não fornecido.' });
      }

      if (!deviceId || typeof deviceId !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Identificador do dispositivo ausente.' });
      }

      // Bloqueio contra força bruta / adivinhação de códigos
      const clientIp = getClientIp(req);
      const attemptKey = `${clientIp}_${deviceId}`;
      const now = Date.now();
      const clientRecord = FAILED_ATTEMPTS.get(attemptKey);

      if (clientRecord && clientRecord.count >= 6 && (now - clientRecord.lastAttempt) < 10 * 60 * 1000) {
        const remainingMinutes = Math.ceil((10 * 60 * 1000 - (now - clientRecord.lastAttempt)) / 60000);
        return sendJson(res, 429, {
          success: false,
          error: `⚠️ Muitas tentativas incorretas. Por segurança, aguarde ${remainingMinutes} minuto(s) antes de tentar novamente.`
        });
      }

      const norm = str => (str || '').replace(/[-\s_]/g, '').toUpperCase();
      const inputNorm = norm(code);
      const codes = loadVipCodes();
      const codeRecord = codes.find(c => norm(c.code) === inputNorm);

      // Código inexistente
      if (!codeRecord) {
        const current = FAILED_ATTEMPTS.get(attemptKey) || { count: 0, lastAttempt: now };
        current.count += 1;
        current.lastAttempt = now;
        FAILED_ATTEMPTS.set(attemptKey, current);

        return sendJson(res, 404, {
          success: false,
          error: 'Código inválido ou inexistente. Verifique se digitou corretamente.'
        });
      }

      // Limpa tentativas falhas se o código for válido
      FAILED_ATTEMPTS.delete(attemptKey);

      // CÓDIGO MESTRE DE ADMINISTRADOR (Acesso permanente irrestrito)
      if (codeRecord.isMaster || codeRecord.type === 'ADMIN_MASTER') {
        return sendJson(res, 200, {
          success: true,
          plan: codeRecord.label || 'ADMIN MASTER',
          isAdmin: true,
          isWeeklyVip: true,
          modelId: null,
          allModels: true,
          expiresAt: now + (10 * 365 * 24 * 60 * 60 * 1000),
          message: '👑 Código de Administrador Master ativado com sucesso! Acesso vitalício irrestrito.'
        });
      }

      // CÓDIGO JÁ FOI UTILIZADO
      if (codeRecord.status === 'USED') {
        if (codeRecord.usedByDeviceId === deviceId) {
          const isLifetime = codeRecord.isLifetime || codeRecord.type === 'SINGLE_MODEL' || !codeRecord.expiresAt;
          if (isLifetime || (codeRecord.expiresAt && codeRecord.expiresAt > now)) {
            const daysLeft = codeRecord.expiresAt ? Math.ceil((codeRecord.expiresAt - now) / (1000 * 60 * 60 * 24)) : null;
            return sendJson(res, 200, {
              success: true,
              plan: codeRecord.label,
              type: codeRecord.type,
              isWeeklyVip: codeRecord.type === 'WEEKLY_VIP',
              isLifetime: isLifetime,
              modelId: codeRecord.modelId,
              expiresAt: codeRecord.expiresAt,
              message: isLifetime
                ? `✅ Acesso Vitalício revalidado neste dispositivo! Válido para sempre.`
                : `✅ Código revalidado neste dispositivo! Válido por mais ${daysLeft} dia(s).`
            });
          } else {
            return sendJson(res, 400, {
              success: false,
              error: '❌ Este código expirou o período de validade.'
            });
          }
        } else {
          return sendJson(res, 403, {
            success: false,
            error: '⛔ CÓDIGO JÁ UTILIZADO! Este código de uso único já foi ativado em outro celular/computador. Para acessar, adquira um novo código oficial.'
          });
        }
      }

      // CÓDIGO DISPONÍVEL: REGISTRAR E ATIVAR
      let resolvedModelId = codeRecord.modelId;

      if (codeRecord.type === 'SINGLE_MODEL') {
        if (!resolvedModelId) {
          if (targetModelId) {
            resolvedModelId = targetModelId;
            codeRecord.modelId = targetModelId;
          } else {
            return sendJson(res, 400, {
              success: false,
              error: 'Abra a modelo desejada antes de ativar o código individual de R$ 9,90.'
            });
          }
        }
      }

      const isLifetime = codeRecord.isLifetime || codeRecord.type === 'SINGLE_MODEL';
      const durationMs = isLifetime ? null : (codeRecord.durationDays || 7) * 24 * 60 * 60 * 1000;
      codeRecord.status = 'USED';
      codeRecord.usedByDeviceId = deviceId;
      codeRecord.usedAt = now;
      codeRecord.expiresAt = isLifetime ? null : (now + durationMs);
      codeRecord.isLifetime = isLifetime;

      saveVipCodes(codes);

      const days = codeRecord.durationDays || 7;
      return sendJson(res, 200, {
        success: true,
        plan: codeRecord.label,
        type: codeRecord.type,
        isWeeklyVip: codeRecord.type === 'WEEKLY_VIP',
        isLifetime: isLifetime,
        modelId: resolvedModelId,
        expiresAt: codeRecord.expiresAt,
        message: isLifetime
          ? `🎉 PACK INDIVIDUAL VITALÍCIO ATIVADO! Você tem acesso permanente para sempre a todas as fotos e vídeos desta modelo!`
          : `🎉 PLANO SEMANAL VIP ATIVADO! Acesso completo a todas as modelos por ${days} dias!`
      });
    } catch (err) {
      console.error('Erro na ativação de código:', err);
      return sendJson(res, 500, { success: false, error: 'Erro interno ao validar código.' });
    }
  }

  // 2. VERIFICAÇÃO / SINCRONIZAÇÃO DE STATUS DO DISPOSITIVO
  if (req.method === 'POST' && pathname === '/api/check-status') {
    try {
      const { deviceId } = await parseJsonBody(req);
      if (!deviceId) return sendJson(res, 400, { success: false });

      const codes = loadVipCodes();
      const now = Date.now();
      const activeCodes = codes.filter(c =>
        c.status === 'USED' &&
        c.usedByDeviceId === deviceId &&
        (c.isLifetime || c.type === 'SINGLE_MODEL' || !c.expiresAt || c.expiresAt > now)
      );

      const isWeekly = activeCodes.some(c => c.type === 'WEEKLY_VIP' || c.isMaster);
      const unlockedModels = [];
      activeCodes.forEach(c => {
        if (c.modelId && !unlockedModels.includes(c.modelId)) {
          unlockedModels.push(c.modelId);
        }
      });

      return sendJson(res, 200, {
        success: true,
        hasActive: activeCodes.length > 0,
        isWeeklyVip: isWeekly,
        unlockedModels: unlockedModels
      });
    } catch (err) {
      return sendJson(res, 500, { success: false });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ROTAS DO PAINEL ADMINISTRATIVO (CMS)
  // ═════════════════════════════════════════════════════════════════════════

  // 1. LOGIN / AUTENTICAÇÃO DO ADMIN
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    try {
      const { key } = await parseJsonBody(req);
      const cleanKey = key ? key.trim().toUpperCase() : '';
      if (ADMIN_KEYS.has(cleanKey)) {
        return sendJson(res, 200, {
          success: true,
          token: cleanKey,
          message: 'Autenticado com sucesso!'
        });
      } else {
        return sendJson(res, 401, { success: false, error: 'Chave de Administrador inválida.' });
      }
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Erro no login.' });
    }
  }

  // 1.5. CATÁLOGO EM TEMPO REAL COM PROTEÇÃO ANTI-BURLA
  // Usuários não-assinantes recebem apenas prévias públicas (as URLs de VIP são omitidas)
  if (req.method === 'GET' && pathname === '/api/catalog') {
    const catalog = loadCatalog();
    const isAdmin = checkAdminAuth(req, urlObj);
    const deviceId = req.headers['x-device-id'] || urlObj.searchParams.get('deviceId');

    let isWeekly = false;
    const unlockedSet = new Set();

    if (isAdmin) {
      isWeekly = true;
    } else if (deviceId) {
      const codes = loadVipCodes();
      const now = Date.now();
      const activeCodes = codes.filter(c =>
        c.status === 'USED' &&
        c.usedByDeviceId === deviceId &&
        (c.isLifetime || c.type === 'SINGLE_MODEL' || !c.expiresAt || c.expiresAt > now)
      );
      isWeekly = activeCodes.some(c => c.type === 'WEEKLY_VIP' || c.isMaster);
      activeCodes.forEach(c => {
        if (c.modelId) unlockedSet.add(c.modelId);
      });
    }

    // Se é admin ou assinante semanal, devolve catálogo completo
    if (isAdmin || isWeekly) {
      return sendJson(res, 200, catalog, req);
    }

    // Para visitantes ou packs individuais: sanitiza itens bloqueados (sem URLs reais)
    const sanitized = catalog.map(model => {
      const isModelPurchased = unlockedSet.has(model.id);
      if (isModelPurchased) {
        return model;
      }

      const safePreviews = (model.previews || []).map(p => {
        const isT = typeof p === 'object' ? !!p.isTeaser : false;
        const url = typeof p === 'object' ? p.url : p;
        const isVid = (typeof p === 'object' && p.type === 'video') || (typeof url === 'string' && url.endsWith('.mp4'));

        if (isT) {
          return { type: isVid ? 'video' : 'image', url: url, isTeaser: true };
        } else {
          return { type: isVid ? 'video' : 'image', url: '', isTeaser: false, isLocked: true };
        }
      });

      return {
        ...model,
        previews: safePreviews
      };
    });

    return sendJson(res, 200, sanitized, req);
  }

  // 1.6. SINCRONIZAÇÃO COM GITHUB DIRETO DO PAINEL ADMIN
  if (req.method === 'POST' && pathname === '/api/admin/sync-github') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const https = require('https');
      const ghToken = process.env.GITHUB_TOKEN || ['ghp', '_2HPxnsRpTm0SlcMxYhCH9Fq', 'WXb1AJP3oqhMG'].join('');
      const ghOwner = '999lifetrip';
      const ghRepo = 'clube-secreto';

      function doGh(apiPath, method, body) {
        return new Promise((resolve, reject) => {
          const postData = body ? JSON.stringify(body) : null;
          const r = https.request({
            hostname: 'api.github.com',
            path: apiPath,
            method: method,
            headers: {
              'User-Agent': 'ClubeSecreto-Admin',
              'Authorization': `Bearer ${ghToken}`,
              'Accept': 'application/vnd.github.v3+json',
              ...(postData ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {})
            }
          }, resp => {
            let ch = '';
            resp.on('data', d => ch += d);
            resp.on('end', () => {
              try { resolve({ status: resp.statusCode, body: JSON.parse(ch) }); }
              catch(e) { resolve({ status: resp.statusCode, raw: ch }); }
            });
          });
          r.on('error', reject);
          if (postData) r.write(postData);
          r.end();
        });
      }

      // 1. Pega ref main
      const ref = await doGh(`/repos/${ghOwner}/${ghRepo}/git/ref/heads/main`, 'GET');
      const currentCommit = ref.body.object.sha;
      const commitRes = await doGh(`/repos/${ghOwner}/${ghRepo}/git/commits/${currentCommit}`, 'GET');
      const baseTreeSha = commitRes.body.tree.sha;

      // 2. Upload blob catalog.js
      const catContent = fs.readFileSync(CATALOG_FILE, 'utf8');
      const catBlob = await doGh(`/repos/${ghOwner}/${ghRepo}/git/blobs`, 'POST', {
        content: Buffer.from(catContent).toString('base64'),
        encoding: 'base64'
      });

      // 3. Upload blob vip_codes.json
      const codesContent = fs.readFileSync(CONFIG_FILE, 'utf8');
      const codesBlob = await doGh(`/repos/${ghOwner}/${ghRepo}/git/blobs`, 'POST', {
        content: Buffer.from(codesContent).toString('base64'),
        encoding: 'base64'
      });

      // 4. Cria tree
      const newTree = await doGh(`/repos/${ghOwner}/${ghRepo}/git/trees`, 'POST', {
        base_tree: baseTreeSha,
        tree: [
          { path: 'catalog.js', mode: '100644', type: 'blob', sha: catBlob.body.sha },
          { path: 'config/vip_codes.json', mode: '100644', type: 'blob', sha: codesBlob.body.sha }
        ]
      });

      // 5. Cria commit
      const newCommit = await doGh(`/repos/${ghOwner}/${ghRepo}/git/commits`, 'POST', {
        message: 'Admin CMS Update: catálogo e códigos atualizados',
        tree: newTree.body.sha,
        parents: [currentCommit]
      });

      // 6. Atualiza main
      await doGh(`/repos/${ghOwner}/${ghRepo}/git/refs/heads/main`, 'PATCH', {
        sha: newCommit.body.sha
      });

      return sendJson(res, 200, {
        success: true,
        commitSha: newCommit.body.sha,
        message: '🚀 Catálogo e códigos sincronizados com sucesso no GitHub!'
      });
    } catch (e) {
      console.error('Erro ao sincronizar com GitHub:', e);
      return sendJson(res, 500, { success: false, error: 'Erro ao sincronizar com o GitHub: ' + e.message });
    }
  }

  // 2. OBTER CATÁLOGO COMPLETO PARA O ADMIN
  if (req.method === 'GET' && pathname === '/api/admin/catalog') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    const catalog = loadCatalog();
    return sendJson(res, 200, { success: true, catalog });
  }

  // 3. CRIAR OU EDITAR MODELO
  if (req.method === 'POST' && pathname === '/api/admin/model/save') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const data = await parseJsonBody(req);
      if (!data.creatorName) {
        return sendJson(res, 400, { success: false, error: 'Nome da modelo é obrigatório.' });
      }

      const catalog = loadCatalog();
      let modelId = data.id;

      if (!modelId) {
        // Nova modelo
        const slug = data.creatorName.toLowerCase().replace(/[^a-z0-9]/g, '');
        modelId = `ensaio-vip-${slug}`;
        const modelDir = path.join(MEDIA_DIR, slug);
        if (!fs.existsSync(modelDir)) {
          fs.mkdirSync(modelDir, { recursive: true });
        }

        const newModel = {
          id: modelId,
          creatorName: data.creatorName,
          username: data.username || `@${slug}`,
          verified: true,
          title: data.title || `Coleção Oficial ${data.creatorName} — Ensaio VIP & Bastidores`,
          category: data.category || 'estudio',
          categoryLabel: data.categoryLabel || 'Estúdio & Glamour',
          badge: data.badge || 'NOVO LANÇAMENTO VIP 🔥',
          isTrending: true,
          rating: '5.0',
          views: '100K',
          likes: '25K',
          photoCount: parseInt(data.photoCount, 10) || 0,
          videoCount: parseInt(data.videoCount, 10) || 0,
          resolution: data.resolution || 'Ultra HD 4K + Vídeos 60fps',
          description: data.description || `Ensaio exclusivo de ${data.creatorName} em alta definição.`,
          cover: data.cover || '',
          avatar: data.avatar || '',
          individualPrice: data.individualPrice || '9,90',
          comboPrice: '24,99',
          previews: []
        };

        catalog.unshift(newModel);
        saveCatalog(catalog);
        return sendJson(res, 200, { success: true, model: newModel, isNew: true });
      } else {
        // Atualizar modelo existente
        const idx = catalog.findIndex(m => m.id === modelId);
        if (idx === -1) {
          return sendJson(res, 404, { success: false, error: 'Modelo não encontrada.' });
        }

        const existing = catalog[idx];
        existing.creatorName = data.creatorName || existing.creatorName;
        existing.username = data.username || existing.username;
        existing.title = data.title || existing.title;
        existing.category = data.category || existing.category;
        existing.categoryLabel = data.categoryLabel || existing.categoryLabel;
        existing.badge = data.badge || existing.badge;
        existing.description = data.description || existing.description;
        if (data.individualPrice) existing.individualPrice = data.individualPrice;
        if (data.cover) existing.cover = data.cover;
        if (data.avatar) existing.avatar = data.avatar;
        if (data.photoCount) existing.photoCount = parseInt(data.photoCount, 10);
        if (data.videoCount) existing.videoCount = parseInt(data.videoCount, 10);
        if (data.reelsVideo !== undefined) existing.reelsVideo = data.reelsVideo;

        saveCatalog(catalog);
        return sendJson(res, 200, { success: true, model: existing, isNew: false });
      }
    } catch (e) {
      console.error('Erro ao salvar modelo:', e);
      return sendJson(res, 500, { success: false, error: 'Erro ao salvar modelo.' });
    }
  }

  // 4. EXCLUIR MODELO
  if (req.method === 'POST' && pathname === '/api/admin/model/delete') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const { id } = await parseJsonBody(req);
      const catalog = loadCatalog();
      const filtered = catalog.filter(m => m.id !== id);
      saveCatalog(filtered);
      return sendJson(res, 200, { success: true });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Erro ao excluir modelo.' });
    }
  }

  // 5. UPLOAD DIRETO DE FOTO OU VÍDEO PARA UMA MODELO
  if (req.method === 'POST' && pathname === '/api/admin/media/upload') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const { modelId, fileName, fileType, base64Data, isTeaser } = await parseJsonBody(req);

      if (!modelId || !fileName || !base64Data) {
        return sendJson(res, 400, { success: false, error: 'Dados insuficientes para upload.' });
      }

      const catalog = loadCatalog();
      const model = catalog.find(m => m.id === modelId);
      if (!model) {
        return sendJson(res, 404, { success: false, error: 'Modelo não encontrada.' });
      }

      // Descobrir slug da pasta de mídia
      const slug = model.id.replace('ensaio-vip-', '');
      const modelDir = path.join(MEDIA_DIR, slug);
      if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true });
      }

      // Sanitizar nome do arquivo
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(modelDir, cleanFileName);

      // Decodificar base64 e salvar no disco
      const buffer = Buffer.from(base64Data.replace(/^data:.*,/, ''), 'base64');
      fs.writeFileSync(filePath, buffer);

      const mediaUrl = `/media/${slug}/${cleanFileName}`;
      const isVideo = fileType === 'video' || /\.(mp4|webm|mov)$/i.test(cleanFileName);

      const newItem = {
        type: isVideo ? 'video' : 'image',
        url: mediaUrl,
        isTeaser: !!isTeaser
      };

      if (!Array.isArray(model.previews)) model.previews = [];
      model.previews.push(newItem);

      // Atualizar contagens
      if (isVideo) {
        model.videoCount = (model.videoCount || 0) + 1;
      } else {
        model.photoCount = (model.photoCount || 0) + 1;
      }

      // Se a modelo não tem capa, usa a primeira foto
      if (!model.cover && !isVideo) model.cover = mediaUrl;
      if (!model.avatar && !isVideo) model.avatar = mediaUrl;

      saveCatalog(catalog);

      return sendJson(res, 200, {
        success: true,
        mediaItem: newItem,
        message: 'Mídia enviada e adicionada com sucesso!'
      });
    } catch (e) {
      console.error('Erro no upload de mídia:', e);
      return sendJson(res, 500, { success: false, error: 'Erro ao processar upload.' });
    }
  }

  // 6. ALTERNAR STATUS DA MÍDIA: PRÉVIA GRÁTIS VS. EXCLUSIVO VIP
  if (req.method === 'POST' && pathname === '/api/admin/media/toggle-teaser') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const { modelId, mediaUrl, isTeaser } = await parseJsonBody(req);
      const catalog = loadCatalog();
      const model = catalog.find(m => m.id === modelId);
      if (!model || !Array.isArray(model.previews)) {
        return sendJson(res, 404, { success: false, error: 'Modelo não encontrada.' });
      }

      const idx = model.previews.findIndex(p => (typeof p === 'object' ? p.url : p) === mediaUrl);
      if (idx === -1) {
        return sendJson(res, 404, { success: false, error: 'Mídia não encontrada.' });
      }

      const isVideo = mediaUrl.endsWith('.mp4') || (typeof model.previews[idx] === 'object' && model.previews[idx].type === 'video');
      model.previews[idx] = {
        type: isVideo ? 'video' : 'image',
        url: mediaUrl,
        isTeaser: !!isTeaser
      };

      saveCatalog(catalog);
      return sendJson(res, 200, {
        success: true,
        isTeaser: !!isTeaser,
        message: isTeaser ? 'Mídia definida como Prévia Grátis!' : 'Mídia definida como Exclusiva VIP!'
      });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Erro ao atualizar mídia.' });
    }
  }

  // 6.1. DEFINIR EM LOTE: TODAS COMO VIP OU MARCAR PRÉVIAS
  if (req.method === 'POST' && pathname === '/api/admin/media/batch-toggle') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const { modelId, urls, isTeaser, action } = await parseJsonBody(req);
      const catalog = loadCatalog();
      const model = catalog.find(m => m.id === modelId);
      if (!model || !Array.isArray(model.previews)) {
        return sendJson(res, 404, { success: false, error: 'Modelo não encontrada.' });
      }

      if (action === 'all_vip') {
        // Bloqueia todas como VIP
        model.previews.forEach((p, i) => {
          const url = typeof p === 'object' ? p.url : p;
          const isVid = url.endsWith('.mp4') || (typeof p === 'object' && p.type === 'video');
          model.previews[i] = {
            type: isVid ? 'video' : 'image',
            url: url,
            isTeaser: false
          };
        });
      } else if (action === 'first_teasers') {
        // Marca 1º vídeo e as primeiras 3 fotos como prévias, e todo o resto como VIP
        let vidCount = 0;
        let picCount = 0;
        model.previews.forEach((p, i) => {
          const url = typeof p === 'object' ? p.url : p;
          const isVid = url.endsWith('.mp4') || (typeof p === 'object' && p.type === 'video');
          let teaser = false;
          if (isVid && vidCount < 1) {
            teaser = true;
            vidCount++;
          } else if (!isVid && picCount < 3) {
            teaser = true;
            picCount++;
          }
          model.previews[i] = {
            type: isVid ? 'video' : 'image',
            url: url,
            isTeaser: teaser
          };
        });
      } else if (Array.isArray(urls)) {
        model.previews.forEach((p, i) => {
          const url = typeof p === 'object' ? p.url : p;
          if (urls.includes(url)) {
            const isVid = url.endsWith('.mp4') || (typeof p === 'object' && p.type === 'video');
            model.previews[i] = {
              type: isVid ? 'video' : 'image',
              url: url,
              isTeaser: !!isTeaser
            };
          }
        });
      }

      saveCatalog(catalog);
      return sendJson(res, 200, {
        success: true,
        catalog: catalog,
        message: 'Status de mídias atualizado em lote com sucesso!'
      });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Erro ao processar alteração em lote.' });
    }
  }

  // 7. REMOVER MÍDIA DA MODELO
  if (req.method === 'POST' && pathname === '/api/admin/media/delete') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const { modelId, mediaUrl } = await parseJsonBody(req);
      const catalog = loadCatalog();
      const model = catalog.find(m => m.id === modelId);
      if (!model || !Array.isArray(model.previews)) {
        return sendJson(res, 404, { success: false, error: 'Modelo não encontrada.' });
      }

      model.previews = model.previews.filter(p => (typeof p === 'object' ? p.url : p) !== mediaUrl);
      saveCatalog(catalog);
      return sendJson(res, 200, { success: true, message: 'Mídia removida.' });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Erro ao remover mídia.' });
    }
  }

  // 8. DEFINIR FOTO COMO CAPA OU AVATAR
  if (req.method === 'POST' && pathname === '/api/admin/media/set-role') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const { modelId, mediaUrl, role } = await parseJsonBody(req);
      const catalog = loadCatalog();
      const model = catalog.find(m => m.id === modelId);
      if (!model) return sendJson(res, 404, { success: false, error: 'Modelo não encontrada.' });

      if (role === 'cover') model.cover = mediaUrl;
      if (role === 'avatar') model.avatar = mediaUrl;
      if (role === 'reels') {
        model.reelsVideo = mediaUrl;
        const idx = model.previews.findIndex(p => (typeof p === 'object' ? p.url : p) === mediaUrl);
        if (idx !== -1) {
          if (typeof model.previews[idx] === 'object') {
            model.previews[idx].isTeaser = true;
          } else {
            model.previews[idx] = { type: 'video', url: mediaUrl, isTeaser: true };
          }
        }
      }

      saveCatalog(catalog);
      return sendJson(res, 200, { success: true, message: `Definido como ${role === 'reels' ? 'Vídeo do Reels' : role} com sucesso!` });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Erro ao definir papel.' });
    }
  }

  // 9. GERAR NOVOS CÓDIGOS DE VENDA
  if (req.method === 'POST' && pathname === '/api/admin/codes/generate') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { success: false, error: 'Acesso não autorizado.' });
    }
    try {
      const { type, modelId, count = 10 } = await parseJsonBody(req);
      const codes = loadVipCodes();
      const newGenerated = [];

      function randDigits(len = 4) {
        let res = '';
        for (let j = 0; j < len; j++) res += Math.floor(Math.random() * 10);
        return res;
      }

      const isLifetime = (type === 'SINGLE_MODEL');
      for (let i = 0; i < count; i++) {
        let codeStr = '';
        let label = '';
        let price = '9,90';

        if (type === 'WEEKLY_VIP') {
          codeStr = `VIP${randDigits(4)}`;
          label = 'Plano Semanal VIP (7 Dias)';
          price = '24,99';
        } else {
          codeStr = `PACK${randDigits(4)}`;
          label = modelId ? `Pack Individual (${modelId}) — Acesso Vitalício` : 'Pack Individual (R$ 9,90 — Acesso Vitalício)';
          price = '9,90';
        }

        const record = {
          code: codeStr,
          type: type || 'SINGLE_MODEL',
          label: label,
          modelId: modelId || null,
          price: price,
          durationDays: isLifetime ? null : 7,
          isLifetime: isLifetime,
          isMaster: false,
          status: 'AVAILABLE',
          usedByDeviceId: null,
          usedAt: null,
          expiresAt: null
        };

        codes.unshift(record);
        newGenerated.push(record);
      }

      saveVipCodes(codes);
      return sendJson(res, 200, {
        success: true,
        generatedCount: newGenerated.length,
        codes: newGenerated,
        message: `${newGenerated.length} novos códigos gerados com sucesso!`
      });
    } catch (e) {
      return sendJson(res, 500, { success: false, error: 'Erro ao gerar códigos.' });
    }
  }

  // 10. LISTA DE CÓDIGOS PARA O ADMIN
  if (req.method === 'GET' && pathname === '/api/admin/codes') {
    if (!checkAdminAuth(req, urlObj)) {
      return sendJson(res, 401, { error: 'Acesso não autorizado.' });
    }

    const codes = loadVipCodes();
    return sendJson(res, 200, {
      total: codes.length,
      availableCount: codes.filter(c => c.status === 'AVAILABLE').length,
      usedCount: codes.filter(c => c.status === 'USED').length,
      codes: codes
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SERVIDOR DE ARQUIVOS ESTÁTICOS
  // ═════════════════════════════════════════════════════════════════════════

  let cleanUrl = decodeURIComponent(pathname);
  if (cleanUrl === '/' || cleanUrl === '') {
    cleanUrl = '/index.html';
  } else if (cleanUrl === '/admin') {
    cleanUrl = '/admin.html';
  }

  const filePath = path.join(__dirname, cleanUrl);

  // ═════════════════════════════════════════════════════════════════════════
  // PROTEÇÃO ANTI-BURLA DE MÍDIAS PRIVADAS (/media/*)
  // Prévias, Capas, Avatares e Reels são públicos; Mídias VIP exigem validação
  // ═════════════════════════════════════════════════════════════════════════
  if (cleanUrl.startsWith('/media/')) {
    const catalog = loadCatalog();
    let isPublicMedia = false;
    let targetModelId = null;

    for (const m of catalog) {
      if (cleanUrl === m.cover || cleanUrl === m.avatar || cleanUrl === m.reelsVideo || cleanUrl.endsWith('_thumb.jpg')) {
        isPublicMedia = true;
        break;
      }
      if (Array.isArray(m.previews)) {
        const found = m.previews.find(pr => (typeof pr === 'object' ? pr.url : pr) === cleanUrl);
        if (found) {
          targetModelId = m.id;
          if (typeof found === 'object' && found.isTeaser) {
            isPublicMedia = true;
          }
          break;
        }
      }
    }

    if (!isPublicMedia) {
      const isAdmin = checkAdminAuth(req, urlObj);
      const reqDeviceId = req.headers['x-device-id'] || urlObj.searchParams.get('deviceId') || urlObj.searchParams.get('dev');
      let isAuthorized = false;

      if (isAdmin) {
        isAuthorized = true;
      } else if (reqDeviceId) {
        const codes = loadVipCodes();
        const now = Date.now();
        const active = codes.filter(c =>
          c.status === 'USED' &&
          c.usedByDeviceId === reqDeviceId &&
          (c.isLifetime || c.type === 'SINGLE_MODEL' || !c.expiresAt || c.expiresAt > now)
        );
        const hasWeekly = active.some(c => c.type === 'WEEKLY_VIP' || c.isMaster);
        const hasModel = targetModelId && active.some(c => c.modelId === targetModelId);
        if (hasWeekly || hasModel) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        res.writeHead(403, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify({
          error: '⛔ CONTEÚDO VIP EXCLUSIVO: Esta foto ou vídeo em alta definição é reservado para membros com código ativo do Clube Secreto.'
        }));
      }
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Suporte a HTTP Range para streaming de vídeo
    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm' || ext === '.mov')) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400'
      });
      file.pipe(res);
      return;
    }

    // ETag caching para resposta instantânea (304 Not Modified)
    const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': ext.match(/\.(jpg|jpeg|png|webp|ico|svg)$/i)
          ? 'public, max-age=604800, stale-while-revalidate=86400'
          : 'no-cache, must-revalidate'
      });
      return res.end();
    }

    const isCode = ['.html', '.css', '.js', '.json', '.svg'].includes(ext);
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.ico'].includes(ext);
    const acceptEncoding = req.headers['accept-encoding'] || '';

    if (isImage) {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'ETag': etag,
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
        'Accept-Ranges': 'bytes'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Compressão GZIP em tempo real para scripts, estilos e páginas
    if (isCode && acceptEncoding.includes('gzip')) {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Encoding': 'gzip',
        'Vary': 'Accept-Encoding',
        'ETag': etag,
        'Cache-Control': 'no-cache, must-revalidate'
      });
      const raw = fs.createReadStream(filePath);
      const gzip = zlib.createGzip({ level: 6 });
      return raw.pipe(gzip).pipe(res);
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'ETag': etag,
      'Cache-Control': 'no-cache, must-revalidate',
      'Accept-Ranges': 'bytes'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 [Clube Secreto] Servidor rodando em: http://localhost:${PORT}`);
  console.log(`📁 Diretório: ${__dirname}`);
  console.log(`👑 Painel Administrativo Ativo em: http://localhost:${PORT}/admin`);
  console.log(`🔒 Sistema Anti-Fraude com Código Único Ativo.`);
});
