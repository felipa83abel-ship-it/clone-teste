const EventBus = require('../../events/EventBus');
const AppState = require('../../state/AppState');
const {
  ModeManager,
  MODES,
  InterviewModeHandlers,
  NormalModeHandlers,
} = require('../../controllers/modes/mode-manager');

describe('Integration Tests - Core Systems', () => {
  let eventBus;
  let appState;
  let modeManager;

  beforeEach(() => {
    eventBus = new EventBus();
    appState = new AppState();
    modeManager = new ModeManager(MODES.INTERVIEW);
    modeManager.registerMode(MODES.INTERVIEW, InterviewModeHandlers);
    modeManager.registerMode(MODES.NORMAL, NormalModeHandlers);
  });

  describe('EventBus Functionality', () => {
    test('should handle event emission and subscription', () => {
      const callback = jest.fn();
      eventBus.on('test-event', callback);
      eventBus.emit('test-event', 'data');

      expect(callback).toHaveBeenCalledWith('data');
    });

    test('should support multiple listeners on same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventBus.on('event', callback1);
      eventBus.on('event', callback2);
      eventBus.emit('event', 'data');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('AppState Functionality', () => {
    test('should initialize with default audio state', () => {
      expect(appState.audio).toBeDefined();
      expect(appState.audio.isRunning).toBe(false);
    });

    test('should manage audio state changes', () => {
      appState.isRunning = true;
      expect(appState.isRunning).toBe(true);

      appState.isRunning = false;
      expect(appState.isRunning).toBe(false);
    });

    test('should maintain interview state', () => {
      appState.currentQuestion.text = 'Test Question';
      expect(appState.currentQuestion.text).toBe('Test Question');
    });
  });

  describe('ModeManager Functionality', () => {
    test('should switch between modes', () => {
      expect(modeManager.getMode()).toBe(MODES.INTERVIEW);

      modeManager.setMode(MODES.NORMAL);
      expect(modeManager.getMode()).toBe(MODES.NORMAL);

      modeManager.setMode(MODES.INTERVIEW);
      expect(modeManager.getMode()).toBe(MODES.INTERVIEW);
    });

    test('should delegate to correct mode handlers', () => {
      // Interview mode - cannot re-ask
      expect(modeManager.canReAsk('q1')).toBe(false);

      // Switch to normal mode - can re-ask
      modeManager.setMode(MODES.NORMAL);
      expect(modeManager.canReAsk('q1')).toBe(true);
    });

    test('should validate questions in both modes', () => {
      const validQuestion = 'What is this?';
      const emptyQuestion = '';

      // Interview mode
      expect(modeManager.validateQuestion(validQuestion)).toBe(true);
      expect(!modeManager.validateQuestion(emptyQuestion)).toBe(true);

      // Normal mode
      modeManager.setMode(MODES.NORMAL);
      expect(modeManager.validateQuestion(validQuestion)).toBe(true);
      expect(!modeManager.validateQuestion(emptyQuestion)).toBe(true);
    });
  });

  describe('EventBus + AppState Coordination', () => {
    test('should emit and track state changes', () => {
      const stateCallback = jest.fn();
      eventBus.on('state-updated', stateCallback);

      // Change state and emit event
      appState.isRunning = true;
      eventBus.emit('state-updated', { isRunning: appState.isRunning });

      expect(stateCallback).toHaveBeenCalledWith({ isRunning: true });
    });

    test('should handle multiple state changes through EventBus', () => {
      const callback = jest.fn();
      eventBus.on('state-change', callback);

      appState.isRunning = true;
      eventBus.emit('state-change', appState);

      appState.isCapturing = true;
      eventBus.emit('state-change', appState);

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('EventBus + ModeManager Coordination', () => {
    test('should emit mode changes through EventBus', () => {
      const modeCallback = jest.fn();
      eventBus.on('mode-changed', modeCallback);

      modeManager.setMode(MODES.NORMAL);
      eventBus.emit('mode-changed', { newMode: MODES.NORMAL });

      expect(modeCallback).toHaveBeenCalled();
    });
  });

  describe('AppState + ModeManager Coordination', () => {
    test('should maintain consistent state across systems', () => {
      // Set interview state
      appState.currentQuestion.text = 'Sample question';

      // Set mode
      modeManager.setMode(MODES.INTERVIEW);

      // Verify consistency
      expect(modeManager.getMode()).toBe(MODES.INTERVIEW);
      expect(appState.currentQuestion.text).toBe('Sample question');
    });

    test('should handle mode-dependent state operations', () => {
      const question = 'What is testing?';
      appState.currentQuestion.text = question;

      // Interview mode - restrictive
      expect(modeManager.canReAsk('q1')).toBe(false);
      expect(modeManager.validateQuestion(question)).toBe(true);

      // Normal mode - permissive
      modeManager.setMode(MODES.NORMAL);
      expect(modeManager.canReAsk('q1')).toBe(true);
      expect(modeManager.validateQuestion(question)).toBe(true);
    });
  });

  describe('Three-System Workflow', () => {
    test('should coordinate EventBus, AppState, and ModeManager in workflow', () => {
      const events = [];

      eventBus.on('workflow-step', (step) => events.push(step));

      // Initialize
      modeManager.setMode(MODES.INTERVIEW);
      eventBus.emit('workflow-step', 'mode-set-interview');

      // Update state
      appState.isRunning = true;
      eventBus.emit('workflow-step', 'audio-started');

      // Set question
      appState.currentQuestion.text = 'Interview question';
      eventBus.emit('workflow-step', 'question-set');

      // Validate with mode
      const isValid = modeManager.validateQuestion(appState.currentQuestion.text);
      if (isValid) {
        eventBus.emit('workflow-step', 'question-validated');
      }

      expect(events).toContain('mode-set-interview');
      expect(events).toContain('audio-started');
      expect(events).toContain('question-set');
      expect(events).toContain('question-validated');
    });
  });

  describe('Error Resilience', () => {
    test('should handle invalid mode changes gracefully', () => {
      expect(() => {
        modeManager.setMode('INVALID_MODE');
      }).toThrow();

      // Should still be in last valid mode
      expect(modeManager.getMode()).toBe(MODES.INTERVIEW);
    });

    test('should maintain state integrity after errors', () => {
      const initialQuestion = 'Test';
      appState.currentQuestion.text = initialQuestion;

      try {
        modeManager.setMode('INVALID');
      } catch (e) {
        // Ignore error
      }

      // State should be unchanged
      expect(appState.currentQuestion.text).toBe(initialQuestion);
    });

    test('should continue functioning after event emission errors', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalCallback = jest.fn();

      eventBus.on('test-event', errorCallback);
      eventBus.on('test-event', normalCallback);

      // Should not throw
      expect(() => {
        eventBus.emit('test-event', 'data');
      }).not.toThrow();

      // Normal callback should still execute
      expect(normalCallback).toHaveBeenCalled();
    });
  });
});
