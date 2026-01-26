/**
 * DOM-Registry.js
 *
 * Registro centralizado de seletores de elementos DOM
 *
 * Objetivo: Centralizar todos os seletores de DOM em um único lugar para:
 *  1. Evitar strings hardcoded espalhadas pelo código
 *  2. Facilitar refatoração quando IDs/classes mudam
 *  3. Documentar quais elementos são críticos
 *  4. Melhorar manutenibilidade e legibilidade
 *
 * Padrão: Funções lazy-load (getters) para acessar elementos on-demand
 *
 * Uso:
 *   const elem = DOM.get('listenBtn');
 *   const elems = DOM.getAll('question-block');
 */

class DOMRegistry {
  /**
   * Get elemento por chave registrada
   * @param {string} key - Nome do elemento (ex: 'listenBtn')
   * @returns {HTMLElement | null} Elemento do DOM ou null
   */
  static get(key) {
    const selector = this.registry[key];
    if (!selector) {
      console.warn(`⚠️ DOM-Registry: elemento '${key}' não encontrado no registro`);
      return null;
    }
    return document.querySelector(selector);
  }

  /**
   * Get todos elementos de um tipo
   * @param {string} key - Nome do seletor (ex: 'questions')
   * @returns {NodeList} Lista de elementos
   */
  static getAll(key) {
    const selector = this.registry[key];
    if (!selector) {
      console.warn(`⚠️ DOM-Registry: seletor '${key}' não encontrado no registro`);
      return [];
    }
    return document.querySelectorAll(selector);
  }

  /**
   * Get elemento único com validação
   * @param {string} key - Nome do elemento
   * @returns {HTMLElement} Elemento ou throws error
   */
  static getRequired(key) {
    const elem = this.get(key);
    if (!elem) {
      throw new Error(`❌ DOM-Registry: elemento obrigatório '${key}' não encontrado`);
    }
    return elem;
  }

  /**
   * Verificar se elemento existe
   * @param {string} key - Nome do elemento
   * @returns {boolean} true se existe
   */
  static exists(key) {
    const selector = this.registry[key];
    if (!selector) return false;
    return !!document.querySelector(selector);
  }

  /**
   * Registro centralizado de seletores
   *
   * Organizado por função:
   */
  static registry = {
    // ==========================================
    // MENU LATERAL
    // ==========================================
    sideMenu: '#sideMenu',
    dragHandle: '#dragHandle',
    btnToggleClick: '#btnToggleClick',
    menuItems: '.menu-items',
    menuItemsAll: '.menu-item',
    btnClose: '#btnClose',

    // ==========================================
    // TOP BAR
    // ==========================================
    topBar: '#topBar',
    mockBadge: '#mockBadge',
    screenshotBadge: '#screenshotBadge',
    opacityRange: '#opacityRange',
    interviewModeSelect: '#interviewModeSelect',
    topBarTitle: '.top-bar-title',

    // ==========================================
    // HOME TAB - VU METERS
    // ==========================================
    inputVuHome: '#inputVuHome',
    outputVuHome: '#outputVuHome',
    statusDiv: '#status',
    resetHomeBtn: '#resetHomeBtn',
    clearScreenshotsBtn: '#clearScreenshotsBtn',

    // ==========================================
    // HOME TAB - QUESTIONS
    // ==========================================
    questionsContainer: '#questions',
    listenBtn: '#listenBtn',
    transcriptionContainer: '#transcriptionContainer',
    conversation: '#conversation',
    questionsHeader: '.questions-header',
    currentQuestion: '#currentQuestion',
    currentQuestionText: '#currentQuestionText',
    questionsHistory: '#questionsHistory',
    questionBlocks: '.question-block', // NodeList (getAll)

    // ==========================================
    // HOME TAB - ANSWERS
    // ==========================================
    answersContainer: '#answers',
    answersHeader: '.answers-header',
    askLlmBtn: '#askLlmBtn',
    answersHistory: '#answersHistory',
    answerBlocks: '.answer-block', // NodeList (getAll)
    answerContent: '.answer-content', // Class (getAll)

    // ==========================================
    // CONFIG TABS
    // ==========================================
    configSections: '#configSections',
    homeSection: '#home',
    apiModelsSection: '#api-models',
    audioScreenSection: '#audio-screen',
    privacySection: '#privacy',
    otherSection: '#other',
    infoSection: '#info',
    configForms: '.config-form', // NodeList (getAll)

    // ==========================================
    // API & MODELS TAB
    // ==========================================
    providerSelect: '#providerSelect',
    apiKeyInput: '#api-key-input',
    apiKeyDisplay: '#api-key-display',
    sttModelSelect: '#stt-model-select',
    llmModelSelect: '#llm-model-select',
    saveApiBtn: '[data-section="api"]',
    testApiBtn: '#test-api-btn',

    // ==========================================
    // AUDIO & SCREEN TAB
    // ==========================================
    audioInputDevice: '#audio-input-device',
    audioOutputDevice: '#audio-output-device',
    listeningBtn: '#listening-btn',
    voiceThresholdInput: '#voice-threshold-input',
    recordingCheckbox: '#recording-checkbox',
    screenshotFormatSelect: '#screenshot-format-select',
    saveAudioBtn: '[data-section="audio"]',

    // ==========================================
    // PRIVACY TAB
    // ==========================================
    analyticsToggle: '#analytics-toggle',
    autoClearDataCheckbox: '#auto-clear-data',
    dataRetentionSelect: '#data-retention-days',
    savePrivacyBtn: '[data-section="privacy"]',

    // ==========================================
    // OTHER TAB
    // ==========================================
    darkModeToggle: '#darkModeToggle',
    mockToggle: '#mockToggle',
    languageSelect: '#language',
    autoUpdateCheckbox: '#auto-update',
    logLevelSelect: '#log-level',
    resetConfigBtn: '#btn-reset-config',

    // ==========================================
    // FORMS & BUTTONS
    // ==========================================
    allSaveButtons: '.btn-save', // NodeList (getAll)
    allInputs: 'input[type="text"], input[type="password"], select', // NodeList (getAll)
    allCheckboxes: 'input[type="checkbox"]', // NodeList (getAll)
  };

  /**
   * Validar registro contra DOM (para debug)
   * @returns {object} Relatório de elementos encontrados/não encontrados
   */
  static validate() {
    const report = {
      total: Object.keys(this.registry).length,
      found: 0,
      missing: 0,
      details: {},
    };

    Object.entries(this.registry).forEach(([key, selector]) => {
      const exists = !!document.querySelector(selector);
      if (exists) {
        report.found++;
      } else {
        report.missing++;
        report.details[key] = `Não encontrado: ${selector}`;
      }
    });

    return report;
  }

  /**
   * Mostrar relatório de elementos no console
   */
  static showReport() {
    const report = this.validate();
    console.log('🔍 DOM-Registry Report:');
    console.log(`  Total: ${report.total}`);
    console.log(`  ✅ Encontrados: ${report.found}`);
    console.log(`  ❌ Faltantes: ${report.missing}`);

    if (report.missing > 0) {
      console.warn('Elementos faltantes:');
      Object.entries(report.details).forEach(([key, msg]) => {
        console.warn(`  • ${key}: ${msg}`);
      });
    }

    return report;
  }
}

/**
 * Exportar como global
 */
if (typeof globalThis !== 'undefined') {
  globalThis.DOM = DOMRegistry;
}

module.exports = DOMRegistry;
