/**
 * STTStrategy - Orquestrador de modelos STT
 * Substitui: roteamento manual com if/else
 *
 * Uso:
 * const STT = new STTStrategy();
 * STT.register('deepgram', { start: fn, stop: fn, switchDevice: fn });
 * await STT.start('deepgram', UIElements);
 */
class STTStrategy {
	constructor() {
		this.strategies = {};
	}

	/**
	 * Registra estratégia de STT
	 * @param {string} name - Nome do modelo (ex: 'deepgram')
	 * @param {object} strategy - { start, stop, switchDevice }
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
	 */
	getStrategy(name) {
		const strategy = this.strategies[name];
		if (!strategy) {
			throw new Error(`STT não encontrado: ${name}. Registrados: ${Object.keys(this.strategies).join(', ')}`);
		}
		return strategy;
	}

	/**
	 * Inicia captura de áudio
	 */
	async start(model, elements) {
		const strategy = this.getStrategy(model);
		return strategy.start(elements);
	}

	/**
	 * Para captura de áudio
	 */
	async stop(model) {
		const strategy = this.getStrategy(model);
		return strategy.stop();
	}

	/**
	 * Muda dispositivo de áudio
	 */
	async switchDevice(model, type, deviceId) {
		const strategy = this.getStrategy(model);
		return strategy.switchDevice(type, deviceId);
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = STTStrategy;
}
