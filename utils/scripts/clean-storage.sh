#!/bin/bash

# Script para limpar dados corrompidos de localStorage
# Remove o arquivo de configuração para resetar para valores padrão

echo "🧹 Limpando localStorage corrompido..."

# Encontrar a pasta de userData do Electron
# Diferentes localizações por OS

if [[ "$OSTYPE" == "win32" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
  # Windows
  APPDATA="$APPDATA"
  STORAGE_PATH="$APPDATA/askme-app"
  CONFIG_FILE="$STORAGE_PATH/config.json"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  STORAGE_PATH="$HOME/Library/Application Support/askme-app"
  CONFIG_FILE="$STORAGE_PATH/config.json"
else
  # Linux
  STORAGE_PATH="$HOME/.config/askme-app"
  CONFIG_FILE="$STORAGE_PATH/config.json"
fi

if [ -f "$CONFIG_FILE" ]; then
  echo "📁 Encontrado: $CONFIG_FILE"
  rm -f "$CONFIG_FILE"
  echo "✅ Arquivo de configuração removido"
  echo "   Próximo startup usará valores padrão (clickThroughEnabled: false)"
else
  echo "ℹ️  Arquivo não encontrado em: $CONFIG_FILE"
fi

# Também limpar localStorage do navegador no temp
TEMP_STORAGE="$STORAGE_PATH/Storage"
if [ -d "$TEMP_STORAGE" ]; then
  echo "🗑️  Limpando Storage..."
  rm -rf "$TEMP_STORAGE"
  echo "✅ Storage temp removido"
fi

echo ""
echo "🎯 Limpeza concluída! Execute 'npm start' para reiniciar com valores padrão."
