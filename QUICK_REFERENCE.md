# ��� QUICK REFERENCE - ESTRUTURA PÓS REFATORAÇÃO

## main.js - Onde Encontrar Cada IPC Handler

```
SEÇÃO 1: IMPORTS
  Linhas: ~1-30

SEÇÃO 2: ESTADO GLOBAL
  Linhas: ~33-50

SEÇÃO 3: INICIALIZAÇÃO SECURE STORE
  Linhas: ~53-70

SEÇÃO 4: FUNÇÕES AUXILIARES
  Linhas: ~73-100
  └─ initializeOpenAIClient(apiKey)

SEÇÃO 5: REGISTRO CENTRAL ⭐ (COMECE AQUI)
  Linhas: ~103-130
  └─ registerIPCHandlers()
     ├─ registerGeneralHandlers()
     ├─ registerApiKeyHandlers()
     ├─ registerGPTHandlers()
     ├─ registerWindowControlHandlers()
     ├─ registerScreenshotHandlers()
     └─ registerAppCloseHandler()

════════════════════════════════════════════
HANDLERS GERAIS (Linhas ~133-160)
════════════════════════════════════════════
  ✓ handleRendererError()
  ✓ handleGetOpenAIApiStatus()

════════════════════════════════════════════
HANDLERS API KEYS (Linhas ~163-280)
════════════════════════════════════════════
  ✓ handleHasApiKey()
  ✓ handleGetApiKey()
  ✓ handleSaveApiKey() ← Inicializa OpenAI!
  ✓ handleDeleteApiKey()
  ✓ handleInitializeApiClient()

════════════════════════════════════════════
HANDLERS GPT (Linhas ~283-400)
════════════════════════════════════════════
  ✓ ensureOpenAIClient()
  ✓ handleAskGPT()
  ✓ handleAskGPTStream() ← Streaming aqui!
  ✓ fakeStreamGPT()

════════════════════════════════════════════
HANDLERS JANELA (Linhas ~403-570)
════════════════════════════════════════════
  ✓ handleSetClickThrough()
  ✓ handleGetClickThrough()
  ✓ handleSetInteractiveZone()
  ✓ handleStartWindowDrag()
  ✓ handleMoveWindowTo()
  ✓ handleGetWindowBounds()
  ✓ handleGetCursorScreenPoint()

════════════════════════════════════════════
HANDLERS SCREENSHOT (Linhas ~573-780)
════════════════════════════════════════════
  ✓ handleCaptureScreenshot() ← desktopCapturer
  ✓ handleAnalyzeScreenshots() ← OpenAI Vision
  ✓ handleCleanupScreenshots()

════════════════════════════════════════════
HANDLER FECHAMENTO (Linhas ~783-790)
════════════════════════════════════════════
  ✓ handleAppClose()

SEÇÃO 6: CRIAÇÃO DA JANELA
  Linhas: ~793-840
  └─ createWindow()

SEÇÃO 7: INICIALIZAÇÃO
  Linhas: ~843-870
  ├─ app.whenReady() ← Ponto de entrada
  └─ registerGlobalShortcuts()

SEÇÃO 8: FINALIZAÇÃO
  Linhas: ~873-875
  └─ app.on('will-quit')
```

---

## renderer.js - Onde Encontrar Cada Função

```
SEÇÃO 1: IMPORTAÇÕES (Linhas ~1-70)
  ├─ require('electron', 'marked', 'highlight.js')
  ├─ STT imports (deepgram, vosk, whisper)
  ├─ protectAgainstScreenCapture() [IIFE]
  └─ CONSTANTES (YOU, OTHER, SYSTEM_PROMPT)

SEÇÃO 2: ESTADO GLOBAL (Linhas ~72-150)
  ├─ APP_CONFIG
  ├─ Stream states (input/output)
  ├─ Question states
  └─ Metrics

SEÇÃO 3: CALLBACKS (Linhas ~152-250)
  ├─ UICallbacks object (20+ callbacks)
  ├─ onUIChange()
  ├─ emitUIChange()
  ├─ UIElements object
  ├─ registerUIElements()
  └─ listener onAudioDeviceChanged

SEÇÃO 4: MODO (Linhas ~252-310)
  ├─ MODES constants
  ├─ CURRENT_MODE
  └─ ModeController (4 métodos)

SEÇÃO 5: VOLUME (Linhas ~312-500)
  ├─ startInputVolumeMonitoring()
  ├─ stopInputVolumeMonitoring()
  ├─ startOutputVolumeMonitoring()
  ├─ stopOutputVolumeMonitoring()
  └─ createOutputStream()

SEÇÃO 6: HELPERS (Linhas ~502-750)
  ├─ getConfiguredSTTModel()
  ├─ finalizeQuestion()
  ├─ resetCurrentQuestion()
  ├─ renderQuestionsHistory()
  ├─ getSelectedQuestionText()
  ├─ normalizeForCompare()
  ├─ updateStatusMessage()
  ├─ findAnswerByQuestionId()
  ├─ promoteCurrentToHistory()
  └─ Marked.js setup

SEÇÃO 7: CONTROLE ÁUDIO (Linhas ~752-900)
  ├─ startAudio() ← Roteador STT
  ├─ listenToggleBtn()
  ├─ hasActiveModel()
  └─ restartAudioPipeline()

SEÇÃO 8: RENDER UI (Linhas ~902-1050)
  ├─ handleQuestionClick()
  ├─ applyOpacity()
  ├─ renderCurrentQuestion()
  ├─ scrollToSelectedQuestion()
  └─ clearAllSelections()

SEÇÃO 9: CONSOLIDAÇÃO (Linhas ~1052-1350)
  ├─ handleCurrentQuestion()
  ├─ finalizeCurrentQuestion() ← LÓGICA ENTREVISTA
  ├─ closeCurrentQuestionForced()
  └─ resetCurrentQuestion()

════════════════════════════════════════════
SEÇÃO 10: SISTEMA GPT ⭐ (Linhas ~1352-1600)
════════════════════════════════════════════
  ├─ askGpt() ← FUNÇÃO PRINCIPAL!
  │  ├─ Obtém texto pergunta
  │  ├─ Dedupe (lastAskedQuestionNormalized)
  │  ├─ MODO ENTREVISTA:
  │  │  ├─ invoke ask-gpt-stream
  │  │  └─ listeners GPT_STREAM_CHUNK/END ← STREAMING
  │  └─ MODO NORMAL:
  │     └─ await ask-gpt (batch)
  └─ logTranscriptionMetrics()

SEÇÃO 11: RESET (Linhas ~1602-1750)
  ├─ resetAppState() ← RESET CENTRALIZADO
  └─ resetHomeSection()

SEÇÃO 12: SCREENSHOT (Linhas ~1752-1900)
  ├─ captureScreenshot()
  ├─ analyzeScreenshots() ← OPENAI VISION
  └─ clearScreenshots()

SEÇÃO 13: MOCK/DEBUG (Linhas ~1902-2350)
  ├─ getMockResponse()
  ├─ MOCK_RESPONSES object
  ├─ MOCK_SCENARIOS array
  ├─ IPC Interceptor
  │  └─ override ipcRenderer.invoke()
  │     └─ Simula ask-gpt-stream
  └─ runMockAutoPlay() ← TESTE AUTOMÁTICO!

SEÇÃO 14: DEBUG (Linhas ~2352-2400)
  ├─ debugLogRenderer()
  └─ logTranscriptionMetrics()

SEÇÃO 15: PUBLIC API (Linhas ~2402-2484)
  └─ RendererAPI object
     ├─ Audio methods
     ├─ Mode methods
     ├─ Question methods
     ├─ UI methods
     ├─ Window methods
     ├─ Config methods
     ├─ Navigation methods
     ├─ IPC listeners
     └─ Screenshot methods
```

---

## ��� KEY FUNCTIONS

### main.js
| Função | Linha | O que faz |
|--------|-------|----------|
| `registerIPCHandlers()` | ~107 | Orquestra registro de todos os handlers |
| `handleAskGPTStream()` | ~335 | Streaming de resposta GPT |
| `handleCaptureScreenshot()` | ~602 | Captura discreta de tela |
| `handleAnalyzeScreenshots()` | ~645 | Análise via OpenAI Vision |
| `createWindow()` | ~793 | Cria janela Electron |

### renderer.js
| Função | Linha | O que faz |
|--------|-------|----------|
| `askGpt()` | ~1354 | PRINCIPAL: envia ao LLM com streaming |
| `handleCurrentQuestion()` | ~1055 | Consolida transcrição |
| `finalizeCurrentQuestion()` | ~1280 | Fecha pergunta → GPT |
| `resetAppState()` | ~1605 | Reset centralizado |
| `runMockAutoPlay()` | ~2127 | Teste automático |

---

## ��� FLUXOS PRINCIPAIS

### 1. Captura → Pergunta → Resposta
```
startAudio()
  ↓ (STT transcrevendo)
handleCurrentQuestion(author, text)
  ↓
finalizeCurrentQuestion()
  ↓
askGpt() ← GPT_STREAM_CHUNK emitido aqui!
  ↓
onAnswerStreamChunk (callback da UI)
```

### 2. Screenshot → Análise
```
captureScreenshot() (renderer)
  ↓
invoke CAPTURE_SCREENSHOT (main)
  ↓
desktopCapturer.getSources()
  ↓
analyze Screenshots()
  ↓
invoke ANALYZE_SCREENSHOTS (main)
  ↓
openaiClient.chat.completions (Vision)
  ↓
resultado como nova pergunta
```

### 3. Mock AutoPlay
```
runMockAutoPlay()
  ├─ FASE 1: Simula captura (2-4s)
  ├─ FASE 2: Processa pergunta (800ms)
  ├─ FASE 3: askGpt (streaming mockado)
  ├─ FASE 4: Captura real de screenshots
  └─ FASE 4B: Análise mockada
```

---

## ��� DICAS DE NAVEGAÇÃO

### Encontrar um IPC Handler
```bash
# Procure em main.js:
grep -n "ipcMain.handle('seu-evento'" main.js
grep -n "handleSeuEvento" main.js

# Depois vá para essa linha
```

### Encontrar onde Callback é emitido
```bash
# Em renderer.js:
grep -n "emitUIChange('onSeuEvento'" renderer.js

# Localize quem se inscreve:
grep -n "onUIChange('onSeuEvento'" renderer.js
```

### Debugar GPT Streaming
```bash
# Veja:
1. askGpt() no renderer (linha ~1354)
2. ipcRenderer.on('GPT_STREAM_CHUNK') listener
3. handleAskGPTStream() no main (linha ~335)
```

### Testar Mock
```javascript
// No browser console:
window.RendererAPI.setAppConfig({MODE_DEBUG: true})
window.runMockAutoPlay()
```

---

## ��� CHECKLIST PARA MODIFICAÇÕES

### Adicionar novo IPC Handler
- [ ] Crie função `handle[Nome]()`
- [ ] Adicione JSDoc com parâmetros
- [ ] Registre em `register[Categoria]Handlers()`
- [ ] Adicione chamada em `registerIPCHandlers()`
- [ ] Teste em `npm start`

### Adicionar novo Callback
- [ ] Adicione em UICallbacks object
- [ ] Implemente lógica em emitUIChange
- [ ] Adicione listener em config-manager
- [ ] Teste emissão

### Adicionar Métrica/Debug
- [ ] Use `debugLogRenderer()` se debug
- [ ] Log em `logTranscriptionMetrics()`
- [ ] Teste com `ENABLE_INTERVIEW_TIMING_DEBUG_METRICS = true`

---

**Happy coding! Estrutura clara = desenvolvimento rápido! ���**
