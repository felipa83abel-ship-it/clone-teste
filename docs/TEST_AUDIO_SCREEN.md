# 🎙️ Testes - Seção Áudio e Tela

> Testes de dispositivos de áudio, VU meters e captura de tela

---

## 📋 Índice

- [Preparação para Testes](#preparação-para-testes)
- [Testes de Áudio](#testes-de-áudio)
- [Testes de Captura de Tela](#testes-de-captura-de-tela)
- [Checklist](#checklist)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Preparação para Testes

### Requisitos

```
✅ Dispositivo(s) de áudio conectado(s)
✅ VoiceMeeter instalado (opcional, para saída)
✅ Microfone funcional
✅ Speaker funcional
✅ Permissões de áudio concedidas
```

---

## 🎤 Testes de Áudio

### Teste 1: Seleção de Dispositivo de Entrada

**Objetivo:** Validar seleção e listagem de microfones

**Passos:**

1. ⚙️ Ir para **"Áudio e Tela"** → **"Áudio"**
2. 📋 Observar dropdown **"Dispositivo de Entrada"**
3. 👀 Verificar opções disponíveis
4. 🎤 Selecionar um microfone
5. ⏳ Aguardar 2 segundos
6. 📊 Observar VU meter de entrada

**Resultado Esperado:**

```
Dropdown contém:
  🔇 Nenhum (Desativado)
  🎤 Microfone (Realtek High Definition Audio)
  🎤 Microfone (USB Audio Device)
  ...

VU meter DEVE oscilar IMEDIATAMENTE após selecionar
SEM precisar clicar "Começar a Ouvir"
```

---

### Teste 2: VU Meter - Entrada (Tempo Real)

**Objetivo:** Confirmar que volume oscila em tempo real

**Pré-condições:**

- Microfone selecionado (Teste 1)

**Passos:**

1. ⚙️ Aba **"Áudio"**
2. 👀 Observar barra verde **"Nível de Volume (Entrada)"**
3. 🎙️ **Fazer barulho** perto do microfone
4. 📊 Observar oscilação da barra
5. 🤫 Ficar em silêncio
6. 📊 Observar barra voltar para 0%

**Resultado Esperado:**

```
Barra oscila IMEDIATAMENTE ao fazer barulho
Cores mudam:
  🟢 Verde (baixo volume)
  🟡 Amarelo (médio)
  🔴 Vermelho (alto)
Barra volta para 0% no silêncio
```

---

### Teste 3: Trocar Dispositivo de Entrada

**Objetivo:** Validar reinicialização de monitoramento

**Pré-condições:**

- Dispositivo de entrada já selecionado

**Passos:**

1. ⚙️ Aba **"Áudio"**
2. 🎤 **Selecionar outro microfone**
3. ⏳ Aguardar 2 segundos
4. 🎙️ Fazer barulho no novo microfone
5. 📊 Observar VU meter

**Resultado Esperado:**

```
✅ Stream anterior é fechada
✅ Nova stream inicia automaticamente
✅ VU meter começa a oscilar com novo dispositivo
```

---

### Teste 4: Dispositivo de Saída (VoiceMeeter)

**Objetivo:** Validar captura de áudio de outros participantes

**Pré-requisitos:**

- VoiceMeeter instalado
- Áudio tocando no sistema

**Passos:**

1. ⚙️ Ir para **"Dispositivo de Saída"**
2. 🔊 Selecionar **VoiceMeeter Output**
3. ⏳ Aguardar 2 segundos
4. 🎵 Tocar áudio no sistema
5. 📊 Observar VU meter de saída

**Resultado Esperado:**

```
✅ VU meter OSCILA conforme áudio do sistema
✅ Independente de "Começar a Ouvir"
```

---

### Teste 5: Permissões de Áudio Negadas

**Objetivo:** Validar comportamento quando permissões são negadas

**Passos:**

1. 🚀 Abrir aplicação
2. ⚠️ Navegador pede permissão de microfone
3. ❌ **Negar permissão**
4. ⚙️ Ir para **"Áudio e Tela"**
5. 🎤 Tentar selecionar microfone

**Resultado Esperado:**

```
❌ Dropdown vazio ou com erro
⚠️ Mensagem de erro no console
```

**Solução:**

```
1. Conceder permissões nas configurações do navegador
2. Reabrir aplicação
3. Tentar novamente
```

---

### Teste 6: VU Meter Home

**Objetivo:** Validar monitoramento também na aba Home

**Passos:**

1. 🏠 Ir para **"Home"**
2. 👀 Observar seção **"Monitoramento de Volume"**
3. 👀 Verificar se há dois VU meters (entrada e saída)
4. 🎙️ Fazer barulho no microfone
5. 📊 Observar oscilação

**Resultado Esperado:**

```
✅ Dois VU meters visíveis (entrada e saída)
✅ Oscilam em tempo real sem precisar de "Começar a Ouvir"
✅ Cores mudam conforme volume
```

---

### Teste 7: Latência de Monitoramento

**Objetivo:** Confirmar que monitoramento é em tempo real

**Passos:**

1. ⚙️ Na aba **"Áudio"**
2. 👀 Observar VU meter
3. 🎙️ Fazer som curto (bater palma)
4. ⏱️ Cronometrar delay até barra responder

**Resultado Esperado:**

```
✅ Delay < 50ms (imperceptível)
✅ Sem lag no monitoramento
```

---

## 📸 Testes de Captura de Tela

### Teste 8: Atalho Screenshot Padrão

**Objetivo:** Validar atalho padrão Ctrl+Shift+S

**Passos:**

1. ⚙️ Ir para **"Áudio e Tela"** → **"Captura de Tela"**
2. 👀 Observar **"Atalho para Screenshot"**
3. ✅ Deve exibir: **"Ctrl+Shift+S"**
4. 🎯 Selecionar uma janela de fundo
5. ⌨️ Pressionar **Ctrl+Shift+S**
6. 👀 Observar se screenshot é capturado

**Resultado Esperado:**

```
✅ Badge no topo muda: "📸 1 screenshots"
✅ Imagem é salva internamente
```

---

### Teste 9: Gravar Novo Atalho

**Objetivo:** Validar personalização de atalho

**Passos:**

1. ⚙️ Na aba **"Captura de Tela"**
2. 🔘 Clicar em **"Gravar Atalho"**
3. ⌨️ Pressionar nova combinação (ex: **Alt+S**)
4. 👀 Observar atualização

**Resultado Esperado:**

```
✅ Campo atualiza para novo atalho
✅ Próximas capturas usam novo atalho
✅ Mudança é persistida
```

---

### Teste 10: Formato de Imagem - PNG

**Objetivo:** Validar opção PNG

**Passos:**

1. ⚙️ Na aba **"Captura de Tela"**
2. 📋 Selecionar **"PNG (maior qualidade)"**
3. ⌨️ Tirar screenshot
4. 👀 Observar badge (número aumenta)

**Resultado Esperado:**

```
✅ Imagem é salva como PNG
✅ Qualidade máxima
```

---

### Teste 11: Formato de Imagem - JPG

**Objetivo:** Validar opção JPG

**Passos:**

1. ⚙️ Na aba **"Captura de Tela"**
2. 📋 Selecionar **"JPG (menor tamanho)"**
3. ⌨️ Tirar screenshot
4. 👀 Observar tamanho menor (se possível comparar)

**Resultado Esperado:**

```
✅ Imagem é salva como JPG
✅ Arquivo menor que PNG
```

---

### Teste 12: Excluir Aplicação de Capturas

**Objetivo:** Validar opção de invisibilidade

**Passos:**

1. ⚙️ Na aba **"Captura de Tela"**
2. ☑️ Marcar **"Excluir esta aplicação das capturas"**
3. 💾 Salvar configuração
4. 🎯 Abrir outra aplicação
5. ⌨️ Tirar screenshot com Snip & Sketch ou similar
6. 👀 Observar se aplicação AskMe aparece

**Resultado Esperado:**

```
❌ Aplicação AskMe NÃO aparece na captura
✅ Transparente para screenshots externos
```

---

### Teste 13: Clear Screenshots Button

**Objetivo:** Validar limpeza de screenshots

**Passos:**

1. 🏠 Ir para **"Home"**
2. 📸 Tirar 3-5 screenshots
3. 👀 Observar badge: "📸 3 screenshots"
4. 🗑️ Clicar em **"🗑️"** (botão limpeza)
5. 👀 Observar resultado

**Resultado Esperado:**

```
✅ Badge muda para: "📸 0 screenshots"
✅ Todas as screenshots removidas
```

---

## 📋 Checklist

```
Áudio:
[ ] Teste 1  - Seleção dispositivo entrada
[ ] Teste 2  - VU Meter entrada
[ ] Teste 3  - Trocar dispositivo entrada
[ ] Teste 4  - Dispositivo saída
[ ] Teste 5  - Permissões negadas
[ ] Teste 6  - VU Meter Home
[ ] Teste 7  - Latência monitoramento

Captura de Tela:
[ ] Teste 8  - Atalho padrão
[ ] Teste 9  - Gravar novo atalho
[ ] Teste 10 - Formato PNG
[ ] Teste 11 - Formato JPG
[ ] Teste 12 - Excluir aplicação
[ ] Teste 13 - Clear screenshots
```

---

## 🐛 Troubleshooting

### Volume não oscila

```
• Verificar se o dispositivo está selecionado
• Verificar se há áudio no ambiente
• Verificar console para erros (F12)
• Tentar outro dispositivo
• Reiniciar aplicação
```

### Permissões não funcionam

```
• Verificar configurações do navegador
• Verificar permissões do sistema (Windows/macOS)
• Desinstalar e reinstalar navegador (último recurso)
• Tentar em navegador diferente
```

### Atalho screenshot não funciona

```
• Verificar se novo atalho foi salvo
• Tentar atalho padrão novamente
• Verificar console para erros
• Reiniciar aplicação
```

### Aplicação ainda aparece em capturas

```
• Verificar se checkbox está marcado
• Salvar configuração novamente
• Reiniciar aplicação
• Tentar usar outra ferramenta de screenshot
```

---

**Data de Criação:** Janeiro 23, 2026  
**Versão:** 1.0.0  
**Status:** Pronto para testes ✅
