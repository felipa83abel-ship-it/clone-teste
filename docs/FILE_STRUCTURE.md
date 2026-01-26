# 📁 Estrutura de Arquivos - AskMe Project

**Data:** Janeiro 2026  
**Status:** ✅ Validado e Documentado  

---

## 🎯 Filosofia de Organização

A estrutura segue estes princípios:

1. **Raiz para Entry Points:** `main.js`, `renderer.js`, `index.html` ficam na raiz (como em qualquer projeto Electron)
2. **Pastas por Conceito:** Agrupadas por responsabilidade (controllers, state, events, etc)
3. **Escalabilidade:** Estrutura suporta crescimento sem refatoração
4. **Clareza:** Alguém novo consegue encontrar código rapidamente

---

## 📊 Estrutura Completa

```
Raiz/
├─ 📄 index.html              (Entry point do renderer)
├─ 📄 main.js                 (Electron main process)
├─ 📄 renderer.js             (Renderer entry point - orquestrador de lógica)
├─ 🎨 styles.css              (Estilos globais)
├─ 📦 package.json            (Dependências e scripts)
├─ .gitignore
├─ jest.config.js
├─ eslint.config.js
│
├─ 📂 controllers/            (Lógica de negócio + UI)
│  ├─ config/
│  │  ├─ ConfigManager.js     (Orquestrador de todos os managers)
│  │  └─ managers/
│  │     ├─ ApiKeyManager.js
│  │     ├─ AudioDeviceManager.js
│  │     ├─ ModelSelectionManager.js
│  │     ├─ ScreenConfigManager.js
│  │     ├─ PrivacyConfigManager.js
│  │     ├─ WindowUIManager.js
│  │     └─ HomeUIManager.js
│  ├─ audio/
│  │  └─ audio-controller.js  (Captura e processamento de áudio)
│  ├─ question/
│  │  └─ question-controller.js (Lógica de perguntas)
│  ├─ screenshot/
│  │  └─ screenshot-controller.js (Captura de tela)
│  └─ modes/
│     └─ mode-manager.js      (Modo INTERVIEW vs NORMAL)
│
├─ 📂 state/                  (Estado central)
│  └─ AppState.js             (Único lugar para estado compartilhado)
│
├─ 📂 events/                 (Comunicação)
│  └─ EventBus.js             (Pub/Sub - canal único)
│
├─ 📂 llm/                    (Orquestração de LLM)
│  ├─ LLMManager.js
│  └─ handlers/
│     └─ openai-handler.js
│
├─ 📂 stt/                    (Speech-to-Text)
│  ├─ stt-whisper.js
│  ├─ stt-deepgram.js
│  ├─ stt-vosk.js
│  ├─ vad-engine.js
│  └─ models-stt/
│
├─ 📂 strategies/             (Strategy pattern)
│  └─ STTStrategy.js          (Abstração de STT providers)
│
├─ 📂 handlers/               (IPC + Event handlers)
│  └─ llmHandlers.js
│
├─ 📂 utils/                  (Utilities)
│  ├─ Logger.js               (Logging centralizado)
│  ├─ ErrorHandler.js
│  ├─ SecureLogger.js
│  ├─ DOM-Registry.js         (Registro centralizado de elementos)
│  ├─ ui-elements-registry.js
│  ├─ renderer-helpers.js
│  └─ (outras utilidades)
│
├─ 📂 audio/                  (Audio worklets)
│  ├─ volume-audio-monitor.js
│  └─ volume-audio-worklet-processor.js
│
├─ 📂 types/                  (Tipos TypeScript/JSDoc)
│  ├─ globals.d.ts
│  └─ (definições)
│
├─ 📂 docs/                   (Documentação)
│  ├─ ARCHITECTURE_FINAL.md   (Arquitetura final ✅)
│  ├─ START_HERE.md
│  ├─ FEATURES.md
│  ├─ TESTING_INDEX.md
│  └─ (mais documentação)
│
├─ 📂 __tests__/              (Testes)
│  ├─ unit/                   (Testes unitários)
│  ├─ integration/            (Testes de integração)
│  └─ e2e/                    (Testes E2E com Playwright)
│
└─ 📂 temp/                   (Temporário - não commita)
   └─ (notas, planejamento, etc)
```

---

## 🎯 Quando Adicionar Em Cada Pasta?

### 1. `controllers/`

**O quê:** Lógica de negócio + Manipulação de UI

**Quando adicionar:**
- Nova funcionalidade (ex: "screenshot controller")
- Novo tipo de configuração (ex: novo Manager)

**Exemplo:** Novo feature de "Recording"
```javascript
// controllers/recording/recording-controller.js
class RecordingController {
  async startRecording() { ... }
}
```

### 2. `state/`

**O quê:** Estado compartilhado (único lugar)

**Quando adicionar:**
- Novo estado que é compartilhado entre múltiplos places
- Histórico de transações
- Configurações carregadas do disco

**Exemplo:** Se cria novo `appState.recordingState`
```javascript
// Adicione em AppState.js:
this.recordingState = {
  isRecording: false,
  duration: 0,
};
```

### 3. `events/`

**O quê:** Comunicação pub/sub

**Quando adicionar:**
- Novo tipo de evento global
- Novo padrão de comunicação

**Nota:** Em 99% dos casos, simplesmente use `eventBus.emit()` e `on()` do EventBus existente.

### 4. `llm/`

**O quê:** Orquestração de modelos de linguagem

**Quando adicionar:**
- Novo provider de LLM (ex: Claude, Cohere)
- Novo handler especializado

**Exemplo:** Novo provider
```javascript
// llm/handlers/claude-handler.js
class ClaudeHandler {
  async complete(prompt) { ... }
}
```

### 5. `stt/`

**O quê:** Speech-to-Text

**Quando adicionar:**
- Novo provider de STT (ex: Google Cloud STT)
- Nova estratégia de processamento

### 6. `utils/`

**O quê:** Funções auxiliares genéricas

**Quando adicionar:**
- Helper functions (formatação, validação)
- Wrappers (Logger, ErrorHandler)
- Registros centralizados (DOM-Registry)

**Guideline:** Se é usado em múltiplos places, coloca aqui.

### 7. `audio/`

**O quê:** Web Audio API worklets e processadores

**Quando adicionar:**
- Novo processador de áudio
- Novo tipo de análise (pitch, frequency, etc)

### 8. `docs/`

**O quê:** Documentação

**Quando adicionar:**
- Novos guias (ARCHITECTURE_NEW_FEATURE.md)
- Atualizações de documentação existente

---

## ⚠️ Lugares Importantes (NÃO mude!)

### ✅ `renderer.js` - SEMPRE NA RAIZ

**Por quê:** É o entry point do renderer process. Mudar quebra imports.

```javascript
// Correto - index.html aponta para raiz
<script src="./renderer.js"></script>

// ❌ ERRADO - não faça isso:
<script src="./src/renderer/renderer.js"></script>
```

### ✅ `index.html` - SEMPRE NA RAIZ

**Por quê:** Electron procura por essa localização padrão.

### ✅ `main.js` - SEMPRE NA RAIZ

**Por quê:** Electron main process aponta para aqui.

---

## 📝 Regras de Organização

### 1. Um Arquivo = Uma Classe (na maioria dos casos)

```javascript
// ✅ CORRETO:
// controllers/config/managers/AudioDeviceManager.js
class AudioDeviceManager { ... }
module.exports = AudioDeviceManager;

// ❌ EVITAR:
// controllers/config/managers/AllManagers.js
class AudioDeviceManager { ... }
class ModelManager { ... }  // Misturar não é bom
```

### 2. Arquivos de Suporte Ficam Perto

```
controllers/
├─ question/
│  ├─ question-controller.js   (Principal)
│  └─ question-helpers.js      (Suporte)
```

### 3. Testes Espelham Estrutura

```
controllers/question/question-controller.js
__tests__/unit/QuestionController.test.js

controllers/config/ConfigManager.js
__tests__/unit/ConfigManager.test.js
```

### 4. Nomes Descritivos

```javascript
// ✅ BOM:
AudioDeviceManager.js
TranscriptionController.js
STTStrategy.js

// ❌ RUIM:
manager.js
controller.js
strategy.js
```

---

## 🔄 Fluxo de Uma Nova Feature

Exemplo: Adicionar "Dark Mode Toggle"

### 1. Criar Manager (se não existe)

```javascript
// controllers/config/managers/ThemeManager.js
class ThemeManager {
  async initialize() {
    this.eventBus.on('themeToggled', ({ theme }) => {
      document.documentElement.setAttribute('data-theme', theme);
    });
  }
}
```

### 2. Adicionar em ConfigManager

```javascript
// controllers/config/ConfigManager.js
this.managers = [
  this.themeManager = new ThemeManager(...),
  // ...
];
```

### 3. Adicionar Elemento em DOM-Registry

```javascript
// utils/DOM-Registry.js
selectors: {
  darkModeToggle: '#darkModeToggle',
}
```

### 4. Adicionar em index.html

```html
<input type="checkbox" id="darkModeToggle" />
```

### 5. Emitir Evento do Renderer

```javascript
// renderer.js
DOM.get('darkModeToggle').addEventListener('change', (e) => {
  eventBus.emit('themeToggled', { theme: e.target.checked ? 'dark' : 'light' });
});
```

### 6. Testar

```bash
npm start
# Verificar que theme muda
npm test
# Adicionar testes unitários
```

---

## ✨ Padrão de Pasta Recomendado

Para **pastas grandes** como `controllers/`, organize por **conceito**:

```
controllers/
├─ audio/           (Tudo relacionado a áudio)
├─ config/          (Configurações)
├─ question/        (Perguntas)
├─ screenshot/      (Screenshots)
├─ modes/           (Modos INTERVIEW/NORMAL)
└─ (novas funcionalidades)
```

Para **cada conceito**, mantenha junto:

```
controllers/audio/
├─ audio-controller.js     (Principal)
├─ audio-helpers.js        (Funções auxiliares)
└─ audio-constants.js      (Constantes)
```

---

## 📚 Hierarquia de Imports

Estabeleça uma ordem clara para evitar circular dependencies:

```javascript
// ORDEM RECOMENDADA:

// 1. Utilities (não dependem de nada)
const Logger = require('../utils/Logger.js');
const DOM = require('../utils/DOM-Registry.js');

// 2. State & Events (dependem de utilities)
const AppState = require('../state/AppState.js');
const EventBus = require('../events/EventBus.js');

// 3. Estratégias (dependem de state/events)
const STTStrategy = require('../strategies/STTStrategy.js');

// 4. Controllers (dependem de estratégias)
const AudioController = require('../controllers/audio/audio-controller.js');

// 5. Managers (dependem de controllers)
const ApiKeyManager = require('../controllers/config/managers/ApiKeyManager.js');

// 6. ConfigManager (depend de managers)
const ConfigManager = require('../controllers/config/ConfigManager.js');
```

---

## 🎯 Decisões Arquitecturais

### Por que `renderer.js` fica na raiz?

- ✅ Entry point como `main.js`
- ✅ Fácil encontrar (quem procura, vai na raiz primeiro)
- ✅ Padrão da comunidade Electron
- ✅ Simples

### Por que não colocar tudo em `src/`?

- ❌ Adiciona nesting desnecessário
- ❌ Não é padrão Electron
- ❌ `src/renderer/src/renderer.js` fica ridículo

### Por que `temp/` não é commited?

```
.gitignore:
temp/
```

- 📝 Usado para notas, planejamento, testes locais
- 🚀 Não afeta produção
- ♻️ Limpeza periódica

---

## ✅ Checklist Antes de Commitar

- [ ] Arquivo está no lugar certo?
- [ ] Nome é descritivo?
- [ ] Não há duplicação?
- [ ] Imports seguem a hierarquia?
- [ ] Existe teste correspondente?
- [ ] Documentação foi atualizada?

---

## 📞 Contato & Dúvidas

Se não sabe onde colocar algo:

1. **É lógica de negócio?** → `controllers/`
2. **É estado compartilhado?** → `state/`
3. **É função auxiliar?** → `utils/`
4. **É comunicação?** → `events/`
5. **É teste?** → `__tests__/`

Dúvidas? Veja [ARCHITECTURE_FINAL.md](ARCHITECTURE_FINAL.md)

---

**Última atualização:** Janeiro 2026  
**Status:** ✅ Validado  

