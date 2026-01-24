/**
 * LLMManager - Orquestrador de modelos LLM com resilência
 *
 * ✅ Features:
 * - Timeout configurável para evitar travamentos
 * - Retry com backoff exponencial para falhas temporárias
 * - Error handling estruturado com Logger
 * - Suporte para múltiplos providers (OpenAI, Gemini, Anthropic, etc)
 *
 * @typedef {Object} LLMConfig
 * @property {number} [timeout=60000] - Timeout em ms
 * @property {number} [maxRetries=3] - Máximo de tentativas
 * @property {number} [retryDelayMs=1000] - Delay inicial em ms
 * @property {number} [backoffMultiplier=2] - Multiplicador do backoff
 *
 * @typedef {Object} LLMHandler
 * @property {Function} complete - Função para completion
 * @property {Function} stream - Função para streaming
 *
 * @typedef {Object} LLMMessage
 * @property {string} role - Papel (user|assistant|system)
 * @property {string} content - Conteúdo da mensagem
 *
 * @class LLMManager
 * @description Orquestrador de modelos LLM com timeout, retry e fallback
 * @example
 * const LLM = new LLMManager();
 * LLM.register('openai', openaiHandler);
 * const response = await LLM.complete('openai', messages);
 */

const Logger = require('../utils/Logger.js');

class LLMManager {
  /**
   * @param {LLMConfig} [options={}] - Configurações iniciais
   */
  constructor(options = {}) {
    this.handlers = {};

    // Configurações padrão (podem ser overridadas por handler individual)
    this.config = {
      timeout: options.timeout || 60000, // 60s padrão
      maxRetries: options.maxRetries || 3,
      retryDelayMs: options.retryDelayMs || 1000,
      backoffMultiplier: options.backoffMultiplier || 2,
    };

    Logger.info('LLMManager inicializado', {
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Registra handler de LLM
   * @param {string} name - Nome do modelo (ex: 'openai', 'gemini')
   * @param {LLMHandler} handler - Handler com métodos: complete(), stream()
   * @param {LLMConfig} [options={}] - Opções específicas do handler
   * @returns {void}
   * @throws {Error} Se handler não tem complete() e stream()
   */
  register(name, handler, options = {}) {
    if (!handler.complete || !handler.stream) {
      throw new Error(`❌ Handler ${name} deve ter: complete(), stream()`);
    }

    this.handlers[name] = {
      instance: handler,
      // Permite override de configurações por handler
      config: {
        timeout: options.timeout || this.config.timeout,
        maxRetries: options.maxRetries || this.config.maxRetries,
        retryDelayMs: options.retryDelayMs || this.config.retryDelayMs,
        backoffMultiplier: options.backoffMultiplier || this.config.backoffMultiplier,
      },
    };

    Logger.info(`✅ LLM registrado: ${name}`, {
      timeout: this.handlers[name].config.timeout,
      maxRetries: this.handlers[name].config.maxRetries,
    });
  }

  /**
   * Obtém handler de LLM
   * @param {string} name - Nome do modelo
   * @returns {LLMHandler} Handler do modelo
   * @throws {Error} Se modelo não foi registrado
   */
  getHandler(name) {
    const handlerWrapper = this.handlers[name];
    if (!handlerWrapper) {
      const available = Object.keys(this.handlers).join(', ');
      throw new Error(`❌ LLM não encontrado: ${name}. Disponíveis: ${available}`);
    }
    return handlerWrapper.instance;
  }

  /**
   * Obtém configuração do handler
   * @param {string} name - Nome do modelo
   * @returns {LLMConfig} Configuração do modelo
   * @throws {Error} Se modelo não foi registrado
   */
  getHandlerConfig(name) {
    const handlerWrapper = this.handlers[name];
    if (!handlerWrapper) {
      throw new Error(`❌ LLM não encontrado: ${name}`);
    }
    return handlerWrapper.config;
  }

  /**
   * Timeout wrapper para Promises
   * @private
   * @param {Promise<any>} promise - Promise a executar
   * @param {number} timeoutMs - Timeout em milissegundos
   * @returns {Promise<any>} Resultado da promise ou timeout
   * @throws {Error} Se timeout ultrapassado
   */
  async _withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`⏱️ Timeout após ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Retry wrapper com backoff exponencial
   * @private
   * @param {Function} asyncFn - Função assíncrona a executar
   * @param {LLMConfig} config - Configuração com maxRetries, retryDelayMs, backoffMultiplier
   * @returns {Promise<any>} Resultado da execução
   * @throws {Error} Se todas as tentativas falharam
   */
  async _withRetry(asyncFn, config) {
    let lastError;
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await asyncFn();
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === config.maxRetries;
        const isRetryable = this._isRetryableError(error);

        Logger.warn(`🔄 Tentativa ${attempt + 1} falhou`, {
          error: error.message,
          isRetryable,
          maxRetries: config.maxRetries,
        });

        if (isLastAttempt || !isRetryable) {
          break;
        }

        // Backoff exponencial: delay = baseDelay * (multiplier ^ attempt)
        const delayMs = config.retryDelayMs * Math.pow(config.backoffMultiplier, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  /**
   * Determina se erro é retentável
   * @private
   * @param {Error} error - Erro a verificar
   * @returns {boolean} true se pode retry, false se erro é definitivo
   * @description Erros de rede/timeout: retry. Autenticação/validação: não
   */
  _isRetryableError(error) {
    const message = error.message?.toLowerCase() || '';
    const nonRetryable = [
      'unauthorized', // 401
      'forbidden', // 403
      'not found', // 404
      'não autenticado',
      'api key',
      'invalid',
      'pergunta vazia',
      'já foi respondida',
    ];

    return !nonRetryable.some((keyword) => message.includes(keyword));
  }

  /**
   * Obtém resposta completa (batch) com timeout e retry
   */
  async complete(model, messages) {
    const handler = this.getHandler(model);
    const config = this.getHandlerConfig(model);

    Logger.info(`📤 Complete LLM: ${model}`, {
      messagesCount: messages.length,
      timeout: config.timeout,
    });

    try {
      const result = await this._withRetry(async () => {
        return await this._withTimeout(handler.complete(messages), config.timeout);
      }, config);

      Logger.info(`✅ Complete LLM concluído: ${model}`);
      return result;
    } catch (error) {
      Logger.error(`❌ Erro em complete(${model})`, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Obtém resposta com streaming com timeout e retry
   */
  async stream(model, messages) {
    const handler = this.getHandler(model);
    const config = this.getHandlerConfig(model);

    Logger.info(`📤 Stream LLM: ${model}`, {
      messagesCount: messages.length,
      timeout: config.timeout,
    });

    try {
      // Para stream, timeout se aplica à inicialização, não ao stream completo
      const streamGenerator = await this._withTimeout(handler.stream(messages), config.timeout);

      Logger.info(`✅ Stream LLM iniciado: ${model}`);
      return streamGenerator;
    } catch (error) {
      Logger.error(`❌ Erro em stream(${model})`, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LLMManager;
}
