// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * ScreenConfigManager - Gerencia configurações de captura de tela
 *
 * Responsabilidades:
 *   - Registrar hotkey para screenshot
 *   - Gerenciar opções de exclusão do app
 *   - Gerenciar formato de imagem
 *   - Gravação de atalho customizado
 *
 * Interações:
 *   - DOM: hotkey input, format select, exclude checkbox, record button, clear button
 *   - ConfigManager: salvar/restaurar estado
 *   - RendererAPI: clearScreenshots()
 *   - EventBus: SCREENSHOT_CONFIG_CHANGED, SCREENSHOTS_CLEARED events
 */
class ScreenConfigManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;
    this.isRecording = false;

  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    await this.restoreState();
    this.#initScreenConfigListeners();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    Logger.debug('Início da função: "restoreState"');
    this.restoreScreenConfig();
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    const hotkeyInput = document.getElementById('screenshot-hotkey');
    const formatSelect = document.getElementById('screenshot-format');
    const excludeCheckbox = document.getElementById('exclude-app-from-screenshot');

    if (hotkeyInput) {
      hotkeyInput.value = 'Ctrl+Shift+S';
      this.configManager.config.screen.screenshotHotkey = 'Ctrl+Shift+S';
    }
    if (formatSelect) {
      formatSelect.value = 'png';
      this.configManager.config.screen.imageFormat = 'png';
    }
    if (excludeCheckbox) {
      excludeCheckbox.checked = true;
      this.configManager.config.screen.excludeAppFromScreenshot = true;
    }

    this.configManager.saveConfig(false);
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Restaura configurações de screenshot salvas
   */
  restoreScreenConfig() {
    Logger.debug('Início da função: "restoreScreenConfig"');

    // Restaurar hotkey
    const hotkeyInput = document.getElementById('screenshot-hotkey');
    if (hotkeyInput) {
      hotkeyInput.value = this.configManager.config.screen?.screenshotHotkey || 'Ctrl+Shift+S';
    } else {
      console.warn('   ⚠️ Input screenshot-hotkey não encontrado no DOM');
    }

    // Restaurar formato
    const formatSelect = document.getElementById('screenshot-format');
    if (formatSelect) {
      formatSelect.value = this.configManager.config.screen?.imageFormat || 'png';
    } else {
      console.warn('   ⚠️ Select screenshot-format não encontrado no DOM');
    }

    // Restaurar checkbox de exclusão
    const excludeCheckbox = document.getElementById('exclude-app-from-screenshot');
    if (excludeCheckbox) {
      excludeCheckbox.checked =
        this.configManager.config.screen?.excludeAppFromScreenshot !== false;
    } else {
      console.warn('   ⚠️ Checkbox exclude-app-from-screenshot não encontrado no DOM');
    }

    Logger.debug('Fim da função: "restoreScreenConfig"');
  }

  /**
   * Inicia gravação de novo hotkey
   * @param {HTMLElement} button - Botão que disparou
   */
  recordHotkey(button) {
    Logger.debug('Início da função: "recordHotkey"');

    if (this.isRecording) {
      console.warn('   ⚠️ Já está gravando um hotkey');
      return;
    }

    this.isRecording = true;
    button.classList.add('recording');
    button.textContent = 'Pressione uma tecla...';

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      if (e.metaKey) keys.push('Cmd');

      // Adiciona a tecla principal (excluindo modificadoras)
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        keys.push(e.key.toUpperCase());
      }

      const hotkey = keys.join('+');

      // Atualiza DOM e config
      const hotkeyInput = document.getElementById('screenshot-hotkey');
      if (hotkeyInput) {
        hotkeyInput.value = hotkey;
        this.configManager.config.screen.screenshotHotkey = hotkey;
      }

      // Salva
      this.configManager.saveConfig();
      this.configManager.showSaveFeedback(`Hotkey gravado: ${hotkey}`);

      // Remove listener
      button.classList.remove('recording');
      button.textContent = 'Gravar Atalho';
      this.isRecording = false;
      globalThis.removeEventListener('keydown', handleKeyDown);

      this.eventBus.emit('SCREENSHOT_CONFIG_CHANGED', { field: 'hotkey', value: hotkey });
    };

    globalThis.addEventListener('keydown', handleKeyDown);

    Logger.debug('Fim da função: "recordHotkey"');
  }

  /**
   * Salva campo de screenshot
   * @param {string} field - Campo a salvar (screenshotHotkey, imageFormat, excludeAppFromScreenshot)
   * @param {*} value - Novo valor
   */
  saveScreenField(field, value) {
    Logger.debug('Início da função: "saveScreenField"');

    if (field === 'screenshot-hotkey') {
      this.configManager.config.screen.screenshotHotkey = value;
    } else if (field === 'screenshot-format') {
      this.configManager.config.screen.imageFormat = value;
    } else if (field === 'exclude-app-from-screenshot') {
      this.configManager.config.screen.excludeAppFromScreenshot = value;
    }

    this.configManager.saveConfig();
    this.eventBus.emit('SCREENSHOT_CONFIG_CHANGED', { field, value });

    Logger.debug('Fim da função: "saveScreenField"');
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em elementos de screenshot
   */
  #initScreenConfigListeners() {

    // Listener para botão de gravação de hotkey
    const recordHotkeyBtn = document.getElementById('recordHotkeyBtn');
    if (recordHotkeyBtn) {
      recordHotkeyBtn.addEventListener('click', () => {
        this.recordHotkey(recordHotkeyBtn);
      });
    } else {
      console.warn('   ⚠️ Botão recordHotkeyBtn não encontrado');
    }

    // Listener para mudança de formato
    const formatSelect = document.getElementById('screenshot-format');
    if (formatSelect) {
      formatSelect.addEventListener('change', (e) => {
        this.saveScreenField('screenshot-format', e.target.value);
      });
    } else {
      console.warn('   ⚠️ Select screenshot-format não encontrado');
    }

    // Listener para checkbox de exclusão
    const excludeCheckbox = document.getElementById('exclude-app-from-screenshot');
    if (excludeCheckbox) {
      excludeCheckbox.addEventListener('change', (e) => {
        this.saveScreenField('exclude-app-from-screenshot', e.target.checked);
      });
    } else {
      console.warn('   ⚠️ Checkbox exclude-app-from-screenshot não encontrado');
    }

    // Listener para botão de limpar screenshots (se existir)
    const clearScreenshotsBtn = document.getElementById('clearScreenshotsBtn');
    if (clearScreenshotsBtn) {
      clearScreenshotsBtn.addEventListener('click', () => {
        if (!globalThis.RendererAPI?.clearScreenshots) {
          console.warn('   ⚠️ RendererAPI.clearScreenshots não disponível');
          return;
        }

        const count = globalThis.RendererAPI.getScreenshotCount?.() || 0;
        if (count === 0) {
          return;
        }

        const confirmed = confirm(`Deseja limpar ${count} screenshot(s)?`);
        if (confirmed) {
          globalThis.RendererAPI.clearScreenshots();
          this.eventBus.emit('SCREENSHOTS_CLEARED', { count });
        }
      });
    } else {
      console.warn('   ⚠️ Botão clearScreenshotsBtn não encontrado');
    }
  }
}

module.exports = ScreenConfigManager;
