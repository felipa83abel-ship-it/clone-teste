// @ts-nocheck
// VAD usa optional chaining dinamicamente e requer types não tipadas
/**
 * 🎙️ VAD ENGINE (Voice Activity Detection)
 *
 * Motor centralizado de detecção de fala (VAD) para todos os STT providers:
 * - Deepgram
 * - Vosk
 * - Whisper (futuro)
 *
 * Funcionalidades:
 * - Inicialização de webrtcvad ou node-webrtcvad
 * - Detecção de fala por VAD nativo + fallback por energia
 * - Suavização multi-frame (janela deslizante)
 * - Cálculo de energia RMS
 *
 * Uso:
 * const { getVADEngine } = require('./vad-engine');
 * const vad = getVADEngine();
 * const isSpeech = vad.detectSpeech(pcm16Data, volumePercent, vadWindow);
 */

/* ================================ */
//	VAD ENGINE CLASS
/* ================================ */

class VADEngine {
  /**
   * @param {Object} options - Configurações do VAD
   * @param {number} options.mode - Modo webrtcvad (0-3, padrão: 2 agressivo)
   * @param {number} options.frameDurationMs - Duração do frame (padrão: 0.03 = 30ms)
   * @param {number} options.windowSize - Tamanho da janela deslizante (padrão: 6)
   * @param {number} options.volumeThreshold - Limiar de volume fallback (padrão: 20%)
   * @param {number} options.energyThreshold - Limiar de energia RMS (padrão: 500)
   * @param {number} options.sampleRate - Taxa de amostragem (padrão: 16000 Hz)
   */
  constructor(options = {}) {
    // @ts-ignore - options pode ser objeto vazio, TypeScript quer tipo específico
    const {
      mode = 2,
      frameDurationMs = 0.03,
      windowSize = 6,
      volumeThreshold = 20,
      energyThreshold = 500,
      sampleRate = 16000,
    } = options || {};
    this.mode = mode;
    this.frameDurationMs = frameDurationMs;
    this.windowSize = windowSize;
    this.volumeThreshold = volumeThreshold;
    this.energyThreshold = energyThreshold;
    this.sampleRate = sampleRate;

    this.vadInstance = null;
    this.vadAvailable = false;
    this.useNativeVAD = true;

    // Tenta inicializar VAD nativo
    this._initVAD();
  }

  /**
   * Inicializa webrtcvad ou node-webrtcvad
   * @private
   */
  _initVAD() {
    let VAD = null;
    try {
      // @ts-ignore - require é dinâmico, TypeScript não resolve
      VAD = require('webrtcvad');
    } catch {
      try {
        // @ts-ignore - require é dinâmico
        VAD = require('node-webrtcvad');
      } catch {
        console.warn('⚠️ VAD nativo não disponível. Usando fallback por volume.');
        return;
      }
    }

    try {
      if (typeof VAD?.default === 'function') {
        // webrtcvad (ESM default)
        this.vadInstance = new VAD.default(this.sampleRate, this.mode);
      } else if (typeof VAD === 'function') {
        // node-webrtcvad (CommonJS)
        this.vadInstance = new VAD(this.mode);
      } else if (VAD?.VAD) {
        // classe interna
        this.vadInstance = new VAD.VAD(this.mode);
      }

      if (this.vadInstance) {
        this.vadAvailable = true;
        console.log(`✅ VAD nativo inicializado (modo: ${this.mode})`);
      }
    } catch (error) {
      console.warn(
        '⚠️ Erro ao inicializar VAD nativo:',
        error instanceof Error ? error?.message : String(error)
      );
    }
  }

  /**
   * Detecta fala em um frame PCM16
   * @param {Int16Array|ArrayBuffer} pcm16 - Dados de áudio PCM16
   * @param {number} lastPercent - Porcentagem de volume (0-100)
   * @param {Array} vadWindow - Janela deslizante de decisões VAD
   * @returns {boolean} true se detectou fala, false caso contrário
   */
  detectSpeech(pcm16, lastPercent, vadWindow = []) {
    let isSpeech = null;

    if (this.isEnabled()) {
      try {
        // @ts-ignore - ArrayBufferLike pode ser SharedArrayBuffer ou ArrayBuffer
        const pcmArray = new Int16Array(
          pcm16 instanceof ArrayBuffer ? pcm16 : pcm16.buffer || pcm16
        );
        const frameSize = Math.floor(this.sampleRate * this.frameDurationMs);

        for (let i = 0; i + frameSize <= pcmArray.length; i += frameSize) {
          const frame = pcmArray.subarray(i, i + frameSize);
          const vadDecision = this._runNativeVAD(frame);

          if (vadDecision === true) {
            isSpeech = true;
            break;
          }
          if (vadDecision === null) {
            break;
          }
        }
      } catch (error) {
        console.warn('⚠️ Erro ao executar VAD nativo:', error?.message || error);
        isSpeech = null;
      }
    }

    // Fallback: usa volume ou energia se VAD não funcionou
    return isSpeech === null ? this._fallbackIsSpeech(lastPercent, vadWindow) : isSpeech;
  }

  /**
   * Fallback de VAD baseado em energia com suavização multi-frame
   * @private
   * @param {number} percent - Porcentagem de volume (0-100)
   * @param {Array} vadWindow - Janela deslizante para suavização
   * @returns {boolean}
   */
  _fallbackIsSpeech(percent, vadWindow = []) {
    vadWindow.push(percent);
    if (vadWindow.length > this.windowSize) {
      vadWindow.shift();
    }

    const avg = vadWindow.reduce((a, b) => a + b, 0) / vadWindow.length;
    return avg > this.volumeThreshold;
  }

  /**
   * Executa VAD nativo no frame
   * @private
   * @param {Int16Array} frame - Frame PCM16
   * @returns {boolean|null} true=fala, false=silêncio, null=erro
   */
  _runNativeVAD(frame) {
    try {
      if (!this.vadInstance) return null;

      try {
        const result = this.vadInstance.isSpeech(frame, this.sampleRate);
        return result === true;
      } catch (error) {
        console.warn('⚠️ Erro ao chamar vadInstance.isSpeech():', error?.message || error);
        return null;
      }
    } catch (error) {
      console.warn('⚠️ Erro no VAD, usando fallback por energia:', error?.message || error);
      const energy = this._computeEnergy(frame);
      return energy > this.energyThreshold;
    }
  }

  /**
   * Calcula energia RMS de um frame PCM16
   * @private
   * @param {Int16Array} pcm16Array
   * @returns {number} Valor RMS
   */
  _computeEnergy(pcm16Array) {
    if (!pcm16Array || pcm16Array.length === 0) return 0;

    let sum = 0;
    for (const sample of pcm16Array) {
      sum += sample * sample;
    }

    return Math.sqrt(sum / pcm16Array.length);
  }

  /**
   * Verifica se VAD nativo está habilitado e disponível
   * @returns {boolean}
   */
  isEnabled() {
    return this.useNativeVAD && this.vadAvailable;
  }

  /**
   * Desabilita uso de VAD nativo (força fallback)
   */
  disableNativeVAD() {
    this.useNativeVAD = false;
    console.log('⚠️ VAD nativo desabilitado, usando fallback por volume');
  }

  /**
   * Reabilita uso de VAD nativo se disponível
   */
  enableNativeVAD() {
    if (this.vadAvailable) {
      this.useNativeVAD = true;
      console.log('✅ VAD nativo reabilitado');
    }
  }

  /**
   * Atualiza configurações do VAD em tempo de execução
   * @param {Object} newOptions - Novas configurações
   */
  updateConfig(newOptions = {}) {
    if (newOptions.volumeThreshold !== undefined) this.volumeThreshold = newOptions.volumeThreshold;
    if (newOptions.energyThreshold !== undefined) this.energyThreshold = newOptions.energyThreshold;
    if (newOptions.windowSize !== undefined) this.windowSize = newOptions.windowSize;
  }

  /**
   * Retorna status do VAD
   * @returns {Object}
   */
  getStatus() {
    return {
      nativeVADAvailable: this.vadAvailable,
      nativeVADEnabled: this.useNativeVAD && this.vadAvailable,
      mode: this.mode,
      volumeThreshold: this.volumeThreshold,
      energyThreshold: this.energyThreshold,
      windowSize: this.windowSize,
      sampleRate: this.sampleRate,
    };
  }
}

/* ================================ */
//	SINGLETON INSTANCE
/* ================================ */

let vadEngineInstance = null;

/**
 * Obtém instância única do VAD Engine
 * @param {Object} options - Configurações (aplicadas apenas na primeira inicialização)
 * @returns {VADEngine}
 */
function getVADEngine(options) {
  if (!vadEngineInstance) {
    vadEngineInstance = new VADEngine(options);
  }
  return vadEngineInstance;
}

/**
 * Reseta a instância singleton (útil para testes)
 */
function resetVADEngine() {
  vadEngineInstance = null;
}

/* ================================ */
//	EXPORTS
/* ================================ */

module.exports = {
  VADEngine,
  getVADEngine,
  resetVADEngine,
};
