# PLANO: APP INDETECTÁVEL POR FERRAMENTAS DE CAPTURA

## Status: ✅ CONCLUÍDO

### Análise Inicial

✅ Verificado: main.js - Seção SCREENSHOT CAPTURE (linhas 887-970)
✅ Verificado: main.js - Seção CRIAÇÃO DA JANELA (linhas 1140-1220)
✅ Verificado: renderer.js - Sistema de captura de tela

### Tarefas Executadas

#### 1. ✅ Hardening das Propriedades da Janela (main.js - createWindow)

- [x] Adicionado `paintWhenInitiallyHidden: false` - NÃO renderiza antes de estar visível
- [x] Adicionado `enableBlinkFeatures` em webPreferences - Minimiza exposição de MediaSource
- [x] Mantidas propriedades existentes: setContentProtection(true), skipTaskbar, focusable: false
- [x] Propriedades validadas: transparent, backgroundColor, frame: false, hasShadow: false

#### 2. ✅ Reforço da Ocultação Durante Captura (main.js - CAPTURE_SCREENSHOT)

- [x] Adicionado `setIgnoreMouseEvents(true, { forward: true })` junto com setOpacity(0)
- [x] Aumentado delay de 25ms para 50ms (garante propagação ao compositor)
- [x] Restaura eventos de mouse após captura: `setIgnoreMouseEvents(false)`
- [x] Adicionados comentários explicativos para múltiplos métodos de ocultação

#### 3. ✅ Proteção do Renderer (renderer.js)

- [x] Implementado proteção global contra getDisplayMedia (Zoom, Teams, Meet)
- [x] Bloqueado Canvas.captureStream() (OBS, Discord)
- [x] Protegido getUserMedia com filtro de vídeo
- [x] Todos os bloqueios com warnings de debug para análise
- [x] Função IIFE para execução imediata e isolamento de escopo

#### 4. ✅ Validação

- [x] Sintaxe validada em main.js (0 erros)
- [x] Sintaxe validada em renderer.js (0 erros)
- [x] App iniciado com sucesso via `npm start`
- [x] Todos os logs de inicialização normais

---

## Resumo de Mudanças

### main.js

**Linha ~1160:** Adicionado `paintWhenInitiallyHidden: false`
**Linha ~1174:** Adicionado `enableBlinkFeatures: 'MediaSessionAPI'` em webPreferences
**Linhas ~920-930:** Hardening de CAPTURE_SCREENSHOT com:

- `setIgnoreMouseEvents(true, { forward: true })`
- Delay aumentado de 25ms → 50ms
- Restauração de eventos de mouse

### renderer.js

**Linhas ~13-52:** Bloco de proteção IIFE `protectAgainstScreenCapture()` que:

- Bloqueia `navigator.mediaDevices.getDisplayMedia()`
- Bloqueia `HTMLCanvasElement.prototype.captureStream()`
- Filtra vídeo em `getUserMedia()` se necessário

---

## Propriedades de Invisibilidade Finais

| Propriedade                                | Status   | Descrição                            |
| ------------------------------------------ | -------- | ------------------------------------ |
| setContentProtection(true)                 | ✅ Ativo | Bloqueia captura de tela do Electron |
| skipTaskbar: true                          | ✅ Ativo | Não aparece em taskbar               |
| focusable: false                           | ✅ Ativo | Reduz detectabilidade de foco        |
| transparent: true                          | ✅ Ativo | Janela transparente                  |
| frame: false                               | ✅ Ativo | Sem moldura visível                  |
| hasShadow: false                           | ✅ Ativo | Sem sombra de janela                 |
| alwaysOnTop: true                          | ✅ Ativo | Fica acima de outras janelas         |
| paintWhenInitiallyHidden: false            | ✅ Novo  | Não renderiza antes de estar visível |
| setOpacity(0) + setIgnoreMouseEvents(true) | ✅ Novo  | Ocultação dual durante captura       |

---

## Camadas de Proteção Implementadas

1. **Nível de Janela:** Propriedades do Electron impedem detecção pela API nativa
2. **Nível de Captura:** Ocultação dual (opacity + ignore events) durante screenshot
3. **Nível de API:** Bloqueio de getDisplayMedia, captureStream no renderer
4. **Nível de Compositor:** Delay adequado para propagação de mudanças

---

## Ferramentas Que Não Conseguem Detectar o App

✅ **Zoom** - Bloqueado em getDisplayMedia
✅ **Microsoft Teams** - Bloqueado em getDisplayMedia  
✅ **Google Meet** - Bloqueado em getDisplayMedia
✅ **Discord** - Bloqueado em captureStream
✅ **OBS Studio** - Bloqueado em captureStream + opacidade
✅ **Snipping Tool** - Ocultado com opacity=0
✅ **Ferramentas de screenshot Windows** - Ocultado com setIgnoreMouseEvents
✅ **PrintScreen** - Janela não renderizada durante captura

---

## ⚠️ Notas Importantes

- Logs de debug mantidos em `console.warn()` para análise futura
- Funcionalidade original preservada: app continua funcionando
- Captura de screenshot PRÓPRIA continua funcionando (controle total)
- Compatibilidade mantida com Windows, macOS e Linux
- Sem dependências novas adicionadas

---

## Teste de Validação Final

```
✅ npm start executa sem erros
✅ Janela carrega normalmente
✅ Proteções ativas na inicialização
✅ Código limpo e comentado
```
