# 📋 CHECKLIST DE REFATORAÇÃO - RENDERER.JS

**Status:** 🔵 Planejamento  
**Última atualização:** 23 de janeiro de 2026  
**Responsável:** Análise Completa do Projeto

---

## 📊 RESUMO EXECUTIVO

- **Arquivo principal:** `renderer.js` (2106 linhas)
- **Objetivo:** Reduzir para ~1600 linhas, melhorar legibilidade e manutenibilidade
- **Benefício:** -24% de código, melhor separação de responsabilidades
- **Risco:** Baixo a Médio (já funciona bem, mudanças são refatoração pura)

---

## 📋 DIRETRIZES DE EXECUÇÃO

- ✅ **Cada fase/tópico terá seu próprio commit** - facilita rastreamento e rollback
- ✅ **Cada `npm start` será acompanhado de `time npm start`** - monitora impacto de performance
- ✅ **Nenhum arquivo .md será criado sem solicitação** - evitar documentação desnecessária
- ✅ **Revisar documentação existente se precisa atualização** - manter docs sincronizadas

---

## 🔴 PROBLEMAS DETECTADOS

### 1️⃣ Estado Global Solto (CRÍTICO)

- [x] `let currentQuestion = { ... }`
- [x] `let questionsHistory = []`
- [x] `let answeredQuestions = new Set()`
- [x] `let isRunning = false`
- [x] `let capturedScreenshots = []`
- [x] `let isDraggingWindow = false`
- [x] `let interviewTurnId = 0`
- [x] `let gptAnsweredTurnId = null`
- [x] `let gptRequestedTurnId = null`
- [x] `let gptRequestedQuestionId = null`
- [x] `let lastAskedQuestionNormalized = null`
- [x] `let selectedQuestionId = null`
- [x] `let isCapturing = false`
- [x] `let isAnalyzing = false`
- [x] `let mockAutoPlayActive = false`
- [x] `let mockScenarioIndex = 0`

**Status:** `AppState` foi criado mas NÃO está sendo usado. Há DOIS sistemas de estado.

---

### 2️⃣ Sistema de Eventos Duplicado

- [x] `UICallbacks` object (20+ properties) - ainda em uso
- [x] `EventBus` class - também em uso
- [x] Ambos paralelos causando confusão

**Exemplo de redundância:**

```javascript
// Isto existe:
const UICallbacks = { onError: null, onTranscriptAdd: null, ... }
emitUIChange('onCurrentQuestionUpdate', data)

// Isto também existe:
eventBus.on('audioDeviceChanged', ...)
eventBus.emit('answerStreamChunk', ...)
```

---

### 3️⃣ Logger Desatualizado (ALTO IMPACTO)

- [x] `debugLogRenderer()` definida mas com ~200+ chamadas espalhadas
- [x] `Logger` class criada mas subutilizada
- [x] Dois sistemas de logging em paralelo

**Linhas afetadas:** ~200-250

---

### 4️⃣ Funções Mortas / Não Utilizadas

- [x] `promoteCurrentToHistory(text)` - nunca chamada, lógica duplicada inline (3+ lugares)
- [x] `getNavigableQuestionIds()` - definida, nunca usada
- [x] `restartAudioPipeline()` - função incompleta, apenas chama `stopAudio()`
- [x] `releaseThread()` - **DUPLICADA (linha 1409 e 1544)**

---

### 5️⃣ Código Mock Pesado Inline

- [x] `MOCK_RESPONSES` object (~20 respostas)
- [x] `MOCK_SCENARIOS` array (~6 cenários)
- [x] `getMockResponse(question)` function
- [x] `ipcRenderer.invoke` interceptor global (HACKY!)
- [x] `runMockAutoPlay()` function (~400 linhas!)

**Impacto:** ~500+ linhas de código que NUNCA deveria estar em produção

**Problemas:**

- Intercepta `ipcRenderer.invoke` globalmente
- Fica no bundle de produção
- Difícil remover sem quebrar código
- Chamadas `handleSpeech()` e `closeCurrentQuestion()` que não existem

---

### 6️⃣ Lógica de Modo Duplicada

- [x] `ModeController.isInterviewMode()` chamada em 4+ lugares
- [x] Lógica de modo espalhada entre:
  - `askLLM()`
  - `handleQuestionClick()`
  - `finalizeCurrentQuestion()`
  - `handleCurrentQuestion()`

**Resultado:** Mudanças de modo precisam atualizar 4+ lugares

---

### 7️⃣ UIElements Object Incompleto

- [x] `UIElements` com 15+ properties
- [x] Muitos são `null` e nunca preenchidos
- [x] Sem validação se foram registrados

---

### 8️⃣ Constantes Não Utilizadas

- [x] `USE_FAKE_STREAM_GPT` em `main.js` - **SERÁ MANTIDO** para economizar crédito da API
  - Não será removido ou alterado
  - Está em uso para exibir respostas mock sem consumir API
  - Mantém comportamento atual

---

### 9️⃣ Compatibilidade Obsoleta

- [x] `onUIChange('onAudioDeviceChanged', ...)` - compatibilidade antiga
- [x] Mapeia direto para `eventBus.emit('audioDeviceChanged', ...)`
- [x] Necessário? Não, pode ser removido

---

### 🔟 Chamadas de Função Inexistentes

- [x] `handleSpeech(OTHER, scenario.question, ...)` - **NÃO EXISTE** em renderer.js
- [x] `closeCurrentQuestion()` - **NÃO EXISTE** em renderer.js
- [x] Mock não roda por causa disso!

---

## 🔧 SOLUÇÕES POR FASE

### FASE 1: LIMPEZA RÁPIDA (1-2 horas)

**Risco:** Baixo | **Impacto:** Alto | **Dependências:** Nenhuma

#### 1.1 Remover `debugLogRenderer()` Completamente

- [x] Estender `Logger.js` com suporte a flag show/hide (3º parâmetro)
  ```javascript
  static debug(message, data = {}, show = false) {
      if (!show) return; // Não loga se show === false
      this.log(this.levels.DEBUG, message, data);
  }
  ```
- [x] Substituir todas as ~200 chamadas `debugLogRenderer(...)` por `Logger.debug(...)`
- [x] Deletar função `debugLogRenderer()` (~30 linhas)
- [x] Manter compatibilidade: parâmetro `true/false` no final para controlar exibição

**Regra:**

```javascript
// De:
debugLogRenderer('Início da função: "handleQuestionClick"');
debugLogRenderer('currentQuestion:', { ...currentQuestion }, false);

// Para:
Logger.debug('handleQuestionClick iniciada');
Logger.debug('currentQuestion:', { ...currentQuestion }, false); // não mostra
Logger.debug('currentQuestion:', { ...currentQuestion }, true); // mostra
```

**Benefício:** Mesma interface que `debugLogRenderer`, centralizada em `Logger`

**Commit:** ✅ `f158749` - refactor(phase-1.1): remover debugLogRenderer e centralizar logging em Logger

- [x] Verificar: `time npm start` (43 segundos)

#### 1.2 Remover `releaseThread()` Duplicada

- [x] Manter apenas 1 definição de `releaseThread()` (linha 1409)
- [x] Remover a 2ª definição (linha 1544)
- [x] Linhas a remover: ~4

**Commit:** ✅ `b1c5737` - refactor(phase-1.2): remover releaseThread duplicada

- [x] Verificar: `time npm start`

#### 1.3 Isolar MOCK em Arquivo Separado

- [x] Criar `mock-runner.js` novo
- [x] Mover `MOCK_RESPONSES` object
- [x] Mover `MOCK_SCENARIOS` array
- [x] Mover `getMockResponse(question)` function
- [x] Mover `runMockAutoPlay()` function (~400 linhas)
- [x] Mover `ipcRenderer.invoke` interceptor
- [x] Deletar tudo do renderer.js
- [x] Linhas removidas do renderer: ~500
- [x] Arquivo novo: `mock-runner.js` (~500 linhas)

**Commit:** ✅ `8a4578b` - refactor(phase-1.3): isolar código mock em mock-runner.js

- [x] Verificar: `time npm start` (24 segundos)

#### 1.4 Remover Funções Mortas

- [x] Remover `promoteCurrentToHistory(text)` - já tem lógica inline
  - Linhas a remover: ~80
- [x] Remover `getNavigableQuestionIds()` - nunca chamada
  - Linhas a remover: ~10
- [x] Remover `restartAudioPipeline()` - incompleta
  - Linhas a remover: ~10
- [x] Remover compatibilidade obsoleta: `onUIChange('onAudioDeviceChanged', ...)`
  - Linhas a remover: ~5

**Commit:** ✅ `6e53f1c` - refactor(phase-1.4): remover funções mortas e compatibilidade obsoleta

- [x] Verificar: `time npm start` (11 segundos)
- [x] ✅ Revisar ARCHITECTURE.md e DOCS_GUIDE.md se mencionam essas funções (não mencionam)

**Total Fase 1:** ~400-450 linhas removidas

---

### FASE 2: CONSOLIDAÇÃO DE ESTADO (2-3 horas)

**Risco:** Médio | **Impacto:** Muito Alto | **Dependências:** Fase 1

#### 2.1 Migrar Estado Global para AppState

- [x] Remover `let currentQuestion = { ... }`
  - Usar: `appState.interview.currentQuestion`
- [x] Remover `let questionsHistory = []`
  - Usar: `appState.interview.questionsHistory`
- [x] Remover `let answeredQuestions = new Set()`
  - Usar: `appState.interview.answeredQuestions`
- [x] Remover `let isRunning = false`
  - Usar: `appState.audio.isRunning`
- [x] Remover `let capturedScreenshots = []`
  - Usar: `appState.audio.capturedScreenshots`
- [x] Remover `let isDraggingWindow = false`
  - Usar: `appState.window.isDraggingWindow`
- [x] Remover `let interviewTurnId = 0`
  - Usar: `appState.interview.interviewTurnId`
- [x] Remover `let gptAnsweredTurnId = null`
  - Usar: `appState.interview.gptAnsweredTurnId`
- [x] Remover `let gptRequestedTurnId = null`
  - Usar: `appState.interview.gptRequestedTurnId`
- [x] Remover `let gptRequestedQuestionId = null`
  - Usar: `appState.interview.gptRequestedQuestionId`
- [x] Remover `let lastAskedQuestionNormalized = null`
  - Usar: `appState.interview.lastAskedQuestionNormalized`
- [x] Remover `let selectedQuestionId = null`
  - Usar: `appState.interview.selectedQuestionId`
- [x] Remover `let isCapturing = false`
  - Usar: `appState.audio.isCapturing`
- [x] Remover `let isAnalyzing = false`
  - Usar: `appState.audio.isAnalyzing`
- [x] Remover `let mockAutoPlayActive = false` (depois deletado em Fase 1)
  - Não migrar - deletar
- [x] Remover `let mockScenarioIndex = 0` (depois deletado em Fase 1)
  - Não migrar - deletar

**Commit:** ✅ `74978c3` - refator(fase-2.1): migrar 14 variáveis globais para AppState e adicionar getters/setters

- [x] Verificar: `timeout 30 npm start` ✅ OK
- [x] 192 referências atualizadas com sucesso
- [x] Nenhum erro de runtime detectado

#### 2.2 Estender AppState com Getter/Setter

- [x] Adicionar getters/setters compatíveis em AppState para todas as 14 variáveis
- [x] Permitir transição suave: `isRunning = true` → `appState.isRunning = true` (e vice-versa via getters)

**Status:** ✅ Implementado no commit `74978c3` (AppState.js expandida com 120+ linhas de getters/setters)

- [x] Verificar: `timeout 30 npm start` ✅ OK

#### 2.3 Atualizar Referências (MUITOS LUGARES!)

- [ ] `currentQuestion.text` → `appState.interview.currentQuestion.text` (ou via getter: `appState.currentQuestion.text`)
- [ ] `questionsHistory.push(...)` → `appState.addToHistory(...)`
- [ ] `answeredQuestions.has(id)` → `appState.hasAnswered(id)`
- [ ] `isRunning` → `appState.isRunning`
- [ ] etc... (~500+ referências)

**Estratégia:** Use find/replace com cuidado

**Commit:** `git commit -m "refactor(phase-2.3): update all references to use AppState instead of global variables"`

- [ ] Verificar: `time npm start`

**Total Fase 2:** ~500+ referências atualizadas, 16 variáveis globais removidas

---

### FASE 3: CONSOLIDAÇÃO DE EVENTOS (1-2 horas)

**Risco:** Médio-Alto | **Impacto:** Alto | **Dependências:** Fase 1, 2

#### 3.1 Remover UICallbacks Object Completamente

- [ ] Listar todos os callbacks em uso:
  ```
  - onError
  - onTranscriptAdd
  - onCurrentQuestionUpdate
  - onQuestionsHistoryUpdate
  - onStatusUpdate
  - onInputVolumeUpdate
  - onOutputVolumeUpdate
  - onMockBadgeUpdate
  - onDOMElementsReady
  - onListenButtonToggle
  - onAnswerSelected
  - onClearAllSelections
  - onScrollToQuestion
  - onTranscriptionCleared
  - onAnswersCleared
  - onAnswerStreamChunk
  - onAnswerIdUpdate
  - onModeSelectUpdate
  - onAnswerStreamEnd
  - onPlaceholderFulfill
  - onPlaceholderUpdate
  - onUpdateInterim
  - onClearInterim
  - onScreenshotBadgeUpdate
  - onAudioDeviceChanged
  ```
- [ ] Converter cada um para evento EventBus:

  ```javascript
  // De:
  emitUIChange('onCurrentQuestionUpdate', data);

  // Para:
  eventBus.emit('currentQuestionUpdate', data);
  ```

- [ ] Remover funções `onUIChange()` e `emitUIChange()`
- [ ] Remover `UICallbacks` object
- [ ] Deletar `registerUIElements()` function

**Commit:** `git commit -m "refactor(phase-3.1): remove UICallbacks object and convert to EventBus"`

- [ ] Verificar: `time npm start`

#### 3.2 Atualizar config-manager.js

- [ ] Encontrar TODAS as chamadas a `window.RendererAPI.onUIChange()`
- [ ] Converter para `eventBus.on()` direto
- [ ] Exemplo:

  ```javascript
  // De:
  window.RendererAPI.onUIChange('onStatusUpdate', (data) => { ... })

  // Para:
  eventBus.on('statusUpdate', (data) => { ... })
  ```

- [ ] Remover callback registration para RendererAPI
- [ ] Testar se tudo continua funcionando

**Commit:** `git commit -m "refactor(phase-3.2): update config-manager to use EventBus instead of UICallbacks"`

- [ ] Verificar: `time npm start`

#### 3.3 Verificar Outros Arquivos

- [ ] Buscar por `UICallbacks` em todo o projeto
- [ ] Buscar por `onUIChange` em todo o projeto
- [ ] Atualizar todas as dependências encontradas

**IMPORTANTE:** Esta mudança é transversal - afeta renderer → config-manager → HTML/DOM

**Commit:** `git commit -m "refactor(phase-3.3): verify and update all UICallbacks references across project"`

- [ ] Verificar: `time npm start`

**Total Fase 3:** 25+ eventos consolidados, 3 funções removidas

---

### FASE 4: CONSOLIDAÇÃO DE MODO (2-3 horas)

**Risco:** Alto | **Impacto:** Muito Alto | **Dependências:** Fase 1, 2, 3

#### 4.1 Criar ModeManager Class (Extensível para Futuros Modos)

- [ ] Criar arquivo `mode-manager.js`:

  ```javascript
  // Modos disponíveis (extensível para novos modos no futuro)
  const MODES = {
  	NORMAL: 'NORMAL',
  	INTERVIEW: 'INTERVIEW',
  	// FUTURE: 'PRACTICE', 'COMPETITION', etc
  };

  class ModeManager {
  	constructor(initialMode = MODES.INTERVIEW) {
  		this.currentMode = initialMode;
  		this.handlers = {}; // registry para modos
  	}

  	registerMode(modeName, handlers) {
  		this.handlers[modeName] = handlers;
  	}

  	setMode(modeName) {
  		if (!this.handlers[modeName]) {
  			throw new Error(`Modo não registrado: ${modeName}`);
  		}
  		this.currentMode = modeName;
  	}

  	// Delegação polimórfica
  	onQuestionFinalize(question) {
  		const handler = this.handlers[this.currentMode];
  		return handler.onQuestionFinalize?.(question);
  	}

  	onAnswerStreamEnd(data) {
  		const handler = this.handlers[this.currentMode];
  		return handler.onAnswerStreamEnd?.(data);
  	}

  	onQuestionClick(questionId) {
  		const handler = this.handlers[this.currentMode];
  		return handler.onQuestionClick?.(questionId);
  	}
  }
  ```

- [ ] Registrar handlers para INTERVIEW e NORMAL no renderer
- [ ] Centralizar TODA lógica modo-dependente em handlers
- [ ] **DESIGN PARA EXTENSIBILIDADE:** Arquitetura pronta para novos modos (PRACTICE, COMPETITION) sem mudanças no core

**Commit:** `git commit -m "refactor(phase-4.1): create ModeManager class for extensible mode handling"`

- [ ] Verificar: `time npm start`

#### 4.2 Refatorar askLLM()

- [ ] Remover `if (isInterviewMode)` interno
- [ ] Delegar para `ModeManager.onAskLLM()`
- [ ] Resultado: função fica 50% menor

**Commit:** `git commit -m "refactor(phase-4.2): refactor askLLM to use ModeManager delegation"`

- [ ] Verificar: `time npm start`

#### 4.3 Refatorar handleQuestionClick()

- [ ] Remover `if (ModeController.isInterviewMode())` checks (3+ lugares)
- [ ] Delegar para `ModeManager.onQuestionClick()`
- [ ] Resultado: função fica 40% menor

**Commit:** `git commit -m "refactor(phase-4.3): refactor handleQuestionClick to use ModeManager delegation"`

- [ ] Verificar: `time npm start`

#### 4.4 Refatorar finalizeCurrentQuestion()

- [ ] Remover `if (ModeController.isInterviewMode())` ... `else` gigante
- [ ] Delegar para `ModeManager.onQuestionFinalize()`
- [ ] Resultado: função fica 30% menor

**Commit:** `git commit -m "refactor(phase-4.4): refactor finalizeCurrentQuestion to use ModeManager delegation"`

- [ ] Verificar: `time npm start`

#### 4.5 Refatorar handleCurrentQuestion()

- [ ] Se necessário, adicionar lógica modo-dependente via `ModeManager`

**Commit:** `git commit -m "refactor(phase-4.5): refactor handleCurrentQuestion if needed"`

- [ ] Verificar: `time npm start`

#### 4.6 Remover ModeController

- [ ] Mover para nova classe `ModeManager`
- [ ] Remover `const ModeController = { isInterviewMode() { ... } }`

**Commit:** `git commit -m "refactor(phase-4.6): remove old ModeController and finalize ModeManager integration"`

- [ ] Verificar: `time npm start`

**Total Fase 4:** 3 funções refatoradas, ~100 linhas removidas, novo arquivo `mode-manager.js`

---

### FASE 5: REVISÃO E TESTES (1-2 horas)

**Risco:** Baixo | **Impacto:** Segurança | **Dependências:** Todas

#### 5.1 Validação

- [ ] Verificar se `npm start` inicia sem erros
- [ ] Abrir DevTools e checar console (zero erros)
- [ ] Testar funcionalidade básica:
  - [ ] Escuta funciona (Ctrl+D)
  - [ ] Pergunta é capturada
  - [ ] GPT responde
  - [ ] Respostas aparecem
  - [ ] Modo entrevista funciona
  - [ ] Modo normal funciona

**Commit:** `git commit -m "refactor(phase-5.1): validation - verify all basic functionality works"`

- [ ] Verificar: `time npm start`

#### 5.2 Testes em Mock Mode

- [ ] Ativar `MODE_DEBUG: true`
- [ ] Rodar `runMockAutoPlay()` (agora em arquivo separado)
- [ ] Verificar se mock funciona sem quebras

**Commit:** `git commit -m "refactor(phase-5.2): testing - verify mock mode functionality"`

- [ ] Verificar: `time npm start`

#### 5.3 Lint / Code Quality

- [ ] Verificar erros no `get_errors`
- [ ] Aplicar `mcp_pylance_mcp_s_pylanceInvokeRefactoring` se necessário

**Commit:** `git commit -m "refactor(phase-5.3): code quality - lint and fix remaining issues"`

- [ ] Verificar: `time npm start`

#### 5.4 Atualização Final de Documentação

- [ ] Revisar e atualizar se necessário:
  - [ ] ARCHITECTURE.md
  - [ ] START_HERE.md
  - [ ] FEATURES.md
  - [ ] DOCS_GUIDE.md
- [ ] Refletir mudanças de estado, eventos e modos na documentação
- [ ] Garantir que diagramas e exemplos estão atualizados

**Commit:** `git commit -m "docs(phase-5.4): update documentation for refactored architecture"`

#### 5.5 Push Final

- [ ] Fazer push para branch `refatorar`: `git push origin refatorar`
- [ ] Abrir PR com descrição das mudanças
- [ ] Pedir revisão

---

## ✅ CHECKLIST DE VERIFICAÇÃO DOS 10 PROBLEMAS

**Antes de considerar refatoração completa, verificar se todos os 10 problemas foram resolvidos:**

- [ ] **1. Estado Global Solto** - Fase 2
  - Verificar: `isRunning`, `currentQuestion`, `questionsHistory` usam `appState`?
- [ ] **2. Sistema de Eventos Duplicado** - Fase 3
  - Verificar: Não há mais `UICallbacks`? Tudo usa `EventBus`?
- [ ] **3. Logger Desatualizado** - Fase 1
  - Verificar: `Logger.debug()` com flag funciona? Zero `debugLogRenderer()`?
- [ ] **4. Funções Mortas** - Fase 1
  - Verificar: `promoteCurrentToHistory()`, `getNavigableQuestionIds()`, `restartAudioPipeline()` deletadas?
  - Verificar: `releaseThread()` não está duplicada?
- [ ] **5. Código Mock Pesado** - Fase 1
  - Verificar: Mock isolado em `mock-runner.js`? Removido de renderer?
  - **EXCEÇÃO:** `USE_FAKE_STREAM_GPT` em main.js mantido para economizar crédito
- [ ] **6. Lógica de Modo Duplicada** - Fase 4
  - Verificar: `ModeManager` centraliza? Zero `if (isInterviewMode)` espalhado?
- [ ] **7. UIElements Object Incompleto** - Fase 3
  - Verificar: Todos os UIElements registrados? Ou pode ser removido com EventBus?
- [ ] **8. Constantes Não Utilizadas** - MANTIDO
  - Verificar: `USE_FAKE_STREAM_GPT` em main.js funciona corretamente?
- [ ] **9. Compatibilidade Obsoleta** - Fase 1
  - Verificar: `onUIChange('onAudioDeviceChanged', ...)` removido?
- [ ] **10. Chamadas Inexistentes** - RESOLVIDO
  - Verificar: Mock removido = `handleSpeech()` e `closeCurrentQuestion()` não mais chamadas?

---

## 📈 RESUMO DAS MUDANÇAS

| Métrica                  | Antes      | Depois                                  | Mudança         |
| ------------------------ | ---------- | --------------------------------------- | --------------- |
| **Linhas (renderer.js)** | 2106       | ~1500-1600                              | -25%            |
| **Variáveis globais**    | 16         | 1                                       | -94%            |
| **Sistemas de estado**   | 2          | 1                                       | -50%            |
| **Sistemas de eventos**  | 2          | 1                                       | -50%            |
| **Funções mortas**       | 5          | 0                                       | -100%           |
| **Mock inline**          | 500 linhas | 0                                       | -100% (isolado) |
| **Logger systems**       | 2          | 1                                       | -50%            |
| **Arquivos novos**       | 0          | 2 (`mock-runner.js`, `mode-manager.js`) | +2              |

---

## ⚠️ CONSIDERAÇÕES IMPORTANTES

### O que NÃO vai mudar (SEGURO)

- ✅ Funcionalidade continua 100% igual
- ✅ Interface do usuário permanece idêntica
- ✅ Performance não será afetada
- ✅ Comportamento em modo entrevista/normal permanece igual

### O que PODE quebrar (CUIDADO)

- ⚠️ config-manager.js pode precisar atualizar callbacks
- ⚠️ Se houver código externo dependente de `UICallbacks`, vai quebrar
- ⚠️ Mock pode ter issues (não roda bem agora mesmo)

### Testar após cada fase

- ✅ Fazer `npm start` após Fase 1
- ✅ Fazer `npm start` após Fase 2
- ✅ Fazer `npm start` após Fase 3
- ✅ Fazer `npm start` após Fase 4
- ✅ Rodar testes completos em Fase 5

---

## 🎯 ORDEM FINAL DE EXECUÇÃO

```
FASE 1: Limpeza Rápida
  ├─ 1.1 Remover debugLogRenderer()
  ├─ 1.2 Remover releaseThread() duplicada
  ├─ 1.3 Isolar MOCK em arquivo separado
  └─ 1.4 Remover funções mortas

FASE 2: Consolidação de Estado
  ├─ 2.1 Migrar para AppState
  ├─ 2.2 Estender AppState com getters/setters
  └─ 2.3 Atualizar ~500+ referências

FASE 3: Consolidação de Eventos
  ├─ 3.1 Remover UICallbacks
  ├─ 3.2 Converter para EventBus
  └─ 3.3 Atualizar config-manager.js

FASE 4: Consolidação de Modo
  ├─ 4.1 Criar ModeManager class
  ├─ 4.2 Refatorar askLLM()
  ├─ 4.3 Refatorar handleQuestionClick()
  ├─ 4.4 Refatorar finalizeCurrentQuestion()
  └─ 4.5 Remover ModeController antigo

FASE 5: Revisão e Testes
  ├─ 5.1 Validação funcional
  ├─ 5.2 Testes em mock mode
  ├─ 5.3 Lint / code quality
  └─ 5.4 Commit final
```

---

## � DOCUMENTAÇÃO A REVISAR

Ao término da refatoração, os seguintes arquivos de documentação devem ser revistos e atualizados conforme necessário:

- ARCHITECTURE.md - Descrever nova estrutura de estado com AppState, EventBus centralizado e ModeManager
- START_HERE.md - Atualizar se houver mudanças no fluxo de inicialização
- FEATURES.md - Verificar se descrição de recursos ainda está correta
- DOCS_GUIDE.md - Revisar estrutura e índice de documentação
- TEST_HOME.md - Atualizar se houver novos passos de teste
- TESTING_INDEX.md - Consolidar novo índice de testes

**Prioridade:** Documentação será atualizada na Fase 5.4 como parte do processo estruturado

---

## 💬 PRONTO PARA COMEÇAR?

Este checklist é o **plano de batalha** da refatoração. Antes de começar:

1. **Analise** cada fase
2. **Levante dúvidas** - posso responder tudo
3. **Negocie** - podemos reordenar ou remover fases
4. **Confirme** - vamos começar quando você disser

### Diretrizes Confirmadas para Execução:

✅ **Cada commit reflete uma unidade de trabalho clara** - Facilita rastreamento de mudanças e possibilita rollback granular  
✅ **Performance será monitorada com `time npm start`** - Após cada fase/tópico para garantir sem degradação  
✅ **Documentação atualizada de forma estruturada** - Seção 5.4 dedicada à atualização final  
✅ **Sem criação de arquivo .md desnecessário** - Apenas documentação solicitada será criada

### Status Final:

**Refatoração completa quando:**

- ✅ Todas as fases (1-5) forem concluídas com sucesso
- ✅ `npm start` rodar sem erros
- ✅ Funcionalidade 100% preservada
- ✅ Documentação atualizada
- ✅ PR pronta para merge

**Estou pronto para o que você precisar! 🚀**

---

**Status:** ⏳ Aguardando feedback do usuário
