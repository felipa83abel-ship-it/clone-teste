/**
 * ModelSelectionManager - Gerencia seleção de modelos STT/LLM
 *
 * Responsabilidades:
 *   - Alternar entre modelos (OpenAI, Google, OpenRouter)
 *   - Restaurar seleção de STT e LLM salvos
 *   - Validar que apenas 1 modelo está ativo
 *   - Atualizar UI de status dos modelos
 */
class ModelSelectionManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   * @param {ApiKeyManager} apiKeyManager - Manager de API keys
   */
  constructor(configManager, ipc, eventBus, apiKeyManager) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;
    this.apiKeyManager = apiKeyManager;
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    this.#initModelToggleListeners();
    this.#initModelSelectListeners();
    await this.restoreState();
  }

  /**
   * Restaura estado salvo (modelos selecionados)
   */
  async restoreState() {
    this.restoreSTTLLMModels();
    this.updateUI();
  }

  /**
   * Reseta tudo (desativa todos os modelos)
   */
  async reset() {
    const providers = ['openai', 'google', 'openrouter'];
    for (const provider of providers) {
      if (this.configManager.config.api[provider]) {
        this.configManager.config.api[provider].enabled = false;
      }
    }
    this.updateUI();
    this.configManager.saveConfig();
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Alterna ativação/desativação de um modelo
   * @param {string} model - Provider (openai, google, openrouter)
   */
  async toggleModel(model) {
    // TODO: Implementar
    console.log(`[ModelSelectionManager] toggleModel - model: ${model}`);
  }

  /**
   * Restaura modelos STT e LLM salvos
   */
  restoreSTTLLMModels() {
    // TODO: Implementar
    console.log(`[ModelSelectionManager] restoreSTTLLMModels`);
  }

  /**
   * Atualiza UI de status dos modelos
   */
  updateUI() {
    // TODO: Implementar
    console.log(`[ModelSelectionManager] updateUI`);
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em botões de ativar/desativar modelos
   */
  #initModelToggleListeners() {
    // TODO: Implementar
    console.log(`[ModelSelectionManager] #initModelToggleListeners`);
  }

  /**
   * Registra listeners em selects de STT/LLM
   */
  #initModelSelectListeners() {
    // TODO: Implementar
    console.log(`[ModelSelectionManager] #initModelSelectListeners`);
  }
}
