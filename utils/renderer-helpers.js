/* ================================ */
// RENDERER HELPERS
// Funções utilitárias gerais do renderer
/* ================================ */

const { ipcRenderer } = require('electron');
const Logger = require('../utils/Logger.js');

// Variáveis injetadas
let appState;
let eventBus;

/**
 * Inicializar renderer-helpers
 */
function initRendererHelpers(deps) {
  appState = deps.appState;
  eventBus = deps.eventBus;
}

/**
 * Atualiza a mensagem de status na UI
 */
function updateStatusMessage(message) {
  Logger.debug('Início da função: "updateStatusMessage"');
  eventBus.emit('statusUpdate', { message });
  Logger.debug('Fim da função: "updateStatusMessage"');
}

/**
 * Limpa todas as seleções visuais
 */
function clearAllSelections() {
  eventBus.emit('clearAllSelections', {});
}

/**
 * Libera a thread para o navegador processar eventos
 */
function releaseThread(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reseta o estado completo do app (em chunks para não bloquear UI)
 */
async function resetAppState() {
  console.log('🧹 ═══════════════════════════════════════════════════════════');
  console.log('🧹 INICIANDO RESET COMPLETO DO APP');
  console.log('🧹 ═══════════════════════════════════════════════════════════');

  try {
    // 1️⃣ CHUNK 1: Parar autoplay e áudio
    if (appState.audio.isRunning) {
      console.log('🎤 Parando captura de áudio...');
      appState.audio.isRunning = false;
    }
    console.log('✅ Autoplay do mock parado');
    await releaseThread();

    // 2️⃣ CHUNK 2: Limpar perguntas e respostas
    appState.interview.currentQuestion = {
      text: '',
      lastUpdate: 0,
      finalized: false,
      promotedToHistory: false,
      turnId: null,
      lastUpdateTime: null,
      createdAt: null,
      finalText: '',
      interimText: '',
    };
    appState.history = [];
    appState.interview.answeredQuestions.clear();
    appState.selectedId = null;
    appState.interview.lastAskedQuestionNormalized = null;
    console.log('✅ Perguntas e respostas limpas');
    await releaseThread();

    // 3️⃣ CHUNK 3: Limpar estado LLM e métricas
    appState.interview.interviewTurnId = 0;
    appState.interview.llmAnsweredTurnId = null;
    appState.interview.llmRequestedTurnId = null;
    appState.interview.llmRequestedQuestionId = null;
    appState.metrics = {
      audioStartTime: null,
      llmStartTime: null,
      llmEndTime: null,
      totalTime: null,
      audioSize: 0,
    };
    console.log('✅ Estado de entrevista resetado');
    console.log('✅ Métricas resetadas');
    await releaseThread();

    // 4️⃣ CHUNK 4: Limpar screenshots
    if (appState.audio.capturedScreenshots.length > 0) {
      console.log(`🗑️ Limpando ${appState.audio.capturedScreenshots.length} screenshot(s)...`);
      appState.audio.capturedScreenshots = [];
      eventBus.emit('screenshotBadgeUpdate', {
        count: 0,
        visible: false,
      });
      try {
        await ipcRenderer.invoke('CLEANUP_SCREENSHOTS');
      } catch (err) {
        console.warn('⚠️ Erro ao limpar screenshots no sistema:', err);
      }
    }
    console.log('✅ Screenshots limpos');
    await releaseThread();

    // 5️⃣ CHUNK 5: Limpar flags
    appState.audio.isCapturing = false;
    appState.audio.isAnalyzing = false;
    console.log('✅ Flags resetadas');
    await releaseThread();

    // 6️⃣ CHUNK 6: Atualizar UI - Perguntas
    eventBus.emit('currentQuestionUpdate', {
      text: '',
      isSelected: false,
    });
    eventBus.emit('questionsHistoryUpdate', []);
    console.log('✅ Perguntas UI limpa');
    await releaseThread();

    // 7️⃣ CHUNK 7: Atualizar UI - Transcrições e Respostas
    eventBus.emit('transcriptionCleared');
    eventBus.emit('answersCleared');
    console.log('✅ Transcrições e respostas UI limpas');
    await releaseThread();

    // 8️⃣ CHUNK 8: Atualizar UI - Botão Listen
    eventBus.emit('listenButtonToggle', {
      isRunning: false,
      buttonText: '🎤 Começar a Ouvir... (Ctrl+D)',
    });
    console.log('✅ Botão listen resetado');
    await releaseThread();

    // 9️⃣ CHUNK 9: Atualizar UI - Status
    eventBus.emit('statusUpdate', {
      status: 'ready',
      message: '✅ Pronto',
    });
    console.log('✅ Status atualizado');
    await releaseThread();

    // 🔟 CHUNK 10: Limpar seleções
    clearAllSelections();
    console.log('✅ Seleções limpas');
    await releaseThread();

    // 1️⃣1️⃣ LOG FINAL
    console.log('✅ ═══════════════════════════════════════════════════════════');
    console.log('✅ RESET COMPLETO CONCLUÍDO COM SUCESSO');
    console.log('✅ ═══════════════════════════════════════════════════════════');

    return true;
  } catch (error) {
    console.error('❌ Erro ao resetar app:', error);
    return false;
  }
}

/**
 * Exportar helpers
 */
module.exports = {
  initRendererHelpers,
  updateStatusMessage,
  clearAllSelections,
  releaseThread,
  resetAppState,
};
