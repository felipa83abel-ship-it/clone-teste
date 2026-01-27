/**
 * 🌊 DEEPGRAM STT (Speech-to-Text) - MÓDULO INDEPENDENTE
 *
 * Documentação: https://developers.deepgram.com/docs/audio-keep-alive
 *
 * Implementação isolada de transcrição com Deepgram Live Streaming.
 * - Captura áudio diretamente via WebSocket (sem IPC para dados binários)
 * - AudioWorklet para captura e processamento de áudio bruto PCM16
 * - Usa VAD para detecção de fala (webrtcvad ou fallback de energia)
 * - Consolida interim results e transcrições finais
 *
 * Uso:
 * - startAudioDeepgram(UIElements)
 * - stopAudioDeepgram()
 * - switchDeviceDeepgram(INPUT|OUTPUT, newDeviceId)
 *
 */

// ⚠️ Proteção contra redeclaração (quando carregado via <script> tag múltiplas vezes)
// Usar IIFE para preservar escopo das funções
const {
  startAudioDeepgram: startAudioDeepgramFunc,
  stopAudioDeepgram: stopAudioDeepgramFunc,
  switchDeviceDeepgram: switchDeviceDeepgramFunc,
} = (() => {
  if (globalThis._sttDeepgramLoaded) {
    // Retorna funções já carregadas da primeira execução
    return {
      startAudioDeepgram: globalThis._startAudioDeepgramFunc,
      stopAudioDeepgram: globalThis._stopAudioDeepgramFunc,
      switchDeviceDeepgram: globalThis._switchDeviceDeepgramFunc,
    };
  }

  globalThis._sttDeepgramLoaded = true;

  /* ================================ */
  //	IMPORTS
  /* ================================ */

  // ipcRenderer será inicializado por renderer.js
  // Usar função getter para lazy evaluation
  const getIpcRenderer = () => globalThis.ipcRenderer;
  const getVADEngine = () => globalThis.vadEngine;

  // 🔥 INSTÂNCIA DE EVENTBUS LOCAL
  const getEventBus = () => globalThis.eventBus;

  /* ================================ */
  //	CONSTANTES
  /* ================================ */

  // Configuração Geral
  const USE_DEEPGRAM_MOCK = false; // true para simulação sem conexão real com Deepgram

  // Configuração Deepgram
  const DEEPGRAM_CONFIG = {
    MODEL: process.env.DEEPGRAM_MODEL || 'nova-3',
    DEEPGRAM_HEARTBEAT_INTERVAL: 5000, // 5 segundos (conforme documentação)
  };

  // Configuração do Filtro Passa-Alta (HPF)
  const HPF_TYPE = 'highpass'; // Tipo de filtro
  const HPF_FREQUENCY = 200; // Frequência de corte em Hz
  const HPF_Q_FACTOR = 1; // Fator de qualidade

  /* ================================ */
  //	ESTADO GLOBAL DO DEEPGRAM
  /* ================================ */

  // VAD Engine
  let vad = null;

  // deepgramState mantém seu próprio estado interno
  const deepgramState = {
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

      // ========== PROPRIEDADES ESPECÍFICAS DO DEEPGRAM ==========
      _ws: null,
      _hpf: null,
      _heartbeatInterval: null,

      ws() {
        return this._ws;
      },
      setWs(val) {
        this._ws = val;
      },
      hpf() {
        return this._hpf;
      },
      setHPF(val) {
        this._hpf = val;
      },
      heartbeatInterval() {
        return this._heartbeatInterval;
      },
      setHeartbeatInterval(val) {
        this._heartbeatInterval = val;
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
      preRollBuffers: [],
      preRollMaxFrames: 8,
      sending: false,
      postRollTimer: null,
      postRollMs: 500,
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

      // ========== PROPRIEDADES ESPECÍFICAS DO DEEPGRAM ==========
      _ws: null,
      _hpf: null,
      _heartbeatInterval: null,

      ws() {
        return this._ws;
      },
      setWs(val) {
        this._ws = val;
      },
      hpf() {
        return this._hpf;
      },
      setHPF(val) {
        this._hpf = val;
      },
      heartbeatInterval() {
        return this._heartbeatInterval;
      },
      setHeartbeatInterval(val) {
        this._heartbeatInterval = val;
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
      preRollBuffers: [],
      preRollMaxFrames: 8,
      sending: false,
      postRollTimer: null,
      postRollMs: 500,
    },
  };

  /* ================================ */
  //	WEBSOCKET DEEPGRAM
  /* ================================ */

  // Mock simples para não abrir conexão real do Deepgram (testes locais)
  function initDeepgramWSMock() {
    return {
      readyState: WebSocket.CLOSED, // nunca abre
      send: (data) => debugLogDeepgram('Simulação: dados de áudio capturados', data, true),
      close: () => debugLogDeepgram('Simulação: conexão fechada', true),
    };
  }

  // Inicializa WebSocket Deepgram com parâmetros genericos (input/output))
  async function initDeepgramWS(source = globalThis.INPUT) {
    const existingWS = deepgramState[source]?.ws ? deepgramState[source].ws() : null;

    if (existingWS && existingWS.readyState === WebSocket.OPEN) {
      console.warn(`🌊 WebSocket Deepgram ${source} já aberto`);
      return existingWS;
    }

    // Pega chave Deepgram salva
    const apiKey = await getIpcRenderer().invoke('GET_API_KEY', 'deepgram');
    if (!apiKey) {
      throw new Error('❌ Chave Deepgram não configurada. Configure em "API e Modelos"');
    }

    debugLogDeepgram(
      `🚀 Iniciando Deepgram (${source}) com modelo: ${DEEPGRAM_CONFIG.MODEL}...`,
      true
    );

    // Monta URL com parâmetros (token é passado na URL para evitar erros 401)
    // @ts-ignore - URLSearchParams aceita record com strings e arrays
    const params = new URLSearchParams({
      model: DEEPGRAM_CONFIG.MODEL,
      language: 'pt-BR',
      encoding: 'linear16', // PCM16
      sample_rate: '16000', // 16kHz
      smart_format: 'true', // Formatação inteligente
      interim_results: 'true', // Habilita interim results
      endpointing: '300', // Detecta pausas naturais
      utterance_end_ms: '1000', // Finaliza a frase após 1s de silêncio
      punctuate: 'true', // Melhor pontuação
      utterances: 'true', // Habilita timestamps de utterances para calcular duração real da fala
    });

    const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    const ws = new WebSocket(wsUrl, ['token', apiKey.trim()]);

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        debugLogDeepgram(
          `✅ WebSocket Deepgram ${source} conectado | readyState: ${ws.readyState}`,
          false
        );

        // Inicia heartbeat para manter conexão viva
        startDeepgramHeartbeat(ws, source);
        resolve(ws);
      };

      ws.onmessage = (event) => {
        try {
          // Recepção e Processamento de Transcrições
          const msg = JSON.parse(event.data);
          handleDeepgramMessage(msg, source);
        } catch (e) {
          console.error(`❌ Erro ao processar mensagem Deepgram ${source}:`, e);
        }
      };

      ws.onerror = (err) => {
        console.error(`❌ Erro WebSocket Deepgram ${source}:`, err);
        // @ts-ignore - err pode ser Event ou ErrorEvent
        console.error(
          '   Type:',
          err.type,
          'Message:',
          err instanceof Event && 'message' in err ? err.message : 'N/A'
        );

        reject(new Error(`Falha ao conectar Deepgram ${source}`));
      };

      ws.onclose = (event) => {
        debugLogDeepgram(
          `🛑 WebSocket Deepgram ${source} fechado | Code: ${event.code} | Reason: ${event.reason || 'nenhum'} | Clean: ${
            event.wasClean
          }`,
          true
        );
        stopDeepgramHeartbeat(source);
        try {
          deepgramState[source]?.setWs(null);
        } catch (e) {
          console.warn(`Aviso: falha ao limpar ws em onclose (${source}):`, e);
        }
      };
    });
  }

  // Envia mensagem "KeepAlive" a cada 5 segundos para manter WebSocket Deepgram vivo
  function startDeepgramHeartbeat(ws, source) {
    const interval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'KeepAlive' }));
        } catch (e) {
          console.error(`❌ Erro ao enviar KeepAlive ${source}:`, e);
        }
      }
    }, DEEPGRAM_CONFIG.DEEPGRAM_HEARTBEAT_INTERVAL);

    try {
      deepgramState[source]?.setHeartbeatInterval(interval);
    } catch (error_) {
      console.warn(`Aviso: falha ao configurar heartbeat interval para ${source}:`, error_);
    }
  }

  // Para heartbeat do Deepgram
  function stopDeepgramHeartbeat(source) {
    try {
      const iv = deepgramState[source]?.heartbeatInterval?.();
      if (iv) {
        clearInterval(iv);
        deepgramState[source].setHeartbeatInterval(null);
      }
    } catch (error_) {
      console.warn(`Aviso: falha ao parar heartbeat interval para ${source}:`, error_);
    }
  }

  // Envia mensagem "Finalize" para Deepgram (input/output)
  function sendDeepgramFinalize(source) {
    const ws = deepgramState[source]?.ws?.();

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        debugLogDeepgram(`🔔 Enviando Finalize para Deepgram (${source})`, true);
        ws.send(JSON.stringify({ type: 'Finalize' }));
      } catch (e) {
        console.error(`❌ Erro ao enviar Finalize ${source}:`, e);
      }
    }
  }

  /* ================================ */
  //	BUFFER DE PRÉ e POST-ROLL DE ÁUDIO
  /* ================================ */

  // Armazena buffer de áudio para pré-roll
  function storePreRollBuffer(vars, pcm16) {
    try {
      if (!Array.isArray(vars.preRollBuffers)) vars.preRollBuffers = [];
      vars.preRollBuffers.push(pcm16);
      while (vars.preRollBuffers.length > vars.preRollMaxFrames) vars.preRollBuffers.shift();
    } catch (e) {
      console.warn('⚠️ Erro ao armazenar pre-roll buffer:', e.message || e);
    }
  }

  // Envia pré-roll ao Deepgram
  function sendPreRollBuffers(vars) {
    if (!vars.sending) {
      try {
        for (const buf of vars.preRollBuffers) {
          try {
            vars.ws().send(buf);
          } catch (e) {
            console.warn('⚠️ Falha ao enviar pre-roll ao Deepgram:', e.message || e);
          }
        }
        vars.preRollBuffers = [];
        vars.sending = true;
      } catch (e) {
        console.warn('⚠️ Erro ao processar pre-roll buffers:', e.message || e);
      }
    }
  }

  // Renova timer de post-roll
  function renewPostRollTimer(source, vars) {
    if (vars.postRollTimer) {
      clearTimeout(vars.postRollTimer);
      vars.postRollTimer = null;
    }
    vars.postRollTimer = setTimeout(() => {
      vars.sending = false;
      vars.preRollBuffers = [];
      try {
        sendDeepgramFinalize(source);
      } catch (error_) {
        console.warn(
          '⚠️ Erro ao finalizar transcrição Deepgram:',
          error_ && (error_.message || error_)
        );
      }
    }, vars.postRollMs);
  }

  // Envia frame atual
  function sendCurrentFrame(vars, pcm16) {
    try {
      if (pcm16) vars.ws().send(pcm16);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar buffer atual ao Deepgram:', e.message || e);
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
  //	DEEPGRAM - INICIAR FLUXO (STT)
  /* ================================ */

  // Inicia captura de áudio do dispositivo de entrada ou saída com Deepgram
  async function startDeepgram(source, UIElements) {
    // Configurações específicas por source
    const config = {
      input: {
        deviceKey: 'inputSelect',
        accessMessage: '🎤 Solicitando acesso à entrada de áudio (Microfone)...',
        threshold: 0.02,
        startLog: '▶️ Captura Deepgram INPUT iniciada',
      },
      output: {
        deviceKey: 'outputSelect',
        accessMessage: '🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)...',
        threshold: 0.005,
        startLog: '▶️ Captura Deepgram OUTPUT iniciada',
      },
    };

    const cfg = config[source];
    if (!cfg) {
      throw new Error(
        `❌ Source inválido: ${source}. Use ${globalThis.INPUT} ou ${globalThis.OUTPUT}`
      );
    }

    const vars = deepgramState[source];

    if (vars.isActive?.()) {
      console.warn(`⚠️ Deepgram ${source.toUpperCase()} já ativo`);
      return;
    }

    try {
      // Obtém o dispositivo selecionado no UI
      const deviceId = UIElements[cfg.deviceKey]?.value;

      // 🔥 VALIDAÇÃO CRÍTICA: Se device está vazio (desativado), NÃO INICIA
      if (!deviceId || deviceId.trim() === '') {
        debugLogDeepgram(
          `⛔ Dispositivo ${source.toUpperCase()} desativado (vazio) - NÃO INICIANDO`,
          true
        );
        return;
      }

      debugLogDeepgram(
        `🔊 Iniciando captura ${source.toUpperCase()} com dispositivo: ${deviceId}`,
        false
      );

      // Inicializa WebSocket usando função genérica
      const ws = USE_DEEPGRAM_MOCK ? initDeepgramWSMock() : await initDeepgramWS(source);

      // Define flags via deepgramState
      vars.setWs(ws);
      vars.setActive(true);
      vars.setStartAt(Date.now());

      // Solicita acesso ao dispositivo selecionado
      debugLogDeepgram(cfg.accessMessage, false);

      // Obtém stream de áudio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      debugLogDeepgram(`✅ Acesso ao áudio ${source.toUpperCase()} autorizado`, true);

      // Cria AudioContext 16kHz para processamento em tempo real (VAD)
      const audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)({
        sampleRate: globalThis.AUDIO_SAMPLE_RATE,
      });
      await audioContext.audioWorklet.addModule(globalThis.AUDIO_WORKLET_PROCESSOR_PATH);

      // Cria MediaStreamSource e guarda via deepgramState
      const mediaSource = audioContext.createMediaStreamSource(stream);

      // Filtro Passa-Alta
      const hpf = audioContext.createBiquadFilter();
      hpf.type = HPF_TYPE;
      hpf.frequency.value = HPF_FREQUENCY;
      hpf.Q.value = HPF_Q_FACTOR;

      // Inicia AudioWorklet para captura e processamento de áudio em tempo real
      const processor = new AudioWorkletNode(audioContext, globalThis.STT_AUDIO_WORKLET_PROCESSOR);
      processor.port.postMessage({ type: 'setThreshold', threshold: cfg.threshold });
      processor.port.onmessage = (event) => {
        // Processa mensagens do AudioWorklet (audioData e volumeUpdate separadamente)
        processIncomingAudioMessageDeepgram(source, event.data).catch((error_) =>
          console.error(`❌ Erro ao processar mensagem do worklet (${source}):`, error_)
        );
      };

      // Conecta fluxo: Source -> HPF -> processor -> destination
      mediaSource.connect(hpf);
      hpf.connect(processor);
      processor.connect(audioContext.destination);

      // Atualiza referências de estado
      vars.setStream(stream);
      vars.setAudioContext(audioContext);
      vars.setSource(mediaSource);
      vars.setProcessor(processor);
      vars.setActive(true);
      vars.setStartAt(Date.now());
      vars.lastActive = Date.now();
      vars.setHPF(hpf);

      debugLogDeepgram(cfg.startLog, true);
    } catch (error) {
      console.error(`❌ Erro ao iniciar Deepgram ${source.toUpperCase()}:`, error);
      try {
        vars.setActive(false);
      } catch (error_) {
        console.warn('⚠️ Aviso ao resetar active flag:', error_ && (error_.message || error_));
      }
      stopDeepgram(source);
      throw error;
    }
  }

  // Processa mensagens de áudio recebida do AudioWorklet
  async function processIncomingAudioMessageDeepgram(source, data) {
    const vars = deepgramState[source];
    if (data.type === 'audioData') {
      storePreRollBuffer(vars, data.pcm16);

      // VAD: Detecta fala usando VAD Engine
      const isSpeech = vad.detectSpeech(data.pcm16, vars.lastPercent, vars.vadWindow);
      updateVADState(vars, isSpeech);

      const now = Date.now();
      const wsOpen = vars.ws?.()?.readyState === WebSocket.OPEN;
      const withinPostRoll = now - vars.lastActive < vars.postRollMs;
      const shouldSend = !!isSpeech || withinPostRoll;
      if (shouldSend && wsOpen) {
        try {
          sendPreRollBuffers(vars);
          sendCurrentFrame(vars, data.pcm16);
          renewPostRollTimer(source, vars);
        } catch (e) {
          console.warn('⚠️ Erro no fluxo de envio para Deepgram:', e.message || e);
        }
      }
    } else if (data.type === 'volumeUpdate') {
      vars.lastPercent = data.percent;

      // Processa atualização de volume/VAD
      handleVolumeUpdate(source, data.percent);

      // Detecta silêncio
      handleSilenceDetectionDeepgram(source, data.percent);
    }
  }

  // Trata detecção de silêncio com VAD ou fallback
  function handleSilenceDetectionDeepgram(source, percent) {
    const vars = deepgramState[source];
    const silenceTimeout =
      source === globalThis.INPUT
        ? globalThis.SILENCE_TIMEOUT_INPUT
        : globalThis.SILENCE_TIMEOUT_OUTPUT;
    const now = Date.now();

    // Decisão principal: VAD se disponível, senão fallback por volume
    const useVADDecision = vad?.isEnabled() && vars._lastIsSpeech !== undefined;
    const effectiveSpeech = useVADDecision ? !!vars._lastIsSpeech : percent > 0;

    debugLogDeepgram(
      `🔍 VAD ${source}: ${vars._lastIsSpeech ? 'speech' : 'silence'} - 🔊 volume: ${percent.toFixed(2)}%`,
      false
    );

    if (effectiveSpeech) {
      // Se detectou fala, resetamos estado de silêncio
      if (vars.inSilence) {
        if (!vars.noiseStartTime) vars.noiseStartTime = Date.now();

        const noiseDuration = vars.noiseStartTime - vars.noiseStopTime;
        vars.noiseStopTime = null;

        debugLogDeepgram(
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

        debugLogDeepgram(`🔴 🔴 🔴 ***** 🔇 Silêncio estável detectado (${elapsed}ms) *****`, true);

        // Dispara finalize apenas uma vez
        sendDeepgramFinalize(source);
      }
    }
  }

  /* ================================ */
  //	PROCESSAMENTO DE MENSAGENS
  /* ================================ */

  // Processa mensagens do Deepgram (final ou parcial)
  function handleDeepgramMessage(result, source = globalThis.INPUT) {
    const transcript = result.channel?.alternatives?.[0]?.transcript || '';
    const isFinal = result.is_final || false;

    debugLogDeepgram(`📥 RESPOSTA DO DEEPGRAM - (${source})`, false);
    debugLogDeepgram(`📥 Mensagem Deepgram ${source} recebida:`, result, false);
    debugLogDeepgram(
      `📥 Type: ${result.type} | isFinal: ${isFinal} | speechFinal: ${result.speech_final}`,
      false
    );
    debugLogDeepgram(`📥 Transcript presente: ${transcript?.trim() ? 'SIM' : 'NÃO'}`, false);

    if (isFinal) {
      handleFinalDeepgramMessage(source, transcript);
    } else {
      handleInterimDeepgramMessage(source, transcript);
    }
  }

  // Processa mensagens interim do Deepgram (transcrições parciais)
  function handleInterimDeepgramMessage(source, transcript) {
    debugLogDeepgram(`⏳ 🟠 Handle INTERIM [${source}]: "${transcript}"`, true);

    if (!transcript?.trim()) {
      console.warn(`⚠️ Transcript interim vazio recebido do Deepgram (${source}); ignorando.`);
      return;
    }

    const vars = deepgramState[source];
    vars.lastTranscript = transcript;

    // Atualiza interim transcript no UI
    updateInterim(source, transcript, vars.author);

    // Atualiza CURRENT question (apenas para output)
    updateCurrentQuestion(source, transcript, true);
  }

  // Processa mensagens finais do Deepgram (transcrições completas)
  function handleFinalDeepgramMessage(source, transcript) {
    debugLogDeepgram(`📝 🟢 Handle FINAL [${source.toUpperCase()}]: "${transcript}"`, true);

    const vars = deepgramState[source];
    vars.lastTranscript = transcript.trim() ? transcript : vars.lastTranscript;

    if (transcript.trim()) {
      // Adiciona placeholder com transcrição
      const placeholderId = `dg-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
      source === globalThis.INPUT ? 'deepgram-interim-input' : 'deepgram-interim-output';
    getEventBus().emit('clearInterim', { id: interimId });
  }

  // Atualiza interim transcript no UI
  function updateInterim(source, transcript, author) {
    const interimId =
      source === globalThis.INPUT ? 'deepgram-interim-input' : 'deepgram-interim-output';
    getEventBus().emit('updateInterim', {
      id: interimId,
      speaker: author,
      text: transcript,
    });
  }

  // Atualiza CURRENT question (apenas para output)
  function updateCurrentQuestion(source, transcript, isInterim = false) {
    const vars = deepgramState[source];
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

  // Troca dinâmica do dispositivo Deepgram (input/output)
  async function changeDeviceDeepgram(source, newDeviceId) {
    const vars = deepgramState[source];

    debugLogDeepgram(
      `🔄 changeDeviceDeepgram CHAMADO: source=${source}, newDeviceId="${newDeviceId}"`,
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
        debugLogDeepgram(
          `🛑 Device vazio para ${source.toUpperCase()}, parando Deepgram... (deviceId="${newDeviceId}")`,
          false
        );
        stopDeepgram(source);
        return;
      }

      // CASO 2: Inativo + device válido → START
      if (!vars.isActive()) {
        debugLogDeepgram(
          `🚀 Deepgram ${source.toUpperCase()} inativo, iniciando com novo dispositivo...`,
          false
        );
        const uiElement = {
          [source === 'input' ? 'inputSelect' : 'outputSelect']: { value: newDeviceId },
        };
        await startDeepgram(source, uiElement);
        return;
      }

      // CASO 3: Ativo + device alterado → RESTART
      if (vars.deviceId?.() !== newDeviceId) {
        debugLogDeepgram(
          `🔄 Deepgram ${source.toUpperCase()} ativo com device diferente, reiniciando...`,
          false
        );
        try {
          // Para completamente o Deepgram anterior
          stopDeepgram(source);
          // Aguarda um pouco para liberar recursos
          await new Promise((resolve) => setTimeout(resolve, 300));
          // Reinicia com novo dispositivo
          const uiElement = {
            [source === 'input' ? 'inputSelect' : 'outputSelect']: { value: newDeviceId },
          };
          await startDeepgram(source, uiElement);
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
  //	DEEPGRAM - PARAR FLUXO (STT)
  /* ================================ */

  // Envia CloseStream ao Deepgram se WebSocket estiver aberto
  function closeDeepgramStream(vars, source) {
    const ws = vars.ws();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      ws.send(JSON.stringify({ type: 'CloseStream' }));
      debugLogDeepgram(`📤 CloseStream enviado para ${source.toUpperCase()}`, true);
    } catch (error_) {
      console.error(
        `❌ Erro ao enviar CloseStream ${source}:`,
        error_ && (error_.message || error_)
      );
    }
  }

  // Fecha WebSocket Deepgram
  function closeDeepgramWebSocket(vars, source) {
    const ws = vars.ws();
    if (!ws) return;
    try {
      ws.close();
    } catch (error_) {
      console.error(`Erro ao fechar WebSocket ${source}:`, error_ && (error_.message || error_));
    }
    vars.setWs(null);
  }

  // Desconecta processador de áudio
  function disconnectAudioProcessor(vars) {
    const processor = vars.processor();
    if (processor) {
      processor.disconnect();
      vars.setProcessor(null);
    }
  }

  // Para fluxo de áudio da origem
  function stopAudioStream(vars) {
    const stream = vars.stream();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      vars.setStream(null);
    }
  }

  // Desconecta MediaStreamSource
  function disconnectMediaStreamSource(vars, source) {
    try {
      const src = vars.source?.();
      if (!src) return;
      try {
        src.disconnect();
      } catch (error_) {
        console.warn(`Aviso: falha ao desconectar source durante stop (${source}):`, error_);
      }
      vars.setSource(null);
    } catch (error_) {
      console.warn(`Aviso: falha ao limpar source em stop (${source}):`, error_);
    }
  }

  // Desconecta filtro HPF
  function disconnectHighPassFilter(vars) {
    try {
      const hpf = vars.hpf?.();
      if (!hpf) {
        return;
      }
      try {
        hpf.disconnect();
      } catch (error_) {
        console.warn('Aviso: falha ao desconectar HPF:', error_ && (error_.message || error_));
      }
      vars.setHPF(null);
    } catch (error_) {
      console.warn('Aviso: falha ao limpar HPF:', error_ && (error_.message || error_));
    }
  }

  // Fecha AudioContext
  function closeAudioContext(vars) {
    const audioContext = vars.audioContext();
    if (audioContext) {
      audioContext.close();
      vars.setAudioContext(null);
    }
  }

  // Para captura Deepgram de um source específico (input/output)
  function stopDeepgram(source) {
    const vars = deepgramState[source];

    // 🔥 IMPORTANTE: Faz cleanup MESMO que isActive() seja false
    // Pode haver estado inconsistente (ex: WS aberto mas isActive=false)

    vars.setActive(false);
    closeDeepgramStream(vars, source);
    stopDeepgramHeartbeat(source);
    closeDeepgramWebSocket(vars, source);
    disconnectAudioProcessor(vars);
    stopAudioStream(vars);
    disconnectMediaStreamSource(vars, source);
    disconnectHighPassFilter(vars);
    closeAudioContext(vars);

    // Zera o oscilador no UI
    handleVolumeUpdate(source, 0);

    debugLogDeepgram(`🛑 Captura Deepgram ${source.toUpperCase()} parada`, true);
  }

  /* ================================ */
  // DEBUG LOG DEEPGRAM
  /* ================================ */

  /**
   * Log de debug padronizado para stt-deepgram.js
   * Por padrão nunca loga, se quiser mostrar é só passar true.
   * @param {...any} args - Argumentos para log (último pode ser booleano showLog)
   */
  function debugLogDeepgram(...args) {
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
      `%c⏱️ [${timeStr}] 🪲 ❯❯❯❯ Debug em stt-deepgram.js:`,
      'color: blue; font-weight: bold;',
      ...cleanArgs
    );

    // Registrar em Logger para histórico de debug
    globalThis.Logger.debug(`[stt-deepgram] ${cleanArgs.join(' ')}`, { timeStr });
  }

  /* ================================ */
  //	INTERFACE PÚBLICA
  /* ================================ */

  /**
   * Inicia captura de áudio do dispositivo de entrada e/ou saída com Deepgram
   */
  async function startAudioDeepgram(UIElements) {
    try {
      // Inicializa VAD Engine (singleton)
      vad = getVADEngine();
      globalThis.Logger.debug(
        `✅ VAD Engine inicializado - Status: ${JSON.stringify(vad.getStatus())}`
      );

      // 🌊 Deepgram: Inicia INPUT/OUTPUT
      if (UIElements.inputSelect?.value) await startDeepgram(globalThis.INPUT, UIElements);
      if (UIElements.outputSelect?.value) await startDeepgram(globalThis.OUTPUT, UIElements);
    } catch (error) {
      console.error('❌ Erro ao iniciar Deepgram:', error);
      throw error;
    }
  }

  /**
   * Para Deepgram  para INPUT + OUTPUT
   */
  function stopAudioDeepgram() {
    try {
      // 🌊 Deepgram: Para INPUT e OUTPUT
      stopDeepgram(globalThis.INPUT);
      stopDeepgram(globalThis.OUTPUT);
      debugLogDeepgram('🛑 Deepgram completamente parado', true);
    } catch (error) {
      console.error('❌ Erro ao parar Deepgram:', error);
    }
  }

  /**
   * Troca dinâmica do dispositivo (input/output) mantendo Deepgram ativo
   */
  async function switchDeviceDeepgram(source, newDeviceId) {
    try {
      globalThis.Logger.debug(
        `🔄 [switchDeviceDeepgram] Início: source=${source}, newDeviceId="${newDeviceId}"`
      );
      const result = await changeDeviceDeepgram(source, newDeviceId);
      return result;
    } catch (err) {
      console.error(`❌ [switchDeviceDeepgram] Erro em changeDeviceDeepgram:`, err);
      throw err;
    }
  }

  // Armazena referências em globalThis para acesso em segunda carga
  globalThis._startAudioDeepgramFunc = startAudioDeepgram;
  globalThis._stopAudioDeepgramFunc = stopAudioDeepgram;
  globalThis._switchDeviceDeepgramFunc = switchDeviceDeepgram;

  // Retorna as referências do IIFE
  return {
    startAudioDeepgram,
    stopAudioDeepgram,
    switchDeviceDeepgram,
  };
})();

/* ================================ */
//	EXPORTS (CommonJS)
/* ================================ */

module.exports = {
  startAudioDeepgram: startAudioDeepgramFunc,
  stopAudioDeepgram: stopAudioDeepgramFunc,
  switchDeviceDeepgram: switchDeviceDeepgramFunc,
};

// Exportar para globalThis (para acesso de scripts carregados via <script> tag)
if (typeof globalThis !== 'undefined') {
  globalThis.startAudioDeepgram = startAudioDeepgramFunc;
  globalThis.stopAudioDeepgram = stopAudioDeepgramFunc;
  globalThis.switchDeviceDeepgram = switchDeviceDeepgramFunc;
}
