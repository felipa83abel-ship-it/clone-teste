// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * OtherConfigManager - Gerencia configurações diversas
 *
 * Responsabilidades:
 *   - Dark mode toggle
 *   - Outras configurações gerais (futuras)
 */
class OtherConfigManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;

    console.log('⚙️ OtherConfigManager criado');
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    console.log('🚀 OtherConfigManager.initialize()');
    this.#initListeners();
    await this.restoreState();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    Logger.debug('OtherConfigManager.restoreState()');
    console.log('📂 OtherConfigManager.restoreState()');

    try {
      // Restaurar dark mode
      const isDarkMode = this.configManager.config.ui?.darkMode ?? false;
      this.#updateDarkModeUI(isDarkMode);

      // Restaurar outros estados (quando implementar)
    } catch (error) {
      Logger.error('Erro ao restaurar estado OtherConfig', error);
    }
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    console.log('🔄 OtherConfigManager.reset()');
    if (!this.configManager.config.ui) this.configManager.config.ui = {};
    this.configManager.config.ui.darkMode = false;
    this.#updateDarkModeUI(false);
  }

  /**
   * Registra listeners de eventos do EventBus
   * ⚠️ CRÍTICO: Deve ser chamado ANTES de #initElements
   */
  #initListeners() {
    console.log('📡 OtherConfigManager #initListeners');

    // Listener para sincronizar dark mode
    this.eventBus.on('darkModeToggled', (data) => {
      const enabled = data?.enabled ?? false;
      this.#updateDarkModeUI(enabled);
      console.log('✨ darkModeToggled recebido:', enabled);
    });
  }

  /**
   * Inicializa elementos DOM e seus listeners
   * ⚠️ CRÍTICO: Chamado DEPOIS de #initListeners
   */
  #initElements() {
    console.log('🎨 OtherConfigManager #initElements');

    const darkModeToggle = document.getElementById('darkModeToggle');

    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        console.log('🌙 darkModeToggle changed:', enabled);

        // Salvar estado
        if (!this.configManager.config.ui) this.configManager.config.ui = {};
        this.configManager.config.ui.darkMode = enabled;

        // Emitir para sincronizar
        this.eventBus.emit('darkModeToggled', { enabled });
      });
    }
  }

  /**
   * Atualiza toggle de dark mode (UI)
   */
  #updateDarkModeUI(enabled) {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.checked = enabled;
      document.documentElement.classList.toggle('dark-mode', enabled);
      console.log('💾 Dark mode atualizado:', enabled ? 'ativado' : 'desativado');
    }
  }
}

// Exportar para globalThis (padrão do projeto)
if (typeof globalThis !== 'undefined') {
  globalThis.OtherConfigManager = OtherConfigManager;
}
