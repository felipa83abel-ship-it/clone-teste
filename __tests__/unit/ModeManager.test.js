const { ModeManager, MODES, InterviewModeHandlers, NormalModeHandlers } = require('../../controllers/modes/mode-manager');

describe('ModeManager', () => {
	let modeManager;

	beforeEach(() => {
		modeManager = new ModeManager(MODES.INTERVIEW);
		modeManager.registerMode(MODES.INTERVIEW, InterviewModeHandlers);
		modeManager.registerMode(MODES.NORMAL, NormalModeHandlers);
	});

	describe('Initialization', () => {
		test('should initialize with default mode', () => {
			expect(modeManager.getMode()).toBe(MODES.INTERVIEW);
		});

		test('should register modes with handlers', () => {
			expect(modeManager.handlers[MODES.INTERVIEW]).toBeDefined();
			expect(modeManager.handlers[MODES.NORMAL]).toBeDefined();
		});
	});

	describe('Mode Management', () => {
		test('should change mode', () => {
			modeManager.setMode(MODES.NORMAL);
			expect(modeManager.getMode()).toBe(MODES.NORMAL);

			modeManager.setMode(MODES.INTERVIEW);
			expect(modeManager.getMode()).toBe(MODES.INTERVIEW);
		});

		test('should check if in specific mode', () => {
			expect(modeManager.is(MODES.INTERVIEW)).toBe(true);
			expect(modeManager.is(MODES.NORMAL)).toBe(false);

			modeManager.setMode(MODES.NORMAL);
			expect(modeManager.is(MODES.INTERVIEW)).toBe(false);
			expect(modeManager.is(MODES.NORMAL)).toBe(true);
		});

		test('should throw error when changing to unregistered mode', () => {
			expect(() => {
				modeManager.setMode('UNKNOWN_MODE');
			}).toThrow();
		});
	});

	describe('Delegation', () => {
		test('should delegate method call to current mode handler', () => {
			const question = 'Test question';
			const result = modeManager.onQuestionFinalize(question);
			expect(result).toBe(true);
		});

		test('should delegate different methods based on current mode', () => {
			// Interview mode
			expect(modeManager.canReAsk('question-1')).toBe(false);

			// Normal mode
			modeManager.setMode(MODES.NORMAL);
			expect(modeManager.canReAsk('question-1')).toBe(true);
		});

		test('should handle warning when method does not exist on handler', () => {
			const invalidModeManager = new ModeManager(MODES.INTERVIEW);
			invalidModeManager.registerMode(MODES.INTERVIEW, {});

			// Should not throw, just return undefined with warning
			const result = invalidModeManager.delegate('nonexistentMethod');
			expect(result).toBeUndefined();
		});
	});

	describe('Interview Mode Handlers', () => {
		test('should validate non-empty questions in interview mode', () => {
			const validQuestion = 'Some question';
			expect(modeManager.validateQuestion(validQuestion)).toBe(true);
		});

		test('should not validate empty/whitespace questions in interview mode', () => {
			const result1 = modeManager.validateQuestion('');
			const result2 = modeManager.validateQuestion('   ');

			// Empty string is falsy
			expect(!result1).toBe(true);
		});

		test('should not allow re-asking questions in interview mode', () => {
			expect(modeManager.canReAsk('any-id')).toBe(false);
		});

		test('should render interview mode state', () => {
			expect(modeManager.renderModeState()).toBe('interview');
		});
	});

	describe('Normal Mode Handlers', () => {
		beforeEach(() => {
			modeManager.setMode(MODES.NORMAL);
		});

		test('should validate non-empty questions in normal mode', () => {
			const validQuestion = 'Some question';
			expect(modeManager.validateQuestion(validQuestion)).toBe(true);
		});

		test('should not validate empty/whitespace questions in normal mode', () => {
			const result = modeManager.validateQuestion('');
			expect(!result).toBe(true);
		});

		test('should allow re-asking questions in normal mode', () => {
			expect(modeManager.canReAsk('any-id')).toBe(true);
		});

		test('should render normal mode state', () => {
			expect(modeManager.renderModeState()).toBe('normal');
		});
	});

	describe('Mode Callbacks', () => {
		test('should handle onQuestionFinalize callback', () => {
			const result = modeManager.onQuestionFinalize('test question');
			expect(result).toBe(true);
		});

		test('should handle onAnswerStreamEnd callback', () => {
			const result = modeManager.onAnswerStreamEnd({ text: 'answer' });
			expect(result).toBe(true);
		});

		test('should handle onQuestionClick callback', () => {
			const result = modeManager.onQuestionClick('question-id');
			expect(result).toBe(true);
		});
	});

	describe('Mode Switching Behavior', () => {
		test('should change behavior when switching modes', () => {
			const questionId = 'q1';

			// Start in interview mode
			expect(modeManager.is(MODES.INTERVIEW)).toBe(true);
			expect(modeManager.canReAsk(questionId)).toBe(false);

			// Switch to normal
			modeManager.setMode(MODES.NORMAL);
			expect(modeManager.is(MODES.NORMAL)).toBe(true);
			expect(modeManager.canReAsk(questionId)).toBe(true);

			// Switch back to interview
			modeManager.setMode(MODES.INTERVIEW);
			expect(modeManager.canReAsk(questionId)).toBe(false);
		});
	});
});
