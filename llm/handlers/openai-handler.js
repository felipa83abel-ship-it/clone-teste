/**
 * OpenAI Handler - Interface padronizada para OpenAI
 *
 * ⚠️ NOTA: Este handler NÃO contém askLLM()
 * askLLM() fica CENTRALIZADO em renderer.js
 * Este handler apenas implementa: complete() e stream()
 *
 * Estrutura pronta para adicionar Gemini, Anthropic, etc.
 * Basta criar gemini-handler.js com mesmo padrão!
 */
const Logger = require('../../utils/Logger.js');
const { ipcRenderer } = require('electron');

class OpenAIHandler {
	logger = null;
	model = 'gpt-4o-mini';

	constructor() {
		this.logger = Logger;
	}

	/**
	 * Resposta completa (batch)
	 */
	async complete(messages) {
		try {
			const response = await ipcRenderer.invoke('ask-gpt', messages);
			return response;
		} catch (error) {
			this.logger.error('❌ Erro OpenAI complete:', error);
			throw error;
		}
	}

	/**
	 * Resposta com streaming
	 *
	 * Retorna generator para iterar tokens:
	 * for await (const token of handler.stream(messages)) {
	 *   console.log(token);
	 * }
	 */
	async *stream(messages) {
		try {
			// Invocar stream
			ipcRenderer.invoke('ask-gpt-stream', messages).catch(err => {
				this.logger.error('❌ Erro ao invocar ask-gpt-stream:', err);
			});

			// Criar promise que resolve quando stream termina
			const streamPromise = new Promise((resolve) => {
				let tokens = [];

				const onChunk = (_, token) => {
					tokens.push(token);
				};

				const onEnd = () => {
					ipcRenderer.removeListener('GPT_STREAM_CHUNK', onChunk);
					ipcRenderer.removeListener('GPT_STREAM_END', onEnd);
					resolve(tokens);
				};

				ipcRenderer.on('GPT_STREAM_CHUNK', onChunk);
				ipcRenderer.once('GPT_STREAM_END', onEnd);
			});

			// Emitir tokens enquanto eles chegam e depois os pendentes
			let allTokens = [];
			let pendingChunk = setInterval(async () => {
				if (allTokens.length > 0) {
					yield allTokens.shift();
				}
			}, 10);

			// Aguardar stream completo
			const finalTokens = await streamPromise;
			clearInterval(pendingChunk);
			allTokens.push(...finalTokens);

			// Emitir tokens restantes
			for (const token of allTokens) {
				yield token;
			}
		} catch (error) {
			this.logger.error('❌ Erro OpenAI stream:', error);
			throw error;
		}
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = new OpenAIHandler();
}
