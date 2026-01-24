// Setup para testes - mocks e configurações globais

// Remover logs de console durante testes
global.console.log = jest.fn();
global.console.error = jest.fn();
global.console.warn = jest.fn();

// Mock para EventEmitter (se necessário)
class MockEventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(...args));
    }
    return this;
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }
    return this;
  }

  once(event, callback) {
    const wrapper = (...args) => {
      callback(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
    return this;
  }

  removeAllListeners(event) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
    return this;
  }
}

global.MockEventEmitter = MockEventEmitter;

// Timeout padrão para testes
jest.setTimeout(10000);
