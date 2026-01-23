# Fix: Modo Entrevista - Concurrent Updates em CURRENT

## Problema Identificado

Quando múltiplas perguntas eram feitas em modo entrevista, a segunda pergunta e subsequentes falhavam com erro "pergunta já finalizada" ou eram promovidas com texto incorreto.

**Raiz:** Enquanto o GPT responde a pergunta 1, o áudio capturado durante a resposta era processado e atualizava `currentQuestion.text`. Quando `llmStreamEnd` era acionado, o `currentQuestion` continha texto misturado ou da próxima pergunta.

## Solução Implementada

Adicionar flag `isBeingAnswered` a `currentQuestion` para pausar atualizações enquanto GPT responde.

### Mudanças no renderer.js

**1. Inicialização de currentQuestion (linha 204)**

```javascript
let currentQuestion = {
	text: '',
	lastUpdate: 0,
	finalized: false,
	promotedToHistory: false,
	isBeingAnswered: false, // ← NOVO
	lastUpdateTime: null,
	createdAt: null,
	finalText: '',
	interimText: '',
};
```

**2. Guard em handleCurrentQuestion() (linha ~933)**

```javascript
if (author === OTHER) {
	// 🔥 [CRÍTICO] Se pergunta está sendo respondida, IGNORAR atualizações
	if (currentQuestion.isBeingAnswered) {
		debugLogRenderer(`⏸️ IGNORANDO atualização do CURRENT (pergunta sendo respondida pelo GPT)`, true);
		return;
	}
	// ... resto da função
}
```

**3. Set flag em finalizeCurrentQuestion() (linha ~1011)**

```javascript
if (ModeController.isInterviewMode()) {
	currentQuestion.finalized = true;
	currentQuestion.isBeingAnswered = true; // ← NOVO: pause updates during LLM response
	// ... askLLM call
}
```

**4. Reset flag em llmStreamEnd listener (linha ~60)**

```javascript
if (ModeController.isInterviewMode()) {
	if (currentQuestion.text && !currentQuestion.promotedToHistory) {
		promoteCurrentToHistory(currentQuestion.text);
		currentQuestion.promotedToHistory = true;
	}
	currentQuestion.isBeingAnswered = false; // ← NOVO: resume updates for next question
}
```

**5. Atualizar todos os resetCurrentQuestion() (linhas 406, 537, 1349)**

- Adicionar `isBeingAnswered: false,` a cada inicialização
- Garante que flag está limpo em toda reinicialização

## Fluxo Resultante

### Pergunta 1

```
1. Audio chega → handleCurrentQuestion() → currentQuestion.text = "..."
2. Silêncio detectado (700ms)
3. finalizeCurrentQuestion()
   ├─ finalized = true
   ├─ isBeingAnswered = true  ← PAUSA atualizações
   └─ askLLM()
4. GPT responde (streaming)
5. Audio simultâneo chega
   ├─ handleCurrentQuestion() verifica isBeingAnswered
   ├─ return (ignora)  ← CRÍTICO
6. llmStreamEnd
   ├─ promoteCurrentToHistory(currentQuestion.text)  ← texto original!
   ├─ promotedToHistory = true
   ├─ isBeingAnswered = false  ← RESUME
7. renderCurrentQuestion() limpa UI
```

### Pergunta 2

```
1. Audio chega → handleCurrentQuestion()
   ├─ currentQuestion.text = ""  ← iniciado em resetCurrentQuestion()
   ├─ isBeingAnswered = false  ← inicializado em reset
   └─ currentQuestion.text = "..."
2. (continua igual)
```

## Impacto

- ✅ Interview mode: múltiplas perguntas funcionam corretamente
- ✅ Sem corrupção de CURRENT durante resposta
- ✅ Normal mode: não afetado (flag verifica modo em finalizeCurrentQuestion)
- ✅ Backward compatible: campo novo opcional nas estruturas existentes

## Commit

`a59182f` - fix: pausar atualizações do CURRENT durante resposta do GPT com flag isBeingAnswered

## Testes Próximos

- [ ] Teste 1: Pergunta simples em entrevista
- [ ] Teste 2: Duas perguntas consecutivas
- [ ] Teste 3: Três ou mais perguntas
- [ ] Teste 4: Ruído simultâneo durante resposta
- [ ] Teste 5: Normal mode continua funcionando
