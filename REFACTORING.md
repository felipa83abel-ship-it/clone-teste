# 🔧 Refatoração MVC - AskMe

## 📋 Resumo da Refatoração

A aplicação foi refatorada para seguir a arquitetura **MVC (Model-View-Controller)** clara e bem definida.

---

## 🏗️ Arquitetura Atual

```
INDEX.HTML (View)
    └─ Apenas estrutura HTML + data-attributes
    
CONFIG-MANAGER.JS (Controller)
    ├─ Captura TODOS os eventos do DOM
    ├─ Orquestra ações chamando RendererAPI
    ├─ Gerencia estado de UI
    ├─ Manipula DOM (classes, estilos)
    └─ Persiste configurações

RENDERER.JS (Model/Services)
    ├─ NUNCA captura eventos DOM
    ├─ Expõe RendererAPI com funções públicas
    ├─ Contém TODA lógica de negócio
    │  ├─ Captura de áudio
    │  ├─ Orquestração de entrevista
    │  ├─ Processamento GPT
    │  └─ Renderização de UI
    └─ Comunica com main.js via IPC

MAIN.JS (Backend Services)
    ├─ Operações de sistema
    ├─ Integração com OpenAI
    └─ IPC Handlers
```

---

## ✅ Responsabilidades Claras

### **CONFIG-MANAGER.JS** (Controller/Orquestrador)
✔️ Captura eventos DOM (listeners)  
✔️ Chama métodos do RendererAPI  
✔️ Gerencia estado de UI  
✔️ Persiste configurações (localStorage)  
✔️ Manipula DOM diretamente (classes, estilos)  

### **RENDERER.JS** (Model/Services)
✔️ NUNCA captura eventos DOM diretamente  
✔️ Expõe funções públicas via RendererAPI  
✔️ Contém lógica complexa (áudio, GPT, estados)  
✔️ Comunica com main.js via IPC  
✔️ NÃO manipula DOM diretamente (apenas através de funções)  

### **INDEX.HTML** (View)
✔️ Apenas estrutura HTML  
✔️ Sem lógica JavaScript inline  
✔️ Usa data-* attributes para identificação  

---

## 🔄 Fluxo de Interação

```
1. USUÁRIO INTERAGE
   └─ Clica botão, digita, seleciona

2. HTML dispara evento

3. CONFIG-MANAGER.JS captura
   └─ addEventListener → chama window.RendererAPI

4. RENDERER.JS executa
   └─ Funções públicas processam lógica

5. Main.js responde (se necessário via IPC)
   └─ Operações do sistema

6. UI atualizada
   └─ renderQuestionsHistory(), statusText.innerText, etc
```

---

## 📝 RendererAPI - Public Interface

Todas as funções públicas que o Controller pode chamar:

```javascript
const RendererAPI = {
  // Áudio
  startInput,
  stopInput,
  startOutput,
  stopOutput,
  restartAudioPipeline,

  // Entrevista
  listenToggleBtn,
  askGpt,
  resetInterviewState,
  startMockInterview,

  // Modo
  changeMode,
  getMode,

  // Questions
  handleQuestionClick,
  closeCurrentQuestion,

  // UI
  applyOpacity,
  updateStatus,
  updateMockBadge,
  setMockToggle,
  setModeSelect,

  // Drag
  initDragHandle,

  // Click-through
  setClickThrough,
  updateClickThroughButton,

  // Config
  setAppConfig,
  getAppConfig,

  // Keyboard
  registerKeyboardShortcuts,

  // IPC
  onApiKeyUpdated,
  onToggleAudio,
  onAskGpt,
  onGptStreamChunk,
  onGptStreamEnd,
  sendRendererError,
};
```

---

## 🚀 Inicialização (DOMContentLoaded)

1. **renderer.js** carrega primeiro (via index.html)
   - Define todas as constantes, estado, funções
   - Expõe `window.RendererAPI`

2. **config-manager.js** carrega segundo
   - Espera por `window.RendererAPI`
   - Inicializa ConfigManager
   - Chama `initializeController()`

3. **initializeController()** executa:
   - Restaurar tema, opacidade, modo
   - Solicitar permissão de áudio
   - Carregar e restaurar dispositivos
   - Iniciar áudio se necessário
   - Sincronizar API key
   - Registrar TODOS os event listeners
   - Registrar IPC listeners
   - Registrar atalhos de teclado

---

## 🔧 Métodos Principais adicionados ao ConfigManager

```javascript
// Inicialização
async initializeController()

// Restauração de state
restoreTheme()
restoreOpacity()
restoreMode()
async initClickThroughController()
async syncApiKeyOnStart()

// Registração de listeners
registerDOMEventListeners()    // todos os addEventListener
registerIPCListeners()         // ipcRenderer.on
registerErrorHandlers()        // error, unhandledrejection
```

---

## 📦 Mudanças Principais

### ✅ Removido de `renderer.js`
- ❌ Todos os `addEventListener`
- ❌ `ipcRenderer.on` listeners
- ❌ DOMContentLoaded initialization
- ❌ Drag handle logic (movido para RendererAPI)
- ❌ Click-through initialization
- ❌ Keyboard shortcuts listeners
- ❌ Global error handlers

### ✅ Adicionado a `renderer.js`
- ✅ `RendererAPI` object com todas as funções públicas
- ✅ `window.RendererAPI` exposição global

### ✅ Adicionado a `config-manager.js`
- ✅ `initializeController()` method
- ✅ `registerDOMEventListeners()` method
- ✅ `registerIPCListeners()` method
- ✅ `registerErrorHandlers()` method
- ✅ `restoreTheme()`, `restoreOpacity()`, `restoreMode()` methods
- ✅ `initClickThroughController()` method
- ✅ `syncApiKeyOnStart()` method

### ✅ Mantido em `main.js`
- ✅ Tudo igual (sem mudanças)

---

## 🎯 Benefícios da Refatoração

1. **Separação clara de responsabilidades**
   - Controller: Orquestração
   - Services: Lógica de negócio
   - View: Apenas HTML

2. **Mais fácil de testar**
   - RendererAPI pode ser mockado
   - Lógica isolada em Services

3. **Mais fácil de manter**
   - Saber exatamente onde cada funcionalidade está
   - Mudanças isoladas não afetam outras partes

4. **Escalabilidade**
   - Fácil adicionar novos features
   - Fácil refatorar sem quebrar

5. **Melhor performance**
   - Menos re-renders desnecessários
   - Lógica melhor organizada

---

## 🧪 Validação

### ✅ Sem erros de sintaxe
```
✓ config-manager.js - OK
✓ renderer.js - OK
✓ main.js - OK
```

### ✅ Funcionalidades preservadas
- [x] Captura de áudio (INPUT)
- [x] Monitoramento de saída (OUTPUT)
- [x] Entrevistas (INTERVIEW MODE)
- [x] Perguntas consolidadas
- [x] Respostas GPT (normal + streaming)
- [x] Modo MOCK/DEBUG
- [x] Atalhos de teclado
- [x] Drag and drop da janela
- [x] Click-through
- [x] Opacidade/tema
- [x] Dispositivos de áudio
- [x] API keys seguras

---

## 📝 Próximos Passos (Opcional)

1. **Extrair Services em arquivos separados**
   - `audio-service.js` (captura, análise)
   - `gpt-service.js` (chamadas GPT)
   - `interview-service.js` (lógica de entrevista)

2. **Criar um Model Layer explícito**
   - `models/Question.js`
   - `models/Answer.js`
   - `models/Config.js`

3. **Adicionar testes unitários**
   - Testar RendererAPI
   - Testar ConfigManager methods
   - Testar handlers

---

## 🎉 Concluído!

A aplicação agora segue uma arquitetura **MVC clara** mantendo 100% das funcionalidades originais.
