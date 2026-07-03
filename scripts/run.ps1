param([string]$RootPath = "")

# Resolve root: called from run.bat which sets -RootPath, or run directly from scripts/
if (-not $RootPath) { $RootPath = Split-Path $PSScriptRoot -Parent }

$Python    = Join-Path $RootPath "python_embeded\python.exe"
$ComfyMain = Join-Path $RootPath "ComfyUI\main.py"
$BackendPy = Join-Path $RootPath "backend\server.py"
$FrontDir  = Join-Path $RootPath "frontend"

$Host.UI.RawUI.WindowTitle = "FEDDA Hub v2.0"

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "    FEDDA Hub v2.0" -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $Python)) {
    Write-Host "  [ERROR] python_embeded not found. Run the installer first." -ForegroundColor Red
    Write-Host ""; Read-Host "Press Enter to exit"; exit 1
}
if (-not (Test-Path $ComfyMain)) {
    Write-Host "  [ERROR] ComfyUI not found. Run the installer first." -ForegroundColor Red
    Write-Host ""; Read-Host "Press Enter to exit"; exit 1
}
if (-not (Test-Path "$FrontDir\node_modules")) {
    Write-Host "  [ERROR] Frontend dependencies missing. Run the installer first." -ForegroundColor Red
    Write-Host ""; Read-Host "Press Enter to exit"; exit 1
}

function Wait-Port {
    param([int]$Port, [string]$Name, [System.Diagnostics.Process]$Proc, [int]$TimeoutSec = 120)
    Write-Host "  Waiting for $Name" -NoNewline -ForegroundColor Yellow
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if ($null -ne $Proc -and $Proc.HasExited) {
            Write-Host " CRASHED (exit $($Proc.ExitCode))" -ForegroundColor Red
            return $false
        }
        try {
            $t = [System.Net.Sockets.TcpClient]::new()
            $t.Connect('127.0.0.1', $Port)
            $t.Close()
            Write-Host " ready!" -ForegroundColor Green
            return $true
        } catch {
            Write-Host "." -NoNewline
            Start-Sleep -Seconds 2
        }
    }
    Write-Host " TIMEOUT" -ForegroundColor Red
    return $false
}

$ComfyProc   = $null
$BackendProc = $null

try {
    Write-Host "  [1/3] Starting ComfyUI on port 8199..." -ForegroundColor White
    $ComfyProc = Start-Process -FilePath $Python `
        -ArgumentList "-s", $ComfyMain, "--windows-standalone-build", "--port", "8199" `
        -PassThru -WindowStyle Minimized

    Write-Host "  [2/3] Starting backend on port 8000..." -ForegroundColor White
    $BackendProc = Start-Process -FilePath $Python `
        -ArgumentList $BackendPy `
        -WorkingDirectory (Split-Path $BackendPy -Parent) `
        -PassThru -WindowStyle Minimized

    $comfyOk   = Wait-Port -Port 8199 -Name "ComfyUI (this can take ~30s)" -Proc $ComfyProc -TimeoutSec 120
    $backendOk = Wait-Port -Port 8000 -Name "backend" -Proc $BackendProc -TimeoutSec 30

    if (-not $comfyOk) {
        Write-Host "  [WARN] ComfyUI did not respond - the UI may show errors until it's ready." -ForegroundColor Yellow
    }
    if (-not $backendOk) {
        Write-Host "  [WARN] Backend did not respond - some features may be unavailable." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "  [3/3] Opening browser..." -ForegroundColor White
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop everything." -ForegroundColor DarkGray
    Write-Host ""

    Set-Location $FrontDir
    & npm run dev

} finally {
    Write-Host ""
    Write-Host "  Shutting down..." -ForegroundColor Yellow
    if ($null -ne $ComfyProc -and -not $ComfyProc.HasExited) {
        taskkill /F /T /PID $ComfyProc.Id 2>$null | Out-Null
        Write-Host "  ComfyUI stopped." -ForegroundColor DarkGray
    }
    if ($null -ne $BackendProc -and -not $BackendProc.HasExited) {
        taskkill /F /T /PID $BackendProc.Id 2>$null | Out-Null
        Write-Host "  Backend stopped." -ForegroundColor DarkGray
    }
    Write-Host "  Done." -ForegroundColor Green
    Write-Host ""
}
