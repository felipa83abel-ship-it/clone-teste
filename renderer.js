// @ts-check
/* global HTMLElement */

/* ================================ */
//	DEPENDÊNCIAS GLOBAIS (Carregadas via <script> no index.html)
/* ================================ */
// Todas as classes abaixo estão disponíveis em globalThis
// Carregamento de módulos em: index.html
// - Logger, ErrorHandler, SecureLogger
// - AppState, EventBus
// - STTStrategy, LLMManager
// - Controllers (audio, question, screenshot, modes)
// - Managers (ApiKey, AudioDevice, ModelSelection, ScreenConfig, PrivacyConfig, WindowUI, HomeUI)
// - ConfigManager
// - UI Helpers e Registry

// Modules via ipcRenderer (do Electron)
const { ipcRenderer } = require('electron');

// 🎯 Expor ipcRenderer globalmente para uso em ConfigManager e outros controllers
globalThis._ipc = ipcRenderer;
globalThis.ipcRenderer = ipcRenderer;

// 🎯 CARREGAR DEPENDÊNCIAS EXTERNAS para globalThis
// marked e highlight.js são necessários para renderização de markdown
try {
  globalThis.marked = require('marked');
} catch (err) {
  globalThis.Logger?.warn('marked não carregado via CommonJS, esperando estar em globalThis', err);
}

try {
  globalThis.hljs = require('highlight.js');
} catch (err) {
  globalThis.Logger?.warn(
    'highlight.js não carregado via CommonJS, esperando estar em globalThis',
    err
  );
}

// 🎯 INSTANCIAR - Usar globalThis para classes carregadas como scripts
// Expor em globalThis para acesso por outros arquivos carregados como scripts
globalThis.appState = new globalThis.AppState();
globalThis.eventBus = new globalThis.EventBus();
globalThis.sttStrategy = new globalThis.STTStrategy();
globalThis.llmManager = new globalThis.LLMManager();
globalThis.modeManager = new globalThis.ModeManager(globalThis.MODES.INTERVIEW); // 🔧 Modo padrão: INTERVIEW

// 🎯 Inicializar renderer-helpers com dependências
globalThis.rendererHelpers.initRendererHelpers({
  appState: globalThis.appState,
  eventBus: globalThis.eventBus,
});

// 🎯 Inicializar screenshot-controller com dependências
// initScreenshotController está definida em screenshot-controller.js
globalThis.screenshotController.initScreenshotController({
  ipcRenderer,
  eventBus: globalThis.eventBus,
  appState: globalThis.appState,
});

// 🎯 Atribuir funções de screenshot para exposição global
const {
  captureScreenshot: _captureScreenshot,
  analyzeScreenshots: _analyzeScreenshots,
  clearScreenshots: _clearScreenshots,
} = globalThis.screenshotController;

// 🎯 VARIÁVEIS DO MOCK (manipuladas por mock-runner.js)
const _mockAutoPlayActive = false;
const _mockScenarioIndex = 0;

// 🎯 FUNÇÕES DE CAPTURA DE SCREENSHOT (disponíveis em globalThis a partir de screenshot-controller)
// Use globalThis.captureScreenshot, globalThis.analyzeScreenshots, globalThis.clearScreenshots

// 🎯 REGISTRAR MODOS
globalThis.globalThis.modeManager.registerMode(
  globalThis.MODES.INTERVIEW,
  globalThis.InterviewModeHandlers
);
globalThis.globalThis.modeManager.registerMode(
  globalThis.MODES.NORMAL,
  globalThis.NormalModeHandlers
);

// 🎯 REGISTRAR LLMs
// Instanciar handlers com ipcRenderer
const openaiHandler = new globalThis.OpenAIHandler(ipcRenderer);
const geminiHandler = new globalThis.GeminiHandler(ipcRenderer);

globalThis.llmManager.register('openai', openaiHandler);
globalThis.llmManager.register('google', geminiHandler);
// NOSONAR // Futuro: globalThis.llmManager.register('anthropic', require('./llm/handlers/anthropic-handler.js'));

// 🎯 REGISTRAR LISTENERS DA EVENTBUS (para LLM)
globalThis.eventBus.on('llmStreamEnd', (data) => {
  globalThis.Logger.debug('LLM Stream finalizado', { questionId: data.questionId }, false);

  // 🔥 MARCAR COMO RESPONDIDA - essencial para bloquear re-perguntas
  globalThis.appState.interview.answeredQuestions.add(data.questionId);

  // 🔥 [MODO ENTREVISTA] Pergunta já foi promovida em finalizeCurrentQuestion
  // Aqui só limpamos o CURRENT para próxima pergunta
  if (globalThis.modeManager.is(globalThis.MODES.INTERVIEW)) {
    globalThis.appState.interview.llmAnsweredTurnId = globalThis.appState.interview.interviewTurnId;
    globalThis.resetCurrentQuestion();
    globalThis.renderCurrentQuestion();
  }

  globalThis.eventBus.emit('answerStreamEnd', {});
});

globalThis.eventBus.on('llmBatchEnd', (data) => {
  globalThis.Logger.debug(
    'LLM Batch finalizado',
    {
      questionId: data.questionId,
      responseLength: data.response?.length || 0,
    },
    false
  );

  // 🔥 MARCAR COMO RESPONDIDA - essencial para bloquear re-perguntas
  globalThis.appState.interview.answeredQuestions.add(data.questionId);

  // 🔥 Obter turnId da pergunta no histórico
  const questionEntry = globalThis.appState.history.find((q) => q.id === data.questionId);
  const turnId = questionEntry?.turnId || null;

  globalThis.eventBus.emit('answerBatchEnd', {
    questionId: data.questionId,
    response: data.response,
    turnId, // 🔥 Incluir turnId para renderizar badge
  });
});

globalThis.eventBus.on('error', (error) => {
  globalThis.Logger.error('Erro na eventBus', { error });
  // 🔥 NOVO: Mostrar erro visual ao usuário
  if (globalThis.configManager?.showError) {
    globalThis.configManager.showError(error);
  }
});

// ✅ REMOVIDO: listener 'listenButtonToggle' movido para HomeManager.js (#initUIEventBusListeners)

// 🔥 NOVO: Listener para atualizar transcrição interim (parcial)
// 🔥 NOVO: Listener para atualizar transcrição interim (parcial) em tempo real
// ✅ REMOVIDO: updateInterim listener - DOM manipulação movida para HomeUIManager

// ✅ REMOVIDO: listener 'statusUpdate' movido para HomeManager.js (#initUIEventBusListeners)

// 🔥 NOVO: Listener para adicionar transcrição com placeholder
// ✅ REMOVIDO: transcriptAdd - DOM movido para HomeUIManager

// 🔥 NOVO: Listener para preencher placeholder de transcrição
// ✅ REMOVIDO: placeholderFulfill - DOM movido para HomeUIManager

// 🔥 NOVO: Listener para limpar transcrição interim (remover o elemento)
// ✅ REMOVIDO: clearInterim - DOM movido para HomeUIManager

// 🔥 NOVO: Listener para limpar seleções de perguntas
// ✅ REMOVIDO: clearAllSelections - DOM movido para HomeUIManager

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
// ✅ REMOVIDO: scrollToQuestion - DOM movido para HomeUIManager

/**
 * 🔥 LISTENER: answerSelected
 * Emitido quando uma resposta é selecionada
 * Adiciona/remove classe CSS de seleção na resposta correspondente
 */
// ✅ REMOVIDO: answerSelected - DOM movido para HomeUIManager

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
const registerUIElements = (elements) => globalThis.uiElementsRegistry?.register(elements);

/* ================================ */
//	MONITORAMENTO DE VOLUME
/* ================================ */

/**
 * Escuta evento de mudança de dispositivo
 * Emitido pelo config-manager
 */
globalThis.eventBus.on('audioDeviceChanged', async (_data) => {
  try {
    const sttModel = globalThis.RendererAPI?.getConfiguredSTTModel?.() || 'error';
    globalThis.Logger.info('audioDeviceChanged', { model: sttModel, type: _data.type });

    if (!_data?.type) {
      globalThis.Logger.warn('Dados inválidos para mudança de dispositivo', _data);
      return;
    }

    if (!globalThis.appState.audio.isRunning) {
      globalThis.Logger.warn('STT não está ativo, ignorando mudança de dispositivo');
      return;
    }

    await globalThis.sttStrategy.switchDevice(sttModel, _data.type, _data.deviceId);
  } catch (error) {
    globalThis.Logger.error('Erro ao processar mudança de dispositivo', { error: error.message });
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
function _sortAnswersByTurnId() {
  // Emite evento para HomeUIManager lidar com reordenação
  globalThis.eventBus.emit('sortAnswersByTurnId');
}

/**
 * Obtém o modelo STT configurado via config-manager
 * DELEGADO: Função disponível em globalThis.RendererAPI.getConfiguredSTTModel
 * (Implementação em ConfigManager)
 */

/**
 * Reseta o estado da pergunta atual (CURRENT)
 * DELEGADO: resetCurrentQuestion está em question-helpers.js e exportado em globalThis
 */

/**
 * Funções de pergunta (delegadas ao question-controller)
 * Disponíveis em globalThis após carregamento de question-controller.js
 */
// Não fazer destructuring - usar globalThis diretamente
// renderQuestionsHistory, renderCurrentQuestion, handleQuestionClick, handleCurrentQuestion, findAnswerByQuestionId

/**
 * Retorna o texto da pergunta selecionada (CURRENT ou do histórico)
 * DELEGADO: getSelectedQuestionText está em question-controller.js e exportado em globalThis
 */

/**
 * Normaliza texto para comparação
 * DELEGADO: normalizeForCompare está em question-helpers.js e exportado em globalThis
 */

/**
/**
 * Funções utilitárias (delegadas ao renderer-helpers e question-controller)
 * Disponíveis em globalThis após carregamento dos respectivos arquivos
 */
// Não fazer destructuring - usar globalThis diretamente
// updateStatusMessage, clearAllSelections, closeCurrentQuestionForced, getNavigableQuestionIds

/* ================================ */
//	🎯 REGISTRAR STTs (Refatoração Fase 2)
/* ================================ */

// Registrar STTs no sttStrategy
globalThis.sttStrategy.register('deepgram', {
  start: globalThis.startAudioDeepgram,
  stop: globalThis.stopAudioDeepgram,
  switchDevice: globalThis.switchDeviceDeepgram,
});

globalThis.sttStrategy.register('vosk', {
  start: globalThis.startAudioVosk,
  stop: globalThis.stopAudioVosk,
  switchDevice: globalThis.switchDeviceVosk,
});

globalThis.sttStrategy.register('whisper-cpp-local', {
  start: globalThis.startAudioWhisper,
  stop: globalThis.stopAudioWhisper,
  switchDevice: globalThis.switchDeviceWhisper,
});

/* ================================ */
//	CONTROLE DE ÁUDIO
/* ================================ */

/**
 * Toggle do botão de escuta (delegado ao audio-controller)
 * Disponível em globalThis após carregamento de audio-controller.js
 */

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
    if (_lang && globalThis.hljs?.getLanguage?.(_lang)) {
      // @ts-ignore
      return globalThis.hljs.highlight(_code, { language: _lang }).value;
    }
    // @ts-ignore
    return globalThis.hljs.highlightAuto(_code).value;
  },
};
if (globalThis.marked?.setOptions) {
  globalThis.marked.setOptions(_markedOptions);
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
 * @param {string} questionId - ID da pergunta a responder (padrão: globalThis.appState.selectedId)
 */
async function askLLM(questionId = null) {
  try {
    const targetQuestionId = questionId || globalThis.appState.selectedId;

    // 1. Validar (antigo validateAskLlmRequest)
    const {
      questionId: validatedId,
      text,
      isCurrent,
    } = globalThis.validateLLMRequest?.(
      globalThis.appState,
      targetQuestionId,
      globalThis.getSelectedQuestionText
    ) || {};
    globalThis.Logger.debug(
      'Pergunta válida',
      { questionId: validatedId, textLength: text?.length },
      false
    );

    // Rastreamento antigo (compatibilidade)
    const normalizedText = globalThis.normalizeForCompare?.(text) || text;
    globalThis.appState.metrics.llmStartTime = Date.now();

    if (isCurrent) {
      globalThis.appState.interview.llmRequestedTurnId =
        globalThis.appState.interview.interviewTurnId;
      globalThis.appState.interview.llmRequestedQuestionId = CURRENT_QUESTION_ID;
      globalThis.appState.interview.lastAskedQuestionNormalized = normalizedText;
    }

    // 2. Rotear por modo (não por LLM!)
    const isInterviewMode = globalThis.modeManager.is(globalThis.MODES.INTERVIEW);

    // Obter turnId da pergunta para passar ao LLM
    const questionEntry = globalThis.appState.history.find((q) => q.id === targetQuestionId);
    const turnId = questionEntry?.turnId || null;

    if (isInterviewMode) {
      await globalThis.handleLLMStream?.(
        globalThis.appState,
        validatedId,
        text,
        SYSTEM_PROMPT,
        globalThis.eventBus,
        globalThis.llmManager,
        turnId
      );
    } else {
      await globalThis.handleLLMBatch?.(
        globalThis.appState,
        validatedId,
        text,
        SYSTEM_PROMPT,
        globalThis.eventBus,
        globalThis.llmManager
      );
    }
    // O llmManager sabe qual LLM usar (OpenAI, Gemini, etc)
    // Sem duplicação de código!
  } catch (error) {
    globalThis.Logger.error('Erro em askLLM', { error: error.message });
    globalThis.eventBus.emit('error', error.message);
    globalThis.updateStatusMessage(`❌ ${error.message}`);
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
 * Disponível em globalThis após carregamento de renderer-helpers.js
 */

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
  listenToggleBtn: globalThis.listenToggleBtn,
  askLLM,
  // 🔥 Estado de transcrição (usado pelo audio-volume-monitor.js)
  get isAudioRunning() {
    return globalThis.appState.audio.isRunning;
  },

  // Áudio - Monitoramento de volume
  startAudioVolumeMonitor: globalThis.startAudioVolumeMonitor,
  stopAudioVolumeMonitor: globalThis.stopAudioVolumeMonitor,
  switchAudioVolumeDevice: globalThis.switchAudioVolumeDevice,

  // Entrevista - Reset (centralizado em resetAppState)
  resetAppState: globalThis.resetAppState,

  // Modo
  changeMode: (mode) => {
    globalThis.modeManager.setMode(mode);
    console.log(`📌 Modo alterado via RendererAPI: ${mode}`);
    // 🔥 NOTA: STT continua rodando em ambos modos
    // ENTREVISTA: Auto-responde quando silêncio detectado
    // PADRÃO: Espera clique/Ctrl+Enter para responder
    // A mudança de modo não deve parar o STT
  },
  getMode: () => globalThis.modeManager.getMode(),

  // Questions
  handleCurrentQuestion: (...args) => globalThis.handleCurrentQuestion?.(...args),
  handleQuestionClick: (e) => globalThis.handleQuestionClick?.(e),

  // 🔥 NOVO: Expor selectedQuestionId via getter para atalhos em config-manager.js
  get selectedId() {
    return globalThis.appState.selectedId;
  },

  // UI
  // 🔥 MOVED: applyOpacity foi para config-manager.js
  updateMockBadge: (show) => {
    globalThis.eventBus.emit('screenshotBadgeUpdate', { visible: show });
  },
  setMockToggle: (checked) => {
    APP_CONFIG.MODE_DEBUG = checked;
  },
  setModeSelect: (mode) => {
    globalThis.eventBus.emit('modeSelectUpdate', { mode });
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
   * ✅ REMOVIDO: DOM manipulation moved to WindowUIManager
   * @param {number} opacity - Valor de 0 a 1
   */
  setWindowOpacity: (opacity) => {
    // Emit event for WindowUIManager to handle DOM updates
    globalThis.eventBus.emit('windowOpacityUpdate', { opacity: Math.max(0, Math.min(1, opacity)) });
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
      if (globalThis.mockRunner) {
        globalThis.mockRunner.initMockInterceptor({
          eventBus: globalThis.eventBus,
          captureScreenshot: globalThis.captureScreenshot,
          analyzeScreenshots: globalThis.analyzeScreenshots,
          APP_CONFIG,
        });
      }
      globalThis.Logger.info('✅ Mock interceptor inicializado para MODE_DEBUG');
    }
  },
  getAppConfig: () => APP_CONFIG,

  // Navegacao de perguntas (Ctrl+Shift+ArrowUp/Down via globalShortcut IPC)
  /**
   * Navega entre perguntas
   * @param {string} direction - 'up' ou 'down'
   */
  navigateQuestions: (direction) => {
    const all = globalThis.getNavigableQuestionIds?.() || [];
    if (all.length === 0) return;

    let index = all.indexOf(globalThis.appState.selectedId);
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

    globalThis.appState.selectedId = all[index];
    globalThis.clearAllSelections();
    globalThis.renderQuestionsHistory();
    globalThis.renderCurrentQuestion();

    if (APP_CONFIG.MODE_DEBUG) {
      const msg =
        direction === 'up'
          ? '🧪 Ctrl+ArrowUp detectado (teste)'
          : '🧪 Ctrl+ArrowDown detectado (teste)';
      globalThis.updateStatusMessage(msg);
      console.log('📌 Atalho Selecionou:', globalThis.appState.selectedId);
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
  captureScreenshot: globalThis.captureScreenshot,
  analyzeScreenshots: globalThis.analyzeScreenshots,
  clearScreenshots: globalThis.clearScreenshots,
  getScreenshotCount: () => globalThis.appState.audio.capturedScreenshots.length,

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
  sttStrategy: globalThis.sttStrategy,
  modeManager: globalThis.modeManager,
  MODES: globalThis.MODES,
  getConfiguredSTTModel: () => {
    // Obtém o modelo STT configurado via configManager
    try {
      const config = globalThis.configManager?.config;
      if (!config) return 'error';
      const activeProvider = config.api?.activeProvider;
      return config.api?.[activeProvider]?.selectedSTTModel || 'error';
    } catch (err) {
      globalThis.Logger?.error('Erro ao obter STT model:', err);
      return 'error';
    }
  },
  updateStatusMessage: globalThis.updateStatusMessage,
  closeCurrentQuestionForced: globalThis.closeCurrentQuestionForced,
  findAnswerByQuestionId: globalThis.findAnswerByQuestionId,
  initAudioController: (deps) => {
    // initAudioController é exportado em globalThis por audio-controller.js
    if (typeof globalThis.initAudioController === 'function') {
      globalThis.initAudioController(deps);
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
  // eventBus, appState, modeManager, Logger, MODES já foram exportados no início do arquivo
  globalThis.runMockAutoPlay = () => globalThis.mockRunner?.runMockAutoPlay(); // 🎭 Exportar Mock
  globalThis.clearAllSelections = globalThis.clearAllSelections || (() => {}); // 🎭 Fallback
  globalThis.askLLM = askLLM; // 🎭 Exporta askLLM para question-controller
  // renderCurrentQuestion, renderQuestionsHistory, updateStatusMessage e clearAllSelections já são exportados
  // por seus respectivos módulos (question-controller.js e renderer-helpers.js)
}
