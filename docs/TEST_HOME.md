# 🏠 Testes - Seção Home

> Testes da aba principal com transcrição, perguntas e respostas

---

## 📋 Índice

- [Preparação para Testes](#preparação-para-testes)
- [Testes de Transcrição](#testes-de-transcrição)
- [Testes de Perguntas](#testes-de-perguntas)
- [Testes de Respostas](#testes-de-respostas)
- [Testes de Interface Home](#testes-de-interface-home)
- [Checklist](#checklist)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Preparação para Testes

### Requisitos

```bash
✅ Node.js 18+ instalado
✅ npm 8+ instalado
✅ npm install executado
✅ API key OpenAI configurada
✅ Microfone funcional
✅ Permissões de áudio concedidas
```

### Setup Inicial

```bash
npm start
# Navegue até "Home"
# Ativar um modelo em "API e Modelos"
```

---

## 📝 Testes de Transcrição

### Teste 1: Validação de Modelo Ativo

**Objetivo:** Confirmar que não consegue iniciar escuta sem modelo ativo

**Pré-condições:**

- Aplicação aberta
- Nenhum modelo ativo

**Passos:**

1. 🏠 Ir para aba **Home**
2. 👀 Observar botão "Começar a Ouvir"
3. ⏯️ Clicar no botão
4. 👀 Observar mensagem de status

**Resultado Esperado:**

```
❌ Botão NÃO inicia escuta
⚠️ Status: "ative um modelo de IA antes de começar a ouvir"
⚠️ Mensagem de erro exibida
```

**Console esperado:**

```javascript
⚠️ hasActiveModel() retornou false
```

---

### Teste 2: Início de Escuta

**Objetivo:** Validar início de captura de áudio

**Pré-condições:**

- Modelo OpenAI ativo
- Microfone selecionado

**Passos:**

1. 🏠 Aba **Home**
2. ⏯️ Clicar **"Começar a Ouvir"**
3. 👀 Observar mudanças visuais
4. 👀 Observar status

**Resultado Esperado:**

```
✅ Botão muda para: "Stop"
✅ Status: "Status: ouvindo..."
✅ VU meters continuam oscilando
```

**Console esperado:**

```javascript
🎯 Modo restaurado: INTERVIEW
✅ Controller inicializado com sucesso
```

---

### Teste 3: Detectar Fala

**Objetivo:** Confirmar que áudio é capturado ao falar

**Pré-condições:**

- Escuta ativa (Teste 2)

**Passos:**

1. 🎙️ **Falar no microfone**: "Olá, este é um teste"
2. 👀 Observar seção **"Transcrição"**
3. ⏳ Aguardar 2-5 segundos
4. 👀 Observar resultado

**Resultado Esperado:**

```
Seção "Transcrição" exibe:
[14:30:15] Você: ...
(aguarda transcrição)
[14:30:18] Você: Olá, este é um teste
[start: 14:30:15 - stop: 14:30:16] (grav 1200ms, lat 450ms, total 1650ms)
```

**Console esperado:**

```javascript
🎙️ iniciando gravação de entrada - startAt 14:30:15
⏹️ parando gravação de entrada por silêncio
STT main: received transcribe-audio buffer, size: 38400
✅ timing: ipc_stt_roundtrip 450 ms
✅ Placeholder atualizado com texto final
```

---

### Teste 4: Silêncio Ignorado

**Objetivo:** Confirmar que ruídos pequenos são ignorados

**Pré-condições:**

- Escuta ativa

**Passos:**

1. 🤫 Ficar em **silêncio total** por 5 segundos
2. 💨 Fazer **ruído muito baixo** (respirar/esfregar dedo)
3. 👀 Observar se aparece na transcrição
4. ⏳ Aguardar 5 segundos

**Resultado Esperado:**

```
❌ Nenhuma transcrição gerada
✅ Blob muito pequeno é descartado (< 1000 bytes)
```

**Console esperado:**

```javascript
(nada ou)
⚠️ Buffer muito pequeno, ignorando
```

---

### Teste 5: Fala Longa

**Objetivo:** Validar transcrição de áudio prolongado

**Pré-condições:**

- Escuta ativa

**Passos:**

1. 🎙️ **Falar continuamente** por 10-15 segundos:
   ```
   "O que é programação orientada a objetos?
   Como implementar herança múltipla em Java?
   Explique o padrão Singleton e suas vantagens."
   ```
2. 🤫 Parar de falar
3. ⏳ Aguardar 3-5 segundos
4. 👀 Observar transcrição

**Resultado Esperado:**

```
Transcrição aparece completa:
[14:32:10] Você: O que é programação orientada a objetos? Como implementar herança múltipla em Java? Explique o padrão Singleton e suas vantagens.
[start: 14:32:00 - stop: 14:32:10] (grav 10200ms, lat 580ms, total 10780ms)
```

**Console esperado:**

```javascript
STT main: received transcribe-audio buffer, size: 96000
timing: ipc_stt_roundtrip 580 ms
```

---

### Teste 6: Parar Escuta

**Objetivo:** Confirmar que escuta pode ser interrompida

**Pré-condições:**

- Escuta ativa

**Passos:**

1. ⏯️ Clicar **"Stop"**
2. 👀 Observar mudanças
3. 🎙️ Tentar falar no microfone
4. 👀 Confirmar que não transcreve

**Resultado Esperado:**

```
✅ Botão volta para: "Começar a Ouvir"
✅ Status: "Status: parado"
❌ Fala NÃO é transcrita
✅ VU meters CONTINUAM oscilando (monitoramento ativo)
```

**Console esperado:**

```javascript
⏹️ inputRecorder.onstop chamado
```

---

## ❓ Testes de Perguntas

### Teste 7: Consolidação de Pergunta (Modo Entrevista)

**Objetivo:** Validar detecção automática de perguntas

**Pré-condições:**

- Modo **"Entrevista"** selecionado
- Escuta ativa
- VoiceMeeter capturando áudio de outro participante

**Passos:**

1. 🔊 **Reproduzir pergunta** via speaker (simula entrevistador):
   ```
   "O que é polimorfismo em Java?"
   ```
2. ⏳ Aguardar 5 segundos (transcrição + consolidação)
3. 👀 Observar seção **"Perguntas Consolidadas"**

**Resultado Esperado:**

```
Seção "Perguntas Consolidadas" exibe:
┌─────────────────────────────────────────┐
│ ⚠️ 14:35:20 — O que é polimorfismo em Java? │ ← Pergunta Atual (amarelo)
└─────────────────────────────────────────┘

✅ Borda azul indica seleção
✅ Timeout de 300ms aguarda finalização
```

**Console esperado:**

```javascript
🟠 handleSpeech - author: Outros
🧠 currentQuestion (parcial): O que é polimorfismo
🎯 interviewTurnId: 1
🧪 temporizador de auto-fechamento definido
```

---

### Teste 8: Fechamento Automático de Pergunta

**Objetivo:** Confirmar timeout de 300ms fecha pergunta

**Pré-condições:**

- Pergunta detectada (Teste 7)

**Passos:**

1. 👀 Observar **"Pergunta Atual"** (amarelo)
2. ⏳ Aguardar **300ms** (sem nova fala)
3. 👀 Observar mudança

**Resultado Esperado:**

```
Pergunta Atual PERMANECE visível
(modo entrevista NÃO promove automaticamente)
Aguarda GPT responder primeiro
```

**Console esperado:**

```javascript
⏱️ Auto close question disparado
➡️ closeCurrentQuestion chamou askGpt
```

---

### Teste 9: Pergunta Incompleta

**Objetivo:** Validar detecção de perguntas cortadas

**Pré-condições:**

- Modo entrevista ativo

**Passos:**

1. 🔊 Reproduzir pergunta **incompleta**:
   ```
   "O que é abstra..." (corta antes de terminar)
   ```
2. ⏳ Aguardar 5 segundos
3. 👀 Observar histórico

**Resultado Esperado:**

```
Histórico contém:
┌───────────────────────────────────────┐
│ ⚠️ O que é abstra...                  │ ← Badge "incompleta"
└───────────────────────────────────────┘

✅ NÃO envia ao GPT automaticamente
✅ Requer clique manual para enviar
```

**Console esperado:**

```javascript
⚠️ pergunta incompleta detectada
✅ promovendo ao histórico como incompleta
```

---

### Teste 10: Múltiplas Perguntas Simultâneas

**Objetivo:** Validar gerenciamento de múltiplas perguntas

**Pré-condições:**

- Modo entrevista ativo

**Passos:**

1. 🔊 Reproduzir 3 perguntas rapidamente:
   ```
   "O que é herança?"
   "Como funciona interfaces?"
   "Diferença entre abstract e interface?"
   ```
2. ⏳ Aguardar 10 segundos
3. 👀 Observar histórico e respostas

**Resultado Esperado:**

```
Histórico contém 3 perguntas (ordem reversa)
Apenas a ÚLTIMA recebe resposta automática
Outras ficam no histórico aguardando envio manual
```

**Console esperado:**

```javascript
🎯 interviewTurnId: 1
🎯 interviewTurnId: 2
🎯 interviewTurnId: 3
✅ gptAnsweredTurnId: 3 (apenas última)
```

---

## 💬 Testes de Respostas

### Teste 11: Resposta GPT Automática (Streaming)

**Objetivo:** Validar streaming de resposta em tempo real

**Pré-condições:**

- Pergunta consolidada (Teste 8)

**Passos:**

1. 👀 Observar seção **"Respostas GPT"** (direita)
2. ⏳ Aguardar início do streaming
3. 👀 Observar tokens aparecendo

**Resultado Esperado:**

```
Resposta aparece token por token:
┌────────────────────────────────────────┐
│ ⏱️ 14:35:20 — O que é polimorfismo...  │
│ ───────────────────────────────────── │
│ Polimorfismo é a capacidade de um...  │ ← Texto streaming
│ objeto assumir múltiplas formas...    │
└────────────────────────────────────────┘

✅ Borda azul lateral (ativa)
✅ Scroll automático para resposta
```

**Console esperado:**

```javascript
⏳ enviando para o GPT via stream...
🟢 GPT_STREAM_CHUNK recebido (token parcial) Polim
🟢 GPT_STREAM_CHUNK recebido (token parcial) orfismo
🟢 GPT_STREAM_CHUNK recebido (token parcial)  é
...
✅ GPT_STREAM_END recebido (stream finalizado)
```

---

### Teste 12: Promoção de Pergunta para Histórico

**Objetivo:** Confirmar que pergunta vai para histórico após resposta

**Pré-condições:**

- Resposta GPT finalizada (Teste 11)

**Passos:**

1. 👀 Observar **"Pergunta Atual"** (amarelo)
2. 👀 Observar **"Histórico de Perguntas"** (abaixo)
3. ⏳ Aguardar 1 segundo

**Resultado Esperado:**

```
Pergunta Atual LIMPA (vazia)
Histórico contém:
┌───────────────────────────────────────┐
│ ✅ ⏱️ 14:35:20 — O que é polimorfismo...│ ← Borda verde (respondida)
└───────────────────────────────────────┘
```

**Console esperado:**

```javascript
📚 promovendo pergunta para histórico
✅ gptAnsweredTurnId definido: 1
```

---

### Teste 13: Modo Normal - Envio Manual

**Objetivo:** Validar que modo normal NÃO envia automaticamente

**Pré-condições:**

- Modo **"Padrão"** selecionado

**Passos:**

1. ⚙️ Ir para **"Outros"** → Modo: **"Padrão"**
2. 🏠 Voltar para **"Home"**
3. ⏯️ Clicar **"Começar a Ouvir"**
4. 🔊 Reproduzir pergunta:
   ```
   "O que é encapsulamento?"
   ```
5. ⏳ Aguardar 10 segundos
6. 👀 Observar se GPT responde automaticamente

**Resultado Esperado:**

```
❌ GPT NÃO responde automaticamente
✅ Pergunta vai para histórico
✅ Requer clique em "Gerar resposta" (Ctrl+Enter)
```

**Console esperado:**

```javascript
🔵 modo NORMAL — promovendo CURRENT para histórico sem chamar GPT
```

---

### Teste 14: Envio Manual ao GPT (Ctrl+Enter)

**Objetivo:** Confirmar envio manual de pergunta

**Pré-condições:**

- Pergunta no histórico (Teste 13)

**Passos:**

1. 👆 **Clicar na pergunta** no histórico
2. ⌨️ Pressionar **Ctrl+Enter**
3. 👀 Observar seção **"Respostas GPT"**

**Resultado Esperado:**

```
✅ Nova resposta aparece (batch, não streaming)
✅ Pergunta marcada com borda verde (respondida)
```

**Console esperado:**

```javascript
🤖 askGpt chamado | questionId: uuid-123
⏳ enviando para o GPT (batch)...
✅ resposta do GPT recebida (batch)
```

---

## 🎨 Testes de Interface Home

### Teste 15: Botão "Começar a Ouvir"

**Objetivo:** Validar estado e feedback do botão principal

**Passos:**

1. 👀 Localizar botão **"Começar a Ouvir... (Ctrl+d)"**
2. 🎨 Observar estilo (cor, cursor, efeitos)
3. ⏯️ Clicar no botão
4. 👀 Observar mudança de estado

**Resultado Esperado:**

```
Estado parado:
  ✅ Cor: azul claro
  ✅ Texto: "Começar a Ouvir..."
  ✅ Cursor: pointer
  ✅ Hover: highlight

Estado escutando:
  ✅ Cor: vermelho
  ✅ Texto: "Stop"
  ✅ Pulsação visual (opcional)
```

---

### Teste 16: Seção de Transcrição

**Objetivo:** Validar exibição de transcrição

**Passos:**

1. 🏠 Na aba Home
2. 🎙️ Falar algo enquanto escuta ativa
3. 👀 Observar seção **"Transcrição"**

**Resultado Esperado:**

```
Seção exibe:
  ✅ Título: "Transcrição"
  ✅ Timestamp: [HH:MM:SS]
  ✅ Prefixo: "Você: "
  ✅ Texto transcrito
  ✅ Timing: (grav XXms, lat XXms, total XXms)
```

---

### Teste 17: Seção de Perguntas

**Objetivo:** Validar layout de perguntas

**Passos:**

1. 👀 Observar seção **"❔ Perguntas Consolidadas"**
2. 🎙️ Gerar pergunta (modo entrevista)
3. 👀 Observar "Pergunta Atual" (amarelo)

**Resultado Esperado:**

```
Layout contém:
  ✅ Titulo: "❔ Perguntas Consolidadas"
  ✅ Seção "Pergunta Atual" (amarelo)
  ✅ Seção "Histórico" (abaixo)
  ✅ Cards de pergunta com timestamp
```

---

### Teste 18: Seção de Respostas

**Objetivo:** Validar layout de respostas

**Passos:**

1. 👀 Observar seção **"🤖 Respostas GPT"** (direita)
2. 🎯 Enviar pergunta ao GPT
3. 👀 Observar resposta aparecer

**Resultado Esperado:**

```
Layout contém:
  ✅ Titulo: "🤖 Respostas GPT"
  ✅ Botão: "Gerar resposta (Ctrl+Enter)"
  ✅ Cards de resposta com conteúdo markdown
  ✅ Scroll automático para nova resposta
```

---

### Teste 19: Reset Home Button

**Objetivo:** Validar limpeza de dados

**Passos:**

1. 🏠 Na aba Home
2. 🔘 Localizar botão **"🔄"** (reset - canto inferior da seção de volume)
3. 🖱️ Clicar no botão
4. 👀 Observar resultado

**Resultado Esperado:**

```
✅ Transcrição limpa
✅ Pergunta Atual limpa
✅ Histórico de Perguntas limpa
✅ Histórico de Respostas limpa
✅ Status volta para "parado"
```

---

### Teste 20: Clear Screenshots Button

**Objetivo:** Validar limpeza de screenshots

**Passos:**

1. 🏠 Na aba Home
2. 🔘 Localizar botão **"🗑️"** (ao lado do botão reset)
3. 🖱️ Clicar no botão
4. 👀 Observar badge de screenshots

**Resultado Esperado:**

```
✅ Badge muda de "📸 5 screenshots" para "📸 0 screenshots"
✅ Todos os screenshots são removidos
```

---

## 📋 Checklist

```
Transcrição:
[ ] Teste 1  - Validação de modelo ativo
[ ] Teste 2  - Início de escuta
[ ] Teste 3  - Detectar fala
[ ] Teste 4  - Silêncio ignorado
[ ] Teste 5  - Fala longa
[ ] Teste 6  - Parar escuta

Perguntas:
[ ] Teste 7  - Consolidação (Modo Entrevista)
[ ] Teste 8  - Fechamento automático
[ ] Teste 9  - Pergunta incompleta
[ ] Teste 10 - Múltiplas perguntas

Respostas:
[ ] Teste 11 - Resposta GPT (Streaming)
[ ] Teste 12 - Promoção para histórico
[ ] Teste 13 - Modo Normal (manual)
[ ] Teste 14 - Envio manual (Ctrl+Enter)

Interface:
[ ] Teste 15 - Botão "Começar a Ouvir"
[ ] Teste 16 - Seção de Transcrição
[ ] Teste 17 - Seção de Perguntas
[ ] Teste 18 - Seção de Respostas
[ ] Teste 19 - Reset Home Button
[ ] Teste 20 - Clear Screenshots Button
```

---

## 🐛 Troubleshooting

### Botão "Começar a Ouvir" desabilitado

```
• Ativar um modelo em "API e Modelos"
• Selecionar um dispositivo de áudio
• Verificar se API key está salva
• Verificar console (F12) para erros
• Tentar reabrir aplicação
```

### Transcrição não aparece

```
• Confirmar que modelo está ativo
• Verificar se clicou "Começar a Ouvir"
• Fazer barulho mais alto no microfone
• Aguardar mais tempo (latência pode ser alta)
• Verificar console para erros de API
• Testar API key em openai.com
```

### GPT não responde

```
• Verificar se pergunta está selecionada (borda azul)
• Pressionar Ctrl+Enter novamente
• Verificar modo (Normal vs Entrevista)
• Verificar console para erros
• Testar API key em openai.com
• Verificar créditos da API
```

### Pergunta não consolida

```
• Verificar modo (deve estar em "Entrevista")
• Confirmar que VoiceMeeter/speaker está capturando áudio
• Aumentar volume da fala reproduzida
• Verificar console para erros de VAD
• Tentar reiniciar escuta
```

### Resposta aparece incompleta

```
• Aguardar mais tempo (streaming pode ser lento)
• Verificar conexão com internet
• Verificar se API key tem créditos
• Tentar novamente
• Verificar console para erros de stream
```

---

**Data de Criação:** Janeiro 23, 2026  
**Versão:** 1.0.0  
**Status:** Pronto para testes ✅
