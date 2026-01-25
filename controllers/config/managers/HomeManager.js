// @ts-nocheck
/* global Logger */

/**
 * HomeManager - Gerencia interface do HOME
 *
 * Responsabilidades:
 *   - Botão de toggle mock mode
 *   - Botão de reset home
 *   - Listeners de botões de ação (listen, ask llm)
 *   - Questions history click handling
 */
class HomeManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;
  }

  /**
   * Inicializa listeners do HOME
   */
  async initialize() {
    Logger.debug('🏠 HomeManager: Iniciando');
    this.#initMockToggle();
    this.#initResetHomeButton();
    this.#initActionButtonListeners();
    this.#initQuestionsHistoryListener();
    await this.restoreState();
    Logger.debug('🏠 HomeManager: Inicialização completa');
  }

  /**
   * Restaura estado salvo do HOME
   */
  async restoreState() {
    Logger.debug('🏠 HomeManager: Restaurando estado');
    const mockToggle = document.getElementById('mockToggle');
    if (mockToggle && globalThis.RendererAPI) {
      const currentConfig = globalThis.RendererAPI.getAppConfig?.();
      if (currentConfig?.MODE_DEBUG) {
        mockToggle.checked = true;
      }
    }
  }

  /**
   * Reseta tudo (mock toggle para false)
   */
  async reset() {
    Logger.debug('🏠 HomeManager: Resete');
    const mockToggle = document.getElementById('mockToggle');
    if (mockToggle) {
      mockToggle.checked = false;
    }
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Helper para registrar listeners em elementos
   * @param {string} elementId - ID do elemento
   * @param {string} eventType - Tipo de evento (click, change, etc)
   * @param {function} callback - Função callback
   */
  registerElementListener(elementId, eventType, callback) {
    const element = document.getElementById(elementId);
    if (element) {
      element.addEventListener(eventType, callback);
    }
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listener do mock toggle
   */
  #initMockToggle() {
    Logger.debug('🏠 HomeManager: #initMockToggle');
    const mockToggle = document.getElementById('mockToggle');
    if (mockToggle) {
      mockToggle.addEventListener('change', async () => {
        if (!globalThis.RendererAPI) return;

        const isEnabled = mockToggle.checked;
        if (globalThis.RendererAPI?.setAppConfig) {
          globalThis.RendererAPI.setAppConfig({
            ...globalThis.RendererAPI.getAppConfig(),
            MODE_DEBUG: isEnabled,
          });
        }

        if (isEnabled) {
          globalThis.RendererAPI?.updateMockBadge(true);
          if (globalThis.RendererAPI?.resetAppState) {
            await globalThis.RendererAPI.resetAppState();
          }
          globalThis.mockScenarioIndex = 0;
          globalThis.mockAutoPlayActive = false;
          setTimeout(() => {
            if (globalThis.runMockAutoPlay) {
              globalThis.runMockAutoPlay();
            }
          }, 2000);
        } else {
          globalThis.RendererAPI?.updateMockBadge(false);
          if (globalThis.RendererAPI?.resetAppState) {
            await globalThis.RendererAPI.resetAppState();
          }
        }
      });
    }
  }

  /**
   * Registra listener do botão reset home
   */
  #initResetHomeButton() {
    Logger.debug('🏠 HomeManager: #initResetHomeButton');
    const resetBtn = document.getElementById('resetHomeBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const confirmed = confirm(
          '⚠️ Isso vai limpar toda transcrição, histórico e respostas.\n\nTem certeza?'
        );
        if (confirmed) {
          globalThis.RendererAPI?.resetAppState?.().then(() => {
            Logger.debug('🏠 HomeManager: Reset home concluído');
          });
        }
      });
      Logger.debug('🏠 HomeManager: Listener do botão reset instalado');
    } else {
      Logger.warn('🏠 HomeManager: Botão reset não encontrado no DOM');
    }
  }

  /**
   * Registra listeners dos botões de ação (listen, ask llm, close)
   */
  #initActionButtonListeners() {
    Logger.debug('🏠 HomeManager: #initActionButtonListeners');

    // Listen button
    this.registerElementListener('listenBtn', 'click', () => {
      if (globalThis.RendererAPI?.listenToggleBtn) {
        globalThis.RendererAPI.listenToggleBtn();
      }
    });

    // Ask LLM button
    this.registerElementListener('askLlmBtn', 'click', () => {
      if (globalThis.RendererAPI?.askLlm) {
        globalThis.RendererAPI.askLlm();
      }
    });

    // Close button
    this.registerElementListener('btnClose', 'click', () => {
      this.ipc.send('APP_CLOSE');
    });
  }

  /**
   * Registra listeners para questions history
   */
  #initQuestionsHistoryListener() {
    Logger.debug('🏠 HomeManager: #initQuestionsHistoryListener');
    const questionsHistoryBox = document.getElementById('questionsHistory');
    if (questionsHistoryBox) {
      questionsHistoryBox.addEventListener('click', (e) => {
        const questionBlock = e.target.closest('.question-block');
        if (questionBlock && globalThis.RendererAPI?.handleQuestionClick) {
          globalThis.RendererAPI.handleQuestionClick(questionBlock);
        }
      });
    }
  }
}

module.exports = HomeManager;
