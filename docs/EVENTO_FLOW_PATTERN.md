# 🎯 Padrão de Fluxo de Eventos - Sistema de Pub/Sub

## 📋 Resumo Executivo

O projeto utiliza um **padrão Pub/Sub (Publish/Subscribe)** centralizado via `EventBus` para desacoplar componentes e coordenar fluxos de dados.

### Princípios Fundamentais
1. **Emissor** (Emitter) → Emite evento
2. **Barramento** (EventBus) → Encaminha para listeners
3. **Ouvinte** (Listener) → Reage ao evento
4. **Garantia de Ordem**: Listeners registrados ANTES de eventos serem emitidos

---

## 🏗️ Arquitetura do EventBus

### Classe EventBus
```javascript
class EventBus {
  constructor() {
    this.events = {};  // { eventName: [callback1, callback2, ...] }
  }

  on(eventName, callback)     // Registrar listener
  emit(eventName, data)       // Emitir evento
  off(eventName, callback)    // Remover listener
  clear(eventName)            // Limpar todos listeners de um evento
}
```

**Localização**: [events/EventBus.js](../events/EventBus.js)

---

## 🔄 Tipos de Fluxo de Eventos

### 1️⃣ **Fluxo Simples: User Action → Event → DOM Update**

```
┌─────────────────────────────────────────┐
│  USER CLICKS BUTTON (DOM Event)         │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  listenToggleBtn() (renderer.js)        │
│  - Valida estado                        │
│  - Emite: 'listenButtonToggle'          │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  eventBus.emit('listenButtonToggle')    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  HomeUIManager LISTENS                  │
│  eventBus.on('listenButtonToggle')      │
│  - Atualiza botão (CSS class)           │
│  - Mostra status                        │
└─────────────────────────────────────────┘
```

**Exemplo Código**:

```javascript
// ❌ EMISSOR (renderer.js:104)
globalThis.eventBus.emit('listenButtonToggle', {
  isRunning: globalThis.appState.audio.isRunning,
  buttonText: newButtonText
});

// ✅ OUVINTE (HomeUIManager.js:399)
#initUIEventBusListeners() {
  this.eventBus.on('listenButtonToggle', ({ isRunning, buttonText }) => {
    const listenBtn = document.getElementById('listenBtn');
    if (listenBtn) {
      listenBtn.textContent = buttonText;
      listenBtn.classList.toggle('active', isRunning);
    }
  });
}
```

---

### 2️⃣ **Fluxo Medium: STT Output → Event → UI History**

```
┌──────────────────────────────────────┐
│  STT Provider (Deepgram/Vosk)        │
│  - Transcreve áudio                  │
│  - Emite: 'transcriptAdd'            │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│  eventBus.emit('transcriptAdd', {...})
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│  HomeUIManager LISTENS               │
│  - Renderiza texto no DOM            │
│  - Mostra placeholder                │
│  - Prepara para resposta do LLM      │
└──────────────────────────────────────┘
```

**Exemplo Código**:

```javascript
// ❌ EMISSOR (stt-deepgram.js)
eventBus.emit('transcriptAdd', {
  questionId: globalThis.appState.selectedId,
  text: transcript,
  author: 'YOU'
});

// ✅ OUVINTE (HomeUIManager.js:442)
this.eventBus.on('transcriptionAdd', ({ _questionId, text }) => {
  const transcriptionText = document.getElementById('transcriptionText');
  if (transcriptionText) {
    transcriptionText.textContent = text;
    transcriptionText.classList.add('visible');
  }
});
```

---

### 3️⃣ **Fluxo Complexo: LLM Stream → Multiple Events → Progressive Rendering**

```
┌────────────────────────────────────────┐
│  askLLM() (renderer.js:468)            │
│  - Valida pergunta                     │
│  - Chama: handleLLMStream()            │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  handleLLMStream() (llmHandlers.js:70) │
│  - Abre conexão OpenAI streaming       │
│  - Por cada token recebido:            │
│    emite: 'answerStream'          │
│  - Ao fim: emite 'answerStreamEnd'     │
└────────────┬───────────────────────────┘
             │
    ┌────────┴────────┬─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
┌──────────┐  ┌──────────────┐  ┌──────────────┐
│ CHUNK 1  │  │  CHUNK 2     │  │ END EVENT    │
└────┬─────┘  └────┬─────────┘  └────┬─────────┘
     │             │                 │
     ▼             ▼                 ▼
┌────────────────────────────────────────┐
│  HomeUIManager LISTENS (Multiple)      │
│  - answerStream: append text      │
│  - answerStreamEnd: finalize answer    │
│  - Renderiza token por token (smooth) │
└────────────────────────────────────────┘
```

**Exemplo Código**:

```javascript
// ❌ EMISSOR (llmHandlers.js:89)
eventBus.emit('answerStream', {
  questionId: validQuestionId,
  text: chunk.choices[0].delta.content,
  turnId: turnId
});

// 🔄 MEIO DO FLUXO (llmHandlers.js:108)
eventBus.emit('answerStreamEnd', {
  questionId: validQuestionId,
  response: fullAnswer,
  turnId: turnId
});

// ✅ OUVINTE (HomeUIManager.js:520)
this.eventBus.on('answerStream', (data) => {
  // Append token progressivamente ao texto da resposta
  const answerElement = document.querySelector(`[data-answer-id="${data.questionId}"]`);
  if (answerElement) {
    answerElement.textContent += data.text;
  }
});

// ✅ OUVINTE (HomeUIManager.js:572)
this.eventBus.on('answerStreamEnd', (_) => {
  // Finalizar e limpar estado de streaming
  console.log('✅ Resposta finalizada');
});
```

---

### 4️⃣ **Fluxo Manager: Configuration Changes → Events → UI Sync**

```
┌────────────────────────────────────────┐
│  User Changes Setting (Opacity slider) │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  renderer.js (opacityRange listener)   │
│  - Lê valor do input                   │
│  - Emite: 'windowOpacityUpdate'        │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  eventBus.emit('windowOpacityUpdate',  │
│    { opacity: 0.8 })                   │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  WindowUIManager LISTENS               │
│  - Sincroniza input com evento         │
│  - Aplica CSS opacity à janela         │
└────────────────────────────────────────┘
```

**Exemplo Código**:

```javascript
// ❌ EMISSOR (renderer.js:645)
globalThis.eventBus.emit('windowOpacityUpdate', {
  opacity: Math.max(0, Math.min(1, opacity))
});

// ✅ OUVINTE (WindowUIManager.js:318)
globalThis.eventBus.on('windowOpacityUpdate', (data) => {
  const opacityRange = document.getElementById('opacityRange');
  if (opacityRange) {
    // Sincronizar o valor do input com o valor enviado pelo evento
    opacityRange.value = data.opacity;
  }
});
```

---

## 📡 Mapa de Eventos (Quem Emite → Quem Escuta)

### Audio Events

| Evento | Emissor | Ouvinte(s) | Dados |
|--------|---------|-----------|-------|
| **listenButtonToggle** | audio-controller.js:104 | HomeUIManager.js:399 | `{ isRunning, buttonText }` |
| **inputVolumeUpdate** | volume-audio-monitor.js | HomeUIManager | `{ percent }` |
| **outputVolumeUpdate** | volume-audio-monitor.js | HomeUIManager | `{ percent }` |
| **audioDeviceChanged** | config-manager | renderer.js:292 | `{ type, deviceId }` |

### Transcription Events

| Evento | Emissor | Ouvinte(s) | Dados |
|--------|---------|-----------|-------|
| **transcriptAdd** | stt-deepgram/vosk/whisper | HomeUIManager.js:442 | `{ questionId, text, author }` |
| **placeholderFulfill** | STT providers | HomeUIManager | `{ id, text }` |
| **clearInterim** | STT providers | HomeUIManager | `{ id }` |
| **updateInterim** | STT providers | HomeUIManager | `{ id, text }` |
| **transcriptionCleared** | renderer-helpers.js:131 | HomeUIManager.js:456 | `{}` |

### LLM Response Events

| Evento | Emissor | Ouvinte(s) | Dados |
|--------|---------|-----------|-------|
| **answerStream** | llmHandlers.js:89 | HomeUIManager.js:520 | `{ questionId, text, turnId }` |
| **answerStreamEnd** | llmHandlers.js:108 | HomeUIManager.js:572 | `{ questionId, response, turnId }` |
| **answerBatchEnd** | llmHandlers.js (batch mode) | HomeUIManager | `{ questionId, response, turnId }` |
| **llmStreamEnd** | llmHandlers.js:108 | renderer.js:97 | `{}` |
| **llmBatchEnd** | llmHandlers.js:152 | renderer.js:114 | `{}` |

### UI Events

| Evento | Emissor | Ouvinte(s) | Dados |
|--------|---------|-----------|-------|
| **statusUpdate** | renderer-helpers.js:21 | HomeUIManager.js:430 | `{ message }` |
| **screenshotBadgeUpdate** | renderer-helpers.js:102 | HomeUIManager | `{ visible }` |
| **currentQuestionUpdate** | renderer-helpers.js:122 | HomeUIManager.js:480 | `{ id, text }` |
| **questionsHistoryUpdate** | renderer-helpers.js:126 | HomeUIManager.js:498 | `[...]` |
| **sortAnswersByTurnId** | renderer.js:325 | HomeUIManager.js:587 | `{}` |
| **windowOpacityUpdate** | renderer.js:645 | WindowUIManager.js:318 | `{ opacity }` |
| **modeSelectUpdate** | renderer.js:619 | ??? | `{ mode }` |

### Config Events

| Evento | Emissor | Ouvinte(s) | Dados |
|--------|---------|-----------|-------|
| **PRIVACY_CONFIG_CHANGED** | PrivacyConfigManager.js:135 | ??? | `{ field, value }` |
| **SCREENSHOT_CONFIG_CHANGED** | ScreenConfigManager.js | ??? | `{ field, value }` |

### Error Events

| Evento | Emissor | Ouvinte(s) | Dados |
|--------|---------|-----------|-------|
| **error** | Múltiplos | renderer.js:138 | `error.message` |

---

## 🎯 Padrão de Inicialização: Listeners ANTES de Events

### ⚠️ PROBLEMA COMUM: Evento emitido antes do listener ser registrado

```
Timeline:
─────────────────────────────────────────────────
T0: renderer.js carrega
T1: eventBus.emit('windowOpacityUpdate') ← ❌ Sem listener ainda!
T2: WindowUIManager carrega
T3: eventBus.on('windowOpacityUpdate') ← Muito tarde!
─────────────────────────────────────────────────
```

**Evidência nos logs do projeto**:
```
⚠️ Nenhum listener para: windowOpacityUpdate
emit @ EventBus.js:57
EventBus.js:35 📡 Listener registrado: windowOpacityUpdate
```

### ✅ SOLUÇÃO: Ordem de Carregamento em index.html

```html
<!-- 1️⃣ EventBus deve vir ANTES de qualquer um que emita -->
<script src="./events/EventBus.js"></script>

<!-- 2️⃣ Managers de config que OUVEM eventos -->
<script src="./controllers/config/managers/WindowUIManager.js"></script>
<script src="./controllers/config/managers/HomeUIManager.js"></script>

<!-- 3️⃣ Controllers que EMITEM eventos -->
<script src="./controllers/audio/audio-controller.js"></script>
<script src="./stt/stt-deepgram.js"></script>

<!-- 4️⃣ Renderer que faz ambos (emit e on) -->
<script src="./renderer.js"></script>
```

**Ordem Correta**:
1. **EventBus** (base)
2. **Listeners** (ouvintes)
3. **Emissores** (quem emite)
4. **Orquestrador** (renderer.js)

---

## 🔗 Exemplo End-to-End: Pergunta → Resposta

### Cenário: Usuário clica em pergunta e quer resposta do LLM

```
1. USER CLICKS QUESTION
   ↓
2. handleQuestionClick() [question-controller.js]
   ├─ Valida pergunta
   └─ Emite: 'currentQuestionUpdate'
   ↓
3. HomeUIManager LISTENS 'currentQuestionUpdate'
   ├─ Renderiza pergunta na tela
   └─ Ativa botão askLLM
   ↓
4. USER CLICKS "Ask LLM" or Ctrl+Enter
   ↓
5. askLLM() [renderer.js:468]
   ├─ Valida pergunta
   ├─ Roteia por modo (INTERVIEW vs NORMAL)
   └─ Chama handleLLMStream() ou handleLLMBatch()
   ↓
6. handleLLMStream() [llmHandlers.js:70]
   ├─ Abre conexão OpenAI com streaming
   └─ Por cada token:
       ├─ Emite: 'answerStream'
       └─ HomeUIManager escuta e renderiza token
   ↓
7. Token streaming finalizado
   ├─ Emite: 'answerStreamEnd'
   └─ HomeUIManager completa renderização
   ↓
8. ✅ RESPOSTA VISÍVEL NO HISTÓRICO
```

---

## 📊 Padrões de Dados

### 1. Eventos Simples (sem dados)
```javascript
// Emissor
eventBus.emit('transcriptionCleared');

// Ouvinte
eventBus.on('transcriptionCleared', () => {
  // Limpar UI
});
```

### 2. Eventos com Um Campo
```javascript
// Emissor
eventBus.emit('statusUpdate', { message: 'Escutando...' });

// Ouvinte
eventBus.on('statusUpdate', ({ message }) => {
  document.getElementById('status').textContent = message;
});
```

### 3. Eventos com Múltiplos Campos
```javascript
// Emissor
eventBus.emit('answerStream', {
  questionId: '12345',
  text: 'Java é...',
  turnId: 1,
  timestamp: Date.now()
});

// Ouvinte
eventBus.on('answerStream', ({ questionId, text, turnId }) => {
  // Usar os campos
});
```

---

## 🚨 Anti-Patterns a Evitar

### ❌ Emit sem Listener Registrado
```javascript
// PROBLEMA: Evento perdido se listener não existir
eventBus.emit('unknownEvent', { data });
// Resultado: ⚠️ Nenhum listener para: unknownEvent
```

**Solução**: Garantir que `eventBus.on()` é chamado ANTES de qualquer `eventBus.emit()`.

### ❌ Lógica Síncrona em Callback de Evento
```javascript
// PROBLEMA: Bloqueia outros listeners
eventBus.on('heavyEvent', () => {
  for (let i = 0; i < 1000000; i++) {
    // ... processamento pesado
  }
});
```

**Solução**: Usar `async/await` ou `setTimeout` para operações pesadas.

### ❌ Múltiplas Registrações (Memory Leak)
```javascript
// PROBLEMA: Cada vez que função é chamada, registra novo listener
function init() {
  eventBus.on('event', callback); // ← Chamada 10x = 10 listeners!
}
```

**Solução**: Registrar uma vez no setup, não em funções chamadas repetidamente.

### ❌ Referências Circulares de Eventos
```javascript
// PROBLEMA: A emite B, B emite A → loop infinito
eventBus.on('eventA', () => {
  eventBus.emit('eventB');
});
eventBus.on('eventB', () => {
  eventBus.emit('eventA'); // ← LOOP!
});
```

**Solução**: Desenhar fluxo de eventos antes de implementar.

---

## 📋 Checklist: Adicionando Novo Evento

Ao adicionar um novo evento ao sistema, seguir:

- [ ] **Definir nome do evento** (snake-case, descritivo)
  ```javascript
  const EVENT = 'question-answered';
  ```

- [ ] **Registrar listener ANTES de emitir**
  ```javascript
  // Listener primeiro
  eventBus.on('question-answered', handler);
  // Depois emit
  eventBus.emit('question-answered', data);
  ```

- [ ] **Documentar em EVENTO_FLOW_PATTERN.md** (este arquivo)
  - Adicionar linha na tabela de mapa de eventos
  - Indicar emissor, ouvinte(s), e estrutura de dados

- [ ] **Validar ordem de carregamento** em `index.html`
  - Listener deve carregar ANTES do emissor
  - EventBus deve ser primeiro

- [ ] **Adicionar logs descritivos**
  ```javascript
  // Emissor
  console.log(`📤 Emitindo: ${eventName}`, data);
  
  // Ouvinte
  console.log(`📥 Recebido: ${eventName}`, data);
  ```

- [ ] **Testar edge cases**
  - Dados nulos/undefined
  - Múltiplos listeners para o mesmo evento
  - Ordem de chamadas

---

## 🔍 Debugging de Eventos

### Ver todos os eventos registrados
```javascript
// No DevTools Console
globalThis.eventBus.events
// Output: { eventName1: [cb1, cb2], eventName2: [cb3], ... }
```

### Adicionar listener temporário para debug
```javascript
// Spy em todos os eventos
const originalEmit = globalThis.eventBus.emit;
globalThis.eventBus.emit = function(name, data) {
  console.log(`🔍 EMIT: ${name}`, data);
  return originalEmit.call(this, name, data);
};
```

### Logs já existentes no código
```javascript
// EventBus.js (linhas 35 e 57)
console.log(`📡 Listener registrado: ${eventName}`);
console.warn(`⚠️ Nenhum listener para: ${eventName}`);
```

---

## 📚 Referências

- **EventBus**: [events/EventBus.js](../events/EventBus.js)
- **Emissores principais**:
  - [renderer.js](../renderer.js) - UI e orquestração
  - [controllers/audio/audio-controller.js](../controllers/audio/audio-controller.js) - Áudio
  - [stt/stt-*.js](../stt/) - Transcrição
  - [handlers/llmHandlers.js](../handlers/llmHandlers.js) - Respostas

- **Ouvintes principais**:
  - [controllers/config/managers/HomeUIManager.js](../controllers/config/managers/HomeUIManager.js)
  - [controllers/config/managers/WindowUIManager.js](../controllers/config/managers/WindowUIManager.js)

---

## 🎓 Conclusão

O sistema de eventos permite:
✅ **Desacoplamento**: Componentes não sabem um do outro
✅ **Escalabilidade**: Fácil adicionar novos listeners
✅ **Rastreabilidade**: Fluxos de dados claros
✅ **Testabilidade**: Cada componente pode ser testado isoladamente

**Regra de Ouro**: **Listeners registrados ANTES de eventos emitidos!**
