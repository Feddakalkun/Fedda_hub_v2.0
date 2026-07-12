param([string]$RootPath = "")

# Resolve root: called from run.bat which sets -RootPath, or run directly from scripts/
if (-not $RootPath) { $RootPath = Split-Path $PSScriptRoot -Parent }

$Python    = Join-Path $RootPath "python_embeded\python.exe"
$ComfyMain = Join-Path $RootPath "ComfyUI\main.py"
$BackendPy = Join-Path $RootPath "backend\server.py"
$FrontDir  = Join-Path $RootPath "frontend"
$LogDir    = Join-Path $RootPath "logs"

$Host.UI.RawUI.WindowTitle = "FEDDA Hub v2.0"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "    FEDDA Hub v2.0  -  single-window launcher" -ForegroundColor Cyan
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
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

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

# Each service runs hidden; stdout+stderr go to log files that we tail back
# into THIS window as prefixed lines. Logs also persist for debugging.
$Services = @(
    @{ Tag = "COMFY"; Color = "Magenta"; Out = Join-Path $LogDir "comfyui_live.log";  Err = Join-Path $LogDir "comfyui_live.err.log" },
    @{ Tag = "BACK";  Color = "Green";   Out = Join-Path $LogDir "backend_live.log";  Err = Join-Path $LogDir "backend_live.err.log" },
    @{ Tag = "VITE";  Color = "Cyan";    Out = Join-Path $LogDir "frontend_live.log"; Err = Join-Path $LogDir "frontend_live.err.log" }
)
foreach ($s in $Services) {
    Remove-Item $s.Out, $s.Err -ErrorAction SilentlyContinue
    New-Item -ItemType File -Path $s.Out -Force | Out-Null
    New-Item -ItemType File -Path $s.Err -Force | Out-Null
}

$ComfyProc   = $null
$BackendProc = $null
$ViteProc    = $null
$TailJobs    = @()

# Kill stale FEDDA services from a previous session (e.g. launcher window was
# closed with X, which couldn't tear down its children). Only touches
# processes that belong to THIS install tree.
foreach ($StalePort in 8199, 8000) {
    $Conns = Get-NetTCPConnection -LocalPort $StalePort -State Listen -ErrorAction SilentlyContinue
    foreach ($Conn in $Conns) {
        $Proc = Get-Process -Id $Conn.OwningProcess -ErrorAction SilentlyContinue
        if ($Proc -and $Proc.Path -like "$RootPath*") {
            Write-Host "  Cleaning up stale $($Proc.ProcessName) (PID $($Proc.Id)) on port $StalePort from a previous session..." -ForegroundColor Yellow
            taskkill /F /T /PID $Proc.Id 2>$null | Out-Null
        } elseif ($Proc) {
            Write-Host "  [WARN] Port $StalePort is held by $($Proc.ProcessName) (PID $($Proc.Id)) - not a FEDDA process, leaving it. Startup may fail." -ForegroundColor Yellow
        }
    }
}

try {
    # -NoNewWindow keeps services attached to THIS console, so closing the
    # window (X) takes them down with it instead of orphaning hidden children.
    Write-Host "  [1/3] Starting ComfyUI on port 8199..." -ForegroundColor White
    # Windows shares the GPU with the desktop (Explorer/Discord/browser/etc.), whose
    # VRAM use fluctuates. Reserve a safety margin so model loads offload instead of
    # OOM-crashing, and use expandable_segments to avoid fragmentation OOMs on the 3090.
    $env:PYTORCH_CUDA_ALLOC_CONF = "expandable_segments:True"
    $ComfyProc = Start-Process -FilePath $Python `
        -ArgumentList "-s", $ComfyMain, "--windows-standalone-build", "--port", "8199", "--reserve-vram", "2" `
        -PassThru -NoNewWindow `
        -RedirectStandardOutput $Services[0].Out -RedirectStandardError $Services[0].Err

    Write-Host "  [2/3] Starting backend on port 8000..." -ForegroundColor White
    $BackendProc = Start-Process -FilePath $Python `
        -ArgumentList $BackendPy `
        -WorkingDirectory (Split-Path $BackendPy -Parent) `
        -PassThru -NoNewWindow `
        -RedirectStandardOutput $Services[1].Out -RedirectStandardError $Services[1].Err

    $comfyOk   = Wait-Port -Port 8199 -Name "ComfyUI (this can take ~30s)" -Proc $ComfyProc -TimeoutSec 120
    $backendOk = Wait-Port -Port 8000 -Name "backend" -Proc $BackendProc -TimeoutSec 30

    if (-not $comfyOk) {
        Write-Host "  [WARN] ComfyUI did not respond - the UI may show errors until it's ready." -ForegroundColor Yellow
    }
    if (-not $backendOk) {
        Write-Host "  [WARN] Backend did not respond - some features may be unavailable." -ForegroundColor Yellow
    }

    Write-Host "  [3/3] Starting frontend (vite)..." -ForegroundColor White
    $NpmCmd = "cd /d `"$FrontDir`" && npm run dev"
    $ViteProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", $NpmCmd `
        -PassThru -NoNewWindow `
        -RedirectStandardOutput $Services[2].Out -RedirectStandardError $Services[2].Err

    # Tail all service logs back into this window
    foreach ($s in $Services) {
        foreach ($f in @($s.Out, $s.Err)) {
            $TailJobs += Start-Job -Name $s.Tag -ArgumentList $f -ScriptBlock {
                param($Path)
                Get-Content -LiteralPath $Path -Wait -Tail 0 -ErrorAction SilentlyContinue
            }
        }
    }

    Write-Host ""
    Write-Host "  All services live in this window:" -ForegroundColor White
    Write-Host "    [COMFY] ComfyUI :8199   [BACK] backend :8000   [VITE] frontend :5173" -ForegroundColor DarkGray
    Write-Host "  Full logs in logs\*_live.log - press Ctrl+C to stop everything." -ForegroundColor DarkGray
    Write-Host ""

    # Pump service output until the frontend exits or Ctrl+C
    $ColorMap = @{}; foreach ($s in $Services) { $ColorMap[$s.Tag] = $s.Color }
    while ($true) {
        $gotOutput = $false
        foreach ($j in $TailJobs) {
            $lines = Receive-Job -Job $j -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if ($null -ne $line -and "$line" -ne "") {
                    Write-Host "[$($j.Name)] " -NoNewline -ForegroundColor $ColorMap[$j.Name]
                    Write-Host "$line"
                    $gotOutput = $true
                }
            }
        }
        if ($ViteProc.HasExited) {
            Write-Host "  Frontend exited (code $($ViteProc.ExitCode)) - shutting down." -ForegroundColor Yellow
            break
        }
        if ($ComfyProc.HasExited -and $BackendProc.HasExited) {
            Write-Host "  All services exited - shutting down." -ForegroundColor Yellow
            break
        }
        if (-not $gotOutput) { Start-Sleep -Milliseconds 250 }
    }

} finally {
    Write-Host ""
    Write-Host "  Shutting down..." -ForegroundColor Yellow
    foreach ($p in @($ViteProc, $ComfyProc, $BackendProc)) {
        if ($null -ne $p -and -not $p.HasExited) {
            taskkill /F /T /PID $p.Id 2>$null | Out-Null
        }
    }
    foreach ($j in $TailJobs) {
        Stop-Job -Job $j -ErrorAction SilentlyContinue
        Remove-Job -Job $j -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Done." -ForegroundColor Green
    Write-Host ""
}
