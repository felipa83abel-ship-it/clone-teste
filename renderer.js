// @ts-check
/* global HTMLElement */

/* ================================ */
//	IMPORTES E DEPENDÊNCIAS
/* ================================ */

const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const hljs = require('highlight.js');
const {
  startAudioDeepgram,
  stopAudioDeepgram,
  switchDeviceDeepgram,
} = require('./stt/stt-deepgram.js'); // reorganizado em pasta stt/
const { startAudioVosk, stopAudioVosk, switchDeviceVosk } = require('./stt/stt-vosk.js'); // reorganizado em pasta stt/
const {
  startAudioWhisper,
  stopAudioWhisper,
  switchDeviceWhisper,
} = require('./stt/stt-whisper.js'); // reorganizado em pasta stt/
const {
  startAudioVolumeMonitor,
  stopAudioVolumeMonitor,
  switchAudioVolumeDevice,
} = require('./audio/volume-audio-monitor.js');

/* ================================ */
//	🎯 NOVAS CLASSES (Refatoração Fase 2)
/* ================================ */
const AppState = require('./state/AppState.js');
const EventBus = require('./events/EventBus.js');
const Logger = require('./utils/Logger.js');
const mockRunner = require('./testing/mock-runner.js'); // 🎭 Mock para teste em MODE_DEBUG
const STTStrategy = require('./strategies/STTStrategy.js');
const LLMManager = require('./llm/LLMManager.js');
const openaiHandler = require('./llm/handlers/openai-handler.js');
const geminiHandler = require('./llm/handlers/gemini-handler.js');
const {
  validateLLMRequest,
  handleLLMStream,
  handleLLMBatch,
} = require('./handlers/llmHandlers.js');
const {
  ModeManager,
  MODES,
  InterviewModeHandlers,
  NormalModeHandlers,
} = require('./controllers/modes/mode-manager.js');

// 🎯 CONTROLADORES (Fase 2 - Decomposição)
const audioController = require('./controllers/audio/audio-controller.js');
const questionController = require('./controllers/question/question-controller.js');
const screenshotController = require('./controllers/screenshot/screenshot-controller.js');
const rendererHelpers = require('./utils/renderer-helpers.js');
const uiElementsRegistry = require('./utils/ui-elements-registry.js');

// 🎯 INSTANCIAR
const appState = new AppState();
const eventBus = new EventBus();
const sttStrategy = new STTStrategy();
const llmManager = new LLMManager();
const modeManager = new ModeManager(MODES.INTERVIEW); // 🔧 Modo padrão: INTERVIEW

// 🎯 Inicializar renderer-helpers com dependências
rendererHelpers.initRendererHelpers({
  appState,
  eventBus,
});

// 🎯 Inicializar screenshot-controller com dependências
const { initScreenshotController } = screenshotController;
initScreenshotController({
  ipcRenderer,
  eventBus,
  appState,
});

// 🎯 Atribuir funções de screenshot para exposição global
const {
  captureScreenshot: _captureScreenshot,
  analyzeScreenshots: _analyzeScreenshots,
  clearScreenshots: _clearScreenshots,
} = screenshotController;

// 🎯 VARIÁVEIS DO MOCK (manipuladas por mock-runner.js)
const _mockAutoPlayActive = false;
const _mockScenarioIndex = 0;

// 🎯 FUNÇÕES DE CAPTURA DE SCREENSHOT (importadas do screenshot-controller)
const captureScreenshot = _captureScreenshot;
const analyzeScreenshots = _analyzeScreenshots;
const clearScreenshots = _clearScreenshots;

// 🎯 REGISTRAR MODOS
modeManager.registerMode(MODES.INTERVIEW, InterviewModeHandlers);
modeManager.registerMode(MODES.NORMAL, NormalModeHandlers);

// 🎯 REGISTRAR LLMs
llmManager.register('openai', openaiHandler);
llmManager.register('google', geminiHandler);
// NOSONAR // Futuro: llmManager.register('anthropic', require('./llm/handlers/anthropic-handler.js'));

// 🎯 REGISTRAR LISTENERS DA EVENTBUS (para LLM)
eventBus.on('llmStreamEnd', (data) => {
  Logger.debug('LLM Stream finalizado', { questionId: data.questionId }, false);

  // 🔥 MARCAR COMO RESPONDIDA - essencial para bloquear re-perguntas
  appState.interview.answeredQuestions.add(data.questionId);

  // 🔥 [MODO ENTREVISTA] Pergunta já foi promovida em finalizeCurrentQuestion
  // Aqui só limpamos o CURRENT para próxima pergunta
  if (modeManager.is(MODES.INTERVIEW)) {
    appState.interview.llmAnsweredTurnId = appState.interview.interviewTurnId;
    resetCurrentQuestion();
    renderCurrentQuestion();
  }

  eventBus.emit('answerStreamEnd', {});
});

eventBus.on('llmBatchEnd', (data) => {
  Logger.debug(
    'LLM Batch finalizado',
    {
      questionId: data.questionId,
      responseLength: data.response?.length || 0,
    },
    false
  );

  // 🔥 MARCAR COMO RESPONDIDA - essencial para bloquear re-perguntas
  appState.interview.answeredQuestions.add(data.questionId);

  // 🔥 Obter turnId da pergunta no histórico
  const questionEntry = appState.history.find((q) => q.id === data.questionId);
  const turnId = questionEntry?.turnId || null;

  eventBus.emit('answerBatchEnd', {
    questionId: data.questionId,
    response: data.response,
    turnId, // 🔥 Incluir turnId para renderizar badge
  });
});

eventBus.on('error', (error) => {
  Logger.error('Erro na eventBus', { error });
  // 🔥 NOVO: Mostrar erro visual ao usuário
  if (globalThis.configManager?.showError) {
    globalThis.configManager.showError(error);
  }
});

// ✅ REMOVIDO: listener 'listenButtonToggle' movido para HomeManager.js (#initUIEventBusListeners)

// 🔥 NOVO: Listener para atualizar transcrição interim (parcial)
// 🔥 NOVO: Listener para atualizar transcrição interim (parcial) em tempo real
eventBus.on('updateInterim', ({ id, speaker, text }) => {
  let interimElement = document.getElementById(id);

  // Se não existe, criar novo elemento interim
  if (!interimElement) {
    interimElement = document.createElement('div');
    interimElement.id = id;
    interimElement.className = 'transcript-item interim';
    interimElement.style.color = '#888'; // Cor cinza para indicar interim/parcial

    const transcriptionBox = document.getElementById('conversation');
    if (transcriptionBox) {
      transcriptionBox.appendChild(interimElement);
      Logger.debug(`✨ Elemento interim criado: ${id}`, false);
    }
  }

  // Atualizar o texto com timestamp
  interimElement.innerHTML = `<strong>${speaker}:</strong> ${text}`;
  Logger.debug(`📝 Interim atualizado: "${text.substring(0, 40)}..."`, false);

  // 🔥 AUTO-SCROLL: Fazer scroll para o elemento interim criado
  requestAnimationFrame(() => {
    const container = document.getElementById('transcriptionContainer');
    if (container) {
      container.scrollTop = container.scrollHeight;
      Logger.debug(`📜 Auto-scroll para interim`, false);
    }
  });
});

// ✅ REMOVIDO: listener 'statusUpdate' movido para HomeManager.js (#initUIEventBusListeners)

// 🔥 NOVO: Listener para adicionar transcrição com placeholder
eventBus.on('transcriptAdd', ({ author, text, timeStr, elementId, placeholderId }) => {
  const container = document.getElementById(elementId);
  if (container) {
    const div = document.createElement('div');
    div.id = placeholderId;
    div.className = 'transcript-item';
    div.dataset.speaker = author;
    const timeStrHtml = timeStr ? ` <small>${timeStr}</small>` : '';
    div.innerHTML = `<strong>${author}:</strong> <span class="transcript-text">${text}</span>${timeStrHtml}`;
    container.appendChild(div);

    // 🔥 AUTO-SCROLL: Fazer scroll para o novo item de transcrição
    requestAnimationFrame(() => {
      const container = document.getElementById('transcriptionContainer');
      if (container) {
        container.scrollTop = container.scrollHeight;
        Logger.debug(`📜 Auto-scroll para transcriptAdd`, false);
      }
    });
  }
});

// 🔥 NOVO: Listener para preencher placeholder de transcrição
eventBus.on('placeholderFulfill', ({ _speaker, text, placeholderId, _showMeta }) => {
  const element = document.getElementById(placeholderId);
  if (element) {
    const textSpan = element.querySelector('.transcript-text');
    if (textSpan) {
      textSpan.textContent = text;
    }

    // 🔥 AUTO-SCROLL: Fazer scroll para o item preenchido
    const scrollContainer = document.getElementById('transcriptionContainer');
    if (scrollContainer) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        Logger.debug(`📜 Auto-scroll para placeholderFulfill`, false);
      });
    }
  }
});

// 🔥 NOVO: Listener para limpar transcrição interim (remover o elemento)
eventBus.on('clearInterim', ({ id }) => {
  const interimElement = document.getElementById(id);
  if (interimElement) {
    interimElement.remove();
    Logger.debug(`🗑️ Elemento interim removido: ${id}`, false);
  }
});

// 🔥 NOVO: Listener para limpar seleções de perguntas
eventBus.on('clearAllSelections', () => {
  const currentQuestionBox = document.getElementById('currentQuestion');
  if (currentQuestionBox) {
    currentQuestionBox.classList.remove('selected-question');
    Logger.debug('🗑️ Seleção de pergunta atual removida', false);
  }

  const questionsHistoryBox = document.getElementById('questionsHistory');
  if (questionsHistoryBox) {
    questionsHistoryBox.querySelectorAll('.selected-question').forEach((el) => {
      el.classList.remove('selected-question');
    });
    Logger.debug('🗑️ Seleções do histórico de perguntas removidas', false);
  }
});

// ✅ REMOVIDO: listener 'transcriptionCleared' movido para HomeManager.js (#initUIEventBusListeners)

// ✅ REMOVIDO: listener 'answersCleared' movido para HomeManager.js (#initUIEventBusListeners)

/* ================================ */
//	LISTENERS PARA RENDERIZAÇÃO DE PERGUNTAS
/* ================================ */

// ✅ REMOVIDO: listener 'currentQuestionUpdate' movido para HomeManager.js (#initUIEventBusListeners)

// ✅ REMOVIDO: listener 'questionsHistoryUpdate' movido para HomeManager.js (#initUIEventBusListeners)

/**
 * 🔥 LISTENER: scrollToQuestion
 * Emitido por question-controller.js para fazer scroll até pergunta específica
 */
eventBus.on('scrollToQuestion', (data) => {
  const { questionId } = data;
  const questionsHistoryBox = document.getElementById('questionsHistory');
  if (!questionsHistoryBox) return;

  const el = questionsHistoryBox.querySelector(`.question-block[data-qid="${questionId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    Logger.debug(`📜 Scroll para pergunta: ${questionId}`, false);
  }
});

/**
 * 🔥 LISTENER: answerSelected
 * Emitido quando uma resposta é selecionada
 * Adiciona/remove classe CSS de seleção na resposta correspondente
 */
eventBus.on('answerSelected', (payload) => {
  if (!payload) return;

  const { questionId, shouldScroll } = payload;
  if (!questionId) return;

  const answersBox = document.getElementById('answersHistory');
  if (!answersBox) return;

  // Remover seleção anterior
  answersBox.querySelectorAll('.selected-answer').forEach((el) => {
    el.classList.remove('selected-answer');
  });

  // Procurar resposta da pergunta
  const answerEl = answersBox.querySelector(`[data-question-id="${questionId}"]`);
  if (!answerEl) {
    console.warn('⚠️ Resposta não encontrada para questionId:', questionId);
    return;
  }

  // Marcar como selecionada
  answerEl.classList.add('selected-answer');
  Logger.debug(`✅ Resposta selecionada: questionId=${questionId}`, false);

  // Fazer scroll se solicitado
  if (shouldScroll) {
    answerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

/* ================================ */
//	LISTENERS PARA LLM STREAMING E RESPOSTAS
/* ================================ */

// ✅ REMOVIDO: listener 'answerStreamChunk' movido para HomeManager.js (#initUIEventBusListeners)

// ✅ REMOVIDO: listener 'answerBatchEnd' movido para HomeManager.js (#initUIEventBusListeners)

// ✅ REMOVIDO: listener 'answerStreamEnd' movido para HomeManager.js (#initUIEventBusListeners)

/* ================================ */
//	PROTEÇÃO CONTRA CAPTURA DE TELA
/* ================================ */

/**
 * Proteção contra captura de tela externa
 * Desabilita/limita APIs usadas por Zoom, Teams, Meet, OBS, Discord, Snipping Tool, etc.
 */
(function protectAgainstScreenCapture() {
  // ✅ Desabilita getDisplayMedia (usado por Zoom, Meet, Teams para capturar)
  if (navigator?.mediaDevices?.getDisplayMedia) {
    navigator.mediaDevices.getDisplayMedia = async function (..._args) {
      console.warn('🔐 BLOQUEADO: Tentativa de usar getDisplayMedia (captura de tela externa)');
      throw new Error('Screen capture not available in this window');
    };
  }

  // ✅ Desabilita captureStream (usado para captura de janela)
  if (globalThis.HTMLCanvasElement?.prototype.captureStream) {
    Object.defineProperty(globalThis.HTMLCanvasElement.prototype, 'captureStream', {
      value: function (_this) {
        console.warn('🔐 BLOQUEADO: Tentativa de usar Canvas.captureStream()');
        throw new Error('Capture stream not available');
      },
      writable: false,
      configurable: false,
    });
  }

  // ✅ Intercepta getUserMedia para avisar sobre tentativas de captura de áudio
  if (navigator?.mediaDevices?.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (_constraints) {
      if (_constraints?.video) {
        console.warn('🔐 AVISO: Tentativa de usar getUserMedia com vídeo detectada');
        // Ainda permite áudio, mas bloqueia vídeo para captura
        if (_constraints.video) {
          delete _constraints.video;
        }
      }
      return originalGetUserMedia(_constraints);
    };
  }

  console.log('✅ Proteção contra captura externa ativada');
})();

/* ================================ */
//	CONSTANTES
/* ================================ */

const _ENABLE_INTERVIEW_TIMING_DEBUG_METRICS = true; // ← desligar depois se não quiser mostrar time = false

const SYSTEM_PROMPT = `
Você é um assistente para entrevistas técnicas de Java. Responda como candidato.
Regras de resposta (priorize sempre estas):
- Seja natural e conciso: responda em no máximo 1–2 frases curtas.
- Use linguagem coloquial e direta, como alguém explicando rapidamente verbalmente.
- Evite listas longas, exemplos extensos ou parágrafos detalhados.
- Não comece com cumprimentos ou palavras de preenchimento (ex.: "Claro", "Ok").
- Quando necessário, entregue um exemplo mínimo de 1 linha apenas.
`;

/* ================================ */
//	ESTADO GLOBAL
/* ================================ */

const APP_CONFIG = {
  MODE_DEBUG: false, // ← alterado via config-manager.js (true = modo mock)
};

const CURRENT_QUESTION_ID = 'CURRENT'; // ID da pergunta atual

/* ================================ */
//	SISTEMA DE CALLBACKS E UI ELEMENTS
/* ================================ */

/**
 * Registra elementos UI no registry centralizado
 * DELEGADO para uiElementsRegistry
 */
const registerUIElements = (elements) => uiElementsRegistry.register(elements);

/* ================================ */
//	MONITORAMENTO DE VOLUME
/* ================================ */

/**
 * Escuta atualização de volume de entrada
 * 🔥 MODIFICADO: Só atualiza a home quando está capturando áudio (appState.audio.isRunning)
 */
eventBus.on('inputVolumeUpdate', (data) => {
  const { percent } = data;
  const inputVu = document.getElementById('inputVu');
  if (inputVu) inputVu.style.width = percent + '%';

  // 🔥 Só atualiza volume na home se estiver capturando áudio
  if (appState.audio.isRunning) {
    const inputVuHome = document.getElementById('inputVuHome');
    if (inputVuHome) inputVuHome.style.width = percent + '%';
  }
});

/**
 * Escuta atualização de volume de saída
 * 🔥 MODIFICADO: Só atualiza a home quando está capturando áudio (appState.audio.isRunning)
 */
eventBus.on('outputVolumeUpdate', (data) => {
  const { percent } = data;
  const outputVu = document.getElementById('outputVu');
  if (outputVu) outputVu.style.width = percent + '%';

  // 🔥 Só atualiza volume na home se estiver capturando áudio
  if (appState.audio.isRunning) {
    const outputVuHome = document.getElementById('outputVuHome');
    if (outputVuHome) outputVuHome.style.width = percent + '%';
  }
});

/**
 * Escuta evento de mudança de dispositivo
 * Emitido pelo config-manager
 */
eventBus.on('audioDeviceChanged', async (_data) => {
  try {
    const sttModel = getConfiguredSTTModel();
    Logger.info('audioDeviceChanged', { model: sttModel, type: _data.type });

    if (!_data?.type) {
      Logger.warn('Dados inválidos para mudança de dispositivo', _data);
      return;
    }

    if (!appState.audio.isRunning) {
      Logger.warn('STT não está ativo, ignorando mudança de dispositivo');
      return;
    }

    await sttStrategy.switchDevice(sttModel, _data.type, _data.deviceId);
  } catch (error) {
    Logger.error('Erro ao processar mudança de dispositivo', { error: error.message });
  }
});

/* Compatibilidade: antigo onUIChange também suporta audioDeviceChanged */

/* ================================ */
//	FUNÇÕES UTILITÁRIAS (HELPERS)
/* ================================ */

/**
 * 🔥 Reordena os blocos de resposta por turnId (DESC - maior primeiro)
 * Mantém a ordem decrescente baseada no ID da pergunta
 */
function sortAnswersByTurnId() {
  const answersHistoryBox = document.getElementById('answersHistory');
  if (!answersHistoryBox) return;

  // Obter todos os blocos de resposta
  const answerBlocks = Array.from(answersHistoryBox.querySelectorAll('.answer-block'));

  // Ordenar por turnId (DESC)
  answerBlocks.sort((a, b) => {
    // Extrair turnId do badge
    const aBadge = a.querySelector('.turn-id-badge.answer');
    const bBadge = b.querySelector('.turn-id-badge.answer');

    const aId = aBadge ? Number.parseInt(aBadge.textContent) : 0;
    const bId = bBadge ? Number.parseInt(bBadge.textContent) : 0;

    // Ordenar DESC (maior primeiro)
    return bId - aId;
  });

  // Reinserir os blocos na ordem correta
  answerBlocks.forEach((block) => {
    answersHistoryBox.appendChild(block);
  });
}

/**
 * Obtém o modelo STT configurado via config-manager
 * @returns {string} Nome do modelo STT ou 'error'
 */
function getConfiguredSTTModel() {
  try {
    if (!globalThis.configManager?.config) {
      console.warn('⚠️ configManager não disponível no escopo global');
      return 'error'; // fallback
    }

    const config = globalThis.configManager.config;
    const activeProvider = config.api?.activeProvider;
    const sttModel = config.api?.[activeProvider]?.selectedSTTModel;

    if (!sttModel) {
      console.warn(`⚠️ Modelo STT não configurado para ${activeProvider}`);
      return 'error'; // fallback
    }

    return sttModel;
  } catch (err) {
    console.error('❌ Erro ao obter modelo STT da config:', err);
    return 'error'; // fallback
  }
}

/**
 * Reseta o estado da pergunta atual (CURRENT)
 */
function resetCurrentQuestion() {
  Logger.debug('Início da função: "resetCurrentQuestion"');

  appState.interview.currentQuestion = {
    text: '',
    lastUpdate: 0,
    finalized: false,
    promotedToHistory: false,
    isBeingAnswered: false,
    lastUpdateTime: null,
    createdAt: null,
    finalText: '',
    interimText: '',
  };

  Logger.debug('Fim da função: "resetCurrentQuestion"');
}

/**
 * Funções de pergunta (delegadas ao question-controller)
 */
const {
  renderQuestionsHistory,
  renderCurrentQuestion,
  handleQuestionClick,
  handleCurrentQuestion,
  findAnswerByQuestionId,
} = questionController;

/**
 * Retorna o texto da pergunta selecionada (CURRENT ou do histórico)
 * @returns {string} Texto da pergunta selecionada
 */
function getSelectedQuestionText() {
  Logger.debug('Início da função: "getSelectedQuestionText"');
  Logger.debug('Fim da função: "getSelectedQuestionText"');

  // 1️⃣ Se existe seleção explícita
  if (appState.selectedId === CURRENT_QUESTION_ID) {
    return appState.interview.currentQuestion.text;
  }

  if (appState.selectedId) {
    const q = appState.history.find((q) => q.id === appState.selectedId);
    if (q?.text) return q.text;
  }

  // 2️⃣ Fallback: CURRENT (se tiver texto)
  if (
    appState.interview.currentQuestion.text &&
    appState.interview.currentQuestion.text.trim().length > 0
  ) {
    return appState.interview.currentQuestion.text;
  }

  return '';
}

/**
 * Normaliza texto para comparação
 * Remove pontuação, converte para lowercase, remove espaços extras
 * @param {string} t - Texto a normalizar
 * @returns {string} Texto normalizado
 */
function normalizeForCompare(t) {
  Logger.debug('Início da função: "normalizeForCompare"');
  Logger.debug('Fim da função: "normalizeForCompare"');
  return (t || '')
    .toLowerCase()
    .replaceAll(/[?!.\n\r]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
/**
 * Funções utilitárias (delegadas ao renderer-helpers e question-controller)
 */
const { updateStatusMessage, clearAllSelections } = rendererHelpers;
const { closeCurrentQuestionForced, getNavigableQuestionIds: getNavQuestionIds } =
  questionController;

/* ================================ */
//	🎯 REGISTRAR STTs (Refatoração Fase 2)
/* ================================ */

// Registrar STTs no sttStrategy
sttStrategy.register('deepgram', {
  start: startAudioDeepgram,
  stop: stopAudioDeepgram,
  switchDevice: switchDeviceDeepgram,
});

sttStrategy.register('vosk', {
  start: startAudioVosk,
  stop: stopAudioVosk,
  switchDevice: switchDeviceVosk,
});

sttStrategy.register('whisper-cpp-local', {
  start: startAudioWhisper,
  stop: stopAudioWhisper,
  switchDevice: switchDeviceWhisper,
});

/* ================================ */
//	CONTROLE DE ÁUDIO
/* ================================ */

/**
 * Toggle do botão de escuta (delegado ao audio-controller)
 */
const { listenToggleBtn } = audioController;

/* ================================ */
//	RENDERIZAÇÃO E NAVEGAÇÃO DE UI
/* ================================ */

/**
 * Renderiza a pergunta atual (CURRENT)
 */
// ✅ DELEGADO para questionController

/**
 * Manipula clique em pergunta
 * @param {string} questionId - ID da pergunta selecionada
 */
// ✅ DELEGADO para questionController

/**
 * Aplica opacidade na interface
 * MOVIDA PARA: config-manager.js
 */

/**
 * Rola a lista de perguntas para a pergunta selecionada
 */
// ✅ DELEGADO para questionController

/**
 * Configuração do Marked.js para renderização de Markdown
 * @type {any}
 */
const _markedOptions = {
  breaks: true,
  gfm: true, // GitHub Flavored Markdown
  highlight: function (_code, _lang) {
    // @ts-ignore - highlight.js types não exportam esses métodos publicamente
    if (_lang && hljs?.getLanguage?.(_lang)) {
      // @ts-ignore
      return hljs.highlight(_code, { language: _lang }).value;
    }
    // @ts-ignore
    return hljs.highlightAuto(_code).value;
  },
};
if (marked?.setOptions) {
  marked.setOptions(_markedOptions);
}

/* ================================ */
//	CONSOLIDAÇÃO E FINALIZAÇÃO DE PERGUNTAS
/* ================================ */

/**
 * Fluxo para consolidar transcrições no CURRENT
 * Concatena transcrição interims e finais
 * @param {string} author - Autor da fala (YOU ou OTHER)
 * @param {string} text - Texto da fala
 * @param {object} options - Opções (isInterim, shouldFinalizeAskCurrent)
 */
/**
 * Consolida texto de fala (interim vs final)
 * Reduz Cognitive Complexity de handleCurrentQuestion
 */
// ✅ DELEGADO para questionController

// ✅ DELEGADO para questionController

// ✅ DELEGADO para questionController

// ✅ DELEGADO para questionController

/* ================================ */
//	SISTEMA LLM
/* ================================ */

/**
 * Envia pergunta selecionada ao LLM (qualquer provider)
 * ✅ REFATORADA: agora é simples e legível!
 * ✅ CENTRALIZADA: Uma única função para todos os LLMs
 * ✅ Não há duplicação de askLLM() por LLM
 * @param {string} questionId - ID da pergunta a responder (padrão: appState.selectedId)
 */
async function askLLM(questionId = null) {
  try {
    const targetQuestionId = questionId || appState.selectedId;

    // 1. Validar (antigo validateAskLlmRequest)
    const {
      questionId: validatedId,
      text,
      isCurrent,
    } = validateLLMRequest(appState, targetQuestionId, getSelectedQuestionText);
    Logger.debug('Pergunta válida', { questionId: validatedId, textLength: text.length }, false);

    // Rastreamento antigo (compatibilidade)
    const normalizedText = normalizeForCompare(text);
    appState.metrics.llmStartTime = Date.now();

    if (isCurrent) {
      appState.interview.llmRequestedTurnId = appState.interview.interviewTurnId;
      appState.interview.llmRequestedQuestionId = CURRENT_QUESTION_ID;
      appState.interview.lastAskedQuestionNormalized = normalizedText;
    }

    // 2. Rotear por modo (não por LLM!)
    const isInterviewMode = modeManager.is(MODES.INTERVIEW);

    // Obter turnId da pergunta para passar ao LLM
    const questionEntry = appState.history.find((q) => q.id === targetQuestionId);
    const turnId = questionEntry?.turnId || null;

    if (isInterviewMode) {
      await handleLLMStream(
        appState,
        validatedId,
        text,
        SYSTEM_PROMPT,
        eventBus,
        llmManager,
        turnId
      );
    } else {
      await handleLLMBatch(appState, validatedId, text, SYSTEM_PROMPT, eventBus, llmManager);
    }
    // O llmManager sabe qual LLM usar (OpenAI, Gemini, etc)
    // Sem duplicação de código!
  } catch (error) {
    Logger.error('Erro em askLLM', { error: error.message });
    eventBus.emit('error', error.message);
    updateStatusMessage(`❌ ${error.message}`);
  }
}

/* ================================ */
//	SCREENSHOT E ANÁLISE (delegado ao screenshot-controller)
/* ================================ */

/* ================================ */
//	RESET COMPLETO
/* ================================ */

/**
 * Libera a thread e reseta o app (delegado ao renderer-helpers)
 */
const { resetAppState } = rendererHelpers;

//	DEBUG LOG RENDERER
/* ================================ */

/**
 * Log de debug padronizado para renderer
 * Último argumento opcional é booleano para mostrar ou não o log
 * @param {...any} args - Argumentos a logar
 */

/* ================================ */
//	EXPORTAÇÃO PUBLIC API (RendererAPI)
/* ================================ */

/**
 * API Pública exposta do Renderer
 * Métodos públicos que podem ser chamados de fora
 */
const RendererAPI = {
  // Áudio - Gravação
  listenToggleBtn,
  askLLM,
  // 🔥 Estado de transcrição (usado pelo audio-volume-monitor.js)
  get isAudioRunning() {
    return appState.audio.isRunning;
  },

  // Áudio - Monitoramento de volume
  startAudioVolumeMonitor,
  stopAudioVolumeMonitor,
  switchAudioVolumeDevice,

  // Entrevista - Reset (centralizado em resetAppState)
  resetAppState,

  // Modo
  changeMode: (mode) => {
    modeManager.setMode(mode);
    console.log(`📌 Modo alterado via RendererAPI: ${mode}`);
    // 🔥 NOTA: STT continua rodando em ambos modos
    // ENTREVISTA: Auto-responde quando silêncio detectado
    // PADRÃO: Espera clique/Ctrl+Enter para responder
    // A mudança de modo não deve parar o STT
  },
  getMode: () => modeManager.getMode(),

  // Questions
  handleCurrentQuestion,
  handleQuestionClick,

  // 🔥 NOVO: Expor selectedQuestionId via getter para atalhos em config-manager.js
  get selectedId() {
    return appState.selectedId;
  },

  // UI
  // 🔥 MOVED: applyOpacity foi para config-manager.js
  updateMockBadge: (show) => {
    eventBus.emit('screenshotBadgeUpdate', { visible: show });
  },
  setMockToggle: (checked) => {
    APP_CONFIG.MODE_DEBUG = checked;
  },
  setModeSelect: (mode) => {
    eventBus.emit('modeSelectUpdate', { mode });
  },

  // Drag
  /**
   * Inicializa drag handle para movimento de janela
   * MOVIDA PARA: config-manager.js
   */

  // Click-through
  setClickThrough: (enabled) => {
    ipcRenderer.send('SET_CLICK_THROUGH', enabled);
  },
  /**
   * Inicia movimento de janela via drag
   */
  startWindowDrag: () => {
    return ipcRenderer.invoke('START_WINDOW_DRAG');
  },
  /**
   * Define opacidade da janela
   * @param {number} opacity - Valor de 0 a 1
   */
  setWindowOpacity: (opacity) => {
    // Aplica opacidade no conteúdo geral (variável --app-opacity)
    const opacityValue = Math.max(0, Math.min(1, opacity));
    document.documentElement.style.setProperty('--app-opacity', opacityValue.toFixed(2));
    return Promise.resolve();
  },
  /**
   * Atualiza botão de click-through
   * @param {boolean} enabled - Se click-through está ativo
   * @param {Element} btnToggle - Botão a atualizar
   */
  updateClickThroughButton: (enabled, btnToggle) => {
    if (!btnToggle) return;
    if (btnToggle instanceof HTMLElement) {
      // @ts-ignore - style/title são propriedades HTMLElement padrão
      btnToggle.style.opacity = enabled ? '0.5' : '1';
      btnToggle.title = enabled
        ? 'Click-through ATIVO (clique para desativar)'
        : 'Click-through INATIVO (clique para ativar)';
      console.log(
        '🎨 Botão atualizado - opacity:',
        btnToggle instanceof HTMLElement ? btnToggle.style.opacity : 'N/A'
      );
    }
  },

  // UI Registration
  registerUIElements: (elements) => {
    registerUIElements(elements);
  },

  // API Key
  setAppConfig: (config) => {
    Object.assign(APP_CONFIG, config);
    // 🎭 Inicializa mock interceptor se MODE_DEBUG estiver ativo
    if (APP_CONFIG.MODE_DEBUG) {
      mockRunner.initMockInterceptor({
        eventBus,
        captureScreenshot,
        analyzeScreenshots,
        APP_CONFIG,
      });
      Logger.info('✅ Mock interceptor inicializado para MODE_DEBUG');
    }
  },
  getAppConfig: () => APP_CONFIG,

  // Navegacao de perguntas (Ctrl+Shift+ArrowUp/Down via globalShortcut IPC)
  /**
   * Navega entre perguntas
   * @param {string} direction - 'up' ou 'down'
   */
  navigateQuestions: (direction) => {
    const all = getNavQuestionIds();
    if (all.length === 0) return;

    let index = all.indexOf(appState.selectedId);
    if (index === -1) {
      // Nenhuma seleção: começa do começo ou do fim
      index = direction === 'up' ? all.length - 1 : 0;
    } else {
      // 🔥 CORRIGIDO: Lógica normal (agora que getNavigableQuestionIds retorna ordem visual correta)
      // 'up' = subir visualmente = diminuir índice
      // 'down' = descer visualmente = aumentar índice
      index += direction === 'up' ? -1 : 1;
      index = Math.max(0, Math.min(index, all.length - 1));
    }

    appState.selectedId = all[index];
    clearAllSelections();
    renderQuestionsHistory();
    renderCurrentQuestion();

    if (APP_CONFIG.MODE_DEBUG) {
      const msg =
        direction === 'up'
          ? '🧪 Ctrl+ArrowUp detectado (teste)'
          : '🧪 Ctrl+ArrowDown detectado (teste)';
      updateStatusMessage(msg);
      console.log('📌 Atalho Selecionou:', appState.selectedId);
    }
  },

  // IPC Listeners
  onApiKeyUpdated: (callback) => {
    ipcRenderer.on('API_KEY_UPDATED', callback);
  },
  onToggleAudio: (callback) => {
    // Começar a ouvir / Parar de ouvir (Ctrl+D)
    ipcRenderer.on('CMD_TOGGLE_AUDIO', callback);
  },
  onAskLlm: (callback) => {
    ipcRenderer.on('CMD_ASK_LLM', callback);
  },
  onLlmStreamChunk: (callback) => {
    ipcRenderer.on('LLM_STREAM_CHUNK', callback);
  },
  onLlmStreamEnd: (callback) => {
    ipcRenderer.on('LLM_STREAM_END', callback);
  },
  /**
   * Envia erro do renderer para main
   * @param {Error | any} error - Erro a enviar
   */
  sendRendererError: (error) => {
    try {
      console.error('RENDERER ERROR', error instanceof Error ? error.message : error);
      ipcRenderer.send('RENDERER_ERROR', {
        message: error instanceof Error ? error.message : String(error),
        // @ts-ignore - error pode ter propriedades customizadas
        stack: error instanceof Error ? error.stack : error?.error?.stack || null,
      });
    } catch (err) {
      console.error('Falha ao enviar RENDERER_ERROR', err);
    }
  },

  // 📸 NOVO: Screenshot functions
  captureScreenshot,
  analyzeScreenshots,
  clearScreenshots,
  getScreenshotCount: () => appState.audio.capturedScreenshots.length,

  // 📸 NOVO: Screenshot shortcuts
  onCaptureScreenshot: (callback) => {
    ipcRenderer.on('CMD_CAPTURE_SCREENSHOT', callback);
  },
  onAnalyzeScreenshots: (callback) => {
    ipcRenderer.on('CMD_ANALYZE_SCREENSHOTS', callback);
  },
  // Navegacao de perguntas (Ctrl+Shift+ArrowUp/Down via globalShortcut)
  onNavigateQuestions: (callback) => {
    ipcRenderer.on('CMD_NAVIGATE_QUESTIONS', (_, direction) => {
      callback(direction);
    });
  },

  // ==========================================
  // EXPORTAR DEPENDÊNCIAS PARA AUDIO CONTROLLER
  // ==========================================
  sttStrategy,
  modeManager,
  MODES,
  getConfiguredSTTModel,
  updateStatusMessage,
  closeCurrentQuestionForced,
  findAnswerByQuestionId,
  initAudioController: (deps) => {
    const { initAudioController: initAudioCtrl } = audioController;
    if (typeof initAudioCtrl === 'function') {
      initAudioCtrl(deps);
    }
  },
};

if (typeof module !== 'undefined' && module.exports) {
  // Node.js / CommonJS export
  module.exports = RendererAPI;
}

// 🎭 Exporta para o escopo global (usado em mocks e testes)
if (typeof globalThis !== 'undefined') {
  globalThis.RendererAPI = RendererAPI; // 🎭 Exporta API para escopo global
  globalThis.eventBus = eventBus; // 🎭 Exporta EventBus singleton para todos os módulos
  globalThis.appState = appState; // 🎭 Exporta appState para audio-controller e outros
  globalThis.runMockAutoPlay = () => mockRunner.runMockAutoPlay(); // 🎭 Exportar Mock
  globalThis._ipc = ipcRenderer; // 🎭 Exporta ipcRenderer para ConfigManager e Managers
  globalThis.Logger = Logger; // 🎭 Exporta Logger para classes carregadas via <script>
  globalThis.clearAllSelections = clearAllSelections; // 🎭 Exporta clearAllSelections como fallback
  globalThis.modeManager = modeManager; // 🎭 Exporta modeManager para question-controller e outros
  globalThis.MODES = MODES; // 🎭 Exporta MODES para acesso em contextos de fallback
  globalThis.updateStatusMessage = updateStatusMessage; // 🎭 Exporta updateStatusMessage para question-controller
  globalThis.askLLM = askLLM; // 🎭 Exporta askLLM para question-controller
  globalThis.renderCurrentQuestion = renderCurrentQuestion; // 🎭 Exporta renderCurrentQuestion para listeners
  globalThis.renderQuestionsHistory = renderQuestionsHistory; // 🎭 Exporta renderQuestionsHistory para listeners
}
