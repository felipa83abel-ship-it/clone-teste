# 📍 Localização de Models-STT e Server-Vosk

## Estrutura Recomendada

```
root/
├── services/stt/                          ← STT Providers (incluindo modelos e server)
│   ├── STTStrategy.js                     # Orquestrador
│   ├── stt-deepgram.js                    # Provider: Deepgram (online)
│   ├── stt-vosk.js                        # Provider: Vosk (local, offline)
│   ├── stt-whisper.js                     # Provider: Whisper (online ou local)
│   ├── vad-engine.js                      # Voice Activity Detection
│   ├── stt-audio-worklet-processor.js     # Audio Web Audio API
│   ├── server-vosk.py                     # ← SERVER PYTHON para Vosk
│   └── models-stt/                        # ← MODELOS de STT
│       ├── vosk/
│       │   └── vosk-model-small-pt-0.3/   # Modelo Vosk para português
│       └── whisper/
│           ├── bin/whisper-cli.exe        # CLI Whisper
│           └── models/ggml-tiny.bin       # Modelo Whisper tiny
```

---

## 📝 Instruções para Você Mover

### Passo 1: Mover `models-stt/`
```bash
# A pasta JÁ está em services/stt/models-stt/
# Mas se ainda tiver em stt/ antiga, copie:
cp -r stt/models-stt services/stt/
# ou se tiver permissão:
mv stt/models-stt services/stt/
```

### Passo 2: Mover `server-vosk.py`
```bash
# Mova o arquivo Python para services/stt/
mv stt/server-vosk.py services/stt/

# Verifique que não ficou cópia em stt/
rm stt/server-vosk.py  # Se houver
```

### Passo 3: Limpar pasta `stt/` antiga
```bash
# Se stt/ ficar vazia, pode deletar:
rmdir stt/

# Se tiver outros arquivos, deixe até ter certeza
```

---

## ✅ Caminhos Já Atualizados

| Arquivo | O que foi atualizado | Novo caminho |
|---------|----------------------|--------------|
| **stt/server-vosk.py** | Mensagem de erro | `./services/stt/models-stt/vosk/` |
| **stt/server-vosk.py** | Modelo padrão | `services/stt/models-stt/vosk/vosk-model-small-pt-0.3` |
| **services/stt/stt-vosk.js** | Caminho do modelo | `./models-stt/vosk/vosk-model-small-pt-0.3` |
| **services/stt/stt-vosk.js** | Comentário (cwd) | `services/stt/` |
| **services/stt/stt-whisper.js** | Caminho CLI | `./models-stt/whisper/bin/whisper-cli.exe` |
| **services/stt/stt-whisper.js** | Caminho modelo | `./models-stt/whisper/models/ggml-tiny.bin` |
| **eslint.config.js** | Ignores | `services/stt/models-stt/vosk/...` |

---

## 🎯 Lógica dos Caminhos

### Por que `./models-stt/` em vez de caminhos absolutos?

**Em stt-vosk.js:**
```javascript
const VOSK_CONFIG = {
  // __dirname = /projeto/services/stt/
  // Então ./models-stt = /projeto/services/stt/models-stt/
  MODEL: process.env.VOSK_MODEL || './models-stt/vosk/vosk-model-small-pt-0.3',
};

// spawn é chamado com cwd: __dirname
// Então server-vosk.py procura por:
// cwd/models-stt/vosk/vosk-model-small-pt-0.3
```

**Em server-vosk.py:**
```python
# Se chamado do diretório services/stt/:
# python server-vosk.py
# Usa: services/stt/models-stt/vosk/vosk-model-small-pt-0.3

# Se chamado com argumento:
# python server-vosk.py /caminho/customizado
# Usa: /caminho/customizado
```

**Em stt-whisper.js:**
```javascript
// __dirname = /projeto/services/stt/
const WHISPER_CLI_EXE = path.join(
  __dirname,                          // /projeto/services/stt/
  'models-stt/whisper/bin',          // + models-stt/whisper/bin
  'whisper-cli.exe'                   // + whisper-cli.exe
);
// Resultado: /projeto/services/stt/models-stt/whisper/bin/whisper-cli.exe
```

---

## 📊 Validação Após Mover

Após mover os arquivos, valide com:

```bash
# 1. Verificar estrutura
ls -la services/stt/
# Deve mostrar: models-stt, server-vosk.py, stt-vosk.js, etc

# 2. Verificar que models-stt tem modelos
ls -la services/stt/models-stt/
# Deve mostrar: vosk, whisper, etc

# 3. Testar aplicação
npm start
# Deve funcionar normalmente, sem erros de "arquivo não encontrado"

# 4. Teste Vosk (se quiser testar especificamente)
cd services/stt/
python server-vosk.py
# Deve inicializar sem erro "modelo não encontrado"
```

---

## 🔄 Se Precisar Customizar Caminho de Modelo

### Opção 1: Variável de Ambiente
```bash
# Antes de rodar:
export VOSK_MODEL=/caminho/custom/modelo
npm start

# Ou no .env:
VOSK_MODEL=/caminho/custom/modelo
```

### Opção 2: Editar arquivo (não recomendado)
```javascript
// services/stt/stt-vosk.js
const VOSK_CONFIG = {
  MODEL: '/seu/caminho/customizado',  // Em vez de ./models-stt/...
};
```

---

## 📋 Checklist Final

- [ ] `models-stt/` está em `services/stt/models-stt/`
- [ ] `server-vosk.py` está em `services/stt/server-vosk.py`
- [ ] Pasta `stt/` antiga foi deletada ou esvaziada
- [ ] Ran `npm start` sem erros
- [ ] `docs/ARQUITETURA_FINAL.md` mencionado estrutura

---

## 💡 Dica Importante

**Os caminhos já foram atualizados** em:
- ✅ `services/stt/stt-vosk.js` (usa `__dirname`)
- ✅ `services/stt/stt-whisper.js` (usa `__dirname`)
- ✅ `stt/server-vosk.py` (caminho default)
- ✅ `eslint.config.js` (ignores)

**Você só precisa:**
1. Copiar/mover `models-stt/` para `services/stt/`
2. Copiar/mover `server-vosk.py` para `services/stt/`
3. Deletar pasta `stt/` antiga (se vazia)
4. Testar com `npm start`

---

**Data:** 27 de Janeiro de 2026  
**Status:** ✅ Caminhos atualizados, aguardando sua movimentação de arquivos

