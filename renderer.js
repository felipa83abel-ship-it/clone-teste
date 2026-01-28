// @ts-nocheck
/* global Logger, HTMLElement */

/**
 * ================================
 * RENDERER.JS - Orquestração do Renderer Process
 * ================================
 *
 * Responsabilidades:
 * 1. Carregar dependências globais
 * 2. Instanciar classes principais
 * 3. Inicializar registries de serviços
 * 4. Proteção contra captura de tela
 * 5. Expor RendererAPI (ponte com main.js)
 *
 * O que NÃO está aqui (movido):
 * - askLLM() → controllers/llm/llm-controller.js
 * - STT registration → services/stt/stt-registry.js
 * - Mode registration → controllers/modes/modes-registry.js
 * - LLM registration → services/llm/llm-registry.js
 * - EventBus listeners → Espalhados nos controllers
 * - SYSTEM_PROMPT → services/llm/system-prompt.js
 */

// ================================
// SEÇÃO 1: DEPENDÊNCIAS EXTERNAS
// ================================

const { ipcRenderer } = require('electron');

// Expor ipcRenderer globalmente
globalThis._ipc = ipcRenderer;
globalThis.ipcRenderer = ipcRenderer;

// Carregar dependências externas (marked, highlight.js)
try {
  globalThis.marked = require('marked');
} catch (err) {
  Logger?.warn('marked não carregado via CommonJS', err);
}

try {
  globalThis.hljs = require('highlight.js');
} catch (err) {
  Logger?.warn('highlight.js não carregado via CommonJS', err);
}

// ================================
// SEÇÃO 2: INSTANCIAR CLASSES GLOBAIS
// ================================

globalThis.appState = new globalThis.AppState();
globalThis.eventBus = new globalThis.EventBus();
globalThis.sttStrategy = new globalThis.STTStrategy();
globalThis.llmManager = new globalThis.LLMManager();
globalThis.modeManager = new globalThis.ModeManager(globalThis.MODES.INTERVIEW);

// Inicializar VAD Engine (singleton para STT)
try {
  const { getVADEngine } = require('./services/stt/vad-engine');
  globalThis.vadEngine = getVADEngine();
  console.log('✅ VAD Engine inicializado');
} catch (err) {
  console.error('❌ Erro ao inicializar VAD Engine:', err);
}

console.log('✅ Classes principais instanciadas');

// ================================
// SEÇÃO 3: INICIALIZAR HELPERS
// ================================

globalThis.rendererHelpers.initRendererHelpers({
  appState: globalThis.appState,
  eventBus: globalThis.eventBus,
});

globalThis.screenshotController.initScreenshotController({
  ipcRenderer,
  eventBus: globalThis.eventBus,
  appState: globalThis.appState,
});

// Atribuir funções de screenshot para exposição global
const {
  captureScreenshot: _captureScreenshot,
  analyzeScreenshots: _analyzeScreenshots,
  clearScreenshots: _clearScreenshots,
} = globalThis.screenshotController;

// ================================
// SEÇÃO 4: INICIALIZAR REGISTRIES
// ================================

// Registrar STTs (deepgram, vosk, whisper)
if (typeof globalThis.initializeSTTRegistry === 'function') {
  globalThis.initializeSTTRegistry(globalThis.sttStrategy);
}

// Registrar Modes (INTERVIEW, NORMAL)
if (typeof globalThis.initializeModesRegistry === 'function') {
  globalThis.initializeModesRegistry(globalThis.modeManager);
}

// Registrar LLMs (OpenAI, Gemini)
if (typeof globalThis.initializeLLMRegistry === 'function') {
  globalThis.initializeLLMRegistry(globalThis.llmManager, ipcRenderer);
}

console.log('✅ Registries inicializados');

// ================================
// SEÇÃO 5: PROTEÇÃO CONTRA CAPTURA DE TELA
// ================================

(function protectAgainstScreenCapture() {
  if (navigator?.mediaDevices?.getDisplayMedia) {
    navigator.mediaDevices.getDisplayMedia = async function (..._args) {
      console.warn('🔐 BLOQUEADO: getDisplayMedia (captura externa)');
      throw new Error('Screen capture not available in this window');
    };
  }

  if (globalThis.HTMLCanvasElement?.prototype.captureStream) {
    Object.defineProperty(globalThis.HTMLCanvasElement.prototype, 'captureStream', {
      value: function (_this) {
        console.warn('🔐 BLOQUEADO: Canvas.captureStream()');
        throw new Error('Capture stream not available');
      },
      writable: false,
      configurable: false,
    });
  }

  if (navigator?.mediaDevices?.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (_constraints) {
      if (_constraints?.video) {
        console.warn('🔐 AVISO: Tentativa de getUserMedia com vídeo');
        delete _constraints.video;
      }
      return originalGetUserMedia(_constraints);
    };
  }

  console.log('✅ Proteção contra captura externa ativada');
})();

// ================================
// SEÇÃO 6: VARIÁVEIS GLOBAIS DE CONTROLE
// ================================

// Modo debug para mock testing
globalThis.isMockDebugMode = false;

// ================================
// SEÇÃO 7: LISTENERS DE EVENTOS (EventBus)
// ================================

/**
 * Listener: audioDeviceChanged
 * Disparado quando usuário muda dispositivo de áudio
 */
globalThis.eventBus.on('audioDeviceChanged', async (_data) => {
  try {
    const sttModel = globalThis.RendererAPI?.getConfiguredSTTModel?.() || 'error';
    Logger.info('audioDeviceChanged', { model: sttModel, type: _data.type });

    if (!_data?.type) {
      Logger.warn('Dados inválidos para mudança de dispositivo', _data);
      return;
    }

    if (!globalThis.appState.audio.isRunning) {
      Logger.warn('STT não está ativo, ignorando mudança');
      return;
    }

    await globalThis.sttStrategy.switchDevice(sttModel, _data.type, _data.deviceId);
  } catch (error) {
    Logger.error('Erro ao processar mudança de dispositivo', error);
  }
});

/**
 * Listener: llmStreamEnd
 * Disparado quando streaming de LLM termina
 */
globalThis.eventBus.on('llmStreamEnd', (data) => {
  Logger.debug('LLM Stream finalizado', { questionId: data.questionId }, false);

  globalThis.appState.interview.answeredQuestions.add(data.questionId);

  if (globalThis.modeManager.is(globalThis.MODES.INTERVIEW)) {
    globalThis.appState.interview.llmAnsweredTurnId = globalThis.appState.interview.interviewTurnId;
    globalThis.appState.resetCurrentQuestion();
    globalThis.renderCurrentQuestion();
  }

  globalThis.eventBus.emit('answerStreamEnd', {});
  globalThis.eventBus.emit('sortAnswersByTurnId', {});
});

/**
 * Listener: llmBatchEnd
 * Disparado quando batch de LLM termina
 */
globalThis.eventBus.on('llmBatchEnd', (data) => {
  Logger.debug('LLM Batch finalizado', {
    questionId: data.questionId,
    responseLength: data.response?.length || 0,
  });

  globalThis.appState.interview.answeredQuestions.add(data.questionId);

  const questionEntry = globalThis.appState.history.find((q) => q.id === data.questionId);
  const turnId = questionEntry?.turnId || null;

  globalThis.eventBus.emit('answerBatchEnd', {
    questionId: data.questionId,
    response: data.response,
    turnId,
  });
});

/**
 * Listener: error
 * Disparado quando erro ocorre na eventBus
 */
globalThis.eventBus.on('error', (error) => {
  Logger.error('Erro na eventBus', { error });
  if (globalThis.configManager?.showError) {
    globalThis.configManager.showError(error);
  }
});

// ================================
// SEÇÃO 8: RENDERER API (Ponte com Main.js)
// ================================

/**
 * RendererAPI - Interface pública entre renderer e main process
 *
 * Expõe métodos que podem ser chamados de:
 * - Dentro do renderer (via globalThis)
 * - Controllers e managers (via globalThis.RendererAPI)
 * - main.js (via ipcRenderer)
 */
const RendererAPI = {
  // Audio
  listenToggleBtn: globalThis.listenToggleBtn,
  askLLM: globalThis.askLLM,
  get isAudioRunning() {
    return globalThis.appState.audio.isRunning;
  },
  startAudioVolumeMonitor: globalThis.startAudioVolumeMonitor,
  stopAudioVolumeMonitor: globalThis.stopAudioVolumeMonitor,
  switchAudioVolumeDevice: globalThis.switchAudioVolumeDevice,

  // Entrevista
  resetAppState: globalThis.resetAppState,

  // Modo
  changeMode: (mode) => {
    globalThis.modeManager.setMode(mode);
    console.log(`📌 Modo alterado: ${mode}`);
  },
  getMode: () => globalThis.modeManager.getMode(),

  // Perguntas
  handleCurrentQuestion: (...args) => globalThis.handleCurrentQuestion?.(...args),
  handleQuestionClick: (e) => globalThis.handleQuestionClick?.(e),
  get selectedId() {
    return globalThis.appState.selectedId;
  },

  // UI
  updateMockBadge: (show) => {
    globalThis.eventBus.emit('screenshotBadgeUpdate', { visible: show });
  },
  setMockToggle: (checked) => {
    globalThis.isMockDebugMode = checked;
  },
  setModeSelect: (mode) => {
    globalThis.eventBus.emit('modeSelectUpdate', { mode });
  },

  // Drag & Window
  setClickThrough: (enabled) => {
    ipcRenderer.send('SET_CLICK_THROUGH', enabled);
  },
  startWindowDrag: () => {
    return ipcRenderer.invoke('START_WINDOW_DRAG');
  },
  setWindowOpacity: (opacity) => {
    globalThis.eventBus.emit('windowOpacityUpdate', {
      opacity: Math.max(0, Math.min(1, opacity)),
    });
    return Promise.resolve();
  },
  updateClickThroughButton: (enabled, btnToggle) => {
    if (!btnToggle || !(btnToggle instanceof HTMLElement)) return;
    btnToggle.style.opacity = enabled ? '0.5' : '1';
    btnToggle.title = enabled
      ? 'Click-through ATIVO (clique para desativar)'
      : 'Click-through INATIVO (clique para ativar)';
  },

  // Config
  setAppConfig: (config) => {
    if (config.MODE_DEBUG !== undefined) {
      globalThis.isMockDebugMode = config.MODE_DEBUG;
      if (globalThis.isMockDebugMode && globalThis.mockRunner) {
        globalThis.mockRunner.initMockInterceptor({
          eventBus: globalThis.eventBus,
          captureScreenshot: globalThis.captureScreenshot,
          analyzeScreenshots: globalThis.analyzeScreenshots,
        });
        Logger.info('✅ Mock interceptor inicializado');
      }
    }
  },
  getAppConfig: () => ({
    MODE_DEBUG: globalThis.isMockDebugMode || false,
  }),

  // Navegação
  navigateQuestions: (direction) => {
    const all = globalThis.getNavigableQuestionIds?.() || [];
    if (all.length === 0) return;

    let index = all.indexOf(globalThis.appState.selectedId);
    if (index === -1) {
      index = direction === 'up' ? all.length - 1 : 0;
    } else {
      index += direction === 'up' ? -1 : 1;
      index = Math.max(0, Math.min(index, all.length - 1));
    }

    globalThis.appState.selectedId = all[index];
    globalThis.clearAllSelections();
    globalThis.renderQuestionsHistory();
    globalThis.renderCurrentQuestion();

    if (globalThis.isMockDebugMode) {
      const msg = direction === 'up' ? '🧪 Ctrl+Up' : '🧪 Ctrl+Down';
      globalThis.updateStatusMessage(msg);
    }
  },

  // IPC Listeners
  onApiKeyUpdated: (callback) => {
    ipcRenderer.on('API_KEY_UPDATED', callback);
  },
  onToggleAudio: (callback) => {
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
  sendRendererError: (error) => {
    try {
      console.error('RENDERER ERROR', error instanceof Error ? error.message : error);
      ipcRenderer.send('RENDERER_ERROR', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
      });
    } catch (err) {
      console.error('Falha ao enviar RENDERER_ERROR', err);
    }
  },

  // Screenshots
  captureScreenshot: globalThis.captureScreenshot,
  analyzeScreenshots: globalThis.analyzeScreenshots,
  clearScreenshots: globalThis.clearScreenshots,
  getScreenshotCount: () => globalThis.appState.audio.capturedScreenshots.length,
  onCaptureScreenshot: (callback) => {
    ipcRenderer.on('CMD_CAPTURE_SCREENSHOT', callback);
  },
  onAnalyzeScreenshots: (callback) => {
    ipcRenderer.on('CMD_ANALYZE_SCREENSHOTS', callback);
  },
  onNavigateQuestions: (callback) => {
    ipcRenderer.on('CMD_NAVIGATE_QUESTIONS', (_, direction) => {
      callback(direction);
    });
  },

  // Dependências para Audio Controller
  sttStrategy: globalThis.sttStrategy,
  modeManager: globalThis.modeManager,
  MODES: globalThis.MODES,
  getConfiguredSTTModel: () => {
    try {
      const config = globalThis.configManager?.config;
      if (!config) return 'error';
      const activeProvider = config.api?.activeProvider;
      return config.api?.[activeProvider]?.selectedSTTModel || 'error';
    } catch (err) {
      Logger?.error('Erro ao obter STT model:', err);
      return 'error';
    }
  },
  updateStatusMessage: globalThis.updateStatusMessage,
  closeCurrentQuestionForced: globalThis.closeCurrentQuestionForced,
  findAnswerByQuestionId: globalThis.findAnswerByQuestionId,
  initAudioController: (deps) => {
    if (typeof globalThis.initAudioController === 'function') {
      globalThis.initAudioController(deps);
    }
  },
  initQuestionController: (deps) => {
    if (typeof globalThis.initQuestionController === 'function') {
      globalThis.initQuestionController(deps);
    }
  },
};

// Exportar RendererAPI
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RendererAPI;
}

if (typeof globalThis !== 'undefined') {
  globalThis.RendererAPI = RendererAPI;
  globalThis.runMockAutoPlay = () => globalThis.mockRunner?.runMockAutoPlay();
  globalThis.clearAllSelections = globalThis.clearAllSelections || (() => {});
}

console.log('✅ RendererAPI inicializada com sucesso');
