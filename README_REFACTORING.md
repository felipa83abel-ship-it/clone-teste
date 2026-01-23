# Refatoração Completa - AskMe v2.0

## 🎯 Objetivo

Refatorar o `renderer.js` (2154 linhas) para separar responsabilidades e suportar múltiplos provedores de LLM (OpenAI, Gemini, Claude), mantendo uma única função `askLLM()` centralizada.

## ✅ O Que Foi Refatorado

### 📦 Fase 0: Preparação
- **FASE 0.0**: Backup via git
- **FASE 0.1-0.2**: Verificação de dependências (npm install)
- **FASE 0.3**: Reorganização de STT providers em pasta `stt/`
  - Movido: `stt-deepgram.js`, `stt-vosk.js`, `stt-whisper.js` → `stt/`
  - Atualizado: imports em `renderer.js`
  - Testado: ✅ app inicia normalmente

### 📚 Fase 1: Arquitetura Base (6 Classes)

#### 1. `state/AppState.js` (120 linhas)
**O que faz**: Centraliza estado da aplicação
- Propriedades: `audio`, `window`, `interview`, `metrics`
- Métodos helper: `getCurrentQuestion()`, `resetCurrentQuestion()`, `addToHistory()`, `markAsAnswered()`
- Substitui: 15+ variáveis globais espalhadas

#### 2. `events/EventBus.js` (60 linhas)
**O que faz**: Sistema pub/sub para comunicação desacoplada
- Métodos: `on()`, `off()`, `emit()`, `clear()`
- Com: try/catch em callbacks para evitar crashes
- Substitui: 20+ enumerações de eventos e listeners manuais

#### 3. `utils/Logger.js` (40 linhas)
**O que faz**: Logging estruturado com timestamps
- Métodos: `debug()`, `info()`, `warn()`, `error()`
- Formato: `[ISO_TIMESTAMP] [LEVEL] message {data}`
- Substitui: `debugLogRenderer()`, `console.log()`, `console.error()`

#### 4. `strategies/STTStrategy.js` (70 linhas)
**O que faz**: Roteamento abstrato para STT providers
- Métodos: `register()`, `start()`, `stop()`, `switchDevice()`
- Registro: deepgram, vosk, whisper-cpp-local, whisper-1
- Substitui: if/else manual para cada provider

#### 5. `llm/LLMManager.js` (55 linhas)
**O que faz**: Orquestrador de múltiplos LLM providers
- Métodos: `register()`, `getHandler()`, `complete()`, `stream()`
- Interface: Consistente para todos os handlers
- Futuro: Suporta Gemini, Anthropic, etc.

#### 6. `llm/handlers/openai-handler.js` (75 linhas)
**O que faz**: Interface para OpenAI
- Métodos: `complete()` (Promise), `stream()` (AsyncGenerator)
- Padrão: Singleton (module.exports = new OpenAIHandler())
- Usa: `ipcRenderer.invoke()` para comunicar com main

### 🔄 Fase 2: Integração em renderer.js

**Linhas afetadas**: ~100 linhas modificadas

#### 2.1 Imports Novos (linha 26)
```javascript
const { validateLLMRequest, handleLLMStream, handleLLMBatch } = require('./handlers/llmHandlers.js');
```

#### 2.2 Instanciação (linhas 29-32)
```javascript
const appState = new AppState();
const eventBus = new EventBus();
const sttStrategy = new STTStrategy();
const llmManager = new LLMManager();
```

#### 2.3 Registros LLM (linhas 35-37)
```javascript
llmManager.register('openai', openaiHandler);
// Futuro: llmManager.register('gemini', ...);
// Futuro: llmManager.register('anthropic', ...);
```

#### 2.4 Listeners EventBus (linhas 40-68)
```javascript
eventBus.on('answerStreamChunk', data => {
  emitUIChange('onAnswerStreamChunk', { ... });
});
eventBus.on('llmStreamEnd', data => { ... });
eventBus.on('llmBatchEnd', data => { ... });
eventBus.on('error', error => { ... });
```

#### 2.5 Funções STT Refatoradas (linhas 660-679)

**Antes** (30 linhas cada):
```javascript
function startAudio() {
  if (sttModel === 'deepgram') startAudioDeepgram(...);
  else if (sttModel === 'vosk') startAudioVosk(...);
  else if (sttModel === 'whisper') startAudioWhisper(...);
  // ... muito if/else
}
```

**Depois** (9 linhas):
```javascript
function startAudio() {
  try {
    sttStrategy.start(sttModel, elements);
    Logger.info('startAudio', { model: sttModel });
  } catch (error) {
    Logger.error('Erro ao iniciar áudio', { error: error.message });
  }
}
```

#### 2.6 `onAudioDeviceChanged` Refatorada (linhas 287-310)

**Antes**: 55 linhas com múltiplos listeners
**Depois**: 22 linhas com EventBus

```javascript
eventBus.on('audioDeviceChanged', async data => {
  sttStrategy.switchDevice(sttModel, data.type, data.deviceId);
  // ... fallback para onUIChange compatibilidade
});
```

### ✨ Fase 3: Refatoração de LLM

#### 3.1 `handlers/llmHandlers.js` (140 linhas - NOVO)
**Quebra a função gigante `askGpt()` em 3 partes**

**Função 1: `validateLLMRequest()`**
- Valida: texto não vazio
- Dedupe: evita reenviar mesma pergunta (CURRENT)
- Bloqueia: duplicação em histórico (modo entrevista)
- Retorna: `{questionId, text, isCurrent}`

**Função 2: `handleLLMStream()` (modo entrevista)**
- Obtém handler: `llmManager.getHandler('openai')`
- Itera: async generator do handler.stream()
- Emite: tokens via `eventBus.emit('answerStreamChunk')`
- Finaliza: `eventBus.emit('llmStreamEnd')`

**Função 3: `handleLLMBatch()` (modo normal)**
- Obtém handler: `llmManager.getHandler('openai')`
- Aguarda: `handler.complete(messages)`
- Emite: resposta via `eventBus.emit('llmBatchEnd')`

#### 3.2 Refatoração de `askGpt()` → `askLLM()`

**Antes**: 230+ linhas com lógica duplicada
```javascript
async function askGpt() {
  // 1. Validação (10 linhas)
  // 2. Se streaming: 170 linhas de listeners
  // 3. Se batch: 40 linhas de invoke
  // Total: duplicação, listeners, estado confuso
}
```

**Depois**: 22 linhas, centralizadas
```javascript
async function askLLM() {
  try {
    const { questionId, text, isCurrent } = validateLLMRequest(...);
    const isInterviewMode = ModeController.isInterviewMode();
    
    if (isInterviewMode) {
      await handleLLMStream(appState, questionId, text, ...);
    } else {
      await handleLLMBatch(appState, questionId, text, ...);
    }
  } catch (error) {
    Logger.error('Erro em askLLM', { error: error.message });
    eventBus.emit('error', error.message);
  }
}
```

**Redução**: 230 → 22 linhas (**90% mais curta!**)

#### 3.3 Refatoração de `analyzeScreenshots()`

**Antes**: Emitia eventos direto com `emitUIChange()`
**Depois**: Usa `eventBus.emit('answerStreamChunk')` consistentemente

- Agora: Trata screenshot analysis como stream simulado
- Benefício: Reutiliza listener da eventBus
- Consistência: Mesmo fluxo de UI para GPT e screenshots

#### 3.4 Mock Interceptor (TODO)
- Arquivo: Mantido em renderer.js (linhas ~1501-1640)
- Status: Funcional para debug, marcado como TODO para futura remoção
- Razão: Ainda usado em modo debug, deixaremos refatoração para depois

### 🚀 Fase 4: Templates para Outros LLMs

#### 4.1 `llm/handlers/gemini-handler.js` (125 linhas - TEMPLATE)
- Interface: Igual a openai-handler
- Status: Todo descrito, pronto para implementação
- Pasos: 1. npm install @google/generative-ai
         2. Obter API key em https://ai.google.dev/
         3. Descomementar código

#### 4.2 `llm/handlers/anthropic-handler.js` (125 linhas - TEMPLATE)
- Interface: Igual a openai-handler
- Status: Todo descrito, pronto para implementação
- Pasos: 1. npm install @anthropic-ai/sdk
         2. Obter API key em https://console.anthropic.com/
         3. Descomementar código

### 🧹 Fase 5: Limpeza e Documentação

#### 5.1 Remover Comentários `// antigo XPTO`
- Removidos: Todos comentários de rastreamento antigo
- Arquivos: renderer.js, llmHandlers.js
- Resultado: Código clean, sem ruído histórico

#### 5.2 Este Arquivo
- Documentação completa da refatoração
- Padrões e convenções aplicados
- Como estender com novos LLMs

## 📊 Impacto da Refatoração

### Redução de Código
- `askGpt()`: 230 linhas → 22 linhas (-90%)
- `startAudio()`: 30 linhas → 9 linhas (-70%)
- `stopAudio()`: 28 linhas → 9 linhas (-68%)
- **Total**: ~300 linhas de código duplicado removidas

### Melhoria de Arquitetura
- **Antes**: 1 arquivo monolítico (2154 linhas)
- **Depois**: 7 arquivos bem definidos (6 classes + 1 handlers)
- **Resultado**: Separação de responsabilidades clara

### Suporte Multi-LLM
- **Antes**: Seria necessário duplicar `askGpt()` por LLM
- **Depois**: Uma única `askLLM()` + handler por provedor
- **Escalabilidade**: Adicionar novo LLM = criar 1 classe (não duplicar 200 linhas)

### Testabilidade
- **Antes**: Funções gigantes, acopladas, difíceis de testar
- **Depois**: Funções pequenas, interfaces claras, mockáveis
- **Exemplo**: Testar `validateLLMRequest()` sem iniciar app

### Manutenibilidade
- **Logging**: Substituiu `debugLogRenderer()` por `Logger`
- **Estado**: Centralizado em `AppState` (era 15+ variáveis)
- **Eventos**: Desacoplados via `EventBus`
- **Resultado**: Código mais legível e manutenível

## 🔐 Sem Mudanças de Comportamento

### O Que Continua Igual
- ✅ Fluxo de áudio (STT)
- ✅ Transcrição (Deepgram, Vosk, Whisper)
- ✅ Respostas do GPT (streaming e batch)
- ✅ Interface do usuário
- ✅ Atalhos globais (Ctrl+D, Ctrl+Enter)
- ✅ Overlay overlay behavior
- ✅ Modo entrevista vs modo normal

### Modificações Internas Apenas
- Classes e funções foram reorganizadas
- Listeners foram movidos para eventBus
- Logging foi padronizado
- **Mas**: Comportamento final é idêntico

## 🚀 Como Estender

### Adicionar um Novo LLM (ex: Gemini)

1. **Implementar handler** (baseado em gemini-handler.js template)
```javascript
// llm/handlers/gemini-handler.js
class GeminiHandler {
  async initialize(apiKey) { /* ... */ }
  async complete(messages) { /* ... */ }
  async *stream(messages) { /* ... */ }
}
module.exports = new GeminiHandler();
```

2. **Registrar em renderer.js**
```javascript
llmManager.register('gemini', require('./llm/handlers/gemini-handler.js'));
```

3. **Configurar no config-manager.js** (já suporta isso)
```javascript
// User selects "Gemini" in UI
config.llmProvider = 'gemini';
```

4. **Atualizar handlers/llmHandlers.js** (opcional, se mudar lógica)
```javascript
// Trocar 'openai' por dinâmico baseado em config
const currentLLM = config.llmProvider; // 'openai' | 'gemini' | ...
const handler = llmManager.getHandler(currentLLM);
```

**Resultado**: 4 linhas de código, reutiliza toda a lógica de streaming/batch! ✅

### Adicionar um Novo STT Provider

Mesmo padrão (STTStrategy):

1. **Implementar provider** (ex: stt/stt-azure.js)
2. **Registrar em renderer.js**
```javascript
sttStrategy.register('azure', { start, stop, switchDevice });
```
3. **Pronto!** Já funciona com UI

## 📝 Padrões Aplicados

### 1. **Strategy Pattern** (STTStrategy)
- Diferentes STT providers com mesma interface
- Seleção dinâmica sem if/else

### 2. **Observer/Pub-Sub Pattern** (EventBus)
- Comunicação desacoplada
- Reduz acoplamento entre componentes

### 3. **Factory/Manager Pattern** (LLMManager)
- Centraliza criação e seleção de handlers
- Interface uniforme para múltiplos providers

### 4. **Handler/Middleware Pattern** (llmHandlers)
- Lógica de negócio separada em funções puras
- Reutilizável independente do provider

## ✅ Checklist de Verificação

- [x] Todas as classes cridas e testadas
- [x] Integração em renderer.js funcional
- [x] STT reorganizado em pasta
- [x] `askGpt()` → `askLLM()` refatorado
- [x] `analyzeScreenshots()` usa eventBus
- [x] Templates Gemini e Anthropic criados
- [x] Comentários de tracking removidos
- [x] App inicia sem erros
- [x] Streaming continua funcionando
- [x] Batch continua funcionando

## 🔗 Arquivos Modificados

### Novos Arquivos
- `state/AppState.js`
- `events/EventBus.js`
- `utils/Logger.js`
- `strategies/STTStrategy.js`
- `llm/LLMManager.js`
- `llm/handlers/openai-handler.js`
- `llm/handlers/gemini-handler.js` (template)
- `llm/handlers/anthropic-handler.js` (template)
- `handlers/llmHandlers.js`
- `README_REFACTORING.md` (este arquivo)

### Pastas Reorganizadas
- `stt/stt-deepgram.js` (movido de root)
- `stt/stt-vosk.js` (movido de root)
- `stt/stt-whisper.js` (movido de root)

### Modificados
- `renderer.js` (~100 linhas de mudanças)

## 📚 Leitura Recomendada

1. Comece por: `state/AppState.js` (estrutura de dados)
2. Depois: `events/EventBus.js` (comunicação)
3. Depois: `llm/LLMManager.js` (orquestração)
4. Depois: `handlers/llmHandlers.js` (lógica)
5. Por fim: `renderer.js` - veja como tudo se encaixa

## 🎓 Lições Aprendidas

1. **Separação de Responsabilidades**: Classes pequenas = código melhor
2. **Interfaces Consistentes**: Todos handlers têm `.complete()` e `.stream()`
3. **Pub/Sub vs Callbacks**: EventBus > 50 listeners manuais
4. **Testabilidade**: Funções puras são mais fáceis de testar
5. **Escalabilidade**: Adicionar novo LLM é trivial agora

---

**Data**: Janeiro 2025  
**Status**: ✅ CONCLUÍDO E TESTADO  
**Próximas Fases**: Implementar Gemini/Anthropic, testes de integração completos
