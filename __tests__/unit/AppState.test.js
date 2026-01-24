const AppState = require('../../state/AppState');

describe('AppState', () => {
  let appState;

  beforeEach(() => {
    appState = new AppState();
  });

  describe('Initialization', () => {
    test('should initialize with default audio state', () => {
      expect(appState.audio).toBeDefined();
      expect(appState.audio.isRunning).toBe(false);
      expect(appState.audio.isCapturing).toBe(false);
    });

    test('should initialize with default interview state', () => {
      expect(appState.interview).toBeDefined();
      expect(appState.interview.interviewTurnId).toBe(0);
      expect(appState.interview.currentQuestion).toBeDefined();
    });

    test('should initialize with default metrics', () => {
      expect(appState.metrics).toBeDefined();
      expect(appState.metrics.totalTime).toBeNull();
    });

    test('should have default LLM provider', () => {
      expect(appState.llm.selectedProvider).toBe('openai');
    });
  });

  describe('Audio State Management', () => {
    test('should manage audio running state', () => {
      appState.isRunning = true;
      expect(appState.isRunning).toBe(true);

      appState.isRunning = false;
      expect(appState.isRunning).toBe(false);
    });

    test('should manage captured screenshots', () => {
      const screenshots = ['file1.png', 'file2.png'];
      appState.capturedScreenshots = screenshots;
      expect(appState.capturedScreenshots).toEqual(screenshots);
    });

    test('should track capturing state', () => {
      appState.isCapturing = true;
      expect(appState.isCapturing).toBe(true);
    });

    test('should track analyzing state', () => {
      appState.isAnalyzing = true;
      expect(appState.isAnalyzing).toBe(true);
    });
  });

  describe('Interview State Management', () => {
    test('should manage current question text', () => {
      const questionText = 'What is JavaScript?';
      appState.currentQuestion.text = questionText;
      expect(appState.currentQuestion.text).toBe(questionText);
    });

    test('should manage questions history', () => {
      const question1 = { text: 'Question 1', answer: 'Answer 1' };
      appState.interview.questionsHistory.push(question1);
      expect(appState.interview.questionsHistory).toContain(question1);
    });

    test('should track answered questions', () => {
      const questionId = 'q1';
      appState.interview.answeredQuestions.add(questionId);
      expect(appState.interview.answeredQuestions.has(questionId)).toBe(true);
    });

    test('should increment interview turn ID', () => {
      const initialTurnId = appState.interview.interviewTurnId;
      appState.interview.interviewTurnId++;
      expect(appState.interview.interviewTurnId).toBe(initialTurnId + 1);
    });
  });

  describe('Window State Management', () => {
    test('should manage window dragging state', () => {
      appState.isDraggingWindow = true;
      expect(appState.isDraggingWindow).toBe(true);

      appState.isDraggingWindow = false;
      expect(appState.isDraggingWindow).toBe(false);
    });
  });

  describe('LLM Provider Management', () => {
    test('should manage selected LLM provider', () => {
      appState.llm.selectedProvider = 'gemini';
      expect(appState.llm.selectedProvider).toBe('gemini');

      appState.llm.selectedProvider = 'openai';
      expect(appState.llm.selectedProvider).toBe('openai');
    });
  });

  describe('Metrics Management', () => {
    test('should initialize metrics as null/empty', () => {
      expect(appState.metrics.audioStartTime).toBeNull();
      expect(appState.metrics.llmStartTime).toBeNull();
      expect(appState.metrics.totalTime).toBeNull();
    });

    test('should set and track metrics', () => {
      const now = Date.now();
      appState.metrics.audioStartTime = now;
      appState.metrics.audioSize = 1024;

      expect(appState.metrics.audioStartTime).toBe(now);
      expect(appState.metrics.audioSize).toBe(1024);
    });
  });
});
