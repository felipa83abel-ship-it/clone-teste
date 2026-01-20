/**
 * 🔥 VOSK STT (Speech-to-Text) - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição local com Vosk,
 * - Spawn vosk-server.py AQUI no renderer (não via IPC)
 * - Comunicação stdin/stdout direta (JSON)
 * - AudioWorklet para captura e processamento de áudio bruto PCM16
 * - Usa VAD para detecção de fala (webrtcvad ou fallback de energia)
 * - Consolida interim results e transcrições finais
 *
 * Uso:
 * - startAudioVoskLocal(UIElements) -> startVosk(INPUT|OUTPUT, UIElements)
 * - stopAudioVoskLocal()
 */

/* ================================ */
//	IMPORTS
/* ================================ */
const { spawn } = require('node:child_process');
const { getVADEngine } = require('./vad-engine');

/* ================================ */
//	CONSTANTES
/* ================================ */

// Configuração Geral
const INPUT = 'input';
const OUTPUT = 'output';

// Configuração de Áudio 16kHz
const AUDIO_SAMPLE_RATE = 16000; // Hz

// AudioWorkletProcessor
const STT_AUDIO_WORKLET_PROCESSOR = 'stt-audio-worklet-processor'; // Nome
const AUDIO_WORKLET_PROCESSOR_PATH = './stt-audio-worklet-processor.js'; // Path

// Detecção de silêncio
const SILENCE_TIMEOUT_INPUT = 500; // ms para entrada (microfone)
const SILENCE_TIMEOUT_OUTPUT = 700; // ms para saída (sistema)

// Configuração Vosk
const VOSK_CONFIG = { MODEL: process.env.VOSK_MODEL || 'vosk-models/vosk-model-small-pt-0.3' };

// VAD Engine
let vad = null;

/* ================================ */
//	ESTADO GLOBAL DO VOSK
/* ================================ */

// voskState mantém seu próprio estado interno
const voskState = {
	input: {
		_isActive: false,
		_stream: null,
		_audioContext: null,
		_processor: null,
		_source: null,
		_startAt: null,
		_lastChunkTime: null,
		_silenceCheckTimer: null,
		_recordingActive: false,
		_canSend: false,
		_voskProcess: null,
		_isSwitching: false,
		_deviceId: null,

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

		author: 'Você',
		lastTranscript: '',
		inSilence: false,
		lastPercent: 0,
		shouldFinalizeAskCurrent: false,
		_lastIsSpeech: false,
		_lastVADTimestamp: null,
		lastActive: null,
		vadWindow: [],
		noiseStartTime: null,
		noiseStopTime: null,
	},
	output: {
		_isActive: false,
		_stream: null,
		_audioContext: null,
		_processor: null,
		_source: null,
		_startAt: null,
		_silenceCheckTimer: null,
		_recordingActive: false,
		_canSend: false,
		_voskProcess: null,
		_isSwitching: false,
		_deviceId: null,

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

		author: 'Outros',
		lastTranscript: '',
		inSilence: false,
		lastPercent: 0,
		shouldFinalizeAskCurrent: false,
		_lastIsSpeech: false,
		_lastVADTimestamp: null,
		lastActive: null,
		vadWindow: [],
		noiseStartTime: null,
		noiseStopTime: null,
	},
};

/* ================================ */
//	SERVER VOSK PROCESS
/* ================================ */

// Inicia processo Vosk (input/output) no servidor
function initVoskProcess(source) {
	const vars = voskState[source];

	if (vars._voskProcess) {
		console.warn(`⚠️ Vosk ${source} já está rodando`);
		return vars._voskProcess;
	}

	debugLogVosk(`🚀 Iniciando Vosk (${source}) com modelo: ${VOSK_CONFIG.MODEL}...`, true);

	vars._voskProcess = spawn('python', ['vosk-server.py', VOSK_CONFIG.MODEL], {
		cwd: __dirname,
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	// Recebe mensagens do Vosk (igual teste-vosk.js)
	vars._voskProcess.stdout.on('data', data => {
		const lines = data.toString().split('\n');
		lines.forEach(rawLine => {
			const line = rawLine.trim(); // remove espaços e \r
			if (!line) return; // ignora linhas vazias sem log

			// Ignora mensagens de controle e logs
			if (line === 'VOSK_READY' || line.startsWith('[VOSK]')) {
				debugLogVosk(`[Vosk Controle] ${line}`, false);
				return;
			}

			// Só tenta parsear se parecer JSON
			if (!(line.startsWith('{') || line.startsWith('['))) {
				debugLogVosk(`[Ignorado] ${line}`, false);
				return;
			}

			try {
				const msg = JSON.parse(line);

				if (msg.error) {
					console.error(`❌ Erro Vosk (${source}):`, msg.error);
					return;
				}

				handleVoskMessage(msg, source);
			} catch (error) {
				console.error(`❌ Erro ao processar mensagem Vosk (${source}):`, error);
				debugLogVosk(`[RAW] ${line}`, false);
			}
		});
	});

	vars._voskProcess.stderr.on('data', data => {
		const line = data.toString().trim();
		if (line && !line.includes('[VOSK]')) {
			debugLogVosk(`[Vosk stderr] ${line}`, false);
		}
	});

	vars._voskProcess.on('error', error => {
		console.error(`❌ Erro ao spawn Vosk (${source}):`, error.message);
		vars._voskProcess = null;
	});

	vars._voskProcess.on('close', code => {
		debugLogVosk(`⏹️ Vosk (${source}) encerrado (código ${code})`, true);
		vars._voskProcess = null;
	});

	return vars._voskProcess;
}

// Para processo Vosk (input/output) no servidor
function stopVoskProcess(source) {
	const vars = voskState[source];

	if (!vars._voskProcess) return;

	try {
		vars._voskProcess.kill('SIGTERM');
		vars._voskProcess = null;
		debugLogVosk(`🛑 Vosk (${source}) parado`, true);
	} catch (error) {
		console.error(`❌ Erro ao parar Vosk (${source}):`, error);
	}
}

// Envia mensagem "Finalize" para Vosk (input/output) no servidor
function sendVoskFinalize(source) {
	const vars = voskState[source];
	if (vars._voskProcess) {
		debugLogVosk(`🔔 Enviando Finalize para Vosk (${source})`, true);
		vars._voskProcess.stdin.write(JSON.stringify({ type: 'finalize' }) + '\n');
	}
}

/* ================================ */
//	VAD (VOICE ACTIVITY DETECTION)
/* ================================ */

// Atualiza estado VAD
function updateVADState(vars, isSpeech) {
	vars._lastIsSpeech = !!isSpeech;
	vars._lastVADTimestamp = Date.now();
	if (isSpeech) vars.lastActive = Date.now();
}

/* ================================ */
//	VOSK - INICIAR FLUXO (STT)
/* ================================ */

// Inicia captura de áudio do dispositivo de entrada ou saída com Vosk
async function startVosk(source, UIElements) {
	const config = {
		input: {
			deviceKey: 'inputSelect',
			accessMessage: '🎤 Solicitando acesso à entrada de áudio (Microfone)...',
			threshold: 0.02,
			startLog: '▶️ Captura Vosk INPUT iniciada',
		},
		output: {
			deviceKey: 'outputSelect',
			accessMessage: '🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...',
			threshold: 0.005,
			startLog: '▶️ Captura Vosk OUTPUT iniciada',
		},
	};

	const cfg = config[source];
	if (!cfg) throw new Error(`❌ Source inválido: ${source}`);

	const vars = voskState[source];

	if (vars._isActive) {
		console.warn(`⚠️ Vosk ${source.toUpperCase()} já ativo`);
		return;
	}

	try {
		// Obtém o dispositivo selecionado no UI
		const deviceId = UIElements[cfg.deviceKey]?.value;

		debugLogVosk(`🔊 Iniciando captura ${source.toUpperCase()} com dispositivo: ${deviceId}`, false);

		// Inicia Vosk (spawn direto)
		initVoskProcess(source);

		// Solicita acesso ao dispositivo selecionado
		debugLogVosk(cfg.accessMessage, false);

		// Obtém stream de áudio
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: deviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false,
			},
		});

		debugLogVosk(`✅ Acesso ao áudio ${source.toUpperCase()} autorizado`, true);

		// Cria AudioContext com 16kHz
		const audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)({
			sampleRate: AUDIO_SAMPLE_RATE,
		});
		await audioCtx.audioWorklet.addModule(AUDIO_WORKLET_PROCESSOR_PATH);

		// Cria MediaStreamSource e guarda via voskState
		const mediaSource = audioCtx.createMediaStreamSource(stream);

		// Inicia AudioWorklet para captura e processamento de áudio
		const processor = new AudioWorkletNode(audioCtx, STT_AUDIO_WORKLET_PROCESSOR);
		processor.port.postMessage({ type: 'setThreshold', threshold: cfg.threshold });
		processor.port.onmessage = event => {
			processIncomingAudioMessage(source, event.data).catch(error_ =>
				console.error(`❌ Erro ao processar mensagem do worklet (${source}):`, error_),
			);
		};

		// Conecta fluxo: Source -> processor -> destination
		mediaSource.connect(processor);
		processor.connect(audioCtx.destination);

		vars._processor = processor;

		// Atualiza referências de estado
		vars._stream = stream;
		vars._audioContext = audioCtx;
		vars._source = mediaSource;
		vars._isActive = true;
		vars._startAt = Date.now();
		vars.lastActive = Date.now();
		vars._recordingActive = true;
		vars._canSend = true;

		debugLogVosk(cfg.startLog, true);
	} catch (error) {
		console.error(`❌ Erro ao iniciar Vosk ${source.toUpperCase()}:`, error);
		stopVosk(source);
		throw error;
	}
}

// Processa mensagens de áudio recebida do AudioWorklet
async function processIncomingAudioMessage(source, data) {
	const vars = voskState[source];
	if (data.type === 'audioData') {
		onAudioChunk(source, vars, data);
	} else if (data.type === 'volumeUpdate') {
		vars.lastPercent = data.percent;
		if (globalThis.RendererAPI?.emitUIChange) {
			const ev = source === INPUT ? 'onInputVolumeUpdate' : 'onOutputVolumeUpdate';
			globalThis.RendererAPI.emitUIChange(ev, { percent: data.percent });
		}
		handleSilenceDetection(source, data.percent);
	}
}

// Processa chunk de áudio PCM16 vindo do AudioWorklet
async function onAudioChunk(source, vars, data) {
	const pcm16Array = data.pcm16 instanceof ArrayBuffer ? new Int16Array(data.pcm16) : data.pcm16;

	if (!pcm16Array || pcm16Array.length === 0 || !vars._canSend) {
		return;
	}

	// VAD: Detecta fala usando VAD Engine
	const isSpeech = vad.detectSpeech(data.pcm16, vars.lastPercent, vars.vadWindow);
	updateVADState(vars, isSpeech);

	// Se detectou fala, atualiza lastActive
	if (isSpeech) {
		vars.lastActive = Date.now();
	}

	try {
		// 🔥 EXATAMENTE como teste-vosk.js
		const buffer = Buffer.from(pcm16Array.buffer, pcm16Array.byteOffset, pcm16Array.byteLength);
		const audioBase64 = buffer.toString('base64');

		const msg = {
			type: 'transcribe',
			format: 'pcm',
			rate: AUDIO_SAMPLE_RATE,
			audio: audioBase64,
		};

		// Envia direto ao Vosk via stdin (não IPC!)
		vars._voskProcess.stdin.write(JSON.stringify(msg) + '\n');
	} catch (error) {
		console.error(`❌ Erro ao enviar chunk ao Vosk:`, error);
	}
}

// Trata detecção de silêncio com VAD ou fallback
function handleSilenceDetection(source, percent) {
	const vars = voskState[source];
	const silenceTimeout = source === INPUT ? SILENCE_TIMEOUT_INPUT : SILENCE_TIMEOUT_OUTPUT;
	const now = Date.now();

	// Decisão principal: VAD se disponível, senão fallback por volume
	const useVADDecision = vad?.isEnabled() && vars._lastIsSpeech !== undefined;
	const effectiveSpeech = useVADDecision ? !!vars._lastIsSpeech : percent > 0;

	debugLogVosk(
		`🔍 VAD ${source}: ${vars._lastIsSpeech ? 'speech' : 'silence'} - 🔊 volume: ${percent.toFixed(2)}%`,
		false,
	);

	if (effectiveSpeech) {
		// Se detectou fala, resetamos estado de silêncio
		if (vars.inSilence) {
			if (!vars.noiseStartTime) vars.noiseStartTime = Date.now();

			const noiseDuration = vars.noiseStartTime - vars.noiseStopTime;
			vars.noiseStopTime = null;

			debugLogVosk(`🟢 🟢 🟢 ***** 🔊 Fala real detectada após (${noiseDuration}ms) *****`, true);
		}

		vars.inSilence = false;
		vars.shouldFinalizeAskCurrent = false;
		vars.lastActive = now;
		vars.noiseStartTime = null;
	} else {
		// Silêncio detectado → verifica se já passou o timeout
		const elapsed = now - vars.lastActive;

		// Entrando em silêncio estável
		if (elapsed >= silenceTimeout && !vars.inSilence) {
			vars.inSilence = true;
			vars.shouldFinalizeAskCurrent = true;
			vars.noiseStopTime = Date.now();

			debugLogVosk(`🔴 🔴 🔴 ***** 🔇 Silêncio estável detectado (${elapsed}ms) *****`, true);

			// Dispara finalize apenas uma vez
			sendVoskFinalize(source);
		}
	}
}

/* ================================ */
//	PROCESSAMENTO DE MENSAGENS
/* ================================ */

// Processa mensagens do Vosk (final ou parcial)
function handleVoskMessage(result, source = INPUT) {
	if (result?.isFinal && result?.final?.trim()) {
		handleFinalVoskMessage(source, result.final);
	} else if (result?.partial?.trim()) {
		handleInterimVoskMessage(source, result.partial);
	}
}

// Processa mensagens interim do Vosk (transcrições parciais)
function handleInterimVoskMessage(source, transcript) {
	debugLogVosk(`⏳ 🟠 Handle INTERIM [${source}]: "${transcript}"`, true);

	if (!transcript?.trim()) {
		console.warn(`⚠️ Transcript interim vazio recebido do Vosk (${source}); ignorando.`);
		return;
	}

	const vars = voskState[source];
	vars.lastTranscript = transcript;

	// Atualiza interim transcript no UI
	updateInterim(source, transcript, vars.author);

	// Atualiza CURRENT question (apenas para output)
	updateCurrentQuestion(source, transcript, true);
}

// Processa mensagens finais do Vosk (transcrições completas)
function handleFinalVoskMessage(source, transcript) {
	debugLogVosk(`📝 🟢 Handle FINAL [${source.toUpperCase()}]: "${transcript}"`, true);

	const vars = voskState[source];
	vars.lastTranscript = transcript.trim() ? transcript : vars.lastTranscript;

	if (transcript.trim()) {
		// Adiciona placeholder com transcrição
		const placeholderId = `vosk-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
		const metrics = calculateTimingMetrics(vars);

		// Adiciona transcrição com placeholder na UI
		addTranscriptPlaceholder(vars.author, placeholderId, metrics.startStr);
		// Preenche placeholder com resultado final
		fillTranscriptPlaceholder(vars.author, transcript, placeholderId, metrics);
		// Limpa interim do UI
		clearInterim(source);
	}

	// Atualiza CURRENT question (apenas para output)
	updateCurrentQuestion(source, transcript, false);
}

// Adiciona transcrição com placeholder ao UI
function addTranscriptPlaceholder(author, placeholderId, timeStr) {
	if (globalThis.RendererAPI?.emitUIChange) {
		globalThis.RendererAPI.emitUIChange('onTranscriptAdd', {
			author,
			text: '...',
			timeStr,
			elementId: 'conversation',
			placeholderId,
		});
	}
}

// Preenche placeholder com transcrição final
function fillTranscriptPlaceholder(author, transcript, placeholderId, metrics) {
	if (globalThis.RendererAPI?.emitUIChange) {
		globalThis.RendererAPI.emitUIChange('onPlaceholderFulfill', {
			speaker: author,
			text: transcript,
			placeholderId,
			...metrics,
			showMeta: false,
		});
	}
}

// Limpa interim transcript do UI
function clearInterim(source) {
	const interimId = source === INPUT ? 'vosk-interim-input' : 'vosk-interim-output';
	if (globalThis.RendererAPI?.emitUIChange) {
		globalThis.RendererAPI.emitUIChange('onClearInterim', { id: interimId });
	}
}

// Atualiza interim transcript no UI
function updateInterim(source, transcript, author) {
	const interimId = source === INPUT ? 'vosk-interim-input' : 'vosk-interim-output';
	if (globalThis.RendererAPI?.emitUIChange) {
		globalThis.RendererAPI.emitUIChange('onUpdateInterim', {
			id: interimId,
			speaker: author,
			text: transcript,
		});
	}
}

// Atualiza CURRENT question (apenas para output)
function updateCurrentQuestion(source, transcript, isInterim = false) {
	const vars = voskState[source];
	if (source === OUTPUT && globalThis.RendererAPI?.handleCurrentQuestion) {
		globalThis.RendererAPI.handleCurrentQuestion(vars.author, transcript, {
			isInterim,
			shouldFinalizeAskCurrent: vars.shouldFinalizeAskCurrent,
		});
		// 🔥 Só reseta quando for mensagem FINAL (não interim)
		if (!isInterim && vars.shouldFinalizeAskCurrent) vars.shouldFinalizeAskCurrent = false;
	}
}

// Calcula métricas de timing para transcrição
function calculateTimingMetrics(vars) {
	const startAt = vars.startAt?.();
	const now = Date.now();
	const elapsedMs = startAt ? now - startAt : 0;
	return {
		startStr: startAt ? new Date(startAt).toLocaleTimeString() : new Date(now).toLocaleTimeString(),
		stopStr: new Date(now).toLocaleTimeString(),
		recordingDuration: (elapsedMs / 1000).toFixed(2),
		latency: (elapsedMs / 1000).toFixed(2),
		total: (elapsedMs / 1000).toFixed(2),
	};
}

/* ================================ */
//	TROCA DE DISPOSITIVO
/* ================================ */

// Troca dinâmica do dispositivo Vosk (input/output)
async function changeDeviceVoskLocal(source, newDeviceId) {
	const vars = voskState[source];

	// Verifica se já está trocando
	if (vars.isSwitching?.()) {
		console.warn(`⚠️ Já em processo de troca de dispositivo ${source.toUpperCase()}`);
		return;
	}

	// Verifica se está ativo
	if (!vars._isActive) {
		console.warn(`⚠️ Vosk ${source.toUpperCase()} não está ativo; nada a trocar`);
		return;
	}

	vars.setIsSwitching(true);
	try {
		// Pausa temporariamente a gravação
		vars._canSend = false;

		// Obtém novo stream do dispositivo
		const newStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: newDeviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false,
			},
		});

		// Cria nova MediaStreamSource
		const audioCtx = vars._audioContext;
		const newSource = audioCtx.createMediaStreamSource(newStream);

		// Desconecta source anterior
		try {
			if (vars._source) vars._source.disconnect();
		} catch (e) {
			console.warn(`⚠️ Falha ao desconectar source anterior (${source}):`, e);
		}

		// Conecta nova source -> processor
		newSource.connect(vars._processor);

		// Para tracks do stream anterior, para evitar leaks
		try {
			if (vars._stream) vars._stream.getTracks().forEach(t => t.stop());
		} catch (e) {
			console.warn(`⚠️ Falha ao parar tracks do stream anterior (${source}):`, e);
		}

		// Atualiza referências
		vars._stream = newStream;
		vars._source = newSource;
		vars._deviceId = newDeviceId;

		// Retoma gravação
		vars._canSend = true;

		debugLogVosk(`✅ Troca de dispositivo ${source.toUpperCase()} concluída com sucesso`, true);
	} catch (e) {
		console.error(`❌ Falha ao trocar dispositivo ${source.toUpperCase()}:`, e);
		// Tenta restaurar gravação em caso de erro
		vars._canSend = true;
		throw e;
	} finally {
		vars.setIsSwitching(false);
	}
}

/* ================================ */
//	VOSK - PARAR FLUXO (STT)
/* ================================ */

// Para captura de áudio
async function stopVosk(source) {
	const vars = voskState[source];

	if (!vars._isActive) return;

	try {
		// Para timer de silêncio
		if (vars._silenceCheckTimer) {
			clearInterval(vars._silenceCheckTimer);
			vars._silenceCheckTimer = null;
		}

		// Para Vosk
		stopVoskProcess(source);

		// Desconecta processor
		if (vars._processor) {
			try {
				vars._processor.disconnect?.();
			} catch (e) {
				console.warn(`⚠️ Erro ao desconectar processor (${source}):`, e);
			}
		}

		// Desconecta source
		if (vars._source) {
			try {
				vars._source.disconnect();
			} catch (e) {
				console.warn(`⚠️ Erro ao desconectar source (${source}):`, e);
			}
		}

		// Fecha stream
		vars._stream?.getTracks?.().forEach(track => track.stop());

		vars._isActive = false;
		vars._stream = null;
		vars._processor = null;
		vars._source = null;
		vars._audioContext = null;
		vars._startAt = null;

		debugLogVosk(`🛑 Vosk ${source.toUpperCase()} parado`, true);
	} catch (error) {
		console.error(`❌ Erro ao parar Vosk ${source.toUpperCase()}:`, error);
	}
}

/* ================================ */
// FUNÇÃO PARA LOGAR
/* ================================ */

/**
 * Log de debug padronizado para config-manager.js
 * Por padrão nunca loga, se quiser mostrar é só passar true.
 * @param {*} msg
 * @param {boolean} showLog - true para mostrar, false para ignorar
 */
function debugLogVosk(...args) {
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
			`%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug em vosk-transcribe.js:`, 
			'color: blue; font-weight: bold;', 
			...cleanArgs
		);
	}
}

/* ================================ */
//	INTERFACE PÚBLICA
/* ================================ */

/**
 * Inicia Vosk para INPUT + OUTPUT
 */
async function startAudioVoskLocal(UIElements) {
	try {
		// Inicializa VAD Engine (singleton)
		vad = getVADEngine();
		debugLogVosk(`✅ VAD Engine inicializado - Status: ${JSON.stringify(vad.getStatus())}`, true);

		// 🔥 Vosk: Inicia INPUT/OUTPUT
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
 * Muda dispositivo para um source mantendo Vosk ativo
 */
async function switchDeviceVoskLocal(source, newDeviceId) {
	debugLogVosk('Início da função: "switchDeviceVoskLocal"');
	debugLogVosk('Fim da função: "switchDeviceVoskLocal"');
	return await changeDeviceVoskLocal(source, newDeviceId);
}

/* ================================ */
//	EXPORTS (CommonJS)
/* ================================ */

module.exports = {
	startAudioVoskLocal,
	stopAudioVoskLocal,
	switchDeviceVoskLocal,
};
