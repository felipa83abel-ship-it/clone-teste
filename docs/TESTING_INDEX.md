# 🧪 Índice de Testes - AskMe

**Total de testes documentados:** 77  
**Última atualização:** 2024

---

## 📋 Resumo por Seção

| Seção                | Arquivo                                      | Testes | Foco                                                   |
| -------------------- | -------------------------------------------- | ------ | ------------------------------------------------------ |
| 🏠 **Home**          | [TEST_HOME.md](TEST_HOME.md)                 | 20     | Transcrição, perguntas, respostas, interface           |
| 🔧 **API & Modelos** | [TEST_API_MODELS.md](TEST_API_MODELS.md)     | 16     | Configuração de providers (OpenAI, Google, OpenRouter) |
| 🎤 **Áudio & Tela**  | [TEST_AUDIO_SCREEN.md](TEST_AUDIO_SCREEN.md) | 13     | Dispositivos de áudio, VU meters, screenshots          |
| ⚙️ **Outros**        | [TEST_OTHER.md](TEST_OTHER.md)               | 15     | Tema, modo, idioma, logs, reset                        |
| 🔒 **Privacidade**   | [TEST_PRIVACY.md](TEST_PRIVACY.md)           | 13     | Segurança, telemetria, limpeza de dados                |

---

## 🎯 Teste Rápido (Quick Start)

Para validar que o app está funcionando corretamente em 5 minutos:

### ✅ Pré-requisitos

- [ ] App instalado com `npm install`
- [ ] OpenAI API key válida configurada
- [ ] Microfone funcionando

### ✅ Testes Essenciais

1. **Transcrição** [TEST_HOME.md#transcrição](TEST_HOME.md) - Test 1.1
   - Falar no microfone e ver texto aparecer

2. **Respostas GPT** [TEST_HOME.md#respostas](TEST_HOME.md) - Test 3.1
   - Enviar pergunta e ver resposta em tempo real

3. **Tema** [TEST_OTHER.md#tema](TEST_OTHER.md) - Test 4.1
   - Alternar entre modo claro e escuro

4. **Privacidade** [TEST_PRIVACY.md#segurança](TEST_PRIVACY.md) - Test 5.3
   - Confirmar que API key não é exibida em logs

---

## 🗂️ Navegação por Funcionalidade

### 🎙️ Testes de Áudio & Transcrição

| Funcionalidade          | Teste | Arquivo                                            |
| ----------------------- | ----- | -------------------------------------------------- |
| Captura de áudio básica | 1.1   | [TEST_HOME.md](TEST_HOME.md#transcrição)           |
| Validação de modelo     | 1.2   | [TEST_HOME.md](TEST_HOME.md#transcrição)           |
| Iniciar escuta          | 1.3   | [TEST_HOME.md](TEST_HOME.md#transcrição)           |
| Detector de fala        | 1.4   | [TEST_HOME.md](TEST_HOME.md#transcrição)           |
| Detecção de silêncio    | 1.5   | [TEST_HOME.md](TEST_HOME.md#transcrição)           |
| Fala longa              | 1.6   | [TEST_HOME.md](TEST_HOME.md#transcrição)           |
| Dispositivos de entrada | 3.1   | [TEST_AUDIO_SCREEN.md](TEST_AUDIO_SCREEN.md#áudio) |
| VU meter em tempo real  | 3.2   | [TEST_AUDIO_SCREEN.md](TEST_AUDIO_SCREEN.md#áudio) |
| Trocar dispositivo      | 3.3   | [TEST_AUDIO_SCREEN.md](TEST_AUDIO_SCREEN.md#áudio) |

### 💬 Testes de Perguntas & Respostas

| Funcionalidade            | Teste | Arquivo                                |
| ------------------------- | ----- | -------------------------------------- |
| Consolidação de perguntas | 2.1   | [TEST_HOME.md](TEST_HOME.md#perguntas) |
| Fechamento automático     | 2.2   | [TEST_HOME.md](TEST_HOME.md#perguntas) |
| Perguntas incompletas     | 2.3   | [TEST_HOME.md](TEST_HOME.md#perguntas) |
| Múltiplas perguntas       | 2.4   | [TEST_HOME.md](TEST_HOME.md#perguntas) |
| Respostas em streaming    | 3.1   | [TEST_HOME.md](TEST_HOME.md#respostas) |
| Promoção de resposta      | 3.2   | [TEST_HOME.md](TEST_HOME.md#respostas) |
| Modo normal               | 3.3   | [TEST_HOME.md](TEST_HOME.md#respostas) |
| Envio manual              | 3.4   | [TEST_HOME.md](TEST_HOME.md#respostas) |

### 🔧 Testes de Configuração & Modelos

| Funcionalidade          | Teste    | Arquivo                                                 |
| ----------------------- | -------- | ------------------------------------------------------- |
| OpenAI salvar chave     | 1.1      | [TEST_API_MODELS.md](TEST_API_MODELS.md#openai)         |
| OpenAI visibilidade     | 1.2      | [TEST_API_MODELS.md](TEST_API_MODELS.md#openai)         |
| OpenAI ativar/desativar | 1.3, 1.4 | [TEST_API_MODELS.md](TEST_API_MODELS.md#openai)         |
| Google Gemini           | 2.1-2.4  | [TEST_API_MODELS.md](TEST_API_MODELS.md#google--gemini) |
| OpenRouter              | 3.1-3.2  | [TEST_API_MODELS.md](TEST_API_MODELS.md#openrouter)     |
| Status de modelos       | 4.1, 4.2 | [TEST_API_MODELS.md](TEST_API_MODELS.md#gerenciamento)  |

### 🎨 Testes de UI & Aparência

| Funcionalidade            | Teste    | Arquivo                                                      |
| ------------------------- | -------- | ------------------------------------------------------------ |
| Dark mode                 | 4.1      | [TEST_OTHER.md](TEST_OTHER.md#tema)                          |
| Tema padrão               | 4.2      | [TEST_OTHER.md](TEST_OTHER.md#tema)                          |
| Cores                     | 4.3      | [TEST_OTHER.md](TEST_OTHER.md#tema)                          |
| Modo padrão vs entrevista | 5.1-5.3  | [TEST_OTHER.md](TEST_OTHER.md#modo)                          |
| Seleção de idioma         | 6.1, 6.2 | [TEST_OTHER.md](TEST_OTHER.md#idioma)                        |
| Captura de tela           | 3.4-3.9  | [TEST_AUDIO_SCREEN.md](TEST_AUDIO_SCREEN.md#captura-de-tela) |

### 🔒 Testes de Privacidade & Segurança

| Funcionalidade           | Teste    | Arquivo                                                  |
| ------------------------ | -------- | -------------------------------------------------------- |
| Visibilidade de capturas | 1.1, 1.2 | [TEST_PRIVACY.md](TEST_PRIVACY.md#visibilidade)          |
| Telemetria               | 2.1-2.3  | [TEST_PRIVACY.md](TEST_PRIVACY.md#telemetria)            |
| Limpeza de dados         | 3.1, 3.2 | [TEST_PRIVACY.md](TEST_PRIVACY.md#limpeza-de-dados)      |
| Retenção de histórico    | 4.1-4.3  | [TEST_PRIVACY.md](TEST_PRIVACY.md#retenção-de-histórico) |
| Segurança de API keys    | 5.1-5.3  | [TEST_PRIVACY.md](TEST_PRIVACY.md#segurança)             |

---

## 🔍 Como Usar Este Índice

### Para Testers

1. Escolha a funcionalidade que quer testar
2. Encontre na tabela acima
3. Clique no arquivo TEST\_\*.md
4. Leia o teste específico (Objetivo → Passos → Resultado Esperado)
5. Execute o teste e marque na checklist

### Para Desenvolvedores

1. Implementar nova feature? → Procure testes relacionados
2. Corrigir bug? → Execute os testes correspondentes
3. Adicionar testes? → Mantenha o padrão da seção apropriada

### Estrutura Padrão de Cada Teste

```
## Teste N.M - Nome do Teste

**Objetivo:** O que está sendo validado

**Pré-condições:**
- [ ] Requisito 1
- [ ] Requisito 2

**Passos:**
1. 👉 Ação 1
2. 👉 Ação 2
3. ✅ Verificação esperada

**Resultado Esperado:**
- ✓ Comportamento esperado

**Console Esperado:**
```

Logs relevantes

```

**Troubleshooting:**
- Se X acontecer, então Y
```

---

## 📊 Estatísticas de Cobertura

### Por Seção

```
HOME (20 testes)
├─ Transcrição:    26% (5 testes)
├─ Perguntas:      20% (4 testes)
├─ Respostas:      20% (4 testes)
└─ Interface:      30% (6 testes)

API_MODELS (16 testes)
├─ OpenAI:         44% (7 testes)
├─ Google:         25% (4 testes)
├─ OpenRouter:     13% (2 testes)
└─ Gerenciamento:  19% (3 testes)

AUDIO_SCREEN (13 testes)
├─ Áudio:          54% (7 testes)
└─ Screenshots:    46% (6 testes)

OTHER (15 testes)
├─ Tema:           20% (3 testes)
├─ Modo:           20% (3 testes)
├─ Idioma:         13% (2 testes)
├─ Logs:           13% (2 testes)
├─ Reset:          20% (3 testes)
└─ Outros:         13% (2 testes)

PRIVACY (13 testes)
├─ Visibilidade:   15% (2 testes)
├─ Telemetria:     23% (3 testes)
├─ Limpeza:        15% (2 testes)
├─ Retenção:       23% (3 testes)
└─ Segurança:      23% (3 testes)

TOTAL: 77 testes
```

---

## 🎯 Checklist de Validação Completa

Use este checklist para validar uma versão completa:

```markdown
## Release Checklist

### Home (20 testes)

- [ ] 1.1 - Transcrição básica
- [ ] 1.2 - Validação de modelo
- [ ] 1.3 - Iniciar escuta
- [ ] 1.4 - Detector de fala
- [ ] 1.5 - Detecção de silêncio
- [ ] 1.6 - Fala longa
- [ ] 2.1 - Consolidação de perguntas
- [ ] 2.2 - Fechamento automático
- [ ] 2.3 - Perguntas incompletas
- [ ] 2.4 - Múltiplas perguntas
- [ ] 3.1 - Respostas em streaming
- [ ] 3.2 - Promoção de resposta
- [ ] 3.3 - Modo normal
- [ ] 3.4 - Envio manual
- [ ] 4.1 - Botão de controle
- [ ] 4.2 - Seções de interface
- [ ] 4.3 - Reset de interface
- [ ] 4.4 - Screenshot 1
- [ ] 4.5 - Screenshot 2
- [ ] 4.6 - Screenshot 3

### API & Modelos (16 testes)

- [ ] 1.1 - OpenAI salvar chave
- [ ] 1.2 - OpenAI visibilidade
- [ ] 1.3 - OpenAI ativar
- [ ] 1.4 - OpenAI desativar
- [ ] 1.5 - OpenAI deletar
- [ ] 1.6 - OpenAI seleção STT
- [ ] 1.7 - OpenAI seleção LLM
- [ ] 2.1 - Google ativar sem chave
- [ ] 2.2 - Google salvar
- [ ] 2.3 - Google ativar com chave
- [ ] 2.4 - Google exclusividade
- [ ] 3.1 - OpenRouter salvar
- [ ] 3.2 - OpenRouter seleção
- [ ] 4.1 - Status ativo
- [ ] 4.2 - Status inativo
- [ ] 4.3 - Erro chave inválida

### Áudio & Tela (13 testes)

- [ ] 3.1 - Seleção entrada
- [ ] 3.2 - VU meter real-time
- [ ] 3.3 - Trocar dispositivo
- [ ] 3.4 - Dispositivo saída
- [ ] 3.5 - Permissões
- [ ] 3.6 - VU meter home
- [ ] 3.7 - Latência
- [ ] 3.8 - Screenshot atalho
- [ ] 3.9 - Screenshot novo atalho
- [ ] 3.10 - Screenshot PNG
- [ ] 3.11 - Screenshot JPG
- [ ] 3.12 - Screenshot excluir app
- [ ] 3.13 - Screenshot clear

### Outros (15 testes)

- [ ] 4.1 - Dark mode
- [ ] 4.2 - Tema padrão
- [ ] 4.3 - Cores
- [ ] 5.1 - Modo padrão
- [ ] 5.2 - Modo entrevista
- [ ] 5.3 - Modo persistência
- [ ] 6.1 - Seleção idioma
- [ ] 6.2 - Idioma persistência
- [ ] 7.1 - Log level
- [ ] 7.2 - Log level mudança
- [ ] 8.1 - Factory reset
- [ ] 8.2 - Reset diálogo
- [ ] 8.3 - Reset cancelar
- [ ] 9.1 - Auto-update
- [ ] 9.2 - Modo mock

### Privacidade (13 testes)

- [ ] 1.1 - Ocultar capturas
- [ ] 1.2 - Persistência visibilidade
- [ ] 2.1 - Desativar telemetria
- [ ] 2.2 - Telemetria padrão
- [ ] 2.3 - Telemetria persistência
- [ ] 3.1 - Auto-limpeza
- [ ] 3.2 - Desativar limpeza
- [ ] 4.1 - Seleção retenção
- [ ] 4.2 - Retenção padrão
- [ ] 4.3 - Nunca excluir
- [ ] 5.1 - Armazenamento seguro
- [ ] 5.2 - Mascaramento log
- [ ] 5.3 - Deletar chave
```

---

## 🔗 Links Rápidos

| Recurso               | Link                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| 📖 Arquitetura        | [ARCHITECTURE.md](ARCHITECTURE.md)                                       |
| 🏛️ Status Refatoração | [REFACTORING_FINAL_STATUS.md](REFACTORING_FINAL_STATUS.md)               |
| 📝 Features           | [FEATURES.md](FEATURES.md)                                               |
| 🎤 Fluxo Áudio        | [FLUXO_FALA_SILENCIO.md](FLUXO_FALA_SILENCIO.md)                         |
| 🔊 Deepgram Flow      | [transcription_flow_deepgram.md](transcription_flow_deepgram.md)         |
| 🎙️ Whisper Flow       | [transcription_flow_other_models.md](transcription_flow_other_models.md) |

---

## 📝 Notas Importantes

### ✅ Ao Executar Testes

1. **Sempre comece pelas pré-condições** - Elas definem o estado esperado
2. **Siga os passos em ordem** - Não pule etapas
3. **Anote qualquer desvio** - Mesmo se o resultado final estiver correto
4. **Console é importante** - Verifique `F12 → Console` para erros
5. **Replicabilidade** - Se falhar uma vez, tente 3 vezes antes de reportar

### 🔧 Para Adicionar Novos Testes

1. Identifique a seção correta (HOME, API_MODELS, etc)
2. Abra o arquivo TEST\_[SEÇÃO].md correspondente
3. Adicione na numeração apropriada (ex: teste 5.7 na seção 5)
4. Siga o padrão: Objetivo → Pré-condições → Passos → Resultado → Console → Troubleshooting
5. Atualize este arquivo (TESTING_INDEX.md) com o novo teste

---

**Última revisão:** 2024  
**Responsável:** Tim (Copilot - Claude Haiku 4.5)
