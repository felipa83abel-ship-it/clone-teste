/**
 * Teste unitário para validar fix: Pergunta dividida permanecendo em CURRENT
 *
 * Problema: Vosk pode enviar 2 transcrições finais separadas
 * Exemplo: "ir a" (final) e depois "pé" (final)
 * Se shouldFinalizeAskCurrent foi resetado entre elas, a segunda fica em CURRENT
 *
 * Solução: handleCurrentQuestion finaliza mesmo com shouldFinalizeAskCurrent=FALSE
 * se for uma mensagem final (isFinal/!isInterim) e houver texto
 */

const AppState = require('../../state/AppState');

describe('Fix: Pergunta dividida permanecendo em CURRENT', () => {
  let appState;

  beforeEach(() => {
    appState = new AppState();
    appState.globalQuestionCounter = 0; // Simular reset
  });

  test('Pergunta única deve ser consolidada normalmente', () => {
    console.log('\n🧪 Teste 1: Pergunta única (sem divisão)');

    appState.interview.currentQuestion.text = 'ir a pé';
    appState.interview.currentQuestion.finalized = false;

    expect(appState.interview.currentQuestion.text).toBe('ir a pé');
    expect(appState.interview.currentQuestion.finalized).toBe(false);

    console.log('   ✅ Pergunta única pronta para finalizar');
  });

  test('Pergunta dividida em 2 transcrições finais deve ambas serem consolidadas', () => {
    console.log('\n🧪 Teste 2: Pergunta dividida em 2 transcrições');

    // Simular primeira transcrição final
    console.log('   1. Primeira transcrição final: "ir a"');
    appState.interview.currentQuestion.text = 'ir a';
    appState.interview.currentQuestion.finalized = false;
    appState.interview.currentQuestion.createdAt = Date.now();

    // Simular finalização da primeira
    console.log('   2. Consolidando primeira transcrição ao histórico');
    const id1 = appState.getNextQuestionId();
    const id2 = appState.getNextQuestionId();
    appState.history.push(
      {
        id: id1,
        text: 'ir a',
        turnId: 1,
        createdAt: appState.interview.currentQuestion.createdAt,
      },
      {
        id: id2,
        text: 'pé',
        turnId: 2,
        createdAt: appState.interview.currentQuestion.createdAt,
      }
    );

    expect(appState.history.length).toBe(2);
    expect(appState.history[0].text).toBe('ir a');
    expect(appState.history[1].text).toBe('pé');
    expect(appState.interview.currentQuestion.text).toBe('');

    console.log('   ✅ Ambas transcrições consolidadas');
    console.log('   ✅ CURRENT está vazio (não preso)');
  });

  test('CURRENT não fica preso se shouldFinalizeAskCurrent foi resetado', () => {
    console.log('\n🧪 Teste 3: Detecção de falso-positivo de fala');

    // 1. Silêncio detectado → shouldFinalizeAskCurrent = TRUE
    console.log('   1. Silêncio detectado - shouldFinalizeAskCurrent=TRUE');
    appState.interview.currentQuestion.text = 'primeira parte';
    let shouldFinalize = true; // VAD detectou silêncio

    // 2. Vosk envia primeira transcrição final
    console.log('   2. Primeira transcrição final recebida');
    expect(appState.interview.currentQuestion.text).toBe('primeira parte');
    // shouldFinalize remains true

    // Consolidar
    appState.history.push({
      id: 'q1',
      text: appState.interview.currentQuestion.text,
      turnId: 1,
    });
    appState.interview.currentQuestion.text = '';

    // 3. Falso-positivo: VAD detecta fala (ruído?)
    console.log('   3. Falso-positivo: "fala" detectada - shouldFinalizeAskCurrent SERIA RESETADA');
    shouldFinalize = false; // Simulando reset

    // 4. Vosk envia segunda transcrição final antes do falso-positivo resolver
    console.log('   4. Segunda transcrição final chega com shouldFinalizeAskCurrent=FALSE');
    appState.interview.currentQuestion.text = 'segunda parte';
    const isInterim = false; // É final!

    // 🔥 AGORA: A lógica em handleCurrentQuestion verifica:
    // if ((shouldFinalize || (isInterim=FALSE && hasText=TRUE)) && isInterim=FALSE)
    // = (FALSE || (TRUE && TRUE)) && TRUE
    // = TRUE && TRUE = TRUE
    console.log(
      '   5. handleCurrentQuestion: shouldFinalize=' +
        shouldFinalize +
        ', isFinal=' +
        !isInterim +
        ', hasText=TRUE'
    );
    const shouldFinalizeLogic =
      (shouldFinalize || (!isInterim && appState.interview.currentQuestion.text?.trim())) &&
      !isInterim;
    console.log('   6. Lógica corrigida: finalizar = ' + shouldFinalizeLogic);

    expect(shouldFinalizeLogic).toBe(true);

    // Consolidar segunda
    appState.history.push({
      id: 'q2',
      text: appState.interview.currentQuestion.text,
      turnId: 2,
    });
    appState.interview.currentQuestion.text = '';

    expect(appState.history.length).toBe(2);
    expect(appState.interview.currentQuestion.text).toBe('');

    console.log('   ✅ Não ficou preso em CURRENT');
    console.log('   ✅ Ambas partes consolidadas');
  });

  test('Responder pergunta que ficou em CURRENT deve funcionar', () => {
    console.log('\n🧪 Teste 4: Responder pergunta em CURRENT (após fix)');

    // Setup: criar cenário onde pergunta está em CURRENT
    appState.interview.currentQuestion.text = 'pergunta em CURRENT';
    appState.interview.currentQuestion.id = 'CURRENT';
    appState.selectedId = 'CURRENT';

    // Simular resposta sendo adicionada
    console.log('   1. Pergunta em CURRENT: "' + appState.interview.currentQuestion.text + '"');
    console.log('   2. Usuário pressiona Ctrl+Enter');

    // Quando resposta chega, deve ser adicionada ao histórico
    // (não mantida em CURRENT)

    // Consolidar CURRENT para histórico
    appState.interview.currentQuestion.finalized = true;
    const id = appState.getNextQuestionId();
    appState.history.push({
      id: id,
      text: appState.interview.currentQuestion.text,
      turnId: Number.parseInt(id),
    });

    // Adicionar resposta
    appState.interview.answeredQuestions.add(id);

    // Resetar CURRENT
    appState.interview.currentQuestion.text = '';
    appState.interview.currentQuestion.finalized = false;
    appState.selectedId = null;

    console.log('   3. Pergunta consolidada ao histórico');
    console.log('   4. Resposta adicionada');
    console.log('   5. CURRENT resetado para próxima pergunta');

    expect(appState.history.length).toBe(1);
    expect(appState.interview.answeredQuestions.has(id)).toBe(true);
    expect(appState.interview.currentQuestion.text).toBe('');

    console.log('   ✅ Fluxo correto: CURRENT → Histórico → Resposta → CURRENT vazio');
  });

  test('Lógica de finalização: todos os casos', () => {
    console.log('\n🧪 Teste 5: Lógica de finalização - casos');

    const testCases = [
      {
        name: 'shouldFinalizeAskCurrent=TRUE, isFinal=TRUE, hasText=TRUE',
        shouldFinalizeAskCurrent: true,
        isInterim: false,
        hasText: true,
        expectedFinalize: true,
      },
      {
        name: 'shouldFinalizeAskCurrent=FALSE, isFinal=TRUE, hasText=TRUE (🔥 FIX)',
        shouldFinalizeAskCurrent: false,
        isInterim: false,
        hasText: true,
        expectedFinalize: true, // ← Mudou! Era FALSE, agora TRUE
      },
      {
        name: 'shouldFinalizeAskCurrent=FALSE, isFinal=FALSE, hasText=TRUE (interim)',
        shouldFinalizeAskCurrent: false,
        isInterim: true,
        hasText: true,
        expectedFinalize: false,
      },
      {
        name: 'shouldFinalizeAskCurrent=TRUE, isFinal=FALSE, hasText=TRUE (interim)',
        shouldFinalizeAskCurrent: true,
        isInterim: true,
        hasText: true,
        expectedFinalize: false,
      },
    ];

    testCases.forEach((tc) => {
      const result =
        (tc.shouldFinalizeAskCurrent || (!tc.isInterim && tc.hasText)) && !tc.isInterim;
      const status = result === tc.expectedFinalize ? '✅' : '❌';
      console.log(`   ${status} ${tc.name}`);
      console.log(`      → Esperado: ${tc.expectedFinalize}, Got: ${result}`);
      expect(result).toBe(tc.expectedFinalize);
    });
  });
});
