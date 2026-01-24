/* ================================ */
// SCREENSHOT CONTROLLER
// Gerencia captura e análise de screenshots
/* ================================ */

const { ipcRenderer } = require('electron');
const Logger = require('../../utils/Logger.js');

// Variáveis injetadas
let appState;
let eventBus;
let updateStatusMessage;
let renderQuestionsHistory;

/**
 * Inicializar screenshot-controller
 */
function initScreenshotController(deps) {
	appState = deps.appState;
	eventBus = deps.eventBus;
	updateStatusMessage = deps.updateStatusMessage;
	renderQuestionsHistory = deps.renderQuestionsHistory;
}

/**
 * Captura screenshot discretamente e armazena em memória
 */
async function captureScreenshot() {
	if (appState.audio.isCapturing) {
		console.log('⏳ Captura já em andamento...');
		return;
	}

	appState.audio.isCapturing = true;
	updateStatusMessage('📸 Capturando tela...');

	try {
		const result = await ipcRenderer.invoke('CAPTURE_SCREENSHOT');

		if (!result.success) {
			console.warn('⚠️ Falha na captura:', result.error);
			updateStatusMessage(`❌ ${result.error}`);
			eventBus.emit('screenshotBadgeUpdate', {
				count: appState.audio.capturedScreenshots.length,
				visible: appState.audio.capturedScreenshots.length > 0,
			});
			return;
		}

		// Armazena referência do screenshot
		appState.audio.capturedScreenshots.push({
			filepath: result.filepath,
			filename: result.filename,
			timestamp: result.timestamp,
			size: result.size,
		});

		console.log(`✅ Screenshot capturado: ${result.filename}`);
		console.log(`📦 Total em memória: ${appState.audio.capturedScreenshots.length}`);

		// Atualiza UI
		updateStatusMessage(`✅ ${appState.audio.capturedScreenshots.length} screenshot(s) capturado(s)`);
		eventBus.emit('screenshotBadgeUpdate', {
			count: appState.audio.capturedScreenshots.length,
			visible: true,
		});
	} catch (error) {
		console.error('❌ Erro ao capturar screenshot:', error);
		updateStatusMessage('❌ Erro na captura');
	} finally {
		appState.audio.isCapturing = false;
	}
}

/**
 * Envia screenshots para análise com OpenAI Vision
 */
async function analyzeScreenshots() {
	if (appState.audio.isAnalyzing) {
		Logger.info('Análise já em andamento');
		return;
	}

	if (appState.audio.capturedScreenshots.length === 0) {
		Logger.warn('Nenhum screenshot para analisar');
		updateStatusMessage('⚠️ Nenhum screenshot para analisar (capture com Ctrl+Shift+F)');
		return;
	}

	appState.audio.isAnalyzing = true;
	updateStatusMessage(`🔍 Analisando ${appState.audio.capturedScreenshots.length} screenshot(s)...`);

	try {
		// Extrai caminhos dos arquivos
		const filepaths = appState.audio.capturedScreenshots.map(s => s.filepath);

		Logger.info('Enviando para análise', { count: filepaths.length });

		// Envia para main.js
		const result = await ipcRenderer.invoke('ANALYZE_SCREENSHOTS', filepaths);

		if (!result.success) {
			Logger.error('Falha na análise', { error: result.error });
			updateStatusMessage(`❌ ${result.error}`);
			return;
		}

		// Renderiza resposta do LLM como se fosse uma pergunta normal
		const questionText = `📸 Análise de ${appState.audio.capturedScreenshots.length} screenshot(s)`;
		const questionId = String(appState.history.length + 1);

		// Adiciona "pergunta" ao histórico ANTES de renderizar respostas
		appState.history.push({
			id: questionId,
			text: questionText,
			createdAt: Date.now(),
			lastUpdateTime: Date.now(),
			answered: true,
		});

		// MARCA COMO RESPONDIDA (importante para clique não gerar duplicata)
		appState.interview.answeredQuestions.add(questionId);

		renderQuestionsHistory();

		// RENDERIZA VIA EVENTBUS (consistente com LLM)
		// Divide análise em tokens e emite como se fosse stream
		const analysisText = result.analysis;
		const tokens = analysisText.split(/(\s+|[.,!?;:\-()[\]{}\n])/g).filter(t => t.length > 0);

		Logger.info('Simulando stream', { tokenCount: tokens.length });

		// Emite tokens via eventBus (consistente com askLLM)
		let accumulated = '';
		for (const token of tokens) {
			accumulated += token;

			eventBus.emit('answerStreamChunk', {
				questionId: questionId,
				token: token,
				accum: accumulated,
			});

			// Pequeno delay entre tokens para simular streaming real
			await new Promise(resolve => setTimeout(resolve, 2));
		}

		Logger.info('Análise concluída');
		updateStatusMessage('✅ Análise concluída');

		// Limpa screenshots após análise
		Logger.info('Limpando screenshots', { count: appState.audio.capturedScreenshots.length });
		appState.audio.capturedScreenshots = [];

		// Atualiza badge
		eventBus.emit('screenshotBadgeUpdate', {
			count: 0,
			visible: false,
		});

		// Força limpeza no sistema
		await ipcRenderer.invoke('CLEANUP_SCREENSHOTS');
	} catch (error) {
		Logger.error('Erro ao analisar screenshots', { error: error.message });
		updateStatusMessage('❌ Erro na análise');
	} finally {
		appState.audio.isAnalyzing = false;
	}
}

/**
 * Limpa todos os screenshots armazenados
 */
function clearScreenshots() {
	if (appState.audio.capturedScreenshots.length === 0) return;

	console.log(`🗑️ Limpando ${appState.audio.capturedScreenshots.length} screenshot(s)...`);
	appState.audio.capturedScreenshots = [];

	updateStatusMessage('✅ Screenshots limpos');
	eventBus.emit('screenshotBadgeUpdate', {
		count: 0,
		visible: false,
	});

	// Força limpeza no sistema
	ipcRenderer.invoke('CLEANUP_SCREENSHOTS').catch(err => {
		console.warn('⚠️ Erro na limpeza:', err);
	});
}

/**
 * Exportar funções
 */
module.exports = {
	initScreenshotController,
	captureScreenshot,
	analyzeScreenshots,
	clearScreenshots,
};
