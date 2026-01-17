/**
 * 🌊 DEEPGRAM LIVE STREAMING - MÓDULO INDEPENDENTE
 *
 * Documentação: https://developers.deepgram.com/docs/audio-keep-alive
 *
 * Implementação isolada de transcrição com Deepgram Live Streaming.
 * - Captura áudio diretamente via WebSocket (sem IPC para dados binários)
 * - Consolida interim results e transcrições finais
 *
 * Uso:
 * - startAudioDeepgram() -> startDeepgramInput() / stopDeepgramInput() para capturar entrada
 * - startAudioDeepgram() -> startDeepgramOutput() / stopDeepgramOutput() para capturar saída
 */

/* ================================ */
//	IMPORTS
/* ================================ */
const { ipcRenderer } = require('electron');

/* ================================ */
//	CONSTANTES
/* ================================ */
const USE_DEEPGRAM_MOCK = false; // Mude para true para ativar os testes sem Deepgram real

const YOU = 'Você'; // Autor das transcrições de entrada
const OTHER = 'Outros'; // Autor das transcrições de saída

const DEEPGRAM_HEARTBEAT_INTERVAL = 5000; // 5 segundos (entre 3-5 segundos conforme documentação)

/* ================================ */
//	ESTADO DO DEEPGRAM
/* ================================ */

// deepgramVars mantém seu próprio estado interno (não mais refletido em variáveis globais)
const deepgramVars = {
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
		send: data => console.log('Simulação: dados de áudio capturados', data),
		close: () => console.log('Simulação: conexão fechada'),
	};
}

// Helper: run native VAD or energy-based fallback for a single frame
// Returns: true (speech), false (no speech), null (error / undecided)
function runNativeVAD(frame, sampleRate = 16000) {
	try {
		if (typeof vadInstance !== 'undefined' && vadInstance) {
			try {
				if (typeof vadInstance.process === 'function') {
					// Some implementations expect (sampleRate, frame), others (frame)
					if (vadInstance.process.length === 2) {
						const r = vadInstance.process(sampleRate, frame);
						if (typeof r === 'boolean') return r;
						if (Array.isArray(r)) return r.some(d => d === 1);
					} else {
						const r = vadInstance.process(frame);
						if (typeof r === 'boolean') return r;
						if (Array.isArray(r)) return r.some(d => d === 1);
					}
				} else if (typeof vadInstance.isSpeech === 'function') {
					return !!vadInstance.isSpeech(frame, sampleRate);
				} else if (typeof vadInstance === 'function') {
					return !!vadInstance(frame, sampleRate);
				}
			} catch (innerErr) {
				console.warn('runNativeVAD: erro ao chamar vadInstance:', innerErr && (innerErr.message || innerErr));
				return null;
			}
		}

		// fallback based on energy
		const energy = computeEnergy(frame);
		return energy > ENERGY_THRESHOLD;
	} catch (err) {
		console.warn('runNativeVAD erro:', err && (err.message || err));
		return null;
	}
}

// Inicializa WebSocket Deepgram com parâmetros genericos (input/output))
async function initDeepgramWS(source = 'input') {
	const existingWS = deepgramVars[source]?.ws ? deepgramVars[source].ws() : null;

	if (existingWS && existingWS.readyState === WebSocket.OPEN) {
		console.log(`🌊 WebSocket Deepgram ${source} já aberto`);
		return existingWS;
	}

	// Pega chave Deepgram salva
	const apiKey = await ipcRenderer.invoke('GET_API_KEY', 'deepgram');
	if (!apiKey) {
		throw new Error('❌ Chave Deepgram não configurada. Configure em "API e Modelos"');
	}

	console.log(`🌊 Inicializando WebSocket Deepgram ${source}...`);

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
			console.log(`✅ WebSocket Deepgram ${source} conectado | readyState: ${ws.readyState}`);

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
			console.log(
				`🛑 WebSocket Deepgram ${source} fechado | Code: ${event.code} | Reason: ${event.reason || 'nenhum'} | Clean: ${
					event.wasClean
				}`,
			);
			stopDeepgramHeartbeat(source);
			try {
				deepgramVars[source]?.setWs(null);
			} catch (e) {
				console.warn(`Aviso: falha ao limpar ws em onclose (${source}):`, e);
			}
		};
	});
}

// Troca dinâmica do dispositivo Deepgram (input/output)
async function changeDeviceDeepgram(source, newDeviceId) {
	const vars = deepgramVars[source];

	// Verifica se já está trocando
	if (vars.isSwitching?.()) {
		console.warn(`Já em processo de troca de dispositivo ${source.toUpperCase()}`);
		return;
	}
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
			hpf.type = 'highpass';
			hpf.frequency.value = 150;
			hpf.Q.value = 1;
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

		console.log(`✅ Troca de dispositivo ${source.toUpperCase()} concluída`);
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
		deepgramVars[source]?.setHeartbeatInterval(interval);
	} catch (e) {}
}

// Para heartbeat do Deepgram
function stopDeepgramHeartbeat(source) {
	try {
		const iv = deepgramVars[source]?.heartbeatInterval?.();
		if (iv) {
			clearInterval(iv);
			deepgramVars[source].setHeartbeatInterval(null);
		}
	} catch (e) {}
}

// Envia comando "Finalize" para Deepgram forçando processamento imediato do buffer de áudio pendente
function sendDeepgramFinalize(source) {
	const ws = deepgramVars[source]?.ws?.();

	if (ws && ws.readyState === WebSocket.OPEN) {
		try {
			//----------- Logs detalhados para debug
			const nowLog = new Date();
			const timeStr =
				`${nowLog.getHours().toString().padStart(2, '0')}:` +
				`${nowLog.getMinutes().toString().padStart(2, '0')}:` +
				`${nowLog.getSeconds().toString().padStart(2, '0')}.` +
				`${nowLog.getMilliseconds().toString().padStart(3, '0')}`;
			console.log(`🔔 Enviando Finalize para Deepgram (${source}) às ${timeStr}`);
			//----------- Fim dos logs detalhados

			ws.send(JSON.stringify({ type: 'Finalize' }));
		} catch (e) {
			console.error(`❌ Erro ao enviar Finalize ${source}:`, e);
		}
	}
}

/* ================================ */
//	DEEPGRAM - INICIA FLUXO (STT)
/* ================================ */

// Inicia captura de áudio do dispositivo de entrada com Deepgram
async function startDeepgramInput(UIElements) {
	// Passo 1: Iniciar captura de áudio da saída

	if (deepgramVars.input.isActive?.()) {
		console.warn('⚠️ Deepgram INPUT já ativo');
		return;
	}

	try {
		// Obtém o dispositivo INPUT selecionado no UI (busca diretamente no DOM)
		const inputDeviceId = UIElements.inputSelect?.value;

		console.log(`🔊 Iniciando captura INPUT com dispositivo: ${inputDeviceId}`);

		// Inicializa WebSocket usando função genérica
		const ws = USE_DEEPGRAM_MOCK ? initDeepgramWSMock() : await initDeepgramWS('input');

		// Define flags via deepgramVars
		deepgramVars.input.setWs(ws);
		deepgramVars.input.setActive(true);
		deepgramVars.input.setStartAt(Date.now());

		// Solicita acesso ao dispositivo INPUT selecionado
		console.log('🎤 Solicitando acesso à entrada de áudio (Microfone)...');

		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: inputDeviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false,
			},
		});

		console.log('✅ Entrada de áudio autorizada');

		// Cria AudioContext com 16kHz
		const audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ sampleRate: 16000 });
		await audioCtx.audioWorklet.addModule('./deepgram-audio-worklet-processor.js');

		// Cria MediaStreamSource e guarda via deepgramVars
		const source = audioCtx.createMediaStreamSource(stream);

		// Filtro Passa-Alta
		const hpf = audioCtx.createBiquadFilter();
		hpf.type = 'highpass';
		hpf.frequency.value = 200;
		hpf.Q.value = 1;

		// Worklet
		const processor = new AudioWorkletNode(audioCtx, 'deepgram-audio-worklet-processor');
		processor.port.postMessage({ type: 'setThreshold', threshold: 0.02 });
		processor.port.onmessage = event => {
			processIncomingAudioMessage('input', event.data).catch(e =>
				console.error('❌ Erro ao processar mensagem do worklet (input):', e),
			);
		};

		// Conecta fluxo: Source -> HPF -> processor -> destination
		source.connect(hpf);
		hpf.connect(processor);
		processor.connect(audioCtx.destination);

		// Atualiza referências via deepgramVars (setters atualizam as variáveis globais existentes)
		deepgramVars.input.setStream(stream);
		deepgramVars.input.setAudioContext(audioCtx);
		deepgramVars.input.setSource(source);
		deepgramVars.input.setHPF(hpf);
		deepgramVars.input.setProcessor(processor);

		console.log('▶️ Captura Deepgram INPUT iniciada');
	} catch (error) {
		console.error('❌ Erro ao iniciar Deepgram INPUT:', error);
		try {
			deepgramVars.input.setActive(false);
		} catch (e) {}
		stopDeepgram('input');
		throw error;
	}
}

// Inicia captura de áudio do dispositivo de saída com Deepgram
async function startDeepgramOutput(UIElements) {
	// Passo 1: Iniciar captura de áudio da saída

	if (deepgramVars.output.isActive?.()) {
		console.warn('⚠️ Deepgram OUTPUT já ativo');
		return;
	}

	try {
		// Obtém o dispositivo OUTPUT selecionado no UI (busca diretamente no DOM)
		const outputDeviceId = UIElements.outputSelect?.value;

		console.log(`🔊 Iniciando captura OUTPUT com dispositivo: ${outputDeviceId}`);

		// Inicializa WebSocket usando função genérica
		const ws = USE_DEEPGRAM_MOCK ? initDeepgramWSMock() : await initDeepgramWS('output');

		// Define flags via deepgramVars
		deepgramVars.output.setWs(ws);
		deepgramVars.output.setActive(true);
		deepgramVars.output.setStartAt(Date.now());

		// Solicita acesso ao dispositivo OUTPUT selecionado
		console.log('🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...');

		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				deviceId: { exact: outputDeviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false, // Evita que o volume suba no silêncio, expondo ruído residual
			},
		});

		console.log('✅ Saída de áudio autorizada');

		// Cria AudioContext com 16kHz
		const audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ sampleRate: 16000 });
		await audioCtx.audioWorklet.addModule('./deepgram-audio-worklet-processor.js');

		// Cria MediaStreamSource e guarda via deepgramVars
		const source = audioCtx.createMediaStreamSource(stream);

		// Filtro passa-alta
		const hpf = audioCtx.createBiquadFilter();
		hpf.type = 'highpass';
		hpf.frequency.value = 200;
		hpf.Q.value = 1;

		// Worklet
		const processor = new AudioWorkletNode(audioCtx, 'deepgram-audio-worklet-processor');
		processor.port.postMessage({ type: 'setThreshold', threshold: 0.005 });
		processor.port.onmessage = event => {
			// processIncomingAudioMessage é async; garantir captura de rejeições
			processIncomingAudioMessage('output', event.data).catch(e =>
				console.error('❌ Erro ao processar mensagem do worklet (output):', e),
			);
		};

		// Conecta fluxo: Source -> HPF -> processor -> destination
		source.connect(hpf);
		hpf.connect(processor);
		processor.connect(audioCtx.destination);

		// Atualiza referências via deepgramVars
		deepgramVars.output.setStream(stream);
		deepgramVars.output.setAudioContext(audioCtx);
		deepgramVars.output.setSource(source);
		deepgramVars.output.setHPF(hpf);
		deepgramVars.output.setProcessor(processor);

		console.log('▶️ Captura Deepgram OUTPUT iniciada');
	} catch (error) {
		console.error('❌ Erro ao iniciar Deepgram OUTPUT:', error);
		try {
			deepgramVars.output.setActive(false);
		} catch (e) {}
		stopDeepgram('output');
		throw error;
	}
}

// Processa mensagens de áudio recebidas do AudioWorklet (input/output)
async function processIncomingAudioMessage(source, data) {
	const vars = deepgramVars[source];

	if (data.type === 'audioData') {
		// Em vez de enviar imediatamente, acumulamos o buffer para pré-roll
		try {
			// Garantir que vars.preRollBuffers exista (definido no deepgramVars)
			if (!Array.isArray(vars.preRollBuffers)) vars.preRollBuffers = [];

			// Guardar o ArrayBuffer para possível envio posterior
			// data.pcm16 é um ArrayBuffer transferido do Worklet
			vars.preRollBuffers.push(data.pcm16);

			// Limitar tamanho do pré-roll
			while (vars.preRollBuffers.length > vars.preRollMaxFrames) {
				// libera o mais antigo
				vars.preRollBuffers.shift();
			}
		} catch (e) {
			console.warn('⚠️ Erro ao armazenar pre-roll buffer:', e.message || e);
		}

		// VAD nativo (se disponível) — processa em frames de 30ms
		let isSpeech = null;

		if (isVADEnabled()) {
			try {
				const sampleRate = data.sampleRate || 16000;
				const pcm = new Int16Array(data.pcm16);

				// 30ms por frame
				const frameSize = Math.floor(sampleRate * 0.03);

				for (let i = 0; i + frameSize <= pcm.length; i += frameSize) {
					const frame = pcm.subarray(i, i + frameSize);
					const vadDecision = runNativeVAD(frame, sampleRate);
					if (vadDecision === true) {
						isSpeech = true;
						break;
					} else if (vadDecision === null) {
						// erro interno do VAD -> fallback
						isSpeech = null;
						break;
					}
				}
			} catch (e) {
				console.warn('⚠️ Erro ao executar VAD nativo:', e.message || e);
				isSpeech = null;
			}
		}

		// Fallback baseado em energia/percentual de volume
		if (isSpeech === null) {
			isSpeech = fallbackIsSpeech(source, vars.lastPercent);
		}

		// Salva decisão do VAD/fallback para uso na detecção de silêncio
		vars._lastIsSpeech = !!isSpeech;
		vars._lastVADTimestamp = Date.now();

		const now = Date.now();

		if (isSpeech) {
			vars.lastActive = now;
		}

		// Política de envio com pré-roll e post-roll
		const wsOpen = vars.ws && vars.ws()?.readyState === WebSocket.OPEN;
		const withinPostRoll = now - vars.lastActive < vars.postRollMs;

		const shouldSend = !!isSpeech || withinPostRoll;

		if (shouldSend && wsOpen) {
			// Se ainda não estamos enviando, primeiro esvaziar o pre-roll
			try {
				if (!vars.sending) {
					// enviar todos os buffers de pré-roll na ordem (helper)
					try {
						for (const buf of vars.preRollBuffers) {
							try {
								vars.ws().send(buf);
							} catch (e) {
								console.warn('⚠️ Falha ao enviar pre-roll ao Deepgram:', e.message || e);
							}
						}
						vars.preRollBuffers = []; // já enviados
						vars.sending = true;
					} catch (e) {
						console.warn('⚠️ Erro ao processar pre-roll buffers:', e.message || e);
					}
				}

				// O frame atual (recebido) já foi empilhado em preRollBuffers; se estivermos em sending, ele pode ter sido consumido.
				// Para garantir envio do áudio mais recente (caso não tenha sido enviado), envie o último buffer recebido.
				try {
					const lastBuf = data.pcm16;
					if (lastBuf) vars.ws().send(lastBuf);
				} catch (e) {
					console.warn('⚠️ Falha ao enviar buffer atual ao Deepgram:', e.message || e);
				}
			} catch (e) {
				console.warn('⚠️ Erro no fluxo de envio para Deepgram:', e.message || e);
			}

			// cancelar qualquer timer de post-roll anterior e iniciar um novo
			if (vars.postRollTimer) {
				clearTimeout(vars.postRollTimer);
				vars.postRollTimer = null;
			}
			vars.postRollTimer = setTimeout(() => {
				// fim do post-roll: paramos de enviar e solicitamos finalize do Deepgram
				vars.sending = false;
				vars.preRollBuffers = []; // descarta buffers antigos
				try {
					sendDeepgramFinalize(source);
				} catch (e) {}
			}, vars.postRollMs);
		}
	} else if (data.type === 'volumeUpdate') {
		const percent = data.percent;
		vars.lastPercent = percent;

		if (globalThis.RendererAPI?.emitUIChange) {
			const ev = source === 'input' ? 'onInputVolumeUpdate' : 'onOutputVolumeUpdate';
			globalThis.RendererAPI.emitUIChange(ev, { percent });
		}

		// Mantém sua lógica de silêncio, com timeouts ajustados
		handleSilenceDetection(source, percent, source === 'output' ? 700 : 500);
	}
}

// Trata detecção de silêncio com VAD ou fallback
function handleSilenceDetection(source, percent, silenceTimeout = 700) {
	const vars = deepgramVars[source];
	const now = Date.now();

	// Decisão principal: VAD se disponível, senão fallback por volume
	const useVADDecision = isVADEnabled() && typeof vars._lastIsSpeech !== 'undefined';
	const effectiveSpeech = useVADDecision ? !!vars._lastIsSpeech : percent > 0;

	// NOSONAR
	//----------- Logs detalhados para debug
	// const nowLog = new Date();
	// const timeStr =
	// 	`${nowLog.getHours().toString().padStart(2, '0')}:` +
	// 	`${nowLog.getMinutes().toString().padStart(2, '0')}:` +
	// 	`${nowLog.getSeconds().toString().padStart(2, '0')}.` +
	// 	`${nowLog.getMilliseconds().toString().padStart(3, '0')}`;
	// console.log(
	// 	` 🔍 VAD ${source}: ${vars._lastIsSpeech ? 'speech' : 'silence'} - 🔊 volume: ${percent.toFixed(
	// 		2,
	// 	)}% | ⏱️ ${timeStr}`,
	// );
	//----------- Fim dos logs detalhados

	if (effectiveSpeech) {
		// Se detectou fala, resetamos estado de silêncio
		if (vars.inSilence) {
			if (!vars.noiseStartTime) vars.noiseStartTime = Date.now();

			const noiseDuration = vars.noiseStartTime - vars.noiseStopTime;
			vars.noiseStopTime = null;

			console.log(`🟡 🟢 🟢 [${new Date().toISOString()}] 🔊 Fala real detectada após (${noiseDuration}ms)`);
		}

		vars.inSilence = false;
		vars.shouldFinalizeAskCurrent = false;
		vars.lastActive = now;
		vars.noiseStartTime = null;
	} else {
		// Sem fala → verifica se já passou o timeout
		const elapsed = now - vars.lastActive;

		// Entrando em silêncio estável
		if (elapsed >= silenceTimeout && !vars.inSilence) {
			vars.inSilence = true;
			vars.shouldFinalizeAskCurrent = true;
			vars.noiseStopTime = Date.now();

			console.log(`🟡 🔴 🔴 [${new Date().toISOString()}] ***** 🔇 Silêncio estável detectado (${elapsed}ms) *****`);

			// Dispara finalize apenas uma vez
			sendDeepgramFinalize(source);
		}
	}
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
		return new VAD.default(16000, 2);
	} else if (typeof VAD === 'function') {
		// node-webrtcvad (CommonJS)
		return new VAD(2);
	} else if (VAD?.VAD) {
		// classe interna
		return new VAD.VAD(2);
	}

	return null;
}

// Verifica se VAD nativo está habilitado e disponível
function isVADEnabled() {
	return useNativeVAD && !!vadAvailable;
}

// Fallback de VAD baseado em energia com suavização (multi-frame)
function fallbackIsSpeech(source, percent) {
	const vars = deepgramVars[source];
	if (!vars.vadWindow) vars.vadWindow = [];
	const window = vars.vadWindow;
	window.push(percent);
	if (window.length > 6) window.shift(); // últimos ~6 frames (~50ms-100ms dependendo do worklet)
	const avg = window.reduce((a, b) => a + b, 0) / window.length;
	// heurística ajustada: muitos loopbacks/VoiceMeeter apresentam baseline alto
	// aumentar limiar para reduzir segmentação falsa (experiência inicial: 20%)
	return avg > 20;
}

/* ================================ */
//	PROCESSAMENTO DE MENSAGENS
/* ================================ */

// Processa mensagens do Deepgram para INPUT ou OUTPUT
function handleDeepgramMessage(data, source = 'input') {
	const transcript = data.channel?.alternatives?.[0]?.transcript || '';

	const isFinal = data.is_final || false;
	const speechFinal = data.speech_final;

	//----------- Logs detalhados para debug
	console.log(`📥 RESPOSTA DO DEEPGRAM - (${source}) - ${new Date().toLocaleTimeString('pt-BR')}`);
	console.log(`📥 Mensagem Deepgram ${source} recebida:`, data);
	console.log(`📥 Type: ${data.type} | isFinal: ${isFinal} | speechFinal: ${speechFinal}`);
	console.log(`📥 Transcript presente: ${transcript?.trim() ? 'SIM' : 'NÃO'}`);
	//----------- Fim dos logs detalhados

	if (isFinal) {
		handleFinalDeepgramMessage(source, transcript);
	} else {
		if (!transcript?.trim()) return; // Ignora transcrições vazias

		handleInterimDeepgramMessage(source, transcript);
	}
}

// Processa mensagens interim do Deepgram (transcrições parciais)
function handleInterimDeepgramMessage(source, transcript) {
	console.log(`🟡 Handle INTERIM [${source}]: "${transcript}"`);

	const isInput = source === 'input';
	const author = isInput ? YOU : OTHER;
	const vars = deepgramVars[source];

	// Guarda último interim
	vars.lastTranscript = transcript;

	// Define ID do elemento interim
	const interimId = isInput ? 'deepgram-interim-input' : 'deepgram-interim-output';

	// Emitir atualização de interim via RendererAPI
	if (globalThis.RendererAPI?.emitUIChange) {
		globalThis.RendererAPI.emitUIChange('onUpdateInterim', {
			id: interimId,
			speaker: author,
			text: transcript,
		});
	}

	// Para OUTPUT, atualizar CURRENT com interim
	if (!isInput && globalThis.RendererAPI?.handleCurrentQuestion) {
		globalThis.RendererAPI.handleCurrentQuestion(author, transcript, {
			isInterim: true,
			shouldFinalizeAskCurrent: vars.shouldFinalizeAskCurrent,
		});
	}
}

// Processa mensagens finais do Deepgram (transcrições completas)
function handleFinalDeepgramMessage(source, transcript) {
	console.log(`📝 ✅ Handle FINAL [${source.toUpperCase()}]: "${transcript}"`);

	const vars = deepgramVars[source];
	// Atualiza último transcript final
	vars.lastTranscript = transcript.trim() ? transcript : vars.lastTranscript;

	// Calcular métricas de timing
	const isInput = source === 'input';
	const author = isInput ? YOU : OTHER;
	const now = Date.now();
	const startAt = vars.startAt ? vars.startAt() : null;
	const stopAt = now;
	const startStr = startAt ? new Date(startAt).toLocaleTimeString() : new Date(now).toLocaleTimeString();
	const stopStr = stopAt ? new Date(stopAt).toLocaleTimeString() : new Date(now).toLocaleTimeString();
	const recordingDuration = startAt ? ((stopAt - startAt) / 1000).toFixed(2) : '0.00';
	const latency = startAt ? ((now - startAt) / 1000).toFixed(2) : '0.00';
	const total = startAt ? ((stopAt - startAt) / 1000).toFixed(2) : '0.00';

	if (transcript.trim()) {
		// Criar placeholder ID único
		const placeholderId = `dg-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

		// Adicionar transcrição com placeholder (...), que será preenchido depois
		if (globalThis.RendererAPI?.emitUIChange) {
			const transcriptData = {
				author,
				text: '...', // Placeholder, será preenchido com onPlaceholderFulfill
				timeStr: startAt ? new Date(startAt).toLocaleTimeString() : new Date(now).toLocaleTimeString(),
				elementId: 'conversation',
				placeholderId: placeholderId,
			};

			// Adiciona transcrição com placeholder via evento
			globalThis.RendererAPI.emitUIChange('onTranscriptAdd', transcriptData);
		}

		// Preenche placeholder com transcrição final
		if (globalThis.RendererAPI?.emitUIChange) {
			globalThis.RendererAPI.emitUIChange('onPlaceholderFulfill', {
				speaker: author,
				text: transcript,
				placeholderId: placeholderId,
				startStr: startStr,
				stopStr: stopStr,
				recordingDuration: recordingDuration,
				latency: latency,
				total: total,
				showMeta: false, // Não exibir métricas para Deepgram por enquanto
			});
		}

		// Limpar elemento interim no UI
		const interimId = isInput ? 'deepgram-interim-input' : 'deepgram-interim-output';
		if (globalThis.RendererAPI?.emitUIChange) {
			globalThis.RendererAPI.emitUIChange('onClearInterim', { id: interimId });
		}
	}

	// Para OUTPUT, atualizar CURRENT com a transcrição final
	if (!isInput && globalThis.RendererAPI?.handleCurrentQuestion) {
		// Atualiza CURRENT com a transcrição final
		globalThis.RendererAPI.handleCurrentQuestion(author, transcript, {
			isInterim: false,
			shouldFinalizeAskCurrent: vars.shouldFinalizeAskCurrent,
		});

		// Reseta flag após processar a mensagem final
		if (vars.shouldFinalizeAskCurrent) {
			vars.shouldFinalizeAskCurrent = false;
		}
	}
}

/* ================================ */
//	DEEPGRAM - PARA FLUXO (STT)
/* ================================ */

// Para captura Deepgram de um source específico (input/output)
function stopDeepgram(source) {
	const vars = deepgramVars[source];

	// Verificação de estado: se já parado, sai cedo
	if (!vars.isActive()) {
		console.log(`⚠️ Deepgram ${source} já parado, pulando.`);
		return;
	}

	// Define flag como false
	vars.setActive(false);

	// Envia "CloseStream" se WebSocket estiver aberto
	const ws = vars.ws();
	if (ws && ws.readyState === WebSocket.OPEN) {
		try {
			ws.send(JSON.stringify({ type: 'CloseStream' }));
			console.log(`📤 CloseStream enviado para ${source.toUpperCase()}`);
		} catch (e) {
			console.error(`❌ Erro ao enviar CloseStream ${source}:`, e);
		}
	}

	// Para heartbeat
	stopDeepgramHeartbeat(source);

	// Fecha WebSocket
	if (ws) {
		try {
			ws.close();
		} catch (e) {
			console.error(`Erro ao fechar WebSocket ${source}:`, e);
		}
		vars.setWs(null);
	}

	// Limpar elemento interim no UI
	const interimId = source === 'input' ? 'deepgram-interim-input' : 'deepgram-interim-output';
	if (globalThis.RendererAPI?.emitUIChange) {
		globalThis.RendererAPI.emitUIChange('onClearInterim', { id: interimId });
	}

	// Limpa recursos
	const processor = vars.processor();
	if (processor) {
		processor.disconnect();
		vars.setProcessor(null);
	}

	const stream = vars.stream();
	if (stream) {
		stream.getTracks().forEach(t => t.stop());
		vars.setStream(null);
	}

	// Desconecta e limpa MediaStreamSource/HPF se existirem (usando deepgramVars)
	try {
		const src = vars.source && vars.source();
		if (src) {
			try {
				src.disconnect();
			} catch (e) {}
			vars.setSource(null);
		}
	} catch (e) {}
	try {
		const hpf = vars.hpf?.();
		if (hpf) {
			try {
				hpf.disconnect();
			} catch (e) {}
			vars.setHPF(null);
		}
	} catch (e) {}

	const audioContext = vars.audioContext();
	if (audioContext) {
		audioContext.close();
		vars.setAudioContext(null);
	}

	console.log(`🛑 Captura Deepgram ${source.toUpperCase()} parada`);
}

/* ================================ */
//	EXPORTS (CommonJS)
/* ================================ */

/**
 * Inicia captura de áudio do dispositivo de entrada e/ou saída com Deepgram
 */
async function startAudioDeepgram(UIElements) {
	debugLogRenderer('Início da função: "startAudioDeepgram"');

	try {
		// 🌊 Deepgram: Inicia INPUT/OUTPUT
		if (UIElements.inputSelect?.value) await startDeepgramInput(UIElements);
		if (UIElements.outputSelect?.value) await startDeepgramOutput(UIElements);

		// Inicializa uma vez (no bootstrap da app ou antes de começar a capturar áudio)
		if (useNativeVAD) {
			vadInstance = initVAD();
			vadAvailable = !!vadInstance;
		}
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
		stopDeepgram('input');
		stopDeepgram('output');
		console.log('🛑 Deepgram completamente parado');
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

module.exports = {
	startAudioDeepgram,
	stopAudioDeepgram,
	switchDeviceDeepgram,
};
