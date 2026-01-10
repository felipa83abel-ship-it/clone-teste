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

/* ================================
   ESTADO DO DEEPGRAM
================================ */

let deepgramInputWebSocket = null;
let deepgramOutputWebSocket = null; // ⚠️ WebSocket SEPARADO para OUTPUT
let isDeepgramInputActive = false;
let isDeepgramOutputActive = false;

let deepgramInputAudioContext = null;
let deepgramInputStream = null;
let deepgramInputProcessor = null;

let deepgramOutputAudioContext = null;
let deepgramOutputStream = null;
let deepgramOutputProcessor = null;

// Estado simplificado para interims atuais
let deepgramCurrentInterimInput = null; // Texto atual do interim input
let deepgramCurrentInterimOutput = null; // Texto atual do interim output

// Timestamps para sincronizar com padrão de outros modelos
let deepgramInputStartAt = null;
let deepgramInputStopAt = null;
let deepgramOutputStartAt = null;
let deepgramOutputStopAt = null;

// 🔥 Keepalive para evitar timeout 1011 do Deepgram
// Envia mensagem JSON {"type": "KeepAlive"} a cada 5 segundos
// Documentação: https://developers.deepgram.com/docs/audio-keep-alive
let deepgramInputHeartbeatInterval = null;
let deepgramOutputHeartbeatInterval = null;
const DEEPGRAM_HEARTBEAT_INTERVAL = 5000; // 5 segundos (entre 3-5 segundos conforme documentação)

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
		model: 'nova-2',
		language: 'pt-BR',
		smart_format: 'true',
		interim_results: 'true',
		encoding: 'linear16',
		sample_rate: '16000',
		endpointing: '300', // Detecta pausas naturais
		utterance_end_ms: '1000', // Finaliza a frase após 1s de silêncio
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

/* ===============================
   DEEPGRAM - INICIA FLUXO (STT)
=============================== */

// 🔥 DEEPGRAM: Inicia captura (wrapper)
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
		deepgramInputWebSocket = ws;
		isDeepgramInputActive = true;
		deepgramInputStartAt = Date.now();
		deepgramInputStopAt = null;
		deepgramCurrentInterimInput = null; // Inicializar interim

		// Solicita acesso ao dispositivo INPUT selecionado
		console.log('🎤 Solicitando acesso à entrada de áudio (Microfone)...');

		deepgramInputStream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: inputDeviceId } },
		});

		console.log('✅ Entrada de áudio autorizada');

		// Cria AudioContext com 16kHz
		deepgramInputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
			sampleRate: 16000,
		});

		// Carrega o AudioWorklet
		await deepgramInputAudioContext.audioWorklet.addModule('./deepgram-audio-worklet-processor.js');

		const source = deepgramInputAudioContext.createMediaStreamSource(deepgramInputStream);

		// Cria AudioWorkletNode em vez de ScriptProcessor
		deepgramInputProcessor = new AudioWorkletNode(deepgramInputAudioContext, 'deepgram-audio-worklet-processor');

		// Define threshold mais alto para input (microfone) para filtrar ruído
		deepgramInputProcessor.port.postMessage({ type: 'setThreshold', threshold: 0.01 });

		// Escuta mensagens do worklet
		deepgramInputProcessor.port.onmessage = event => {
			const { type, pcm16, percent } = event.data;
			if (type === 'audioData' && deepgramInputWebSocket?.readyState === WebSocket.OPEN) {
				// Envia PCM16 via WebSocket
				deepgramInputWebSocket.send(pcm16);
			} else if (type === 'volumeUpdate') {
				// Atualiza UI com volume
				emitUIChange('onInputVolumeUpdate', { percent });
			}
		};

		source.connect(deepgramInputProcessor);
		deepgramInputProcessor.connect(deepgramInputAudioContext.destination);

		console.log('▶️ Captura Deepgram INPUT iniciada');
	} catch (error) {
		console.error('❌ Erro ao iniciar Deepgram INPUT:', error);
		isDeepgramInputActive = false;
		stopDeepgramInput();
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

		if (!outputDeviceId) {
			console.warn('⚠️ Nenhum dispositivo OUTPUT selecionado. Pulando captura OUTPUT.');
			return;
		}

		console.log(`🔊 Iniciando captura OUTPUT com dispositivo: ${outputDeviceId}`);

		// Inicializa WebSocket usando função genérica
		const ws = await initDeepgramWS('output');
		deepgramOutputWebSocket = ws;
		isDeepgramOutputActive = true;
		deepgramOutputStartAt = Date.now();
		deepgramOutputStopAt = null;
		deepgramCurrentInterimOutput = null; // Inicializar interim

		// Solicita acesso ao dispositivo OUTPUT selecionado
		console.log('🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...');

		deepgramOutputStream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: outputDeviceId } },
		});

		console.log('✅ Saída de áudio autorizada');

		// Cria AudioContext com 16kHz
		deepgramOutputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
			sampleRate: 16000,
		});

		// Carrega o AudioWorklet
		await deepgramOutputAudioContext.audioWorklet.addModule('./deepgram-audio-worklet-processor.js');

		const source = deepgramOutputAudioContext.createMediaStreamSource(deepgramOutputStream);

		// Cria AudioWorkletNode em vez de ScriptProcessor
		deepgramOutputProcessor = new AudioWorkletNode(deepgramOutputAudioContext, 'deepgram-audio-worklet-processor');

		// Define threshold para output (VoiceMeter) - mais baixo, pois é mais limpo
		deepgramOutputProcessor.port.postMessage({ type: 'setThreshold', threshold: 0.005 });

		// Escuta mensagens do worklet
		deepgramOutputProcessor.port.onmessage = event => {
			const { type, pcm16, percent } = event.data;
			if (type === 'audioData' && deepgramOutputWebSocket?.readyState === WebSocket.OPEN) {
				//console.log(`🟡 Enviando áudio OUTPUT para o Deepgram - ${new Date().toLocaleTimeString("pt-BR")}`);

				// Envia PCM16 via WebSocket
				deepgramOutputWebSocket.send(pcm16);
			} else if (type === 'volumeUpdate') {
				// Atualiza UI com volume
				emitUIChange('onOutputVolumeUpdate', { percent });
			}
		};

		source.connect(deepgramOutputProcessor);
		deepgramOutputProcessor.connect(deepgramOutputAudioContext.destination);

		console.log('▶️ Captura Deepgram OUTPUT iniciada');
	} catch (error) {
		console.error('❌ Erro ao iniciar Deepgram OUTPUT:', error);
		isDeepgramOutputActive = false;
		stopDeepgramOutput();
		throw error;
	}
}

/* ================================
	DEEPGRAM - PARA FLUXO (STT)
================================ */

// 🔥 DEEPGRAM: Para captura (wrapper) - Agora síncrona, sem async desnecessário
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

// Função genérica para parar input ou output (elimina duplicação)
function stopDeepgram(source) {
	const isInput = source === 'input';
	const ws = isInput ? deepgramInputWebSocket : deepgramOutputWebSocket;
	const isActive = isInput ? isDeepgramInputActive : isDeepgramOutputActive;

	// Verificação de estado: se já parado, sai cedo
	if (!isActive) {
		console.log(`⚠️ Deepgram ${source} já parado, pulando.`);
		return;
	}

	// Define flag como false
	if (isInput) isDeepgramInputActive = false;
	else isDeepgramOutputActive = false;

	// Envia "CloseStream" se WebSocket estiver aberto
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
		if (isInput) deepgramInputWebSocket = null;
		else deepgramOutputWebSocket = null;
	}

	// Limpar interims
	if (isInput) deepgramCurrentInterimInput = null;
	else deepgramCurrentInterimOutput = null;

	// Limpa recursos (usando variáveis dinâmicas)
	const processor = isInput ? deepgramInputProcessor : deepgramOutputProcessor;
	const stream = isInput ? deepgramInputStream : deepgramOutputStream;
	const audioContext = isInput ? deepgramInputAudioContext : deepgramOutputAudioContext;

	if (processor) {
		processor.disconnect();
		if (isInput) deepgramInputProcessor = null;
		else deepgramOutputProcessor = null;
	}

	if (stream) {
		stream.getTracks().forEach(t => t.stop());
		if (isInput) deepgramInputStream = null;
		else deepgramOutputStream = null;
	}

	if (audioContext) {
		audioContext.close();
		if (isInput) deepgramInputAudioContext = null;
		else deepgramOutputAudioContext = null;
	}

	console.log(`🛑 Captura Deepgram ${source.toUpperCase()} parada`);
}

// Atualiza stopAllDeepgram para usar a função genérica
function stopAllDeepgram() {
	stopDeepgram('input');
	stopDeepgram('output');
	console.log('🌊 Deepgram completamente parado');
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
	const confidence = data.channel?.alternatives?.[0]?.confidence || 0;
	const isFinal = data.is_final || false;
	const speechFinal = data.speech_final;

	if (!transcript || !transcript.trim()) return; // Ignora transcrições vazias

	// Logs básicos
	console.log(`📥 RESPOSTA DO DEEPGRAM - (${source}) - ${new Date().toLocaleTimeString('pt-BR')}`);
	console.log(`🟡 isFinal: ${isFinal}, speechFinal: ${speechFinal}, transcript: "${transcript}"`);

	const isInput = source === 'input';
	const author = isInput ? YOU : OTHER;

	if (isFinal) {
		console.log(`📝 ✅ FINAL [${source.toUpperCase()}]: "${transcript}" (${(confidence * 100).toFixed(1)}%)`);

		// Chamar handleSpeech para criar nova transcrição no histórico
		handleSpeech(author, transcript);

		// Resetar interim atual
		if (isInput) {
			deepgramCurrentInterimInput = null;
		} else {
			deepgramCurrentInterimOutput = null;
		}

		// Limpar elemento interim no UI
		const interimId = isInput ? 'deepgram-interim-input' : 'deepgram-interim-output';
		if (globalThis.RendererAPI?.emitUIChange) {
			globalThis.RendererAPI.emitUIChange('onClearInterim', { id: interimId });
		}

		// Emite evento global onTranscriptionComplete para OUTPUT
		if (source === 'output' && globalThis.emitSTTEvent) {
			console.log('🌊 Deepgram OUTPUT: Emitindo evento onTranscriptionComplete');
			globalThis.emitSTTEvent('transcriptionComplete', {
				text: transcript,
				speaker: author,
				isFinal: true,
				model: 'deepgram',
				confidence: confidence,
			});
		}
	} else {
		// Interim: Atualizar o texto do elemento "current interim"
		console.log(`🟡 INTERIM [${source}]: "${transcript}"`);

		const interimId = isInput ? 'deepgram-interim-input' : 'deepgram-interim-output';

		if (globalThis.RendererAPI?.emitUIChange) {
			globalThis.RendererAPI.emitUIChange('onUpdateInterim', {
				id: interimId,
				speaker: author,
				text: transcript,
			});
		}

		// Atualizar estado
		if (isInput) {
			deepgramCurrentInterimInput = transcript;
		} else {
			deepgramCurrentInterimOutput = transcript;

			// Para output, atualizar CURRENT em tempo real
			if (typeof globalThis.handleSpeechInterim === 'function') {
				console.log(`🔄 [INTERIM] Atualizando CURRENT em tempo real com: "${transcript}"`);
				globalThis.handleSpeechInterim(author, transcript, { isInterim: true, skipAddToUI: true });
			}
		}
	}
}

/* ================================
   EXPORTS (CommonJS)
================================ */
// Expõe funções globalmente para uso em renderer.js
// Nota: Em Electron com nodeIntegration: true, as funções
// definidas aqui ficarão acessíveis no escopo global
// Alternativa: module.exports para acesso via require()
module.exports = {
	startAudioDeepgram,
	stopAudioDeepgram,
};
