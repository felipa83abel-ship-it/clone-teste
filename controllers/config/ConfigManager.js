// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/// <reference path="../../types/globals.d.ts" />
/* global Logger, _ipc, ApiKeyManager, AudioDeviceManager, ModelSelectionManager, ScreenConfigManager, PrivacyConfigManager, WindowUIManager, HomeUIManager, TopBarManager, OtherConfigManager, InfoManager */

/**
 * ConfigManager - Orquestrador Central de Configurações
 *
 * Responsabilidades:
 *   - Carregar/salvar configuração do localStorage
 *   - Inicializar todos os managers das seções
 *   - Coordenar reset de configuração
 *   - Expor globalThis.configManager
 *
 * Este é o ponto de entrada para toda a lógica de configuração.
 * Cada manager de seção cuida de sua funcionalidade específica.
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
    Logger.debug('Início da função: "loadConfig"');
    console.log('📂 INICIANDO CARREGAMENTO DE CONFIG...');
    try {
      const defaultConfig = this.getDefaultConfig();
      const saved = localStorage.getItem('appConfig');
      console.log(
        `🔍 localStorage.getItem('appConfig'): ${saved ? 'ENCONTRADO (' + saved.length + ' bytes)' : 'NÃO ENCONTRADO'}`
      );

      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('📂 Configurações encontradas no localStorage');

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

        console.log('📊 CONFIG MERGED - other section:');
        console.log(
          '   defaultConfig.other.clickThroughEnabled:',
          defaultConfig.other.clickThroughEnabled
        );
        console.log('   parsed.other:', parsed.other);
        console.log(
          '   merged.other.clickThroughEnabled (FORÇADO PARA FALSE):',
          merged.other.clickThroughEnabled
        );

        console.log('✅ Configurações carregadas do localStorage');
        Logger.debug('Fim da função: "loadConfig"');
        return merged;
      }

      console.log('✅ Configurações default carregadas');
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
      console.log('💾 Configurações salvas com sucesso');
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
    console.log('🚀 ConfigManager.initializeController() - Inicializando managers...');

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

      // Cria instância do WindowUIManager
      this.windowManager = new WindowUIManager(this, _ipc, globalThis.eventBus);
      await this.windowManager.initialize();

      // Cria instância do HomeUIManager
      this.homeManager = new HomeUIManager(this, _ipc, globalThis.eventBus);
      await this.homeManager.initialize();

      // Cria instância do TopBarManager
      this.topBarManager = new TopBarManager(this, _ipc, globalThis.eventBus);
      await this.topBarManager.initialize();

      // Cria instância do OtherConfigManager
      this.otherManager = new OtherConfigManager(this, _ipc, globalThis.eventBus);
      await this.otherManager.initialize();

      // Cria instância do InfoManager
      this.infoManager = new InfoManager(this, _ipc, globalThis.eventBus);
      await this.infoManager.initialize();

      // Registrar listeners dos botões de salvar
      this.#initSaveConfigButtons();

      // Registrar listener do botão reset config
      this.#initResetConfigButton();

      console.log('✅ Todos os managers inicializados');
    } catch (error) {
      console.error('❌ Erro ao inicializar managers:', error);
      throw error;
    }
  }

  /**
   * Inicializa todos os managers de forma orquestrada
   */
  async initializeAllManagers() {
    console.log('🎯 ConfigManager.initializeAllManagers() - Orquestração de managers');

    const managers = [
      { name: 'ApiKeyManager', instance: this.apiKeyManager },
      { name: 'AudioDeviceManager', instance: this.audioManager },
      { name: 'ModelSelectionManager', instance: this.modelManager },
      { name: 'ScreenConfigManager', instance: this.screenManager },
      { name: 'PrivacyConfigManager', instance: this.privacyManager },
      { name: 'WindowUIManager', instance: this.windowManager },
      { name: 'HomeUIManager', instance: this.homeManager },
      { name: 'TopBarManager', instance: this.topBarManager },
      { name: 'OtherConfigManager', instance: this.otherManager },
      { name: 'InfoManager', instance: this.infoManager },
    ];

    for (const { name, instance } of managers) {
      if (!instance) {
        console.warn(`⚠️ ${name} não foi inicializado`);
        continue;
      }
      if (typeof instance.initialize !== 'function') {
        console.warn(`⚠️ ${name} não tem método initialize()`);
        continue;
      }
      console.log(`  📌 Inicializando ${name}...`);
      await instance.initialize();
      console.log(`  ✅ ${name} inicializado`);
    }
    console.log('✅ Orquestração de managers completa');
  }

  /**
   * Reseta todas as configurações para padrão
   */
  async resetConfig() {
    console.log('🔄 ConfigManager.resetConfig() - Resetando tudo...');

    // Chamar reset() em cada manager
    await this.apiKeyManager?.reset();
    await this.audioManager?.reset();
    await this.modelManager?.reset();
    await this.screenManager?.reset();
    await this.privacyManager?.reset();
    await this.windowManager?.reset();
    await this.homeManager?.reset();
    await this.topBarManager?.reset();
    await this.otherManager?.reset();
    await this.infoManager?.reset();

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
    Logger.debug('Início da função: "getDefaultConfig"');
    const config = {
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
        clickThroughEnabled: false,
      },
    };
    console.log('📋 DEFAULT CONFIG - other section:');
    console.log('   clickThroughEnabled:', config.other.clickThroughEnabled);
    Logger.debug('Fim da função: "getDefaultConfig"');
    return config;
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
    // Métodos do DOM já estão nos Managers
    console.log('📋 ConfigManager.registerUIElements()');
  }

  /**
   * Registra callbacks do renderer (EventBus listeners)
   */
  registerRendererCallbacks() {
    // Callbacks movidos para Managers individuais
    console.log('📡 ConfigManager.registerRendererCallbacks()');
  }

  /**
   * Registra listeners de DOM (menu, tabs, etc)
   */
  registerDOMEventListeners() {
    // Listeners de DOM estão em cada Manager (#initXxxListeners)
    console.log('🖱️  ConfigManager.registerDOMEventListeners()');
  }

  /**
   * Registra listeners de IPC
   */
  registerIPCListeners() {
    // IPC listeners gerenciados por main.js
    console.log('🔌 ConfigManager.registerIPCListeners()');
  }

  /**
   * Registra error handlers globais
   */
  registerErrorHandlers() {
    // Error handlers centralizados em ErrorHandler.js
    console.log('⚠️  ConfigManager.registerErrorHandlers()');
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

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Salva uma seção inteira de configurações (usado pelos botões "Salvar Configurações")
   * @param {string} section - Nome da seção (ex: 'openai', 'google', 'privacy')
   */
  async saveSection(section) {
    Logger.debug('Início da função: "saveSection"');
    const sectionElement =
      document.getElementById(section) ||
      document.querySelector(`[data-section="${section}"]`)?.closest('.tab-pane');

    if (sectionElement) {
      // Processa API key primeiro (se houver)
      const apiKeyInput = sectionElement.querySelector('.api-key-input');

      if (apiKeyInput?.id) {
        const provider = section; // 'openai', 'google', 'openrouter'
        const apiKey = apiKeyInput.value;

        console.log(`saveSection - provider: ${provider}`);
        console.log(`saveSection - input.value length: ${apiKey?.length || 0}`);

        // Só salva se não estiver mascarado E tiver conteúdo
        if (apiKey && !apiKey.includes('••••') && apiKey.trim().length > 0) {
          console.log(`Salvando nova chave para ${provider}...`);
          await this.apiKeyManager.saveApiKey(provider, apiKey);
        } else if (apiKey.includes('••••')) {
          console.log(`Chave mascarada detectada - mantendo chave existente`);
        } else {
          console.log(`Campo vazio - não salvando`);
        }
      }

      // Salva outros campos normalmente (exceto API key)
      sectionElement
        .querySelectorAll('input:not(.api-key-input), select, textarea')
        .forEach((input) => {
          if (input.id) {
            this.saveField(input.id, input.value);
          }
        });
    }

    this.saveConfig();

    Logger.debug('Fim da função: "saveSection"');
  }

  /**
   * Salva um campo individual
   * @param {string} fieldId - ID do campo
   * @param {*} value - Valor a salvar
   */
  saveField(fieldId, value) {
    Logger.debug(`Salvando campo: ${fieldId} = ${value}`);
    // Este método pode ser expandido conforme necessário
    // Por enquanto, apenas loga a operação
    console.log(`📝 Campo ${fieldId} = ${value}`);
  }

  /**
   * Inicializa listener do botão reset config
   */
  #initResetConfigButton() {
    Logger.debug('ConfigManager: #initResetConfigButton');
    const resetBtn = document.getElementById('btn-reset-config');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const confirmed = confirm(
          '⚠️ AVISO: Isso vai restaurar TODAS as configurações ao padrão (factory reset).\n\n' +
            'Dados que serão perdidos:\n' +
            '- API keys salvas\n' +
            '- Preferências de dispositivos de áudio\n' +
            '- Configurações de transcrição\n' +
            '- Tema e opacidade\n' +
            '- Todas as outras configurações\n\n' +
            'Tem certeza que deseja continuar?'
        );
        if (confirmed) {
          this.resetConfig()
            .then(() => {
              this.showSaveFeedback('✅ Configurações restauradas ao padrão com sucesso!');
              // Recarregar página para aplicar todas as mudanças
              setTimeout(() => {
                location.reload();
              }, 1500);
            })
            .catch((err) => {
              this.showError('Erro ao restaurar configurações');
              Logger.error('Erro ao resetar config:', err);
            });
        }
      });
      Logger.debug('ConfigManager: Listener btn-reset-config registrado');
    } else {
      Logger.warn('ConfigManager: btn-reset-config não encontrado no DOM');
    }
  }

  /**
   * Inicializa listeners dos botões "Salvar Configurações"
   */
  #initSaveConfigButtons() {
    Logger.debug('ConfigManager: #initSaveConfigButtons');
    document.querySelectorAll('.btn-save').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const section = e.currentTarget.dataset.section;
        console.log(`🔘 Botão salvar clicado para seção: ${section}`);
        this.saveSection(section);
      });
    });
    Logger.debug('ConfigManager: Listeners .btn-save registrados');
  }
}
