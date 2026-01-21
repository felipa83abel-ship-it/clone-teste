/* ================================ */
//	1. IMPORTAÇÕES E PROTEÇÃO CONTRA CAPTURA
/* ================================ */

const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const hljs = require('highlight.js');
const { startAudioDeepgram, stopAudioDeepgram, switchDeviceDeepgram } = require('./stt-deepgram.js');
const { startAudioVosk, stopAudioVosk, switchDeviceVosk } = require('./stt-vosk.js');
const { startAudioWhisper, stopAudioWhisper, switchDeviceWhisper } = require('./stt-whisper.js');

// 🔥 Sistema de eventos para módulos de transcrição (desacoplamento)
window.transcriptionEvents = new EventTarget();

/**
 * Proteção contra captura de tela externa
 * Desabilita/limita APIs usadas por Zoom, Teams, Meet, OBS, Discord, Snipping Tool, etc.
 */
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

	// ✅ Intercepta getUserMedia para avisar sobre tentativas de captura de áudio
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

/**
 * Constantes globais
 */
const YOU = 'Você';
const OTHER = 'Outros';

const ENABLE_INTERVIEW_TIMING_DEBUG_METRICS = true; // ← desligar depois se não quiser mostrar time = false
const CURRENT_QUESTION_ID = 'CURRENT'; // ID da pergunta atual

const SYSTEM_PROMPT = `
Você é um assistente para entrevistas técnicas de Java. Responda como candidato.
Regras de resposta (priorize sempre estas):
- Seja natural e conciso: responda em no máximo 1–2 frases curtas.
- Use linguagem coloquial e direta, como alguém explicando rapidamente verbalmente.
- Evite listas longas, exemplos extensos ou parágrafos detalhados.
- Não comece com cumprimentos ou palavras de preenchimento (ex.: "Claro", "Ok").
- Quando necessário, entregue um exemplo mínimo de 1 linha apenas.
`;

/* ================================ */
//	2. ESTADO GLOBAL
/* ================================ */

let APP_CONFIG = {
	MODE_DEBUG: false, // ← alterado via config-manager.js (true = modo mock)
};

// Screenshots capturados
let capturedScreenshots = []; // Array de { filepath, filename, timestamp }
let isCapturing = false;
let isAnalyzing = false;

// Drag and Drop da janela
let isDraggingWindow = false;

let isRunning = false;
let audioContext;

// 🔥 MODIFICADO: STT model vem da config agora (removido USE_LOCAL_WHISPER)
let transcriptionMetrics = {
	audioStartTime: null,
	gptStartTime: null,
	gptFirstTokenTime: null,
	gptEndTime: null,
	totalTime: null,
	audioSize: 0,
};

/* 🎤 INPUT (VOCÊ) */
let inputStream;
let inputAnalyser;
let inputSilenceTimer = null;
let inputPartialTimer = null;

/* 🔊 OUTPUT (OUTROS) */
let outputStream;
let outputAnalyser;
let outputSilenceTimer = null;
let outputPartialTimer = null;

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
let autoCloseQuestionTimer = null;
let lastAskedQuestionNormalized = null;

/* ================================ */
//	3. SISTEMA DE CALLBACKS E UI ELEMENTS
/* ================================ */

/**
 * Callbacks/Observers registrados pela UI (config-manager.js)
 * renderer.js é "cego" para DOM - config-manager se inscreve em mudanças
 */
const UICallbacks = {
	onError: null, // 🔥 NOVO: Para mostrar erros de validação
	onTranscriptAdd: null,
	onCurrentQuestionUpdate: null,
	onQuestionsHistoryUpdate: null,
	onStatusUpdate: null,
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
	onAudioDeviceChanged: null,
};

/**
 * Registra callback para evento de UI
 * @param {string} eventName - Nome do evento
 * @param {function} callback - Função a ser chamada quando evento ocorre
 */
function onUIChange(eventName, callback) {
	if (UICallbacks.hasOwnProperty(eventName)) {
		UICallbacks[eventName] = callback;
		console.log(`📡 UI callback registrado em renderer.js: ${eventName}`);
	}
}

/**
 * Emite evento de UI para config-manager
 * @param {string} eventName - Nome do evento
 * @param {any} data - Dados do evento
 */
function emitUIChange(eventName, data) {
	if (UICallbacks[eventName] && typeof UICallbacks[eventName] === 'function') {
		UICallbacks[eventName](data);
	} else {
		console.warn(`⚠️ DEBUG: Nenhum callback registrado para '${eventName}'`);
	}
}

/**
 * Elementos UI solicitados por callback
 * config-manager.js fornece esses elementos via registerUIElements()
 */
let UIElements = {
	inputSelect: null,
	outputSelect: null,
	listenBtn: null,
	statusText: null,
	transcriptionBox: null,
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

/**
 * Registra elementos UI no renderer
 * config-manager.js chama isso para registrar elementos
 * @param {object} elements - Mapeamento de elementos UI
 */
function registerUIElements(elements) {
	UIElements = { ...UIElements, ...elements };
	console.log('✅ UI Elements registrados no renderer.js');
}

/* ================================ */
//	4. MODO E ORQUESTRADOR
/* ================================ */

const MODES = {
	NORMAL: 'NORMAL',
	INTERVIEW: 'INTERVIEW',
};

// 🔄 modo atual (default = comportamento atual)
let CURRENT_MODE = MODES.NORMAL;

/**
 * Controlador central de estratégia por modo
 */
const ModeController = {
	/**
	 * Verifica se está em modo entrevista
	 * @returns {boolean} true se modo entrevista
	 */
	isInterviewMode() {
		return CURRENT_MODE === MODES.INTERVIEW;
	},

	/**
	 * Retorna timeslice para MediaRecorder.start()
	 * @returns {number|null} timeslice em ms ou null
	 */
	mediaRecorderTimeslice() {
		if (!this.isInterviewMode()) return null;
		return 60; // reduzido para janelas parciais mais responsivas
	},

	/**
	 * Verifica se permite GPT streaming
	 * @returns {boolean} true se streaming permitido
	 */
	allowGptStreaming() {
		return this.isInterviewMode();
	},

	/**
	 * Calcula tamanho mínimo de áudio aceito
	 * @param {number} defaultSize - Tamanho padrão
	 * @returns {number} Tamanho mínimo ajustado
	 */
	minInputAudioSize(defaultSize) {
		return this.isInterviewMode() ? Math.min(400, defaultSize) : defaultSize;
	},
};

/**
 * Escuta evento de mudança de dispositivo
 * Emitido pelo config-manager
 */
onUIChange('onAudioDeviceChanged', async data => {
	try {
		if (!isRunning) return; // só trocar se app estiver em execução
		if (!data || !data.type || !data.deviceId) return; // dados inválidos

		// 🔥 ORQUESTRADOR: Roteia por modelo STT
		const sttModel = getConfiguredSTTModel();
		if (sttModel === 'deepgram') {
			if (typeof switchDeviceDeepgram === 'function') await switchDeviceDeepgram(data.type, data.deviceId);
		} else if (sttModel === 'vosk') {
			if (typeof switchDeviceVosk === 'function') await switchDeviceVosk(data.type, data.deviceId);
		} else if (sttModel === 'whisper-cpp-local' || sttModel === 'whisper-1') {
			if (typeof switchDeviceWhisper === 'function') await switchDeviceWhisper(UIElements);
		}
	} catch (err) {
		console.warn('Erro ao processar onAudioDeviceChanged:', err);
	}
});

/* ================================ */
//	5. MONITORAMENTO DE VOLUME
/* ================================ */

/**
 * Inicia monitoramento de volume de entrada (sem gravar)
 */
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

/**
 * Inicia monitoramento de volume de saída (sem gravar)
 */
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
		}

		debugLogRenderer('Fim da função: "startOutputVolumeMonitoring"');
	} catch (error) {
		console.error('❌ Erro ao iniciar monitoramento de volume de saída:', error);

		// Limpa a stream e o analisador de frequência (outputStream e outputAnalyser)
		outputStream = null;
		outputAnalyser = null;
	}
}

/**
 * Para monitoramento de volume de entrada
 */
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

	// 3. Zera a UI
	emitUIChange('onInputVolumeUpdate', { percent: 0 });

	console.log('🛑 Monitoramento de volume de entrada parado');

	debugLogRenderer('Fim da função: "stopInputVolumeMonitoring"');
}

/**
 * Para monitoramento de volume de saída
 */
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

	// 3. Zera a UI
	emitUIChange('onOutputVolumeUpdate', { percent: 0 });

	console.log('🛑 Monitoramento de volume de saída parado');

	debugLogRenderer('Fim da função: "stopOutputVolumeMonitoring"');
}

/**
 * Cria stream de áudio para saída
 * @returns {object} Source de áudio criado
 */
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
	// Conecta o source ao analisador de frequência
	source.connect(outputAnalyser);

	debugLogRenderer('Fim da função: "createOutputStream"');

	return source;
}

/* ================================ */
//	6. FUNÇÕES UTILITÁRIAS (HELPERS)
/* ================================ */

/**
 * Obtém o modelo STT configurado via config-manager
 * @returns {string} Nome do modelo STT ou 'error'
 */
function getConfiguredSTTModel() {
	try {
		if (!window.configManager || !window.configManager.config) {
			console.warn('⚠️ configManager não disponível no escopo global');
			return 'error'; // fallback
		}

		const config = window.configManager.config;
		const activeProvider = config.api?.activeProvider;
		const sttModel = config.api?.[activeProvider]?.selectedSTTModel;

		if (!sttModel) {
			console.warn(`⚠️ Modelo STT não configurado para ${activeProvider}`);
			return 'error'; // fallback
		}

		return sttModel;
	} catch (err) {
		console.error('❌ Erro ao obter modelo STT da config:', err);
		return 'error'; // fallback
	}
}

/**
 * Finaliza pergunta adicionando "?" se necessário
 * @param {string} t - Texto da pergunta
 * @returns {string} Pergunta finalizada
 */
function finalizeQuestion(t) {
	debugLogRenderer('Início da função: "finalizeQuestion"');
	debugLogRenderer('Fim da função: "finalizeQuestion"');
	return t.trim().endsWith('?') ? t.trim() : t.trim() + '?';
}

/**
 * Reseta o estado da pergunta atual (CURRENT)
 */
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

	debugLogRenderer('Fim da função: "resetCurrentQuestion"');
}

/**
 * Renderiza o histórico de perguntas
 */
function renderQuestionsHistory() {
	debugLogRenderer('Início da função: "renderQuestionsHistory"');

	// 🔥 Gera dados estruturados - config-manager renderiza no DOM
	const historyData = [...questionsHistory].reverse().map(q => {
		let label = q.text;
		if (ENABLE_INTERVIEW_TIMING_DEBUG_METRICS && q.lastUpdateTime) {
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

/**
 * Retorna o texto da pergunta selecionada (CURRENT ou do histórico)
 * @returns {string} Texto da pergunta selecionada
 */
function getSelectedQuestionText() {
	debugLogRenderer('Início da função: "getSelectedQuestionText"');
	debugLogRenderer('Fim da função: "getSelectedQuestionText"');

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

	return '';
}

/**
 * Normaliza texto para comparação
 * Remove pontuação, converte para lowercase, remove espaços extras
 * @param {string} t - Texto a normalizar
 * @returns {string} Texto normalizado
 */
function normalizeForCompare(t) {
	debugLogRenderer('Início da função: "normalizeForCompare"');
	debugLogRenderer('Fim da função: "normalizeForCompare"');
	return (t || '')
		.toLowerCase()
		.replace(/[?!.\n\r]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Atualiza a mensagem de status na UI
 * @param {string} message - Mensagem de status
 */
function updateStatusMessage(message) {
	debugLogRenderer('Início da função: "updateStatusMessage"');
	emitUIChange('onStatusUpdate', { message });
	debugLogRenderer('Fim da função: "updateStatusMessage"');
}

/**
 * Verifica se uma pergunta já foi respondida pelo ID
 * @param {string} questionId - ID da pergunta
 * @returns {boolean} true se pergunta já foi respondida
 */
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

/**
 * Promove pergunta atual para histórico
 * @param {string} text - Texto da pergunta
 */
function promoteCurrentToHistory(text) {
	debugLogRenderer('Início da função: "promoteCurrentToHistory"');

	debugLogRenderer('📚 promovendo pergunta para histórico:', text, false);

	// evita duplicação no histórico: se a última entrada é igual (normalizada), não adiciona
	const last = questionsHistory.length ? questionsHistory[questionsHistory.length - 1] : null;
	if (last && normalizeForCompare(last.text) === normalizeForCompare(text)) {
		debugLogRenderer('🔕 pergunta igual já presente no histórico — pulando promoção', false);

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
		debugLogRenderer('🔄 [IMPORTANTE] Migrada resposta de CURRENT para newId:', newId, false);
	}

	// 🔥 [CRÍTICO] Atualizar o ID do bloco de resposta no DOM se ele foi criado com CURRENT
	debugLogRenderer(
		'🔄 [IMPORTANTE] Emitindo onAnswerIdUpdate para atualizar bloco de resposta: CURRENT → ',
		newId,
		false,
	);
	emitUIChange('onAnswerIdUpdate', {
		oldId: CURRENT_QUESTION_ID,
		newId: newId,
	});

	// 🔥 [IMPORTANTE] Se uma pergunta CURRENT foi solicitada ao GPT,
	// atualizar o rastreamento para apontar para o novo ID promovido
	if (gptRequestedQuestionId === CURRENT_QUESTION_ID) {
		gptRequestedQuestionId = newId;
		debugLogRenderer('🔄 [IMPORTANTE] gptRequestedQuestionId atualizado de CURRENT para newId:', newId, false);
	}

	// preserva seleção do usuário: se não havia seleção explícita ou estava no CURRENT,
	// mantém a seleção no CURRENT para que o novo CURRENT seja principal.
	const prevSelected = selectedQuestionId;

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

/**
 * Limpa todas as seleções visuais
 */
function clearAllSelections() {
	// Emite evento para o controller limpar as seleções visuais
	emitUIChange('onClearAllSelections', {});
}

/**
 * Obtém IDs navegáveis de perguntas (CURRENT + histórico)
 * @returns {array} Array de IDs navegáveis
 */
function getNavigableQuestionIds() {
	const ids = [];
	if (currentQuestion.text) ids.push(CURRENT_QUESTION_ID);
	questionsHistory.forEach(q => ids.push(q.id));
	return ids;
}

/* ================================ */
//	7. CONTROLE DE ÁUDIO
/* ================================ */

/**
 * Inicia captura de áudio
 */
async function startAudio() {
	debugLogRenderer('Início da função: "startAudio"');

	// 🔥 [NOVO ORQUESTRADOR] Detecta modelo STT e roteia
	const sttModel = getConfiguredSTTModel();
	console.log(`🎤 startAudio: Modelo STT = ${sttModel}`);

	try {
		// 🔥 ROTEAMENTO: Por modelo STT
		if (sttModel === 'deepgram') {
			await startAudioDeepgram(UIElements);
		} else if (sttModel === 'vosk') {
			await startAudioVosk(UIElements);
		} else if (sttModel === 'whisper-cpp-local' || sttModel === 'whisper-1') {
			const logLabel = sttModel === 'whisper-cpp-local' ? 'local' : 'API OpenAI';
			console.log(`🎤 Roteando para Whisper (${logLabel})`);
			await startAudioWhisper(UIElements);
		} else {
			// Modelo não suportado
			console.error('❌ Erro ao obter modelo STT configurado');
			return;
		}
	} catch (error) {
		console.error('❌ Erro em startAudio:', error);
		throw error;
	}

	debugLogRenderer('Fim da função: "startAudio"');
}

/**
 * Para captura de áudio
 */
async function stopAudio() {
	debugLogRenderer('Início da função: "stopAudio"');

	// Fecha pergunta atual se estava aberta
	if (currentQuestion.text) closeCurrentQuestionForced();

	const sttModel = getConfiguredSTTModel();
	console.log(`🛑 stopAudio: Modelo STT = ${sttModel}`);

	try {
		// 🔥 ROTEAMENTO: Por modelo STT
		if (sttModel === 'deepgram') {
			stopAudioDeepgram();
		} else if (sttModel === 'vosk') {
			stopAudioVosk();
		} else if (sttModel === 'whisper-cpp-local' || sttModel === 'whisper-1') {
			stopAudioWhisper();
		} else {
			// Modelo não suportado
			console.error('❌ Erro ao obter modelo STT configurado');
			return;
		}
	} catch (error) {
		console.error('❌ Erro em stopAudio:', error);
	}

	debugLogRenderer('Fim da função: "stopAudio"');
}

/**
 * Reinicia pipeline de áudio
 */
async function restartAudioPipeline() {
	debugLogRenderer('Início da função: "restartAudioPipeline"');

	stopAudio();

	debugLogRenderer('Fim da função: "restartAudioPipeline"');
}

/**
 * Toggle do botão de iniciar/parar escuta (Ctrl+D)
 */
async function listenToggleBtn() {
	debugLogRenderer('Início da função: "listenToggleBtn"');

	if (!isRunning) {
		console.log('🎤 listenToggleBtn: Tentando INICIAR escuta...');

		// 🔥 VALIDAÇÃO 1: Modelo de IA ativo
		const { active: hasModel, model: activeModel } = hasActiveModel();
		debugLogRenderer(`📊 DEBUG: hasModel = ${hasModel}, activeModel = ${activeModel}`, false);

		if (!hasModel) {
			const errorMsg = 'Ative um modelo de IA antes de começar a ouvir';
			console.warn(`⚠️ ${errorMsg}`);
			emitUIChange('onError', errorMsg);
			return;
		}

		// 🔥 VALIDAÇÃO 2: Dispositivo de áudio de SAÍDA (obrigatório para ouvir a reunião)
		const hasOutputDevice = UIElements.outputSelect?.value;
		debugLogRenderer(`📊 DEBUG: hasOutputDevice = ${hasOutputDevice}`, false);

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

	await (isRunning ? startAudio() : stopAudio());

	debugLogRenderer('Fim da função: "listenToggleBtn"');
}

/**
 * Verifica se há um modelo de IA ativo na configuração
 * @returns {object} { active: boolean, model: string|null }
 */
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

/* ================================ */
//	8. RENDERIZAÇÃO E NAVEGAÇÃO DE UI
/* ================================ */

/**
 * Renderiza a pergunta atual (CURRENT)
 */
function renderCurrentQuestion() {
	debugLogRenderer('Início da função: "renderCurrentQuestion"');

	// Se não há texto, emite vazio
	if (!currentQuestion.text) {
		emitUIChange('onCurrentQuestionUpdate', { text: '', isSelected: false });
		return;
	}

	let label = currentQuestion.text;

	// Adiciona timestamp se modo debug métricas ativo
	if (ENABLE_INTERVIEW_TIMING_DEBUG_METRICS && currentQuestion.lastUpdateTime) {
		const time = new Date(currentQuestion.lastUpdateTime).toLocaleTimeString();
		label = `⏱️ ${time} — ${label}`;
	}

	// 🔥 Gera dados estruturados - config-manager renderiza no DOM
	const questionData = {
		text: label,
		isSelected: selectedQuestionId === CURRENT_QUESTION_ID,
		rawText: currentQuestion.text,
		createdAt: currentQuestion.createdAt,
		lastUpdateTime: currentQuestion.lastUpdateTime,
	};

	// Emite evento para o config-manager renderizar no DOM
	emitUIChange('onCurrentQuestionUpdate', questionData);

	debugLogRenderer('Fim da função: "renderCurrentQuestion"');
}

/**
 * Manipula clique em pergunta
 * @param {string} questionId - ID da pergunta selecionada
 */
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
	askGpt();

	debugLogRenderer('Fim da função: "handleQuestionClick"');
}

/**
 * Aplica opacidade na interface
 * @param {number} value - Valor de opacidade (0-1)
 */
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

/**
 * Rola a lista de perguntas para a pergunta selecionada
 */
function scrollToSelectedQuestion() {
	emitUIChange('onScrollToQuestion', {
		questionId: selectedQuestionId,
	});
}

/**
 * Configuração do Marked.js para renderização de Markdown
 */
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

/* ================================ */
//	9. CONSOLIDAÇÃO E FINALIZAÇÃO DE PERGUNTAS
/* ================================ */

/**
 * Fluxo para consolidar transcrições no CURRENT
 * Concatena transcrição interims e finais
 * @param {string} author - Autor da fala (YOU ou OTHER)
 * @param {string} text - Texto da fala
 * @param {object} options - Opções (isInterim, shouldFinalizeAskCurrent)
 */
function handleCurrentQuestion(author, text, options = {}) {
	debugLogRenderer('Início da função: "handleCurrentQuestion"');

	const cleaned = text.replace(/Ê+|hum|ahn/gi, '').trim();

	// Usa o tempo exato que chegou no renderer (Date.now)
	const now = Date.now();

	// Apenas consolida falas no CURRENT do OTHER
	if (author === OTHER) {
		// Se não existe texto ainda, marca tempo de criação e incrementa turno
		if (!currentQuestion.text) {
			currentQuestion.createdAt = now;
			interviewTurnId++;
		}

		currentQuestion.lastUpdateTime = now;
		currentQuestion.lastUpdate = now;

		debugLogRenderer('currentQuestion antes: ', { ...currentQuestion }, false);

		// Lógica de consolidação para evitar duplicações
		if (options.isInterim) {
			// Para interims: substituir o interim atual (Deepgram envia versões progressivas)
			currentQuestion.interimText = cleaned;
		} else {
			// Para finais: limpar interim e ACUMULAR no finalText
			currentQuestion.interimText = '';
			currentQuestion.finalText = (currentQuestion.finalText ? currentQuestion.finalText + ' ' : '') + cleaned;
		}

		debugLogRenderer('currentQuestion durante: ', { ...currentQuestion }, false);

		// Atualizar o texto total
		currentQuestion.text =
			currentQuestion.finalText.trim() + (currentQuestion.interimText ? ' ' + currentQuestion.interimText : '');

		debugLogRenderer('currentQuestion depois: ', { ...currentQuestion }, false);

		// 🟦 CURRENT vira seleção padrão ao receber fala
		if (!selectedQuestionId) {
			selectedQuestionId = CURRENT_QUESTION_ID;
			clearAllSelections();
		}

		// Adiciona TUDO à conversa visual em tempo real ao elemento "currentQuestionText"
		renderCurrentQuestion();

		// Só finaliza se estivermos em silêncio e NÃO for um interim
		if (options.shouldFinalizeAskCurrent && !options.isInterim) {
			debugLogRenderer('🟢 ********  Está em silêncio, feche a pergunta e chame o GPT 🤖 ******** 🟢', true);

			// fecha/finaliza a pergunta atual
			finalizeCurrentQuestion();
		}
	}

	debugLogRenderer('Fim da função: "handleCurrentQuestion"');
}

/**
 * Finaliza a pergunta atual para histórico
 */
function finalizeCurrentQuestion() {
	debugLogRenderer('Início da função: "finalizeCurrentQuestion"');

	// Se não há texto, ignorar
	if (!currentQuestion.text || !currentQuestion.text.trim()) {
		console.log('⚠️ finalizeCurrentQuestion: Sem texto para finalizar');
		return;
	}

	// 🔒 GUARDA ABSOLUTA: Se a pergunta já foi finalizada, NÃO faça nada.
	if (currentQuestion.finalized) {
		console.log('⛔ finalizeCurrentQuestion ignorado — pergunta já finalizada');
		return;
	}

	// ⚠️ No modo entrevista, NÃO abortar o fechamento
	if (ModeController.isInterviewMode()) {
		currentQuestion.text = finalizeQuestion(currentQuestion.text);
		currentQuestion.lastUpdateTime = Date.now();
		currentQuestion.finalized = true;

		// garante seleção lógica
		selectedQuestionId = CURRENT_QUESTION_ID;

		// chama GPT automaticamente se ainda não respondeu este turno
		if (gptRequestedTurnId !== interviewTurnId && gptAnsweredTurnId !== interviewTurnId) {
			askGpt();
		}

		return;
	}

	//  ⚠️ No modo normal - trata perguntas que parecem incompletas
	if (!ModeController.isInterviewMode()) {
		console.log('⚠️ No modo normal detectado — promovendo ao histórico sem chamar GPT:', currentQuestion.text);

		// promoteCurrentToHistory(currentQuestion.text);
		const newId = String(questionsHistory.length + 1);
		questionsHistory.push({
			id: newId,
			text: currentQuestion.text,
			createdAt: currentQuestion.createdAt || Date.now(),
			lastUpdateTime: currentQuestion.lastUpdateTime || currentQuestion.createdAt || Date.now(),
		});

		selectedQuestionId = newId;
		resetCurrentQuestion();
		renderQuestionsHistory();

		return;
	}
}

/**
 * Força o fechamento da pergunta atual, promovendo-a ao histórico
 */
function closeCurrentQuestionForced() {
	debugLogRenderer('Início da função: "closeCurrentQuestionForced"');

	// log temporario para testar a aplicação só remover depois
	console.log('🚪 Fechando pergunta:', currentQuestion.text);

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

/* ================================ */
//	10. SISTEMA GPT E STREAMING
/* ================================ */

/**
 * Envia pergunta selecionada ao GPT
 * FUNÇÃO PRINCIPAL de comunicação com GPT
 */
async function askGpt() {
	debugLogRenderer('Início da função: "askGpt"');

	const questionId = selectedQuestionId;
	const isCurrent = questionId === CURRENT_QUESTION_ID;
	const text = getSelectedQuestionText();
	const normalizedText = normalizeForCompare(text);
	transcriptionMetrics.gptStartTime = Date.now(); // Marca início GPT

	// Evita reenvio da mesma pergunta atual ao GPT (dedupe)
	if (isCurrent && normalizedText && lastAskedQuestionNormalized === normalizedText) {
		updateStatusMessage('⛔ Pergunta já enviada');
		console.log('⛔ askGpt: mesma pergunta já enviada, pulando');
		return;
	}

	// 🛡️ MODO ENTREVISTA — bloqueia duplicação APENAS para histórico
	if (ModeController.isInterviewMode() && !isCurrent) {
		const existingAnswer = findAnswerByQuestionId(questionId);
		if (existingAnswer) {
			updateStatusMessage('📌 Essa pergunta já foi respondida');
			return;
		}
	}

	// Nota log temporario para testar a aplicação remover depois
	debugLogRenderer(
		'🤖 🧾 askGpt diagnóstico',
		{
			currentQuestion,
			gptAnsweredTurnId,
			interviewTurnId,
			isCurrent,
			isInterviewMode: ModeController.isInterviewMode(),
			questionId_variable: questionId, // 🔥 DEBUG: mostrar a variável questionId
			selectedQuestionId,
			textGPT: normalizedText,
			textLength: text.length,
		},
		false,
	);

	// marca que este turno teve uma requisição ao GPT (apenas para CURRENT)
	if (isCurrent) {
		gptRequestedTurnId = interviewTurnId;
		gptRequestedQuestionId = CURRENT_QUESTION_ID; // 🔥 [IMPORTANTE] Rastreia qual pergunta foi solicitada
		lastAskedQuestionNormalized = normalizedText;
	}

	// 🌀 MODO ENTREVISTA — STREAMING
	if (ModeController.isInterviewMode()) {
		let streamedText = '';

		debugLogRenderer('⏳ enviando para o GPT via stream...', true);

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

			emitUIChange('onAnswerStreamChunk', {
				questionId,
				token,
				accum: streamedText,
			});

			transcriptionMetrics.gptFirstTokenTime = transcriptionMetrics.gptFirstTokenTime || Date.now();

			debugLogRenderer(`🎬 🟢 GPT_STREAM_CHUNK recebido (token parcial): "${token}"`, false);
		};

		const onEnd = () => {
			debugLogRenderer('✅ GPT_STREAM_END recebido - Stream finalizado!', true);

			ipcRenderer.removeListener('GPT_STREAM_CHUNK', onChunk);
			ipcRenderer.removeListener('GPT_STREAM_END', onEnd);

			// Finaliza medições
			transcriptionMetrics.gptEndTime = Date.now();
			transcriptionMetrics.totalTime = Date.now() - transcriptionMetrics.audioStartTime;

			// Log métricas
			logTranscriptionMetrics();

			if (ENABLE_INTERVIEW_TIMING_DEBUG_METRICS) {
				let finalText = streamedText;
				const endAt = Date.now();
				const elapsed = endAt - transcriptionMetrics.gptStartTime;

				const startTime = new Date(transcriptionMetrics.gptStartTime).toLocaleTimeString();
				const endTime = new Date(endAt).toLocaleTimeString();

				finalText +=
					`\n\n⏱️ GPT iniciou: ${startTime}` + `\n⏱️ GPT finalizou: ${endTime}` + `\n⏱️ Resposta em ${elapsed}ms`;

				debugLogRenderer(
					'🤖 Resposta GPT ❓' +
						finalText +
						`\n⏱️ Primeiro Token: ${new Date(transcriptionMetrics.gptFirstTokenTime).toLocaleTimeString()}`,
					false,
				);
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

				debugLogRenderer(
					'✅ GPT_STREAM_END: Renderizando resposta para pergunta solicitada:',
					{
						requestedQuestionId,
						wasRequestedForThisTurn,
					},
					false,
				);

				// Se a pergunta solicitada foi CURRENT, promover para history ANTES de renderizar
				if (requestedQuestionId === CURRENT_QUESTION_ID && currentQuestion.text) {
					debugLogRenderer('🔄 GPT_STREAM_END: Promovendo CURRENT para history antes de renderizar resposta', true);
					promoteCurrentToHistory(currentQuestion.text);

					// Pega a pergunta recém-promovida
					const promotedQuestion = questionsHistory[questionsHistory.length - 1];
					if (promotedQuestion) {
						// Renderiza com o ID da pergunta promovida
						promotedQuestion.answered = true;
						answeredQuestions.add(promotedQuestion.id);
						renderQuestionsHistory();
						debugLogRenderer('✅ Resposta renderizada para pergunta promovida:', promotedQuestion.id, false);
					} else {
						console.warn('⚠️ Pergunta promovida não encontrada');
					}
				} else {
					// Para perguntas do histórico, renderiza com o ID recebido
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
			}

			// Resete o estado da pergunta atual se ainda for CURRENT
			resetCurrentQuestion();

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

	console.log('✅ resposta do GPT recebida (batch): ', res);

	// Finaliza medições
	transcriptionMetrics.gptEndTime = Date.now();
	transcriptionMetrics.totalTime = Date.now() - transcriptionMetrics.audioStartTime;

	// Log métricas
	logTranscriptionMetrics();

	const wasRequestedForThisTurn = gptRequestedTurnId === interviewTurnId;

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

/**
 * Log detalhado das métricas de tempo da transcrição
 */
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

/* ================================ */
//	11. RESET COMPLETO
/* ================================ */

/**
 * Reseta todo o estado do app
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
			isRunning = false;
		}

		// 3️⃣ LIMPAR TIMERS DE ÁUDIO
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
		if (autoCloseQuestionTimer) {
			clearTimeout(autoCloseQuestionTimer);
			autoCloseQuestionTimer = null;
		}
		console.log('✅ Timers limpos');

		// 4️⃣ LIMPAR PERGUNTAS E RESPOSTAS
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
		lastAskedQuestionNormalized = null;
		console.log('✅ Perguntas e respostas limpas');

		// 5️⃣ LIMPAR ESTADO GPT/ENTREVISTA
		interviewTurnId = 0;
		gptAnsweredTurnId = null;
		gptRequestedTurnId = null;
		gptRequestedQuestionId = null;
		console.log('✅ Estado de entrevista resetado');

		// 6️⃣ RESETAR MÉTRICAS
		transcriptionMetrics = {
			audioStartTime: null,
			gptStartTime: null,
			gptEndTime: null,
			totalTime: null,
			audioSize: 0,
		};
		console.log('✅ Métricas resetadas');

		// 7️⃣ LIMPAR SCREENSHOTS (sem chamar API!)
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

		// 8️⃣ LIMPAR FLAGS
		isCapturing = false;
		isAnalyzing = false;
		console.log('✅ Flags resetadas');

		// 9️⃣ ATUALIZAR UI - PERGUNTAS
		emitUIChange('onCurrentQuestionUpdate', {
			text: '',
			isSelected: false,
		});
		emitUIChange('onQuestionsHistoryUpdate', []);
		console.log('✅ Perguntas UI limpa');

		// 🔟 ATUALIZAR UI - TRANSCRIÇÕES E RESPOSTAS
		emitUIChange('onTranscriptionCleared');
		emitUIChange('onAnswersCleared');
		console.log('✅ Transcrições e respostas UI limpas');

		// 1️⃣1️⃣ ATUALIZAR UI - BOTÃO LISTEN
		emitUIChange('onListenButtonToggle', {
			isRunning: false,
			buttonText: '🎤 Começar a Ouvir... (Ctrl+D)',
		});
		console.log('✅ Botão listen resetado');

		// 1️⃣2️⃣ ATUALIZAR UI - STATUS
		emitUIChange('onStatusUpdate', {
			status: 'ready',
			message: '✅ Pronto',
		});
		console.log('✅ Status atualizado');

		// 1️⃣3️⃣ LIMPAR SELEÇÕES
		clearAllSelections();
		console.log('✅ Seleções limpas');

		// 1️⃣4️⃣ LOG FINAL
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
 * Função acionada pelo botão de reset na UI
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

/* ================================ */
//	12. SCREENSHOT E ANÁLISE
/* ================================ */

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

/* ================================ */
//	13. MOCK / DEBUG
/* ================================ */

/**
 * Respostas mockadas por pergunta
 */
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

/**
 * Cenários automáticos para teste
 * screenshotsCount: 0 = sem screenshot, 1 = tira 1 foto, 2 = tira 2 fotos, etc
 */
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
 * Retorna resposta mockada para pergunta
 * Busca exata ou parcial
 * @param {string} question - Pergunta
 * @returns {string} Resposta mockada
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
 * Intercepta chamadas IPC para MOCK quando APP_CONFIG.MODE_DEBUG está ativo
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
 * Função de autoplay automático para mockar perguntas e respostas
 */
async function runMockAutoPlay() {
	if (mockAutoPlayActive) return;
	mockAutoPlayActive = true;

	while (mockScenarioIndex < MOCK_SCENARIOS.length && APP_CONFIG.MODE_DEBUG && mockAutoPlayActive) {
		const scenario = MOCK_SCENARIOS[mockScenarioIndex];
		console.log(
			`\n🎬 ════════════════════════════════════════════════════════\n🎬 MOCK CENÁRIO ${mockScenarioIndex + 1}/${
				MOCK_SCENARIOS.length
			}\n🎬 ════════════════════════════════════════════════════════`,
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
		//handleSpeech(OTHER, scenario.question, { skipAddToUI: true });

		// Aguarda consolidação (800ms para garantir que pergunta saia do CURRENT)
		await new Promise(resolve => setTimeout(resolve, 800));

		// 🔥 CHECK: Se modo debug foi desativado, para imediatamente
		if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
			console.log('🛑 [PARADA] Modo debug desativado - parando mock autoplay');
			break;
		}

		// Simula silêncio e fecha pergunta
		console.log(`🔇 [FASE-2] Silêncio detectado, fechando pergunta...`);
		//closeCurrentQuestion();

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

/* ================================ */
//	14. DEBUG UTILITIES
/* ================================ */

/**
 * Log de debug padronizado para renderer
 * Último argumento opcional é booleano para mostrar ou não o log
 * @param {...any} args - Argumentos a logar
 */
function debugLogRenderer(...args) {
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
			`%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug em renderer.js:`,
			'color: brown; font-weight: bold;', 
			...cleanArgs
		);
	}
}

/* ================================ */
//	15. EXPORTAÇÃO PUBLIC API (RendererAPI)
/* ================================ */

/**
 * API Pública exposta do Renderer
 * Métodos públicos que podem ser chamados de fora
 */
const RendererAPI = {
	// Áudio - Gravação
	listenToggleBtn,
	askGpt,
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
	/**
	 * Inicializa drag handle para movimento de janela
	 * @param {element} dragHandle - Elemento para drag
	 * @param {element} documentElement - Documento (opcional)
	 */
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
	/**
	 * Atualiza botão de click-through
	 * @param {boolean} enabled - Se click-through está ativo
	 * @param {element} btnToggle - Botão a atualizar
	 */
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
	// Emit UI changes (para config-manager enviar eventos para renderer)
	emitUIChange,

	// API Key
	setAppConfig: config => {
		APP_CONFIG = config;
	},
	getAppConfig: () => APP_CONFIG,

	// Navegacao de perguntas (Ctrl+Shift+ArrowUp/Down via globalShortcut IPC)
	/**
	 * Navega entre perguntas
	 * @param {string} direction - 'up' ou 'down'
	 */
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
		// Começar a ouvir / Parar de ouvir (Ctrl+D)
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
	/**
	 * Envia erro do renderer para main
	 * @param {error} error - Erro a enviar
	 */
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
};

if (typeof module !== 'undefined' && module.exports) {
	// Node.js / CommonJS export
	module.exports = RendererAPI;
}

// 🎭 Exporta para o escopo global (usado em mocks e testes)
if (typeof globalThis !== 'undefined') {
	globalThis.RendererAPI = RendererAPI; // 🎭 Exporta API para escopo global
	globalThis.runMockAutoPlay = runMockAutoPlay; // 🎭 Exportar Mock autoplay
	globalThis.mockScenarioIndex = 0; // 🎭 Índice global para cenários
	globalThis.mockAutoPlayActive = false; // 🎭 Flag global para evitar múltiplas execuções
}

/* ================================ */
//	LISTENER DO BOTÃO RESET
/* ================================ */

/**
 * Adiciona listener ao botão de reset após o DOM carregar
 */
document.addEventListener('DOMContentLoaded', () => {
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
