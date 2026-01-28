# 🎬 Cenários de Eventos - Casos de Uso Reais

## 📌 Cenário 1: Usuário quer transcrever uma pergunta

### Setup Inicial
```
✅ App carregou
✅ Pergunta "Java é uma linguagem compilada?" selecionada
✅ Microfone configurado
```

### Ações do Usuário
```
1. Usuário pressiona Ctrl+D (ou clica botão "Escutar")
   └─ Handler: listenToggleBtn() [audio-controller.js]
   
2. Sistema inicia captura de áudio
   └─ appState.audio.isRunning = true
```

### Sequência de Eventos

```
[T=0ms] Audio capture started
        │
        └─ EMIT: 'listenButtonToggle'
           Dados: { isRunning: true, buttonText: '⏹️ Parando...' }
           │
           └─ LISTEN: HomeUIManager.js:399
              ├─ listenBtn.textContent = '⏹️ Parando...'
              └─ listenBtn.classList.add('active')

[T=50ms] User speaks into microphone
        └─ Audio frames captured

[T=150ms] STT (Deepgram) receives first chunk
        │
        ├─ EMIT: 'updateInterim' (partial/interim)
        │  Dados: { id: 'interim_1', text: 'Java é' }
        │  │
        │  └─ LISTEN: HomeUIManager.js
        │     └─ Renderiza texto parcial em gris (placeholder)
        │
        └─ Status: "Ouvindo..." → "Java é..."

[T=250ms] More audio arrives
        │
        └─ EMIT: 'updateInterim'
           Dados: { id: 'interim_1', text: 'Java é uma linguagem' }
           │
           └─ LISTEN: HomeUIManager.js
              └─ Atualiza texto do placeholder

[T=350ms] User stops speaking (silence detected)
        │
        ├─ EMIT: 'placeholderFulfill' (final result)
        │  Dados: { id: 'interim_1', text: 'Java é uma linguagem compilada?' }
        │  │
        │  └─ LISTEN: HomeUIManager.js
        │     ├─ Remove classe 'interim'
        │     ├─ Adiciona classe 'final'
        │     └─ Texto agora em negrito (final)
        │
        └─ EMIT: 'transcriptAdd' (adiciona ao histórico)
           Dados: { questionId: 'Q1', text: 'Java é uma linguagem compilada?', author: 'YOU' }
           │
           └─ LISTEN: HomeUIManager.js:442
              ├─ Cria elemento <div class="transcript">
              ├─ document.getElementById('transcriptionText').textContent = 'Java é...'
              └─ transcriptionText.classList.add('visible')

[T=400ms] STT finaliza
        │
        └─ EMIT: 'clearInterim'
           Dados: { id: 'interim_1' }
           │
           └─ LISTEN: HomeUIManager.js
              └─ Remove elemento placeholder do DOM
```

### Estado Final
```
✅ Transcrição visível: "Java é uma linguagem compilada?"
✅ Botão volta a: "🎤 Escutar"
✅ Pronto para enviar ao LLM ou selecionar outra pergunta
```

---

## 📌 Cenário 2: LLM responde com streaming

### Setup Inicial
```
✅ Pergunta transcrita: "Java é uma linguagem compilada?"
✅ Usuário clicou "Ask LLM" ou pressionou Ctrl+Enter
✅ Validação passou (pergunta válida, token disponível)
```

### Sequência de Eventos

```
[T=0ms] askLLM() called from renderer.js:468
        │
        ├─ Valida pergunta
        ├─ Roteia por modo (INTERVIEW vs NORMAL)
        └─ Chama handleLLMStream()

[T=100ms] OpenAI API conecta e inicia streaming
        │
        ├─ EMIT: 'answerStream' (token 1)
        │  Dados: { questionId: 'Q1', text: 'Sim,', turnId: 1 }
        │  │
        │  └─ LISTEN: HomeUIManager.js:520
        │     ├─ Encontra element answer-Q1
        │     ├─ element.textContent += 'Sim,'
        │     └─ Resultado: 'Sim,'
        │
        └─ Status: Vazio → 'Sim,'

[T=120ms] Token 2 arrives
        │
        ├─ EMIT: 'answerStream'
        │  Dados: { questionId: 'Q1', text: ' Java', turnId: 1 }
        │  │
        │  └─ LISTEN: HomeUIManager.js:520
        │     └─ element.textContent += ' Java'
        │        Resultado: 'Sim, Java'
        │
        └─ UI atualiza em tempo real

[T=140ms] Token 3 arrives
        │
        ├─ EMIT: 'answerStream'
        │  Dados: { questionId: 'Q1', text: ' é', turnId: 1 }
        │
        └─ Resultado: 'Sim, Java é'

[...mais tokens chegam...]

[T=500ms] Último token recebido
        │
        ├─ EMIT: 'answerStream'
        │  Dados: { questionId: 'Q1', text: '.', turnId: 1 }
        │
        └─ Resultado: 'Sim, Java é uma linguagem compilada ou interpretada, tecnicamente é compilada para bytecode...'

[T=510ms] Stream fechado (sem mais tokens)
        │
        ├─ EMIT: 'answerStreamEnd'
        │  Dados: {
        │    questionId: 'Q1',
        │    response: '[Full answer text]',
        │    turnId: 1
        │  }
        │  │
        │  └─ LISTEN: HomeUIManager.js:572
        │     ├─ Finaliza formatação da resposta
        │     ├─ Remove classe 'streaming'
        │     └─ Adiciona classe 'complete'
        │
        ├─ EMIT: 'llmStreamEnd'
        │  Dados: {}
        │  │
        │  └─ LISTEN: renderer.js:97
        │     ├─ globalThis.appState.interview.responseEnded = true
        │     └─ Registra tempo em metrics
        │
        └─ EMIT: 'sortAnswersByTurnId'
           Dados: {}
           │
           └─ LISTEN: HomeUIManager.js:587
              └─ Reordena blocos de respostas por turnId
```

### Estado Final
```
✅ Resposta completa visível
✅ Mostrada em histórico com badge turnId
✅ Pronto para próxima pergunta
✅ Metrics registrados para análise
```

### Timeline Visual
```
User Input:
├─ T=0: "Ask LLM" button clicked
├─ T=100: API connects
│
Token Stream:
├─ T=110: 'Sim,'                           [5 chars]
├─ T=120: ' Java'                          [10 chars total]
├─ T=130: ' é'                             [12 chars total]
├─ T=150: ' uma'                           [16 chars total]
├─ T=170: ' linguagem'                     [26 chars total]
├─ T=200: ' compilada'                     [36 chars total]
├─ T=220: ' ou'                            [39 chars total]
├─ T=230: ' interpretada,'                 [52 chars total]
├─ T=250: ' tecnicamente'                  [65 chars total]
├─ T=270: ' é'                             [67 chars total]
├─ T=300: ' compilada'                     [77 chars total]
├─ T=320: ' para'                          [82 chars total]
├─ T=350: ' bytecode...'                   [94 chars total]
│
Completion:
└─ T=360: Stream closed, response complete ✅
```

---

## 📌 Cenário 3: Mudança de Configuração (Opacidade)

### Setup Inicial
```
✅ App rodando
✅ Janela com opacidade = 1.0 (100% opaca)
✅ User vê slider de opacidade na aba "Janela"
```

### Ações do Usuário
```
User arrasta slider de opacidade para 0.5 (50%)
```

### Sequência de Eventos

```
[T=0ms] HTML 'change' event fires (slider value changed)
        │
        ├─ Event: <input type="range" id="opacityRange" value="0.5">
        │  └─ Default HTML handler: value = 0.5
        │
        └─ Listener in renderer.js (opacityRange listener)
           ├─ Lê: opacityRange.value = 0.5
           ├─ Valida: 0 ≤ 0.5 ≤ 1 ✓
           │
           └─ EMIT: 'windowOpacityUpdate'
              Dados: { opacity: 0.5 }
              │
              └─ LISTEN: WindowUIManager.js:318
                 ├─ Encontra element opacityRange
                 ├─ opacityRange.value = 0.5 (sync)
                 └─ Registra em appState ou localStorage

[T=50ms] Efeito visual aplicado
        │
        ├─ Main process recebe IPC message
        ├─ BrowserWindow.setOpacity(0.5)
        └─ Janela agora transparente a 50%
```

### Estado Final
```
✅ Slider mostra: 0.5
✅ Janela é 50% transparente
✅ Valor persistido em store
✅ Na próxima vez que app abre, opacidade = 0.5
```

---

## 📌 Cenário 4: Reset de Histórico

### Setup Inicial
```
✅ Histórico com 5 perguntas/respostas
✅ User clica botão "Limpar Histórico"
```

### Sequência de Eventos

```
[T=0ms] User clica "Clear History" button
        │
        └─ Handler: resetAppState() [renderer-helpers.js]
           ├─ Limpa: appState.history = []
           ├─ Limpa: appState.selectedId = null
           ├─ Reseta: appState.interview metrics
           │
           ├─ EMIT: 'questionsHistoryUpdate'
           │  Dados: [] (array vazio)
           │  │
           │  └─ LISTEN: HomeUIManager.js:498
           │     ├─ Encontra questionsHistoryBox
           │     ├─ questionsHistoryBox.innerHTML = ''
           │     └─ DOM completamente vazio
           │
           ├─ EMIT: 'currentQuestionUpdate'
           │  Dados: { id: null, text: '' }
           │  │
           │  └─ LISTEN: HomeUIManager.js:480
           │     ├─ Encontra currentQuestion div
           │     ├─ currentQuestion.textContent = ''
           │     └─ currentQuestion.classList.remove('active')
           │
           ├─ EMIT: 'transcriptionCleared'
           │  Dados: {}
           │  │
           │  └─ LISTEN: HomeUIManager.js:456
           │     ├─ transcriptionText.textContent = ''
           │     └─ transcriptionText.classList.remove('visible')
           │
           ├─ EMIT: 'answersCleared'
           │  Dados: {}
           │  │
           │  └─ LISTEN: HomeUIManager.js:468
           │     ├─ answersBox.innerHTML = ''
           │     └─ Todas respostas removidas
           │
           └─ EMIT: 'statusUpdate'
              Dados: { message: 'Histórico limpo' }
              │
              └─ LISTEN: HomeUIManager.js:430
                 └─ statusBar.textContent = 'Histórico limpo'
```

### Estado Final
```
✅ Histórico vazio
✅ Pergunta atual: nenhuma
✅ Transcrição: vazia
✅ Respostas: nenhuma
✅ Status: "Histórico limpo"
✅ Pronto para começar nova entrevista
```

---

## 📌 Cenário 5: Mudança de Dispositivo de Áudio

### Setup Inicial
```
✅ STT ativo com microfone padrão
✅ User plugga headset com microfone
```

### Ações do Sistema
```
1. Desktop/SO detecta novo dispositivo de áudio
2. config-manager.js detecta mudança
3. Emite evento para STT trocar dispositivo
```

### Sequência de Eventos

```
[T=0ms] New audio device detected
        │
        └─ config-manager.js detects change
           │
           └─ EMIT: 'audioDeviceChanged'
              Dados: { type: 'input', deviceId: 'headset-123' }
              │
              └─ LISTEN: renderer.js:292
                 ├─ Obtém STT model configurado
                 ├─ Valida: STT está rodando?
                 │  └─ appState.audio.isRunning = true ✓
                 │
                 └─ Chama: sttStrategy.switchDevice(model, 'input', 'headset-123')
                    │
                    └─ O STT provider apropriado (deepgram/vosk/whisper)
                       └─ Para com mic antigo
                       └─ Começa com headset
```

### Estado Final
```
✅ Áudio agora capturado do headset
✅ Transcrição continua (sem interrupção)
✅ User vê: "Microfone: Headset USB"
```

---

## 📌 Cenário 6: Erro na Transcrição

### Setup Inicial
```
✅ User está escutando (STT rodando)
✅ Rede cai (ou API Deepgram offline)
```

### Sequência de Eventos

```
[T=0ms] STT tenta conectar à API
        │
        └─ Erro: Network timeout / 401 Unauthorized

[T=100ms] Error caught in STT provider
        │
        ├─ Log: console.error('STT Error:', error)
        │
        └─ EMIT: 'error'
           Dados: 'Failed to connect to transcription service'
           │
           └─ LISTEN: renderer.js:138
              ├─ globalThis.Logger.error('Erro na eventBus', { error })
              │
              └─ Se configManager existe:
                 └─ configManager.showError(error)
                    │
                    └─ Mostra toast vermelha:
                       "❌ Failed to connect to transcription service"
                       └─ Desaparece em 5 segundos
```

### Também:

```
[T=150ms] STT provider auto-para
        │
        └─ EMIT: 'listenButtonToggle'
           Dados: { isRunning: false, buttonText: '🎤 Escutar' }
           │
           └─ LISTEN: HomeUIManager.js:399
              └─ listenBtn volta ao estado inicial
```

### Estado Final
```
✅ User vê erro na tela
✅ Microfone parou (STT desativou)
✅ Pode tentar de novo ou verificar conexão
```

---

## 📌 Cenário 7: Seleção de Pergunta

### Setup Inicial
```
✅ Histórico mostra 5 perguntas
✅ Pergunta 3 atualmente selecionada
```

### Ações do Usuário
```
User clica na pergunta 1 para selecioná-la
```

### Sequência de Eventos

```
[T=0ms] DOM 'click' event on question block
        │
        └─ Handler: handleQuestionClick() [question-controller.js]
           ├─ Encontra pergunta com ID 'Q1'
           ├─ Valida: pergunta existe? ✓
           ├─ Atualiza: appState.selectedId = 'Q1'
           │
           └─ EMIT: 'currentQuestionUpdate'
              Dados: { id: 'Q1', text: 'O que é Java?' }
              │
              └─ LISTEN: HomeUIManager.js:480
                 ├─ Remove classe 'active' de pergunta anterior
                 ├─ Adiciona classe 'active' à pergunta Q1
                 ├─ Renderiza texto da pergunta no painel
                 ├─ Mostra resposta anterior (se existir)
                 └─ Botão "Ask LLM" agora aponta para Q1

[T=50ms] Também:

        └─ EMIT: 'questionsHistoryUpdate'
           Dados: [lista atualizada de perguntas]
           │
           └─ LISTEN: HomeUIManager.js:498
              └─ Re-renderiza todo histórico
                 └─ Marca Q1 como selecionada (CSS highlight)
```

### Estado Final
```
✅ Pergunta 1 agora selecionada (visual: highlight)
✅ Texto da pergunta exibido no painel
✅ Resposta anterior (se houver) visível
✅ "Ask LLM" button agora refere-se a Q1
✅ Pronto para enviar nova pergunta ou editar
```

---

## 📊 Tabela Resumida: Evento → O que Acontece

| Cenário | Evento | Emissor | Ouvinte | Resultado |
|---------|--------|---------|---------|-----------|
| User pede transcrição | `listenButtonToggle` | audio-ctrl | HomeUI | Botão muda estado |
| STT envia texto | `transcriptAdd` | STT | HomeUI | Texto renderizado |
| LLM envia token | `answerStream` | llmHandlers | HomeUI | Token adicionado ao DOM |
| Stream finalizado | `answerStreamEnd` | llmHandlers | HomeUI | Resposta completa |
| User move slider | `windowOpacityUpdate` | renderer | WindowUI | Opacidade sincronizada |
| User clica limpar | `questionsHistoryUpdate` | helpers | HomeUI | Histórico vazio |
| User muda pergunta | `currentQuestionUpdate` | question-ctrl | HomeUI | Pergunta destaca |
| Erro ocorre | `error` | Qualquer | renderer | Toast de erro mostrada |

---

## 🎯 Key Takeaways

1. **Events são assíncronos** - Emit → Listeners reagem (podem demorar)
2. **Multiple listeners podem escutar o mesmo evento** - Cada um reage de forma independente
3. **Dados passados são imutáveis** - Listeners não devem modificar dados do emit
4. **Ordem de execução** - Listeners registrados primeiro executam primeiro
5. **Sem eventos perdidos se listeners carregarem antes** - Ordem em index.html é crítica!

---

Esperamos que esses cenários clarifiquem como o sistema de eventos realmente funciona na prática!
