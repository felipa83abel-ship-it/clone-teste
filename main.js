/**
 *	🚀 Inicio do APP - main.js
 *
 *	Responsável por:
 *	- Inicializar a aplicação Electron
 *	- Criar a janela overlay principal
 *	- Gerenciar IPC handlers para comunicação com o renderer
 *	- Integrar com OpenAI API, Google Gemini e outros serviços
 *	- Capturar screenshots discretamente
 *	- Controlar comportamento da janela (click-through, drag, etc)
 *
 *	Como Usar no Futuro:
 *
 *	1. Precisa adicionar um novo handler?
 *		- Veja qual categoria ele pertence
 *		- Crie a função `handle[NomeHandler]()`
 *		- Adicione na função `register[Categoria]Handlers()`
 *		- Adicione a chamada em `registerIPCHandlers()`
 *
 *	2. Precisa entender um handler?
 *		- Procure pela função `handle[Nome]`
 *		- Leia o JSDoc
 *		- Veja a seção de registro para entender qual evento ativa
 *
 */

/* ================================ */
//	IMPORTS E CONFIGURAÇÕES INICIAIS
/* ================================ */

// Carrega variáveis de ambiente do .env
require('dotenv').config();

const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('node:fs');
const path = require('node:path');

// Habilita reload automático em desenvolvimento
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reload')(__dirname, {
      electron: require(`${__dirname}/node_modules/electron`),
    });
  } catch (err) {
    console.log('electron-reload não carregado:', err);
  }
}

// Importa electron-store para armazenamento seguro
let ElectronStore;
try {
  ElectronStore = require('electron-store');
  if (ElectronStore.default) {
    ElectronStore = ElectronStore.default;
  }
  console.log('✅ electron-store importado com sucesso');
} catch (error) {
  console.error('❌ Erro ao importar electron-store:', error);
  ElectronStore = null;
}

/* ================================ */
//	CONSTANTES
/* ================================ */

const USE_FAKE_STREAM_LLM = true; // 🤖 Mude para true para ativar os testes sem LLM real 🤖

/* ================================ */
//	ESTADO GLOBAL
/* ================================ */

let mainWindow = null;
let openaiClient = null;
let geminiClient = null;
let secureStore = null;
let clickThroughEnabled = false;

/* ================================ */
//	INICIALIZAÇÃO DO SECURE STORE
/* ================================ */

if (ElectronStore) {
  try {
    secureStore = new ElectronStore({
      name: 'secure-keys',
      encryptionKey: 'perssua-secure-storage-v1',
    });
    console.log('✅ SecureStore inicializado com sucesso');

    // Inicializa cliente OpenAI se houver chave salva
    const savedOpenAIKey = secureStore.get('apiKeys.openai');
    if (savedOpenAIKey && savedOpenAIKey.length > 10) {
      console.log('🔑 Chave OpenAI encontrada - inicializando cliente...');
      initializeOpenAIClient(savedOpenAIKey);
    }

    // Inicializa cliente Gemini se houver chave salva
    const savedGeminiKey = secureStore.get('apiKeys.google');
    if (savedGeminiKey && savedGeminiKey.length > 10) {
      console.log('🔑 Chave Gemini encontrada - inicializando cliente...');
      initializeGeminiClient(savedGeminiKey);
    }
  } catch (error) {
    console.error('❌ Erro ao criar secureStore:', error);
  }
}

/* ================================ */
//	FUNÇÕES AUXILIARES
/* ================================ */

// Inicializa o cliente OpenAI
function initializeOpenAIClient(apiKey = null) {
  try {
    const key = apiKey || (secureStore ? secureStore.get('apiKeys.openai') : null);

    if (!key || typeof key !== 'string' || key.trim().length < 10) {
      console.warn('⚠️ Chave da API inválida ou muito curta');
      openaiClient = null;
      return false;
    }

    const maskedKey = key.substring(0, 8) + '...';
    console.log(`---> Inicializando cliente OpenAI com chave: ${maskedKey}`);

    openaiClient = new OpenAI({
      apiKey: key.trim(),
    });

    console.log('✅ Cliente OpenAI inicializado com sucesso');
    return true;
  } catch (error) {
    console.error('❌ Erro ao inicializar cliente OpenAI:', error.message);
    openaiClient = null;
    return false;
  }
}

/**
 * Inicializa cliente Gemini (Google)
 * @param {string} apiKey - API key do Gemini (opcional, usa secureStore se não fornecido)
 * @returns {boolean} true se inicializado com sucesso
 */
function initializeGeminiClient(apiKey = null) {
  try {
    const key = apiKey || (secureStore ? secureStore.get('apiKeys.google') : null);

    if (!key || typeof key !== 'string' || key.trim().length < 10) {
      console.warn('⚠️ Chave Gemini inválida ou muito curta');
      geminiClient = null;
      return false;
    }

    const maskedKey = key.substring(0, 8) + '...';
    console.log(`---> Inicializando cliente Gemini com chave: ${maskedKey}`);

    geminiClient = new GoogleGenerativeAI(key.trim());

    console.log('✅ Cliente Gemini inicializado com sucesso');
    return true;
  } catch (error) {
    console.error('❌ Erro ao inicializar cliente Gemini:', error.message);
    geminiClient = null;
    return false;
  }
}

/* ================================ */
//	REGISTRO DE IPC HANDLERS
/* ================================ */

function registerIPCHandlers() {
  // Gerais
  registerGeneralHandlers();

  // API Keys
  registerApiKeyHandlers();

  // LLM (OpenAI + Gemini)
  registerLLMHandlers();

  // Controle de Janela
  registerWindowControlHandlers();

  // Screenshots
  registerScreenshotHandlers();

  // Fechamento
  registerAppCloseHandler();

  console.log('✅ Todos os handlers IPC registrados');
}

/* ================================ */
//	HANDLERS GERAIS
/* ================================ */

function registerGeneralHandlers() {
  // Reporta erros do renderer
  ipcMain.on('RENDERER_ERROR', handleRendererError);

  // Retorna status da inicialização do cliente OpenAI
  ipcMain.handle('GET_OPENAI_API_STATUS', handleGetOpenAIApiStatus);
}

/**
 * Log de erros reportados pelo renderer
 * @param {Event} _ - Evento IPC
 * @param {Object} info - Informações do erro
 */
function handleRendererError(_, info) {
  console.error('Renderer reported error:', info && (info.message || info));
  if (info?.stack) console.error(info.stack);
}

/**
 * Retorna se o cliente OpenAI está inicializado
 * @returns {Object} Status do cliente
 */
function handleGetOpenAIApiStatus() {
  return {
    initialized: !!openaiClient,
  };
}

/* ================================ */
//	HANDLERS DE API KEYS
/* ================================ */

function registerApiKeyHandlers() {
  // Verifica se há API key salva
  ipcMain.handle('HAS_API_KEY', handleHasApiKey);

  // Recupera API key (sem revelar valor completo)
  ipcMain.handle('GET_API_KEY', handleGetApiKey);

  // Salva API key no secure store
  ipcMain.handle('SAVE_API_KEY', handleSaveApiKey);

  // Remove API key do secure store
  ipcMain.handle('DELETE_API_KEY', handleDeleteApiKey);

  // Inicializa cliente OpenAI com chave fornecida
  ipcMain.handle('initialize-api-client', handleInitializeApiClient);
}

/**
 * Verifica se existe API key para um provedor
 * @param {Event} _ - Evento IPC
 * @param {string} provider - Provedor (ex: 'openai')
 * @returns {Object} {hasKey: boolean, provider: string}
 */
async function handleHasApiKey(_, provider) {
  try {
    const key = secureStore.get(`apiKeys.${provider}`);
    return {
      hasKey: !!key && key.length > 10,
      provider,
    };
  } catch (error) {
    console.error('❌ Erro ao verificar API key:', error);
    return { hasKey: false, provider };
  }
}

/**
 * Recupera a API key para um provedor
 * @param {Event} _ - Evento IPC
 * @param {string} provider - Provedor (ex: 'openai')
 * @returns {string|null} A chave da API ou null
 */
async function handleGetApiKey(_, provider) {
  try {
    const key = secureStore.get(`apiKeys.${provider}`);
    return key || null;
  } catch (error) {
    console.error(`❌ Erro ao recuperar chave de ${provider}:`, error);
    return null;
  }
}

/**
 * Salva a API key no secure store e inicializa cliente se necessário
 * @param {Event} _ - Evento IPC
 * @param {Object} data - {provider: string, apiKey: string}
 * @returns {Object} {success: boolean, provider: string, error?: string}
 */
async function handleSaveApiKey(_, { provider, apiKey }) {
  try {
    if (!apiKey || apiKey.trim().length < 2) {
      return { success: false, error: 'API key inválida' };
    }

    const trimmedKey = apiKey.trim();
    secureStore.set(`apiKeys.${provider}`, trimmedKey);

    // Se for OpenAI, inicializa cliente imediatamente
    if (provider === 'openai') {
      const success = initializeOpenAIClient(trimmedKey);
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('API_KEY_UPDATED', !!success);
      }
      return { success, provider };
    }

    // Se for Google/Gemini, inicializa cliente imediatamente
    if (provider === 'google') {
      const success = initializeGeminiClient(trimmedKey);
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('API_KEY_UPDATED', !!success);
      }
      return { success, provider };
    }

    return { success: true, provider };
  } catch (error) {
    console.error('Erro ao salvar API key:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a API key do secure store
 * @param {Event} _ - Evento IPC
 * @param {string} provider - Provedor (ex: 'openai')
 * @returns {Object} {success: boolean, provider: string, error?: string}
 */
async function handleDeleteApiKey(_, provider) {
  try {
    secureStore.delete(`apiKeys.${provider}`);

    // Se for OpenAI, desconecta cliente
    if (provider === 'openai') {
      openaiClient = null;
    }

    // Se for Google/Gemini, desconecta cliente
    if (provider === 'google') {
      geminiClient = null;
    }

    return { success: true, provider };
  } catch (error) {
    console.error('❌ Erro ao deletar API key:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Inicializa cliente OpenAI com API key fornecida
 * @param {Event} _ - Evento IPC
 * @param {string} apiKey - Chave da API OpenAI
 * @returns {Object} {initialized: boolean}
 */
async function handleInitializeApiClient(_, apiKey) {
  const initialized = initializeOpenAIClient(apiKey);
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('API_KEY_UPDATED', !!initialized);
  }
  return { initialized };
}

/* ================================ */
//	HANDLERS DE LLM (OpenAI + Gemini)
/* ================================ */

function registerLLMHandlers() {
  // OpenAI handlers
  ipcMain.handle('ask-llm', handleAskLLM);
  ipcMain.handle('ask-llm-stream', handleAskLLMStream);

  // Gemini handlers
  ipcMain.handle('ask-gemini', handleAskGemini);
  ipcMain.handle('ask-gemini-stream', handleAskGeminiStream);
}

/**
 * Garante que o cliente OpenAI está inicializado
 * @throws {Error} Se a chave não estiver configurada
 */
async function ensureOpenAIClient() {
  if (!openaiClient) {
    console.log('⚠️ Cliente OpenAI não inicializado, tentando recuperar...');
    const initialized = initializeOpenAIClient();
    if (!initialized) {
      throw new Error('OpenAI API key não configurada. Configure em "API e Modelos" → OpenAI.');
    }
  }
}

/**
 * Garante que o cliente Gemini está inicializado
 * @throws {Error} Se a chave não estiver configurada
 */
async function ensureGeminiClient() {
  if (!geminiClient) {
    console.log('⚠️ Cliente Gemini não inicializado, tentando recuperar...');
    const initialized = initializeGeminiClient();
    if (!initialized) {
      throw new Error(
        'Google API key não configurada. Configure em "API e Modelos" → Google Gemini.'
      );
    }
  }
}

/**
 * Obtém resposta do LLM para uma lista de mensagens
 * @param {Event} _ - Evento IPC
 * @param {Array} messages - Histórico de mensagens
 * @returns {string} Resposta do modelo
 */
async function handleAskLLM(_, messages) {
  await ensureOpenAIClient();

  try {
    let response;

    if (USE_FAKE_STREAM_LLM) {
      response = { choices: [{ message: { content: 'Resposta mockada só para teste 🚀' } }] };
    } else {
      response = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.3,
      });
    }

    return response.choices[0].message.content;
  } catch (error) {
    console.error('❌ Erro no LLM:', error.message);
    if (error.status === 401 || error.message.includes('authentication')) {
      openaiClient = null;
      throw new Error('Chave da API inválida para LLM. Verifique as configurações.');
    }
    throw error;
  }
}

/**
 * Obtém resposta do LLM com streaming de tokens
 * Envia eventos 'LLM_STREAM_CHUNK' e 'LLM_STREAM_END' ao renderer
 * @param {Event} event - Evento IPC com referência à janela
 * @param {Array} messages - Histórico de mensagens
 */
async function handleAskLLMStream(event, messages) {
  const win = BrowserWindow.fromWebContents(event.sender);

  try {
    await ensureOpenAIClient();
  } catch (error) {
    win.webContents.send('LLM_STREAM_ERROR', error.message);
    return;
  }

  try {
    let stream;

    if (USE_FAKE_STREAM_LLM) {
      stream = fakeStreamLLM();
    } else {
      stream = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.3,
        stream: true,
      });
    }

    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) {
        win.webContents.send('LLM_STREAM_CHUNK', token);
      }
    }

    win.webContents.send('LLM_STREAM_END');
  } catch (error) {
    console.error('❌ Erro no stream LLM:', error.message);
    if (error.status === 401 || error.message.includes('authentication')) {
      openaiClient = null;
      win.webContents.send(
        'LLM_STREAM_ERROR',
        'Chave da API inválida. Configure na seção "API e Modelos".'
      );
    } else {
      win.webContents.send('LLM_STREAM_ERROR', error.message);
    }
  }
}

/**
 * Obtém resposta do Gemini para uma lista de mensagens
 * @param {Event} _ - Evento IPC
 * @param {Array} messages - Histórico de mensagens
 * @returns {string} Resposta do modelo
 */
async function handleAskGemini(_, messages) {
  await ensureGeminiClient();

  try {
    const model = geminiClient.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Formata mensagens para Gemini
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const chatSession = model.startChat({
      history: userMessages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      systemInstruction: systemMessage ? systemMessage.content : undefined,
    });

    const lastMessage = userMessages.at(-1).content;
    const result = await chatSession.sendMessage(lastMessage);
    return result.response.text();
  } catch (error) {
    console.error('❌ Erro no Gemini:', error.message);
    if (error.message.includes('API_KEY_INVALID') || error.message.includes('authenticated')) {
      geminiClient = null;
      throw new Error('Chave da API inválida para Gemini. Verifique as configurações.');
    }
    throw error;
  }
}

/**
 * Obtém resposta do Gemini com streaming de tokens
 * @param {Event} event - Evento IPC
 * @param {Array} messages - Histórico de mensagens
 */
async function handleAskGeminiStream(event, messages) {
  const win = BrowserWindow.fromWebContents(event.sender);

  try {
    await ensureGeminiClient();
  } catch (error) {
    win.webContents.send('LLM_STREAM_ERROR', error.message);
    return;
  }

  try {
    const model = geminiClient.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Formata mensagens para Gemini
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const chatSession = model.startChat({
      history: userMessages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      systemInstruction: systemMessage ? systemMessage.content : undefined,
    });

    const lastMessage = userMessages.at(-1).content;
    const result = await chatSession.sendMessageStream(lastMessage);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        win.webContents.send('LLM_STREAM_CHUNK', text);
      }
    }

    win.webContents.send('LLM_STREAM_END');
  } catch (error) {
    console.error('❌ Erro no stream Gemini:', error.message);
    if (error.message.includes('API_KEY_INVALID') || error.message.includes('authenticated')) {
      geminiClient = null;
      win.webContents.send('LLM_STREAM_ERROR', 'Chave da API inválida para Gemini.');
    } else {
      win.webContents.send('LLM_STREAM_ERROR', error.message);
    }
  }
}

/**
 * Simula um stream de resposta do LLM (para testes)
 * @returns {AsyncGenerator} Gerador de chunks simulados
 */
async function* fakeStreamLLM() {
  const response = 'Olá Thiago! Isso é um mock de resposta simulando o LLM 🚀';
  const chunks = response.match(/.{1,8}/g);

  for (const chunk of chunks) {
    const delay = 50 + Math.random() * 150;
    await new Promise((r) => setTimeout(r, delay));
    yield { choices: [{ delta: { content: chunk } }] };
  }
}

/* ================================ */
//	HANDLERS DE CONTROLE DE JANELA
/* ================================ */

function registerWindowControlHandlers() {
  // Ativa/desativa click-through
  ipcMain.on('SET_CLICK_THROUGH', handleSetClickThrough);
  ipcMain.handle('GET_CLICK_THROUGH', handleGetClickThrough);

  // Ativa/desativa zona interativa
  ipcMain.on('SET_INTERACTIVE_ZONE', handleSetInteractiveZone);

  // Controla movimento e drag da janela
  ipcMain.on('START_WINDOW_DRAG', handleStartWindowDrag);
  ipcMain.on('MOVE_WINDOW_TO', handleMoveWindowTo);

  // Retorna informações da janela
  ipcMain.handle('GET_WINDOW_BOUNDS', handleGetWindowBounds);
  ipcMain.handle('GET_CURSOR_SCREEN_POINT', handleGetCursorScreenPoint);
}

/**
 * Ativa ou desativa click-through (permite cliques passarem pela janela)
 * @param {Event} _ - Evento IPC
 * @param {boolean} enabled - true para ativar, false para desativar
 */
function handleSetClickThrough(_, enabled) {
  clickThroughEnabled = enabled;
  mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
  console.log('🖱️ Click-through:', enabled ? 'ATIVADO' : 'DESATIVADO');
}

/**
 * Retorna o estado atual do click-through
 * @returns {boolean} true se click-through está ativado
 */
function handleGetClickThrough() {
  return clickThroughEnabled;
}

/**
 * Ativa ou desativa zona interativa (com base no click-through)
 * @param {Event} _ - Evento IPC
 * @param {boolean} isInteractive - true para ativar interatividade
 */
function handleSetInteractiveZone(_, isInteractive) {
  if (clickThroughEnabled) {
    mainWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
  }
}

/**
 * Inicia o arraste (drag) da janela
 * @param {Event} _ - Evento IPC
 */
function handleStartWindowDrag() {
  if (!mainWindow) return;
  mainWindow.moveTop();
  mainWindow.startDrag?.();
}

/**
 * Move a janela para uma posição específica
 * @param {Event} _ - Evento IPC
 * @param {Object} data - {x: number, y: number}
 */
function handleMoveWindowTo(_, { x, y }) {
  if (!mainWindow) return;
  try {
    const b = mainWindow.getBounds();
    mainWindow.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: b.width,
      height: b.height,
    });
  } catch (err) {
    console.warn('MOVE_WINDOW_TO falhou:', err);
  }
}

/**
 * Retorna os limites (posição e tamanho) da janela
 * @returns {Object|null} Bounds da janela ou null
 */
function handleGetWindowBounds() {
  return mainWindow ? mainWindow.getBounds() : null;
}

/**
 * Retorna a posição atual do cursor na tela
 * @returns {Object} {x: number, y: number}
 */
function handleGetCursorScreenPoint() {
  try {
    const { screen } = require('electron');
    return screen.getCursorScreenPoint();
  } catch (err) {
    console.error('Erro ao obter posição do cursor:', err);
    return { x: 0, y: 0 };
  }
}

/* ================================ */
//	HANDLERS DE SCREENSHOTS
/* ================================ */

const { desktopCapturer } = require('electron');

let lastCaptureTime = 0;
const CAPTURE_COOLDOWN = 2000; // 2 segundos
const SCREENSHOT_RETENTION = 5 * 60 * 1000; // 5 minutos

function registerScreenshotHandlers() {
  // Captura screenshot da tela
  ipcMain.handle('CAPTURE_SCREENSHOT', handleCaptureScreenshot);

  // Analisa screenshot com visão computacional
  ipcMain.handle('ANALYZE_SCREENSHOTS', handleAnalyzeScreenshots);

  // Limpeza manual de screenshots antigos
  ipcMain.handle('CLEANUP_SCREENSHOTS', handleCleanupScreenshots);
}

/**
 * Captura screenshot da tela mantendo a janela invisível
 * Implementa cooldown para evitar abuso
 * @returns {Object} {success: boolean, filepath?: string, filename?: string, error?: string}
 */
async function handleCaptureScreenshot() {
  const now = Date.now();

  // Verifica cooldown
  if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
    const waitTime = Math.ceil((CAPTURE_COOLDOWN - (now - lastCaptureTime)) / 1000);
    return {
      success: false,
      error: `Aguarde ${waitTime}s antes de capturar novamente`,
    };
  }

  const originalOpacity = mainWindow?.getOpacity() ?? 1;

  try {
    console.log('📸 Iniciando captura de tela discreta...');

    // Torna a janela invisível durante a captura
    if (mainWindow) {
      mainWindow.setOpacity(0);
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      console.log('👻 Janela invisível (opacity=0 + ignoreMouseEvents)');
    }

    // Aguarda sincronização com o compositor
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Captura a tela usando desktopCapturer
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (!sources || sources.length === 0) {
      console.error('❌ Nenhuma tela encontrada');
      return { success: false, error: 'Nenhuma tela encontrada' };
    }

    // Obtém o PNG da tela principal
    const screenshot = sources[0].thumbnail.toPNG();

    // Salva no diretório temp
    const tempDir = app.getPath('temp');
    const timestamp = Date.now();
    const filename = `my-screenshot-${timestamp}.png`;
    const filepath = path.join(tempDir, filename);

    fs.writeFileSync(filepath, screenshot);
    console.log(`✅ Screenshot salvo: ${filepath} (${Math.round(screenshot.length / 1024)}KB)`);

    lastCaptureTime = now;

    return {
      success: true,
      filepath,
      filename,
      size: screenshot.length,
      timestamp,
    };
  } catch (error) {
    console.error('❌ Erro ao capturar screenshot:', error);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // Restaura janela sempre
    if (mainWindow) {
      mainWindow.setOpacity(originalOpacity);
      mainWindow.setIgnoreMouseEvents(false);
      console.log(`👀 Janela restaurada (opacity=${originalOpacity})`);
    }
  }
}

/**
 * Analisa screenshots usando OpenAI Vision (gpt-4o-mini)
 * Extrai código e gera comentários explicativos em português
 * @param {Event} _ - Evento IPC
 * @param {Array<string>} screenshotPaths - Caminhos dos screenshots para analisar
 * @returns {Object} {success: boolean, analysis?: string, error?: string}
 */
async function handleAnalyzeScreenshots(_, screenshotPaths) {
  try {
    await ensureOpenAIClient();

    if (!screenshotPaths || screenshotPaths.length === 0) {
      return {
        success: false,
        error: 'Nenhum screenshot para analisar',
      };
    }

    console.log(`🔍 Analisando ${screenshotPaths.length} screenshot(s)...`);

    // Converte screenshots para base64
    const images = screenshotPaths
      .map((filepath) => {
        if (!fs.existsSync(filepath)) {
          console.warn(`⚠️ Screenshot não encontrado: ${filepath}`);
          return null;
        }

        const buffer = fs.readFileSync(filepath);
        const base64 = buffer.toString('base64');
        console.log(
          `  ✓ Carregado: ${path.basename(filepath)} (${Math.round(buffer.length / 1024)}KB)`
        );

        return {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64}`,
          },
        };
      })
      .filter(Boolean);

    if (images.length === 0) {
      return {
        success: false,
        error: 'Nenhum screenshot válido encontrado',
      };
    }

    // Monta prompt para análise
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analise a captura de tela. Se houver código, forneça APENAS o código com comentários em português explicando cada linha. NÃO inclua explicações textuais adicionais, resumos ou introduções. Use Java como padrão se a linguagem não for identificável. Formato: apenas código + comentários. Mantenha espaço de uma linha se a proxima linha for um novo bloco de comentário + código para facilitar o entendimento. ',
          },
          ...images,
        ],
      },
    ];

    let response;

    if (USE_FAKE_STREAM_LLM) {
      response = { choices: [{ message: { content: 'Resposta mockada só para teste 🚀' } }] };
    } else {
      response = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 2000,
        temperature: 0.3,
      });
    }

    const analysis = response.choices[0].message.content;

    // Limpa screenshots antigos
    handleCleanupScreenshots();

    return {
      success: true,
      analysis,
    };
  } catch (error) {
    console.error('❌ Erro ao analisar screenshots:', error);

    if (error.status === 401) {
      return {
        success: false,
        error: 'API key inválida ou expirada',
      };
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Remove screenshots antigos (> 5 minutos) do diretório temp
 * @returns {Object} {success: boolean, cleaned: number, error?: string}
 */
async function handleCleanupScreenshots() {
  try {
    const tempDir = app.getPath('temp');

    if (!fs.existsSync(tempDir)) {
      return { success: true, cleaned: 0 };
    }

    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    let cleaned = 0;

    files.forEach((file) => {
      if (file.startsWith('my-screenshot-')) {
        const filepath = path.join(tempDir, file);

        try {
          const stats = fs.statSync(filepath);
          const age = now - stats.mtimeMs;

          // Remove se mais antigo que 5 minutos
          if (age > SCREENSHOT_RETENTION) {
            fs.unlinkSync(filepath);
            cleaned++;
            console.log(`🗑️ Screenshot removido: ${file}`);
          }
        } catch (err) {
          console.warn(`⚠️ Erro ao processar ${file}:`, err.message);
        }
      }
    });

    if (cleaned > 0) {
      console.log(`✅ Limpeza concluída: ${cleaned} arquivo(s) removido(s)`);
    }

    return { success: true, cleaned };
  } catch (error) {
    console.error('❌ Erro na limpeza:', error);
    return { success: false, error: error.message };
  }
}

/* ================================ */
//	HANDLER DE FECHAMENTO
/* ================================ */

function registerAppCloseHandler() {
  // Encerra a aplicação via IPC
  ipcMain.on('APP_CLOSE', handleAppClose);
}

/**
 * Encerra a aplicação
 * @param {Event} _ - Evento IPC
 */
function handleAppClose() {
  console.log('❌ APP_CLOSE recebido — encerrando aplicação');
  app.quit();
}

/* ================================ */
//	CRIAÇÃO DA JANELA
/* ================================ */

function createWindow() {
  console.log('🪟 Criando janela principal (frameless)');

  mainWindow = new BrowserWindow({
    width: 1220, // Largura padrão (820 ou 1220)
    height: 620, // Altura padrão (620)
    x: 0, // Posição X inicial (horizontal)
    y: 0, // Posição Y inicial (vertical)

    transparent: true, // Permite fundo transparente
    backgroundColor: '#00000000', // Fundo totalmente transparente
    frame: false, // Sem bordas (frameless)
    hasShadow: false, // Sem sombras

    skipTaskbar: true, // Não aparece na barra de tarefas
    // focusable: false, // Não recebe foco (reduz detectabilidade)
    alwaysOnTop: true, // Janela sempre acima das outras
    alwaysOnTopLevel: 'screen-saver', // Nível mais alto

    thickFrame: false, // Otimizações de performance
    paintWhenInitiallyHidden: false, // NÃO renderizar antes de estar visível

    resizable: true, // Redimensionável
    minimizable: false, // Não minimizável
    maximizable: false, // Não maximizável
    //fullscreen: true, // Permite fullscreen
    closable: true, // Fechável

    webPreferences: {
      nodeIntegration: true, // Permite Node.js no renderer
      contextIsolation: false, // Desativa isolamento de contexto
      backgroundThrottling: false, // mantém execução mesmo em segundo plano
      enableBlinkFeatures: 'MediaSessionAPI', // Minimiza exposição de MediaSource
    },
  });

  // 🔥 FLAG ESPECIAL DO WINDOWS
  mainWindow.setMenu(null); // Remove menu padrão
  mainWindow.setContentProtection(true); // protege contra captura externa

  // Para macOS/Linux:
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });

  // Carrega a página principal
  mainWindow.loadFile('index.html');

  console.log('🪟 Janela criada em modo overlay');

  // Eventos da janela
  mainWindow.on('closed', () => {
    console.log('❌ Janela principal fechada');
  });
}

/* ================================ */
//	INICIALIZAÇÃO DO APP
/* ================================ */

// NOSONAR javascript:S7785
// eslint-disable-next-line prefer-top-level-await
app.whenReady().then(() => {
  // Registra todos os handlers IPC
  registerIPCHandlers();

  // Cria a janela principal
  createWindow();

  // Registra atalhos globais
  registerGlobalShortcuts();

  console.log('✅ Aplicação inicializada com sucesso');
});

/**
 * Registra atalhos globais do sistema (Ctrl+D, Ctrl+Enter, etc)
 */
function registerGlobalShortcuts() {
  // 🛠️ DevTools em desenvolvimento
  if (!app.isPackaged) {
    globalShortcut.register('Control+Shift+I', () => {
      mainWindow.webContents.toggleDevTools();
      console.log('🛠️ DevTools acionado via Ctrl+Shift+I');
    });
  }

  // Começar/parar de ouvir (Ctrl+D)
  globalShortcut.register('Control+D', () => {
    mainWindow.webContents.send('CMD_TOGGLE_AUDIO');
  });

  // Enviar pergunta ao LLM (Ctrl+Enter)
  globalShortcut.register('Control+Enter', () => {
    mainWindow.webContents.send('CMD_ASK_LLM');
  });

  // Navegação de histórico de perguntas (Ctrl+Shift+ArrowUp)
  globalShortcut.register('Control+Shift+Up', () => {
    mainWindow.webContents.send('CMD_NAVIGATE_QUESTIONS', 'up');
  });

  // Navegação de histórico de perguntas (Ctrl+Shift+ArrowDown)
  globalShortcut.register('Control+Shift+Down', () => {
    mainWindow.webContents.send('CMD_NAVIGATE_QUESTIONS', 'down');
  });

  // 📸 Capturar screenshot (Ctrl+Shift+F)
  globalShortcut.register('Control+Shift+F', () => {
    mainWindow.webContents.send('CMD_CAPTURE_SCREENSHOT');
  });

  // 🔍 Analisar screenshots (Ctrl+Shift+G)
  globalShortcut.register('Control+Shift+G', () => {
    mainWindow.webContents.send('CMD_ANALYZE_SCREENSHOTS');
  });

  console.log('✅ Atalhos globais registrados');
}

/* ================================ */
//	FINALIZAÇÃO DO APP
/* ================================ */

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  console.log('👋 Aplicação encerrada');
});
