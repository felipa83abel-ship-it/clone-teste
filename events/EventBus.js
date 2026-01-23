/**
 * EventBus - Sistema de pub/sub para desacoplar componentes
 * Substitui: UICallbacks (20+ enum properties)
 */
class EventBus {
	constructor() {
		this.events = {};
	}

	/**
	 * Registra listener para evento
	 * @param {string} eventName - Nome do evento
	 * @param {function} callback - Função a chamar quando evento emitir
	 */
	on(eventName, callback) {
		if (!this.events[eventName]) {
			this.events[eventName] = [];
		}
		this.events[eventName].push(callback);
		console.log(`📡 Listener registrado: ${eventName}`);
	}

	/**
	 * Remove listener específico
	 */
	off(eventName, callback) {
		if (!this.events[eventName]) return;
		this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
	}

	/**
	 * Emite evento para todos os listeners
	 * @param {string} eventName - Nome do evento
	 * @param {any} data - Dados a passar
	 */
	emit(eventName, data) {
		if (!this.events[eventName]) {
			console.warn(`⚠️ Nenhum listener para: ${eventName}`);
			return;
		}

		this.events[eventName].forEach(callback => {
			try {
				callback(data);
			} catch (error) {
				console.error(`❌ Erro em listener ${eventName}:`, error);
			}
		});
	}

	/**
	 * Remove todos listeners de um evento (ou de todos)
	 */
	clear(eventName) {
		if (eventName) {
			delete this.events[eventName];
		} else {
			this.events = {};
		}
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = EventBus;
}
