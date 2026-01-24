/**
 * ModeManager - Centraliza lógica de modo (Interview/Normal)
 * Elimina ~15+ chamadas espalhadas a ModeController.isInterviewMode()
 *
 * Padrão: Strategy Pattern + Delegation
 * Cada modo registra seus handlers específicos
 */

const MODES = {
  NORMAL: 'NORMAL',
  INTERVIEW: 'INTERVIEW',
};

class ModeManager {
  constructor(initialMode = MODES.INTERVIEW) {
    this.currentMode = initialMode;
    this.handlers = {}; // Registry: modeName -> { handlers }
  }

  /**
   * Registra handlers para um modo específico
   * @param {string} modeName - Nome do modo (INTERVIEW, NORMAL)
   * @param {object} handlers - Objeto com métodos específicos do modo
   */
  registerMode(modeName, handlers) {
    if (!modeName || typeof modeName !== 'string') {
      throw new Error('Modo deve ser uma string');
    }
    this.handlers[modeName] = handlers || {};
    console.log(
      `📌 Modo "${modeName}" registrado com ${Object.keys(handlers || {}).length} handlers`
    );
  }

  /**
   * Muda o modo atual
   * @param {string} modeName - Novo modo
   */
  setMode(modeName) {
    if (!this.handlers[modeName]) {
      throw new Error(
        `Modo não registrado: ${modeName}. Modos disponíveis: ${Object.keys(this.handlers).join(', ')}`
      );
    }
    const old = this.currentMode;
    this.currentMode = modeName;
    console.log(`🔄 Modo alterado: ${old} → ${modeName}`);
  }

  /**
   * Retorna o modo atual
   * @returns {string}
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Verifica se está em modo específico
   * @param {string} modeName - Nome do modo
   * @returns {boolean}
   */
  is(modeName) {
    return this.currentMode === modeName;
  }

  /**
   * Delega para handler do modo atual
   * Se método não existir no modo, retorna undefined
   * @param {string} methodName - Nome do método
   * @param {...any} args - Argumentos a passar
   * @returns {any} Resultado da execução
   */
  delegate(methodName, ...args) {
    const handler = this.handlers[this.currentMode];
    if (!handler) {
      throw new Error(`Modo "${this.currentMode}" não tem handlers registrados`);
    }

    if (typeof handler[methodName] !== 'function') {
      console.warn(
        `⚠️ Método "${methodName}" não existe em modo "${this.currentMode}". Retornando undefined.`
      );
      return undefined;
    }

    return handler[methodName](...args);
  }

  /**
   * Callbacks específicos de modo para diferentes eventos
   * Esses são os principais pontos de delegação
   */

  // 1️⃣ Quando pergunta é finalizada (pronta para enviar ao LLM)
  onQuestionFinalize(question) {
    return this.delegate('onQuestionFinalize', question);
  }

  // 2️⃣ Quando resposta do LLM termina (stream ou batch)
  onAnswerStreamEnd(data) {
    return this.delegate('onAnswerStreamEnd', data);
  }

  // 3️⃣ Quando usuário clica em uma pergunta
  onQuestionClick(questionId) {
    return this.delegate('onQuestionClick', questionId);
  }

  // 4️⃣ Verifica se pode re-perguntar uma questão
  canReAsk(questionId) {
    return this.delegate('canReAsk', questionId);
  }

  // 5️⃣ Renderizar estado específico do modo
  renderModeState() {
    return this.delegate('renderModeState');
  }

  // 6️⃣ Validar pergunta antes de enviar ao LLM
  validateQuestion(question) {
    return this.delegate('validateQuestion', question);
  }
}

// ============================================
// MODO INTERVIEW: Modo de entrevista
// ============================================
const InterviewModeHandlers = {
  onQuestionFinalize(question) {
    // No modo entrevista: sempre promove para histórico e incrementa turnId
    return true;
  },

  onAnswerStreamEnd(data) {
    // No modo entrevista: marca turnId que foi respondido
    return true;
  },

  onQuestionClick(questionId) {
    // No modo entrevista: bloqueia re-perguntas se já foi respondida
    return true;
  },

  canReAsk(questionId) {
    // Modo entrevista: nunca permite re-perguntar
    return false;
  },

  renderModeState() {
    // Renderizar estado de entrevista (turno, etc)
    return 'interview';
  },

  validateQuestion(question) {
    // Modo entrevista: aceita qualquer pergunta com texto
    return question && question.trim().length > 0;
  },
};

// ============================================
// MODO NORMAL: Modo normal (sem modo entrevista)
// ============================================
const NormalModeHandlers = {
  onQuestionFinalize(question) {
    // No modo normal: apenas consolida, não incrementa turnId
    return true;
  },

  onAnswerStreamEnd(data) {
    // No modo normal: sem rastreamento de turno
    return true;
  },

  onQuestionClick(questionId) {
    // No modo normal: sempre permite perguntar
    return true;
  },

  canReAsk(questionId) {
    // Modo normal: sempre permite re-perguntar
    return true;
  },

  renderModeState() {
    // Renderizar estado normal
    return 'normal';
  },

  validateQuestion(question) {
    // Modo normal: aceita qualquer pergunta com texto
    return question && question.trim().length > 0;
  },
};

// ============================================
// EXPORTAR
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ModeManager,
    MODES,
    InterviewModeHandlers,
    NormalModeHandlers,
  };
}
