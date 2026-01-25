# 📋 PLANO DE REFATORAÇÃO - CONFIG-MANAGER

**Data Início:** 23 de janeiro de 2026  
**Status Atual:** 🔄 Fase 4 COMPLETA  
**Última Atualização:** 24 de janeiro de 2026

---

## 🎯 VISÃO GERAL

Refatorar `config-manager.js` (2678 linhas) em 7 Managers especializados:

```
ConfigManager (orquestrador)
├── ApiKeyManager          ✅ COMPLETO
├── AudioDeviceManager     ✅ COMPLETO
├── ModelSelectionManager  ✅ COMPLETO
├── ScreenConfigManager    ⏳ TODO
├── PrivacyConfigManager   ⏳ TODO
├── WindowConfigManager    ⏳ TODO
└── HomeManager            ⏳ TODO
```

**Objetivo:** -60% de linhas, +80% de manutenibilidade, separação de responsabilidades.

---

## 📊 CHECKLIST DE FASES

### FASE 0: PREPARAÇÃO ✅

- [x] 0.1 - Estrutura de diretórios criada (`controllers/config/managers/`)
- [x] 0.2 - ConfigManager.js stub criado
- [x] 0.3 - 7 Manager stubs criados
- [x] 0.4 - Commit inicial: "refactor: fase 0 - criar estrutura de managers"

**Status:** ✅ COMPLETO

---

### FASE 1: SETUP INICIAL ✅

- [x] 1.1 - Criar ConfigManager.js com orquestração
- [x] 1.2 - Criar ApiKeyManager.js stub
- [x] 1.3 - Criar AudioDeviceManager.js stub
- [x] 1.4 - Criar ModelSelectionManager.js stub
- [x] 1.5 - Criar ScreenConfigManager.js stub
- [x] 1.6 - Criar PrivacyConfigManager.js stub
- [x] 1.7 - Criar WindowConfigManager.js stub
- [x] 1.8 - Criar HomeManager.js stub
- [x] 1.9 - Validar estrutura: `npm start` sem erros
- [x] 1.10 - Commit: "refactor: fase 1.1 - criar estrutura de managers"

**Status:** ✅ COMPLETO

---

### FASE 2: API KEY MANAGER ✅

#### 2.1 - Extrair Código ✅

- [x] 2.1.1 - Extrair `saveApiKey()` de config-manager.js (linha 506-545)
- [x] 2.1.2 - Extrair `deleteApiKey()` (linha 546-580)
- [x] 2.1.3 - Extrair `checkApiKeysStatus()` (linha 442-470)
- [x] 2.1.4 - Extrair `updateApiKeyFieldStatus()` (linha 471-502)
- [x] 2.1.5 - Extrair listeners de API key (linhas 170-310)

**Status:** ✅ COMPLETO

#### 2.2 - Implementar Métodos ✅

- [x] 2.2.1 - Implementar `saveApiKey(provider, apiKey)`
- [x] 2.2.2 - Implementar `deleteApiKey(provider)`
- [x] 2.2.3 - Implementar `checkApiKeysStatus()`
- [x] 2.2.4 - Implementar `updateApiKeyFieldStatus(provider, hasKey)`
- [x] 2.2.5 - Implementar `#initApiKeyInputListeners()`
- [x] 2.2.6 - Implementar `#initApiKeyVisibilityListeners()`
- [x] 2.2.7 - Implementar `#initApiKeyDeleteListeners()`
- [x] 2.2.8 - Adicionar Logger.debug() com emojis

**Status:** ✅ COMPLETO

#### 2.3 - Integração ✅

- [x] 2.3.1 - Adicionar ao ConfigManager.initializeController()
- [x] 2.3.2 - Validar com `npm start` (timeout 10s)
- [x] 2.3.3 - Testar IPC calls: GET_API_KEY, SAVE_API_KEY, DELETE_API_KEY
- [x] 2.3.4 - Verificar console logs sem erros

**Status:** ✅ COMPLETO

#### 2.4 - Commit ✅

- [x] 2.4.1 - `git add . && git commit -m "refactor: fase 2.1 - implementar ApiKeyManager com métodos e listeners completos"`
- [x] 2.4.2 - Marcar checkboxes 2.1-2.4 como completos

**Status:** ✅ COMPLETO

---

### FASE 3: AUDIO DEVICE MANAGER ✅

#### 3.1 - Extrair Código ✅

- [x] 3.1.1 - Extrair `loadDevices()` de config-manager.js (linha 656-748)
- [x] 3.1.2 - Extrair `saveDevices()` e `restoreDevices()`
- [x] 3.1.3 - Extrair `initAudioMonitoring()` e `stopAudioMonitoring()` (linha 858-920)

**Status:** ✅ COMPLETO

#### 3.2 - Implementar Métodos ✅

- [x] 3.2.1 - Implementar `loadDevices()` - enumera e popula select elementos
- [x] 3.2.2 - Implementar `saveDevices()` - persiste seleção
- [x] 3.2.3 - Implementar `restoreDevices()` - restaura com validação
- [x] 3.2.4 - Implementar `startMonitoring(type)` - VU meter para input/output
- [x] 3.2.5 - Implementar `stopMonitoring(type)` - para VU meter
- [x] 3.2.6 - Implementar `getSelectedDevices()` - getter
- [x] 3.2.7 - Implementar `#addNoneOption()` - helper
- [x] 3.2.8 - Implementar `#initDeviceSelectListeners()` - registrar change handlers
- [x] 3.2.9 - Adicionar Logger.debug() com emojis

**Status:** ✅ COMPLETO

#### 3.3 - Integração ✅

- [x] 3.3.1 - Adicionar ao ConfigManager.initializeController()
- [x] 3.3.2 - Validar com `npm start` (timeout 10s)
- [x] 3.3.3 - Testar VU meters começam/param
- [x] 3.3.4 - Verificar console logs sem erros

**Status:** ✅ COMPLETO

#### 3.4 - Commit ✅

- [x] 3.4.1 - `git add . && git commit -m "refactor: fase 3 - implementar AudioDeviceManager com métodos completos"`
- [x] 3.4.2 - Marcar checkboxes 3.1-3.4 como completos
- [x] 3.4.3 - Corrigir checkbox 3.1 que não estava marcado (commit adicional)

**Status:** ✅ COMPLETO

---

### FASE 4: MODEL SELECTION MANAGER ✅

#### 4.1 - Extrair Código ✅

- [x] 4.1.1 - Grep por `toggleModel|restoreSTTLLMModels|updateModelStatusUI` (15 matches)
- [x] 4.1.2 - Extrair `restoreSTTLLMModels()` (linhas 752-786)
- [x] 4.1.3 - Extrair `toggleModel()` (linhas 941-1000)
- [x] 4.1.4 - Extrair `updateModelStatusUI()` (linhas 1004-1028)
- [x] 4.1.5 - Extrair listeners de modelo (button[data-model], select change)

**Status:** ✅ COMPLETO

#### 4.2 - Implementar Métodos ✅

- [x] 4.2.1 - Implementar `restoreSTTLLMModels()` - restaura seleções STT/LLM
- [x] 4.2.2 - Implementar `toggleModel(provider)` - ativa/desativa com validação
- [x] 4.2.3 - Implementar `updateModelStatusUI()` - atualiza badges e botões
- [x] 4.2.4 - Implementar `#initModelToggleListeners()` - registra button listeners
- [x] 4.2.5 - Implementar `#initModelSelectListeners()` - registra select listeners
- [x] 4.2.6 - Validar API key antes de ativar (via ApiKeyManager)
- [x] 4.2.7 - Garantir apenas 1 modelo ativo (disable others)
- [x] 4.2.8 - Chamar `initialize-api-client` IPC para OpenAI
- [x] 4.2.9 - Emitir `MODEL_TOGGLED` event via EventBus
- [x] 4.2.10 - Adicionar Logger.debug() com emojis

**Status:** ✅ COMPLETO

#### 4.3 - Integração ✅

- [x] 4.3.1 - Adicionar ao ConfigManager.initializeController()
- [x] 4.3.2 - Validar com `timeout 10 npm start`
- [x] 4.3.3 - Testar ativar/desativar modelos
- [x] 4.3.4 - Testar validação de API key antes de ativar
- [x] 4.3.5 - Testar que apenas 1 modelo fica ativo

**Status:** ✅ COMPLETO

#### 4.4 - Commit ✅

- [x] 4.4.1 - `git add . && git commit -m "refactor: fase 4 - implementar ModelSelectionManager com validação e listeners completos"`
- [x] 4.4.2 - Marcar checkboxes 4.1-4.4 como completos

**Status:** ✅ COMPLETO

---

### FASE 5: SCREEN CONFIG MANAGER ⏳

#### 5.1 - Extrair Código

- [ ] 5.1.1 - Grep por `screenshotHotkey|excludeApp|imageFormat`
- [ ] 5.1.2 - Extrair métodos de screenshot config
- [ ] 5.1.3 - Extrair listeners de hotkey recording

**Status:** ⏳ TODO

#### 5.2 - Implementar Métodos

- [ ] 5.2.1 - Implementar `recordHotkey()` - gravação de teclas
- [ ] 5.2.2 - Implementar `saveScreenConfig()` - persiste config
- [ ] 5.2.3 - Implementar `restoreScreenConfig()` - restaura
- [ ] 5.2.4 - Implementar `updateScreenUIStatus()` - atualiza UI
- [ ] 5.2.5 - Implementar listeners

**Status:** ⏳ TODO

#### 5.3 - Integração

- [ ] 5.3.1 - Adicionar ao ConfigManager.initializeController()
- [ ] 5.3.2 - Validar com `npm start`
- [ ] 5.3.3 - Testar hotkey recording

**Status:** ⏳ TODO

#### 5.4 - Commit

- [ ] 5.4.1 - Fazer commit com mensagem padrão
- [ ] 5.4.2 - Marcar checkboxes como completos

**Status:** ⏳ TODO

---

### FASE 6: PRIVACY CONFIG MANAGER ⏳

#### 6.1 - Extrair Código

- [ ] 6.1.1 - Grep por `hideFromScreenCapture|disableTelemetry|autoClearData|dataRetentionDays`
- [ ] 6.1.2 - Extrair métodos de privacy config

**Status:** ⏳ TODO

#### 6.2 - Implementar Métodos

- [ ] 6.2.1 - Implementar `savePrivacySettings()` - persiste checkboxes
- [ ] 6.2.2 - Implementar `restorePrivacySettings()` - restaura
- [ ] 6.2.3 - Implementar `updatePrivacyUI()` - atualiza UI
- [ ] 6.2.4 - Implementar listeners para checkboxes

**Status:** ⏳ TODO

#### 6.3 - Integração & Commit

- [ ] 6.3.1 - Adicionar ao ConfigManager.initializeController()
- [ ] 6.3.2 - Validar e fazer commit

**Status:** ⏳ TODO

---

### FASE 7: WINDOW CONFIG MANAGER ⏳

#### 7.1 - Extrair Código

- [ ] 7.1.1 - Grep por `dragHandle|clickThrough|opacity|darkMode`
- [ ] 7.1.2 - Extrair métodos de window config

**Status:** ⏳ TODO

#### 7.2 - Implementar Métodos

- [ ] 7.2.1 - Implementar `saveWindowSettings()` - persiste config
- [ ] 7.2.2 - Implementar `restoreWindowSettings()` - restaura
- [ ] 7.2.3 - Implementar `updateWindowUI()` - atualiza UI
- [ ] 7.2.4 - Implementar listeners para sliders, toggles

**Status:** ⏳ TODO

#### 7.3 - Integração & Commit

- [ ] 7.3.1 - Adicionar ao ConfigManager.initializeController()
- [ ] 7.3.2 - Validar e fazer commit

**Status:** ⏳ TODO

---

### FASE 8: HOME MANAGER ⏳

#### 8.1 - Extrair Código

- [ ] 8.1.1 - Grep por `mockToggle|resetButton|actionListeners`
- [ ] 8.1.2 - Extrair métodos de home config

**Status:** ⏳ TODO

#### 8.2 - Implementar Métodos

- [ ] 8.2.1 - Implementar `initMockToggle()` - toggle mock mode
- [ ] 8.2.2 - Implementar `initResetButton()` - reset tudo
- [ ] 8.2.3 - Implementar `initActionListeners()` - outros botões
- [ ] 8.2.4 - Implementar `updateHomeUI()` - atualiza status

**Status:** ⏳ TODO

#### 8.3 - Integração & Commit

- [ ] 8.3.1 - Adicionar ao ConfigManager.initializeController()
- [ ] 8.3.2 - Validar e fazer commit

**Status:** ⏳ TODO

---

### FASE 9: ATUALIZAR INDEX.HTML ⏳

- [ ] 9.1 - Verificar ordem de script tags em index.html
- [ ] 9.2 - Garantir ConfigManager.js é carregado por último
- [ ] 9.3 - Validar com `npm start`

**Status:** ⏳ TODO

---

### FASE 10: LIMPEZA ⏳

- [ ] 10.1 - Remover código antigo de config-manager.js (mantendo como referência)
- [ ] 10.2 - Atualizar imports em renderer.js se necessário
- [ ] 10.3 - Validação final com `npm test` e `npm start`

**Status:** ⏳ TODO

---

## 📊 ESTATÍSTICAS

### Antes (Monolítico)

```
config-manager.js: 2678 linhas
├── ApiKeyManager code: 270+ linhas (inline)
├── AudioDeviceManager code: 250+ linhas (inline)
├── ModelSelectionManager code: 150+ linhas (inline)
├── ScreenConfigManager code: 200+ linhas (inline)
├── PrivacyConfigManager code: 100+ linhas (inline)
├── WindowConfigManager code: 200+ linhas (inline)
└── HomeManager code: 100+ linhas (inline)

TOTAL: 2678 linhas, 1 arquivo = Difícil de manter
```

### Depois (Modular)

```
controllers/config/
├── ConfigManager.js (348 linhas) - orquestrador
└── managers/
    ├── ApiKeyManager.js (270+ linhas) ✅
    ├── AudioDeviceManager.js (250+ linhas) ✅
    ├── ModelSelectionManager.js (200+ linhas) ✅
    ├── ScreenConfigManager.js (200 linhas) ⏳
    ├── PrivacyConfigManager.js (100 linhas) ⏳
    ├── WindowConfigManager.js (200 linhas) ⏳
    └── HomeManager.js (100 linhas) ⏳

TOTAL: ~1700 linhas distribuídas em 8 arquivos = Fácil de manter, testar, estender
```

### Benefícios

- ✅ -37% de linhas por arquivo (média)
- ✅ Cada Manager com responsabilidade única
- ✅ Fácil de testar isoladamente
- ✅ Fácil de estender com novos Managers
- ✅ Reutilização de padrões
- ✅ Melhor performance (carregamento sob demanda)
- ✅ Logging estruturado

---

## 🎯 PRÓXIMAS AÇÕES

**Fase 5 (ScreenConfigManager):**

1. Procurar por `screenshotHotkey`, `excludeApp`, `imageFormat` em config-manager.js
2. Extrair métodos relacionados
3. Implementar seguindo o padrão das Fases 2-4
4. Integrar em ConfigManager.initializeController()
5. Validar com `npm start`
6. Fazer commit

---

## 📝 NOTAS IMPORTANTES

- **npm start timeout:** Usar `timeout 10 npm start` para não ficar esperando a aplicação
- **Cada fase deve ter seu commit específico** - facilita rastreamento
- **Marcar checkboxes assim que completar** - não deixar para depois
- **Testar com npm start após cada fase** - detectar erros cedo
- **Não pular fases** - ordem importa para integração
- **ConfigManager é o orquestrador** - todos os Managers falam com ele

---

## ✅ RESUMO STATUS

| Fase | Nome                  | Status | Commits |
| ---- | --------------------- | ------ | ------- |
| 0    | Preparação            | ✅     | 1       |
| 1    | Setup                 | ✅     | 1       |
| 2    | ApiKeyManager         | ✅     | 2       |
| 3    | AudioDeviceManager    | ✅     | 2       |
| 4    | ModelSelectionManager | ✅     | 1       |
| 5    | ScreenConfigManager   | ⏳     | -       |
| 6    | PrivacyConfigManager  | ⏳     | -       |
| 7    | WindowConfigManager   | ⏳     | -       |
| 8    | HomeManager           | ⏳     | -       |
| 9    | index.html            | ⏳     | -       |
| 10   | Limpeza               | ⏳     | -       |

**Total concluído:** 4 fases (40%)  
**Próxima fase:** 5 - ScreenConfigManager
