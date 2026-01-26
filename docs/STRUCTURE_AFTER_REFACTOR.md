# Organização de Arquivos - Decisões Arquiteturais (PHASE 10.9)

## 📋 Objetivo

Documentar as decisões sobre organização de arquivos no projeto AskMe pós-refatoração PHASE 10.

---

## 1. Decisão: renderer.js fica na raiz do projeto

### Decisão
✅ **renderer.js PERMANECE na raiz** (`/renderer.js`) e NÃO é movido para uma pasta.

### Razão
1. **Padrão Electron:** `renderer.js` é o entry point padrão do Electron para o renderer process
2. **Convenção do Projeto:** Já existe em raiz desde o início
3. **Impacto Mínimo:** Mover para pasta teria impacto em:
   - Múltiplas referências em `index.html` (`<script src>`)
   - Possíveis relativos em `require()` statements
   - Configuração do bundler/build
4. **Clareza:** Deixar em raiz deixa claro que é entry point especial
5. **Documentação:** Este arquivo (PHASE 10.9) documenta a decisão

### Alternativa Rejeitada
```javascript
// ❌ Rejected:
// src/renderer.js ou controllers/renderer.js
// Reason: Violaria convenção Electron + impacto muito grande
```

### Estrutura Aprovada
```
project-root/
├── renderer.js ← AQUI (not moved)
├── main.js
├── index.html
├── controllers/
│   ├── config/
│   ├── modes/
│   ├── audio/
│   ├── question/
│   └── screenshot/
├── state/
├── events/
├── llm/
├── stt/
├── utils/
├── handlers/
├── audio/
├── strategies/
└── styles.css
```

---

## 2. Estrutura de Pastas - Racionalidade

### 2.1 Raiz (`/`)

| Arquivo | Razão |
|---------|-------|
| `renderer.js` | Electron entry point para renderer process |
| `main.js` | Electron entry point para main process |
| `index.html` | Estrutura HTML da aplicação |
| `styles.css` | Estilos globais |
| `package.json` | Configuração npm |
| `jest.config.js` | Configuração de testes |
| `eslint.config.js` | Configuração de linting |

### 2.2 Controllers (`/controllers/`)

**Objetivo:** Coordenadores de domínio específico

```
controllers/
├── config/
│   ├── ConfigManager.js          ← Orquestrador principal
│   └── managers/
│       ├── HomeManager.js         ← HOME tab UI (PHASE 10.1 foco)
│       ├── ApiKeyManager.js       ← API keys config
│       ├── AudioDeviceManager.js  ← Audio device selection
│       ├── ModelSelectionManager.js ← STT/LLM model choice
│       ├── ScreenConfigManager.js ← Screenshot settings
│       ├── PrivacyConfigManager.js ← Privacy & retention
│       └── WindowConfigManager.js ← Window behavior
│
├── modes/
│   └── mode-manager.js           ← Interview vs Normal mode logic
│
├── audio/
│   └── audio-controller.js       ← Audio capture & processing
│
├── question/
│   └── question-controller.js    ← Question consolidation logic
│
└── screenshot/
    └── screenshot-controller.js  ← Screenshot capture logic
```

**Justificativa:**
- Controllers = "smart" components que orquestram lógica
- Managers = Especialistas em um domínio específico
- Config path = Configurações centralizadas
- Modes path = Lógica de modos (entrevista vs normal)
- Especializados (audio, question, screenshot) = Organização clara por funcionalidade

### 2.3 State Management (`/state/`)

```
state/
└── AppState.js  ← Singleton state container
    ├── interview: { currentQuestion, history }
    ├── audio: { isRunning, volume, device }
    └── screenshot: { count, format }
```

**Justificativa:** Separa state data da lógica (MVC pattern)

### 2.4 Event Bus (`/events/`)

```
events/
└── EventBus.js  ← Singleton pub/sub dispatcher
    ├── on()     ← Subscribe
    ├── emit()   ← Publish
    └── off()    ← Unsubscribe
```

**Justificativa:** Único lugar para padrão pub/sub

### 2.5 Speech-to-Text (`/stt/`)

```
stt/
├── STTStrategy.js              ← Strategy pattern abstração
├── stt-deepgram.js             ← Deepgram provider
├── stt-vosk.js                 ← Vosk provider
├── stt-whisper.js              ← Whisper provider
├── vad-engine.js               ← Voice Activity Detection
├── stt-audio-worklet-processor.js ← Web Audio API processor
└── models-stt/                 ← Modelos treinados (Vosk)
```

**Justificativa:** 
- Estratégia completa para STT em uma pasta
- Múltiplos providers separados por arquivo
- Nenhuma mistura com LLM ou outros domínios

### 2.6 LLM (`/llm/`)

```
llm/
├── LLMManager.js               ← Gerenciador de LLM
├── handlers/
│   ├── openai-handler.js       ← OpenAI API wrapper
│   └── gemini-handler.js       ← Google Gemini wrapper
└── (future: other-provider-handler.js)
```

**Justificativa:**
- Separação clara entre STT e LLM
- Handlers como plugins para diferentes providers
- LLMManager = orquestrador

### 2.7 Handlers (`/handlers/`)

```
handlers/
└── llmHandlers.js  ← Utilitários para requisições LLM
    ├── validateLLMRequest()
    ├── handleLLMStream()
    └── handleLLMBatch()
```

**Justificativa:** Funções auxiliares que renderer.js usa

### 2.8 Audio (`/audio/`)

```
audio/
├── volume-audio-monitor.js  ← Monitoramento de volume (input/output)
└── volume-audio-worklet-processor.js ← Web Audio Worklet processor
```

**Justificativa:**
- Separado de STT (que é captura e transcrição)
- Audio monitor = apenas medição de volume
- Complementar ao STT

### 2.9 Utilities (`/utils/`)

```
utils/
├── Logger.js           ← Structured logging com níveis
├── SecureLogger.js     ← Logger que mascara senhas/chaves
├── ErrorHandler.js     ← Error handling centralizadoerrores
├── renderer-helpers.js ← Funções auxiliares do renderer
├── ui-elements-registry.js ← (Legacy, ser substituído por DOM-Registry.js)
└── DOM-Registry.js     ← [NEW PHASE 10.8] Seletores centralizados
```

**Justificativa:**
- Utils = funções puramente utilitárias, sem lógica de negócio
- Logger = crítico para debugging
- DOM-Registry = centraliza seletores (PHASE 10.8)

### 2.10 Strategies (`/strategies/`)

```
strategies/
└── STTStrategy.js  ← Strategy pattern abstração para STT
    ├── selectProvider()
    ├── startCapture()
    ├── stopCapture()
    └── switchDevice()
```

**Justificativa:** Design pattern para swappable STT providers

### 2.11 Types (`/types/`)

```
types/
├── globals.d.ts        ← TypeScript global declarations
└── fluent-ffmpeg.d.ts  ← FFmpeg TypeScript definitions
```

**Justificativa:** Suporte a TypeScript (via JSDoc + type checking)

### 2.12 Tests (`/__tests__/`)

```
__tests__/
├── unit/                      ← Testes de unidades individuais
│   ├── EventBus.test.js
│   ├── AppState.test.js
│   ├── ModeManager.test.js
│   └── fix-current-stuck.test.js
├── integration/                ← Testes de integração entre sistemas
│   └── core-systems.integration.test.js
└── e2e/                        ← Testes end-to-end (Playwright)
    ├── happy-path.test.js
    ├── reset-history.test.js
    ├── README.md
    └── helpers.js
```

**Justificativa:** Jest padrão de organização (unit/integration/e2e)

### 2.13 Documentation (`/docs/`)

```
docs/
├── ARCHITECTURE.md                  ← Original architecture
├── ARCHITECTURE_REFACTORED.md       ← [PHASE 10.7] Refactored
├── STRUCTURE_AFTER_REFACTOR.md      ← This file (PHASE 10.9)
├── START_HERE.md                    ← Getting started guide
├── FEATURES.md                      ← Feature list
├── BUNDLE_OPTIMIZATION.md           ← Build optimization
├── SECURITY_AUDIT.md                ← Security review
├── FLUXO_FALA_SILENCIO.md          ← Speech/silence flow
├── TESTING_INDEX.md                 ← Test documentation
├── TEST_API_MODELS.md               ← API model testing
├── TEST_AUDIO_SCREEN.md             ← Audio/screenshot testing
├── TEST_HOME.md                     ← Home tab testing
├── TEST_PRIVACY.md                  ← Privacy testing
├── TEST_OTHER.md                    ← Other tests
├── MELHORIAS_ERROR_HANDLING.md      ← Error handling improvements
├── transcription_flow_deepgram.md   ← Deepgram flow
├── transcription_flow_other_models.md ← Other STT models
└── DOCS_GUIDE.md                    ← This documentation
```

**Justificativa:** Documentação centralizada por categoria

### 2.14 Configuration (`/`)

```
jest.config.js      ← Jest testing framework config
eslint.config.js    ← ESLint code quality rules
jsconfig.json       ← JavaScript project config (IDE hints)
package.json        ← npm dependencies & scripts
playwright.config.js ← E2E test framework config
```

**Justificativa:** Padrão npm/JavaScript

---

## 3. Padrões de Organização

### 3.1 Domain-Driven Layout

Cada pasta representa um **domínio** ou **responsabilidade**:

```
stt/          ← Domain: Speech-to-text
│   ├── STTStrategy.js          (abstração)
│   ├── stt-deepgram.js         (implementação 1)
│   ├── stt-vosk.js             (implementação 2)
│   └── stt-whisper.js          (implementação 3)

llm/          ← Domain: Large Language Models
│   ├── LLMManager.js           (orquestrador)
│   └── handlers/
│       ├── openai-handler.js   (provider 1)
│       └── gemini-handler.js   (provider 2)

state/        ← Domain: State Management
│   └── AppState.js

events/       ← Domain: Event Bus
│   └── EventBus.js
```

**Benefício:** Fácil encontrar código relacionado

### 3.2 Manager Pattern

Todos os managers seguem padrão consistente:

```javascript
// controllers/config/managers/CustomManager.js
class CustomManager {
  constructor(configManager, ipc, eventBus) { }
  async initialize() { }
  async reset() { }
}
```

**Benefício:** Previsibilidade, facilita manutenção

### 3.3 No Deep Nesting

```
// ✅ OK (3 níveis)
controllers/config/managers/HomeManager.js

// ❌ AVOID (5+ níveis)
controllers/config/managers/home/ui/elements/button/submit.js
```

**Razão:** Dificulta navegação, import paths ficam longos

---

## 4. Decisões Sobre Nomes de Arquivos

### 4.1 Padrão de Nomenclatura

| Padrão | Exemplo | Razão |
|--------|---------|-------|
| `PascalCase` para classes | `HomeManager.js`, `EventBus.js` | Classes são construtores |
| `kebab-case` para funções/utilidades | `stt-deepgram.js`, `volume-audio-monitor.js` | Funções são comportamento, não objetos |
| `camelCase` para variáveis/exports | `appState`, `eventBus` | Instâncias singleton |

### 4.2 Sufixos Comuns

| Sufixo | Significado | Exemplo |
|--------|------------|---------|
| `-manager` | Gerencia um domínio | `HomeManager.js` |
| `-handler` | Trata eventos/requisições | `openai-handler.js` |
| `-strategy` | Strategy pattern | `STTStrategy.js` |
| `-worklet` | Web Audio API worklet | `volume-audio-worklet-processor.js` |
| `-monitor` | Monitora estado | `volume-audio-monitor.js` |
| `-controller` | Controla um fluxo | `audio-controller.js` |

---

## 5. Imports & Dependencies

### 5.1 Imports - Padrão Respeitado

```javascript
// ✅ OK: Arquivo carrega dependências via require()
const EventBus = require('./events/EventBus.js');
const Logger = require('./utils/Logger.js');

// ✅ OK: Manager injetado com dependências via constructor
const manager = new HomeManager(configManager, ipc, eventBus);

// ❌ AVOID: Acesso direto a globals não injetados
const appState = globalThis.appState; // Se não foi injetado no constructor

// ❌ AVOID: Imports circulares
// A importa B, B importa A
```

### 5.2 Dependency Injection

**Princípio:** Nunca criar dependências dentro da classe, sempre injetar:

```javascript
// ❌ WRONG
class HomeManager {
  constructor(config) {
    this.eventBus = new EventBus(); // Cria sua própria instância
  }
}

// ✅ CORRECT
class HomeManager {
  constructor(configManager, ipc, eventBus) {
    this.eventBus = eventBus; // Injected singleton
  }
}
```

---

## 6. File Sizes & Organization Targets

### 6.1 Objetivo de Tamanho de Arquivo

| Arquivo | Tamanho Ideal | Razão |
|---------|--------------|-------|
| renderer.js | 1000-1500 linhas | Entry point complexo, mas legível |
| Manager classes | 400-600 linhas | Especialista em um domínio |
| Handler classes | 100-300 linhas | Focado em uma tarefa |
| Utility functions | 50-150 linhas | Pequenas, reusáveis |

### 6.2 HomeManager.js (PHASE 10)

```
Original:    388 linhas
After PHASE 10.1: 588 linhas
Target:      ≤ 700 linhas (aceitável para seu tamanho complexo)

Razão: HomeManager é complexo (10 listeners + 6 init methods)
```

---

## 7. Migrations & Refactoring Guidelines

### 7.1 Se Adicionar Nova Funcionalidade

```
1. Determine o domínio (STT, LLM, Audio, etc)
2. Crie pasta se não existir: /novo-dominio/
3. Siga padrão manager (constructor, initialize, reset)
4. Registre em ConfigManager.initializeController()
5. Injete dependências via constructor
6. Use EventBus para comunicação
```

### 7.2 Se Mover Arquivo

```
❌ NEVER:  Mover renderer.js (quebra tudo)
           Alterar raiz sem discussão

✅ OK:     Reorganizar dentro de /controllers/
           Criar nova pasta de domínio
           Renomear manager conforme naming patterns
```

### 7.3 Se Remover Arquivo

```
1. Verificar se tem dependências: grep -r "arquivo.js"
2. Atualizar todos os imports
3. Remover referências de ConfigManager
4. Remover de index.html (se script tag)
5. Atualizar documentação
```

---

## 8. CI/CD & Build Considerations

### 8.1 Script Loading Order (index.html)

**CRÍTICO:** Ordem é importante!

```html
<!-- 1. renderer.js first (creates globals) -->
<script src="./renderer.js"></script>

<!-- 2. Managers (use globals) -->
<script src="./controllers/config/managers/*.js"></script>

<!-- 3. ConfigManager (initializes all) -->
<script src="./controllers/config/ConfigManager.js"></script>
```

### 8.2 Bundling Implications

```javascript
// Se migrar para webpack/vite no futuro:
// - Remove direct <script> tags
// - Usa import/require statements
// - Bundler resolve ordem automaticamente
```

---

## 9. Anti-Patterns (O que EVITAR)

### 9.1 ❌ Circular Dependencies

```javascript
// files.js imports b.js
// b.js imports a.js (circular!)
```

### 9.2 ❌ Global Pollution

```javascript
// window.myGlobal = value  ← BAD
// globalThis.configManager = new ConfigManager() ← CONTROLLED (OK)
```

### 9.3 ❌ Mixing Responsibilities

```javascript
// ❌ HomeManager making API calls
// ✅ HomeManager calling renderer.js methods that make API calls
```

### 9.4 ❌ Deep File Nesting

```
// ❌
controllers/config/managers/home/ui/elements/helpers/button.js

// ✅
controllers/config/managers/HomeManager.js
utils/ui-helpers.js
```

---

## 10. Documentation for Each Folder

### 10.1 Each Folder Should Have README (Future)

```
controllers/config/managers/README.md
├─ Explica o que cada manager faz
├─ Como criar novo manager
└─ Padrão que todos seguem

stt/README.md
├─ Explica estratégia de STT
├─ Como adicionar novo provider
└─ API de STTStrategy

llm/README.md
├─ Explica LLM orchestration
├─ Como adicionar novo provider
└─ API de LLMManager
```

**(Nota: Não foram criados neste sprint, mas recomendado para futuro)**

---

## 11. Summary & Checklist

### 11.1 File Organization Checklist

- [x] renderer.js stays in root
- [x] Controllers organized by domain
- [x] Managers follow consistent pattern
- [x] No deep file nesting (max 3-4 levels)
- [x] EventBus is sole communication channel
- [x] Dependencies injected via constructor
- [x] Tests organized unit/integration/e2e
- [x] Documentation co-located with code
- [x] No circular dependencies
- [x] Naming patterns consistent

### 11.2 Key Decisions Made

| Decision | Status | Notes |
|----------|--------|-------|
| renderer.js stays in root | ✅ Approved | Electron convention |
| Domain-driven layout | ✅ Approved | Clear organization |
| Manager pattern | ✅ Approved | Consistent, reusable |
| EventBus as single channel | ✅ Approved | Loose coupling |
| Dependency injection | ✅ Approved | No hidden deps |
| File naming patterns | ✅ Approved | Clear intent |

---

## Conclusion

**File organization in AskMe is:**
- ✅ **Consistent** - Patterns applied across all files
- ✅ **Maintainable** - Easy to find and modify code
- ✅ **Scalable** - New features can be added without restructuring
- ✅ **Documented** - This document & inline comments
- ✅ **Following Best Practices** - Domain-driven, separation of concerns

**No further reorganization recommended at this time.**

---

**Document Version:** 1.0 (PHASE 10.9)  
**Date:** January 24, 2025  
**Status:** ✅ Complete
