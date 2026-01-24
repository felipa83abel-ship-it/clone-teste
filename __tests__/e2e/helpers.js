/**
 * Helpers e utilitários para testes E2E com Electron
 *
 * Fornece:
 * - Função para iniciar app Electron
 * - Funções para simular atalhos de teclado
 * - Validadores de elementos UI
 */

const { _electron: electron } = require('playwright');
const path = require('path');

/**
 * Inicia a aplicação Electron com modo de teste
 * @param {Object} options - Opções de inicialização
 * @returns {Promise<Object>} { app, window } - Instância da app e janela
 */
async function launchApp(options = {}) {
	const {
		debug = false,
		headless = !process.env.HEADED, // Padrão: headless, a menos que HEADED esteja setado
	} = options;

	// Variáveis de ambiente para modo debug/teste
	const envVars = {
		MODE_DEBUG: '1', // Habilita modo mock para STT/LLM
		NODE_ENV: 'test',
		...process.env,
	};

	// Inicia a app Electron
	const app = await electron.launch({
		args: [path.join(__dirname, '../../main.js')],
		env: envVars,
		headless: headless && !debug,
	});

	// Aguarda a primeira janela ser criada
	const window = await app.firstWindow();
	await window.waitForLoadState('networkidle');

	return { app, window };
}

/**
 * Fecha a aplicação Electron
 * @param {Object} app - Instância da app
 */
async function closeApp(app) {
	await app.close();
}

/**
 * Simula tecla Ctrl+D (iniciar/parar captura de áudio)
 * @param {Object} window - Janela Electron
 */
async function toggleAudioCapture(window) {
	await window.keyboard.press('Control+D');
	await window.waitForTimeout(500); // Aguarda processamento
}

/**
 * Simula tecla Ctrl+Enter (enviar para LLM)
 * @param {Object} window - Janela Electron
 */
async function sendToLLM(window) {
	await window.keyboard.press('Control+Enter');
	await window.waitForTimeout(1000); // Aguarda processamento
}

/**
 * Simula tecla Ctrl+Shift+S (capturar screenshot)
 * @param {Object} window - Janela Electron
 */
async function captureScreenshot(window) {
	await window.keyboard.press('Control+Shift+S');
	await window.waitForTimeout(500); // Aguarda processamento
}

/**
 * Simula tecla Ctrl+Shift+A (analisar screenshot)
 * @param {Object} window - Janela Electron
 */
async function analyzeScreenshot(window) {
	await window.keyboard.press('Control+Shift+A');
	await window.waitForTimeout(1000); // Aguarda processamento (envia para LLM)
}

/**
 * Verifica se elemento existe na página
 * @param {Object} window - Janela Electron
 * @param {string} selector - Seletor CSS
 * @returns {Promise<boolean>}
 */
async function elementExists(window, selector) {
	return (await window.$(selector)) !== null;
}

/**
 * Aguarda elemento estar visível
 * @param {Object} window - Janela Electron
 * @param {string} selector - Seletor CSS
 * @param {number} timeout - Timeout em ms
 */
async function waitForElement(window, selector, timeout = 5000) {
	await window.waitForSelector(selector, { timeout });
}

/**
 * Obtém texto de um elemento
 * @param {Object} window - Janela Electron
 * @param {string} selector - Seletor CSS
 * @returns {Promise<string>}
 */
async function getElementText(window, selector) {
	const element = await window.$(selector);
	if (!element) return null;
	return await element.textContent();
}

/**
 * Aguarda condição de teste ser verdadeira
 * @param {Function} condition - Função que retorna boolean
 * @param {Object} options - { timeout, interval }
 */
async function waitForCondition(condition, options = {}) {
	const { timeout = 10000, interval = 100 } = options;
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		if (await condition()) {
			return true;
		}
		await new Promise(resolve => setTimeout(resolve, interval));
	}

	throw new Error(`Condição não foi satisfeita em ${timeout}ms`);
}

module.exports = {
	launchApp,
	closeApp,
	toggleAudioCapture,
	sendToLLM,
	captureScreenshot,
	analyzeScreenshot,
	elementExists,
	waitForElement,
	getElementText,
	waitForCondition,
};
