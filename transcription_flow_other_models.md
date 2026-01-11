# Fluxo Detalhado de Transcrição com Outros Modelos (Vosk, Whisper, etc.)

Este documento descreve o fluxo passo a passo de cada função e evento chamado durante o processo de transcrição de áudio usando modelos STT que não sejam Deepgram (como Vosk, Whisper local/online), começando pelo acionamento do botão "Começar a Ouvir" (Ctrl+D). O foco é no caminho até a transcrição aparecer na tela, incluindo validações, inicialização de áudio, captura, envio via IPC, processamento no main process, resposta e renderização.

O fluxo usa MediaRecorder para capturar áudio em chunks e IPC para enviar ao main process, onde a transcrição é feita.

## 1. Acionamento do Botão "Começar a Ouvir" (Ctrl+D)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `listenToggleBtn()` (linha ~3249)
- **Descrição**: Esta função é chamada quando o usuário clica no botão ou pressiona Ctrl+D. Ela realiza validações iniciais antes de iniciar a escuta.
  - Verifica se há um modelo de IA ativo (chama `hasActiveModel()`).
  - Verifica se um dispositivo de áudio de saída está selecionado.
  - Se validações falham, emite erro via `emitUIChange('onError', mensagem)`.
  - Inverte o estado `isRunning` (de false para true).
  - Atualiza o texto do botão e status via `emitUIChange('onListenButtonToggle', {...})`.
  - Chama `updateStatusMessage('Status: ouvindo...')`.
  - Finalmente, chama `startAudio()` para iniciar a captura de áudio.

## 2. Inicialização da Captura de Áudio

- **Arquivo**: `renderer.js`
- **Função/Evento**: `startAudio()` (linha ~1020)
- **Descrição**: Esta função coordena o início da captura de áudio de entrada (microfone) e saída (áudio do sistema). Detecta o modelo STT configurado e roteia para o fluxo apropriado.
  - Chama `getConfiguredSTTModel()` para obter o modelo selecionado (ex: 'vosk-local', 'whisper-cpp-local', 'whisper-1').
  - Se modelo for 'deepgram': chama `startAudioDeepgram(UIElements)` (não coberto aqui).
  - Caso contrário: Inicia servidor 'whisper-cpp-local' se necessário via IPC `start-whisper-server` e chama `startInputOutput()`.

### 2.1. Fluxo para Outros Modelos (startInputOutput)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `startInputOutput()` (linha ~1031)
- **Descrição**: Usa MediaRecorder para capturar áudio em chunks e preparar para envio via IPC.
  - Se dispositivo de entrada selecionado: chama `startInput()`.
  - Se dispositivo de saída selecionado: chama `startOutput()`.

#### 2.1.1. Captura de Entrada (Microfone) com Outros Modelos

- **Arquivo**: `renderer.js`
- **Função/Evento**: `startInput()` (linha ~1313)
- **Descrição**:
  - Obtém dispositivo selecionado (`UIElements.inputSelect.value`).
  - Cria MediaStream via `navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })`.
  - Cria MediaRecorder com MIME type 'audio/webm;codecs=opus' ou fallback.
  - Define eventos: `ondataavailable` chama `handleInputChunk(blob)` para processar cada blob de 1 segundo.
  - Define `onstop` para finalizar e limpar.
  - Inicia gravação com `recorder.start(1000)` (chunks de 1 segundo).
  - Chama `startInputVolumeMonitoring()` para VU meter (opcional, monitora volume sem gravar).

#### 2.1.2. Captura de Saída (Sistema) com Outros Modelos

- **Arquivo**: `renderer.js`
- **Função/Evento**: `startOutput()` (linha ~1438)
- **Descrição**:
  - Similar ao input, mas usa `navigator.mediaDevices.getDisplayMedia({ audio: true, video: false })` com `selfBrowserSurface: 'include'` para capturar loopback (áudio do sistema).
  - Cria MediaRecorder similar.
  - `ondataavailable` chama `handleOutputChunk(blob)`.
  - Inicia com `recorder.start(1000)`.
  - Chama `startOutputVolumeMonitoring()` para VU meter.

## 3. Processamento de Chunks de Áudio

Quando um chunk de áudio é gravado (a cada 1 segundo), o evento `ondataavailable` é disparado.

### 3.1. Para Entrada (Microfone)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleInputChunk(blobChunk)` (definido em `startInput()`)
- **Descrição**:
  - Recebe o `blobChunk` (áudio em formato WebM/Opus).
  - Converte o blob para ArrayBuffer usando `FileReader` (async, com promise).
  - Quando convertido, chama `transcribeInput(arrayBuffer)`.

### 3.2. Para Saída (Sistema)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleOutputChunk(blobChunk)` (definido em `startOutput()`)
- **Descrição**:
  - Similar ao de entrada: converte blob para ArrayBuffer.
  - Chama `transcribeOutput(arrayBuffer)`.

## 4. Envio para Transcrição via IPC

A transcrição é feita no processo main (Electron) para acessar APIs ou arquivos locais.

### 4.1. Transcrição de Entrada

- **Arquivo**: `renderer.js`
- **Função/Evento**: `transcribeInput(arrayBuffer)` (linha ~2165)
- **Descrição**:
  - Converte ArrayBuffer para Buffer Node.js usando `Buffer.from(arrayBuffer)`.
  - Define timestamps: `pendingInputStartAt = Date.now()` (aproximado).
  - Invoca IPC: `ipcRenderer.invoke('transcribe-audio', buffer, 'input')` (passa source para distinguir).
  - Handler no main process responde com `{ author: 'SELF', text: transcribedText }`.

### 4.2. Transcrição de Saída

- **Arquivo**: `renderer.js`
- **Função/Evento**: `transcribeOutput(arrayBuffer)` (linha ~2244)
- **Descrição**:
  - Similar: converte para Buffer.
  - Define `pendingOutputStartAt = Date.now()`.
  - Invoca IPC: `ipcRenderer.invoke('transcribe-audio', buffer, 'output')`.
  - Handler responde com `{ author: 'OTHER', text: transcribedText }`.

### 4.3. Processamento no Main Process

- **Arquivo**: `main.js`
- **Função/Evento**: Handler IPC `'transcribe-audio'` (definido em main.js)
- **Descrição**:
  - Recebe Buffer de áudio e source ('input' ou 'output').
  - Salva temporariamente em arquivo WAV usando `os.tmpdir()` + `wav` library (ex: `temp_audio_input.wav`).
  - Chama `transcribeAudio(buffer, source)` que roteia pelo modelo:
    - 'vosk-local': `transcribeVoskComplete(buffer, source)` (usa vosk-server.py via HTTP).
    - 'whisper-cpp-local': Envia para servidor local iniciado em `startAudio()`.
    - 'whisper-1': Usa OpenAI API com chave de `electron-store`.
  - Recebe texto transcrito.
  - Envia de volta via `event.reply('transcription-result', { author, text })`.

## 5. Recepção e Processamento da Transcrição no Renderer

- **Arquivo**: `renderer.js`
- **Função/Evento**: Listener IPC `'transcription-result'` (definido em renderer.js, linha ~XXXX)
- **Descrição**:
  - Recebe `{ author, text }` (author: 'SELF' para input, 'OTHER' para output).
  - Chama `handleSpeech(author, text)` para processar o texto transcrito.

### 5.1. Processamento do Texto Transcrito

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleSpeech(author, text)` (linha ~2450)
- **Descrição**:
  - Limpa o texto: remove "Ê+", "hum", "ahn" com regex.
  - Ignora frases muito curtas (< 3 caracteres após limpeza).
  - Para `author === 'OTHER'` (saída/sistema): adiciona à transcrição atual, chama `handleCurrentQuestion(author, text, { isFinal: true })`.
  - Para `author === 'SELF'` (entrada/microfone): similar, mas foco é na saída para reuniões.

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleCurrentQuestion(author, text, options)` (linha ~2560)
- **Descrição**:
  - Atualiza `currentQuestion.text` concatenando o texto transcrito.
  - Define `currentQuestion.lastUpdateTime = Date.now()`.
  - Chama `renderCurrentQuestion()` para atualizar UI.
  - Se modo entrevista e texto parece pergunta, pode chamar `autoAskGptIfReady()` após timeout.

## 6. Renderização na Tela

- **Arquivo**: `config-manager.js` (via eventos emitidos)
- **Função/Evento**: `emitUIChange('onCurrentQuestionUpdate', {...})` (de `renderCurrentQuestion()`)
- **Descrição**:
  - O `config-manager.js` escuta o evento e atualiza o DOM: define texto no elemento `#current-question`.
  - Atualiza seleções visuais (classes CSS).

- **Arquivo**: `config-manager.js`
- **Função/Evento**: `emitUIChange('onTranscriptAdd', {...})` (de `addTranscript()` em `handleSpeech()`)
- **Descrição**:
  - Adiciona transcrição à conversa no `#conversation`.
  - Usa `marked` para Markdown.

## 7. Fechamento e Finalização de Perguntas

- Quando silêncio detectado (via heurísticas ou timeouts), `closeCurrentQuestion()` é chamado.
- **Arquivo**: `renderer.js`
- **Função/Evento**: `closeCurrentQuestion()` (linha ~2625)
- **Descrição**:
  - Verifica se texto parece pergunta (`looksLikeQuestion()`).
  - Se modo normal: promove para histórico via `promoteCurrentToHistory()`.
  - Se modo entrevista: prepara para GPT, chama `askGpt()` se turno correto.

## Pontos de Atenção e Possíveis Problemas

- **Validações Iniciais**: `hasActiveModel()` falha se config inválida.
- **Captura de Áudio**: Permissões ou dispositivos incorretos falham em `getUserMedia()`/`getDisplayMedia()`.
- **Conversão de Blob**: `FileReader` pode falhar se blob corrompido.
- **IPC**: Timeout ou erro no `invoke('transcribe-audio')` se main process travar.
- **Transcrição no Main**: Chave API errada, servidor local down, ou arquivo temp não criado.
- **Processamento**: Texto lixo ignorado; renderização falha se eventos não ouvidos.
- **Modo Debug**: Logs em console mostram progresso; verificar se modelo STT está correto em config.