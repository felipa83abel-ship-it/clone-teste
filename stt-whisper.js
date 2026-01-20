/**
 * 🔥 WHISPER TRANSCRIBE - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição com Whisper (OpenAI e local).
 * - Suporte a whisper-1 (online) e whisper-cpp-local (offline).
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
 * Transcreve áudio completo com Whisper
 * @param {Buffer} buffer - Buffer do áudio
 * @param {string} source - 'input' ou 'output'
 * @returns {Promise<string>} Texto transcrito
 */
async function transcribeWhisperComplete(buffer, source) {
	const sttModel = getConfiguredSTTModel();

	if (sttModel === 'whisper-cpp-local') {
		try {
			console.log(`🚀 Enviando para Whisper.cpp (local, alta precisão)...`);

			const startTime = Date.now();
			const result = await ipcRenderer.invoke('transcribe-local', buffer);
			const endTime = Date.now();

			console.log(`✅ Whisper.cpp concluído em ${endTime - startTime}ms`);
			console.log(`📝 Resultado (${result.length} chars): "${result.substring(0, 80)}..."`);

			// 🔥 Emitir evento 'transcription'
			window.transcriptionEvents.dispatchEvent(
				new CustomEvent('transcription', {
					detail: {
						model: 'whisper-cpp-local',
						source: source,
						text: result,
						isFinal: true,
						timestamp: Date.now(),
					},
				}),
			);

			return result;
		} catch (error) {
			console.error('❌ Whisper.cpp local falhou:', error.message);
			throw new Error(`Whisper.cpp local falhou: ${error.message}. Altere o modelo em "Configurações → API e Modelos"`);
		}
	} else if (sttModel === 'whisper-1') {
		try {
			const startTime = Date.now();
			const result = await ipcRenderer.invoke('transcribe-audio', buffer);
			const endTime = Date.now();

			console.log(`✅ Whisper-1 concluído em ${endTime - startTime}ms`);

			// 🔥 Emitir evento 'transcription'
			window.transcriptionEvents.dispatchEvent(
				new CustomEvent('transcription', {
					detail: {
						model: 'whisper-1',
						source: source,
						text: result,
						isFinal: true,
						timestamp: Date.now(),
					},
				}),
			);

			return result;
		} catch (error) {
			console.error('❌ Whisper-1 falhou:', error.message);
			throw error;
		}
	} else {
		throw new Error(`Modelo Whisper desconhecido: ${sttModel}`);
	}
}

/**
 * Transcreve áudio parcial com Whisper
 * @param {Buffer} buffer - Buffer do áudio
 * @param {string} source - 'input' ou 'output'
 * @returns {Promise<string>} Texto parcial
 */
async function transcribeWhisperPartial(buffer, source) {
	const sttModel = getConfiguredSTTModel();

	if (sttModel === 'whisper-cpp-local') {
		// Desabilitado para evitar erros
		return '';
	} else if (sttModel === 'whisper-1') {
		try {
			const result = await ipcRenderer.invoke('transcribe-audio-partial', buffer);

			// 🔥 Emitir evento 'transcription' para parcial
			window.transcriptionEvents.dispatchEvent(
				new CustomEvent('transcription', {
					detail: {
						model: 'whisper-1',
						source: source,
						text: result,
						isFinal: false,
						timestamp: Date.now(),
					},
				}),
			);

			return result;
		} catch (error) {
			console.warn('⚠️ Whisper-1 parcial falhou:', error.message);
			return '';
		}
	} else {
		console.warn(`⚠️ Modelo STT desconhecido em transcribeWhisperPartial: ${sttModel}`);
		return '';
	}
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

		console.warn(`⚠️ Modelo STT não configurado para ${activeProvider}, usando padrão: whisper-1`);
		return 'whisper-1';
	} catch (error) {
		console.warn('⚠️ configManager não disponível, usando padrão: whisper-1');
		return 'whisper-1';
	}
}

/* ================================
   EXPORTS (CommonJS)
================================ */
function startAudioWhisperLocal() {
	console.log('chamou startAudioWhisperLocal');
}
function stopAudioWhisperLocal() {
	console.log('🛑 Whisper completamente parado');
}
function switchDeviceWhisperLocal() {
	console.log('chamou switchDeviceWhisperLocal');
}

module.exports = {
	startAudioWhisperLocal,
	stopAudioWhisperLocal,
	switchDeviceWhisperLocal,
};
