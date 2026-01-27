# 🚀 Quick Start - Arquitetura AskMe

## TL;DR (Resumo Executivo em 2 minutos)

Projeto reorganizado em **3 camadas principais**:

```
┌─────────────────────────────────────────────────────────────┐
│ UI CONTROLLERS (controllers/)                                │
│ ├─ Seção-específica (home/, api-models/, audio-screen/, ...) │
│ └─ Global (modes/, audio/)                                   │
├─────────────────────────────────────────────────────────────┤
│ SERVICES (services/)                                         │
│ ├─ stt/ (Deepgram, Vosk, Whisper)                            │
│ ├─ llm/ (OpenAI, Gemini)                                     │
│ └─ audio/ (Captura, processamento)                           │
├─────────────────────────────────────────────────────────────┤
│ INFRA (infra/)                                              │
│ ├─ bus/EventBus.js (Pub/Sub)                                 │
│ └─ state/AppState.js (Estado Global)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Onde Está o Quê?

| Preciso de... | Procuro em... | Exemplo |
|---------------|---------------|---------|
| Fazer pergunta (UI) | `controllers/sections/home/` | HomeUIManager.js |
| Transcrever áudio | `services/stt/` | stt-deepgram.js |
| Chamar OpenAI | `services/llm/handlers/` | openai-handler.js |
| Selecionar modelo | `controllers/sections/api-models/` | ModelSelectionManager.js |
| Estado global | `infra/state/` | AppState.js |
| Comunicar componentes | `infra/bus/` | EventBus.js |
| Lógica de captura | `controllers/audio/` | audio-controller.js |
| Seleção de modo | `controllers/modes/` | mode-manager.js |

---

## 🔄 Fluxo: Usuário Diz Pergunta

```
1. 🎤 Microfone
   └─> controllers/audio/audio-controller.js
       └─> services/stt/stt-deepgram.js (ou vosk)
           └─> "qual é meu nome?"

2. ❓ Aparece na tela
   └─> controllers/sections/home/HomeUIManager.js
       └─> Renderiza em #currentQuestion

3. 📤 Usuário clica "Perguntar IA"
   └─> services/llm/LLMManager.js
       └─> services/llm/handlers/openai-handler.js
           └─> "Seu nome é dado no arquivo de config..."

4. 📝 Resposta aparece
   └─> controllers/sections/home/HomeUIManager.js
       └─> Renderiza em #llmAnswer

✅ TUDO SINCRONIZADO via infra/bus/EventBus.js
```

---

## 🛠️ Como Adicionar Novo STT (ex: AssemblyAI)

```javascript
// 1. Criar arquivo: services/stt/stt-assemblyai.js
class AssemblyAIProvider {
  async start(elements) { /* connect */ }
  async stop() { /* disconnect */ }
}

// 2. Registrar em renderer.js
globalThis.stt.register('assemblyai', new AssemblyAIProvider());

// 3. Selecionar na UI (ja funciona!)
// AudioDeviceManager.js detecta novo provider automaticamente
```

**Resultado:** Nenhum outro arquivo precisa mudar! ✨

---

## 🛠️ Como Adicionar Novo LLM (ex: Anthropic)

```javascript
// 1. Criar: services/llm/handlers/anthropic-handler.js
class AnthropicHandler {
  async complete(messages) { /* call API */ }
  async stream(messages) { /* stream tokens */ }
}

// 2. Registrar em renderer.js
globalThis.llmManager.register('anthropic', anthropicHandler);

// 3. Usuário seleciona na UI
// Já funciona! Controllers não mudam!
```

---

## 📚 Documentação Completa

📖 **Leia:** [`docs/ARQUITETURA_FINAL.md`](docs/ARQUITETURA_FINAL.md)
- Estrutura visual completa
- Responsabilidades de cada arquivo
- Fluxos de dados
- Como testar
- Princípios arquiteturais

---

## 🧪 Testes

```bash
# Unit test
npm test -- services/llm/handlers/openai-handler.test.js

# Integration test
npm test -- core-systems.integration.test.js

# E2E test
npm test -- happy-path.test.js
```

---

## 🔍 Debug

**Onde está a função XYZ?**
1. Procure em `controllers/sections/` (UI)
2. Se não encontrar, procure em `services/` (lógica de integração)
3. Se estado, procure em `infra/state/AppState.js`
4. Se comunicação, procure em `infra/bus/EventBus.js`

**Por que o evento XYZ não está sendo escutado?**
1. Procure em `infra/bus/EventBus.js`: grep por nome do evento
2. Procure quem emite: grep por `eventBus.emit('XYZ')`
3. Procure quem escuta: grep por `eventBus.on('XYZ')`
4. Verifique ordem de inicialização: listeners ANTES de elementos

---

## 📊 Arquitetura em uma Página

```
┌─────────────────────────────────────────────────────────────────┐
│                      ELECTRON MAIN (main.js)                    │
│                        IPC Handlers                              │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    HTML (index.html)                             │
│                  Carrega todos scripts                           │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────────┐
│ CONTROLLERS (renderer.js initialized by ConfigManager.js)       │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Seção-Específico (home, api-models, audio-screen, ...)    │  │
│ │ + Global (audio, modes)                                    │  │
│ └────────────────────────────────────────────────────────────┘  │
└────────────┬──────────────────────────────────┬─────────────────┘
             │ Escuta eventos                   │ Emite eventos
             ↓                                  ↑
┌────────────────────────────────────────────────────────────────┐
│ INFRA (EventBus & AppState)                                    │
│ ┌──────────────┐        ┌──────────────┐                       │
│ │  EventBus.js │ ←→     │ AppState.js  │                       │
│ │  (pub/sub)   │        │ (state)      │                       │
│ └──────────────┘        └──────────────┘                       │
└────────────┬──────────────────────────────────┬─────────────────┘
             │ Chama services                   │ Atualiza estado
             ↓                                  ↑
┌────────────────────────────────────────────────────────────────┐
│ SERVICES (APIs, Hardware, Integrações)                         │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│ │  STT Service │  │  LLM Service │  │Audio Service │           │
│ │(Deepgram,etc)│  │(OpenAI, etc) │  │(Microfone)   │           │
│ └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
         ↕                    ↕                    ↕
    [STT API]           [LLM API]           [Hardware]
```

---

## ✅ Status

| Componente | Status | Notas |
|-----------|--------|-------|
| Infraestrutura | ✅ | EventBus + AppState centralizados |
| Services STT | ✅ | Deepgram, Vosk, Whisper funcionando |
| Services LLM | ✅ | OpenAI, Gemini funcionando |
| Controllers | ✅ | 8 seções + 2 globais |
| Core (futuro) | 🔄 | Diretório criado, pronto para lógica pura |
| Testes | ✅ | Unit, Integration, E2E |
| npm start | ✅ | Funcionando sem erros |

---

## 🚀 Próximos Passos

1. **Usar:** Comece desenvolvendo em `controllers/sections/`
2. **Adicionar service:** Crie em `services/`
3. **Comunicar:** Use `infra/bus/EventBus.js`
4. **Estado:** Use `infra/state/AppState.js`
5. **Documentar:** Adicione JSDoc/comentários

---

## 💡 Princípio Fundamental

> **Quando em dúvida, desacople o código.**

- Controllers não importam services diretamente (usam EventBus)
- Services não sabem de controllers (apenas registram-se)
- Infra é agnóstica (não sabe de LLM, STT, ou UI)

---

## 📞 Dúvidas?

- Leia: [`docs/ARQUITETURA_FINAL.md`](docs/ARQUITETURA_FINAL.md)
- Procure: JSDoc comments em cada arquivo
- Veja: Exemplos em `__tests__/`

---

**Status:** ✅ PRONTO PARA USO  
**Versão:** 1.0  
**Data:** 27 de Janeiro de 2026

