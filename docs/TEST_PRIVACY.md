# 🔒 Testes - Seção Privacidade

> Testes de segurança, privacidade e limpeza de dados

---

## 📋 Índice

- [Testes de Visibilidade](#testes-de-visibilidade)
- [Testes de Telemetria](#testes-de-telemetria)
- [Testes de Limpeza de Dados](#testes-de-limpeza-de-dados)
- [Testes de Retenção](#testes-de-retenção-de-dados)
- [Checklist](#checklist)
- [Troubleshooting](#troubleshooting)

---

## 👁️ Testes de Visibilidade

### Teste 1: Ocultar de Capturas de Tela

**Objetivo:** Validar opção de invisibilidade

**Pré-condições:**

- Outro programa com captura de tela aberto

**Passos:**

1. ⚙️ Ir para **"Privacidade"**
2. ☐ Observar checkbox **"Ocultar aplicativo de capturas de tela"**
3. ☑️ Marcar checkbox
4. 💾 Clicar **"Salvar Configurações de Privacidade"**
5. 🎯 Abrir Print Screen ou Snip & Sketch
6. 🖼️ Tentar capturar a tela incluindo AskMe
7. 👀 Observar se AskMe aparece

**Resultado Esperado:**

```
Antes de marcar:
  ✅ AskMe aparece normalmente nas capturas

Depois de marcar:
  ❌ AskMe não aparece (transparente/oculta)
```

---

### Teste 2: Persistência da Opção de Ocultação

**Objetivo:** Validar que configuração é salva

**Pré-condições:**

- Checkbox marcado (Teste 1)

**Passos:**

1. 🔄 Fechar e reabrir aplicação
2. ⚙️ Ir para **"Privacidade"**
3. 👀 Verificar checkbox

**Resultado Esperado:**

```
✅ Checkbox continua marcado
✅ Comportamento persiste
```

---

## 📡 Testes de Telemetria

### Teste 3: Desativar Telemetria

**Objetivo:** Validar opção de desativar coleta de dados

**Passos:**

1. ⚙️ Na aba **"Privacidade"**
2. ☐ Observar checkbox **"Desativar telemetria anônima"**
3. ☑️ Marcar checkbox
4. 💾 Clicar **"Salvar Configurações de Privacidade"**
5. 👀 Observar mudança (não deve haver mudança visual, é interna)

**Resultado Esperado:**

```
✅ Checkbox pode ser marcado
✅ Configuração é salva
✅ Não há envio de dados de telemetria
```

---

### Teste 4: Telemetria Padrão (Habilitada)

**Objetivo:** Confirmar que telemetria é ativada por padrão

**Passos:**

1. 🗑️ Limpar localStorage
2. 🚀 Reabrir aplicação
3. ⚙️ Ir para **"Privacidade"**
4. 👀 Observar checkbox

**Resultado Esperado:**

```
✅ Checkbox está DESMARCADO (telemetria habilitada)
```

---

### Teste 5: Persistência de Telemetria

**Objetivo:** Validar que configuração de telemetria é persistida

**Pré-condições:**

- Telemetria desativada (Teste 3)

**Passos:**

1. 🔄 Fechar e reabrir
2. ⚙️ Ir para **"Privacidade"**
3. 👀 Verificar checkbox

**Resultado Esperado:**

```
✅ Checkbox continua marcado
```

---

## 🗑️ Testes de Limpeza de Dados

### Teste 6: Auto-limpeza ao Fechar

**Objetivo:** Validar limpeza automática de dados temporários

**Passos:**

1. ⚙️ Na aba **"Privacidade"**
2. ☑️ Marcar **"Limpar dados automaticamente ao fechar"**
3. 💾 Salvar
4. 🏠 Ir para Home
5. 🎙️ Executar ações (transcrição, resposta)
6. 🔥 Fechar aplicação (botão power no menu)
7. 🚀 Reabrir aplicação
8. 🏠 Voltar para Home
9. 👀 Observar se histórico foi limpo

**Resultado Esperado:**

```
✅ Dados temporários são removidos ao fechar
✅ Histórico pode estar vazio (dependendo da implementação)
❌ API keys e configs principais NÃO são removidas
```

---

### Teste 7: Desativar Auto-limpeza

**Objetivo:** Validar que auto-limpeza pode ser desativada

**Passos:**

1. ⚙️ Na aba **"Privacidade"**
2. ☐ Desmarcar **"Limpar dados automaticamente"**
3. 💾 Salvar
4. 🏠 Home - executar ações
5. 🔥 Fechar aplicação
6. 🚀 Reabrir
7. 🏠 Home
8. 👀 Observar se histórico foi preservado

**Resultado Esperado:**

```
✅ Dados são preservados
✅ Histórico continua visível
```

---

## 📊 Testes de Retenção de Dados

### Teste 8: Seleção de Dias de Retenção

**Objetivo:** Validar opção de retenção

**Passos:**

1. ⚙️ Na aba **"Privacidade"**
2. 📋 Observar **"Retenção de Dados"** combobox
3. 👀 Verificar opções
4. 🔘 Selecionar **"30 dias"**
5. 💾 Salvar

**Resultado Esperado:**

```
Opções disponíveis:
  ✅ 1 dia
  ✅ 7 dias (padrão)
  ✅ 30 dias
  ✅ Nunca excluir

Seleção:
  ✅ Pode selecionar qualquer opção
  ✅ Seleção é persistida
```

---

### Teste 9: Retenção Padrão

**Objetivo:** Confirmar que padrão é 7 dias

**Pré-condições:**

- localStorage limpo

**Passos:**

1. 🚀 Reabrir aplicação
2. ⚙️ Ir para **"Privacidade"**
3. 👀 Observar combobox

**Resultado Esperado:**

```
✅ Opção "7 dias" está selecionada por padrão
```

---

### Teste 10: Nunca Excluir

**Objetivo:** Validar opção de retenção infinita

**Passos:**

1. 📋 Selecionar **"Nunca excluir"**
2. 💾 Salvar
3. 🏠 Criar dados
4. ⏳ Aguardar 30 dias (testar via sistema)
5. 👀 Observar se dados ainda existem

**Resultado Esperado:**

```
✅ Dados nunca são excluídos automaticamente
✅ Retenção infinita ativada
```

---

## 🔐 Testes de Segurança

### Teste 11: Armazenamento Seguro de API Keys

**Objetivo:** Validar que chaves são criptografadas

**Passos:**

1. ⚙️ Ir para **"API e Modelos"**
2. 🔑 Salvar uma API key
3. F12 Abrir DevTools → Application
4. 📍 Ir para **localStorage**
5. 👀 Procurar pela API key

**Resultado Esperado:**

```
❌ API key completa NÃO aparece em localStorage
✅ Dados criptografados ou em secure storage
(chaves armazenadas via electron-store)
```

---

### Teste 12: Mascaramento de API Key

**Objetivo:** Validar que chaves são mascaradas na UI

**Pré-condições:**

- API key salva

**Passos:**

1. ⚙️ Ir para **"API e Modelos"**
2. 👀 Observar campo de API key

**Resultado Esperado:**

```
✅ Campo exibe máscara: ••••••••••••••••
✅ Chave completa NÃO é visível
✅ Botão de visualização (olho) permite ver temporariamente
```

---

### Teste 13: Botão Deletar API Key

**Objetivo:** Validar remoção segura de dados sensíveis

**Passos:**

1. ⚙️ Ir para **"API e Modelos"** → **"OpenAI"**
2. 🗑️ Clicar botão de lixeira
3. ⚠️ Confirmar diálogo
4. F12 DevTools → localStorage
5. 👀 Procurar pela chave

**Resultado Esperado:**

```
✅ Chave é removida completamente
✅ Campo fica vazio
❌ Chave NÃO aparece em localStorage
```

---

## 📋 Checklist

```
Visibilidade:
[ ] Teste 1  - Ocultar de capturas
[ ] Teste 2  - Persistência ocultação

Telemetria:
[ ] Teste 3  - Desativar telemetria
[ ] Teste 4  - Telemetria padrão
[ ] Teste 5  - Persistência telemetria

Limpeza:
[ ] Teste 6  - Auto-limpeza ao fechar
[ ] Teste 7  - Desativar auto-limpeza

Retenção:
[ ] Teste 8  - Seleção retenção
[ ] Teste 9  - Retenção padrão
[ ] Teste 10 - Nunca excluir

Segurança:
[ ] Teste 11 - Armazenamento seguro
[ ] Teste 12 - Mascaramento chave
[ ] Teste 13 - Deletar API key
```

---

## 🐛 Troubleshooting

### Dados não são limpos ao fechar

```
• Verificar se auto-limpeza está ativada
• Confirmar que aplicação fechou completamente
• Verificar console para erros
• Tentar reabrir e verificar novamente
```

### Chave aparece em localStorage

```
• Confirmar que foi salva com sucesso
• Verificar se está em electron-store (não localStorage)
• Limpar localStorage e salvar novamente
• Verificar console para erros
```

### Ocultação não funciona

```
• Confirmar que checkbox está marcado
• Salvar configuração
• Reabrir aplicação
• Tentar ferramenta diferente de captura
• Reiniciar sistema operacional
```

### Auto-limpeza não funciona

```
• Confirmar que checkbox está marcado
• Fechar aplicação completamente (não minimize)
• Verificar console para erros
• Tentar manualmente resetar dados
```

---

**Data de Criação:** Janeiro 23, 2026  
**Versão:** 1.0.0  
**Status:** Pronto para testes ✅
