const fs = require('fs');
const path = require('path');

const AUDIOS_DIR = path.join(__dirname, 'audios');

/**
 * Catálogo dos 21 áudios OGG/Opus nativos com metadados de funil.
 */
const AUDIO_DEFINITIONS = [
  {
    id: 'greeting_save',
    file: '01_greeting_salva_numero.ogg',
    title: 'Oi meu anjo já salva o meu número',
    category: 'abertura',
    role: 'Boas-vindas inicial + pedido para salvar o contato (1x no início)'
  },
  {
    id: 'how_are_you',
    file: '02_tudo_bem.ogg',
    title: 'Eu tô bem meu amor e vc?',
    category: 'abertura',
    role: 'Responde cumprimentos ("tudo bem?", "como você tá?")'
  },
  {
    id: 'who_i_am_short',
    file: '03_modelo_conteudo_adulto.ogg',
    title: 'Sou modelo fotográfica e vendo conteúdo adulto',
    category: 'apresentacao',
    role: 'Explica o que faz / vende quando o lead pergunta como funciona'
  },
  {
    id: 'who_i_am_sp',
    file: '04_trabalho_estudo_sp.ogg',
    title: 'Então meu amor, trabalho, estudo e sou modelo (SP)',
    category: 'apresentacao',
    role: 'História mais completa para quem puxa assunto sobre sua rotina'
  },
  {
    id: 'where_live_barueri',
    file: '05_moro_barueri_sp.ogg',
    title: 'Moro em Barueri SP',
    category: 'apresentacao',
    role: 'Responde diretamente quando perguntam onde você mora / cidade'
  },
  {
    id: 'ask_where_live',
    file: '06_vc_mora_aonde.ogg',
    title: 'Vc mora aonde?',
    category: 'rapport',
    role: 'Quebra-gelo leve para manter conversa antes de fechar'
  },
  {
    id: 'ask_work',
    file: '07_vc_trabalha_do_que.ogg',
    title: 'Vc trabalha do quê?',
    category: 'rapport',
    role: 'Quebra-gelo leve após lead dizer de onde é ou conversar mais'
  },
  {
    id: 'ask_interest_pack',
    file: '08_interesse_pacotes.ogg',
    title: 'Vc tem interesse em comprar um dos meus pacotes?',
    category: 'fechamento',
    role: 'Enviado logo após a Tabela de Preços para puxar o fechamento'
  },
  {
    id: 'video_call_price',
    file: '09_chamada_79_90.ogg',
    title: 'Valor chamada de vídeo 79,90',
    category: 'fechamento',
    role: 'Responde perguntas sobre chamada de vídeo / ao vivo / cam'
  },
  {
    id: 'real_check',
    file: '10_sou_real.ogg',
    title: 'Oi meu amor, claro que sou real, tô cansada dessa pergunta',
    category: 'objecao',
    role: 'Responde quando perguntam se é real, fake, robô, bot ou golpe'
  },
  {
    id: 'no_programa',
    file: '11_nao_faco_programa.ogg',
    title: 'Então bb eu não faço programa',
    category: 'objecao',
    role: 'Responde quando pedem encontro presencial, sair ou programa'
  },
  {
    id: 'need_be_client',
    file: '12_virar_meu_cliente.ogg',
    title: 'Para você ver mais tem que virar meu cliente',
    category: 'objecao',
    role: 'Responde quando pedem foto grátis, prévia ou mais amostras'
  },
  {
    id: 'only_pay_attention_clients',
    file: '13_atencao_so_clientes.ogg',
    title: 'Então bb eu só dou atenção para quem é meu cliente',
    category: 'objecao',
    role: 'Filtra curiosos que ficam só batendo papo sem comprar'
  },
  {
    id: 'help_me_help_you',
    file: '14_me_ajuda_que_eu_te_ajudo.ogg',
    title: 'Vc só pede as coisas e não me ajuda, me ajuda que eu te ajudo',
    category: 'objecao',
    role: '2ª insistência pedindo amostra grátis sem pagar'
  },
  {
    id: 'price_justify_expenses',
    file: '15_muitas_despesas.ogg',
    title: 'Pq meu amor, eu trabalho estudo e tenho muitas despesas',
    category: 'objecao',
    role: 'Justifica por que o conteúdo é pago (quando questionam cobrança)'
  },
  {
    id: 'too_expensive_call',
    file: '16_caro_nem_viu.ogg',
    title: 'Caro meu amor, vc nem viu meu conteúdo. E a chamada de vídeo...',
    category: 'objecao',
    role: 'Responde quando dizem que está caro ou sem valor'
  },
  {
    id: 'no_haggling',
    file: '17_nao_aceito_desvalorizar.ogg',
    title: 'Não aceito que digam o preço do meu trabalho',
    category: 'objecao',
    role: 'Responde pechincha agressiva ou tentativa de ditar o preço'
  },
  {
    id: 'discount_close',
    file: '18_escolha_pack_desconto.ogg',
    title: 'Escolha um dos meus pack que eu faço um desconto',
    category: 'fechamento',
    role: 'Para pedido de desconto ("faz menos?", "tem promoção?")'
  },
  {
    id: 'bed_teaser_video',
    file: '19_deitada_cama_video.ogg',
    title: 'Tô deitada na minha cama, vou te mandar um vídeo',
    category: 'teaser',
    role: 'Opcional: gancho antes de mandar um vídeo prévia (ative no Admin com mídia)'
  },
  {
    id: 'followup_table_ghost',
    file: '20_followup_apos_tabela.ogg',
    title: 'Engraçado que depois que mandei minha tabelinha vc não falou mais',
    category: 'followup',
    role: 'Follow-up automático 1x quando vê a tabela/PIX e some'
  },
  {
    id: 'followup_only_views',
    file: '21_followup_so_visualiza.ogg',
    title: 'Oi amor, você só visualiza minhas mensagens',
    category: 'followup',
    role: 'Follow-up automático 1x se continuar no vácuo após a 1ª cobrança'
  }
];

const AUDIO_CACHE = new Map();

/**
 * Calcula duração aproximada em segundos lendo a última página OggS (Opus 48kHz).
 * @param {Buffer} buf
 * @returns {number}
 */
function readOggOpusDurationSec(buf) {
  try {
    const marker = Buffer.from('OggS');
    const lastIdx = buf.lastIndexOf(marker);
    if (lastIdx >= 0 && lastIdx + 14 <= buf.length) {
      const granule = Number(buf.readBigInt64LE(lastIdx + 6));
      if (granule > 0 && Number.isFinite(granule)) {
        return Math.round((granule / 48000) * 10) / 10;
      }
    }
  } catch (err) {}
  return Math.max(3, Math.round((buf.length / 2200) * 10) / 10);
}

/**
 * Carrega e coloca em cache todos os áudios .ogg no boot para envio instantâneo.
 * @returns {Array<object>}
 */
function loadAudioCatalog() {
  return AUDIO_DEFINITIONS.map((def) => {
    const cached = AUDIO_CACHE.get(def.id);
    if (cached) return cached;

    const fullPath = path.join(AUDIOS_DIR, def.file);
    let exists = false;
    let sizeBytes = 0;
    let durationSec = 4.0;
    let base64 = '';

    try {
      if (fs.existsSync(fullPath)) {
        const buf = fs.readFileSync(fullPath);
        exists = true;
        sizeBytes = buf.length;
        durationSec = readOggOpusDurationSec(buf);
        base64 = buf.toString('base64');
      }
    } catch (err) {
      console.error(`[BotAudios] Falha ao ler ${def.file}:`, err.message);
    }

    const entry = {
      ...def,
      fullPath,
      exists,
      sizeBytes,
      durationSec,
      base64
    };
    AUDIO_CACHE.set(def.id, entry);
    return entry;
  });
}

/**
 * Busca um áudio pelo ID com base64 em memória.
 * @param {string} id
 * @returns {object|null}
 */
function getAudioById(id) {
  if (!AUDIO_CACHE.size) loadAudioCatalog();
  return AUDIO_CACHE.get(id) || null;
}

/**
 * Retorna catálogo público/admin sem o blob base64 pesado.
 * @param {object} [audioOverrides]
 * @returns {Array<object>}
 */
function listAudioMetadata(audioOverrides = {}) {
  return loadAudioCatalog().map((a) => ({
    id: a.id,
    file: a.file,
    title: a.title,
    category: a.category,
    role: a.role,
    exists: a.exists,
    sizeBytes: a.sizeBytes,
    durationSec: a.durationSec,
    enabled: audioOverrides[a.id]?.enabled !== false
  }));
}

module.exports = {
  AUDIOS_DIR,
  AUDIO_DEFINITIONS,
  loadAudioCatalog,
  getAudioById,
  listAudioMetadata
};
