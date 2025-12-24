# 🧪 Guia de Teste Manual - Funcionalidades Corrigidas

## 📋 Checklist Completo

Use este guia para validar que cada funcionalidade está funcionando após as correções.

---

## 1. 🧪 MODO MOCK

### Como testar:
1. Abrir aplicação
2. Ir para menu lateral → "Outros" (aba mais à direita)
3. Procurar por checkbox "🧪 Modo Mock"
4. ✅ **Esperado**: Badge "🧪 MODO MOCK ATIVADO!!!" aparece no topo

### Validar com DevTools:
```javascript
// No console do DevTools (F12):
console.log(APP_CONFIG.MODE_DEBUG);  // deve ser true
console.log(mockInterviewRunning);   // deve ser true
```

### Fluxo completo:
- [ ] Badge aparece
- [ ] Perguntas mock aparecem sequencialmente
- [ ] Respostas mock aparecem em tempo real
- [ ] Ao desativar, badge desaparece e áudio volta ao normal

---

## 2. 📊 NÍVEL DE VOLUME (Input/Output)

### Como testar:
1. Ir para "Áudio e Tela"
2. Selecionar dispositivos de entrada e saída
3. Clicar "Start"
4. Falar perto do microfone (input)
5. Reproduzir áudio no sistema (output)

### Validar visualmente:
- [ ] Barra de input (`#micVu`) se move quando fala
- [ ] Barra de output (`#outVu`) se move quando há som
- [ ] Barras movem suavemente em tempo real

### Validar com DevTools:
```javascript
// Input deve estar sendo emitido
console.log("Se ver logs 'onInputVolumeUpdate', volume está funcionando");

// Verificar percentual
// Deve estar entre 0-100
```

### Debug:
- Se barras não se mexem, verificar:
  - [ ] Dispositivo selecionado está correto?
  - [ ] Microfone/speaker estão ligados?
  - [ ] Há áudio realmente sendo gravado?

---

## 3. ⌨️ ATALHOS GLOBAIS (Ctrl+D, Ctrl+Enter)

### Teste 1: Ctrl+D (Toggle Listen)

1. Clicar "Start" manualmente (botão fica verde)
2. Pressionar **Ctrl+D** globalmente
3. ✅ **Esperado**: Botão muda para "Stop" (ou vice-versa)

**Validar**:
- [ ] Atalho funciona mesmo com app em background
- [ ] Status muda de "ouvindo" para "parado"
- [ ] Logs aparecem no console

### Teste 2: Ctrl+Enter (Ask GPT)

1. Falar uma pergunta (ou inserir via Modo Mock)
2. Pergunta fica no campo "Pergunta Atual"
3. Pressionar **Ctrl+Enter** globalmente
4. ✅ **Esperado**: Pergunta é enviada ao GPT

**Validar**:
- [ ] Atalho funciona mesmo com app em background
- [ ] Pergunta muda status (enviada)
- [ ] Resposta começa a aparecer

### Debug:
```javascript
// Verificar se listeners estão registrados
window.RendererAPI.onToggleAudio(() => {
    console.log("✅ Ctrl+D está ouvindo");
});

window.RendererAPI.onAskGpt(() => {
    console.log("✅ Ctrl+Enter está ouvindo");
});
```

---

## 4. 💾 SALVAMENTO DE API KEY

### Como testar:

1. Ir para menu lateral → "API e Modelos" → "OpenAI"
2. Verificar campo "Chave da API"
3. **Se já tem chave**:
   - [ ] Campo mostra `••••••••••••••••••••••••••` (mascarado)
   - [ ] Placeholder diz "API key configurada"

4. **Se não tem chave**:
   - [ ] Campo vazio
   - [ ] Placeholder diz "Insira sua API key"

### Salvar nova chave:

1. Clicar no campo de API key
2. Inserir chave OpenAI válida (sk-proj-...)
3. Clicar "Salvar"
4. ✅ **Esperado**:
   - [ ] Feedback "Configurações salvas com sucesso"
   - [ ] Campo volta a mostrar `••••••••••••••••••••`
   - [ ] Status muda para "API key configurada"

### Validar com DevTools:

```javascript
// Verificar se está no secure store
await ipcRenderer.invoke('GET_API_KEY', 'openai')
    .then(key => console.log('Chave salva:', key ? '✅ SIM' : '❌ NÃO'))
```

### Debug:
- Se não conseguir salvar:
  - [ ] Chave tem menos de 10 caracteres?
  - [ ] electron-store está instalado? (`npm list electron-store`)
  - [ ] Ver logs do main.js para erro de acesso ao secure store

---

## 5. 👁️ VISIBILIDADE DE API KEY

### Como testar:

1. Ir para "API e Modelos" → "OpenAI"
2. Se tem chave salva, há um botão com ícone de olho próximo ao campo
3. Clicar no botão de olho

### Teste 1: Show (Mostrar chave)
- [ ] Ícone muda de "visibility" para "visibility_off"
- [ ] Campo mostra chave real em texto legível
- [ ] Aviso de segurança (opcional): não deve permitir copy

### Teste 2: Hide (Ocultar chave)
- [ ] Clicar olho novamente
- [ ] Ícone volta para "visibility"
- [ ] Campo volta a mostrar `••••••••••••••••••••••••••`

### Teste 3: Segurança

1. Tentar copiar enquanto chave está mascarada:
   - [ ] Cópia bloqueada
   - [ ] Mensagem de erro: "Não é possível copiar API key mascarada"

2. Com chave visível:
   - [ ] Cópia permitida
   - [ ] Chave real copiada para clipboard

### Debug:
```javascript
// Verificar se botão está funcionando
const visibilityBtn = document.querySelector('.btn-toggle-visibility');
console.log(visibilityBtn);  // deve existir
```

---

## 📊 Tabela de Status

Preencha esta tabela enquanto testa:

| Funcionalidade | Esperado | Real | Status |
|---|---|---|---|
| Mock Badge aparece | ✅ | ? | ❓ |
| Mock pergunta simula | ✅ | ? | ❓ |
| Volume input se move | ✅ | ? | ❓ |
| Volume output se move | ✅ | ? | ❓ |
| Ctrl+D funciona | ✅ | ? | ❓ |
| Ctrl+Enter funciona | ✅ | ? | ❓ |
| API Key salva | ✅ | ? | ❓ |
| API Key mascarada | ✅ | ? | ❓ |
| Botão olho mostra | ✅ | ? | ❓ |
| Botão olho esconde | ✅ | ? | ❓ |
| Copy bloqueado | ✅ | ? | ❓ |

---

## 🐛 Se algo não funcionar

### 1. Verificar console (F12)
- Há erros JavaScript?
- Há warnings sobre undefined?

### 2. Verificar logs do main.js
```bash
# Terminal onde npm start foi executado
# Deve mostrar logs tipo:
# 🔑 GET_API_KEY openai
# ✅ Chave carregada
```

### 3. Verificar DevTools do Electron
```
Renderer Process → Console
Main Process → Console (Se disponível)
```

### 4. Limpar state se tudo falhar
```javascript
// No console renderer:
localStorage.clear();
sessionStorage.clear();
// Recarregar: Ctrl+R ou F5
```

---

## ✅ Conclusão

Se todos os testes acima passarem com ✅, a refatoração está **100% funcional**!

**Total de testes**: ~25 items
**Critério de sucesso**: 100% dos testes com ✅

