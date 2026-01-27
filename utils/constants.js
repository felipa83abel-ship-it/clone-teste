/**
 * Constantes compartilhadas do app
 * Usar CommonJS require em módulos e expor em globalThis para scripts carregados via <script>
 */
const INPUT = 'input';
const OUTPUT = 'output';

// Configuração de Áudio 16kHz
const AUDIO_SAMPLE_RATE = 16000; // 16kHz

// AudioWorkletProcessor
const STT_AUDIO_WORKLET_PROCESSOR = 'stt-audio-worklet-processor'; // Nome
const AUDIO_WORKLET_PROCESSOR_PATH = './stt/stt-audio-worklet-processor.js'; // Path relativo a index.html

// Detecção de silêncio
const SILENCE_TIMEOUT_INPUT = 500; // ms para entrada (microfone)
const SILENCE_TIMEOUT_OUTPUT = 700; // ms para saída (sistema)

const constants = {
  INPUT,
  OUTPUT,
  AUDIO_SAMPLE_RATE,
  STT_AUDIO_WORKLET_PROCESSOR,
  AUDIO_WORKLET_PROCESSOR_PATH,
  SILENCE_TIMEOUT_INPUT,
  SILENCE_TIMEOUT_OUTPUT,
};
// Export para CommonJS (tests / node usage)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = constants;
}

// Expor como variáveis globais para scripts carregados via <script>
if (typeof globalThis !== 'undefined') {
  globalThis.INPUT = globalThis.INPUT || INPUT;
  globalThis.OUTPUT = globalThis.OUTPUT || OUTPUT;
  globalThis.AUDIO_SAMPLE_RATE = globalThis.AUDIO_SAMPLE_RATE || AUDIO_SAMPLE_RATE;
  globalThis.STT_AUDIO_WORKLET_PROCESSOR =
    globalThis.STT_AUDIO_WORKLET_PROCESSOR || STT_AUDIO_WORKLET_PROCESSOR;
  globalThis.AUDIO_WORKLET_PROCESSOR_PATH =
    globalThis.AUDIO_WORKLET_PROCESSOR_PATH || AUDIO_WORKLET_PROCESSOR_PATH;
  globalThis.SILENCE_TIMEOUT_INPUT = globalThis.SILENCE_TIMEOUT_INPUT || SILENCE_TIMEOUT_INPUT;
  globalThis.SILENCE_TIMEOUT_OUTPUT = globalThis.SILENCE_TIMEOUT_OUTPUT || SILENCE_TIMEOUT_OUTPUT;
  globalThis.APP_CONSTANTS = globalThis.APP_CONSTANTS || constants;
}
