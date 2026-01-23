/**
 * gemini-handler - Interface para Google Gemini
 *
 * ✅ Implementação completa para integração com Gemini AI
 * Segue o mesmo padrão de openai-handler para garantir compatibilidade
 */

const Logger = require('../../utils/Logger.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiHandler {
	constructor() {
		this.initialized = false;
		this.client = null;
		this.logger = Logger;
		this.model = 'gemini-1.5-flash';
	}

	/**
	 * Inicializar cliente Gemini
	 * @param {string} apiKey - Google API key
	 */
	async initialize(apiKey) {
		try {
			if (!apiKey) {
				throw new Error('API key do Gemini não fornecida');
			}

			this.client = new GoogleGenerativeAI(apiKey);
			this.initialized = true;
			this.logger.info('✅ Gemini handler inicializado', { model: this.model });
		} catch (error) {
			this.logger.error('❌ Erro ao inicializar Gemini', { error: error.message });
			throw error;
		}
	}

	/**
	 * Chamar Gemini para completação (resposta completa)
	 * @param {Array} messages - Array de mensagens {role, content}
	 * @returns {Promise<string>} Resposta do modelo
	 */
	async complete(messages) {
		if (!this.initialized || !this.client) {
			throw new Error('Gemini handler não inicializado');
		}

		try {
			const model = this.client.getGenerativeModel({ model: this.model });

			// Formata mensagens para Gemini (converte user/assistant para user/model)
			const contents = messages.map(msg => ({
				role: msg.role === 'user' ? 'user' : 'model',
				parts: [{ text: msg.content }],
			}));

			const result = await model.generateContent({
				contents,
				generationConfig: {
					maxOutputTokens: 2048,
					temperature: 0.7,
					topP: 0.95,
				},
			});

			const response = result.response;
			return response.text();
		} catch (error) {
			this.logger.error('❌ Erro em Gemini.complete()', { error: error.message });
			throw error;
		}
	}

	/**
	 * Chamar Gemini com streaming
	 * @param {Array} messages - Array de mensagens {role, content}
	 * @returns {AsyncGenerator<string>} Async generator que emite tokens
	 */
	async *stream(messages) {
		if (!this.initialized || !this.client) {
			throw new Error('Gemini handler não inicializado');
		}

		try {
			const model = this.client.getGenerativeModel({ model: this.model });

			// Formata mensagens para Gemini
			const contents = messages.map(msg => ({
				role: msg.role === 'user' ? 'user' : 'model',
				parts: [{ text: msg.content }],
			}));

			const result = await model.generateContentStream({
				contents,
				generationConfig: {
					maxOutputTokens: 2048,
					temperature: 0.7,
					topP: 0.95,
				},
			});

			// Emite tokens conforme chegam
			for await (const chunk of result.stream) {
				const text = chunk.text();
				if (text) {
					yield text;
				}
			}
		} catch (error) {
			this.logger.error('❌ Erro em Gemini.stream()', { error: error.message });
			throw error;
		}
	}
}

// ✅ Exporta como singleton (mesmo padrão de openai-handler)
module.exports = new GeminiHandler();
