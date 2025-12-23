# Instruções para agentes de código — AskMe

Resumo rápido

- Projeto: Electron single-window (Main + Renderer). Janela principal carregada por `index.html`.
- `main.js`: processo principal — inicializa OpenAI, registra atalhos globais e expõe handlers IPC.
- `renderer.js`: lógica da UI, captura/gravação de áudio, orquestra modos (NORMAL / INTERVIEW) e envia IPC para `main`.
- Rodar: `npm install` e `npm start` (script `start` chama `electron .`).

Arquitetura e fluxos principais

- Main ↔ Renderer via `ipcMain.handle` / `ipcRenderer.invoke` e eventos enviados com `webContents.send`.
  - Handlers expostos em `main.js`:
    - `GET_APP_CONFIG` -> retorna `APP_CONFIG` (útil para detectar `MODE_DEBUG`).
    - `transcribe-audio` e `transcribe-audio-partial` -> recebem buffer de áudio, gravam `temp-audio*.webm`, chamam Whisper via OpenAI e retornam `transcription.text`.
    - `ask-gpt` -> recebe `messages` (array de mensagens no formato OpenAI) e retorna string com a resposta.
    - `ask-gpt-stream` -> cria stream; envia tokens para renderer via `GPT_STREAM_CHUNK` e, ao final, `GPT_STREAM_END`.
  - Eventos enviados a partir do processo principal:
    - `CMD_TOGGLE_AUDIO` e `CMD_ASK_GPT` (ativos por atalhos globais: Ctrl+D, Ctrl+Enter).

Padrões e convenções do projeto

- Código CommonJS (`type: "commonjs"` em `package.json`) — use `require()` no renderer e no main.
- `BrowserWindow` foi criado com `nodeIntegration: true` e `contextIsolation: false` — o renderer usa APIs Node diretamente (require disponível).
- Prompt do sistema e regras de resposta ficam em `renderer.js` na constante `SYSTEM_PROMPT` — editar aqui muda comportamento de entrevista.
- Modos: `ModeController` em `renderer.js` controla comportamento (p.ex. `allowPartialTranscription()`, `allowGptStreaming()`).
- Parâmetros de áudio e heurísticas (thresholds, timeouts, tamanhos mínimos) ficam no topo de `renderer.js` — alterá-los muda sensibilidade/latência do fluxo.

Integrações e pontos sensíveis

- OpenAI SDK é instanciado em `main.js` (nota: atualmente a API key está embutida lá). Local: criação de `new OpenAI({ apiKey: 'sk-...' })`.
  - Local de chamadas principais: `openai.audio.transcriptions.create(...)` (Whisper) e `openai.chat.completions.create(...)` (chat, com `stream: true` em streaming).
- Arquivos temporários: `temp-audio.webm` e `temp-audio-partial.webm` são gravados no diretório do projeto e removidos após uso.

Exemplos práticos (como um agente deve modificar / chamar)

- Chamar transcrição do renderer:
  - `const text = await ipcRenderer.invoke('transcribe-audio', audioBuffer);`
- Pedir completude simples:
  - `const reply = await ipcRenderer.invoke('ask-gpt', messagesArray);`
- Pedir streaming e receber tokens:
  - no main: já envia `GPT_STREAM_CHUNK`; no renderer escute `ipcRenderer.on('GPT_STREAM_CHUNK', (_, token) => { ... })` e `GPT_STREAM_END`.

Arquivos chave para editar / revisar

- `main.js` — integrações OpenAI, handlers IPC, atalhos globais, arquivos temporários, onde trocar modelo/API key.
- `renderer.js` — grande parte da lógica do app: captura de áudio, heurísticas, UI bindings, `SYSTEM_PROMPT`, `ModeController`.
- `index.html` — estrutura do DOM; IDs usados pelo renderer: `micSelect`, `outputSelect`, `listenBtn`, `conversation`, `currentQuestionText`, `questionsHistory`, `answersHistory`, `mockToggle`, `interviewModeSelect`.
- `package.json` — script `start` e dependências (electron, openai, marked, highlight.js, wav).

Dicas rápidas de desenvolvimento e depuração

- Rodar local: `npm install` seguido de `npm start` (o `electron` local está em devDependencies, portanto `npm start` resolve o binário automaticamente).
- Atalhos úteis para testes: `Ctrl+D` (toggle ouvir), `Ctrl+Enter` (gerar resposta). Observe que os atalhos são registrados via `globalShortcut` no `main`.
- Para testar fluxos de transcrição/streaming, verifique logs no terminal onde o Electron é iniciado — `main.js` faz `console.log` em pontos chave.

Notas de segurança e manutenção

- Há uma chave OpenAI hardcoded em `main.js` — não a exponha em commits públicos. Preferir mover para `process.env`/variáveis de ambiente.
- `nodeIntegration: true` e `contextIsolation: false` facilitam mudanças rápidas, mas reduzem segurança; ao hardening, revise essas flags e adapte `renderer.js` para usar `contextBridge`.

O que o agente NÃO deve alterar sem confirmação

- Trocar o modelo OpenAI (`gpt-4o-mini`) ou a forma de streaming sem entender latência/consumo — impacta custos e UX.
- Mover gravação de arquivos sem ajustar exclusão/locks (`temp-audio*.webm`) — pode causar arquivos órfãos.

Se precisar de algo mais

- Diga qual parte quer que eu documente melhor (IPC, prompts, heurísticas de áudio, ou migrar a chave para env vars).

---

Arquivo gerado automaticamente para orientar agentes. Peça iterações se algo estiver incompleto.
