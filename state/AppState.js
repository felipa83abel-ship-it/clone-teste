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

	// Getters para compatibilidade
	get isRunning() {
		return this.audio.isRunning;
	}

	set isRunning(value) {
		this.audio.isRunning = value;
	}

	// Helpers comuns
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
