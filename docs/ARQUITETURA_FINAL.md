# 🏗️ Arquitetura Final do AskMe

## Visão Geral

Este documento descreve a arquitetura completa do projeto **AskMe** (Electron), organizado seguindo princípios de **Arquitetura Limpa** e **Padrão Hexagonal**.

A estrutura separa claramente:
- **Infraestrutura** (bus de eventos, estado global)
- **Services** (adapters que integram com APIs externas e hardware)
- **Controllers** (lógica da UI, seção-específica e global)
- **Core** (futuro: lógica de negócio agnóstica)

---

## 📁 Estrutura Completa

```
projeto-root/
│
├── 📘 infra/                          ← INFRAESTRUTURA (plumbing)
│   ├── bus/
│   │   └── EventBus.js               # Pub/Sub event system (despedalhador central)
│   └── state/
│       └── AppState.js               # Estado global da aplicação
│
├── 🔧 services/                       ← SERVICES (adapters que fazem coisas de verdade)
│   │
│   ├── stt/                           # Speech-to-Text
│   │   ├── STTStrategy.js             # Orquestrador de providers STT
│   │   ├── stt-deepgram.js            # Adapter: Deepgram API
│   │   ├── stt-vosk.js                # Adapter: Vosk (local, offline)
│   │   ├── stt-whisper.js             # Adapter: OpenAI Whisper
│   │   ├── vad-engine.js              # Voice Activity Detection (detector de fala)
│   │   ├── stt-audio-worklet-processor.js # Processamento de áudio Web Audio API
│   │   └── models-stt/                # Modelos dos STT (vosk, whisper)
│   │
│   ├── llm/                           # Large Language Models
│   │   ├── LLMManager.js              # Orquestrador de providers LLM
│   │   ├── llmHandlers.js             # Validação e orquestração de requisições
│   │   └── handlers/                  # Implementações de providers
│   │       ├── openai-handler.js      # Adapter: OpenAI API (GPT)
│   │       ├── gemini-handler.js      # Adapter: Google Gemini API
│   │       └── template-handler.js    # Template para novo provider
│   │
│   └── audio/                         # Audio captura e processamento
│       ├── volume-audio-monitor.js    # Monitor de volume de microfone
│       └── volume-audio-worklet-processor.js # Processamento de áudio
│
├── 🎮 controllers/                    ← CONTROLLERS (lógica de UI)
│   │
│   ├── modes/                         # ✅ GLOBAL
│   │   └── mode-manager.js            # Orquestrador de modos (Normal vs Entrevista)
│   │
│   ├── audio/                         # ✅ GLOBAL
│   │   └── audio-controller.js        # Controlador de captura de áudio
│   │
│   ├── config/                        
│   │   ├── handlers/                  # Handlers de configuração
│   │   │   └── llm-handler.js         # Adaptado de handlers/llmHandlers.js
│   │   └── ConfigManager.js           # Orquestrador de todos os managers
│   │
│   └── sections/                      # 🎯 SEÇÃO-ESPECÍFICA (UI dividida por seção)
│       │
│       ├── home/                      # Seção INICIAL (perguntas e respostas)
│       │   ├── HomeUIManager.js       # Manager da seção home
│       │   ├── question-controller.js # Lógica de perguntas
│       │   └── question-helpers.js    # Helpers para perguntas
│       │
│       ├── top-bar/                   # Seção TOPO (opacidade, modo, badges)
│       │   └── TopBarManager.js       # Manager da barra superior
│       │
│       ├── api-models/                # Seção CONFIGURAÇÃO DE APIs
│       │   ├── ApiKeyManager.js       # Gerenciar chaves de API (OpenAI, Gemini)
│       │   └── ModelSelectionManager.js # Selecionar modelo (GPT-4, Claude, etc)
│       │
│       ├── audio-screen/              # Seção ÁUDIO E SCREENSHOT
│       │   ├── AudioDeviceManager.js  # Seleção de dispositivo de áudio
│       │   ├── ScreenConfigManager.js # Configurações de screenshot
│       │   └── screenshot-controller.js # Lógica de captura de tela
│       │
│       ├── privacy/                   # Seção PRIVACIDADE
│       │   └── PrivacyConfigManager.js # Configurações de privacidade
│       │
│       ├── others/                    # Seção OUTROS
│       │   └── OtherConfigManager.js  # Configurações diversas
│       │
│       ├── info/                      # Seção INFORMAÇÕES
│       │   └── InfoManager.js         # Exibir versão e info da app
│       │
│       └── window/                    # Seção JANELA
│           └── WindowUIManager.js     # Gerenciar janela (drag, click-through, close)
│
├── 📦 core/                           ← CORE (FUTURO - Lógica agnóstica)
│   ├── domain/                        # Tipos e entidades
│   │   ├── audio/
│   │   ├── stt/
│   │   ├── llm/
│   │   └── interview/
│   │
│   └── usecases/                      # Casos de uso (orquestradores de negócio)
│       ├── audio/
│       ├── stt/
│       ├── llm/
│       └── interview/
│
├── utils/                             ← UTILITÁRIOS
│   └── audio/                         # Audio 
│       └── samples/                   # Samples/testes de áudio
│   ├── Logger.js                      # Log com mascara de senhas
│   ├── SecureLogger.js                # Log seguro (sem expor dados sensíveis)
│   ├── ErrorHandler.js                # Tratamento centralizado de erros
│   ├── renderer-helpers.js            # Helpers para renderer.js
│   ├── ui-elements-registry.js        # Registry de elementos DOM
│   └── DOM-Registry.js                # Registro dinâmico de DOM
│
├── types/                             ← TIPOS TYPESCRIPT/JSDoc
│   ├── fluent-ffmpeg.d.ts
│   └── globals.d.ts
│
├── __tests__/                         ← TESTES
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                              ← DOCUMENTAÇÃO
│   ├── ARQUITETURA_FINAL.md          ← VOCÊ ESTÁ AQUI
│   ├── ANALISE_ESTRUTURA_GLOBAL.md
│   └── [outras docs]
│
├── main.js                            ← Backend Electron (IPC handlers)
├── renderer.js                        ← Frontend Electron (inicialização)
├── index.html                         ← Página principal
├── styles.css
└── package.json
```

---

## 🎯 Responsabilidades por Camada

### 1️⃣ **infra/** - Infraestrutura (Independente de domínio)

**O que faz:**
- Oferece serviços técnicos que toda a app usa
- É agnóstico: não sabe nada sobre LLM, STT, ou UI
- É como a "plumbing" elétrica de um prédio

| Arquivo | Responsabilidade |
|---------|------------------|
| `infra/bus/EventBus.js` | **Pub/Sub para comunicação entre componentes**. Centraliza eventos como `llmStreamChunk`, `audioStarted`, `windowOpacityUpdate`. Desacopla componentes (A não precisa conhecer B) |
| `infra/state/AppState.js` | **Estado global único da aplicação**. Substitui 15+ variáveis soltas. Gerencia: audio state, interview history, current question, LLM metrics |

**Exemplo de uso:**
```javascript
// Qualquer arquivo pode usar
globalThis.eventBus.emit('audioStarted', { timestamp: Date.now() });
globalThis.appState.interview.questionsHistory.push(newQuestion);
```

**Decisão arquitetural**: EventBus é pub/sub PURO (sem filtros). AppState é mutável (por simplicidade, futuro: imutável com Immer.js).

---

### 2️⃣ **services/** - Adapters Concretos (Coisas que integram com APIs/Hardware)

A pasta `services/` contém **adapters** - código que interage com:
- APIs externas (OpenAI, Google Gemini, Deepgram)
- Hardware (microfone, câmera)
- Bibliotecas de terceiros

#### **services/stt/** - Provedores Speech-to-Text

| Arquivo | Responsabilidade |
|---------|------------------|
| `STTStrategy.js` | **Orquestrador de providers STT**. Segue padrão Strategy. Permite trocar de Deepgram para Vosk sem alterar código cliente |
| `stt-deepgram.js` | **Adapter Deepgram**. Chama API Deepgram, converte resposta para formato padrão |
| `stt-vosk.js` | **Adapter Vosk**. Rode STT offline usando modelo Vosk, sem depender de APIs |
| `stt-whisper.js` | **Adapter OpenAI Whisper**. Chama API Whisper da OpenAI para transcrição |
| `vad-engine.js` | **Voice Activity Detection**. Detecta quando usuário PAROU de falar. Usa webrtcvad + fallback por energia RMS |
| `stt-audio-worklet-processor.js` | **Processamento Web Audio API**. Captura chunks de áudio do microfone |

**Fluxo:** Microfone → `stt-audio-worklet-processor.js` → `vad-engine.js` (detecta fala) → `STTStrategy.js` (escolhe provider) → Provider específico (Deepgram/Vosk/Whisper) → Transcrição

**Implementação de novo provider:**
```javascript
// 1. Criar novo arquivo
// services/stt/stt-novo-provider.js
class NovoSTTProvider {
  async start(elements) { /* chama API nova */ }
  async stop() { /* para */ }
  async switchDevice(type, deviceId) { /* troca dispositivo */ }
}

// 2. Registrar em renderer.js
globalThis.stt.register('novo-provider', new NovoSTTProvider());

// 3. Selecionar na UI
```

#### **services/llm/** - Provedores Large Language Models

| Arquivo | Responsabilidade |
|---------|------------------|
| `LLMManager.js` | **Orquestrador de providers LLM**. Gerencia timeout, retry com backoff, erro handling. Suporta múltiplos providers (OpenAI, Gemini, Anthropic) |
| `llmHandlers.js` | **Validação e orquestração de requisições LLM**. Valida entrada, previne duplicatas, escolhe modo (streaming vs batch) |
| `handlers/openai-handler.js` | **Adapter OpenAI**. Chama API OpenAI GPT (GPT-4, 4o, mini) |
| `handlers/gemini-handler.js` | **Adapter Google Gemini**. Chama API Google Generative AI |
| `handlers/template-handler.js` | **Template para novo provider**. Guia para implementar Anthropic, Cohere, etc |

**Fluxo:** UI seleciona pergunta → `llmHandlers.js` valida → `LLMManager.js` orquestra → Provider específico (OpenAI/Gemini) → Chama API → Stream ou Batch → Emite eventos para UI atualizar

**Características:**
- ✅ Timeout configurável (para não travar)
- ✅ Retry com backoff exponencial
- ✅ Support para streaming (tokens em tempo real)
- ✅ Fallback se provider falhar

#### **services/audio/** - Captura e Processamento de Áudio

| Arquivo | Responsabilidade |
|---------|------------------|
| `volume-audio-monitor.js` | **Monitora volume do microfone em tempo real**. Atualiza UI com visualização de volume |
| `volume-audio-worklet-processor.js` | **Processa chunks de áudio** via Web Audio API AudioWorklet. Calcula RMS (energia) |

**Fluxo:** Microfone → Web Audio API → `volume-audio-worklet-processor.js` (processa) → `volume-audio-monitor.js` (exibe) → EventBus emite `volumeUpdate` → UI atualiza visualização

---

### 3️⃣ **controllers/** - Lógica de UI

Controllers dividem-se em **GLOBAL** e **SEÇÃO-ESPECÍFICA**.

#### **Global Controllers** (afetam toda a app)

| Arquivo | Responsabilidade |
|---------|------------------|
| `controllers/modes/mode-manager.js` | **Orquestrador de modos (Normal vs Entrevista)**. Modo Normal = faz tudo de uma vez. Modo Entrevista = faz pergunta, aguarda resposta, registra. Controla heurísticas de silêncio, timeout |
| `controllers/audio/audio-controller.js` | **Controlador central de captura de áudio**. Inicia/para captura, aplica VAD, chama STT provider selecionado, trata erros |

**Decisão:** Modo e Audio são **globais** porque afetam múltiplas seções. Se modo muda, afeta home, top-bar, e comportamento geral.

#### **Seção-Específica Controllers** (cada seção tem seu Manager)

Um **Manager** por seção encapsula toda a lógica UI dessa seção:

| Seção | Manager | Responsabilidade |
|-------|---------|------------------|
| **home** | `HomeUIManager.js` | Gerencia: input de pergunta, exibição de resposta, histórico. Listeners: `transcriptAdd`, `llmStreamChunk`, `llmStreamEnd` |
| | `question-controller.js` | Lógica pura: criar pergunta, validar texto, gerar ID |
| | `question-helpers.js` | Helpers: normalizar texto, calcular hash, etc |
| **top-bar** | `TopBarManager.js` | Opacidade do overlay, seleção de modo, badges (screenshots, mock mode). Listeners: `windowOpacityUpdate`, `modeSelectUpdate`, `screenshotTaken` |
| **api-models** | `ApiKeyManager.js` | Gerenciar chaves de API (OpenAI, Gemini). Listeners: `apiKeyUpdated`. IPC: `GET_API_KEY`, `SAVE_API_KEY` |
| | `ModelSelectionManager.js` | Seleção de modelo LLM (GPT-4, Gemini Pro, etc) |
| **audio-screen** | `AudioDeviceManager.js` | Seleção de dispositivo de áudio (qual microfone usar) |
| | `ScreenConfigManager.js` | Configurações de screenshot (incluir/excluir áreas da tela) |
| | `screenshot-controller.js` | Captura de screenshot via `print-screen` |
| **privacy** | `PrivacyConfigManager.js` | Configurações de privacidade (dados é enviados para API, modo mock, etc) |
| **others** | `OtherConfigManager.js` | Configurações diversas (dark mode, futuro) |
| **info** | `InfoManager.js` | Exibir versão da app, links, info |
| **window** | `WindowUIManager.js` | Drag handle (mover janela), click-through (ignorar cliques), botão fechar. Listeners: `DRAG_START`, `DRAG_END` |

**Padrão Manager:**
```javascript
class HomeUIManager {
  #initListeners()    // ← Registra listeners PRIMEIRO
  #initElements()     // ← Setup DOM DEPOIS (pode emitir eventos)
  initialize()        // ← Entry point, chama #initListeners()
  reset()             // ← Limpa e reinicializa
}
```

**Por que separar por seção?**
- ✅ Cada seção é independente (fácil remover/adicionar)
- ✅ Reduz acoplamento
- ✅ Fácil testar uma seção isoladamente
- ✅ Código mais legível (home manager = tudo sobre home)

---

### 4️⃣ **core/** - Lógica de Negócio Agnóstica (FUTURO)

Atualmente vazio, será preenchido quando logic cresce e quer-se remover dependências de services/UI.

```
core/domain/          # Tipos e entidades
  ├── audio/
  │   ├── AudioState.js      # Tipo: { isRunning, isCApturing, volume }
  │   └── AudioTypes.js      # Types: AudioConfig, AudioEvent
  ├── stt/
  │   └── STTState.js        # Tipo: { currentProvider, isBusy }
  ├── llm/
  │   └── LLMState.js        # Tipo: { isRequesting, model, provider }
  └── interview/
      └── InterviewState.js  # Tipo: { currentQuestion, answered, history }

core/usecases/        # Casos de uso (lógica de domínio)
  ├── audio/
  │   ├── captureAudio.js    # UseCase: iniciar captura
  │   └── processAudio.js    # UseCase: processar chunk
  ├── stt/
  │   ├── transcribeAudio.js # UseCase: transcrever
  │   └── switchDevice.js    # UseCase: trocar dispositivo
  ├── llm/
  │   ├── askQuestion.js     # UseCase: fazer pergunta ao LLM
  │   ├── streamAnswer.js    # UseCase: receber resposta em streaming
  │   └── validateQuestion.js # UseCase: validar pergunta
  └── interview/
      ├── startInterview.js  # UseCase: iniciar entrevista
      ├── recordQuestion.js  # UseCase: registrar pergunta
      └── resetInterview.js  # UseCase: resetar estado entrevista
```

**Benefício:** Core NÃO depende de OpenAI, Deepgram, ou Electron. Pode rodar em Node.js/web puro.

---

## 🔄 Fluxo de Dados: Exemplo Completo

### Cenário: Usuário Faz uma Pergunta

```
1. 🎤 CAPTURA DE ÁUDIO (controllers/audio/audio-controller.js)
   └─ Inicia captura via Web Audio API
   └─ Registra vad-engine.js para detectar fala
   └─ Emite: eventBus.emit('audioStarted')

2. 🎙️ DETECÇÃO DE SILÊNCIO (services/stt/vad-engine.js)
   └─ Analisa frames de áudio
   └─ Detecta: "usuário parou de falar"
   └─ Emite: eventBus.emit('audioEnded')

3. 🔤 TRANSCRIÇÃO (services/stt/)
   └─ audio-controller.js chama STTStrategy.js
   └─ STTStrategy.js escolhe provider (Deepgram ou Vosk)
   └─ Provider transcrevê = "qual é meu nome?"
   └─ Emite: eventBus.emit('transcriptAvailable', { text: "qual é meu nome?" })

4. ❓ REGISTRAR PERGUNTA (controllers/sections/home/)
   └─ HomeUIManager escuta 'transcriptAvailable'
   └─ question-controller.js cria objeto pergunta
   └─ appState.interview.questionsHistory.push(question)
   └─ Renderiza na UI

5. 🚀 ENVIAR PARA LLM (controllers/sections/home/ + services/llm/)
   └─ HomeUIManager onclick "Enviar para IA"
   └─ Chama llmHandlers.js validateLLMRequest()
   └─ LLMManager.js orquestra com retry/timeout
   └─ openai-handler.js chama OpenAI API
   └─ Emite: eventBus.emit('llmStreamChunk', { token: "Seu..." })

6. 📝 EXIBIR RESPOSTA (controllers/sections/home/)
   └─ HomeUIManager escuta 'llmStreamChunk'
   └─ Renderiza tokens em tempo real
   └─ Emite: eventBus.emit('llmStreamEnd', { totalTime })

7. 💾 REGISTRAR MÉTRICA (infra/state/AppState.js)
   └─ appState.metrics.llmEndTime = Date.now()
   └─ Calcula tempo total
   └─ Pronto para próxima pergunta
```

**Separação de responsabilidades:**
- ✅ Audio é responsabilidade de `services/stt/`
- ✅ LLM é responsabilidade de `services/llm/`
- ✅ UI é responsabilidade de `controllers/sections/home/`
- ✅ EventBus conecta tudo sem acoplamento
- ✅ AppState guarda estado consistente

---

## 🧪 Testabilidade

**Unit Test** - Testar lógica pura:
```javascript
// Não depende de APIs ou Electron
const { validateLLMRequest } = require('./services/llm/llmHandlers');
const mockState = { interview: { ... } };
const result = validateLLMRequest(mockState, questionId, () => "test");
expect(result.text).toBe("test");
```

**Integration Test** - Testar integração entre layers:
```javascript
// Testa EventBus + AppState
const { testFlowAudioToTranscript } = require('./test-mocks');
await testFlowAudioToTranscript();
// Verifica: EventBus emitiu eventos corretos
// Verifica: AppState atualizou estado
```

**E2E Test** - Testar fluxo completo:
```javascript
// Testa: Electron window + UI + STT + LLM
// Simula usuário dizendo pergunta
// Verifica resposta do LLM aparece na tela
```

---

## 📊 Matriz de Dependências

```
GLOBAL (tudo depende)
├── infra/            # Bus de eventos + Estado
└── services/         # STT, LLM, Audio (adapters)

CONTROLLERS (depende de global)
├── controllers/modes/ # Modo (Normal vs Entrevista)
├── controllers/audio/ # Captura de áudio
└── controllers/sections/* # Cada seção UI

MAIN (Electron backend)
├── Depende de: IPC, Store (persitência), Logger
└── IPC para comunicar com renderer (controllers)

CORE (FUTURO - não depende de ninguém)
├── Não depende de: services, controllers, infra
├── Depende de: tipos JavaScript nativos apenas
└── Injeta dependências via função (inversion of control)
```

---

## 🛠️ Como Adicionar Novo Provider

### Exemplo: Suporte a Novo STT (ex: AssemblyAI)

**Passo 1:** Criar arquivo `services/stt/stt-assemblyai.js`
```javascript
class AssemblyAIProvider {
  constructor(apiKey) { this.apiKey = apiKey; }
  async start(elements) { /* conecta WebSocket AssemblyAI */ }
  async stop() { /* fecha WebSocket */ }
  async switchDevice(type, deviceId) { /* troca microfone */ }
}
```

**Passo 2:** Registrar em `renderer.js`
```javascript
const assemblyAI = new globalThis.AssemblyAIProvider(apiKey);
globalThis.stt.register('assemblyai', assemblyAI);
```

**Passo 3:** Selecionar na UI (AudioDeviceManager) ou via config

**Resultado:** Aplicação funciona com novo provider, nenhum código do core/controllers mudou!

### Exemplo: Suporte a Novo LLM (ex: Anthropic Claude)

**Passo 1:** Criar `services/llm/handlers/anthropic-handler.js`
```javascript
class AnthropicHandler {
  async initialize(apiKey) { this.client = new Anthropic({ apiKey }); }
  async complete(messages, config) { /* chama API */ }
  async stream(messages, config) { /* stream de tokens */ }
}
```

**Passo 2:** Registrar em `renderer.js`
```javascript
globalThis.llmManager.register('anthropic', anthropicHandler);
```

**Passo 3:** Adicionar campo API key na UI (ApiKeyManager)

**Resultado:** App suporta Claude, nada mais muda!

---

## 🎓 Princípios Aplicados

| Princípio | Implementação |
|-----------|---------------|
| **Single Responsibility** | Cada arquivo tem uma responsabilidade. `LLMManager.js` = orquestração. `openai-handler.js` = adapter OpenAI |
| **Open/Closed** | Aberto para extensão (novos providers), fechado para modificação (core não muda) |
| **Dependency Inversion** | Services registram-se em managers (injeção). UI não importa services diretamente |
| **Separation of Concerns** | Infra ≠ Services ≠ Controllers. Fácil trocar um sem quebrar outro |
| **DRY (Don't Repeat Yourself)** | EventBus é único ponto de pub/sub. AppState é único estado |
| **Layered Architecture** | Cada layer tem responsabilidade clara |

---

## 🚀 Próximas Melhorias

- [ ] Implementar `core/usecases/` quando lógica crescer
- [ ] Adicionar imutabilidade a AppState (Immer.js)
- [ ] Error boundaries em cada manager
- [ ] Testes de performance (Vitest + Benchmark)
- [ ] Type checking completo (JSDoc → TypeScript)
- [ ] Logger estruturado (Pino/Winston)

---

## 📚 Referências Rápidas

**Precisa adicionar nova feature?**
1. Feature é global ou seção-específica?
   - Global → `controllers/{modes,audio}/`
   - Seção → `controllers/sections/{nome}/`
2. Integra com API/hardware?
   - SIM → Crie em `services/`
   - NÃO → Lógica pura em controller
3. Necessita estado?
   - Centralizar em `infra/state/AppState.js`
4. Precisa comunicar com outro componente?
   - Use `infra/bus/EventBus.js`

**Precisa debugar fluxo?**
1. Procure o evento inicial em `infra/bus/EventBus.js` (grep do nome do evento)
2. Siga o EventBus para quem escuta: grep por `eventBus.on('evento')`
3. Procure em qual manager/controller
4. Trace até o fim

**Precisa entender um manager?**
1. Procure `#initListeners()` - mostra o que ele escuta
2. Procure `#initElements()` - mostra o que ele renderiza
3. Procure emits - mostra o que ele comunica

---

## 👤 Contato e Dúvidas

Dúvidas sobre arquitetura? Revise:
- Este documento (ARQUITETURA_FINAL.md)
- JSDoc comments no início de cada arquivo
- Exemplos de uso nos testes (`__tests__/`)
- Diagramas em `docs/`

**Padrão:** Quando em dúvida, assume que você quer **desacoplar** código.

---

**Versão:** 1.0  
**Data:** 27 de Janeiro de 2026  
**Status:** ✅ IMPLEMENTADO

