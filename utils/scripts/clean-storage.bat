@echo off
REM Script para limpar dados de configuração corrompidos no Windows

echo.
echo 🧹 Limpando localStorage do Electron...
echo.

REM Caminho padrão de userData do Electron no Windows
set APPDATA_PATH=%APPDATA%\askme-app
set CONFIG_FILE=%APPDATA_PATH%\config.json
set STORAGE_PATH=%APPDATA_PATH%\Storage

if exist "%CONFIG_FILE%" (
    echo 📁 Encontrado: %CONFIG_FILE%
    del /f /q "%CONFIG_FILE%"
    echo ✅ Arquivo de configuração removido
) else (
    echo ℹ️  Arquivo não encontrado em: %CONFIG_FILE%
)

if exist "%STORAGE_PATH%" (
    echo 🗑️  Limpando Storage...
    rmdir /s /q "%STORAGE_PATH%"
    echo ✅ Storage temp removido
)

echo.
echo 🎯 Limpeza concluída!
echo 📝 Próximo startup usará valores padrão (clickThroughEnabled: false)
echo.
pause
