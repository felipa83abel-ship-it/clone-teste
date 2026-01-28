# 🏗️ Arquitetura Final - PHASE 10

**Data:** Janeiro 2026  
**Status:** ✅ Implementado e Validado  
**Versão:** 1.0.0  

---

## 📋 Índice

1. [Princípios Fundamentais](#princípios-fundamentais)
2. [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
3. [Estrutura de Responsabilidades](#estrutura-de-responsabilidades)
4. [Fluxo de Dados](#fluxo-de-dados)
5. [Como Adicionar Nova Feature](#como-adicionar-nova-feature)
6. [Padrões de Implementação](#padrões-de-implementação)
7. [Testes e Validação](#testes-e-validação)
8. [Troubleshooting](#troubleshooting)

---

## Princípios Fundamentais

### 1. Separação de Responsabilidades

```
renderer.js          = Lógica de Negócio PURA (sem DOM)
ConfigManager + Managers = UI e Manipulação de DOM
EventBus             = Canal ÚNICO de comunicação
```

**Garantia:** `renderer.js` NUNCA toca DOM. Nenhuma exceção.

### 2. EventBus como Canal Único

```javascript
// ✅ CORRETO: renderer emite, manager reage
eventBus.emit('transcriptionAdd', { text: 'Olá' });
// → HomeUIManager escuta e atualiza #transcriptBox

// ❌ ERRADO: renderer tocando DOM diretamente
document.getElementById('transcriptBox').innerHTML += '<p>Olá</p>';
```

### 3. Orquestração Central

```javascript
// ConfigManager inicializa TODOS os managers
await globalThis.configManager.initializeController();
// Dentro: loop que inicializa 7 managers em ordem
```

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    index.html (View)                    │
│          (Apenas estrutura HTML, nenhuma lógica)       │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────▼────────────────┐    ┌──────▼─────────────────┐
   │    renderer.js      │    │  ConfigManager.js      │
   │  (Lógica de negócio)│    │  (Orquestração UI)     │
   │                     │    │                        │
   │ • Audio capture     │    │ + 7 Managers:         │
   │ • Interview logic   │    │   ├─ ApiKeyManager    │
   │ • LLM orchestr.     │    │   ├─ AudioDevice..    │
   │ • Transcription     │    │   ├─ ModelSelection.. │
   │ • Screenshots       │    │   ├─ ScreenConfig..   │
   │                     │    │   ├─ PrivacyConfig..  │
   │ NUNCA toca DOM! ✅ │    │   ├─ WindowUIManager  │
   │                     │    │   └─ HomeUIManager    │
   └────────────────────┘    │                        │
           ▲                  └────────────────────────┘
           │                            ▲
           │                            │
           └────────────┬───────────────┘
                        │
                    EventBus
            (Único canal de comunicação)
                        │
            ┌───────────┴───────────┐
            │                       │
      AppState              LLMManager
   (Estado central)    (Orquestração LLM)
            │                       │
      ModeManager            STTStrategy
   (INTERVIEW/NORMAL)  (Deepgram/Vosk/Whisper)
```

---

## Estrutura de Responsabilidades

### 1. renderer.js (Lógica de Negócio Pura)

**O que faz:**
- Captura de áudio (via RendererAPI)
- Orquestração de fluxo de entrevista
- Chamadas ao LLM
- Transcrição de áudio
- Screenshots

**O que NÃO faz:**
- ❌ Nunca manipula DOM
- ❌ Nunca chama `document.getElementById()`
- ❌ Nunca atualiza elementos HTML
- ❌ Nunca usa `querySelector()`

**Como notifica mudanças:**
```javascript
// ✅ CORRETO:
eventBus.emit('transcriptionAdd', { text: 'Nova transcrição' });
eventBus.emit('answerStream', { chunk: 'Resposta...' });
eventBus.emit('interviewEnded', { turnId: 5 });
```

---

### 2. ConfigManager (Orquestrador Central)

**Responsabilidades:**
- Carregar configurações
- Criar instâncias dos 7 managers
- Orquestrar inicialização via `initializeAllManagers()`
- Coordenar estado global

**Método Principal:**
```javascript
async initializeController() {
  // 1. Registrar DOM-Registry
  DOM.register();

  // 2. Carregar config
  this.config = this.loadConfig();

  // 3. Criar instâncias dos managers
  this.apiKeyManager = new ApiKeyManager(...);
  this.audioManager = new AudioDeviceManager(...);
  // ... etc

  // 4. Inicializar todos em coordenação
  await this.initializeAllManagers();
}
```

---

### 3. Os 7 Managers (Unidades de UI)

#### 3.1. HomeUIManager

**Responsável por:**
- Transcrição (#transcriptBox)
- Histórico de perguntas (#questionsHistory)
- Respostas (#answersHistory)
- Status (#status-div)
- Botão de listen (#listenBtn)

**Listeners:**
```javascript
this.eventBus.on('transcriptionAdd', ...)
this.eventBus.on('answerStream', ...)
this.eventBus.on('answerBatchEnd', ...)
this.eventBus.on('listenButtonToggle', ...)
```

#### 3.2. ApiKeyManager

**Responsável por:**
- Salvar/recuperar API keys (OpenAI, Google, etc)
- Usar electron-store encriptado
- UI do modal de API keys

#### 3.3. AudioDeviceManager

**Responsável por:**
- Seleção de dispositivo de entrada/saída
- VU meters (#inputVu, #outputVu)
- Volume indicators

#### 3.4. ModelSelectionManager

**Responsável por:**
- Seleção de modelo LLM
- Seleção de STT provider
- Seleção de modelo TTS

#### 3.5. ScreenConfigManager

**Responsável por:**
- Configurações de screenshot
- Formato da imagem (PNG/JPG)
- Exclusão do app das screenshots

#### 3.6. PrivacyConfigManager

**Responsável por:**
- Ocultação de capturas
- Retenção de dados
- Telemetria

#### 3.7. WindowUIManager

**Responsável por:**
- Opacidade da janela (#opacityRange)
- Click-through (#btnToggleClick)
- Maximizar/minimizar

---

## Fluxo de Dados

### Exemplo: Captura de Áudio e Transcrição

```
1. Usuário aperta Ctrl+D (atalho global em main.js)
   ↓
2. main.js envia CMD_TOGGLE_AUDIO para renderer.js
   ↓
3. renderer.js começa captura via RendererAPI
   ↓
4. Audio chega, renderer.js chama Whisper
   ↓
5. Transcrição completa, renderer.js emite:
   eventBus.emit('transcriptionAdd', { text: 'Olá mundo' })
   ↓
6. HomeUIManager escuta e atualiza #transcriptBox
   ↓
7. UI renderiza nova transcrição
```

### Exemplo: Resposta do LLM (Streaming)

```
1. renderer.js chama ask-llm-stream (via ipc)
   ↓
2. main.js inicia stream com OpenAI
   ↓
3. Cada token chega em LLM_STREAM_CHUNK
   ↓
4. main.js envia para renderer.js via ipc
   ↓
5. renderer.js emite:
   eventBus.emit('answerStream', { chunk: 'A res...' })
   ↓
6. HomeUIManager escuta e atualiza #answersHistory
   ↓
7. Token aparece na UI em tempo real
```

---

## Como Adicionar Nova Feature

### Cenário 1: Feature de Lógica de Negócio

**Exemplo:** Novo algoritmo de processamento de áudio

1. **Edite `renderer.js`:**

```javascript
async function processAudioWithNewAlgorithm(audioBuffer) {
  // Sua lógica aqui
  const result = newAlgorithm(audioBuffer);
  
  // Notifique via EventBus
  eventBus.emit('audioProcessed', { result });
  
  return result;
}
```

2. **Se precisa UI, crie listener em manager:**

```javascript
// Em HomeUIManager ou novo manager
this.eventBus.on('audioProcessed', ({ result }) => {
  const el = DOM.get('audioResultDisplay');
  el.textContent = result;
});
```

### Cenário 2: Nova Feature de UI/Configuração

**Exemplo:** Nova opção de configuração (dark theme)

1. **Crie novo Manager (ou estenda existing):**

```javascript
// controllers/config/managers/ThemeManager.js
class ThemeManager {
  constructor(configManager, ipc, eventBus) {
    this.eventBus = eventBus;
  }

  async initialize() {
    // Registrar listeners de UI
    this.eventBus.on('themeChanged', ({ theme }) => {
      document.documentElement.setAttribute('data-theme', theme);
    });
  }
}
```

2. **Adicione em ConfigManager.initializeAllManagers():**

```javascript
const managers = [
  // ... existing managers ...
  { name: 'ThemeManager', instance: this.themeManager },
];
```

3. **Quando quer mudar tema, renderer emite:**

```javascript
eventBus.emit('themeChanged', { theme: 'dark' });
```

---

## Padrões de Implementação

### 1. Pattern: EventBus para UI Updates

```javascript
// ✅ CORRETO EM RENDERER:
eventBus.emit('myEvent', { data: 'value' });

// ✅ CORRETO EM MANAGER:
this.eventBus.on('myEvent', ({ data }) => {
  const el = DOM.get('myElement');
  el.textContent = data;
});
```

### 2. Pattern: Usar DOM-Registry

```javascript
// ❌ NÃO FAÇA:
const el = document.getElementById('myElement');

// ✅ FAÇA:
const el = DOM.get('myElement');

// Ou adicione na DOM-Registry primeiro:
// selectors: {
//   myElement: '#myElement'
// }
```

### 3. Pattern: Inicialização de Manager

```javascript
class MyManager {
  constructor(configManager, ipc, eventBus) {
    this.configManager = configManager;
    this.ipc = ipc;
    this.eventBus = eventBus;
  }

  async initialize() {
    console.log('🚀 MyManager inicializando...');
    
    // 1. Registrar listeners de EventBus
    this.#initEventBusListeners();
    
    // 2. Registrar listeners de DOM (cliques, etc)
    this.#initDOMEventListeners();
    
    // 3. Restaurar estado salvo
    await this.restoreState();
    
    console.log('✅ MyManager inicializado');
  }

  #initEventBusListeners() {
    this.eventBus.on('myEvent', ({ data }) => {
      // Handle
    });
  }

  #initDOMEventListeners() {
    const btn = DOM.get('myButton');
    if (btn) {
      btn.addEventListener('click', () => {
        this.eventBus.emit('buttonClicked');
      });
    }
  }

  async restoreState() {
    // Recuperar estado de AppState ou localStorage
  }
}
```

---

## Testes e Validação

### Checklist de Integração

```bash
# 1. App inicia
npm start
# ✅ Sem erros
# ✅ Console mostra inicialização de cada manager
# ✅ Aplicação está responsiva

# 2. Testes passam
npm test
# ✅ 85+/86 testes passam
# ✅ Nenhum erro de arquitetura

# 3. Sem violações
grep -r "document\.getElementById\|addEventListener" renderer.js | grep -v "^//" | wc -l
# ✅ Retorna 0 resultados
```

### Como Testar Nova Feature

1. **Adicione teste unitário:**

```javascript
describe('MyFeature', () => {
  test('should emit event when triggered', () => {
    const eventBus = new EventBus();
    const spy = jest.fn();
    
    eventBus.on('myEvent', spy);
    eventBus.emit('myEvent', { data: 'test' });
    
    expect(spy).toHaveBeenCalled();
  });
});
```

2. **Teste manualmente:**

```bash
npm start
# Verificar no console que eventos são emitidos corretamente
# Verificar no DevTools que DOM foi atualizado
```

---

## Troubleshooting

### Problema: "Elemento não encontrado: myElement"

**Causa:** Elemento não foi registrado no DOM-Registry

**Solução:**

1. Abra `utils/DOM-Registry.js`
2. Adicione selector:
   ```javascript
   selectors: {
     myElement: '#myElement',
   }
   ```
3. `npm start` novamente

---

### Problema: "renderer.js manipulando DOM"

**Causa:** Código em renderer.js fazendo `document.getElementById()`

**Solução:**

1. Remova a manipulação de DOM de renderer.js
2. Crie/estenda um Manager para lidar com a UI
3. Use eventBus para comunicação:
   ```javascript
   // Em renderer.js:
   eventBus.emit('myUIUpdate', { value: 42 });
   
   // Em Manager:
   this.eventBus.on('myUIUpdate', ({ value }) => {
     DOM.get('myElement').textContent = value;
   });
   ```

---

### Problema: "ConfigManager não está inicializando managers"

**Causa:** Método `initializeAllManagers()` não foi implementado

**Solução:**

Verifique se ConfigManager tem:

```javascript
async initializeAllManagers() {
  for (const { name, instance } of managers) {
    await instance.initialize();
  }
}
```

---

## Boas Práticas

✅ **FAÇA:**

- Emita eventos do renderer, ouça nos managers
- Use DOM-Registry para acessar elementos
- Mantenha renderer.js focado em lógica
- Documente listeners em cada manager
- Testes para features novas
- Commits limpos e descritivos

❌ **NÃO FAÇA:**

- Manipule DOM em renderer.js
- Use `document.getElementById()` diretamente
- Crie listeners de DOM em renderer.js
- Adicione lógica em managers
- Listeners duplicados (um lugar só)
- Commits mistos (um commit = uma feature)

---

## Referências

- [Electron Best Practices](https://www.electronjs.org/docs/tutorial/security)
- [Event-Driven Architecture](https://en.wikipedia.org/wiki/Event-driven_architecture)
- [Separation of Concerns](https://en.wikipedia.org/wiki/Separation_of_concerns)

---

**Última atualização:** Janeiro 2026  
**Mantido por:** GitHub Copilot  
**Status:** ✅ Produção

