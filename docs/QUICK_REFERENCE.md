# ⚡ Quick Reference: Sistema de Eventos em Uma Página

## 🎯 TL;DR (Too Long; Didn't Read)

```
🔹 EventBus = Barramento de eventos (Pub/Sub)
🔹 Listeners ANTES de Emitters (ordem em index.html IMPORTA!)
🔹 Componentes se comunicam via eventos, não referências diretas
🔹 Cada evento tem nome único, dados estruturados, múltiplos listeners
```

---

## 📊 Cheat Sheet: Quem Emite O Quê

```javascript
// ÁUDIO - Clique no botão "Escutar"
audio-controller.js → emit('listenButtonToggle')

// TRANSCRIÇÃO - STT recebe texto
stt-deepgram/vosk/whisper → emit('transcriptAdd')

// LLM - Resposta chega token por token
llmHandlers.js → emit('answerStream')
                emit('answerStreamEnd')

// CONFIGURAÇÃO - User muda slider
renderer.js → emit('windowOpacityUpdate')

// ERRO - Qualquer coisa quebra
any-component.js → emit('error')
```

---

## 🎧 Fluxo Audio: 4 Passos

```
┌─────────────────────────────────────────┐
│ 1. USER PRESSES Ctrl+D                  │
│    ↓ emit('listenButtonToggle')        │
│    HomeUIManager updates button         │
│                                         │
│ 2. STT RECEIVES TEXT                    │
│    ↓ emit('transcriptAdd')             │
│    HomeUIManager renders text           │
│                                         │
│ 3. USER PRESSES Ctrl+Enter              │
│    ↓ askLLM() → handleLLMStream()      │
│    LLM API streaming starts             │
│                                         │
│ 4. TOKENS ARRIVE                        │
│    ↓ emit('answerStream')         │
│    HomeUIManager appends to DOM         │
│                                         │
│ 5. DONE                                 │
│    ↓ emit('answerStreamEnd')           │
│    Response complete ✅                │
└─────────────────────────────────────────┘
```

---

## 🔌 Síntaxe Básica

```javascript
// REGISTRAR LISTENER
eventBus.on('event-name', (data) => {
  console.log('Event received:', data);
});

// EMITIR EVENTO
eventBus.emit('event-name', { 
  field1: 'value1',
  field2: 'value2'
});

// REMOVER LISTENER
eventBus.off('event-name', callback);

// LIMPAR TODOS LISTENERS DE UM EVENTO
eventBus.clear('event-name');
```

---

## ✅ Checklist: Listener Setup

```javascript
class MyManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.#initListeners();  // ← SEMPRE CHAMAR NO CONSTRUCTOR
  }

  #initListeners() {
    // 1. Registra listeners AQUI
    this.eventBus.on('my-event', (data) => {
      console.log('Received:', data);
    });
    
    // 2. Listeners estão prontos ANTES de qualquer emit
  }
}
```

---

## ⚠️ Ordem em index.html (CRÍTICA!)

```html
<!-- ERRADO ❌ -->
<script src="./emitter.js"></script>  ← Emite PRIMEIRO!
<script src="./listener.js"></script> ← Listener tarde demais!

<!-- CORRETO ✅ -->
<script src="./listener.js"></script> ← Listener REGISTRADO
<script src="./emitter.js"></script>  ← Depois emite (listener ready!)
```

---

## 📋 Mapa Rápido de Eventos

| Evento | Emissor | Listener | Dados |
|--------|---------|----------|-------|
| `listenButtonToggle` | audio-ctrl | HomeUI | `{isRunning, buttonText}` |
| `transcriptAdd` | STT | HomeUI | `{questionId, text, author}` |
| `answerStream` | llmHandlers | HomeUI | `{questionId, text, turnId}` |
| `answerStreamEnd` | llmHandlers | HomeUI | `{questionId, response, turnId}` |
| `statusUpdate` | helpers | HomeUI | `{message}` |
| `error` | ANY | renderer | `message` |

---

## 🔍 Debugging

```javascript
// Ver todos eventos registrados
globalThis.eventBus.events

// Testar evento manualmente
globalThis.eventBus.emit('transcriptAdd', {
  questionId: 'Q1',
  text: 'Test text',
  author: 'YOU'
});

// Registrar listener temporário
globalThis.eventBus.on('transcriptAdd', (data) => {
  console.log('RECEIVED:', data);
});
```

---

## 🆘 Problemas Comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| `⚠️ Nenhum listener para: X` | Listener não registrado | Verificar index.html ordem |
| Evento dispara mas UI não muda | DOM element não existe | Verificar seletor CSS |
| Listener não executa | Listener registrado depois | Mover `<script>` para ANTES do emitter |
| Memory leak | Listeners não removidos | Usar `eventBus.off()` no cleanup |

---

## 🎬 Exemplo End-to-End

```javascript
// ============================================
// 1. DEFINIR LISTENER (em Manager)
// ============================================
class MyManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    
    // LISTENER REGISTRADO AQUI
    this.eventBus.on('my-action', (data) => {
      console.log('Action received:', data.message);
    });
  }
}

// ============================================
// 2. EMITIR EVENTO (em Controller)
// ============================================
class MyController {
  doSomething() {
    // ... work ...
    
    // EMIT (listener já estava listening!)
    eventBus.emit('my-action', {
      message: 'Done!',
      timestamp: Date.now()
    });
  }
}

// ============================================
// 3. ORDER EM index.html
// ============================================
// <script src="./managers/MyManager.js"></script>  ← Listener first!
// <script src="./controllers/MyController.js"></script> ← Emitter second!

// ============================================
// 4. RESULTADO
// ============================================
// Console output: "Action received: Done!"
```

---

## 🎯 Padrão Recomendado

```javascript
// ✅ BOM
eventBus.on('event', (data) => {
  try {
    const el = document.getElementById('status');
    if (el) el.textContent = data.message;
  } catch (error) {
    console.error('Handler error:', error);
  }
});

// ❌ RUIM
eventBus.on('event', (data) => {
  document.getElementById('status').textContent = data.message;
  // Pode crashear se elemento não existir!
});
```

---

## 📚 Documentos Detalhados

Para informações completas, veja:

- **[SUMARIO_EVENTOS.md](./SUMARIO_EVENTOS.md)** - Visão geral (5 min)
- **[EVENTO_FLOW_PATTERN.md](./EVENTO_FLOW_PATTERN.md)** - Referência técnica (20 min)
- **[DIAGRAMA_FLUXO_EVENTOS.md](./DIAGRAMA_FLUXO_EVENTOS.md)** - Diagramas visuais (15 min)
- **[CENARIOS_EVENTOS.md](./CENARIOS_EVENTOS.md)** - Exemplos práticos (25 min)
- **[GUIA_EVENTOS_README.md](./GUIA_EVENTOS_README.md)** - Índice completo

---

## 🚀 Quick Start: Adicionar Novo Evento

```javascript
// 1. LISTENER (Manager)
class MyManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.eventBus.on('novo-evento', (data) => {
      console.log('Novo evento:', data);
    });
  }
}

// 2. EMITTER (Controller)
eventBus.emit('novo-evento', { info: 'dados' });

// 3. index.html ORDER
// <script src="./MyManager.js"></script>    ← Listener FIRST
// <script src="./MyController.js"></script> ← Emitter SECOND

// 4. Done! ✅
```

---

## 💡 Key Rules

```
1️⃣  Listeners BEFORE Emitters
2️⃣  Event names are UNIQUE and CASE-SENSITIVE
3️⃣  Data is OBJECTS, not primitives
4️⃣  Multiple listeners can react to same event
5️⃣  Error handlers are ESSENTIAL
6️⃣  Keep handlers SMALL and FOCUSED
```

---

## 📞 If Something Breaks

```javascript
// Step 1: Check if listener is registered
console.log(globalThis.eventBus.events);

// Step 2: Check load order in index.html
// Is listener <script> BEFORE emitter <script>?

// Step 3: Check event name (case-sensitive!)
// 'transcriptAdd' ≠ 'transcriptadded'

// Step 4: Test manually in console
globalThis.eventBus.emit('event-name', { test: true });

// Step 5: Verify DOM element exists
document.getElementById('element-id'); // Should NOT be null
```

---

⏱️ **Last Updated**: 26 Jan 2026 | **Status**: ✅ Ready to Use
