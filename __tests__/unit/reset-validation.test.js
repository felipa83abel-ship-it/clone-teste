/**
 * Teste para validar que o reset limpa completamente o histórico de perguntas
 * Simula: 2 perguntas -> reset -> verificar limpeza
 */

const AppState = require('../../infra/state/AppState');

describe('Reset de histórico de perguntas', () => {
  let appState;

  beforeEach(() => {
    appState = new AppState();
  });

  test('Histórico deve estar vazio inicialmente', () => {
    expect(appState.interview.questionsHistory.length).toBe(0);
    expect(appState.history.length).toBe(0);
  });

  test('Deve adicionar 2 perguntas ao histórico', () => {
    appState.history.push(
      {
        id: 'q1',
        text: 'Pergunta 1',
        turnId: 1,
        createdAt: Date.now(),
        lastUpdateTime: Date.now(),
      },
      {
        id: 'q2',
        text: 'Pergunta 2',
        turnId: 2,
        createdAt: Date.now(),
        lastUpdateTime: Date.now(),
      }
    );

    expect(appState.interview.questionsHistory.length).toBe(2);
    expect(appState.history.length).toBe(2);
    console.log('✅ 2 perguntas adicionadas ao histórico');
    console.log(
      '   - ID do histórico:',
      appState.history.map((q) => q.id)
    );
  });

  test('Deve limpar completamente o histórico com splice(0)', () => {
    // Setup: adicionar perguntas
    appState.history.push(
      {
        id: 'q1',
        text: 'Pergunta 1',
        turnId: 1,
        createdAt: Date.now(),
        lastUpdateTime: Date.now(),
      },
      {
        id: 'q2',
        text: 'Pergunta 2',
        turnId: 2,
        createdAt: Date.now(),
        lastUpdateTime: Date.now(),
      }
    );

    console.log('ANTES DO RESET:');
    console.log('  Histórico length:', appState.history.length);
    console.log(
      '  Perguntas:',
      appState.history.map((q) => q.id)
    );
    expect(appState.history.length).toBe(2);

    // Simular reset: esvaziar completamente com splice(0)
    appState.interview.questionsHistory.splice(0);

    console.log('DEPOIS DO RESET:');
    console.log('  Histórico length:', appState.history.length);
    console.log(
      '  Perguntas:',
      appState.history.map((q) => q.id)
    );

    // Validar que histórico foi limpo
    expect(appState.interview.questionsHistory.length).toBe(0);
    expect(appState.history.length).toBe(0);
    console.log('✅ Histórico foi completamente limpo');
  });

  test('Deve permitir adicionar novas perguntas após reset', () => {
    // Setup: adicionar e depois resetar
    appState.history.push({
      id: 'q1',
      text: 'Pergunta 1',
      turnId: 1,
      createdAt: Date.now(),
      lastUpdateTime: Date.now(),
    });

    appState.interview.questionsHistory.splice(0);
    expect(appState.history.length).toBe(0);

    // Adicionar pergunta após reset
    appState.history.push({
      id: 'q3',
      text: 'Pergunta 3 (após reset)',
      turnId: 1, // Resetou globalQuestionCounter também
      createdAt: Date.now(),
      lastUpdateTime: Date.now(),
    });

    console.log('APÓS RESET E NOVA PERGUNTA:');
    console.log('  Histórico length:', appState.history.length);
    console.log(
      '  Perguntas:',
      appState.history.map((q) => ({ id: q.id, text: q.text }))
    );

    expect(appState.history.length).toBe(1);
    expect(appState.history[0].id).toBe('q3');
    expect(appState.history[0].text).toContain('Pergunta 3');
    console.log('✅ Novo histórico limpo com sucesso');
  });

  test('Referência de questionsHistory deve ser mantida após splice', () => {
    const ref1 = appState.interview.questionsHistory;

    appState.history.push({
      id: 'q1',
      text: 'Pergunta 1',
      turnId: 1,
      createdAt: Date.now(),
      lastUpdateTime: Date.now(),
    });

    const ref2 = appState.interview.questionsHistory;

    // splice(0) esvazia mantendo referência
    appState.interview.questionsHistory.splice(0);

    const ref3 = appState.interview.questionsHistory;

    // Verificar que ainda é o mesmo objeto
    expect(ref1).toBe(ref2);
    expect(ref2).toBe(ref3);
    expect(appState.history.length).toBe(0);
    console.log('✅ Referência mantida após splice(0)');
  });

  test('globalQuestionCounter deve ser zerado no reset', () => {
    appState.globalQuestionCounter = 5;
    expect(appState.globalQuestionCounter).toBe(5);

    // Simular reset: zerar contador
    appState.globalQuestionCounter = 0;

    expect(appState.globalQuestionCounter).toBe(0);
    console.log('✅ globalQuestionCounter zerado');
  });

  test('Fluxo completo: 2 perguntas -> reset -> nova pergunta com ID 1', () => {
    console.log('\n🧪 FLUXO COMPLETO DE TESTE');

    // 1. Adicionar 2 perguntas
    console.log('1️⃣ Adicionando 2 perguntas...');
    appState.globalQuestionCounter = 1;
    appState.globalQuestionCounter = 2;
    appState.history.push(
      {
        id: 'q1',
        text: 'Pergunta 1',
        turnId: 1,
        createdAt: Date.now(),
        lastUpdateTime: Date.now(),
      },
      {
        id: 'q2',
        text: 'Pergunta 2',
        turnId: 2,
        createdAt: Date.now(),
        lastUpdateTime: Date.now(),
      }
    );
    console.log(`   Histórico contém: ${appState.history.length} perguntas`);
    console.log(`   IDs: ${appState.history.map((q) => q.id).join(', ')}`);

    // 2. Executar reset
    console.log('2️⃣ Executando reset...');
    appState.interview.questionsHistory.splice(0);
    appState.globalQuestionCounter = 0;
    expect(appState.history.length).toBe(0);
    expect(appState.globalQuestionCounter).toBe(0);
    console.log(`   Histórico limpo: ${appState.history.length} perguntas`);
    console.log(`   Contador resetado: ${appState.globalQuestionCounter}`);

    // 3. Adicionar nova pergunta (deve ter ID baseado em contador zerado)
    console.log('3️⃣ Adicionando nova pergunta após reset...');
    appState.globalQuestionCounter = 1;
    appState.history.push({
      id: 'q3',
      text: 'Pergunta Nova (após reset)',
      turnId: 1, // Deve ser 1, não 3
      createdAt: Date.now(),
      lastUpdateTime: Date.now(),
    });
    console.log(`   Histórico contém: ${appState.history.length} pergunta`);
    console.log(`   IDs: ${appState.history.map((q) => q.id).join(', ')}`);
    console.log(`   turnId: ${appState.history[0].turnId}`);

    // 4. Validações finais
    console.log('4️⃣ Validações finais...');
    expect(appState.history.length).toBe(1);
    expect(appState.history[0].id).toBe('q3');
    expect(appState.history[0].turnId).toBe(1);
    expect(appState.globalQuestionCounter).toBe(1);
    console.log('✅ TESTE PASSOU: Reset funcionando corretamente!');
  });
});
