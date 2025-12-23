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
   ELEMENTOS UI
=============================== */

const inputSelect = document.getElementById('audio-input-device');
const outputSelect = document.getElementById('audio-output-device');
const listenBtn = document.getElementById('listenBtn');
const statusText = document.getElementById('status');
const transcriptionBox = document.getElementById('conversation');
const currentQuestionBox = document.getElementById('currentQuestion');
const currentQuestionTextBox = document.getElementById('currentQuestionText');
const questionsHistoryBox = document.getElementById('questionsHistory');
const answersHistoryBox = document.getElementById('answersHistory');
const askBtn = document.getElementById('askGptBtn');
const inputVu = document.getElementById('micVu');
const outVu = document.getElementById('outVu');
const mockToggle = document.getElementById('mockToggle');
const mockBadge = document.getElementById('mockBadge');
const interviewModeSelect = document.getElementById('interviewModeSelect');
const btnClose = document.getElementById('btnClose');
const btnToggleClick = document.getElementById('btnToggleClick');
const interactiveZones = document.querySelectorAll('.interactive-zone');
const dragHandle = document.getElementById('dragHandle');
const darkToggle = document.getElementById('darkModeToggle');
const opacitySlider = document.getElementById('opacityRange');

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
	return answersHistoryBox.querySelector(`.answer-block[data-question-id="${questionId}"]`);
}

function promoteCurrentToHistory(text, wrapper) {
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

		// Se recebemos um wrapper (resposta em construção), associa-o ao item
		// existente do histórico para evitar que cliques futuros reenviem o mesmo
		try {
			if (wrapper && wrapper.dataset) {
				wrapper.dataset.questionId = last.id;
				// se já existe uma resposta antiga vinculada a esse questionId, remove-a
				const existingAnswer = findAnswerByQuestionId(last.id);
				if (existingAnswer && existingAnswer !== wrapper) {
					existingAnswer.remove();
				}
			}
		} catch (err) {
			console.warn('⚠️ falha ao associar wrapper ao histórico (skip promotion)', err);
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

	wrapper.dataset.questionId = newId;

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
	if (!inputSelect.value && !outputSelect.value) {
		statusText.innerText = 'Status: selecione um dispositivo';
		return;
	}

	audioContext = new AudioContext();

	if (inputSelect.value) await startInput();
	if (outputSelect.value) await startOutput();
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
	if (inputSelect.value || outputSelect.value) {
		await startAudio();
	}
}

/* ===============================
   AUDIO - INPUT (VOCÊ)
=============================== */

async function startInput() {
	if (APP_CONFIG.MODE_DEBUG) {
		const text = 'Iniciando monitoramento de entrada de áudio (modo teste)...';
		addTranscript(YOU, text);
		return;
	}

	if (!inputSelect.value) return;

	if (!audioContext) {
		audioContext = new AudioContext();
	}

	// evita recriar stream
	if (inputStream) return;

	inputStream = await navigator.mediaDevices.getUserMedia({
		audio: { deviceId: { exact: inputSelect.value } },
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
		console.log('📥 input.ondataavailable - chunk tamanho:', e.data?.size || e.data?.byteLength || 'n/a');

		inputChunks.push(e.data);

		// 🚀 MODO ENTREVISTA — gancho futuro (ainda inativo)
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

	updateInputVolume();
}

function updateInputVolume() {
	if (!inputAnalyser) return;

	inputAnalyser.getByteFrequencyData(inputData);
	const avg = inputData.reduce((a, b) => a + b, 0) / inputData.length;
	const percent = Math.min(100, Math.round((avg / 80) * 100));
	inputVu.style.width = percent + '%';

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
			inputSilenceTimer = null; // 👈 MUITO IMPORTANTE
			console.log('⏹️ parando gravação de entrada por silêncio (inputRecorder.stop)');
			inputRecorder.stop();
		}, INPUT_SILENCE_TIMEOUT);
	}

	requestAnimationFrame(updateInputVolume);
}

function stopInputMonitor() {
	if (inputStream) {
		inputStream.getTracks().forEach(t => t.stop());
		inputStream = null;
	}

	inputAnalyser = null;
	inputData = null;
	inputVu.style.width = '0%';
}

/* ===============================
   AUDIO - OUTPUT (OUTROS) - VIA VOICEMEETER
=============================== */

async function startOutput() {
	if (APP_CONFIG.MODE_DEBUG) {
		const text = 'Iniciando monitoramento de saída de áudio (modo teste)...';
		addTranscript(OTHER, text);
		return;
	}

	if (!outputSelect.value) return;

	if (!audioContext) {
		audioContext = new AudioContext();
	}

	// evita recriar stream
	if (outputStream) return;

	outputStream = await navigator.mediaDevices.getUserMedia({
		audio: { deviceId: { exact: outputSelect.value } },
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
		console.log('📥 output.ondataavailable - chunk tamanho:', e.data?.size || e.data?.byteLength || 'n/a');

		outputChunks.push(e.data);

		// 🚀 MODO ENTREVISTA — gancho futuro para OUTPUT
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

	updateOutputVolume();
}

function updateOutputVolume() {
	if (!outputAnalyser) return;

	outputAnalyser.getByteFrequencyData(outputData);
	const avg = outputData.reduce((a, b) => a + b, 0) / outputData.length;
	const percent = Math.min(100, Math.round((avg / 60) * 100));
	outVu.style.width = percent + '%';

	if (avg > OUTPUT_SPEECH_THRESHOLD && outputRecorder && isRunning) {
		if (!outputSpeaking) {
			outputSpeaking = true;
			outputChunks = [];

			const slice = ModeController.mediaRecorderTimeslice();
			lastOutputStartAt = Date.now();
			console.log(
				'🔊 iniciando gravação de saída (outputRecorder.start) - startAt',
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
			outputSilenceTimer = null; // 👈 MUITO IMPORTANTE
			console.log('⏹️ parando gravação de saída por silêncio (outputRecorder.stop)');
			outputRecorder.stop();
		}, OUTPUT_SILENCE_TIMEOUT);
	}

	requestAnimationFrame(updateOutputVolume);
}

function stopOutputMonitor() {
	if (outputStream) {
		outputStream.getTracks().forEach(t => t.stop());
		outputStream = null;
	}

	outputAnalyser = null;
	outputData = null;
	outVu.style.width = '0%';
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

	// Se existia um placeholder (timestamp do stop), atualiza esse placeholder com o texto final e latência
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

		// linha principal: usa o horário do stop como carimbo final
		lastInputPlaceholderEl.innerHTML = `<span style="color:#888">[${stopStr}]</span> <strong>${YOU}:</strong> ${text}`;

		// linha secundária (metadados) discreta com start-stop e métricas
		const meta = document.createElement('div');
		meta.style.fontSize = '0.8em';
		meta.style.color = '#888';
		meta.style.marginTop = '2px';
		meta.style.marginBottom = '2px';
		meta.innerText = `[${startStr} - ${stopStr}] (grav ${recordingDuration}ms, lat ${latency}ms, total ${total}ms)`;
		lastInputPlaceholderEl.appendChild(meta);

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

		// linha principal: usa o horário do stop como carimbo final
		lastOutputPlaceholderEl.innerHTML = `<span style="color:#888">[${stopStr}]</span> <strong>${OTHER}:</strong> ${text}`;

		// linha secundária (metadados) discreta com start-stop e métricas
		const metaOut = document.createElement('div');
		metaOut.style.fontSize = '0.8em';
		metaOut.style.color = '#888';
		metaOut.style.marginTop = '2px';
		metaOut.style.marginBottom = '2px';
		metaOut.innerText = `[${startStr} - ${stopStr}] (grav ${recordingDuration}ms, lat ${latency}ms, total ${total}ms)`;
		lastOutputPlaceholderEl.appendChild(metaOut);

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
			promoteCurrentToHistory(currentQuestion.text, document.createElement('div'));
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
		promoteCurrentToHistory(currentQuestion.text, document.createElement('div'));
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
			statusText.innerText = '❌ API key não configurada. Configure em "API e Modelos" → OpenAI';
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
		statusText.innerText = '⚠️ Pergunta vazia ou incompleta';
		return;
	}

	const isCurrent = selectedQuestionId === CURRENT_QUESTION_ID;
	const questionId = isCurrent ? CURRENT_QUESTION_ID : selectedQuestionId;

	// 🛡️ MODO ENTREVISTA — bloqueia duplicação APENAS para histórico
	if (ModeController.isInterviewMode() && !isCurrent) {
		const existingAnswer = findAnswerByQuestionId(questionId);
		if (existingAnswer) {
			answersHistoryBox.querySelectorAll('.answer-block.active').forEach(el => el.classList.remove('active'));
			existingAnswer.classList.add('active');
			existingAnswer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			statusText.innerText = '📌 Essa pergunta já foi respondida';
			return;
		}
	}

	// limpa destaque
	answersHistoryBox.querySelectorAll('.answer-block.active').forEach(el => el.classList.remove('active'));

	const wrapper = document.createElement('div');
	wrapper.className = 'answer-block';
	wrapper.dataset.questionId = questionId;
	wrapper.innerHTML = `
		<div class="answer-question">
			❓ ${text}
		</div>
		<div class="answer-content">
			🤖 Respondendo...
		</div>
	`;

	wrapper.classList.add('active');
	answersHistoryBox.appendChild(wrapper);
	wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

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
		statusText.innerText = '🧪 Pergunta enviada ao GPT (modo teste)';

		const mock = getMockGptAnswer(text);
		renderGptAnswer(wrapper, mock);

		if (isCurrent && gptRequestedTurnId === interviewTurnId) {
			promoteCurrentToHistory(text, wrapper);
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

		const answerContent = wrapper.querySelector('.answer-content');

		console.log('⏳ enviando para o GPT via stream...');
		ipcRenderer.invoke('ask-gpt-stream', [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: text },
		]);

		const onChunk = (_, token) => {
			streamedText += token;
			answerContent.innerText = streamedText;
			console.log('🟢 GPT_STREAM_CHUNK recebido (token parcial)', token);
		};

		const onEnd = () => {
			console.log('✅ GPT_STREAM_END recebido (stream finalizado)');
			ipcRenderer.removeListener('GPT_STREAM_CHUNK', onChunk);
			ipcRenderer.removeListener('GPT_STREAM_END', onEnd);

			if (ENABLE_INTERVIEW_TIMING_DEBUG && gptStartAt) {
				const endAt = Date.now();
				const elapsed = endAt - gptStartAt;

				const startTime = new Date(gptStartAt).toLocaleTimeString();
				const endTime = new Date(endAt).toLocaleTimeString();

				answerContent.innerText +=
					`\n\n⏱️ GPT iniciou: ${startTime}` + `\n⏱️ GPT finalizou: ${endTime}` + `\n⏱️ Resposta em ${elapsed}ms`;
			}

			// garante que o turno foi realmente fechado
			const wasRequestedForThisTurn = gptRequestedTurnId === interviewTurnId;

			gptAnsweredTurnId = interviewTurnId;
			gptRequestedTurnId = null;

			// 🔒 FECHAMENTO ATÔMICO DO CICLO
			if (isCurrent && wasRequestedForThisTurn) {
				promoteCurrentToHistory(text, wrapper);
				resetInterviewTurnState();
			} else {
				resetInterviewTurnState();
			}

			// marca a pergunta como respondida no histórico (streaming path)
			try {
				const qid = wrapper?.dataset?.questionId;
				if (qid && qid !== CURRENT_QUESTION_ID) {
					const q = questionsHistory.find(x => x.id === qid);
					if (q) {
						q.answered = true;
						renderQuestionsHistory();
					}
				}
			} catch (err) {
				console.warn('⚠️ falha ao marcar pergunta como respondida (stream):', err);
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
	renderGptAnswer(wrapper, res);

	const wasRequestedForThisTurn = gptRequestedTurnId === interviewTurnId;

	console.log(
		'ℹ️ gptRequestedTurnId antes do batch:',
		gptRequestedTurnId,
		'wasRequestedForThisTurn:',
		wasRequestedForThisTurn,
	);

	if (isCurrent && wasRequestedForThisTurn) {
		promoteCurrentToHistory(text, wrapper);
		// após promover para o histórico, marca a pergunta como respondida
		try {
			const qid = wrapper.dataset.questionId;
			if (qid && qid !== CURRENT_QUESTION_ID) {
				const q = questionsHistory.find(x => x.id === qid);
				if (q) {
					q.answered = true;
					renderQuestionsHistory();
				}
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

	const div = document.createElement('div');
	div.innerHTML = `<span style="color:#888">[${timeStr}]</span> <strong>${author}:</strong> ${text}`;
	transcriptionBox.appendChild(div);

	// 🔥 garante scroll após render
	requestAnimationFrame(() => {
		const container = transcriptionBox.parentElement;
		container.scrollTop = container.scrollHeight;
	});

	return div;
}

function renderCurrentQuestion() {
	if (!currentQuestion.text) {
		currentQuestionTextBox.innerText = '';
		return;
	}

	let label = currentQuestion.text;

	if (ENABLE_INTERVIEW_TIMING_DEBUG && currentQuestion.createdAt) {
		const time = new Date(currentQuestion.createdAt).toLocaleTimeString();
		label = `⏱️ ${time} — ${label}`;
	}

	currentQuestionTextBox.innerText = label;

	currentQuestionBox.classList.toggle('selected-question', selectedQuestionId === CURRENT_QUESTION_ID);
	currentQuestionBox.onclick = () => {
		handleQuestionClick(CURRENT_QUESTION_ID);
	};
}

function renderQuestionsHistory() {
	questionsHistoryBox.innerHTML = '';

	[...questionsHistory].reverse().forEach(q => {
		const d = document.createElement('div');
		d.className = 'question-block';

		let label = q.text;
		if (ENABLE_INTERVIEW_TIMING_DEBUG && q.createdAt) {
			const time = new Date(q.createdAt).toLocaleTimeString();
			label = `⏱️ ${time} — ${label}`;
		}

		// marca visual para perguntas incompletas
		if (q.incomplete) {
			d.innerText = label + ' (incompleta)';
		} else {
			d.innerText = label;
		}

		// aplica classe visual para perguntas já respondidas
		if (q.answered) {
			d.classList.add('answered');
		}
		d.dataset.qid = q.id;
		d.addEventListener('click', () => {
			handleQuestionClick(q.id);
		});

		if (q.id === selectedQuestionId) {
			d.classList.add('selected-question');
		}

		questionsHistoryBox.appendChild(d);
	});

	scrollToSelectedQuestion();
}

function clearAllSelections() {
	// limpa seleção do CURRENT
	currentQuestionBox.classList.remove('selected-question');

	// limpa seleção do histórico
	questionsHistoryBox.querySelectorAll('.selected-question').forEach(el => el.classList.remove('selected-question'));
}

function scrollToSelectedQuestion() {
	const el = questionsHistoryBox.querySelector(`.question-block[data-qid="${selectedQuestionId}"]`);

	if (!el) return;

	el.scrollIntoView({
		behavior: 'smooth',
		block: 'nearest',
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

function renderGptAnswer(container, markdownText) {
	// tenta encurtar a resposta para 1-2 sentenças, preservando blocos de código
	const short = shortenAnswer(markdownText, 2);
	const html = marked.parse(short);
	const questionBlock = container.querySelector('.answer-question');

	container.innerHTML = `
		${questionBlock.outerHTML}
		<div class="gpt-answer">
			${html}
		</div>
	`;

	// 👇 garante foco na resposta final
	container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

	// marca a pergunta como respondida no histórico (se vinculada)
	try {
		const qid = container.dataset.questionId;
		if (qid && qid !== CURRENT_QUESTION_ID) {
			const q = questionsHistory.find(x => x.id === qid);
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

	transcriptionBox.innerHTML = '';
	answersHistoryBox.innerHTML = '';

	clearAllSelections();
	renderQuestionsHistory();
	renderCurrentQuestion();
}

async function listenToggleBtn() {
	if (!isRunning && !inputSelect.value && !outputSelect.value) {
		statusText.innerText = 'Status: selecione ao menos um dispositivo';
		return;
	}

	isRunning = !isRunning;
	listenBtn.innerText = isRunning ? 'Stop' : 'Start';
	statusText.innerText = isRunning ? 'Status: ouvindo...' : 'Status: parado';
	isRunning ? startAudio() : stopAudio();
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
			answersHistoryBox.querySelectorAll('.answer-block.active').forEach(el => el.classList.remove('active'));

			existingAnswer.classList.add('active');
			existingAnswer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

			statusText.innerText = '📌 Essa pergunta já foi respondida';
			return;
		}
	}

	// Se for uma pergunta do histórico marcada como incompleta, não enviar automaticamente ao GPT
	if (questionId !== CURRENT_QUESTION_ID) {
		const q = questionsHistory.find(q => q.id === questionId);
		if (q && q.incomplete) {
			statusText.innerText = '⚠️ Pergunta incompleta — pressione o botão de responder para enviar ao GPT';
			console.log('ℹ️ pergunta incompleta selecionada — aguarda envio manual:', q.text);
			return;
		}
	}

	if (
		ModeController.isInterviewMode() &&
		selectedQuestionId === CURRENT_QUESTION_ID &&
		gptAnsweredTurnId === interviewTurnId
	) {
		statusText.innerText = '⛔ GPT já respondeu esse turno';
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

/* ===============================
   ATALHOS
=============================== */

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
				statusText.innerText =
					e.key === 'ArrowUp' ? '🧪 Ctrl+ArrowUp detectado (teste)' : '🧪 Ctrl+ArrowDown detectado (teste)';
				console.log('📌 Atalho Selecionou:', selectedQuestionId);
				return;
			}
		}
	},
	true, // 👈 MUITO IMPORTANTE (capture phase)
);

/* ===============================
   MOCK / DEBUG
=============================== */

function startMockInterview() {
	if (mockInterviewRunning) return;
	mockInterviewRunning = true;

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

if (darkToggle) {
	darkToggle.addEventListener('change', () => {
		const isDark = darkToggle.checked;

		document.body.classList.toggle('dark', isDark);
		localStorage.setItem('theme', isDark ? 'dark' : 'light');

		console.log('🌙 Dark mode:', isDark);
	});
}

opacitySlider.addEventListener('input', e => {
	applyOpacity(e.target.value);
});

if (btnClose) {
	btnClose.addEventListener('click', () => {
		console.log('❌ Botão Fechar clicado (top bar)');
		ipcRenderer.send('APP_CLOSE');
	});
}

inputSelect.addEventListener('change', async () => {
	window.configManager.saveDevices(); // ← Chama função do config-manager
	stopInputMonitor();
	if (!inputSelect.value) return;
	await startInput();
});

outputSelect.addEventListener('change', async () => {
	window.configManager.saveDevices(); // ← Chama função do config-manager
	stopOutputMonitor();
	if (!outputSelect.value) return;
	await startOutput();
});

mockToggle.addEventListener('change', async () => {
	APP_CONFIG.MODE_DEBUG = mockToggle.checked;

	if (APP_CONFIG.MODE_DEBUG) {
		mockBadge.classList.remove('hidden');
		resetInterviewState(); // 👈 LIMPA TUDO
		mockInterviewRunning = false;
		statusText.innerText = '🧪 Mock de entrevista ATIVO';
		startMockInterview();
	} else {
		mockBadge.classList.add('hidden');
		statusText.innerText = 'Mock desativado';
		resetInterviewState(); // 👈 OPCIONAL (ver abaixo)

		// 🔥 REINICIA PIPELINE DE ÁUDIO
		await restartAudioPipeline();
	}
});

if (interviewModeSelect) {
	interviewModeSelect.addEventListener('change', () => {
		CURRENT_MODE = interviewModeSelect.value === MODES.INTERVIEW ? MODES.INTERVIEW : MODES.NORMAL;
		try {
			localStorage.setItem('appMode', CURRENT_MODE);
		} catch (err) {
			console.warn('⚠️ não foi possível salvar modo:', err);
		}
		console.log('🎯 Modo atual:', CURRENT_MODE);
		resetInterviewRuntimeState();
		// Se estamos entrando em modo ENTREVISTA, garante que qualquer CURRENT existente
		// seja preservado no histórico (evita perder pergunta ao alternar de NORMAL -> INTERVIEW)
		if (CURRENT_MODE === MODES.INTERVIEW && currentQuestion.text) {
			console.log(
				'🔀 Mudança para INTERVIEW: promovendo CURRENT existente para histórico antes de iniciar entrevistas',
			);
			promoteCurrentToHistory(currentQuestion.text, document.createElement('div'));
		}
	});
}

listenBtn.addEventListener('click', listenToggleBtn);
askBtn.addEventListener('click', askGpt);

// 🔥 Event listener para atualizar status quando API key for salva
ipcRenderer.on('API_KEY_UPDATED', (_, success) => {
	if (success) {
		console.log('✅ API key atualizada com sucesso no main process');
		statusText.innerText = '✅ API key configurada com sucesso';

		// Resetar status após alguns segundos
		setTimeout(() => {
			if (statusText.innerText.includes('API key configurada')) {
				statusText.innerText = isRunning ? 'Status: ouvindo...' : 'Status: parado';
			}
		}, 3000);
	} else {
		console.error('❌ Falha ao atualizar API key no main process');
		statusText.innerText = '❌ Erro ao configurar API key';
	}
});

ipcRenderer.on('CMD_TOGGLE_AUDIO', listenToggleBtn);
ipcRenderer.on('CMD_ASK_GPT', askGpt);

/* ===============================
   DRAG AND DROP DA JANELA
=============================== */
if (dragHandle) {
	// Use pointer events to better catch drag start across platforms.
	dragHandle.addEventListener('pointerdown', async event => {
		console.log('🪟 Drag iniciado (pointerdown)');

		isDraggingWindow = true;
		dragHandle.classList.add('drag-active');

		// tenta capturar o pointer para garantir eventos mesmo fora do elemento
		const _pid = event.pointerId;
		try {
			dragHandle.setPointerCapture && dragHandle.setPointerCapture(_pid);
		} catch (err) {
			console.warn('setPointerCapture falhou:', err);
		}

		// tenta iniciar arraste nativo (macOS). Se não funcionar usaremos um
		// fallback que move a janela por IPC conforme o ponteiro.
		setTimeout(() => ipcRenderer.send('START_WINDOW_DRAG'), 40);

		// Captura estado inicial para o fallback de movimentação
		const startBounds = (await ipcRenderer.invoke('GET_WINDOW_BOUNDS')) || { x: 0, y: 0 };
		const startCursor = { x: event.screenX, y: event.screenY };

		let lastAnimation = 0;

		function onPointerMove(ev) {
			// throttle via rAF/tempo
			const now = performance.now();
			if (now - lastAnimation < 16) return;
			lastAnimation = now;

			const dx = ev.screenX - startCursor.x;
			const dy = ev.screenY - startCursor.y;

			const nextX = startBounds.x + dx;
			const nextY = startBounds.y + dy;

			ipcRenderer.send('MOVE_WINDOW_TO', { x: nextX, y: nextY });
		}

		function onPointerUp(ev) {
			// remove listeners do próprio elemento
			try {
				dragHandle.removeEventListener('pointermove', onPointerMove);
				dragHandle.removeEventListener('pointerup', onPointerUp);
			} catch (err) {}

			if (dragHandle.classList.contains('drag-active')) {
				dragHandle.classList.remove('drag-active');
			}

			// tenta liberar pointer capture
			try {
				dragHandle.releasePointerCapture && dragHandle.releasePointerCapture(_pid);
			} catch (err) {}

			isDraggingWindow = false;
		}

		dragHandle.addEventListener('pointermove', onPointerMove);
		dragHandle.addEventListener('pointerup', onPointerUp, { once: true });

		// impede o evento de propagar para aplicações abaixo enquanto tratamos o drag
		event.stopPropagation();
	});

	// pointerup captura fim do arraste/touch
	document.addEventListener('pointerup', () => {
		if (!dragHandle.classList.contains('drag-active')) return;

		console.log('🪟 Drag finalizado (pointerup)');
		dragHandle.classList.remove('drag-active');
		isDraggingWindow = false;
	});

	// Caso o usuário mova o cursor para fora enquanto pressiona (drag cancel)
	dragHandle.addEventListener('pointercancel', () => {
		if (dragHandle.classList.contains('drag-active')) {
			dragHandle.classList.remove('drag-active');
			isDraggingWindow = false;
		}
	});
}

/* ===============================
   DOMContentLoaded
=============================== */
window.addEventListener('DOMContentLoaded', async () => {
	APP_CONFIG = await ipcRenderer.invoke('GET_APP_CONFIG');

	mockToggle.checked = APP_CONFIG.MODE_DEBUG;

	if (APP_CONFIG.MODE_DEBUG) {
		mockBadge.classList.remove('hidden');
	}

	if (APP_CONFIG.MODE_DEBUG) {
		statusText.innerText = '🧪 Mock de entrevista ATIVO';
		startMockInterview();
	}

	// restaura tema salvo (LIGHT | DARK)
	try {
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme === 'dark') {
			document.body.classList.add('dark');
			if (darkToggle) darkToggle.checked = true;
		}
	} catch (err) {
		console.warn('⚠️ não foi possível restaurar tema:', err);
	}

	// restaura Opacidade salva
	try {
		const savedOpacity = localStorage.getItem('overlayOpacity');
		if (savedOpacity) {
			opacitySlider.value = savedOpacity;
			applyOpacity(savedOpacity);
		} else {
			// ✅ Se não houver valor salvo, aplica o valor DEFAULT do slider
			applyOpacity(opacitySlider.value || 0.75);
		}
	} catch (err) {
		console.warn('⚠️ não foi possível restaurar tema:', err);
		applyOpacity(opacitySlider.value || 0.75);
	}

	// restaura modo salvo (NORMAL | INTERVIEW)
	try {
		const savedMode = localStorage.getItem('appMode') || MODES.NORMAL;
		CURRENT_MODE = savedMode === MODES.INTERVIEW ? MODES.INTERVIEW : MODES.NORMAL;
		if (interviewModeSelect) interviewModeSelect.value = CURRENT_MODE;
		console.log('🔁 modo restaurado:', CURRENT_MODE);
	} catch (err) {
		console.warn('⚠️ não foi possível restaurar modo:', err);
	}

	// ✅ Solicita permissão de áudio
	await navigator.mediaDevices.getUserMedia({ audio: true });

	// ✅ Config-manager carrega e restaura dispositivos
	await window.configManager.loadDevices();
	window.configManager.restoreDevices();

	// ✅ Inicia monitoramento se dispositivos estão selecionados
	if (inputSelect.value) {
		stopInputMonitor();
		startInput();
	}

	if (outputSelect.value) {
		stopOutputMonitor();
		startOutput();
	}

	syncApiKeyOnStart();

	// 🔥 CLICK-THROUGH: Inicializa estado e listeners
	await initClickThrough();
});

// *******************************************************
// 🔥 CLICK-THROUGH: Função de inicialização
async function initClickThrough() {
	const btnToggle = document.getElementById('btnToggleClick');
	if (!btnToggle) {
		console.warn('⚠️ btnToggleClick não encontrado');
		return;
	}

	// Recupera estado salvo ou usa padrão (desativado)
	let enabled = false;
	try {
		const saved = localStorage.getItem('clickThroughEnabled');
		enabled = saved === 'true';
	} catch (err) {
		console.warn('⚠️ Erro ao recuperar estado do click-through:', err);
	}

	// Aplica estado inicial
	await setClickThrough(enabled);
	updateClickThroughButton(enabled);

	// Listener do botão
	btnToggle.addEventListener('click', async () => {
		enabled = !enabled;
		await setClickThrough(enabled);
		updateClickThroughButton(enabled);
		localStorage.setItem('clickThroughEnabled', enabled.toString());
		console.log('🖱️ Click-through alternado:', enabled);
	});

	// 🔥 Detecta entrada/saída de zonas interativas
	document.querySelectorAll('.interactive-zone').forEach(el => {
		el.addEventListener('mouseenter', () => {
			ipcRenderer.send('SET_INTERACTIVE_ZONE', true);
		});
		el.addEventListener('mouseleave', () => {
			ipcRenderer.send('SET_INTERACTIVE_ZONE', false);
		});
	});
}

// 🔥 CLICK-THROUGH: Ativa/desativa no main process
async function setClickThrough(enabled) {
	ipcRenderer.send('SET_CLICK_THROUGH', enabled);
}

// 🔥 CLICK-THROUGH: Atualiza visual do botão
function updateClickThroughButton(enabled) {
	const btnToggle = document.getElementById('btnToggleClick');
	if (!btnToggle) return;

	btnToggle.style.opacity = enabled ? '0.5' : '1';
	btnToggle.title = enabled
		? 'Click-through ATIVO (clique para desativar)'
		: 'Click-through INATIVO (clique para ativar)';

	console.log('🎨 Botão atualizado - opacity:', btnToggle.style.opacity);
}

// *******************************************************

// captura erros globais e envia ao main para facilitar debugging
window.addEventListener('error', e => {
	try {
		console.error('RENDERER ERROR', e.error || e.message || e);
		ipcRenderer.send('RENDERER_ERROR', { message: String(e.message || e), stack: e.error?.stack || null });
	} catch (err) {
		console.error('Falha ao enviar RENDERER_ERROR', err);
	}
});
window.addEventListener('unhandledrejection', e => {
	try {
		console.error('UNHANDLED REJECTION', e.reason);
		ipcRenderer.send('RENDERER_ERROR', { message: String(e.reason), stack: e.reason?.stack || null });
	} catch (err) {}
});
