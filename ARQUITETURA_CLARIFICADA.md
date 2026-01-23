# 🏗️ ARQUITETURA CLARIFICADA - Respostas às Dúvidas

## ❓ Dúvida 1: Pacotes/Pastas Separando Funcionalidades?

✅ **SIM!** A estrutura final será assim:

```
projeto/
├─ renderer.js (refatorado)
├─ config-manager.js (sem mudanças)
├─ main.js (sem mudanças)
│
├─ state/
│  └─ AppState.js (centraliza 15 variáveis globais)
│
├─ events/
│  └─ EventBus.js (pub/sub para 20+ callbacks)
│
├─ utils/
│  └─ Logger.js (logging estruturado)
│
├─ strategies/
│  └─ STTStrategy.js (roteamento de STT)
│
├─ handlers/
│  └─ askGptHandlers.js (quebra de askGpt() em 3 funções)
│
├─ llm/
│  ├─ LLMManager.js (orquestrador)
│  └─ handlers/
│     ├─ openai-handler.js (interface para OpenAI)
│     ├─ gemini-handler.js (template para Gemini)
│     └─ anthropic-handler.js (template para Anthropic)
│
├─ stt/  ← NOVO (reorganizado)
│  ├─ stt-deepgram.js
│  ├─ stt-vosk.js
│  └─ stt-whisper.js
```

---

## ❓ Dúvida 2: askGPT é Duplicado para Cada LLM?

✅ **NÃO! askGPT é CENTRALIZADO e SEM DUPLICAÇÃO**

### Antes (Errado - Duplicação):

```
renderer.js
├─ askGpt_openai() { ... }  ← Duplica lógica
├─ askGpt_gemini() { ... }   ← Duplica lógica
└─ askGpt_anthropic() { ... } ← Duplica lógica
```

### Depois (Correto - Centralizado):

```
renderer.js
├─ askGpt()  ← UMA ÚNICA função
│  ├─ validateAskGptRequest()
│  └─ handleAskGptStream() ou handleAskGptBatch()
│     └─ llmManager.stream() ← roteia para qual handler usar
│
llm/handlers/
├─ openai-handler.js
│  ├─ complete(messages) ← recebe via LLMManager
│  └─ stream(messages) ← recebe via LLMManager
├─ gemini-handler.js
│  ├─ complete(messages)
│  └─ stream(messages)
└─ anthropic-handler.js
   ├─ complete(messages)
   └─ stream(messages)
```

### O Fluxo:

```
renderer.js: askGpt(prompt)
    ↓
    validateAskGptRequest(prompt)  ← valida uma vez
    ↓
    handleAskGptStream(prompt, llmManager)  ← modo entrevista
    ↓
    llmManager.stream(prompt)  ← "qual LLM usar?"
    ↓
    openai-handler.js OR gemini-handler.js OR anthropic-handler.js
    ↓
    Retorna tokens para renderer.js renderizar
```

### Por Que Não Duplica?

1. **LLM Handlers** = apenas interface (complete, stream)
2. **askGpt()** = lógica centralizada
3. **LLMManager** = roteador (sabe qual usar)

**Resultado:** 1 askGpt() para todos os LLMs! 🎯

---

## ❓ Dúvida 3: Os STTs Também Vão em Pastas?

✅ **SIM! Vão em pasta `stt/`**

### Antes:

```
projeto/
├─ stt-deepgram.js
├─ stt-vosk.js
└─ stt-whisper.js
```

### Depois:

```
projeto/
└─ stt/
   ├─ stt-deepgram.js
   ├─ stt-vosk.js
   └─ stt-whisper.js
```

### Atualizar Imports em renderer.js:

```javascript
// DE:
const DeepgramSTT = require('./stt-deepgram.js');
const VoskSTT = require('./stt-vosk.js');

// PARA:
const DeepgramSTT = require('./stt/stt-deepgram.js');
const VoskSTT = require('./stt/stt-vosk.js');
```

---

## 📌 RESUMO DA ARQUITETURA

| Aspecto                  | Antes                            | Depois                                        |
| ------------------------ | -------------------------------- | --------------------------------------------- |
| **Pastas**               | Tudo na raiz                     | Organizado (state/, events/, llm/, stt/, etc) |
| **askGpt()**             | 170 linhas, gigante              | 15 linhas, limpo e centralizado               |
| **Duplicação**           | Potencial askGpt() para cada LLM | SEM duplicação (1 askGpt(), N handlers)       |
| **STTs**                 | Na raiz                          | Em pasta `stt/`                               |
| **LLM Handlers**         | N/A                              | Interface pura (complete, stream)             |
| **Roteamento LLM**       | Manual (if/else)                 | Automático (LLMManager)                       |
| **Suporte a novos LLMs** | Difícil (duplica código)         | Fácil (2 linhas)                              |

---

## 🎯 ADICIONAR NOVO LLM (Exemplo Gemini)

### Passo 1: Copiar Handler

```bash
cp llm/handlers/gemini-handler.js llm/handlers/gemini-handler.js
```

### Passo 2: Implementar Métodos

```javascript
// llm/handlers/gemini-handler.js
class GeminiHandler {
	async complete(messages) {
		// conecta ao Gemini API
	}

	async stream(messages) {
		// conecta ao Gemini API com streaming
	}
}
```

### Passo 3: Registrar em renderer.js (2 linhas!)

```javascript
const geminiHandler = require('./llm/handlers/gemini-handler.js');
llmManager.register('gemini', geminiHandler);
```

### Pronto!

`askGpt()` automaticamente funciona com Gemini, sem mexer em nada!

---

## ✅ CHECKLIST DE ENTENDIMENTO

- [ ] Arquitetura = pastas separadas para state/, events/, llm/, stt/, etc
- [ ] askGpt() = CENTRALIZADO em renderer.js (sem duplicação)
- [ ] LLM Handlers = interface pura (complete, stream)
- [ ] LLMManager = roteia para qual handler usar
- [ ] STTs = reorganizados em pasta stt/
- [ ] Adicionar novo LLM = 2 linhas em renderer.js + 1 arquivo handler
- [ ] Sem código duplicado = mesmo askGpt() para OpenAI, Gemini, Anthropic

**Se checou tudo = Você está pronto para começar a refatoração! 🚀**
