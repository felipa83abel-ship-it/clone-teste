# 📚 Guia de Documentação - AskMe

Bem-vindo! Este guia ajuda a encontrar exatamente o que você procura na documentação do AskMe.

---

## 🎯 Por Que Você Está Aqui?

### "Quero testar a aplicação" ➡️
👉 [**TESTING_INDEX.md**](TESTING_INDEX.md) - Índice central com 77 testes

Comece aqui se você:
- Vai fazer testes manuais
- Precisa validar funcionalidades
- Quer um teste rápido de 5 minutos
- Busca testes por funcionalidade

### "Quero entender a arquitetura" ➡️
👉 [**ARCHITECTURE.md**](ARCHITECTURE.md) - Diagrama técnico completo

Comece aqui se você:
- Vai desenvolver novas features
- Precisa entender fluxos de IPC
- Quer saber como components interagem
- Precisa revisar código

### "Quero um teste de uma seção específica" ➡️

Escolha sua seção:

| Seção | Arquivo | Quando ler |
|-------|---------|-----------|
| 🏠 **Home** | [TEST_HOME.md](TEST_HOME.md) | Testes de transcrição, Q&A, interface |
| 🔧 **API & Modelos** | [TEST_API_MODELS.md](TEST_API_MODELS.md) | Testes de configuração de providers |
| 🎤 **Áudio & Tela** | [TEST_AUDIO_SCREEN.md](TEST_AUDIO_SCREEN.md) | Testes de áudio e screenshots |
| ⚙️ **Outros** | [TEST_OTHER.md](TEST_OTHER.md) | Testes de tema, modo, idioma, reset |
| 🔒 **Privacidade** | [TEST_PRIVACY.md](TEST_PRIVACY.md) | Testes de segurança e telemetria |

### "Quero documentação técnica de fluxos" ➡️

| Fluxo | Arquivo | Descrição |
|-------|---------|-----------|
| 🎤 Áudio | [FLUXO_FALA_SILENCIO.md](FLUXO_FALA_SILENCIO.md) | Fluxo de detecção de fala/silêncio |
| 🎙️ Deepgram | [transcription_flow_deepgram.md](transcription_flow_deepgram.md) | Integração Deepgram |
| 🎙️ Whisper | [transcription_flow_other_models.md](transcription_flow_other_models.md) | Integração OpenAI Whisper |

### "Quero lista de features" ➡️
👉 [**FEATURES.md**](FEATURES.md) - Lista completa de funcionalidades

### "Quero status da refatoração" ➡️
👉 [**REFACTORING_FINAL_STATUS.md**](REFACTORING_FINAL_STATUS.md) - O que foi refatorado

---

## 📊 Estrutura de Documentação

```
docs/
├── 📖 DOCS_GUIDE.md (Este arquivo)
│   └─ Ajuda a navegar entre documentos
│
├── 🧪 TESTING_INDEX.md ⭐ COMECE AQUI SE TESTAR
│   └─ Índice central com 77 testes
│
├── 🧪 TEST_HOME.md (20 testes)
│   ├─ Transcrição (6 testes)
│   ├─ Perguntas (4 testes)
│   ├─ Respostas (4 testes)
│   └─ Interface (6 testes)
│
├── 🧪 TEST_API_MODELS.md (16 testes)
│   ├─ OpenAI (7 testes)
│   ├─ Google/Gemini (4 testes)
│   ├─ OpenRouter (2 testes)
│   └─ Gerenciamento (3 testes)
│
├── 🧪 TEST_AUDIO_SCREEN.md (13 testes)
│   ├─ Áudio (7 testes)
│   └─ Captura de tela (6 testes)
│
├── 🧪 TEST_OTHER.md (15 testes)
│   ├─ Tema (3 testes)
│   ├─ Modo (3 testes)
│   ├─ Idioma (2 testes)
│   ├─ Logs (2 testes)
│   ├─ Reset (3 testes)
│   └─ Outros (2 testes)
│
├── 🧪 TEST_PRIVACY.md (13 testes)
│   ├─ Visibilidade (2 testes)
│   ├─ Telemetria (3 testes)
│   ├─ Limpeza (2 testes)
│   ├─ Retenção (3 testes)
│   └─ Segurança (3 testes)
│
├── 🏛️ ARCHITECTURE.md ⭐ COMECE AQUI SE DESENVOLVER
│   ├─ Diagrama de components
│   ├─ Fluxos de IPC
│   ├─ Padrões
│   └─ Stack tecnológico
│
├── 🎤 FLUXO_FALA_SILENCIO.md
│   └─ Detecção de fala/silêncio
│
├── 🎙️ transcription_flow_deepgram.md
│   └─ Integração Deepgram
│
├── 🎙️ transcription_flow_other_models.md
│   └─ Integração OpenAI Whisper
│
├── ✨ FEATURES.md
│   └─ Lista de funcionalidades
│
└── 📋 REFACTORING_FINAL_STATUS.md
    └─ Status das refatorações
```

---

## 🚀 Quick Start by Role

### 👨‍💻 Desenvolvedor

1. Leia [ARCHITECTURE.md](ARCHITECTURE.md) para entender estrutura
2. Procure padrões usados em [main.js](../main.js), [renderer.js](../renderer.js)
3. Quando implementar feature:
   - Procure testes relacionados em [TEST_*.md](.)
   - Siga o padrão de separação de responsabilidades
   - Adicione testes se criar nova funcionalidade

### 🧪 QA / Tester

1. Leia [TESTING_INDEX.md](TESTING_INDEX.md) → Teste rápido de 5 minutos
2. Vá para seção específica (TEST_HOME.md, etc)
3. Siga os passos em ordem
4. Use checklist para rastrear progresso
5. Reporte problemas no console (F12)

### 📊 Project Manager

1. Veja [TESTING_INDEX.md](TESTING_INDEX.md) → Estatísticas de cobertura
2. Use o checklist de validação completa
3. 77 testes documentados em 5 seções principais
4. Cada teste tem pré-condições e resultado esperado claro

### 👥 Revisor de Código

1. Leia [ARCHITECTURE.md](ARCHITECTURE.md) para entender padrões
2. Verifique [REFACTORING_FINAL_STATUS.md](REFACTORING_FINAL_STATUS.md) para contexto
3. Procure testes relacionados em [TEST_*.md](.) para entender feature esperada

---

## 📖 O Que Cada Documento Cobre

### TEST_HOME.md
**O que:** Testes da tela principal (Home)  
**Quando ler:** Testando transcrição, perguntas, respostas ou interface  
**Testes:** 20 (transcrição, Q&A, interface)  
**Tempo:** ~45 minutos para todos  

### TEST_API_MODELS.md
**O que:** Testes de configuração de providers (OpenAI, Google, OpenRouter)  
**Quando ler:** Testando setup de API keys ou mudança de modelo  
**Testes:** 16 (7 OpenAI, 4 Google, 2 OpenRouter, 3 gerenciamento)  
**Tempo:** ~30 minutos para todos  

### TEST_AUDIO_SCREEN.md
**O que:** Testes de dispositivos de áudio e captura de tela  
**Quando ler:** Testando volume, VU meters ou screenshots  
**Testes:** 13 (7 áudio, 6 captura)  
**Tempo:** ~25 minutos para todos  

### TEST_OTHER.md
**O que:** Testes de configurações gerais (tema, modo, idioma, reset)  
**Quando ler:** Testando preferências ou comportamento geral  
**Testes:** 15 (tema, modo, idioma, logs, reset, outros)  
**Tempo:** ~35 minutos para todos  

### TEST_PRIVACY.md
**O que:** Testes de privacidade, segurança e armazenamento  
**Quando ler:** Testando proteção de dados ou configurações de segurança  
**Testes:** 13 (visibilidade, telemetria, limpeza, retenção, segurança)  
**Tempo:** ~30 minutos para todos  

### ARCHITECTURE.md
**O que:** Diagrama técnico, fluxos IPC, padrões  
**Quando ler:** Antes de adicionar feature ou fazer refatoração  
**Público:** Desenvolvedores, arquitetos  

### TESTING_INDEX.md
**O que:** Índice central, teste rápido, estatísticas  
**Quando ler:** Para entender cobertura geral ou encontrar teste por funcionalidade  
**Público:** Testers, managers, desenvolvedores  

---

## 🎯 Padrão de Teste (Todos os TEST_*.md usam)

Cada teste segue este padrão:

```
## Teste N.M - Nome Descritivo

**Objetivo:** O que está sendo testado
- Verbo claro do que validar

**Pré-condições:**
- [ ] Prerequisite 1 (estado esperado)
- [ ] Prerequisite 2

**Passos:**
1. 👉 Ação 1
2. 👉 Ação 2
3. ✅ Verificação

**Resultado Esperado:**
- ✓ Comportamento específico

**Console Esperado:**
```
Logs específicos esperados
```

**Troubleshooting:**
- Se X, então Y
```

---

## 🔗 Links de Navegação Rápida

| Necessidade | Link |
|-------------|------|
| Testar aplicação | [TESTING_INDEX.md](TESTING_INDEX.md) |
| Entender código | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Testar Home | [TEST_HOME.md](TEST_HOME.md) |
| Testar API/Modelos | [TEST_API_MODELS.md](TEST_API_MODELS.md) |
| Testar Áudio | [TEST_AUDIO_SCREEN.md](TEST_AUDIO_SCREEN.md) |
| Testar Configurações | [TEST_OTHER.md](TEST_OTHER.md) |
| Testar Privacidade | [TEST_PRIVACY.md](TEST_PRIVACY.md) |
| Ver Features | [FEATURES.md](FEATURES.md) |
| Status Refator | [REFACTORING_FINAL_STATUS.md](REFACTORING_FINAL_STATUS.md) |

---

## 💡 Dicas

### Para Testers
- ✅ Sempre comece pelas **pré-condições** - elas definem estado esperado
- ✅ Siga os **passos em ordem** - não pule
- ✅ Abra **DevTools (F12)** para ver console
- ✅ Se um teste falhar, tente **3 vezes** antes de reportar
- ✅ Use **TESTING_INDEX.md** para encontrar teste rápido

### Para Desenvolvedores
- ✅ Leia **ARCHITECTURE.md** antes de começar
- ✅ Procure **testes relacionados** na feature que vai implementar
- ✅ Mantenha **separação de responsabilidades**: index.html → config-manager.js → renderer.js → main.js
- ✅ Ao adicionar feature, **adicione testes** também

### Para Managers
- ✅ Use **TESTING_INDEX.md** para status
- ✅ 77 testes documentados em **5 seções principais**
- ✅ Cada teste tem **pré-condições e resultado esperado claro**
- ✅ Tempo total de testes: ~3 horas para cobertura completa

---

## 📈 Cobertura de Testes

```
Total: 77 testes

HOME (20)      ███████ 26%
API_MODELS (16) █████ 21%
AUDIO (13)      ████ 17%
OTHER (15)      █████ 19%
PRIVACY (13)    ████ 17%
```

---

## ❓ FAQ

**P: Por onde começo?**  
R: Se vai testar, vá para [TESTING_INDEX.md](TESTING_INDEX.md). Se vai desenvolver, vá para [ARCHITECTURE.md](ARCHITECTURE.md).

**P: Como encontro um teste específico?**  
R: Abra [TESTING_INDEX.md](TESTING_INDEX.md) → seção "Navegação por Funcionalidade" → procure sua feature.

**P: Quanto tempo leva para testar tudo?**  
R: ~3 horas para cobertura completa (77 testes). Você pode começar com teste rápido (5 min) em TESTING_INDEX.md.

**P: Onde está o test_guide.md original?**  
R: Foi dividido em 5 arquivos (TEST_HOME.md, TEST_API_MODELS.md, etc) para melhor organização. Todo conteúdo foi migrado.

**P: Posso adicionar novos testes?**  
R: Sim! Abra o arquivo TEST_[SEÇÃO].md apropriado e siga o padrão usado nos outros testes.

---

**Última atualização:** 2024  
**Versão da documentação:** 2.0 (Modular, organizada por seção)
