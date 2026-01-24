# 🚀 GUIA RÁPIDO - CONTINUANDO A REFATORAÇÃO

## Status Atual

✅ **FASE 1 COMPLETA**: Estrutura reorganizada  
✅ **FASE 5.1 COMPLETA**: Testes implementados (74 passando)  
🔄 **PRÓXIMA**: Fase 2 - Decomposição renderer.js

---

## Como Continuar

### 1. Configurar Ambiente

```bash
# Clone/pull o repositório
git clone <repo> ou git pull origin refatoracao

# Instale dependências
npm install

# Valide tudo funciona
npm start        # App deve abrir normalmente
npm test         # Todos 74 testes devem passar
```

### 2. Antes de Fazer Qualquer Mudança

```bash
# SEMPRE rode testes primeiro
npm test

# Se algum falha, algo mudou inesperadamente
# NÃO CONTINUE até resolver
```

### 3. Executar a Próxima Fase (Fase 2)

**Tempo estimado:** 4 horas  
**Objetivo:** Reduzir renderer.js de 1533 → 450 linhas

**Passos:**

1. **Ler o plano:**
   ```bash
   cat PLANO_REFATORACAO.md | grep -A 30 "### 2"
   ```

2. **Extrair Audio Controller:**
   ```bash
   # Criar o arquivo
   touch controllers/audio/audio-controller.js
   
   # Ler linhas 234-400 de renderer.js
   sed -n '234,400p' renderer.js > /tmp/audio-extract.txt
   
   # Analisar quais funções extrair
   # Copiar para novo arquivo
   # Testar: npm test && npm start
   ```

3. **Extrair Question Controller:**
   - Linhas 276-330 aprox
   - Testes no arquivo existente

4. **Extrair Screenshot Controller:**
   - Linhas 1014-1160 aprox
   - Funções de captura

5. **Atualizar Imports:**
   - renderer.js deve importar dos novos controllers
   - Validar npm test (devem passar)

6. **Commit:**
   ```bash
   git add -A
   git commit -m "refactor(fase-2): decomposição renderer.js
   
   - Extrair audio-controller.js (200 linhas)
   - Extrair question-controller.js (300 linhas)
   - Extrair screenshot-controller.js (150 linhas)
   - renderer.js: 1533 → 450 linhas
   - Todos 74 testes passando ✓"
   ```

---

## Estrutura Importante

```
Estrutura criada e preparada:
├── /controllers/
│   ├── modes/
│   │   └── mode-manager.js        ✓ Pronto
│   ├── audio/                     ← Extrair aqui (Fase 2)
│   ├── question/                  ← Extrair aqui (Fase 2)
│   └── screenshot/                ← Extrair aqui (Fase 2)
├── /testing/
│   └── mock-runner.js             ✓ Pronto
├── /__tests__/
│   ├── unit/
│   │   ├── AppState.test.js       ✓ 17 testes
│   │   ├── EventBus.test.js       ✓ 14 testes
│   │   ├── ModeManager.test.js    ✓ 16 testes
│   │   └── STTStrategy.test.js    ✓ 7 testes
│   └── integration/
│       └── core-systems.integration.test.js  ✓ 20 testes
├── jest.config.js                 ✓ Configurado
└── PLANO_REFATORACAO.md           ✓ Atualizado
```

---

## Comandos Úteis

```bash
# Rodar testes
npm test                 # Todos os testes
npm run test:watch      # Modo observador (re-roda ao salvar)
npm run test:coverage   # Gerar relatório de cobertura

# Verificar app
npm start               # Inicia app (Ctrl+C para parar)

# Git
git log --oneline       # Ver histórico de commits
git diff renderer.js    # Ver mudanças não commitadas
git status             # Status geral
git add -A             # Stage tudo
git commit -m "msg"    # Fazer commit

# Buscar funções no renderer
grep -n "^function " renderer.js    # Listar todas funções
grep -n "setInterval\|setTimeout" renderer.js  # Encontrar timers
```

---

## Workflow Recomendado para Cada Fase

### Para cada nova fase:

1. **Ler a seção no PLANO_REFATORACAO.md**
2. **Garantir testes passando:** `npm test`
3. **Fazer mudanças pequenas e incrementais**
4. **Após cada mudança:** `npm test && npm start`
5. **Se teste falhar:** Debugar, não continuar
6. **Quando completo:** `git commit -m "..."`
7. **Atualizar PLANO_REFATORACAO.md com status**

---

## Se Algo Quebrar

```bash
# 1. Parar o que está fazendo
Ctrl+C  (se app rodando)

# 2. Ver o que mudou
git status              # Arquivos alterados
git diff renderer.js    # Mudanças exatas

# 3. Opções:

# Reverter tudo (volta para último commit):
git reset --hard HEAD

# Reverter um arquivo específico:
git checkout -- renderer.js

# Abrir editor para corrigir manualmente:
code renderer.js

# Ver histórico de um arquivo:
git log -p renderer.js
```

---

## Dicas Importantes

### ✅ FAÇA:
- Commits pequenos e focados
- Teste após cada mudança
- Leia o plano antes de começar
- Comunique quando muda de fase
- Documente novas funções

### ❌ NÃO FAÇA:
- Mudanças enormes em um commit
- Pular testes
- Refatorar múltiplas coisas ao mesmo tempo
- Deletar código sem backup (git preserva)
- Ignorar testes que falham

---

## Próximas Fases (Após Fase 2)

| Fase | Descrição | Tempo | Dependência |
|------|-----------|-------|------------|
| Fase 3 | Refatorar handlers | 2h | Fase 2 ✓ |
| Fase 4 | Consolidar STT/LLM | 3h | Fase 3 |
| Fase 6 | Limpeza código | 1h | Fase 4 |
| Fase 7 | Documentação | 1h | Fase 6 |
| Fase 8 | Integração CI | 2h | Fase 7 |
| Fase 9 | Produção | 1h | Fase 8 |

---

## Contato / Dúvidas

Se ficar preso:

1. **Leia PLANO_REFATORACAO.md** (tem detalhes)
2. **Rode `npm test`** (9/10 vezes resolve)
3. **Veja git log** (entender o que foi feito antes)
4. **Reverta última mudança** e tente de novo
5. **Consulte RESUMO_REFATORACAO_REALIZADA.md** (contexto)

---

## Successo Esperado

Quando Fase 2 estiver completa:

```bash
npm test
# Test Suites: 5 passed, 5 total
# Tests:       74 passed, 74 total
# ✓ Todos passando

npm start
# ✓ App abre sem erros
# ✓ Audio funciona
# ✓ LLM funciona
# ✓ Tudo igual ao antes

git log --oneline | head -5
# a1b2c3d refactor(fase-2): decomposição renderer.js
# ...
```

---

**Boa sorte! Você consegue! 🚀**

Qualquer dúvida, consulte:
- PLANO_REFATORACAO.md (planejamento completo)
- RESUMO_REFATORACAO_REALIZADA.md (contexto histórico)
- Código dos testes (__tests__/) (exemplos de boas práticas)
