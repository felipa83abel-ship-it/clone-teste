/**
 * 🎛️ AUDIO VOLUME MONITOR (Modo Teste/Visualização)
 *
 * Módulo independente para monitorar volume de input/output
 * quando o usuário está na seção "Áudio e Tela" (sem transcrição ativa).
 *
 * Usa mesmo padrão dos STT modules:
 * - AudioWorklet para captura de áudio
 * - RMS → dB → percentual para volume
 * - Emite via globalThis.RendererAPI.emitUIChange('onInputVolumeUpdate' / 'onOutputVolumeUpdate')
 *
 * ⚠️ NÃO inicia se já há transcrição ativa (isRunning = true)
 *
 * Uso:
 * - startAudioVolumeMonitor(source, deviceId)
 * - stopAudioVolumeMonitor(source)
 * - switchAudioVolumeDevice(source, newDeviceId)
 */

/* ================================ */
//	CONSTANTES
/* ================================ */

const INPUT = 'input';
const OUTPUT = 'output';

const AUDIO_SAMPLE_RATE = 16000; // Hz

// AudioWorkletProcessor
const VOLUME_MONITOR_WORKLET = 'volume-audio-worklet-processor';
const VOLUME_MONITOR_WORKLET_PATH = './audio/volume-audio-worklet-processor.js'; // Path relativo a index.html

/* ================================ */
//	ESTADO GLOBAL DO MONITOR
/* ================================ */

const volumeMonitorState = {
	input: {
		_isActive: false,
		_stream: null,
		_audioContext: null,
		_processor: null,
		_source: null,
		_deviceId: null,

		isActive() {
			return this._isActive;
		},
		setActive(val) {
			this._isActive = val;
		},
		stream() {
			return this._stream;
		},
		setStream(val) {
			this._stream = val;
		},
		audioContext() {
			return this._audioContext;
		},
		setAudioContext(val) {
			this._audioContext = val;
		},
		processor() {
			return this._processor;
		},
		setProcessor(val) {
			this._processor = val;
		},
		source() {
			return this._source;
		},
		setSource(val) {
			this._source = val;
		},
		deviceId() {
			return this._deviceId;
		},
		setDeviceId(val) {
			this._deviceId = val;
		},
	},
	output: {
		_isActive: false,
		_stream: null,
		_audioContext: null,
		_processor: null,
		_source: null,
		_deviceId: null,

		isActive() {
			return this._isActive;
		},
		setActive(val) {
			this._isActive = val;
		},
		stream() {
			return this._stream;
		},
		setStream(val) {
			this._stream = val;
		},
		audioContext() {
			return this._audioContext;
		},
		setAudioContext(val) {
			this._audioContext = val;
		},
		processor() {
			return this._processor;
		},
		setProcessor(val) {
			this._processor = val;
		},
		source() {
			return this._source;
		},
		setSource(val) {
			this._source = val;
		},
		deviceId() {
			return this._deviceId;
		},
		setDeviceId(val) {
			this._deviceId = val;
		},
	},
};

/* ================================ */
//	INICIALIZAÇÃO DO AUDIOWORKLET
/* ================================ */

/**
 * Registra o AudioWorklet do volume monitor (uma vez por AudioContext)
 * @param {AudioContext} audioContext - Contexto de áudio
 * @returns {Promise<void>}
 */
async function registerVolumeMonitorWorklet(audioContext) {
	if (!audioContext) {
		console.error('❌ AudioContext não disponível para registrar worklet');
		return;
	}

	// 🔥 Verifica se worklet já foi registrado neste AudioContext
	// Armazena em propriedade do contexto para rastrear
	const REGISTERED_KEY = '_volumeMonitorWorkletRegistered';
	if (audioContext[REGISTERED_KEY]) {
		console.log('ℹ️ Volume monitor worklet já registrado neste AudioContext');
		return;
	}

	try {
		console.log(`📂 Tentando carregar worklet de: ${VOLUME_MONITOR_WORKLET_PATH}`);

		// 🔥 Path deve ser relativo ao arquivo HTML (index.html), não ao módulo
		await audioContext.audioWorklet.addModule(VOLUME_MONITOR_WORKLET_PATH);
		audioContext[REGISTERED_KEY] = true; // Marca como registrado
		console.log('✅ Volume monitor worklet registrado com sucesso');
	} catch (err) {
		console.error('❌ Erro ao registrar volume monitor worklet:');
		console.error('   Nome:', err.name);
		console.error('   Mensagem:', err.message);
		console.error('   Stack:', err.stack);
		throw new Error(`Failed to load AudioWorklet: ${err.message}`);
	}
}

/* ================================ */
//	INICIAR MONITORAMENTO DE VOLUME
/* ================================ */

/**
 * Inicia monitoramento de volume para input ou output
 * 🔥 CRÍTICO: Só inicia se NÃO há transcrição ativa (isRunning = false)
 *
 * @param {string} source - 'input' ou 'output'
 * @param {string} deviceId - ID do dispositivo de áudio
 * @returns {Promise<void>}
 */
async function startAudioVolumeMonitor(source, deviceId) {
	// 🔥 VALIDAÇÃO 1: Input e Output são STREAMS INDEPENDENTES
	// Permite monitor mesmo se STT está rodando em outro stream
	// (ex: STT no OUTPUT, monitor no INPUT - são devices diferentes)
	const vars = volumeMonitorState[source];

	// 🔥 VALIDAÇÃO 2: Verifica se já está ativo PARA ESTE SOURCE
	if (vars.isActive()) {
		console.log(`ℹ️ Monitor de volume (${source}) já está ativo`);
		return;
	}

	// 🔥 VALIDAÇÃO 3: Verifica deviceId
	if (!deviceId) {
		console.warn(`⚠️ Nenhum dispositivo ${source} selecionado para monitor de volume`);
		return;
	}

	try {
		console.log(`🎛️ Iniciando monitor de volume (${source}) com dispositivo: ${deviceId}...`);

		// 1️⃣ Cria ou reutiliza AudioContext
		let audioContext = vars.audioContext();
		if (!audioContext) {
			audioContext = new AudioContext();
			vars.setAudioContext(audioContext);
			console.log(`✅ AudioContext criado com sucesso`);
		}

		// 2️⃣ Registra worklet
		try {
			await registerVolumeMonitorWorklet(audioContext);
		} catch (error_) {
			console.error(`❌ Não consegui registrar worklet:`, error_.message);
			throw new Error(`AudioWorklet registration failed: ${error_.message}`);
		}

		// 3️⃣ Captura stream de áudio do dispositivo
		let stream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { deviceId: { exact: deviceId } },
			});
			console.log(`✅ Stream de áudio capturado (${source})`);
		} catch (error_) {
			console.error(`❌ Erro ao capturar stream (${source}):`, error_.message);
			throw error_;
		}
		vars.setStream(stream);
		vars.setDeviceId(deviceId);

		// 4️⃣ Cria source do stream
		const source_obj = audioContext.createMediaStreamSource(stream);
		vars.setSource(source_obj);
		console.log(`✅ MediaStreamSource criado`);

		// 5️⃣ Cria AudioWorkletNode
		let processor;
		try {
			processor = new AudioWorkletNode(audioContext, VOLUME_MONITOR_WORKLET);
			console.log(`✅ AudioWorkletNode criado`);
		} catch (error_) {
			console.error(`❌ Erro ao criar AudioWorkletNode:`, error_.message);
			throw error_;
		}
		vars.setProcessor(processor);

		// 6️⃣ Processa mensagens do worklet
		processor.port.onmessage = event => {
			if (event.data.type === 'volumeUpdate') {
				handleVolumeMonitorUpdate(source, event.data);
			}
		};

		// 7️⃣ Conecta source → processor
		source_obj.connect(processor);
		// processor → audioContext.destination (para manter ativo)
		processor.connect(audioContext.destination);

		vars.setActive(true);

		console.log(`✅ Monitor de volume (${source}) iniciado com sucesso`);
	} catch (error) {
		console.error(`❌ Erro ao iniciar monitor de volume (${source}):`, error);

		// Limpa estado em caso de erro
		if (vars.stream()) {
			vars
				.stream()
				.getTracks()
				.forEach(track => track.stop());
		}
		vars.setStream(null);
		vars.setProcessor(null);
		vars.setSource(null);
		vars.setActive(false);
	}
}

/* ================================ */
//	PARAR MONITORAMENTO DE VOLUME
/* ================================ */

/**
 * Para monitoramento de volume para input ou output
 * @param {string} source - 'input' ou 'output'
 */
function stopAudioVolumeMonitor(source) {
	const vars = volumeMonitorState[source];

	if (!vars.isActive()) {
		console.log(`ℹ️ Monitor de volume (${source}) já está inativo`);
		return;
	}

	console.log(`🛑 Parando monitor de volume (${source})...`);

	try {
		// 1️⃣ Desconecta processor
		if (vars.processor()) {
			vars.processor().disconnect();
			vars.setProcessor(null);
		}

		// 2️⃣ Para stream de áudio
		if (vars.stream()) {
			vars
				.stream()
				.getTracks()
				.forEach(track => track.stop());
			vars.setStream(null);
		}

		// 3️⃣ Fecha source
		if (vars.source()) {
			vars.source().disconnect();
			vars.setSource(null);
		}

		// 4️⃣ Emite volume zerado para UI
		if (globalThis.RendererAPI?.emitUIChange) {
			const ev = source === INPUT ? 'onInputVolumeUpdate' : 'onOutputVolumeUpdate';
			globalThis.RendererAPI.emitUIChange(ev, { percent: 0 });
		}

		vars.setActive(false);
		console.log(`✅ Monitor de volume (${source}) parado`);
	} catch (error) {
		console.error(`❌ Erro ao parar monitor de volume (${source}):`, error);
	}
}

/* ================================ */
//	TROCAR DISPOSITIVO
/* ================================ */

/**
 * Troca dinâmica de dispositivo para input ou output
 * @param {string} source - 'input' ou 'output'
 * @param {string} newDeviceId - ID do novo dispositivo
 * @returns {Promise<void>}
 */
async function switchAudioVolumeDevice(source, newDeviceId) {
	const vars = volumeMonitorState[source];

	console.log(`🔄 [switchAudioVolumeDevice] Trocando dispositivo de ${source}`);
	console.log(`   Dispositivo anterior: ${vars.deviceId() || 'NENHUM'}`);
	console.log(`   Novo dispositivo: ${newDeviceId || 'NENHUM'}`);

	// Se o novo dispositivo é vazio ("Nenhum"), para o monitor
	if (!newDeviceId || newDeviceId === '') {
		console.log(`   → Dispositivo vazio, parando monitor...`);
		stopAudioVolumeMonitor(source);
		return;
	}

	// Se não está ativo, INICIA com o novo dispositivo
	if (!vars.isActive()) {
		console.log(`   → Monitor inativo, INICIANDO com novo dispositivo...`);
		await startAudioVolumeMonitor(source, newDeviceId);
		return;
	}

	// Se está ativo, verifica se realmente mudou
	if (vars.deviceId() === newDeviceId) {
		console.log(`   → Dispositivo é o mesmo, nenhuma mudança necessária`);
		return;
	}

	console.log(`   → Monitor ativo, REINICIANDO com novo dispositivo...`);
	stopAudioVolumeMonitor(source);

	// Pequeno delay para garantir que tudo foi limpo
	await new Promise(resolve => setTimeout(resolve, 100));

	// Reinicia com novo dispositivo
	await startAudioVolumeMonitor(source, newDeviceId);
}

/* ================================ */
//	HANDLERS
/* ================================ */

/**
 * Processa atualização de volume do worklet
 * @param {string} source - 'input' ou 'output'
 * @param {object} data - { percent: number }
 */
function handleVolumeMonitorUpdate(source, data) {
	// Emite para UI via RendererAPI
	if (globalThis.RendererAPI?.emitUIChange) {
		const ev = source === INPUT ? 'onInputVolumeUpdate' : 'onOutputVolumeUpdate';
		globalThis.RendererAPI.emitUIChange(ev, { percent: data.percent });
	}
}

/* ================================ */
//	EXPORTS (RendererAPI)
/* ================================ */

module.exports = {
	startAudioVolumeMonitor,
	stopAudioVolumeMonitor,
	switchAudioVolumeDevice,
};
