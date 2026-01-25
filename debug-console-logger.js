// Script injected in renderer to log console calls
console.log('🔍 Console logger initialized');

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

window.__consoleLogs = [];

function addLog(level, args) {
  const message = args
    .map((arg) => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  window.__consoleLogs.push({
    level,
    message,
    timestamp: new Date().toISOString(),
  });

  // Also print to dev tools
  if (level === 'error') {
    originalError(...args);
  } else if (level === 'warn') {
    originalWarn(...args);
  } else {
    originalLog(...args);
  }
}

console.log = function (...args) {
  addLog('log', args);
};

console.warn = function (...args) {
  addLog('warn', args);
};

console.error = function (...args) {
  addLog('error', args);
};

// Expose method to get logs
window.getConsoleLogs = () => window.__consoleLogs;
window.clearConsoleLogs = () => {
  window.__consoleLogs = [];
};

console.log('✅ Console logger ready');
