/**
 * LLM Registry - Registro centralizado de provedores LLM
 *
 * Responsabilidades:
 * - Registrar handlers de LLM (OpenAI, Gemini, etc)
 * - Expor função de registro para fácil extensão
 *
 * Uso:
 * llmRegistry.initialize(llmManager, ipcRenderer);
 */

function initializeLLMRegistry(llmManager, ipcRenderer) {
  if (!llmManager) {
    console.error('❌ LLMManager não fornecido ao initializeLLMRegistry');
    return;
  }

  if (!ipcRenderer) {
    console.error('❌ ipcRenderer não fornecido ao initializeLLMRegistry');
    return;
  }

  console.log('🤖 Registrando LLMs...');

  // Registra OpenAI handler
  const openaiHandler = new globalThis.OpenAIHandler(ipcRenderer);
  llmManager.register('openai', openaiHandler);

  // Registra Gemini handler
  const geminiHandler = new globalThis.GeminiHandler(ipcRenderer);
  llmManager.register('google', geminiHandler);

  console.log('✅ LLMs registrados com sucesso');
}

// Exportar função de inicialização
if (typeof globalThis !== 'undefined') {
  globalThis.initializeLLMRegistry = initializeLLMRegistry;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = initializeLLMRegistry;
}
