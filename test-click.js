// Script de teste para simular clique no botão de escutar
const { ipcRenderer } = require('electron');

// Aguardar um pouco para que a window esteja pronta
setTimeout(() => {
    console.log('🧪 TEST: Simulando clique no botão de escutar...');
    
    const listenBtn = document.getElementById('listenBtn');
    if (listenBtn) {
        console.log('🧪 TEST: Botão encontrado, disparando clique...');
        listenBtn.click();
    } else {
        console.error('🧪 TEST ERROR: Botão não encontrado!');
    }
    
    // Aguardar mais um pouco para ver os logs de erro
    setTimeout(() => {
        console.log('🧪 TEST: Teste completo. Verifique os logs acima.');
    }, 2000);
}, 2000);
