# ⚙️ Testes - Seção Outras Configurações

> Testes de tema, modo, idioma e configurações gerais

---

## 📋 Índice

- [Testes de Tema](#testes-de-tema)
- [Testes de Modo Entrevista](#testes-de-modo-entrevista)
- [Testes de Idioma](#testes-de-idioma)
- [Testes de Log Level](#testes-de-log-level)
- [Testes de Reset](#testes-de-reset)
- [Checklist](#checklist)
- [Troubleshooting](#troubleshooting)

---

## 🌙 Testes de Tema

### Teste 1: Dark Mode Toggle

**Objetivo:** Validar alternância de tema

**Passos:**

1. ⚙️ Ir para **"Outros"**
2. 👀 Observar **"Dark Mode"** toggle (com slider)
3. 🌙 Clicar no toggle
4. 👀 Observar mudanças visuais
5. 🔄 Clicar novamente (volta para light)
6. 🔄 Fechar e reabrir aplicação
7. 👀 Verificar se tema persiste

**Resultado Esperado:**

```
Modo Dark:
  ✅ Body recebe classe "dark"
  ✅ Fundo: #0f172a (escuro)
  ✅ Texto: #e5e7eb (claro)
  ✅ Bordas: rgba(255,255,255,0.18)

Modo Light:
  ✅ Body sem classe "dark"
  ✅ Fundo: branco/claro
  ✅ Texto: escuro
  ✅ Bordas: cinzentas

Persistência:
  ✅ Ao reabrir, tema é restaurado
```

---

### Teste 2: Tema Padrão ao Abrir

**Objetivo:** Validar que tema dark é padrão

**Passos:**

1. 🗑️ Limpar localStorage
2. 🚀 Reabrir aplicação
3. 👀 Observar tema inicial

**Resultado Esperado:**

```
✅ Tema dark é aplicado por padrão
✅ Toggle está marcado ("On")
```

---

### Teste 3: Cores do Dark Mode

**Objetivo:** Validar paleta de cores em dark mode

**Passos:**

1. 🌙 Ativar dark mode
2. 👀 Observar cores de:
   - Fundo
   - Texto
   - Inputs
   - Botões
   - Menu lateral
3. 📐 Usar DevTools (F12) para inspecionar cores

**Resultado Esperado:**

```
Fundo principal: #0f172a
Texto principal: #e5e7eb
Input background: rgba(15, 23, 42, 0.5)
Bordas: rgba(255, 255, 255, 0.18)
Menu: preto com hover azul
```

---

## 🎬 Testes de Modo Entrevista

### Teste 4: Modo Padrão vs Entrevista

**Objetivo:** Confirmar diferença de comportamento

**Passos:**

1. ⚙️ Na aba **"Home"** (topbar)
2. 📋 Combobox **"Modo"**: selecionar **"Padrão"**
3. 👀 Observar comportamento
4. 📋 Mudar para **"Entrevista"**
5. 👀 Observar mudança

**Resultado Esperado:**

```
Modo Padrão:
  • Transcrição não promove automaticamente
  • Requer clique em "Gerar resposta"

Modo Entrevista:
  • Pergunta consolida automaticamente
  • Resposta GPT dispara automaticamente
```

---

### Teste 5: Persistência do Modo

**Objetivo:** Validar que modo é salvo

**Passos:**

1. 👀 Selecionar **"Padrão"**
2. 🔄 Fechar e reabrir aplicação
3. 👀 Verificar modo

**Resultado Esperado:**

```
✅ Modo "Padrão" é restaurado
✅ Combobox exibe "Padrão"
```

---

### Teste 6: Combobox Modo

**Objetivo:** Validar opções disponíveis

**Passos:**

1. 🏠 Na aba Home
2. 📋 Clicar em combobox **"Modo"**
3. 👀 Observar opções

**Resultado Esperado:**

```
Opções:
  ✅ Padrão
  ✅ Entrevista (selecionado por padrão)
```

---

## 🌍 Testes de Idioma

### Teste 7: Seleção de Idioma

**Objetivo:** Validar seleção de idioma

**Passos:**

1. ⚙️ Ir para **"Outros"**
2. 📋 Observar **"Idioma da Interface"**
3. 👀 Verificar opções
4. 🔘 Selecionar **"English (US)"**
5. 👀 Observar mudanças (se implementado)

**Resultado Esperado:**

```
Opções disponíveis:
  ✅ Português (Brasil) - padrão
  ✅ English (US)
  ✅ Español
```

---

### Teste 8: Persistência de Idioma

**Objetivo:** Validar que idioma é salvo

**Passos:**

1. 📋 Selecionar **"English (US)"**
2. 🔄 Fechar e reabrir
3. 👀 Verificar seleção

**Resultado Esperado:**

```
✅ Idioma "English (US)" é restaurado
```

---

## 📊 Testes de Log Level

### Teste 9: Seleção de Nível de Log

**Objetivo:** Validar opções de verbosidade

**Passos:**

1. ⚙️ Na aba **"Outros"**
2. 📋 Observar **"Nível de Log"**
3. 👀 Verificar opções
4. 🔘 Selecionar **"Debug (detalhado)"**
5. 🏠 Ir para Home e executar ação
6. F12 Abrir console
7. 👀 Observar volume de logs

**Resultado Esperado:**

```
Opções:
  ✅ Somente erros
  ✅ Avisos e erros
  ✅ Informacional (padrão)
  ✅ Debug (detalhado)

Console:
  Modo Debug: muitos logs
  Modo Error: poucos logs
```

---

### Teste 10: Mudança de Log Level em Tempo Real

**Objetivo:** Validar que mudança funciona imediatamente

**Passos:**

1. F12 Abrir console
2. 📋 Mudar **"Log Level"** para **"Debug"**
3. 🏠 Executar ação (ex: clicar botão)
4. 👀 Observar console

**Resultado Esperado:**

```
✅ Logs aparecem imediatamente
✅ Sem necessidade de reabrir
```

---

## 🔄 Testes de Reset

### Teste 11: Reset Configurações (Factory Reset)

**Objetivo:** Validar restauração para padrões

**Pré-condições:**

- Várias configurações modificadas:
  - Dark mode: ON
  - Opacidade: 0.5
  - Idioma: English
  - Modo: Padrão

**Passos:**

1. ⚙️ Na aba **"Outros"**
2. 👀 Localizar seção **"Restaure as configurações..."** (danger zone)
3. 🔘 Clicar **"🔄 Restaurar Configurações de Fábrica"**
4. ⚠️ Confirmar no diálogo
5. ⏳ Aguardar reload
6. 👀 Verificar se voltou ao padrão

**Resultado Esperado:**

```
Antes:
  • Dark: ON
  • Opacidade: 0.5
  • Idioma: English
  • Modo: Padrão

Depois do reset:
  ✅ Dark: ON (padrão novo)
  ✅ Opacidade: 0.75
  ✅ Idioma: Português (Brasil)
  ✅ Modo: Entrevista
  ✅ Histórico: limpo
  ✅ API keys: deletadas
```

---

### Teste 12: Diálogo de Confirmação Reset

**Objetivo:** Validar que reset pede confirmação

**Passos:**

1. 🔘 Clicar **"Restaurar Configurações"**
2. 👀 Observar diálogo

**Resultado Esperado:**

```
✅ Diálogo exibido
✅ Pergunta: "Tem certeza..."
✅ Botões: "Confirmar" e "Cancelar"
```

---

### Teste 13: Cancelar Reset

**Objetivo:** Validar que cancelamento funciona

**Passos:**

1. 🔘 Clicar **"Restaurar Configurações"**
2. ❌ Clicar **"Cancelar"**
3. 👀 Observar se nada muda

**Resultado Esperado:**

```
✅ Diálogo fecha
✅ Configurações NÃO são alteradas
✅ Aplicação continua normal
```

---

## 🔧 Testes Adicionais

### Teste 14: Auto-Update Checkbox

**Objetivo:** Validar opção de atualização automática

**Passos:**

1. ⚙️ Na aba **"Outros"**
2. ☑️ Observar **"Buscar atualizações automaticamente"**
3. ✅ Marcar/desmarcar checkbox
4. 🔄 Fechar e reabrir
5. 👀 Verificar persistência

**Resultado Esperado:**

```
✅ Estado do checkbox é persistido
✅ Pode ser marcado/desmarcado
```

---

### Teste 15: Modo Mock Toggle

**Objetivo:** Validar toggle de modo mock (debug)

**Passos:**

1. ⚙️ Na aba **"Outros"**
2. 👀 Observar **"Modo Mock"** toggle
3. ✅ Marcar toggle
4. 🏠 Ir para Home
5. 👀 Observar badge **"🧪 MODO MOCK ATIVADO!!!"**
6. ✅ Desmarcar toggle
7. 👀 Confirmar que badge desaparece

**Resultado Esperado:**

```
Modo Mock ON:
  ✅ Badge aparece no topo
  ✅ Cores destacadas (aviso)

Modo Mock OFF:
  ✅ Badge desaparece
```

---

## 📋 Checklist

```
Tema:
[ ] Teste 1  - Dark mode toggle
[ ] Teste 2  - Tema padrão
[ ] Teste 3  - Cores dark mode

Modo:
[ ] Teste 4  - Padrão vs Entrevista
[ ] Teste 5  - Persistência modo
[ ] Teste 6  - Combobox opções

Idioma:
[ ] Teste 7  - Seleção idioma
[ ] Teste 8  - Persistência idioma

Log:
[ ] Teste 9  - Seleção log level
[ ] Teste 10 - Mudança em tempo real

Reset:
[ ] Teste 11 - Factory reset
[ ] Teste 12 - Diálogo confirmação
[ ] Teste 13 - Cancelar reset

Outros:
[ ] Teste 14 - Auto-update checkbox
[ ] Teste 15 - Modo mock toggle
```

---

## 🐛 Troubleshooting

### Dark mode não persiste

```
• Verificar localStorage (F12 → Application)
• Limpar cache se necessário
• Tentar marcar/desmarcar novamente
• Reabrir aplicação
```

### Reset não funciona

```
• Confirmar clique no "Confirmar" do diálogo
• Aguardar reload completar
• Verificar console para erros
• Tentar manualmente resetar localStorage
```

### Modo não muda

```
• Selecionar novamente no combobox
• Ir para Home para ver efeito
• Verificar console para erros
• Reabrir aplicação
```

### Log level não muda

```
• Selecionar novo nível
• Executar ação para gerar logs
• Verificar se novo nível está selecionado
• Reabrir console (F12)
```

---

**Data de Criação:** Janeiro 23, 2026  
**Versão:** 1.0.0  
**Status:** Pronto para testes ✅
