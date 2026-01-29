/**
 * Mode Strategies - Implementação do comportamento específico de cada modo
 *
 * Cada estratégia define como o modo deve agir quando eventos acontecem
 * Padrão: Strategy Pattern - cada modo é autossuficiente
 */

// ============================================
// STANDARD MODE STRATEGY
// ============================================
const StandardModeStrategy = {
  name: 'STANDARD',

  /**
   * Deve finalizar quando silêncio é detectado?
   * Standard: SIM, finaliza por silêncio (mas não responde)
   */
  shouldFinalizeOnSilence(data) {
    return true; // ✅ Standard finaliza por silêncio
  },

  /**
   * Quando pergunta é finalizada (por ação do usuário)
   * Standard: Promove automaticamente mas NÃO responde
   */
  onQuestionFinalized(context, data) {
    const { eventBus, state } = context;
    const { questionId } = data;

    globalThis.Logger?.debug('📝 STANDARD MODE: Pergunta finalizada', false);

    // Emitir que histórico foi atualizado (HomeUIManager renderiza)
    eventBus.emit('questionsHistoryUpdate', this._buildHistoryData(state));
    eventBus.emit('currentQuestionUpdate', this._buildCurrentQuestionData(state));

    globalThis.Logger?.debug('📝 STANDARD MODE: Aguardando ação do usuário (clique/atalho)', false);
    // ❌ NÃO emite answerStream, answerBatchEnd ou qualquer resposta
  },

  /**
   * Quando resposta do LLM termina (só se usuário clicou para responder)
   */
  onAnswerStreamEnd(context, data) {
    globalThis.Logger?.debug('✅ STANDARD MODE: Resposta finalizada', false);
    // Standard não faz nada especial aqui
  },

  /**
   * Quando usuário clica em uma pergunta
   */
  onQuestionClick(context, data) {
    globalThis.Logger?.debug('🖱️ STANDARD MODE: Pergunta clicada', false);
    // Standard permite clicar sempre
    return true;
  },

  /**
   * Pode re-perguntar uma questão já respondida?
   */
  canReAsk(context, questionId) {
    return true; // Standard sempre permite
  },

  /**
   * Helper para construir dados de histórico
   */
  _buildHistoryData(state) {
    return state.history.map((q) => ({
      id: q.id,
      text: q.text,
      turnId: q.turnId,
      createdAt: q.createdAt,
      lastUpdateTime: q.lastUpdateTime,
      isAnswered: state.interview.answeredQuestions.has(q.id),
      isSelected: state.selectedId === q.id,
      isIncomplete: !q.text || !q.text.trim(),
    }));
  },

  /**
   * Helper para construir dados de pergunta atual
   */
  _buildCurrentQuestionData(state) {
    return {
      text: state.interview.currentQuestion.text || '',
      isSelected: state.selectedId === 'CURRENT',
    };
  },
};

// ============================================
// INTERVIEW MODE STRATEGY
// ============================================
const InterviewModeStrategy = {
  name: 'INTERVIEW',

  /**
   * Deve finalizar quando silêncio é detectado?
   * Entrevista: SIM, finaliza automaticamente por silêncio
   */
  shouldFinalizeOnSilence(data) {
    return true; // ✅ Interview auto-finaliza por silêncio
  },

  /**
   * Quando pergunta é finalizada por silêncio ou ação do usuário
   * Entrevista: Promove E responde automaticamente
   */
  onQuestionFinalized(context, data) {
    const { eventBus, askLLM } = context;
    const { questionId, state } = data;

    globalThis.Logger?.debug('🎬 INTERVIEW MODE: Pergunta finalizada', false);

    // Emitir que histórico foi atualizado
    eventBus.emit('questionsHistoryUpdate', this._buildHistoryData(state));
    eventBus.emit('currentQuestionUpdate', this._buildCurrentQuestionData(state));

    // 🔥 ENTREVISTA: Responder automaticamente
    globalThis.Logger?.debug('🎬 INTERVIEW MODE: Respondendo automaticamente...', false);
    eventBus.emit('modeStartedResponding', { questionId });

    if (typeof askLLM === 'function') {
      askLLM(questionId);
    }
  },

  /**
   * Quando resposta do LLM termina
   */
  onAnswerStreamEnd(context, data) {
    const { state } = context;
    globalThis.Logger?.debug('✅ INTERVIEW MODE: Resposta finalizada, incrementando turnId', false);

    // Atualizar turnId respondido
    if (state && state.interview) {
      state.interview.llmAnsweredTurnId = state.interview.interviewTurnId;
    }
  },

  /**
   * Quando usuário clica em uma pergunta
   */
  onQuestionClick(context, data) {
    globalThis.Logger?.debug('🖱️ INTERVIEW MODE: Pergunta clicada', false);
    // Entrevista permite clicar
    return true;
  },

  /**
   * Pode re-perguntar uma questão já respondida?
   */
  canReAsk(context, questionId) {
    return false; // Entrevista NÃO permite re-perguntar
  },

  /**
   * Helper para construir dados de histórico
   */
  _buildHistoryData(state) {
    return state.history.map((q) => ({
      id: q.id,
      text: q.text,
      turnId: q.turnId,
      createdAt: q.createdAt,
      lastUpdateTime: q.lastUpdateTime,
      isAnswered: state.interview.answeredQuestions.has(q.id),
      isSelected: state.selectedId === q.id,
      isIncomplete: !q.text || !q.text.trim(),
    }));
  },

  /**
   * Helper para construir dados de pergunta atual
   */
  _buildCurrentQuestionData(state) {
    return {
      text: state.interview.currentQuestion.text || '',
      isSelected: state.selectedId === 'CURRENT',
    };
  },
};

// ============================================
// EXPORTAR
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    StandardModeStrategy,
    InterviewModeStrategy,
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.StandardModeStrategy = StandardModeStrategy;
  globalThis.InterviewModeStrategy = InterviewModeStrategy;
}
