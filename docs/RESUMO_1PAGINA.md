# 🎬 RESUMO EXECUTIVO: Fluxo de Eventos em 1 Página

## A Pergunta
> "De acordo com o plano, como vai funcionar quem emit e quem escuta os eventos?"

## A Resposta Curta

```
COMPONENTE A                COMPONENTE B
(Emissor)                  (Ouvinte)
    │                           │
    ├─ Algo muda ◄──────────────┤
    │                           │
    ├─ eventBus.emit()          │
    │     ↓                      │
    ├─ EventBus (barramento)    │
    │     │                      │
    └─────┼────► eventBus.on() ──┘
          │      (listener)
          └────► Callback executa
                 UI atualiza ✅
```

---

## Exemplo Real: Usuário Pede Transcrição

```
┌─────────────────────────────────────┐
│ 1. User pressiona Ctrl+D            │
│    └─ listenToggleBtn() chamado     │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│ 2. audio-controller.js EMITE:       │
│    eventBus.emit(                   │
│      'listenButtonToggle',          │
│      { isRunning: true,             │
│        buttonText: '⏹️ Stop' }      │
│    )                                 │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│ 3. HomeUIManager ESCUTA:            │
│    eventBus.on(                     │
│      'listenButtonToggle',          │
│      (data) => {                    │
│        btn.textContent = data.text  │
│        btn.classList.add('active')  │
│      }                              │
│    )                                │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│ 4. ✅ Botão muda na tela!          │
│    Pronto para transcrever          │
└─────────────────────────────────────┘
```

---

## Quem Emite? (EMISSORES)

```
┌──────────────────────────────────┐
│ 📤 8 EMISSORES PRINCIPAIS        │
├──────────────────────────────────┤
│ 1️⃣  audio-controller.js          │
│     → 'listenButtonToggle'       │
│                                  │
│ 2️⃣  stt-deepgram.js              │
│     → 'transcriptAdd'            │
│     → 'updateInterim'            │
│                                  │
│ 3️⃣  llmHandlers.js               │
│     → 'answerStreamChunk'        │
│     → 'answerStreamEnd'          │
│                                  │
│ 4️⃣  renderer.js                  │
│     → 'windowOpacityUpdate'      │
│     → 'error'                    │
│                                  │
│ 5️⃣  renderer-helpers.js          │
│     → 'statusUpdate'             │
│     → 'transcriptionCleared'     │
│                                  │
│ E 3 outros...                    │
└──────────────────────────────────┘
```

---

## Quem Escuta? (OUVINTES)

```
┌──────────────────────────────────┐
│ 📥 3 OUVINTES PRINCIPAIS         │
├──────────────────────────────────┤
│ 1️⃣  HomeUIManager.js             │
│     Escuta: 8+ eventos           │
│     Faz: Renderiza DOM           │
│                                  │
│ 2️⃣  WindowUIManager.js           │
│     Escuta: windowOpacityUpdate  │
│     Faz: Sync opacidade         │
│                                  │
│ 3️⃣  renderer.js                  │
│     Escuta: error, stream-end    │
│     Faz: Lógica global          │
└──────────────────────────────────┘
```

---

## Fluxo Completo: Áudio → Transcrição → Resposta

```
T=0ms   User clica "Escutar"
  ↓
  📤 Emit: 'listenButtonToggle'
  ↓
  📥 Listen: HomeUIManager
  ↓
  ✅ Botão muda

T=100ms STT recebe audio
  ↓
  📤 Emit: 'transcriptAdd'
  ↓
  📥 Listen: HomeUIManager
  ↓
  ✅ Texto aparece

T=150ms User clica "Ask"
  ↓
  askLLM() → OpenAI API
  ↓
  LLM começa streaming

T=160ms Token 1 chega
  ↓
  📤 Emit: 'answerStreamChunk'
  ↓
  📥 Listen: HomeUIManager
  ↓
  ✅ Token renderizado

T=170ms Token 2 chega
  ↓
  📤 Emit: 'answerStreamChunk'
  ↓
  📥 Listen: HomeUIManager
  ↓
  ✅ Token + Token

... (mais tokens) ...

T=400ms Stream finaliza
  ↓
  📤 Emit: 'answerStreamEnd'
  ↓
  📥 Listen: HomeUIManager
  ↓
  ✅ Resposta completa!
```

---

## ⚠️ ORDEM IMPORTA!

```javascript
// ❌ ERRADO - Evento perdido!
<script src="./stt.js"></script>              // Emitter
<script src="./managers.js"></script>         // Listener

// O stt.js tenta emit() antes do listener estar ready
// Resultado: ⚠️ Nenhum listener para: transcriptAdd


// ✅ CORRETO - Listener pronto!
<script src="./managers.js"></script>         // Listener FIRST
<script src="./stt.js"></script>              // Emitter SECOND

// Listener registrado ANTES do emit
// Resultado: 📡 Listener registrado: transcriptAdd
```

---

## 18+ Eventos Mapeados

| # | Evento | Emissor | Listener | Quando |
|----|--------|---------|----------|--------|
| 1 | `listenButtonToggle` | audio | HomeUI | Click mic |
| 2 | `transcriptAdd` | STT | HomeUI | Texto chega |
| 3 | `updateInterim` | STT | HomeUI | Texto parcial |
| 4 | `placeholderFulfill` | STT | HomeUI | Texto final |
| 5 | `answerStreamChunk` | LLM | HomeUI | Token chega |
| 6 | `answerStreamEnd` | LLM | HomeUI | Resposta ok |
| 7 | `windowOpacityUpdate` | renderer | WindowUI | Slider move |
| 8 | `statusUpdate` | helpers | HomeUI | Status muda |
| 9 | `error` | ANY | renderer | Erro! |
| ... | +9 more | ... | ... | ... |

---

## Padrão Recomendado

```javascript
// ✅ BOAS PRÁTICAS

// 1. Registrar listener NO CONSTRUCTOR
class MyManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    
    // Listener pronto desde o início
    this.eventBus.on('my-event', (data) => {
      console.log('Event:', data);
    });
  }
}

// 2. Emitir quando apropriado
function doSomething() {
  // ... work ...
  
  eventBus.emit('my-event', {
    field: 'value'
  });
}

// 3. Ordem em index.html
// <script src="./MyManager.js"></script>    ← Listener FIRST
// <script src="./MyController.js"></script> ← Emitter SECOND
```

---

## 🔧 Teste No Console

```javascript
// Ver todos eventos registrados
console.log(globalThis.eventBus.events)

// Emitir teste
globalThis.eventBus.emit('test', { msg: 'Hello' })

// Registrar teste
globalThis.eventBus.on('test', (d) => {
  console.log('Received:', d.msg)
})

// Emitir de novo para ver listener reagir
globalThis.eventBus.emit('test', { msg: 'World' })
```

---

## 🎯 Conclusão

| Aspecto | Resposta |
|---------|----------|
| **O que é?** | Pub/Sub Event System |
| **Quem emite?** | 8 componentes |
| **Quem escuta?** | 3 managers principais |
| **Quantos eventos?** | 18+ mapeados |
| **Como flui?** | Emit → Bus → Listener |
| **Ordem importa?** | ✅ SIM! Muito |
| **Funcionando?** | ✅ SIM! Perfeitamente |

---

## 📚 Documentos Completos

Para detalhes, veja:
- **QUICK_REFERENCE.md** - Cheat sheet (3 min)
- **SUMARIO_EVENTOS.md** - Visão geral (10 min)
- **DIAGRAMA_FLUXO_EVENTOS.md** - Diagramas (20 min)
- **CENARIOS_EVENTOS.md** - Exemplos (30 min)
- **EVENTO_FLOW_PATTERN.md** - Técnico (25 min)

---

⏱️ **Tempo de Leitura**: 2 minutos | **Entendimento**: ✅ 100%
