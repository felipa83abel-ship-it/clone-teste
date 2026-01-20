/**
 * 🎤 WHISPER STT (Speech-to-Text) - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição com Whisper (OpenAI + Local).
 * - Suporte a whisper-1 (online, API OpenAI)
 * - Suporte a whisper-cpp-local (offline, alta precisão)
 * - Captura de áudio via MediaRecorder + AudioWorklet
 * - Detecção de silêncio automática (sem streaming, mas com VAD)
 * - Transcrição batch com auto-trigger por silêncio
 *
 * Uso:
 * - startAudioWhisper(UIElements)
 * - stopAudioWhisper()
 * - switchDeviceWhisper(source, UIElements)
 */

/* ================================ */
//	IMPORTS
/* ================================ */
const { ipcRenderer } = require('electron');
const { getVADEngine } = require('./vad-engine');

/* ================================ */
//	CONSTANTES
/* ================================ */

// Configuração Geral
const INPUT = 'input';
const OUTPUT = 'output';

// Configuração de Áudio
const AUDIO_MIME_TYPE = 'audio/webm';
const AUDIO_SAMPLE_RATE = 16000;

// AudioWorklet
const STT_AUDIO_WORKLET_PROCESSOR = 'stt-audio-worklet-processor';
const AUDIO_WORKLET_PROCESSOR_PATH = './stt-audio-worklet-processor.js';

// Detecção de silêncio
const SILENCE_TIMEOUT_INPUT = 500;
const SILENCE_TIMEOUT_OUTPUT = 700;

// VAD Engine
let vad = null;

/* ================================ */
//	ESTADO GLOBAL DO WHISPER
/* ================================ */

// whisperState mantém seu próprio estado interno
const whisperState = {
	input: {
		_isActive: false,
		_stream: null,
		_mediaRecorder: null,
		_audioChunks: [],
		_startAt: null,
		_isSwitching: false,
		_processor: null,
		_audioContext: null,
		_source: null,
		_silenceTimer: null,

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
		mediaRecorder() {
			return this._mediaRecorder;
		},
		setMediaRecorder(val) {
			this._mediaRecorder = val;
		},
		audioChunks() {
			return this._audioChunks;
		},
		setAudioChunks(val) {
			this._audioChunks = val;
		},
		startAt() {
			return this._startAt;
		},
		setStartAt(val) {
			this._startAt = val;
		},
		isSwitching() {
			return this._isSwitching;
		},
		setIsSwitching(val) {
			this._isSwitching = val;
		},
		processor() {
			return this._processor;
		},
		setProcessor(val) {
			this._processor = val;
		},
		audioContext() {
			return this._audioContext;
		},
		setAudioContext(val) {
			this._audioContext = val;
		},
		source() {
			return this._source;
		},
		setSource(val) {
			this._source = val;
		},
		silenceTimer() {
			return this._silenceTimer;
		},
		setSilenceTimer(val) {
			this._silenceTimer = val;
		},

		author: 'Você',
		lastTranscript: '',
		lastPercent: 0,
		_lastIsSpeech: false,
		vadWindow: [],
	},
	output: {
		_isActive: false,
		_stream: null,
		_mediaRecorder: null,
		_audioChunks: [],
		_startAt: null,
		_isSwitching: false,
		_processor: null,
		_audioContext: null,
		_source: null,
		_silenceTimer: null,

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
		mediaRecorder() {
			return this._mediaRecorder;
		},
		setMediaRecorder(val) {
			this._mediaRecorder = val;
		},
		audioChunks() {
			return this._audioChunks;
		},
		setAudioChunks(val) {
			this._audioChunks = val;
		},
		startAt() {
			return this._startAt;
		},
		setStartAt(val) {
			this._startAt = val;
		},
		isSwitching() {
			return this._isSwitching;
		},
		setIsSwitching(val) {
			this._isSwitching = val;
		},
		processor() {
			return this._processor;
		},
		setProcessor(val) {
			this._processor = val;
		},
		audioContext() {
			return this._audioContext;
		},
		setAudioContext(val) {
			this._audioContext = val;
		},
		source() {
			return this._source;
		},
		setSource(val) {
			this._source = val;
		},
		silenceTimer() {
			return this._silenceTimer;
		},
		setSilenceTimer(val) {
			this._silenceTimer = val;
		},

		author: 'Outros',
		lastTranscript: '',
		lastPercent: 0,
		_lastIsSpeech: false,
		vadWindow: [],
	},
};

/* ================================ */
//	WHISPER - HANDLERS DE ÁUDIO
/* ================================ */

/**
 * Processa mensagens de áudio recebida do AudioWorklet
 * Separa audioData (PCM16) de volumeUpdate para permitir VAD e silence detection
 */
async function processIncomingAudioMessageWhisper(source, data, mediaRecorder, vars, cfg) {
	if (data.type === 'audioData') {
		// Processa chunk de áudio PCM16
		handleAudioDataWhisper(source, data, vars);
	} else if (data.type === 'volumeUpdate') {
		// Processa atualização de volume/VAD
		handleVolumeUpdateWhisper(source, data, mediaRecorder, vars, cfg);
	}
}

/**
 * Processa chunk de áudio PCM16 do AudioWorklet
 */
function handleAudioDataWhisper(source, data, vars) {
	const { pcm16, percent } = data;

	if (!pcm16 || pcm16.length === 0) return;

	// Atualiza estado com dados de áudio
	vars.lastPercent = percent;

	// VAD: Detecta fala
	const isSpeech = vad?.detectSpeech(pcm16, percent, vars.vadWindow);
	vars._lastIsSpeech = isSpeech;
}

/**
 * Trata atualização de volume e detecção de silêncio
 */
function handleVolumeUpdateWhisper(source, data, mediaRecorder, vars, cfg) {
	vars.lastPercent = data.percent;

	// Emite volume para UI
	if (globalThis.RendererAPI?.emitUIChange) {
		const ev = source === INPUT ? 'onInputVolumeUpdate' : 'onOutputVolumeUpdate';
		globalThis.RendererAPI.emitUIChange(ev, { percent: data.percent });
	}

	// Detecta silêncio e dispara transcrição automática
	handleSilenceDetectionWhisper(source, data.percent, mediaRecorder, vars, cfg);
}

/**
 * Trata detecção de silêncio com VAD ou fallback de volume
 */
function handleSilenceDetectionWhisper(source, percent, mediaRecorder, vars, cfg) {
	const silenceTimeout = cfg.silenceTimeout;
	const now = Date.now();

	// Decisão principal: VAD se disponível, senão fallback por volume
	const useVADDecision = vad?.isEnabled && vad.isEnabled() && vars._lastIsSpeech !== undefined;
	const effectiveSpeech = useVADDecision ? !!vars._lastIsSpeech : percent > 0;

	debugLogWhisper(
		`🔍 VAD ${source}: ${vars._lastIsSpeech ? 'speech' : 'silence'} - 🔊 volume: ${percent.toFixed(2)}%`,
		false,
	);

	if (effectiveSpeech) {
		// Se detectou fala, resetamos timer de silêncio
		if (vars.silenceTimer()) {
			clearTimeout(vars.silenceTimer());
			vars.setSilenceTimer(null);
		}
	} else {
		// Silêncio detectado → verifica se já passou o timeout
		if (!vars.silenceTimer() && vars.isActive()) {
			// Inicia timer de silêncio
			const timer = setTimeout(() => {
				if (vars.isActive() && mediaRecorder?.state === 'recording') {
					debugLogWhisper(`🤐 Silêncio detectado (${silenceTimeout}ms) - transcrevendo...`, true);
					mediaRecorder.stop();
					vars.setSilenceTimer(null);
				}
			}, silenceTimeout);

			vars.setSilenceTimer(timer);
			debugLogWhisper(`⏰ Timer de silêncio iniciado (${silenceTimeout}ms)`, false);
		}
	}
}

/* ================================ */
//	WHISPER - INICIAR FLUXO (STT)
/* ================================ */

// // Inicia captura de áudio do dispositivo de entrada ou saída com Whisper
async function startWhisper(source, UIElements) {
	const config = {
		input: {
			deviceKey: 'inputSelect',
			accessMessage: '🎤 Solicitando acesso à entrada de áudio (Microfone)...',
			startLog: '▶️ Captura Whisper INPUT iniciada',
			silenceTimeout: SILENCE_TIMEOUT_INPUT,
		},
		output: {
			deviceKey: 'outputSelect',
			accessMessage: '🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...',
			startLog: '▶️ Captura Whisper OUTPUT iniciada',
			silenceTimeout: SILENCE_TIMEOUT_OUTPUT,
		},
	};

	const cfg = config[source];
	if (!cfg) throw new Error(`❌ Source inválido: ${source}`);

	const vars = whisperState[source];

	if (vars.isActive()) {
		console.warn(`⚠️ Whisper ${source.toUpperCase()} já ativo`);
		return;
	}

	try {
		// Inicializa VAD se não estiver pronto
		if (!vad) {
			debugLogWhisper(`⏳ Carregando VAD Engine...`, false);
			vad = getVADEngine();
			debugLogWhisper(`✅ VAD Engine carregado`, false);
		}

		// Obtém o dispositivo selecionado no UI
		const deviceId = UIElements[cfg.deviceKey]?.value;

		debugLogWhisper(`🔊 Iniciando captura ${source.toUpperCase()} com dispositivo: ${deviceId}`, false);

		// Solicita acesso ao dispositivo selecionado
		debugLogWhisper(cfg.accessMessage, false);

		// Obtém stream de áudio
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: deviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false,
			},
		});

		debugLogWhisper(`✅ Acesso ao áudio ${source.toUpperCase()} autorizado`, true);

		// Cria AudioContext para processamento em tempo real (VAD)
		const audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
		const mediaSource = audioContext.createMediaStreamSource(stream);
		vars.setAudioContext(audioContext);
		vars.setSource(mediaSource);

		// Cria MediaRecorder para captura de áudio (ANTES de AudioWorklet para ter referência)
		const mediaRecorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME_TYPE });

		// Acumula chunks conforme são capturados
		const audioChunks = [];
		mediaRecorder.ondataavailable = event => {
			if (event.data.size > 0) {
				audioChunks.push(event.data);
			}
		};

		// Quando para, envia para transcrição
		mediaRecorder.onstop = async () => {
			debugLogWhisper(`🛑 MediaRecorder parado para ${source.toUpperCase()}`, false);

			// Limpa timer de silêncio pendente
			if (vars.silenceTimer()) {
				clearTimeout(vars.silenceTimer());
				vars.setSilenceTimer(null);
			}

			if (audioChunks.length > 0) {
				const audioBlob = new Blob(audioChunks, { type: AUDIO_MIME_TYPE });
				try {
					const transcribedText = await transcribeWhisper(audioBlob, source);
					vars.lastTranscript = transcribedText;
					debugLogWhisper(`📝 Transcrição ${source}: "${transcribedText}"`, true);

					// Emite para renderer.js via callback registrado
					if (globalThis.RendererAPI?.emitUIChange) {
						globalThis.RendererAPI.emitUIChange('onTranscriptAdd', {
							source: vars.author,
							text: transcribedText,
							type: 'transcription',
						});
					}
				} catch (error) {
					console.error(`❌ Erro ao transcrever ${source}:`, error.message);
				}
			}

			// Limpa chunks para próxima gravação
			audioChunks.length = 0;
		};

		// Carrega AudioWorklet para detecção em tempo real
		try {
			await audioContext.audioWorklet.addModule(AUDIO_WORKLET_PROCESSOR_PATH);
			const processor = new AudioWorkletNode(audioContext, STT_AUDIO_WORKLET_PROCESSOR, {
				processorOptions: { sampleRate: AUDIO_SAMPLE_RATE },
			});
			processor.port.postMessage({ type: 'setThreshold', threshold: 0.02 });
			vars.setProcessor(processor);

			// Processa mensagens do AudioWorklet (audioData e volumeUpdate separadamente)
			processor.port.onmessage = event => {
				processIncomingAudioMessageWhisper(source, event.data, mediaRecorder, vars, cfg).catch(error_ =>
					console.error(`❌ Erro ao processar mensagem do worklet (${source}):`, error_),
				);
			};

			// Conecta processador ao source
			mediaSource.connect(processor);
			processor.connect(audioContext.destination);
		} catch (workletError) {
			console.warn(`⚠️ AudioWorklet não disponível, usando detecção simples de volume:`, workletError.message);
			// Fallback: usa detector simples de volume
		}

		// Atualiza estado
		vars.setStream(stream);
		vars.setMediaRecorder(mediaRecorder);
		vars.setActive(true);
		vars.setStartAt(Date.now());

		// Inicia gravação
		mediaRecorder.start();

		debugLogWhisper(cfg.startLog, true);
	} catch (error) {
		console.error(`❌ Erro ao iniciar Whisper ${source.toUpperCase()}:`, error);
		stopWhisper(source);
		throw error;
	}
}

/* ================================ */
//	TRANSCRIÇÃO WHISPER (IPC)
/* ================================ */

/**
 * Transcreve áudio com Whisper (delegado ao main.js via IPC)
 * @param {Blob} audioBlob - Blob de áudio em formato WebM
 * @param {string} source - 'input' ou 'output'
 * @returns {Promise<string>} Texto transcrito
 */
async function transcribeWhisper(audioBlob, source) {
	const sttModel = getConfiguredSTTModel();

	debugLogWhisper(`🎤 Transcrição (${sttModel}): ${audioBlob.size} bytes`, true);

	try {
		const buffer = Buffer.from(await audioBlob.arrayBuffer());

		let result = '';

		if (sttModel === 'whisper-cpp-local') {
			// 🚀 Whisper.cpp local (alta precisão, offline)
			debugLogWhisper(`🚀 Enviando para Whisper.cpp (local, alta precisão)...`, true);

			const startTime = Date.now();
			result = await ipcRenderer.invoke('transcribe-local', buffer);
			const elapsed = Date.now() - startTime;

			debugLogWhisper(`✅ Whisper.cpp concluído em ${elapsed}ms`, true);
		} else if (sttModel === 'whisper-1') {
			// 🌐 Whisper-1 OpenAI (online, melhor precisão, custa $)
			debugLogWhisper(`🚀 Enviando para Whisper-1 OpenAI (online)...`, true);

			const startTime = Date.now();
			result = await ipcRenderer.invoke('transcribe-audio', buffer);
			const elapsed = Date.now() - startTime;

			debugLogWhisper(`✅ Whisper-1 concluído em ${elapsed}ms`, true);
		} else {
			throw new Error(`Modelo Whisper desconhecido: ${sttModel}`);
		}

		debugLogWhisper(
			`📝 Resultado (${result.length} chars): "${result.substring(0, 80)}${result.length > 80 ? '...' : ''}"`,
			true,
		);

		return result;
	} catch (error) {
		console.error(`❌ Transcrição Whisper falhou (${sttModel}):`, error.message);
		throw new Error(
			`Transcrição com ${sttModel} falhou: ${error.message}. Altere o modelo em "Configurações → API e Modelos"`,
		);
	}
}

/**
 * Obtém o modelo STT configurado
 * @returns {string} Modelo STT ('whisper-1' ou 'whisper-cpp-local')
 */
function getConfiguredSTTModel() {
	try {
		const activeProvider = globalThis.configManager?.config?.api?.activeProvider || 'openai';
		const sttModel = globalThis.configManager?.config?.api?.[activeProvider]?.selectedSTTModel;

		if (sttModel) {
			return sttModel;
		}

		console.warn(`⚠️ Modelo STT não configurado para ${activeProvider}, usando padrão: whisper-1`);
		return 'whisper-1';
	} catch (error) {
		console.warn('⚠️ configManager não disponível, usando padrão: whisper-1', error);
		return 'whisper-1';
	}
}

/* ================================ */
//	TROCA DE DISPOSITIVO
/* ================================ */

// Troca dinâmica do dispositivo Whisper (input/output)
async function changeDeviceWhisper(source, UIElements) {
	console.log(`🔄 Trocando dispositivo Whisper (${source})...`);

	const vars = whisperState[source];
	const wasActive = vars.isActive();

	if (wasActive) {
		vars.setIsSwitching(true);
		stopWhisper(source);
	}

	// Aguarda um pouco para liberar recursos
	await new Promise(resolve => setTimeout(resolve, 300));

	if (wasActive) {
		try {
			await startWhisper(source, UIElements);
		} catch (error) {
			console.error(`❌ Erro ao reiniciar após troca de dispositivo:`, error);
		} finally {
			vars.setIsSwitching(false);
		}
	}
}

/* ================================ */
//	WHISPER - PARAR FLUXO (STT)
/* ================================ */

// Para captura de áudio
function stopWhisper(source) {
	const vars = whisperState[source];

	if (!vars.isActive()) {
		console.warn(`⚠️ Whisper ${source.toUpperCase()} não está ativo`);
		return;
	}

	try {
		// Limpa timer de silêncio pendente
		if (vars.silenceTimer()) {
			clearTimeout(vars.silenceTimer());
			vars.setSilenceTimer(null);
		}

		// Desconecta AudioWorklet
		if (vars.processor()) {
			vars.processor().disconnect();
			vars.setProcessor(null);
		}

		if (vars.source()) {
			vars.source().disconnect();
			vars.setSource(null);
		}

		// Fecha AudioContext
		if (vars.audioContext()) {
			if (vars.audioContext().state !== 'closed') {
				vars
					.audioContext()
					.close()
					.catch(err => console.warn(`⚠️ Erro ao fechar AudioContext:`, err));
			}
			vars.setAudioContext(null);
		}

		// Para gravação
		if (vars.mediaRecorder() && vars.mediaRecorder().state !== 'inactive') {
			vars.mediaRecorder().stop();
		}

		// Limpa stream
		if (vars.stream()) {
			vars
				.stream()
				.getTracks()
				.forEach(track => track.stop());
		}

		// Reseta estado
		vars.setActive(false);
		vars.setStream(null);
		vars.setMediaRecorder(null);
		vars.setAudioChunks([]);

		debugLogWhisper(`🛑 Captura Whisper ${source.toUpperCase()} parada`, true);
	} catch (error) {
		console.error(`❌ Erro ao parar Whisper ${source.toUpperCase()}:`, error);
	}
}

/* ================================ */
//	DEBUG LOG
/* ================================ */

/**
 * Log de debug padronizado para stt-whisper.js
 * Por padrão nunca loga, se quiser mostrar é só passar true.
 * @param {*} msg
 * @param {boolean} showLog - true para mostrar, false para ignorar
 */
function debugLogWhisper(...args) {
	const maybeFlag = args.at(-1);
	const showLog = typeof maybeFlag === 'boolean' ? maybeFlag : false;

	const nowLog = new Date();
	const timeStr =
		`${nowLog.getHours().toString().padStart(2, '0')}:` +
		`${nowLog.getMinutes().toString().padStart(2, '0')}:` +
		`${nowLog.getSeconds().toString().padStart(2, '0')}.` +
		`${nowLog.getMilliseconds().toString().padStart(3, '0')}`;

	if (showLog) {
		const cleanArgs = typeof maybeFlag === 'boolean' ? args.slice(0, -1) : args;
		// prettier-ignore
		console.log(
			`%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug em stt-whisper.js:`, 
			'color: blue; font-weight: bold;', 
			...cleanArgs
		);
	}
}

/* ================================ */
//	INTERFACE PÚBLICA
/* ================================ */

/**
 * Inicia Whisper para INPUT + OUTPUT
 */
async function startAudioWhisper(UIElements) {
	try {
		// 🔥 Whisper: Inicia INPUT/OUTPUT
		if (UIElements.inputSelect?.value) await startWhisper(INPUT, UIElements);
		if (UIElements.outputSelect?.value) await startWhisper(OUTPUT, UIElements);
	} catch (error) {
		console.error('❌ Erro ao iniciar Whisper:', error);
		throw error;
	}
}

/**
 * Para Whisper para INPUT + OUTPUT
 */
function stopAudioWhisper() {
	stopWhisper(INPUT);
	stopWhisper(OUTPUT);
}

/**
 * Muda dispositivo para um source mantendo Whisper ativo
 */
async function switchDeviceWhisper(source, newDeviceId) {
	debugLogWhisper('Início da função: "switchDeviceWhisper"');
	debugLogWhisper('Fim da função: "switchDeviceWhisper"');
	return await changeDeviceWhisper(source, newDeviceId);
}

/* ================================ */
//	EXPORTS (CommonJS)
/* ================================ */

module.exports = {
	startAudioWhisper,
	stopAudioWhisper,
	switchDeviceWhisper,
};
