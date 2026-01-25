#!/bin/bash
# Script para testar a app com DevTools aberto
echo "🚀 Iniciando app com DevTools..."
cd "$(dirname "$0")"
timeout 30 npm start 2>&1 &
PID=$!
sleep 5
echo "✅ App iniciada com PID $PID"
echo "📌 Abra DevTools com Ctrl+Shift+I para ver os logs"
echo "💡 Procure por logs com '>>>' para debug"
wait $PID
