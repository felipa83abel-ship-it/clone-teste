/**
 * ScreenConfigManager - Gerencia configurações de captura de tela
 *
 * Responsabilidades:
 *   - Registrar hotkey para screenshot
 *   - Gerenciar opções de exclusão do app
 *   - Gerenciar formato de imagem
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
  }

  /**
   * Inicializa listeners
   */
  async initialize() {
    this.#initHotKeyListener();
    this.#initFormatListener();
    this.#initExcludeAppListener();
    await this.restoreState();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    // TODO: Implementar
    console.log(`[ScreenConfigManager] restoreState`);
  }

  /**
   * Reseta configurações padrão
   */
  async reset() {
    const hotkeyInput = document.getElementById('screenshot-hotkey');
    const formatSelect = document.getElementById('screenshot-format');
    const excludeCheckbox = document.getElementById('exclude-app-from-screenshot');

    if (hotkeyInput) hotkeyInput.value = 'Ctrl+Shift+S';
    if (formatSelect) formatSelect.value = 'png';
    if (excludeCheckbox) excludeCheckbox.checked = true;
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Inicia gravação de novo hotkey
   * @param {HTMLElement} button - Botão que disparou
   */
  recordHotkey(button) {
    // TODO: Implementar
    console.log(`[ScreenConfigManager] recordHotkey`);
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listener do botão de registrar hotkey
   */
  #initHotKeyListener() {
    // TODO: Implementar
    console.log(`[ScreenConfigManager] #initHotKeyListener`);
  }

  /**
   * Registra listener do select de formato
   */
  #initFormatListener() {
    // TODO: Implementar
    console.log(`[ScreenConfigManager] #initFormatListener`);
  }

  /**
   * Registra listener do checkbox de excluir app
   */
  #initExcludeAppListener() {
    // TODO: Implementar
    console.log(`[ScreenConfigManager] #initExcludeAppListener`);
  }
}
