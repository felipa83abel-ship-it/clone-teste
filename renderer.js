// @ts-check
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
const mockRunner = require('./testing/mock-runner.js'); // 🎭 Mock para teste em MODE_DEBUG
const STTStrategy = require('./strategies/STTStrategy.js');
const LLMManager = require('./llm/LLMManager.js');
const openaiHandler = require('./llm/handlers/openai-handler.js');
const geminiHandler = require('./llm/handlers/gemini-handler.js');
const { validateLLMRequest, handleLLMStream, handleLLMBatch } = require('./handlers/llmHandlers.js');
const {
	ModeManager,
	MODES,
	InterviewModeHandlers,
	NormalModeHandlers,
} = require('./controllers/modes/mode-manager.js');

// 🎯 CONTROLADORES (Fase 2 - Decomposição)
const audioController = require('./controllers/audio/audio-controller.js');
const questionController = require('./controllers/question/question-controller.js');
const screenshotController = require('./controllers/screenshot/screenshot-controller.js');
const rendererHelpers = require('./utils/renderer-helpers.js');
const uiElementsRegistry = require('./utils/ui-elements-registry.js');

// 🎯 INSTANCIAR
const appState = new AppState();
const eventBus = new EventBus();
const sttStrategy = new STTStrategy();
const llmManager = new LLMManager();
const modeManager = new ModeManager(MODES.INTERVIEW); // 🔧 Modo padrão: INTERVIEW

// 🎯 VARIÁVEIS DO MOCK (manipuladas por mock-runner.js)
let mockAutoPlayActive = false;
let mockScenarioIndex = 0;

// 🎯 REGISTRAR MODOS
modeManager.registerMode(MODES.INTERVIEW, InterviewModeHandlers);
modeManager.registerMode(MODES.NORMAL, NormalModeHandlers);

// 🎯 REGISTRAR LLMs
llmManager.register('openai', openaiHandler);
llmManager.register('google', geminiHandler);
// NOSONAR // Futuro: llmManager.register('anthropic', require('./llm/handlers/anthropic-handler.js'));

// 🎯 REGISTRAR LISTENERS DA EVENTBUS (para LLM)
eventBus.on('llmStreamEnd', data => {
	Logger.info('LLM Stream finalizado', { questionId: data.questionId });

	// 🔥 MARCAR COMO RESPONDIDA - essencial para bloquear re-perguntas
	appState.interview.answeredQuestions.add(data.questionId);

	// 🔥 [MODO ENTREVISTA] Pergunta já foi promovida em finalizeCurrentQuestion
	// Aqui só limpamos o CURRENT para próxima pergunta
	if (modeManager.is(MODES.INTERVIEW)) {
		appState.interview.llmAnsweredTurnId = appState.interview.interviewTurnId;
		resetCurrentQuestion();
		renderCurrentQuestion();
	}

	eventBus.emit('answerStreamEnd', {});
});

eventBus.on('llmBatchEnd', data => {
	Logger.info('LLM Batch finalizado', { questionId: data.questionId, responseLength: data.response?.length || 0 });

	// 🔥 MARCAR COMO RESPONDIDA - essencial para bloquear re-perguntas
	appState.interview.answeredQuestions.add(data.questionId);

	// 🔥 Obter turnId da pergunta no histórico
	const questionEntry = appState.history.find(q => q.id === data.questionId);
	const turnId = questionEntry?.turnId || null;

	eventBus.emit('answerBatchEnd', {
		questionId: data.questionId,
		response: data.response,
		turnId, // 🔥 Incluir turnId para renderizar badge
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
	if (navigator?.mediaDevices?.getDisplayMedia) {
		navigator.mediaDevices.getDisplayMedia = async function (...args) {
			console.warn('🔐 BLOQUEADO: Tentativa de usar getDisplayMedia (captura de tela externa)');
			throw new Error('Screen capture not available in this window');
		};
	}

	// ✅ Desabilita captureStream (usado para captura de janela)
	if (globalThis.HTMLCanvasElement?.prototype.captureStream) {
		Object.defineProperty(globalThis.HTMLCanvasElement.prototype, 'captureStream', {
			value: function () {
				console.warn('🔐 BLOQUEADO: Tentativa de usar Canvas.captureStream()');
				throw new Error('Capture stream not available');
			},
			writable: false,
			configurable: false,
		});
	}

	// ✅ Intercepta getUserMedia para avisar sobre tentativas de captura de áudio
	if (navigator?.mediaDevices?.getUserMedia) {
		const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
		navigator.mediaDevices.getUserMedia = async function (constraints) {
			if (constraints?.video) {
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

/* ================================ */
//	SISTEMA DE CALLBACKS E UI ELEMENTS
/* ================================ */

let UIElements = {};
/**
 * Registra elementos UI no registry centralizado
 * DELEGADO para uiElementsRegistry
 */
const registerUIElements = elements => uiElementsRegistry.register(elements);

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

		if (!data?.type) {
			Logger.warn('Dados inválidos para mudança de dispositivo', data);
			return;
		}

		if (!appState.audio.isRunning) {
			Logger.warn('STT não está ativo, ignorando mudança de dispositivo');
			return;
		}

		await sttStrategy.switchDevice(sttModel, data.type, data.deviceId);
	} catch (error) {
		Logger.error('Erro ao processar mudança de dispositivo', { error: error.message });
	}
});

/* Compatibilidade: antigo onUIChange também suporta audioDeviceChanged */

/* ================================ */
//	FUNÇÕES UTILITÁRIAS (HELPERS)
/* ================================ */

/**
 * Obtém o modelo STT configurado via config-manager
 * @returns {string} Nome do modelo STT ou 'error'
 */
function getConfiguredSTTModel() {
	try {
		if (!globalThis.configManager?.config) {
			console.warn('⚠️ configManager não disponível no escopo global');
			return 'error'; // fallback
		}

		const config = globalThis.configManager.config;
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
 * Reseta o estado da pergunta atual (CURRENT)
 */
function resetCurrentQuestion() {
	Logger.debug('Início da função: "resetCurrentQuestion"');

	appState.interview.currentQuestion = {
		text: '',
		lastUpdate: 0,
		finalized: false,
		promotedToHistory: false,
		isBeingAnswered: false,
		lastUpdateTime: null,
		createdAt: null,
		finalText: '',
		interimText: '',
	};

	Logger.debug('Fim da função: "resetCurrentQuestion"');
}

/**
 * Funções de pergunta (delegadas ao question-controller)
 */
const {
	renderQuestionsHistory,
	renderCurrentQuestion,
	handleQuestionClick,
	scrollToSelectedQuestion,
	consolidateQuestionText,
	handleCurrentQuestion,
	finalizeCurrentQuestion,
	closeCurrentQuestionForced,
} = questionController;

/**
 * Retorna o texto da pergunta selecionada (CURRENT ou do histórico)
 * @returns {string} Texto da pergunta selecionada
 */
function getSelectedQuestionText() {
	Logger.debug('Início da função: "getSelectedQuestionText"');
	Logger.debug('Fim da função: "getSelectedQuestionText"');

	// 1️⃣ Se existe seleção explícita
	if (appState.selectedId === CURRENT_QUESTION_ID) {
		return appState.interview.currentQuestion.text;
	}

	if (appState.selectedId) {
		const q = appState.history.find(q => q.id === appState.selectedId);
		if (q?.text) return q.text;
	}

	// 2️⃣ Fallback: CURRENT (se tiver texto)
	if (appState.interview.currentQuestion.text && appState.interview.currentQuestion.text.trim().length > 0) {
		return appState.interview.currentQuestion.text;
	}

	return '';
}

/**
 * Retorna o texto da pergunta selecionada (CURRENT ou do histórico)
 * @returns {string} Texto da pergunta selecionada
 */
function getSelectedQuestionText() {
	Logger.debug('Início da função: "getSelectedQuestionText"');
	Logger.debug('Fim da função: "getSelectedQuestionText"');

	// 1️⃣ Se existe seleção explícita
	if (appState.selectedId === CURRENT_QUESTION_ID) {
		return appState.interview.currentQuestion.text;
	}

	if (appState.selectedId) {
		const q = appState.history.find(q => q.id === appState.selectedId);
		if (q?.text) return q.text;
	}

	// 2️⃣ Fallback: CURRENT (se tiver texto)
	if (appState.interview.currentQuestion.text && appState.interview.currentQuestion.text.trim().length > 0) {
		return appState.interview.currentQuestion.text;
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
	Logger.debug('Início da função: "normalizeForCompare"');
	Logger.debug('Fim da função: "normalizeForCompare"');
	return (t || '')
		.toLowerCase()
		.replaceAll(/[?!.\n\r]/g, '')
		.replaceAll(/\s+/g, ' ')
		.trim();
}

/**
/**
 * Funções utilitárias (delegadas ao renderer-helpers e question-controller)
 */
const { updateStatusMessage, clearAllSelections } = rendererHelpers;
const { findAnswerByQuestionId } = require('./controllers/question/question-helpers.js');

/**
 * Obtém IDs navegáveis de perguntas (CURRENT + histórico)
 * 🔥 ORDEM: CURRENT primeiro, depois histórico em ordem REVERSA (visualmente correto)
 * Porque o histórico é renderizado com reverse(), então a ordem navegável deve ser:
 * [CURRENT, ID_último, ID_penúltimo, ..., ID_primeiro]
 * @returns {array} Array de IDs navegáveis
 */
function getNavigableQuestionIds() {
	const ids = [];
	if (appState.currentQuestion.text) ids.push(CURRENT_QUESTION_ID);
	// 🔥 CORRIGIDO: Reverter histórico para ficar coerente com ordem visual renderizada
	[...appState.history].reverse().forEach(q => ids.push(q.id));
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

/* ================================ */
//	CONTROLE DE ÁUDIO
/* ================================ */

/**
 * Inicia captura de áudio (delegado ao audio-controller)
 */
const { startAudio, stopAudio } = audioController;

/**
 * Reinicia pipeline de áudio
 */

/**
 * Toggle do botão de escuta (delegado ao audio-controller)
 */
const { listenToggleBtn, hasActiveModel, logTranscriptionMetrics } = audioController;

/* ================================ */
//	RENDERIZAÇÃO E NAVEGAÇÃO DE UI
/* ================================ */

/**
 * Renderiza a pergunta atual (CURRENT)
 */
// ✅ DELEGADO para questionController

/**
 * Manipula clique em pergunta
 * @param {string} questionId - ID da pergunta selecionada
 */
// ✅ DELEGADO para questionController

/**
 * Aplica opacidade na interface
 * MOVIDA PARA: config-manager.js
 * @deprecated Usar ConfigManager.applyOpacity(value) em vez disso
 */

/**
 * Rola a lista de perguntas para a pergunta selecionada
 */
// ✅ DELEGADO para questionController

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
/**
 * Consolida texto de fala (interim vs final)
 * Reduz Cognitive Complexity de handleCurrentQuestion
 */
// ✅ DELEGADO para questionController

// ✅ DELEGADO para questionController

// ✅ DELEGADO para questionController

// ✅ DELEGADO para questionController

/* ================================ */
//	SISTEMA LLM
/* ================================ */

/**
 * Envia pergunta selecionada ao LLM (qualquer provider)
 * ✅ REFATORADA: agora é simples e legível!
 * ✅ CENTRALIZADA: Uma única função para todos os LLMs
 * ✅ Não há duplicação de askLLM() por LLM
 * @param {string} questionId - ID da pergunta a responder (padrão: appState.selectedId)
 */
async function askLLM(questionId = null) {
	try {
		const CURRENT_QUESTION_ID = 'CURRENT';
		const targetQuestionId = questionId || appState.selectedId;

		// 1. Validar (antigo validateAskLlmRequest)
		const {
			questionId: validatedId,
			text,
			isCurrent,
		} = validateLLMRequest(appState, targetQuestionId, getSelectedQuestionText);
		Logger.info('Pergunta válida', { questionId: validatedId, textLength: text.length });

		// Rastreamento antigo (compatibilidade)
		const normalizedText = normalizeForCompare(text);
		appState.metrics.llmStartTime = Date.now();

		if (isCurrent) {
			appState.interview.llmRequestedTurnId = appState.interview.interviewTurnId;
			appState.interview.llmRequestedQuestionId = CURRENT_QUESTION_ID;
			appState.interview.lastAskedQuestionNormalized = normalizedText;
		}

		// 2. Rotear por modo (não por LLM!)
		const isInterviewMode = modeManager.is(MODES.INTERVIEW);

		// Obter turnId da pergunta para passar ao LLM
		const questionEntry = appState.history.find(q => q.id === targetQuestionId);
		const turnId = questionEntry?.turnId || null;

		if (isInterviewMode) {
			await handleLLMStream(appState, validatedId, text, SYSTEM_PROMPT, eventBus, llmManager, turnId);
		} else {
			await handleLLMBatch(appState, validatedId, text, SYSTEM_PROMPT, eventBus, llmManager);
		}
		// O llmManager sabe qual LLM usar (OpenAI, Gemini, etc)
		// Sem duplicação de código!
	} catch (error) {
		Logger.error('Erro em askLLM', { error: error.message });
		eventBus.emit('error', error.message);
		updateStatusMessage(`❌ ${error.message}`);
	}
}

/* ================================ */
//	SCREENSHOT E ANÁLISE (delegado ao screenshot-controller)
/* ================================ */

/* ================================ */
//	RESET COMPLETO
/* ================================ */

/**
 * Libera a thread e reseta o app (delegado ao renderer-helpers)
 */
const { releaseThread, resetAppState } = rendererHelpers;

//	DEBUG LOG RENDERER
/* ================================ */

/**
 * Log de debug padronizado para renderer
 * Último argumento opcional é booleano para mostrar ou não o log
 * @param {...any} args - Argumentos a logar
 */

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
	// 🔥 Estado de transcrição (usado pelo audio-volume-monitor.js)
	get isAudioRunning() {
		return appState.audio.isRunning;
	},

	// Áudio - Monitoramento de volume
	startAudioVolumeMonitor,
	stopAudioVolumeMonitor,
	switchAudioVolumeDevice,

	// Entrevista - Reset (centralizado em resetAppState)
	resetAppState,

	// Modo
	changeMode: mode => {
		modeManager.setMode(mode);
		console.log(`📌 Modo alterado via RendererAPI: ${mode}`);
	},
	getMode: () => modeManager.getMode(),

	// Questions
	handleCurrentQuestion,
	handleQuestionClick,

	// 🔥 NOVO: Expor selectedQuestionId via getter para atalhos em config-manager.js
	get selectedId() {
		return appState.selectedId;
	},

	// UI
	// 🔥 MOVED: applyOpacity foi para config-manager.js
	updateMockBadge: show => {
		eventBus.emit('screenshotBadgeUpdate', { visible: show });
	},
	setMockToggle: checked => {
		APP_CONFIG.MODE_DEBUG = checked;
	},
	setModeSelect: mode => {
		eventBus.emit('modeSelectUpdate', { mode });
	},

	// Drag
	/**
	 * Inicializa drag handle para movimento de janela
	 * MOVIDA PARA: config-manager.js
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

	// API Key
	setAppConfig: config => {
		APP_CONFIG = config;
		// 🎭 Inicializa mock interceptor se MODE_DEBUG estiver ativo
		if (APP_CONFIG.MODE_DEBUG) {
			mockRunner.initMockInterceptor({
				eventBus,
				captureScreenshot,
				analyzeScreenshots,
				APP_CONFIG,
			});
			Logger.info('✅ Mock interceptor inicializado para MODE_DEBUG');
		}
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

		let index = all.indexOf(appState.selectedId);
		if (index === -1) {
			// Nenhuma seleção: começa do começo ou do fim
			index = direction === 'up' ? all.length - 1 : 0;
		} else {
			// 🔥 CORRIGIDO: Lógica normal (agora que getNavigableQuestionIds retorna ordem visual correta)
			// 'up' = subir visualmente = diminuir índice
			// 'down' = descer visualmente = aumentar índice
			index += direction === 'up' ? -1 : 1;
			index = Math.max(0, Math.min(index, all.length - 1));
		}

		appState.selectedId = all[index];
		clearAllSelections();
		renderQuestionsHistory();
		renderCurrentQuestion();

		if (APP_CONFIG.MODE_DEBUG) {
			const msg = direction === 'up' ? '🧪 Ctrl+ArrowUp detectado (teste)' : '🧪 Ctrl+ArrowDown detectado (teste)';
			updateStatusMessage(msg);
			console.log('📌 Atalho Selecionou:', appState.selectedId);
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
	onAskLlm: callback => {
		ipcRenderer.on('CMD_ASK_LLM', callback);
	},
	onLlmStreamChunk: callback => {
		ipcRenderer.on('LLM_STREAM_CHUNK', callback);
	},
	onLlmStreamEnd: callback => {
		ipcRenderer.on('LLM_STREAM_END', callback);
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
	getScreenshotCount: () => appState.audio.capturedScreenshots.length,

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
	globalThis.eventBus = eventBus; // 🎭 Exporta EventBus singleton para todos os módulos
	globalThis.runMockAutoPlay = () => mockRunner.runMockAutoPlay(); // 🎭 Exportar Mock
}
