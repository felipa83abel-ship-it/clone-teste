# 📋 Plano: Implementar DOM-Registry

## 📊 Situação Atual

**DOM-Registry.js:**
- ✅ Arquivo existe (utils/DOM-Registry.js - 159 linhas)
- ✅ Carregado em index.html (linha 644)
- ✅ Exporta `globalThis.DOM`
- ✅ Tem 40+ seletores pré-registrados
- ✅ Tem métodos: `get()`, `getAll()`, `getRequired()`, `exists()`, `validate()`
- ❌ **NUNCA é usado no projeto**

**Uso de getElementById espalhado:**
```javascript
// ❌ HomeUIManager.js (~15 usos)
const mockToggle = document.getElementById('mockToggle');
const inputVu = document.getElementById('inputVu');
const listenBtn = document.getElementById('listenBtn');
// ... etc

// ❌ ConfigManager.js (~2 usos)
const resetBtn = document.getElementById('btn-reset-config');
const targetSection = document.getElementById(tabName);

// ❌ index.html (inline)
inputSelect: document.getElementById('audio-input-device'),
outputSelect: document.getElementById('audio-output-device'),
// ... etc
```

---

## 🎯 Objetivo

Centralizar TODOS os acessos a elementos DOM usando `DOM.get()` em vez de `document.getElementById()`.

**Benefícios:**
- ✅ Um único lugar para seletores (manutenção fácil)
- ✅ Fácil refatorar HTML sem tocar lógica
- ✅ Validação centralizada (DOM.validate())
- ✅ Menos acoplamento com DOM
- ✅ Mais testável

---

## 📝 Plano de Implementação

### Phase 1: Setup (1 arquivo)
1. ✅ Confirmar DOM-Registry.js está completo
2. ✅ Verificar que DOM-Registry está em index.html

### Phase 2: Refatorar Controllers (2 arquivos)
3. HomeUIManager.js - Trocar ~15 `document.getElementById()` por `DOM.get()`
4. ConfigManager.js - Trocar ~2 `document.getElementById()` por `DOM.get()`

### Phase 3: Refatorar Scripts Inline (1 lugar)
5. index.html - Trocar 4 usos inline por `DOM.get()`

### Phase 4: Validação
6. Testar app com `npm start`
7. Executar `DOM.validate()` no console

### Phase 5: Commit
8. Fazer commit com mensagem clara

---

## 📌 Padrão de Uso

**Antes (❌ ERRADO):**
```javascript
const mockToggle = document.getElementById('mockToggle');
if (mockToggle) {
  mockToggle.checked = true;
}
```

**Depois (✅ CORRETO):**
```javascript
const mockToggle = DOM.get('mockToggle'); // Retorna null se não existir
if (mockToggle) {
  mockToggle.checked = true;
}
```

**Para elemento obrigatório:**
```javascript
const listenBtn = DOM.getRequired('listenBtn'); // Lança erro se não existir
listenBtn.addEventListener('click', () => { });
```

**Para múltiplos elementos:**
```javascript
const questionBlocks = DOM.getAll('questionBlocks'); // Retorna NodeList
questionBlocks.forEach(block => { });
```

---

## 📋 Checklist de Refatoração

### HomeUIManager.js
- [ ] Trocar `document.getElementById('mockToggle')` → `DOM.get('mockToggle')`
- [ ] Trocar `document.getElementById('inputVu')` → `DOM.get('inputVu')`
- [ ] Trocar `document.getElementById('inputVuHome')` → `DOM.get('inputVuHome')`
- [ ] Trocar `document.getElementById('outputVu')` → `DOM.get('outputVu')`
- [ ] Trocar `document.getElementById('outputVuHome')` → `DOM.get('outputVuHome')`
- [ ] Trocar `document.getElementById('listenBtn')` → `DOM.get('listenBtn')`
- [ ] Trocar `document.getElementById('status-div')` → `DOM.get('statusDiv')`
- [ ] Trocar `document.getElementById('transcriptBox')` → `DOM.get('transcriptBox')`
- [ ] Trocar `document.getElementById('answersHistory')` → `DOM.get('answersHistory')`
- [ ] Trocar `document.getElementById('currentQuestion')` → `DOM.get('currentQuestion')`
- [ ] Trocar `document.getElementById('questionsHistory')` → `DOM.get('questionsHistory')`
- [ ] Trocar `document.getElementById('resetHomeBtn')` → `DOM.get('resetHomeBtn')`
- [ ] Trocar `document.getElementById(elementId)` genérico → usar `DOM.get(elementId)` com fallback
- [ ] Trocar `document.getElementById(tabName)` → `DOM.get(tabName)` ou adicionar ao registry

### ConfigManager.js
- [ ] Trocar `document.getElementById('btn-reset-config')` → `DOM.get('resetConfigBtn')`
- [ ] Trocar `document.getElementById(section)` → `DOM.get(section)` (se seções estão no registry)

### index.html
- [ ] Trocar `document.getElementById('audio-input-device')` → `DOM.get('audioInputDevice')`
- [ ] Trocar `document.getElementById('audio-output-device')` → `DOM.get('audioOutputDevice')`
- [ ] Trocar `document.getElementById('listening-btn')` → Verificar qual é o key correto
- [ ] Trocar `document.getElementById('listen-btn')` → Verificar qual é o key correto

---

## 🔍 Observações Importantes

### 1. Seletores genéricos em HomeUIManager
```javascript
// Problema: elemento dinâmico, ID varia
const element = document.getElementById(elementId);

// Solução: Manter genérico
const element = document.getElementById(elementId); // OK deixar assim
// OU criar padrão no DOM-Registry para classes em vez de IDs
```

### 2. Mapeamento de nomes
Alguns IDs em HTML podem não estar mapeados:
- `'listen-btn'` → Qual é? Está em DOM-Registry?
- `'listening-btn'` → Diferente de 'listenBtn'?

**Ação:** Verificar HTML antes de refatorar

### 3. DOM-Registry.get() vs getRequired()
- `DOM.get('key')` → Retorna null se não existe (seguro)
- `DOM.getRequired('key')` → Lança erro se não existe (assertivo)

Use `getRequired()` quando elemento é obrigatório.

---

## ✅ Conclusão

Após essa refatoração:
- ✅ Todos os `document.getElementById()` estarão em DOM-Registry
- ✅ Nenhum acoplamento direto ao DOM em controllers
- ✅ Seletores centralizados e fáceis de manter
- ✅ `DOM.validate()` fornece relatório de saúde
