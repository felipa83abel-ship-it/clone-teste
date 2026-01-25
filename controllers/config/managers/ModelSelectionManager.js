// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * ModelSelectionManager - Gerencia seleção de modelos STT/LLM
 *
 * Responsabilidades:
 *   - Restaurar seleção de modelos STT e LLM salvos
 *   - Ativar/desativar modelos com validação de API keys
 *   - Atualizar UI com status dos modelos
 *   - Sincronizar seleção com localStorage
 *   - Garantir apenas 1 modelo ativo por vez
 *
 * Interações:
 *   - DOM: model toggles, STT/LLM selects, status badges
 *   - ApiKeyManager: validar se chave existe antes de ativar
 *   - IPC: initialize-api-client para OpenAI
 *   - ConfigManager: salvar/restaurar estado
 *   - EventBus: MODEL_TOGGLED event
 */
class ModelSelectionManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   * @param {ApiKeyManager} apiKeyManager - Manager de API keys para validação
   */
  constructor(configManager, ipc, eventBus, apiKeyManager) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;
    this.apiKeyManager = apiKeyManager;

    console.log('🎯 ModelSelectionManager criado');
  }

  /**
   * Inicializa listeners e restaura estado
   */
  async initialize() {
    console.log('🚀 ModelSelectionManager.initialize()');
    await this.restoreState();
    this.#initModelToggleListeners();
    this.#initModelSelectListeners();
  }

  /**
   * Restaura seleção de modelos salvos
   */
  async restoreState() {
    console.log('📂 ModelSelectionManager.restoreState()');
    await this.restoreSTTLLMModels();
    this.updateModelStatusUI();
  }

  /**
   * Reseta modelos para padrão
   */
  async reset() {
    console.log('🔄 ModelSelectionManager.reset()');
    const providers = ['openai', 'google', 'openrouter'];

    providers.forEach((provider) => {
      this.configManager.config.api[provider].selectedSTTModel = 'vosk';
      this.configManager.config.api[provider].selectedLLMModel = '';
      this.configManager.config.api[provider].enabled = false;
    });

    this.configManager.config.api.activeProvider = 'openai';
    this.configManager.saveConfig(false);
    await this.restoreState();
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Restaura seleção de modelos STT e LLM salvos
   */
  restoreSTTLLMModels() {
    Logger.debug('Início da função: "restoreSTTLLMModels"');
    console.log('🔄 INICIANDO RESTAURAÇÃO DE MODELOS STT/LLM...');
    const providers = ['openai', 'google', 'openrouter'];

    providers.forEach((provider) => {
      // Restaurar STT Model
      const sttSelectId = `${provider}-stt-model`;
      const sttSelect = document.getElementById(sttSelectId);
      const savedSTTModel = this.configManager.config.api[provider]?.selectedSTTModel || 'vosk';

      if (sttSelect) {
        console.log(`   📝 ${sttSelectId}: antes="${sttSelect.value}" → depois="${savedSTTModel}"`);
        sttSelect.value = savedSTTModel;
        console.log(`   ✅ STT restaurado - ${provider}: ${savedSTTModel}`);
      } else {
        console.log(`   ⚠️ Select ${sttSelectId} não encontrado no DOM`);
      }

      // Restaurar LLM Model
      const llmSelectId = `${provider}-llm-model`;
      const llmSelect = document.getElementById(llmSelectId);
      const savedLLMModel = this.configManager.config.api[provider]?.selectedLLMModel || '';

      if (llmSelect) {
        console.log(`   📝 ${llmSelectId}: antes="${llmSelect.value}" → depois="${savedLLMModel}"`);
        llmSelect.value = savedLLMModel;
        console.log(`   ✅ LLM restaurado - ${provider}: ${savedLLMModel}`);
      } else {
        console.log(`   ⚠️ Select ${llmSelectId} não encontrado no DOM`);
      }
    });

    console.log('🎉 RESTAURAÇÃO CONCLUÍDA');
    Logger.debug('Fim da função: "restoreSTTLLMModels"');
  }

  /**
   * Ativa ou desativa um modelo (provider)
   * @param {string} model - Provider ('openai', 'google', 'openrouter')
   */
  async toggleModel(model) {
    Logger.debug('Início da função: "toggleModel"');
    const isCurrentlyActive = this.configManager.config.api[model]?.enabled === true;

    try {
      if (isCurrentlyActive) {
        // DESATIVAÇÃO: Sempre permitida
        this.configManager.config.api[model].enabled = false;

        console.log(`✅ Modelo ${model} desativado com sucesso`);
        this.configManager.showSaveFeedback(`Modelo ${model} desativado`);
        this.updateModelStatusUI();
        this.configManager.saveConfig();

        // Emite evento
        this.eventBus.emit('MODEL_TOGGLED', { model, enabled: false });
        return;
      }

      // ATIVAÇÃO: Exige chave válida
      const savedKey = await this.ipc.invoke('GET_API_KEY', model);

      if (!savedKey || savedKey.length < 10) {
        console.log(`⚠️ Não é possível ativar o modelo ${model} sem chave válida`);
        this.configManager.showError(`Configure a API key de ${model} antes de ativar`);
        return;
      }

      // Desativa todos os outros modelos primeiro
      Object.keys(this.configManager.config.api).forEach((key) => {
        if (
          key !== 'activeProvider' &&
          this.configManager.config.api[key] &&
          typeof this.configManager.config.api[key] === 'object'
        ) {
          this.configManager.config.api[key].enabled = false;
        }
      });

      // Ativa o modelo selecionado
      if (this.configManager.config.api[model]) {
        this.configManager.config.api[model].enabled = true;
        this.configManager.config.api.activeProvider = model;

        console.log(`✅ Modelo ${model} ativado com sucesso`);
        this.configManager.showSaveFeedback(`Modelo ${model} ativado`);
      }

      // Atualiza UI
      this.updateModelStatusUI();
      this.configManager.saveConfig();

      // Se for OpenAI, inicializa cliente no main
      if (model === 'openai') {
        await this.ipc.invoke('initialize-api-client', savedKey);
      }

      // Emite evento
      this.eventBus.emit('MODEL_TOGGLED', { model, enabled: true });
    } catch (error) {
      console.error(`❌ Erro ao alternar modelo ${model}:`, error);
      this.configManager.showError(`Erro ao alternar modelo: ${error.message}`);
    }

    Logger.debug('Fim da função: "toggleModel"');
  }

  /**
   * Atualiza status visual dos modelos (badges e botões)
   */
  updateModelStatusUI() {
    Logger.debug('Início da função: "updateModelStatusUI"');
    Object.keys(this.configManager.config.api).forEach((model) => {
      if (model !== 'activeProvider' && this.configManager.config.api[model]) {
        const statusBadge = document
          .querySelector(`[data-model="${model}"]`)
          ?.closest('.model-status')
          ?.querySelector('.status-badge');
        const activateButton = document.querySelector(`[data-model="${model}"]`);

        if (statusBadge && activateButton) {
          if (this.configManager.config.api[model].enabled) {
            statusBadge.textContent = 'Ativo';
            statusBadge.className = 'status-badge active';
            activateButton.textContent = 'Desativar';
          } else {
            statusBadge.textContent = 'Inativo';
            statusBadge.className = 'status-badge inactive';
            activateButton.textContent = 'Ativar';
          }
        }
      }
    });

    Logger.debug('Fim da função: "updateModelStatusUI"');
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em botões de toggle de modelo
   */
  #initModelToggleListeners() {
    console.log('🎯 ModelSelectionManager.#initModelToggleListeners()');
    document.querySelectorAll('button[data-model]').forEach((button) => {
      button.addEventListener('click', (e) => {
        const model = e.currentTarget.dataset.model;
        this.toggleModel(model);
      });
    });
  }

  /**
   * Registra listeners em selects de STT/LLM
   */
  #initModelSelectListeners() {
    console.log('🎯 ModelSelectionManager.#initModelSelectListeners()');
    const providers = ['openai', 'google', 'openrouter'];

    providers.forEach((provider) => {
      // Listener para STT Model select
      const sttSelect = document.getElementById(`${provider}-stt-model`);
      if (sttSelect) {
        sttSelect.addEventListener('change', (e) => {
          this.configManager.config.api[provider].selectedSTTModel = e.target.value;
          this.configManager.saveConfig();
          console.log(`📝 STT Model alterado - ${provider}: ${e.target.value}`);
        });
      }

      // Listener para LLM Model select
      const llmSelect = document.getElementById(`${provider}-llm-model`);
      if (llmSelect) {
        llmSelect.addEventListener('change', (e) => {
          this.configManager.config.api[provider].selectedLLMModel = e.target.value;
          this.configManager.saveConfig();
          console.log(`📝 LLM Model alterado - ${provider}: ${e.target.value}`);
        });
      }
    });
  }
}

module.exports = ModelSelectionManager;
