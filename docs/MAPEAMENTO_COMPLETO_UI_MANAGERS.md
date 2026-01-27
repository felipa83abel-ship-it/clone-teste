# 🗺️ MAPEAMENTO COMPLETO DA UI - ESTRUTURA DE MANAGERS

**Data:** 27 de janeiro de 2026  
**Status:** ✅ PRONTO PARA IMPLEMENTAÇÃO  
**Objetivo:** Definir exatamente qual Manager controla qual seção da UI

---

## 📋 RESUMO EXECUTIVO

| Seção | Manager Atual | Status | Ações Necessárias |
|-------|--------------|--------|-------------------|
| **Top Bar** | ❌ NENHUM | CRÍTICO | Criar `TopBarManager.js` |
| **Home (Principal)** | ✅ HomeUIManager | OK | Validar listeners |
| **API e Modelos** | ✅ ApiKeyManager + ModelSelectionManager | OK | Validar listeners |
| **Áudio e Tela** | ✅ AudioDeviceManager + ScreenConfigManager | OK | Validar listeners |
| **Privacidade** | ✅ PrivacyConfigManager | OK | Validar listeners |
| **Outros** | ❌ PARCIAL | ⚠️ | Criar `OtherConfigManager.js` |
| **Janela (Window)** | ✅ WindowUIManager | INCOMPLETO | Refatorar - separar TopBar |
| **Info** | ❌ NENHUM | MINIMAL | Criar `InfoManager.js` |

---

## 🎯 ESTRUTURA VISUAL COMPLETA

```
┌─────────────────────────────────────────────────────────────────┐
│                          🎨 AskMe UI                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────── TOP BAR (🔝) ─────────────────┐       │
│  │  Logo  │  Modo Selection  │  Opacidade Slider │  │  │       │
│  │        │                  │  (← RM ► 1.0)      │  │  │       │
│  │        │                  │  Mock Badge        │  │  │       │
│  │        │                  │  Screenshot Badge  │  │  │       │
│  │                                          [Close]   │       │
│  └───────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ SIDE MENU (Left) ─┐  ┌──── MAIN CONTENT (Center) ────┐  │
│  │                    │  │                                │  │
│  │ [🏠 Início]        │  │  HOME Section                  │  │
│  │                    │  │  ├─ VU Meters                  │  │
│  │ [⚙️ API/Modelos]   │  │  ├─ Listen Button              │  │
│  │                    │  │  ├─ Transcription Container    │  │
│  │ [🎤 Áudio/Tela]    │  │  ├─ Questions History          │  │
│  │                    │  │  └─ Answers LLM                │  │
│  │ [🔒 Privacidade]   │  │                                │  │
│  │                    │  │  API E MODELOS Section (hidden)│  │
│  │ [⋮ Outros]        │  │  ├─ Api Key Input              │  │
│  │                    │  │  └─ Model Selection            │  │
│  │ [ℹ️ Info]          │  │                                │  │
│  │                    │  │  AUDIO E TELA Section (hidden) │  │
│  │ [⏻ Sair]          │  │  ├─ Audio Device Selection     │  │
│  │                    │  │  └─ Screen Config              │  │
│  │ Drag Handle        │  │                                │  │
│  │ Click-through Btn  │  │  PRIVACIDADE Section (hidden)  │  │
│  │                    │  │  ├─ Hide from Screen          │  │
│  │                    │  │  ├─ Disable Telemetry         │  │
│  │                    │  │  └─ Auto Clear Options        │  │
│  │                    │  │                                │  │
│  │                    │  │  OUTROS Section (hidden)       │  │
│  │                    │  │  ├─ Dark Mode                  │  │
│  │                    │  │  └─ Other Controls             │  │
│  │                    │  │                                │  │
│  │                    │  │  INFO Section (hidden)         │  │
│  │                    │  │  └─ Version Info               │  │
│  │                    │  │                                │  │
│  └────────────────────┘  └────────────────────────────────┘  │
│                                                                 │
│  INTERACTIVE ZONES: [Top Bar] [Side Menu] [Main Content]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📂 DETALHAMENTO POR SEÇÃO

### 1. 🔝 **TOP BAR** ← ⚠️ CRÍTICO (CRIAR TopBarManager.js)

**Localização no HTML:**
```html
<div id="topBar">
  <!-- Conteúdo -->
</div>
```

**Elementos Controlados:**

| ID/Class | Tipo | Controla |
|----------|------|----------|
| `#interviewModeSelect` | `<select>` | Modo de entrevista (NORMAL/INTERVIEW) |
| `#opacityRange` | `<input type="range">` | Opacidade do overlay (0-1, step 0.01) |
| `#mockBadge` | `<div>` | Badge visível quando MODO MOCK ativado |
| `#screenshotBadge` | `<div>` | Badge com contador de screenshots |
| `.top-bar-title` | `<div>` | Título "AskMe" |

**Eventos que Escuta (eventBus.on):**
- `modeSelectUpdate` → atualizar modo selecionado
- `screenshotTaken` → incrementar contador badge
- `windowOpacityUpdate` → sincronizar slider
- `mockModeToggled` → mostrar/esconder badge

**Eventos que Emite (eventBus.emit):**
- `interviewModeChanged` (quando select muda)
- `opacityUpdated` (quando slider move)

**Listeners Que Faltam:**
- ❌ Listener para sincronização inicial do slider
- ❌ Listener para atualização do badge de screenshots em tempo real

**Estrutura do Manager:**
```javascript
class TopBarManager {
  #initListeners() {
    // Registrar TODOS os listeners ANTES de qualquer DOM interaction
    this.eventBus.on('windowOpacityUpdate', this.#handleOpacityUpdate);
    this.eventBus.on('screenshotTaken', this.#handleScreenshotUpdate);
    this.eventBus.on('modeSelectUpdate', this.#handleModeUpdate);
  }

  #initElements() {
    // Setup DOM elements (podem emitir eventos)
    this.opacityRange.addEventListener('input', ...);
    this.interviewModeSelect.addEventListener('change', ...);
  }
}
```

---

### 2. 🏠 **HOME SECTION** ✅ (HomeUIManager - EXISTENTE)

**Manager:** [HomeUIManager.js](../controllers/config/managers/HomeUIManager.js)

**Localização no HTML:**
```html
<section id="home" class="config-section active">
  <!-- Conteúdo -->
</section>
```

**Elementos Controlados:**

| ID/Class | Tipo | Controla |
|----------|------|----------|
| `#listenBtn` | Button | Inicia captura de áudio |
| `#inputVuHome` | Div (VU meter) | Nível de entrada |
| `#outputVuHome` | Div (VU meter) | Nível de saída |
| `#status` | Span | Status da aplicação |
| `#resetHomeBtn` | Button | Reset completo (testes) |
| `#clearScreenshotsBtn` | Button | Limpa screenshots |
| `#transcriptionContainer` | Div | Conteúdo de transcrição |
| `#conversation` | Div | Histórico de conversas |
| `#currentQuestion` | Div | Pergunta atual |
| `#questionsHistory` | Div | Histórico de perguntas |
| `#answers` | Div | Seção de respostas |
| `#askLlmBtn` | Button | Botão pedir resposta LLM |

**Eventos que Escuta:**
- `transcriptAdd` → atualizar transcrição
- `answerStreamChunk` → adicionar token de resposta
- `answerStreamEnd` → finalizar resposta
- `questionUpdate` → atualizar pergunta atual
- `historyClear` → limpar histórico
- `volumeLevelInput` → atualizar VU meter entrada
- `volumeLevelOutput` → atualizar VU meter saída

**Eventos que Emite:**
- `listenButtonToggled` (ao clicar em "Começar a Ouvir")
- `askLlmRequested` (ao clicar em "Enviar")
- `resetHomeRequested` (ao clicar em reset)
- `clearScreenshotsRequested` (ao clicar em clear)

**Status:** ✅ Existente, mas revisar se todos listeners estão registrados ANTES de #initElements

---

### 3. ⚙️ **API E MODELOS SECTION** ✅ (ApiKeyManager + ModelSelectionManager)

**Managers:**
- [ApiKeyManager.js](../controllers/config/managers/ApiKeyManager.js)
- [ModelSelectionManager.js](../controllers/config/managers/ModelSelectionManager.js)

**Localização no HTML:**
```html
<section id="api-models" class="config-section">
  <!-- Conteúdo -->
</section>
```

**Elementos Controlados (ApiKeyManager):**

| ID/Class | Tipo | Controla |
|----------|------|----------|
| `#apiKeyInput` | Input | Entrada segura da API key |
| `.show-key-btn` | Button | Mostrar/esconder chave |
| `.delete-key-btn` | Button | Deletar chave |
| `.api-key-status` | Div | Status da chave |

**Elementos Controlados (ModelSelectionManager):**

| ID/Class | Tipo | Controla |
|----------|------|----------|
| `#sttSelect` | Select | Escolher provedor STT |
| `#llmSelect` | Select | Escolher provedor LLM |

**Eventos que Escutam:**
- `apiKeyUpdated` → sincronizar input
- `providerChanged` → atualizar seleção

**Eventos que Emitem:**
- `apiKeySaved` → salvar chave
- `apiKeyDeleted` → deletar chave
- `sttProviderChanged` → mudar STT
- `llmProviderChanged` → mudar LLM

**Status:** ✅ Existentes, divididos em 2 managers

---

### 4. 🎤 **ÁUDIO E TELA SECTION** ✅ (AudioDeviceManager + ScreenConfigManager)

**Managers:**
- [AudioDeviceManager.js](../controllers/config/managers/AudioDeviceManager.js)
- [ScreenConfigManager.js](../controllers/config/managers/ScreenConfigManager.js)

**Localização no HTML:**
```html
<section id="audio-screen" class="config-section">
  <!-- Conteúdo -->
</section>
```

**Elementos Controlados (AudioDeviceManager):**

| ID/Class | Tipo | Controla |
|----------|------|----------|
| `#inputDeviceSelect` | Select | Escolher dispositivo entrada |
| `#outputDeviceSelect` | Select | Escolher dispositivo saída |

**Elementos Controlados (ScreenConfigManager):**

| ID/Class | Tipo | Controla |
|----------|------|----------|
| `#recordHotkeyBtn` | Button | Gravar hotkey customizado |
| `#formatSelect` | Select | Formato de screenshot |
| `#excludeCheckbox` | Checkbox | Excluir da privacidade |
| `#clearScreenshotsBtn` | Button | Limpar screenshots |

**Eventos que Escutam:**
- `audioDeviceChanged` → atualizar device selecionado
- `hotkeyRecorded` → mostrar hotkey registrado
- `screenshotFormatChanged` → atualizar formato

**Eventos que Emitem:**
- `audioInputChanged` → mudar entrada
- `audioOutputChanged` → mudar saída
- `hotkeyRecordingStarted` → iniciar gravação
- `screenshotFormatUpdated` → mudar formato

**Status:** ✅ Existentes, divididos em 2 managers

---

### 5. 🔒 **PRIVACIDADE SECTION** ✅ (PrivacyConfigManager)

**Manager:** [PrivacyConfigManager.js](../controllers/config/managers/PrivacyConfigManager.js)

**Localização no HTML:**
```html
<section id="privacy" class="config-section">
  <!-- Conteúdo -->
</section>
```

**Elementos Controlados:**

| ID/Class | Tipo | Controla |
|----------|------|----------|
| `#hideFromScreenCheckbox` | Checkbox | Esconder da tela |
| `#disableTelemetryCheckbox` | Checkbox | Desabilitar telemetria |
| `#autoClearCheckbox` | Checkbox | Auto-limpar dados |
| `#retentionSlider` | Range | Dias de retenção |

**Eventos que Escutam:**
- `privacySettingUpdated` → sincronizar checkboxes

**Eventos que Emitem:**
- `hideFromScreenToggled` → ativar/desativar esconder
- `telemetryToggled` → ativar/desativar telemetria
- `autoClearToggled` → ativar/desativar auto-clear
- `retentionDaysChanged` → mudar dias retenção

**Status:** ✅ Existente

---

### 6. ⋮ **OUTROS SECTION** ❌ (CRIAR OtherConfigManager.js)

**Manager:** ❌ NÃO EXISTE

**Localização no HTML:**
```html
<section id="other" class="config-section">
  <!-- Conteúdo -->
</section>
```

**Elementos Esperados:**

| ID/Class | Tipo | Esperado |
|----------|------|----------|
| `#darkModeToggle` | Checkbox | Ativar modo escuro |
| (outros controles) | ? | A definir |

**Status:** ⚠️ Esta seção está parcialmente vazia ou com elementos espalhados

**Ação:** Criar `OtherConfigManager.js` para gerenciar:
- Dark Mode Toggle (atualmente em WindowUIManager)
- Outros controles futuros

---

### 7. ℹ️ **INFO SECTION** ❌ (CRIAR InfoManager.js)

**Manager:** ❌ NÃO EXISTE

**Localização no HTML:**
```html
<section id="info" class="config-section">
  <!-- Conteúdo -->
</section>
```

**Elementos Controlados:**

| ID/Class | Tipo | Controla |
|----------|------|----------|
| (versão) | Span/Div | Mostrar versão app |
| (outros) | ? | A definir |

**Status:** ✅ Minimal (apenas exibe informações)

**Ação:** Criar `InfoManager.js` para gerenciar exibição de versão e info

---

### 8. 🪟 **WINDOW (Janela do Electron)** ✅ (WindowUIManager - REFATORAR)

**Manager:** [WindowUIManager.js](../controllers/config/managers/WindowUIManager.js)

**Responsabilidades:**
- ✅ Controla dragging da janela (dragHandle)
- ✅ Controla click-through (btnToggleClick)
- ✅ Controla fechar app (btnClose) ← **NOVO: será movido de HomeUIManager**
- ❌ Controla Dark Mode Toggle (deve estar em `OtherConfigManager`)
- ❌ Controla Modo Interview Select (deve estar em `TopBarManager`)
- ❌ Controla Opacidade (deve estar em `TopBarManager`)

**Ação:** Refatorar WindowUIManager para:
```javascript
// Manter:
- #handleDragHandle()
- #handleClickThrough()
- #handleInteractiveZones()

// Adicionar (movido de HomeUIManager):
- #handleBtnClose() ← envia APP_CLOSE IPC

// Mover para TopBarManager:
- interviewModeSelect listener/handler
- opacityRange listener/handler

// Mover para OtherConfigManager:
- darkModeToggle listener/handler
```

**Lógica:** WindowUIManager gerencia tudo que é relativo à **JANELA EM SI** (movimento, click-through, fechar)

---

## 🛠️ PLANO DE IMPLEMENTAÇÃO

### Fase 1: CRIAR MANAGERS FALTANTES (Esqueleto)
```
✅ 1. TopBarManager.js (crítico)
   - Listeners para: opacidade, modo, screenshots
   - Elementos: opacityRange, interviewModeSelect, badges

❌ 2. OtherConfigManager.js (novo)
   - Listeners para: dark mode, outros controles
   - Elementos: darkModeToggle

❌ 3. InfoManager.js (novo)
   - Listeners para: atualizações de info
   - Elementos: exibição de versão
```

### Fase 2: REFATORAR MANAGERS EXISTENTES
```
✅ WindowUIManager.js
   - REMOVER: opacityRange, interviewModeSelect, darkModeToggle
   - MANTER: drag handle, click-through, interactive zones

✅ HomeUIManager.js
   - Validar: todos listeners antes de #initElements

✅ ApiKeyManager.js
   - Validar: todos listeners antes de #initElements

✅ AudioDeviceManager.js
   - Validar: todos listeners antes de #initElements

✅ ModelSelectionManager.js
   - Validar: todos listeners antes de #initElements

✅ ScreenConfigManager.js
   - Validar: todos listeners antes de #initElements

✅ PrivacyConfigManager.js
   - Validar: todos listeners antes de #initElements
```

### Fase 3: ATUALIZAR index.html
```
Adicionar ANTES de renderer.js:
<script src="./controllers/config/managers/TopBarManager.js"></script>
<script src="./controllers/config/managers/OtherConfigManager.js"></script>
<script src="./controllers/config/managers/InfoManager.js"></script>

Ordem completa no index.html:
1. EventBus, AppState
2. Estratégias (STTStrategy, LLMManager)
3. STT Providers (deepgram, vosk, whisper)
4. Audio Monitor
5. LLM Handlers
6. DOM Helpers
7. Controllers (lógica)
8. ✅ MANAGERS (ANTES de ConfigManager)
   - ApiKeyManager
   - AudioDeviceManager
   - ModelSelectionManager
   - ScreenConfigManager
   - PrivacyConfigManager
   - WindowUIManager
   - HomeUIManager
   - TopBarManager ← NOVO
   - OtherConfigManager ← NOVO
   - InfoManager ← NOVO
9. ConfigManager (orquestrador)
10. renderer.js (lógica negócio)
```

---

## 📊 MATRIZ DE COBERTURA DE LISTENERS

```
┌─────────────────────────┬─────────────────┬─────────────────┐
│ Evento                  │ Provém de       │ Escutado por    │
├─────────────────────────┼─────────────────┼─────────────────┤
│ opacityUpdated          │ TopBar          │ TopBar (echo)   │
│ windowOpacityUpdate     │ renderer.js     │ TopBar (falta!) │
│                         │                 │ WindowUIManager │
├─────────────────────────┼─────────────────┼─────────────────┤
│ interviewModeChanged    │ TopBar          │ renderer.js     │
│ modeSelectUpdate        │ renderer.js     │ TopBar (novo)   │
├─────────────────────────┼─────────────────┼─────────────────┤
│ screenshotTaken         │ screenshot-ctrl │ TopBar (novo)   │
├─────────────────────────┼─────────────────┼─────────────────┤
│ listenButtonToggled     │ HomeUIManager   │ renderer.js     │
├─────────────────────────┼─────────────────┼─────────────────┤
│ transcriptAdd           │ renderer.js     │ HomeUIManager   │
├─────────────────────────┼─────────────────┼─────────────────┤
│ answerStreamChunk       │ renderer.js     │ HomeUIManager   │
├─────────────────────────┼─────────────────┼─────────────────┤
│ apiKeySaved             │ ApiKeyManager   │ renderer.js     │
├─────────────────────────┼─────────────────┼─────────────────┤
│ darkModeToggled         │ OtherConfigMgr  │ renderer.js     │
│                         │ (novo)          │                 │
├─────────────────────────┼─────────────────┼─────────────────┤
│ clickThroughToggled     │ WindowUIManager │ renderer.js     │
│                         │                 │ sidebar (style) │
└─────────────────────────┴─────────────────┴─────────────────┘
```

---

## ✅ CHECKLIST PRÉ-IMPLEMENTAÇÃO

- [ ] **TopBarManager.js** - Criar esqueleto
- [ ] **OtherConfigManager.js** - Criar esqueleto
- [ ] **InfoManager.js** - Criar esqueleto
- [ ] **WindowUIManager.js** - Refatorar (adicionar btnClose, remover elementos Top Bar)
- [ ] **HomeUIManager.js** - Refatorar (remover btnClose)
- [ ] **index.html** - Adicionar novos scripts na ordem certa
- [ ] **Validar** - Nenhum aviso "Nenhum listener para:" no console
- [ ] **Testar** - Todos os controles funcionam perfeitamente
- [ ] **Review** - Código segue padrão de Managers existentes

---

## 📝 NOTAS IMPORTANTES

1. **Ordem no index.html é crítica:** Todos os Managers devem carregar ANTES de `renderer.js`
2. **Padrão de cada Manager:**
   ```javascript
   class XxxManager {
     constructor(eventBus) {
       this.eventBus = eventBus;
       this.#initListeners();   // ← SEMPRE PRIMEIRO
       this.#initElements();    // ← SEMPRE DEPOIS
     }
     
     #initListeners() {
       // Registrar listeners aqui
     }
     
     #initElements() {
       // Setup DOM aqui
     }
   }
   ```

3. **Cada elemento DOM deve ter um ID único** - Facilita debugging

4. **Listeners ANTES de elementos** - Garante que quando DOM inicia, listeners já estão prontos

5. **Sem race conditions** - A ordem é: Registrar → Montar → Emitir

---

## 🎯 PRÓXIMO PASSO

Aguardando aprovação deste mapeamento para:

1. ✅ Criar esqueletos dos 3 novos Managers
2. ✅ Atualizar index.html com novos scripts
3. ✅ Refatorar WindowUIManager
4. ✅ Validar todos os listeners antes de elementos
5. ✅ Testar e confirmar funcionamento

**Deseja prosseguir com a implementação?**
