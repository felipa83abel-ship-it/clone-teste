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
	constructor() {
		this.logger = Logger;
		this.model = 'gpt-4o-mini';
	}

	/**
	 * Resposta completa (batch)
	 */
	async complete(messages) {
		try {
			const response = await ipcRenderer.invoke('ask-llm', messages);
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
		const tokenQueue = [];
		const state = { isEnd: false, error: null };

		const onChunk = (_, token) => {
			tokenQueue.push(token);
		};

		const onEnd = () => {
			state.isEnd = true;
		};

		const onError = (_, error) => {
			state.error = error;
			state.isEnd = true;
		};

		ipcRenderer.on('LLM_STREAM_CHUNK', onChunk);
		ipcRenderer.once('LLM_STREAM_END', onEnd);
		ipcRenderer.once('LLM_STREAM_ERROR', onError);

		try {
			// Invocar stream no main process
			ipcRenderer.invoke('ask-llm-stream', messages).catch(err => {
				this.logger.error('❌ Erro ao invocar ask-llm-stream:', err);
				state.error = err;
				state.isEnd = true;
			});

			// Loop de geração: yield tokens enquanto estiver rodando ou houver buffer
			while (!state.isEnd || tokenQueue.length > 0) {
				if (tokenQueue.length > 0) {
					yield tokenQueue.shift();
				} else {
					// Espera pequena para evitar loop infinito de alta CPU
					await new Promise(resolve => setTimeout(resolve, 10));
				}

				// Verifica erro assincronamente
				if (state.error) {
					throw new Error(state.error);
				}
			}
		} finally {
			// Limpar listeners para evitar memory leaks
			ipcRenderer.removeListener('LLM_STREAM_CHUNK', onChunk);
			ipcRenderer.removeListener('LLM_STREAM_END', onEnd);
			ipcRenderer.removeListener('LLM_STREAM_ERROR', onError);
		}
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = new OpenAIHandler();
}
