# ⚙️ Testes - Seção API e Modelos

> Testes de configuração de provedores LLM, API keys e modelos

---

## 📋 Índice

- [Preparação para Testes](#preparação-para-testes)
- [Testes de API OpenAI](#testes-de-api-openai)
- [Testes de API Google/Gemini](#testes-de-api-googleg emini)
- [Testes de API OpenRouter](#testes-de-api-openrouter)
- [Testes de Gerenciamento de Modelos](#testes-de-gerenciamento-de-modelos)
- [Checklist](#checklist)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Preparação para Testes

### Dados de Teste
```
API Key válida (OpenAI): sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
API Key inválida: sk-invalid-123
Chave curta: sk-abc (deve rejeitar, < 10 caracteres)
API Key Google: Gerado em https://ai.google.dev/
```

---

## 🔑 Testes de API OpenAI

### Teste 1: Salvar API Key OpenAI

**Objetivo:** Confirmar que API key é salva e validada corretamente

**Passos:**
1. ⚙️ Ir para **"API e Modelos"** → **"OpenAI"**
2. 🔑 Clicar no campo **"Chave da API"**
3. ✏️ Digitar: `sk-proj-test123456789abcdefghijklmnop`
4. 👀 Observar comportamento do campo
5. 💾 Clicar **"Salvar Configurações"**
6. ⏳ Aguardar 2 segundos
7. 👀 Observar feedback visual

**Resultado Esperado:**
```
✅ Campo exibe texto visível enquanto digita
✅ Mensagem: "Configurações salvas com sucesso"
✅ Campo muda para máscara: ••••••••••••••••••••••••
✅ Placeholder: "API key configurada (clique para alterar)"
```

**Console esperado:**
```javascript
main.js: Recebido SAVE_API_KEY - provider: openai
✅ API key salva com segurança para provider: openai
✅ Cliente OpenAI inicializado com sucesso
```

---

### Teste 2: Toggle de Visibilidade de API Key

**Objetivo:** Validar comportamento do botão "olho" (👁️)

**Pré-condições:**
- API key salva (Teste 1)

**Passos:**
1. ⚙️ Ainda na aba **"OpenAI"**
2. 👀 Confirmar que campo exibe máscara: `••••••••••••••••••••••••`
3. 👁️ Clicar no **botão do olho**
4. 👀 Observar valor exibido
5. ⏳ Aguardar 1 segundo
6. 👁️ Clicar no **botão do olho** novamente
7. 👀 Observar comportamento

**Resultado Esperado:**
```
Passo 3: Campo muda para type="text" e exibe chave real
Passo 4: Botão muda ícone para visibility_off
Passo 6: Campo volta para máscara (••••••)
         Botão volta para ícone visibility
```

---

### Teste 3: Ativar Modelo OpenAI COM Chave

**Objetivo:** Confirmar ativação bem-sucedida de modelo

**Pré-condições:**
- API key OpenAI salva (Teste 1)

**Passos:**
1. ⚙️ Ir para aba **"OpenAI"**
2. 👀 Confirmar chave configurada (máscara)
3. 🔘 Clicar **"Ativar"**
4. ⏳ Aguardar 1 segundo
5. 👀 Observar mudanças visuais

**Resultado Esperado:**
```
✅ Status badge muda para: "Ativo ●" (verde)
✅ Botão muda para: "Desativar"
✅ Mensagem: "Modelo openai ativado"
```

---

### Teste 4: Desativar Modelo OpenAI

**Objetivo:** Confirmar que desativação funciona independente de chave

**Pré-condições:**
- Modelo OpenAI ativo (Teste 3)

**Passos:**
1. ⚙️ Ainda na aba **"OpenAI"**
2. 🔘 Clicar **"Desativar"**
3. ⏳ Aguardar 1 segundo
4. 👀 Observar mudanças

**Resultado Esperado:**
```
✅ Status badge volta para: "Inativo" (cinza)
✅ Botão volta para: "Ativar"
✅ Mensagem: "Modelo openai desativado"
❌ Chave NÃO é removida (ainda configurada)
```

---

### Teste 5: Deletar API Key OpenAI

**Objetivo:** Confirmar remoção segura de API key

**Pré-condições:**
- API key OpenAI salva

**Passos:**
1. ⚙️ Ir para aba **"OpenAI"**
2. 🗑️ Clicar no **botão de lixeira**
3. ⚠️ Confirmar diálogo: "Tem certeza que deseja remover..."
4. 👀 Observar resultado

**Resultado Esperado:**
```
✅ Mensagem: "API key de openai removida"
✅ Campo limpa (valor vazio)
✅ Placeholder volta: "Insira sua API key"
✅ Atributo data-has-key="false"
```

---

### Teste 6: Selecionar Modelo de Transcrição (STT)

**Objetivo:** Validar seleção de diferentes modelos STT

**Passos:**
1. ⚙️ Ir para **"OpenAI"**
2. 📋 Clicar em **"Modelo de Transcrição"**
3. 👀 Observar opções:
   - Deepgram (Nuvem, Tempo Real)
   - Vosk (Local/Offline, Rápido)
   - Whisper.cpp (Local/Offline, Alta Precisão)
   - Whisper-1 (OpenAI/Nuvem)
4. 🔘 Selecionar **"Whisper-1"**
5. 💾 Clicar **"Salvar Configurações"**

**Resultado Esperado:**
```
✅ Seleção é persistida
✅ Próximas transcrições usam modelo selecionado
```

---

### Teste 7: Selecionar Modelo de Resposta (LLM)

**Objetivo:** Validar seleção de diferentes modelos LLM

**Passos:**
1. ⚙️ Ir para **"OpenAI"**
2. 📋 Clicar em **"Modelo de Resposta"**
3. 👀 Observar opções disponíveis
4. 🔘 Selecionar um modelo (ex: **"GPT-4o Mini"**)
5. 💾 Clicar **"Salvar Configurações"**

**Resultado Esperado:**
```
✅ Seleção é persistida
✅ Próximas respostas usam modelo selecionado
```

---

## 🔑 Testes de API Google/Gemini

### Teste 8: Ativar Modelo SEM Chave

**Objetivo:** Confirmar que não consegue ativar modelo sem chave configurada

**Pré-condições:**
- Nenhuma chave Google salva

**Passos:**
1. ⚙️ Ir para aba **"Google"**
2. 👀 Confirmar que campo está vazio
3. 🔘 Clicar **"Ativar"**
4. 👀 Observar resultado

**Resultado Esperado:**
```
❌ Erro: Configure a API key de google antes de ativar
Status badge permanece: "Inativo"
Botão permanece: "Ativar"
```

---

### Teste 9: Salvar API Key Google

**Objetivo:** Confirmar salvamento de chave Google

**Passos:**
1. ⚙️ Ir para **"API e Modelos"** → **"Google"**
2. 🔑 Clicar no campo **"Chave da API"**
3. ✏️ Digitar chave válida do Google
4. 💾 Clicar **"Salvar Configurações"**
5. 👀 Observar feedback

**Resultado Esperado:**
```
✅ Campo muda para máscara
✅ Status indica configurado
✅ Mensagem de sucesso exibida
```

---

### Teste 10: Ativar Modelo Google COM Chave

**Objetivo:** Confirmar ativação de Gemini

**Pré-condições:**
- API key Google salva (Teste 9)

**Passos:**
1. ⚙️ Aba **"Google"**
2. 🔘 Clicar **"Ativar"**
3. ⏳ Aguardar 1 segundo

**Resultado Esperado:**
```
✅ Status badge: "Ativo ●" (verde)
✅ Botão: "Desativar"
✅ Modelo Google ativado
```

---

### Teste 11: Modelos Exclusivos (OpenAI ↔ Google)

**Objetivo:** Confirmar que apenas 1 modelo pode estar ativo

**Pré-condições:**
- API keys OpenAI e Google configuradas
- Modelo OpenAI ativo

**Passos:**
1. ⚙️ Ir para aba **"Google"**
2. 🔘 Clicar **"Ativar"**
3. 👀 Observar ambas as abas

**Resultado Esperado:**
```
✅ Google fica "Ativo"
✅ OpenAI automaticamente fica "Inativo"
```

---

## 🔑 Testes de API OpenRouter

### Teste 12: Salvar API Key OpenRouter

**Objetivo:** Confirmar salvamento de chave OpenRouter

**Passos:**
1. ⚙️ Ir para **"API e Modelos"** → **"OpenRouter"**
2. 🔑 Clicar no campo **"Chave da API"**
3. ✏️ Digitar chave válida do OpenRouter
4. 💾 Clicar **"Salvar Configurações"**

**Resultado Esperado:**
```
✅ Chave salva e mascarada
✅ Feedback de sucesso
```

---

### Teste 13: Selecionar Modelo OpenRouter

**Objetivo:** Validar seleção de modelo em OpenRouter

**Passos:**
1. ⚙️ Aba **"OpenRouter"**
2. 📋 Clicar em **"Modelo de Resposta"**
3. 👀 Observar opções (deve estar vazio inicialmente)
4. 🔘 Selecionar um modelo disponível
5. 💾 Salvar

**Resultado Esperado:**
```
✅ Modelos carregam da API OpenRouter
✅ Seleção é persistida
```

---

## 📊 Testes de Gerenciamento de Modelos

### Teste 14: Status de Modelo - Ativo

**Objetivo:** Validar indicador visual de modelo ativo

**Passos:**
1. ⚙️ Na aba de qualquer provider com chave
2. 🔘 Ativar modelo
3. 👀 Observar badge de status

**Resultado Esperado:**
```
✅ Badge exibe: "Ativo ●" (verde)
✅ Ícone de status visível
✅ Cor diferente de inativo
```

---

### Teste 15: Status de Modelo - Inativo

**Objetivo:** Validar indicador visual de modelo inativo

**Passos:**
1. ⚙️ Em qualquer aba
2. 👀 Observar modelo sem ativar

**Resultado Esperado:**
```
✅ Badge exibe: "Inativo" (cinza)
✅ Sem ícone de status
```

---

### Teste 16: Feedback de Erro - Chave Inválida

**Objetivo:** Validar tratamento de chave inválida

**Passos:**
1. ⚙️ Na aba OpenAI
2. ✏️ Digitar chave inválida
3. 🔘 Clicar "Ativar"
4. 👀 Observar resposta

**Resultado Esperado:**
```
❌ Erro exibido ao tentar ativar
⚠️ Mensagem: "Chave inválida" ou similar
Modelo permanece inativo
```

---

## 📋 Checklist

```
OpenAI:
[ ] Teste 1  - Salvar API Key
[ ] Teste 2  - Toggle visibilidade
[ ] Teste 3  - Ativar modelo
[ ] Teste 4  - Desativar modelo
[ ] Teste 5  - Deletar API Key
[ ] Teste 6  - Selecionar STT
[ ] Teste 7  - Selecionar LLM

Google/Gemini:
[ ] Teste 8  - Ativar sem chave
[ ] Teste 9  - Salvar API Key
[ ] Teste 10 - Ativar modelo
[ ] Teste 11 - Exclusividade de modelos

OpenRouter:
[ ] Teste 12 - Salvar API Key
[ ] Teste 13 - Selecionar modelo

Gerenciamento:
[ ] Teste 14 - Status Ativo
[ ] Teste 15 - Status Inativo
[ ] Teste 16 - Erro chave inválida
```

---

## 🐛 Troubleshooting

### Modelo não ativa
```
• Verificar se chave tem 10+ caracteres
• Verificar se chave é válida
• Verificar conexão com internet
• Verificar console (F12) para erros
• Tentar deletar e salvar novamente
```

### API Key não mostra
```
• Verificar se foi salva corretamente
• Limpar cache/localStorage
• Reabrir a aplicação
• Verificar console para erros
• Tentar deletar e salvar novamente
```

### Erro ao ativar modelo
```
• Confirmadtecnico que chave é válida
• Testar chave no site do provider
• Verificar quota/créditos disponíveis
• Verificar console para erro específico
• Tentar reabrir aplicação
```

---

**Data de Criação:** Janeiro 23, 2026  
**Versão:** 1.0.0  
**Status:** Pronto para testes ✅
