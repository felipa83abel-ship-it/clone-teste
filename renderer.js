/* ===============================
   IMPORTS
=============================== */
const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const hljs = require('highlight.js');

// 🔒 DESABILITADO TEMPORARIAMENTE
const DESABILITADO_TEMPORARIAMENTE = false;
const ASK_GPT_DESABILITADO_TEMPORARIAMENTE = true;

/* ===============================
   CONSTANTES
=============================== */

const YOU = 'Você';
const OTHER = 'Outros';

const ENABLE_INTERVIEW_TIMING_DEBUG = true; // ← desligar depois = false
const QUESTION_IDLE_TIMEOUT = 300; // Tempo de espera para a pergunta ser considerada inativa = 300
const CURRENT_QUESTION_ID = 'CURRENT'; // ID da pergunta atual

const INPUT_SPEECH_THRESHOLD = 20; // Valor limite (threshold) para detectar fala mais cedo = 20
const INPUT_SILENCE_TIMEOUT = 100; // Tempo de espera para silêncio = 100
const MIN_INPUT_AUDIO_SIZE = 1000; // Valor mínimo de tamanho de áudio para a normal = 1000
const MIN_INPUT_AUDIO_SIZE_INTERVIEW = 350; // Valor mínimo de tamanho de áudio para a entrevista = 350

const OUTPUT_SPEECH_THRESHOLD = 20; // Valor limite (threshold) para detectar fala mais cedo = 8
const OUTPUT_SILENCE_TIMEOUT = 100; // Tempo de espera para silêncio = 250
const MIN_OUTPUT_AUDIO_SIZE = 1000; // Valor mínimo de tamanho de áudio para a normal = 2500
const MIN_OUTPUT_AUDIO_SIZE_INTERVIEW = 350; // Valor mínimo para enviar parcial (~3-4 chunks, ~3KB)
// controla intervalo mínimo entre requisições STT parciais (ms) - mantém rate-limit para não sobrecarregar API
const PARTIAL_MIN_INTERVAL_MS = 3000;

const OUTPUT_ENDING_PHRASES = ['tchau', 'tchau tchau', 'obrigado', 'valeu', 'falou', 'beleza', 'ok']; // Palavras finais para detectar o fim da fala

const SYSTEM_PROMPT = `
Você é um assistente para entrevistas técnicas de Java. Responda como candidato.
Regras de resposta (priorize sempre estas):
- Seja natural e conciso: responda em no máximo 1–2 frases curtas.
- Use linguagem coloquial e direta, como alguém explicando rapidamente verbalmente.
- Evite listas longas, exemplos extensos ou parágrafos detalhados.
- Não comece com cumprimentos ou palavras de preenchimento (ex.: "Claro", "Ok").
- Quando necessário, entregue um exemplo mínimo de 1 linha apenas.
`;

/* ===============================
   ESTADO GLOBAL
=============================== */

let APP_CONFIG = {
	MODE_DEBUG: false,
};

// 🪟 Estado do Drag and Drop da janela
let isDraggingWindow = false;

let isRunning = false;
let audioContext;
let mockInterviewRunning = false;

let USE_LOCAL_WHISPER = false; // false = OpenAI, true = Whisper local
let transcriptionMetrics = {
	audioStartTime: null,
	whisperStartTime: null,
	whisperEndTime: null,
	gptStartTime: null,
	gptEndTime: null,
	totalTime: null,
	audioSize: 0,
};

/* 🎤 INPUT (VOCÊ) */
let inputStream;
let inputAnalyser;
let inputData;
let inputRecorder;
let inputChunks = [];
let inputSpeaking = false;
let inputSilenceTimer = null;
let inputPartialChunks = [];
let inputPartialTimer = null;

/* 🔊 OUTPUT (OUTROS) */
let outputStream;
let outputAnalyser;
let outputData;
let outputRecorder;
let outputChunks = [];
let outputSpeaking = false;
let outputSilenceTimer = null;
let outputPartialChunks = [];
let outputPartialTimer = null;
let outputPartialText = '';

// 🔥 NOVO: IDs para rastrear e parar os loops de animation
let inputVolumeAnimationId = null;
let outputVolumeAnimationId = null;

/* 🧠 PERGUNTAS */
let currentQuestion = { text: '', lastUpdate: 0, finalized: false, lastUpdateTime: null, createdAt: null };
let questionsHistory = [];
const answeredQuestions = new Set(); // 🔒 Armazena respostas já geradas (questionId -> true)
let selectedQuestionId = null;
let interviewTurnId = 0;
let gptAnsweredTurnId = null;
let gptRequestedTurnId = null;
let lastSentQuestionText = '';
let autoCloseQuestionTimer = null;
let lastInputStartAt = null;
let lastInputStopAt = null;
let lastOutputStartAt = null;
let lastOutputStopAt = null;
let lastInputPlaceholderEl = null;
let lastOutputPlaceholderEl = null;
let lastAskedQuestionNormalized = null;
let lastPartialSttAt = null;

/* ===============================
   CALLBACKS / OBSERVERS SYSTEM
   renderer.js é "cego" para DOM
   config-manager.js se inscreve em mudanças
=============================== */

const UICallbacks = {
	onError: null, // 🔥 NOVO: Para mostrar erros de validação
	onTranscriptAdd: null,
	onCurrentQuestionUpdate: null,
	onQuestionsHistoryUpdate: null,
	onAnswerAdd: null,
	onStatusUpdate: null, // ← Adicionado: Para atualizar status na UI
	onInputVolumeUpdate: null,
	onOutputVolumeUpdate: null,
	onMockBadgeUpdate: null,
	onDOMElementsReady: null, // callback para pedir elementos ao config-manager
	onListenButtonToggle: null,
	onAnswerSelected: null,
	onClearAllSelections: null,
	onScrollToQuestion: null,
	onTranscriptionCleared: null,
	onAnswersCleared: null,
	onAnswerStreamChunk: null,
	onModeSelectUpdate: null,
	onPlaceholderFulfill: null,
	onPlaceholderUpdate: null,
};

// Função para config-manager se inscrever em eventos
function onUIChange(eventName, callback) {
	if (UICallbacks.hasOwnProperty(eventName)) {
		UICallbacks[eventName] = callback;
		console.log(`📡 UI callback registrado em renderer.js: ${eventName}`);
	}
}

// Função para emitir/enviar eventos para config-manager
function emitUIChange(eventName, data) {
	if (UICallbacks[eventName] && typeof UICallbacks[eventName] === 'function') {
		UICallbacks[eventName](data);
	} else {
		console.warn(`⚠️ DEBUG: Nenhum callback registrado para '${eventName}'`);
	}
}

/* ===============================
   ELEMENTOS UI - Solicitado por callback
   (config-manager.js fornece esses elementos)
=============================== */

let UIElements = {
	inputSelect: null,
	outputSelect: null,
	listenBtn: null,
	statusText: null,
	transcriptionBox: null, // Mantido para compatibilidade, mas pode receber 'conversation'
	currentQuestionBox: null,
	currentQuestionTextBox: null,
	questionsHistoryBox: null,
	answersHistoryBox: null,
	askBtn: null,
	inputVu: null,
	outputVu: null,
	inputVuHome: null,
	outputVuHome: null,
	mockToggle: null,
	mockBadge: null,
	interviewModeSelect: null,
	btnClose: null,
	btnToggleClick: null,
	dragHandle: null,
	darkToggle: null,
	opacitySlider: null,
};

// config-manager.js chama isso para registrar elementos
function registerUIElements(elements) {
	UIElements = { ...UIElements, ...elements };
	console.log('✅ UI Elements registrados no renderer.js');
}

/* ===============================
   MODO / ORQUESTRADOR
=============================== */

const MODES = {
	NORMAL: 'NORMAL',
	INTERVIEW: 'INTERVIEW',
};

// 🔄 modo atual (default = comportamento atual)
let CURRENT_MODE = MODES.NORMAL;

// 🎼 controlador central de estratégia
const ModeController = {
	isInterviewMode() {
		return CURRENT_MODE === MODES.INTERVIEW;
	},

	// ⏱️ MediaRecorder.start(timeslice)
	mediaRecorderTimeslice() {
		if (!this.isInterviewMode()) return null;

		// OUTPUT pode ser mais agressivo que INPUT
		return 60; // reduzido para janelas parciais mais responsivas
	},

	// 🤖 GPT streaming
	allowGptStreaming() {
		return this.isInterviewMode();
	},

	// 📦 tamanho mínimo de áudio aceito
	minInputAudioSize(defaultSize) {
		return this.isInterviewMode() ? Math.min(400, defaultSize) : defaultSize;
	},
};

/* ===============================
   HELPERS PUROS
=============================== */

function finalizeQuestion(t) {
	debugLogRenderer('Início da função: "finalizeQuestion"');
	debugLogRenderer('Fim da função: "finalizeQuestion"');
	return t.trim().endsWith('?') ? t.trim() : t.trim() + '?';
}

function normalizeForCompare(t) {
	debugLogRenderer('Início da função: "normalizeForCompare"');
	debugLogRenderer('Fim da função: "normalizeForCompare"');
	return (t || '')
		.toLowerCase()
		.replace(/[?!.\n\r]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function looksLikeQuestion(t) {
	debugLogRenderer('Início da função: "looksLikeQuestion"');
	const s = t.toLowerCase().trim();

	// precisa ter ? OU começar com palavra típica de pergunta
	const questionStarters = [
		'o que',
		'por que',
		'porque',
		'como',
		'qual',
		'quais',
		'quando',
		'onde',
		'fale',
		'me fale',
		'me explica',
		'me explique',
		'me diga',
		'diga',
		'você',
		'explique',
		'descreva',
		'já',
		'tu já',
	];

	debugLogRenderer('Fim da função: "looksLikeQuestion"');
	return s.includes('?') || questionStarters.some(q => s.startsWith(q));
}

function isGarbageSentence(t) {
	debugLogRenderer('Início da função: "isGarbageSentence"');
	const s = t.toLowerCase();
	debugLogRenderer('Fim da função: "isGarbageSentence"');
	return ['obrigado', 'até a próxima', 'finalizando'].some(w => s.includes(w));
}

// Encurta uma resposta em markdown para até `maxSentences` sentenças.
function shortenAnswer(markdownText, maxSentences = 2) {
	debugLogRenderer('Início da função: "shortenAnswer"');
	if (!markdownText) return markdownText;

	// remove blocos de código temporariamente para evitar cortes ruins
	const codeBlocks = [];
	const withoutCode = markdownText.replace(/```[\s\S]*?```/g, match => {
		codeBlocks.push(match);
		return `__CODEBLOCK_${codeBlocks.length - 1}__`;
	});

	// remove inline code
	const tmp = withoutCode.replace(/`([^`]*)`/g, '$1');

	// extrai sentenças por pontuação final
	const parts = tmp.split(/(?<=[\.\?!])\s+/);

	const take = parts.slice(0, maxSentences).join(' ').trim();

	// restaura blocos de código, caso existam (apendados ao final)
	let result = take;
	if (codeBlocks.length) {
		result += '\n\n' + codeBlocks.join('\n\n');
	}

	// garante pontuação final
	if (!/[\.\?!]$/.test(result)) result = result + '.';

	debugLogRenderer('Fim da função: "shortenAnswer"');
	return result;
}

function isIncompleteQuestion(t) {
	debugLogRenderer('Início da função: "isIncompleteQuestion"');
	if (!t) return false;
	const s = t.trim();
	// casos óbvios: contém reticências (..., …) — normalmente placeholders ou cortes
	if (s.includes('...') || s.includes('…')) return true;

	// termina com fragmento muito curto seguido de pontuação (ex: "O que é a...")
	// ou termina com apenas 1-3 letras antes do fim (sinal de corte)
	if (/\b\w{1,3}[\.]{0,3}$/.test(s) && /\.\.{1,3}$/.test(s)) return true;

	// termina com palavra muito curta e sem contexto (ex: endsWith ' a' )
	if (/\b[a-z]{1,2}$/.test(s.toLowerCase())) return true;

	debugLogRenderer('Fim da função: "isIncompleteQuestion"');
	return false;
}

function getNavigableQuestionIds() {
	debugLogRenderer('Início da função: "getNavigableQuestionIds"');
	const ids = [];

	// CURRENT só entra se tiver texto
	if (currentQuestion.text && currentQuestion.text.trim().length > 0) {
		ids.push(CURRENT_QUESTION_ID);
	}

	// Histórico (mais recente primeiro)
	ids.push(
		...questionsHistory
			.slice()
			.reverse()
			.map(q => q.id),
	);

	debugLogRenderer('Fim da função: "getNavigableQuestionIds"');
	return ids;
}

function findAnswerByQuestionId(questionId) {
	debugLogRenderer('Início da função: "findAnswerByQuestionId"');

	if (!questionId) {
		// ID inválido
		debugLogRenderer('Fim da função: "findAnswerByQuestionId"');
		return false;
	}

	debugLogRenderer('Fim da função: "findAnswerByQuestionId"');
	return answeredQuestions.has(questionId);
}

function promoteCurrentToHistory(text) {
	debugLogRenderer('Início da função: "promoteCurrentToHistory"');
	console.log('📚 promovendo pergunta para histórico:', text);

	// evita duplicação no histórico: se a última entrada é igual (normalizada), não adiciona
	const last = questionsHistory.length ? questionsHistory[questionsHistory.length - 1] : null;
	if (last && normalizeForCompare(last.text) === normalizeForCompare(text)) {
		console.log('🔕 pergunta igual já presente no histórico — pulando promoção');

		// limpa CURRENT mas preserva seleção conforme antes
		const prevSelected = selectedQuestionId;
		currentQuestion = { text: '', lastUpdate: 0, finalized: false, lastUpdateTime: null, createdAt: null };
		if (prevSelected === null || prevSelected === CURRENT_QUESTION_ID) {
			selectedQuestionId = CURRENT_QUESTION_ID;
		} else {
			selectedQuestionId = prevSelected;
		}

		renderQuestionsHistory();
		renderCurrentQuestion();
		return;
	}

	const newId = crypto.randomUUID();

	questionsHistory.push({
		id: newId,
		text,
		createdAt: currentQuestion.createdAt || Date.now(),
		lastUpdateTime: currentQuestion.lastUpdateTime || currentQuestion.createdAt || Date.now(),
	});

	// preserva seleção do usuário: se não havia seleção explícita ou estava no CURRENT,
	// mantém a seleção no CURRENT para que o novo CURRENT seja principal.
	const prevSelected = selectedQuestionId;

	currentQuestion = { text: '', lastUpdate: 0, finalized: false, lastUpdateTime: null, createdAt: null };

	if (prevSelected === null || prevSelected === CURRENT_QUESTION_ID) {
		selectedQuestionId = CURRENT_QUESTION_ID;
	} else {
		// usuário tinha selecionado algo no histórico — preserva essa seleção
		selectedQuestionId = prevSelected;
	}

	renderQuestionsHistory();
	renderCurrentQuestion();

	debugLogRenderer('Fim da função: "promoteCurrentToHistory"');
}

function isQuestionReady(text) {
	debugLogRenderer('Início da função: "isQuestionReady"');
	if (!ModeController.isInterviewMode()) return true;

	const trimmed = text.trim();

	// 🔥 entrevistas podem ter perguntas curtas ("O que é POO")
	if (trimmed.length < 10) return false;

	// ignora despedidas
	if (isEndingPhrase(trimmed)) return false;

	// heurística simples de pergunta
	const questionIndicators = [
		'o que',
		'por que',
		'porque',
		'como',
		'qual',
		'quais',
		'quando',
		'onde',
		'fale',
		'me fale',
		'me explica',
		'me explique',
		'me diga',
		'diga',
		'você',
		'explique',
		'descreva',
		'já',
		'tu já',
	];

	const lower = trimmed.toLowerCase();

	const hasIndicator = questionIndicators.some(q => lower.includes(q));

	const hasQuestionMark = trimmed.includes('?');

	debugLogRenderer('Fim da função: "isQuestionReady"'); // só dispara se houver indício real
	return hasIndicator || hasQuestionMark;
}

function isEndingPhrase(text) {
	debugLogRenderer('Início da função: "isEndingPhrase"');
	const normalized = text.toLowerCase().trim();

	debugLogRenderer('Fim da função: "isEndingPhrase"');
	return OUTPUT_ENDING_PHRASES.some(p => normalized === p);
}

/* ===============================
   TRANSCRIÇÃO LOCAL
=============================== */

function setTranscriptionMode(useLocal) {
	USE_LOCAL_WHISPER = useLocal;
	console.log(`🎤 Modo de transcrição: ${useLocal ? 'WHISPER LOCAL' : 'OPENAI'}`);
}

async function transcribeAudio(blob) {
	transcriptionMetrics.audioStartTime = Date.now();
	transcriptionMetrics.audioSize = blob.size;

	const buffer = Buffer.from(await blob.arrayBuffer());
	console.log(`🎤 Transcrição (${USE_LOCAL_WHISPER ? 'Local' : 'OpenAI'}): ${blob.size} bytes`);
	console.log(
		`⏱️ Início: ${new Date(transcriptionMetrics.audioStartTime).toLocaleTimeString()}.${
			transcriptionMetrics.audioStartTime % 1000
		}`,
	);

	if (USE_LOCAL_WHISPER) {
		try {
			console.log(`🚀 Enviando para Whisper local...`);
			transcriptionMetrics.whisperStartTime = Date.now();

			const result = await ipcRenderer.invoke('transcribe-local', buffer);

			transcriptionMetrics.whisperEndTime = Date.now();
			const whisperTime = transcriptionMetrics.whisperEndTime - transcriptionMetrics.whisperStartTime;

			console.log(`✅ Whisper local concluído em ${whisperTime}ms`);
			console.log(`📝 Resultado (${result.length} chars): "${result.substring(0, 80)}..."`);

			// Log intermediário
			console.log(
				`📊 Whisper: ${whisperTime}ms para ${blob.size} bytes (${Math.round(blob.size / whisperTime)} bytes/ms)`,
			);

			return result;
		} catch (error) {
			console.error('❌ Whisper local falhou:', error.message);
			// Fallback para OpenAI
			try {
				return await ipcRenderer.invoke('transcribe-audio', buffer);
			} catch (openaiError) {
				throw new Error(`Falha na transcrição: ${openaiError.message}`);
			}
		}
	} else {
		transcriptionMetrics.whisperStartTime = Date.now();
		const result = await ipcRenderer.invoke('transcribe-audio', buffer);
		transcriptionMetrics.whisperEndTime = Date.now();

		const whisperTime = transcriptionMetrics.whisperEndTime - transcriptionMetrics.whisperStartTime;
		console.log(`✅ OpenAI concluído em ${whisperTime}ms`);

		return result;
	}
}

async function transcribeAudioPartial(blob) {
	const buffer = Buffer.from(await blob.arrayBuffer());

	if (USE_LOCAL_WHISPER) {
		try {
			return await ipcRenderer.invoke('transcribe-local-partial', buffer);
		} catch (error) {
			console.warn('⚠️ Whisper local parcial falhou:', error.message);
			return '';
		}
	} else {
		return await ipcRenderer.invoke('transcribe-audio-partial', buffer);
	}
}

/* ===============================
   TRANSCRIÇÃO VOSK (MODO ENTREVISTA)
=============================== */

let voskAccumulatedText = ''; // Acumula resultado parcial do Vosk
let voskPartialTimer = null;
let voskScriptProcessor = null; // ScriptProcessorNode para capturar PCM bruto
let voskAudioBuffer = []; // Acumula PCM entre envios

/**
 * Converte array de floats PCM para Int16Array
 */
function floatToPCM16(floatArray) {
	const pcm16 = new Int16Array(floatArray.length);
	for (let i = 0; i < floatArray.length; i++) {
		pcm16[i] = Math.max(-1, Math.min(1, floatArray[i])) * 0x7fff;
	}
	return pcm16;
}

/**
 * Inicia captura de PCM bruto do áudio (substitui MediaRecorder para Vosk)
 * @param {MediaStreamAudioSourceNode} source - Source do áudio da stream
 * @deprecated Usar MediaRecorder com timeslice ao invés de ScriptProcessorNode
 */
function startVoskPcmCapture(source) {
	console.warn('⚠️ startVoskPcmCapture deprecated - use MediaRecorder timeslice instead');
}

/**
 * Para captura de PCM bruto do Vosk
 */
function stopVoskPcmCapture() {
	try {
		if (voskScriptProcessor) {
			voskScriptProcessor.disconnect();
			voskScriptProcessor.onaudioprocess = null;
			voskScriptProcessor = null;
		}
		voskAudioBuffer = [];
		console.log('✅ Captura PCM para Vosk parada');
	} catch (error) {
		console.error('❌ Erro ao parar captura PCM:', error);
	}
}

/**
 * Transcreve chunk de blob com Vosk (modo entrevista - padrão Deepgram)
 * Envia blobs WebM diretamente para Vosk via IPC
 */
/**
 * 🚫 DEPRECADO: Vosk não funciona com chunks WebM fragmentados do MediaRecorder
 * MediaRecorder gera blobs WebM incompletos que ffmpeg/Vosk rejeitam
 * Solução: usar apenas Whisper para OUTPUT (funciona bem com WebM fragmentado)
 * @deprecated
 */
async function voskTranscribeChunkFromBlob(blob) {
	console.warn('⚠️ voskTranscribeChunkFromBlob deprecado - usar Whisper ao invés');
	// Função removida - ver transcribeOutput() para transcrição final de saída
}

/**
 * Inicia captura de PCM bruto do áudio (substitui MediaRecorder para Vosk)
 * @param {MediaStreamAudioSourceNode} source - Source do áudio da stream
 * @deprecated Usar MediaRecorder com timeslice ao invés de ScriptProcessorNode
 */
function startVoskPcmCapture(source) {
	console.warn('⚠️ startVoskPcmCapture deprecated - usar MediaRecorder com timeslice ao invés de ScriptProcessorNode');
	// Função deprecada mantida para compatibilidade reversa
}

/* ===============================
   DISPOSITIVOS / CONTROLE DE ÁUDIO
=============================== */

async function startAudio() {
	debugLogRenderer('Início da função: "startAudio"');

	// Se houver dispositivo de entrada selecionado, inicia a captura de áudio
	if (UIElements.inputSelect?.value) await startInput();
	// Se houver dispositivo de saída selecionado, inicia a captura de áudio
	if (UIElements.outputSelect?.value) await startOutput();

	debugLogRenderer('Fim da função: "startAudio"');
}

async function stopAudio() {
	debugLogRenderer('Início da função: "stopAudio"');

	if (currentQuestion.text) closeCurrentQuestionForced();

	inputRecorder?.state === 'recording' && inputRecorder.stop();
	outputRecorder?.state === 'recording' && outputRecorder.stop();

	// 🆕 VOSK: Reset do estado
	if (ModeController.isInterviewMode()) {
		voskAccumulatedText = '';
		if (voskPartialTimer) {
			clearTimeout(voskPartialTimer);
			voskPartialTimer = null;
		}
	}

	stopInputMonitor();
	stopOutputMonitor();

	debugLogRenderer('Fim da função: "stopAudio"');
}

async function restartAudioPipeline() {
	debugLogRenderer('Início da função: "restartAudioPipeline"');

	stopAudio();

	debugLogRenderer('Fim da função: "restartAudioPipeline"');
}

/* ===============================
   AUDIO - VOLUME MONITORING
=============================== */

// Inicia apenas monitoramento de volume (sem gravar)
async function startInputVolumeMonitoring() {
	debugLogRenderer('Início da função: "startInputVolumeMonitoring"');

	if (APP_CONFIG.MODE_DEBUG) {
		console.log('🎤 Monitoramento de volume entrada (modo teste)...');
		return;
	}

	if (!UIElements.inputSelect?.value) {
		console.log('⚠️ Nenhum dispositivo input selecionado');
		return;
	}

	if (!audioContext) {
		audioContext = new AudioContext();
	}

	// 🔥 NOVO: Se já tem stream ativa, não faz nada
	if (inputStream && inputAnalyser) {
		console.log('ℹ️ Monitoramento de volume de entrada já ativo');
		return;
	}

	try {
		// Verificar se isRunning é false antes de iniciar o stream
		if (!isRunning) {
			console.log('🔄 Iniciando stream de áudio (input)...');

			inputStream = await navigator.mediaDevices.getUserMedia({
				audio: { deviceId: { exact: UIElements.inputSelect.value } },
			});

			const source = audioContext.createMediaStreamSource(inputStream);

			inputAnalyser = audioContext.createAnalyser();
			inputAnalyser.fftSize = 256;
			inputData = new Uint8Array(inputAnalyser.frequencyBinCount);
			source.connect(inputAnalyser);

			console.log('✅ Monitoramento de volume de entrada iniciado com sucesso');
			updateInputVolume(); // 🔥 Inicia o loop de atualização
		}
	} catch (error) {
		console.error('❌ Erro ao iniciar monitoramento de volume de entrada:', error);
		inputStream = null;
		inputAnalyser = null;
	}

	debugLogRenderer('Fim da função: "startInputVolumeMonitoring"');
}

// Inicia apenas monitoramento de volume para output (sem gravar)
async function startOutputVolumeMonitoring() {
	debugLogRenderer('Início da função: "startOutputVolumeMonitoring"');

	// Se o modo de debug estiver ativo, retorna
	if (APP_CONFIG.MODE_DEBUG) {
		console.log('🔊 Monitoramento de volume saída (modo teste)...');
		return;
	}

	// Se não houver dispositivo de saída selecionado, retorna
	if (!UIElements.outputSelect?.value) {
		console.log('⚠️ Nenhum dispositivo output selecionado');
		return;
	}

	// Se não houver contexto de áudio, cria um novo
	if (!audioContext) {
		audioContext = new AudioContext();
	}

	// Se já houver stream e analisador de frequência ativos, retorna
	if (outputStream && outputAnalyser) {
		console.log('ℹ️ Monitoramento de volume de saída já ativo');
		return;
	}

	try {
		// Se isRunning for false, inicia o stream de áudio (output)
		if (!isRunning) {
			console.log('🔄 Iniciando stream de áudio (output)...');

			// Cria a stream de áudio (outputStream)
			await createOutputStream();

			// Inicia o loop de atualização do volume de saída
			updateOutputVolume();
		}

		debugLogRenderer('Fim da função: "startOutputVolumeMonitoring"');
	} catch (error) {
		console.error('❌ Erro ao iniciar monitoramento de volume de saída:', error);

		// Limpa a stream e o analisador de frequência (outputStream e outputAnalyser)
		outputStream = null;
		outputAnalyser = null;
	}
}

function stopInputVolumeMonitoring() {
	debugLogRenderer('Início da função: "stopInputVolumeMonitoring"');

	// Se isRunning true, não para o monitoramento
	if (isRunning) {
		console.log('ℹ️ Monitoramento de volume de entrada em execução, isRunning = true — pulando parada');

		debugLogRenderer('Fim da função: "stopInputVolumeMonitoring"');
		return;
	}

	// 1. Para o loop de animação
	if (inputVolumeAnimationId) {
		cancelAnimationFrame(inputVolumeAnimationId);
		inputVolumeAnimationId = null;
	}

	// 2. Para as tracks de áudio para economizar energia/recurso
	if (inputStream) {
		inputStream.getTracks().forEach(track => track.stop());
		inputStream = null;
	}

	inputAnalyser = null;
	inputData = null;

	// 3. Zera a UI
	emitUIChange('onInputVolumeUpdate', { percent: 0 });

	console.log('🛑 Monitoramento de volume de entrada parado');

	debugLogRenderer('Fim da função: "stopInputVolumeMonitoring"');
}

function stopOutputVolumeMonitoring() {
	debugLogRenderer('Início da função: "stopOutputVolumeMonitoring"');

	// Se isRunning true, não para o monitoramento
	if (isRunning) {
		console.log('ℹ️ Monitoramento de volume de saída em execução, isRunning = true — pulando parada');

		debugLogRenderer('Fim da função: "stopOutputVolumeMonitoring"');
		return;
	}

	// 1. Para o loop de animação
	if (outputVolumeAnimationId) {
		cancelAnimationFrame(outputVolumeAnimationId);
		outputVolumeAnimationId = null;
	}

	// 2.Para as tracks de áudio para economizar energia/recurso
	if (outputStream) {
		outputStream.getTracks().forEach(track => track.stop());
		outputStream = null;
	}

	outputAnalyser = null;
	outputData = null;

	// 3. Zera a UI
	emitUIChange('onOutputVolumeUpdate', { percent: 0 });

	console.log('🛑 Monitoramento de volume de saída parado');

	debugLogRenderer('Fim da função: "stopOutputVolumeMonitoring"');
}

/* ===============================
   AUDIO - INPUT (VOCÊ)
=============================== */

async function startInput() {
	debugLogRenderer('Início da função: "startInput"');

	if (APP_CONFIG.MODE_DEBUG) {
		const text = 'Iniciando monitoramento de entrada de áudio (modo teste)...';
		addTranscript(YOU, text);
		return;
	}

	if (!UIElements.inputSelect?.value) return;

	if (!audioContext) {
		audioContext = new AudioContext();
	}

	// CRÍTICO: Evita recriar recorder E stream se já existem
	if (inputRecorder && inputRecorder.state !== 'inactive') {
		console.log('ℹ️ inputRecorder já existe e está ativo, pulando reconfiguração');
		return;
	}

	// Se já existe stream mas precisa reconfigurar, limpa primeiro
	if (inputStream) {
		console.log('🧹 Limpando stream de entrada anterior antes de recriar');
		inputStream.getTracks().forEach(t => t.stop());
		inputStream = null;
	}

	try {
		inputStream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: UIElements.inputSelect.value } },
		});

		const source = audioContext.createMediaStreamSource(inputStream);

		inputAnalyser = audioContext.createAnalyser();
		inputAnalyser.fftSize = 256;
		inputData = new Uint8Array(inputAnalyser.frequencyBinCount);
		source.connect(inputAnalyser);

		// recorder SEMPRE existe
		inputRecorder = new MediaRecorder(inputStream, {
			mimeType: 'audio/webm;codecs=opus',
		});

		inputRecorder.ondataavailable = e => {
			console.log('🔥 input.ondataavailable - chunk tamanho:', e.data?.size || e.data?.byteLength || 'n/a');

			inputChunks.push(e.data);

			// MODO ENTREVISTA – permite transcrição incremental
			if (ModeController.isInterviewMode()) {
				console.log('🧩 handlePartialInputChunk chamado (input)');
				handlePartialInputChunk(e.data);
			}
		};

		inputRecorder.onstop = () => {
			console.log('⏹️ inputRecorder.onstop chamado');

			// marca o momento exato em que a gravação parou
			lastInputStopAt = Date.now();
			const recordingDuration = lastInputStopAt - lastInputStartAt;
			console.log('⏱️ Parada:', new Date(lastInputStopAt).toLocaleTimeString());
			console.log('⏱️ Duração da gravação:', recordingDuration, 'ms');

			// Cancela qualquer timer pendente de transcrição parcial
			// Isso evita que handlePartialInputChunk processe chunks após onstop
			if (inputPartialTimer) {
				clearTimeout(inputPartialTimer);
				inputPartialTimer = null;
				console.log('⏱️ Cancelado timer de transcrição parcial (inputPartialTimer)');
			}

			// Limpa chunks parciais acumulados para evitar duplicação
			inputPartialChunks = [];
			console.log('🗑️ Limpos chunks parciais acumulados (inputPartialChunks)');

			// adiciona placeholder visual para indicar que estamos aguardando a transcrição
			// usa startAt se disponível para mostrar o horário inicial enquanto aguarda
			const timeForPlaceholder = lastInputStartAt || lastInputStopAt;
			lastInputPlaceholderEl = addTranscript(YOU, '...', timeForPlaceholder);
			if (lastInputPlaceholderEl) {
				lastInputPlaceholderEl.dataset.stopAt = lastInputStopAt;
				if (lastInputStartAt) lastInputPlaceholderEl.dataset.startAt = lastInputStartAt;
			}

			transcribeInput();
		};

		// Inicia loop de volume apenas se não estiver rodando
		if (!inputVolumeAnimationId) {
			updateInputVolume();
		}

		console.log('✅ startInput: Configurado com sucesso');
	} catch (error) {
		console.error('❌ Erro em startInput:', error);
		inputStream = null;
		inputRecorder = null;
		throw error;
	}

	debugLogRenderer('Fim da função: "startInput"');
}

function updateInputVolume() {
	//debugLogRenderer('Início da função: "updateInputVolume"');

	// CRÍTICO: Verifica se deve continuar ANTES de fazer qualquer processamento
	if (!inputAnalyser || !inputData) {
		console.log('⚠️ updateInputVolume: analyser ou data não disponível, parando loop');
		if (inputVolumeAnimationId) {
			cancelAnimationFrame(inputVolumeAnimationId);
			inputVolumeAnimationId = null;
		}
		emitUIChange('onInputVolumeUpdate', { percent: 0 });
		return;
	}

	try {
		inputAnalyser.getByteFrequencyData(inputData);
		const avg = inputData.reduce((a, b) => a + b, 0) / inputData.length;
		const percent = Math.min(100, Math.round((avg / 80) * 100));

		// Emite evento em vez de atualizar DOM diretamente
		emitUIChange('onInputVolumeUpdate', { percent });

		if (avg > INPUT_SPEECH_THRESHOLD && inputRecorder && isRunning) {
			if (!inputSpeaking) {
				inputSpeaking = true;
				inputChunks = [];

				const slice = ModeController.mediaRecorderTimeslice();
				lastInputStartAt = Date.now();
				console.log(
					'🎙️ iniciando gravação de entrada (inputRecorder.start) - startAt',
					new Date(lastInputStartAt).toLocaleTimeString(),
				);
				slice ? inputRecorder.start(slice) : inputRecorder.start();
			}
			if (inputSilenceTimer) {
				clearTimeout(inputSilenceTimer);
				inputSilenceTimer = null;
			}
		} else if (inputSpeaking && !inputSilenceTimer && inputRecorder) {
			inputSilenceTimer = setTimeout(() => {
				inputSpeaking = false;
				inputSilenceTimer = null;
				console.log('⏹️ parando gravação de entrada por silêncio (inputRecorder.stop)');
				if (inputRecorder && inputRecorder.state === 'recording') {
					inputRecorder.stop();
				}
			}, INPUT_SILENCE_TIMEOUT);
		}
	} catch (error) {
		console.error('❌ Erro em updateInputVolume:', error);
		if (inputVolumeAnimationId) {
			cancelAnimationFrame(inputVolumeAnimationId);
			inputVolumeAnimationId = null;
		}
		emitUIChange('onInputVolumeUpdate', { percent: 0 });
		return;
	}

	// Continua o loop apenas se tudo estiver OK
	inputVolumeAnimationId = requestAnimationFrame(updateInputVolume);

	//debugLogRenderer('Fim da função: "updateInputVolume"');
}

function stopInputMonitor() {
	debugLogRenderer('Início da função: "stopInputMonitor"');

	// 1. Para o loop de animation PRIMEIRO
	if (inputVolumeAnimationId) {
		cancelAnimationFrame(inputVolumeAnimationId);
		inputVolumeAnimationId = null;
		console.log('✅ Loop de animação de entrada cancelado');
	}

	// 2. Para o recorder se estiver gravando
	if (inputRecorder) {
		if (inputRecorder.state === 'recording') {
			console.log('⏹️ Parando recorder de entrada...');
			inputRecorder.stop();
		}
		inputRecorder = null;
	}

	// 3. Fecha a stream
	if (inputStream) {
		inputStream.getTracks().forEach(t => {
			t.stop();
			console.log('✅ Track de entrada parada:', t.label);
		});
		inputStream = null;
	}

	// 4. Limpa analyser e dados
	inputAnalyser = null;
	inputData = null;

	// 5. Reseta estado
	inputSpeaking = false;
	if (inputSilenceTimer) {
		clearTimeout(inputSilenceTimer);
		inputSilenceTimer = null;
	}

	// 6. Atualiza UI
	emitUIChange('onInputVolumeUpdate', { percent: 0 });

	debugLogRenderer('Fim da função: "stopInputMonitor"');
	return Promise.resolve();
}

/* ===============================
   AUDIO - OUTPUT (OUTROS) - VIA VOICEMEETER
=============================== */

async function createOutputStream() {
	debugLogRenderer('Início da função: "createOutputStream"');

	// Cria a stream de áudio (outputStream)
	outputStream = await navigator.mediaDevices.getUserMedia({
		audio: { deviceId: { exact: UIElements.outputSelect.value } },
	});

	// Cria o source de áudio (source)
	const source = audioContext.createMediaStreamSource(outputStream);

	// Cria o analisador de frequência (outputAnalyser)
	outputAnalyser = audioContext.createAnalyser();
	// Define o tamanho do FFT (fftSize) como 256
	outputAnalyser.fftSize = 256;
	// Cria os dados (outputData)
	outputData = new Uint8Array(outputAnalyser.frequencyBinCount);
	// Conecta o source ao analisador de frequência
	source.connect(outputAnalyser);

	debugLogRenderer('Fim da função: "createOutputStream"');

	return source;
}

async function startOutput() {
	debugLogRenderer('Início da função: "startOutput"');

	// Se o modo de debug estiver ativo, retorna
	if (APP_CONFIG.MODE_DEBUG) {
		const text = 'Iniciando monitoramento de saída de áudio (modo teste)...';
		addTranscript(OTHER, text);
		return;
	}

	// Se não houver dispositivo de saída selecionado, retorna
	if (!UIElements.outputSelect?.value) {
		console.log('⚠️ Nenhum dispositivo output selecionado');
		return;
	}

	// Se não houver contexto de áudio, cria um novo
	if (!audioContext) {
		audioContext = new AudioContext();
	}

	// Se já houver outputRecorder e ele estiver ativo, retorna
	if (outputRecorder && outputRecorder.state !== 'inactive') {
		console.log('ℹ️ outputRecorder já existe e está ativo, pulando reconfiguração');
		return;
	}

	// Se já houver outputStream, limpa primeiro
	if (outputStream) {
		console.log('🧹 Limpando stream de saída anterior antes de recriar');
		outputStream.getTracks().forEach(t => t.stop());
		outputStream = null;
	}

	try {
		console.log('🔄 startOutput: Configurando monitoramento de saída de áudio...');

		// Cria a stream de áudio (outputStream)
		await createOutputStream();

		// Cria o recorder (outputRecorder), recorder SEMPRE existe
		outputRecorder = new MediaRecorder(outputStream, {
			mimeType: 'audio/webm;codecs=opus',
		});

		// Define o callback para quando houver dados disponíveis no outputRecorder, acionado ao chamar outputRecorder.start()
		outputRecorder.ondataavailable = e => {
			console.log(
				'🔥 outputRecorder.ondataavailable chamado - chunk tamanho:',
				e.data?.size || e.data?.byteLength || 'n/a',
			);

			// Adiciona o chunk (pedaços de dados) ao array de chunks de saída
			outputChunks.push(e.data);

			// MODO ENTREVISTA – permite transcrição incremental
			if (ModeController.isInterviewMode()) {
				console.log('🧩 handlePartialOutputChunk chamado (output)');
				handlePartialOutputChunk(e.data);
			}
		};

		// Define o callback para quando o outputRecorder for parado, acionado ao chamar outputRecorder.stop()
		outputRecorder.onstop = () => {
			console.log('⏹️ outputRecorder.onstop chamado');

			// Marca o momento exato em que a gravação parou
			lastOutputStopAt = Date.now();
			const recordingDuration = lastOutputStopAt - lastOutputStartAt;
			console.log('⏱️ Parada: ' + new Date(lastOutputStopAt).toLocaleTimeString());
			console.log('⏱️ Duração da gravação:', recordingDuration, 'ms');

			// Cancela qualquer timer pendente de transcrição parcial
			// Isso evita que transcribeOutputPartial processe chunks após onstop
			if (outputPartialTimer) {
				clearTimeout(outputPartialTimer);
				outputPartialTimer = null;
				console.log('⏱️ Cancelado timer de transcrição parcial (outputPartialTimer)');
			}

			// Limpa chunks parciais acumulados para evitar duplicação
			outputPartialChunks = [];
			console.log('🗑️ Limpos chunks parciais acumulados (outputPartialChunks)');

			// Fluxo padrão (Whisper): Adiciona placeholder visual para indicar que estamos aguardando a transcrição
			const timeForPlaceholder = lastOutputStartAt || lastOutputStopAt;
			lastOutputPlaceholderEl = addTranscript(OTHER, '...', timeForPlaceholder);

			// Se o placeholder foi criado, define os atributos de startAt e stopAt
			if (lastOutputPlaceholderEl) {
				lastOutputPlaceholderEl.dataset.stopAt = lastOutputStopAt;
				if (lastOutputStartAt) lastOutputPlaceholderEl.dataset.startAt = lastOutputStartAt;
			}

			// Inicia a transcrição do áudio de saída (Whisper)
			transcribeOutput();
		};

		// Inicia o loop de atualização do volume de saída, se não estiver rodando
		if (!outputVolumeAnimationId) {
			updateOutputVolume();
		}

		console.log('✅ startOutput: Monitoramento de saída de áudio configurado com sucesso');
	} catch (error) {
		console.error('❌ Erro em startOutput:', error);

		outputStream = null;
		outputRecorder = null;
		throw error;
	}

	debugLogRenderer('Fim da função: "startOutput"');
}

function updateOutputVolume() {
	//debugLogRenderer('Início da função: "updateOutputVolume"');

	// Crítico: Verifica se o analisador de frequência (outputAnalyser) e os dados (outputData)
	// estão disponíveis antes de continuar o loop de animação
	if (!outputAnalyser || !outputData) {
		console.log('⚠️ updateOutputVolume: outputAnalyser ou outputData não disponível, parando loop de animação');

		// Se o loop de animação (outputVolumeAnimationId) estiver definido, limpa o loop de animação
		if (outputVolumeAnimationId) {
			// Para o loop de animação
			cancelAnimationFrame(outputVolumeAnimationId);
			// Limpa o loop de animação
			outputVolumeAnimationId = null;
		}

		// Emite o evento 'onOutputVolumeUpdate' para atualizar o volume de saída
		emitUIChange('onOutputVolumeUpdate', { percent: 0 });

		return;
	}

	try {
		// Obtém os dados do analisador de frequência (outputAnalyser)
		outputAnalyser.getByteFrequencyData(outputData);
		// Calcula o volume médio (avg) dos dados do analisador de frequência (outputData)
		const avg = outputData.reduce((a, b) => a + b, 0) / outputData.length;
		// Calcula o percentual de volume (percent) dos dados do analisador de frequência (outputData)
		const percent = Math.min(100, Math.round((avg / 60) * 100));

		// Emite o evento 'onOutputVolumeUpdate' para atualizar o volume de saída
		emitUIChange('onOutputVolumeUpdate', { percent });

		// Se o volume médio (avg) estiver acima do limite (OUTPUT_SPEECH_THRESHOLD)
		// e o recorder (outputRecorder) estiver rodando e o isRunning for true, inicia a gravação de saída
		if (avg > OUTPUT_SPEECH_THRESHOLD && outputRecorder && isRunning) {
			// Se o outputSpeaking for false, inicia a gravação de saída
			if (!outputSpeaking) {
				// Define o estado de outputSpeaking como true
				outputSpeaking = true;
				// Limpa o array de chunks de saída
				outputChunks = [];

				// Define o momento exato em que a gravação de saída foi iniciada
				lastOutputStartAt = Date.now();

				console.log('🎙️ Início: ' + new Date(lastOutputStartAt).toLocaleTimeString());

				// Usar o mesmo timeslice que INPUT para manter consistência
				const slice = ModeController.mediaRecorderTimeslice();
				slice ? outputRecorder.start(slice) : outputRecorder.start();
			}
			if (outputSilenceTimer) {
				clearTimeout(outputSilenceTimer);
				outputSilenceTimer = null;
			}
		} else if (outputSpeaking && !outputSilenceTimer && outputRecorder) {
			// Define o timer de silêncio (outputSilenceTimer)
			outputSilenceTimer = setTimeout(() => {
				// Define o estado de outputSpeaking como false
				outputSpeaking = false;
				// Limpa o timer de silêncio (outputSilenceTimer)
				outputSilenceTimer = null;

				console.log('⏹️ parando gravação de saída por silêncio (outputRecorder.stop)');

				// Se o recorder (outputRecorder) estiver rodando, para a gravação de saída
				if (outputRecorder && outputRecorder.state === 'recording') {
					// Para a gravação de saída
					outputRecorder.stop();
				}
			}, OUTPUT_SILENCE_TIMEOUT); // Tempo de espera para silêncio
		}
	} catch (error) {
		console.error('❌ Erro em updateOutputVolume:', error);
		// Se o loop de animação (outputVolumeAnimationId) estiver definido, limpa o loop de animação
		if (outputVolumeAnimationId) {
			// Para o loop de animação
			cancelAnimationFrame(outputVolumeAnimationId);
			// Limpa o loop de animação
			outputVolumeAnimationId = null;
		}
		// Emite o evento 'onOutputVolumeUpdate' para atualizar o volume de saída
		emitUIChange('onOutputVolumeUpdate', { percent: 0 });
		return;
	}

	// Continua o loop de animação apenas se tudo estiver OK
	outputVolumeAnimationId = requestAnimationFrame(updateOutputVolume);

	//debugLogRenderer('Fim da função: "updateOutputVolume"');
}

function stopOutputMonitor() {
	debugLogRenderer('Início da função: "stopOutputMonitor"');

	// 1. Para o loop de animation PRIMEIRO
	if (outputVolumeAnimationId) {
		cancelAnimationFrame(outputVolumeAnimationId);
		outputVolumeAnimationId = null;
		console.log('✅ Loop de animação de saída cancelado');
	}

	// 2. Para o recorder se estiver gravando
	if (outputRecorder) {
		if (outputRecorder.state === 'recording') {
			console.log('⏹️ Parando recorder de saída...');
			outputRecorder.stop();
		}
		outputRecorder = null;
	}

	// 3. Fecha a stream
	if (outputStream) {
		outputStream.getTracks().forEach(t => {
			t.stop();
			console.log('✅ Track de saída parada:', t.label);
		});
		outputStream = null;
	}

	// 4. Limpa analyser e dados
	outputAnalyser = null;
	outputData = null;

	// 5. Reseta estado
	outputSpeaking = false;
	if (outputSilenceTimer) {
		clearTimeout(outputSilenceTimer);
		outputSilenceTimer = null;
	}

	// 6. Atualiza UI
	emitUIChange('onOutputVolumeUpdate', { percent: 0 });

	debugLogRenderer('Fim da função: "stopOutputMonitor"');
	return Promise.resolve();
}

/* ===============================
   MODO ENTREVISTA - TRANSCRIÇÃO PARCIAL
=============================== */

async function handlePartialInputChunk(blobChunk) {
	debugLogRenderer('Início da função: "handlePartialInputChunk"');
	if (!ModeController.isInterviewMode()) return;

	// ignora ruído
	if (blobChunk.size < 200) return;

	inputPartialChunks.push(blobChunk);

	if (inputPartialTimer) clearTimeout(inputPartialTimer);

	inputPartialTimer = setTimeout(async () => {
		if (!inputPartialChunks.length) return;

		const blob = new Blob(inputPartialChunks, { type: 'audio/webm' });
		inputPartialChunks = [];

		try {
			const buffer = Buffer.from(await blob.arrayBuffer());
			const partialText = (await transcribeAudioPartial(blob))?.trim();

			if (partialText && !isGarbageSentence(partialText)) {
				addTranscript(YOU, partialText);
				handleSpeech(YOU, partialText);
			}
		} catch (err) {
			console.warn('⚠️ erro na transcrição parcial (INPUT)', err);
		}
	}, 180); // janela curta (reduzida de 250 -> 180)

	debugLogRenderer('Fim da função:  "handlePartialInputChunk"');
}

async function handlePartialOutputChunk(blobChunk) {
	debugLogRenderer('Início da função: "handlePartialOutputChunk"');
	if (!ModeController.isInterviewMode()) return;

	// ignora ruído
	if (blobChunk.size < 200) return;

	outputPartialChunks.push(blobChunk);

	if (outputPartialTimer) clearTimeout(outputPartialTimer);

	outputPartialTimer = setTimeout(async () => {
		if (!outputPartialChunks.length) return;

		const blob = new Blob(outputPartialChunks, { type: 'audio/webm' });
		outputPartialChunks = [];

		try {
			const buffer = Buffer.from(await blob.arrayBuffer());
			const partialText = (await transcribeAudioPartial(blob))?.trim();

			if (partialText && !isGarbageSentence(partialText)) {
				addTranscript(OTHER, partialText);
				// NÃO chamar handleSpeech aqui - evita consolidação nas parciais
				// consolidação só acontece em transcribeOutput() para o áudio final
			}
		} catch (err) {
			console.warn('⚠️ erro na transcrição parcial (OUTPUT)', err);
		}
	}, 180); // janela curta (reduzida de 250 -> 180)

	debugLogRenderer('Fim da função:  "handlePartialOutputChunk"');
}

function transcribeOutputPartial(blobChunk) {
	debugLogRenderer('Início da função: "transcribeOutputPartial"');

	// Se não estiver no modo entrevista, retorna
	if (!ModeController.isInterviewMode()) {
		console.log('ℹ️ transcribeOutputPartial: retornando, modo entrevista não ativo');

		debugLogRenderer('Fim da função: "transcribeOutputPartial"');
		return;
	}

	// Desabilitado temporariamente (teste)
	if (DESABILITADO_TEMPORARIAMENTE) {
		debugLogRenderer('Fim da função: "transcribeOutputPartial" 🔒 DESABILITADO TEMPORARIAMENTE');
		return;
	}

	// MODO ENTREVISTA – permite transcrição incremental

	// Ignora ruído, evita blobs pequenos demais
	if (blobChunk.size < MIN_OUTPUT_AUDIO_SIZE_INTERVIEW) {
		console.log('⚠️ Ignorando blobChunk pequeno demais para transcrição parcial (OUTPUT) - size:', blobChunk.size);

		debugLogRenderer('Fim da função: "transcribeOutputPartial"');
		return;
	}

	// Adiciona o chunk ao array de chunks parciais de saída
	outputPartialChunks.push(blobChunk);
	console.log('📦 Chunk acumulado:', blobChunk.size, 'bytes | Total chunks:', outputPartialChunks.length);

	// Reinicia o timer para processar o chunk parcial após um curto período
	if (outputPartialTimer) clearTimeout(outputPartialTimer);

	// calcula delay respeitando um intervalo mínimo entre requisições STT parciais
	const now = Date.now();
	const elapsedSinceLast = typeof lastPartialSttAt === 'number' ? now - lastPartialSttAt : Infinity;
	let intendedDelay = 120; // janela base para agrupar chunks
	if (elapsedSinceLast < PARTIAL_MIN_INTERVAL_MS) {
		intendedDelay = PARTIAL_MIN_INTERVAL_MS - elapsedSinceLast + 50; // pequeno buffer extra
		console.log('⏱️ Ajustando delay parcial para respeitar rate-limit (ms):', intendedDelay);
	}

	// Define um timer para processar o chunk parcial após X(ms)
	// Timeout curto (300ms) para agrupar ~5-8 chunks e enviar rápido para STT
	outputPartialTimer = setTimeout(async () => {
		// Se não houver chunks parciais de saída, retorna
		if (!outputPartialChunks.length) {
			console.log('⚠️ Nenhum chunk parcial para processar');
			return;
		}

		// Cria um blob a partir dos chunks parciais de saída
		const blob = new Blob(outputPartialChunks, { type: 'audio/webm' });

		// Loga o tamanho total do blob parcial
		const totalSize = outputPartialChunks.reduce((acc, chunk) => acc + chunk.size, 0);
		console.log('🎵 Processando blob parcial:', totalSize, 'bytes de', outputPartialChunks.length, 'chunks');

		// Limpa o array de chunks parciais de saída após criar blob
		outputPartialChunks = [];

		try {
			// Envia para transcrição o blob parcial de saída
			const partialText = await transcribeAudioPartial(blob);
			// marca último envio parcial
			lastPartialSttAt = Date.now();
			console.log('📝 transcribeOutputPartial: Transcrição recebida: ', partialText);

			// Ignora transcrição vazia
			if (!partialText || partialText.trim().length === 0) {
				console.log('⚠️ Transcrição vazia - ignorando');
				return;
			}

			// Ignora sentenças garbage
			if (isGarbageSentence(partialText)) {
				console.log('🗑️ Sentença descartada (garbage):', partialText);
				return;
			}

			// acumula texto parcial
			outputPartialText += ' ' + partialText;
			outputPartialText = outputPartialText.trim();
			console.log('📋 Texto acumulado:', outputPartialText);

			// Atualiza UI com transcrição parcial imediatamente (usa placeholder incremental)
			try {
				// cria placeholder se ainda não existe (usa startAt se disponível)
				if (!lastOutputPlaceholderEl) {
					const placeholderTime = lastOutputStartAt || Date.now();
					lastOutputPlaceholderEl = addTranscript(OTHER, '...', placeholderTime);
					if (lastOutputPlaceholderEl && lastOutputPlaceholderEl.dataset) {
						lastOutputPlaceholderEl.dataset.startAt = placeholderTime;
						// marca um stop provisório para o UI mostrar intervalo dinâmico
						lastOutputPlaceholderEl.dataset.stopAt = Date.now();
					}
				} else if (lastOutputPlaceholderEl && lastOutputPlaceholderEl.dataset) {
					// atualiza stop provisório a cada parcial
					lastOutputPlaceholderEl.dataset.stopAt = Date.now();
				}

				// solicita ao config-manager atualização parcial do placeholder (inclui métricas provisórias)
				emitUIChange('onPlaceholderUpdate', {
					speaker: OTHER,
					text: outputPartialText,
					timeStr: new Date(lastOutputStartAt || Date.now()).toLocaleTimeString(),
					startStr: new Date(lastOutputStartAt || Date.now()).toLocaleTimeString(),
					stopStr: new Date().toLocaleTimeString(),
					recordingDuration: Date.now() - (lastOutputStartAt || Date.now()),
					latency: 0,
					total: Date.now() - (lastOutputStartAt || Date.now()),
					provisional: true,
				});

				// atualiza currentQuestion para refletir texto parcial
				if (
					!currentQuestion.text ||
					normalizeForCompare(currentQuestion.text) !== normalizeForCompare(outputPartialText)
				) {
					currentQuestion.text = outputPartialText;
					currentQuestion.lastUpdate = Date.now();
					currentQuestion.lastUpdateTime = Date.now();
					currentQuestion.finalized = false;
					selectedQuestionId = CURRENT_QUESTION_ID;
					renderCurrentQuestion();
				}
			} catch (err) {
				console.warn('⚠️ falha ao atualizar UI com transcrição parcial:', err);
			}

			// verifica se a pergunta está "pronta" (heurística)
			if (isQuestionReady(outputPartialText)) {
				console.log('❓ Pergunta detectada (parcial):', outputPartialText);

				// limpa texto parcial acumulado
				const newText = outputPartialText.trim();

				// verifica se o novo texto é igual ao texto atual da pergunta, se sim, ignora
				if (newText === currentQuestion.text) {
					// 🟡 No modo entrevista, se a pergunta ainda NÃO foi fechada,
					// permitimos seguir para fechamento e chamada do GPT
					if (!currentQuestion.finalized) {
						console.log('🟡 Pergunta repetida, mas válida no modo entrevista — permitindo fechamento');
					} else {
						console.log('🔕 Ignorando nova transcrição igual à currentQuestion');
						return;
					}
				}

				// se currentQuestion ainda não tinha texto, marca como um novo turno
				if (!currentQuestion.text) {
					currentQuestion.createdAt = Date.now();
					interviewTurnId++; // novo turno detectado
					console.log('🆕 Novo turno iniciado:', interviewTurnId);
				}

				// atualiza a pergunta atual com o novo texto parcial
				currentQuestion.text = newText;
				// atualiza timestamp de última modificação
				currentQuestion.lastUpdate = Date.now();
				currentQuestion.lastUpdateTime = Date.now();
				// marca como não finalizada
				currentQuestion.finalized = false;

				// atualiza UI
				selectedQuestionId = CURRENT_QUESTION_ID;
				renderCurrentQuestion();

				console.log('🧠 currentQuestion (parcial):', currentQuestion.text);
				console.log('🎯 interviewTurnId:', interviewTurnId);
				console.log('🤖 gptAnsweredTurnId:', gptAnsweredTurnId);

				// reseta o timer de auto fechamento
				if (autoCloseQuestionTimer) {
					clearTimeout(autoCloseQuestionTimer);
				}

				// ⏱️ agenda timer para auto fechamento da pergunta após período ocioso
				autoCloseQuestionTimer = setTimeout(() => {
					console.log('⏱️ Auto close question disparado (timeout)');

					if (
						ModeController.isInterviewMode() &&
						currentQuestion.text &&
						!currentQuestion.finalized &&
						gptAnsweredTurnId !== interviewTurnId
					) {
						// fecha a pergunta atual automaticamente
						closeCurrentQuestion();
					}
				}, QUESTION_IDLE_TIMEOUT);

				console.log('⏲️ Timer de auto-fechamento agendado para', QUESTION_IDLE_TIMEOUT, 'ms');
			} else {
				console.log('⏳ Aguardando mais texto para formar pergunta completa');
			}
		} catch (err) {
			console.error('❌ Erro na transcrição parcial (OUTPUT):', err);
		}
	}, 300); // Janela de 300ms para máxima responsividade - envia ~5-8 chunks a cada 3s (rate-limit)

	debugLogRenderer('Fim da função: "transcribeOutputPartial"');
}

/* ===============================
   MODO NORMAL - TRANSCRIÇÃO
=============================== */

async function transcribeInput() {
	debugLogRenderer('Início da função: "transcribeInput"');
	if (!inputChunks.length) return;

	const blob = new Blob(inputChunks, { type: 'audio/webm' });
	console.log('🔁 transcrever entrada - blob.size:', blob.size); // diagnóstico

	// ignora ruído / respiração
	const minSize = ModeController.isInterviewMode() ? MIN_INPUT_AUDIO_SIZE_INTERVIEW : MIN_INPUT_AUDIO_SIZE;

	if (blob.size < minSize) return;

	inputChunks = [];

	// medir tempo de conversão blob -> buffer
	const tBlobToBuffer = Date.now();
	const buffer = Buffer.from(await blob.arrayBuffer());
	console.log('timing: bufferConv', Date.now() - tBlobToBuffer, 'ms, size', buffer.length);

	// medir tempo IPC + STT (roundtrip)
	const tSend = Date.now();
	const text = (await transcribeAudio(blob))?.trim();
	console.log('timing: ipc_stt_roundtrip', Date.now() - tSend, 'ms');
	if (!text || isGarbageSentence(text)) return;

	// Se existia um placeholder (timestamp do stop), calcula métricas e emite evento para atualizar
	if (lastInputPlaceholderEl && lastInputPlaceholderEl.dataset) {
		const stop = lastInputPlaceholderEl.dataset.stopAt
			? Number(lastInputPlaceholderEl.dataset.stopAt)
			: lastInputStopAt;
		const start = lastInputPlaceholderEl.dataset.startAt
			? Number(lastInputPlaceholderEl.dataset.startAt)
			: lastInputStartAt || stop;
		const now = Date.now();
		const recordingDuration = stop - start;
		const latency = now - stop;
		const total = now - start;
		const startStr = new Date(start).toLocaleTimeString();
		const stopStr = new Date(stop).toLocaleTimeString();
		const displayStr = new Date(now).toLocaleTimeString();

		// Log detalhado de timing
		console.log('⏱️ TIMING COMPLETO:');
		console.log(`  ✅ Início: ${startStr}`);
		console.log(`  ⏹️ Parada: ${stopStr}`);
		console.log(`  📺 Exibição: ${displayStr}`);
		console.log(`  📊 Duração gravação: ${recordingDuration}ms | Latência: ${latency}ms | Total: ${total}ms`);

		// Emite para config-manager atualizar o placeholder com texto final e métricas
		emitUIChange('onPlaceholderFulfill', {
			speaker: YOU,
			text,
			stopStr,
			startStr,
			recordingDuration,
			latency,
			total,
		});

		lastInputPlaceholderEl = null;
		lastInputStopAt = null;
		lastInputStartAt = null;
	} else {
		addTranscript(YOU, text);
	}

	handleSpeech(YOU, text);

	debugLogRenderer('Fim da função: "transcribeInput"');
}

async function transcribeOutput() {
	debugLogRenderer('Início da função: "transcribeOutput"');

	// Desabilitado temporariamente (teste)
	if (DESABILITADO_TEMPORARIAMENTE) {
		debugLogRenderer('Fim da função: "transcribeOutput" 🔒 DESABILITADO TEMPORARIAMENTE');
		return;
	}

	// Se não houver chunks de saída, retorna
	if (!outputChunks.length) {
		console.log('⚠️ transcribeOutput: nenhum chunk de saída disponível');

		debugLogRenderer('Fim da função: "transcribeOutput"');
		return;
	}

	// Cria um blob a partir dos chunks de saída
	const blob = new Blob(outputChunks, { type: 'audio/webm' });
	console.log('🎵 transcribeOutput: blob.size =', blob.size, 'bytes | chunks =', outputChunks.length);

	// Valida tamanho mínimo dependendo do modo (evita ruído / respiração)
	const minSize = ModeController.isInterviewMode() ? MIN_OUTPUT_AUDIO_SIZE_INTERVIEW : MIN_OUTPUT_AUDIO_SIZE;
	if (blob.size < minSize) {
		console.log('⚠️ transcribeOutput: Blob muito pequeno (', blob.size, '/', minSize, ') - ignorando');

		debugLogRenderer('Fim da função: "transcribeOutput"');
		return;
	}

	// Limpa o array de chunks de saída
	outputChunks = [];

	try {
		// Envia para transcrição o blob de saída
		const text = await transcribeAudio(blob);
		console.log('📝 transcribeOutput: Transcrição recebida: ', text);

		// Ignora transcrição vazia
		if (!text || text.trim().length === 0) {
			console.log('⚠️ transcribeOutput: Transcrição vazia - ignorando');
			return;
		}

		// Ignora sentenças garbage
		if (isGarbageSentence(text)) {
			console.log('🗑️ transcribeOutput: Sentença descartada (garbage):', text);
			return;
		}

		// Se existia um placeholder (timestamp do stop), atualiza esse placeholder com o texto final e latência
		if (lastOutputPlaceholderEl && lastOutputPlaceholderEl.dataset) {
			console.log('🔄 Atualizando placeholder com transcrição final...');

			// obtém os timestamps de stop do dataset do placeholder, ou usa os valores globais
			const stop = lastOutputPlaceholderEl.dataset.stopAt
				? Number(lastOutputPlaceholderEl.dataset.stopAt)
				: lastOutputStopAt;

			// obtém os timestamps de start do dataset do placeholder, ou usa os valores globais
			const start = lastOutputPlaceholderEl.dataset.startAt
				? Number(lastOutputPlaceholderEl.dataset.startAt)
				: lastOutputStartAt || stop;

			// calcula métricas
			const now = Date.now();
			const recordingDuration = stop - start;
			const latency = now - stop;
			const total = now - start;
			const startStr = new Date(start).toLocaleTimeString();
			const stopStr = new Date(stop).toLocaleTimeString();
			const displayStr = new Date(now).toLocaleTimeString();

			// Log detalhado de timing
			console.log('⏱️ TIMING COMPLETO (Output):');
			console.log(`  ✅ Início: ${startStr}`);
			console.log(`  ⏹️ Parada: ${stopStr}`);
			console.log(`  📺 Exibição: ${displayStr}`);
			console.log(`  📊 Duração gravação: ${recordingDuration}ms | Latência: ${latency}ms | Total: ${total}ms`);

			// Emite atualização de UI ao placeholder com texto final e métricas
			emitUIChange('onPlaceholderFulfill', {
				speaker: OTHER,
				text,
				stopStr,
				startStr,
				recordingDuration,
				latency,
				total,
			});

			// reseta variáveis de placeholder
			lastOutputPlaceholderEl = null;
			lastOutputStopAt = null;
			lastOutputStartAt = null;

			// processa a fala transcrita (consolidação de perguntas)
			// Usa Date.now() para pegar o tempo exato que chegou no renderer
			handleSpeech(OTHER, text);
		} else {
			addTranscript(OTHER, text);

			// Sem placeholder - cria placeholder e emite fulfill para garantir métricas
			console.log('➕ Nenhum placeholder existente - criando e preenchendo com métricas');
			// obtém timestamps de fallback
			const stop = lastOutputStopAt || Date.now();
			const start = lastOutputStartAt || stop;
			const now = Date.now();
			const recordingDuration = stop - start;
			const latency = now - stop;
			const total = now - start;
			const startStr = new Date(start).toLocaleTimeString();
			const stopStr = new Date(stop).toLocaleTimeString();
			const displayStr = new Date(now).toLocaleTimeString();

			// Log detalhado de timing
			console.log('⏱️ TIMING COMPLETO (Output):');
			console.log(`  ✅ Início: ${startStr}`);
			console.log(`  ⏹️ Parada: ${stopStr}`);
			console.log(`  📺 Exibição: ${displayStr}`);
			console.log(`  📊 Duração gravação: ${recordingDuration}ms | Latência: ${latency}ms | Total: ${total}ms`);

			// cria um placeholder visível antes de preencher (garante consistência com fluxo parcial)
			const placeholderEl = addTranscript(OTHER, '...', start);

			if (placeholderEl && placeholderEl.dataset) {
				placeholderEl.dataset.startAt = start;
				placeholderEl.dataset.stopAt = stop;
			}

			// Emite atualização final para preencher o placeholder com texto e métricas
			emitUIChange('onPlaceholderFulfill', {
				speaker: OTHER,
				text,
				stopStr,
				startStr,
				recordingDuration,
				latency,
				total,
			});

			// reseta variáveis de placeholder
			lastOutputPlaceholderEl = null;
			lastOutputStopAt = null;
			lastOutputStartAt = null;

			// processa a fala transcrita (consolidação de perguntas)
			// Usa Date.now() para pegar o tempo exato que chegou no renderer
			handleSpeech(OTHER, text);
		}

		// MODO ENTREVISTA: Se a transcrição final indicar claramente uma pergunta, fechar e enviar ao GPT imediatamente
		// if (ModeController.isInterviewMode() && isQuestionReady(text)) {
		// 	console.log('🔔 transcribeOutput: Transcrição final forma pergunta válida');
		// 	console.log('   → Fechando pergunta e chamando GPT agora');

		// 	// limpa estado parcial e cancela o temporizador automático para evitar duplicatas
		// 	outputPartialText = '';

		// 	// cancela o temporizador automático para evitar duplicatas
		// 	if (autoCloseQuestionTimer) {
		// 		clearTimeout(autoCloseQuestionTimer);
		// 		autoCloseQuestionTimer = null;
		// 		console.log('   → Timer automático cancelado');
		// 	}

		// 	// fecha a pergunta atual imediatamente
		// 	closeCurrentQuestion();
		// }
	} catch (err) {
		console.warn('⚠️ erro na transcrição (OUTPUT)', err);
	}

	debugLogRenderer('Fim da função: "transcribeOutput"');
}

/* ===============================
   CONSOLIDAÇÃO DE PERGUNTAS
=============================== */

function handleSpeech(author, text) {
	debugLogRenderer('Início da função: "handleSpeech"');
	const cleaned = text.replace(/Ê+|hum|ahn/gi, '').trim();
	console.log('🔊 handleSpeech', { author, raw: text, cleaned });
	if (cleaned.length < 3) return;

	// Usa o tempo exato que chegou no renderer (Date.now)
	const now = Date.now();

	if (author === OTHER) {
		// 👉 Se já existe uma pergunta finalizada,
		//    significa que uma NOVA pergunta começou
		if (currentQuestion.finalized) {
			console.log(
				'ℹ️ Questão anterior finalizada — promovendo para a história e continuando a processar o novo discurso.',
			);
			promoteCurrentToHistory(currentQuestion.text);
		}

		// 🧠 Detecta início de NOVA pergunta e fecha a anterior
		if (
			currentQuestion.text &&
			looksLikeQuestion(cleaned) &&
			now - currentQuestion.lastUpdate > 500 &&
			!currentQuestion.finalized
		) {
			closeCurrentQuestion();
		}

		if (!currentQuestion.text) {
			// evita criar novo turno se a transcrição final for igual à última pergunta já enviada
			if (lastSentQuestionText && cleaned.trim() === lastSentQuestionText) {
				console.log('🔕 transcrição igual à última pergunta enviada — ignorando novo turno');
				return;
			}
			currentQuestion.createdAt = Date.now();
			currentQuestion.lastUpdateTime = Date.now();
			interviewTurnId++; // 🔥 novo turno
		}

		// evita duplicação quando a mesma frase parcial/final chega novamente
		if (currentQuestion.text && normalizeForCompare(currentQuestion.text) === normalizeForCompare(cleaned)) {
			console.log('🔁 speech igual ao currentQuestion — ignorando concatenação');
		} else {
			currentQuestion.text += (currentQuestion.text ? ' ' : '') + cleaned;
			currentQuestion.lastUpdateTime = now;
		}
		currentQuestion.lastUpdate = now;

		// 🟦 CURRENT vira seleção padrão ao receber fala
		if (!selectedQuestionId) {
			selectedQuestionId = CURRENT_QUESTION_ID;
			clearAllSelections();
		}

		renderCurrentQuestion();
	}

	debugLogRenderer('Fim da função: "handleSpeech"');
}

/* ===============================
   FECHAMENTO DE PERGUNTAS
=============================== */

function closeCurrentQuestion() {
	debugLogRenderer('Início da função: "closeCurrentQuestion"');

	// 🔒 GUARDA ABSOLUTA:
	// Se a pergunta já foi finalizada, NÃO faça nada.
	if (currentQuestion.finalized) {
		console.log('⛔ closeCurrentQuestion ignorado — pergunta já finalizada');
		return;
	}

	// Garante que lastUpdateTime seja definido quando se tenta fechar
	if (!currentQuestion.lastUpdateTime && currentQuestion.text) {
		currentQuestion.lastUpdateTime = Date.now();
	}

	console.log('🚪 closeCurrentQuestion called', {
		interviewTurnId,
		gptAnsweredTurnId,
		currentQuestionText: currentQuestion.text,
	});

	// trata perguntas incompletas
	if (isIncompleteQuestion(currentQuestion.text)) {
		console.log('⚠️ pergunta incompleta detectada — promovendo ao histórico como incompleta:', currentQuestion.text);

		const newId = crypto.randomUUID();
		questionsHistory.push({
			id: newId,
			text: currentQuestion.text,
			createdAt: currentQuestion.createdAt || Date.now(),
			lastUpdateTime: currentQuestion.lastUpdateTime || currentQuestion.createdAt || Date.now(),
			incomplete: true,
		});

		selectedQuestionId = newId;

		currentQuestion.text = '';
		currentQuestion.lastUpdateTime = null;
		currentQuestion.createdAt = null;
		currentQuestion.finalized = false;

		renderQuestionsHistory();
		renderCurrentQuestion();
		return;
	}

	if (!looksLikeQuestion(currentQuestion.text)) {
		// ⚠️ No modo entrevista, NÃO abortar o fechamento
		if (ModeController.isInterviewMode()) {
			console.log('⚠️ looksLikeQuestion=false, mas modo entrevista ativo — forçando fechamento');

			currentQuestion.text = finalizeQuestion(currentQuestion.text);
			currentQuestion.lastUpdateTime = Date.now();
			currentQuestion.finalized = true;

			// garante seleção lógica
			selectedQuestionId = CURRENT_QUESTION_ID;

			// chama GPT automaticamente se ainda não respondeu este turno
			if (gptRequestedTurnId !== interviewTurnId && gptAnsweredTurnId !== interviewTurnId) {
				console.log('➡️ closeCurrentQuestion (fallback) chamou askGpt', {
					interviewTurnId,
					gptRequestedTurnId,
					gptAnsweredTurnId,
				});

				console.error('closeCurrentQuestion: askGpt() 2017; 🔒 COMENTADA até transcrição em tempo real funcionar');
				// askGpt(); // 🔒 COMENTADA até transcrição em tempo real funcionar
			}

			return;
		}

		// modo normal mantém comportamento atual
		currentQuestion.text = '';
		currentQuestion.lastUpdateTime = null;
		currentQuestion.createdAt = null;
		currentQuestion.finalized = false;
		renderCurrentQuestion();
		return;
	}

	// ✅ consolida a pergunta
	currentQuestion.text = finalizeQuestion(currentQuestion.text);
	currentQuestion.lastUpdateTime = Date.now();
	currentQuestion.finalized = true;

	// ⚠️ NUNCA renderizar aqui no modo entrevista
	if (!ModeController.isInterviewMode()) {
		renderCurrentQuestion();
	}

	// 🔥 COMPORTAMENTO POR MODO
	if (ModeController.isInterviewMode()) {
		if (gptRequestedTurnId !== interviewTurnId && gptAnsweredTurnId !== interviewTurnId) {
			selectedQuestionId = CURRENT_QUESTION_ID;

			console.log('➡️ closeCurrentQuestion chamou askGpt (vou enviar para o GPT)', {
				interviewTurnId,
				gptRequestedTurnId,
				gptAnsweredTurnId,
			});

			console.error('closeCurrentQuestion: askGpt() 2054; 🔒 COMENTADA até transcrição em tempo real funcionar');

			// askGpt(); // 🔒 COMENTADA até transcrição em tempo real funcionar
		}
	} else {
		console.log('🔵 modo NORMAL — promovendo CURRENT para histórico sem chamar GPT');

		promoteCurrentToHistory(currentQuestion.text);

		currentQuestion.text = '';
		currentQuestion.lastUpdateTime = null;
		currentQuestion.createdAt = null;
		currentQuestion.finalized = false;

		renderCurrentQuestion();
	}

	debugLogRenderer('Fim da função: "closeCurrentQuestion"');
}

function closeCurrentQuestionForced() {
	debugLogRenderer('Início da função: "closeCurrentQuestionForced"');

	// log temporario para testar a aplicação só remover depois
	console.log('🚪 Fechando pergunta:', currentQuestion.text);

	resetInterviewTurnState();

	if (!currentQuestion.text) return;

	questionsHistory.push({
		id: crypto.randomUUID(),
		text: finalizeQuestion(currentQuestion.text),
		createdAt: currentQuestion.createdAt || Date.now(),
	});

	currentQuestion.text = '';
	selectedQuestionId = null; // 👈 libera seleção
	renderQuestionsHistory();
	renderCurrentQuestion();

	debugLogRenderer('Fim da função: "closeCurrentQuestionForced"');
}

function resetInterviewTurnState() {
	debugLogRenderer('Início da função: "resetInterviewTurnState"');

	outputPartialText = '';
	outputPartialChunks = [];

	// limpa fingerprint de pergunta enviada para evitar bloqueios indevidos
	lastAskedQuestionNormalized = null;

	debugLogRenderer('Fim da função: "resetInterviewTurnState"');
}

/* ===============================
   VALIDAÇÃO DE API KEY
=============================== */

// 🔥 Verifica o Status da API
async function checkApiKeyStatus() {
	debugLogRenderer('Início da função: "checkApiKeyStatus"');
	try {
		const status = await ipcRenderer.invoke('GET_OPENAI_API_STATUS');
		console.log('🔑 Status da API key:', status);

		debugLogRenderer('Fim da função: "checkApiKeyStatus"');
		return status;
	} catch (error) {
		console.warn('⚠️ Não foi possível verificar status da API:', error);
		return { initialized: false, hasKey: false };
	}
}

/* ===============================
   GPT
=============================== */
async function askGpt() {
	debugLogRenderer('Início da função: "askGpt"');

	// Desabilitado temporariamente (teste)
	if (DESABILITADO_TEMPORARIAMENTE) {
		debugLogRenderer('Fim da função: "askGpt" 🔒 DESABILITADO TEMPORARIAMENTE');
		return;
	}

	const text = getSelectedQuestionText();

	if (!text || text.trim().length < 5) {
		updateStatusMessage('⚠️ Pergunta vazia ou incompleta');
		return;
	}

	const isCurrent = selectedQuestionId === CURRENT_QUESTION_ID;
	const normalizedText = normalizeForCompare(text);

	// Evita reenvio da mesma pergunta atual ao GPT (dedupe)
	if (isCurrent && normalizedText && lastAskedQuestionNormalized === normalizedText) {
		updateStatusMessage('⛔ Pergunta já enviada');
		console.log('⛔ askGpt: mesma pergunta já enviada, pulando');
		return;
	}
	const questionId = isCurrent ? CURRENT_QUESTION_ID : selectedQuestionId;

	// 🛡️ MODO ENTREVISTA — bloqueia duplicação APENAS para histórico
	if (ModeController.isInterviewMode() && !isCurrent) {
		const existingAnswer = findAnswerByQuestionId(questionId);
		if (existingAnswer) {
			emitUIChange('onAnswerAdd', {
				questionId,
				action: 'showExisting',
			});
			updateStatusMessage('📌 Essa pergunta já foi respondida');
			return;
		}
	}

	// limpa destaque
	emitUIChange('onAnswerAdd', {
		questionId,
		action: 'clearActive',
	});

	// log temporario para testar a aplicação só remover depois
	console.log('🤖 askGpt chamado | questionId:', selectedQuestionId);
	console.log('🧪 GPT RECEBERIA:', text);

	console.log('🧾 askGpt diagnóstico', {
		textLength: text.length,
		selectedQuestionId,
		isInterviewMode: ModeController.isInterviewMode(),
		interviewTurnId,
		gptAnsweredTurnId,
	});

	// marca que este turno teve uma requisição ao GPT (apenas para CURRENT)
	if (isCurrent) {
		gptRequestedTurnId = interviewTurnId;
		lastAskedQuestionNormalized = normalizedText;
		console.log('ℹ️ gptRequestedTurnId definido para turno', gptRequestedTurnId);
		lastSentQuestionText = text.trim();
		console.log('ℹ️ lastSentQuestionText definido:', lastSentQuestionText);
	}

	// Inicia medição do GPT
	transcriptionMetrics.gptStartTime = Date.now();

	// 🧪 DEBUG
	if (APP_CONFIG.MODE_DEBUG) {
		updateStatusMessage('🧪 Pergunta enviada ao GPT (modo teste)');

		const mock = getMockGptAnswer(text);
		renderGptAnswer(null, mock);

		if (isCurrent && gptRequestedTurnId === interviewTurnId) {
			promoteCurrentToHistory(text);
			resetInterviewTurnState();
		}

		// marca como respondido nesse turno (mock)
		gptAnsweredTurnId = interviewTurnId;
		gptRequestedTurnId = null;

		// Finaliza medições
		transcriptionMetrics.gptEndTime = Date.now();
		transcriptionMetrics.totalTime = Date.now() - transcriptionMetrics.audioStartTime;

		// Log métricas
		logTranscriptionMetrics();

		return;
	}

	// 🧠 MODO ENTREVISTA — STREAMING
	if (ModeController.isInterviewMode()) {
		const gptStartAt = ENABLE_INTERVIEW_TIMING_DEBUG ? Date.now() : null;
		let streamedText = '';

		console.log('⏳ enviando para o GPT via stream...');
		ipcRenderer
			.invoke('ask-gpt-stream', [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: text },
			])
			.catch(err => {
				console.error('❌ Erro ao chamar ask-gpt-stream:', err);
				updateStatusMessage('❌ Erro ao enviar para GPT');
			});

		const onChunk = (_, token) => {
			streamedText += token;
			emitUIChange('onAnswerStreamChunk', {
				questionId,
				token,
				accum: streamedText,
			});
			console.log('🟢 GPT_STREAM_CHUNK recebido (token parcial)', token);
		};

		const onEnd = () => {
			console.log('✅ GPT_STREAM_END recebido (stream finalizado)');
			ipcRenderer.removeListener('GPT_STREAM_CHUNK', onChunk);
			ipcRenderer.removeListener('GPT_STREAM_END', onEnd);

			// Finaliza medições
			transcriptionMetrics.gptEndTime = Date.now();
			transcriptionMetrics.totalTime = Date.now() - transcriptionMetrics.audioStartTime;

			// Log métricas
			logTranscriptionMetrics();

			let finalText = streamedText;
			if (ENABLE_INTERVIEW_TIMING_DEBUG && gptStartAt) {
				const endAt = Date.now();
				const elapsed = endAt - gptStartAt;

				const startTime = new Date(gptStartAt).toLocaleTimeString();
				const endTime = new Date(endAt).toLocaleTimeString();

				finalText +=
					`\n\n⏱️ GPT iniciou: ${startTime}` + `\n⏱️ GPT finalizou: ${endTime}` + `\n⏱️ Resposta em ${elapsed}ms`;
			}

			// garante que o turno foi realmente fechado
			const wasRequestedForThisTurn = gptRequestedTurnId === interviewTurnId;

			gptAnsweredTurnId = interviewTurnId;
			gptRequestedTurnId = null;

			// 🔒 FECHAMENTO ATÔMICO DO CICLO
			if (isCurrent && wasRequestedForThisTurn) {
				const finalHtml = marked.parse(finalText);

				// 1️⃣ promove a pergunta primeiro (gera ID definitivo)
				promoteCurrentToHistory(text);

				// 2️⃣ pega a pergunta recém-promovida
				const promotedQuestion = questionsHistory[questionsHistory.length - 1];

				if (promotedQuestion) {
					// 3️⃣ cria a resposta já com o ID CORRETO
					renderGptAnswer(promotedQuestion.id, finalHtml);

					// 4️⃣ marca como respondida
					promotedQuestion.answered = true;
					renderQuestionsHistory();

					console.log('✅ Pergunta respondida com ID definitivo:', promotedQuestion.id);
				} else {
					console.warn('⚠️ pergunta promovida não encontrada');
				}

				resetInterviewTurnState();
			} else if (questionId !== CURRENT_QUESTION_ID) {
				const finalHtml = marked.parse(finalText);
				renderGptAnswer(questionId, finalHtml);

				// marca a pergunta como respondida no histórico (streaming path)
				try {
					const q = questionsHistory.find(x => x.id === questionId);
					if (q) {
						q.answered = true;
						renderQuestionsHistory();
					}
				} catch (err) {
					console.warn('⚠️ falha ao marcar pergunta como respondida (stream):', err);
				}
			}
		};

		ipcRenderer.on('GPT_STREAM_CHUNK', onChunk);
		ipcRenderer.once('GPT_STREAM_END', onEnd);
		return;
	}

	// 🔵 MODO NORMAL — BATCH
	console.log('⏳ enviando para o GPT (batch)...');
	const res = await ipcRenderer.invoke('ask-gpt', [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: text },
	]);

	console.log('✅ resposta do GPT recebida (batch)');

	// Finaliza medições
	transcriptionMetrics.gptEndTime = Date.now();
	transcriptionMetrics.totalTime = Date.now() - transcriptionMetrics.audioStartTime;

	// Log métricas
	logTranscriptionMetrics();

	renderGptAnswer(questionId, res);

	const wasRequestedForThisTurn = gptRequestedTurnId === interviewTurnId;

	console.log(
		'ℹ️ gptRequestedTurnId antes do batch:',
		gptRequestedTurnId,
		'wasRequestedForThisTurn:',
		wasRequestedForThisTurn,
	);

	// 🔒 FECHAMENTO ATÔMICO DO CICLO
	if (isCurrent && wasRequestedForThisTurn) {
		promoteCurrentToHistory(text);
		// após promover para o histórico, a pergunta já está no histórico e resposta vinculada
		try {
			// Encontra a última pergunta adicionada (que acabamos de promover)
			const q = questionsHistory[questionsHistory.length - 1];
			if (q) {
				q.answered = true;
				renderQuestionsHistory();
			}
		} catch (err) {
			console.warn('⚠️ falha ao marcar pergunta como respondida (batch):', err);
		}
	}

	// marca que o GPT respondeu esse turno (batch)
	gptAnsweredTurnId = interviewTurnId;
	gptRequestedTurnId = null;

	debugLogRenderer('Fim da função: "askGpt"');
}

/* ===============================
   UI (RENDER / SELEÇÃO / SCROLL)
=============================== */

function addTranscript(author, text, time) {
	debugLogRenderer('Início da função: "addTranscript"');
	let timeStr;
	if (time) {
		if (typeof time === 'number') timeStr = new Date(time).toLocaleTimeString();
		else if (time instanceof Date) timeStr = time.toLocaleTimeString();
		else timeStr = String(time);
	} else {
		timeStr = new Date().toLocaleTimeString();
	}

	// 🔥 Apenas EMITE o evento com os dados
	// config-manager.js é responsável por adicionar ao DOM
	const transcriptData = {
		author,
		text,
		timeStr,
		elementId: 'conversation',
	};

	emitUIChange('onTranscriptAdd', transcriptData);

	// Retorna um objeto proxy que simula um elemento DOM para compatibilidade
	// Usado quando a transcrição é um placeholder que será atualizado depois
	const placeholderProxy = {
		dataset: {
			startAt: typeof time === 'number' ? time : Date.now(),
			stopAt: null,
		},
		// Permite que código posterior trate como elemento DOM
		classList: {
			add: () => {},
			remove: () => {},
			contains: () => false,
			toggle: () => false,
		},
	};

	debugLogRenderer('Fim da função: "addTranscript"');
	return placeholderProxy;
}

function renderCurrentQuestion() {
	debugLogRenderer('Início da função: "renderCurrentQuestion"');

	// Desabilitado temporariamente (teste)
	if (DESABILITADO_TEMPORARIAMENTE) {
		debugLogRenderer('Fim da função: "renderCurrentQuestion" 🔒 DESABILITADO TEMPORARIAMENTE');
		return;
	}

	if (!currentQuestion.text) {
		emitUIChange('onCurrentQuestionUpdate', { text: '', isSelected: false });
		return;
	}

	let label = currentQuestion.text;

	if (ENABLE_INTERVIEW_TIMING_DEBUG && currentQuestion.lastUpdateTime) {
		const time = new Date(currentQuestion.lastUpdateTime).toLocaleTimeString();
		label = `⏱️ ${time} — ${label}`;
	}

	// 🔥 Apenas EMITE dados - config-manager aplica ao DOM
	const questionData = {
		text: label,
		isSelected: selectedQuestionId === CURRENT_QUESTION_ID,
		rawText: currentQuestion.text,
		createdAt: currentQuestion.createdAt,
		lastUpdateTime: currentQuestion.lastUpdateTime,
	};

	console.log(`📤 renderCurrentQuestion: emitindo onCurrentQuestionUpdate`, {
		label,
		isSelected: selectedQuestionId === CURRENT_QUESTION_ID,
	});
	emitUIChange('onCurrentQuestionUpdate', questionData);

	debugLogRenderer('Fim da função: "renderCurrentQuestion"');
}

function renderQuestionsHistory() {
	debugLogRenderer('Início da função: "renderQuestionsHistory"');

	// Desabilitado temporariamente (teste)
	if (DESABILITADO_TEMPORARIAMENTE) {
		debugLogRenderer('Fim da função: "renderCurrentQuestion" 🔒 DESABILITADO TEMPORARIAMENTE');
		return;
	}

	// 🔥 Gera dados estruturados - config-manager renderiza no DOM
	const historyData = [...questionsHistory].reverse().map(q => {
		let label = q.text;
		if (ENABLE_INTERVIEW_TIMING_DEBUG && q.lastUpdateTime) {
			const time = new Date(q.lastUpdateTime).toLocaleTimeString();
			label = `⏱️ ${time} — ${label}`;
		}

		return {
			id: q.id,
			text: label,
			isIncomplete: q.incomplete,
			isAnswered: q.answered,
			isSelected: q.id === selectedQuestionId,
		};
	});

	emitUIChange('onQuestionsHistoryUpdate', historyData);

	scrollToSelectedQuestion();

	debugLogRenderer('Fim da função: "renderQuestionsHistory"');
}

function clearAllSelections() {
	// Emite evento para o controller limpar as seleções visuais
	emitUIChange('onClearAllSelections', {});
}

function scrollToSelectedQuestion() {
	emitUIChange('onScrollToQuestion', {
		questionId: selectedQuestionId,
	});
}

function getSelectedQuestionText() {
	debugLogRenderer('Início da função: "getSelectedQuestionText"');
	// 1️⃣ Se existe seleção explícita
	if (selectedQuestionId === CURRENT_QUESTION_ID) {
		return currentQuestion.text;
	}

	if (selectedQuestionId) {
		const q = questionsHistory.find(q => q.id === selectedQuestionId);
		if (q?.text) return q.text;
	}

	// 2️⃣ Fallback: CURRENT (se tiver texto)
	if (currentQuestion.text && currentQuestion.text.trim().length > 0) {
		return currentQuestion.text;
	}

	debugLogRenderer('Fim da função: "getSelectedQuestionText"');
	return '';
}

function renderGptAnswer(questionId, markdownText) {
	debugLogRenderer('Início da função: "renderGptAnswer"');

	// 🔥 Renderiza markdown e retorna HTML - config-manager aplica ao DOM
	const short = shortenAnswer(markdownText, 2);
	const html = marked.parse(short);

	// Encontra texto da pergunta no histórico ou na pergunta atual
	let questionText = '';
	if (questionId === CURRENT_QUESTION_ID) {
		questionText = currentQuestion?.text || '';
	} else {
		const q = questionsHistory.find(x => x.id === questionId);
		questionText = q?.text || '';
	}

	// 🔒 Marca pergunta como respondida na primeira resposta
	if (questionId) {
		answeredQuestions.add(questionId);
		console.log('✅ Pergunta marcada como respondida:', questionId);
	}

	const answerData = {
		questionText,
		questionId,
		html,
	};

	emitUIChange('onAnswerAdd', answerData);

	// marca a pergunta como respondida no histórico (se vinculada)
	try {
		if (questionId && questionId !== CURRENT_QUESTION_ID) {
			const q = questionsHistory.find(x => x.id === questionId);
			if (q) {
				q.answered = true;
				renderQuestionsHistory();
			}
		}
	} catch (err) {
		console.warn('⚠️ falha ao marcar pergunta como respondida:', err);
	}

	debugLogRenderer('Fim da função: "renderGptAnswer"');
}

function resetInterviewState() {
	debugLogRenderer('Início da função: "resetInterviewState"');
	currentQuestion = { text: '', lastUpdate: 0, finalized: false, lastUpdateTime: null, createdAt: null };
	questionsHistory = [];
	selectedQuestionId = null;

	// Emit eventos para limpar UI
	emitUIChange('onTranscriptionCleared', {});
	emitUIChange('onAnswersCleared', {});

	clearAllSelections();
	renderQuestionsHistory();
	renderCurrentQuestion();

	debugLogRenderer('Fim da função: "resetInterviewState"');
}

// 🔥 NOVO: Verifica se existe um modelo de IA ativo e retorna o nome do modelo
function hasActiveModel() {
	debugLogRenderer('Início da função: "hasActiveModel"');
	if (!window.configManager) {
		console.warn('⚠️ ConfigManager não inicializado ainda');
		return { active: false, model: null };
	}

	const config = window.configManager.config;
	if (!config || !config.api) {
		console.warn('⚠️ Config ou api não disponível');
		return { active: false, model: null };
	}

	// Verifica se algum modelo está ativo e retorna o nome
	const providers = ['openai', 'google', 'openrouter', 'custom'];
	for (const provider of providers) {
		if (config.api[provider] && config.api[provider].enabled === true) {
			console.log(`✅ Modelo ativo encontrado: ${provider}`);
			return { active: true, model: provider };
		}
	}

	console.warn('⚠️ Nenhum modelo ativo encontrado');

	debugLogRenderer('Fim da função: "hasActiveModel"');
	return { active: false, model: null };
}

async function listenToggleBtn() {
	debugLogRenderer('Início da função: "listenToggleBtn"');

	// 🔥 VALIDAÇÃO 1: Modelo de IA ativo
	const { active: hasModel, model: activeModel } = hasActiveModel();
	console.log(`📊 DEBUG: hasModel = ${hasModel}, activeModel = ${activeModel}`);

	if (!isRunning && !hasModel) {
		const errorMsg = 'Ative um modelo de IA antes de começar a ouvir';
		console.warn(`⚠️ ${errorMsg}`);
		console.log('📡 DEBUG: Emitindo onError:', errorMsg);
		emitUIChange('onError', errorMsg);
		return;
	}

	// 🔥 VALIDAÇÃO 2: Dispositivo de áudio de SAÍDA (obrigatório para ouvir a reunião)
	const hasOutputDevice = UIElements.outputSelect?.value;
	console.log(`📊 DEBUG: hasOutputDevice = ${hasOutputDevice}`);

	if (!isRunning && !hasOutputDevice) {
		const errorMsg = 'Selecione um dispositivo de áudio (output) para ouvir a reunião';
		console.warn(`⚠️ ${errorMsg}`);
		console.log('📡 DEBUG: Emitindo onError:', errorMsg);
		emitUIChange('onError', errorMsg);
		return;
	}

	// Inverte o estado de isRunning
	isRunning = !isRunning;
	const buttonText = isRunning ? 'Parar a Escuta... (Ctrl+d)' : 'Começar a Ouvir... (Ctrl+d)';
	const statusMsg = isRunning ? 'Status: ouvindo...' : 'Status: parado';

	// Emite o evento 'onListenButtonToggle' para atualizar o botão de escuta
	emitUIChange('onListenButtonToggle', {
		isRunning,
		buttonText,
	});

	// Atualiza o status da escuta na tela
	updateStatusMessage(statusMsg);

	console.log(`🎤 Listen toggle: ${isRunning ? 'INICIANDO' : 'PARANDO'} (modelo: ${activeModel})`);

	// Inicia ou para a captura de áudio
	await (isRunning ? startAudio() : stopAudio());

	debugLogRenderer('Fim da função: "listenToggleBtn"');
}

function handleQuestionClick(questionId) {
	debugLogRenderer('Início da função: "handleQuestionClick"');
	selectedQuestionId = questionId;
	clearAllSelections();
	renderQuestionsHistory();
	renderCurrentQuestion();

	// ⚠️ CURRENT nunca bloqueia resposta
	if (questionId !== CURRENT_QUESTION_ID) {
		const existingAnswer = findAnswerByQuestionId(questionId);

		if (existingAnswer) {
			emitUIChange('onAnswerSelected', {
				answerId: questionId,
				shouldScroll: true,
			});

			updateStatusMessage('📌 Essa pergunta já foi respondida');
			return;
		}
	}

	// Se for uma pergunta do histórico marcada como incompleta, não enviar automaticamente ao GPT
	if (questionId !== CURRENT_QUESTION_ID) {
		const q = questionsHistory.find(q => q.id === questionId);
		if (q && q.incomplete) {
			updateStatusMessage('⚠️ Pergunta incompleta — pressione o botão de responder para enviar ao GPT');
			console.log('ℹ️ pergunta incompleta selecionada — aguarda envio manual:', q.text);
			return;
		}
	}

	if (
		ModeController.isInterviewMode() &&
		selectedQuestionId === CURRENT_QUESTION_ID &&
		gptAnsweredTurnId === interviewTurnId
	) {
		updateStatusMessage('⛔ GPT já respondeu esse turno');
		console.log('⛔ GPT já respondeu esse turno');
		return;
	}

	// ❓ Ainda não respondida → chama GPT (click ou atalho)
	console.error('closeCurrentQuestion: askGpt() 2714; 🔒 COMENTADA até transcrição em tempo real funcionar');
	// askGpt(); // 🔒 COMENTADA até transcrição em tempo real funcionar

	debugLogRenderer('Fim da função: "handleQuestionClick"');
}

function applyOpacity(value) {
	debugLogRenderer('Início da função: "applyOpacity"');
	const appOpacity = parseFloat(value);

	// aplica opacidade no conteúdo geral
	document.documentElement.style.setProperty('--app-opacity', appOpacity.toFixed(2));

	// topBar nunca abaixo de 0.75
	const topbarOpacity = Math.max(appOpacity, 0.75);
	document.documentElement.style.setProperty('--app-opacity-75', topbarOpacity.toFixed(2));

	localStorage.setItem('overlayOpacity', appOpacity);

	// logs temporários para debug
	console.log('🎚️ Opacity change | app:', value, '| topBar:', topbarOpacity);

	debugLogRenderer('Fim da função: "applyOpacity"');
}

// 🔥 Novo: atualizar status sem tocar em DOM
function updateStatusMessage(message) {
	debugLogRenderer('Início da função: "updateStatusMessage"');
	emitUIChange('onStatusUpdate', { message });
	debugLogRenderer('Fim da função: "updateStatusMessage"');
}

/* ===============================
   MOCK / DEBUG
=============================== */

function startMockInterview() {
	if (mockInterviewRunning) return;
	mockInterviewRunning = true;

	// 🔥 Emite atualização do mock badge
	emitUIChange('onMockBadgeUpdate', { visible: true });

	const mockQuestions = [
		'O que é JVM e para que serve',
		'Qual a diferença entre JDK e JRE',
		'Explique o que é Garbage Collector',
		'Como funciona o equals e hashCode',
		'O que é imutabilidade em Java',
		'Explique o que é POO',
		'Quais são os pilares da POO',
		'Qual a diferença entre Spring e Spring Boot',
	];

	let index = 0;

	function sendNext() {
		if (!APP_CONFIG.MODE_DEBUG || index >= mockQuestions.length) {
			mockInterviewRunning = false;
			return;
		}

		const text = mockQuestions[index];
		addTranscript(OTHER, text); // 👈 simula fala real
		handleSpeech(OTHER, text); // 👈 consolida pergunta

		index++;

		// simula silêncio → fechamento da pergunta
		setTimeout(() => {
			closeCurrentQuestion();
		}, QUESTION_IDLE_TIMEOUT);

		// próxima pergunta depois de um tempo
		setTimeout(sendNext, 6000);
	}

	sendNext();
}

function getMockGptAnswer(question) {
	return `
### ✔️ Resposta simulada

Você perguntou:

> ${question}

Essa é uma resposta mock apenas para validar:
- fluxo
- scroll
- seleção
- ritmo de uso

`;
}

/* ===============================
   BOOT
=============================== */

marked.setOptions({
	highlight: function (code, lang) {
		if (lang && hljs.getLanguage(lang)) {
			return hljs.highlight(code, { language: lang }).value;
		}
		return hljs.highlightAuto(code).value;
	},
	breaks: true,
});

// Exporta funções públicas que o controller pode chamar
const RendererAPI = {
	// Áudio - Gravação
	startInput,
	stopInput: stopInputMonitor,
	startOutput,
	stopOutput: stopOutputMonitor,
	restartAudioPipeline,

	// Áudio - Monitoramento de volume
	startInputVolumeMonitoring,
	startOutputVolumeMonitoring,
	stopInputVolumeMonitoring,
	stopOutputVolumeMonitoring,

	// Entrevista
	listenToggleBtn,
	askGpt,
	resetInterviewState,
	startMockInterview,

	// Modo
	changeMode: mode => {
		CURRENT_MODE = mode;
	},
	getMode: () => CURRENT_MODE,

	// Questions
	handleQuestionClick,
	closeCurrentQuestion,

	// UI
	applyOpacity,
	updateMockBadge: show => {
		emitUIChange('onMockBadgeUpdate', { visible: show });
	},
	setMockToggle: checked => {
		if (UIElements.mockToggle) {
			UIElements.mockToggle.checked = checked;
		}
		APP_CONFIG.MODE_DEBUG = checked;
	},
	setModeSelect: mode => {
		emitUIChange('onModeSelectUpdate', { mode });
	},

	// Drag
	initDragHandle: (dragHandle, documentElement) => {
		if (!dragHandle) return;
		const doc = documentElement || document; // fallback para document global
		dragHandle.addEventListener('pointerdown', async event => {
			console.log('🪟 Drag iniciado (pointerdown)');
			isDraggingWindow = true;
			dragHandle.classList.add('drag-active');

			const _pid = event.pointerId;
			try {
				dragHandle.setPointerCapture && dragHandle.setPointerCapture(_pid);
			} catch (err) {
				console.warn('setPointerCapture falhou:', err);
			}

			setTimeout(() => ipcRenderer.send('START_WINDOW_DRAG'), 40);

			const startBounds = (await ipcRenderer.invoke('GET_WINDOW_BOUNDS')) || {
				x: 0,
				y: 0,
			};
			const startCursor = { x: event.screenX, y: event.screenY };
			let lastAnimation = 0;

			function onPointerMove(ev) {
				const now = performance.now();
				if (now - lastAnimation < 16) return;
				lastAnimation = now;

				const dx = ev.screenX - startCursor.x;
				const dy = ev.screenY - startCursor.y;

				ipcRenderer.send('MOVE_WINDOW_TO', {
					x: startBounds.x + dx,
					y: startBounds.y + dy,
				});
			}

			function onPointerUp(ev) {
				try {
					dragHandle.removeEventListener('pointermove', onPointerMove);
					dragHandle.removeEventListener('pointerup', onPointerUp);
				} catch (err) {}

				if (dragHandle.classList.contains('drag-active')) {
					dragHandle.classList.remove('drag-active');
				}

				try {
					dragHandle.releasePointerCapture && dragHandle.releasePointerCapture(_pid);
				} catch (err) {}

				isDraggingWindow = false;
			}

			dragHandle.addEventListener('pointermove', onPointerMove);
			dragHandle.addEventListener('pointerup', onPointerUp, { once: true });
			event.stopPropagation();
		});

		doc.addEventListener('pointerup', () => {
			if (!dragHandle.classList.contains('drag-active')) return;
			console.log('🪟 Drag finalizado (pointerup)');
			dragHandle.classList.remove('drag-active');
			isDraggingWindow = false;
		});

		dragHandle.addEventListener('pointercancel', () => {
			if (dragHandle.classList.contains('drag-active')) {
				dragHandle.classList.remove('drag-active');
				isDraggingWindow = false;
			}
		});
	},

	// Click-through
	setClickThrough: enabled => {
		ipcRenderer.send('SET_CLICK_THROUGH', enabled);
	},
	updateClickThroughButton: (enabled, btnToggle) => {
		if (!btnToggle) return;
		btnToggle.style.opacity = enabled ? '0.5' : '1';
		btnToggle.title = enabled
			? 'Click-through ATIVO (clique para desativar)'
			: 'Click-through INATIVO (clique para ativar)';
		console.log('🎨 Botão atualizado - opacity:', btnToggle.style.opacity);
	},

	// UI Registration
	registerUIElements: elements => {
		registerUIElements(elements);
	},
	onUIChange: (eventName, callback) => {
		onUIChange(eventName, callback);
	},

	// API Key
	setAppConfig: config => {
		APP_CONFIG = config;
	},
	getAppConfig: () => APP_CONFIG,

	// Keyboard shortcuts
	registerKeyboardShortcuts: () => {
		window.addEventListener(
			'keydown',
			e => {
				if (e.ctrlKey && e.shiftKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
					e.preventDefault();
					e.stopPropagation();

					const all = getNavigableQuestionIds();
					if (all.length === 0) return;

					let index = all.indexOf(selectedQuestionId);
					if (index === -1) {
						index = e.key === 'ArrowUp' ? all.length - 1 : 0;
					} else {
						index += e.key === 'ArrowUp' ? -1 : 1;
						index = Math.max(0, Math.min(index, all.length - 1));
					}

					selectedQuestionId = all[index];
					clearAllSelections();
					renderQuestionsHistory();
					renderCurrentQuestion();

					if (APP_CONFIG.MODE_DEBUG) {
						const msg =
							e.key === 'ArrowUp' ? '🧪 Ctrl+ArrowUp detectado (teste)' : '🧪 Ctrl+ArrowDown detectado (teste)';
						updateStatusMessage(msg);
						console.log('📌 Atalho Selecionou:', selectedQuestionId);
						return;
					}
				}
			},
			true,
		);
	},

	// IPC Listeners
	onApiKeyUpdated: callback => {
		ipcRenderer.on('API_KEY_UPDATED', callback);
	},
	onToggleAudio: callback => {
		ipcRenderer.on('CMD_TOGGLE_AUDIO', callback);
	},
	onAskGpt: callback => {
		ipcRenderer.on('CMD_ASK_GPT', callback);
	},
	onGptStreamChunk: callback => {
		ipcRenderer.on('GPT_STREAM_CHUNK', callback);
	},
	onGptStreamEnd: callback => {
		ipcRenderer.on('GPT_STREAM_END', callback);
	},
	sendRendererError: error => {
		try {
			console.error('RENDERER ERROR', error.error || error.message || error);
			ipcRenderer.send('RENDERER_ERROR', {
				message: String(error.message || error),
				stack: error.error?.stack || null,
			});
		} catch (err) {
			console.error('Falha ao enviar RENDERER_ERROR', err);
		}
	},

	///////////////////////////////////
	// FUNÇÕES PARA WHISPER LOCAL
	///////////////////////////////////
	setTranscriptionMode: useLocal => {
		setTranscriptionMode(useLocal);
	},

	getTranscriptionMode: () => USE_LOCAL_WHISPER,
};

if (typeof module !== 'undefined' && module.exports) {
	module.exports = RendererAPI;
}

// 🔥 Expor globalmente para que config-manager possa acessar
if (typeof window !== 'undefined') {
	window.RendererAPI = RendererAPI;
}

// Função de log debug estilizado
function debugLogRenderer(msg) {
	console.log('%c🪲 ❯❯❯❯ Debug: ' + msg + ' em renderer.js', 'color: brown; font-weight: bold;');
}

/* ===============================
   FUNÇÃO PARA LOGAR MÉTRICAS
=============================== */

function logTranscriptionMetrics() {
	if (!transcriptionMetrics.audioStartTime) return;

	const whisperTime = transcriptionMetrics.whisperEndTime - transcriptionMetrics.whisperStartTime;
	const gptTime = transcriptionMetrics.gptEndTime - transcriptionMetrics.gptStartTime;
	const totalTime = transcriptionMetrics.totalTime;

	console.log(`📊 ================================`);
	console.log(`📊 MÉTRICAS DE TEMPO DETALHADAS:`);
	console.log(`📊 ================================`);
	console.log(`📊 TAMANHO ÁUDIO: ${transcriptionMetrics.audioSize} bytes`);
	console.log(`📊 WHISPER: ${whisperTime}ms (${Math.round(transcriptionMetrics.audioSize / whisperTime)} bytes/ms)`);
	console.log(`📊 GPT: ${gptTime}ms`);
	console.log(`📊 TOTAL: ${totalTime}ms`);
	console.log(`📊 WHISPER % DO TOTAL: ${Math.round((whisperTime / totalTime) * 100)}%`);
	console.log(`📊 GPT % DO TOTAL: ${Math.round((gptTime / totalTime) * 100)}%`);
	console.log(`📊 ================================`);

	// Reset para próxima medição
	transcriptionMetrics = {
		audioStartTime: null,
		whisperStartTime: null,
		whisperEndTime: null,
		gptStartTime: null,
		gptEndTime: null,
		totalTime: null,
		audioSize: 0,
	};
}

//console.log('🚀 Entrou no renderer.js');
