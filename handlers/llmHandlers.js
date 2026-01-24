/**
 * llmHandlers - Handlers separados para LLM (genérico)
 *
 * 1. validateLLMRequest() - validação
 * 2. handleLLMStream() - modo entrevista
 * 3. handleLLMBatch() - modo normal
 */

const Logger = require('../utils/Logger.js');

/**
 * Valida requisição de LLM
 * @param {any} appState - Estado da app (AppState instance)
 * @param {string} questionId - ID da pergunta selecionada
 * @param {function} getSelectedQuestionText - Getter do texto
 * @throws {Error} Se validação falhar
 * @returns {Object} {questionId, text, isCurrent}
 */
function validateLLMRequest(appState, questionId, getSelectedQuestionText) {
  const CURRENT_QUESTION_ID = 'CURRENT';
  const text = getSelectedQuestionText();
  const isCurrent = questionId === CURRENT_QUESTION_ID;

  // Validação 1: Text não vazio
  if (!text?.trim()) {
    throw new Error('Pergunta vazia - nada a enviar para LLM');
  }

  // Validação 2: Dedupe para CURRENT
  if (isCurrent) {
    const normalizedText = text
      .toLowerCase()
      .replaceAll('?', '')
      .replaceAll('!', '')
      .replaceAll('.', '')
      .replaceAll('\n', '')
      .trim();
    if (normalizedText === appState.interview.lastAskedQuestionNormalized) {
      throw new Error('Pergunta já enviada');
    }
  }

  // Validação 3: Modo entrevista bloqueia duplicação no histórico
  if (!isCurrent && appState.interview.answeredQuestions.has(questionId)) {
    throw new Error('Essa pergunta já foi respondida');
  }

  return { questionId, text, isCurrent };
}

/**
 * Manipula resposta em modo streaming (entrevista)
 */
async function handleLLMStream(
  appState,
  questionId,
  text,
  SYSTEM_PROMPT,
  eventBus,
  llmManager,
  turnId = null
) {
  Logger.info('Iniciando stream LLM', { questionId, textLength: text.length, turnId });

  let streamedText = '';
  appState.metrics.llmStartTime = Date.now();
  appState.interview.llmRequestedTurnId = appState.interview.interviewTurnId;
  appState.interview.llmRequestedQuestionId = questionId;

  // Obter handler LLM e invocar stream
  const currentLLM =
    appState.selectedProvider || globalThis.configManager?.config?.api?.activeProvider || 'openai';
  const handler = llmManager.getHandler(currentLLM);

  try {
    // Chamar stream do handler
    const streamGenerator = await handler.stream([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ]);

    // Iterar tokens
    for await (const token of streamGenerator) {
      streamedText += token;
      appState.metrics.llmFirstTokenTime = appState.metrics.llmFirstTokenTime || Date.now();

      eventBus.emit('answerStreamChunk', {
        questionId,
        turnId, // 🔥 Incluir turnId para UI
        token,
        accum: streamedText,
      });
    }

    appState.metrics.llmEndTime = Date.now();
    appState.interview.llmAnsweredTurnId = appState.interview.interviewTurnId;

    Logger.info('Stream LLM finalizado', {
      duration: appState.metrics.llmEndTime - appState.metrics.llmStartTime,
    });

    eventBus.emit('llmStreamEnd', {
      questionId,
      streamedText,
    });
  } catch (error) {
    Logger.error('Erro em handleLLMStream', { error: error.message });
    eventBus.emit('error', error.message);
    throw error;
  }
}

/**
 * Manipula resposta em modo batch (normal)
 */
async function handleLLMBatch(appState, questionId, text, SYSTEM_PROMPT, eventBus, llmManager) {
  Logger.info('Iniciando batch LLM', { questionId, textLength: text.length });

  appState.metrics.llmStartTime = Date.now();

  // Obter handler LLM e invocar complete
  const currentLLM =
    appState.selectedProvider || globalThis.configManager?.config?.api?.activeProvider || 'openai';
  const handler = llmManager.getHandler(currentLLM);

  try {
    const response = await handler.complete([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ]);

    appState.metrics.llmEndTime = Date.now();

    Logger.info('Batch LLM finalizado', {
      duration: appState.metrics.llmEndTime - appState.metrics.llmStartTime,
    });

    eventBus.emit('llmBatchEnd', {
      questionId,
      response,
    });
  } catch (error) {
    Logger.error('Erro em handleLLMBatch', { error: error.message });
    eventBus.emit('error', error.message);
    throw error;
  }
}

module.exports = {
  validateLLMRequest,
  handleLLMStream,
  handleLLMBatch,
};
