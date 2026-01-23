# 🎯 Instruções para Próximas Ações

## Status Atual: ✅ FIX ENTREVISTA IMPLEMENTADO

A solução foi desenvolvida e commitada. Falta executar os testes para validação.

---

## 📋 Checklist de Testes (Antes de Próximas Tarefas)

### ✅ Teste 1: Pergunta Simples em Entrevista

```
1. npm start
2. Ativar modo entrevista
3. Falar uma pergunta simples: "Qual é o seu nome?"
4. Detectar silêncio
5. Aguardar resposta do GPT
6. Verificar logs:
   - "🟢 ********  Está em silêncio"
   - "⏳ Iniciando stream LLM"
   - "🔥 [ENTREVISTA] Promovendo CURRENT..."
   - Sem erros
```

### ✅ Teste 2: Duas Perguntas Consecutivas

```
1. Completar Teste 1
2. Falar segunda pergunta: "Qual é sua idade?"
3. Detectar silêncio
4. Aguardar resposta
5. Verificar:
   - CURRENT limpo após primeira
   - Segunda pergunta promovida corretamente
   - Sem erro "pergunta já finalizada"
   - Histórico tem 2 perguntas/respostas
```

### ✅ Teste 3: Múltiplas Perguntas (3-5)

```
1. Repetir Teste 2 mais 2-3 vezes
2. Perguntas: "Qual é seu hobby?", "Qual música favorita?", etc.
3. Verificar fluxo contínuo sem travamentos
4. Histórico acumula corretamente
```

### ✅ Teste 4: Ruído Simultâneo

```
1. Modo entrevista, pergunta 1
2. Enquanto GPT responde:
   - Tossir
   - Falar ao fundo
   - Som do sistema
3. Verificar logs mostram "⏸️ IGNORANDO atualização..."
4. GPT responde com texto original (não misturado)
```

---

## 🚀 Passos para Executar Testes

### Começar Sessão de Teste

```bash
cd d:\Dev\Projeto Electron\git-felipa-perssua\clone-teste
npm start

# App abre em modo Electron
# Console mostra logs de inicialização
```

### Monitorar Logs

Abrir DevTools (F12) ou verificar console do terminal para:

- `🟢 ********  Está em silêncio` → VAD funcionando
- `⏳ Iniciando stream LLM` → GPT acionado
- `🔥 [ENTREVISTA] Promovendo CURRENT` → Promoção ocorrendo
- `⏸️ IGNORANDO atualização` → Flag isBeingAnswered funcionando

### Verificar Dados

- Histórico de perguntas/respostas acumula?
- CURRENT limpa entre perguntas?
- Sem duplicação de respostas?

---

## 📊 Matriz de Teste

| Teste | Ação                   | Resultado Esperado               | Status  |
| ----- | ---------------------- | -------------------------------- | ------- |
| 1     | 1 pergunta → silence   | ✅ Promove, limpa CURRENT        | ⏳ TODO |
| 2     | 2 perguntas → silence  | ✅ Ambas promovidas corretamente | ⏳ TODO |
| 3     | 3+ perguntas → silence | ✅ Fluxo contínuo                | ⏳ TODO |
| 4     | Ruído durante resposta | ✅ Ignorado, texto correto       | ⏳ TODO |
| 5     | Normal mode            | ✅ Não afetado                   | ⏳ TODO |

---

## 🔧 Se Testes Falharem

### Erro: "pergunta já finalizada"

- [ ] Verificar se isBeingAnswered = false em resetCurrentQuestion()
- [ ] Verificar se llmStreamEnd está chamando reset
- [ ] Logs mostram? `🔥 [ENTREVISTA] Promovendo`

### Erro: Texto misturado nas respostas

- [ ] Verificar se handleCurrentQuestion() retorna early quando isBeingAnswered = true
- [ ] Procurar por logs: `⏸️ IGNORANDO atualização`
- [ ] Verificar se mais áudio chega durante resposta

### Erro: CURRENT não limpa

- [ ] Verificar se renderCurrentQuestion() é chamado após promoção
- [ ] Procurar por erro em promoteCurrentToHistory()
- [ ] Verificar histórico - pergunta foi promovida?

---

## 📝 Após Testes Bem-Sucedidos

### FASE 4: Implementar Template Gemini

```javascript
// Em main.js adicionar handler para Gemini
case 'gemini':
    // Implementar integração Gemini
    // Usar formato similar OpenAI
```

### FASE 5: Cleanup e Documentação

- [ ] Remover logs de debug (ou mover para DEBUG_MODE)
- [ ] Validar todos os caminhos de arquivo
- [ ] Atualizar README.md com status final
- [ ] Preparar para release

---

## 📂 Arquivos Relevantes

- **renderer.js**: Lógica principal (currentQuestion, interview mode)
- **TEST_ENTREVISTA.md**: Cenários de teste (este arquivo)
- **FIX_ENTREVISTA_CONCURRENT.md**: Análise técnica do fix
- **RESUMO_SESSAO_2025_01_23.md**: Timeline completa

---

## 🎓 Referência Rápida

### Flag isBeingAnswered

```javascript
// Iniciar LLM response
currentQuestion.isBeingAnswered = true; // PAUSA

// Loop processamento
while (gptResponding) {
	// Novo áudio chega
	if (currentQuestion.isBeingAnswered) {
		return; // ← IGNORADO ✅
	}
}

// Fim resposta
currentQuestion.isBeingAnswered = false; // RESUME
```

### Event Flow

```
Audio → handleCurrentQuestion()
     → updateCurrentQuestion() [se não isBeingAnswered]
     → renderCurrentQuestion()

Silence → finalizeCurrentQuestion()
       → askLLM() + isBeingAnswered = true
       → llmStreamEnd
       → promoteCurrentToHistory()
       → resetCurrentQuestion() [isBeingAnswered = false]
```

---

## ⏱️ Tempo Estimado

- Teste 1-3: **15-20 minutos**
- Teste 4: **10 minutos**
- Teste 5: **5 minutos**
- **Total**: ~45 minutos

---

## 🎯 Sucesso = Quando...

✅ Teste 1: Pergunta é feita → silence detectado → GPT responde → texto limpo  
✅ Teste 2: Segunda pergunta funciona igual a primeira  
✅ Teste 3: 5 perguntas consecutivas sem erros  
✅ Teste 4: Ruído durante resposta é ignorado  
✅ Teste 5: Modo normal continua funcionando

---

**Pronto para começar testes?** → Execute: `npm start`
