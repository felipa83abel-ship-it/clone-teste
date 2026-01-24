/**
 * MOCK RUNNER - Sistema de testes automatizados
 *
 * Isolado de renderer.js para facilitar remoção em produção
 * Ativado apenas quando APP_CONFIG.MODE_DEBUG === true
 *
 * Responsabilidades:
 * - Simular perguntas e respostas de IA
 * - Interceptar IPC para ANALYZE_SCREENSHOTS e ask-llm-stream
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
 * Simula FASE 1: Captura de áudio da pergunta
 */
async function simulateAudioCapture(eventBus, scenario, placeholderId) {
  console.log(`🎤 [FASE-1] Capturando áudio da pergunta...`);
  const audioStartTime = Date.now();

  eventBus.emit('transcriptAdd', {
    author: 'Outros',
    text: '...',
    timeStr: new Date().toLocaleTimeString(),
    elementId: 'conversation',
    placeholderId: placeholderId,
  });

  await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 2000));
  const audioEndTime = Date.now();

  const latencyMs = Math.round(800 + Math.random() * 400);
  const totalMs = audioEndTime - audioStartTime + latencyMs;

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

  console.log(`✅ [FASE-1] Áudio capturado`);
  return true;
}

/**
 * Simula FASE 2-3: Processa pergunta e aguarda resposta
 */
async function simulateQuestionProcessing(APP_CONFIG, mockAutoPlayActive) {
  console.log(`📝 [FASE-2] Processando pergunta...`);
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
    console.log('🛑 [PARADA] Modo debug desativado - parando mock autoplay');
    return false;
  }

  console.log(`🔇 [FASE-2] Silêncio detectado, fechando pergunta...`);
  console.log(`🤖 [FASE-3] askLlm acionado - mock stream será emitido pelo interceptor`);

  return true;
}

/**
 * Aguarda resposta do mock stream
 */
async function waitForMockResponse(scenario) {
  const mockResponse = getMockResponse(scenario.question);
  const estimatedTime = mockResponse.length * 30;
  await new Promise((resolve) => setTimeout(resolve, estimatedTime + 1000));
  return mockResponse;
}

/**
 * Captura múltiplos screenshots da resposta
 */
async function captureScenarioScreenshots(
  scenario,
  APP_CONFIG,
  mockAutoPlayActive,
  captureScreenshot
) {
  if (!scenario.screenshotsCount || scenario.screenshotsCount <= 0) return true;

  for (let i = 1; i <= scenario.screenshotsCount; i++) {
    if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
      console.log(`🛑 [PARADA] Captura de screenshot ${i}/${scenario.screenshotsCount} cancelada`);
      return false;
    }

    console.log(`📸 [FASE-4A] Capturando screenshot ${i}/${scenario.screenshotsCount}...`);
    await captureScreenshot();

    if (i < scenario.screenshotsCount) {
      await new Promise((resolve) => setTimeout(resolve, 2200)); // Cooldown entre capturas
    }
  }

  return true;
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
      }\n🎬 ════════════════════════════════════════════════════════`
    );

    // Simula FASE 1: Captura de áudio
    const placeholderId = `placeholder-${Date.now()}-${Math.random()}`;
    await simulateAudioCapture(eventBus, scenario, placeholderId);

    // 🔥 CHECK: Continua se debug ainda está ativo
    if (!(await simulateQuestionProcessing(APP_CONFIG, mockAutoPlayActive))) {
      break;
    }

    // Aguarda resposta do mock stream
    await waitForMockResponse(scenario);

    // 🔥 CHECK: Se modo debug foi desativado, para imediatamente SEM TIRAR SCREENSHOT
    if (!APP_CONFIG.MODE_DEBUG || !mockAutoPlayActive) {
      console.log('🛑 [PARADA] Modo debug desativado - parando sem capturar screenshot');
      break;
    }

    // FASE 4 (Opcional): Captura N screenshots REAIS e depois aciona análise
    const screenshotsOk = await captureScenarioScreenshots(
      scenario,
      APP_CONFIG,
      mockAutoPlayActive,
      captureScreenshot
    );
    if (!screenshotsOk) break;

    // FASE 4B: Análise dos screenshots capturados
    if (scenario.screenshotsCount && scenario.screenshotsCount > 0) {
      console.log(`📸 [FASE-4B] Analisando ${scenario.screenshotsCount} screenshot(s)...`);
      await analyzeScreenshots();
    }

    mockScenarioIndex++;

    if (mockScenarioIndex < MOCK_SCENARIOS.length) {
      console.log(`\n⏳ Aguardando 1s antes do próximo cenário...\n`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
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

    // Intercepta ask-llm-stream quando MODE_DEBUG
    if (channel === 'ask-llm-stream' && APP_CONFIG.MODE_DEBUG) {
      console.log('🎭 [MOCK] Interceptando ask-llm-stream...');

      // Obtém a pergunta do primeiro argumento (array de mensagens)
      const messages = args[0] || [];
      const userMessage = messages.find((m) => m.role === 'user');
      const questionText = userMessage ? userMessage.content : 'Pergunta desconhecida';

      // Busca resposta mockada
      const mockResponse = getMockResponse(questionText);

      // Emite tokens com delays
      emitTokensFromResponse(mockResponse).catch((err) => {
        console.error('❌ Erro ao emitir tokens mock:', err);
      });

      // Retorna promise resolvida imediatamente (esperado pela API)
      return Promise.resolve({ success: true });
    }

    // Todas as outras chamadas passam para o invoke real
    return originalInvoke.call(this, channel, ...args);
  };
}

/**
 * Emite tokens de uma resposta mockada com delays (simula streaming)
 * @param {string} response - Texto completo da resposta
 */
async function emitTokensFromResponse(response) {
  const { ipcRenderer } = require('electron');
  // Quebra o texto em pequenos pedaços (chunks) de 1 a 5 caracteres
  const chunks = response.match(/.{1,5}/g) || [];

  for (const chunk of chunks) {
    const delay = 20 + Math.random() * 60; // Delay variável para parecer humano
    await new Promise((resolve) => setTimeout(resolve, delay));

    // 🔥 Emite o evento localmente (os handlers estão ouvindo no ipcRenderer)
    ipcRenderer.emit('LLM_STREAM_CHUNK', {}, chunk);
  }

  // Finaliza o stream
  ipcRenderer.emit('LLM_STREAM_END');
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
