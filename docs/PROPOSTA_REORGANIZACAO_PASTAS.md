# 🗂️ PROPOSTA DE REORGANIZAÇÃO DE PASTAS POR SEÇÕES

**Data:** 27 de janeiro de 2026  
**Objetivo:** Melhorar legibilidade e facilitar manutenção

---

## 📊 ANÁLISE DOS ARQUIVOS

### Classificação Correta

#### 1. **mode-manager.js** ❌ NÃO é Manager de Seção

```
O que é: Orquestrador de MODOS (Interview vs Normal)
Escopo: GLOBAL (afeta toda a app)
Responsabilidade: Registrar handlers específicos por modo
NÃO está associado a uma seção da UI
```

**Classificação:** `CONTROLADOR GLOBAL` (não é Manager de seção)  
**Localização atual:** ✅ Correto em `controllers/modes/`  
**Ação:** MANTER aqui (é transversal, não seção-específico)

---

#### 2. **question-controller.js** ✅ SIM, é do HOME

```
O que é: Controlador de perguntas e respostas
Escopo: SEÇÃO HOME
Responsabilidade: Renderizar, navegar, manipular perguntas
Diretamente ligado ao: #questions, #questionsHistory, #currentQuestion
```

**Classificação:** `CONTROLLER DE SEÇÃO`  
**Localização atual:** `controllers/question/`  
**Localização proposta:** `controllers/sections/home/question-controller.js`  
**Ação:** MOVER para seção HOME

---

#### 3. **question-helpers.js** ✅ SIM, é do HOME

```
O que é: Helpers para manipular perguntas
Escopo: SEÇÃO HOME
Responsabilidade: Funções auxiliares para question-controller
```

**Classificação:** `HELPER DE SEÇÃO`  
**Localização atual:** `controllers/question/`  
**Localização proposta:** `controllers/sections/home/question-helpers.js`  
**Ação:** MOVER para seção HOME

---

#### 4. **screenshot-controller.js** ✅ SIM, é do AUDIO-SCREEN

```
O que é: Controlador de capturas de screenshot
Escopo: SEÇÃO AUDIO-SCREEN
Responsabilidade: Capturar, analisar, gerenciar screenshots
Diretamente ligado ao: #clearScreenshotsBtn, screenshotBadge
```

**Classificação:** `CONTROLLER DE SEÇÃO`  
**Localização atual:** `controllers/screenshot/`  
**Localização proposta:** `controllers/sections/audio-screen/screenshot-controller.js`  
**Ação:** MOVER para seção AUDIO-SCREEN

---

## 📁 ESTRUTURA PROPOSTA

### ATUAL (Confuso)
```
controllers/
├── config/
│   ├── managers/ ← Managers de UI
│   ├── ConfigManager.js
├── modes/ ← Global
│   └── mode-manager.js
├── question/ ← HOME (perdido aqui)
│   ├── question-controller.js
│   └── question-helpers.js
├── screenshot/ ← AUDIO-SCREEN (perdido aqui)
│   └── screenshot-controller.js
├── audio/ ← Global/Audio
│   └── audio-controller.js
└── ...
```

### PROPOSTO (Organizado por Seções)
```
controllers/
│
├─ 🎛️ GLOBAL (Controladores transversais - afetam toda a app)
│  ├── modes/
│  │   └── mode-manager.js ← Orquestra modos
│  │
│  └── audio/
│      └── audio-controller.js ← Controla STT/LLM
│
├─ 🎨 SECTIONS (UI - separado por SEÇÃO da interface)
│  │
│  ├── home/ ← SEÇÃO HOME
│  │   ├── manager/
│  │   │   └── HomeUIManager.js
│  │   ├── question-controller.js ← MOVIDO daqui
│  │   └── question-helpers.js ← MOVIDO daqui
│  │
│  ├── top-bar/ ← TOP BAR (nova seção)
│  │   ├── manager/
│  │   │   └── TopBarManager.js
│  │   └── (recursos específicos)
│  │
│  ├── api-models/ ← SEÇÃO API & MODELOS
│  │   ├── managers/
│  │   │   ├── ApiKeyManager.js
│  │   │   └── ModelSelectionManager.js
│  │   └── (helpers específicos)
│  │
│  ├── audio-screen/ ← SEÇÃO ÁUDIO & TELA
│  │   ├── managers/
│  │   │   ├── AudioDeviceManager.js
│  │   │   └── ScreenConfigManager.js
│  │   ├── screenshot-controller.js ← MOVIDO daqui
│  │   └── (helpers específicos)
│  │
│  ├── privacy/ ← SEÇÃO PRIVACIDADE
│  │   ├── manager/
│  │   │   └── PrivacyConfigManager.js
│  │   └── (helpers específicos)
│  │
│  ├── others/ ← SEÇÃO OUTROS
│  │   ├── manager/
│  │   │   └── OtherConfigManager.js
│  │   └── (helpers específicos)
│  │
│  ├── info/ ← SEÇÃO INFO
│  │   ├── manager/
│  │   │   └── InfoManager.js
│  │   └── (helpers específicos)
│  │
│  └── window/ ← JANELA (não é seção, é global-window)
│      ├── manager/
│      │   └── WindowUIManager.js
│      └── (helpers específicos)
│
├─ 🎯 CONFIG (Gerenciamento central)
│   └── ConfigManager.js ← Orquestra todos os managers
│
└─ 🔧 UTILS (Utilidades globais)
    └── ...
```

---

## 🎯 RESUMO DE MUDANÇAS

### Arquivos a MOVER

| Arquivo | Atual | Proposto | Razão |
|---------|-------|----------|-------|
| `question-controller.js` | `controllers/question/` | `controllers/sections/home/` | Controla seção HOME |
| `question-helpers.js` | `controllers/question/` | `controllers/sections/home/` | Helpers de HOME |
| `screenshot-controller.js` | `controllers/screenshot/` | `controllers/sections/audio-screen/` | Controla AUDIO-SCREEN |

### Arquivos a MANTER

| Arquivo | Local | Razão |
|---------|-------|-------|
| `mode-manager.js` | `controllers/modes/` | Global (afeta toda app) |
| `audio-controller.js` | `controllers/audio/` | Global (STT/LLM) |
| `ConfigManager.js` | `controllers/config/` | Orquestrador central |

---

## 📊 IMPACTO DAS MUDANÇAS

### ✅ Vantagens

1. **Estrutura Intuitiva**
   - Cada seção em sua própria pasta
   - Fácil encontrar código relacionado
   - Novo desenvolvedor entende rápido

2. **Manutenção Facilitada**
   - Tudo da seção HOME junto
   - Tudo da seção AUDIO-SCREEN junto
   - Menos buscas cruzadas

3. **Escalabilidade**
   - Fácil adicionar helpers novos
   - Fácil adicionar controllers novos
   - Estrutura pronta para crescer

4. **Clareza de Responsabilidades**
   - Controllers globais separados de seção-específicos
   - Managers sempre na seção
   - Helpers sempre com seu controller

### ⚠️ Impacto em Imports

Será necessário atualizar:

```javascript
// ANTES
import './controllers/question/question-controller.js';
import './controllers/question/question-helpers.js';
import './controllers/screenshot/screenshot-controller.js';

// DEPOIS
import './controllers/sections/home/question-controller.js';
import './controllers/sections/home/question-helpers.js';
import './controllers/sections/audio-screen/screenshot-controller.js';
```

**Afeta:** `index.html` (scripts)

---

## 🔗 REFERÊNCIAS NO index.html

### Atual
```html
<script src="./controllers/question/question-helpers.js"></script>
<script src="./controllers/question/question-controller.js"></script>
<script src="./controllers/screenshot/screenshot-controller.js"></script>
<script src="./controllers/modes/mode-manager.js"></script>
```

### Proposto
```html
<script src="./controllers/sections/home/question-helpers.js"></script>
<script src="./controllers/sections/home/question-controller.js"></script>
<script src="./controllers/sections/audio-screen/screenshot-controller.js"></script>
<script src="./controllers/modes/mode-manager.js"></script>
```

---

## 📁 ESTRUTURA FINAL COMPLETA

```
controllers/
│
├── modes/
│   └── mode-manager.js (GLOBAL - modos da app)
│
├── audio/
│   └── audio-controller.js (GLOBAL - STT/LLM)
│
├── config/
│   └── ConfigManager.js (ORQUESTRADOR - centraliza managers)
│
├── sections/
│   │
│   ├── home/
│   │   ├── HomeUIManager.js
│   │   ├── question-controller.js ← MOVIDO
│   │   └── question-helpers.js ← MOVIDO
│   │
│   ├── top-bar/
│   │   └── TopBarManager.js
│   │
│   ├── api-models/
│   │   ├── ApiKeyManager.js
│   │   └── ModelSelectionManager.js
│   │
│   ├── audio-screen/
│   │   ├── AudioDeviceManager.js
│   │   ├── ScreenConfigManager.js
│   │   └── screenshot-controller.js ← MOVIDO
│   │
│   ├── privacy/
│   │   └── PrivacyConfigManager.js
│   │
│   ├── others/
│   │   └── OtherConfigManager.js
│   │
│   ├── info/
│   │   └── InfoManager.js
│   │
│   └── window/
│       └── WindowUIManager.js
│
└── utils/
    └── (utilidades)
```

---

## 🚀 PRÓXIMOS PASSOS

### Fase 1: Aprovação (AGORA)
- [ ] Revisar estrutura proposta
- [ ] Validar se faz sentido
- [ ] Sugerir mudanças se necessário

### Fase 2: Implementação (Se Aprovado)
- [ ] Criar pastas necessárias
- [ ] Mover arquivos
- [ ] Atualizar imports em index.html
- [ ] Atualizar imports em ConfigManager.js
- [ ] Testar se tudo carrega

### Fase 3: Documentação (Se Aprovado)
- [ ] Atualizar mapeamento de estrutura
- [ ] Criar guia "como adicionar nova seção"
- [ ] Documentar padrão por seção

---

## ❓ PERGUNTAS PARA VOCÊ

1. **A estrutura por SEÇÕES faz sentido?**
   - Separar sections/home, sections/api-models, etc?

2. **Mode-manager deve ficar GLOBAL?**
   - Sim, ele não é seção-específico, é transversal

3. **AudioDeviceManager e ScreenConfigManager devem ficar em `audio-screen/`?**
   - Ou em `audio-screen/managers/`?

4. **Ao mover, preciso renomear os Managers?**
   - Ex: `HomeUIManager` → `HomeSectionManager`?

---

**Pronto para refatorar a estrutura?** 🚀
