// @ts-nocheck
// AudioWorklet roda em contexto isolado com Web Audio API globals
/**
 * 🎛️ CLASSE CALCULADORA DE VOLUME (AudioVolumeCalculator)
 *
 * ⚠️ DUPLICADO em stt-audio-worklet-processor.js e volume-audio-worklet-processor.js
 *
 * POR QUÊ duplicado?
 * - AudioWorklets rodam em thread isolada (Web Worker)
 * - Não suportam require() ou import de módulos Node.js
 * - Cada worklet precisa ter código self-contained
 *
 * Garante que ambos worklets usem MESMA FÓRMULA para cálculo de volume,
 * facilitando manutenção futura se a fórmula de RMS→dB→% precisar mudar.
 */
class AudioVolumeCalculator {
  static calculatePercent(rms, thresholdRms = 0.002) {
    if (typeof rms !== 'number' || rms < 0) return 0;
    const db = 20 * Math.log10(rms || 1e-8);
    let percent = Math.max(0, Math.min(100, ((db - -60) / -(-60)) * 100));
    if (rms <= thresholdRms) percent = 0;
    return percent;
  }
}

/**
 * 🎛️ VOLUME MONITOR WORKLET PROCESSOR
 *
 * AudioWorklet simples que calcula volume (RMS → dB → percentual)
 * e envia atualização para o thread principal.
 *
 * Usado pela seção "Áudio e Tela" para visualizar volume
 * sem estar em modo de transcrição.
 */
class VolumeAudioWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thresholdRms = 0.002; // Default para filtrar ruído
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const inputData = input[0]; // Canal mono

    // Calcula RMS
    let sum = 0;
    for (const sample of inputData) {
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / inputData.length);

    // 🔥 Usa calculadora compartilhada para cálculo de volume (RMS → dB → percentual)
    const percent = AudioVolumeCalculator.calculatePercent(rms, this.thresholdRms);

    // Envia atualização de volume continuamente
    this.port.postMessage({
      type: 'volumeUpdate',
      percent: percent,
    });

    // Nota: Esta função sempre retorna o mesmo valor por design, para manter o processamento contínuo, (obrigatório para AudioWorkletProcessor).
    return percent >= 0; // NOSONAR javascript:S3516
  }
}

registerProcessor('volume-audio-worklet-processor', VolumeAudioWorkletProcessor);
