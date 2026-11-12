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
  [/\bonde mora\b|\bmora ond\b/g, 'mora onde']
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
 * Garante regra absoluta: um áudio NUNCA é selecionado se já estiver em sentAudios
 * ou se já foi enfileirado neste mesmo turno.
 */
function createTurnPlanner(leadState, cfg) {
  const actions = [];
  const plannedAudios = new Set(leadState.sentAudios || []);
  const plannedTexts = new Set(leadState.sentTexts || []);
  let audioCountThisTurn = 0;

  return {
    actions,
    hasAudio(audioId) {
      return plannedAudios.has(audioId);
    },
    hasText(textKey) {
      return plannedTexts.has(textKey);
    },
    pushAudio(audioId, fallbackText = '') {
      if (audioCountThisTurn >= 2) {
        if (fallbackText) actions.push({ type: 'text', key: `fb_${audioId}`, text: fallbackText });
        return false;
      }
      if (plannedAudios.has(audioId) || !isAudioEnabled(audioId, cfg)) {
        if (fallbackText) actions.push({ type: 'text', key: `fb_${audioId}`, text: fallbackText });
        return false;
      }
      plannedAudios.add(audioId);
      audioCountThisTurn++;
      actions.push({ type: 'audio', audioId });
      return true;
    },
    pushText(key, text, allowRepeat = true) {
      const clean = String(text || '').trim();
      if (!clean) return false;
      if (!allowRepeat && plannedTexts.has(key)) return false;
      plannedTexts.add(key);
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

function buildFullPriceTableText(cfg) {
  const base = String(cfg.priceTableText || '').trim();
  if (cfg.includeVipSiteOption && cfg.vipSiteOptionText) {
    return `${base}\n\n${String(cfg.vipSiteOptionText).trim()}`;
  }
  return base;
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

  const isRealQuestion = hasAny(norm, [
    'fake', 'robo', 'e bot', 'vc e bot', 'voce e bot', 'inteligencia artificial',
    'automatico', 'e real', 'voce e real', 'vc e real', 'de verdade', 'golpe',
    'catfish', 'e mulher mesmo', 'audio gravado', 'mensagem pronta'
  ]);

  const asksPrograma = hasAny(norm, [
    'faz programa', 'programa', 'encontro', 'sair comigo', 'presencial',
    'te ver pessoalmente', 'hotel', 'motel', 'ir ai', 'atende presencial', 'cache'
  ]);

  const asksVideoCall = hasAny(norm, [
    'chamada', 'videochamada', 'video chamada', 'cam ', 'ao vivo', '79,90', '79.90', 'call'
  ]);

  const asksWhereLive = hasAny(norm, [
    'mora onde', 'onde mora', 'onde vc mora', 'qual cidade', 'de onde',
    'voce e de onde', 'que lugar', 'bairro', 'regiao', 'barueri', 'sp'
  ]);

  const asksWhoAreYou = hasAny(norm, [
    'quem e voce', 'o que voce faz', 'voce trabalha', 'vc trabalha', 'estuda',
    'como funciona', 'me explica', 'o que voce vende', 'que conteudo', 'fala de voce',
    'clube secreto'
  ]);

  const asksFreeSample = hasAny(norm, [
    'gratis', 'de graca', 'amostra', 'previa', 'manda uma foto', 'manda foto',
    'mandar foto', 'foto sua', 'manda um video', 'ver voce', 'nude', 'pelada',
    'gostinho', 'mostra um pouco', 'sem pagar', 'primeiro depois pago', 'confianca'
  ]);

  const hagglingPrice = hasAny(norm, [
    'muito caro isso', 'pago 2', 'pago 3', 'faco por 2', 'faco por 3', 'faz por 2',
    'faz por 3', 'nao vale', 'roubo', 'absurdo', 'por 1 real', 'pago 1'
  ]);

  const wantsDiscount = hasAny(norm, [
    'desconto', 'faz menos', 'mais barato', 'promocao', 'abaixa', 'faz por menos',
    'nao tenho tudo', 'so tenho'
  ]);

  const tooExpensive = hasAny(norm, [
    'ta caro', 'caro', 'sem dinheiro', 'liso', 'apertado', 'salgado', 'pesado'
  ]);

  const asksWhyCharge = hasAny(norm, [
    'porque cobra', 'por que cobra', 'cobra tudo', 'por que paga', 'porque tem que pagar'
  ]);

  const asksHowAreYou = hasAny(norm, [
    'tudo bem', 'tudo bom', 'como voce esta', 'como vai', 'como ta', 'b noite', 't bem'
  ]);

  const explicitBuyOrPix = hasAny(norm, [
    'manda o pix', 'passa o pix', 'qual o pix', 'chave pix', 'pix', 'qr code',
    'quero comprar', 'vou pegar', 'quero o pack', 'quero esse', '1 foto', 'um foto',
    '1 video', 'um video', '2 videos', 'dois videos', '14,99', '14.99', '9,99', '9.99',
    '15 reais', '5 reais', 'pacote de', 'fechado', 'bora fechar', 'vou querer'
  ]);

  const asksPriceTable = hasAny(norm, [
    'tabela', 'preco', 'precos', 'valor', 'valores', 'quanto custa', 'quanto e',
    'quanto sai', 'pacote', 'pacotes', 'pack', 'packs', 'combo', 'clube secreto'
  ]);

  const hasObjectionOrInfoQuestion = Boolean(
    isRealQuestion || asksPrograma || asksFreeSample || hagglingPrice ||
    wantsDiscount || tooExpensive || asksWhyCharge || asksWhereLive || asksWhoAreYou
  );

  const positiveConfirmAfterPricing =
    !hasObjectionOrInfoQuestion &&
    ['PRICING_SENT', 'GREETED'].includes(stage) &&
    /^(sim|quero|quero sim|com certeza|com toda certeza|claro|pode mandar|manda ai|bora|fechou|tenho interesse|tenho|aceito|ok|blz|beleza|show|vamos|por favor|pode ser)(\s+(meu amor|amor|bb|linda|sim|entao|por favor))?$/.test(norm);

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
    isGreetingOnly,
    gaveLocationOrJob
  };
}

/**
 * Planeja as ações (áudios únicos, textos e PIX) para um turno de conversa.
 * Garante que nenhum áudio já enviado ao lead seja repetido.
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
      p.pushText('receipt_received', cfg.receiptPendingText);
      nextStage = 'PAYMENT_REVIEW';
      pauseAfterTurn = true;
      needsHumanReview = true;
    } else {
      p.pushText('ask_receipt_media', cfg.receiptMissingMediaText);
      if (!p.hasText('pix_card')) p.pushPix(true);
      nextStage = 'PIX_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 2. Pedido explícito de compra / PIX / confirmação após tabela
  if (intents.explicitBuyOrPix || intents.positiveConfirmAfterPricing) {
    if (intents.asksVideoCall) {
      p.pushAudio('video_call_price', cfg.videoCallText);
      p.pushText('video_call_txt', cfg.videoCallText, false);
    } else if (!p.hasText('price_table') && (leadState.messagesCount || 0) <= 1) {
      p.pushText('price_table', buildFullPriceTableText(cfg), false);
    }

    p.pushPix(true);
    p.pushText('post_pix', cfg.postPixText);
    nextStage = 'PIX_SENT';
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 3. Chamada de vídeo
  if (intents.asksVideoCall) {
    const played = p.pushAudio('video_call_price', cfg.videoCallText);
    if (played) {
      p.pushText('video_call_txt', cfg.videoCallText);
    } else if (!p.hasText('pix_card')) {
      p.pushPix(true);
      p.pushText('post_pix', cfg.postPixText);
      nextStage = 'PIX_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 4. Objeções diretas (sempre prioridade de áudio inédito!)
  if (intents.asksPrograma) {
    p.pushAudio(
      'no_programa',
      'Não faço programa ou encontro presencial amor, trabalho somente com meus packs e chamada de vídeo 😘'
    );
    if (!p.hasText('price_table')) {
      p.pushText('price_table', buildFullPriceTableText(cfg), false);
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
      p.pushText('price_table', buildFullPriceTableText(cfg), false);
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
      p.pushText('price_table', buildFullPriceTableText(cfg), false);
      nextStage = 'PRICING_SENT';
    }
    p.pushPix(false);
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  if (intents.tooExpensive) {
    const playedExp = p.pushAudio(
      'too_expensive_call',
      'Poxa amor, a foto é só R$ 5,00 pra você conhecer meu trabalho! Vale muito a pena 💕'
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
    if (cfg.useBedTeaserAudio && cfg.teaserVideoUrl && !p.hasAudio('bed_teaser_video')) {
      p.pushAudio('bed_teaser_video');
      p.pushTeaserVideo();
      p.pushAudio('ask_interest_pack');
      nextStage = 'PRICING_SENT';
    } else if (!p.hasAudio('need_be_client')) {
      p.pushAudio('need_be_client', 'Para ver mais tem que virar meu cliente amor 😈');
      if (!p.hasText('price_table')) {
        p.pushText('price_table', buildFullPriceTableText(cfg), false);
        p.pushAudio('ask_interest_pack');
        nextStage = 'PRICING_SENT';
      }
    } else {
      p.pushAudio(
        'help_me_help_you',
        'Me ajuda que eu te ajudo amor 💕 A partir de R$ 5,00 você já garante conteúdo!'
      );
      if (!p.hasText('pix_card')) {
        p.pushPix(false);
        p.pushText('post_pix', cfg.postPixText);
        nextStage = 'PIX_SENT';
      }
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 5. Informações pessoais / persona / onde mora
  if (intents.asksWhereLive) {
    p.pushAudio('where_live_barueri', 'Moro em Barueri, SP meu amor 💕');
    p.pushAudio('ask_where_live');
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
      p.pushText('price_table', buildFullPriceTableText(cfg), false);
      p.pushAudio('ask_interest_pack');
      nextStage = 'PRICING_SENT';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 6. Pedido de tabela / "O que é o Clube Secreto?" / Cumprimento completo igual ao print
  if (intents.asksPriceTable || intents.asksHowAreYou) {
    if (intents.asksHowAreYou) {
      p.pushAudio('how_are_you', cfg.greetingText);
    } else if (nextStage === 'NEW') {
      p.pushText('greeting_txt', cfg.greetingText, false);
    }

    if (intents.asksPriceTable || intents.asksHowAreYou) {
      if (!p.hasText('price_table')) {
        p.pushText('price_table', buildFullPriceTableText(cfg), false);
        p.pushAudio('ask_interest_pack', 'Qual pacote ou opção te chamou mais atenção meu amor?');
        nextStage = 'PRICING_SENT';
      } else {
        p.pushText(
          'price_reminder',
          'Os valores tão ali em cima meu amor 💜 Me diz qual opção vc quer que já mando o PIX!'
        );
      }
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 7. Primeira mensagem simples ("Oi", "Boa noite", figurinha, "Oi! Como podemos ajudar?")
  if (nextStage === 'NEW') {
    p.pushText('greeting_txt', cfg.greetingText, false);
    const playedGreeting = p.pushAudio('greeting_save');
    if (intents.norm.includes('clube secreto') || intents.norm.includes('ajudar') || !playedGreeting) {
      p.pushText('price_table', buildFullPriceTableText(cfg), false);
      p.pushAudio('ask_interest_pack');
      nextStage = 'PRICING_SENT';
    } else {
      nextStage = 'GREETED';
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  // 8. Progressão natural de conversa pós-saudação ou rapport
  if (nextStage === 'GREETED') {
    if (!p.hasText('price_table')) {
      p.pushText('price_table', buildFullPriceTableText(cfg), false);
      p.pushAudio('ask_interest_pack', 'Quer dar uma olhada nos pacotes amor? 💜');
      nextStage = 'PRICING_SENT';
      return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
    }
  }

  // Se lead puxou papo falando de cidade/trabalho ou papo fiado após ver tabela
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

  // Fallback quando o lead manda algo genérico depois de receber a tabela
  if (['PRICING_SENT', 'PIX_SENT'].includes(nextStage)) {
    if (!p.hasAudio('only_pay_attention_clients')) {
      p.pushAudio(
        'only_pay_attention_clients',
        'Qual dos pacotes você quer fechar comigo meu amor? Já te mando tudo certinho 💜'
      );
    } else if (!p.hasAudio('ask_where_live') && nextStage === 'PRICING_SENT') {
      p.pushAudio(
        'ask_where_live',
        'Qual pacote te interessou mais meu amor (R$ 5,00 / R$ 9,99 / R$ 14,99)?'
      );
    } else {
      p.pushText(
        'close_loop',
        'Me diz qual pacote você quer amor (R$ 5,00 / R$ 9,99 / R$ 14,99) que já mando o PIX 💜'
      );
    }
    return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
  }

  p.pushText('default_fallback', 'Me diz o que você tá procurando meu amor 😘');
  return { actions: p.actions, nextStage, pauseAfterTurn, needsHumanReview, intents };
}

module.exports = {
  normalizeText,
  classifyIntents,
  planTurnActions,
  buildFullPriceTableText
};
