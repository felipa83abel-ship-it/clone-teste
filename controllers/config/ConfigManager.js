// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/// <reference path="../../types/globals.d.ts" />
/* global Logger, _ipc, ApiKeyManager, AudioDeviceManager, ModelSelectionManager, ScreenConfigManager, PrivacyConfigManager, WindowConfigManager, HomeManager */

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
    Logger.debug('Início da função: "loadConfig"');
    try {
      const defaultConfig = this.getDefaultConfig();
      const saved = localStorage.getItem('appConfig');
        `🔍 localStorage.getItem('appConfig'): ${saved ? 'ENCONTRADO (' + saved.length + ' bytes)' : 'NÃO ENCONTRADO'}`
      );

      if (saved) {
        const parsed = JSON.parse(saved);

        // Merge profundo para preservar estados salvos
        const merged = { ...defaultConfig };
        if (parsed.api) {
          merged.api = { ...defaultConfig.api, ...parsed.api };
          Object.keys(defaultConfig.api).forEach((provider) => {
            if (parsed.api[provider] && typeof parsed.api[provider] === 'object') {
              merged.api[provider] = {
                ...defaultConfig.api[provider],
                ...parsed.api[provider],
              };
            }
          });
        }
        if (parsed.audio) merged.audio = { ...defaultConfig.audio, ...parsed.audio };
        if (parsed.screen) merged.screen = { ...defaultConfig.screen, ...parsed.screen };
        if (parsed.privacy) merged.privacy = { ...defaultConfig.privacy, ...parsed.privacy };
        if (parsed.other) merged.other = { ...defaultConfig.other, ...parsed.other };

        Logger.debug('Fim da função: "loadConfig"');
        return merged;
      }

      Logger.debug('Fim da função: "loadConfig"');
      return defaultConfig;
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Salva configuração no localStorage
   * @param {boolean} showFeedback - Se deve mostrar feedback visual
   */
  saveConfig(showFeedback = true) {
    Logger.debug('Início da função: "saveConfig"');
    try {
      const configStr = JSON.stringify(this.config);
      localStorage.setItem('appConfig', configStr);
      if (showFeedback) {
        this.showSaveFeedback();
      }
    } catch (error) {
      console.error('❌ Erro ao salvar configurações:', error);
      this.showError('Erro ao salvar configurações');
    }
    Logger.debug('Fim da função: "saveConfig"');
  }

  /**
   * Inicializa todos os managers e listeners
   */
  async initializeController() {

    try {
      // Cria instância do ApiKeyManager
      this.apiKeyManager = new ApiKeyManager(this, _ipc, globalThis.eventBus);
      await this.apiKeyManager.initialize();

      // Cria instância do AudioDeviceManager
      this.audioManager = new AudioDeviceManager(
        this,
        _ipc,
        globalThis.eventBus,
        globalThis.RendererAPI
      );
      await this.audioManager.initialize();

      // Cria instância do ModelSelectionManager
      this.modelManager = new ModelSelectionManager(
        this,
        _ipc,
        globalThis.eventBus,
        this.apiKeyManager
      );
      await this.modelManager.initialize();

      // Cria instância do ScreenConfigManager
      this.screenManager = new ScreenConfigManager(this, _ipc, globalThis.eventBus);
      await this.screenManager.initialize();

      // Cria instância do PrivacyConfigManager
      this.privacyManager = new PrivacyConfigManager(this, _ipc, globalThis.eventBus);
      await this.privacyManager.initialize();

      // Cria instância do WindowConfigManager
      this.windowManager = new WindowConfigManager(this, _ipc, globalThis.eventBus);
      await this.windowManager.initialize();

      // Cria instância do HomeManager
      this.homeManager = new HomeManager(this, _ipc, globalThis.eventBus);
      await this.homeManager.initialize();

    } catch (error) {
      console.error('❌ Erro ao inicializar managers:', error);
      throw error;
    }
  }

  /**
   * Reseta todas as configurações para padrão
   */
  async resetConfig() {

    // TODO: Chamar reset() em cada manager
    // await this.apiKeyManager.reset()
    // await this.audioManager.reset()
    // ... etc

    this.config = this.getDefaultConfig();
    this.saveConfig();
  }

  // ==========================================
  // MÉTODOS DE CONFIGURAÇÃO
  // ==========================================

  /**
   * Retorna configuração padrão
   */
  getDefaultConfig() {
    Logger.debug('Início da função: "getDefaultConfig"');
    Logger.debug('Fim da função: "getDefaultConfig"');
    return {
      api: {
        activeProvider: 'openai',
        openai: {
          selectedSTTModel: 'vosk',
          selectedLLMModel: 'gpt-4o-mini',
          enabled: true,
        },
        google: {
          selectedSTTModel: 'vosk',
          selectedLLMModel: 'gemini-pro',
          enabled: false,
        },
        openrouter: {
          selectedSTTModel: 'vosk',
          selectedLLMModel: '',
          enabled: false,
        },
      },
      audio: {
        inputDevice: '',
        outputDevice: '',
        autoDetect: true,
      },
      screen: {
        screenshotHotkey: 'Ctrl+Shift+S',
        excludeAppFromScreenshot: true,
        imageFormat: 'png',
      },
      privacy: {
        hideFromScreenCapture: false,
        disableTelemetry: false,
        autoClearData: false,
        dataRetentionDays: 7,
      },
      other: {
        language: 'pt-BR',
        theme: 'dark',
        autoUpdate: true,
        logLevel: 'info',
        darkMode: true,
        interviewMode: 'INTERVIEW',
        overlayOpacity: 0.75,
      },
    };
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
  }

  /**
   * Registra callbacks do renderer (EventBus listeners)
   */
  registerRendererCallbacks() {
    // TODO: Implementar - mover de config-manager.js original
  }

  /**
   * Registra listeners de DOM (menu, tabs, etc)
   */
  registerDOMEventListeners() {
    // TODO: Implementar - mover de config-manager.js original
  }

  /**
   * Registra listeners de IPC
   */
  registerIPCListeners() {
    // TODO: Implementar - mover de config-manager.js original
  }

  /**
   * Registra error handlers globais
   */
  registerErrorHandlers() {
    // TODO: Implementar - mover de config-manager.js original
  }

  // ==========================================
  // UTILITÁRIOS
  // ==========================================

  /**
   * Mostra feedback visual de salvamento
   * @param {string} message - Mensagem custom (opcional)
   */
  showSaveFeedback(message = 'Configurações salvas com sucesso!') {
    Logger.debug('Início da função: "showSaveFeedback"');
    const feedback = document.createElement('div');
    feedback.className = 'save-feedback';
    feedback.innerHTML = `
      <span class="material-icons">check_circle</span>
      ${message}
    `;
    document.body.appendChild(feedback);

    setTimeout(() => {
      feedback.remove();
    }, 3000);

    Logger.debug('Fim da função: "showSaveFeedback"');
  }

  /**
   * Mostra erro visual
   * @param {string} message - Mensagem de erro
   */
  showError(message) {
    Logger.debug('Início da função: "showError"');
    const error = document.createElement('div');
    error.className = 'save-feedback';
    error.style.background = '#dc3545';
    error.innerHTML = `
      <span class="material-icons">error</span>
      ${message}
    `;
    document.body.appendChild(error);

    setTimeout(() => {
      error.remove();
    }, 3000);

    Logger.debug('Fim da função: "showError"');
  }
}

// ==========================================
// INICIALIZAÇÃO NO DOMContentLoaded
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {

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

});
