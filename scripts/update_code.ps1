# ============================================================================
# FEDDA Code Update - Fast, minimal, pulls latest code from GitHub
# Used by auto-update in run.bat - focused on speed
# For full maintenance (custom nodes, deps), see update_logic.ps1
# ============================================================================

param([switch]$SilentMode)

$ErrorActionPreference = "Stop"
$ScriptPath = $PSScriptRoot
$RootPath = Split-Path -Parent $ScriptPath
Set-Location $RootPath

# Start unified log — captures git pull + all node/dep steps in one file
$LogDir = Join-Path $RootPath "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir "update.log"
$FeddaTranscriptOwner = $true  # tells update_logic.ps1 not to start its own transcript
try { Start-Transcript -Path $LogFile -Append -Force | Out-Null } catch {}
Write-Host "=== FEDDA Update started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" -ForegroundColor DarkGray
Write-Host "Log file: $LogFile" -ForegroundColor DarkGray

if (-not $SilentMode) {
    Write-Host "`n===================================================" -ForegroundColor Cyan
    Write-Host "  FEDDA CODE UPDATE" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Cyan
}

# ============================================================================
# GIT SETUP
# ============================================================================
$GitEmbedded = Join-Path $RootPath "git_embeded\cmd\git.exe"
if (Test-Path $GitEmbedded) {
    $GitExe = $GitEmbedded
    $env:PATH = "$(Split-Path $GitExe);$env:PATH"
} else {
    $GitExe = "git"
}

# Fix dubious ownership errors (local config only - never modify user's global gitconfig)
$env:GIT_CONFIG_GLOBAL = Join-Path $RootPath ".gitconfig"
& $GitExe config --file "$env:GIT_CONFIG_GLOBAL" --add safe.directory '*' 2>$null

# ============================================================================
# 1. CHECK IF GIT REPO EXISTS
# ============================================================================
if (-not (Test-Path (Join-Path $RootPath ".git"))) {
    if (-not $SilentMode) {
        Write-Host "`n  Initializing git from GitHub..." -ForegroundColor Yellow
    }
    & $GitExe init
    & $GitExe remote add origin https://github.com/Feddakalkun/Fedda_hub-v2.0.git
}

# ============================================================================
# 2. PULL LATEST CODE
# ============================================================================
if (-not $SilentMode) {
    Write-Host "`n  Pulling latest code from GitHub..." -ForegroundColor Yellow
    # Stash local changes to protect uncommitted work (including new files like workflows)
    $hasChanges = & $GitExe status --porcelain 2>$null
    if ($hasChanges) {
        if (-not $SilentMode) { Write-Host "  Stashing local changes to protect them..." -ForegroundColor Yellow }
        $ErrorActionPreference = "Continue"
        & $GitExe stash push -u -m "auto-stash-before-update-$(Get-Date -Format yyyyMMddHHmmss)" 2>&1 | Out-Null
        $ErrorActionPreference = "Stop"
    }
}

try {
    $ErrorActionPreference = "Continue"
    & $GitExe fetch origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "git fetch failed"
    }
    & $GitExe reset --hard origin/main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "git reset failed"
    }
    & $GitExe clean -fd 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    
    if (-not $SilentMode) {
        Write-Host "  [OK] Code updated successfully." -ForegroundColor Green
        if ($hasChanges) { if (-not $SilentMode) { Write-Host "  (Your local changes were stashed - use git stash pop to restore)" -ForegroundColor Yellow } }
    }
} catch {
    if (-not $SilentMode) {
        Write-Host "  [WARN] Git update failed: $_" -ForegroundColor Yellow
    }
    exit 1
}

# ============================================================================
# 3. RUN FULL MAINTENANCE (nodes, deps, frontend)
# ============================================================================
$UpdateLogic = Join-Path $ScriptPath "update_logic.ps1"
if (-not (Test-Path $UpdateLogic)) {
    # Fallback: PSScriptRoot can be empty in some invocation paths; derive from RootPath
    $UpdateLogic = Join-Path $RootPath "scripts\update_logic.ps1"
}
if (Test-Path $UpdateLogic) {
    if (-not $SilentMode) {
        Write-Host "`n  Running full maintenance (nodes, deps, frontend)..." -ForegroundColor Yellow
    }
    # Dot-source so transcript captures all output in the same session
    if ($SilentMode) {
        . "$UpdateLogic" -SilentMode
    } else {
        . "$UpdateLogic"
    }
} else {
    Write-Host "`n  [WARN] update_logic.ps1 not found (checked: $UpdateLogic)" -ForegroundColor Yellow
}

# ============================================================================
# DONE
# ============================================================================
Write-Host "=== FEDDA Update finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" -ForegroundColor DarkGray
try { Stop-Transcript | Out-Null } catch {}

if (-not $SilentMode) {
    Write-Host "`n===================================================" -ForegroundColor Green
    Write-Host "  UPDATE COMPLETE" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
}

exit 0
