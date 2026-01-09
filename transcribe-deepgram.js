/**
 * 🌊 DEEPGRAM LIVE STREAMING - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição com Deepgram Live Streaming.
 * - Captura áudio diretamente via WebSocket (sem IPC para dados binários)
 * - Consolida interim results em transcrições finais
 * - Converge para handleSpeech() como outros providers (Whisper, Vosk)
 *
 * Uso:
 * - startDeepgramInput() / stopDeepgramInput() para capturar microfone
 * - startDeepgramOutput() / stopDeepgramOutput() para capturar saída
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

// 🔍 Rastreamento de último interim enviado para evitar duplicação
let deepgramLastInputInterimShown = null; // Último interim que foi adicionado ao DOM
let deepgramLastOutputInterimShown = null; // Último interim OUTPUT adicionado

// Placeholder IDs (usados com onPlaceholderUpdate / onPlaceholderFulfill)
let deepgramLastInputPlaceholderId = null;
let deepgramLastOutputPlaceholderId = null;

// Mapeamento placeholderId -> utterance start timestamp (ms since epoch)
const deepgramPlaceholderStartById = {};

// estado adicional para evitar duplicações
let deepgramLastInputInterimShownNorm = null;
let deepgramLastOutputInterimShownNorm = null;
let deepgramLastInputAddedAt = 0;
let deepgramLastOutputAddedAt = 0;

// Timestamps para sincronizar com padrão de outros modelos
let deepgramInputStartAt = null;
let deepgramInputStopAt = null;
let deepgramOutputStartAt = null;
let deepgramOutputStopAt = null;

// 🛑 Detecção de silêncio prolongado para parar envio
let deepgramLastSoundTime = null;
const DEEPGRAM_SILENCE_TIMEOUT = 3000; // 3 segundos de silêncio = para

// 🔥 Keepalive para evitar timeout 1011 do Deepgram
// Envia mensagem JSON {"type": "KeepAlive"} a cada 5 segundos
// Documentação: https://developers.deepgram.com/docs/audio-keep-alive
let deepgramInputHeartbeatInterval = null;
let deepgramOutputHeartbeatInterval = null;
const DEEPGRAM_HEARTBEAT_INTERVAL = 5000; // 5 segundos (entre 3-5 segundos conforme recomendação)

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

/* ================================
   CAPTURA DE ÁUDIO
================================ */

/**
 * Inicia captura de áudio do dispositivo de entrada com Deepgram
 */
async function startDeepgramInput() {
	// Passo 1: Iniciar captura de áudio da saída

	if (isDeepgramInputActive) {
		console.warn('⚠️ Deepgram INPUT já ativo');
		return;
	}

	try {
		// Obtém o dispositivo INPUT selecionado no UI (busca diretamente no DOM)
		const inputSelectElement = document.getElementById('audio-input-device');
		const inputDeviceId = inputSelectElement?.value;

		console.log(`🔊 Iniciando captura INPUT com dispositivo: ${inputDeviceId}`);

		// Inicializa WebSocket usando função genérica
		const ws = await initDeepgramWS('input');
		deepgramInputWebSocket = ws;
		isDeepgramInputActive = true;
		deepgramInputStartAt = Date.now();
		deepgramInputStopAt = null;

		// Pede permissão do microfone
		console.log('🎤 Solicitando acesso ao microfone...');

		deepgramInputStream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: inputDeviceId } },
		});

		console.log('✅ Microfone autorizado');

		// Cria AudioContext com 16kHz
		deepgramInputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
			sampleRate: 16000,
		});

		const source = deepgramInputAudioContext.createMediaStreamSource(deepgramInputStream);
		// ScriptProcessor 4096 a 16kHz gera chunks de ~256ms (ideal para STT)
		deepgramInputProcessor = deepgramInputAudioContext.createScriptProcessor(4096, 1, 1);

		deepgramOutputProcessor.onaudioprocess = e => {
			if (deepgramInputWebSocket?.readyState !== WebSocket.OPEN) return;

			const inputData = e.inputBuffer.getChannelData(0);
			const pcm16 = new Int16Array(inputData.length);

			for (let i = 0; i < inputData.length; i++) {
				const s = Math.max(-1, Math.min(1, inputData[i]));
				pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
			}

			// Envio imediato do buffer PCM processado
			deepgramInputWebSocket.send(pcm16.buffer);
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
 * Para captura de áudio do dispositivo de entrada
 */
function stopDeepgramInput() {
	isDeepgramInputActive = false;

	// Envia "CloseStream" antes de fechar WebSocket
	if (deepgramInputWebSocket && deepgramInputWebSocket.readyState === WebSocket.OPEN) {
		try {
			deepgramInputWebSocket.send(JSON.stringify({ type: 'CloseStream' }));
			console.log('📤 CloseStream enviado para INPUT');
		} catch (e) {
			console.error('❌ Erro ao enviar CloseStream INPUT:', e);
		}
	}

	// Para heartbeat
	stopDeepgramHeartbeat('input');

	// Fecha WebSocket
	if (deepgramInputWebSocket) {
		try {
			deepgramInputWebSocket.close();
		} catch (e) {
			console.error('Erro ao fechar WebSocket INPUT:', e);
		}
		deepgramInputWebSocket = null;
	}

	// Limpa recursos
	if (deepgramInputProcessor) {
		deepgramInputProcessor.disconnect();
		deepgramInputProcessor = null;
	}

	if (deepgramInputStream) {
		deepgramInputStream.getTracks().forEach(t => t.stop());
		deepgramInputStream = null;
	}

	if (deepgramInputAudioContext) {
		deepgramInputAudioContext.close();
		deepgramInputAudioContext = null;
	}

	console.log('🛑 Captura Deepgram INPUT parada');
}

/* ================================
   CAPTURA DE ÁUDIO - OUTPUT
================================ */

/**
 * Inicia captura de áudio da saída (speaker/loopback via VoiceMeter ou Stereo Mix)
 * Usa o dispositivo selecionado no select #audio-output-device (mesma lógica do INPUT)
 */
async function startDeepgramOutput() {
	// Passo 1: Iniciar captura de áudio da saída

	if (isDeepgramOutputActive) {
		console.warn('⚠️ Deepgram OUTPUT já ativo');
		return;
	}

	try {
		// Obtém o dispositivo OUTPUT selecionado no UI (busca diretamente no DOM)
		const outputSelectElement = document.getElementById('audio-output-device');
		const outputDeviceId = outputSelectElement?.value;

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

		const source = deepgramOutputAudioContext.createMediaStreamSource(deepgramOutputStream);
		// ScriptProcessor 4096 a 16kHz gera chunks de ~256ms (ideal para STT)
		deepgramOutputProcessor = deepgramOutputAudioContext.createScriptProcessor(4096, 1, 1);

		deepgramOutputProcessor.onaudioprocess = e => {
			if (deepgramOutputWebSocket?.readyState !== WebSocket.OPEN) return;

			const inputData = e.inputBuffer.getChannelData(0);
			const pcm16 = new Int16Array(inputData.length);

			for (let i = 0; i < inputData.length; i++) {
				const s = Math.max(-1, Math.min(1, inputData[i]));
				pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
			}

			// Envio imediato do buffer PCM processado
			deepgramOutputWebSocket.send(pcm16.buffer);
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

/**
 * Para captura de áudio da saída
 */
function stopDeepgramOutput() {
	isDeepgramOutputActive = false;

	// Envia "CloseStream" antes de fechar WebSocket
	if (deepgramOutputWebSocket && deepgramOutputWebSocket.readyState === WebSocket.OPEN) {
		try {
			deepgramOutputWebSocket.send(JSON.stringify({ type: 'CloseStream' }));
			console.log('📤 CloseStream enviado para OUTPUT');
		} catch (e) {
			console.error('❌ Erro ao enviar CloseStream OUTPUT:', e);
		}
	}

	// Para heartbeat
	stopDeepgramHeartbeat('output');

	// Fecha WebSocket
	if (deepgramOutputWebSocket) {
		try {
			deepgramOutputWebSocket.close();
		} catch (e) {
			console.error('Erro ao fechar WebSocket OUTPUT:', e);
		}
		deepgramOutputWebSocket = null;
	}

	// Limpa recursos
	if (deepgramOutputProcessor) {
		deepgramOutputProcessor.disconnect();
		deepgramOutputProcessor = null;
	}

	if (deepgramOutputStream) {
		deepgramOutputStream.getTracks().forEach(t => t.stop());
		deepgramOutputStream = null;
	}

	if (deepgramOutputAudioContext) {
		deepgramOutputAudioContext.close();
		deepgramOutputAudioContext = null;
	}

	console.log('🛑 Captura Deepgram OUTPUT parada');
}

/* ================================
   CLEANUP
================================ */

/**
 * Para tudo relacionado a Deepgram
 */
function stopAllDeepgram() {
	stopDeepgramInput();
	stopDeepgramOutput();

	// Recursos já são limpos em stopDeepgramInput/Output
	console.log('🌊 Deepgram completamente parado');
}

/* ================================
   PROCESSAMENTO DE MENSAGENS
================================ */

/**
 * 🔍 Detecta o DELTA (texto novo) entre um interim anterior e o novo
 * Usa word-by-word comparison para encontrar exatamente onde começou a mudança
 *
 * @param {string} previousText - Texto interim anterior armazenado
 * @param {string} newText - Novo texto interim completo
 * @returns {string} - Apenas a parte NOVA (delta)
 */
function extractDelta(previousText, newText) {
	if (!previousText || previousText.length === 0) return newText;
	if (newText === previousText) return '';

	const prevWords = previousText.trim().split(/\s+/);
	const newWords = newText.trim().split(/\s+/);
	const prevNormWords = prevWords.map(w => normalizeForCompare(w));
	const newNormWords = newWords.map(w => normalizeForCompare(w));

	// Helper: encontra subarray needle dentro de haystack (retorna índice ou -1)
	function indexOfSubarray(haystack, needle) {
		if (needle.length === 0) return 0;
		for (let i = 0; i <= haystack.length - needle.length; i++) {
			let ok = true;
			for (let j = 0; j < needle.length; j++) {
				if (haystack[i + j] !== needle[j]) {
					ok = false;
					break;
				}
			}
			if (ok) return i;
		}
		return -1;
	}

	// 1) Se previous aparece como sequência contínua em new, retorna só o que vem depois
	const foundIndex = indexOfSubarray(newNormWords, prevNormWords);
	if (foundIndex !== -1) {
		const delta = newWords.slice(foundIndex + prevWords.length).join(' ');
		if (delta) console.log(`   [extractDelta DEBUG] previous found in new at ${foundIndex}, delta="${delta}"`);
		return delta || '';
	}

	// 2) Fallback: encontrar primeira divergência word-by-word (prefix-match)
	let divergenceIndex = 0;
	for (let i = 0; i < Math.min(prevWords.length, newWords.length); i++) {
		const p = prevNormWords[i];
		const n = newNormWords[i];
		if (p === n) {
			divergenceIndex = i + 1;
		} else {
			console.log(`   [extractDelta DEBUG] Divergência em i=${i}: "${p}" vs "${n}"`);
			break;
		}
	}

	if (divergenceIndex >= prevWords.length) {
		const delta = newWords.slice(divergenceIndex).join(' ');
		if (delta) console.log(`   [extractDelta DEBUG] Extensão: delta="${delta}"`);
		return delta || '';
	}

	const delta = newWords.slice(divergenceIndex).join(' ');
	console.log(`   [extractDelta DEBUG] Mudança detectada em i=${divergenceIndex}: delta="${delta}"`);
	return delta || '';
}

// Normaliza texto para comparação (remove pontuação/acentos leves, caixa e espaços)
function normalizeForCompare(s) {
	if (!s) return '';
	return s
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // remove diacríticos
		.toLowerCase()
		.replace(/[^\w\s]/g, '') // remove pontuação
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Processa mensagens do Deepgram para INPUT ou OUTPUT
 * INPUT = Microfone do usuário (Você / Microfone)
 * OUTPUT = Saída de áudio do PC (Outros / VoiceMeter)
 */
function handleDeepgramMessage(data, source = 'input') {
	// Passo 3: Processa mensagem Deepgram

	const transcript = data.channel?.alternatives?.[0]?.transcript || '';
	const confidence = data.channel?.alternatives?.[0]?.confidence || 0;
	const isFinal = data.is_final || false;
	const speechFinal = data.speech_final; // Importante para detectar fim de frase

	if (!transcript || !transcript.trim()) return; // Ignora transcrições vazias

	if (isFinal) {
		console.log(`Palavras finalizadas (${source}):`, transcript);
		if (speechFinal) {
			console.log('Fim da sentença detectado pelo Deepgram.');
		}
	}

	const isInput = source === 'input';
	const author = isInput ? YOU : OTHER;

	// ================================
	// 🔍 DETECÇÃO DE DELTA (INCREMENTO)
	// ================================
	const lastShown = isInput ? deepgramLastInputInterimShown : deepgramLastOutputInterimShown;
	const delta = extractDelta(lastShown, transcript);
	const isFirstInterim = !lastShown;

	console.log(
		`[handleDeepgramMessage] source="${source}" | lastShown="${lastShown}" | transcript="${transcript}" | delta="${delta}" | isFinal=${isFinal}`,
	);

	const now = Date.now();

	// Normaliza delta para filtros
	const normDelta = delta ? normalizeForCompare(delta) : '';
	const lastNorm = isInput ? deepgramLastInputInterimShownNorm : deepgramLastOutputInterimShownNorm;
	const lastAddedAt = isInput ? deepgramLastInputAddedAt : deepgramLastOutputAddedAt;

	if (isFinal) {
		console.log(`📝 ✅ FINAL [${source.toUpperCase()}]: "${transcript}" (${(confidence * 100).toFixed(1)}%)`);

		const normTranscript = normalizeForCompare(transcript);
		let hadPlaceholder = false;
		if (isInput) {
			hadPlaceholder = !!deepgramLastInputPlaceholderId;
			const pid = deepgramLastInputPlaceholderId;
			if (pid) fulfillPlaceholder(pid, author, transcript, true, data);
			deepgramLastInputPlaceholderId = null;
			deepgramLastInputInterimShown = null;
			deepgramLastInputInterimShownNorm = normTranscript;
			deepgramLastInputAddedAt = now;
		} else {
			hadPlaceholder = !!deepgramLastOutputPlaceholderId;
			const pid = deepgramLastOutputPlaceholderId;
			if (pid) fulfillPlaceholder(pid, author, transcript, false, data);
			deepgramLastOutputPlaceholderId = null;
			deepgramLastOutputInterimShown = null;
			deepgramLastOutputInterimShownNorm = normTranscript;
			deepgramLastOutputAddedAt = now;
		}

		if (hadPlaceholder) {
			console.log('   Placeholder já cumprido, enviando final sem adicionar ao UI novamente');
			handleSpeech(author, transcript, { skipAddToUI: true });
		} else {
			handleSpeech(author, transcript);
		}

		// 🔥 [NOVO] Emitir evento para sistema unificado STT (apenas para OUTPUT, pois é INPUT que espera resposta)
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
	} else if (isFirstInterim) {
		const normTranscript = normalizeForCompare(transcript);
		if (!normTranscript || normTranscript.length < 2) {
			console.log(`⏭️ PRIMEIRA interim trivial/curta, ignorando: "${transcript}"`);
			return;
		}

		console.log(`🟢 PRIMEIRA interim [${source}]: "${transcript}"`);
		const timeForTranscript = isInput ? deepgramInputStartAt : deepgramOutputStartAt || Date.now();

		const placeholderId = `dg-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
		addTranscript(author, '...', timeForTranscript, placeholderId);

		if (isInput) deepgramLastInputPlaceholderId = placeholderId;
		else deepgramLastOutputPlaceholderId = placeholderId;

		let placeholderStartAt = timeForTranscript;
		const words = data.channel?.alternatives?.[0]?.words;
		const sessionStart = isInput ? deepgramInputStartAt : deepgramOutputStartAt;
		if (words && words.length > 0) {
			const firstWordStart = words[0].start;
			if (typeof firstWordStart === 'number' && sessionStart) {
				placeholderStartAt = sessionStart + Math.round(firstWordStart * 1000);
			}
		}
		deepgramPlaceholderStartById[placeholderId] = placeholderStartAt;

		if (globalThis.RendererAPI?.emitUIChange) {
			updatePlaceholder(placeholderId, author, transcript, isInput, data, placeholderStartAt);
		}

		if (isInput) {
			deepgramLastInputInterimShown = transcript;
			deepgramLastInputInterimShownNorm = normTranscript;
			deepgramLastInputAddedAt = now;
		} else {
			deepgramLastOutputInterimShown = transcript;
			deepgramLastOutputInterimShownNorm = normTranscript;
			deepgramLastOutputAddedAt = now;
		}
	} else if (delta && delta.length > 0) {
		if (!normDelta || normDelta.length < 2) {
			console.log(`⏭️ Delta trivial/curto, ignorando: "${delta}"`);
			return;
		}

		if (lastNorm && normDelta === lastNorm && now - lastAddedAt < 5000) {
			console.log(`⏭️ Delta duplicado recentemente, ignorando: "${delta}"`);
			return;
		}

		console.log(`🟡 Atualizando interim [${source}]: delta = "${delta}"`);

		const pid = isInput ? deepgramLastInputPlaceholderId : deepgramLastOutputPlaceholderId;
		const pStart = pid
			? deepgramPlaceholderStartById[pid]
			: (isInput ? deepgramInputStartAt : deepgramOutputStartAt) || Date.now();

		if (globalThis.RendererAPI?.emitUIChange) {
			updatePlaceholder(pid, author, transcript, isInput, data, pStart);
		}

		if (isInput) {
			deepgramLastInputInterimShown = transcript;
			deepgramLastInputInterimShownNorm = normDelta;
			deepgramLastInputAddedAt = now;
		} else {
			deepgramLastOutputInterimShown = transcript;
			deepgramLastOutputInterimShownNorm = normDelta;
			deepgramLastOutputAddedAt = now;

			// 🔥 NOVO: Chamar handleSpeech para INTERIM também (não só FINAL)
			// Isso permite que CURRENT seja atualizado em tempo real
			if (typeof globalThis.handleSpeechInterim === 'function') {
				console.log(`🔄 [INTERIM] Atualizando CURRENT em tempo real com: "${transcript}"`);
				globalThis.handleSpeechInterim(author, transcript, { isInterim: true, skipAddToUI: true });
			}
		}
	} else {
		console.log(`⏭️ Sem delta em [${source}], ignorando`);
	}
}

/* ================================
   PLACEHOLDER HELPERS
================================ */

function sessionStartFor(isInputLocal) {
	return isInputLocal ? deepgramInputStartAt : deepgramOutputStartAt;
}

function computeTimes(pid, words, nowLocal, isInputLocal) {
	const sessionStart = sessionStartFor(isInputLocal);
	const startAt = pid ? deepgramPlaceholderStartById[pid] || sessionStart || Date.now() : sessionStart || Date.now();
	let stopAt = nowLocal;
	if (words && words.length > 0 && typeof words[words.length - 1].end === 'number' && sessionStart) {
		stopAt = sessionStart + Math.round(words[words.length - 1].end * 1000);
	}
	const recordingDuration = Math.max(0, stopAt - startAt);
	const latency = Math.max(0, nowLocal - stopAt);
	const total = Math.max(0, nowLocal - startAt);
	return { startAt, stopAt, recordingDuration, latency, total };
}

function fulfillPlaceholder(pid, authorLocal, transcriptLocal, isInputLocal, dataLocal) {
	if (!pid || !globalThis.RendererAPI?.emitUIChange) return;
	const words = dataLocal.channel?.alternatives?.[0]?.words;
	const nowLocal = Date.now();
	const m = computeTimes(pid, words, nowLocal, isInputLocal);
	globalThis.RendererAPI.emitUIChange('onPlaceholderFulfill', {
		speaker: authorLocal,
		text: transcriptLocal,
		placeholderId: pid,
		startStr: new Date(m.startAt).toLocaleTimeString(),
		stopStr: new Date(m.stopAt).toLocaleTimeString(),
		recordingDuration: m.recordingDuration,
		latency: m.latency,
		total: m.total,
	});
	delete deepgramPlaceholderStartById[pid];
}

function updatePlaceholder(pid, authorLocal, transcriptLocal, isInputLocal, dataLocal, startOverride) {
	if (!globalThis.RendererAPI?.emitUIChange) return;
	const nowLocal = Date.now();
	const sessionStart = sessionStartFor(isInputLocal);
	const words = dataLocal.channel?.alternatives?.[0]?.words;
	let stopAt = nowLocal;
	if (words && words.length > 0 && typeof words[words.length - 1].end === 'number' && sessionStart) {
		stopAt = sessionStart + Math.round(words[words.length - 1].end * 1000);
	}
	const startAt =
		typeof startOverride !== 'undefined'
			? startOverride
			: pid
			? deepgramPlaceholderStartById[pid] || sessionStart || Date.now()
			: sessionStart || Date.now();
	const recordingDuration = Math.max(0, stopAt - startAt);
	const latency = Math.max(0, nowLocal - stopAt);
	const total = Math.max(0, nowLocal - startAt);
	globalThis.RendererAPI.emitUIChange('onPlaceholderUpdate', {
		speaker: authorLocal,
		text: transcriptLocal,
		timeStr: new Date(stopAt).toLocaleTimeString(),
		startStr: new Date(startAt).toLocaleTimeString(),
		stopStr: new Date(stopAt).toLocaleTimeString(),
		recordingDuration,
		latency,
		total,
		placeholderId: pid,
	});
}

/* ================================
   EXPORTS (CommonJS)
================================ */
// Expõe funções globalmente para uso em renderer.js
// Nota: Em Electron com nodeIntegration: true, as funções
// definidas aqui ficarão acessíveis no escopo global
// Alternativa: module.exports para acesso via require()
module.exports = {
	startDeepgramInput,
	stopDeepgramInput,
	startDeepgramOutput,
	stopDeepgramOutput,
	stopAllDeepgram,
};
