const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function checkAdminAuth(req, urlObj) {
  const authHeader = req.headers['x-admin-key'] || req.headers['authorization'];
  const queryKey = urlObj.searchParams.get('key');
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : queryKey;
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

      const norm = str => (str || '').replace(/[-\s_]/g, '').toUpperCase();
      const inputNorm = norm(code);
      const codes = loadVipCodes();
      const codeRecord = codes.find(c => norm(c.code) === inputNorm);

      // Código inexistente
      if (!codeRecord) {
        return sendJson(res, 404, {
          success: false,
          error: 'Código inválido ou inexistente. Verifique se digitou corretamente.'
        });
      }

      const now = Date.now();

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
          if (codeRecord.expiresAt && codeRecord.expiresAt > now) {
            const daysLeft = Math.ceil((codeRecord.expiresAt - now) / (1000 * 60 * 60 * 24));
            return sendJson(res, 200, {
              success: true,
              plan: codeRecord.label,
              type: codeRecord.type,
              isWeeklyVip: codeRecord.type === 'WEEKLY_VIP',
              modelId: codeRecord.modelId,
              expiresAt: codeRecord.expiresAt,
              message: `✅ Código revalidado neste dispositivo! Válido por mais ${daysLeft} dia(s).`
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

      const durationMs = (codeRecord.durationDays || 7) * 24 * 60 * 60 * 1000;
      codeRecord.status = 'USED';
      codeRecord.usedByDeviceId = deviceId;
      codeRecord.usedAt = now;
      codeRecord.expiresAt = now + durationMs;

      saveVipCodes(codes);

      const days = codeRecord.durationDays || 7;
      return sendJson(res, 200, {
        success: true,
        plan: codeRecord.label,
        type: codeRecord.type,
        isWeeklyVip: codeRecord.type === 'WEEKLY_VIP',
        modelId: resolvedModelId,
        expiresAt: codeRecord.expiresAt,
        message: codeRecord.type === 'WEEKLY_VIP'
          ? `🎉 PLANO SEMANAL VIP ATIVADO! Acesso completo a todas as modelos por ${days} dias!`
          : `🎉 PACK INDIVIDUAL ATIVADO! Acesso completo liberado para esta modelo por ${days} dias!`
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
        c.expiresAt && c.expiresAt > now
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

      const item = model.previews.find(p => (typeof p === 'object' ? p.url : p) === mediaUrl);
      if (!item) {
        return sendJson(res, 404, { success: false, error: 'Mídia não encontrada.' });
      }

      if (typeof item === 'object') {
        item.isTeaser = !!isTeaser;
      }

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

      saveCatalog(catalog);
      return sendJson(res, 200, { success: true, message: `Definido como ${role} com sucesso!` });
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
          label = modelId ? `Pack Individual (${modelId})` : 'Pack Individual (R$ 9,90)';
          price = '9,90';
        }

        const record = {
          code: codeStr,
          type: type || 'SINGLE_MODEL',
          label: label,
          modelId: modelId || null,
          price: price,
          durationDays: 7,
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
        'Cache-Control': 'no-cache'
      });
      file.pipe(res);
      return;
    }

    const isCode = ['.html', '.css', '.js', '.json'].includes(ext);
    const cacheHeader = isCode ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheHeader,
      'Pragma': 'no-cache',
      'Expires': '0'
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
