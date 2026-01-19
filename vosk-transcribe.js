/**
 * 🔥 VOSK TRANSCRIBE - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição local com Vosk,
 * - Spawn vosk-server.py AQUI no renderer (não via IPC)
 * - Comunicação stdin/stdout direta (JSON)
 * - AudioWorklet para captura e processamento de áudio bruto PCM16
 * - Usa VAD para detecção de fala (webrtcvad ou fallback de energia)
 * - Consolida interim results e transcrições finais
 *
 * Uso:
 * - startAudioVoskLocal(UIElements) - inicia captura input + output
 * - stopAudioVoskLocal() - para captura input + output
 */

/* ================================ */
//	IMPORTS
/* ================================ */
const { spawn } = require('node:child_process');

/* ================================ */
//	CONSTANTES
/* ================================ */

const INPUT = 'input';
const OUTPUT = 'output';

// Configuração de Áudio 16kHz
const AUDIO_SAMPLE_RATE = 16000; // Hz

// AudioWorklet path
const AUDIO_CONTEXT_WORKLET_PATH = './stt-audio-worklet-processor.js';

// Configuração de VAD (Voice Activity Detection)
const VAD_MODE = 2; // Modo agressivo do webrtcvad
const VAD_FRAME_DURATION_MS = 0.03; // 30ms por frame
const VAD_WINDOW_SIZE = 6; // Últimos ~6 frames (~50-100ms)
const FALLBACK_VOLUME_THRESHOLD = 20; // Limiar de volume para fallback (%)
const ENERGY_THRESHOLD = 500; // Limiar de energia RMS para fallback

// Detecção de silêncio
const SILENCE_TIMEOUT_INPUT = 500; // ms para entrada (microfone)
const SILENCE_TIMEOUT_OUTPUT = 700; // ms para saída (sistema)

/* ================================ */
//	ESTADO DO Vosk
/* ================================ */

// Configuração Vosk
const VOSK_CONFIG = { MODEL: process.env.VOSK_MODEL || 'vosk-models/vosk-model-small-pt-0.3' };

// Configuração de VAD nativo (compatível com deepgram)
let useNativeVAD = true;
let vadAvailable = false;
let vadInstance = null;

/* ================================ */
//	ESTADO GLOBAL DO VOSK
/* ================================ */

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

		startAt() {
			return this._startAt;
		},
		setStartAt(val) {
			this._startAt = val;
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

		startAt() {
			return this._startAt;
		},
		setStartAt(val) {
			this._startAt = val;
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
		console.log(`⚠️ Vosk ${source} já está rodando`);
		return vars._voskProcess;
	}

	console.log(`🚀 Iniciando Vosk (${source}) com modelo: ${VOSK_CONFIG.MODEL}...`);

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
				console.log(`[Vosk Controle] ${line}`);
				return;
			}

			// Só tenta parsear se parecer JSON
			if (!(line.startsWith('{') || line.startsWith('['))) {
				console.log(`[Ignorado] ${line}`);
				return;
			}

			try {
				const msg = JSON.parse(line);

				if (msg.error) {
					console.error(`❌ Erro Vosk (${source}):`, msg.error);
					return;
				}

				handleVoskMessage(source, msg);
			} catch (error) {
				console.error(`❌ Erro ao processar mensagem Vosk (${source}):`, error);
				console.log(`[RAW] ${line}`);
			}
		});
	});

	vars._voskProcess.stderr.on('data', data => {
		const line = data.toString().trim();
		if (line && !line.includes('[VOSK]')) {
			console.log(`[Vosk stderr] ${line}`);
		}
	});

	vars._voskProcess.on('error', error => {
		console.error(`❌ Erro ao spawn Vosk (${source}):`, error.message);
		vars._voskProcess = null;
	});

	vars._voskProcess.on('close', code => {
		console.log(`⏹️ Vosk (${source}) encerrado (código ${code})`);
		vars._voskProcess = null;
	});

	console.log(`✅ Vosk (${source}) iniciado`);
	return vars._voskProcess;
}

// Para processo Vosk (input/output) no servidor
function stopVoskProcess(source) {
	const vars = voskState[source];

	if (!vars._voskProcess) return;

	try {
		vars._voskProcess.kill('SIGTERM');
		vars._voskProcess = null;
		console.log(`🛑 Vosk (${source}) parado`);
	} catch (error) {
		console.error(`❌ Erro ao parar Vosk (${source}):`, error);
	}
}

// Envia mensagem "Finalize" para Vosk (input/output) no servidor
function sendVoskFinalize(source) {
	const vars = voskState[source];
	if (vars._voskProcess) {
		console.log(`🔔 Enviando Finalize para Vosk (${source})`);
		vars._voskProcess.stdin.write(JSON.stringify({ type: 'finalize' }) + '\n');
	}
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

		console.log(`🔊 Iniciando captura ${source.toUpperCase()} com dispositivo: ${deviceId}`);

		// Inicia Vosk (spawn direto)
		initVoskProcess(source);

		// Solicita acesso ao dispositivo selecionado
		console.log(cfg.accessMessage);

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

		// Cria AudioContext com 16kHz
		const audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)({
			sampleRate: AUDIO_SAMPLE_RATE,
		});
		await audioCtx.audioWorklet.addModule(AUDIO_CONTEXT_WORKLET_PATH);

		// Cria MediaStreamSource e guarda via voskState
		const mediaSource = audioCtx.createMediaStreamSource(stream);

		// Inicia AudioWorklet para captura e processamento de áudio
		const processor = new AudioWorkletNode(audioCtx, 'stt-audio-worklet-processor');
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

		console.log(cfg.startLog);
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

	// VAD: Detecta fala usando padrão Vosk
	const isSpeech = detectSpeech(source, vars, data);
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
	const useVADDecision = isVADEnabled() && vars._lastIsSpeech !== undefined;
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
//	VAD (VOICE ACTIVITY DETECTION)
/* ================================ */

// Detecta fala baseado em VAD nativo ou fallback de energia
function detectSpeech(source, vars, data) {
	let isSpeech = null;
	if (isVADEnabled()) {
		try {
			const sampleRate = data.sampleRate || AUDIO_SAMPLE_RATE;
			const pcm = new Int16Array(data.pcm16);
			const frameSize = Math.floor(sampleRate * VAD_FRAME_DURATION_MS);
			for (let i = 0; i + frameSize <= pcm.length; i += frameSize) {
				const frame = pcm.subarray(i, i + frameSize);
				const vadDecision = runNativeVAD(frame, sampleRate);
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
	return isSpeech === null ? fallbackIsSpeech(source, vars.lastPercent) : isSpeech;
}

// Verifica se VAD nativo está habilitado e disponível
function isVADEnabled() {
	return useNativeVAD && !!vadAvailable;
}

// Computa energia do frame PCM16 e executa VAD nativo
function runNativeVAD(frame, sampleRate = AUDIO_SAMPLE_RATE) {
	try {
		if (vadInstance !== undefined && vadInstance) {
			try {
				return tryCallVADInstance(frame, sampleRate);
			} catch (error_) {
				console.warn('runNativeVAD: erro ao chamar vadInstance:', error_ && (error_.message || error_));
				return null;
			}
		}
		const energy = computeEnergy(frame);
		return energy > ENERGY_THRESHOLD;
	} catch (err) {
		console.warn('runNativeVAD erro:', err && (err.message || err));
		return null;
	}
}

// Tenta chamar instância VAD nativa (webrtcvad ou node-webrtcvad)
function tryCallVADInstance(frame, sampleRate) {
	if (typeof vadInstance.process === 'function') {
		if (vadInstance.process.length === 2) {
			return processVADResult(vadInstance.process(sampleRate, frame));
		} else {
			return processVADResult(vadInstance.process(frame));
		}
	} else if (typeof vadInstance.isSpeech === 'function') {
		return !!vadInstance.isSpeech(frame, sampleRate);
	} else if (typeof vadInstance === 'function') {
		return !!vadInstance(frame, sampleRate);
	}
	return null;
}

// Processa resultado do VAD: true (speech), false (no speech), null (error / undecided)
function processVADResult(result) {
	if (typeof result === 'boolean') return result;
	if (Array.isArray(result)) return result.includes(1);
	return null;
}

// Atualiza estado VAD
function updateVADState(vars, isSpeech) {
	vars._lastIsSpeech = !!isSpeech;
	vars._lastVADTimestamp = Date.now();
	if (isSpeech) vars.lastActive = Date.now();
}

// Inicializa instância de VAD nativo (webrtcvad ou node-webrtcvad)
function initVAD() {
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

	if (typeof VAD?.default === 'function') {
		// webrtcvad (ESM default)
		return new VAD.default(AUDIO_SAMPLE_RATE, VAD_MODE);
	} else if (typeof VAD === 'function') {
		// node-webrtcvad (CommonJS)
		return new VAD(VAD_MODE);
	} else if (VAD?.VAD) {
		// classe interna
		return new VAD.VAD(VAD_MODE);
	}

	return null;
}

// Fallback de VAD baseado em energia com suavização (multi-frame)
function fallbackIsSpeech(source, percent) {
	const vars = voskState[source];
	if (!vars.vadWindow) vars.vadWindow = [];
	const window = vars.vadWindow;
	window.push(percent);
	if (window.length > VAD_WINDOW_SIZE) window.shift(); // últimos ~6 frames (~50ms-100ms dependendo do worklet)
	const avg = window.reduce((a, b) => a + b, 0) / window.length;
	// heurística ajustada: muitos loopbacks/VoiceMeeter apresentam baseline alto
	// aumentar limiar para reduzir segmentação falsa (experiência inicial: 20%)
	return avg > FALLBACK_VOLUME_THRESHOLD;
}

// Computa energia RMS do frame PCM16 no fallback de VAD
function computeEnergy(pcm16Array) {
	if (!pcm16Array || pcm16Array.length === 0) return 0;

	let sum = 0;
	for (const element of pcm16Array) {
		const sample = element;
		sum += sample * sample;
	}

	const rms = Math.sqrt(sum / pcm16Array.length);
	return rms;
}

/* ================================ */
//	PROCESSAMENTO DE MENSAGENS
/* ================================ */

// Processa resultado do Vosk (final ou parcial)
function handleVoskMessage(source, result) {
	if (result?.isFinal && result?.final?.trim()) {
		handleFinalVoskMessage(source, result.final);
	} else if (result?.partial?.trim()) {
		handleInterimVoskMessage(source, result.partial);
	}
}

// Processa resultado interim (parcial) do Vosk
function handleInterimVoskMessage(source, transcript) {
	console.log(`⏳ 🟠 Handle INTERIM [${source}]: "${transcript}"`);

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

// Processa resultado final do Vosk
function handleFinalVoskMessage(source, transcript) {
	console.log(`📝 🟢 Handle FINAL [${source.toUpperCase()}]: "${transcript}"`);

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

/**
 * Adiciona transcrição com placeholder ao UI
 */
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

/**
 * Atualiza CURRENT question (apenas para output)
 */
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

		console.log(`🛑 Vosk ${source.toUpperCase()} parado`);
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
		// Inicia VAD nativo se disponível
		vadInstance = initVAD();
		if (vadInstance) {
			vadAvailable = true;
			console.log(`✅ VAD nativo inicializado`);
		} else {
			console.log(`⚠️ VAD nativo não disponível, usando fallback de energia`);
		}

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
	const vars = voskState[source];
	if (vars._isActive) {
		stopVosk(source);
		// TODO: Implementar reinício com novo dispositivo após mudança
		vars.currentDeviceId = newDeviceId;
	}
}

/* ================================ */
//	EXPORTS (CommonJS)
/* ================================ */

module.exports = {
	startAudioVoskLocal,
	stopAudioVoskLocal,
	switchDeviceVoskLocal,
};
