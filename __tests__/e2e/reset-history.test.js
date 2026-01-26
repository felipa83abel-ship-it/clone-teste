/**
 * Teste E2E: Validar que o reset limpa corretamente perguntas antigas
 *
 * Fluxo:
 * 1. Ativar modo mock
 * 2. Fazer 2 perguntas
 * 3. Verificar que aparecem no histórico (perguntas 1 e 2)
 * 4. Clicar no botão reset
 * 5. Verificar que histórico foi limpo
 * 6. Fazer nova pergunta
 * 7. Verificar que só aparece 1 pergunta (não as antigas)
 */

const { test, expect } = require('@playwright/test');
const helpers = require('./helpers');

test.describe('Reset: Histórico de perguntas deve ser completamente limpo', () => {
  let page;
  let electronApp;

  test.beforeAll(async () => {
    const result = await helpers.launchElectronApp();
    electronApp = result.electronApp;
    page = result.page;
  });

  test.afterAll(async () => {
    if (page) await page.close();
    if (electronApp) await electronApp.close();
  });

  test('Deve limpar perguntas antigas após reset', async () => {
    console.log('🧪 INICIANDO TESTE: Reset de histórico');

    // 1. Ativar modo mock (para simular perguntas automaticamente)
    console.log('1️⃣ Ativando modo mock...');
    const mockToggle = await page.locator('input[id="mockToggle"]');
    const mockToggleIsChecked = await mockToggle.isChecked();
    if (!mockToggleIsChecked) {
      await mockToggle.click();
      await page.waitForTimeout(500);
    }
    console.log('   ✅ Modo mock ativado');

    // 2. Fazer 2 perguntas (em modo mock, simula automaticamente)
    console.log('2️⃣ Simulando 2 perguntas...');

    // Pergunta 1
    const listeBtn = await page.locator('button:has-text("Começar a Ouvir")');
    await listeBtn.click();
    console.log('   - Pergunta 1 iniciada');

    // Aguardar um pouco para simular fala
    await page.waitForTimeout(2000);

    // Parar e fazer a pergunta ser consolidada
    const stopKey = async () => {
      await page.keyboard.press('Control+D'); // Ctrl+D para parar
      await page.waitForTimeout(1000);
    };

    await stopKey();
    await page.waitForTimeout(1500); // Aguardar resposta LLM

    // Verificar que pergunta 1 foi adicionada
    const historyItems1 = await page.locator('#questionsHistory .question-block');
    const count1 = await historyItems1.count();
    console.log(`   - Histórico após pergunta 1: ${count1} pergunta(s)`);
    expect(count1).toBeGreaterThan(0);

    // Pergunta 2
    await listeBtn.click();
    console.log('   - Pergunta 2 iniciada');
    await page.waitForTimeout(2000);
    await stopKey();
    await page.waitForTimeout(1500);

    // Verificar que agora temos 2 perguntas
    const historyItems2 = await page.locator('#questionsHistory .question-block');
    const count2 = await historyItems2.count();
    console.log(`   ✅ Histórico após pergunta 2: ${count2} pergunta(s)`);
    expect(count2).toBe(2);

    // 3. Clicar no botão reset
    console.log('3️⃣ Clicando no botão reset...');
    const resetBtn = await page.locator('.btn-reset-home');
    await resetBtn.click();
    await page.waitForTimeout(1000);
    console.log('   ✅ Botão reset clicado');

    // 4. Verificar que histórico foi limpo
    console.log('4️⃣ Verificando limpeza do histórico...');
    const historyItemsAfterReset = await page.locator('#questionsHistory .question-block');
    const countAfterReset = await historyItemsAfterReset.count();
    console.log(`   - Histórico após reset: ${countAfterReset} pergunta(s)`);
    expect(countAfterReset).toBe(0);
    console.log('   ✅ Histórico foi completamente limpo');

    // 5. Fazer nova pergunta após reset
    console.log('5️⃣ Fazendo nova pergunta após reset...');
    await listeBtn.click();
    console.log('   - Nova pergunta iniciada');
    await page.waitForTimeout(2000);
    await stopKey();
    await page.waitForTimeout(1500);

    // 6. Verificar que só aparece 1 pergunta (a nova)
    console.log('6️⃣ Verificando histórico final...');
    const historyItemsFinal = await page.locator('#questionsHistory .question-block');
    const countFinal = await historyItemsFinal.count();
    console.log(`   - Histórico final: ${countFinal} pergunta(s)`);
    expect(countFinal).toBe(1);
    console.log('   ✅ Apenas 1 pergunta no histórico (a nova)');

    // 7. Validação final
    console.log('7️⃣ Validação final...');
    console.log('   ✅ TESTE PASSOU: Reset funcionando corretamente!');
    console.log('   ✅ Perguntas antigas não reapareceram');
  });
});
