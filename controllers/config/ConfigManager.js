/**
 * ConfigManager - Orquestrador Central de Configurações
 *
 * Responsabilidades:
 *   - Carregar/salvar configuração do localStorage
 *   - Inicializar todos os managers
 *   - Coordenar reset de configuração
 *   - Expor globalThis.configManager
 *
 * Este é o ponto de entrada para toda a lógica de configuração.
 * Cada manager cuida de sua funcionalidade específica.
 */
class ConfigManager {
  constructor() {
    console.log('🔧 ConfigManager iniciando...');

    // Carrega config do localStorage
    this.config = this.loadConfig();

    // Inicializa os 7 managers
    this.apiKeyManager = null; // Será inicializado em initialize()
    this.audioManager = null;
    this.modelManager = null;
    this.screenManager = null;
    this.privacyManager = null;
    this.windowManager = null;
    this.homeManager = null;
  }

  // ==========================================
  // MÉTODOS PRINCIPAIS
  // ==========================================

  /**
   * Carrega configuração do localStorage
   * @returns {object} Config carregada ou padrão
   */
  loadConfig() {
    // TODO: Implementar - mover de config-manager.js original
    console.log('📂 ConfigManager.loadConfig()');
    return {};
  }

  /**
   * Salva configuração no localStorage
   * @param {boolean} showFeedback - Se deve mostrar feedback visual
   */
  saveConfig(showFeedback = true) {
    // TODO: Implementar - mover de config-manager.js original
    console.log('💾 ConfigManager.saveConfig()');
  }

  /**
   * Inicializa todos os managers e listeners
   */
  async initializeController() {
    console.log('🚀 ConfigManager.initializeController() - Inicializando managers...');

    // TODO: Criar instâncias dos managers
    // this.apiKeyManager = new ApiKeyManager(this, _ipc, eventBus)
    // this.audioManager = new AudioDeviceManager(this, _ipc, eventBus, rendererAPI)
    // ... etc

    // TODO: Chamar initialize() em cada manager
    // await this.apiKeyManager.initialize()
    // await this.audioManager.initialize()
    // ... etc

    // TODO: Mover resto da lógica de inicialização
    console.log('✅ Todos os managers inicializados');
  }

  /**
   * Reseta todas as configurações para padrão
   */
  async resetConfig() {
    console.log('🔄 ConfigManager.resetConfig() - Resetando tudo...');

    // TODO: Chamar reset() em cada manager
    // await this.apiKeyManager.reset()
    // await this.audioManager.reset()
    // ... etc

    this.config = this.getDefaultConfig();
    this.saveConfig();
    console.log('✅ Configurações resetadas');
  }

  // ==========================================
  // MÉTODOS DE CONFIGURAÇÃO
  // ==========================================

  /**
   * Retorna configuração padrão
   */
  getDefaultConfig() {
    // TODO: Implementar - mover de config-manager.js original
    return {};
  }

  /**
   * Acessa valor de config por caminho (ex: 'api.openai.enabled')
   * @param {string} keyPath - Caminho com pontos
   * @returns {*} Valor encontrado
   */
  get(keyPath) {
    return keyPath.split('.').reduce((o, k) => o?.[k], this.config);
  }

  /**
   * Define valor de config por caminho
   * @param {string} keyPath - Caminho com pontos
   * @param {*} value - Valor a definir
   */
  set(keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const lastObj = keys.reduce((o, k) => (o[k] = o[k] || {}), this.config);
    lastObj[lastKey] = value;
    this.saveConfig();
  }

  // ==========================================
  // MÉTODOS UI (A MOVER DO ORIGINAL)
  // ==========================================

  /**
   * Registra elementos UI para acesso em renderer.js
   */
  registerUIElements() {
    // TODO: Implementar - mover de config-manager.js original
    console.log('📋 ConfigManager.registerUIElements()');
  }

  /**
   * Registra callbacks do renderer (EventBus listeners)
   */
  registerRendererCallbacks() {
    // TODO: Implementar - mover de config-manager.js original
    console.log('📡 ConfigManager.registerRendererCallbacks()');
  }

  /**
   * Registra listeners de DOM (menu, tabs, etc)
   */
  registerDOMEventListeners() {
    // TODO: Implementar - mover de config-manager.js original
    console.log('🖱️  ConfigManager.registerDOMEventListeners()');
  }

  /**
   * Registra listeners de IPC
   */
  registerIPCListeners() {
    // TODO: Implementar - mover de config-manager.js original
    console.log('🔌 ConfigManager.registerIPCListeners()');
  }

  /**
   * Registra error handlers globais
   */
  registerErrorHandlers() {
    // TODO: Implementar - mover de config-manager.js original
    console.log('⚠️  ConfigManager.registerErrorHandlers()');
  }

  // ==========================================
  // UTILITÁRIOS
  // ==========================================

  /**
   * Mostra feedback visual de salvamento
   * @param {string} message - Mensagem custom (opcional)
   */
  showSaveFeedback(message) {
    // TODO: Implementar - mover de config-manager.js original
    console.log('✅ ' + (message || 'Configurações salvas com sucesso!'));
  }

  /**
   * Mostra erro visual
   * @param {string} message - Mensagem de erro
   */
  showError(message) {
    // TODO: Implementar - mover de config-manager.js original
    console.error('❌ ' + message);
  }
}

// ==========================================
// INICIALIZAÇÃO NO DOMContentLoaded
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('📖 DOMContentLoaded - Inicializando ConfigManager...');

  // Aguarda RendererAPI estar disponível
  let attempts = 0;
  while (!globalThis.RendererAPI && attempts < 50) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts++;
  }

  if (!globalThis.RendererAPI) {
    console.error('❌ RendererAPI não foi carregado após timeout');
    return;
  }

  // Cria e inicializa ConfigManager
  globalThis.configManager = new ConfigManager();
  await globalThis.configManager.initializeController();

  console.log('✅ ConfigManager inicializado com sucesso');
});
