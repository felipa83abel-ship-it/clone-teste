class DeepgramAudioWorkletProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.thresholdRms = 0.002; // Default, será sobrescrito por mensagem
		this.port.onmessage = event => {
			if (event.data.type === 'setThreshold') {
				this.thresholdRms = event.data.threshold;
				console.log(`🔧 Threshold RMS atualizado para: ${this.thresholdRms}`);
			}
		};
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0];
		if (!input || input.length === 0) return true;

		const inputData = input[0]; // Canal mono

		// Calcula RMS (mesma lógica do analyzeVolume)
		let sum = 0;
		for (const sample of inputData) {
			sum += sample * sample;
		}
		const rms = Math.sqrt(sum / inputData.length);

		// Calcula percentual de volume
		const db = 20 * Math.log10(rms || 1e-8);
		const percent = Math.max(0, Math.min(100, ((db - -60) / -(-60)) * 100));

		// 🔥 LOG: Sempre loga RMS e threshold para debug
		//console.log(`🔊 RMS: ${rms.toFixed(6)}, Threshold: ${this.thresholdRms}, Enviando: ${rms > this.thresholdRms}`);

		// Se volume acima do threshold, processa e envia PCM16
		if (rms > this.thresholdRms) {
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
				},
				[pcm16.buffer],
			); // Transfere o buffer para evitar cópia
		}

		// Sempre envia atualização de volume
		this.port.postMessage({
			type: 'volumeUpdate',
			percent: percent,
		});

		// Nota: Esta função sempre retorna o mesmo valor por design, para manter o processamento contínuo, (obrigatório para AudioWorkletProcessor).
		return true; // NOSONAR
	}
}

registerProcessor('deepgram-audio-worklet-processor', DeepgramAudioWorkletProcessor);
