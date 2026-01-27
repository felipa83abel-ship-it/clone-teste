/* ================================ */
// RENDERER HELPERS
// Funções utilitárias gerais do renderer
/* ================================ */
// ipcRenderer passado em deps.ipcRenderer
// Logger é carregado como script global no index.html

/**
 * Inicializar renderer-helpers
 */
function initRendererHelpers(deps) {
  // Guardar referências em globalThis para evitar conflitos de escopo
  globalThis._rendererHelpersDeps = deps;
}

/**
 * Atualiza a mensagem de status na UI
 */
function updateStatusMessage(message) {
  globalThis.globalThis.Logger.debug('Início da função: "updateStatusMessage"');
  globalThis.eventBus.emit('statusUpdate', { message });
  globalThis.globalThis.Logger.debug('Fim da função: "updateStatusMessage"');
}

/**
 * Limpa todas as seleções visuais
 */
function clearAllSelections() {
  globalThis.eventBus.emit('clearAllSelections', {});
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
    if (globalThis.appState.audio.isRunning) {
      console.log('🎤 Parando captura de áudio...');
      globalThis.appState.audio.isRunning = false;
    }
    console.log('✅ Autoplay do mock parado');
    await releaseThread();

    // 2️⃣ CHUNK 2: Limpar perguntas e respostas
    globalThis.appState.interview.currentQuestion = {
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
    // Esvaziar completamente o histórico de perguntas
    globalThis.appState.interview.questionsHistory.splice(0);
    globalThis.appState.interview.answeredQuestions.clear();
    globalThis.appState.selectedId = null;
    console.log('✅ Perguntas e respostas limpas');
    console.log(
      `📊 Histórico de perguntas: ${globalThis.appState.interview.questionsHistory.length} item(ns)`
    );
    await releaseThread();

    // 3️⃣ CHUNK 3: Limpar estado LLM e métricas
    globalThis.appState.interview.interviewTurnId = 0;
    globalThis.appState.globalQuestionCounter = 0;
    globalThis.appState.interview.llmAnsweredTurnId = null;
    globalThis.appState.interview.llmRequestedTurnId = null;
    globalThis.appState.interview.llmRequestedQuestionId = null;
    globalThis.appState.metrics = {
      audioStartTime: null,
      llmStartTime: null,
      llmEndTime: null,
      totalTime: null,
      audioSize: 0,
    };
    console.log('✅ Estado de entrevista resetado');
    console.log('✅ Métricas resetadas');
    console.log('✅ Contador global de perguntas zerado');
    await releaseThread();

    // 4️⃣ CHUNK 4: Limpar screenshots
    if (globalThis.appState.audio.capturedScreenshots.length > 0) {
      console.log(
        `🗑️ Limpando ${globalThis.appState.audio.capturedScreenshots.length} screenshot(s)...`
      );
      globalThis.appState.audio.capturedScreenshots = [];
      globalThis.eventBus.emit('screenshotBadgeUpdate', {
        count: 0,
        visible: false,
      });
      try {
        await globalThis._rendererHelpersDeps.ipcRenderer.invoke('CLEANUP_SCREENSHOTS');
      } catch (err) {
        console.warn('⚠️ Erro ao limpar screenshots no sistema:', err);
      }
    }
    console.log('✅ Screenshots limpos');
    await releaseThread();

    // 5️⃣ CHUNK 5: Limpar flags
    globalThis.appState.audio.isCapturing = false;
    globalThis.appState.audio.isAnalyzing = false;
    console.log('✅ Flags resetadas');
    await releaseThread();

    // 6️⃣ CHUNK 6: Atualizar UI - Perguntas
    globalThis.eventBus.emit('currentQuestionUpdate', {
      text: '',
      isSelected: false,
    });
    globalThis.eventBus.emit('questionsHistoryUpdate', []);
    console.log('✅ Perguntas UI limpa');
    await releaseThread();

    // 7️⃣ CHUNK 7: Atualizar UI - Transcrições e Respostas
    globalThis.eventBus.emit('transcriptionCleared');
    globalThis.eventBus.emit('answersCleared');
    console.log('✅ Transcrições e respostas UI limpas');
    await releaseThread();

    // 8️⃣ CHUNK 8: Atualizar UI - Botão Listen
    globalThis.eventBus.emit('listenButtonToggle', {
      isRunning: false,
      buttonText: '🎤 Começar a Ouvir... (Ctrl+D)',
    });
    console.log('✅ Botão listen resetado');
    await releaseThread();

    // 9️⃣ CHUNK 9: Atualizar UI - Status
    globalThis.eventBus.emit('statusUpdate', {
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
// Expor em globalThis para uso em browser
if (typeof globalThis !== 'undefined') {
  globalThis.updateStatusMessage = updateStatusMessage;
  globalThis.clearAllSelections = clearAllSelections;
  globalThis.releaseThread = releaseThread;
  globalThis.resetAppState = resetAppState;
  // Expor objeto com todos os helpers
  globalThis.rendererHelpers = {
    initRendererHelpers,
    updateStatusMessage,
    clearAllSelections,
    releaseThread,
    resetAppState,
  };
}

// Expor para CommonJS (Node.js)
module.exports = {
  initRendererHelpers,
  updateStatusMessage,
  clearAllSelections,
  releaseThread,
  resetAppState,
};
