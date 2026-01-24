/* ================================ */
// QUESTION HELPERS
// Funções utilitárias para manipulação de perguntas
/* ================================ */

const Logger = require('../../utils/Logger.js');

/**
 * Normaliza texto para comparação
 * Remove pontuação, converte para lowercase, remove espaços extras
 */
function normalizeForCompare(t) {
	Logger.debug('Início da função: "normalizeForCompare"');
	Logger.debug('Fim da função: "normalizeForCompare"');
	return (t || '')
		.toLowerCase()
		.replaceAll(/[?!.\n\r]/g, '')
		.replaceAll(/\s+/g, ' ')
		.trim();
}

/**
 * Finaliza uma pergunta (aplica formatação)
 */
function finalizeQuestion(text) {
	return text.trim();
}

/**
 * Reseta a pergunta atual
 */
function resetCurrentQuestion(appState) {
	Logger.debug('Início da função: "resetCurrentQuestion"');

	appState.interview.currentQuestion = {
		text: '',
		interimText: '',
		finalText: '',
		createdAt: null,
		lastUpdateTime: null,
		finalized: false,
		promotedToHistory: false,
	};

	Logger.debug('Fim da função: "resetCurrentQuestion"');
}

/**
 * Verifica se uma pergunta já foi respondida pelo ID
 */
function findAnswerByQuestionId(appState, questionId) {
	Logger.debug('Início da função: "findAnswerByQuestionId"');

	if (!questionId) {
		Logger.debug('Fim da função: "findAnswerByQuestionId"');
		return false;
	}

	Logger.debug('Fim da função: "findAnswerByQuestionId"');
	return appState.interview.answeredQuestions.has(questionId);
}

/**
 * Exportar helpers
 */
module.exports = {
	normalizeForCompare,
	finalizeQuestion,
	resetCurrentQuestion,
	findAnswerByQuestionId,
};
