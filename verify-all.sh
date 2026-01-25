#!/bin/bash

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                   🔍 VERIFICAÇÃO COMPLETA DO PROJETO                    ║
# ║                                                                          ║
# ║  Este script valida TUDO: type checking, lint, format, testes, audit    ║
# ║  e gera um relatório detalhado em temp/quality-report.txt               ║
# ║                                                                          ║
# ╚══════════════════════════════════════════════════════════════════════════╝

mkdir -p temp
REPORT_FILE="temp/quality-report.txt"

# Limpar arquivo anterior
> "$REPORT_FILE"

echo "📋 INICIANDO VERIFICAÇÃO COMPLETA DO PROJETO..."
echo ""

# 1️⃣  TYPE CHECKING
echo "1️⃣  TYPE CHECKING..."
echo "═══════════════════════════════════════════════════════════════" >> "$REPORT_FILE"
echo "1️⃣  TYPE CHECKING" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
npm run check-types >> "$REPORT_FILE" 2>&1 && echo "✅ Type checking OK" || echo "❌ Type checking FALHOU"
echo "" >> "$REPORT_FILE"

# 2️⃣  ESLINT
echo "2️⃣  ESLINT..."
echo "═══════════════════════════════════════════════════════════════" >> "$REPORT_FILE"
echo "2️⃣  ESLINT" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
npx eslint . >> "$REPORT_FILE" 2>&1 && echo "✅ ESLint OK" || echo "⚠️  ESLint detectou warnings"
echo "" >> "$REPORT_FILE"

# 3️⃣  PRETTIER
echo "3️⃣  PRETTIER..."
echo "═══════════════════════════════════════════════════════════════" >> "$REPORT_FILE"
echo "3️⃣  PRETTIER" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
npx prettier --check . --ignore-unknown >> "$REPORT_FILE" 2>&1 && echo "✅ Prettier OK" || echo "⚠️  Prettier: Arquivos encontrados"
echo "" >> "$REPORT_FILE"

# 4️⃣  JEST
echo "4️⃣  JEST..."
echo "═══════════════════════════════════════════════════════════════" >> "$REPORT_FILE"
echo "4️⃣  JEST (TESTES UNITÁRIOS)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
npm test >> "$REPORT_FILE" 2>&1 && echo "✅ Jest OK" || echo "❌ Jest FALHOU"
echo "" >> "$REPORT_FILE"

# 5️⃣  NPM AUDIT
echo "5️⃣  NPM AUDIT..."
echo "═══════════════════════════════════════════════════════════════" >> "$REPORT_FILE"
echo "5️⃣  NPM AUDIT" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
npm audit >> "$REPORT_FILE" 2>&1 && echo "✅ npm audit OK" || echo "⚠️  npm audit detectou vulnerabilidades"
echo "" >> "$REPORT_FILE"

# 6️⃣  DEPCHECK
echo "6️⃣  DEPCHECK..."
echo "═══════════════════════════════════════════════════════════════" >> "$REPORT_FILE"
echo "6️⃣  DEPCHECK" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
npx depcheck --ignores cross-env,eslint-config-prettier,playwright,node-webrtcvad >> "$REPORT_FILE" 2>&1 && echo "✅ Depcheck OK" || echo "⚠️  Depcheck: Issues encontrados"
echo "" >> "$REPORT_FILE"

# 7️⃣  INTEGRIDADE
echo "7️⃣  INTEGRIDADE DE DEPENDÊNCIAS..."
echo "═══════════════════════════════════════════════════════════════" >> "$REPORT_FILE"
echo "7️⃣  INTEGRIDADE DE DEPENDÊNCIAS" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
npm ls >> "$REPORT_FILE" 2>&1 && echo "✅ npm ls OK" || echo "⚠️  npm ls detectou issues"
echo "" >> "$REPORT_FILE"

# RESUMO
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  ✅ VERIFICAÇÃO COMPLETA!                      ║"
echo "║                                                                ║"
echo "║  Relatório salvo em: temp/quality-report.txt                  ║"
echo "║                                                                ║"
echo "║  Para revisar: cat temp/quality-report.txt                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
