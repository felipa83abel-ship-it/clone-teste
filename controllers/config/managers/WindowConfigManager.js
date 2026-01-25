// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * WindowConfigManager - Gerencia configurações de janela
 *
 * Responsabilidades:
 *   - Dark mode toggle
 *   - Interview mode selection
 *   - Overlay opacity control
 *   - Drag handle initialization
 *
 * Interações:
 *   - DOM: darkModeToggle, interviewModeSelect, opacityRange, dragHandle
 *   - ConfigManager: salvar/restaurar estado
 *   - CSS: aplicar classe dark-mode
 *   - RendererAPI: setWindowOpacity(), startWindowDrag()
 *   - EventBus: WINDOW_CONFIG_CHANGED event
 */
class WindowConfigManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;

    console.log('🪟 WindowConfigManager criado');
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    console.log('🚀 WindowConfigManager.initialize()');
    await this.restoreState();
    this.#initWindowListeners();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    Logger.debug('Início da função: "restoreState"');
    console.log('📂 WindowConfigManager.restoreState()');
    this.restoreUserPreferences();
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    console.log('🔄 WindowConfigManager.reset()');
    this.configManager.config.other.darkMode = true;
    this.configManager.config.other.interviewMode = 'INTERVIEW';
    this.configManager.config.other.overlayOpacity = 0.75;
    this.configManager.saveConfig(false);
    await this.restoreState();
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Restaura preferências de janela salvas
   */
  restoreUserPreferences() {
    Logger.debug('Início da função: "restoreUserPreferences"');
    console.log('🔄 RESTAURANDO PREFERÊNCIAS DA JANELA...');

    // 1️⃣ Restaurar Dark Mode
    const darkModeToggle = document.getElementById('darkModeToggle');
    const savedDarkMode = this.configManager.config.other?.darkMode ?? false;
    if (darkModeToggle) {
      darkModeToggle.checked = savedDarkMode;
      if (savedDarkMode) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
      console.log(`   ✅ Dark Mode restaurado: ${savedDarkMode ? 'ATIVADO' : 'DESATIVADO'}`);
    } else {
      console.warn('   ⚠️ darkModeToggle não encontrado no DOM');
    }

    // 2️⃣ Restaurar Interview Mode
    const interviewModeSelect = document.getElementById('interviewModeSelect');
    const savedInterviewMode = this.configManager.config.other?.interviewMode ?? 'INTERVIEW';
    if (interviewModeSelect) {
      interviewModeSelect.value = savedInterviewMode;
      console.log(`   ✅ Interview Mode restaurado: ${savedInterviewMode}`);
    } else {
      console.warn('   ⚠️ interviewModeSelect não encontrado no DOM');
    }

    // 3️⃣ Restaurar Opacity
    const opacityRange = document.getElementById('opacityRange');
    const savedOpacity = this.configManager.config.other?.overlayOpacity ?? 0.75;
    if (opacityRange) {
      opacityRange.value = savedOpacity;
      this.applyOpacity(savedOpacity);
      console.log(`   ✅ Opacidade restaurada: ${savedOpacity}`);
    } else {
      console.warn('   ⚠️ opacityRange não encontrado no DOM');
    }

    // 4️⃣ Inicializar drag handle
    const dragHandle = document.getElementById('dragHandle');
    if (dragHandle) {
      this.initDragHandle(dragHandle);
      console.log(`   ✅ Drag handle inicializado`);
    } else {
      console.warn('   ⚠️ dragHandle não encontrado no DOM');
    }

    console.log('✅ Preferências restauradas');
    Logger.debug('Fim da função: "restoreUserPreferences"');
  }

  /**
   * Aplica opacidade na janela
   * @param {number} opacity - Valor de 0 a 1
   */
  applyOpacity(opacity) {
    console.log(`🎨 Aplicando opacidade: ${opacity}`);
    const opacityValue = parseFloat(opacity);

    // Aplicar CSS na janela
    if (globalThis.RendererAPI?.setWindowOpacity) {
      globalThis.RendererAPI.setWindowOpacity(opacityValue).catch((err) => {
        console.error('❌ Erro ao definir opacidade:', err);
      });
    }

    this.configManager.config.other.overlayOpacity = opacityValue;
  }

  /**
   * Inicializa drag handle da janela
   * @param {HTMLElement} dragHandle - Elemento para arrastar
   */
  initDragHandle(dragHandle) {
    console.log('🖱️ Inicializando drag handle...');

    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();

      if (!globalThis.RendererAPI?.startWindowDrag) {
        console.warn('⚠️ RendererAPI.startWindowDrag não disponível');
        return;
      }

      globalThis.RendererAPI.startWindowDrag().catch((err) => {
        console.error('❌ Erro ao iniciar drag:', err);
      });
    });

    console.log('✅ Drag handle inicializado');
  }

  /**
   * Salva campo de janela
   * @param {string} field - Campo a salvar
   * @param {*} value - Novo valor
   */
  saveWindowField(field, value) {
    Logger.debug('Início da função: "saveWindowField"');
    console.log(`💾 Salvando ${field}: ${value}`);

    if (field === 'darkModeToggle') {
      this.configManager.config.other.darkMode = value;
      if (value) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    } else if (field === 'interviewModeSelect') {
      this.configManager.config.other.interviewMode = value;
    } else if (field === 'opacityRange') {
      this.applyOpacity(value);
    }

    this.configManager.saveConfig();
    this.eventBus.emit('WINDOW_CONFIG_CHANGED', { field, value });

    console.log(`   ✅ Campo ${field} salvo`);
    Logger.debug('Fim da função: "saveWindowField"');
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em elementos de janela
   */
  #initWindowListeners() {
    console.log('🎯 WindowConfigManager.#initWindowListeners()');

    // Listener para dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', (e) => {
        this.saveWindowField('darkModeToggle', e.target.checked);
        console.log(`   📝 Dark Mode: ${e.target.checked ? 'Ativado' : 'Desativado'}`);
      });
      console.log('   ✅ Listener para darkModeToggle registrado');
    } else {
      console.warn('   ⚠️ darkModeToggle não encontrado');
    }

    // Listener para interview mode select
    const interviewModeSelect = document.getElementById('interviewModeSelect');
    if (interviewModeSelect) {
      interviewModeSelect.addEventListener('change', (e) => {
        this.saveWindowField('interviewModeSelect', e.target.value);
        console.log(`   📝 Interview Mode alterado: ${e.target.value}`);
      });
      console.log('   ✅ Listener para interviewModeSelect registrado');
    } else {
      console.warn('   ⚠️ interviewModeSelect não encontrado');
    }

    // Listener para opacity range
    const opacityRange = document.getElementById('opacityRange');
    if (opacityRange) {
      opacityRange.addEventListener('input', (e) => {
        this.saveWindowField('opacityRange', e.target.value);
        console.log(`   📝 Opacidade alterada: ${e.target.value}`);
      });
      console.log('   ✅ Listener para opacityRange registrado');
    } else {
      console.warn('   ⚠️ opacityRange não encontrado');
    }
  }

  /**
   * Inicializa click-through controller
   */
  async initClickThroughController() {
    // TODO: Implementar se necessário
  }

  /**
   * Restaura tema (dark mode)
   */
  restoreTheme() {
    // Implementado em restoreUserPreferences()
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================
}

module.exports = WindowConfigManager;
