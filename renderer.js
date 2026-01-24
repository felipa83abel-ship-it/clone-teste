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
// ✅ DEPRECATED: MODES definido em mode-manager.js (veja linhas 29-40)

// ✅ DEPRECATED: CURRENT_MODE removido - use modeManager.getMode() (Fase 4)
// Modo atual gerenciado por modeManager (veja linhas 36-40)

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

// 🔥 NOTA: Estado agora centralizado em appState (veja linhas 30-31)
// - appState.audio.{ isRunning, capturedScreenshots, isCapturing, isAnalyzing }
// - appState.window.{ isDraggingWindow }
// - appState.interview.{ currentQuestion, questionsHistory, selectedQuestionId, ... }
// - appState.metrics.{ audioStartTime, llmStartTime, llmFirstTokenTime, ... }
// Acesso: use helpers appState.q, appState.history, appState.selectedId
// ou use getters/setters em AppState.js para compatibilidade
// 🔒 answeredQuestions migrado para appState.interview.answeredQuestions (AppState.js)

/* ================================ */
//	SISTEMA DE CALLBACKS E UI ELEMENTS
/* ================================ */
// ✅ DEPRECATED: UICallbacks migrado para EventBus (Fase 3)
// Anteriormente: const UICallbacks = { ... } com 25+ callbacks
// Agora: eventBus.emit('eventName', data) centralizado

/**
 * DEPRECATED: Registra elementos de UI (migrado para EventBus em Fase 3)
 */
let UIElements = {};
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
 * Finaliza pergunta adicionando "?" se necessário
 * @param {string} t - Texto da pergunta
 * @returns {string} Pergunta finalizada
 */
function finalizeQuestion(t) {
	Logger.debug('Início da função: "finalizeQuestion"');
	Logger.debug('Fim da função: "finalizeQuestion"');
	return t.trim().endsWith('?') ? t.trim() : t.trim() + '?';
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
 * Renderiza o histórico de perguntas
 */
function renderQuestionsHistory() {
	Logger.debug('Início da função: "renderQuestionsHistory"');

	// 🔥 Gera dados estruturados - config-manager renderiza no DOM
	const historyData = [...appState.history].reverse().map(q => {
		let label = q.text;
		if (ENABLE_INTERVIEW_TIMING_DEBUG_METRICS && q.lastUpdateTime) {
			const time = new Date(q.lastUpdateTime).toLocaleTimeString();
			label = `⏱️ ${time} — ${label}`;
		}

		return {
			id: q.id,
			turnId: q.turnId, // 🔥 Incluir turnId para exibição visual
			text: label,
			isIncomplete: q.incomplete,
			isAnswered: q.answered,
			isSelected: q.id === appState.selectedId,
		};
	});

	eventBus.emit('questionsHistoryUpdate', historyData);
	eventBus.emit('scrollToQuestion', {
		questionId: appState.selectedId,
	});

	Logger.debug('Fim da função: "renderQuestionsHistory"');
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
 * Atualiza a mensagem de status na UI
 * @param {string} message - Mensagem de status
 */
function updateStatusMessage(message) {
	Logger.debug('Início da função: "updateStatusMessage"');
	eventBus.emit('statusUpdate', { message });
	Logger.debug('Fim da função: "updateStatusMessage"');
}

/**
 * Verifica se uma pergunta já foi respondida pelo ID
 * @param {string} questionId - ID da pergunta
 * @returns {boolean} true se pergunta já foi respondida
 */
function findAnswerByQuestionId(questionId) {
	Logger.debug('Início da função: "findAnswerByQuestionId"');

	if (!questionId) {
		// ID inválido
		Logger.debug('Fim da função: "findAnswerByQuestionId"');
		return false;
	}

	Logger.debug('Fim da função: "findAnswerByQuestionId"');
	return appState.interview.answeredQuestions.has(questionId);
}

/**
 * Promove pergunta atual para histórico
 * @param {string} text - Texto da pergunta
 */

/**
 * Limpa todas as seleções visuais
 */
function clearAllSelections() {
	// Emite evento para o controller limpar as seleções visuais
	eventBus.emit('clearAllSelections', {});
}

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
	if (appState.interview.currentQuestion.text) closeCurrentQuestionForced();

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

/**
 * Toggle do botão de iniciar/parar escuta (Ctrl+D)
 */
async function listenToggleBtn() {
	Logger.debug('Início da função: "listenToggleBtn"');

	if (!appState.audio.isRunning) {
		Logger.debug('🎤 listenToggleBtn: Tentando INICIAR escuta...', true);

		// 🔥 VALIDAÇÃO 1: Modelo de IA ativo
		const { active: hasModel, model: activeModel } = hasActiveModel();
		Logger.debug(`📊 DEBUG: hasModel = ${hasModel}, activeModel = ${activeModel}`, false);

		if (!hasModel) {
			const errorMsg = 'Ative um modelo de IA antes de começar a ouvir';
			eventBus.emit('error', errorMsg);
			return;
		}

		// 🔥 VALIDAÇÃO 2: Dispositivo de áudio de SAÍDA (obrigatório para ouvir a reunião)
		const hasOutputDevice = UIElements.outputSelect?.value;
		Logger.debug(`📊 DEBUG: hasOutputDevice = ${hasOutputDevice}`, false);

		if (!hasOutputDevice) {
			const errorMsg = 'Selecione um dispositivo de áudio (output) para ouvir a reunião';
			Logger.warn(`⚠️ ${errorMsg}`, true);
			Logger.debug('📡 DEBUG: Emitindo onError:', errorMsg);
			eventBus.emit('error', errorMsg);
			return;
		}
	}

	// Inverte o estado de appState.audio.isRunning
	appState.audio.isRunning = !appState.audio.isRunning;
	const buttonText = appState.audio.isRunning ? 'Parar a Escuta... (Ctrl+d)' : 'Começar a Ouvir... (Ctrl+d)';
	const statusMsg = appState.audio.isRunning ? 'Status: ouvindo...' : 'Status: parado';

	// Emite o evento 'onListenButtonToggle' para atualizar o botão de escuta
	eventBus.emit('listenButtonToggle', {
		isRunning: appState.audio.isRunning,
		buttonText,
	});

	// Atualiza o status da escuta na tela
	updateStatusMessage(statusMsg);

	await (appState.audio.isRunning ? startAudio() : stopAudio());

	Logger.debug('Fim da função: "listenToggleBtn"');
}

/**
 * Verifica se há um modelo de IA ativo na configuração
 * @returns {object} { active: boolean, model: string|null }
 */
function hasActiveModel() {
	Logger.debug('Início da função: "hasActiveModel"');
	if (!globalThis.configManager) {
		console.warn('⚠️ ConfigManager não inicializado ainda');
		return { active: false, model: null };
	}

	const config = globalThis.configManager.config;
	if (!config?.api) {
		console.warn('⚠️ Config ou api não disponível');
		return { active: false, model: null };
	}

	// Verifica se algum modelo está ativo e retorna o nome
	const providers = ['openai', 'google', 'openrouter', 'custom'];
	for (const provider of providers) {
		if (config.api[provider]?.enabled === true) {
			console.log(`✅ Modelo ativo encontrado: ${provider}`);
			return { active: true, model: provider };
		}
	}

	Logger.debug('Fim da função: "hasActiveModel"');
	return { active: false, model: null };
}

/* ================================ */
//	RENDERIZAÇÃO E NAVEGAÇÃO DE UI
/* ================================ */

/**
 * Renderiza a pergunta atual (CURRENT)
 */
function renderCurrentQuestion() {
	Logger.debug('Início da função: "renderCurrentQuestion"');

	// Se não há texto, emite vazio
	if (!appState.interview.currentQuestion.text) {
		eventBus.emit('currentQuestionUpdate', { text: '', isSelected: false });
		return;
	}

	let label = appState.interview.currentQuestion.text;

	// Adiciona timestamp se modo debug métricas ativo
	if (ENABLE_INTERVIEW_TIMING_DEBUG_METRICS && appState.interview.currentQuestion.lastUpdateTime) {
		const time = new Date(appState.interview.currentQuestion.lastUpdateTime).toLocaleTimeString();
		label = `⏱️ ${time} — ${label}`;
	}

	// 🔥 Gera dados estruturados - config-manager renderiza no DOM
	const questionData = {
		text: label,
		isSelected: appState.selectedId === CURRENT_QUESTION_ID,
		rawText: appState.interview.currentQuestion.text,
		createdAt: appState.interview.currentQuestion.createdAt,
		lastUpdateTime: appState.interview.currentQuestion.lastUpdateTime,
	};

	// Emite evento para o config-manager renderizar no DOM
	eventBus.emit('currentQuestionUpdate', questionData);

	Logger.debug('Fim da função: "renderCurrentQuestion"');
}

/**
 * Manipula clique em pergunta
 * @param {string} questionId - ID da pergunta selecionada
 */
function handleQuestionClick(questionId) {
	Logger.debug('Início da função: "handleQuestionClick"');
	appState.selectedId = questionId;
	clearAllSelections();
	renderQuestionsHistory();
	renderCurrentQuestion();

	// ⚠️ CURRENT nunca bloqueia resposta
	if (questionId !== CURRENT_QUESTION_ID) {
		const existingAnswer = findAnswerByQuestionId(questionId);

		if (existingAnswer) {
			eventBus.emit('answerSelected', {
				questionId: questionId,
				shouldScroll: true,
			});

			updateStatusMessage('📌 Essa pergunta já foi respondida');
			Logger.debug('Fim da função: "handleQuestionClick" (pergunta já respondida, sem re-perguntar)');
			return; // 🔥 CRÍTICO: Retornar aqui, não chamar askLLM()
		}
	}

	// Se for uma pergunta do histórico marcada como incompleta, não enviar automaticamente ao LLM
	if (questionId !== CURRENT_QUESTION_ID) {
		const q = appState.history.find(q => q.id === questionId);
		if (q?.incomplete) {
			updateStatusMessage('⚠️ Pergunta incompleta — pressione o botão de responder para enviar ao LLM');
			console.log('ℹ️ pergunta incompleta selecionada — aguarda envio manual:', q.text);
			Logger.debug('Fim da função: "handleQuestionClick" (pergunta incompleta)');
			return; // 🔥 CRÍTICO: Retornar aqui também
		}
	}

	if (
		modeManager.is(MODES.INTERVIEW) &&
		appState.selectedId === CURRENT_QUESTION_ID &&
		appState.interview.llmAnsweredTurnId === appState.interview.interviewTurnId
	) {
		updateStatusMessage('⛔ LLM já respondeu esse turno');
		console.log('⛔ LLM já respondeu esse turno');
		Logger.debug('Fim da função: "handleQuestionClick" (LLM já respondeu)');
		return; // 🔥 CRÍTICO: Retornar aqui
	}

	// ❓ Ainda não respondida → promover CURRENT se necessário e chamar LLM
	// 🔥 Se for CURRENT, promover para histórico ANTES de chamar askLLM
	if (questionId === CURRENT_QUESTION_ID) {
		if (!appState.interview.currentQuestion.text?.trim()) {
			updateStatusMessage('⚠️ Pergunta vazia - nada a responder');
			Logger.debug('Fim da função: "handleQuestionClick" (pergunta vazia)');
			return;
		}

		// Promover CURRENT para histórico se ainda não foi promovido
		if (!appState.interview.currentQuestion.finalized) {
			appState.interview.currentQuestion.text = finalizeQuestion(appState.interview.currentQuestion.text);
			appState.interview.currentQuestion.lastUpdateTime = Date.now();
			appState.interview.currentQuestion.finalized = true;

			// 🔥 [CRÍTICO] Incrementa turnId APENAS na hora de promover (não na primeira fala)
			// 🔥 [MODO PADRÃO] usar newId como turnId
			const newId = String(appState.history.length + 1);

			if (modeManager.is(MODES.INTERVIEW)) {
				appState.interview.interviewTurnId++;
				appState.interview.currentQuestion.turnId = appState.interview.interviewTurnId;
			} else {
				// Modo PADRÃO: usar newId como turnId
				appState.interview.currentQuestion.turnId = Number.parseInt(newId);
			}

			appState.history.push({
				id: newId,
				text: appState.interview.currentQuestion.text,
				turnId: appState.interview.currentQuestion.turnId,
				createdAt: appState.interview.currentQuestion.createdAt || Date.now(),
				lastUpdateTime: appState.interview.currentQuestion.lastUpdateTime || Date.now(),
			});

			appState.interview.currentQuestion.promotedToHistory = true;
			resetCurrentQuestion();
			appState.selectedId = newId;
			renderQuestionsHistory();
			renderCurrentQuestion();

			Logger.debug('🔥 CURRENT promovido para histórico via handleQuestionClick', { newId }, false);

			// Chamar askLLM com o novo ID promovido
			askLLM(newId);
			Logger.debug('Fim da função: "handleQuestionClick" (CURRENT promovido e askLLM chamado)');
			return;
		}
	}

	// ❓ Ainda não respondida → chama LLM (click ou atalho)
	askLLM();

	Logger.debug('Fim da função: "handleQuestionClick"');
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
	eventBus.emit('scrollToQuestion', {
		questionId: appState.selectedId,
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
/**
 * Consolida texto de fala (interim vs final)
 * Reduz Cognitive Complexity de handleCurrentQuestion
 */
function consolidateQuestionText(cleaned, isInterim) {
	const q = appState.interview.currentQuestion;

	if (isInterim) {
		q.interimText = cleaned;
	} else {
		q.interimText = '';
		q.finalText = (q.finalText ? q.finalText + ' ' : '') + cleaned;
	}

	q.text = q.finalText.trim() + (q.interimText ? ' ' + q.interimText : '');
}

function handleCurrentQuestion(author, text, options = {}) {
	Logger.debug('Início da função: "handleCurrentQuestion"');

	const cleaned = text.replaceAll(/Ê+|hum|ahn/gi, '').trim();
	const now = Date.now();

	// Apenas consolida falas no CURRENT do OTHER
	if (author === OTHER) {
		// Se não existe texto ainda, marca tempo de criação
		if (!appState.interview.currentQuestion.text) {
			appState.interview.currentQuestion.createdAt = now;
		}

		appState.interview.currentQuestion.lastUpdateTime = now;
		appState.interview.currentQuestion.lastUpdate = now;

		// Consolidar texto
		consolidateQuestionText(cleaned, options.isInterim);

		// 🟦 CURRENT vira seleção padrão ao receber fala
		if (!appState.selectedId) {
			appState.selectedId = CURRENT_QUESTION_ID;
			clearAllSelections();
		}

		// Renderizar pergunta
		renderCurrentQuestion();

		// Finalizar se em silêncio
		if (options.shouldFinalizeAskCurrent && !options.isInterim) {
			finalizeCurrentQuestion();
		}
	}

	Logger.debug('Fim da função: "handleCurrentQuestion"');
}

/**
 * Finaliza a pergunta atual para histórico
 */
function finalizeCurrentQuestion() {
	Logger.debug('Início da função: "finalizeCurrentQuestion"');

	// Se não há texto, ignorar
	if (!appState.interview.currentQuestion.text?.trim()) {
		console.log('⚠️ finalizeCurrentQuestion: Sem texto para finalizar');
		return;
	}

	// 🔒 GUARDA ABSOLUTA: Se a pergunta já foi finalizada, NÃO faça nada.
	if (appState.interview.currentQuestion.finalized) {
		console.log('⛔ finalizeCurrentQuestion ignorado — pergunta já finalizada');
		return;
	}

	// ⚠️ No modo entrevista: PROMOVER ANTES de chamar LLM
	if (modeManager.is(MODES.INTERVIEW)) {
		appState.interview.currentQuestion.text = finalizeQuestion(appState.interview.currentQuestion.text);
		appState.interview.currentQuestion.lastUpdateTime = Date.now();
		appState.interview.currentQuestion.finalized = true;

		// 🔥 [NOVO] PROMOVER PARA HISTÓRICO ANTES DE CHAMAR LLM
		// Isso garante que o texto está seguro e imutável durante resposta do LLM
		const newId = String(appState.history.length + 1);

		// 🔥 [CRÍTICO] Incrementa turnId APENAS na hora de promover (não na primeira fala)
		appState.interview.interviewTurnId++;
		appState.interview.currentQuestion.turnId = appState.interview.interviewTurnId;

		appState.history.push({
			id: newId,
			text: appState.interview.currentQuestion.text,
			turnId: appState.interview.currentQuestion.turnId, // 🔥 Incluir turnId na entrada do histórico
			createdAt: appState.interview.currentQuestion.createdAt || Date.now(),
			lastUpdateTime: appState.interview.currentQuestion.lastUpdateTime || Date.now(),
		});

		appState.interview.currentQuestion.promotedToHistory = true;

		// 🔥 [CRÍTICO] LIMPAR CURRENT LOGO APÓS PROMOVER
		// Não espera nem o render nem o LLM
		resetCurrentQuestion();

		// garante seleção lógica
		appState.selectedId = newId;
		renderQuestionsHistory();
		renderCurrentQuestion(); // 🔥 Renderiza CURRENT limpo

		// 🔥 [NOVO] Chamar LLM DEPOIS que pergunta foi promovida e salva
		// chama LLM automaticamente se ainda não respondeu este turno
		if (
			appState.interview.llmRequestedTurnId !== appState.interview.interviewTurnId &&
			appState.interview.llmAnsweredTurnId !== appState.interview.interviewTurnId
		) {
			askLLM(newId); // Passar ID promovido para LLM
		}

		Logger.debug('Fim da função: "finalizeCurrentQuestion"');
		return;
	}

	//  ⚠️ No modo normal - trata perguntas que parecem incompletas
	if (!modeManager.is(MODES.INTERVIEW)) {
		console.log(
			'⚠️ No modo normal detectado — promovendo ao histórico sem chamar LLM:',
			appState.interview.currentQuestion.text,
		);

		const newId = String(appState.history.length + 1);
		appState.history.push({
			id: newId,
			text: appState.interview.currentQuestion.text,
			// 🔥 No modo PADRÃO: usar newId como turnId para exibir badge
			turnId: Number.parseInt(newId),
			createdAt: appState.interview.currentQuestion.createdAt || Date.now(),
			lastUpdateTime:
				appState.interview.currentQuestion.lastUpdateTime || appState.interview.currentQuestion.createdAt || Date.now(),
		});

		appState.selectedId = newId;
		resetCurrentQuestion();
		renderQuestionsHistory();
		renderCurrentQuestion(); // 🔥 Renderiza CURRENT limpo

		Logger.debug('Fim da função: "finalizeCurrentQuestion"');
	}
}

/**
 * Força o fechamento da pergunta atual, promovendo-a ao histórico
 */
function closeCurrentQuestionForced() {
	Logger.debug('Início da função: "closeCurrentQuestionForced"');

	// log temporario para testar a aplicação só remover depois
	console.log('🚪 Fechando pergunta:', appState.interview.currentQuestion.text);

	if (!appState.interview.currentQuestion.text) return;

	appState.history.push({
		id: crypto.randomUUID(),
		text: finalizeQuestion(appState.interview.currentQuestion.text),
		createdAt: appState.interview.currentQuestion.createdAt || Date.now(),
	});

	appState.interview.currentQuestion.text = '';
	appState.selectedId = null; // 👈 libera seleção
	renderQuestionsHistory();
	renderCurrentQuestion();

	Logger.debug('Fim da função: "closeCurrentQuestionForced"');
}

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

/**
 * Log detalhado das métricas de tempo da transcrição
 */
function logTranscriptionMetrics() {
	if (!appState.metrics.audioStartTime) return;

	const llmTime = appState.metrics.llmEndTime - appState.metrics.llmStartTime;
	const totalTime = appState.metrics.totalTime;

	console.log(`📊 ================================`);
	console.log(`📊 MÉTRICAS DE TEMPO DETALHADAS:`);
	console.log(`📊 ================================`);
	console.log(`📊 TAMANHO ÁUDIO: ${appState.metrics.audioSize} bytes`);
	console.log(`📊 LLM: ${llmTime}ms`);
	console.log(`📊 TOTAL: ${totalTime}ms`);
	console.log(`📊 LLM % DO TOTAL: ${Math.round((llmTime / totalTime) * 100)}%`);
	console.log(`📊 ================================`);

	// Reset para próxima medição
	appState.metrics = {
		audioStartTime: null,
		llmStartTime: null,
		llmEndTime: null,
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
	if (appState.audio.isCapturing) {
		console.log('⏳ Captura já em andamento...');
		return;
	}

	appState.audio.isCapturing = true;
	updateStatusMessage('📸 Capturando tela...');

	try {
		const result = await ipcRenderer.invoke('CAPTURE_SCREENSHOT');

		if (!result.success) {
			console.warn('⚠️ Falha na captura:', result.error);
			updateStatusMessage(`❌ ${result.error}`);
			eventBus.emit('screenshotBadgeUpdate', {
				count: appState.audio.capturedScreenshots.length,
				visible: appState.audio.capturedScreenshots.length > 0,
			});
			return;
		}

		// ✅ Armazena referência do screenshot
		appState.audio.capturedScreenshots.push({
			filepath: result.filepath,
			filename: result.filename,
			timestamp: result.timestamp,
			size: result.size,
		});

		console.log(`✅ Screenshot capturado: ${result.filename}`);
		console.log(`📦 Total em memória: ${appState.audio.capturedScreenshots.length}`);

		// Atualiza UI
		updateStatusMessage(`✅ ${appState.audio.capturedScreenshots.length} screenshot(s) capturado(s)`);
		eventBus.emit('screenshotBadgeUpdate', {
			count: appState.audio.capturedScreenshots.length,
			visible: true,
		});
	} catch (error) {
		console.error('❌ Erro ao capturar screenshot:', error);
		updateStatusMessage('❌ Erro na captura');
	} finally {
		appState.audio.isCapturing = false;
	}
}

/**
 * Envia screenshots para análise com OpenAI Vision
 */
async function analyzeScreenshots() {
	if (appState.audio.isAnalyzing) {
		Logger.info('Análise já em andamento');
		return;
	}

	if (appState.audio.capturedScreenshots.length === 0) {
		Logger.warn('Nenhum screenshot para analisar');
		updateStatusMessage('⚠️ Nenhum screenshot para analisar (capture com Ctrl+Shift+F)');
		return;
	}

	appState.audio.isAnalyzing = true;
	updateStatusMessage(`🔍 Analisando ${appState.audio.capturedScreenshots.length} screenshot(s)...`);

	try {
		// Extrai caminhos dos arquivos
		const filepaths = appState.audio.capturedScreenshots.map(s => s.filepath);

		Logger.info('Enviando para análise', { count: filepaths.length });

		// Envia para main.js
		const result = await ipcRenderer.invoke('ANALYZE_SCREENSHOTS', filepaths);

		if (!result.success) {
			Logger.error('Falha na análise', { error: result.error });
			updateStatusMessage(`❌ ${result.error}`);
			return;
		}

		// ✅ Renderiza resposta do LLM como se fosse uma pergunta normal
		const questionText = `📸 Análise de ${appState.audio.capturedScreenshots.length} screenshot(s)`;
		const questionId = String(appState.history.length + 1);

		// Adiciona "pergunta" ao histórico ANTES de renderizar respostas
		appState.history.push({
			id: questionId,
			text: questionText,
			createdAt: Date.now(),
			lastUpdateTime: Date.now(),
			answered: true,
		});

		// ✅ MARCA COMO RESPONDIDA (importante para clique não gerar duplicata)
		appState.interview.answeredQuestions.add(questionId);

		renderQuestionsHistory();

		// ✅ RENDERIZA VIA EVENTBUS (consistente com LLM)
		// Divide análise em tokens e emite como se fosse stream
		const analysisText = result.analysis;
		const tokens = analysisText.split(/(\s+|[.,!?;:\-()[\]{}\n])/g).filter(t => t.length > 0);

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
		Logger.info('Limpando screenshots', { count: appState.audio.capturedScreenshots.length });
		appState.audio.capturedScreenshots = [];

		// Atualiza badge
		eventBus.emit('screenshotBadgeUpdate', {
			count: 0,
			visible: false,
		});

		// Força limpeza no sistema
		await ipcRenderer.invoke('CLEANUP_SCREENSHOTS');
	} catch (error) {
		Logger.error('Erro ao analisar screenshots', { error: error.message });
		updateStatusMessage('❌ Erro na análise');
	} finally {
		appState.audio.isAnalyzing = false;
	}
}

/**
 * Limpa todos os screenshots armazenados
 */
function clearScreenshots() {
	if (appState.audio.capturedScreenshots.length === 0) return;

	console.log(`🗑️ Limpando ${appState.audio.capturedScreenshots.length} screenshot(s)...`);
	appState.audio.capturedScreenshots = [];

	updateStatusMessage('✅ Screenshots limpos');
	eventBus.emit('screenshotBadgeUpdate', {
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
 * Reseta o estado do app
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
		if (appState.audio.isRunning) {
			console.log('🎤 Parando captura de áudio...');
			appState.audio.isRunning = false;
		}
		console.log('✅ Autoplay do mock parado');
		await releaseThread();

		// 2️⃣ CHUNK 2: Limpar perguntas e respostas
		appState.interview.currentQuestion = {
			text: '',
			lastUpdate: 0,
			finalized: false,
			promotedToHistory: false,
			turnId: null,
			lastUpdateTime: null,
			createdAt: null,
			finalText: '',
			interimText: '',
		};
		appState.history = [];
		appState.interview.answeredQuestions.clear();
		appState.selectedId = null;
		appState.interview.lastAskedQuestionNormalized = null;
		console.log('✅ Perguntas e respostas limpas');
		await releaseThread();

		// 3️⃣ CHUNK 3: Limpar estado LLM e métricas
		appState.interview.interviewTurnId = 0;
		appState.interview.llmAnsweredTurnId = null;
		appState.interview.llmRequestedTurnId = null;
		appState.interview.llmRequestedQuestionId = null;
		appState.metrics = {
			audioStartTime: null,
			llmStartTime: null,
			llmEndTime: null,
			totalTime: null,
			audioSize: 0,
		};
		console.log('✅ Estado de entrevista resetado');
		console.log('✅ Métricas resetadas');
		await releaseThread();

		// 4️⃣ CHUNK 4: Limpar screenshots
		if (appState.audio.capturedScreenshots.length > 0) {
			console.log(`🗑️ Limpando ${appState.audio.capturedScreenshots.length} screenshot(s)...`);
			appState.audio.capturedScreenshots = [];
			eventBus.emit('screenshotBadgeUpdate', {
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
		appState.audio.isCapturing = false;
		appState.audio.isAnalyzing = false;
		console.log('✅ Flags resetadas');
		await releaseThread();

		// 6️⃣ CHUNK 6: Atualizar UI - Perguntas
		eventBus.emit('currentQuestionUpdate', {
			text: '',
			isSelected: false,
		});
		eventBus.emit('questionsHistoryUpdate', []);
		console.log('✅ Perguntas UI limpa');
		await releaseThread();

		// 7️⃣ CHUNK 7: Atualizar UI - Transcrições e Respostas
		eventBus.emit('transcriptionCleared');
		eventBus.emit('answersCleared');
		console.log('✅ Transcrições e respostas UI limpas');
		await releaseThread();

		// 8️⃣ CHUNK 8: Atualizar UI - Botão Listen
		eventBus.emit('listenButtonToggle', {
			isRunning: false,
			buttonText: '🎤 Começar a Ouvir... (Ctrl+D)',
		});
		console.log('✅ Botão listen resetado');
		await releaseThread();

		// 9️⃣ CHUNK 9: Atualizar UI - Status
		eventBus.emit('statusUpdate', {
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
