/**
 * Modes Registry - Registro centralizado de modos de operação
 *
 * Responsabilidades:
 * - Registrar modos disponíveis (INTERVIEW, NORMAL)
 * - Expor função de registro para fácil extensão
 *
 * Uso:
 * modesRegistry.initialize(modeManager);
 */

function initializeModesRegistry(modeManager) {
  if (!modeManager) {
    console.error('❌ ModeManager não fornecido ao initializeModesRegistry');
    return;
  }

  console.log('🎭 Registrando modos...');

  // Registra modo INTERVIEW
  modeManager.registerMode(globalThis.MODES.INTERVIEW, globalThis.InterviewModeHandlers);

  // Registra modo NORMAL
  modeManager.registerMode(globalThis.MODES.NORMAL, globalThis.NormalModeHandlers);

  console.log('✅ Modos registrados com sucesso');
}

// Exportar função de inicialização
if (typeof globalThis !== 'undefined') {
  globalThis.initializeModesRegistry = initializeModesRegistry;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = initializeModesRegistry;
}
