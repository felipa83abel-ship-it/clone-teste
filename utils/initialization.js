// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger, ConfigManager */

/**
 * initialization.js
 * Orquestração de inicialização - apenas executa após DOMContentLoaded
 *
 * ⚠️ IMPORTANTE: Este arquivo é carregado APÓS renderer.js
 * Ele pode acessar DOM porque executa após o HTML estar pronto
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    Logger?.debug('📖 DOMContentLoaded - Inicializando controladores...');

    // ==========================================
    // 1️⃣ Registrar DOM-Registry
    // ==========================================
    if (globalThis.DOM) {
      console.log('✅ globalThis.DOM está disponível');
      if (typeof globalThis.DOM.register === 'function') {
        globalThis.DOM.register();
        Logger?.debug('✅ DOM Registry registrado');
      } else {
        console.warn('⚠️ globalThis.DOM.register não é função');
      }
    } else {
      console.warn('⚠️ globalThis.DOM não disponível em DOMContentLoaded');
    }

    // ==========================================
    // 2️⃣ Aguardar RendererAPI
    // ==========================================
    let attempts = 0;
    while (!globalThis.RendererAPI && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!globalThis.RendererAPI) {
      throw new Error('❌ RendererAPI timeout');
    }

    // ==========================================
    // 3️⃣ Instanciar ConfigManager
    // ==========================================
    if (!globalThis.configManager) {
      globalThis.configManager = new ConfigManager();
      await globalThis.configManager.initializeController();
      Logger?.debug('✅ ConfigManager inicializado');
    }

    // ==========================================
    // 4️⃣ Inicializar AudioController
    // ==========================================
    if (globalThis.RendererAPI?.initAudioController && globalThis.configManager) {
      const uiElements = {
        inputSelect: globalThis.DOM?.get('audioInputDevice'),
        outputSelect: globalThis.DOM?.get('audioOutputDevice'),
        listeningBtn: globalThis.DOM?.get('listenBtn'),
        listenBtn: globalThis.DOM?.get('listenBtn'),
      };

      const audioControllerDeps = {
        appState: globalThis.appState,
        eventBus: globalThis.eventBus,
        sttStrategy: globalThis.RendererAPI.sttStrategy,
        globalConfig: globalThis.configManager,
        UIElements: uiElements,
        CURRENT_QUESTION_ID: 'CURRENT',
        modeManager: globalThis.RendererAPI.modeManager,
        MODES: globalThis.RendererAPI.MODES,
        getConfiguredSTTModel: globalThis.RendererAPI.getConfiguredSTTModel,
        closeCurrentQuestionForced: globalThis.RendererAPI.closeCurrentQuestionForced,
        updateStatusMessage: globalThis.RendererAPI.updateStatusMessage,
        findAnswerByQuestionId: globalThis.RendererAPI.findAnswerByQuestionId,
      };

      globalThis.RendererAPI.initAudioController(audioControllerDeps);
      Logger?.debug('✅ AudioController inicializado');
    }

    // ==========================================
    // 5️⃣ Inicializar QuestionController
    // ==========================================
    if (globalThis.RendererAPI?.initQuestionController) {
      const questionControllerDeps = {
        CURRENT_QUESTION_ID: 'CURRENT',
        ENABLE_INTERVIEW_TIMING_DEBUG_METRICS: false,
        MODES: globalThis.RendererAPI.MODES,
      };

      globalThis.RendererAPI.initQuestionController(questionControllerDeps);
      Logger?.debug('✅ QuestionController inicializado');
    }

    Logger?.debug('✅ Aplicação pronta para uso');
  } catch (error) {
    console.error('❌ Erro na inicialização:', error);
  }
});
