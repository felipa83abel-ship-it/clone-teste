// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
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
    console.log('🏠🏠🏠 HomeManager.initialize() INICIADO 🏠🏠🏠');
    Logger.debug('🏠 HomeManager: Iniciando');
    this.#initMenuNavigation();
    this.#initTabSwitching();
    this.#initMockToggle();
    this.#initResetHomeButton();
    this.#initActionButtonListeners();
    this.#initQuestionsHistoryListener();
    await this.restoreState();
    Logger.debug('🏠 HomeManager: Inicialização completa');
    console.log('🏠🏠🏠 HomeManager.initialize() COMPLETO 🏠🏠🏠');
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
      console.log(`   ✅ Listener registrado: ${elementId}`);
    } else {
      console.warn(`   ⚠️ Elemento não encontrado: ${elementId}`);
    }
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners para navegação do menu lateral
   */
  #initMenuNavigation() {
    console.log('>>> #initMenuNavigation INICIADO');
    Logger.debug('🏠 HomeManager: #initMenuNavigation');

    // Registrar listeners para cada item do menu
    document.querySelectorAll('.menu-item[data-tab]').forEach((menuItem) => {
      menuItem.addEventListener('click', () => {
        try {
          const tabName = menuItem.dataset.tab;
          console.log(`>>> Menu item clicado: ${tabName}`);

          // Remover classe active de todos os items
          document.querySelectorAll('.menu-item').forEach((item) => {
            item.classList.remove('active');
          });

          // Adicionar classe active ao item clicado
          menuItem.classList.add('active');

          // Esconder todas as seções
          document.querySelectorAll('.config-section').forEach((section) => {
            section.classList.remove('active');
          });

          // Mostrar a seção correspondente
          const targetSection = document.getElementById(tabName);
          if (targetSection) {
            targetSection.classList.add('active');
            console.log(`>>> Seção ativada: ${tabName}`);
          } else {
            console.warn(`>>> Seção não encontrada: ${tabName}`);
          }
        } catch (error) {
          console.error('>>> ERRO ao navegar menu:', error);
        }
      });
    });

    console.log('>>> #initMenuNavigation COMPLETO');
  }
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
    console.log('>>> #initActionButtonListeners INICIADO');
    Logger.debug('🏠 HomeManager: #initActionButtonListeners');

    // Listen button
    console.log('>>> Registrando listenBtn...');
    this.registerElementListener('listenBtn', 'click', () => {
      try {
        console.log('>>> listenBtn CLICADO!');
        if (globalThis.RendererAPI?.listenToggleBtn) {
          console.log('>>> Chamando listenToggleBtn()...');
          globalThis.RendererAPI.listenToggleBtn();
          console.log('>>> listenToggleBtn() chamado com sucesso');
        } else {
          console.warn('>>> listenToggleBtn NÃO EXISTE em RendererAPI!');
        }
      } catch (error) {
        console.error('>>> ERRO ao chamar listenToggleBtn:', error);
      }
    });

    // Ask LLM button
    console.log('>>> Registrando askLlmBtn...');
    this.registerElementListener('askLlmBtn', 'click', () => {
      try {
        console.log('>>> askLlmBtn CLICADO!');
        if (globalThis.RendererAPI?.askLLM) {
          console.log('>>> Chamando askLLM()...');
          globalThis.RendererAPI.askLLM();
          console.log('>>> askLLM() chamado com sucesso');
        } else {
          console.warn('>>> askLLM NÃO EXISTE em RendererAPI!');
        }
      } catch (error) {
        console.error('>>> ERRO ao chamar askLLM:', error);
      }
    });

    // Close button
    console.log('>>> Registrando btnClose...');
    this.registerElementListener('btnClose', 'click', () => {
      try {
        console.log('>>> btnClose CLICADO - enviando APP_CLOSE IPC');
        this.ipc.send('APP_CLOSE');
        console.log('>>> APP_CLOSE IPC enviado com sucesso');
      } catch (error) {
        console.error('>>> ERRO ao enviar APP_CLOSE:', error);
      }
    });

    // ==========================================
    // REGISTRAR LISTENERS DOS ATALHOS GLOBAIS
    // ==========================================
    console.log('>>> Registrando listeners dos atalhos globais (Ctrl+D, Ctrl+Enter)...');

    // Atalho Ctrl+D: Toggle Audio (Começar/Parar de ouvir)
    if (globalThis.RendererAPI?.onToggleAudio) {
      globalThis.RendererAPI.onToggleAudio(() => {
        console.log('🎤 Atalho Ctrl+D acionado via IPC - chamando listenToggleBtn()');
        if (globalThis.RendererAPI?.listenToggleBtn) {
          try {
            globalThis.RendererAPI.listenToggleBtn();
          } catch (error) {
            console.error('❌ Erro ao chamar listenToggleBtn via atalho:', error);
          }
        }
      });
      console.log('   ✅ Listener para CMD_TOGGLE_AUDIO (Ctrl+D) registrado');
    } else {
      console.warn('   ⚠️ RendererAPI.onToggleAudio não disponível');
    }

    // Atalho Ctrl+Enter: Ask LLM (Enviar pergunta)
    if (globalThis.RendererAPI?.onAskLlm) {
      globalThis.RendererAPI.onAskLlm(() => {
        console.log('💡 Atalho Ctrl+Enter acionado via IPC - chamando askLLM()');
        if (globalThis.RendererAPI?.askLLM) {
          try {
            globalThis.RendererAPI.askLLM();
          } catch (error) {
            console.error('❌ Erro ao chamar askLLM via atalho:', error);
          }
        }
      });
      console.log('   ✅ Listener para CMD_ASK_LLM (Ctrl+Enter) registrado');
    } else {
      console.warn('   ⚠️ RendererAPI.onAskLlm não disponível');
    }

    console.log('>>> #initActionButtonListeners COMPLETO');
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

  /**
   * Registra listeners para troca de abas dentro das seções
   */
  #initTabSwitching() {
    Logger.debug('🏠 HomeManager: #initTabSwitching');
    console.log('>>> #initTabSwitching INICIADO');

    document.querySelectorAll('.tab-button').forEach((button) => {
      button.addEventListener('click', (e) => {
        try {
          const tabId = e.currentTarget.dataset.tab;
          console.log(`>>> Tab button clicado: ${tabId}`);

          // Encontrar o container pai (tab-content ou config-tabs)
          const tabButtons = e.currentTarget.closest('.tab-buttons');
          if (!tabButtons) {
            console.warn(`>>> Tab buttons container não encontrado para tab: ${tabId}`);
            return;
          }

          const tabContent = tabButtons.closest('.config-tabs') || tabButtons.parentElement;
          if (!tabContent) {
            console.warn(`>>> Tab content não encontrado para tab: ${tabId}`);
            return;
          }

          // Remover classe active de todos os botões neste container
          tabContent.querySelectorAll('.tab-button').forEach((btn) => {
            btn.classList.remove('active');
          });

          // Adicionar classe active ao botão clicado
          e.currentTarget.classList.add('active');

          // Ocultar todos os tab-pane neste container
          tabContent.querySelectorAll('.tab-pane').forEach((pane) => {
            pane.classList.remove('active');
          });

          // Mostrar tab-pane selecionado
          const tabPane =
            tabContent.querySelector(`#${tabId}`) || tabContent.querySelector(`[id="${tabId}"]`);
          if (tabPane) {
            tabPane.classList.add('active');
            console.log(`>>> Tab pane ativado: ${tabId}`);
          } else {
            console.warn(`>>> Tab pane não encontrado: ${tabId}`);
          }
        } catch (error) {
          console.error('>>> ERRO ao mudar tab:', error);
        }
      });
    });

    console.log('>>> #initTabSwitching COMPLETO');
  }
}

module.exports = HomeManager;
