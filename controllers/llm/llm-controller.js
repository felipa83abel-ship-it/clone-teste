// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * LLM Controller - Lógica de requisição ao LLM
 *
 * Responsabilidades:
 * - askLLM() - função central de requisição ao LLM
 * - Validação de requisições
 * - Roteamento por modo (INTERVIEW vs STANDARD)
 */

const CURRENT_QUESTION_ID = 'CURRENT';

/**
 * Envia pergunta selecionada ao LLM (qualquer provider)
 * ✅ Centralizado: Uma única função para todos os LLMs
 * ✅ Roteado por modo: Não por LLM específico
 *
 * @param {string} questionId - ID da pergunta a responder (padrão: globalThis.appState.selectedId)
 */
async function askLLM(questionId = null) {
  try {
    const targetQuestionId = questionId || globalThis.appState.selectedId;

    // 1. Validar requisição
    const {
      questionId: validatedId,
      text,
      isCurrent,
    } = globalThis.validateLLMRequest?.(
      globalThis.appState,
      targetQuestionId,
      globalThis.getSelectedQuestionText
    ) || {};

    Logger.debug('Pergunta validada', { questionId: validatedId, textLength: text?.length }, false);

    // 2. Rastreamento
    const normalizedText = globalThis.normalizeForCompare?.(text) || text;
    globalThis.appState.metrics.llmStartTime = Date.now();

    if (isCurrent) {
      globalThis.appState.interview.llmRequestedTurnId =
        globalThis.appState.interview.interviewTurnId;
      globalThis.appState.interview.llmRequestedQuestionId = CURRENT_QUESTION_ID;
      globalThis.appState.interview.lastAskedQuestionNormalized = normalizedText;
    }

    // 3. Rotear por modo (não por LLM)
    const isInterviewMode = globalThis.modeManager.is(globalThis.MODES.INTERVIEW);

    // Obter turnId da pergunta
    const questionEntry = globalThis.appState.history.find((q) => q.id === targetQuestionId);
    const turnId = questionEntry?.turnId || null;

    // 4. Executar handler apropriado
    if (isInterviewMode) {
      await globalThis.handleLLMStream?.(
        globalThis.appState,
        validatedId,
        text,
        globalThis.SYSTEM_PROMPT,
        globalThis.eventBus,
        globalThis.llmManager,
        turnId
      );
    } else {
      await globalThis.handleLLMBatch?.(
        globalThis.appState,
        validatedId,
        text,
        globalThis.SYSTEM_PROMPT,
        globalThis.eventBus,
        globalThis.llmManager
      );
    }
  } catch (error) {
    Logger.error('Erro em askLLM', { error: error.message });
    globalThis.eventBus.emit('error', error.message);
    globalThis.updateStatusMessage?.(`❌ ${error.message}`);
  }
}

// Exportar função
if (typeof globalThis !== 'undefined') {
  globalThis.askLLM = askLLM;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = askLLM;
}
