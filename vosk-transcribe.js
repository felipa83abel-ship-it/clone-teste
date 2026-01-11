/**
 * 🔥 VOSK TRANSCRIBE - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição com Vosk (local).
 * - Suporte a vosk-local (offline, rápido).
 * - Emite eventos 'transcription' para desacoplamento.
 * - Segue padrão: modelo.js emite eventos, renderer processa.
 */

/* ================================
   IMPORTS
================================ */
const { ipcRenderer } = require('electron');

/* ================================
   CONSTANTES
================================ */
const YOU = 'Você'; // Autor das transcrições de entrada
const OTHER = 'Outros'; // Autor das transcrições de saída

/* ================================
   FUNÇÕES DE TRANSCRIÇÃO
================================ */

/**
 * Transcreve áudio completo com Vosk
 * @param {Buffer} buffer - Buffer do áudio
 * @param {string} source - 'input' ou 'output'
 * @returns {Promise<string>} Texto transcrito
 */
async function transcribeVoskComplete(buffer, source) {
	try {
		console.log(`🚀 Enviando para Vosk (local)...`);

		const startTime = Date.now();

		// Primeiro envia o áudio para processar
		await ipcRenderer.invoke('vosk-transcribe', buffer);

		// Depois finaliza para obter o resultado final acumulado
		const finalResult = await ipcRenderer.invoke('vosk-finalize');

		const endTime = Date.now();
		console.log(`✅ Vosk concluído em ${endTime - startTime}ms`);

		// Vosk retorna um objeto: { final: string, partial: string, isFinal: boolean }
		// Extrai o texto final
		let transcribedText = '';
		if (typeof finalResult === 'string') {
			transcribedText = finalResult;
		} else if (typeof finalResult === 'object' && finalResult !== null) {
			// Usa final (que agora contém o resultado acumulado)
			transcribedText = finalResult.final || '';
		}

		console.log(`📝 Resultado (${transcribedText.length} chars): "${transcribedText.substring(0, 80)}..."`);

		// 🔥 Emitir evento 'transcription'
		window.transcriptionEvents.dispatchEvent(new CustomEvent('transcription', {
			detail: {
				model: 'vosk-local',
				source: source,
				text: transcribedText,
				isFinal: true,
				timestamp: Date.now()
			}
		}));

		return transcribedText;
	} catch (error) {
		console.error('❌ Vosk falhou:', error.message);
		throw new Error(`Vosk local falhou: ${error.message}. Altere o modelo em "Configurações → API e Modelos"`);
	}
}

/**
 * Transcreve áudio parcial com Vosk
 * @param {Buffer} buffer - Buffer do áudio
 * @param {string} source - 'input' ou 'output'
 * @returns {Promise<string>} Texto parcial (sempre vazio para Vosk)
 */
async function transcribeVoskPartial(buffer, source) {
	// ⚠️ Para Vosk, não fazemos transcrição parcial em tempo real
	// Vosk acumula e retorna parciais, mas não queremos enviá-las para a UI
	// A transcrição real será feita em transcribeVoskComplete() quando a gravação terminar
	return '';
}

/**
 * Obtém o modelo STT configurado (função auxiliar)
 * @returns {string} Modelo STT
 */
function getConfiguredSTTModel() {
	// Copiado de renderer.js - TODO: centralizar
	try {
		const activeProvider = globalThis.configManager?.get('activeProvider') || 'openai';
		const configuredModel = globalThis.configManager?.get(`${activeProvider}.selectedSTTModel`);

		if (configuredModel) {
			return configuredModel;
		}

		console.warn(`⚠️ Modelo STT não configurado para ${activeProvider}, usando padrão: vosk-local`);
		return 'vosk-local';
	} catch (error) {
		console.warn('⚠️ configManager não disponível, usando padrão: vosk-local');
		return 'vosk-local';
	}
}

/* ================================
   EXPORTS (CommonJS)
================================ */
module.exports = {
	transcribeVoskComplete,
	transcribeVoskPartial,
};