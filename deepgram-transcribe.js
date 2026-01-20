/**
 * 🌊 DEEPGRAM STT (Speech-to-Text) - MÓDULO INDEPENDENTE
 *
 * Documentação: https://developers.deepgram.com/docs/audio-keep-alive
 *
 * Implementação isolada de transcrição com Deepgram Live Streaming.
 * - Captura áudio diretamente via WebSocket (sem IPC para dados binários)
 * - AudioWorklet para captura e processamento de áudio bruto PCM16
 * - Usa VAD para detecção de fala (webrtcvad ou fallback de energia)
 * - Consolida interim results e transcrições finais
 *
 * Uso:
 * - startAudioDeepgram(UIElements) -> startDeepgram(INPUT|OUTPUT, UIElements)
 * - stopDeepgram(INPUT|OUTPUT)
 */

/* ================================ */
//	IMPORTS
/* ================================ */
const { ipcRenderer } = require('electron');

/* ================================ */
//	CONSTANTES
/* ================================ */

// Configuração Geral
const INPUT = 'input';
const OUTPUT = 'output';
const USE_DEEPGRAM_MOCK = false; // true para simulação sem conexão real com Deepgram
const DEEPGRAM_HEARTBEAT_INTERVAL = 5000; // 5 segundos (conforme documentação)

// Configuração de Áudio 16kHz
const AUDIO_SAMPLE_RATE = 16000; // 16kHz

// AudioWorkletProcessor
const STT_AUDIO_WORKLET_PROCESSOR = 'stt-audio-worklet-processor'; // Nome
const AUDIO_WORKLET_PROCESSOR_PATH = './stt-audio-worklet-processor.js'; // Path

// Configuração de VAD (Voice Activity Detection)
const VAD_MODE = 2; // Modo agressivo do webrtcvad
const VAD_FRAME_DURATION_MS = 0.03; // 30ms por frame
const VAD_WINDOW_SIZE = 6; // Últimos ~6 frames (~50-100ms)
const FALLBACK_VOLUME_THRESHOLD = 20; // Limiar de volume para fallback (%)
const ENERGY_THRESHOLD = 500; // Limiar de energia RMS para fallback

// Detecção de silêncio
const SILENCE_TIMEOUT_INPUT = 500; // ms para entrada (microfone)
const SILENCE_TIMEOUT_OUTPUT = 700; // ms para saída (sistema)

// Configuração do Filtro Passa-Alta (HPF)
const HPF_TYPE = 'highpass'; // Tipo de filtro
const HPF_FREQUENCY = 200; // Frequência de corte em Hz
const HPF_Q_FACTOR = 1; // Fator de qualidade

/* ================================ */
//	ESTADO GLOBAL DO DEEPGRAM
/* ================================ */

// deepgramState mantém seu próprio estado interno
const deepgramState = {
	input: {
		_ws: null,
		_isActive: false,
		_processor: null,
		_stream: null,
		_audioContext: null,
		_hpf: null,
		_source: null,
		_startAt: null,
		_heartbeatInterval: null,
		_isSwitching: false,

		ws() {
			return this._ws;
		},
		setWs(val) {
			this._ws = val;
		},
		isActive() {
			return this._isActive;
		},
		setActive(val) {
			this._isActive = val;
		},
		processor() {
			return this._processor;
		},
		setProcessor(val) {
			this._processor = val;
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
		hpf() {
			return this._hpf;
		},
		setHPF(val) {
			this._hpf = val;
		},
		source() {
			return this._source;
		},
		setSource(val) {
			this._source = val;
		},
		startAt() {
			return this._startAt;
		},
		setStartAt(val) {
			this._startAt = val;
		},
		heartbeatInterval() {
			return this._heartbeatInterval;
		},
		setHeartbeatInterval(val) {
			this._heartbeatInterval = val;
		},
		isSwitching() {
			return this._isSwitching;
		},
		setIsSwitching(val) {
			this._isSwitching = val;
		},

		author: 'Você',
		lastActive: Date.now(),
		lastTranscript: '',
		inSilence: false,
		lastPercent: 0,
		preRollBuffers: [],
		preRollMaxFrames: 8,
		sending: false,
		postRollTimer: null,
		postRollMs: 500,
		noiseStartTime: null,
		noiseStopTime: null,
		shouldFinalizeAskCurrent: false,
	},
	output: {
		_ws: null,
		_isActive: false,
		_processor: null,
		_stream: null,
		_audioContext: null,
		_hpf: null,
		_source: null,
		_startAt: null,
		_heartbeatInterval: null,
		_isSwitching: false,

		ws() {
			return this._ws;
		},
		setWs(val) {
			this._ws = val;
		},
		isActive() {
			return this._isActive;
		},
		setActive(val) {
			this._isActive = val;
		},
		processor() {
			return this._processor;
		},
		setProcessor(val) {
			this._processor = val;
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
		hpf() {
			return this._hpf;
		},
		setHPF(val) {
			this._hpf = val;
		},
		source() {
			return this._source;
		},
		setSource(val) {
			this._source = val;
		},
		startAt() {
			return this._startAt;
		},
		setStartAt(val) {
			this._startAt = val;
		},
		heartbeatInterval() {
			return this._heartbeatInterval;
		},
		setHeartbeatInterval(val) {
			this._heartbeatInterval = val;
		},
		isSwitching() {
			return this._isSwitching;
		},
		setIsSwitching(val) {
			this._isSwitching = val;
		},

		author: 'Outros',
		lastActive: Date.now(),
		lastTranscript: '',
		inSilence: false,
		lastPercent: 0,
		preRollBuffers: [],
		preRollMaxFrames: 8,
		sending: false,
		postRollTimer: null,
		postRollMs: 500,
		noiseStartTime: null,
		noiseStopTime: null,
		shouldFinalizeAskCurrent: false,
	},
};

// Configuração de VAD nativo
let useNativeVAD = true;
let vadAvailable = false;
let vadInstance = null;

/* ================================ */
//	WEBSOCKET DEEPGRAM
/* ================================ */

// Mock simples para não abrir conexão real do Deepgram (testes locais)
function initDeepgramWSMock() {
	return {
		readyState: WebSocket.CLOSED, // nunca abre
		send: data => debugLogDeepgram('Simulação: dados de áudio capturados', data, true),
		close: () => debugLogDeepgram('Simulação: conexão fechada', true),
	};
}

// Inicializa WebSocket Deepgram com parâmetros genericos (input/output))
async function initDeepgramWS(source = INPUT) {
	const existingWS = deepgramState[source]?.ws ? deepgramState[source].ws() : null;

	if (existingWS && existingWS.readyState === WebSocket.OPEN) {
		console.warn(`🌊 WebSocket Deepgram ${source} já aberto`);
		return existingWS;
	}

	// Pega chave Deepgram salva
	const apiKey = await ipcRenderer.invoke('GET_API_KEY', 'deepgram');
	if (!apiKey) {
		throw new Error('❌ Chave Deepgram não configurada. Configure em "API e Modelos"');
	}

	debugLogDeepgram(`🌊 Inicializando WebSocket Deepgram ${source}...`, false);

	// Monta URL com parâmetros (token é passado na URL para evitar erros 401)
	const params = new URLSearchParams({
		model: 'nova-3',
		language: 'pt-BR',
		encoding: 'linear16', // PCM16
		sample_rate: '16000', // 16kHz
		smart_format: 'true', // Formatação inteligente
		interim_results: 'true', // Habilita interim results
		endpointing: '300', // Detecta pausas naturais
		utterance_end_ms: '1000', // Finaliza a frase após 1s de silêncio
		keyterm: ['JDK', 'JRE', 'JVM', 'P.O.O', 'TDD', 'BDD', 'DDD', 'DLT', 'SOLID', 'MVC'], // Termos técnicos comuns
		punctuate: 'true', // Melhor pontuação
		utterances: 'true', // Habilita timestamps de utterances para calcular duração real da fala
	});

	const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
	const ws = new WebSocket(wsUrl, ['token', apiKey.trim()]);

	return new Promise((resolve, reject) => {
		ws.onopen = () => {
			debugLogDeepgram(`✅ WebSocket Deepgram ${source} conectado | readyState: ${ws.readyState}`, false);

			// Inicia heartbeat para manter conexão viva
			startDeepgramHeartbeat(ws, source);
			resolve(ws);
		};

		ws.onmessage = event => {
			try {
				// Recepção e Processamento de Transcrições
				const data = JSON.parse(event.data);
				handleDeepgramMessage(data, source);
			} catch (e) {
				console.error(`❌ Erro ao processar mensagem Deepgram ${source}:`, e);
			}
		};

		ws.onerror = err => {
			console.error(`❌ Erro WebSocket Deepgram ${source}:`, err);
			console.error('   Type:', err.type, 'Message:', err.message);

			reject(new Error(`Falha ao conectar Deepgram ${source}`));
		};

		ws.onclose = event => {
			debugLogDeepgram(
				`🛑 WebSocket Deepgram ${source} fechado | Code: ${event.code} | Reason: ${event.reason || 'nenhum'} | Clean: ${
					event.wasClean
				}`,
				true,
			);
			stopDeepgramHeartbeat(source);
			try {
				deepgramState[source]?.setWs(null);
			} catch (e) {
				console.warn(`Aviso: falha ao limpar ws em onclose (${source}):`, e);
			}
		};
	});
}

// Troca dinâmica do dispositivo Deepgram (input/output)
async function changeDeviceDeepgram(source, newDeviceId) {
	const vars = deepgramState[source];

	// Verifica se já está trocando
	if (vars.isSwitching?.()) {
		console.warn(`Já em processo de troca de dispositivo ${source.toUpperCase()}`);
		return;
	}

	// Verifica se está ativo
	if (!vars.isActive()) {
		console.warn(`Deepgram ${source.toUpperCase()} não está ativo; nada a trocar`);
		return;
	}

	vars.setIsSwitching(true);
	try {
		sendDeepgramFinalize(source);

		// Novo MediaStream
		const newStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: newDeviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false,
			},
		});

		// Cria nova source e conecta ao HPF existente (ou cria HPF se necessário)
		const audioCtx = vars.audioContext();
		const newSource = audioCtx.createMediaStreamSource(newStream);
		if (!vars.hpf()) {
			const hpf = audioCtx.createBiquadFilter();
			hpf.type = HPF_TYPE;
			hpf.frequency.value = HPF_FREQUENCY;
			hpf.Q.value = HPF_Q_FACTOR;
			vars.setHPF(hpf);
		}

		// Desconecta antiga source
		try {
			const curSource = vars.source?.();
			if (curSource) curSource.disconnect();
		} catch (e) {
			console.warn(`Aviso: falha ao desconectar source durante troca (${source}):`, e);
		}

		// Conecta nova source -> HPF -> processor
		newSource.connect(vars.hpf());
		const proc = vars.processor?.();
		if (vars.hpf() && proc) vars.hpf().connect(proc);

		// Para evitar leaks, para tracks do stream anterior
		try {
			const prevStream = vars.stream?.();
			if (prevStream) prevStream.getTracks().forEach(t => t.stop());
		} catch (e) {
			console.warn(`Aviso: falha ao parar tracks do stream anterior (${source}):`, e);
		}

		// Atualiza referências
		vars.setStream(newStream);
		vars.setSource(newSource);

		debugLogDeepgram(`✅ Troca de dispositivo ${source.toUpperCase()} concluída`, true);
	} catch (e) {
		console.error(`❌ Falha ao trocar dispositivo ${source.toUpperCase()}:`, e);
		throw e;
	} finally {
		vars.setIsSwitching(false);
	}
}

// Envia mensagem "KeepAlive" a cada 5 segundos para manter WebSocket Deepgram vivo
function startDeepgramHeartbeat(ws, source) {
	const interval = setInterval(() => {
		if (ws && ws.readyState === WebSocket.OPEN) {
			try {
				ws.send(JSON.stringify({ type: 'KeepAlive' }));
			} catch (e) {
				console.error(`❌ Erro ao enviar KeepAlive ${source}:`, e);
			}
		}
	}, DEEPGRAM_HEARTBEAT_INTERVAL);

	try {
		deepgramState[source]?.setHeartbeatInterval(interval);
	} catch (error_) {
		console.warn(`Aviso: falha ao configurar heartbeat interval para ${source}:`, error_);
	}
}

// Para heartbeat do Deepgram
function stopDeepgramHeartbeat(source) {
	try {
		const iv = deepgramState[source]?.heartbeatInterval?.();
		if (iv) {
			clearInterval(iv);
			deepgramState[source].setHeartbeatInterval(null);
		}
	} catch (error_) {
		console.warn(`Aviso: falha ao parar heartbeat interval para ${source}:`, error_);
	}
}

// Envia mensagem "Finalize" para Deepgram (input/output)
function sendDeepgramFinalize(source) {
	const ws = deepgramState[source]?.ws?.();

	if (ws && ws.readyState === WebSocket.OPEN) {
		try {
			debugLogDeepgram(`🔔 Enviando Finalize para Deepgram (${source})`, true);
			ws.send(JSON.stringify({ type: 'Finalize' }));
		} catch (e) {
			console.error(`❌ Erro ao enviar Finalize ${source}:`, e);
		}
	}
}

/* ================================ */
//	BUFFER DE PRÉ e POST-ROLL DE ÁUDIO
/* ================================ */

// Armazena buffer de áudio para pré-roll
function storePreRollBuffer(vars, pcm16) {
	try {
		if (!Array.isArray(vars.preRollBuffers)) vars.preRollBuffers = [];
		vars.preRollBuffers.push(pcm16);
		while (vars.preRollBuffers.length > vars.preRollMaxFrames) vars.preRollBuffers.shift();
	} catch (e) {
		console.warn('⚠️ Erro ao armazenar pre-roll buffer:', e.message || e);
	}
}

// Envia pré-roll ao Deepgram
function sendPreRollBuffers(vars) {
	if (!vars.sending) {
		try {
			for (const buf of vars.preRollBuffers) {
				try {
					vars.ws().send(buf);
				} catch (e) {
					console.warn('⚠️ Falha ao enviar pre-roll ao Deepgram:', e.message || e);
				}
			}
			vars.preRollBuffers = [];
			vars.sending = true;
		} catch (e) {
			console.warn('⚠️ Erro ao processar pre-roll buffers:', e.message || e);
		}
	}
}

// Renova timer de post-roll
function renewPostRollTimer(source, vars) {
	if (vars.postRollTimer) {
		clearTimeout(vars.postRollTimer);
		vars.postRollTimer = null;
	}
	vars.postRollTimer = setTimeout(() => {
		vars.sending = false;
		vars.preRollBuffers = [];
		try {
			sendDeepgramFinalize(source);
		} catch (error_) {
			console.warn('⚠️ Erro ao finalizar transcrição Deepgram:', error_ && (error_.message || error_));
		}
	}, vars.postRollMs);
}

// Envia frame atual
function sendCurrentFrame(vars, pcm16) {
	try {
		if (pcm16) vars.ws().send(pcm16);
	} catch (e) {
		console.warn('⚠️ Falha ao enviar buffer atual ao Deepgram:', e.message || e);
	}
}

/* ================================ */
//	DEEPGRAM - INICIAR FLUXO (STT)
/* ================================ */

// Inicia captura de áudio do dispositivo de entrada ou saída com Deepgram
async function startDeepgram(source, UIElements) {
	// Configurações específicas por source
	const config = {
		input: {
			deviceKey: 'inputSelect',
			accessMessage: '🎤 Solicitando acesso à entrada de áudio (Microfone)...',
			threshold: 0.02,
			startLog: '▶️ Captura Deepgram INPUT iniciada',
		},
		output: {
			deviceKey: 'outputSelect',
			accessMessage: '🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...',
			threshold: 0.005,
			startLog: '▶️ Captura Deepgram OUTPUT iniciada',
		},
	};

	const cfg = config[source];
	if (!cfg) {
		throw new Error(`❌ Source inválido: ${source}. Use ${INPUT} ou ${OUTPUT}`);
	}

	const vars = deepgramState[source];

	if (vars.isActive?.()) {
		console.warn(`⚠️ Deepgram ${source.toUpperCase()} já ativo`);
		return;
	}

	try {
		// Obtém o dispositivo selecionado no UI
		const deviceId = UIElements[cfg.deviceKey]?.value;

		debugLogDeepgram(`🔊 Iniciando captura ${source.toUpperCase()} com dispositivo: ${deviceId}`, false);

		// Inicializa WebSocket usando função genérica
		const ws = USE_DEEPGRAM_MOCK ? initDeepgramWSMock() : await initDeepgramWS(source);

		// Define flags via deepgramState
		vars.setWs(ws);
		vars.setActive(true);
		vars.setStartAt(Date.now());

		// Solicita acesso ao dispositivo selecionado
		debugLogDeepgram(cfg.accessMessage, false);

		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: deviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false,
			},
		});

		debugLogDeepgram(`✅ Acesso ao áudio ${source.toUpperCase()} autorizado`, true);

		// Cria AudioContext com 16kHz
		const audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ sampleRate: AUDIO_SAMPLE_RATE });
		await audioCtx.audioWorklet.addModule(AUDIO_WORKLET_PROCESSOR_PATH);

		// Cria MediaStreamSource e guarda via deepgramState
		const mediaSource = audioCtx.createMediaStreamSource(stream);

		// Filtro Passa-Alta
		const hpf = audioCtx.createBiquadFilter();
		hpf.type = HPF_TYPE;
		hpf.frequency.value = HPF_FREQUENCY;
		hpf.Q.value = HPF_Q_FACTOR;

		// Inicia AudioWorklet para captura e processamento de áudio
		const processor = new AudioWorkletNode(audioCtx, STT_AUDIO_WORKLET_PROCESSOR);
		processor.port.postMessage({ type: 'setThreshold', threshold: cfg.threshold });
		processor.port.onmessage = event => {
			processIncomingAudioMessage(source, event.data).catch(error_ =>
				console.error(`❌ Erro ao processar mensagem do worklet (${source}):`, error_),
			);
		};

		// Conecta fluxo: Source -> HPF -> processor -> destination
		mediaSource.connect(hpf);
		hpf.connect(processor);
		processor.connect(audioCtx.destination);

		// Atualiza referências de estado
		vars.setStream(stream);
		vars.setAudioContext(audioCtx);
		vars.setSource(mediaSource);
		vars.setHPF(hpf);
		vars.setProcessor(processor);

		debugLogDeepgram(cfg.startLog, false);
	} catch (error) {
		console.error(`❌ Erro ao iniciar Deepgram ${source.toUpperCase()}:`, error);
		try {
			vars.setActive(false);
		} catch (error_) {
			console.warn('⚠️ Aviso ao resetar active flag:', error_ && (error_.message || error_));
		}
		stopDeepgram(source);
		throw error;
	}
}

// Processa mensagens de áudio recebida do AudioWorklet
async function processIncomingAudioMessage(source, data) {
	const vars = deepgramState[source];
	if (data.type === 'audioData') {
		storePreRollBuffer(vars, data.pcm16);
		const isSpeech = detectSpeech(source, vars, data);
		updateVADState(vars, isSpeech);
		const now = Date.now();
		const wsOpen = vars.ws?.()?.readyState === WebSocket.OPEN;
		const withinPostRoll = now - vars.lastActive < vars.postRollMs;
		const shouldSend = !!isSpeech || withinPostRoll;
		if (shouldSend && wsOpen) {
			try {
				sendPreRollBuffers(vars);
				sendCurrentFrame(vars, data.pcm16);
				renewPostRollTimer(source, vars);
			} catch (e) {
				console.warn('⚠️ Erro no fluxo de envio para Deepgram:', e.message || e);
			}
		}
	} else if (data.type === 'volumeUpdate') {
		vars.lastPercent = data.percent;
		if (globalThis.RendererAPI?.emitUIChange) {
			const ev = source === INPUT ? 'onInputVolumeUpdate' : 'onOutputVolumeUpdate';
			globalThis.RendererAPI.emitUIChange(ev, { percent: data.percent });
		}
		handleSilenceDetection(source, data.percent);
	}
}

// Trata detecção de silêncio com VAD ou fallback
function handleSilenceDetection(source, percent) {
	const vars = deepgramState[source];
	const silenceTimeout = source === INPUT ? SILENCE_TIMEOUT_INPUT : SILENCE_TIMEOUT_OUTPUT;
	const now = Date.now();

	// Decisão principal: VAD se disponível, senão fallback por volume
	const useVADDecision = isVADEnabled() && vars._lastIsSpeech !== undefined;
	const effectiveSpeech = useVADDecision ? !!vars._lastIsSpeech : percent > 0;

	debugLogDeepgram(
		`🔍 VAD ${source}: ${vars._lastIsSpeech ? 'speech' : 'silence'} - 🔊 volume: ${percent.toFixed(2)}%`,
		false,
	);

	if (effectiveSpeech) {
		// Se detectou fala, resetamos estado de silêncio
		if (vars.inSilence) {
			if (!vars.noiseStartTime) vars.noiseStartTime = Date.now();

			const noiseDuration = vars.noiseStartTime - vars.noiseStopTime;
			vars.noiseStopTime = null;

			debugLogDeepgram(`🟢 🟢 🟢 ***** 🔊 Fala real detectada após (${noiseDuration}ms) *****`, true);
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

			debugLogDeepgram(`🔴 🔴 🔴 ***** 🔇 Silêncio estável detectado (${elapsed}ms) *****`, true);

			// Dispara finalize apenas uma vez
			sendDeepgramFinalize(source);
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
	const vars = deepgramState[source];
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

// Processa mensagens do Deepgram para INPUT ou OUTPUT
function handleDeepgramMessage(data, source = INPUT) {
	const transcript = data.channel?.alternatives?.[0]?.transcript || '';

	const isFinal = data.is_final || false;
	const speechFinal = data.speech_final;

	debugLogDeepgram(`📥 RESPOSTA DO DEEPGRAM - (${source})`, true);
	debugLogDeepgram(`📥 Mensagem Deepgram ${source} recebida:`, data, true);
	debugLogDeepgram(`📥 Type: ${data.type} | isFinal: ${isFinal} | speechFinal: ${speechFinal}`, true);
	debugLogDeepgram(`📥 Transcript presente: ${transcript?.trim() ? 'SIM' : 'NÃO'}`, true);

	if (isFinal) {
		handleFinalDeepgramMessage(source, transcript);
	} else {
		handleInterimDeepgramMessage(source, transcript);
	}
}

// Processa mensagens interim do Deepgram (transcrições parciais)
function handleInterimDeepgramMessage(source, transcript) {
	debugLogDeepgram(`⏳ 🟠 Handle INTERIM [${source}]: "${transcript}"`, true);

	if (!transcript?.trim()) {
		console.warn(`⚠️ Transcript interim vazio recebido do Deepgram (${source}); ignorando.`);
		return;
	}

	const vars = deepgramState[source];
	vars.lastTranscript = transcript;

	// Atualiza interim transcript no UI
	updateInterim(source, transcript, vars.author);

	// Atualiza CURRENT question (apenas para output)
	updateCurrentQuestion(source, transcript, true);
}

// Processa mensagens finais do Deepgram (transcrições completas)
function handleFinalDeepgramMessage(source, transcript) {
	debugLogDeepgram(`📝 🟢 Handle FINAL [${source.toUpperCase()}]: "${transcript}"`, true);

	const vars = deepgramState[source];
	vars.lastTranscript = transcript.trim() ? transcript : vars.lastTranscript;

	if (transcript.trim()) {
		const placeholderId = `dg-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
		const metrics = calculateTimingMetrics(vars);

		addTranscriptPlaceholder(vars.author, placeholderId, metrics.startStr);
		fillTranscriptPlaceholder(vars.author, transcript, placeholderId, metrics);
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
	const interimId = source === INPUT ? 'deepgram-interim-input' : 'deepgram-interim-output';
	if (globalThis.RendererAPI?.emitUIChange) {
		globalThis.RendererAPI.emitUIChange('onClearInterim', { id: interimId });
	}
}

// Atualiza interim transcript no UI
function updateInterim(source, transcript, author) {
	const interimId = source === INPUT ? 'deepgram-interim-input' : 'deepgram-interim-output';
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
	const vars = deepgramState[source];
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
//	DEEPGRAM - PARAR FLUXO (STT)
/* ================================ */

// Envia CloseStream ao Deepgram se WebSocket estiver aberto
function closeDeepgramStream(vars, source) {
	const ws = vars.ws();
	if (!ws || ws.readyState !== WebSocket.OPEN) return;

	try {
		ws.send(JSON.stringify({ type: 'CloseStream' }));
		debugLogDeepgram(`📤 CloseStream enviado para ${source.toUpperCase()}`, true);
	} catch (error_) {
		console.error(`❌ Erro ao enviar CloseStream ${source}:`, error_ && (error_.message || error_));
	}
}

// Fecha WebSocket Deepgram
function closeDeepgramWebSocket(vars, source) {
	const ws = vars.ws();
	if (!ws) return;
	try {
		ws.close();
	} catch (error_) {
		console.error(`Erro ao fechar WebSocket ${source}:`, error_ && (error_.message || error_));
	}
	vars.setWs(null);
}

// Desconecta processador de áudio
function disconnectAudioProcessor(vars) {
	const processor = vars.processor();
	if (processor) {
		processor.disconnect();
		vars.setProcessor(null);
	}
}

// Para fluxo de áudio da origem
function stopAudioStream(vars) {
	const stream = vars.stream();
	if (stream) {
		stream.getTracks().forEach(t => t.stop());
		vars.setStream(null);
	}
}

// Desconecta MediaStreamSource
function disconnectMediaStreamSource(vars, source) {
	try {
		const src = vars.source?.();
		if (!src) return;
		try {
			src.disconnect();
		} catch (error_) {
			console.warn(`Aviso: falha ao desconectar source durante stop (${source}):`, error_);
		}
		vars.setSource(null);
	} catch (error_) {
		console.warn(`Aviso: falha ao limpar source em stop (${source}):`, error_);
	}
}

// Desconecta filtro HPF
function disconnectHighPassFilter(vars) {
	try {
		const hpf = vars.hpf?.();
		if (!hpf) {
			return;
		}
		try {
			hpf.disconnect();
		} catch (error_) {
			console.warn('Aviso: falha ao desconectar HPF:', error_ && (error_.message || error_));
		}
		vars.setHPF(null);
	} catch (error_) {
		console.warn('Aviso: falha ao limpar HPF:', error_ && (error_.message || error_));
	}
}

// Fecha AudioContext
function closeAudioContext(vars) {
	const audioContext = vars.audioContext();
	if (audioContext) {
		audioContext.close();
		vars.setAudioContext(null);
	}
}

// Para captura Deepgram de um source específico (input/output)
function stopDeepgram(source) {
	const vars = deepgramState[source];
	if (!vars.isActive()) {
		debugLogDeepgram(`⚠️ Deepgram ${source} já parado, pulando.`, true);
		return;
	}
	vars.setActive(false);
	closeDeepgramStream(vars, source);
	stopDeepgramHeartbeat(source);
	closeDeepgramWebSocket(vars, source);
	disconnectAudioProcessor(vars);
	stopAudioStream(vars);
	disconnectMediaStreamSource(vars, source);
	disconnectHighPassFilter(vars);
	closeAudioContext(vars);
	debugLogDeepgram(`🛑 Captura Deepgram ${source.toUpperCase()} parada`, true);
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
function debugLogDeepgram(...args) {
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
			`%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug em deepgram-transcribe.js:`, 
			'color: blue; font-weight: bold;', 
			...cleanArgs
		);
	}
}

/* ================================ */
//	INTERFACE PÚBLICA
/* ================================ */

/**
 * Inicia captura de áudio do dispositivo de entrada e/ou saída com Deepgram
 */
async function startAudioDeepgram(UIElements) {
	debugLogRenderer('Início da função: "startAudioDeepgram"');

	try {
		// Inicia VAD nativo se disponível
		vadInstance = initVAD();
		if (vadInstance) {
			vadAvailable = true;
			debugLogRenderer(`✅ VAD nativo inicializado`, true);
		} else {
			debugLogRenderer(`⚠️ VAD nativo não disponível, usando fallback de energia`, true);
		}

		// 🌊 Deepgram: Inicia INPUT/OUTPUT
		if (UIElements.inputSelect?.value) await startDeepgram(INPUT, UIElements);
		if (UIElements.outputSelect?.value) await startDeepgram(OUTPUT, UIElements);
	} catch (error) {
		console.error('❌ Erro ao iniciar Deepgram:', error);
		throw error;
	}

	debugLogRenderer('Fim da função: "startAudioDeepgram"');
}

/**
 * Para ambas as entradas INPUT e OUTPUT no modelo Deepgram
 */
function stopAudioDeepgram() {
	debugLogRenderer('Início da função: "stopAudioDeepgram"');

	try {
		// 🌊 Deepgram: Para INPUT e OUTPUT
		stopDeepgram(INPUT);
		stopDeepgram(OUTPUT);
		debugLogDeepgram('🛑 Deepgram completamente parado', true);
	} catch (error) {
		console.error('❌ Erro ao parar Deepgram:', error);
	}

	debugLogRenderer('Fim da função: "stopAudioDeepgram"');
}

/**
 * Troca dinâmica o dispositivo de entrada Deepgram (input/output)
 * @param {*} source
 * @param {*} newDeviceId
 * @returns
 */
async function switchDeviceDeepgram(source, newDeviceId) {
	debugLogRenderer('Início da função: "switchDeviceDeepgram"');
	debugLogRenderer('Fim da função: "switchDeviceDeepgram"');
	return await changeDeviceDeepgram(source, newDeviceId);
}

/* ================================ */
//	EXPORTS (CommonJS)
/* ================================ */

module.exports = {
	startAudioDeepgram,
	stopAudioDeepgram,
	switchDeviceDeepgram,
};
