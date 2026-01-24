/**
 * TEMPLATE HANDLER - Interface genérica para LLM providers
 *
 * ✅ TEMPLATE para integração com novos LLM providers (ex: Anthropic Claude, Groq, etc)
 * Segue o mesmo padrão de openai-handler.js e gemini-handler.js para garantir compatibilidade
 *
 * COMO CRIAR UM NOVO HANDLER:
 * =============================
 *
 * 1. **Renomear arquivo**:
 *    mv template-handler.js seu-provider-handler.js
 *    Exemplo: mv template-handler.js anthropic-handler.js
 *
 * 2. **Implementar 3 métodos obrigatórios**:
 *    - initialize(apiKey): Inicializa cliente com API key
 *    - complete(messages): Retorna resposta completa (Promise<string>)
 *    - stream(messages): Retorna AsyncGenerator para streaming
 *
 * 3. **Formato de mensagens** (padrão OpenAI):
 *    messages = [
 *      { role: 'user', content: 'Olá' },
 *      { role: 'assistant', content: 'Oi, tudo bem?' },
 *      { role: 'user', content: 'Como você está?' }
 *    ]
 *
 *    Se seu provider usa formato diferente (como Gemini),
 *    converta em initialize() ou nos métodos complete/stream.
 *
 * 4. **Registrar no renderer.js** (após implementação):
 *    const myHandler = require('./llm/handlers/seu-provider-handler.js');
 *    llmManager.register('seu-provider', myHandler);
 *
 *    E adicionar na UI config-manager.js com input para API key
 *
 * 5. **Adicionar suporte no main.js**:
 *    - Importar SDK: const MyProvider = require('@org/sdk');
 *    - Criar variável: let meuCliente = null;
 *    - Criar initMyProvider(apiKey): Inicializa cliente
 *    - Atualizar handleSaveApiKey(): Detectar provider e inicializar
 *    - Atualizar handleDeleteApiKey(): Desconectar cliente
 *
 * EXEMPLO PRÁTICO (Anthropic Claude):
 * ====================================
 * 1. npm install @anthropic-ai/sdk
 * 2. const Anthropic = require('@anthropic-ai/sdk');
 * 3. class AnthropicHandler {
 *      async initialize(apiKey) { this.client = new Anthropic({ apiKey }); }
 *      async complete(messages) {
 *        return this.client.messages.create({ model: 'claude-3-sonnet', messages });
 *      }
 *      async *stream(messages) {
 *        const stream = await this.client.messages.stream({ model: '...', messages });
 *        for await (const event of stream) { yield event.delta?.text; }
 *      }
 *    }
 *
 * REFERÊNCIA DE PROVIDERS JÁ IMPLEMENTADOS:
 * ============================================
 * - openai-handler.js: GPT-4, GPT-3.5 (completo e testado)
 * - gemini-handler.js: Google Gemini (completo, pendente crédito para testes)
 * - template-handler.js: Este arquivo (use como referência)
 */

const Logger = require('../../utils/Logger.js');

class AnthropicHandler {
	initialized = false;
	client = null;
	logger = Logger;

	/**
	 * Inicializar cliente Anthropic
	 * @param {string} apiKey - Anthropic API key
	 */
	async initialize(apiKey) {
		try {
			// NOSONAR TODO: Descomementar quando @anthropic-ai/sdk estiver instalado
			// const Anthropic = require('@anthropic-ai/sdk');
			// this.client = new Anthropic({ apiKey });
			// this.initialized = true;
			// this.logger.info('Anthropic handler inicializado', { model: 'claude-3-sonnet' });

			throw new Error('Anthropic handler: ainda não implementado - use OpenAI por enquanto');
		} catch (error) {
			Logger.error('Erro ao inicializar Anthropic', { error: error.message });
			throw error;
		}
	}

	/**
	 * Chamar Claude para completação (resposta completa)
	 * @param {Array} messages - Array de mensagens {role, content}
	 * @returns {Promise<string>} Resposta do modelo
	 */
	async complete(messages) {
		if (!this.initialized) {
			throw new Error('Anthropic handler não inicializado');
		}

		try {
			throw new Error('Anthropic handler: complete() ainda não implementado');
		} catch (error) {
			Logger.error('Erro em Anthropic.complete()', { error: error.message });
			throw error;
		}
	}

	/**
	 * Chamar Claude com streaming
	 * @param {Array} messages - Array de mensagens {role, content}
	 * @returns {AsyncGenerator<string>} Async generator que emite tokens
	 */
	async *stream(messages) {
		// NOSONAR TODO: Implementar streaming real ao Claude quando @anthropic-ai/sdk estiver instalado

		if (!this.initialized) {
			yield '';
			throw new Error('Anthropic handler não inicializado');
		}

		yield '';
		throw new Error('Anthropic handler não implementado - instale @anthropic-ai/sdk');
	}
}

// ✅ Exporta como singleton (mesmo padrão de openai-handler)
module.exports = new AnthropicHandler();
