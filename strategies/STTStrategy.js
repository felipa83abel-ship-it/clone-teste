/**
 * STTStrategy - Orquestrador de modelos STT com suporte a múltiplos provedores
 * Substitui: roteamento manual com if/else
 *
 * @typedef {Object} UIElements
 * @property {HTMLElement} [statusText] - Elemento para status
 * @property {HTMLElement} [volumeBar] - Elemento para volume
 * @property {HTMLElement} [transcriptionText] - Elemento para transcrição
 *
 * @typedef {Object} STTStrategyImpl
 * @property {Function} start - async start(elements): Promise<void>
 * @property {Function} stop - async stop(): Promise<void>
 * @property {Function} switchDevice - async switchDevice(type, deviceId): Promise<void>
 *
 * @class STTStrategy
 * @description Orquestrador de modelos STT (Speech-to-Text) com padrão Strategy
 * @example
 * const STT = new STTStrategy();
 * STT.register('deepgram', { start, stop, switchDevice });
 * STT.register('whisper', { start, stop, switchDevice });
 * await STT.start('deepgram', elements);
 */
class STTStrategy {
	constructor() {
		/** @type {Object<string, STTStrategyImpl>} */
		this.strategies = {};
	}

	/**
	 * Registra estratégia de STT
	 * @param {string} name - Nome do modelo (ex: 'deepgram', 'whisper', 'vosk')
	 * @param {STTStrategyImpl} strategy - Implementação com start(), stop(), switchDevice()
	 * @returns {void}
	 * @throws {Error} Se strategy não tem as funções obrigatórias
	 */
	register(name, strategy) {
		if (!strategy.start || !strategy.stop || !strategy.switchDevice) {
			throw new Error(`STT ${name} deve ter: start(), stop(), switchDevice()`);
		}
		this.strategies[name] = strategy;
		console.log(`✅ STT registrado: ${name}`);
	}

	/**
	 * Obtém estratégia por nome
	 * @param {string} name - Nome do modelo registrado
	 * @returns {STTStrategyImpl} Implementação do modelo
	 * @throws {Error} Se modelo não foi registrado
	 */
	getStrategy(name) {
		const strategy = this.strategies[name];
		if (!strategy) {
			throw new Error(`STT não encontrado: ${name}. Registrados: ${Object.keys(this.strategies).join(', ')}`);
		}
		return strategy;
	}

	/**
	 * Inicia captura de áudio com modelo específico
	 * @param {string} model - Nome do modelo de STT
	 * @param {UIElements} elements - Elementos UI para feedback
	 * @returns {Promise<void>}
	 * @throws {Error} Se modelo não foi registrado
	 */
	async start(model, elements) {
		const strategy = this.getStrategy(model);
		return strategy.start(elements);
	}

	/**
	 * Para captura de áudio
	 * @param {string} model - Nome do modelo de STT
	 * @returns {Promise<void>}
	 * @throws {Error} Se modelo não foi registrado
	 */
	async stop(model) {
		const strategy = this.getStrategy(model);
		return strategy.stop();
	}

	/**
	 * Muda dispositivo de áudio
	 * @param {string} model - Nome do modelo de STT
	 * @param {string} type - Tipo de dispositivo ('input'|'output')
	 * @param {string} deviceId - ID do dispositivo
	 * @returns {Promise<void>}
	 * @throws {Error} Se modelo não foi registrado
	 */
	async switchDevice(model, type, deviceId) {
		const strategy = this.getStrategy(model);
		return strategy.switchDevice(type, deviceId);
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = STTStrategy;
}
