/**
 * gemini-handler - Interface melhorada para Google Gemini
 *
 * ✅ Implementação com:
 * - Error handling estruturado e amigável
 * - Tipos de erro específicos (Auth, Rate Limit, Timeout, etc)
 * - Cleanup automático de listeners (evita memory leaks)
 * - Logging estruturado com Logger.js
 * - Validação de resposta
 *
 * Segue o mesmo padrão de openai-handler para garantir compatibilidade
 */

const Logger = require('../../utils/Logger.js');
const { ipcRenderer } = require('electron');

class GeminiHandler {
  constructor() {
    this.initialized = false;
    this.logger = Logger;
    this.model = 'gemini-pro';
  }

  /**
   * Inicializar handler (apenas marca como pronto, main.js cuida do client)
   */
  async initialize() {
    this.initialized = true;
    Logger.info('✅ Gemini handler pronto (via IPC)');
  }

  /**
   * Mapeia códigos de erro Gemini para mensagens amigáveis
   */
  _mapErrorMessage(error) {
    const message = error.message?.toLowerCase() || '';
    const code = error.code || error.status;

    if (message.includes('unauthorized') || code === 401) {
      return '🔑 Chave API Google inválida ou expirada';
    }
    if (message.includes('permission') || message.includes('forbidden') || code === 403) {
      return '🔐 Sem permissão para usar Gemini API';
    }
    if (message.includes('rate_limit') || code === 429) {
      return '⏱️ Limite de requisições do Gemini atingido - tente novamente mais tarde';
    }
    if (message.includes('timeout')) {
      return '⏱️ Timeout de conexão com Gemini - verifique sua internet';
    }
    if (message.includes('network') || message.includes('econnrefused')) {
      return '🌐 Erro de conexão de rede com Gemini';
    }
    if (message.includes('not activated') || message.includes('not enabled')) {
      return '⚠️ Gemini API não está ativada na sua conta Google Cloud';
    }
    if (message.includes('quota') || message.includes('resource')) {
      return '📊 Limite de quota do Gemini atingido';
    }

    return error.message || 'Erro desconhecido na API Gemini';
  }

  /**
   * Chamar Gemini para completação (via IPC)
   */
  async complete(messages) {
    try {
      Logger.info('📤 Gemini complete() iniciado', {
        model: this.model,
        messagesCount: messages.length,
      });

      const response = await ipcRenderer.invoke('ask-gemini', messages);

      if (!response) {
        throw new Error('Resposta vazia da API Gemini');
      }

      Logger.info('✅ Gemini complete() concluído', {
        responseLength: response.length || 0,
      });

      return response;
    } catch (error) {
      const userMessage = this._mapErrorMessage(error);
      Logger.error('❌ Erro Gemini complete:', {
        error: error.message,
        code: error.code,
        userMessage,
      });
      throw new Error(userMessage);
    }
  }

  /**
   * Chamar Gemini com streaming (via IPC)
   *
   * Retorna generator para iterar tokens:
   * for await (const token of handler.stream(messages)) {
   *   console.log(token);
   * }
   *
   * Características:
   * - Cleanup automático de listeners (finally)
   * - Timeout configurável via LLMManager
   * - Error handling estruturado
   */
  async *stream(messages) {
    const tokenQueue = [];
    const state = { isEnd: false, error: null };

    const onChunk = (_, chunk) => {
      if (chunk && typeof chunk === 'string') {
        tokenQueue.push(chunk);
      }
    };

    const onEnd = () => {
      state.isEnd = true;
      Logger.debug('🏁 Stream Gemini finalizado');
    };

    const onError = (_, error) => {
      const userMessage = this._mapErrorMessage(error);
      Logger.error('❌ Erro durante stream Gemini:', {
        error: error.message || error,
        userMessage,
      });
      state.error = new Error(userMessage);
      state.isEnd = true;
    };

    // Registra ouvintes temporários
    ipcRenderer.on('LLM_STREAM_CHUNK', onChunk);
    ipcRenderer.once('LLM_STREAM_END', onEnd);
    ipcRenderer.once('LLM_STREAM_ERROR', onError);

    try {
      Logger.info('📤 Gemini stream() iniciado', {
        model: this.model,
        messagesCount: messages.length,
      });

      // Inicia o stream no Main
      ipcRenderer.invoke('ask-gemini-stream', messages).catch((err) => {
        const userMessage = this._mapErrorMessage(err);
        Logger.error('❌ Erro ao invocar ask-gemini-stream:', {
          error: err.message,
          userMessage,
        });
        state.error = new Error(userMessage);
        state.isEnd = true;
      });

      // Aguarda e emite tokens da fila
      while (!state.isEnd || tokenQueue.length > 0) {
        if (tokenQueue.length > 0) {
          const token = tokenQueue.shift();
          yield token;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        if (state.error) {
          throw state.error;
        }
      }

      Logger.info('✅ Gemini stream() concluído');
    } catch (error) {
      // Error já foi mapeado em onError, apenas relança
      Logger.error('❌ Erro em Gemini.stream()', { error: error.message });
      throw error;
    } finally {
      // Remove ouvintes para evitar vazamento de memória e duplicatas
      ipcRenderer.removeListener('LLM_STREAM_CHUNK', onChunk);
      ipcRenderer.removeListener('LLM_STREAM_END', onEnd);
      ipcRenderer.removeListener('LLM_STREAM_ERROR', onError);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = new GeminiHandler();
}
