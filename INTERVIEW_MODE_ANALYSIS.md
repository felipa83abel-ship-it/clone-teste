# Análise Detalhada do Modo Entrevista - Fluxo de Streaming

**Data**: 29/12/2025  
**Status**: Diagnóstico Completo + Plano de Ação

---

## 📊 Estado Atual vs Ideal

### Comparação: Arquitetura Proposta vs Implementação Real

```
IDEAL (Seu Requisito):
[Áudio 100ms] → [STT Streaming] → [Texto parcial] → [GPT Streaming] → [Resposta]
   (contínuo)     (real-time)      (imediato)       (contínuo)        (tipo-chat)

ATUAL:
[Áudio 60ms em chunks] → [Agrupamento 120ms] → [STT Parcial NÃO-STREAMING]
                              ↓                        ↓
                        [Blob 3-27KB]        [Whisper retorna vazio]
                                                      ↓
                                        [Espera ~20s por blob >= 78KB]
                                                      ↓
                                          [Finalmente texto aparece]
                                                      ↓
                                          [GPT chamado APÓS fim]
```

---

## 🔍 Raiz do Problema

### Limitação: OpenAI Whisper API

- **NÃO suporta streaming nativo**
- Requer blob de áudio completo
- Mínimo efetivo: ~15-20KB (não 800 bytes)
- Latência: 0.5-2s por requisição
- Blobs < 15KB: frequentemente retornam vazio

### Logs Comprovam:

```
Tentativa 1: 27.4 KB → ⚠️ Transcrição vazia
Tentativa 2: 8.8 KB  → ⚠️ Transcrição vazia
Tentativa 3: 9.7 KB  → ⚠️ Transcrição vazia
Tentativa 4: 78.9 KB → ✅ "Paro, vamos lá..."
Tentativa 5: 185.2 KB → ✅ Texto completo
```

---

## 🎯 Soluções Propostas (Incrementais)

### **NÍVEL 1: Rápido (1-2 horas)**

**Objetivo**: Reduzir vazios e aparecer texto parcial mais cedo

#### 1.1 Aumentar Threshold de STT

```javascript
// renderer.js - linha ~32
const MIN_OUTPUT_AUDIO_SIZE_INTERVIEW = 15000; // Era 800 bytes!
```

**Por quê?**: Evita 90% das chamadas vazias de Whisper  
**Trade-off**: Latência de parcial sobe de 1s para 3-5s  
**Esperado**: "Paro, vamos lá" aparece em ~5s (vs 20s agora)

#### 1.2 Aumentar Janela de Agrupamento

```javascript
// renderer.js - linha ~1254
outputPartialTimer = setTimeout(async () => {
	// ... existente
}, 800); // Era 120ms
```

**Por quê?**: Acumula mais áudio antes de enviar para STT  
**Resultado**: Menos requisições, mais acuradas

#### 1.3 Aumentar Rate-Limit

```javascript
// renderer.js - linha ~30
const PARTIAL_MIN_INTERVAL_MS = 3000; // Era 700ms
```

**Por quê?**: Evita sobrecarregar Whisper com requisições simultâneas  
**Resultado**: Mais estável, menos timeouts

---

### **NÍVEL 2: Médio (2-4 horas)**

**Objetivo**: Resposta GPT começa enquanto usuário ainda fala

#### 2.1 Integrar GPT Streaming em Parciais

```javascript
// Em transcribeOutputPartial(), após "outputPartialText" atualizar:
if (
	outputPartialText.length >= 50 &&
	isQuestionReady(outputPartialText) &&
	!gptPartialStarted // Nova flag
) {
	gptPartialStarted = true;
	console.log('🤖 Iniciando GPT Streaming com parcial...');
	askGptStreaming(outputPartialText);
	// ask-gpt-stream já existe!
}
```

#### 2.2 Novo Estado Global

```javascript
// Adicionar após linha ~123:
let gptPartialStarted = false;
let partialGptUpdateCount = 0;

// Resetar em resetInterviewTurnState():
gptPartialStarted = false;
partialGptUpdateCount = 0;
```

---

### **NÍVEL 3: Avançado (4-8 horas)**

**Objetivo**: Detecção inteligente de "fim da frase"

#### 3.1 Implementar VAD (Voice Activity Detection) Simples

```javascript
// Pseudocódigo em transcribeOutputPartial:
let outputPartialLastUpdate = null;

if (partialText && partialText.trim().length > 0) {
	outputPartialLastUpdate = Date.now();

	// Detecta silêncio = fim da frase
	const silenceDetected = () => {
		if (!outputPartialLastUpdate) return false;
		return Date.now() - outputPartialLastUpdate > 1500; // 1.5s sem updates
	};

	if (silenceDetected() && outputPartialText.length > 20) {
		closeCurrentQuestion(); // Encerra mais cedo
	}
}
```

#### 3.2 Sliding Window para Contexto

```javascript
// Buffer com sobreposição:
let audioChunkBuffer = [];
const WINDOW_MS = 800;
const OVERLAP_MS = 200;

// A cada timer:
const now = Date.now();
audioChunkBuffer = audioChunkBuffer.filter(chunk => now - chunk.addedAt < WINDOW_MS);

// Manter últimos 200ms para overlap
if (totalSize(audioChunkBuffer) >= 15000) {
	const toSend = [...audioChunkBuffer];
	audioChunkBuffer = audioChunkBuffer.slice(-Math.ceil(toSend.length * 0.2));
	send(toSend);
}
```

---

## 📈 Resultados Esperados por Nível

| Nível       | Mudança        | Latência Parcial | Vazios STT | Resposta GPT  |
| ----------- | -------------- | ---------------- | ---------- | ------------- |
| **Atual**   | -              | 20-30s           | 70%        | Após fim      |
| **Nível 1** | Thresholds ↑   | 5-8s             | 10%        | Após fim      |
| **Nível 2** | +GPT Streaming | 5-8s             | 10%        | Enquanto fala |
| **Nível 3** | +VAD+Overlap   | 3-5s             | <5%        | Enquanto fala |

---

## ⚠️ Limitações Inescapáveis

1. **Whisper não streameia**: Cada requisição = 500-2000ms
2. **OpenAI rate-limits**: ~60 req/min com throttling
3. **Rede**: Latência WiFi/internet afeta timestamps

**Alternativa Real Streaming** (futuro):

- `Deepgram.ai`: Whisper streaming real (https://deepgram.com)
- `Google Speech-to-Text`: Streaming nativo
- Custo: ~$0.50-2.00 por hora vs $0.02 OpenAI

---

## ✅ Checklist Executável

- [ ] Nivel 1.1: Aumentar `MIN_OUTPUT_AUDIO_SIZE_INTERVIEW` para 15000
- [ ] Nivel 1.2: Aumentar `outputPartialTimer` para 800ms
- [ ] Nivel 1.3: Aumentar `PARTIAL_MIN_INTERVAL_MS` para 3000
- [ ] **Testar**: Parcial "Paro, vamos lá" deve aparecer em ~5-8s
- [ ] Nivel 2.1: Integrar `askGptStreaming` em parciais
- [ ] Nivel 2.2: Adicionar `gptPartialStarted` flag
- [ ] **Testar**: Resposta deve começar enquanto fala
- [ ] Nivel 3.1: Implementar VAD simples (1500ms timeout)
- [ ] Nivel 3.2: Sliding window com overlap 200ms
- [ ] **Testar e Ajustar**: Variar thresholds conforme rede/microfone

---

## 📝 Próximos Passos

**Imediato (agora)**:

1. Aplicar NÍVEL 1 (3 mudanças simples)
2. Testar com mesmo áudio
3. Colar novo log

**Se ainda houver vazios após Nível 1**:

1. Aumentar mais `MIN_OUTPUT_AUDIO_SIZE_INTERVIEW` para 20000
2. Aumentar `PARTIAL_MIN_INTERVAL_MS` para 5000

**Se latência ainda alta**:

1. Implementar Nível 2 (GPT Streaming)
2. Depois Nível 3 (VAD)
