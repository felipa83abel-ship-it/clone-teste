/**
 * EventBus - Sistema de pub/sub para desacoplar componentes
 * Substitui: UICallbacks (20+ enum properties)
 *
 * @typedef {function} EventCallback
 * @param {any} data - Dados enviados pelo emit
 * @returns {void}
 */

/**
 * @class EventBus
 * @description Pub/sub event bus para comunicação entre componentes
 * @example
 * const bus = new EventBus();
 * bus.on('audio-start', (data) => console.log(data));
 * bus.emit('audio-start', { duration: 5000 });
 */
class EventBus {
	constructor() {
		/** @type {Object<string, EventCallback[]>} */
		this.events = {};
	}

	/**
	 * Registra listener para evento
	 * @param {string} eventName - Nome do evento (ex: 'audio-start', 'llm-response')
	 * @param {EventCallback} callback - Função a chamar quando evento emitir
	 * @returns {void}
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
	 * @param {string} eventName - Nome do evento
	 * @param {EventCallback} callback - Função a remover
	 * @returns {void}
	 */
	off(eventName, callback) {
		if (!this.events[eventName]) return;
		this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
	}

	/**
	 * Emite evento para todos os listeners
	 * @param {string} eventName - Nome do evento
	 * @param {any} [data] - Dados a passar para listeners
	 * @returns {void}
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
	 * @param {string} [eventName] - Evento a limpar. Se omitido, limpa todos
	 * @returns {void}
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
