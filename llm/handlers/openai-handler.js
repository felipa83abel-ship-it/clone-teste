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
const { ipcRenderer } = require('electron');

class OpenAIHandler {
	constructor() {
		this.model = 'gpt-4o-mini';
	}

	/**
	 * Resposta completa (batch)
	 */
	async complete(messages) {
		try {
			const response = await ipcRenderer.invoke('ask-gpt', messages);
			return response;
		} catch (error) {
			console.error('❌ Erro OpenAI complete:', error);
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
				console.error('❌ Erro ao invocar ask-gpt-stream:', err);
			});

			// Criar generator que espera por tokens
			let resolved = false;
			let tokens = [];

			const onChunk = (_, token) => {
				tokens.push(token);
			};

			const onEnd = () => {
				resolved = true;
				ipcRenderer.removeListener('GPT_STREAM_CHUNK', onChunk);
				ipcRenderer.removeListener('GPT_STREAM_END', onEnd);
			};

			ipcRenderer.on('GPT_STREAM_CHUNK', onChunk);
			ipcRenderer.once('GPT_STREAM_END', onEnd);

			// Emitir tokens conforme chegam
			while (!resolved || tokens.length > 0) {
				if (tokens.length > 0) {
					yield tokens.shift();
				} else {
					await new Promise(resolve => setTimeout(resolve, 10));
				}
			}
		} catch (error) {
			console.error('❌ Erro OpenAI stream:', error);
			throw error;
		}
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = new OpenAIHandler();
}
