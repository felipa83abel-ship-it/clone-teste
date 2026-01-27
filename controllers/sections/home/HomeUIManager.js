// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger, DOM */

/**
 * HomeUIManager - Gerencia interface do HOME
 *
 * Responsabilidades:
 *   - Botão de toggle mock mode
 *   - Botão de reset home
 *   - Listeners de botões de ação (listen, ask llm)
 *   - Questions history click handling
 */
class HomeUIManager {
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
    this.#initUIEventBusListeners();
    await this.restoreState();
    Logger.debug('🏠 HomeManager: Inicialização completa');
    console.log('🏠🏠🏠 HomeManager.initialize() COMPLETO 🏠🏠🏠');
  }

  /**
   * Restaura estado salvo do HOME
   */
  async restoreState() {
    Logger.debug('🏠 HomeManager: Restaurando estado');
    const mockToggle = DOM.get('mockToggle');
    if (mockToggle && globalThis.RendererAPI) {
      const currentConfig = globalThis.RendererAPI.getAppConfig?.();
      if (currentConfig?.isMockDebugMode) {
        mockToggle.checked = true;
      }
    }
  }

  /**
   * Reseta tudo (mock toggle para false)
   */
  async reset() {
    Logger.debug('🏠 HomeManager: Resete');
    const mockToggle = DOM.get('mockToggle');
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
    const element = DOM.get(elementId);
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
          const targetSection = DOM.get(tabName);
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
    const mockToggle = DOM.get('mockToggle');
    if (mockToggle) {
      mockToggle.addEventListener('change', async () => {
        if (!globalThis.RendererAPI) return;

        const isEnabled = mockToggle.checked;
        if (globalThis.RendererAPI?.setAppConfig) {
          globalThis.RendererAPI.setAppConfig({
            ...globalThis.RendererAPI.getAppConfig(),
            isMockDebugMode: isEnabled,
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
    const resetBtn = DOM.get('resetHomeBtn');
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
        console.log('💡 Atalho Ctrl+Enter acionado - chamando handleQuestionClick');
        // 🔥 CORRIGIDO: Chamar handleQuestionClick() em vez de askLLM()
        // Isso garante que passa por todas as validações: pergunta já respondida, incompleta, etc
        // Mesma regra que o clique do mouse
        if (globalThis.RendererAPI?.handleQuestionClick) {
          try {
            // Usar selectedId da API (que sincroniza navegação) ou fallback para CURRENT
            const selectedId = globalThis.RendererAPI?.selectedId || 'CURRENT';
            globalThis.RendererAPI.handleQuestionClick(selectedId);
          } catch (error) {
            console.error('❌ Erro ao chamar handleQuestionClick via atalho:', error);
          }
        }
      });
      console.log('   ✅ Listener para CMD_ASK_LLM (Ctrl+Enter) registrado');
    } else {
      console.warn('   ⚠️ RendererAPI.onAskLlm não disponível');
    }

    // 🔥 NOVO: Atalho Ctrl+Shift+Up/Down: Navegar entre perguntas
    if (globalThis.RendererAPI?.onNavigateQuestions) {
      globalThis.RendererAPI.onNavigateQuestions((direction) => {
        console.log(
          `🧭 Atalho Ctrl+Shift+${direction === 'up' ? '↑' : '↓'} acionado - navegando ${direction}`
        );
        if (globalThis.RendererAPI?.navigateQuestions) {
          try {
            globalThis.RendererAPI.navigateQuestions(direction);
          } catch (error) {
            console.error('❌ Erro ao navegar perguntas:', error);
          }
        }
      });
      console.log('   ✅ Listener para CMD_NAVIGATE_QUESTIONS (Ctrl+Shift+Up/Down) registrado');
    } else {
      console.warn('   ⚠️ RendererAPI.onNavigateQuestions não disponível');
    }

    console.log('>>> #initActionButtonListeners COMPLETO');
  }

  /**
   * Registra listeners para questions history
   */
  #initQuestionsHistoryListener() {
    Logger.debug('🏠 HomeManager: #initQuestionsHistoryListener');
    const questionsHistoryBox = DOM.get('questionsHistory');
    if (questionsHistoryBox) {
      questionsHistoryBox.addEventListener('click', (e) => {
        const questionBlock = e.target.closest('.question-block');
        if (questionBlock && globalThis.RendererAPI?.handleQuestionClick) {
          // Extrair o questionId do dataset
          const questionId = questionBlock.dataset.questionId;
          globalThis.RendererAPI.handleQuestionClick(questionId);
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

  /**
   * 🔥 NOVO: Registra listeners de EventBus para atualizar UI
   * Isto centraliza TODOS os listeners de DOM que estavam espalhados em renderer.js
   */
  #initUIEventBusListeners() {
    console.log('>>> #initUIEventBusListeners INICIADO - Centralizando listeners de DOM');
    Logger.debug('🏠 HomeManager: #initUIEventBusListeners');

    // ==========================================
    // LISTENER: inputVolumeUpdate
    // Atualiza VU meter de entrada em tempo real
    // ==========================================
    this.eventBus.on('inputVolumeUpdate', ({ percent }) => {
      const inputVu = DOM.get('inputVu');
      if (inputVu) inputVu.style.width = percent + '%';

      const inputVuHome = DOM.get('inputVuHome');
      if (inputVuHome) inputVuHome.style.width = percent + '%';

      Logger.debug(`📊 Input Volume atualizado: ${percent}%`, false);
    });

    // ==========================================
    // LISTENER: outputVolumeUpdate
    // Atualiza VU meter de saída em tempo real
    // ==========================================
    this.eventBus.on('outputVolumeUpdate', ({ percent }) => {
      const outputVu = DOM.get('outputVu');
      if (outputVu) outputVu.style.width = percent + '%';

      const outputVuHome = DOM.get('outputVuHome');
      if (outputVuHome) outputVuHome.style.width = percent + '%';

      Logger.debug(`📊 Output Volume atualizado: ${percent}%`, false);
    });

    // ==========================================
    // LISTENER: listenButtonToggle
    // Atualiza botão listen quando áudio começa/para
    // ==========================================
    this.eventBus.on('listenButtonToggle', ({ isRunning, buttonText }) => {
      const listenBtn = DOM.get('listenBtn');
      if (listenBtn) {
        listenBtn.textContent = buttonText;
        listenBtn.classList.toggle('listening', isRunning);
        console.log(`🎨 Botão listen atualizado: "${buttonText}" (listening: ${isRunning})`);
      } else {
        console.warn('⚠️ Elemento listenBtn não encontrado no DOM');
      }

      // 🔥 Aplicar efeito visual no home quando começa/para de ouvir
      const homeVuMeters = document.querySelector('.home-vu-meters');
      if (homeVuMeters) {
        homeVuMeters.classList.toggle('listening', isRunning);
        console.log(`🎨 .home-vu-meters atualizado (listening: ${isRunning})`);
      }

      // Se parou de capturar, resetar volume na home para 0
      if (!isRunning) {
        const inputVuHome = DOM.get('inputVuHome');
        if (inputVuHome) inputVuHome.style.width = '0%';

        const outputVuHome = DOM.get('outputVuHome');
        if (outputVuHome) outputVuHome.style.width = '0%';
      }
    });

    // ==========================================
    // LISTENER: statusUpdate
    // Atualiza mensagem de status
    // ==========================================
    this.eventBus.on('statusUpdate', ({ message }) => {
      const statusDiv = DOM.get('statusDiv');
      if (statusDiv) {
        statusDiv.textContent = message;
        console.log(`📊 Status atualizado: "${message}"`);
      }
    });

    // ==========================================
    // LISTENER: transcriptAdd
    // Adiciona transcrição ao UI com placeholder
    // ==========================================
    this.eventBus.on('transcriptAdd', ({ author, text, timeStr, elementId, placeholderId }) => {
      const transcriptBox = DOM.get(elementId || 'conversation');
      if (!transcriptBox) {
        console.warn(`⚠️ Elemento ${elementId || 'conversation'} não encontrado`);
        return;
      }
      // Adiciona placeholder vazio que será preenchido depois
      const div = document.createElement('div');
      div.id = placeholderId;
      div.className = 'transcript-item placeholder';
      div.setAttribute('data-is-placeholder', 'true');
      div.innerHTML = `<span style="color:#999">[${timeStr}]</span> <strong>${author}:</strong> <span class="placeholder-text">...</span>`;
      transcriptBox.appendChild(div);
      console.log(`📝 Transcrição placeholder adicionado (${author})`);
    });

    // ==========================================
    // LISTENER: updateInterim
    // Atualiza transcrição interim em tempo real
    // ==========================================
    this.eventBus.on('updateInterim', ({ id, speaker, text }) => {
      let interimElement = document.getElementById(id);
      if (!interimElement) {
        // Cria elemento interim se não existir
        const transcriptBox = DOM.get('conversation');
        if (!transcriptBox) {
          console.warn('⚠️ Elemento conversation não encontrado');
          return;
        }
        interimElement = document.createElement('div');
        interimElement.id = id;
        interimElement.className = 'transcript-item interim';
        transcriptBox.appendChild(interimElement);
      }
      // Atualiza texto interim
      const ts = new Date().toLocaleTimeString();
      interimElement.innerHTML = `<span style="color:#999">[${ts}]</span> <strong>${speaker}:</strong> <span style="font-style:italic;color:#888">${text}</span>`;
      console.log(`⏳ Interim atualizado (${speaker}): ${text.substring(0, 30)}...`);
    });

    // ==========================================
    // LISTENER: placeholderFulfill
    // Preenche placeholder com transcrição final
    // ==========================================
    this.eventBus.on('placeholderFulfill', ({ placeholderId, text, speaker }) => {
      const placeholder = document.getElementById(placeholderId);
      if (placeholder) {
        placeholder.classList.remove('placeholder');
        placeholder.classList.add('final');
        placeholder.setAttribute('data-is-placeholder', 'false');
        const ts = new Date().toLocaleTimeString();
        placeholder.innerHTML = `<span style="color:#999">[${ts}]</span> <strong>${speaker}:</strong> ${text}`;
        console.log(`✅ Placeholder preenchido (${speaker}): ${text.substring(0, 30)}...`);
      } else {
        console.warn(`⚠️ Placeholder ${placeholderId} não encontrado`);
      }
    });

    // ==========================================
    // LISTENER: clearInterim
    // Remove elemento interim do DOM
    // ==========================================
    this.eventBus.on('clearInterim', ({ id }) => {
      const interimElement = document.getElementById(id);
      if (interimElement) {
        interimElement.remove();
        console.log(`🗑️ Interim removido: ${id}`);
      }
    });

    // ==========================================
    // LISTENER: transcriptionCleared
    // Limpa transcrições do UI
    // ==========================================
    this.eventBus.on('transcriptionCleared', () => {
      const transcriptBox = DOM.get('transcriptBox');
      if (transcriptBox) {
        transcriptBox.innerHTML = '';
        Logger.debug('🗑️ Transcrição limpa do UI', false);
      }
    });

    // ==========================================
    // LISTENER: answersCleared
    // Limpa respostas do UI
    // ==========================================
    this.eventBus.on('answersCleared', () => {
      const answersHistoryBox = DOM.get('answersHistory');
      if (answersHistoryBox) {
        answersHistoryBox.innerHTML = '';
        Logger.debug('🗑️ Respostas limpas do UI', false);
      }
    });

    // ==========================================
    // LISTENER: currentQuestionUpdate
    // Renderiza pergunta atual
    // ==========================================
    this.eventBus.on('currentQuestionUpdate', (data) => {
      const { text, isSelected } = data;
      const currentQuestionBox = DOM.get('currentQuestion');

      if (!currentQuestionBox) {
        console.warn('⚠️ Elemento #currentQuestion não encontrado no DOM');
        return;
      }

      // Classe base com seleção
      let className = 'current-question-block';
      if (isSelected) {
        className += ' selected-question';
      }

      currentQuestionBox.className = className;
      currentQuestionBox.innerHTML = `
        <div class="question-content">
          <span class="question-text">${text}</span>
        </div>
      `;
      console.log(`🎯 Pergunta atual atualizada: "${text?.substring(0, 30) || '(vazio)'}..."`);
    });

    // ==========================================
    // LISTENER: questionsHistoryUpdate
    // Renderiza histórico de perguntas no DOM
    // ==========================================
    this.eventBus.on('questionsHistoryUpdate', (historyData) => {
      const questionsHistoryBox = DOM.get('questionsHistory');

      if (!questionsHistoryBox) {
        console.warn('⚠️ Elemento #questionsHistory não encontrado');
        return;
      }

      // Limpar histórico anterior
      questionsHistoryBox.innerHTML = '';

      // Renderizar cada pergunta no DOM
      if (Array.isArray(historyData)) {
        historyData.forEach((question) => {
          const questionBlock = document.createElement('div');

          // Classe base: question-block
          let className = 'question-block';

          // Adicionar class 'answered' se respondida (estilos com bordas verdes)
          if (question.isAnswered) {
            className += ' answered';
          }

          // Adicionar class 'selected' se selecionada (bordas azuis)
          if (question.isSelected) {
            className += ' selected-question';
          }

          questionBlock.className = className;
          questionBlock.dataset.questionId = question.id;

          // Construir badges
          let badgesHtml = '';

          // Badge turn-id (número da pergunta) - vermelho por padrão
          if (question.turnId) {
            badgesHtml += `<span class="turn-id-badge">${question.turnId}</span>`;
          }

          // Badge answered (checkmark verde)
          if (question.isAnswered) {
            badgesHtml += `<span class="badge answered" title="Respondida">✓</span>`;
          }

          // Badge incomplete (warning amarelo)
          if (question.isIncomplete) {
            badgesHtml += `<span class="badge incomplete" title="Incompleta">⚠️</span>`;
          }

          questionBlock.innerHTML = `
            ${badgesHtml}
            <span class="question-text">${question.text}</span>
          `;

          questionsHistoryBox.appendChild(questionBlock);
        });
        console.log(`📋 Histórico de perguntas renderizado (${historyData.length} perguntas)`);
      }
    });

    // ==========================================
    // LISTENER: scrollToQuestion
    // Rola para pergunta selecionada
    // ==========================================
    this.eventBus.on('scrollToQuestion', ({ questionId }) => {
      const questionsHistoryBox = DOM.get('questionsHistory');
      if (questionsHistoryBox) {
        const questionBlock = questionsHistoryBox.querySelector(
          `[data-question-id="${questionId}"]`
        );
        if (questionBlock) {
          questionBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          console.log(`📍 Rolou para pergunta: ${questionId}`);
        }
      }
    });

    // ==========================================
    // LISTENER: clearAllSelections
    // Limpa seleção de todas as perguntas
    // ==========================================
    this.eventBus.on('clearAllSelections', () => {
      const questionsHistoryBox = DOM.get('questionsHistory');
      if (questionsHistoryBox) {
        questionsHistoryBox.querySelectorAll('.question-block').forEach((block) => {
          block.classList.remove('selected');
        });
        console.log('🧹 Seleção de perguntas limpa');
      }
    });

    // ==========================================
    // LISTENER: answerStreamChunk
    // Streaming de resposta (token por token)
    // ==========================================
    this.eventBus.on('answerStreamChunk', (data) => {
      const { token, questionId, turnId } = data;
      const answersHistory = DOM.get('answersHistory');

      if (!token) return; // Ignorar tokens vazios

      if (answersHistory) {
        // Procurar elemento de resposta existente
        let answerBlock = answersHistory.querySelector(`[data-question-id="${questionId}"]`);

        if (!answerBlock) {
          // Criar novo bloco se não existir
          answerBlock = document.createElement('div');
          answerBlock.className = 'answer-block active';
          answerBlock.dataset.questionId = questionId;
          if (turnId) {
            answerBlock.dataset.turnId = turnId;
          }

          // Adicionar badge turn-id
          const turnIdBadgeHtml = turnId
            ? `<span class="turn-id-badge answer">${turnId}</span>`
            : '';

          answerBlock.innerHTML = `
            ${turnIdBadgeHtml}
            <div class="answer-content">${token}</div>
          `;

          answersHistory.appendChild(answerBlock);
        } else {
          // Adicionar token ao fim (streaming)
          const answerContent = answerBlock.querySelector('.answer-content');
          if (answerContent) {
            answerContent.innerHTML += token;
          }
        }
      }
    });

    // ==========================================
    // LISTENER: answerBatchEnd
    // Resposta completa (batch/completions)
    // ==========================================
    this.eventBus.on('answerBatchEnd', (data) => {
      const { questionId, response, turnId } = data;
      const answersHistory = DOM.get('answersHistory');

      if (answersHistory) {
        const answerEl = answersHistory.querySelector(
          `[data-question-id="${questionId}"] .answer-content`
        );

        if (answerEl) {
          // Atualizar resposta existente
          answerEl.innerHTML = response;
          if (turnId) {
            answerEl.dataset.turnId = turnId;
          }
        } else {
          // Criar novo bloco de resposta
          const answerBlock = document.createElement('div');
          answerBlock.className = 'answer-block active';
          answerBlock.dataset.questionId = questionId;

          // Construir HTML com badge turn-id
          let turnIdBadgeHtml = '';
          if (turnId) {
            turnIdBadgeHtml = `<span class="turn-id-badge answer">${turnId}</span>`;
          }

          answerBlock.innerHTML = `
            ${turnIdBadgeHtml}
            <div class="answer-content" ${turnId ? `data-turn-id="${turnId}"` : ''}>
              ${response}
            </div>
          `;

          answersHistory.appendChild(answerBlock);
        }

        console.log(
          `✅ Resposta completa renderizada (questionId: ${questionId}, turnId: ${turnId})`
        );
      }
    });

    // ==========================================
    // LISTENER: answerStreamEnd
    // Indica fim do streaming
    // ==========================================
    this.eventBus.on('answerStreamEnd', (_) => {
      const answersHistory = DOM.get('answersHistory');
      if (answersHistory) {
        const lastAnswer = answersHistory.querySelector('.answer-block:last-child');
        if (lastAnswer) {
          lastAnswer.classList.add('complete');
          console.log('✅ Stream de resposta finalizado');
        }
      }
    });

    // ==========================================
    // LISTENER: sortAnswersByTurnId
    // Reordena respostas por turnId (DESC)
    // ==========================================
    this.eventBus.on('sortAnswersByTurnId', () => {
      const answersHistoryBox = DOM.get('answersHistory');
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
      console.log('🔄 Respostas reordenadas por turnId');
    });

    // ==========================================
    // LISTENER: answerSelected
    // Marca resposta como selecionada quando pergunta já foi respondida
    // ==========================================
    this.eventBus.on('answerSelected', ({ questionId, shouldScroll }) => {
      const answersHistory = DOM.get('answersHistory');
      if (!answersHistory) return;

      // Remover seleção anterior
      answersHistory.querySelectorAll('.answer-block').forEach((block) => {
        block.classList.remove('selected-answer');
      });

      // Adicionar seleção na resposta da pergunta
      const answerBlock = answersHistory.querySelector(`[data-question-id="${questionId}"]`);
      if (answerBlock) {
        answerBlock.classList.add('selected-answer');

        // Rolar para resposta se solicitado
        if (shouldScroll) {
          answerBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          console.log(`📌 Resposta selecionada e visível: ${questionId}`);
        } else {
          console.log(`📌 Resposta selecionada: ${questionId}`);
        }
      }
    });

    console.log('>>> #initUIEventBusListeners COMPLETO - Todos os listeners de DOM centralizados');
  }
}

module.exports = HomeUIManager;
