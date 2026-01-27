# 📝 Padrão de Uso do Logger - Definição

## ✅ Padrão Recomendado

### 1. **Arquivos Carregados via `<script>` tag (Renderer/DOM)**

Use `@ts-nocheck` + `/* global Logger */` + `Logger` (sem `globalThis`):

```javascript
// @ts-nocheck ← CRÍTICO! Sem isso, TypeScript reclama
/* global Logger */

/**
 * HomeUIManager - Gerencia interface do HOME
 */
class HomeUIManager {
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;
  }

  async initialize() {
    // ✅ CORRETO: Sem globalThis, sem duplicação
    Logger.debug('🏠 HomeManager: Iniciando');
    Logger.info('Listeners registrados');
  }
}
```

**Por que `@ts-nocheck` é necessário?**
- Logger é injetado dinamicamente em `globalThis` via script
- TypeScript não consegue verificar tipos em globals injetados
- `@ts-check` + `/* global Logger */` gera erro (conflito)
- `@ts-nocheck` desativa type checking no arquivo (aceitável pois é DOM script)

**Vantagens:**
- ✅ Código limpo: `Logger` em vez de `globalThis.Logger`
- ✅ ESLint não reclama (comentário global avisa sobre a variável)
- ✅ TypeScript não interfere
- ✅ Fácil refatorar depois

---

### 2. **Arquivos CommonJS (Node.js - main.js, handlers)**

Use `require()`:

```javascript
// main.js (Node.js puro, sem @ts-nocheck)
const Logger = require('./utils/Logger.js');

class MyHandler {
  handle() {
    // ✅ CORRETO: Via require
    Logger.info('Processando...');
  }
}
```

**Vantagens:**
- ✅ Type checking funciona normalmente
- ✅ Sem globals, módulos puros
- ✅ Testável

---

## ❌ Anti-padrões & Soluções

### ❌ 1. Usar `@ts-check` com globals injetados

```javascript
// ❌ ERRADO: @ts-check vai reclamar
// @ts-check
/* global Logger */
Logger.debug('Test'); // Error: Logger is not defined!
```

**Solução:** Trocar para `@ts-nocheck`
```javascript
// ✅ CORRETO:
// @ts-nocheck
/* global Logger */
Logger.debug('Test'); // OK!
```

---

### ❌ 2. Usar `globalThis.Logger` em scripts DOM

```javascript
// ❌ ERRADO: Verboso e redundante
globalThis.Logger.info('Algo');
```

**Solução:** Com `@ts-nocheck`, usar `Logger` direto
```javascript
// ✅ CORRETO:
// @ts-nocheck
/* global Logger */
Logger.info('Algo'); // Limpo!
```

---

### ❌ 3. Sem exportar `globalThis.Logger` em Logger.js

```javascript
// Logger.js - ❌ ERRADO: Não exporta para globalThis
class Logger {
  static info(msg) { }
}
module.exports = Logger; // Só CommonJS, não globalThis!
```

**Solução:** Adicionar no fim de Logger.js:
```javascript
if (typeof globalThis !== 'undefined') {
  globalThis.Logger = Logger; // ✅ Necessário!
}
module.exports = Logger;
```

---

### ❌ 4. ESLint reclamando sobre classe nunca usada

```javascript
// ❌ ESLint aviso: 'ConfigManager' is defined but never used
class ConfigManager {
  // ...
}
globalThis.configManager = new ConfigManager(); // Lowercase!
```

**Solução:** Adicionar comment de ignorar
```javascript
// eslint-disable-next-line no-unused-vars
class ConfigManager {
  // ...
}
globalThis.configManager = new ConfigManager();
```

---

## 🎯 Checklist para Novos Arquivos

### Script DOM (carregado via `<script>`)

- [ ] **`@ts-nocheck`** no início (escrever assim: `// @ts-nocheck`)
- [ ] **`/* global Logger */`** após `@ts-nocheck`
- [ ] Usa `Logger.info()`, `Logger.debug()`, etc (SEM `globalThis`)
- [ ] Sem duplicação de `globalThis`

**Template:**
```javascript
// @ts-nocheck
/* global Logger */

// Seu código aqui...
```

### CommonJS (Node.js - main.js, handlers)

- [ ] **SEM** `@ts-nocheck` (type checking ativo)
- [ ] **`const Logger = require('./utils/Logger.js')`** no topo
- [ ] Usa `Logger.info()` normalmente
- [ ] Exporta com `module.exports` se for classe

**Template:**
```javascript
const Logger = require('./utils/Logger.js');

class MyHandler {
  // Seu código aqui...
}

module.exports = MyHandler;
```

---

## 📊 Resumo Visual

```
┌─────────────────────────────────────────────────────┐
│ SCRIPT DOM (via <script> tag)                      │
├─────────────────────────────────────────────────────┤
│ // @ts-nocheck                                     │
│ /* global Logger */                                │
│                                                    │
│ Logger.info('msg');  ← SEM globalThis              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ CommonJS (Node.js)                                 │
├─────────────────────────────────────────────────────┤
│ const Logger = require('./utils/Logger.js');      │
│                                                    │
│ Logger.info('msg');  ← Direto do require           │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 Implementação - Status

✅ **Feito:**
- ✅ Logger.js exporta `globalThis.Logger`
- ✅ renderer.js padronizado (`@ts-nocheck` + `/* global Logger */`)
- ✅ audio-controller.js padronizado
- ✅ renderer-helpers.js corrigido e padronizado
- ✅ ConfigManager.js - ESLint comment adicionado

⏳ **Próximas (opcional):**
- Padronizar services/ (stt-*.js, llmHandlers.js)
- Adicionar ESLint rule para enforçar padrão
- Criar snippets VSCode para templates rápidos

