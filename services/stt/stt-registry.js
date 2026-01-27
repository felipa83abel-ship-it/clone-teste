/**
 * STT Registry - Registro centralizado de provedores STT
 *
 * Responsabilidades:
 * - Registrar novos STTs (deepgram, vosk, whisper, etc)
 * - Expor função de registro para fácil extensão
 *
 * Uso:
 * sttRegistry.register('novo-stt', { start, stop, switchDevice });
 */

function initializeSTTRegistry(sttStrategy) {
  if (!sttStrategy) {
    console.error('❌ STTStrategy não fornecido ao initializeSTTRegistry');
    return;
  }

  console.log('📡 Registrando STTs...');

  // Registra Deepgram
  sttStrategy.register('deepgram', {
    start: globalThis.startAudioDeepgram,
    stop: globalThis.stopAudioDeepgram,
    switchDevice: globalThis.switchDeviceDeepgram,
  });

  // Registra Vosk
  sttStrategy.register('vosk', {
    start: globalThis.startAudioVosk,
    stop: globalThis.stopAudioVosk,
    switchDevice: globalThis.switchDeviceVosk,
  });

  // Registra Whisper (local)
  sttStrategy.register('whisper-cpp-local', {
    start: globalThis.startAudioWhisper,
    stop: globalThis.stopAudioWhisper,
    switchDevice: globalThis.switchDeviceWhisper,
  });

  console.log('✅ STTs registrados com sucesso');
}

// Exportar função de inicialização
if (typeof globalThis !== 'undefined') {
  globalThis.initializeSTTRegistry = initializeSTTRegistry;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = initializeSTTRegistry;
}
