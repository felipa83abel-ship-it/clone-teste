# 📚 Guia Completo do Sistema de Eventos

## 🎯 Introdução

Este conjunto de documentos explica **como funciona o sistema de eventos** (Pub/Sub) do projeto Electron. Se você quer entender:

- ✅ **Quem emite eventos** e **quem escuta**
- ✅ **Como eventos fluem** entre componentes
- ✅ **Ordem correta de carregamento** (Listeners ANTES de Emitters)
- ✅ **Exemplos práticos** de cada evento
- ✅ **Como adicionar novos eventos**

Você está no lugar certo!

---

## 📖 Documentos Inclusos

### 1. **[SUMARIO_EVENTOS.md](./SUMARIO_EVENTOS.md)** ⭐ START HERE
**Leitura: 5 min | Nível: Iniciante**

Um resumo visual e direto:
- Tabela de emissores vs ouvintes
- Fluxos principais (áudio, LLM, config)
- Ordem de carregamento
- Mapa completo de eventos
- Checklist: Como adicionar novo evento

**👉 Comece por aqui se você quer entender o sistema rápido.**

---

### 2. **[EVENTO_FLOW_PATTERN.md](./EVENTO_FLOW_PATTERN.md)** 🏗️ DETAILED REFERENCE
**Leitura: 20 min | Nível: Intermediário/Avançado**

Documentação completa e profunda:
- Arquitetura do EventBus (classe e métodos)
- 4 tipos de fluxo de eventos (simples → complexo)
- Mapa detalhado de eventos com dados
- Padrões corretos vs incorretos (anti-patterns)
- Debugging de eventos
- Checklist: Adicionando novo evento

**👉 Leia esto quando precisar entender detalhes técnicos ou adicionar funcionalidade.**

---

### 3. **[DIAGRAMA_FLUXO_EVENTOS.md](./DIAGRAMA_FLUXO_EVENTOS.md)** 📊 VISUAL REFERENCE
**Leitura: 15 min | Nível: Visual/Todos**

Diagramas ASCII mostrando visualmente:
- Arquitetura geral (Emissores → EventBus → Ouvintes)
- Fluxo de áudio completo
- Fluxo de LLM completo
- Timeline de carregamento
- Troubleshooting comum
- Quando usar State vs Events

**👉 Leia esto para ver visualmente como funciona (great for presentations!).**

---

### 4. **[CENARIOS_EVENTOS.md](./CENARIOS_EVENTOS.md)** 🎬 REAL-WORLD EXAMPLES
**Leitura: 25 min | Nível: Todos**

7 cenários completos do mundo real:

1. **Transcrição de áudio** - User pede, transcrição aparece em tempo real
2. **LLM Streaming** - Resposta chega token por token
3. **Config Change** - User muda opacidade, janela fica transparente
4. **Reset Histórico** - Limpar tudo de uma vez
5. **Mudança de Dispositivo** - User plugga headset, STT troca dinamicamente
6. **Erro na Transcrição** - Network cai, erro mostrado
7. **Seleção de Pergunta** - User clica pergunta, ela fica destaque

Cada cenário mostra:
- Setup inicial
- Ações do usuário
- Sequência completa de eventos com timestamps
- Estado final

**👉 Leia esto para entender COMO e POR QUÊ eventos acontecem.**

---

## 🗺️ Mapa de Leitura por Caso de Uso

### 💭 "Quero entender RÁPIDO como tudo funciona"
```
1. SUMARIO_EVENTOS.md (5 min)
2. CENARIOS_EVENTOS.md - Cenário 1 (2 min)
Pronto! Entendeu o padrão básico.
```

### 🛠️ "Quero adicionar um novo evento"
```
1. SUMARIO_EVENTOS.md - Seção "Como Adicionar" (3 min)
2. EVENTO_FLOW_PATTERN.md - Checklist final (5 min)
3. Implementar!
```

### 🔍 "Quero debugar um evento que não funciona"
```
1. DIAGRAMA_FLUXO_EVENTOS.md - Troubleshooting (3 min)
2. EVENTO_FLOW_PATTERN.md - Seção Debugging (5 min)
3. DevTools Console para investigar
```

### 📚 "Quero entender completamente o sistema"
```
1. SUMARIO_EVENTOS.md (leitura rápida)
2. DIAGRAMA_FLUXO_EVENTOS.md (visualização)
3. EVENTO_FLOW_PATTERN.md (técnico)
4. CENARIOS_EVENTOS.md (prático)
5. Código-fonte: events/EventBus.js
```

### 👥 "Quero explicar para alguém"
```
1. SUMARIO_EVENTOS.md (overview)
2. DIAGRAMA_FLUXO_EVENTOS.md (visual)
3. CENARIOS_EVENTOS.md (exemplos)
4. LiveCode Demo (use EventBus no console)
```

---

## 🔑 Conceitos-Chave

### EventBus = Pub/Sub Pattern
```javascript
// Pub = Publicar (Emitir)
eventBus.emit('eventName', { data });

// Sub = Subscribe (Ouvir/Escutar)
eventBus.on('eventName', (data) => { /* reage */ });
```

### Fluxo Básico
```
Component A (Emissor)
    ↓
eventBus.emit('event', data)
    ↓
eventBus (barramento)
    ↓
Component B.on('event', handler)
    ↓
Component B (Ouvinte)
```

### Regra de Ouro
```
✅ LISTENERS REGISTRADOS ANTES DE EVENTOS EMITIDOS!

Timeline:
T0: App loads
T1: Listeners .on() são registrados
T2: User interage
T3: Eventos .emit() são disparados
T4: Listeners reagem
```

### Por Quê Isso Importa?
Se `emit()` acontecer ANTES de `on()`:
- O evento é **perdido**
- Nenhum listener reage
- Você vê: `⚠️ Nenhum listener para: eventName`

---

## 🎯 Eventos Principais (Quick Reference)

### Audio & Transcrição
```
'listenButtonToggle'      → Botão muda de estado
'transcriptAdd'          → Texto transcrever chega
'updateInterim'          → Texto parcial (interim)
'placeholderFulfill'     → Texto final
'transcriptionCleared'   → Histórico limpo
```

### LLM Response
```
'answerStream'      → Token chega (repete)
'answerStreamEnd'        → Resposta completa
'llmStreamEnd'           → Stream finalizado
'answerBatchEnd'         → Modo batch (sem streaming)
```

### UI & Config
```
'statusUpdate'           → Mensagem de status
'currentQuestionUpdate'  → Pergunta selecionada
'questionsHistoryUpdate' → Histórico atualizado
'windowOpacityUpdate'    → Opacidade da janela
'error'                  → Erro ocorreu
```

---

## 🧪 Teste no DevTools Console

```javascript
// Ver todos os eventos registrados
globalThis.eventBus.events

// Emit um evento de teste
globalThis.eventBus.emit('test-event', { msg: 'Hello' })

// Registrar um listener de teste
globalThis.eventBus.on('test-event', (data) => {
  console.log('Received:', data.msg);
})

// Ver listeners de um evento específico
globalThis.eventBus.events['test-event']

// Emitir de novo para ver listener reagir
globalThis.eventBus.emit('test-event', { msg: 'World' })
```

---

## 🚀 Próximos Passos

### Para Desenvolvedores
1. Leia [SUMARIO_EVENTOS.md](./SUMARIO_EVENTOS.md)
2. Explore [DIAGRAMA_FLUXO_EVENTOS.md](./DIAGRAMA_FLUXO_EVENTOS.md)
3. Consulte [EVENTO_FLOW_PATTERN.md](./EVENTO_FLOW_PATTERN.md) conforme necessário
4. Use [CENARIOS_EVENTOS.md](./CENARIOS_EVENTOS.md) como referência prática

### Para Adicionar Novo Evento
1. Leia: [SUMARIO_EVENTOS.md - Como Adicionar](./SUMARIO_EVENTOS.md#-como-adicionar-novo-evento)
2. Siga: [EVENTO_FLOW_PATTERN.md - Checklist](./EVENTO_FLOW_PATTERN.md#-checklist-adicionando-novo-evento)
3. Verifique: Ordem em `index.html` (listeners ANTES de emitters)
4. Documente: Adicione linha na tabela deste arquivo

### Para Debugar
1. Leia: [DIAGRAMA_FLUXO_EVENTOS.md - Troubleshooting](./DIAGRAMA_FLUXO_EVENTOS.md#-troubleshooting-common-issues)
2. Use: Console do DevTools para testar
3. Procure: `⚠️ Nenhum listener para:` nos logs
4. Verifique: Ordem de carregamento em `index.html`

---

## 📞 Precisa de Ajuda?

### Se você vê: `⚠️ Nenhum listener para: eventName`
→ [DIAGRAMA_FLUXO_EVENTOS.md - Troubleshooting](./DIAGRAMA_FLUXO_EVENTOS.md#issue-nenhum-listener-para-eventname)

### Se evento não funciona como esperado
→ [CENARIOS_EVENTOS.md](./CENARIOS_EVENTOS.md) para ver comportamento correto

### Se quer adicionar novo evento
→ [SUMARIO_EVENTOS.md - Checklist](./SUMARIO_EVENTOS.md#-como-adicionar-novo-evento)

### Se quer entender ordem de carregamento
→ [SUMARIO_EVENTOS.md - Ordem de Carregamento](./SUMARIO_EVENTOS.md#-ordem-de-carregamento-crítica)

---

## 📊 Estatísticas do Sistema

```
Total de Eventos Definidos:  18+
Emissores Únicos:            8 (audio, stt, llm, ui, config, etc)
Ouvintes Únicos:             3 (HomeUIManager, WindowUIManager, renderer.js)
Eventos mais Frequentes:     answerStream (1000+/min durante streaming)
Listeners Simultâneos:       Até 10 para o mesmo evento
Ordem de Importância:        CRÍTICA (listeners ANTES de emitters!)
```

---

## 🎓 Aprendizados Principais

1. **EventBus desacopla componentes** - Ninguém precisa conhecer o outro
2. **Listeners primeiro, emitters depois** - Ordem importa!
3. **Eventos são síncronos** - Callbacks executam imediatamente
4. **Múltiplos listeners para 1 evento** - Tudo reage
5. **Dados são estruturados** - Nunca primitivos soltos
6. **Sem broadcasts globais** - EventBus é centralizado e controlado

---

## 📝 Versionamento

Documentação atualizada para: **Versão 4.0 (Post-Refactoring)**
- ✅ EventBus centralizado
- ✅ GlobalThis para browser scripts
- ✅ Listeners registrados em #init methods
- ✅ Ordem de carregamento otimizada

---

## 🤝 Contribuindo

Se você adiciona um novo evento:
1. Update [SUMARIO_EVENTOS.md](./SUMARIO_EVENTOS.md) - Adicione linha na tabela
2. Update [EVENTO_FLOW_PATTERN.md](./EVENTO_FLOW_PATTERN.md) - Adicione no mapa de eventos
3. Considere adicionar cenário em [CENARIOS_EVENTOS.md](./CENARIOS_EVENTOS.md)
4. Mencione em [DIAGRAMA_FLUXO_EVENTOS.md](./DIAGRAMA_FLUXO_EVENTOS.md) se impacta fluxo visual

---

Última atualização: 26 de janeiro de 2026
Mantido por: Equipe de Desenvolvimento
Status: ✅ Documentação Completa
