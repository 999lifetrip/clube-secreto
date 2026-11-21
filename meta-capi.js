const https = require('https');
const crypto = require('crypto');

/**
 * Utilitário de hash SHA-256 para dados sensíveis (requisito da Meta CAPI)
 */
function sha256(str) {
  if (!str) return null;
  return crypto.createHash('sha256').update(String(str).trim().toLowerCase()).digest('hex');
}

/**
 * Envia evento Purchase via Meta Conversions API (CAPI) Server-Side
 * Somente quando o administrador confirmar o pagamento real!
 *
 * @param {Object} params
 * @param {string} params.orderId - Identificador único do pedido/lead (ex: order_1795245890)
 * @param {number|string} params.value - Valor monetário da compra (ex: 20.00)
 * @param {string} [params.currency='BRL'] - Moeda ISO (BRL)
 * @param {string} [params.phone] - Telefone do cliente com DDI e DDD (ex: 5541999999999)
 * @param {string} [params.email] - E-mail do cliente (opcional)
 * @param {string} [params.clientIp] - Endereço IP do cliente
 * @param {string} [params.userAgent] - User Agent do navegador
 * @param {string} [params.eventSourceUrl] - URL da página onde a conversão ocorreu
 */
async function sendMetaCapiPurchase({
  orderId,
  value = 20.00,
  currency = 'BRL',
  phone,
  email,
  clientIp,
  userAgent,
  eventSourceUrl = 'https://clubesecreto.omelhorvendedoronline.com.br/tv'
}) {
  const pixelId = (process.env.META_PIXEL_ID || '').replace(/\D/g, '');
  const capiToken = (process.env.META_CAPI_TOKEN || '').trim();

  if (!pixelId || !capiToken) {
    console.log('ℹ️ [Meta CAPI] Evento Purchase retido: META_PIXEL_ID ou META_CAPI_TOKEN ainda não configurado no ambiente.');
    return {
      success: false,
      status: 'unconfigured_credentials',
      message: 'Configure META_PIXEL_ID e META_CAPI_TOKEN nas variáveis de ambiente para ativar o CAPI.'
    };
  }

  const normalizedPhone = phone ? String(phone).replace(/\D/g, '') : null;
  const userData = {
    client_ip_address: clientIp || null,
    client_user_agent: userAgent || null
  };

  if (normalizedPhone) userData.ph = [sha256(normalizedPhone)];
  if (email) userData.em = [sha256(email)];

  const eventPayload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: 'purchase_' + (orderId || Date.now()), // Proteção contra duplicação de evento
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: {
          currency: currency,
          value: parseFloat(value) || 20.00
        }
      }
    ]
  };

  return new Promise((resolve) => {
    const postData = JSON.stringify(eventPayload);
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/v21.0/${pixelId}/events?access_token=${capiToken}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('✅ [Meta CAPI] Evento Purchase enviado com sucesso:', json);
          resolve({ success: true, response: json });
        } catch(e) {
          console.error('❌ [Meta CAPI] Erro ao processar resposta:', data);
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ [Meta CAPI] Falha na requisição:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  sendMetaCapiPurchase,
  sha256
};
