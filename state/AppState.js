/**
 * AppState - Centraliza todo o estado da aplicação
 * Substitui: 15+ variáveis globais soltas no renderer.js
 */
class AppState {
	constructor() {
		this.audio = {
			isRunning: false,
			capturedScreenshots: [],
			isCapturing: false,
			isAnalyzing: false,
		};

		this.window = {
			isDraggingWindow: false,
		};

		this.interview = {
			currentQuestion: {
				text: '',
				lastUpdate: 0,
				finalized: false,
				lastUpdateTime: null,
				createdAt: null,
				finalText: '',
				interimText: '',
			},
			questionsHistory: [],
			answeredQuestions: new Set(),
			selectedQuestionId: null,
			interviewTurnId: 0,
			gptAnsweredTurnId: null,
			gptRequestedTurnId: null,
			gptRequestedQuestionId: null,
			lastAskedQuestionNormalized: null,
		};

		this.metrics = {
			audioStartTime: null,
			gptStartTime: null,
			gptFirstTokenTime: null,
			gptEndTime: null,
			totalTime: null,
			audioSize: 0,
		};
	}

	// ============================================
	// GETTERS / SETTERS PARA COMPATIBILIDADE
	// ============================================
	
	// Audio state getters/setters
	get isRunning() {
		return this.audio.isRunning;
	}

	set isRunning(value) {
		this.audio.isRunning = value;
	}

	get capturedScreenshots() {
		return this.audio.capturedScreenshots;
	}

	set capturedScreenshots(value) {
		this.audio.capturedScreenshots = value;
	}

	get isCapturing() {
		return this.audio.isCapturing;
	}

	set isCapturing(value) {
		this.audio.isCapturing = value;
	}

	get isAnalyzing() {
		return this.audio.isAnalyzing;
	}

	set isAnalyzing(value) {
		this.audio.isAnalyzing = value;
	}

	// Window state getters/setters
	get isDraggingWindow() {
		return this.window.isDraggingWindow;
	}

	set isDraggingWindow(value) {
		this.window.isDraggingWindow = value;
	}

	// Interview state getters/setters
	get currentQuestion() {
		return this.interview.currentQuestion;
	}

	set currentQuestion(value) {
		this.interview.currentQuestion = value;
	}

	get questionsHistory() {
		return this.interview.questionsHistory;
	}

	set questionsHistory(value) {
		this.interview.questionsHistory = value;
	}

	get selectedQuestionId() {
		return this.interview.selectedQuestionId;
	}

	set selectedQuestionId(value) {
		this.interview.selectedQuestionId = value;
	}

	get interviewTurnId() {
		return this.interview.interviewTurnId;
	}

	set interviewTurnId(value) {
		this.interview.interviewTurnId = value;
	}

	get gptAnsweredTurnId() {
		return this.interview.gptAnsweredTurnId;
	}

	set gptAnsweredTurnId(value) {
		this.interview.gptAnsweredTurnId = value;
	}

	get gptRequestedTurnId() {
		return this.interview.gptRequestedTurnId;
	}

	set gptRequestedTurnId(value) {
		this.interview.gptRequestedTurnId = value;
	}

	get gptRequestedQuestionId() {
		return this.interview.gptRequestedQuestionId;
	}

	set gptRequestedQuestionId(value) {
		this.interview.gptRequestedQuestionId = value;
	}

	get lastAskedQuestionNormalized() {
		return this.interview.lastAskedQuestionNormalized;
	}

	set lastAskedQuestionNormalized(value) {
		this.interview.lastAskedQuestionNormalized = value;
	}

	// Metrics getter/setter
	get transcriptionMetrics() {
		return this.metrics;
	}

	set transcriptionMetrics(value) {
		this.metrics = value;
	}

	// ============================================
	// MÉTODOS AUXILIARES
	// ============================================
	
	// Helper para acesso rápido a currentQuestion (usado 72+ vezes)
	get q() {
		return this.interview.currentQuestion;
	}

	// Helper para acesso rápido a questionsHistory (usado 15+ vezes)
	get history() {
		return this.interview.questionsHistory;
	}

	// Helper para acesso rápido a selectedQuestionId (usado 24+ vezes)
	get selectedId() {
		return this.interview.selectedQuestionId;
	}

	set selectedId(value) {
		this.interview.selectedQuestionId = value;
	}

	getCurrentQuestion() {
		return this.interview.currentQuestion;
	}

	resetCurrentQuestion() {
		this.interview.currentQuestion = {
			text: '',
			lastUpdate: 0,
			finalized: false,
			lastUpdateTime: null,
			createdAt: null,
			finalText: '',
			interimText: '',
		};
	}

	addToHistory(question) {
		this.interview.questionsHistory.push(question);
	}

	markAsAnswered(questionId) {
		this.interview.answeredQuestions.add(questionId);
	}

	hasAnswered(questionId) {
		return this.interview.answeredQuestions.has(questionId);
	}

	reset() {
		// Limpar tudo de uma vez
		this.audio = {
			isRunning: false,
			capturedScreenshots: [],
			isCapturing: false,
			isAnalyzing: false,
		};

		this.interview = {
			currentQuestion: {
				text: '',
				lastUpdate: 0,
				finalized: false,
				lastUpdateTime: null,
				createdAt: null,
				finalText: '',
				interimText: '',
			},
			questionsHistory: [],
			answeredQuestions: new Set(),
			selectedQuestionId: null,
			interviewTurnId: 0,
			gptAnsweredTurnId: null,
			gptRequestedTurnId: null,
			gptRequestedQuestionId: null,
			lastAskedQuestionNormalized: null,
		};

		this.metrics = {
			audioStartTime: null,
			gptStartTime: null,
			gptFirstTokenTime: null,
			gptEndTime: null,
			totalTime: null,
			audioSize: 0,
		};
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = AppState;
}
