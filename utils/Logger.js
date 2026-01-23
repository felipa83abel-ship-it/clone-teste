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

	static debug(message, data = {}) {
		this.log(this.levels.DEBUG, message, data);
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
