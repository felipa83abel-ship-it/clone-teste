// @ts-nocheck
// ffmpeg import causa erros de type em node_modules

/**
 * 🎤 WHISPER STT (Speech-to-Text) - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição com Whisper (Local).
 * ✅ FASE 4.1: Removido whisper-1 (OpenAI/Cloud)
 * - Suporte a whisper-cpp-local (offline, alta precisão)
 * - Captura de áudio via MediaRecorder + AudioWorklet
 * - Detecção de silêncio automática (sem streaming, mas com VAD)
 * - Transcrição batch com auto-trigger por silêncio
 *
 * Uso:
 * - startAudioWhisper(UIElements)
 * - stopAudioWhisper()
 * - switchDeviceWhisper(INPUT|OUTPUT, newDeviceId)
 */

// ⚠️ Proteção contra redeclaração (quando carregado via <script> tag múltiplas vezes)
if (typeof globalThis !== 'undefined' && globalThis._sttWhisperLoaded) {
  console.warn('⚠️ stt-whisper.js já foi carregado, ignorando redeclaração');
} else if (typeof globalThis !== 'undefined') {
  globalThis._sttWhisperLoaded = true;

  /* ================================ */
  //	IMPORTS
  /* ================================ */

  // ipcRenderer será inicializado por renderer.js
  // Usar função getter para lazy evaluation
  const getVADEngine = () => globalThis.vadEngine;

  // 🔥 USA INSTÂNCIA GLOBAL CRIADA EM RENDERER.JS
  // Não criar nova instância, usar a que já existe em globalThis.eventBus
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const { promisify } = require('node:util');
  const ffmpeg = require('fluent-ffmpeg');

  const { execFile } = require('node:child_process');
  const execFileAsync = promisify(execFile);

  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
  }

  const getEventBus = () => globalThis.eventBus;
  /* ================================ */
  //	CONSTANTES
  /* ================================ */

  // Configuração de Áudio 16kHz
  const AUDIO_MIME_TYPE = 'audio/webm';

  // Detecção de silêncio
  const MINIMUM_CAPTURE_BYTES = 2048; // evita WebMs minúsculos que quebram o ffmpeg

  // Configuração Whisper Local
  const WHISPER_CLI_EXE = path.join(__dirname, 'models-stt/whisper', 'bin', 'whisper-cli.exe');
  const WHISPER_MODEL = path.join(__dirname, 'models-stt/whisper', 'models', 'ggml-tiny.bin');
  const WHISPER_LOCAL_TIMEOUT_MS = 10000;
  const WHISPER_LOCAL_PARTIAL_TIMEOUT_MS = 1500;
  const WHISPER_WARMUP_FILENAME = 'whisper-warmup.wav';
  const WARMUP_DURATION_SECONDS = 1;
  const WARMUP_SAMPLE_RATE = 16000;

  /* ================================ */
  //	ESTADO GLOBAL DO WHISPER
  /* ================================ */

  // VAD Engine
  let vad = null;

  // Estado de readiness do Whisper Local
  let whisperLocalReady = false;
  let whisperLocalWarmupPromise = null;

  // whisperState mantém seu próprio estado interno
  const whisperState = {
    input: {
      // ========== PROPRIEDADES COMUNS (CORE) ==========
      _isActive: false,
      _stream: null,
      _audioContext: null,
      _processor: null,
      _source: null,
      _startAt: null,
      _isSwitching: false,
      _deviceId: null,

      // ========== GETTERS/SETTERS PADRÃO (COMUM A TODOS) ==========
      isActive() {
        return this._isActive;
      },
      setActive(val) {
        this._isActive = val;
      },
      stream() {
        return this._stream;
      },
      setStream(val) {
        this._stream = val;
      },
      audioContext() {
        return this._audioContext;
      },
      setAudioContext(val) {
        this._audioContext = val;
      },
      processor() {
        return this._processor;
      },
      setProcessor(val) {
        this._processor = val;
      },
      source() {
        return this._source;
      },
      setSource(val) {
        this._source = val;
      },
      startAt() {
        return this._startAt;
      },
      setStartAt(val) {
        this._startAt = val;
      },
      isSwitching() {
        return this._isSwitching;
      },
      setIsSwitching(val) {
        this._isSwitching = val;
      },
      deviceId() {
        return this._deviceId;
      },
      setDeviceId(val) {
        this._deviceId = val;
      },

      // ========== PROPRIEDADES ESPECÍFICAS DO WHISPER ==========
      _mediaRecorder: null,
      _audioChunks: [],

      mediaRecorder() {
        return this._mediaRecorder;
      },
      setMediaRecorder(val) {
        this._mediaRecorder = val;
      },
      audioChunks() {
        return this._audioChunks;
      },
      setAudioChunks(val) {
        this._audioChunks = val;
      },

      // ========== PROPRIEDADES AUXILIARES (VAD + UI STATE) ==========
      author: 'Você',
      lastTranscript: '',
      inSilence: false,
      lastPercent: 0,
      shouldFinalizeAskCurrent: false,
      _lastIsSpeech: false,
      _lastVADTimestamp: null,
      lastActive: null,
      vadWindow: [],
      noiseStartTime: null,
      noiseStopTime: null,
    },
    output: {
      // ========== PROPRIEDADES COMUNS (CORE) ==========
      _isActive: false,
      _stream: null,
      _audioContext: null,
      _processor: null,
      _source: null,
      _startAt: null,
      _isSwitching: false,
      _deviceId: null,

      // ========== GETTERS/SETTERS PADRÃO (COMUM A TODOS) ==========
      isActive() {
        return this._isActive;
      },
      setActive(val) {
        this._isActive = val;
      },
      stream() {
        return this._stream;
      },
      setStream(val) {
        this._stream = val;
      },
      audioContext() {
        return this._audioContext;
      },
      setAudioContext(val) {
        this._audioContext = val;
      },
      processor() {
        return this._processor;
      },
      setProcessor(val) {
        this._processor = val;
      },
      source() {
        return this._source;
      },
      setSource(val) {
        this._source = val;
      },
      startAt() {
        return this._startAt;
      },
      setStartAt(val) {
        this._startAt = val;
      },
      isSwitching() {
        return this._isSwitching;
      },
      setIsSwitching(val) {
        this._isSwitching = val;
      },
      deviceId() {
        return this._deviceId;
      },
      setDeviceId(val) {
        this._deviceId = val;
      },

      // ========== PROPRIEDADES ESPECÍFICAS DO WHISPER ==========
      _mediaRecorder: null,
      _audioChunks: [],

      mediaRecorder() {
        return this._mediaRecorder;
      },
      setMediaRecorder(val) {
        this._mediaRecorder = val;
      },
      audioChunks() {
        return this._audioChunks;
      },
      setAudioChunks(val) {
        this._audioChunks = val;
      },

      // ========== PROPRIEDADES AUXILIARES (VAD + UI STATE) ==========
      author: 'Outros',
      lastTranscript: '',
      inSilence: false,
      lastPercent: 0,
      shouldFinalizeAskCurrent: false,
      _lastIsSpeech: false,
      _lastVADTimestamp: null,
      lastActive: null,
      vadWindow: [],
      noiseStartTime: null,
      noiseStopTime: null,
    },
  };

  /* ================================ */
  //	SERVIÇO WHISPER
  /* ================================ */

  // Verifica se os arquivos do Whisper.cpp existem
  function checkWhisperFiles() {
    const exeExists = fs.existsSync(WHISPER_CLI_EXE);
    const modelExists = fs.existsSync(WHISPER_MODEL);
    return exeExists && modelExists;
  }

  // Realiza warm-up do Whisper Local
  async function warmupWhisperLocal() {
    if (whisperLocalReady) {
      return true;
    }

    if (whisperLocalWarmupPromise) {
      return whisperLocalWarmupPromise;
    }

    if (!checkWhisperFiles()) {
      throw new Error('Arquivos do Whisper.cpp não foram encontrados para o warm-up');
    }

    const warmupPath = path.join(os.tmpdir(), WHISPER_WARMUP_FILENAME);
    whisperLocalWarmupPromise = (async () => {
      try {
        createWarmupWav(warmupPath);
        await execFileAsync(
          WHISPER_CLI_EXE,
          ['-m', WHISPER_MODEL, '-f', warmupPath, '-l', 'pt', '-otxt', '-t', '4', '-np', '-nt'],
          {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 5,
          }
        );
        whisperLocalReady = true;
        return true;
      } catch (error) {
        console.error('❌ Warm-up Whisper falhou:', error.message);
        whisperLocalReady = false;
        throw error;
      } finally {
        removeFileIfExists(warmupPath);
        whisperLocalWarmupPromise = null;
      }
    })();

    return whisperLocalWarmupPromise;
  }

  function createWarmupWav(filePath) {
    const samples = WARMUP_DURATION_SECONDS * WARMUP_SAMPLE_RATE;
    const byteRate = WARMUP_SAMPLE_RATE * 2;
    const blockAlign = 2;
    const buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(WARMUP_SAMPLE_RATE, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);
    fs.writeFileSync(filePath, buffer);
  }

  // Remove arquivo temporário se existir
  function removeFileIfExists(filepath) {
    if (!filepath) return;
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (error) {
      console.warn(`⚠️ Não foi possível remover ${filepath}:`, error.message);
    }
  }

  // Prepara arquivo WAV a partir do buffer de áudio WebM
  async function prepareWavFile(audioBuffer, tempWebmPath, tempWavPath) {
    fs.writeFileSync(tempWebmPath, Buffer.from(audioBuffer));
    await convertWebMToWAVFile(tempWebmPath, tempWavPath);
  }

  // Converte WebM para WAV usando ffmpeg
  function convertWebMToWAVFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      // @ts-ignore - ffmpeg pode ser function ou method, TypeScript não resolve bem
      ffmpeg(inputPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(globalThis.AUDIO_SAMPLE_RATE)
        .audioChannels(1)
        .format('wav')
        .on('end', resolve)
        .on('error', (err) => {
          console.error(
            '❌ Erro na conversão WebM → WAV:',
            err instanceof Error ? err.message : String(err)
          );
          reject(err);
        })
        .save(outputPath);
    });
  }

  // Processa arquivo WAV com Whisper.cpp
  async function processWhisperFile(whisperModelPath, tempWavPath, isPartial = false) {
    const args = [
      '-m',
      whisperModelPath,
      '-f',
      tempWavPath,
      '-l',
      'pt',
      '-otxt',
      '-t',
      '4',
      '-np',
      '-nt',
    ];
    if (isPartial) {
      args.push('-d', '3000', '-ml', '50');
    }

    debugLogWhisper(`🚀 Executando Whisper: ${WHISPER_CLI_EXE} ${args.join(' ')}`, false);
    const timeout = isPartial ? WHISPER_LOCAL_PARTIAL_TIMEOUT_MS : WHISPER_LOCAL_TIMEOUT_MS;
    const { stdout } = await execFileAsync(WHISPER_CLI_EXE, args, {
      timeout,
      maxBuffer: 1024 * 1024 * 5,
    });
    return (stdout || '').trim();
  }

  // Log detalhado de erros do Whisper Local
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
    if (tempWavPath && fs.existsSync(tempWavPath)) {
      const stats = fs.statSync(tempWavPath);
      console.error(`   📝 WAV file existe: ${stats.size} bytes`);
    } else {
      console.error(`   ❌ WAV file NÃO EXISTE!`);
    }
  }

  // Transcreve áudio com Whisper.cpp localmente
  async function transcribeWithWhisperLocal(buffer, source) {
    debugLogWhisper(`🚀 Enviando para Whisper.cpp (local, alta precisão)...`, true);

    if (!checkWhisperFiles()) {
      throw new Error('Arquivos do Whisper.cpp não encontrados!');
    }

    await warmupWhisperLocal();

    const tempDir = os.tmpdir();
    const tempWebmPath = path.join(
      tempDir,
      `whisper-${source}-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`
    );
    const tempWavPath = tempWebmPath.replace('.webm', '.wav');

    try {
      await prepareWavFile(buffer, tempWebmPath, tempWavPath);
      const startTime = Date.now();
      const result = await processWhisperFile(WHISPER_MODEL, tempWavPath);
      debugLogWhisper(`✅ Whisper.cpp concluído em ${Date.now() - startTime}ms`, true);
      return result;
    } catch (error) {
      logWhisperError(error, tempWavPath);
      throw error;
    } finally {
      removeFileIfExists(tempWebmPath);
      removeFileIfExists(tempWavPath);
    }
  }

  // Transcreve áudio com o modelo Whisper configurado
  async function transcribeWhisper(audioBlob, source) {
    // ✅ Apenas whisper-cpp-local (offline) está disponível após remover whisper-1
    const sttModel = 'whisper-cpp-local';
    debugLogWhisper(`🎤 Transcrição (${sttModel}): ${audioBlob.size} bytes`, true);

    const buffer = Buffer.from(await audioBlob.arrayBuffer());

    try {
      let result;

      if (sttModel === 'whisper-cpp-local') {
        result = await transcribeWithWhisperLocal(buffer, source);
      } else {
        throw new Error(
          `Modelo Whisper desconhecido: ${sttModel} (apenas whisper-cpp-local está disponível)`
        );
      }

      debugLogWhisper(
        `📝 Resultado (${result.length} chars): "${result.substring(0, 80)}${result.length > 80 ? '...' : ''}"`,
        false
      );
      return result;
    } catch (error) {
      console.error(`❌ Transcrição Whisper falhou (${sttModel}):`, error.message);
      throw new Error(
        `Transcrição com ${sttModel} falhou: ${error.message}. Altere o modelo em "Configurações → API e Modelos"`
      );
    }
  }

  /* ================================ */
  //	VAD (VOICE ACTIVITY DETECTION)
  /* ================================ */

  // Atualiza estado VAD
  function updateVADState(vars, isSpeech) {
    vars._lastIsSpeech = !!isSpeech;
    vars._lastVADTimestamp = Date.now();
    if (isSpeech) vars.lastActive = Date.now();
  }

  /* ================================ */
  //	WHISPER - INICIAR FLUXO (STT)
  /* ================================ */

  // Inicia captura de áudio do dispositivo de entrada ou saída com Whisper
  async function startWhisper(source, UIElements) {
    // Configurações específicas por source
    const config = {
      input: {
        deviceKey: 'inputSelect',
        accessMessage: '🎤 Solicitando acesso à entrada de áudio (Microfone)...',
        threshold: 0.02,
        startLog: '▶️ Captura Whisper INPUT iniciada',
      },
      output: {
        deviceKey: 'outputSelect',
        accessMessage: '🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...',
        threshold: 0.005,
        startLog: '▶️ Captura Whisper OUTPUT iniciada',
      },
    };

    const cfg = config[source];
    if (!cfg) {
      throw new Error(
        `❌ Source inválido: ${source}. Use ${globalThis.INPUT} ou ${globalThis.OUTPUT}`
      );
    }

    const vars = whisperState[source];

    if (vars.isActive?.()) {
      console.warn(`⚠️ Whisper ${source.toUpperCase()} já ativo`);
      return;
    }

    try {
      // Obtém o dispositivo selecionado no UI
      const deviceId = UIElements[cfg.deviceKey]?.value;

      debugLogWhisper(
        `🔊 Iniciando captura ${source.toUpperCase()} com dispositivo: ${deviceId}`,
        false
      );

      // Solicita acesso ao dispositivo selecionado
      debugLogWhisper(cfg.accessMessage, false);

      // Obtém stream de áudio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      debugLogWhisper(`✅ Acesso ao áudio ${source.toUpperCase()} autorizado`, true);

      // Cria MediaRecorder para captura de áudio (ANTES de AudioWorklet para ter referência)
      const mediaRecorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME_TYPE });

      // Acumula chunks conforme são capturados
      const audioChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      // Quando para, envia para transcrição
      mediaRecorder.onstop = async () => {
        debugLogWhisper(`🛑 MediaRecorder parado para ${source.toUpperCase()}`, false);

        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: AUDIO_MIME_TYPE });
          if (audioBlob.size < MINIMUM_CAPTURE_BYTES) {
            console.warn(
              `⚠️ Captura ${source.toUpperCase()} muito curta (${audioBlob.size} bytes); pulando transcrição`
            );
          } else {
            try {
              const transcribedText = await transcribeWhisper(audioBlob, source);
              handleWhisperMessage(transcribedText, source);
            } catch (error) {
              console.error(`❌ Erro ao transcrever ${source}:`, error.message);
            }
          }
        }

        // Limpa chunks para próxima gravação
        audioChunks.length = 0;

        // Reinicia MediaRecorder para continuar capturando após a transcrição
        if (vars.isActive() && mediaRecorder.state === 'inactive') {
          try {
            mediaRecorder.start();
            debugLogWhisper(`▶️ MediaRecorder reiniciado para ${source.toUpperCase()}`, false);
          } catch (restartError) {
            console.error(`❌ Erro ao reiniciar MediaRecorder (${source}):`, restartError);
          }
        }
      };

      // Cria AudioContext 16kHz para processamento em tempo real (VAD)
      const audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)({
        sampleRate: globalThis.AUDIO_SAMPLE_RATE,
      });
      await audioContext.audioWorklet.addModule(globalThis.AUDIO_WORKLET_PROCESSOR_PATH);

      // Cria MediaStreamSource e guarda via whisperState
      const mediaSource = audioContext.createMediaStreamSource(stream);

      // Inicia AudioWorklet para captura e processamento de áudio em tempo real
      const processor = new AudioWorkletNode(audioContext, globalThis.STT_AUDIO_WORKLET_PROCESSOR);
      processor.port.postMessage({ type: 'setThreshold', threshold: cfg.threshold });
      processor.port.onmessage = (event) => {
        // Processa mensagens do AudioWorklet (audioData e volumeUpdate separadamente)
        processIncomingAudioMessageWhisper(source, event.data, mediaRecorder).catch((error_) =>
          console.error(`❌ Erro ao processar mensagem do worklet (${source}):`, error_)
        );
      };

      // Conecta fluxo: Source -> processor -> destination
      mediaSource.connect(processor);
      processor.connect(audioContext.destination);

      // Atualiza referências de estado
      vars.setStream(stream);
      vars.setAudioContext(audioContext);
      vars.setSource(mediaSource);
      vars.setProcessor(processor);
      vars.setActive(true);
      vars.setStartAt(Date.now());
      vars.lastActive = Date.now();
      vars.setMediaRecorder(mediaRecorder);

      // Inicia gravação
      mediaRecorder.start();

      debugLogWhisper(cfg.startLog, true);
    } catch (error) {
      console.error(`❌ Erro ao iniciar Whisper ${source.toUpperCase()}:`, error);
      try {
        vars.setActive(false);
      } catch (error_) {
        console.warn('⚠️ Aviso ao resetar active flag:', error_ && (error_.message || error_));
      }
      stopWhisper(source);
      throw error;
    }
  }

  // Processa mensagens de áudio recebida do AudioWorklet
  async function processIncomingAudioMessageWhisper(source, data, mediaRecorder) {
    const vars = whisperState[source];
    if (data.type === 'audioData') {
      // Processa chunk de áudio PCM16
      onAudioChunkWhisper(source, data, vars);
    } else if (data.type === 'volumeUpdate') {
      vars.lastPercent = data.percent;

      // Processa atualização de volume/VAD
      handleVolumeUpdate(source, data.percent);

      // Detecta silêncio e dispara transcrição automática
      handleSilenceDetectionWhisper(source, data.percent, mediaRecorder);
    }
  }

  // Processa chunk de áudio PCM16 do AudioWorklet
  function onAudioChunkWhisper(source, data, vars) {
    const { pcm16 } = data;

    if (!pcm16 || pcm16.length === 0) return;

    // VAD: Detecta fala usando VAD Engine
    const isSpeech = vad?.detectSpeech(pcm16, vars.lastPercent, vars.vadWindow);
    updateVADState(vars, isSpeech);
  }

  // Trata detecção de silêncio com VAD ou fallback
  function handleSilenceDetectionWhisper(source, percent, mediaRecorder) {
    const vars = whisperState[source];
    const silenceTimeout =
      source === globalThis.INPUT
        ? globalThis.SILENCE_TIMEOUT_INPUT
        : globalThis.SILENCE_TIMEOUT_OUTPUT;
    const now = Date.now();

    // Decisão principal: VAD se disponível, senão fallback por volume
    const useVADDecision = vad?.isEnabled() && vars._lastIsSpeech !== undefined;
    const effectiveSpeech = useVADDecision ? !!vars._lastIsSpeech : percent > 0;

    debugLogWhisper(
      `🔍 VAD ${source}: ${vars._lastIsSpeech ? 'speech' : 'silence'} - 🔊 volume: ${percent.toFixed(2)}%`,
      false
    );

    if (effectiveSpeech) {
      // Se detectou fala, resetamos estado de silêncio
      if (vars.inSilence) {
        if (!vars.noiseStartTime) vars.noiseStartTime = Date.now();

        const noiseDuration = vars.noiseStartTime - vars.noiseStopTime;
        vars.noiseStopTime = null;

        debugLogWhisper(
          `🟢 🟢 🟢 ***** 🔊 Fala real detectada após (${noiseDuration}ms) *****`,
          true
        );
      }

      vars.inSilence = false;
      vars.shouldFinalizeAskCurrent = false;
      vars.lastActive = now;
      vars.noiseStartTime = null;
    } else {
      // Silêncio detectado → verifica se já passou o timeout
      const elapsed = now - vars.lastActive;

      // Entrando em silêncio estável
      if (elapsed >= silenceTimeout && !vars.inSilence) {
        vars.inSilence = true;
        vars.shouldFinalizeAskCurrent = true;
        vars.noiseStopTime = Date.now();

        debugLogWhisper(`🔴 🔴 🔴 ***** 🔇 Silêncio estável detectado (${elapsed}ms) *****`, true);

        // Dispara finalize apenas uma vez
        mediaRecorder.stop();
      }
    }
  }

  /* ================================ */
  //	PROCESSAMENTO DE MENSAGENS
  /* ================================ */

  // Processa mensagens do Whisper (final ou parcial)
  function handleWhisperMessage(result, source = globalThis.INPUT) {
    handleFinalWhisperMessage(source, result);
  }

  // Processa mensagens finais do Whisper (transcrições completas)
  function handleFinalWhisperMessage(source, transcript) {
    debugLogWhisper(`📝 🟢 Handle FINAL [${source.toUpperCase()}]: "${transcript}"`, true);

    const vars = whisperState[source];
    vars.lastTranscript = transcript.trim() ? transcript : vars.lastTranscript;

    if (transcript.trim()) {
      // Adiciona placeholder com transcrição
      const placeholderId = `whisper-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const metrics = calculateTimingMetrics(vars);

      // Adiciona transcrição com placeholder na UI
      addTranscriptPlaceholder(vars.author, placeholderId, metrics.startStr);
      // Preenche placeholder com resultado final
      fillTranscriptPlaceholder(vars.author, transcript, placeholderId, metrics);
      // Limpa interim do UI
      clearInterim(source);
    }

    // Atualiza CURRENT question (apenas para output)
    updateCurrentQuestion(source, transcript, false);
  }

  /* ================================ */
  //	HELPERS
  /* ================================ */

  // Atualiza volume recebido do AudioWorklet
  function handleVolumeUpdate(source, percent) {
    // Emite volume para UI
    const ev = source === globalThis.INPUT ? 'inputVolumeUpdate' : 'outputVolumeUpdate';
    getEventBus().emit(ev, { percent });
  }

  // Adiciona transcrição com placeholder ao UI
  function addTranscriptPlaceholder(author, placeholderId, timeStr) {
    getEventBus().emit('transcriptAdd', {
      author,
      text: '...',
      timeStr,
      elementId: 'conversation',
      placeholderId,
    });
  }

  // Preenche placeholder com transcrição final
  function fillTranscriptPlaceholder(author, transcript, placeholderId, metrics) {
    getEventBus().emit('placeholderFulfill', {
      speaker: author,
      text: transcript,
      placeholderId,
      ...metrics,
      showMeta: false,
    });
  }

  // Limpa interim transcript do UI
  function clearInterim(source) {
    const interimId =
      source === globalThis.INPUT ? 'whisper-interim-input' : 'whisper-interim-output';
    getEventBus().emit('clearInterim', { id: interimId });
  }

  // Atualiza interim transcript no UI
  function _updateInterim(source, transcript, author) {
    const interimId =
      source === globalThis.INPUT ? 'whisper-interim-input' : 'whisper-interim-output';
    getEventBus().emit('updateInterim', {
      id: interimId,
      speaker: author,
      text: transcript,
    });
  }

  // Atualiza CURRENT question (apenas para output)
  function updateCurrentQuestion(source, transcript, isInterim = false) {
    const vars = whisperState[source];
    if (source === globalThis.OUTPUT && globalThis.RendererAPI?.handleCurrentQuestion) {
      globalThis.RendererAPI.handleCurrentQuestion(vars.author, transcript, {
        isInterim,
        shouldFinalizeAskCurrent: vars.shouldFinalizeAskCurrent,
      });
      // 🔥 Só reseta quando for mensagem FINAL (não interim)
      if (!isInterim && vars.shouldFinalizeAskCurrent) vars.shouldFinalizeAskCurrent = false;
    }
  }

  // Calcula métricas de timing para transcrição
  function calculateTimingMetrics(vars) {
    const startAt = vars.startAt?.();
    const now = Date.now();
    const elapsedMs = startAt ? now - startAt : 0;
    return {
      startStr: startAt
        ? new Date(startAt).toLocaleTimeString()
        : new Date(now).toLocaleTimeString(),
      stopStr: new Date(now).toLocaleTimeString(),
      recordingDuration: (elapsedMs / 1000).toFixed(2),
      latency: (elapsedMs / 1000).toFixed(2),
      total: (elapsedMs / 1000).toFixed(2),
    };
  }

  /* ================================ */
  //	TROCA DE DISPOSITIVO
  /* ================================ */

  // Troca dinâmica do dispositivo Whisper (input/output)
  async function changeDeviceWhisper(source, newDeviceId) {
    const vars = whisperState[source];

    debugLogWhisper(
      `🔄 changeDeviceWhisper CHAMADO: source=${source}, newDeviceId="${newDeviceId}"`,
      false
    );

    // Verifica se já está trocando
    if (vars.isSwitching?.()) {
      console.warn(`⚠️ Já em processo de troca de dispositivo ${source.toUpperCase()}`);
      return;
    }

    // 🔥 INÍCIO: Marca como trocando para evitar chamadas duplicadas
    vars.setIsSwitching(true);

    try {
      // CASO 1: Device vazio → STOP
      const normalizedDeviceId = newDeviceId?.toString().toLowerCase().trim() || '';
      if (!normalizedDeviceId || normalizedDeviceId === 'nenhum') {
        debugLogWhisper(
          `🛑 Device vazio para ${source.toUpperCase()}, parando Whisper... (deviceId="${newDeviceId}")`,
          false
        );
        stopWhisper(source);
        return;
      }

      // CASO 2: Inativo + device válido → START
      if (!vars.isActive()) {
        debugLogWhisper(
          `🚀 Whisper ${source.toUpperCase()} inativo, iniciando com novo dispositivo...`,
          false
        );
        const uiElement = {
          [source === globalThis.INPUT ? 'inputSelect' : 'outputSelect']: { value: newDeviceId },
        };
        await startWhisper(source, uiElement);
        return;
      }

      // CASO 3: Ativo + device alterado → RESTART
      if (vars.deviceId?.() !== newDeviceId) {
        debugLogWhisper(
          `🔄 Whisper ${source.toUpperCase()} ativo com device diferente, reiniciando...`,
          false
        );
        try {
          // Para completamente o Whisper anterior
          stopWhisper(source);
          // Aguarda um pouco para liberar recursos
          await new Promise((resolve) => setTimeout(resolve, 300));
          // Reinicia com novo dispositivo
          const uiElement = {
            [source === 'input' ? 'inputSelect' : 'outputSelect']: { value: newDeviceId },
          };
          await startWhisper(source, uiElement);
        } catch (error) {
          console.error(`❌ Erro ao reiniciar após troca de dispositivo:`, error);
        }
      }
    } finally {
      // 🔥 FIM: Seta deviceId e marca como não trocando mais
      vars.setDeviceId(newDeviceId);
      vars.setIsSwitching(false);
    }
  }

  /* ================================ */
  //	WHISPER - PARAR FLUXO (STT)
  /* ================================ */

  // Para captura de áudio
  function stopWhisper(source) {
    const vars = whisperState[source];

    // 🔥 IMPORTANTE: Faz cleanup MESMO que isActive() seja false
    // Pode haver estado inconsistente (ex: recorder ativo mas isActive=false)

    try {
      // Desconecta AudioWorklet
      if (vars.processor()) {
        vars.processor().disconnect();
        vars.setProcessor(null);
      }

      if (vars.source()) {
        vars.source().disconnect();
        vars.setSource(null);
      }

      // Fecha AudioContext
      if (vars.audioContext()) {
        if (vars.audioContext().state !== 'closed') {
          vars
            .audioContext()
            .close()
            .catch((err) => console.warn(`⚠️ Erro ao fechar AudioContext:`, err));
        }
        vars.setAudioContext(null);
      }

      // Para gravação
      if (vars.mediaRecorder() && vars.mediaRecorder().state !== 'inactive') {
        vars.mediaRecorder().stop();
      }

      // Limpa stream
      if (vars.stream()) {
        vars
          .stream()
          .getTracks()
          .forEach((track) => track.stop());
      }

      // Reseta estado
      vars.setActive(false);
      vars.setStream(null);
      vars.setMediaRecorder(null);
      vars.setAudioChunks([]);

      // Zera o oscilador no UI
      handleVolumeUpdate(source, 0);

      debugLogWhisper(`🛑 Captura Whisper ${source.toUpperCase()} parada`, true);
    } catch (error) {
      console.error(`❌ Erro ao parar Whisper ${source.toUpperCase()}:`, error);
    }
  }

  /* ================================ */
  //	DEBUG LOG WHISPER
  /* ================================ */

  /**
   * Log de debug padronizado para stt-whisper.js
   * Por padrão nunca loga, se quiser mostrar é só passar true.
   * @param {*} msg
   * @param {boolean} showLog - true para mostrar, false para ignorar
   */

  /**
   * Log de debug padronizado para stt-whisper.js
   * Por padrão nunca loga, se quiser mostrar é só passar true.
   * @param {...any} args - Argumentos para log (último pode ser booleano showLog)
   */
  function debugLogWhisper(...args) {
    const maybeFlag = args.at(-1);
    const showLog = typeof maybeFlag === 'boolean' ? maybeFlag : false;

    if (!showLog) return; // Ignorar se showLog é false

    const nowLog = new Date();
    const timeStr =
      `${nowLog.getHours().toString().padStart(2, '0')}:` +
      `${nowLog.getMinutes().toString().padStart(2, '0')}:` +
      `${nowLog.getSeconds().toString().padStart(2, '0')}.` +
      `${nowLog.getMilliseconds().toString().padStart(3, '0')}`;

    const cleanArgs = typeof maybeFlag === 'boolean' ? args.slice(0, -1) : args;
    // Logar no console
    console.log(
      `%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug em stt-whisper.js:`,
      'color: blue; font-weight: bold;',
      ...cleanArgs
    );

    // Registrar em Logger para histórico de debug
    globalThis.Logger.debug(`[stt-whisper] ${cleanArgs.join(' ')}`, { timeStr });
  }

  /* ================================ */
  //	INTERFACE PÚBLICA
  /* ================================ */

  /**
   * Inicia Whisper para INPUT + OUTPUT
   */
  async function startAudioWhisper(UIElements) {
    try {
      // Inicializa VAD Engine (singleton)
      vad = getVADEngine();
      debugLogWhisper(
        `✅ VAD Engine inicializado - Status: ${JSON.stringify(vad.getStatus())}`,
        true
      );

      // 🔥 Whisper: Inicia INPUT/OUTPUT
      if (UIElements.inputSelect?.value) await startWhisper(globalThis.INPUT, UIElements);
      if (UIElements.outputSelect?.value) await startWhisper(globalThis.OUTPUT, UIElements);
    } catch (error) {
      console.error('❌ Erro ao iniciar Whisper:', error);
      throw error;
    }
  }

  /**
   * Para Whisper para INPUT + OUTPUT
   */
  function stopAudioWhisper() {
    try {
      // 🎤 Whisper: Para INPUT e OUTPUT
      stopWhisper(globalThis.INPUT);
      stopWhisper(globalThis.OUTPUT);
      debugLogWhisper('🛑 Whisper completamente parado', true);
    } catch (error) {
      console.error('❌ Erro ao parar Whisper:', error);
    }
  }

  /**
   * Troca dinâmica do dispositivo (input/output) mantendo Whisper ativo
   */
  async function switchDeviceWhisper(source, newDeviceId) {
    try {
      debugLogWhisper(
        `🔄 [switchDeviceWhisper] Início: source=${source}, newDeviceId="${newDeviceId}"`,
        false
      );
      const result = await changeDeviceWhisper(source, newDeviceId);
      return result;
    } catch (err) {
      console.error(`❌ [switchDeviceWhisper] Erro em changeDeviceWhisper:`, err);
      throw err;
    }
  }

  /* ================================ */
  //	EXPORTS (CommonJS)
  /* ================================ */

  module.exports = {
    startAudioWhisper,
    stopAudioWhisper,
    switchDeviceWhisper,
  };

  // ✅ Exportar para globalThis dentro do bloco de inicialização
  if (typeof globalThis !== 'undefined') {
    globalThis.startAudioWhisper = startAudioWhisper;
    globalThis.stopAudioWhisper = stopAudioWhisper;
    globalThis.switchDeviceWhisper = switchDeviceWhisper;
  }
} // Fim da proteção contra redeclaração
