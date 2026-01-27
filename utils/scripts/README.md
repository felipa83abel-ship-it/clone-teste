# 📁 Scripts de Manutenção

Scripts utilitários para desenvolvimento e troubleshooting.

## 🧹 `clean-storage.bat` (Windows)

Limpa o armazenamento local corrompido do Electron.

```bash
cd scripts/
clean-storage.bat
```

**Resultado**: Reseta configurações para valores padrão (incluso `clickThroughEnabled: false`)

## 🧹 `clean-storage.sh` (Linux/macOS)

Mesma funcionalidade que `clean-storage.bat`, para sistemas Unix-like.

```bash
cd scripts/
chmod +x clean-storage.sh
./clean-storage.sh
```

**Resultado**: Reseta configurações para valores padrão

## 🎯 Quando Usar

Use estes scripts quando:

- ✅ Configurações corrompidas no localStorage
- ✅ Comportamentos estranhos após mudanças de config
- ✅ Resetar para estado inicial de desenvolvimento
- ✅ Limpar dados de teste

## ⚠️ Aviso

Estes scripts **removem** a configuração salva. Use com cuidado em produção!
