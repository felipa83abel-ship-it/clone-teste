/* ================================ */
// QUESTION CONTROLLER
// Gerencia renderização, navegação e manipulação de perguntas
/* ================================ */

const Logger = require('../../utils/Logger.js');
const {
  _normalizeForCompare,
  finalizeQuestion,
  resetCurrentQuestion,
  findAnswerByQuestionId,
} = require('./question-helpers.js');

// Variáveis injetadas como dependências
let appState;
let eventBus;
let modeManager;
let MODES;
let CURRENT_QUESTION_ID;
let ENABLE_INTERVIEW_TIMING_DEBUG_METRICS;

// Funções externas
let updateStatusMessage;
let askLLM;
let clearAllSelections;

/**
 * Inicializar question-controller com dependências
 */
function initQuestionController(deps) {
  appState = deps.appState;
  eventBus = deps.eventBus;
  modeManager = deps.modeManager;
  MODES = deps.MODES;
  CURRENT_QUESTION_ID = deps.CURRENT_QUESTION_ID;
  ENABLE_INTERVIEW_TIMING_DEBUG_METRICS = deps.ENABLE_INTERVIEW_TIMING_DEBUG_METRICS;
  updateStatusMessage = deps.updateStatusMessage;
  askLLM = deps.askLLM;
  clearAllSelections = deps.clearAllSelections;
}

/**
 * Renderiza o histórico de perguntas
 */
function renderQuestionsHistory() {
  Logger.debug('Início da função: "renderQuestionsHistory"');

  const historyData = [...appState.history].reverse().map((q) => {
    let label = q.text;
    if (ENABLE_INTERVIEW_TIMING_DEBUG_METRICS && q.lastUpdateTime) {
      const time = new Date(q.lastUpdateTime).toLocaleTimeString();
      label = `⏱️ ${time} — ${label}`;
    }

    return {
      id: q.id,
      turnId: q.turnId,
      text: label,
      isIncomplete: q.incomplete,
      isAnswered: q.answered,
      isSelected: q.id === appState.selectedId,
    };
  });

  eventBus.emit('questionsHistoryUpdate', historyData);
  eventBus.emit('scrollToQuestion', {
    questionId: appState.selectedId,
  });

  Logger.debug('Fim da função: "renderQuestionsHistory"');
}

/**
 * Renderiza a pergunta atual (CURRENT)
 */
function renderCurrentQuestion() {
  Logger.debug('Início da função: "renderCurrentQuestion"');

  if (!appState.interview.currentQuestion.text) {
    eventBus.emit('currentQuestionUpdate', { text: '', isSelected: false });
    return;
  }

  let label = appState.interview.currentQuestion.text;

  if (ENABLE_INTERVIEW_TIMING_DEBUG_METRICS && appState.interview.currentQuestion.lastUpdateTime) {
    const time = new Date(appState.interview.currentQuestion.lastUpdateTime).toLocaleTimeString();
    label = `⏱️ ${time} — ${label}`;
  }

  const questionData = {
    text: label,
    isSelected: appState.selectedId === CURRENT_QUESTION_ID,
    rawText: appState.interview.currentQuestion.text,
    createdAt: appState.interview.currentQuestion.createdAt,
    lastUpdateTime: appState.interview.currentQuestion.lastUpdateTime,
  };

  eventBus.emit('currentQuestionUpdate', questionData);

  Logger.debug('Fim da função: "renderCurrentQuestion"');
}

/**
 * Manipula clique em pergunta
 */
function handleQuestionClick(questionId) {
  Logger.debug('Início da função: "handleQuestionClick"');
  appState.selectedId = questionId;
  clearAllSelections();
  renderQuestionsHistory();
  renderCurrentQuestion();

  if (questionId !== CURRENT_QUESTION_ID) {
    const existingAnswer = findAnswerByQuestionId(appState, questionId);

    if (existingAnswer) {
      eventBus.emit('answerSelected', {
        questionId: questionId,
        shouldScroll: true,
      });

      updateStatusMessage('📌 Essa pergunta já foi respondida');
      Logger.debug('Fim da função: "handleQuestionClick" (pergunta já respondida)');
      return;
    }
  }

  if (questionId !== CURRENT_QUESTION_ID) {
    const q = appState.history.find((q) => q.id === questionId);
    if (q?.incomplete) {
      updateStatusMessage('⚠️ Pergunta incompleta — pressione o botão de responder');
      Logger.debug('Fim da função: "handleQuestionClick" (pergunta incompleta)');
      return;
    }
  }

  if (
    modeManager.is(MODES.INTERVIEW) &&
    appState.selectedId === CURRENT_QUESTION_ID &&
    appState.interview.llmAnsweredTurnId === appState.interview.interviewTurnId
  ) {
    updateStatusMessage('⛔ LLM já respondeu esse turno');
    Logger.debug('Fim da função: "handleQuestionClick" (LLM já respondeu)');
    return;
  }

  if (questionId === CURRENT_QUESTION_ID) {
    if (!appState.interview.currentQuestion.text?.trim()) {
      updateStatusMessage('⚠️ Pergunta vazia - nada a responder');
      Logger.debug('Fim da função: "handleQuestionClick" (pergunta vazia)');
      return;
    }

    if (!appState.interview.currentQuestion.finalized) {
      appState.interview.currentQuestion.text = finalizeQuestion(
        appState.interview.currentQuestion.text
      );
      appState.interview.currentQuestion.lastUpdateTime = Date.now();
      appState.interview.currentQuestion.finalized = true;

      const newId = String(appState.history.length + 1);

      if (modeManager.is(MODES.INTERVIEW)) {
        appState.interview.interviewTurnId++;
        appState.interview.currentQuestion.turnId = appState.interview.interviewTurnId;
      } else {
        appState.interview.currentQuestion.turnId = Number.parseInt(newId);
      }

      appState.history.push({
        id: newId,
        text: appState.interview.currentQuestion.text,
        turnId: appState.interview.currentQuestion.turnId,
        createdAt: appState.interview.currentQuestion.createdAt || Date.now(),
        lastUpdateTime: appState.interview.currentQuestion.lastUpdateTime || Date.now(),
      });

      appState.interview.currentQuestion.promotedToHistory = true;
      resetCurrentQuestion(appState);
      appState.selectedId = newId;
      renderQuestionsHistory();
      renderCurrentQuestion();

      Logger.debug('🔥 CURRENT promovido para histórico');

      askLLM(newId);
      Logger.debug('Fim da função: "handleQuestionClick" (CURRENT promovido)');
      return;
    }
  }

  askLLM();
  Logger.debug('Fim da função: "handleQuestionClick"');
}

/**
 * Retorna o texto da pergunta selecionada
 */
function getSelectedQuestionText() {
  Logger.debug('Início da função: "getSelectedQuestionText"');

  if (appState.selectedId === CURRENT_QUESTION_ID) {
    return appState.interview.currentQuestion.text;
  }

  if (appState.selectedId) {
    const q = appState.history.find((q) => q.id === appState.selectedId);
    if (q?.text) return q.text;
  }

  if (
    appState.interview.currentQuestion.text &&
    appState.interview.currentQuestion.text.trim().length > 0
  ) {
    return appState.interview.currentQuestion.text;
  }

  Logger.debug('Fim da função: "getSelectedQuestionText"');
  return '';
}

/**
 * Finaliza a pergunta atual para histórico
 */
function finalizeCurrentQuestion() {
  Logger.debug('Início da função: "finalizeCurrentQuestion"');

  if (!appState.interview.currentQuestion.text?.trim()) {
    console.log('⚠️ Sem texto para finalizar');
    return;
  }

  if (appState.interview.currentQuestion.finalized) {
    console.log('⛔ Pergunta já finalizada');
    return;
  }

  if (modeManager.is(MODES.INTERVIEW)) {
    appState.interview.currentQuestion.text = finalizeQuestion(
      appState.interview.currentQuestion.text
    );
    appState.interview.currentQuestion.lastUpdateTime = Date.now();
    appState.interview.currentQuestion.finalized = true;

    const newId = String(appState.history.length + 1);

    appState.interview.interviewTurnId++;
    appState.interview.currentQuestion.turnId = appState.interview.interviewTurnId;

    appState.history.push({
      id: newId,
      text: appState.interview.currentQuestion.text,
      turnId: appState.interview.currentQuestion.turnId,
      createdAt: appState.interview.currentQuestion.createdAt || Date.now(),
      lastUpdateTime: appState.interview.currentQuestion.lastUpdateTime || Date.now(),
    });

    appState.interview.currentQuestion.promotedToHistory = true;
    resetCurrentQuestion(appState);

    appState.selectedId = newId;
    renderQuestionsHistory();
    renderCurrentQuestion();

    if (
      appState.interview.llmRequestedTurnId !== appState.interview.interviewTurnId &&
      appState.interview.llmAnsweredTurnId !== appState.interview.interviewTurnId
    ) {
      askLLM(newId);
    }

    Logger.debug('Fim da função: "finalizeCurrentQuestion"');
    return;
  }

  if (!modeManager.is(MODES.INTERVIEW)) {
    const newId = String(appState.history.length + 1);
    appState.history.push({
      id: newId,
      text: appState.interview.currentQuestion.text,
      turnId: Number.parseInt(newId),
      createdAt: appState.interview.currentQuestion.createdAt || Date.now(),
      lastUpdateTime:
        appState.interview.currentQuestion.lastUpdateTime ||
        appState.interview.currentQuestion.createdAt ||
        Date.now(),
    });

    appState.selectedId = newId;
    resetCurrentQuestion(appState);
    renderQuestionsHistory();
    renderCurrentQuestion();

    Logger.debug('Fim da função: "finalizeCurrentQuestion"');
  }
}

/**
 * Força o fechamento da pergunta atual
 */
function closeCurrentQuestionForced() {
  Logger.debug('Início da função: "closeCurrentQuestionForced"');

  console.log('🚪 Fechando pergunta:', appState.interview.currentQuestion.text);

  if (!appState.interview.currentQuestion.text) return;

  appState.history.push({
    id: crypto.randomUUID(),
    text: finalizeQuestion(appState.interview.currentQuestion.text),
    createdAt: appState.interview.currentQuestion.createdAt || Date.now(),
  });

  appState.interview.currentQuestion.text = '';
  appState.selectedId = null;
  renderQuestionsHistory();
  renderCurrentQuestion();

  Logger.debug('Fim da função: "closeCurrentQuestionForced"');
}

/**
 * Obtém IDs navegáveis de perguntas
 */
function getNavigableQuestionIds() {
  const ids = [];
  if (appState.currentQuestion.text) ids.push(CURRENT_QUESTION_ID);
  [...appState.history].reverse().forEach((q) => ids.push(q.id));
  return ids;
}

/**
 * Consolida texto de fala (interim vs final)
 */
function consolidateQuestionText(cleaned, isInterim) {
  const q = appState.interview.currentQuestion;

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
  Logger.debug('Início da função: "handleCurrentQuestion"');

  const cleaned = text.replaceAll(/Ê+|hum|ahn/gi, '').trim();
  const now = Date.now();
  const OTHER = 'OTHER';

  if (author === OTHER) {
    if (!appState.interview.currentQuestion.text) {
      appState.interview.currentQuestion.createdAt = now;
    }

    appState.interview.currentQuestion.lastUpdateTime = now;
    appState.interview.currentQuestion.lastUpdate = now;

    consolidateQuestionText(cleaned, options.isInterim);

    if (!appState.selectedId) {
      appState.selectedId = CURRENT_QUESTION_ID;
      clearAllSelections();
    }

    renderCurrentQuestion();

    if (options.shouldFinalizeAskCurrent && !options.isInterim) {
      finalizeCurrentQuestion();
    }
  }

  Logger.debug('Fim da função: "handleCurrentQuestion"');
}

/**
 * Rola para pergunta selecionada
 */
function scrollToSelectedQuestion() {
  eventBus.emit('scrollToQuestion', {
    questionId: appState.selectedId,
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
