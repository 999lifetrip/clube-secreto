const { getAudioById } = require('./audios-manifest');

const SLANG_REPLACEMENTS = [
  [/\bvc\b/g, 'voce'],
  [/\bvcs\b/g, 'voces'],
  [/\btd\b/g, 'tudo'],
  [/\btbm\b|\btb\b/g, 'tambem'],
  [/\bblz\b/g, 'beleza'],
  [/\bpq\b/g, 'porque'],
  [/\bqnt\b|\bqto\b|\bqt\b/g, 'quanto'],
  [/\bpfv\b|\bpfvr\b/g, 'por favor'],
  [/\bpgm\b/g, 'programa'],
  [/\bvdd\b/g, 'verdade'],
  [/\bchmd\b/g, 'chamada'],
  [/\bmnsg\b|\bmsg\b/g, 'mensagem'],
  [/\bobg\b/g, 'obrigado'],
  [/\bcdd\b/g, 'cidade'],
  [/\bonde mora\b|\bmora ond\b/g, 'mora onde'],
  // Gírias comuns observadas em conversas reais de WhatsApp
  [/\btopy\b/g, 'top'],
  [/\bmor\b/g, 'amor'],
  [/\btor\b/g, 'to'],
  [/\bnois\b/g, 'nos'],
  [/\bcifala\b|\bse fala\b/g, 'se fala'],
  [/\btra qui la\b/g, 'tranquila'],
  [/\beufalem\b|\beu falei\b/g, 'eu falei'],
  [/\bqui\b/g, 'que'],
  [/\bpro ter ja\b/g, 'proteja'],
  [/\bno i ty\b|\bnoity\b/g, 'noite']
];

/**
 * Normaliza texto removendo acentos, pontuação e gírias comuns de WhatsApp.
 * @param {string} raw
 * @returns {string}
 */
function normalizeText(raw) {
  let s = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s.,$0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, repl] of SLANG_REPLACEMENTS) {
    s = s.replace(pattern, repl);
  }
  return s;
}

function hasAny(norm, keywords) {
  return keywords.some((kw) => {
    if (kw instanceof RegExp) return kw.test(norm);
    return norm.includes(kw);
  });
}

function isAudioEnabled(audioId, cfg) {
  const def = getAudioById(audioId);
  if (!def || !def.exists || !def.base64) return false;
  if (audioId === 'bed_teaser_video' && !cfg.useBedTeaserAudio) return false;
  return cfg.audioOverrides?.[audioId]?.enabled !== false;
}

/**
 * POOLS DE VARIAÇÕES DINÂMICAS (ANTI-REPETIÇÃO & ANTI-BAN)
 * Garantem que mensagens enviadas a leads diferentes ou turnos subsequentes
 * nunca tenham exatamente a mesma assinatura de texto.
 */

// 4 Formatos distintos da Tabela de Preços para rotacionar
const TABLE_VARIANTS = [
  // Formato 1: Clássico com emojis roxos e claquetes
  (cfg) => [
    '💜 *TABELA DE PREÇOS*',
    '',
    '📸 1 Vídeo + 3 Fotos — R$ 5,00',
    '🎬 3 Vídeos + 5 Fotos — R$ 9,99',
    '🎬 5 Vídeos + 10 Fotos — R$ 14,99'
  ].join('\n'),

  // Formato 2: Clean com bullets estrelas
  (cfg) => [
    'Olha a minha tabelinha de pacotes meu amor 👇',
    '',
    '✨ 1 Vídeo e 3 Fotos por R$ 5,00',
    '✨ 3 Vídeos e 5 Fotos por R$ 9,99',
    '✨ 5 Vídeos e 10 Fotos por R$ 14,99'
  ].join('\n'),

  // Formato 3: Estilo carinhoso com tópicos
  (cfg) => [
    'Montei esses pacotes especiais pra você vida 💕',
    '',
    '• 1 Vídeo + 3 Fotos — R$ 5,00',
    '• 3 Vídeos + 5 Fotos — R$ 9,99',
    '• 5 Vídeos + 10 Fotos — R$ 14,99'
  ].join('\n'),

  // Formato 4: Direto e provocante com diamantes
  (cfg) => [
    'Dá uma olhadinha nos valores amorzinho 😈',
    '',
    '💎 1 Vídeo + 3 Fotos: R$ 5,00',
    '💎 3 Vídeos + 5 Fotos: R$ 9,99',
    '💎 5 Vídeos + 10 Fotos: R$ 14,99'
  ].join('\n')
];

const TABLE_INTROS = [
  'Olha os pacotinhos meu amor 👇\n\n',
  'Aqui tá minha tabelinha meu anjo 💜\n\n',
  'Dá uma olhada nos valores vida 😘\n\n',
  'Montei esses pacotinhos pra você amor 💕\n\n'
];

// Saudações variadas
const GREETING_VARIANTS = [
  'Oi meu amor 💞',
  'Oii vida, tudo bem com você? 😍',
  'Estou aqui meu anjo 💕',
  'Oie meu bem 💖',
  'Oi amor, como você tá? ✨',
  'Oii vida 💕 tava por aqui já',
  'Oiie meu bem 🥰 tudo certinho por aí?',
  'Oi amorzinho 💞'
];

// Perguntas suaves sobre qual pacote tem interesse (sem forçar PIX!)
const ASK_WHICH_PACKAGE_VARIANTS = [
  'Me diz qual opção te agradou mais meu amor 💜',
  'Qual pacotinho você quer fechar comigo vidinha? 😘',
  'Se quiser experimentar, o de R$ 5,00 já libera foto e vídeo rapidinho 💕',
  'Qual deles você prefere começar vida? 🙈',
  'Gostou de algum dos pacotes meu anjo? Me avisa aqui 💞',
  'Qual pacotinho você vai querer amorzinho? Me fala que te passo a chave ✨'
];

// Textos após envio do PIX (confirmação e envio do comprovante)
const POST_PIX_VARIANTS = [
  'Assim que você mandar o comprovante eu já libero tudinho pra você amor 💕',
  'Só me mandar a fotinha do comprovante aqui que eu já te envio na hora 😘',
  'Manda o print do comprovante por aqui amor, que já te entrego o conteúdo 💜',
  'Fazendo a transferência é só me mandar o comprovante que libero rapidinho 🥰',
  'Prontinho vidinha! Manda o comprovante aqui que já separo seus mimos 🔥',
  'Me manda o comprovante assim que fizer amor, pra eu já te liberar tudo 💕'
];

// Elogios casuais ("Você é muito topy", "linda", "gata") — respostas humanas, carinhosas e SEM empurrar venda!
const COMPLIMENT_VARIANTS = [
  'Obrigada pelo carinho meu anjo 🥰 você é um fofo!',
  'Aww fico toda boba assim vidinha haha 🙈 muito obrigada!',
  'Obrigada meu bem 💕 você que é maravilhoso!',
  'Que fofo você amor 😍 adorei o carinho!',
  'Obrigada amorzinho ✨ é muito bom receber esse carinho seu!',
  'Fico até sem jeito assim meu bem 💜 valeu mesmo pelo carinho!'
];

// Sem grana / sem dinheiro — NÃO INSISTE, agradece com carinho e respeita o lead!
const NO_MONEY_VARIANTS = [
  'Tranquilo meu amor, super entendo! Fica em paz 💕 Quando você estiver mais de boa me chama por aqui 😘',
  'Sem problemas nenhum vidinha, super compreendo! Quando pintar uma folga me dá um alô 🥰',
  'Relaxa amor, não tem problema nenhum! Fica com Deus e obrigado pela atenção 💕',
  'Tudo bem meu anjo, relaxa! Quando você puder é só me chamar por aqui tá bom? 😘'
];

// Indo dormir / tarde da noite
const SLEEP_LATE_VARIANTS = [
  'Tá certinho meu anjo, vai descansar! 😘 Amanhã ou quando quiser me chama por aqui 💕',
  'Vai lá descansar vida! Boa noite e bom sono 🥰 Quando acordar me dá um oi se quiser!',
  'Tranquilo amorzinho, dorme bem! Fica com Deus e até amanhã 💕',
  'Descansa bem meu amor! Amanhã a gente se fala com calma 😘'
];

// Bênçãos / Deus abençoe ("Deus proteja a noite", "fica com Deus")
const BLESSING_VARIANTS = [
  'Amém meu amor, que Deus te abençoe muito também! 🙏💕',
  'Amém vidinha! Deus te proteja e cuide de você também 😘🙏',
  'Muito obrigada pelas palavras de carinho amor! Deus te abençoe grandemente 🙏💜',
  'Amém meu anjo! Muito carinho pra você também e fica com Deus 💕'
];

// Despedidas educadas
const GOODBYE_VARIANTS = [
  'Tranquilo meu anjo, fica com Deus e obrigado pelo carinho! 😘 Quando quiser já sabe onde me achar 💕',
  'Sem problemas vidinha, precisando tô por aqui! Fica bem e boa noite 🥰',
  'Fica com Deus você também amorzinho 💕 um beijão pra você!',
  'Obrigada pela atenção e simpatia amor! Até uma próxima 😘✨'
];

// Lembretes sutis de preço
const PRICE_REMINDER_VARIANTS = [
  'A tabelinha tá ali em cima meu amor 💜 Me diz qual opção te agradou mais!',
  'Dá uma olhadinha nos pacotes ali em cima vidinha, qualquer dúvida tô aqui 😘',
  'O pacotinho de R$ 5,00 já vem com 1 vídeo e 3 fotos se quiser testar amorzinho 💕'
];

// Nudges suaves (máximo 2 em toda a vida do lead)
const NUDGE_VARIANTS = [
  'Oii meu amor, tudo bem por aí? Passando só pra te dar um oizinho 💕',
  'Se quiser dar uma olhadinha nos pacotinhos qualquer hora, tô por aqui amorzinho 😘 Beijinho!'
];

// Variações ricas para reengajar conversas antigas / visualizadas sem resposta ("Oi", "Opa", "Tudo bem?")
const REENGAGEMENT_VARIANTS = [
  'Oi meu amor, tudo bem por aí? 💕 Passando só pra te dar um oizinho!',
  'Opa vidinha, tudo certinho com você? 😘 Desculpa a correria!',
  'Oii meu anjo, como você tá? 🥰 Tava na correria e passei pra ver como vc tá!',
  'Opa amor, tudo bem? Vi que sua mensagem ficou aqui 🙈 tudo em paz por aí?',
  'Oi amorzinho 💕 como estão as coisas por aí? Tudo certinho?',
  'Oie meu bem! 😘 Passando pra te desejar uma ótima tarde, tudo bem?',
  'Opa vida, tudo jóia? 💕 Tava aqui organizando meus conteúdos e lembrei de você!',
  'Oi amor, tudo certinho? ✨ Qualquer coisa que precisar tô por aqui tá bom?',
  'Oii vida, como estão as coisas? 💕 Qualquer coisa tô por aqui viu!',
  'Opa meu anjo, passei pra te mandar um beijo! Como tá seu dia? 😘'
];

/**
 * Seleciona uma variação que o lead ainda NÃO tenha recebido.
 * @param {object} leadState
 * @param {Array<string|Function>} variantsList
 * @param {string} fallback
 * @returns {string}
 */
function pickUnsentVariant(leadState = {}, variantsList = [], fallback = '') {
  if (!Array.isArray(variantsList) || variantsList.length === 0) return fallback;
  const sentVariants = Array.isArray(leadState.sentTextVariants) ? leadState.sentTextVariants : [];
  const sentStrings = Array.isArray(leadState.sentTextStrings) ? leadState.sentTextStrings : [];
  const sentTexts = Array.isArray(leadState.sentTexts) ? leadState.sentTexts : [];

  const candidates = variantsList.filter((item) => {
    const raw = typeof item === 'function' ? item({}) : String(item);
    const norm = normalizeText(raw);
    return !sentVariants.includes(norm) && !sentStrings.includes(norm) && !sentTexts.includes(norm);
  });

  const pool = candidates.length > 0 ? candidates : variantsList;
  const idx = Math.floor(Math.random() * pool.length);
  const picked = pool[idx];
  return typeof picked === 'function' ? picked : String(picked);
}

/**
 * Monta o texto dinâmico da tabela de preços rotacionando entre os formatos disponíveis.
 * @param {object} cfg
 * @param {object} leadState
 * @returns {string}
 */
function buildDynamicPriceTableText(cfg, leadState = {}) {
  const isDefaultTable = !cfg.priceTableText || cfg.priceTableText.includes('TABELA DE PREÇOS');
  let chosen = '';

  if (isDefaultTable) {
    const tableFn = pickUnsentVariant(leadState, TABLE_VARIANTS);
    chosen = typeof tableFn === 'function' ? tableFn(cfg) : String(tableFn);
  } else {
    const intro = pickUnsentVariant(leadState, TABLE_INTROS, '');
    chosen = `${intro}${String(cfg.priceTableText).trim()}`;
  }

  if (cfg.includeVipSiteOption && cfg.vipSiteOptionText) {
    chosen = `${chosen}\n\n${String(cfg.vipSiteOptionText).trim()}`;
  }
  return chosen;
}

/**
 * Garante regra absoluta: áudios e textos nunca se repetem para o mesmo lead.
 */
function createTurnPlanner(leadState, cfg) {
  const actions = [];
  const plannedAudios = new Set(leadState.sentAudios || []);
  const plannedTexts = new Set(leadState.sentTexts || []);
  const sentStrings = new Set((leadState.sentTextStrings || []).map(normalizeText));

  // Trava anti-duplicação retroativa com base em todo o histórico gravado
  for (const h of (leadState.history || [])) {
    if ((h.role === 'bot_text' || h.role === 'bot_pix') && h.summary) {
      sentStrings.add(normalizeText(h.summary));
    }
  }

  let plannedPrevia = Boolean(leadState.sentPrevia);
  let audioCountThisTurn = 0;

  return {
    actions,
    hasAudio(audioId) {
      return plannedAudios.has(audioId);
    },
    hasText(textKey) {
      return plannedTexts.has(textKey);
    },
    hasPrevia() {
      return plannedPrevia;
    },
    pushAudio(audioId, fallbackText = '') {
      if (audioCountThisTurn >= 1) {
        if (fallbackText) this.pushText(`fb_${audioId}`, fallbackText, false);
        return false;
      }
      if (plannedAudios.has(audioId) || !isAudioEnabled(audioId, cfg)) {
        if (fallbackText) this.pushText(`fb_${audioId}`, fallbackText, false);
        return false;
      }
      plannedAudios.add(audioId);
      audioCountThisTurn++;
      actions.push({ type: 'audio', audioId });
      return true;
    },
    pushPreviewImage() {
      if (plannedPrevia || cfg.sendViewOncePreview === false || !cfg.previewImagePath) {
        return false;
      }
      plannedPrevia = true;
      actions.push({
        type: 'preview_image',
        filePath: cfg.previewImagePath,
        caption: cfg.previewCaption || '',
        viewOnce: true
      });
      return true;
    },
    pushText(key, text, allowRepeat = false) {
      const clean = String(text || '').trim();
      if (!clean) return false;
      const norm = normalizeText(clean);
      // Trava absoluta contra duplicação de texto no mesmo lead
      if (!allowRepeat && (plannedTexts.has(key) || sentStrings.has(norm))) {
        return false;
      }
      plannedTexts.add(key);
      sentStrings.add(norm);
      actions.push({ type: 'text', key, text: clean });
      return true;
    },
    pushPix(allowRepeat = true) {
      if (!allowRepeat && plannedTexts.has('pix_card')) return false;
      plannedTexts.add('pix_card');
      actions.push({ type: 'pix', key: 'pix_card' });
      return true;
    },
    pushTeaserVideo() {
      if (cfg.teaserVideoUrl) {
        actions.push({ type: 'video', url: String(cfg.teaserVideoUrl).trim(), caption: 'Olha um gostinho amor 🔥' });
        return true;
      }
      return false;
    }
  };
}

/**
 * Classifica as intenções de um turno consolidado (anti-rajada) sem usar IA paga.
 * @param {string} combinedText
 * @param {object} msgMeta
 * @param {object} leadState
 */
function classifyIntents(combinedText, msgMeta = {}, leadState = {}) {
  const norm = normalizeText(combinedText);
  const stage = leadState.stage || 'NEW';
  const hasMediaComprovante = Boolean(msgMeta.hasImage || msgMeta.hasDocument);

  const saidPaymentProof = hasAny(norm, [
    'comprovante', 'ja paguei', 'paguei', 'fiz o pix', 'mandei o pix',
    'transferi', 'pagamento feito', 'pago', 'enviei o pix', 'ta pago', 'realizado'
  ]);

  const wantsReceipt =
    (hasMediaComprovante && ['PRICING_SENT', 'PIX_SENT', 'PAYMENT_REVIEW'].includes(stage)) ||
    saidPaymentProof;

  // Bênçãos / Deus te abençoe / Deus proteja / Deus pro ter ja (typos comuns)
  const religiousBlessing = hasAny(norm, [
    'deus', 'abencoe', 'abençoe', 'proteja', 'proterja', 'pro ter ja', 'guarde',
    'fica com deus', 'fique com deus', 'va com deus', 'amem', 'gloria a deus'
  ]);

  // Indo dormir / tarde da noite
  const sleepOrLate = hasAny(norm, [
    'dormir', 'sono', 'ta tarde', 'muito tarde', 'ta muito tarde', 'bom descanso'
  ]);

  // Sem dinheiro / sem grana estrito (NUNCA insistir após isso!)
  const strictlyNoMoney = hasAny(norm, [
    'nao tem grana', 'nao tenho grana', 'sem grana', 'to sem grana', 'tor sem grana',
    'sem dinheiro', 'nao tenho dinheiro', 'to duro', 'tor duro', 'sem condicoes',
    'sem saldo', 'to liso', 'tor liso', 'to sem nada', 'sem um real', 'nao tenho um tostao',
    'to quebrado', 'to zerado', 'to sem limite', 'sem um puto', 'eu falei que to sem dinheiro',
    'falei que to sem', 'nao tem grana agora', 'sem grana agora', 'tor sem dinheiro', 'tor sem grana'
  ]);

  // Deixar para depois / aguardar
  const laterOrWait = hasAny(norm, [
    'depois nos se fala', 'depois a gente se fala', 'depois eu vejo', 'amanha eu',
    'depois eu', 'outro dia', 'mais tarde', 'quando receber', 'dia de pagamento',
    'fim do mes', 'calma amor fica tranquila'
  ]);

  // Despedida educada
  const politeGoodbye = hasAny(norm, [
    'beijo no seu coracao', 'ate mais', 'tchau', 'nao tenho interesse',
    'nao quero', 'agora nao', 'desculpa incomodar', 'boa noite ta',
    'obrigado pela atencao'
  ]);

  // Elogios casuais (tratar com carinho sem forçar venda)
  const casualCompliment = hasAny(norm, [
    'top', 'topy', 'gata', 'linda', 'maravilhosa', 'gostosa', 'delicia',
    'princesa', 'perfeita', 'apaixonei', 'tesao', 'muito gata', 'muito linda'
  ]);

  // Pergunta sobre ser real / fake / bot
  const isRealQuestion = hasAny(norm, [
    'fake', 'robo', 'e bot', 'vc e bot', 'voce e bot', 'inteligencia artificial',
    'automatico', 'e real', 'voce e real', 'vc e real', 'de verdade', 'golpe',
    'catfish', 'e mulher mesmo', 'audio gravado', 'mensagem pronta',
    'serio mesmo', 'e serio', 'verdade mesmo'
  ]);

  // Programa presencial
  const asksPrograma = hasAny(norm, [
    'faz programa', 'programa', 'encontro', 'sair comigo', 'presencial',
    'te ver pessoalmente', 'hotel', 'motel', 'ir ai', 'atende presencial', 'cache'
  ]);

  // Chamada de vídeo
  const asksVideoCall = hasAny(norm, [
    'chamada', 'chamado', 'videochamada', 'video chamada', 'cam ', 'ao vivo', '79,90', '79.90', 'call'
  ]);

  // Onde mora
  const asksWhereLive = hasAny(norm, [
    'mora onde', 'onde mora', 'onde vc mora', 'qual cidade', 'de onde',
    'voce e de onde', 'que lugar', 'bairro', 'regiao', 'barueri', 'sp'
  ]);

  // Quem é você
  const asksWhoAreYou = hasAny(norm, [
    'quem e voce', 'o que voce faz', 'voce trabalha', 'vc trabalha', 'estuda',
    'como funciona', 'me explica', 'o que voce vende', 'que conteudo', 'fala de voce',
    'clube secreto'
  ]);

  // Amostra grátis / prévia
  const asksFreeSample = hasAny(norm, [
    'gratis', 'de graca', 'amostra', 'previa', 'brinde', 'me mostra',
    'manda uma foto', 'manda foto', 'mandar foto', 'foto sua', 'manda um video',
    'um video seu', 'uma foto sua', 'ver voce', 'nude', 'nua',
    'pelada', 'peladinha', 'gostinho', 'mostra um pouco', 'sem pagar',
    'primeiro depois pago', 'confianca', 'visualizacao unica', 'foto pra mim ver',
    'uma foto pra eu ver', 'quero ver voce primeiro', 'ver primeiro',
    'nao vejo nada', 'nao vi nada', 'sem ver nada', 'ver nada ainda', 'vai depender de voce'
  ]);

  // Pechincha agressiva
  const hagglingPrice = hasAny(norm, [
    'muito caro isso', 'pago 2', 'pago 3', 'faco por 2', 'faco por 3', 'faz por 2',
    'faz por 3', 'nao vale', 'roubo', 'absurdo', 'por 1 real', 'pago 1'
  ]);

  // Pedido de desconto
  const wantsDiscount = hasAny(norm, [
    'desconto', 'faz menos', 'mais barato', 'promocao', 'abaixa', 'faz por menos',
    'nao tenho tudo', 'so tenho', 'valor eu nao tenho', 'nao tenho esse valor',
    'nao tenho esse'
  ]);

  // Muito caro (só considera se não disse categoricamente que está sem grana)
  const tooExpensive = !strictlyNoMoney && hasAny(norm, [
    'ta caro', 'caro', 'apertado', 'salgado', 'pesado'
  ]);

  const asksWhyCharge = hasAny(norm, [
    'porque cobra', 'por que cobra', 'cobra tudo', 'por que paga', 'porque tem que pagar'
  ]);

  const asksHowAreYou = hasAny(norm, [
    'tudo bem', 'tudo bom', 'como voce esta', 'como vai', 'como ta', 'b noite', 't bem'
  ]);

  // Áudio inaudível / falha técnica de áudio
  const audioInaudivel = hasAny(norm, ['audio inaudivel', 'audio_inaudivel', 'audio nao audivel', 'nao consegui ouvir']);

  // Pedido explícito de compra / PIX
  const explicitBuyOrPix = !asksFreeSample && !strictlyNoMoney && !laterOrWait && !sleepOrLate && !politeGoodbye && hasAny(norm, [
    'manda o pix', 'passa o pix', 'qual o pix', 'chave pix', 'pix', 'qr code',
    'quero comprar', 'vou pegar', 'quero o pack', 'quero esse', 'quero o de', 'o de 5',
    'o de 9', 'o de 10', 'o de 14', 'o de 15', '3 fotos', '5 fotos', '10 fotos',
    '3 videos', 'tres videos', '5 videos', 'cinco videos', '2 videos', 'dois videos',
    '14,99', '14.99', '9,99', '9.99', '15 reais', '5 reais', 'pacote de',
    'fechado', 'bora fechar', 'vou querer'
  ]);

  const asksPriceTable = hasAny(norm, [
    'tabela', 'preco', 'precos', 'valor', 'valores', 'quanto custa', 'quanto e',
    'quanto sai', 'pacote', 'pacotes', 'pack', 'packs', 'combo'
  ]);

  const hasObjectionOrInfoQuestion = Boolean(
    isRealQuestion || asksPrograma || asksFreeSample || hagglingPrice ||
    wantsDiscount || tooExpensive || strictlyNoMoney || laterOrWait || sleepOrLate || politeGoodbye ||
    asksWhyCharge || asksWhereLive || asksWhoAreYou || religiousBlessing
  );

  const positiveConfirmAfterPricing =
    !hasObjectionOrInfoQuestion &&
    ['PRICING_SENT', 'GREETED'].includes(stage) &&
    /^(sim|quero|quero sim|com certeza|com toda certeza|claro|pode mandar|manda o pix|passa a chave|bora fechar|fechou|tenho interesse|vamos fechar)(\s+(meu amor|amor|bb|linda|sim|entao|por favor))?$/.test(norm);

  // Reconhecimento casual neutro (ex: "ok", "beleza", "blz", "show", "tranquilo") — NÃO empurrar PIX!
  const casualAck = !hasObjectionOrInfoQuestion && !positiveConfirmAfterPricing &&
    /^(ok|blz|beleza|show|tranquilo|combinado|entendi|pode crer|ta bom|ta certo|certo)(\s+(meu amor|amor|bb|linda))?$/.test(norm);

  const isGreetingOnly = hasAny(norm, [
    /^(oi|ola|opa|eae|e ai|salve|bom dia|boa tarde|boa noite|hey|hello|oii+)\b/,
    'como podemos ajudar'
  ]);

  const gaveLocationOrJob = hasAny(norm, [
    'sou de ', 'moro em ', 'aqui em ', 'trabalho de ', 'trabalho com ',
    'sou motorista', 'sou autonomo', 'trabalho na ', 'trabalho no ', 'estado de '
  ]);

  return {
    norm,
    hasMediaComprovante,
    wantsReceipt,
    saidPaymentProof,
    audioInaudivel,
    religiousBlessing,
    sleepOrLate,
    strictlyNoMoney,
    laterOrWait,
    politeGoodbye,
    casualCompliment,
    isRealQuestion,
    asksPrograma,
    asksVideoCall,
    asksWhereLive,
    asksWhoAreYou,
    asksFreeSample,
    hagglingPrice,
    wantsDiscount,
    tooExpensive,
    asksWhyCharge,
    asksHowAreYou,
    explicitBuyOrPix,
    asksPriceTable,
    positiveConfirmAfterPricing,
    casualAck,
    isGreetingOnly,
    gaveLocationOrJob
  };
}

/**
 * Planeja as ações (áudios únicos, textos dinâmicos e PIX) para um turno de conversa.
 * Garante que mensagens nunca sejam repetidas e não seja insistente.
 */
function planTurnActions({ leadState, combinedText, msgMeta, cfg }) {
  const intents = classifyIntents(combinedText, msgMeta, leadState);
  const p = createTurnPlanner(leadState, cfg);
  let nextStage = leadState.stage || 'NEW';
  let pauseAfterTurn = false;
  let needsHumanReview = Boolean(leadState.needsHumanReview);

  // 1. Pagamento / Comprovante (prioridade máxima)
  if (intents.wantsReceipt) {
    if (intents.hasMediaComprovante) {
      p.pushText('receipt_received', cfg.receiptPendingText || 'Recebi seu comprovante amor! Vou conferir rapidinho aqui e já te libero 💕');
      nextStage = 'PAYMENT_REVIEW';
      pauseAfterTurn = true;
      needsHumanReview = true;
    } else {
      p.pushText('ask_receipt_media', cfg.receiptMissingMediaText || 'Pode me mandar a fotinha do comprovante aqui amor? Assim que enviar eu já libero tudo! 💕');
      if (!p.hasText('pix_card')) p.pushPix(false);
      nextStage = 'PIX_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 1.5 Áudio inaudível / falha técnica no áudio
  if (intents.audioInaudivel) {
    p.pushText(
      'audio_inaudivel_ack',
      'Poxa meu amor, meu sinal tá meio fraquinho aqui e não consegui ouvir o seu áudio direito 🙈 Me manda em texto ou me diz qual pacote você prefere vida? 💜',
      false
    );
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 2. Bênçãos religiosas ("Deus te abençoe", "Deus proteja a noite") — responder com carinho e respeito humano, SEM VENDER!
  if (intents.religiousBlessing) {
    if (!p.hasText('blessing_ack')) {
      const blessingText = pickUnsentVariant(leadState, BLESSING_VARIANTS, 'Amém meu amor, que Deus te abençoe muito também! 🙏💕');
      p.pushText('blessing_ack', blessingText, false);
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 3. Indo dormir / tarde da noite ("vou dormir", "ta tarde") — carinho e descanso, SEM PRESSÃO!
  if (intents.sleepOrLate) {
    if (!p.hasText('sleep_ack')) {
      const sleepText = pickUnsentVariant(leadState, SLEEP_LATE_VARIANTS, 'Tá certinho meu anjo, vai descansar! 😘 Amanhã ou quando quiser me chama por aqui 💕');
      p.pushText('sleep_ack', sleepText, false);
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 4. Sem grana / sem dinheiro estrito ("tô sem dinheiro", "não tem grana agora")
  // REGRA DE OURO: responde 1x com compreensão total e para de insistir. Se repetir, silêncio absoluto!
  if (intents.strictlyNoMoney) {
    if (p.hasText('no_money_ack') || (leadState.sentTexts || []).includes('no_money_ack')) {
      // Já avisou que compreende — silêncio educado para não parecer bot chato nem levar denúncia de spam!
      return { actions: [], nextStage, pauseAfterTurn: false, needsHumanReview, intents };
    }
    const noMoneyText = pickUnsentVariant(leadState, NO_MONEY_VARIANTS, 'Tranquilo meu amor, super entendo! Fica em paz 💕 Quando você estiver mais de boa me chama por aqui 😘');
    p.pushText('no_money_ack', noMoneyText, false);
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 5. Deixar para depois / aguardar ("depois nos se fala", "depois eu vejo")
  if (intents.laterOrWait) {
    if (!p.hasText('later_ack')) {
      const laterText = pickUnsentVariant(leadState, [
        'Combinado vida! Quando você puder me chama por aqui tá bom? 😘',
        'Tranquilo amor, fica em paz! Me dá um alô assim que você quiser 💕',
        'Sem pressa meu anjo, quando der me manda mensagem aqui 🥰'
      ], 'Combinado vida! Quando você puder me chama por aqui tá bom? 😘');
      p.pushText('later_ack', laterText, false);
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 6. Despedida educada ("fica com Deus", "beijo no coração")
  if (intents.politeGoodbye) {
    if (!p.hasText('goodbye_ack')) {
      const byeText = pickUnsentVariant(leadState, GOODBYE_VARIANTS, 'Tranquilo meu anjo, fica com Deus e obrigado pelo carinho! 😘 Quando quiser já sabe onde me achar 💕');
      p.pushText('goodbye_ack', byeText, false);
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 7. Pedido explícito de compra / PIX / confirmação positiva após ver tabela
  if (intents.explicitBuyOrPix || intents.positiveConfirmAfterPricing) {
    if (intents.asksVideoCall) {
      p.pushAudio('video_call_price', cfg.videoCallText);
      p.pushText('video_call_txt', cfg.videoCallText, false);
    } else {
      if (!p.hasText('price_table') && (leadState.messagesCount || 0) <= 1) {
        p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      }

      // Esclarece/confirma o pacote pedido pelo lead de forma carinhosa
      if (hasAny(intents.norm, ['5', 'cinco', '3 foto', 'tres foto', '1 video', 'um video'])) {
        p.pushText('pix_chosen_ack', 'Fechado amor! O pacotinho de R$ 5,00 (1 vídeo + 3 fotos) 💕 Segue a chave:', false);
      } else if (hasAny(intents.norm, ['9', 'nove', 'dez', '10', '5 foto', 'cinco foto', '3 video', 'tres video'])) {
        p.pushText('pix_chosen_ack', 'Maravilha vida! O pacote de R$ 9,99 (3 vídeos + 5 fotos) 💕 Segue a chave:', false);
      } else if (hasAny(intents.norm, ['14', '15', 'quatorze', 'quinze', '10 foto', 'dez foto', '5 video', 'cinco video'])) {
        p.pushText('pix_chosen_ack', 'Show de bola amor! O pacote completão de R$ 14,99 (5 vídeos + 10 fotos) 🔥 Segue a chave:', false);
      } else {
        p.pushText('pix_chosen_ack', 'Pode escolher o pacote que você preferir amor (R$ 5,00 / R$ 9,99 / R$ 14,99) 👇 Segue a chave:', false);
      }

      p.pushPix(true);
      const postPixText = pickUnsentVariant(leadState, POST_PIX_VARIANTS, cfg.postPixText || 'Assim que enviar o comprovante eu já libero o acesso amor 💕');
      p.pushText('post_pix', postPixText, false);
      nextStage = 'PIX_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 8. Elogios casuais ("Você é muito topy", "linda", "gata") — NÃO empurrar PIX ou pacotes agressivamente!
  if (intents.casualCompliment) {
    if (!p.hasText('compliment_ack')) {
      const compText = pickUnsentVariant(leadState, COMPLIMENT_VARIANTS, 'Obrigada pelo carinho meu anjo 🥰 você é um fofo!');
      p.pushText('compliment_ack', compText, false);
    } else if (!p.hasText('compliment_ack_2')) {
      const compText2 = pickUnsentVariant(leadState, COMPLIMENT_VARIANTS, 'Aww fico toda boba assim vidinha haha 🙈 muito obrigada!');
      p.pushText('compliment_ack_2', compText2, false);
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 8.5 Reconhecimento casual neutro ("ok", "beleza", "blz", "show", "tranquilo") — acolher carinhosamente SEM forçar PIX
  if (intents.casualAck) {
    if (!p.hasText('casual_ack')) {
      const ackText = pickUnsentVariant(leadState, [
        'Combinado amorzinho 💕 se quiser escolher um dos pacotes me dá um toque aqui tá bom? 😘',
        'Fechou vidinha! Qualquer coisa tô por aqui no Whats 🥰',
        'Beleza meu amor! Se quiser experimentar o de R$ 5,00 só me avisar 💕'
      ], 'Combinado amorzinho 💕 Qualquer coisa tô por aqui tá? 😘');
      p.pushText('casual_ack', ackText, false);
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 9. Chamada de vídeo
  if (intents.asksVideoCall) {
    const played = p.pushAudio('video_call_price', cfg.videoCallText);
    if (played) {
      p.pushText('video_call_txt', cfg.videoCallText, false);
    } else if (!p.hasText('pix_card')) {
      p.pushPix(false);
      const postPix = pickUnsentVariant(leadState, POST_PIX_VARIANTS, cfg.postPixText);
      p.pushText('post_pix', postPix, false);
      nextStage = 'PIX_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 10. Objeções diretas com áudios exclusivos
  if (intents.asksPrograma) {
    p.pushAudio(
      'no_programa',
      'Não faço programa ou encontro presencial amor, trabalho somente com meus packs e chamada de vídeo 😘'
    );
    if (!p.hasText('price_table')) {
      p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      nextStage = 'PRICING_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if (intents.isRealQuestion) {
    p.pushAudio(
      'real_check',
      'Claro que sou real meu amor 😅 Pode ficar tranquilo, tá? Quer ver minha tabelinha?'
    );
    if (!p.hasText('price_table')) {
      p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      nextStage = 'PRICING_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if (intents.hagglingPrice) {
    p.pushAudio(
      'no_haggling',
      'Eu valorizo meu trabalho meu amor, meus valores já são super acessíveis ❤️'
    );
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if (intents.wantsDiscount) {
    p.pushAudio(
      'discount_close',
      'Escolhe o pacote de R$ 14,99 amor que já vai super caprichado pra você 😈'
    );
    if (!p.hasText('price_table')) {
      p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      nextStage = 'PRICING_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if (intents.tooExpensive) {
    const playedExp = p.pushAudio(
      'too_expensive_call',
      'Poxa amor, o pacote inicial de R$ 5,00 já vem 1 vídeo + 3 fotos pra você conhecer meu trabalho! 💕'
    );
    if (!playedExp) {
      p.pushAudio('discount_close', 'Escolhe um dos packs que já vale super a pena amor 💜');
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if (intents.asksWhyCharge) {
    p.pushAudio(
      'price_justify_expenses',
      'Eu trabalho, estudo e invisto no meu conteúdo amor, por isso é pago 💕'
    );
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if (intents.asksFreeSample) {
    if (!p.hasPrevia() && p.pushPreviewImage()) {
      p.pushAudio('need_be_client', 'Olha essa prévia amor 😈 Para ver mais tem que virar meu cliente!');
      if (!p.hasText('price_table')) {
        p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      }
      nextStage = 'PRICING_SENT';
    } else if (cfg.useBedTeaserAudio && cfg.teaserVideoUrl && !p.hasAudio('bed_teaser_video')) {
      p.pushAudio('bed_teaser_video');
      p.pushTeaserVideo();
      nextStage = 'PRICING_SENT';
    } else if (!p.hasAudio('need_be_client')) {
      p.pushAudio('need_be_client', 'Para ver mais tem que virar meu cliente amor 😈');
      if (!p.hasText('price_table')) {
        p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      }
      nextStage = 'PRICING_SENT';
    } else {
      p.pushAudio(
        'help_me_help_you',
        'Me ajuda que eu te ajudo amor 💕 A partir de R$ 5,00 você já garante conteúdo!'
      );
      if (!p.hasText('pix_card')) {
        p.pushPix(false);
        const postPix = pickUnsentVariant(leadState, POST_PIX_VARIANTS, cfg.postPixText);
        p.pushText('post_pix', postPix, false);
        nextStage = 'PIX_SENT';
      }
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 11. Informações pessoais / onde mora / quem é
  if (intents.asksWhereLive) {
    p.pushAudio('where_live_barueri', 'Moro em Barueri, SP meu amor 💕');
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if (intents.asksWhoAreYou && !intents.asksPriceTable) {
    const playedIntro = p.pushAudio(
      'who_i_am_short',
      'Sou modelo e vendo meu conteúdo exclusivo aqui meu amor 💜'
    );
    if (!playedIntro) {
      p.pushAudio('who_i_am_sp', 'Trabalho, estudo e faço meus ensaios aqui em SP amor!');
    }
    if (!p.hasText('price_table')) {
      p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      nextStage = 'PRICING_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 12. Pedido de tabela / "Quanto custa?" / "Tudo bem?"
  if (intents.asksPriceTable || intents.asksHowAreYou) {
    if (!p.hasText('price_table')) {
      p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      if (intents.asksHowAreYou && !p.hasAudio('how_are_you')) {
        p.pushAudio('how_are_you', cfg.greetingText);
      } else {
        p.pushAudio('ask_interest_pack', 'Qual pacote te interessou mais meu amor?');
      }
      nextStage = 'PRICING_SENT';
    } else if (intents.asksHowAreYou && !p.hasAudio('how_are_you')) {
      p.pushAudio('how_are_you', 'Tô ótima meu amor e você? 💜');
    } else if (!p.hasAudio('ask_interest_pack')) {
      p.pushAudio('ask_interest_pack', 'Qual pacote você vai querer fechar comigo amor? 💜');
    } else if (!p.hasText('price_reminder')) {
      const reminder = pickUnsentVariant(leadState, PRICE_REMINDER_VARIANTS, 'A tabelinha tá ali em cima meu amor 💜 Me diz qual opção te agradou mais!');
      p.pushText('price_reminder', reminder, false);
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 13. Primeira mensagem simples ("Oi", "Boa noite", figurinha, "Como podemos ajudar?")
  if (nextStage === 'NEW') {
    if (intents.norm.includes('clube secreto') || intents.norm.includes('ajudar')) {
      p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      p.pushAudio('ask_interest_pack');
      nextStage = 'PRICING_SENT';
    } else {
      const isOldBacklog = Boolean(leadState.isBacklog || leadState.isReengagement);
      const greetingPool = isOldBacklog ? REENGAGEMENT_VARIANTS : GREETING_VARIANTS;
      const greetingLine = pickUnsentVariant(leadState, greetingPool, 'Oi meu amor 💞');
      const sentAudio = !isOldBacklog ? p.pushAudio('greeting_save', greetingLine) : false;
      if (!sentAudio) p.pushText('greeting_txt', greetingLine, false);
      nextStage = 'GREETED';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 14. Progressão natural pós-saudação
  if (nextStage === 'GREETED') {
    if (!p.hasText('price_table')) {
      p.pushText('price_table', buildDynamicPriceTableText(cfg, leadState), false);
      p.pushAudio('ask_interest_pack', 'Quer dar uma olhada nos pacotes amor? 💜');
      nextStage = 'PRICING_SENT';
      return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
    }
  }

  // 15. Lead falou de cidade / profissão
  if (intents.gaveLocationOrJob) {
    if (!p.hasAudio('ask_work') && intents.norm.includes('moro')) {
      p.pushAudio('ask_work', 'Legal meu amor! E vc trabalha com o quê?');
    } else if (!p.hasAudio('who_i_am_sp')) {
      p.pushAudio('who_i_am_sp', 'Que top amor! Eu trabalho, estudo e faço meus conteúdos 💕');
    } else {
      p.pushAudio(
        'only_pay_attention_clients',
        'Vem escolher um pacote comigo amor pra gente aproveitar juntos 💜'
      );
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 16. Fallback suave pós-tabela (PRICING_SENT / PIX_SENT)
  // Varia as abordagens e cessa totalmente após 2 interações para não cansar o lead nem ser banido
  if (['PRICING_SENT', 'PIX_SENT'].includes(nextStage)) {
    const alreadySentVariants = (leadState.sentTexts || []).includes('ask_package_variant');
    const alreadyNudge = (leadState.sentTexts || []).includes('final_soft_nudge');

    if (!p.hasAudio('ask_where_live') && nextStage === 'PRICING_SENT') {
      p.pushAudio('ask_where_live', 'De onde você é meu amor? 😘');
    } else if (!p.hasText('ask_package_variant') && !alreadySentVariants) {
      const askVariant = pickUnsentVariant(leadState, ASK_WHICH_PACKAGE_VARIANTS, 'Qual pacotinho te agradou mais meu amor? 💜');
      p.pushText('ask_package_variant', askVariant, false);
    } else if (!p.hasAudio('only_pay_attention_clients') && (leadState.messagesCount || 0) >= 3) {
      p.pushAudio('only_pay_attention_clients');
    } else if (!p.hasText('final_soft_nudge') && !alreadyNudge) {
      const nudge = pickUnsentVariant(leadState, NUDGE_VARIANTS, 'Qualquer coisa tô por aqui amorzinho 😘');
      p.pushText('final_soft_nudge', nudge, false);
    }
    // Depois disso, silêncio educado (actions = [])
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if ((leadState.messagesCount || 0) <= 2 && !p.hasText('default_fallback')) {
    p.pushText('default_fallback', 'Me diz o que você tá procurando meu amor 😘', false);
  }
  return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
}

module.exports = {
  normalizeText,
  classifyIntents,
  planTurnActions,
  buildDynamicPriceTableText,
  pickUnsentVariant,
  TABLE_VARIANTS,
  GREETING_VARIANTS,
  ASK_WHICH_PACKAGE_VARIANTS,
  POST_PIX_VARIANTS,
  COMPLIMENT_VARIANTS,
  NO_MONEY_VARIANTS,
  SLEEP_LATE_VARIANTS,
  BLESSING_VARIANTS,
  GOODBYE_VARIANTS,
  NUDGE_VARIANTS,
  REENGAGEMENT_VARIANTS
};
