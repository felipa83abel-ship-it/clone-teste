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
 * 🎛️ STT AUDIO WORKLET PROCESSOR
 *
 * AudioWorklet usado pelos módulos de STT para captura de áudio,
 * cálculo de volume (RMS → dB → percentual) e envio dos dados PCM16
 * para o thread principal.
 * Permite que o main thread receba áudio em PCM16 para envio
 * nos serviços de STT que exigem esse formato.
 *
 * 🔥 ADICIONADO: Envia também percentual de volume junto com os dados de áudio.
 */
class STTAudioWorkletProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.thresholdRms = 0.002; // Default, será sobrescrito por mensagem
		this.frameBuffer = [];
		this.postInterval = 0; // contador para controle de envio (se necessário)

		this.port.onmessage = event => {
			if (event.data.type === 'setThreshold') {
				this.thresholdRms = event.data.threshold;
			}
			if (event.data.type === 'setPostIntervalMs') {
				this.postIntervalMs = event.data.ms;
			}
		};
	}

	// NOSONAR javascript:S3516
	// eslint-disable-next-line no-unreachable
	process(inputs, outputs, parameters) {
		const input = inputs[0];
		if (!input || input.length === 0) {
			// NOSONAR javascript:S3516
			// eslint-disable-next-line no-unreachable
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

		// Converte sempre para PCM16 e envia --- envia continuamente para permitir VAD no lado do main thread
		const pcm16 = new Int16Array(inputData.length);
		for (let i = 0; i < inputData.length; i++) {
			const s = Math.max(-1, Math.min(1, inputData[i]));
			pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
		}

		// Envia dados para o thread principal COM o volume/percent
		// Nota: sampleRate está disponível no contexto global do AudioWorkletProcessor
		this.port.postMessage(
			{
				type: 'audioData',
				pcm16: pcm16.buffer,
				percent: percent, // 🔥 ADICIONADO: Enviar percent junto com audioData
				sampleRate: sampleRate || 16000, // Fallback para 16kHz se não disponível
			},
			[pcm16.buffer],
		);

		// Sempre envia atualização de volume (pode ser 0 se estiver em silêncio ruidoso)
		this.port.postMessage({
			type: 'volumeUpdate',
			percent: percent,
		});

		// Nota: Esta função sempre retorna o mesmo valor por design, para manter o processamento contínuo, (obrigatório para AudioWorkletProcessor).
		return percent >= 0; // NOSONAR javascript:S3516
	}
}

registerProcessor('stt-audio-worklet-processor', STTAudioWorkletProcessor);
