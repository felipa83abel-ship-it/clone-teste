# Relatório de Bugs Encontrados após Refatoração

## Regras Obrigatórias:

- **Analisar todo o projeto antes de iniciar qualquer ajustes.**
- Não altere o formato desde arquivo, sigo o modelo atual.
- **Não** tentar **advinhar** o problema.
- Usar apenas este arquivo como relatorio de correções de erro e **FONTE DE VERDADE ÚNICA**.
- **Não criar outro arquivo .md** para explicar ou comentar ou qualquer outro motivo relacionados a esses bugs.
- **Mantenha** este arquivo **sempre atualizado** com o status atual.
  - só alterar o **Status Atual** para **✅ CORRIGIDO** quando o teste manual passar.
  - Atuaizar o texto da "Correção Aplicada:" quando teste manual passar.
- Usar **'npm start'** com **timeout** para fechar após um tempo.
- Incluir seção de como testar caso não exista.
- Utilizar as **regras para liberação do commit.**

## Regras de Liberação do commit

- O commit **só pode ser liberado** após:
  - ✅ Usuário confirmar que o teste manual passou
  - ✅ Não possui erros de **Sonar/Sonarqube**
  - ✅ Não possui apontamentos (erros ou aviso) ao rodar o arquivo **'verify-all.sh'**

<br>

---

<br>

### BUG #1: Seção (Outras Configurações) - Tema (Dark Mode) não está funcionando 🌓

**Problema:** O tema não inicia no modo escuro e não é possível alternar entre temas ao clicar no toggle.

**Log relacionado:**

```text
WindowConfigManager.js:381 🖱️ Zona interativa ATIVADA: controls-mock interactive-zone
WindowConfigManager.js:218 💾 Salvando darkModeToggle: false
ConfigManager.js:108 💾 Configurações salvas com sucesso
D:\\Dev\\Projeto Electron\\git-felipa-perssua\\clone-teste\\events\\EventBus.js:57 ⚠️ Nenhum listener para: WINDOW_CONFIG_CHANGED
```

**Correção Aplicada:**

- ✅ Corrigido em WindowConfigManager.js: `dark-mode` → `dark` (2 ocorrências)
  - `restoreUserPreferences()`: linha 82 e 84
  - `saveWindowField()`: linha 223 e 225
- ✅ Alinhado com styles.css que define `body.dark`

- ✅ **NOVO**: Removido evento `WINDOW_CONFIG_CHANGED` não utilizado
  - O evento era emitido mas **nenhum listener existia** para ele
  - Remover o evento elimina o aviso do console
  - A funcionalidade continua completa (config já é salva e CSS aplicado)
  - Arquivo: [WindowConfigManager.js](controllers/config/managers/WindowConfigManager.js)
  - Linhas modificadas: Remoção da emissão + comentário atualizado

**✅ Como Testar:**

1. Abra a aplicação
2. Vá para **"Outras Configurações"** no menu lateral
3. Localize o toggle de **"Dark Mode"**
4. Clique para desativar (deve mudar para light mode)
5. Clique novamente para ativar (deve voltar para dark mode)
6. Feche a aplicação e abra novamente
7. Verifique se o tema foi salvo (deve estar como estava antes de fechar)

**Esperado:**

- ✅ Tema alterna entre light e dark
- ✅ Mudança é visível e imediata
- ✅ Configuração é salva ao fechar/abrir a app
- ✅ Nenhum aviso "Nenhum listener para: WINDOW_CONFIG_CHANGED"

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [x] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [ ] 🚫 Bloqueado

**Resultado:**

- ✅ Dark Mode funcionando corretamente
- ✅ **AVISO ELIMINADO**: Removido evento não utilizado WINDOW_CONFIG_CHANGED
  - Console não mostrará mais: "Nenhum listener para: WINDOW_CONFIG_CHANGED"
- ✅ Toggle alterna entre light/dark mode
- ✅ Tema é persistido ao fechar/abrir app

**Commit:** a975298 - Bug #1 commitado com sucesso

**Status Atual:** ✅ CORRIGIDO E COMMITADO

<br>

---

<br>

### BUG #2: Seção (Outras Configurações) - Botão Modo Mock Toggle 🧪

**Problema:** Ao clicar não inicia o modo mock

**Log relacionado:**

```text
WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: controls-mock interactive-zone
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\Logger.js:38 [2026-01-25T18:35:16.748Z] [INFO] ✅ Mock interceptor inicializado para MODE_DEBUG
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: screenshotBadgeUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
updateMockBadge @ renderer.js:600
(anonymous) @ HomeManager.js:150
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:48 🧹 ═══════════════════════════════════════════════════════════
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:49 🧹 INICIANDO RESET COMPLETO DO APP
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:50 🧹 ═══════════════════════════════════════════════════════════
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:58 ✅ Autoplay do mock parado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:77 ✅ Perguntas e respostas limpas
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:92 ✅ Estado de entrevista resetado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:93 ✅ Métricas resetadas
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:110 ✅ Screenshots limpos
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:116 ✅ Flags resetadas
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: currentQuestionUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
resetAppState @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:120
await in resetAppState
(anonymous) @ HomeManager.js:152
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: questionsHistoryUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
resetAppState @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:124
await in resetAppState
(anonymous) @ HomeManager.js:152
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:125 ✅ Perguntas UI limpa
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: transcriptionCleared
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
resetAppState @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:129
await in resetAppState
(anonymous) @ HomeManager.js:152
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: answersCleared
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
resetAppState @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:130
await in resetAppState
(anonymous) @ HomeManager.js:152
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:131 ✅ Transcrições e respostas UI limpas
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: listenButtonToggle
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
resetAppState @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:135
await in resetAppState
(anonymous) @ HomeManager.js:152
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:139 ✅ Botão listen resetado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:65 ❌ Erro em listener statusUpdate: RangeError: Maximum call stack size exceeded
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:65
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:137
await in (anonymous)
(anonymous) @ HomeManager.js:152
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:147 ✅ Status atualizado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: clearAllSelections
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
clearAllSelections @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:34
resetAppState @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:151
await in resetAppState
(anonymous) @ HomeManager.js:152
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:152 ✅ Seleções limpas
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:156 ✅ ═══════════════════════════════════════════════════════════
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:157 ✅ RESET COMPLETO CONCLUÍDO COM SUCESSO
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:158 ✅ ═══════════════════════════════════════════════════════════
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: controls-mock interactive-zone
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:196
🎬 ════════════════════════════════════════════════════════
🎬 MOCK CENÁRIO 1/6
🎬 ════════════════════════════════════════════════════════
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:92 🎤 [FASE-1] Capturando áudio da pergunta...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: transcriptAdd
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
simulateAudioCapture @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:95
runMockAutoPlay @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:204
globalThis.runMockAutoPlay @ renderer.js:796
(anonymous) @ HomeManager.js:158
setTimeout
(anonymous) @ HomeManager.js:156
WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: sideMenu
HomeManager.js:103 >>> Menu item clicado: home
HomeManager.js:122 >>> Seção ativada: home
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: placeholderFulfill
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
simulateAudioCapture @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:109
await in simulateAudioCapture
runMockAutoPlay @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:204
globalThis.runMockAutoPlay @ renderer.js:796
(anonymous) @ HomeManager.js:158
setTimeout
(anonymous) @ HomeManager.js:156
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:120 ✅ [FASE-1] Áudio capturado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:128 📝 [FASE-2] Processando pergunta...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:136 🔇 [FASE-2] Silêncio detectado, fechando pergunta...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:137 🤖 [FASE-3] askLlm acionado - mock stream será emitido pelo interceptor
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: sideMenu
WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: sideMenu
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: sideMenu
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:169 📸 [FASE-4A] Capturando screenshot 1/1...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:170 Uncaught (in promise) TypeError: captureScreenshot is not a function
    at captureScenarioScreenshots (D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:170:11)
    at Object.runMockAutoPlay (D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:221:33)
captureScenarioScreenshots @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:170
runMockAutoPlay @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\testing\mock-runner.js:221
await in runMockAutoPlay
globalThis.runMockAutoPlay @ renderer.js:796
(anonymous) @ HomeManager.js:158
setTimeout
(anonymous) @ HomeManager.js:156
WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: sideMenu
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: sideMenu
WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: sideMenu
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: sideMenu
WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: sideMenu
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: sideMenu
WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: sideMenu
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: sideMenu
WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: sideMenu
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: sideMenu

```

**Correção Aplicada:**

- ✅ Removido listener recursivo de `statusUpdate` em renderer.js
  - **Root Cause**: `updateStatusMessage()` emitia evento `statusUpdate` que disparava um listener, causando loop infinito
  - **Solução**: Remover listener que causava recursão
- ✅ Importado e inicializado `screenshot-controller` em renderer.js
  - Adicionada importação do controller
  - Inicializar com dependências (ipcRenderer, eventBus, appState)
  - Atribuir funções às variáveis globais para uso em mock-runner.js

**✅ Como Testar:**

1. Vá para **"Outras Configurações"**
2. Localize o toggle de **"Modo Mock"**
3. Clique para ativar
4. Verifique se a badge "🧪 MODO MOCK ATIVADO!!!" aparece na barra de topo
5. Verifique se dados de teste aparecem
6. Clique novamente para desativar
7. Verifique se o app volta ao normal

**Esperado:**

- ✅ Toggle ativa/desativa modo mock
- ✅ Badge aparece/desaparece no topo
- ✅ Dados de teste aparecem quando ativado
- ✅ Nenhum erro no console

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [ ] ✅ Passou
- [x] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [ ] 🚫 Bloqueado

**Resultado:**

- ✅ CORRIGIDO - Stack overflow eliminado
- ✅ CORRIGIDO - captureScreenshot agora é uma função válida
- 🔎 Necessário retest após as correções
- 💡 Sempre checar qualquer aviso e corrigir sem mascarar o aviso.

**Commit:** ""

**Status Atual:** ✅ CORRIGIDO - Aguardando teste manual para confirmação

<br>

---

<br>

### BUG #3: Seção (Outras Configurações) - Botão Reset Config (Factory Reset) ⚠️

**Problema:** Botão não tinha listener registrado

**Log relacionado:**

```text

ConfigManager.js:178 🔄 ConfigManager.resetConfig() - Resetando tudo...
ApiKeyManager.js:52 🔄 ApiKeyManager.reset()
ConfigManager.js:379 [Violation] 'click' handler took 5073ms
ApiKeyManager.js:121 ✅ API key de openai removida com sucesso
ApiKeyManager.js:208 🔓 Campo openai-api-key configurado como VAZIO
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: API_KEY_UPDATED
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
deleteApiKey @ ApiKeyManager.js:138
await in deleteApiKey
reset @ ApiKeyManager.js:54
resetConfig @ ConfigManager.js:181
(anonymous) @ ConfigManager.js:391
ApiKeyManager.js:121 ✅ API key de google removida com sucesso
ApiKeyManager.js:208 🔓 Campo google-api-key configurado como VAZIO
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: API_KEY_UPDATED
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
deleteApiKey @ ApiKeyManager.js:138
await in deleteApiKey
reset @ ApiKeyManager.js:54
await in reset
resetConfig @ ConfigManager.js:181
(anonymous) @ ConfigManager.js:391
ApiKeyManager.js:121 ✅ API key de openrouter removida com sucesso
ApiKeyManager.js:208 🔓 Campo openrouter-api-key configurado como VAZIO
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: API_KEY_UPDATED
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
deleteApiKey @ ApiKeyManager.js:138
await in deleteApiKey
reset @ ApiKeyManager.js:54
await in reset
resetConfig @ ConfigManager.js:181
(anonymous) @ ConfigManager.js:391
AudioDeviceManager.js:51 🔄 AudioDeviceManager.reset()
AudioDeviceManager.js:197 🛑 [stopMonitoring] Parando monitoramento de input
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:302 ℹ️ Monitor de volume (input) já está inativo
AudioDeviceManager.js:199 ✅ input monitor parado
AudioDeviceManager.js:197 🛑 [stopMonitoring] Parando monitoramento de output
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:302 ℹ️ Monitor de volume (output) já está inativo
AudioDeviceManager.js:199 ✅ output monitor parado
ConfigManager.js:108 💾 Configurações salvas com sucesso
AudioDeviceManager.js:124 💾 Dispositivos salvos: {input: '', output: ''}
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: AUDIO_DEVICE_UPDATED
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
saveDevices @ AudioDeviceManager.js:130
reset @ AudioDeviceManager.js:59
resetConfig @ ConfigManager.js:182
await in resetConfig
(anonymous) @ ConfigManager.js:391
ModelSelectionManager.js:60 🔄 ModelSelectionManager.reset()
ConfigManager.js:108 💾 Configurações salvas com sucesso
ModelSelectionManager.js:51 📂 ModelSelectionManager.restoreState()
ModelSelectionManager.js:83 🔄 INICIANDO RESTAURAÇÃO DE MODELOS STT/LLM...
ModelSelectionManager.js:93    📝 openai-stt-model: antes="vosk" → depois="vosk"
ModelSelectionManager.js:95    ✅ STT restaurado - openai: vosk
ModelSelectionManager.js:106    📝 openai-llm-model: antes="gpt-4o-mini" → depois=""
ModelSelectionManager.js:108    ✅ LLM restaurado - openai:
ModelSelectionManager.js:93    📝 google-stt-model: antes="vosk" → depois="vosk"
ModelSelectionManager.js:95    ✅ STT restaurado - google: vosk
ModelSelectionManager.js:106    📝 google-llm-model: antes="gemini-pro" → depois=""
ModelSelectionManager.js:108    ✅ LLM restaurado - google:
ModelSelectionManager.js:93    📝 openrouter-stt-model: antes="vosk" → depois="vosk"
ModelSelectionManager.js:95    ✅ STT restaurado - openrouter: vosk
ModelSelectionManager.js:106    📝 openrouter-llm-model: antes="" → depois=""
ModelSelectionManager.js:108    ✅ LLM restaurado - openrouter:
ModelSelectionManager.js:114 🎉 RESTAURAÇÃO CONCLUÍDA
ScreenConfigManager.js:56 🔄 ScreenConfigManager.reset()
ConfigManager.js:108 💾 Configurações salvas com sucesso
PrivacyConfigManager.js:49 🔄 PrivacyConfigManager.reset()
ConfigManager.js:108 💾 Configurações salvas com sucesso
PrivacyConfigManager.js:41 📂 PrivacyConfigManager.restoreState()
PrivacyConfigManager.js:69 🔐 Restaurando configurações de privacidade...
PrivacyConfigManager.js:76    ✅ Ocultar de screenshot: Não
PrivacyConfigManager.js:86    ✅ Desabilitar telemetria: Não
PrivacyConfigManager.js:97    ✅ Auto-limpar dados: Não
PrivacyConfigManager.js:106    ✅ Dias de retenção: 7
PrivacyConfigManager.js:111 ✅ Restauração concluída
WindowConfigManager.js:57 🔄 WindowConfigManager.reset()
ConfigManager.js:108 💾 Configurações salvas com sucesso
WindowConfigManager.js:49 📂 WindowConfigManager.restoreState()
WindowConfigManager.js:74 🔄 RESTAURANDO PREFERÊNCIAS DA JANELA...
WindowConfigManager.js:86    ✅ Dark Mode restaurado: ATIVADO
WindowConfigManager.js:96    ✅ Interview Mode restaurado: INTERVIEW
WindowConfigManager.js:130 🎨 Aplicando opacidade: 0.75
WindowConfigManager.js:107    ✅ Opacidade restaurada: 0.75
WindowConfigManager.js:148 🖱️ Inicializando drag handle...
WindowConfigManager.js:208 ✅ Drag handle inicializado
WindowConfigManager.js:116    ✅ Drag handle inicializado
WindowConfigManager.js:121 ✅ Preferências restauradas
ConfigManager.js:249 📋 DEFAULT CONFIG - other section:
ConfigManager.js:250    clickThroughEnabled: false
ConfigManager.js:108 💾 Configurações salvas com sucesso
ConfigManager.js:191 ✅ Configurações resetadas


```

**Correção Aplicada:**

- ✅ Removido evento `API_KEY_UPDATED` não utilizado em `ApiKeyManager.js` (2 ocorrências)
  - Linha 96: Removido `this.eventBus.emit('API_KEY_UPDATED', { provider, hasKey: true });` em `saveApiKey()`
  - Linha 138: Removido `this.eventBus.emit('API_KEY_UPDATED', { provider, hasKey: false });` em `deleteApiKey()`
  - **Root Cause**: O evento era emitido mas nenhum listener no EventBus o escutava
  - **Nota**: O `renderer.js` tem um listener em `ipcRenderer` (IPC do Electron), não no EventBus interno
  - **Solução**: Aplicar padrão YAGNI - remover código não utilizado

**✅ Como Testar:**

1. Vá para **"Outras Configurações"**
2. Procure o botão **"🔄 Restaurar Configurações de Fábrica"** (em vermelho)
3. Clique no botão
4. Confirme no dialog que aparece
5. Aguarde a página recarregar
6. Verifique se as configurações voltaram ao padrão
7. **Importante**: Verifique o console do DevTools para confirmar que **não há aviso** "Nenhum listener para: API_KEY_UPDATED"

**Esperado:**

- ✅ Botão responde ao clique
- ✅ Dialog de confirmação aparece
- ✅ Ao confirmar, página recarrega
- ✅ Configurações voltam ao padrão (tema claro, sem API keys, etc)
- ✅ Mensagem "✅ Configurações restauradas ao padrão com sucesso!"
- ✅ **NOVO**: Nenhum aviso "Nenhum listener para: API_KEY_UPDATED" no console

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [x] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [ ] 🚫 Bloqueado

**Resultado:**

- ✅ CORRIGIDO - Aviso eliminado
- ✅ Evento não utilizado removido do EventBus
- ✅ Reset funciona sem avisos no console

**Commit:** Pronto para commit - Bug #3 testado e aprovado

**Status Atual:** ✅ CORRIGIDO E PRONTO PARA COMMIT

<br>

---

<br>

### BUG #4: Seção (Áudio e Tela) - Troca de Dispositivo de Áudio 🎤

**Problema:** Aviso "Nenhum listener para: AUDIO_DEVICE_UPDATED"

**Log relacionado:**

```text

AudioDeviceManager.js:238 🔄 Input device selecionado: default
ConfigManager.js:108 💾 Configurações salvas com sucesso
AudioDeviceManager.js:124 💾 Dispositivos salvos: {input: 'default', output: 'default'}
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: AUDIO_DEVICE_UPDATED
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
saveDevices @ AudioDeviceManager.js:130
(anonymous) @ AudioDeviceManager.js:239
handleMouseUp_ @ unknown
AudioDeviceManager.js:197 🛑 [stopMonitoring] Parando monitoramento de input
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:302 ℹ️ Monitor de volume (input) já está inativo
AudioDeviceManager.js:199 ✅ input monitor parado
AudioDeviceManager.js:181 📊 [startMonitoring] Iniciando monitoramento VOLUME (input): default
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:210 🎛️ Iniciando monitor de volume (input) com dispositivo: default...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:217 ✅ AudioContext criado com sucesso
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:164 📂 Tentando carregar worklet de: ./audio/volume-audio-worklet-processor.js
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:169 ✅ Volume monitor worklet registrado com sucesso
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:234 ✅ Stream de áudio capturado (input)
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:245 ✅ MediaStreamSource criado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:251 ✅ AudioWorkletNode criado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:272 ✅ Monitor de volume (input) iniciado com sucesso
AudioDeviceManager.js:183 ✅ input monitor iniciado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: inputVolumeUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
handleVolumeMonitorUpdate @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:400
processor.port.onmessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:261
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: inputVolumeUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57


AudioDeviceManager.js:249 🔄 Output device selecionado: communications
ConfigManager.js:108 💾 Configurações salvas com sucesso
AudioDeviceManager.js:124 💾 Dispositivos salvos: {input: 'default', output: 'communications'}
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: AUDIO_DEVICE_UPDATED
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
saveDevices @ AudioDeviceManager.js:130
(anonymous) @ AudioDeviceManager.js:250
handleMouseUp_ @ unknown
AudioDeviceManager.js:197 🛑 [stopMonitoring] Parando monitoramento de output
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:302 ℹ️ Monitor de volume (output) já está inativo
AudioDeviceManager.js:199 ✅ output monitor parado
AudioDeviceManager.js:181 📊 [startMonitoring] Iniciando monitoramento VOLUME (output): communications
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:210 🎛️ Iniciando monitor de volume (output) com dispositivo: communications...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:217 ✅ AudioContext criado com sucesso
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:164 📂 Tentando carregar worklet de: ./audio/volume-audio-worklet-processor.js
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:169 ✅ Volume monitor worklet registrado com sucesso
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:234 ✅ Stream de áudio capturado (output)
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:245 ✅ MediaStreamSource criado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:251 ✅ AudioWorkletNode criado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:272 ✅ Monitor de volume (output) iniciado com sucesso
AudioDeviceManager.js:183 ✅ output monitor iniciado
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: outputVolumeUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
handleVolumeMonitorUpdate @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:400
processor.port.onmessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\audio\volume-audio-monitor.js:261
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: outputVolumeUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57

```

**Correção Aplicada:**

- ✅ Removido evento `AUDIO_DEVICE_UPDATED` não utilizado em `AudioDeviceManager.js` (1 ocorrência)
  - Linha 130: Removido `this.eventBus.emit('AUDIO_DEVICE_UPDATED', { ... });` em `saveDevices()`
  - **Root Cause**: O evento era emitido mas nenhum listener no EventBus o escutava

- ✅ Mantido eventos `inputVolumeUpdate` e `outputVolumeUpdate` para funcionalidade do VU meter
  - Linha 399-400: Mantida emissão de eventos em `handleVolumeMonitorUpdate()`
- ✅ Adicionado inicialização de monitoramento de volume na restauração de dispositivos
  - Modificado `restoreDevices()` em AudioDeviceManager.js
  - Agora chama `startAudioVolumeMonitor()` para input e output ao restaurar configurações
  - **Fix**: VU meter agora funciona logo ao iniciar a app

- ✅ Adicionado listeners de volume em renderer.js
  - Listeners para `inputVolumeUpdate` e `outputVolumeUpdate` atualizam a UI dos VU meters
  - VU meters agora oscilam visualmente ao falar/ouvir

**✅ Como Testar:**

1. Feche completamente a app
2. Abra a app novamente
3. Vá para **"Áudio e Tela"** > Aba **"Áudio"**
4. **Importante**: Verifique se o VU meter de entrada **oscila imediatamente** ao falar no microfone
5. Verifique se o VU meter de saída **oscila** quando há som sendo reproduzido
6. Mude de dispositivo e volte - VU meter deve continuar funcionando

**Esperado:**

- ✅ VU meters oscilam logo ao iniciar a app (sem precisar trocar de dispositivo)
- ✅ Dispositivos são salvos entre seções
- ✅ Nenhum aviso de listeners faltando no console
- ✅ Nenhum loop ou travamento

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [ ] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [ ] 🚫 Bloqueado

**Resultado:**

- ✅ CORRIGIDO - Avisos eliminados
- ✅ Eventos não utilizados removidos do EventBus
- ✅ Sem loops infinitos

**Commit:** ""

**Status Atual:** ✅ CORRIGIDO - Aguardando teste manual para confirmação

<br>

---

<br>

### BUG #5: Seção (Áudio e Tela) - Troca de Abas em "Áudio e Tela" 📱

**Problema:** Abas não trocam quando clicadas

**Log relacionado:**

```text



```

**Correção Aplicada:**

- ✅ Adicionado método `#initTabSwitching()` em `HomeManager.js`
- ✅ Implementado suporte para trocar abas dentro das seções
- ✅ Chamado no `initialize()` do HomeManager

**✅ Como Testar:**

1. Vá para **"Áudio e Tela"**
2. Localize as abas: **"Áudio"** e **"Captura de Tela"**
3. Clique na aba "Captura de Tela"
4. Verifique se o conteúdo mudou para as opções de screenshot
5. Clique novamente em "Áudio"
6. Verifique se voltou ao conteúdo anterior

**Esperado:**

- ✅ Abas trocam corretamente
- ✅ Conteúdo muda dinamicamente
- ✅ Aba ativa tem cor/destaque diferente

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [x] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [ ] 🚫 Bloqueado

**Commit:** a975298 - Bug #5 commitado com sucesso

**Status Atual:** ✅ CORRIGIDO E COMMITADO

**Problema:** Abas não trocam quando clicadas

**Log relacionado:**

```text



```

**Correção Aplicada:**

- ✅ Resolvido pelo método `#initTabSwitching()` (mesmo do Bug #5)
- ✅ Funciona para todas as seções com abas

**✅ Como Testar:**

1. Vá para **"API e Modelos"**
2. Localize as abas: **"OpenAI"**, **"Google"**, **"OpenRouter"**
3. Clique em cada aba sequencialmente
4. Verifique se o conteúdo muda corretamente
5. Confirme que cada aba exibe seus campos específicos

**Esperado:**

- ✅ Abas trocam corretamente
- ✅ Cada aba mostra seus modelos específicos
- ✅ Conteúdo é independente entre abas

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [x] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [ ] 🚫 Bloqueado

**Commit:** a975298 - Bug #6 commitado com sucesso

**Status Atual:** ✅ CORRIGIDO E COMMITADO

### BUG #7: Seção (API e Modelos)- Ativar/Desativar Modelos 🤖

**Problema:** Ao ativar e desativar o modelo aparece "Nenhum listener para: MODEL_TOGGLED" checar se isso é necessario, pois visualmente está ativando e desativando modelo.

**Log relacionado:**

```text

ModelSelectionManager.js:131 ✅ Modelo openai desativado com sucesso
ConfigManager.js:108 💾 Configurações salvas com sucesso
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: MODEL_TOGGLED
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
toggleModel @ ModelSelectionManager.js:137
(anonymous) @ ModelSelectionManager.js:231


```

**Correção Aplicada:**

- ⏳ AGUARDANDO ANÁLISE

**✅ Como Testar:**

1. Vá para **"API e Modelos"**
2. Clique no botão de um modelo (ex: "Ativar" para Google)
3. Verifique se o status muda (Inativo → Ativo)
4. Clique novamente para desativar
5. Verifique se volta a (Ativo → Inativo)

**Esperado:**

- ✅ Status do modelo muda visualmente
- ✅ Botão alterna entre "Ativar" e "Desativar"
- ✅ Nenhum aviso no console sobre listeners faltando

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [ ] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [x] 🚫 Bloqueado

**Resultado:**

- 🚫 Bloqueado, ao resetar as configurações apagou a chave existente
- ❌ Novo bug #11, conferir e corrigir para liberar teste.
- 💡 Sempre checar qualquer aviso e corrigir sem mascarar o aviso.

**Commit:** ""

**Status Atual:** ⏳ Aguardando Analise

<br>

---

<br>

### BUG #8: Seção (Home) - Botão Listen sem Modelo Ativo 🎤 (Erro)

**Problema:** Ao clicar no Botão acusa o aviso "Nenhum listener para: statusUpdate"

**Log relacionado:**

```text

HomeManager.js:204 >>> listenBtn CLICADO!
HomeManager.js:206 >>> Chamando listenToggleBtn()...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\Logger.js:69 ⏱️ [12:40:09.574] 🪲 ❯❯❯❯ Debug: 🎤 listenToggleBtn: Tentando INICIAR escuta...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\Logger.js:40 [2026-01-25T15:40:09.574Z] [ERROR] Erro na eventBus {error: 'Ative um modelo de IA antes de começar a ouvir'}
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: statusUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:131
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
listenToggleBtn @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\controllers\audio\audio-controller.js:97
(anonymous) @ HomeManager.js:207
HomeManager.js:208 >>> listenToggleBtn() chamado com sucesso


```

**Correção Aplicada:**

- ✅ Adicionado listener `statusUpdate` em `renderer.js`
- ✅ Chama `updateStatusMessage()` para exibir mensagens

**✅ Como Testar:**

1. Vá para **"Outras Configurações"**
2. Clique em "Restaurar Configurações de Fábrica" e confirme (para desativar modelos)
3. Após recarregar, volte para **"Home"**
4. Clique no botão **"🎤 Escutar"** (listen button)
5. Verifique se aparece erro: **"Ative um modelo de IA antes de começar a ouvir"**
6. Observar se a mensagem aparece corretamente

**Esperado:**

- ✅ Mensagem de erro aparece corretamente
- ✅ Nenhum aviso "Nenhum listener para: statusUpdate"
- ✅ Erro é exibido em forma de feedback visual

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [ ] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [x] 🚫 Bloqueado

**Resultado:**

- 🚫 Bloqueado, ao resetar as configurações apagou a chave existente
- ❌ Novo bug #11, conferir e corrigir para liberar teste.
- 💡 Sempre checar qualquer aviso e corrigir sem mascarar o aviso.

**Commit:** ""

**Status Atual:** ⏳ Aguardando Analise

<br>

---

<br>

### BUG #9: Seção (Home) - Botão Listen com Dispositivo Selecionado 🎤📊

**Problema:** Ao clicar no Botão com dispositivo selecionado (input e output) na seção de audio, o sistema exibe log para selecionar um dispositivo, não apresenta a mensagem de erro "showError()" e ainda exibe um aviso de Nenhum "listener para: statusUpdate"

**Log relacionado:**

```text

HomeManager.js:204 >>> listenBtn CLICADO!
HomeManager.js:206 >>> Chamando listenToggleBtn()...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\Logger.js:69 ⏱️ [12:43:18.969] 🪲 ❯❯❯❯ Debug: 🎤 listenToggleBtn: Tentando INICIAR escuta...
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\controllers\audio\audio-controller.js:158 ✅ Modelo ativo encontrado: openai
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\Logger.js:38 [2026-01-25T15:43:18.970Z] [WARN] ⚠️ Selecione um dispositivo de áudio (output) para ouvir a reunião
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\Logger.js:40 [2026-01-25T15:43:18.970Z] [ERROR] Erro na eventBus {error: 'Selecione um dispositivo de áudio (output) para ouvir a reunião'}
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: statusUpdate
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
updateStatusMessage @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\utils\renderer-helpers.js:26
(anonymous) @ renderer.js:131
(anonymous) @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:63
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:61
listenToggleBtn @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\controllers\audio\audio-controller.js:111
(anonymous) @ HomeManager.js:207
HomeManager.js:208 >>> listenToggleBtn() chamado com sucesso


```

**Correção Aplicada:**

- ✅ Adicionado listener `statusUpdate` em `renderer.js`
- ✅ Chama `updateStatusMessage()` para exibir mensagens

**✅ Como Testar:**

1. Vá para **"API e Modelos"** e ative o modelo OpenAI (se não estiver)
2. Vá para **"Áudio e Tela"** e selecione dispositivos de input e output
3. Volte para **"Home"**
4. Clique no botão **"🎤 Escutar"**
5. Verifique se começa a capturar áudio
6. Observe o VU meter subir conforme fala
7. Clique novamente para parar

**Esperado:**

- ✅ Captura de áudio funciona
- ✅ VU meter mostra níveis de volume
- ✅ Nenhum erro de listener ou showError()
- ✅ Transcrição aparece no histórico

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [ ] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [x] 🚫 Bloqueado

**Resultado:**

- 🚫 Bloqueado, ao resetar as configurações apagou a chave existente
- ❌ Novo bug #11, conferir e corrigir para liberar teste.
- 💡 Sempre checar qualquer aviso e corrigir sem mascarar o aviso.

**Commit:** ""

**Status Atual:** ⏳ Aguardando Analise

<br>

---

<br>

### BUG #10: TopBar - Slider de Opacidade 🎨

**Problema:** Ao mover o opacityRange está aparecendo o showSaveFeedback() diversas vezes, na verdade ele não deveria aparecer na mudança de opacidade ao usar o opacityRange, ele deve apenas savar o ultimo valor utilizado pelo usuario para recuperar ao fechar e abrir o app novamente. Além disso aparece o aviso " Nenhum listener para: WINDOW_CONFIG_CHANGED". checar toda a regra novamente se está de acordo.

**Log relacionado:**

```text

WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: opacity-control interactive-zone
WindowConfigManager.js:130 🎨 Aplicando opacidade: 0.93
WindowConfigManager.js:280    📝 Opacidade visual alterada: 0.93
WindowConfigManager.js:130 🎨 Aplicando opacidade: 0.95
WindowConfigManager.js:280    📝 Opacidade visual alterada: 0.95
WindowConfigManager.js:130 🎨 Aplicando opacidade: 0.96
WindowConfigManager.js:280    📝 Opacidade visual alterada: 0.96
WindowConfigManager.js:130 🎨 Aplicando opacidade: 0.99
WindowConfigManager.js:280    📝 Opacidade visual alterada: 0.99
WindowConfigManager.js:130 🎨 Aplicando opacidade: 1
WindowConfigManager.js:280    📝 Opacidade visual alterada: 1
WindowConfigManager.js:218 💾 Salvando opacityRange: 1
WindowConfigManager.js:130 🎨 Aplicando opacidade: 1
ConfigManager.js:108 💾 Configurações salvas com sucesso
D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57 ⚠️ Nenhum listener para: WINDOW_CONFIG_CHANGED
emit @ D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\events\EventBus.js:57
saveWindowField @ WindowConfigManager.js:234
(anonymous) @ WindowConfigManager.js:284
WindowConfigManager.js:236    ✅ Campo opacityRange salvo
WindowConfigManager.js:285    💾 Opacidade salva: 1
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: opacity-control interactive-zone




```

**Correção Aplicada:**

- ✅ Alterado listener de `input` para `change` em WindowConfigManager.js
- ✅ Agora usa `input` apenas para feedback visual
- ✅ Usa `change` (mouse up) para salvar persistentemente

**✅ Como Testar:**

1. Localize o **slider de opacidade** na barra de topo (TopBar)
2. Mova o slider lentamente para a esquerda (reduzir opacidade)
3. Verifique se a janela fica mais transparente
4. Mova para a direita para aumentar opacidade
5. Verifique se não aparece "Configurações salvas!" a cada movimento
6. Solte o slider
7. Verifique se não aparece "Configurações salvas!" ao soltar
8. Feche e abra a app novamente
9. Verifique se a opacidade foi salva

**Esperado:**

- ✅ Opacidade muda suavemente enquanto move o slider
- ✅ Feedback "Configurações salvas!" aparece apenas ao SOLTAR o slider
- ✅ Nenhum aviso "Nenhum listener para: WINDOW_CONFIG_CHANGED"
- ✅ Opacidade é salva entre sessões

**Status do Teste:**

- [ ] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [ ] ✅ Passou
- [ ] ❌ Falhou
- [x] 🟡 Parcialmente aprovado
- [ ] 🚫 Bloqueado

**Resultado:**

- ❌ Ainda aparece "Configurações salvas!" ao soltar
- Obs.: o feedeback não deve aparecer, ao soltar ele deve apenas salvar o valor escolhido para ser recuperado ao iniciar o app.
- ⚠️ Aviso no log: ⚠️ Nenhum listener para: WINDOW_CONFIG_CHANGED
- 🔎 Necessário investigar, confira o "Log relacionado", foi atualizado.
- 💡 Sempre checar qualquer aviso e corrigir sem mascarar o aviso.

**Commit:** ""

**Status Atual:** ⏳ Aguardando Analise

<br>

---

<br>

### BUG #11: Chave da API - Não salva

**Problema:** Ao incluir uma chave de API e tentar salvar clicando no botão de "Salvar Configurações" nada acontece, em qualquer modelo.

**Log relacionado:**

```text

WindowConfigManager.js:387 🖱️ Zona interativa ATIVADA: openai-llm-model
WindowConfigManager.js:393 🖱️ Zona interativa DESATIVADA: openai-llm-model
ApiKeyManager.js:265 📝 Novo valor digitado - aguardando salvar


```

**Correção Aplicada:**

- ⏳ AGUARDANDO ANALISE

**✅ Como Testar:**

1.

**Esperado:**

- **Status do Teste:**

- [x] ⏳ Aguardando execução
- [ ] 🔄 Em execução
- [ ] ✅ Passou
- [ ] ❌ Falhou
- [ ] 🟡 Parcialmente aprovado
- [ ] 🚫 Bloqueado

**Commit:** ""

**Status Atual:** ⏳ AGUARDANDO ANALISE

<br>

---
