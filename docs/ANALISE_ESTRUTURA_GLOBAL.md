# 📊 Análise da Estrutura Global do Projeto

## Visão Atual (Desorganizada)

```
root/
├── audio/                 ← Audio captura & processamento
│   ├── volume-audio-monitor.js
│   ├── volume-audio-worklet-processor.js
│   └── samples/
├── events/                ← Pub/Sub system
│   └── EventBus.js
├── handlers/              ← Domain-specific handlers
│   ├── llmHandlers.js    (✗ deveria estar em llm/)
│   └── (vazio mais)
├── llm/                   ← LLM orquestração
│   ├── LLMManager.js     (orquestrador)
│   └── handlers/         (openai, gemini, anthropic)
│       ├── openai-handler.js
│       ├── gemini-handler.js
│       └── template-handler.js
├── state/                 ← Estado global
│   └── AppState.js
├── strategies/            ← Strategy pattern para STT
│   └── STTStrategy.js
└── stt/                   ← Speech-to-Text implementations
    ├── vad-engine.js     (Voice Activity Detection)
    ├── stt-deepgram.js
    ├── stt-vosk.js
    ├── stt-whisper.js
    ├── stt-audio-worklet-processor.js
    ├── server-vosk.py
    └── models-stt/
```

---

## 🎯 Problemas Identificados

| Problema | Descrição | Impacto |
|----------|-----------|--------|
| **Dispersão de responsabilidades** | Arquivos soltos em diferentes pastas sem clara lógica | Difícil navegar e entender fluxos |
| **Handlers em lugar errado** | `llmHandlers.js` em `handlers/` mas é específico de LLM | Confundimento conceitual |
| **Mix de níveis de abstração** | Strategies, orquestradores, handlers, engines tudo misturado | Violação de padrões |
| **Falta de separação Core vs Adapters** | Não segue pattern hexagonal claramente | Não escalável |
| **Audio desorganizado** | Monitores, processadores, samples tudo junto | Difícil encontrar coisas |

---

## 📐 Padrão Hexagonal (Ports & Adapters)

Para quem vem de Java, o padrão é:

```
core/                          ← Lógica de negócio (agnóstica)
  ├── domain/
  │   ├── Audio (entidade)
  │   ├── STT (entidade)
  │   └── LLM (entidade)
  │
  └── usecases/               ← Casos de uso
      ├── CaptureAudio
      ├── TranscribeAudio
      └── AskLLM

adapters/                      ← Implementações concretas
  ├── in/                      ← Entrada (portas de entrada)
  │   ├── controllers/
  │   └── handlers/
  │
  └── out/                     ← Saída (portas de saída)
      ├── repositories/       ← Persistência
      ├── services/           ← Integrações externas (APIs)
      └── devices/            ← Hardware (microfone, etc)

infra/                         ← Infraestrutura
  ├── bus/
  ├── logger/
  └── config/
```

---

## ✅ Proposta de Reorganização

### Nova Estrutura (Hexagonal + Organização Semântica)

```
root/
├── core/                      ← Lógica de negócio (agnóstica a frameworks)
│   ├── domain/                ← Entidades e tipos
│   │   ├── audio/
│   │   │   ├── AudioState.js
│   │   │   └── AudioTypes.js
│   │   ├── stt/
│   │   │   ├── STTState.js
│   │   │   └── STTTypes.js
│   │   ├── llm/
│   │   │   ├── LLMState.js
│   │   │   └── LLMTypes.js
│   │   └── interview/
│   │       ├── InterviewState.js
│   │       └── InterviewTypes.js
│   │
│   └── usecases/              ← Casos de uso (orquestradores)
│       ├── audio/
│       │   ├── captureAudio.js
│       │   └── processAudio.js
│       ├── stt/
│       │   ├── transcribeAudio.js
│       │   └── switchSTTDevice.js
│       ├── llm/
│       │   ├── askQuestion.js
│       │   ├── streamAnswer.js
│       │   └── validateQuestion.js
│       └── interview/
│           ├── startInterview.js
│           ├── recordQuestion.js
│           └── resetInterview.js
│
├── adapters/                  ← Implementações concretas
│   ├── in/                    ← Entradas (Controllers, Handlers)
│   │   ├── handlers/
│   │   │   ├── llm-handler.js
│   │   │   ├── audio-handler.js
│   │   │   └── interview-handler.js
│   │   └── ipc/
│   │       └── (já mapeado em main.js)
│   │
│   └── out/                   ← Saídas (Integrações externas)
│       ├── stt/               ← STT implementations (Deepgram, Vosk, Whisper)
│       │   ├── STTStrategy.js (orquestrador de estratégias)
│       │   ├── stt-deepgram.js
│       │   ├── stt-vosk.js
│       │   ├── stt-whisper.js
│       │   └── vad-engine.js (detector de fala)
│       │
│       ├── llm/               ← LLM implementations (OpenAI, Gemini, Anthropic)
│       │   ├── LLMManager.js  (orquestrador)
│       │   └── handlers/
│       │       ├── openai-handler.js
│       │       ├── gemini-handler.js
│       │       └── template-handler.js
│       │
│       ├── audio/             ← Audio captura & processamento
│       │   ├── AudioMonitor.js
│       │   ├── audio-worklet-processor.js
│       │   └── samples/
│       │
│       └── devices/           ← Hardware
│           └── (futuro: camera, display, etc)
│
├── infra/                     ← Infraestrutura
│   ├── bus/
│   │   └── EventBus.js
│   ├── state/
│   │   └── AppState.js        (antes: state/AppState.js)
│   └── logger/
│       └── (já organizado em utils/)
│
├── controllers/               ← UI Controllers (já organizado)
│   ├── modes/
│   ├── audio/
│   └── sections/
│
├── utils/                     ← Utilitários
├── types/
├── docs/
├── __tests__/
└── scripts/
```

---

## 📋 Benefícios da Nova Estrutura

### 1. **Clareza de Responsabilidades**
```
core/domain/     → O QUÊ (tipos, estruturas de dados)
core/usecases/   → COMO (lógica de negócio)
adapters/out/    → COM QUEM (integrações externas: OpenAI, Deepgram, etc)
adapters/in/     → QUEM chama (handlers, controllers)
infra/           → SUPORTA (bus de eventos, logger, estado)
```

### 2. **Escalabilidade**
- Adicionar novo STT provider? → Crie `stt-novo-provider.js` em `adapters/out/stt/`
- Adicionar novo LLM provider? → Crie handler em `adapters/out/llm/handlers/`
- Novo caso de uso? → Crie em `core/usecases/`

### 3. **Testabilidade**
```javascript
// Core (sem dependências externas)
const { askQuestion } = require('./core/usecases/llm/askQuestion');
const { mockLLMAdapter } = require('./test-mocks');

// Testa lógica pura
const result = await askQuestion(messages, mockLLMAdapter);

// Adapters (testam integração com APIs reais)
const { openaiHandler } = require('./adapters/out/llm/handlers/openai-handler');
const response = await openaiHandler.complete(messages);
```

### 4. **Segurança**
- Core NÃO vê adapters (agnóstico)
- Adapters podem injetar dependências
- Trocar provider = trocar adapter, core não muda

---

## 🔄 Mapeamento de Arquivos (O que vai para onde)

| Arquivo Atual | Novo Local | Motivo |
|---------------|-----------|--------|
| `state/AppState.js` | `infra/state/AppState.js` | Infraestrutura (persistência de estado) |
| `events/EventBus.js` | `infra/bus/EventBus.js` | Infraestrutura (pub/sub) |
| `handlers/llmHandlers.js` | `adapters/in/handlers/llm-handler.js` | Handler de entrada para LLM |
| `llm/LLMManager.js` | `adapters/out/llm/LLMManager.js` | Orquestrador de saída (chama APIs) |
| `llm/handlers/*` | `adapters/out/llm/handlers/*` | Implementações de providers LLM |
| `strategies/STTStrategy.js` | `adapters/out/stt/STTStrategy.js` | Orquestrador de saída (chama APIs) |
| `stt/*.js` | `adapters/out/stt/*.js` | Implementações de providers STT |
| `audio/*.js` | `adapters/out/audio/*.js` | Captura de áudio (output) |

---

## 🎬 Fluxo Exemplo: "Usuário faz uma pergunta"

```
1️⃣  UI (controllers/sections/home/) 
    → Emite evento: 'ask-llm'

2️⃣  Entrada (adapters/in/handlers/llm-handler.js)
    → Valida a pergunta
    → Chama caso de uso

3️⃣  Caso de Uso (core/usecases/llm/askQuestion.js)
    → Valida regras de negócio
    → Chama adaptador LLM

4️⃣  Saída (adapters/out/llm/LLMManager.js)
    → Orquestra provider (OpenAI, Gemini, etc)
    → Chamada HTTP → API

5️⃣  Resposta volta
    → AppState atualiza
    → EventBus emite evento
    → UI (controllers/) renderiza

✅ Core NÃO sabe que usa OpenAI (agnóstico)
✅ Trocar OpenAI por Gemini = só trocar adapter
```

---

## 🚀 Fases de Implementação

### Fase 1: Criar Estrutura (1h)
```bash
# Criar diretórios
mkdir -p core/domain/{audio,stt,llm,interview}
mkdir -p core/usecases/{audio,stt,llm,interview}
mkdir -p adapters/in/handlers
mkdir -p adapters/out/{stt,llm,audio,devices}
mkdir -p adapters/out/llm/handlers
mkdir -p infra/{bus,state}
```

### Fase 2: Mover Arquivos (30min)
```bash
# Mover para infra
mv state/AppState.js infra/state/
mv events/EventBus.js infra/bus/

# Mover para adapters/out
mv stt/* adapters/out/stt/
mv llm/* adapters/out/llm/
mv audio/* adapters/out/audio/
mv strategies/* adapters/out/stt/

# Mover handlers para entrada
mv handlers/llmHandlers.js adapters/in/handlers/llm-handler.js
```

### Fase 3: Atualizar Imports (1-2h)
- Atualizar `index.html` com novos paths
- Atualizar `require()` em todos os arquivos
- Atualizar `ConfigManager.js`

### Fase 4: Criar Core (3-4h)
- Extrair tipos para `core/domain/`
- Extrair casos de uso para `core/usecases/`
- Remover dependências de adapters no core

### Fase 5: Testes (1h)
```bash
npm install
npm start
# Validar que tudo funciona
```

---

## ❓ Próximas Decisões

### 1. **Usar ou não padrão Hexagonal?**
   - ✅ **SIM** - Você vem de Java, é padrão consagrado
   - ✅ Seu projeto já tem "cheiro hexagonal"
   - ✅ Facilita testes e troca de providers

### 2. **Controllers soltos vs. em sections/?**
   - Atual: `controllers/sections/*` (por UI)
   - **Sugestão**: Manter assim! 
   - Padrão Hexagonal coloca controllers em `adapters/in/`
   - Mas seu `adapters/in/` ficaria muito pesado
   - **Decisão**: Controllers em `controllers/sections/` + handlers em `adapters/in/handlers/`

### 3. **Criar core/usecases/interview/?**
   - SIM, pois entrevista é caso de uso principal
   - Será orquestrador de STT + LLM

### 4. **Manter audio em adapters/out/ ou criar device/?**
   - **Opção A**: `adapters/out/audio/` (mais simples)
   - **Opção B**: `adapters/out/devices/` (mais escalável para futuro: camera, etc)
   - **Recomendação**: Opção A agora, refatorar para B depois

---

## 📝 Checklist para Decisão

- [ ] Você quer implementar padrão Hexagonal completo?
- [ ] Quer mover tudo de uma vez ou em fases?
- [ ] Quer criar `core/usecases/` logo ou depois?
- [ ] Quer criar pasta `adapters/in/` ou handlers soltos em controllers?

**Responda e eu executo a reorganização! 🚀**
