/**
 * Declarações de tipos globais para TypeScript
 * Define as variáveis e classes que estão no escopo global do Electron
 */

declare class Logger {
  static debug(message: string, ...args: any[]): void;
  static info(message: string, ...args: any[]): void;
  static warn(message: string, ...args: any[]): void;
  static error(message: string, ...args: any[]): void;
}

declare const _ipc: any;

declare class ApiKeyManager {
  constructor(configManager: any, ipc: any, eventBus: any);
}

declare class AudioDeviceManager {
  constructor(configManager: any, ipc: any, eventBus: any);
}

declare class ModelSelectionManager {
  constructor(configManager: any, ipc: any, eventBus: any);
}

declare class ScreenConfigManager {
  constructor(configManager: any, ipc: any, eventBus: any);
}

declare class PrivacyConfigManager {
  constructor(configManager: any, ipc: any, eventBus: any);
}

declare class WindowConfigManager {
  constructor(configManager: any, ipc: any, eventBus: any);
}

declare class HomeManager {
  constructor(configManager: any, ipc: any, eventBus: any);
}

interface EventBus {
  emit(event: string, ...args: any[]): void;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler?: (...args: any[]) => void): void;
}

interface IpcRenderer {
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(channel: string, handler: (event: any, ...args: any[]) => void): void;
  once(channel: string, handler: (event: any, ...args: any[]) => void): void;
  removeListener(channel: string, handler: (...args: any[]) => void): void;
}

declare global {
  interface Window {
    RendererAPI: any;
    eventBus: EventBus;
  }
}

export {};
