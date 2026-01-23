# Teste Modo Entrevista - Fix isBeingAnswered

## Objetivo
Validar que o modo entrevista funciona corretamente com múltiplas perguntas, evitando que áudio simultâneo corrompa o CURRENT durante a resposta do GPT.

## Cenário Teste 1: Pergunta Simples
**Passos:**
1. Iniciar app em modo entrevista (botão ou atalho)
2. Falar: "Qual é o seu nome?"
3. Detectar silêncio (VAD)
4. Aguardar resposta do GPT
5. **Verificar:**
   - ✓ CURRENT mostra pergunta
   - ✓ VAD detecta silêncio após ~700ms
   - ✓ finalizeCurrentQuestion() é chamado
   - ✓ GPT responde com streaming
   - ✓ CURRENT é promovido para histórico
   - ✓ CURRENT é limpo para próxima pergunta

## Cenário Teste 2: Duas Perguntas Consecutivas
**Passos:**
1. Completar Teste 1
2. Falar: "Qual é a sua idade?"
3. Detectar silêncio
4. Aguardar resposta do GPT
5. **Verificar:**
   - ✓ CURRENT limpo após primeira pergunta
   - ✓ Silêncio detectado corretamente na segunda
   - ✓ isBeingAnswered = true durante resposta
   - ✓ Nova áudio da 2ª pergunta NÃO sobrescreve CURRENT
   - ✓ GPT responde com texto da 2ª pergunta (não misturado)
   - ✓ Sem erro "pergunta já finalizada"

## Cenário Teste 3: Múltiplas Perguntas (3+)
**Passos:**
1. Completar Teste 1 e 2
2. Falar: "Qual é o seu hobby?"
3. Detectar silêncio
4. Aguardar resposta
5. Repetir para pergunta 4: "Qual é sua música favorita?"
6. **Verificar:**
   - ✓ Fluxo contínuo sem travamentos
   - ✓ Cada pergunta promovida corretamente
   - ✓ Histórico acumula 3+ perguntas/respostas
   - ✓ Sem erros nos logs

## Cenário Teste 4: Ruído/Áudio Simultâneo
**Passos:**
1. Em entrevista, falar pergunta 1: "Teste um"
2. VAD detecta silêncio, GPT começa responder
3. **ENQUANTO GPT responde**, gerar áudio extra:
   - Falar ao fundo
   - Tossir
   - Som do sistema
4. GPT continua respondendo
5. **Verificar:**
   - ✓ isBeingAnswered = true
   - ✓ handleCurrentQuestion() retorna early
   - ✓ CURRENT NÃO é atualizado com novo áudio
   - ✓ GPT responde com texto original correto
   - ✓ Promoção ocorre com texto correto

## Logs Esperados (Sequência Teste 2)
```
🟢 ********  Está em silêncio                           [pergunta 1]
⏳ Iniciando stream LLM
🔥 [ENTREVISTA] Promovendo CURRENT para histórico       [pergunta 1 promovida]
[LLM responde...]
🔥 [ENTREVISTA] Promovendo CURRENT para histórico       [fim response 1]
🟢 ✅ Pergunta promovida ao histórico

🟢 ********  Está em silêncio                           [pergunta 2]
⏳ Iniciando stream LLM
⏸️ IGNORANDO atualização (pergunta sendo respondida)     [isBeingAnswered = true]
[LLM responde...]
🔥 [ENTREVISTA] Promovendo CURRENT para histórico       [pergunta 2 promovida]
🟢 ✅ Pergunta promovida ao histórico
```

## Status: EM TESTE
Data Início: 2025-01-23
Flag: isBeingAnswered adicionado a todas as 4 inicializações de currentQuestion
Commit: a59182f
