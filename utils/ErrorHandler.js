/**
 * ErrorHandler - Tratamento centralizado de erros
 *
 * Uso:
 *   const ErrorHandler = require('./utils/ErrorHandler.js');
 *
 *   // Em handlers sync:
 *   try {
 *     // ... operação
 *   } catch (error) {
 *     throw ErrorHandler.formatError(error);
 *   }
 *
 *   // Em handlers async:
 *   try {
 *     // ... operação
 *   } catch (error) {
 *     return ErrorHandler.handleError(error, 'handleSomeFunction');
 *   }
 */

const SecureLogger = require('./SecureLogger.js');

class ErrorHandler {
  /**
   * Tipos de erro conhecidos
   */
  static ErrorTypes = {
    VALIDATION_ERROR: 'ValidationError',
    API_ERROR: 'APIError',
    AUTH_ERROR: 'AuthenticationError',
    NETWORK_ERROR: 'NetworkError',
    FILE_ERROR: 'FileError',
    CONFIG_ERROR: 'ConfigurationError',
    INTERNAL_ERROR: 'InternalError',
  };

  /**
   * Formata erro para retorno seguro
   * @param {Error} error - Erro original
   * @param {string} context - Contexto onde ocorreu (ex: 'handleAskLLM')
   * @returns {Object} {success: false, error: string, type: string, details?: any}
   */
  static formatError(error, context = 'Unknown') {
    const errorMessage = error?.message || 'Erro desconhecido';
    const errorType = this.getErrorType(error);

    // Log apenas em desenvolvimento
    SecureLogger.debug(`Erro em ${context}:`, {
      message: errorMessage,
      type: errorType,
      stack: error?.stack,
    });

    // Mensagem segura para usuário (sem detalhes técnicos em produção)
    const userMessage = this.getUserFriendlyMessage(errorType, errorMessage);

    return {
      success: false,
      error: userMessage,
      type: errorType,
      context,
      // Não incluir details em produção
      ...(process.env.NODE_ENV === 'development' && { details: errorMessage }),
    };
  }

  /**
   * Identifica tipo de erro baseado na mensagem e propriedades
   * @param {Error} error - Erro original
   * @returns {string} Tipo de erro
   */
  static getErrorType(error) {
    const message = error?.message?.toLowerCase() || '';

    // Erros de validação
    if (message.includes('invalid') || message.includes('validation')) {
      return this.ErrorTypes.VALIDATION_ERROR;
    }

    // Erros de autenticação
    if (
      message.includes('401') ||
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('api key') ||
      message.includes('not configured')
    ) {
      return this.ErrorTypes.AUTH_ERROR;
    }

    // Erros de API
    if (
      message.includes('api') ||
      message.includes('request') ||
      message.includes('response') ||
      error?.status
    ) {
      return this.ErrorTypes.API_ERROR;
    }

    // Erros de rede
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('timeout')
    ) {
      return this.ErrorTypes.NETWORK_ERROR;
    }

    // Erros de arquivo
    if (message.includes('file') || message.includes('enoent') || message.includes('permission')) {
      return this.ErrorTypes.FILE_ERROR;
    }

    // Erros de configuração
    if (message.includes('config') || message.includes('setting')) {
      return this.ErrorTypes.CONFIG_ERROR;
    }

    return this.ErrorTypes.INTERNAL_ERROR;
  }

  /**
   * Retorna mensagem amigável para o usuário baseada no tipo de erro
   * @param {string} errorType - Tipo de erro
   * @param {string} originalMessage - Mensagem original
   * @returns {string} Mensagem amigável
   */
  static getUserFriendlyMessage(errorType, originalMessage) {
    const messages = {
      [this.ErrorTypes.VALIDATION_ERROR]:
        'Dados fornecidos inválidos. Verifique e tente novamente.',
      [this.ErrorTypes.API_ERROR]:
        'Erro ao comunicar com a API. Tente novamente em alguns segundos.',
      [this.ErrorTypes.AUTH_ERROR]: 'Autenticação falhou. Verifique sua API key nas configurações.',
      [this.ErrorTypes.NETWORK_ERROR]: 'Erro de conexão. Verifique sua conexão de internet.',
      [this.ErrorTypes.FILE_ERROR]: 'Erro ao acessar arquivo. Verifique permissões.',
      [this.ErrorTypes.CONFIG_ERROR]:
        'Erro de configuração. Verifique as configurações da aplicação.',
      [this.ErrorTypes.INTERNAL_ERROR]: 'Erro interno. Tente novamente ou reinicie a aplicação.',
    };

    return messages[errorType] || 'Ocorreu um erro inesperado.';
  }

  /**
   * Trata erro com logging e retorno seguro
   * @param {Error} error - Erro original
   * @param {string} context - Contexto onde ocorreu
   * @param {any} fallbackReturn - Valor padrão para retornar
   * @returns {any} Valor formatado para retorno
   */
  static handleError(error, context, fallbackReturn = null) {
    SecureLogger.error(`Erro em ${context}:`, error);
    return fallbackReturn ?? this.formatError(error, context);
  }

  /**
   * Wrapper para async functions com tratamento automático de erro
   * @param {Function} asyncFn - Função async
   * @param {string} context - Contexto (nome da função)
   * @returns {Function} Função com tratamento de erro
   */
  static asyncHandler(asyncFn, context) {
    return async (...args) => {
      try {
        return await asyncFn(...args);
      } catch (error) {
        return this.handleError(error, context);
      }
    };
  }

  /**
   * Cria Error com mensagem customizada e tipo
   * @param {string} message - Mensagem de erro
   * @param {string} type - Tipo de erro
   * @returns {Error} Erro com propriedade type
   */
  static createError(message, type = this.ErrorTypes.INTERNAL_ERROR) {
    const error = new Error(message);
    error.type = type;
    return error;
  }

  /**
   * Valida entrada e joga erro se inválida
   * @param {any} value - Valor a validar
   * @param {string} fieldName - Nome do campo
   * @param {string} expectedType - Tipo esperado ('string', 'number', 'object', 'array')
   * @throws {Error} Se validação falhar
   */
  static validateInput(value, fieldName, expectedType) {
    // Null/undefined check
    if (value === null || value === undefined) {
      throw this.createError(
        `Campo obrigatório faltando: ${fieldName}`,
        this.ErrorTypes.VALIDATION_ERROR
      );
    }

    // Type check
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
      throw this.createError(
        `Campo ${fieldName} deve ser ${expectedType}, recebido ${actualType}`,
        this.ErrorTypes.VALIDATION_ERROR
      );
    }

    // String check (não vazio)
    if (expectedType === 'string' && value.trim().length === 0) {
      throw this.createError(
        `Campo ${fieldName} não pode estar vazio`,
        this.ErrorTypes.VALIDATION_ERROR
      );
    }
  }
}

module.exports = ErrorHandler;
