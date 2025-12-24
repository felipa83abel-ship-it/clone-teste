#!/bin/bash

# 🧪 Script de Validação da Arquitetura

echo "=========================================="
echo "🧪 Teste de Validação da Arquitetura"
echo "=========================================="
echo ""

# 1. Verificar sintaxe dos arquivos
echo "1️⃣ Verificando sintaxe JavaScript..."
node -c renderer.js && echo "   ✅ renderer.js" || echo "   ❌ renderer.js"
node -c config-manager.js && echo "   ✅ config-manager.js" || echo "   ❌ config-manager.js"
node -c main.js && echo "   ✅ main.js" || echo "   ❌ main.js"
echo ""

# 2. Verificar que renderer.js NÃO tem document.getElementById
echo "2️⃣ Verificando que renderer.js é 'cego' (sem DOM direto)..."
if grep -c "^const.*= document.getElementById" renderer.js > 0; then
    echo "   ❌ renderer.js ainda tem document.getElementById no escopo global!"
    grep -n "^const.*= document.getElementById" renderer.js | head -5
else
    echo "   ✅ renderer.js não tem getElementById em escopo global"
fi

if grep -c "^const.*= document.querySelector" renderer.js > 0; then
    echo "   ❌ renderer.js ainda tem document.querySelector!"
    grep -n "^const.*= document.querySelector" renderer.js | head -5
else
    echo "   ✅ renderer.js não tem querySelector em escopo global"
fi
echo ""

# 3. Verificar que config-manager.js TEM getElementById
echo "3️⃣ Verificando que config-manager.js É o Controller..."
if grep -c "document.getElementById" config-manager.js > 0; then
    echo "   ✅ config-manager.js tem DOM access"
else
    echo "   ⚠️  config-manager.js não tem querySelector (esperado?)"
fi

if grep -c "addEventListener" config-manager.js > 0; then
    echo "   ✅ config-manager.js tem event listeners"
else
    echo "   ❌ config-manager.js não tem addEventListener"
fi
echo ""

# 4. Verificar que RendererAPI está exposto
echo "4️⃣ Verificando que RendererAPI está exposto globalmente..."
if grep -c "window.RendererAPI = RendererAPI" renderer.js > 0; then
    echo "   ✅ window.RendererAPI exposto"
else
    echo "   ❌ window.RendererAPI não exposto"
fi
echo ""

# 5. Verificar funções críticas
echo "5️⃣ Verificando que funções críticas existem..."
grep -q "registerUIElements:" renderer.js && echo "   ✅ registerUIElements:" || echo "   ❌ registerUIElements:"
grep -q "onUIChange:" renderer.js && echo "   ✅ onUIChange:" || echo "   ❌ onUIChange:"
grep -q "emitUIChange(" renderer.js && echo "   ✅ emitUIChange()" || echo "   ❌ emitUIChange()"
grep -q "function registerUIElements" renderer.js && echo "   ✅ function registerUIElements" || echo "   ❌ function registerUIElements"
echo ""

# 6. Verificar IPC handlers
echo "6️⃣ Verificando IPC handlers no main.js..."
grep -q "ipcMain.handle('SAVE_API_KEY'" main.js && echo "   ✅ SAVE_API_KEY" || echo "   ❌ SAVE_API_KEY"
grep -q "ipcMain.handle('GET_API_KEY'" main.js && echo "   ✅ GET_API_KEY" || echo "   ❌ GET_API_KEY"
grep -q "globalShortcut.register" main.js && echo "   ✅ globalShortcut" || echo "   ❌ globalShortcut"
echo ""

# 7. Verificar callbacks do renderer
echo "7️⃣ Verificando callbacks no renderer.js..."
grep -q "onUIChange('onMockBadgeUpdate'" renderer.js && echo "   ✅ onMockBadgeUpdate" || echo "   ❌ onMockBadgeUpdate"
grep -q "onUIChange('onInputVolumeUpdate'" renderer.js && echo "   ✅ onInputVolumeUpdate" || echo "   ❌ onInputVolumeUpdate"
grep -q "onUIChange('onOutputVolumeUpdate'" renderer.js && echo "   ✅ onOutputVolumeUpdate" || echo "   ❌ onOutputVolumeUpdate"
echo ""

# 8. Verificar que config-manager escuta callbacks
echo "8️⃣ Verificando que config-manager escuta callbacks..."
grep -q "onUIChange('onMockBadgeUpdate'" config-manager.js && echo "   ✅ escuta onMockBadgeUpdate" || echo "   ❌ não escuta onMockBadgeUpdate"
grep -q "onUIChange('onInputVolumeUpdate'" config-manager.js && echo "   ✅ escuta onInputVolumeUpdate" || echo "   ❌ não escuta onInputVolumeUpdate"
echo ""

echo "=========================================="
echo "✅ Validação concluída!"
echo "=========================================="
