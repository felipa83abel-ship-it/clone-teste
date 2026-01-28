# 🎬 Diagramas de Fluxo de Eventos - Visualização

## 1️⃣ Arquitetura Geral do EventBus

```
┌────────────────────────────────────────────────────────────────┐
│                       APLICAÇÃO ELECTRON                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    RENDERER PROCESS                      │  │
│  │                                                          │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │  │
│  │  │  EMISSORES  │  │   EventBus   │  │    OUVINTES     │ │  │
│  │  │             │  │              │  │                 │ │  │
│  │  │ - renderer  │  │ on(event,cb) │  │ - HomeUIManager │ │  │
│  │  │ - audio-ctl │  │ emit(event)  │  │ - WindowUIManager│ │  │
│  │  │ - stt-*     │─→│ off(event)   │─→│ - screenshot-ctl│ │  │
│  │  │ - llmHandler│  │ clear()      │  │ - config mgrs   │ │  │
│  │  │             │  │              │  │                 │ │  │
│  │  └─────────────┘  └──────────────┘  └─────────────────┘ │  │
│  │                                                          │  │
│  │                    State Management                      │  │
│  │                  (AppState + globalThis)                │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## 2️⃣ Fluxo de Audio: Record → Transcribe → LLM

```
USER PRESSES Ctrl+D (or clicks Listen button)
│
└──→ listenToggleBtn() [audio-controller.js]
    ├─ Start: appState.audio.isRunning = true
    ├─ Emit: 'listenButtonToggle' ← [1] LISTEN STATE CHANGED
    │
    └──→ STT Provider (Deepgram/Vosk/Whisper)
        ├─ Captures audio frames
        ├─ Sends to API or local model
        │
        └──→ Transcription Result
            ├─ Emit: 'transcriptAdd' ← [2] TEXT ARRIVES
            │  ├─ HomeUIManager receives
            │  └─ Renders in real-time
            │
            └─ Interim vs Final
                ├─ Interim: 'updateInterim' → partial text
                └─ Final: 'placeholderFulfill' → lock text

USER PRESSES Ctrl+Enter (or clicks Ask button)
│
└──→ handleQuestionClick() [question-controller.js]
    ├─ Validate question
    ├─ Emit: 'currentQuestionUpdate' ← [3] QUESTION SELECTED
    │
    └──→ askLLM() [renderer.js]
        ├─ validateLLMRequest()
        ├─ Route by mode: INTERVIEW or NORMAL
        │
        ├─ INTERVIEW MODE
        │  └──→ handleLLMStream() [llmHandlers.js]
        │      ├─ OpenAI streaming API
        │      ├─ For each token chunk:
        │      │  └─ Emit: 'answerStream' ← [4] TOKEN RECEIVED
        │      │     └─ HomeUIManager appends to DOM
        │      │
        │      └─ On completion:
        │         ├─ Emit: 'answerStreamEnd' ← [5] STREAM COMPLETE
        │         └─ Emit: 'llmStreamEnd'
        │
        └─ NORMAL MODE
           └──→ handleLLMBatch() [llmHandlers.js]
               ├─ Complete API call (no streaming)
               └─ Emit: 'answerBatchEnd' ← [6] FULL ANSWER

ALL RESPONSES RENDERED IN HISTORY
└─ Question + Answer visible
```

---

## 3️⃣ Fluxo de Configuração: User Input → Event → Persistence

```
USER CHANGES CONFIG (Privacy, Screenshot, Window)
│
├─ Direct DOM Change (Input/Checkbox/Slider)
│  │
│  ├─ HTML5 Event: 'change' / 'input'
│  │  │
│  │  └──→ Manager Listener (e.g., PrivacyConfigManager.#initPrivacyListeners)
│  │      ├─ Reads DOM value
│  │      ├─ Saves to store (localStorage or electron-store)
│  │      └─ Emit: 'PRIVACY_CONFIG_CHANGED' or 'SCREENSHOT_CONFIG_CHANGED'
│  │         └─ Other components react
│  │
│  └─ EventBus Event → Other Listeners
│     └─ Keep UI in sync
│
└─ Programmatic Change (RendererAPI.setClickThrough, etc)
   ├─ Call function
   └─ Emit event for consistency
```

---

## 4️⃣ Fluxo Completo: User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENTREVISTA COMPLETA                          │
└─────────────────────────────────────────────────────────────────┘

1. APP LOADS (index.html)
   ├─ Load: EventBus → AppState → Managers → Controllers → renderer.js
   │  └─ Order: Listeners registered BEFORE emitters
   │
   └─ Initialize:
      ├─ Listeners for UI elements
      ├─ Listeners for EventBus
      └─ Keyboard shortcuts (Ctrl+D, Ctrl+Enter, etc)

2. USER SELECTS QUESTION
   │
   ├─ Event: Click question-block
   │  └─ Handler: handleQuestionClick() [question-controller.js]
   │
   ├─ Emit: 'currentQuestionUpdate'
   │  ├─ Receiver: HomeUIManager
   │  └─ Action: Render selected question, highlight button
   │
   └─ State: appState.selectedId = selected question

3. USER PRESSES Ctrl+D (or clicks Listen)
   │
   ├─ Event: Keyboard or click
   │  └─ Handler: listenToggleBtn() [audio-controller.js]
   │
   ├─ Emit: 'listenButtonToggle'
   │  ├─ Receiver: HomeUIManager
   │  └─ Action: Change button state (active/inactive)
   │
   ├─ Start STT: getConfiguredSTTModel() → start audio capture
   │  └─ Listen for input audio frames
   │
   └─ State: appState.audio.isRunning = true

4. SPEECH DETECTED, TRANSCRIBED
   │
   ├─ STT sends transcription chunks
   │  │
   │  └─ Emit: 'transcriptAdd' (final) or 'updateInterim' (partial)
   │     └─ Receiver: HomeUIManager
   │
   ├─ Emit: 'placeholderFulfill'
   │  └─ Receiver: HomeUIManager → Finalize interim text
   │
   └─ State: appState.interview.lastAskedQuestionNormalized = text

5. SILENCE DETECTED or USER PRESSES Ctrl+Enter
   │
   ├─ Auto in INTERVIEW mode: silence timeout triggers askLLM()
   │  └─ Explicit in NORMAL mode: user clicks "Ask" button
   │
   ├─ Handler: askLLM() [renderer.js]
   │  ├─ Validate question
   │  └─ Call: handleLLMStream() or handleLLMBatch()
   │
   └─ State: appState.interview.llmRequestedQuestionId = question

6. LLM STARTS STREAMING RESPONSE
   │
   ├─ Handler: handleLLMStream() [llmHandlers.js]
   │  ├─ OpenAI client streaming
   │  └─ For each token:
   │
   ├─ Emit: 'answerStream'
   │  ├─ Data: { questionId, text, turnId }
   │  └─ Receiver: HomeUIManager
   │     └─ Append token to DOM (real-time)
   │
   └─ State: appState.interview.responseStarted = true

7. LLM COMPLETES
   │
   ├─ Emit: 'answerStreamEnd'
   │  ├─ Data: { questionId, response, turnId }
   │  └─ Receiver: HomeUIManager
   │     └─ Finalize answer block, sort by turnId
   │
   ├─ Emit: 'llmStreamEnd'
   │  └─ Receiver: renderer.js
   │
   └─ State: appState.interview.responseEnded = true

8. ✅ ANSWER VISIBLE IN HISTORY
   │
   ├─ Question block with answer displayed
   ├─ Ready for next question
   │
   └─ Loop back to step 2 for next question

┌─────────────────────────────────────────────────────────────────┐
│                   EVENT SEQUENCE TABLE                          │
├─────────────────────────────────────────────────────────────────┤
│ # │ EVENT                    │ EMITTER         │ LISTENERS       │
├─────────────────────────────────────────────────────────────────┤
│ 1 │ currentQuestionUpdate    │ question-ctrl   │ HomeUIManager   │
│ 2 │ listenButtonToggle       │ audio-ctrl      │ HomeUIManager   │
│ 3 │ transcriptAdd            │ STT provider    │ HomeUIManager   │
│ 4 │ updateInterim            │ STT provider    │ HomeUIManager   │
│ 5 │ placeholderFulfill       │ STT provider    │ HomeUIManager   │
│ 6 │ answerStream        │ llmHandlers     │ HomeUIManager   │
│ 7 │ answerStreamEnd          │ llmHandlers     │ HomeUIManager   │
│ 8 │ llmStreamEnd             │ llmHandlers     │ renderer        │
│ 9 │ sortAnswersByTurnId      │ renderer        │ HomeUIManager   │
│10 │ error                    │ Any component   │ renderer        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5️⃣ Fluxo de Erro: Error Propagation

```
ANY COMPONENT ENCOUNTERS ERROR
│
├─ Emit: 'error' [event name]
│  └─ Data: error message string
│
├─ Receiver: renderer.js (line 138)
│  │
│  ├─ Log error
│  │
│  └─ If configManager exists:
│     └─ configManager.showError(error)
│        └─ Display in UI (red toast, etc)
│
└─ User sees error message and can retry
```

---

## 6️⃣ Sequência de Carregamento em index.html

```
┌────────────────────────────────────────────────────────┐
│         SCRIPT LOAD ORDER (CRITICAL!)                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  1. BASE INFRASTRUCTURE                              │
│     ├─ events/EventBus.js          [Pub/Sub base]    │
│     ├─ state/AppState.js           [Global state]    │
│     └─ events/EventBus.js exported │
│                                                        │
│  2. STRATEGIES & MANAGERS (LISTENERS)                 │
│     ├─ strategies/STTStrategy.js   [Register STTs]   │
│     ├─ llm/LLMManager.js           [Manage APIs]     │
│     ├─ controllers/config/managers/* [UI listeners]  │
│     │  ├─ HomeUIManager.js         [Main UI]         │
│     │  ├─ WindowUIManager.js       [Window control]  │
│     │  ├─ PrivacyConfigManager.js  [Privacy]         │
│     │  └─ ScreenConfigManager.js   [Screenshots]     │
│     └─ (all .on() calls in #init methods)
│                                                        │
│  3. PROVIDERS & HANDLERS (EMITTERS)                   │
│     ├─ stt/stt-deepgram.js        [Transcription]   │
│     ├─ stt/stt-vosk.js            [Transcription]   │
│     ├─ stt/stt-whisper.js         [Transcription]   │
│     ├─ audio/volume-audio-monitor.js [Volume]       │
│     ├─ handlers/llmHandlers.js    [LLM responses]   │
│     └─ (all .emit() calls here)
│                                                        │
│  4. CONTROLLERS (BOTH)                                │
│     ├─ controllers/audio/*        [Listen/Stop]      │
│     ├─ controllers/question/*     [Q&A logic]        │
│     ├─ controllers/screenshot/*   [Screenshots]      │
│     ├─ controllers/modes/*        [Mode switching]   │
│     └─ (both .on() and .emit() calls)
│                                                        │
│  5. CONFIG MANAGER (BRIDGES)                          │
│     ├─ controllers/config/ConfigManager.js           │
│     ├─ controllers/config/managers/*                 │
│     └─ (initialize all managers)
│                                                        │
│  6. MAIN ORCHESTRATOR (FULL API)                      │
│     └─ renderer.js                [RendererAPI]      │
│        ├─ Register all listeners
│        ├─ Setup keyboard shortcuts
│        └─ Expose public methods
│                                                        │
└────────────────────────────────────────────────────────┘

⚠️ KEY RULE: Listeners MUST load BEFORE Emitters!
```

---

## 7️⃣ Estado vs Eventos: Quando Usar Cada Um?

```
┌──────────────────────────────────────────────────────┐
│       STATE (AppState)                               │
├──────────────────────────────────────────────────────┤
│ • Guardar dados persistentes                         │
│ • Compartilhar entre componentes                     │
│ • Exemplo: appState.selectedId, isRunning, history  │
│                                                       │
│ ✅ appState.audio.isRunning = true                   │
│ ✅ appState.selectedId = 'Q12'                       │
│ ✅ appState.interview.llmRequestedQuestionId        │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│       EVENTS (EventBus)                              │
├──────────────────────────────────────────────────────┤
│ • Notificar sobre mudanças (desacoplar)             │
│ • Desencadear ações em outros componentes           │
│ • Exemplo: 'transcriptAdd', 'answerStream'    │
│                                                       │
│ ✅ eventBus.emit('listenButtonToggle')              │
│ ✅ eventBus.emit('transcriptAdd')                   │
│ ✅ eventBus.on('statusUpdate', callback)            │
└──────────────────────────────────────────────────────┘

PADRÃO RECOMENDADO
┌──────────────────────────────────────────────────────┐
│ 1. MUDANÇA OCORRE                                     │
│    └─ State é atualizado (appState.X = Y)           │
│                                                       │
│ 2. NOTIFICAR OBSERVERS                               │
│    └─ Emit evento (eventBus.emit('changed', {...})) │
│                                                       │
│ 3. LISTENERS REAGEM                                  │
│    └─ Lêem state e atualizam UI                     │
│       (via eventBus.on('changed', listener))        │
└──────────────────────────────────────────────────────┘
```

---

## 8️⃣ Fluxo de Inicialização Detalhado

```
┌────────────────────────────────────────────────────┐
│              BOOT SEQUENCE                         │
└────────────────────────────────────────────────────┘

T=0: Electron Main Process
     ├─ Create window
     ├─ Load index.html
     └─ Start rendering

T=1: Parse HTML, Load Scripts in Order
     │
     ├─ <script src="./events/EventBus.js">
     │  └─ globalThis.EventBus = class
     │
     ├─ <script src="./state/AppState.js">
     │  └─ globalThis.appState = new AppState()
     │     └─ No events emitted yet
     │
     ├─ <script src="./controllers/config/managers/HomeUIManager.js">
     │  ├─ class HomeUIManager
     │  └─ constructor() {
     │     ├─ this.eventBus = eventBus (received as param)
     │     ├─ #initActionButtonListeners()
     │     │  └─ eventBus.on('listenButtonToggle', callback)
     │     │     └─ 📡 LISTENER REGISTERED
     │     │
     │     └─ #initUIEventBusListeners()
     │        ├─ eventBus.on('statusUpdate', callback)
     │        ├─ eventBus.on('transcriptionAdd', callback)
     │        ├─ eventBus.on('answerStream', callback)
     │        └─ eventBus.on(...) × 10 more
     │           └─ 📡 ALL LISTENERS REGISTERED
     │     }
     │
     ├─ <script src="./stt/stt-deepgram.js">
     │  ├─ Initializes WebRTC connection
     │  │
     │  └─ When transcription arrives:
     │     └─ eventBus.emit('transcriptAdd', {...})
     │        └─ ✅ HomeUIManager is listening! Event received!
     │
     ├─ <script src="./handlers/llmHandlers.js">
     │  └─ When LLM streams token:
     │     └─ eventBus.emit('answerStream', {...})
     │        └─ ✅ HomeUIManager is listening! Token rendered!
     │
     ├─ <script src="./renderer.js">
     │  ├─ Setup remaining listeners
     │  ├─ Setup keyboard shortcuts
     │  └─ Expose RendererAPI
     │
     └─ DOM Ready
        └─ Application READY!

T=2: User Interacts
     └─ Events flow as described in Section 4
```

---

## 9️⃣ Troubleshooting Common Issues

```
ISSUE: "⚠️ Nenhum listener para: eventName"
───────────────────────────────────────────
Cause:
  ├─ Listener not registered
  ├─ Listener registered AFTER emit
  └─ Typo in event name (case-sensitive)

Solution:
  ├─ Ensure listener script loads BEFORE emitter
  └─ Check spelling: 'transcriptAdd' ≠ 'transcriptadded'

Example:
  ✅ CORRECT
     <script src="./managers/HomeUIManager.js"></script> ← Listener
     <script src="./stt/stt-deepgram.js"></script>       ← Emitter

  ❌ WRONG
     <script src="./stt/stt-deepgram.js"></script>       ← Emitter
     <script src="./managers/HomeUIManager.js"></script> ← Listener (too late!)

─────────────────────────────────────────────────

ISSUE: Event fires but UI doesn't update
───────────────────────────────────────────
Cause:
  ├─ Listener callback has error
  ├─ DOM element doesn't exist
  └─ Callback not finding globalThis references

Solution:
  ├─ Add try/catch in callback
  ├─ Verify DOM ID with inspector
  └─ Use globalThis.element?.method?.()

Example:
  ✅ CORRECT
     eventBus.on('update', (data) => {
       try {
         const el = document.getElementById('status');
         if (el) el.textContent = data.message;
       } catch (e) {
         console.error('Error in listener:', e);
       }
     });

─────────────────────────────────────────────────

ISSUE: Multiple listeners fire same callback
───────────────────────────────────────────────
Cause:
  ├─ registerListener called multiple times
  └─ No cleanup in off() method

Solution:
  ├─ Register once in #init method
  └─ Store callback reference for removal

Example:
  ✅ CORRECT
     constructor() {
       this.onAnswerChunk = (data) => { ... };
       eventBus.on('answerStream', this.onAnswerChunk);
     }
     
     cleanup() {
       eventBus.off('answerStream', this.onAnswerChunk);
     }

```

---

## 🔟 Métricas de Sucesso

```
✅ HEALTHY EVENT SYSTEM:

1. Listeners load before emitters
   └─ Check: No "⚠️ Nenhum listener para" warnings

2. Events are received and processed
   └─ Check: Console logs show 📡 and 📥 messages

3. UI updates in real-time
   └─ Check: Text appears as tokens arrive

4. No memory leaks
   └─ Check: DevTools Memory doesn't grow unbounded

5. Error handling works
   └─ Check: Errors display without crashing app

6. Multiple listeners work together
   └─ Check: Event triggers all registered callbacks

┌──────────────────────────────────────────┐
│ if all above = true, system is healthy   │
└──────────────────────────────────────────┘
```

---

Diagrama criado para documentar visualmente o padrão de eventos usado no projeto!
