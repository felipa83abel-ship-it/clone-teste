// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger, DOM */

/**
 * InfoManager - Gerencia seção de informações
 *
 * Responsabilidades:
 *   - Exibir versão da aplicação
 *   - Informações gerais do app
 */
class InfoManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;

    console.log('ℹ️ InfoManager criado');
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    console.log('🚀 InfoManager.initialize()');
    this.#initListeners();
    this.#initElements();
    await this.restoreState();
  }

  /**
   * Restaura estado salvo
   */
  async restoreState() {
    Logger.debug('InfoManager.restoreState()');
    console.log('📂 InfoManager.restoreState()');

    try {
      // Exibir informações iniciais
      this.#displayInfo();
    } catch (error) {
      Logger.error('Erro ao restaurar estado Info', error);
    }
  }

  /**
   * Reseta informações padrão
   */
  async reset() {
    console.log('🔄 InfoManager.reset()');
    this.#displayInfo();
  }

  /**
   * Registra listeners de eventos do EventBus
   * ⚠️ CRÍTICO: Deve ser chamado ANTES de #initElements
   */
  #initListeners() {
    console.log('📡 InfoManager #initListeners');

    // Listener para atualizar informações quando a app atualiza
    this.eventBus.on('appInfoUpdated', (data) => {
      console.log('✨ appInfoUpdated recebido:', data);
      this.#displayInfo();
    });
  }

  /**
   * Inicializa elementos DOM e seus listeners
   * ⚠️ CRÍTICO: Chamado DEPOIS de #initListeners
   */
  #initElements() {
    console.log('🎨 InfoManager #initElements');

    // Nesta seção há poucos/nenhum listener direto
    // É mais leitura de info do que interação do usuário
  }

  /**
   * Exibe informações de versão e app
   */
  #displayInfo() {
    try {
      const infoSection = document.getElementById('info');
      if (!infoSection) {
        console.warn('⚠️ Seção #info não encontrada');
        return;
      }

      // Buscar versão do app (pode vir do package.json ou config)
      const version = this.configManager.config.app?.version || '1.0.0';
      const appName = this.configManager.config.app?.name || 'AskMe';

      // Atualizar conteúdo (se houver elemento específico para versão)
      const versionElement = infoSection.querySelector('[data-info="version"]');
      if (versionElement) {
        versionElement.textContent = version;
      }

      const nameElement = infoSection.querySelector('[data-info="name"]');
      if (nameElement) {
        nameElement.textContent = appName;
      }

      console.log('💾 Info exibidas:', { appName, version });
    } catch (error) {
      Logger.error('Erro ao exibir informações', error);
    }
  }
}

// Exportar para globalThis (padrão do projeto)
if (typeof globalThis !== 'undefined') {
  globalThis.InfoManager = InfoManager;
}
