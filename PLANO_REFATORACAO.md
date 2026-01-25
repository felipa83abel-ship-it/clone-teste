# PLANO DE REFATORAÇÃO - config-manager.js → Arquitetura em Managers

**Status**: 🟢 Aprovado - Pronto para Execução  
**Data de Criação**: 24 de janeiro de 2026  
**Versão do Plano**: 2.0 (Opção B - Arquitetura em Classes)  
**Opção Escolhida**: Quebrar em Managers por Funcionalidade

---

## 📋 Sumário Executivo

Este plano refatora o arquivo monolítico `config-manager.js` (2678 linhas) em uma **arquitetura modular com 7 classes especializadas (Managers)**, cada uma com responsabilidade única.

### **Objetivo Final**:

- ✅ Cada Manager ~200-300 linhas (fácil navegar e manter)
- ✅ Separação por **funcionalidade**, não por seção
- ✅ Escalável indefinidamente (novas features = novo Manager ou estender existente)
- ✅ Testável isoladamente (cada Manager com testes unitários)
- ✅ ConfigManager atua apenas como **orquestrador**

### **Estrutura Final**:

```
controllers/
  config/
    ConfigManager.js                    (300 linhas - orquestrador)
    managers/
      ApiKeyManager.js                  (250 linhas)
      AudioDeviceManager.js             (200 linhas)
      ModelSelectionManager.js          (200 linhas)
      ScreenConfigManager.js            (150 linhas)
      PrivacyConfigManager.js           (100 linhas)
      WindowConfigManager.js            (150 linhas)
      HomeManager.js                    (100 linhas)
```

---

## 🎯 Arquitetura: Separação por Funcionalidade (Não por Seção)

### **Princípio**: Cada Manager cuida de UMA funcionalidade completa

```
❌ ERRADO - Separar por seção:
  HomeSection.js, ApiModelsSection.js, AudioScreenSection.js
  Problema: ApiKeyManager seria compartilhado por 3 seções

✅ CERTO - Separar por funcionalidade:
  ApiKeyManager → Gerencia API keys de TODOS os providers
                  (aparece em: OpenAI tab, Google tab, OpenRouter tab)
```

### **Mapeamento: Funcionalidade → Manager**

| Funcionalidade            | Manager                    | Responsabilidades                                                                                        |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| **API Keys**              | `ApiKeyManager.js`         | Salvar, deletar, restaurar, mascarar, validar API keys de qualquer provider (OpenAI, Google, OpenRouter) |
| **Seleção de Modelos**    | `ModelSelectionManager.js` | Gerenciar seleção de STT/LLM, ativar/desativar modelos, validar modelos                                  |
| **Dispositivos de Áudio** | `AudioDeviceManager.js`    | Carregar dispositivos, selecionar, restaurar, monitorar volume (input/output)                            |
| **Captura de Tela**       | `ScreenConfigManager.js`   | Hotkey de screenshot, excluir app, formato de imagem                                                     |
| **Privacidade**           | `PrivacyConfigManager.js`  | Hide from capture, telemetria, auto-clear, retenção de dados                                             |
| **Janela & Visual**       | `WindowConfigManager.js`   | Drag handle, click-through toggle, opacity range, dark mode                                              |
| **Home & Q&A**            | `HomeManager.js`           | Transcrição, perguntas, respostas, botões de ação (listen, ask)                                          |
| **Orquestração**          | `ConfigManager.js`         | Inicializar todos os managers, persistência de config, coordenação geral                                 |

### **Diagrama: Dependências e Fluxo**

```
                    index.html
                        │
           ┌────────────┴────────────┐
           │                         │
      renderer.js              ConfigManager.js
     (orquestrador)            (orquestrador)
           │                         │
    ┌──────┴──────────┐     ┌──────┬─┴──┬──────┬──────┐
    │                 │     │      │    │      │      │
EventBus         ModeManager │      │    │      │      │
   │                 │   ApiKey Audio Model Screen Privacy Window Home
   │                 │  Manager Manager Manager Manager Manager Manager
   │                 │     │      │    │      │      │
   └─────────────────┴─────┴──────┴────┴──────┴──────┴─────────┘
                        │
                    DOM (index.html)
                        │
                 globalThis.configManager
```

### **Carregamento em index.html**

```html
<!-- 1️⃣ Renderer (sistema de eventos e estado) -->
<script src="./renderer.js"></script>

<!-- 2️⃣ Managers (independentes, nenhuma ordem específica) -->
<script src="./controllers/config/managers/ApiKeyManager.js"></script>
<script src="./controllers/config/managers/AudioDeviceManager.js"></script>
<script src="./controllers/config/managers/ModelSelectionManager.js"></script>
<script src="./controllers/config/managers/ScreenConfigManager.js"></script>
<script src="./controllers/config/managers/PrivacyConfigManager.js"></script>
<script src="./controllers/config/managers/WindowConfigManager.js"></script>
<script src="./controllers/config/managers/HomeManager.js"></script>

<!-- 3️⃣ ConfigManager (orquestrador, depende dos managers) -->
<script src="./controllers/config/ConfigManager.js"></script>

<!-- 4️⃣ Inicialização no DOMContentLoaded -->
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    globalThis.configManager = new ConfigManager();
    await globalThis.configManager.initializeController();
  });
</script>
```

---

## ✅ CHECKLIST DE REFATORAÇÃO (POR FASE)

### **FASE 1: Design e Estrutura (Alta Prioridade)**

- [x] **1.1** Criar estrutura de diretórios e arquivos
  - [x] 1.1.1 - Criar pasta `controllers/config/`
  - [x] 1.1.2 - Criar pasta `controllers/config/managers/`
  - [x] 1.1.3 - Criar stubs vazios para os 7 files (sem código, só `class X {}`)

- [x] **1.2** Documentar interface de cada Manager
  - [x] 1.2.1 - ApiKeyManager: métodos públicos e responsabilidades
  - [x] 1.2.2 - AudioDeviceManager: métodos públicos e responsabilidades
  - [x] 1.2.3 - ModelSelectionManager: métodos públicos e responsabilidades
  - [x] 1.2.4 - ScreenConfigManager: métodos públicos e responsabilidades
  - [x] 1.2.5 - PrivacyConfigManager: métodos públicos e responsabilidades
  - [x] 1.2.6 - WindowConfigManager: métodos públicos e responsabilidades
  - [x] 1.2.7 - HomeManager: métodos públicos e responsabilidades

- [x] **1.3** Validação: Estrutura pronta
  - [x] 1.3.1 - Verificar que todos os arquivos existem
  - [x] 1.3.2 - Fazer commit: "refactor: criar estrutura de managers"

---

### **FASE 2: Extração de ApiKeyManager (Alta Prioridade)**

**Responsabilidades**: Tudo relacionado a API keys

- [x] **2.1** Mover código do config-manager.js para ApiKeyManager.js
  - [x] 2.1.1 - `saveApiKey(provider, apiKey)`
  - [x] 2.1.2 - `deleteApiKey(provider)`
  - [x] 2.1.3 - `checkApiKeysStatus()`
  - [x] 2.1.4 - `updateApiKeyFieldStatus(provider, hasKey)`
  - [x] 2.1.5 - Listeners de API key input (focus, blur, input, copy, cut)
  - [x] 2.1.6 - Listeners de visibilidade toggle

- [x] **2.2** Implementar métodos do Manager
  - [x] 2.2.1 - `constructor(configManager, ipc, eventBus)`
  - [x] 2.2.2 - `initialize()` - registra listeners
  - [x] 2.2.3 - `restoreState()` - restaura status de chaves salvas
  - [x] 2.2.4 - `reset()` - deleta todas as chaves ao resetar config
  - [x] 2.2.5 - Métodos privados `#initInputListeners()`, `#initVisibilityListeners()`

- [x] **2.3** Atualizar ConfigManager para usar ApiKeyManager
  - [x] 2.3.1 - `this.apiKeyManager = new ApiKeyManager(...)`
  - [x] 2.3.2 - Chamar `this.apiKeyManager.initialize()` no `initializeController()`
  - [x] 2.3.3 - Remover código de ApiKey do ConfigManager

- [x] **2.4** Validação: ApiKeyManager funcional
  - [x] 2.4.1 - `npm start` com timeout e testar API key save/delete
  - [x] 2.4.2 - Verificar mascaramento, visibilidade, listeners
  - [x] 2.4.3 - `npm test` - executar sem erros
  - [x] 2.4.4 - Fazer commit: "refactor: extrair ApiKeyManager"

---

### **FASE 3: Extração de AudioDeviceManager (Alta Prioridade)**

**Responsabilidades**: Tudo relacionado a dispositivos de áudio

- [x] **3.1** Mover código para AudioDeviceManager.js
  - [x] 3.1.1 - `loadDevices()` - enumerateDevices
  - [x] 3.1.2 - `addNoneOption(select)` - helper
  - [x] 3.1.3 - `saveDevices()` - persistir seleção
  - [x] 3.1.4 - `restoreDevices()` - restaurar seleção salva
  - [x] 3.1.5 - `initAudioMonitoring()` - iniciar VU meters
  - [x] 3.1.6 - `stopAudioMonitoring()` - parar VU meters
  - [x] 3.1.7 - Listeners de mudança de dispositivo

- [x] **3.2** Implementar métodos do Manager
  - [x] 3.2.1 - `constructor(configManager, ipc, eventBus, rendererAPI)`
  - [x] 3.2.2 - `initialize()` - carregar e restaurar
  - [x] 3.2.3 - `startMonitoring(type)` - iniciar VU meter
  - [x] 3.2.4 - `stopMonitoring(type)` - parar VU meter
  - [x] 3.2.5 - `getSelectedDevices()` - getter

- [x] **3.3** Atualizar ConfigManager
  - [x] 3.3.1 - `this.audioManager = new AudioDeviceManager(...)`
  - [x] 3.3.2 - Chamar `this.audioManager.initialize()` no `initializeController()`
  - [x] 3.3.3 - Remover código de Audio do ConfigManager

- [x] **3.4** Validação: AudioDeviceManager funcional
  - [x] 3.4.1 - `npm start` e entrar em "Áudio e Tela" tab
  - [x] 3.4.2 - Verificar carregamento de dispositivos, VU meters
  - [x] 3.4.3 - Trocar dispositivo e verificar persistência
  - [x] 3.4.4 - Fazer commit: "refactor: extrair AudioDeviceManager"

---

### **FASE 4: Extração de ModelSelectionManager (Alta Prioridade)**

**Responsabilidades**: Seleção de STT/LLM e ativação de modelos

- [ ] **4.1** Mover código para ModelSelectionManager.js
  - [ ] 4.1.1 - `restoreSTTLLMModels()` - restaurar seleção
  - [ ] 4.1.2 - `toggleModel(model)` - ativar/desativar
  - [ ] 4.1.3 - `updateModelStatusUI()` - atualizar badges
  - [ ] 4.1.4 - Listeners de model toggle buttons
  - [ ] 4.1.5 - Listeners de STT/LLM select changes

- [ ] **4.2** Implementar métodos do Manager
  - [ ] 4.2.1 - `constructor(configManager, ipc, eventBus, apiKeyManager)`
  - [ ] 4.2.2 - `initialize()` - registra listeners
  - [ ] 4.2.3 - `toggleModel(provider)` - ativar/desativar com validação
  - [ ] 4.2.4 - `updateUI()` - atualizar status badges
  - [ ] 4.2.5 - `restoreState()` - restaurar seleção salva
  - [ ] 4.2.6 - `reset()` - reseta modelos

- [ ] **4.3** Atualizar ConfigManager
  - [ ] 4.3.1 - `this.modelManager = new ModelSelectionManager(..., this.apiKeyManager)`
  - [ ] 4.3.2 - Chamar `this.modelManager.initialize()` no `initializeController()`
  - [ ] 4.3.3 - Remover código de Model do ConfigManager

- [ ] **4.4** Validação: ModelSelectionManager funcional
  - [ ] 4.4.1 - `npm start` e entrar em "API e Modelos" tab
  - [ ] 4.4.2 - Ativar/desativar modelos (com/sem chave)
  - [ ] 4.4.3 - Verificar que apenas 1 modelo pode estar ativo
  - [ ] 4.4.4 - Fazer commit: "refactor: extrair ModelSelectionManager"

---

### **FASE 5: Extração de Managers Restantes (Média Prioridade)**

#### **ScreenConfigManager**

- [ ] **5.1** Mover código relacionado a screenshot
  - [ ] 5.1.1 - Hotkey recording (`recordHotkey()`)
  - [ ] 5.1.2 - Listeners de formato e excludeApp
  - [ ] 5.1.3 - Restauração de estado
  - [ ] 5.1.4 - Criar `ScreenConfigManager.js`

#### **PrivacyConfigManager**

- [ ] **5.2** Mover código relacionado a privacidade
  - [ ] 5.2.1 - Checkboxes de privacidade
  - [ ] 5.2.2 - Data retention select
  - [ ] 5.2.3 - Listeners
  - [ ] 5.2.4 - Restauração de estado
  - [ ] 5.2.5 - Criar `PrivacyConfigManager.js`

#### **WindowConfigManager**

- [ ] **5.3** Mover código relacionado a janela
  - [ ] 5.3.1 - `initDragHandle()` - movimento de janela
  - [ ] 5.3.2 - `initClickThroughController()` - click-through toggle
  - [ ] 5.3.3 - `applyOpacity()` - slider de opacidade
  - [ ] 5.3.4 - `restoreTheme()` - dark mode toggle
  - [ ] 5.3.5 - Criar `WindowConfigManager.js`

#### **HomeManager**

- [ ] **5.4** Mover código relacionado a HOME
  - [ ] 5.4.1 - `registerElementListener()` helpers
  - [ ] 5.4.2 - `handleMockToggle()` - mock mode
  - [ ] 5.4.3 - `initResetButtonListener()` - reset home
  - [ ] 5.4.4 - Criar `HomeManager.js`

- [ ] **5.5** Validação: Todos os managers criados
  - [ ] 5.5.1 - `npm start` com timeout
  - [ ] 5.5.2 - Testar cada seção rapidamente
  - [ ] 5.5.3 - `npm test`
  - [ ] 5.5.4 - Fazer commit: "refactor: extrair managers restantes"

---

### **FASE 6: ConfigManager como Orquestrador (Alta Prioridade)**

**Objetivo**: ConfigManager fica com ~300 linhas, apenas coordenação

- [ ] **6.1** Limpar ConfigManager.js de código específico
  - [ ] 6.1.1 - Remover métodos movidos para managers
  - [ ] 6.1.2 - Manter: `loadConfig()`, `saveConfig()`, `get()`, `set()`
  - [ ] 6.1.3 - Manter: `initializeController()` que coordena
  - [ ] 6.1.4 - Manter: `registerUIElements()`, `registerRendererCallbacks()`, `registerDOMEventListeners()`

- [ ] **6.2** Atualizar `initializeController()`
  - [ ] 6.2.1 - Chamar `this.apiKeyManager.initialize()`
  - [ ] 6.2.2 - Chamar `this.audioManager.initialize()`
  - [ ] 6.2.3 - Chamar `this.modelManager.initialize()`
  - [ ] 6.2.4 - Chamar `this.screenManager.initialize()`
  - [ ] 6.2.5 - Chamar `this.privacyManager.initialize()`
  - [ ] 6.2.6 - Chamar `this.windowManager.initialize()`
  - [ ] 6.2.7 - Chamar `this.homeManager.initialize()`

- [ ] **6.3** Atualizar `resetConfig()`
  - [ ] 6.3.1 - Chamar `this.apiKeyManager.reset()`
  - [ ] 6.3.2 - Chamar `this.audioManager.reset()`
  - [ ] 6.3.3 - Chamar `this.modelManager.reset()`
  - [ ] 6.3.4 - Chamar reset em todos os managers

- [ ] **6.4** Mover arquivo
  - [ ] 6.4.1 - `config-manager.js` (raiz) → `controllers/config/ConfigManager.js`
  - [ ] 6.4.2 - Atualizar import em `index.html`

- [ ] **6.5** Validação: ConfigManager como orquestrador
  - [ ] 6.5.1 - `npm start` com timeout
  - [ ] 6.5.2 - Verificar que tudo funciona
  - [ ] 6.5.3 - `bash verify-all.sh`
  - [ ] 6.5.4 - Fazer commit: "refactor: mover ConfigManager para controllers/config/"

---

### **FASE 7: Testes Unitários e Documentação (Média Prioridade)**

- [ ] **7.1** Adicionar testes para cada Manager
  - [ ] 7.1.1 - `__tests__/unit/ApiKeyManager.test.js`
  - [ ] 7.1.2 - `__tests__/unit/AudioDeviceManager.test.js`
  - [ ] 7.1.3 - `__tests__/unit/ModelSelectionManager.test.js`
  - [ ] 7.1.4 - Testes básicos: initialize, restore, reset

- [ ] **7.2** Adicionar JSDoc em cada Manager
  - [ ] 7.2.1 - JSDoc para classe
  - [ ] 7.2.2 - JSDoc para métodos públicos
  - [ ] 7.2.3 - Tipo de parâmetros e retorno

- [ ] **7.3** Atualizar documentação
  - [ ] 7.3.1 - docs/ARCHITECTURE.md - novo diagrama de managers
  - [ ] 7.3.2 - Criar docs/CONFIG_MANAGER_ARCHITECTURE.md (novo arquivo)

- [ ] **7.4** Validação: Testes e docs
  - [ ] 7.4.1 - `npm test`
  - [ ] 7.4.2 - `npm run check-types`
  - [ ] 7.4.3 - Fazer commit: "test+docs: adicionar testes e documentação de managers"

---

### **FASE 8: Validação Final Completa (Alta Prioridade)**

- [ ] **8.1** Testes de integração
  - [ ] 8.1.1 - `npm start` deixar rodar 15s
  - [ ] 8.1.2 - Testar fluxo completo de API key (save, delete, toggle)
  - [ ] 8.1.3 - Testar fluxo de áudio (load devices, restaurar, VU meters)
  - [ ] 8.1.4 - Testar fluxo de modelos (toggle, restaurar)
  - [ ] 8.1.5 - Testar reset completo

- [ ] **8.2** Verificação com verify-all.sh
  - [ ] 8.2.1 - `bash verify-all.sh`
  - [ ] 8.2.2 - Revisar `temp/quality-report.txt`
  - [ ] 8.2.3 - Corrigir warnings ESLint/Prettier
  - [ ] 8.2.4 - Verificar type checking

- [ ] **8.3** Limpeza final
  - [ ] 8.3.1 - Remover console.log de debug
  - [ ] 8.3.2 - Remover código comentado
  - [ ] 8.3.3 - Consolidar imports

- [ ] **8.4** Commits finais
  - [ ] 8.4.1 - `npm start` final com timeout
  - [ ] 8.4.2 - Fazer commit: "refactor: validação final de arquitetura em managers"
  - [ ] 8.4.3 - Tag: `config-manager-refactored-v2`

---

## 📊 Estatísticas Esperadas

## 📊 Estatísticas Esperadas

| Métrica                           | Antes                           | Depois                                     | Ganho        |
| --------------------------------- | ------------------------------- | ------------------------------------------ | ------------ |
| **Arquivo monolítico**            | config-manager.js (2678 linhas) | 7 files ~200-300 linhas cada               | ✅ Modular   |
| **Linhas por arquivo**            | 2678 (gigante)                  | ~300 (ConfigManager) + ~250 (cada Manager) | ↓ 90%        |
| **Testabilidade**                 | Baixa                           | Alta (cada Manager isolado)                | ↑ Muito      |
| **Escalabilidade**                | Limitada                        | Indefinida (novo Manager = nova feature)   | ✅ Escalável |
| **Tempo para encontrar código**   | 5+ minutos (Ctrl+F)             | <1 minuto (saber qual Manager)             | ↓ 80%        |
| **Complexidade média por classe** | Alto                            | Médio-baixo                                | ↓ 60%        |

---

## 📁 Estrutura Final Completa

```
projeto/
├── config-manager.js              ❌ DELETADO
│
├── index.html
│   └── imports atualizados para novos arquivos
│
└── controllers/
    └── config/
        ├── ConfigManager.js       (300 linhas)
        │   - Orquestrador
        │   - loadConfig(), saveConfig()
        │   - initializeController()
        │   - registerUIElements(), registerRendererCallbacks()
        │   - resetConfig()
        │
        └── managers/
            ├── ApiKeyManager.js   (250 linhas)
            │   - saveApiKey(), deleteApiKey(), checkApiKeysStatus()
            │   - initApiKeyInputListeners(), initApiKeyVisibilityListeners()
            │   - updateApiKeyFieldStatus(), restoreState(), reset()
            │
            ├── AudioDeviceManager.js (200 linhas)
            │   - loadDevices(), saveDevices(), restoreDevices()
            │   - startMonitoring(), stopMonitoring()
            │   - initialize(), restoreState(), reset()
            │
            ├── ModelSelectionManager.js (200 linhas)
            │   - toggleModel(), restoreSTTLLMModels()
            │   - updateModelStatusUI()
            │   - initialize(), restoreState(), reset()
            │
            ├── ScreenConfigManager.js (150 linhas)
            │   - recordHotkey(), listeners de formato
            │   - initialize(), restoreState(), reset()
            │
            ├── PrivacyConfigManager.js (100 linhas)
            │   - Checkboxes de privacidade
            │   - initialize(), restoreState(), reset()
            │
            ├── WindowConfigManager.js (150 linhas)
            │   - initDragHandle(), initClickThroughController()
            │   - applyOpacity(), restoreTheme()
            │   - initialize(), restoreState(), reset()
            │
            └── HomeManager.js (100 linhas)
                - Mock toggle, reset home button
                - initialize(), restoreState(), reset()
```

---

## 🔍 Análise: Por que Opção B (Arquitetura em Managers)?

### **Problema Resolvido: Dispersão de Lógica Relacionada**

**Antes (config-manager.js monolítico)**:

```
API Keys espalhadas em 8 métodos:
  - initEventListeners() (5 listeners = 130 linhas)
  - saveSection() (20 linhas de lógica)
  - saveApiKey() (15 linhas)
  - deleteApiKey() (25 linhas)
  - checkApiKeysStatus() (15 linhas)
  - updateApiKeyFieldStatus() (30 linhas)
  - Listeners de visibilidade (40 linhas)
  → Total: ~280 linhas espalhadas em métodos diferentes

Audio Device espalhadas em 6 métodos:
  - loadDevices() (20 linhas)
  - saveDevices() (10 linhas)
  - restoreDevices() (15 linhas)
  - initAudioMonitoring() (40 linhas)
  - stopAudioMonitoring() (5 linhas)
  - Listeners genéricos (10 linhas)
  → Total: ~100 linhas espalhadas
```

**Depois (Arquitetura em Managers)**:

```
ApiKeyManager.js - 250 linhas
  ✅ TUDO relacionado a API keys num só lugar
  ✅ Métodos públicos: saveApiKey(), deleteApiKey(), checkStatus()
  ✅ Métodos privados: #initInputListeners(), #initVisibilityListeners()
  ✅ Fácil testar isoladamente
  ✅ Fácil entender fluxo completo

AudioDeviceManager.js - 200 linhas
  ✅ TUDO relacionado a áudio num só lugar
  ✅ Métodos públicos: loadDevices(), startMonitoring(), stopMonitoring()
  ✅ Métodos privados: #initListeners()
  ✅ Fácil estender (ex: adicionar novo tipo de monitoramento)
```

### **Benefício: Escalabilidade**

```
Cenário 1 ano do futuro: Adicionar suporte a nova API (ex: Hugging Face)

Com Opção A (monolítico):
  1. config-manager.js agora tem 3500 linhas
  2. Precisa adicionar:
     - Nova tab em HTML
     - Listeners genéricos para nova API
     - Métodos de save/delete em ApiKeyManager (que não existe)
  3. Código fica mais disperso

Com Opção B (Managers):
  1. ConfigManager.js ainda tem ~300 linhas
  2. Cria: providers/HuggingFaceKeyManager.js (estende ApiKeyManager)
  3. Adiciona instantiação em ConfigManager
  4. Pronto! Novo provider sem tocar em código existente
```

### **Benefício: Testabilidade**

```
Testar ApiKeyManager:

❌ Opção A (difícil):
  - Precisa mockar TODO o ConfigManager
  - Precisa mockar localStorage, IPC, EventBus, DOM
  - Teste frágil (quebra se qualquer coisa muda)

✅ Opção B (fácil):
  - Mocka apenas: configManager (para persistência), ipc, eventBus
  - Testa método isoladamente
  - Teste robusto (só quebra se ApiKeyManager muda)

Exemplo:
  const mockIpc = { invoke: jest.fn() }
  const mockEventBus = { emit: jest.fn() }
  const manager = new ApiKeyManager(mockConfigManager, mockIpc, mockEventBus)

  it('salva API key corretamente', async () => {
    await manager.saveApiKey('openai', 'sk-1234')
    expect(mockIpc.invoke).toHaveBeenCalledWith('SAVE_API_KEY', ...)
  })
```

---

## ⏱️ Timeline Estimado

| Fase      | Descrição                  | Tempo         | Cumulativo   |
| --------- | -------------------------- | ------------- | ------------ |
| 1         | Design e estrutura         | 1 dia         | 1 dia        |
| 2         | ApiKeyManager              | 1 dia         | 2 dias       |
| 3         | AudioDeviceManager         | 1 dia         | 3 dias       |
| 4         | ModelSelectionManager      | 1 dia         | 4 dias       |
| 5         | Managers restantes         | 1.5 dias      | 5.5 dias     |
| 6         | ConfigManager orquestrador | 1 dia         | 6.5 dias     |
| 7         | Testes e docs              | 1 dia         | 7.5 dias     |
| 8         | Validação final            | 1 dia         | 8.5 dias     |
| **Total** | **Refatoração completa**   | **~1 semana** | **8.5 dias** |

---

## ✨ Benefícios Esperados Após Refatoração

### **Imediatos (Semana 1)**

- ✅ Código mais organizado (encontra funcionalidade em 1 arquivo)
- ✅ Mais fácil de debugar (erro em API key → olhar ApiKeyManager.js)
- ✅ Menos cognitive load (ler 250 linhas vs 2678)

### **Curto Prazo (1-2 semanas)**

- ✅ Testes unitários práticos (cada Manager testável isoladamente)
- ✅ Adicionar features novo é mais rápido (ex: novo provider API)
- ✅ Code review mais eficiente (menor contexto)

### **Longo Prazo (1-2 anos)**

- ✅ Escalável indefinidamente (novo Manager = nova feature)
- ✅ Refatoração futura mais fácil (ex: React/Web Components)
- ✅ Documentação mantém-se relevante (cada Manager auto-explicativo)

---

## 🚀 Próximas Etapas (Após Refatoração Completa)

### **Futuro - Melhorias Avançadas**

1. **Providers Dinâmicos**: Sistema de plugins para novos providers de API
2. **State Machine**: Máquina de estados para API key (saved, dirty, validating)
3. **Composição**: Mais uso de `RendererAPI` para separar DOM
4. **Testes E2E**: Playwright para fluxos completos user → UI → renderer → main
5. **Migração Framework**: Base sólida para React/Vue se necessário

---

## 📝 Convenções de Código (para Managers)

### **Estrutura de um Manager**

```javascript
/**
 * ApiKeyManager - Gerencia API keys de todos os providers
 * Responsabilidades:
 *   - Salvar/deletar chaves de forma segura
 *   - Listeners de input (focus, blur, copy, cut)
 *   - Mascaramento e visibilidade
 *   - Validação e restauração
 *
 * Compartilha dados com: ConfigManager (persistência), IPC (store seguro)
 */
class ApiKeyManager {
  /**
   * @param {ConfigManager} configManager - Referência ao orquestrador
   * @param {IpcRenderer} ipc - Comunicação com main.js
   * @param {EventBus} eventBus - Sistema de eventos global
   */
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager
    this.ipc = ipc
    this.eventBus = eventBus
  }

  /**
   * Inicializa todos os listeners desta funcionalidade
   */
  async initialize() {
    this.#initApiKeyInputListeners()
    this.#initApiKeyVisibilityListeners()
    await this.restoreState()
  }

  /**
   * Restaura estado salvo (chaves verificadas)
   */
  async restoreState() {
    await this.checkApiKeysStatus()
  }

  /**
   * Reseta tudo ao resetar config (deleta todas as chaves)
   */
  async reset() {
    for (const provider of ['openai', 'google', 'openrouter']) {
      await this.deleteApiKey(provider)
    }
  }

  // Métodos públicos (API do Manager)
  async saveApiKey(provider, apiKey) {...}
  async deleteApiKey(provider) {...}
  async checkApiKeysStatus() {...}
  updateApiKeyFieldStatus(provider, hasKey) {...}

  // Métodos privados (implementação)
  #initApiKeyInputListeners() {...}
  #initApiKeyVisibilityListeners() {...}
}
```

---

## 🎯 Dependências Entre Managers

```
ConfigManager (orquestrador)
    │
    ├── ApiKeyManager
    │   └── dependência: (nenhuma com outro Manager)
    │
    ├── AudioDeviceManager
    │   └── dependência: (nenhuma)
    │
    ├── ModelSelectionManager
    │   └── dependência: ApiKeyManager (valida se tem chave antes de ativar)
    │
    ├── ScreenConfigManager
    │   └── dependência: (nenhuma)
    │
    ├── PrivacyConfigManager
    │   └── dependência: (nenhuma)
    │
    ├── WindowConfigManager
    │   └── dependência: (nenhuma)
    │
    └── HomeManager
        └── dependência: (nenhuma)

Rule: Managers NÃO dependem um do outro (apenas de ConfigManager)
      Se precisa chamar outro Manager, passa por ConfigManager
```

---

## ✅ Checklist de Aprovação

Antes de começar a FASE 1, confirme:

- [ ] Entendi que será **arquitetura em Managers** (Opção B)
- [ ] Entendi que **config-manager.js será deletado**
- [ ] Entendi que **ConfigManager.js vai para `controllers/config/`**
- [ ] Entendi que **cada Manager é independente** (testável isoladamente)
- [ ] Entendi que **timeline é ~1 semana de trabalho**
- [ ] Acordo que o código atual `config-manager.js` será **totalmente refatorado**
- [ ] Concordo com a estrutura de 7 Managers + 1 ConfigManager

**Se SIM em todos, a refatoração pode começar! 🚀**

---

## 📞 Dúvidas Frequentes

**P: E se eu precisar de uma funcionalidade que não se encaixa em nenhum Manager?**
A: Crie um novo Manager! Ex: `TimelineManager.js`, `NotificationManager.js`

**P: Como Managers se comunicam entre si?**
A: Via `eventBus.emit()` e `eventBus.on()` ou via ConfigManager (composição)

**P: E se um Manager ficar muito grande (>500 linhas)?**
A: Considere dividir em 2 Managers (ex: ApiKeyManager + ModelValidationManager)

**P: Posso refatorar apenas 1 Manager por vez?**
A: SIM! Fases 2-5 são independentes (ApiKeyManager não depende de Audio, etc)
