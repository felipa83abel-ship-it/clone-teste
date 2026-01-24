# Arquitetura AskMe - Refatoração Completa

Documento de referência da arquitetura após refatoração FASE 1-4 (jan 2026).

## 📋 Visão Geral

**AskMe** é um aplicativo Electron single-window que funciona como overlay sempre visível, capturando áudio ambiente, convertendo em texto via STT (Speech-to-Text) e gerando respostas via LLM (Large Language Model).

```
┌─────────────────────────────────────────────────────┐
│  USUÁRIO (Ctrl+D: captura áudio, Ctrl+Enter: pergunta) │
└──────────────┬──────────────────────────────────────┘
               │
        ┌──────▼────────┐
        │   Overlay UI   │  (transparente, frameless, sempre visível)
        │  (index.html)  │
        └──────┬────────┘
               │
      ┌────────▼─────────┐
      │  ModeController   │  (Fala → STT → LLM → Resposta)
      └────────┬─────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
  STT       LLM        IPC
 Engine    Manager    Handlers
```

---

## 🎯 Camadas Principais

### 1. **Renderer (Frontend)**

**Arquivos**: `renderer.js`, `config-manager.js`, `index.html`, `styles.css`

#### renderer.js

- **Ponto de entrada** do app (rodando no contexto renderer do Electron)
- Expõe `window.RendererAPI` com métodos:
  - `startAudioCapture()` / `stopAudioCapture()`
  - `registerHotkey(keys, callback)`
  - `setText(text)`
  - Integração com medidores (VAD, volume)

#### ModeController

- **Orquestra o fluxo** principal: Fala → STT → LLM → UI
- Gerencia turnos (questions/answers) com `turnId` único
- Estados: `IDLE`, `LISTENING`, `TRANSCRIBING`, `ASKING_LLM`, `WAITING_RESPONSE`
- Heurísticas de silêncio/timeout configuráveis

#### config-manager.js

- Persiste configurações em localStorage + secure store (electron-store)
- Gerencia seleção de providers (OpenAI, Google/Gemini, OpenRouter)
- UI abas: Geral, API e Modelos, Áudio, Privacidade, Reset
- Integração com IPC para salvar/deletar chaves seguras

---

### 2. **STT (Speech-to-Text)**

**Diretório**: `stt/` com 4 providers implementados

#### stt-whisper.js (Principal)

```javascript
class WhisperSTT extends BaseSTT {
	// Métodos principais:
	// • initialize(model) - Inicializa cliente
	// • startCapture(source, deviceId) - Abre stream de áudio
	// • transcribe() - Converte áudio em texto
	// • changeDevice(source, deviceId) - Troca entrada/saída
	// • stop() - Cleanup
}
```

**Características**:

- Suporta 2 modos: local (Whisper.cpp CLI) + cloud (OpenAI Whisper-1)
- VAD (Voice Activity Detection) integrado via vad-engine.js
- Thresholds de silêncio/fala configuráveis
- Dispositivos de áudio dinâmicos

#### Outros STT

- **stt-vosk.js**: Offline, multilingue, leve (Python subprocess)
- **stt-deepgram.js**: Cloud, alta precisão, real-time (via SDK)
- **stt-openrouter.js**: Agregador multimodel

#### vad-engine.js

- Motor centralizado de detecção de silêncio
- 3 modos: `NATIVE`, `FALLBACK` (volume), `HYBRID`
- Thresholds ajustáveis: silêncio (300ms), fala pré-silêncio (100ms)

---

### 3. **LLM (Completions & Streaming)**

**Diretório**: `llm/handlers/` com handlers plugáveis

#### Padrão Handler

```javascript
class MyLLMHandler {
	async initialize(apiKey) {
		/* Cliente setup */
	}
	async complete(messages) {
		/* Resposta completa (Promise<string>) */
	}
	async *stream(messages) {
		/* Generator async para tokens */
	}
}
```

#### Handlers Implementados

**openai-handler.js** ✅ (Completo)

- Modelos: GPT-4o, GPT-4o-mini, GPT-3.5-turbo
- Streaming via `on('data')` + parsing de SSE
- Timeout: 60s

**gemini-handler.js** ✅ (Pronto - pendente crédito para testar)

- Modelo: gemini-1.5-flash
- Streaming via AsyncGenerator + `text()` em stream
- Timeout: 60s
- Requer Google API key em https://ai.google.dev/

**template-handler.js** (Referência)

- Guia passo-a-passo para criar novo handler
- Inclui exemplo de formato de mensagens e registro

#### LLMManager (renderer.js)

```javascript
const llmManager = new LLMManager();
llmManager.register('openai', openaiHandler);
llmManager.register('gemini', geminiHandler);
llmManager.selectProvider('openai'); // ou 'gemini'
const response = await llmManager.ask(messages);
```

---

### 4. **Main Process (Electron)**

**Arquivo**: `main.js`

#### Responsabilidades

1. **Criação de janela**: overlay transparente, frameless, sempre visível
2. **Armazenamento seguro**: `electron-store` com encriptação
3. **Inicialização de clientes**: OpenAI, Gemini (baseado em chaves salvas)
4. **Handlers IPC**: Ponte renderer ↔ main

#### IPC Handlers Principais

**Configuração**:

- `GET_APP_CONFIG` → retorna constantes APP_CONFIG
- `GET_API_KEY` → lê chave do secure store
- `SAVE_API_KEY` → salva chave + inicializa cliente (OpenAI ou Gemini)
- `DELETE_API_KEY` → remove chave + desconecta cliente

**STT**:

- `transcribe-audio` → chamada Whisper completa
- `transcribe-audio-partial` → chamada Whisper streaming

**LLM**:

- `ask-llm` → completação OpenAI
- `ask-llm-stream` → streaming OpenAI via eventos

**Atalhos globais**:

- `Ctrl+D` → `CMD_TOGGLE_AUDIO` (inicia/para captura)
- `Ctrl+Enter` → `CMD_ASK_LLM` (envia pergunta)

---

## 🔐 Segurança & Armazenamento

### electron-store (Encrypt)

```javascript
// Inicialização em main.js
const secureStore = new Store({
	configName: 'secure-config',
	encryptionKey: 'sua-chave-segura-aqui',
});

// Uso
secureStore.set('apiKeys.openai', trimmedKey);
const key = secureStore.get('apiKeys.openai');
secureStore.delete('apiKeys.openai');
```

### Fluxo de API Key

1. **UI** (config-manager.js) → input campo "Google API Key"
2. **IPC SAVE_API_KEY** → main.js valida + encripta + salva
3. **Client Init** → main.js cria GoogleGenerativeAI(apiKey)
4. **Handler Acesso** → gemini-handler usa cliente já inicializado
5. **Reset** → apaga todas as chaves + desconecta clientes

---

## 📡 Fluxo de Dados: Pergunta Completa

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CAPTURA: Usuário fala (Ctrl+D ativa capture)                │
│    ModeController → startAudioCapture() → WhisperSTT.start()   │
│    VAD monitora volume, dispara transcribe() ao silêncio        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│ 2. STT: Converte áudio em texto (Whisper local ou OpenAI)      │
│    WhisperSTT.transcribe(audioBlob) → "Como usar Node.js?"     │
│    Retorna IPC event: STT_RESULT → renderer                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│ 3. PERGUNTA → LLM: Envia para provider selecionado            │
│    ModeController → llmManager.ask(messages)                   │
│    messages = [                                                 │
│      { role: 'system', content: SYSTEM_PROMPT },              │
│      { role: 'user', content: "Como usar Node.js?" }          │
│    ]                                                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│ 4. STREAMING: Tokens chegam via stream()                       │
│    async *stream(messages) → yield "Node", yield ".js", ...   │
│    Cada token → IPC LLM_STREAM_CHUNK → UI atualiza em tempo real│
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│ 5. RESPOSTA COMPLETA: Fim do streaming (LLM_STREAM_END)        │
│    Turn completo adicionado ao histórico com turnId            │
│    Pronto para próxima pergunta                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuração Chave (renderer.js, top)

```javascript
// Sistema prompt para LLM
const SYSTEM_PROMPT = `Você é um assistente de IA útil...`;

// Thresholds de silêncio (em ms)
const SILENCE_THRESHOLD = 300;
const LEADING_SILENCE_THRESHOLD = 100;

// Timeout transcrição
const TRANSCRIPTION_TIMEOUT = 30000; // 30s

// Seleção de STT/LLM
const DEFAULT_STT_MODEL = 'whisper'; // ou 'vosk', 'deepgram'
const DEFAULT_LLM_PROVIDER = 'openai'; // ou 'gemini'
```

---

## 📦 Dependências Principais

```json
{
	"devDependencies": {
		"electron": "^39.2.7",
		"electron-reload": "^2.0.0-alpha.1",
		"cross-env": "^10.1.0"
	},
	"dependencies": {
		"electron-store": "^11.0.2",
		"openai": "^6.10.0",
		"@google/generative-ai": "^0.x.x",
		"marked": "^17.0.1",
		"highlight.js": "^11.11.1",
		"wav": "^1.0.2"
	}
}
```

---

## 🚀 Como Estender

### Adicionar Novo LLM Provider

1. **Criar handler** em `llm/handlers/seu-provider-handler.js`

   ```javascript
   const Handler = require('./template-handler.js');
   class SeuProviderHandler extends Handler {
   	// Implementar: initialize, complete, stream
   }
   module.exports = new SeuProviderHandler();
   ```

2. **Registrar em renderer.js**

   ```javascript
   const suaHandler = require('./llm/handlers/seu-provider-handler.js');
   llmManager.register('seu-provider', suaHandler);
   ```

3. **Adicionar em main.js**

   ```javascript
   let seuClient = null;
   function initializeSeuClient(apiKey) {
   	/* setup */
   }
   // Atualizar handleSaveApiKey e handleDeleteApiKey
   ```

4. **Adicionar UI em config-manager.js**
   ```javascript
   // Aba "seu-provider" com input API key
   ```

Referência completa em `llm/handlers/template-handler.js`.

### Adicionar Novo STT Provider

Similar ao LLM, herde de `BaseSTT` (não existe yet - considerar refatorar).

---

## 📊 Histórico de Turnos (Turns)

Cada pergunta+resposta = 1 turn com estrutura:

```javascript
{
  turnId: 1,  // Incrementado globalmente
  timestamp: 1234567890,
  question: "Como usar Node.js?",
  answer: "Node.js é...",
  provider: "openai",  // Qual LLM respondeu
  model: "gpt-4o-mini",
  status: "COMPLETED"  // ou ERROR
}
```

Renderizado em HTML com markdown (marked.js) + syntax highlight (highlight.js).

---

## ✅ Checklist de Qualidade Pós-Refatoração

- [x] 5 bugs da FASE 3 corrigidos e testados
- [x] Tema dark como padrão
- [x] Reset factory com limpeza total
- [x] OpenAI LLM integrado e testado
- [x] Gemini LLM integrado (pronto para testar)
- [x] Template para novos providers
- [ ] Testes unitários (não implementado)
- [ ] Documentação de API em JSDoc
- [ ] SonarQube analysis (opcional)

---

## 🔜 Próximos Passos (FASE 5.3+)

1. **Teste Gemini** quando houver crédito
2. **Integrar Anthropic** (usar template-handler.js)
3. **Cleanup code**: Remover comentários antigos de refatoração
4. **SonarQube**: Análise de qualidade de código
5. **Merge para main** quando pronto para produção

---

**Última atualização**: 23 jan 2026  
**Ramo**: `refatoracao`  
**Status**: FASE 5 em progresso
