/* ================================ */
//	IMPORTES E DEPENDÊNCIAS
/* ================================ */

const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const hljs = require('highlight.js');
const { startAudioDeepgram, stopAudioDeepgram, switchDeviceDeepgram } = require('./stt/stt-deepgram.js'); // reorganizado em pasta stt/
const { startAudioVosk, stopAudioVosk, switchDeviceVosk } = require('./stt/stt-vosk.js'); // reorganizado em pasta stt/
const { startAudioWhisper, stopAudioWhisper, switchDeviceWhisper } = require('./stt/stt-whisper.js'); // reorganizado em pasta stt/
const {
	startAudioVolumeMonitor,
	stopAudioVolumeMonitor,
	switchAudioVolumeDevice,
} = require('./audio/volume-audio-monitor.js');

/* ================================ */
//	🎯 NOVAS CLASSES (Refatoração Fase 2)
/* ================================ */
const AppState = require('./state/AppState.js');
const EventBus = require('./events/EventBus.js');
const Logger = require('./utils/Logger.js');
const STTStrategy = require('./strategies/STTStrategy.js');
const LLMManager = require('./llm/LLMManager.js');
const openaiHandler = require('./llm/handlers/openai-handler.js');
const { validateLLMRequest, handleLLMStream, handleLLMBatch } = require('./handlers/llmHandlers.js');

// 🎯 INSTANCIAR
const appState = new AppState();
const eventBus = new EventBus();
const sttStrategy = new STTStrategy();
const llmManager = new LLMManager();

// 🎯 REGISTRAR LLMs
llmManager.register('openai', openaiHandler);
// Futuro: llmManager.register('gemini', require('./llm/handlers/gemini-handler.js'));
// Futuro: llmManager.register('anthropic', require('./llm/handlers/anthropic-handler.js'));

// 🎯 REGISTRAR LISTENERS DA EVENTBUS (para LLM)
eventBus.on('answerStreamChunk', data => {
	emitUIChange('onAnswerStreamChunk', {
		questionId: data.questionId,
		token: data.token,
		accum: data.accum,
	});
});

eventBus.on('llmStreamEnd', data => {
	Logger.info('LLM Stream finalizado', { questionId: data.questionId });
	emitUIChange('onAnswerStreamEnd', {});
});

eventBus.on('llmBatchEnd', data => {
	Logger.info('LLM Batch finalizado', { questionId: data.questionId, responseLength: data.response?.length || 0 });
	emitUIChange('onAnswerBatchEnd', {
		questionId: data.questionId,
		response: data.response,
	});
});

eventBus.on('error', error => {
	Logger.error('Erro na eventBus', { error });
	updateStatusMessage(`❌ ${error}`);
});

/* ================================ */
//	PROTEÇÃO CONTRA CAPTURA DE TELA
/* ================================ */

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

/* ================================ */
//	CONSTANTES
/* ================================ */

const YOU = 'Você';
const OTHER = 'Outros';

// Modos de operação
const MODES = {
	NORMAL: 'NORMAL',
	INTERVIEW: 'INTERVIEW',
};

// 🔄 modo atual (default = comportamento atual)
let CURRENT_MODE = MODES.NORMAL;

// Controlador de modo
const ModeController = {
	/**
	 * Verifica se está em modo entrevista
	 * @returns {boolean} true se modo entrevista
	 */
	isInterviewMode() {
		return CURRENT_MODE === MODES.INTERVIEW;
	},
};

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
//	ESTADO GLOBAL
/* ================================ */

let APP_CONFIG = {
	MODE_DEBUG: false, // ← alterado via config-manager.js (true = modo mock)
};

// Estado de execução do STT
let isRunning = false;

// Screenshots capturados
let capturedScreenshots = []; // Array de { filepath, filename, timestamp }
let isCapturing = false;
let isAnalyzing = false;

// Drag and Drop da janela
let isDraggingWindow = false;

// 🔥 MODIFICADO: STT model vem da config agora (removido USE_LOCAL_WHISPER)
let transcriptionMetrics = {
	audioStartTime: null,
	gptStartTime: null,
	gptFirstTokenTime: null,
	gptEndTime: null,
	totalTime: null,
	audioSize: 0,
};

// 🔥 REMOVED: inputStream, inputAnalyser, outputStream, outputAnalyser
// Agora usamos audio-volume-monitor.js para monitoramento de volume
// quando usuário está na seção "Áudio e Tela" (sem transcrição ativa)

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
let lastAskedQuestionNormalized = null;

/* ================================ */
//	SISTEMA DE CALLBACKS E UI ELEMENTS
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
	opacityRange: null,
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
//	MONITORAMENTO DE VOLUME
/* ================================ */

/**
 * Escuta evento de mudança de dispositivo
 * Emitido pelo config-manager
 */
eventBus.on('audioDeviceChanged', async data => {
	try {
		const sttModel = getConfiguredSTTModel();
		Logger.info('audioDeviceChanged', { model: sttModel, type: data.type });

		if (!data || !data.type) {
			Logger.warn('Dados inválidos para mudança de dispositivo', data);
			return;
		}

		if (!isRunning) {
			Logger.warn('STT não está ativo, ignorando mudança de dispositivo');
			return;
		}

		await sttStrategy.switchDevice(sttModel, data.type, data.deviceId);
	} catch (error) {
		Logger.error('Erro ao processar mudança de dispositivo', { error: error.message });
	}
});

/* Compatibilidade: antigo onUIChange também suporta audioDeviceChanged */
onUIChange('onAudioDeviceChanged', async data => {
	eventBus.emit('audioDeviceChanged', data);
});

/* ================================ */
//	FUNÇÕES UTILITÁRIAS (HELPERS)
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
//	🎯 REGISTRAR STTs (Refatoração Fase 2)
/* ================================ */

// Registrar STTs no sttStrategy
sttStrategy.register('deepgram', {
	start: startAudioDeepgram,
	stop: stopAudioDeepgram,
	switchDevice: switchDeviceDeepgram,
});

sttStrategy.register('vosk', {
	start: startAudioVosk,
	stop: stopAudioVosk,
	switchDevice: switchDeviceVosk,
});

sttStrategy.register('whisper-cpp-local', {
	start: startAudioWhisper,
	stop: stopAudioWhisper,
	switchDevice: switchDeviceWhisper,
});

sttStrategy.register('whisper-1', {
	start: startAudioWhisper,
	stop: stopAudioWhisper,
	switchDevice: switchDeviceWhisper,
});

/* ================================ */
//	CONTROLE DE ÁUDIO
/* ================================ */

/**
 * Inicia captura de áudio
 */
async function startAudio() {
	const sttModel = getConfiguredSTTModel();
	Logger.info('startAudio', { model: sttModel });

	try {
		await sttStrategy.start(sttModel, UIElements);
	} catch (error) {
		Logger.error('Erro ao iniciar áudio', { error: error.message });
		throw error;
	}
}

/**
 * Para captura de áudio
 */
async function stopAudio() {
	// Fecha pergunta atual se estava aberta
	if (currentQuestion.text) closeCurrentQuestionForced();

	const sttModel = getConfiguredSTTModel();
	Logger.info('stopAudio', { model: sttModel });

	try {
		await sttStrategy.stop(sttModel);
	} catch (error) {
		Logger.error('Erro ao parar áudio', { error: error.message });
	}
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
//	RENDERIZAÇÃO E NAVEGAÇÃO DE UI
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
	askLLM();

	debugLogRenderer('Fim da função: "handleQuestionClick"');
}

/**
 * Aplica opacidade na interface
 * MOVIDA PARA: config-manager.js
 * @deprecated Usar ConfigManager.applyOpacity(value) em vez disso
 */

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
//	CONSOLIDAÇÃO E FINALIZAÇÃO DE PERGUNTAS
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
			askLLM();
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
		renderCurrentQuestion(); // 🔥 Renderiza CURRENT limpo

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
//	SISTEMA GPT E STREAMING
/* ================================ */

/**
 * Envia pergunta selecionada ao LLM (qualquer provider)
 * ✅ REFATORADA: agora é simples e legível!
 * ✅ CENTRALIZADA: Uma única função para todos os LLMs
 * ✅ Não há duplicação de askLLM() por LLM
 */
async function askLLM() {
	try {
		const CURRENT_QUESTION_ID = 'CURRENT';

		// 1. Validar (antigo validateAskGptRequest)
		const { questionId, text, isCurrent } = validateLLMRequest(appState, selectedQuestionId, getSelectedQuestionText);
		Logger.info('Pergunta válida', { questionId, textLength: text.length });

		// Rastreamento antigo (compatibilidade)
		const normalizedText = normalizeForCompare(text);
		transcriptionMetrics.gptStartTime = Date.now();

		if (isCurrent) {
			gptRequestedTurnId = interviewTurnId;
			gptRequestedQuestionId = CURRENT_QUESTION_ID;
			lastAskedQuestionNormalized = normalizedText;
		}

		// 2. Rotear por modo (não por LLM!)
		const isInterviewMode = ModeController.isInterviewMode();

		if (isInterviewMode) {
			await handleLLMStream(appState, questionId, text, SYSTEM_PROMPT, eventBus, llmManager);
		} else {
			await handleLLMBatch(appState, questionId, text, SYSTEM_PROMPT, eventBus, llmManager);
		}
		// O llmManager sabe qual LLM usar (OpenAI, Gemini, etc)
		// Sem duplicação de código!
	} catch (error) {
		Logger.error('Erro em askLLM', { error: error.message });
		eventBus.emit('error', error.message);
		updateStatusMessage(`❌ ${error.message}`);
	}
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
//	SCREENSHOT E ANÁLISE
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
		Logger.info('Análise já em andamento');
		return;
	}

	if (capturedScreenshots.length === 0) {
		Logger.warn('Nenhum screenshot para analisar');
		updateStatusMessage('⚠️ Nenhum screenshot para analisar (capture com Ctrl+Shift+F)');
		return;
	}

	isAnalyzing = true;
	updateStatusMessage(`🔍 Analisando ${capturedScreenshots.length} screenshot(s)...`);

	try {
		// Extrai caminhos dos arquivos
		const filepaths = capturedScreenshots.map(s => s.filepath);

		Logger.info('Enviando para análise', { count: filepaths.length });

		// Envia para main.js
		const result = await ipcRenderer.invoke('ANALYZE_SCREENSHOTS', filepaths);

		if (!result.success) {
			Logger.error('Falha na análise', { error: result.error });
			updateStatusMessage(`❌ ${result.error}`);
			return;
		}

		// ✅ Renderiza resposta do GPT
		const questionText = `📸 Análise de ${capturedScreenshots.length} screenshot(s)`;
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

		// ✅ RENDERIZA VIA EVENTBUS (consistente com LLM)
		// Divide análise em tokens e emite como se fosse stream
		const analysisText = result.analysis;
		const tokens = analysisText.split(/(\s+|[.,!?;:\-\(\)\[\]{}\n])/g).filter(t => t.length > 0);

		Logger.info('Simulando stream', { tokenCount: tokens.length });

		// Emite tokens via eventBus (consistente com askLLM)
		let accumulated = '';
		for (const token of tokens) {
			accumulated += token;

			eventBus.emit('answerStreamChunk', {
				questionId: questionId,
				token: token,
				accum: accumulated,
			});

			// Pequeno delay entre tokens para simular streaming real
			await new Promise(resolve => setTimeout(resolve, 2));
		}

		Logger.info('Análise concluída');
		updateStatusMessage('✅ Análise concluída');

		// 🗑️ Limpa screenshots após análise
		Logger.info('Limpando screenshots', { count: capturedScreenshots.length });
		capturedScreenshots = [];

		// Atualiza badge
		emitUIChange('onScreenshotBadgeUpdate', {
			count: 0,
			visible: false,
		});

		// Força limpeza no sistema
		await ipcRenderer.invoke('CLEANUP_SCREENSHOTS');
	} catch (error) {
		Logger.error('Erro ao analisar screenshots', { error: error.message });
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
//	RESET COMPLETO
/* ================================ */

/**
 * Libera a thread para o navegador processar eventos
 * @param {number} ms - Milissegundos para aguardar (default 0 = próximo frame)
 */
function releaseThread(ms = 0) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reseta todo o estado do app
 * Quebrado em chunks para não bloquear a UI thread
 */
async function resetAppState() {
	console.log('🧹 ═══════════════════════════════════════════════════════════');
	console.log('🧹 INICIANDO RESET COMPLETO DO APP');
	console.log('🧹 ═══════════════════════════════════════════════════════════');

	try {
		// 1️⃣ CHUNK 1: Parar autoplay e áudio
		mockAutoPlayActive = false;
		mockScenarioIndex = 0;
		if (isRunning) {
			console.log('🎤 Parando captura de áudio...');
			isRunning = false;
		}
		console.log('✅ Autoplay do mock parado');
		await releaseThread();

		// 2️⃣ CHUNK 2: Limpar perguntas e respostas
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
		await releaseThread();

		// 3️⃣ CHUNK 3: Limpar estado GPT e métricas
		interviewTurnId = 0;
		gptAnsweredTurnId = null;
		gptRequestedTurnId = null;
		gptRequestedQuestionId = null;
		transcriptionMetrics = {
			audioStartTime: null,
			gptStartTime: null,
			gptEndTime: null,
			totalTime: null,
			audioSize: 0,
		};
		console.log('✅ Estado de entrevista resetado');
		console.log('✅ Métricas resetadas');
		await releaseThread();

		// 4️⃣ CHUNK 4: Limpar screenshots
		if (capturedScreenshots.length > 0) {
			console.log(`🗑️ Limpando ${capturedScreenshots.length} screenshot(s)...`);
			capturedScreenshots = [];
			emitUIChange('onScreenshotBadgeUpdate', {
				count: 0,
				visible: false,
			});
			// Força limpeza no sistema (async, não bloqueia)
			try {
				await ipcRenderer.invoke('CLEANUP_SCREENSHOTS');
			} catch (err) {
				console.warn('⚠️ Erro ao limpar screenshots no sistema:', err);
			}
		}
		console.log('✅ Screenshots limpos');
		await releaseThread();

		// 5️⃣ CHUNK 5: Limpar flags
		isCapturing = false;
		isAnalyzing = false;
		console.log('✅ Flags resetadas');
		await releaseThread();

		// 6️⃣ CHUNK 6: Atualizar UI - Perguntas
		emitUIChange('onCurrentQuestionUpdate', {
			text: '',
			isSelected: false,
		});
		emitUIChange('onQuestionsHistoryUpdate', []);
		console.log('✅ Perguntas UI limpa');
		await releaseThread();

		// 7️⃣ CHUNK 7: Atualizar UI - Transcrições e Respostas
		emitUIChange('onTranscriptionCleared');
		emitUIChange('onAnswersCleared');
		console.log('✅ Transcrições e respostas UI limpas');
		await releaseThread();

		// 8️⃣ CHUNK 8: Atualizar UI - Botão Listen
		emitUIChange('onListenButtonToggle', {
			isRunning: false,
			buttonText: '🎤 Começar a Ouvir... (Ctrl+D)',
		});
		console.log('✅ Botão listen resetado');
		await releaseThread();

		// 9️⃣ CHUNK 9: Atualizar UI - Status
		emitUIChange('onStatusUpdate', {
			status: 'ready',
			message: '✅ Pronto',
		});
		console.log('✅ Status atualizado');
		await releaseThread();

		// 🔟 CHUNK 10: Limpar seleções
		clearAllSelections();
		console.log('✅ Seleções limpas');
		await releaseThread();

		// 1️⃣1️⃣ LOG FINAL
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
 * Função auxiliar para liberar a thread do navegador
 * Usada em resetAppState() para quebrar operações longas em chunks
 */
function releaseThread(ms = 0) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================================ */
//	MOCK / DEBUG
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
//	DEBUG LOG RENDERER
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
//	EXPORTAÇÃO PUBLIC API (RendererAPI)
/* ================================ */

/**
 * API Pública exposta do Renderer
 * Métodos públicos que podem ser chamados de fora
 */
const RendererAPI = {
	// Áudio - Gravação
	listenToggleBtn,
	askLLM,
	restartAudioPipeline,

	// 🔥 Estado de transcrição (usado pelo audio-volume-monitor.js)
	get isRunning() {
		return isRunning;
	},

	// Áudio - Monitoramento de volume
	startAudioVolumeMonitor,
	stopAudioVolumeMonitor,
	switchAudioVolumeDevice,

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
	// 🔥 MOVED: applyOpacity foi para config-manager.js
	updateMockBadge: show => {
		emitUIChange('onMockBadgeUpdate', { visible: show });
	},
	setMockToggle: checked => {
		APP_CONFIG.MODE_DEBUG = checked;
		// UI será atualizada via emitUIChange
	},
	setModeSelect: mode => {
		emitUIChange('onModeSelectUpdate', { mode });
	},

	// Drag
	/**
	 * Inicializa drag handle para movimento de janela
	 * MOVIDA PARA: config-manager.js
	 * @deprecated Usar ConfigManager.initDragHandle(dragHandle) em vez disso
	 */

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

 * docListener do botão de reset
 * MOVIDO PARA: config-manager.js (initEventListeners)
 * @deprecated Registrado em config-manager.js
 */
