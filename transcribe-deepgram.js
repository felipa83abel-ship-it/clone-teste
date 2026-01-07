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

/* ================================
   ESTADO DO DEEPGRAM
================================ */

let deepgramWebSocket = null;
let deepgramOutputWebSocket = null; // ⚠️ WebSocket SEPARADO para OUTPUT
let isDeepgramInputActive = false;
let isDeepgramOutputActive = false;

let deepgramInputAudioContext = null;
let deepgramInputStream = null;
let deepgramInputProcessor = null;

let deepgramOutputAudioContext = null;
let deepgramOutputStream = null;
let deepgramOutputProcessor = null;

// Buffer de consolidação
let deepgramInputInterimBuffer = '';
let deepgramOutputInterimBuffer = '';

// 🔍 Rastreamento de último interim enviado para evitar duplicação
let deepgramLastInputInterimShown = null; // Último interim que foi adicionado ao DOM
let deepgramLastOutputInterimShown = null; // Último interim OUTPUT adicionado

// Rastreamento de volume para heurística de "final"
let deepgramLastInputVolume = 0;
let deepgramLastOutputVolume = 0;

// Timestamps para sincronizar com padrão de outros modelos
let deepgramInputStartAt = null;
let deepgramInputStopAt = null;
let deepgramOutputStartAt = null;
let deepgramOutputStopAt = null;

// Rastreamento para exibição em tempo real
let deepgramCurrentInputElement = null; // Elemento sendo atualizado em tempo real
let deepgramInputStartedShowing = false; // Se já começou a mostrar algo

// Rastreamento para OUTPUT
let deepgramCurrentOutputElement = null;
let deepgramOutputStartedShowing = false;

// 🛑 Detecção de silêncio prolongado para parar envio
let deepgramLastSoundTime = null;
const DEEPGRAM_SILENCE_TIMEOUT = 3000; // 3 segundos de silêncio = para

/* ================================
   INICIALIZAÇÃO DO WEBSOCKET
================================ */

/**
 * Inicializa conexão WebSocket com Deepgram
 */
async function initDeepgramWebSocket() {
	if (deepgramWebSocket && deepgramWebSocket.readyState === WebSocket.OPEN) {
		console.log('🌊 WebSocket Deepgram já aberto');
		return deepgramWebSocket;
	}

	// Pega chave Deepgram salva
	const apiKey = await ipcRenderer.invoke('GET_API_KEY', 'deepgram');
	if (!apiKey) {
		throw new Error('❌ Chave Deepgram não configurada. Configure em "API e Modelos"');
	}

	console.log('🌊 Inicializando WebSocket Deepgram...');

	// Monta URL com parâmetros
	const params = new URLSearchParams({
		model: 'nova-2',
		language: 'pt-BR',
		smart_format: 'true',
		interim_results: 'true',
		encoding: 'linear16',
		sample_rate: '16000',
	});

	const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

	return new Promise((resolve, reject) => {
		deepgramWebSocket = new WebSocket(wsUrl, ['token', apiKey.trim()]);

		deepgramWebSocket.onopen = () => {
			console.log('✅ WebSocket Deepgram aberto! readyState:', deepgramWebSocket.readyState);

			// Testa envio imediato de dados
			try {
				// Envia 1 segundo de SILENCE para testar transmissão
				const testSilence = new Int16Array(16000); // 16000 samples = 1 segundo a 16kHz
				const buffer = new ArrayBuffer(testSilence.length * 2);
				const view = new Int16Array(buffer);
				for (let i = 0; i < testSilence.length; i++) {
					view[i] = testSilence[i]; // todos zeros = silêncio
				}
				deepgramWebSocket.send(buffer);
				console.log('🧪 [TEST] Enviado 1 segundo de silêncio (teste de transmissão):', buffer.byteLength, 'bytes');
			} catch (e) {
				console.error('❌ [TEST] Erro ao enviar teste:', e);
			}

			resolve(deepgramWebSocket);
		};

		deepgramWebSocket.onerror = err => {
			console.error('❌ Erro WebSocket Deepgram:', err);
			console.error('   Event:', err.type, err.message);
			reject(new Error('Falha ao conectar Deepgram'));
		};

		deepgramWebSocket.onmessage = event => {
			console.log('💬 Mensagem Deepgram INPUT recebida (tamanho:', event.data.length, 'bytes)');
			try {
				const data = JSON.parse(event.data);
				// 🔍 LOG COMPLETO DA RESPOSTA
				console.log('📥 RESPOSTA COMPLETA DO DEEPGRAM INPUT:');
				console.log(JSON.stringify(data, null, 2));
				console.log('---');
				// 🌊 Deepgram: Processa apenas INPUT neste WebSocket
				handleDeepgramMessage(data, 'input');
			} catch (e) {
				console.error('❌ Erro ao processar mensagem Deepgram INPUT:', e);
			}
		};

		deepgramWebSocket.onclose = event => {
			console.log(
				`🛑 WebSocket Deepgram fechado | Code: ${event.code} | Reason: ${event.reason || 'nenhum'} | Clean: ${
					event.wasClean
				}`,
			);
			console.log(
				'   Code meanings: 1000=Normal, 1001=GoingAway, 1002=ProtocolError, 1006=AbnormalClosure, 1011=ServerError',
			);
			deepgramWebSocket = null;
		};

		// Timeout de 15 segundos
		setTimeout(() => {
			if (deepgramWebSocket && deepgramWebSocket.readyState !== WebSocket.OPEN) {
				reject(new Error('Timeout ao conectar Deepgram'));
			}
		}, 15000);
	});
}

/**
 * Inicializa WebSocket SEPARADO para OUTPUT (saída de áudio)
 * Necessário porque Deepgram não diferencia múltiplos streams na mesma conexão
 */
async function initDeepgramOutputWebSocket() {
	if (deepgramOutputWebSocket && deepgramOutputWebSocket.readyState === WebSocket.OPEN) {
		console.log('🌊 WebSocket OUTPUT Deepgram já aberto');
		return deepgramOutputWebSocket;
	}

	const apiKey = await ipcRenderer.invoke('GET_API_KEY', 'deepgram');
	if (!apiKey) {
		throw new Error('❌ Chave Deepgram não configurada. Configure em "API e Modelos"');
	}

	console.log('🌊 Inicializando WebSocket OUTPUT Deepgram...');

	const params = new URLSearchParams({
		model: 'nova-2',
		language: 'pt-BR',
		smart_format: 'true',
		interim_results: 'true',
		encoding: 'linear16',
		sample_rate: '16000',
	});

	const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

	return new Promise((resolve, reject) => {
		deepgramOutputWebSocket = new WebSocket(wsUrl, ['token', apiKey.trim()]);

		deepgramOutputWebSocket.onopen = () => {
			console.log('✅ WebSocket OUTPUT Deepgram aberto! readyState:', deepgramOutputWebSocket.readyState);
			resolve(deepgramOutputWebSocket);
		};

		deepgramOutputWebSocket.onerror = err => {
			console.error('❌ Erro WebSocket OUTPUT Deepgram:', err);
			reject(new Error('Falha ao conectar Deepgram OUTPUT'));
		};

		deepgramOutputWebSocket.onmessage = event => {
			console.log('💬 Mensagem Deepgram OUTPUT recebida (tamanho:', event.data.length, 'bytes)');
			try {
				const data = JSON.parse(event.data);
				// 🔍 LOG COMPLETO DA RESPOSTA
				console.log('📥 RESPOSTA COMPLETA DO DEEPGRAM OUTPUT:');
				console.log(JSON.stringify(data, null, 2));
				console.log('---');
				// 🌊 Deepgram: Processa apenas OUTPUT neste WebSocket
				handleDeepgramMessage(data, 'output');
			} catch (e) {
				console.error('❌ Erro ao processar mensagem Deepgram OUTPUT:', e);
			}
		};

		deepgramOutputWebSocket.onclose = event => {
			console.log(`🛑 WebSocket OUTPUT Deepgram fechado | Code: ${event.code} | Reason: ${event.reason || 'nenhum'}`);
			deepgramOutputWebSocket = null;
		};

		setTimeout(() => {
			if (deepgramOutputWebSocket && deepgramOutputWebSocket.readyState !== WebSocket.OPEN) {
				reject(new Error('Timeout ao conectar Deepgram OUTPUT'));
			}
		}, 15000);
	});
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
	if (!previousText || previousText.length === 0) {
		return newText; // Primeiro interim = texto completo é o delta
	}

	// Se o novo é igual ao anterior, não há delta
	if (newText === previousText) {
		return '';
	}

	const prevWords = previousText.trim().split(/\s+/);
	const newWords = newText.trim().split(/\s+/);

	// 🔄 Encontrar primeira divergência word-by-word
	let divergenceIndex = 0;
	for (let i = 0; i < Math.min(prevWords.length, newWords.length); i++) {
		// Comparar ignoring case E removendo pontuação final
		const pWord = prevWords[i].toLowerCase().replace(/[,.!?;]$/, '');
		const nWord = newWords[i].toLowerCase().replace(/[,.!?;]$/, '');
		if (pWord === nWord) {
			divergenceIndex = i + 1; // Próxima palavra após match
		} else {
			// Encontrou divergência
			console.log(`   [extractDelta DEBUG] Divergência em i=${i}: "${pWord}" vs "${nWord}"`);
			break;
		}
	}

	// 📍 Se todas as palavras do previous estão no new (prefix match)
	// divergenceIndex será = prevWords.length
	// Então o delta é apenas o que vem depois
	if (divergenceIndex >= prevWords.length) {
		// Caso normal: novo é extensão do anterior
		const delta = newWords.slice(divergenceIndex).join(' ');
		if (delta) console.log(`   [extractDelta DEBUG] Extensão: delta="${delta}"`);
		return delta || '';
	}

	// 🔄 Houve mudança: retorna a partir do ponto de divergência
	const delta = newWords.slice(divergenceIndex).join(' ');
	console.log(`   [extractDelta DEBUG] Mudança detectada em i=${divergenceIndex}: delta="${delta}"`);
	return delta || '';
}

/**
 * Processa mensagens do Deepgram para INPUT ou OUTPUT
 * INPUT = Microfone do usuário (Você)
 * OUTPUT = Saída de áudio do PC (Sistema, em modo entrevista)
 */
function handleDeepgramMessage(data, source = 'input') {
	const transcript = data.channel?.alternatives?.[0]?.transcript || '';
	const confidence = data.channel?.alternatives?.[0]?.confidence || 0;
	const isFinal = data.is_final || false;

	if (!transcript || !transcript.trim()) {
		return; // Ignora transcrições vazias
	}

	// 🎤 Determina autor baseado na fonte
	const isInput = source === 'input';
	const author = isInput ? YOU : 'Sistema';

	// 🛑 EM MODO NORMAL: Ignora OUTPUT
	if (!isInput && !ModeController?.isInterviewMode?.()) {
		return;
	}

	// ================================
	// 🔍 DETECÇÃO DE DELTA (INCREMENTO)
	// ================================
	const lastShown = isInput ? deepgramLastInputInterimShown : deepgramLastOutputInterimShown;
	const delta = extractDelta(lastShown, transcript);
	const isFirstInterim = !lastShown;

	console.log(
		`[handleDeepgramMessage] source="${source}" | lastShown="${lastShown}" | transcript="${transcript}" | delta="${delta}" | isFinal=${isFinal}`,
	);

	if (isFinal) {
		// ✅ FINAL CONSOLIDADO
		console.log(`📝 ✅ FINAL [${source.toUpperCase()}]: "${transcript}" (${(confidence * 100).toFixed(1)}%)`);

		// 🔴 Se houver delta (mudança detectada na última atualização), adiciona como linha nova também
		if (delta && delta.length > 0) {
			console.log(`🔴 Delta final detectado [${source}]: delta = "${delta}"`);
			const timeForDelta = isInput ? deepgramInputStartAt : deepgramOutputStartAt || Date.now();
			addTranscript(author, delta, timeForDelta);
		}

		// Envia TEXTO CONSOLIDADO para processar (sem fragments)
		handleSpeech(author, transcript);

		// 🔄 RESET: Prepara para próxima frase
		if (isInput) {
			deepgramLastInputInterimShown = null;
			deepgramInputInterimBuffer = '';
			deepgramInputStartedShowing = false;
			deepgramCurrentInputElement = null;
		} else {
			deepgramLastOutputInterimShown = null;
			deepgramOutputInterimBuffer = '';
			deepgramOutputStartedShowing = false;
			deepgramCurrentOutputElement = null;
		}
	} else if (isFirstInterim) {
		// 🟢 PRIMEIRA INTERIM - Adiciona texto completo
		console.log(`🟢 PRIMEIRA interim [${source}]: "${transcript}"`);

		const timeForTranscript = isInput ? deepgramInputStartAt : deepgramOutputStartAt || Date.now();
		const el = addTranscript(author, transcript, timeForTranscript);
		if (el && el.dataset) {
			el.dataset.startAt = timeForTranscript;
		}

		// Marca como mostrado
		if (isInput) {
			deepgramInputStartedShowing = true;
			deepgramCurrentInputElement = el;
			deepgramLastInputInterimShown = transcript;
		} else {
			deepgramOutputStartedShowing = true;
			deepgramCurrentOutputElement = el;
			deepgramLastOutputInterimShown = transcript;
		}
	} else if (delta && delta.length > 0) {
		// 🟡 ATUALIZAÇÃO INTERIM com DELTA - Adiciona incremento
		console.log(`🟡 Atualizando interim [${source}]: delta = "${delta}"`);

		// Adiciona APENAS a parte nova
		const timeForDelta = isInput ? deepgramInputStartAt : deepgramOutputStartAt || Date.now();
		addTranscript(author, delta, timeForDelta);

		// Atualiza rastreamento
		if (isInput) {
			deepgramLastInputInterimShown = transcript;
		} else {
			deepgramLastOutputInterimShown = transcript;
		}
	} else {
		// Sem delta = sem mudança = ignora
		console.log(`⏭️ Sem delta em [${source}], ignorando`);
	}
}

/* ================================
   CAPTURA DE ÁUDIO - INPUT
================================ */

/**
 * Inicia captura de áudio do microfone com Deepgram
 */
async function startDeepgramInput() {
	if (isDeepgramInputActive) {
		console.warn('⚠️ Deepgram INPUT já ativo');
		return;
	}

	try {
		// Inicializa WebSocket
		console.log('🌊 startDeepgramInput: Iniciando...');
		await initDeepgramWebSocket();
		console.log('🌊 startDeepgramInput: WebSocket inicializado, readyState =', deepgramWebSocket?.readyState);
		isDeepgramInputActive = true;

		// 📍 CAPTURA O MOMENTO EXATO que a captura começa (para timestamps como outros modelos)
		deepgramInputStartAt = Date.now();
		console.log('⏱️ startDeepgramInput: Timestamp capturado -', new Date(deepgramInputStartAt).toLocaleTimeString());

		// 🔄 RESET do estado para nova sessão de transcrição
		deepgramInputInterimBuffer = '';
		deepgramInputStartedShowing = false;
		deepgramCurrentInputElement = null;
		deepgramInputStopAt = null;
		deepgramLastSoundTime = Date.now(); // 🛑 Inicia contador de silêncio

		// Pede permissão do microfone
		console.log('🎤 Solicitando acesso ao microfone...');

		// Tenta usar dispositivo INPUT selecionado, se houver
		const inputSelectElement = document.getElementById('audio-input-device');
		const inputDeviceId = inputSelectElement?.value;

		const audioConstraints = inputDeviceId ? { audio: { deviceId: { exact: inputDeviceId } } } : { audio: true }; // Usa padrão se nenhum selecionado

		deepgramInputStream = await navigator.mediaDevices.getUserMedia(audioConstraints);

		console.log('✅ Microfone autorizado');

		// Cria AudioContext com 16kHz
		deepgramInputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
			sampleRate: 16000,
		});

		const source = deepgramInputAudioContext.createMediaStreamSource(deepgramInputStream);
		deepgramInputProcessor = deepgramInputAudioContext.createScriptProcessor(4096, 1, 1);

		let pcmBuffer = [];
		let processCallCount = 0; // DEBUG

		deepgramInputProcessor.onaudioprocess = e => {
			processCallCount++; // DEBUG

			// Log na PRIMEIRA chamada e cada 100 frames
			if (processCallCount === 1) {
				console.log(
					`🔧 [#1 CHAMADA] onaudioprocess iniciado | AC state: ${deepgramInputAudioContext.state} | WS: ${deepgramWebSocket?.readyState}`,
				);
			}

			const inputData = e.inputBuffer.getChannelData(0);

			// Calcula RMS para heurística de silêncio
			let rms = 0;
			for (let i = 0; i < inputData.length; i++) {
				rms += inputData[i] * inputData[i];
			}
			rms = Math.sqrt(rms / inputData.length);
			deepgramLastInputVolume = rms;

			// 🛑 DETECÇÃO DE SILÊNCIO PROLONGADO
			// Se tem som, atualiza o último momento que ouvi som
			if (rms >= 0.0001) {
				deepgramLastSoundTime = Date.now();
			}

			// Se passou muito tempo sem som, para de enviar
			if (deepgramLastSoundTime && Date.now() - deepgramLastSoundTime > DEEPGRAM_SILENCE_TIMEOUT) {
				if (processCallCount % 100 === 0) {
					console.log(
						`⏱️ [#${processCallCount}] SILÊNCIO PROLONGADO (${Math.round(
							(Date.now() - deepgramLastSoundTime) / 1000,
						)}s), parando envio`,
					);
				}
				return;
			}

			// Debug detalhado na primeira chamada
			if (processCallCount === 1) {
				console.log(`📊 [#1 RMS] ${rms.toFixed(6)} | isActive: ${isDeepgramInputActive}`);
			}

			// ========== VERIFICAÇÕES ==========
			if (!isDeepgramInputActive) {
				if (processCallCount === 1) console.log('🛑 [#1] isDeepgramInputActive = FALSE, retornando');
				return;
			}

			if (!deepgramWebSocket) {
				if (processCallCount <= 2) console.error('❌ [#' + processCallCount + '] deepgramWebSocket = NULL');
				return;
			}

			const wsState = deepgramWebSocket.readyState;
			if (processCallCount === 1) {
				console.log(`🔌 [#1] WebSocket readyState: ${wsState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
			}

			if (wsState !== WebSocket.OPEN) {
				if (processCallCount <= 2) {
					console.warn(`⚠️  [#${processCallCount}] WS state ${wsState}, esperado 1 (OPEN). Retornando.`);
				}
				return;
			}

			// RMS threshold
			if (rms < 0.0001) {
				if (processCallCount === 1) console.log(`🔇 [#1] RMS ${rms.toFixed(6)} < 0.0001 (silêncio), pulando`);
				return;
			}

			if (processCallCount === 1) {
				console.log(`✅ [#1] TODAS AS VERIFICAÇÕES PASSARAM! Prosseguindo com conversão PCM...`);
			}

			// Converte Float32 → Int16 (assimétrico)
			const pcm16 = new Int16Array(inputData.length);
			for (let i = 0; i < inputData.length; i++) {
				const s = Math.max(-1, Math.min(1, inputData[i]));
				pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
			}

			// Acumula em buffer
			pcmBuffer.push(...Array.from(pcm16));

			if (processCallCount === 1) {
				console.log(
					`📦 [#1] PCM buffer: ${pcmBuffer.length} samples, threshold: 16000 (${(
						(pcmBuffer.length / 16000) *
						100
					).toFixed(1)}%)`,
				);
			}

			// Envia quando atinge ~1 segundo (16KB a 16kHz) - mais agressivo
			if (pcmBuffer.length >= 16000) {
				try {
					if (processCallCount <= 2) {
						console.log(`🚀 [#${processCallCount}] ENVIANDO CHUNK: ${pcmBuffer.length} samples`);
					}

					// Cria ArrayBuffer para WebSocket
					const buffer = new ArrayBuffer(pcmBuffer.length * 2);
					const view = new Int16Array(buffer);
					for (let i = 0; i < pcmBuffer.length; i++) {
						view[i] = pcmBuffer[i];
					}

					deepgramWebSocket.send(buffer);
					console.log(`✅ [#${processCallCount}] CHUNK ENVIADO: ${buffer.byteLength} bytes`);

					pcmBuffer = [];
				} catch (err) {
					if (isDeepgramInputActive) {
						console.error('❌ Erro ao enviar chunk Deepgram:', err.message);
					}
				}
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
 * Para captura de áudio do microfone
 */
function stopDeepgramInput() {
	isDeepgramInputActive = false;

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

	deepgramInputInterimBuffer = '';
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

		// ⚠️ Inicializa WebSocket SEPARADO para OUTPUT (não reutiliza INPUT)
		await initDeepgramOutputWebSocket();
		isDeepgramOutputActive = true;

		// 📍 CAPTURA O MOMENTO EXATO que a captura começa
		deepgramOutputStartAt = Date.now();
		console.log('⏱️ startDeepgramOutput: Timestamp capturado -', new Date(deepgramOutputStartAt).toLocaleTimeString());

		// 🔄 RESET do estado para nova sessão de transcrição (OUTPUT)
		deepgramOutputInterimBuffer = '';
		deepgramOutputStartedShowing = false;
		deepgramCurrentOutputElement = null;
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
		deepgramOutputProcessor = deepgramOutputAudioContext.createScriptProcessor(4096, 1, 1);

		let pcmBuffer = [];
		let processCallCount = 0; // DEBUG

		deepgramOutputProcessor.onaudioprocess = e => {
			processCallCount++; // DEBUG
			if (processCallCount === 1 || processCallCount % 100 === 0) {
				console.log(
					`🔧 [DEBUG OUTPUT] onaudioprocess chamado #${processCallCount} | AudioContext state: ${deepgramOutputAudioContext.state}`,
				);
			}

			if (
				!isDeepgramOutputActive ||
				!deepgramOutputWebSocket ||
				deepgramOutputWebSocket.readyState !== WebSocket.OPEN
			) {
				return;
			}

			const inputData = e.inputBuffer.getChannelData(0);

			// Calcula RMS
			let rms = 0;
			for (let i = 0; i < inputData.length; i++) {
				rms += inputData[i] * inputData[i];
			}
			rms = Math.sqrt(rms / inputData.length);
			deepgramLastOutputVolume = rms;

			// Debug: mostra RMS a cada 50 frames
			if (processCallCount % 50 === 0) {
				console.log(`📊 [DEBUG OUTPUT] RMS: ${rms.toFixed(6)} | Threshold: 0.0001`);
			}

			// Skip apenas silêncio MUITO forte (ajustado: era 0.001, agora 0.0001)
			if (rms < 0.0001) {
				return;
			}

			// Converte Float32 → Int16
			const pcm16 = new Int16Array(inputData.length);
			for (let i = 0; i < inputData.length; i++) {
				const s = Math.max(-1, Math.min(1, inputData[i]));
				pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
			}

			pcmBuffer.push(...Array.from(pcm16));

			if (pcmBuffer.length >= 16000) {
				try {
					const buffer = new ArrayBuffer(pcmBuffer.length * 2);
					const view = new Int16Array(buffer);
					for (let i = 0; i < pcmBuffer.length; i++) {
						view[i] = pcmBuffer[i];
					}

					deepgramOutputWebSocket.send(buffer);
					console.log(`📤 Chunk OUTPUT enviado: ${buffer.byteLength} bytes`);

					pcmBuffer = [];
				} catch (err) {
					if (isDeepgramOutputActive) {
						console.error('❌ Erro ao enviar chunk OUTPUT:', err);
					}
				}
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

/**
 * Para captura de áudio da saída
 */
function stopDeepgramOutput() {
	isDeepgramOutputActive = false;

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

	deepgramOutputInterimBuffer = '';
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

	// Fecha WebSocket INPUT
	if (deepgramWebSocket) {
		try {
			deepgramWebSocket.close();
		} catch (e) {
			console.error('Erro ao fechar WebSocket INPUT:', e);
		}
		deepgramWebSocket = null;
	}

	// Fecha WebSocket OUTPUT (separado)
	if (deepgramOutputWebSocket) {
		try {
			deepgramOutputWebSocket.close();
		} catch (e) {
			console.error('Erro ao fechar WebSocket OUTPUT:', e);
		}
		deepgramOutputWebSocket = null;
	}

	console.log('🌊 Deepgram completamente parado');
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
