// @ts-nocheck - TypeScript em CommonJS não consegue resolver globals injetadas dinamicamente no DOM
/* global Logger */

/**
 * ApiKeyManager - Gerencia API keys de todos os providers
 *
 * Responsabilidades:
 *   - Salvar/deletar chaves de forma segura
 *   - Listeners de input (focus, blur, copy, cut)
 *   - Mascaramento e visibilidade
 *   - Validação e restauração de estado
 *
 * Providers suportados: openai, google, openrouter
 */
class ApiKeyManager {
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
   * Inicializa todos os listeners de API key
   */
  async initialize() {
    await this.checkApiKeysStatus();
    this.#initApiKeyInputListeners();
    this.#initApiKeyVisibilityListeners();
    this.#initApiKeyDeleteListeners();
  }

  /**
   * Restaura estado salvo (verifica chaves existentes)
   */
  async restoreState() {
    await this.checkApiKeysStatus();
  }

  /**
   * Reseta tudo (deleta todas as API keys)
   */
  async reset() {
    for (const provider of ['openai', 'google', 'openrouter']) {
      await this.deleteApiKey(provider);
    }
  }

  // ==========================================
  // MÉTODOS PÚBLICOS
  // ==========================================

  /**
   * Salva API key de forma segura no store encriptado
   * @param {string} provider - Provider (openai, google, openrouter)
   * @param {string} apiKey - Chave da API
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveApiKey(provider, apiKey) {
    Logger.debug('Início da função: "saveApiKey"');
    try {
      // Valida que a chave não está vazia
      if (!apiKey || apiKey.trim().length < 10) {
        console.warn('---> API key inválida ou muito curta');
        this.configManager.showError('API key inválida');
        return { success: false, error: 'API key inválida' };
      }

      const trimmedKey = apiKey.trim();
        `Enviando para main.js - provider: ${provider}, key length: ${trimmedKey.length}`
      );
      const masked = trimmedKey ? trimmedKey.substring(0, 8) + '...' : '';

      // Salva a chave de forma segura
      await this.ipc.invoke('SAVE_API_KEY', {
        provider,
        apiKey: trimmedKey,
      });

      this.updateApiKeyFieldStatus(provider, true);
      this.configManager.showSaveFeedback(`API key de ${provider} salva com segurança`);

      // Emite evento no EventBus
      this.eventBus.emit('API_KEY_UPDATED', { provider, hasKey: true });

      Logger.debug('Fim da função: "saveApiKey"');
      return { success: true };
    } catch (error) {
      console.error(`Erro ao salvar API key de ${provider}:`, error);
      this.configManager.showError(`Erro ao salvar API key: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deleta API key do store seguro
   * @param {string} provider - Provider
   */
  async deleteApiKey(provider) {
    Logger.debug('Início da função: "deleteApiKey"');
    try {
      const confirmed = confirm(`Tem certeza que deseja remover a API key de ${provider}?`);

      if (!confirmed) return;

      const result = await this.ipc?.invoke('DELETE_API_KEY', provider);

      if (result?.success) {
        this.updateApiKeyFieldStatus(provider, false);

        // Se o modelo estava ativo, desativa automaticamente
        if (this.configManager.config.api?.[provider]?.enabled === true) {
          this.configManager.config.api[provider].enabled = false;
          this.configManager.config.api.activeProvider = null;
          this.configManager.saveConfig();
          this.configManager.showSaveFeedback(
            `API key de ${provider} removida - Modelo desativado`
          );
        } else {
          this.configManager.showSaveFeedback(`API key de ${provider} removida`);
        }

        // Emite evento no EventBus
        this.eventBus.emit('API_KEY_UPDATED', { provider, hasKey: false });
      } else {
        this.configManager.showError(`Erro ao remover API key de ${provider}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao remover API key de ${provider}:`, error);
      this.configManager.showError(`Erro ao remover API key: ${error.message}`);
    }

    Logger.debug('Fim da função: "deleteApiKey"');
  }

  /**
   * Verifica status de todas as API keys salvas
   */
  async checkApiKeysStatus() {
    Logger.debug('Início da função: "checkApiKeysStatus"');
    try {
      const providers = ['openai', 'google', 'openrouter'];

      for (const provider of providers) {
        const savedKey = await this.ipc.invoke('GET_API_KEY', provider);

        if (savedKey && typeof savedKey === 'string' && savedKey.length > 10) {
          this.updateApiKeyFieldStatus(provider, true);
        } else {
          this.updateApiKeyFieldStatus(provider, false);

          // Desativa modelo se não houver chave
          if (this.configManager.config.api?.[provider]) {
            this.configManager.config.api[provider].enabled = false;
          }
        }
      }

    } catch (error) {
      console.error('❌ Erro ao verificar status das API keys:', error);
    }

    Logger.debug('Fim da função: "checkApiKeysStatus"');
  }

  /**
   * Atualiza status visual do campo de API key
   * @param {string} provider - Provider
   * @param {boolean} hasKey - Se tem chave salva
   */
  updateApiKeyFieldStatus(provider, hasKey) {
    Logger.debug('Início da função: "updateApiKeyFieldStatus"');
    const input = document.getElementById(`${provider}-api-key`);

    if (input) {
      if (hasKey) {
        input.value = '••••••••••••••••••••••••••';
        input.dataset.hasKey = 'true';
        input.placeholder = 'API key configurada (clique para alterar)';
        input.type = 'password';

      } else {
        input.value = '';
        input.dataset.hasKey = 'false';
        input.placeholder = 'Insira sua API key';
        input.type = 'password';

      }
    } else {
      console.warn(`⚠️ Input ${provider}-api-key não encontrado no DOM`);
    }

    Logger.debug('Fim da função: "updateApiKeyFieldStatus"');
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Registra listeners em campos de API key (input, focus, blur, copy, cut)
   */
  #initApiKeyInputListeners() {
    document.querySelectorAll('.api-key-input').forEach((input) => {
      // Ao digitar (input event), marca campo como tendo conteúdo
      input.addEventListener('input', (e) => {
        const hasContent = e.target.value && e.target.value.trim().length > 0;
        if (hasContent && !e.target.value.includes('••••')) {
          e.target.type = 'text';
        }
      });

      // Quando o campo recebe foco
      input.addEventListener('focus', async (e) => {
        const hasKey = e.target.dataset.hasKey === 'true';
        const isMasked = e.target.type === 'password';
        if (hasKey && isMasked) {
          e.target.value = '';
          e.target.type = 'text';
          e.target.placeholder = 'Insira uma nova API key';
        } else if (!hasKey && e.target.value === '') {
          e.target.type = 'text';
        }
      });

      // Ao sair do campo sem alterar, restaura máscara
      input.addEventListener('blur', (e) => {
        const hasKey = e.target.dataset.hasKey === 'true';
        const isEmpty = e.target.value === '' || e.target.value.trim() === '';

        if (hasKey && isEmpty) {
          e.target.value = '••••••••••••••••••••••••••';
          e.target.type = 'password';
          e.target.placeholder = 'API key configurada (clique para alterar)';
        } else if (
          !isEmpty &&
          !hasKey &&
          e.target.value.length > 0 &&
          !e.target.value.includes('••••')
        ) {
        }
      });

      // Previne copiar valor mascarado
      input.addEventListener('copy', (e) => {
        if (e.target.value.includes('••••')) {
          e.preventDefault();
          this.configManager.showError('Não é possível copiar API key mascarada');
        }
      });

      // Previne cortar valor mascarado
      input.addEventListener('cut', (e) => {
        if (e.target.value.includes('••••')) {
          e.preventDefault();
          this.configManager.showError('Não é possível cortar API key mascarada');
        }
      });
    });
  }

  /**
   * Registra listeners em botões de visibilidade de API key
   */
  #initApiKeyVisibilityListeners() {
    document.querySelectorAll('.btn-toggle-visibility').forEach((button) => {
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const targetId = e.currentTarget.dataset.target;
        const input = document.getElementById(targetId);
        const btn = e.currentTarget;

        if (!input) {
          console.warn(`⚠️ Input ${targetId} não encontrado`);
          return;
        }

        const provider = targetId.replace('-api-key', '');
        const hasKey = input.dataset.hasKey === 'true';
        const isMasked = input.value.includes('•');
        const hasNewValue = input.value && input.value.trim().length > 0 && !isMasked;

        // CASO 1: Campo tem chave salva E está mascarado → busca do store
        if (hasKey && isMasked) {
          try {
            const realKey = await this.ipc.invoke('GET_API_KEY', provider);

            if (realKey) {
              input.value = realKey;
              input.type = 'text';
              btn.innerHTML = '<span class="material-icons">visibility_off</span>';
            } else {
              console.warn(`⚠️ Chave de ${provider} não encontrada no store`);
            }
          } catch (error) {
            console.error(`❌ Erro ao recuperar chave de ${provider}:`, error);
          }
        }
        // CASO 2: Usuário está digitando uma chave nova (visível, sem •) → mascara
        else if (hasNewValue && input.type === 'text') {
          input.type = 'password';
          btn.innerHTML = '<span class="material-icons">visibility</span>';
        }
        // CASO 3: Chave nova está mascarada → mostra novamente
        else if (hasNewValue && input.type === 'password') {
          input.type = 'text';
          btn.innerHTML = '<span class="material-icons">visibility_off</span>';
        }
        // CASO 4: Campo vazio ou mascara de placeholder → não faz nada
        else {
        }
      });
    });
  }

  /**
   * Registra listeners em botões de deletar API key
   */
  #initApiKeyDeleteListeners() {
    document.querySelectorAll('.btn-delete-api-key').forEach((button) => {
      button.addEventListener('click', (e) => {
        const provider = e.currentTarget.dataset.provider;
        this.deleteApiKey(provider);
      });
    });
  }
}

module.exports = ApiKeyManager;
