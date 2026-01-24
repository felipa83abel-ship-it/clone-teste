/**
 * gemini-handler - Interface para Google Gemini
 *
 * ✅ Implementação completa para integração com Gemini AI
 * Segue o mesmo padrão de openai-handler para garantir compatibilidade
 */

const Logger = require('../../utils/Logger.js');
const { ipcRenderer } = require('electron');

class GeminiHandler {
	constructor() {
		this.initialized = false;
		this.logger = Logger;
	}

	/**
	 * Inicializar handler (apenas marca como pronto, main.js cuida do client)
	 */
	async initialize() {
		this.initialized = true;
		this.logger.info('✅ Gemini handler pronto (via IPC)');
	}

	/**
	 * Chamar Gemini para completação (via IPC)
	 */
	async complete(messages) {
		try {
			return await ipcRenderer.invoke('ask-gemini', messages);
		} catch (error) {
			this.logger.error('❌ Erro em Gemini.complete()', { error: error.message });
			throw error;
		}
	}

	/**
	 * Chamar Gemini com streaming (via IPC)
	 */
	async *stream(messages) {
		const tokenQueue = [];
		let isEnd = false;
		let streamError = null;

		const onChunk = (_, chunk) => {
			tokenQueue.push(chunk);
		};

		const onEnd = () => {
			isEnd = true;
		};

		const onError = (_, error) => {
			this.logger.error('❌ Erro no stream do Gemini (via IPC):', error);
			streamError = error;
			isEnd = true;
		};

		// Registra ouvintes temporários
		ipcRenderer.on('LLM_STREAM_CHUNK', onChunk);
		ipcRenderer.on('LLM_STREAM_END', onEnd);
		ipcRenderer.on('LLM_STREAM_ERROR', onError);

		try {
			// Inicia o stream no Main
			ipcRenderer.invoke('ask-gemini-stream', messages);

			// Aguarda e emite tokens da fila
			while (!isEnd || tokenQueue.length > 0) {
				if (tokenQueue.length > 0) {
					yield tokenQueue.shift();
				} else {
					await new Promise(resolve => setTimeout(resolve, 10));
				}

				if (streamError) {
					throw new Error(streamError);
				}
			}
		} catch (error) {
			this.logger.error('❌ Erro em Gemini.stream()', { error: error.message });
			throw error;
		} finally {
			// Remove ouvintes para evitar vazamento de memória e duplicatas
			ipcRenderer.removeListener('LLM_STREAM_CHUNK', onChunk);
			ipcRenderer.removeListener('LLM_STREAM_END', onEnd);
			ipcRenderer.removeListener('LLM_STREAM_ERROR', onError);
		}
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = new GeminiHandler();
}
