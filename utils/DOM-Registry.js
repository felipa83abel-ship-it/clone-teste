/**
 * DOM-Registry.js
 * Registro centralizado de seletores de elementos DOM
 *
 * Uso: const elem = DOM.get('listenBtn');
 */

class DOMRegistry {
  /**
   * Obtém um único elemento DOM por chave
   * @returns {HTMLElement|null}
   */
  static get(key) {
    const selector = this.registry[key];
    if (!selector) {
      console.warn(`⚠️ DOM-Registry: '${key}' não registrado`);
      return null;
    }
    return document.querySelector(selector);
  }

  /**
   * Obtém múltiplos elementos DOM por chave
   * @returns {NodeListOf<Element>|[]}
   */
  static getAll(key) {
    const selector = this.registry[key];
    if (!selector) {
      console.warn(`⚠️ DOM-Registry: '${key}' não registrado`);
      return [];
    }
    const result = document.querySelectorAll(selector);
    return result.length > 0 ? result : [];
  }

  /**
   * Obtém elemento obrigatório (lança erro se não encontrado)
   * @returns {HTMLElement}
   */
  static getRequired(key) {
    const elem = this.get(key);
    if (!elem) throw new Error(`❌ DOM-Registry: '${key}' obrigatório não encontrado`);
    return elem;
  }

  /**
   * Verifica se elemento existe
   * @returns {boolean}
   */
  static exists(key) {
    return !!this.get(key);
  }

  /**
   * Registra o DOM-Registry (inicializa)
   * @returns {void}
   */
  static register() {
    // Simply initialize the registry
    console.log('✅ DOM-Registry inicializado com sucesso');
  }

  static registry = {
    // HOME / TRANSCRIÇÃO
    conversation: '#conversation',
    transcriptBox: '#conversation',
    transcriptionContainer: '#transcriptionContainer',
    interimElement: '.interim',
    answersHistory: '#answersHistory',
    answerBlocks: '.answer-block',
    currentQuestion: '#currentQuestion',
    currentQuestionText: '#currentQuestionText',
    questionsHistory: '#questionsHistory',
    questionBlocks: '.question-block',

    // BOTÕES PRINCIPAIS
    listenBtn: '#listenBtn',
    askLlmBtn: '#askLlmBtn',

    // STATUS E MENSAGENS
    statusDiv: '#status-div',

    // VU METERS
    inputVu: '#inputVu',
    outputVu: '#outputVu',
    inputVuHome: '#inputVuHome',
    outputVuHome: '#outputVuHome',
    homeVuMeters: '.home-vu-meters',

    // MENU LATERAL
    sideMenu: '#sideMenu',
    dragHandle: '#dragHandle',
    btnToggleClick: '#btnToggleClick',
    btnClose: '#btnClose',

    // TOP BAR
    topBar: '#topBar',
    mockBadge: '#mockBadge',
    screenshotBadge: '#screenshotBadge',
    opacityRange: '#opacityRange',
    interviewModeSelect: '#interviewModeSelect',

    // AUDIO DEVICES
    audioInputDevice: '#audio-input-device',
    audioOutputDevice: '#audio-output-device',

    // API KEYS (com aliases para diferentes nomes usados)
    openaiApiKey: '#openai-api-key',
    googleApiKey: '#google-api-key',
    openrouterApiKey: '#openrouter-api-key',
    // Aliases para compatibilidade
    openaiApiKeyInput: '#openai-api-key',
    googleApiKeyInput: '#google-api-key',
    openrouterApiKeyInput: '#openrouter-api-key',

    // MODELS
    sttModelSelect: '#stt-model-select',
    llmModelSelect: '#llm-model-select',

    // CONFIG SECTIONS (usando IDs reais do HTML)
    home: '#home',
    'api-models': '#api-models',
    'audio-screen': '#audio-screen',
    privacy: '#privacy',
    other: '#other',
    info: '#info',
    // Aliases para nomes verbosos
    homeSection: '#home',
    apiModelsSection: '#api-models',
    audioScreenSection: '#audio-screen',
    privacySection: '#privacy',
    otherSection: '#other',
    infoSection: '#info',

    // OPENAI SECTION
    openai: '#openai',
    'openai-api-key': '#openai-api-key',
    'openai-model-status': '#openai-model-status',
    'openai-stt-model': '#openai-stt-model',
    'openai-llm-model': '#openai-llm-model',

    // GOOGLE SECTION
    google: '#google',
    'google-api-key': '#google-api-key',
    'google-model-status': '#google-model-status',
    'google-stt-model': '#google-stt-model',
    'google-llm-model': '#google-llm-model',

    // OPENROUTER SECTION
    openrouter: '#openrouter',
    'openrouter-api-key': '#openrouter-api-key',
    'openrouter-model-status': '#openrouter-model-status',
    'openrouter-stt-model': '#openrouter-stt-model',
    'openrouter-llm-model': '#openrouter-llm-model',

    // API KEY MANAGEMENT BUTTONS
    'btn-toggle-visibility': '.btn-toggle-visibility',
    'btn-delete-api-key': '.btn-delete-api-key',
    'btn-activate': '.btn-activate',

    // SCREENSHOT CONFIG
    screenshotHotkey: '#screenshot-hotkey',
    screenshotFormat: '#screenshot-format',
    excludeAppFromScreenshot: '#exclude-app-from-screenshot',
    recordHotkeyBtn: '#recordHotkeyBtn',

    // TOGGLES
    darkModeToggle: '#darkModeToggle',
    mockToggle: '#mockToggle',
    analyticsToggle: '#analytics-toggle',
    autoClearDataCheckbox: '#auto-clear-data',
    autoUpdateCheckbox: '#auto-update',
    hideFromScreenCapture: '#hide-from-screen-capture',
    disableTelemetry: '#disable-telemetry',
    dataRetentionDays: '#data-retention-days',

    // BUTTONS
    resetHomeBtn: '#resetHomeBtn',
    clearScreenshotsBtn: '#clearScreenshotsBtn',
    resetConfigBtn: '#btn-reset-config',
    saveButtons: '.btn-save',
  };

  static validate() {
    const report = { total: Object.keys(this.registry).length, found: 0, missing: 0, details: {} };
    Object.entries(this.registry).forEach(([key, selector]) => {
      const exists = !!document.querySelector(selector);
      if (exists) report.found++;
      else {
        report.missing++;
        report.details[key] = `Não encontrado: ${selector}`;
      }
    });
    return report;
  }

  static showReport() {
    const report = this.validate();
    console.log('🔍 DOM-Registry:', `${report.found}/${report.total} elementos encontrados`);
    if (report.missing > 0) {
      console.warn(`❌ Faltantes: ${report.missing}`);
      Object.entries(report.details).forEach(([key, msg]) => {
        console.warn(`  • ${key}: ${msg}`);
      });
    }
    return report;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.DOM = DOMRegistry;
}

module.exports = DOMRegistry;
