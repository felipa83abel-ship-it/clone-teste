/* ================================ */
// QUESTION CONTROLLER
// Gerencia renderização, navegação e manipulação de perguntas
/* ================================ */

// ⚠️ Evitar redeclaração de variáveis do módulo
if (!globalThis._questionControllerLoaded) {
  globalThis._questionControllerLoaded = true;

  // Dependências carregadas globalmente via index.html
  // question-helpers funções (finalizeQuestion, resetCurrentQuestion, findAnswerByQuestionId)
  // carregadas como script antes deste arquivo

  // Helpers (usar aliases para evitar redeclaração de identificadores globais)
  const _qhelpers =
    typeof require !== 'undefined'
      ? (() => {
          try {
            return require('./question-helpers.js');
          } catch (e) {
            return {};
          }
        })()
      : {};

  const _finalizeQuestion = _qhelpers.finalizeQuestion || globalThis?.finalizeQuestion;
  const _resetCurrentQuestion = _qhelpers.resetCurrentQuestion || globalThis?.resetCurrentQuestion;
  if (typeof globalThis._findAnswerByQuestionId === 'undefined') {
    globalThis._findAnswerByQuestionId =
      _qhelpers.findAnswerByQuestionId || globalThis?.findAnswerByQuestionId;
  }
  const _findAnswerByQuestionId = globalThis._findAnswerByQuestionId;

  const updateStatusMessage = globalThis?.updateStatusMessage;
  const Logger = globalThis?.Logger;
  const state = globalThis?.appState;

  // MODES, CURRENT_QUESTION_ID, ENABLE_INTERVIEW_TIMING_DEBUG_METRICS vêm de globalThis ou deps

  // Funções externas - vêm de deps
  // updateStatusMessage, askLLM, clearAllSelections vêm de deps

  /**
   * Inicializar question-controller com dependências
   */
  function initQuestionController(deps) {
    // Guardar deps em globalThis para acesso
    globalThis._questionControllerDeps = deps;
  }

  /**
   * Renderiza o histórico de perguntas
   */
  function renderQuestionsHistory() {
    Logger.debug('Início da função: "renderQuestionsHistory"');

    const eventBusGlobal = globalThis.eventBus;

    const historyData = [...state.history].reverse().map((q) => {
      let label = q.text;
      if (
        globalThis._questionControllerDeps.ENABLE_INTERVIEW_TIMING_DEBUG_METRICS &&
        q.lastUpdateTime
      ) {
        const time = new Date(q.lastUpdateTime).toLocaleTimeString();
        label = `⏱️ ${time} — ${label}`;
      }

      return {
        id: q.id,
        turnId: q.turnId,
        text: label,
        isIncomplete: q.incomplete,
        isAnswered: q.answered,
        isSelected: q.id === state.selectedId,
      };
    });

    eventBusGlobal.emit('questionsHistoryUpdate', historyData);
    eventBusGlobal.emit('scrollToQuestion', {
      questionId: state.selectedId,
    });

    Logger.debug('Fim da função: "renderQuestionsHistory"');
  }

  /**
   * Renderiza a pergunta atual (CURRENT)
   */
  function renderCurrentQuestion() {
    Logger.debug('Início da função: "renderCurrentQuestion"');

    const eventBusGlobal = globalThis.eventBus;

    if (!state.interview.currentQuestion.text) {
      eventBusGlobal.emit('currentQuestionUpdate', { text: '', isSelected: false });
      return;
    }

    let label = state.interview.currentQuestion.text;

    if (
      globalThis._questionControllerDeps.ENABLE_INTERVIEW_TIMING_DEBUG_METRICS &&
      state.interview.currentQuestion.lastUpdateTime
    ) {
      const time = new Date(state.interview.currentQuestion.lastUpdateTime).toLocaleTimeString();
      label = `⏱️ ${time} — ${label}`;
    }

    const questionData = {
      text: label,
      isSelected: state.selectedId === globalThis._questionControllerDeps.CURRENT_QUESTION_ID,
      rawText: state.interview.currentQuestion.text,
      createdAt: state.interview.currentQuestion.createdAt,
      lastUpdateTime: state.interview.currentQuestion.lastUpdateTime,
    };

    eventBusGlobal.emit('currentQuestionUpdate', questionData);

    Logger.debug('Fim da função: "renderCurrentQuestion"');
  }

  /**
   * Manipula clique em pergunta
   */
  /**
   * Verifica se a pergunta já foi respondida
   */
  function checkIfAnswered(questionId) {
    if (questionId === globalThis._questionControllerDeps.CURRENT_QUESTION_ID) return false;

    const eventBusGlobal = globalThis.eventBus;

    const existingAnswer = _findAnswerByQuestionId(state, questionId);
    if (existingAnswer) {
      eventBusGlobal.emit('answerSelected', {
        questionId: questionId,
        shouldScroll: true,
      });
      updateStatusMessage('📌 Essa pergunta já foi respondida');
      return true;
    }
    return false;
  }

  /**
   * Verifica se a pergunta está incompleta
   */
  function checkIfIncomplete(questionId) {
    if (questionId === globalThis._questionControllerDeps.CURRENT_QUESTION_ID) return false;

    const updateStatusGlobal = updateStatusMessage || globalThis.updateStatusMessage;

    const q = state.history.find((q) => q.id === questionId);
    if (q?.incomplete) {
      updateStatusGlobal('⚠️ Pergunta incompleta — pressione o botão de responder');
      return true;
    }
    return false;
  }

  /**
   * Verifica se o LLM já respondeu esse turno
   */
  function checkIfLLMAlreadyAnswered(questionId) {
    const modeManagerGlobal = globalThis.modeManager;
    const MODESGlobal = globalThis.MODES;
    const updateStatusGlobal = updateStatusMessage || globalThis.updateStatusMessage;

    if (
      modeManagerGlobal.is(MODESGlobal.INTERVIEW) &&
      questionId === globalThis._questionControllerDeps.CURRENT_QUESTION_ID &&
      state.interview.llmAnsweredTurnId === state.interview.interviewTurnId
    ) {
      updateStatusGlobal('⛔ LLM já respondeu esse turno');
      return true;
    }
    return false;
  }

  /**
   * Processa a pergunta atual quando finalizando
   */
  function processCurrentQuestion(questionId) {
    if (questionId !== globalThis._questionControllerDeps.CURRENT_QUESTION_ID) return false;

    const modeManagerGlobal = globalThis.modeManager;
    const MODESGlobal = globalThis.MODES;
    const updateStatusGlobal = updateStatusMessage || globalThis.updateStatusMessage;
    const askLLMGlobal = globalThis.askLLM;

    if (!state.interview.currentQuestion.text?.trim()) {
      updateStatusGlobal('⚠️ Pergunta vazia - nada a responder');
      return false;
    }

    if (!state.interview.currentQuestion.finalized) {
      state.interview.currentQuestion.text = _finalizeQuestion(
        state.interview.currentQuestion.text
      );
      state.interview.currentQuestion.lastUpdateTime = Date.now();
      state.interview.currentQuestion.finalized = true;

      // 🔥 CRÍTICO: Usar getNextQuestionId() para garantir IDs únicos e sequenciais
      const newId = state.getNextQuestionId();

      // 🔥 UNIFICADO: Usar o mesmo contador global (newId) para turnId em TODOS os modos
      // Evita duplicação entre INTERVIEW e NORMAL modes
      const globalTurnId = Number.parseInt(newId);

      if (modeManagerGlobal.is(MODESGlobal.INTERVIEW)) {
        state.interview.interviewTurnId++;
      }
      // Não precisa usar interviewTurnId em NORMAL mode - usa globalTurnId para ambos
      state.interview.currentQuestion.turnId = globalTurnId;

      state.history.push({
        id: newId,
        text: state.interview.currentQuestion.text,
        turnId: globalTurnId, // 🔥 ID unificado baseado no contador global
        createdAt: state.interview.currentQuestion.createdAt || Date.now(),
        lastUpdateTime: state.interview.currentQuestion.lastUpdateTime || Date.now(),
      });

      state.interview.currentQuestion.promotedToHistory = true;
      _resetCurrentQuestion(state);
      state.selectedId = newId;
      renderQuestionsHistory();
      renderCurrentQuestion();

      Logger.debug('🔥 CURRENT promovido para histórico');

      // 🔥 CRÍTICO: Só responder automaticamente em modo ENTREVISTA quando clicado
      // (Em modo PADRÃO, o clique SEM silêncio não deve responder)
      // Mas quando vem do clique do usuário em handleQuestionClick(), sempre responde
      askLLMGlobal(newId);
      return true;
    }
    return false;
  }

  function handleQuestionClick(questionId) {
    Logger.debug('Início da função: "handleQuestionClick"');
    state.selectedId = questionId;
    const clearFunc = globalThis.clearAllSelections;
    const eventBusGlobal = globalThis.eventBus;

    if (typeof clearFunc === 'function') {
      clearFunc();
    } else if (eventBusGlobal) {
      eventBusGlobal.emit('clearAllSelections', {});
    }

    renderQuestionsHistory();
    renderCurrentQuestion();

    // Check conditions in order
    if (checkIfAnswered(questionId)) {
      Logger.debug('Fim da função: "handleQuestionClick" (pergunta já respondida)');
      return;
    }

    if (checkIfIncomplete(questionId)) {
      Logger.debug('Fim da função: "handleQuestionClick" (pergunta incompleta)');
      return;
    }

    if (checkIfLLMAlreadyAnswered(questionId)) {
      Logger.debug('Fim da função: "handleQuestionClick" (LLM já respondeu)');
      return;
    }

    if (processCurrentQuestion(questionId)) {
      Logger.debug('Fim da função: "handleQuestionClick" (CURRENT promovido)');
      return;
    }

    const askLLMGlobal = globalThis.askLLM;
    askLLMGlobal();
    Logger.debug('Fim da função: "handleQuestionClick"');
  }

  /**
   * Retorna o texto da pergunta selecionada
   */
  function getSelectedQuestionText() {
    Logger.debug('Início da função: "getSelectedQuestionText"');

    if (state.selectedId === globalThis._questionControllerDeps.CURRENT_QUESTION_ID) {
      return state.interview.currentQuestion.text;
    }

    if (state.selectedId) {
      const q = state.history.find((q) => q.id === state.selectedId);
      if (q?.text) return q.text;
    }

    if (
      state.interview.currentQuestion.text &&
      state.interview.currentQuestion.text.trim().length > 0
    ) {
      return state.interview.currentQuestion.text;
    }

    Logger.debug('Fim da função: "getSelectedQuestionText"');
    return '';
  }

  /**
   * Finaliza a pergunta atual para histórico
   */
  function finalizeCurrentQuestion() {
    Logger.debug(`🎯 finalizeCurrentQuestion() CHAMADA - shouldFinalizeAskCurrent recebido`, true);

    const modeManagerGlobal = globalThis.modeManager;
    const MODESGlobal = globalThis.MODES;
    const askLLMGlobal = globalThis.askLLM;

    // 🔥 DEBUG: Verificar qual modo está ativo
    const currentModeCheck = modeManagerGlobal.is(MODESGlobal.INTERVIEW);
    console.log(
      `🎯 [DEBUG finalizeCurrentQuestion] Modo: ${modeManagerGlobal.getMode()} | isINTERVIEW=${currentModeCheck}`
    );

    if (!state.interview.currentQuestion.text?.trim()) {
      console.log('⚠️ Sem texto para finalizar');
      return;
    }

    if (state.interview.currentQuestion.finalized) {
      console.log('⛔ Pergunta já finalizada');
      return;
    }

    if (modeManagerGlobal.is(MODESGlobal.INTERVIEW)) {
      state.interview.currentQuestion.text = _finalizeQuestion(
        state.interview.currentQuestion.text
      );
      state.interview.currentQuestion.lastUpdateTime = Date.now();
      state.interview.currentQuestion.finalized = true;

      // 🔥 CRÍTICO: Usar getNextQuestionId() para garantir IDs únicos e sequenciais
      const newId = state.getNextQuestionId();

      // 🔥 UNIFICADO: Usar o mesmo contador global (newId) para turnId em TODOS os modos
      const globalTurnId = Number.parseInt(newId);
      state.interview.interviewTurnId++;
      state.interview.currentQuestion.turnId = globalTurnId;

      state.history.push({
        id: newId,
        text: state.interview.currentQuestion.text,
        turnId: globalTurnId, // 🔥 ID unificado baseado no contador global
        createdAt: state.interview.currentQuestion.createdAt || Date.now(),
        lastUpdateTime: state.interview.currentQuestion.lastUpdateTime || Date.now(),
      });

      state.interview.currentQuestion.promotedToHistory = true;
      _resetCurrentQuestion(state);

      state.selectedId = newId;
      renderQuestionsHistory();
      renderCurrentQuestion();

      if (
        state.interview.llmRequestedTurnId !== state.interview.interviewTurnId &&
        state.interview.llmAnsweredTurnId !== state.interview.interviewTurnId
      ) {
        askLLMGlobal(newId);
      }

      return;
    }

    if (!modeManagerGlobal.is(MODESGlobal.INTERVIEW)) {
      // 🔥 CRÍTICO: Usar getNextQuestionId() para garantir IDs únicos e sequenciais
      const newId = state.getNextQuestionId();
      const globalTurnId = Number.parseInt(newId); // 🔥 Usar o mesmo contador global

      state.history.push({
        id: newId,
        text: state.interview.currentQuestion.text,
        turnId: globalTurnId, // 🔥 ID unificado baseado no contador global
        createdAt: state.interview.currentQuestion.createdAt || Date.now(),
        lastUpdateTime:
          state.interview.currentQuestion.lastUpdateTime ||
          state.interview.currentQuestion.createdAt ||
          Date.now(),
      });

      state.selectedId = newId;
      _resetCurrentQuestion(state);
      renderQuestionsHistory();
      renderCurrentQuestion();
    }
  }

  /**
   * Força o fechamento da pergunta atual
   */
  function closeCurrentQuestionForced() {
    Logger.debug('🚪 Fechando pergunta:', state.interview.currentQuestion.text, true);

    if (!state.interview.currentQuestion.text) return;

    state.history.push({
      id: crypto.randomUUID(),
      text: _finalizeQuestion(state.interview.currentQuestion.text),
      createdAt: state.interview.currentQuestion.createdAt || Date.now(),
    });

    state.interview.currentQuestion.text = '';
    state.selectedId = null;
    renderQuestionsHistory();
    renderCurrentQuestion();
  }

  /**
   * Obtém IDs navegáveis de perguntas
   */
  function getNavigableQuestionIds() {
    const state = globalThis.appState;
    const ids = [];
    if (state.interview.currentQuestion.text)
      ids.push(globalThis._questionControllerDeps.CURRENT_QUESTION_ID);
    [...state.history].reverse().forEach((q) => ids.push(q.id));
    return ids;
  }

  /**
   * Consolida texto de fala (interim vs final)
   */
  function consolidateQuestionText(cleaned, isInterim) {
    const q = state.interview.currentQuestion;

    if (isInterim) {
      q.interimText = cleaned;
    } else {
      q.interimText = '';
      q.finalText = (q.finalText ? q.finalText + ' ' : '') + cleaned;
    }

    q.text = q.finalText.trim() + (q.interimText ? ' ' + q.interimText : '');
  }

  /**
   * Manipula entrada de pergunta do OTHER
   */
  function handleCurrentQuestion(author, text, options = {}) {
    Logger.debug(
      `📝 handleCurrentQuestion chamado: author=${author}, text="${text}", isInterim=${options.isInterim}`,
      false
    );

    const clearFunc = globalThis.clearAllSelections;
    const eventBusGlobal = globalThis.eventBus;
    const cleaned = text.replaceAll(/Ê+|hum|ahn/gi, '').trim();
    const now = Date.now();
    const OTHER = 'Outros';

    if (author === OTHER) {
      if (!state.interview.currentQuestion.text) {
        state.interview.currentQuestion.createdAt = now;
      }

      state.interview.currentQuestion.lastUpdateTime = now;
      state.interview.currentQuestion.lastUpdate = now;

      consolidateQuestionText(cleaned, options.isInterim);

      if (!state.selectedId) {
        state.selectedId = globalThis._questionControllerDeps.CURRENT_QUESTION_ID;
        if (typeof clearFunc === 'function') {
          clearFunc();
        } else if (eventBusGlobal) {
          eventBusGlobal.emit('clearAllSelections', {});
        }
      }

      renderCurrentQuestion();

      // 🔥 FIX: Finalizar se:
      // 1. shouldFinalizeAskCurrent=TRUE (caso normal), OU
      // 2. É mensagem final (!isInterim) E há texto em CURRENT (Vosk pode ter enviado 2ª transcrição final)
      const isFinalMessage = !options.isInterim;
      const hasText = state.interview.currentQuestion.text?.trim();
      const shouldFinalize =
        (options.shouldFinalizeAskCurrent || (isFinalMessage && hasText)) && isFinalMessage;

      if (shouldFinalize) {
        console.log(
          `🎯 [DEBUG handleCurrentQuestion] Finalizando - shouldFinalizeAskCurrent=${options.shouldFinalizeAskCurrent}, isFinal=${isFinalMessage}, hasText=${!!hasText}`
        );
        finalizeCurrentQuestion();
      }
    }
  }

  /**
   * Rola para pergunta selecionada
   */
  function scrollToSelectedQuestion() {
    const state = globalThis.appState;
    const eventBusGlobal = globalThis.eventBus;

    eventBusGlobal.emit('scrollToQuestion', {
      questionId: state.selectedId,
    });
  }

  /**
   * Exportar funções
   */
  module.exports = {
    initQuestionController,
    renderQuestionsHistory,
    renderCurrentQuestion,
    handleQuestionClick,
    getSelectedQuestionText,
    finalizeCurrentQuestion,
    closeCurrentQuestionForced,
    getNavigableQuestionIds,
    consolidateQuestionText,
    handleCurrentQuestion,
    scrollToSelectedQuestion,
  };

  // ✅ Exportar para globalThis dentro do bloco de inicialização
  if (typeof globalThis !== 'undefined') {
    globalThis.renderQuestionsHistory = renderQuestionsHistory;
    globalThis.renderCurrentQuestion = renderCurrentQuestion;
    globalThis.handleQuestionClick = handleQuestionClick;
    globalThis.handleCurrentQuestion = handleCurrentQuestion;
    globalThis.closeCurrentQuestionForced = closeCurrentQuestionForced;
    globalThis.getNavigableQuestionIds = getNavigableQuestionIds;
  }
} // Fim da proteção contra redeclaração
