# Análise de Bugs na Refatoração

## 🔴 Problemas Identificados

### 1. **Modo Mock Quebrado**
- **Causa**: A função `startMockInterview()` não estava emitindo callbacks para atualizar o mock badge
- **Status**: `emitUIChange()` não está sendo disparado
- **Solução**: Adicionar `emitUIChange('onMockBadgeUpdate', { visible: true })` quando mock inicia

### 2. **Nível de Volume (Input/Output)**
- **Causa**: Os callbacks `onInputVolumeUpdate` e `onOutputVolumeUpdate` não estão sendo emitidos quando o volume muda
- **Status**: Monitores estão rodando mas não disparam eventos
- **Solução**: Chamar `emitUIChange('onInputVolumeUpdate', { percent: 0-100 })` em `stopInputMonitor()` e similar para output

### 3. **Atalhos Globais (Ctrl+D, Ctrl+Enter)**
- **Causa**: Os handlers IPC `CMD_TOGGLE_AUDIO` e `CMD_ASK_GPT` não estão registrados no renderer
- **Status**: Faltam `onToggleAudio()` e `onAskGpt()` no RendererAPI
- **Solução**: config-manager precisa registrar os listeners IPC que já existem

### 4. **Salvamento de API Key**
- **Causa**: Fluxo não está sincronizado entre config-manager e main.js
- **Status**: `SAVE_API_KEY` IPC handler pode não estar recebendo/processando corretamente
- **Solução**: Verificar se main.js tem `ipcMain.handle('SAVE_API_KEY', ...)`

### 5. **Visibilidade de API Key**
- **Causa**: Toggle show/hide está tentando acessar chave mascarada
- **Status**: Botão tenta reverter `••••` mas a chave real está em secure store
- **Solução**: Implementar GET_API_KEY corretamente no main.js

---

## 📋 Checklist de Correções

### Renderer.js
- [ ] Adicionar emissão de callback quando volume muda (input/output)
- [ ] Adicionar emissão de callback quando mock badge atualiza
- [ ] Verificar se `onUIChange` está sendo registrado corretamente

### Config-manager.js
- [ ] Garantir que registerIPCListeners() está registrando todos os listeners
- [ ] Verificar se é necessário registrar keyboard shortcuts
- [ ] Validar interação com main.js para API keys

### Main.js
- [ ] Verificar `ipcMain.handle('SAVE_API_KEY', ...)` 
- [ ] Verificar `ipcMain.handle('GET_API_KEY', ...)`
- [ ] Verificar `ipcMain.handle('DELETE_API_KEY', ...)`
- [ ] Validar secure store initialization

---

## 🔍 Detalhes Técnicos

### Como o sistema deveria funcionar:

1. **Mock Mode**:
   - config-manager escuta `mockToggle.change`
   - Chama `window.RendererAPI.setAppConfig({ MODE_DEBUG: true })`
   - Chama `window.RendererAPI.startMockInterview()`
   - renderer emite `onMockBadgeUpdate` 
   - config-manager renderiza badge

2. **Volume**:
   - `stopInputMonitor()` detecta fim de fala
   - Emite `onInputVolumeUpdate` com percentual
   - config-manager atualiza `.style.width` da barra

3. **Atalhos**:
   - main.js globalShortcut registra Ctrl+D, Ctrl+Enter
   - main.js envia `ipcRenderer.send('CMD_TOGGLE_AUDIO')`
   - renderer.js registra listener via `onToggleAudio(callback)`
   - callback chama `listenToggleBtn()`

4. **API Key**:
   - config-manager envia chave via `ipcRenderer.invoke('SAVE_API_KEY', {...})`
   - main.js recebe, valida, salva em secure store
   - Responde com `{ success: true }`
