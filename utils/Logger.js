/**
 * Logger - Sistema de logging estruturado
 * Substitui: debugLogRenderer() frágil
 *
 * @typedef {Object.<string, any>} LogData - Objeto com dados contextuais para logging
 */

/**
 * @class Logger
 * @description Logger centralizado com níveis e controle de debug
 * @example
 * Logger.info('Iniciando app', { version: '1.0' });
 * Logger.debug('Debug info', { value: 42 }, true); // show=true para ativar
 * Logger.error('Erro crítico', { code: 500 });
 */
class Logger {
  static levels = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  };

  /**
   * Log genérico com level
   * @param {string} level - Nível do log (DEBUG|INFO|WARN|ERROR)
   * @param {string} message - Mensagem a logar
   * @param {LogData} [data={}] - Dados contextuais
   * @returns {void}
   */
  static log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    if (Object.keys(data).length === 0) {
      console.log(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`, data);
    }
  }

  /**
   * Log de debug com visibilidade controlada
   * @param {string} message - Mensagem a logar
   * @param {LogData|boolean} [data={}] - Dados ou flag de visibilidade
   * @param {boolean} [show=false] - Se true, mostra log colorido no console
   * @returns {void}
   */
  static debug(message, data = {}, show = false) {
    // Se 'data' é um booleano, é o flag 'show' (compatibilidade: Logger.debug(msg, true))
    if (typeof data === 'boolean') {
      show = data;
      data = {};
    }

    // Mostra apenas se show === true
    if (show) {
      const nowLog = new Date();
      const timeStr =
        `${nowLog.getHours().toString().padStart(2, '0')}:` +
        `${nowLog.getMinutes().toString().padStart(2, '0')}:` +
        `${nowLog.getSeconds().toString().padStart(2, '0')}.` +
        `${nowLog.getMilliseconds().toString().padStart(3, '0')}`;

      const cleanMessage = typeof message === 'string' ? message : JSON.stringify(message);
      // prettier-ignore
      console.log(
				`%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug:`,
				'color: brown; font-weight: bold;',
				cleanMessage,
				Object.keys(data).length > 0 ? data : ''
			);
    }
  }

  /**
   * Log de informação
   * @param {string} message - Mensagem a logar
   * @param {LogData} [data={}] - Dados contextuais
   * @returns {void}
   */
  static info(message, data = {}) {
    this.log(this.levels.INFO, message, data);
  }

  /**
   * Log de aviso
   * @param {string} message - Mensagem a logar
   * @param {LogData} [data={}] - Dados contextuais
   * @returns {void}
   */
  static warn(message, data = {}) {
    this.log(this.levels.WARN, message, data);
  }

  /**
   * Log de erro
   * @param {string} message - Mensagem a logar
   * @param {LogData} [data={}] - Dados contextuais
   * @returns {void}
   */
  static error(message, data = {}) {
    this.log(this.levels.ERROR, message, data);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logger;
}
