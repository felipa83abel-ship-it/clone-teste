/**
 * HomeManager - Gerencia interface do HOME
 *
 * Responsabilidades:
 *   - Botão de toggle mock mode
 *   - Botão de reset home
 *   - Listeners de botões de ação (listen, ask llm)
 *   - VU meters do home
 */
class HomeManager {
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
    this.#initMockToggle();
    this.#initResetHomeButton();
    this.#initActionButtonListeners();
    await this.restoreState();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    // TODO: Implementar
    console.log(`[HomeManager] restoreState`);
  }

  /**
   * Reseta tudo (mock toggle, reset button)
   */
  async reset() {
    const mockToggle = document.getElementById('mockToggle');
    if (mockToggle) {
      mockToggle.checked = false;
    }
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  // (Métodos específicos do HOME podem ser adicionados aqui)

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listener do mock toggle
   */
  #initMockToggle() {
    // TODO: Implementar
    console.log(`[HomeManager] #initMockToggle`);
  }

  /**
   * Registra listener do botão reset home
   */
  #initResetHomeButton() {
    // TODO: Implementar
    console.log(`[HomeManager] #initResetHomeButton`);
  }

  /**
   * Registra listeners dos botões de ação (listen, ask)
   */
  #initActionButtonListeners() {
    // TODO: Implementar
    console.log(`[HomeManager] #initActionButtonListeners`);
  }
}
