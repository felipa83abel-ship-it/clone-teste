/**
 * DOM-Registry.js
 * Registro centralizado de seletores de elementos DOM
 *
 * Uso: const elem = DOM.get('listenBtn');
 */

class DOMRegistry {
  static get(key) {
    const selector = this.registry[key];
    if (!selector) {
      console.warn(`⚠️ DOM-Registry: '${key}' não registrado`);
      return null;
    }
    return document.querySelector(selector);
  }

  static getAll(key) {
    const selector = this.registry[key];
    if (!selector) {
      console.warn(`⚠️ DOM-Registry: '${key}' não registrado`);
      return [];
    }
    return document.querySelectorAll(selector);
  }

  static getRequired(key) {
    const elem = this.get(key);
    if (!elem) throw new Error(`❌ DOM-Registry: '${key}' obrigatório não encontrado`);
    return elem;
  }

  static exists(key) {
    return !!this.get(key);
  }

  static registry = {
    // HOME / TRANSCRIÇÃO
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

    // API KEYS
    openaiApiKeyInput: '#openai-api-key',
    googleApiKeyInput: '#google-api-key',
    openrouterApiKeyInput: '#openrouter-api-key',

    // MODELS
    sttModelSelect: '#stt-model-select',
    llmModelSelect: '#llm-model-select',

    // CONFIG SECTIONS
    homeSection: '#home',
    apiModelsSection: '#api-models',
    audioScreenSection: '#audio-screen',
    privacySection: '#privacy',
    otherSection: '#other',
    infoSection: '#info',

    // TOGGLES
    darkModeToggle: '#darkModeToggle',
    mockToggle: '#mockToggle',
    analyticsToggle: '#analytics-toggle',
    autoClearDataCheckbox: '#auto-clear-data',
    autoUpdateCheckbox: '#auto-update',

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
