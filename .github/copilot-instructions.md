# Instruções para agentes de código — AskMe

Resumo rápido

- Projeto: Electron single-window. A janela principal é carregada por index.html.
- Rodar: `npm install` e `npm start`.

Principais mudanças pós-refatoração

- Armazenamento seguro de chaves: `main.js` usa `electron-store` (store encriptado) para salvar API keys; `config-manager.js` grava via IPC (`SAVE_API_KEY`) e o `main` inicializa o cliente OpenAI quando solicitado.
- RendererAPI: `renderer.js` expõe uma API global (`window.RendererAPI`) usada por `config-manager.js` para iniciar/parar medidores, registrar atalhos e gerenciar click-through.
- Janela overlay: `main.js` cria a BrowserWindow em modo overlay (transparent, frameless, alwaysOnTop) com suporte a click-through controlado via IPC (`SET_CLICK_THROUGH`, `SET_INTERACTIVE_ZONE`).
- Fluxos de áudio: `renderer.js` centraliza captura, gravação e heurísticas (thresholds, timeouts). `transcribe-audio` e `transcribe-audio-partial` no `main` usam o cliente OpenAI para Whisper.
- GPT: `ask-gpt` (completions) e `ask-gpt-stream` (streaming via `GPT_STREAM_CHUNK` / `GPT_STREAM_END`) ficam no `main` e enviam tokens para renderer.

IPC e contratos importantes

- Do renderer -> main (invokes / handles):

  - `GET_APP_CONFIG` => retorna `APP_CONFIG` (útil para `MODE_DEBUG`).
  - `GET_API_KEY`, `SAVE_API_KEY`, `DELETE_API_KEY` => gerenciam chaves via secure store.
  - `transcribe-audio`, `transcribe-audio-partial` => recebem Buffer, escrevem arquivo temporário em `os.tmpdir()` e chamam Whisper.
  - `ask-gpt`, `ask-gpt-stream` => solicitam respostas/stream do modelo.

- Do main -> renderer (events):
  - `CMD_TOGGLE_AUDIO`, `CMD_ASK_GPT` (atalhos globais: Ctrl+D, Ctrl+Enter)
  - `API_KEY_UPDATED`, `GPT_STREAM_CHUNK`, `GPT_STREAM_END`, `GPT_STREAM_ERROR`

Padrões e convenções

- CommonJS (`require`) é usado em `main` e `renderer` (package.json mantém `type: "commonjs"`).
- `nodeIntegration: true` e `contextIsolation: false` continuam sendo usados — facilita integração mas reduz segurança (considere migrar para `contextBridge` no futuro).
- `renderer.js` contém o `SYSTEM_PROMPT`, `ModeController` e parâmetros no topo do arquivo (alterar aí muda comportamento/heurísticas).

Dependências relevantes (use estas versões como regra)

"devDependencies": {
"cross-env": "^10.1.0",
"electron": "^39.2.7",
"electron-reload": "^2.0.0-alpha.1"
},
"dependencies": {
"electron-store": "^11.0.2",
"highlight.js": "^11.11.1",
"marked": "^17.0.1",
"openai": "^6.10.0",
"wav": "^1.0.2"
}

Pontos de atenção para revisões futuras

- Segurança: remover logs temporários que expõem chaves em produção (já ajustado para máscara).
- Robustez: verificação de erros e retry nos handlers de transcrição e streaming (já existem proteções, revisar timeouts e retry policy conforme uso).

Como modificar de forma segura

- Para trocar modelo OpenAI ou habilitar outro provider, use a UI `Configurações -> API e Modelos` (config-manager já desativa provider sem chave).

Checklist rápido para QA após mudanças

- `npm install` -> `npm start` inicia sem error.
- A página carrega, `RendererAPI` disponível no window.
- Salvar/mostrar/mostrar-máscara de API key funciona sem revelar valor completo.
- Transcrição (`transcribe-audio`) e GPT (`ask-gpt`, `ask-gpt-stream`) respondem conforme esperado.

---
