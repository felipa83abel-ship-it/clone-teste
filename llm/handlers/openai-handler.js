/**
 * OpenAI Handler - Interface padronizada para OpenAI
 *
 * ✅ Features:
 * - Error handling estruturado com Logger
 * - Tipos de erro específicos (Auth, Rate Limit, Timeout, etc)
 * - Cleanup automático de listeners (evita memory leaks)
 * - Validação de resposta
 *
 * ⚠️ NOTA: Este handler NÃO contém askLLM()
 * askLLM() fica CENTRALIZADO em renderer.js
 * Este handler apenas implementa: complete() e stream()
 *
 * Estrutura pronta para adicionar Gemini, Anthropic, etc.
 * Basta criar gemini-handler.js com mesmo padrão!
 */
// Logger e ipcRenderer carregados globalmente via index.html

class OpenAIHandler {
  constructor(ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.logger = globalThis.Logger;
    this.model = 'gpt-4o-mini';
  }

  /**
   * Mapeia códigos de erro OpenAI para mensagens amigáveis
   */
  _mapErrorMessage(error) {
    const message = error.message?.toLowerCase() || '';
    const code = error.code || error.status;

    if (message.includes('unauthorized') || code === 401) {
      return '🔑 Chave API inválida ou expirada';
    }
    if (message.includes('rate_limit') || code === 429) {
      return '⏱️ Limite de requisições atingido - tente novamente em alguns segundos';
    }
    if (message.includes('timeout')) {
      return '⏱️ Timeout de conexão - verifique sua internet';
    }
    if (message.includes('network') || message.includes('econnrefused')) {
      return '🌐 Erro de conexão de rede';
    }
    if (message.includes('context_length') || message.includes('token')) {
      return '📝 Pergunta muito longa para o modelo processar';
    }
    if (message.includes('model') && message.includes('not')) {
      return '⚠️ Modelo não encontrado ou não disponível';
    }

    return error.message || 'Erro desconhecido na API OpenAI';
  }

  /**
   * Resposta completa (batch)
   */
  async complete(messages) {
    try {
      this.logger.info('📤 OpenAI complete() iniciado', {
        model: this.model,
        messagesCount: messages.length,
      });

      const response = await this.ipcRenderer.invoke('ask-llm', messages);

      if (!response) {
        throw new Error('Resposta vazia da API OpenAI');
      }

      this.logger.info('✅ OpenAI complete() concluído', {
        responseLength: response.length || 0,
      });

      return response;
    } catch (error) {
      const userMessage = this._mapErrorMessage(error);
      this.logger.error('❌ Erro OpenAI complete:', {
        error: error.message,
        code: error.code,
        userMessage,
      });
      throw new Error(userMessage);
    }
  }

  /**
   * Resposta com streaming
   *
   * Retorna generator para iterar tokens:
   * for await (const token of handler.stream(messages)) {
   *   console.log(token);
   * }
   *
   * Características:
   * - Limpa listeners automaticamente (finally)
   * - Timeout configurável via LLMManager
   * - Error handling estruturado
   */
  async *stream(messages) {
    const tokenQueue = [];
    const state = { isEnd: false, error: null };

    const onChunk = (_, token) => {
      if (token && typeof token === 'string') {
        tokenQueue.push(token);
      }
    };

    const onEnd = () => {
      state.isEnd = true;
      this.logger.debug('🏁 Stream OpenAI finalizado');
    };

    const onError = (_, error) => {
      const userMessage = this._mapErrorMessage(error);
      this.logger.error('❌ Erro durante stream OpenAI:', {
        error: error.message || error,
        userMessage,
      });
      state.error = new Error(userMessage);
      state.isEnd = true;
    };

    this.ipcRenderer.on('LLM_STREAM_CHUNK', onChunk);
    this.ipcRenderer.once('LLM_STREAM_END', onEnd);
    this.ipcRenderer.once('LLM_STREAM_ERROR', onError);

    try {
      this.logger.debug(
        '📤 OpenAI stream() iniciado',
        {
          model: this.model,
          messagesCount: messages.length,
          messages,
        },
        true
      );

      // Invocar stream no main process
      this.ipcRenderer.invoke('ask-llm-stream', messages).catch((err) => {
        const userMessage = this._mapErrorMessage(err);
        this.logger.error('❌ Erro ao invocar ask-llm-stream:', {
          error: err.message,
          userMessage,
        });
        state.error = new Error(userMessage);
        state.isEnd = true;
      });

      // Loop de geração: yield tokens enquanto estiver rodando ou houver buffer
      while (!state.isEnd || tokenQueue.length > 0) {
        if (tokenQueue.length > 0) {
          const token = tokenQueue.shift();
          yield token;
        } else {
          // Espera pequena para evitar loop infinito de alta CPU
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Verifica erro assincronamente
        if (state.error) {
          throw state.error;
        }
      }

      this.logger.debug('✅ OpenAI stream() concluído', false);
    } finally {
      // Limpar listeners para evitar memory leaks
      this.ipcRenderer.removeListener('LLM_STREAM_CHUNK', onChunk);
      this.ipcRenderer.removeListener('LLM_STREAM_END', onEnd);
      this.ipcRenderer.removeListener('LLM_STREAM_ERROR', onError);
    }
  }
}

// Não instancia aqui - será instanciado em renderer.js com ipcRenderer

// Expor a classe em globalThis para uso em browser
if (typeof globalThis !== 'undefined') {
  globalThis.OpenAIHandler = OpenAIHandler;
}

// Expor para CommonJS (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OpenAIHandler;
}
