/**
 * MOCK RUNNER - Sistema de testes automatizados
 *
 * Isolado de renderer.js para facilitar remoção em produção
 * Ativado apenas quando APP_CONFIG.MODE_DEBUG === true
 *
 * Responsabilidades:
 * - Simular perguntas e respostas de IA
 * - Interceptar IPC para ANALYZE_SCREENSHOTS e ask-gpt-stream
 * - Rodar cenários automáticos (runMockAutoPlay)
 */

/**
 * Respostas mockadas por pergunta
 */
const MOCK_RESPONSES = {
	'Mock - O que é JVM e para que serve?':
		'Mock - A JVM (Java Virtual Machine) é uma máquina virtual que executa bytecode Java. Ela permite que programas Java rodem em qualquer plataforma sem modificação. A JVM gerencia memória, garbage collection e fornece um ambiente isolado e seguro para execução de código.',
	'Mock - Qual a diferença entre JDK e JRE?':
		'Mock - JDK (Java Development Kit) é o kit completo para desenvolvimento, incluindo compilador, ferramentas e bibliotecas. JRE (Java Runtime Environment) contém apenas o necessário para executar aplicações Java compiladas. Todo desenvolvedor precisa do JDK, mas usuários finais precisam apenas da JRE.',
	'Mock - O que é uma classe em Java?':
		'Mock - Uma classe é o molde ou blueprint para criar objetos. Define atributos (propriedades) e métodos (comportamentos). As classes são fundamentais na programação orientada a objetos. Por exemplo, uma classe Carro pode ter atributos como cor e velocidade, e métodos como acelerar e frear.',
	'Mock - Explique sobre herança em Java':
		'Mock - Herança permite que uma classe herde propriedades e métodos de outra classe. A classe filha estende a classe pai usando a palavra-chave extends. Isso promove reutilização de código e cria uma hierarquia de classes. Por exemplo, a classe Bicicleta pode herdar de Veiculo.',
	'Mock - Como funciona polimorfismo?':
		'Mock - Polimorfismo significa muitas formas. Permite que objetos de diferentes tipos respondam a mesma chamada de método de forma diferente. Pode ser através de sobrescrita de métodos (herança) ou interface. Exemplo: diferentes animais implementam o método fazer_som() diferentemente.',
	'Mock - O que é encapsulamento?':
		'Mock - Encapsulamento é o princípio de ocultar detalhes internos da implementação. Usa modificadores de acesso como private, protected e public. Protege dados e métodos críticos, permitindo controle sobre como são acessados. É uma pilar da segurança e manutenção do código orientado a objetos.',
};

/**
 * Cenários automáticos para teste
 * screenshotsCount: 0 = sem screenshot, 1 = tira 1 foto, 2 = tira 2 fotos, etc
 */
const MOCK_SCENARIOS = [
	{ question: 'Mock - O que é JVM e para que serve?', screenshotsCount: 1 },
	{ question: 'Mock - Qual a diferença entre JDK e JRE?', screenshotsCount: 0 },
	{ question: 'Mock - O que é uma classe em Java?', screenshotsCount: 0 },
	{ question: 'Mock - Explique sobre herança em Java', screenshotsCount: 2 },
	{ question: 'Mock - Como funciona polimorfismo?', screenshotsCount: 0 },
	{ question: 'Mock - O que é encapsulamento?', screenshotsCount: 0 },
];

let mockScenarioIndex = 0;
let mockAutoPlayActive = false;

// Contexto do renderer (preenchido via initMockInterceptor)
let rendererContext = {
	eventBus: null,
	captureScreenshot: null,
	analyzeScreenshots: null,
	APP_CONFIG: null,
};

/**
 * Define o contexto do renderer para que o mock-runner possa acessar funções
 */
function setRendererContext(context) {
	rendererContext = { ...rendererContext, ...context };
}

/**
 * Retorna resposta mockada para pergunta
 * Busca exata ou parcial
 * @param {string} question - Pergunta
 * @returns {string} Resposta mockada
 */
function getMockResponse(question) {
	// Match exato
	if (MOCK_RESPONSES[question]) {
		return MOCK_RESPONSES[question];
	}

	// Match parcial
	for (const [key, value] of Object.entries(MOCK_RESPONSES)) {
		if (question.toLowerCase().includes(key.toLowerCase())) {
			return value;
		}
	}

	// Fallback
	return `Resposta mockada para: "${question}"\n\nEste é um teste do sistema em modo Mock.`;
}

/**
 * Função de autoplay automático para mockar perguntas e respostas
 */
async function runMockAutoPlay() {
	if (mockAutoPlayActive) return;
	if (!rendererContext.eventBus) {
		console.warn('⚠️ Mock: Contexto do renderer ainda não inicializado');
		return;
	}

	const { eventBus, captureScreenshot, analyzeScreenshots, APP_CONFIG } = rendererContext;

	mockAutoPlayActive = true;

	while (mockScenarioIndex < MOCK_SCENARIOS.length && APP_CONFIG.MODE_DEBUG && mockAutoPlayActive) {
		const scenario = MOCK_SCENARIOS[mockScenarioIndex];
		console.log(
			`\n🎬 ════════════════════════════════════════════════════════\n🎬 MOCK CENÁRIO ${mockScenarioIndex + 1}/${
				MOCK_SCENARIOS.length
			}\n🎬 ════════════════════════════════════════════════════════`,
		);

		// FASE 1: Simula captura de áudio (2-4s)
		console.log(`🎤 [FASE-1] Capturando áudio da pergunta...`);
		const audioStartTime = Date.now();
		const placeholderId = `placeholder-${audioStartTime}-${Math.random()}`;

		// Emite placeholder
		eventBus.emit('transcriptAdd', {
			author: 'Outros',
			text: '...',
			timeStr: new Date().toLocaleTimeString(),
			elementId: 'conversation',
			placeholderId: placeholderId,
		});

		// Aguarda captura
		await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

		// 🔥 CHECK: Se modo debug foi desativado, para imediatamente
		if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
			console.log('🛑 [PARADA] Modo debug desativado - parando mock autoplay');
			break;
		}

		const audioEndTime = Date.now();
		console.log(`✅ [FASE-1] Áudio capturado`);

		// Calcula latência (arredonda para inteiro - sem casas decimais)
		const latencyMs = Math.round(800 + Math.random() * 400);
		const totalMs = audioEndTime - audioStartTime + latencyMs;

		// Atualiza placeholder com texto real
		eventBus.emit('placeholderFulfill', {
			speaker: 'Outros',
			text: scenario.question,
			startStr: new Date(audioStartTime).toLocaleTimeString(),
			stopStr: new Date(audioEndTime).toLocaleTimeString(),
			recordingDuration: audioEndTime - audioStartTime,
			latency: latencyMs,
			total: totalMs,
			placeholderId: placeholderId,
		});

		// FASE 2: Processa pergunta (handleSpeech + closeCurrentQuestion)
		console.log(`📝 [FASE-2] Processando pergunta...`);
		//handleSpeech(OTHER, scenario.question, { skipAddToUI: true });

		// Aguarda consolidação (800ms para garantir que pergunta saia do CURRENT)
		await new Promise(resolve => setTimeout(resolve, 800));

		// 🔥 CHECK: Se modo debug foi desativado, para imediatamente
		if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
			console.log('🛑 [PARADA] Modo debug desativado - parando mock autoplay');
			break;
		}

		// Simula silêncio e fecha pergunta
		console.log(`🔇 [FASE-2] Silêncio detectado, fechando pergunta...`);
		//closeCurrentQuestion();

		// FASE 3: askGpt será acionado automaticamente, o interceptor (ask-gpt-stream) que irá mockar
		console.log(`🤖 [FASE-3] askGpt acionado - mock stream será emitido pelo interceptor`);

		// Aguarda stream terminar (~30ms por token)
		const mockResponse = getMockResponse(scenario.question);
		const estimatedTime = mockResponse.length * 30;
		await new Promise(resolve => setTimeout(resolve, estimatedTime + 1000));

		// 🔥 CHECK: Se modo debug foi desativado, para imediatamente SEM TIRAR SCREENSHOT
		if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
			console.log('🛑 [PARADA] Modo debug desativado - parando sem capturar screenshot');
			break;
		}

		// FASE 4 (Opcional): Captura N screenshots REAIS e depois aciona análise
		if (scenario.screenshotsCount && scenario.screenshotsCount > 0) {
			// FASE 4A: Captura múltiplos screenshots
			for (let i = 1; i <= scenario.screenshotsCount; i++) {
				// 🔥 CHECK: Verifica antes de cada screenshot
				if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
					console.log(
						`🛑 [PARADA] Modo debug desativado - cancelando captura de screenshot ${i}/${scenario.screenshotsCount}`,
					);
					break;
				}

				console.log(`📸 [FASE-4A] Capturando screenshot ${i}/${scenario.screenshotsCount} REAL da resposta...`);
				await captureScreenshot();

				// Delay entre múltiplas capturas para respeitar cooldown de 2s do main.js
				if (i < scenario.screenshotsCount) {
					console.log(`   ⏳ Aguardando 2200ms antes da próxima captura (cooldown CAPTURE_COOLDOWN)...`);
					await new Promise(resolve => setTimeout(resolve, 2200));
				}
			}

			// 🔥 CHECK: Verifica antes de análise
			if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
				console.log('🛑 [PARADA] Modo debug desativado - cancelando análise de screenshots');
				break;
			}

			// Log de validação: quantas fotos tem antes de analisar
			console.log(
				`📸 [PRÉ-ANÁLISE] Total de screenshots em memória: ${capturedScreenshots.length}/${scenario.screenshotsCount}`,
			);

			// FASE 4B: Análise dos screenshots capturados
			console.log(`📸 [FASE-4B] Analisando ${scenario.screenshotsCount} screenshot(s)...`);
			await analyzeScreenshots();
		}

		mockScenarioIndex++;

		if (mockScenarioIndex < MOCK_SCENARIOS.length) {
			console.log(`\n⏳ Aguardando 1s antes do próximo cenário...\n`);
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}

	console.log('✅ Mock autoplay finalizado');
	mockAutoPlayActive = false;
}

/**
 * Inicializa o interceptor de IPC para modo mock
 * Deve ser chamado de renderer.js quando APP_CONFIG.MODE_DEBUG === true
 */
function initMockInterceptor(context) {
	// Define o contexto do renderer
	setRendererContext(context);

	const { ipcRenderer } = require('electron');

	const originalInvoke = ipcRenderer.invoke;
	ipcRenderer.invoke = function (channel, ...args) {
		// Intercepta análise de screenshots quando MODE_DEBUG
		// IMPORTANTE: CAPTURE_SCREENSHOT é REAL (tira foto mesmo), ANALYZE_SCREENSHOTS é MOCK (simula resposta)
		if (channel === 'ANALYZE_SCREENSHOTS' && APP_CONFIG.MODE_DEBUG) {
			console.log('📸 [MOCK] Interceptando ANALYZE_SCREENSHOTS...');
			const filepaths = args[0] || [];
			const screenshotCount = filepaths.length;

			// Retorna análise mockada
			const mockAnalysis = `
		## 📸 Análise de ${screenshotCount} Screenshot(s) - MOCK

		### Esta é uma resposta simulada para o teste do sistema.

		Para resolver o problema apresentado na captura de tela, que é o "Remove Element" do LeetCode, vamos implementar uma função em Java que remove todas as ocorrências de um valor específico de um array. A função deve modificar o array in-place e retornar o novo comprimento do array.

		Resumo do Problema
		Entrada: Um array de inteiros nums e um inteiro val que queremos remover.
		Saída: O novo comprimento do array após remover todas as ocorrências de val.
		Passos para a Solução
		Iterar pelo array: Vamos percorrer o array e verificar cada elemento.
		Manter um índice: Usaremos um índice para rastrear a posição onde devemos colocar os elementos que não são iguais a val.
		Modificar o array in-place: Sempre que encontrarmos um elemento que não é igual a val, colocamos esse elemento na posição do índice e incrementamos o índice.
		Retornar o comprimento: No final, o índice representará o novo comprimento do array.
		Implementação do Código
		Aqui está a implementação em Java:

		class Solution {
			public int removeElement(int[] nums, int val) {
				// Inicializa um índice para rastrear a nova posição
				int index = 0;

				// Percorre todos os elementos do array
				for (int i = 0; i &lt; nums.length; i++) {
					// Se o elemento atual não é igual a val
					if (nums[i] != val) {
						// Coloca o elemento na posição do índice
						nums[index] = nums[i];
						// Incrementa o índice
						index++;
					}
				}

				// Retorna o novo comprimento do array
				return index;
			}
		}

		Explicação do Código
		Classe e Método: Criamos uma classe chamada Solution e um método removeElement que recebe um array de inteiros nums e um inteiro val.
		Índice Inicial: Inicializamos uma variável index em 0.
		`;

			return Promise.resolve({
				success: true,
				analysis: mockAnalysis,
				filesAnalyzed: screenshotCount,
				timestamp: Date.now(),
			});
		}

		// Intercepta ask-gpt-stream quando MODE_DEBUG
		if (channel === 'ask-gpt-stream' && APP_CONFIG.MODE_DEBUG) {
			console.log('🎭 [MOCK] Interceptando ask-gpt-stream...');

			// Obtém a pergunta do primeiro argumento (array de mensagens)
			const messages = args[0] || [];
			const userMessage = messages.find(m => m.role === 'user');
			const questionText = userMessage ? userMessage.content : 'Pergunta desconhecida';

			// Busca resposta mockada
			const mockResponse = getMockResponse(questionText);

			// Divide em tokens (remove vazios)
			const tokens = mockResponse.split(/(\s+|[.,!?;:\-\(\)\[\]{}\n])/g).filter(t => t.length > 0);

			console.log(`🎭 [MOCK] Emitindo ${tokens.length} tokens para pergunta: "${questionText.substring(0, 50)}..."`);

			// Função para emitir tokens com pequeno delay entre eles
			async function emitTokens() {
				let accumulated = '';
				for (let i = 0; i < tokens.length; i++) {
					const token = tokens[i];
					accumulated += token;

					// Emite o evento com delay mínimo
					await new Promise(resolve => {
						setTimeout(() => {
							// ✅ CORRETO: Emite apenas o token como 2º argumento
							ipcRenderer.emit('GPT_STREAM_CHUNK', null, token);
							resolve();
						}, 5); // 5ms entre tokens
					});
				}

				// Sinaliza fim do stream após todos os tokens
				await new Promise(resolve => {
					setTimeout(() => {
						ipcRenderer.emit('GPT_STREAM_END');
						resolve();
					}, 10);
				});
			}

			// Inicia emissão de tokens de forma assíncrona
			emitTokens().catch(err => {
				console.error('❌ Erro ao emitir tokens mock:', err);
			});

			// Retorna promise resolvida imediatamente (esperado pela API)
			return Promise.resolve({ success: true });
		}

		// Todas as outras chamadas passam para o invoke real
		return originalInvoke.call(this, channel, ...args);
	};
}

// Exporta as funções para uso em renderer.js
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		MOCK_RESPONSES,
		MOCK_SCENARIOS,
		getMockResponse,
		runMockAutoPlay,
		initMockInterceptor,
		setRendererContext,
	};
}
