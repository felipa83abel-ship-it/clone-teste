# E2E Tests - AskMe

Testes end-to-end (E2E) da aplicação Electron usando **Playwright**.

## 📋 Requisitos

- Node.js 16+
- Playwright (`npm install --save-dev @playwright/test`)
- App Electron funcionando (`npm start`)

## 🚀 Rodar Testes E2E

### 1. Modo Headless (sem interface visível)

```bash
npm run test:e2e
```

### 2. Modo Headed (com interface visível)

```bash
npm run test:e2e:headed
```

### 3. Modo Debug (com Playwright Inspector)

```bash
npm run test:e2e:debug
```

### 4. Ver Relatório HTML

```bash
npm run test:e2e:report
```

## ✅ Testes Implementados

### Happy Path (Fluxo Normal)

1. ✅ App abre e UI carrega corretamente
2. ✅ Captura de áudio inicia (Ctrl+D)
3. ✅ Transcrição é gerada (modo DEBUG com mock)
4. ✅ Enviar para LLM (Ctrl+Enter)
5. ✅ Resposta de streaming é válida
6. ✅ Capturar screenshot (Ctrl+Shift+S)
7. ✅ Analisar screenshot (Ctrl+Shift+A)
8. ✅ Histórico de conversa está intacto
9. ✅ App ainda está responsiva

### Tratamento de Erros

- ✅ Erro ao enviar sem áudio é tratado gracefully
- ✅ App não crasheia com múltiplos Ctrl+D rápidos

## 🔧 Configuração

### Variáveis de Ambiente

- `MODE_DEBUG=1` - Habilita modo mock para STT/LLM
- `HEADED=1` - Executa com interface visível
- `CI=true` - Modo CI (retry automático)

### Playwright Config

Arquivo: `playwright.config.js`

- Timeout padrão: 30s
- Workers: 1 (Electron é singleton)
- Reporter: HTML

### Helpers

Arquivo: `__tests__/e2e/helpers.js`

Funções disponíveis:

- `launchApp(options)` - Inicia app Electron
- `closeApp(app)` - Fecha app
- `toggleAudioCapture(window)` - Simula Ctrl+D
- `sendToLLM(window)` - Simula Ctrl+Enter
- `captureScreenshot(window)` - Simula Ctrl+Shift+S
- `analyzeScreenshot(window)` - Simula Ctrl+Shift+A
- `waitForElement(window, selector, timeout)` - Aguarda elemento
- `waitForCondition(condition, options)` - Aguarda condição

## 📊 Relatório de Testes

Após rodar testes E2E, um relatório HTML é gerado em:

```
playwright-report/
```

Para visualizar:

```bash
npm run test:e2e:report
```

## 🐛 Troubleshooting

### App não abre

- Verificar se `NODE_ENV` não é 'production'
- Verificar se porta 9229 (debug) não está em uso

### Timeout em esperas

- Aumentar timeout em helpers ou testes específicos
- Verificar se seletores CSS estão corretos

### Teste falha em CI mas passa localmente

- Verificar diferenças de timing
- Aumentar timeouts
- Adicionar logs de debug

## 📝 Adicionar Novo Teste E2E

1. Criar arquivo em `__tests__/e2e/novo-teste.test.js`
2. Importar helpers
3. Usar `test.describe()` e `test()` do Playwright
4. Usar `launchApp()` em `test.beforeAll()`
5. Usar `closeApp()` em `test.afterAll()`

Exemplo:

```javascript
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers');

test.describe('Meu teste', () => {
	let app, window;

	test.beforeAll(async () => {
		const result = await launchApp();
		app = result.app;
		window = result.window;
	});

	test.afterAll(async () => {
		await closeApp(app);
	});

	test('Fazer algo', async () => {
		expect(true).toBeTruthy();
	});
});
```

## 🔗 Referências

- [Playwright Docs](https://playwright.dev)
- [Playwright Electron](https://playwright.dev/docs/electron)
- [Testing Best Practices](https://playwright.dev/docs/best-practices)
