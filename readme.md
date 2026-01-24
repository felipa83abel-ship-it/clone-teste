# AskMe - Assistente de Entrevistas com IA

> Clone do Perssua - Sistema de transcrição de áudio e assistente GPT para entrevistas técnicas

![Versão](https://img.shields.io/badge/versão-1.0.0-blue)
![Electron](https://img.shields.io/badge/Electron-39.2.7-47848F?logo=electron)
![Node](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js)
![License](https://img.shields.io/badge/license-ISC-green)

> **👉 Novo por aqui?** Leia [START_HERE.md](START_HERE.md) primeiro! (5 minutos)

---

## 📋 Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Funcionalidades Principais](#funcionalidades-principais)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Execução](#execução)
- [Documentação](#documentação)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Sobre o Projeto

**AskMe** é uma aplicação desktop construída com Electron que funciona como assistente de entrevistas técnicas. Utiliza:

- **Transcrição de áudio** via OpenAI Whisper (Speech-to-Text)
- **Respostas inteligentes** via GPT (OpenAI, Google Gemini, OpenRouter ou API customizada)
- **Monitoramento em tempo real** de áudio de entrada (microfone) e saída (VoiceMeeter/speaker)
- **Interface overlay** com transparência e always-on-top
- **Armazenamento seguro** de API keys via `electron-store` (criptografado)

### Modos de Operação

1. **Modo Normal** → Transcrição manual, perguntas consolidadas por clique
2. **Modo Entrevista** → Detecção automática de perguntas, respostas GPT em streaming

---

---

## 📊 Arquitetura Confirmada

### Separação de Responsabilidades ✅

```
┌─────────────────────────────────────────────────────────┐
│                    index.html (View)                     │
│  • Estrutura pura (ids, classes, data-attributes)       │
│  • Zero lógica                                           │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│           config-manager.js (Controller/UI)             │
│  • Único lugar com document.getElementById()            │
│  • Único lugar com addEventListener()                   │
│  • Traduz eventos em chamadas RendererAPI               │
│  • Renderiza dados emitidos pelo renderer               │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│           renderer.js (Service/Model)                   │
│  ✅ ZERO document.* (cego para UI)                      │
│  ✅ ZERO addEventListener                               │
│  ✅ Processa dados (audio, gpt, transcrição)            │
│  ✅ Emite callbacks via onUIChange()                    │
│  ✅ Expõe API via window.RendererAPI                    │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│              main.js (Backend/Electron)                 │
│  • I/O (arquivos, rede)                                 │
│  • Integração OpenAI (Whisper, Chat)                    │
│  • IPC handlers (SAVE_API_KEY, GET_API_KEY, etc)        │
│  • Gerenciamento de janela (drag, click-through)        │
└─────────────────────────────────────────────────────────┘
```

---

## 🏗️ Arquitetura Atual

```
INDEX.HTML (View)
    └─ Apenas estrutura HTML + data-attributes

CONFIG-MANAGER.JS (Controller)
    ├─ Captura TODOS os eventos do DOM
    ├─ Orquestra ações chamando RendererAPI
    ├─ Gerencia estado de UI
    ├─ Manipula DOM (classes, estilos)
    └─ Persiste configurações

RENDERER.JS (Model/Services)
    ├─ NUNCA captura eventos DOM
    ├─ Expõe RendererAPI com funções públicas
    ├─ Contém TODA lógica de negócio
    │  ├─ Captura de áudio
    │  ├─ Orquestração de entrevista
    │  ├─ Processamento GPT
    │  └─ Renderização de UI
    └─ Comunica com main.js via IPC

MAIN.JS (Backend Services)
    ├─ Operações de sistema
    ├─ Integração com OpenAI
    └─ IPC Handlers
```

---

## ✨ Funcionalidades Principais

- ✅ Transcrição de áudio em tempo real (Whisper)
- ✅ Respostas GPT com streaming (modo entrevista)
- ✅ Suporte a múltiplos providers de IA (OpenAI, Google, OpenRouter, Custom)
- ✅ Armazenamento seguro de API keys (criptografado)
- ✅ Monitoramento de volume de áudio (VU meters)
- ✅ Interface overlay transparente e sempre visível
- ✅ Dark mode automático
- ✅ Drag & drop da janela (frameless)
- ✅ Click-through control (passar cliques através da janela)
- ✅ Atalhos de teclado globais
- ✅ Histórico de perguntas e respostas

📄 **[Ver lista completa de funcionalidades →](docs/FEATURES.md)**

---

## 📦 Requisitos

### Sistema Operacional

- Windows 10/11 (recomendado)
- macOS 10.15+ (suporte parcial)
- Linux (não testado)

### Software

```
Node.js  → versão 18.x ou superior
npm      → versão 8.x ou superior
```

### Hardware

- **Microfone** (para captura de entrada)
- **VoiceMeeter** ou similar (opcional, para captura de saída/outros participantes)
- **RAM** → Mínimo 4GB (recomendado 8GB)
- **Processador** → Multi-core (transcrição de áudio é intensiva)

### APIs Necessárias

- **OpenAI API Key** (obrigatória para Whisper + GPT)
- **Google API Key** (opcional, para Gemini)
- **OpenRouter API Key** (opcional)

> ⚠️ **Importante:** Sem uma API key válida, a aplicação não conseguirá transcrever áudio nem gerar respostas.

---

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/askme.git
cd askme
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Setup Vosk (Transcrição em Tempo Real - Modo Entrevista)

O projeto suporta **Vosk** para transcrição ultra-rápida no modo entrevista (latência <300ms).

```bash
# Já incluído em npm install, mas precisa do modelo português
npm install vosk

# Baixe o modelo em: https://alphacephei.com/vosk/models
# Procure por: vosk-model-pt-0.3
# Descompacte em: ./stt/models-stt/vosk/vosk-model-pt-0.3/

# Verifique o setup:
node check-vosk-setup.js
```

📖 **Instruções detalhadas:** [VOSK_SETUP.md](./VOSK_SETUP.md)

### 4. Verifique a instalação

```bash
npm list
```

**Dependências esperadas:**

```
askme@1.0.0
├── electron@39.2.7
├── electron-store@11.0.2
├── fluent-ffmpeg@2.1.2
├── ffmpeg-static@5.2.0
├── highlight.js@11.11.1
├── marked@17.0.1
├── openai@6.10.0
├── vosk@0.3.44  ← NOVO: Para modo entrevista
└── wav@1.0.2
```

---

## ▶️ Execução

### Modo Desenvolvimento

```bash
npm start
```

- Hot reload habilitado via `electron-reload`
- Console aberto com `Ctrl+Shift+I`
- Logs detalhados no terminal

### Modo Produção

```bash
npm run build
```

- Sem hot reload
- Console desabilitado
- Otimizações de performance

### Atalhos de Teclado

| Atalho           | Ação                                    |
| ---------------- | --------------------------------------- |
| `Ctrl+D`         | Iniciar/parar escuta de áudio           |
| `Ctrl+Enter`     | Enviar pergunta selecionada ao GPT      |
| `Ctrl+Shift+I`   | Abrir DevTools (apenas desenvolvimento) |
| `Ctrl+Shift+↑/↓` | Navegar entre perguntas (futuro)        |

---

## 📁 Estrutura do Projeto

```
askme/
├── main.js              # Processo principal (Electron)
├── renderer.js          # Serviços de transcrição e GPT
├── config-manager.js    # Gerenciador de configurações e UI
├── index.html           # Interface principal
├── styles.css           # Estilos e temas
├── package.json         # Dependências e scripts
├── README.md            # Este arquivo
├── FEATURES.md          # Lista detalhada de funcionalidades
└── TEST_GUIDE.md        # Guia de testes manuais
```

### Arquivos Principais

#### `main.js`

- Criação da janela Electron (frameless, transparent, always-on-top)
- IPC handlers (transcrição, GPT, API keys)
- Armazenamento seguro via `electron-store`
- Atalhos globais

#### `renderer.js`

- Captura de áudio (input/output via MediaRecorder)
- Transcrição via OpenAI Whisper
- Respostas GPT (batch e streaming)
- Gerenciamento de perguntas/respostas
- Sistema de callbacks para UI

#### `config-manager.js`

- Gerenciamento de configurações (API keys, dispositivos, tema)
- Controle de UI (DOM manipulation)
- Inicialização de controllers
- Event listeners

#### `index.html`

- Interface com menu lateral
- Seções: Home, API e Modelos, Áudio e Tela, Privacidade, Outros
- Dark mode toggle
- VU meters para volume

---

## 📚 Documentação

A documentação completa está organizada na pasta **`docs/`**.

### 🎯 Onde Começar?

- **[DOCS_GUIDE.md](docs/DOCS_GUIDE.md)** - Guia de navegação (comece aqui! 👈)
  - Ajuda a encontrar exatamente o que você procura
  - Organizado por papel (Tester, Developer, Manager)
  - Links rápidos para cada seção

### 🧪 Centro de Testes

- **[TESTING_INDEX.md](docs/TESTING_INDEX.md)** - Índice central de testes com 77 testes documentados
  - Índice por funcionalidade
  - Teste rápido (5 minutos)
  - Estatísticas de cobertura
  - Checklist de validação completa

### 📖 Referência Técnica

- 🏛️ **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Arquitetura técnica do projeto
  - Diagrama de componentes
  - Fluxos de IPC
  - Padrões e convenções
  - Stack tecnológico

### 🧪 Testes & Validação

Testes organizados por seção da aplicação (77 testes total):

- **[TEST_HOME.md](docs/TEST_HOME.md)** - Testes da tela principal
  - ✓ 6 testes de transcrição
  - ✓ 4 testes de perguntas
  - ✓ 4 testes de respostas
  - ✓ 6 testes de interface

- **[TEST_API_MODELS.md](docs/TEST_API_MODELS.md)** - Testes de configuração de modelos
  - ✓ 7 testes OpenAI
  - ✓ 4 testes Google/Gemini
  - ✓ 2 testes OpenRouter
  - ✓ 3 testes de gerenciamento

- **[TEST_AUDIO_SCREEN.md](docs/TEST_AUDIO_SCREEN.md)** - Testes de áudio e captura de tela
  - ✓ 7 testes de áudio
  - ✓ 6 testes de captura de tela

- **[TEST_OTHER.md](docs/TEST_OTHER.md)** - Testes de configurações gerais
  - ✓ 3 testes de tema
  - ✓ 3 testes de modo
  - ✓ 2 testes de idioma
  - ✓ 2 testes de log level
  - ✓ 3 testes de reset
  - ✓ 2 testes adicionais

- **[TEST_PRIVACY.md](docs/TEST_PRIVACY.md)** - Testes de privacidade e segurança
  - ✓ 2 testes de visibilidade
  - ✓ 3 testes de telemetria
  - ✓ 2 testes de limpeza de dados
  - ✓ 3 testes de retenção
  - ✓ 3 testes de segurança

### 📋 Guias Adicionais

- 📖 **[REFACTORING_FINAL_STATUS.md](docs/REFACTORING_FINAL_STATUS.md)** - Status da refatoração
- 🎤 **[Documentação de Fluxos](docs/)** - Fluxos técnicos específicos (áudio, transcrição, streaming)

---

## 🔧 Troubleshooting

### Aplicação não inicia

```bash
# Limpar node_modules e reinstalar
rm -rf node_modules package-lock.json
npm install
npm start
```

### API key não funciona

1. Verifique se a chave tem 10+ caracteres
2. Confirme se clicou em "Salvar Configurações"
3. Clique em "Ativar" no modelo desejado
4. Verifique o console (F12) para erros

### Áudio não captura

1. Verifique permissões de microfone no sistema
2. Selecione um dispositivo em "Áudio e Tela"
3. Teste o volume (barra deve oscilar)
4. Reinicie a aplicação se necessário

### Volume não oscila

- O monitoramento inicia automaticamente ao selecionar dispositivo
- Não é necessário clicar "Começar a Ouvir" para ver o volume
- Se não funcionar, troque de dispositivo e aguarde 2 segundos

### Transcrição não acontece

1. Confirme que o modelo está ativo (badge "Ativo")
2. Verifique se clicou em "Começar a Ouvir"
3. Faça barulho próximo ao microfone
4. Aguarde alguns segundos (transcrição tem latência)

### Janela não move

- O drag handle está no topo do menu lateral
- Cursor deve virar "grab" ao passar o mouse
- Se não funcionar, reabra a aplicação

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Para mudanças importantes:

1. Abra uma issue primeiro para discutir o que você gostaria de mudar
2. Fork o projeto
3. Crie uma branch (`git checkout -b feature/NovaFuncionalidade`)
4. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
5. Push para a branch (`git push origin feature/NovaFuncionalidade`)
6. Abra um Pull Request

---

## 📝 Licença

Este projeto está sob a licença ISC. Veja o arquivo `LICENSE` para mais detalhes.

---

## 📞 Suporte

- 🐛 **Issues:** [GitHub Issues](https://github.com/seu-usuario/askme/issues)
- 📧 **Email:** seu-email@exemplo.com
- 💬 **Discord:** [Link do servidor]

---

## 🎯 Roadmap

- [ ] Suporte a múltiplos idiomas (i18n)
- [ ] Exportação de transcrições em TXT/JSON
- [ ] Integração com mais providers (Claude, Cohere)
- [ ] Modo de captura de tela (screenshots)
- [ ] Sistema de plugins/extensões
- [ ] Testes automatizados
