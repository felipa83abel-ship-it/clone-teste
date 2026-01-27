/* ================================ */
// QUESTION HELPERS
// Funções utilitárias para manipulação de perguntas
/* ================================ */
// Logger carregado globalmente via index.html

/**
 * Normaliza texto para comparação
 * Remove pontuação, converte para lowercase, remove espaços extras
 */
function normalizeForCompare(t) {
  globalThis.Logger.debug('Início da função: "normalizeForCompare"');
  globalThis.Logger.debug('Fim da função: "normalizeForCompare"');
  return (t || '')
    .toLowerCase()
    .replaceAll(/[?!.\n\r]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Finaliza uma pergunta (aplica formatação)
 */
function finalizeQuestion(text) {
  return text.trim();
}

/**
 * Reseta a pergunta atual
 */
function resetCurrentQuestion(appState) {
  globalThis.Logger.debug('Início da função: "resetCurrentQuestion"');

  appState.interview.currentQuestion = {
    text: '',
    interimText: '',
    finalText: '',
    createdAt: null,
    lastUpdateTime: null,
    finalized: false,
    promotedToHistory: false,
  };

  globalThis.Logger.debug('Fim da função: "resetCurrentQuestion"');
}

/**
 * Verifica se uma pergunta já foi respondida pelo ID
 */
function findAnswerByQuestionId(appState, questionId) {
  globalThis.Logger.debug('Início da função: "findAnswerByQuestionId"');

  if (!questionId) {
    globalThis.Logger.debug('Fim da função: "findAnswerByQuestionId"');
    return false;
  }

  globalThis.Logger.debug('Fim da função: "findAnswerByQuestionId"');
  return appState.interview.answeredQuestions.has(questionId);
}

/**
 * Exportar helpers
 */
// Expor em globalThis para uso em browser
if (typeof globalThis !== 'undefined') {
  globalThis.normalizeForCompare = normalizeForCompare;
  globalThis.finalizeQuestion = finalizeQuestion;
  globalThis.resetCurrentQuestion = resetCurrentQuestion;
  globalThis.findAnswerByQuestionId = findAnswerByQuestionId;
}

// Expor para CommonJS (Node.js)
module.exports = {
  normalizeForCompare,
  finalizeQuestion,
  resetCurrentQuestion,
  findAnswerByQuestionId,
};
