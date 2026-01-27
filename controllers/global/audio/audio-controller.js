/* ================================ */
// AUDIO CONTROLLER
// Gerencia captura, processamento e métricas de áudio
/* ================================ */
// @ts-nocheck
/* global Logger */
// Dependências carregadas globalmente via index.html

let globalConfig; // Referência ao configManager global
let UIElements;
let _CURRENT_QUESTION_ID;
let _modeManager;
let _MODES;

// getConfiguredSTTModel vem de globalThis.RendererAPI (definida em renderer.js / ConfigManager)
// closeCurrentQuestionForced vem de globalThis (definida em question-controller.js)
let _findAnswerByQuestionId;

/**
 * Inicializar audio-controller com dependências
 * @param {Object} deps - Dependências do sistema
 */
function initAudioController(deps) {
  // Guardar referências em globalThis
  globalThis._audioControllerDeps = deps;

  // Atribuir dependências às variáveis locais
  globalConfig = deps.globalConfig;
  UIElements = deps.UIElements;
  _CURRENT_QUESTION_ID = deps.CURRENT_QUESTION_ID;
  _modeManager = deps.modeManager;
  _MODES = deps.MODES;
  _findAnswerByQuestionId = deps.findAnswerByQuestionId;

  Logger.debug('✅ AudioController inicializado com dependências');
}

/**
 * Inicia captura de áudio
 */
async function startAudio() {
  const sttModel = globalThis.RendererAPI?.getConfiguredSTTModel?.() || 'error';
  Logger.info('startAudio', { model: sttModel });

  try {
    await globalThis.sttStrategy.start(sttModel, UIElements);
  } catch (error) {
    Logger.error('Erro ao iniciar áudio', { error: error.message });
    throw error;
  }
}

/**
 * Para captura de áudio
 */
async function stopAudio() {
  // Fecha pergunta atual se estava aberta
  if (globalThis.appState.interview.currentQuestion.text) globalThis.closeCurrentQuestionForced();

  const sttModel = globalThis.RendererAPI?.getConfiguredSTTModel?.() || 'error';
  Logger.info('stopAudio', { model: sttModel });

  try {
    await globalThis.sttStrategy.stop(sttModel);
  } catch (error) {
    Logger.error('Erro ao parar áudio', { error: error.message });
  }
}

/**
 * Toggle do botão de iniciar/parar escuta (Ctrl+D)
 */
async function listenToggleBtn() {
  Logger.debug('Início da função: "listenToggleBtn"');

  if (!globalThis.appState.audio.isRunning) {
    Logger.debug('🎤 listenToggleBtn: Tentando INICIAR escuta...', true);

    // 🔥 VALIDAÇÃO 1: Modelo de IA ativo
    const { active: hasModel, model: activeModel } = hasActiveModel();
    Logger.debug(`📊 DEBUG: hasModel = ${hasModel}, activeModel = ${activeModel}`, false);

    if (!hasModel) {
      const errorMsg = 'Ative um modelo de IA antes de começar a ouvir';
      globalThis.eventBus.emit('error', errorMsg);
      return;
    }

    // 🔥 VALIDAÇÃO 2: Dispositivo de áudio de SAÍDA (obrigatório para ouvir a reunião)
    const hasOutputDevice = UIElements?.outputSelect?.value;
    Logger.debug(`📊 DEBUG: hasOutputDevice = ${hasOutputDevice}`, false);

    if (!hasOutputDevice) {
      const errorMsg = 'Selecione um dispositivo de áudio (output) para ouvir a reunião';
      Logger.warn(`⚠️ ${errorMsg}`);
      Logger.debug('📡 DEBUG: Emitindo onError:', errorMsg);
      globalThis.eventBus.emit('error', errorMsg);
      return;
    }
  }

  // Inverte o estado de globalThis.appState.audio.isRunning
  globalThis.appState.audio.isRunning = !globalThis.appState.audio.isRunning;
  const buttonText = globalThis.appState.audio.isRunning
    ? 'Parar a Escuta... (Ctrl+d)'
    : 'Começar a Ouvir... (Ctrl+d)';
  const statusMsg = globalThis.appState.audio.isRunning ? 'Status: ouvindo...' : 'Status: parado';

  // Emite o evento 'onListenButtonToggle' para atualizar o botão de escuta
  globalThis.eventBus.emit('listenButtonToggle', {
    isRunning: globalThis.appState.audio.isRunning,
    buttonText,
  });

  // Atualiza o status da escuta na tela
  globalThis.updateStatusMessage(statusMsg);

  await (globalThis.appState.audio.isRunning ? startAudio() : stopAudio());

  Logger.debug('Fim da função: "listenToggleBtn"');
}

/**
 * Verifica se há um modelo de IA ativo na configuração
 * @returns {object} { active: boolean, model: string|null }
 */
function hasActiveModel() {
  Logger.debug('Início da função: "hasActiveModel"');
  if (!globalConfig) {
    console.warn('⚠️ ConfigManager não inicializado ainda');
    return { active: false, model: null };
  }

  const config = globalConfig.config;
  if (!config?.api) {
    console.warn('⚠️ Config ou api não disponível');
    return { active: false, model: null };
  }

  // Verifica se algum modelo está ativo e retorna o nome
  const providers = ['openai', 'google', 'openrouter', 'custom'];
  for (const provider of providers) {
    if (config.api[provider]?.enabled === true) {
      console.log(`✅ Modelo ativo encontrado: ${provider}`);
      return { active: true, model: provider };
    }
  }

  Logger.debug('Fim da função: "hasActiveModel"');
  return { active: false, model: null };
}

/**
 * Registra métricas de transcrição
 */
function logTranscriptionMetrics() {
  if (!globalThis.appState.metrics) return;

  const metrics = globalThis.appState.metrics;
  const now = Date.now();
  const elapsed = now - metrics.startTime;

  const message =
    `📊 Métricas de Transcrição\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱️ Tempo decorrido: ${(elapsed / 1000).toFixed(1)}s\n` +
    `🎤 Tentativas STT: ${metrics.sttAttempts}\n` +
    `✅ Sucessos: ${metrics.sttSuccesses}\n` +
    `❌ Falhas: ${metrics.sttFailures}\n` +
    `🔄 Última atualização: ${new Date(metrics.lastUpdate).toLocaleTimeString()}\n`;

  // @ts-ignore - Logger.info tem overloads, aceitando (title, message)
  Logger.info('Métricas de Transcrição', message);
  globalThis.eventBus.emit('metricsUpdated', metrics);
}

/**
 * Exportar as funções
 */
module.exports = {
  initAudioController,
  startAudio,
  stopAudio,
  listenToggleBtn,
  hasActiveModel,
  logTranscriptionMetrics,
};

// Exportar para globalThis (para acesso de scripts carregados via <script> tag)
if (typeof globalThis !== 'undefined') {
  globalThis.listenToggleBtn = listenToggleBtn;
  globalThis.initAudioController = initAudioController;
}
