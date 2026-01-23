# 🚀 Começar Aqui - AskMe

Bem-vindo ao **AskMe**! Este arquivo ajuda você a começar em 30 segundos.

---

## ❓ O Que Você Quer Fazer?

### 👨‍💻 Vou **Desenvolver** uma nova feature

```
1. Leia: docs/ARCHITECTURE.md (entender como funciona)
2. Procure testes relacionados em: docs/TEST_*.md
3. Siga o padrão: index.html → config-manager.js → renderer.js → main.js
```

### 🧪 Vou **Testar** a aplicação

```
1. Leia: docs/TESTING_INDEX.md (começar aqui!)
2. Teste rápido (5 min): docs/TESTING_INDEX.md → "Teste Rápido"
3. Testes completos: escolha sua seção em docs/TEST_*.md
```

### 📊 Vou **Revisar** código ou entender status

```
1. Leia: docs/DOCS_GUIDE.md (para saber o que procurar)
2. Procure: docs/ARCHITECTURE.md e docs/TEST_*.md
3. Status: docs/REFACTORING_FINAL_STATUS.md
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

### 3️⃣ Ler documentação

- Testar? → [docs/TESTING_INDEX.md](docs/TESTING_INDEX.md)
- Desenvolver? → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
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

- 🧪 [Índice de Testes (77 testes)](docs/TESTING_INDEX.md)
- 📝 [Teste Rápido (5 min)](docs/TESTING_INDEX.md#-teste-rápido-quick-start)

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
