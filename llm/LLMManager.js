/**
 * LLMManager - Orquestrador de modelos LLM
 *
 * Uso:
 * const LLM = new LLMManager();
 * LLM.register('openai', openaiHandler);
 * LLM.register('gemini', geminiHandler);
 * const response = await LLM.complete(model, messages);
 *
 * Pronto para: OpenAI, Gemini, Anthropic, etc.
 */
class LLMManager {
	constructor() {
		this.handlers = {};
	}

	/**
	 * Registra handler de LLM
	 * @param {string} name - Nome do modelo (ex: 'openai')
	 * @param {object} handler - Handler do LLM com métodos: complete(), stream()
	 */
	register(name, handler) {
		if (!handler.complete || !handler.stream) {
			throw new Error(`Handler ${name} deve ter: complete(), stream()`);
		}
		this.handlers[name] = handler;
		console.log(`✅ LLM registrado: ${name}`);
	}

	/**
	 * Obtém handler
	 */
	getHandler(name) {
		const handler = this.handlers[name];
		if (!handler) {
			throw new Error(`LLM não encontrado: ${name}. Registrados: ${Object.keys(this.handlers).join(', ')}`);
		}
		return handler;
	}

	/**
	 * Obtém resposta completa (batch)
	 */
	async complete(model, messages) {
		const handler = this.getHandler(model);
		return handler.complete(messages);
	}

	/**
	 * Obtém resposta com streaming
	 */
	async stream(model, messages) {
		const handler = this.getHandler(model);
		return handler.stream(messages);
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = LLMManager;
}
