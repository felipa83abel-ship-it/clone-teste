/**
 * ModeController - Orquestrador Central de Modos
 *
 * Responsabilidades:
 * - Escuta eventos de question-controller.js
 * - Delega para strategy apropriada
 * - Estratégias emitem eventos específicos do modo
 * - HomeUIManager escuta eventos das estratégias
 *
 * Padrão: Mediator + Strategy
 * Benefício: Zero IFs em question-controller e HomeUIManager
 */

class ModeController {
  /**
   * @param {ModeManager} modeManager - Gerenciador de modos
   * @param {EventBus} eventBus - Bus de eventos global
   */
  constructor(modeManager, eventBus) {
    this.modeManager = modeManager;
    this.eventBus = eventBus;

    console.log('🎬 ModeController: Inicializando...');

    // Registrar listeners de eventos de question-controller
    this._initEventListeners();

    console.log('✅ ModeController: Inicializado com sucesso');
  }

  /**
   * Registra listeners para eventos vindos de question-controller.js
   */
  _initEventListeners() {
    // 1️⃣ 🔥 NOVO: Escutar quando silêncio é detectado OU usuário age
    // ModeController decide se deve finalizar baseado na estratégia
    this.eventBus.on('silenceDetectedOrUserAction', (data) => {
      this._handleSilenceOrUserAction(data);
    });

    // 2️⃣ Pergunta foi finalizada - agora delegar para strategy emitir seus eventos
    this.eventBus.on('questionFinalized', (data) => {
      this._handleQuestionFinalized(data);
    });

    // 3️⃣ Resposta do LLM terminou (streaming ou batch)
    this.eventBus.on('answerStreamEnd', (data) => {
      this._handleAnswerStreamEnd(data);
    });

    // 4️⃣ Pergunta clicada pelo usuário
    this.eventBus.on('questionClicked', (data) => {
      this._handleQuestionClick(data);
    });

    console.log('✅ Listeners de eventos registrados em ModeController');
  }

  /**
   * 🔥 NOVO: Quando silêncio é detectado OU usuário age
   * ModeController consulta estratégia para decidir se finaliza
   */
  _handleSilenceOrUserAction(data) {
    try {
      const currentMode = this.modeManager.getMode();
      const strategy = this.modeManager.getStrategy(currentMode);

      if (!strategy || typeof strategy.shouldFinalizeOnSilence !== 'function') {
        console.warn(`⚠️ Estratégia não tem shouldFinalizeOnSilence: ${currentMode}`);
        return;
      }

      console.log(
        `🎬 [ModeController] Consultando strategy.shouldFinalizeOnSilence (${currentMode})`
      );

      // Perguntar à estratégia se deve finalizar
      const shouldFinalize = strategy.shouldFinalizeOnSilence(data);

      if (shouldFinalize) {
        console.log(`✅ Estratégia autorizou finalização - chamando finalizeCurrentQuestion()`);
        globalThis.finalizeCurrentQuestion?.();
      } else {
        console.log(
          `⛔ Estratégia não autorizou finalização (modo: ${currentMode}, silêncio: ${data.isFromSilence})`
        );
      }
    } catch (error) {
      console.error('❌ Erro em ModeController._handleSilenceOrUserAction:', error);
    }
  }

  /**
   * Quando pergunta é finalizada por silêncio
   * Delega para strategy decidir o que fazer
   */
  _handleQuestionFinalized(data) {
    try {
      const currentMode = this.modeManager.getMode();
      const strategy = this.modeManager.getStrategy(currentMode);

      if (!strategy) {
        console.warn(`⚠️ Estratégia não encontrada para modo: ${currentMode}`);
        return;
      }

      console.log(`🎬 [ModeController] Delegando onQuestionFinalized ao modo: ${currentMode}`);

      // Construir contexto com dependências
      const context = {
        eventBus: this.eventBus,
        modeManager: this.modeManager,
        askLLM: globalThis.askLLM,
        state: globalThis.appState,
      };

      // Delegar para strategy
      strategy.onQuestionFinalized(context, data);
    } catch (error) {
      console.error('❌ Erro em ModeController._handleQuestionFinalized:', error);
    }
  }

  /**
   * Quando resposta do LLM termina
   */
  _handleAnswerStreamEnd(data) {
    try {
      const currentMode = this.modeManager.getMode();
      const strategy = this.modeManager.getStrategy(currentMode);

      if (!strategy || typeof strategy.onAnswerStreamEnd !== 'function') {
        return;
      }

      console.log(`🎬 [ModeController] Delegando onAnswerStreamEnd ao modo: ${currentMode}`);

      const context = {
        eventBus: this.eventBus,
        modeManager: this.modeManager,
        state: globalThis.appState,
      };

      strategy.onAnswerStreamEnd(context, data);
    } catch (error) {
      console.error('❌ Erro em ModeController._handleAnswerStreamEnd:', error);
    }
  }

  /**
   * Quando pergunta é clicada
   */
  _handleQuestionClick(data) {
    try {
      const currentMode = this.modeManager.getMode();
      const strategy = this.modeManager.getStrategy(currentMode);

      if (!strategy || typeof strategy.onQuestionClick !== 'function') {
        return;
      }

      console.log(`🎬 [ModeController] Delegando onQuestionClick ao modo: ${currentMode}`);

      const context = {
        eventBus: this.eventBus,
        modeManager: this.modeManager,
        state: globalThis.appState,
      };

      strategy.onQuestionClick(context, data);
    } catch (error) {
      console.error('❌ Erro em ModeController._handleQuestionClick:', error);
    }
  }

  /**
   * Método público: Verificar se pode re-perguntar
   */
  canReAsk(questionId) {
    try {
      const currentMode = this.modeManager.getMode();
      const strategy = this.modeManager.getStrategy(currentMode);

      if (!strategy || typeof strategy.canReAsk !== 'function') {
        return true; // Padrão seguro: permitir
      }

      const context = {
        eventBus: this.eventBus,
        modeManager: this.modeManager,
        state: globalThis.appState,
      };

      return strategy.canReAsk(context, questionId);
    } catch (error) {
      console.error('❌ Erro em ModeController.canReAsk:', error);
      return true; // Padrão seguro
    }
  }
}

// ============================================
// EXPORTAR
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModeController;
}

if (typeof globalThis !== 'undefined') {
  globalThis.ModeController = ModeController;
}
