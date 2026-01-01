/* ================================
   IMPORTS E CONFIGURAÇÕES INICIAIS
=============================== */
if (process.env.NODE_ENV === 'development') {
	try {
		require('electron-reload')(__dirname, {
			electron: require(`${__dirname}/node_modules/electron`),
		});
	} catch (err) {
		console.log('electron-reload não carregado:', err);
	}
}

const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// Importações condicionais
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

/* ================================
   CONSTANTES
=============================== */
const APP_CONFIG = {
	MODE_DEBUG: false,
};

// Configuração de modelo Vosk
const VOSK_CONFIG = {
	MODEL: process.env.VOSK_MODEL || 'vosk-models/vosk-model-small-pt-0.3',
	// MODEL: 'vosk-models/vosk-model-small-pt-0.3' ( Modelo pequeno, rápido, menos preciso)
	// Alternativa: 'vosk-models/vosk-model-pt-fb-v0.1.1' (modelo maior, mais preciso, mas mais lento)
};

// 🔥 MODIFICADO: Removidas constantes do Whisper.cpp local
// (Whisper local será substituído por Vosk para STT)

/* ================================
   ESTADO GLOBAL
=============================== */
let mainWindow = null;
let openaiClient = null;
let secureStore = null;
let clickThroughEnabled = false;

/* ================================
   INICIALIZAÇÃO DO SECURE STORE
=============================== */
if (ElectronStore) {
	try {
		secureStore = new ElectronStore({
			name: 'secure-keys',
			encryptionKey: 'perssua-secure-storage-v1',
		});
		console.log('✅ SecureStore inicializado com sucesso');

		// Inicializa cliente OpenAI se houver chave salva
		const savedKey = secureStore.get('apiKeys.openai');
		if (savedKey && savedKey.length > 10) {
			console.log('🔑 Chave OpenAI encontrada - inicializando cliente...');
			initializeOpenAIClient(savedKey);
		}
	} catch (error) {
		console.error('❌ Erro ao criar secureStore:', error);
	}
}

/* ================================
   FUNÇÕES AUXILIARES
=============================== */

/**
 * Inicializa o cliente OpenAI
 */
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
 * Converte WebM/Ogg para PCM 16-bit 16kHz (formato que Vosk espera)
 * Usa ffmpeg para decodificação
 */
async function convertWebMToWAV(webmBuffer) {
	try {
		const ffmpegPath = require('ffmpeg-static');
		const inputFile = path.join(app.getPath('temp'), `input-${Date.now()}.webm`);
		const outputFile = path.join(app.getPath('temp'), `output-${Date.now()}.wav`);

		try {
			// Escreve WebM temporário
			fs.writeFileSync(inputFile, webmBuffer);

			// Converte com ffmpeg: WebM → WAV 16-bit 16kHz mono (MESMA FORMA DE ANTES)
			const { stdout, stderr } = await execFileAsync(
				ffmpegPath,
				[
					'-i',
					inputFile,
					'-acodec',
					'pcm_s16le', // PCM 16-bit signed
					'-ar',
					'16000', // 16kHz sample rate
					'-ac',
					'1', // Mono
					'-f',
					'wav', // WAV container (melhor preservação de qualidade)
					outputFile,
				],
				{ maxBuffer: 10 * 1024 * 1024 },
			);

			// Lê arquivo WAV convertido
			const wavBuffer = fs.readFileSync(outputFile);

			// Limpa arquivos temporários
			fs.unlinkSync(inputFile);
			fs.unlinkSync(outputFile);

			console.log(`✅ Convertido WebM (${webmBuffer.length} bytes) → WAV (${wavBuffer.length} bytes)`);
			return wavBuffer;
		} catch (error) {
			// Limpa se houver erro
			if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
			if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
			throw error;
		}
	} catch (error) {
		console.error('❌ Erro ao converter WebM para WAV:', error.message);
		throw error;
	}
}

/* ================================
   CRIAÇÃO DA JANELA
=============================== */
function createWindow() {
	console.log('🪟 Criando janela principal (frameless)');

	mainWindow = new BrowserWindow({
		width: 1220,
		height: 620,
		x: 0,
		y: 0,
		frame: false,
		transparent: true,
		backgroundColor: '#00000000',
		alwaysOnTop: true,
		resizable: true,
		minimizable: false,
		maximizable: false,
		closable: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	console.log('🪟 Janela criada em modo overlay');

	// Remove menu padrão
	mainWindow.setMenu(null);

	// Atalho para DevTools (somente desenvolvimento)
	if (!app.isPackaged) {
		mainWindow.webContents.on('before-input-event', (event, input) => {
			if (input.control && input.shift && input.key.toLowerCase() === 'i') {
				mainWindow.webContents.toggleDevTools();
				event.preventDefault();
			}
		});
	}

	// Carrega a página principal
	mainWindow.loadFile('index.html');

	// Eventos da janela
	mainWindow.on('closed', () => {
		console.log('❌ Janela principal fechada');
	});
}

/* ================================
   HANDLERS IPC - GERAIS
=============================== */

// Erros do renderer
ipcMain.on('RENDERER_ERROR', (_, info) => {
	console.error('Renderer reported error:', info && (info.message || info));
	if (info && info.stack) console.error(info.stack);
});

// Configuração do app
ipcMain.handle('GET_APP_CONFIG', () => APP_CONFIG);

// Status do cliente OpenAI
ipcMain.handle('GET_OPENAI_API_STATUS', () => ({
	initialized: !!openaiClient,
}));

/* ================================
   HANDLERS IPC - API KEYS
=============================== */

// Verifica se há API key
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

// Recupera API key
ipcMain.handle('GET_API_KEY', async (_, provider) => {
	try {
		const key = secureStore.get(`apiKeys.${provider}`);
		return key || null;
	} catch (error) {
		console.error(`❌ Erro ao recuperar chave de ${provider}:`, error);
		return null;
	}
});

// Salva API key
ipcMain.handle('SAVE_API_KEY', async (_, { provider, apiKey }) => {
	try {
		if (!apiKey || apiKey.trim().length < 2) {
			return { success: false, error: 'API key inválida' };
		}

		const trimmedKey = apiKey.trim();
		secureStore.set(`apiKeys.${provider}`, trimmedKey);

		// Se for OpenAI, inicializa cliente
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

// Remove API key
ipcMain.handle('DELETE_API_KEY', async (_, provider) => {
	try {
		secureStore.delete(`apiKeys.${provider}`);

		if (provider === 'openai') {
			openaiClient = null;
		}

		return { success: true, provider };
	} catch (error) {
		console.error('❌ Erro ao deletar API key:', error);
		return { success: false, error: error.message };
	}
});

// Inicializa cliente OpenAI com chave fornecida
ipcMain.handle('initialize-api-client', async (_, apiKey) => {
	const initialized = initializeOpenAIClient(apiKey);
	if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('API_KEY_UPDATED', !!initialized);
	return { initialized };
});

/* ================================
   HANDLERS IPC - TRANSCRIÇÃO ONLINE (OpenAI)
=============================== */

async function transcribeAudioCommon(audioBuffer, isPartial = false) {
	// Verifica se o cliente está inicializado
	if (!openaiClient) {
		console.log('⚠️ Cliente OpenAI não inicializado, tentando recuperar...');
		const initialized = initializeOpenAIClient();
		if (!initialized) {
			throw new Error('OpenAI API key não configurada. Configure em "API e Modelos" → OpenAI.');
		}
	}

	// Proteção para buffers muito pequenos
	const size = audioBuffer?.byteLength || audioBuffer?.length || 0;
	if (isPartial && size < 800) {
		console.log('STT main (partial): buffer demasiado pequeno, ignorando');
		return '';
	}

	// Salva arquivo temporário
	const tempFileName = isPartial ? 'temp-audio-partial.webm' : 'temp-audio.webm';
	const tempFilePath = path.join(app.getPath('temp'), tempFileName);

	try {
		fs.writeFileSync(tempFilePath, Buffer.from(audioBuffer));

		const transcription = await openaiClient.audio.transcriptions.create({
			file: fs.createReadStream(tempFilePath),
			model: 'whisper-1',
			language: 'pt',
		});

		return transcription.text;
	} catch (error) {
		console.error(`❌ Erro na transcrição ${isPartial ? 'parcial' : ''}:`, error.message);

		if (error.status === 401 || error.message.includes('authentication')) {
			openaiClient = null;
			throw new Error('Chave da API inválida ou expirada. Verifique suas configurações.');
		}

		if (isPartial && error.status === 400 && error.error?.message?.includes('Invalid file format')) {
			return '';
		}

		throw error;
	} finally {
		if (fs.existsSync(tempFilePath)) {
			fs.unlinkSync(tempFilePath);
		}
	}
}

// Handlers específicos
ipcMain.handle('transcribe-audio', (_, audioBuffer) => transcribeAudioCommon(audioBuffer, false));
ipcMain.handle('transcribe-audio-partial', (_, audioBuffer) => transcribeAudioCommon(audioBuffer, true));

/* ================================
   HANDLERS IPC - GPT
=============================== */

async function ensureOpenAIClient() {
	if (!openaiClient) {
		console.log('⚠️ Cliente OpenAI não inicializado, tentando recuperar...');
		const initialized = initializeOpenAIClient();
		if (!initialized) {
			throw new Error('OpenAI API key não configurada. Configure em "API e Modelos" → OpenAI.');
		}
	}
}

ipcMain.handle('ask-gpt', async (_, messages) => {
	await ensureOpenAIClient();

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
	const win = BrowserWindow.fromWebContents(event.sender);

	try {
		await ensureOpenAIClient();
	} catch (error) {
		win.webContents.send('GPT_STREAM_ERROR', error.message);
		return;
	}

	try {
		const stream = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini',
			messages,
			temperature: 0.3,
			stream: true,
		});

		for await (const chunk of stream) {
			const token = chunk.choices?.[0]?.delta?.content;
			if (token) {
				win.webContents.send('GPT_STREAM_CHUNK', token);
			}
		}

		win.webContents.send('GPT_STREAM_END');
	} catch (error) {
		console.error('❌ Erro no stream GPT:', error.message);
		if (error.status === 401 || error.message.includes('authentication')) {
			openaiClient = null;
			win.webContents.send('GPT_STREAM_ERROR', 'Chave da API inválida. Configure na seção "API e Modelos".');
		} else {
			win.webContents.send('GPT_STREAM_ERROR', error.message);
		}
	}
});

/* ================================
   HANDLERS IPC - CONTROLE DA JANELA
=============================== */

// Click-through
ipcMain.on('SET_CLICK_THROUGH', (_, enabled) => {
	clickThroughEnabled = enabled;
	mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
	console.log('🖱️ Click-through:', enabled ? 'ATIVADO' : 'DESATIVADO');
});

ipcMain.handle('GET_CLICK_THROUGH', () => clickThroughEnabled);

// Zonas interativas
ipcMain.on('SET_INTERACTIVE_ZONE', (_, isInteractive) => {
	if (clickThroughEnabled) {
		mainWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
	}
});

// Drag and drop da janela
ipcMain.on('START_WINDOW_DRAG', () => {
	if (!mainWindow) return;
	mainWindow.moveTop();
	mainWindow.startDrag?.();
});

ipcMain.handle('GET_WINDOW_BOUNDS', () => {
	return mainWindow ? mainWindow.getBounds() : null;
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
		mainWindow.setBounds({
			x: Math.round(x),
			y: Math.round(y),
			width: b.width,
			height: b.height,
		});
	} catch (err) {
		console.warn('MOVE_WINDOW_TO falhou:', err);
	}
});

// Fechar app
ipcMain.on('APP_CLOSE', () => {
	console.log('❌ APP_CLOSE recebido — encerrando aplicação');
	app.quit();
});

/* ================================
   HANDLER DE TESTE (DEPRECATED)
=============================== */
// 🔥 COMENTADO: Handler de teste do Whisper.cpp removido (migramos para Vosk)
// Para testar Whisper local, usar o arquivo whisper-server.js ou whisper-local/

/* ================================
   HANDLERS IPC - VOSK (VIA PYTHON SUBPROCESS)
=============================== */

const { spawn } = require('child_process');
let voskProcess = null;
let voskReady = false;

/**
 * Inicia servidor Vosk em Python (subprocess)
 * Comunica via stdin/stdout JSON
 */
function startVoskServer() {
	return new Promise((resolve, reject) => {
		try {
			console.log(`🚀 Iniciando servidor Vosk (Python) com modelo: ${VOSK_CONFIG.MODEL}...`);

			voskProcess = spawn('python', ['vosk-server.py', VOSK_CONFIG.MODEL], {
				cwd: __dirname,
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			// Aumenta limite de listeners para múltiplas requisições
			voskProcess.stdout.setMaxListeners(50);

			let readyCheck = false;

			voskProcess.stdout.on('data', data => {
				const line = data.toString().trim();
				console.log(`[Vosk] ${line}`);

				// Aguarda sinal VOSK_READY
				if (line === 'VOSK_READY' && !readyCheck) {
					readyCheck = true;
					voskReady = true;
					console.log('✅ Servidor Vosk pronto!');
					resolve(true);
				}
			});

			voskProcess.stderr.on('data', data => {
				console.log(`[Vosk stderr] ${data.toString().trim()}`);
			});

			voskProcess.on('error', error => {
				console.error('❌ Erro ao iniciar Vosk:', error.message);
				voskReady = false;
				reject(error);
			});

			voskProcess.on('close', code => {
				console.log(`⏹️ Vosk processo encerrado (código ${code})`);
				voskReady = false;
				voskProcess = null;
			});

			// Timeout de 5s para inicializar
			setTimeout(() => {
				if (!readyCheck) {
					console.error('⏱️ Timeout ao inicializar Vosk');
					reject(new Error('Vosk não respondeu (timeout)'));
				}
			}, 5000);
		} catch (error) {
			console.error('❌ Erro ao criar processo Vosk:', error);
			reject(error);
		}
	});
}

/**
 * Handler IPC para transcrição Vosk em streaming
 * Envia comando JSON para servidor Python
 */
ipcMain.handle('vosk-transcribe', async (_, audioBuffer) => {
	try {
		// Inicia servidor se não estiver rodando
		if (!voskReady || !voskProcess) {
			console.log('🔄 Inicializando Vosk...');
			await startVoskServer();
		}

		// Converte para Buffer se necessário (IPC pode enviar Uint8Array ou objeto)
		let buffer = audioBuffer;
		if (!Buffer.isBuffer(buffer)) {
			if (buffer?.data && Array.isArray(buffer.data)) {
				// Se for objeto com array 'data' (serializado)
				buffer = Buffer.from(buffer.data);
			} else if (ArrayBuffer.isView(buffer)) {
				// Se for Uint8Array ou similar
				buffer = Buffer.from(buffer);
			} else if (typeof buffer === 'object' && buffer !== null) {
				// Se for object genérico com propriedades numéricas
				const arr = Object.values(buffer);
				buffer = Buffer.from(arr);
			} else {
				throw new Error('audioBuffer formato inválido');
			}
		}

		console.log(`🎤 Recebido WebM: ${buffer.length} bytes`);

		// Converte WebM para WAV 16-bit 16kHz (MESMO FORMATO QUE ERA ANTES)
		let wavBuffer;
		try {
			wavBuffer = await convertWebMToWAV(buffer);
		} catch (error) {
			console.error('❌ Erro na conversão WebM→WAV:', error.message);
			throw new Error(`Falha ao converter áudio: ${error.message}`);
		}

		// Codifica WAV em base64 (JSON-safe)
		const audioBase64 = wavBuffer.toString('base64');

		// Cria comando JSON
		const command = {
			type: 'transcribe',
			audio: audioBase64,
		};

		// Envia comando para servidor Python
		const commandJson = JSON.stringify(command) + '\n';

		// Aguarda resposta
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				voskProcess.stdout.removeListener('data', responseHandler);
				reject(new Error('Timeout ao aguardar resposta do Vosk'));
			}, 5000);

			// Listener para resposta - filtra apenas JSON válido
			const responseHandler = data => {
				const lines = data.toString().split('\n');

				for (const line of lines) {
					const trimmed = line.trim();

					// Ignora linhas vazias ou que não parecem ser JSON
					if (!trimmed || trimmed.startsWith('[VOSK]') || trimmed === 'VOSK_READY') {
						continue;
					}

					// Tenta parsear como JSON
					try {
						const response = JSON.parse(trimmed);
						clearTimeout(timeout);
						voskProcess.stdout.removeListener('data', responseHandler);
						console.log('📝 Resposta Vosk:', response);
						resolve(response);
						return;
					} catch (e) {
						// Não é JSON válido, continua procurando
						continue;
					}
				}
			};

			// Aguarda próxima linha de resposta
			voskProcess.stdout.on('data', responseHandler);

			// Envia comando
			voskProcess.stdin.write(commandJson);
		});
	} catch (error) {
		console.error('❌ Erro em vosk-transcribe:', error.message);
		return {
			final: '',
			partial: '',
			isFinal: false,
			error: error.message,
		};
	}
});

/**
 * Handler para finalizar Vosk e obter resultado final
 */
ipcMain.handle('vosk-finalize', async () => {
	try {
		if (!voskReady || !voskProcess) {
			return { final: '' };
		}

		console.log('🔄 Finalizando Vosk e obtendo resultado final...');

		const command = { type: 'finalize' };
		const commandJson = JSON.stringify(command) + '\n';

		return new Promise(resolve => {
			const timeout = setTimeout(() => {
				resolve({ final: '' });
			}, 2000);

			const responseHandler = data => {
				clearTimeout(timeout);
				voskProcess.stdout.removeListener('data', responseHandler);

				try {
					const response = JSON.parse(data.toString().trim());
					console.log('✅ Vosk finalized:', response);
					resolve(response);
				} catch (error) {
					resolve({ final: '' });
				}
			};

			voskProcess.stdout.once('data', responseHandler);
			voskProcess.stdin.write(commandJson);
		});
	} catch (error) {
		console.error('❌ Erro em vosk-finalize:', error.message);
		return { final: '' };
	}
});

/* ================================
   INICIALIZAÇÃO DO APP
=============================== */
app.whenReady().then(() => {
	createWindow();

	// Atalhos globais
	globalShortcut.register('Control+D', () => {
		mainWindow.webContents.send('CMD_TOGGLE_AUDIO');
	});

	globalShortcut.register('Control+Enter', () => {
		mainWindow.webContents.send('CMD_ASK_GPT');
	});
});

app.on('will-quit', () => {
	globalShortcut.unregisterAll();
});
