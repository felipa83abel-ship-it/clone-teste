/**
 * Teste de Debug: Verificar listeners dos botões
 *
 * Objetivo: Verificar se os event listeners estão sendo registrados
 * corretamente no HomeManager e se os cliques funcionam
 */

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, waitForElement, elementExists } = require('./helpers');

test.describe('DEBUG: Button Listeners', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    const result = await launchApp({ headless: false, debug: true });
    app = result.app;
    window = result.window;
  });

  test.afterAll(async () => {
    if (app) {
      await closeApp(app);
    }
  });

  test('Verificar se elemento listenBtn existe', async () => {
    // Aguarda elemento
    const exists = await elementExists('listenBtn');
    console.log(`  ✅ listenBtn exists: ${exists}`);
    expect(exists).toBe(true);
  });

  test('Verificar se elemento askLlmBtn existe', async () => {
    const exists = await elementExists('askLlmBtn');
    console.log(`  ✅ askLlmBtn exists: ${exists}`);
    expect(exists).toBe(true);
  });

  test('Verificar se elemento btnClose existe', async () => {
    const exists = await elementExists('btnClose');
    console.log(`  ✅ btnClose exists: ${exists}`);
    expect(exists).toBe(true);
  });

  test('Verificar logs de listener registration', async () => {
    // Aguarda um pouco para logs aparecerem
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Procura por logs no DevTools console
    const logs = await window.webContents.executeJavaScript(`
      window.__consoleLogs || []
    `);

    console.log('  📋 Logs coletados:');
    console.log(logs);

    // Verifica se há logs de HomeManager
    const hasHomeManagerLogs = logs.some(
      (log) => log.includes('HomeManager') || log.includes('>>>')
    );

    console.log(`  ✅ HomeManager logs found: ${hasHomeManagerLogs}`);
  });

  test('Verificar se RendererAPI está disponível', async () => {
    const hasAPI = await window.webContents.executeJavaScript(`
      !!globalThis.RendererAPI
    `);

    console.log(`  ✅ RendererAPI available: ${hasAPI}`);
    expect(hasAPI).toBe(true);
  });

  test('Verificar se métodos existem no RendererAPI', async () => {
    const methods = await window.webContents.executeJavaScript(`
      ({
        listenToggleBtn: typeof globalThis.RendererAPI?.listenToggleBtn,
        askLLM: typeof globalThis.RendererAPI?.askLLM,
      })
    `);

    console.log(`  ✅ RendererAPI methods:`, methods);
    expect(methods.listenToggleBtn).toBe('function');
    expect(methods.askLLM).toBe('function');
  });

  test('Clicar em listenBtn e verificar console', async () => {
    // Injetar interceptor de console
    await window.webContents.executeJavaScript(`
      window.__consoleLogs = [];
      const originalLog = console.log;
      const originalWarn = console.warn;
      console.log = function(...args) {
        window.__consoleLogs.push('LOG: ' + JSON.stringify(args));
        originalLog.apply(console, args);
      };
      console.warn = function(...args) {
        window.__consoleLogs.push('WARN: ' + JSON.stringify(args));
        originalWarn.apply(console, args);
      };
    `);

    // Clicar no botão
    await window.webContents.executeJavaScript(`
      document.getElementById('listenBtn')?.click();
    `);

    // Aguardar processamento
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Coletar logs
    const logs = await window.webContents.executeJavaScript(`
      window.__consoleLogs || []
    `);

    console.log('  📋 Logs após clicar em listenBtn:');
    logs.forEach((log) => console.log('    ', log));

    // Verificar se há logs de clique
    const hasClickLog = logs.some(
      (log) =>
        log.includes('listenBtn') ||
        log.includes('Chamando') ||
        log.includes('>>>') ||
        log.includes('NÃO EXISTE')
    );

    console.log(`  ✅ Click processed: ${hasClickLog}`);
  });
});
