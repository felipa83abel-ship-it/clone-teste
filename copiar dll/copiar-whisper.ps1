$whisperPath = "D:\Dev\Tools\whisper\whisper.cpp"
$electronPath = "D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste"
$msysPath = "C:\msys64\mingw64\bin"  # ← AQUI ESTÃO AS DLLS!

# Criar pasta destino
if (-Not (Test-Path "$electronPath\whisper-local")) {
  New-Item -ItemType Directory -Force -Path "$electronPath\whisper-local"
}

# Copiar executável do Whisper (pode ser main.exe ou whisper-cli.exe)
# Verifique qual arquivo foi gerado:
if (Test-Path "$whisperPath\build\main.exe") {
    Copy-Item "$whisperPath\build\main.exe" "$electronPath\whisper-local\" -Force
    Write-Host "Copiado main.exe" -ForegroundColor Yellow
} 
elseif (Test-Path "$whisperPath\build\bin\whisper-cli.exe") {
    Copy-Item "$whisperPath\build\bin\whisper-cli.exe" "$electronPath\whisper-local\" -Force
    Write-Host "Copiado whisper-cli.exe" -ForegroundColor Yellow
}
else {
    Write-Host "ERRO: Não encontrei o executável do Whisper!" -ForegroundColor Red
    Write-Host "Procure em: $whisperPath\build\" -ForegroundColor Red
    exit 1
}

# Copiar DLLs OBRIGATÓRIAS do MSYS2
$dlls = @(
    "libgcc_s_seh-1.dll",
    "libstdc++-6.dll", 
    "libwinpthread-1.dll"
)

foreach ($dll in $dlls) {
    if (Test-Path "$msysPath\$dll") {
        Copy-Item "$msysPath\$dll" "$electronPath\whisper-local\" -Force
        Write-Host "Copiado $dll" -ForegroundColor Green
    } else {
        Write-Host "AVISO: $dll não encontrada em $msysPath" -ForegroundColor Yellow
    }
}

# Copiar modelo
Copy-Item "$whisperPath\models\ggml-tiny.bin" "$electronPath\whisper-local\" -Force

# Verificar se tudo foi copiado
Write-Host "`n=== VERIFICAÇÃO ===" -ForegroundColor Cyan
Get-ChildItem "$electronPath\whisper-local\" | ForEach-Object {
    Write-Host "$($_.Name) ($($_.Length/1KB) KB)" -ForegroundColor White
}

Write-Host "`nArquivos copiados com sucesso!" -ForegroundColor Green