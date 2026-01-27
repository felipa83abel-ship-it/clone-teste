const EventBus = require('../../infra/bus/EventBus');

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('Event Subscription', () => {
    test('should subscribe to an event', () => {
      const callback = jest.fn();
      eventBus.on('test-event', callback);

      expect(eventBus.events['test-event']).toBeDefined();
      expect(eventBus.events['test-event']).toContain(callback);
    });

    test('should handle multiple subscribers to same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventBus.on('test-event', callback1);
      eventBus.on('test-event', callback2);

      expect(eventBus.events['test-event']).toHaveLength(2);
    });

    test('should unsubscribe from an event', () => {
      const callback = jest.fn();
      eventBus.on('test-event', callback);
      eventBus.off('test-event', callback);

      expect(eventBus.events['test-event']).not.toContain(callback);
    });
  });

  describe('Event Emission', () => {
    test('should emit event and call subscribers', () => {
      const callback = jest.fn();
      eventBus.on('test-event', callback);
      eventBus.emit('test-event', 'data');

      expect(callback).toHaveBeenCalledWith('data');
    });

    test('should pass single argument to callback', () => {
      const callback = jest.fn();
      eventBus.on('test-event', callback);
      eventBus.emit('test-event', 'arg1');

      expect(callback).toHaveBeenCalledWith('arg1');
    });

    test('should emit to multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventBus.on('test-event', callback1);
      eventBus.on('test-event', callback2);
      eventBus.emit('test-event', 'data');

      expect(callback1).toHaveBeenCalledWith('data');
      expect(callback2).toHaveBeenCalledWith('data');
    });

    test('should not emit to unrelated events', () => {
      const callback = jest.fn();
      eventBus.on('test-event-1', callback);
      eventBus.emit('test-event-2', 'data');

      expect(callback).not.toHaveBeenCalled();
    });

    test('should not crash when emitting to non-existent event', () => {
      expect(() => {
        eventBus.emit('non-existent-event', 'data');
      }).not.toThrow();
    });
  });

  describe('Event Removal', () => {
    test('should safely handle removing listeners from non-existent events', () => {
      const callback = jest.fn();
      expect(() => {
        eventBus.off('non-existent-event', callback);
      }).not.toThrow();
    });

    test('should properly clean up after removing all listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      eventBus.on('test-event', callback1);
      eventBus.on('test-event', callback2);

      eventBus.off('test-event', callback1);
      eventBus.off('test-event', callback2);

      eventBus.emit('test-event', 'data');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling in Listeners', () => {
    test('should catch errors in listener callbacks', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = jest.fn();

      eventBus.on('test-event', errorCallback);
      eventBus.on('test-event', normalCallback);

      expect(() => {
        eventBus.emit('test-event', 'data');
      }).not.toThrow();

      // Normal callback should still be called despite previous error
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('Event Data Passing', () => {
    test('should pass object data to listeners', () => {
      const callback = jest.fn();
      const data = { name: 'test', value: 42 };

      eventBus.on('test-event', callback);
      eventBus.emit('test-event', data);

      expect(callback).toHaveBeenCalledWith(data);
    });

    test('should pass null data correctly', () => {
      const callback = jest.fn();
      eventBus.on('test-event', callback);
      eventBus.emit('test-event', null);

      expect(callback).toHaveBeenCalledWith(null);
    });

    test('should handle undefined data', () => {
      const callback = jest.fn();
      eventBus.on('test-event', callback);
      eventBus.emit('test-event', undefined);

      expect(callback).toHaveBeenCalledWith(undefined);
    });
  });
});
