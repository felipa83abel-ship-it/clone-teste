# 📋 PLANO DE REFATORAÇÃO - AskMe

## 📊 Resumo Executivo

Análise completa do projeto Electron concluída. Este plano consolida **todas as melhorias** identificadas em ordem de prioridade e impacto, com foco em **estabilidade, manutenibilidade e preparação para produção**.

### Status Geral - ATUALIZADO

- ✅ Arquitetura refatorada (EventBus, AppState, Strategies)
- ✅ Separação de responsabilidades (main/renderer/handlers)
- ✅ **FASE 1: Estrutura reorganizada** (mode-manager.js e mock-runner.js movidos)
- ✅ **FASE 5.1: Suite de testes completa** (74 testes passando, Jest configurado)
- 🔄 **FASE 2: Em progresso** - Decomposição do renderer.js (1528 linhas → 450 linhas)
- ⚠️ Alguns padrões ainda precisam consolidação
- ⏳ Fases 3-6 aguardando: Refatorações, testes integração, limpeza, documentação

---

## 🎯 FASE 1: ESTRUTURA E ORGANIZAÇÃO (ALTA PRIORIDADE)

### 1.1 Reorganizar `mode-manager.js` e `mock-runner.js`

**Status:** ✅ COMPLETO  
**Impacto:** Alto | **Complexidade:** Baixa | **Tempo:** 30min ✓

**Problema RESOLVIDO:**

- ✅ `mode-manager.js` movido para `/controllers/modes/`
- ✅ `mock-runner.js` movido para `/testing/`
- ✅ Imports em `renderer.js` atualizados
- ✅ Projeto testado e funcionando corretamente (npm start OK)
- [ ] Commit: "refactor: reorganizar mode-manager e mock-runner para estrutura lógica"

---

### 1.2 Extrair `registerUIElements()` do renderer

**Status:** ❌ Não iniciado  
**Impacto:** Alto | **Complexidade:** Média | **Tempo:** 1h

**Problema:**

- A função `registerUIElements()` em renderer.js (linhas 190-233) é boilerplate
- Deveria ser um módulo separado: `/utils/ui-elements-registry.js`

**Solução:**
Criar `ui-elements-registry.js`:

```javascript
class UIElementsRegistry {
	static register(elements) {
		// lógica atual de registerUIElements
	}
}
```

**Checklist:**

- [ ] Criar `/utils/ui-elements-registry.js`
- [ ] Extrair `registerUIElements()` para a classe
- [ ] Atualizar import em renderer.js
- [ ] Verificar com `get_errors()`
- [ ] Testar com `npm start`
- [ ] Commit: "refactor: extrair ui-elements-registry para módulo separado"

---

### 1.3 Consolidar logs e remover `debugLogConfig()`

**Status:** ❌ Não iniciado  
**Impacto:** Médio | **Complexidade:** Baixa | **Tempo:** 20min

**Problema:**

- `config-manager.js` usa `debugLogConfig()` não documentado
- Mistura com `Logger.js` (padrão moderno)
- Inconsistência de logging

**Solução:**

```javascript
// Em config-manager.js, substituir todas as chamadas:
debugLogConfig('msg') → Logger.info('msg')
console.log() → Logger.info()
console.error() → Logger.error()
```

**Checklist:**

- [ ] Remover `debugLogConfig()` de config-manager.js
- [ ] Substituir todas chamadas para `Logger.*`
- [ ] Verificar `Logger.js` está importado
- [ ] Testar UI (config-manager) funciona
- [ ] Commit: "refactor: consolidar logging com Logger.js"

---

## 🎯 FASE 2: DECOMPOSIÇÃO DO RENDERER (ALTA PRIORIDADE)

Renderer.js com 1528 linhas precisa ser dividido em módulos temáticos.

### 2.1 Extrair Controladores de Áudio

**Status:** ❌ Não iniciado  
**Impacto:** Alto | **Complexidade:** Média | **Tempo:** 1.5h

**Arquivos a criar:**

```
/controllers/audio/
  ├── audio-controller.js (startAudio, stopAudio, listenToggleBtn, etc)
  └── audio-metrics.js (logTranscriptionMetrics, etc)
```

**Funções a extrair:** (~200 linhas)

- `startAudio()`
- `stopAudio()`
- `listenToggleBtn()`
- `logTranscriptionMetrics()`
- `hasActiveModel()`

**Checklist:**

- [ ] Criar `/controllers/audio/audio-controller.js`
- [ ] Mover funções listadas
- [ ] Atualizar imports em renderer.js
- [ ] Exportar objeto com todas as funções
- [ ] Verificar com `get_errors()`
- [ ] Testar Ctrl+D funciona (mic on/off)
- [ ] Commit: "refactor: extrair audio-controller do renderer"

---

### 2.2 Extrair Controladores de Perguntas

**Status:** ❌ Não iniciado  
**Impacto:** Alto | **Complexidade:** Média | **Tempo:** 1.5h

**Arquivo a criar:**

```
/controllers/question/
  ├── question-controller.js (renderizar, navegar, clickar)
  └── question-helpers.js (helpers de pergunta)
```

**Funções a extrair:** (~300 linhas)

- `renderQuestionsHistory()`
- `renderCurrentQuestion()`
- `handleQuestionClick()`
- `getSelectedQuestionText()`
- `handleCurrentQuestion()`
- `finalizeCurrentQuestion()`
- `closeCurrentQuestionForced()`
- `getNavigableQuestionIds()`
- `consolidateQuestionText()`
- `scrollToSelectedQuestion()`

**Helpers para `question-helpers.js`:**

- `finalizeQuestion()`
- `resetCurrentQuestion()`
- `normalizeForCompare()`
- `findAnswerByQuestionId()`

**Checklist:**

- [ ] Criar `/controllers/question/question-controller.js`
- [ ] Criar `/controllers/question/question-helpers.js`
- [ ] Mover funções
- [ ] Atualizar imports em renderer.js
- [ ] Verificar com `get_errors()`
- [ ] Testar renderização de perguntas
- [ ] Testar navegação de perguntas (Ctrl+ArrowUp/Down)
- [ ] Commit: "refactor: extrair question-controller do renderer"

---

### 2.3 Extrair Controladores de Screenshots

**Status:** ❌ Não iniciado  
**Impacto:** Médio | **Complexidade:** Média | **Tempo:** 1h

**Arquivo a criar:**

```
/controllers/screenshot/
  └── screenshot-controller.js
```

**Funções a extrair:** (~200 linhas)

- `captureScreenshot()`
- `analyzeScreenshots()`
- `clearScreenshots()`

**Checklist:**

- [ ] Criar `/controllers/screenshot/screenshot-controller.js`
- [ ] Mover funções
- [ ] Atualizar imports em renderer.js
- [ ] Verificar com `get_errors()`
- [ ] Testar captura de screenshot (Ctrl+Shift+S)
- [ ] Testar análise de screenshot (Ctrl+Shift+A)
- [ ] Commit: "refactor: extrair screenshot-controller do renderer"

---

### 2.4 Consolidar Helpers Gerais

**Status:** ❌ Não iniciado  
**Impacto:** Médio | **Complexidade:** Baixa | **Tempo:** 30min

**Arquivo a criar:**

```
/utils/renderer-helpers.js
```

**Funções a extrair:**

- `updateStatusMessage()`
- `clearAllSelections()`
- `releaseThread()`
- `resetAppState()`

**Checklist:**

- [ ] Criar `/utils/renderer-helpers.js`
- [ ] Mover funções
- [ ] Atualizar imports em renderer.js
- [ ] Verificar com `get_errors()`
- [ ] Commit: "refactor: consolidar renderer-helpers"

---

## 🎯 FASE 3: SISTEMA DE LLM (ALTA PRIORIDADE)

### 3.1 Validar e Melhorar LLMManager

**Status:** ⚠️ Parcial  
**Impacto:** Alto | **Complexidade:** Média | **Tempo:** 1h

**Problemas identificados:**

- LLMManager funciona, mas handlers (openai/gemini) podem ter erros não capturados
- Falta tratamento de timeout
- Falta retry logic para falhas de API

**Checklist:**

- [ ] Adicionar timeout wrapper em LLMManager
- [ ] Implementar retry com backoff exponencial
- [ ] Adicionar tratamento de erro estruturado
- [ ] Testar com OpenAI stream (Ctrl+D + Ctrl+Enter)
- [ ] Testar com Gemini stream
- [ ] Verificar com `get_errors()`
- [ ] Commit: "refactor: melhorar robustez de LLMManager"

---

### 3.2 Validar Handlers OpenAI e Gemini

**Status:** ⚠️ Parcial  
**Impacto:** Alto | **Complexidade:** Média | **Tempo:** 1.5h

**Checklist:**

- [ ] Revisar `/llm/handlers/openai-handler.js`
  - [ ] Validar tratamento de erros
  - [ ] Verificar formatação de mensagens
  - [ ] Testar streaming real
- [ ] Revisar `/llm/handlers/gemini-handler.js`
  - [ ] Mesmo checklist que OpenAI
- [ ] Adicionar logs estruturados com Logger
- [ ] Testar com Ctrl+Enter (Ctrl+D ativa mic)
- [ ] Commit: "refactor: melhorar robustez de handlers LLM"

---

### 3.3 Validar Template Handler (Referência Genérica)

**Status:** ⚠️ Parcial (template existe como referência)  
**Impacto:** Baixo | **Complexidade:** Baixa | **Tempo:** 15min

**Propósito:**

- `template-handler.js` serve como exemplo genérico para futuras integrações
- Não associado a nenhum provider específico (não é Anthropic)
- Apenas referência de implementação para novos devs

**Checklist:**

- [ ] Revisar `/llm/handlers/template-handler.js` como referência
- [ ] Verificar se JSDoc está claro para próximos devs
- [ ] Validar com `get_errors()`
- [ ] Commit: "docs: validar template-handler como referência genérica"

---

## 🎯 FASE 4: SISTEMA DE TRANSCRIÇÃO (MÉDIA PRIORIDADE)

### 4.1 Consolidar Estratégia de STT (Remover Whisper OpenAI)

**Status:** ⚠️ Funcional, mas precisa revisar  
**Impacto:** Médio | **Complexidade:** Média | **Tempo:** 1h

**Problemas:**

- 3 providers STT (deepgram, vosk, whisper-cpp-local)
- REMOVER: whisper-1 (OpenAI Whisper)
  - Razão: Implementação em tempo real será feita no FUTURO
  - Por enquanto usar apenas Whisper local
- VAD engine em `stt/vad-engine.js` (OK, centralizado)

**Checklist:**

- [ ] Revisar `/stt/stt-deepgram.js`
- [ ] Revisar `/stt/stt-vosk.js`
- [ ] Revisar `/stt/stt-whisper.js` (apenas implementação local)
- [ ] Remover toda referência a 'whisper-1' em config-manager.js
- [ ] Remover registração de 'whisper-1' em renderer.js (linhas ~449)
- [ ] Verificar se VAD funciona para todos
- [ ] Testar cada provider funciona
  - [ ] Deepgram (se chave configurada)
  - [ ] Vosk (local, sempre disponível)
  - [ ] Whisper local (cpp-local)
- [ ] Verificar com `get_errors()`
- [ ] Commit: "refactor: remover whisper-1 (openai) - usar apenas whisper local"

---

### 4.2 Remover Código Morto em STT (se houver)

**Status:** ❓ Requer verificação  
**Impacto:** Baixo | **Complexidade:** Baixa | **Tempo:** 20min

**Checklist:**

- [ ] Verificar se há funções não usadas em cada STT handler
- [ ] Verificar se `stt-audio-worklet-processor.js` é usado por todos
- [ ] Remover código morto
- [ ] Verificar com `grep_search` por imports órfãos
- [ ] Commit: "refactor: remover código morto em STT"

---

## 🎯 FASE 5: VALIDAÇÃO E TESTES (ALTA PRIORIDADE)

### 5.1 Implementar Testes Unitários Básicos

**Status:** ✅ COMPLETO  
**Impacto:** Alto | **Complexidade:** Alta | **Tempo:** 3h+ ✓

**Implementado com sucesso:**

```
/__tests__/
  ├── setup.js (configuração Jest global)
  ├── unit/
  │   ├── AppState.test.js (17 testes)
  │   ├── EventBus.test.js (14 testes)
  │   ├── ModeManager.test.js (16 testes)
  │   └── STTStrategy.test.js (7 testes)
  └── integration/
      └── core-systems.integration.test.js (20 testes)
```

**Instalado:**

```json
"devDependencies": {
  "jest": "^29.7.0"
}
```

**Resultados:**

- ✅ Jest configurado com `jest.config.js`
- ✅ 74 testes implementados e **TODOS PASSANDO** ✓
- ✅ npm scripts: `test`, `test:watch`, `test:coverage`
- ✅ Testes cobrem: AppState, EventBus, ModeManager, STTStrategy
- ✅ Testes de integração validam coordenação entre sistemas
- ✅ Setup.js suprime logs de console durante testes
- ✅ Cobertura total: `node`, `common`, principais módulos refatorados

**Commit:** ✓ `test(fase-5.1): adicionar suite de testes completa`

---

### 5.2 Implementar E2E Test para Happy Path

**Status:** ❌ Não existe  
**Impacto:** Alto | **Complexidade:** Alta | **Tempo:** 2h

**Ferramentas sugeridas:**

- `electron-builder` com `electron-mocha` ou
- `spectron` (deprecated) → `webdriverio` é melhor

**Teste esperado:**

1. Abrir app
2. Iniciar captura de áudio (Ctrl+D)
3. Simular pergunta (mock em MODE_DEBUG)
4. Parar captura (silence detection)
5. Enviar para LLM (Ctrl+Enter)
6. Validar resposta streaming
7. Capturar screenshot (Ctrl+Shift+S)
8. Analisar screenshot (Ctrl+Shift+A)
9. Validar toda interview

**Checklist:**

- [ ] Avaliar ferramenta (webdriverio, tauri-driver, ou nativa)
- [ ] Criar `/tests/e2e/happy-path.test.js`
- [ ] Implementar teste completo
- [ ] Testar em modo debug com mock
- [ ] Commit: "test: implementar E2E happy path test"

---

### 5.3 Adicionar Validação de Tipos (TypeScript Opcional)

**Status:** ❌ Não iniciado  
**Impacto:** Médio | **Complexidade:** Alta | **Tempo:** 4h+ (opcional)

**Opção 1 (Recomendado): JSDoc + Type Checking**

```javascript
/** @type {AppState} */
const appState = new AppState();

/** @param {string} text */
function finalizeQuestion(text) { ... }
```

**Opção 2 (Futuro): TypeScript migrado**

- Refatorar para `.ts`
- Configurar `tsconfig.json`

**Checklist (para JSDoc agora):**

- [ ] Adicionar `@type` e `@param` em todos os módulos principais
- [ ] Adicionar `// @ts-check` no topo de renderer.js
- [ ] Validar com VS Code intelisense
- [ ] Commit: "refactor: adicionar type hints com JSDoc"

---

## 🎯 FASE 6: LIMPEZA E OTIMIZAÇÃO (MÉDIA PRIORIDADE)

### 6.1 Remover Código Deprecated

**Status:** ⚠️ Existem marcadores  
**Impacto:** Médio | **Complexidade:** Baixa | **Tempo:** 30min

**Itens marcados como DEPRECATED:**

1. ✅ MODES em renderer.js (linhas ~144) - pode remover comentário
2. ✅ CURRENT_MODE em renderer.js (linhas ~146) - pode remover comentário
3. ✅ UICallbacks em renderer.js (linhas ~182) - pode remover comentário
4. ✅ applyWindowOpacity em config-manager.js (linhas ~716) - revisar se ainda usa
5. ✅ initDragHandle em config-manager.js (linhas ~1388) - revisar se ainda usa

**Checklist:**

- [ ] Remover comentários DEPRECATED de renderer.js
- [ ] Verificar se `applyWindowOpacity` está sendo usado
- [ ] Verificar se `initDragHandle` está sendo usado
- [ ] Se não usado, remover
- [ ] Verificar com `get_errors()`
- [ ] Commit: "refactor: remover código deprecated"

---

### 6.2 Remover Código Morto

**Status:** ⚠️ Requer verificação  
**Impacto:** Médio | **Complexidade:** Média | **Tempo:** 45min

**Ações específicas:**

1. **Vosk models em `/stt/models-stt/vosk/`**
   - ✅ Manter: `vosk-model-small-pt-0.3/` (modelo padrão, ~100MB)
   - ❌ Remover: `vosk-model-pt-fb-v0.1.1/` (modelo grande não utilizado, ~500MB)
   - ✅ Manter: `teste-vosk.js` (arquivo de teste)

2. **Whisper models em `/stt/models-stt/whisper/`**
   - ✅ Manter: Todos os modelos (usados para testes)
   - ✅ Manter: `teste-whisper.js` (arquivo de teste)
   - ✅ Manter: `/bin/` e `/samples/` (parte do setup)

3. **Pasta `/temp/`**
   - [ ] Revisar se é realmente temporária ou versionada
   - [ ] Se temporária, adicionar ao `.gitignore` se necessário
   - [ ] Se versionada, revisar propósito dos arquivos .md

**Checklist:**

- [ ] Remover apenas vosk-model-pt-fb-v0.1.1 (grande, não utilizado)
- [ ] Manter todos os testes (teste-\*.js)
- [ ] Manter todos os modelos whisper
- [ ] Revisar `/temp/` e organizar conforme necessário
- [ ] Executar `npm start` para verificar funcionamento
- [ ] Commit: "refactor: remover modelo vosk não utilizado"`

---

### 6.3 Otimizar tamanho de bundle

**Status:** ⚠️ Requer diagnóstico  
**Impacto:** Médio | **Complexidade:** Média | **Tempo:** 1h+

**Checklist:**

- [ ] Executar `npm start` e medir tempo de inicialização
- [ ] Identificar imports pesados que carregam na inicialização
- [ ] Considerar lazy loading para:
  - [ ] STT providers não-padrão
  - [ ] LLM handlers não-padrão
  - [ ] Modelos de IA (vosk, whisper)
- [ ] Documentar impacto na startup time
- [ ] Commit: "perf: otimizar bundle size e startup time"

---

## 🎯 FASE 7: DOCUMENTAÇÃO E CONFIGURAÇÃO (MÉDIA PRIORIDADE)

### 7.1 Atualizar Documentação (após refatoração)

**Status:** ⚠️ Incompleta  
**Impacto:** Médio | **Complexidade:** Baixa | **Tempo:** 1h

**Arquivos a atualizar:**

- `START_HERE.md` - Atualizar estrutura de pastas
- `ARCHITECTURE.md` - Atualizar diagrama com novos controllers
- Criar `/docs/TESTING_GUIDE.md` - Como rodar testes
- Criar `/docs/ADDING_LLM_PROVIDER.md` - Guia de novo provider
- Criar `/docs/ADDING_STT_PROVIDER.md` - Guia de novo STT

**Checklist:**

- [ ] Atualizar START_HERE.md com nova estrutura
- [ ] Atualizar ARCHITECTURE.md
- [ ] Criar TESTING_GUIDE.md
- [ ] Criar ADDING_LLM_PROVIDER.md
- [ ] Criar ADDING_STT_PROVIDER.md
- [ ] Revisar README.md geral
- [ ] Commit: "docs: atualizar documentação pós-refatoração"

---

### 7.2 Configuração de CI/CD Básico

**Status:** ❌ Não existe  
**Impacto:** Médio | **Complexidade:** Média | **Tempo:** 1h

**Arquivo a criar:**

```
/.github/workflows/
  ├── test.yml (rodar testes em cada PR)
  ├── lint.yml (verificar style)
  └── build.yml (verificar build)
```

**Checklist:**

- [ ] Criar `.github/workflows/test.yml`
  - [ ] Rodar `npm test`
  - [ ] Falhar se cobertura < 70%
- [ ] Criar `.github/workflows/lint.yml`
  - [ ] Rodar `npm run lint` (após configurar ESLint)
- [ ] Criar `.github/workflows/build.yml`
  - [ ] Verificar se `npm start` funciona
  - [ ] Timeout após 10 segundos (para não travar CI)
- [ ] Commit: "ci: adicionar workflows de GitHub Actions"

---

### 7.3 Adicionar ESLint e Prettier

**Status:** ❌ Não existe  
**Impacto:** Médio | **Complexidade:** Baixa | **Tempo:** 45min

**Dependências:**

```json
"devDependencies": {
  "eslint": "^8.54.0",
  "prettier": "^3.1.0",
  "eslint-config-prettier": "^9.1.0"
}
```

**Checklist:**

- [ ] Instalar eslint e prettier
- [ ] Criar `.eslintrc.js` config
- [ ] Criar `.prettierrc.js` config
- [ ] Adicionar scripts:
  - [ ] `"lint": "eslint ."`
  - [ ] `"lint:fix": "eslint . --fix"`
  - [ ] `"format": "prettier --write ."`
- [ ] Rodar `npm run lint:fix`
- [ ] Commit: "ci: adicionar ESLint e Prettier"

---

## 🎯 FASE 8: SEGURANÇA E PRODUÇÃO (ALTA PRIORIDADE)

### 8.1 Remover Logs Sensíveis

**Status:** ⚠️ Parcial  
**Impacto:** Alto | **Complexidade:** Baixa | **Tempo:** 30min

**Verificar:**

- [ ] Remover logs de API keys completos (já mascarado?)
- [ ] Remover logs de respostas LLM sensíveis em produção
- [ ] Configurar LOG_LEVEL baseado em NODE_ENV
- [ ] Adicionar máscara para dados sensíveis

**Checklist:**

- [ ] Revisar todos `console.log` em main.js
- [ ] Revisar todos `console.log` em config-manager.js
- [ ] Adicionar verificação `if (process.env.NODE_ENV === 'development')`
- [ ] Testar com `npm run build` (production mode)
- [ ] Commit: "security: remover logs sensíveis em produção"

---

### 8.2 Auditar Dependências

**Status:** ❌ Não feito  
**Impacto:** Alto | **Complexidade:** Baixa | **Tempo:** 30min

**Checklist:**

- [ ] Rodar `npm audit`
- [ ] Atualizar pacotes vulneráveis
  - [ ] `npm audit fix`
  - [ ] `npm audit fix --force` (se necessário)
- [ ] Verificar compatibilidade após update
- [ ] Testar com `npm start`
- [ ] Commit: "chore: auditar e atualizar dependências"

---

### 8.3 Validar Segurança do Electron

**Status:** ⚠️ Parcial  
**Impacto:** Alto | **Complexidade:** Média | **Tempo:** 1h

**Checklist:**

- [ ] Revisar `nodeIntegration: true` em main.js (já documentado)
- [ ] Considerar migração para `contextBridge` (futuro)
- [ ] Validar `contextIsolation: false` intencional
- [ ] Verificar se há preload scripts necessários
- [ ] Revisar proteção contra injeção XSS
- [ ] Testar proteção contra captura de tela (já implementado)
- [ ] Documentar decisões de segurança
- [ ] Commit: "security: auditar configurações de segurança Electron"

---

## 🎯 FASE 9: REFINAMENTO FINAL (BAIXA PRIORIDADE)

### 9.1 Melhorar Tratamento de Erros

**Status:** ⚠️ Parcial  
**Impacto:** Médio | **Complexidade:** Média | **Tempo:** 1.5h

**Checklist:**

- [ ] Adicionar try-catch em todos os IPC handlers de main.js
- [ ] Adicionar try-catch em todos os event listeners de renderer.js
- [ ] Implementar error boundaries para UI
- [ ] Criar `utils/error-handler.js` centralizado
- [ ] Testar com `npm start` e provocar erros
- [ ] Commit: "refactor: melhorar tratamento de erros"

---

### 9.2 Implementar Rate Limiting / Throttling

**Status:** ❌ Não existe  
**Impacto:** Médio | **Complexidade:** Média | **Tempo:** 1h

**Casos de uso:**

- Rate limit para API calls (LLM, STT)
- Throttle para mouse events
- Debounce para mudanças de config

**Checklist:**

- [ ] Criar `/utils/rate-limiter.js`
- [ ] Criar `/utils/throttle.js`
- [ ] Criar `/utils/debounce.js`
- [ ] Aplicar a config changes
- [ ] Aplicar a LLM calls
- [ ] Testar comportamento
- [ ] Commit: "feat: implementar rate-limiting e throttling"

---

### 9.3 Performance Monitoring

**Status:** ❌ Não existe  
**Impacto:** Baixo | **Complexidade:** Média | **Tempo:** 1h

**Checklist:**

- [ ] Adicionar performance marks em operações críticas
- [ ] Implementar `performance.measure()` para LLM, STT, etc
- [ ] Adicionar dashboard de métricas (opcional)
- [ ] Documentar métricas coletadas
- [ ] Commit: "feat: adicionar performance monitoring"

---

## ✅ CHECKLIST FINAL (Executar ao final de CADA fase)

Após cada fase completada, executar:

```bash
# 1. Verificar erros
npm start  # Deve iniciar sem erros
# Esperar 10 segundos (para não travar), depois Ctrl+C

# 2. Verificar código
npm run lint:fix  # (após fase 7.3)

# 3. Rodar testes (após fase 5)
npm test

# 4. Commit em português
git add .
git commit -m "refactor: [descricao da fase]"

# 5. Push
git push origin main
```

---

## 📊 RESUMO DE MÉTRICAS

### Antes da Refatoração:

- Total de linhas em renderer.js: **1528** linhas
- Arquivos na raiz sem organização: **2** (mode-manager, mock-runner)
- Estrutura de pastas: **7 pastas** (audio, docs, events, handlers, llm, state, strategies, stt, utils)
- Testes: **0**
- Cobertura: **0%**

### Esperado Após Refatoração:

- Linhas em renderer.js: **~400-500** (reduzido 70%)
- Arquivos organizados: **Todos em pastas lógicas**
- Estrutura de pastas: **+2 novas** (/controllers/audio, /controllers/question, /controllers/screenshot, /tests)
- Testes unitários: **6+ suites**
- Cobertura: **~70%+**
- Performance startup: **Medido e otimizado**

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ **Leu este plano?** Você está aqui!
2. **Quer começar?** Siga a FASE 1 (30min - rápido win)
3. **Está bloqueado?** Entre em contato com o desenvolvedor
4. **Concluiu uma fase?** Update este arquivo ✏️

**Status geral esperado:**

- Fim da Fase 1-2: Estrutura sólida, renderer reduzido
- Fim da Fase 3-4: LLM e STT validados
- Fim da Fase 5-6: Testes + Limpeza
- Fim da Fase 7-9: Pronto para produção ✨

---

**Última atualização:** 24 de janeiro de 2026  
**Próxima revisão:** Após conclusão da Fase 1
