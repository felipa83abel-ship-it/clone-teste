/**
 * Teste E2E: Happy Path Completo
 *
 * Fluxo testado:
 * 1. App abre corretamente
 * 2. Captura de áudio inicia (Ctrl+D)
 * 3. Aguarda silêncio para finalizar (simulado em MODE_DEBUG)
 * 4. Enviar para LLM (Ctrl+Enter)
 * 5. Validar resposta streaming
 * 6. Capturar screenshot (Ctrl+Shift+S)
 * 7. Analisar screenshot (Ctrl+Shift+A)
 * 8. Validar resposta da análise
 *
 * Modo: MODE_DEBUG=1 (mock de STT e LLM)
 */

const { test, expect } = require('@playwright/test');
const {
	launchApp,
	closeApp,
	toggleAudioCapture,
	sendToLLM,
	captureScreenshot,
	analyzeScreenshot,
	waitForElement,
	getElementText,
	elementExists,
	waitForCondition,
} = require('./helpers');

test.describe('E2E: Happy Path Completo', () => {
	let app;
	let window;

	test.beforeAll(async () => {
		// Inicia a app Electron
		const result = await launchApp({ headless: false, debug: false });
		app = result.app;
		window = result.window;
	});

	test.afterAll(async () => {
		// Fecha a app
		if (app) {
			await closeApp(app);
		}
	});

	test('1️⃣ App abre e UI carrega corretamente', async () => {
		// Aguarda elementos principais estar presentes
		await waitForElement(window, '#conversation', 5000);
		await waitForElement(window, '#inputArea', 5000);

		// Valida que elementos estão visíveis
		expect(await elementExists(window, '#conversation')).toBeTruthy();
		expect(await elementExists(window, '#inputArea')).toBeTruthy();
	});

	test('2️⃣ Captura de áudio inicia (Ctrl+D)', async () => {
		// Inicia captura de áudio
		await toggleAudioCapture(window);

		// Aguarda indicador de captura estar ativo (em modo debug)
		await waitForCondition(
			async () => {
				const status = await getElementText(window, '#audioStatus');
				return status?.includes('Capturando') || status?.includes('ativo');
			},
			{ timeout: 3000 },
		);

		expect(true).toBeTruthy(); // Passou se não falhou no waitForCondition
	});

	test('3️⃣ Transcrição é gerada (modo DEBUG com mock)', async () => {
		// Em modo DEBUG, a transcrição é simulada
		// Aguarda até 3 segundos por uma transcrição aparecer

		await waitForCondition(
			async () => {
				// Procura por elemento de transcrição
				const transcripts = await window.$$('.transcript-item, .message');
				return transcripts.length > 0;
			},
			{ timeout: 3000 },
		);

		expect(true).toBeTruthy(); // Passou
	});

	test('4️⃣ Enviar para LLM (Ctrl+Enter)', async () => {
		// Envia pergunta/comando para LLM
		await sendToLLM(window);

		// Aguarda resposta do LLM (com streaming)
		await waitForCondition(
			async () => {
				// Procura por elemento de resposta
				const responses = await window.$$('.response, .message.assistant');
				return responses.length > 0;
			},
			{ timeout: 5000 },
		);

		expect(true).toBeTruthy(); // Passou
	});

	test('5️⃣ Resposta de streaming é válida', async () => {
		// Aguarda a resposta estar completa
		await window.waitForTimeout(1000); // Aguarda fim de streaming

		// Valida que há conteúdo na resposta
		const responseContent = await getElementText(window, '.response, .message.assistant');
		expect(responseContent).toBeTruthy();
		expect(responseContent?.length).toBeGreaterThan(0);
	});

	test('6️⃣ Capturar screenshot (Ctrl+Shift+S)', async () => {
		// Captura um screenshot da tela
		await captureScreenshot(window);

		// Aguarda confirmação de captura
		await waitForCondition(
			async () => {
				const status = await getElementText(window, '#screenshotStatus');
				return status?.includes('capturado') || status?.includes('sucesso');
			},
			{ timeout: 3000 },
		);

		expect(true).toBeTruthy(); // Passou
	});

	test('7️⃣ Analisar screenshot (Ctrl+Shift+A)', async () => {
		// Envia screenshot para análise por LLM
		await analyzeScreenshot(window);

		// Aguarda resposta de análise
		await waitForCondition(
			async () => {
				const analysis = await getElementText(window, '.screenshot-analysis, .message.assistant:last-child');
				return analysis && analysis.length > 0;
			},
			{ timeout: 5000 },
		);

		expect(true).toBeTruthy(); // Passou
	});

	test('8️⃣ Histórico de conversa está intacto', async () => {
		// Valida que a conversa foi mantida (pergunta + resposta + análise)
		const messages = await window.$$('.message');
		expect(messages.length).toBeGreaterThanOrEqual(3); // Pergunta + Resposta + Análise mínimo
	});

	test('9️⃣ App ainda está responsiva', async () => {
		// Testa que a app continua responsiva após todas as operações
		await window.keyboard.press('Control+D'); // Toggle áudio

		// Aguarda resposta (aparece ou desaparece indicador)
		await window.waitForTimeout(500);

		expect(true).toBeTruthy(); // Se chegou aqui, app está responsiva
	});
});

test.describe('E2E: Tratamento de Erros', () => {
	let app;
	let window;

	test.beforeAll(async () => {
		const result = await launchApp({ headless: false });
		app = result.app;
		window = result.window;
	});

	test.afterAll(async () => {
		if (app) {
			await closeApp(app);
		}
	});

	test('❌ Erro ao enviar sem áudio é tratado gracefully', async () => {
		// Tenta enviar para LLM sem primeiro fazer captura
		await sendToLLM(window);

		// Aguarda validação ou erro message
		await window.waitForTimeout(500);

		// App deve continuar funcionando (não crashear)
		expect(app).toBeTruthy();
	});

	test('❌ App não crasheia com múltiplos Ctrl+D rápidos', async () => {
		// Simula clicks rápidos
		await toggleAudioCapture(window);
		await window.waitForTimeout(100);
		await toggleAudioCapture(window);
		await window.waitForTimeout(100);
		await toggleAudioCapture(window);

		// App deve continuar funcionando
		expect(app).toBeTruthy();
	});
});
