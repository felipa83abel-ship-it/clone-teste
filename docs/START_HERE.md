# 🚀 Começar Aqui - AskMe

Bem-vindo ao **AskMe**! Refatoração Fases 1-6 concluídas (jan 2026) com consolidação de Estado, Eventos, Modo, Testes e Limpeza.

---

## ❓ O Que Você Quer Fazer?

### 👨‍💻 Vou **Desenvolver** uma nova feature

```
1. Leia: docs/ARCHITECTURE.md (entender como funciona agora)
   - AppState centralizado
   - EventBus único
   - ModeManager para lógica de modo
   - JSDoc para type hints
2. Execute testes: npm test (validar antes de mudanças)
3. Siga o padrão:
   - Estado: AppState (state/AppState.js)
   - Eventos: EventBus (events/EventBus.js)
   - Modo: ModeManager (mode-manager.js)
   - Tipos: Adicionar @typedef JSDoc aos novos módulos
```

### 🧪 Vou **Testar** a aplicação

```
1. Testes Unitários (74 testes): npm test
2. Testes E2E (11 cenários): npm run test:e2e
3. Documentação: docs/TESTING_INDEX.md
```

### 📊 Vou **Revisar** código ou entender status

```
1. Leia: docs/DOCS_GUIDE.md (para saber o que procurar)
2. Refatoração: docs/ARCHITECTURE.md (Fases 1-6 CONCLUÍDAS)
3. Procure: docs/ARCHITECTURE.md → Mudanças na Refatoração
```

---

## 🏃 Quick Start (5 minutos)

### 1️⃣ Instalar

```bash
npm install
npm start
```

### 2️⃣ Testar se funciona

- Clique no ícone de microfone
- Fale: "Olá"
- Veja o texto aparecer
- Clique em "Gerar resposta" (ou Ctrl+Enter)
- Veja resposta aparecer com badge de turno

### 3️⃣ Entender a arquitetura

**Camadas principais** (após refatoração Fases 1-6):

```
renderer.js (1755 linhas)
├── AppState (state/AppState.js) ........... Centraliza todo o estado
├── EventBus (events/EventBus.js) ......... Sistema único de eventos
├── ModeManager (mode-manager.js) ......... Lógica de modo
├── Event Listeners (linhas 42-85) ....... Handlers de eventos
├── askLLM() / handleQuestionClick() ...... Fluxo principal
└── Exporta window.RendererAPI ........... Bridge para config-manager

config-manager.js (2626 linhas)
├── Listeners para EventBus ............... answerStream, answerBatchEnd
├── DOM rendering ......................... Markdown, badges, scroll
├── localStorage + electron-store ........ Persistência segura
└── UI Tabs .............................. Geral, API, Áudio, Privacidade

AppState (state/AppState.js) [COM JSDoc TYPE HINTS]
├── history: [] ........................... Perguntas e respostas
├── interview.currentQuestion ............ Pergunta sendo formada
├── interview.interviewTurnId ............ Counter de turnos
└── selectedId, isRunning, ... ........... Acessores centralizados
```

### 4️⃣ Principais mudanças pós-refatoração (Fases 1-6)

✅ **Fase 1**: Removido debugLogRenderer(), isolado mock em arquivo separado  
✅ **Fase 2**: Removidas 16 variáveis globais → AppState centralizado  
✅ **Fase 3**: Removidos UICallbacks + onUIChange() → EventBus único  
✅ **Fase 4**: Criado ModeManager para lógica de modo centralizada  
✅ **Fase 5**: 74 testes unitários (Jest) + 11 testes E2E (Playwright)  
✅ **Fase 6**: Removidos comentários deprecated, código morto  
✅ **Resultado**: renderer.js -351 linhas, codebase muito mais limpo

### 5️⃣ Conceitos importantes

- Testar? → [docs/TESTING_INDEX.md](docs/TESTING_INDEX.md)
- Desenvolver? → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Tipos? → Usar JSDoc (@typedef, @param, @returns)
- Ajuda geral? → [docs/DOCS_GUIDE.md](docs/DOCS_GUIDE.md)

---

## 📚 Documentação Principal

| Arquivo                                                | Para quem                      | Tempo  |
| ------------------------------------------------------ | ------------------------------ | ------ |
| [docs/DOCS_GUIDE.md](docs/DOCS_GUIDE.md)               | Qualquer um - ponto de entrada | 5 min  |
| [docs/TESTING_INDEX.md](docs/TESTING_INDEX.md)         | Testers                        | 10 min |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)           | Developers                     | 20 min |
| [docs/TEST_HOME.md](docs/TEST_HOME.md)                 | Testes da home                 | 45 min |
| [docs/TEST_API_MODELS.md](docs/TEST_API_MODELS.md)     | Testes de API                  | 30 min |
| [docs/TEST_AUDIO_SCREEN.md](docs/TEST_AUDIO_SCREEN.md) | Testes de áudio                | 25 min |
| [docs/TEST_OTHER.md](docs/TEST_OTHER.md)               | Testes de config               | 35 min |
| [docs/TEST_PRIVACY.md](docs/TEST_PRIVACY.md)           | Testes de privacidade          | 30 min |

---

## 🎯 Links Principais

**Testar:**

- 🧪 [Testes Unitários: npm test (74 testes)](docs/TESTING_INDEX.md)
- 🎭 [Testes E2E: npm run test:e2e (11 cenários)](docs/TESTING_INDEX.md)

**Desenvolver:**

- 🏛️ [Arquitetura](docs/ARCHITECTURE.md)
- 📖 [Guia de Navegação](docs/DOCS_GUIDE.md)

**Entender:**

- ✨ [Features](docs/FEATURES.md)
- 📋 [Status de Refatoração](docs/REFACTORING_FINAL_STATUS.md)

---

## ⚡ Comandos Principais

```bash
# Desenvolvimento
npm install      # Instalar dependências
npm start        # Iniciar app (dev mode)

# Produção
npm run build    # Build para produção

# Testes
# (Não há testes automatizados, veja docs/TESTING_INDEX.md para testes manuais)
```

---

## 🎮 Atalhos do Teclado

| Atalho         | Ação                   |
| -------------- | ---------------------- |
| `Ctrl+D`       | Iniciar/parar escuta   |
| `Ctrl+Enter`   | Enviar pergunta ao GPT |
| `Ctrl+Shift+I` | Abrir DevTools         |

---

## 📝 Estrutura Rápida

```
docs/
├── DOCS_GUIDE.md         ← Guia completo de navegação
├── TESTING_INDEX.md      ← Índice de 77 testes
├── ARCHITECTURE.md       ← Como funciona internamente
├── TEST_HOME.md          ← Testes da home (20)
├── TEST_API_MODELS.md    ← Testes de API (16)
├── TEST_AUDIO_SCREEN.md  ← Testes de áudio (13)
├── TEST_OTHER.md         ← Testes de config (15)
└── TEST_PRIVACY.md       ← Testes de privacidade (13)

main.js                    ← Backend (Electron)
renderer.js                ← Lógica (Services)
config-manager.js          ← UI (Controller)
index.html                 ← Interface (View)
```

---

## ❓ FAQ Rápido

**P: Por onde começo?**  
R: Se testar: [TESTING_INDEX.md](docs/TESTING_INDEX.md). Se desenvolver: [ARCHITECTURE.md](docs/ARCHITECTURE.md).

**P: Quanto tempo leva testar tudo?**  
R: ~3 horas para 77 testes. Ou 5 minutos para teste rápido.

**P: Como adiciono um teste?**  
R: Abra [docs/DOCS_GUIDE.md](docs/DOCS_GUIDE.md) → seção "Para Adicionar Novos Testes".

**P: Qual é o stack?**  
R: Electron 39, Node 18+, OpenAI API. Veja [ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🆘 Preciso de Ajuda

1. **Problema técnico?** → Veja [Troubleshooting](README.md#-troubleshooting) no README
2. **Não consegue testar?** → [TESTING_INDEX.md](docs/TESTING_INDEX.md#-troubleshooting-section)
3. **Entender código?** → [ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. **Qual documento ler?** → [DOCS_GUIDE.md](docs/DOCS_GUIDE.md)

---

**Versão:** 1.0  
**Última atualização:** 2024  
**Status:** ✅ Pronto para desenvolver e testar
