// @ts-nocheck
/**
 * Configuração do Playwright para testes E2E da app Electron
 *
 * Uso:
 *   npx playwright test                 # Rodar todos os testes
 *   npx playwright test --headed        # Com interface visível
 *   npx playwright test --debug         # Modo debug
 *   npx playwright show-report          # Ver relatório
 */

const { defineConfig, devices } = require('@playwright/test');
const _path = require('path');

module.exports = defineConfig({
  testDir: './__tests__/e2e',
  fullyParallel: false, // Rodar sequencialmente (app Electron é singleton)
  forbidOnly: !!process.env.CI, // Marcar como erro no CI
  retries: process.env.CI ? 2 : 0, // Retry em CI
  workers: 1, // Apenas 1 worker (app Electron não suporta múltiplas instâncias)
  reporter: 'html', // Relatório HTML
  use: {
    // Não usar browser direto, usar Electron
    launch: true,
  },
  webServer: undefined, // Não inicia web server, usa app Electron diretamente
  timeout: 30 * 1000, // Timeout de 30s por teste
  expect: {
    timeout: 5000, // Timeout de assertions
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['chromium'],
        // Config específica para testar app Electron
      },
    },
  ],
});
