/**
 * SecureLogger - Logger seguro que filtra dados sensíveis em produção
 *
 * Uso:
 *   const SecureLogger = require('./utils/SecureLogger.js');
 *   SecureLogger.info('Dados gerais');
 *   SecureLogger.debug('Debug only', { data: 'sensível' });
 *   SecureLogger.warn('Aviso');
 *   SecureLogger.error('Erro');
 */

const isDev = process.env.NODE_ENV === 'development';

class SecureLogger {
  /**
   * Log de informações (sempre visível)
   * @param {string} message - Mensagem
   * @param {any} data - Dados adicionais (filtrados em produção)
   */
  static info(message, data = null) {
    console.log(`ℹ️  ${message}`);
    if (isDev && data) {
      console.log(data);
    }
  }

  /**
   * Log de debugging (apenas em desenvolvimento)
   * @param {string} message - Mensagem
   * @param {any} data - Dados adicionais
   */
  static debug(message, data = null) {
    if (isDev) {
      console.log(`🐛 ${message}`);
      if (data) {
        console.log(data);
      }
    }
  }

  /**
   * Log de aviso (sempre visível)
   * @param {string} message - Mensagem
   * @param {any} data - Dados adicionais
   */
  static warn(message, data = null) {
    console.warn(`⚠️  ${message}`);
    if (isDev && data) {
      console.warn(data);
    }
  }

  /**
   * Log de erro (sempre visível, sem dados sensíveis)
   * @param {string} message - Mensagem
   * @param {Error} error - Erro (apenas message em produção)
   */
  static error(message, error = null) {
    console.error(`❌ ${message}`);
    if (isDev && error) {
      console.error(error);
    } else if (error && error.message) {
      // Em produção, mostra apenas a mensagem, nunca o stack trace
      console.error(`   ${error.message}`);
    }
  }

  /**
   * Log de sucesso
   * @param {string} message - Mensagem
   */
  static success(message) {
    console.log(`✅ ${message}`);
  }

  /**
   * Máscara dados sensíveis (chaves, tokens, etc)
   * @param {string} value - Valor a ser mascarado
   * @param {number} visibleChars - Quantos caracteres mostrar no início (padrão: 8)
   * @returns {string} Valor mascarado
   */
  static maskSensitive(value, visibleChars = 8) {
    if (!value || typeof value !== 'string') return '***';
    if (value.length <= visibleChars) return '***';
    return value.substring(0, visibleChars) + '...';
  }

  /**
   * Log de inicialização com chave mascarada
   * @param {string} provider - Nome do provider (OpenAI, Gemini, etc)
   * @param {string} apiKey - Chave da API
   */
  static logClientInitialization(provider, apiKey) {
    const masked = this.maskSensitive(apiKey);
    this.info(`Inicializando cliente ${provider} com chave: ${masked}`);
  }
}

module.exports = SecureLogger;
