/* ===============================
   IMPORTS
=============================== */
const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const hljs = require('highlight.js');

// 🌊 Transcrição Deepgram
const { startAudioDeepgram, stopAudioDeepgram, finalizePendingTranscription } = require('./deepgram-transcribe.js');

// 🔥 Transcrição Whisper
const { transcribeWhisperComplete, transcribeWhisperPartial } = require('./whisper-transcribe.js');

// 🔥 Transcrição Vosk
const { transcribeVoskComplete, transcribeVoskPartial } = require('./vosk-transcribe.js');

// 🔒 DESABILITADO TEMPORARIAMENTE
const DESABILITADO_TEMPORARIAMENTE = false;

// 🔥 Sistema de eventos para módulos de transcrição (desacoplamento)
window.transcriptionEvents = new EventTarget();

/* ===============================
   🔐 PROTEÇÃO CONTRA CAPTURA DE TELA EXTERNA
   Desabilita/limita APIs usadas por Zoom, Teams, Meet, OBS, Discord, Snipping Tool, etc.
=============================== */
(function protectAgainstScreenCapture() {
	// ✅ Desabilita getDisplayMedia (usado por Zoom, Meet, Teams para capturar)
	if (navigator && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
		const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
		navigator.mediaDevices.getDisplayMedia = async function (...args) {
			console.warn('🔐 BLOQUEADO: Tentativa de usar getDisplayMedia (captura de tela externa)');
			throw new Error('Screen capture not available in this window');
		};
	}

	// ✅ Desabilita captureStream (usado para captura de janela)
	if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype.captureStream) {
		Object.defineProperty(window.HTMLCanvasElement.prototype, 'captureStream', {
			value: function () {
				console.warn('🔐 BLOQUEADO: Tentativa de usar Canvas.captureStream()');
				throw new Error('Capture stream not available');
			},
			writable: false,
			configurable: false,
		});
	}

	// ✅ Intercepta getUserMedia para avisar sobre tentativas de captura de áudio (pode ser usado em combo com vídeo)
	if (navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
		const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
		navigator.mediaDevices.getUserMedia = async function (constraints) {
			if (constraints && constraints.video) {
				console.warn('🔐 AVISO: Tentativa de usar getUserMedia com vídeo detectada');
				// Ainda permite áudio, mas bloqueia vídeo para captura
				if (constraints.video) {
					delete constraints.video;
				}
			}
			return originalGetUserMedia(constraints);
		};
	}

	console.log('✅ Proteção contra captura externa ativada');
})();

/* ===============================
   CONSTANTES
=============================== */

const YOU = 'Você';
const OTHER = 'Outros';

const ENABLE_INTERVIEW_TIMING_DEBUG = true; // ← desligar depois = false
const QUESTION_IDLE_TIMEOUT = 300; // Tempo de espera para a pergunta ser considerada inativa = 300
const CURRENT_QUESTION_SILENCE_TIMEOUT = 1500; // 🔥 Tempo sem novos interims para considerar pergunta finalizada = 1500ms
const CURRENT_QUESTION_ID = 'CURRENT'; // ID da pergunta atual

const INPUT_SPEECH_THRESHOLD = 20; // Valor limite (threshold) para detectar fala mais cedo = 20
const INPUT_SILENCE_TIMEOUT = 100; // Tempo de espera para silêncio = 100
const MIN_INPUT_AUDIO_SIZE = 1000; // Valor mínimo de tamanho de áudio para a normal = 1000
const MIN_INPUT_AUDIO_SIZE_INTERVIEW = 350; // Valor mínimo de tamanho de áudio para a entrevista = 350

const OUTPUT_SPEECH_THRESHOLD = 20; // Valor limite (threshold) para detectar fala mais cedo = 8
const OUTPUT_SILENCE_TIMEOUT = 100; // 🔥 OTIMIZADO: detecta fim de fala MAIS rápido = 80ms para latência menor
const AUTO_CLOSE_QUESTION_TIMEOUT = 900; // 900ms — aguarda sem novo áudio antes de fechar pergunta + GPT
const MIN_OUTPUT_AUDIO_SIZE = 1000; // Valor mínimo de tamanho de áudio para a normal = 2500
const MIN_OUTPUT_AUDIO_SIZE_INTERVIEW = 350; // Valor mínimo para enviar parcial (~3-4 chunks, ~3KB)
// controla intervalo mínimo entre requisições STT parciais (ms) - mantém rate-limit para não sobrecarregar API
const PARTIAL_MIN_INTERVAL_MS = 800; // 🔥 OTIMIZADO: transcrição parcial a cada 800ms (era 3000ms)

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
   SCREENSHOT CAPTURE - ESTADO E CONTROLE
=============================== */

let capturedScreenshots = []; // Array de { filepath, filename, timestamp }
let isCapturing = false;
let isAnalyzing = false;

/* ===============================
   ESTADO GLOBAL
=============================== */

let APP_CONFIG = {
	MODE_DEBUG: false, // ← alterado via config-manager.js (true = modo mock)
};

// 🪟 Estado do Drag and Drop da janela
let isDraggingWindow = false;

let isRunning = false;
let audioContext;
// let mockInterviewRunning = false;

// 🔥 MODIFICADO: STT model vem da config agora (removido USE_LOCAL_WHISPER)
let transcriptionMetrics = {
	audioStartTime: null,
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
let currentQuestion = {
	text: '',
	lastUpdate: 0,
	finalized: false,
	lastUpdateTime: null,
	createdAt: null,
	finalText: '',
	interimText: '',
};
let questionsHistory = [];
const answeredQuestions = new Set(); // 🔒 Armazena respostas já geradas (questionId -> true)
let selectedQuestionId = null;
let interviewTurnId = 0;
let gptAnsweredTurnId = null;
let gptRequestedTurnId = null;
let gptRequestedQuestionId = null; // 🔥 [IMPORTANTE] Rastreia QUAL pergunta foi realmente solicitada ao GPT
let lastSentQuestionText = '';
let autoCloseQuestionTimer = null;
let currentQuestionSilenceTimer = null; // 🔥 Timer para detectar fim de fala no CURRENT
let lastInputStartAt = null;
let lastInputStopAt = null;
let lastOutputStartAt = null;
let lastOutputStopAt = null;
let lastInputPlaceholderEl = null;
let lastOutputPlaceholderEl = null;
let lastAskedQuestionNormalized = null;
let lastPartialSttAt = null;
let lastOutputPlaceholderId = null; // 🔥 ID único para rastrear qual placeholder atualizar

// 🔥 Variáveis temporárias para transcrição atual (imunes a race conditions)
// Armazenam os timestamps capturados NO MOMENTO de onstop() para uso exclusivo por transcribeOutput()
let pendingOutputStartAt = null;
let pendingOutputStopAt = null;

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
	// onAnswerAdd: null,
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
	onAnswerIdUpdate: null,
	onModeSelectUpdate: null,
	onAnswerStreamEnd: null,
	onPlaceholderFulfill: null,
	onPlaceholderUpdate: null,
	onUpdateInterim: null,
	onClearInterim: null,
	onScreenshotBadgeUpdate: null,
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
   STT EVENTS - Sistema Unificado de Eventos
   Disparado quando qualquer modelo STT termina uma transcrição
=============================== */

const STTEvents = {
	onTranscriptionComplete: null, // Disparado quando STT termina
};

/**
 * 🔥 Registra listener para eventos STT
 * @param {string} eventName - Nome do evento ('transcriptionComplete')
 * @param {function} callback - Callback a ser executado
 */
function onSTTEvent(eventName, callback) {
	if (eventName === 'transcriptionComplete') {
		STTEvents.onTranscriptionComplete = callback;
		console.log('📡 STT Event listener registrado: transcriptionComplete');
	}
}

/**
 * 🔥 Emite evento STT para todas as camadas superiores
 * @param {string} eventName - Nome do evento ('transcriptionComplete')
 * @param {object} data - Dados do evento
 */
function emitSTTEvent(eventName, data) {
	if (eventName === 'transcriptionComplete') {
		STTEvents.onTranscriptionComplete?.(data);
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
	const s = t.toLowerCase().trim();

	// 🔥 Detecção inteligente: se tem pergunta real, NÃO é lixo
	// Mesmo que tenha "muito bom", se tem "?" ou palavra de pergunta, passa!
	if (looksLikeQuestion(s)) {
		console.log('✅ isGarbageSentence: contém pergunta real, retornando FALSE (não é lixo)');
		debugLogRenderer('Fim da função: "isGarbageSentence"');
		return false;
	}

	// 🔥 Lista expandida de padrões de "lixo" PURO (confirmações/finalizações sozinhas)
	const garbagePatterns = [
		// Finalizações e agradecimentos
		'obrigado',
		'muito obrigado',
		'valeu',
		'falou',
		'tchau',
		'até a próxima',
		'até logo',
		// Confirmações simples (sem pergunta real)
		'combinado',
		'certo',
		'beleza',
		'ok',
		'tá bom',
		'está bom',
		'perfeito',
		'ótimo',
		// Frases de continuação (não perguntas)
		'responder',
		'responda',
		// Interjeições e expressões vazias
		'e aí',
		'ué',
		'hã',
		'ahn',
		'e então',
		'e depois',
		// Finalizando
		'finalizando',
		'pronto',
		'fim',
		'acabou',
	];

	// Detecta se é lixo puro
	const isGarbage = garbagePatterns.some(w => s.includes(w));

	// Detecta frases muito curtas ou vazias (< 3 caracteres significa ruído)
	const isTooShort = s.length < 3;

	debugLogRenderer('Fim da função: "isGarbageSentence"');
	return isGarbage || isTooShort;
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
		currentQuestion = {
			text: '',
			lastUpdate: 0,
			finalized: false,
			lastUpdateTime: null,
			createdAt: null,
			finalText: '',
			interimText: '',
		};

		// 🔥 Limpar timer de silêncio
		if (currentQuestionSilenceTimer) {
			clearTimeout(currentQuestionSilenceTimer);
			currentQuestionSilenceTimer = null;
		}

		if (prevSelected === null || prevSelected === CURRENT_QUESTION_ID) {
			selectedQuestionId = CURRENT_QUESTION_ID;
		} else {
			selectedQuestionId = prevSelected;
		}

		renderQuestionsHistory();
		renderCurrentQuestion();
		return;
	}

	const newId = String(questionsHistory.length + 1);

	questionsHistory.push({
		id: newId,
		text,
		createdAt: currentQuestion.createdAt || Date.now(),
		lastUpdateTime: currentQuestion.lastUpdateTime || currentQuestion.createdAt || Date.now(),
	});

	// 🔥 [IMPORTANTE] Migrar resposta de CURRENT para o novo ID no history
	if (answeredQuestions.has(CURRENT_QUESTION_ID)) {
		answeredQuestions.delete(CURRENT_QUESTION_ID);
		answeredQuestions.add(newId);
		console.log('🔄 [IMPORTANTE] Migrada resposta de CURRENT para newId:', newId);
	}

	// 🔥 [CRÍTICO] Atualizar o ID do bloco de resposta no DOM se ele foi criado com CURRENT
	console.log('🔄 [IMPORTANTE] Emitindo onAnswerIdUpdate para atualizar bloco de resposta: CURRENT → ', newId);
	emitUIChange('onAnswerIdUpdate', {
		oldId: CURRENT_QUESTION_ID,
		newId: newId,
	});

	// 🔥 [IMPORTANTE] Se uma pergunta CURRENT foi solicitada ao GPT,
	// atualizar o rastreamento para apontar para o novo ID promovido
	if (gptRequestedQuestionId === CURRENT_QUESTION_ID) {
		gptRequestedQuestionId = newId;
		console.log('🔄 [IMPORTANTE] gptRequestedQuestionId atualizado de CURRENT para newId:', newId);
	}

	// preserva seleção do usuário: se não havia seleção explícita ou estava no CURRENT,
	// mantém a seleção no CURRENT para que o novo CURRENT seja principal.
	const prevSelected = selectedQuestionId;

	// 🔥 RESET COMPLETO: Limpar timer de silêncio antes de resetar
	if (currentQuestionSilenceTimer) {
		console.log('🔥 Limpando timer de silêncio durante promoção');
		clearTimeout(currentQuestionSilenceTimer);
		currentQuestionSilenceTimer = null;
	}

	resetCurrentQuestion();

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

/**
 * 🔥 AUTO-ASK: Tenta chamar GPT automaticamente em modo entrevista
 * Disparada por: STTEvents.onTranscriptionComplete (após 900ms sem áudio)
 *
 * Precondições:
 * - Modo entrevista ativo
 * - CURRENT tem texto
 * - Pergunta ainda não foi respondida neste turno
 * - Texto não é "lixo"
 */
function autoAskGptIfReady() {
	debugLogRenderer('Início da função: "autoAskGptIfReady"');

	// Validações básicas
	if (!ModeController.isInterviewMode()) {
		console.log('⏭️ autoAskGptIfReady: modo normal (não entrevista), abortando');
		return;
	}

	if (!currentQuestion.text) {
		console.log('⏭️ autoAskGptIfReady: CURRENT está vazio, abortando');
		return;
	}

	if (gptRequestedTurnId === interviewTurnId) {
		console.log('⏭️ autoAskGptIfReady: GPT já foi solicitado neste turno, abortando');
		return;
	}

	if (gptAnsweredTurnId === interviewTurnId) {
		console.log('⏭️ autoAskGptIfReady: GPT já respondeu neste turno, abortando');
		return;
	}

	const text = currentQuestion.text.trim();

	// 🔥 REMOVIDO: Lógica duplicada de concatenação de interim
	// O currentQuestion.text já inclui interimText através de handleCurrentQuestion

	// Verifica se é lixo
	if (isGarbageSentence(currentQuestion.text.trim())) {
		console.log('❌ autoAskGptIfReady: pergunta é lixo, abortando');
		return;
	}

	console.log('✅ autoAskGptIfReady: chamando askGpt automaticamente');
	askGpt();

	debugLogRenderer('Fim da função: "autoAskGptIfReady"');
}

function isEndingPhrase(text) {
	debugLogRenderer('Início da função: "isEndingPhrase"');
	const normalized = text.toLowerCase().trim();

	debugLogRenderer('Fim da função: "isEndingPhrase"');
	return OUTPUT_ENDING_PHRASES.some(p => normalized === p);
}

/* ===============================
   🔥 RESET COMPLETO DO APP
   Função centralizada e reutilizável para limpar tudo
   Pode ser chamada por: mock toggle, resetHomeBtn, ou qualquer outro
=============================== */

/**
 * 🧹 Reseta o aplicativo completamente para estado inicial
 * - Substitui resetInterviewState() e resetHomeSection()
 * - Centraliza TODA lógica de limpeza em um único lugar
 * - Pode ser reutilizada por qualquer botão/controle
 *
 * Uso:
 *   await resetAppState(); // Completo e seguro
 */
async function resetAppState() {
	console.log('🧹 ═══════════════════════════════════════════════════════════');
	console.log('🧹 INICIANDO RESET COMPLETO DO APP');
	console.log('🧹 ═══════════════════════════════════════════════════════════');

	try {
		// 1️⃣ PARAR AUTOPLAY DO MOCK (prevent async operations)
		mockAutoPlayActive = false;
		mockScenarioIndex = 0;
		console.log('✅ Autoplay do mock parado');

		// 2️⃣ PARAR ÁUDIO IMEDIATAMENTE (input/output)
		if (isRunning) {
			console.log('🎤 Parando captura de áudio...');
			await stopInput();
			await stopOutput();
			isRunning = false;
		}

		// 3️⃣ RESET DE ESTADO DE ÁUDIO
		inputSpeaking = false;
		outputSpeaking = false;
		console.log('✅ Estado de áudio resetado');

		// 4️⃣ LIMPAR CHUNKS DE ÁUDIO
		inputChunks = [];
		outputChunks = [];
		inputPartialChunks = [];
		outputPartialChunks = [];
		outputPartialText = '';
		voskAccumulatedText = '';
		console.log('✅ Chunks de áudio limpos');

		// 5️⃣ LIMPAR TIMERS DE ÁUDIO
		if (inputSilenceTimer) {
			clearTimeout(inputSilenceTimer);
			inputSilenceTimer = null;
		}
		if (outputSilenceTimer) {
			clearTimeout(outputSilenceTimer);
			outputSilenceTimer = null;
		}
		if (inputPartialTimer) {
			clearTimeout(inputPartialTimer);
			inputPartialTimer = null;
		}
		if (outputPartialTimer) {
			clearTimeout(outputPartialTimer);
			outputPartialTimer = null;
		}
		if (voskPartialTimer) {
			clearTimeout(voskPartialTimer);
			voskPartialTimer = null;
		}
		if (autoCloseQuestionTimer) {
			clearTimeout(autoCloseQuestionTimer);
			autoCloseQuestionTimer = null;
		}
		console.log('✅ Timers limpos');

		// 6️⃣ LIMPAR PERGUNTAS E RESPOSTAS
		currentQuestion = {
			text: '',
			lastUpdate: 0,
			finalized: false,
			lastUpdateTime: null,
			createdAt: null,
			finalText: '',
			interimText: '',
		};
		questionsHistory = [];
		answeredQuestions.clear();
		selectedQuestionId = null;
		lastSentQuestionText = '';
		lastAskedQuestionNormalized = null;
		console.log('✅ Perguntas e respostas limpas');

		// 7️⃣ LIMPAR ESTADO GPT/ENTREVISTA
		interviewTurnId = 0;
		gptAnsweredTurnId = null;
		gptRequestedTurnId = null;
		gptRequestedQuestionId = null;
		console.log('✅ Estado de entrevista resetado');

		// 8️⃣ LIMPAR PLACEHOLDERS
		lastInputStartAt = null;
		lastInputStopAt = null;
		lastOutputStartAt = null;
		lastOutputStopAt = null;
		pendingOutputStartAt = null;
		pendingOutputStopAt = null;
		lastPartialSttAt = null;
		lastOutputPlaceholderId = null;
		lastInputPlaceholderEl = null;
		lastOutputPlaceholderEl = null;
		console.log('✅ Placeholders limpos');

		// 9️⃣ RESETAR MÉTRICAS
		transcriptionMetrics = {
			audioStartTime: null,
			gptStartTime: null,
			gptEndTime: null,
			totalTime: null,
			audioSize: 0,
		};
		console.log('✅ Métricas resetadas');

		// 🔟 LIMPAR SCREENSHOTS (sem chamar API!)
		if (capturedScreenshots.length > 0) {
			console.log(`🗑️ Limpando ${capturedScreenshots.length} screenshot(s)...`);
			capturedScreenshots = [];
			emitUIChange('onScreenshotBadgeUpdate', {
				count: 0,
				visible: false,
			});
			// Força limpeza no sistema
			try {
				await ipcRenderer.invoke('CLEANUP_SCREENSHOTS');
			} catch (err) {
				console.warn('⚠️ Erro ao limpar screenshots no sistema:', err);
			}
		}
		console.log('✅ Screenshots limpos');

		// 1️⃣1️⃣ LIMPAR FLAGS
		isCapturing = false;
		isAnalyzing = false;
		console.log('✅ Flags resetadas');

		// 1️⃣2️⃣ ATUALIZAR UI - PERGUNTAS
		emitUIChange('onCurrentQuestionUpdate', {
			text: '',
			isSelected: false,
		});
		emitUIChange('onQuestionsHistoryUpdate', []);
		console.log('✅ Perguntas UI limpa');

		// 1️⃣3️⃣ ATUALIZAR UI - TRANSCRIÇÕES E RESPOSTAS
		emitUIChange('onTranscriptionCleared');
		emitUIChange('onAnswersCleared');
		console.log('✅ Transcrições e respostas UI limpas');

		// 1️⃣4️⃣ ATUALIZAR UI - BOTÃO LISTEN
		emitUIChange('onListenButtonToggle', {
			isRunning: false,
			buttonText: '🎤 Começar a Ouvir... (Ctrl+D)',
		});
		console.log('✅ Botão listen resetado');

		// 1️⃣5️⃣ ATUALIZAR UI - STATUS
		emitUIChange('onStatusUpdate', {
			status: 'ready',
			message: '✅ Pronto',
		});
		console.log('✅ Status atualizado');

		// 1️⃣6️⃣ LIMPAR SELEÇÕES
		clearAllSelections();
		console.log('✅ Seleções limpas');

		// 1️⃣7️⃣ LOG FINAL
		console.log('✅ ═══════════════════════════════════════════════════════════');
		console.log('✅ RESET COMPLETO CONCLUÍDO COM SUCESSO');
		console.log('✅ ═══════════════════════════════════════════════════════════');

		return true;
	} catch (error) {
		console.error('❌ Erro ao resetar app:', error);
		return false;
	}
}

/**
 * 🔧 Limpa parcialmente o estado de uma volta de entrevista (turn)
 * Usado internamente durante streaming para não perder contexto
 * NÃO substitui resetAppState() - é um helper minor
 */
function resetInterviewTurnState() {
	// Limpa apenas o output parcial desta volta específica
	outputPartialText = '';
	outputPartialChunks = [];
	// Não limpa lastAskedQuestionNormalized aqui - mantém para evitar duplicatas
}

/* ===============================
   TRANSCRIÇÃO (STT) - MODELO DINÂMICO
=============================== */

/**
 * Obtém o modelo STT configurado para o provider ativo
 * @returns {string} 'vosk-local' | 'whisper-1' | 'google-stt' etc
 */
function getConfiguredSTTModel() {
	try {
		if (!window.configManager || !window.configManager.config) {
			console.warn('⚠️ configManager não disponível, usando padrão: whisper-1');
			return 'whisper-1';
		}

		const config = window.configManager.config;
		const activeProvider = config.api?.activeProvider || 'openai';
		const sttModel = config.api?.[activeProvider]?.selectedSTTModel;

		if (!sttModel) {
			console.warn(`⚠️ Modelo STT não configurado para ${activeProvider}, usando padrão: whisper-1`);
			return 'whisper-1';
		}

		console.log(`🎤 STT Model selecionado: ${sttModel} (provider: ${activeProvider})`);
		console.log(`   [DEBUG] config.api.${activeProvider}.selectedSTTModel = "${sttModel}"`);
		console.log(
			`   [DEBUG] select#${activeProvider}-stt-model.value = "${
				document.getElementById(activeProvider + '-stt-model')?.value
			}"`,
		);
		return sttModel;
	} catch (err) {
		console.error('❌ Erro ao obter modelo STT da config:', err);
		return 'whisper-1'; // fallback
	}
}

/**
 * Roteia transcrição de áudio para o modelo STT configurado
 *
 * Modelos suportados (via config-manager):
 * 1. vosk-local          → main.js handlers: vosk-transcribe + vosk-finalize
 * 2. whisper-cpp-local   → main.js handler: transcribe-local (alta precisão)
 * 3. whisper-1           → main.js handler: transcribe-audio (online, OpenAI)
 *
 * Retorna: texto transcrito ou erro
 */
async function transcribeAudio(blob) {
	transcriptionMetrics.audioStartTime = Date.now();
	transcriptionMetrics.audioSize = blob.size;

	const buffer = Buffer.from(await blob.arrayBuffer());
	const sttModel = getConfiguredSTTModel();
	console.log(`🎤 Transcrição (${sttModel}): ${blob.size} bytes`);
	console.log(
		`⏱️ Início: ${new Date(transcriptionMetrics.audioStartTime).toLocaleTimeString()}.${
			transcriptionMetrics.audioStartTime % 1000
		}`,
	);

	// Roteia para o modelo configurado
	if (sttModel === 'vosk-local') {
		return await transcribeVoskComplete(buffer, source);
	} else if (sttModel === 'whisper-cpp-local' || sttModel === 'whisper-1') {
		return await transcribeWhisperComplete(buffer, source);
	} else {
		// 🔥 [CRÍTICO] Modelo desconhecido = ERRO, não fallback!
		throw new Error(
			`Modelo STT desconhecido: ${sttModel}. Configure um modelo válido em "Configurações → API e Modelos"`,
		);
	}
}

async function transcribeAudioPartial(blob) {
	const buffer = Buffer.from(await blob.arrayBuffer());
	const sttModel = getConfiguredSTTModel();

	if (sttModel === 'vosk-local') {
		return await transcribeVoskPartial(buffer, source);
	} else if (sttModel === 'whisper-cpp-local' || sttModel === 'whisper-1') {
		return await transcribeWhisperPartial(buffer, source);
	} else {
		// 🔥 [CRÍTICO] Modelo desconhecido = ERRO, não fallback!
		console.warn(`⚠️ Modelo STT desconhecido em transcribeAudioPartial: ${sttModel}`);
		return ''; // Retorna vazio para parcial desconhecido
	}
}

/* ===============================
   TRANSCRIÇÃO VOSK (MODO ENTREVISTA)
=============================== */

let voskAccumulatedText = ''; // Acumula resultado parcial do Vosk
let voskPartialTimer = null;
let voskScriptProcessor = null; // ScriptProcessorNode para capturar PCM bruto
let voskAudioBuffer = []; // Acumula PCM entre envios

/* ===============================
   DISPOSITIVOS / CONTROLE DE ÁUDIO
=============================== */

async function startAudio() {
	debugLogRenderer('Início da função: "startAudio"');

	// 🔥 [NOVO ORQUESTRADOR] Detecta modelo STT e roteia
	const sttModel = getConfiguredSTTModel();
	console.log(`🎤 startAudio: Modelo STT = ${sttModel}`);

	try {
		// 🔥 ROTEAMENTO: Por modelo STT
		if (sttModel === 'deepgram') {
			console.log('🌊 Roteando para startAudioDeepgram');
			await startAudioDeepgram(UIElements);
		} else {
			// 🔥 Inicia servidor Whisper se necessário
			if (sttModel === 'whisper-cpp-local') {
				const serverStarted = await ipcRenderer.invoke('start-whisper-server');
				if (serverStarted) {
					console.log('✅ Servidor Whisper.cpp iniciado');
				}
			}

			console.log('🎤 Roteando para startInputOutput (Vosk/OpenAI)');
			await startInputOutput();
		}
	} catch (error) {
		console.error('❌ Erro em startAudio:', error);
		throw error;
	}

	debugLogRenderer('Fim da função: "startAudio"');
}

/**
 * 🎤 Inicia captura INPUT (você) + OUTPUT (outros)
 * Usado por Vosk, OpenAI, e qualquer modelo que não é Deepgram
 */
async function startInputOutput() {
	debugLogRenderer('Início da função: "startInputOutput"');

	try {
		// Se houver dispositivo de entrada selecionado, inicia a captura de áudio
		if (UIElements.inputSelect?.value) await startInput();
		// Se houver dispositivo de saída selecionado, inicia a captura de áudio
		if (UIElements.outputSelect?.value) await startOutput();

		console.log('✅ startInputOutput: INPUT + OUTPUT iniciados');
	} catch (error) {
		console.error('❌ Erro em startInputOutput:', error);
		throw error;
	}

	debugLogRenderer('Fim da função: "startInputOutput"');
}

async function stopAudio() {
	debugLogRenderer('Início da função: "stopAudio"');

	if (currentQuestion.text) closeCurrentQuestionForced();

	const sttModel = getConfiguredSTTModel();
	console.log(`🛑 stopAudio: Modelo STT = ${sttModel}`);

	try {
		// 🔥 ROTEAMENTO: Por modelo STT
		if (sttModel === 'deepgram') {
			console.log('🌊 Rotando para stopAudioDeepgram');
			await stopAudioDeepgram();

			// Fecha pergunta atual se estava aberta
			if (currentQuestion.text) closeCurrentQuestionForced();
		} else {
			console.log('🎤 Rotando para stopInputOutput (Vosk/OpenAI)');
			await stopInputOutput();
		}

		// 🔥 Para servidor Whisper se necessário
		if (sttModel === 'whisper-cpp-local') {
			await ipcRenderer.invoke('stop-whisper-server');
			console.log('🛑 Servidor Whisper.cpp parado');
		}
	} catch (error) {
		console.error('❌ Erro em stopAudio:', error);
	}

	debugLogRenderer('Fim da função: "stopAudio"');
}

/**
 * 🛑 Para captura INPUT (você) + OUTPUT (outros)
 * Usado por Vosk, OpenAI, e qualquer modelo que não é Deepgram
 */
async function stopInputOutput() {
	debugLogRenderer('Início da função: "stopInputOutput"');

	try {
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

		console.log('✅ stopInputOutput: INPUT + OUTPUT parados');
	} catch (error) {
		console.error('❌ Erro em stopInputOutput:', error);
	}

	debugLogRenderer('Fim da função: "stopInputOutput"');
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

			// PROTEÇÃO CRÍTICA: Se lastInputStartAt for null/undefined, usar stopAt como fallback
			// MAS não usar para calcular duration (isso causaria grav 0ms)
			const actualStartTime =
				lastInputStartAt !== null && lastInputStartAt !== undefined ? lastInputStartAt : lastInputStopAt;

			const recordingDuration = lastInputStopAt - actualStartTime;

			// Logs detalhados para debug
			console.log('⏱️ Parada:', new Date(lastInputStopAt).toLocaleTimeString());
			if (lastInputStartAt !== null && lastInputStartAt !== undefined) {
				console.log('⏱️ Início:', new Date(lastInputStartAt).toLocaleTimeString());
			} else {
				console.warn('⚠️ AVISO: lastInputStartAt é null/undefined! Usando lastInputStopAt como fallback.');
				lastInputStartAt = lastInputStopAt;
			}
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
				// SEMPRE salvar startAt se estiver disponível (até que 0 é válido, não null)
				if (lastInputStartAt !== null && lastInputStartAt !== undefined) {
					lastInputPlaceholderEl.dataset.startAt = lastInputStartAt;
				} else {
					// Se startAt não foi setado corretamente, usar stopAt como fallback
					lastInputPlaceholderEl.dataset.startAt = lastInputStopAt;
				}
			}

			// ✅ CHAMADA CRÍTICA: Transcreve o áudio capturado
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
					'| inputSpeaking =',
					inputSpeaking,
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
				console.log(
					'⏹️ parando gravação de entrada por silêncio (inputRecorder.stop) | lastInputStartAt =',
					lastInputStartAt ? new Date(lastInputStartAt).toLocaleTimeString() : 'NULL',
				);
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

			// 🔥 CRÍTICO: Capturar timestamps AGORA em variáveis temporárias
			// Essas variáveis são isoladas e NÃO serão sobrescritas por updateOutputVolume()
			pendingOutputStartAt = lastOutputStartAt;
			pendingOutputStopAt = lastOutputStopAt;

			// Debug: Verificar valores de lastOutputStartAt
			console.log('🔍 DEBUG outputRecorder.onstop:');
			console.log('  → lastOutputStartAt:', lastOutputStartAt, `(tipo: ${typeof lastOutputStartAt})`);
			console.log('  → lastOutputStopAt:', lastOutputStopAt, `(tipo: ${typeof lastOutputStopAt})`);
			console.log('  → 🔥 Capturado em pending: start=', pendingOutputStartAt, 'stop=', pendingOutputStopAt);

			// Calcula duração com proteção contra valores inválidos
			let recordingDuration = 0;
			if (lastOutputStartAt !== null && lastOutputStartAt !== undefined && typeof lastOutputStartAt === 'number') {
				recordingDuration = lastOutputStopAt - lastOutputStartAt;
			} else {
				console.warn('⚠️ AVISO: lastOutputStartAt é inválido, usando 0 como duração');
				recordingDuration = 0;
			}

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

			// Inicia a transcrição do áudio de saída (Vosk)
			// ⚠️ O placeholder será criado direto no transcribeOutput() com as métricas corretas
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
				// 🔥 [NOVO] Se houver timer de auto-close pendente, cancela
				// (novo áudio começou, então não devemos fechar agora)
				if (autoCloseQuestionTimer) {
					console.log('⏸️ Auto-close cancelado: novo áudio detectado!');
					clearTimeout(autoCloseQuestionTimer);
					autoCloseQuestionTimer = null;
				}

				// RESET: Limpa valores da frase anterior ANTES de iniciar nova frase
				lastOutputPlaceholderEl = null;
				lastOutputStopAt = null;
				// Nota: lastOutputStartAt será atualizado abaixo
				console.log('🧹 LIMPAR: Resetando lastOutputPlaceholderEl e lastOutputStopAt ANTES de nova frase');

				// Define o estado de outputSpeaking como true
				outputSpeaking = true;
				// Limpa o array de chunks de saída
				outputChunks = [];

				// Define o momento exato em que a gravação de saída foi iniciada
				lastOutputStartAt = Date.now();

				console.log('🎙️ Início: ' + new Date(lastOutputStartAt).toLocaleTimeString());
				console.log('📊 lastOutputStartAt definido para:', lastOutputStartAt);

				// 🔥 PASSO 1: Criar placeholder IMEDIATAMENTE quando fala inicia
				// Isso garante que "Outros: ..." apareça na tela assim que detecta fala
				try {
					// 🔥 Gerar ID ANTES de criar o placeholder
					lastOutputPlaceholderId = 'placeholder-' + lastOutputStartAt + '-' + Math.random();
					// 🔥 Passar o ID para ser atribuído ao elemento real no DOM
					lastOutputPlaceholderEl = addTranscript(OTHER, '...', lastOutputStartAt, lastOutputPlaceholderId);
					if (lastOutputPlaceholderEl && lastOutputPlaceholderEl.dataset) {
						lastOutputPlaceholderEl.dataset.startAt = lastOutputStartAt;
						lastOutputPlaceholderEl.dataset.stopAt = lastOutputStartAt; // provisório, será atualizado
					}
					console.log('✨ Placeholder criado no início da fala para "Outros" (id=' + lastOutputPlaceholderId + ')');
				} catch (err) {
					console.warn('⚠️ Falha ao criar placeholder no início:', err);
				}

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
				handleSpeech(YOU, partialText, { skipAddToUI: true });
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
		const blobSize = blob.size;
		outputPartialChunks = [];

		try {
			const partialStart = Date.now();
			const buffer = Buffer.from(await blob.arrayBuffer());
			const partialText = (await transcribeAudioPartial(blob))?.trim();
			const partialDuration = Date.now() - partialStart;

			if (partialText && !isGarbageSentence(partialText)) {
				console.log(`⚡ PARCIAL: ${blobSize}bytes → "${partialText.substring(0, 50)}" em ${partialDuration}ms`);
				addTranscript(OTHER, partialText);
				// NÃO chamar handleSpeech aqui - evita consolidação nas parciais
				// consolidação só acontece em transcribeOutput() para o áudio final
			}
		} catch (err) {
			console.warn('⚠️ erro na transcrição parcial (OUTPUT)', err);
		}
	}, 100); // 🔥 OTIMIZADO: debounce reduzido para 100ms (era 180) para latência menor

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
		// Extrai timestamps do dataset (sempre como números, nunca null)
		const stop = lastInputPlaceholderEl.dataset.stopAt
			? Number(lastInputPlaceholderEl.dataset.stopAt)
			: lastInputStopAt;

		// Para startAt, SEMPRE preferir dataset (mesmo que seja 0), nunca deixar undefined
		const start =
			lastInputPlaceholderEl.dataset.startAt !== undefined
				? Number(lastInputPlaceholderEl.dataset.startAt)
				: lastInputStartAt !== null && lastInputStartAt !== undefined
				? lastInputStartAt
				: stop;

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
		console.log('🗑️ Resetando timestamps: lastInputStartAt = null, lastInputStopAt = null');
		lastInputStartAt = null;
	} else {
		addTranscript(YOU, text);
	}

	handleSpeech(YOU, text, { skipAddToUI: true });

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

		// ⚠️ [NOVO] Se é lixo, loga mas NÃO retorna - deixa passar para aparecer na UI
		if (isGarbageSentence(text)) {
			console.log('🗑️ transcribeOutput: É frase de lixo, mas permitindo que apareça na Transcrição:', text);
			// NÃO retorna! Deixa a frase passar para emitir placeholder
		}

		// Se existia um placeholder (timestamp do stop), atualiza esse placeholder com o texto final e latência
		if (lastOutputPlaceholderEl && lastOutputPlaceholderEl.dataset) {
			console.log('🔄 Atualizando placeholder com transcrição final...');

			// 🔥 USAR VARIÁVEIS PENDENTES (imunes a race condition)
			// Essas variáveis foram capturadas em onstop() e não foram sobrescritas por updateOutputVolume()
			const stop = pendingOutputStopAt || lastOutputStopAt;
			const start = pendingOutputStartAt || lastOutputStartAt || stop;

			// Debug: verificar se pending* foi usada
			console.log(
				'🔥 DEBUG transcribeOutput: pendingOutputStopAt=' +
					pendingOutputStopAt +
					', pendingOutputStartAt=' +
					pendingOutputStartAt,
			);

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
			// 🔥 PASSA O ID DO PLACEHOLDER para que config-manager atualize o elemento CORRETO
			emitUIChange('onPlaceholderFulfill', {
				speaker: OTHER,
				text,
				stopStr,
				startStr,
				recordingDuration,
				latency,
				total,
				placeholderId: lastOutputPlaceholderId, // 🔥 ESSENCIAL para encontrar o placeholder correto
			});

			// reseta variáveis de placeholder
			lastOutputPlaceholderEl = null;
			// NÃO resetar lastOutputStopAt e lastOutputStartAt aqui!
			// Eles serão preservados para timing correto da próxima frase
			// Serão resetados apenas quando uma NOVA frase inicia em updateOutputVolume()
			console.log(
				'🧹 RESET #1: lastOutputPlaceholderEl resetado | lastOutputStartAt/StopAt PRESERVADOS para próxima frase',
			);

			// processa a fala transcrita (consolidação de perguntas)
			// Usa Date.now() para pegar o tempo exato que chegou no renderer
			console.log('entrou aqui no if do placeholder existente');
			handleSpeech(OTHER, text, { skipAddToUI: true });
		} else {
			// Sem placeholder - cria placeholder e emite fulfill para garantir métricas
			console.log('➕ Nenhum placeholder existente - criando e preenchendo com métricas');
			// 🔥 USAR VARIÁVEIS PENDENTES (imunes a race condition)
			const stop = pendingOutputStopAt || lastOutputStopAt || Date.now();
			const start = pendingOutputStartAt || lastOutputStartAt || stop;

			// Debug: verificar se pending* foi usada
			console.log(
				'🔥 DEBUG transcribeOutput: pendingOutputStopAt=' +
					pendingOutputStopAt +
					', pendingOutputStartAt=' +
					pendingOutputStartAt,
			);

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
			const elIdForFallback = 'placeholder-' + start + '-' + Math.random();
			const placeholderEl = addTranscript(OTHER, '...', start, elIdForFallback);

			if (placeholderEl && placeholderEl.dataset) {
				placeholderEl.dataset.startAt = start;
				placeholderEl.dataset.stopAt = stop;
			}

			// Emite atualização final para preencher o placeholder com texto e métricas
			// 🔥 PASSA O ID DO PLACEHOLDER para que config-manager atualize o elemento CORRETO
			emitUIChange('onPlaceholderFulfill', {
				speaker: OTHER,
				text,
				stopStr,
				startStr,
				recordingDuration,
				latency,
				total,
				placeholderId: elIdForFallback, // 🔥 ESSENCIAL para encontrar o placeholder correto
			});

			// reseta variáveis de placeholder
			console.log(
				'🧹 RESET #2: lastOutputPlaceholderEl resetado | lastOutputStartAt/StopAt PRESERVADOS para próxima frase',
			);
			lastOutputPlaceholderEl = null;
			// NÃO resetar lastOutputStopAt e lastOutputStartAt aqui!
			// Eles serão preservados para timing correto da próxima frase

			// processa a fala transcrita (consolidação de perguntas)
			// Usa Date.now() para pegar o tempo exato que chegou no renderer
			console.log('entrou aqui no else do placeholder inexistente');
			handleSpeech(OTHER, text, { skipAddToUI: true });
		}

		// 🔥 Limpar variáveis pendentes após transcrição completa
		// Elas já foram usadas para calcular métricas, agora podem ser limpas
		console.log('🧹 RESET #3: Limpando pendingOutputStartAt e pendingOutputStopAt');
		pendingOutputStartAt = null;
		pendingOutputStopAt = null;

		// 🔥 [NOVO] MODO ENTREVISTA: Emitir evento de transcrição completa
		// O listener em DOMContentLoaded cuidará do timer de auto-close
		if (ModeController.isInterviewMode() && currentQuestion.text) {
			console.log('🎤 transcribeOutput: Emitindo evento STT onTranscriptionComplete');

			// Emite evento para todas as camadas superiores (agnóstico ao modelo)
			emitSTTEvent('transcriptionComplete', {
				text: currentQuestion.text,
				speaker: OTHER,
				isFinal: true,
				model: 'vosk-or-openai', // Vosk/OpenAI compartilham este fluxo
			});
		}
	} catch (err) {
		console.warn('⚠️ erro na transcrição (OUTPUT)', err);
	}

	debugLogRenderer('Fim da função: "transcribeOutput"');
}

/* ===============================
   CONSOLIDAÇÃO DE PERGUNTAS
=============================== */

function handleSpeech(author, text, options = {}) {
	debugLogRenderer('Início da função: "handleSpeech"');

	const cleaned = text.replace(/Ê+|hum|ahn/gi, '').trim();
	console.log('🔊 handleSpeech', { author, raw: text, cleaned });

	// ignora frases muito curtas
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
		// ⚠️ IMPORTANTE: Consolida ANTES de fechar, para evitar perder falas intermidiárias
		if (
			currentQuestion.text &&
			looksLikeQuestion(cleaned) &&
			now - currentQuestion.lastUpdate > 500 &&
			!currentQuestion.finalized &&
			!isGarbageSentence(cleaned) // 🔥 NÃO consolidar lixo com pergunta real
		) {
			// 🔀 CONSOLIDAÇÃO: Adiciona a fala atual antes de fechar a pergunta anterior
			// Isso garante que "explique o que é... Y" seja parte da pergunta "Vou começar... X"
			console.log('🔀 [IMPORTANTE] Consolidando nova fala com pergunta atual antes de fechar:', {
				current: currentQuestion.text,
				new: cleaned,
				currentLength: currentQuestion.text.length,
				newLength: cleaned.length,
				cleanedIsGarbage: isGarbageSentence(cleaned),
			});
			const beforeConsolidate = currentQuestion.text;
			currentQuestion.text += (currentQuestion.text ? ' ' : '') + cleaned;
			currentQuestion.lastUpdateTime = now;
			currentQuestion.lastUpdate = now;
			console.log('🔀 [IMPORTANTE] Após consolidação:', {
				before: beforeConsolidate,
				after: currentQuestion.text,
				finalLength: currentQuestion.text.length,
			});

			closeCurrentQuestion();

			// 🛑 Retorna para evitar processar a mesma fala novamente abaixo
			renderCurrentQuestion();
			debugLogRenderer('Fim da função: "handleSpeech"');
			return;
		}

		// evita criar novo turno se a transcrição final for igual à última pergunta já enviada
		if (lastSentQuestionText && cleaned.trim() === lastSentQuestionText) {
			console.log('🔕 transcrição igual à última pergunta enviada — ignorando novo turno');
			return;
		}

		// 🔥 [NOVO] Se a fala é lixo (confirmação, interjeição), NÃO consolida em CURRENT
		// Mas ainda aparece na Transcrição (porque onPlaceholderFulfill já foi emitido)
		if (isGarbageSentence(cleaned)) {
			console.log('🗑️ handleSpeech: frase é lixo, NÃO consolidando em CURRENT =', cleaned);
			// Não retorna! Deixa processar abaixo caso precise
		}

		if (!currentQuestion.text) {
			currentQuestion.createdAt = Date.now();
			currentQuestion.lastUpdateTime = Date.now();
			interviewTurnId++; // 🔥 novo turno
		}

		// evita duplicação quando a mesma frase parcial/final chega novamente
		if (currentQuestion.text && normalizeForCompare(currentQuestion.text) === normalizeForCompare(cleaned)) {
			console.log('🔁 speech igual ao currentQuestion — ignorando concatenação');
		} else if (!isGarbageSentence(cleaned)) {
			// 🔥 [NOVO] Só consolida se NÃO for lixo
			currentQuestion.text += (currentQuestion.text ? ' ' : '') + cleaned;
			currentQuestion.lastUpdateTime = now;
		}
		currentQuestion.lastUpdate = now;

		// 🟦 CURRENT vira seleção padrão ao receber fala
		if (!selectedQuestionId) {
			selectedQuestionId = CURRENT_QUESTION_ID;
			clearAllSelections();
		}

		// 🔥 NOVO: Adiciona TUDO à conversa visual em tempo real
		// (mesmo lixo, para o usuário ver o que foi transcrito)
		console.log('💬 Adicionando à conversa:', cleaned);
		if (!options.skipAddToUI) {
			addTranscript(OTHER, cleaned, now);
		} else {
			console.log('⚪ addTranscript pulado por skipAddToUI');
		}

		renderCurrentQuestion();
	}

	debugLogRenderer('Fim da função: "handleSpeech"');
}

/**
 * 🔥 handleCurrentQuestion - Fluxo específico para Deepgram OUTPUT
 * Similar ao handleSpeech, mas focado em consolidar transcrições no CURRENT
 * sem lógicas de fechamento ou detecção de perguntas. Apenas concatena e renderiza.
 * Usado para interims e finais do Deepgram output.
 */
function handleCurrentQuestion(author, text, options = {}) {
	debugLogRenderer('Início da função: "handleCurrentQuestion"');

	const cleaned = text.replace(/Ê+|hum|ahn/gi, '').trim();
	console.log('🔊 handleCurrentQuestion', { author, raw: text, cleaned, isInterim: options.isInterim });

	// ignora frases muito curtas
	if (cleaned.length < 3) return;

	// Usa o tempo exato que chegou no renderer (Date.now)
	const now = Date.now();

	if (author === OTHER) {
		// Inicializa timestamps se for a primeira fala
		if (!currentQuestion.text) {
			currentQuestion.createdAt = Date.now();
			currentQuestion.lastUpdateTime = Date.now();
			interviewTurnId++; // 🔥 novo turno
		}

		// Lógica de consolidação para evitar duplicações
		if (options.isInterim) {
			// Para interims: substituir o interim atual (Deepgram envia versões progressivas)
			currentQuestion.interimText = cleaned;
		} else {
			// Para finais: substituir completamente o finalText e limpar interim
			currentQuestion.finalText = cleaned;
			currentQuestion.interimText = '';

			// 🔥 Limpar timer de silêncio pois já temos final
			if (currentQuestionSilenceTimer) {
				clearTimeout(currentQuestionSilenceTimer);
				currentQuestionSilenceTimer = null;
			}
		}

		// Atualizar o texto total
		currentQuestion.text =
			currentQuestion.finalText +
			(currentQuestion.finalText && currentQuestion.interimText ? ' ' : '') +
			currentQuestion.interimText;

		currentQuestion.lastUpdateTime = now;
		currentQuestion.lastUpdate = now;

		// 🔥 TIMER DE SILÊNCIO PARA CURRENT: Reiniciar timer se for interim
		if (options.isInterim) {
			if (currentQuestionSilenceTimer) clearTimeout(currentQuestionSilenceTimer);
			currentQuestionSilenceTimer = setTimeout(() => {
				console.log('⏰ CURRENT_QUESTION_SILENCE_TIMEOUT disparado: Finalizando pergunta por silêncio');

				// 🔥 FINALIZA TRANSCRIÇÃO PENDENTE: Quando finalizamos por silêncio, força final da transcrição atual
				finalizePendingTranscription(currentQuestion.interimText, OTHER);

				finalizeCurrentQuestion();
			}, CURRENT_QUESTION_SILENCE_TIMEOUT);
		}

		// 🟦 CURRENT vira seleção padrão ao receber fala
		if (!selectedQuestionId) {
			selectedQuestionId = CURRENT_QUESTION_ID;
			clearAllSelections();
		}

		// 🔥 Adiciona à conversa visual em tempo real (sempre, para mostrar tudo)
		console.log('💬 handleCurrentQuestion: Adicionando à conversa:', cleaned);

		renderCurrentQuestion();
	}

	debugLogRenderer('Fim da função: "handleCurrentQuestion"');
}

/* ===============================
   RESET CURRENT QUESTION
=============================== */

function resetCurrentQuestion() {
	debugLogRenderer('Início da função: "resetCurrentQuestion"');

	currentQuestion = {
		text: '',
		lastUpdate: 0,
		finalized: false,
		lastUpdateTime: null,
		createdAt: null,
		finalText: '',
		interimText: '',
	};

	// 🔥 Limpar timer de silêncio
	if (currentQuestionSilenceTimer) {
		clearTimeout(currentQuestionSilenceTimer);
		currentQuestionSilenceTimer = null;
	}

	debugLogRenderer('Fim da função: "resetCurrentQuestion"');
}

/* ===============================
   FINALIZAÇÃO DE PERGUNTAS POR SILÊNCIO (CURRENT TIMER)
=============================== */

/**
 * 🔥 finalizeCurrentQuestion - Finaliza pergunta atual por timeout de silêncio
 * Chamada quando não há novos interims por CURRENT_QUESTION_SILENCE_TIMEOUT
 */
function finalizeCurrentQuestion() {
	debugLogRenderer('Início da função: "finalizeCurrentQuestion"');

	// Limpar timer
	if (currentQuestionSilenceTimer) {
		clearTimeout(currentQuestionSilenceTimer);
		currentQuestionSilenceTimer = null;
	}

	// Se não há texto, ignorar
	if (!currentQuestion.text || !currentQuestion.text.trim()) {
		console.log('⚠️ finalizeCurrentQuestion: Sem texto para finalizar');
		return;
	}

	console.log('✅ finalizeCurrentQuestion: Finalizando pergunta por silêncio:', currentQuestion.text);

	// 🔒 GUARDA ABSOLUTA: Se a pergunta já foi finalizada, NÃO faça nada.
	if (currentQuestion.finalized) {
		console.log('⛔ finalizeCurrentQuestion ignorado — pergunta já finalizada');
		return;
	}

	// Trata perguntas incompletas
	if (isIncompleteQuestion(currentQuestion.text)) {
		// 🔥 No modo entrevista, ignorar incompleta e forçar finalização
		if (ModeController.isInterviewMode()) {
			console.log('⚠️ pergunta incompleta detectada, mas modo entrevista ativo — forçando finalização');
		} else {
			console.log('⚠️ pergunta incompleta detectada — promovendo ao histórico como incompleta:', currentQuestion.text);

			const newId = String(questionsHistory.length + 1);
			questionsHistory.push({
				id: newId,
				text: currentQuestion.text,
				createdAt: currentQuestion.createdAt || Date.now(),
				lastUpdateTime: currentQuestion.lastUpdateTime || currentQuestion.createdAt || Date.now(),
				incomplete: true,
			});

			selectedQuestionId = newId;
			resetCurrentQuestion();
			renderQuestionsHistory();
			return;
		}
	}

	// Verifica se parece uma pergunta
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
				console.log('➡️ finalizeCurrentQuestion (fallback) chamou askGpt', {
					interviewTurnId,
					gptRequestedTurnId,
					gptAnsweredTurnId,
				});

				askGpt();
				resetCurrentQuestion();
			}
			return;
		}

		// modo normal mantém comportamento atual
		resetCurrentQuestion();
		renderCurrentQuestion();
		return;
	}

	// ✅ consolida a pergunta
	currentQuestion.text = finalizeQuestion(currentQuestion.text);
	currentQuestion.lastUpdateTime = Date.now();
	currentQuestion.finalized = true;

	// 🔥 COMPORTAMENTO POR MODO
	if (ModeController.isInterviewMode()) {
		if (gptRequestedTurnId !== interviewTurnId && gptAnsweredTurnId !== interviewTurnId) {
			selectedQuestionId = CURRENT_QUESTION_ID;

			console.log('➡️ finalizeCurrentQuestion chamou askGpt (vou enviar para o GPT)', {
				interviewTurnId,
				gptRequestedTurnId,
				gptAnsweredTurnId,
			});

			askGpt();
		}
	} else {
		console.log('🔵 modo NORMAL — promovendo CURRENT para histórico sem chamar GPT');

		promoteCurrentToHistory(currentQuestion.text);
		resetCurrentQuestion();
		renderCurrentQuestion();
	}

	debugLogRenderer('Fim da função: "finalizeCurrentQuestion"');
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

		const newId = String(questionsHistory.length + 1);
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

				//console.error('closeCurrentQuestion: askGpt() 2281; 🔒 COMENTADA até transcrição em tempo real funcionar');
				askGpt(); // 🔒 COMENTADA até transcrição em tempo real funcionar
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

			//console.error('closeCurrentQuestion: askGpt() 2318; 🔒 COMENTADA até transcrição em tempo real funcionar');
			askGpt(); // 🔒 COMENTADA até transcrição em tempo real funcionar
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

	// 🔥 Validações rigorosas para impedir lixo
	if (!text || text.trim().length < 5) {
		updateStatusMessage('⚠️ Pergunta vazia ou incompleta');
		return;
	}

	// Detecta se é lixo ANTES de enviar ao GPT
	if (isGarbageSentence(text)) {
		console.log('🚫 askGpt bloqueado: texto é lixo =', text);
		updateStatusMessage('⚠️ Frase não é uma pergunta válida');
		return;
	}

	// Verifica se tem uma pergunta real ("?" ou começa com palavra típica)
	if (!looksLikeQuestion(text)) {
		console.log('🚫 askGpt bloqueado: não parece pergunta =', text);
		updateStatusMessage('⚠️ Frase não é uma pergunta (falta ? ou começo de pergunta)');

		// No modo entrevista, força mesmo assim (permitir perguntas um pouco imprecisas)
		if (!ModeController.isInterviewMode()) {
			return;
		}
		console.log('ℹ️ modo entrevista: enviando mesmo assim...');
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
			// emitUIChange('onAnswerAdd', {
			// 	questionId,
			// 	action: 'showExisting',
			// });
			updateStatusMessage('📌 Essa pergunta já foi respondida');
			return;
		}
	}

	// limpa destaque
	// emitUIChange('onAnswerAdd', {
	// 	questionId,
	// 	action: 'clearActive',
	// });

	// log temporario para testar a aplicação só remover depois
	console.log('🤖 askGpt chamado | questionId:', selectedQuestionId);
	console.log('🧪 GPT RECEBERIA:', text);

	console.log('🧾 askGpt diagnóstico', {
		textLength: text.length,
		selectedQuestionId,
		questionId_variable: questionId, // 🔥 DEBUG: mostrar a variável questionId
		isInterviewMode: ModeController.isInterviewMode(),
		interviewTurnId,
		gptAnsweredTurnId,
	});

	// marca que este turno teve uma requisição ao GPT (apenas para CURRENT)
	if (isCurrent) {
		gptRequestedTurnId = interviewTurnId;
		gptRequestedQuestionId = CURRENT_QUESTION_ID; // 🔥 [IMPORTANTE] Rastreia qual pergunta foi solicitada
		lastAskedQuestionNormalized = normalizedText;
		console.log('ℹ️ gptRequestedTurnId definido para turno', gptRequestedTurnId);
		console.log('ℹ️ gptRequestedQuestionId definido para:', gptRequestedQuestionId);
		lastSentQuestionText = text.trim();
		console.log('ℹ️ lastSentQuestionText definido:', lastSentQuestionText);
	}

	// Inicia medição do GPT
	transcriptionMetrics.gptStartTime = Date.now();

	// � MODO ENTREVISTA — STREAMING
	if (ModeController.isInterviewMode()) {
		const gptStartAt = ENABLE_INTERVIEW_TIMING_DEBUG ? Date.now() : null;
		let streamedText = '';

		console.log('⏳ enviando para o GPT via stream...');

		// 🔥 Não preparar bloco antes - deixar o primeiro token criar (mais rápido!)

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

			// 🔥 PROTEÇÃO: Valida se o questionId ainda é válido
			// (evita renderizar em question ID antigo/inválido)
			if (
				!questionId ||
				(isCurrent && gptRequestedQuestionId !== CURRENT_QUESTION_ID) ||
				(!isCurrent && !questionsHistory.find(q => q.id === questionId))
			) {
				console.warn('🚨 onChunk: questionId inválido ou desatualizado, ignorando token:', {
					questionId,
					isCurrent,
					gptRequestedQuestionId,
					token,
				});
				return;
			}

			// 🔥 DEBUG: Log para rastrear qual questionId está sendo enviado
			if (streamedText.length <= 50) {
				console.log('🎬 [onChunk] Enviando para onAnswerStreamChunk:', {
					questionId,
					gptRequestedQuestionId,
					token,
					accumLength: streamedText.length,
				});
			}

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
			const requestedQuestionId = gptRequestedQuestionId; // 🔥 Qual pergunta foi REALMENTE solicitada

			gptAnsweredTurnId = interviewTurnId;
			gptRequestedTurnId = null;
			gptRequestedQuestionId = null; // 🔥 Limpa após usar

			// 🔒 RENDERIZAR A RESPOSTA COM O ID CORRETO
			if (requestedQuestionId) {
				// const finalHtml = marked.parse(finalText); // Resposta já renderizada via streaming

				console.log('✅ GPT_STREAM_END: Renderizando resposta para pergunta solicitada:', {
					requestedQuestionId,
					wasRequestedForThisTurn,
				});

				// Se a pergunta solicitada foi CURRENT, promover para history ANTES de renderizar
				if (requestedQuestionId === CURRENT_QUESTION_ID && currentQuestion.text) {
					console.log('🔄 GPT_STREAM_END: Promovendo CURRENT para history antes de renderizar resposta');
					promoteCurrentToHistory(currentQuestion.text);

					// Pega a pergunta recém-promovida
					const promotedQuestion = questionsHistory[questionsHistory.length - 1];
					if (promotedQuestion) {
						// Renderiza com o ID da pergunta promovida
						// renderGptAnswer(promotedQuestion.id, finalHtml); // Resposta já renderizada via streaming
						promotedQuestion.answered = true;
						answeredQuestions.add(promotedQuestion.id);
						renderQuestionsHistory();
						console.log('✅ Resposta renderizada para pergunta promovida:', promotedQuestion.id);
					} else {
						console.warn('⚠️ Pergunta promovida não encontrada');
						// renderGptAnswer(requestedQuestionId, finalHtml); // Resposta já renderizada via streaming
					}
				} else {
					// Para perguntas do histórico, renderiza com o ID recebido
					// renderGptAnswer(requestedQuestionId, finalHtml); // Resposta já renderizada via streaming
					answeredQuestions.add(requestedQuestionId);

					// Se for do histórico, atualiza o flag também
					if (requestedQuestionId !== CURRENT_QUESTION_ID) {
						try {
							const q = questionsHistory.find(x => x.id === requestedQuestionId);
							if (q) {
								q.answered = true;
								renderQuestionsHistory();
							}
						} catch (err) {
							console.warn('⚠️ falha ao marcar pergunta como respondida:', err);
						}
					}
				}

				resetInterviewTurnState();
			} else {
				// 🔥 Nenhuma pergunta foi rastreada como solicitada
				console.warn('⚠️ GPT_STREAM_END mas nenhuma pergunta solicitada foi encontrada');
				resetInterviewTurnState();
			}

			// 🔥 Notificar config-manager que stream terminou (para limpar info de streaming)
			globalThis.RendererAPI?.emitUIChange?.('onAnswerStreamEnd', {});
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

	// 🔥 COMENTADO: renderGptAnswer(questionId, res);
	// Apenas streaming será exibido

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

function addTranscript(author, text, time, elementId = null) {
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
		placeholderId: elementId, // 🔥 PASSAR ID PARA SER ATRIBUÍDO AO ELEMENTO REAL
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

// Função principal para o botão de iniciar/parar escuta (Começar a Ouvir... (Ctrl+d))
async function listenToggleBtn() {
	debugLogRenderer('Início da função: "listenToggleBtn"');

	if (!isRunning) {
		console.log('🎤 listenToggleBtn: Tentando INICIAR escuta...');

		// 🔥 VALIDAÇÃO 1: Modelo de IA ativo
		const { active: hasModel, model: activeModel } = hasActiveModel();
		console.log(`📊 DEBUG: hasModel = ${hasModel}, activeModel = ${activeModel}`);

		if (!hasModel) {
			const errorMsg = 'Ative um modelo de IA antes de começar a ouvir';
			console.warn(`⚠️ ${errorMsg}`);
			console.log('📡 DEBUG: Emitindo onError:', errorMsg);
			emitUIChange('onError', errorMsg);
			return;
		}

		// 🔥 VALIDAÇÃO 2: Dispositivo de áudio de SAÍDA (obrigatório para ouvir a reunião)
		const hasOutputDevice = UIElements.outputSelect?.value;
		console.log(`📊 DEBUG: hasOutputDevice = ${hasOutputDevice}`);

		if (!hasOutputDevice) {
			const errorMsg = 'Selecione um dispositivo de áudio (output) para ouvir a reunião';
			console.warn(`⚠️ ${errorMsg}`);
			console.log('📡 DEBUG: Emitindo onError:', errorMsg);
			emitUIChange('onError', errorMsg);
			return;
		}
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

	console.log(`🎤 Listen toggle: ${isRunning ? 'INICIANDO' : 'PARANDO'}`);
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
				questionId: questionId,
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
	//console.error('closeCurrentQuestion: askGpt() 2978; 🔒 COMENTADA até transcrição em tempo real funcionar');
	askGpt(); // 🔒 COMENTADA até transcrição em tempo real funcionar

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
   SCREENSHOT CAPTURE - FUNÇÕES
=============================== */

/**
 * Captura screenshot discretamente e armazena em memória
 */
async function captureScreenshot() {
	if (isCapturing) {
		console.log('⏳ Captura já em andamento...');
		return;
	}

	isCapturing = true;
	updateStatusMessage('📸 Capturando tela...');

	try {
		const result = await ipcRenderer.invoke('CAPTURE_SCREENSHOT');

		if (!result.success) {
			console.warn('⚠️ Falha na captura:', result.error);
			updateStatusMessage(`❌ ${result.error}`);
			emitUIChange('onScreenshotBadgeUpdate', {
				count: capturedScreenshots.length,
				visible: capturedScreenshots.length > 0,
			});
			return;
		}

		// ✅ Armazena referência do screenshot
		capturedScreenshots.push({
			filepath: result.filepath,
			filename: result.filename,
			timestamp: result.timestamp,
			size: result.size,
		});

		console.log(`✅ Screenshot capturado: ${result.filename}`);
		console.log(`📦 Total em memória: ${capturedScreenshots.length}`);

		// Atualiza UI
		updateStatusMessage(`✅ ${capturedScreenshots.length} screenshot(s) capturado(s)`);
		emitUIChange('onScreenshotBadgeUpdate', {
			count: capturedScreenshots.length,
			visible: true,
		});
	} catch (error) {
		console.error('❌ Erro ao capturar screenshot:', error);
		updateStatusMessage('❌ Erro na captura');
	} finally {
		isCapturing = false;
	}
}

/**
 * Envia screenshots para análise com OpenAI Vision
 */
async function analyzeScreenshots() {
	if (isAnalyzing) {
		console.log('⏳ Análise já em andamento...');
		return;
	}

	if (capturedScreenshots.length === 0) {
		console.warn('⚠️ Nenhum screenshot para analisar');
		updateStatusMessage('⚠️ Nenhum screenshot para analisar (capture com Ctrl+Shift+F)');
		return;
	}

	isAnalyzing = true;
	updateStatusMessage(`🔍 Analisando ${capturedScreenshots.length} screenshot(s)...`);

	try {
		// Extrai caminhos dos arquivos
		const filepaths = capturedScreenshots.map(s => s.filepath);

		console.log('🚀 Enviando para análise:', filepaths);

		// Envia para main.js
		const result = await ipcRenderer.invoke('ANALYZE_SCREENSHOTS', filepaths);

		if (!result.success) {
			console.error('❌ Falha na análise:', result.error);
			updateStatusMessage(`❌ ${result.error}`);
			return;
		}

		// ✅ Renderiza resposta do GPT
		const questionText = `📸 Análise de ${capturedScreenshots.length} screenshot(s)`;
		// 🔢 USA ID SEQUENCIAL COMO AS PERGUNTAS NORMAIS (não UUID)
		const questionId = String(questionsHistory.length + 1);

		// Adiciona "pergunta" ao histórico ANTES de renderizar respostas
		questionsHistory.push({
			id: questionId,
			text: questionText,
			createdAt: Date.now(),
			lastUpdateTime: Date.now(),
			answered: true,
		});

		// ✅ MARCA COMO RESPONDIDA (importante para clique não gerar duplicata)
		answeredQuestions.add(questionId);

		renderQuestionsHistory();

		// ✅ RENDERIZA VIA STREAMING (fluxo real) - usa onAnswerStreamChunk como GPT normal
		// Divide análise em tokens e emite como se fosse stream
		const analysisText = result.analysis;
		const tokens = analysisText.split(/(\s+|[.,!?;:\-\(\)\[\]{}\n])/g).filter(t => t.length > 0);

		console.log(`📸 [ANÁLISE] Simulando stream: ${tokens.length} tokens`);

		// Emite tokens assim como o GPT faz (permite UI renderizar em tempo real)
		let accumulated = '';
		for (const token of tokens) {
			accumulated += token;

			// ✅ USA O MESMO EVENTO onAnswerStreamChunk (fluxo real)
			emitUIChange('onAnswerStreamChunk', {
				questionId: questionId,
				token: token,
				accum: accumulated,
			});

			// Pequeno delay entre tokens para simular streaming real
			await new Promise(resolve => setTimeout(resolve, 2));
		}

		console.log('✅ Análise concluída e renderizada');
		updateStatusMessage('✅ Análise concluída');

		// 🗑️ Limpa screenshots após análise
		console.log(`🗑️ Limpando ${capturedScreenshots.length} screenshot(s) da memória...`);
		capturedScreenshots = [];

		// Atualiza badge
		emitUIChange('onScreenshotBadgeUpdate', {
			count: 0,
			visible: false,
		});

		// Força limpeza no sistema
		await ipcRenderer.invoke('CLEANUP_SCREENSHOTS');
	} catch (error) {
		console.error('❌ Erro ao analisar screenshots:', error);
		updateStatusMessage('❌ Erro na análise');
	} finally {
		isAnalyzing = false;
	}
}

/**
 * Limpa todos os screenshots armazenados
 */
function clearScreenshots() {
	if (capturedScreenshots.length === 0) return;

	console.log(`🗑️ Limpando ${capturedScreenshots.length} screenshot(s)...`);
	capturedScreenshots = [];

	updateStatusMessage('✅ Screenshots limpos');
	emitUIChange('onScreenshotBadgeUpdate', {
		count: 0,
		visible: false,
	});

	// Força limpeza no sistema
	ipcRenderer.invoke('CLEANUP_SCREENSHOTS').catch(err => {
		console.warn('⚠️ Erro na limpeza:', err);
	});
}

/* ===============================
   BOOT
=============================== */

marked.setOptions({
	html: true, // 🔥 Permite renderização de HTML (não escapa entidades)
	breaks: true,
	gfm: true, // GitHub Flavored Markdown
	highlight: function (code, lang) {
		if (lang && hljs.getLanguage(lang)) {
			return hljs.highlight(code, { language: lang }).value;
		}
		return hljs.highlightAuto(code).value;
	},
});

// Exporta funções públicas que o controller pode chamar
const RendererAPI = {
	// Áudio - Gravação
	startInput,
	stopInput: stopInputMonitor,
	listenToggleBtn,
	askGpt,
	startOutput,
	stopOutput: stopOutputMonitor,
	restartAudioPipeline,

	// Áudio - Monitoramento de volume
	startInputVolumeMonitoring,
	startOutputVolumeMonitoring,
	stopInputVolumeMonitoring,
	stopOutputVolumeMonitoring,
	// Entrevista - Reset (centralizado em resetAppState)
	resetAppState,

	// Modo
	changeMode: mode => {
		CURRENT_MODE = mode;
	},
	getMode: () => CURRENT_MODE,

	// Questions
	handleCurrentQuestion,
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

	// Navegacao de perguntas (Ctrl+Shift+ArrowUp/Down via globalShortcut IPC)
	navigateQuestions: direction => {
		const all = getNavigableQuestionIds();
		if (all.length === 0) return;

		let index = all.indexOf(selectedQuestionId);
		if (index === -1) {
			index = direction === 'up' ? all.length - 1 : 0;
		} else {
			index += direction === 'up' ? -1 : 1;
			index = Math.max(0, Math.min(index, all.length - 1));
		}

		selectedQuestionId = all[index];
		clearAllSelections();
		renderQuestionsHistory();
		renderCurrentQuestion();

		if (APP_CONFIG.MODE_DEBUG) {
			const msg = direction === 'up' ? '🧪 Ctrl+ArrowUp detectado (teste)' : '🧪 Ctrl+ArrowDown detectado (teste)';
			updateStatusMessage(msg);
			console.log('📌 Atalho Selecionou:', selectedQuestionId);
		}
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

	// 📸 NOVO: Screenshot functions
	captureScreenshot,
	analyzeScreenshots,
	clearScreenshots,
	getScreenshotCount: () => capturedScreenshots.length,

	// 📸 NOVO: Screenshot shortcuts
	onCaptureScreenshot: callback => {
		ipcRenderer.on('CMD_CAPTURE_SCREENSHOT', callback);
	},
	onAnalyzeScreenshots: callback => {
		ipcRenderer.on('CMD_ANALYZE_SCREENSHOTS', callback);
	},
	// Navegacao de perguntas (Ctrl+Shift+ArrowUp/Down via globalShortcut)
	onNavigateQuestions: callback => {
		ipcRenderer.on('CMD_NAVIGATE_QUESTIONS', (_, direction) => {
			callback(direction);
		});
	},

	// Emit UI changes (para config-manager enviar eventos para renderer)
	emitUIChange,
};

if (typeof module !== 'undefined' && module.exports) {
	module.exports = RendererAPI;
}

// 🔥 Expor globalmente para que config-manager possa acessar
if (typeof globalThis !== 'undefined') {
	globalThis.RendererAPI = RendererAPI;
	globalThis.runMockAutoPlay = runMockAutoPlay; // 🎭 Exportar Mock autoplay
	globalThis.mockScenarioIndex = 0; // 🎭 Índice global para cenários
	globalThis.mockAutoPlayActive = false; // 🎭 Flag global para evitar múltiplas execuções
}
function debugLogRenderer(msg) {
	console.log('%c🪲 ❯❯❯❯ Debug: ' + msg + ' em renderer.js', 'color: brown; font-weight: bold;');
}

/* ===============================
   FUNÇÃO PARA LOGAR MÉTRICAS
=============================== */

function logTranscriptionMetrics() {
	if (!transcriptionMetrics.audioStartTime) return;

	const gptTime = transcriptionMetrics.gptEndTime - transcriptionMetrics.gptStartTime;
	const totalTime = transcriptionMetrics.totalTime;

	console.log(`📊 ================================`);
	console.log(`📊 MÉTRICAS DE TEMPO DETALHADAS:`);
	console.log(`📊 ================================`);
	console.log(`📊 TAMANHO ÁUDIO: ${transcriptionMetrics.audioSize} bytes`);
	console.log(`📊 GPT: ${gptTime}ms`);
	console.log(`📊 TOTAL: ${totalTime}ms`);
	console.log(`📊 GPT % DO TOTAL: ${Math.round((gptTime / totalTime) * 100)}%`);
	console.log(`📊 ================================`);

	// Reset para próxima medição
	transcriptionMetrics = {
		audioStartTime: null,
		gptStartTime: null,
		gptEndTime: null,
		totalTime: null,
		audioSize: 0,
	};
}

/* ===============================
   RESET COMPLETO (TEMPORÁRIO PARA TESTES)
=============================== */

/**
 * 🔄 Limpa tudo na seção home como se o app tivesse aberto agora
 * Funcionalidade TEMPORÁRIA para facilitar testes sem fechar a aplicação
 */
function resetHomeSection() {
	console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
	console.log('🔄 RESET COMPLETO ACIONADO PELO BOTÃO resetHomeBtn');
	console.log('════════════════════════════════════════════════════════════════════════════════════════');

	// 🔥 Usar a função centralizada de reset
	resetAppState().then(success => {
		if (success) {
			console.log('✅ Reset via resetAppState() concluído com sucesso!');
		} else {
			console.error('❌ Erro ao executar resetAppState()');
		}
		console.log('════════════════════════════════════════════════════════════════════════════════════════\n');
	});
}

// 🔥 LISTENER DO BOTÃO RESET
document.addEventListener('DOMContentLoaded', () => {
	// 🔥 Registrar listener para eventos de transcrição completa (STT)
	onSTTEvent('transcriptionComplete', data => {
		if (!ModeController.isInterviewMode()) {
			console.log('⏭️ STT Event: modo normal (não entrevista), ignorando auto-ask');
			return;
		}

		console.log('🔊 STT Event: transcriptionComplete recebido');
		console.log('   → Texto:', data.text?.substring(0, 50) + '...');
		console.log('   → Speaker:', data.speaker);
		console.log('   → Modelo:', data.model);

		// 🔥 Removido: AUTO_CLOSE_QUESTION_TIMEOUT — agora usamos apenas o silêncio para Deepgram
	});

	const resetBtn = document.getElementById('resetHomeBtn');
	if (resetBtn) {
		resetBtn.addEventListener('click', () => {
			const confirmed = confirm('⚠️ Isso vai limpar toda transcrição, histórico e respostas.\n\nTem certeza?');
			if (confirmed) {
				resetHomeSection();
			}
		});
		console.log('✅ Listener do botão reset instalado');
	} else {
		console.warn('⚠️ Botão reset não encontrado no DOM');
	}
});

/* ===============================
   MOCK / DEBUG
=============================== */

/* ===============================
   🎭 MOCK SYSTEM - Intercepta ipcRenderer
   Quando MODE_DEBUG=true, substitui respostas reais por mocks
=============================== */

// 🔍 Respostas mockadas por pergunta
const MOCK_RESPONSES = {
	'Mock - O que é JVM e para que serve?':
		'Mock - A JVM (Java Virtual Machine) é uma máquina virtual que executa bytecode Java. Ela permite que programas Java rodem em qualquer plataforma sem modificação. A JVM gerencia memória, garbage collection e fornece um ambiente isolado e seguro para execução de código.',
	'Mock - Qual a diferença entre JDK e JRE?':
		'Mock - JDK (Java Development Kit) é o kit completo para desenvolvimento, incluindo compilador, ferramentas e bibliotecas. JRE (Java Runtime Environment) contém apenas o necessário para executar aplicações Java compiladas. Todo desenvolvedor precisa do JDK, mas usuários finais precisam apenas da JRE.',
	'Mock - O que é uma classe em Java?':
		'Mock - Uma classe é o molde ou blueprint para criar objetos. Define atributos (propriedades) e métodos (comportamentos). As classes são fundamentais na programação orientada a objetos. Por exemplo, uma classe Carro pode ter atributos como cor e velocidade, e métodos como acelerar e frear.',
	'Mock - Explique sobre herança em Java':
		'Mock - Herança permite que uma classe herde propriedades e métodos de outra classe. A classe filha estende a classe pai usando a palavra-chave extends. Isso promove reutilização de código e cria uma hierarquia de classes. Por exemplo, a classe Bicicleta pode herdar de Veiculo.',
	'Mock - Como funciona polimorfismo?':
		'Mock - Polimorfismo significa muitas formas. Permite que objetos de diferentes tipos respondam a mesma chamada de método de forma diferente. Pode ser através de sobrescrita de métodos (herança) ou interface. Exemplo: diferentes animais implementam o método fazer_som() diferentemente.',
	'Mock - O que é encapsulamento?':
		'Mock - Encapsulamento é o princípio de ocultar detalhes internos da implementação. Usa modificadores de acesso como private, protected e public. Protege dados e métodos críticos, permitindo controle sobre como são acessados. É uma pilar da segurança e manutenção do código orientado a objetos.',
};

// 🎬 Cenários automáticos para teste
// screenshotsCount: 0 = sem screenshot, 1 = tira 1 foto, 2 = tira 2 fotos, etc
const MOCK_SCENARIOS = [
	{ question: 'Mock - O que é JVM e para que serve?', screenshotsCount: 1 },
	{ question: 'Mock - Qual a diferença entre JDK e JRE?', screenshotsCount: 0 },
	{ question: 'Mock - O que é uma classe em Java?', screenshotsCount: 0 },
	{ question: 'Mock - Explique sobre herança em Java', screenshotsCount: 2 },
	{ question: 'Mock - Como funciona polimorfismo?', screenshotsCount: 0 },
	{ question: 'Mock - O que é encapsulamento?', screenshotsCount: 0 },
];

let mockScenarioIndex = 0;
let mockAutoPlayActive = false;

/**
 * 🎭 Retorna resposta mockada para pergunta (busca exata ou parcial)
 */
function getMockResponse(question) {
	// Match exato
	if (MOCK_RESPONSES[question]) {
		return MOCK_RESPONSES[question];
	}

	// Match parcial
	for (const [key, value] of Object.entries(MOCK_RESPONSES)) {
		if (question.toLowerCase().includes(key.toLowerCase())) {
			return value;
		}
	}

	// Fallback
	return `Resposta mockada para: "${question}"\n\nEste é um teste do sistema em modo Mock.`;
}

/**
 * 🎭 Intercepta ipcRenderer.invoke para mockar 'ask-gpt-stream'
 * Emite eventos com pequenos delays para permitir processamento
 */
const originalInvoke = ipcRenderer.invoke;
ipcRenderer.invoke = function (channel, ...args) {
	// Intercepta análise de screenshots quando MODE_DEBUG
	// IMPORTANTE: CAPTURE_SCREENSHOT é REAL (tira foto mesmo), ANALYZE_SCREENSHOTS é MOCK (simula resposta)
	if (channel === 'ANALYZE_SCREENSHOTS' && APP_CONFIG.MODE_DEBUG) {
		console.log('📸 [MOCK] Interceptando ANALYZE_SCREENSHOTS...');
		const filepaths = args[0] || [];
		const screenshotCount = filepaths.length;

		// Retorna análise mockada
		const mockAnalysis = `
		## 📸 Análise de ${screenshotCount} Screenshot(s) - MOCK

		### Esta é uma resposta simulada para o teste do sistema.

		Para resolver o problema apresentado na captura de tela, que é o "Remove Element" do LeetCode, vamos implementar uma função em Java que remove todas as ocorrências de um valor específico de um array. A função deve modificar o array in-place e retornar o novo comprimento do array.

		Resumo do Problema
		Entrada: Um array de inteiros nums e um inteiro val que queremos remover.
		Saída: O novo comprimento do array após remover todas as ocorrências de val.
		Passos para a Solução
		Iterar pelo array: Vamos percorrer o array e verificar cada elemento.
		Manter um índice: Usaremos um índice para rastrear a posição onde devemos colocar os elementos que não são iguais a val.
		Modificar o array in-place: Sempre que encontrarmos um elemento que não é igual a val, colocamos esse elemento na posição do índice e incrementamos o índice.
		Retornar o comprimento: No final, o índice representará o novo comprimento do array.
		Implementação do Código
		Aqui está a implementação em Java:

		class Solution {
			public int removeElement(int[] nums, int val) {
				// Inicializa um índice para rastrear a nova posição
				int index = 0;

				// Percorre todos os elementos do array
				for (int i = 0; i &lt; nums.length; i++) {
					// Se o elemento atual não é igual a val
					if (nums[i] != val) {
						// Coloca o elemento na posição do índice
						nums[index] = nums[i];
						// Incrementa o índice
						index++;
					}
				}

				// Retorna o novo comprimento do array
				return index;
			}
		}

		Explicação do Código
		Classe e Método: Criamos uma classe chamada Solution e um método removeElement que recebe um array de inteiros nums e um inteiro val.
		Índice Inicial: Inicializamos uma variável index em 0.
		`;

		return Promise.resolve({
			success: true,
			analysis: mockAnalysis,
			filesAnalyzed: screenshotCount,
			timestamp: Date.now(),
		});
	}

	// Intercepta ask-gpt-stream quando MODE_DEBUG
	if (channel === 'ask-gpt-stream' && APP_CONFIG.MODE_DEBUG) {
		console.log('🎭 [MOCK] Interceptando ask-gpt-stream...');

		// Obtém a pergunta do primeiro argumento (array de mensagens)
		const messages = args[0] || [];
		const userMessage = messages.find(m => m.role === 'user');
		const questionText = userMessage ? userMessage.content : 'Pergunta desconhecida';

		// Busca resposta mockada
		const mockResponse = getMockResponse(questionText);

		// Divide em tokens (remove vazios)
		const tokens = mockResponse.split(/(\s+|[.,!?;:\-\(\)\[\]{}\n])/g).filter(t => t.length > 0);

		console.log(`🎭 [MOCK] Emitindo ${tokens.length} tokens para pergunta: "${questionText.substring(0, 50)}..."`);

		// Função para emitir tokens com pequeno delay entre eles
		async function emitTokens() {
			let accumulated = '';
			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i];
				accumulated += token;

				// Emite o evento com delay mínimo
				await new Promise(resolve => {
					setTimeout(() => {
						// ✅ CORRETO: Emite apenas o token como 2º argumento
						ipcRenderer.emit('GPT_STREAM_CHUNK', null, token);
						resolve();
					}, 5); // 5ms entre tokens
				});
			}

			// Sinaliza fim do stream após todos os tokens
			await new Promise(resolve => {
				setTimeout(() => {
					ipcRenderer.emit('GPT_STREAM_END');
					resolve();
				}, 10);
			});
		}

		// Inicia emissão de tokens de forma assíncrona
		emitTokens().catch(err => {
			console.error('❌ Erro ao emitir tokens mock:', err);
		});

		// Retorna promise resolvida imediatamente (esperado pela API)
		return Promise.resolve({ success: true });
	}

	// Todas as outras chamadas passam para o invoke real
	return originalInvoke.call(this, channel, ...args);
};

/**
 * 🎭 Executa cenários de entrevista mock automaticamente
 */
async function runMockAutoPlay() {
	if (mockAutoPlayActive) return;
	mockAutoPlayActive = true;

	while (mockScenarioIndex < MOCK_SCENARIOS.length && APP_CONFIG.MODE_DEBUG && mockAutoPlayActive) {
		const scenario = MOCK_SCENARIOS[mockScenarioIndex];
		console.log(
			`\n🎬 ════════════════════════════════════════════════════\n🎬 MOCK CENÁRIO ${mockScenarioIndex + 1}/${
				MOCK_SCENARIOS.length
			}\n🎬 ════════════════════════════════════════════════════`,
		);

		// FASE 1: Simula captura de áudio (2-4s)
		console.log(`🎤 [FASE-1] Capturando áudio da pergunta...`);
		const audioStartTime = Date.now();
		const placeholderId = `placeholder-${audioStartTime}-${Math.random()}`;

		// Emite placeholder
		emitUIChange('onTranscriptAdd', {
			author: 'Outros',
			text: '...',
			timeStr: new Date().toLocaleTimeString(),
			elementId: 'conversation',
			placeholderId: placeholderId,
		});

		// Aguarda captura
		await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

		// 🔥 CHECK: Se modo debug foi desativado, para imediatamente
		if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
			console.log('🛑 [PARADA] Modo debug desativado - parando mock autoplay');
			break;
		}

		const audioEndTime = Date.now();
		console.log(`✅ [FASE-1] Áudio capturado`);

		// Calcula latência (arredonda para inteiro - sem casas decimais)
		const latencyMs = Math.round(800 + Math.random() * 400);
		const totalMs = audioEndTime - audioStartTime + latencyMs;

		// Atualiza placeholder com texto real
		emitUIChange('onPlaceholderFulfill', {
			speaker: 'Outros',
			text: scenario.question,
			startStr: new Date(audioStartTime).toLocaleTimeString(),
			stopStr: new Date(audioEndTime).toLocaleTimeString(),
			recordingDuration: audioEndTime - audioStartTime,
			latency: latencyMs,
			total: totalMs,
			placeholderId: placeholderId,
		});

		// FASE 2: Processa pergunta (handleSpeech + closeCurrentQuestion)
		console.log(`📝 [FASE-2] Processando pergunta...`);
		handleSpeech(OTHER, scenario.question, { skipAddToUI: true });

		// Aguarda consolidação (800ms para garantir que pergunta saia do CURRENT)
		await new Promise(resolve => setTimeout(resolve, 800));

		// 🔥 CHECK: Se modo debug foi desativado, para imediatamente
		if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
			console.log('🛑 [PARADA] Modo debug desativado - parando mock autoplay');
			break;
		}

		// Simula silêncio e fecha pergunta
		console.log(`🔇 [FASE-2] Silêncio detectado, fechando pergunta...`);
		closeCurrentQuestion();

		// FASE 3: askGpt será acionado automaticamente, o interceptor (ask-gpt-stream) que irá mockar
		console.log(`🤖 [FASE-3] askGpt acionado - mock stream será emitido pelo interceptor`);

		// Aguarda stream terminar (~30ms por token)
		const mockResponse = getMockResponse(scenario.question);
		const estimatedTime = mockResponse.length * 30;
		await new Promise(resolve => setTimeout(resolve, estimatedTime + 1000));

		// 🔥 CHECK: Se modo debug foi desativado, para imediatamente SEM TIRAR SCREENSHOT
		if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
			console.log('🛑 [PARADA] Modo debug desativado - parando sem capturar screenshot');
			break;
		}

		// FASE 4 (Opcional): Captura N screenshots REAIS e depois aciona análise
		if (scenario.screenshotsCount && scenario.screenshotsCount > 0) {
			// FASE 4A: Captura múltiplos screenshots
			for (let i = 1; i <= scenario.screenshotsCount; i++) {
				// 🔥 CHECK: Verifica antes de cada screenshot
				if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
					console.log(
						`🛑 [PARADA] Modo debug desativado - cancelando captura de screenshot ${i}/${scenario.screenshotsCount}`,
					);
					break;
				}

				console.log(`📸 [FASE-4A] Capturando screenshot ${i}/${scenario.screenshotsCount} REAL da resposta...`);
				await captureScreenshot();

				// Delay entre múltiplas capturas para respeitar cooldown de 2s do main.js
				if (i < scenario.screenshotsCount) {
					console.log(`   ⏳ Aguardando 2200ms antes da próxima captura (cooldown CAPTURE_COOLDOWN)...`);
					await new Promise(resolve => setTimeout(resolve, 2200));
				}
			}

			// 🔥 CHECK: Verifica antes de análise
			if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
				console.log('🛑 [PARADA] Modo debug desativado - cancelando análise de screenshots');
				break;
			}

			// Log de validação: quantas fotos tem antes de analisar
			console.log(
				`📸 [PRÉ-ANÁLISE] Total de screenshots em memória: ${capturedScreenshots.length}/${scenario.screenshotsCount}`,
			);

			// FASE 4B: Análise dos screenshots capturados
			console.log(`📸 [FASE-4B] Analisando ${scenario.screenshotsCount} screenshot(s)...`);
			await analyzeScreenshots();
		}

		mockScenarioIndex++;

		if (mockScenarioIndex < MOCK_SCENARIOS.length) {
			console.log(`\n⏳ Aguardando 1s antes do próximo cenário...\n`);
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}

	console.log('✅ Mock autoplay finalizado');
	mockAutoPlayActive = false;
}

//console.log('🚀 Entrou no renderer.js');
