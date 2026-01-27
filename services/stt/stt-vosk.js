/**
 * 🔥 VOSK STT (Speech-to-Text) - MÓDULO INDEPENDENTE
 *
 * Implementação isolada de transcrição com Vosk,
 * - Spawn server-vosk.py AQUI no renderer (não via IPC)
 * - Comunicação stdin/stdout direta (JSON)
 * - AudioWorklet para captura e processamento de áudio bruto PCM16
 * - Usa VAD para detecção de fala (webrtcvad ou fallback de energia)
 * - Consolida interim results e transcrições finais
 *
 * Uso:
 * - startAudioVosk(UIElements)
 * - stopAudioVosk()
 * - switchDeviceVosk(INPUT|OUTPUT, newDeviceId)
 */

// ⚠️ Proteção contra redeclaração (quando carregado via <script> tag múltiplas vezes)
// Usar IIFE para preservar escopo das funções
const {
  startAudioVosk: startAudioVoskFunc,
  stopAudioVosk: stopAudioVoskFunc,
  switchDeviceVosk: switchDeviceVoskFunc,
} = (() => {
  if (globalThis._sttVoskLoaded) {
    // Retorna funções já carregadas da primeira execução
    return {
      startAudioVosk: globalThis._startAudioVoskFunc,
      stopAudioVosk: globalThis._stopAudioVoskFunc,
      switchDeviceVosk: globalThis._switchDeviceVoskFunc,
    };
  }

  globalThis._sttVoskLoaded = true;

  /* ================================ */
  //	IMPORTS
  /* ================================ */

  const { spawn } = require('node:child_process');

  // ipcRenderer será inicializado por renderer.js
  // Usar função getter para lazy evaluation
  const getVADEngine = () => globalThis.vadEngine;
  const getEventBus = () => globalThis.eventBus;

  /* ================================ */
  //	CONSTANTES
  /* ================================ */

  // Configuração Vosk
  const VOSK_CONFIG = {
    MODEL: process.env.VOSK_MODEL || './models-stt/vosk/vosk-model-small-pt-0.3',
  };

  /* ================================ */
  //	ESTADO GLOBAL DO VOSK
  /* ================================ */

  // VAD Engine
  let vad = null;

  // voskState mantém seu próprio estado interno
  const voskState = {
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

      // ========== PROPRIEDADES ESPECÍFICAS DO VOSK ==========
      _lastChunkTime: null,
      _recordingActive: false,
      _canSend: false,
      _voskProcess: null,

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

      // ========== PROPRIEDADES ESPECÍFICAS DO VOSK ==========
      _recordingActive: false,
      _canSend: false,
      _voskProcess: null,

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
  //	SERVIDOR VOSK
  /* ================================ */

  // Inicia processo Vosk (input/output) no servidor
  function initVoskProcess(source) {
    const vars = voskState[source];

    if (vars._voskProcess) {
      console.warn(`⚠️ Vosk ${source} já está rodando`);
      return vars._voskProcess;
    }

    debugLogVosk(`🚀 Iniciando Vosk (${source}) com modelo: ${VOSK_CONFIG.MODEL}...`, true);

    vars._voskProcess = spawn('python', ['server-vosk.py', VOSK_CONFIG.MODEL], {
      cwd: __dirname, // server-vosk.py está em services/stt/
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Recebe mensagens do Vosk (igual teste-vosk.js)
    vars._voskProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((rawLine) => {
        const line = rawLine.trim(); // remove espaços e \r
        if (!line) return; // ignora linhas vazias sem log

        // Ignora mensagens de controle e logs
        if (line === 'VOSK_READY' || line.startsWith('[VOSK]')) {
          debugLogVosk(`[Vosk Controle] ${line}`, false);
          return;
        }

        // Só tenta parsear se parecer JSON
        if (!(line.startsWith('{') || line.startsWith('['))) {
          debugLogVosk(`[Ignorado] ${line}`, false);
          return;
        }

        try {
          const msg = JSON.parse(line);

          if (msg.error) {
            console.error(`❌ Erro Vosk (${source}):`, msg.error);
            return;
          }

          handleVoskMessage(msg, source);
        } catch (error) {
          console.error(`❌ Erro ao processar mensagem Vosk (${source}):`, error);
          debugLogVosk(`[RAW] ${line}`, false);
        }
      });
    });

    vars._voskProcess.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        debugLogVosk(`[Vosk stderr] ${line}`, false);
      }
    });

    vars._voskProcess.on('error', (error) => {
      console.error(`❌ Erro ao spawn Vosk (${source}):`, error.message);
      vars._voskProcess = null;
    });

    vars._voskProcess.on('close', (code) => {
      debugLogVosk(`⏹️ Vosk (${source}) encerrado (código ${code})`, true);
      vars._voskProcess = null;
    });

    return vars._voskProcess;
  }

  // Para processo Vosk (input/output) no servidor
  function stopVoskProcess(source) {
    const vars = voskState[source];

    if (!vars._voskProcess) return;

    try {
      vars._voskProcess.kill('SIGTERM');
      vars._voskProcess = null;
      debugLogVosk(`🛑 Vosk (${source}) parado`, true);
    } catch (error) {
      console.error(`❌ Erro ao parar Vosk (${source}):`, error);
    }
  }

  // Envia mensagem "Finalize" para Vosk (input/output) no servidor
  function sendVoskFinalize(source) {
    const vars = voskState[source];
    if (vars._voskProcess) {
      debugLogVosk(`🔔 Enviando Finalize para Vosk (${source})`, true);
      vars._voskProcess.stdin.write(JSON.stringify({ type: 'finalize' }) + '\n');
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
  //	VOSK - INICIAR FLUXO (STT)
  /* ================================ */

  // Inicia captura de áudio do dispositivo de entrada ou saída com Vosk
  async function startVosk(source, UIElements) {
    // Configurações específicas por source
    const config = {
      input: {
        deviceKey: 'inputSelect',
        accessMessage: '🎤 Solicitando acesso à entrada de áudio (Microfone)...',
        threshold: 0.02,
        startLog: '▶️ Captura Vosk INPUT iniciada',
      },
      output: {
        deviceKey: 'outputSelect',
        accessMessage: '🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...',
        threshold: 0.005,
        startLog: '▶️ Captura Vosk OUTPUT iniciada',
      },
    };

    const cfg = config[source];
    if (!cfg) {
      throw new Error(
        `❌ Source inválido: ${source}. Use ${globalThis.INPUT} ou ${globalThis.OUTPUT}`
      );
    }

    const vars = voskState[source];

    if (vars.isActive?.()) {
      console.warn(`⚠️ Vosk ${source.toUpperCase()} já ativo`);
      return;
    }

    try {
      // Obtém o dispositivo selecionado no UI
      const deviceId = UIElements[cfg.deviceKey]?.value;

      debugLogVosk(
        `🔊 Iniciando captura ${source.toUpperCase()} com dispositivo: ${deviceId}`,
        false
      );

      // Inicia Vosk (spawn direto)
      initVoskProcess(source);

      // Solicita acesso ao dispositivo selecionado
      debugLogVosk(cfg.accessMessage, false);

      // Obtém stream de áudio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      debugLogVosk(`✅ Acesso ao áudio ${source.toUpperCase()} autorizado`, true);

      // Cria AudioContext 16kHz para processamento em tempo real (VAD)
      const audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)({
        sampleRate: globalThis.AUDIO_SAMPLE_RATE,
      });
      await audioContext.audioWorklet.addModule(globalThis.AUDIO_WORKLET_PROCESSOR_PATH);

      // Cria MediaStreamSource e guarda via voskState
      const mediaSource = audioContext.createMediaStreamSource(stream);

      // Inicia AudioWorklet para captura e processamento de áudio em tempo real
      const processor = new AudioWorkletNode(audioContext, globalThis.STT_AUDIO_WORKLET_PROCESSOR);
      processor.port.postMessage({ type: 'setThreshold', threshold: cfg.threshold });
      processor.port.onmessage = (event) => {
        // Processa mensagens do AudioWorklet (audioData e volumeUpdate separadamente)
        processIncomingAudioMessageVosk(source, event.data).catch((error_) =>
          console.error(`❌ Erro ao processar mensagem do worklet (${source}):`, error_)
        );
      };

      // Conecta fluxo: Source -> processor -> destination
      mediaSource.connect(processor);
      processor.connect(audioContext.destination);

      vars.setProcessor(processor);

      // Atualiza referências de estado
      vars.setStream(stream);
      vars.setAudioContext(audioContext);
      vars.setSource(mediaSource);
      vars.setProcessor(processor);
      vars.setActive(true);
      vars.setStartAt(Date.now());
      vars.lastActive = Date.now();
      vars._recordingActive = true;
      vars._canSend = true;

      debugLogVosk(cfg.startLog, true);
    } catch (error) {
      console.error(`❌ Erro ao iniciar Vosk ${source.toUpperCase()}:`, error);
      try {
        vars.setActive(false);
      } catch (error_) {
        console.warn('⚠️ Aviso ao resetar active flag:', error_ && (error_.message || error_));
      }
      stopVosk(source);
      throw error;
    }
  }

  // Processa mensagens de áudio recebida do AudioWorklet
  async function processIncomingAudioMessageVosk(source, data) {
    const vars = voskState[source];
    if (data.type === 'audioData') {
      // Processa chunk de áudio PCM16
      onAudioChunkVosk(source, data, vars);
    } else if (data.type === 'volumeUpdate') {
      vars.lastPercent = data.percent;

      // Processa atualização de volume/VAD
      handleVolumeUpdate(source, data.percent);

      // Detecta silêncio
      handleSilenceDetectionVosk(source, data.percent);
    }
  }

  // Processa chunk de áudio PCM16 do AudioWorklet
  async function onAudioChunkVosk(source, data, vars) {
    const pcm16Array = data.pcm16 instanceof ArrayBuffer ? new Int16Array(data.pcm16) : data.pcm16;

    if (!pcm16Array || pcm16Array.length === 0 || !vars._canSend) {
      return;
    }

    // VAD: Detecta fala usando VAD Engine
    const isSpeech = vad?.detectSpeech(data.pcm16, vars.lastPercent, vars.vadWindow);
    updateVADState(vars, isSpeech);

    try {
      const buffer = Buffer.from(pcm16Array.buffer, pcm16Array.byteOffset, pcm16Array.byteLength);
      const audioBase64 = buffer.toString('base64');

      const msg = {
        type: 'transcribe',
        format: 'pcm',
        rate: globalThis.AUDIO_SAMPLE_RATE,
        audio: audioBase64,
      };

      // Envia direto ao Vosk via stdin (não IPC!)
      // ⚠️ Verifica se o processo ainda está vivo
      if (!vars._voskProcess?.stdin) {
        console.warn(`⚠️ Processo Vosk não está disponível, ignorando chunk`);
        return;
      }

      vars._voskProcess.stdin.write(JSON.stringify(msg) + '\n');
    } catch (error) {
      console.error(`❌ Erro ao enviar chunk ao Vosk:`, error);
    }
  }

  // Trata detecção de silêncio com VAD ou fallback
  function handleSilenceDetectionVosk(source, percent) {
    const vars = voskState[source];
    const silenceTimeout =
      source === globalThis.INPUT
        ? globalThis.SILENCE_TIMEOUT_INPUT
        : globalThis.SILENCE_TIMEOUT_OUTPUT;
    const now = Date.now();

    // Decisão principal: VAD se disponível, senão fallback por volume
    const useVADDecision = vad?.isEnabled() && vars._lastIsSpeech !== undefined;
    const effectiveSpeech = useVADDecision ? !!vars._lastIsSpeech : percent > 0;

    debugLogVosk(
      `🔍 VAD ${source}: ${vars._lastIsSpeech ? 'speech' : 'silence'} - 🔊 volume: ${percent.toFixed(2)}%`,
      false
    );

    if (effectiveSpeech) {
      // Se detectou fala, resetamos estado de silêncio
      if (vars.inSilence) {
        if (!vars.noiseStartTime) vars.noiseStartTime = Date.now();

        const noiseDuration = vars.noiseStartTime - vars.noiseStopTime;
        vars.noiseStopTime = null;

        debugLogVosk(`🟢 🟢 🟢 ***** 🔊 Fala real detectada após (${noiseDuration}ms) *****`, true);
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

        const timestamp = new Date().toLocaleTimeString('pt-BR', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3,
        });
        debugLogVosk(
          `⏰ [${timestamp}] 🔴 🔴 🔴 ***** 🔇 Silêncio estável detectado (${elapsed}ms) - shouldFinalizeAskCurrent=TRUE *****`,
          true
        );

        // Dispara finalize apenas uma vez
        sendVoskFinalize(source);
      }
    }
  }

  /* ================================ */
  //	PROCESSAMENTO DE MENSAGENS
  /* ================================ */

  // Processa mensagens do Vosk (final ou parcial)
  function handleVoskMessage(result, source = globalThis.INPUT) {
    if (result?.isFinal && result?.final?.trim()) {
      handleFinalVoskMessage(source, result.final);
    } else if (result?.partial?.trim()) {
      handleInterimVoskMessage(source, result.partial);
    }
  }

  // Processa mensagens interim do Vosk (transcrições parciais)
  function handleInterimVoskMessage(source, transcript) {
    debugLogVosk(`⏳ 🟠 Handle INTERIM [${source}]: "${transcript}"`, false);

    if (!transcript?.trim()) {
      console.warn(`⚠️ Transcript interim vazio recebido do Vosk (${source}); ignorando.`);
      return;
    }

    const vars = voskState[source];
    vars.lastTranscript = transcript;

    // Atualiza interim transcript no UI
    updateInterim(source, transcript, vars.author);

    // Atualiza CURRENT question (apenas para output)
    updateCurrentQuestion(source, transcript, true);
  }

  // Processa mensagens finais do Vosk (transcrições completas)
  function handleFinalVoskMessage(source, transcript) {
    const timestamp = new Date().toLocaleTimeString('pt-BR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
    debugLogVosk(
      `⏰ [${timestamp}] 📝 🟢 Handle FINAL [${source.toUpperCase()}]: "${transcript}"`,
      false
    );

    const vars = voskState[source];
    vars.lastTranscript = transcript.trim() ? transcript : vars.lastTranscript;

    if (transcript.trim()) {
      // Adiciona placeholder com transcrição
      const placeholderId = `vosk-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
    const interimId = source === globalThis.INPUT ? 'vosk-interim-input' : 'vosk-interim-output';
    getEventBus().emit('clearInterim', { id: interimId });
  }

  // Atualiza interim transcript no UI
  function updateInterim(source, transcript, author) {
    const interimId = source === globalThis.INPUT ? 'vosk-interim-input' : 'vosk-interim-output';
    getEventBus().emit('updateInterim', {
      id: interimId,
      speaker: author,
      text: transcript,
    });
  }

  // Atualiza CURRENT question (apenas para output)
  function updateCurrentQuestion(source, transcript, isInterim = false) {
    const vars = voskState[source];
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

  // Troca dinâmica do dispositivo Vosk (input/output)
  async function changeDeviceVosk(source, newDeviceId) {
    const vars = voskState[source];

    debugLogVosk(
      `🔄 changeDeviceVosk CHAMADO: source=${source}, newDeviceId="${newDeviceId}"`,
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
        debugLogVosk(
          `🛑 Device vazio para ${source.toUpperCase()}, parando Vosk... (deviceId="${newDeviceId}")`,
          false
        );
        await stopVosk(source);
        return;
      }

      // CASO 2: Inativo + device válido → START
      if (!vars.isActive?.()) {
        debugLogVosk(
          `🚀 Vosk ${source.toUpperCase()} inativo, iniciando com novo dispositivo...`,
          false
        );
        const uiElement = {
          [source === 'input' ? 'inputSelect' : 'outputSelect']: { value: newDeviceId },
        };
        await startVosk(source, uiElement);
        return;
      }

      // CASO 3: Ativo + device alterado → RESTART
      if (vars.deviceId?.() !== newDeviceId) {
        debugLogVosk(
          `🔄 Vosk ${source.toUpperCase()} ativo com device diferente, reiniciando...`,
          false
        );
        try {
          // Para completamente o Vosk anterior
          await stopVosk(source);
          // Aguarda um pouco para liberar recursos
          await new Promise((resolve) => setTimeout(resolve, 300));
          // Reinicia com novo dispositivo
          const uiElement = {
            [source === 'input' ? 'inputSelect' : 'outputSelect']: { value: newDeviceId },
          };
          await startVosk(source, uiElement);
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
  //	VOSK - PARAR FLUXO (STT)
  /* ================================ */

  // Para captura de áudio
  async function stopVosk(source) {
    const vars = voskState[source];

    // 🔥 IMPORTANTE: Faz cleanup MESMO que _isActive seja false
    // Pode haver estado inconsistente (ex: Vosk rodando mas _isActive=false)

    try {
      // Para Vosk
      stopVoskProcess(source);

      // Desconecta processor
      if (vars.processor?.()) {
        try {
          vars.processor()?.disconnect?.();
        } catch (e) {
          console.warn(`⚠️ Erro ao desconectar processor (${source}):`, e);
        }
      }

      // Desconecta source
      if (vars._source) {
        try {
          vars._source.disconnect();
        } catch (e) {
          console.warn(`⚠️ Erro ao desconectar source (${source}):`, e);
        }
      }

      // Fecha stream
      vars
        .stream?.()
        ?.getTracks?.()
        .forEach((track) => track.stop());

      vars.setActive(false);
      vars.setStream(null);
      vars.setProcessor(null);
      vars._source = null;
      vars.setAudioContext(null);
      vars.setStartAt(null);

      // Zera o oscilador no UI
      handleVolumeUpdate(source, 0);

      debugLogVosk(`🛑 Vosk ${source.toUpperCase()} parado`, true);
    } catch (error) {
      console.error(`❌ Erro ao parar Vosk ${source.toUpperCase()}:`, error);
    }
  }

  /* ================================ */
  // DEBUG LOG VOSK
  /* ================================ */

  /**
   * Log de debug padronizado para stt-vosk.js
   * Por padrão nunca loga, se quiser mostrar é só passar true.
   * @param {...any} args - Argumentos para log (último pode ser booleano showLog)
   */
  function debugLogVosk(...args) {
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
      `%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug em stt-vosk.js:`,
      'color: blue; font-weight: bold;',
      ...cleanArgs
    );

    // Registrar em Logger para histórico de debug
    globalThis.Logger.debug(`[stt-vosk] ${cleanArgs.join(' ')}`, { timeStr });
  }

  /* ================================ */
  //	INTERFACE PÚBLICA
  /* ================================ */

  /**
   * Inicia Vosk para INPUT + OUTPUT
   */
  async function startAudioVosk(UIElements) {
    try {
      // Inicializa VAD Engine (singleton)
      vad = getVADEngine();
      debugLogVosk(`✅ VAD Engine inicializado - Status: ${JSON.stringify(vad.getStatus())}`, true);

      // 🔥 Vosk: Inicia INPUT/OUTPUT
      if (UIElements.inputSelect?.value) await startVosk(globalThis.INPUT, UIElements);
      if (UIElements.outputSelect?.value) await startVosk(globalThis.OUTPUT, UIElements);
    } catch (error) {
      console.error('❌ Erro ao iniciar Vosk:', error);
      throw error;
    }
  }

  /**
   * Para Vosk para INPUT + OUTPUT
   */
  function stopAudioVosk() {
    try {
      // 🔥 Vosk: Para INPUT e OUTPUT
      stopVosk(globalThis.INPUT);
      stopVosk(globalThis.OUTPUT);
      debugLogVosk('🛑 Vosk completamente parado', true);
    } catch (error) {
      console.error('❌ Erro ao parar Vosk:', error);
    }
  }

  /**
   * Troca dinâmica do dispositivo (input/output) mantendo Vosk ativo
   */
  async function switchDeviceVosk(source, newDeviceId) {
    try {
      debugLogVosk(
        `🔄 [switchDeviceVosk] Início: source=${source}, newDeviceId="${newDeviceId}"`,
        false
      );
      const result = await changeDeviceVosk(source, newDeviceId);
      return result;
    } catch (err) {
      console.error(`❌ [switchDeviceVosk] Erro em changeDeviceVosk:`, err);
      throw err;
    }
  }

  // Armazena referências em globalThis para acesso em segunda carga
  globalThis._startAudioVoskFunc = startAudioVosk;
  globalThis._stopAudioVoskFunc = stopAudioVosk;
  globalThis._switchDeviceVoskFunc = switchDeviceVosk;

  // Retorna as referências do IIFE
  return {
    startAudioVosk,
    stopAudioVosk,
    switchDeviceVosk,
  };
})();

/* ================================ */
//	EXPORTS (CommonJS)
/* ================================ */

module.exports = {
  startAudioVosk: startAudioVoskFunc,
  stopAudioVosk: stopAudioVoskFunc,
  switchDeviceVosk: switchDeviceVoskFunc,
};

// Exportar para globalThis (para acesso de scripts carregados via <script> tag)
if (typeof globalThis !== 'undefined') {
  globalThis.startAudioVosk = startAudioVoskFunc;
  globalThis.stopAudioVosk = stopAudioVoskFunc;
  globalThis.switchDeviceVosk = switchDeviceVoskFunc;
}
