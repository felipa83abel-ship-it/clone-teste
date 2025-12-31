# ⚡ Quick Start - Vosk Integration

## 3 Passos para Rodar

### 1. Instale Vosk

```bash
npm install vosk
```

### 2. Baixe o Modelo Português

1. Acesse: https://alphacephei.com/vosk/models
2. Procure por: `vosk-model-pt-0.3`
3. Descompacte em: `./vosk-models/vosk-model-pt-0.3/`

### 3. Verifique o Setup

```bash
node check-vosk-setup.js
```

Se tudo ✅, execute:

```bash
npm start
```

---

## 🧪 Teste Básico

1. **Ativar Modo Entrevista**

   - Dropdown superior: selecione "Entrevista"

2. **Começar Escuta**

   - Clique "Começar a Ouvir" ou Ctrl+D

3. **Falar uma Pergunta**

   - Diga: "O que é POO?"
   - Deve aparecer em tempo real na tela

4. **Verificar Logs**
   - Abra DevTools: F12
   - Console deve mostrar:
   ```
   🎤 Vosk chunk processado: { partial: "o que é poo", final: "" }
   ❓ Pergunta pronta (Vosk): o que é poo?
   ```

---

## 📖 Documentação Completa

- **Setup Detalhado:** [VOSK_SETUP.md](./VOSK_SETUP.md)
- **Resumo Técnico:** [VOSK_TECHNICAL_SUMMARY.md](./VOSK_TECHNICAL_SUMMARY.md)
- **Changelog:** [VOSK_CHANGELOG.md](./VOSK_CHANGELOG.md)

---

## ⚠️ Problemas Comuns

### "Module not found: vosk"

```bash
npm install vosk
```

### "Modelo Vosk não encontrado"

- Verificar se descompactou em `./vosk-models/vosk-model-pt-0.3/`
- Executar: `node check-vosk-setup.js`

### "Python not found"

- Instalar Python 3: https://www.python.org/downloads/
- Reiniciar VS Code / Terminal
- Tentar `npm install vosk` novamente

### Sem mudança na tela (texto não aparece)

- Verificar se é modo **Entrevista** (não normal)
- Conferir se dispositivo OUTPUT selecionado
- Falar mais claro/lentamente
- Verificar logs no F12

---

## 🎯 Estado Atual

- ✅ Handlers Vosk implementados
- ✅ Fluxo separado para modo entrevista
- ✅ UI atualiza em tempo real (placeholder incremental)
- ⏳ **askGpt() comentado** (próximo passo: descomentar)
- ⏳ Teste com áudio real

---

## 🔗 Links

| Recurso      | Link                                         |
| ------------ | -------------------------------------------- |
| Vosk API     | https://github.com/alphacep/vosk-api         |
| Modelos      | https://alphacephei.com/vosk/models          |
| Node.js docs | https://nodejs.org/api                       |
| Electron IPC | https://www.electronjs.org/docs/api/ipc-main |

---
