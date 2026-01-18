/**
 * 🔥 VOSK TRANSCRIBE - STREAMING CONTÍNUO (COMO DEEPGRAM)
 *
 * NOVA ABORDAGEM:
 * - Mantém MediaRecorder SEMPRE ativo (nunca fecha)
 * - Envia chunks de áudio continuamente via IPC (não espera por silêncio)
 * - Transcrição incremental: recebe resultados parciais e finais do Vosk
 * - Mantém Vosk "vivo" entre frases (sem reiniciar contexto)
 *
 * Padrão idêntico ao Deepgram: capture -> send chunks -> detect silence -> finalize -> continue
 */

/* ================================ */
//	IMPORTS
/* ================================ */
const { ipcRenderer } = require('electron');

/* ================================ */
//	CONSTANTES
/* ================================ */

const INPUT = 'input';
const OUTPUT = 'output';

// Chunk size para envio contínuo de áudio (500ms de áudio a 16kHz = ~16KB)
const CHUNK_SEND_INTERVAL_MS = 500;

// 🔥 AUDIO WORKLET - Usar o mesmo que Deepgram usa
const AUDIO_CONTEXT_WORKLET_PATH = './deepgram-audio-worklet-processor.js';

// Timeouts de silêncio para finalizar transcrição
const SILENCE_TIMEOUT_INPUT = 500; // ms para entrada
const SILENCE_TIMEOUT_OUTPUT = 700; // ms para saída

// 🔥 VAD (Voice Activity Detection) - COPIADO EXATAMENTE DO DEEPGRAM
const AUDIO_SAMPLE_RATE = 16000; // Hz
const VAD_FRAME_DURATION_MS = 0.03; // 30ms por frame (idêntico ao Deepgram)
const VAD_WINDOW_SIZE = 6; // Últimos ~6 frames (~50-100ms, idêntico ao Deepgram)
const FALLBACK_VOLUME_THRESHOLD = 20; // Limiar de volume para fallback (idêntico ao Deepgram)

// Configuração VAD nativa
let useNativeVADVosk = true;
let vadAvailableVosk = false;
let vadInstanceVosk = null;

/* ================================ */
//	ESTADO DO VOSK
/* ================================ */

const voskVars = {
	input: {
		_isActive: false,
		_stream: null,
		_audioContext: null,
		_processor: null, // AudioWorkletNode (substitui ScriptProcessorNode)
		_source: null, // MediaStreamSource
		_startAt: null,
		_chunkBuffer: [], // Buffer de chunks para envio contínuo
		_chunkSendTimer: null,
		_vadLastSpeechTime: null, // Último momento que detectou fala (para VAD)
		_lastPercent: 0, // Último valor de volume medido (%)
		_lastIsSpeech: false, // Último resultado de VAD
		_lastVADTimestamp: null, // Último timestamp de VAD
		vadWindow: [], // Janela deslizante de volume (para fallback suavizado)

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
		audioContext() {
			return this._audioContext;
		},
		setAudioContext(val) {
			this._audioContext = val;
		},
		recorder() {
			return this._recorder;
		},
		setRecorder(val) {
			this._recorder = val;
		},
		startAt() {
			return this._startAt;
		},
		setStartAt(val) {
			this._startAt = val;
		},
		chunkBuffer() {
			return this._chunkBuffer;
		},
		clearChunkBuffer() {
			this._chunkBuffer = [];
		},
		chunkSendTimer() {
			return this._chunkSendTimer;
		},
		setChunkSendTimer(val) {
			this._chunkSendTimer = val;
		},

		author: 'Você',
		lastActive: null,
		lastTranscript: '',
		inSilence: false,
		lastPercent: 0,
		noiseStartTime: null,
		noiseStopTime: null,
		shouldFinalizeAskCurrent: false,
	},
	output: {
		_isActive: false,
		_stream: null,
		_audioContext: null,
		_processor: null, // AudioWorkletNode
		_source: null, // MediaStreamSource
		_startAt: null,
		_chunkBuffer: [],
		_chunkSendTimer: null,
		_vadLastSpeechTime: null, // Último momento que detectou fala (para VAD)
		_lastPercent: 0, // Último valor de volume medido (%)
		_lastIsSpeech: false, // Último resultado de VAD
		_lastVADTimestamp: null, // Último timestamp de VAD
		vadWindow: [], // Janela deslizante de volume (para fallback suavizado)

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
		audioContext() {
			return this._audioContext;
		},
		setAudioContext(val) {
			this._audioContext = val;
		},
		recorder() {
			return this._recorder;
		},
		setRecorder(val) {
			this._recorder = val;
		},
		startAt() {
			return this._startAt;
		},
		setStartAt(val) {
			this._startAt = val;
		},
		chunkBuffer() {
			return this._chunkBuffer;
		},
		clearChunkBuffer() {
			this._chunkBuffer = [];
		},
		chunkSendTimer() {
			return this._chunkSendTimer;
		},
		setChunkSendTimer(val) {
			this._chunkSendTimer = val;
		},

		author: 'Outros',
		lastActive: null,
		lastTranscript: '',
		inSilence: false,
		lastPercent: 0,
		noiseStartTime: null,
		noiseStopTime: null,
		shouldFinalizeAskCurrent: false,
	},
};

/* ================================ */
//	INICIALIZAÇÃO
/* ================================ */

/**
 * Inicia captura contínua de áudio (nunca para até stopVosk ser chamado)
 */
async function startVosk(source, UIElements) {
	const config = {
		input: {
			deviceKey: 'inputSelect',
			accessMessage: '🎤 Solicitando acesso à entrada de áudio (Microfone)...',
			startLog: '▶️ Captura Vosk INPUT iniciada (STREAMING CONTÍNUO)',
		},
		output: {
			deviceKey: 'outputSelect',
			accessMessage: '🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...',
			startLog: '▶️ Captura Vosk OUTPUT iniciada (STREAMING CONTÍNUO)',
		},
	};

	const cfg = config[source];
	if (!cfg) throw new Error(`❌ Source inválido: ${source}`);

	const vars = voskVars[source];

	if (vars.isActive?.()) {
		console.warn(`⚠️ Vosk ${source.toUpperCase()} já ativo`);
		return;
	}

	try {
		console.log(cfg.accessMessage);

		// 🔥 INICIALIZA VAD NATIVO (idêntico ao Deepgram)
		console.log('🔥 Inicializando VAD nativo...');
		if (!vadInstanceVosk && !vadAvailableVosk) {
			try {
				vadInstanceVosk = initVADVosk();
				vadAvailableVosk = !!vadInstanceVosk;
				if (vadAvailableVosk) {
					console.log('✅ VAD nativo disponível (webrtcvad)');
				} else {
					console.log('⚠️ VAD nativo não disponível, usando fallback por volume');
				}
			} catch (e) {
				console.warn('⚠️ Erro ao inicializar VAD:', e.message || e);
				vadAvailableVosk = false;
			}
		}

		// 🔥 SEGUNDO: Inicializa servidor Vosk antes de começar a capturar áudio
		console.log('🔥 Inicializando servidor Vosk Python...');
		try {
			await ipcRenderer.invoke('vosk-init-server');
			console.log('✅ Servidor Vosk inicializado e pronto');
		} catch (error) {
			console.error('❌ Erro ao inicializar servidor Vosk:', error);
			throw error;
		}

		const deviceId = UIElements[cfg.deviceKey]?.value;
		if (!deviceId) {
			console.warn(`⚠️ Nenhum dispositivo ${source} selecionado`);
			return;
		}

		// Obtém stream de áudio
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: deviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false,
			},
		});

		console.log(`✅ Acesso ao áudio ${source.toUpperCase()} autorizado`);

		// 🔥 NOVO: Usa AudioWorkletNode (idêntico ao Deepgram)
		// Isso fornece frames de tamanho adequado para o webrtcvad (320, 640 ou 960 samples)
		const audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ sampleRate: AUDIO_SAMPLE_RATE });
		await audioCtx.audioWorklet.addModule(AUDIO_CONTEXT_WORKLET_PATH);

		// MediaStreamSource
		const mediaSource = audioCtx.createMediaStreamSource(stream);

		// AudioWorkletNode: Processa áudio em pequenos buffers
		const processor = new AudioWorkletNode(audioCtx, 'deepgram-audio-worklet-processor');
		processor.port.postMessage({ type: 'setThreshold', threshold: source === INPUT ? 0.02 : 0.005 });

		let audioDataCount = 0;
		let volumeUpdateCount = 0;

		processor.port.onmessage = event => {
			try {
				if (event.data.type === 'audioData') {
					audioDataCount++;
					if (audioDataCount === 1) console.log(`🎧 Recebido primeiro audioData do worklet (${source})`);
				} else if (event.data.type === 'volumeUpdate') {
					volumeUpdateCount++;
				}

				processVoskAudioMessage(source, event.data).catch(error =>
					console.error(`❌ Erro ao processar mensagem do worklet (${source}):`, error),
				);
			} catch (error) {
				console.error(`❌ Erro crítico no handler de mensagem (${source}):`, error);
			}
		};

		// Conecta: Source → Processor → Destination
		mediaSource.connect(processor);
		processor.connect(audioCtx.destination);

		// Atualiza estado
		vars.setStream(stream);
		vars.setAudioContext(audioCtx);
		vars.setSource(mediaSource);
		vars.setProcessor(processor);
		vars.setActive(true);
		vars.setStartAt(Date.now());
		vars.lastActive = Date.now();

		// Inicia envio contínuo de chunks
		startChunkSender(source, vars);

		console.log(cfg.startLog);
	} catch (error) {
		console.error(`❌ Erro ao iniciar Vosk ${source.toUpperCase()}:`, error);
		vars.setActive(false);
		stopVosk(source);
		throw error;
	}
}

/**
 * Processa mensagens de áudio do AudioWorklet (idêntico ao Deepgram)
 */
async function processVoskAudioMessage(source, data) {
	const vars = voskVars[source];

	if (data.type === 'audioData') {
		// 🔥 CORRIGIDO: O worklet envia pcm16.buffer (ArrayBuffer), precisa converter para Int16Array
		const pcm16Array = data.pcm16 instanceof ArrayBuffer ? new Int16Array(data.pcm16) : data.pcm16;

		// Detecta fala usando VAD
		const isSpeech = detectSpeechVosk(source, vars, pcm16Array, data.percent || 0);
		updateVADStateVosk(vars, isSpeech);

		// Só acumula se detectou fala
		if (isSpeech) {
			vars.chunkBuffer().push(new Int16Array(pcm16Array));
			// Debug: Log a cada N buffers
			if (vars.chunkBuffer().length % 10 === 0) {
				console.log(
					`📥 Acumulados ${vars.chunkBuffer().length} buffers VAD-speech (${vars.chunkBuffer().reduce((s, c) => s + c.byteLength, 0)} bytes)`,
				);
			}
		}
	} else if (data.type === 'volumeUpdate') {
		// Atualiza volume
		vars._lastPercent = data.percent;
		vars.lastPercent = data.percent;

		if (globalThis.RendererAPI?.emitUIChange) {
			const ev = source === INPUT ? 'onInputVolumeUpdate' : 'onOutputVolumeUpdate';
			globalThis.RendererAPI.emitUIChange(ev, { percent: data.percent });
		}

		// Detecta silêncio
		handleSilenceDetectionVosk(source, data.percent, vars);
	}
}

/**
 * Para captura de áudio
 */
async function stopVosk(source) {
	const vars = voskVars[source];

	if (!vars.isActive?.()) return;

	try {
		// Para envio de chunks
		if (vars.chunkSendTimer?.()) {
			clearInterval(vars.chunkSendTimer?.());
			vars.setChunkSendTimer(null);
		}

		// Envia chunks pendentes
		await sendPendingChunks(source, vars);

		// Desconecta processador
		const processor = vars.processor?.();
		if (processor) {
			try {
				processor.disconnect();
			} catch (e) {
				console.warn(`⚠️ Erro ao desconectar processor (${source}):`, e);
			}
		}

		// Desconecta source
		const source_node = vars.source?.();
		if (source_node) {
			try {
				source_node.disconnect();
			} catch (e) {
				console.warn(`⚠️ Erro ao desconectar source (${source}):`, e);
			}
		}

		// Fecha stream
		vars
			.stream()
			?.getTracks()
			.forEach(track => track.stop());

		vars.setActive(false);
		vars.setStream(null);
		vars.setProcessor(null);
		vars.setSource(null);
		vars.setAudioContext(null);
		vars.setStartAt(null);

		console.log(`🛑 Vosk ${source.toUpperCase()} parado`);
	} catch (error) {
		console.error(`❌ Erro ao parar Vosk ${source.toUpperCase()}:`, error);
	}
}

/* ================================ */
//	ENVIO CONTÍNUO DE CHUNKS
/* ================================ */

/**
 * Inicia timer para enviar chunks periodicamente
 */
function startChunkSender(source, vars) {
	if (vars.chunkSendTimer?.()) {
		clearInterval(vars.chunkSendTimer?.());
	}

	const timer = setInterval(async () => {
		const chunks = vars.chunkBuffer();
		if (chunks.length > 0) {
			const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
			// 🔥 Ignora se vazios ou muito pequenos (< ~1KB = ~64ms @ 16kHz)
			if (totalSize > 1000) {
				console.log(`📤 Enviando ${chunks.length} chunks ao Vosk (${totalSize} bytes PCM 16-bit)...`);
				await sendChunksToVosk(source, vars, chunks);
				vars.clearChunkBuffer();
			} else {
				console.warn(`⚠️ PCM muito pequeno (${totalSize}b), acumulando...`);
			}
		}
	}, CHUNK_SEND_INTERVAL_MS);

	vars.setChunkSendTimer(timer);
}

/**
 * Envia chunks de PCM 16-bit acumulados ao Vosk via IPC
 * Agora usa VAD EXATAMENTE IGUAL AO DEEPGRAM
 * Só envia se houver áudio real detectado
 */
async function sendChunksToVosk(source, vars, chunks) {
	try {
		if (chunks.length === 0) return;

		// 🔥 Monta buffer único a partir dos chunks PCM 16-bit
		const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
		const pcmBuffer = new Int16Array(totalSize / 2); // Divide por 2 porque cada sample = 2 bytes
		let offset = 0;

		for (const chunk of chunks) {
			const view = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
			pcmBuffer.set(view, offset);
			offset += view.length;
		}

		// 🔥 NÃO VALIDAR VAD NOVAMENTE: Já foi validado ao acumular chunks
		// Se chegou aqui com chunks, é porque passou por VAD

		console.log(`📦 PCM 16-bit combinado: ${pcmBuffer.byteLength} bytes (${chunks.length} chunks) - ENVIANDO`);

		// 🔥 VALIDAÇÃO: Rejeita se muito pequeno
		if (pcmBuffer.byteLength < 1000) {
			console.warn(`⚠️ PCM muito pequeno (${pcmBuffer.byteLength}b), ignorando...`);
			return;
		}

		// Envia para Vosk via IPC (main.js converterá PCM → WAV se necessário)
		const buffer = Buffer.from(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength);
		const startTime = Date.now();

		// 🔥 NOVO: Chama handler específico para PCM (não WebM)
		const finalResult = await ipcRenderer.invoke('vosk-transcribe-pcm', buffer);

		const duration = Date.now() - startTime;
		console.log(`✅ Vosk processou em ${duration}ms - Resultado:`, finalResult);

		// 🔥 CORRIGIDO: Usar partial se final vazio (Vosk retorna incremental)
		const transcribedText = (finalResult?.final?.trim?.() || finalResult?.partial?.trim?.() || '').trim();

		if (!transcribedText) {
			console.log(`📝 Vosk ainda processando... (partial vazio)`);
			return;
		}

		console.log(`📝 Resultado: "${transcribedText}"`);

		// Atualiza UI
		if (globalThis.RendererAPI?.emitUIChange) {
			globalThis.RendererAPI.emitUIChange('onTranscriptAdd', {
				author: vars.author,
				text: transcribedText,
				timeStr: new Date().toLocaleTimeString(),
				elementId: 'conversation',
				placeholderId: `vosk-${source}-${Date.now()}`,
			});

			globalThis.RendererAPI.emitUIChange('onPlaceholderFulfill', {
				speaker: vars.author,
				text: transcribedText,
				placeholderId: `vosk-${source}-${Date.now()}`,
			});
		}

		vars.lastTranscript = transcribedText;

		// Para OUTPUT: chama handleCurrentQuestion (Deepgram pattern)
		if (source === OUTPUT && globalThis.RendererAPI?.handleCurrentQuestion) {
			globalThis.RendererAPI.handleCurrentQuestion(vars.author, transcribedText, {
				isInterim: false,
				shouldFinalizeAskCurrent: vars.shouldFinalizeAskCurrent,
			});
		}
	} catch (error) {
		console.error(`❌ Erro ao enviar chunks ao Vosk:`, error);
	}
}

/**
 * Envia chunks pendentes quando MediaRecorder para
 */
async function sendPendingChunks(source, vars) {
	const chunks = vars.chunkBuffer();
	if (chunks.length > 0) {
		console.log(`📤 Enviando ${chunks.length} chunks FINAIS ao Vosk...`);
		await sendChunksToVosk(source, vars, chunks);
		vars.clearChunkBuffer();
	}
}

/* ================================ */
//	MONITORAMENTO DE VOLUME E SILÊNCIO
/* ================================ */

/**
 * Monitora volume e detecta silêncio
 */
function monitorVolumeVosk(source, analyser, vars) {
	const dataArray = new Uint8Array(analyser.frequencyBinCount);
	let logCounter = 0;

	const updateVolume = () => {
		if (!vars.isActive?.()) return;

		analyser.getByteFrequencyData(dataArray);

		const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
		const percent = (average / 255) * 100;

		vars._lastPercent = percent;
		vars.lastPercent = percent;

		// Log periodicamente
		if (logCounter++ % 30 === 0) {
			console.log(`📊 Volume ${source}: ${percent.toFixed(2)}%`);
		}

		// Atualiza UI
		if (globalThis.RendererAPI?.emitUIChange) {
			const ev = source === INPUT ? 'onInputVolumeUpdate' : 'onOutputVolumeUpdate';
			globalThis.RendererAPI.emitUIChange(ev, { percent });
		}

		// Detecta silêncio
		handleSilenceDetectionVosk(source, percent, vars);

		requestAnimationFrame(updateVolume);
	};

	updateVolume();
}

/**
 * Detecta silêncio e finaliza transcrição
 */
function handleSilenceDetectionVosk(source, percent, vars) {
	const silenceTimeout = source === INPUT ? SILENCE_TIMEOUT_INPUT : SILENCE_TIMEOUT_OUTPUT;
	const now = Date.now();
	const MIN_RECORDING_TIME = 800;
	const VOLUME_THRESHOLD = 3;

	const isSpeech = percent > VOLUME_THRESHOLD;

	if (isSpeech) {
		if (vars.inSilence) {
			if (!vars.noiseStartTime) vars.noiseStartTime = Date.now();
			const noiseDuration = vars.noiseStartTime - vars.noiseStopTime;
			console.log(`🟢 🟢 🟢 ***** 🔊 Fala detectada após ${noiseDuration}ms - Volume: ${percent.toFixed(2)}% *****`);
		}

		vars.inSilence = false;
		vars.shouldFinalizeAskCurrent = false;
		vars.lastActive = now;
		vars.noiseStartTime = null;

		// 🔥 VAD: Atualiza último momento de fala detectada
		vars._vadLastSpeechTime = now;
	} else {
		const elapsed = now - vars.lastActive;
		const recordingTime = now - (vars.startAt?.() || now);

		// Detectou silêncio estável
		if (elapsed >= silenceTimeout && !vars.inSilence && recordingTime >= MIN_RECORDING_TIME) {
			vars.inSilence = true;
			vars.shouldFinalizeAskCurrent = true;
			vars.noiseStopTime = Date.now();

			console.log(
				`🔴 🔴 🔴 ***** 🔇 Silêncio estável (${elapsed}ms, recording: ${recordingTime}ms) - Volume: ${percent.toFixed(2)}% *****`,
			);

			// 🔥 ENVIA chunks acumulados ao detectar silêncio
			const chunks = vars.chunkBuffer();
			if (chunks.length > 0) {
				console.log(`📤 Detectado silêncio - ENVIANDO ${chunks.length} chunks ao Vosk...`);
				sendChunksToVosk(source, vars, chunks).catch(error =>
					console.error(`❌ Erro ao enviar chunks no silêncio:`, error),
				);
				vars.clearChunkBuffer();
			}

			// IMPORTANTE: Não para a gravação aqui!
			// Apenas marca como "silêncio" - a gravação continua
			// Isso permite capturar áudio novamente quando a pessoa fala de novo
		}
	}
}

/* ================================ */
//	FUNÇÕES VAD (Voice Activity Detection)
//	COPIADAS EXATAMENTE DO DEEPGRAM
/* ================================ */

/**
 * Inicializa VAD nativo (webrtcvad) - idêntico ao Deepgram
 */
function initVADVosk() {
	let VAD = null;
	try {
		VAD = require('webrtcvad');
	} catch {
		try {
			VAD = require('node-webrtcvad');
		} catch {
			return null;
		}
	}

	if (!VAD) return null;

	try {
		if (typeof VAD?.default === 'function') {
			// webrtcvad (ESM default)
			const mode = 2; // Modo agressivo (idêntico ao Deepgram)
			return new VAD.default(AUDIO_SAMPLE_RATE, mode);
		} else if (typeof VAD === 'function') {
			// node-webrtcvad (CommonJS)
			const mode = 2;
			return new VAD(mode);
		} else if (VAD?.VAD) {
			// classe interna
			const mode = 2;
			return new VAD.VAD(mode);
		}
	} catch (e) {
		console.warn('⚠️ Erro ao inicializar VAD nativo:', e.message || e);
	}

	return null;
}

/**
 * Tenta chamar VAD com diferentes assinaturas - idêntico ao Deepgram
 */
function tryCallVADInstanceVosk(frame, sampleRate) {
	if (typeof vadInstanceVosk.process === 'function') {
		if (vadInstanceVosk.process.length === 2) {
			return processVADResultVosk(vadInstanceVosk.process(sampleRate, frame));
		} else {
			return processVADResultVosk(vadInstanceVosk.process(frame));
		}
	} else if (typeof vadInstanceVosk.isSpeech === 'function') {
		return !!vadInstanceVosk.isSpeech(frame, sampleRate);
	} else if (typeof vadInstanceVosk === 'function') {
		return !!vadInstanceVosk(frame, sampleRate);
	}
	return null;
}

/**
 * Processa resultado do VAD - idêntico ao Deepgram
 */
function processVADResultVosk(result) {
	if (typeof result === 'boolean') return result;
	if (typeof result === 'number') return result > 0;
	return null;
}

/**
 * Verifica se VAD nativo está habilitado - idêntico ao Deepgram
 */
function isVADEnabledVosk() {
	return useNativeVADVosk && !!vadAvailableVosk;
}

/**
 * Executa VAD nativo - idêntico ao Deepgram
 */
function runNativeVADVosk(frame, sampleRate = AUDIO_SAMPLE_RATE) {
	try {
		if (vadInstanceVosk !== undefined && vadInstanceVosk) {
			try {
				return tryCallVADInstanceVosk(frame, sampleRate);
			} catch (error_) {
				console.warn('runNativeVADVosk: erro ao chamar vadInstance:', error_ && (error_.message || error_));
				return null;
			}
		}
	} catch (err) {
		console.warn('runNativeVADVosk erro:', err && (err.message || err));
	}
	return null;
}

/**
 * Detecta fala usando VAD nativo ou fallback - IDÊNTICO AO DEEPGRAM
 */
function detectSpeechVosk(source, vars, pcm16Data, percent) {
	let isSpeech = null;

	// Tenta VAD nativo se disponível
	if (isVADEnabledVosk()) {
		try {
			const sampleRate = AUDIO_SAMPLE_RATE;
			const pcm = new Int16Array(pcm16Data);
			const frameSize = Math.floor(sampleRate * VAD_FRAME_DURATION_MS); // ~480 samples

			for (let i = 0; i + frameSize <= pcm.length; i += frameSize) {
				const frame = pcm.subarray(i, i + frameSize);
				const vadDecision = runNativeVADVosk(frame, sampleRate);
				if (vadDecision === true) {
					isSpeech = true;
					break;
				}
				if (vadDecision === null) {
					break;
				}
			}
		} catch (e) {
			console.warn('⚠️ Erro ao executar VAD nativo:', e.message || e);
			isSpeech = null;
		}
	}

	// Fallback: VAD por energia com janela deslizante (idêntico ao Deepgram)
	return isSpeech === null ? fallbackIsSpeechVosk(vars, percent) : isSpeech;
}

/**
 * Fallback de VAD baseado em energia com suavização (multi-frame) - IDÊNTICO AO DEEPGRAM
 */
function fallbackIsSpeechVosk(vars, percent) {
	if (!vars.vadWindow) vars.vadWindow = [];
	const window = vars.vadWindow;
	window.push(percent);
	if (window.length > VAD_WINDOW_SIZE) window.shift(); // últimos ~6 frames
	const avg = window.reduce((a, b) => a + b, 0) / window.length;

	// heurística ajustada: use 20% (idêntico ao Deepgram)
	const result = avg > FALLBACK_VOLUME_THRESHOLD;

	if (result !== vars._lastIsSpeech) {
		const status = result ? '🔊 FALA' : '🔇 SILÊNCIO';
		console.log(`   VAD Fallback: ${status} (avg: ${avg.toFixed(1)}%, threshold: ${FALLBACK_VOLUME_THRESHOLD}%)`);
	}

	return result;
}

/**
 * Atualiza estado VAD - idêntico ao Deepgram
 */
function updateVADStateVosk(vars, isSpeech) {
	vars._lastIsSpeech = !!isSpeech;
	vars._lastVADTimestamp = Date.now();
	if (isSpeech) vars.lastActive = Date.now();
}

/* ================================ */
//	INTERFACE PÚBLICA
/* ================================ */

/**
 * Inicia Vosk para INPUT + OUTPUT
 */
async function startAudioVoskLocal(UIElements) {
	try {
		// Inicia INPUT (você) + OUTPUT (outros)
		if (UIElements.inputSelect?.value) await startVosk(INPUT, UIElements);
		if (UIElements.outputSelect?.value) await startVosk(OUTPUT, UIElements);
	} catch (error) {
		console.error('❌ Erro ao iniciar Vosk:', error);
		throw error;
	}
}

/**
 * Para Vosk para INPUT + OUTPUT
 */
function stopAudioVoskLocal() {
	stopVosk(INPUT);
	stopVosk(OUTPUT);
}

/**
 * Muda dispositivo para um source
 */
function switchDeviceVoskLocal(source, newDeviceId) {
	const vars = voskVars[source];
	if (vars.isActive?.()) {
		stopVosk(source);
		// TODO: Implementar reinício com novo dispositivo após mudança
		vars.currentDeviceId = newDeviceId;
	}
}

/* ================================ */
//	EXPORTS
/* ================================ */

module.exports = {
	startAudioVoskLocal,
	stopAudioVoskLocal,
	switchDeviceVoskLocal,
};
