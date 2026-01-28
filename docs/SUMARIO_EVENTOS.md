# 📊 Sumário Executivo: Padrão de Eventos do Projeto

## 🎯 Visão Geral

O projeto usa um sistema **Pub/Sub (Publish/Subscribe)** centralizado chamado `EventBus` para comunicação entre componentes. Emissores publicam eventos e ouvintes se inscrevem para reagir.

---

## 📡 Quem Emite vs Quem Escuta

### Emissores (Publicadores)

| Categoria | Arquivo | Eventos Emitidos | Frequência |
|-----------|---------|------------------|-----------|
| **Audio** | audio-controller.js | `listenButtonToggle` | Click/Ctrl+D |
| **STT** | stt-deepgram.js, stt-vosk.js, stt-whisper.js | `transcriptAdd`, `updateInterim`, `placeholderFulfill`, `clearInterim` | Em tempo real |
| **LLM** | llmHandlers.js | `answerStream`, `answerStreamEnd`, `llmStreamEnd`, `answerBatchEnd` | Durante streaming |
| **UI** | renderer.js, renderer-helpers.js | `statusUpdate`, `windowOpacityUpdate`, `sortAnswersByTurnId`, `error` | User actions |
| **Questions** | question-controller.js | `currentQuestionUpdate`, `questionsHistoryUpdate` | Navigate/Select |
| **Config** | PrivacyConfigManager.js, ScreenConfigManager.js | `PRIVACY_CONFIG_CHANGED`, `SCREENSHOT_CONFIG_CHANGED` | Config change |
| **Volume** | volume-audio-monitor.js | `inputVolumeUpdate`, `outputVolumeUpdate` | Real-time |

### Ouvintes (Subscribers)

| Arquivo | Eventos Escutados | Ações Realizadas |
|---------|------------------|------------------|
| **HomeUIManager.js** | 8+ eventos | Atualiza DOM, renderiza histórico, texto progressivo |
| **WindowUIManager.js** | `windowOpacityUpdate` | Sincroniza opacidade |
| **renderer.js** | `audioDeviceChanged`, `llmStreamEnd`, `llmBatchEnd`, `error` | Trata eventos globais |
| **Others** | - | Listeners embutidos em DOM |

---

## 🔄 Fluxos Principais

### 1️⃣ Fluxo Áudio: Gravação → Transcrição

```
User Presses Ctrl+D
        ↓
listenToggleBtn() emits 'listenButtonToggle'
        ↓
HomeUIManager listens → Updates button state
        ↓
STT starts capturing audio
        ↓
Transcription arrives → STT emits 'transcriptAdd'
        ↓
HomeUIManager listens → Renders text in real-time
```

**Events Envolvidos**:
- `listenButtonToggle`
- `transcriptAdd`
- `updateInterim` (partial)
- `placeholderFulfill` (final)

---

### 2️⃣ Fluxo LLM: Pergunta → Resposta Streaming

```
User Clicks "Ask" or Presses Ctrl+Enter
        ↓
askLLM() validates and calls handleLLMStream()
        ↓
OpenAI streaming starts
        ↓
For each token received:
  → emit 'answerStream'
  → HomeUIManager appends to DOM
        ↓
On complete:
  → emit 'answerStreamEnd'
  → emit 'llmStreamEnd'
```

**Events Envolvidos**:
- `answerStream` (repeated)
- `answerStreamEnd`
- `llmStreamEnd`

---

### 3️⃣ Fluxo Config: User Input → Persistência → Sync

```
User Changes Setting (Slider, Checkbox)
        ↓
DOM 'change' event fires
        ↓
Manager listens → Saves to store
        ↓
Manager emits 'CONFIG_CHANGED'
        ↓
Other listeners keep UI in sync
```

**Examples**:
- `PRIVACY_CONFIG_CHANGED`
- `SCREENSHOT_CONFIG_CHANGED`
- `windowOpacityUpdate`

---

## ⚠️ Ordem de Carregamento (CRÍTICA!)

### ✅ Ordem Correta (em index.html):

```html
<!-- 1. Base -->
<script src="./events/EventBus.js"></script>
<script src="./state/AppState.js"></script>

<!-- 2. LISTENERS (Managers) - DEVEM CARREGAR ANTES -->
<script src="./controllers/config/managers/HomeUIManager.js"></script>
<script src="./controllers/config/managers/WindowUIManager.js"></script>

<!-- 3. EMITTERS (STT, LLM) -->
<script src="./stt/stt-deepgram.js"></script>
<script src="./handlers/llmHandlers.js"></script>

<!-- 4. Orchestrator -->
<script src="./renderer.js"></script>
```

### ❌ Problema Comum:

Se um `emit()` acontecer ANTES do `on()` ser registrado:
```
⚠️ Nenhum listener para: eventName
```

O evento é **perdido** e o listener não reage.

---

## 🎬 Timeline de Inicialização

```
T0: App boots
    └─ EventBus loads (infrastructure)

T1: Managers load
    └─ HomeUIManager.#init() → eventBus.on() × 10 listeners registered
    └─ WindowUIManager.#init() → eventBus.on() × 1 listener registered

T2: Providers load
    └─ stt-deepgram, stt-vosk ready to emit
    └─ llmHandlers ready to emit

T3: User interacts
    └─ Events flow smoothly because listeners are ready!
```

---

## 📋 Mapa de Eventos (COMPLETO)

### Audio & Transcription

| Evento | De | Para | Dados |
|--------|-----|------|-------|
| `listenButtonToggle` | audio-controller | HomeUIManager | `{ isRunning, buttonText }` |
| `transcriptAdd` | STT | HomeUIManager | `{ questionId, text, author }` |
| `updateInterim` | STT | HomeUIManager | `{ id, text }` |
| `placeholderFulfill` | STT | HomeUIManager | `{ id, text }` |
| `clearInterim` | STT | HomeUIManager | `{ id }` |
| `transcriptionCleared` | renderer-helpers | HomeUIManager | `{}` |

### LLM Responses

| Evento | De | Para | Dados |
|--------|-----|------|-------|
| `answerStream` | llmHandlers | HomeUIManager | `{ questionId, text, turnId }` |
| `answerStreamEnd` | llmHandlers | HomeUIManager | `{ questionId, response, turnId }` |
| `llmStreamEnd` | llmHandlers | renderer | `{}` |
| `answerBatchEnd` | llmHandlers | HomeUIManager | `{ questionId, response, turnId }` |

### UI & State

| Evento | De | Para | Dados |
|--------|-----|------|-------|
| `statusUpdate` | renderer-helpers | HomeUIManager | `{ message }` |
| `currentQuestionUpdate` | question-controller | HomeUIManager | `{ id, text }` |
| `questionsHistoryUpdate` | question-controller | HomeUIManager | `[...]` |
| `windowOpacityUpdate` | renderer | WindowUIManager | `{ opacity }` |
| `sortAnswersByTurnId` | renderer | HomeUIManager | `{}` |
| `error` | Qualquer | renderer | `message` |

### Configuration (⚠️ Sem ouvinte identificado)

| Evento | De | Para | Dados |
|--------|-----|------|-------|
| `PRIVACY_CONFIG_CHANGED` | PrivacyConfigManager | ❓ | `{ field, value }` |
| `SCREENSHOT_CONFIG_CHANGED` | ScreenConfigManager | ❓ | `{ field, value }` |
| `modeSelectUpdate` | renderer | ❓ | `{ mode }` |

---

## 🔍 Padrões Identificados

### ✅ Padrão Correto

```javascript
// 1. Registrar listener primeiro
class MyManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.#initListeners();
  }
  
  #initListeners() {
    // Listener registrado durante init
    this.eventBus.on('statusUpdate', (data) => {
      console.log('Status:', data.message);
    });
  }
}

// 2. Depois emitir evento
function updateStatus(msg) {
  eventBus.emit('statusUpdate', { message: msg });
}
```

### ❌ Padrão Problemático

```javascript
// Emitir ANTES de registrar listener
eventBus.emit('statusUpdate', { message: 'Hello' }); // ⚠️ Lost!

// Listener registrado depois (muito tarde)
eventBus.on('statusUpdate', (data) => {
  console.log('Status:', data.message); // Nunca executa
});
```

---

## 🛠️ Como Adicionar Novo Evento

### 1. Definir Nome (snake-case)
```javascript
const EVENT_NAME = 'my-feature-completed';
```

### 2. Registrar Listener ANTES (em Manager)
```javascript
class MyManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.eventBus.on('my-feature-completed', this.#handleComplete);
  }
  
  #handleComplete(data) {
    // React to event
  }
}
```

### 3. Verificar Ordem em index.html
```html
<!-- MyManager (listener) BEFORE MyController (emitter) -->
<script src="./managers/MyManager.js"></script>
<script src="./controllers/MyController.js"></script>
```

### 4. Emitir Quando Apropriado
```javascript
class MyController {
  doSomething() {
    // ... work ...
    eventBus.emit('my-feature-completed', { result: 'success' });
  }
}
```

### 5. Adicionar à Documentação
- Atualizar [EVENTO_FLOW_PATTERN.md](./EVENTO_FLOW_PATTERN.md)
- Adicionar linha na tabela de mapa de eventos

---

## 🎓 Princípios Fundamentais

### 1️⃣ **Listeners Primeiro**
Sempre registre listeners ANTES de qualquer código que possa emitir eventos.

### 2️⃣ **Nomes Únicos**
Use nomes de evento descritivos e únicos. Exemplo:
- ✅ `answerStream` (claro)
- ❌ `update` (vago)

### 3️⃣ **Dados Estruturados**
Sempre passe objetos com campos bem definidos, não valores primitivos soltos.

```javascript
// ❌ Ruim
eventBus.emit('transcriptAdd', transcriptText);

// ✅ Bom
eventBus.emit('transcriptAdd', {
  questionId: 'Q123',
  text: transcriptText,
  author: 'YOU'
});
```

### 4️⃣ **Tratamento de Erros**
Envolver callbacks em try/catch para evitar crashes.

```javascript
eventBus.on('event', (data) => {
  try {
    // Process data
  } catch (error) {
    Logger.error('Event handler error:', error);
  }
});
```

### 5️⃣ **Desacoplamento**
Componentes não devem conhecer uns dos outros. Comunicam apenas via eventos.

```javascript
// ❌ Ruim (acoplado)
homeUIManager.updateStatus('Loading');

// ✅ Bom (desacoplado)
eventBus.emit('statusUpdate', { message: 'Loading' });
// HomeUIManager escuta e reage automaticamente
```

---

## 📚 Documentação Relacionada

- [EVENTO_FLOW_PATTERN.md](./EVENTO_FLOW_PATTERN.md) - Documentação completa de eventos
- [DIAGRAMA_FLUXO_EVENTOS.md](./DIAGRAMA_FLUXO_EVENTOS.md) - Diagramas visuais
- [EventBus.js](../events/EventBus.js) - Implementação da classe

---

## 🎯 Conclusão

O sistema de eventos permite que componentes se comuniquem sem dependências diretas, resultando em:

✅ **Código limpo** - Sem acoplamento
✅ **Fácil manutenção** - Cada componente é independente  
✅ **Escalável** - Adicionar novos listeners é trivial
✅ **Testável** - Cada parte pode ser testada isoladamente

**Golden Rule**: _**Listeners BEFORE Emitters!**_
