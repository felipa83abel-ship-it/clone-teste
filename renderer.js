/* ===============================
   IMPORTS
=============================== */
const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const hljs = require('highlight.js');

/* ===============================
   CONSTANTES
=============================== */

const YOU = 'Você';
const OTHER = 'Outros';

const ENABLE_INTERVIEW_TIMING_DEBUG = true; // ← desligar depois = false
const QUESTION_IDLE_TIMEOUT = 300; // reduzido para diminuir latência percebida
const CURRENT_QUESTION_ID = 'CURRENT';

const INPUT_SPEECH_THRESHOLD = 20; //
const INPUT_SILENCE_TIMEOUT = 100; // 1600 300
const MIN_INPUT_AUDIO_SIZE = 1000; // normal 1000
const MIN_INPUT_AUDIO_SIZE_INTERVIEW = 350; // 350

const OUTPUT_SPEECH_THRESHOLD = 8; // detecta fala mais cedo 8
const OUTPUT_SILENCE_TIMEOUT = 250; // menos espera no fim 250
const MIN_OUTPUT_AUDIO_SIZE = 2500; // normal 2500
const MIN_OUTPUT_AUDIO_SIZE_INTERVIEW = 400; // reduzido para detectar perguntas mais cedo

const OUTPUT_ENDING_PHRASES = ['tchau', 'tchau tchau', 'obrigado', 'valeu', 'falou', 'beleza', 'ok'];

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
let currentQuestion = { text: '', lastUpdate: 0, finalized: false };
let questionsHistory = [];
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
	onModeSelectUpdate: null,
	onPlaceholderFulfill: null,
};

// Função para config-manager se inscrever em eventos
function onUIChange(eventName, callback) {
	if (UICallbacks.hasOwnProperty(eventName)) {
		UICallbacks[eventName] = callback;
		console.log(`📡 UI callback registrado: ${eventName}`);
	}
}

// Dispara um callback com dados
function emitUIChange(eventName, data) {
	//console.log(`📡 DEBUG: emitUIChange('${eventName}', ${typeof data === 'object' ? JSON.stringify(data) : data})`);
	if (UICallbacks[eventName] && typeof UICallbacks[eventName] === 'function') {
		//console.log(`✅ DEBUG: Callback encontrado para '${eventName}', disparando...`);
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
	console.log('✅ UI Elements registrados no renderer');
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

	isInterview() {
		return CURRENT_MODE === MODES.INTERVIEW;
	},

	// ⏱️ MediaRecorder.start(timeslice)
	mediaRecorderTimeslice() {
		if (!this.isInterview()) return null;

		// OUTPUT pode ser mais agressivo que INPUT
		return 60; // reduzido para janelas parciais mais responsivas
	},

	// 🎧 transcrição incremental
	allowPartialTranscription() {
		return this.isInterview();
	},

	// 🤖 GPT streaming
	allowGptStreaming() {
		return this.isInterview();
	},

	// 📦 tamanho mínimo de áudio aceito
	minInputAudioSize(defaultSize) {
		return this.isInterview() ? Math.min(400, defaultSize) : defaultSize;
	},
};

/* ===============================
   HELPERS PUROS
=============================== */

function finalizeQuestion(t) {
	return t.trim().endsWith('?') ? t.trim() : t.trim() + '?';
}

function normalizeForCompare(t) {
	return (t || '')
		.toLowerCase()
		.replace(/[?!.\n\r]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function looksLikeQuestion(t) {
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

	return s.includes('?') || questionStarters.some(q => s.startsWith(q));
}

function isGarbageSentence(t) {
	const s = t.toLowerCase();
	return ['obrigado', 'até a próxima', 'finalizando'].some(w => s.includes(w));
}

// Encurta uma resposta em markdown para até `maxSentences` sentenças.
function shortenAnswer(markdownText, maxSentences = 2) {
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

	return result;
}

function isIncompleteQuestion(t) {
	if (!t) return false;
	const s = t.trim();
	// casos óbvios: contém reticências (..., …) — normalmente placeholders ou cortes
	if (s.includes('...') || s.includes('…')) return true;

	// termina com fragmento muito curto seguido de pontuação (ex: "O que é a...")
	// ou termina com apenas 1-3 letras antes do fim (sinal de corte)
	if (/\b\w{1,3}[\.]{0,3}$/.test(s) && /\.\.{1,3}$/.test(s)) return true;

	// termina com palavra muito curta e sem contexto (ex: endsWith ' a' )
	if (/\b[a-z]{1,2}$/.test(s.toLowerCase())) return true;

	return false;
}

function getNavigableQuestionIds() {
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

	return ids;
}

function findAnswerByQuestionId(questionId) {
	// Rastreia respostas internamente (não acessa DOM)
	// Mantém um mapa de questionId -> answerData
	// Por enquanto, retorna null se não encontrado
	return null;
}

function promoteCurrentToHistory(text) {
	console.log('📚 promovendo pergunta para histórico:', text);

	// evita duplicação no histórico: se a última entrada é igual (normalizada), não adiciona
	const last = questionsHistory.length ? questionsHistory[questionsHistory.length - 1] : null;
	if (last && normalizeForCompare(last.text) === normalizeForCompare(text)) {
		console.log('🔕 pergunta igual já presente no histórico — pulando promoção');

		// limpa CURRENT mas preserva seleção conforme antes
		const prevSelected = selectedQuestionId;
		currentQuestion = { text: '', lastUpdate: 0, finalized: false };
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
	});

	// preserva seleção do usuário: se não havia seleção explícita ou estava no CURRENT,
	// mantém a seleção no CURRENT para que o novo CURRENT seja principal.
	const prevSelected = selectedQuestionId;

	currentQuestion = { text: '', lastUpdate: 0, finalized: false };

	if (prevSelected === null || prevSelected === CURRENT_QUESTION_ID) {
		selectedQuestionId = CURRENT_QUESTION_ID;
	} else {
		// usuário tinha selecionado algo no histórico — preserva essa seleção
		selectedQuestionId = prevSelected;
	}

	renderQuestionsHistory();
	renderCurrentQuestion();
}

function isQuestionReady(text) {
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

	// só dispara se houver indício real
	return hasIndicator || hasQuestionMark;
}

function resetInterviewRuntimeState() {
	outputPartialChunks = [];
	outputPartialText = '';

	if (outputPartialTimer) {
		clearTimeout(outputPartialTimer);
		outputPartialTimer = null;
	}

	console.log('♻️ Estado do modo entrevista resetado');
}

function isEndingPhrase(text) {
	const normalized = text.toLowerCase().trim();
	return OUTPUT_ENDING_PHRASES.some(p => normalized === p);
}

/* ===============================
   DISPOSITIVOS / CONTROLE DE ÁUDIO
=============================== */

async function startAudio() {
	if (!UIElements.inputSelect?.value && !UIElements.outputSelect?.value) {
		updateStatusMessage('Status: selecione um dispositivo');
		return;
	}

	audioContext = new AudioContext();

	if (UIElements.inputSelect?.value) await startInput();
	if (UIElements.outputSelect?.value) await startOutput();
}

async function stopAudio() {
	if (currentQuestion.text) closeCurrentQuestionForced();

	inputRecorder?.state === 'recording' && inputRecorder.stop();
	outputRecorder?.state === 'recording' && outputRecorder.stop();
}

async function restartAudioPipeline() {
	stopAudio();
	stopInputMonitor();
	stopOutputMonitor();

	// 🔥 reinicia pipeline, mas NÃO liga escuta
	if (UIElements.inputSelect?.value || UIElements.outputSelect?.value) {
		await startAudio();
	}
}

/* ===============================
   AUDIO - INPUT (VOCÊ)
=============================== */

// 🔥 NOVO: Inicia apenas monitoramento de volume (sem gravar)
async function startInputVolumeMonitoring() {
	if (APP_CONFIG.MODE_DEBUG) {
		console.log('🎤 Monitoramento de volume entrada (modo teste)...');
		return Promise.resolve();
	}

	if (!UIElements.inputSelect?.value) {
		console.log('⚠️ Nenhum dispositivo input selecionado');
		return Promise.resolve();
	}

	// 🔥 NOVO: Se já tem stream ativa, não faz nada
	if (inputStream && inputAnalyser) {
		console.log('ℹ️ Monitoramento de volume entrada já ativo');
		return Promise.resolve();
	}

	if (!audioContext) {
		audioContext = new AudioContext();
	}

	try {
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
	} catch (error) {
		console.error('❌ Erro ao iniciar monitoramento de volume de entrada:', error);
		inputStream = null;
		inputAnalyser = null;
	}
}

// 🔥 NOVO: Inicia apenas monitoramento de volume para output (sem gravar)
async function startOutputVolumeMonitoring() {
	if (APP_CONFIG.MODE_DEBUG) {
		console.log('🔊 Monitoramento de volume saída (modo teste)...');
		return Promise.resolve();
	}

	if (!UIElements.outputSelect?.value) {
		console.log('⚠️ Nenhum dispositivo output selecionado');
		return Promise.resolve();
	}

	// 🔥 NOVO: Se já tem stream ativa, não faz nada
	if (outputStream && outputAnalyser) {
		console.log('ℹ️ Monitoramento de volume saída já ativo');
		return Promise.resolve();
	}

	if (!audioContext) {
		audioContext = new AudioContext();
	}

			console.log('🔄 Iniciando stream de áudio (output)...');
	try {
		outputStream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: UIElements.outputSelect.value } },
		});

		const source = audioContext.createMediaStreamSource(outputStream);

		outputAnalyser = audioContext.createAnalyser();
		outputAnalyser.fftSize = 256;
		outputData = new Uint8Array(outputAnalyser.frequencyBinCount);
		source.connect(outputAnalyser);

		console.log('✅ Monitoramento de volume de saída iniciado com sucesso');
		updateOutputVolume(); // 🔥 Inicia o loop de atualização
	} catch (error) {
		console.error('❌ Erro ao iniciar monitoramento de volume de saída:', error);
		outputStream = null;
		outputAnalyser = null;
	}
}

/* ===============================
   AUDIO - INPUT (VOCÊ)
=============================== */

async function startInput() {
    if (APP_CONFIG.MODE_DEBUG) {
        const text = 'Iniciando monitoramento de entrada de áudio (modo teste)...';
        addTranscript('Você', text);
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

            // MODO ENTREVISTA – gancho futuro (ainda inativo)
            if (ModeController.allowPartialTranscription()) {
                console.log('🧩 handlePartialInputChunk chamado (input)');
                handlePartialInputChunk(e.data);
            }
        };
        
        inputRecorder.onstop = () => {
            console.log('⏹️ inputRecorder.onstop chamado');

            // marca o momento exato em que a gravação parou
            lastInputStopAt = Date.now();
            console.log('⏱️ input stopped at', new Date(lastInputStopAt).toLocaleTimeString());

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
}

function updateInputVolume() {
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
}

function stopInputMonitor() {
    console.log('🛑 stopInputMonitor: Parando monitoramento de entrada...');
    
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
    
    console.log('✅ stopInputMonitor: Concluído');
    return Promise.resolve();
}

/* ===============================
   AUDIO - OUTPUT (OUTROS) - VIA VOICEMEETER
=============================== */

async function startOutput() {
    if (APP_CONFIG.MODE_DEBUG) {
        const text = 'Iniciando monitoramento de saída de áudio (modo teste)...';
        addTranscript('Outros', text);
        return;
    }

    if (!UIElements.outputSelect?.value) return;

    if (!audioContext) {
        audioContext = new AudioContext();
    }

    // CRÍTICO: Evita recriar recorder E stream se já existem
    if (outputRecorder && outputRecorder.state !== 'inactive') {
        console.log('ℹ️ outputRecorder já existe e está ativo, pulando reconfiguração');
        return;
    }

    // Se já existe stream mas precisa reconfigurar, limpa primeiro
    if (outputStream) {
        console.log('🧹 Limpando stream de saída anterior antes de recriar');
        outputStream.getTracks().forEach(t => t.stop());
        outputStream = null;
    }

    try {
        outputStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: UIElements.outputSelect.value } },
        });

        const source = audioContext.createMediaStreamSource(outputStream);

        outputAnalyser = audioContext.createAnalyser();
        outputAnalyser.fftSize = 256;
        outputData = new Uint8Array(outputAnalyser.frequencyBinCount);
        source.connect(outputAnalyser);

        // recorder SEMPRE existe
        outputRecorder = new MediaRecorder(outputStream, {
            mimeType: 'audio/webm;codecs=opus',
        });

        outputRecorder.ondataavailable = e => {
            console.log('🔥 output.ondataavailable - chunk tamanho:', e.data?.size || e.data?.byteLength || 'n/a');

            outputChunks.push(e.data);

            // MODO ENTREVISTA – gancho futuro para OUTPUT
            if (ModeController.allowPartialTranscription()) {
                console.log('🧩 handlePartialOutputChunk chamado (output)');
                handlePartialOutputChunk(e.data);
            }
        };

        outputRecorder.onstop = () => {
            console.log('⏹️ outputRecorder.onstop chamado');

            // marca o momento exato em que a gravação parou
            lastOutputStopAt = Date.now();
            console.log('⏱️ output stopped at', new Date(lastOutputStopAt).toLocaleTimeString());

            // placeholder para mostrar que estamos aguardando transcrição
            const timeForPlaceholder = lastOutputStartAt || lastOutputStopAt;
            lastOutputPlaceholderEl = addTranscript(OTHER, '...', timeForPlaceholder);
            if (lastOutputPlaceholderEl) {
                lastOutputPlaceholderEl.dataset.stopAt = lastOutputStopAt;
                if (lastOutputStartAt) lastOutputPlaceholderEl.dataset.startAt = lastOutputStartAt;
            }

            transcribeOutput();
        };

        // Inicia loop de volume apenas se não estiver rodando
        if (!outputVolumeAnimationId) {
            updateOutputVolume();
        }
        
        console.log('✅ startOutput: Configurado com sucesso');
    } catch (error) {
        console.error('❌ Erro em startOutput:', error);
        outputStream = null;
        outputRecorder = null;
        throw error;
    }
}

function updateOutputVolume() {
    // CRÍTICO: Verifica se deve continuar ANTES de fazer qualquer processamento
    if (!outputAnalyser || !outputData) {
        console.log('⚠️ updateOutputVolume: analyser ou data não disponível, parando loop');
        if (outputVolumeAnimationId) {
            cancelAnimationFrame(outputVolumeAnimationId);
            outputVolumeAnimationId = null;
        }
        emitUIChange('onOutputVolumeUpdate', { percent: 0 });
        return;
    }

    try {
        outputAnalyser.getByteFrequencyData(outputData);
        const avg = outputData.reduce((a, b) => a + b, 0) / outputData.length;
        const percent = Math.min(100, Math.round((avg / 60) * 100));

        // Emite evento em vez de atualizar DOM diretamente
        emitUIChange('onOutputVolumeUpdate', { percent });

        if (avg > OUTPUT_SPEECH_THRESHOLD && outputRecorder && isRunning) {
            if (!outputSpeaking) {
                outputSpeaking = true;
                outputChunks = [];

                const slice = ModeController.mediaRecorderTimeslice();
                lastOutputStartAt = Date.now();
                console.log(
                    '📊 iniciando gravação de saída (outputRecorder.start) - startAt',
                    new Date(lastOutputStartAt).toLocaleTimeString(),
                );
                slice ? outputRecorder.start(slice) : outputRecorder.start();
            }
            if (outputSilenceTimer) {
                clearTimeout(outputSilenceTimer);
                outputSilenceTimer = null;
            }
        } else if (outputSpeaking && !outputSilenceTimer && outputRecorder) {
            outputSilenceTimer = setTimeout(() => {
                outputSpeaking = false;
                outputSilenceTimer = null;
                console.log('⏹️ parando gravação de saída por silêncio (outputRecorder.stop)');
                if (outputRecorder && outputRecorder.state === 'recording') {
                    outputRecorder.stop();
                }
            }, OUTPUT_SILENCE_TIMEOUT);
        }
    } catch (error) {
        console.error('❌ Erro em updateOutputVolume:', error);
        if (outputVolumeAnimationId) {
            cancelAnimationFrame(outputVolumeAnimationId);
            outputVolumeAnimationId = null;
        }
        emitUIChange('onOutputVolumeUpdate', { percent: 0 });
        return;
    }

    // Continua o loop apenas se tudo estiver OK
    outputVolumeAnimationId = requestAnimationFrame(updateOutputVolume);
}

function stopOutputMonitor() {
    console.log('🛑 stopOutputMonitor: Parando monitoramento de saída...');
    
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
    
    console.log('✅ stopOutputMonitor: Concluído');
    return Promise.resolve();
}

/* ===============================
   MODO ENTREVISTA - GANCHO INPUT
=============================== */

async function handlePartialInputChunk(blobChunk) {
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
			const partialText = (await ipcRenderer.invoke('transcribe-audio-partial', buffer))?.trim();

			if (partialText && !isGarbageSentence(partialText)) {
				addTranscript(YOU, partialText);
				handleSpeech(YOU, partialText);
			}
		} catch (err) {
			console.warn('⚠️ erro na transcrição parcial (INPUT)', err);
		}
	}, 180); // janela curta (reduzida de 250 -> 180)
}

/* ===============================
   MODO ENTREVISTA - GANHO REAL OUTPUT
=============================== */

function handlePartialOutputChunk(blobChunk) {
	if (!ModeController.isInterviewMode()) return;

	// evita blobs pequenos demais (sem header válido)
	if (blobChunk.size < 800) return;

	outputPartialChunks.push(blobChunk);

	if (outputPartialTimer) clearTimeout(outputPartialTimer);

	outputPartialTimer = setTimeout(async () => {
		if (!outputPartialChunks.length) return;

		const blob = new Blob(outputPartialChunks, { type: 'audio/webm' });
		outputPartialChunks = [];

		try {
			const partialText = await transcribeOutputPartial(blob);

			if (partialText && !isGarbageSentence(partialText)) {
				outputPartialText += ' ' + partialText;

				// 🔥 dispara GPT mais cedo
				if (ModeController.isInterviewMode() && isQuestionReady(outputPartialText)) {
					const newText = outputPartialText.trim();

					// evita reprocessar a mesma pergunta
					if (newText === currentQuestion.text) {
						console.log('🔁 ignorando nova transcrição igual à currentQuestion');
						return;
					}

					// marca início real do turno se ainda não marcado
					if (!currentQuestion.text) {
						currentQuestion.createdAt = Date.now();
						interviewTurnId++; // novo turno detectado
					}

					currentQuestion.text = newText;
					currentQuestion.lastUpdate = Date.now();
					currentQuestion.finalized = false;

					selectedQuestionId = CURRENT_QUESTION_ID;
					renderCurrentQuestion();

					// log temporario para testar a aplicação só remover depois
					console.log('🧠 currentQuestion (parcial):', currentQuestion.text);
					console.log('🎯 interviewTurnId:', interviewTurnId);
					console.log('🤖 gptAnsweredTurnId:', gptAnsweredTurnId);
					console.log('🧪 temporizador de auto-fechamento definido; chamará closeCurrentQuestion se necessário');

					// ⏱️ agenda fechamento automático da pergunta
					if (autoCloseQuestionTimer) {
						clearTimeout(autoCloseQuestionTimer);
					}

					autoCloseQuestionTimer = setTimeout(() => {
						console.log('⏱️ Auto close question disparado');

						if (
							ModeController.isInterviewMode() &&
							currentQuestion.text &&
							!currentQuestion.finalized &&
							gptAnsweredTurnId !== interviewTurnId
						) {
							closeCurrentQuestion();
						}
					}, QUESTION_IDLE_TIMEOUT);

					//askGpt(); // GPT streaming
				}
			}
		} catch (err) {
			console.warn('⚠️ erro na transcrição parcial (OUTPUT)', err);
		}
	}, 120); // 🔥 janela menor (reduzida de 180 -> 120)
}

/* ===============================
   MODO ENTREVISTA - STT PARCIAL OUTPUT
=============================== */

async function transcribeOutputPartial(blob) {
	const tBlobToBuffer = Date.now();
	const buffer = Buffer.from(await blob.arrayBuffer());
	console.log('timing (partial): bufferConv', Date.now() - tBlobToBuffer, 'ms, size', buffer.length);

	const tSend = Date.now();
	const partial = (await ipcRenderer.invoke('transcribe-audio-partial', buffer))?.trim();
	console.log('timing (partial): ipc_stt_roundtrip', Date.now() - tSend, 'ms');

	console.log('📝 transcrição parcial de saída ->', partial);
	return partial;
}

/* ===============================
   TRANSCRIÇÃO
=============================== */

async function transcribeInput() {
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
	const text = (await ipcRenderer.invoke('transcribe-audio', buffer))?.trim();
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
}

async function transcribeOutput() {
	if (!outputChunks.length) return;

	const blob = new Blob(outputChunks, { type: 'audio/webm' });
	console.log('🔁 transcrever saída - blob.size:', blob.size); // diagnóstico adicional

	// ignora ruído / respiração
	const minSize = ModeController.isInterviewMode() ? MIN_OUTPUT_AUDIO_SIZE_INTERVIEW : MIN_OUTPUT_AUDIO_SIZE;

	if (blob.size < minSize) return;

	outputChunks = [];

	const tBlobToBuffer = Date.now();
	const buffer = Buffer.from(await blob.arrayBuffer());
	console.log('timing: bufferConv (output)', Date.now() - tBlobToBuffer, 'ms, size', buffer.length);

	const tSend = Date.now();
	const text = (await ipcRenderer.invoke('transcribe-audio', buffer))?.trim();
	console.log('timing: ipc_stt_roundtrip (output)', Date.now() - tSend, 'ms');
	if (!text || isGarbageSentence(text)) return;

	// Se existia um placeholder (timestamp do stop), atualiza esse placeholder com o texto final e latência
	if (lastOutputPlaceholderEl && lastOutputPlaceholderEl.dataset) {
		const stop = lastOutputPlaceholderEl.dataset.stopAt
			? Number(lastOutputPlaceholderEl.dataset.stopAt)
			: lastOutputStopAt;
		const start = lastOutputPlaceholderEl.dataset.startAt
			? Number(lastOutputPlaceholderEl.dataset.startAt)
			: lastOutputStartAt || stop;
		const now = Date.now();
		const recordingDuration = stop - start;
		const latency = now - stop;
		const total = now - start;
		const startStr = new Date(start).toLocaleTimeString();
		const stopStr = new Date(stop).toLocaleTimeString();

		// Emite para config-manager atualizar o placeholder com texto final e métricas
		emitUIChange('onPlaceholderFulfill', {
			speaker: OTHER,
			text,
			stopStr,
			startStr,
			recordingDuration,
			latency,
			total,
		});

		lastOutputPlaceholderEl = null;
		lastOutputStopAt = null;
		lastOutputStartAt = null;
	} else {
		addTranscript(OTHER, text);
	}

	handleSpeech(OTHER, text);

	// Se a transcrição final indicar claramente uma pergunta, fechar e enviar ao GPT imediatamente
	if (ModeController.isInterviewMode() && isQuestionReady(text)) {
		console.log('🔔 transcrição final parece pergunta — fechando e chamando GPT agora');
		// limpa estado parcial e cancela o temporizador automático para evitar duplicatas
		outputPartialText = '';
		if (autoCloseQuestionTimer) {
			clearTimeout(autoCloseQuestionTimer);
			autoCloseQuestionTimer = null;
		}
		closeCurrentQuestion();
	}
}

/* ===============================
   CONSOLIDAÇÃO DE PERGUNTAS
=============================== */

function handleSpeech(author, text) {
	const cleaned = text.replace(/Ê+|hum|ahn/gi, '').trim();
	console.log('🔊 handleSpeech', { author, raw: text, cleaned });
	if (cleaned.length < 3) return;

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

		if (currentQuestion.text && now - currentQuestion.lastUpdate > QUESTION_IDLE_TIMEOUT) {
			closeCurrentQuestion();
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
			interviewTurnId++; // 🔥 novo turno
		}

		// evita duplicação quando a mesma frase parcial/final chega novamente
		if (currentQuestion.text && normalizeForCompare(currentQuestion.text) === normalizeForCompare(cleaned)) {
			console.log('🔁 speech igual ao currentQuestion — ignorando concatenação');
		} else {
			currentQuestion.text += (currentQuestion.text ? ' ' : '') + cleaned;
		}
		currentQuestion.lastUpdate = now;

		// 🟦 CURRENT vira seleção padrão ao receber fala
		if (!selectedQuestionId) {
			selectedQuestionId = CURRENT_QUESTION_ID;
			clearAllSelections();
		}

		renderCurrentQuestion();
	}
}

/* ===============================
   FECHAMENTO DE PERGUNTAS
=============================== */

function closeCurrentQuestion() {
	resetInterviewTurnState();
	console.log('🚪 closeCurrentQuestion called', {
		interviewTurnId,
		gptAnsweredTurnId,
		currentQuestionText: currentQuestion.text,
	});

	// trata perguntas incompletas (reticências ou fragmentos)
	if (isIncompleteQuestion(currentQuestion.text)) {
		console.log('⚠️ pergunta incompleta detectada — promovendo ao histórico como incompleta:', currentQuestion.text);

		const newId = crypto.randomUUID();
		questionsHistory.push({
			id: newId,
			text: currentQuestion.text,
			createdAt: currentQuestion.createdAt || Date.now(),
			incomplete: true,
		});

		// seleciona a pergunta recém-criada para revisão manual
		selectedQuestionId = newId;

		// limpa CURRENT mas preserva seleção lógica
		currentQuestion.text = '';
		currentQuestion.finalized = false;

		renderQuestionsHistory();
		renderCurrentQuestion();
		return;
	}

	if (!looksLikeQuestion(currentQuestion.text)) {
		currentQuestion.text = '';
		currentQuestion.finalized = false;
		renderCurrentQuestion();
		return;
	}

	currentQuestion.text = finalizeQuestion(currentQuestion.text);
	currentQuestion.finalized = true;

	renderCurrentQuestion();
	// 🔥 COMPORTAMENTO POR MODO
	if (ModeController.isInterviewMode()) {
		// MODO ENTREVISTA — chama GPT automaticamente (se ainda não requisitado/respondido)
		if (gptRequestedTurnId !== interviewTurnId && gptAnsweredTurnId !== interviewTurnId) {
			selectedQuestionId = CURRENT_QUESTION_ID;
			console.log('➡️ closeCurrentQuestion chamou askGpt (vou enviar para o GPT)', {
				interviewTurnId,
				gptRequestedTurnId,
				gptAnsweredTurnId,
			});
			askGpt();
		} else {
			console.log('⛔ closeCurrentQuestion pulou askGpt porque já foi requisitado/respondido este turno', {
				interviewTurnId,
				gptRequestedTurnId,
				gptAnsweredTurnId,
			});
		}
	} else {
		// MODO NORMAL — não pergunta automaticamente ao GPT; promove para histórico e libera CURRENT
		console.log('🔵 modo NORMAL — promovendo CURRENT para histórico sem chamar GPT');
		promoteCurrentToHistory(currentQuestion.text);
	}
}

function closeCurrentQuestionForced() {
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
}

function resetInterviewTurnState() {
	outputPartialText = '';
	outputPartialChunks = [];
}

/* ===============================
   VALIDAÇÃO DE API KEY
=============================== */

// 🔥 Verifica o Status da API
async function checkApiKeyStatus() {
	try {
		const status = await ipcRenderer.invoke('GET_OPENAI_API_STATUS');
		console.log('🔑 Status da API key:', status);
		return status;
	} catch (error) {
		console.warn('⚠️ Não foi possível verificar status da API:', error);
		return { initialized: false, hasKey: false };
	}
}

// 🔥 Inicializa o processo principal com a chave já salva no ConfigManager
async function syncApiKeyOnStart() {
	try {
		// 🔥 O main.js já inicializa automaticamente com a chave do secure store
		console.log('🔄 Verificando status do cliente OpenAI...');

		// 🔥 VERIFICAR API KEY ANTES DE CONTINUAR
		const status = await checkApiKeyStatus();

		if (status.initialized) {
			console.log('✅ Cliente OpenAI já inicializado no main process');
		} else {
			updateStatusMessage('❌ API key não configurada. Configure em "API e Modelos" → OpenAI');
			console.log('⚠️ Cliente OpenAI não inicializado - Usuário precisa configurar uma chave');
		}
	} catch (err) {
		console.warn('⚠️ syncApiKeyOnStart falhou:', err);
	}
}

/* ===============================
   GPT
=============================== */
async function askGpt() {
	const text = getSelectedQuestionText();

	if (!text || text.trim().length < 5) {
		updateStatusMessage('⚠️ Pergunta vazia ou incompleta');
		return;
	}

	const isCurrent = selectedQuestionId === CURRENT_QUESTION_ID;
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

	// 🔥 Apenas emite que precisa adicionar novo answer - config-manager cria DOM
	emitUIChange('onAnswerAdd', {
		questionId,
		action: 'new',
		text,
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
		console.log('ℹ️ gptRequestedTurnId definido para turno', gptRequestedTurnId);
		lastSentQuestionText = text.trim();
		console.log('ℹ️ lastSentQuestionText definido:', lastSentQuestionText);
	}

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
		return;
	}

	// 🧠 MODO ENTREVISTA — STREAMING
	if (ModeController.isInterviewMode()) {
		const gptStartAt = ENABLE_INTERVIEW_TIMING_DEBUG ? Date.now() : null;
		let streamedText = '';

		console.log('⏳ enviando para o GPT via stream...');
		ipcRenderer.invoke('ask-gpt-stream', [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: text },
		]).catch(err => {
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
				renderGptAnswer(questionId, finalHtml);
				promoteCurrentToHistory(text);
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
	renderGptAnswer(questionId, res);

	const wasRequestedForThisTurn = gptRequestedTurnId === interviewTurnId;

	console.log(
		'ℹ️ gptRequestedTurnId antes do batch:',
		gptRequestedTurnId,
		'wasRequestedForThisTurn:',
		wasRequestedForThisTurn,
	);
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
}

/* ===============================
   UI (RENDER / SELEÇÃO / SCROLL)
=============================== */

function addTranscript(author, text, time) {
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
			stopAt: null 
		},
		// Permite que código posterior trate como elemento DOM
		classList: {
			add: () => {},
			remove: () => {},
			contains: () => false,
			toggle: () => false,
		}
	};

	return placeholderProxy;
}

function renderCurrentQuestion() {
	if (!currentQuestion.text) {
		emitUIChange('onCurrentQuestionUpdate', { text: '', isSelected: false });
		return;
	}

	let label = currentQuestion.text;

	if (ENABLE_INTERVIEW_TIMING_DEBUG && currentQuestion.createdAt) {
		const time = new Date(currentQuestion.createdAt).toLocaleTimeString();
		label = `⏱️ ${time} — ${label}`;
	}

	// 🔥 Apenas EMITE dados - config-manager aplica ao DOM
	const questionData = {
		text: label,
		isSelected: selectedQuestionId === CURRENT_QUESTION_ID,
		rawText: currentQuestion.text,
		createdAt: currentQuestion.createdAt,
	};

	emitUIChange('onCurrentQuestionUpdate', questionData);
}

function renderQuestionsHistory() {
	// 🔥 Gera dados estruturados - config-manager renderiza no DOM
	const historyData = [...questionsHistory].reverse().map(q => {
		let label = q.text;
		if (ENABLE_INTERVIEW_TIMING_DEBUG && q.createdAt) {
			const time = new Date(q.createdAt).toLocaleTimeString();
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

function renderGptAnswer(questionId, markdownText) {
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
}

function resetInterviewState() {
	currentQuestion = { text: '', lastUpdate: 0, finalized: false };
	questionsHistory = [];
	selectedQuestionId = null;

	// Emit eventos para limpar UI
	emitUIChange('onTranscriptionCleared', {});
	emitUIChange('onAnswersCleared', {});

	clearAllSelections();
	renderQuestionsHistory();
	renderCurrentQuestion();
}

// 🔥 NOVO: Verifica se existe um modelo de IA ativo e retorna o nome do modelo
function hasActiveModel() {
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
	return { active: false, model: null };
}

async function listenToggleBtn() {
	console.log('🔥 DEBUG: listenToggleBtn() chamado!');
	
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
		const errorMsg = 'Selecione um dispositivo de áudio (saída) para ouvir a reunião';
		console.warn(`⚠️ ${errorMsg}`);
		console.log('📡 DEBUG: Emitindo onError:', errorMsg);
		emitUIChange('onError', errorMsg);
		return;
	}

	isRunning = !isRunning;
	const buttonText = isRunning ? 'Stop' : 'Start';
	const statusMsg = isRunning ? 'Status: ouvindo...' : 'Status: parado';

	emitUIChange('onListenButtonToggle', {
		isRunning,
		buttonText,
	});

	updateStatusMessage(statusMsg);
	console.log(`🎤 Listen toggle: ${isRunning ? 'INICIANDO' : 'PARANDO'} (modelo: ${activeModel})`);
	await (isRunning ? startAudio() : stopAudio());
}

function handleQuestionClick(questionId) {
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

	// ❓ Ainda não respondida → chama GPT
	askGpt();
}

function applyOpacity(value) {
	const appOpacity = parseFloat(value);

	// aplica opacidade no conteúdo geral
	document.documentElement.style.setProperty('--app-opacity', appOpacity.toFixed(2));

	// topBar nunca abaixo de 0.75
	const topbarOpacity = Math.max(appOpacity, 0.75);
	document.documentElement.style.setProperty('--app-opacity-75', topbarOpacity.toFixed(2));

	localStorage.setItem('overlayOpacity', appOpacity);

	// logs temporários para debug
	console.log('🎚️ Opacity change | app:', value, '| topBar:', topbarOpacity);
}

// 🔥 Novo: atualizar status sem tocar em DOM
function updateStatusMessage(message) {
	emitUIChange('onStatusUpdate', { message });
}

/* ===============================
   ATALHOS GLOBAIS - MOVED TO CONFIG-MANAGER
=============================== */
// Listeners registrados via config-manager.js

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

// function getMockGptAnswer() {
// 	return `
// ### ✔️ Resposta

// Em Java, a **POO (Programação Orientada a Objetos)** é baseada em **4 pilares**:

// - **Encapsulamento**
// - **Herança**
// - **Polimorfismo**
// - **Abstração**

// ### 💡 Exemplo em Java

// \`\`\`java
// public class Pessoa {
// 	private String nome;

// 	public Pessoa(String nome) {
// 		this.nome = nome;
// 	}

// 	public String getNome() {
// 		return nome;
// 	}
// }
// \`\`\`

// 📌 **Dica:** use encapsulamento para proteger o estado interno da classe.
// `;
// }

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

/* ===============================
   EVENT LISTENERS MOVED TO CONFIG-MANAGER
   darkToggle, opacitySlider, btnClose listeners
=============================== */

/* ===============================
   EVENT LISTENERS MOVED TO CONFIG-MANAGER
   (renderrer.js é agora apenas Services)
=============================== */

/* ===============================
   DRAG AND DROP DA JANELA - MOVED TO CONFIG-MANAGER
=============================== */
// Drag logic agora está em config-manager.js
// Mantém as funções abaixo como utilities públicas:

/* ===============================
   DOMContentLoaded - INITIALIZATION MOVED TO CONFIG-MANAGER
=============================== */
// Controllers now handle DOMContentLoaded initialization
// renderer.js kept only for direct utility calls if needed

/* ===============================
   CLICK-THROUGH - MOVED TO CONFIG-MANAGER
=============================== */

/* ===============================
   GLOBAL ERROR HANDLING - MOVED TO CONFIG-MANAGER
=============================== */

/* ===============================
   PUBLIC API FOR CONFIG-MANAGER
   (Funções que o Controller chama)
=============================== */

// Exporta funções públicas que o controller pode chamar
const RendererAPI = {
	// Áudio - Gravação
	startInput,
	stopInput: stopInputMonitor,
	startOutput,
	stopOutput: stopOutputMonitor,
	restartAudioPipeline,

	// 🔥 NOVO: Áudio - Monitoramento de volume
	startInputVolumeMonitoring,
	startOutputVolumeMonitoring,

	// Entrevista
	listenToggleBtn,
	askGpt,
	resetInterviewState,
	startMockInterview,

	// Modo
	changeMode: (mode) => {
		CURRENT_MODE = mode;
	},
	getMode: () => CURRENT_MODE,

	// Questions
	handleQuestionClick,
	closeCurrentQuestion,

	// UI
	applyOpacity,
	updateMockBadge: (show) => {
		emitUIChange('onMockBadgeUpdate', { visible: show });
	},
	setMockToggle: (checked) => {
		if (UIElements.mockToggle) {
			UIElements.mockToggle.checked = checked;
		}
		APP_CONFIG.MODE_DEBUG = checked;
	},
	setModeSelect: (mode) => {
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

			const startBounds = (await ipcRenderer.invoke('GET_WINDOW_BOUNDS')) || { x: 0, y: 0 };
			const startCursor = { x: event.screenX, y: event.screenY };
			let lastAnimation = 0;

			function onPointerMove(ev) {
				const now = performance.now();
				if (now - lastAnimation < 16) return;
				lastAnimation = now;

				const dx = ev.screenX - startCursor.x;
				const dy = ev.screenY - startCursor.y;

				ipcRenderer.send('MOVE_WINDOW_TO', { x: startBounds.x + dx, y: startBounds.y + dy });
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
	setClickThrough: (enabled) => {
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
	registerUIElements: (elements) => {
		registerUIElements(elements);
	},
	onUIChange: (eventName, callback) => {
		onUIChange(eventName, callback);
	},

	// API Key
	setAppConfig: (config) => {
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
						const msg = e.key === 'ArrowUp' ? '🧪 Ctrl+ArrowUp detectado (teste)' : '🧪 Ctrl+ArrowDown detectado (teste)';
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
	onApiKeyUpdated: (callback) => {
		ipcRenderer.on('API_KEY_UPDATED', callback);
	},
	onToggleAudio: (callback) => {
		ipcRenderer.on('CMD_TOGGLE_AUDIO', callback);
	},
	onAskGpt: (callback) => {
		ipcRenderer.on('CMD_ASK_GPT', callback);
	},
	onGptStreamChunk: (callback) => {
		ipcRenderer.on('GPT_STREAM_CHUNK', callback);
	},
	onGptStreamEnd: (callback) => {
		ipcRenderer.on('GPT_STREAM_END', callback);
	},
	sendRendererError: (error) => {
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
};

if (typeof module !== 'undefined' && module.exports) {
	module.exports = RendererAPI;
}

// 🔥 Expor globalmente para que config-manager possa acessar
if (typeof window !== 'undefined') {
	window.RendererAPI = RendererAPI;
}
