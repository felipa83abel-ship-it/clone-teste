# Fluxo Detalhado de Transcrição com Deepgram

Este documento descreve o fluxo passo a passo de cada função e evento chamado durante o processo de transcrição de áudio usando o Deepgram via WebSocket direto para streaming em tempo real, começando pelo acionamento do botão "Começar a Ouvir" (Ctrl+D). O foco é no caminho até a transcrição aparecer na tela, incluindo validações, inicialização de áudio, captura, envio via WebSocket, processamento da resposta e renderização.

## 1. Acionamento do Botão "Começar a Ouvir" (Ctrl+D)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `listenToggleBtn()` (linha ~3249)
- **Descrição**: Esta função é chamada quando o usuário clica no botão ou pressiona Ctrl+D. Ela realiza validações iniciais antes de iniciar a escuta.
  - Chama `hasActiveModel()` para verificar se há modelo IA ativo (retorna { active: true, model: 'deepgram' }).
  - Verifica se dispositivo de áudio de saída está selecionado (`UIElements.outputSelect?.value`).
  - Se validações falham, emite erro via `emitUIChange('onError', mensagem)` e retorna.
  - Inverte `isRunning` (false → true).
  - Atualiza botão via `emitUIChange('onListenButtonToggle', { isRunning: true, buttonText: 'Parar a Escuta...', })`.
  - Chama `updateStatusMessage('Status: ouvindo...')`.
  - Chama `startAudio()`.

## 2. Inicialização da Captura de Áudio

- **Arquivo**: `renderer.js`
- **Função/Evento**: `startAudio()` (linha ~1020)
- **Descrição**: Coordena início da captura detectando modelo STT.
  - Chama `getConfiguredSTTModel()` que lê `window.configManager.config.api[provider].selectedSTTModel` (deve ser 'deepgram').
  - Como é 'deepgram', chama `startAudioDeepgram(UIElements)` de `stt-deepgram.js`.

### 2.1. Inicialização do Deepgram (startAudioDeepgram)

- **Arquivo**: `stt-deepgram.js`
- **Função/Evento**: `startAudioDeepgram(UIElements)` (linha ~185)
- **Descrição**: Inicializa captura para input e output separadamente.
  - Se `UIElements.inputSelect?.value`: chama `startDeepgram('input', UIElements)`.
  - Se `UIElements.outputSelect?.value`: chama `startDeepgram('output', UIElements)`.

#### 2.1.1. Captura de Entrada (Microfone) e Saída (Sistema)

- **Arquivo**: `stt-deepgram.js`
- **Função/Evento**: `startDeepgram(source, UIElements)` (linha ~475)
- **Descrição**: Função genérica que inicializa captura tanto para entrada quanto saída, parametrizando por source.
  - `source` pode ser `'input'` (microfone) ou `'output'` (sistema).
  - **Para INPUT**:
    - Obtém `deviceId = UIElements.inputSelect?.value`.
    - Threshold: `0.02` (menos sensível).
    - Mensagem de acesso: `"🎤 Solicitando acesso à entrada de áudio (Microfone)..."`.
  - **Para OUTPUT**:
    - Obtém `deviceId = UIElements.outputSelect?.value`.
    - Threshold: `0.005` (mais sensível, para capturar finais de fala).
    - Mensagem de acesso: `"🔊 Solicitando acesso à saída de áudio (VoiceMeter/Stereo Mix)..."`.
  - Verifica se já ativo via `deepgramVars[source].isActive()`, se sim retorna.
  - Chama `initDeepgramWS(source)` para WebSocket.
  - Define flags via deepgramVars:
    - `setWs(ws)`
    - `setActive(true)`
    - `setStartAt(Date.now())`
  - Solicita acesso ao dispositivo: `navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })`.
  - Cria `AudioContext` com 16kHz.
  - Carrega AudioWorklet: `audioContext.audioWorklet.addModule('./deepgram-audio-worklet-processor.js')`.
  - Cria `AudioWorkletNode` com threshold apropriado para o source.
  - Conecta fluxo: `source → HPF (passa-alta) → processor → destination`.
  - Atualiza referências via deepgramVars (stream, audioContext, source, hpf, processor).

### 2.2. Inicialização do WebSocket (initDeepgramWS)

- **Arquivo**: `stt-deepgram.js`
- **Função/Evento**: `initDeepgramWS(source)` (linha ~50)
- **Descrição**: Cria conexão WebSocket com Deepgram.
  - Obtém chave: `ipcRenderer.invoke('GET_API_KEY', 'deepgram')`.
  - Monta URL: `wss://api.deepgram.com/v1/listen?model=nova-2&language=pt-BR&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000&endpointing=300&utterance_end_ms=1000`.
  - Cria `ws = new WebSocket(url, ['token', apiKey])`.
  - Define `ws.onopen`: chama `startDeepgramHeartbeat(ws, source)`. Iniciando heartbeat para manter conexão viva.
  - Define `ws.onmessage`: `handleDeepgramMessage(JSON.parse(event.data), source)`.
  - Define `ws.onerror` e `ws.onclose`: logs e cleanup.
  - Retorna promise resolvendo ws.

## 3. Processamento de Áudio em Tempo Real

- **Arquivo**: `deepgram-audio-worklet-processor.js`
- **Descrição**: AudioWorklet processa áudio continuamente.
  - Recebe dados de áudio (Float32Array) no `process(inputs, outputs)`.
  - Aplica threshold: se volume < threshold, ignora (evita silêncio).
  - Converte Float32 para Int16 (PCM16): `pcm16 = new Int16Array(float32.length); for(let i=0; i<float32.length; i++) pcm16[i] = float32[i] * 32767;`.
  - Envia via `this.port.postMessage({ type: 'audioData', pcm16 })`.
  - Também calcula volume e envia `this.port.postMessage({ type: 'volumeUpdate', percent })`.

- **Arquivo**: `stt-deepgram.js`
- **Função/Evento**: `deepgramInputProcessor.port.onmessage` / `deepgramOutputProcessor.port.onmessage` (linhas ~251 e ~331)
- **Descrição**:
  - Recebe `{ type, pcm16, percent }`.
  - Se `type === 'audioData'`: envia `deepgramInputWebSocket.send(pcm16)` ou similar para output.
  - Se `type === 'volumeUpdate'`: emite `emitUIChange('onInputVolumeUpdate', { percent })` ou output.

## 4. Recepção e Processamento de Transcrições

- **Arquivo**: `stt-deepgram.js`
- **Função/Evento**: `deepgramInputWebSocket.onmessage` / `deepgramOutputWebSocket.onmessage` (via `initDeepgramWS`)
- **Descrição**: Recebe JSON do Deepgram.
  - Parseia `data = JSON.parse(event.data)`.
  - Chama `handleDeepgramMessage(data, source)`.

### 4.1. Processamento de Mensagens (handleDeepgramMessage)

- **Arquivo**: `stt-deepgram.js`
- **Função/Evento**: `handleDeepgramMessage(data, source)` (linha ~630)
- **Descrição**:
  - Extrai `transcript = data.channel?.alternatives?.[0]?.transcript`.
  - `confidence = data.channel?.alternatives?.[0]?.confidence`.
  - `isFinal = data.is_final`.
  - `speechFinal = data.speech_final`.
  - Se `!transcript?.trim()`, ignora.
  - Logs: `console.log(isFinal ? 'FINAL' : 'INTERIM', transcript)`.
  - Se `isFinal`: chama `handleFinalDeepgramMessage(transcript, confidence, source)`.
  - Senão: chama `handleInterimDeepgramMessage(transcript, source)`.

### 4.2. Processamento de Interims (transcrições parciais)

- **Arquivo**: `stt-deepgram.js`
- **Função/Evento**: `handleInterimDeepgramMessage(transcript, source)` (linha ~588)
- **Descrição**:
  - Define autor da transcrição (Input ou Output): `author = isInput ? YOU : OTHER;`.
  - Define ID do elemento interim: `interimId = isInput ? 'deepgram-interim-input' : 'deepgram-interim-output'`.
  - **Emite** `emitUIChange('onUpdateInterim', { id: interimId, speaker: author, text: transcript })`
    para atualizar a interface com o texto sendo transcrito em tempo real (mostra o texto aparecendo gradualmente na tela, como um "typing effect" - efeito de digitação).

### 4.3. Processamento de Finals (transcrições completas)

- **Arquivo**: `stt-deepgram.js`
- **Função/Evento**: `handleFinalDeepgramMessage(transcript, confidence, source)` (linha ~490)
- **Descrição**:
  - Define `deepgramInputStopAt = Date.now()` ou output.
  - Calcula métricas: latency, total time.
  - Cria placeholder ID único.
  - Emite `emitUIChange('onTranscriptAdd', { author, text, timeStr, elementId: 'conversation', placeholderId })`.
  - Emite `emitUIChange('onPlaceholderFulfill', { ... })` com métricas.
  - Para output: emite `emitSTTEvent('transcriptionComplete', { text, speaker: author })`.
  - Limpa interim: `emitUIChange('onClearInterim', { id: 'deepgram-interim-input' })`.

## 5. Integração com Renderer (para Output)

- **Arquivo**: `renderer.js`
- **Função/Evento**: Listener de `window.transcriptionEvents` (linha ~4216)
- **Descrição**: Para output, o evento 'transcription' (interim) e 'transcriptionComplete' (final) são ouvidos.
  - Para 'transcriptionComplete': chama `handleSpeech('OTHER', text)`.

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleSpeech(author, text)` (linha ~2450)
- **Descrição**:
  - Limpa texto: `text.replace(/Ê+|hum|ahn/gi, '').trim()`.
  - Se `cleaned.length < 3`, ignora.
  - Para 'OTHER': chama `handleCurrentQuestion('OTHER', cleaned, { isInterim: false })`.

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleCurrentQuestion(author, text, options)` (linha ~2560)
- **Descrição**:
  - Atualiza `currentQuestion.text += text`.
  - `currentQuestion.lastUpdateTime = Date.now()`.
  - Chama `renderCurrentQuestion()`.

## 6. Renderização na Tela

- **Arquivo**: `config-manager.js`
- **Função/Evento**: Ouvinte de `emitUIChange('onCurrentQuestionUpdate')`
- **Descrição**: Atualiza `#current-question` com texto e classes.

- **Arquivo**: `config-manager.js`
- **Função/Evento**: Ouvinte de `emitUIChange('onTranscriptAdd')`
- **Descrição**: Adiciona à `#conversation` usando `marked` para Markdown.

- **Arquivo**: `config-manager.js`
- **Função/Evento**: Ouvinte de `emitUIChange('onUpdateInterim')`
- **Descrição**: Atualiza elemento interim com texto.

## 7. Fechamento e Finalização de Perguntas

- Quando `emitSTTEvent('transcriptionComplete')` para output, dispara fechamento.
- **Arquivo**: `renderer.js`
- **Função/Evento**: `closeCurrentQuestion()` (linha ~2625)
- **Descrição**:
  - Se `looksLikeQuestion(currentQuestion.text)`: processa.
  - Modo normal: `promoteCurrentToHistory(text)`.
  - Modo entrevista: chama `askGpt()` se turno correto.

## Pontos de Atenção e Possíveis Problemas

- **Configuração**: Modelo deve ser 'deepgram' em config, chave API válida.
- **WebSocket**: Falha em conectar se rede ruim ou chave errada (erro 401).
- **AudioWorklet**: Threshold alto pode ignorar fala; permissões necessárias.
- **Mensagens**: JSON malformado causa erro em parse.
- **Eventos**: Se listeners em renderer não ouvirem, transcrição não processa.
- **Heartbeat**: Sem KeepAlive, WS fecha em 1011.
- **Debug**: Logs em console mostram cada passo; verificar se WS abre e mensagens chegam.
