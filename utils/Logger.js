/**
 * Logger - Sistema de logging estruturado
 * Substitui: debugLogRenderer() frágil
 */
class Logger {
	static levels = {
		DEBUG: 'DEBUG',
		INFO: 'INFO',
		WARN: 'WARN',
		ERROR: 'ERROR',
	};

	static log(level, message, data = {}) {
		const timestamp = new Date().toISOString();
		const prefix = `[${timestamp}] [${level}]`;

		if (Object.keys(data).length === 0) {
			console.log(`${prefix} ${message}`);
		} else {
			console.log(`${prefix} ${message}`, data);
		}
	}

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

	static info(message, data = {}) {
		this.log(this.levels.INFO, message, data);
	}

	static warn(message, data = {}) {
		this.log(this.levels.WARN, message, data);
	}

	static error(message, data = {}) {
		this.log(this.levels.ERROR, message, data);
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = Logger;
}
