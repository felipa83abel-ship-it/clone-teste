class DeepgramAudioWorkletProcessor extends AudioWorkletProcessor {
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

	process(inputs, outputs, parameters) {
		const input = inputs[0];
		if (!input || input.length === 0) {
			// eslint-disable-next-line no-unreachable
			return true; // NOSONAR
		}

		const inputData = input[0]; // Canal mono

		// Calcula RMS
		let sum = 0;
		for (const sample of inputData) {
			sum += sample * sample;
		}
		const rms = Math.sqrt(sum / inputData.length);

		// Se volume acima do threshold
		const isAboveThreshold = rms > this.thresholdRms;

		// Calcula percentual de volume para o VU meter
		const db = 20 * Math.log10(rms || 1e-8);
		let percent = Math.max(0, Math.min(100, ((db - -60) / -(-60)) * 100));

		// 🔥 OTIMIZAÇÃO: Se abaixo do threshold, forçamos o percentual para 0 evitando ruído residual (ventilador, etc).
		if (!isAboveThreshold) percent = 0;

		// Converte sempre para PCM16 e envia --- envia continuamente para permitir VAD no lado do main thread
		const pcm16 = new Int16Array(inputData.length);
		for (let i = 0; i < inputData.length; i++) {
			const s = Math.max(-1, Math.min(1, inputData[i]));
			pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
		}

		// Envia dados para o thread principal
		this.port.postMessage(
			{
				type: 'audioData',
				pcm16: pcm16.buffer,
				sampleRate: sampleRate || sampleRate, // placeholder (AudioWorkletProcessor global)
			},
			[pcm16.buffer],
		);

		// Sempre envia atualização de volume (pode ser 0 se estiver em silêncio ruidoso)
		this.port.postMessage({
			type: 'volumeUpdate',
			percent: percent,
		});

		// Nota: Esta função sempre retorna o mesmo valor por design, para manter o processamento contínuo, (obrigatório para AudioWorkletProcessor).

		// eslint-disable-next-line
		return true; // NOSONAR
	}
}

registerProcessor('deepgram-audio-worklet-processor', DeepgramAudioWorkletProcessor);
