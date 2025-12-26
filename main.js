/* ===============================
   IMPORTS
=============================== */
if (process.env.NODE_ENV === 'development') {
	try {
		require('electron-reload')(__dirname, {
			electron: require(`${__dirname}/node_modules/electron`),
			// 🔥 IGNORA ARQUIVOS TEMPORÁRIOS E DE ÁUDIO
			// ignored: [/temp-audio.*\.webm$/, /node_modules|[/\\]\./],
		});
	} catch (err) {
		console.log('electron-reload não carregado:', err);
	}
}
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// 🔥 Import alternativo do electron-store
let ElectronStore;
try {
	ElectronStore = require('electron-store');
	// Tenta acessar como default export se necessário
	if (ElectronStore.default) {
		ElectronStore = ElectronStore.default;
	}
	console.log('✅ electron-store importado com sucesso:', typeof ElectronStore);
} catch (error) {
	console.error('❌ Erro ao importar electron-store:', error);
	ElectronStore = null;
}

/* ===============================
   CONSTANTES
=============================== */

const APP_CONFIG = {
	MODE_DEBUG: false, // 🔒 true, não envia ao  GPT só simula
};

/* ===============================
   ESTADO GLOBAL
=============================== */

let mainWindow;
let openaiClient = null;
let secureStore = null; // 🔥 NOVO: Store seguro para API keys (criptografado)

// =======================================================
// 🔥 CONTROLE GLOBAL DE MODO DEV (MANUAL)
// true  = comportamento DEV (click-through desligado)
// false = comportamento PROD (click-through ligado)
// =======================================================

/* ===============================
   HELPERS PUROS
=============================== */

if (ElectronStore) {
	try {
		secureStore = new ElectronStore({
			name: 'secure-keys',
			encryptionKey: 'perssua-secure-storage-v1',
		});
		console.log('✅ SecureStore inicializado com sucesso');

		// 🔥 CORRIGIDO: Inicializa cliente OpenAI com chave do secure store
		const savedKey = secureStore.get('apiKeys.openai');
		if (savedKey && savedKey.length > 10) {
			console.log('🔑 Chave OpenAI encontrada no secure store - inicializando cliente...');
			initializeOpenAIClient(savedKey);
		} else {
			console.log('⚠️ Nenhuma chave OpenAI salva - cliente não inicializado');
		}
	} catch (error) {
		console.error('❌ Erro ao criar secureStore:', error);
	}
} else {
	console.warn('⚠️ electron-store não disponível - usando localStorage como fallback');
}

function createWindow() {
	console.log('🪟 Criando janela principal (frameless)');

	mainWindow = new BrowserWindow({
		width: 1220, //820
		height: 620,
		x: 0, // posição horizontal (0 = extremo esquerdo da tela)
		y: 0, // posição vertical (0 = topo da tela)

		// 🔥 REMOVE COMPLETAMENTE A MOLDURA NATIVA
		frame: false,

		// 🔥 OVERLAY REAL
		transparent: true,
		backgroundColor: '#00000000',

		// sempre visível
		alwaysOnTop: true,

		// mantém comportamento atual
		resizable: true,
		minimizable: false, // overlay não precisa minimizar
		maximizable: false, // overlay não precisa maximizar
		closable: true,

		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});
	console.log('🪟 Janela criada em modo overlay (transparente + alwaysOnTop)');

	// remove menu padrão (Windows/Linux)
	mainWindow.setMenu(null);

	// Atalho para abrir DevTools (somente em desenvolvimento)
	if (!app.isPackaged) {
		mainWindow.webContents.on('before-input-event', (event, input) => {
			if (input.control && input.shift && input.key.toLowerCase() === 'i') {
				mainWindow.webContents.toggleDevTools();
				event.preventDefault();
			}
		});
	}

	mainWindow.loadFile('index.html');

	// *******************************************************
	// 🔥 CLICK-THROUGH: Estado inicial (desativado)
	let clickThroughEnabled = false;

	// 🔥 IPC: Ativa/desativa click-through
	ipcMain.on('SET_CLICK_THROUGH', (_, enabled) => {
		clickThroughEnabled = enabled;
		mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
		console.log('🖱️ Click-through:', enabled ? 'ATIVADO' : 'DESATIVADO');
	});

	// 🔥 IPC: Retorna estado atual
	ipcMain.handle('GET_CLICK_THROUGH', () => clickThroughEnabled);

	// 🔥 IPC: Permite interação temporária em zonas interativas
	ipcMain.on('SET_INTERACTIVE_ZONE', (_, isInteractive) => {
		if (clickThroughEnabled) {
			mainWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
		}
	});

	// *******************************************************

	// log temporário de debug
	mainWindow.on('closed', () => {
		console.log('❌ Janela principal fechada');
	});
}

// 🔥 usa secure store se apiKey não for fornecida
function initializeOpenAIClient(apiKey = null) {
	try {
		// 🔥 CORRIGIDO: Se não recebeu apiKey, tenta pegar do secure store
		const key = apiKey || (secureStore ? secureStore.get('apiKeys.openai') : null);

		if (!key || typeof key !== 'string' || key.trim().length < 10) {
			console.warn('⚠️ Chave da API inválida ou muito curta');
			openaiClient = null;
			return false;
		}

		// 🔥 DEBUG: Mostra apenas primeiros 8 caracteres por segurança
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

// 🔥 Recupera API key de forma segura (apenas para uso interno do main process)
function getSecureApiKey(provider) {
	try {
		const key = secureStore.get(`apiKeys.${provider}`);
		return key || null;
	} catch (error) {
		console.error(`❌ Erro ao recuperar API key de ${provider}:`, error);
		return null;
	}
}

/* ===============================
   ATALHOS GLOBAIS
=============================== */
app.whenReady().then(() => {
	createWindow();

	globalShortcut.register('Control+D', () => {
		mainWindow.webContents.send('CMD_TOGGLE_AUDIO');
	});

	globalShortcut.register('Control+Enter', () => {
		mainWindow.webContents.send('CMD_ASK_GPT');
	});
});

/* ===============================
   BOOT
   ipcMain.handle = precisa de resposta
   ipcMain.on = não precisa de resposta apenas ( notificação/evento)
=============================== */
ipcMain.on('RENDERER_ERROR', (_, info) => {
	console.error('Renderer reported error:', info && (info.message || info));
	if (info && info.stack) console.error(info.stack);
});

ipcMain.handle('GET_APP_CONFIG', () => {
	return APP_CONFIG;
});

// 🔥 Verifica se provider tem API key configurada (sem retornar a key real)
ipcMain.handle('HAS_API_KEY', async (_, provider) => {
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
});

// 🔥 Recupera API key
ipcMain.handle('GET_API_KEY', async (event, provider) => {
	try {
		console.log(`🔍 main.js: Recuperando chave de ${provider}...`);

		const key = secureStore.get(`apiKeys.${provider}`);

		if (key) {
			console.log(`✅ main.js: Chave de ${provider} recuperada (length: ${key.length})`);
		} else {
			console.log(`⚠️ main.js: Nenhuma chave salva para ${provider}`);
		}

		return key || null;
	} catch (error) {
		console.error(`❌ main.js: Erro ao recuperar chave de ${provider}`, error);
		return null;
	}
});

// 🔥 Salva API key de forma segura (criptografada)
ipcMain.handle('SAVE_API_KEY', async (_, { provider, apiKey }) => {
	try {
		// 🔥 DEBUG: Log ANTES de processar
		console.log(`main.js: Recebido SAVE_API_KEY - provider: ${provider}`);
		console.log(`main.js: apiKey recebida (length: ${apiKey?.length || 0})`);
		const masked = apiKey ? apiKey.substring(0, 8) + '...' : '';
		console.log(`main.js: apiKey (masked): ${masked}`);

		if (!apiKey || apiKey.trim().length < 2) {
			console.warn('---> API key inválida ou muito curta');
			return { success: false, error: 'API key inválida' };
		}

		const trimmedKey = apiKey.trim();

		// 🔥 DEBUG: Log DEPOIS de trim
		console.log(` main.js: Após trim (length: ${trimmedKey.length})`);

		// Salva de forma criptografada
		secureStore.set(`apiKeys.${provider}`, trimmedKey);

		// 🔥 VERIFICAÇÃO: Lê imediatamente para confirmar (mostrando apenas máscaras)
		const verification = secureStore.get(`apiKeys.${provider}`);
		console.log(`main.js: Verificação pós-save (length: ${verification?.length || 0})`);

		if (verification !== trimmedKey) {
			const sentMask = trimmedKey ? trimmedKey.substring(0, 8) + '...' : '';
			const savedMask = verification ? String(verification).substring(0, 8) + '...' : '';
			console.error(`main.js: CHAVE SALVA DIFERENTE DA ENVIADA!`);
			console.error(`   Enviada (masked): ${sentMask}`);
			console.error(`   Salva (masked): ${savedMask}`);
		}

		console.log(`API key salva com segurança para provider: ${provider}`);

		// Se for OpenAI, inicializa cliente imediatamente
		if (provider === 'openai') {
			const success = initializeOpenAIClient(trimmedKey);
			if (mainWindow && mainWindow.webContents) {
				mainWindow.webContents.send('API_KEY_UPDATED', !!success);
			}
			return { success, provider };
		}

		return { success: true, provider };
	} catch (error) {
		console.error('Erro ao salvar API key:', error);
		return { success: false, error: error.message };
	}
});

// 🔥 Remove API key de forma segura
ipcMain.handle('DELETE_API_KEY', async (_, provider) => {
	try {
		secureStore.delete(`apiKeys.${provider}`);
		console.log(`🗑️ API key removida para provider: ${provider}`);

		// Se for OpenAI, reseta cliente
		if (provider === 'openai') {
			openaiClient = null;
		}

		return { success: true, provider };
	} catch (error) {
		console.error('❌ Erro ao deletar API key:', error);
		return { success: false, error: error.message };
	}
});

// 🔥 Retorna status do cliente OpenAI (inicializado ou não)
ipcMain.handle('GET_OPENAI_API_STATUS', async () => {
	return {
		initialized: !!openaiClient,
	};
});

// Inicializa o cliente OpenAI com uma chave fornecida (opcional)
ipcMain.handle('initialize-api-client', async (_, apiKey) => {
	const initialized = initializeOpenAIClient(apiKey);
	if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('API_KEY_UPDATED', !!initialized);
	return { initialized };
});

ipcMain.handle('transcribe-audio', async (_, audioBuffer) => {
	// 🔥 VERIFICA SE O CLIENTE ESTÁ INICIALIZADO, se não tenta inicializar do secure store
	if (!openaiClient) {
		console.log('⚠️ Cliente OpenAI não inicializado, tentando recuperar do secure store...');
		const initialized = initializeOpenAIClient();
		if (!initialized) {
			console.error('❌ OpenAI client não inicializado. Chave da API não configurada.');
			throw new Error('OpenAI API key não configurada. Configure em "API e Modelos" → OpenAI.');
		}
	}

	const recvAt = Date.now();
	//const tempFilePath = path.join(__dirname, 'temp-audio.webm');
	const tempFilePath = path.join(app.getPath('temp'), `temp-audio.webm`);

	console.log(
		'STT main: received transcribe-audio buffer, size:',
		audioBuffer?.byteLength || audioBuffer?.length || 'n/a',
	);

	const tWriteStart = Date.now();
	fs.writeFileSync(tempFilePath, Buffer.from(audioBuffer));
	console.log('STT main: wrote temp file in', Date.now() - tWriteStart, 'ms -', tempFilePath);

	try {
		const tSttStart = Date.now();
		// 🔥 USA O CLIENTE DINÂMICO
		const transcription = await openaiClient.audio.transcriptions.create({
			file: fs.createReadStream(tempFilePath),
			model: 'whisper-1',
			language: 'pt',
		});
		const sttDuration = Date.now() - tSttStart;

		console.log('STT main: transcription finished in', sttDuration, 'ms (received->start:', tSttStart - recvAt, 'ms)');

		return transcription.text;
	} catch (error) {
		console.error('❌ Erro na transcrição:', error.message);
		// 🔥 SE A CHAVE FOR INVÁLIDA, RESETA O CLIENTE
		if (error.status === 401 || error.message.includes('authentication') || error.message.includes('API key')) {
			openaiClient = null;
			throw new Error('Chave da API inválida ou expirada. Por favor, verifique suas configurações.');
		}
		throw error;
	} finally {
		if (fs.existsSync(tempFilePath)) {
			fs.unlinkSync(tempFilePath);
		}
	}
});

ipcMain.handle('transcribe-audio-partial', async (_, audioBuffer) => {
	// 🔥 VERIFICA SE O CLIENTE ESTÁ INICIALIZADO, se não tenta inicializar do secure store
	if (!openaiClient) {
		console.log('⚠️ Cliente OpenAI não inicializado para transcrição parcial, tentando recuperar...');
		const initialized = initializeOpenAIClient();
		if (!initialized) {
			console.error('❌ OpenAI client não inicializado. Chave da API não configurada.');
			throw new Error('OpenAI API key não configurada. Configure em "API e Modelos" → OpenAI.');
		}
	}

	// Proteção: buffers muito pequenos frequentemente não formam um arquivo válido
	const size = audioBuffer?.byteLength || audioBuffer?.length || 0;
	if (size < 3000) {
		console.log('STT main (partial): buffer demasiado pequeno, ignorando (size=', size, ')');
		return '';
	}

	const recvAt = Date.now();
	// const tempFilePath = path.join(__dirname, 'temp-audio-partial.webm');
	const tempFilePath = path.join(app.getPath('temp'), `temp-audio-partial.webm`);

	console.log('STT main (partial): received buffer, size:', size);

	const tWriteStart = Date.now();
	fs.writeFileSync(tempFilePath, Buffer.from(audioBuffer));
	console.log('STT main (partial): wrote temp file in', Date.now() - tWriteStart, 'ms -', tempFilePath);

	try {
		const tSttStart = Date.now();
		const transcription = await openaiClient.audio.transcriptions.create({
			file: fs.createReadStream(tempFilePath),
			model: 'whisper-1',
			language: 'pt',
		});
		const sttDuration = Date.now() - tSttStart;

		console.log(
			'STT main (partial): transcription finished in',
			sttDuration,
			'(received->start:',
			tSttStart - recvAt,
			'ms)',
		);

		return transcription.text;
	} catch (error) {
		console.error('❌ Erro na transcrição parcial:', error && error.message ? error.message : error);
		// Se o erro for de formato inválido, não propagar — retorna string vazia
		if (
			error &&
			error.status === 400 &&
			error.error &&
			error.error.message &&
			error.error.message.includes('Invalid file format')
		) {
			console.warn('STT partial: invalid file format, retornando string vazia');
			return '';
		}
		if (error.status === 401 || (error.message && error.message.includes('authentication'))) {
			openaiClient = null;
			throw new Error('Chave da API inválida. Verifique as configurações.');
		}
		throw error;
	} finally {
		if (fs.existsSync(tempFilePath)) {
			fs.unlinkSync(tempFilePath);
		}
	}
});

ipcMain.handle('ask-gpt', async (_, messages) => {
	// 🔥 VERIFICA SE O CLIENTE ESTÁ INICIALIZADO, se não tenta inicializar do secure store
	if (!openaiClient) {
		console.log('⚠️ Cliente OpenAI não inicializado para GPT, tentando recuperar...');
		const initialized = initializeOpenAIClient();
		if (!initialized) {
			console.error('❌ OpenAI client não inicializado.');
			throw new Error('OpenAI API key não configurada. Configure em "API e Modelos" → OpenAI.');
		}
	}

	try {
		const completion = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages,
			temperature: 0.3,
		});

		return completion.choices[0].message.content;
	} catch (error) {
		console.error('❌ Erro no GPT:', error.message);
		if (error.status === 401 || error.message.includes('authentication')) {
			openaiClient = null;
			throw new Error('Chave da API inválida para GPT. Verifique as configurações.');
		}
		throw error;
	}
});

ipcMain.handle('ask-gpt-stream', async (event, messages) => {
	// 🔥 VERIFICA SE O CLIENTE ESTÁ INICIALIZADO, se não tenta inicializar do secure store
	if (!openaiClient) {
		console.log('⚠️ Cliente OpenAI não inicializado para streaming, tentando recuperar...');
		const initialized = initializeOpenAIClient();
		if (!initialized) {
			console.error('❌ OpenAI client não inicializado.');
			event.sender.send('GPT_STREAM_ERROR', 'OpenAI API key não configurada. Configure em "API e Modelos" → OpenAI.');
			return;
		}
	}

	const win = BrowserWindow.fromWebContents(event.sender);

	try {
		const stream = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages,
			temperature: 0.3,
			stream: true,
		});

		try {
			for await (const chunk of stream) {
				const token = chunk.choices?.[0]?.delta?.content;
				if (token) {
					win.webContents.send('GPT_STREAM_CHUNK', token);
				}
			}
		} catch (err) {
			console.error('GPT stream error:', err);
			win.webContents.send('GPT_STREAM_ERROR', err.message);
		} finally {
			win.webContents.send('GPT_STREAM_END');
		}
	} catch (error) {
		console.error('❌ Erro ao iniciar stream GPT:', error.message);
		if (error.status === 401 || error.message.includes('authentication')) {
			openaiClient = null;
			win.webContents.send('GPT_STREAM_ERROR', 'Chave da API inválida. Configure na seção "API e Modelos".');
		} else {
			win.webContents.send('GPT_STREAM_ERROR', error.message);
		}
	}
});

/* ====================================
   🪟 Inicio do DRAG AND DROP DA JANELA
==================================== */
ipcMain.on('START_WINDOW_DRAG', () => {
	if (!mainWindow) return;
	console.log('🪟 START_WINDOW_DRAG');
	mainWindow.moveTop(); // garante foco
	mainWindow.startDrag?.(); // macOS (seguro)
});

ipcMain.handle('GET_WINDOW_BOUNDS', () => {
	if (!mainWindow) return null;
	return mainWindow.getBounds();
});

ipcMain.handle('GET_CURSOR_SCREEN_POINT', () => {
	try {
		const { screen } = require('electron');
		return screen.getCursorScreenPoint();
	} catch (err) {
		return { x: 0, y: 0 };
	}
});

ipcMain.on('MOVE_WINDOW_TO', (_, { x, y }) => {
	if (!mainWindow) return;
	try {
		const b = mainWindow.getBounds();
		mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: b.width, height: b.height });
	} catch (err) {
		console.warn('MOVE_WINDOW_TO falhou:', err);
	}
});
/* =================================
   🪟 Fim do DRAG AND DROP DA JANELA
================================= */

ipcMain.on('APP_CLOSE', () => {
	console.log('❌ APP_CLOSE recebido — encerrando aplicação');
	if (mainWindow) {
		mainWindow.close();
	}
});

app.on('will-quit', () => {
	globalShortcut.unregisterAll();
});
