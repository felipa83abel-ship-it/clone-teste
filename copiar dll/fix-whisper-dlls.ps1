# Script para copiar TODAS as DLLs necessárias
# Execute como ADMINISTRADOR no PowerShell

$whisperLocal = "D:\Dev\Projeto Electron\git-felipa-perssua\clone-teste\whisper-local"
$msysBin = "C:\msys64\mingw64\bin"

Write-Host "=== REPARANDO DLLs DO WHISPER ===" -ForegroundColor Cyan

# Lista COMPLETA de DLLs possivelmente necessárias
$allPossibleDlls = @(
    # ESSENCIAIS
    "libgcc_s_seh-1.dll",
    "libstdc++-6.dll", 
    "libwinpthread-1.dll",
    
    # OPENMP (MUITO IMPORTANTE!)
    "libgomp-1.dll",
    
    # OUTRAS COMUNS
    "libatomic-1.dll",
    "libquadmath-0.dll",
    "zlib1.dll",
    "libbz2-1.dll",
    "liblzma-5.dll",
    "libzstd.dll",
    
    # BLAS/LAPACK (para aceleração)
    "libopenblas.dll",
    "libblas.dll",
    "liblapack.dll"
)

Write-Host "Procurando DLLs em: $msysBin" -ForegroundColor Yellow

$copied = 0
foreach ($dll in $allPossibleDlls) {
    $source = "$msysBin\$dll"
    $dest = "$whisperLocal\$dll"
    
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "✅ $dll" -ForegroundColor Green
        $copied++
    } else {
        Write-Host "❌ $dll (não encontrada)" -ForegroundColor DarkGray
    }
}

Write-Host "`nCopiadas $copied DLLs" -ForegroundColor Cyan

# Testar se agora funciona
Write-Host "`n=== TESTANDO EXECUTÁVEL ===" -ForegroundColor Cyan

if (Test-Path "$whisperLocal\main.exe") {
    try {
        # Teste simples
        & "$whisperLocal\main.exe" --help 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "🎉 SUCESSO! Whisper agora funciona!" -ForegroundColor Green
            
            # Mostrar ajuda
            & "$whisperLocal\main.exe" --help | Select-Object -First 10
            
        } else {
            Write-Host "⚠️  Ainda com problemas (código: $LASTEXITCODE)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ ERRO: $_" -ForegroundColor Red
    }
}

# Verificar arquivos na pasta
Write-Host "`n=== CONTEÚDO DA PASTA ===" -ForegroundColor Cyan
Get-ChildItem $whisperLocal | Format-Table Name, @{Label="Size(MB)";Expression={[math]::Round($_.Length/1MB,2)}}, LastWriteTime

Write-Host "`nPronto! Tente novamente." -ForegroundColor Green