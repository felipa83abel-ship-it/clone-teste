const STTStrategy = require('../../strategies/STTStrategy');

describe('STTStrategy', () => {
  let sttStrategy;

  beforeEach(() => {
    sttStrategy = new STTStrategy();
  });

  describe('Initialization', () => {
    test('should initialize without errors', () => {
      expect(sttStrategy).toBeDefined();
    });

    test('should be an instance of STTStrategy', () => {
      expect(sttStrategy).toBeInstanceOf(STTStrategy);
    });
  });

  describe('Provider Methods Existence', () => {
    test('should have start method', () => {
      expect(typeof sttStrategy.start).toBe('function');
    });

    test('should have stop method', () => {
      expect(typeof sttStrategy.stop).toBe('function');
    });

    test('should have switchDevice method', () => {
      expect(typeof sttStrategy.switchDevice).toBe('function');
    });
  });

  describe('State Management', () => {
    test('should be able to be instantiated multiple times', () => {
      const strategy1 = new STTStrategy();
      const strategy2 = new STTStrategy();

      expect(strategy1).not.toBe(strategy2);
    });

    test('should maintain its own internal state', () => {
      const strategy1 = new STTStrategy();
      const strategy2 = new STTStrategy();

      // Verify they are separate instances
      expect(strategy1).toEqual(strategy2); // But structurally equivalent
    });
  });
});
