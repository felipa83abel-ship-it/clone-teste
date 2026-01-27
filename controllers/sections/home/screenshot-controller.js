/* ================================ */
// SCREENSHOT CONTROLLER
// Gerencia captura e análise de screenshots
/* ================================ */

// ⚠️ Evitar redeclaração de variáveis do módulo
if (!globalThis._screenshotControllerLoaded) {
  globalThis._screenshotControllerLoaded = true;

  // Logger carregado globalmente via index.html
  // ipcRenderer passado como dependência em initScreenshotController

  /**
   * Inicializar screenshot-controller
   */
  function initScreenshotController(deps) {
    globalThis._screenshotControllerDeps = deps;
    globalThis._screenshotControllerIpc = deps.ipcRenderer;
    // ipcRenderer disponível em globalThis._screenshotControllerIpc
    // updateStatusMessage e renderQuestionsHistory vêm de deps
  }

  /**
   * Captura screenshot discretamente e armazena em memória
   */
  async function captureScreenshot() {
    if (globalThis.appState.audio.isCapturing) {
      globalThis.Logger.debug('⏳ Captura já em andamento...', false);
      return;
    }

    globalThis.appState.audio.isCapturing = true;
    globalThis.updateStatusMessage('📸 Capturando tela...');

    try {
      const result = await globalThis._screenshotControllerIpc.invoke('CAPTURE_SCREENSHOT');

      if (!result.success) {
        globalThis.Logger.warn('⚠️ Falha na captura:', result.error);
        globalThis.updateStatusMessage(`❌ ${result.error}`);
        globalThis.eventBus.emit('screenshotBadgeUpdate', {
          count: globalThis.appState.audio.capturedScreenshots.length,
          visible: globalThis.appState.audio.capturedScreenshots.length > 0,
        });
        return;
      }

      // Armazena referência do screenshot
      globalThis.appState.audio.capturedScreenshots.push({
        filepath: result.filepath,
        filename: result.filename,
        timestamp: result.timestamp,
        size: result.size,
      });

      globalThis.Logger.debug(`✅ Screenshot capturado: ${result.filename}`, true);
      globalThis.Logger.debug(
        `📦 Total em memória: ${globalThis.appState.audio.capturedScreenshots.length}`,
        true
      );

      // Atualiza UI
      globalThis.updateStatusMessage(
        `✅ ${globalThis.appState.audio.capturedScreenshots.length} screenshot(s) capturado(s)`
      );
      globalThis.eventBus.emit('screenshotBadgeUpdate', {
        count: globalThis.appState.audio.capturedScreenshots.length,
        visible: true,
      });
    } catch (error) {
      globalThis.Logger.error('❌ Erro ao capturar screenshot:', error);
      globalThis.updateStatusMessage('❌ Erro na captura');
    } finally {
      globalThis.appState.audio.isCapturing = false;
    }
  }

  /**
   * Envia screenshots para análise com OpenAI Vision
   */
  async function analyzeScreenshots() {
    if (globalThis.appState.audio.isAnalyzing) {
      globalThis.Logger.debug('Análise já em andamento', true);
      return;
    }

    if (globalThis.appState.audio.capturedScreenshots.length === 0) {
      globalThis.Logger.warn('Nenhum screenshot para analisar');
      globalThis.updateStatusMessage(
        '⚠️ Nenhum screenshot para analisar (capture com Ctrl+Shift+F)'
      );
      return;
    }

    globalThis.appState.audio.isAnalyzing = true;
    globalThis.updateStatusMessage(
      `🔍 Analisando ${globalThis.appState.audio.capturedScreenshots.length} screenshot(s)...`
    );

    try {
      // Extrai caminhos dos arquivos
      const filepaths = globalThis.appState.audio.capturedScreenshots.map((s) => s.filepath);

      globalThis.Logger.info('Enviando para análise', { count: filepaths.length });

      // Envia para main.js
      const result = await globalThis._screenshotControllerIpc.invoke(
        'ANALYZE_SCREENSHOTS',
        filepaths
      );

      if (!result.success) {
        globalThis.Logger.error('Falha na análise', { error: result.error });
        globalThis.updateStatusMessage(`❌ ${result.error}`);
        return;
      }

      // Renderiza resposta do LLM como se fosse uma pergunta normal
      const questionText = `📸 Análise de ${globalThis.appState.audio.capturedScreenshots.length} screenshot(s)`;
      const questionId = String(globalThis.appState.history.length + 1);

      // Adiciona "pergunta" ao histórico ANTES de renderizar respostas
      globalThis.appState.history.push({
        id: questionId,
        text: questionText,
        createdAt: Date.now(),
        lastUpdateTime: Date.now(),
        answered: true,
      });

      // MARCA COMO RESPONDIDA (importante para clique não gerar duplicata)
      globalThis.appState.interview.answeredQuestions.add(questionId);

      globalThis._screenshotControllerDeps.renderQuestionsHistory();

      // RENDERIZA VIA EVENTBUS (consistente com LLM)
      // Divide análise em tokens e emite como se fosse stream
      const analysisText = result.analysis;
      const tokens = analysisText.split(/(\s+|[.,!?;:\-()[\]{}\n])/g).filter((t) => t.length > 0);

      globalThis.Logger.info('Simulando stream', { tokenCount: tokens.length });

      // Emite tokens via eventBus (consistente com askLLM)
      let accumulated = '';
      for (const token of tokens) {
        accumulated += token;

        globalThis.eventBus.emit('answerStreamChunk', {
          questionId: questionId,
          token: token,
          accum: accumulated,
        });

        // Pequeno delay entre tokens para simular streaming real
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      globalThis.Logger.info('Análise concluída');
      globalThis.updateStatusMessage('✅ Análise concluída');

      // Limpa screenshots após análise
      globalThis.Logger.info('Limpando screenshots', {
        count: globalThis.appState.audio.capturedScreenshots.length,
      });
      globalThis.appState.audio.capturedScreenshots = [];

      // Atualiza badge
      globalThis.eventBus.emit('screenshotBadgeUpdate', {
        count: 0,
        visible: false,
      });

      // Força limpeza no sistema
      await globalThis._screenshotControllerIpc.invoke('CLEANUP_SCREENSHOTS');
    } catch (error) {
      globalThis.Logger.error('Erro ao analisar screenshots', { error: error.message });
      globalThis.updateStatusMessage('❌ Erro na análise');
    } finally {
      globalThis.appState.audio.isAnalyzing = false;
    }
  }

  /**
   * Limpa todos os screenshots armazenados
   */
  function clearScreenshots() {
    if (globalThis.appState.audio.capturedScreenshots.length === 0) return;

    console.log(
      `🗑️ Limpando ${globalThis.appState.audio.capturedScreenshots.length} screenshot(s)...`
    );
    globalThis.appState.audio.capturedScreenshots = [];

    globalThis.updateStatusMessage('✅ Screenshots limpos');
    globalThis.eventBus.emit('screenshotBadgeUpdate', {
      count: 0,
      visible: false,
    });

    // Força limpeza no sistema
    globalThis._screenshotControllerIpc.invoke('CLEANUP_SCREENSHOTS').catch((err) => {
      console.warn('⚠️ Erro na limpeza:', err);
    });
  }

  /**
   * Exportar funções
   */
  // Expor em globalThis para uso em browser
  if (typeof globalThis !== 'undefined') {
    globalThis.initScreenshotController = initScreenshotController;
    globalThis.captureScreenshot = captureScreenshot;
    globalThis.analyzeScreenshots = analyzeScreenshots;
    globalThis.clearScreenshots = clearScreenshots;
    // Expor objeto com todos os métodos
    globalThis.screenshotController = {
      initScreenshotController,
      captureScreenshot,
      analyzeScreenshots,
      clearScreenshots,
    };
  }

  // Expor para CommonJS (Node.js)
  module.exports = {
    initScreenshotController,
    captureScreenshot,
    analyzeScreenshots,
    clearScreenshots,
  };
} // Fim da proteção contra redeclaração
