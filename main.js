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

// Caminhos para Whisper.cpp local
const WHISPER_EXE = path.join(__dirname, 'whisper-local', 'whisper-cli.exe');
const WHISPER_MODEL = path.join(__dirname, 'whisper-local', 'ggml-tiny.bin');

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
 * Verifica se os arquivos do Whisper local existem
 */
function checkWhisperFiles() {
	const exeExists = fs.existsSync(WHISPER_EXE);
	const modelExists = fs.existsSync(WHISPER_MODEL);

	console.log('🔍 Verificando arquivos Whisper:');
	console.log(`   Executável: ${exeExists ? '✅' : '❌'} ${WHISPER_EXE}`);
	console.log(`   Modelo: ${modelExists ? '✅' : '❌'} ${WHISPER_MODEL}`);

	return exeExists && modelExists;
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
   HANDLERS IPC - TRANSCRIÇÃO LOCAL (Whisper.cpp)
=============================== */

/* ================================
   HANDLERS IPC - TRANSCRIÇÃO LOCAL (Whisper.cpp) OTIMIZADA
=============================== */
// CORREÇÃO FINAL: Use os argumentos corretos desta versão
async function transcribeLocalCommon(audioBuffer, isPartial = false) {
	const startTime = Date.now();
	console.log(`🎤 [WHISPER LOCAL${isPartial ? ' PARTIAL' : ''}] Iniciando...`);
	console.log(`⏱️ Recebido buffer: ${audioBuffer.length} bytes em ${startTime}`);

	if (!checkWhisperFiles()) {
		if (isPartial) return '';
		throw new Error('Arquivos do Whisper.cpp não encontrados!');
	}

	const tempDir = app.getPath('temp');

	// Salva como WebM primeiro
	const tempWebmPath = path.join(tempDir, `whisper-${isPartial ? 'partial' : 'temp'}-${Date.now()}.webm`);
	const tempWavPath = tempWebmPath.replace('.webm', '.wav');

	try {
		// 1. Salva o buffer WebM
		const saveStart = Date.now();
		fs.writeFileSync(tempWebmPath, Buffer.from(audioBuffer));
		const saveTime = Date.now() - saveStart;
		console.log(`📁 Áudio WebM salvo: ${tempWebmPath} (${audioBuffer.length} bytes)`);

		// 2. Converte WebM para WAV
		const convertStart = Date.now();
		await convertWebMToWAV(tempWebmPath, tempWavPath);
		const convertTime = Date.now() - convertStart;
		console.log(`🔄 2. Convertido para WAV em ${convertTime}ms: ${tempWavPath}`);

		// 3. Verifica se o arquivo WAV existe
		if (!fs.existsSync(tempWavPath)) {
			throw new Error('Arquivo WAV não foi criado');
		}

		const wavStats = fs.statSync(tempWavPath);
		console.log(`📊 3. WAV stats: ${wavStats.size} bytes`);

		if (wavStats.size < 1000) {
			console.warn('⚠️ Arquivo WAV muito pequeno, pode estar corrompido');
		}

		// 4. Executar Whisper.cpp COM ARGUMENTOS CORRETOS
		const whisperStart = Date.now();

		// 🔥 ARGUMENTOS OTIMIZADOS AO MÁXIMO
		const args = [
			'-m',
			WHISPER_MODEL,
			'-f',
			tempWavPath,
			'-l',
			'pt', // idioma português
			'-otxt', // saída em texto
			'-t',
			'4', // 4 threads
			'-np', // não imprimir logs (no-prints)
			'-nt', // não imprimir timestamps
		];

		// Se for parcial, ajusta parâmetros para ser mais rápido
		if (isPartial) {
			args.push('-d', '3000'); // máximo 3 segundos
			args.push('-ml', '50'); // máximo 50 caracteres por segmento
		}

		console.log(`🚀 4. Executando Whisper: ${WHISPER_EXE} ${args.join(' ')}`);

		const { stdout, stderr } = await execFileAsync(WHISPER_EXE, args, {
			timeout: isPartial ? 2000 : 4000, // Timeout maior para garantir
			maxBuffer: 1024 * 1024 * 5, // 5MB buffer
		});

		const whisperTime = Date.now() - whisperStart;
		console.log(`✅ 5. Whisper executado em ${whisperTime}ms`);

		// Debug detalhado
		if (stdout && stdout.trim()) {
			console.log(`📝 STDOUT (primeiros 200 chars):`, stdout.substring(0, 200));
		} else {
			console.log(`📝 STDOUT: vazio ou nulo`);
		}

		if (stderr && stderr.trim()) {
			console.log(`⚠️ STDERR:`, stderr.substring(0, 200));
		}

		let result = '';

		// Tenta extrair resultado de stdout
		if (stdout && stdout.trim()) {
			result = stdout.trim();
			console.log(`📋 Resultado do stdout: "${result}" (${result.length} chars)`);
		}
		// Algumas versões escrevem no stderr mesmo com sucesso
		else if (stderr && stderr.trim()) {
			// Tenta extrair texto entre [ ] que é onde fica a transcrição
			const lines = stderr.split('\n');
			for (const line of lines) {
				if (line.includes('[') && line.includes(']')) {
					const match = line.match(/\[([^\]]+)\]/);
					if (match && match[1]) {
						result = match[1].trim();
						console.log(`🔍 Transcrição extraída do stderr: "${result}"`);
						break;
					}
				}
			}

			// Se não encontrou entre colchetes, pega a última linha não vazia
			// if (!result) {
			// 	const nonEmptyLines = lines.filter(line => line.trim().length > 0);
			// 	if (nonEmptyLines.length > 0) {
			// 		result = nonEmptyLines[nonEmptyLines.length - 1].trim();
			// 		console.log(`🔍 Última linha do stderr: "${result}"`);
			// 	}
			// }
		}

		// 🔥 3. Log métricas detalhadas
		const totalTime = Date.now() - startTime;
		console.log(`⏱️ ================================`);
		console.log(`⏱️ [WHISPER LOCAL] MÉTRICAS DETALHADAS:`);
		console.log(`⏱️ ================================`);
		console.log(`⏱️ Tamanho buffer: ${audioBuffer.length} bytes`);
		console.log(`⏱️ 1. Salvamento: ${saveTime}ms`);
		console.log(`⏱️ 2. Conversão: ${convertTime}ms`);
		console.log(`⏱️ 3. Whisper: ${whisperTime}ms`);
		console.log(`⏱️ TOTAL: ${totalTime}ms`);
		console.log(`⏱️ Whisper % do total: ${Math.round((whisperTime / totalTime) * 100)}%`);
		console.log(`⏱️ ================================`);
		console.log(`🎯 Resultado final (${result.length} chars): "${result.substring(0, 100)}..."`);

		return result || '';
	} catch (error) {
		console.error(`❌ [WHISPER LOCAL${isPartial ? ' PARTIAL' : ''}] Erro:`, error.message);

		// Log do erro completo
		if (error.code) console.error(`Error code: ${error.code}`);
		if (error.signal) console.error(`Signal: ${error.signal}`);
		if (error.stderr) {
			console.error(`STDERR (primeiros 1000 chars):`, error.stderr.substring(0, 1000));
		}

		if (isPartial) return '';
		throw error;
	} finally {
		// Limpa arquivos temporários
		try {
			if (fs.existsSync(tempWebmPath)) fs.unlinkSync(tempWebmPath);
			if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
		} catch (e) {
			console.warn('⚠️ Erro ao limpar temporários:', e.message);
		}
	}
}

// 🔥 ADICIONE ESTA FUNÇÃO PARA CONVERSÃO (se ainda não existir)
function convertWebMToWAV(inputPath, outputPath) {
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

// Handlers específicos
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
   HANDLER DE TESTE
=============================== */
// Handler de teste corrigido
ipcMain.handle('test-whisper-local', async () => {
	console.log('🧪 Teste manual do Whisper local chamado...');

	// Verificar se existem
	if (!fs.existsSync(WHISPER_EXE) || !fs.existsSync(WHISPER_MODEL)) {
		return {
			success: false,
			error: 'Arquivos do Whisper não encontrados',
			exe: WHISPER_EXE,
			model: WHISPER_MODEL,
		};
	}

	// Criar arquivo WAV de teste REAL (não silêncio)
	const tempDir = app.getPath('temp');
	const testWav = path.join(tempDir, `test-whisper-${Date.now()}.wav`);

	try {
		// Cria um WAV simples com um tom (não silêncio)
		const sampleRate = 16000;
		const duration = 1; // 1 segundo
		const frequency = 440; // Hz (Lá)

		// Gera um tom simples
		const numSamples = duration * sampleRate;
		const samples = new Int16Array(numSamples);

		for (let i = 0; i < numSamples; i++) {
			// Gera uma onda senoidal
			const t = i / sampleRate;
			samples[i] = Math.floor(32767 * 0.1 * Math.sin(2 * Math.PI * frequency * t));
		}

		// Cria header WAV
		const header = Buffer.alloc(44);
		header.write('RIFF', 0);
		header.writeUInt32LE(36 + samples.length * 2, 4); // ChunkSize
		header.write('WAVE', 8);
		header.write('fmt ', 12);
		header.writeUInt32LE(16, 16); // Subchunk1Size
		header.writeUInt16LE(1, 20); // AudioFormat (PCM)
		header.writeUInt16LE(1, 22); // NumChannels
		header.writeUInt32LE(sampleRate, 24); // SampleRate
		header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
		header.writeUInt16LE(2, 32); // BlockAlign
		header.writeUInt16LE(16, 34); // BitsPerSample
		header.write('data', 36);
		header.writeUInt32LE(samples.length * 2, 40); // Subchunk2Size

		// Converte samples para buffer
		const sampleBuffer = Buffer.from(samples.buffer);
		const wavFile = Buffer.concat([header, sampleBuffer]);

		fs.writeFileSync(testWav, wavFile);
		console.log(`📁 WAV de teste criado: ${testWav} (${wavFile.length} bytes)`);

		// Executa whisper
		console.log('Executando whisper-cli.exe...');
		const { stdout, stderr } = await execFileAsync(
			WHISPER_EXE,
			[
				'-m',
				WHISPER_MODEL,
				'-f',
				testWav,
				'-l',
				'pt',
				'-otxt',
				'-t',
				'2',
				'-np', // não imprimir logs
				'-nt', // não imprimir timestamps
			],
			{ timeout: 15000 },
		);

		// Tenta extrair resultado
		let output = '';
		if (stdout && stdout.trim()) {
			output = stdout.trim();
		} else if (stderr && stderr.trim()) {
			// Tenta extrair do stderr
			const lines = stderr.split('\n');
			for (const line of lines) {
				if (line.includes('[') && line.includes(']')) {
					const match = line.match(/\[([^\]]+)\]/);
					if (match && match[1]) {
						output = match[1].trim();
						break;
					}
				}
			}
			if (!output) {
				output = stderr.trim();
			}
		}

		console.log(`✅ Whisper output: "${output}"`);

		// Limpar
		fs.unlinkSync(testWav);

		return {
			success: true,
			message: output ? 'Whisper local funciona!' : 'Whisper executou mas retornou vazio',
			output: output || '(vazio)',
			rawOutput: stdout || '',
			rawError: stderr || '',
		};
	} catch (error) {
		// Limpar mesmo em caso de erro
		if (fs.existsSync(testWav)) {
			fs.unlinkSync(testWav);
		}

		return {
			success: false,
			error: error.message,
			code: error.code,
			stderr: error.stderr || '',
			stdout: error.stdout || '',
		};
	}
});

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
			console.log('🚀 Iniciando servidor Vosk (Python)...');

			voskProcess = spawn('python', ['vosk-server.py'], {
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

		console.log(`🎤 Enviando para Vosk: ${buffer.length} bytes`);

		// Codifica áudio em base64 (JSON-safe)
		const audioBase64 = buffer.toString('base64');

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

		console.log('🔄 Finalizando Vosk...');

		const command = { type: 'reset' };
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
					console.log('✅ Vosk reset:', response);
					resolve({ final: '' });
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
