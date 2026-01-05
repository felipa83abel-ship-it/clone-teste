/* ================================
   IMPORTS E CONFIGURAÇÕES INICIAIS
=============================== */

const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const OpenAI = require('openai');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

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

/* ================================
   CONSTANTES
=============================== */

// Configuração de modelo Vosk (local)
const VOSK_CONFIG = {
	// MODEL: 'vosk-models/vosk-model-small-pt-0.3' ( Modelo pequeno, rápido, menos preciso)
	MODEL: process.env.VOSK_MODEL || 'vosk-models/vosk-model-small-pt-0.3',
};

// Configuração do modelo Whisper.cpp (local)
const WHISPER_CLI_EXE = path.join(__dirname, 'whisper-local', 'bin', 'whisper-cli.exe');
// Modelo Tiny (Modelo menor, rápido, menos preciso)
const WHISPER_MODEL = path.join(__dirname, 'whisper-local', 'models', 'ggml-tiny.bin');

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
 * Verifica se os arquivos do Whisper.cpp local existem
 */
function checkWhisperFiles() {
	const exeExists = fs.existsSync(WHISPER_CLI_EXE);
	const modelExists = fs.existsSync(WHISPER_MODEL);

	console.log('🔍 Verificando arquivos Whisper:');
	console.log(`   Executável: ${exeExists ? '✅' : '❌'} ${WHISPER_CLI_EXE}`);
	console.log(`   Modelo: ${modelExists ? '✅' : '❌'} ${WHISPER_MODEL}`);

	return exeExists && modelExists;
}

/**
 * Converte WebM para WAV usando ffmpeg (para Whisper.cpp)
 * Trabalha com caminhos de arquivo (não buffers)
 * Origem: commit 9545a76
 */
function convertWebMToWAVFile(inputPath, outputPath) {
	return new Promise((resolve, reject) => {
		// Usa ffmpeg estático se disponível
		const ffmpeg = require('fluent-ffmpeg');
		const ffmpegPath = require('ffmpeg-static');
		ffmpeg(inputPath)
			.setFfmpegPath(ffmpegPath)
			.audioCodec('pcm_s16le')
			.audioFrequency(16000) // Whisper usa 16kHz
			.audioChannels(1) // Mono
			.format('wav')
			.on('end', () => {
				console.log('✅ Conversão WebM → WAV concluída');
				resolve();
			})
			.on('error', err => {
				console.error('❌ Erro na conversão WebM → WAV:', err);
				reject(err);
			})
			.save(outputPath);
	});
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
			await execFileAsync(
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
   HANDLERS IPC - GERAIS
=============================== */

// Erros do renderer
ipcMain.on('RENDERER_ERROR', (_, info) => {
	console.error('Renderer reported error:', info && (info.message || info));
	if (info && info.stack) console.error(info.stack);
});

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

/**
 * Transcrição com OpenAI Whisper-1 (online)
 * Chamado por: renderer.js → transcribeAudio() quando sttModel === 'whisper-1'
 * Referência: handlers IPC 'transcribe-audio' e 'transcribe-audio-partial'
 */
async function transcribeAudioCommon(audioBuffer, isPartial = false) {
	console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
	console.log('📋 STT HANDLER ATIVO: WHISPER-1 OPENAI (Cloud, Versátil)');
	console.log('════════════════════════════════════════════════════════════════════════════════════════');
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

/**
 * Transcrição local com Whisper.cpp
 * Origem: commit 9545a76
 * Processa WebM → WAV → Whisper.cpp
 */
/**
 * Transcrição com Whisper.cpp local (alta precisão, offline)
 * Chamado por: renderer.js → transcribeAudio() quando sttModel === 'whisper-cpp-local'
 * Referência: handlers IPC 'transcribe-local' e 'transcribe-local-partial'
 * Processo: WebM → WAV → Whisper.cpp → Texto
 */
// Helper function para processar arquivo WAV no Whisper
async function processWhisperFile(whisperModelPath, tempWavPath, isPartial = false) {
	const whisperStart = Date.now();

	const args = ['-m', whisperModelPath, '-f', tempWavPath, '-l', 'pt', '-otxt', '-t', '4', '-np', '-nt'];

	if (isPartial) {
		args.push('-d', '3000', '-ml', '50');
	}

	console.log(`🚀 4. Executando Whisper: ${WHISPER_CLI_EXE} ${args.join(' ')}`);

	const { stdout } = await execFileAsync(WHISPER_CLI_EXE, args, {
		timeout: isPartial ? 2000 : 4000,
		maxBuffer: 1024 * 1024 * 5,
	});

	const whisperTime = Date.now() - whisperStart;
	console.log(`✅ 5. Whisper executado em ${whisperTime}ms`);

	if (stdout && stdout.trim()) {
		console.log(`📝 STDOUT (primeiros 200 chars):`, stdout.substring(0, 200));
	} else {
		console.log(`📝 STDOUT: vazio ou nulo`);
	}

	return (stdout || '').trim();
}

// Helper para log de erro durante execução do Whisper
function logWhisperError(execError, tempWavPath) {
	console.error(`❌ ERRO NA EXECUÇÃO DO WHISPER:`);
	console.error(`   Código: ${execError.code}`);
	console.error(`   Sinal: ${execError.signal}`);
	console.error(`   Mensagem: ${execError.message}`);
	if (execError.stderr) {
		console.error(`   STDERR do processo: ${execError.stderr}`);
	}
	if (execError.stdout) {
		console.error(`   STDOUT do processo: ${execError.stdout}`);
	}

	if (fs.existsSync(tempWavPath)) {
		const stats = fs.statSync(tempWavPath);
		console.error(`   📝 WAV file existe: ${stats.size} bytes`);
	} else {
		console.error(`   ❌ WAV file NÃO EXISTE!`);
	}
}

// Helper para validar e preparar arquivo WAV
async function prepareWavFile(audioBuffer, tempWebmPath, tempWavPath, isPartial) {
	fs.writeFileSync(tempWebmPath, Buffer.from(audioBuffer));
	console.log(`📁 Áudio WebM salvo: ${tempWebmPath} (${audioBuffer.length} bytes)`);

	const convertStart = Date.now();
	await convertWebMToWAVFile(tempWebmPath, tempWavPath);
	const convertTime = Date.now() - convertStart;
	console.log(`🔄 2. Convertido para WAV em ${convertTime}ms: ${tempWavPath}`);

	if (!fs.existsSync(tempWavPath)) {
		throw new Error('Arquivo WAV não foi criado');
	}

	const wavStats = fs.statSync(tempWavPath);
	console.log(`📊 3. WAV stats: ${wavStats.size} bytes`);

	if (wavStats.size < 1000) {
		console.warn('⚠️ Arquivo WAV muito pequeno, pode estar corrompido');
	}
}

async function transcribeLocalCommon(audioBuffer, isPartial = false) {
	console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
	console.log('📋 STT HANDLER ATIVO: WHISPER.CPP LOCAL (Offline, Alta Precisão)');
	console.log('════════════════════════════════════════════════════════════════════════════════════════');
	const startTime = Date.now();
	console.log(`🎤 [WHISPER LOCAL${isPartial ? ' PARTIAL' : ''}] Iniciando...`);
	console.log(`⏱️ Recebido buffer: ${audioBuffer.length} bytes`);

	if (!checkWhisperFiles()) {
		if (isPartial) return '';
		throw new Error('Arquivos do Whisper.cpp não encontrados!');
	}

	const tempDir = app.getPath('temp');
	const tempWebmPath = path.join(tempDir, `whisper-${isPartial ? 'partial' : 'temp'}-${Date.now()}.webm`);
	const tempWavPath = tempWebmPath.replace('.webm', '.wav');

	try {
		await prepareWavFile(audioBuffer, tempWebmPath, tempWavPath, isPartial);

		let result = '';
		try {
			result = await processWhisperFile(WHISPER_MODEL, tempWavPath, isPartial);
		} catch (execError) {
			logWhisperError(execError, tempWavPath);
			throw execError;
		}

		const elapsedTotal = Date.now() - startTime;
		console.log(`📊 Tempo total: ${elapsedTotal}ms`);
		console.log(
			`✨ Resultado (${result.length} chars): "${result.substring(0, 80)}${result.length > 80 ? '...' : ''}"`,
		);

		return result;
	} finally {
		try {
			if (fs.existsSync(tempWebmPath)) {
				fs.unlinkSync(tempWebmPath);
				console.log(`🗑️ Deletado WebM temp`);
			}
			if (fs.existsSync(tempWavPath)) {
				fs.unlinkSync(tempWavPath);
				console.log(`🗑️ Deletado WAV temp`);
			}
		} catch (cleanupError) {
			console.warn('⚠️ Erro ao limpar arquivos temp:', cleanupError.message);
		}
	}
}

// ==========================================
// HANDLERS IPC - STT (Speech-to-Text)
// ==========================================
// Referências de quem chama:
//   - OpenAI Whisper-1: renderer.js → transcribeAudio() com sttModel === 'whisper-1'
//   - Whisper.cpp Local: renderer.js → transcribeAudio() com sttModel === 'whisper-cpp-local'
//   - Vosk Local: renderer.js → transcribeAudio() com sttModel === 'vosk-local'

// Handler: Transcrição OpenAI Whisper-1 (online)
ipcMain.handle('transcribe-audio', (_, audioBuffer) => transcribeAudioCommon(audioBuffer, false));
ipcMain.handle('transcribe-audio-partial', (_, audioBuffer) => transcribeAudioCommon(audioBuffer, true));

// Handlers para Whisper.cpp (local, alta precisão)
ipcMain.handle('transcribe-local', (_, audioBuffer) => transcribeLocalCommon(audioBuffer, false));
ipcMain.handle('transcribe-local-partial', (_, audioBuffer) => transcribeLocalCommon(audioBuffer, true));

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
		console.error('Erro ao obter posição do cursor:', err);
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

/* ================================
   HANDLERS IPC - VOSK (VIA PYTHON SUBPROCESS)
=============================== */

const { spawn } = require('node:child_process');
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
	console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
	console.log('📋 STT HANDLER ATIVO: VOSK LOCAL (Python Server)');
	console.log('════════════════════════════════════════════════════════════════════════════════════════');
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
						// Ignorar: Não é JSON válido, aguardar próxima linha
						// O loop continuará por 'data' e 'end' listeners
						console.warn(`⚠️ Linha Vosk não é JSON válido, aguardando próxima linha... ${e}`);
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
					console.error('Erro ao fazer parse da resposta final do Vosk:', error);
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

/* ===============================
   SCREENSHOT CAPTURE - DISCRETO E INDETECTÁVEL
=============================== */

const { desktopCapturer } = require('electron');

let lastCaptureTime = 0;
const CAPTURE_COOLDOWN = 2000; // 2 segundos
const SCREENSHOT_RETENTION = 5 * 60 * 1000; // 5 minutos

/**
 * Captura screenshot da tela sem indicadores visíveis
 * Exclui a própria janela do App da captura
 */
ipcMain.handle('CAPTURE_SCREENSHOT', async () => {
	const now = Date.now();

	// 🛡️ Cooldown check
	if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
		const waitTime = Math.ceil((CAPTURE_COOLDOWN - (now - lastCaptureTime)) / 1000);
		return {
			success: false,
			error: `Aguarde ${waitTime}s antes de capturar novamente`,
		};
	}

	// 🛡️ Salva opacidade original COM FALLBACK seguro
	let originalOpacity = mainWindow?.getOpacity() ?? 1; // Fallback: 1 (totalmente opaco)

	try {
		console.log('📸 Iniciando captura de tela discreta...');

		// 1️⃣ Torna janela COMPLETAMENTE invisível
		if (mainWindow) {
			// ✅ HARDENING INVISIBILIDADE: Usa MÚLTIPLOS métodos simultâneos
			// Garante que nenhuma ferramenta de captura (Zoom, Teams, OBS, etc) detecte a janela
			mainWindow.setOpacity(0); // Invisível opticamente
			mainWindow.setIgnoreMouseEvents(true, { forward: true }); // Não interfere com mouse
			console.log('👻 Janela invisível (opacity=0 + ignoreMouseEvents)');
		}

		// Aguarda múltiplos frames do compositor (50ms = ~3 frames a 60fps)
		// Garante que a invisibilidade foi propagada ao sistema de composição
		await new Promise(resolve => setTimeout(resolve, 50));

		// 2️⃣ Captura a tela usando desktopCapturer
		const sources = await desktopCapturer.getSources({
			types: ['screen'],
			thumbnailSize: { width: 1920, height: 1080 },
		});

		if (!sources || sources.length === 0) {
			console.error('❌ Nenhuma tela encontrada');
			return { success: false, error: 'Nenhuma tela encontrada' };
		}

		// Pega a primeira tela (tela principal)
		const screenshot = sources[0].thumbnail.toPNG();

		// 3️⃣ Salva no diretório temp
		const tempDir = app.getPath('temp');
		const timestamp = Date.now();
		const filename = `my-screenshot-${timestamp}.png`;
		const filepath = path.join(tempDir, filename);

		fs.writeFileSync(filepath, screenshot);
		console.log(`✅ Screenshot salvo: ${filepath} (${Math.round(screenshot.length / 1024)}KB)`);

		// Atualiza timestamp
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
		// 🛡️ CRÍTICO: Garante restauração SEMPRE (sucesso ou erro)
		// originalOpacity tem fallback (1), então sempre terá um valor válido
		if (mainWindow) {
			mainWindow.setOpacity(originalOpacity);
			mainWindow.setIgnoreMouseEvents(false); // IMPORTANTE: Restaura eventos de mouse
			console.log(`👀 Janela restaurada (opacity=${originalOpacity})`);
		}
	}
});

/**
 * Analisa screenshots com OpenAI Vision API (gpt-4o)
 */
ipcMain.handle('ANALYZE_SCREENSHOTS', async (_, screenshotPaths) => {
	try {
		await ensureOpenAIClient();

		if (!screenshotPaths || screenshotPaths.length === 0) {
			return {
				success: false,
				error: 'Nenhum screenshot para analisar',
			};
		}

		console.log(`🔍 Analisando ${screenshotPaths.length} screenshot(s)...`);

		// 📸 Converte screenshots para base64
		const images = screenshotPaths
			.map(filepath => {
				if (!fs.existsSync(filepath)) {
					console.warn(`⚠️ Screenshot não encontrado: ${filepath}`);
					return null;
				}

				const buffer = fs.readFileSync(filepath);
				const base64 = buffer.toString('base64');
				console.log(`  ✓ Carregado: ${path.basename(filepath)} (${Math.round(buffer.length / 1024)}KB)`);

				return {
					type: 'image_url',
					image_url: {
						url: `data:image/png;base64,${base64}`,
					},
				};
			})
			.filter(Boolean); // Remove nulls

		if (images.length === 0) {
			return {
				success: false,
				error: 'Nenhum screenshot válido encontrado',
			};
		}

		// 🤖 Monta mensagens para a API
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

		// 🚀 Envia para OpenAI Vision (gpt-4o)
		console.log('🚀 Enviando para OpenAI Vision API...');
		const response = await openaiClient.chat.completions.create({
			model: 'gpt-4o-mini', // Modelo com suporte a visão (gpt-4o)
			messages,
			max_tokens: 2000,
			temperature: 0.3,
		});

		const analysis = response.choices[0].message.content;

		console.log('✅ Análise concluída');
		console.log(`📝 Resposta: ${analysis.substring(0, 100)}...`);

		// 🔄 Limpeza de imagens antigas maior que 5 minutos
		cleanupScreenshots();

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
});

/**
 * Limpa screenshots antigos do diretório temp
 */
async function cleanupScreenshots() {
	try {
		const tempDir = app.getPath('temp');

		if (!fs.existsSync(tempDir)) {
			return { success: true, cleaned: 0 };
		}

		const files = fs.readdirSync(tempDir);
		const now = Date.now();
		let cleaned = 0;

		files.forEach(file => {
			if (file.startsWith('my-screenshot-')) {
				const filepath = path.join(tempDir, file);

				try {
					const stats = fs.statSync(filepath);
					const age = now - stats.mtimeMs;

					// Remove se for mais antigo que 5 minutos
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

// Handler IPC para limpeza manual de screenshots
ipcMain.handle('CLEANUP_SCREENSHOTS', cleanupScreenshots);

/* ================================
// FECHAMENTO DA APLICAÇÃO
=============================== */
ipcMain.on('APP_CLOSE', () => {
	console.log('❌ APP_CLOSE recebido — encerrando aplicação');
	app.quit();
});

/* ================================
   CRIAÇÃO DA JANELA
=============================== */
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

/* ================================
   INICIALIZAÇÃO DO APP
=============================== */
app.whenReady().then(() => {
	// Cria a janela principal
	createWindow();

	// Atalhos globais

	// �️ DevTools em desenvolvimento (focusable: false bloqueia before-input-event)
	if (!app.isPackaged) {
		globalShortcut.register('Control+Shift+I', () => {
			mainWindow.webContents.toggleDevTools();
			console.log('🛠️ DevTools acionado via Ctrl+Shift+I');
		});
	}

	// Começar a ouvir / Parar de ouvir (Ctrl+D)
	globalShortcut.register('Control+D', () => {
		mainWindow.webContents.send('CMD_TOGGLE_AUDIO');
	});

	// Enviar pergunta ao GPT (Ctrl+Enter)
	globalShortcut.register('Control+Enter', () => {
		mainWindow.webContents.send('CMD_ASK_GPT');
	});

	// Navegacao de perguntas (Ctrl+Shift+ArrowUp)
	globalShortcut.register('Control+Shift+Up', () => {
		mainWindow.webContents.send('CMD_NAVIGATE_QUESTIONS', 'up');
	});

	// Navegacao de perguntas (Ctrl+Shift+ArrowDown)
	globalShortcut.register('Control+Shift+Down', () => {
		mainWindow.webContents.send('CMD_NAVIGATE_QUESTIONS', 'down');
	});

	// 📸 Atalhos para screenshots
	globalShortcut.register('Control+Shift+F', () => {
		mainWindow.webContents.send('CMD_CAPTURE_SCREENSHOT');
	});

	// 🔍 Atalho para analisar screenshots
	globalShortcut.register('Control+Shift+G', () => {
		mainWindow.webContents.send('CMD_ANALYZE_SCREENSHOTS');
	});

	console.log('✅ Atalhos de screenshot registrados');
});

/* ================================
   FINALIZAÇÃO DO APP
=============================== */
app.on('will-quit', () => {
	globalShortcut.unregisterAll();
});
