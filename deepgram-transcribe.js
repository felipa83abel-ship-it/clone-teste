/**
 * 🌊 DEEPGRAM LIVE STREAMING - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição com Deepgram Live Streaming.
 * - Captura áudio diretamente via WebSocket (sem IPC para dados binários)
 * - Consolida interim results em transcrições finais
 * - Converge para handleSpeech() como outros providers (Whisper, Vosk)
 *
 * Uso:
 * - startAudioDeepgram() -> startDeepgramInput() / stopDeepgramInput() para capturar microfone
 * - startAudioDeepgram() -> startDeepgramOutput() / stopDeepgramOutput() para capturar saída
 */

/* ================================
   IMPORTS
================================ */
const { ipcRenderer } = require('electron');

/* ================================
   CONSTANTES
================================ */
const YOU = 'Você'; // Autor das transcrições de entrada
const OTHER = 'Outros'; // Autor das transcrições de saída

const DEEPGRAM_HEARTBEAT_INTERVAL = 5000; // 5 segundos (entre 3-5 segundos conforme documentação)

/* ================================
   ESTADO DO DEEPGRAM
================================ */

let deepgramInputWebSocket = null; // ⚠️ WebSocket SEPARADO para INPUT
let deepgramOutputWebSocket = null; // ⚠️ WebSocket SEPARADO para OUTPUT
let isDeepgramInputActive = false;
let isDeepgramOutputActive = false;

let deepgramInputAudioContext = null;
let deepgramInputStream = null;
let deepgramInputProcessor = null;

let deepgramOutputAudioContext = null;
let deepgramOutputStream = null;
let deepgramOutputProcessor = null;

// 🔥 Keepalive para evitar timeout 1011 do Deepgram
// Envia mensagem JSON {"type": "KeepAlive"} a cada 5 segundos
// Documentação: https://developers.deepgram.com/docs/audio-keep-alive
let deepgramInputHeartbeatInterval = null;
let deepgramOutputHeartbeatInterval = null;

// Timestamps para sincronizar com padrão de outros modelos
let deepgramInputStartAt = null;
let deepgramOutputStartAt = null;

// Objeto para mapear variáveis de input/output
const deepgramVars = {
	input: {
		ws: () => deepgramInputWebSocket,
		setWs: val => (deepgramInputWebSocket = val),
		isActive: () => isDeepgramInputActive,
		setActive: val => (isDeepgramInputActive = val),
		processor: () => deepgramInputProcessor,
		setProcessor: val => (deepgramInputProcessor = val),
		stream: () => deepgramInputStream,
		setStream: val => (deepgramInputStream = val),
		audioContext: () => deepgramInputAudioContext,
		setAudioContext: val => (deepgramInputAudioContext = val),
		lastActive: Date.now(),
		inSilence: false,
	},
	output: {
		ws: () => deepgramOutputWebSocket,
		setWs: val => (deepgramOutputWebSocket = val),
		isActive: () => isDeepgramOutputActive,
		setActive: val => (isDeepgramOutputActive = val),
		processor: () => deepgramOutputProcessor,
		setProcessor: val => (deepgramOutputProcessor = val),
		stream: () => deepgramOutputStream,
		setStream: val => (deepgramOutputStream = val),
		audioContext: () => deepgramOutputAudioContext,
		setAudioContext: val => (deepgramOutputAudioContext = val),
		lastActive: Date.now(),
		inSilence: false,
	},
};

/* ===============================
   DEEPGRAM - INICIA FLUXO (STT)
=============================== */
/**
 * Inicia captura de áudio do dispositivo de entrada e/ou saída com Deepgram
 */
async function startAudioDeepgram(UIElements) {
	debugLogRenderer('Início da função: "startAudioDeepgram"');

	try {
		// 🌊 Deepgram: Inicia INPUT/OUTPUT
		if (UIElements.inputSelect?.value) await startDeepgramInput(UIElements);
		if (UIElements.outputSelect?.value) await startDeepgramOutput(UIElements);
	} catch (error) {
		console.error('❌ Erro ao iniciar Deepgram:', error);
		throw error;
	}

	debugLogRenderer('Fim da função: "startAudioDeepgram"');
}

/**
 * Inicia captura de áudio do dispositivo de entrada com Deepgram
 */
async function startDeepgramInput(UIElements) {
	// Passo 1: Iniciar captura de áudio da saída

	if (isDeepgramInputActive) {
		console.warn('⚠️ Deepgram INPUT já ativo');
		return;
	}

	try {
		// Obtém o dispositivo INPUT selecionado no UI (busca diretamente no DOM)
		const inputDeviceId = UIElements.inputSelect?.value;

		console.log(`🔊 Iniciando captura INPUT com dispositivo: ${inputDeviceId}`);

		// Inicializa WebSocket usando função genérica
		const ws = await initDeepgramWS('input');

		// Define flags globais
		deepgramInputWebSocket = ws;
		isDeepgramInputActive = true;
		deepgramInputStartAt = Date.now();

		// Solicita acesso ao dispositivo INPUT selecionado
		console.log('🎤 Solicitando acesso à entrada de áudio (Microfone)...');

		deepgramInputStream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: inputDeviceId } },
		});

		console.log('✅ Entrada de áudio autorizada');

		// Cria AudioContext com 16kHz
		deepgramInputAudioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)({
			sampleRate: 16000,
		});

		// Carrega o AudioWorklet
		await deepgramInputAudioContext.audioWorklet.addModule('./deepgram-audio-worklet-processor.js');

		const source = deepgramInputAudioContext.createMediaStreamSource(deepgramInputStream);

		// Cria AudioWorkletNode em vez de ScriptProcessor
		deepgramInputProcessor = new AudioWorkletNode(deepgramInputAudioContext, 'deepgram-audio-worklet-processor');

		// Define threshold para input (microfone) - ajustado para capturar mais
		deepgramInputProcessor.port.postMessage({ type: 'setThreshold', threshold: 0.01 });

		// Escuta mensagens do worklet
		deepgramInputProcessor.port.onmessage = event => {
			const { type, pcm16, percent } = event.data;
			if (type === 'audioData' && deepgramInputWebSocket?.readyState === WebSocket.OPEN) {
				// Envia PCM16 via WebSocket
				deepgramInputWebSocket.send(pcm16);
			} else if (type === 'volumeUpdate') {
				// Atualiza UI com volume
				if (globalThis.RendererAPI?.emitUIChange) {
					globalThis.RendererAPI.emitUIChange('onInputVolumeUpdate', { percent });
				}

				// Trata detecção de silêncio
				handleSilenceDetection('input', percent);
			}
		};

		source.connect(deepgramInputProcessor);
		deepgramInputProcessor.connect(deepgramInputAudioContext.destination);

		console.log('▶️ Captura Deepgram INPUT iniciada');
	} catch (error) {
		console.error('❌ Erro ao iniciar Deepgram INPUT:', error);
		isDeepgramInputActive = false;
		stopDeepgram('input');
		throw error;
	}
}

/**
 * Inicia captura de áudio da saída (speaker/loopback via VoiceMeter ou Stereo Mix)
 * Usa o dispositivo selecionado no select #audio-output-device (mesma lógica do INPUT)
 */
async function startDeepgramOutput(UIElements) {
	// Passo 1: Iniciar captura de áudio da saída

	if (isDeepgramOutputActive) {
		console.warn('⚠️ Deepgram OUTPUT já ativo');
		return;
	}

	try {
		// Obtém o dispositivo OUTPUT selecionado no UI (busca diretamente no DOM)
		const outputDeviceId = UIElements.outputSelect?.value;

		console.log(`🔊 Iniciando captura OUTPUT com dispositivo: ${outputDeviceId}`);

		// Inicializa WebSocket usando função genérica
		const ws = await initDeepgramWS('output');

		// Define flags globais
		deepgramOutputWebSocket = ws;
		isDeepgramOutputActive = true;
		deepgramOutputStartAt = Date.now();

		// Solicita acesso ao dispositivo OUTPUT selecionado
		console.log('🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...');

		deepgramOutputStream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: outputDeviceId } },
		});

		console.log('✅ Saída de áudio autorizada');

		// Cria AudioContext com 16kHz
		deepgramOutputAudioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)({
			sampleRate: 16000,
		});
		// Carrega o AudioWorklet
		await deepgramOutputAudioContext.audioWorklet.addModule('./deepgram-audio-worklet-processor.js');

		// Cria MediaStreamSource a partir do stream capturado
		const source = deepgramOutputAudioContext.createMediaStreamSource(deepgramOutputStream);

		// Cria AudioWorkletNode em vez de ScriptProcessor
		deepgramOutputProcessor = new AudioWorkletNode(deepgramOutputAudioContext, 'deepgram-audio-worklet-processor');

		// Define threshold para output (VoiceMeter) - ainda mais baixo para capturar finais de fala
		deepgramOutputProcessor.port.postMessage({ type: 'setThreshold', threshold: 0.005 });

		// Escuta mensagens do worklet
		deepgramOutputProcessor.port.onmessage = event => {
			const { type, pcm16, percent } = event.data;
			if (type === 'audioData' && deepgramOutputWebSocket?.readyState === WebSocket.OPEN) {
				// Envia PCM16 via WebSocket
				deepgramOutputWebSocket.send(pcm16);
			} else if (type === 'volumeUpdate') {
				// Atualiza UI com volume
				if (globalThis.RendererAPI?.emitUIChange) {
					globalThis.RendererAPI.emitUIChange('onOutputVolumeUpdate', { percent });
				}

				// Trata detecção de silêncio
				handleSilenceDetection('output', percent, 500); // 500ms para output
			}
		};

		source.connect(deepgramOutputProcessor);
		deepgramOutputProcessor.connect(deepgramOutputAudioContext.destination);

		console.log('▶️ Captura Deepgram OUTPUT iniciada');
	} catch (error) {
		console.error('❌ Erro ao iniciar Deepgram OUTPUT:', error);
		isDeepgramOutputActive = false;
		stopDeepgram('output');
		throw error;
	}
}

/* ================================
   INICIALIZAÇÃO DO WEBSOCKET
================================ */

/**
 * Inicializa conexão WebSocket com Deepgram (genérica para input/output)
 * @param {string} source - 'input' ou 'output'
 * @returns {Promise<WebSocket>}
 */
async function initDeepgramWS(source = 'input') {
	const isInput = source === 'input';
	const existingWS = isInput ? deepgramInputWebSocket : deepgramOutputWebSocket;

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
		smart_format: 'true',
		punctuate: 'true', // Melhor pontuação
		interim_results: 'true',
		encoding: 'linear16',
		sample_rate: '16000',
		endpointing: '300', // Detecta pausas naturais
		utterance_end_ms: '1000', // Finaliza a frase após 1s de silêncio
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
			console.log('💬 Mensagem Deepgram OUTPUT recebida (tamanho:', event.data.length, 'bytes)');
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
			if (isInput) deepgramInputWebSocket = null;
			else deepgramOutputWebSocket = null;
		};
	});
}

/**
 * Inicia heartbeat para manter WebSocket Deepgram vivo
 * @param {WebSocket} ws - WebSocket aberto
 * @param {string} source - 'input' ou 'output'
 */
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

	if (source === 'input') {
		deepgramInputHeartbeatInterval = interval;
	} else {
		deepgramOutputHeartbeatInterval = interval;
	}
}

/**
 * Para heartbeat de um WebSocket
 * @param {string} source - 'input' ou 'output'
 */
function stopDeepgramHeartbeat(source) {
	if (source === 'input') {
		if (deepgramInputHeartbeatInterval) {
			clearInterval(deepgramInputHeartbeatInterval);
			deepgramInputHeartbeatInterval = null;
		}
	} else if (source === 'output') {
		if (deepgramOutputHeartbeatInterval) {
			clearInterval(deepgramOutputHeartbeatInterval);
			deepgramOutputHeartbeatInterval = null;
		}
	}
}

/* ================================
   PROCESSAMENTO DE MENSAGENS
================================ */

/**
 * Processa mensagens do Deepgram para INPUT ou OUTPUT
 * INPUT = Microfone do usuário (Você / Microfone)
 * OUTPUT = Saída de áudio do PC (Outros / VoiceMeter)
 */
function handleDeepgramMessage(data, source = 'input') {
	const transcript = data.channel?.alternatives?.[0]?.transcript || '';

	const isFinal = data.is_final || false;
	const speechFinal = data.speech_final;

	// Logs básicos
	console.log(`📥 RESPOSTA DO DEEPGRAM - (${source}) - ${new Date().toLocaleTimeString('pt-BR')}`);
	console.log(`📥 Mensagem Deepgram ${source} recebida:`, data);
	console.log(`🟡 isFinal: ${isFinal}, speechFinal: ${speechFinal}`);

	if (!transcript?.trim()) return; // Ignora transcrições vazias

	if (isFinal) {
		handleFinalDeepgramMessage(source, transcript);
	} else {
		handleInterimDeepgramMessage(source, transcript);
	}
}

/**
 * Processa mensagens interim do Deepgram (transcrições parciais)
 */
function handleInterimDeepgramMessage(source, transcript) {
	console.log(`🟡 Handle INTERIM [${source}]: "${transcript}"`);

	const isInput = source === 'input';
	const author = isInput ? YOU : OTHER;

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
			inSilence: deepgramVars[source].inSilence,
		});
	}
}

/**
 * Processa mensagens finais do Deepgram (transcrições completas)
 */
function handleFinalDeepgramMessage(source, transcript) {
	console.log(`📝 ✅ Handle FINAL [${source.toUpperCase()}]: "${transcript}"`);

	// Calcular métricas de timing
	const isInput = source === 'input';
	const author = isInput ? YOU : OTHER;
	const now = Date.now();
	const metrics = isInput
		? { startAt: deepgramInputStartAt, stopAt: now }
		: { startAt: deepgramOutputStartAt, stopAt: now };
	const { startAt, stopAt } = metrics;
	const startStr = startAt ? new Date(startAt).toLocaleTimeString() : new Date(now).toLocaleTimeString();
	const stopStr = stopAt ? new Date(stopAt).toLocaleTimeString() : new Date(now).toLocaleTimeString();
	const recordingDuration = startAt ? ((stopAt - startAt) / 1000).toFixed(2) : '0.00';
	const latency = startAt ? ((now - startAt) / 1000).toFixed(2) : '0.00';
	const total = startAt ? ((stopAt - deepgramInputStartAt) / 1000).toFixed(2) : '0.00';

	// Criar placeholder ID único
	const placeholderId = `dg-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

	// Adicionar transcrição com placeholder via evento
	const transcriptData = {
		author,
		text: '...', // Placeholder, será preenchido com onPlaceholderFulfill
		timeStr: startAt ? new Date(startAt).toLocaleTimeString() : new Date(now).toLocaleTimeString(),
		elementId: 'conversation',
		placeholderId: placeholderId,
	};

	if (globalThis.RendererAPI?.emitUIChange) {
		globalThis.RendererAPI.emitUIChange('onTranscriptAdd', transcriptData);
	}

	// Preencher placeholder com métricas
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

	// Para OUTPUT, atualizar CURRENT com final
	if (!isInput && globalThis.RendererAPI?.handleCurrentQuestion) {
		globalThis.RendererAPI.handleCurrentQuestion(author, transcript, {
			isInterim: false,
			inSilence: deepgramVars[source].inSilence,
		});
	}
}

// Trata detecção de silêncio com base no volume percentual
function handleSilenceDetection(source, percent, silenceTimeout = 1000) {
	// NOSONAR console.log(`🔊 ${source} volume: ${percent.toFixed(2)}%`);

	const vars = deepgramVars[source];
	let { lastActive, inSilence } = vars;

	if (percent > 0) {
		vars.lastActive = Date.now();
		if (inSilence) {
			// NOSONAR console.log('🔊 Som voltou: ', percent.toFixed(2), '%');
			vars.inSilence = false;
		}
	} else {
		const elapsed = Date.now() - lastActive;
		if (elapsed >= silenceTimeout && !inSilence) {
			// NOSONAR
			console.log('***** 🔇 Silêncio detectado! *****');
			vars.inSilence = true;

			// enviar comando Finalize para Deepgram
			sendDeepgramFinalize(source);
		}
	}
}

/**
 * Envia comando "Finalize" para Deepgram para forçar processamento imediato do buffer de áudio pendente
 */
function sendDeepgramFinalize(source) {
	const ws = source === 'input' ? deepgramInputWebSocket : deepgramOutputWebSocket;

	if (ws && ws.readyState === WebSocket.OPEN) {
		try {
			ws.send(JSON.stringify({ type: 'Finalize' }));
		} catch (e) {
			console.error(`❌ Erro ao enviar Finalize ${source}:`, e);
		}
	}
}

/* ================================
	DEEPGRAM - PARA FLUXO (STT)
================================ */

// Wrapper para parar Deepgram INPUT e OUTPUT
function stopAudioDeepgram() {
	debugLogRenderer('Início da função: "stopAudioDeepgram"');

	try {
		// 🌊 Deepgram: Para INPUT e OUTPUT
		stopAllDeepgram(); // Fecha WebSocket
		console.log('✅ Deepgram parado');
	} catch (error) {
		console.error('❌ Erro ao parar Deepgram:', error);
	}

	debugLogRenderer('Fim da função: "stopAudioDeepgram"');
}

/**
 * Para ambos Deepgram INPUT e OUTPUT
 */
function stopAllDeepgram() {
	stopDeepgram('input');
	stopDeepgram('output');
	console.log('🌊 Deepgram completamente parado');
}

/**
 * Para captura Deepgram de um source específico (input/output)
 */
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

	const audioContext = vars.audioContext();
	if (audioContext) {
		audioContext.close();
		vars.setAudioContext(null);
	}

	console.log(`🛑 Captura Deepgram ${source.toUpperCase()} parada`);
}

/* ================================
   EXPORTS (CommonJS)
================================ */

// Exporta funções principais para uso externo
module.exports = {
	startAudioDeepgram,
	stopAudioDeepgram,
};
