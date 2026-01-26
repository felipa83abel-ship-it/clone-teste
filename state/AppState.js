/**
 * AppState - Centraliza o estado de toda aplicação
 * Substitui: 15+ variáveis globais soltas no renderer.js
 *
 * @typedef {Object} AudioState
 * @property {boolean} isRunning - Se áudio está sendo capturado
 * @property {Array<Object>} capturedScreenshots - Screenshots capturadas
 * @property {boolean} isCapturing - Se está capturando áudio
 * @property {boolean} isAnalyzing - Se está analisando screenshot
 *
 * @typedef {Object} WindowState
 * @property {boolean} isDraggingWindow - Se está arrastando janela
 *
 * @typedef {Object} CurrentQuestion
 * @property {string} text - Texto da pergunta atual
 * @property {number} lastUpdate - Timestamp da última atualização
 * @property {boolean} finalized - Se pergunta foi finalizada
 * @property {string|null} lastUpdateTime - Última hora de update
 * @property {number|null} createdAt - Timestamp de criação
 * @property {string} finalText - Texto final da pergunta
 * @property {string} interimText - Texto temporário/parcial
 *
 * @typedef {Object} InterviewState
 * @property {CurrentQuestion} currentQuestion - Pergunta atual
 * @property {Array<Object>} questionsHistory - Histórico de perguntas
 * @property {Set<string>} answeredQuestions - Perguntas respondidas
 * @property {string|null} selectedQuestionId - ID da pergunta selecionada
 * @property {number} interviewTurnId - ID do turno da entrevista
 * @property {number|null} llmAnsweredTurnId - Turno da resposta LLM
 * @property {number|null} llmRequestedTurnId - Turno da requisição LLM
 * @property {string|null} llmRequestedQuestionId - ID da pergunta solicitada ao LLM
 * @property {string|null} lastAskedQuestionNormalized - Última pergunta normalizada
 *
 * @typedef {Object} MetricsData
 * @property {number|null} audioStartTime - Hora de início do áudio
 * @property {number|null} llmStartTime - Hora de início do LLM
 * @property {number|null} llmFirstTokenTime - Tempo do primeiro token
 * @property {number|null} llmEndTime - Hora de fim do LLM
 * @property {number|null} totalTime - Tempo total
 * @property {number} audioSize - Tamanho do áudio em bytes
 *
 * @typedef {Object} LLMState
 * @property {string} selectedProvider - Provider LLM selecionado
 */

/**
 * Classe de gerenciamento de estado centralizado da aplicação
 * @class AppState
 */
class AppState {
  constructor() {
    /** @type {AudioState} */
    this.audio = {
      isRunning: false,
      capturedScreenshots: [],
      isCapturing: false,
      isAnalyzing: false,
    };

    this.window = {
      isDraggingWindow: false,
    };

    // 🔥 CRÍTICO: Contador GLOBAL de questões para gerar IDs únicos e sequenciais
    // Nunca reinicia, aumenta a cada nova pergunta consolidada
    this.globalQuestionCounter = 0;

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
      llmAnsweredTurnId: null,
      llmRequestedTurnId: null,
      llmRequestedQuestionId: null,
      lastAskedQuestionNormalized: null,
    };

    this.metrics = {
      audioStartTime: null,
      llmStartTime: null,
      llmFirstTokenTime: null,
      llmEndTime: null,
      totalTime: null,
      audioSize: 0,
    };

    this.llm = {
      selectedProvider: 'openai', // Provider padrão
    };
  }

  // ============================================
  // MÉTODO PARA GERAR ID SEQUENCIAL ÚNICO
  // ============================================

  /**
   * Retorna o próximo ID sequencial global para uma pergunta
   * Garante que IDs nunca se repetem ou reiniciam
   * @returns {string} ID sequencial como string
   */
  getNextQuestionId() {
    this.globalQuestionCounter++;
    return String(this.globalQuestionCounter);
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

  get llmAnsweredTurnId() {
    return this.interview.llmAnsweredTurnId;
  }

  set llmAnsweredTurnId(value) {
    this.interview.llmAnsweredTurnId = value;
  }

  get llmRequestedTurnId() {
    return this.interview.llmRequestedTurnId;
  }

  set llmRequestedTurnId(value) {
    this.interview.llmRequestedTurnId = value;
  }

  get llmRequestedQuestionId() {
    return this.interview.llmRequestedQuestionId;
  }

  set llmRequestedQuestionId(value) {
    this.interview.llmRequestedQuestionId = value;
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

  // LLM state getters/setters
  get selectedProvider() {
    return this.llm.selectedProvider;
  }

  set selectedProvider(value) {
    this.llm.selectedProvider = value;
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

  /**
   * Obtém a pergunta atual
   * @returns {CurrentQuestion} Pergunta atual
   */
  getCurrentQuestion() {
    return this.interview.currentQuestion;
  }

  /**
   * Reseta a pergunta atual para estado vazio
   * @returns {void}
   */
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

  /**
   * Adiciona pergunta ao histórico
   * @param {Object} question - Pergunta a adicionar
   * @returns {void}
   */
  addToHistory(question) {
    this.interview.questionsHistory.push(question);
  }

  /**
   * Marca pergunta como respondida
   * @param {string} questionId - ID da pergunta
   * @returns {void}
   */
  markAsAnswered(questionId) {
    this.interview.answeredQuestions.add(questionId);
  }

  /**
   * Verifica se pergunta foi respondida
   * @param {string} questionId - ID da pergunta
   * @returns {boolean} Se foi respondida
   */
  hasAnswered(questionId) {
    return this.interview.answeredQuestions.has(questionId);
  }

  /**
   * Reseta o estado da aplicação
   * Inclui: audio, interview, history, selectedId, metrics, cache
   * @returns {void}
   */
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
      llmAnsweredTurnId: null,
      llmRequestedTurnId: null,
      llmRequestedQuestionId: null,
      lastAskedQuestionNormalized: null,
    };

    this.metrics = {
      audioStartTime: null,
      llmStartTime: null,
      llmFirstTokenTime: null,
      llmEndTime: null,
      totalTime: null,
      audioSize: 0,
    };

    this.llm = {
      selectedProvider: 'openai',
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppState;
}
