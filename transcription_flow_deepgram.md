# Fluxo Detalhado de Transcrição com Deepgram

Este documento descreve o fluxo passo a passo de cada função e evento chamado durante o processo de transcrição de áudio usando o Deepgram, começando pelo acionamento do botão "Começar a Ouvir" (listenToggleBtn). O foco é no caminho até a transcrição aparecer na tela, incluindo validações, inicialização de áudio, captura, envio para Deepgram, processamento da resposta e renderização.

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
- **Função/Evento**: `startAudio()` (chamada de `listenToggleBtn()`)
- **Descrição**: Esta função coordena o início da captura de áudio de entrada (microfone) e saída (áudio do sistema).
  - Chama `startInput()` para iniciar captura do microfone.
  - Chama `startOutput()` para iniciar captura do áudio de saída (usando loopback).
  - Define flags como `isInputRunning = true` e `isOutputRunning = true`.
  - Inicia medições de métricas de transcrição (`transcriptionMetrics.audioStartTime = Date.now()`).

### 2.1. Captura de Entrada (Microfone)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `startInput()` (chamada de `startAudio()`)
- **Descrição**:
  - Obtém o dispositivo de entrada selecionado (`UIElements.inputSelect.value`).
  - Cria um `MediaStream` usando `navigator.mediaDevices.getUserMedia()`.
  - Cria um `MediaRecorder` para gravar o áudio em chunks (blobs).
  - Define eventos: `ondataavailable` para processar chunks, `onstop` para finalizar.
  - Inicia a gravação com `recorder.start(1000)` (chunks de 1 segundo).
  - Chama `startInputVolumeMonitoring()` para monitorar volume (opcional).

### 2.2. Captura de Saída (Áudio do Sistema)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `startOutput()` (chamada de `startAudio()`)
- **Descrição**:
  - Obtém o dispositivo de saída selecionado (`UIElements.outputSelect.value`).
  - Cria um `MediaStream` usando `navigator.mediaDevices.getDisplayMedia()` com `audio: true` e `selfBrowserSurface: 'include'` para capturar áudio de saída (loopback).
  - Cria um `MediaRecorder` similar ao de entrada.
  - Inicia a gravação com `recorder.start(1000)`.
  - Chama `startOutputVolumeMonitoring()` para monitorar volume.

## 3. Processamento de Chunks de Áudio

Quando um chunk de áudio é gravado (a cada 1 segundo), o evento `ondataavailable` é disparado.

### 3.1. Para Entrada (Microfone)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleInputChunk()` (definido em `startInput()`)
- **Descrição**:
  - Recebe o `blobChunk` (áudio em formato blob).
  - Converte o blob para ArrayBuffer usando `FileReader`.
  - Envia para transcrição via `transcribeInput(blobChunk)`.

### 3.2. Para Saída (Sistema)

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleOutputChunk()` (definido em `startOutput()`)
- **Descrição**:
  - Similar ao de entrada: converte blob para ArrayBuffer.
  - Envia para transcrição via `transcribeOutput(blobChunk)`.

## 4. Envio para Transcrição com Deepgram

A transcrição é feita via IPC para o processo main (Electron), que usa o cliente Deepgram.

### 4.1. Transcrição de Entrada

- **Arquivo**: `renderer.js`
- **Função/Evento**: `transcribeInput(blobChunk)` (linha ~2165)
- **Descrição**:
  - Converte o ArrayBuffer para Buffer (usando `Buffer.from()`).
  - Invoca IPC: `ipcRenderer.invoke('transcribe-audio', buffer)`.
  - O IPC vai para `main.js`, handler `'transcribe-audio'`.

### 4.2. Transcrição de Saída

- **Arquivo**: `renderer.js`
- **Função/Evento**: `transcribeOutput(blobChunk)` (linha ~2244)
- **Descrição**:
  - Similar: converte para Buffer.
  - Invoca IPC: `ipcRenderer.invoke('transcribe-audio', buffer)`.
  - Mesmo handler no main.

- **Nota**: Para Deepgram, há também `transcribeOutputPartial(blobChunk)` para transcrições parciais em tempo real, mas o fluxo principal usa `transcribeOutput()`.

## 5. Processamento no Processo Main (Electron)

- **Arquivo**: `main.js`
- **Função/Evento**: Handler IPC `'transcribe-audio'` (definido em main.js)
- **Descrição**:
  - Recebe o Buffer de áudio.
  - Salva temporariamente em arquivo usando `os.tmpdir()` (ex: `temp_audio.wav`).
  - Inicializa cliente OpenAI com chave armazenada (via `electron-store`).
  - Chama `transcribeAudioWithDeepgram(filePath)` ou similar (dependendo da implementação atual).
  - Para Deepgram, usa WebSocket ou API REST para transcrição.
  - Recebe a transcrição de volta (texto transcrito).
  - Envia de volta para renderer via `event.reply('transcription-result', { author, text })`.

- **Arquivo**: `deepgram-transcribe.js` (se usado)
- **Descrição**: Contém funções como `transcribeAudioWithDeepgram()`, que conecta ao WebSocket do Deepgram, envia áudio e recebe transcrições em tempo real.

## 6. Recepção e Processamento da Transcrição no Renderer

- **Arquivo**: `renderer.js`
- **Função/Evento**: Listener IPC `'transcription-result'` (definido em renderer.js)
- **Descrição**:
  - Recebe `{ author, text }` (onde `author` é 'SELF' para entrada ou 'OTHER' para saída).
  - Chama `handleSpeech(author, text)` para processar o texto transcrito.

### 6.1. Processamento do Texto Transcrito

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleSpeech(author, text)` (linha ~2450)
- **Descrição**:
  - Limpa o texto (remove "Ê+", "hum", "ahn").
  - Ignora frases muito curtas (< 3 caracteres).
  - Para `author === 'OTHER'` (saída/sistema): adiciona à transcrição atual, chama `handleCurrentQuestion()`.
  - Para `author === 'SELF'` (entrada/microfone): adiciona à transcrição, mas foco é na saída para reuniões.

- **Arquivo**: `renderer.js`
- **Função/Evento**: `handleCurrentQuestion(author, text)` (linha ~2560)
- **Descrição**:
  - Similar a `handleSpeech`, mas focado em consolidar transcrições no "CURRENT" (pergunta atual).
  - Atualiza `currentQuestion.text` com o texto transcrito.
  - Renderiza via `renderCurrentQuestion()`.

## 7. Renderização na Tela

- **Arquivo**: `config-manager.js` (via eventos emitidos)
- **Função/Evento**: `emitUIChange('onCurrentQuestionUpdate', {...})` (de `renderCurrentQuestion()`)
- **Descrição**:
  - O `config-manager.js` escuta o evento `onCurrentQuestionUpdate` e atualiza o DOM: define o texto da pergunta atual no elemento `#current-question`.
  - Também atualiza seleções visuais (classes CSS para destacar).

- **Arquivo**: `config-manager.js`
- **Função/Evento**: `emitUIChange('onTranscriptAdd', {...})` (de `addTranscript()`)
- **Descrição**:
  - Adiciona a transcrição à conversa no elemento `#conversation`.
  - Usa `marked` para renderizar Markdown se necessário.

## 8. Fechamento e Finalização de Perguntas

- Quando a transcrição para (silêncio detectado), `closeCurrentQuestion()` é chamado (via timeouts ou heurísticas).
- **Arquivo**: `renderer.js`
- **Função/Evento**: `closeCurrentQuestion()` (linha ~2625)
- **Descrição**:
  - Verifica se a pergunta parece válida (`looksLikeQuestion()`).
  - Finaliza e promove para histórico se for modo normal.
  - No modo entrevista, prepara para GPT.

## Pontos de Atenção e Possíveis Problemas

- **Validações Iniciais**: Se `hasActiveModel()` ou dispositivo de saída falhar, a escuta não inicia.
- **Captura de Áudio**: Problemas com permissões ou dispositivos podem falhar em `getUserMedia()` ou `getDisplayMedia()`.
- **Envio para Deepgram**: Chave API inválida ou problemas de rede no WebSocket.
- **Processamento**: Texto muito curto ou lixo pode ser ignorado.
- **Renderização**: Eventos não sendo ouvidos corretamente em `config-manager.js` podem impedir atualização da UI.
- **Modo Debug**: Verificar logs em console para rastrear onde para.

Este fluxo cobre a transcrição básica. Para streaming em tempo real com Deepgram, há caminhos adicionais via WebSocket direto em `deepgram-transcribe.js`, mas o principal é via IPC para main.js.